import { isLocationAlertType, resolveUserAlertDeliveryFromPayload, type UserAlertDelivery } from "./notificationAlertDelivery";
import {
  collectMonitoredTypesForUser,
  eventTypeMatchesStreamMonitor,
  readInfoHubStreamMonitor
} from "./infoHubStreamMonitor";
import {
  AlertEmailRetryableError,
  alertEmailEventKey,
  createRecipientEmailResolver,
  sendAlertEmailOnce
} from "./alertEmailDelivery";
import { buildAlertMapAttachment } from "./alertMapImage";
import {
  buildAlertMapImageUrl,
  buildDeviceAlertEmailHtml,
  buildDeviceAlertEmailSubject,
  buildDeviceAlertEmailText,
  reverseGeocodeLabel,
  resolveAssetOrganisation,
  resolveAssetRegistration,
  formatCompassHeading,
  formatNotificationDateTime,
  loadSiteTimeZoneSettings,
  resolveNotificationValue,
  resolveSystemAssetId,
  type DeviceAlertEmailEvent
} from "./deviceAlertEmail";
import { createRegionScopedKv, isTraccarStorageTenant } from "./regionStorage";
import { DEFAULT_REGION, isRegionId, type RegionId } from "./regionServers";
import { siteScopesMatch } from "./scopeIsolation";
import { buildScopedKvKey } from "./scopeIsolation";
import { bindingCoversSiteEvent, libraryNotificationIsAvailable, siteMonitorsNotification } from "./siteNotificationScope";

export type ViviUserAlertActionDecision = "yes" | "no";

export type ViviUserAlertAction = {
  decision: ViviUserAlertActionDecision;
  note?: string;
  actionedAt: string;
  actionedByUserId: string;
  actionedByName: string;
  actionedByEmail: string;
};

export type ViviUserAlertRecord = {
  id: string;
  tenantId: string;
  userId: string;
  eventLabel: string;
  assetLabel: string;
  site?: string;
  locationName?: string;
  driver?: string;
  /** Ground speed in kilometres per hour at event time. */
  speedKph?: number;
  /** Odometer / distance in kilometres when available. */
  distanceKm?: number;
  latitude?: number;
  longitude?: number;
  /** Course in degrees at event time. */
  headingDeg?: number;
  positionId?: number;
  message: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
  traccarEventId?: number;
  traccarDeviceId?: number;
  channels: { email?: boolean; inApp?: boolean; sms?: boolean };
  read?: boolean;
  action?: ViviUserAlertAction;
};

export type UserAlertDispatchEnv = {
  ViviTEL: KVNamespace;
  VIVI_D1: D1Database;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_FROM_NAME?: string;
  APP_BASE_URL?: string;
  TRACCAR_BASE_URL?: string;
  TRACCAR_TOKEN?: string;
  TRACCAR_USERNAME?: string;
  TRACCAR_PASSWORD?: string;
  GOOGLE_MAPS_API_KEY?: string;
};

type TraccarFetchResult = { ok: boolean; status: number; body: unknown };

type AlertRecipient = {
  userId: string;
  name: string;
  email: string;
  phone?: string;
};

const CRITICAL_TYPES = new Set(["alarm", "fuelDrop", "deviceOverspeed"]);
const WARNING_TYPES = new Set(["geofenceEnter", "geofenceExit", "fuelIncrease", "deviceMoving", "maintenance"]);

const TRACCAR_TYPE_TO_LABEL: Record<string, string> = {
  deviceOnline: "Status Online",
  deviceOffline: "Status Offline",
  deviceUnknown: "Device Inactive",
  deviceMoving: "Device Moving",
  ignitionOn: "Ignition On",
  ignitionOff: "Ignition Off",
  deviceOverspeed: "Speed Limit Exceeded",
  fuelDrop: "Fuel drop",
  fuelIncrease: "Fuel increase",
  fuelSiphoning: "Fuel Siphoning",
  geofenceEnter: "Geofence Entered",
  geofenceExit: "Geofence Exited",
  alarm: "Alarm",
  media: "Media",
  driverChanged: "Driver Changed",
  maintenance: "Maintenance Required"
};

function userAlertsKvKey(tenantId: string, userId: string) {
  return `vivi:user-alerts:${tenantId}:${userId}`;
}

export function alertDedupeKey(tenantId: string, traccarEventId: number) {
  return `vivi:alert-dedupe:${tenantId}:${traccarEventId}`;
}

function pollStateKey(tenantId: string) {
  return `vivi:traccar-alert-poll:${tenantId}`;
}

function severityForType(type: string): ViviUserAlertRecord["severity"] {
  const key = String(type ?? "").trim();
  if (CRITICAL_TYPES.has(key)) return "critical";
  if (WARNING_TYPES.has(key)) return "warning";
  return "info";
}

function eventLabel(type: string, description?: string) {
  const desc = String(description ?? "").trim();
  if (desc) return desc;
  return TRACCAR_TYPE_TO_LABEL[type] ?? type;
}

