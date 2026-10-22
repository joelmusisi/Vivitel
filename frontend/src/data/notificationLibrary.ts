// Central notification library for use across the app
export const DEFAULT_NOTIFICATION_AVAILABILITY = "Unavailable";

export function normalizeNotificationAvailability(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return DEFAULT_NOTIFICATION_AVAILABILITY;
  const lc = raw.toLowerCase();
  if (lc === "available") return "Available";
  if (lc === "unavailable" || lc === "un available" || lc.startsWith("not available")) {
    return "Unavailable";
  }
  if (lc === "suspended" || lc === "suspend") return "Suspended";
  return DEFAULT_NOTIFICATION_AVAILABILITY;
}

export interface NotificationRow {
  description: string;
  type: string;
  availability: string;
  eventId?: string;
  /** Cached Traccar notification id — skips full GET /notifications on later saves. */
  traccarNotificationId?: number;
  /** Cached Traccar computed-attribute id — skips full GET /attributes/computed on later saves. */
  traccarComputedAttributeId?: number;
  notificationVideo?: {
    enabled?: boolean;
    beforeSeconds?: number;
    afterSeconds?: number;
    durationSeconds?: number;
    views?: string[];
  };
  parameters?: {
    conditions?: Array<{
      id: number;
      field: string;
      operator: string;
      value: string;
      /** Join to the next condition when multiple conditions are set. */
      join?: "and" | "or";
    }>;
    returnValue?: { param: string; mode: string };
    record?: {
      event?: boolean;
      delay?: { hours: string; minutes: string; seconds: string };
      recordingType?: string;
      actions?: { startOdometer?: boolean; endOdometer?: boolean; startPosition?: boolean; endPosition?: boolean };
      /** Delivery when recording type is Alert (notification-only). */
      userAlerts?: { email?: boolean; inApp?: boolean; sms?: boolean };
    };
    actions?: {
      buzzer?: { enabled?: boolean; delay?: { hours: string; minutes: string; seconds: string }; duration?: string; override?: boolean };
      relayOne?: { enabled?: boolean; delay?: { hours: string; minutes: string; seconds: string }; duration?: string; override?: boolean };
      relayTwo?: { enabled?: boolean; delay?: { hours: string; minutes: string; seconds: string }; duration?: string; override?: boolean };
    };
    active?: {
      enabled?: boolean;
      queueDelay?: { hours: string; minutes: string; seconds: string };
      queueMode?: string;
      priority?: string;
      sendPosition?: boolean;
      tracking?: boolean;
      trackingDelay?: { hours: string; minutes: string; seconds: string };
      trackingInterval?: { hours: string; minutes: string; seconds: string };
      /** When active message is enabled: default email + in-app. */
      userAlerts?: { email?: boolean; inApp?: boolean; sms?: boolean };
    };
    /** User alert channels when recording type is Alert (email, in-app, phone). */
    userAlerts?: { email?: boolean; inApp?: boolean; sms?: boolean };
    fuelCompute?: {
      enabled?: boolean;
      tankCapacity?: string;
      inputField?: string;
      scale?: string;
      outputAttribute?: string;
    };
  };
}

export const FUEL_LEVEL_COMPUTE_NOTIFICATION_DESCRIPTION = "Fuel level (computed)";

/** Traccar native fuel events — active / record / video only (no parameter conditions). */
export const FUEL_SIPHONING_NOTIFICATION_DESCRIPTION = "Fuel Siphoning";
export const FUEL_DROP_NOTIFICATION_DESCRIPTION = "Fuel drop";
export const FUEL_INCREASE_NOTIFICATION_DESCRIPTION = "Fuel increase";
export const FUEL_GRADUAL_DROP_NOTIFICATION_DESCRIPTION = "Fuel Gradual drop";

/** @deprecated Use FUEL_INCREASE_NOTIFICATION_DESCRIPTION */
export const FUEL_REFILL_NOTIFICATION_DESCRIPTION = "Fuel refill (detected)";
/** @deprecated Use FUEL_SIPHONING_NOTIFICATION_DESCRIPTION */
export const FUEL_SIPHONING_DETECTED_DESCRIPTION = "Fuel siphoning (detected)";

/** Parameter choice that opens the tank-capacity / input-voltage / scale formula editor. */
export const FUEL_TANK_COMPUTATION_PARAMETER = "Fuel tank computation";

export const activeOnlyFuelNotificationDescriptions = [
  FUEL_SIPHONING_NOTIFICATION_DESCRIPTION,
  FUEL_DROP_NOTIFICATION_DESCRIPTION,
  FUEL_INCREASE_NOTIFICATION_DESCRIPTION,
  FUEL_GRADUAL_DROP_NOTIFICATION_DESCRIPTION
] as const;

export const dedicatedFuelNotificationDescriptions = [FUEL_LEVEL_COMPUTE_NOTIFICATION_DESCRIPTION] as const;

const fuelNotificationKey = (value: string) => String(value ?? "").trim().toLowerCase();

export function isFuelLevelComputeDescription(description: string): boolean {
  return fuelNotificationKey(description) === fuelNotificationKey(FUEL_LEVEL_COMPUTE_NOTIFICATION_DESCRIPTION);
}

export function isActiveOnlyFuelNotificationDescription(description: string): boolean {
  const key = fuelNotificationKey(description);
  return activeOnlyFuelNotificationDescriptions.some((name) => fuelNotificationKey(name) === key);
}

/** @deprecated */
export function isFuelRefillDescription(description: string): boolean {
  const key = fuelNotificationKey(description);
  return (
    key === fuelNotificationKey(FUEL_REFILL_NOTIFICATION_DESCRIPTION)
    || key === fuelNotificationKey(FUEL_INCREASE_NOTIFICATION_DESCRIPTION)
  );
}

/** @deprecated */
export function isFuelSiphoningDescription(description: string): boolean {
  const key = fuelNotificationKey(description);
  return (
    key === fuelNotificationKey(FUEL_SIPHONING_DETECTED_DESCRIPTION)
    || key === fuelNotificationKey(FUEL_SIPHONING_NOTIFICATION_DESCRIPTION)
  );
}

export function isDedicatedFuelNotificationDescription(description: string): boolean {
  return isFuelLevelComputeDescription(description);
}

export function activeOnlyFuelEventHelp(description: string): string {
  const key = fuelNotificationKey(description);
  if (key === fuelNotificationKey(FUEL_INCREASE_NOTIFICATION_DESCRIPTION)) {
    return "Fuel increase is counted only while the asset is parked/stationary. Changes of 2 L or more within 10 seconds while moving or in trip are ignored as sensor splash. Configure active message, record, and video below.";
  }
  if (key === fuelNotificationKey(FUEL_GRADUAL_DROP_NOTIFICATION_DESCRIPTION)) {
    return "Gradual fuel loss is counted only while parked/stationary. Rapid 2 L / 10 s changes while moving are ignored. Configure active message, record, and video below.";
  }
  if (key === fuelNotificationKey(FUEL_SIPHONING_NOTIFICATION_DESCRIPTION)) {
    return "Sudden fuel loss or siphoning is counted only while parked/stationary. Rapid 2 L / 10 s changes while moving or in trip are ignored. Configure active message, record, and video below.";
  }
  if (key === fuelNotificationKey(FUEL_DROP_NOTIFICATION_DESCRIPTION)) {
    return "Fuel drop is counted only while the asset is parked/stationary. Changes of 2 L or more within 10 seconds while moving are ignored. Configure active message, record, and video below.";
  }
  return "Device fuel event. Parameters and computed attributes are fixed; use the Active message and other sections below.";
}

export function isFuelTankComputationParameter(name: string): boolean {
  const key = fuelNotificationKey(name);
  if (key === fuelNotificationKey(FUEL_TANK_COMPUTATION_PARAMETER)) return true;
  return key.includes("fuel tank comput");
}

export function isFuelInTankDescription(description: string): boolean {
  return fuelNotificationKey(description).includes("fuel in tank");
}

/**
 * Only these notification descriptions may show / persist Fuel tank computation.
 * Leftover fuelCompute on other events must be stripped — never reopen the panel.
 */
export function isFuelTankComputationNotificationDescription(description: string): boolean {
  if (isActiveOnlyFuelNotificationDescription(description)) return false;
  return isFuelLevelComputeDescription(description) || isFuelInTankDescription(description);
}

export function isFuelLevelReturnParameter(name: string): boolean {
  const key = fuelNotificationKey(name);
  return key === "fuel level (l)" || key === "fuellevel";
}

export function hasFuelComputeFigures(
  fuel?: { tankCapacity?: string; inputField?: string; scale?: string; enabled?: boolean } | null
): boolean {
  if (!fuel || typeof fuel !== "object") return false;
  // Tank capacity can come from the notification library; Max voltage comes from the device binding.
  return Boolean(String(fuel.tankCapacity ?? "").trim());
}

/** Notification library stores tank/scale/output; input voltage comes from device binding lines. */
export function hasFuelComputeNotificationSettings(
  fuel?: { tankCapacity?: string; inputField?: string; scale?: string; enabled?: boolean } | null
): boolean {
  return hasFuelComputeFigures(fuel);
}

