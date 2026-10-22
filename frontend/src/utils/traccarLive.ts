import { getTraccarLive, loadGpsIotLiveDevices, type TraccarLivePosition } from "./api";
import { isGpsIotServer } from "./regionServers";
import { resolveLastMoveAtMs } from "./assetStatus";
import { movementFromSpeedKph } from "./assetTelemetryFields";
import {
  extractFuelLitersFromTraccarLivePosition,
  formatFuelLiters,
  readDeviceFuelConfig,
  type DeviceFuelConfig
} from "./traccarFuel";
import {
  TRACCAR_POWER_ATTR_KEYS,
  TRACCAR_SATELLITE_ATTR_KEYS,
  TraccarPositionAttr,
  readTraccarAttrBoolean,
  readTraccarAttrNumber
} from "./traccarPositionKeys";

export type TraccarLiveSnapshot = {
  lat: number;
  lng: number;
  speedKph: string;
  heading: string;
  fuelReading: string;
  /** Latest position attributes, used to apply the device-binding fuel chart. */
  attributes?: Record<string, unknown>;
  satellites: string;
  powerVoltage: string;
  ignition?: boolean;
  motion?: boolean;
  odometerM?: number;
  totalDistanceM?: number;
  batteryLevel?: number;
  /** Human location / address from live feed. */
  address?: string;
  /** Last GPS IoT / device event name for notifications column. */
  eventName?: string;
  altitude?: number;
  fixTime: string;
  atMs: number;
};

const KNOTS_TO_KPH = 1.852;

export const normalizeTraccarImei = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 14 || digits.length > 17) return "";
  return digits;
};

export const parseTimestampMs = (value: unknown): number => {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return Number.NaN;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const second = Number(match[6] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > 31) return Number.NaN;
  const eat = /\bEAT\b/i.test(raw);
  return Date.UTC(year, month - 1, day, hour - (eat ? 3 : 0), minute, second);
};

const newestFixTime = (...values: unknown[]): string => {
  let best = "";
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const raw = String(value ?? "").trim();
    const ms = parseTimestampMs(raw);
    if (!raw || !Number.isFinite(ms) || ms < bestMs) continue;
    best = raw;
    bestMs = ms;
  }
  return best;
};

const formatSpeedKph = (speedKnots: unknown): string => {
  if (typeof speedKnots !== "number" || !Number.isFinite(speedKnots)) return "";
  const kph = Math.max(0, speedKnots * KNOTS_TO_KPH);
  return kph.toFixed(2);
};

const formatHeading = (position: TraccarLivePosition): string => {
  let candidate = Number.NaN;
  if (typeof position.heading === "number" && Number.isFinite(position.heading)) {
    candidate = position.heading;
  } else if (typeof position.course === "number" && Number.isFinite(position.course)) {
    candidate = position.course;
  }
  if (!Number.isFinite(candidate)) return "";
  return String(Math.round(((candidate % 360) + 360) % 360));
};

/** Format Traccar power (often millivolts) for display as volts when clearly mV-scale. */
const formatPowerVoltageDisplay = (raw: number): string => {
  if (!Number.isFinite(raw)) return "";
  if (raw >= 1000) return (raw / 1000).toFixed(2);
  return Number.isInteger(raw) ? String(raw) : raw.toFixed(2);
};

