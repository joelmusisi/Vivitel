import { describe, expect, it } from "vitest";
import {
  buildCleanFuelTrendLine,
  buildFuelChartModel,
  buildLinearSvgPath,
  buildSmoothSvgPath,
  buildFuelChartLinePreservingGaps,
  buildStableFuelChartLine,
  fuelChartBalances,
  fuelReportAxisBounds,
  fuelReportYTicks,
  holdFuelMeterForMotionAndPower,
  holdLastValidFuelReadings,
  stabilizeFuelTrend,
  type FuelTrendPoint
} from "./fuelTrendStabilizer";

const MINUTE = 60_000;

const series = (
  startMs: number,
  rows: Array<{ minutes: number; liters: number; ignition?: boolean }>
): FuelTrendPoint[] =>
  rows.map((row) => ({
    atMs: startMs + row.minutes * MINUTE,
    liters: row.liters,
    ...(row.ignition === undefined ? {} : { ignition: row.ignition })
  }));

const holdLevels = (points: FuelTrendPoint[]) => holdLastValidFuelReadings(points).map((point) => point.liters);

const smoothedLevels = (points: FuelTrendPoint[]) => stabilizeFuelTrend(points).smoothed.map((point) => point.liters);

describe("holdLastValidFuelReadings", () => {
  it("forward-fills a classic V drop to 0 that snaps back", () => {
    const t0 = Date.parse("2026-09-10T13:00:00.000Z");
    const raw = series(t0, [
      { minutes: 0, liters: 340 },
      { minutes: 10, liters: 339 },
      { minutes: 20, liters: 338 },
      { minutes: 30, liters: 0 },
      { minutes: 32, liters: 0 },
      { minutes: 34, liters: 337 },
      { minutes: 50, liters: 336 }
    ]);

    expect(holdLevels(raw)).toEqual([340, 339, 338, 338, 338, 337, 336]);
  });

  it("holds last valid litres for ignition-off zeros longer than the dropout window", () => {
    const t0 = Date.parse("2026-09-10T16:00:00.000Z");
    const raw = series(t0, [
      { minutes: 0, liters: 342, ignition: true },
      { minutes: 5, liters: 341, ignition: true },
      { minutes: 6, liters: 0, ignition: false },
      { minutes: 20, liters: 0, ignition: false },
      { minutes: 35, liters: 0, ignition: false },
      { minutes: 36, liters: 340, ignition: true },
      { minutes: 45, liters: 339, ignition: true }
    ]);

    const held = holdLastValidFuelReadings(raw);
    expect(held.map((point) => point.liters)).toEqual([342, 341, 341, 341, 341, 340, 339]);
    expect(Math.min(...held.map((point) => point.liters))).toBeGreaterThan(300);
  });

  it("freezes implausible readings in the ignition transition window", () => {
    const t0 = Date.parse("2026-09-10T08:00:00.000Z");
    const raw: FuelTrendPoint[] = [
      { atMs: t0, liters: 250, ignition: true },
      { atMs: t0 + 10 * MINUTE, liters: 248, ignition: true },
      { atMs: t0 + 10 * MINUTE + 20_000, liters: 12, ignition: false },
      { atMs: t0 + 10 * MINUTE + 40_000, liters: 247, ignition: false }
    ];

    expect(holdLevels(raw)).toEqual([250, 248, 248, 247]);
  });

  it("keeps a real refill that settles at a new high", () => {
    const t0 = Date.parse("2026-09-10T09:00:00.000Z");
    const raw = series(t0, [
      { minutes: 0, liters: 200 },
      { minutes: 2, liters: 200 },
      { minutes: 4, liters: 260 },
      { minutes: 6, liters: 340 },
      { minutes: 8, liters: 380 },
      { minutes: 12, liters: 380 },
      { minutes: 20, liters: 379 }
    ]);

    const held = holdLastValidFuelReadings(raw);
    expect(held[held.length - 1].liters).toBeCloseTo(379, 5);
    expect(Math.max(...held.map((point) => point.liters))).toBe(380);
    expect(held.some((point) => point.liters === 200)).toBe(true);
  });

  it("keeps a real theft/drop that stays at the new level", () => {
    const t0 = Date.parse("2026-09-10T11:00:00.000Z");
    const raw = series(t0, [
      { minutes: 0, liters: 340 },
      { minutes: 4, liters: 339 },
      { minutes: 6, liters: 210 },
      { minutes: 10, liters: 208 },
      { minutes: 16, liters: 207 },
      { minutes: 24, liters: 206 }
    ]);

    const held = holdLastValidFuelReadings(raw);
    expect(held[held.length - 1].liters).toBeCloseTo(206, 5);
    expect(held.some((point) => point.liters <= 210)).toBe(true);
  });

  it("holds last valid through calibrated-empty Vs that bounce back (~30 L floor)", () => {
    const t0 = Date.parse("2026-09-10T13:21:00.000Z");
    const raw = series(t0, [
      { minutes: 0, liters: 405 },
      { minutes: 20, liters: 402 },
      { minutes: 180, liters: 398 },
      { minutes: 182, liters: 32 },
      { minutes: 190, liters: 28 },
      { minutes: 198, liters: 394 },
      { minutes: 240, liters: 392 },
      { minutes: 360, liters: 31 },
      { minutes: 372, liters: 29 },
      { minutes: 384, liters: 390 },
      { minutes: 420, liters: 407 }
    ]);

    const held = holdLastValidFuelReadings(raw);
    expect(Math.min(...held.map((point) => point.liters))).toBeGreaterThan(350);
    expect(held.some((point) => point.liters <= 40)).toBe(false);
  });

  it("drops leading false zeros before the first valid level", () => {
    const t0 = Date.parse("2026-09-10T07:00:00.000Z");
    const raw = series(t0, [
      { minutes: 0, liters: 0 },
      { minutes: 1, liters: 0 },
      { minutes: 3, liters: 330 },
      { minutes: 8, liters: 329 }
    ]);

    expect(holdLevels(raw)).toEqual([330, 329]);
  });

  it("drops a leading mid-tank dropout that snaps back to the real level", () => {
    const t0 = Date.parse("2026-09-09T00:00:00.000Z");
    const raw = series(t0, [
      { minutes: 0, liters: 150 },
      { minutes: 1, liters: 148 },
      { minutes: 3, liters: 392 },
      { minutes: 8, liters: 390 },
      { minutes: 20, liters: 388 }
    ]);

    const held = holdLastValidFuelReadings(raw);
    expect(held[0].liters).toBeGreaterThan(350);
    expect(held.every((point) => point.liters > 300)).toBe(true);
  });

  it("holds SHACKMAN-style IO6 collapses that partial-recover then snap back", () => {
    const t0 = Date.parse("2026-08-16T06:00:00.000Z");
    const raw: FuelTrendPoint[] = [
      { atMs: t0, liters: 377, millivolts: 2830, ignition: true, moving: false },
      { atMs: t0 + 4 * MINUTE, liters: 376, millivolts: 2822, ignition: true, moving: false },
      { atMs: t0 + 5 * MINUTE, liters: 23, millivolts: 174, ignition: true, moving: true },
      { atMs: t0 + 8 * MINUTE, liters: 149, millivolts: 1120, ignition: false, moving: false },
      { atMs: t0 + 12 * MINUTE, liters: 294, millivolts: 2209, ignition: true, moving: false },
      { atMs: t0 + 16 * MINUTE, liters: 372, millivolts: 2790, ignition: true, moving: false },
      { atMs: t0 + 24 * MINUTE, liters: 371, millivolts: 2784, ignition: true, moving: false }
    ];

    const held = holdLastValidFuelReadings(raw);
    expect(Math.min(...held.map((point) => point.liters))).toBeGreaterThan(350);
    expect(held.some((point) => point.liters <= 300)).toBe(false);
  });
});

