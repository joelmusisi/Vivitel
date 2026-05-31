import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import { useNavigate } from "react-router-dom";
import StreetViewMini from "../components/StreetViewMini";
import { getAssetsFromApi, getTelemetryHistory, saveToApi } from "../utils/api";
import { computeAssetDotStatus } from "../utils/assetStatus";
import "../index.css";

type AssetRow = {
  id: string;
  assetDescription: string;
  registration: string;
  fleetNumber: string;
  site: string;
  driver: string;
  lastActive: string;
  lastPosition: string;
  location: string;
  assetId: string;
  gps: string;
  heading: string;
  ignition: string;
  lastNotificationValue: string;
  mobileDeviceType: string;
  speed: string;
  timeInIgnition: string;
  driverIdentified: string;
  fuelReading: string;
  status: "online" | "warning" | "offline";
  movement?: "moving" | "stationary" | "unknown";
  imei?: string;
  fuelLitres?: number;
  lat?: number;
  lng?: number;
  telemetryAt?: string;
  raw?: Record<string, unknown>;
};

type FuelPoint = {
  at: string;
  raw: number;
  value: number;
};

type FuelGraphState = {
  asset: AssetRow;
  status: "loading" | "ready" | "error";
  points: FuelPoint[];
  rawCount: number;
  error?: string;
};

type LocationRow = {
  id: string;
  name: string;
  site: string;
  locationType: string;
};

type EventRow = {
  id: string;
  name: string;
  eventType: string;
};

type DrawPoint = {
  x: number;
  y: number;
};

type GeoShape =
  | { id: string; type: "circle"; cx: number; cy: number; r: number }
  | { id: string; type: "rect"; x: number; y: number; w: number; h: number }
  | { id: string; type: "polygon"; points: DrawPoint[] }
  | { id: string; type: "polyline"; points: DrawPoint[] };

type DragPoint = {
  shapeId: string;
  index: number;
  isDraft: boolean;
} | null;

type ColumnKey =
  | "assetDescription"
  | "assetIcon"
  | "assetId"
  | "driver"
  | "driverIdentified"
  | "fuelReading"
  | "fleetNumber"
  | "gps"
  | "heading"
  | "ignition"
  | "lastNotification"
  | "lastNotificationValue"
  | "lastPosition"
  | "location"
  | "mobileDeviceType"
  | "registration"
  | "site"
  | "speed"
  | "timeInIgnition";

const columns: { key: ColumnKey; label: string; render: (a: AssetRow) => string | JSX.Element }[] = [
  { key: "assetDescription", label: "Asset description", render: (a) => a.assetDescription },
  { key: "assetIcon", label: "Asset icon", render: () => "🚚" },
  { key: "assetId", label: "Asset ID", render: (a) => a.assetId },
  { key: "driver", label: "Driver", render: (a) => a.driver },
  { key: "driverIdentified", label: "Driver identified", render: (a) => a.driverIdentified },
  { key: "fuelReading", label: "Fuel (L)", render: (a) => a.fuelReading },
  { key: "fleetNumber", label: "Fleet number", render: (a) => a.fleetNumber },
  { key: "gps", label: "GPS coordinates", render: (a) => a.gps },
  { key: "heading", label: "Heading", render: (a) => a.heading },
  { key: "ignition", label: "Ignition status", render: (a) => a.ignition },
  { key: "lastNotification", label: "Last active Notification", render: (a) => a.lastActive },
  { key: "lastNotificationValue", label: "Last active Notification value", render: (a) => a.lastNotificationValue },
  { key: "lastPosition", label: "Last position", render: (a) => a.lastPosition },
  { key: "location", label: "Location", render: (a) => a.location },
  { key: "mobileDeviceType", label: "Mobile device type", render: (a) => a.mobileDeviceType },
  { key: "registration", label: "Registration", render: (a) => a.registration },
  { key: "site", label: "Site", render: (a) => a.site },
  { key: "speed", label: "Speed (km/h)", render: (a) => a.speed },
  { key: "timeInIgnition", label: "Time in ignition", render: (a) => a.timeInIgnition }
];

const liveMapCenter: [number, number] = [0.55, 32.45];

const headingToDegrees = (heading: string) => {
  const numeric = parseTelemetryNumber(heading);
  if (numeric !== null) return ((numeric % 360) + 360) % 360;
  const dir = heading.trim().toUpperCase();
  const lookup: Record<string, number> = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5
  };
  return lookup[dir] ?? 0;
};

const parseSpeedValue = (speed: string) => {
  return parseTelemetryNumber(speed) ?? 0;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const firstKnown = (...values: unknown[]) =>
  values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");

const parseTelemetryNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw || raw === "—") return null;
  const num = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
};

const normalizeFuelKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, "");

const isFuelLevelKey = (key: string) => {
  const normalized = normalizeFuelKey(key);
  if (!normalized.includes("fuel")) return false;
  if (/(percent|percentage|rate|consumption|used|economy|efficiency|trip|target)/.test(normalized)) return false;
  return (
    normalized === "fuel" ||
    normalized.includes("fuellevel") ||
    normalized.includes("fuellitre") ||
    normalized.includes("fuelliter") ||
    normalized.includes("fuelvolume") ||
    normalized.includes("fuelreading") ||
    normalized.includes("tankfuel") ||
    normalized.includes("fmfuel")
  );
};

const coerceFuelLitres = (value: unknown): number | null => {
  const parsed = parseTelemetryNumber(value);
  if (parsed === null) return null;
  // Fuel tank readings should never be negative and anything above 5000L is almost certainly not a live tank value.
  if (parsed < 0 || parsed > 5000) return null;
  return parsed;
};

const findFuelLitres = (source: unknown, depth = 0): number | null => {
  if (depth > 4) return null;
  const direct = coerceFuelLitres(source);
  if (direct !== null && depth > 0) return direct;
  const record = asRecord(source);
  if (!record) return null;

  const directKeys = [
    "fuelLitres",
    "fuelLiters",
    "fuelLevelLitres",
    "fuelLevelLiters",
    "fuelLevelL",
    "fuelVolumeLitres",
    "fuelVolume",
    "fuelReading",
    "fuelLevel",
    "tankFuel",
    "fuel"
  ];
  for (const key of directKeys) {
    const value = coerceFuelLitres(record[key]);
    if (value !== null) return value;
  }

  const nested = [record.telemetryLatest, record.io, asRecord(record.telemetryLatest)?.io, record.data, record.attributes];
  for (const item of nested) {
    const value = findFuelLitres(item, depth + 1);
    if (value !== null) return value;
  }

  for (const [key, value] of Object.entries(record)) {
    if (!isFuelLevelKey(key)) continue;
    const fuel = coerceFuelLitres(value);
    if (fuel !== null) return fuel;
  }

  return null;
};

const formatFuelLitres = (fuel: number | null | undefined) => {
  if (typeof fuel !== "number" || !Number.isFinite(fuel)) return "None";
  const digits = fuel >= 100 ? 0 : 1;
  return `${fuel.toFixed(digits)} L`;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const buildStableFuelSeries = (points: Array<{ at: string; value: number }>): FuelPoint[] => {
  const sorted = points
    .map((point) => ({ at: point.at, value: coerceFuelLitres(point.value) }))
    .filter((point): point is { at: string; value: number } => Boolean(point.at) && point.value !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const buckets = new Map<number, Array<{ at: string; value: number }>>();
  for (const point of sorted) {
    const ms = Date.parse(point.at);
    if (!Number.isFinite(ms)) continue;
    const bucket = Math.floor(ms / (2 * 60 * 1000)) * 2 * 60 * 1000;
    const current = buckets.get(bucket) ?? [];
    current.push(point);
    buckets.set(bucket, current);
  }

  const bucketed = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucket, items]) => ({
      at: new Date(bucket).toISOString(),
      raw: median(items.map((item) => item.value)),
      value: median(items.map((item) => item.value))
    }));

  const filtered = bucketed.filter((point, index) => {
    const previous = bucketed[index - 1];
    const next = bucketed[index + 1];
    if (!previous || !next) return true;
    const jump = Math.abs(point.value - previous.value);
    const backToPrevious = Math.abs(next.value - previous.value);
    const awayFromNext = Math.abs(point.value - next.value);
    const threshold = Math.max(35, Math.abs(previous.value) * 0.18);
    return !(jump > threshold && awayFromNext > threshold && backToPrevious <= threshold);
  });

  return filtered.map((point, index) => {
    const windowValues = filtered
      .slice(Math.max(0, index - 1), Math.min(filtered.length, index + 2))
      .map((item) => item.value);
    return { ...point, value: median(windowValues) };
  });
};

const fuelPointsFromAsset = (asset: AssetRow): FuelPoint[] => {
  const raw = asset.raw ?? {};
  const histories = [raw.fuelHistory, raw.telemetryHistory, raw.history].filter(Array.isArray) as unknown[][];
  const points = histories
    .flat()
    .map((item) => {
      if (Array.isArray(item)) {
        const at = String(item[0] ?? item[1] ?? "").trim();
        const fuel = coerceFuelLitres(item[1] ?? item[0]);
        return at && fuel !== null ? { at, value: fuel } : null;
      }
      const record = asRecord(item);
      const at = String(record?.at ?? record?.createdAt ?? record?.timestamp ?? "").trim();
      const fuel =
        findFuelLitres(record) ??
        coerceFuelLitres(record?.value) ??
        coerceFuelLitres(record?.reading) ??
        coerceFuelLitres(record?.litres) ??
        coerceFuelLitres(record?.liters) ??
        coerceFuelLitres(record?.level);
      return at && fuel !== null ? { at, value: fuel } : null;
    })
    .filter((point): point is { at: string; value: number } => Boolean(point));
  if (points.length) return buildStableFuelSeries(points);
  return typeof asset.fuelLitres === "number" && asset.telemetryAt
    ? buildStableFuelSeries([{ at: asset.telemetryAt, value: asset.fuelLitres }])
    : [];
};

