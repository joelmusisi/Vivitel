export type UserAlertDelivery = {
  email: boolean;
  inApp: boolean;
  sms: boolean;
};

const DEFAULT_ACTIVE: UserAlertDelivery = { email: true, inApp: true, sms: false };
const DEFAULT_ALERT_RECORD: UserAlertDelivery = { email: true, inApp: true, sms: true };

/** Traccar must not deliver user alerts — Vivitel worker sends via Resend / in-app. */
export const TRACCAR_USER_ALERT_NOTIFICATORS = "";

function normalizeUserAlertDelivery(
  value: Partial<UserAlertDelivery> | undefined,
  fallback: UserAlertDelivery
): UserAlertDelivery {
  return {
    email: value?.email ?? fallback.email,
    inApp: value?.inApp ?? fallback.inApp,
    sms: value?.sms ?? fallback.sms
  };
}

function isAlertRecordingType(recordingType: string): boolean {
  const key = String(recordingType ?? "").trim().toLowerCase();
  return key === "notification" || key === "alert";
}

export function isLocationAlertType(type: unknown): boolean {
  const key = String(type ?? "").trim();
  return key === "geofenceEnter" || key === "geofenceExit";
}

export function resolveUserAlertDeliveryFromParameters(
  parameters: Record<string, unknown> | undefined | null,
  options: { locationAlert?: boolean } = {}
): UserAlertDelivery | null {
  if (!parameters || typeof parameters !== "object") return null;

  const active =
    parameters.active && typeof parameters.active === "object"
      ? (parameters.active as Record<string, unknown>)
      : {};
  const record =
    parameters.record && typeof parameters.record === "object"
      ? (parameters.record as Record<string, unknown>)
      : {};

  // "Send active message" must be saved as enabled, otherwise no alert is sent.
  // Location (geofence) alerts are independent of this rule.
  const parts: UserAlertDelivery[] = [];

  if (Boolean(active.enabled)) {
    const ua =
      active.userAlerts && typeof active.userAlerts === "object"
        ? (active.userAlerts as Partial<UserAlertDelivery>)
        : undefined;
    parts.push(normalizeUserAlertDelivery(ua, DEFAULT_ACTIVE));
  }

  const recordingType = String(record.recordingType ?? "").trim();
  if (options.locationAlert && isAlertRecordingType(recordingType)) {
    const recordAlerts =
      record.userAlerts && typeof record.userAlerts === "object"
        ? (record.userAlerts as Partial<UserAlertDelivery>)
        : undefined;
    const rootAlerts =
      parameters.userAlerts && typeof parameters.userAlerts === "object"
        ? (parameters.userAlerts as Partial<UserAlertDelivery>)
        : undefined;
    parts.push(normalizeUserAlertDelivery(recordAlerts ?? rootAlerts, DEFAULT_ALERT_RECORD));
  }

  if (!parts.length) return null;

  return {
    email: parts.some((row) => row.email),
    inApp: parts.some((row) => row.inApp),
    sms: parts.some((row) => row.sms)
  };
}

export function resolveUserAlertDeliveryFromPayload(
  payload: Record<string, unknown>,
  options: { locationAlert?: boolean } = {}
): UserAlertDelivery | null {
  const parameters =
    payload.parameters && typeof payload.parameters === "object"
      ? (payload.parameters as Record<string, unknown>)
      : parseViviConfigParameters(payload);
  const resolved = resolveUserAlertDeliveryFromParameters(parameters, options);
  if (resolved || !options.locationAlert) return resolved;

  // Location alerts saved from Location Alerts keep their channels at the top of viviConfig,
  // not under parameters.record, so they would otherwise never resolve to a channel.
  const raw = payload.viviConfig ?? (payload.attributes as any)?.viviConfig;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const userAlerts =
      parsed.userAlerts && typeof parsed.userAlerts === "object"
        ? (parsed.userAlerts as Partial<UserAlertDelivery>)
        : undefined;
    return normalizeUserAlertDelivery(userAlerts, DEFAULT_ALERT_RECORD);
  } catch {
    return null;
  }
}

export function parseViviConfigParameters(source: Record<string, unknown>): Record<string, unknown> | null {
  const raw = source.viviConfig ?? (source.attributes as any)?.viviConfig;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed.parameters && typeof parsed.parameters === "object"
      ? (parsed.parameters as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** @deprecated Traccar does not send user alerts; kept for API compatibility. */
export function buildTraccarNotificatorsFromPayload(_payload: Record<string, unknown>): string {
  return TRACCAR_USER_ALERT_NOTIFICATORS;
}
