import { getTenantId, getTraccarTrips, getTraccarTripsStrict, type TraccarTrip } from "./api";
import { resolveTripDriverName } from "./assetDriver";
import type { HomeDayPoint, HomeRankRow } from "./homeDashboardApi";
import { loadScopedDeviceContext } from "./homeScopedDevices";
import { readHomeSiteScope } from "./homeSiteScope";
import { buildHomeTimeline, homeRangeBounds, homeTimelineBucketKey, sameDayStandingMs } from "./homeTimeline";
import { resolveHomeTimeZone } from "./homeTimeZone";
import { isCms808Server, isGpsIotServer } from "./regionServers";

export type HomeRangeMetrics = {
  totalDistanceKm: number;
  distanceSeries: HomeDayPoint[];
  totalFuelL: number;
  fuelSeries: HomeDayPoint[];
  utilisationSeries: HomeDayPoint[];
  topDrivers: HomeRankRow[];
  topRoutes: HomeRankRow[];
  standingMs: number;
  drivingMs: number;
  standingPct: number;
  standingSeries: HomeDayPoint[];
  topStandingAssets: HomeRankRow[];
  maintenance: HomeRankRow[];
  tripsCompleted: number;
  tripsSeries: HomeDayPoint[];
  idleMs: number;
  /** Vehicles whose trip report failed to load; totals exclude them. */
  failedDevices: number;
};

const assetLabel = (asset: Record<string, unknown> | undefined, deviceId: string) =>
  String(asset?.registration ?? asset?.assetDescription ?? asset?.name ?? "").trim() ||
  (deviceId ? `Device ${deviceId}` : "Asset");

/** Traccar (and CMS808 movement) trip distance is metres. */
export const tripDistanceKm = (trip: { distance?: unknown }) => {
  const numeric = Number(trip.distance ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric / 1000;
};

const tripDurationMs = (trip: { duration?: unknown; startTime?: unknown; endTime?: unknown }) => {
  const explicit = Number(trip.duration);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const startMs = Date.parse(String(trip.startTime ?? ""));
  const endMs = Date.parse(String(trip.endTime ?? trip.startTime ?? ""));
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs ? endMs - startMs : 0;
};

const shortAddress = (address: unknown, fallback: string) => {
  const raw = String(address ?? "").trim();
  if (!raw || /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(raw)) return fallback;
  const part = raw.split(",").map((item) => item.trim()).filter(Boolean)[0];
  return part || fallback;
};

const rankByValue = (
  rows: Array<{ name: string; sub: string; value: number }>,
  limit: number
): HomeRankRow[] => {
  const sorted = [...rows].sort((a, b) => b.value - a.value).slice(0, limit);
  const max = Math.max(...sorted.map((row) => row.value), 1);
  return sorted.map((row) => ({
    name: row.name,
    sub: row.sub,
    value: Math.round(row.value * 10) / 10,
    ratio: row.value / max
  }));
};

const maintenanceFromAssets = (assets: Record<string, unknown>[]): HomeRankRow[] => {
  const rows = assets
    .map((asset) => {
      const name = assetLabel(asset, "");
      const dueDateRaw = String(asset.nextServiceDate ?? asset.serviceDueDate ?? asset.nextServiceAt ?? "").trim();
      const dueKm = Number(asset.serviceDueKm ?? asset.nextServiceKm ?? 0);
      const dueMs = Date.parse(dueDateRaw);
      const sub = String(asset.serviceType ?? asset.maintenanceType ?? "Service").trim() || "Service";
      if (Number.isFinite(dueMs)) {
        return { name, sub, value: Math.round((dueMs - Date.now()) / 86400000), sort: dueMs };
      }
      if (Number.isFinite(dueKm) && dueKm > 0) {
        return { name, sub, value: Math.round(dueKm), sort: dueKm };
      }
      return null;
    })
    .filter((row): row is { name: string; sub: string; value: number; sort: number } => Boolean(row))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 4);

  return rows.map((row) => ({ name: row.name, sub: row.sub, value: row.value, ratio: 0 }));
};

const emptyMetrics = (
  buckets: HomeDayPoint[],
  assets: Record<string, unknown>[]
): HomeRangeMetrics => ({
  totalDistanceKm: 0,
  distanceSeries: buckets.map((bucket) => ({ ...bucket })),
  totalFuelL: 0,
  fuelSeries: buckets.map((bucket) => ({ ...bucket })),
  utilisationSeries: buckets.map((bucket) => ({ ...bucket })),
  topDrivers: [],
  topRoutes: [],
  standingMs: 0,
  drivingMs: 0,
  standingPct: 0,
  standingSeries: buckets.map((bucket) => ({ ...bucket })),
  topStandingAssets: [],
  maintenance: maintenanceFromAssets(assets),
  tripsCompleted: 0,
  tripsSeries: buckets.map((bucket) => ({ ...bucket })),
  idleMs: 0,
  failedDevices: 0
});