export function notificationUsesFuelTankComputation(row: NotificationRow): boolean {
  // Description gate only — do not infer from leftover fuelCompute / return params on other events.
  return isFuelTankComputationNotificationDescription(row.description);
}

/** Remove tank-compute settings from events that do not use fuel tank computation. */
export function stripMisplacedFuelComputeParameters(row: NotificationRow): NotificationRow {
  if (notificationUsesFuelTankComputation(row)) return row;
  const params = row.parameters;
  if (!params || typeof params !== "object") return row;
  let next = { ...params } as NotificationRow["parameters"] & {
    fuelCompute?: unknown;
    conditions?: Array<{ field?: string; [key: string]: unknown }>;
    returnValue?: { param?: string; mode?: string };
  };
  let changed = false;
  if ("fuelCompute" in next) {
    delete next.fuelCompute;
    changed = true;
  }
  if (Array.isArray(next.conditions)) {
    const filtered = next.conditions.filter((c) => !isFuelTankComputationParameter(String(c?.field ?? "")));
    if (filtered.length !== next.conditions.length) {
      next.conditions = filtered;
      changed = true;
    }
  }
  if (isFuelTankComputationParameter(String(next.returnValue?.param ?? ""))) {
    next.returnValue = { param: "No return value", mode: next.returnValue?.mode ?? "Maximum" };
    changed = true;
  }
  if (!changed) return row;
  const keys = Object.keys(next).filter((k) => (next as any)[k] !== undefined);
  return { ...row, parameters: keys.length ? next : undefined };
}

export const defaultFuelComputeParameters: NonNullable<NotificationRow["parameters"]> = {
  conditions: [{ id: 1, field: "IO6", operator: ">=", value: "0" }],
  returnValue: { param: "Fuel level (L)", mode: "Maximum" },
  fuelCompute: {
    enabled: true,
    tankCapacity: "400",
    scale: "75",
    outputAttribute: "fuelLevel"
  },
  record: {
    event: false,
    delay: { hours: "0", minutes: "0", seconds: "0" },
    recordingType: "Notification",
    actions: { startOdometer: false, endOdometer: false, startPosition: false, endPosition: false }
  }
};

/** Detailed events record start/end location and odometer for each occurrence. */
export const DEFAULT_DETAILED_RECORD_ACTIONS = {
  startOdometer: true,
  endOdometer: true,
  startPosition: true,
  endPosition: true
} as const;

export const defaultDetailedEventRecord: NonNullable<NotificationRow["parameters"]>["record"] = {
  event: true,
  delay: { hours: "0", minutes: "0", seconds: "0" },
  recordingType: "Detailed",
  actions: { ...DEFAULT_DETAILED_RECORD_ACTIONS }
};

/** @deprecated alias */
const defaultFuelEventRecord = defaultDetailedEventRecord;

export function ensureDetailedRecordSettings(
  record?: NonNullable<NotificationRow["parameters"]>["record"]
): NonNullable<NotificationRow["parameters"]>["record"] | undefined {
  if (!record) return record;
  if (String(record.recordingType ?? "").trim() !== "Detailed") return record;
  return {
    ...record,
    recordingType: "Detailed",
    actions: { ...DEFAULT_DETAILED_RECORD_ACTIONS }
  };
}

export function normalizeNotificationRecordParameters(
  parameters?: NotificationRow["parameters"]
): NotificationRow["parameters"] | undefined {
  if (!parameters || typeof parameters !== "object") return parameters;
  if (!parameters.record) return parameters;
  const record = ensureDetailedRecordSettings(parameters.record);
  if (record === parameters.record) return parameters;
  return { ...parameters, record };
}

/** Fleet-management (FM) notifications are excluded from Vivitel. */
export function isFmNotificationDescription(description: string): boolean {
  return /^FM\s/i.test(String(description ?? "").trim());
}

export function filterFmNotificationRows<T extends { description?: string }>(rows: T[]): T[] {
  return rows.filter((row) => !isFmNotificationDescription(String(row.description ?? "")));
}

const normalizeNotificationDescription = (value: string) => value.replace(/^\*\s*/, "").trim();
const notificationKey = (value: string) => normalizeNotificationDescription(value).toLowerCase();

/**
 * Digital events fire on a boolean state (ignition, power, jamming, door, input).
 * They do not need a numeric threshold, so a new site seeds them Available.
 * Measurement and threshold events stay Unavailable until the user sets parameters.
 */
export function isDigitalNotificationDescription(description: string): boolean {
  const key = notificationKey(description);
  if (!key) return false;

  if ((/\bcounter\b/.test(key) || /\bcounts?\b/.test(key)) && !/\b(button|card)\b/.test(key)) {
    return false;
  }

  if (/\bextended trip\b/.test(key) || /\bcold chain\b/.test(key)) return false;
  if (/^display diagnostic:/.test(key)) return false;
  if (/\btco\b/.test(key) && !/\bcard (in|out)\b/.test(key)) return false;

  if (isIgnitionStateNotification(key)) return true;
  if (isPowerOrDisconnectStateNotification(key)) return true;
  if (/\bjamming\b/.test(key)) return true;
  if (/\bno (gprs|gsm|gps) coverage\b/.test(key) && !/\b(for|min|hour)\b/.test(key)) return true;
  if (isDigitalInputNotification(key)) return true;
  if (
    /\bdoor\b/.test(key)
    && /\b(open|opened|closed)\b/.test(key)
    && !/\b(too long|duration|hours?)\b/.test(key)
  ) {
    return true;
  }

  if (isThresholdNotification(key)) return false;
  if (/\b(connect(?:ed)?|disconnect(?:ed)?|reconnect(?:ed)?)\b/.test(key) && !/\btrailerid\b/.test(key)) {
    return true;
  }

  return DIGITAL_STATE_NOTIFICATION.test(key);
}

function isIgnitionStateNotification(key: string): boolean {
  if (!/\bignition\b/.test(key) || /\bcounter\b/.test(key)) return false;
  if (/\b(speed|voltage|fuel|temperature|battery|hours|odometer)\b/.test(key)) return false;
  return true;
}

function isPowerOrDisconnectStateNotification(key: string): boolean {
  if (/\b(voltage|level|low|ripple|trickle|current|capacity|temperature|percent)\b/.test(key)) return false;
  if (/\bbattery\b/.test(key) && /\b(disconnect(?:ed)?|disconnection)\b/.test(key)) return true;
  if (/\b(antenna|display|sender)\b/.test(key) && /\bdisconnected\b/.test(key)) return true;
  if (/\brovi\b/.test(key) && /\bdisconnected\b/.test(key)) return true;
  if (!/\bpower\b/.test(key)) return false;
  return /\b(disconnect(?:ed)?|reconnect(?:ed)?|connected|connect|loss|on|off|event)\b/.test(key);
}

function isDigitalInputNotification(key: string): boolean {
  if (/^ai:\s*io\d+$/.test(key)) return true;
  if (/^digital (input|output)(?: \d+)?$/.test(key)) return true;
  return /^input \d+ (?:high|low|active|inactive)$/.test(key);
}

function isThresholdNotification(key: string): boolean {
  return /speed|overspeed|speeding|harsh|cornering|brak|accelerat|temperature|voltage|battery|fuel|coolant|\boil\b|pressure|weight|overweight|axle|payload|tonnage|humidity|luminosity|odometer|frequency|analog|signal|pdop|hdop|eco score|\brpm\b|revving|\bidle\b|fatigue|soot|\bdef\b|energy|state of charge|percent|ripple|trickle|\bhours\b|duration|threshold|\blevel\b|\blow\b|exceed|excessive|\bwarning\b|bytes|traffic|\bcurrent\b|axis |pitch|roll|calibrat|clock|message limit|green band|overtime|capacity|\btank\b|pulse|cell id|operator code|iccid|coordinate|\bscore\b|impact|accident|rollover|rough road|lift off|velocity|charging|km\/h|g-force|following distance|collision|lane departure|rolling stop|safeguard|eye clos|yawn|distraction|phone|too long/.test(
    key
  );
}

/** Boolean state changes that do not need a user-set threshold. */
const DIGITAL_STATE_NOTIFICATION =
  /\b(pressed|panic|assistance request|alarm button|emergency alert|manual alert|alarm)\b|\bpto\b.*\b(engaged|disengaged|active)\b|\b(status online|status offline|device moving|device stopped|device inactive)\b|\bgeofence (entered|exited)\b|\b(movement|instant movement|motion detection)\b|\bseatbelt\b|\bengine light\b|\b(trip start|trip end|sub-trip)\b|\b(driver changed|driver authenticated|passenger ided|no driver|no active driver)\b|\b(man down|towed|roaming)\b|\b(relay|positive drive)\b.*\b(on|off)\b|\b(configuration (accepted|rolled back|version changed)|firmware (error|info|version changed)|obc unit reset)\b|\bcard (in|out)\b|\block-?out\b|\bplug\b|\b(online|offline)\b|\bbutton\d* state\b|\beye magnet\b|\beye movement #\d+\b|\bgsm modem\b|\bheartbeat\b|\btamper\b|\bnogo\b|\bmedia\b|\bloss detected\b|\b(gps|video|power|can) loss\b|\bsession active\b|\bswitch (on|off)\b|\bauthenticated\b|\bwithout authentication\b/;

