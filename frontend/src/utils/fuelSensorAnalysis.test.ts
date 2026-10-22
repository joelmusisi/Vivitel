import { describe, expect, it } from "vitest";
import type { TraccarRoutePoint } from "./api";
import { readDeviceFuelConfig } from "./traccarFuel";
import { analyzeFuelSample, buildFuelAnalysisRows, buildLiveFuelPopupFromRoute } from "./fuelSensorAnalysis";

const base = {
  assetId: "a1",
  registration: "DEMO-001",
  imei: "123",
  trackerModel: "Teltonika FMB140",
  deviceTimeMs: Date.parse("2026-10-09T08:15:01Z"),
  receivedTimeMs: Date.parse("2026-10-09T08:15:02Z"),
  latitude: -25.9692,
  longitude: 32.5732,
  speedKph: 0,
  ignition: "OFF"
};

describe("fuel sensor analysis table", () => {
  it("keeps an Omnicomm LLS code out of the millivolt column", () => {
    const row = analyzeFuelSample({
      ...base,
      attributes: { io201: 1640, io202: 23, fuelLevel: 42 }
    }, null);
    expect(row.cells.recordId.startsWith("DEMO-001-")).toBe(true);
    expect(row.cells.sensorFamily).toBe("OMNICOMM");
    expect(row.cells.raw).toContain("1640");
    expect(row.cells.voltageMv).toBe("—");
    expect(row.cells.voltageSource).toBe("NOT_AVAILABLE");
    expect(row.cells.temperature).toBe("23.0");
    expect(row.cells.currentL).toBe("42.0");
    expect(row.cells.tankAngle).toBe("—");
    expect(row.cells.angleSource).toBe("not_available");
  });

  it("uses the tracking device angle as the sensor tilt", () => {
    const row = analyzeFuelSample({
      ...base,
      deviceAngleDeg: 47,
      attributes: { io201: 1640, fuelLevel: 42 }
    }, null);
    expect(row.cells.tankAngle).toBe("47.0");
    expect(row.cells.tiltStatus).toBe("NO");
    expect(row.cells.angleSource).toBe("tracking device");
  });

  it("marks tilt YES only when the 3-axis G-sensor is off level", () => {
    const level = analyzeFuelSample({
      ...base,
      attributes: { io17: 0, io18: 0, io19: 1000, fuelLevel: 42 }
    }, null);
    const sloped = analyzeFuelSample({
      ...base,
      attributes: { io17: 500, io18: 0, io19: 866, fuelLevel: 42 }
    }, null);
    expect(level.cells.tiltStatus).toBe("NO");
    expect(sloped.cells.tiltStatus).toBe("YES");
  });

  it("records measured analogue millivolts and calibrated litres", () => {
    const config = readDeviceFuelConfig({
      analogInput: "IO6",
      tankCapacity: 75,
      calibrationPoints: [
        { mv: 0, liters: 0 },
        { mv: 6500, liters: 10 }
      ]
    });
    const row = analyzeFuelSample({
      ...base,
      attributes: { io6: 6500 },
      fuelConfig: config
    }, null);
    expect(row.cells.voltageMv).toBe("6500");
    expect(row.cells.voltageSource).toBe("MEASURED_MV");
    expect(row.cells.currentL).toBe("10.0");
    expect(row.cells.capacity).toBe("75.0");
  });

  it("marks a 5 litre rise green and a 5 litre drop red", () => {
    const rows = buildFuelAnalysisRows([
      { ...base, attributes: { fuelLevel: 42 }, deviceTimeMs: base.deviceTimeMs },
      { ...base, attributes: { fuelLevel: 50 }, deviceTimeMs: base.deviceTimeMs + 1000 },
      { ...base, attributes: { fuelLevel: 34 }, deviceTimeMs: base.deviceTimeMs + 2000 }
    ]);
    expect(rows[1]?.event).toBe("RAISE");
    expect(rows[1]?.cells.deltaL).toBe("+8.0");
    expect(rows[1]?.cells.filteredL).toBe("+8.0");
    expect(rows[2]?.event).toBe("SIPHONING");
    expect(rows[2]?.cells.deltaL).toBe("-16.0");
    expect(rows[2]?.cells.filteredL).toBe("16.0");
  });
});

