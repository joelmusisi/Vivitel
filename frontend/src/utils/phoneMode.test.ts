import { describe, expect, it } from "vitest";
import { isTabletDevice } from "./phoneMode";

describe("isTabletDevice", () => {
  it("detects classic iPad user agents", () => {
    expect(
      isTabletDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15", 5)
    ).toBe(true);
  });

  it("detects iPadOS desktop-class Safari", () => {
    expect(
      isTabletDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", 5)
    ).toBe(true);
  });

  it("does not treat iPhone as a tablet", () => {
    expect(
      isTabletDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", 5)
    ).toBe(false);
  });
});
