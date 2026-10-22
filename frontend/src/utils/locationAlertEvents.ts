/** Location Alerts monitor only these notification event types. */
export const LOCATION_Alert_EVENT_TYPES = [
  "Distance in location",
  "Duration at location",
  "Event at location",
  "Location entry",
  "Location exit",
  "Location started",
  "Location stopped",
  "Location entry and exit",
  "Movement alert",
  "Over-speeding in location"
] as const;

export type LocationAlertEventType = (typeof LOCATION_Alert_EVENT_TYPES)[number];

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function isLocationAlertEventType(value: unknown): value is LocationAlertEventType {
  const key = normalize(value);
  return LOCATION_Alert_EVENT_TYPES.some((entry) => normalize(entry) === key);
}

export function normalizeLocationAlertEventType(value: unknown): LocationAlertEventType | "" {
  const key = normalize(value);
  return LOCATION_Alert_EVENT_TYPES.find((entry) => normalize(entry) === key) ?? "";
}
