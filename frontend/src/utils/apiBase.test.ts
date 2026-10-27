import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiBaseUrl } from "./api";

describe("production API base URL", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["us.vivitelematics.ca", "za.vivitelematics.com"])(
    "uses the canonical API hostname for %s",
    (hostname) => {
      vi.stubGlobal("window", { location: { hostname } });

      expect(getApiBaseUrl()).toBe("https://api.vivitelematics.ca");
    }
  );
});
