import type { NotificationRow } from "../data/notificationLibrary";
import {
  buildFuelLevelJexlExpression,
  readFuelComputeConfig,
  resolveFuelComputeOutputAttribute,
  resolveFuelMaxVoltageMv,
  type FuelComputeConfig,
  type ParameterCatalogRow
} from "./traccarAttributeMapper";
import { mapTeltonikaAnalogInputFieldToJexl } from "../data/teltonikaAnalogInputs";
import {
  hasUsableFuelCalibration,
  normalizeFuelCalibration,
  peakFuelCalibrationLiters
} from "./fuelCalibration";

export type DeviceBindingLineLike = {
  id?: string;
  line?: string;
  wire?: string;
  connection?: string;
  parameter?: string;
  connected?: boolean;
  /** Teltonika analogue input (IO1–IO15) used as voltage source for fuel formula. */
  analogInput?: string;
  analogMvMin?: string;
  analogMvMax?: string;
  tankCapacityMin?: string;
  tankCapacityMax?: string;
  /** @deprecated Unused by proportional formula; kept for stored bindings. */
  fuelScale?: string;
  /** Optional mV → litres chart. Two or more points replace the straight-line formula. */
  fuelCalibration?: unknown;
};

export type DeviceBindingLike = {
  id?: string;
  name?: string;
  lines?: DeviceBindingLineLike[];
};

const FUEL_LINE_IDS = ["fuel", "f1i3", "f2i4"] as const;

const isLineConnected = (line: DeviceBindingLineLike | null | undefined): boolean => {
  if (!line) return false;
  if (line.connected === true) return true;
  const connection = String(line.connection ?? "").trim().toLowerCase();
  if (!connection) return false;
  if (connection === "no" || connection === "not connected" || connection === "false") return false;
  return connection === "yes" || connection === "connected" || connection.startsWith("connected");
};

const lineHasFuelChart = (line: DeviceBindingLineLike | null | undefined): boolean =>
  hasUsableFuelCalibration(line?.fuelCalibration);

const lineHasFuelCapacity = (line: DeviceBindingLineLike | null | undefined): boolean =>
  Number(String(line?.tankCapacityMax ?? "").trim()) > 0;

/** Settings stored on the notification (tank, output) — not the input line. */
export function readFuelComputeSettingsFromNotification(
  row: Pick<NotificationRow, "description" | "parameters">
): Omit<FuelComputeConfig, "inputField"> | null {
  const fuel = readFuelComputeConfig(row);
  if (!fuel) return null;
  const { inputField: _input, ...settings } = fuel;
  return settings;
}

export function resolveAnalogInputFromDeviceLine(line: DeviceBindingLineLike): string {
  const analog = String(line.analogInput ?? "").trim();
  if (analog && mapTeltonikaAnalogInputFieldToJexl(analog)) return analog;

  const parameter = String(line.parameter ?? "").trim();
  if (parameter && mapTeltonikaAnalogInputFieldToJexl(parameter)) return parameter;

  return "";
}

/**
 * Resolve which device input line supplies the fuel voltage reading.
 * Priority: Fuel → I3/F1 → I4/F2, then any connected analogue line that has a
 * calibration chart or tank capacity (so IO6 on the visible Bindings row is used).
 */
export function resolveFuelAnalogLineFromDeviceBinding(
  binding?: DeviceBindingLike | null
): DeviceBindingLineLike | null {
  const lines = Array.isArray(binding?.lines) ? binding!.lines! : [];
  const usable = (line: DeviceBindingLineLike | undefined | null) =>
    Boolean(line && isLineConnected(line) && resolveAnalogInputFromDeviceLine(line));

  for (const lineId of FUEL_LINE_IDS) {
    const line = lines.find((row) => String(row.id ?? "").trim().toLowerCase() === lineId);
    if (usable(line) && (lineHasFuelChart(line) || lineHasFuelCapacity(line) || lineId === "fuel")) {
      return line!;
    }
  }
  for (const lineId of FUEL_LINE_IDS) {
    const line = lines.find((row) => String(row.id ?? "").trim().toLowerCase() === lineId);
    if (usable(line)) return line!;
  }
  const withChart = lines.find((line) => usable(line) && lineHasFuelChart(line));
  if (withChart) return withChart;
  const withCapacity = lines.find((line) => usable(line) && lineHasFuelCapacity(line));
  if (withCapacity) return withCapacity;
  return lines.find((line) => usable(line)) ?? null;
}

