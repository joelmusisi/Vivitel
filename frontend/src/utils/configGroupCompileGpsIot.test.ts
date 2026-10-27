import assert from "node:assert/strict";
import test from "node:test";
import { configurationGroupCompileSucceeded, isBlockingCompileError } from "./configGroupCompileStatus.ts";
import { serializeFuelCalibration, hasUsableFuelCalibration } from "./fuelCalibration.ts";
import { buildFuelComputeConfigFromDeviceLine } from "./fuelComputeFromDevice.ts";

test("Traccar transport noise does not block GPS IoT compile acceptance", () => {
  assert.equal(isBlockingCompileError("Traccar upstream unavailable"), false);
  assert.equal(isBlockingCompileError("notification 12: permission denied"), false);
  assert.equal(isBlockingCompileError("Fuel line missing analog input"), true);
  assert.equal(
    configurationGroupCompileSucceeded({
      acceptedCount: 2,
      assetsInGroup: 2,
      errors: ["Traccar upstream unavailable", "attribute 9: soft-fail"]
    }),
    true
  );
});

test("device binding fuel calibration compiles into asset-ready fuel settings", () => {
  const line = {
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
  };
  assert.equal(hasUsableFuelCalibration(line.fuelCalibration), true);
  const serialized = serializeFuelCalibration(line.fuelCalibration);
  assert.ok(serialized);
  const config = buildFuelComputeConfigFromDeviceLine(line);
  assert.ok(config);
  assert.equal(config?.inputField, "IO6");
  assert.equal(config?.tankCapacityMax, "450");
  assert.equal(hasUsableFuelCalibration(config?.calibrationPoints), true);
});
