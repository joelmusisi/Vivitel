import { describe, expect, it } from "vitest";
import type { TraccarRoutePoint } from "./api";
import type { FuelChangePoint } from "./fuelTrendStabilizer";
import {
  computeIgnitionCycleUsedFuelLitres,
  extractFuelStartStopFromRoute,
  filterFuelChangePointsForMotion,
  isFuelAddedInTrip,
  isRapidFuelChangeWhileMoving
} from "./traccarFuel";

const point = (overrides: Partial<TraccarRoutePoint> & { fixTime: string }): TraccarRoutePoint => ({
  id: 0,
  deviceId: 0,
  protocol: "osmand",
  deviceTime: overrides.fixTime,
  serverTime: overrides.fixTime,
  valid: true,
  latitude: -26.2,
  longitude: 28.0,
  altitude: 0,
  speed: 0,
  course: 0,
  address: null,
  accuracy: 0,
  network: {},
  geofenceIds: [],
  attributes: {},
  ...overrides
});

describe("motion fuel gate (≥2 L / 10 s while moving)", () => {
  it("ignores rapid fuel swings while the asset is moving", () => {
    const t0 = Date.parse("2026-07-27T10:00:00.000Z");
    const route: TraccarRoutePoint[] = [
      point({
        fixTime: new Date(t0).toISOString(),
        speed: 20,
        attributes: { fuel: 100, ignition: true, motion: true }
      }),
      point({
        fixTime: new Date(t0 + 5_000).toISOString(),
        speed: 22,
        attributes: { fuel: 94, ignition: true, motion: true }
      }),
      point({
        fixTime: new Date(t0 + 9_000).toISOString(),
        speed: 21,
        attributes: { fuel: 97, ignition: true, motion: true }
      })
    ];

    const event: FuelChangePoint = {
      atMs: t0 + 9_000,
      liters: 97,
      deltaLiters: -6,
      rising: false,
      fromLevel: 100,
      toLevel: 94
    };

    expect(isRapidFuelChangeWhileMoving(route, event)).toBe(true);
    expect(filterFuelChangePointsForMotion([event], route)).toHaveLength(0);
  });

  it("keeps the same swing when the asset is parked/stationary", () => {
    const t0 = Date.parse("2026-07-27T10:00:00.000Z");
    const route: TraccarRoutePoint[] = [
      point({
        fixTime: new Date(t0).toISOString(),
        speed: 0,
        attributes: { fuel: 100, ignition: false, motion: false }
      }),
      point({
        fixTime: new Date(t0 + 5_000).toISOString(),
        speed: 0,
        attributes: { fuel: 88, ignition: false, motion: false }
      })
    ];

    const event: FuelChangePoint = {
      atMs: t0 + 5_000,
      liters: 88,
      deltaLiters: -12,
      rising: false,
      fromLevel: 100,
      toLevel: 88
    };

    expect(isRapidFuelChangeWhileMoving(route, event)).toBe(false);
    expect(filterFuelChangePointsForMotion([event], route)).toEqual([event]);
  });

  it("does not treat fuel added while the asset is in trip as a refill", () => {
    const t0 = Date.parse("2026-07-27T11:00:00.000Z");
    const route: TraccarRoutePoint[] = [];
    for (let second = 0; second <= 5 * 60; second += 30) {
      route.push(
        point({
          fixTime: new Date(t0 + second * 1000).toISOString(),
          speed: 35,
          attributes: { fuel: 80 + second / 30, ignition: true, motion: true }
        })
      );
    }
    const event: FuelChangePoint = {
      atMs: t0 + 60_000,
      liters: 100,
      deltaLiters: 18,
      rising: true,
      fromLevel: 82,
      toLevel: 100
    };
    expect(isFuelAddedInTrip(route, event)).toBe(true);
    expect(filterFuelChangePointsForMotion([event], route)).toHaveLength(0);
  });

  it("keeps fuel added while the asset is stopped", () => {
    const t0 = Date.parse("2026-07-27T11:00:00.000Z");
    const route: TraccarRoutePoint[] = [];
    for (let second = 0; second <= 5 * 60; second += 30) {
      route.push(
        point({
          fixTime: new Date(t0 + second * 1000).toISOString(),
          speed: 0,
          attributes: { fuel: 80, ignition: true, motion: false }
        })
      );
    }
    const event: FuelChangePoint = {
      atMs: t0 + 60_000,
      liters: 140,
      deltaLiters: 60,
      rising: true,
      fromLevel: 80,
      toLevel: 140
    };
    expect(isFuelAddedInTrip(route, event)).toBe(false);
    expect(filterFuelChangePointsForMotion([event], route)).toEqual([event]);
  });
});

