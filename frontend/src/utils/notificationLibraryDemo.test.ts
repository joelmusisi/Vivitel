import { describe, expect, it } from "vitest";
import type { NotificationRow } from "../data/notificationLibrary";
import {
  buildTraccarComputedAttributePayloadFromLibrary,
  buildTraccarNotificationPayloadFromLibrary,
  libraryRowNeedsComputedAttribute
} from "./traccarNotificationLibrarySync";

// A demo "Over Speeding" notification with every library setting filled in.
const hms = (h: string, m: string, s: string) => ({ hours: h, minutes: m, seconds: s });

const demoOverSpeeding: NotificationRow = {
  description: "Over Speeding",
  type: "Custom",
  availability: "Available",
  eventId: "demo-over-speeding",
  notificationVideo: { enabled: true, beforeSeconds: 10, afterSeconds: 10, durationSeconds: 20, views: ["front", "cabin"] },
  parameters: {
    conditions: [
      { id: 1, field: "Speed", operator: ">", value: "80", join: "and" },
      { id: 2, field: "Ignition", operator: "is", value: "true" }
    ],
    returnValue: { param: "No return value", mode: "None" },
    record: {
      event: true,
      delay: hms("0", "0", "30"),
      recordingType: "Alert",
      actions: { startOdometer: true, endOdometer: true, startPosition: true, endPosition: true },
      userAlerts: { email: true, inApp: true, sms: false }
    },
    actions: {
      buzzer: { enabled: true, delay: hms("0", "0", "5"), duration: "10", override: false },
      relayOne: { enabled: false, delay: hms("0", "0", "0"), duration: "0", override: false },
      relayTwo: { enabled: false, delay: hms("0", "0", "0"), duration: "0", override: false }
    },
    active: {
      enabled: true,
      queueDelay: hms("0", "0", "0"),
      queueMode: "Immediate",
      priority: "High",
      sendPosition: true,
      tracking: true,
      trackingDelay: hms("0", "0", "0"),
      trackingInterval: hms("0", "0", "30"),
      userAlerts: { email: true, inApp: true, sms: false }
    }
  } as NotificationRow["parameters"]
};

describe("demo Over Speeding notification → Traccar", () => {
  const notification = buildTraccarNotificationPayloadFromLibrary(demoOverSpeeding, undefined, undefined, {
    tenantId: "demo-tenant"
  });
  const attrs = notification.attributes as Record<string, unknown>;
  const config = JSON.parse(String(attrs.viviConfig));

  it("is an alarm notification Traccar does not deliver itself, linked per device", () => {
    expect(notification.type).toBe("alarm");
    expect(notification.notificators).toBe("");
    expect(notification.always).toBe(false);
    expect(attrs.viviSource).toBe("notification-library");
    expect(attrs.viviTenantId).toBe("demo-tenant");
  });

  it("stores every setting verbatim in the Traccar attributes", () => {
    expect(config.parameters).toEqual(demoOverSpeeding.parameters);
    expect(config.notificationVideo).toEqual(demoOverSpeeding.notificationVideo);
    expect(config.availability).toBe("Available");
    expect(JSON.parse(String(attrs.viviConditions))).toEqual(demoOverSpeeding.parameters?.conditions);
  });

  it("compiles both conditions into the Traccar expressions", () => {
    expect(attrs.viviComputedExpression).toBe("(speed * 1.852) > 80 && ignition == true");
    expect(libraryRowNeedsComputedAttribute(demoOverSpeeding)).toBe(true);
    const computed = buildTraccarComputedAttributePayloadFromLibrary(demoOverSpeeding, undefined, { tenantId: "demo-tenant" });
    expect(computed.attribute).toBe("viviEvt_demo_over_speeding");
    expect(computed.type).toBe("number");
    expect(computed.expression).toBe(
      "var maxSpeedKph = 80; var speedKph = speed * 1.852; (ignition == true) && speedKph > maxSpeedKph ? speedKph - maxSpeedKph : null"
    );
  });
});