describe("stabilizeFuelTrend dropout validation", () => {
  it("removes a chart V to 0 so the smoothed line never follows the dropout", () => {
    const t0 = Date.parse("2026-09-10T13:50:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 180; minute += 2) {
      const inValley = minute >= 90 && minute <= 96;
      raw.push({
        atMs: t0 + minute * MINUTE,
        liters: inValley ? 0 : 338 - minute * 0.02
      });
    }

    const stabilized = stabilizeFuelTrend(raw);
    expect(Math.min(...smoothedLevels(raw))).toBeGreaterThan(300);
    expect(stabilized.dropCount).toBe(0);
    expect(stabilized.refuelCount).toBe(0);
  });

  it("removes repeated 30 L sensor-floor Vs from a 12-hour-style series", () => {
    const t0 = Date.parse("2026-09-10T13:21:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 720; minute += 2) {
      const inFirstValley = minute >= 180 && minute <= 198;
      const inSecondValley = minute >= 360 && minute <= 384;
      const inThirdValley = minute >= 500 && minute <= 518;
      raw.push({
        atMs: t0 + minute * MINUTE,
        liters: inFirstValley || inSecondValley || inThirdValley ? 30 : 400 - minute * 0.01
      });
    }

    const stabilized = stabilizeFuelTrend(raw);
    expect(Math.min(...smoothedLevels(raw))).toBeGreaterThan(350);
    expect(stabilized.dropCount).toBe(0);
    expect(stabilized.refuelCount).toBe(0);
  });

  it("still reports a parked refill that lasts at least 3 minutes", () => {
    const t0 = Date.parse("2026-09-10T06:00:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 50; minute += 1) {
      let liters = 360;
      if (minute < 15) liters = 190;
      else if (minute < 20) liters = 190 + ((minute - 15) / 5) * 170;
      raw.push({
        atMs: t0 + minute * MINUTE,
        liters,
        ignition: true,
        moving: false
      });
    }

    const stabilized = stabilizeFuelTrend(raw);
    expect(stabilized.refuelCount).toBe(1);
    expect(stabilized.events[0]?.rising).toBe(true);
    expect(stabilized.events[0]?.deltaLiters).toBeGreaterThan(100);
  });

  it("does not treat a rise shorter than 3 minutes as a refill", () => {
    const t0 = Date.parse("2026-09-10T06:00:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 40; minute += 1) {
      raw.push({
        atMs: t0 + minute * MINUTE,
        liters: minute < 12 ? 190 : 360,
        ignition: true,
        moving: false
      });
    }

    const stabilized = stabilizeFuelTrend(raw);
    expect(stabilized.refuelCount).toBe(0);
    expect(stabilized.events.some((event) => event.rising)).toBe(false);
  });

  it("still reports a sustained fuel drop", () => {
    const t0 = Date.parse("2026-09-10T06:00:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 40; minute += 1) {
      raw.push({
        atMs: t0 + minute * MINUTE,
        liters: minute < 12 ? 340 : 200
      });
    }

    const stabilized = stabilizeFuelTrend(raw);
    expect(stabilized.dropCount).toBe(1);
    expect(stabilized.events[0]?.rising).toBe(false);
    expect(Math.abs(stabilized.events[0]?.deltaLiters ?? 0)).toBeGreaterThan(100);
  });
});

