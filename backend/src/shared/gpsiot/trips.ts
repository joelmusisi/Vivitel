import { GpsIotClientError, gpsIotMessage } from "./clients.ts";
import type { GpsIotSecrets } from "./secrets.ts";

/**
 * Mileage / trips / daily summary ↔ Vivitel Historical Tracking + Trip Timeline.
 *
 * GPS IoT:
 * - POST /api/Trip/GetMileageSummary     → trail / route segments
 * - POST api/Trip/GetTrips/              → trip ids (Detailed Movement; also Utilisation + Historical)
 * - POST api/Trip/GetTripDetails        → trip/parked detail
 * - POST /api/trip/GetClientAssetsMileage → per-asset mileage summary (≤30 days)
 * - POST api/DailySummary/GetDailySummary → daily fleet summary (≤24h)
 *
 * Reports use GetMileageSummary first (one call per device). GetTrips → GetTripDetails
 * runs only when mileage is empty or rejected, including ranges over 30 days (chunked).
 */

/** GetTrips / GetMileageSummary / GetClientAssetsMileage reject ranges over 30 days. */
export const GPS_IOT_TRIPS_MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
/** GetDailySummary rejects ranges over 24 hours. */
export const GPS_IOT_DAILY_SUMMARY_MAX_RANGE_MS = 24 * 60 * 60 * 1000;

/** Split a range into ≤ maxSpanMs windows so limited GPS IoT APIs can be called in chunks. */
export function splitGpsIotRange(
  startTime: string,
  endTime: string,
  maxSpanMs: number = GPS_IOT_TRIPS_MAX_RANGE_MS
): Array<{ startTime: string; endTime: string }> {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [{ startTime, endTime }];
  }
  if (end - start <= maxSpanMs) return [{ startTime, endTime }];
  const chunks: Array<{ startTime: string; endTime: string }> = [];
  let cursor = start;
  while (cursor < end) {
    const chunkEnd = Math.min(end, cursor + maxSpanMs);
    chunks.push({
      startTime: new Date(cursor).toISOString(),
      endTime: new Date(chunkEnd).toISOString()
    });
    cursor = chunkEnd;
  }
  return chunks;
}

function dedupeMappedTrips(trips: GpsIotMappedTrip[]): GpsIotMappedTrip[] {
  const seen = new Set<string>();
  const out: GpsIotMappedTrip[] = [];
  for (const trip of trips) {
    const key = trip.tripId
      || `${trip.startTime}|${trip.endTime}|${trip.startLat}|${trip.endLat}|${trip.isStoppage ? 1 : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trip);
  }
  return out.sort((a, b) => Date.parse(a.startTime || "") - Date.parse(b.startTime || ""));
}

export type GpsIotMappedTrip = {
  deviceId: number;
  deviceName: string;
  maxSpeed: number;
  averageSpeed: number;
  distance: number;
  duration: number;
  startTime: string;
  startAddress: string | null;
  startLat: number;
  startLon: number;
  endTime: string;
  endAddress: string | null;
  endLat: number;
  endLon: number;
  driverUniqueId: string | null;
  driverName: string | null;
  isStoppage: boolean;
  isInProgress: boolean;
  tripId: string;
};

export type GpsIotMappedRoutePoint = {
  id: number;
  deviceId: number;
  protocol: string;
  deviceTime: string;
  fixTime: string;
  serverTime: string;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  course: number;
  address: string | null;
  accuracy: number;
  network: Record<string, unknown>;
  geofenceIds: number[];
  attributes: Record<string, unknown>;
};

export type GpsIotDailySummary = {
  vehicleId: string;
  registration: string;
  driverName: string;
  maxSpeed: number;
  harshBraking: number;
  harshAccel: number;
  dailyDistance: number;
  dailyTrips: number;
  excessIdlingSeconds: number;
  drivingTimeSeconds: number;
  speedingTimeSeconds: number;
};

export type GpsIotAssetMileage = {
  asset: string;
  imei: string;
  startHours: number;
  endHours: number;
  totalHours: number;
  currentHours: number;
  startOdometer: number;
  endOdometer: number;
  distance: number;
  currentOdometer: number;
};

const asRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
const asText = (value: unknown) => String(value ?? "").trim();
const asNum = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const asBool = (value: unknown) => {
  if (typeof value === "boolean") return value;
  const text = asText(value).toLowerCase();
  return text === "true" || text === "1";
};

async function readGpsIotBody(response: Response): Promise<unknown> {
  const text = (await response.text()).trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { Message: text.replace(/^"|"$/g, "") };
  }
}

async function gpsIotJson(
  secrets: GpsIotSecrets,
  accessToken: string,
  path: string,
  method: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch
) {
  const response = await fetchImpl(`${secrets.baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });
  const payload = await readGpsIotBody(response);
  if (!response.ok) {
    throw new GpsIotClientError(gpsIotMessage(payload, `GPS IoT trip request failed (${response.status})`), response.status);
  }
  return payload;
}

