export type FuelComputeConfig = {
  enabled?: boolean;
  tankCapacity?: string;
  tankCapacityMin?: string;
  tankCapacityMax?: string;
  inputField?: string;
  inputMvMin?: string;
  inputMvMax?: string;
  scale?: string;
  outputAttribute?: string;
  calibrationPoints?: Array<{ mv: number; liters: number }>;
};

export function readFuelComputeConfig(payload: Record<string, unknown>): FuelComputeConfig | null {
  const parameters = payload.parameters && typeof payload.parameters === "object" ? (payload.parameters as Record<string, unknown>) : {};
  const fuel = parameters.fuelCompute;
  if (!fuel || typeof fuel !== "object") return null;
  const config = fuel as FuelComputeConfig;
  if (config.enabled === false) return null;
  if (config.enabled === true) return config;
  if (String(payload.description ?? "").trim().toLowerCase() === "fuel level (computed)") return { enabled: true, ...config };
  return null;
}

export function isFuelComputePayload(payload: Record<string, unknown>): boolean {
  return readFuelComputeConfig(payload) != null;
}

import { mapTeltonikaAnalogInputFieldToJexl, mapTeltonikaAnalogInputFieldToJexlWithFallback } from "./teltonikaAnalogInputs";
import { buildFuelCalibrationJexlExpression, hasUsableFuelCalibration } from "./fuelCalibration";

function mapInputVoltageFieldToJexl(field: string): string {
  const trimmed = String(field ?? "").trim();
  if (!trimmed) return "";
  const teltonikaExpr = mapTeltonikaAnalogInputFieldToJexlWithFallback(trimmed);
  if (teltonikaExpr) return teltonikaExpr;
  const attrKey = trimmed.replace(/[^a-zA-Z0-9]+/g, "_");
  return `(attributes["${trimmed}"] != null ? attributes["${trimmed}"] : attributes.${attrKey})`;
}

/** Prefers Max mV; falls back to Min mV when Max is blank/0. */
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

/**
 * Formula: (Max Capacity × input line voltage) / Max voltage
 */
export function buildFuelLevelJexlExpression(config: FuelComputeConfig): string {
  const inputField = String(config.inputField ?? "").trim();
  if (!inputField) return "null";

  const teltonikaIo = mapTeltonikaAnalogInputFieldToJexl(inputField);
  const voltageExpr = teltonikaIo || mapInputVoltageFieldToJexl(inputField);
  if (!voltageExpr) return "null";

  const io = teltonikaIo || voltageExpr;
  if (hasUsableFuelCalibration(config.calibrationPoints)) {
    return buildFuelCalibrationJexlExpression(io, config.calibrationPoints);
  }

  const maxCapacityRaw = String(config.tankCapacityMax ?? config.tankCapacity ?? "").trim();
  const maxCapacity = Number(maxCapacityRaw);
  const maxVoltage = resolveFuelMaxVoltageMv(config);
  if (!Number.isFinite(maxCapacity) || maxCapacity <= 0 || maxVoltage == null) return "null";

  const proportional = `((${maxCapacity} * ${io}) / ${maxVoltage})`;
  if (teltonikaIo) return proportional;
  return `(${voltageExpr} != null ? ${proportional} : null)`;
}

export function resolveFuelComputeOutputAttribute(payload: Record<string, unknown>): string {
  const config = readFuelComputeConfig(payload);
  const explicit = String(config?.outputAttribute ?? "").trim();
  if (explicit) return explicit.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "fuelLevel";
  const parameters = payload.parameters && typeof payload.parameters === "object" ? (payload.parameters as Record<string, unknown>) : {};
  const returnValue = parameters.returnValue && typeof parameters.returnValue === "object" ? (parameters.returnValue as Record<string, unknown>) : {};
  const returnParam = String(returnValue.param ?? "").trim();
  if (returnParam && returnParam.toLowerCase() !== "no return value") {
    return returnParam.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "fuelLevel";
  }
  return "fuelLevel";
}
