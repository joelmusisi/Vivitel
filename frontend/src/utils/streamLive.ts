import { resolveAssetDriverName } from "./assetDriver";
import { notificationRows } from "../data/notificationLibrary";
import type { NotificationRow } from "../data/notificationLibrary";
import { readSpeedThresholdKphFromConditions } from "./traccarAttributeMapper";
import {
  fetchJson,
  getTenantId,
  getTraccarDevices,
  getTraccarEvents,
  getTraccarLive,
  getTraccarPositionsByIds,
  getTraccarRoute,
  getUserAlertsFromApi,
  type TraccarDevice,
  type TraccarEvent,
  type TraccarLiveRow,
  type TraccarRoutePoint,
  type ViviUserAlert
} from "./api";
import { loadScopedAssets, resolveScopedDeviceIds } from "./homeScopedDevices";

/** Traccar notification type → library event label (inverse of sync map). */
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
  geofenceEnter: "Geofence Entered",
  geofenceExit: "Geofence Exited",
  alarm: "Alarm",
  media: "Media",
  driverChanged: "Driver Changed",
  maintenance: "Maintenance Required"
};

/** Library availability categories — never treat these as Traccar event types. */
const GENERIC_LIBRARY_TYPE_KEYS = new Set([
  "system",
  "diagnostic",
  "external",
  "default",
  "internal",
  "available",
  "unavailable"
]);

/** True when a library `type` field is a real Traccar event type (camelCase), not a category. */
export function isTraccarEventTypeKey(typeKey: string): boolean {
  const key = String(typeKey ?? "").trim();
  if (!key) return false;
  if (GENERIC_LIBRARY_TYPE_KEYS.has(key.toLowerCase())) return false;
  return /^[a-z][a-zA-Z0-9]*$/.test(key);
}

for (const row of notificationRows) {
  const typeKey = String(row.type ?? "").trim();
  if (isTraccarEventTypeKey(typeKey)) {
    TRACCAR_TYPE_TO_LABEL[typeKey] = row.description;
  }
}

export type StreamLiveNotification = {
  id: string;
  asset: string;
  event: string;
  location: string;
  speed: string;
  distance: string;
  driver: string;
  minutesAgo: number;
  actioned: boolean;
  actionDecision?: "yes" | "no" | "";
  actionNote?: string;
  actionedAt?: string;
  actionedByName?: string;
  actionedByEmail?: string;
  severity: "info" | "warning" | "critical";
  timestamp?: number;
  deviceId?: number;
  traccarType?: string;
  serverAlertId?: string;
  positionId?: number;
  lat?: number;
  lng?: number;
  heading?: number;
};

export type StreamLivePreferences = {
  name?: string;
  activeEventsEnabled?: boolean;
  selectedEvents?: string[];
  /** description → Traccar / library type for precise matching of custom binding names */
  selectedEventTypes?: Record<string, string>;
  selectedAssets?: string[];
  playSounds?: boolean;
  eventPlaySounds?: Record<string, boolean>;
  undocked?: boolean;
  removed?: boolean;
};

export type StreamAssetIndex = {
  id: string;
  name: string;
  site: string;
  traccarDeviceId?: number;
  assetType?: string;
  driver?: string;
};

const CRITICAL_EVENT_TYPES = new Set(["alarm", "fuelDrop", "deviceOverspeed"]);
const WARNING_EVENT_TYPES = new Set([
  "geofenceEnter",
  "geofenceExit",
  "fuelIncrease",
  "deviceMoving",
  "maintenance"
]);

export const STREAM_LIVE_POLL_MS = 12_000;
/** Initial catch-up window — keep short; socket bridge + WS deliver live deltas. */
export const STREAM_LIVE_INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const STREAM_LIVE_MAX_NOTIFICATIONS = 400;
/** Devices polled per cycle. Grouped requests cover a whole site, not just the first 40. */
export const STREAM_LIVE_MAX_DEVICES_PER_POLL = 400;
/** deviceId params per Traccar /reports/events request (keeps the URL short). */
export const STREAM_LIVE_EVENTS_DEVICES_PER_REQUEST = 40;
/** Overlap successive polls so boundary events are not skipped between ticks. */
export const STREAM_LIVE_POLL_OVERLAP_MS = 3_000;

const normalizeEventLabel = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Library description and Traccar type → normalized labels that should match live events. */
const EVENT_MATCH_ALIASES = new Map<string, Set<string>>();

function rememberEventAlias(label: string, alias: string) {
  const key = normalizeEventLabel(label);
  const value = normalizeEventLabel(alias);
  if (!key || !value) return;
  if (!EVENT_MATCH_ALIASES.has(key)) EVENT_MATCH_ALIASES.set(key, new Set());
  EVENT_MATCH_ALIASES.get(key)!.add(value);
}

const filterImpliesGeofenceEntry = (allowedNorm: string) =>
  allowedNorm.includes("enter")
  || allowedNorm.includes("entry")
  || allowedNorm.includes("entered")
  || allowedNorm.includes("inside");

const filterImpliesGeofenceExit = (allowedNorm: string) =>
  allowedNorm.includes("exit")
  || allowedNorm.includes("exited")
  || allowedNorm.includes("outside");

const filterImpliesGeofence = (allowedNorm: string) =>
  allowedNorm.includes("geofence")
  || allowedNorm.includes("geo fence")
  || filterImpliesGeofenceEntry(allowedNorm)
  || filterImpliesGeofenceExit(allowedNorm);