/** MileageSummary expects `YYYY-MM-dd HH:mm:ss`. */
export function toGpsIotDateTime(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return asText(value).replace("T", " ").replace(/\.\d+Z?$/, "").slice(0, 19);
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** GetTrips expects `yyyy/mm/dd HH:mm:ss`. */
export function toGpsIotTripDateTime(value: string): string {
  return toGpsIotDateTime(value).replace(/-/g, "/");
}

export function gpsIotDeviceIdFromImei(imei: string): number {
  let hash = 0;
  const value = String(imei ?? "");
  for (let index = 0; index < value.length; index += 1) hash = (hash * 33 + value.charCodeAt(index)) % 900000000;
  return hash + 1000;
}

function durationMsFromRow(record: Record<string, unknown>) {
  const hours = asNum(record.Hours);
  const minutes = asNum(record.Minutes);
  const seconds = asNum(record.Seconds);
  if (hours || minutes || seconds) return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
  const durationText = asText(record.Duration);
  const match = durationText.match(/^(\d+):(\d+):(\d+)$/);
  if (match) {
    return ((Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3])) * 1000;
  }
  const start = Date.parse(asText(record.StartDate));
  const end = Date.parse(asText(record.EndDate));
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return end - start;
  return 0;
}

function toIsoMaybe(value: unknown) {
  const text = asText(value);
  if (!text) return "";
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const ms = Date.parse(normalized.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return normalized;
}

export function parseGpsIotMileageTrips(
  payload: unknown,
  opts: { imei: string; deviceName?: string } = { imei: "" }
): GpsIotMappedTrip[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).Data)
      ? (asRecord(payload).Data as unknown[])
      : Array.isArray(asRecord(payload).data)
        ? (asRecord(payload).data as unknown[])
        : [];
  const imei = asText(opts.imei);
  const deviceId = gpsIotDeviceIdFromImei(imei || "0");
  const trips: GpsIotMappedTrip[] = [];
  rows.forEach((row, index) => {
    const record = asRecord(row);
    const startLat = asNum(record.StartLatitude ?? record.InitialLatitude);
    const startLon = asNum(record.StartLongitude ?? record.InitialLongitude);
    const endLat = asNum(record.SecondLatitude ?? record.FinalLatitude ?? record.EndLatitude ?? startLat);
    const endLon = asNum(record.SecondLongitude ?? record.FinalLongitude ?? record.EndLongitude ?? startLon);
    const startTime = toIsoMaybe(record.StartDate ?? record.StartTime);
    const endTime = toIsoMaybe(record.EndDate ?? record.EndTime) || startTime;
    const distanceKm = asNum(record.Distance);
    const duration = durationMsFromRow(record);
    const durationHours = duration > 0 ? duration / 3_600_000 : 0;
    const averageSpeed = durationHours > 0 && distanceKm > 0 ? distanceKm / durationHours : 0;
    const maxSpeedKph = Math.max(asNum(record.StartSpeed), asNum(record.EndSpeed), asNum(record.MaxSpeed), averageSpeed);
    trips.push({
      deviceId,
      deviceName: asText(opts.deviceName) || imei,
      // Knots (Traccar convention) so Detailed Movement `* 1.852` is km/h.
      maxSpeed: maxSpeedKph > 0 ? maxSpeedKph / 1.852 : 0,
      averageSpeed: averageSpeed > 0 ? averageSpeed / 1.852 : 0,
      // Traccar reports historically expose metres; Historical normalizes both.
      distance: distanceKm * 1000,
      duration,
      startTime,
      startAddress: asText(record.LocationStart) || null,
      startLat,
      startLon,
      endTime,
      endAddress: asText(record.LocationEnd) || null,
      endLat,
      endLon,
      driverUniqueId: null,
      driverName: asText(record.AttachedAsset || record.DriverName) || null,
      isStoppage: asBool(record.IsStoppageItem),
      isInProgress: asBool(record.IsInProgress),
      tripId: asText(record.TripId) || `mileage-${imei || deviceId}-${index + 1}`
    });
  });
  return trips;
}

