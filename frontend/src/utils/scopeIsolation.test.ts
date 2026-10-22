import { describe, expect, it } from "vitest";
import {
  bindingMatchesSite,
  filterBindingsForSite,
  guardFlatScopedKvAccess,
  isLegacyFlatScopedKvKey,
  isScopedKvKey
} from "./scopeIsolation";

describe("scopeIsolation", () => {
  it("detects legacy flat library keys", () => {
    expect(isLegacyFlatScopedKvKey("libraries:notification")).toBe(true);
    expect(isLegacyFlatScopedKvKey("libraries:location")).toBe(true);
    expect(isLegacyFlatScopedKvKey("libraries:location-alerts")).toBe(true);
    expect(isLegacyFlatScopedKvKey("fleet:passengers")).toBe(true);
    expect(isLegacyFlatScopedKvKey("fleet:drivers")).toBe(true);
    expect(isLegacyFlatScopedKvKey("platform:cmsv6")).toBe(true);
    expect(
      isScopedKvKey("libraries:notification:tenant:dealer_org_db:site:mmulu_company")
    ).toBe(true);
    expect(
      isScopedKvKey("libraries:location-alerts:tenant:dealer_org_db:site:mmulu_company")
    ).toBe(true);
    expect(
      isScopedKvKey("fleet:passengers:tenant:dealer_org_db:site:mmulu_company")
    ).toBe(true);
    expect(
      isScopedKvKey("fleet:drivers:tenant:dealer_org_db:site:mmulu_company")
    ).toBe(true);
    expect(isScopedKvKey("libraries:notification")).toBe(false);
  });

  it("does not throw guard for non-library keys", () => {
    expect(() => guardFlatScopedKvAccess("Control:config:foo", "write")).not.toThrow();
  });

  it("keeps bindings isolated per exact site", () => {
    expect(bindingMatchesSite({ site: "Site A" }, "Site A")).toBe(true);
    expect(bindingMatchesSite({ site: "Site A" }, "Site B")).toBe(false);
    expect(bindingMatchesSite({ site: "" }, "Site A")).toBe(false);
    expect(bindingMatchesSite({ site: "North" }, "North Yard")).toBe(false);
    expect(
      filterBindingsForSite(
        [{ id: "1", site: "Site A" }, { id: "2", site: "Site B" }, { id: "3", site: "" }],
        "Site A"
      ).map((row) => row.id)
    ).toEqual(["1"]);
  });
});
