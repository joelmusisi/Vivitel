import {
  inferDefaultConditionsForDescription,
  isFuelInTankDescription,
  isFuelLevelReturnParameter,
  isFuelTankComputationParameter,
  notificationUsesFuelTankComputation,
  type NotificationRow
} from "../data/notificationLibrary";
import {
  mapTeltonikaAnalogInputFieldToJexl,
  mapTeltonikaAnalogInputFieldToJexlWithFallback,
  TELTONIKA_ANALOG_INPUT_MAX
} from "../data/teltonikaAnalogInputs";
import {
  buildFuelCalibrationJexlExpression,
  hasUsableFuelCalibration,
  normalizeFuelCalibration,
  type FuelCalibrationPoint
} from "./fuelCalibration";

/** Structural device-binding shape (avoids importing fuelComputeFromDevice and creating a cycle). */
type DeviceBindingLike = {
  id?: string;
  name?: string;
  lines?: Array<Record<string, unknown>>;
};

export type ParameterCatalogRow = {
  name: string;
  type?: string;
  units?: string;
  availability?: string;
};

export type NotificationCondition = {
  id?: number;
  field?: string;
  operator?: string;
  value?: string;
  /** Logical join to the next condition (`and` → `&&`, `or` → `||`). */
  join?: "and" | "or" | string;
};

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

/** Traccar native position attributes that are boolean-typed. */
const TRACCAR_NATIVE_BOOLEAN_ATTRS = new Set(["ignition", "motion", "charge", "blocked", "armed", "door"]);

const THRESHOLD_BOOLEAN_EVENT_KEYS = new Set(
  ["fuel refill (detected)", "fuel siphoning (detected)"].map((value) => value.toLowerCase())
);

const OVER_SPEED_EXCESS_EVENT_KEYS = new Set(
  [
    "over speeding",
    "over speeding pre-warning",
    "over speeding - warning",
    "over speeding in location",
    "over speeding in location - excessive duration",
    "over speeding in location - excessive speed",
    "speed limit exceeded",
    "road speed limit exceeded"
  ].map((value) => value.toLowerCase())
);

