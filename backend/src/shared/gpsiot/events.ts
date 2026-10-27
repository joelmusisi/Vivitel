import type { GpsIotSecrets } from "./secrets.ts";

/**
 * GPS IoT events ↔ Vivitel notification library / bindings.
 *
 * Catalog:  GET  /api/Events/GetEvents
 * History:  GET  /api/Events/v2/GetTelemetry  { AssetId, StartTime, EndTime, Events[], TimeZone }
 * Alerts:   GET  /api/alerts/GetClientAlerts?clientId=
 * Fired:    POST /api/alerts/GetNotificationAlerts
 *
 * Vivitel notification parameters map onto telemetry fields:
 * | Vivitel condition field | GPS IoT source                          |
 * | Speed                   | speed / road_speed                      |
 * | Event / description     | event_name / EventName                  |
 * | Location                | location                                |
 * | Battery                 | battery                                 |
 * | Odometer                | odometer                                |
 * | Power / voltage         | attributes.P / Power                    |
 * | Ignition                | live IsIgnitionOn / alert IgnitionStatus|
 */

export type GpsIotEventCatalogItem = {
  id: string;
  eventName: string;
};

export type GpsIotEventTelemetry = {
  eventName: string;
  location: string;
  latitude: number;
  longitude: number;
  odometer: number;
  battery: number;
  speed: number;
  roadSpeed: number;
  date: string;
  attributes: Record<string, unknown>;
  rawAttributes: string;
};

export type GpsIotClientAlert = {
  id: string;
  alertName: string;
  priority: string;
  createdBy: string;
  active: boolean;
};

export type GpsIotNotificationAlert = {
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
  attributes: Record<string, unknown>;
};

const asRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isTruthy = (value: unknown) => /^(true|1|yes|on)$/i.test(text(value));

export function normalizeGpsIotEventName(value: unknown): string {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Parse Attributes JSON blob from GetTelemetry (may use smart quotes). */
export function parseGpsIotEventAttributes(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  const source = text(raw);
  if (!source) return {};
  const normalized = source
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  try {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function parseGpsIotEventCatalog(payload: unknown): GpsIotEventCatalogItem[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.Data)
      ? root.Data
      : Array.isArray(payload)
        ? payload
        : [];
  const out: GpsIotEventCatalogItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const record = asRecord(row);
    const id = text(record.id ?? record.Id ?? record.eventId ?? record.EventId);
    const eventName = text(record.event_name ?? record.eventName ?? record.EventName ?? record.name);
    if (!id && !eventName) continue;
    const key = id || normalizeGpsIotEventName(eventName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: id || key, eventName: eventName || id });
  }
  return out;
}

export function parseGpsIotEventTelemetry(payload: unknown): GpsIotEventTelemetry[] {
  const root = asRecord(payload);
  const data = root.data ?? root.Data;
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data).Result)
      ? (asRecord(data).Result as unknown[])
      : Array.isArray(payload)
        ? payload
        : [];
  return rows.flatMap((row) => {
    const record = asRecord(row);
    const eventName = text(record.event_name ?? record.eventName ?? record.EventName);
    const rawAttributes = text(record.attributes ?? record.Attributes);
    const attributes = parseGpsIotEventAttributes(rawAttributes);
    return [{
      eventName,
      location: text(record.location ?? record.Location),
      latitude: num(record.latitude ?? record.lat ?? record.Latitude),
      longitude: num(record.lon ?? record.lng ?? record.longitude ?? record.Longitude),
      odometer: num(record.odometer ?? record.Odometer),
      battery: num(record.battery ?? record.Battery),
      speed: num(record.speed ?? record.Speed ?? record.VehicleSpeed),
      roadSpeed: num(record.road_speed ?? record.roadSpeed ?? record.RoadSpeed),
      date: text(record.date ?? record.Date ?? record.GpsDateTime ?? record.utc_date),
      attributes,
      rawAttributes
    }];
  });
}

export function parseGpsIotClientAlerts(payload: unknown): GpsIotClientAlert[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).data)
      ? (asRecord(payload).data as unknown[])
      : [];
  const out: GpsIotClientAlert[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const record = asRecord(row);
    const id = text(record.Id ?? record.id ?? record.AlertId);
    const alertName = text(record.AlertName ?? record.alertName ?? record.name);
    if (!id && !alertName) continue;
    const key = id || normalizeGpsIotEventName(alertName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: id || key,
      alertName: alertName || id,
      priority: text(record.Priority ?? record.priority),
      createdBy: text(record.CreatedBy ?? record.createdBy),
      active: record.Active === undefined ? true : isTruthy(record.Active)
    });
  }
  return out;
}