/** Same geofence enter/exit detection used on the Home dashboard activity tile. */
export function isGeofenceLiveNote(
  note: Pick<StreamLiveNotification, "event" | "traccarType">
): boolean {
  const typeKey = normalizeEventLabel(note.traccarType ?? "");
  if (typeKey === "geofenceenter" || typeKey === "geofenceexit") return true;
  const haystack = `${normalizeEventLabel(note.event)} ${typeKey}`;
  if (!haystack.includes("geofence") && !haystack.includes("geo fence")) return false;
  return filterImpliesGeofenceEntry(haystack) || filterImpliesGeofenceExit(haystack);
}

function geofenceFilterMatchesNote(
  allowedNorm: string,
  note: Pick<StreamLiveNotification, "event" | "traccarType">
): boolean {
  if (!isGeofenceLiveNote(note)) return false;
  const typeKey = normalizeEventLabel(note.traccarType ?? "");
  const eventNorm = normalizeEventLabel(note.event);
  const wantsEntry = filterImpliesGeofenceEntry(allowedNorm);
  const wantsExit = filterImpliesGeofenceExit(allowedNorm);
  const isEntry = typeKey === "geofenceenter"
    || eventNorm.includes("enter")
    || eventNorm.includes("entry")
    || eventNorm.includes("inside");
  const isExit = typeKey === "geofenceexit"
    || eventNorm.includes("exit")
    || eventNorm.includes("outside");

  if (!wantsEntry && !wantsExit) return true;
  if (wantsEntry && isEntry) return true;
  if (wantsExit && isExit) return true;
  return false;
}

/**
 * True when a live note matches any configured stream notification label.
 * Matching is exact (normalized label / Traccar type / registered aliases) — no substring
 * wildcards, so distinct stream selections stay isolated.
 */
export function eventMatchesAllowedLabels(
  note: Pick<StreamLiveNotification, "event" | "traccarType">,
  allowedEvents: string[],
  typeByDescription?: Record<string, string>
): boolean {
  if (allowedEvents.length === 0) return false;

  const noteTypeNorm = normalizeEventLabel(note.traccarType ?? "");
  const noteLabels = new Set<string>([normalizeEventLabel(note.event)]);
  if (noteTypeNorm) {
    noteLabels.add(noteTypeNorm);
    noteLabels.add(normalizeEventLabel(traccarEventToLabel(note.traccarType ?? "")));
  }

  for (const allowed of allowedEvents) {
    const allowedRaw = String(allowed ?? "").trim();
    const allowedNorm = normalizeEventLabel(allowedRaw);
    if (!allowedNorm) continue;

    if (noteLabels.has(allowedNorm)) return true;

    // Bound / saved Traccar type for this selection (custom names → real event type).
    const boundType = String(
      typeByDescription?.[allowedRaw]
      ?? typeByDescription?.[allowedNorm]
      ?? ""
    ).trim();
    const boundTypeNorm = normalizeEventLabel(boundType);
    if (boundTypeNorm && isTraccarEventTypeKey(boundType)) {
      if (noteLabels.has(boundTypeNorm)) return true;
      const boundLabelNorm = normalizeEventLabel(traccarEventToLabel(boundType));
      if (boundLabelNorm && noteLabels.has(boundLabelNorm)) return true;
    }

    for (const alias of EVENT_MATCH_ALIASES.get(allowedNorm) ?? []) {
      if (noteLabels.has(alias)) return true;
    }

    if (filterImpliesGeofence(allowedNorm) && geofenceFilterMatchesNote(allowedNorm, note)) {
      return true;
    }
  }

  return false;
}

/** Register description ↔ Traccar type aliases from site notification bindings. */
export function registerBoundNotificationAliases(
  options: Array<{ description?: string; type?: string }>
): void {
  for (const opt of options) {
    const description = String(opt.description ?? "").trim();
    const typeKey = String(opt.type ?? "").trim();
    if (!description) continue;
    rememberEventAlias(description, description);
    if (typeKey && isTraccarEventTypeKey(typeKey)) {
      rememberEventAlias(description, typeKey);
      rememberEventAlias(description, traccarEventToLabel(typeKey));
    }
  }
}

/** Union of selected notification labels across active (non-removed) streams. */
export function collectMonitoredLabelsFromPreferences(
  preferencesByStream: Record<string, StreamLivePreferences>
): string[] {
  const labels = new Set<string>();
  for (const prefs of Object.values(preferencesByStream)) {
    if (!prefs || prefs.removed || prefs.activeEventsEnabled === false) continue;
    for (const label of prefs.selectedEvents ?? []) {
      const trimmed = String(label ?? "").trim();
      if (trimmed) labels.add(trimmed);
    }
  }
  return Array.from(labels);
}

/** Union of Traccar / library types selected across active streams. */
export function collectMonitoredTypesFromPreferences(
  preferencesByStream: Record<string, StreamLivePreferences>,
  typeByDescription?: Record<string, string>
): string[] {
  const types = new Set<string>();
  for (const prefs of Object.values(preferencesByStream)) {
    if (!prefs || prefs.removed || prefs.activeEventsEnabled === false) continue;
    const typeMap = { ...(typeByDescription ?? {}), ...(prefs?.selectedEventTypes ?? {}) };
    for (const label of prefs.selectedEvents ?? []) {
      const trimmed = String(label ?? "").trim();
      if (!trimmed) continue;
      const typeKey = String(typeMap[trimmed] ?? typeMap[normalizeEventLabel(trimmed)] ?? "").trim();
      if (typeKey && isTraccarEventTypeKey(typeKey)) types.add(typeKey);
      // Also accept camelCase labels that are already Traccar types.
      if (isTraccarEventTypeKey(trimmed)) types.add(trimmed);
    }
    for (const typeKey of Object.values(prefs.selectedEventTypes ?? {})) {
      const trimmed = String(typeKey ?? "").trim();
      if (trimmed && isTraccarEventTypeKey(trimmed)) types.add(trimmed);
    }
  }
  return Array.from(types);
}

