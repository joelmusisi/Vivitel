import { describe, expect, it } from "vitest";
import {
  buildFuelTrendFromRoute,
  computeFuelLitersFromAnalog,
  computePeriodConsumedFuelLitres,
  extractFuelLitersFromAttributes,
  extractFuelLitersFromPayload,
  extractFuelLitersFromTraccarLivePosition,
  formatFuelReadingFromBinding,
  readDeviceFuelConfig
} from "./traccarFuel";
import type { TraccarRoutePoint } from "./api";

describe("device fuel config + analog fallback", () => {
  const config = readDeviceFuelConfig({
    viviFuelAnalogInput: "IO6",
    viviFuelTankCapacity: "420",
    viviFuelAnalogMvMax: "3000"
  });

  it("reads viviFuel* device attributes", () => {
    expect(config).toEqual({
      analogInput: "IO6",
      tankCapacity: 420,
      maxVoltage: 3000,
      inputMvMax: 3000
    });
  });

  it("falls back to a litres alias when the primary live value is None", () => {
    expect(extractFuelLitersFromPayload({ fuel: "None", fuelLiters: 187.5 })).toBe(187.5);
  });

  it("reads fuel litres from named telemetry fields", () => {
    expect(extractFuelLitersFromPayload({ telemetryLatest: { io: { "Fuel Level (L)": 214.25 } } })).toBe(214.25);
  });

  it("computes litres from analogue mV when fuelLevel is missing", () => {
    // (420 * 1000) / 3000 = 140
    const liters = computeFuelLitersFromAnalog({ io6: 1000 }, config);
    expect(liters).toBeCloseTo(140, 5);
  });

  it("extracts fuel from attributes via analog fallback", () => {
    // (420 * 500) / 3000 = 70
    expect(extractFuelLitersFromAttributes({ io6: 500 }, {}, config)).toBeCloseTo(70, 5);
    // (420 * 0) / 3000 = 0
    expect(extractFuelLitersFromTraccarLivePosition({ attributes: { io6: 0 } }, config)).toBe(0);
  });

  it("prefers explicit fuelLevel over analog", () => {
    expect(
      extractFuelLitersFromAttributes({ fuelLevel: 211, io6: 500 }, {}, config)
    ).toBe(211);
  });

  it("skips a zero fuelLevel sentinel when analogue mV is present", () => {
    // (420 * 1500) / 3000 = 210 — must not stay stuck on computed fuelLevel: 0
    expect(
      extractFuelLitersFromAttributes({ fuelLevel: 0, io6: 1500 }, {}, config)
    ).toBeCloseTo(210, 5);
    expect(
      extractFuelLitersFromAttributes({ fuel: 0, io6: 1500 }, {}, config)
    ).toBeCloseTo(210, 5);
  });

  it("omits zero fuelLevel when analogue is configured but mV is missing", () => {
    expect(
      extractFuelLitersFromAttributes({ fuelLevel: 0, ignition: false }, {}, config)
    ).toBeUndefined();
  });

  it("never treats Teltonika ignition/motion IO as fuel litres", () => {
    expect(extractFuelLitersFromAttributes({ io239: 1, io240: 1 }, {})).toBeUndefined();
    // Falls through to analog when present
    expect(extractFuelLitersFromAttributes({ io239: 1, io6: 1500 }, {}, config)).toBeCloseTo(210, 5);
  });

  it("converts AVL fuel level percent (io48) using tank capacity", () => {
    expect(
      extractFuelLitersFromAttributes({ io48: 50 }, {}, config)
    ).toBeCloseTo(210, 5);
  });

  it("uses Min mV as max voltage when Max mV is unset", () => {
    const inverted = readDeviceFuelConfig({
      viviFuelAnalogInput: "IO6",
      viviFuelTankCapacity: "400",
      viviFuelAnalogMvMin: "35000",
      viviFuelAnalogMvMax: "0"
    });
    expect(inverted?.maxVoltage).toBe(35000);
    expect(computeFuelLitersFromAnalog({ io6: 17500 }, inverted)).toBeCloseTo(200, 5);
  });

  it("builds tacho trend points from route io readings", () => {
    const route = [
      {
        fixTime: "2026-07-27T10:00:00.000Z",
        latitude: 1,
        longitude: 1,
        attributes: { io6: 1000 }
      },
      {
        fixTime: "2026-07-27T11:00:00.000Z",
        latitude: 1.01,
        longitude: 1.01,
        attributes: { io6: 1200 }
      }
    ] as unknown as TraccarRoutePoint[];

    const trend = buildFuelTrendFromRoute(route, config);
    expect(trend).toHaveLength(2);
    expect(trend[0].liters).toBeCloseTo(140, 5);
    expect(trend[1].liters).toBeCloseTo(168, 5);
  });

  it("drops ignition-off readings so they cannot create false zero fuel points", () => {
    const route = [
      {
        fixTime: "2026-07-27T10:00:00.000Z",
        latitude: 1,
        longitude: 1,
        attributes: { fuelLevel: 340, ignition: true }
      },
      {
        fixTime: "2026-07-27T10:05:00.000Z",
        latitude: 1,
        longitude: 1,
        attributes: { fuelLevel: 0, ignition: false }
      },
      {
        fixTime: "2026-07-27T10:10:00.000Z",
        latitude: 1,
        longitude: 1,
        attributes: { fuelLevel: 338, ignition: true }
      }
    ] as unknown as TraccarRoutePoint[];

    const trend = buildFuelTrendFromRoute(route);
    expect(trend).toHaveLength(2);
    expect(trend[0]).toMatchObject({ liters: 340, ignition: true });
    expect(trend[1]).toMatchObject({ liters: 338, ignition: true });
  });

  it("prefers the mobile-device calibration chart over a stale fuelLevel", () => {
    const chartConfig = readDeviceFuelConfig({
      viviFuelAnalogInput: "IO6",
      viviFuelTankCapacity: "400",
      viviFuelAnalogMvMax: "28000",
      viviFuelCalibration: JSON.stringify([
        { mv: 200, liters: 0 },
        { mv: 8000, liters: 80 },
        { mv: 28000, liters: 400 }
      ])
    });
    expect(
      extractFuelLitersFromAttributes({ fuelLevel: 211, io6: 8000 }, {}, chartConfig)
    ).toBeCloseTo(80, 5);
    expect(formatFuelReadingFromBinding({ fuel: "None", io6: 8000 }, chartConfig)).toBe("80.00");
  });

  it("attaches analogue millivolts from the calibrated sender", () => {
    const route = [
      {
        fixTime: "2026-07-27T10:00:00.000Z",
        latitude: 1,
        longitude: 1,
        speed: 0,
        attributes: { io6: 8000, ignition: true, motion: false }
      }
    ] as unknown as TraccarRoutePoint[];
    const trend = buildFuelTrendFromRoute(route, config);
    expect(trend[0]?.millivolts).toBe(8000);
    expect(trend[0]?.moving).toBe(false);
  });
});

