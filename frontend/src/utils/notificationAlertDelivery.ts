import type { NotificationRow } from "../data/notificationLibrary";

export type UserAlertDelivery = {
  email: boolean;
  inApp: boolean;
  /** SMS to the user's phone on file (sent by Vivitel server when configured). */
  sms: boolean;
};

export const DEFAULT_ACTIVE_MESSAGE_ALERT_DELIVERY: UserAlertDelivery = {
  email: true,
  inApp: true,
  sms: false
};

export const DEFAULT_ALERT_RECORDING_DELIVERY: UserAlertDelivery = {
  email: true,
  inApp: true,
  sms: true
};

/** Traccar must not deliver user alerts — the Vivitel worker sends email (Resend) and in-app alerts. */
export const TRACCAR_USER_ALERT_NOTIFICATORS = "";

export function normalizeUserAlertDelivery(
  value: Partial<UserAlertDelivery> | undefined,
  fallback: UserAlertDelivery
): UserAlertDelivery {
  return {
    email: value?.email ?? fallback.email,
    inApp: value?.inApp ?? fallback.inApp,
    sms: value?.sms ?? fallback.sms
  };
}

export function isAlertRecordingType(recordingType: string): boolean {
  const key = String(recordingType ?? "").trim().toLowerCase();
  return key === "notification" || key === "alert";
}

export function resolveUserAlertDeliveryForRow(
  row: Pick<NotificationRow, "parameters"> & { type?: string }
): UserAlertDelivery | null {
  const params = row.parameters;
  if (!params || typeof params !== "object") return null;

  // Location (geofence) alerts are independent of "Send active message".
  const locationAlert = row.type === "geofenceEnter" || row.type === "geofenceExit";
  const parts: UserAlertDelivery[] = [];

  if (params.active?.enabled) {
    parts.push(normalizeUserAlertDelivery(params.active.userAlerts, DEFAULT_ACTIVE_MESSAGE_ALERT_DELIVERY));
  }

  const recordingType = String(params.record?.recordingType ?? "").trim();
  if (locationAlert && isAlertRecordingType(recordingType)) {
    parts.push(
      normalizeUserAlertDelivery(
        params.record?.userAlerts ?? params.userAlerts,
        DEFAULT_ALERT_RECORDING_DELIVERY
      )
    );
  }

  if (!parts.length) return null;

  return {
    email: parts.some((row) => row.email),
    inApp: parts.some((row) => row.inApp),
    sms: parts.some((row) => row.sms)
  };
}

/** @deprecated User alerts are not sent via Traccar notificators. */
export function buildTraccarNotificatorsFromUserAlerts(_delivery: UserAlertDelivery | null | undefined): string {
  return TRACCAR_USER_ALERT_NOTIFICATORS;
}

export function buildTraccarNotificatorsForLibraryRow(_row: Pick<NotificationRow, "parameters">): string {
  return TRACCAR_USER_ALERT_NOTIFICATORS;
}

export function formatUserAlertDeliverySummary(delivery: UserAlertDelivery): string {
  const parts: string[] = [];
  if (delivery.email) parts.push("email (Vivitel / Resend)");
  if (delivery.inApp) parts.push("in-app");
  if (delivery.sms) parts.push("phone (SMS when configured)");
  return parts.length ? parts.join(", ") : "none";
}