function normalizeDescriptionKey(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function usesThresholdBooleanExpression(description: string): boolean {
  const key = normalizeDescriptionKey(description);
  return THRESHOLD_BOOLEAN_EVENT_KEYS.has(key);
}

/**
 * Traccar advanced overspeed: excess km/h over limit as a number attribute (not boolean).
 * Only exact system event names — custom names like "Mulu Over Speeding" use boolean
 * threshold expressions so UI km/h limits are not rewritten as excess-over-limit values.
 */
export function usesOverSpeedExcessCapture(description: string): boolean {
  return OVER_SPEED_EXCESS_EVENT_KEYS.has(normalizeDescriptionKey(description));
}

export function readSpeedThresholdKphFromConditions(
  conditions: NotificationCondition[] | undefined,
  catalog?: ParameterCatalogRow[]
): number | null {
  for (const row of conditions ?? []) {
    const fieldExpr = mapParameterFieldToJexl(String(row.field ?? ""), catalog);
    if (fieldExpr !== "speed") continue;
    const op = String(row.operator ?? "").trim();
    if (op !== ">" && op !== ">=") continue;
    const threshold = Number(String(row.value ?? "").trim());
    if (Number.isFinite(threshold)) return threshold;
  }
  return null;
}

/**
 * Traccar advanced speeding capture — stores km/h over the limit (number), or null when not speeding.
 * Library thresholds are km/h; Traccar position `speed` is knots.
 * @see https://www.traccar.org/computed-attributes/ (requires local variables enabled on the server)
 */
export function buildOverSpeedExcessJexlExpression(
  conditions: NotificationCondition[] | undefined,
  catalog?: ParameterCatalogRow[]
): string {
  const maxSpeedKph = readSpeedThresholdKphFromConditions(conditions, catalog);
  if (maxSpeedKph == null) return "null";
  return `var maxSpeedKph = ${maxSpeedKph}; var speedKph = speed * 1.852; speedKph > maxSpeedKph ? speedKph - maxSpeedKph : null`;
}

function escapeJexlString(value: string): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function parameterToAttributeKey(name: string): string {
  return (
    String(name ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "param"
  );
}

export function parameterToComputedAttributeName(name: string): string {
  const key = parameterToAttributeKey(name);
  return `viviParam_${key}`.slice(0, 120);
}

export function parameterLibraryId(name: string): string {
  return `parameter-lib:${parameterToAttributeKey(name)}`;
}

export function mapParameterTypeToTraccar(type: string): string {
  const normalized = String(type ?? "").trim().toLowerCase();
  if (normalized === "boolean") return "boolean";
  if (normalized === "computed") return "number";
  if (
    ["integer", "value", "distance", "speed", "seconds", "temperature", "number", "acceleration"].includes(
      normalized
    )
  ) {
    return "number";
  }
  return "string";
}

function lookupCatalogParameter(name: string, catalog?: ParameterCatalogRow[]): ParameterCatalogRow | undefined {
  const key = String(name ?? "").trim().toLowerCase();
  if (!key) return undefined;
  return catalog?.find((row) => String(row.name ?? "").trim().toLowerCase() === key);
}

/** True when a condition parameter should use boolean operators / true|false values for Traccar. */
export function isBooleanParameterField(field: string, catalog?: ParameterCatalogRow[]): boolean {
  const trimmed = String(field ?? "").trim();
  if (!trimmed) return false;
  const catalogRow = lookupCatalogParameter(trimmed, catalog);
  if (String(catalogRow?.type ?? "").trim().toLowerCase() === "boolean") return true;
  const lower = String(catalogRow?.name ?? trimmed).trim().toLowerCase();
  const mapped = POSITION_FIELD_MAP[lower];
  return Boolean(mapped && TRACCAR_NATIVE_BOOLEAN_ATTRS.has(mapped));
}

export function mapParameterFieldToJexl(field: string, catalog?: ParameterCatalogRow[]): string {
  const trimmed = String(field ?? "").trim();
  if (!trimmed) return "";
  if (isFuelTankComputationParameter(trimmed)) return "";

  const catalogRow = lookupCatalogParameter(trimmed, catalog);
  const catalogName = String(catalogRow?.name ?? trimmed).trim();
  const lower = catalogName.toLowerCase();

  if (POSITION_FIELD_MAP[lower]) return POSITION_FIELD_MAP[lower];

  const teltonikaIo = mapTeltonikaAnalogInputFieldToJexl(catalogName);
  if (teltonikaIo) return teltonikaIo;

  const ioNumberMatch = catalogName.match(/(?:^|\b)io\s*(\d+)(?:\b|$)/i);
  if (ioNumberMatch) {
    const ioKey = Number(ioNumberMatch[1]);
    if (Number.isFinite(ioKey) && ioKey >= 1 && ioKey <= TELTONIKA_ANALOG_INPUT_MAX) {
      return `io${ioKey}`;
    }
  }

  const label = escapeJexlString(catalogName);
  const attrKey = parameterToAttributeKey(catalogName);
  return `(attributes["${label}"] != null ? attributes["${label}"] : (attributes.${attrKey} != null ? attributes.${attrKey} : null))`;
}

function formatJexlValue(raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return '""';
  if (/^(true|false)$/i.test(value)) return value.toLowerCase();
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  return JSON.stringify(value);
}

function isAlwaysDefinedPositionField(fieldExpr: string): boolean {
  return /^(speed|course|latitude|longitude|altitude|accuracy|address|distance|totalDistance|odometer|satellites|hours|motion|ignition|battery)$/.test(
    fieldExpr
  );
}

function isSimpleJexlIdentifier(fieldExpr: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldExpr);
}

/**
 * Traccar computed-attribute style: position fields (speed, etc.) use a plain comparison;
 * optional device attributes use `field ? field > x : null` (see traccar.org/computed-attributes).
 */
export function wrapJexlComparison(fieldExpr: string, comparison: string): string {
  if (!fieldExpr || !comparison) return "null";
  if (isAlwaysDefinedPositionField(fieldExpr)) {
    return comparison;
  }
  if (isSimpleJexlIdentifier(fieldExpr)) {
    return `${fieldExpr} ? ${comparison} : null`;
  }
  if (fieldExpr.includes("?") || fieldExpr.startsWith("(")) {
    return `${fieldExpr} ? ${comparison} : null`;
  }
  return `${fieldExpr} != null ? ${comparison} : null`;
}

function mapOperatorToJexl(fieldExpr: string, operator: string, value: string): string {
  const op = String(operator ?? "").trim();
  const numericValue = Number(String(value ?? "").trim());
  // UI speed thresholds are km/h; Traccar JEXL `speed` is knots.
  const speedLeft =
    fieldExpr === "speed" && Number.isFinite(numericValue) ? "(speed * 1.852)" : fieldExpr;
  const formatted =
    speedLeft !== fieldExpr ? String(numericValue) : formatJexlValue(value);
  let comparison = "";
  switch (op) {
    case "is":
    case "=":
      comparison = `${speedLeft} == ${formatted}`;
      break;
    case "is not":
      comparison = `${speedLeft} != ${formatted}`;
      break;
    case "<":
      comparison = `${speedLeft} < ${formatted}`;
      break;
    case "<=":
      comparison = `${speedLeft} <= ${formatted}`;
      break;
    case ">":
      comparison = `${speedLeft} > ${formatted}`;
      break;
    case ">=":
      comparison = `${speedLeft} >= ${formatted}`;
      break;
    default:
      return "";
  }
  return wrapJexlComparison(fieldExpr, comparison);
}

export function hasMeaningfulNotificationConditions(conditions: NotificationCondition[] | undefined): boolean {
  return (conditions ?? []).some(
    (row) => String(row.field ?? "").trim() && String(row.operator ?? "").trim()
  );
}

export function readNotificationReturnParameter(row: {
  parameters?: { returnValue?: { param?: string; mode?: string } };
}): string {
  const returnParam = String(row.parameters?.returnValue?.param ?? "").trim();
  if (!returnParam || returnParam.toLowerCase() === "no return value") return "";
  return returnParam;
}

export function shouldUseReturnValuePassThrough(
  row: {
    description?: string;
    type?: string;
    parameters?: { returnValue?: { param?: string; mode?: string }; conditions?: NotificationCondition[] };
  },
  _catalog?: ParameterCatalogRow[]
): boolean {
  if (
    notificationUsesFuelTankComputation({
      description: String(row.description ?? ""),
      type: row.type,
      availability: "",
      parameters: row.parameters
    } as NotificationRow)
  ) {
    return false;
  }
  const returnParam = readNotificationReturnParameter(row);
  if (!returnParam) return false;
  if (
    usesThresholdBooleanExpression(String(row.description ?? "")) ||
    usesOverSpeedExcessCapture(String(row.description ?? ""))
  ) {
    return false;
  }
  const rowType = String(row.type ?? "").trim().toLowerCase();
  if (rowType === "computed") return true;
  if (!hasMeaningfulNotificationConditions(row.parameters?.conditions)) return true;
  return true;
}

function isFuelExpressionContext(row: {
  description?: string;
  type?: string;
  parameters?: {
    returnValue?: { param?: string; mode?: string };
    conditions?: NotificationCondition[];
    fuelCompute?: FuelComputeConfig;
  };
}): boolean {
  if (
    notificationUsesFuelTankComputation({
      description: String(row.description ?? ""),
      type: row.type ?? "",
      availability: "",
      parameters: row.parameters
    } as NotificationRow)
  ) {
    return true;
  }
  const desc = normalizeDescriptionKey(String(row.description ?? ""));
  if (desc.includes("fuel")) return true;
  const returnParam = readNotificationReturnParameter(row);
  if (returnParam && (isFuelTankComputationParameter(returnParam) || isFuelLevelReturnParameter(returnParam))) {
    return true;
  }
  return (row.parameters?.conditions ?? []).some((c) =>
    isFuelTankComputationParameter(String(c.field ?? ""))
  );
}

function isLegacyFuelLevelField(field: string): boolean {
  const key = String(field ?? "").trim().toLowerCase();
  return key === "fuellevel" || key === "fuel level (l)";
}

/** Resolve catalog parameter label used in conditions / return value. */
export function resolveExpressionParameterName(
  field: string,
  row: {
    description?: string;
    type?: string;
    parameters?: {
      returnValue?: { param?: string; mode?: string };
      conditions?: NotificationCondition[];
      fuelCompute?: FuelComputeConfig;
    };
  },
  catalog?: ParameterCatalogRow[]
): string {
  const trimmed = String(field ?? "").trim();
  if (!trimmed) return "";

  const returnParam = readNotificationReturnParameter(row);
  if (returnParam && !isFuelTankComputationParameter(returnParam)) {
    if (!trimmed || trimmed.toLowerCase() === "no return value") return returnParam;
    if (isLegacyFuelLevelField(trimmed) && !isFuelExpressionContext(row)) return returnParam;
  }

  if (isLegacyFuelLevelField(trimmed) && !isFuelExpressionContext(row)) {
    const inferred = inferDefaultConditionsForDescription(String(row.description ?? ""))?.[0]?.field;
    if (inferred) return String(inferred).trim();
  }

  const catalogRow = lookupCatalogParameter(trimmed, catalog);
  return catalogRow?.name ?? trimmed;
}

function normalizeConditionsForExpression(
  row: {
    description?: string;
    type?: string;
    parameters?: {
      returnValue?: { param?: string; mode?: string };
      conditions?: NotificationCondition[];
      fuelCompute?: FuelComputeConfig;
    };
  },
  catalog?: ParameterCatalogRow[]
): NotificationCondition[] {
  const normalized: NotificationCondition[] = [];
  for (const condition of row.parameters?.conditions ?? []) {
    const field = resolveExpressionParameterName(String(condition.field ?? ""), row, catalog);
    const operator = String(condition.operator ?? "").trim();
    if (!field || !operator) continue;
    normalized.push({ ...condition, field });
  }
  return normalized;
}

function remapConditionsToReturnParameter(
  conditions: NotificationCondition[],
  returnParam: string
): NotificationCondition[] {
  return conditions.map((row) => ({ ...row, field: returnParam }));
}

function normalizeConditionJoin(join: unknown): "&&" | "||" {
  const raw = String(join ?? "and").trim().toLowerCase();
  return raw === "or" || raw === "||" ? "||" : "&&";
}

function wrapJexlConditionPart(part: string): string {
  return part.includes("&&") || part.includes("||") || part.includes("?") ? `(${part})` : part;
}

export function buildJexlExpressionFromConditions(
  conditions: NotificationCondition[] | undefined,
  catalog?: ParameterCatalogRow[]
): string {
  const rows: Array<{ expr: string; join?: string }> = [];
  for (const row of conditions ?? []) {
    const fieldExpr = mapParameterFieldToJexl(String(row.field ?? ""), catalog);
    if (!fieldExpr) continue;
    const expr = mapOperatorToJexl(fieldExpr, String(row.operator ?? ""), String(row.value ?? ""));
    if (!expr) continue;
    rows.push({ expr, join: row.join });
  }
  if (!rows.length) return "null";
  if (rows.length === 1) return rows[0].expr;

  let combined = wrapJexlConditionPart(rows[0].expr);
  for (let index = 1; index < rows.length; index += 1) {
    const joinOp = normalizeConditionJoin(rows[index - 1].join);
    combined = `${combined} ${joinOp} ${wrapJexlConditionPart(rows[index].expr)}`;
  }
  return combined;
}

export function buildParameterPassThroughExpression(name: string): string {
  const label = escapeJexlString(String(name ?? "").trim());
  const key = parameterToAttributeKey(name);
  return `(attributes["${label}"] != null ? attributes["${label}"] : (attributes.${key} != null ? attributes.${key} : null))`;
}

export function buildComputedAttributeExpressionFromLibrary(
  row: {
    description?: string;
    type?: string;
    parameters?: {
      conditions?: NotificationCondition[];
      returnValue?: { param?: string; mode?: string };
      fuelCompute?: FuelComputeConfig;
    };
  },
  catalog?: ParameterCatalogRow[],
  _deviceBinding?: DeviceBindingLike | null
): string {
  if (readFuelComputeConfig(row)) {
    // Prefer buildFuelComputeExpressionFromDevice at call sites when a device binding exists.
    // Keep library-only fuel formulas working here without importing fuelComputeFromDevice (cycle).
    const expression = buildFuelLevelJexlExpression(readFuelComputeConfig(row)!, catalog);
    return expression && expression !== "null" ? expression : "null";
  }

  const returnParam = readNotificationReturnParameter(row);
  const normalizedConditions = normalizeConditionsForExpression(row, catalog);
  const hasConditions = hasMeaningfulNotificationConditions(normalizedConditions);

  if (usesOverSpeedExcessCapture(String(row.description ?? ""))) {
    const excess = buildOverSpeedExcessJexlExpression(normalizedConditions, catalog);
    if (excess !== "null") return excess;
  }

  if (returnParam && !isFuelTankComputationParameter(returnParam)) {
    if (hasConditions) {
      return buildJexlExpressionFromConditions(
        remapConditionsToReturnParameter(normalizedConditions, returnParam),
        catalog
      );
    }
    if (shouldUseReturnValuePassThrough(row, catalog)) {
      return buildParameterPassThroughExpression(returnParam);
    }
  }

  if (hasConditions) {
    return buildJexlExpressionFromConditions(normalizedConditions, catalog);
  }

  if (returnParam && shouldUseReturnValuePassThrough(row, catalog)) {
    return buildParameterPassThroughExpression(returnParam);
  }

  return "null";
}

export function resolveComputedAttributeTypeFromLibrary(
  row: {
    description?: string;
    type?: string;
    parameters?: {
      conditions?: NotificationCondition[];
      returnValue?: { param?: string; mode?: string };
      fuelCompute?: FuelComputeConfig;
    };
  },
  catalog?: ParameterCatalogRow[]
): string {
  if (readFuelComputeConfig(row)) return "number";

  if (usesOverSpeedExcessCapture(String(row.description ?? ""))) {
    const threshold = readSpeedThresholdKphFromConditions(row.parameters?.conditions, catalog);
    if (threshold != null) return "number";
  }

  const returnParam = readNotificationReturnParameter(row);
  const normalizedConditions = normalizeConditionsForExpression(row, catalog);
  if (returnParam && !isFuelTankComputationParameter(returnParam)) {
    if (shouldUseReturnValuePassThrough(row, catalog) && !hasMeaningfulNotificationConditions(normalizedConditions)) {
      const catalogRow = lookupCatalogParameter(returnParam, catalog);
      return mapParameterTypeToTraccar(String(catalogRow?.type ?? "Value"));
    }
  }

  if (hasMeaningfulNotificationConditions(normalizedConditions)) {
    return "boolean";
  }

  if (returnParam && shouldUseReturnValuePassThrough(row, catalog)) {
    const catalogRow = lookupCatalogParameter(returnParam, catalog);
    return mapParameterTypeToTraccar(String(catalogRow?.type ?? "Value"));
  }

  return "boolean";
}

export function isParameterAvailable(row: ParameterCatalogRow): boolean {
  return String(row.availability ?? "").trim().toLowerCase() === "available";
}

/** Litres per millivolt: tank capacity ÷ max sensor mV (legacy helper). */
export function formatFuelLiterPerMvCoefficient(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return Number(value.toFixed(8)).toString();
}

export function computeFuelLiterPerMvCoefficient(
  tankCapacityL: string | number,
  maxMv: string | number
): string {
  const capacity = Number(tankCapacityL);
  const mv = Number(maxMv);
  if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(mv) || mv <= 0) return "";
  return formatFuelLiterPerMvCoefficient(capacity / mv);
}

