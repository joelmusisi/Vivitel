import { describe, expect, it } from "vitest";
import { assetDisplayName, assetHasName } from "./mobileTripHistory";

describe("assetDisplayName", () => {
  it("prefers registration, then description, then name", () => {
    expect(assetDisplayName({ registration: "UA 166 ER", name: "Ford" })).toBe("UA 166 ER");
    expect(assetDisplayName({ assetDescription: "FORD UA 166 ER", name: "Ford" })).toBe("FORD UA 166 ER");
    expect(assetDisplayName({ name: "Ford" })).toBe("Ford");
  });

  it("labels telemetry-only trackers by IMEI so rows are not all 'Asset'", () => {
    const a = { imei: "350612078068697", deviceId: "47" };
    const b = { imei: "866840078065275", deviceId: "17" };
    expect(assetDisplayName(a)).toBe("Device ···8697");
    expect(assetDisplayName(b)).toBe("Device ···5275");
    expect(assetHasName(a)).toBe(false);
  });

  it("falls back to the device id, then a generic label", () => {
    expect(assetDisplayName({ deviceId: "47" })).toBe("Device #47");
    expect(assetDisplayName({})).toBe("Unnamed device");
  });
});
