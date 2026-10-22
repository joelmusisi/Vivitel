import type { HomeDayPoint } from "./homeDashboardApi";
import { getTenantId, getTraccarDevices, getTraccarEvents } from "./api";
import { mapPool } from "./homeRangeMetrics";
import { loadScopedDeviceContext } from "./homeScopedDevices";
import { buildHomeTimeline, homeRangeBounds, homeTimelineBucketKey } from "./homeTimeline";
import { resolveHomeTimeZone } from "./homeTimeZone";
import { readHomeSiteScope } from "./homeSiteScope";
import { severityForTraccarType, traccarEventToLabel } from "./streamLive";
import { loadBoundNotificationOptionsForSite } from "./notificationLibraryStore";
import { loadSiteLocationAlerts } from "./locationAlertNotifications";
import { readActiveSiteName } from "./tenantContext";

const GEOFENCE_EVENT_TYPES = new Set(["geofenceenter", "geofenceexit"]);

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

/**
 * Detect a geofence enter/exit event. We match the canonical Traccar types but
 * also fall back to type/label substrings so custom or computed geofence event
 * types are still summed — i.e. anything that appears as a geofence in the
 * recent feed is also counted in the dashboard total.
 */
const isGeofenceEvent = (type: string, label: string): boolean => {
  if (GEOFENCE_EVENT_TYPES.has(type)) return true;
  const haystack = `${type} ${label}`;
  if (!haystack.includes("geofence") && !haystack.includes("geo-fence") && !haystack.includes("geo fence")) {
    return false;
  }
  return (
    haystack.includes("enter") ||
    haystack.includes("exit") ||
    haystack.includes("entry") ||
    haystack.includes("entered") ||
    haystack.includes("exited") ||
    haystack.includes("inside") ||
    haystack.includes("outside") ||
    haystack.includes("in/out")
  );
};

const localIsoDay = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** The alert types/labels configured for the active site (bindings + location alerts). */
async function loadConfiguredAlerts(): Promise<{
  configured: boolean;
  labels: Set<string>;
  types: Set<string>;
  geofenceConfigured: boolean;
}> {
  const site = readActiveSiteName();
  const [boundOptions, locationAlerts] = await Promise.all([
    loadBoundNotificationOptionsForSite(site).catch(() => []),
    loadSiteLocationAlerts(site).catch(() => [])
  ]);

  const labels = new Set<string>();
  const types = new Set<string>();
  for (const option of boundOptions) {
    const label = norm(option.description);
    if (label) labels.add(label);
    const type = norm(option.type);
    if (type && type !== "default") types.add(type);
  }

  const geofenceConfigured =
    locationAlerts.length > 0 ||
    [...labels].some((label) => label.includes("geofence") || label.includes("location")) ||
    [...types].some((type) => type.includes("geofence"));

  const configured = boundOptions.length > 0 || locationAlerts.length > 0;
  return { configured, labels, types, geofenceConfigured };
}

export type HomeRecentAlert = {
  id: string;
  label: string;
  asset: string;
  atMs: number;
  severity: "info" | "warning" | "critical";
};

export type HomeAlertMetrics = {
  /** True when at least one events request failed; counts are incomplete. */
  partial: boolean;
  alertsConfigured: boolean;
  totalAlerts: number;
  alertsSeries: HomeDayPoint[];
  geofenceAlerts: number;
  geofenceSeries: HomeDayPoint[];
  recent: HomeRecentAlert[];
};

const buildDeviceLabelMap = async (): Promise<Map<number, string>> => {
  const devices = await getTraccarDevices().catch(() => []);
  const map = new Map<number, string>();
  for (const device of Array.isArray(devices) ? devices : []) {
    const id = Number((device as { id?: unknown })?.id);
    if (!Number.isFinite(id)) continue;
    const name = String(
      (device as { name?: unknown })?.name ??
        (device as { uniqueId?: unknown })?.uniqueId ??
        id
    ).trim();
    map.set(id, name || `Device ${id}`);
  }
  return map;
};

const alertMetricsInflight = new Map<string, Promise<HomeAlertMetrics>>();

/**
 * Dashboard alert counts for the scoped site + date range.
 * - Geofence Alerts: geofence enter/exit events.
 * - Alerts: events matching alerts configured for the site (only counted when alerts are set).
 */
export async function fetchHomeAlertMetrics(fromDate: string, toDate: string): Promise<HomeAlertMetrics> {
  const key = `${getTenantId() || "_"}|${readHomeSiteScope().scopedSites.join("|")}|${fromDate}|${toDate}`;
  const existing = alertMetricsInflight.get(key);
  if (existing) return existing;
  const promise = fetchHomeAlertMetricsUncached(fromDate, toDate).finally(() => {
    alertMetricsInflight.delete(key);
  });
  alertMetricsInflight.set(key, promise);
  return promise;
}

const EVENTS_CHUNK = 60;

/** Events for many devices in URL-safe chunks; reports whether any chunk failed. */
async function loadEventsChunked(deviceIds: number[], from: string, to: string) {
  const chunks: number[][] = [];
  for (let index = 0; index < deviceIds.length; index += EVENTS_CHUNK) {
    chunks.push(deviceIds.slice(index, index + EVENTS_CHUNK));
  }
  let partial = false;
  const lists = await mapPool(chunks, 3, async (ids) => {
    try {
      return await getTraccarEvents({ deviceIds: ids, from, to, strict: true });
    } catch {
      partial = true;
      return [];
    }
  });
  return { events: lists.flat(), partial };
}