describe("Fuel Start Stop from ignition", () => {
  it("records fuel start on every ignition on and stop on ignition off", () => {
    const t0 = Date.parse("2026-07-27T08:00:00.000Z");
    const route: TraccarRoutePoint[] = [
      point({
        fixTime: new Date(t0).toISOString(),
        attributes: { fuel: 200, ignition: false }
      }),
      point({
        fixTime: new Date(t0 + 60_000).toISOString(),
        attributes: { fuel: 198, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 30 * 60_000).toISOString(),
        attributes: { fuel: 180, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 31 * 60_000).toISOString(),
        attributes: { fuel: 179, ignition: false }
      }),
      point({
        fixTime: new Date(t0 + 40 * 60_000).toISOString(),
        attributes: { fuel: 179, ignition: true }
      })
    ];

    const rows = extractFuelStartStopFromRoute({ routePoints: route });
    expect(rows).toHaveLength(2);

    expect(rows[0].ignitionOnAtMs).toBe(t0 + 60_000);
    expect(rows[0].fuelStartLitres).toBe(198);
    expect(rows[0].ignitionOffAtMs).toBe(t0 + 31 * 60_000);
    expect(rows[0].fuelStopLitres).toBe(179);
    expect(rows[0].usedLitres).toBe(19);

    expect(rows[1].ignitionOnAtMs).toBe(t0 + 40 * 60_000);
    expect(rows[1].fuelStartLitres).toBe(179);
    expect(rows[1].ignitionOffAtMs).toBeUndefined();
    expect(rows[1].fuelStopLitres).toBeUndefined();
  });
});

