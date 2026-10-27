import { describe, expect, it } from "vitest";
import {
  VIVI_CAMERA_ALARM_NOTIFICATION_NAMES,
  ensureSiteTraccarDefaultNotifications,
  notificationRows
} from "./notificationLibrary";

describe("VIVI camera alarm notifications", () => {
  it("are in the bundled library, available, with video capture on", () => {
    for (const name of VIVI_CAMERA_ALARM_NOTIFICATION_NAMES) {
      const row = notificationRows.find((item) => item.description === name);
      expect(row, name).toBeDefined();
      expect(row?.availability).toBe("Available");
      expect(row?.notificationVideo?.enabled).toBe(true);
    }
    expect(notificationRows.some((row) => row.description === "VIVI Phone Distraction")).toBe(true);
  });

  it("are added to a site library that lacks them without touching existing rows", () => {
    const custom = { description: "My custom alert", type: "Custom", availability: "Available", eventId: "7" };
    const { items, changed } = ensureSiteTraccarDefaultNotifications([custom]);
    expect(changed).toBe(true);
    for (const name of VIVI_CAMERA_ALARM_NOTIFICATION_NAMES) {
      expect(items.some((row) => row.description === name), name).toBe(true);
    }
    expect(items.some((row) => row.description === "My custom alert")).toBe(true);
  });

  it("keep a site's own edits to a VIVI row", () => {
    const edited = {
      description: "VIVI Smoking",
      type: "System",
      availability: "Unavailable",
      notificationVideo: { enabled: false, beforeSeconds: 5, afterSeconds: 5 }
    };
    const { items } = ensureSiteTraccarDefaultNotifications([edited]);
    const row = items.find((item) => item.description === "VIVI Smoking");
    expect(row?.availability).toBe("Unavailable");
    expect(row?.notificationVideo?.enabled).toBe(false);
  });
});