const snapshotFromRow = (
  imei: string,
  position: TraccarLivePosition,
  fixTime: string,
  fuelConfig?: DeviceFuelConfig | null
): TraccarLiveSnapshot | null => {
  const lat = position.lat;
  const lng = position.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const liters = extractFuelLitersFromTraccarLivePosition(position, fuelConfig);
  const atMs = parseTimestampMs(
    fixTime || position.fixTime || position.deviceTime || position.serverTime
  );
  const attrs =
    position.attributes && typeof position.attributes === "object" ? position.attributes : undefined;
  const satellites = readTraccarAttrNumber(attrs, TRACCAR_SATELLITE_ATTR_KEYS);
  const powerRaw = readTraccarAttrNumber(attrs, TRACCAR_POWER_ATTR_KEYS);
  const ignition = readTraccarAttrBoolean(attrs, [TraccarPositionAttr.IGNITION]);
  const motion = readTraccarAttrBoolean(attrs, [TraccarPositionAttr.MOTION]);
  const odometerM = readTraccarAttrNumber(attrs, [
    TraccarPositionAttr.ODOMETER,
    TraccarPositionAttr.OBD_ODOMETER
  ]);
  const totalDistanceM = readTraccarAttrNumber(attrs, [TraccarPositionAttr.TOTAL_DISTANCE]);
  const batteryLevel = readTraccarAttrNumber(attrs, [TraccarPositionAttr.BATTERY_LEVEL]);

  return {
    lat,
    lng,
    speedKph: formatSpeedKph(position.speed),
    heading: formatHeading(position),
    fuelReading: formatFuelLiters(liters),
    ...(attrs ? { attributes: attrs } : {}),
    satellites: typeof satellites === "number" ? String(satellites) : "",
    powerVoltage: typeof powerRaw === "number" ? formatPowerVoltageDisplay(powerRaw) : "",
    ...(typeof ignition === "boolean" ? { ignition } : {}),
    ...(typeof motion === "boolean" ? { motion } : {}),
    ...(typeof odometerM === "number" ? { odometerM } : {}),
    ...(typeof totalDistanceM === "number" ? { totalDistanceM } : {}),
    ...(typeof batteryLevel === "number" ? { batteryLevel } : {}),
    address: String(position.address ?? attrs?.locationName ?? attrs?.address ?? "").trim() || undefined,
    eventName: String(attrs?.eventName ?? attrs?.event ?? attrs?.alarm ?? "").trim() || undefined,
    altitude: typeof position.altitude === "number" && Number.isFinite(position.altitude)
      ? position.altitude
      : undefined,
    fixTime,
    atMs
  };
};

/** Latest Traccar positions keyed by normalized IMEI. */
export function buildTraccarLiveSnapshotsFromRows(
  live: Array<{
    imei?: unknown;
    lastUpdate?: unknown;
    position?: TraccarLivePosition | null;
    fuelConfig?: Record<string, unknown> | null;
  }>
): Map<string, TraccarLiveSnapshot> {
  const map = new Map<string, TraccarLiveSnapshot>();
  for (const row of live) {
    const imei = normalizeTraccarImei(row.imei);
    const position = row.position;
    if (!imei || !position || typeof position !== "object") continue;

    const fuelConfig = readDeviceFuelConfig(row.fuelConfig ?? null);
    const fixTime = newestFixTime(
      position.fixTime,
      position.deviceTime,
      position.serverTime,
      row.lastUpdate
    );
    const snapshot = snapshotFromRow(imei, position, fixTime, fuelConfig);
    if (!snapshot) continue;

    const existing = map.get(imei);
    if (!existing || snapshot.atMs >= existing.atMs) {
      map.set(imei, snapshot);
    }
  }
  return map;
}

/** Latest live positions keyed by normalized IMEI (Traccar or UK GPS IoT forward+API). */
export async function fetchTraccarLiveSnapshotsByImei(): Promise<Map<string, TraccarLiveSnapshot>> {
  try {
    if (isGpsIotServer()) {
      const devices = await loadGpsIotLiveDevices();
      const live = devices.map((device) => {
        const attrs: Record<string, unknown> = {
          source: "gpsiot",
          ...(device.attributes && typeof device.attributes === "object" ? device.attributes : {}),
          ignition: device.ignition ?? device.attributes?.ignition,
          motion: Number(device.speed) > 1,
          sat: device.satellites ?? device.attributes?.sat,
          satellites: device.satellites ?? device.attributes?.satellites,
          power: device.powerVoltage ?? device.attributes?.power,
          batteryLevel: device.batteryLevel ?? device.attributes?.batteryLevel,
          battery: device.batteryLevel ?? device.attributes?.battery,
          odometer: device.odometerM ?? device.attributes?.odometer,
          totalDistance: device.odometerM ?? device.attributes?.totalDistance,
          event: device.eventName || device.attributes?.event,
          eventName: device.eventName || device.attributes?.eventName,
          alarm:
            device.eventName && !/^position report$/i.test(String(device.eventName))
              ? device.eventName
              : device.attributes?.alarm,
          roadSpeed: device.roadSpeed ?? device.attributes?.roadSpeed,
          workingHours: device.workingHours ?? device.attributes?.workingHours,
          address: device.address || device.attributes?.address,
          locationName: device.address || device.attributes?.locationName,
          ...(device.sensorData && typeof device.sensorData === "object" ? device.sensorData : {})
        };
        for (const key of Object.keys(attrs)) {
          if (attrs[key] === undefined || attrs[key] === null || attrs[key] === "") delete attrs[key];
        }
        return {
          imei: device.imei,
          lastUpdate: device.deviceTime,
          position: {
            lat: device.latitude,
            lng: device.longitude,
            speed: Number.isFinite(device.speed) ? device.speed / 1.852 : 0,
            heading: device.course,
            course: device.course,
            altitude: Number(device.altitude) || undefined,
            address: device.address || null,
            fixTime: device.deviceTime || undefined,
            deviceTime: device.deviceTime || undefined,
            attributes: attrs
          } satisfies TraccarLivePosition
        };
      });
      return buildTraccarLiveSnapshotsFromRows(live);
    }
    const live = await getTraccarLive();
    return buildTraccarLiveSnapshotsFromRows(live);
  } catch {
    // Caller keeps existing row values when live is unavailable.
    return new Map();
  }
}

