/**
 * Vivitel notification library / bindings ↔ GPS IoT events & alerts.
 *
 * Catalog: GetEvents → eventId + event_name (upsert onto library by description)
 * History: GetTelemetry → reports / timeline events
 * Fired:   GetNotificationAlerts → Live / Info Hub / user alerts
 * Defs:    GetClientAlerts → named alert configs on the client
 *
 * Parameter field mapping (notification conditions → telemetry):
 * | Vivitel field | GPS IoT telemetry / alert field        |
 * | Speed         | speed, road_speed, Vehiclespeed        |
 * | Event         | event_name, EventName, AlertName       |
 * | Location      | location, Location                     |
 * | Battery       | battery                                |
 * | Odometer      | odometer                               |
 * | Power         | attributes.P / Power                   |
 * | Ignition      | IgnitionStatus / IsIgnitionOn          |
 *
 * Save rules (UK): update existing library rows by description — never create
 * duplicate catalog entries; binding save stays site::name upsert; Traccar
 * notification sync is skipped.
 */

import type { NotificationRow } from "../data/notificationLibrary";
import {
  inferDefaultConditionsForDescription,
  normalizeNotificationAvailability
} from "../data/notificationLibrary";

export type GpsIotEventCatalogItem = {
  id: string;
  eventName: string;
};

export type GpsIotEventTelemetryDto = {
  eventName: string;
  location: string;
  latitude: number;
  longitude: number;
  odometer: number;
  battery: number;
  speed: number;
  roadSpeed: number;
  date: string;
  attributes?: Record<string, unknown>;
  rawAttributes?: string;
};

export type GpsIotNotificationAlertDto = {
  alertId: string;
  imei: string;
  latitude: number;
  longitude: number;
  assetName: string;
  alertName: string;
  priority: string;
  eventName: string;
  location: string;
  gpsDateTime: string;
  speed: number;
  roadSpeed: number;
  ignition: boolean;
  eventId: string;
  additionalEventInfo: string;
  isDismissed: boolean;
  userTimeDate: string;
  attributes?: Record<string, unknown>;
};

export function normalizeGpsIotEventName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchGpsIotEventToDescription(
  catalog: GpsIotEventCatalogItem[],
  description: string
): GpsIotEventCatalogItem | null {
  const target = normalizeGpsIotEventName(description);
  if (!target) return null;
  const exact = catalog.find((row) => normalizeGpsIotEventName(row.eventName) === target);
  if (exact) return exact;
  return (
    catalog.find((row) => {
      const name = normalizeGpsIotEventName(row.eventName);
      return Boolean(name) && (name.includes(target) || target.includes(name));
    }) ?? null
  );
}