export function tripsToRoutePoints(trips: GpsIotMappedTrip[]): GpsIotMappedRoutePoint[] {
  const points: GpsIotMappedRoutePoint[] = [];
  let id = 1;
  for (const trip of trips) {
    if (trip.isStoppage) continue;
    if (trip.startLat === 0 && trip.startLon === 0 && trip.endLat === 0 && trip.endLon === 0) continue;
    const push = (lat: number, lon: number, time: string, address: string | null, speedKnots: number, kind: string) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      if (lat === 0 && lon === 0) return;
      // Live Tracking treats speed > 0.8 knots as moving; keep a floor so sparse mileage
      // segment endpoints still draw on the trail. Mapped trips store speed in knots.
      const knots = Math.max(speedKnots, 2.7);
      points.push({
        id: id++,
        deviceId: trip.deviceId,
        protocol: "gpsiot",
        deviceTime: time,
        fixTime: time,
        serverTime: time,
        valid: true,
        latitude: lat,
        longitude: lon,
        altitude: 0,
        speed: knots,
        course: 0,
        address,
        accuracy: 0,
        network: {},
        geofenceIds: [],
        attributes: {
          source: "gpsiot",
          tripId: trip.tripId,
          kind,
          moving: true,
          ignition: true,
          driverName: trip.driverName ?? undefined
        }
      });
    };
    push(trip.startLat, trip.startLon, trip.startTime, trip.startAddress, trip.maxSpeed, "start");
    push(trip.endLat, trip.endLon, trip.endTime, trip.endAddress, trip.averageSpeed || trip.maxSpeed, "end");
  }
  return points;
}

export function parseGpsIotDailySummary(payload: unknown): GpsIotDailySummary[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).Data)
      ? (asRecord(payload).Data as unknown[])
      : [payload];
  return rows.flatMap((row) => {
    const record = asRecord(row);
    if (!asText(record.VehicleId ?? record.RegNo ?? record.DailyDistance)) return [];
    return [{
      vehicleId: asText(record.VehicleId),
      registration: asText(record.RegNo),
      driverName: asText(record.DriverName),
      maxSpeed: asNum(record.MaxSpeed),
      harshBraking: asNum(record.NoOfHarshBraking),
      harshAccel: asNum(record.NoOfHarshAccel),
      dailyDistance: asNum(record.DailyDistance),
      dailyTrips: asNum(record.NoOfDailyTrips),
      excessIdlingSeconds: asNum(record.ExcessIdlingTime),
      drivingTimeSeconds: asNum(record.DrivingTime),
      speedingTimeSeconds: asNum(record.SpeedingTime)
    }];
  });
}

export function parseGpsIotClientMileage(payload: unknown): GpsIotAssetMileage[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).Data)
      ? (asRecord(payload).Data as unknown[])
      : Array.isArray(asRecord(payload).asset)
        ? (asRecord(payload).asset as unknown[])
        : [payload];
  return rows.flatMap((row) => {
    const record = asRecord(row);
    const imei = asText(record.imei ?? record.Imei);
    const asset = asText(record.asset ?? record.Asset ?? record.Name);
    if (!imei && !asset) return [];
    return [{
      asset,
      imei,
      startHours: asNum(record.start_hours),
      endHours: asNum(record.end_hours),
      totalHours: asNum(record.total_hours),
      currentHours: asNum(record.current_hours),
      startOdometer: asNum(record.start_odometer),
      endOdometer: asNum(record.end_odometer),
      distance: asNum(record.distance),
      currentOdometer: asNum(record.current_odometer)
    }];
  });
}

const GPS_IOT_TRIP_FETCH_CACHE_MS = 20_000;
const tripFetchCache = new Map<string, { at: number; promise: Promise<unknown> }>();

function rememberGpsIotFetch<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = tripFetchCache.get(key);
  if (hit && now - hit.at < GPS_IOT_TRIP_FETCH_CACHE_MS) return hit.promise as Promise<T>;
  const promise = loader().catch((error) => {
    tripFetchCache.delete(key);
    throw error;
  });
  tripFetchCache.set(key, { at: now, promise });
  return promise;
}

