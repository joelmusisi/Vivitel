import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFuelModelFromGpsIotInfo,
  gpsIotFuelEfficiencyLPerKm,
  parseGpsIotFuelDateMs,
  resolveGpsIotFuelAssetId
} from "./gpsiotFuel.ts";

test("resolveGpsIotFuelAssetId prefers assetId over imei", () => {
  assert.equal(resolveGpsIotFuelAssetId({ assetId: "asset-9", imei: "123", id: "gpsiot:asset-9" }), "asset-9");
  assert.equal(resolveGpsIotFuelAssetId({ id: "gpsiot:asset-9" }), "asset-9");
  assert.equal(resolveGpsIotFuelAssetId({ imei: "123456789012345" }), "123456789012345");
});

test("buildFuelModelFromGpsIotInfo builds trend and change points", () => {
  const model = buildFuelModelFromGpsIotInfo({
    sensors: [],
    refills: [{
      date: "2026-09-25 08:00:00",
      initialLevel: 20,
      finalLevel: 60,
      filled: 40,
      location: "Depot",
      latitude: 51.5,
      longitude: -0.1
    }],
    drains: [{
      date: "2026-09-25 12:00:00",
      initialLevel: 60,
      finalLevel: 50,
      drained: 10,
      location: "Yard",
      latitude: 51.51,
      longitude: -0.11
    }],
    totalDistance: 100,
    totalEngineHours: 3,
    fuelConsumption: 0.4,
    fuelUsed: 40,
    totalDrains: 10,
    totalRefills: 40
  }, { currentLiters: 48, rangeEndMs: parseGpsIotFuelDateMs("2026-09-25 18:00:00") });

  assert.equal(model.refills.length, 1);
  assert.equal(model.drains.length, 1);
  assert.ok(model.trend.length >= 4);
  assert.equal(model.changePoints[0]?.rising, true);
  assert.equal(model.changePoints[1]?.rising, false);
  assert.equal(gpsIotFuelEfficiencyLPerKm({ fuelUsed: 40, totalDistance: 100, fuelConsumption: 0 }), 0.4);
});
