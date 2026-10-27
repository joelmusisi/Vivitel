import { beforeEach, describe, expect, it } from "vitest";
import { driverSitesToLoad, driversMissingFrom, mergeDriverRecords, namedDriverStub } from "./driverStore";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, String(value));
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear()
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: store
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: store }
  });
});

describe("driverStore", () => {
  it("merges the same driver from local and server without duplicating", () => {
    const merged = mergeDriverRecords(
      [{ id: "1", name: "Jane Doe", site: "Default Site" }],
      [{ name: "Jane Doe", site: "Default Site", email: "jane@example.com" }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.email).toBe("jane@example.com");
    expect(merged[0]?.id).toBe("1");
  });

  it("keeps drivers isolated per site", () => {
    const merged = mergeDriverRecords([
      { id: "1", name: "Jane Doe", site: "Kampala" },
      { id: "2", name: "Jane Doe", site: "Entebbe" }
    ]);
    expect(merged).toHaveLength(2);
  });

  it("finds local-only names that never reached the server", () => {
    const local = mergeDriverRecords([
      namedDriverStub("Alinda Driver", "Default Site"),
      { id: "srv", name: "Shared", site: "Default Site" }
    ]);
    const server = mergeDriverRecords([{ id: "srv", name: "Shared", site: "Default Site" }]);
    const missing = driversMissingFrom(local, server);
    expect(missing.map((row) => row.name)).toEqual(["Alinda Driver"]);
  });

  it("keeps named drivers even when site was never saved", () => {
    const merged = mergeDriverRecords([
      { id: "1", name: "UA 165EF", site: "Default" },
      { name: "New Driver" }
    ]);
    expect(merged.map((row) => row.name).sort()).toEqual(["New Driver", "UA 165EF"]);
  });

  it("loads only the active site after a site-scoped switch", () => {
    memory.set("vivi.selectedScope", "site");
    memory.set("vivi.activeSite", "Karongo");
    memory.set("vivi.activeDbSites", JSON.stringify(["Karongo", "Kampala", "Default"]));
    expect(driverSitesToLoad()).toEqual(["Karongo"]);
  });
});