const TRIP_CHUNK = 60;
const TRIPS_CACHE_TTL_MS = 60_000;

export async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index]);
      }
    })
  );
  return results;
}

export type GroupedTrips = {
  grouped: Map<string, TraccarTrip[]>;
  /** Device ids whose trip request failed (not the same as "no trips"). */
  failedDeviceIds: string[];
};

async function loadTripsGroupedByDevice(deviceIds: string[], from: string, to: string): Promise<GroupedTrips> {
  const grouped = new Map<string, TraccarTrip[]>();
  const failed = new Set<string>();
  for (const id of deviceIds) grouped.set(String(id), []);
  if (!deviceIds.length) return { grouped, failedDeviceIds: [] };

  const perDevice = async (deviceId: string) => {
    try {
      grouped.set(String(deviceId), await getTraccarTrips({ from, to, deviceId }));
    } catch {
      failed.add(String(deviceId));
    }
  };

  if (isGpsIotServer()) {
    await mapPool(deviceIds, 6, perDevice);
    return { grouped, failedDeviceIds: [...failed] };
  }

  const chunks: string[][] = [];
  for (let index = 0; index < deviceIds.length; index += TRIP_CHUNK) {
    chunks.push(deviceIds.slice(index, index + TRIP_CHUNK));
  }
  const lists = await mapPool(chunks, 3, async (ids) => {
    try {
      return await getTraccarTripsStrict({ from, to, deviceIds: ids });
    } catch {
      ids.forEach((id) => failed.add(String(id)));
      return [] as TraccarTrip[];
    }
  });
  const flat = lists.flat();
  let matched = 0;
  for (const trip of flat) {
    const bucket = grouped.get(String(trip.deviceId ?? "").trim());
    if (!bucket) continue;
    bucket.push(trip);
    matched += 1;
  }
  if (flat.length > 0 && matched === 0) {
    failed.clear();
    await mapPool(deviceIds, 6, perDevice);
  }
  return { grouped, failedDeviceIds: [...failed] };
}

const tripsCache = new Map<string, { atMs: number; value: Promise<GroupedTrips> }>();

/**
 * Trips for the given devices, grouped by device id. Results are shared for a
 * minute so the trip widgets and the fuel refinement read one report pass.
 */
export function fetchTripsGroupedByDeviceDetailed(deviceIds: string[], from: string, to: string): Promise<GroupedTrips> {
  const key = `${getTenantId() || "_"}|${[...deviceIds].sort().join(",")}|${from}|${to}`;
  const hit = tripsCache.get(key);
  if (hit && Date.now() - hit.atMs < TRIPS_CACHE_TTL_MS) return hit.value;
  const value = loadTripsGroupedByDevice(deviceIds, from, to);
  tripsCache.set(key, { atMs: Date.now(), value });
  // Do not keep a failed pass around for the next refresh.
  void value.then((result) => {
    if (result.failedDeviceIds.length) tripsCache.delete(key);
  });
  return value;
}

/** One report for the fleet. GPS IoT stays per device, with a small parallel pool. */
export async function fetchTripsGroupedByDevice(deviceIds: string[], from: string, to: string) {
  return (await fetchTripsGroupedByDeviceDetailed(deviceIds, from, to)).grouped;
}

type TripSource = {
  key: string;
  label: string;
  site: string;
  asset: Record<string, unknown> | undefined;
  trips: TraccarTrip[];
};

/**
 * VC-400 / JT808 vehicles live on CMS808, not Traccar, so they never resolve to a
 * Traccar device id. Load their movement trips the same way Reports does.
 */
