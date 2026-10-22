import { describe, expect, it } from "vitest";
import {
  confineToSite,
  itemsForSite,
  mergeLocationAlertItems,
  parseLocationAlertsKey
} from "./locationAlertsMerge";

describe("locationAlertsMerge", () => {
  it("parses site scoped keys only", () => {
    expect(parseLocationAlertsKey("libraries:location-alerts:tenant:a_b:site:mmulu")).toEqual({
      tenantToken: "a_b",
      siteToken: "mmulu"
    });
    expect(parseLocationAlertsKey("libraries:location-alerts:tenant:a_b")).toBeNull();
  });

  it("merges without duplicates or losing alerts, newest wins, tombstones kept", () => {
    const merged = mergeLocationAlertItems(
      [
        { id: "1", eventName: "A", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "2", eventName: "B", updatedAt: "2026-01-01T00:00:00Z" }
      ],
      [
        { id: "1", eventName: "A2", updatedAt: "2026-02-01T00:00:00Z" },
        { id: "2", status: "removed", updatedAt: "2026-02-01T00:00:00Z" }
      ]
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((row) => row.id === "1")?.eventName).toBe("A2");
    expect(merged.find((row) => row.id === "2")?.status).toBe("removed");
    expect(merged.find((row) => row.id === "2")?.eventName).toBe("B");
  });

  it("keeps only items that belong to the site", () => {
    const rows = [{ id: "1", site: "MMULU" }, { id: "2", site: "Other" }, { id: "3" }];
    expect(itemsForSite(rows, "mmulu", "mmulu").map((row) => row.id)).toEqual(["1"]);
  });

  it("never treats a similarly named site as the same site", () => {
    const rows = [{ id: "1", site: "MMULU COMPANY" }, { id: "2", site: "MMULU" }, { id: "3" }];
    expect(itemsForSite(rows, "mmulu", "mmulu").map((row) => row.id)).toEqual(["2"]);
    expect(confineToSite(rows, "mmulu_company").map((row) => row.id)).toEqual(["1", "3"]);
  });
});