/** Test hook — trip/summary fetches are cached briefly so one preview does not stampede GPS IoT. */
export function resetGpsIotTripFetchCache() {
  tripFetchCache.clear();
}

function tripFetchKey(kind: string, parts: Array<string | undefined>) {
  return `${kind}|${parts.map((part) => asText(part)).join("|")}`;
}

function mileageRowsUsable(rows: GpsIotMappedTrip[]) {
  return rows.some((row) => Boolean(row.startTime) || row.distance > 0 || row.duration > 0 || row.isStoppage);
}

async function fetchGpsIotMileageTripsChunk(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { imei: string; startTime: string; endTime: string; timeZone?: string; deviceName?: string },
  fetchImpl: typeof fetch
): Promise<GpsIotMappedTrip[]> {
  const imei = asText(body.imei);
  const timeZone = asText(body.timeZone) || "UTC";
  return rememberGpsIotFetch(
    tripFetchKey("mileage", [imei, body.startTime, body.endTime, timeZone]),
    async () => {
      const payload = await gpsIotJson(
        secrets,
        accessToken,
        "/api/Trip/GetMileageSummary",
        "POST",
        {
          ImeiNumber: Number(imei) || imei,
          StartTime: toGpsIotDateTime(body.startTime),
          EndTime: toGpsIotDateTime(body.endTime),
          TimeZone: timeZone
        },
        fetchImpl
      );
      return parseGpsIotMileageTrips(payload, { imei, deviceName: body.deviceName });
    }
  );
}

export async function fetchGpsIotMileageTrips(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { imei: string; startTime: string; endTime: string; timeZone?: string; deviceName?: string },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotMappedTrip[]> {
  const imei = asText(body.imei);
  if (!imei) throw new GpsIotClientError("imei is required", 400);
  const chunks = splitGpsIotRange(body.startTime, body.endTime, GPS_IOT_TRIPS_MAX_RANGE_MS);
  if (chunks.length === 1) {
    return fetchGpsIotMileageTripsChunk(secrets, accessToken, body, fetchImpl);
  }
  const parts = await mapPool(chunks, 3, async (chunk) => {
    try {
      return await fetchGpsIotMileageTripsChunk(
        secrets,
        accessToken,
        { ...body, imei, startTime: chunk.startTime, endTime: chunk.endTime },
        fetchImpl
      );
    } catch {
      return [] as GpsIotMappedTrip[];
    }
  });
  return dedupeMappedTrips(parts.flat());
}

export async function fetchGpsIotTripIds(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { imei: string; startTime: string; endTime: string; timeZone?: string },
  fetchImpl: typeof fetch = fetch
) {
  const imei = asText(body.imei);
  if (!imei) throw new GpsIotClientError("imei is required", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Trip/GetTrips/",
    "POST",
    {
      ImeiNumber: imei,
      StartTime: toGpsIotTripDateTime(body.startTime),
      EndTime: toGpsIotTripDateTime(body.endTime),
      TimeZone: asText(body.timeZone) || "UTC"
    },
    fetchImpl
  );
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).Data)
      ? (asRecord(payload).Data as unknown[])
      : Array.isArray(asRecord(payload).Trips)
        ? (asRecord(payload).Trips as unknown[])
        : [payload];
  return rows.flatMap((row) => {
    const record = asRecord(row);
    const tripId = asText(record.TripId ?? record.tripId);
    if (!tripId) return [];
    return [{
      tripId,
      isInProgress: asBool(record.IsInProgress),
      // Doc: IsStoppageItem true = parked, false = trip.
      isStoppage: asBool(record.IsStoppageItem)
    }];
  });
}

export async function fetchGpsIotTripDetails(
  secrets: GpsIotSecrets,
  accessToken: string,
  tripId: string,
  fetchImpl: typeof fetch = fetch
) {
  const id = asText(tripId);
  if (!id) throw new GpsIotClientError("TripId is required", 400);
  return gpsIotJson(secrets, accessToken, "/api/Trip/GetTripDetails", "POST", { TripId: id }, fetchImpl);
}

/** Parked TotalTimeParked is usually seconds; small decimals are treated as hours. */
function parkedDurationMs(value: unknown) {
  const raw = asNum(value);
  if (!(raw > 0)) return 0;
  if (raw <= 48) return Math.round(raw * 3_600_000);
  return Math.round(raw * 1000);
}

