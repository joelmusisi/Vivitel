import { describe, expect, it } from "vitest";
import {
  countAssetsForConfigGroups,
  isDefaultConfigGroupRef,
  listAssetsForConfigGroup,
  resolvePreferredConfigGroupForSite
} from "./configGroupSiteAssets";

const muluGroup = {
  id: "mulu-fuel-group",
  name: "Mulu_Transport_Fuel_Test_Group",
  site: "MMULU COMPANY"
};

const defaultGroup = { id: "default-group", name: "Default", site: "" };

describe("configGroupSiteAssets", () => {
  it("detects default group refs", () => {
    expect(isDefaultConfigGroupRef("default-group")).toBe(true);
    expect(isDefaultConfigGroupRef("Default")).toBe(true);
    expect(isDefaultConfigGroupRef("")).toBe(true);
    expect(isDefaultConfigGroupRef("Mulu_Transport_Fuel_Test_Group")).toBe(false);
  });

  it("prefers the sole non-default site group", () => {
    expect(
      resolvePreferredConfigGroupForSite([defaultGroup, muluGroup], "MMULU COMPANY")?.id
    ).toBe("mulu-fuel-group");
    expect(
      resolvePreferredConfigGroupForSite(
        [
          muluGroup,
          { id: "other", name: "Other", site: "MMULU COMPANY" }
        ],
        "MMULU COMPANY"
      )
    ).toBeNull();
  });

  it("includes unassigned and default assets for the preferred site group", () => {
    const assets = [
      { site: "MMULU COMPANY", configGroup: "mulu-fuel-group", registration: "A" },
      { site: "MMULU COMPANY", configGroup: "default-group", registration: "B" },
      { site: "MMULU COMPANY", configGroup: "", registration: "C" },
      { site: "OTHER", configGroup: "", registration: "D" },
      {
        site: "MMULU COMPANY",
        configGroup: "other-group",
        configurationGroup: "Other",
        registration: "E"
      }
    ];
    const listed = listAssetsForConfigGroup(muluGroup, assets, [defaultGroup, muluGroup]);
    expect(listed.map((row) => row.registration).sort()).toEqual(["A", "B", "C"]);
  });

  it("counts by both group id and name", () => {
    const assets = [
      { site: "MMULU COMPANY", configGroup: "mulu-fuel-group" },
      { site: "MMULU COMPANY", configGroup: "default-group" },
      { site: "MMULU COMPANY", configurationGroup: "Mulu_Transport_Fuel_Test_Group" }
    ];
    const counts = countAssetsForConfigGroups([muluGroup], assets);
    expect(counts.get("mulu-fuel-group")).toBe(3);
    expect(counts.get("mulu_transport_fuel_test_group")).toBe(3);
  });
});
