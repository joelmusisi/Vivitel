import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../mapStyles";
import ScheduleDateTimePicker from "../components/ScheduleDateTimePicker";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useNavigate } from "react-router-dom";
import MapDistanceMeasure from "../components/MapDistanceMeasure";
import { MapZoomControls } from "../components/MapZoomControls";
import VTLoader from "../components/VTLoader";
import SortableColumnHeader from "../components/SortableColumnHeader";
import { useColumnSort } from "../hooks/useColumnSort";
import "react-datepicker/dist/react-datepicker.css";
import {
  buildApiUrl,
  getApiKey,
  getTenantId,
  getAssetsFromApi,
  getAssetsFromApiForTenant,
  getTraccarDevices,
  getTraccarDevicesDetailed,
  getTraccarEvents,
  getTraccarRoute,
  getTraccarTrips,
  getHierarchy,
  getSiteTimeZoneSettings,
  SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT,
  formatTimestampForSite,
  getBindings,
  type SiteTimeZoneSettings,
  type HierarchyRoot
} from "../utils/api";
import { mapPool } from "../utils/traccarNotificationLibrarySync";
import { TRAIL_POINT_INTERVAL_MS } from "../utils/trailSampling";
import { tripStartFlagIcon } from "../utils/tripStartFlagIcon";
import {
  extractNotificationLabelsFromPayload,
  hasVideoEnabledNotification,
  loadVideoEnabledNotificationNames
} from "../utils/notificationVideo";
import {
  assetSiteMatchesHierarchySite,
  matchesStoredSiteSelection,
  readStoredSelectionScope,
  resolveAssetSiteName
} from "../utils/selectionScope";
import { resolveAssetDriverName, resolveTripDriverName } from "../utils/assetDriver";
import { activateSiteContext } from "../utils/tenantContext";
import { loadScopedAssets } from "../utils/homeScopedDevices";
import { filterRecordsForActiveSelection } from "../utils/scopeStorage";
import {
  clearActiveAssetPrefs,
  clearUserPref,
  readUserPref,
  USER_PREF_KEYS,
  writeActiveAssetPrefs,
  writeUserPref
} from "../utils/userAppPrefs";
import {
  loadBoundNotificationOptionsForSite,
  NOTIFICATION_LIBRARY_UPDATED_EVENT,
  readActiveSiteName
} from "../utils/notificationLibraryStore";
import {
  cms808HierarchyActive,
  cms808MatchesAsset,
  cms808SiteName,
  CMS808_KNOWN_VEHICLE,
  loadCms808PlaybackTrail,
  loadCms808TrackRange,
  loadCms808VehiclesForActiveHierarchy,
  mapCms808TracksToTrailPoints,
  resolveCms808DeviceId
} from "../utils/cms808";
import { isCms808Server } from "../utils/regionServers";
import {
  buildTrailNotificationTriangleIcon,
  mapTraccarEventsToTrailNotifications,
  matchNotificationToTrailPoint,
  notificationEventAtMs
} from "../utils/trailNotificationMarker";
import "../index.css";

type HistoryAssetRow = {
  id: string;
  registration: string;
  assetDescription: string;
  site?: string;
  totalDistance: string;
  events: number;
  hasTrips: boolean;
  hasEvents: boolean;
  trips: HistoryTrip[];
};

type HistoryTrip = {
  id: string;
  start: string;
  end: string;
  startIso: string;
  endIso: string;
  site?: string;
  duration: string;
  distanceKm: string;
  maxSpeed: string;
  events: HistoryTripEvent[];
  notifications: string[];
  assetId?: string;
};

type HistoryTripEvent = {
  id: string;
  notificationName: string;
  startIso: string;
  endIso: string;
  site?: string;
  eventValue: string;
  location: string;
  driver: string;
  registration: string;
  lat?: number;
  lng?: number;
};

type HistoryTrailPoint = {
  lat: number;
  lng: number;
  atMs: number;
  speedKph?: number;
  location?: string;
  driver?: string;
  registration?: string;
  site?: string;
};

type HistoryTrailSample = {
  lat: number;
  lng: number;
  atMs: number;
  moving: boolean;
  ignitionOn: boolean;
  speedKph?: number;
  location?: string;
  driver?: string;
  registration?: string;
  site?: string;
};

type HistoryVideoTrailEvent = {
  lat: number;
  lng: number;
  atMs: number;
  labels: string[];
};

type SelectAssetOption = {
  id: string;
  name: string;
  imei: string;
  registration?: string;
  database?: string;
  site?: string;
  traccarDeviceId?: number;
};

const mapSelectAssetOptions = (rawAssets: any[]): SelectAssetOption[] =>
  (rawAssets ?? []).map((a: any) => {
    const labels = resolveHistoryAssetLabels(a);
    return {
      id: String(a.id ?? a.assetId ?? ""),
      name: labels.assetDescription !== "—" ? labels.assetDescription : String(a.assetDescription ?? a.name ?? a.registration ?? "Unknown"),
      imei: String(a.imei ?? labels.imei ?? ""),
      registration: labels.registration !== "—" ? labels.registration : String(a.registration ?? a.plate ?? ""),
      database: String(a.database ?? a.contact ?? ""),
      site: resolveAssetSiteName(a),
      traccarDeviceId: a.traccarDeviceId ? Number(a.traccarDeviceId) : undefined
    };
  });

const normalizeSelectSiteName = (value: unknown) => String(value ?? "").trim().toLowerCase();

/** Keep select-picker / hydrate lists on the active database's sites (exact hierarchy match). */
const filterSelectAssetsForDatabaseSites = (
  assets: SelectAssetOption[],
  options?: { databaseName?: string; siteNames?: string[] }
): SelectAssetOption[] => {
  const databaseName = String(options?.databaseName ?? "").trim().toLowerCase();
  const siteNames = (options?.siteNames ?? []).map((name) => String(name ?? "").trim()).filter(Boolean);
  if (!databaseName && siteNames.length === 0) return assets;

  return assets.filter((asset) => {
    const assetDatabase = String(asset.database ?? "").trim().toLowerCase();
    const assetSite = resolveAssetSiteName(asset);
    if (!assetSite) return false;
    if (databaseName && assetDatabase && assetDatabase !== databaseName) return false;
    if (siteNames.length === 0) return true;
    return siteNames.some((siteName) => assetSiteMatchesHierarchySite(assetSite, siteName));
  });
};

const buildSelectAssetLabel = (asset: Partial<SelectAssetOption> & Record<string, unknown>) => {
  const desc = String(asset?.name ?? asset?.assetDescription ?? asset?.description ?? "").trim();
  const reg = String(asset?.registration ?? "").trim();
  if (desc && reg && desc.toLowerCase() !== reg.toLowerCase()) return `${desc} - ${reg}`;
  return reg || desc || String(asset?.id ?? asset?.assetId ?? asset?.imei ?? "").trim();
};

const enrichSelectHierarchyWithAssets = (
  hierarchy: HierarchyRoot,
  target: { dealerId?: string | null; orgId?: string | null; dbId?: string | null },
  rawAssets: any[]
): HierarchyRoot => {
  const dealerId = String(target.dealerId ?? "").trim();
  const orgId = String(target.orgId ?? "").trim();
  const dbId = String(target.dbId ?? "").trim();
  if (!dealerId || !orgId || !dbId) return hierarchy;

  const grouped = new Map<string, string[]>();
  for (const asset of rawAssets ?? []) {
    const label = buildSelectAssetLabel(asset);
    if (!label) continue;
    const siteName = normalizeSelectSiteName(resolveAssetSiteName(asset)) || "default";
    const current = grouped.get(siteName) ?? [];
    current.push(label);
    grouped.set(siteName, current);
  }

  for (const [siteName, labels] of grouped.entries()) {
    grouped.set(siteName, Array.from(new Set(labels.map((label) => String(label ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)));
  }

  return {
    ...hierarchy,
    dealers: (hierarchy.dealers ?? []).map((dealer: any) => {
      if (String(dealer?.id ?? "") !== dealerId) return dealer;
      return {
        ...dealer,
        organisations: (dealer.organisations ?? []).map((organisation: any) => {
          if (String(organisation?.id ?? "") !== orgId) return organisation;
          return {
            ...organisation,
            databases: (organisation.databases ?? []).map((database: any) => {
              if (String(database?.id ?? "") !== dbId) return database;
              return {
                ...database,
                sites: (database.sites ?? []).map((site: any) => {
                  const siteKey = normalizeSelectSiteName(site?.name);
                  return { ...site, assets: grouped.get(siteKey) ?? [] };
                })
              };
            })
          };
        })
      };
    })
  };
};

const resolveHistoryAssetScope = (options?: {
  scope?: string;
  assetLabel?: string;
  selectedPath?: string;
  contextType?: string;
}) => {
  const scope = String(options?.scope ?? "").trim().toLowerCase();
  const assetText = String(options?.assetLabel ?? "").trim();
  const pathParts = String(options?.selectedPath ?? "")
    .split("/")
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);

  // Explicit non-asset scopes always win — never re-lock onto a leftover vehicle.
  if (scope === "site" || scope === "db" || scope === "org" || scope === "dealer" || scope === "organisation" || scope === "database") {
    return { scope: scope === "organisation" ? "org" : scope === "database" ? "db" : scope, keepAsset: false, pathParts };
  }

  if (scope === "asset" && assetText) {
    return { scope: "asset" as const, keepAsset: true, pathParts };
  }

  return { scope: scope || "site", keepAsset: false, pathParts };
};

const buildHistorySelectionLabel = (selectedPath: string, assetLabel: string, scope: string, contextName: string) => {
  const pathText = String(selectedPath ?? "").trim();
  const assetText = String(assetLabel ?? "").trim();
  const scopeText = String(scope ?? "").trim().toLowerCase();
  const contextText = String(contextName ?? "").trim();
  const isAssetScope = scopeText === "asset";

  if (pathText) {
    const pathParts = pathText
      .split("/")
      .map((part) => String(part ?? "").trim())
      .filter(Boolean);
    if (isAssetScope && assetText) {
      const lastPart = pathParts[pathParts.length - 1] ?? "";
      if (lastPart.toLowerCase() !== assetText.toLowerCase()) pathParts.push(assetText);
    } else {
      // Non-asset scopes: drop a trailing vehicle label if one was previously appended.
      if (assetText) {
        const lastPart = pathParts[pathParts.length - 1] ?? "";
        if (lastPart.toLowerCase() === assetText.toLowerCase()) pathParts.pop();
      }
    }
    return pathParts.join(" / ");
  }
  if (isAssetScope && assetText) return assetText;
  if (contextText) return contextText;
  return "";
};

const clearHistoryAssetSelectionStorage = (_scopedKey?: (base: string, tenantIdOverride?: string) => string, tenantId?: string) => {
  clearActiveAssetPrefs(tenantId);
};

type SelectedTripOnMap = {
  assetId: string;
  trip: HistoryTrip;
};

type HistoryColumnKey = "events" | "registration" | "assetDescription" | "totalDistance";

type HistoryColumn = {
  key: HistoryColumnKey;
  label: string;
  minWidth: number;
};

const defaultHistoryColumns: HistoryColumn[] = [
  { key: "events", label: "Notifications", minWidth: 110 },
  { key: "registration", label: "Registration", minWidth: 120 },
  { key: "assetDescription", label: "Asset Description", minWidth: 180 },
  { key: "totalDistance", label: "Total Distance (km)", minWidth: 140 }
];

const defaultHistoryColumnOrder: HistoryColumnKey[] = [
  "events",
  "registration",
  "assetDescription",
  "totalDistance"
];

const normalizeHistoryColumnOrder = (keys: unknown): HistoryColumnKey[] => {
  const allowed = new Set(defaultHistoryColumns.map((col) => col.key));
  const parsed = Array.isArray(keys)
    ? keys.filter((key): key is HistoryColumnKey => typeof key === "string" && allowed.has(key as HistoryColumnKey))
    : [];
  const unique = Array.from(new Set(parsed));
  for (const key of defaultHistoryColumnOrder) {
    if (!unique.includes(key)) unique.push(key);
  }
  return unique.length > 0 ? unique : [...defaultHistoryColumnOrder];
};

const toTitleCase = (value: string) =>
  String(value ?? "")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const videoRecordedIcon = L.icon({
  iconUrl: `data:image/svg+xml;base64,${btoa(`<svg width='28' height='28' viewBox='0 0 28 28' xmlns='http://www.w3.org/2000/svg'><circle cx='14' cy='14' r='12' fill='#b91c1c' stroke='#fff' stroke-width='2'/><path d='M9 11.5a2.5 2.5 0 0 1 2.5-2.5h4A2.5 2.5 0 0 1 18 11.5v5a2.5 2.5 0 0 1-2.5 2.5h-4A2.5 2.5 0 0 1 9 16.5z' fill='none' stroke='#fff' stroke-width='1.8'/><path d='M18 12.5l3-1.8v6.6l-3-1.8z' fill='none' stroke='#fff' stroke-width='1.8' stroke-linejoin='round'/></svg>`)}`,
  iconSize: [28, 28],
  iconAnchor: [14, 24],
  popupAnchor: [0, -22]
});

type HistoryAssetDerived = HistoryAssetRow & {
  tripsInRange: HistoryTrip[];
  eventsInRange: number;
  hasTripsInRange: boolean;
  hasEventsInRange: boolean;
};

type HistoryMapAsset = {
  id: string;
  name: string;
  assetDescription?: string;
  registration: string;
  site: string;
  lastLocation?: string;
  lastPosition: string;
  driver: string;
  speed: string;
  heading: string;
  ignition: string;
  fuel: string;
  status?: "live" | "offline" | "parked";
  lat: number;
  lng: number;
};

const defaultHistoryAssets: HistoryAssetRow[] = [];

const historyMapCenter: [number, number] = [0.55, 32.45];

const defaultHistoryMapAssets: HistoryMapAsset[] = [];

const headingToDegrees = (heading: string) => {
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
  const num = parseFloat(speed.replace(/[^0-9.]/g, ""));
  return Number.isNaN(num) ? 0 : num;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

const DEFAULT_MAX_REASONABLE_SPEED_KPH = 220;

const clampReasonableSpeedKph = (value: unknown, maxReasonableSpeedKph: number = DEFAULT_MAX_REASONABLE_SPEED_KPH): number => {
  const numeric = toFiniteNumber(value) ?? 0;
  return Math.min(maxReasonableSpeedKph, Math.max(0, numeric));
};

const normalizeTripDistanceKm = (
  rawDistance: number,
  startMs: number,
  endMs: number,
  maxReasonableSpeedKph: number
): number => {
  if (!Number.isFinite(rawDistance) || rawDistance <= 0) return 0;

  // Traccar trips often return meters; values >= 1000 are safely treated as meters.
  if (rawDistance >= 1000) return rawDistance / 1000;

  // Decimal sub-1000 values are commonly already in km.
  if (!Number.isInteger(rawDistance)) return rawDistance;

  // For ambiguous integer values < 1000, choose the interpretation with plausible average speed.
  const durationHours = Math.max(0, endMs - startMs) / 3_600_000;
  if (durationHours <= 0) return rawDistance;
  const asKmAvg = rawDistance / durationHours;
  const asMetersAvg = (rawDistance / 1000) / durationHours;
  if (asKmAvg > maxReasonableSpeedKph * 1.3 && asMetersAvg <= maxReasonableSpeedKph * 1.3) {
    return rawDistance / 1000;
  }

  return rawDistance;
};

const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const n =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(Math.min(1, n)));
};

/** Sum path length from ordered GPS samples; skip jumps that look like GPS glitches. */
const routeDistanceKmFromPoints = (
  points: Array<{ lat: number; lng: number }>
): number => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!Number.isFinite(prev.lat) || !Number.isFinite(prev.lng) || !Number.isFinite(curr.lat) || !Number.isFinite(curr.lng)) {
      continue;
    }
    const step = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
    if (step > 0 && step < 50) total += step;
  }
  return total;
};

const toImei = (value: unknown): string => {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.length < 14 || digits.length > 17) return "";
  return digits;
};

/** True when a display label is just an IMEI (not a plate / description). */
const isImeiLikeLabel = (value: unknown): boolean => {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const digits = text.replace(/\D+/g, "");
  return digits.length >= 14 && digits.length <= 17 && digits === text.replace(/[\s-]/g, "");
};

const pickNonImeiLabel = (...candidates: unknown[]): string => {
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (!text || text === "—" || text.toLowerCase() === "unknown") continue;
    if (isImeiLikeLabel(text)) continue;
    return text;
  }
  return "";
};

const resolveHistoryAssetLabels = (
  match: Record<string, unknown> | null | undefined,
  options?: {
    selectedRegistration?: string;
    selectedAsset?: string;
    imei?: string;
    traccarName?: string;
  }
): { imei: string; registration: string; assetDescription: string } => {
  const imei = toImei(
    match?.imei ?? match?.uniqueId ?? options?.imei ?? ""
  );
  const registration =
    pickNonImeiLabel(
      match?.registration,
      match?.plate,
      match?.numberPlate,
      match?.vehicleRegistration,
      options?.selectedRegistration
    )
    || pickNonImeiLabel(
      match?.assetDescription,
      match?.description,
      match?.name,
      options?.traccarName,
      options?.selectedAsset
    )
    || "—";
  const assetDescription =
    pickNonImeiLabel(
      match?.assetDescription,
      match?.description,
      match?.name,
      options?.traccarName,
      options?.selectedAsset
    )
    || (registration !== "—" ? registration : "—");
  return { imei, registration, assetDescription };
};

/** Traccar position/trip speed is knots; convert to km/h. Values already in km/h stay as-is when clearly > knot range for the same magnitude. */
const traccarSpeedToKph = (value: unknown, maxReasonableSpeedKph: number): number => {
  const raw = toFiniteNumber(value) ?? 0;
  if (raw <= 0) return 0;
  // Heuristic: Traccar reports knots; typical road speeds in knots are < ~120.
  const asKnots = raw * 1.852;
  if (asKnots <= maxReasonableSpeedKph) {
    return clampReasonableSpeedKph(asKnots, maxReasonableSpeedKph);
  }
  return clampReasonableSpeedKph(raw, maxReasonableSpeedKph);
};

const cardinalFromDegrees = (degrees: number): string => {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  return dirs[index] ?? "N";
};

const formatHistoryDate = (value: unknown, site: unknown, siteTimeZones: SiteTimeZoneSettings | null): string => {
  return formatTimestampForSite(value, site, siteTimeZones);
};

const toLocalDateTimeInputValue = (value: Date): string => {
  const date = new Date(value);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toValidHistoryDateTimeLocal = (value: unknown, fallback: string): string => {
  const text = String(value ?? "").trim();
  if (!text || /^\d{1,6}$/.test(text)) return fallback;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    const parsedLocal = Date.parse(text);
    if (Number.isFinite(parsedLocal)) {
      const now = Date.now();
      const min = Date.UTC(2015, 0, 1);
      const max = now + 1000 * 60 * 60 * 24;
      if (parsedLocal >= min && parsedLocal <= max) return text;
    }
    return fallback;
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return fallback;
  const now = Date.now();
  const min = Date.UTC(2015, 0, 1);
  const max = now + 1000 * 60 * 60 * 24;
  if (parsed < min || parsed > max) return fallback;
  return toLocalDateTimeInputValue(new Date(parsed));
};

const toValidIsoOrFallback = (value: unknown, fallbackMs: number): string => {
  const text = String(value ?? "").trim();
  if (!text || /^\d{1,6}$/.test(text)) return new Date(fallbackMs).toISOString();
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    const now = Date.now();
    const min = Date.UTC(2015, 0, 1);
    const max = now + 1000 * 60 * 60 * 24;
    if (parsed >= min && parsed <= max) return new Date(parsed).toISOString();
  }
  return new Date(fallbackMs).toISOString();
};

const isTransientHistoryFailure = (reason: string): boolean => {
  const text = String(reason ?? "").trim().toLowerCase();
  if (!text) return false;
  return /\b(522|520|521|523|524|504|503|502)\b/.test(text)
    || text.includes("timed out")
    || text.includes("timeout")
    || text.includes("failed to fetch")
    || text.includes("fetch failed")
    || text.includes("network");
};

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const INVALID_DRIVER_VALUES = new Set(["", "-", "--", "—", "_", "n/a", "na", "none", "null", "undefined", "unknown"]);

const formatDriverName = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!INVALID_DRIVER_VALUES.has(text.toLowerCase())) return text;
  }
  return "No Driver";
};

const parseIgnition = (data: any): string => {
  const raw = data?.ignition ?? data?.data?.ignition ?? data?.io?.ignition ?? data?.data?.io?.ignition;
  if (typeof raw === "boolean") return raw ? "On" : "Off";
  if (typeof raw === "number") return raw > 0 ? "On" : "Off";
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return "—";
  return ["true", "on", "1", "yes", "active"].includes(text) ? "On" : "Off";
};

const parseStatus = (speed: number, ignition: string): "live" | "offline" | "parked" => {
  if (speed > 1) return "live";
  if (ignition === "On") return "parked";
  return "offline";
};

const parseEventTimestampMs = (value: unknown): number => {
  const ms = Date.parse(String(value ?? "").trim());
  return Number.isFinite(ms) ? ms : Date.now();
};

const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360;

const trailBearingDegrees = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const deltaLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return normalizeDegrees(bearing);
};

const buildTrailArrowIcon = (headingDeg: number) =>
  L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;transform:rotate(${headingDeg.toFixed(1)}deg);"><svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8 1 L14 15 L8 12 L2 15 Z" fill="#0f172a" fill-opacity="0.85" stroke="#ffffff" stroke-width="1"/></svg></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });

const HISTORY_REPLAY_SPEED_OPTIONS = [1, 2, 5, 10, 20] as const;
const HISTORY_REPLAY_MAX_STEP_MS = 15_000;

type HistoryReplayMetrics = {
  totalDistanceKm: number;
  totalDurationMs: number;
  startMs: number;
  endMs: number;
  cumulativeDistanceKm: number[];
};

const compressHistoryReplayTrail = (points: HistoryTrailPoint[]): HistoryTrailPoint[] => {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.atMs - b.atMs);
  let cursor = sorted[0].atMs;
  return sorted.map((point, index) => {
    if (index === 0) return point;
    const rawGap = Math.max(0, point.atMs - sorted[index - 1].atMs);
    cursor += Math.max(200, Math.min(rawGap, HISTORY_REPLAY_MAX_STEP_MS));
    return { ...point, atMs: cursor };
  });
};

const buildHistoryReplayMetrics = (trail: HistoryTrailPoint[]): HistoryReplayMetrics | null => {
  if (trail.length < 2) return null;
  const sorted = [...trail].sort((a, b) => a.atMs - b.atMs);
  const cumulativeDistanceKm = [0];
  let totalDistanceKm = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    totalDistanceKm += haversineKm(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
    cumulativeDistanceKm.push(totalDistanceKm);
  }
  return {
    totalDistanceKm,
    totalDurationMs: Math.max(0, sorted[sorted.length - 1].atMs - sorted[0].atMs),
    startMs: sorted[0].atMs,
    endMs: sorted[sorted.length - 1].atMs,
    cumulativeDistanceKm
  };
};

const interpolateHistoryTrailAtMs = (
  trail: HistoryTrailPoint[],
  atMs: number
): { lat: number; lng: number; heading: number } | null => {
  if (trail.length < 2) return null;
  if (atMs <= trail[0].atMs) {
    return { lat: trail[0].lat, lng: trail[0].lng, heading: trailBearingDegrees(trail[0], trail[1]) };
  }
  const last = trail[trail.length - 1];
  if (atMs >= last.atMs) {
    const prev = trail[trail.length - 2] ?? last;
    return { lat: last.lat, lng: last.lng, heading: trailBearingDegrees(prev, last) };
  }
  for (let i = 1; i < trail.length; i += 1) {
    const to = trail[i];
    if (atMs > to.atMs) continue;
    const from = trail[i - 1];
    const span = to.atMs - from.atMs;
    const t = span > 0 ? (atMs - from.atMs) / span : 0;
    return {
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
      heading: trailBearingDegrees(from, to)
    };
  }
  return null;
};

const distanceKmAtHistoryTrailMs = (trail: HistoryTrailPoint[], cumulativeDistanceKm: number[], atMs: number) => {
  if (trail.length < 2 || cumulativeDistanceKm.length !== trail.length) return 0;
  if (atMs <= trail[0].atMs) return 0;
  const lastIndex = trail.length - 1;
  if (atMs >= trail[lastIndex].atMs) return cumulativeDistanceKm[lastIndex] ?? 0;
  for (let i = 1; i < trail.length; i += 1) {
    const to = trail[i];
    if (atMs > to.atMs) continue;
    const from = trail[i - 1];
    const span = to.atMs - from.atMs;
    const t = span > 0 ? (atMs - from.atMs) / span : 0;
    const fromKm = cumulativeDistanceKm[i - 1] ?? 0;
    const toKm = cumulativeDistanceKm[i] ?? fromKm;
    return fromKm + (toKm - fromKm) * t;
  }
  return 0;
};

const buildHistoryTraveledPositions = (trail: HistoryTrailPoint[], atMs: number): [number, number][] => {
  if (trail.length < 2) return [];
  const positions: [number, number][] = [];
  for (const point of trail) {
    if (point.atMs > atMs) break;
    positions.push([point.lat, point.lng]);
  }
  const interpolated = interpolateHistoryTrailAtMs(trail, atMs);
  if (!interpolated) return positions.length >= 2 ? positions : [];
  const last = positions[positions.length - 1];
  if (!last || Math.abs(last[0] - interpolated.lat) > 0.000001 || Math.abs(last[1] - interpolated.lng) > 0.000001) {
    positions.push([interpolated.lat, interpolated.lng]);
  }
  return positions;
};

const formatReplayDurationMs = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const buildHistoryReplayIcon = (headingDeg: number) =>
  L.divIcon({
    className: "history-replay-vehicle",
    html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 3px 6px rgba(15,23,42,0.35));transform:rotate(${headingDeg.toFixed(1)}deg);">
      <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="15.5" fill="#ffffff" stroke="#2563eb" stroke-width="2.6"/>
        <path d="M20 6 L26 18 L20 15.4 L14 18 Z" fill="#1d4ed8" stroke="#ffffff" stroke-width="1"/>
        <rect x="11.5" y="19.2" width="9.2" height="5.2" rx="1.2" fill="#2563eb"/>
        <path d="M20.6 19.6h4.2l1.9 2.6v2.2h-6.1z" fill="#3b82f6"/>
        <circle cx="14.4" cy="26.2" r="1.7" fill="#1e3a8a"/>
        <circle cx="25.4" cy="26.2" r="1.7" fill="#1e3a8a"/>
      </svg>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });

const isMovingHistorySample = (data: any, speedNum: number): boolean => {
  if (Number.isFinite(speedNum) && speedNum > 0) return true;
  const movement = String(data?.movement ?? data?.data?.movement ?? "").trim().toLowerCase();
  if (movement === "moving") return true;
  const ignition = parseIgnition(data);
  return ignition === "On";
};

const buildMovingTrail = (samples: HistoryTrailSample[]): HistoryTrailPoint[] => {
  const sorted = [...samples].sort((a, b) => a.atMs - b.atMs);
  const out: HistoryTrailPoint[] = [];
  let lastPlottedAt = Number.NEGATIVE_INFINITY;
  for (const sample of sorted) {
    if (!Number.isFinite(sample.atMs)) continue;
    if (sample.atMs - lastPlottedAt < TRAIL_POINT_INTERVAL_MS) continue;
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.lat - sample.lat) < 0.000001 && Math.abs(prev.lng - sample.lng) < 0.000001) continue;
    out.push({
      lat: sample.lat,
      lng: sample.lng,
      atMs: sample.atMs,
      speedKph: sample.speedKph,
      location: sample.location,
      driver: sample.driver,
      registration: sample.registration,
      site: sample.site
    });
    lastPlottedAt = sample.atMs;
  }
  return out;
};

