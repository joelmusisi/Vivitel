import { describe, expect, it } from "vitest";
import { configUploadDateFromGroups, deriveDeviceFaults } from "./assetDeviceStatus";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const fresh = "2026-10-27T11:59:00Z";

const row = (attributes: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  deviceId: 1,
  status: "online",
  lastUpdate: fresh,
  position: { valid: true, attributes },
  ...extra
});

describe("deriveDeviceFaults", () => {
  it("reports nothing for a healthy device", () => {
    expect(deriveDeviceFaults(row({ power: 12.6, sat: 14, rssi: 4 }) as any, NOW)).toEqual([]);
  });

  it("names device alarms", () => {
    expect(deriveDeviceFaults(row({ alarm: "powerCut", power: 0, sat: 9 }) as any, NOW)).toEqual(["Power cut"]);
    expect(deriveDeviceFaults(row({ alarm: "jamming,gpsAntennaCut", sat: 9 }) as any, NOW)).toEqual([
      "GPS/GSM jamming",
      "GPS antenna cut"
    ]);
  });

  it("flags external power, GPS fix and GSM signal problems", () => {
    expect(deriveDeviceFaults(row({ power: 0.2, sat: 0, rssi: 0 }) as any, NOW)).toEqual([
      "External power disconnected",
      "No GPS fix",
      "No GSM signal"
    ]);
    expect(deriveDeviceFaults(row({ power: 9.4, sat: 8 }) as any, NOW)).toEqual(["Low external power (9.4 V)"]);
  });

  it("flags devices that stopped reporting or never reported", () => {
    expect(deriveDeviceFaults(row({ sat: 8 }, { lastUpdate: "2026-10-24T10:00:00Z" }) as any, NOW)).toEqual([
      "Not reporting (3 days)"
    ]);
    expect(deriveDeviceFaults({ deviceId: 2, position: null, lastUpdate: null } as any, NOW)).toEqual([
      "Never reported"
    ]);
  });
});

describe("configUploadDateFromGroups", () => {
  const groups = [
    {
      id: "g1",
      name: "Mulu_Transport_Fuel_Test_Group",
      compileAcceptance: {
        compiledAt: "2026-10-20T08:00:00Z",
        acceptedCount: 1,
        totalCount: 2,
        assets: [
          { assetKey: "a", label: "A", imei: "350612078068697", registration: "", accepted: true, compiledAt: "2026-10-20T08:01:00Z" },
          { assetKey: "b", label: "B", imei: "866840078065275", registration: "", accepted: false }
        ]
      }
    }
  ];

  it("uses the device's accepted upload time from its group", () => {
    expect(configUploadDateFromGroups({ imei: "350612078068697", configGroup: "g1" }, groups)).toBe(
      "2026-10-20T08:01:00Z"
    );
    expect(
      configUploadDateFromGroups({ imei: "350612078068697", configGroup: "Mulu_Transport_Fuel_Test_Group" }, groups)
    ).toBe("2026-10-20T08:01:00Z");
  });

  it("stays empty when the device did not accept the upload or has no group", () => {
    expect(configUploadDateFromGroups({ imei: "866840078065275", configGroup: "g1" }, groups)).toBe("");
    expect(configUploadDateFromGroups({ imei: "350612078068697" }, groups)).toBe("");
  });
});