export function resolveFuelInputFromDeviceBinding(binding?: DeviceBindingLike | null): string {
  const line = resolveFuelAnalogLineFromDeviceBinding(binding);
  return line ? resolveAnalogInputFromDeviceLine(line) : "";
}

export function readFuelAnalogMvRangeFromLine(line?: DeviceBindingLineLike | null): {
  minMv: string;
  maxMv: string;
} {
  return {
    minMv: String(line?.analogMvMin ?? "").trim(),
    maxMv: String(line?.analogMvMax ?? "").trim()
  };
}

export function readFuelTankCapacityRangeFromLine(line?: DeviceBindingLineLike | null): {
  minCapacity: string;
  maxCapacity: string;
} {
  return {
    minCapacity: String(line?.tankCapacityMin ?? "").trim(),
    maxCapacity: String(line?.tankCapacityMax ?? "").trim()
  };
}

export function readFuelScaleFromLine(line?: DeviceBindingLineLike | null): string {
  return String(line?.fuelScale ?? "").trim();
}

export function resolveFuelInputLineLabel(binding?: DeviceBindingLike | null): string {
  const lines = Array.isArray(binding?.lines) ? binding!.lines! : [];
  for (const lineId of FUEL_LINE_IDS) {
    const line = lines.find((row) => String(row.id ?? "") === lineId);
    if (!line || !line.connected) continue;
    if (resolveAnalogInputFromDeviceLine(line)) {
      return String(line.line ?? lineId).trim() || lineId;
    }
  }
  return "";
}

/** Build fuel compute config directly from a connected device fuel line (no notification row required). */
export function buildFuelComputeConfigFromDeviceLine(
  line: DeviceBindingLineLike | null | undefined
): FuelComputeConfig | null {
  if (!line) return null;
  const inputField = resolveAnalogInputFromDeviceLine(line);
  const { minCapacity, maxCapacity } = readFuelTankCapacityRangeFromLine(line);
  const { minMv, maxMv } = readFuelAnalogMvRangeFromLine(line);
  const calibrationPoints = normalizeFuelCalibration(line.fuelCalibration);
  const chartReady = hasUsableFuelCalibration(calibrationPoints);
  const chartCapacity = peakFuelCalibrationLiters(calibrationPoints);
  const resolvedCapacity =
    maxCapacity || (typeof chartCapacity === "number" && chartCapacity > 0 ? String(chartCapacity) : "");
  if (!inputField || !resolvedCapacity) return null;
  const maxVoltage = resolveFuelMaxVoltageMv({ inputMvMin: minMv, inputMvMax: maxMv });
  if (maxVoltage == null && !chartReady) return null;

  return {
    enabled: true,
    inputField,
    tankCapacity: resolvedCapacity,
    tankCapacityMax: resolvedCapacity,
    outputAttribute: "fuelLevel",
    ...(minMv !== "" ? { inputMvMin: minMv } : {}),
    ...(maxMv !== "" ? { inputMvMax: maxMv } : {}),
    ...(minCapacity ? { tankCapacityMin: minCapacity } : {}),
    ...(chartReady ? { calibrationPoints } : {})
  };
}

