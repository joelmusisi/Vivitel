import { describe, expect, it } from "vitest";
import { computeDesktopScale, DESKTOP_DESIGN_WIDTH_PX } from "./desktopScale";

describe("computeDesktopScale", () => {
  it("does not scale phone layouts", () => {
    expect(computeDesktopScale(390, true)).toBe(1);
  });

  it("leaves large desktops at 1 so their layout stays unchanged", () => {
    expect(computeDesktopScale(1920, false)).toBe(1);
    expect(computeDesktopScale(DESKTOP_DESIGN_WIDTH_PX, false)).toBe(1);
  });

  it("scales smaller desktop windows to the same 1440 layout", () => {
    expect(computeDesktopScale(720, false)).toBe(0.5);
    expect(computeDesktopScale(1080, false)).toBe(0.75);
  });

  it("scales iPad and other tablets to the same 1440 layout", () => {
    expect(computeDesktopScale(1024, false, true)).toBeCloseTo(1024 / 1440, 4);
    expect(computeDesktopScale(1180, false, true)).toBeCloseTo(1180 / 1440, 4);
  });
});