async function loadCms808TripSources(
  assets: Record<string, unknown>[],
  coveredLabels: Set<string>,
  startMs: number,
  endMs: number
): Promise<{ sources: TripSource[]; failed: number }> {
  if (!isCms808Server()) return { sources: [], failed: 0 };
  const cms = await import("./cms808");
  if (!cms.cms808HierarchyActive()) return { sources: [], failed: 0 };
  const vehicles = await cms.loadCms808VehiclesForActiveHierarchy().catch(() => []);
  const assetByPlate = new Map(
    assets.map((asset) => [assetLabel(asset, "").toLowerCase(), asset] as const)
  );
  const targets = vehicles
    .map((vehicle) => {
      const device = String(vehicle.devIdno || vehicle.deviceId || "").trim();
      const plate = String(vehicle.vehiIdno || device).trim();
      return { device, plate };
    })
    .filter((row) => row.device && !coveredLabels.has(row.plate.toLowerCase()));

  let failed = 0;
  const sources = await mapPool(targets, 3, async ({ device, plate }) => {
    const asset = assetByPlate.get(plate.toLowerCase());
    try {
      const trips = await cms.loadCms808MovementTrips(device, new Date(startMs), new Date(endMs), plate);
      return {
        key: `cms808:${device}`,
        label: plate,
        site: String(asset?.site ?? "").trim(),
        asset,
        trips: trips as unknown as TraccarTrip[]
      };
    } catch {
      failed += 1;
      return null;
    }
  });
  return { sources: sources.filter((row): row is TripSource => Boolean(row)), failed };
}

const tripMetricsInflight = new Map<string, Promise<HomeRangeMetrics>>();

/**
 * Range widgets from one trip-report pass (the same Traccar trips the movement
 * reports use). Live vehicle counts stay on the tracking snapshot.
 *
 * - Day boundaries: the site's time zone (same as Reports)
 * - Distance chart and total: trip distance (metres → km)
 * - Fuel (first pass): trip spent fuel, litres
 * - Utilisation: share of scoped assets with a trip in each bucket
 * - Top drivers: trip driver, else the asset's default driver
 * - Top routes: trip start → end
 * - Standing: stops between consecutive trips on the same day (overnight parking excluded)
 * - Trips completed: trip count
 * - Maintenance: service due fields stored on the asset
 */
export async function fetchHomeTripMetrics(fromDate: string, toDate: string): Promise<HomeRangeMetrics> {
  const key = `${getTenantId() || "_"}|${readHomeSiteScope().scopedSites.join("|")}|${fromDate}|${toDate}`;
  const existing = tripMetricsInflight.get(key);
  if (existing) return existing;
  const promise = fetchHomeTripMetricsUncached(fromDate, toDate).finally(() => {
    tripMetricsInflight.delete(key);
  });
  tripMetricsInflight.set(key, promise);
  return promise;
}