/**
 * Apply a Live Tracking Traccar snapshot onto a fleet asset.
 * Keeps lastSeen, last position, and last trip on the ISO fix time so status dots and those columns use the same clock.
 */
export function applyTraccarLiveSnapshotToAsset<T extends Record<string, unknown>>(
  asset: T,
  snapshot: TraccarLiveSnapshot | undefined
): T {
  if (!snapshot) return asset;

  const shownAtMs = [asset.lastSeen, asset.lastPosition]
    .map((value) => parseTimestampMs(value))
    .reduce((best, ms) => (Number.isFinite(ms) && (!Number.isFinite(best) || ms > best) ? ms : best), Number.NaN);
  const incomingAtMs = snapshot.atMs;
  const prevLat = typeof asset.lat === "number" ? asset.lat : undefined;
  const prevLng = typeof asset.lng === "number" ? asset.lng : undefined;
  const needsCoords = typeof prevLat !== "number" || typeof prevLng !== "number";
  const positionChanged =
    needsCoords ||
    Math.abs(snapshot.lat - Number(prevLat)) > 0.000001 ||
    Math.abs(snapshot.lng - Number(prevLng)) > 0.000001;
  const isNewer =
    !Number.isFinite(shownAtMs) ||
    !Number.isFinite(incomingAtMs) ||
    incomingAtMs >= shownAtMs;
  const applyTimestamp = isNewer;
  const applyCoords = isNewer || (needsCoords && positionChanged);
  if (!applyTimestamp && !applyCoords) return asset;

  const speedKph = Number(snapshot.speedKph);
  const nextSpeed = Number.isFinite(speedKph)
    ? speedKph
    : typeof asset.speed === "number"
      ? asset.speed
      : undefined;
  const nextMovement =
    movementFromSpeedKph(nextSpeed) ?? (String(asset.movement ?? "").trim() || undefined);
  const nextLat = applyCoords ? snapshot.lat : prevLat;
  const nextLng = applyCoords ? snapshot.lng : prevLng;
  const lastMoveAtMs = resolveLastMoveAtMs({
    previousLastMoveAtMs: typeof asset.lastMoveAtMs === "number" ? asset.lastMoveAtMs : undefined,
    atMs: Number.isFinite(incomingAtMs) ? incomingAtMs : Date.now(),
    speed: nextSpeed,
    movement: nextMovement,
    previousLat: prevLat,
    previousLng: prevLng,
    lat: nextLat,
    lng: nextLng
  });

  return {
    ...asset,
    ...(applyCoords ? { lat: nextLat, lng: nextLng } : {}),
    ...(applyTimestamp && snapshot.fixTime
      ? { lastSeen: snapshot.fixTime, lastPosition: snapshot.fixTime, lastTrip: snapshot.fixTime }
      : {}),
    ...(applyTimestamp && typeof nextSpeed === "number" ? { speed: nextSpeed, speedKph: nextSpeed } : {}),
    ...(applyTimestamp && nextMovement ? { movement: nextMovement } : {}),
    ...(applyTimestamp && Number.isFinite(incomingAtMs) ? { telemetryAtMs: incomingAtMs } : {}),
    lastMoveAtMs
  };
}

export async function applyTraccarLiveSnapshotsToAssets<T extends { imei?: unknown }>(
  assets: T[]
): Promise<T[]> {
  const rows = Array.isArray(assets) ? assets : [];
  if (!rows.length) return rows;
  const liveByImei = await fetchTraccarLiveSnapshotsByImei();
  if (!liveByImei.size) return rows;
  return rows.map((asset) => {
    const imei = normalizeTraccarImei(asset.imei);
    return applyTraccarLiveSnapshotToAsset(asset as T & Record<string, unknown>, imei ? liveByImei.get(imei) : undefined);
  });
}