/**
 * Max voltage (mV) for the proportional fuel formula:
 * (Max Capacity × input line voltage) / Max voltage.
 * Prefers Max mV; falls back to Min mV when Max is blank/0.
 */
export function resolveFuelMaxVoltageMv(input: {
  inputMvMin?: string;
  inputMvMax?: string;
}): number | null {
  const maxRaw = String(input.inputMvMax ?? "").trim();
  const minRaw = String(input.inputMvMin ?? "").trim();
  const maxMv = maxRaw === "" ? Number.NaN : Number(maxRaw);
  const minMv = minRaw === "" ? Number.NaN : Number(minRaw);
  if (Number.isFinite(maxMv) && maxMv > 0) return maxMv;
  if (Number.isFinite(minMv) && minMv > 0) return minMv;
  return null;
}

export type FuelMvCalibration = {
  /** Lower mV endpoint (legacy). */
  fullMv: number;
  /** Higher / max voltage endpoint used as formula denominator. */
  emptyMv: number;
  fullLiters: number;
  emptyLiters: number;
  /** Legacy |Δlitres| / |ΔmV|; unused by the proportional formula. */
  coefficient: number;
};

/**
 * Resolve fuel sensor calibration endpoints from device-binding mV / capacity fields.
 * Max voltage prefers Max mV, then Min mV when Max is blank/0.
 */