describe("buildCleanFuelTrendLine", () => {
  it("returns a sloped line for gradual consumption with noisy spikes", () => {
    const t0 = Date.parse("2026-09-10T08:00:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 120; minute += 1) {
      const base = 390 - minute * 0.25;
      const noise = minute % 7 === 0 ? 35 : minute % 5 === 0 ? -30 : 0;
      raw.push({ atMs: t0 + minute * MINUTE, liters: base + noise });
    }

    const clean = buildCleanFuelTrendLine(raw);
    expect(clean.length).toBeLessThan(raw.length);
    expect(clean.length).toBeLessThanOrEqual(8);
    expect(clean[0].liters).toBeGreaterThan(clean[clean.length - 1].liters);
    expect(clean[clean.length - 1].liters - clean[0].liters).toBeLessThan(-20);
  });

  it("keeps a stepped refuel between sloped segments", () => {
    const t0 = Date.parse("2026-09-10T10:00:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 50; minute += 1) {
      let liters = 360;
      if (minute < 15) liters = 190;
      else if (minute < 20) liters = 190 + ((minute - 15) / 5) * 170;
      raw.push({
        atMs: t0 + minute * MINUTE,
        liters
      });
    }

    const clean = buildCleanFuelTrendLine(raw);
    const levels = clean.map((point) => point.liters);
    expect(clean.length).toBeGreaterThan(2);
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(350);
    expect(Math.min(...levels)).toBeLessThanOrEqual(200);
  });
});