let audioContext: AudioContext | null = null;
let lastBellAt = 0;

export function readStreamAssetsFromCache(): StreamAssetIndex[] {
  if (typeof window === "undefined") return [];
  const tenantId = getTenantId();
  const keys = [
    tenantId ? `vivi.assets:${tenantId}` : "",
    "vivi.assets",
    "vivi.aiDevices"
  ].filter(Boolean);
  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>[];
      if (!Array.isArray(parsed)) continue;
      return parsed.map((asset, index) => ({
        id: String(asset.id ?? asset.assetId ?? index),
        name: String(
          asset.assetDescription ?? asset.description ?? asset.registration ?? asset.name ?? ""
        ).trim(),
        site: String(asset.site ?? asset.organisation ?? "Unassigned").trim(),
        traccarDeviceId: Number(asset.traccarDeviceId ?? asset.deviceId) || undefined,
        assetType: String(asset.assetType ?? '').trim() || undefined,
        driver: resolveAssetDriverName(asset) || undefined
      })).filter((asset) => asset.name);
    } catch {
      // try next key
    }
  }
  return [];
}

function mapScopedAssets(assets: Record<string, unknown>[]): StreamAssetIndex[] {
  return assets
    .map((asset, index) => ({
      id: String(asset.id ?? asset.assetId ?? index),
      name: String(
        asset.assetDescription ?? asset.description ?? asset.registration ?? asset.name ?? ""
      ).trim(),
      site: String(asset.site ?? asset.organisation ?? "Unassigned").trim(),
      traccarDeviceId: Number(asset.traccarDeviceId ?? asset.deviceId) || undefined,
      assetType: String(asset.assetType ?? '').trim() || undefined,
      driver: resolveAssetDriverName(asset) || undefined
    }))
    .filter((asset) => asset.name);
}

export function traccarEventToLabel(type: string): string {
  const key = String(type ?? "").trim();
  if (!key) return "Event";
  if (TRACCAR_TYPE_TO_LABEL[key]) return TRACCAR_TYPE_TO_LABEL[key];
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ""))
    .join(" ");
}

for (const row of notificationRows) {
  const description = String(row.description ?? "").trim();
  const typeKey = String(row.type ?? "").trim();
  if (!description) continue;
  rememberEventAlias(description, description);
  if (isTraccarEventTypeKey(typeKey)) {
    rememberEventAlias(description, traccarEventToLabel(typeKey));
    rememberEventAlias(description, typeKey);
  }
}

// US Traccar: library display names ↔ report event types (not stored on System/Default rows).
for (const label of [
  "Over speeding",
  "Over Speeding Pre-Warning",
  "Road Speed Limit Exceeded",
  "Speed limit exceeded",
  "Speed Limit Exceeded"
]) {
  rememberEventAlias(label, "deviceOverspeed");
  rememberEventAlias(label, "overspeed");
  rememberEventAlias(label, "Speed Limit Exceeded");
  rememberEventAlias(label, "Speed limit exceeded");
  rememberEventAlias(label, "Over speeding");
}
for (const label of ["Ignition On", "Ignition on"]) {
  rememberEventAlias(label, "ignitionOn");
  rememberEventAlias(label, "Ignition On");
  rememberEventAlias(label, "Ignition on");
}
for (const label of ["Ignition Off", "Ignition off"]) {
  rememberEventAlias(label, "ignitionOff");
  rememberEventAlias(label, "Ignition Off");
  rememberEventAlias(label, "Ignition off");
}
for (const label of ["Geofence Entered", "Geofence entered"]) {
  rememberEventAlias(label, "geofenceEnter");
  rememberEventAlias(label, "Geofence Entered");
}
for (const label of ["Geofence Exited", "Geofence exited"]) {
  rememberEventAlias(label, "geofenceExit");
  rememberEventAlias(label, "Geofence Exited");
}

export function severityForTraccarType(type: string): StreamLiveNotification["severity"] {
  const key = String(type ?? "").trim();
  if (CRITICAL_EVENT_TYPES.has(key)) return "critical";
  if (WARNING_EVENT_TYPES.has(key)) return "warning";
  return "info";
}

export function buildDeviceLabelIndex(
  devices: TraccarDevice[],
  assets: StreamAssetIndex[]
): Map<number, string> {
  const labels = new Map<number, string>();
  for (const device of devices) {
    const id = Number(device.id);
    if (!Number.isFinite(id)) continue;
    labels.set(id, String(device.name ?? device.uniqueId ?? device.identifier ?? id).trim());
  }
  for (const asset of assets) {
    const deviceId = asset.traccarDeviceId;
    if (!deviceId || labels.has(deviceId)) continue;
    labels.set(deviceId, asset.name);
  }
  return labels;
}

