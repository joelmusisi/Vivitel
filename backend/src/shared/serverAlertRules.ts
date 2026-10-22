/**
 * Server-side evaluation of notification-library alerts.
 *
 * Library rows with conditions ("Speed > 80", "IO3 is true", "Power < 9") used to be
 * compiled into Traccar computed attributes named `viviEvt_<id>`. Traccar only raises
 * an alarm event for an attribute named `alarm`, so those alerts never fired. Vivitel
 * now evaluates them itself on every position from the live feed, with the same field
 * and operator rules the frontend compiler uses (frontend/src/utils/traccarAttributeMapper.ts).
 *
 * Built-in events (ignition, geofence, overspeed, status...) stay on Traccar's own event
 * handlers; nativeTraccarTypeForLibraryRow maps those rows to the event type.
 */

export type LibraryCondition = { field?: string; operator?: string; value?: string; join?: string };

export type ServerLibraryRow = {
  description?: string;
  type?: string;
  availability?: string;
  eventId?: string;
  parameters?: {
    conditions?: LibraryCondition[];
    returnValue?: { param?: string; mode?: string };
    record?: { delay?: { hours?: string; minutes?: string; seconds?: string } };
    fuelCompute?: unknown;
  };
};

export type ParameterCatalogRow = { name?: string; type?: string };

export type TraccarPositionLike = {
  speed?: number;
  course?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  accuracy?: number;
  address?: string | null;
  attributes?: Record<string, unknown>;
};

const key = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Library names Traccar raises natively (frontend TRACCAR_EVENT_TYPE_BY_NAME). */
const NATIVE_EVENT_TYPE_BY_NAME: Record<string, string> = {
  "status online": "deviceOnline",
  "status offline": "deviceOffline",
  "device inactive": "deviceUnknown",
  "device moving": "deviceMoving",
  "device stopped": "deviceStopped",
  "ignition on": "ignitionOn",
  "ignition off": "ignitionOff",
  "speed limit exceeded": "deviceOverspeed",
  "fuel drop": "fuelDrop",
  "fuel increase": "fuelIncrease",
  "fuel siphoning": "fuelDrop",
  "fuel gradual drop": "fuelDrop",
  "fuel refill (detected)": "fuelIncrease",
  "fuel siphoning (detected)": "fuelDrop",
  "geofence entered": "geofenceEnter",
  "geofence exited": "geofenceExit",
  alarm: "alarm",
  media: "media",
  "driver changed": "driverChanged",
  "maintenance required": "maintenance"
};

/** The Traccar event type for a built-in library row, or "" for a custom (condition) row. */
export function nativeTraccarTypeForLibraryRow(row: ServerLibraryRow): string {
  return NATIVE_EVENT_TYPE_BY_NAME[key(row.description)] ?? "";
}

/** Same field map as the frontend compiler: position fields and Traccar attribute names. */
const POSITION_FIELD_MAP: Record<string, string> = {
  speed: "speed",
  "road speed": "speed",
  "gps velocity": "speed",
  course: "course",
  latitude: "latitude",
  longitude: "longitude",
  altitude: "altitude",
  accuracy: "accuracy",
  address: "address",
  ignition: "ignition",
  "ignition on": "ignition",
  "ignition off": "ignition",
  battery: "battery",
  distance: "distance",
  "total distance": "totalDistance",
  odometer: "odometer",
  "odometer reading": "odometer",
  satellites: "sat",
  sat: "sat",
  motion: "motion",
  "engine hours": "hours",
  "vehicle moving": "motion",
  "device moving": "motion",
  charge: "charge",
  charging: "charge",
  "internal battery charging state": "charge",
  "internal battery charging status": "charge",
  blocked: "blocked",
  armed: "armed",
  door: "door",
  fuel: "fuel",
  fuellevel: "fuelLevel",
  "fuel level": "fuelLevel",
  "fuel level (l)": "fuelLevel",
  "fuel used": "fuelUsed"
};

/** Position properties (not attributes) in Traccar's JEXL context. */
const POSITION_PROPERTIES = new Set(["speed", "course", "latitude", "longitude", "altitude", "accuracy", "address"]);
const IO_FIELD = /^io\s*(\d{1,2})$/i;
const IO_MAX = 15;

