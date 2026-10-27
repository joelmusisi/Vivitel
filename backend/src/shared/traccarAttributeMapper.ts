import {
  mapTeltonikaAnalogInputFieldToJexl,
  mapTeltonikaAnalogInputFieldToJexlWithFallback,
  TELTONIKA_ANALOG_INPUT_MAX
} from "./teltonikaAnalogInputs";
import { buildFuelCalibrationJexlExpression, hasUsableFuelCalibration } from "./fuelCalibration";

export type ParameterCatalogRow = {
  name: string;
  type?: string;
  units?: string;
  availability?: string;
};

export type NotificationCondition = {
  field?: string;
  operator?: string;
  value?: string;
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
 * Only exact system overspeed event names. Custom names (e.g. "Mulu Over Speeding")
 * use boolean km/h threshold expressions instead of excess-over-limit capture.
 */
export function usesOverSpeedExcessCapture(description: string): boolean {
  return OVER_SPEED_EXCESS_EVENT_KEYS.has(normalizeDescriptionKey(description));
}

function readSpeedThresholdKphFromConditions(
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

export function buildOverSpeedExcessJexlExpression(
  conditions: NotificationCondition[] | undefined,
  catalog?: ParameterCatalogRow[]
): string {
  const maxSpeedKph = readSpeedThresholdKphFromConditions(conditions, catalog);
  if (maxSpeedKph == null) return "null";
  // Library thresholds are km/h; Traccar position `speed` is knots. Return excess in km/h.
  // Other conditions on the row (e.g. "Ignition is true") still apply; they used to be dropped.
  const others = (conditions ?? []).filter((row) => {
    const fieldExpr = mapParameterFieldToJexl(String(row.field ?? ""), catalog);
    const op = String(row.operator ?? "").trim();
    return !(fieldExpr === "speed" && (op === ">" || op === ">="));
  });
  const guard = others.length ? buildJexlExpressionFromConditions(others, catalog) : "null";
  const overLimit = guard !== "null" ? `(${guard}) && speedKph > maxSpeedKph` : "speedKph > maxSpeedKph";
  return `var maxSpeedKph = ${maxSpeedKph}; var speedKph = speed * 1.852; ${overLimit} ? speedKph - maxSpeedKph : null`;
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

export function toComputedAttributeKey(eventId: string): string {
  const safe = String(eventId ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe ? `viviEvt_${safe}` : "viviEvt_custom";
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
  parameters?: { returnValue?: { param?: string } };
}): string {
  const returnParam = String(row.parameters?.returnValue?.param ?? "").trim();
  if (!returnParam || returnParam.toLowerCase() === "no return value") return "";
  return returnParam;
}

export function shouldUseReturnValuePassThrough(
  row: {
    description?: string;
    type?: string;
    parameters?: { returnValue?: { param?: string }; conditions?: NotificationCondition[] };
  },
  _catalog?: ParameterCatalogRow[]
): boolean {
  if (notificationUsesFuelTankComputation({ description: row.description, parameters: row.parameters } as Record<string, unknown>)) {
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
  parameters?: {
    returnValue?: { param?: string };
    conditions?: NotificationCondition[];
    fuelCompute?: FuelComputeConfig;
  };
}): boolean {
  if (notificationUsesFuelTankComputation({ description: row.description, parameters: row.parameters } as Record<string, unknown>)) {
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

function resolveExpressionParameterName(
  field: string,
  row: {
    description?: string;
    parameters?: {
      returnValue?: { param?: string };
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
    if (returnParam && !isFuelTankComputationParameter(returnParam)) return returnParam;
  }

  const catalogRow = lookupCatalogParameter(trimmed, catalog);
  return catalogRow?.name ?? trimmed;
}

function normalizeConditionsForExpression(
  row: {
    description?: string;
    parameters?: {
      returnValue?: { param?: string };
      conditions?: NotificationCondition[];
      fuelCompute?: FuelComputeConfig;
    };
  },
  catalog?: ParameterCatalogRow[]
): NotificationCondition[] {
  const next: NotificationCondition[] = [];
  for (const condition of row.parameters?.conditions ?? []) {
    const field = resolveExpressionParameterName(String(condition.field ?? ""), row, catalog);
    const operator = String(condition.operator ?? "").trim();
    if (!field || !operator) continue;
    next.push({ ...condition, field });
  }
  return next;
}

function remapConditionsToReturnParameter(
  conditions: NotificationCondition[],
  returnParam: string
): NotificationCondition[] {
  return conditions.map((row) => ({ ...row, field: returnParam }));
}

export function buildJexlExpressionFromConditions(
  conditions: NotificationCondition[] | undefined,
  catalog?: ParameterCatalogRow[]
): string {
  const parts = (conditions ?? [])
    .map((row) => {
      const fieldExpr = mapParameterFieldToJexl(String(row.field ?? ""), catalog);
      if (!fieldExpr) return "";
      return mapOperatorToJexl(fieldExpr, String(row.operator ?? ""), String(row.value ?? ""));
    })
    .filter(Boolean);
  if (!parts.length) return "null";
  if (parts.length === 1) return parts[0];
  return parts
    .map((part) => (part.includes("&&") || part.includes("||") || part.includes("?") ? `(${part})` : part))
    .join(" && ");
}

export function buildParameterPassThroughExpression(name: string): string {
  const label = escapeJexlString(String(name ?? "").trim());
  const key = parameterToAttributeKey(name);
  return `(attributes["${label}"] != null ? attributes["${label}"] : (attributes.${key} != null ? attributes.${key} : null))`;
}

export type FuelComputeConfig = {
  enabled?: boolean;
  tankCapacity?: string;
  tankCapacityMax?: string;
  inputField?: string;
  inputMvMin?: string;
  inputMvMax?: string;
  scale?: string;
  outputAttribute?: string;
  calibrationPoints?: Array<{ mv: number; liters: number }>;
};

function wrapAnalogVoltageForMvRange(voltageExpr: string, minMv?: string, maxMv?: string): string {
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
  if (hasMin) return `(${expr} != null ? (${expr} < ${low} ? ${low} : ${expr}) : null)`;
  return `(${expr} != null ? (${expr} > ${high} ? ${high} : ${expr}) : null)`;
}

const FUEL_LEVEL_COMPUTE_DESCRIPTION = "fuel level (computed)";
const FUEL_TANK_COMPUTATION_PARAMETER = "fuel tank computation";

function isFuelTankComputationParameter(name: string): boolean {
  const key = String(name ?? "").trim().toLowerCase();
  if (key === FUEL_TANK_COMPUTATION_PARAMETER) return true;
  return key.includes("fuel tank comput");
}

function isFuelInTankDescription(description: string): boolean {
  return String(description ?? "").trim().toLowerCase().includes("fuel in tank");
}

function isFuelLevelReturnParameter(name: string): boolean {
  const key = String(name ?? "").trim().toLowerCase();
  return key === "fuel level (l)" || key === "fuellevel";
}

function hasFuelComputeFigures(fuel: FuelComputeConfig | undefined): boolean {
  if (!fuel || typeof fuel !== "object") return false;
  return Boolean(
    String(fuel.tankCapacity ?? "").trim() &&
      String(fuel.inputField ?? "").trim() &&
      String(fuel.scale ?? "").trim()
  );
}

function notificationUsesFuelTankComputation(payload: Record<string, unknown>): boolean {
  const description = String(payload.description ?? "").trim().toLowerCase();
  if (description === FUEL_LEVEL_COMPUTE_DESCRIPTION) return true;
  if (isFuelInTankDescription(description)) return true;
  const parameters =
    payload.parameters && typeof payload.parameters === "object"
      ? (payload.parameters as Record<string, unknown>)
      : {};
  const fuelCompute = parameters.fuelCompute;
  if (fuelCompute && typeof fuelCompute === "object" && (fuelCompute as FuelComputeConfig).enabled !== false) {
    return true;
  }
  const returnValue =
    parameters.returnValue && typeof parameters.returnValue === "object"
      ? (parameters.returnValue as Record<string, unknown>)
      : {};
  if (isFuelTankComputationParameter(String(returnValue.param ?? ""))) return true;
  if (hasFuelComputeFigures(parameters.fuelCompute as FuelComputeConfig | undefined)) return true;
  if (isFuelInTankDescription(description) && isFuelLevelReturnParameter(String(returnValue.param ?? ""))) {
    return true;
  }
  const conditions = Array.isArray(parameters.conditions) ? parameters.conditions : [];
  return conditions.some((row) => {
    if (!row || typeof row !== "object") return false;
    return isFuelTankComputationParameter(String((row as NotificationCondition).field ?? ""));
  });
}

const DEFAULT_FUEL_COMPUTE: FuelComputeConfig = {
  enabled: true,
  tankCapacity: "400",
  inputField: "IO6",
  scale: "75",
  outputAttribute: "fuelLevel"
};

function isFuelLevelComputeDescription(description: string): boolean {
  return String(description ?? "").trim().toLowerCase() === FUEL_LEVEL_COMPUTE_DESCRIPTION;
}

export function readFuelComputeConfig(row: {
  description?: string;
  parameters?: {
    fuelCompute?: FuelComputeConfig;
    returnValue?: { param?: string };
    conditions?: NotificationCondition[];
  };
}): FuelComputeConfig | null {
  if (!notificationUsesFuelTankComputation({ description: row.description, parameters: row.parameters } as Record<string, unknown>)) {
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

export function mapInputVoltageFieldToJexl(field: string, catalog?: ParameterCatalogRow[]): string {
  const trimmed = String(field ?? "").trim();
  if (!trimmed) return "";

  const teltonikaExpr = mapTeltonikaAnalogInputFieldToJexlWithFallback(trimmed);
  if (teltonikaExpr) return teltonikaExpr;

  return mapParameterFieldToJexl(trimmed, catalog);
}

export function buildFuelLevelJexlExpression(
  input: FuelComputeConfig,
  catalog?: ParameterCatalogRow[]
): string {
  const inputField = String(input.inputField ?? "").trim();
  if (!inputField) return "null";

  const maxCapacityRaw = String(input.tankCapacityMax ?? input.tankCapacity ?? "").trim();
  const maxCapacity = Number(maxCapacityRaw);
  const maxRaw = String(input.inputMvMax ?? "").trim();
  const minRaw = String(input.inputMvMin ?? "").trim();
  const maxMv = maxRaw === "" ? Number.NaN : Number(maxRaw);
  const minMv = minRaw === "" ? Number.NaN : Number(minRaw);
  const maxVoltage =
    Number.isFinite(maxMv) && maxMv > 0
      ? maxMv
      : Number.isFinite(minMv) && minMv > 0
        ? minMv
        : null;
  const teltonikaIo = mapTeltonikaAnalogInputFieldToJexl(inputField);
  const voltageExpr = teltonikaIo || mapInputVoltageFieldToJexl(inputField, catalog);
  if (!voltageExpr) return "null";
  if (hasUsableFuelCalibration(input.calibrationPoints)) {
    return buildFuelCalibrationJexlExpression(teltonikaIo || voltageExpr, input.calibrationPoints);
  }

  if (!Number.isFinite(maxCapacity) || maxCapacity <= 0 || maxVoltage == null) return "null";

  if (teltonikaIo) {
    return `((${maxCapacity} * ${teltonikaIo}) / ${maxVoltage})`;
  }

  return `(${voltageExpr} != null ? ((${maxCapacity} * ${voltageExpr}) / ${maxVoltage}) : null)`;
}

export function resolveFuelComputeOutputAttribute(row: {
  description?: string;
  parameters?: { fuelCompute?: FuelComputeConfig; returnValue?: { param?: string } };
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

export function buildComputedAttributeExpressionFromLibrary(
  payload: Record<string, unknown>,
  catalog?: ParameterCatalogRow[]
): string {
  const parameters =
    payload.parameters && typeof payload.parameters === "object"
      ? (payload.parameters as Record<string, unknown>)
      : {};
  const row = {
    description: String(payload.description ?? ""),
    type: String(payload.type ?? ""),
    parameters: parameters as {
      conditions?: NotificationCondition[];
      returnValue?: { param?: string; mode?: string };
      fuelCompute?: FuelComputeConfig;
    }
  };

  const fuelCompute = readFuelComputeConfig(row);
  if (fuelCompute) return buildFuelLevelJexlExpression(fuelCompute, catalog);

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
  payload: Record<string, unknown>,
  catalog?: ParameterCatalogRow[]
): string {
  const parameters =
    payload.parameters && typeof payload.parameters === "object"
      ? (payload.parameters as Record<string, unknown>)
      : {};
  const row = {
    description: String(payload.description ?? ""),
    type: String(payload.type ?? ""),
    parameters: parameters as {
      conditions?: NotificationCondition[];
      returnValue?: { param?: string; mode?: string };
      fuelCompute?: FuelComputeConfig;
    }
  };

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
