import { getAssetsFromApi, getTraccarDevices, getTraccarEvents, getTraccarTrips, type TraccarTrip } from "./api";
import { assetSiteMatchesHierarchySite, matchesStoredSiteSelection, readStoredSelectionScope } from "./selectionScope";

export type DashboardDataRow = Record<string, unknown>;

export type DashboardDeviceTarget = {
  registration: string;
  site: string;
  deviceId: string;
};

export const rangeToIsoBounds = (fromDate: string, toDate: string) => {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T23:59:59.999`);
  return {
    from: Number.isNaN(from.getTime()) ? new Date().toISOString() : from.toISOString(),
    to: Number.isNaN(to.getTime()) ? new Date().toISOString() : to.toISOString()
  };
};

const normalizeLabel = (value: unknown) => String(value ?? "").trim();
const normalizeKey = (value: unknown) => normalizeLabel(value).toLowerCase();

const localIsoDay = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toImei = (value: unknown): string => {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.length < 14 || digits.length > 17) return "";
  return digits;
};

export type TimelineBucket = {
  key: string;
  label: string;
  color: string;
  tripCount: number;
  distance: number;
  duration: number;
  activeAssets: Set<string>;
  siteCounts: Map<string, number>;
  match: (date: Date) => boolean;
};

const bucketColors = ["#6b7280", "#2563eb", "#3b82f6", "#38bdf8", "#60a5fa", "#818cf8", "#22d3ee", "#0ea5e9"];

export const buildTimelineBuckets = (fromDate: string, toDate: string): TimelineBucket[] => {
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

  if (dayCount <= 1) {
    return Array.from({ length: 24 }, (_, hour) => ({
      key: `hour-${hour}`,
      label: `${String(hour).padStart(2, "0")}:00`,
      color: hour >= 17 || hour < 5 ? "#1d4ed8" : "#60a5fa",
      tripCount: 0,
      distance: 0,
      duration: 0,
      activeAssets: new Set<string>(),
      siteCounts: new Map<string, number>(),
      match: (date: Date) => localIsoDay(date) === fromDate && date.getHours() === hour
    }));
  }

  if (dayCount <= 31) {
    const buckets: TimelineBucket[] = [];
    const cursor = new Date(start);
    let index = 0;
    while (cursor.getTime() <= end.getTime() && buckets.length < 45) {
      const key = localIsoDay(cursor);
      const label = dayCount <= 7
        ? cursor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })
        : cursor.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      buckets.push({
        key,
        label,
        color: bucketColors[index % bucketColors.length],
        tripCount: 0,
        distance: 0,
        duration: 0,
        activeAssets: new Set<string>(),
        siteCounts: new Map<string, number>(),
        match: (date: Date) => localIsoDay(date) === key
      });
      cursor.setDate(cursor.getDate() + 1);
      index += 1;
    }
    return buckets;
  }

  const buckets: TimelineBucket[] = [];
  const cursor = new Date(start);
  let weekIndex = 0;
  while (cursor.getTime() <= end.getTime() && buckets.length < 20) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd.getTime() > end.getTime()) weekEnd.setTime(end.getTime());
    const key = `week-${localIsoDay(weekStart)}`;
    const label = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${weekEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
    const startMs = weekStart.getTime();
    const endMs = weekEnd.getTime() + 86400000 - 1;
    buckets.push({
      key,
      label,
      color: bucketColors[weekIndex % bucketColors.length],
      tripCount: 0,
      distance: 0,
      duration: 0,
      activeAssets: new Set<string>(),
      siteCounts: new Map<string, number>(),
      match: (date: Date) => {
        const ms = date.getTime();
        return ms >= startMs && ms <= endMs;
      }
    });
    cursor.setDate(cursor.getDate() + 7);
    weekIndex += 1;
  }
  return buckets;
};

const siteMatchesScope = (
  site: string,
  registration: string,
  params: {
    siteFilter: string;
    assetFilter: string;
    scopedSites: string[];
    assetsBySite: Record<string, string[]>;
  }
) => {
  if (params.assetFilter !== "All assets" && registration !== params.assetFilter) {
    return false;
  }

  const allowedSites = params.scopedSites.map((item) => String(item ?? "").trim()).filter((item) => item && item !== "All sites");
  if (allowedSites.length > 0) {
    return allowedSites.some((scopedSite) => assetSiteMatchesHierarchySite(site, scopedSite));
  }
  if (params.siteFilter !== "All sites") {
    return assetSiteMatchesHierarchySite(site, params.siteFilter);
  }
  return matchesStoredSiteSelection(site, readStoredSelectionScope());
};

const mapTripToDashboardRow = (trip: TraccarTrip, target: DashboardDeviceTarget): DashboardDataRow => {
  const startMs = Date.parse(String(trip.startTime ?? ""));
  const endMs = Date.parse(String(trip.endTime ?? trip.startTime ?? ""));
  const durationMs = Number(trip.duration) > 0
    ? Number(trip.duration)
    : Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      ? endMs - startMs
      : 0;
  const distanceMeters = Number(trip.distance ?? 0);

  return {
    startTime: trip.startTime,
    endTime: trip.endTime,
    tripStart: trip.startTime,
    tripEnd: trip.endTime,
    distance: distanceMeters,
    distanceKm: distanceMeters,
    duration: durationMs,
    durationMs,
    durationMin: durationMs / 60000,
    maxSpeed: trip.maxSpeed,
    spentFuel: trip.spentFuel,
    site: target.site,
    siteName: target.site,
    registration: target.registration,
    assetDescription: target.registration,
    asset: target.registration,
    deviceName: trip.deviceName,
    tripType: "trip"
  };
};

export const resolveDashboardDeviceTargets = async (params: {
  siteFilter: string;
  assetFilter: string;
  scopedSites: string[];
  assetsBySite?: Record<string, string[]>;
}): Promise<DashboardDeviceTarget[]> => {
  const assets = await getAssetsFromApi<Record<string, unknown>>();
  const assetsBySite = params.assetsBySite ?? {};
  const filtered = (Array.isArray(assets) ? assets : []).filter((asset) => {
    const site = normalizeLabel(asset?.site);
    const registration = normalizeLabel(asset?.registration ?? asset?.assetDescription ?? asset?.name);
    if (!registration) return false;
    return siteMatchesScope(site, registration, {
      siteFilter: params.siteFilter,
      assetFilter: params.assetFilter,
      scopedSites: params.scopedSites,
      assetsBySite
    });
  });

  const traccarDevices = await getTraccarDevices();
  const deviceByUniqueId = new Map<string, string>();
  const deviceByName = new Map<string, string>();
  for (const device of Array.isArray(traccarDevices) ? traccarDevices : []) {
    const id = String(device?.id ?? "").trim();
    if (!id) continue;
    const uniqueId = normalizeKey(device?.uniqueId);
    const name = normalizeKey(device?.name);
    if (uniqueId) deviceByUniqueId.set(uniqueId, id);
    if (name) deviceByName.set(name, id);
  }

  const resolved = await Promise.all(
    filtered.map(async (asset) => {
      const registration = normalizeLabel(asset?.registration ?? asset?.assetDescription ?? asset?.name);
      const site = normalizeLabel(asset?.site) || "Unknown site";
      const directId = Number(asset?.traccarDeviceId ?? asset?.deviceId);
      if (Number.isFinite(directId) && directId > 0) {
        return { registration, site, deviceId: String(directId) };
      }

      const imei = toImei(asset?.imei ?? asset?.uniqueId);
      if (imei) {
        const cached = deviceByUniqueId.get(normalizeKey(imei));
        if (cached) return { registration, site, deviceId: cached };
        const devices = await getTraccarDevices({ uniqueId: imei });
        const deviceId = Number(devices[0]?.id);
        if (Number.isFinite(deviceId) && deviceId > 0) {
          return { registration, site, deviceId: String(deviceId) };
        }
      }

      const byName = deviceByName.get(normalizeKey(registration));
      if (byName) return { registration, site, deviceId: byName };

      return null;
    })
  );

  const unique = new Map<string, DashboardDeviceTarget>();
  for (const item of resolved) {
    if (!item) continue;
    unique.set(item.deviceId, item);
  }
  return [...unique.values()];
};

export async function loadDashboardTripsFromTraccar(params: {
  fromDate: string;
  toDate: string;
  siteFilter: string;
  assetFilter: string;
  scopedSites: string[];
  assetsBySite?: Record<string, string[]>;
}): Promise<DashboardDataRow[]> {
  const { from, to } = rangeToIsoBounds(params.fromDate, params.toDate);
  const targets = await resolveDashboardDeviceTargets(params);
  if (targets.length === 0) return [];

  const tripBatches = await Promise.all(
    targets.map((target) => getTraccarTrips({ from, to, deviceId: target.deviceId }))
  );

  return tripBatches.flatMap((trips, index) =>
    trips.map((trip) => mapTripToDashboardRow(trip, targets[index]))
  );
}

export async function loadDashboardAlertsFromTraccar(params: {
  fromDate: string;
  toDate: string;
  siteFilter: string;
  assetFilter: string;
  scopedSites: string[];
  assetsBySite?: Record<string, string[]>;
}): Promise<DashboardDataRow[]> {
  const { from, to } = rangeToIsoBounds(params.fromDate, params.toDate);
  const targets = await resolveDashboardDeviceTargets(params);
  if (targets.length === 0) return [];

  const eventBatches = await Promise.all(
    targets.map((target) => getTraccarEvents({ from, to, deviceId: target.deviceId }))
  );

  return eventBatches.flatMap((events, index) => {
    const target = targets[index];
    return events.map((event) => ({
      type: event.type,
      eventType: event.type,
      timestamp: event.eventTime,
      createdAt: event.eventTime,
      site: target.site,
      siteName: target.site,
      registration: target.registration,
      assetDescription: target.registration,
      asset: target.registration,
      violations: 1
    }));
  });
}
