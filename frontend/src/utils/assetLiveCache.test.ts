import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mergeAssetsKeepingNewerLive,
  overlayLivePositions,
  rememberLivePositions
} from "./assetLiveCache";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      }
    }
  });
});

describe("asset live position cache", () => {
  it("keeps a newer live fix across a catalog refresh that still has the old date", () => {
    rememberLivePositions("tenant-a", [
      {
        id: "gpsiot:1",
        imei: "123456789012345",
        telemetryAtMs: Date.parse("2026-10-09T08:15:00Z"),
        lat: 0.31,
        lng: 32.58,
        speed: "42.00",
        location: "Kampala"
      } as Record<string, unknown>
    ]);

    const catalog: Array<Record<string, unknown>> = [
      {
        id: "gpsiot:1",
        imei: "123456789012345",
        assetDescription: "SHACKMAN UA 165EF",
        lastPosition: "2026-10-06T10:00:00",
        lastSeen: "2026-10-06T10:00:00",
        telemetryLatest: { at: "2026-10-06T10:00:00" },
        lat: 0.1,
        lng: 32.1
      }
    ];

    const painted = overlayLivePositions<Record<string, unknown>>("tenant-a", catalog);
    expect((painted[0] as Record<string, unknown>).lastPosition).toBe("2026-10-09T08:15:00.000Z");
    expect((painted[0] as Record<string, unknown>).lastSeen).toBe("2026-10-09T08:15:00.000Z");
    expect(((painted[0] as Record<string, unknown>).telemetryLatest as { at: string }).at).toBe("2026-10-09T08:15:00.000Z");
    expect((painted[0] as Record<string, unknown>).lat).toBe(0.31);
    expect((painted[0] as Record<string, unknown>).location).toBe("Kampala");
    expect((painted[0] as Record<string, unknown>).assetDescription).toBe("SHACKMAN UA 165EF");
  });

  it("does not let an older catalog write replace a newer cached asset row", () => {
    const existing: Array<Record<string, unknown>> = [
      {
        id: "gpsiot:1",
        imei: "123456789012345",
        lastPosition: "2026-10-09T08:15:00.000Z",
        lastSeen: "2026-10-09T08:15:00.000Z",
        telemetryAtMs: Date.parse("2026-10-09T08:15:00Z"),
        lat: 0.31,
        lng: 32.58
      }
    ];
    const incoming: Array<Record<string, unknown>> = [
      {
        id: "gpsiot:1",
        imei: "123456789012345",
        assetDescription: "SHACKMAN UA 165EF",
        lastPosition: "2026-10-06T10:00:00",
        lastSeen: "2026-10-06T10:00:00"
      }
    ];
    const merged = mergeAssetsKeepingNewerLive<Record<string, unknown>>(incoming, existing);
    expect((merged[0] as Record<string, unknown>).lastPosition).toBe("2026-10-09T08:15:00.000Z");
    expect((merged[0] as Record<string, unknown>).assetDescription).toBe("SHACKMAN UA 165EF");
    expect((merged[0] as Record<string, unknown>).lat).toBe(0.31);
  });

  it("ignores an older fix once a newer one is stored", () => {
    rememberLivePositions("tenant-a", [
      {
        id: "a1",
        imei: "123456789012345",
        telemetryAtMs: Date.parse("2026-10-09T08:15:00Z"),
        lat: 1,
        lng: 2
      }
    ]);
    rememberLivePositions("tenant-a", [
      {
        id: "a1",
        imei: "123456789012345",
        telemetryAtMs: Date.parse("2026-10-06T10:00:00Z"),
        lat: 9,
        lng: 9
      }
    ]);
    const painted = overlayLivePositions<Record<string, unknown>>("tenant-a", [
      { id: "a1", imei: "123456789012345", lastPosition: "2026-10-01T00:00:00Z" }
    ] as Array<Record<string, unknown>>);
    expect((painted[0] as Record<string, unknown>).lat).toBe(1);
    expect((painted[0] as Record<string, unknown>).lastPosition).toBe("2026-10-09T08:15:00.000Z");
  });
});