export function mapTraccarEventToLiveNotification(
  event: TraccarEvent,
  deviceLabels: Map<number, string>
): StreamLiveNotification {
  const deviceId = Number(event.deviceId);
  const timestamp = Date.parse(String(event.eventTime ?? ""));
  const ts = Number.isFinite(timestamp) ? timestamp : Date.now();
  const attrs = event.attributes ?? {};
  const eventLabel = traccarEventToLabel(event.type);
  const geofenceName = String(
    (attrs as Record<string, unknown>).geofenceName
    ?? (attrs as Record<string, unknown>).geofence
    ?? ""
  ).trim();
  const speedKnots = Number((attrs as any).speed ?? NaN);
  const speedLabel = formatSpeedKph(speedKnots);
  const lat = Number((attrs as any).latitude ?? (attrs as any).lat ?? NaN);
  const lng = Number((attrs as any).longitude ?? (attrs as any).lon ?? (attrs as any).lng ?? NaN);
  const heading = Number((attrs as any).course ?? (attrs as any).heading ?? NaN);
  const positionId = Number(event.positionId);
  return {
    id: `traccar-${deviceId}-${event.id}`,
    asset: deviceLabels.get(deviceId) ?? `Device ${deviceId}`,
    event: eventLabel,
    location: String(
      geofenceName
      || (attrs as any).address
      || (attrs as any).location
      || (attrs as any).name
      || ""
    ).trim(),
    speed: speedLabel || "",
    distance: formatDistanceKm((attrs as any).distance ?? (attrs as any).odometer ?? (attrs as any).totalDistance),
    driver: String((attrs as any).driverName ?? (attrs as any).driver ?? ""),
    minutesAgo: Math.max(0, Math.floor((Date.now() - ts) / 60000)),
    actioned: false,
    severity: severityForTraccarType(event.type),
    timestamp: ts,
    deviceId,
    traccarType: event.type,
    positionId: Number.isFinite(positionId) && positionId > 0 ? positionId : undefined,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    heading: Number.isFinite(heading) ? heading : undefined
  };
}

const formatSpeedKph = (speedKnots: unknown) => {
  const knots = Number(speedKnots ?? NaN);
  if (!Number.isFinite(knots) || knots < 0) return "";
  const kph = knots > 120 ? knots : knots * 1.852;
  return `${Math.round(kph)} km/h`;
};

const formatDistanceKm = (value: unknown) => {
  const raw = Number(value ?? NaN);
  if (!Number.isFinite(raw) || raw < 0) {
    const text = String(value ?? "").trim();
    return text;
  }
  const km = raw >= 1000 ? raw / 1000 : raw;
  return `${(Math.round(km * 100) / 100).toFixed(2)} km`;
};

const formatStoredSpeedKph = (value: unknown) => {
  const kph = Number(value ?? NaN);
  if (!Number.isFinite(kph) || kph < 0) return "";
  return `${Math.round(kph)} km/h`;
};

const noteHasCoords = (note: StreamLiveNotification) => {
  const lat = Number(note.lat);
  const lng = Number(note.lng);
  return note.lat != null && note.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
};

