import { asyncPool } from "./performance/asyncPool";
import { apiPrivateCacheHeaders } from "./performance/edgeCache";

type TraccarFetch = (
  env: unknown,
  pathnameWithQuery: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; body: any }>;

type HomeDashboardDeps = {
  env: unknown;
  traccarFetch: TraccarFetch;
  listAssets: (tenantId: string) => Promise<any[]>;
  kvGet: (key: string) => Promise<string | null>;
  kvPut: (key: string, value: string, ttlSec?: number) => Promise<void>;
};

export type HomeDashboardSectionName = "live" | "metrics" | "performance" | "operations" | "activity";

const CACHE_TTL_SEC = 300;
const TRACCAR_CONCURRENCY = 8;

const corsHeaders = (): Record<string, string> => ({
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, x-tenant-id, x-api-key, x-home-sites, authorization"
});

const jsonResponse = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...(init.headers ?? {})
    }
  });

const ALERT_EVENT_TYPES = new Set([
  "alarm",
  "deviceOverspeed",
  "deviceFuelDrop",
  "deviceFuelIncrease",
  "sos",
  "hardAcceleration",
  "hardBraking",
  "hardCornering"
]);

const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const normKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

const toImei = (value: unknown): string => {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.length < 14 || digits.length > 17) return "";
  return digits;
};

const normalizeSiteList = (raw: string): string[] =>
  String(raw ?? "")
    .split("|")
    .map((site) => site.trim())
    .filter(Boolean);

const assetMatchesSites = (asset: any, scopedSites: string[]) => {
  if (!scopedSites.length) return false;
  const siteKey = normKey(asset?.site);
  const allowed = new Set(scopedSites.map((site) => normKey(site)));
  return siteKey && allowed.has(siteKey);
};

const DEFAULT_TIME_ZONE = "UTC";

const isValidTimeZone = (timeZone: string): boolean => {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
};

const zoneParts = (ms: number, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(ms))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts;
};

