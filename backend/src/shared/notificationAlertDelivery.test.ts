import { describe, expect, it } from "vitest";
import {
  buildTraccarNotificatorsFromPayload,
  resolveUserAlertDeliveryFromParameters,
  resolveUserAlertDeliveryFromPayload,
  TRACCAR_USER_ALERT_NOTIFICATORS
} from "./notificationAlertDelivery";

describe("notificationAlertDelivery (backend)", () => {
  it("does not configure Traccar notificators", () => {
    expect(
      buildTraccarNotificatorsFromPayload({
        parameters: {
          active: { enabled: true, userAlerts: { email: true, inApp: true, sms: true } }
        }
      })
    ).toBe(TRACCAR_USER_ALERT_NOTIFICATORS);
  });

  it("never delivers when active message is not enabled", () => {
    expect(
      resolveUserAlertDeliveryFromParameters({
        active: { enabled: false, userAlerts: { email: true, inApp: true, sms: true } },
        record: { recordingType: "Notification", userAlerts: { email: true, inApp: true, sms: true } }
      })
    ).toBeNull();
  });

  it("location alerts are independent of the active message setting", () => {
    expect(
      resolveUserAlertDeliveryFromParameters(
        { record: { recordingType: "Notification", userAlerts: { email: true, inApp: true, sms: false } } },
        { locationAlert: true }
      )
    ).toEqual({ email: true, inApp: true, sms: false });
  });

  it("resolves location alerts that keep channels at the top of viviConfig", () => {
    const viviConfig = JSON.stringify({
      userAlerts: { email: true, inApp: false, sms: false },
      parameters: { selectedLocations: ["Gate"] }
    });
    expect(resolveUserAlertDeliveryFromPayload({ viviConfig }, { locationAlert: true })).toEqual({
      email: true,
      inApp: false,
      sms: false
    });
    expect(resolveUserAlertDeliveryFromPayload({ viviConfig })).toBeNull();
  });

  it("resolves active message delivery", () => {
    expect(
      resolveUserAlertDeliveryFromParameters({
        active: { enabled: true, userAlerts: { email: true, inApp: true, sms: false } }
      })
    ).toEqual({ email: true, inApp: true, sms: false });
  });
});
