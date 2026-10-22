import { buildUrl, fetchJson, getApiKey, getTenantId } from "./api";
import { readHomeSiteScope } from "./homeSiteScope";

export type HomeDashboardSection = "live" | "metrics" | "performance" | "operations" | "activity";

export type HomeStatusCounts = { moving: number; stopped: number; idle: number; offline: number };

export type HomeDayPoint = { label: string; value: number };

export type HomeRankRow = { name: string; sub: string; value: number; ratio: number };

export type HomeLiveSection = {
  totalVehicles: number;
  statusCounts: HomeStatusCounts;
  /** The live feed did not answer in time; counts use each asset's last stored fix. */
  liveStale?: boolean;
};

/** Where the Fuel Usage figure came from. The comparative report wins over trip litres. */
export type HomeFuelSource = "trips" | "comparative";

export type HomeMetricsSection = {
  rangeLabel: string;
  totalDistanceKm: number;
  totalFuelL: number;
  avgEfficiency: number;
  tripsCompleted: number;
  drivingMs: number;
  standingMs: number;
  standingPct: number;
  idleMs: number;
  geofenceEvents: number;
  alerts: number;
};

export type HomePerformanceSection = {
  distanceSeries: HomeDayPoint[];
  fuelSeries: HomeDayPoint[];
  utilisationSeries: HomeDayPoint[];
  topDrivers: HomeRankRow[];
  topRoutes: HomeRankRow[];
};

export type HomeOperationsSection = {
  standingMs: number;
  standingPct: number;
  drivingMs: number;
  standingSeries: HomeDayPoint[];
  topStandingAssets: HomeRankRow[];
  maintenance: HomeRankRow[];
  statusCounts: HomeStatusCounts;
  totalVehicles: number;
};

export type HomeActivitySection = {
  geofenceEvents: number;
  alerts: number;
  tripsCompleted: number;
  idleMs: number;
  geofenceSeries: HomeDayPoint[];
  alertsSeries: HomeDayPoint[];
  tripsSeries: HomeDayPoint[];
  utilisationSeries: HomeDayPoint[];
};

const HOME_DATE_KEYS = {
  preset: "vivi.home.dashboard.datePreset",
  from: "vivi.home.dashboard.fromDate",
  to: "vivi.home.dashboard.toDate"
} as const;

const localIsoDay = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** Calendar range (YYYY-MM-DD, local) for a Home date preset, computed for today. */
export const homeRangeFromPreset = (preset: string, now = new Date()): { fromDate: string; toDate: string } => {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);

  switch (preset) {
    case "Today":
      break;
    case "Yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "This Week": {
      const day = end.getDay();
      start.setDate(end.getDate() - (day === 0 ? 6 : day - 1));
      break;
    }
    case "This Month":
      start.setDate(1);
      break;
    case "Last 30 Days":
      start.setDate(end.getDate() - 29);
      break;
    case "Last 7 Days":
    default:
      start.setDate(end.getDate() - 6);
      break;
  }

  return { fromDate: localIsoDay(start), toDate: localIsoDay(end) };
};

export const readPersistedHomeDates = () => {
  if (typeof window === "undefined") {
    return { fromDate: "", toDate: "", datePreset: "Last 7 Days" };
  }
  const fromDate = String(window.localStorage.getItem(HOME_DATE_KEYS.from) ?? "").trim();
  const toDate = String(window.localStorage.getItem(HOME_DATE_KEYS.to) ?? "").trim();
  const datePreset = String(window.localStorage.getItem(HOME_DATE_KEYS.preset) ?? "Last 7 Days").trim() || "Last 7 Days";
  return { fromDate, toDate, datePreset };
};

export const persistHomeDates = (datePreset: string, fromDate: string, toDate: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HOME_DATE_KEYS.preset, datePreset);
  window.localStorage.setItem(HOME_DATE_KEYS.from, fromDate);
  window.localStorage.setItem(HOME_DATE_KEYS.to, toDate);
};

// v3: standing time, fuel and site-time-zone fixes changed the numbers; do not repaint v2 snapshots.
const HOME_MODEL_CACHE_KEY = "vivi.home.dashboard.model.v3";
const HOME_MODEL_CACHE_LEGACY_KEY = "vivi.home.dashboard.model.v1";
const HOME_MODEL_CACHE_MAX = 6;
const HOME_MODEL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type HomeModelCacheFile = {
  entries?: Record<string, { savedAt?: number; model?: unknown }>;
};

export const homeDashboardModelCacheKey = (params: {
  fromDate: string;
  toDate: string;
  scopedSites?: string[];
}) => {
  const tenantId = String(getTenantId() ?? "").trim();
  const sites = (params.scopedSites ?? []).map((site) => String(site ?? "").trim()).filter(Boolean).sort();
  return `${tenantId}|${sites.join(",")}|${params.fromDate}|${params.toDate}`;
};

const readHomeModelCacheFile = (): HomeModelCacheFile => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(HOME_MODEL_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HomeModelCacheFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const readLegacySessionModel = <T>(key: string): T | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(HOME_MODEL_CACHE_LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: string; model?: T };
    if (parsed?.key !== key || !parsed.model || typeof parsed.model !== "object") return null;
    return parsed.model;
  } catch {
    return null;
  }
};

export const readCachedHomeDashboardModel = <T>(params: {
  fromDate: string;
  toDate: string;
  scopedSites?: string[];
}): T | null => {
  if (typeof window === "undefined") return null;
  const key = homeDashboardModelCacheKey(params);
  try {
    const entry = readHomeModelCacheFile().entries?.[key];
    const savedAt = Number(entry?.savedAt ?? 0);
    if (
      entry?.model &&
      typeof entry.model === "object" &&
      Number.isFinite(savedAt) &&
      Date.now() - savedAt < HOME_MODEL_CACHE_MAX_AGE_MS
    ) {
      return entry.model as T;
    }
  } catch {
    // fall through to the previous session slot
  }
  return readLegacySessionModel<T>(key);
};

