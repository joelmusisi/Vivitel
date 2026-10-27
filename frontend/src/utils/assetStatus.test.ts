import { afterEach, describe, expect, it, vi } from "vitest";
import { computeAssetDotStatus, resolveAssetDotStatus, resolveLastMoveAtMs } from "./assetStatus";

describe("computeAssetDotStatus (main frontend)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns offline when asset is unavailable", () => {
    const status = computeAssetDotStatus({
      availability: "unavailable",
      lastSeen: "2026-04-02T10:00:00Z",
      speed: 55
    });

    expect(status).toBe("offline");
  });

  it("returns warning for fresh stationary telemetry after 2 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T10:00:00Z"));

    const status = computeAssetDotStatus({
      availability: "available",
      lastSeen: "2026-04-02T09:59:00Z",
      speed: 0,
      lastMoveAtMs: new Date("2026-04-02T09:57:00Z").getTime()
    });

    expect(status).toBe("warning");
  });

  it("returns warning for 0 km/h even when telemetry is fresh", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T10:00:00Z"));

    const status = computeAssetDotStatus({
      availability: "available",
      lastSeen: "2026-04-02T09:59:30Z",
      speed: 0,
      lastMoveAtMs: new Date("2026-04-02T09:59:00Z").getTime()
    });

    expect(status).toBe("warning");
  });

  it("returns stale for telemetry older than 30 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T10:00:00Z"));

    const status = computeAssetDotStatus({
      availability: "available",
      lastSeen: "2026-04-02T09:20:00Z",
      speed: 40
    });

    expect(status).toBe("stale");
  });

  it("falls back to lastPosition when lastSeen is invalid", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T10:00:00Z"));

    const status = computeAssetDotStatus({
      availability: "available",
      lastSeen: "not-a-date",
      lastPosition: "2026-04-02T09:59:00Z",
      speed: 0,
      lastMoveAtMs: new Date("2026-04-02T09:57:00Z").getTime()
    });

    expect(status).toBe("warning");
  });

  it("does not treat computed dot status as availability", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T10:00:00Z"));

    const status = resolveAssetDotStatus({
      status: "warning",
      availabilityStatus: "available",
      lastSeen: "2026-04-02T09:59:00Z",
      speed: 0,
      lastMoveAtMs: new Date("2026-04-02T09:57:00Z").getTime(),
      imei: "353691840776321"
    });

    expect(status).toBe("warning");
  });

  it("treats ignition-on idle assets as stationary after 2 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T10:00:00Z"));

    const status = computeAssetDotStatus({
      availability: "available",
      lastSeen: "2026-04-02T09:59:00Z",
      speed: 0,
      movement: "on",
      lastMoveAtMs: new Date("2026-04-02T09:57:00Z").getTime()
    });

    expect(status).toBe("warning");
  });

  it("parses formatted live-tracking timestamps with timezone labels", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T00:25:00Z"));

    const status = resolveAssetDotStatus({
      availabilityStatus: "available",
      lastPosition: "14/06/2026 00:18:31 (EAT)",
      speed: 0,
      lastMoveAtMs: Date.parse("2026-06-14T00:18:31Z"),
      imei: "353691840776321"
    });

    expect(status).toBe("warning");
  });

  it("parses legacy dd/mm/yyyy timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T10:00:00Z"));

    const status = computeAssetDotStatus({
      availability: "available",
      lastSeen: "02/04/2026 09:59:00",
      movement: "moving"
    });

    expect(status).toBe("warning");
  });

  it("does not treat speed at or below 5 km/h as movement", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T10:00:00Z"));

    const status = computeAssetDotStatus({
      availability: "available",
      lastSeen: "2026-04-02T09:59:00Z",
      speed: 5,
      movement: "moving",
      lastMoveAtMs: new Date("2026-04-02T09:57:00Z").getTime()
    });

    expect(status).toBe("warning");
  });

  it("treats speed beyond 5 km/h as movement", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T10:00:00Z"));

    const status = computeAssetDotStatus({
      availability: "available",
      lastSeen: "2026-04-02T09:59:00Z",
      speed: 5.1
    });

    expect(status).toBe("online");
  });
});

describe("resolveLastMoveAtMs", () => {
  it("resets when speed indicates movement", () => {
    const atMs = 1_700_000_000_000;
    expect(
      resolveLastMoveAtMs({
        previousLastMoveAtMs: atMs - 300_000,
        atMs,
        speed: 12
      })
    ).toBe(atMs);
  });

  it("ignores GPS drift when speed is 5 km/h or less", () => {
    const previous = 1_700_000_000_000;
    const atMs = previous + 60_000;
    expect(
      resolveLastMoveAtMs({
        previousLastMoveAtMs: previous,
        atMs,
        speed: 4.9,
        movement: "moving",
        previousLat: 0.31,
        previousLng: 32.58,
        lat: 0.3102,
        lng: 32.5803
      })
    ).toBe(previous);
  });

  it("preserves previous timestamp when position is unchanged", () => {
    const previous = 1_700_000_000_000;
    const atMs = previous + 60_000;
    expect(
      resolveLastMoveAtMs({
        previousLastMoveAtMs: previous,
        atMs,
        speed: 0,
        previousLat: 0.31,
        previousLng: 32.58,
        lat: 0.31,
        lng: 32.58
      })
    ).toBe(previous);
  });
});
