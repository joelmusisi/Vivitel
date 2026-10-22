import { describe, expect, it } from "vitest";
import {
  buildFuelCalibrationJexlExpression,
  draftFuelCalibration,
  hasUsableFuelCalibration,
  interpolateFuelLitersFromCalibration,
  normalizeFuelCalibration,
  seedFuelCalibrationFromRange
} from "./fuelCalibration";
import { buildFuelLevelJexlExpression } from "./traccarAttributeMapper";
import { computeFuelLitersFromAnalog, readDeviceFuelConfig, readDeviceFuelConfigFromBinding } from "./traccarFuel";

describe("fuel calibration chart", () => {
  const chart = [
    { mv: 200, liters: 0 },
    { mv: 8000, liters: 80 },
    { mv: 28000, liters: 400 }
  ];

  it("interpolates litres between calibration points", () => {
    expect(interpolateFuelLitersFromCalibration(200, chart)).toBe(0);
    expect(interpolateFuelLitersFromCalibration(8000, chart)).toBe(80);
    expect(interpolateFuelLitersFromCalibration(28000, chart)).toBe(400);
    expect(interpolateFuelLitersFromCalibration(4100, chart)).toBeCloseTo(40, 5);
    expect(interpolateFuelLitersFromCalibration(18000, chart)).toBeCloseTo(240, 5);
  });

  it("holds the first and last litres outside the chart", () => {
    expect(interpolateFuelLitersFromCalibration(0, chart)).toBe(0);
    expect(interpolateFuelLitersFromCalibration(40000, chart)).toBe(400);
  });

  it("keeps in-progress chart rows so users can type one cell at a time", () => {
    expect(
      draftFuelCalibration([
        { mv: "200", liters: "" },
        { mv: "", liters: "40" }
      ])
    ).toEqual([
      { mv: "200", liters: "" },
      { mv: "", liters: "40" }
    ]);
  });

  it("seeds two points from the binding min/max range", () => {
    expect(
      seedFuelCalibrationFromRange({
        analogMvMin: "200",
        analogMvMax: "28000",
        tankCapacityMin: "0",
        tankCapacityMax: "400"
      })
    ).toEqual([
      { mv: "200", liters: "0" },
      { mv: "28000", liters: "400" }
    ]);
  });

  it("builds piecewise JEXL from the chart", () => {
    const expr = buildFuelCalibrationJexlExpression("io6", chart);
    expect(expr).toContain("io6 <= 200");
    expect(expr).toContain("28000");
    expect(expr).toContain("400");
  });

  it("uses the chart in the device fuel formula instead of the straight line", () => {
    const expr = buildFuelLevelJexlExpression({
      enabled: true,
      inputField: "IO6",
      tankCapacity: "400",
      tankCapacityMax: "400",
      inputMvMax: "28000",
      calibrationPoints: normalizeFuelCalibration(chart)
    });
    expect(expr).not.toBe("((400 * io6) / 28000)");
    expect(hasUsableFuelCalibration(chart)).toBe(true);
    expect(expr).toContain("io6 <= 200");
  });

  it("computes analogue litres from a stored chart on the device", () => {
    const config = readDeviceFuelConfig({
      viviFuelAnalogInput: "IO6",
      viviFuelTankCapacity: "400",
      viviFuelAnalogMvMax: "28000",
      viviFuelCalibration: JSON.stringify(chart)
    });
    expect(config?.calibrationPoints).toHaveLength(3);
    expect(computeFuelLitersFromAnalog({ io6: 8000 }, config)).toBeCloseTo(80, 5);
    expect(computeFuelLitersFromAnalog({ io6: 18000 }, config)).toBeCloseTo(240, 5);
  });
});

describe("readDeviceFuelConfigFromBinding", () => {
  it("reads the IO6 chart from a connected I3/F1 line", () => {
    const config = readDeviceFuelConfigFromBinding({
      lines: [
        {
          id: "f1i3",
          connected: true,
          analogInput: "IO6",
          analogMvMin: "0",
          analogMvMax: "3500",
          tankCapacityMin: "25",
          tankCapacityMax: "450",
          fuelCalibration: [
            { mv: 0, liters: 25 },
            { mv: 2800, liters: 380 },
            { mv: 3305, liters: 450 }
          ]
        }
      ]
    });
    expect(config?.analogInput).toMatch(/IO6/i);
    expect(computeFuelLitersFromAnalog({ io6: 2800 }, config)).toBeCloseTo(380, 5);
  });
});