export function resolveFuelMvCalibration(input: {
  inputMvMin?: string;
  inputMvMax?: string;
  tankCapacityMin?: string;
  tankCapacityMax?: string;
  tankCapacity?: string;
}): FuelMvCalibration | null {
  const maxVoltage = resolveFuelMaxVoltageMv(input);
  if (maxVoltage == null) return null;

  const maxCapRaw = String(input.tankCapacityMax ?? input.tankCapacity ?? "").trim();
  const minCapRaw = String(input.tankCapacityMin ?? "").trim();
  const fullLiters = Number(maxCapRaw);
  const emptyLiters = minCapRaw === "" ? 0 : Number(minCapRaw);
  if (!Number.isFinite(fullLiters) || fullLiters <= 0) return null;
  if (!Number.isFinite(emptyLiters) || emptyLiters < 0) return null;

  return {
    fullMv: 0,
    emptyMv: maxVoltage,
    fullLiters,
    emptyLiters,
    coefficient: fullLiters / maxVoltage
  };
}

export function usesMillivoltFuelFormula(input: FuelComputeConfig): boolean {
  const maxCapacity = Number(String(input.tankCapacityMax ?? input.tankCapacity ?? "").trim());
  const maxVoltage = resolveFuelMaxVoltageMv(input);
  return Number.isFinite(maxCapacity) && maxCapacity > 0 && maxVoltage != null;
}