const buildTrailFromRoutePoints = (
  routePoints: Array<{
    latitude?: number;
    longitude?: number;
    speed?: number;
    fixTime?: string;
    deviceTime?: string;
    serverTime?: string;
    address?: string | null;
    attributes?: Record<string, unknown>;
  }>,
  meta: { registration: string; site: string; driver?: string }
): HistoryTrailPoint[] => {
  const samples: HistoryTrailSample[] = routePoints.flatMap((point) => {
    const atMs = Date.parse(String(point.fixTime ?? point.deviceTime ?? point.serverTime ?? ""));
    if (!Number.isFinite(atMs)) return [];
    const lat = Number(point.latitude);
    const lng = Number(point.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const speedKph = Number(point.speed ?? 0) * 1.852;
    return [{
      lat,
      lng,
      atMs,
      moving: speedKph > 1,
      ignitionOn: speedKph > 1,
      speedKph,
      location: String(point.address ?? "").trim() || undefined,
      driver: meta.driver ?? "No Driver",
      registration: meta.registration,
      site: meta.site
    }];
  });
  const movingTrail = buildMovingTrail(samples);
  if (movingTrail.length >= 2) return movingTrail;
  return samples
    .sort((a, b) => a.atMs - b.atMs)
    .map((sample) => ({
      lat: sample.lat,
      lng: sample.lng,
      atMs: sample.atMs,
      speedKph: sample.speedKph,
      location: sample.location,
      driver: sample.driver,
      registration: sample.registration,
      site: sample.site
    }))
    .filter((point, index, list) => {
      const prev = list[index - 1];
      if (!prev) return true;
      return !(Math.abs(prev.lat - point.lat) < 0.000001 && Math.abs(prev.lng - point.lng) < 0.000001);
    });
};

const buildTripStartFlagsFromTrips = (tripStartMsList: number[], samples: HistoryTrailSample[]): HistoryTrailPoint[] => {
  const sortedSamples = [...samples]
    .filter((sample) => Number.isFinite(sample.atMs))
    .sort((a, b) => a.atMs - b.atMs);
  if (sortedSamples.length === 0 || tripStartMsList.length === 0) return [];

  const flags: HistoryTrailPoint[] = [];
  const dedupe = new Set<string>();

  for (const tripStartMs of tripStartMsList) {
    if (!Number.isFinite(tripStartMs)) continue;
    let best = sortedSamples[0];
    let bestDelta = Math.abs(best.atMs - tripStartMs);
    for (const sample of sortedSamples) {
      const delta = Math.abs(sample.atMs - tripStartMs);
      if (delta < bestDelta) {
        best = sample;
        bestDelta = delta;
      }
      if (sample.atMs > tripStartMs && delta > bestDelta) break;
    }
    const key = `${best.lat.toFixed(6)}:${best.lng.toFixed(6)}:${Math.round(best.atMs / 1000)}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    flags.push({ lat: best.lat, lng: best.lng, atMs: best.atMs });
  }

  return flags.sort((a, b) => a.atMs - b.atMs);
};

const buildTripStartFlags = (samples: HistoryTrailSample[]): HistoryTrailPoint[] => {
  const sorted = [...samples].sort((a, b) => a.atMs - b.atMs);
  const out: HistoryTrailPoint[] = [];
  const pushFlag = (sample: HistoryTrailSample) => {
    const last = out[out.length - 1];
    if (
      last
      && Math.abs(last.lat - sample.lat) < 0.00005
      && Math.abs(last.lng - sample.lng) < 0.00005
      && Math.abs(last.atMs - sample.atMs) < 60_000
    ) {
      return;
    }
    out.push({
      lat: sample.lat,
      lng: sample.lng,
      atMs: sample.atMs,
      speedKph: sample.speedKph,
      location: sample.location,
      driver: sample.driver,
      registration: sample.registration,
      site: sample.site
    });
  };
  let prevIgnitionOn = false;
  let inMotion = false;
  let lastMovingMs = Number.NaN;
  let lastSampleMs = Number.NaN;
  for (const sample of sorted) {
    const moving = historySampleIsMoving(sample);
    const gapMs = Number.isFinite(lastSampleMs) ? sample.atMs - lastSampleMs : Number.POSITIVE_INFINITY;
    if (sample.ignitionOn && !prevIgnitionOn) pushFlag(sample);
    if (moving) {
      if (!inMotion || gapMs > HISTORY_TRIP_GAP_MS) pushFlag(sample);
      inMotion = true;
      lastMovingMs = sample.atMs;
    } else if (inMotion && Number.isFinite(lastMovingMs) && sample.atMs - lastMovingMs > HISTORY_TRIP_PARK_MS) {
      inMotion = false;
    }
    if (gapMs > HISTORY_TRIP_GAP_MS) inMotion = moving;
    prevIgnitionOn = sample.ignitionOn;
    lastSampleMs = sample.atMs;
  }
  return out;
};

const formatDuration = (startIso: string, endIso: string): string => {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "0:00:00";
  const total = Math.floor((end - start) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const HISTORY_TRIP_PARK_MS = 5 * 60 * 1000;
const HISTORY_TRIP_GAP_MS = 20 * 60 * 1000;
const HISTORY_TRIP_MIN_DISTANCE_KM = 0.05;
const HISTORY_TRIP_MOVING_SPEED_KPH = 1;
const HISTORY_SUMMARIZED_TRIP_MS = 12 * 60 * 60 * 1000;

const historySampleIsMoving = (sample: HistoryTrailSample): boolean =>
  (Number(sample.speedKph) || 0) > HISTORY_TRIP_MOVING_SPEED_KPH;

type HistoryTripWindow = {
  startMs: number;
  endMs: number;
  samples: HistoryTrailSample[];
};

const splitTrailSamplesIntoTripWindows = (samples: HistoryTrailSample[]): HistoryTripWindow[] => {
  const sorted = [...samples]
    .filter((sample) => Number.isFinite(sample.atMs) && Number.isFinite(sample.lat) && Number.isFinite(sample.lng))
    .sort((a, b) => a.atMs - b.atMs);
  if (sorted.length === 0) return [];

  const windows: HistoryTripWindow[] = [];
  let current: HistoryTripWindow | null = null;
  let lastMovingMs = Number.NaN;

  const closeCurrent = () => {
    if (!current) return;
    const distanceKm = routeDistanceKmFromPoints(current.samples);
    const durationMs = Math.max(0, current.endMs - current.startMs);
    const hadMotion = current.samples.some(historySampleIsMoving);
    if (hadMotion && (distanceKm >= HISTORY_TRIP_MIN_DISTANCE_KM || durationMs >= 60_000)) {
      windows.push(current);
    }
    current = null;
    lastMovingMs = Number.NaN;
  };

  for (const sample of sorted) {
    const moving = historySampleIsMoving(sample);
    if (!current) {
      if (!moving) continue;
      current = { startMs: sample.atMs, endMs: sample.atMs, samples: [sample] };
      lastMovingMs = sample.atMs;
      continue;
    }

    const gapMs = sample.atMs - current.endMs;
    if (gapMs > HISTORY_TRIP_GAP_MS) {
      closeCurrent();
      if (moving) {
        current = { startMs: sample.atMs, endMs: sample.atMs, samples: [sample] };
        lastMovingMs = sample.atMs;
      }
      continue;
    }

    if (moving) {
      current.endMs = sample.atMs;
      current.samples.push(sample);
      lastMovingMs = sample.atMs;
      continue;
    }

    if (Number.isFinite(lastMovingMs) && sample.atMs - lastMovingMs > HISTORY_TRIP_PARK_MS) {
      closeCurrent();
      continue;
    }
    current.endMs = sample.atMs;
    current.samples.push(sample);
  }
  closeCurrent();
  return windows;
};

const toHistoryTripEvent = (event: HistoryTripEvent): HistoryTripEvent => ({
  id: event.id,
  notificationName: event.notificationName,
  startIso: event.startIso,
  endIso: event.endIso,
  site: event.site,
  eventValue: event.eventValue,
  location: event.location,
  driver: event.driver,
  registration: event.registration,
  lat: event.lat,
  lng: event.lng
});

const notificationsForTripWindow = (
  events: Array<HistoryTripEvent & { atMs?: number }>,
  startMs: number,
  endMs: number
): HistoryTripEvent[] =>
  events
    .filter((event) => {
      const atMs = Number.isFinite(event.atMs) ? Number(event.atMs) : Date.parse(event.startIso);
      return Number.isFinite(atMs) && atMs >= startMs && atMs <= endMs;
    })
    .map((event) => toHistoryTripEvent(event));

const buildHistoryTripFromWindow = (
  window: HistoryTripWindow,
  opts: {
    assetId: string;
    index: number;
    site: string;
    siteTimeZones: SiteTimeZoneSettings | null;
    events: Array<HistoryTripEvent & { atMs?: number }>;
    maxReasonableSpeedKph: number;
  }
): HistoryTrip => {
  const startIso = new Date(window.startMs).toISOString();
  const endIso = new Date(window.endMs).toISOString();
  const tripEvents = notificationsForTripWindow(opts.events, window.startMs, window.endMs).map((event) => ({
    ...event,
    site: event.site || opts.site
  }));
  const distanceKm = routeDistanceKmFromPoints(window.samples);
  const maxSpeedKph = window.samples.reduce(
    (max, sample) => Math.max(max, clampReasonableSpeedKph(sample.speedKph, opts.maxReasonableSpeedKph)),
    0
  );
  return {
    id: `${opts.assetId}-trip-${opts.index + 1}`,
    start: formatHistoryDate(startIso, opts.site, opts.siteTimeZones),
    end: formatHistoryDate(endIso, opts.site, opts.siteTimeZones),
    startIso,
    endIso,
    site: opts.site,
    duration: formatDuration(startIso, endIso),
    distanceKm: Number.isFinite(distanceKm) ? distanceKm.toFixed(2) : "0.00",
    maxSpeed: Number.isFinite(maxSpeedKph) ? maxSpeedKph.toFixed(2) : "0.00",
    events: tripEvents,
    notifications: Array.from(new Set(tripEvents.map((event) => event.notificationName))),
    assetId: opts.assetId
  };
};

const historyTripDurationMs = (trip: HistoryTrip): number => {
  const start = Date.parse(trip.startIso || trip.start);
  const end = Date.parse(trip.endIso || trip.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
};

const shouldPreferSplitHistoryTrips = (mappedTrips: HistoryTrip[], splitTrips: HistoryTrip[]): boolean => {
  if (splitTrips.length === 0) return false;
  if (mappedTrips.length === 0) return true;
  if (mappedTrips.length === 1 && splitTrips.length > 1) return true;
  const uniqueWindows = new Set(mappedTrips.map((trip) => `${trip.startIso}|${trip.endIso}`));
  if (uniqueWindows.size <= 1 && splitTrips.length > 1) return true;
  const summarizedCount = mappedTrips.filter((trip) => historyTripDurationMs(trip) >= HISTORY_SUMMARIZED_TRIP_MS).length;
  if (summarizedCount > 0 && splitTrips.length > mappedTrips.length) return true;
  const microCount = mappedTrips.filter((trip) => historyTripDurationMs(trip) < 60_000).length;
  if (microCount > splitTrips.length && microCount >= mappedTrips.length * 0.5) return true;
  return false;
};

const resolveHistoryTripsFromSamples = (
  mappedTrips: HistoryTrip[],
  samples: HistoryTrailSample[],
  events: Array<HistoryTripEvent & { atMs?: number }>,
  meta: {
    assetId: string;
    site: string;
    siteTimeZones: SiteTimeZoneSettings | null;
    maxReasonableSpeedKph: number;
  }
): HistoryTrip[] => {
  const splitTrips = splitTrailSamplesIntoTripWindows(samples).map((window, index) =>
    buildHistoryTripFromWindow(window, { ...meta, index, events })
  );
  if (shouldPreferSplitHistoryTrips(mappedTrips, splitTrips)) return splitTrips;
  if (mappedTrips.length === 0) return splitTrips;

  const expanded: HistoryTrip[] = [];
  let splitIndex = mappedTrips.length;
  for (const trip of mappedTrips) {
    if (historyTripDurationMs(trip) < HISTORY_SUMMARIZED_TRIP_MS) {
      expanded.push(trip);
      continue;
    }
    const startMs = Date.parse(trip.startIso || trip.start);
    const endMs = Date.parse(trip.endIso || trip.end);
    const slice = Number.isFinite(startMs) && Number.isFinite(endMs)
      ? samples.filter((sample) => sample.atMs >= startMs && sample.atMs <= endMs)
      : samples;
    const tripWindows = splitTrailSamplesIntoTripWindows(slice);
    if (tripWindows.length <= 1) {
      expanded.push(trip);
      continue;
    }
    for (const window of tripWindows) {
      expanded.push(buildHistoryTripFromWindow(window, { ...meta, index: splitIndex, events }));
      splitIndex += 1;
    }
  }
  return expanded;
};

const HISTORY_SITE_DEVICE_LIMIT = 40;
const HISTORY_BACKGROUND_ROUTE_LIMIT = 8;
const HISTORY_ROUTE_FALLBACK_LIMIT = 12;

const formatNotificationLabel = (value: unknown): string => {
  const text = String(value ?? "").trim();
  if (!text) return "Notification";
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const formatEventValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") {
    const text = value.trim();
    return text || "—";
  }
  try {
    const text = JSON.stringify(value);
    return text && text !== "{}" ? text : "—";
  } catch {
    return "—";
  }
};

/** Historical map marker — Live Tracking truck badge without live status colors. */
const buildAssetIcon = (_asset?: HistoryMapAsset) => {
  const borderColor = "#2563eb";

  const svg = `<svg width='56' height='56' viewBox='0 0 56 56' xmlns='http://www.w3.org/2000/svg'>
      <defs>
        <filter id='shadow' x='-40%' y='-40%' width='180%' height='180%'>
          <feDropShadow dx='0' dy='2' stdDeviation='1.8' flood-color='rgba(15,23,42,0.32)'/>
        </filter>
      </defs>
      <g filter='url(#shadow)'>
        <circle cx='28' cy='28' r='18' fill='#ffffff' stroke='${borderColor}' stroke-width='3'/>
        <g transform='translate(15.5,18.5)'>
          <rect x='1' y='7.5' width='11.5' height='5.8' rx='1.4' fill='#2563eb' stroke='#1d4ed8' stroke-width='1'/>
          <path d='M12.5 8h4.8l2.2 3v2.8h-9z' fill='#3b82f6' stroke='#1d4ed8' stroke-width='1' stroke-linejoin='round'/>
          <circle cx='4.2' cy='15.2' r='2.1' fill='#1e40af'/>
          <circle cx='16.8' cy='15.2' r='2.1' fill='#1e40af'/>
          <path d='M2 6.8V5.2h5.4V6.8' fill='none' stroke='#1d4ed8' stroke-width='1.3' stroke-linecap='round'/>
        </g>
      </g>
    </svg>`;

  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    popupAnchor: [0, -24]
  });
};

const historyAssetIcon = buildAssetIcon();

export default function HistoricalTracking() {
  const navigate = useNavigate();
  const [activeTenantId, setActiveTenantId] = useState(() => String(getTenantId() ?? "").trim());
  const lastContextSignatureRef = useRef("");
  const lastOrgScopeSignatureRef = useRef("");
  const tenantStorageSuffix = useMemo(() => {
    return activeTenantId ? `:${activeTenantId}` : "";
  }, [activeTenantId]);
  const resolveScopedTenantId = (tenantIdOverride?: string) => {
    const fromOverride = String(tenantIdOverride ?? "").trim();
    if (fromOverride) return fromOverride;
    const currentTenant = String(getTenantId() ?? "").trim();
    if (currentTenant) return currentTenant;
    return activeTenantId;
  };
  const scopedStorageKey = (base: string, tenantIdOverride?: string) => {
    const tenantId = resolveScopedTenantId(tenantIdOverride);
    return `${base}${tenantId ? `:${tenantId}` : ""}`;
  };
  const readScopedStorage = (base: string, tenantIdOverride?: string) => {
    const tenantId = resolveScopedTenantId(tenantIdOverride);
    return localStorage.getItem(scopedStorageKey(base, tenantId)) || localStorage.getItem(base);
  };
  const readContextSignature = () => {
    if (typeof window === "undefined") return "";
    return [
      String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim(),
      String(window.localStorage.getItem("vivi.activeDealerId") ?? "").trim(),
      String(window.localStorage.getItem("vivi.activeOrgId") ?? "").trim(),
      String(window.localStorage.getItem("vivi.activeDbId") ?? "").trim(),
      String(window.localStorage.getItem("vivi.activeSiteId") ?? "").trim(),
      readUserPref(USER_PREF_KEYS.activeAsset),
      readUserPref(USER_PREF_KEYS.activeImei),
      String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim(),
      String(getTenantId() ?? "").trim()
    ].join("|");
  };
  const readOrgScopeSignature = () => {
    if (typeof window === "undefined") return "";
    return [
      String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim(),
      String(window.localStorage.getItem("vivi.activeDealerId") ?? "").trim(),
      String(window.localStorage.getItem("vivi.activeOrgId") ?? "").trim(),
      String(window.localStorage.getItem("vivi.activeDbId") ?? "").trim(),
      String(window.localStorage.getItem("vivi.activeSiteId") ?? "").trim(),
      String(getTenantId() ?? "").trim()
    ].join("|");
  };
  const readSelectedScope = () => {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim().toLowerCase();
  };
  const loadAssetsForTenant = async (tenantId: string, options?: { databaseName?: string; siteNames?: string[] }) => {
    const scopedTenantId = String(tenantId ?? "").trim();
    if (!scopedTenantId) return [] as SelectAssetOption[];
    const assets = await getAssetsFromApiForTenant<any>(scopedTenantId);
    if (!Array.isArray(assets) || assets.length === 0) {
      const fallback = await getAssetsFromApi<any>();
      const mappedFallback = mapSelectAssetOptions(Array.isArray(fallback) ? fallback : []);
      if (!options?.databaseName && !(options?.siteNames?.length)) {
        if (scopedTenantId === String(getTenantId() ?? "").trim()) return mappedFallback;
        return [] as SelectAssetOption[];
      }
      return filterSelectAssetsForDatabaseSites(mappedFallback, options);
    }
    return filterSelectAssetsForDatabaseSites(mapSelectAssetOptions(assets), options);
  };
  const configuredMaxReasonableSpeedKph = useMemo(() => {
    const scoped = toFiniteNumber(readScopedStorage("vivi.maxReasonableSpeedKph"));
    if (typeof scoped === "number" && scoped >= 60 && scoped <= 400) return scoped;
    const envValue = toFiniteNumber((import.meta as any)?.env?.VITE_MAX_REASONABLE_SPEED_KPH);
    if (typeof envValue === "number" && envValue >= 60 && envValue <= 400) return envValue;
    return DEFAULT_MAX_REASONABLE_SPEED_KPH;
  }, [tenantStorageSuffix]);
  const [selectedAsset, setSelectedAsset] = useState(() => {
    const assetLabel = readUserPref(USER_PREF_KEYS.activeAsset);
    const resolved = resolveHistoryAssetScope({
      scope: String(typeof window !== "undefined" ? window.localStorage.getItem("vivi.selectedScope") ?? "" : "").trim().toLowerCase(),
      assetLabel,
      selectedPath: String(typeof window !== "undefined" ? window.localStorage.getItem("vivi.selectedPath") ?? "" : "").trim(),
      contextType: readUserPref(USER_PREF_KEYS.contextType)
    });
    return resolved.keepAsset ? assetLabel : "";
  });
  const [selectedSite, setSelectedSite] = useState(() => readScopedStorage("vivi.activeSite") || "");
  const [contextType, setContextType] = useState(() => readUserPref(USER_PREF_KEYS.contextType) || "");
  const [contextName, setContextName] = useState(() => readUserPref(USER_PREF_KEYS.contextName) || "");
  const [selectionLabel, setSelectionLabel] = useState(() => {
    if (typeof window === "undefined") return "";
    const rawScope = String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim().toLowerCase();
    const assetLabel = readUserPref(USER_PREF_KEYS.activeAsset);
    const selectedPath = String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim();
    const storedContextType = readUserPref(USER_PREF_KEYS.contextType);
    const resolved = resolveHistoryAssetScope({
      scope: rawScope,
      assetLabel,
      selectedPath,
      contextType: storedContextType
    });
    return buildHistorySelectionLabel(
      selectedPath,
      resolved.keepAsset ? assetLabel : "",
      resolved.scope,
      readUserPref(USER_PREF_KEYS.contextName)
    );
  });
  const [selectedRegistration, setSelectedRegistration] = useState(() => {
    const assetLabel = readUserPref(USER_PREF_KEYS.activeAsset);
    const resolved = resolveHistoryAssetScope({
      scope: String(typeof window !== "undefined" ? window.localStorage.getItem("vivi.selectedScope") ?? "" : "").trim().toLowerCase(),
      assetLabel,
      selectedPath: String(typeof window !== "undefined" ? window.localStorage.getItem("vivi.selectedPath") ?? "" : "").trim(),
      contextType: readUserPref(USER_PREF_KEYS.contextType)
    });
    if (!resolved.keepAsset) return "";
    const stored = readUserPref(USER_PREF_KEYS.activeRegistration);
    if (stored) return stored;
    return assetLabel.includes(" - ") ? assetLabel.split(" - ").slice(-1)[0] : assetLabel || "";
  });
  const [selectedImei, setSelectedImei] = useState(() => {
    const assetLabel = readUserPref(USER_PREF_KEYS.activeAsset);
    const resolved = resolveHistoryAssetScope({
      scope: String(typeof window !== "undefined" ? window.localStorage.getItem("vivi.selectedScope") ?? "" : "").trim().toLowerCase(),
      assetLabel,
      selectedPath: String(typeof window !== "undefined" ? window.localStorage.getItem("vivi.selectedPath") ?? "" : "").trim(),
      contextType: readUserPref(USER_PREF_KEYS.contextType)
    });
    if (!resolved.keepAsset) return "";
    const stored = readUserPref(USER_PREF_KEYS.activeImei);
    if (stored) return stored;
    const fallbackReg = readUserPref(USER_PREF_KEYS.activeRegistration);
    return toImei(fallbackReg);
  });

  const fallbackHistoryStart = useMemo(() => toLocalDateTimeInputValue(new Date(Date.now() - 1000 * 60 * 60 * 24)), []);
  const fallbackHistoryEnd = useMemo(() => toLocalDateTimeInputValue(new Date()), []);

  const [rangeStart, setRangeStart] = useState(() => {
    const stored = readScopedStorage("vivi.historyStart");
    const fallback = toLocalDateTimeInputValue(new Date(Date.now() - 1000 * 60 * 60 * 24));
    return toValidHistoryDateTimeLocal(stored, fallback);
  });
  const [rangeEnd, setRangeEnd] = useState(() => {
    const stored = readScopedStorage("vivi.historyTime") || readScopedStorage("vivi.historyEnd");
    const fallback = toLocalDateTimeInputValue(new Date());
    return toValidHistoryDateTimeLocal(stored, fallback);
  });
  const [filter, setFilter] = useState("");
  const [showTrips, setShowTrips] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const showEventsRef = useRef(showEvents);
  showEventsRef.current = showEvents;
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedTrips, setExpandedTrips] = useState<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState<number>(560);
  const [dragging, setDragging] = useState(false);
  const [openTripMenu, setOpenTripMenu] = useState<string | null>(null);
  const [selectedTripsOnMap, setSelectedTripsOnMap] = useState<Record<string, SelectedTripOnMap>>({});
  const [historyTrailsByAsset, setHistoryTrailsByAsset] = useState<Record<string, HistoryTrailPoint[]>>({});
  const [historyTrailSamplesByAsset, setHistoryTrailSamplesByAsset] = useState<Record<string, HistoryTrailSample[]>>({});
  const [manualHistoryTrailAssetId, setManualHistoryTrailAssetId] = useState<string | null>(null);
  const [manualHistoryTrailPoints, setManualHistoryTrailPoints] = useState<HistoryTrailPoint[]>([]);
  const [manualHistoryTrailNotifications, setManualHistoryTrailNotifications] = useState<
    Array<{ lat: number; lng: number; atMs: number; labels: string[]; location?: string }>
  >([]);
  const [historyTrailLoadingId, setHistoryTrailLoadingId] = useState<string | null>(null);
  const [historyMapRef, setHistoryMapRef] = useState<L.Map | null>(null);
  const historyMapInstanceRef = useRef<L.Map | null>(null);
  const handleHistoryMapRef = useCallback((map: L.Map | null) => {
    if (map === historyMapInstanceRef.current) return;
    historyMapInstanceRef.current = map;
    setHistoryMapRef(map);
  }, []);
  const traccarDeviceByUniqueIdRef = useRef<Map<string, number>>(new Map());
  const [tripStartFlagsByAsset, setTripStartFlagsByAsset] = useState<Record<string, HistoryTrailPoint[]>>({});
  const [videoTrailEventsByAsset, setVideoTrailEventsByAsset] = useState<Record<string, HistoryVideoTrailEvent[]>>({});
  const [tripReplayOpen, setTripReplayOpen] = useState(false);
  const [tripReplayPlaying, setTripReplayPlaying] = useState(false);
  const [tripReplaySpeed, setTripReplaySpeed] = useState<number>(2);
  const [tripReplayAtMs, setTripReplayAtMs] = useState<number | null>(null);
  const tripReplayLastFrameRef = useRef<number | null>(null);
  const tripReplayRafRef = useRef<number | null>(null);
  const tripReplaySpeedRef = useRef(tripReplaySpeed);
  const tripReplayPlayingRef = useRef(tripReplayPlaying);
  const tripReplayAtMsRef = useRef<number | null>(tripReplayAtMs);
  tripReplaySpeedRef.current = tripReplaySpeed;
  tripReplayPlayingRef.current = tripReplayPlaying;
  tripReplayAtMsRef.current = tripReplayAtMs;
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const mapLayerSelectRef = useRef<HTMLSelectElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableContentRef = useRef<HTMLDivElement | null>(null);
  const [mapLayer, setMapLayer] = useState("google-street");
  const [historyAssetsData, setHistoryAssetsData] = useState<HistoryAssetRow[]>([]);
  const [historyMapAssetsData, setHistoryMapAssetsData] = useState<HistoryMapAsset[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyLoadSeqRef = useRef(0);
  const [historyError, setHistoryError] = useState("");
  const [siteTimeZones, setSiteTimeZones] = useState<SiteTimeZoneSettings | null>(null);
  const historyAssetsDataRef = useRef<HistoryAssetRow[]>([]);
  const historyMapAssetsDataRef = useRef<HistoryMapAsset[]>([]);

  // ── COLUMN ORDERING ────────────────────────────────────────────────────
  const [columnOrder, setColumnOrder] = useState<HistoryColumnKey[]>(() => {
    const stored = readScopedStorage("vivi.historyColumnOrder");
    if (stored) {
      try {
        return normalizeHistoryColumnOrder(JSON.parse(stored));
      } catch {}
    }
    return [...defaultHistoryColumnOrder];
  });
  const [dragCol, setDragCol] = useState<HistoryColumnKey | null>(null);

  const activeHistoryCols = columnOrder
    .map((key) => defaultHistoryColumns.find((c) => c.key === key)!)
    .filter(Boolean);

  const historyGridTemplate = useMemo(
    () =>
      activeHistoryCols
        .map((col) =>
          `minmax(max-content, ${col.key === "assetDescription" ? "1.6fr" : col.key === "events" ? "0.55fr" : col.key === "totalDistance" ? "0.85fr" : "1fr"})`
        )
        .join(" "),
    [columnOrder]
  );

  const historyTableMinWidth = useMemo(
    () => activeHistoryCols.reduce((sum, col) => sum + col.minWidth, 0) + Math.max(0, activeHistoryCols.length - 1) * 12 + 24,
    [columnOrder]
  );

  useEffect(() => {
    historyAssetsDataRef.current = historyAssetsData;
  }, [historyAssetsData]);

  useEffect(() => {
    historyMapAssetsDataRef.current = historyMapAssetsData;
  }, [historyMapAssetsData]);

  // ────────────────────────────────────────────────────────────────────────

  // ── SELECT ASSET modal ──────────────────────────────────────────────────
  const [showSelectAsset, setShowSelectAsset] = useState(false);
  const [selectSearch, setSelectSearch] = useState("");
  const [selectHierarchy, setSelectHierarchy] = useState<HierarchyRoot>({ dealers: [] });
  const [selectHierarchyLoading, setSelectHierarchyLoading] = useState(false);
  const [selectAllAssets, setSelectAllAssets] = useState<SelectAssetOption[]>([]);
  const [selectAssetsByTenant, setSelectAssetsByTenant] = useState<Record<string, SelectAssetOption[]>>({});
  const [selectAssetsLoading, setSelectAssetsLoading] = useState(false);
  const [selectDealer, setSelectDealer] = useState<string | null>(null);
  const [selectOrg, setSelectOrg] = useState<string | null>(null);
  const [selectDb, setSelectDb] = useState<string | null>(null);
  const [selectSite, setSelectSite] = useState<string | null>(null);
  const [selectPendingAsset, setSelectPendingAsset] = useState<SelectAssetOption | null>(null);
  // ── data reload trigger — initial mount + explicit user reload only ─────
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const rangeStartRef = useRef(rangeStart);
  const rangeEndRef = useRef(rangeEnd);
  const selectedImeiRef = useRef(selectedImei);
  const selectedAssetRef = useRef(selectedAsset);
  const selectedRegistrationRef = useRef(selectedRegistration);
  const selectedSiteRef = useRef(selectedSite);
  rangeStartRef.current = rangeStart;
  rangeEndRef.current = rangeEnd;
  selectedImeiRef.current = selectedImei;
  selectedAssetRef.current = selectedAsset;
  selectedRegistrationRef.current = selectedRegistration;
  selectedSiteRef.current = selectedSite;
  // ── notifications popup ──────────────────────────────────────────────────
  const [showNotifPopup, setShowNotifPopup] = useState(false);
  const [notifPopupItems, setNotifPopupItems] = useState<Array<{ id: string; label: string }>>([]);
  const [notifPopupLoading, setNotifPopupLoading] = useState(false);
  const [monitoredNotifications, setMonitoredNotifications] = useState<Set<string>>(new Set());
  // ── locations popup ──────────────────────────────────────────────────────
  const [showLocationsPopup, setShowLocationsPopup] = useState(false);
  const [locationsPopupItems, setLocationsPopupItems] = useState<any[]>([]);
  const [locationsPopupLoading, setLocationsPopupLoading] = useState(false);
  // ────────────────────────────────────────────────────────────────────────
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const presetDateRef = useRef<HTMLDivElement | null>(null);
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);
  const [historyDatePickerTarget, setHistoryDatePickerTarget] = useState<"from" | "to">("from");
  const [historyDatePickerDateObj, setHistoryDatePickerDateObj] = useState(() => new Date());
  const [historyDatePickerTime, setHistoryDatePickerTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  });
  const [historyDatePickerActive, setHistoryDatePickerActive] = useState<"date" | "time">("date");
  // ────────────────────────────────────────────────────────────────────────
  const [showMapRotate, setShowMapRotate] = useState(false);
  const [mapRotation, setMapRotation] = useState(0);
  const [measureMode, setMeasureMode] = useState<"distance" | null>(null);
  const [showMapToolsPanel, setShowMapToolsPanel] = useState(false);
  const [measureHint, setMeasureHint] = useState("Press at point A, drag to point B, then release.");
  const retryTimeoutRef = useRef<number | null>(null);
  const retryTickRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const telemetryHistoryCapabilityKey = useMemo(() => {
    return `vivi.capability.telemetry-history-route.v2:${buildApiUrl("/api/telemetry/history")}`;
  }, []);
  const telemetryHistoryRouteMissingRef = useRef(false);
  const [historyRetryActive, setHistoryRetryActive] = useState(false);
  const [historyRetryCountdown, setHistoryRetryCountdown] = useState(0);

  const clearHistoryRetryTimers = () => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (retryTickRef.current !== null) {
      window.clearInterval(retryTickRef.current);
      retryTickRef.current = null;
    }
  };

  const triggerHistoryRetryNow = () => {
    clearHistoryRetryTimers();
    retryAttemptRef.current = 0;
    telemetryHistoryRouteMissingRef.current = false;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(telemetryHistoryCapabilityKey);
    }
    setHistoryRetryActive(false);
    setHistoryRetryCountdown(0);
    setReloadTrigger((current) => current + 1);
  };

  const scheduleHistoryRetry = () => {
    // Do not auto-reload — surface a banner so the user can retry explicitly.
    clearHistoryRetryTimers();
    retryAttemptRef.current = Math.min(retryAttemptRef.current + 1, 3);
    setHistoryRetryActive(true);
    setHistoryRetryCountdown(0);
  };

  useEffect(() => {
    const refreshAuthState = () => {
      const nextTenantId = String(getTenantId() ?? "").trim();
      setActiveTenantId((current) => (current === nextTenantId ? current : nextTenantId));
      // Auth changes update tenant context only — history reloads on user request.
    };
    window.addEventListener("vivi:authchange", refreshAuthState as EventListener);
    return () => {
      window.removeEventListener("vivi:authchange", refreshAuthState as EventListener);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearHistoryRetryTimers();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadTimeZones = async () => {
      const tz = await getSiteTimeZoneSettings();
      if (mounted) setSiteTimeZones(tz);
    };
    const handleTimeZoneUpdate = (event: Event) => {
      const detail = (event as CustomEvent<SiteTimeZoneSettings | null>)?.detail;
      if (detail && typeof detail === "object") {
        setSiteTimeZones(detail);
        return;
      }
      void loadTimeZones();
    };
    void loadTimeZones();
    window.addEventListener(SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT, handleTimeZoneUpdate as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener(SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT, handleTimeZoneUpdate as EventListener);
    };
  }, []);
  const baseLayers: Record<string, { url: string; attribution: string }> = {
    "google-street": {
      url: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
      attribution: "&copy; Google Maps"
    },
    "google-terrain": {
      url: "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
      attribution: "&copy; Google Maps"
    },
    "google-satellite": {
      url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      attribution: "&copy; Google Maps"
    },
    "google-hybrid": {
      url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
      attribution: "&copy; Google Maps"
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTrip = (id: string) => {
    setExpandedTrips((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragging) return;
      const min = 320;
      const max = 780;
      const next = Math.min(max, Math.max(min, event.clientX));
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
    const closeMenu = () => setOpenTripMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  useEffect(() => {
    const closePresetDropdown = (event: MouseEvent) => {
      if (presetDateRef.current && !presetDateRef.current.contains(event.target as Node)) {
        setShowPresetDropdown(false);
      }
    };
    document.addEventListener("mousedown", closePresetDropdown);
    return () => document.removeEventListener("mousedown", closePresetDropdown);
  }, []);

  useEffect(() => {
    const closePresetDropdown = (event: MouseEvent) => {
      if (presetDateRef.current && !presetDateRef.current.contains(event.target as Node)) {
        setShowPresetDropdown(false);
      }
    };
    document.addEventListener("mousedown", closePresetDropdown);
    return () => document.removeEventListener("mousedown", closePresetDropdown);
  }, []);

  const parseTripTimestamp = (value: string) => {
    const isoParsed = Date.parse(value);
    if (!Number.isNaN(isoParsed)) return new Date(isoParsed);
    const cleaned = value.replace("(EAT)", "").trim();
    const [datePart, timePart] = cleaned.split(" ");
    if (!datePart || !timePart) return null;
    const [day, month, year] = datePart.split("/").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day, hour || 0, minute || 0, second || 0);
  };

  const applyPresetDateRange = (rangeType: "last24h" | "last7d" | "last30d" | "thisMonth") => {
    const now = new Date();
    let startDate: Date;

    switch (rangeType) {
      case "last24h":
        startDate = new Date(now.getTime() - 1000 * 60 * 60 * 24);
        break;
      case "last7d":
        startDate = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
        break;
      case "last30d":
        startDate = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
        break;
      case "thisMonth":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.getTime() - 1000 * 60 * 60 * 24);
    }

    const startIso = toLocalDateTimeInputValue(startDate);
    const endIso = toLocalDateTimeInputValue(now);

    setRangeStart(startIso);
    setRangeEnd(endIso);
    rangeStartRef.current = startIso;
    rangeEndRef.current = endIso;
    localStorage.setItem(scopedStorageKey("vivi.historyStart"), startIso);
    localStorage.setItem(scopedStorageKey("vivi.historyTime"), endIso);
    localStorage.setItem(scopedStorageKey("vivi.historyEnd"), endIso);
    setShowPresetDropdown(false);
    setReloadTrigger((prev) => prev + 1);
  };

  const handleOpenCustomDateModal = () => {
    const date = new Date(rangeStart);
    setHistoryDatePickerTarget("from");
    setHistoryDatePickerDateObj(Number.isNaN(date.getTime()) ? new Date() : date);
    setHistoryDatePickerTime(`${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`);
    setHistoryDatePickerActive("date");
    setShowCustomDateModal(true);
    setShowPresetDropdown(false);
  };

  const openHistoryDatePicker = (target: "from" | "to") => {
    const rawValue = target === "from" ? rangeStart : rangeEnd;
    const date = new Date(rawValue);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    setHistoryDatePickerTarget(target);
    setHistoryDatePickerDateObj(safeDate);
    setHistoryDatePickerTime(`${safeDate.getHours().toString().padStart(2, "0")}:${safeDate.getMinutes().toString().padStart(2, "0")}`);
    setHistoryDatePickerActive("date");
    setShowCustomDateModal(true);
    setShowPresetDropdown(false);
  };

  const applyHistoryDatePicker = () => {
    const [hours, minutes] = historyDatePickerTime.split(":").map((value) => Number(value));
    const next = new Date(historyDatePickerDateObj);
    if (!Number.isNaN(hours)) next.setHours(hours);
    if (!Number.isNaN(minutes)) next.setMinutes(minutes);
    next.setSeconds(0, 0);

    const value = toLocalDateTimeInputValue(next);
    if (historyDatePickerTarget === "from") {
      setRangeStart(value);
      rangeStartRef.current = value;
      localStorage.setItem(scopedStorageKey("vivi.historyStart"), value);
    } else {
      setRangeEnd(value);
      rangeEndRef.current = value;
      localStorage.setItem(scopedStorageKey("vivi.historyTime"), value);
      localStorage.setItem(scopedStorageKey("vivi.historyEnd"), value);
    }

    setShowCustomDateModal(false);
    setReloadTrigger((prev) => prev + 1);
  };

  const derivedAssets = useMemo<HistoryAssetDerived[]>(() => {
    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);
    const filterMonitored = (events: HistoryTripEvent[]) => {
      if (!showEvents) return [];
      // Trail notification filter: nothing selected ⇒ no events shown.
      if (monitoredNotifications.size === 0) return [];
      return events.filter((event) => monitoredNotifications.has(event.notificationName));
    };
    return historyAssetsData.map((row) => {
      const tripsInRange = row.trips.flatMap((trip) => {
        const tripStart = parseTripTimestamp(trip.startIso || trip.start);
        const tripEnd = parseTripTimestamp(trip.endIso || trip.end);
        if (!tripStart || !tripEnd || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return [{ ...trip, events: filterMonitored(trip.events) }];
        }
        // Keep trips that overlap the selected window (not only those fully contained).
        if (!(tripEnd.getTime() > start.getTime() && tripStart.getTime() < end.getTime())) return [];
        const eventsInWindow = trip.events.filter((event) => {
          const eventStart = parseTripTimestamp(event.startIso);
          const eventEnd = parseTripTimestamp(event.endIso || event.startIso);
          if (!eventStart || !eventEnd) return true;
          return eventEnd.getTime() > start.getTime() && eventStart.getTime() < end.getTime();
        });
        return [{ ...trip, events: filterMonitored(eventsInWindow) }];
      });
      const eventsInRange = tripsInRange.reduce((sum, trip) => sum + trip.events.length, 0);
      const totalDistance = tripsInRange
        .reduce((sum, trip) => sum + (Number(trip.distanceKm) || 0), 0)
        .toFixed(2);
      return {
        ...row,
        totalDistance,
        tripsInRange,
        eventsInRange,
        hasTripsInRange: tripsInRange.length > 0,
        hasEventsInRange: eventsInRange > 0
      };
    });
  }, [historyAssetsData, rangeStart, rangeEnd, showEvents, monitoredNotifications]);

  const dynamicMapCenter = useMemo<[number, number]>(() => {
    const first = historyMapAssetsData.find((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));
    return first ? [first.lat, first.lng] : historyMapCenter;
  }, [historyMapAssetsData]);

  useEffect(() => {
    const controller = new AbortController();
    let requestTimedOut = false;
    // Per-device trip summaries are small; keep enough headroom for a full site without hanging forever.
    const requestTimeoutId = window.setTimeout(() => {
      requestTimedOut = true;
      controller.abort();
    }, 90_000);

    const normalizeHistoryErrorMessage = (value: unknown) => {
      if (requestTimedOut) return "History request timed out.";
      const text = String(value ?? "").trim();
      if (!text) return "History API unavailable.";
      const lower = text.toLowerCase();
      const looksLikeHtml = lower.includes("<!doctype") || lower.includes("<html") || lower.includes("<script") || lower.includes("</");
      if (text.includes("Unexpected token '<'") || looksLikeHtml) {
        return "History API returned HTML instead of JSON.";
      }
      return text.length > 220 ? `${text.slice(0, 220)}...` : text;
    };

    const clearHistoryVisuals = () => {
      setHistoryAssetsData([]);
      setHistoryMapAssetsData([]);
      setHistoryTrailsByAsset({});
      setHistoryTrailSamplesByAsset({});
      setTripStartFlagsByAsset({});
      setVideoTrailEventsByAsset({});
      setManualHistoryTrailAssetId(null);
      setManualHistoryTrailPoints([]);
      setHistoryTrailLoadingId(null);
    };

    const applyScopeToHistory = <T extends { id: string; site?: string }>(rows: T[]) => {
      const selection = readStoredSelectionScope();
      return rows.filter((row) => matchesStoredSiteSelection(resolveAssetSiteName(row), selection));
    };

    const filterTrailRecord = <T,>(record: Record<string, T>, allowedIds: Set<string>) => {
      return Object.fromEntries(
        Object.entries(record).filter(([key]) => allowedIds.has(String(key ?? "").trim()))
      ) as Record<string, T>;
    };

    const canUseLiveFallback = Boolean(
      selectedAssetRef.current || selectedRegistrationRef.current || selectedImeiRef.current
    );

    const hydrateFromLiveKpis = async (apiKey: string, tenant: string): Promise<boolean> => {
      if (!canUseLiveFallback) return false;
      const selection = readStoredSelectionScope();
      const assetsLibrary = await loadScopedAssets();
      const assetsByImei = new Map<string, Record<string, unknown>>();
      for (const asset of assetsLibrary) {
        const key = toImei(asset?.imei ?? asset?.uniqueId ?? "");
        if (key) assetsByImei.set(key, asset as Record<string, unknown>);
      }
      const response = await fetch(buildApiUrl("/api/traccar/live"), {
        method: "GET",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "x-tenant-id": tenant
        }
      });
      if (!response.ok) return false;

      const body = (await response.json()) as any;
      const live = Array.isArray(body?.live) ? body.live : [];
      if (live.length === 0) return false;

      const nextMapAssets: HistoryMapAsset[] = live
        .map((row: any) => {
          const pos = row?.position;
          if (!pos || typeof pos.lat !== "number" || typeof pos.lng !== "number") return null;

          const speedKph = Math.max(0, Math.round(traccarSpeedToKph(pos.speed, configuredMaxReasonableSpeedKph)));
          const attrs = (pos.attributes ?? {}) as Record<string, unknown>;
          const ignition = parseIgnition({ ignition: attrs.ignition, data: { ignition: attrs.ignition } });
          const imei = toImei(row?.imei ?? row?.uniqueId ?? "");
          const libraryAsset = imei ? assetsByImei.get(imei) : undefined;
          // Never invent the active site for an unknown device — only library-scoped assets.
          if (!libraryAsset) return null;
          const assetSite = resolveAssetSiteName(libraryAsset);
          if (!matchesStoredSiteSelection(assetSite, selection)) return null;
          const labels = resolveHistoryAssetLabels(libraryAsset, {
            imei,
            traccarName: String(row?.name ?? ""),
            selectedAsset: selectedAssetRef.current,
            selectedRegistration: selectedRegistrationRef.current
          });

          return {
            id: String(row?.deviceId ?? imei ?? ""),
            name: labels.assetDescription,
            registration: labels.registration,
            assetDescription: labels.assetDescription,
            site: assetSite,
            lastLocation: "—",
            lastPosition: formatHistoryDate(String(pos?.fixTime ?? pos?.deviceTime ?? row?.lastUpdate ?? ""), assetSite, siteTimeZones) || "—",
            driver: "—",
            speed: `${speedKph} km/h`,
            heading: cardinalFromDegrees(Number(pos?.heading) || 0),
            ignition,
            fuel: pickString(attrs?.fuelLevel, attrs?.fuel, "—") || "—",
            status: parseStatus(speedKph, ignition),
            lat: Number(pos.lat),
            lng: Number(pos.lng)
          } as HistoryMapAsset;
        })
        .filter((row: HistoryMapAsset | null): row is HistoryMapAsset => Boolean(row));

      const scopedMapAssets = applyScopeToHistory(nextMapAssets);

      if (scopedMapAssets.length === 0) return false;

      const nextAssets: HistoryAssetRow[] = scopedMapAssets.map((row) => ({
        id: row.id,
        registration: row.registration,
        assetDescription: row.assetDescription || row.name,
        totalDistance: "0.00",
        events: 0,
        hasTrips: false,
        hasEvents: false,
        trips: []
      }));

      setHistoryAssetsData(nextAssets);
      setHistoryMapAssetsData(scopedMapAssets);
      setHistoryTrailsByAsset({});
      setTripStartFlagsByAsset({});
      setVideoTrailEventsByAsset({});
      return true;
    };

    const hydrateFromTraccarReports = async (): Promise<boolean> => {
      const selection = readStoredSelectionScope();
      const assets = await loadScopedAssets();
      const normalizedSelectedImei = toImei(selectedImeiRef.current);
      const normalizedSelectedRegistration = String(selectedRegistrationRef.current ?? "").trim().toLowerCase();
      const normalizedSelectedAsset = String(selectedAssetRef.current ?? "").trim().toLowerCase();
      const hasExplicitAssetSelection = Boolean(normalizedSelectedImei || normalizedSelectedRegistration || normalizedSelectedAsset);

      const scopedAssets = assets.filter((asset) =>
        matchesStoredSiteSelection(resolveAssetSiteName(asset), selection)
      );
      let targetAssets = hasExplicitAssetSelection
        ? scopedAssets.filter((asset) => {
            const assetImei = toImei(asset?.imei ?? asset?.uniqueId ?? "");
            const registration = String(asset?.registration ?? asset?.plate ?? asset?.name ?? "").trim().toLowerCase();
            const label = `${String(asset?.assetDescription ?? asset?.description ?? asset?.name ?? "").trim()} ${String(asset?.registration ?? "").trim()}`
              .trim()
              .toLowerCase();

            if (normalizedSelectedImei && assetImei === normalizedSelectedImei) return true;
            if (normalizedSelectedRegistration && registration === normalizedSelectedRegistration) return true;
            if (normalizedSelectedAsset && label.includes(normalizedSelectedAsset)) return true;
            return false;
          })
        : scopedAssets;

      // Never fall back to other sites when the active site/path has no match.
      // ZA CMS 808 can still hydrate trips from platform vehicles when the asset library is empty.
      if (targetAssets.length === 0 && !(cms808HierarchyActive() || isCms808Server())) return false;

      let lookupUnreachable = false;
      const resolveHistoryDevice = async (match: any): Promise<{
        deviceId: number;
        imei: string;
        registration: string;
        assetDescription: string;
        site: string;
        driverName: string;
        sourceAsset: Record<string, unknown>;
      } | null> => {
        const directDeviceId = Number(match?.traccarDeviceId ?? match?.deviceId);
        const labels = resolveHistoryAssetLabels(match, {
          imei: toImei(match?.imei ?? match?.uniqueId ?? selectedImeiRef.current ?? ""),
          selectedRegistration: selectedRegistrationRef.current,
          selectedAsset: selectedAssetRef.current
        });
        const imei = labels.imei;
        const registration = labels.registration;
        const assetDescription = labels.assetDescription;
        const site =
          resolveAssetSiteName(match)
          || String(selectedSiteRef.current ?? readActiveSiteName() ?? "").trim()
          || "Default";
        const driverName = resolveAssetDriverName(match);
        const sourceAsset = match && typeof match === "object" ? (match as Record<string, unknown>) : {};

        if (Number.isFinite(directDeviceId) && directDeviceId > 0) {
          return {
            deviceId: directDeviceId,
            imei,
            registration,
            assetDescription,
            site,
            driverName,
            sourceAsset
          };
        }

        if (imei) {
          const detailed = await getTraccarDevicesDetailed({ uniqueId: imei });
          if (detailed.unreachable) {
            lookupUnreachable = true;
            return null;
          }
          const lookedUp = detailed.devices[0];
          const lookedUpDeviceId = Number(lookedUp?.id);
          if (Number.isFinite(lookedUpDeviceId) && lookedUpDeviceId > 0) {
            const fromDevice = resolveHistoryAssetLabels(match, {
              imei,
              traccarName: String(lookedUp?.name ?? ""),
              selectedRegistration: selectedRegistrationRef.current,
              selectedAsset: selectedAssetRef.current
            });
            return {
              deviceId: lookedUpDeviceId,
              imei,
              registration: fromDevice.registration,
              assetDescription: fromDevice.assetDescription,
              site,
              driverName,
              sourceAsset
            };
          }
        }

        return null;
      };

      const resolvedDevices = (
        await mapPool(targetAssets, 6, async (asset) => {
          if (controller.signal.aborted) return null;
          return resolveHistoryDevice(asset);
        })
      ).filter((item): item is {
        deviceId: number;
        imei: string;
        registration: string;
        assetDescription: string;
        site: string;
        driverName: string;
        sourceAsset: Record<string, unknown>;
      } => Boolean(item));

      const cmsHistoryActive = cms808HierarchyActive() || isCms808Server();
      if (resolvedDevices.length === 0) {
        if (lookupUnreachable && !cmsHistoryActive) {
          throw new Error("VIVI unreachable while resolving devices for historical tracking.");
        }
        // ZA / CMS 808 sites can still load separated trips from track points below.
        if (!cmsHistoryActive) return false;
      }

      const uniqueDevices = Array.from(new Map(resolvedDevices.map((item) => [String(item.deviceId), item])).values());
      // Site-wide compiles without an explicit asset can be huge; keep history responsive.
      const hasExplicitAsset = Boolean(normalizedSelectedImei || normalizedSelectedRegistration || normalizedSelectedAsset);
      const devicesToLoad = hasExplicitAsset ? uniqueDevices : uniqueDevices.slice(0, HISTORY_SITE_DEVICE_LIMIT);
      const fallbackEndMs = Date.now();
      const fallbackStartMs = fallbackEndMs - 24 * 60 * 60 * 1000;
      const fromIso = toValidIsoOrFallback(rangeStartRef.current, fallbackStartMs);
      const toIsoRaw = toValidIsoOrFallback(rangeEndRef.current, fallbackEndMs);
      const toIso = new Date(Date.parse(toIsoRaw) + 59_999).toISOString();

      // Per-device trip reports: batched multi-deviceId proxy calls often return empty or drop deviceId.
      const tripsByDeviceId = new Map<number, Awaited<ReturnType<typeof getTraccarTrips>>>();
      const routesByDeviceId = new Map<number, Awaited<ReturnType<typeof getTraccarRoute>>>();
      await mapPool(devicesToLoad, 6, async (resolved) => {
        if (controller.signal.aborted) return;
        const trips = await getTraccarTrips({
          deviceId: resolved.deviceId,
          from: fromIso,
          to: toIso
        }).catch(() => [] as Awaited<ReturnType<typeof getTraccarTrips>>);
        tripsByDeviceId.set(Number(resolved.deviceId), Array.isArray(trips) ? trips : []);
      });

      const devicesWithTrips = devicesToLoad.filter((item) => (tripsByDeviceId.get(Number(item.deviceId)) ?? []).length > 0);
      const devicesNeedingRoute = devicesToLoad.filter((item) => (tripsByDeviceId.get(Number(item.deviceId)) ?? []).length === 0);
      // Only pull GPS routes when Traccar trip summaries are empty — that is how multi-day mileage appeared before.
      const routeFallbackTargets = devicesWithTrips.length > 0
        ? []
        : devicesNeedingRoute.slice(0, hasExplicitAsset ? 1 : HISTORY_ROUTE_FALLBACK_LIMIT);
      if (routeFallbackTargets.length > 0) {
        await mapPool(routeFallbackTargets, 3, async (resolved) => {
          if (controller.signal.aborted) return;
          const route = await getTraccarRoute({
            deviceId: resolved.deviceId,
            from: fromIso,
            to: toIso,
            allowPositionsFallback: false
          }).catch(() => [] as Awaited<ReturnType<typeof getTraccarRoute>>);
          routesByDeviceId.set(Number(resolved.deviceId), Array.isArray(route) ? route : []);
        });
      }

      const settled = devicesToLoad.map((resolved) => ({
        resolved,
        trips: tripsByDeviceId.get(Number(resolved.deviceId)) ?? [],
        route: routesByDeviceId.get(Number(resolved.deviceId)) ?? [],
        events: [] as Awaited<ReturnType<typeof getTraccarEvents>>
      }));

      const nextAssets: HistoryAssetRow[] = [];
      const nextMapAssets: HistoryMapAsset[] = [];
      const nextTrails: Record<string, HistoryTrailPoint[]> = {};
      const nextSamples: Record<string, HistoryTrailSample[]> = {};
      const nextStarts: Record<string, HistoryTrailPoint[]> = {};

      for (const result of settled) {
        if (!result) continue;

        const { resolved, trips, route, events } = result;
        if ((!Array.isArray(trips) || trips.length === 0) && (!Array.isArray(route) || route.length < 2)) continue;
        const assetId = String(resolved.deviceId);
        const registration = resolved.registration;
        const assetDescription = resolved.assetDescription;
        const tripSite = resolved.site;
        const assetDriverLabel = formatDriverName(
          resolveTripDriverName(undefined, resolved.sourceAsset, "No Driver")
        );
        const routePoints = Array.isArray(route) ? route : [];
        const routeByPositionId = new Map<number, typeof routePoints[number]>();
        const routeWithMs = routePoints
          .map((point) => ({
            point,
            atMs: Date.parse(String(point.fixTime ?? point.deviceTime ?? point.serverTime ?? ""))
          }))
          .filter((item) => Number.isFinite(item.atMs))
          .sort((a, b) => a.atMs - b.atMs);

        for (const point of routePoints) {
          const idNum = Number(point.id);
          if (Number.isFinite(idNum)) routeByPositionId.set(idNum, point);
        }

        const normalizedEvents: Array<HistoryTripEvent & { atMs: number }> = events
          .flatMap((event, index) => {
            const atMs = Date.parse(String(event.eventTime ?? ""));
            if (!Number.isFinite(atMs)) return [];
            const positionFromId = routeByPositionId.get(Number(event.positionId));
            let nearestPosition = positionFromId;
            if (!nearestPosition && routeWithMs.length > 0) {
              let nearest = routeWithMs[0];
              for (const sample of routeWithMs) {
                if (Math.abs(sample.atMs - atMs) < Math.abs(nearest.atMs - atMs)) nearest = sample;
              }
              nearestPosition = nearest.point;
            }
            const attrs = (event.attributes ?? {}) as Record<string, unknown>;
            const lat = toFiniteNumber(nearestPosition?.latitude);
            const lng = toFiniteNumber(nearestPosition?.longitude);
            const coordinateLocation = Number.isFinite(lat) && Number.isFinite(lng)
              ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`
              : "";
            return [{
              id: `${assetId}-event-${event.id ?? index}`,
              atMs,
              notificationName: formatNotificationLabel(event.type),
              startIso: String(event.eventTime ?? "").trim(),
              endIso: String(event.eventTime ?? "").trim(),
              site: tripSite,
              eventValue: formatEventValue(attrs.value ?? attrs.eventValue ?? attrs.speed ?? attrs.motion),
              location: pickString(nearestPosition?.address, coordinateLocation, "—") || "—",
              driver: assetDriverLabel,
              registration,
              lat,
              lng
            }];
          });

        const trailSamples: HistoryTrailSample[] = routePoints
          .flatMap((point) => {
            const atMs = Date.parse(String(point.fixTime ?? point.deviceTime ?? ""));
            if (!Number.isFinite(atMs)) return [];
            const speedKph = traccarSpeedToKph(point.speed, configuredMaxReasonableSpeedKph);
            const attrs = (point.attributes ?? {}) as Record<string, unknown>;
            const ignition = parseIgnition({ ignition: attrs.ignition, data: { ignition: attrs.ignition } });
            return [{
              lat: Number(point.latitude),
              lng: Number(point.longitude),
              atMs,
              moving: speedKph > 1,
              ignitionOn: ignition === "On",
              speedKph,
              location: pickString(point.address, `${Number(point.latitude).toFixed(6)}, ${Number(point.longitude).toFixed(6)}`, "—"),
              driver: assetDriverLabel,
              registration,
              site: tripSite
            }];
          });

        let mappedTrips: HistoryTrip[] = trips.map((trip, index) => {
          const startIso = String(trip.startTime ?? fromIso);
          const endIso = String(trip.endTime ?? startIso);
          const startMs = Date.parse(startIso);
          const endMs = Date.parse(endIso);
          const tripEvents = notificationsForTripWindow(normalizedEvents, startMs, endMs);
          const tripNotifications = tripEvents.map((event) => event.notificationName);
          const dedupedNotifications = Array.from(new Set(tripNotifications));
          const rawDistance = Number(trip.distance ?? 0);
          const reportedDistanceKm = normalizeTripDistanceKm(rawDistance, startMs, endMs, configuredMaxReasonableSpeedKph);
          const routeSlice = routeWithMs.filter((sample) => sample.atMs >= startMs && sample.atMs <= endMs);
          const routeDistanceKm = routeDistanceKmFromPoints(
            routeSlice.map((sample) => ({
              lat: Number(sample.point.latitude),
              lng: Number(sample.point.longitude)
            }))
          );
          const distanceKm = reportedDistanceKm > 0 ? reportedDistanceKm : routeDistanceKm;
          const reportedMaxSpeed = traccarSpeedToKph(trip.maxSpeed, configuredMaxReasonableSpeedKph);
          const routeMaxSpeedKph = routeSlice.reduce((max, sample) => {
            const sampleSpeed = traccarSpeedToKph(sample.point.speed, configuredMaxReasonableSpeedKph);
            return sampleSpeed > max ? sampleSpeed : max;
          }, 0);
          const durationHours = Math.max(0, endMs - startMs) / 3_600_000;
          const derivedMovingSpeed = durationHours > 0 && distanceKm > 0
            ? clampReasonableSpeedKph(Math.max(1, distanceKm / durationHours), configuredMaxReasonableSpeedKph)
            : 0;
          const maxSpeedKph = routeMaxSpeedKph > 0
            ? routeMaxSpeedKph
            : (reportedMaxSpeed > 0 ? reportedMaxSpeed : derivedMovingSpeed);
          return {
            id: `${assetId}-trip-${index + 1}`,
            start: formatHistoryDate(startIso, tripSite, siteTimeZones),
            end: formatHistoryDate(endIso, tripSite, siteTimeZones),
            startIso,
            endIso,
            site: tripSite,
            duration: formatDuration(startIso, endIso),
            distanceKm: Number.isFinite(distanceKm) ? distanceKm.toFixed(2) : "0.00",
            maxSpeed: Number.isFinite(maxSpeedKph) ? maxSpeedKph.toFixed(2) : "0.00",
            events: tripEvents,
            notifications: dedupedNotifications,
            assetId
          };
        });

        mappedTrips = resolveHistoryTripsFromSamples(mappedTrips, trailSamples, normalizedEvents, {
          assetId,
          site: tripSite,
          siteTimeZones,
          maxReasonableSpeedKph: configuredMaxReasonableSpeedKph
        });

        if (mappedTrips.length === 0 && routeWithMs.length > 1) {
          const fallbackStartIso = String(routeWithMs[0]?.point?.fixTime ?? routeWithMs[0]?.point?.deviceTime ?? fromIso);
          const fallbackEndIso = String(routeWithMs[routeWithMs.length - 1]?.point?.fixTime ?? routeWithMs[routeWithMs.length - 1]?.point?.deviceTime ?? toIso);
          const fallbackTripEvents = notificationsForTripWindow(
            normalizedEvents,
            Date.parse(fallbackStartIso),
            Date.parse(fallbackEndIso)
          );
          const fallbackMaxSpeedKph = routeWithMs.reduce((max, sample) => {
            const sampleSpeed = traccarSpeedToKph(sample.point.speed, configuredMaxReasonableSpeedKph);
            return sampleSpeed > max ? sampleSpeed : max;
          }, 0);
          const fallbackDistanceKm = routeDistanceKmFromPoints(
            routeWithMs.map((sample) => ({
              lat: Number(sample.point.latitude),
              lng: Number(sample.point.longitude)
            }))
          );
          mappedTrips = [{
            id: `${assetId}-trip-route-fallback`,
            start: formatHistoryDate(fallbackStartIso, tripSite, siteTimeZones),
            end: formatHistoryDate(fallbackEndIso, tripSite, siteTimeZones),
            startIso: fallbackStartIso,
            endIso: fallbackEndIso,
            site: tripSite,
            duration: formatDuration(fallbackStartIso, fallbackEndIso),
            distanceKm: Number.isFinite(fallbackDistanceKm) ? fallbackDistanceKm.toFixed(2) : "0.00",
            maxSpeed: Number.isFinite(fallbackMaxSpeedKph) ? fallbackMaxSpeedKph.toFixed(2) : "0.00",
            events: fallbackTripEvents,
            notifications: Array.from(new Set(fallbackTripEvents.map((event) => event.notificationName))),
            assetId
          }];
        }

        const totalDistanceKm = mappedTrips.reduce((sum, trip) => sum + (Number(trip.distanceKm) || 0), 0);
        const latestPoint = routePoints[routePoints.length - 1];

        nextAssets.push({
          id: assetId,
          registration,
          assetDescription,
          site: tripSite,
          totalDistance: totalDistanceKm.toFixed(2),
          events: normalizedEvents.length,
          hasTrips: mappedTrips.length > 0,
          hasEvents: normalizedEvents.length > 0,
          trips: mappedTrips
        });

        nextTrails[assetId] = buildMovingTrail(trailSamples);
        nextSamples[assetId] = trailSamples;
        const tripStartMsList = mappedTrips
          .map((trip) => Date.parse(trip.startIso || trip.start))
          .filter((value) => Number.isFinite(value));
        nextStarts[assetId] = buildTripStartFlagsFromTrips(tripStartMsList, trailSamples);

        if (latestPoint) {
          const latestSpeed = traccarSpeedToKph(latestPoint.speed, configuredMaxReasonableSpeedKph);
          const latestIgnition = parseIgnition({ ignition: (latestPoint.attributes as any)?.ignition, data: { ignition: (latestPoint.attributes as any)?.ignition } });
          nextMapAssets.push({
            id: assetId,
            name: assetDescription,
            registration,
            assetDescription,
            site: tripSite,
            lastLocation: String(latestPoint.address ?? "—"),
            lastPosition: formatHistoryDate(String(latestPoint.fixTime ?? latestPoint.deviceTime ?? ""), tripSite, siteTimeZones) || "—",
            driver: assetDriverLabel,
            speed: `${Math.max(0, Math.round(latestSpeed))} km/h`,
            heading: cardinalFromDegrees(Number(latestPoint.course ?? 0)),
            ignition: latestIgnition,
            fuel: pickString((latestPoint.attributes as any)?.fuelLevel, (latestPoint.attributes as any)?.fuel, "—") || "—",
            status: parseStatus(Math.max(0, Math.round(latestSpeed)), latestIgnition),
            lat: Number(latestPoint.latitude),
            lng: Number(latestPoint.longitude)
          });
        } else {
          const lastTrip = [...trips].sort(
            (a, b) =>
              (Date.parse(String(b.endTime ?? b.startTime ?? "")) || 0) -
              (Date.parse(String(a.endTime ?? a.startTime ?? "")) || 0)
          )[0];
          const lat = toFiniteNumber(lastTrip?.endLat ?? lastTrip?.startLat);
          const lng = toFiniteNumber(lastTrip?.endLon ?? lastTrip?.startLon);
          if (typeof lat === "number" && typeof lng === "number") {
            nextMapAssets.push({
              id: assetId,
              name: assetDescription,
              registration,
              assetDescription,
              site: tripSite,
              lastLocation: String(lastTrip?.endAddress ?? lastTrip?.startAddress ?? "—"),
              lastPosition: formatHistoryDate(String(lastTrip?.endTime ?? lastTrip?.startTime ?? ""), tripSite, siteTimeZones) || "—",
              driver: assetDriverLabel,
              speed: `${Math.max(0, Math.round(traccarSpeedToKph(lastTrip?.maxSpeed, configuredMaxReasonableSpeedKph)))} km/h`,
              heading: "N",
              ignition: "—",
              fuel: "—",
              status: "offline",
              lat,
              lng
            });
          }
        }
      }

      // CMS 808: load tracks, split into trip windows (boundaries), and merge under site guards.
      if (cms808HierarchyActive() || isCms808Server()) {
        const cmsSite = cms808SiteName();
        const allowCmsSite = cms808HierarchyActive()
          || !selection.activeSite
          || matchesStoredSiteSelection(cmsSite, selection);
        if (!allowCmsSite) {
          // Active site is not the CMS 808 hierarchy site — do not leak tracks across sites.
        } else {
          let cmsVehicles = await loadCms808VehiclesForActiveHierarchy();
          if (!cmsVehicles.length) cmsVehicles = [CMS808_KNOWN_VEHICLE];
          const fromDate = new Date(fromIso);
          const toDate = new Date(toIso);
          const vehicleLimit = hasExplicitAsset ? 24 : Math.min(Math.max(cmsVehicles.length, 1), HISTORY_SITE_DEVICE_LIMIT);
          for (const vehicle of cmsVehicles.slice(0, vehicleLimit)) {
            if (controller.signal.aborted) break;
            const device = String(vehicle.devIdno || vehicle.deviceId || "").trim().replace(/^cms808:/i, "");
            const plate = String(vehicle.vehiIdno || device).trim();
            if (!device) continue;

            if (hasExplicitAsset) {
              const matchesSelection =
                (normalizedSelectedRegistration && plate.toLowerCase() === normalizedSelectedRegistration) ||
                (normalizedSelectedAsset && `${plate} ${device}`.toLowerCase().includes(normalizedSelectedAsset)) ||
                (normalizedSelectedImei && device.toLowerCase() === normalizedSelectedImei) ||
                targetAssets.some((asset) => cms808MatchesAsset(vehicle, asset as any));
              if (!matchesSelection) continue;
            }

            const tracks = await loadCms808TrackRange(device, fromDate, toDate, plate).catch(() => []);
            let points = mapCms808TracksToTrailPoints(tracks).map((point) => ({
              ...point,
              registration: plate,
              site: cmsSite
            })) as HistoryTrailPoint[];
            if (points.length < 2) {
              points = (await loadCms808PlaybackTrail(device, fromDate, toDate, plate).catch(() => [])).map((point) => ({
                ...point,
                registration: plate,
                site: cmsSite
              })) as HistoryTrailPoint[];
            }
            if (points.length < 2) continue;

            const samples: HistoryTrailSample[] = points.map((point) => {
              const speedKph = Math.max(0, Number(point.speedKph ?? 0));
              return {
                lat: point.lat,
                lng: point.lng,
                atMs: point.atMs,
                moving: speedKph > HISTORY_TRIP_MOVING_SPEED_KPH,
                ignitionOn: speedKph > HISTORY_TRIP_MOVING_SPEED_KPH,
                speedKph,
                location: point.location,
                registration: plate,
                site: cmsSite
              };
            });

            const matchIdx = nextAssets.findIndex((row) => {
              const hay = `${row.registration} ${row.assetDescription} ${row.id}`.toLowerCase();
              return (
                hay.includes(device.toLowerCase()) ||
                hay.includes(plate.toLowerCase()) ||
                String(row.registration ?? "").trim().toLowerCase() === plate.toLowerCase()
              );
            });
            const libraryMatch = targetAssets.find((asset) => cms808MatchesAsset(vehicle, asset as any));
            const libraryLabels = libraryMatch
              ? resolveHistoryAssetLabels(libraryMatch, {
                  imei: device,
                  selectedRegistration: plate,
                  selectedAsset: selectedAssetRef.current
                })
              : null;
            const assetId = matchIdx >= 0
              ? nextAssets[matchIdx].id
              : (libraryMatch ? String((libraryMatch as any)?.id ?? `cms808:${device}`) : `cms808:${device}`);
            const registration = libraryLabels?.registration || (matchIdx >= 0 ? nextAssets[matchIdx].registration : plate);
            const assetDescription = libraryLabels?.assetDescription
              || (matchIdx >= 0 ? nextAssets[matchIdx].assetDescription : plate);
            const tripSite = (matchIdx >= 0 ? nextAssets[matchIdx].site : undefined) || cmsSite;

            // Site guard: never attach CMS tracks under another site's rows.
            if (!matchesStoredSiteSelection(tripSite, selection) && selection.activeSite) continue;

            const existingTrips = matchIdx >= 0 ? nextAssets[matchIdx].trips : [];
            const mappedTrips = resolveHistoryTripsFromSamples(existingTrips, samples, [], {
              assetId,
              site: tripSite,
              siteTimeZones,
              maxReasonableSpeedKph: configuredMaxReasonableSpeedKph
            });
            if (mappedTrips.length === 0) continue;

            const trail = buildMovingTrail(samples);
            const tripStartMsList = mappedTrips
              .map((trip) => Date.parse(trip.startIso || trip.start))
              .filter((value) => Number.isFinite(value));
            const starts = buildTripStartFlagsFromTrips(tripStartMsList, samples);
            const totalDistanceKm = mappedTrips.reduce((sum, trip) => sum + (Number(trip.distanceKm) || 0), 0);
            const end = points[points.length - 1];

            const row: HistoryAssetRow = {
              id: assetId,
              registration,
              assetDescription,
              site: tripSite,
              totalDistance: totalDistanceKm.toFixed(2),
              events: 0,
              hasTrips: mappedTrips.length > 0,
              hasEvents: false,
              trips: mappedTrips
            };

            if (matchIdx >= 0) {
              nextAssets[matchIdx] = row;
            } else {
              nextAssets.push(row);
            }

            const mapIdx = nextMapAssets.findIndex((row) => row.id === assetId || String(row.registration ?? "").toLowerCase() === registration.toLowerCase());
            const mapRow: HistoryMapAsset = {
              id: assetId,
              name: assetDescription,
              assetDescription,
              registration,
              site: tripSite,
              lastLocation: end.location || "—",
              lastPosition: new Date(end.atMs).toISOString(),
              driver: "",
              speed: `${Math.max(0, Math.round(Number(end.speedKph || 0)))} km/h`,
              heading: "",
              ignition: Number(end.speedKph || 0) > HISTORY_TRIP_MOVING_SPEED_KPH ? "On" : "Off",
              fuel: "—",
              status: "offline",
              lat: end.lat,
              lng: end.lng
            };
            if (mapIdx >= 0) nextMapAssets[mapIdx] = mapRow;
            else nextMapAssets.push(mapRow);

            nextTrails[assetId] = trail.length >= 2 ? trail : points;
            nextSamples[assetId] = samples;
            nextStarts[assetId] = starts;
          }

          // Also hydrate library assets that match CMS devices but were missed above.
          for (const asset of targetAssets.slice(0, vehicleLimit)) {
            if (controller.signal.aborted) break;
            const assetSite = String((asset as any)?.site ?? (asset as any)?.group ?? cmsSite).trim();
            if (!matchesStoredSiteSelection(assetSite, selection) && selection.activeSite) continue;
            const plate = String((asset as any)?.registration ?? (asset as any)?.plate ?? "").trim();
            const device = await resolveCms808DeviceId({
              imei: (asset as any)?.imei ?? (asset as any)?.uniqueId,
              cameraSerial: (asset as any)?.cameraSerial,
              assetId: (asset as any)?.assetId ?? (asset as any)?.id,
              id: (asset as any)?.id,
              registration: plate,
              assetDescription: (asset as any)?.assetDescription ?? (asset as any)?.description
            }).catch(() => "");
            if (!device) continue;
            const alreadyHasTrail = nextAssets.some((row) => {
              const samples = nextSamples[row.id] ?? [];
              if (samples.length < 2) return false;
              const hay = `${row.registration} ${row.id}`.toLowerCase();
              return hay.includes(device.toLowerCase()) || (plate && hay.includes(plate.toLowerCase()));
            });
            if (alreadyHasTrail) continue;
            const points = (await loadCms808PlaybackTrail(device, fromDate, toDate, plate).catch(() => [])).map((point) => ({
              ...point,
              registration: plate || device,
              site: assetSite || cmsSite
            })) as HistoryTrailPoint[];
            if (points.length < 2) continue;
            const samples: HistoryTrailSample[] = points.map((point) => {
              const speedKph = Math.max(0, Number(point.speedKph ?? 0));
              return {
                lat: point.lat,
                lng: point.lng,
                atMs: point.atMs,
                moving: speedKph > HISTORY_TRIP_MOVING_SPEED_KPH,
                ignitionOn: speedKph > HISTORY_TRIP_MOVING_SPEED_KPH,
                speedKph,
                location: point.location,
                registration: plate || device,
                site: assetSite || cmsSite
              };
            });
            const labels = resolveHistoryAssetLabels(asset, {
              imei: device,
              selectedRegistration: plate,
              selectedAsset: selectedAssetRef.current
            });
            const registration = String(labels.registration ?? plate ?? device ?? "").trim();
            const rowAssetDescription = String(labels.assetDescription || registration || plate || device || "").trim();
            const assetId = String((asset as any)?.id ?? `cms808:${device}`);
            const mappedTrips = resolveHistoryTripsFromSamples([], samples, [], {
              assetId,
              site: assetSite || cmsSite,
              siteTimeZones,
              maxReasonableSpeedKph: configuredMaxReasonableSpeedKph
            });
            if (mappedTrips.length === 0) continue;
            const trail = buildMovingTrail(samples);
            const tripStartMsList = mappedTrips
              .map((trip) => Date.parse(trip.startIso || trip.start))
              .filter((value) => Number.isFinite(value));
            const totalDistanceKm = mappedTrips.reduce((sum, trip) => sum + (Number(trip.distanceKm) || 0), 0);
            const end = points[points.length - 1];
            const matchIdx = nextAssets.findIndex((row) => row.id === assetId || String(row.registration ?? "").toLowerCase() === registration.toLowerCase());
            const row: HistoryAssetRow = {
              id: assetId,
              registration,
              assetDescription: rowAssetDescription || registration,
              site: assetSite || cmsSite || "",
              totalDistance: totalDistanceKm.toFixed(2),
              events: 0,
              hasTrips: true,
              hasEvents: false,
              trips: mappedTrips
            };
            if (matchIdx >= 0) nextAssets[matchIdx] = row;
            else nextAssets.push(row);
            const mapIdx = nextMapAssets.findIndex((row) => row.id === assetId);
            const mapRow: HistoryMapAsset = {
              id: assetId,
              name: row.assetDescription,
              assetDescription: row.assetDescription,
              registration: row.registration,
              site: row.site ?? "",
              lastLocation: end.location || "—",
              lastPosition: new Date(end.atMs).toISOString(),
              driver: "",
              speed: `${Math.max(0, Math.round(Number(end.speedKph || 0)))} km/h`,
              heading: "",
              ignition: Number(end.speedKph || 0) > HISTORY_TRIP_MOVING_SPEED_KPH ? "On" : "Off",
              fuel: "—",
              status: "offline",
              lat: end.lat,
              lng: end.lng
            };
            if (mapIdx >= 0) nextMapAssets[mapIdx] = mapRow;
            else nextMapAssets.push(mapRow);
            nextTrails[assetId] = trail.length >= 2 ? trail : points;
            nextSamples[assetId] = samples;
            nextStarts[assetId] = buildTripStartFlagsFromTrips(tripStartMsList, samples);
          }

          // Guard: under the CMS 808 hierarchy, drop rows with no trail samples (blank-map "trips").
          if (cms808HierarchyActive()) {
            for (let i = nextAssets.length - 1; i >= 0; i -= 1) {
              const id = nextAssets[i].id;
              if ((nextSamples[id] ?? []).length >= 2) continue;
              nextAssets.splice(i, 1);
              const mapIdx = nextMapAssets.findIndex((row) => row.id === id);
              if (mapIdx >= 0) nextMapAssets.splice(mapIdx, 1);
              delete nextTrails[id];
              delete nextSamples[id];
              delete nextStarts[id];
            }
          }
        }
      }

      const scopedHistoryAssets = applyScopeToHistory(nextAssets)
        .sort((a, b) => {
          const latestA = a.trips.reduce((max, trip) => Math.max(max, Date.parse(trip.endIso || trip.startIso || trip.end || trip.start) || 0), 0);
          const latestB = b.trips.reduce((max, trip) => Math.max(max, Date.parse(trip.endIso || trip.startIso || trip.end || trip.start) || 0), 0);
          return latestB - latestA;
        });
      const allowedIds = new Set(scopedHistoryAssets.map((row) => String(row.id ?? "").trim()).filter(Boolean));
      const scopedMapAssets = applyScopeToHistory(nextMapAssets).filter((row) => allowedIds.has(String(row.id ?? "").trim()));

      if (scopedHistoryAssets.length === 0 && scopedMapAssets.length === 0) return false;

      setHistoryAssetsData(scopedHistoryAssets);
      setHistoryMapAssetsData(scopedMapAssets);
      setHistoryTrailsByAsset(filterTrailRecord(nextTrails, allowedIds));
      setHistoryTrailSamplesByAsset(filterTrailRecord(nextSamples, allowedIds));
      setTripStartFlagsByAsset(filterTrailRecord(nextStarts, allowedIds));
      setVideoTrailEventsByAsset({});

      const paintSeq = historyLoadSeqRef.current;
      const enrichHistoryAfterTripPaint = async () => {
        if (controller.signal.aborted || paintSeq !== historyLoadSeqRef.current) return;
        const deviceById = new Map(devicesToLoad.map((item) => [String(item.deviceId), item]));

        if (showEventsRef.current) {
          const eventsByDeviceId = new Map<number, Awaited<ReturnType<typeof getTraccarEvents>>>();
          const eventDevices = devicesToLoad.filter((item) => allowedIds.has(String(item.deviceId)));
          await mapPool(eventDevices, 3, async (item) => {
            if (controller.signal.aborted || paintSeq !== historyLoadSeqRef.current) return;
            const fetched = await getTraccarEvents({
              deviceId: item.deviceId,
              from: fromIso,
              to: toIso
            }).catch(() => [] as Awaited<ReturnType<typeof getTraccarEvents>>);
            const id = Number(item.deviceId);
            if (!Number.isFinite(id) || id <= 0) return;
            eventsByDeviceId.set(id, Array.isArray(fetched) ? fetched : []);
          });
          if (controller.signal.aborted || paintSeq !== historyLoadSeqRef.current) return;
          setHistoryAssetsData((current) =>
            current.map((row) => {
              const rawEvents = eventsByDeviceId.get(Number(row.id)) ?? [];
              const normalized = rawEvents.flatMap((event, index) => {
                const atMs = Date.parse(String(event.eventTime ?? ""));
                if (!Number.isFinite(atMs)) return [];
                const attrs = (event.attributes ?? {}) as Record<string, unknown>;
                return [{
                  id: `${row.id}-event-${event.id ?? index}`,
                  atMs,
                  notificationName: formatNotificationLabel(event.type),
                  startIso: String(event.eventTime ?? "").trim(),
                  endIso: String(event.eventTime ?? "").trim(),
                  site: row.site,
                  eventValue: formatEventValue(attrs.value ?? attrs.eventValue ?? attrs.speed ?? attrs.motion),
                  location: "—",
                  driver: "No Driver",
                  registration: row.registration
                }];
              });
              const nextTrips = row.trips.map((trip) => {
                const startMs = Date.parse(trip.startIso || trip.start);
                const endMs = Date.parse(trip.endIso || trip.end);
                const tripEvents = notificationsForTripWindow(normalized, startMs, endMs);
                return {
                  ...trip,
                  events: tripEvents,
                  notifications: Array.from(new Set(tripEvents.map((item) => item.notificationName)))
                };
              });
              const eventCount = nextTrips.reduce((sum, trip) => sum + trip.events.length, 0);
              return { ...row, trips: nextTrips, events: eventCount, hasEvents: eventCount > 0 };
            })
          );
        }

        const summarizedRows = scopedHistoryAssets
          .filter((row) => {
            if (row.trips.length === 0) return false;
            if (hasExplicitAsset) return true;
            return row.trips.length === 1 && historyTripDurationMs(row.trips[0]) >= HISTORY_SUMMARIZED_TRIP_MS;
          })
          .slice(0, hasExplicitAsset ? 1 : HISTORY_BACKGROUND_ROUTE_LIMIT);

        await mapPool(summarizedRows, 2, async (row) => {
          if (controller.signal.aborted || paintSeq !== historyLoadSeqRef.current) return;
          const deviceId = Number(row.id);
          if (!Number.isFinite(deviceId) || deviceId <= 0) return;
          const route = await getTraccarRoute({
            deviceId,
            from: fromIso,
            to: toIso,
            allowPositionsFallback: false
          }).catch(() => []);
          if (controller.signal.aborted || paintSeq !== historyLoadSeqRef.current) return;
          if (!Array.isArray(route) || route.length < 2) return;
          const resolved = deviceById.get(String(row.id));
          const samples: HistoryTrailSample[] = route.flatMap((point) => {
            const atMs = Date.parse(String(point.fixTime ?? point.deviceTime ?? ""));
            if (!Number.isFinite(atMs)) return [];
            const lat = Number(point.latitude);
            const lng = Number(point.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
            const speedKph = traccarSpeedToKph(point.speed, configuredMaxReasonableSpeedKph);
            const attrs = (point.attributes ?? {}) as Record<string, unknown>;
            const ignition = parseIgnition({ ignition: attrs.ignition, data: { ignition: attrs.ignition } });
            return [{
              lat,
              lng,
              atMs,
              moving: speedKph > 1,
              ignitionOn: ignition === "On",
              speedKph,
              location: pickString(point.address, `${lat.toFixed(6)}, ${lng.toFixed(6)}`, "—"),
              driver: formatDriverName(resolveTripDriverName(undefined, resolved?.sourceAsset, "No Driver")),
              registration: row.registration,
              site: row.site ?? ""
            }];
          });
          const splitTrips = resolveHistoryTripsFromSamples(
            row.trips,
            samples,
            row.trips.flatMap((trip) => trip.events),
            {
              assetId: row.id,
              site: row.site ?? "",
              siteTimeZones,
              maxReasonableSpeedKph: configuredMaxReasonableSpeedKph
            }
          );
          const trail = buildMovingTrail(samples);
          const tripStartMsList = splitTrips
            .map((trip) => Date.parse(trip.startIso || trip.start))
            .filter((value) => Number.isFinite(value));
          if (paintSeq !== historyLoadSeqRef.current) return;
          setHistoryTrailSamplesByAsset((current) => ({ ...current, [row.id]: samples }));
          setHistoryTrailsByAsset((current) => ({ ...current, [row.id]: trail }));
          setTripStartFlagsByAsset((current) => ({
            ...current,
            [row.id]: buildTripStartFlagsFromTrips(tripStartMsList, samples)
          }));
          setHistoryAssetsData((current) =>
            current.map((asset) => {
              if (asset.id !== row.id) return asset;
              const totalDistanceKm = splitTrips.reduce((sum, trip) => sum + (Number(trip.distanceKm) || 0), 0);
              const eventCount = splitTrips.reduce((sum, trip) => sum + trip.events.length, 0);
              return {
                ...asset,
                trips: splitTrips,
                totalDistance: totalDistanceKm.toFixed(2),
                events: eventCount,
                hasTrips: splitTrips.length > 0,
                hasEvents: eventCount > 0
              };
            })
          );
        });
      };

      void enrichHistoryAfterTripPaint();
      return scopedHistoryAssets.length > 0 || scopedMapAssets.length > 0;
    };

    const loadHistory = async () => {
      const loadSeq = ++historyLoadSeqRef.current;
      const apiKey = getApiKey();
      const tenant = getTenantId();
      const hasExistingVisuals = historyAssetsDataRef.current.length > 0 || historyMapAssetsDataRef.current.length > 0;
      let traccarReportsAttempted = false;
      try {
        setHistoryLoading(true);
        setHistoryError("");
        clearHistoryRetryTimers();
        setHistoryRetryActive(false);
        setHistoryRetryCountdown(0);

        if (!apiKey || !tenant) {
          clearHistoryVisuals();
          setHistoryError("Missing API key or tenant.");
          return;
        }

        const hasExplicitAssetSelection = Boolean(
          selectedAssetRef.current || selectedRegistrationRef.current || selectedImeiRef.current
        );

        // Prefer Traccar trip/route reports for registration, distance, and speed.
        // Telemetry/B2 is a fallback when Traccar has nothing for the range.
        const shouldPreferTelemetryFirst = false;

        if (!shouldPreferTelemetryFirst) {
          let hydratedFromReports = false;
          traccarReportsAttempted = true;
          try {
            hydratedFromReports = await hydrateFromTraccarReports();
          } catch (err) {
            setHistoryError(normalizeHistoryErrorMessage(err instanceof Error ? err.message : err));
          }
          if (hydratedFromReports) {
            retryAttemptRef.current = 0;
            return;
          }
          if (controller.signal.aborted) return;
        }

        if (telemetryHistoryRouteMissingRef.current) {
          let hydrated = false;
          if (!traccarReportsAttempted) {
            try { hydrated = await hydrateFromTraccarReports(); } catch {}
          }
          if (!hydrated && canUseLiveFallback) {
            try { hydrated = await hydrateFromLiveKpis(apiKey, tenant); } catch {}
          }
          if (hydrated) {
            setHistoryError("");
            retryAttemptRef.current = 0;
            return;
          }
          if (!hasExistingVisuals) clearHistoryVisuals();
          setHistoryError(
            hasExplicitAssetSelection
              ? "No historical trips found for this asset."
              : "No historical trips found for the selected scope."
          );
          return;
        }

        const fallbackEndMs = Date.now();
        const fallbackStartMs = fallbackEndMs - 24 * 60 * 60 * 1000;
        const safeFromIso = toValidIsoOrFallback(rangeStartRef.current, fallbackStartMs);
        const safeToIso = toValidIsoOrFallback(rangeEndRef.current, fallbackEndMs);

        const query = new URLSearchParams();
        query.set("from", safeFromIso);
        query.set("to", safeToIso);
        query.set("limit", "2000");

        if (selectedImeiRef.current) query.set("imei", selectedImeiRef.current);

        // Prefer /api/telemetry/history (Worker + VPS), then legacy /telemetry/history.
        let response = await fetch(buildApiUrl(`/api/telemetry/history?${query.toString()}`), {
          method: "GET",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "x-tenant-id": tenant
          }
        });
        if (response.status === 404) {
          response = await fetch(buildApiUrl(`/telemetry/history?${query.toString()}`), {
            method: "GET",
            signal: controller.signal,
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "x-tenant-id": tenant
            }
          });
          if (response.status === 404) {
            telemetryHistoryRouteMissingRef.current = true;
            if (typeof window !== "undefined") {
              window.localStorage.setItem(telemetryHistoryCapabilityKey, "unsupported");
            }
            let hydrated = false;
            if (!traccarReportsAttempted) {
              try { hydrated = await hydrateFromTraccarReports(); } catch {}
            }
            if (!hydrated && canUseLiveFallback) {
              try { hydrated = await hydrateFromLiveKpis(apiKey, tenant); } catch {}
            }
            if (hydrated) {
              setHistoryError("");
              retryAttemptRef.current = 0;
              return;
            }
            if (!hasExistingVisuals) clearHistoryVisuals();
            setHistoryError(
              hasExplicitAssetSelection
                ? "No historical trips found for this asset."
                : "No historical trips found for the selected scope."
            );
            return;
          }
        }

        telemetryHistoryRouteMissingRef.current = false;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(telemetryHistoryCapabilityKey, "supported");
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }

        const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
        if (!contentType.includes("application/json")) {
          const text = await response.text();
          throw new Error(text || "History API returned non-JSON response");
        }

        const payload = (await response.json()) as any;
        let events = Array.isArray(payload?.events) ? payload.events : [];

        // Hot store empty → pull B2 Track bucket archives (telemetry backup) when available.
        if (events.length === 0) {
          const archiveQuery = new URLSearchParams(query);
          archiveQuery.set("includeArchive", "true");
          archiveQuery.set("includeArchivePayload", "true");
          archiveQuery.set("limit", "200");
          try {
            let archiveResponse = await fetch(buildApiUrl(`/api/telemetry/history?${archiveQuery.toString()}`), {
              method: "GET",
              signal: controller.signal,
              headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
                "x-tenant-id": tenant
              }
            });
            if (archiveResponse.status === 404) {
              archiveResponse = await fetch(buildApiUrl(`/telemetry/history?${archiveQuery.toString()}`), {
                method: "GET",
                signal: controller.signal,
                headers: {
                  "content-type": "application/json",
                  "x-api-key": apiKey,
                  "x-tenant-id": tenant
                }
              });
            }
            if (archiveResponse.ok) {
              const archivePayload = (await archiveResponse.json()) as any;
              const hot = Array.isArray(archivePayload?.events) ? archivePayload.events : [];
              const archives = Array.isArray(archivePayload?.archives) ? archivePayload.archives : [];
              const fromArchives = archives
                .map((row: any) => {
                  const payloadBody = row?.payload;
                  if (!payloadBody || typeof payloadBody !== "object") return null;
                  const data =
                    payloadBody.data && typeof payloadBody.data === "object"
                      ? payloadBody.data
                      : payloadBody;
                  return {
                    id: String(row?.eventId ?? payloadBody.id ?? ""),
                    assetId: String(row?.assetId ?? payloadBody.assetId ?? ""),
                    imei: String(row?.imei ?? payloadBody.imei ?? ""),
                    createdAt: String(row?.createdAt ?? payloadBody.createdAt ?? ""),
                    data,
                    source: "b2-track-archive"
                  };
                })
                .filter(Boolean);
              events = [...hot, ...fromArchives];
            }
          } catch {
            // Archive backup is best-effort; fall through to Traccar.
          }
        }

        if (events.length === 0) {
          // No stored telemetry events — try Traccar once (skip if already attempted this load).
          let hydrated = false;
          if (!traccarReportsAttempted) {
            try { hydrated = await hydrateFromTraccarReports(); } catch {}
          }
          if (!hydrated && canUseLiveFallback) {
            try { hydrated = await hydrateFromLiveKpis(apiKey, tenant); } catch {}
          }
          if (!hydrated) {
            if (!hasExistingVisuals) clearHistoryVisuals();
            setHistoryError("No history available for this range.");
          }
          return;
        }

        const videoEnabledNotifications = await loadVideoEnabledNotificationNames();
        const selection = readStoredSelectionScope();
        const assetsLibrary = await loadScopedAssets();
        const assetsByImei = new Map<string, Record<string, unknown>>();
        const assetsById = new Map<string, Record<string, unknown>>();
        for (const asset of assetsLibrary) {
          const imeiKey = toImei(asset?.imei ?? asset?.uniqueId ?? "");
          if (imeiKey) assetsByImei.set(imeiKey, asset as Record<string, unknown>);
          const idKey = String(asset?.id ?? asset?.assetId ?? "").trim();
          if (idKey) assetsById.set(idKey, asset as Record<string, unknown>);
        }

        type Aggregated = {
          id: string;
          registration: string;
          assetDescription: string;
          site: string;
          trips: HistoryTrip[];
          eventCount: number;
          totalDistance: number;
          latestAt: string;
          latestForMap?: HistoryMapAsset;
        };

        const aggregated = new Map<string, Aggregated>();
        const trailSamplesByAsset = new Map<string, HistoryTrailSample[]>();
        const videoEventsByAsset = new Map<string, HistoryVideoTrailEvent[]>();

        for (const row of events) {
          const data = row?.data && typeof row.data === "object" ? row.data : {};
          const createdAtIso = String(row?.createdAt ?? row?.created_at ?? "").trim() || new Date().toISOString();
          const rowImei = toImei(row?.imei ?? data?.imei ?? data?.uniqueId ?? "");
          const libraryAsset =
            (rowImei ? assetsByImei.get(rowImei) : undefined)
            ?? assetsById.get(String(row?.assetId ?? data?.assetId ?? "").trim());
          // Prefer the fleet library site; never invent the active site for foreign telemetry.
          const rowSite =
            resolveAssetSiteName(libraryAsset)
            || resolveAssetSiteName({ site: data?.site, group: data?.group })
            || "";
          if (!rowSite || !matchesStoredSiteSelection(rowSite, selection)) continue;
          const labels = resolveHistoryAssetLabels(
            (libraryAsset as Record<string, unknown> | undefined) ?? (data as Record<string, unknown>),
            {
              imei: rowImei,
              selectedAsset: selectedAssetRef.current,
              selectedRegistration: selectedRegistrationRef.current,
              traccarName: String(data?.name ?? data?.assetName ?? "")
            }
          );
          const registration = labels.registration;
          const assetDescription = labels.assetDescription;
          const mapId = pickString(row?.assetId, rowImei, registration !== "—" ? registration : "", String(row?.id ?? ""));
          const key = mapId || `asset-${aggregated.size + 1}`;

          const rawSpeed = toFiniteNumber(data?.speed ?? data?.data?.speed ?? data?.gps?.speed) ?? 0;
          // Telemetry may store km/h already; treat small values consistent with knots as knots.
          const speedNum = rawSpeed > 0 && rawSpeed < 90
            ? clampReasonableSpeedKph(rawSpeed * 1.852, configuredMaxReasonableSpeedKph)
            : clampReasonableSpeedKph(rawSpeed, configuredMaxReasonableSpeedKph);
          const headingNum = toFiniteNumber(data?.heading ?? data?.course ?? data?.bearing);
          const heading = pickString(
            data?.heading,
            data?.headingText,
            data?.direction,
            Number.isFinite(headingNum) ? cardinalFromDegrees(Number(headingNum)) : ""
          ) || "N";
          const ignition = parseIgnition(data);
          const notifications = extractNotificationLabelsFromPayload(data);
          const distanceRaw = toFiniteNumber(data?.distanceKm ?? data?.distance ?? data?.tripDistance ?? data?.data?.distanceKm) ?? 0;
          const tripStartIso = String(data?.tripStart ?? data?.start ?? createdAtIso);
          const tripEndIso = String(data?.tripEnd ?? data?.end ?? createdAtIso);
          const tripStartMs = Date.parse(tripStartIso);
          const tripEndMs = Date.parse(tripEndIso);
          const distanceKm = normalizeTripDistanceKm(distanceRaw, tripStartMs, tripEndMs, configuredMaxReasonableSpeedKph);
          const lat = toFiniteNumber(data?.lat ?? data?.latitude ?? data?.location?.lat ?? data?.position?.lat ?? data?.gps?.lat);
          const lng = toFiniteNumber(data?.lng ?? data?.lon ?? data?.longitude ?? data?.location?.lng ?? data?.position?.lng ?? data?.gps?.lng);
          const coordinateLocation = Number.isFinite(lat) && Number.isFinite(lng)
            ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`
            : "";
          const driver = formatDriverName(data?.driver, data?.driverName, data?.data?.driver, data?.data?.driverName);
          const location = pickString(
            data?.locationName,
            data?.location,
            data?.address,
            data?.lastLocation,
            coordinateLocation,
            "—"
          ) || "—";

          const tripEvents: HistoryTripEvent[] = notifications.map((name, eventIndex) => ({
            id: `${String(row?.id ?? `${key}-${createdAtIso}`)}-event-${eventIndex + 1}`,
            notificationName: formatNotificationLabel(name),
            startIso: String(data?.eventStart ?? data?.start ?? tripStartIso),
            endIso: String(data?.eventEnd ?? data?.end ?? tripEndIso),
            site: rowSite,
            eventValue: formatEventValue(data?.eventValue ?? data?.value ?? data?.data?.value ?? data?.event?.value),
            location,
            driver,
            registration,
            lat,
            lng
          }));

          const trip: HistoryTrip = {
            id: String(row?.id ?? `${key}-${createdAtIso}`),
            start: formatHistoryDate(tripStartIso, rowSite, siteTimeZones),
            end: formatHistoryDate(tripEndIso, rowSite, siteTimeZones),
            startIso: tripStartIso,
            endIso: tripEndIso,
            site: rowSite,
            duration: formatDuration(tripStartIso, tripEndIso),
            distanceKm: distanceKm.toFixed(2),
            maxSpeed: speedNum.toFixed(2),
            events: tripEvents,
            notifications,
            assetId: key
          };

          const current = aggregated.get(key) ?? {
            id: key,
            registration,
            assetDescription,
            site: rowSite,
            trips: [],
            eventCount: 0,
            totalDistance: 0,
            latestAt: ""
          };
          // Prefer library labels once resolved (avoid IMEI from earlier rows).
          if (registration !== "—") current.registration = registration;
          if (assetDescription !== "—") current.assetDescription = assetDescription;

          current.trips.push(trip);
          current.eventCount += tripEvents.length;
          // Keep totals consistent with the trip rows by summing normalized km values.
          current.totalDistance += Math.max(0, distanceKm);

          if (typeof lat === "number" && typeof lng === "number") {
            const samples = trailSamplesByAsset.get(key) ?? [];
            const ignitionOn = ignition === "On";
            const atMs = parseEventTimestampMs(createdAtIso);
            samples.push({
              lat,
              lng,
              atMs,
              moving: isMovingHistorySample(data, speedNum),
              ignitionOn,
              speedKph: speedNum,
              location,
              driver,
              registration,
              site: rowSite
            });
            trailSamplesByAsset.set(key, samples);

            if (hasVideoEnabledNotification(notifications, videoEnabledNotifications)) {
              const matches = notifications.filter((label) => videoEnabledNotifications.has(label.trim().toLowerCase()));
              const videoEvents = videoEventsByAsset.get(key) ?? [];
              videoEvents.push({ lat, lng, atMs, labels: matches.length > 0 ? matches : notifications });
              videoEventsByAsset.set(key, videoEvents);
            }
          }

          if (!current.latestAt || Date.parse(createdAtIso) >= Date.parse(current.latestAt)) {
            current.latestAt = createdAtIso;
            if (typeof lat === "number" && typeof lng === "number") {
              const lastLocation = pickString(
                data?.lastLocation,
                data?.locationName,
                data?.location,
                data?.address,
                "—"
              ) || "—";
              current.latestForMap = {
                id: key,
                name: assetDescription,
                registration,
                assetDescription,
                site: pickString(data?.site, data?.group, "—") || "—",
                lastLocation,
                lastPosition: formatHistoryDate(createdAtIso, selectedSiteRef.current, siteTimeZones),
                driver,
                speed: `${speedNum.toFixed(0)} km/h`,
                heading,
                ignition,
                fuel: pickString(data?.fuel, data?.fuelLevel, data?.fuelReading, "—") || "—",
                status: parseStatus(speedNum, ignition),
                lat,
                lng
              };
            }
          }

          aggregated.set(key, current);
        }

        // Prefer path length from GPS samples when telemetry payloads omit distance/speed.
        for (const [key, row] of aggregated.entries()) {
          const samples = [...(trailSamplesByAsset.get(key) ?? [])].sort((a, b) => a.atMs - b.atMs);
          const pathKm = routeDistanceKmFromPoints(samples);
          if (pathKm > 0 && row.totalDistance <= 0) {
            row.totalDistance = pathKm;
          }
          row.trips = row.trips.map((trip) => {
            const startMs = Date.parse(trip.startIso || trip.start);
            const endMs = Date.parse(trip.endIso || trip.end);
            const slice = Number.isFinite(startMs) && Number.isFinite(endMs)
              ? samples.filter((sample) => sample.atMs >= startMs && sample.atMs <= endMs)
              : samples;
            const tripPathKm = routeDistanceKmFromPoints(slice);
            const reportedKm = Number(trip.distanceKm) || 0;
            const distanceKm = reportedKm > 0 ? reportedKm : tripPathKm;
            let sampleMax = 0;
            for (const sample of slice) {
              const speed = Number(sample.speedKph ?? 0);
              if (speed > sampleMax) sampleMax = speed;
            }
            const reportedSpeed = Number(trip.maxSpeed) || 0;
            const maxSpeed = sampleMax > 0 ? sampleMax : reportedSpeed;
            return {
              ...trip,
              distanceKm: distanceKm.toFixed(2),
              maxSpeed: maxSpeed.toFixed(2)
            };
          });
          const allTripEvents = row.trips.flatMap((trip) => trip.events);
          row.trips = resolveHistoryTripsFromSamples(row.trips, samples, allTripEvents, {
            assetId: key,
            site: row.site,
            siteTimeZones,
            maxReasonableSpeedKph: configuredMaxReasonableSpeedKph
          });
          row.eventCount = row.trips.reduce((sum, trip) => sum + trip.events.length, 0);
          if (pathKm > 0 || row.trips.length > 0) {
            row.totalDistance = row.trips.reduce((sum, trip) => sum + (Number(trip.distanceKm) || 0), 0);
          }
        }

        const nextAssets = Array.from(aggregated.values())
          .sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt))
          .map<HistoryAssetRow>((row) => ({
            id: row.id,
            registration: row.registration,
            assetDescription: row.assetDescription,
            site: row.site,
            totalDistance: row.totalDistance.toFixed(2),
            events: row.eventCount,
            hasTrips: row.trips.length > 0,
            hasEvents: row.eventCount > 0,
            trips: row.trips.sort((a, b) => Date.parse(b.startIso) - Date.parse(a.startIso))
          }));

        const nextMapAssets = Array.from(aggregated.values())
          .map((row) => row.latestForMap)
          .filter((row): row is HistoryMapAsset => Boolean(row));

        const trails: Record<string, HistoryTrailPoint[]> = {};
        const starts: Record<string, HistoryTrailPoint[]> = {};
        const recordedVideos: Record<string, HistoryVideoTrailEvent[]> = {};
        for (const [key, samples] of trailSamplesByAsset.entries()) {
          trails[key] = buildMovingTrail(samples);
          const rowTrips = aggregated.get(key)?.trips ?? [];
          const tripStartMsList = rowTrips
            .map((trip) => Date.parse(trip.startIso || trip.start))
            .filter((value) => Number.isFinite(value));
          starts[key] = buildTripStartFlagsFromTrips(tripStartMsList, samples);
        }
        for (const [key, points] of videoEventsByAsset.entries()) {
          recordedVideos[key] = points
            .sort((a, b) => a.atMs - b.atMs)
            .filter((point, index, list) => {
              const previous = list[index - 1];
              if (!previous) return true;
              return !(
                previous.atMs === point.atMs &&
                Math.abs(previous.lat - point.lat) < 0.000001 &&
                Math.abs(previous.lng - point.lng) < 0.000001 &&
                previous.labels.join("|") === point.labels.join("|")
              );
            });
        }

        const scopedAssets = applyScopeToHistory(nextAssets);
        const allowedIds = new Set(scopedAssets.map((row) => String(row.id ?? "").trim()).filter(Boolean));
        const scopedMapAssets = applyScopeToHistory(nextMapAssets).filter((row) => allowedIds.has(String(row.id ?? "").trim()));

        setHistoryAssetsData(scopedAssets);
        setHistoryMapAssetsData(scopedMapAssets);
        setHistoryTrailsByAsset(filterTrailRecord(trails, allowedIds));
        setHistoryTrailSamplesByAsset(
          filterTrailRecord(Object.fromEntries(trailSamplesByAsset.entries()), allowedIds)
        );
        setTripStartFlagsByAsset(filterTrailRecord(starts, allowedIds));
        setVideoTrailEventsByAsset(filterTrailRecord(recordedVideos, allowedIds));
        retryAttemptRef.current = 0;
      } catch (error: any) {
        if (controller.signal.aborted && !requestTimedOut) return;
        // After a hard timeout, do not kick off another full Traccar hydrate in the catch path —
        // that is what kept the spinner looping with an empty page.
        if (requestTimedOut) {
          if (!hasExistingVisuals) clearHistoryVisuals();
          setHistoryError("History request timed out. Select a single asset or try a shorter date range.");
          if (retryAttemptRef.current < 2) scheduleHistoryRetry();
          else {
            retryAttemptRef.current = 0;
            clearHistoryRetryTimers();
            setHistoryRetryActive(false);
            setHistoryRetryCountdown(0);
          }
        } else {
          let hydrated = false;
          try {
            const hydratedFromReports = traccarReportsAttempted
              ? false
              : await hydrateFromTraccarReports();
            hydrated = hydratedFromReports || (apiKey && tenant && canUseLiveFallback ? await hydrateFromLiveKpis(apiKey, tenant) : false);
            if (!hydrated) {
              if (!hasExistingVisuals) clearHistoryVisuals();
            }
          } catch {
            hydrated = false;
            if (!hasExistingVisuals) clearHistoryVisuals();
          }
          if (hydrated) {
            setHistoryError("");
            retryAttemptRef.current = 0;
            clearHistoryRetryTimers();
            setHistoryRetryActive(false);
            setHistoryRetryCountdown(0);
          } else {
            const reason = normalizeHistoryErrorMessage(error?.message);
            setHistoryError(reason || "No history data available for the selected range.");
            if (isTransientHistoryFailure(reason)) {
              scheduleHistoryRetry();
            } else {
              retryAttemptRef.current = 0;
              clearHistoryRetryTimers();
              setHistoryRetryActive(false);
              setHistoryRetryCountdown(0);
            }
          }
        }
      } finally {
        window.clearTimeout(requestTimeoutId);
        if (loadSeq === historyLoadSeqRef.current) setHistoryLoading(false);
      }
    };

    void loadHistory();
    return () => {
      window.clearTimeout(requestTimeoutId);
      controller.abort();
    };
  }, [reloadTrigger]);

  const buildTripSelectionKey = (assetId: string, tripId: string) => `${assetId}::${tripId}`;

  const isTripShownOnMap = (tripId: string, assetId: string) => Boolean(selectedTripsOnMap[buildTripSelectionKey(assetId, tripId)]);

  const handleShowOnMap = (trip: HistoryTrip, assetId: string) => {
    const key = buildTripSelectionKey(assetId, trip.id);
    setSelectedTripsOnMap((current) => {
      if (current[key]) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return {
        ...current,
        [key]: { assetId, trip }
      };
    });
    setOpenTripMenu(null);
  };

  const handleShowOnTimeline = (trip: HistoryTrip) => {
    writeUserPref(USER_PREF_KEYS.tripTimelineStart, trip.startIso || trip.start);
    writeUserPref(USER_PREF_KEYS.tripTimelineEnd, trip.endIso || trip.end);
    writeUserPref(USER_PREF_KEYS.tripTimelineAsset, selectedAsset);
    if (selectedImei) {
      writeUserPref(USER_PREF_KEYS.activeImei, selectedImei);
    }
    setOpenTripMenu(null);
    navigate("/Track/activity/trip-timeline");
  };

  const setAssetContext = (asset: HistoryMapAsset) => {
    const assetLabel = `${asset.name} - ${asset.registration}`;
    writeActiveAssetPrefs({
      asset: assetLabel,
      registration: asset.registration ?? "",
      imei: ""
    });
    const selection = readStoredSelectionScope();
    const site = resolveAssetSiteName(asset);
    if (site && matchesStoredSiteSelection(site, selection)) {
      localStorage.setItem("vivi.activeSite", site);
      localStorage.setItem(scopedStorageKey("vivi.activeSite"), site);
    }
    clearUserPref(USER_PREF_KEYS.contextType);
    clearUserPref(USER_PREF_KEYS.contextName);
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const handleViewLiveTracking = (asset: HistoryMapAsset) => {
    setAssetContext(asset);
    navigate("/Track/tracking/live");
  };

  const resolveHistoryTraccarDeviceId = async (asset: HistoryMapAsset): Promise<number | null> => {
    const direct = Number(asset.id);
    if (Number.isFinite(direct) && direct > 0) return Math.trunc(direct);

    const matchedAsset = selectAllAssets.find(
      (row) =>
        row.id === asset.id
        || row.registration === asset.registration
        || row.name === asset.name
    );
    const candidates = [
      matchedAsset?.imei,
      selectedImei,
      asset.registration,
      asset.id
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);

    for (const uniqueId of candidates) {
      const cached = traccarDeviceByUniqueIdRef.current.get(uniqueId);
      if (typeof cached === "number") return cached;
      const devices = await getTraccarDevices({ uniqueId });
      const deviceId = Number(devices[0]?.id);
      if (Number.isFinite(deviceId) && deviceId > 0) {
        traccarDeviceByUniqueIdRef.current.set(uniqueId, deviceId);
        return deviceId;
      }
    }
    return null;
  };

  const fitHistoryMapToTrailPoints = (points: Array<{ lat: number; lng: number }>) => {
    if (points.length < 2 || !historyMapRef) return;
    try {
      const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number]));
      historyMapRef.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true });
    } catch {
      // Best-effort map framing only.
    }
  };

  const hideHistoryTrailForAsset = (assetId: string) => {
    if (manualHistoryTrailAssetId !== assetId) return;
    setManualHistoryTrailAssetId(null);
    setManualHistoryTrailPoints([]);
    setManualHistoryTrailNotifications([]);
  };

  const loadManualTrailNotifications = async (
    deviceId: number | string,
    fromIso: string,
    toIso: string,
    routePoints: Array<{ id?: unknown; latitude?: unknown; longitude?: unknown; fixTime?: unknown; deviceTime?: unknown; serverTime?: unknown; address?: unknown }>
  ) => {
    const events = await getTraccarEvents({ deviceId, from: fromIso, to: toIso }).catch(() => []);
    const mapped = mapTraccarEventsToTrailNotifications(events, routePoints, {
      formatLabel: formatNotificationLabel
    });
    setManualHistoryTrailNotifications(
      mapped.map((event) => ({
        lat: event.lat,
        lng: event.lng,
        atMs: event.atMs ?? notificationEventAtMs(event),
        labels: event.labels ?? [],
        location: (event as { location?: string }).location
      }))
    );
  };

  const showHistoryTrailForAsset = async (asset: HistoryMapAsset) => {
    if (historyTrailLoadingId === asset.id) return;
    setHistoryTrailLoadingId(asset.id);
    try {
      const cachedSamples = historyTrailSamplesByAsset[asset.id] ?? [];
      if (cachedSamples.length >= 2) {
        const cachedTrail = buildMovingTrail(cachedSamples);
        const finalTrail = cachedTrail.length >= 2
          ? cachedTrail
          : cachedSamples.map((sample) => ({
              lat: sample.lat,
              lng: sample.lng,
              atMs: sample.atMs,
              speedKph: sample.speedKph,
              location: sample.location,
              driver: sample.driver,
              registration: sample.registration,
              site: sample.site
            }));
        if (finalTrail.length >= 2) {
          setManualHistoryTrailPoints(finalTrail);
          setManualHistoryTrailAssetId(asset.id);
          const deviceId = await resolveHistoryTraccarDeviceId(asset);
          if (deviceId) {
            const fallbackEndMs = Date.now();
            const fallbackStartMs = fallbackEndMs - 24 * 60 * 60 * 1000;
            const fromIso = toValidIsoOrFallback(rangeStart, fallbackStartMs);
            const toIso = toValidIsoOrFallback(rangeEnd, fallbackEndMs);
            const routeForEvents = cachedSamples.map((sample) => ({
              latitude: sample.lat,
              longitude: sample.lng,
              fixTime: new Date(sample.atMs).toISOString()
            }));
            await loadManualTrailNotifications(deviceId, fromIso, toIso, routeForEvents);
          } else {
            setManualHistoryTrailNotifications([]);
          }
          fitHistoryMapToTrailPoints(finalTrail);
          return;
        }
      }

      const fallbackEndMs = Date.now();
      const fallbackStartMs = fallbackEndMs - 24 * 60 * 60 * 1000;
      const fromIso = toValidIsoOrFallback(rangeStart, fallbackStartMs);
      const toIso = toValidIsoOrFallback(rangeEnd, fallbackEndMs);

      if (cms808HierarchyActive() || isCms808Server() || String(asset.id ?? "").startsWith("cms808:")) {
        const plate = String(asset.registration ?? "").trim();
        const device = await resolveCms808DeviceId({
          imei: asset.id,
          registration: plate,
          assetDescription: asset.assetDescription ?? asset.name
        }).catch(() => "");
        const fallbackDevice = String(asset.id ?? "").replace(/^cms808:/i, "").trim();
        const devIdno = device || (/^\d{6,}$/.test(fallbackDevice) ? fallbackDevice : "");
        if (devIdno) {
          const tracks = await loadCms808TrackRange(devIdno, new Date(fromIso), new Date(toIso), plate).catch(() => []);
          const trailPoints = mapCms808TracksToTrailPoints(tracks);
          if (trailPoints.length >= 2) {
            const samples: HistoryTrailSample[] = trailPoints.map((point) => {
              const speedKph = Math.max(0, Number(point.speedKph ?? 0));
              return {
                lat: point.lat,
                lng: point.lng,
                atMs: point.atMs,
                moving: speedKph > HISTORY_TRIP_MOVING_SPEED_KPH,
                ignitionOn: speedKph > HISTORY_TRIP_MOVING_SPEED_KPH,
                speedKph,
                location: point.location,
                registration: plate,
                site: asset.site || cms808SiteName()
              };
            });
            const finalTrail = buildMovingTrail(samples);
            setHistoryTrailSamplesByAsset((current) => ({ ...current, [asset.id]: samples }));
            setHistoryTrailsByAsset((current) => ({ ...current, [asset.id]: finalTrail }));
            setManualHistoryTrailPoints(finalTrail);
            setManualHistoryTrailAssetId(asset.id);
            setManualHistoryTrailNotifications([]);
            fitHistoryMapToTrailPoints(finalTrail);
            return;
          }
        }
      }

      const deviceId = await resolveHistoryTraccarDeviceId(asset);
      if (!deviceId) return;

      const route = await getTraccarRoute({ deviceId, from: fromIso, to: toIso });
      const finalTrail = buildTrailFromRoutePoints(route, {
        registration: asset.registration,
        site: asset.site,
        driver: asset.driver || formatDriverName(resolveAssetDriverName(asset as unknown as Record<string, unknown>))
      });
      if (finalTrail.length < 2) return;

      await loadManualTrailNotifications(deviceId, fromIso, toIso, route);

      const samples: HistoryTrailSample[] = route.flatMap((point) => {
        const atMs = Date.parse(String(point.fixTime ?? point.deviceTime ?? point.serverTime ?? ""));
        if (!Number.isFinite(atMs)) return [];
        const lat = Number(point.latitude);
        const lng = Number(point.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
        const speedKph = traccarSpeedToKph(point.speed, configuredMaxReasonableSpeedKph);
        const attrs = (point.attributes ?? {}) as Record<string, unknown>;
        const ignition = parseIgnition({ ignition: attrs.ignition, data: { ignition: attrs.ignition } });
        return [{
          lat,
          lng,
          atMs,
          moving: speedKph > 1,
          ignitionOn: ignition === "On",
          speedKph,
          location: pickString(point.address, `${lat.toFixed(6)}, ${lng.toFixed(6)}`, "—"),
          driver: asset.driver || "No Driver",
          registration: asset.registration,
          site: asset.site
        }];
      });
      setHistoryTrailSamplesByAsset((current) => ({ ...current, [asset.id]: samples }));
      setHistoryTrailsByAsset((current) => ({ ...current, [asset.id]: finalTrail }));
      setManualHistoryTrailPoints(finalTrail);
      setManualHistoryTrailAssetId(asset.id);
      fitHistoryMapToTrailPoints(finalTrail);
    } finally {
      setHistoryTrailLoadingId(null);
    }
  };

  const selectedTripEntries = useMemo(() => Object.values(selectedTripsOnMap), [selectedTripsOnMap]);

  useEffect(() => {
    const missingAssetIds = Array.from(
      new Set(
        selectedTripEntries
          .map((entry) => entry.assetId)
          .filter((assetId) => (historyTrailSamplesByAsset[assetId] ?? []).length < 2)
      )
    );
    if (missingAssetIds.length === 0) return;
    const mapAsset = historyMapAssetsData.find((asset) => missingAssetIds.includes(asset.id));
    if (mapAsset) void showHistoryTrailForAsset(mapAsset);
  }, [selectedTripEntries, historyMapAssetsData]);

  const selectedTrailSegments = useMemo(() => {
    const palette = ["#2563eb", "#ef4444", "#16a34a", "#f97316", "#7c3aed", "#0ea5e9"];
    return selectedTripEntries.map((entry, index) => {
      const points = historyTrailsByAsset[entry.assetId] ?? [];
      const samples = historyTrailSamplesByAsset[entry.assetId] ?? [];
      const start = parseTripTimestamp(entry.trip.startIso || entry.trip.start);
      const end = parseTripTimestamp(entry.trip.endIso || entry.trip.end);
      if (!start || !end) {
        return {
          key: buildTripSelectionKey(entry.assetId, entry.trip.id),
          assetId: entry.assetId,
          points: [] as HistoryTrailPoint[],
          color: palette[index % palette.length]
        };
      }
      const startMs = start.getTime();
      const endMs = end.getTime();

      let segment: HistoryTrailPoint[] = [];
      if (samples.length > 0) {
        let filteredSamples = samples.filter((point) => point.atMs >= startMs && point.atMs <= endMs);
        if (filteredSamples.length < 2) {
          filteredSamples = samples.filter(
            (point) => point.atMs >= startMs - 300_000 && point.atMs <= endMs + 300_000
          );
        }
        segment = buildMovingTrail(filteredSamples);
        if (segment.length < 2 && filteredSamples.length >= 2) {
          segment = filteredSamples
            .sort((a, b) => a.atMs - b.atMs)
            .map((sample) => ({
              lat: sample.lat,
              lng: sample.lng,
              atMs: sample.atMs,
              speedKph: sample.speedKph,
              location: sample.location,
              driver: sample.driver,
              registration: sample.registration,
              site: sample.site
            }));
        }
      }

      if (segment.length < 2) {
        segment = points.filter((point) => point.atMs >= startMs && point.atMs <= endMs);
      }
      if (segment.length < 2 && points.length >= 2) {
        segment = points.filter((point) => point.atMs >= startMs - 300_000 && point.atMs <= endMs + 300_000);
      }

      return {
        key: buildTripSelectionKey(entry.assetId, entry.trip.id),
        assetId: entry.assetId,
        points: segment,
        color: palette[index % palette.length]
      };
    });
  }, [historyTrailSamplesByAsset, historyTrailsByAsset, selectedTripEntries]);

  const historyTripStartFlags = useMemo(() => {
    const flags: Array<{ key: string; lat: number; lng: number; atMs: number; site?: string }> = [];
    const seen = new Set<string>();
    const push = (point: { lat: number; lng: number; atMs?: number; site?: string }, key: string) => {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
      const dedupe = `${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      flags.push({ key, lat: point.lat, lng: point.lng, atMs: Number(point.atMs) || 0, site: point.site });
    };
    for (const segment of selectedTrailSegments) {
      const start = segment.points[0];
      if (start) push(start, `segment-${segment.key}`);
    }
    if (manualHistoryTrailPoints[0] && manualHistoryTrailAssetId) {
      push(manualHistoryTrailPoints[0], `manual-${manualHistoryTrailAssetId}`);
    }
    const assetIds = new Set([
      ...selectedTripEntries.map((entry) => entry.assetId),
      ...(manualHistoryTrailAssetId ? [manualHistoryTrailAssetId] : [])
    ]);
    for (const assetId of assetIds) {
      for (const point of tripStartFlagsByAsset[assetId] ?? []) {
        push(point, `stored-${assetId}-${point.atMs}`);
      }
    }
    return flags;
  }, [
    selectedTrailSegments,
    selectedTripEntries,
    manualHistoryTrailPoints,
    manualHistoryTrailAssetId,
    tripStartFlagsByAsset
  ]);

  const historyReplayTrail = useMemo(() => {
    const points = selectedTrailSegments
      .flatMap((segment) => segment.points)
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Number.isFinite(point.atMs))
      .sort((a, b) => a.atMs - b.atMs)
      .filter((point, index, list) => {
        const prev = list[index - 1];
        if (!prev) return true;
        return !(Math.abs(prev.lat - point.lat) < 0.000001 && Math.abs(prev.lng - point.lng) < 0.000001);
      });
    return compressHistoryReplayTrail(points);
  }, [selectedTrailSegments]);

  const historyReplayMetrics = useMemo(
    () => buildHistoryReplayMetrics(historyReplayTrail),
    [historyReplayTrail]
  );
  const historyReplayMetricsRef = useRef(historyReplayMetrics);
  historyReplayMetricsRef.current = historyReplayMetrics;

  const historyReplayPosition = useMemo(() => {
    if (!historyReplayMetrics || historyReplayTrail.length < 2) return null;
    return interpolateHistoryTrailAtMs(historyReplayTrail, tripReplayAtMs ?? historyReplayMetrics.startMs);
  }, [historyReplayTrail, historyReplayMetrics, tripReplayAtMs]);

  const historyReplayTraveled = useMemo(() => {
    if (!tripReplayOpen || !historyReplayMetrics || historyReplayTrail.length < 2) return [] as [number, number][];
    return buildHistoryTraveledPositions(historyReplayTrail, tripReplayAtMs ?? historyReplayMetrics.startMs);
  }, [tripReplayOpen, historyReplayMetrics, historyReplayTrail, tripReplayAtMs]);

  const historyReplayDistanceKm = useMemo(() => {
    if (!historyReplayMetrics || tripReplayAtMs === null) return 0;
    return distanceKmAtHistoryTrailMs(historyReplayTrail, historyReplayMetrics.cumulativeDistanceKm, tripReplayAtMs);
  }, [historyReplayTrail, historyReplayMetrics, tripReplayAtMs]);

  const stopHistoryReplay = () => {
    setTripReplayPlaying(false);
    tripReplayLastFrameRef.current = null;
    if (tripReplayRafRef.current !== null) {
      cancelAnimationFrame(tripReplayRafRef.current);
      tripReplayRafRef.current = null;
    }
  };

  const resetHistoryReplay = () => {
    stopHistoryReplay();
    if (historyReplayMetrics) {
      tripReplayAtMsRef.current = historyReplayMetrics.startMs;
      setTripReplayAtMs(historyReplayMetrics.startMs);
    }
  };

  useEffect(() => {
    if (!historyReplayMetrics) {
      tripReplayAtMsRef.current = null;
      setTripReplayAtMs(null);
      stopHistoryReplay();
      return;
    }
    setTripReplayAtMs((current) => {
      if (current === null || current < historyReplayMetrics.startMs || current > historyReplayMetrics.endMs) {
        tripReplayAtMsRef.current = historyReplayMetrics.startMs;
        return historyReplayMetrics.startMs;
      }
      tripReplayAtMsRef.current = current;
      return current;
    });
  }, [historyReplayMetrics?.startMs, historyReplayMetrics?.endMs]);

  useEffect(() => {
    if (!tripReplayPlaying) {
      tripReplayLastFrameRef.current = null;
      if (tripReplayRafRef.current !== null) {
        cancelAnimationFrame(tripReplayRafRef.current);
        tripReplayRafRef.current = null;
      }
      return;
    }
    let cancelled = false;
    const tick = (now: number) => {
      if (cancelled || !tripReplayPlayingRef.current) return;
      const metrics = historyReplayMetricsRef.current;
      if (!metrics) {
        setTripReplayPlaying(false);
        return;
      }
      const last = tripReplayLastFrameRef.current ?? now;
      tripReplayLastFrameRef.current = now;
      const deltaSim = Math.max(0, now - last) * tripReplaySpeedRef.current;
      if (deltaSim <= 0) {
        tripReplayRafRef.current = requestAnimationFrame(tick);
        return;
      }
      const base = tripReplayAtMsRef.current ?? metrics.startMs;
      const next = Math.min(metrics.endMs, base + deltaSim);
      if (next >= metrics.endMs) {
        tripReplayAtMsRef.current = metrics.endMs;
        setTripReplayAtMs(metrics.endMs);
        setTripReplayPlaying(false);
        return;
      }
      tripReplayAtMsRef.current = next;
      setTripReplayAtMs(next);
      tripReplayRafRef.current = requestAnimationFrame(tick);
    };
    tripReplayLastFrameRef.current = performance.now();
    tripReplayRafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (tripReplayRafRef.current !== null) {
        cancelAnimationFrame(tripReplayRafRef.current);
        tripReplayRafRef.current = null;
      }
      tripReplayLastFrameRef.current = null;
    };
  }, [tripReplayPlaying]);

  useEffect(() => {
    return () => {
      if (tripReplayRafRef.current !== null) cancelAnimationFrame(tripReplayRafRef.current);
    };
  }, []);

  // Must sit below selectedTrailSegments — dependency arrays evaluate during render (TDZ otherwise).
  useEffect(() => {
    const allPoints = [
      ...selectedTrailSegments.flatMap((segment) => segment.points),
      ...(manualHistoryTrailAssetId ? manualHistoryTrailPoints : [])
    ];
    if (allPoints.length >= 2) {
      fitHistoryMapToTrailPoints(allPoints);
    }
  }, [manualHistoryTrailAssetId, manualHistoryTrailPoints, selectedTrailSegments, historyMapRef]);

  const selectedTripVideoEvents = useMemo(() => {
    const out: HistoryVideoTrailEvent[] = [];
    for (const entry of selectedTripEntries) {
      const points = videoTrailEventsByAsset[entry.assetId] ?? [];
      const start = parseTripTimestamp(entry.trip.startIso || entry.trip.start);
      const end = parseTripTimestamp(entry.trip.endIso || entry.trip.end);
      if (!start || !end) continue;
      const startMs = start.getTime();
      const endMs = end.getTime();
      out.push(...points.filter((point) => point.atMs >= startMs && point.atMs <= endMs));
    }
    return out;
  }, [videoTrailEventsByAsset, selectedTripEntries]);

  const selectedTripEvents = useMemo<HistoryTripEvent[]>(() => {
    const all = selectedTripEntries.flatMap((entry) => entry.trip.events ?? []);
    if (monitoredNotifications.size === 0) return [];
    return all.filter((ev) => monitoredNotifications.has(ev.notificationName));
  }, [selectedTripEntries, monitoredNotifications]);

  const tripEventsBySegmentKey = useMemo(() => {
    const map = new Map<string, HistoryTripEvent[]>();
    for (const entry of selectedTripEntries) {
      const key = buildTripSelectionKey(entry.assetId, entry.trip.id);
      const events =
        monitoredNotifications.size === 0
          ? []
          : (entry.trip.events ?? []).filter((event) => monitoredNotifications.has(event.notificationName));
      map.set(key, events);
    }
    return map;
  }, [selectedTripEntries, monitoredNotifications]);

  const selectedTrailPointCount = useMemo(() => {
    return selectedTrailSegments.reduce((sum, segment) => sum + segment.points.length, 0);
  }, [selectedTrailSegments]);

  const handleCreateLocation = () => {
    navigate("/Track/tracking/Control-locations");
  };

  const handleMeasureDistance = () => {
    setShowMapToolsPanel(false);
    setShowMapRotate(false);
    setMeasureMode((current) => (current === "distance" ? null : "distance"));
    setMeasureHint("Press at point A, drag to point B, then release.");
  };

  const HistoryMapClickHandler = () => {
    const map = useMap();
    useMapEvents({
      click() {
        if (measureMode === "distance") return;
        try {
          map.closePopup();
        } catch {
          // ignore
        }
        setShowNotifPopup(false);
        setShowLocationsPopup(false);
      }
    });
    return null;
  };

  const CaptureHistoryMap = ({ onMap }: { onMap: (map: L.Map | null) => void }) => {
    const map = useMap();
    useEffect(() => {
      onMap(map);
      return () => onMap(null);
    }, [map, onMap]);
    return null;
  };

  const HistoryMapReplayFollower = ({
    lat,
    lng,
    enabled
  }: {
    lat: number;
    lng: number;
    enabled: boolean;
  }) => {
    const map = useMap();
    const lastPanAtRef = useRef(0);
    useEffect(() => {
      if (!enabled || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const now = Date.now();
      if (now - lastPanAtRef.current < 350) return;
      lastPanAtRef.current = now;
      try {
        map.panTo([lat, lng], { animate: true, duration: 0.35 });
      } catch {
        // ignore pan failures during replay
      }
    }, [lat, lng, enabled, map]);
    return null;
  };

  const handleNotifications = () => {
    setShowNotifPopup(true);
    setNotifPopupLoading(true);
    void loadBoundNotificationOptionsForSite(readActiveSiteName())
      .then((options) => {
        setNotifPopupItems(
          options.map((opt, index) => ({
            id: `bound-notif-${index}-${String(opt.description ?? "").trim().toLowerCase().replace(/\s+/g, "-")}`,
            label: String(opt.description ?? "").trim()
          }))
        );
      })
      .catch(() => setNotifPopupItems([]))
      .finally(() => setNotifPopupLoading(false));
  };

  const handleLocationsPopup = () => {
    setShowLocationsPopup(true);
    if (locationsPopupItems.length === 0) {
      setLocationsPopupLoading(true);
      void getBindings<any>("locations")
        .then((items) => {
          const rows = Array.isArray(items) ? items : [];
          setLocationsPopupItems(filterRecordsForActiveSelection(rows));
        })
        .catch(() => setLocationsPopupItems([]))
        .finally(() => setLocationsPopupLoading(false));
    }
  };

  const handleOpenAssetsWindow = () => {
    window.open("/Track/fleet/assets", "_blank", "noopener,noreferrer");
  };

  const handleDownloadSummary = () => {
    const payload = {
      rangeStart,
      rangeEnd,
      asset: selectedAsset,
      site: selectedSite,
      trips: selectedTripEntries.map((entry) => entry.trip),
      assets: filteredAssets,
      mapAssets: historyMapAssetsData
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "historical-tracking-summary.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const focusFilter = () => {
    filterInputRef.current?.focus();
  };

  const handleHistoryColumnOrder = (dragged: HistoryColumnKey, dropTarget: HistoryColumnKey) => {
    if (!dragged || dragged === dropTarget) return;
    const next = normalizeHistoryColumnOrder(
      (() => {
        const ordered = columnOrder.filter((col) => col !== dragged);
        const targetIndex = ordered.indexOf(dropTarget);
        ordered.splice(Math.max(0, targetIndex), 0, dragged);
        return ordered;
      })()
    );
    setColumnOrder(next);
    localStorage.setItem(scopedStorageKey("vivi.historyColumnOrder"), JSON.stringify(next));
    setDragCol(null);
  };

  const renderHistoryCell = (row: HistoryAssetDerived, col: HistoryColumnKey) => {
    switch (col) {
      case "events":
        return (
          <div className="history-cell history-events">
            <button
              type="button"
              className="history-expander"
              aria-label={expandedRows.has(row.id) ? "Collapse row" : "Expand row"}
              aria-expanded={expandedRows.has(row.id)}
              onClick={() => toggleRow(row.id)}
            >
              {expandedRows.has(row.id) ? "−" : "+"}
            </button>
            <span className="history-event-count">{showEvents ? row.eventsInRange : 0}</span>
          </div>
        );
      case "registration":
        return <div className="history-cell">{row.registration}</div>;
      case "assetDescription":
        return <div className="history-cell history-asset-desc">{row.assetDescription}</div>;
      case "totalDistance":
        return <div className="history-cell history-distance">{row.totalDistance}</div>;
      default:
        return null;
    }
  };

  const handleOpenSelectAsset = () => {
    window.dispatchEvent(new CustomEvent("vivi.orgRibbon.open"));
  };

  useEffect(() => {
    if (!showSelectAsset) return;
    if (!selectDealer || !selectOrg || !selectDb) return;
    const tenantId = [selectDealer, selectOrg, selectDb].filter(Boolean).join(":");
    if (!tenantId || selectAssetsByTenant[tenantId]) return;

    const dealer = selectHierarchy.dealers.find((item) => item.id === selectDealer) ?? null;
    const organisation = dealer?.organisations?.find((item) => item.id === selectOrg) ?? null;
    const database = organisation?.databases?.find((item) => item.id === selectDb) ?? null;
    const databaseName = String(database?.name ?? "").trim();
    const siteNames = (database?.sites ?? []).map((item) => String(item?.name ?? "").trim()).filter(Boolean);

    let cancelled = false;
    setSelectAssetsLoading(true);
    void loadAssetsForTenant(tenantId, { databaseName, siteNames })
      .then((assets) => {
        if (cancelled) return;
        setSelectAssetsByTenant((current) => ({ ...current, [tenantId]: assets }));
        setSelectHierarchy((current) => enrichSelectHierarchyWithAssets(current, {
          dealerId: selectDealer,
          orgId: selectOrg,
          dbId: selectDb
        }, assets));
      })
      .finally(() => {
        if (!cancelled) setSelectAssetsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showSelectAsset, selectDealer, selectOrg, selectDb, selectAssetsByTenant]);

  const handleSelectScopeConfirm = () => {
    const dealer = selectHierarchy.dealers.find((item) => item.id === selectDealer) ?? null;
    const organisation = dealer?.organisations?.find((item) => item.id === selectOrg) ?? null;
    const database = organisation?.databases?.find((item) => item.id === selectDb) ?? null;
    const site = database?.sites?.find((item) => item.id === selectSite) ?? null;
    const scope = site ? "site" : database ? "db" : organisation ? "org" : dealer ? "dealer" : "";
    if (!scope || !dealer) return;

    const selectedPath = [dealer?.name, organisation?.name, database?.name, site?.name]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join("/");
    const tenantId = [dealer?.id, organisation?.id, database?.id].filter(Boolean).join(":");
    const dbSites = (database?.sites ?? []).map((item) => String(item?.name ?? "").trim()).filter(Boolean);
    if (!dbSites.some((name) => name.toLowerCase() === "default")) {
      dbSites.unshift("Default");
    }

    localStorage.setItem("vivi.selectedScope", scope);
    if (dealer?.id) localStorage.setItem("vivi.activeDealerId", dealer.id); else localStorage.removeItem("vivi.activeDealerId");
    if (organisation?.id) localStorage.setItem("vivi.activeOrgId", organisation.id); else localStorage.removeItem("vivi.activeOrgId");
    if (database?.id) localStorage.setItem("vivi.activeDbId", database.id); else localStorage.removeItem("vivi.activeDbId");
    if (site?.id) localStorage.setItem("vivi.activeSiteId", site.id); else localStorage.removeItem("vivi.activeSiteId");
    if (scope === "db" || scope === "site") localStorage.setItem("vivi.tenantId", tenantId); else localStorage.removeItem("vivi.tenantId");
    const previousSite = String(selectedSiteRef.current || readActiveSiteName() || "").trim();
    const nextSite = scope === "site" ? String(site?.name ?? "").trim() : "";
    if (scope === "site") {
      localStorage.setItem("vivi.activeSite", nextSite);
      localStorage.setItem(scopedStorageKey("vivi.activeSite", tenantId), nextSite);
    } else {
      localStorage.removeItem("vivi.activeSite");
      localStorage.removeItem(scopedStorageKey("vivi.activeSite", tenantId));
    }
    clearHistoryAssetSelectionStorage(scopedStorageKey, tenantId);
    const contextTypeValue = scope === "org" ? "organisation" : scope === "db" ? "database" : scope;
    const contextNameValue =
      scope === "site"
        ? String(site?.name ?? "")
        : scope === "db"
          ? String(database?.name ?? "")
          : scope === "org"
            ? String(organisation?.name ?? "")
            : String(dealer?.name ?? "");
    writeUserPref(USER_PREF_KEYS.contextType, contextTypeValue, tenantId);
    writeUserPref(USER_PREF_KEYS.contextName, contextNameValue, tenantId);
    localStorage.setItem("vivi.activeDbSites", JSON.stringify(dbSites));
    localStorage.setItem("vivi.selectedPath", selectedPath);

    setShowSelectAsset(false);
    setSelectPendingAsset(null);
    setSelectedAsset("");
    setSelectedRegistration("");
    setSelectedImei("");
    setSelectedSite(String(site?.name ?? ""));
    selectedAssetRef.current = "";
    selectedRegistrationRef.current = "";
    selectedImeiRef.current = "";
    selectedSiteRef.current = String(site?.name ?? "");
    setContextType(contextTypeValue);
    setContextName(contextNameValue);
    setSelectionLabel(buildHistorySelectionLabel(selectedPath, "", scope, contextNameValue));
    setHistoryAssetsData([]);
    setHistoryMapAssetsData([]);
    setHistoryTrailsByAsset({});
    setHistoryTrailSamplesByAsset({});
    setTripStartFlagsByAsset({});
    setVideoTrailEventsByAsset({});
    setSelectedTripsOnMap({});
    if (previousSite !== nextSite) {
      activateSiteContext(previousSite, nextSite);
    }
    lastOrgScopeSignatureRef.current = readOrgScopeSignature();
    lastContextSignatureRef.current = readContextSignature();
    setReloadTrigger((prev) => prev + 1);
    window.dispatchEvent(new Event("vivi:orgchange"));
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const handleSelectAssetConfirm = (asset: SelectAssetOption) => {
    setShowSelectAsset(false);
    setSelectPendingAsset(null);
    const label = asset.name;
    const registration = String(asset.registration ?? asset.name ?? "").trim();
    const basePath = typeof window === "undefined"
      ? ""
      : String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim();
    const pathParts = basePath
      .split("/")
      .map((part) => String(part ?? "").trim())
      .filter(Boolean);
    // Ensure path ends at site/db level before appending the selected asset.
    const lastPart = pathParts[pathParts.length - 1] ?? "";
    if (lastPart && lastPart.toLowerCase() === label.toLowerCase()) pathParts.pop();
    const selectedPath = [...pathParts, label].join("/");
    const previousSite = String(selectedSiteRef.current || readActiveSiteName() || "").trim();
    const nextSite = String(asset.site ?? "").trim();
    localStorage.setItem("vivi.selectedScope", "asset");
    localStorage.setItem("vivi.selectedPath", selectedPath);
    writeActiveAssetPrefs({
      asset: label,
      registration,
      imei: asset.imei || ""
    });
    localStorage.setItem("vivi.activeSite", nextSite);
    localStorage.setItem(scopedStorageKey("vivi.activeSite"), nextSite);
    writeUserPref(USER_PREF_KEYS.contextType, "asset");
    writeUserPref(USER_PREF_KEYS.contextName, label);
    setSelectedAsset(label);
    setSelectedRegistration(registration);
    setSelectedSite(nextSite);
    setSelectedImei(asset.imei || toImei(registration));
    selectedAssetRef.current = label;
    selectedRegistrationRef.current = registration;
    selectedSiteRef.current = nextSite;
    selectedImeiRef.current = asset.imei || toImei(registration);
    setContextType("asset");
    setContextName(label);
    setSelectionLabel(buildHistorySelectionLabel(selectedPath, label, "asset", label));
    setHistoryAssetsData([]);
    setHistoryMapAssetsData([]);
    setHistoryTrailsByAsset({});
    setHistoryTrailSamplesByAsset({});
    setTripStartFlagsByAsset({});
    setVideoTrailEventsByAsset({});
    setSelectedTripsOnMap({});
    if (previousSite !== nextSite) {
      activateSiteContext(previousSite, nextSite);
    }
    lastOrgScopeSignatureRef.current = readOrgScopeSignature();
    lastContextSignatureRef.current = readContextSignature();
    setReloadTrigger((prev) => prev + 1);
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const handleCloseSelectAsset = () => {
    setShowSelectAsset(false);
    setSelectPendingAsset(null);
  };

  const focusLayerSelect = () => {
    mapLayerSelectRef.current?.focus();
  };

  const toggleMapFullscreen = () => {
    if (!mapSectionRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void mapSectionRef.current.requestFullscreen();
  };

  const filteredAssets = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return derivedAssets.filter((row) => {
      // When a toggle is off, that criterion must not match. Both off → empty list.
      const matchesToggle =
        (showTrips && row.hasTripsInRange)
        || (showEvents && row.hasEventsInRange);
      if (!matchesToggle) return false;
      if (!query) return true;
      return (
        row.registration.toLowerCase().includes(query)
        || row.assetDescription.toLowerCase().includes(query)
      );
    });
  }, [derivedAssets, filter, showTrips, showEvents]);

  const getHistorySortValue = useCallback(
    (row: HistoryAssetDerived, key: HistoryColumnKey): unknown => {
      switch (key) {
        case "events":
          return showEvents ? row.eventsInRange : 0;
        case "registration":
          return row.registration;
        case "assetDescription":
          return row.assetDescription;
        case "totalDistance":
          return row.totalDistance;
        default:
          return "";
      }
    },
    [showEvents]
  );

  const { sortedRows: sortedFilteredAssets, getHeaderProps: getHistoryHeaderProps } = useColumnSort({
    rows: filteredAssets,
    getValue: getHistorySortValue
  });

  useEffect(() => {
    const validSelections = new Set(
      derivedAssets.flatMap((row) => row.tripsInRange.map((trip) => buildTripSelectionKey(row.id, trip.id)))
    );
    setSelectedTripsOnMap((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => validSelections.has(key))
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [derivedAssets]);

  const displayedRangeValues = useMemo(() => {
    const startMs = Date.parse(rangeStart);
    const endMs = Date.parse(rangeEnd);
    const fromText = Number.isFinite(startMs)
      ? (formatHistoryDate(new Date(startMs).toISOString(), selectedSite, siteTimeZones) || rangeStart)
      : rangeStart;
    const toText = Number.isFinite(endMs)
      ? (formatHistoryDate(new Date(endMs).toISOString(), selectedSite, siteTimeZones) || rangeEnd)
      : rangeEnd;
    return { fromText, toText };
  }, [rangeStart, rangeEnd, selectedSite, siteTimeZones]);

  useEffect(() => {
    const updateFromStorage = (tenantIdOverride?: string) => {
      const nextTenantId = resolveScopedTenantId(tenantIdOverride);
      const nextScope = readSelectedScope();
      const nextOrgScopeSignature = readOrgScopeSignature();
      lastOrgScopeSignatureRef.current = nextOrgScopeSignature;
      setActiveTenantId((current) => (current === nextTenantId ? current : nextTenantId));
      const site = readScopedStorage("vivi.activeSite", nextTenantId) || "";
      const reg = readUserPref(USER_PREF_KEYS.activeRegistration, nextTenantId);
      const imei = readUserPref(USER_PREF_KEYS.activeImei, nextTenantId);
      const assetLabel = readUserPref(USER_PREF_KEYS.activeAsset, nextTenantId) || "";
      const derivedReg = reg || (assetLabel?.includes(" - ") ? assetLabel.split(" - ").slice(-1)[0] : assetLabel);
      const storedContextType = readUserPref(USER_PREF_KEYS.contextType, nextTenantId) || "";
      const storedContextName = readUserPref(USER_PREF_KEYS.contextName, nextTenantId) || "";
      const selectedPath = typeof window === "undefined"
        ? ""
        : String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim();
      const resolved = resolveHistoryAssetScope({
        scope: nextScope,
        assetLabel,
        selectedPath,
        contextType: storedContextType
      });
      const effectiveScope = resolved.scope;
      const shouldKeepExplicitAssetSelection = resolved.keepAsset;
      let pathForLabel = selectedPath;
      // Always strip a trailing leftover vehicle from the path when scope is not asset.
      if (!shouldKeepExplicitAssetSelection && selectedPath) {
        const parts = selectedPath.split("/").map((part) => part.trim()).filter(Boolean);
        const last = parts[parts.length - 1] ?? "";
        if (assetLabel && last.toLowerCase() === assetLabel.toLowerCase()) {
          pathForLabel = parts.slice(0, -1).join("/");
          localStorage.setItem("vivi.selectedPath", pathForLabel);
        }
      }
      setSelectedSite(site || "");
      if (shouldKeepExplicitAssetSelection) {
        setSelectedAsset(assetLabel || "");
        setSelectedRegistration(derivedReg || "");
        setSelectedImei(imei || toImei(derivedReg || ""));
        setContextType(storedContextType || "asset");
        setContextName(storedContextName || assetLabel);
      } else {
        // Site/db/org selection: drop any leftover asset keys (including tenant-scoped).
        if (assetLabel || reg || imei) {
          clearHistoryAssetSelectionStorage(scopedStorageKey, nextTenantId);
        }
        setSelectedAsset("");
        setSelectedRegistration("");
        setSelectedImei("");
        setContextType(storedContextType === "asset" ? (effectiveScope === "org" ? "organisation" : effectiveScope === "db" ? "database" : effectiveScope) : storedContextType);
        setContextName(storedContextType === "asset" ? "" : storedContextName);
      }
      setSelectionLabel(buildHistorySelectionLabel(
        pathForLabel,
        shouldKeepExplicitAssetSelection ? assetLabel : "",
        effectiveScope,
        shouldKeepExplicitAssetSelection
          ? (storedContextName || assetLabel)
          : (storedContextType === "asset" ? "" : storedContextName)
      ));
      const storedTime = readScopedStorage("vivi.historyTime", nextTenantId) || readScopedStorage("vivi.historyEnd", nextTenantId);
      if (storedTime) {
        const nextEnd = toValidHistoryDateTimeLocal(storedTime, fallbackHistoryEnd);
        setRangeEnd(nextEnd);
        localStorage.setItem(scopedStorageKey("vivi.historyTime", nextTenantId), nextEnd);
        localStorage.setItem(scopedStorageKey("vivi.historyEnd", nextTenantId), nextEnd);
      }
      const storedStart = readScopedStorage("vivi.historyStart", nextTenantId);
      if (storedStart) {
        const nextStart = toValidHistoryDateTimeLocal(storedStart, fallbackHistoryStart);
        setRangeStart(nextStart);
        localStorage.setItem(scopedStorageKey("vivi.historyStart", nextTenantId), nextStart);
      }
    };
    updateFromStorage();
    const handleStorage = (event: StorageEvent) => {
      const scopedHistoryTime = scopedStorageKey("vivi.historyTime");
      const scopedHistoryStart = scopedStorageKey("vivi.historyStart");
      const scopedHistoryEnd = scopedStorageKey("vivi.historyEnd");
      if (
        event.key?.startsWith("vivi.active")
        || event.key?.startsWith("vivi.context")
        || event.key === "vivi.selectedScope"
        || event.key === "vivi.selectedPath"
        || event.key === "vivi.activeDbSites"
        || event.key === scopedHistoryTime
        || event.key === scopedHistoryStart
        || event.key === scopedHistoryEnd
        || event.key === "vivi.historyTime"
        || event.key === "vivi.historyStart"
        || event.key === "vivi.historyEnd"
      ) {
        updateFromStorage();
        const nextSignature = readContextSignature();
        if (nextSignature !== lastContextSignatureRef.current) {
          lastContextSignatureRef.current = nextSignature;
          setSelectedTripsOnMap({});
          setHistoryAssetsData([]);
          setHistoryMapAssetsData([]);
          setHistoryTrailsByAsset({});
          setHistoryTrailSamplesByAsset({});
          setTripStartFlagsByAsset({});
          setVideoTrailEventsByAsset({});
          setManualHistoryTrailAssetId(null);
          setManualHistoryTrailPoints([]);
          setReloadTrigger((prev) => prev + 1);
        }
      }
    };
    const handleContextChange = () => {
      const previousOrgSignature = lastOrgScopeSignatureRef.current;
      updateFromStorage();
      const nextSignature = readContextSignature();
      const nextOrgSignature = readOrgScopeSignature();
      const siteOrPathChanged =
        nextSignature !== lastContextSignatureRef.current
        || nextOrgSignature !== previousOrgSignature;
      if (siteOrPathChanged) {
        lastContextSignatureRef.current = nextSignature;
        lastOrgScopeSignatureRef.current = nextOrgSignature;
        setSelectedTripsOnMap({});
        setHistoryAssetsData([]);
        setHistoryMapAssetsData([]);
        setHistoryTrailsByAsset({});
        setHistoryTrailSamplesByAsset({});
        setTripStartFlagsByAsset({});
        setVideoTrailEventsByAsset({});
        setManualHistoryTrailAssetId(null);
        setManualHistoryTrailPoints([]);
        setReloadTrigger((prev) => prev + 1);
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("vivi:orgchange", handleContextChange as EventListener);
    window.addEventListener("vivi:contextchange", handleContextChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("vivi:orgchange", handleContextChange as EventListener);
      window.removeEventListener("vivi:contextchange", handleContextChange as EventListener);
    };
  }, [selectedAsset, tenantStorageSuffix, fallbackHistoryEnd, fallbackHistoryStart]);

  return (
    <div className="history-page">
      <header className="live-topbar">
        <div className="live-topbar-left">
          <div className="live-topbar-title">Historical tracking</div>
          <button
            type="button"
            className="history-select-asset-btn"
            data-toast-ignore
            onClick={handleOpenSelectAsset}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            {selectionLabel || "Select Asset"}
          </button>

          <div className="history-preset-dropdown" ref={presetDateRef}>
            <button
              type="button"
              className="history-preset-btn"
              data-toast-ignore
              onClick={() => setShowPresetDropdown(!showPresetDropdown)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Preset Date
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`dropdown-chevron${showPresetDropdown ? " open" : ""}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showPresetDropdown && (
              <div className="history-preset-menu">
                <button
                  type="button"
                  className="history-preset-option"
                  onClick={() => applyPresetDateRange("last24h")}
                >
                  <span className="preset-icon">📅</span>
                  Last 24 hours
                </button>
                <button
                  type="button"
                  className="history-preset-option"
                  onClick={() => applyPresetDateRange("last7d")}
                >
                  <span className="preset-icon">📅</span>
                  Last 7 days
                </button>
                <button
                  type="button"
                  className="history-preset-option"
                  onClick={() => applyPresetDateRange("last30d")}
                >
                  <span className="preset-icon">📅</span>
                  Last 30 days
                </button>
                <button
                  type="button"
                  className="history-preset-option"
                  onClick={() => applyPresetDateRange("thisMonth")}
                >
                  <span className="preset-icon">📅</span>
                  This month
                </button>
                <div className="history-preset-divider" />
                <button
                  type="button"
                  className="history-preset-option history-preset-option--custom"
                  onClick={handleOpenCustomDateModal}
                >
                  <span className="preset-icon">✏️</span>
                  Custom
                </button>
              </div>
            )}
          </div>
          <div className="history-range-chips" aria-label="Selected date range">
            <button
              type="button"
              className="history-range-chip history-range-chip--button"
              title={`From ${displayedRangeValues.fromText}`}
              onClick={() => openHistoryDatePicker("from")}
            >
              <span>From:</span>
              <strong>{displayedRangeValues.fromText}</strong>
            </button>
            <button
              type="button"
              className="history-range-chip history-range-chip--button"
              title={`To ${displayedRangeValues.toText}`}
              onClick={() => openHistoryDatePicker("to")}
            >
              <span>To:</span>
              <strong>{displayedRangeValues.toText}</strong>
            </button>
          </div>
        </div>
        <div className="live-topbar-right">
          <button
            className="live-topbar-chip"
            type="button"
            data-tooltip="Reload"
            data-toast-ignore
            disabled={historyLoading}
            onClick={() => setReloadTrigger((prev) => prev + 1)}
          >
            <span className="live-chip-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </span>
          </button>
          <button
            className="live-topbar-chip"
            type="button"
            data-tooltip="Notifications"
            data-toast-ignore
            onClick={handleNotifications}
          >
            <span className="live-chip-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                <path d="M9 19a3 3 0 006 0" />
              </svg>
            </span>
            {monitoredNotifications.size > 0 ? (
              <span className="history-topbar-badge history-topbar-badge--active">{monitoredNotifications.size}</span>
            ) : (
              notifPopupItems.length > 0 ? notifPopupItems.length : ""
            )}
          </button>
          <button
            className="live-topbar-chip"
            type="button"
            data-tooltip="Locations"
            data-toast-ignore
            onClick={handleLocationsPopup}
          >
            <span className="live-chip-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
                <circle cx="12" cy="10" r="2.6" />
              </svg>
            </span>
            {locationsPopupItems.length > 0 ? locationsPopupItems.length : ""}
          </button>
        </div>
      </header>

      {historyRetryActive && (
        <div className="history-retry-banner" role="status" aria-live="polite">
          <span>Historical data is temporarily unavailable. Use Reload to try again.</span>
          <button type="button" onClick={triggerHistoryRetryNow}>Retry now</button>
        </div>
      )}

      <div className={`history-layout${sidebarExpanded ? "" : " collapsed"}`}>
        {historyLoading && (
          <div className="history-loading-overlay" role="status" aria-live="polite" aria-label="Loading historical data">
            <VTLoader label="Loading" />
          </div>
        )}
        <aside
          className={`history-sidebar${sidebarExpanded ? "" : " collapsed"}`}
          style={{ width: sidebarExpanded ? sidebarWidth : undefined }}
        >
          <div className="history-sidebar-header">
            <div className="history-sidebar-title">Assets</div>
            <button
              type="button"
              className="history-collapse"
              onClick={() => setSidebarExpanded((current) => !current)}
              aria-label={sidebarExpanded ? "Collapse panel" : "Expand panel"}
            >
              {sidebarExpanded ? "❮" : "❯"}
            </button>
          </div>
          <div className="history-search">
            <input
              className="history-input"
              placeholder="Filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              ref={filterInputRef}
            />
          </div>
          <div className="history-toggles">
            <label>
              <input
                type="checkbox"
                checked={showTrips}
                onChange={(event) => setShowTrips(event.target.checked)}
              />
              Assets with trips
            </label>
            <label>
              <input
                type="checkbox"
                checked={showEvents}
                onChange={(event) => {
                  setShowEvents(event.target.checked);
                }}
              />
              Assets with notifications
            </label>
          </div>

          <div className="history-table-wrapper">
            <div className="history-table-scroll" ref={tableScrollRef}>
              <div
                className="history-table-scroll-content"
                ref={tableContentRef}
                style={{ minWidth: `max(100%, ${historyTableMinWidth}px)`, gridTemplateColumns: historyGridTemplate }}
              >
                <div className="history-table-head">
                  {activeHistoryCols.map((col) => (
                    <div
                      key={col.key}
                      className={`history-col${dragCol === col.key ? " dragging" : ""}`}
                      style={{ minWidth: `var(--history-col-min-${col.key}, ${col.minWidth}px)` }}
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
                        const dragged = event.dataTransfer.getData("text/plain") || dragCol;
                        handleHistoryColumnOrder(dragged as HistoryColumnKey, col.key);
                      }}
                      onDragEnd={() => setDragCol(null)}
                    >
                      <SortableColumnHeader label={col.label} {...getHistoryHeaderProps(col.key)} />
                    </div>
                  ))}
                </div>
                <div className="history-table">
              {sortedFilteredAssets.length === 0 ? (
                <div className="history-empty">
                  {historyError
                    ? historyError
                    : !showTrips && !showEvents
                      ? "Enable Assets with trips or Assets with notifications to view results."
                      : historyAssetsData.length > 0
                        ? "No trips in the selected time range."
                        : contextType === "asset" || selectedAsset
                          ? "No historical trips found for this asset."
                          : contextType && contextName
                            ? `No historical trips found for this ${contextType}.`
                            : "No historical trips found for the selected scope."}
                </div>
              ) : (
                sortedFilteredAssets.map((row) => (
                  <div key={row.id} className="history-row-group">
                    <div className="history-row">
                      {activeHistoryCols.map((col) => (
                        <div key={col.key} className="history-row-cell">
                          {renderHistoryCell(row, col.key)}
                        </div>
                      ))}
                    </div>
                    {expandedRows.has(row.id) && (
                      <div className="history-row-detail">
                        {row.tripsInRange.length === 0 ? (
                          <div className="history-detail-empty">No trips found in the selected time range.</div>
                        ) : (
                          <div className="history-detail-table">
                            <div className="history-detail-head">
                              <div />
                              <div>Trip Start</div>
                              <div>Trip End</div>
                              <div>Duration</div>
                              <div>Distance (km)</div>
                              <div>Max Speed (km/h)</div>
                              <div />
                            </div>
                            {row.tripsInRange.map((trip) => (
                              <div key={trip.id} className="history-trip-block">
                                <div className={`history-detail-row${isTripShownOnMap(trip.id, row.id) ? " on-map" : ""}`}>
                                  <div className="history-trip-toggle-cell">
                                    <button
                                      type="button"
                                      className="history-trip-expander"
                                      aria-label={expandedTrips.has(trip.id) ? "Collapse trip notifications" : "Expand trip notifications"}
                                      aria-expanded={expandedTrips.has(trip.id)}
                                      disabled={!showEvents}
                                      onClick={() => {
                                        if (!showEvents) return;
                                        toggleTrip(trip.id);
                                      }}
                                    >
                                      {showEvents ? (expandedTrips.has(trip.id) ? "▾" : "▸") : "·"}
                                    </button>
                                    <span className="history-trip-event-count">{showEvents ? trip.events.length : 0}</span>
                                  </div>
                                  <div>{trip.start}</div>
                                  <div>{trip.end}</div>
                                  <div>{trip.duration}</div>
                                  <div>{trip.distanceKm}</div>
                                  <div>{trip.maxSpeed}</div>
                                  <div className="history-detail-actions">
                                    <button
                                      type="button"
                                      className="history-actions-trigger"
                                      aria-label="Trip actions"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setOpenTripMenu((current) => (current === trip.id ? null : trip.id));
                                      }}
                                    >
                                      ⋯
                                    </button>
                                    {openTripMenu === trip.id && (
                                      <div
                                        className="history-actions-pop"
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        <button type="button" onClick={() => handleShowOnMap(trip, row.id)}>
                                          {isTripShownOnMap(trip.id, row.id) ? "Hide on map" : "Show on map"}
                                        </button>
                                        <button type="button" onClick={() => handleShowOnTimeline(trip)}>Show on trip timeline</button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {showEvents && expandedTrips.has(trip.id) && (
                                  <div className="history-event-table">
                                    <div className="history-event-head">
                                      <div>Notification Name</div>
                                      <div>Start Date and Time</div>
                                      <div>End Date and Time</div>
                                      <div>Notification Value</div>
                                    </div>
                                    {trip.events.length === 0 ? (
                                      <div className="history-event-empty">No notifications for this trip.</div>
                                    ) : (
                                      trip.events.map((event) => (
                                        <div key={event.id} className="history-event-row">
                                          <div>{event.notificationName}</div>
                                          <div>{formatHistoryDate(event.startIso, event.site ?? row.site ?? selectedSite, siteTimeZones) || "—"}</div>
                                          <div>{formatHistoryDate(event.endIso, event.site ?? row.site ?? selectedSite, siteTimeZones) || "—"}</div>
                                          <div>{event.eventValue || "—"}</div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div
          className={`history-resizer${dragging ? " dragging" : ""}`}
          onMouseDown={() => setDragging(true)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
        >
          <span className="history-resizer-dots" aria-hidden="true">⋮</span>
        </div>

        <section
          className={`history-map live-map${measureMode === "distance" ? " measure-distance-active" : ""}`}
          ref={mapSectionRef}
        >
          <div className="map-leaflet-canvas" style={{ transform: `rotate(${mapRotation}deg)` }}>
            <MapContainer
              center={dynamicMapCenter}
              zoom={7}
              scrollWheelZoom
              zoomControl={false}
              className="map-leaflet"
            >
              <CaptureHistoryMap onMap={handleHistoryMapRef} />
              <MapZoomControls />
              <HistoryMapClickHandler />
              {measureMode === "distance" && (
                <MapDistanceMeasure
                  active
                  onStatusChange={(status) => {
                    if (status.hint) setMeasureHint(status.hint);
                  }}
                />
              )}
              <TileLayer
                key={mapLayer}
                subdomains="0123"
                attribution={baseLayers[mapLayer].attribution}
                url={baseLayers[mapLayer].url}
              />
              {historyMapAssetsData.map((asset) => (
                <Marker key={asset.id} position={[asset.lat, asset.lng]} icon={historyAssetIcon}>
                  <Popup>
                    <div className="easytrack-popup">
                      <div className="easytrack-popup-title">Asset info</div>
                      <div className="easytrack-popup-body">
                        <div className="easytrack-popup-row">
                          <span>Asset</span>
                          <strong>{`${asset.name} - ${asset.registration}`}</strong>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Site</span>
                          <div>{asset.site}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Location</span>
                          <div>{asset.lastLocation || "—"}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Last position</span>
                          <div>{asset.lastPosition}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Speed</span>
                          <div>{asset.speed}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Driver</span>
                          <div>{formatDriverName(asset.driver)}</div>
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
                          <span>Fuel</span>
                          <div>{asset.fuel}</div>
                        </div>
                        <div className="easytrack-popup-fuel">
                          <button
                            type="button"
                            className="easytrack-popup-link"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (manualHistoryTrailAssetId === asset.id) {
                                hideHistoryTrailForAsset(asset.id);
                              } else {
                                void showHistoryTrailForAsset(asset);
                              }
                            }}
                          >
                            {historyTrailLoadingId === asset.id
                              ? "Loading trail..."
                              : manualHistoryTrailAssetId === asset.id
                                ? "Hide trail on map"
                                : "Show trail on map"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {manualHistoryTrailAssetId && manualHistoryTrailPoints.length > 1 ? (
                <>
                  <Polyline
                    key={`history-manual-trail-halo-${manualHistoryTrailAssetId}`}
                    positions={manualHistoryTrailPoints.map((point) => [point.lat, point.lng])}
                    pathOptions={{ color: "#7c2d12", weight: 8, opacity: 0.22, lineCap: "round", lineJoin: "round" }}
                  />
                  <Polyline
                    key={`history-manual-trail-line-${manualHistoryTrailAssetId}`}
                    positions={manualHistoryTrailPoints.map((point) => [point.lat, point.lng])}
                    pathOptions={{ color: "#ff5722", weight: 4, opacity: 0.95, lineCap: "round", lineJoin: "round" }}
                  />
                </>
              ) : null}
              {manualHistoryTrailAssetId && manualHistoryTrailPoints.length > 1
                ? (() => {
                    const manualEvents = manualHistoryTrailNotifications;
                    const matchedNotificationKeys = new Set<string>();
                    const notificationTriangleIcon = buildTrailNotificationTriangleIcon("online");

                    const trailMarkers = manualHistoryTrailPoints.map((point) => {
                      const matchedNotification = matchNotificationToTrailPoint(point, manualEvents, "historical");
                      if (matchedNotification) {
                        matchedNotificationKeys.add(
                          `${matchedNotification.atMs}|${matchedNotification.lat}|${matchedNotification.lng}`
                        );
                        return (
                          <Marker
                            key={`history-manual-trail-notif-${point.atMs}`}
                            position={[point.lat, point.lng]}
                            icon={notificationTriangleIcon}
                          >
                            <Popup>
                              <div className="history-notification-popup">
                                <div className="history-notification-popup-title">Notification Info</div>
                                <div className="history-notification-popup-body">
                                  <div className="history-notification-popup-row">
                                    <span>Notification</span>
                                    <strong>{matchedNotification.labels.join(", ") || "—"}</strong>
                                  </div>
                                  <div className="history-notification-popup-row">
                                    <span>Date and time</span>
                                    <div>
                                      {formatHistoryDate(
                                        new Date(matchedNotification.atMs).toISOString(),
                                        point.site ?? selectedSite,
                                        siteTimeZones
                                      ) || "—"}
                                    </div>
                                  </div>
                                  <div className="history-notification-popup-row">
                                    <span>Location</span>
                                    <div>{matchedNotification.location || point.location || "—"}</div>
                                  </div>
                                </div>
                              </div>
                            </Popup>
                          </Marker>
                        );
                      }

                      return (
                        <CircleMarker
                          key={`history-manual-trail-dot-${point.atMs}`}
                          center={[point.lat, point.lng]}
                          radius={2.5}
                          pathOptions={{ color: "#ffedd5", fillColor: "#ffedd5", fillOpacity: 0.9, weight: 1 }}
                        />
                      );
                    });

                    const orphanNotificationMarkers = manualEvents
                      .filter((event) => {
                        const key = `${event.atMs}|${event.lat}|${event.lng}`;
                        return !matchedNotificationKeys.has(key);
                      })
                      .map((event, index) => (
                        <Marker
                          key={`history-manual-trail-notif-orphan-${event.atMs}-${index}`}
                          position={[event.lat, event.lng]}
                          icon={notificationTriangleIcon}
                        >
                          <Popup>
                            <div className="history-notification-popup">
                              <div className="history-notification-popup-title">Notification Info</div>
                              <div className="history-notification-popup-body">
                                <div className="history-notification-popup-row">
                                  <span>Notification</span>
                                  <strong>{event.labels.join(", ") || "—"}</strong>
                                </div>
                                <div className="history-notification-popup-row">
                                  <span>Date and time</span>
                                  <div>
                                    {formatHistoryDate(
                                      new Date(event.atMs).toISOString(),
                                      selectedSite,
                                      siteTimeZones
                                    ) || "—"}
                                  </div>
                                </div>
                                <div className="history-notification-popup-row">
                                  <span>Location</span>
                                  <div>{event.location || "—"}</div>
                                </div>
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      ));

                    return [...trailMarkers, ...orphanNotificationMarkers];
                  })()
                : null}
              {selectedTrailSegments.flatMap((segment) => (
                segment.points.length > 1
                  ? [
                      <Polyline
                        key={`history-segment-halo-${segment.key}`}
                        positions={segment.points.map((point) => [point.lat, point.lng])}
                        pathOptions={{ color: segment.color, weight: 8, opacity: 0.2, lineCap: "round", lineJoin: "round" }}
                      />,
                      <Polyline
                        key={`history-segment-line-${segment.key}`}
                        positions={segment.points.map((point) => [point.lat, point.lng])}
                        pathOptions={{ color: segment.color, weight: 4, opacity: 0.95, lineCap: "round", lineJoin: "round" }}
                      />
                    ]
                  : []
              ))}
              {selectedTrailSegments.flatMap((segment) => {
                const points = segment.points;
                if (points.length < 2) return [];
                const step = Math.max(1, Math.floor(points.length / 16));
                const arrows: JSX.Element[] = [];
                for (let i = step; i < points.length; i += step) {
                  const from = points[i - 1];
                  const to = points[i];
                  if (!from || !to) continue;
                  if (Math.abs(from.lat - to.lat) < 0.000001 && Math.abs(from.lng - to.lng) < 0.000001) continue;
                  arrows.push(
                    <Marker
                      key={`history-trail-arrow-${segment.key}-${to.atMs}-${i}`}
                      position={[to.lat, to.lng]}
                      icon={buildTrailArrowIcon(trailBearingDegrees(from, to))}
                      interactive={false}
                      keyboard={false}
                    />
                  );
                }
                return arrows;
              })}
              {selectedTrailSegments.flatMap((segment) => {
                const segmentEvents = (tripEventsBySegmentKey.get(segment.key) ?? [])
                  .filter((event) => Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lng)))
                  .map((event) => ({
                    lat: Number(event.lat),
                    lng: Number(event.lng),
                    atMs: notificationEventAtMs({ startIso: event.startIso }),
                    labels: [event.notificationName],
                    source: event
                  }));
                const matchedNotificationKeys = new Set<string>();
                const notificationTriangleIcon = buildTrailNotificationTriangleIcon("online");

                const trailMarkers = segment.points.map((point) => {
                  const matchedNotification = matchNotificationToTrailPoint(point, segmentEvents, "historical");
                  if (matchedNotification && "source" in matchedNotification) {
                    const historyEvent = matchedNotification.source;
                    matchedNotificationKeys.add(
                      `${matchedNotification.atMs}|${matchedNotification.lat}|${matchedNotification.lng}`
                    );
                    return (
                      <Marker
                        key={`history-trail-notif-${segment.key}-${point.atMs}`}
                        position={[point.lat, point.lng]}
                        icon={notificationTriangleIcon}
                      >
                        <Popup>
                          <div className="history-notification-popup">
                            <div className="history-notification-popup-title">Notification Info</div>
                            <div className="history-notification-popup-body">
                              <div className="history-notification-popup-row">
                                <span>Notification</span>
                                <strong>{historyEvent.notificationName || "—"}</strong>
                              </div>
                              <div className="history-notification-popup-row">
                                <span>Start</span>
                                <div>{formatHistoryDate(historyEvent.startIso, historyEvent.site ?? selectedSite, siteTimeZones) || "—"}</div>
                              </div>
                              <div className="history-notification-popup-row">
                                <span>End</span>
                                <div>{formatHistoryDate(historyEvent.endIso, historyEvent.site ?? selectedSite, siteTimeZones) || "—"}</div>
                              </div>
                              <div className="history-notification-popup-row">
                                <span>Location</span>
                                <div>{historyEvent.location || point.location || "—"}</div>
                              </div>
                              <div className="history-notification-popup-row">
                                <span>Driver</span>
                                <div>{formatDriverName(historyEvent.driver ?? point.driver)}</div>
                              </div>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  }

                  return (
                    <CircleMarker
                      key={`history-trail-dot-${segment.key}-${point.atMs}`}
                      center={[point.lat, point.lng]}
                      radius={2.5}
                      pathOptions={{ color: "#ffedd5", fillColor: "#ffedd5", fillOpacity: 0.9, weight: 1 }}
                    >
                      <Popup>
                        <div className="history-avl-popup">
                          <div className="history-avl-popup-title">Trail point</div>
                          <div className="history-avl-popup-body">
                            <div className="history-avl-popup-row">
                              <span>Asset</span>
                              <strong>{point.registration || "Unknown"}</strong>
                            </div>
                            <div className="history-avl-popup-row">
                              <span>Location</span>
                              <strong>{point.location || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}</strong>
                            </div>
                            <div className="history-avl-popup-row">
                              <span>Speed</span>
                              <strong>{typeof point.speedKph === "number" && Number.isFinite(point.speedKph) ? `${point.speedKph.toFixed(2)} km/h` : "Unknown"}</strong>
                            </div>
                            <div className="history-avl-popup-row">
                              <span>Date and time</span>
                              <strong>{formatHistoryDate(new Date(point.atMs).toISOString(), point.site ?? selectedSite, siteTimeZones) || "—"}</strong>
                            </div>
                            <div className="history-avl-popup-row">
                              <span>Driver</span>
                              <strong>{formatDriverName(point.driver)}</strong>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                });

                const orphanNotificationMarkers = segmentEvents
                  .filter((event) => {
                    const key = `${event.atMs}|${event.lat}|${event.lng}`;
                    return !matchedNotificationKeys.has(key);
                  })
                  .map((event, index) => (
                    <Marker
                      key={`history-trail-notif-orphan-${segment.key}-${event.atMs}-${index}`}
                      position={[event.lat, event.lng]}
                      icon={notificationTriangleIcon}
                    >
                      <Popup>
                        <div className="history-notification-popup">
                          <div className="history-notification-popup-title">Notification Info</div>
                          <div className="history-notification-popup-body">
                            <div className="history-notification-popup-row">
                              <span>Notification</span>
                              <strong>{event.source.notificationName || "—"}</strong>
                            </div>
                            <div className="history-notification-popup-row">
                              <span>Start</span>
                              <div>{formatHistoryDate(event.source.startIso, event.source.site ?? selectedSite, siteTimeZones) || "—"}</div>
                            </div>
                            <div className="history-notification-popup-row">
                              <span>Location</span>
                              <div>{event.source.location || "—"}</div>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ));

                return [...trailMarkers, ...orphanNotificationMarkers];
              })}
              {selectedTripVideoEvents.map((point) => (
                <Marker
                  key={`history-trail-video-${point.atMs}-${point.lat.toFixed(6)}-${point.lng.toFixed(6)}`}
                  position={[point.lat, point.lng]}
                  icon={videoRecordedIcon}
                >
                  <Popup>
                    <div className="history-notification-popup">
                      <div className="history-notification-popup-title">Notification Info</div>
                      <div className="history-notification-popup-body">
                        <div className="history-notification-popup-row">
                          <span>Notification</span>
                          <strong>{point.labels.join(", ") || "Notification-triggered recording"}</strong>
                        </div>
                        <div className="history-notification-popup-row">
                          <span>Time</span>
                          <div>{formatHistoryDate(new Date(point.atMs).toISOString(), selectedSite, siteTimeZones) || "—"}</div>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {historyTripStartFlags.map((flag) => (
                <Marker
                  key={`history-trip-start-flag-${flag.key}`}
                  position={[flag.lat, flag.lng]}
                  icon={tripStartFlagIcon}
                  zIndexOffset={1800}
                >
                  <Popup>
                    <div className="history-notification-popup">
                      <div className="history-notification-popup-title">Trip start</div>
                      <div className="history-notification-popup-body">
                        <div className="history-notification-popup-row">
                          <span>Date and time</span>
                          <div>
                            {flag.atMs
                              ? formatHistoryDate(new Date(flag.atMs).toISOString(), flag.site ?? selectedSite, siteTimeZones) || "—"
                              : "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {tripReplayOpen && historyReplayTraveled.length >= 2 && (
                <Polyline
                  key="history-trip-replay-traveled"
                  positions={historyReplayTraveled}
                  pathOptions={{ color: "#16a34a", weight: 6, opacity: 0.95, lineCap: "round", lineJoin: "round" }}
                />
              )}
              {tripReplayOpen && historyReplayPosition && (
                <Marker
                  position={[historyReplayPosition.lat, historyReplayPosition.lng]}
                  icon={buildHistoryReplayIcon(historyReplayPosition.heading)}
                  zIndexOffset={2500}
                  interactive={false}
                />
              )}
              {tripReplayOpen && tripReplayPlaying && historyReplayPosition && (
                <HistoryMapReplayFollower
                  lat={historyReplayPosition.lat}
                  lng={historyReplayPosition.lng}
                  enabled
                />
              )}
            </MapContainer>
          </div>
          {selectedTripEntries.length > 0 && (
            <div className="history-map-trip" role="status">
              <div className="history-map-trip-title">Trips selected on map</div>
              <div className="history-map-trip-meta">Trips: {selectedTripEntries.length}</div>
              <div className="history-map-trip-meta">Notification occurrences: {selectedTripEvents.length}</div>
              <div className="history-map-trip-meta">Trail points (20s moving): {selectedTrailPointCount}</div>
              <div className="history-map-trip-meta">Recorded video points: {selectedTripVideoEvents.length}</div>
              <svg className="history-map-trip-line" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
                <polyline
                  points="10,90 60,70 90,80 130,50 170,60 210,35 260,45 290,20"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
          <div className={`live-trip-replay history-trip-replay${tripReplayOpen ? " is-open" : ""}`} aria-label="Trip replay">
            {!tripReplayOpen ? (
              <button
                type="button"
                className="live-trip-replay-toggle"
                data-toast-ignore
                aria-label="Trip replay"
                title="Trip replay"
                onClick={() => {
                  setTripReplayOpen(true);
                  if (historyReplayMetrics) {
                    tripReplayAtMsRef.current = historyReplayMetrics.startMs;
                    setTripReplayAtMs(historyReplayMetrics.startMs);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                </svg>
                <span>Play</span>
              </button>
            ) : (
              <div className="live-trip-replay-panel">
                <div className="live-trip-replay-header">
                  <div>
                    <div className="live-trip-replay-title">Trip replay</div>
                    <div className="live-trip-replay-asset">
                      {historyReplayMetrics
                        ? `${selectedTripEntries.length} selected trip${selectedTripEntries.length === 1 ? "" : "s"}`
                        : selectedTripEntries.length === 0
                          ? "Select a trip and choose Show on map"
                          : historyTrailLoadingId
                            ? "Loading trail for replay…"
                            : "Waiting for trail points…"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="live-trip-replay-close"
                    aria-label="Close trip replay"
                    data-toast-ignore
                    onClick={() => {
                      setTripReplayOpen(false);
                      stopHistoryReplay();
                    }}
                  >
                    ×
                  </button>
                </div>
                {historyReplayMetrics ? (
                  <>
                    <div className="live-trip-replay-stats">
                      <div className="live-trip-replay-stat">
                        <span>Distance</span>
                        <strong>
                          {historyReplayDistanceKm.toFixed(2)} / {historyReplayMetrics.totalDistanceKm.toFixed(2)} km
                        </strong>
                      </div>
                      <div className="live-trip-replay-stat">
                        <span>Elapsed</span>
                        <strong>
                          {formatReplayDurationMs(Math.max(0, (tripReplayAtMs ?? historyReplayMetrics.startMs) - historyReplayMetrics.startMs))}
                          {" / "}
                          {formatReplayDurationMs(historyReplayMetrics.totalDurationMs)}
                        </strong>
                      </div>
                    </div>
                    <input
                      type="range"
                      className="live-trip-replay-slider"
                      min={historyReplayMetrics.startMs}
                      max={historyReplayMetrics.endMs}
                      step={Math.max(1, Math.floor(historyReplayMetrics.totalDurationMs / 500))}
                      value={tripReplayAtMs ?? historyReplayMetrics.startMs}
                      aria-label="Trip replay progress"
                      onChange={(event) => {
                        stopHistoryReplay();
                        const next = Number(event.target.value);
                        tripReplayAtMsRef.current = next;
                        setTripReplayAtMs(next);
                      }}
                    />
                    <div className="live-trip-replay-controls">
                      <button
                        type="button"
                        className="live-trip-replay-btn"
                        aria-label="Restart replay"
                        data-toast-ignore
                        onClick={resetHistoryReplay}
                      >
                        ⏮
                      </button>
                      <button
                        type="button"
                        className="live-trip-replay-btn live-trip-replay-btn-primary"
                        aria-label={tripReplayPlaying ? "Pause replay" : "Play replay"}
                        data-toast-ignore
                        onClick={() => {
                          if (tripReplayPlaying) {
                            stopHistoryReplay();
                            return;
                          }
                          if (!historyReplayMetrics) return;
                          if ((tripReplayAtMs ?? historyReplayMetrics.startMs) >= historyReplayMetrics.endMs) {
                            tripReplayAtMsRef.current = historyReplayMetrics.startMs;
                            setTripReplayAtMs(historyReplayMetrics.startMs);
                          }
                          setTripReplayPlaying(true);
                        }}
                      >
                        {tripReplayPlaying ? "⏸" : "▶"}
                      </button>
                      <button
                        type="button"
                        className="live-trip-replay-btn"
                        aria-label="Stop replay"
                        data-toast-ignore
                        onClick={() => {
                          stopHistoryReplay();
                          if (historyReplayMetrics) {
                            tripReplayAtMsRef.current = historyReplayMetrics.startMs;
                            setTripReplayAtMs(historyReplayMetrics.startMs);
                          }
                        }}
                      >
                        ⏹
                      </button>
                    </div>
                    <div className="live-trip-replay-speeds" role="group" aria-label="Replay speed">
                      {HISTORY_REPLAY_SPEED_OPTIONS.map((speed) => (
                        <button
                          key={speed}
                          type="button"
                          className={`live-trip-replay-speed${tripReplaySpeed === speed ? " active" : ""}`}
                          data-toast-ignore
                          onClick={() => setTripReplaySpeed(speed)}
                        >
                          {speed}×
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="live-trip-replay-empty">
                    {selectedTripEntries.length === 0
                      ? "Select one or more trips, then choose Show on map to replay movement."
                      : historyTrailLoadingId
                        ? "Loading trail for replay…"
                        : "No trail points yet for the selected trip. Keep the trip shown on the map."}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="map-ui">
            <select
              className="map-layer-select"
              value={mapLayer}
              aria-label="Map layer"
              ref={mapLayerSelectRef}
              onChange={(event) => setMapLayer(event.target.value)}
            >
              <option value="google-street">Roadmap</option>
              <option value="google-terrain">Terrain</option>
              <option value="google-satellite">Satellite</option>
              <option value="google-hybrid">Hybrid</option>
            </select>

            <div className="map-tools" aria-label="Map tools">
              <button
                type="button"
                className="map-tool"
                data-tooltip="Find"
                aria-label="Find"
                data-toast-ignore
                onClick={focusFilter}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.2-3.2" />
                </svg>
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="Create location"
                aria-label="Create location"
                data-toast-ignore
                onClick={handleCreateLocation}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="View many assets in new window"
                aria-label="View many assets in new window"
                data-toast-ignore
                onClick={handleOpenAssetsWindow}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 4h7M4 4v7M20 4h-7M20 4v7M4 20h7M4 20v-7M20 20h-7M20 20v-7" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="Map layers"
                aria-label="Map layers"
                data-toast-ignore
                onClick={focusLayerSelect}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4l8 4-8 4-8-4 8-4z" />
                  <path d="M4 12l8 4 8-4" />
                  <path d="M4 16l8 4 8-4" />
                </svg>
              </button>
              <button
                type="button"
                className={`map-tool${showMapRotate ? " active" : ""}`}
                data-tooltip="Rotate map"
                aria-label="Rotate map"
                data-toast-ignore
                onClick={() => setShowMapRotate((current) => !current)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                </svg>
              </button>
              <button
                type="button"
                className={`map-tool${showMapToolsPanel || measureMode === "distance" ? " active" : ""}`}
                data-tooltip="Map tools"
                aria-label="Map tools"
                data-toast-ignore
                onClick={() => {
                  setShowMapToolsPanel((current) => !current);
                  setShowMapRotate(false);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14.7 6.3a4 4 0 0 1-5.6 5.6l-5 5a2 2 0 0 0 2.8 2.8l5-5a4 4 0 0 1 5.6-5.6l-2.8 2.8 2 2 2.8-2.8z" />
                </svg>
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="Full screen"
                aria-label="Full screen"
                data-toast-ignore
                onClick={toggleMapFullscreen}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9V4h5" />
                  <path d="M20 9V4h-5" />
                  <path d="M4 15v5h5" />
                  <path d="M20 15v5h-5" />
                </svg>
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
              <button type="button" className="map-rotate-reset" onClick={() => setMapRotation(0)}>
                Reset
              </button>
            </div>
          )}
          {showMapToolsPanel && (
            <div className="map-tools-panel" role="menu" aria-label="Map tools">
              <button
                type="button"
                className={measureMode === "distance" ? "active" : ""}
                onClick={handleMeasureDistance}
              >
                Measure distance
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMapToolsPanel(false);
                  navigate("/Track/tracking/Control-road-hazards");
                }}
              >
                Road hazards
              </button>
            </div>
          )}
          {measureMode === "distance" && (
            <div className="map-Analyze-badge" role="status">
              <span>{measureHint}</span>
              <button
                type="button"
                aria-label="Clear measurement"
                data-toast-ignore
                onClick={() => setMeasureMode(null)}
              >
                ✕
              </button>
            </div>
          )}

          <div className="history-map-toolbar" aria-label="Map actions">
            <button
              type="button"
              className="history-map-btn"
              data-tooltip="Find"
              aria-label="Find"
              data-toast-ignore
              onClick={focusFilter}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.2-3.2" />
              </svg>
            </button>
            <button
              type="button"
              className="history-map-btn"
              data-tooltip="Create location"
              aria-label="Create location"
              data-toast-ignore
              onClick={handleCreateLocation}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </button>
            <button
              type="button"
              className="history-map-btn"
              data-tooltip="Download"
              aria-label="Download"
              data-toast-ignore
              onClick={handleDownloadSummary}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="M7 10l5 5 5-5" />
                <path d="M5 20h14" />
              </svg>
            </button>
            <button
              type="button"
              className="history-map-btn"
              data-tooltip="Compass"
              aria-label="Compass"
              data-toast-ignore
              onClick={() => {
                setSelectedTripsOnMap({});
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M9 15l2-6 6-2-2 6-6 2z" />
              </svg>
            </button>
            <button
              type="button"
              className="history-map-btn"
              data-tooltip="Settings"
              aria-label="Settings"
              data-toast-ignore
              onClick={() => navigate("/Track/tracking/Control-road-hazards")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1-1.4 1.4l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V19a1 1 0 0 1-2 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H9a1 1 0 0 1 0-2h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 1 1 1.4-1.4l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V9a1 1 0 0 1 2 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 1 1 1.4 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H19a1 1 0 0 1 0 2h-.2a1 1 0 0 0-.9.6z" />
              </svg>
            </button>
          </div>

          <div className="map-attribution">Map preview placeholder</div>
        </section>
      </div>

      {/* ── SELECT ASSET Modal ──────────────────────────────────────────── */}
      {showSelectAsset && (
        <div className="select-asset-backdrop" onClick={handleCloseSelectAsset}>
          <div className="select-asset-modal" onClick={(e) => e.stopPropagation()}>
            <div className="select-asset-header">
              <div className="select-asset-title">SELECT ASSET</div>
              <div className="select-asset-org-label">Organisation</div>
              <input
                className="select-asset-search"
                placeholder="Search"
                value={selectSearch}
                onChange={(e) => setSelectSearch(e.target.value)}
                autoFocus
              />
              <button className="select-asset-close" onClick={handleCloseSelectAsset}>✕</button>
            </div>

            {selectHierarchyLoading ? (
              <div className="select-asset-loading">Loading hierarchy…</div>
            ) : (
              <div className="select-asset-columns">
                {/* Organisation */}
                <div className="select-asset-col">
                  <div className="select-asset-col-header">
                    <span>Organisation</span>
                    <button className="select-asset-add" title="Add organisation">Add</button>
                  </div>
                  <div className="select-asset-col-list">
                    {selectHierarchy.dealers.length === 0 && (
                      <div className="select-asset-empty">No organisations</div>
                    )}
                    {selectHierarchy.dealers.map((d) => (
                      <div
                        key={d.id}
                        className={`select-asset-item${selectDealer === d.id ? " active" : ""}`}
                        onClick={() => { setSelectDealer(d.id); setSelectOrg(null); setSelectDb(null); setSelectSite(null); }}
                      >
                        {d.name}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dealers */}
                <div className="select-asset-col">
                  <div className="select-asset-col-header">
                    <span>Dealers</span>
                    <button className="select-asset-add" title="Add dealer">Add</button>
                  </div>
                  <div className="select-asset-col-list">
                    {(() => {
                      const orgs = selectDealer
                        ? (selectHierarchy.dealers.find((d) => d.id === selectDealer)?.organisations ?? [])
                        : selectHierarchy.dealers.flatMap((d) => d.organisations);
                      if (orgs.length === 0) return <div className="select-asset-empty">No dealers</div>;
                      return orgs.map((o) => (
                        <div
                          key={o.id}
                          className={`select-asset-item${selectOrg === o.id ? " active" : ""}`}
                          onClick={() => { setSelectOrg(o.id); setSelectDb(null); setSelectSite(null); }}
                        >
                          {o.name}
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Databases */}
                <div className="select-asset-col">
                  <div className="select-asset-col-header">
                    <span>Databases</span>
                    <button className="select-asset-add" title="Add database">Add</button>
                  </div>
                  <div className="select-asset-col-list">
                    {(() => {
                      const orgs = selectDealer
                        ? (selectHierarchy.dealers.find((d) => d.id === selectDealer)?.organisations ?? [])
                        : selectHierarchy.dealers.flatMap((d) => d.organisations);
                      const dbs = selectOrg
                        ? (orgs.find((o) => o.id === selectOrg)?.databases ?? [])
                        : orgs.flatMap((o) => o.databases);
                      if (dbs.length === 0) return <div className="select-asset-empty">No databases</div>;
                      return dbs.map((db) => (
                        <div
                          key={db.id}
                          className={`select-asset-item${selectDb === db.id ? " active" : ""}`}
                          onClick={() => { setSelectDb(db.id); setSelectSite(null); }}
                        >
                          {db.name}
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Sites */}
                <div className="select-asset-col">
                  <div className="select-asset-col-header">
                    <span>Sites</span>
                    <button className="select-asset-add" title="Add site">Add</button>
                  </div>
                  <div className="select-asset-col-list">
                    {(() => {
                      const orgs = selectDealer
                        ? (selectHierarchy.dealers.find((d) => d.id === selectDealer)?.organisations ?? [])
                        : selectHierarchy.dealers.flatMap((d) => d.organisations);
                      const dbs = selectOrg
                        ? (orgs.find((o) => o.id === selectOrg)?.databases ?? [])
                        : orgs.flatMap((o) => o.databases);
                      const sites = selectDb
                        ? (dbs.find((db) => db.id === selectDb)?.sites ?? [])
                        : dbs.flatMap((db) => db.sites);
                      if (sites.length === 0) return <div className="select-asset-empty">No sites</div>;
                      return sites.map((s) => (
                        <div
                          key={s.id}
                          className={`select-asset-item${selectSite === s.id ? " active" : ""}`}
                          onClick={() => setSelectSite(s.id)}
                        >
                          {s.name}
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Assets */}
                <div className="select-asset-col">
                  <div className="select-asset-col-header">
                    <span>Assets</span>
                    <button className="select-asset-add" title="Add asset">Add</button>
                  </div>
                  <div className="select-asset-col-list">
                    {(() => {
                      const query = selectSearch.trim().toLowerCase();
                      const orgs = selectDealer
                        ? (selectHierarchy.dealers.find((d) => d.id === selectDealer)?.organisations ?? [])
                        : selectHierarchy.dealers.flatMap((d) => d.organisations);
                      const dbs = selectOrg
                        ? (orgs.find((o) => o.id === selectOrg)?.databases ?? [])
                        : orgs.flatMap((o) => o.databases);
                      const selectedDb = selectDb ? (dbs.find((db) => db.id === selectDb) ?? null) : null;
                      const selectedDbName = String(selectedDb?.name ?? "").trim().toLowerCase();
                      const sites = selectDb
                        ? (selectedDb?.sites ?? [])
                        : dbs.flatMap((db) => db.sites);
                      const siteNames = new Set(sites.map((s) => s.name.toLowerCase()));
                      const selectedSiteName = selectSite
                        ? String((sites.find((s) => s.id === selectSite)?.name ?? "")).trim().toLowerCase()
                        : "";
                      const selectedTenantId = [selectDealer, selectOrg, selectDb].filter(Boolean).join(":");

                      let candidateAssets = selectedTenantId
                        ? (selectAssetsByTenant[selectedTenantId] ?? [])
                        : selectAllAssets;
                      if (selectedDbName) {
                        candidateAssets = candidateAssets.filter((a) => {
                          const assetDatabase = String(a.database ?? "").trim().toLowerCase();
                          const assetSite = String(a.site ?? "").trim().toLowerCase();
                          if (assetDatabase) return assetDatabase === selectedDbName;
                          return siteNames.size > 0 ? siteNames.has(assetSite) : true;
                        });
                      } else if (siteNames.size > 0) {
                        candidateAssets = candidateAssets.filter((a) => siteNames.has(String(a.site ?? "").toLowerCase()));
                      }

                      if (selectedSiteName) {
                        candidateAssets = candidateAssets.filter((a) =>
                          assetSiteMatchesHierarchySite(resolveAssetSiteName(a), selectedSiteName)
                          || String(a.site ?? "").trim().toLowerCase() === selectedSiteName
                        );
                      }

                      const assetDetailsByLabel = new Map<string, SelectAssetOption>();
                      for (const asset of candidateAssets) {
                        const label = buildSelectAssetLabel(asset);
                        if (!label) continue;
                        const key = label.toLowerCase();
                        const normalized = { ...asset, name: label };
                        const existing = assetDetailsByLabel.get(key);
                        if (!existing || (!existing.imei && normalized.imei)) {
                          assetDetailsByLabel.set(key, normalized);
                        }
                      }

                      const hierarchyAssetLabels = Array.from(new Set(
                        (selectedSiteName
                          ? sites.filter((site) => String(site?.name ?? "").trim().toLowerCase() === selectedSiteName)
                          : sites
                        ).flatMap((site) => {
                          const siteAssets = (site as { assets?: string[] } | null)?.assets;
                          return Array.isArray(siteAssets) ? siteAssets : [];
                        })
                          .map((asset) => String(asset ?? "").trim())
                          .filter(Boolean)
                      ));

                      let assets = hierarchyAssetLabels.length > 0
                        ? hierarchyAssetLabels.map((label) => {
                            const detail = assetDetailsByLabel.get(label.toLowerCase());
                            return detail ?? {
                              id: label,
                              name: label,
                              imei: "",
                              registration: "",
                              database: selectedDb?.name ?? "",
                              site: selectedSiteName || ""
                            };
                          })
                        : Array.from(assetDetailsByLabel.values());

                      if (query) {
                        assets = assets.filter(
                          (a) =>
                            a.name.toLowerCase().includes(query) ||
                            a.imei.toLowerCase().includes(query) ||
                            String(a.database ?? "").toLowerCase().includes(query)
                        );
                      }

                      if (selectAssetsLoading && selectedTenantId && !selectAssetsByTenant[selectedTenantId]) {
                        return <div className="select-asset-empty">Loading assets…</div>;
                      }

                      if (assets.length === 0) {
                        return <div className="select-asset-empty">{query ? "No matches" : "No assets"}</div>;
                      }

                      return assets.map((a) => (
                        <div
                          key={a.id || a.imei}
                          className={`select-asset-item select-asset-item--clickable${selectPendingAsset?.id === a.id ? " active" : ""}`}
                          onClick={() => setSelectPendingAsset(a)}
                        >
                          <span className="select-asset-name">{a.name}</span>
                          {a.imei && <span className="select-asset-imei">{a.imei}</span>}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            <div className="select-asset-footer">
              <button type="button" className="select-asset-btn select-asset-btn--ghost" onClick={handleCloseSelectAsset}>
                Cancel
              </button>
              <button
                type="button"
                className="select-asset-btn select-asset-btn--primary"
                disabled={!selectPendingAsset && !selectDb && !selectSite}
                onClick={() => {
                  if (selectPendingAsset) {
                    handleSelectAssetConfirm(selectPendingAsset);
                    return;
                  }
                  if (selectDb || selectSite) {
                    handleSelectScopeConfirm();
                  }
                }}
              >
                Select
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS POPUP ─────────────────────────────────────────── */}
      {showNotifPopup && (
        <div className="history-popup-backdrop" onClick={() => setShowNotifPopup(false)}>
          <div className="history-popup" onClick={(e) => e.stopPropagation()}>
            <div className="history-popup-header">
              <div className="history-popup-title">Monitor Notifications on Trail</div>
              <button type="button" className="history-popup-close" aria-label="Close" onClick={() => setShowNotifPopup(false)}>✕</button>
            </div>
            <div className="history-popup-body">
              {notifPopupLoading && <div className="history-popup-empty">Loading notifications…</div>}
              {!notifPopupLoading && notifPopupItems.length === 0 && (
                <div className="history-popup-empty">
                  No bound notifications for this site. Configure them under Control → Bindings → Notifications Bindings.
                </div>
              )}
              {!notifPopupLoading && notifPopupItems.map((item) => {
                const label = item.label;
                const checked = monitoredNotifications.has(label);
                return (
                  <label key={item.id} className="history-popup-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setMonitoredNotifications((prev) => {
                          const next = new Set(prev);
                          if (next.has(label)) next.delete(label); else next.add(label);
                          return next;
                        });
                      }}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
            {monitoredNotifications.size > 0 && (
              <div className="history-popup-footer">
                <button
                  type="button"
                  className="history-popup-clear"
                  onClick={() => setMonitoredNotifications(new Set())}
                >
                  Clear filter ({monitoredNotifications.size} selected)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LOCATIONS POPUP ─────────────────────────────────────────────── */}
      {showLocationsPopup && (
        <div className="history-popup-backdrop" onClick={() => setShowLocationsPopup(false)}>
          <div className="history-popup" onClick={(e) => e.stopPropagation()}>
            <div className="history-popup-header">
              <div className="history-popup-title">Locations</div>
              <button type="button" className="history-popup-close" aria-label="Close" onClick={() => setShowLocationsPopup(false)}>✕</button>
            </div>
            <div className="history-popup-body">
              {locationsPopupLoading && <div className="history-popup-empty">Loading locations…</div>}
              {!locationsPopupLoading && locationsPopupItems.length === 0 && (
                <div className="history-popup-empty">No locations found.</div>
              )}
              {!locationsPopupLoading && locationsPopupItems.map((item, idx) => (
                <div key={String(item.id ?? item.name ?? idx)} className="history-popup-item history-popup-item--loc">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/>
                    <circle cx="12" cy="9" r="2.5"/>
                  </svg>
                  <span>{String(item.name ?? item.description ?? item.id ?? "Location")}</span>
                </div>
              ))}
            </div>
            <div className="history-popup-footer">
              <button
                type="button"
                className="history-popup-clear"
                onClick={() => {
                  setShowLocationsPopup(false);
                  navigate("/Track/tracking/Control-locations");
                }}
              >
                Manage locations ↗
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADVANCED DATE MODAL ──────────────────────────────────────────── */}
      <ScheduleDateTimePicker
        open={showCustomDateModal}
        date={historyDatePickerDateObj}
        time={historyDatePickerTime}
        mode={historyDatePickerActive}
        onClose={() => setShowCustomDateModal(false)}
        onConfirm={applyHistoryDatePicker}
        onDateChange={setHistoryDatePickerDateObj}
        onTimeChange={setHistoryDatePickerTime}
        onModeChange={setHistoryDatePickerActive}
        title="Select historical date and time"
        restrictToPast
      />
    </div>
  );
}
