import { buildApiUrl } from "./api";

export type LatLngPoint = { lat: number; lng: number };

export type RoadRouteResult = {
  points: LatLngPoint[];
  meters: number;
};

const EARTH_RADIUS_M = 6371000;

export const polylineLengthMeters = (points: LatLngPoint[]): number => {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    total += 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  }
  return total;
};

export const formatMeasureDistance = (meters: number): string => {
  const value = Number(meters);
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${Math.round(value)} m`;
};

const OSRM_ROUTE_BASE = "https://router.project-osrm.org/route/v1/driving";

export const parseOsrmRouteResponse = (body: unknown): RoadRouteResult | null => {
  const routes = Array.isArray((body as any)?.routes) ? (body as any).routes : [];
  const route = routes[0];
  if (!route) return null;

  const distance = Number(route.distance);
  const coordinates = route?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const points: LatLngPoint[] = coordinates
    .map((coord: unknown) => {
      if (!Array.isArray(coord) || coord.length < 2) return null;
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter((point): point is LatLngPoint => Boolean(point));

  if (points.length < 2) return null;

  return {
    points,
    meters: Number.isFinite(distance) && distance > 0 ? distance : polylineLengthMeters(points)
  };
};

const buildOsrmRouteUrl = (start: LatLngPoint, end: LatLngPoint): string => {
  const routePath = `${encodeURIComponent(String(start.lng))},${encodeURIComponent(String(start.lat))};${encodeURIComponent(String(end.lng))},${encodeURIComponent(String(end.lat))}`;
  return `${OSRM_ROUTE_BASE}/${routePath}?overview=full&geometries=geojson&steps=false`;
};

const fetchJsonWithTimeout = async (url: string, timeoutMs: number): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Route lookup failed (${response.status})`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
};

async function fetchOsrmRouteDirect(start: LatLngPoint, end: LatLngPoint): Promise<RoadRouteResult> {
  const body = await fetchJsonWithTimeout(buildOsrmRouteUrl(start, end), 25_000);
  if (String((body as any)?.code ?? "") !== "Ok") {
    throw new Error("Road route lookup returned no route");
  }
  const parsed = parseOsrmRouteResponse(body);
  if (!parsed) throw new Error("Road route lookup returned no path");
  return parsed;
}

async function fetchBackendRoadRoute(start: LatLngPoint, end: LatLngPoint): Promise<RoadRouteResult | null> {
  const query = new URLSearchParams({
    fromLat: String(start.lat),
    fromLng: String(start.lng),
    toLat: String(end.lat),
    toLng: String(end.lng)
  });

  try {
    const body = await fetchJsonWithTimeout(buildApiUrl(`/api/map-route?${query.toString()}`), 6_000);
    return parseOsrmRouteResponse(body);
  } catch {
    return null;
  }
}

export async function fetchRoadRoute(start: LatLngPoint, end: LatLngPoint): Promise<RoadRouteResult> {
  const fromLat = Number(start.lat);
  const fromLng = Number(start.lng);
  const toLat = Number(end.lat);
  const toLng = Number(end.lng);
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    throw new Error("Invalid route coordinates");
  }

  const normalizedStart = { lat: fromLat, lng: fromLng };
  const normalizedEnd = { lat: toLat, lng: toLng };

  const fromBackend = await fetchBackendRoadRoute(normalizedStart, normalizedEnd);
  if (fromBackend) return fromBackend;

  return fetchOsrmRouteDirect(normalizedStart, normalizedEnd);
}

/** Snap a multi-stop waypoint list to driving roads (segment by segment). */
export async function fetchRoadTrailThroughWaypoints(
  waypoints: Array<[number, number]>
): Promise<RoadRouteResult> {
  if (waypoints.length < 2) {
    return {
      points: waypoints.map(([lat, lng]) => ({ lat, lng })),
      meters: 0
    };
  }

  const segments: LatLngPoint[] = [];
  let meters = 0;

  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const start = { lat: waypoints[i][0], lng: waypoints[i][1] };
    const end = { lat: waypoints[i + 1][0], lng: waypoints[i + 1][1] };
    try {
      const route = await fetchRoadRoute(start, end);
      meters += route.meters;
      for (const point of route.points) {
        const last = segments[segments.length - 1];
        if (!last || last.lat !== point.lat || last.lng !== point.lng) segments.push(point);
      }
    } catch {
      const fallback = [start, end];
      for (const point of fallback) {
        const last = segments[segments.length - 1];
        if (!last || last.lat !== point.lat || last.lng !== point.lng) segments.push(point);
      }
      meters += polylineLengthMeters(fallback);
    }
  }

  return {
    points: segments.length >= 2 ? segments : waypoints.map(([lat, lng]) => ({ lat, lng })),
    meters
  };
}
