import { describe, expect, it } from "vitest";
import { flattenCmsv6Vehicles } from "./vehicles";

describe("flattenCmsv6Vehicles", () => {
  it("flattens queryUserVehicle payload into device rows", () => {
    const rows = flattenCmsv6Vehicles({
      result: 0,
      vehicles: [
        {
          id: 2197,
          nm: "UBP-119H",
          pid: 516,
          pnm: "A10564",
          dl: [
            {
              id: "020262202629",
              did: 2287,
              cc: 3,
              cn: "CH1,CH2,CH3",
              ist: "2026-08-25 10:26:18"
            }
          ]
        }
      ]
    });
    expect(rows).toEqual([
      {
        vehiIdno: "UBP-119H",
        vehicleId: "2197",
        company: "A10564",
        companyId: "516",
        devIdno: "020262202629",
        deviceId: "2287",
        channels: 3,
        channelNames: ["CH1", "CH2", "CH3"],
        installedAt: "2026-08-25 10:26:18",
        gbCode: undefined
      }
    ]);
  });

  it("keeps already-flattened rows", () => {
    const rows = flattenCmsv6Vehicles({
      vehicles: [{ vehiIdno: "UBP-119H", devIdno: "020262202629", channels: 3, channelNames: ["CH1", "CH2", "CH3"] }]
    });
    expect(rows[0]?.devIdno).toBe("020262202629");
    expect(rows[0]?.vehiIdno).toBe("UBP-119H");
  });
});