/** Case-insensitive key for matching notification descriptions / aliases. */
export function notificationDescriptionKey(value: string): string {
  return notificationKey(value);
}

function hasMeaningfulConditions(
  conditions?: Array<{ field?: string; operator?: string; value?: string }>
): boolean {
  return (conditions ?? []).some(
    (row) => String(row.field ?? "").trim() && String(row.operator ?? "").trim()
  );
}

export function inferDefaultConditionsForDescription(description: string): NonNullable<NotificationRow["parameters"]>["conditions"] | null {
  const key = notificationKey(description);
  if (!key) return null;

  if (key.includes("over speeding pre-warning")) {
    return [{ id: 1, field: "Speed", operator: ">", value: "70" }];
  }
  if (
    key.includes("over speeding") ||
    key === "speed limit exceeded" ||
    key.includes("road speed limit exceeded") ||
    key.includes("in-cab road speed over speeding")
  ) {
    const threshold = key.includes("excessive speed") ? "90" : "80";
    return [{ id: 1, field: "Speed", operator: ">", value: threshold }];
  }
  if (key === "ignition on" || (key.includes("ignition") && key.includes(" on"))) {
    // Traccar Position KEY_IGNITION — boolean attribute (Teltonika AVL io239).
    return [{ id: 1, field: "ignition", operator: "is", value: "true" }];
  }
  if (key === "ignition off" || (key.includes("ignition") && key.includes("off"))) {
    return [{ id: 1, field: "ignition", operator: "is", value: "false" }];
  }
  if (key === "ignition") {
    return [{ id: 1, field: "ignition", operator: "is", value: "true" }];
  }
  if (key === "device moving" || key === "movement" || key === "instant movement") {
    // Traccar KEY_MOTION — Teltonika AVL io240.
    return [{ id: 1, field: "motion", operator: "is", value: "true" }];
  }
  if (key === "device inactive" || key.includes("idle")) {
    return [{ id: 1, field: "motion", operator: "is", value: "false" }];
  }
  if (key.includes("harsh acceleration")) {
    return [{ id: 1, field: "Speed", operator: ">", value: "5" }];
  }
  if (key.includes("harsh braking")) {
    return [{ id: 1, field: "Speed", operator: ">", value: "5" }];
  }
  if (key.includes("harsh cornering") || key.includes("cornering")) {
    return [
      {
        id: 1,
        field: "3-Axis Cornering G-Force (High Sensitivity)",
        operator: ">",
        value: "0.5"
      }
    ];
  }
  if (key.includes("panic") || key.includes("assistance request")) {
    return [{ id: 1, field: "Panic Alert", operator: "is", value: "true" }];
  }
  if (key.includes("low internal battery")) {
    return [{ id: 1, field: "Battery", operator: "<", value: "3.5" }];
  }
  if (key.includes("low battery")) {
    return [{ id: 1, field: "Battery", operator: "<", value: "12" }];
  }
  if (key.includes("fuel refill") || key.includes("fuel increase") || key.includes("fuel drop") || key.includes("fuel siphoning") || key.includes("fuel syphon") || key.includes("fuel gradual")) {
    // Native Traccar fuelDrop / fuelIncrease — no attribute threshold conditions.
    // Tank litres come from KEY_FUEL / computed fuelLevel / analogue IO, not io239.
    return [];
  }
  if (key.includes("driver seatbelt")) {
    return [{ id: 1, field: "Driver seatbelt not engaged", operator: "is", value: "true" }];
  }
  if (/^input\s*1\s*high$/i.test(key) || key === "input 1 high") {
    return [{ id: 1, field: "IO1", operator: "=", value: "1" }];
  }
  if (/^input\s*1\s*low$/i.test(key) || key === "input 1 low") {
    return [{ id: 1, field: "IO1", operator: "=", value: "0" }];
  }
  if (/^input\s*2\s*high$/i.test(key) || key === "input 2 high") {
    return [{ id: 1, field: "IO2", operator: "=", value: "1" }];
  }
  if (/^input\s*2\s*low$/i.test(key) || key === "input 2 low") {
    return [{ id: 1, field: "IO2", operator: "=", value: "0" }];
  }
  const ioMatch = key.match(/^io\s*(\d+)$/i);
  if (ioMatch) {
    return [{ id: 1, field: `IO${ioMatch[1]}`, operator: "=", value: "1" }];
  }

  return null;
}

function shouldApplyDetailedRecordDefaults(row: NotificationRow): boolean {
  if (isFuelLevelComputeDescription(row.description)) return false;
  const recordingType = String(row.parameters?.record?.recordingType ?? "").trim();
  if (recordingType === "Notification" || recordingType === "Summary") return false;
  return true;
}

/** Locked parameters for native fuel events (no conditions / return value editing). */
export const defaultActiveOnlyFuelNotificationParameters: NonNullable<NotificationRow["parameters"]> = {
  conditions: [],
  returnValue: { param: "No return value", mode: "Maximum" },
  record: defaultDetailedEventRecord
};

export function applyActiveOnlyFuelParametersForSave(
  editable: Pick<NonNullable<NotificationRow["parameters"]>, "record" | "actions" | "active">
): NonNullable<NotificationRow["parameters"]> {
  return {
    ...defaultActiveOnlyFuelNotificationParameters,
    ...(editable.record ? { record: editable.record } : {}),
    ...(editable.actions ? { actions: editable.actions } : {}),
    ...(editable.active ? { active: editable.active } : {})
  };
}

/** Apply Traccar-aligned defaults (conditions, detailed record capture, return value) for library + user events. */
export function normalizeNotificationTraccarParameters(
  row: NotificationRow
): NotificationRow["parameters"] | undefined {
  if (isActiveOnlyFuelNotificationDescription(row.description)) {
    const existing = row.parameters && typeof row.parameters === "object" ? row.parameters : {};
    return applyUserAlertDeliveryDefaults(
      normalizeNotificationRecordParameters(
        applyActiveOnlyFuelParametersForSave({
          record: existing.record,
          actions: existing.actions,
          active: existing.active
        })
      )
    );
  }

  if (isDedicatedFuelNotificationDescription(row.description)) {
    return normalizeNotificationRecordParameters(row.parameters);
  }

  const existing = row.parameters && typeof row.parameters === "object" ? { ...row.parameters } : {};
  const conditions = Array.isArray(existing.conditions) ? existing.conditions : [];
  const inferred = inferDefaultConditionsForDescription(row.description);
  const key = notificationKey(row.description);
  const isLegacyCorneringSpeed =
    (key.includes("harsh cornering") || key.includes("cornering")) &&
    conditions.length === 1 &&
    String(conditions[0]?.field ?? "")
      .trim()
      .toLowerCase() === "speed" &&
    String(conditions[0]?.operator ?? "").trim() === ">" &&
    String(conditions[0]?.value ?? "").trim() === "5";

  let next: NonNullable<NotificationRow["parameters"]> = {
    ...existing,
    returnValue: existing.returnValue ?? { param: "No return value", mode: "Maximum" },
    conditions:
      isLegacyCorneringSpeed && inferred
        ? inferred
        : hasMeaningfulConditions(conditions)
          ? conditions
          : inferred ?? conditions
  };

  if (notificationUsesFuelTankComputation(row)) {
    return normalizeNotificationRecordParameters(next);
  }

  if (shouldApplyDetailedRecordDefaults(row)) {
    const record = {
      ...defaultDetailedEventRecord,
      ...(existing.record ?? {}),
      recordingType: String(existing.record?.recordingType ?? "").trim() || "Detailed"
    };
    next.record = ensureDetailedRecordSettings(record) ?? record;
  }

  return applyUserAlertDeliveryDefaults(normalizeNotificationRecordParameters(next));
}

function applyUserAlertDeliveryDefaults(
  params: NotificationRow["parameters"] | undefined
): NotificationRow["parameters"] | undefined {
  if (!params || typeof params !== "object") return params;
  const next = { ...params };
  const active = next.active && typeof next.active === "object" ? { ...next.active } : undefined;
  if (active?.enabled) {
    active.userAlerts = {
      email: active.userAlerts?.email ?? true,
      inApp: active.userAlerts?.inApp ?? true,
      sms: active.userAlerts?.sms ?? false
    };
    next.active = active;
  }
  const recordingType = String(next.record?.recordingType ?? "").trim();
  if (recordingType === "Notification" || recordingType === "Alert") {
    const record = next.record && typeof next.record === "object" ? { ...next.record } : { recordingType };
    record.userAlerts = {
      email: record.userAlerts?.email ?? next.userAlerts?.email ?? true,
      inApp: record.userAlerts?.inApp ?? next.userAlerts?.inApp ?? true,
      sms: record.userAlerts?.sms ?? next.userAlerts?.sms ?? true
    };
    next.record = record;
  }
  return next;
}

/** Over-speed boolean — Traccar position field `speed` is always defined (km/h threshold). */
export const defaultOverSpeedingParameters: NonNullable<NotificationRow["parameters"]> = {
  conditions: [{ id: 1, field: "Speed", operator: ">", value: "80" }],
  returnValue: { param: "No return value", mode: "Maximum" },
  record: defaultFuelEventRecord
};