const routePoint = (
  iso: string,
  attributes: Record<string, unknown>,
  speedKnots = 0
): TraccarRoutePoint => ({
  fixTime: iso,
  deviceTime: iso,
  serverTime: iso,
  speed: speedKnots,
  attributes
} as TraccarRoutePoint);

describe("live fuel popup", () => {
  it("counts a parked 5 L rise as a refill and a fast 5 L drop as a drain", () => {
    const model = buildLiveFuelPopupFromRoute([
      routePoint("2026-10-10T08:00:00.000Z", { fuelLevel: 40, ignition: true }),
      routePoint("2026-10-10T08:02:00.000Z", { fuelLevel: 48, ignition: false }),
      routePoint("2026-10-10T08:04:00.000Z", { fuelLevel: 32, ignition: false })
    ]);
    expect(model.refills).toHaveLength(1);
    expect(model.refills[0].deltaLiters).toBeCloseTo(8, 5);
    expect(model.drains).toHaveLength(1);
    expect(model.drains[0].deltaLiters).toBeCloseTo(-16, 5);
    expect(model.fuelUsedL).toBe(0);
    expect(model.currentFuelL).toBeCloseTo(32, 5);
    expect(model.line.map((point) => point.liters)).toEqual([40, 48, 32]);
  });

  it("holds the graph when the tank is tilted or the vehicle is moving", () => {
    const model = buildLiveFuelPopupFromRoute([
      routePoint("2026-10-10T08:00:00.000Z", { fuelLevel: 40, ignition: true, io17: 0, io18: 0, io19: 1000 }),
      routePoint("2026-10-10T08:01:00.000Z", { fuelLevel: 55, ignition: true, io17: 500, io18: 0, io19: 866 }),
      routePoint("2026-10-10T08:02:00.000Z", { fuelLevel: 28, ignition: true, io17: 0, io18: 0, io19: 1000 }, 30)
    ]);
    expect(model.line.map((point) => point.liters)).toEqual([40, 40, 40]);
    expect(model.raw.map((point) => point.liters)).toEqual([40, 55, 28]);
    expect(model.refills).toHaveLength(0);
    expect(model.drains).toHaveLength(0);
    expect(model.currentFuelL).toBe(40);
  });

  it("keeps a slow fall as fuel used and does not draw across a long gap", () => {
    const model = buildLiveFuelPopupFromRoute([
      routePoint("2026-10-10T08:00:00.000Z", { fuelLevel: 50, ignition: true }),
      routePoint("2026-10-10T09:00:00.000Z", { fuelLevel: 48, ignition: true }),
      routePoint("2026-10-10T10:00:00.000Z", { fuelLevel: 46, ignition: true }),
      routePoint("2026-10-10T12:00:00.000Z", { fuelLevel: 40, ignition: true })
    ]);
    expect(model.drains).toHaveLength(0);
    expect(model.fuelUsedL).toBeCloseTo(10, 5);
    expect(model.line[3]?.gapBefore).toBe(true);
    expect(model.currentFuelL).toBe(40);
  });

  it("connects the fuel line across a long ignition-off period", () => {
    const model = buildLiveFuelPopupFromRoute([
      routePoint("2026-10-10T08:00:00.000Z", { fuelLevel: 50, ignition: true }),
      routePoint("2026-10-10T09:00:00.000Z", { fuelLevel: 49, ignition: false }),
      routePoint("2026-10-10T12:00:00.000Z", { fuelLevel: 47, ignition: true })
    ]);
    expect(model.line[2]?.gapBefore).toBeFalsy();
    expect(model.line.map((point) => point.liters)).toEqual([50, 49, 47]);
  });

  it("holds a dead ignition-off sender instead of plotting an empty tank", () => {
    const model = buildLiveFuelPopupFromRoute([
      routePoint("2026-10-10T08:00:00.000Z", { fuelLevel: 80, ignition: true }),
      routePoint("2026-10-10T08:05:00.000Z", { fuelLevel: 0, ignition: false }),
      routePoint("2026-10-10T08:20:00.000Z", { fuelLevel: 78, ignition: true })
    ]);
    expect(model.line.map((point) => point.liters)).toEqual([80, 80, 78]);
    expect(model.drains).toHaveLength(0);
    expect(model.fuelUsedL).toBeCloseTo(2, 5);
  });
});