export type FuelComputeConfig = {
  enabled?: boolean;
  tankCapacity?: string;
  /** Tank level (litres) at Min mV — from device binding when set. */
  tankCapacityMin?: string;
  /** Tank level (litres) at Max mV — from device binding when set. */
  tankCapacityMax?: string;
  inputField?: string;
  /** Optional mV range from device binding — clamps analogue reading before formula. */
  inputMvMin?: string;
  inputMvMax?: string;
  scale?: string;
  outputAttribute?: string;
  calibrationPoints?: FuelCalibrationPoint[];
};

const DEFAULT_FUEL_COMPUTE: FuelComputeConfig = {
  enabled: true,
  tankCapacity: "400",
  scale: "75",
  outputAttribute: "fuelLevel"
};

export function readFuelComputeConfig(row: {
  description?: string;
  parameters?: {
    fuelCompute?: FuelComputeConfig;
    returnValue?: { param?: string; mode?: string };
    conditions?: NotificationCondition[];
  };
}): FuelComputeConfig | null {
  if (
    !notificationUsesFuelTankComputation({
      description: String(row.description ?? ""),
      type: "",
      availability: "",
      parameters: row.parameters
    } as NotificationRow)
  ) {
    return null;
  }
  const fuel = row.parameters?.fuelCompute;
  if (fuel && typeof fuel === "object" && fuel.enabled === false) return null;
  return {
    ...DEFAULT_FUEL_COMPUTE,
    ...(fuel && typeof fuel === "object" ? fuel : {}),
    enabled: true
  };
}