describe("buildStableFuelChartLine", () => {
  it("holds a level through slosh instead of drawing every swing", () => {
    const t0 = Date.parse("2026-09-10T08:00:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 90; minute += 1) {
      const slosh = minute % 2 === 0 ? 28 : -26;
      raw.push({ atMs: t0 + minute * MINUTE, liters: 360 + slosh });
    }

    const chart = buildStableFuelChartLine(raw);
    const levels = chart.map((point) => point.liters);
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(12);
  });

  it("still follows a sustained consume", () => {
    const t0 = Date.parse("2026-09-10T08:00:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 180; minute += 1) {
      raw.push({ atMs: t0 + minute * MINUTE, liters: 400 - minute * 0.4 });
    }

    const chart = buildStableFuelChartLine(raw);
    expect(chart[0].liters).toBeGreaterThan(chart[chart.length - 1].liters + 40);
  });

  it("keeps a settled refill", () => {
    const t0 = Date.parse("2026-09-10T10:00:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 80; minute += 1) {
      const liters = minute < 20 ? 180 : minute < 28 ? 180 + ((minute - 20) / 8) * 180 : 360;
      raw.push({ atMs: t0 + minute * MINUTE, liters });
    }

    const chart = buildStableFuelChartLine(raw);
    const levels = chart.map((point) => point.liters);
    expect(Math.min(...levels)).toBeLessThan(210);
    expect(Math.max(...levels)).toBeGreaterThan(330);
  });

  it("draws a downward slope while moving and ignores fuel added in trip", () => {
    const t0 = Date.parse("2026-09-10T08:00:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 90; minute += 1) {
      const base = 360 - minute * 0.5;
      const liters = minute >= 30 && minute <= 42 ? base + 40 : base;
      raw.push({
        atMs: t0 + minute * MINUTE,
        liters,
        moving: true,
        ignition: true
      });
    }

    const model = buildFuelChartModel(raw);
    const levels = model.line.map((point) => point.liters);
    expect(levels[0]).toBeGreaterThan(levels[levels.length - 1] + 20);
    expect(Math.max(...levels)).toBeLessThan(370);
    expect(model.refills).toHaveLength(0);
    const balances = fuelChartBalances(model);
    expect(balances.addedL).toBe(0);
    expect(balances.consumedL).toBeGreaterThan(20);
    expect(balances.inTankL).toBeCloseTo(levels[levels.length - 1], 1);
  });

  it("keeps a parked refill as added fuel and a separate consumed slope", () => {
    const t0 = Date.parse("2026-09-10T08:00:00.000Z");
    const raw: FuelTrendPoint[] = [];
    for (let minute = 0; minute <= 80; minute += 1) {
      let liters = 200 - minute * 0.4;
      let moving = true;
      if (minute >= 20 && minute < 30) {
        liters = 192;
        moving = false;
      } else if (minute >= 30 && minute < 38) {
        liters = 192 + ((minute - 30) / 8) * 80;
        moving = false;
      } else if (minute >= 38) {
        liters = 272 - (minute - 38) * 0.4;
        moving = minute >= 42;
      }
      raw.push({ atMs: t0 + minute * MINUTE, liters, moving, ignition: true });
    }

    const model = buildFuelChartModel(raw);
    expect(model.refills.length).toBe(1);
    expect(model.refills[0].deltaLiters).toBeGreaterThan(50);
    const balances = fuelChartBalances(model);
    expect(balances.addedL).toBeGreaterThan(50);
    expect(balances.consumedL).toBeGreaterThan(10);
    expect(balances.inTankL).toBeGreaterThan(200);
  });
});

describe("buildLinearSvgPath", () => {
  it("draws straight segments", () => {
    expect(buildLinearSvgPath([
      { x: 0, y: 10 },
      { x: 10, y: 20 }
    ])).toBe("M0.00 10.00 L10.00 20.00");
  });
});

