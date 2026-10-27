import { describe, expect, it } from "vitest";
import {
  applyDigitalEventLibraryDefaults,
  isDigitalNotificationDescription,
  notificationRows
} from "./notificationLibrary";

describe("digital notification seed", () => {
  it("treats boolean events as digital", () => {
    for (const name of [
      "Ignition on",
      "Ignition off",
      "Power Disconnected",
      "Power Reconnected",
      "GPS jamming",
      "GPRS jamming",
      "Jamming Detect",
      "Door Opened",
      "Input 1 High",
      "Input 1 Low",
      "Digital Input 1",
      "Panic Alert",
      "Device moving",
      "Geofence entered",
      "Status online"
    ]) {
      expect(isDigitalNotificationDescription(name), name).toBe(true);
    }
  });

  it("leaves threshold events for the user to configure", () => {
    for (const name of [
      "Over speeding",
      "Harsh braking",
      "Harsh Cornering",
      "Engine Temperature",
      "Fuel Level Low",
      "Fuel drop",
      "Low Battery",
      "Analog Input 1",
      "External Voltage",
      "Speed",
      "Alert: No GPRS Coverage for 30 min",
      "Cold Chain - Door open too long",
      "Impact Detect Moderate",
      "Speed detected during ignition off",
      "Ignition On Counter"
    ]) {
      expect(isDigitalNotificationDescription(name), name).toBe(false);
    }
  });

  it("seeds a new site library with digital events available and the rest unavailable", () => {
    const byName = new Map(notificationRows.map((row) => [row.description.toLowerCase(), row]));

    for (const name of ["Ignition on", "Ignition off", "Power Disconnected", "Power Reconnected", "GPRS jamming"]) {
      const row = byName.get(name.toLowerCase());
      expect(row, name).toBeTruthy();
      expect(row?.type, name).toBe("Default");
      expect(row?.availability, name).toBe("Available");
    }

    for (const name of ["Speed limit exceeded", "Harsh braking", "Engine Temperature", "Fuel Level Low", "Low Battery"]) {
      const row = byName.get(name.toLowerCase());
      expect(row, name).toBeTruthy();
      expect(row?.availability, name).toBe("Unavailable");
    }

    const computed = byName.get("fuel level (computed)");
    expect(computed?.type).toBe("Computed");
    expect(computed?.availability).toBe("Unavailable");
  });

  it("upgrades stored unavailable digital events without clearing a suspended one", () => {
    const upgraded = applyDigitalEventLibraryDefaults([
      { description: "Ignition on", type: "System", availability: "Unavailable" },
      { description: "Power Disconnected", type: "Default", availability: "Suspended" },
      { description: "Over speeding", type: "System", availability: "Available" },
      { description: "Custom ignition note", type: "Custom", availability: "Unavailable" }
    ]);

    expect(upgraded.changed).toBe(true);
    expect(upgraded.items[0]).toMatchObject({ type: "Default", availability: "Available" });
    expect(upgraded.items[1]).toMatchObject({ type: "Default", availability: "Suspended" });
    expect(upgraded.items[2]).toMatchObject({ type: "System", availability: "Available" });
    expect(upgraded.items[3]).toMatchObject({ type: "Custom", availability: "Unavailable" });
  });
});