/**
 * Map GetTripDetails payload onto the Traccar trip/stop shape used by
 * Detailed / Daily Movement reports (columns + totals).
 *
 * Traccar convention kept for report math:
 * - distance → metres
 * - duration → milliseconds
 * - maxSpeed / averageSpeed → knots (Reports multiplies by 1.852 for km/h)
 */
export function parseGpsIotTripDetails(
  payload: unknown,
  meta: {
    tripId: string;
    imei: string;
    deviceName?: string;
    isStoppage?: boolean;
    isInProgress?: boolean;
  }
): GpsIotMappedTrip | null {
  const root = asRecord(payload);
  const trip = asRecord(root.Trip ?? root.trip);
  const parked = asRecord(root.Parked ?? root.parked);
  const hasTrip = Object.keys(trip).length > 0 || asText(root.StartDate ?? root.LocationStart ?? root.Distance);
  const hasParked = Object.keys(parked).length > 0
    || asText(root.TotalTimeParked ?? root.LocationpParked ?? root.LocationParked);
  const source = hasTrip ? (Object.keys(trip).length ? trip : root) : {};
  const parkedSource = hasParked ? (Object.keys(parked).length ? parked : root) : {};
  const flaggedStoppage = meta.isStoppage === true
    || asBool(asRecord(source).IsStoppageItem)
    || (!hasTrip && hasParked);
  const deviceId = gpsIotDeviceIdFromImei(meta.imei || "0");
  const deviceName = asText(meta.deviceName) || meta.imei;

  if (flaggedStoppage) {
    const location = asText(
      parkedSource.LocationpParked
      ?? parkedSource.LocationParked
      ?? asRecord(source).LocationStart
      ?? asRecord(source).LocationEnd
    );
    const lat = asNum(parkedSource.Latitude ?? asRecord(source).InitialLatitude ?? asRecord(source).StartLatitude);
    const lon = asNum(parkedSource.Longitude ?? asRecord(source).InitialLongitude ?? asRecord(source).StartLongitude);
    const startTime = toIsoMaybe(asRecord(source).StartDate ?? asRecord(source).StartTime);
    const endTime = toIsoMaybe(asRecord(source).EndDate ?? asRecord(source).EndTime) || startTime;
    const duration = parkedDurationMs(parkedSource.TotalTimeParked)
      || durationMsFromRow(asRecord(source))
      || (asNum(asRecord(source).TotalSeconds) * 1000);
    return {
      deviceId,
      deviceName,
      maxSpeed: 0,
      averageSpeed: 0,
      distance: 0,
      duration,
      startTime,
      startAddress: location || null,
      startLat: lat,
      startLon: lon,
      endTime,
      endAddress: location || null,
      endLat: lat,
      endLon: lon,
      driverUniqueId: null,
      driverName: asText(asRecord(source).AttachedAsset ?? asRecord(source).DriverName) || null,
      isStoppage: true,
      isInProgress: Boolean(meta.isInProgress),
      tripId: meta.tripId
    };
  }

  if (!hasTrip && !asText(asRecord(source).StartDate)) return null;
  const record = asRecord(source);
  const startTime = toIsoMaybe(record.StartDate ?? record.StartTime);
  const endTime = toIsoMaybe(record.EndDate ?? record.EndTime) || startTime;
  const totalSeconds = asNum(record.TotalSeconds);
  const duration = totalSeconds > 0
    ? totalSeconds * 1000
    : durationMsFromRow(record);
  const distanceKm = asNum(record.Distance);
  const maxSpeedKph = asNum(record.MaxSpeed);
  const avgSpeedKph = asNum(record.AvgSpeed ?? record.AverageSpeed);
  return {
    deviceId,
    deviceName,
    // Knots so Detailed Movement `maxSpeed * 1.852` yields km/h.
    maxSpeed: maxSpeedKph > 0 ? maxSpeedKph / 1.852 : 0,
    averageSpeed: avgSpeedKph > 0 ? avgSpeedKph / 1.852 : 0,
    distance: distanceKm * 1000,
    duration,
    startTime,
    startAddress: asText(record.LocationStart) || null,
    startLat: asNum(record.InitialLatitude ?? record.StartLatitude),
    startLon: asNum(record.InitialLongitude ?? record.StartLongitude),
    endTime,
    endAddress: asText(record.LocationEnd) || null,
    endLat: asNum(record.FinalLatitude ?? record.EndLatitude ?? record.SecondLatitude),
    endLon: asNum(record.FinalLongitude ?? record.EndLongitude ?? record.SecondLongitude),
    driverUniqueId: null,
    driverName: asText(record.AttachedAsset ?? record.DriverName) || null,
    isStoppage: false,
    isInProgress: Boolean(meta.isInProgress) || asBool(record.IsInProgress),
    tripId: meta.tripId
  };
}