describe("computePeriodConsumedFuelLitres", () => {
  it("sums consumption across overnight gaps instead of one net start/end", () => {
    const day = 24 * 60 * 60 * 1000;
    const t0 = Date.parse("2026-09-08T06:00:00.000Z");
    const trend = [
      { atMs: t0, liters: 400 },
      { atMs: t0 + 8 * 60 * 60 * 1000, liters: 200 },
      { atMs: t0 + day, liters: 400 },
      { atMs: t0 + day + 8 * 60 * 60 * 1000, liters: 220 }
    ];
    const netWindow = Math.max(0, trend[0].liters - trend[trend.length - 1].liters);
    expect(netWindow).toBe(180);
    expect(computePeriodConsumedFuelLitres({ trendPoints: trend })).toBe(380);
  });

  it("adds observed refills inside a contiguous segment", () => {
    const t0 = Date.parse("2026-09-08T06:00:00.000Z");
    const trend = [
      { atMs: t0, liters: 200 },
      { atMs: t0 + 4 * 60 * 60 * 1000, liters: 380 }
    ];
    expect(
      computePeriodConsumedFuelLitres({
        trendPoints: trend,
        refillEvents: [{ atMs: t0 + 2 * 60 * 60 * 1000, deltaLiters: 220, rising: true }]
      })
    ).toBe(40);
  });

  it("does not treat a leading dropout as the period start", () => {
    const t0 = Date.parse("2026-09-09T00:00:00.000Z");
    const hour = 60 * 60 * 1000;
    const trend = [
      { atMs: t0, liters: 150 },
      { atMs: t0 + 5 * 60 * 1000, liters: 392 },
      { atMs: t0 + 24 * hour, liters: 380 },
      { atMs: t0 + 48 * hour, liters: 370 }
    ];
    expect(
      computePeriodConsumedFuelLitres({
        trendPoints: trend,
        refillEvents: [
          { atMs: t0 + 30 * hour, deltaLiters: 154.25, rising: true }
        ]
      })
    ).toBeCloseTo(392 - 370 + 154.25, 0);
  });

  it("24h cumulative fuel used is at least the nested 12h window", () => {
    const t0 = Date.parse("2026-10-03T15:00:00.000Z");
    const hour = 60 * 60 * 1000;
    // First 12h: mostly flat after a small drop. Second 12h: larger drop (~50 L).
    const full24h = [
      { atMs: t0, liters: 105 },
      { atMs: t0 + 1 * hour, liters: 90 },
      { atMs: t0 + 12 * hour, liters: 135 },
      { atMs: t0 + 14 * hour, liters: 110 },
      { atMs: t0 + 18 * hour, liters: 95 },
      { atMs: t0 + 24 * hour, liters: 84 }
    ];
    const last12h = full24h.filter((point) => point.atMs >= t0 + 12 * hour);
    const used12 = computePeriodConsumedFuelLitres({ trendPoints: last12h });
    const used24 = computePeriodConsumedFuelLitres({ trendPoints: full24h });
    expect(used12).toBeGreaterThan(40);
    expect(used24).toBeGreaterThanOrEqual(used12);
  });
});