const fuelPointsFromHistory = (events: unknown[]): FuelPoint[] => {
  const points = events
    .map((event) => {
      const record = asRecord(event);
      const at = String(record?.createdAt ?? record?.created_at ?? asRecord(record?.data)?.createdAt ?? "").trim();
      const fuel = findFuelLitres(record);
      return at && fuel !== null ? { at, value: fuel } : null;
    })
    .filter((point): point is { at: string; value: number } => Boolean(point));
  return buildStableFuelSeries(points);
};

const buildFuelChart = (points: FuelPoint[]) => {
  const width = 720;
  const height = 300;
  const padding = { top: 24, right: 28, bottom: 42, left: 58 };
  const values = points.map((point) => point.value);
  const times = points.map((point) => Date.parse(point.at));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valuePad = Math.max(5, (maxValue - minValue) * 0.12);
  const yMin = Math.max(0, minValue - valuePad);
  const yMax = maxValue + valuePad;
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (at: string) => {
    const ms = Date.parse(at);
    if (!Number.isFinite(ms) || tMax === tMin) return padding.left + plotWidth / 2;
    return padding.left + ((ms - tMin) / (tMax - tMin)) * plotWidth;
  };
  const y = (value: number) => {
    if (yMax === yMin) return padding.top + plotHeight / 2;
    return padding.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;
  };
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.at).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = yMin + ((yMax - yMin) * index) / 4;
    return { value, y: y(value) };
  });
  const xTicks = Array.from({ length: 5 }, (_, index) => {
    const value = tMin + ((tMax - tMin) * index) / 4;
    return { value, x: padding.left + (plotWidth * index) / 4 };
  });
  return { width, height, padding, plotWidth, plotHeight, path, yTicks, xTicks, x, y };
};

const normalizeIgnition = (value: unknown) => {
  if (typeof value === "boolean") return value ? "On" : "Off";
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const lower = raw.toLowerCase();
  if (["true", "1", "on", "ignition on"].includes(lower)) return "On";
  if (["false", "0", "off", "ignition off"].includes(lower)) return "Off";
  return raw;
};

const normalizeMovement = (value: unknown): AssetRow["movement"] => {
  if (typeof value === "boolean") return value ? "moving" : "stationary";
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (["moving", "move", "in motion", "in_motion", "driving", "driven"].includes(raw)) return "moving";
  if (["stationary", "parked", "stopped", "idle", "not moving"].includes(raw)) return "stationary";
  return "unknown";
};

const hasTelemetryWarning = (asset: Record<string, unknown>, warning: string) => {
  const quality = asRecord(asset.telemetryQuality);
  const warnings = quality?.warnings;
  return Array.isArray(warnings) && warnings.some((item) => String(item ?? "") === warning);
};

const haversineMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMeters = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMeters * Math.asin(Math.min(1, Math.sqrt(h)));
};

const inferMovementFromPosition = (current: { lat?: number; lng?: number; telemetryAt?: string }, previous?: AssetRow) => {
  if (
    typeof current.lat !== "number" ||
    typeof current.lng !== "number" ||
    typeof previous?.lat !== "number" ||
    typeof previous?.lng !== "number"
  ) {
    return undefined;
  }

  const movedMeters = haversineMeters(
    { lat: previous.lat, lng: previous.lng },
    { lat: current.lat, lng: current.lng }
  );
  if (movedMeters < 15) return undefined;

  const currentAt = Date.parse(String(current.telemetryAt ?? ""));
  const previousAt = Date.parse(String(previous.telemetryAt ?? ""));
  if (Number.isFinite(currentAt) && Number.isFinite(previousAt) && currentAt <= previousAt) return undefined;
  return "moving" as const;
};

const movementFromAsset = (asset: AssetRow): AssetRow["movement"] => {
  if (asset.movement === "moving" || asset.movement === "stationary") return asset.movement;
  const speed = parseTelemetryNumber(asset.speed);
  if (speed === null) return asset.movement;
  return speed > 1.2 ? "moving" : "stationary";
};

const getNetworkStatus = (asset: AssetRow) => {
  const movement = movementFromAsset(asset);
  if (movement === "moving") return "live";
  if (movement === "stationary") return "parked";
  if (asset.status === "offline") return "offline";
  if (asset.status === "warning") return "offline";
  return "live";
};

const mapAssetToRow = (asset: Record<string, unknown>, index: number, previous?: AssetRow): AssetRow => {
  const latest = asRecord(asset.telemetryLatest);
  const io = asRecord(latest?.io);
  const speedRaw = firstKnown(latest?.speed, io?.Speed, io?.["GPS Speed"], io?.["GPS velocity"], asset.speed);
  const headingRaw = firstKnown(latest?.heading, io?.Heading, asset.heading);
  const ignitionRaw = firstKnown(asset.ignition, latest?.ignition, io?.Ignition);
  const explicitMovement = normalizeMovement(firstKnown(latest?.movement, asset.movement));
  const lat = parseTelemetryNumber(firstKnown(latest?.lat, asset.lat, asset.latitude));
  const lng = parseTelemetryNumber(firstKnown(latest?.lng, latest?.lon, asset.lng, asset.lon, asset.longitude));
  const fuelLitres = findFuelLitres(asset);
  const lastSeen = firstKnown(asset.lastSeen, asset.last_seen, asset.lastSeenAt, asset.last_seen_at, latest?.at);
  const telemetryAt = String(lastSeen ?? "").trim();
  const positionMovement = inferMovementFromPosition({ lat: lat ?? undefined, lng: lng ?? undefined, telemetryAt }, previous);
  const movement =
    explicitMovement === "moving" ||
    hasTelemetryWarning(asset, "movement_speed_mismatch") ||
    positionMovement === "moving"
      ? "moving"
      : explicitMovement;
  const statusByFreshness = computeAssetDotStatus({
    availability: asset.status,
    lastSeen,
    lastPosition: asset.lastPosition,
    lastTrip: asset.lastTrip,
    speed: parseTelemetryNumber(speedRaw) ?? speedRaw,
    staleHours: 2
  });
  const status =
    movement === "moving" && String(asset.status ?? "").trim().toLowerCase() !== "unavailable"
      ? "online"
      : statusByFreshness;

  return {
    id: String(asset.id ?? asset.assetId ?? index),
    assetDescription: String(asset.assetDescription ?? asset.description ?? "—"),
    registration: String(asset.registration ?? "—"),
    fleetNumber: String(asset.fleetNumber ?? "—"),
    site: String(asset.site ?? "—"),
    driver: String(asset.driver ?? asset.defaultDriver ?? asset.assignedDriver ?? "—"),
    lastActive: String(asset.lastActive ?? "—"),
    lastPosition: String(asset.lastPosition ?? lastSeen ?? "—"),
    location: String(asset.lastLocation ?? asset.location ?? latest?.locationName ?? latest?.location ?? "—"),
    assetId: String(asset.assetId ?? asset.id ?? "—"),
    gps: String(asset.gps ?? (lat !== null && lng !== null ? `${lat}, ${lng}` : "—")),
    heading: String(headingRaw ?? "NE"),
    ignition: normalizeIgnition(ignitionRaw),
    lastNotificationValue: String(asset.lastNotificationValue ?? "—"),
    mobileDeviceType: String(asset.mobileDevice ?? asset.mobileDeviceType ?? "—"),
    speed: String(speedRaw ?? "0"),
    timeInIgnition: String(asset.timeInIgnition ?? "—"),
    driverIdentified: String(asset.driverIdentified ?? "—"),
    fuelReading: formatFuelLitres(fuelLitres),
    status,
    movement,
    imei: String(asset.imei ?? asset.deviceId ?? "").trim() || undefined,
    fuelLitres: fuelLitres ?? undefined,
    lat: lat ?? undefined,
    lng: lng ?? undefined,
    telemetryAt,
    raw: asset
  };
};

