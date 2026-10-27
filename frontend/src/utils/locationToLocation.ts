import { parseTraccarAreaToShape, type LocationGeofence, type LocationShape } from "./locationGeofences";

/**
 * Location to Location report: legs between geofenced locations built from trip
 * start/end points. A leg starts when an asset departs geofence A and ends when a
 * trip finishes inside a different geofence B. Stops outside any geofence on the
 * way are folded into the leg; returning to A without reaching B closes the leg.
 */

export type LocationToLocationTrip = {
  startTime?: string | null;
  endTime?: string | null;
  startLat?: number | string | null;
  startLon?: number | string | null;
  endLat?: number | string | null;
  endLon?: number | string | null;
  /** Metres (Traccar, GPS IoT and CMS 808 trips all report metres). */
  distance?: number | string | null;
  /** Milliseconds. */
  duration?: number | string | null;
  maxSpeed?: number | string | null;
  driverName?: string | null;
};

export type ResolvedGeofence = { id: string; name: string; shape: LocationShape };

export type LocationToLocationLeg = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  departedMs: number;
  arrivedMs: number;
  distanceKm: number;
  /** Arrival minus departure, including en-route stops. */
  durationMs: number;
  drivingMs: number;
  stopsEnRoute: number;
  tripCount: number;
  /** km/h. */
  maxSpeedKph: number;
  driverName: string;
};

/** Points within this many metres of a geofence edge count as inside (GPS jitter at gates). */
const EDGE_TOLERANCE_M = 25;
const EARTH_RADIUS_M = 6_371_000;

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return Number.NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
};

const haversineM = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

const pointInPolygon = (lat: number, lng: number, points: Array<{ lat: number; lng: number }>) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    const crosses = (a.lat > lat) !== (b.lat > lat)
      && lng < ((b.lng - a.lng) * (lat - a.lat)) / (b.lat - a.lat || Number.EPSILON) + a.lng;
    if (crosses) inside = !inside;
  }
  return inside;
};

/** Distance in metres from a point to the nearest polygon edge (flat-earth approximation, fine for gates). */
const distanceToEdgesM = (lat: number, lng: number, points: Array<{ lat: number; lng: number }>) => {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const ax = (points[j].lng - lng) * mPerDegLng;
    const ay = (points[j].lat - lat) * mPerDegLat;
    const bx = (points[i].lng - lng) * mPerDegLng;
    const by = (points[i].lat - lat) * mPerDegLat;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
};

export function pointInShape(lat: number, lng: number, shape: LocationShape, toleranceM = EDGE_TOLERANCE_M): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (shape.type === "circle") {
    return haversineM(lat, lng, shape.center.lat, shape.center.lng) <= shape.radius + toleranceM;
  }
  if (shape.type === "polyline") return false;
  const points = shape.type === "rectangle"
    ? [
        shape.points[0],
        { lat: shape.points[0].lat, lng: shape.points[1].lng },
        shape.points[1],
        { lat: shape.points[1].lat, lng: shape.points[0].lng }
      ]
    : shape.points;
  if (points.length < 3) return false;
  return pointInPolygon(lat, lng, points) || distanceToEdgesM(lat, lng, points) <= toleranceM;
}

/** Area-type geofences only (polylines are routes, not places an asset can be "at"). */
export function resolveGeofenceShapes(locations: LocationGeofence[]): ResolvedGeofence[] {
  const out: ResolvedGeofence[] = [];
  for (const location of locations) {
    const shape = location.shape ?? (location.area ? parseTraccarAreaToShape(location.area) : null);
    if (!shape || shape.type === "polyline") continue;
    const id = String(location.id || location.gpsIotGeoId || location.traccarId || location.name).trim();
    const name = String(location.name || location.description || id).trim();
    if (!id) continue;
    out.push({ id, name, shape });
  }
  return out;
}

/** Smallest matching geofence wins, so a yard inside a larger depot zone resolves to the yard. */
export function findGeofenceAt(lat: unknown, lng: unknown, geofences: ResolvedGeofence[]): ResolvedGeofence | null {
  const pLat = toNumber(lat);
  const pLng = toNumber(lng);
  if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) return null;
  let best: ResolvedGeofence | null = null;
  let bestSize = Number.POSITIVE_INFINITY;
  for (const geofence of geofences) {
    if (!pointInShape(pLat, pLng, geofence.shape)) continue;
    const size = shapeSize(geofence.shape);
    if (size < bestSize) {
      best = geofence;
      bestSize = size;
    }
  }
  return best;
}

const shapeSize = (shape: LocationShape) => {
  if (shape.type === "circle") return Math.PI * shape.radius * shape.radius;
  const points = shape.type === "rectangle" ? shape.points : shape.points;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return (Math.max(...lats) - Math.min(...lats)) * (Math.max(...lngs) - Math.min(...lngs)) * 1e10;
};

const tripDurationMs = (trip: LocationToLocationTrip, startMs: number, endMs: number) => {
  const explicit = toNumber(trip.duration);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs ? endMs - startMs : 0;
};

export function buildLocationToLocationLegs(
  trips: LocationToLocationTrip[],
  geofences: ResolvedGeofence[]
): LocationToLocationLeg[] {
  if (!geofences.length || !trips.length) return [];
  const sorted = trips
    .map((trip) => ({ trip, startMs: Date.parse(String(trip.startTime ?? "")), endMs: Date.parse(String(trip.endTime ?? "")) }))
    .filter((row) => Number.isFinite(row.startMs))
    .sort((a, b) => a.startMs - b.startMs);

  const legs: LocationToLocationLeg[] = [];
  // Geofence the asset is parked in after the previous trip (covers trips whose first fix lands outside the gate).
  let parkedIn: ResolvedGeofence | null = null;
  let leg: (Omit<LocationToLocationLeg, "toId" | "toName" | "arrivedMs" | "durationMs"> & { driverNames: Set<string> }) | null = null;

  for (const { trip, startMs, endMs } of sorted) {
    if (!leg) {
      const origin = findGeofenceAt(trip.startLat, trip.startLon, geofences) ?? parkedIn;
      if (origin) {
        leg = {
          fromId: origin.id,
          fromName: origin.name,
          departedMs: startMs,
          distanceKm: 0,
          drivingMs: 0,
          stopsEnRoute: 0,
          tripCount: 0,
          maxSpeedKph: 0,
          driverName: "",
          driverNames: new Set<string>()
        };
      }
    }

    const destination = findGeofenceAt(trip.endLat, trip.endLon, geofences);
    parkedIn = destination;
    if (!leg) continue;

    leg.distanceKm += Math.max(0, toNumber(trip.distance) || 0) / 1000;
    leg.drivingMs += tripDurationMs(trip, startMs, endMs);
    leg.tripCount += 1;
    // Traccar speeds are knots.
    leg.maxSpeedKph = Math.max(leg.maxSpeedKph, Math.max(0, toNumber(trip.maxSpeed) || 0) * 1.852);
    const driver = String(trip.driverName ?? "").trim();
    if (driver) leg.driverNames.add(driver);

    if (!destination) {
      leg.stopsEnRoute += 1;
      continue;
    }
    if (destination.id !== leg.fromId && Number.isFinite(endMs)) {
      const { driverNames, ...rest } = leg;
      legs.push({
        ...rest,
        toId: destination.id,
        toName: destination.name,
        arrivedMs: endMs,
        durationMs: Math.max(0, endMs - leg.departedMs),
        driverName: [...driverNames].join(", ")
      });
    }
    // Arrived somewhere geofenced (new place or back at origin): the next departure starts a fresh leg.
    leg = null;
  }
  return legs;
}