describe("buildFuelChartLinePreservingGaps", () => {
  it("suppresses transient spikes without joining real data gaps", () => {
    const startMs = Date.parse("2026-09-10T08:00:00.000Z");
    const raw: FuelTrendPoint[] = Array.from({ length: 31 }, (_, minute) => ({
      atMs: startMs + minute * MINUTE,
      liters: minute === 15 ? 40 : 100 - minute * 0.1,
      ...(minute === 20 ? { gapBefore: true } : {})
    }));

    const line = buildFuelChartLinePreservingGaps(raw);
    expect(Math.min(...line.map((point) => point.liters))).toBeGreaterThan(95);
    expect(line.some((point) => point.gapBefore)).toBe(true);
  });

  it("keeps a falling fuel trend while suppressing repeated short sensor collapses", () => {
    const startMs = Date.parse("2026-09-10T08:00:00.000Z");
    const raw: FuelTrendPoint[] = Array.from({ length: 121 }, (_, minute) => {
      const baseline = 340 - minute * 0.3;
      const collapsed =
        (minute >= 30 && minute <= 34)
        || (minute >= 65 && minute <= 69)
        || (minute >= 96 && minute <= 100);
      return {
        atMs: startMs + minute * MINUTE,
        liters: collapsed ? 90 : baseline
      };
    });

    const line = buildFuelChartLinePreservingGaps(raw);
    expect(Math.min(...line.map((point) => point.liters))).toBeGreaterThan(295);
    expect(line[0].liters).toBeGreaterThan(line[line.length - 1].liters);
    expect(line.length).toBeLessThan(10);
  });
});

describe("fuelReportAxisBounds", () => {
  it("starts at 0 and uses tank capacity as a round ceiling", () => {
    expect(fuelReportAxisBounds([352, 368], 400)).toEqual({ min: 0, max: 400 });
  });

  it("does not zoom into a tight data band when capacity is unknown", () => {
    expect(fuelReportAxisBounds([320, 375])).toEqual({ min: 0, max: 400 });
  });

  it("builds even litre ticks from zero", () => {
    expect(fuelReportYTicks(600)).toEqual([0, 100, 200, 300, 400, 500, 600]);
  });
});

describe("buildSmoothSvgPath", () => {
  it("builds a cubic path for three or more points", () => {
    const path = buildSmoothSvgPath([
      { x: 0, y: 10 },
      { x: 10, y: 20 },
      { x: 20, y: 12 }
    ]);
    expect(path.startsWith("M0.00 10.00")).toBe(true);
    expect(path).toContain(" C");
  });
});

describe("holdFuelMeterForMotionAndPower", () => {
  it("does not freeze ignition-on driving so a real consume still appears", () => {
    const t0 = Date.parse("2026-09-10T08:00:00.000Z");
    const raw: FuelTrendPoint[] = [
      { atMs: t0, liters: 300, millivolts: 18000, ignition: true, moving: false },
      { atMs: t0 + 2 * MINUTE, liters: 298, millivolts: 17900, ignition: true, moving: false },
      { atMs: t0 + 4 * MINUTE, liters: 290, millivolts: 17400, ignition: true, moving: true },
      { atMs: t0 + 6 * MINUTE, liters: 282, millivolts: 16900, ignition: true, moving: true },
      { atMs: t0 + 8 * MINUTE, liters: 274, millivolts: 16400, ignition: true, moving: true }
    ];

    const held = holdFuelMeterForMotionAndPower(raw).map((point) => point.liters);
    expect(held[0]).toBe(300);
    expect(held[held.length - 1]).toBe(274);
  });

  it("holds litres while power is cut off until analogue voltage changes", () => {
    const t0 = Date.parse("2026-09-10T08:00:00.000Z");
    const raw: FuelTrendPoint[] = [
      { atMs: t0, liters: 300, millivolts: 18000, ignition: true, powerCutoff: false },
      { atMs: t0 + 2 * MINUTE, liters: 0, millivolts: 0, ignition: false, powerCutoff: true },
      { atMs: t0 + 8 * MINUTE, liters: 0, millivolts: 0, ignition: false, powerCutoff: true },
      { atMs: t0 + 10 * MINUTE, liters: 298, millivolts: 18020, ignition: true, powerCutoff: false },
      { atMs: t0 + 14 * MINUTE, liters: 380, millivolts: 24000, ignition: true, powerCutoff: false }
    ];

    const held = holdFuelMeterForMotionAndPower(raw).map((point) => point.liters);
    expect(held).toEqual([300, 300, 300, 300, 380]);
  });
});
