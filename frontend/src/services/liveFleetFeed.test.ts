import { describe, expect, it } from "vitest";
import { filterLiveFleetRows, toLiveFleetRow } from "../services/liveFleetFeed";

describe("liveFleetFeed", () => {
  it("normalizes asset payloads into Mix-style rows", () => {
    const row = toLiveFleetRow(
      {
        id: "a1",
        registration: "ABC123",
        assetDescription: "Truck 1",
        site: "CPP_TZ/Coating",
        lat: -1.2,
        lng: 36.8,
        speed: "42",
        driver: "Sam"
      },
      { dealer: "Org", organisation: "Dealer", database: "DB1" }
    );

    expect(row.assetId).toBe("a1");
    expect(row.siteFamily).toBe("CPP_TZ");
    expect(row.site).toBe("Coating");
    expect(row.movementStatus).toBe("moving");
    expect(row.breadcrumb).toContain("CPP_TZ");
    expect(row.lat).toBe(-1.2);
    expect(row.lon).toBe(36.8);
  });

  it("filters by site and asset helpers", () => {
    const rows = [
      toLiveFleetRow({ id: "1", registration: "A", site: "North" }),
      toLiveFleetRow({ id: "2", registration: "B", site: "South" })
    ];
    const filtered = filterLiveFleetRows(rows, {
      matchesSite: (site) => String(site).toLowerCase() === "north",
      matchesAsset: () => true
    });
    expect(filtered.map((r) => r.assetId)).toEqual(["1"]);
  });
});