export const defaultOverSpeedingPreWarningParameters: NonNullable<NotificationRow["parameters"]> = {
  conditions: [{ id: 1, field: "Speed", operator: ">", value: "70" }],
  returnValue: { param: "No return value", mode: "Maximum" },
  record: defaultFuelEventRecord
};

export const DEFAULT_NOTIFICATION_VIDEO_WINDOW = {
  beforeSeconds: 3,
  afterSeconds: 3,
  durationSeconds: 6
} as const;

/** Filled after the catalog is numbered 1..N. Legacy 29600 / 97000 ids are not used. */
export const notificationEventIds: Record<string, string> = {};

/**
 * Traccar built-in notification types seeded per site as type "Default".
 * Excludes overspeeding / harsh braking — those must not be default library rows.
 * @see https://www.traccar.org/events/
 */
export const traccarDefaultNotificationNames = [
  "Status online",
  "Ignition on",
  "Status offline",
  "Device inactive",
  "Device moving",
  "Device stopped",
  "Ignition off",
  "Fuel drop",
  "Fuel increase",
  "Geofence entered",
  "Geofence exited",
  "Alarm",
  "Media",
  "Driver changed",
  "Maintenance required"
] as const;

/** Never seed or treat as locked Traccar defaults. */
export const EXCLUDED_TRACCAR_DEFAULT_NOTIFICATIONS = [
  "Speed limit exceeded",
  "Over speeding",
  "Over Speeding Pre-Warning",
  "Road Speed Limit Exceeded",
  "Harsh braking",
  "Harsh Braking",
  "Harsh acceleration",
  "Harsh Acceleration"
] as const;

export function isExcludedTraccarDefaultNotification(description: string): boolean {
  const key = notificationKey(description);
  return EXCLUDED_TRACCAR_DEFAULT_NOTIFICATIONS.some((name) => notificationKey(name) === key)
    || key.includes("over speed")
    || key.includes("overspeed")
    || key.includes("speed limit exceed")
    || key.includes("harsh brak");
}

export function isTraccarDefaultNotificationDescription(description: string): boolean {
  if (isExcludedTraccarDefaultNotification(description)) return false;
  const key = notificationKey(description);
  return traccarDefaultNotificationNames.some((name) => notificationKey(name) === key);
}

/** Build Default rows for a site with notification IDs 1..N (site-local, independent). */
export function buildTraccarDefaultNotificationRows(): NotificationRow[] {
  return traccarDefaultNotificationNames.map((name, index) => ({
    description: name,
    type: "Default",
    availability: isDigitalNotificationDescription(name) ? "Available" : DEFAULT_NOTIFICATION_AVAILABILITY,
    eventId: String(index + 1)
  }));
}

/**
 * Ensure every site library includes Traccar defaults (IDs 1..N), without
 * importing overspeed / harsh braking. Existing custom/system rows keep their
 * IDs when unique; missing defaults are inserted.
 */
export function ensureSiteTraccarDefaultNotifications(items: NotificationRow[]): {
  items: NotificationRow[];
  changed: boolean;
} {
  const defaults = buildTraccarDefaultNotificationRows();
  const byKey = new Map<string, NotificationRow>();
  let changed = false;

  for (const row of items) {
    if (isExcludedTraccarDefaultNotification(row.description) && String(row.type ?? "").toLowerCase() === "default") {
      changed = true;
      continue; // drop excluded defaults
    }
    const key = notificationKey(row.description);
    if (!key) continue;
    byKey.set(key, row);
  }

  for (const def of defaults) {
    const key = notificationKey(def.description);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, def);
      changed = true;
      continue;
    }
    const nextId = String(def.eventId ?? "").trim();
    const curId = String(existing.eventId ?? "").trim();
    const nextType = "Default";
    if (existing.type !== nextType || curId !== nextId) {
      byKey.set(key, {
        ...existing,
        type: nextType,
        eventId: nextId || curId,
        description: def.description
      });
      changed = true;
    }
  }

  // Re-assert default IDs 1..N in canonical order for Traccar defaults only.
  for (const def of defaults) {
    const key = notificationKey(def.description);
    const row = byKey.get(key);
    if (!row) continue;
    if (String(row.eventId ?? "").trim() !== String(def.eventId)) {
      byKey.set(key, { ...row, eventId: def.eventId, type: "Default" });
      changed = true;
    }
  }

  const orderedDefaults = defaults
    .map((d) => byKey.get(notificationKey(d.description)))
    .filter((row): row is NotificationRow => Boolean(row));
  const others: NotificationRow[] = [];
  for (const [key, row] of byKey) {
    if (defaults.some((d) => notificationKey(d.description) === key)) continue;
    others.push(row);
  }

  // Compact every remaining row to the next integer so a site library is 1..N.
  // This replaces legacy 29600 / 97000 ids.
  let seq = orderedDefaults.length;
  const finalOthers = others.map((row) => {
    seq += 1;
    const assigned = String(seq);
    if (String(row.eventId ?? "").trim() !== assigned) changed = true;
    return { ...row, eventId: assigned };
  });

  return { items: [...orderedDefaults, ...finalOthers], changed };
}