export { isFuelTankComputationParameter };

export function isFuelComputeNotification(row: {
  description?: string;
  parameters?: { fuelCompute?: FuelComputeConfig };
}): boolean {
  return readFuelComputeConfig(row) != null;
}

/** Clamp or bound analogue voltage (mV) when min/max are set on the device fuel line. */
export function wrapAnalogVoltageForMvRange(
  voltageExpr: string,
  minMv?: string,
  maxMv?: string
): string {
  const expr = String(voltageExpr ?? "").trim();
  if (!expr) return expr;

  const minRaw = String(minMv ?? "").trim();
  const maxRaw = String(maxMv ?? "").trim();
  let low = minRaw ? Number(minRaw) : NaN;
  let high = maxRaw ? Number(maxRaw) : NaN;
  const hasMin = Number.isFinite(low);
  const hasMax = Number.isFinite(high);
  if (!hasMin && !hasMax) return expr;
  if (hasMin && hasMax && low > high) {
    const swap = low;
    low = high;
    high = swap;
  }
  if (hasMin && hasMax) {
    return `(${expr} != null ? (${expr} < ${low} ? ${low} : (${expr} > ${high} ? ${high} : ${expr})) : null)`;
  }
  if (hasMin) {
    return `(${expr} != null ? (${expr} < ${low} ? ${low} : ${expr}) : null)`;
  }
  return `(${expr} != null ? (${expr} > ${high} ? ${high} : ${expr}) : null)`;
}

