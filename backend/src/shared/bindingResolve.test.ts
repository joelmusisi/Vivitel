import { describe, expect, it } from "vitest";
import {
  bindingRowMatchesRef,
  deviceBindingNeedsLocation,
  resolveBindingByRef,
  sitesEquivalent
} from "./bindingResolve";

describe("bindingResolve (backend)", () => {
  it("matches exact site scope tokens only", () => {
    expect(sitesEquivalent("MMULU", "MMULU COMPANY")).toBe(false);
    expect(sitesEquivalent("MMULU COMPANY", "MMULU COMPANY")).toBe(true);
    expect(sitesEquivalent("MMULU", "mmulu")).toBe(true);
  });

  it("resolves by slug / composite id", () => {
    const bindings = [{ id: "notif:mmulu:tsf-mulu-test", name: "TSF_Mulu_Test", site: "MMULU" }];
    expect(bindingRowMatchesRef(bindings[0], "TSF_Mulu_Test")).toBe(true);
    expect(bindingRowMatchesRef(bindings[0], "tsf-mulu-test")).toBe(true);
    expect(resolveBindingByRef(bindings, "TSF_Mulu_Test", "MMULU")?.name).toBe("TSF_Mulu_Test");
    expect(resolveBindingByRef(bindings, "TSF_Mulu_Test", "OTHER")).toBeNull();
  });

  it("detects location monitoring on device bindings", () => {
    expect(deviceBindingNeedsLocation({ locationSpeedMonitoring: true })).toBe(true);
    expect(deviceBindingNeedsLocation({ advancedSettings: { locationSpeedMonitoring: true } })).toBe(true);
    expect(deviceBindingNeedsLocation({ name: "FMB140" })).toBe(false);
  });
});
