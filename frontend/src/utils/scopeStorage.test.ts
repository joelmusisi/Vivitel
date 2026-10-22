import { beforeEach, describe, expect, it } from "vitest";
import { filterRecordsForActiveSelection } from "./scopeStorage";

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

describe("filterRecordsForActiveSelection", () => {
  const records = [
    { name: "UA 165EF", site: "Default" },
    { name: "Kampala Driver", site: "Kampala" },
    { name: "Unscoped", site: "" }
  ];

  it("keeps only the listed site when the stored list is Default", () => {
    memory.set("vivi.selectedScope", "org");
    memory.set("vivi.activeDbSites", JSON.stringify(["Default"]));
    expect(filterRecordsForActiveSelection(records).map((row) => row.name)).toEqual(["UA 165EF"]);
  });

  it("keeps database site isolation when real sites are listed", () => {
    memory.set("vivi.selectedScope", "db");
    memory.set("vivi.activeDbSites", JSON.stringify(["Kampala"]));
    expect(filterRecordsForActiveSelection(records).map((row) => row.name)).toEqual(["Kampala Driver"]);
  });

  it("recovers the site from the ribbon path after a switch clears the site key", () => {
    memory.set("vivi.selectedScope", "site");
    memory.set("vivi.selectedPath", "EAST AFRICA / AFRICA / TRANSFLEET SERVICES / Kampala");
    expect(filterRecordsForActiveSelection(records).map((row) => row.name)).toEqual(["Kampala Driver"]);
  });
});