const buildAssetIcon = (asset: AssetRow) => {
  const dir = headingToDegrees(asset.heading);
  const network = getNetworkStatus(asset);
  const isStationary = network === "parked";
  return L.divIcon({
    className: "asset-marker-wrapper",
    html: `
      <div class="asset-marker ${network}${isStationary ? " is-stationary" : ""}" style="--dir:${dir}deg">
        <div class="asset-arrow">➤</div>
        <div class="asset-body ${network}">🚚</div>
        <div class="asset-net ${network}"></div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
};

const defaultVisible = new Set<ColumnKey>([
  "assetDescription",
  "fuelReading",
  "driver",
  "lastPosition",
  "registration"
]);

const initialAssets: AssetRow[] = [
  {
    id: "1",
    assetDescription: "APM T120DY",
    registration: "T120DY",
    fleetNumber: "B3940440001220010442/",
    site: "HV - Long Haul",
    driver: "Henry Mwambungu",
    lastActive: "14:02",
    lastPosition: "18/01/2026 23:13 (EAT)",
    location: "—",
    assetId: "1",
    gps: "—",
    heading: "NE",
    ignition: "On",
    lastNotificationValue: "—",
    mobileDeviceType: "—",
    speed: "0",
    timeInIgnition: "—",
    fuelReading: "186",
    driverIdentified: "Yes",
    status: "online",
    lat: 0.357,
    lng: 32.582,
  },
  {
    id: "2",
    assetDescription: "APM T412DY",
    registration: "T412DY",
    fleetNumber: "B9255060867338943527/",
    site: "LV - Short Haul",
    driver: "Akili Mangala",
    lastActive: "13:55",
    lastPosition: "18/01/2026 23:13 (EAT)",
    location: "—",
    assetId: "2",
    gps: "—",
    heading: "NE",
    ignition: "On",
    lastNotificationValue: "—",
    mobileDeviceType: "—",
    speed: "0",
    timeInIgnition: "—",
    fuelReading: "142",
    driverIdentified: "Yes",
    status: "warning",
    lat: 0.275,
    lng: 32.612,
  },
  {
    id: "3",
    assetDescription: "APM T640DY",
    registration: "T640DY",
    fleetNumber: "B9255060867338943067/",
    site: "LV - Short Haul",
    driver: "Akili Mangala",
    lastActive: "13:47",
    lastPosition: "08/12/2025 14:31 (EAT)",
    location: "—",
    assetId: "3",
    gps: "—",
    heading: "NE",
    ignition: "Off",
    lastNotificationValue: "—",
    mobileDeviceType: "—",
    speed: "0",
    timeInIgnition: "—",
    fuelReading: "98",
    driverIdentified: "Yes",
    status: "offline",
    lat: 0.182,
    lng: 32.534,
  },
  {
    id: "4",
    assetDescription: "APM T411DY",
    registration: "T411DY",
    fleetNumber: "B9255060867338943072/",
    site: "LV - Short Haul",
    driver: "Akili Mangala",
    lastActive: "13:45",
    lastPosition: "18/01/2026 21:45 (EAT)",
    location: "—",
    assetId: "4",
    gps: "—",
    heading: "NE",
    ignition: "On",
    lastNotificationValue: "—",
    mobileDeviceType: "—",
    speed: "0",
    timeInIgnition: "—",
    fuelReading: "164",
    driverIdentified: "Yes",
    status: "online",
    lat: 0.55,
    lng: 32.45,
  },
  {
    id: "5",
    assetDescription: "APM T417DY",
    registration: "T417DY",
    fleetNumber: "B9255060867338943057/",
    site: "LV - Short Haul",
    driver: "Akili Mangala",
    lastActive: "13:40",
    lastPosition: "18/01/2026 23:11 (EAT)",
    location: "—",
    assetId: "5",
    gps: "—",
    heading: "NE",
    ignition: "On",
    lastNotificationValue: "—",
    mobileDeviceType: "—",
    speed: "0",
    timeInIgnition: "—",
    fuelReading: "121",
    driverIdentified: "Yes",
    status: "warning",
    lat: 0.45,
    lng: 32.32,
  },
  {
    id: "6",
    assetDescription: "APM T412DY",
    registration: "T412DY",
    fleetNumber: "B9255060867338943521/",
    site: "LV - Short Haul",
    driver: "Akili Mangala",
    lastActive: "13:36",
    lastPosition: "18/01/2026 23:03 (EAT)",
    location: "—",
    assetId: "6",
    gps: "—",
    heading: "NE",
    ignition: "Off",
    lastNotificationValue: "—",
    mobileDeviceType: "—",
    speed: "0",
    timeInIgnition: "—",
    fuelReading: "103",
    driverIdentified: "Yes",
    status: "offline",
    lat: 0.71,
    lng: 32.31,
  },
  {
    id: "7",
    assetDescription: "APM T630DG",
    registration: "T630DG",
    fleetNumber: "B3000100428736/",
    site: "LV - Short Haul",
    driver: "Charles Vitalis",
    lastActive: "13:21",
    lastPosition: "18/01/2026 19:16 (EAT)",
    location: "—",
    assetId: "7",
    gps: "—",
    heading: "NE",
    ignition: "On",
    lastNotificationValue: "—",
    mobileDeviceType: "—",
    speed: "0",
    timeInIgnition: "—",
    fuelReading: "210",
    driverIdentified: "Yes",
    status: "online"
  }
];

const locations: LocationRow[] = [
  { id: "1", name: "Afro Oil Depot", site: "All sites", locationType: "Customer" },
  { id: "2", name: "Afroil Terminal Parking", site: "All sites", locationType: "Customer" },
  { id: "3", name: "Amis Terminal-DRC", site: "All sites", locationType: "Customer" },
  { id: "4", name: "AutoXpress-service", site: "Tristar Energy", locationType: "Other" },
  { id: "5", name: "Bicumbi-Rw", site: "Tristar Energy", locationType: "Site" },
  { id: "6", name: "Boma ngo'mbe Moshi", site: "All sites", locationType: "Customer" },
  { id: "7", name: "Calibration", site: "All sites", locationType: "Customer" },
  { id: "8", name: "Calibration Area", site: "All sites", locationType: "Customer" },
  { id: "9", name: "Camel Depot Parking", site: "All sites", locationType: "Customer" },
  { id: "10", name: "Camel Oil Depot-Kurasini", site: "All sites", locationType: "Customer" },
  { id: "11", name: "Camel Oil Terminal-Parking", site: "All sites", locationType: "Customer" },
  { id: "12", name: "Car wash Morogoro", site: "All sites", locationType: "Customer" },
  { id: "13", name: "Chalinze", site: "All sites", locationType: "Other" }
];

const events: EventRow[] = [
  { id: "1", name: "Harsh Cornering", eventType: "System" },
  { id: "2", name: "Harsh Left Cornering", eventType: "Default" },
  { id: "3", name: "Harsh Right Cornering", eventType: "Default" },
  { id: "4", name: "Ignition Off", eventType: "Default" },
  { id: "5", name: "Ignition On", eventType: "Default" },
  { id: "6", name: "Low Battery", eventType: "Default" },
  { id: "7", name: "Low Internal Battery", eventType: "Default" },
  { id: "8", name: "Panic Alert", eventType: "Default" },
  { id: "9", name: "Power Disconnected", eventType: "Default" },
  { id: "10", name: "Power Reconnected", eventType: "Default" },
  { id: "11", name: "3 - Axis - Lift Off", eventType: "Custom" },
  { id: "12", name: "3 - Axis - Possible Accident (In Trip)", eventType: "Custom" }
];

export default function LiveTracking() {
  const navigate = useNavigate();
  const [showColumns, setShowColumns] = useState(false);
  const [openActions, setOpenActions] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(defaultVisible);
  const [sidebarWidth, setSidebarWidth] = useState<number>(420);
  const [dragging, setDragging] = useState(false);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(columns.map((c) => c.key));
  const [dragCol, setDragCol] = useState<ColumnKey | null>(null);
  const [showLocationsModal, setShowLocationsModal] = useState(false);
  const [locationFilter, setLocationFilter] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [eventFilter, setEventFilter] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [showAssetsModal, setShowAssetsModal] = useState(false);
  const [assetsFilter, setAssetsFilter] = useState("");
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [activeDrawTool, setActiveDrawTool] = useState<GeoShape["type"] | null>(null);
  const [shapes, setShapes] = useState<GeoShape[]>([]);
  const [drawingShape, setDrawingShape] = useState<GeoShape | null>(null);
  const [polyPoints, setPolyPoints] = useState<DrawPoint[]>([]);
  const [dragPoint, setDragPoint] = useState<DragPoint>(null);
  const [showMapLayers, setShowMapLayers] = useState(false);
  const [showCreateLocationTools, setShowCreateLocationTools] = useState(false);
  const [selectedStreetView, setSelectedStreetView] = useState<{ lat: number; lng: number; heading: string } | null>(null);
  const googleMapsKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const [measureMode, setMeasureMode] = useState<"distance" | null>(null);
  const [measureLine, setMeasureLine] = useState<{ start: DrawPoint; end: DrawPoint } | null>(null);
  const [measureMeters, setMeasureMeters] = useState<number | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureStart, setMeasureStart] = useState<DrawPoint | null>(null);
  const [measureAnchor, setMeasureAnchor] = useState<{ start: DrawPoint; end: DrawPoint } | null>(null);
  const [routeLatLngs, setRouteLatLngs] = useState<Array<{ lat: number; lng: number }> | null>(null);
  const [routePixels, setRoutePixels] = useState<DrawPoint[] | null>(null);
  const [routeStatus, setRouteStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [showMapRotate, setShowMapRotate] = useState(false);
  const [mapRotation, setMapRotation] = useState(0);
  const [queryMode, setQueryMode] = useState(false);
  const [queryCursor, setQueryCursor] = useState<DrawPoint | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<{
    point: DrawPoint;
    name: string;
    speed: string;
  } | null>(null);
  const [mapLayer, setMapLayer] = useState("google-street");
  const baseLayers: Record<string, { url: string; attribution: string }> = {
    "google-street": {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    "google-terrain": {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
    },
    "google-satellite": {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri"
    },
    "google-hybrid": {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri"
    }
  };
  const overlayLayers: Record<string, { url: string; attribution: string }> = {
    "google-hybrid": {
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri"
    }
  };
  const [mapLayers, setMapLayers] = useState(() => {
    const defaults = {
      clustering: true,
      eventsOnTrail: true,
      locationLabels: true,
      showEntireLastTrip: false,
      hours: "48"
    };
    if (typeof window === "undefined") return defaults;
    try {
      const stored = localStorage.getItem("vivi.liveTracking.mapLayers");
      if (!stored) return defaults;
      const parsed = JSON.parse(stored) as Partial<typeof defaults>;
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });
  const tableRef = useRef<HTMLDivElement | null>(null);
  const hScrollRef = useRef<HTMLDivElement | null>(null);
  const hScrollInnerRef = useRef<HTMLDivElement | null>(null);
  const mapDrawRef = useRef<HTMLDivElement | null>(null);
  const drawStartRef = useRef<DrawPoint | null>(null);
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const measureLineRef = useRef<{ start: DrawPoint; end: DrawPoint } | null>(null);

  const toggleCol = (key: ColumnKey) => {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setVisibleCols(next);
  };

  const activeCols = columnOrder
    .filter((key) => visibleCols.has(key))
    .map((key) => columns.find((c) => c.key === key)!)
    .filter(Boolean);
  // Add 3 for: checkbox, status, actions
  const gridTemplate = `32px 24px repeat(${activeCols.length}, minmax(160px, max-content)) 48px`;

  const filteredLocations = locations.filter((loc) => {
    const query = locationFilter.trim().toLowerCase();
    if (!query) return true;
    return (
      loc.name.toLowerCase().includes(query)
      || loc.site.toLowerCase().includes(query)
      || loc.locationType.toLowerCase().includes(query)
    );
  });

  const filteredEvents = events.filter((evt) => {
    const query = eventFilter.trim().toLowerCase();
    if (!query) return true;
    return evt.name.toLowerCase().includes(query) || evt.eventType.toLowerCase().includes(query);
  });

  const [assetRows, setAssetRows] = useState<AssetRow[]>(initialAssets);
  const assetRowsRef = useRef<AssetRow[]>(initialAssets);
  const [fuelGraph, setFuelGraph] = useState<FuelGraphState | null>(null);

  useEffect(() => {
    assetRowsRef.current = assetRows;
  }, [assetRows]);

  useEffect(() => {
    let mounted = true;
    let refreshTimer: number | null = null;
    const loadAssets = async () => {
      const apiAssets = await getAssetsFromApi<Record<string, unknown>>();
      if (!mounted) return;

      const previousById = new Map(assetRowsRef.current.map((asset) => [asset.id, asset]));
      const mapped = apiAssets.length
        ? apiAssets.map((asset, index) =>
            mapAssetToRow(
              asset,
              index,
              previousById.get(String(asset.id ?? asset.assetId ?? index))
            )
          )
        : [];

      if (mapped.length) {
        setAssetRows(mapped);
      } else {
        const stored = window.localStorage.getItem("vivi.assets");
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as Record<string, unknown>[];
            const previousById = new Map(assetRowsRef.current.map((asset) => [asset.id, asset]));
            const fallback = parsed.map((asset, index) =>
              mapAssetToRow(
                asset,
                index,
                previousById.get(String(asset.id ?? asset.assetId ?? index))
              )
            );
            setAssetRows(fallback);
          } catch {
            setAssetRows(initialAssets);
          }
        } else {
          setAssetRows(initialAssets);
        }
      }
    };

    void loadAssets();
    refreshTimer = window.setInterval(() => {
      void loadAssets();
    }, 20000);
    return () => {
      mounted = false;
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, []);

  const filteredAssets = assetRows.filter((asset) => {
    const query = assetsFilter.trim().toLowerCase();
    if (!query) return true;
    return (
      asset.assetDescription.toLowerCase().includes(query)
      || asset.registration.toLowerCase().includes(query)
      || asset.fleetNumber.toLowerCase().includes(query)
      || asset.site.toLowerCase().includes(query)
    );
  });

  const openFuelTachograph = async (asset: AssetRow) => {
    const currentFuel = coerceFuelLitres(asset.fuelLitres ?? asset.fuelReading);
    const fallbackPoints = fuelPointsFromAsset(asset);
    const displayFallbackPoints =
      fallbackPoints.length || currentFuel === null
        ? fallbackPoints
        : buildStableFuelSeries([{ at: asset.telemetryAt || new Date().toISOString(), value: currentFuel }]);
    setFuelGraph({
      asset,
      status: "loading",
      points: displayFallbackPoints,
      rawCount: displayFallbackPoints.length
    });

    const to = new Date();
    const from = new Date(to.getTime() - 12 * 60 * 60 * 1000);
    const lookupAssetId = String(asset.raw?.id ?? asset.id ?? "").trim();
    const lookupImei = String(asset.imei ?? asset.raw?.imei ?? "").trim();

    if (!lookupAssetId && !lookupImei) {
      setFuelGraph({
        asset,
        status: displayFallbackPoints.length ? "ready" : "error",
        points: displayFallbackPoints,
        rawCount: displayFallbackPoints.length,
        error: displayFallbackPoints.length ? undefined : "No IMEI or asset id is available for fuel history."
      });
      return;
    }

    const result = await getTelemetryHistory({
      imei: lookupImei || undefined,
      assetId: lookupAssetId || undefined,
      from: from.toISOString(),
      to: to.toISOString(),
      limit: 5000
    });
    const events = Array.isArray(result.body?.events) ? result.body.events : [];
    const historyPoints = fuelPointsFromHistory(events);
    const points = historyPoints.length ? historyPoints : displayFallbackPoints;
    setFuelGraph({
      asset,
      status: points.length ? "ready" : "error",
      points,
      rawCount: events.length || fallbackPoints.length,
      error: points.length ? result.error : result.error ?? "No fuel readings were found for the last 12 hours."
    });
  };

  const toggleLocation = (id: string) => {
    setSelectedLocations((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEvent = (id: string) => {
    setSelectedEvents((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAsset = (id: string) => {
    setSelectedAssets((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDrawTool = (tool: GeoShape["type"]) => {
    setActiveDrawTool((current) => (current === tool ? null : tool));
  };

  const setAssetContext = (asset: AssetRow) => {
    const assetLabel = `${asset.assetDescription} - ${asset.registration}`;
    localStorage.setItem("vivi.activeAsset", assetLabel);
    localStorage.setItem("vivi.activeRegistration", asset.registration ?? "—");
    localStorage.setItem("vivi.activeSite", asset.site ?? "—");
    localStorage.removeItem("vivi.contextType");
    localStorage.removeItem("vivi.contextName");
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const openAssetsWindow = () => {
    window.open("/monitor/fleet/assets", "_blank", "noopener,noreferrer");
  };

  const handleQueryPoint = () => {
    setQueryMode((current) => !current);
    setQueryResult(null);
    setQueryCursor(null);
    setQueryLoading(false);
    setActiveDrawTool(null);
    setShowCreateLocationTools(false);
    setShowMapLayers(false);
    setShowMapRotate(false);
    setMeasureMode(null);
  };

  const handleSelectAndZoom = () => {
    setActiveDrawTool(null);
    setShowCreateLocationTools(false);
    setShowMapRotate(false);
    setQueryMode(false);
    setMeasureMode(null);
  };

  const handleMeasureDistance = () => {
    setShowCreateLocationTools(false);
    setActiveDrawTool(null);
    setShowMapLayers(false);
    setShowMapRotate(false);
    setQueryMode(false);
    setMeasureMode("distance");
    setMeasureLine(null);
    setMeasureMeters(null);
    setMeasureStart(null);
    setMeasureAnchor(null);
    setRouteLatLngs(null);
    setRoutePixels(null);
    setRouteStatus("idle");
  };

  const handleMeasureArea = () => {
    setShowCreateLocationTools(true);
    setActiveDrawTool("polygon");
    setQueryMode(false);
    setMeasureMode(null);
  };

  const handleSaveMapLayers = () => {
    try {
      localStorage.setItem("vivi.liveTracking.mapLayers", JSON.stringify(mapLayers));
    } catch {
      // ignore storage failures
    }
    void saveToApi("live-tracking:map-layers", {
      ...mapLayers,
      updatedAt: new Date().toISOString()
    });
    setShowMapLayers(false);
  };

  const toggleMapFullscreen = () => {
    if (!mapSectionRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void mapSectionRef.current.requestFullscreen();
  };

  const getRelativePoint = (event: React.MouseEvent) => {
    const rect = mapDrawRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const pointToLatLng = (point: DrawPoint) => {
    const map = mapRef.current;
    if (!map) return null;
    return map.containerPointToLatLng(L.point(point.x, point.y));
  };

  const updateRoutePixels = (points: Array<{ lat: number; lng: number }>) => {
    const map = mapRef.current;
    if (!map) return;
    const next = points.map((p) => {
      const pt = map.latLngToContainerPoint(L.latLng(p.lat, p.lng));
      return { x: pt.x, y: pt.y };
    });
    setRoutePixels(next);
  };

  const formatKm = (meters: number | null) => {
    if (!meters && meters !== 0) return "—";
    return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
  };

  const handleMapMouseDown = (event: React.MouseEvent) => {
    if (measureMode === "distance") {
      event.preventDefault();
      return;
    }
    if (!activeDrawTool || (activeDrawTool !== "circle" && activeDrawTool !== "rect")) return;
    const point = getRelativePoint(event);
    drawStartRef.current = point;
    const id = `shape-${Date.now()}`;
    if (activeDrawTool === "circle") {
      setDrawingShape({ id, type: "circle", cx: point.x, cy: point.y, r: 0 });
    } else if (activeDrawTool === "rect") {
      setDrawingShape({ id, type: "rect", x: point.x, y: point.y, w: 0, h: 0 });
    }
  };

  const handleMapMouseMove = (event: React.MouseEvent) => {
    if (queryMode) {
      setQueryCursor(getRelativePoint(event));
      return;
    }
    if (dragPoint) {
      const point = getRelativePoint(event);
      if (dragPoint.isDraft) {
        setPolyPoints((current) =>
          current.map((p, index) => (index === dragPoint.index ? point : p))
        );
      } else {
        setShapes((current) =>
          current.map((shape) => {
            if (shape.id !== dragPoint.shapeId) return shape;
            if (shape.type !== "polygon" && shape.type !== "polyline") return shape;
            const nextPoints = shape.points.map((p, index) =>
              index === dragPoint.index ? point : p
            );
            return { ...shape, points: nextPoints };
          })
        );
      }
      return;
    }
    if (!drawingShape || !drawStartRef.current) return;
    const point = getRelativePoint(event);
    const start = drawStartRef.current;
    if (drawingShape.type === "circle") {
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      setDrawingShape({ ...drawingShape, r });
    }
    if (drawingShape.type === "rect") {
      const x = Math.min(start.x, point.x);
      const y = Math.min(start.y, point.y);
      const w = Math.abs(point.x - start.x);
      const h = Math.abs(point.y - start.y);
      setDrawingShape({ ...drawingShape, x, y, w, h });
    }
  };

  const finalizeRouteMeasure = (line: { start: DrawPoint; end: DrawPoint }) => {
    const startLatLng = pointToLatLng(line.start);
    const endLatLng = pointToLatLng(line.end);
    setIsMeasuring(false);
    setMeasureLine(null);
    setMeasureAnchor(line);
    if (!startLatLng || !endLatLng) return;
    setRouteStatus("loading");
    void fetch(
      `https://router.project-osrm.org/route/v1/driving/${startLatLng.lng},${startLatLng.lat};${endLatLng.lng},${endLatLng.lat}?overview=full&geometries=geojson`
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("route"))))
      .then((data) => {
        const route = data?.routes?.[0];
        const coords = route?.geometry?.coordinates as Array<[number, number]> | undefined;
        if (!coords || coords.length < 2) throw new Error("route");
        const latLngs = coords.map(([lng, lat]) => ({ lat, lng }));
        setRouteLatLngs(latLngs);
        updateRoutePixels(latLngs);
        setMeasureMeters(route.distance ?? null);
        setRouteStatus("ready");
      })
      .catch(() => {
        const distance = startLatLng.distanceTo(endLatLng);
        setMeasureMeters(distance);
        setRouteLatLngs(null);
        setRoutePixels(null);
        setRouteStatus("error");
      });
  };

  const handleMapMouseUp = () => {
    if (!drawingShape) return;
    setShapes((current) => [...current, drawingShape]);
    setDrawingShape(null);
    drawStartRef.current = null;
    setDragPoint(null);
  };

  const handleMapClick = (event: React.MouseEvent) => {
    if (queryMode) {
      const point = getRelativePoint(event);
      const latLng = pointToLatLng(point);
      if (!latLng) return;
      setQueryLoading(true);
      setQueryResult(null);
      const lat = latLng.lat;
      const lng = latLng.lng;
      const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
      const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
        `[out:json];way(around:80,${lat},${lng})[maxspeed];out tags 1;`
      )}`;
      Promise.all([
        fetch(reverseUrl).then((res) => (res.ok ? res.json() : null)).catch(() => null),
        fetch(overpassUrl).then((res) => (res.ok ? res.json() : null)).catch(() => null)
      ]).then(([reverseData, overpassData]) => {
        const displayName: string | undefined = reverseData?.display_name;
        const name = displayName ? displayName.split(",").slice(0, 2).join(", ") : "Location name unavailable";
        const ways = overpassData?.elements ?? [];
        const speedTag = ways.find((w: any) => w?.tags?.maxspeed)?.tags?.maxspeed as string | undefined;
        const speed = speedTag ? `Speed limit ${speedTag}` : "Speed limit not available";
        setQueryResult({ point, name, speed });
        setQueryLoading(false);
      });
      return;
    }
    if (measureMode === "distance") {
      const point = getRelativePoint(event);
      if (!measureStart) {
        setMeasureStart(point);
        const nextLine = { start: point, end: point };
        setMeasureLine(nextLine);
        measureLineRef.current = nextLine;
        setRouteLatLngs(null);
        setRoutePixels(null);
        setRouteStatus("idle");
        return;
      }
      const nextLine = { start: measureStart, end: point };
      setMeasureLine(nextLine);
      measureLineRef.current = nextLine;
      setMeasureAnchor(nextLine);
      setIsMeasuring(true);
      finalizeRouteMeasure(nextLine);
      setMeasureStart(null);
      return;
    }
    if (!activeDrawTool || (activeDrawTool !== "polygon" && activeDrawTool !== "polyline")) return;
    const point = getRelativePoint(event);
    setPolyPoints((current) => [...current, point]);
  };

  const handleMapDoubleClick = (event: React.MouseEvent) => {
    if (measureMode === "distance") return;
    if (!activeDrawTool || (activeDrawTool !== "polygon" && activeDrawTool !== "polyline")) return;
    event.preventDefault();
    const minPoints = activeDrawTool === "polygon" ? 3 : 2;
    if (polyPoints.length < minPoints) return;
    const id = `shape-${Date.now()}`;
    setShapes((current) => [...current, { id, type: activeDrawTool, points: polyPoints }]);
    setPolyPoints([]);
    setDragPoint(null);
  };

  const handlePointMouseDown = (
    event: React.MouseEvent,
    shapeId: string,
    index: number,
    isDraft: boolean
  ) => {
    event.stopPropagation();
    setDragPoint({ shapeId, index, isDraft });
  };

  useEffect(() => {
    if (activeDrawTool !== "polygon" && activeDrawTool !== "polyline") {
      setPolyPoints([]);
    }
  }, [activeDrawTool]);

  useEffect(() => {
    if (measureMode !== "distance") {
      setMeasureLine(null);
      setMeasureMeters(null);
      setIsMeasuring(false);
      setMeasureStart(null);
      setMeasureAnchor(null);
      setRouteLatLngs(null);
      setRoutePixels(null);
      setRouteStatus("idle");
    }
  }, [measureMode]);

  useEffect(() => {
    if (!mapInstance || !routeLatLngs) return;
    const update = () => updateRoutePixels(routeLatLngs);
    update();
    mapInstance.on("move", update);
    mapInstance.on("zoom", update);
    return () => {
      mapInstance.off("move", update);
      mapInstance.off("zoom", update);
    };
  }, [mapInstance, routeLatLngs]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const min = 280;
      const max = 700;
      const next = Math.min(max, Math.max(min, e.clientX));
      setSidebarWidth(next);
    };
    const stop = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
    };
  }, [dragging]);

  useEffect(() => {
    if (!tableRef.current || !hScrollInnerRef.current) return;
    hScrollInnerRef.current.style.width = `${tableRef.current.scrollWidth}px`;
  }, [activeCols.length]);

  const assetMarkers = assetRows.map((asset, index) => {
    const lat = asset.lat ?? liveMapCenter[0] + 0.1 * Math.sin(index);
    const lng = asset.lng ?? liveMapCenter[1] + 0.12 * Math.cos(index);
    return (
      <Marker
        key={asset.id}
        position={[lat, lng]}
        icon={buildAssetIcon(asset)}
        eventHandlers={{
          click: () => setSelectedStreetView({ lat, lng, heading: asset.heading })
        }}
      >
        <Popup>
          <div className="easytrack-popup">
            <div className="easytrack-popup-title">Asset info</div>
            <div className="easytrack-popup-body">
              <div className="easytrack-popup-row">
                <span>Asset</span>
                <strong>{`${asset.assetDescription} - ${asset.registration}`}</strong>
              </div>
              <div className="easytrack-popup-row">
                <span>Site</span>
                <div>{asset.site}</div>
              </div>
              <div className="easytrack-popup-row">
                <span>Location</span>
                <div>{asset.location}</div>
              </div>
              <div className="easytrack-popup-row">
                <span>Last position</span>
                <div>{asset.lastPosition}</div>
              </div>
              <div className="easytrack-popup-row">
                <span>Speed</span>
                <div>{asset.speed} km/h</div>
              </div>
              <div className="easytrack-popup-row">
                <span>Driver</span>
                <div>{asset.driver}</div>
              </div>
              <div className="easytrack-popup-row">
                <span>Heading</span>
                <div>{asset.heading}</div>
              </div>
              <div className="easytrack-popup-row">
                <span>Ignition</span>
                <div>{asset.ignition}</div>
              </div>
              <div className="easytrack-popup-row">
                <span>Fuel (L)</span>
                <div className="fuel-popup-actions">
                  <strong>{asset.fuelReading}</strong>
                  <button
                    type="button"
                    data-testid="fuel-tachograph-button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void openFuelTachograph(asset);
                    }}
                  >
                    12h tachograph
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Popup>
      </Marker>
    );
  });

  return (
    <div className="live-page">
      <header className="live-topbar">
        <div className="live-topbar-left">
          <div className="live-topbar-path">EA-Transfleet Services-… / … / China Petrol Pipeline En…</div>
        </div>
        <div className="live-topbar-right">
          <button
            className="live-topbar-chip"
            type="button"
            data-tooltip="Locations"
            onClick={() => setShowLocationsModal(true)}
          >
            <span className="live-chip-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
                <circle cx="12" cy="10" r="2.6" />
              </svg>
            </span>
            {selectedLocations.size}
          </button>
          <button
            className="live-topbar-chip"
            type="button"
            data-tooltip="Notifications"
            onClick={() => setShowEventsModal(true)}
          >
            <span className="live-chip-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                <path d="M9 19a3 3 0 006 0" />
              </svg>
            </span>
            {selectedEvents.size}
          </button>
          <button
            className="live-topbar-chip"
            type="button"
            data-tooltip="Reports"
            data-nav="/measure/insights/reports?category=Movement%20Reports&report=Daily%20Movement%20Report"
          >
            <span className="live-chip-icon" aria-hidden="true">📊</span>
            Reports
          </button>
        </div>
      </header>

      <div className="live-layout">
      <aside className="live-sidebar" style={{ width: sidebarWidth }}>
        <header className="live-header">
          <div className="live-header-title">
            <span>Assets</span>
            <span className="live-count">{assetRows.length}</span>
          </div>
          <div className="live-menu">
            <button className="menu-icon-btn" onClick={() => setShowColumns((v) => !v)} aria-label="Toggle column menu">
              <span />
              <span />
              <span />
            </button>
            {showColumns && (
              <div className="columns-dropdown">
                {columns.map((opt) => (
                  <label key={opt.key} className="columns-option">
                    <input type="checkbox" checked={visibleCols.has(opt.key)} onChange={() => toggleCol(opt.key)} />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="live-filter">
          <input className="live-input" placeholder="Filter" ref={filterInputRef} />
        </div>

        <div className="live-toggles">
          <label>
            <input type="checkbox" /> Show selected assets
          </label>
        </div>

        <div
          className="live-table-wrapper"
          ref={tableRef}
          onScroll={(event) => {
            if (!hScrollRef.current) return;
            const target = event.currentTarget;
            if (hScrollRef.current.scrollLeft !== target.scrollLeft) {
              hScrollRef.current.scrollLeft = target.scrollLeft;
            }
          }}
        >
          <div className="live-table-head" style={{ gridTemplateColumns: gridTemplate }}>
            <div />
            <div />
            {activeCols.map((col) => (
              <div
                key={col.key}
                className={`live-col${dragCol === col.key ? " dragging" : ""}`}
                draggable
                onDragStart={(event) => {
                  setDragCol(col.key);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", col.key);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const fromKey = (event.dataTransfer.getData("text/plain") as ColumnKey) || dragCol;
                  if (!fromKey || fromKey === col.key) return;
                  setColumnOrder((current) => {
                    const next = current.filter((key) => key !== fromKey);
                    const targetIndex = next.indexOf(col.key);
                    next.splice(Math.max(0, targetIndex), 0, fromKey);
                    return next;
                  });
                  setDragCol(null);
                }}
                onDragEnd={() => setDragCol(null)}
              >
                {col.label}
              </div>
            ))}
            <div />
          </div>
          <div className="live-table">
            {assetRows.map((a) => (
              <div key={a.id} className="live-row" style={{ gridTemplateColumns: gridTemplate }}>
                <div className="live-cell">
                  <input type="checkbox" defaultChecked />
                </div>
                <div className="live-cell status">{statusDot(a.status)}</div>
                {activeCols.map((col) => (
                  <div key={col.key} className="live-cell">
                    {col.render(a)}
                  </div>
                ))}
                <div className="live-cell more">
                  <button
                    className="actions-trigger"
                    aria-label="Row actions"
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      setOpenActions(openActions === a.id ? null : a.id);
                      setMenuPos({ top: rect.top - 6, left: rect.left });
                    }}
                  >
                    ⋯
                  </button>
                  {openActions === a.id && menuPos && (
                    <div
                      className="actions-pop open"
                      style={{ top: menuPos.top, left: menuPos.left, transform: "translateY(-100%)" }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setAssetContext(a);
                          setOpenActions(null);
                          navigate("/monitor/fleet/assets");
                        }}
                      >
                        View details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssetContext(a);
                          setOpenActions(null);
                        }}
                      >
                        Go to asset
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssetContext(a);
                          setOpenActions(null);
                          openAssetsWindow();
                        }}
                      >
                        View in new window
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.setItem("vivi.lockedAsset", a.id);
                          setOpenActions(null);
                        }}
                      >
                        Lock on asset
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssetContext(a);
                          setOpenActions(null);
                          navigate("/monitor/activity/trip-timeline");
                        }}
                      >
                        Show trail on map
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.setItem("vivi.requestPositionAsset", a.id);
                          setOpenActions(null);
                        }}
                      >
                        Request current position
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssetContext(a);
                          setOpenActions(null);
                          navigate("/monitor/fleet/assets");
                        }}
                      >
                        Diagnostics
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssetContext(a);
                          setOpenActions(null);
                          navigate("/manage/mobile-device-admin");
                        }}
                      >
                        Commands to mobile device
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          className="live-table-scrollbar"
          ref={hScrollRef}
          onScroll={(event) => {
            if (!tableRef.current) return;
            const target = event.currentTarget;
            if (tableRef.current.scrollLeft !== target.scrollLeft) {
              tableRef.current.scrollLeft = target.scrollLeft;
            }
          }}
        >
          <div className="live-table-scrollbar-inner" ref={hScrollInnerRef} />
        </div>
      </aside>

      <div className={`live-resizer ${dragging ? "dragging" : ""}`} onMouseDown={() => setDragging(true)} />

      <section className="live-map" ref={mapSectionRef}>
        <div className="map-leaflet-canvas" style={{ transform: `rotate(${mapRotation}deg)` }}>
          <MapContainer
            center={liveMapCenter}
            zoom={7}
            scrollWheelZoom
            className="map-leaflet"
            ref={mapRef}
            whenReady={() => {
              if (mapRef.current) {
                setMapInstance(mapRef.current);
              }
            }}
          >
            <TileLayer
              key={mapLayer}
              attribution={baseLayers[mapLayer].attribution}
              url={baseLayers[mapLayer].url}
            />
            {mapLayer === "google-hybrid" && (
              <TileLayer
                attribution={overlayLayers[mapLayer].attribution}
                url={overlayLayers[mapLayer].url}
              />
            )}
            {mapLayers.clustering ? (
              <MarkerClusterGroup chunkedLoading>{assetMarkers}</MarkerClusterGroup>
            ) : (
              assetMarkers
            )}
          </MapContainer>
        </div>
        <StreetViewMini
          apiKey={googleMapsKey}
          lat={selectedStreetView?.lat}
          lng={selectedStreetView?.lng}
          heading={selectedStreetView ? headingToDegrees(selectedStreetView.heading) : 0}
        />
        <div className="map-top-tools map-top-tools--bottom" aria-label="Map top tools">
          <button
            type="button"
            className="map-top-tool"
            data-tooltip="Measure distance"
            aria-label="Measure distance"
            data-toast-ignore
            onClick={handleMeasureDistance}
          >
            ↔
          </button>
          <button
            type="button"
            className="map-top-tool"
            data-tooltip="Query point on map"
            aria-label="Query point on map"
            data-toast-ignore
            onClick={handleQueryPoint}
          >
            ❓
          </button>
        </div>
        <div className="map-ui">
          <select
            className="map-layer-select"
            value={mapLayer}
            aria-label="Map layer"
            onChange={(event) => setMapLayer(event.target.value)}
          >
            <option value="google-hybrid">Google (hybrid)</option>
            <option value="google-street">Google (street)</option>
            <option value="google-terrain">Google (terrain)</option>
            <option value="google-satellite">Google (satellite)</option>
          </select>

          <div className="map-tools" aria-label="Map tools">
            <button
              type="button"
              className="map-tool"
              data-tooltip="Query point on map"
              aria-label="Query point on map"
              data-toast-ignore
              onClick={handleQueryPoint}
            >
              🔍
            </button>
            <button
              type="button"
              className={`map-tool${showCreateLocationTools || activeDrawTool ? " active" : ""}`}
              data-tooltip="Create geofence"
              aria-label="Create geofence"
              onClick={() => setShowCreateLocationTools((current) => !current)}
            >
              📍
            </button>
            <button
              type="button"
              className="map-tool"
              data-tooltip="View many assets (new window)"
              aria-label="View many assets in new window"
              onClick={() => setShowAssetsModal(true)}
            >
              ⌖
            </button>
            <button
              type="button"
              className={`map-tool${showMapLayers ? " active" : ""}`}
              data-tooltip="Map layers"
              aria-label="Map layers"
              onClick={() => setShowMapLayers((current) => !current)}
            >
              🗂
            </button>
            <button
              type="button"
              className={`map-tool${showMapRotate ? " active" : ""}`}
              data-tooltip="Rotate map"
              aria-label="Rotate map"
              onClick={() => setShowMapRotate((current) => !current)}
            >
              ⟳
            </button>
            <button
              type="button"
              className="map-tool"
              data-tooltip="Full screen"
              aria-label="Full screen"
              data-toast-ignore
              onClick={toggleMapFullscreen}
            >
              ⤢
            </button>
          </div>
        </div>
        {showMapRotate && (
          <div className="map-rotate-panel" role="dialog" aria-label="Rotate map">
            <label className="map-rotate-label">
              Rotation: {Math.round(mapRotation)}°
              <input
                type="range"
                min={0}
                max={360}
                value={mapRotation}
                onChange={(event) => setMapRotation(Number(event.target.value))}
              />
            </label>
            <div className="map-rotate-actions">
              <button type="button" onClick={() => setMapRotation((v) => (v - 15 + 360) % 360)}>
                ↺ 15°
              </button>
              <button type="button" onClick={() => setMapRotation((v) => (v + 15) % 360)}>
                ↻ 15°
              </button>
            </div>
            <button type="button" className="map-rotate-reset" onClick={() => setMapRotation(0)}>
              Reset
            </button>
          </div>
        )}
        {showCreateLocationTools && (
          <div className="map-create-panel" role="dialog" aria-label="Create location tools">
            <button
              type="button"
              className={`map-create-btn${activeDrawTool === "circle" ? " active" : ""}`}
              data-tooltip="Circle geofence"
              aria-label="Circle geofence"
              onClick={() => toggleDrawTool("circle")}
            >
              ●
            </button>
            <button
              type="button"
              className={`map-create-btn${activeDrawTool === "rect" ? " active" : ""}`}
              data-tooltip="Rectangle geofence"
              aria-label="Rectangle geofence"
              onClick={() => toggleDrawTool("rect")}
            >
              ▭
            </button>
            <button
              type="button"
              className={`map-create-btn${activeDrawTool === "polygon" ? " active" : ""}`}
              data-tooltip="Polygon geofence"
              aria-label="Polygon geofence"
              onClick={() => toggleDrawTool("polygon")}
            >
              ⬢
            </button>
            <button
              type="button"
              className={`map-create-btn${activeDrawTool === "polyline" ? " active" : ""}`}
              data-tooltip="Polyline geofence"
              aria-label="Polyline geofence"
              onClick={() => toggleDrawTool("polyline")}
            >
              ➝
            </button>
          </div>
        )}
        <div
          ref={mapDrawRef}
          className={`map-draw-layer${activeDrawTool || measureMode || queryMode ? " active" : ""}${queryMode ? " query-mode" : ""}`}
          style={{ transform: `rotate(${mapRotation}deg)` }}
          onMouseDown={handleMapMouseDown}
          onMouseMove={handleMapMouseMove}
          onMouseUp={handleMapMouseUp}
          onClick={handleMapClick}
          onDoubleClick={handleMapDoubleClick}
        >
          <svg className="map-draw-svg" aria-hidden="true">
            {routePixels && routePixels.length > 1 && (
              <g>
                <polyline
                  className="map-geo-shape polyline"
                  points={routePixels.map((p) => `${p.x},${p.y}`).join(" ")}
                />
                {routePixels.filter((_, index) => index % 20 === 0).map((p, index) => (
                  <rect
                    key={`route-node-${index}`}
                    className="map-route-node"
                    x={p.x - 4}
                    y={p.y - 4}
                    width={8}
                    height={8}
                  />
                ))}
                <rect
                  className="map-route-node start"
                  x={routePixels[0].x - 5}
                  y={routePixels[0].y - 5}
                  width={10}
                  height={10}
                />
                <rect
                  className="map-route-node end"
                  x={routePixels[routePixels.length - 1].x - 5}
                  y={routePixels[routePixels.length - 1].y - 5}
                  width={10}
                  height={10}
                />
                {measureMeters !== null && (
                  (() => {
                    const label = formatKm(measureMeters);
                    const labelWidth = Math.max(52, label.length * 7 + 12);
                    const x = routePixels[routePixels.length - 1].x + 10;
                    const y = routePixels[routePixels.length - 1].y - 18;
                    return (
                      <g className="map-route-label">
                        <rect x={x} y={y} width={labelWidth} height={22} rx={8} ry={8} />
                        <text x={x + 6} y={y + 15}>{label}</text>
                      </g>
                    );
                  })()
                )}
              </g>
            )}
            {!routePixels && measureAnchor && measureMeters !== null && (
              (() => {
                const label = formatKm(measureMeters);
                const labelWidth = Math.max(52, label.length * 7 + 12);
                const x = measureAnchor.end.x + 10;
                const y = measureAnchor.end.y - 18;
                return (
                  <g className="map-route-label">
                    <rect x={x} y={y} width={labelWidth} height={22} rx={8} ry={8} />
                    <text x={x + 6} y={y + 15}>{label}</text>
                  </g>
                );
              })()
            )}
            {measureAnchor && (
              <g>
                <circle className="map-geo-point" cx={measureAnchor.start.x} cy={measureAnchor.start.y} r={5} />
                <circle className="map-geo-point" cx={measureAnchor.end.x} cy={measureAnchor.end.y} r={5} />
              </g>
            )}
            {measureLine && (
              <g>
                <polyline
                  className="map-geo-shape polyline temp"
                  points={`${measureLine.start.x},${measureLine.start.y} ${measureLine.end.x},${measureLine.end.y}`}
                />
                <circle className="map-geo-point" cx={measureLine.start.x} cy={measureLine.start.y} r={5} />
                <circle className="map-geo-point" cx={measureLine.end.x} cy={measureLine.end.y} r={5} />
              </g>
            )}
            {shapes.map((shape) => {
              if (shape.type === "circle") {
                return (
                  <circle
                    key={shape.id}
                    className="map-geo-shape"
                    cx={shape.cx}
                    cy={shape.cy}
                    r={shape.r}
                  />
                );
              }
              if (shape.type === "rect") {
                return (
                  <rect
                    key={shape.id}
                    className="map-geo-shape"
                    x={shape.x}
                    y={shape.y}
                    width={shape.w}
                    height={shape.h}
                  />
                );
              }
              if (shape.type === "polygon") {
                const points = shape.points.map((p) => `${p.x},${p.y}`).join(" ");
                return (
                  <g key={shape.id}>
                    <polygon className="map-geo-shape polygon" points={points} />
                    {shape.points.map((p, index) => (
                      <circle
                        key={`${shape.id}-pt-${index}`}
                        className="map-geo-point"
                        cx={p.x}
                        cy={p.y}
                        r={5}
                        onMouseDown={(event) => handlePointMouseDown(event, shape.id, index, false)}
                      />
                    ))}
                  </g>
                );
              }
              const points = shape.points.map((p) => `${p.x},${p.y}`).join(" ");
              return (
                <g key={shape.id}>
                  <polyline className="map-geo-shape polyline" points={points} />
                  {shape.points.map((p, index) => (
                    <circle
                      key={`${shape.id}-pt-${index}`}
                      className="map-geo-point"
                      cx={p.x}
                      cy={p.y}
                      r={5}
                      onMouseDown={(event) => handlePointMouseDown(event, shape.id, index, false)}
                    />
                  ))}
                </g>
              );
            })}
            {drawingShape?.type === "circle" && (
              <circle className="map-geo-shape temp" cx={drawingShape.cx} cy={drawingShape.cy} r={drawingShape.r} />
            )}
            {drawingShape?.type === "rect" && (
              <rect
                className="map-geo-shape temp"
                x={drawingShape.x}
                y={drawingShape.y}
                width={drawingShape.w}
                height={drawingShape.h}
              />
            )}
            {polyPoints.length > 0 && activeDrawTool === "polygon" && (
              <g>
                <polygon
                  className="map-geo-shape polygon temp"
                  points={polyPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                />
                {polyPoints.map((p, index) => (
                  <circle
                    key={`draft-poly-${index}`}
                    className="map-geo-point"
                    cx={p.x}
                    cy={p.y}
                    r={5}
                    onMouseDown={(event) => handlePointMouseDown(event, "draft", index, true)}
                  />
                ))}
              </g>
            )}
            {polyPoints.length > 0 && activeDrawTool === "polyline" && (
              <g>
                <polyline
                  className="map-geo-shape polyline temp"
                  points={polyPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                />
                {polyPoints.map((p, index) => (
                  <circle
                    key={`draft-line-${index}`}
                    className="map-geo-point"
                    cx={p.x}
                    cy={p.y}
                    r={5}
                    onMouseDown={(event) => handlePointMouseDown(event, "draft", index, true)}
                  />
                ))}
              </g>
            )}
          </svg>
          {queryMode && queryCursor && (
            <div
              className="map-query-cursor"
              style={{ left: queryCursor.x, top: queryCursor.y }}
              aria-hidden="true"
            >
              ?
            </div>
          )}
          {queryMode && queryLoading && queryCursor && (
            <div className="map-query-loading" style={{ left: queryCursor.x, top: queryCursor.y }}>
              Loading…
            </div>
          )}
          {queryMode && queryResult && (
            <div
              className="map-query-popup"
              style={{ left: queryResult.point.x, top: queryResult.point.y }}
            >
              <div className="map-query-title">{queryResult.name}</div>
              <div className="map-query-meta">{queryResult.speed}</div>
            </div>
          )}
        </div>
        {measureMode === "distance" && routeStatus === "loading" && (
          <div className="map-measure-badge" role="status">
            <span>Calculating route…</span>
            <button type="button" onClick={() => setMeasureMode(null)} aria-label="Clear measurement">×</button>
          </div>
        )}
        {measureMode === "distance" && routeStatus === "error" && (
          <div className="map-measure-badge" role="status">
            <span>Route unavailable</span>
            <button type="button" onClick={() => setMeasureMode(null)} aria-label="Clear measurement">×</button>
          </div>
        )}
        {showMapLayers && (
          <div className="map-layers-panel" role="dialog" aria-label="Map layers">
            <div className="map-layers-header">
              <span>Map layers</span>
              <button type="button" className="map-layers-close" onClick={() => setShowMapLayers(false)}>
                ×
              </button>
            </div>
            <div className="map-layers-section">
              <div className="map-layers-row">
                <label>
                  <input
                    type="checkbox"
                    checked={mapLayers.clustering}
                    onChange={(event) =>
                      setMapLayers((current) => ({ ...current, clustering: event.target.checked }))
                    }
                  />
                  Clustering
                </label>
              </div>
              <div className="map-layers-row">
                <label>
                  <input
                    type="checkbox"
                    checked={mapLayers.eventsOnTrail}
                    onChange={(event) =>
                      setMapLayers((current) => ({ ...current, eventsOnTrail: event.target.checked }))
                    }
                  />
                  Events on trail
                </label>
              </div>
              <div className="map-layers-row">
                <label>
                  <input
                    type="checkbox"
                    checked={mapLayers.locationLabels}
                    onChange={(event) =>
                      setMapLayers((current) => ({ ...current, locationLabels: event.target.checked }))
                    }
                  />
                  Location labels
                </label>
              </div>
            </div>
            <div className="map-layers-divider" />
            <div className="map-layers-section">
              <div className="map-layers-subtitle">Asset trail on map</div>
              <label className="map-layers-radio">
                <input
                  type="radio"
                  name="trail-mode"
                  checked={mapLayers.showEntireLastTrip}
                  onChange={() => setMapLayers((current) => ({ ...current, showEntireLastTrip: true }))}
                />
                Show entire last trip
              </label>
              <label className="map-layers-radio">
                <input
                  type="radio"
                  name="trail-mode"
                  checked={!mapLayers.showEntireLastTrip}
                  onChange={() => setMapLayers((current) => ({ ...current, showEntireLastTrip: false }))}
                />
                Show
                <input
                  type="number"
                  min={1}
                  className="map-layers-hours"
                  value={mapLayers.hours}
                  onChange={(event) => setMapLayers((current) => ({ ...current, hours: event.target.value }))}
                />
                hours
              </label>
            </div>
            <div className="map-layers-footer">
              <button type="button" className="map-layers-save" onClick={handleSaveMapLayers}>
                Save
              </button>
            </div>
          </div>
        )}
        <div className="map-attribution">Map preview placeholder</div>
      </section>
      </div>
      {fuelGraph && (
        <div className="locations-modal" role="dialog" aria-modal="true" aria-label="12 hour fuel tachograph">
          <div className="fuel-tacho-card" onClick={(event) => event.stopPropagation()}>
            <div className="locations-card-header">
              <div>
                <div>12h tachograph</div>
                <small>{fuelGraph.asset.assetDescription} · {fuelGraph.asset.registration}</small>
              </div>
              <button
                type="button"
                className="locations-close"
                aria-label="Close"
                onClick={() => setFuelGraph(null)}
              >
                ×
              </button>
            </div>
            <div className="fuel-tacho-body">
              {(() => {
                const fallbackFuel = coerceFuelLitres(fuelGraph.asset.fuelLitres ?? fuelGraph.asset.fuelReading);
                const visiblePoints =
                  fuelGraph.points.length || fallbackFuel === null
                    ? fuelGraph.points
                    : buildStableFuelSeries([
                        { at: fuelGraph.asset.telemetryAt || new Date().toISOString(), value: fallbackFuel }
                      ]);

                if (fuelGraph.status === "loading" && visiblePoints.length === 0) {
                  return <div className="fuel-tacho-empty">Loading fuel history…</div>;
                }
                if (visiblePoints.length === 0) {
                  return <div className="fuel-tacho-empty">{fuelGraph.error ?? "No fuel readings found."}</div>;
                }

                const chart = buildFuelChart(visiblePoints);
                const latest = visiblePoints[visiblePoints.length - 1];
                return (
                  <>
                    <div className="fuel-tacho-summary">
                      <span>Stable fuel line</span>
                      <strong>{formatFuelLitres(latest.value)}</strong>
                      <small>{fuelGraph.rawCount} raw readings · spikes filtered</small>
                    </div>
                    <svg
                      className="fuel-tacho-chart"
                      viewBox={`0 0 ${chart.width} ${chart.height}`}
                      role="img"
                      aria-label="Stable fuel level over the last 12 hours"
                    >
                      <rect x="0" y="0" width={chart.width} height={chart.height} rx="14" />
                      {chart.yTicks.map((tick) => (
                        <g key={tick.value}>
                          <line
                            x1={chart.padding.left}
                            x2={chart.padding.left + chart.plotWidth}
                            y1={tick.y}
                            y2={tick.y}
                          />
                          <text x={chart.padding.left - 10} y={tick.y + 4}>{tick.value.toFixed(0)}</text>
                        </g>
                      ))}
                      {chart.xTicks.map((tick) => (
                        <text key={tick.value} x={tick.x} y={chart.height - 14}>
                          {new Date(tick.value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </text>
                      ))}
                      <path d={chart.path} />
                      {visiblePoints.map((point) => (
                        <circle key={`${point.at}-${point.value}`} cx={chart.x(point.at)} cy={chart.y(point.value)} r="3" />
                      ))}
                    </svg>
                    {fuelGraph.error && <div className="fuel-tacho-note">{fuelGraph.error}</div>}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {showLocationsModal && (
        <div className="locations-modal" role="dialog" aria-modal="true" aria-label="Select locations">
          <div className="locations-card" onClick={(event) => event.stopPropagation()}>
            <div className="locations-card-header">
              <div>Select locations (Max 2500 allowed regardless of number of locations in the database)</div>
              <button
                type="button"
                className="locations-close"
                aria-label="Close"
                onClick={() => setShowLocationsModal(false)}
              >
                ×
              </button>
            </div>
            <input
              className="locations-filter"
              placeholder="Filter"
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
            />
            <div className="locations-table">
              <div className="locations-row locations-head">
                <div />
                <div>Location name</div>
                <div>Site</div>
                <div>Location type</div>
              </div>
              <div className="locations-body">
                {filteredLocations.map((loc) => (
                  <div key={loc.id} className="locations-row">
                    <div>
                      <input
                        type="checkbox"
                        checked={selectedLocations.has(loc.id)}
                        onChange={() => toggleLocation(loc.id)}
                      />
                    </div>
                    <div>{loc.name}</div>
                    <div>{loc.site}</div>
                    <div>{loc.locationType}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="locations-footer">
              <div>{selectedLocations.size}/{locations.length} selected</div>
              <div className="locations-actions">
                <button type="button" className="locations-btn" onClick={() => setShowLocationsModal(false)}>
                  Cancel
                </button>
                <button type="button" className="locations-btn primary" onClick={() => setShowLocationsModal(false)}>
                  Select
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showEventsModal && (
        <div className="locations-modal" role="dialog" aria-modal="true" aria-label="Select events">
          <div className="locations-card" onClick={(event) => event.stopPropagation()}>
            <div className="locations-card-header">
              <div>Select events</div>
              <button
                type="button"
                className="locations-close"
                aria-label="Close"
                onClick={() => setShowEventsModal(false)}
              >
                ×
              </button>
            </div>
            <input
              className="locations-filter"
              placeholder="Filter"
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
            />
            <div className="locations-table">
              <div className="locations-row locations-head">
                <div />
                <div>Event name</div>
                <div>Notification Type</div>
                <div />
              </div>
              <div className="locations-body">
                {filteredEvents.map((evt) => (
                  <div key={evt.id} className="locations-row">
                    <div>
                      <input
                        type="checkbox"
                        checked={selectedEvents.has(evt.id)}
                        onChange={() => toggleEvent(evt.id)}
                      />
                    </div>
                    <div>{evt.name}</div>
                    <div>{evt.eventType}</div>
                    <div />
                  </div>
                ))}
              </div>
            </div>
            <div className="locations-footer">
              <div>{selectedEvents.size}/{events.length} selected</div>
              <div className="locations-actions">
                <button type="button" className="locations-btn" onClick={() => setShowEventsModal(false)}>
                  Cancel
                </button>
                <button type="button" className="locations-btn primary" onClick={() => setShowEventsModal(false)}>
                  Select
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showAssetsModal && (
        <div className="locations-modal" role="dialog" aria-modal="true" aria-label="Select multiple assets">
          <div className="locations-card assets-card" onClick={(event) => event.stopPropagation()}>
            <div className="locations-card-header">
              <div>Select multiple assets to follow in a new window</div>
              <button
                type="button"
                className="locations-close"
                aria-label="Close"
                onClick={() => setShowAssetsModal(false)}
              >
                ×
              </button>
            </div>
            <input
              className="locations-filter"
              placeholder="Filter"
              value={assetsFilter}
              onChange={(event) => setAssetsFilter(event.target.value)}
            />
            <div className="locations-table assets-table">
              <div className="locations-row locations-head assets-row">
                <div />
                <div>Asset description</div>
                <div>Registration</div>
                <div>Fleet number</div>
                <div>Site</div>
              </div>
              <div className="locations-body">
                {filteredAssets.map((asset) => (
                  <div key={asset.id} className="locations-row assets-row">
                    <div>
                      <input
                        type="checkbox"
                        checked={selectedAssets.has(asset.id)}
                        onChange={() => toggleAsset(asset.id)}
                      />
                    </div>
                    <div>{asset.assetDescription}</div>
                    <div>{asset.registration}</div>
                    <div>{asset.fleetNumber}</div>
                    <div>{asset.site}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="locations-footer">
              <div>{selectedAssets.size}/{assetRows.length} selected</div>
              <div className="locations-actions">
                <button type="button" className="locations-btn" onClick={() => setShowAssetsModal(false)}>
                  Cancel
                </button>
                <button type="button" className="locations-btn primary" onClick={() => setShowAssetsModal(false)}>
                  Select
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function statusDot(status: AssetRow["status"]) {
  return <span className={`status-dot status-${status}`} />;
}