const rawNotifications = `
* Assistance Request|Default|
* Assistance Request Cancelled|Default|
* Diagnostic: Internal Battery Capacity|Default|
* Diagnostic: Internal Battery Voltage|Default|
* Diagnostic: Vehicle Battery Voltage|Default|
* Door Closed|Default|
* Door Opened|Default|
* Harsh Cornering|System|Available
* Harsh Left Cornering|Default|
* Harsh Right Cornering|Default|
* Ignition Off|Default|Available
* Ignition On|Default|Available
* Impact Detect Moderate|System|Not available - Missing parameters
* Impact Detect Severe|System|Not available - Missing parameters
* Input 1 High|System|Available
* Input 1 Low|System|Available
* Input 2 High|System|Available
* Input 2 Low|System|Available
* Low Battery|Default|Available
* Low Internal Battery|Default|Available
* Low Remote Control Battery|Default|
* OBC unit reset|Default|
* Panic Alert|Default|Available
* Panic Alert Cancelled|Default|
* Power Disconnected|Default|Available
* Power Reconnected|Default|Available
* PTO Disengaged|Default|
* PTO Engaged|Default|
* Road Speed Limit Exceeded|Default|
3-Axis - Lift Off|Default|
3-Axis - Possible Accident|Default|
3-Axis - Rollover|Default|
3-Axis - Rough Road|Default|
3-Axis – Harsh Cornering|Default|
Active Control - plug identification prevented|System|
Active Control - positive drive OFF|System|
Active Control - positive drive ON|System|
Active Control - relay drive 1 OFF|System|
Active Control - relay drive 1 ON|System|
Active Control - relay drive 2 OFF|System|
Active Control - relay drive 2 ON|System|
Active fuel source changed|Diagnostic|
Active fuel source on PTO change|Diagnostic|
Active Message: Trailer A Connect|System|Not available - Missing parameters
Active Message: Trailer A Disconnect|System|Not available - Missing parameters
Active Message: Trailer B Connect|System|Not available - Missing parameters
Active Message: Trailer B Disconnect|System|Not available - Missing parameters
Active Message: Trailer C Connect|System|Not available - Missing parameters
Active Message: Trailer C Disconnect|System|Not available - Missing parameters
Active Message: Trailer D Connect|System|Not available - Missing parameters
Active Message: Trailer D Disconnect|System|Not available - Missing parameters
Alarm Button Pressed|System|
Alarm: 12V battery voltage low|Diagnostic|
Alarm: 24V battery voltage low|Diagnostic|
Alarm: Battery Disconnect (Power Down)|Diagnostic|
Alarm: Dash Tamper|Diagnostic|Not available - Missing parameters
Alarm: No Go RSA Border|Diagnostic|
Alarm: Panic Pressed|Diagnostic|Not available - Missing parameters
Alert: No Driver Identified|Diagnostic|
Alert: No GPRS Coverage for 30 min|Diagnostic|Not available - Missing parameters
Alert: Possible Accident|Diagnostic|
Alert: Possible CAN Tamper|Diagnostic|
Alert: Possible Power Tamper|Diagnostic|
Alert: Possible Speed Spike|Diagnostic|
Analog Analyzement threshold violation|External|
Asset Towed|External|Available
Back panel tamper detected|Diagnostic|
Backup battery disconnected|Diagnostic|
Backup battery faulty|Diagnostic|
Backup battery low|Diagnostic|
Battery disconnected|System|
Battery disconnection|System|
Battery status changed|Diagnostic|
Battery voltage - Connection diagnostic|System|
Button 1 Pressed|System|
Button 2 Pressed|System|
Button 3 Pressed|System|
Calculate soft clock current date time using calculated time|Default|Available
Calculate soft clock value when after the time change date|Default|Available
Calculate soft clock value when before the time change date|Default|Available
CAN loss detected|Diagnostic|Available
CAN speed/RPM loss detected|Diagnostic|Available
Coasting detection|External|
Cold Chain - Cold Chain broken|System|Not available - Missing parameters
Cold Chain - Cooling unit not efficient|System|Not available - Missing parameters
Cold Chain - Cooling unit off while driving|System|Not available - Missing parameters
Cold Chain - Door open too long|System|Not available - Missing parameters
Configuration accepted|Default|Available
Configuration loss detected|Diagnostic|
Configuration rolled back|System|
Configuration version changed|Default|Available
Coolant Level Low|External|Not available - Missing parameters
DEF Level Low|External|Not available - Missing parameters
DI: Driving without blue driver key|Diagnostic|
DI: RS Exception|Diagnostic|
Diagnostic trouble code|System|Available
Diagnostic: Bat Fault: ChargingCountAndTime|Diagnostic|
Diagnostic: Bat Fault: Disconnected|Diagnostic|
Diagnostic: Bat Fault: FullCountAndTime|Diagnostic|
Diagnostic: Bat Fault: ParkTimeAndCount|Diagnostic|
Diagnostic: Bat Fault: RippleVoltage|Diagnostic|
Diagnostic: Bat Fault: UnableToAddCharge|Diagnostic|
Diagnostic: CAN Scan|Diagnostic|Available
Diagnostic: Communication heartbeat|Default|
Diagnostic: Fault no Engine RPM|Diagnostic|
Diagnostic: Fault no GPS|Diagnostic|
Diagnostic: GPS velocity as speed fallback|System|
Diagnostic: GPS Velocity At 50km/h Road Speed|Diagnostic|
Diagnostic: Maximum GPS Velocity|Diagnostic|
Diagnostic: Vivi Display Disconnected|Diagnostic|Not available - Missing parameters
Diagnostic: No GPRS Coverage|Diagnostic|
Diagnostic: No GSM Coverage|Diagnostic|
Diagnostic: Noise on speed line|Diagnostic|
Diagnostic: OBC temperature exceeded 55 deg C|Diagnostic|
Diagnostic: OBC temperature exceeded 60 deg C|Diagnostic|
Diagnostic: OBC temperature exceeded 70 deg C|Diagnostic|
Diagnostic: OBC temperature exceeded 80 deg C|Diagnostic|
Diagnostic: Road Speed At 50 km/h GPS Velocity|Diagnostic|
Diagnostic: Rovi II disconnected|Diagnostic|Not available - Missing parameters
Diagnostic: Rovi II fault detected|Diagnostic|
Diagnostic: Rovi III disconnected|Diagnostic|Not available - Missing parameters
Diagnostic: Rovi III fault detected|Diagnostic|
Diagnostic: Rovi IV disconnected|Diagnostic|Not available - Missing parameters
Diagnostic: Rovi IV fault detected|Diagnostic|
Diagnostic: Satellite communication heartbeat|Default|
Diagnostic: Satellite communication message limit increase|Default|
Diagnostic: Satellite communication message limit reset|Default|
Diagnostic: Satellite communication message limit set|Default|Available
Diesel Particulate Filter Soot Load High|External|Not available - Missing parameters
Display diagnostic: AUTO DRIVING|Diagnostic|Not available - Missing parameters
Display diagnostic: AUTO ON DUTY NOT DRIVING|Diagnostic|Not available - Missing parameters
Display diagnostic: COMMUTE MODE|Diagnostic|Not available - Missing parameters
Display diagnostic: DRIVING|Diagnostic|Not available - Missing parameters
Display diagnostic: INVALID COMPANY ID ON USB DRIVE|Diagnostic|Not available - Missing parameters
Display diagnostic: INVALID USB DRIVE|Diagnostic|Not available - Missing parameters
Display diagnostic: Logged off / leave vehicle|Diagnostic|Not available - Missing parameters
Display diagnostic: Logged onto vehicle|Diagnostic|Not available - Missing parameters
Display diagnostic: NO ACTIVE DRIVER|Diagnostic|Not available - Missing parameters
Display diagnostic: OFF AT WELL|Diagnostic|Not available - Missing parameters
Display diagnostic: OFF DUTY|Diagnostic|Not available - Missing parameters
Display diagnostic: ON DUTY NOT DRIVING|Diagnostic|Not available - Missing parameters
Display diagnostic: SLEEPER BIRTH|Diagnostic|Not available - Missing parameters
Display diagnostic: STANDBY / WAITING|Diagnostic|Not available - Missing parameters
DriveMate Mode Change|Default|Available
Driver Assist - Bluetooth Remote|Default|Available
Driver Authenticated|External|
Driver door open|System|Available
Driver fatigue critical|System|Not available - Missing parameters
Driver fatigue warning|System|Not available - Missing parameters
Driver Lock-out|External|
Driver Lock-out Override|External|
Driver plug from incorrect organisation|System|
Driver seatbelt not engaged|System|Available
Driver side rear door open|System|Available
Driving Without Authentication|External|
Dutch Tax Reporting Trip Mode|System|Not available - Missing parameters
DVR Error detected|Diagnostic|Not available - Missing parameters
ELVIST continuous driving limit exceeded|System|Not available - Missing parameters
ELVIST daily driving limit exceeded|System|Not available - Missing parameters
Emergency alert button|System|Not available - Missing parameters
End of trip fuel tank level percentage|System|Available
End of trip state of charge|System|Available
Energy consumed (Total)|External|
Energy recuperated (Total)|External|
Engine coolant temperature high|System|Available
Engine Coolant Temperature High 2|External|
Engine light (MIL) on|System|Available
Engine Oil level low|System|Available
Engine Oil Pressure low|System|Available
Engine Temperature|External|Not available - Missing parameters
Entered NoGoZone - [Zone Name]|System|
EV CAN: Charger Status|External|Not available - Missing parameters
Exceeding 4 Hours Driving With Out 30 mins Rest|System|
Excessive idle|External|Available
Extended Trip - Cruise control on|System|Not available - Missing parameters
Extended Trip - Drive|System|
Extended Trip - Green Band|System|
Extended Trip - PTO active|System|Not available - Missing parameters
Extended Trip - Top Gear|System|
External Battery Back To Normal|External|
External Battery Low|External|
Firmware error|Default|Available
Firmware info|Default|Available
Firmware version changed|Default|Available
Free Wheeling|System|
Frequency Analyzement threshold violation|External|
Front panel tamper detected|Diagnostic|
Fuel level (computed)|Computed|Available
Fuel level difference|Default|Not available - Missing parameters
Fuel Level Low|External|Not available - Missing parameters
Fuel Level Low 2|External|
Fuel Syphoning|External|
Geofence hotspot violation|External|
GPRS - Session active|System|
GPRS - Total bytes received|System|
GPRS - Total bytes sent|System|
GPRS - Total bytes sent and received|System|
GPRS - Total sessions|System|
GPS antenna disconnected|Diagnostic|
GPS jamming|Diagnostic|
GPRS jamming|Default|
GSM Modem in use by SDK|System|
GSM supervision rollover detected|Default|
Harsh acceleration|System|Available
Harsh Acceleration (excessive)|System|
Harsh acceleration - WARNING|System|
Harsh braking|System|Available
Harsh Braking (excessive)|System|
Harsh braking - WARNING|System|
Idle|System|Available
Idle - excessive|System|Available
Idle - excessive - WARNING|System|
IFTA PTO Engaged|System|
Impact Detect|External|Available
In-cab road speed over speeding|Default|Available
In-cab road speed over speeding - EXCESSIVE DURATION|Default|Available
In-cab road speed over speeding - EXCESSIVE SPEED|Default|Available
Input 1 Active|External|
Input 1 Inactive|External|
Input 2 Active|External|
Input 2 Inactive|External|
Internal Battery excessive ripple voltage|System|
Internal Battery excessive trickle charge time|System|
Internal Battery Low|External|Not available - Missing parameters
Jamming Detect|External|Available
Kimax axle 1 overweight|System|Not available - Missing parameters
Kimax axle 2 overweight|System|Not available - Missing parameters
Kimax axle 3 overweight|System|Not available - Missing parameters
Kimax axle 4 overweight|System|Not available - Missing parameters
Kimax axle 5 overweight|System|Not available - Missing parameters
Kimax axle 6 overweight|System|Not available - Missing parameters
Kimax moved tonnage|Default|Not available - Missing parameters
Kimax total load overweight|System|Not available - Missing parameters
Kimax total payload overweight|System|Not available - Missing parameters
Kimax tractor payload overweight|System|Not available - Missing parameters
Kimax tractor total load overweight|System|Not available - Missing parameters
Kimax trailer payload overweight|System|Not available - Missing parameters
Kimax trailer total load overweight|System|Not available - Missing parameters
Last TrailerID Connected|Default|Not available - Missing parameters
LoadTech Axle 1 GROSS|System|Not available - Missing parameters
LoadTech Axle 1 NETT|System|Not available - Missing parameters
LoadTech Axle 2 GROSS|System|Not available - Missing parameters
LoadTech Axle 2 NETT|System|Not available - Missing parameters
LoadTech Axle 3 GROSS|System|Not available - Missing parameters
LoadTech Axle 3 NETT|System|Not available - Missing parameters
LoadTech Total GROSS|System|Not available - Missing parameters
LoadTech Total NETT|System|Not available - Missing parameters
Low battery|External|
Low Battery - Bluetooth Remote|Diagnostic|Available
Low Battery Level|External|
Man Down|System|
Vivi Rovi Mini: High Engine Temperature Error|Diagnostic|
Vivi Rovi Mini: High Engine Temperature Warning|Diagnostic|
Vivi Rovi Mini: Low Battery Voltage Error|Diagnostic|Not available - Missing parameters
Vivi Rovi Mini: Low Battery Voltage Warning|Diagnostic|Not available - Missing parameters
Vivi Rovi Mini: Low Coolant Level Error|Diagnostic|Not available - Missing parameters
Vivi Rovi Mini: Low Coolant Level Warning|Diagnostic|Not available - Missing parameters
Vivi Rovi Mini: Low Oil Level Error|Diagnostic|
Vivi Rovi Mini: Low Oil Level Warning|Diagnostic|
Vivi Rovi Mini: Low Oil Pressure Error|Diagnostic|
Vivi Rovi Mini: Low Oil Pressure Warning|Diagnostic|
Vivi Rovi Mini: SRV Brake Air Pressure Error|Diagnostic|Not available - Missing parameters
Vivi Rovi Mini: SRV Brake Air Pressure Warning|Diagnostic|Not available - Missing parameters
Ai: Blind spot detection (front)|Ai|
Ai: Blind spot detection (left)|Ai|
Ai: Blind spot detection (right)|Ai|
Ai: Driver distraction|Ai|
Ai: Driver fatigue - eye closing|Ai|
Ai: Driver fatigue - yawning|Ai|
Ai: Driver not wearing seatbelt|Ai|
Ai: Driver smoking|Ai|
Ai: End of Trip Video|System|
Ai: Event video requests capped|Diagnostic|
Ai: Face to Driver ID mismatch|Ai|
Ai: Following distance warning|Ai|
Ai: Forward collision warning|Ai|
Ai: GPS loss|Ai|
Ai: Impact detection|Ai|
Ai: IO1|Ai|
Ai: IO2|Ai|
Ai: IO3|Ai|
Ai: IO4|Ai|
Ai: IO5|Ai|
Ai: IO6|Ai|
Ai: IO7|Ai|
Ai: IO8|Ai|
Ai: IO9|Ai|
Ai: IO10|Ai|
Ai: IO11|Ai|
Ai: IO12|Ai|
Ai: IO13|Ai|
Ai: IO14|Ai|
Ai: IO15|Ai|
Ai: Lane departure warning|Ai|
Ai: Lens covered|Ai|
Ai: Low voltage|Ai|
Ai: Manual alert|Ai|
Ai: Mobile phone distraction|Ai|
Ai: Motion detection|Ai|
Ai: No driver|Ai|
Ai: Pedestrian collision warning|Ai|
Ai: Power loss|Ai|
Ai: Rolling stop|Ai|
Ai: Safeguard extremely high risk|Default|
Ai: Safeguard high risk|Default|
Ai: Safeguard low risk|Default|
Ai: Safeguard medium risk|Default|
Ai: Speed sign overspeeding|Ai|
Ai: Start of Trip Video|System|
Ai: Storage exception|Ai|
Ai: Video loss|Ai|
Mobile phone use|System|Not available - Missing parameters
Movement in Reverse Gear|External|Not available - Missing parameters
Night Driving Time|System|
No modem zone entry|External|
OBC unit date changed|Default|Available
OBC unit Engine Hours changed|Default|Available
OBC unit odometer changed|Default|Available
OBC unit reset|Default|Available
Observability: State of Charge|External|
Oil Temperature|External|Not available - Missing parameters
Out of green band driving|System|Available
Over revving|System|Available
Over revving - WARNING|System|
Over speeding|System|Available
Over Speeding (excessive)|System|
Over speeding - WARNING|System|
Over speeding in location|Default|Available
Over speeding in location - EXCESSIVE DURATION|Default|Available
Over speeding in location - EXCESSIVE SPEED|Default|Available
Over Speeding Pre-Warning|Custom|Available
Overtime driving|System|
Passenger door open|System|Available
Passenger IDed|Default|Available
Passenger plug notification|System|
Passenger seatbelt not engaged|System|Available
Passenger side rear door open|System|Available
Possible GPS jamming|Diagnostic|
Possible impact|System|Available
Possible impact when parked|System|Available
Possible Rollover|System|Available
Power Connected|Diagnostic|
Power Disconnect|External|Available
Power Event Off|System|
Power Event On|System|
Power Reconnect|External|Available
Private Mode|System|Not available - Missing parameters
Private mode plug active|System|
Record trip Driver picture|Default|
Remote Ignition OFF|Default|
Remote Ignition ON|Default|
Road Speed Overspeeding|Default|Available
Roaming|External|
Rovi - Route Cancellation|System|Not available - Missing parameters
Rovi - Route Recalculation|System|Not available - Missing parameters
Rovi III - Route Cancellation|System|Not available - Missing parameters
Rovi III - Route Recalculation|System|Not available - Missing parameters
Rovi IV - Route Cancellation|System|Not available - Missing parameters
Rovi IV - Route Recalculation|System|Not available - Missing parameters
Rovi: Auto Driving|Custom|Not available - Missing parameters
Rovi: Auto On Duty not Driving|Custom|Not available - Missing parameters
Rovi: Commute Mode (personal conveyance)|Custom|Not available - Missing parameters
Rovi: Driving|Custom|Not available - Missing parameters
Rovi: No Active Driver|Custom|Not available - Missing parameters
Rovi: Off Duty|Custom|Not available - Missing parameters
Rovi: Off Duty at Well|Custom|Not available - Missing parameters
Rovi: On Duty not Driving|Custom|Not available - Missing parameters
Rovi: Sleeper Berth|Custom|Not available - Missing parameters
RPM calibrated (calibration plug)|Default|
Serial TCO Driver 1 4.5 hours WARNING|System|Not available - Missing parameters
Serial TCO Driver 1 Card IN|System|Not available - Missing parameters
Serial TCO Driver 1 Card OUT|System|Not available - Missing parameters
Serial TCO Driver 1 Driving WITHOUT Card|System|Not available - Missing parameters
Serial TCO OVERSPEED|System|Not available - Missing parameters
Settings version changed|Default|Available
Speed calibrated (calibration plug)|Default|
Speed calibrated (from GPS velocity)|Default|
Speed detected during ignition off|External|
Speed sender disconnected|Diagnostic|
Speeding - On-board tiered|Default|Available
Speeding - Tiered|Default|
Start of trip fuel tank level percentage|System|Available
Start of trip state of charge|System|Available
Store new values for time deviation calculation|Default|Available
Stored fuel level|Default|Not available - Missing parameters
Sub-trip end|Default|Available
Sub-trip start|Default|Available
Swap Unit function executed|Default|
System overridden|System|
Tamper detected|External|
TCO door not opened in 24 hours|System|Not available - Missing parameters
TCO door open / DTCO no card inserted|System|Not available - Missing parameters
TCO driver 1 active work|System|Not available - Missing parameters
TCO driver 1 driving|System|Not available - Missing parameters
TCO driver 1 ID change|System|Not available - Missing parameters
TCO driver 1 passive work|System|Not available - Missing parameters
TCO driver 1 resting|System|Not available - Missing parameters
TCO driver 2 active work|System|Not available - Missing parameters
TCO driver 2 ID change|System|Not available - Missing parameters
TCO driver 2 passive work|System|Not available - Missing parameters
TCO driver 2 resting|System|Not available - Missing parameters
TCO no signal (assume door open)|System|Not available - Missing parameters
Trailer A|System|Not available - Missing parameters
Trailer B|System|Not available - Missing parameters
Trailer C|System|Not available - Missing parameters
Trailer D|System|Not available - Missing parameters
Transmission Switch OFF|System|Not available - Missing parameters
Trip End|Default|
Trip Number reset to 0|Default|
Trip Start|Default|
WLAN - Session active|System|
`;