export function mapInputVoltageFieldToJexl(field: string, catalog?: ParameterCatalogRow[]): string {
  const trimmed = String(field ?? "").trim();
  if (!trimmed) return "";

  const teltonikaExpr = mapTeltonikaAnalogInputFieldToJexlWithFallback(trimmed);
  if (teltonikaExpr) return teltonikaExpr;

  return mapParameterFieldToJexl(trimmed, catalog);
}

/**
 * Traccar JEXL from device-binding calibration (same expression shown in Bindings).
 * Formula: (Max Capacity × input line voltage) / Max voltage
 */
export function buildFuelLevelJexlExpression(
  input: FuelComputeConfig,
  catalog?: ParameterCatalogRow[]
): string {
  const inputField = String(input.inputField ?? "").trim();
  if (!inputField) return "null";

  const teltonikaIo = mapTeltonikaAnalogInputFieldToJexl(inputField);
  const voltageExpr = teltonikaIo || mapInputVoltageFieldToJexl(inputField, catalog);
  if (!voltageExpr) return "null";

  const io = teltonikaIo || voltageExpr;
  const chart = normalizeFuelCalibration(input.calibrationPoints);
  if (hasUsableFuelCalibration(chart)) {
    return buildFuelCalibrationJexlExpression(io, chart);
  }

  const maxCapacityRaw = String(input.tankCapacityMax ?? input.tankCapacity ?? "").trim();
  const maxCapacity = Number(maxCapacityRaw);
  const maxVoltage = resolveFuelMaxVoltageMv(input);
  if (!Number.isFinite(maxCapacity) || maxCapacity <= 0 || maxVoltage == null) return "null";

  const proportional = `((${maxCapacity} * ${io}) / ${maxVoltage})`;
  if (teltonikaIo) return proportional;
  return `(${voltageExpr} != null ? ${proportional} : null)`;
}

/** Preview helper for Bindings — identical to the Traccar computed-attribute expression. */
export function buildFuelFormulaPreviewFromDeviceLine(line: {
  analogInput?: string;
  parameter?: string;
  analogMvMin?: string;
  analogMvMax?: string;
  tankCapacityMin?: string;
  tankCapacityMax?: string;
  fuelScale?: string;
  fuelCalibration?: unknown;
}): string {
  const inputField = String(line.analogInput ?? line.parameter ?? "").trim();
  const tankCapacityMax = String(line.tankCapacityMax ?? "").trim();
  const chart = normalizeFuelCalibration(line.fuelCalibration);
  if (!inputField || (!tankCapacityMax && !hasUsableFuelCalibration(chart))) return "";

  const config: FuelComputeConfig = {
    enabled: true,
    inputField,
    tankCapacity: tankCapacityMax || String(chart[chart.length - 1]?.liters ?? ""),
    tankCapacityMax: tankCapacityMax || String(chart[chart.length - 1]?.liters ?? ""),
    tankCapacityMin: String(line.tankCapacityMin ?? "").trim() || undefined,
    inputMvMin: String(line.analogMvMin ?? "").trim() || undefined,
    inputMvMax: String(line.analogMvMax ?? "").trim() || undefined,
    ...(hasUsableFuelCalibration(chart) ? { calibrationPoints: chart } : {})
  };
  const expression = buildFuelLevelJexlExpression(config);
  return expression && expression !== "null" ? expression : "";
}

export function resolveFuelComputeOutputAttribute(row: {
  description?: string;
  parameters?: { fuelCompute?: FuelComputeConfig; returnValue?: { param?: string; mode?: string } };
}): string {
  const fuel = readFuelComputeConfig(row);
  const explicit = String(fuel?.outputAttribute ?? "").trim();
  if (explicit) return parameterToAttributeKey(explicit);
  const returnParam = readNotificationReturnParameter(row);
  if (isFuelInTankDescription(String(row.description ?? ""))) {
    return parameterToAttributeKey(String(fuel?.outputAttribute ?? "").trim() || "fuel");
  }
  if (returnParam && !isFuelTankComputationParameter(returnParam) && !isFuelLevelReturnParameter(returnParam)) {
    return parameterToAttributeKey(returnParam);
  }
  return parameterToAttributeKey(String(fuel?.outputAttribute ?? "").trim() || "fuelLevel");
}
