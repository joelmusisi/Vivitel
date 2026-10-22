import { describe, expect, it } from "vitest";
import {
  buildTraccarNotificatorsForLibraryRow,
  resolveUserAlertDeliveryForRow,
  TRACCAR_USER_ALERT_NOTIFICATORS
} from "./notificationAlertDelivery";
import type { NotificationRow } from "../data/notificationLibrary";

describe("notificationAlertDelivery", () => {
  it("uses email and in-app when active message is enabled", () => {
    const row: NotificationRow = {
      description: "Speed Limit Exceeded",
      type: "deviceOverspeed",
      availability: "available",
      parameters: {
        active: { enabled: true, userAlerts: { email: true, inApp: true, sms: false } }
      }
    };
    expect(resolveUserAlertDeliveryForRow(row)).toEqual({ email: true, inApp: true, sms: false });
    expect(buildTraccarNotificatorsForLibraryRow(row)).toBe(TRACCAR_USER_ALERT_NOTIFICATORS);
  });

  it("uses all channels for alert recording type", () => {
    const row: NotificationRow = {
      description: "Entered Depot",
      type: "geofenceEnter",
      availability: "available",
      parameters: {
        record: {
          recordingType: "Notification",
          userAlerts: { email: true, inApp: true, sms: true }
        }
      }
    };
    expect(resolveUserAlertDeliveryForRow(row)).toEqual({ email: true, inApp: true, sms: true });
    expect(buildTraccarNotificatorsForLibraryRow(row)).toBe("");
  });

  it("never delivers when active message is not enabled", () => {
    const row: NotificationRow = {
      description: "Ignition On",
      type: "ignitionOn",
      availability: "available",
      parameters: {
        record: { recordingType: "Notification", userAlerts: { email: true, inApp: true, sms: true } }
      }
    };
    expect(resolveUserAlertDeliveryForRow(row)).toBeNull();
  });

  it("returns null when no user alert settings apply", () => {
    const row: NotificationRow = {
      description: "Ignition On",
      type: "ignitionOn",
      availability: "available",
      parameters: { record: { recordingType: "Detailed" } }
    };
    expect(resolveUserAlertDeliveryForRow(row)).toBeNull();
  });
});