async function fetchHomeTripMetricsUncached(fromDate: string, toDate: string): Promise<HomeRangeMetrics> {
  const { buckets, bucketIndexByKey, mode } = buildHomeTimeline(fromDate, toDate);
  const [{ assets, deviceIds, assetByDeviceId }, timeZone] = await Promise.all([
    loadScopedDeviceContext(),
    resolveHomeTimeZone()
  ]);
  const { from, to, startMs: rangeStartMs, endMs: rangeEndMs } = homeRangeBounds(fromDate, toDate, timeZone);

  const { grouped, failedDeviceIds } = await fetchTripsGroupedByDeviceDetailed(deviceIds, from, to);
  const sources: TripSource[] = deviceIds.map((deviceId) => {
    const asset = assetByDeviceId.get(deviceId);
    return {
      key: deviceId,
      label: assetLabel(asset, deviceId),
      site: String(asset?.site ?? "").trim(),
      asset,
      trips: grouped.get(String(deviceId)) ?? []
    };
  });

  const covered = new Set(sources.map((source) => source.label.toLowerCase()));
  const cms = await loadCms808TripSources(assets, covered, rangeStartMs, rangeEndMs).catch(() => ({
    sources: [] as TripSource[],
    failed: 0
  }));
  sources.push(...cms.sources);
  const failedDevices = failedDeviceIds.length + cms.failed;

  if (!sources.length) return { ...emptyMetrics(buckets, assets), failedDevices };

  const distanceByBucket = buckets.map(() => 0);
  const fuelByBucket = buckets.map(() => 0);
  const standingByBucket = buckets.map(() => 0);
  const tripsByBucket = buckets.map(() => 0);
  const activeByBucket = buckets.map(() => new Set<string>());
  const bucketFor = (ms: number) =>
    Number.isFinite(ms) ? bucketIndexByKey.get(homeTimelineBucketKey(new Date(ms), mode, timeZone)) : undefined;

  let totalDistanceKm = 0;
  let totalFuelL = 0;
  let totalStandingMs = 0;
  let totalDrivingMs = 0;
  let tripsCompleted = 0;

  const driverAgg = new Map<string, { distanceKm: number; trips: number }>();
  const routeAgg = new Map<string, { distanceKm: number; trips: number }>();
  const standingByAsset = new Map<string, { standingMs: number; site: string; trips: number }>();

  const assetCount = Math.max(1, assets.length, sources.length);

  for (const source of sources) {
    const { asset, label, site } = source;
    const sorted = [...source.trips].sort(
      (a, b) => Date.parse(String(a.startTime ?? "")) - Date.parse(String(b.startTime ?? ""))
    );

    let assetStandingMs = 0;

    for (let index = 0; index < sorted.length; index += 1) {
      const trip = sorted[index];
      const startMs = Date.parse(String(trip.startTime ?? ""));
      const endMs = Date.parse(String(trip.endTime ?? trip.startTime ?? ""));
      const next = sorted[index + 1];
      const nextStartMs = next ? Date.parse(String(next.startTime ?? "")) : Number.NaN;
      const standingMs = sameDayStandingMs(endMs, nextStartMs, timeZone);

      const distanceKm = tripDistanceKm(trip);
      const spent = Number(trip.spentFuel ?? 0);
      const fuelL = Number.isFinite(spent) && spent > 0 ? spent : 0;

      totalDistanceKm += distanceKm;
      totalFuelL += fuelL;
      totalDrivingMs += tripDurationMs(trip);
      totalStandingMs += standingMs;
      assetStandingMs += standingMs;
      tripsCompleted += 1;

      const driver = resolveTripDriverName(trip.driverName || trip.driverUniqueId, asset, "");
      if (driver) {
        const agg = driverAgg.get(driver) ?? { distanceKm: 0, trips: 0 };
        agg.distanceKm += distanceKm;
        agg.trips += 1;
        driverAgg.set(driver, agg);
      }

      const start = shortAddress(trip.startAddress, site || "Origin");
      const end = shortAddress(trip.endAddress, site || "Destination");
      if (start && end && start !== end) {
        const key = `${start} → ${end}`;
        const agg = routeAgg.get(key) ?? { distanceKm: 0, trips: 0 };
        agg.distanceKm += distanceKm;
        agg.trips += 1;
        routeAgg.set(key, agg);
      }

      const idx = bucketFor(startMs);
      if (idx != null) {
        distanceByBucket[idx] += distanceKm;
        fuelByBucket[idx] += fuelL;
        tripsByBucket[idx] += 1;
        activeByBucket[idx].add(label);
      }
      if (standingMs > 0) {
        const standingIdx = bucketFor(endMs);
        if (standingIdx != null) standingByBucket[standingIdx] += standingMs / 3_600_000;
      }
    }

    if (assetStandingMs > 0) {
      standingByAsset.set(label, { standingMs: assetStandingMs, site, trips: sorted.length });
    }
  }

  const roundSeries = (values: number[], digits = 1) =>
    buckets.map((bucket, index) => ({
      label: bucket.label,
      value: Math.round((values[index] ?? 0) * 10 ** digits) / 10 ** digits
    }));

  const standingPct =
    totalStandingMs + totalDrivingMs > 0
      ? Math.round((totalStandingMs / (totalStandingMs + totalDrivingMs)) * 100)
      : 0;

  return {
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    distanceSeries: roundSeries(distanceByBucket),
    totalFuelL: Math.round(totalFuelL * 10) / 10,
    fuelSeries: roundSeries(fuelByBucket),
    utilisationSeries: buckets.map((bucket, index) => ({
      label: bucket.label,
      value: Math.round((activeByBucket[index].size / assetCount) * 100)
    })),
    topDrivers: rankByValue(
      [...driverAgg.entries()].map(([name, agg]) => ({
        name,
        sub: `${agg.trips} trip${agg.trips === 1 ? "" : "s"}`,
        value: agg.distanceKm
      })),
      5
    ),
    topRoutes: rankByValue(
      [...routeAgg.entries()].map(([name, agg]) => ({
        name,
        sub: `${agg.trips} trip${agg.trips === 1 ? "" : "s"}`,
        value: agg.distanceKm
      })),
      4
    ),
    standingMs: totalStandingMs,
    drivingMs: totalDrivingMs,
    standingPct,
    standingSeries: roundSeries(standingByBucket),
    topStandingAssets: rankByValue(
      [...standingByAsset.entries()].map(([name, agg]) => ({
        name,
        sub: `${agg.site || "—"} · ${agg.trips} trip${agg.trips === 1 ? "" : "s"}`,
        value: agg.standingMs / 3_600_000
      })),
      5
    ),
    maintenance: maintenanceFromAssets(assets),
    tripsCompleted,
    tripsSeries: roundSeries(tripsByBucket, 0),
    idleMs: 0,
    failedDevices
  };
}