/** Merge notification fuel settings with the analogue input from the device binding. */
export function buildMergedFuelComputeConfig(
  notification: Pick<NotificationRow, "description" | "parameters">,
  deviceBinding?: DeviceBindingLike | null
): FuelComputeConfig | null {
  const settings = readFuelComputeSettingsFromNotification(notification);
  if (!settings) return null;

  const line = resolveFuelAnalogLineFromDeviceBinding(deviceBinding);
  const fromLine = buildFuelComputeConfigFromDeviceLine(line);
  if (!fromLine) return null;

  const notificationCapacity = String(settings.tankCapacity ?? "").trim();
  const resolvedCapacity = fromLine.tankCapacityMax || notificationCapacity;
  if (!resolvedCapacity) return null;

  const maxVoltage = resolveFuelMaxVoltageMv({
    inputMvMin: fromLine.inputMvMin,
    inputMvMax: fromLine.inputMvMax
  });
  if (maxVoltage == null && !hasUsableFuelCalibration(fromLine.calibrationPoints)) return null;

  return {
    ...settings,
    ...fromLine,
    enabled: true,
    tankCapacity: resolvedCapacity,
    tankCapacityMax: resolvedCapacity,
    outputAttribute: String(settings.outputAttribute ?? fromLine.outputAttribute ?? "fuelLevel").trim() || "fuelLevel"
  };
}

export function buildFuelComputeExpressionFromDevice(
  notification: Pick<NotificationRow, "description" | "parameters">,
  deviceBinding?: DeviceBindingLike | null,
  catalog?: ParameterCatalogRow[]
): string | null {
  const merged = buildMergedFuelComputeConfig(notification, deviceBinding);
  if (!merged) return null;
  const expression = buildFuelLevelJexlExpression(merged, catalog);
  return expression && expression !== "null" ? expression : null;
}

export function buildFuelComputeOutputKey(
  notification: Pick<NotificationRow, "description" | "parameters">
): string {
  return resolveFuelComputeOutputAttribute(notification);
}

export function fuelComputeReadyFromDevice(
  notification: Pick<NotificationRow, "description" | "parameters">,
  deviceBinding?: DeviceBindingLike | null
): boolean {
  const merged = buildMergedFuelComputeConfig(notification, deviceBinding);
  if (!merged) return false;
  const maxCapacity = Number(String(merged.tankCapacityMax ?? merged.tankCapacity ?? "").trim());
  const maxVoltage = resolveFuelMaxVoltageMv(merged);
  if (hasUsableFuelCalibration(merged.calibrationPoints)) {
    return Number.isFinite(maxCapacity) && maxCapacity > 0;
  }
  return Number.isFinite(maxCapacity) && maxCapacity > 0 && maxVoltage != null;
}

export function describeMissingFuelComputePrerequisites(
  notification: Pick<NotificationRow, "description" | "parameters">,
  deviceBinding?: DeviceBindingLike | null
): string | null {
  if (!readFuelComputeSettingsFromNotification(notification)) return null;
  const input = resolveFuelInputFromDeviceBinding(deviceBinding);
  if (!input) {
    const lines = (deviceBinding?.lines ?? []).filter((row) =>
      FUEL_LINE_IDS.includes(String(row.id ?? "") as (typeof FUEL_LINE_IDS)[number])
    );
    const connected = lines.filter((row) => row.connected);
    if (!connected.length) {
      return "Connect the Fuel, I3/F1, or I4/F2 line on the mobile device binding and assign an analogue input (IO1–IO15).";
    }
    return "Assign an analogue input (IO1–IO15) on the Fuel, I3/F1, or I4/F2 line in the mobile device binding.";
  }
  const line = resolveFuelAnalogLineFromDeviceBinding(deviceBinding);
  const { maxCapacity } = readFuelTankCapacityRangeFromLine(line);
  const { minMv, maxMv } = readFuelAnalogMvRangeFromLine(line);
  const settings = readFuelComputeSettingsFromNotification(notification);
  const effectiveMax = maxCapacity || String(settings?.tankCapacity ?? "").trim();
  const maxVoltage = resolveFuelMaxVoltageMv({ inputMvMin: minMv, inputMvMax: maxMv });
  const chartReady = hasUsableFuelCalibration(line?.fuelCalibration);
  if (!effectiveMax && !chartReady) {
    return "Set Max capacity (L) on the Fuel line in the mobile device binding (or tank capacity in the notification library).";
  }
  if (maxVoltage == null && !chartReady) {
    return "Set Max mV (or Min mV) on the Fuel line so Max voltage is available for (Max Capacity × voltage) / Max voltage.";
  }
  return null;
}