/** Title-case GPS IoT event_name for Vivitel library description. */
export function formatGpsIotEventDescription(eventName: string): string {
  const raw = String(eventName ?? "").trim();
  if (!raw) return "";
  return raw
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      if (/^[A-Z0-9]+$/.test(part) && part.length <= 4) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Upsert GPS IoT catalog onto notification library rows by description.
 * Existing rows are updated (eventId / type); never duplicated.
 */
export function mergeGpsIotEventsIntoNotificationLibrary(
  existing: NotificationRow[],
  catalog: GpsIotEventCatalogItem[]
): { items: NotificationRow[]; updated: number; added: number } {
  const byKey = new Map<string, NotificationRow>();
  for (const row of existing) {
    const key = normalizeGpsIotEventName(row.description);
    if (!key) continue;
    byKey.set(key, row);
  }

  let updated = 0;
  let added = 0;
  for (const event of catalog) {
    const description = formatGpsIotEventDescription(event.eventName) || event.eventName;
    const key = normalizeGpsIotEventName(description);
    if (!key) continue;
    const prior = byKey.get(key);
    if (prior) {
      const nextEventId = String(event.id ?? "").trim();
      if (nextEventId && String(prior.eventId ?? "").trim() !== nextEventId) {
        byKey.set(key, {
          ...prior,
          eventId: nextEventId,
          type: String(prior.type ?? "").trim() || "System"
        });
        updated += 1;
      } else if (!String(prior.eventId ?? "").trim() && nextEventId) {
        byKey.set(key, { ...prior, eventId: nextEventId });
        updated += 1;
      }
      continue;
    }
    const inferred = inferDefaultConditionsForDescription(description);
    byKey.set(key, {
      description,
      type: "System",
      availability: normalizeNotificationAvailability("Unavailable"),
      eventId: String(event.id ?? "").trim() || undefined,
      parameters: inferred ? { conditions: inferred } : undefined
    });
    added += 1;
  }

  return { items: Array.from(byKey.values()), updated, added };
}

/** Stamp monitored binding descriptions with GPS IoT event ids (in-place update). */
export function stampNotificationRowsWithGpsIotEventIds(
  rows: NotificationRow[],
  catalog: GpsIotEventCatalogItem[]
): NotificationRow[] {
  return rows.map((row) => {
    const match = matchGpsIotEventToDescription(catalog, row.description);
    if (!match?.id) return row;
    if (String(row.eventId ?? "").trim() === match.id) return row;
    return { ...row, eventId: match.id };
  });
}

export function mapGpsIotTelemetryToTraccarEvent(
  row: GpsIotEventTelemetryDto,
  deviceId: number,
  index = 0
): {
  id: number;
  type: string;
  eventTime: string;
  deviceId: number;
  positionId: number;
  geofenceId: number;
  maintenanceId: number;
  attributes: Record<string, unknown>;
} {
  const at = String(row.date ?? "").trim().replace(/\//g, "-").replace(" ", "T");
  const eventTime = at.includes("T") ? ( /Z$/i.test(at) ? at : `${at}Z`) : new Date().toISOString();
  return {
    id: index + 1,
    type: row.eventName || "event",
    eventTime,
    deviceId,
    positionId: 0,
    geofenceId: 0,
    maintenanceId: 0,
    attributes: {
      source: "gpsiot",
      event: row.eventName,
      eventName: row.eventName,
      alarm: row.eventName,
      speed: row.speed,
      roadSpeed: row.roadSpeed,
      battery: row.battery,
      odometer: row.odometer,
      address: row.location,
      latitude: row.latitude,
      longitude: row.longitude,
      ...(row.attributes ?? {})
    }
  };
}

export function mapGpsIotNotificationAlertToTraccarEvent(
  row: GpsIotNotificationAlertDto,
  deviceId: number,
  index = 0
): {
  id: number;
  type: string;
  eventTime: string;
  deviceId: number;
  positionId: number;
  geofenceId: number;
  maintenanceId: number;
  attributes: Record<string, unknown>;
} {
  const raw = String(row.gpsDateTime || row.userTimeDate || "").trim();
  const eventTime = raw
    ? (raw.includes("T") ? ( /Z$/i.test(raw) ? raw : `${raw}Z`) : new Date(raw).toISOString())
    : new Date().toISOString();
  return {
    id: index + 1,
    type: row.eventName || row.alertName || "alert",
    eventTime,
    deviceId,
    positionId: 0,
    geofenceId: 0,
    maintenanceId: 0,
    attributes: {
      source: "gpsiot-alert",
      event: row.eventName || row.alertName,
      eventName: row.eventName || row.alertName,
      alarm: row.eventName || row.alertName,
      alertName: row.alertName,
      alertId: row.alertId,
      speed: row.speed,
      roadSpeed: row.roadSpeed,
      ignition: row.ignition,
      priority: row.priority,
      address: row.location,
      latitude: row.latitude,
      longitude: row.longitude,
      additionalEventInfo: row.additionalEventInfo,
      ...(row.attributes ?? {})
    }
  };
}

function normalizeGpsIotAlertIso(raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return new Date().toISOString();
  if (value.includes("T")) return /Z$/i.test(value) ? value : `${value}Z`;
  const parsed = Date.parse(value.replace(/\//g, "-"));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function severityFromGpsIotPriority(priority: unknown): "info" | "warning" | "critical" {
  const n = Number(priority);
  if (Number.isFinite(n) && n >= 3) return "critical";
  if (Number.isFinite(n) && n >= 2) return "warning";
  const label = String(priority ?? "").trim().toLowerCase();
  if (/critical|high|urgent/.test(label)) return "critical";
  if (/warn|medium/.test(label)) return "warning";
  return "info";
}

/** Map GetNotificationAlerts → Vivitel in-app / Info Hub alert shape (site-stamped). */
export function mapGpsIotNotificationAlertToViviUserAlert(
  row: GpsIotNotificationAlertDto,
  opts: { tenantId: string; site: string; userId?: string }
): {
  id: string;
  tenantId: string;
  userId: string;
  eventLabel: string;
  assetLabel: string;
  site: string;
  locationName: string;
  speedKph?: number;
  latitude?: number;
  longitude?: number;
  message: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
  read?: boolean;
} {
  const createdAt = normalizeGpsIotAlertIso(row.gpsDateTime || row.userTimeDate || "");
  const eventLabel = String(row.eventName || row.alertName || "Alert").trim() || "Alert";
  const assetLabel = String(row.assetName || row.imei || "Asset").trim() || "Asset";
  const idParts = [
    "gpsiot-alert",
    String(row.alertId || row.eventId || "").trim() || "na",
    String(row.imei || "").trim() || "na",
    createdAt
  ];
  return {
    id: idParts.join(":"),
    tenantId: String(opts.tenantId ?? "").trim(),
    userId: String(opts.userId ?? "").trim(),
    eventLabel,
    assetLabel,
    site: String(opts.site ?? "").trim(),
    locationName: String(row.location ?? "").trim(),
    ...(Number.isFinite(Number(row.speed)) ? { speedKph: Number(row.speed) } : {}),
    ...(Number.isFinite(Number(row.latitude)) ? { latitude: Number(row.latitude) } : {}),
    ...(Number.isFinite(Number(row.longitude)) ? { longitude: Number(row.longitude) } : {}),
    message: String(row.additionalEventInfo || row.alertName || eventLabel).trim() || eventLabel,
    severity: severityFromGpsIotPriority(row.priority),
    createdAt,
    read: Boolean(row.isDismissed)
  };
}

/** Resolve Vivitel notification condition fields onto a telemetry/alert attribute bag. */
export const GPSIOT_NOTIFICATION_PARAMETER_MAP = {
  Speed: ["speed", "roadSpeed", "Vehiclespeed", "VehicleSpeed"],
  Event: ["event", "eventName", "alarm", "AlertName"],
  Location: ["address", "location", "Location"],
  Battery: ["battery", "Battery"],
  Odometer: ["odometer", "Odometer"],
  Power: ["power", "P", "Power"],
  Ignition: ["ignition", "IgnitionStatus", "IsIgnitionOn"]
} as const;
