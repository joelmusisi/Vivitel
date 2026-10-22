import {
  buildComputedAttributeExpressionFromLibrary,
  buildJexlExpressionFromConditions,
  readFuelComputeConfig,
  resolveComputedAttributeTypeFromLibrary,
  resolveFuelComputeOutputAttribute,
  toComputedAttributeKey
} from "./traccarAttributeMapper";
import { TRACCAR_USER_ALERT_NOTIFICATORS } from "./notificationAlertDelivery";

type NotificationCondition = {
  field?: string;
  operator?: string;
  value?: string;
};

const TRACCAR_EVENT_TYPE_BY_NAME: Record<string, string> = {
  "status online": "deviceOnline",
  "status offline": "deviceOffline",
  "device inactive": "deviceUnknown",
  "device moving": "deviceMoving",
  "ignition on": "ignitionOn",
  "ignition off": "ignitionOff",
  "speed limit exceeded": "deviceOverspeed",
  "fuel drop": "fuelDrop",
  "fuel increase": "fuelIncrease",
  "fuel siphoning": "fuelDrop",
  "fuel gradual drop": "fuelDrop",
  "geofence entered": "geofenceEnter",
  "geofence exited": "geofenceExit",
  alarm: "alarm",
  media: "media",
  "driver changed": "driverChanged",
  "maintenance required": "maintenance"
};

function normalizeKey(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export { buildJexlExpressionFromConditions, toComputedAttributeKey } from "./traccarAttributeMapper";

export function resolveTraccarNotificationType(description: string, libraryType: string): string {
  const mapped = TRACCAR_EVENT_TYPE_BY_NAME[normalizeKey(description)];
  if (mapped) return mapped;
  if (normalizeKey(libraryType) === "default") return "alarm";
  return "alarm";
}

export function buildTraccarNotificationPayload(bindingId: string, payload: Record<string, unknown>) {
  const description = String(payload.description ?? payload.name ?? bindingId).trim() || bindingId;
  const eventId = String(payload.eventId ?? "").trim();
  const availability = String(payload.availability ?? "").trim();
  const libraryType = String(payload.type ?? "").trim();
  const parameters = payload.parameters && typeof payload.parameters === "object" ? payload.parameters : {};
  const conditions = Array.isArray((parameters as any).conditions) ? (parameters as any).conditions : [];

  return {
    type: resolveTraccarNotificationType(description, libraryType),
    description,
    always: false,
    notificators: TRACCAR_USER_ALERT_NOTIFICATORS,
    commandId: 0,
    calendarId: 0,
    attributes: {
      viviLibraryId: bindingId,
      viviBindingId: bindingId,
      viviSource: "notification-library",
      ...(eventId ? { viviEventId: eventId } : {}),
      ...(libraryType ? { viviType: libraryType } : {}),
      ...(availability ? { viviAvailability: availability } : {}),
      viviConfig: JSON.stringify({
        description,
        eventId,
        type: libraryType,
        availability,
        notificationVideo: payload.notificationVideo ?? null,
        parameters
      }),
      viviConditions: JSON.stringify(conditions),
      viviComputedExpression: buildJexlExpressionFromConditions(conditions)
    }
  };
}

export function buildTraccarComputedAttributePayload(bindingId: string, payload: Record<string, unknown>) {
  const description = String(payload.description ?? payload.name ?? bindingId).trim() || bindingId;
  const eventId = String(payload.eventId ?? "").trim();
  const fuelCompute = readFuelComputeConfig({
    description,
    parameters:
      payload.parameters && typeof payload.parameters === "object"
        ? (payload.parameters as { fuelCompute?: import("./traccarAttributeMapper").FuelComputeConfig })
        : undefined
  });
  const isFuelCompute = fuelCompute != null;
  const expression = buildComputedAttributeExpressionFromLibrary(payload);
  const computedType = resolveComputedAttributeTypeFromLibrary(payload);
  const attribute = isFuelCompute
    ? resolveFuelComputeOutputAttribute({ description, parameters: payload.parameters as any })
    : toComputedAttributeKey(eventId || bindingId);

  return {
    description,
    attribute,
    expression,
    type: computedType,
    priority: isFuelCompute ? 1 : 0,
    attributes: {
      viviLibraryId: bindingId,
      viviBindingId: bindingId,
      viviSource: "notification-library",
      ...(eventId ? { viviEventId: eventId } : {}),
      ...(isFuelCompute ? { viviComputeKind: "fuel-level" } : {}),
      viviConfig: JSON.stringify({
        description,
        eventId,
        type: payload.type,
        availability: payload.availability,
        notificationVideo: payload.notificationVideo ?? null,
        parameters: payload.parameters ?? null
      }),
      viviComputedExpression: expression
    }
  };
}

export { readViviLibraryIdFromComputedItem as readViviLibraryId } from "./traccarComputedAttributeApi";