// Extra Telemetry/IO fields (Teltonika FMC130/FMB family) surfaced as trackable notifications.
// These names match the I/O Info fields shown in the provided PNGs.
const teltonikaIoNotificationNames: string[] = [
  "Ignition",
  "Movement",
  "Instant movement",
  "Data Mode",
  "GSM Signal",
  "Sleep Mode",
  "GNSS Status",
  "GNSS PDOP",
  "GNSS HDOP",
  "External Voltage",
  "Speed",
  "UMTS/LTE Cell ID",
  "Modem Status",
  "SIM Status",
  "GPRS Status",
  "Signal Level",
  "GSM Area Code",
  "Active GSM Operator",
  "Actual Operator Code",
  "Battery Voltage",
  "Battery Current",
  "Trip Odometer",
  "Total Odometer",
  "Digital Input 1",
  "Digital Input 2",
  "Digital Input 3",
  "Analog Input 1",
  "Analog Input 2",
  "Digital Output 1",
  "Digital Output 2",
  "Digital Output 3",
  "Fuel Used GPS",
  "Fuel Rate GPS",
  "Axis X",
  "Axis Y",
  "Axis Z",
  "AXL Calibration Status",
  "ICCID",
  "iButton",
  "Eco Score",
  "User ID",
  "Network Type",
  "Coordinates ISO6709",
  "Ignition On Counter",
  "BT Status",
  "Battery Level %",
  "Pulse Counter DIN1",
  "Pulse Counter DIN2",
  "Frequency DIN1",
  "Frequency DIN2",
  "Dallas Temperature 1",
  "Dallas Temperature 2",
  "Dallas Temperature 3",
  "Dallas Temperature 4",
  "Dallas Temperature ID 1",
  "Dallas Temperature ID 2",
  "Dallas Temperature ID 3",
  "Dallas Temperature ID 4",
  "BLE Temperature #1",
  "BLE Temperature #2",
  "BLE Temperature #3",
  "BLE Temperature #4",
  "BLE Battery #1",
  "BLE Battery #2",
  "BLE Battery #3",
  "BLE Battery #4",
  "BLE Humidity #1",
  "BLE Humidity #2",
  "BLE Humidity #3",
  "BLE Humidity #4",
  "BLE Fuel Level #1",
  "BLE Fuel Level #2",
  "BLE Fuel Level #3",
  "BLE Fuel Level #4",
  "BLE Luminosity #1",
  "BLE Luminosity #2",
  "BLE Luminosity #3",
  "BLE Luminosity #4",
  "BLE Fuel Frequency #1",
  "BLE Fuel Frequency #2",
  "BLE Fuel Frequency #3",
  "BLE Fuel Frequency #4",
  "BLE RFID #1",
  "BLE RFID #2",
  "BLE RFID #3",
  "BLE RFID #4",
  "BLE Button1 state #1",
  "BLE Button1 state #2",
  "BLE Button1 state #3",
  "BLE Button1 state #4",
  "BLE Button2 state #1",
  "BLE Button2 state #2",
  "BLE Button2 state #3",
  "BLE Button2 state #4",
  "BLE 1 Custom 1",
  "BLE 1 Custom 2",
  "BLE 1 Custom 3",
  "BLE 1 Custom 4",
  "BLE 1 Custom 5",
  "BLE 2 Custom 1",
  "BLE 2 Custom 2",
  "BLE 2 Custom 3",
  "BLE 2 Custom 4",
  "BLE 2 Custom 5",
  "BLE 3 Custom 1",
  "BLE 3 Custom 2",
  "BLE 3 Custom 3",
  "BLE 3 Custom 4",
  "BLE 3 Custom 5",
  "BLE 4 Custom 1",
  "BLE 4 Custom 2",
  "BLE 4 Custom 3",
  "BLE 4 Custom 4",
  "BLE 4 Custom 5",
  "EYE Temperature #1",
  "EYE Temperature #2",
  "EYE Temperature #3",
  "EYE Temperature #4",
  "EYE Humidity #1",
  "EYE Humidity #2",
  "EYE Humidity #3",
  "EYE Humidity #4",
  "EYE Magnet #1",
  "EYE Magnet #2",
  "EYE Magnet #3",
  "EYE Magnet #4",
  "Magnet Trigger Count",
  "EYE Movement #1",
  "EYE Movement #2",
  "EYE Movement #3",
  "EYE Movement #4",
  "EYE Movement Count #1",
  "EYE Movement Count #2",
  "EYE Movement Count #3",
  "EYE Movement Count #4",
  "EYE Pitch #1",
  "EYE Pitch #2",
  "EYE Pitch #3",
  "EYE Pitch #4",
  "EYE Roll #1",
  "EYE Roll #2",
  "EYE Roll #3",
  "EYE Roll #4",
  "EYE Low Battery #1",
  "EYE Low Battery #2",
  "EYE Low Battery #3",
  "EYE Low Battery #4",
  "EYE Battery Voltage #1",
  "EYE Battery Voltage #2",
  "EYE Battery Voltage #3",
  "EYE Battery Voltage #4",
  "Sent Data",
  "Received Data",
  "Total Traffic",
  "Sent Records Count",
  "Last Record Send",
  "Last Server Response Time",
  "Received SMS",
  "Sent SMS",
  "SMS Count",
  "AVL Data Sending",
  "Socket"
];

