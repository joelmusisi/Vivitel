import { describe, expect, it } from "vitest";
import {
  eventMatchesAllowedLabels,
  registerBoundNotificationAliases
} from "./streamLive";

describe("eventMatchesAllowedLabels", () => {
  it("does not match unrelated selections to overspeed events", () => {
    const note = { event: "Speed Limit Exceeded", traccarType: "deviceOverspeed" };
    expect(eventMatchesAllowedLabels(note, ["Tamper detected"])).toBe(false);
    expect(eventMatchesAllowedLabels(note, ["Location Entry"])).toBe(false);
    expect(eventMatchesAllowedLabels(note, ["Geofence Entered"])).toBe(false);
    expect(eventMatchesAllowedLabels(note, ["Tempering Alerts"])).toBe(false);
  });

  it("matches exact selected overspeed label", () => {
    const note = { event: "Speed Limit Exceeded", traccarType: "deviceOverspeed" };
    expect(eventMatchesAllowedLabels(note, ["Speed Limit Exceeded"])).toBe(true);
  });

  it("matches custom binding names via selectedEventTypes map", () => {
    registerBoundNotificationAliases([
      { description: "Yard Speeding", type: "deviceOverspeed" },
      { description: "Gate Entry", type: "geofenceEnter" }
    ]);
    const note = { event: "Speed Limit Exceeded", traccarType: "deviceOverspeed" };
    expect(
      eventMatchesAllowedLabels(note, ["Yard Speeding"], { "Yard Speeding": "deviceOverspeed" })
    ).toBe(true);
    expect(
      eventMatchesAllowedLabels(note, ["Gate Entry"], { "Gate Entry": "geofenceEnter" })
    ).toBe(false);
  });

  it("returns false for empty selection", () => {
    const note = { event: "Speed Limit Exceeded", traccarType: "deviceOverspeed" };
    expect(eventMatchesAllowedLabels(note, [])).toBe(false);
  });

  it("does not use substring wildcards", () => {
    const note = { event: "Speed Limit Exceeded", traccarType: "deviceOverspeed" };
    expect(eventMatchesAllowedLabels(note, ["speed"])).toBe(false);
    expect(eventMatchesAllowedLabels(note, ["device"])).toBe(false);
    expect(eventMatchesAllowedLabels(note, ["limit"])).toBe(false);
  });
});
