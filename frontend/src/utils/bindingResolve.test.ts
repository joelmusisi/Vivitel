import { describe, expect, it } from "vitest";
import { resolveBindingByRef, sitesEquivalent } from "./bindingResolve";

describe("bindingResolve", () => {
  it("matches exact site scope tokens only", () => {
    expect(sitesEquivalent("MMULU", "MMULU COMPANY")).toBe(false);
    expect(sitesEquivalent("MMULU COMPANY", "MMULU COMPANY")).toBe(true);
    expect(sitesEquivalent("MMULU", "mmulu")).toBe(true);
    expect(sitesEquivalent("", "MMULU")).toBe(false);
    expect(sitesEquivalent("MMULU", "")).toBe(false);
  });

  it("resolves binding only when site matches exactly", () => {
    const bindings = [
      { id: "notif:mmulu:tsf-mulu-test", name: "TSF_Mulu_Test", site: "MMULU" }
    ];
    expect(resolveBindingByRef(bindings, "TSF_Mulu_Test", "MMULU")?.name).toBe("TSF_Mulu_Test");
    expect(resolveBindingByRef(bindings, "TSF_Mulu_Test", "MMULU COMPANY")).toBeNull();
  });

  it("does not resolve unscoped bindings onto an active site", () => {
    const bindings = [{ id: "b1", name: "TSF_Mulu_Test", site: "" }];
    expect(resolveBindingByRef(bindings, "TSF_Mulu_Test", "MMULU COMPANY")).toBeNull();
  });
});