async function fetchHomeAlertMetricsUncached(fromDate: string, toDate: string): Promise<HomeAlertMetrics> {
  // Same buckets (day / week / month) and site time zone as the trip charts.
  const geofenceTimeline = buildHomeTimeline(fromDate, toDate);
  const alertsTimeline = buildHomeTimeline(fromDate, toDate);

  const [{ configured, labels, types }, { deviceIds: scopedDeviceIds }, timeZone] = await Promise.all([
    loadConfiguredAlerts(),
    loadScopedDeviceContext(),
    resolveHomeTimeZone()
  ]);
  const { from, to } = homeRangeBounds(fromDate, toDate, timeZone);

  const deviceIds = scopedDeviceIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (deviceIds.length === 0) {
    return {
      partial: false,
      alertsConfigured: configured,
      totalAlerts: 0,
      alertsSeries: alertsTimeline.buckets,
      geofenceAlerts: 0,
      geofenceSeries: geofenceTimeline.buckets,
      recent: []
    };
  }

  const [{ events, partial }, deviceLabels] = await Promise.all([
    loadEventsChunked(deviceIds, from, to),
    buildDeviceLabelMap()
  ]);

  let totalAlerts = 0;
  let geofenceAlerts = 0;
  const recent: HomeRecentAlert[] = [];
  for (const event of events) {
    const type = norm(event.type);
    const label = norm(traccarEventToLabel(event.type));
    const ms = Date.parse(String(event.eventTime ?? ""));
    const bucketKey = Number.isFinite(ms) ? homeTimelineBucketKey(new Date(ms), geofenceTimeline.mode, timeZone) : "";
    const isGeofence = isGeofenceEvent(type, label);
    const isConfiguredAlert = configured && (types.has(type) || labels.has(label));

    if (isGeofence) {
      geofenceAlerts += 1;
      const idx = geofenceTimeline.bucketIndexByKey.get(bucketKey);
      if (idx != null) geofenceTimeline.buckets[idx].value += 1;
    }

    // Alerts tile only counts events that match alerts configured for the site.
    if (isConfiguredAlert) {
      totalAlerts += 1;
      const idx = alertsTimeline.bucketIndexByKey.get(bucketKey);
      if (idx != null) alertsTimeline.buckets[idx].value += 1;
    }

    if (isGeofence || isConfiguredAlert) {
      const deviceId = Number((event as { deviceId?: unknown }).deviceId);
      recent.push({
        id: `${deviceId}-${String((event as { id?: unknown }).id ?? recent.length)}`,
        label: traccarEventToLabel(event.type),
        asset: deviceLabels.get(deviceId) ?? `Device ${deviceId}`,
        atMs: Number.isFinite(ms) ? ms : Date.now(),
        severity: severityForTraccarType(event.type)
      });
    }
  }

  recent.sort((a, b) => b.atMs - a.atMs);

  return {
    partial,
    alertsConfigured: configured,
    totalAlerts,
    alertsSeries: alertsTimeline.buckets,
    geofenceAlerts,
    geofenceSeries: geofenceTimeline.buckets,
    recent: recent.slice(0, 8)
  };
}

export type AlertDayGroup = {
  dayKey: string;
  dayLabel: string;
  alerts: HomeRecentAlert[];
};

/** All configured-site alert events for the last N days (not live streams). */
export async function fetchConfiguredAlertFeed(days = 7): Promise<{
  configured: boolean;
  groups: AlertDayGroup[];
}> {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - (days - 1) * 86400000);
  const iso = (d: Date) => localIsoDay(d);
  const [{ configured }, items] = await Promise.all([
    loadConfiguredAlerts(),
    expandAlertFeed(iso(fromDate), iso(toDate))
  ]);

  const byDay = new Map<string, HomeRecentAlert[]>();
  for (const alert of items) {
    const dayKey = localIsoDay(new Date(alert.atMs));
    const list = byDay.get(dayKey) ?? [];
    list.push(alert);
    byDay.set(dayKey, list);
  }

  const groups = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, alerts]) => ({
      dayKey,
      dayLabel: new Date(`${dayKey}T12:00:00`).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short"
      }),
      alerts: alerts.sort((a, b) => b.atMs - a.atMs)
    }));

  return { configured, groups };
}

async function expandAlertFeed(fromDate: string, toDate: string): Promise<HomeRecentAlert[]> {
  const from = new Date(`${fromDate}T00:00:00`).toISOString();
  const to = new Date(`${toDate}T23:59:59.999`).toISOString();
  const [{ configured, labels, types }, { deviceIds: scopedDeviceIds }] = await Promise.all([
    loadConfiguredAlerts(),
    loadScopedDeviceContext()
  ]);
  const deviceIds = scopedDeviceIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (deviceIds.length === 0) return [];

  const [events, deviceLabels] = await Promise.all([
    getTraccarEvents({ deviceIds, from, to }).catch(() => []),
    buildDeviceLabelMap()
  ]);

  const items: HomeRecentAlert[] = [];
  for (const event of events) {
    const type = norm(event.type);
    const label = norm(traccarEventToLabel(event.type));
    const ms = Date.parse(String(event.eventTime ?? ""));
    const isGeofence = isGeofenceEvent(type, label);
    const isConfiguredAlert = configured && (types.has(type) || labels.has(label));
    if (!isGeofence && !isConfiguredAlert) continue;
    const deviceId = Number((event as { deviceId?: unknown }).deviceId);
    items.push({
      id: `${deviceId}-${String((event as { id?: unknown }).id ?? items.length)}`,
      label: traccarEventToLabel(event.type),
      asset: deviceLabels.get(deviceId) ?? `Device ${deviceId}`,
      atMs: Number.isFinite(ms) ? ms : Date.now(),
      severity: severityForTraccarType(event.type)
    });
  }
  items.sort((a, b) => b.atMs - a.atMs);
  return items.slice(0, 400);
}
