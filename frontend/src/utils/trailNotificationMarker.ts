import L from "leaflet";
import type { AssetDotStatus } from "./assetStatus";

export const TRAIL_NOTIFICATION_ACTIVE_MS = 30 * 60 * 1000;
export const TRAIL_POINT_MATCH_TOLERANCE_MS = 120_000;

export type TrailNotificationLike = {
  lat: number;
  lng: number;
  atMs?: number;
  startIso?: string;
  labels?: string[];
  notificationName?: string;
  location?: string;
};

export const trailNotificationStatusColor = (status: AssetDotStatus): string => {
  switch (status) {
    case "online":
      return "#16a34a";
    case "warning":
      return "#94a3b8";
    case "stale":
      return "#d4b896";
    case "offline":
      return "#800000";
    default:
      return "#16a34a";
  }
};

export const notificationEventAtMs = (event: { atMs?: number; startIso?: string }): number => {
  if (typeof event.atMs === "number" && Number.isFinite(event.atMs)) return event.atMs;
  const parsed = Date.parse(String(event.startIso ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const isActiveTrailNotificationMarker = (
  eventAtMs: number,
  mode: "live" | "historical",
  nowMs = Date.now()
): boolean => {
  if (!Number.isFinite(eventAtMs)) return false;
  if (mode === "historical") return true;
  return nowMs - eventAtMs < TRAIL_NOTIFICATION_ACTIVE_MS;
};

export const isSameTrailPosition = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): boolean => Math.abs(a.lat - b.lat) < 0.00005 && Math.abs(a.lng - b.lng) < 0.00005;

export const matchNotificationToTrailPoint = <T extends TrailNotificationLike>(
  point: { lat: number; lng: number; atMs: number },
  events: T[],
  mode: "live" | "historical",
  nowMs = Date.now()
): T | null => {
  let best: T | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const event of events) {
    const eventAtMs = notificationEventAtMs(event);
    if (!isActiveTrailNotificationMarker(eventAtMs, mode, nowMs)) continue;
    const delta = Math.abs(eventAtMs - point.atMs);
    if (delta > TRAIL_POINT_MATCH_TOLERANCE_MS) continue;
    const positionPenalty = isSameTrailPosition(point, event) ? 0 : 5_000;
    const score = delta + positionPenalty;
    if (score < bestDelta) {
      bestDelta = score;
      best = event;
    }
  }
  return best;
};

const buildTriangleSvg = (color: string, size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3 L21 20 H3 Z" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>
    <rect x="11" y="9" width="2" height="5" rx="0.6" fill="${color}"/>
    <circle cx="12" cy="17" r="1.2" fill="${color}"/>
  </svg>`;

const trailIconCache = new Map<string, L.DivIcon>();

export const buildTrailNotificationTriangleIcon = (status: AssetDotStatus, size = 22): L.DivIcon => {
  const cacheKey = `${status}|${size}`;
  const cached = trailIconCache.get(cacheKey);
  if (cached) return cached;

  const color = trailNotificationStatusColor(status);
  const icon = L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 1px 2px rgba(15,23,42,0.25));">${buildTriangleSvg(color, size)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 2],
    popupAnchor: [0, -size + 4]
  });
  trailIconCache.set(cacheKey, icon);
  return icon;
};

export const notificationEventKey = (event: TrailNotificationLike, index = 0): string =>
  `${event.atMs ?? notificationEventAtMs(event)}|${event.lat.toFixed(6)}|${event.lng.toFixed(6)}|${index}`;

export const formatTraccarEventLabel = (value: unknown): string => {
  const text = String(value ?? "").trim();
  if (!text) return "Event";
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

type TraccarRoutePointLike = {
  id?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  fixTime?: unknown;
  deviceTime?: unknown;
  serverTime?: unknown;
  address?: unknown;
};

type TraccarEventLike = {
  id?: unknown;
  type?: unknown;
  eventTime?: unknown;
  positionId?: unknown;
  attributes?: Record<string, unknown>;
};

const parseRoutePointAtMs = (point: TraccarRoutePointLike): number => {
  const parsed = Date.parse(String(point.fixTime ?? point.deviceTime ?? point.serverTime ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

/** Resolve Traccar report events to map coordinates using route position ids or nearest route point. */
export function mapTraccarEventsToTrailNotifications(
  events: TraccarEventLike[],
  routePoints: TraccarRoutePointLike[],
  options?: {
    formatLabel?: (type: unknown) => string;
    includeLabel?: (label: string) => boolean;
    locationForCoordinate?: (address: unknown, lat: number, lng: number) => string | undefined;
  }
): Array<TrailNotificationLike & { labels: string[] }> {
  const formatLabel = options?.formatLabel ?? formatTraccarEventLabel;
  const routeByPositionId = new Map<number, TraccarRoutePointLike>();
  const routeWithMs = routePoints
    .map((point) => ({ point, atMs: parseRoutePointAtMs(point) }))
    .filter((item) => Number.isFinite(item.atMs))
    .sort((a, b) => a.atMs - b.atMs);

  for (const point of routePoints) {
    const idNum = Number(point.id);
    if (Number.isFinite(idNum)) routeByPositionId.set(idNum, point);
  }

  const out: Array<TrailNotificationLike & { labels: string[] }> = [];

  for (const event of events) {
    const atMs = Date.parse(String(event.eventTime ?? ""));
    if (!Number.isFinite(atMs)) continue;

    const attrs = (event.attributes ?? {}) as Record<string, unknown>;
    const label = formatLabel(attrs.eventName ?? attrs.alarm ?? event.type);
    if (options?.includeLabel && !options.includeLabel(label)) continue;

    // GPS IoT GetTelemetry / GetNotificationAlerts put coords on attributes (positionId is 0).
    const attrLat = Number(attrs.latitude ?? attrs.lat ?? attrs.Latitude);
    const attrLng = Number(attrs.longitude ?? attrs.lng ?? attrs.lon ?? attrs.Longitude);
    let lat = Number.isFinite(attrLat) ? attrLat : Number.NaN;
    let lng = Number.isFinite(attrLng) ? attrLng : Number.NaN;
    let address: unknown = attrs.address ?? attrs.location ?? attrs.Location;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      let nearestPosition = routeByPositionId.get(Number(event.positionId));
      if (!nearestPosition && routeWithMs.length > 0) {
        let nearest = routeWithMs[0];
        for (const sample of routeWithMs) {
          if (Math.abs(sample.atMs - atMs) < Math.abs(nearest.atMs - atMs)) nearest = sample;
        }
        nearestPosition = nearest.point;
      }
      lat = Number(nearestPosition?.latitude);
      lng = Number(nearestPosition?.longitude);
      if (address == null || String(address).trim() === "") address = nearestPosition?.address;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    out.push({
      lat,
      lng,
      atMs,
      labels: [label],
      location: options?.locationForCoordinate?.(address, lat, lng)
        ?? (typeof address === "string" && address.trim() ? address.trim() : undefined)
    });
  }

  return out;
}

export const hasActiveSelectedNotificationForAsset = (
  events: TrailNotificationLike[] | undefined,
  nowMs = Date.now()
): boolean => {
  if (!Array.isArray(events) || events.length === 0) return false;
  return events.some((event) => isActiveTrailNotificationMarker(notificationEventAtMs(event), "live", nowMs));
};