/** Fill missing location, speed, driver, distance, and GPS from live / event positions. */
export async function enrichLiveNotifications(
  notes: StreamLiveNotification[],
  liveRows?: TraccarLiveRow[]
): Promise<StreamLiveNotification[]> {
  if (!notes.length) return notes;
  const livePromise = liveRows ? Promise.resolve(liveRows) : getTraccarLive().catch(() => [] as TraccarLiveRow[]);
  const byDevice = new Map<number, TraccarLiveRow>();
  const byName = new Map<string, TraccarLiveRow>();

  const missingPositionIds = notes
    .filter((note) => {
      const hasCoords = noteHasCoords(note);
      return !hasCoords && Number(note.positionId) > 0;
    })
    .map((note) => Number(note.positionId));
  const eventPositionsPromise = missingPositionIds.length
    ? getTraccarPositionsByIds(missingPositionIds).catch(() => [] as TraccarRoutePoint[])
    : Promise.resolve([] as TraccarRoutePoint[]);
  const byPositionId = new Map<number, TraccarRoutePoint>();

  // Alerts stored without a position id: use the fix closest to the event time.
  const byNoteId = new Map<string, TraccarRoutePoint>();
  const timeLookups = notes.filter((note) => {
    const hasCoords = noteHasCoords(note);
    return !hasCoords && !(Number(note.positionId) > 0) && Number(note.deviceId) > 0 && Number(note.timestamp) > 0;
  }).slice(0, 12);
  const timeLookupsPromise = Promise.all(timeLookups.map(async (note) => {
    const at = Number(note.timestamp);
    try {
      const route = await getTraccarRoute({
        deviceId: Number(note.deviceId),
        from: new Date(at - 5 * 60_000).toISOString(),
        to: new Date(at + 5 * 60_000).toISOString(),
        allowPositionsFallback: false
      });
      let best: TraccarRoutePoint | undefined;
      let bestGap = Infinity;
      for (const point of route) {
        const gap = Math.abs(Date.parse(point.fixTime || point.deviceTime) - at);
        if (Number.isFinite(gap) && gap < bestGap) {
          best = point;
          bestGap = gap;
        }
      }
      if (best) byNoteId.set(note.id, best);
    } catch {
      // fall back to live position below
    }
  }));

  const [live, eventPositions] = await Promise.all([livePromise, eventPositionsPromise, timeLookupsPromise]);
  for (const row of live) {
    const id = Number(row.deviceId);
    if (Number.isFinite(id) && id > 0) byDevice.set(id, row);
    const name = String(row.name ?? "").trim().toLowerCase();
    if (name) byName.set(name, row);
  }
  for (const point of eventPositions) {
    const id = Number(point.id);
    if (Number.isFinite(id) && id > 0) byPositionId.set(id, point);
  }

  const findLiveRow = (note: StreamLiveNotification): TraccarLiveRow | undefined => {
    const deviceId = Number(note.deviceId);
    if (Number.isFinite(deviceId) && deviceId > 0) {
      const byId = byDevice.get(deviceId);
      if (byId) return byId;
    }
    const asset = String(note.asset ?? "").trim().toLowerCase();
    if (!asset) return undefined;
    const exact = byName.get(asset);
    if (exact) return exact;
    for (const [name, row] of byName.entries()) {
      if (asset.includes(name) || name.includes(asset)) return row;
    }
    return undefined;
  };

  const readCoord = (...values: unknown[]) => {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  };

  const cachedAssets = readStreamAssetsFromCache();
  const assetDriverFor = (note: StreamLiveNotification, row?: TraccarLiveRow): string => {
    const rowDriver = resolveAssetDriverName(row as unknown as Record<string, unknown>);
    if (rowDriver) return rowDriver;
    const deviceId = Number(note.deviceId);
    const label = String(note.asset ?? '').trim().toLowerCase();
    const match = cachedAssets.find((a) => (deviceId > 0 && a.traccarDeviceId === deviceId) || (label && a.name.toLowerCase() === label));
    return match?.driver || '';
  };

  return notes.map((note) => {
    const liveRow = findLiveRow(note);
    const pos = liveRow?.position;
    const eventPos = Number(note.positionId) > 0
      ? byPositionId.get(Number(note.positionId))
      : byNoteId.get(note.id);
    const eventAttrs = (eventPos?.attributes ?? {}) as Record<string, unknown>;
    const liveAttrs = (pos?.attributes ?? {}) as Record<string, unknown>;
    const address = String(
      note.location
      || eventPos?.address
      || (pos as { address?: string } | undefined)?.address
      || eventAttrs.address
      || liveAttrs.address
      || liveAttrs.geofenceName
      || ""
    ).trim();
    const speed =
      note.speed
      || formatSpeedKph(eventPos?.speed ?? pos?.speed ?? eventAttrs.speed ?? liveAttrs.speed);
    const driver =
      note.driver
      || String(eventAttrs.driverName ?? eventAttrs.driver ?? liveAttrs.driverName ?? liveAttrs.driver ?? "").trim()
      || assetDriverFor(note, liveRow);
    const distance =
      (note.distance && !/^0(\.0+)? km$/.test(note.distance.trim()) ? note.distance : '')
      || formatDistanceKm(
        eventAttrs.totalDistance
        ?? eventAttrs.odometer
        ?? liveAttrs.totalDistance
        ?? liveAttrs.odometer
        ?? ""
      );
    // Live rows use lat/lng; Traccar positions use latitude/longitude.
    const lat = readCoord(
      noteHasCoords(note) ? note.lat : undefined,
      eventPos?.latitude,
      pos?.lat,
      (pos as { latitude?: number } | undefined)?.latitude,
      eventAttrs.latitude,
      eventAttrs.lat,
      liveAttrs.latitude,
      liveAttrs.lat
    );
    const lng = readCoord(
      noteHasCoords(note) ? note.lng : undefined,
      eventPos?.longitude,
      pos?.lng,
      (pos as { longitude?: number } | undefined)?.longitude,
      eventAttrs.longitude,
      eventAttrs.lon,
      eventAttrs.lng,
      liveAttrs.longitude,
      liveAttrs.lon,
      liveAttrs.lng
    );
    const heading = readCoord(
      note.heading,
      eventPos?.course,
      pos?.heading,
      (pos as { course?: number } | undefined)?.course,
      eventAttrs.course,
      eventAttrs.heading,
      liveAttrs.course,
      liveAttrs.heading
    );

    return {
      ...note,
      deviceId: note.deviceId || (liveRow?.deviceId ? Number(liveRow.deviceId) : undefined),
      location: address,
      speed,
      driver,
      distance,
      lat,
      lng,
      heading
    };
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function fetchTraccarEventsForDevices(params: {
  deviceIds: number[];
  from: string;
  to: string;
  concurrency?: number;
}): Promise<TraccarEvent[]> {
  const ids = [...new Set(params.deviceIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return [];
  const { isGpsIotServer } = await import("./regionServers");
  // Traccar takes many deviceId params in one /reports/events call. One request per
  // device (2 at a time) took longer than the poll interval for a site of any size.
  const groups: number[][] = [];
  const groupSize = isGpsIotServer() ? 1 : STREAM_LIVE_EVENTS_DEVICES_PER_REQUEST;
  for (let index = 0; index < ids.length; index += groupSize) groups.push(ids.slice(index, index + groupSize));
  const chunks = await mapWithConcurrency(groups, params.concurrency ?? 2, async (group) => {
    try {
      return group.length === 1
        ? await getTraccarEvents({ deviceId: group[0], from: params.from, to: params.to })
        : await getTraccarEvents({ deviceIds: group, from: params.from, to: params.to });
    } catch {
      return [];
    }
  });
  return chunks.flat();
}

export async function fetchTraccarEventsBulk(params: {
  from: string;
  to: string;
}): Promise<TraccarEvent[]> {
  const from = String(params.from ?? "").trim();
  const to = String(params.to ?? "").trim();
  if (!from || !to) return [];
  // UK GPS IoT: never call Traccar /reports/events — use device-scoped getTraccarEvents (GetTelemetry).
  const { isGpsIotServer } = await import("./regionServers");
  if (isGpsIotServer()) return [];
  try {
    const query = new URLSearchParams({ from, to });
    // Soft-fail empty; prefer device-scoped polls under load (see pollTraccarLiveEvents).
    const result = await fetchJson<TraccarEvent[] | { events?: TraccarEvent[]; data?: TraccarEvent[] }>(
      `/api/traccar/proxy?path=${encodeURIComponent(`/reports/events?${query.toString()}`)}`
    );
    if (Array.isArray(result)) return result;
    if (Array.isArray((result as any)?.events)) return (result as any).events;
    if (Array.isArray((result as any)?.data)) return (result as any).data;
  } catch {
    // fall through
  }
  return [];
}

export async function pollTraccarLiveEvents(params: {
  from: string;
  to: string;
  deviceIds?: number[];
}): Promise<{ events: TraccarEvent[]; deviceLabels: Map<number, string> }> {
  const [devices, scopedAssets] = await Promise.all([
    getTraccarDevices().catch(() => [] as TraccarDevice[]),
    loadScopedAssets().catch(() => [] as Record<string, unknown>[])
  ]);
  const scopedAssetIndex = mapScopedAssets(scopedAssets);
  const cacheAssets = readStreamAssetsFromCache();
  const assets = scopedAssetIndex.length > 0 ? scopedAssetIndex : cacheAssets;
  const deviceLabels = buildDeviceLabelIndex(devices, assets);

  let targetIds = params.deviceIds?.length
    ? params.deviceIds
    : [];

  if (targetIds.length === 0) {
    const scopedIds = (await resolveScopedDeviceIds(scopedAssets))
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (scopedIds.length > 0) {
      targetIds = scopedIds;
    } else {
      // Site-scoped settings must not poll every device in the tenant.
      const activeSite =
        typeof window !== "undefined"
          ? String(window.localStorage.getItem("vivi.activeSite") ?? "").trim()
          : "";
      if (!activeSite) {
        targetIds = devices
          .map((d) => Number(d.id))
          .filter((id) => Number.isFinite(id) && id > 0);
        if (targetIds.length === 0) {
          targetIds = cacheAssets
            .map((a) => a.traccarDeviceId)
            .filter((id): id is number => typeof id === "number" && id > 0);
        }
      }
    }
  }

  targetIds = [...new Set(targetIds)];
  const cappedIds = targetIds.slice(0, STREAM_LIVE_MAX_DEVICES_PER_POLL);
  const allowedDeviceIds = new Set(targetIds);

  // Device-scoped only, grouped per request (concurrency 2). Avoid stacking a tenant-wide
  // bulk /reports/events on top — that double-hit is a primary Traccar overload source.
  const perDeviceEvents = cappedIds.length
    ? await fetchTraccarEventsForDevices({
        deviceIds: cappedIds,
        from: params.from,
        to: params.to,
        concurrency: 2
      })
    : [];

  const eventByKey = new Map<string, TraccarEvent>();
  for (const event of perDeviceEvents) {
    const deviceId = Number(event.deviceId);
    if (allowedDeviceIds.size > 0 && !allowedDeviceIds.has(deviceId)) continue;
    eventByKey.set(`${deviceId}-${event.id}`, event);
  }

  return { events: Array.from(eventByKey.values()), deviceLabels };
}

export function mapViviUserAlertToLiveNotification(alert: ViviUserAlert): StreamLiveNotification {
  const timestamp = Date.parse(String(alert.createdAt ?? ""));
  const ts = Number.isFinite(timestamp) ? timestamp : Date.now();
  const action = alert.action;
  const decision = action?.decision === "yes" || action?.decision === "no" ? action.decision : "";
  const speed =
    formatStoredSpeedKph(alert.speedKph)
    || "";
  const optNum = (value: unknown): number | undefined => {
    if (value === null || value === undefined || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  const distanceKm = optNum(alert.distanceKm);
  const distance = distanceKm !== undefined && distanceKm > 0 ? `${distanceKm.toFixed(2)} km` : "";
  const alertLat = optNum(alert.latitude);
  const alertLng = optNum(alert.longitude);
  const hasAlertCoords = alertLat !== undefined && alertLng !== undefined && !(alertLat === 0 && alertLng === 0);
  return {
    id: `vivi-${alert.id}`,
    serverAlertId: alert.id,
    asset: alert.assetLabel,
    event: alert.eventLabel,
    location: String(alert.locationName ?? alert.site ?? "").trim(),
    speed,
    distance,
    driver: String(alert.driver ?? "").trim(),
    minutesAgo: Math.max(0, Math.floor((Date.now() - ts) / 60000)),
    actioned: Boolean(alert.read) || Boolean(action),
    actionDecision: decision,
    actionNote: String(action?.note ?? "").trim() || undefined,
    actionedAt: action?.actionedAt,
    actionedByName: action?.actionedByName,
    actionedByEmail: action?.actionedByEmail,
    severity: alert.severity,
    timestamp: ts,
    deviceId: alert.traccarDeviceId,
    lat: hasAlertCoords ? alertLat : undefined,
    lng: hasAlertCoords ? alertLng : undefined,
    heading: optNum(alert.headingDeg),
    positionId: Number(alert.positionId) > 0 ? Number(alert.positionId) : undefined
  };
}

export async function pollViviServerUserAlerts(since: string): Promise<StreamLiveNotification[]> {
  const alerts = await getUserAlertsFromApi(since).catch(() => []);
  return alerts.map(mapViviUserAlertToLiveNotification);
}

function isPlaceholderAssetLabel(asset: string): boolean {
  return /^device\s+\d+$/i.test(String(asset ?? "").trim());
}

function mergeNoteFields(
  existing: StreamLiveNotification | undefined,
  incoming: StreamLiveNotification
): StreamLiveNotification {
  if (!existing) return incoming;
  const preferIncomingAsset =
    (incoming.asset && !isPlaceholderAssetLabel(incoming.asset))
    || isPlaceholderAssetLabel(existing.asset);
  return {
    ...existing,
    ...incoming,
    asset: preferIncomingAsset ? (incoming.asset || existing.asset) : existing.asset,
    location: incoming.location || existing.location,
    speed: incoming.speed || existing.speed,
    distance: incoming.distance || existing.distance,
    driver: incoming.driver || existing.driver,
    event: incoming.event || existing.event,
    traccarType: incoming.traccarType || existing.traccarType,
    timestamp: incoming.timestamp ?? existing.timestamp,
    actioned: existing.actioned || incoming.actioned,
    actionDecision: incoming.actionDecision || existing.actionDecision,
    actionNote: incoming.actionNote || existing.actionNote,
    actionedAt: incoming.actionedAt || existing.actionedAt,
    actionedByName: incoming.actionedByName || existing.actionedByName,
    actionedByEmail: incoming.actionedByEmail || existing.actionedByEmail,
    serverAlertId: incoming.serverAlertId || existing.serverAlertId,
    severity: incoming.severity || existing.severity,
    positionId: pickNum(incoming.positionId, existing.positionId),
    lat: pickNum(incoming.lat, existing.lat),
    lng: pickNum(incoming.lng, existing.lng),
    heading: pickNum(incoming.heading, existing.heading)
  };
}

function pickNum(incoming: unknown, existing: number | undefined): number | undefined {
  if (incoming === null || incoming === undefined || incoming === '') return existing;
  const n = Number(incoming);
  return Number.isFinite(n) ? n : existing;
}

export function mergeLiveNotifications(
  current: StreamLiveNotification[],
  incoming: StreamLiveNotification[]
): StreamLiveNotification[] {
  if (incoming.length === 0) return current;
  const byId = new Map<string, StreamLiveNotification>();
  for (const note of current) {
    byId.set(note.id, note);
  }
  for (const note of incoming) {
    byId.set(note.id, mergeNoteFields(byId.get(note.id), note));
  }
  return Array.from(byId.values())
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, STREAM_LIVE_MAX_NOTIFICATIONS);
}

/** Resolve deviceId → display name for websocket payloads (no HTTP round-trip). */
export function buildCachedDeviceLabelIndex(): Map<number, string> {
  return buildDeviceLabelIndex([], readStreamAssetsFromCache());
}

export function assetMatchesAllowedNames(assetLabel: string, allowedAssets: string[]): boolean {
  if (allowedAssets.length === 0) return true;
  const asset = String(assetLabel ?? "").trim().toLowerCase();
  if (!asset) return false;
  return allowedAssets.some((name) => {
    const allowed = String(name ?? "").trim().toLowerCase();
    if (!allowed) return false;
    return asset === allowed || asset.includes(allowed) || allowed.includes(asset);
  });
}

export function noteMatchesStreamPreferences(
  note: StreamLiveNotification,
  prefs: StreamLivePreferences | undefined,
  typeByDescription?: Record<string, string>
): boolean {
  if (prefs?.removed) return false;
  if (prefs?.activeEventsEnabled === false) return false;
  const allowedEvents = prefs?.selectedEvents ?? [];
  // Empty selection means nothing is monitored — not "all events".
  if (allowedEvents.length === 0) return false;
  const typeMap = { ...(typeByDescription ?? {}), ...(prefs?.selectedEventTypes ?? {}) };
  if (!eventMatchesAllowedLabels(note, allowedEvents, typeMap)) return false;
  const allowedAssets = prefs?.selectedAssets ?? [];
  if (!assetMatchesAllowedNames(note.asset, allowedAssets)) {
    return false;
  }
  return true;
}

export function shouldPlayBellForNote(
  note: StreamLiveNotification,
  prefs: StreamLivePreferences | undefined,
  typeByDescription?: Record<string, string>
): boolean {
  if (!noteMatchesStreamPreferences(note, prefs, typeByDescription)) return false;
  if (prefs?.playSounds === false) return false;

  const allowedEvents = prefs?.selectedEvents ?? [];
  const eventSounds = prefs?.eventPlaySounds ?? {};
  const typeMap = { ...(typeByDescription ?? {}), ...(prefs?.selectedEventTypes ?? {}) };

  let matched = false;
  for (const allowed of allowedEvents) {
    if (!eventMatchesAllowedLabels(note, [allowed], typeMap)) continue;
    matched = true;
    if (eventSounds[allowed] === false) return false;
  }
  return matched;
}

export function shouldPlayBellForNotes(
  notes: StreamLiveNotification[],
  preferencesByStream: Record<string, StreamLivePreferences>,
  typeByDescription?: Record<string, string>
): boolean {
  const activePrefs = Object.entries(preferencesByStream).filter(([, prefs]) => !prefs?.removed);
  if (activePrefs.length === 0) return false;
  return notes.some((note) =>
    activePrefs.some(([, prefs]) => shouldPlayBellForNote(note, prefs, typeByDescription))
  );
}

const lastBellByNoteId = new Map<string, number>();
let streamsPageActive = false;
const pendingBellTimers = new Set<number>();

/** Streams.tsx calls this on mount/unmount so bells never ring off-page. */
export function setStreamsPageActive(active: boolean): void {
  streamsPageActive = Boolean(active);
  if (!streamsPageActive) {
    for (const timer of pendingBellTimers) {
      window.clearTimeout(timer);
    }
    pendingBellTimers.clear();
  }
}

export function isStreamsPageActive(): boolean {
  return streamsPageActive;
}

/** Play the stream bell for each newly matched notification (short stagger, per-note debounce). */
export function playBellsForNotifications(
  notes: StreamLiveNotification[],
  preferencesByStream: Record<string, StreamLivePreferences>
): void {
  if (!notes.length || typeof window === "undefined") return;
  // Bells only while Info Hub / Streams is open and the tab is visible.
  if (!streamsPageActive) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

  const activePrefs = Object.entries(preferencesByStream).filter(([, prefs]) => !prefs?.removed);
  if (activePrefs.length === 0) return;
  const now = Date.now();
  let staggerMs = 0;

  for (const note of notes) {
    const shouldRing = activePrefs.some(([, prefs]) => shouldPlayBellForNote(note, prefs));
    if (!shouldRing) continue;

    const last = lastBellByNoteId.get(note.id) ?? 0;
    if (now - last < 60_000) continue;
    lastBellByNoteId.set(note.id, now);

    const timer = window.setTimeout(() => {
      pendingBellTimers.delete(timer);
      if (!streamsPageActive) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      playStreamBell();
    }, staggerMs);
    pendingBellTimers.add(timer);
    staggerMs += 450;
  }
}

export function isOverspeedTraccarType(type?: string): boolean {
  return normalizeEventLabel(type ?? "") === "deviceoverspeed";
}

export function isOverspeedEventLabel(label: string): boolean {
  const normalized = normalizeEventLabel(label);
  if (!normalized.includes("speed")) return false;
  return (
    normalized.includes("over")
    || normalized.includes("limit")
    || normalized.includes("excess")
  );
}

export function parseSpeedKphFromLabel(label: string): number | null {
  const match = String(label ?? "").match(/([\d.]+)\s*km\/h/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const defaultSpeedThresholdForLabel = (label: string): number | null => {
  const normalized = normalizeEventLabel(label);
  if (normalized.includes("pre warning") || normalized.includes("pre-warning")) return 70;
  if (normalized.includes("excessive")) return 90;
  if (isOverspeedEventLabel(label)) return 80;
  return null;
};

export function resolveSpeedThresholdKphForLabel(
  label: string,
  library: NotificationRow[]
): number | null {
  const trimmed = String(label ?? "").trim();
  if (!trimmed) return null;
  const row = library.find((item) => String(item.description ?? "").trim() === trimmed);
  const fromParameters = readSpeedThresholdKphFromConditions(row?.parameters?.conditions);
  if (fromParameters != null) return fromParameters;
  return defaultSpeedThresholdForLabel(trimmed);
}

/** Drop geofence/low-limit overspeed noise that is below the library threshold for the stream. */
export function passesOverspeedLibraryThreshold(
  note: Pick<StreamLiveNotification, "event" | "speed" | "traccarType">,
  selectedEventLabels: string[],
  library: NotificationRow[]
): boolean {
  if (!isOverspeedTraccarType(note.traccarType) && !isOverspeedEventLabel(note.event)) return true;

  const labels = selectedEventLabels.length > 0
    ? selectedEventLabels.filter(isOverspeedEventLabel)
    : (isOverspeedEventLabel(note.event) ? [note.event] : []);

  if (labels.length === 0) return true;

  const thresholds = labels
    .map((label) => resolveSpeedThresholdKphForLabel(label, library))
    .filter((value): value is number => value != null);

  if (thresholds.length === 0) return true;

  const requiredKph = Math.min(...thresholds);
  const actualKph = parseSpeedKphFromLabel(note.speed);
  if (actualKph == null) return true;
  return actualKph >= requiredKph;
}

export function filterOverspeedByLibraryThreshold(
  notes: StreamLiveNotification[],
  library: NotificationRow[],
  preferencesByStream: Record<string, StreamLivePreferences>
): StreamLiveNotification[] {
  if (!notes.length || !library.length) return notes;
  return notes.filter((note) => {
    const matchingPrefs = Object.values(preferencesByStream).filter((prefs) =>
      noteMatchesStreamPreferences(note, prefs)
    );
    const selectedLabels = matchingPrefs.flatMap((prefs) => prefs?.selectedEvents ?? []);
    const uniqueLabels = [...new Set(selectedLabels)];
    if (uniqueLabels.length === 0) {
      return passesOverspeedLibraryThreshold(note, [], library);
    }
    return matchingPrefs.some((prefs) =>
      passesOverspeedLibraryThreshold(note, prefs?.selectedEvents ?? [], library)
    );
  });
}

export function playStreamBell(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastBellAt < 350) return;
  lastBellAt = now;
  try {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!audioContext) audioContext = new AudioContextCtor();
    const context = audioContext;
    const startTone = (offsetSeconds: number, frequency: number, durationSeconds: number) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const startAt = context.currentTime + offsetSeconds;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSeconds);
      oscillator.start(startAt);
      oscillator.stop(startAt + durationSeconds + 0.02);
    };
    const ring = () => {
      startTone(0, 880, 0.22);
      startTone(0.25, 1175, 0.3);
    };
    if (context.state === "running") ring();
    else void context.resume().then(ring).catch(() => undefined);
  } catch {
    // Browsers may block autoplay until user gesture.
  }
}

export function resumeStreamAudio(): void {
  if (typeof window === "undefined") return;
  try {
    if (!audioContext) {
      const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audioContext = new Ctor();
    }
    void audioContext.resume().catch(() => undefined);
  } catch {
    // ignore
  }
}