export function parseGpsIotNotificationAlerts(payload: unknown): GpsIotNotificationAlert[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).data)
      ? (asRecord(payload).data as unknown[])
      : [];
  return rows.flatMap((row) => {
    const record = asRecord(row);
    const eventName = text(record.EventName ?? record.eventName);
    const alertName = text(record.AlertName ?? record.alertName);
    if (!eventName && !alertName) return [];
    return [{
      alertId: text(record.AlertId ?? record.alertId),
      imei: text(record.ImeiNumber ?? record.imei),
      latitude: num(record.Latitude ?? record.lat),
      longitude: num(record.Longitude ?? record.lon ?? record.lng),
      assetName: text(record.AssetName ?? record.assetName),
      alertName,
      priority: text(record.Priority ?? record.priority),
      eventName,
      location: text(record.Location ?? record.location),
      gpsDateTime: text(record.GpsDateTime ?? record.gpsDateTime),
      speed: num(record.Speed ?? record.speed),
      roadSpeed: num(record.RoadSpeed ?? record.roadSpeed),
      ignition: isTruthy(record.IgnitionStatus ?? record.ignition),
      eventId: text(record.EventId ?? record.eventId),
      additionalEventInfo: text(record.additionalEventInfo ?? record.AdditionalEventInfo),
      isDismissed: isTruthy(record.IsDismissed ?? record.isDismissed),
      userTimeDate: text(record.UserTimeDate ?? record.userTimeDate),
      attributes: {
        source: "gpsiot-alert",
        event: eventName || alertName,
        eventName: eventName || alertName,
        alarm: eventName || alertName,
        speed: num(record.Speed ?? record.speed),
        roadSpeed: num(record.RoadSpeed ?? record.roadSpeed),
        ignition: isTruthy(record.IgnitionStatus ?? record.ignition),
        priority: text(record.Priority ?? record.priority),
        additionalEventInfo: text(record.additionalEventInfo),
        address: text(record.Location ?? record.location)
      }
    }];
  });
}

/**
 * Match a Vivitel notification description to a GPS IoT catalog row (update, never duplicate).
 */
export function matchGpsIotEventToDescription(
  catalog: GpsIotEventCatalogItem[],
  description: string
): GpsIotEventCatalogItem | null {
  const target = normalizeGpsIotEventName(description);
  if (!target) return null;
  const exact = catalog.find((row) => normalizeGpsIotEventName(row.eventName) === target);
  if (exact) return exact;
  const loose = catalog.find((row) => {
    const name = normalizeGpsIotEventName(row.eventName);
    return name.includes(target) || target.includes(name);
  });
  return loose ?? null;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

export async function fetchGpsIotEventCatalog(
  secrets: GpsIotSecrets,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotEventCatalogItem[]> {
  const response = await fetchImpl(`${secrets.baseUrl}/api/Events/GetEvents`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(`GPS IoT GetEvents failed (${response.status})`);
  return parseGpsIotEventCatalog(payload);
}

export async function fetchGpsIotEventTelemetry(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: {
    assetId?: string;
    startTime?: string;
    endTime?: string;
    events?: string[];
    timeZone?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotEventTelemetry[]> {
  const assetId = text(body.assetId);
  const events = Array.isArray(body.events) ? body.events.map((id) => text(id)).filter(Boolean) : [];
  if (!assetId) throw new Error("assetId is required");
  if (!events.length) throw new Error("at least one event id is required");
  const response = await fetchImpl(`${secrets.baseUrl}/api/Events/v2/GetTelemetry`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      AssetId: assetId,
      StartTime: text(body.startTime),
      EndTime: text(body.endTime),
      Events: events,
      TimeZone: text(body.timeZone) || "UTC"
    })
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const message = text(asRecord(payload).message ?? asRecord(payload).Message)
      || `GPS IoT GetTelemetry failed (${response.status})`;
    throw new Error(message);
  }
  return parseGpsIotEventTelemetry(payload);
}

/** Chunk GetTelemetry into ≤24h windows (API limit). */
export async function fetchGpsIotEventTelemetryRange(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: {
    assetId?: string;
    startTime?: string;
    endTime?: string;
    events?: string[];
    timeZone?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotEventTelemetry[]> {
  const startMs = Date.parse(String(body.startTime ?? "").replace(" ", "T"));
  const endMs = Date.parse(String(body.endTime ?? "").replace(" ", "T"));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return fetchGpsIotEventTelemetry(secrets, accessToken, body, fetchImpl);
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const stamp = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  };
  const chunks: GpsIotEventTelemetry[] = [];
  for (let cursor = startMs; cursor < endMs; cursor += dayMs) {
    const chunkEnd = Math.min(cursor + dayMs, endMs);
    const rows = await fetchGpsIotEventTelemetry(
      secrets,
      accessToken,
      { ...body, startTime: stamp(cursor), endTime: stamp(chunkEnd) },
      fetchImpl
    );
    chunks.push(...rows);
  }
  return chunks;
}

export async function fetchGpsIotClientAlerts(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotClientAlert[]> {
  const id = text(clientId);
  if (!id) throw new Error("clientId is required");
  const response = await fetchImpl(
    `${secrets.baseUrl}/api/alerts/GetClientAlerts?clientId=${encodeURIComponent(id)}`,
    {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`
      }
    }
  );
  const payload = await readJson(response);
  if (!response.ok) throw new Error(`GPS IoT GetClientAlerts failed (${response.status})`);
  return parseGpsIotClientAlerts(payload);
}

export async function fetchGpsIotNotificationAlerts(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: {
    clientId?: string;
    startDate?: string;
    endDate?: string;
    timeZoneId?: string;
    alertIds?: string[];
    notifyUserId?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotNotificationAlert[]> {
  const clientId = text(body.clientId);
  if (!clientId) throw new Error("clientId is required");
  const payloadBody: Record<string, unknown> = {
    ClientId: clientId,
    StartDate: text(body.startDate),
    EndDate: text(body.endDate),
    TimeZoneID: text(body.timeZoneId) || "UTC"
  };
  if (Array.isArray(body.alertIds) && body.alertIds.length) {
    payloadBody.AlertIds = body.alertIds.map((id) => text(id)).filter(Boolean);
  }
  if (text(body.notifyUserId)) payloadBody.NotifyUserId = text(body.notifyUserId);
  const response = await fetchImpl(`${secrets.baseUrl}/api/alerts/GetNotificationAlerts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payloadBody)
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(`GPS IoT GetNotificationAlerts failed (${response.status})`);
  return parseGpsIotNotificationAlerts(payload);
}