export function parameterToAttributeKey(name: string): string {
  return (
    String(name ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "param"
  );
}

const catalogName = (field: string, catalog?: ParameterCatalogRow[]) => {
  const wanted = key(field);
  const row = catalog?.find((item) => key(item.name) === wanted);
  return String(row?.name ?? field).trim();
};

/** Value of a condition field on a position. Speed is returned in km/h (library thresholds are km/h). */
export function resolveConditionValue(
  field: string,
  position: TraccarPositionLike,
  catalog?: ParameterCatalogRow[]
): unknown {
  const name = catalogName(field, catalog);
  if (!name) return undefined;
  const attrs = position.attributes ?? {};
  const mapped = POSITION_FIELD_MAP[key(name)];
  if (mapped) {
    if (mapped === "speed") {
      const knots = Number(position.speed);
      return Number.isFinite(knots) ? knots * 1.852 : undefined;
    }
    if (POSITION_PROPERTIES.has(mapped)) return (position as Record<string, unknown>)[mapped];
    return attrs[mapped];
  }
  const io = name.match(IO_FIELD) ?? name.match(/(?:^|\b)io\s*(\d+)(?:\b|$)/i);
  if (io) {
    const channel = Number(io[1]);
    if (channel >= 1 && channel <= IO_MAX) return attrs[`io${channel}`] ?? attrs[`IO${channel}`];
  }
  return attrs[name] ?? attrs[parameterToAttributeKey(name)];
}

const asBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = key(value);
  if (raw === "true" || raw === "1" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return undefined;
};

/** One condition: true / false, or null when the device did not report the field. */
export function evaluateCondition(actual: unknown, operator: string, expected: string): boolean | null {
  if (actual === undefined || actual === null || actual === "") return null;
  const op = String(operator ?? "").trim();
  const want = String(expected ?? "").trim();
  const wantNumber = Number(want);
  const actualNumber = Number(actual);
  const numeric = want !== "" && Number.isFinite(wantNumber) && Number.isFinite(actualNumber) && typeof actual !== "boolean";

  if (op === "is" || op === "=" || op === "is not") {
    let equal: boolean;
    if (/^(true|false)$/i.test(want)) {
      const actualBool = asBoolean(actual);
      if (actualBool === undefined) return null;
      equal = actualBool === (want.toLowerCase() === "true");
    } else if (numeric) {
      equal = actualNumber === wantNumber;
    } else {
      equal = key(actual) === key(want);
    }
    return op === "is not" ? !equal : equal;
  }
  if (!numeric) return null;
  switch (op) {
    case "<":
      return actualNumber < wantNumber;
    case "<=":
      return actualNumber <= wantNumber;
    case ">":
      return actualNumber > wantNumber;
    case ">=":
      return actualNumber >= wantNumber;
    default:
      return null;
  }
}

const meaningfulConditions = (row: ServerLibraryRow): LibraryCondition[] => {
  const conditions = (row.parameters?.conditions ?? []).filter(
    (condition) => String(condition.field ?? "").trim() && String(condition.operator ?? "").trim()
  );
  // A return parameter replaces the condition field (frontend remapConditionsToReturnParameter).
  const returnParam = String(row.parameters?.returnValue?.param ?? "").trim();
  if (returnParam && key(returnParam) !== "no return value" && !/fuel/i.test(returnParam)) {
    return conditions.map((condition) => ({ ...condition, field: returnParam }));
  }
  return conditions;
};

/**
 * Whole rule on one position. Joins follow JEXL precedence: AND binds tighter than OR,
 * so "a and b or c" is (a && b) || c — the same as the expression Traccar was given.
 */
export function evaluateLibraryRow(
  row: ServerLibraryRow,
  position: TraccarPositionLike,
  catalog?: ParameterCatalogRow[]
): boolean {
  const conditions = meaningfulConditions(row);
  if (!conditions.length) return false;
  const groups: boolean[][] = [[]];
  conditions.forEach((condition, index) => {
    const result = evaluateCondition(
      resolveConditionValue(String(condition.field), position, catalog),
      String(condition.operator),
      String(condition.value ?? "")
    );
    groups[groups.length - 1].push(result === true);
    const join = key(conditions[index].join ?? "and");
    if (index < conditions.length - 1 && (join === "or" || join === "||")) groups.push([]);
  });
  return groups.some((group) => group.length > 0 && group.every(Boolean));
}

/** Rows Vivitel evaluates itself: available, custom (not a built-in Traccar event), with conditions, not fuel computation. */
export function isServerEvaluatedLibraryRow(row: ServerLibraryRow): boolean {
  if (key(row.availability) !== "available") return false;
  if (nativeTraccarTypeForLibraryRow(row)) return false;
  if (row.parameters?.fuelCompute) return false;
  return meaningfulConditions(row).length > 0;
}

/** How long the condition must hold before the alert fires (library "Delay"). */
export function libraryRowDelayMs(row: ServerLibraryRow): number {
  const delay = row.parameters?.record?.delay;
  const part = (value: unknown) => {
    const n = Number(String(value ?? "").trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return ((part(delay?.hours) * 60 + part(delay?.minutes)) * 60 + part(delay?.seconds)) * 1000;
}

export type RuleEpisodeState = { since: number | null; fired: boolean; lastFixMs: number };

/**
 * Edge-triggered firing: once when the condition has held for the delay, then not again
 * until it has been false. Out-of-order positions are ignored.
 */
export function advanceRuleEpisode(
  state: RuleEpisodeState | undefined,
  matched: boolean,
  fixMs: number,
  delayMs: number
): { state: RuleEpisodeState; fire: boolean } {
  const current: RuleEpisodeState = state ?? { since: null, fired: false, lastFixMs: 0 };
  if (!Number.isFinite(fixMs) || fixMs < current.lastFixMs) return { state: current, fire: false };
  if (!matched) return { state: { since: null, fired: false, lastFixMs: fixMs }, fire: false };
  const since = current.since ?? fixMs;
  const fire = !current.fired && fixMs - since >= delayMs;
  return { state: { since, fired: current.fired || fire, lastFixMs: fixMs }, fire };
}
