import { describe, expect, it, vi } from "vitest";

vi.mock("leaflet", () => ({ default: {} }));

import { mapTraccarEventsToTrailNotifications } from "./trailNotificationMarker";

describe("mapTraccarEventsToTrailNotifications GPS IoT", () => {
  it("prefers GetTelemetry attribute coordinates when positionId is 0", () => {
    const mapped = mapTraccarEventsToTrailNotifications(
      [
        {
          type: "harsh braking",
          eventTime: "2026-01-18T08:10:17.000Z",
          positionId: 0,
          attributes: {
            eventName: "harsh braking",
            latitude: 51.5074,
            longitude: -0.1278,
            address: "Westminster"
          }
        }
      ],
      []
    );
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.lat).toBe(51.5074);
    expect(mapped[0]?.lng).toBe(-0.1278);
    expect(mapped[0]?.labels?.[0]?.toLowerCase()).toContain("harsh");
    expect(mapped[0]?.location).toBe("Westminster");
  });

  it("falls back to nearest route point when attributes lack coords", () => {
    const mapped = mapTraccarEventsToTrailNotifications(
      [
        {
          type: "ignitionOn",
          eventTime: "2026-01-18T08:10:17.000Z",
          positionId: 42,
          attributes: { eventName: "Ignition On" }
        }
      ],
      [
        {
          id: 42,
          latitude: 52.1,
          longitude: -1.2,
          fixTime: "2026-01-18T08:10:17.000Z",
          address: "Route stop"
        }
      ]
    );
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.lat).toBe(52.1);
    expect(mapped[0]?.lng).toBe(-1.2);
  });
});