describe("computeIgnitionCycleUsedFuelLitres", () => {
  it("uses the level 5s after ignition on through ignition off, ignoring the key-on dip and slosh", () => {
    const t0 = Date.parse("2026-10-04T03:20:05.000Z");
    const route: TraccarRoutePoint[] = [
      point({
        fixTime: new Date(t0).toISOString(),
        attributes: { fuel: 120, ignition: false }
      }),
      point({
        fixTime: new Date(t0 + 10_000).toISOString(),
        attributes: { fuel: 18, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 16_000).toISOString(),
        attributes: { fuel: 100, ignition: true }
      })
    ];

    for (let second = 30; second <= 20 * 60; second += 30) {
      const slosh = second % 60 === 0 ? -24 : 22;
      route.push(
        point({
          fixTime: new Date(t0 + second * 1000).toISOString(),
          speed: 40,
          attributes: { fuel: 90 + slosh, ignition: true, motion: true }
        })
      );
    }

    route.push(
      point({
        fixTime: new Date(t0 + 21 * 60_000).toISOString(),
        attributes: { fuel: 70, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 22 * 60_000).toISOString(),
        attributes: { fuel: 68, ignition: false }
      })
    );

    expect(computeIgnitionCycleUsedFuelLitres({ routePoints: route })).toBe(32);
  });

  it("does not treat a dead sender at key-off as burned fuel", () => {
    const t0 = Date.parse("2026-10-04T06:00:00.000Z");
    const route: TraccarRoutePoint[] = [
      point({
        fixTime: new Date(t0).toISOString(),
        attributes: { fuel: 80, ignition: false }
      }),
      point({
        fixTime: new Date(t0 + 1_000).toISOString(),
        attributes: { fuel: 12, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 8_000).toISOString(),
        attributes: { fuel: 90, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 30 * 60_000).toISOString(),
        attributes: { fuel: 74, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 31 * 60_000).toISOString(),
        attributes: { fuel: 3, ignition: false }
      })
    ];

    expect(computeIgnitionCycleUsedFuelLitres({ routePoints: route })).toBe(16);
  });

  it("sums each ignition cycle and skips a crank shorter than 5 seconds", () => {
    const t0 = Date.parse("2026-10-04T08:00:00.000Z");
    const route: TraccarRoutePoint[] = [
      point({
        fixTime: new Date(t0).toISOString(),
        attributes: { fuel: 50, ignition: false }
      }),
      point({
        fixTime: new Date(t0 + 1_000).toISOString(),
        attributes: { fuel: 50, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 3_000).toISOString(),
        attributes: { fuel: 10, ignition: false }
      }),
      point({
        fixTime: new Date(t0 + 60_000).toISOString(),
        attributes: { fuel: 50, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 70_000).toISOString(),
        attributes: { fuel: 48, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 40 * 60_000).toISOString(),
        attributes: { fuel: 40, ignition: false }
      }),
      point({
        fixTime: new Date(t0 + 50 * 60_000).toISOString(),
        attributes: { fuel: 40, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 56 * 60_000).toISOString(),
        attributes: { fuel: 36, ignition: true }
      })
    ];

    // Crank off before 5s is ignored. Second cycle starts at the +70s sample (48 L) and ends at 40 L.
    // Third cycle's settled sample is also its last sample, so it adds nothing.
    expect(computeIgnitionCycleUsedFuelLitres({ routePoints: route })).toBe(8);
  });

  it("returns null when ignition is not reported", () => {
    const t0 = Date.parse("2026-10-04T08:00:00.000Z");
    const route: TraccarRoutePoint[] = [
      point({
        fixTime: new Date(t0).toISOString(),
        attributes: { fuel: 80 }
      }),
      point({
        fixTime: new Date(t0 + 60_000).toISOString(),
        attributes: { fuel: 70 }
      })
    ];
    expect(computeIgnitionCycleUsedFuelLitres({ routePoints: route })).toBeNull();
  });

  it("adds mid-run refill litres back into fuel used", () => {
    const t0 = Date.parse("2026-10-04T09:00:00.000Z");
    const route: TraccarRoutePoint[] = [
      point({
        fixTime: new Date(t0).toISOString(),
        attributes: { fuel: 100, ignition: false }
      }),
      point({
        fixTime: new Date(t0 + 1_000).toISOString(),
        attributes: { fuel: 100, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 8_000).toISOString(),
        attributes: { fuel: 100, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 20 * 60_000).toISOString(),
        attributes: { fuel: 80, ignition: true }
      }),
      // Fill while still ignited: tank rises from 80 → 160
      point({
        fixTime: new Date(t0 + 25 * 60_000).toISOString(),
        attributes: { fuel: 160, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 40 * 60_000).toISOString(),
        attributes: { fuel: 140, ignition: true }
      }),
      point({
        fixTime: new Date(t0 + 41 * 60_000).toISOString(),
        attributes: { fuel: 140, ignition: false }
      })
    ];

    // Net drop alone would be max(0, 100 - 140) = 0. With the 80 L refill added back → 40 used
    // (20 before fill + 20 after fill).
    expect(
      computeIgnitionCycleUsedFuelLitres({
        routePoints: route,
        refillEvents: [{ atMs: t0 + 25 * 60_000, deltaLiters: 80, rising: true }]
      })
    ).toBe(40);
  });
});