async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function fetchGpsIotDeviceTripsFromDetails(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { imei: string; startTime: string; endTime: string; timeZone?: string; deviceName?: string },
  fetchImpl: typeof fetch
): Promise<GpsIotMappedTrip[]> {
  const imei = asText(body.imei);
  let ids: Array<{ tripId: string; isInProgress: boolean; isStoppage: boolean }> = [];
  try {
    ids = await fetchGpsIotTripIds(secrets, accessToken, body, fetchImpl);
  } catch {
    ids = [];
  }
  if (!ids.length) return [];
  const detailed = await mapPool(ids, 6, async (item) => {
    try {
      const payload = await fetchGpsIotTripDetails(secrets, accessToken, item.tripId, fetchImpl);
      return parseGpsIotTripDetails(payload, {
        tripId: item.tripId,
        imei,
        deviceName: body.deviceName,
        isStoppage: item.isStoppage,
        isInProgress: item.isInProgress
      });
    } catch {
      return null;
    }
  });
  return detailed.filter((row): row is GpsIotMappedTrip => Boolean(row));
}

async function fetchGpsIotDeviceTripsChunk(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { imei: string; startTime: string; endTime: string; timeZone?: string; deviceName?: string },
  fetchImpl: typeof fetch
): Promise<GpsIotMappedTrip[]> {
  const imei = asText(body.imei);
  const timeZone = asText(body.timeZone) || "UTC";
  return rememberGpsIotFetch(
    tripFetchKey("device", [imei, body.startTime, body.endTime, timeZone]),
    async () => {
      try {
        const mileage = await fetchGpsIotMileageTripsChunk(secrets, accessToken, body, fetchImpl);
        if (mileageRowsUsable(mileage)) return mileage;
      } catch {
        // Mileage rejected (range/limit). Per-id details are the fallback.
      }
      const detailed = await fetchGpsIotDeviceTripsFromDetails(secrets, accessToken, body, fetchImpl);
      if (detailed.length) return detailed;
      try {
        return await fetchGpsIotMileageTripsChunk(secrets, accessToken, body, fetchImpl);
      } catch {
        return [] as GpsIotMappedTrip[];
      }
    }
  );
}

/**
 * Detailed Movement / Utilisation / Historical trips.
 * GetMileageSummary returns the same columns in one call. GetTrips → GetTripDetails
 * is one HTTP request per trip id, which makes a one-day fleet preview take minutes.
 * Use that path only when mileage is empty or rejected.
 */