export const writeCachedHomeDashboardModel = (
  params: { fromDate: string; toDate: string; scopedSites?: string[] },
  model: unknown
) => {
  if (typeof window === "undefined" || !model || typeof model !== "object") return;
  try {
    const key = homeDashboardModelCacheKey(params);
    const previous = readCachedHomeDashboardModel<Record<string, unknown>>(params) ?? {};
    const file = readHomeModelCacheFile();
    const entries = { ...(file.entries ?? {}) };
    entries[key] = {
      savedAt: Date.now(),
      model: { ...previous, ...(model as Record<string, unknown>) }
    };
    const newest = Object.entries(entries)
      .sort((a, b) => Number(b[1]?.savedAt ?? 0) - Number(a[1]?.savedAt ?? 0))
      .slice(0, HOME_MODEL_CACHE_MAX);
    window.localStorage.setItem(
      HOME_MODEL_CACHE_KEY,
      JSON.stringify({ entries: Object.fromEntries(newest) })
    );
  } catch {
    // ignore quota
  }
};

const homeDashboardHeaders = (sites: string[]) => {
  const apiKey = getApiKey();
  const tenantId = getTenantId();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
    ...(tenantId ? { "x-tenant-id": tenantId } : {})
  };
  if (sites.length) headers["x-home-sites"] = sites.join("|");
  return headers;
};

export async function fetchHomeDashboardSection<T>(
  section: HomeDashboardSection,
  params: { fromDate: string; toDate: string; scopedSites?: string[] }
): Promise<T | null> {
  const sites = params.scopedSites ?? readHomeSiteScope().scopedSites;
  if (!sites.length) return null;

  const qs = new URLSearchParams({
    from: params.fromDate,
    to: params.toDate,
    sites: sites.join("|")
  });

  try {
    const result = await fetchJson<{ ok?: boolean; section?: T }>(
      `/api/home/dashboard/${section}?${qs.toString()}`,
      { headers: homeDashboardHeaders(sites) }
    );
    return (result as any)?.data ?? (result as any)?.section ?? null;
  } catch {
    return null;
  }
}

/**
 * The range Home will show: a custom range as saved, otherwise the preset
 * recomputed for today (a saved "Today" must not stay on the day it was saved).
 */
export const readHomeDashboardDateQuery = (): { fromDate: string; toDate: string } => {
  const persisted = readPersistedHomeDates();
  if (persisted.datePreset === "Custom" && persisted.fromDate && persisted.toDate) {
    return { fromDate: persisted.fromDate, toDate: persisted.toDate };
  }
  return homeRangeFromPreset(persisted.datePreset);
};

/** Pre-warm cache when site context is known (e.g. after org ribbon change). */
export async function preloadHomeDashboardForActiveSite() {
  const scope = readHomeSiteScope();
  if (!scope.ready) return;
  const { fromDate, toDate } = readHomeDashboardDateQuery();
  const query = { fromDate, toDate, scopedSites: scope.scopedSites };
  // The page computes its widgets in the browser; warming the server-side model
  // only added Traccar load that competed with these requests.
  const [{ fetchHomeLiveFromTracking }, { fetchHomeTripMetrics }, { fetchHomeAlertMetrics }] = await Promise.all([
    import("./homeLiveSnapshot"),
    import("./homeRangeMetrics"),
    import("./homeAlertMetrics")
  ]);
  const [live, trips, alertMetrics] = await Promise.all([
    fetchHomeLiveFromTracking(),
    fetchHomeTripMetrics(fromDate, toDate),
    fetchHomeAlertMetrics(fromDate, toDate)
  ]);
  // Keep a comparative fuel figure the page already saved; trip litres are only a first pass.
  const cached = readCachedHomeDashboardModel<{ fuelSource?: HomeFuelSource; totalFuelL?: number }>(query);
  const keepFuel = cached?.fuelSource === "comparative";
  const { totalFuelL: tripFuelL, fuelSeries, idleMs, ...tripRest } = trips;
  const totalDistanceKm = trips.totalDistanceKm;
  const totalFuelL = keepFuel ? Number(cached?.totalFuelL ?? 0) : tripFuelL;
  writeCachedHomeDashboardModel(query, {
    ...tripRest,
    ...(keepFuel ? {} : { totalFuelL: tripFuelL, fuelSeries, idleMs, fuelSource: "trips" as HomeFuelSource }),
    totalVehicles: live.totalVehicles,
    statusCounts: live.statusCounts,
    avgEfficiency: totalFuelL > 0 ? totalDistanceKm / totalFuelL : 0,
    alertsConfigured: alertMetrics.alertsConfigured,
    geofenceEvents: alertMetrics.geofenceAlerts,
    geofenceSeries: alertMetrics.geofenceSeries,
    alerts: alertMetrics.totalAlerts,
    alertsSeries: alertMetrics.alertsSeries
  });
}

/** Ask the backend to pre-warm the shared metrics cache (non-blocking). */
export async function warmHomeDashboardCache(params: { fromDate: string; toDate: string; scopedSites?: string[] }) {
  const sites = params.scopedSites ?? readHomeSiteScope().scopedSites;
  if (!sites.length) return;

  const qs = new URLSearchParams({
    from: params.fromDate,
    to: params.toDate,
    sites: sites.join("|")
  });

  try {
    await fetch(buildUrl(`/api/home/dashboard/warm?${qs.toString()}`), {
      method: "POST",
      headers: homeDashboardHeaders(sites)
    });
  } catch {
    // ignore background warm failures
  }
}
