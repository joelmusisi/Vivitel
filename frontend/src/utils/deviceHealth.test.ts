import { describe, expect, it } from "vitest";
import { DEVICE_HEALTH_COLUMNS, mergeDeviceHealthRows, summarizeDeviceHealth } from "./deviceHealth";

const report = (id: number, fixTime: string, attributes: Record<string, unknown> = {}) => ({
  id,
  deviceId: 5,
  fixTime,
  serverTime: fixTime,
  valid: true,
  speed: 10,
  latitude: -6.8,
  longitude: 39.28,
  attributes
});

describe("device health", () => {
  it("merges reports newest first without duplicates", () => {
    const first = mergeDeviceHealthRows([], [report(1, "2026-10-22T08:00:00Z"), report(2, "2026-10-22T08:00:30Z")]);
    const next = mergeDeviceHealthRows(first, [report(2, "2026-10-22T08:00:30Z"), report(3, "2026-10-22T08:01:00Z")]);
    expect(next.map((row) => row.id)).toEqual([3, 2, 1]);
  });

  it("flags a device that stopped reporting and low supply voltage", () => {
    const rows = mergeDeviceHealthRows([], [
      report(1, "2026-10-22T08:00:00Z", { power: 6.2, sat: 9 }),
      report(2, "2026-10-22T08:00:30Z", { power: 6.1, sat: 9 })
    ]);
    const now = Date.parse("2026-10-22T09:00:00Z");
    const summary = summarizeDeviceHealth(rows, null, now);
    const card = (label: string) => summary.cards.find((row) => row.label === label);
    expect(card("Status")).toMatchObject({ value: "Not reporting", tone: "bad" });
    expect(card("Report interval")?.value).toBe("30s");
    expect(card("Ext. power")).toMatchObject({ tone: "bad" });
    expect(card("GPS")?.value).toBe("9 sats");
  });

  it("formats speed in km/h and odometer in km", () => {
    const [row] = mergeDeviceHealthRows([], [report(1, "2026-10-22T08:00:00Z", { odometer: 123456 })]);
    const value = (key: string) => DEVICE_HEALTH_COLUMNS.find((column) => column.key === key)!.format(row);
    expect(value("speed")).toBe("19");
    expect(value("odometer")).toBe("123.5");
    expect(value("power")).toBe("—");
  });
});
