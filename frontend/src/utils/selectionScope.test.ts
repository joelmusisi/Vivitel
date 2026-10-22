import { beforeEach, describe, expect, it } from "vitest";
import { assetLabelsForHierarchySite, assetSiteMatchesHierarchySite, missingDevicesForSite, resolveAssetSiteName, matchesStoredSiteSelection, readStoredSelectionScope, recoverActiveSiteName } from "./selectionScope";

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

describe("recoverActiveSiteName", () => {
  it("prefers the explicit site key", () => {
    memory.set("vivi.activeSite", "Karongo");
    memory.set("vivi.selectedPath", "EAST AFRICA / AFRICA / TRANSFLEET / MMULU COMPANY");
    expect(recoverActiveSiteName()).toBe("Karongo");
  });

  it("falls back to the ribbon path when the site key was cleared", () => {
    memory.set("vivi.selectedPath", "EAST AFRICA / AFRICA / TRANSFLEET / Kampala");
    expect(recoverActiveSiteName()).toBe("Kampala");
  });
});

describe("assetSiteMatchesHierarchySite", () => {
  it("matches a leaf asset site to a family/site hierarchy label", () => {
    expect(assetSiteMatchesHierarchySite("Coating", "CPP_TZ/Coating")).toBe(true);
    expect(assetSiteMatchesHierarchySite("CPP_TZ/Coating", "Coating")).toBe(true);
    expect(assetSiteMatchesHierarchySite("Karongo", "CPP_TZ/Coating")).toBe(false);
  });

  it("keeps different sites in the same family apart", () => {
    expect(assetSiteMatchesHierarchySite("CPP_TZ/Yard", "CPP_TZ/Coating")).toBe(false);
  });
});

describe("resolveAssetSiteName", () => {
  it("uses the tracker group when the asset site is blank", () => {
    expect(resolveAssetSiteName({ site: "", group: "WJL" })).toBe("WJL");
    expect(resolveAssetSiteName({ site: "WJL", group: "Default" })).toBe("WJL");
  });
});

describe("missingDevicesForSite", () => {
  it("returns devices in the selected site group that are not already assets", () => {
    const groups = [
      { id: 4, name: "WJL" },
      { id: 9, name: "Default" }
    ];
    const devices = [
      { id: 1, uniqueId: "111", name: "UA 956EW", groupId: 4 },
      { id: 2, uniqueId: "222", name: "KAMUL 2", groupId: 4 },
      { id: 3, uniqueId: "333", name: "Other", groupId: 9 }
    ];
    expect(missingDevicesForSite(devices, groups, "WJL", ["111"])).toEqual([
      { imei: "222", name: "KAMUL 2", site: "WJL", traccarDeviceId: 2 }
    ]);
  });
});

describe("assetLabelsForHierarchySite", () => {
  it("lists only assets stored on the selected site", () => {
    const records = [
      { label: "UA 956EW", siteName: "WJL" },
      { label: "M 7315DPH UA 64PQ", siteName: "Default" },
      { label: "KAMUL 2 UA 395EW", siteName: "Uganda Breweries Limited" },
      { label: "Untagged", siteName: "" }
    ];
    expect(assetLabelsForHierarchySite(records, "WJL")).toEqual(["UA 956EW"]);
    expect(assetLabelsForHierarchySite(records, "Default")).toEqual(["M 7315DPH UA 64PQ"]);
  });
});

describe("readStoredSelectionScope", () => {
  it("recovers a site-scoped selection from the path after a switch", () => {
    memory.set("vivi.selectedScope", "site");
    memory.set("vivi.selectedPath", "EAST AFRICA / AFRICA / TRANSFLEET / Kampala");
    const selection = readStoredSelectionScope();
    expect(selection.activeSite).toBe("kampala");
    expect(matchesStoredSiteSelection("Kampala", selection)).toBe(true);
    expect(matchesStoredSiteSelection("Karongo", selection)).toBe(false);
  });

  it("blocks all rows while site scope has no active site yet", () => {
    memory.set("vivi.selectedScope", "site");
    memory.set("vivi.selectedPath", "EAST AFRICA / AFRICA / TRANSFLEET");
    const selection = readStoredSelectionScope();
    expect(selection.activeSite).toBe("");
    expect(matchesStoredSiteSelection("Kampala", selection)).toBe(false);
  });

  it("keeps database selections on listed sites only", () => {
    memory.set("vivi.selectedScope", "db");
    memory.set("vivi.activeDbSites", JSON.stringify(["Kampala", "Default"]));
    memory.set("vivi.selectedPath", "EAST AFRICA / AFRICA / TRANSFLEET");
    const selection = readStoredSelectionScope();
    expect(matchesStoredSiteSelection("Kampala", selection)).toBe(true);
    expect(matchesStoredSiteSelection("Default", selection)).toBe(true);
    expect(matchesStoredSiteSelection("Karongo", selection)).toBe(false);
    expect(matchesStoredSiteSelection("", selection)).toBe(false);
  });

  it("keeps organisation selections on the active database site list", () => {
    memory.set("vivi.selectedScope", "org");
    memory.set("vivi.activeDbSites", JSON.stringify(["WJL", "Default"]));
    const selection = readStoredSelectionScope();
    expect(matchesStoredSiteSelection("WJL", selection)).toBe(true);
    expect(matchesStoredSiteSelection("Karongo", selection)).toBe(false);
  });
});