export async function fetchGpsIotDeviceTrips(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { imei: string; startTime: string; endTime: string; timeZone?: string; deviceName?: string },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotMappedTrip[]> {
  const imei = asText(body.imei);
  if (!imei) throw new GpsIotClientError("imei is required", 400);
  const chunks = splitGpsIotRange(body.startTime, body.endTime, GPS_IOT_TRIPS_MAX_RANGE_MS);
  if (chunks.length === 1) {
    return dedupeMappedTrips(await fetchGpsIotDeviceTripsChunk(secrets, accessToken, body, fetchImpl));
  }
  const parts = await mapPool(chunks, 2, async (chunk) => {
    try {
      return await fetchGpsIotDeviceTripsChunk(
        secrets,
        accessToken,
        { ...body, imei, startTime: chunk.startTime, endTime: chunk.endTime },
        fetchImpl
      );
    } catch {
      return [] as GpsIotMappedTrip[];
    }
  });
  return dedupeMappedTrips(parts.flat());
}

export async function fetchGpsIotDailySummary(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { clientId: string; startTime?: string; endTime?: string; timeZone?: string },
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  const request: Record<string, unknown> = {
    ClientID: clientId,
    TimeZone: asText(body.timeZone) || "UTC"
  };
  if (asText(body.startTime)) request.StartTime = toGpsIotDateTime(String(body.startTime));
  if (asText(body.endTime)) request.EndTime = toGpsIotDateTime(String(body.endTime));
  return rememberGpsIotFetch(
    tripFetchKey("daily", [clientId, asText(body.startTime), asText(body.endTime), asText(body.timeZone) || "UTC"]),
    async () => {
      const payload = await gpsIotJson(secrets, accessToken, "/api/DailySummary/GetDailySummary", "POST", request, fetchImpl);
      return parseGpsIotDailySummary(payload);
    }
  );
}

export async function fetchGpsIotClientMileage(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { clientId: string; startTime: string; endTime: string; timeZone?: string; assetIds?: string[] },
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  const request: Record<string, unknown> = {
    ClientID: clientId,
    TimeZone: asText(body.timeZone) || "UTC",
    StartTime: toGpsIotDateTime(body.startTime),
    EndTime: toGpsIotDateTime(body.endTime)
  };
  if (Array.isArray(body.assetIds) && body.assetIds.length) {
    request.asset_ids = body.assetIds.map((id) => asText(id)).filter(Boolean);
  }
  const assetKey = Array.isArray(body.assetIds) ? body.assetIds.map((id) => asText(id)).filter(Boolean).join(",") : "";
  return rememberGpsIotFetch(
    tripFetchKey("client-mileage", [clientId, body.startTime, body.endTime, asText(body.timeZone) || "UTC", assetKey]),
    async () => {
      const payload = await gpsIotJson(secrets, accessToken, "/api/trip/GetClientAssetsMileage", "POST", request, fetchImpl);
      return parseGpsIotClientMileage(payload);
    }
  );
}

export type GpsIotMovementSummary = {
  deviceId: number;
  deviceName: string;
  maxSpeed: number;
  averageSpeed: number;
  distance: number;
  spentFuel: number;
  engineHours: number;
  tripCount: number;
  registration: string;
  driverName: string;
  harshBraking: number;
  harshAccel: number;
  excessIdlingSeconds: number;
  speedingTimeSeconds: number;
  source: "daily-summary" | "client-mileage" | "trips";
};

const normKey = (value: unknown) => asText(value).toLowerCase().replace(/\s+/g, "");

function rangeWithinMs(startTime: string, endTime: string, maxMs: number) {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;
  return (end - start) <= maxMs + 60_000;
}

function rangeWithinDailySummaryWindow(startTime: string, endTime: string) {
  return rangeWithinMs(startTime, endTime, GPS_IOT_DAILY_SUMMARY_MAX_RANGE_MS);
}

function rangeWithinTripsWindow(startTime: string, endTime: string) {
  return rangeWithinMs(startTime, endTime, GPS_IOT_TRIPS_MAX_RANGE_MS);
}

/**
 * Summary Movement data (limited windows):
 * - ≤24h → GetDailySummary
 * - ≤30d → GetClientAssetsMileage + trip count from GetTrips
 * - otherwise / on limit errors → chunked GetTrips (same as Detailed Movement,
 *   so Utilisation + Historical still populate outside summary limits)
 */
export async function fetchGpsIotMovementSummary(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: {
    imei: string;
    startTime: string;
    endTime: string;
    timeZone?: string;
    deviceName?: string;
    registration?: string;
    clientId?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotMovementSummary[]> {
  const imei = asText(body.imei);
  if (!imei) throw new GpsIotClientError("imei is required", 400);
  const deviceId = gpsIotDeviceIdFromImei(imei);
  const deviceName = asText(body.deviceName) || imei;
  const registration = asText(body.registration);
  const clientId = asText(body.clientId);
  const timeZone = asText(body.timeZone) || "UTC";

  if (clientId && rangeWithinDailySummaryWindow(body.startTime, body.endTime)) {
    try {
      const dailyRows = await fetchGpsIotDailySummary(
        secrets,
        accessToken,
        { clientId, startTime: body.startTime, endTime: body.endTime, timeZone },
        fetchImpl
      );
      const regKey = normKey(registration);
      const nameKey = normKey(deviceName);
      const hit = dailyRows.find((row) => {
        const rowReg = normKey(row.registration);
        if (regKey && rowReg && rowReg === regKey) return true;
        if (nameKey && rowReg && rowReg === nameKey) return true;
        if (regKey && asText(row.vehicleId) && asText(row.vehicleId) === asText(registration)) return true;
        return dailyRows.length === 1;
      }) ?? (dailyRows.length === 1 ? dailyRows[0] : undefined);

      if (hit) {
        const engineHours = hit.drivingTimeSeconds > 0 ? hit.drivingTimeSeconds / 3600 : 0;
        const avgKph = engineHours > 0 && hit.dailyDistance > 0 ? hit.dailyDistance / engineHours : 0;
        return [{
          deviceId,
          deviceName: deviceName || hit.registration || imei,
          maxSpeed: hit.maxSpeed > 0 ? hit.maxSpeed / 1.852 : 0,
          averageSpeed: avgKph > 0 ? avgKph / 1.852 : 0,
          distance: hit.dailyDistance * 1000,
          spentFuel: 0,
          engineHours,
          tripCount: Math.max(0, Math.round(hit.dailyTrips)),
          registration: hit.registration || registration,
          driverName: hit.driverName,
          harshBraking: hit.harshBraking,
          harshAccel: hit.harshAccel,
          excessIdlingSeconds: hit.excessIdlingSeconds,
          speedingTimeSeconds: hit.speedingTimeSeconds,
          source: "daily-summary"
        }];
      }
    } catch {
      // Fall through — Utilisation/Historical use chunked GetTrips below.
    }
  }

  // Client mileage is also capped at 30 days; skip it outside that window.
  if (clientId && rangeWithinTripsWindow(body.startTime, body.endTime)) {
    try {
      const mileageRows = await fetchGpsIotClientMileage(
        secrets,
        accessToken,
        { clientId, startTime: body.startTime, endTime: body.endTime, timeZone },
        fetchImpl
      );
      const hit = mileageRows.find((row) => asText(row.imei) === imei)
        ?? mileageRows.find((row) => normKey(row.asset) === normKey(deviceName) || normKey(row.asset) === normKey(registration))
        ?? (mileageRows.length === 1 ? mileageRows[0] : undefined);
      if (hit) {
        // Trip count / max speed from one mileage call. GetTripDetails per id is what made summaries stall.
        const mileageTrips = await fetchGpsIotMileageTrips(
          secrets,
          accessToken,
          { imei, startTime: body.startTime, endTime: body.endTime, timeZone, deviceName },
          fetchImpl
        ).catch(() => [] as GpsIotMappedTrip[]);
        const moving = mileageTrips.filter((trip) => !trip.isStoppage);
        const maxSpeed = moving.reduce((max, trip) => Math.max(max, trip.maxSpeed), 0);
        const engineHours = hit.totalHours > 0
          ? hit.totalHours
          : moving.reduce((sum, trip) => sum + trip.duration, 0) / 3_600_000;
        const distanceKm = hit.distance > 0
          ? hit.distance
          : moving.reduce((sum, trip) => sum + trip.distance, 0) / 1000;
        const avgKph = engineHours > 0 && distanceKm > 0 ? distanceKm / engineHours : 0;
        return [{
          deviceId,
          deviceName: hit.asset || deviceName,
          maxSpeed,
          averageSpeed: avgKph > 0 ? avgKph / 1.852 : 0,
          distance: distanceKm * 1000,
          spentFuel: 0,
          engineHours,
          tripCount: moving.length,
          registration: registration || hit.asset,
          driverName: "",
          harshBraking: 0,
          harshAccel: 0,
          excessIdlingSeconds: 0,
          speedingTimeSeconds: 0,
          source: "client-mileage"
        }];
      }
    } catch {
      // Fall through to detailed movement trips.
    }
  }

  // Outside summary limits (or when they fail): same GetTrips path as Detailed Movement.
  const trips = await fetchGpsIotDeviceTrips(
    secrets,
    accessToken,
    { imei, startTime: body.startTime, endTime: body.endTime, timeZone, deviceName },
    fetchImpl
  );
  const moving = trips.filter((trip) => !trip.isStoppage);
  const source = moving.length ? moving : trips;
  if (!source.length) return [];
  const distance = source.reduce((sum, trip) => sum + trip.distance, 0);
  const duration = source.reduce((sum, trip) => sum + trip.duration, 0);
  const maxSpeed = source.reduce((max, trip) => Math.max(max, trip.maxSpeed), 0);
  const engineHours = duration > 0 ? duration / 3_600_000 : 0;
  return [{
    deviceId,
    deviceName,
    maxSpeed,
    averageSpeed: engineHours > 0 ? ((distance / 1000) / engineHours) / 1.852 : 0,
    distance,
    spentFuel: 0,
    engineHours,
    tripCount: moving.length,
    registration,
    driverName: asText(source[0]?.driverName),
    harshBraking: 0,
    harshAccel: 0,
    excessIdlingSeconds: 0,
    speedingTimeSeconds: 0,
    source: "trips"
  }];
}
