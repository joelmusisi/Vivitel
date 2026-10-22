import { describe, expect, it } from "vitest";
import {
  countMonitoredEventsInCatalog,
  monitoredEventsInclude,
  normalizeMonitoredEvents,
  toggleMonitoredEvent
} from "./notificationLibrary";

const catalog = [
  { description: "Ignition on", type: "Default" },
  { description: "Fuel increase", type: "Default" },
  { description: "Fuel Siphoning", type: "Default" },
  { description: "Custom site alert", type: "Custom" }
];

describe("monitored event helpers", () => {
  it("resolves aliases when normalizing monitored events", () => {
    expect(
      normalizeMonitoredEvents(catalog, [
        "Ignition On",
        "Fuel refill (detected)",
        "Fuel siphoning (detected)",
        "Unknown event"
      ])
    ).toEqual(["Ignition on", "Fuel increase", "Fuel Siphoning"]);
  });

  it("counts only catalog-matched selections", () => {
    expect(
      countMonitoredEventsInCatalog(catalog, ["Ignition On", "Unknown event", "Fuel increase"])
    ).toBe(2);
  });

  it("matches checkboxes via aliases", () => {
    expect(monitoredEventsInclude(["Ignition On"], "Ignition on")).toBe(true);
    expect(monitoredEventsInclude(["Fuel refill (detected)"], "Fuel increase")).toBe(true);
    expect(monitoredEventsInclude(["Ignition on"], "Fuel increase")).toBe(false);
  });

  it("toggles alias-aware monitored events", () => {
    const removed = toggleMonitoredEvent(["Ignition On", "Fuel increase"], "Ignition on");
    expect(removed).toEqual(["Fuel increase"]);
    const added = toggleMonitoredEvent(["Fuel increase"], "Ignition on");
    expect(added).toEqual(["Fuel increase", "Ignition on"]);
  });
});
