import { describe, expect, it } from "vitest";
import {
  buildMergedFuelComputeConfig,
  resolveFuelInputFromDeviceBinding,
  describeMissingFuelComputePrerequisites
} from "./fuelComputeFromDevice";
import { buildFuelLevelJexlExpression } from "./traccarAttributeMapper";
import type { NotificationRow } from "../data/notificationLibrary";

const fuelNotification: Pick<NotificationRow, "description" | "parameters"> = {
  description: "Fuel level (computed)",
  parameters: {
    fuelCompute: {
      enabled: true,
      tankCapacity: "400",
      scale: "75",
      outputAttribute: "fuelLevel"
    }
  }
};

describe("resolveFuelInputFromDeviceBinding", () => {
  it("prefers Fuel line over I3/F1 when both connected", () => {
    const input = resolveFuelInputFromDeviceBinding({
      lines: [
        { id: "f1i3", connected: true, analogInput: "IO3" },
        { id: "fuel", connected: true, analogInput: "IO6" }
      ]
    });
    expect(input).toBe("IO6");
  });

  it("uses first connected fuel line with analogue input", () => {
    const input = resolveFuelInputFromDeviceBinding({
      lines: [
        { id: "fuel", connected: false, analogInput: "IO1" },
        { id: "f1i3", connected: true, analogInput: "IO4" }
      ]
    });
    expect(input).toBe("IO4");
  });

  it("uses I3/F1 when connection is Yes even if connected flag is missing", () => {
    const input = resolveFuelInputFromDeviceBinding({
      lines: [{ id: "f1i3", connection: "Yes", analogInput: "IO6" }]
    });
    expect(input).toBe("IO6");
  });

  it("uses a connected analogue line that holds the calibration chart", () => {
    const input = resolveFuelInputFromDeviceBinding({
      lines: [
        { id: "fuel", connected: false, analogInput: "" },
        {
          id: "rpm",
          connected: true,
          analogInput: "IO6",
          fuelCalibration: [
            { mv: 0, liters: 25 },
            { mv: 3305, liters: 450 }
          ]
        }
      ]
    });
    expect(input).toBe("IO6");
  });
});

describe("buildMergedFuelComputeConfig", () => {
  it("merges notification settings with device input", () => {
    const merged = buildMergedFuelComputeConfig(fuelNotification, {
      lines: [
        {
          id: "fuel",
          connected: true,
          analogInput: "IO6",
          analogMvMax: "3000",
          tankCapacityMax: "400"
        }
      ]
    });
    expect(merged).toMatchObject({
      tankCapacity: "400",
      outputAttribute: "fuelLevel",
      inputField: "IO6",
      inputMvMax: "3000"
    });
  });

  it("builds proportional fuel expression: (Max Capacity × voltage) / Max voltage", () => {
    const merged = buildMergedFuelComputeConfig(fuelNotification, {
      lines: [
        {
          id: "fuel",
          connected: true,
          analogInput: "IO6",
          analogMvMin: "0",
          analogMvMax: "3000",
          tankCapacityMax: "400"
        }
      ]
    });
    expect(merged).toMatchObject({
      inputField: "IO6",
      tankCapacityMax: "400",
      inputMvMax: "3000"
    });
    const expr = buildFuelLevelJexlExpression(merged!);
    expect(expr).toBe("((400 * io6) / 3000)");
  });

  it("uses Min mV as Max voltage when Max mV is blank/0", () => {
    const merged = buildMergedFuelComputeConfig(fuelNotification, {
      lines: [
        {
          id: "fuel",
          connected: true,
          analogInput: "IO6",
          analogMvMin: "35000",
          analogMvMax: "0",
          tankCapacityMin: "0",
          tankCapacityMax: "400"
        }
      ]
    });
    expect(buildFuelLevelJexlExpression(merged!)).toBe("((400 * io6) / 35000)");
  });

  it("prefers Max mV over Min mV for the denominator", () => {
    const merged = buildMergedFuelComputeConfig(fuelNotification, {
      lines: [
        {
          id: "fuel",
          connected: true,
          analogInput: "IO6",
          analogMvMin: "200",
          analogMvMax: "28000",
          tankCapacityMax: "410"
        }
      ]
    });
    expect(buildFuelLevelJexlExpression(merged!)).toBe("((410 * io6) / 28000)");
  });

  it("returns null without device analogue input", () => {
    expect(buildMergedFuelComputeConfig(fuelNotification, { lines: [] })).toBeNull();
  });

  it("returns null without max voltage", () => {
    expect(
      buildMergedFuelComputeConfig(fuelNotification, {
        lines: [{ id: "fuel", connected: true, analogInput: "IO6", tankCapacityMax: "400" }]
      })
    ).toBeNull();
  });
});

describe("describeMissingFuelComputePrerequisites", () => {
  it("guides when fuel line connected but no IO assigned", () => {
    const msg = describeMissingFuelComputePrerequisites(fuelNotification, {
      lines: [{ id: "fuel", connected: true }]
    });
    expect(msg).toMatch(/analogue input/i);
  });

  it("guides when max voltage is missing", () => {
    const msg = describeMissingFuelComputePrerequisites(fuelNotification, {
      lines: [{ id: "fuel", connected: true, analogInput: "IO6", tankCapacityMax: "400" }]
    });
    expect(msg).toMatch(/max mV/i);
  });
});