/** YYYY-MM-DD of a timestamp in the site time zone (the server itself runs in UTC). */
const dayKeyInZone = (ms: number, timeZone: string): string => {
  const p = zoneParts(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

const zoneOffsetMs = (ms: number, timeZone: string) => {
  const p = zoneParts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - (ms - (((ms % 1000) + 1000) % 1000));
};

const zonedMidnightMs = (day: string, timeZone: string): number => {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - zoneOffsetMs(guess, timeZone);
  return guess - zoneOffsetMs(first, timeZone);
};

const addDays = (day: string, days: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

const isDayKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const rangeToIsoBounds = (fromDate: string, toDate: string, timeZone: string) => {
  const startMs = zonedMidnightMs(fromDate, timeZone);
  const endMs = zonedMidnightMs(addDays(toDate, 1), timeZone) - 1;
  return { from: new Date(startMs).toISOString(), to: new Date(endMs).toISOString() };
};

/** Stop between two trips; overnight / multi-day parking is not standing time. */
const sameDayStandingMs = (endMs: number, nextStartMs: number, timeZone: string): number => {
  if (!Number.isFinite(endMs) || !Number.isFinite(nextStartMs) || nextStartMs <= endMs) return 0;
  if (dayKeyInZone(endMs, timeZone) !== dayKeyInZone(nextStartMs, timeZone)) return 0;
  return nextStartMs - endMs;
};

const formatRangeLabel = (fromDate: string, toDate: string): string => {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "Selected range";
  const fromLabel = from.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const toLabel = to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fromLabel} – ${toLabel}`;
};

type TimelineBucket = {
  key: string;
  label: string;
  match: (date: Date) => boolean;
};

const buildTimelineBuckets = (fromDate: string, toDate: string, timeZone: string): TimelineBucket[] => {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  const buckets: TimelineBucket[] = [];
  let key = fromDate;

  while (key <= toDate && buckets.length < 45) {
    const labelDate = new Date(`${key}T12:00:00Z`);
    const label =
      dayCount <= 7
        ? labelDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" })
        : labelDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    const bucketKey = key;
    buckets.push({
      key: bucketKey,
      label,
      match: (date: Date) => dayKeyInZone(date.getTime(), timeZone) === bucketKey
    });
    key = addDays(key, 1);
  }
  return buckets;
};

type DeviceTarget = { registration: string; site: string; deviceId: string };

const classifyLive = (row: any): "moving" | "stopped" | "idle" | "offline" => {
  const lastMs = Date.parse(String(row?.lastUpdate ?? row?.position?.fixTime ?? row?.position?.deviceTime ?? ""));
  const status = String(row?.status ?? "").trim().toLowerCase();
  const ageMs = Number.isFinite(lastMs) ? Date.now() - lastMs : Number.POSITIVE_INFINITY;
  if (status === "offline" || !Number.isFinite(lastMs) || ageMs > 6 * 3600000) return "offline";
  if (ageMs > 30 * 60000) return "idle";
  const speed = num(row?.position?.speed);
  return speed >= 5 ? "moving" : "stopped";
};

async function resolveDeviceTargets(deps: HomeDashboardDeps, assets: any[]): Promise<DeviceTarget[]> {
  const devicesResp = await deps.traccarFetch(deps.env, "/api/devices?all=true");
  const traccarDevices = Array.isArray(devicesResp.body) ? devicesResp.body : [];
  const deviceByUniqueId = new Map<string, string>();
  const deviceByName = new Map<string, string>();
  for (const device of traccarDevices) {
    const id = String(device?.id ?? "").trim();
    if (!id) continue;
    const uniqueId = normKey(device?.uniqueId);
    const name = normKey(device?.name);
    if (uniqueId) deviceByUniqueId.set(uniqueId, id);
    if (name) deviceByName.set(name, id);
  }

  const resolved: (DeviceTarget | null)[] = assets.map((asset) => {
    const registration = String(asset?.registration ?? asset?.assetDescription ?? asset?.name ?? "").trim();
    if (!registration) return null;
    const site = String(asset?.site ?? "").trim() || "Unknown site";
    const directId = num(asset?.traccarDeviceId ?? asset?.deviceId);
    if (Number.isFinite(directId) && directId > 0) {
      return { registration, site, deviceId: String(directId) };
    }
    const imei = toImei(asset?.imei ?? asset?.uniqueId);
    if (imei) {
      const cached = deviceByUniqueId.get(normKey(imei));
      if (cached) return { registration, site, deviceId: cached };
    }
    const byName = deviceByName.get(normKey(registration));
    if (byName) return { registration, site, deviceId: byName };
    return null;
  });

  const unique = new Map<string, DeviceTarget>();
  for (const item of resolved) {
    if (item) unique.set(item.deviceId, item);
  }
  return [...unique.values()];
}

async function fetchTraccarLive(deps: HomeDashboardDeps) {
  const [devicesResp, positionsResp] = await Promise.all([
    deps.traccarFetch(deps.env, "/api/devices?all=true"),
    deps.traccarFetch(deps.env, "/api/positions")
  ]);
  const devices = Array.isArray(devicesResp.body) ? devicesResp.body : [];
  const positions = Array.isArray(positionsResp.body) ? positionsResp.body : [];
  const byDeviceId = new Map<number, any>();
  for (const item of positions) {
    const id = Number(item?.deviceId);
    if (Number.isFinite(id)) byDeviceId.set(id, item);
  }
  return devices.map((device: any) => {
    const deviceId = Number(device?.id ?? 0);
    const pos = Number.isFinite(deviceId) ? byDeviceId.get(deviceId) ?? null : null;
    return {
      deviceId: device?.id,
      imei: device?.uniqueId,
      name: device?.name,
      status: device?.status,
      lastUpdate: device?.lastUpdate,
      position: pos
        ? {
            speed: pos?.speed,
            fixTime: pos?.fixTime,
            deviceTime: pos?.deviceTime
          }
        : null
    };
  });
}

type FlatTrip = any & { __target: DeviceTarget };

type DashboardParams = {
  tenantId: string;
  scopedSites: string[];
  fromDate: string;
  toDate: string;
  timeZone: string;
  force?: boolean;
};

type HomeDashboardCache = {
  computedAt: string;
  fromDate: string;
  toDate: string;
  scopedSites: string[];
  model: Record<string, unknown>;
};

const cacheKey = (params: DashboardParams) =>
  `home:dash:v2:${params.tenantId}:${params.scopedSites.map(normKey).sort().join(",")}:${params.fromDate}:${params.toDate}:${params.timeZone}`;

const shortAddress = (address: string | null | undefined, fallback: string): string => {
  const raw = String(address ?? "").trim();
  if (!raw) return fallback;
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[0] || fallback;
};

async function computeDashboardModel(
  deps: HomeDashboardDeps,
  params: DashboardParams
): Promise<HomeDashboardCache> {
  const { tenantId, scopedSites, fromDate, toDate, timeZone } = params;
  const { from, to } = rangeToIsoBounds(fromDate, toDate, timeZone);
  const buckets = buildTimelineBuckets(fromDate, toDate, timeZone);

  // One asset read: listAssets also normalises ids, which writes to the database.
  const allAssets = await deps.listAssets(tenantId);
  const inScopeAssets = (Array.isArray(allAssets) ? allAssets : []).filter((asset) =>
    assetMatchesSites(asset, scopedSites)
  );
  const [live, targets] = await Promise.all([fetchTraccarLive(deps), resolveDeviceTargets(deps, inScopeAssets)]);

  const liveByDeviceId = new Map<string, any>();
  const liveByImei = new Map<string, any>();
  const liveByName = new Map<string, any>();
  for (const row of Array.isArray(live) ? live : []) {
    const deviceId = String(row?.deviceId ?? "").trim();
    if (deviceId) liveByDeviceId.set(deviceId, row);
    const imei = toImei(row?.imei);
    if (imei) liveByImei.set(imei, row);
    const name = normKey(row?.name);
    if (name) liveByName.set(name, row);
  }

  const statusCounts = { moving: 0, stopped: 0, idle: 0, offline: 0 };
  for (const asset of inScopeAssets) {
    const registration = String(asset?.registration ?? asset?.assetDescription ?? asset?.name ?? "").trim();
    const directId = String(num(asset?.traccarDeviceId ?? asset?.deviceId) || "").trim();
    const imei = toImei(asset?.imei ?? asset?.uniqueId);
    const row =
      (directId && liveByDeviceId.get(directId)) ||
      (imei && liveByImei.get(imei)) ||
      liveByName.get(normKey(registration)) ||
      null;
    const status = row ? classifyLive(row) : "offline";
    statusCounts[status] += 1;
  }

  const tripBatches = await asyncPool(targets, TRACCAR_CONCURRENCY, async (target) => {
    const query = new URLSearchParams({ deviceId: target.deviceId, from, to });
    const resp = await deps.traccarFetch(deps.env, `/api/reports/trips?${query.toString()}`);
    const trips = Array.isArray(resp.body) ? resp.body : Array.isArray(resp.body?.trips) ? resp.body.trips : [];
    return trips.map((trip: any) => ({ ...trip, __target: target }));
  });

  const eventBatches = await asyncPool(targets, TRACCAR_CONCURRENCY, async (target) => {
    const query = new URLSearchParams({ deviceId: target.deviceId, from, to });
    const resp = await deps.traccarFetch(deps.env, `/api/reports/events?${query.toString()}`);
    return Array.isArray(resp.body) ? resp.body : Array.isArray(resp.body?.events) ? resp.body.events : [];
  });

  const summaryBatches = await asyncPool(targets, TRACCAR_CONCURRENCY, async (target) => {
    const query = new URLSearchParams({ deviceId: target.deviceId, from, to });
    const resp = await deps.traccarFetch(deps.env, `/api/reports/summary?${query.toString()}`);
    return Array.isArray(resp.body) ? resp.body : [];
  });

  const trips: FlatTrip[] = tripBatches.flat();

  let totalDistanceMeters = 0;
  let totalFuel = 0;
  let drivingMs = 0;
  const driverAgg = new Map<string, { distance: number; trips: number }>();
  const routeAgg = new Map<string, { distance: number; trips: number }>();
  const distanceByBucket = buckets.map(() => 0);
  const fuelByBucket = buckets.map(() => 0);
  const tripsByBucket = buckets.map(() => 0);
  const activeByBucket = buckets.map(() => new Set<string>());

  for (const trip of trips) {
    const distanceM = num(trip.distance);
    const fuel = num(trip.spentFuel);
    const startMs = Date.parse(String(trip.startTime ?? ""));
    const endMs = Date.parse(String(trip.endTime ?? trip.startTime ?? ""));
    const duration =
      num(trip.duration) > 0
        ? num(trip.duration)
        : Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
          ? endMs - startMs
          : 0;

    totalDistanceMeters += distanceM;
    totalFuel += fuel;
    drivingMs += Math.max(0, duration);

    const driver = String(trip.driverName ?? "").trim();
    if (driver) {
      const agg = driverAgg.get(driver) ?? { distance: 0, trips: 0 };
      agg.distance += distanceM;
      agg.trips += 1;
      driverAgg.set(driver, agg);
    }

    const start = shortAddress(trip.startAddress, trip.__target.site || "Origin");
    const end = shortAddress(trip.endAddress, trip.__target.site || "Destination");
    if (start && end && start !== end) {
      const key = `${start} → ${end}`;
      const agg = routeAgg.get(key) ?? { distance: 0, trips: 0 };
      agg.distance += distanceM;
      agg.trips += 1;
      routeAgg.set(key, agg);
    }

    if (Number.isFinite(startMs)) {
      const bucketIndex = buckets.findIndex((bucket) => bucket.match(new Date(startMs)));
      if (bucketIndex >= 0) {
        distanceByBucket[bucketIndex] += distanceM / 1000;
        fuelByBucket[bucketIndex] += fuel;
        tripsByBucket[bucketIndex] += 1;
        activeByBucket[bucketIndex].add(trip.__target.registration);
      }
    }
  }

  let engineMs = 0;
  for (const batch of summaryBatches) {
    for (const summary of Array.isArray(batch) ? batch : []) {
      engineMs += Math.max(0, num(summary?.engineHours));
    }
  }
  const idleMs = Math.max(0, engineMs - drivingMs);

  const tripsByAsset = new Map<string, FlatTrip[]>();
  for (const trip of trips) {
    const key = trip.__target.registration;
    const list = tripsByAsset.get(key) ?? [];
    list.push(trip);
    tripsByAsset.set(key, list);
  }

  const standingByBucket = buckets.map(() => 0);
  let totalStandingMs = 0;
  const assetStandingAgg = new Map<string, { standingMs: number; site: string; trips: number }>();

  const addStandingToBucket = (ms: number, atMs: number) => {
    if (!Number.isFinite(atMs) || ms <= 0) return;
    const bucketIndex = buckets.findIndex((bucket) => bucket.match(new Date(atMs)));
    if (bucketIndex >= 0) standingByBucket[bucketIndex] += ms / 3600000;
  };

  for (const [registration, assetTrips] of tripsByAsset) {
    const sorted = [...assetTrips].sort(
      (a, b) => Date.parse(String(a.startTime ?? "")) - Date.parse(String(b.startTime ?? ""))
    );
    let assetStandingMs = 0;
    const site = sorted[0]?.__target.site ?? "";

    // Same rule as the web dashboard: stops between consecutive trips on the same
    // site-local day. Overnight parking and in-trip slow driving are not standing.
    sorted.forEach((trip, index) => {
      const endMs = Date.parse(String(trip.endTime ?? trip.startTime ?? ""));
      if (index < sorted.length - 1) {
        const nextStartMs = Date.parse(String(sorted[index + 1].startTime ?? ""));
        const gapMs = sameDayStandingMs(endMs, nextStartMs, timeZone);
        if (gapMs > 0) {
          assetStandingMs += gapMs;
          addStandingToBucket(gapMs, endMs);
        }
      }
    });

    totalStandingMs += assetStandingMs;
    assetStandingAgg.set(registration, { standingMs: assetStandingMs, site, trips: sorted.length });
  }

  const geofenceByBucket = buckets.map(() => 0);
  const alertsByBucket = buckets.map(() => 0);
  let geofenceEvents = 0;
  let alerts = 0;

  for (const batch of eventBatches) {
    for (const event of Array.isArray(batch) ? batch : []) {
      const type = String(event?.type ?? "").trim();
      const ms = Date.parse(String(event?.eventTime ?? ""));
      const bucketIndex = Number.isFinite(ms) ? buckets.findIndex((bucket) => bucket.match(new Date(ms))) : -1;
      const isGeofence = type === "geofenceEnter" || type === "geofenceExit";
      const isAlert = ALERT_EVENT_TYPES.has(type);
      if (isGeofence) {
        geofenceEvents += 1;
        if (bucketIndex >= 0) geofenceByBucket[bucketIndex] += 1;
      }
      if (isAlert) {
        alerts += 1;
        if (bucketIndex >= 0) alertsByBucket[bucketIndex] += 1;
      }
    }
  }

  const totalAssetsForUtil = Math.max(1, inScopeAssets.length, targets.length);
  const toSeries = (values: number[]) => buckets.map((bucket, index) => ({ label: bucket.label, value: values[index] ?? 0 }));

  const topDrivers = [...driverAgg.entries()]
    .map(([name, agg]) => ({ name, distanceKm: agg.distance / 1000, trips: agg.trips }))
    .sort((a, b) => b.distanceKm - a.distanceKm)
    .slice(0, 5)
    .map((row, _i, arr) => {
      const max = Math.max(...arr.map((item) => item.distanceKm), 1);
      return {
        name: row.name,
        sub: `${Math.round(row.distanceKm)} km · ${row.trips} trips`,
        value: Math.round((row.distanceKm / max) * 100),
        ratio: row.distanceKm / max
      };
    });

  const maxRouteDistance = Math.max(...[...routeAgg.values()].map((agg) => agg.distance), 1);
  const topRoutes = [...routeAgg.entries()]
    .sort((a, b) => b[1].distance - a[1].distance)
    .slice(0, 4)
    .map(([name, agg]) => ({
      name,
      sub: `${agg.trips} trips`,
      value: Math.round(agg.distance / 1000),
      ratio: agg.distance / maxRouteDistance
    }));

  const maxAssetStanding = Math.max(...[...assetStandingAgg.values()].map((agg) => agg.standingMs), 1);
  const topStandingAssets = [...assetStandingAgg.entries()]
    .sort((a, b) => b[1].standingMs - a[1].standingMs)
    .slice(0, 5)
    .map(([name, agg]) => ({
      name,
      sub: `${agg.site || "—"} · ${agg.trips} trips`,
      value: Math.round((agg.standingMs / 3600000) * 10) / 10,
      ratio: agg.standingMs / maxAssetStanding
    }));

  const maintenance = inScopeAssets
    .map((asset) => {
      const registration = String(asset?.registration ?? asset?.assetDescription ?? asset?.name ?? "").trim();
      const dueDateRaw = String(asset?.nextServiceDate ?? asset?.serviceDueDate ?? asset?.nextServiceAt ?? "").trim();
      const dueKm = num(asset?.serviceDueKm ?? asset?.nextServiceKm);
      const dueMs = Date.parse(dueDateRaw);
      if (Number.isFinite(dueMs)) {
        return {
          name: registration || "Asset",
          sub: String(asset?.serviceType ?? asset?.maintenanceType ?? "Service"),
          value: Math.round((dueMs - Date.now()) / 86400000),
          ratio: 0,
          __sort: Math.round((dueMs - Date.now()) / 86400000)
        };
      }
      if (dueKm > 0) {
        return {
          name: registration || "Asset",
          sub: String(asset?.serviceType ?? "Service"),
          value: Math.round(dueKm),
          ratio: 0,
          __sort: dueKm
        };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.__sort - b.__sort)
    .slice(0, 4)
    .map(({ name, sub, value, ratio }: any) => ({ name, sub, value, ratio }));

  const standingPct =
    totalStandingMs + drivingMs > 0 ? Math.round((totalStandingMs / (totalStandingMs + drivingMs)) * 100) : 0;

  const model = {
    rangeLabel: formatRangeLabel(fromDate, toDate),
    totalVehicles: inScopeAssets.length,
    statusCounts,
    totalDistanceKm: totalDistanceMeters / 1000,
    totalFuelL: totalFuel,
    avgEfficiency: totalFuel > 0 ? totalDistanceMeters / 1000 / totalFuel : 0,
    tripsCompleted: trips.length,
    drivingMs,
    standingMs: totalStandingMs,
    standingPct,
    idleMs,
    geofenceEvents,
    alerts,
    distanceSeries: toSeries(distanceByBucket),
    fuelSeries: toSeries(fuelByBucket),
    utilisationSeries: buckets.map((bucket, index) => ({
      label: bucket.label,
      value: Math.round((activeByBucket[index].size / totalAssetsForUtil) * 100)
    })),
    standingSeries: buckets.map((bucket, index) => ({
      label: bucket.label,
      value: Math.round((standingByBucket[index] ?? 0) * 10) / 10
    })),
    tripsSeries: toSeries(tripsByBucket),
    geofenceSeries: toSeries(geofenceByBucket),
    alertsSeries: toSeries(alertsByBucket),
    topDrivers,
    topRoutes,
    topStandingAssets,
    maintenance
  };

  return {
    computedAt: new Date().toISOString(),
    fromDate,
    toDate,
    scopedSites,
    model
  };
}

async function getOrComputeCache(
  deps: HomeDashboardDeps,
  params: DashboardParams
): Promise<HomeDashboardCache> {
  const key = cacheKey(params);
  if (!params.force) {
    const raw = await deps.kvGet(key);
    if (raw) {
      try {
        return JSON.parse(raw) as HomeDashboardCache;
      } catch {
        // recompute below
      }
    }
  }
  const computed = await computeDashboardModel(deps, params);
  await deps.kvPut(key, JSON.stringify(computed), CACHE_TTL_SEC);
  return computed;
}

class HomeDashboardTimeoutError extends Error {}

/** Rejects on timeout. The compute keeps running and caches its result for the next request. */
async function getOrComputeCacheWithTimeout(
  deps: HomeDashboardDeps,
  params: DashboardParams,
  timeoutMs = 15_000
): Promise<HomeDashboardCache> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getOrComputeCache(deps, params),
      new Promise<HomeDashboardCache>((_, reject) => {
        timer = setTimeout(() => reject(new HomeDashboardTimeoutError("home dashboard compute timed out")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sliceSection(cache: HomeDashboardCache, section: HomeDashboardSectionName) {
  const m = cache.model as any;
  switch (section) {
    case "live":
      return { totalVehicles: m.totalVehicles, statusCounts: m.statusCounts };
    case "metrics":
      return {
        rangeLabel: m.rangeLabel,
        totalDistanceKm: m.totalDistanceKm,
        totalFuelL: m.totalFuelL,
        avgEfficiency: m.avgEfficiency,
        tripsCompleted: m.tripsCompleted,
        drivingMs: m.drivingMs,
        standingMs: m.standingMs,
        standingPct: m.standingPct,
        idleMs: m.idleMs,
        geofenceEvents: m.geofenceEvents,
        alerts: m.alerts
      };
    case "performance":
      return {
        distanceSeries: m.distanceSeries,
        fuelSeries: m.fuelSeries,
        utilisationSeries: m.utilisationSeries,
        topDrivers: m.topDrivers,
        topRoutes: m.topRoutes
      };
    case "operations":
      return {
        standingMs: m.standingMs,
        standingPct: m.standingPct,
        drivingMs: m.drivingMs,
        standingSeries: m.standingSeries,
        topStandingAssets: m.topStandingAssets,
        maintenance: m.maintenance,
        statusCounts: m.statusCounts,
        totalVehicles: m.totalVehicles
      };
    case "activity":
      return {
        geofenceEvents: m.geofenceEvents,
        alerts: m.alerts,
        tripsCompleted: m.tripsCompleted,
        idleMs: m.idleMs,
        geofenceSeries: m.geofenceSeries,
        alertsSeries: m.alertsSeries,
        tripsSeries: m.tripsSeries,
        utilisationSeries: m.utilisationSeries
      };
    default:
      return null;
  }
}

export async function warmHomeDashboardCache(
  deps: HomeDashboardDeps,
  params: DashboardParams
) {
  await getOrComputeCacheWithTimeout(deps, params).catch(() => undefined);
}

export async function handleHomeDashboardRequest(
  request: Request,
  url: URL,
  deps: HomeDashboardDeps,
  resolveTenantId: (request: Request, url: URL) => Promise<string>
): Promise<Response | null> {
  try {
    return await handleHomeDashboardRequestInner(request, url, deps, resolveTenantId);
  } catch (err: any) {
    return jsonResponse(
      { ok: false, error: "Home dashboard failed", message: String(err?.message ?? err ?? "") },
      { status: 500 }
    );
  }
}

async function handleHomeDashboardRequestInner(
  request: Request,
  url: URL,
  deps: HomeDashboardDeps,
  resolveTenantId: (request: Request, url: URL) => Promise<string>
): Promise<Response | null> {
  const pathname = url.pathname;
  if (!pathname.startsWith("/api/home/dashboard/")) return null;
  if (request.method !== "GET" && !(request.method === "POST" && pathname.endsWith("/warm"))) {
    return jsonResponse({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const sectionRaw = pathname.slice("/api/home/dashboard/".length).replace(/\/$/, "");
  const isWarm = sectionRaw === "warm";
  const section = isWarm ? null : (sectionRaw as HomeDashboardSectionName);
  const allowed = new Set(["live", "metrics", "performance", "operations", "activity"]);
  if (!isWarm && (!section || !allowed.has(section))) {
    return jsonResponse({ ok: false, error: "Unknown dashboard section" }, { status: 404 });
  }

  const fromDate = String(url.searchParams.get("from") ?? "").trim();
  const toDate = String(url.searchParams.get("to") ?? "").trim();
  const sitesParam =
    String(url.searchParams.get("sites") ?? "").trim() ||
    String(request.headers.get("x-home-sites") ?? "").trim();

  const scopedSites = normalizeSiteList(sitesParam);
  if (!isDayKey(fromDate) || !isDayKey(toDate) || fromDate > toDate) {
    return jsonResponse({ ok: false, error: "from and to are required (YYYY-MM-DD, from <= to)" }, { status: 400 });
  }
  // Day boundaries follow the site's zone (sent by the client); the server runs in UTC.
  const tzParam = String(url.searchParams.get("tz") ?? "").trim();
  const timeZone = isValidTimeZone(tzParam) ? tzParam : DEFAULT_TIME_ZONE;
  if (!scopedSites.length) {
    return jsonResponse({ ok: false, error: "sites query is required for site-scoped dashboard data" }, { status: 400 });
  }

  const tenantId = await resolveTenantId(request, url);
  if (!tenantId) {
    return jsonResponse({ ok: false, error: "tenant is required" }, { status: 400 });
  }

  if (isWarm) {
    void warmHomeDashboardCache(deps, { tenantId, scopedSites, fromDate, toDate, timeZone });
    return jsonResponse(
      { ok: true, warming: true, cached: false },
      { headers: { ...apiPrivateCacheHeaders(30) } }
    );
  }

  if (section === "live") {
    const assets = (await deps.listAssets(tenantId)).filter((asset) => assetMatchesSites(asset, scopedSites));
    let live: any[] = [];
    try {
      live = await Promise.race([
        fetchTraccarLive(deps),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 8_000))
      ]);
    } catch {
      live = [];
    }
    const liveByDeviceId = new Map<string, any>();
    const liveByImei = new Map<string, any>();
    const liveByName = new Map<string, any>();
    for (const row of live) {
      const deviceId = String(row?.deviceId ?? "").trim();
      if (deviceId) liveByDeviceId.set(deviceId, row);
      const imei = toImei(row?.imei);
      if (imei) liveByImei.set(imei, row);
      const name = normKey(row?.name);
      if (name) liveByName.set(name, row);
    }
    const statusCounts = { moving: 0, stopped: 0, idle: 0, offline: 0 };
    for (const asset of assets) {
      const registration = String(asset?.registration ?? asset?.assetDescription ?? asset?.name ?? "").trim();
      const directId = String(num(asset?.traccarDeviceId ?? asset?.deviceId) || "").trim();
      const imei = toImei(asset?.imei ?? asset?.uniqueId);
      const row =
        (directId && liveByDeviceId.get(directId)) ||
        (imei && liveByImei.get(imei)) ||
        liveByName.get(normKey(registration)) ||
        null;
      const status = row ? classifyLive(row) : "offline";
      statusCounts[status] += 1;
    }
    return jsonResponse(
      { ok: true, section: "live", data: { totalVehicles: assets.length, statusCounts } },
      { headers: { ...apiPrivateCacheHeaders(30) } }
    );
  }

  let cache: HomeDashboardCache;
  try {
    cache = await getOrComputeCacheWithTimeout(deps, { tenantId, scopedSites, fromDate, toDate, timeZone });
  } catch (err) {
    if (err instanceof HomeDashboardTimeoutError) {
      // Not an empty fleet: tell the client to retry instead of painting zeros.
      return jsonResponse(
        { ok: false, error: "Home dashboard is still computing", retryAfterSec: 15 },
        { status: 503, headers: { "retry-after": "15" } }
      );
    }
    throw err;
  }
  const data = sliceSection(cache, section!);
  return jsonResponse(
    { ok: true, section, data, cachedAt: cache.computedAt },
    { headers: { ...apiPrivateCacheHeaders(120) } }
  );
}

export { normalizeSiteList, assetMatchesSites };