async function traccarFetch(env: UserAlertDispatchEnv, pathnameWithQuery: string): Promise<TraccarFetchResult> {
  const base = String(env.TRACCAR_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return { ok: false, status: 0, body: null };
  const url = `${base}${pathnameWithQuery.startsWith("/") ? "" : "/"}${pathnameWithQuery}`;
  const headers: Record<string, string> = { accept: "application/json" };
  const token = String(env.TRACCAR_TOKEN ?? "").trim();
  const user = String(env.TRACCAR_USERNAME ?? "").trim();
  const pass = String(env.TRACCAR_PASSWORD ?? "").trim();
  if (token) headers.authorization = `Bearer ${token}`;
  else if (user && pass) headers.authorization = `Basic ${btoa(`${user}:${pass}`)}`;
  const response = await fetch(url, { headers });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

async function listDistinctTenantIds(env: UserAlertDispatchEnv): Promise<string[]> {
  const rows = await env.VIVI_D1.prepare(`SELECT DISTINCT tenant_id AS tenantId FROM assets`).all<{ tenantId?: string }>();
  const unique = new Set<string>();
  for (const row of rows.results ?? []) {
    const id = String((row as any)?.tenantId ?? "").trim();
    if (id) unique.add(id);
  }
  return Array.from(unique);
}

async function listAlertRecipients(env: UserAlertDispatchEnv, tenantId: string, assetSite: string): Promise<AlertRecipient[]> {
  await env.VIVI_D1.prepare(
    `CREATE TABLE IF NOT EXISTS rbac_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
  ).run();
  await env.VIVI_D1.prepare(
    `CREATE TABLE IF NOT EXISTS rbac_user_tenants (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id))`
  ).run();
  await env.VIVI_D1.prepare(
    `CREATE TABLE IF NOT EXISTS rbac_user_sites (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, site_id TEXT NOT NULL, site_name TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id, site_id))`
  ).run();

  const users = await env.VIVI_D1.prepare(
    `SELECT u.id AS userId, u.name AS name, u.email AS email, u.status AS status
     FROM rbac_users u
     INNER JOIN rbac_user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = ?1
     WHERE lower(u.status) = 'active'`
  )
    .bind(tenantId)
    .all<{ userId?: string; name?: string; email?: string }>();

  const siteRows = await env.VIVI_D1.prepare(
    `SELECT user_id AS userId, site_name AS siteName FROM rbac_user_sites WHERE tenant_id = ?1`
  )
    .bind(tenantId)
    .all<{ userId?: string; siteName?: string }>();

  const sitesByUser = new Map<string, Set<string>>();
  for (const row of siteRows.results ?? []) {
    const userId = String((row as any)?.userId ?? "").trim();
    const siteName = String((row as any)?.siteName ?? "").trim().toLowerCase();
    if (!userId) continue;
    if (!sitesByUser.has(userId)) sitesByUser.set(userId, new Set());
    if (siteName) sitesByUser.get(userId)!.add(siteName);
  }

  const normalizedAssetSite = String(assetSite ?? "").trim().toLowerCase();
  if (!normalizedAssetSite) return [];
  const recipients: AlertRecipient[] = [];

  for (const row of users.results ?? []) {
    const userId = String((row as any)?.userId ?? "").trim();
    const email = String((row as any)?.email ?? "").trim().toLowerCase();
    const name = String((row as any)?.name ?? "").trim();
    if (!userId || !email) continue;

    const assignedSites = sitesByUser.get(userId);
    if (assignedSites && assignedSites.size > 0) {
      const allowed = [...assignedSites].some((siteName) => siteScopesMatch(siteName, normalizedAssetSite));
      if (!allowed) continue;
    }

    recipients.push({ userId, name, email });
  }

  return recipients;
}

export async function appendInAppAlert(env: UserAlertDispatchEnv, record: ViviUserAlertRecord) {
  const key = userAlertsKvKey(record.tenantId, record.userId);
  const raw = await env.ViviTEL.get(key);
  let list: ViviUserAlertRecord[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ViviUserAlertRecord[];
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  list = [record, ...list.filter((row) => row.id !== record.id)].slice(0, 200);
  await env.ViviTEL.put(key, JSON.stringify(list));
}

export async function readUserAlertsForUser(
  env: UserAlertDispatchEnv,
  tenantId: string,
  userId: string,
  since?: string
): Promise<ViviUserAlertRecord[]> {
  const raw = await env.ViviTEL.get(userAlertsKvKey(tenantId, userId));
  if (!raw) return [];
  let list: ViviUserAlertRecord[] = [];
  try {
    list = JSON.parse(raw) as ViviUserAlertRecord[];
    if (!Array.isArray(list)) return [];
  } catch {
    return [];
  }
  const sinceMs = since ? Date.parse(since) : NaN;
  if (!Number.isFinite(sinceMs)) return list;
  return list.filter((row) => Date.parse(String(row.createdAt ?? "")) > sinceMs);
}

async function findAssetsByImei(env: UserAlertDispatchEnv, tenantId: string, imei: string) {
  const needle = String(imei ?? "").trim();
  if (!needle) return [] as Record<string, unknown>[];
  const result = await env.VIVI_D1.prepare(
    `SELECT data FROM assets WHERE tenant_id = ? AND data LIKE ? ORDER BY updated_at DESC`
  )
    .bind(tenantId, `%"imei":"${needle}"%`)
    .all();
  return (result.results ?? [])
    .map((row) => {
      try {
        return JSON.parse(String((row as any).data)) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Record<string, unknown>[];
}

function extractDriverName(asset: Record<string, unknown>) {
  return String(
    asset.driverName
    ?? asset.defaultDriver
    ?? asset.driver
    ?? asset.assignedDriver
    ?? asset.currentDriver
    ?? ""
  ).trim();
}

function knotsToKph(value: unknown): number | undefined {
  const knots = Number(value);
  if (!Number.isFinite(knots) || knots < 0) return undefined;
  // Traccar position.speed is knots; some payloads already store km/h (> ~120 unlikely as knots for road fleets).
  if (knots > 120) return Math.round(knots);
  return Math.round(knots * 1.852);
}

function metersToKm(value: unknown): number | undefined {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0) return undefined;
  // Traccar totalDistance is typically metres; small values are already kilometres.
  const km = raw >= 1000 ? raw / 1000 : raw;
  return Math.round(km * 100) / 100;
}

type EventTelemetrySnapshot = {
  locationName: string;
  driver: string;
  speedKph?: number;
  distanceKm?: number;
  latitude?: number;
  longitude?: number;
  heading?: string;
  course?: number;
};

async function resolveEventTelemetry(
  env: UserAlertDispatchEnv,
  deviceId: number,
  attributes: Record<string, unknown>,
  asset: Record<string, unknown>,
  positionId?: number
): Promise<EventTelemetrySnapshot> {
  const attrs = attributes ?? {};
  let latitude = Number(attrs.latitude ?? attrs.lat ?? NaN);
  let longitude = Number(attrs.longitude ?? attrs.lng ?? attrs.lon ?? NaN);
  let speedKph = knotsToKph(attrs.speed ?? attrs.speedKph ?? attrs.actualSpeed);
  let distanceKm = metersToKm(attrs.totalDistance ?? attrs.odometer ?? attrs.distance);
  let course = Number(attrs.course ?? attrs.heading ?? NaN);
  let locationName = String(
    attrs.geofenceName
    ?? attrs.locationName
    ?? attrs.address
    ?? attrs.location
    ?? ""
  ).trim();
  let driver = String(attrs.driverName ?? attrs.driver ?? "").trim() || extractDriverName(asset);

  const needsPosition =
    !locationName
    || !Number.isFinite(speedKph as number)
    || !Number.isFinite(distanceKm as number)
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || !Number.isFinite(course)
    || !driver;

  if (needsPosition && Number.isFinite(deviceId) && deviceId > 0) {
    let positions: Record<string, unknown>[] = [];
    if (Number.isFinite(positionId) && (positionId as number) > 0) {
      const exact = await traccarFetch(env, `/api/positions?id=${encodeURIComponent(String(positionId))}`);
      positions = Array.isArray(exact.body) ? (exact.body as Record<string, unknown>[]) : [];
    }
    if (!positions.length) {
      const latest = await traccarFetch(
        env,
        `/api/positions?deviceId=${encodeURIComponent(String(deviceId))}`
      );
      positions = Array.isArray(latest.body) ? (latest.body as Record<string, unknown>[]) : [];
    }
    const position = positions[0] ?? null;
    if (position) {
      const posAttrs = (position.attributes && typeof position.attributes === "object"
        ? position.attributes
        : {}) as Record<string, unknown>;
      if (!Number.isFinite(latitude)) latitude = Number(position.latitude ?? position.lat ?? NaN);
      if (!Number.isFinite(longitude)) {
        longitude = Number(position.longitude ?? position.lng ?? position.lon ?? NaN);
      }
      if (!Number.isFinite(speedKph as number)) {
        speedKph = knotsToKph(position.speed ?? posAttrs.speed ?? posAttrs.speedKph);
      }
      if (!Number.isFinite(distanceKm as number)) {
        distanceKm = metersToKm(posAttrs.totalDistance ?? posAttrs.odometer ?? position.odometer);
      }
      if (!Number.isFinite(course)) {
        course = Number(position.course ?? posAttrs.course ?? posAttrs.heading ?? NaN);
      }
      if (!locationName) {
        locationName = String(position.address ?? posAttrs.address ?? posAttrs.geofenceName ?? "").trim();
      }
      if (!driver) {
        driver = String(posAttrs.driverName ?? posAttrs.driver ?? "").trim();
      }
    }
  }

  if (!driver) driver = extractDriverName(asset);

  return {
    locationName,
    driver,
    speedKph: Number.isFinite(speedKph as number) ? (speedKph as number) : undefined,
    distanceKm: Number.isFinite(distanceKm as number) ? (distanceKm as number) : undefined,
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    heading: formatCompassHeading(course),
    course: Number.isFinite(course) ? course : undefined
  };
}

export async function actionUserAlertForUser(
  env: UserAlertDispatchEnv,
  input: {
    tenantId: string;
    userId: string;
    alertId: string;
    decision: ViviUserAlertActionDecision;
    note?: string;
    actorName: string;
    actorEmail: string;
  }
): Promise<{ ok: true; alert: ViviUserAlertRecord } | { ok: false; error: string }> {
  const tenantId = String(input.tenantId ?? "").trim();
  const userId = String(input.userId ?? "").trim();
  let alertId = String(input.alertId ?? "").trim();
  if (alertId.startsWith("vivi-")) alertId = alertId.slice("vivi-".length);
  const decision = String(input.decision ?? "").trim().toLowerCase() as ViviUserAlertActionDecision;
  if (!tenantId || !userId || !alertId) return { ok: false, error: "tenant, user, and alert id are required" };
  if (decision !== "yes" && decision !== "no") return { ok: false, error: "decision must be yes or no" };

  const note = String(input.note ?? "").trim();
  if (decision === "yes" && !note) {
    return { ok: false, error: "A supporting note is required when actioning Yes." };
  }

  const key = userAlertsKvKey(tenantId, userId);
  const raw = await env.ViviTEL.get(key);
  if (!raw) return { ok: false, error: "Alert not found." };
  let list: ViviUserAlertRecord[] = [];
  try {
    const parsed = JSON.parse(raw) as ViviUserAlertRecord[];
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    return { ok: false, error: "Alert store is unreadable." };
  }

  const index = list.findIndex((row) => String(row.id ?? "").trim() === alertId);
  if (index < 0) return { ok: false, error: "Alert not found." };

  const action: ViviUserAlertAction = {
    decision,
    ...(decision === "yes" ? { note } : {}),
    actionedAt: new Date().toISOString(),
    actionedByUserId: userId,
    actionedByName: String(input.actorName ?? "").trim() || "User",
    actionedByEmail: String(input.actorEmail ?? "").trim().toLowerCase()
  };

  const next: ViviUserAlertRecord = {
    ...list[index],
    read: true,
    action
  };
  list[index] = next;
  await env.ViviTEL.put(key, JSON.stringify(list));
  return { ok: true, alert: next };
}

async function resolveGeofenceName(
  env: UserAlertDispatchEnv,
  geofenceId: number
): Promise<string> {
  if (!Number.isFinite(geofenceId) || geofenceId <= 0) return "";
  // Traccar ignores an id filter on /api/geofences, so the list must be searched by id.
  for (const query of ["/api/geofences?all=true", "/api/geofences"]) {
    const resp = await traccarFetch(env, query);
    if (!Array.isArray(resp.body)) continue;
    const row = (resp.body as Record<string, unknown>[]).find((item) => Number(item?.id) === geofenceId);
    if (row) return String(row.name ?? "").trim();
  }
  return "";
}

async function findTenantIdsByImei(env: UserAlertDispatchEnv, imei: string) {
  const rows = await env.VIVI_D1.prepare(`SELECT tenant_id FROM assets WHERE data LIKE ? ORDER BY updated_at DESC`)
    .bind(`%"imei":"${imei}"%`)
    .all<{ tenant_id?: string }>();
  const unique = new Set<string>();
  for (const row of rows.results ?? []) {
    const id = String((row as any)?.tenant_id ?? "").trim();
    if (id) unique.add(id);
  }
  return Array.from(unique);
}

type AlertPerson = {
  id?: string;
  name?: string;
  email?: string;
  mobile?: string;
};

type NotificationBindingRow = {
  site?: string;
  monitoredEvents?: string[];
  selectedAssets?: string[];
  selectedDrivers?: string[];
  emailRecipients?: AlertPerson[];
  pushRecipients?: AlertPerson[];
  recipients?: Array<{ name?: string; channel?: string }>;
};

function personEmail(person: AlertPerson): string {
  return String(person.email ?? "").trim().toLowerCase();
}

function personUserId(person: AlertPerson): string {
  const id = String(person.id ?? "").trim();
  if (!id || id.startsWith("contact-") || id.includes("@")) return "";
  return id;
}

/**
 * People explicitly added on an alert. Site membership alone is not a recipient.
 * A user picked from the site list counts even without a saved address: the current
 * address is looked up by user id when the email is sent.
 */
export function explicitAlertRecipients(binding: NotificationBindingRow): {
  email: AlertPerson[];
  push: AlertPerson[];
} {
  const email = (binding.emailRecipients ?? []).filter(
    (person) => personEmail(person).includes("@") || Boolean(personUserId(person))
  );
  const push = (binding.pushRecipients ?? []).filter((person) => personUserId(person) || personEmail(person).includes("@"));
  if (email.length || push.length) return { email, push };

  const legacyEmail: AlertPerson[] = [];
  const legacyPush: AlertPerson[] = [];
  for (const entry of binding.recipients ?? []) {
    const name = String(entry?.name ?? "").trim();
    if (!name) continue;
    const channel = String(entry?.channel ?? "email").trim().toLowerCase();
    if (channel === "sms" || channel === "in-app" || channel === "push") {
      if (!name.startsWith("contact-") && !name.includes("@")) legacyPush.push({ id: name, name });
    } else if (name.includes("@")) {
      legacyEmail.push({ id: name, name, email: name });
    }
  }
  return { email: legacyEmail, push: legacyPush };
}

/** An alert limited to chosen assets or drivers must not notify for any other asset or driver. */
function bindingSelectionAllows(binding: NotificationBindingRow, assetLabel: string, driverName: string): boolean {
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const assets = (binding.selectedAssets ?? []).map(norm).filter(Boolean);
  if (assets.length && !assets.includes(norm(assetLabel))) return false;
  const drivers = (binding.selectedDrivers ?? []).map(norm).filter(Boolean);
  if (drivers.length && !drivers.includes(norm(driverName))) return false;
  return true;
}

export function bindingHasExplicitRecipients(binding: NotificationBindingRow): boolean {
  const people = explicitAlertRecipients(binding);
  return people.email.length > 0 || people.push.length > 0;
}

async function loadNotificationBindings(env: UserAlertDispatchEnv, tenantId: string) {
  const result = await env.VIVI_D1.prepare(
    "SELECT data FROM bindings WHERE tenant_id = ?1 AND type = ?2 ORDER BY updated_at DESC"
  )
    .bind(tenantId, "notifications")
    .all<{ data?: string }>();
  const bindings: NotificationBindingRow[] = [];
  for (const row of result.results ?? []) {
    try {
      const parsed = JSON.parse(String(row.data ?? "{}")) as NotificationBindingRow;
      if (parsed && typeof parsed === "object") bindings.push(parsed);
    } catch {
      // ignore malformed rows
    }
  }
  return bindings;
}

export async function loadSiteNotificationLibrary(
  env: UserAlertDispatchEnv,
  tenantId: string,
  site: string
): Promise<Array<{ description?: string; availability?: string }>> {
  const key = buildScopedKvKey("libraries:notification", tenantId, site);
  const raw = await env.ViviTEL.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { items?: Array<{ description?: string; availability?: string }> };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export type ViviNotificationRule = {
  traccarType: string;
  description: string;
  delivery: UserAlertDelivery;
  selectedLocations?: string[];
};

function readSelectedLocations(viviConfig: unknown): string[] {
  try {
    const parsed = typeof viviConfig === "string" ? JSON.parse(viviConfig) : viviConfig;
    const selected = (parsed as { parameters?: { selectedLocations?: unknown } })?.parameters?.selectedLocations;
    return Array.isArray(selected)
      ? selected.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export async function loadViviNotificationRules(env: UserAlertDispatchEnv): Promise<ViviNotificationRule[]> {
  const resp = await traccarFetch(env, "/api/notifications");
  if (!resp.ok || !Array.isArray(resp.body)) return [];

  const rules: ViviNotificationRule[] = [];
  for (const row of resp.body as Record<string, unknown>[]) {
    const attrs = (row.attributes && typeof row.attributes === "object" ? row.attributes : {}) as Record<string, unknown>;
    if (String(attrs.viviSource ?? "") !== "notification-library") continue;

    const delivery = resolveUserAlertDeliveryFromPayload(
      { viviConfig: attrs.viviConfig },
      { locationAlert: isLocationAlertType(row.type) }
    );
    if (!delivery || (!delivery.email && !delivery.inApp && !delivery.sms)) continue;

    rules.push({
      traccarType: String(row.type ?? "").trim(),
      description: String(row.description ?? "").trim(),
      delivery,
      selectedLocations: readSelectedLocations(attrs.viviConfig)
    });
  }
  return rules;
}

function buildAlertEmailEvent(input: {
  asset: Record<string, unknown>;
  assetLabel: string;
  site?: string;
  locationName?: string;
  driver?: string;
  speedKph?: number;
  distanceKm?: number;
  latitude?: number;
  longitude?: number;
  heading?: string;
  eventLabel: string;
  eventTime: string;
  timeZoneSettings?: import("./deviceAlertEmail").SiteTimeZoneSettings | null;
  googleMapsApiKey?: string;
}): DeviceAlertEmailEvent {
  const asset = input.asset;
  const speedText = Number.isFinite(input.speedKph as number) ? `${input.speedKph} km/h` : undefined;
  const eventValue = resolveNotificationValue({
    notificationName: input.eventLabel,
    actualSpeed: speedText,
    speedKph: input.speedKph,
    eventValue: Number.isFinite(input.distanceKm as number) ? `${input.distanceKm} km` : "",
    locationName: input.locationName
  });
  return {
    organisationName: resolveAssetOrganisation(asset),
    siteName: String(input.site ?? asset.site ?? "").trim() || undefined,
    assetDescription: input.assetLabel,
    registrationNumber: resolveAssetRegistration(asset),
    assetId: resolveSystemAssetId(asset),
    driverName: String(input.driver ?? "").trim() || "Unknown",
    notificationName: input.eventLabel,
    eventDateTime:
      formatNotificationDateTime(
        input.eventTime,
        String(input.site ?? asset.site ?? "").trim(),
        input.timeZoneSettings
      ) || input.eventTime,
    eventValue: eventValue || undefined,
    locationName: input.locationName || undefined,
    latitude: input.latitude,
    longitude: input.longitude,
    actualSpeed: speedText,
    speedLimit: "NA km/h",
    heading: input.heading,
    mapImageUrl: buildAlertMapImageUrl(input.latitude, input.longitude, input.googleMapsApiKey)
  };
}

function buildAlertMessage(input: {
  eventLabel: string;
  assetLabel: string;
  site?: string;
  locationName?: string;
  driver?: string;
  speedKph?: number;
  distanceKm?: number;
  eventTime: string;
  appBaseUrl?: string;
}) {
  const lines = [
    `Event: ${input.eventLabel}`,
    `Asset: ${input.assetLabel}`,
    ...(input.locationName ? [`Location: ${input.locationName}`] : []),
    ...(Number.isFinite(input.speedKph as number) ? [`Speed: ${input.speedKph} km/h`] : []),
    ...(Number.isFinite(input.distanceKm as number) ? [`Distance: ${input.distanceKm} km`] : []),
    ...(input.driver ? [`Driver: ${input.driver}`] : []),
    ...(input.site ? [`Site: ${input.site}`] : []),
    `Notification Date and Time: ${input.eventTime}`
  ];
  const base = String(input.appBaseUrl ?? "").trim().replace(/\/$/, "");
  if (base) lines.push("", `Open Vivitel: ${base}`);
  return lines.join("\n");
}

export async function dispatchViviUserAlertsForTraccarEvent(
  env: UserAlertDispatchEnv,
  input: {
    tenantId: string;
    traccarEvent: {
      id?: number;
      type?: string;
      eventTime?: string;
      deviceId?: number;
      positionId?: number;
      geofenceId?: number;
      attributes?: Record<string, unknown>;
    };
    rules?: ViviNotificationRule[];
  }
): Promise<{ dispatched: boolean; reason?: string }> {
  const eventId = Number(input.traccarEvent.id);
  const eventType = String(input.traccarEvent.type ?? "").trim();
  const deviceId = Number(input.traccarEvent.deviceId);
  const eventTime = String(input.traccarEvent.eventTime ?? new Date().toISOString()).trim();
  const tenantId = String(input.tenantId ?? "").trim();
  const attributes = {
    ...((input.traccarEvent.attributes && typeof input.traccarEvent.attributes === "object"
      ? input.traccarEvent.attributes
      : {}) as Record<string, unknown>)
  };
  // Traccar reports the geofence on the event itself, not inside its attributes.
  if (Number(input.traccarEvent.geofenceId) > 0 && !(Number(attributes.geofenceId) > 0)) {
    attributes.geofenceId = Number(input.traccarEvent.geofenceId);
  }

  if (!tenantId || !eventType || !Number.isFinite(deviceId) || deviceId <= 0) {
    return { dispatched: false, reason: "missing tenant, type, or deviceId" };
  }
  if (Number.isFinite(eventId) && eventId > 0) {
    const dedupe = await env.ViviTEL.get(alertDedupeKey(tenantId, eventId));
    if (dedupe) return { dispatched: false, reason: "duplicate" };
  }

  const rules = input.rules ?? (await loadViviNotificationRules(env));
  const namedEvent = String(attributes.alarm ?? attributes.description ?? "").trim().toLowerCase();
  let matching = rules.filter((rule) => {
    if (rule.traccarType !== eventType) return false;
    const description = String(rule.description ?? "").trim().toLowerCase();
    if (namedEvent) return description === namedEvent;
    // Alarm is shared by many library rows. Never borrow another row's name.
    if (eventType === "alarm") return false;
    return true;
  });
  if (eventType === "geofenceEnter" || eventType === "geofenceExit") {
    // A location alert only fires for the geofences chosen when it was set up.
    const eventGeofenceId = Number(attributes.geofenceId ?? attributes.geofence ?? 0);
    if (matching.some((rule) => rule.selectedLocations?.length) && eventGeofenceId > 0) {
      const eventGeofenceName = (await resolveGeofenceName(env, eventGeofenceId)).toLowerCase();
      matching = matching.filter((rule) => {
        const selected = rule.selectedLocations ?? [];
        if (!selected.length) return true;
        return selected.includes(String(eventGeofenceId)) || (Boolean(eventGeofenceName) && selected.includes(eventGeofenceName));
      });
    }
  }
  if (!matching.length) return { dispatched: false, reason: "no matching library rules with user alerts" };

  const delivery: UserAlertDelivery = {
    email: matching.some((r) => r.delivery.email),
    inApp: matching.some((r) => r.delivery.inApp),
    sms: matching.some((r) => r.delivery.sms)
  };
  if (!delivery.email && !delivery.inApp && !delivery.sms) {
    return { dispatched: false, reason: "channels disabled" };
  }

  const deviceResp = await traccarFetch(env, `/api/devices?id=${encodeURIComponent(String(deviceId))}`);
  const device = Array.isArray(deviceResp.body) ? (deviceResp.body[0] as Record<string, unknown>) : null;
  const imei = String(device?.uniqueId ?? "").trim();
  const deviceName = String(device?.name ?? "").trim();

  const assets = imei ? await findAssetsByImei(env, tenantId, imei) : [];
  const siteBindings = await loadNotificationBindings(env, tenantId);
  const asset = assets.find((row) => {
    const rowSite = String(row.site ?? "").trim();
    return Boolean(rowSite) && matching.some((rule) => siteMonitorsNotification(siteBindings, rule.description, rowSite));
  });
  if (!asset) return { dispatched: false, reason: "notification is not monitored for this asset site" };
  const assetLabel = String(
    asset.assetDescription ?? asset.description ?? asset.registration ?? asset.name ?? deviceName ?? imei ?? "Asset"
  ).trim();
  const site = String(asset.site ?? "").trim();
  const scoped = matching.filter((rule) => siteMonitorsNotification(siteBindings, rule.description, site));
  if (!scoped.length) return { dispatched: false, reason: "notification is not monitored for this asset site" };
  const isGeofenceEvent = eventType === "geofenceEnter" || eventType === "geofenceExit";
  // Geofence events never name the alert, so several location alerts of one type may match.
  if (!namedEvent && !isGeofenceEvent && scoped.length !== 1) {
    return { dispatched: false, reason: "event does not name one site notification" };
  }
  delivery.email = scoped.some((rule) => rule.delivery.email);
  delivery.inApp = scoped.some((rule) => rule.delivery.inApp);
  delivery.sms = scoped.some((rule) => rule.delivery.sms);
  if (!delivery.email && !delivery.inApp && !delivery.sms) {
    return { dispatched: false, reason: "channels disabled" };
  }
  const telemetry = await resolveEventTelemetry(env, deviceId, attributes, asset, Number(input.traccarEvent.positionId));
  let locationName = telemetry.locationName;
  const geofenceId = Number(attributes.geofenceId ?? attributes.geofence ?? 0);
  if (!locationName && Number.isFinite(geofenceId) && geofenceId > 0) {
    locationName = await resolveGeofenceName(env, geofenceId);
  }
  const driver = telemetry.driver;
  const speedKph = telemetry.speedKph;
  const distanceKm = telemetry.distanceKm;
  const library = await loadSiteNotificationLibrary(env, tenantId, site);
  const ready = scoped.filter(
    (rule) => isLocationAlertType(rule.traccarType) || libraryNotificationIsAvailable(library, rule.description)
  );
  if (!ready.length) return { dispatched: false, reason: "notification is not set" };

  const audienceBindings = siteBindings.filter(
    (binding) =>
      bindingHasExplicitRecipients(binding)
      && bindingSelectionAllows(binding, assetLabel, driver || "Unknown")
      && ready.some((rule) => bindingCoversSiteEvent(binding, rule.description, site))
  );
  if (!audienceBindings.length) return { dispatched: false, reason: "no recipients configured" };

  const emailTo = new Map<string, string>();
  const pushUsers = new Map<string, string>();
  const resolveEmail = createRecipientEmailResolver(env);
  for (const binding of audienceBindings) {
    const people = explicitAlertRecipients(binding);
    for (const person of people.email) {
      const email = await resolveEmail(person);
      if (email) emailTo.set(email, String(person.name ?? email).trim() || email);
    }
    for (const person of people.push) {
      const userId = personUserId(person);
      if (userId) pushUsers.set(userId, String(person.name ?? userId).trim() || userId);
    }
  }
  if (!emailTo.size && !pushUsers.size) return { dispatched: false, reason: "no recipients configured" };

  const label = eventLabel(eventType, ready[0]?.description);
  const severity = severityForType(eventType);
  const timeZoneSettings = await loadSiteTimeZoneSettings(env.ViviTEL, tenantId);
  const notificationDateTime = formatNotificationDateTime(eventTime, site, timeZoneSettings) || eventTime;
  const message = buildAlertMessage({
    eventLabel: label,
    assetLabel,
    site: site || undefined,
    locationName: locationName || undefined,
    driver: driver || undefined,
    speedKph,
    distanceKm,
    eventTime: notificationDateTime,
    appBaseUrl: env.APP_BASE_URL
  });

  const alertId = Number.isFinite(eventId) && eventId > 0 ? `traccar-event-${eventId}` : `traccar-event-${crypto.randomUUID()}`;
  const emailEvent = buildAlertEmailEvent({
    asset,
    assetLabel,
    site: site || undefined,
    locationName: locationName || undefined,
    driver: driver || undefined,
    speedKph,
    distanceKm,
    latitude: telemetry.latitude,
    longitude: telemetry.longitude,
    heading: telemetry.heading,
    eventLabel: label,
    eventTime,
    timeZoneSettings,
    googleMapsApiKey: env.GOOGLE_MAPS_API_KEY
  });
  if (!emailEvent.locationName) {
    emailEvent.locationName =
      (await reverseGeocodeLabel(emailEvent.latitude, emailEvent.longitude, env.GOOGLE_MAPS_API_KEY)) || undefined;
  }
  const mapAttachment = await buildAlertMapAttachment(emailEvent.latitude, emailEvent.longitude);
  if (mapAttachment) emailEvent.mapImageUrl = `cid:${mapAttachment.content_id}`;
  const subject = buildDeviceAlertEmailSubject(emailEvent);
  const text = buildDeviceAlertEmailText(emailEvent);
  const html = buildDeviceAlertEmailHtml(emailEvent);
  const retryableEmailFailures: unknown[] = [];

  await Promise.all([
    ...[...pushUsers.keys()].map(async (userId) => {
      await appendInAppAlert(env, {
        id: `${alertId}:${userId}`,
        tenantId,
        userId,
        eventLabel: label,
        assetLabel,
        site: site || undefined,
        locationName: locationName || undefined,
        driver: driver || undefined,
        speedKph,
        distanceKm,
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        headingDeg: telemetry.course,
        positionId: Number(input.traccarEvent.positionId) > 0 ? Number(input.traccarEvent.positionId) : undefined,
        message,
        severity,
        createdAt: eventTime,
        traccarEventId: Number.isFinite(eventId) ? eventId : undefined,
        traccarDeviceId: deviceId,
        channels: { inApp: true, email: emailTo.size > 0 },
        read: false
      });
    }),
    ...[...emailTo.keys()].map(async (email) => {
      try {
        await sendAlertEmailOnce(env, {
          tenantId,
          eventKey: alertEmailEventKey({ ...input.traccarEvent, type: eventType }),
          to: email,
          subject,
          text,
          html,
          attachments: mapAttachment ? [mapAttachment] : undefined
        });
      } catch (error) {
        // Continue with the other people added on this alert; retry this one next poll.
        retryableEmailFailures.push(error);
        console.warn("User alert email failed:", email, error);
      }
    })
  ]);

  if (retryableEmailFailures.length) {
    // Leave the event open: the poll window is retried, and people already emailed are skipped.
    throw new AlertEmailRetryableError(`${retryableEmailFailures.length} alert email(s) failed; will retry`);
  }
  if (Number.isFinite(eventId) && eventId > 0) {
    await env.ViviTEL.put(alertDedupeKey(tenantId, eventId), "1", { expirationTtl: 60 * 60 * 24 * 14 });
  }

  return { dispatched: true };
}

/**
 * Push selected Info Hub stream events into user in-app alerts even when the Streams
 * page is closed. Uses the per-user stream monitor saved from Info Hub settings.
 */
export async function dispatchInfoHubStreamMonitorAlerts(
  env: UserAlertDispatchEnv,
  input: {
    tenantId: string;
    traccarEvent: {
      id?: number;
      type?: string;
      eventTime?: string;
      deviceId?: number;
      positionId?: number;
      attributes?: Record<string, unknown>;
    };
  }
): Promise<{ dispatched: boolean; reason?: string }> {
  const eventId = Number(input.traccarEvent.id);
  const eventType = String(input.traccarEvent.type ?? "").trim();
  const deviceId = Number(input.traccarEvent.deviceId);
  const eventTime = String(input.traccarEvent.eventTime ?? new Date().toISOString()).trim();
  const tenantId = String(input.tenantId ?? "").trim();
  const attributes = (input.traccarEvent.attributes && typeof input.traccarEvent.attributes === "object"
    ? input.traccarEvent.attributes
    : {}) as Record<string, unknown>;

  if (!tenantId || !eventType || !Number.isFinite(deviceId) || deviceId <= 0) {
    return { dispatched: false, reason: "missing tenant, type, or deviceId" };
  }

  const deviceResp = await traccarFetch(env, `/api/devices?id=${encodeURIComponent(String(deviceId))}`);
  const device = Array.isArray(deviceResp.body) ? (deviceResp.body[0] as Record<string, unknown>) : null;
  const imei = String(device?.uniqueId ?? "").trim();
  const deviceName = String(device?.name ?? "").trim();
  const assets = imei ? await findAssetsByImei(env, tenantId, imei) : [];
  const asset = (assets[0] ?? {}) as Record<string, unknown>;
  const assetLabel = String(
    asset.assetDescription ?? asset.description ?? asset.registration ?? asset.name ?? deviceName ?? imei ?? "Asset"
  ).trim();
  const site = String(asset.site ?? "").trim();
  if (!site) return { dispatched: false, reason: "asset has no site" };
  const recipients = await listAlertRecipients(env, tenantId, site);
  if (!recipients.length) return { dispatched: false, reason: "no recipients" };

  const telemetry = await resolveEventTelemetry(env, deviceId, attributes, asset, Number(input.traccarEvent.positionId));
  let locationName = telemetry.locationName;
  const geofenceId = Number(attributes.geofenceId ?? attributes.geofence ?? 0);
  if (!locationName && Number.isFinite(geofenceId) && geofenceId > 0) {
    locationName = await resolveGeofenceName(env, geofenceId);
  }
  const label = eventLabel(eventType);
  const severity = severityForType(eventType);
  const timeZoneSettings = await loadSiteTimeZoneSettings(env.ViviTEL, tenantId);
  const notificationDateTime = formatNotificationDateTime(eventTime, site, timeZoneSettings) || eventTime;
  const message = buildAlertMessage({
    eventLabel: label,
    assetLabel,
    site: site || undefined,
    locationName: locationName || undefined,
    driver: telemetry.driver || undefined,
    speedKph: telemetry.speedKph,
    distanceKm: telemetry.distanceKm,
    eventTime: notificationDateTime,
    appBaseUrl: env.APP_BASE_URL
  });

  const alertId = Number.isFinite(eventId) && eventId > 0
    ? `traccar-event-${eventId}`
    : `traccar-event-${crypto.randomUUID()}`;

  let delivered = 0;
  await Promise.all(
    recipients.map(async (recipient) => {
      const monitor = await readInfoHubStreamMonitor(
        { get: (key) => env.ViviTEL.get(key), put: async () => undefined },
        tenantId,
        recipient.userId
      );
      const monitored = collectMonitoredTypesForUser(monitor, site);
      if (!eventTypeMatchesStreamMonitor(eventType, monitored)) return;

      await appendInAppAlert(env, {
        id: `${alertId}:${recipient.userId}`,
        tenantId,
        userId: recipient.userId,
        eventLabel: label,
        assetLabel,
        site: site || undefined,
        locationName: locationName || undefined,
        driver: telemetry.driver || undefined,
        speedKph: telemetry.speedKph,
        distanceKm: telemetry.distanceKm,
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        headingDeg: telemetry.course,
        positionId: Number(input.traccarEvent.positionId) > 0 ? Number(input.traccarEvent.positionId) : undefined,
        message,
        severity,
        createdAt: eventTime,
        traccarEventId: Number.isFinite(eventId) ? eventId : undefined,
        traccarDeviceId: deviceId,
        channels: { inApp: true },
        read: false
      });
      delivered += 1;
    })
  );

  return delivered > 0 ? { dispatched: true } : { dispatched: false, reason: "no stream monitors matched" };
}

export async function resolveTenantsForTraccarDevice(
  env: UserAlertDispatchEnv,
  deviceId: number,
  preferredTenantId?: string
): Promise<string[]> {
  const preferred = String(preferredTenantId ?? "").trim();
  if (preferred) return [preferred];

  const deviceResp = await traccarFetch(env, `/api/devices?id=${encodeURIComponent(String(deviceId))}`);
  const device = Array.isArray(deviceResp.body) ? (deviceResp.body[0] as Record<string, unknown>) : null;
  const imei = String(device?.uniqueId ?? "").trim();
  if (!imei) return [];
  return findTenantIdsByImei(env, imei);
}

export function isTraccarEventPayload(payload: Record<string, unknown>): boolean {
  const type = String(payload.type ?? "").trim();
  const eventTime = String(payload.eventTime ?? "").trim();
  const deviceId = Number(payload.deviceId);
  if (!type || !eventTime || !Number.isFinite(deviceId) || deviceId <= 0) return false;
  const lat = payload.latitude ?? payload.lat ?? (payload as any).position?.latitude;
  const lng = payload.longitude ?? payload.lng ?? payload.lon ?? (payload as any).position?.longitude;
  return !(Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)));
}

export async function processTraccarUserAlertEventIngest(
  env: UserAlertDispatchEnv,
  payload: Record<string, unknown>,
  preferredTenantId?: string
) {
  const deviceId = Number(payload.deviceId);
  const tenants = await resolveTenantsForTraccarDevice(env, deviceId, preferredTenantId);
  const rules = await loadViviNotificationRules(env).catch(() => [] as ViviNotificationRule[]);
  const logFailure = (label: string) => (error: unknown) => {
    // The scheduled poll covers the same events and retries failed emails.
    console.warn(label, error);
  };
  for (const tenantId of tenants) {
    await dispatchViviUserAlertsForTraccarEvent(env, {
      rules,
      tenantId,
      traccarEvent: {
        id: Number(payload.id),
        type: String(payload.type ?? ""),
        eventTime: String(payload.eventTime ?? ""),
        deviceId,
        positionId: Number(payload.positionId) || undefined,
        geofenceId: Number(payload.geofenceId) || undefined,
        attributes: (payload.attributes && typeof payload.attributes === "object"
          ? payload.attributes
          : {}) as Record<string, unknown>
      }
    }).catch(logFailure("User alert dispatch failed:"));
    await dispatchInfoHubStreamMonitorAlerts(env, {
      tenantId,
      traccarEvent: {
        id: Number(payload.id),
        type: String(payload.type ?? ""),
        eventTime: String(payload.eventTime ?? ""),
        deviceId,
        positionId: Number(payload.positionId) || undefined,
        attributes: (payload.attributes && typeof payload.attributes === "object"
          ? payload.attributes
          : {}) as Record<string, unknown>
      }
    }).catch(logFailure("Stream alert dispatch failed:"));
    const { dispatchDeviceAlertEmailsForTraccarEvent } = await import("./deviceAlertDispatch");
    await dispatchDeviceAlertEmailsForTraccarEvent(env, {
      tenantId,
      rules,
      traccarEvent: {
        id: Number(payload.id),
        type: String(payload.type ?? ""),
        eventTime: String(payload.eventTime ?? ""),
        deviceId,
        attributes: (payload.attributes && typeof payload.attributes === "object"
          ? payload.attributes
          : {}) as Record<string, unknown>
      }
    }).catch(logFailure("Device alert email failed:"));
  }
}

export async function pollTraccarUserAlertsForAllTenants(env: UserAlertDispatchEnv, rawKv: KVNamespace = env.ViviTEL) {
  const base = String(env.TRACCAR_BASE_URL ?? "").trim();
  if (!base) return;

  // Each regional host (us, ent, ae) keeps its KV under its own prefix, so rules and alerts
  // must be read and written through that region's scoped KV.
  const regionScope = new Map<string, { env: UserAlertDispatchEnv; rules: ViviNotificationRule[] }>();
  const scopeForTenant = async (tenantId: string) => {
    const match = tenantId.match(/^region:([a-z0-9]+):/i);
    const candidate = String(match?.[1] ?? "").toLowerCase();
    const region: RegionId = isRegionId(candidate) ? candidate : DEFAULT_REGION;
    let scope = regionScope.get(region);
    if (!scope) {
      const scopedEnv: UserAlertDispatchEnv = {
        ...env,
        ViviTEL: createRegionScopedKv(rawKv, region)
      };
      let rules: ViviNotificationRule[] = [];
      try {
        rules = await loadViviNotificationRules(scopedEnv);
      } catch (error) {
        console.warn("Traccar alert rules unavailable:", region, error);
      }
      scope = { env: scopedEnv, rules };
      regionScope.set(region, scope);
    }
    return scope;
  };
  const tenantIds = (await listDistinctTenantIds(env)).filter((tenantId) => isTraccarStorageTenant(tenantId));
  const to = new Date().toISOString();
  const defaultFrom = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const maxLookbackMs = 24 * 60 * 60 * 1000;

  for (const tenantId of tenantIds) {
    try {
      const scope = await scopeForTenant(tenantId);
      await pollTenantEvents(scope.env, tenantId, scope.rules, to, defaultFrom, maxLookbackMs);
    } catch (error) {
      // One tenant failing must never stop alerts for the others; its window is retried next run.
      console.warn("Traccar alert poll failed for tenant:", tenantId, error);
    }
  }
}

async function pollTenantEvents(
  env: UserAlertDispatchEnv,
  tenantId: string,
  rules: ViviNotificationRule[],
  to: string,
  defaultFrom: string,
  maxLookbackMs: number
) {
  {
    const stateRaw = await env.ViviTEL.get(pollStateKey(tenantId));
    let from = defaultFrom;
    if (stateRaw) {
      try {
        const parsed = JSON.parse(stateRaw) as { lastTo?: string };
        if (parsed?.lastTo) from = parsed.lastTo;
      } catch {
        from = defaultFrom;
      }
    }
    const earliest = Date.now() - maxLookbackMs;
    if (!(Date.parse(from) > earliest)) from = new Date(earliest).toISOString();

    const resp = await traccarFetch(
      env,
      `/api/reports/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    // Keep the window open when Traccar is unreachable so no events are lost.
    if (!resp.ok) return;
    const events = Array.isArray(resp.body) ? (resp.body as Record<string, unknown>[]) : [];
    let failed = false;

    for (const event of events) {
      const deviceId = Number(event.deviceId);
      if (!Number.isFinite(deviceId) || deviceId <= 0) continue;
      try {
        const tenants = await resolveTenantsForTraccarDevice(env, deviceId, tenantId);
        if (!tenants.includes(tenantId)) continue;
        const traccarEvent = {
          id: Number(event.id),
          type: String(event.type ?? ""),
          eventTime: String(event.eventTime ?? ""),
          deviceId,
          positionId: Number(event.positionId) || undefined,
          geofenceId: Number(event.geofenceId) || undefined,
          attributes: (event.attributes && typeof event.attributes === "object"
            ? event.attributes
            : {}) as Record<string, unknown>
        };
        if (rules.length) {
          await dispatchViviUserAlertsForTraccarEvent(env, { tenantId, traccarEvent, rules }).catch((error) => {
            failed = true;
            console.warn("User alert dispatch failed:", error);
          });
        }
        await dispatchInfoHubStreamMonitorAlerts(env, { tenantId, traccarEvent }).catch((error) => {
          failed = true;
          console.warn("Stream alert dispatch failed:", error);
        });
        const { dispatchDeviceAlertEmailsForTraccarEvent } = await import("./deviceAlertDispatch");
        // Traccar events carry a type (e.g. deviceOverspeed), not the alert's name; the
        // dispatcher maps the type to the site's notification names through the rules.
        await dispatchDeviceAlertEmailsForTraccarEvent(env, {
          tenantId,
          traccarEvent,
          rules
        }).catch((error) => {
          failed = true;
          console.warn("Device alert email failed:", error);
        });
      } catch (error) {
        failed = true;
        console.warn("Traccar event skipped:", error);
      }
    }

    // Events already delivered are de-duplicated by id, so a partially failed window is safely retried.
    if (!failed) await env.ViviTEL.put(pollStateKey(tenantId), JSON.stringify({ lastTo: to }));
  }
}
