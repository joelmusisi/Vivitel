import { describe, expect, it } from "vitest";
import { resolveEffectiveRegion } from "./regionServers";

describe("resolveEffectiveRegion", () => {
  it("keeps a regional host on its own server", () => {
    expect(
      resolveEffectiveRegion({
        origin: "https://za.vivitelematics.ca",
        host: "vivi-telematics-api.bwena.workers.dev",
        sessionRegion: "uk",
        bodyRegion: "us"
      })
    ).toBe("za");
  });

  it("uses the signed-in server for local requests", () => {
    expect(
      resolveEffectiveRegion({
        origin: "http://127.0.0.1:3000",
        host: "vivi-telematics-api.bwena.workers.dev",
        sessionRegion: "uk"
      })
    ).toBe("uk");
  });

  it("uses the server named at local sign-in before a session exists", () => {
    expect(
      resolveEffectiveRegion({
        origin: "http://localhost:3000",
        host: "127.0.0.1:8787",
        bodyRegion: "za"
      })
    ).toBe("za");
  });

  it("stays on the United States server when local sign-in does not name one", () => {
    expect(
      resolveEffectiveRegion({
        origin: "http://127.0.0.1:3000",
        host: "vivi-telematics-api.bwena.workers.dev"
      })
    ).toBe("us");
  });
});