const traccarDefaultNotificationAliasEntries: Array<[string, string]> = [
  ...traccarDefaultNotificationNames.map(
    (name): [string, string] => [name, name]
  ),
  ["Ignition On", "Ignition on"],
  ["Ignition Off", "Ignition off"],
  ["Road Speed Limit Exceeded", "Speed limit exceeded"],
  ["Over speeding", "Speed limit exceeded"],
  ["Movement", "Device moving"],
  ["Idle", "Device inactive"],
  ["Fuel level difference", "Fuel drop"],
  ["Fuel Syphoning", "Fuel Siphoning"],
  ["Fuel siphoning (detected)", "Fuel Siphoning"],
  ["Fuel refill (detected)", "Fuel increase"],
  ["Entered NoGoZone - [Zone Name]", "Geofence entered"],
];

const traccarDefaultNotificationAliases = new Map(
  traccarDefaultNotificationAliasEntries.map(([source, target]) => [notificationKey(source), target])
);

const canonicalNotificationDescription = (description: string, type?: string) => {
  const normalizedType = String(type ?? "").trim().toLowerCase();
  const normalizedDescription = normalizeNotificationDescription(description);
  if (normalizedType === "custom") return normalizedDescription;
  return traccarDefaultNotificationAliases.get(notificationKey(normalizedDescription)) ?? normalizedDescription;
};

/** Resolve legacy/aliased notification names to the canonical display description. */
export function toCanonicalNotificationDescription(description: string, type?: string): string {
  return canonicalNotificationDescription(description, type);
}

/**
 * Map a monitored-event name to the matching catalog description (alias/case aware).
 * Returns null when the name is not in the catalog.
 */
export function resolveMonitoredEventDescription(
  catalog: Array<{ description?: string }>,
  name: string
): string | null {
  const raw = String(name ?? "").trim();
  if (!raw) return null;
  const wantKeys = new Set([
    notificationKey(raw),
    notificationKey(canonicalNotificationDescription(raw))
  ]);
  for (const row of catalog) {
    const desc = String(row?.description ?? "").trim();
    if (!desc) continue;
    const rowKeys = [
      notificationKey(desc),
      notificationKey(canonicalNotificationDescription(desc, String((row as { type?: string }).type ?? "")))
    ];
    if (rowKeys.some((key) => wantKeys.has(key))) return desc;
  }
  return null;
}

