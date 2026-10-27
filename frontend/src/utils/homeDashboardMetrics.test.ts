import { describe, expect, it } from "vitest";
import { homeRangeFromPreset } from "./homeDashboardApi";
import { distributeDeviceFuel } from "./homeFuelMetrics";
import { tripDistanceKm } from "./homeRangeMetrics";
import {
  dayKeyInZone,
  homeRangeBounds,
  homeTimelineBucketKey,
  sameDayStandingMs,
  zonedMidnightMs
} from "./homeTimeline";

const DAR = "Africa/Dar_es_Salaam"; // UTC+3, no DST

describe("home dashboard site time zone", () => {
  it("assigns a late-evening UTC timestamp to the next site-local day", () => {
    expect(dayKeyInZone(Date.parse("2026-10-21T22:30:00Z"), DAR)).toBe("2026-10-22");
    expect(dayKeyInZone(Date.parse("2026-10-21T20:30:00Z"), DAR)).toBe("2026-10-21");
  });

  it("builds the report window from site-local midnight to end of day", () => {
    const bounds = homeRangeBounds("2026-10-22", "2026-10-22", DAR);
    expect(bounds.from).toBe("2026-10-21T21:00:00.000Z");
    expect(bounds.to).toBe("2026-10-22T20:59:59.999Z");
  });

  it("handles a DST change day", () => {
    // London switches to BST at 01:00 UTC on 29 March 2026; midnight is still GMT.
    expect(new Date(zonedMidnightMs("2026-03-29", "Europe/London")).toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(new Date(zonedMidnightMs("2026-03-30", "Europe/London")).toISOString()).toBe("2026-03-29T23:00:00.000Z");
  });

  it("buckets by the site day for day and week modes", () => {
    const late = new Date("2026-10-21T22:30:00Z"); // Thu 22 Oct in Dar
    expect(homeTimelineBucketKey(late, "day", DAR)).toBe("2026-10-22");
    expect(homeTimelineBucketKey(late, "week", DAR)).toBe("2026-10-19");
    expect(homeTimelineBucketKey(late, "month", DAR)).toBe("2026-10");
  });
});

describe("home dashboard standing time", () => {
  it("counts a stop between trips on the same day", () => {
    const end = Date.parse("2026-10-22T06:00:00Z");
    const next = Date.parse("2026-10-22T07:30:00Z");
    expect(sameDayStandingMs(end, next, DAR)).toBe(90 * 60_000);
  });

  it("does not count overnight parking", () => {
    const end = Date.parse("2026-10-22T15:00:00Z"); // 18:00 Dar
    const next = Date.parse("2026-10-23T04:00:00Z"); // 07:00 Dar next day
    expect(sameDayStandingMs(end, next, DAR)).toBe(0);
  });

  it("ignores missing or out-of-order times", () => {
    expect(sameDayStandingMs(Number.NaN, 1, DAR)).toBe(0);
    expect(sameDayStandingMs(2_000, 1_000, DAR)).toBe(0);
  });
});

describe("home dashboard totals", () => {
  it("always reads trip distance as metres", () => {
    expect(tripDistanceKm({ distance: 600 })).toBe(0.6);
    expect(tripDistanceKm({ distance: 12_500 })).toBe(12.5);
    expect(tripDistanceKm({ distance: -5 })).toBe(0);
  });

  it("spreads a vehicle's fuel so the chart sums to the total", () => {
    const byFuel = distributeDeviceFuel(30, [
      { startMs: 1, fuelL: 4, distanceKm: 10 },
      { startMs: 2, fuelL: 6, distanceKm: 90 }
    ]);
    expect(byFuel.map((row) => row.fuelL)).toEqual([12, 18]);

    const byDistance = distributeDeviceFuel(10, [
      { startMs: 1, fuelL: 0, distanceKm: 25 },
      { startMs: 2, fuelL: 0, distanceKm: 75 }
    ]);
    expect(byDistance.map((row) => row.fuelL)).toEqual([2.5, 7.5]);
    expect(distributeDeviceFuel(0, [{ startMs: 1, fuelL: 1, distanceKm: 1 }])).toEqual([]);
  });

  it("recomputes presets for today instead of reusing saved dates", () => {
    const now = new Date(2026, 9, 22, 9, 0); // Thu 22 Oct 2026, local
    expect(homeRangeFromPreset("Today", now)).toEqual({ fromDate: "2026-10-22", toDate: "2026-10-22" });
    expect(homeRangeFromPreset("Yesterday", now)).toEqual({ fromDate: "2026-10-21", toDate: "2026-10-21" });
    expect(homeRangeFromPreset("This Week", now)).toEqual({ fromDate: "2026-10-19", toDate: "2026-10-22" });
    expect(homeRangeFromPreset("Last 7 Days", now)).toEqual({ fromDate: "2026-10-16", toDate: "2026-10-22" });
    expect(homeRangeFromPreset("This Month", now)).toEqual({ fromDate: "2026-10-01", toDate: "2026-10-22" });
  });
});
