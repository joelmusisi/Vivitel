import { describe, expect, it } from "vitest";
import { buildTachoPoints, tachoAxisMax, thinTachoPathPoints, toRpmRevPerSec } from "./tachoSeries";

describe("tacho series", () => {
  it("keeps engine rpm on the chart instead of crushing it onto the axis", () => {
    expect(toRpmRevPerSec(1800)).toBeCloseTo(30);
    expect(toRpmRevPerSec("2400 rpm")).toBeCloseTo(40);
    expect(toRpmRevPerSec(25)).toBe(25);
    expect(toRpmRevPerSec(0)).toBeNull();
  });

  it("scales the axis to the samples", () => {
    expect(tachoAxisMax(0, 140)).toBe(140);
    expect(tachoAxisMax(8, 140)).toBeCloseTo(9.2);
    expect(tachoAxisMax(80, 140)).toBeCloseTo(92);
  });

  it("uses the distance between track points when reported speed is empty", () => {
    const points = buildTachoPoints([
      { atMs: 0, lat: 0, lng: 0, speedKph: 0 },
      { atMs: 10 * 60_000, lat: 0.08, lng: 0, speedKph: 0 }
    ]);
    expect(points[1]?.speedKph).toBeGreaterThan(20);
    expect(points[1]?.rpmRevPerSec).toBeGreaterThan(5);
  });

  it("keeps a reported driving speed", () => {
    const points = buildTachoPoints([
      { atMs: 0, lat: 0, lng: 0, speedKph: 48, rpm: 1500 },
      { atMs: 60_000, lat: 0.001, lng: 0, speedKph: 52, rpm: 1600 }
    ]);
    expect(points[1]?.speedKph).toBe(52);
    expect(points[1]?.rpmRevPerSec).toBeCloseTo(1600 / 60);
  });

  it("thins a dense track for the drawn line", () => {
    const dense = Array.from({ length: 2000 }, (_, index) => ({
      atMs: index * 1000,
      speedKph: index % 40,
      rpmRevPerSec: (index % 30) / 2
    }));
    const thinned = thinTachoPathPoints(dense, 720);
    expect(thinned.length).toBeLessThan(dense.length);
    expect(thinned.length).toBeGreaterThan(100);
    expect(thinned[0]?.atMs).toBe(0);
    expect(thinned[thinned.length - 1]?.atMs).toBe(dense[dense.length - 1]?.atMs);
  });
});