/** Keep only monitored names that exist in the catalog, rewritten to catalog descriptions. */
export function normalizeMonitoredEvents(
  catalog: Array<{ description?: string }>,
  names: string[] | undefined | null
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names ?? []) {
    const resolved = resolveMonitoredEventDescription(catalog, name);
    if (!resolved) continue;
    const key = notificationKey(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

/** Count selected monitored events that exist in the catalog (alias-aware). */
export function countMonitoredEventsInCatalog(
  catalog: Array<{ description?: string }>,
  names: string[] | undefined | null
): number {
  return normalizeMonitoredEvents(catalog, names).length;
}

/** Whether a catalog event is selected in monitoredEvents (alias/case aware). */
export function monitoredEventsInclude(
  monitoredEvents: string[] | undefined | null,
  description: string
): boolean {
  const wantKeys = new Set([
    notificationKey(description),
    notificationKey(canonicalNotificationDescription(description))
  ]);
  for (const name of monitoredEvents ?? []) {
    const raw = String(name ?? "").trim();
    if (!raw) continue;
    if (wantKeys.has(notificationKey(raw))) return true;
    if (wantKeys.has(notificationKey(canonicalNotificationDescription(raw)))) return true;
  }
  return false;
}

/** Toggle a catalog description in/out of monitoredEvents using alias-aware matching. */
export function toggleMonitoredEvent(
  monitoredEvents: string[] | undefined | null,
  description: string
): string[] {
  const desc = String(description ?? "").trim();
  if (!desc) return [...(monitoredEvents ?? [])];
  const current = monitoredEvents ?? [];
  if (monitoredEventsInclude(current, desc)) {
    return current.filter((name) => {
      const raw = String(name ?? "").trim();
      if (!raw) return false;
      const keys = new Set([
        notificationKey(raw),
        notificationKey(canonicalNotificationDescription(raw))
      ]);
      return !(
        keys.has(notificationKey(desc))
        || keys.has(notificationKey(canonicalNotificationDescription(desc)))
      );
    });
  }
  return [...current, desc];
}

const canonicalNotificationType = (description: string, type?: string) => {
  const normalizedType = String(type ?? "").trim().toLowerCase();
  if (normalizedType === "custom") return "Custom";
  if (normalizedType === "computed") return "Computed";
  if (isDigitalNotificationDescription(description)) return "Default";
  return traccarDefaultNotificationAliases.has(notificationKey(description)) ? "Default" : "System";
};

const normalizeNotificationRow = (row: NotificationRow): NotificationRow => {
  const description = canonicalNotificationDescription(row.description, row.type);
  const type = canonicalNotificationType(description, row.type);
  const beforeSeconds = Number(row.notificationVideo?.beforeSeconds ?? DEFAULT_NOTIFICATION_VIDEO_WINDOW.beforeSeconds);
  const afterSeconds = Number(row.notificationVideo?.afterSeconds ?? DEFAULT_NOTIFICATION_VIDEO_WINDOW.afterSeconds);
  const views = Array.isArray(row.notificationVideo?.views)
    ? row.notificationVideo?.views.filter((view): view is string => typeof view === "string" && view.trim().length > 0)
    : [];

  const parameters = normalizeNotificationTraccarParameters({
    ...row,
    description,
    type
  });

  const traccarNotificationId = Number(row.traccarNotificationId ?? 0);
  const traccarComputedAttributeId = Number(row.traccarComputedAttributeId ?? 0);

  return {
    ...row,
    description,
    type,
    availability: normalizeNotificationAvailability(row.availability),
    parameters,
    ...(Number.isFinite(traccarNotificationId) && traccarNotificationId > 0
      ? { traccarNotificationId }
      : { traccarNotificationId: undefined }),
    ...(Number.isFinite(traccarComputedAttributeId) && traccarComputedAttributeId > 0
      ? { traccarComputedAttributeId }
      : { traccarComputedAttributeId: undefined }),
    notificationVideo: {
      enabled: Boolean(row.notificationVideo?.enabled ?? false),
      beforeSeconds: Number.isFinite(beforeSeconds) ? beforeSeconds : DEFAULT_NOTIFICATION_VIDEO_WINDOW.beforeSeconds,
      afterSeconds: Number.isFinite(afterSeconds) ? afterSeconds : DEFAULT_NOTIFICATION_VIDEO_WINDOW.afterSeconds,
      durationSeconds:
        (Number.isFinite(beforeSeconds) ? beforeSeconds : DEFAULT_NOTIFICATION_VIDEO_WINDOW.beforeSeconds)
        + (Number.isFinite(afterSeconds) ? afterSeconds : DEFAULT_NOTIFICATION_VIDEO_WINDOW.afterSeconds),
      views
    }
  };
};

export function normalizeNotificationLibraryRow(row: NotificationRow): NotificationRow | null {
  if (isFmNotificationDescription(row.description)) return null;
  return stripMisplacedFuelComputeParameters(normalizeNotificationRow(row));
}

/**
 * New-site seed: digital events are Default and Available.
 * Threshold events stay Unavailable until the user sets parameters.
 */
export function applyNewSiteNotificationPolicy(row: NotificationRow): NotificationRow {
  const normalized = normalizeNotificationRow(row);
  if (isDigitalNotificationDescription(normalized.description)) {
    const type = String(normalized.type ?? "").trim().toLowerCase();
    return {
      ...normalized,
      type: type === "computed" ? normalized.type : "Default",
      availability: "Available"
    };
  }
  return { ...normalized, availability: DEFAULT_NOTIFICATION_AVAILABILITY };
}

/**
 * Existing site libraries keep user choices (Available / Suspended).
 * Digital events still sitting on the old blanket Unavailable seed become Available.
 */
export function applyDigitalEventLibraryDefaults(items: NotificationRow[]): {
  items: NotificationRow[];
  changed: boolean;
} {
  let changed = false;
  const next = items.map((row) => {
    if (!isDigitalNotificationDescription(row.description)) return row;
    const type = String(row.type ?? "").trim();
    const typeKey = type.toLowerCase();
    if (typeKey === "custom" || typeKey === "computed") return row;
    const availability = normalizeNotificationAvailability(row.availability);
    const nextType = "Default";
    const nextAvailability = availability === "Suspended" ? "Suspended" : "Available";
    if (type === nextType && availability === nextAvailability) return row;
    changed = true;
    return { ...row, type: nextType, availability: nextAvailability };
  });
  return { items: next, changed };
}

export const notificationRows: NotificationRow[] = (() => {
  const baseRows: NotificationRow[] = rawNotifications
    .trim()
    .split("\n")
    .map((line) => {
      const [description, type, availability = ""] = line.split("|").map((part) => part.trim());
      return {
        description: normalizeNotificationDescription(description),
        type,
        availability
      };
    })
    .map((row) => normalizeNotificationRow(row))
    .filter((row) => row.description && !isFmNotificationDescription(row.description));

  const teltonikaRows: NotificationRow[] = teltonikaIoNotificationNames.map((name) =>
    normalizeNotificationRow({
      description: name,
      type: "System",
      availability: DEFAULT_NOTIFICATION_AVAILABILITY
    })
  );

  const traccarDefaultRows: NotificationRow[] = traccarDefaultNotificationNames.map((name) =>
    normalizeNotificationRow({
      description: name,
      type: "Default",
      availability: DEFAULT_NOTIFICATION_AVAILABILITY
    })
  );

  const seen = new Set<string>();
  const merged: NotificationRow[] = [];
  for (const row of [...traccarDefaultRows, ...baseRows, ...teltonikaRows]) {
    if (isFmNotificationDescription(row.description)) continue;
    const key = notificationKey(row.description);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const normalized = normalizeNotificationRow(row);
    merged.push(stripMisplacedFuelComputeParameters(normalized));
  }

  const upsertDedicatedFuelRow = (
    description: string,
    type: string,
    eventId: string,
    defaults: NonNullable<NotificationRow["parameters"]>
  ) => {
    const key = notificationKey(description);
    const idx = merged.findIndex((row) => notificationKey(row.description) === key);
    const existing = idx >= 0 ? merged[idx] : undefined;
    let parameters = { ...defaults, ...(existing?.parameters ?? {}) };
    if (!isFuelLevelComputeDescription(description)) {
      const { fuelCompute: _fc, ...rest } = parameters as NotificationRow["parameters"] & {
        fuelCompute?: unknown;
      };
      parameters = rest;
    }
    const nextRow = stripMisplacedFuelComputeParameters(
      normalizeNotificationRow({
        ...existing,
        description,
        type,
        availability: DEFAULT_NOTIFICATION_AVAILABILITY,
        eventId: String(existing?.eventId ?? "").trim() || eventId,
        parameters
      })
    );
    if (idx >= 0) merged[idx] = nextRow;
    else {
      seen.add(key);
      merged.push(nextRow);
    }
  };

  upsertDedicatedFuelRow(
    FUEL_LEVEL_COMPUTE_NOTIFICATION_DESCRIPTION,
    "Computed",
    "97001",
    defaultFuelComputeParameters
  );

  const upsertActiveOnlyFuelRow = (description: string, eventId: string, traccarType = "Default") => {
    const key = notificationKey(description);
    const idx = merged.findIndex((row) => notificationKey(row.description) === key);
    const existing = idx >= 0 ? merged[idx] : undefined;
    const parameters = applyActiveOnlyFuelParametersForSave({
      record: existing?.parameters?.record,
      actions: existing?.parameters?.actions,
      active: existing?.parameters?.active
    });
    const nextRow = stripMisplacedFuelComputeParameters(
      normalizeNotificationRow({
        ...existing,
        description,
        type: traccarType,
        availability: DEFAULT_NOTIFICATION_AVAILABILITY,
        eventId: String(existing?.eventId ?? "").trim() || eventId,
        parameters
      })
    );
    if (idx >= 0) merged[idx] = nextRow;
    else {
      seen.add(key);
      merged.push(nextRow);
    }
  };

  upsertActiveOnlyFuelRow(FUEL_SIPHONING_NOTIFICATION_DESCRIPTION, "97010");
  upsertActiveOnlyFuelRow(FUEL_DROP_NOTIFICATION_DESCRIPTION, "97011");
  upsertActiveOnlyFuelRow(FUEL_INCREASE_NOTIFICATION_DESCRIPTION, "97012");
  upsertActiveOnlyFuelRow(FUEL_GRADUAL_DROP_NOTIFICATION_DESCRIPTION, "97014");

  const upsertDefaultConditions = (
    description: string,
    type: string,
    eventId: string,
    defaults: NonNullable<NotificationRow["parameters"]>
  ) => {
    const key = notificationKey(description);
    const idx = merged.findIndex((row) => notificationKey(row.description) === key);
    const existing = idx >= 0 ? merged[idx] : undefined;
    const existingConditions = Array.isArray(existing?.parameters?.conditions)
      ? existing?.parameters?.conditions
      : [];
    const hasConditions = existingConditions.some(
      (c) => String(c.field ?? "").trim() && String(c.operator ?? "").trim()
    );
    const parameters = {
      ...defaults,
      ...(existing?.parameters ?? {}),
      conditions: hasConditions ? existingConditions : defaults.conditions
    };
    const nextRow = stripMisplacedFuelComputeParameters(
      normalizeNotificationRow({
        ...existing,
        description,
        type,
        availability:
          normalizeNotificationAvailability(existing?.availability) === "Available"
            ? "Available"
            : DEFAULT_NOTIFICATION_AVAILABILITY,
        eventId: String(existing?.eventId ?? "").trim() || eventId,
        parameters
      })
    );
    if (idx >= 0) merged[idx] = nextRow;
    else {
      seen.add(key);
      merged.push(nextRow);
    }
  };

  upsertDefaultConditions("Over speeding", "System", "29969", defaultOverSpeedingParameters);
  upsertDefaultConditions(
    "Over Speeding Pre-Warning",
    "Custom",
    "29975",
    defaultOverSpeedingPreWarningParameters
  );

  return ensureSiteTraccarDefaultNotifications(
    filterFmNotificationRows(merged.map(stripMisplacedFuelComputeParameters).map(applyNewSiteNotificationPolicy))
  ).items;
})();

for (const row of notificationRows) {
  const id = String(row.eventId ?? "").trim();
  if (!id || !row.description) continue;
  notificationEventIds[row.description] = id;
}
