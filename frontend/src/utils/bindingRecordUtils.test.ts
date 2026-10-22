import { describe, expect, it } from "vitest";
import {
  bindingDedupeKey,
  isLocationLibraryTemplateBinding,
  isUserLocationBinding,
  resolveBindingRecordForSave
} from "./bindingRecordUtils";

describe("bindingRecordUtils site isolation", () => {
  it("requires site on save", () => {
    const result = resolveBindingRecordForSave("notifications", { name: "Test" }, []);
    expect(result.error).toMatch(/site/i);
  });

  it("dedupes by site and name for device bindings", () => {
    expect(
      bindingDedupeKey("devices", { name: "Fleet A", site: "Site One" })
    ).toBe("site one::fleet a");
    expect(bindingDedupeKey("devices", { name: "Fleet A", site: "" })).toBe("::fleet a");
  });

  it("treats location-lib rows as library mirrors, not user bindings", () => {
    expect(
      isLocationLibraryTemplateBinding({
        id: "location-lib:mmulu-company:kampala-location",
        name: "Kampala Location"
      })
    ).toBe(true);
    expect(
      isUserLocationBinding({
        id: "location-lib:mmulu-company:kampala-location",
        name: "Kampala Location"
      })
    ).toBe(false);
    expect(
      isUserLocationBinding({
        id: "loc:mmulu-company:traial",
        name: "Traial",
        locationsConfig: []
      })
    ).toBe(true);
  });
});
