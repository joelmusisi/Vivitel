import { describe, expect, it } from "vitest";
import {
  buildLocationToLocationLegs,
  findGeofenceAt,
  pointInShape,
  resolveGeofenceShapes,
  type ResolvedGeofence
} from "./locationToLocation";

const depot: ResolvedGeofence = { id: "1", name: "Depot", shape: { type: "circle", center: { lat: 0.3, lng: 32.5 }, radius: 200 } };
const quarry: ResolvedGeofence = {
  id: "2",
  name: "Quarry",
  shape: { type: "rectangle", points: [{ lat: 0.4, lng: 32.6 }, { lat: 0.41, lng: 32.61 }] }
};
const geofences = [depot, quarry];

describe("location to location geometry", () => {
  it("matches circles with an edge tolerance", () => {
    expect(pointInShape(0.3, 32.5, depot.shape)).toBe(true);
    // ~210 m east of centre: outside 200 m radius but within 25 m gate tolerance.
    expect(pointInShape(0.3, 32.50189, depot.shape)).toBe(true);
    expect(pointInShape(0.31, 32.5, depot.shape)).toBe(false);
  });

  it("parses Traccar WKT areas when no shape is stored", () => {
    const resolved = resolveGeofenceShapes([
      { id: "9", name: "Yard", type: "Geofence", area: "CIRCLE (0.5 32.7, 100)" },
      { id: "10", name: "Road", type: "Geofence", area: "LINESTRING (0 0, 1 1)" }
    ]);
    expect(resolved.map((row) => row.name)).toEqual(["Yard"]);
    expect(findGeofenceAt(0.5, 32.7, resolved)?.id).toBe("9");
  });
});

describe("buildLocationToLocationLegs", () => {
  it("joins trips with an unfenced stop into one leg from A to B", () => {
    const legs = buildLocationToLocationLegs([
      { startTime: "2026-10-01T06:00:00Z", endTime: "2026-10-01T06:30:00Z", startLat: 0.3, startLon: 32.5, endLat: 0.35, endLon: 32.55, distance: 8000, duration: 1_800_000, maxSpeed: 40, driverName: "Ann" },
      { startTime: "2026-10-01T07:00:00Z", endTime: "2026-10-01T07:20:00Z", startLat: 0.35, startLon: 32.55, endLat: 0.405, endLon: 32.605, distance: 7000, duration: 1_200_000, maxSpeed: 50, driverName: "Ann" }
    ], geofences);
    expect(legs).toHaveLength(1);
    const leg = legs[0];
    expect(leg.fromName).toBe("Depot");
    expect(leg.toName).toBe("Quarry");
    expect(leg.distanceKm).toBeCloseTo(15);
    expect(leg.durationMs).toBe(80 * 60_000);
    expect(leg.drivingMs).toBe(50 * 60_000);
    expect(leg.stopsEnRoute).toBe(1);
    expect(leg.maxSpeedKph).toBeCloseTo(50 * 1.852);
    expect(leg.driverName).toBe("Ann");
  });

  it("uses the parked geofence when the next trip's first fix is outside the gate", () => {
    const legs = buildLocationToLocationLegs([
      { startTime: "2026-10-01T06:00:00Z", endTime: "2026-10-01T06:30:00Z", startLat: 0.405, startLon: 32.605, endLat: 0.3, endLon: 32.5, distance: 15000 },
      { startTime: "2026-10-01T08:00:00Z", endTime: "2026-10-01T08:40:00Z", startLat: 0.32, startLon: 32.52, endLat: 0.405, endLon: 32.605, distance: 14000 }
    ], geofences);
    expect(legs.map((leg) => `${leg.fromName}->${leg.toName}`)).toEqual(["Quarry->Depot", "Depot->Quarry"]);
    expect(legs[1].departedMs).toBe(Date.parse("2026-10-01T08:00:00Z"));
  });

  it("drops round trips back to the origin and trips that never reach a geofence", () => {
    const legs = buildLocationToLocationLegs([
      { startTime: "2026-10-01T06:00:00Z", endTime: "2026-10-01T06:30:00Z", startLat: 0.3, startLon: 32.5, endLat: 0.35, endLon: 32.55, distance: 8000 },
      { startTime: "2026-10-01T07:00:00Z", endTime: "2026-10-01T07:30:00Z", startLat: 0.35, startLon: 32.55, endLat: 0.3, endLon: 32.5, distance: 8000 },
      { startTime: "2026-10-01T09:00:00Z", endTime: "2026-10-01T09:30:00Z", startLat: 0.3, startLon: 32.5, endLat: 0.35, endLon: 32.55, distance: 8000 }
    ], geofences);
    expect(legs).toEqual([]);
  });
});
