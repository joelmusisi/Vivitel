import type { TraccarRoutePoint } from "./api";
import {
  MOTION_FUEL_IGNORE_MIN_L,
  MOTION_FUEL_IGNORE_WINDOW_MS,
  FUEL_REFILL_MIN_DURATION_MS,
  stabilizeFuelTrend,
  type FuelChangePoint,
  type FuelTrendPoint
} from "./fuelTrendStabilizer";
import { mapTeltonikaAnalogInputFieldToJexl } from "../data/teltonikaAnalogInputs";
import { TraccarPositionAttr } from "./traccarPositionKeys";
import {
  TELTONIKA_AVL_IO,
  TELTONIKA_NON_FUEL_IO_ATTRS,
  readTeltonikaIgnition,
  readTeltonikaIoNumber,
  readTeltonikaMotion
} from "./teltonikaProtocol";
import {
  hasUsableFuelCalibration,
  interpolateFuelLitersFromCalibration,
  normalizeFuelCalibration,
  peakFuelCalibrationLiters,
  peakFuelCalibrationMv,
  type FuelCalibrationPoint
} from "./fuelCalibration";
import {
  buildFuelComputeConfigFromDeviceLine,
  resolveFuelAnalogLineFromDeviceBinding,
  type DeviceBindingLike
} from "./fuelComputeFromDevice";

export type { FuelTrendPoint };

export const parseFuelNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const cleaned = raw.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const formatFuelLiters = (liters: number | undefined): string => {
  if (typeof liters !== "number" || !Number.isFinite(liters) || liters < 0) return "";
  return liters.toFixed(2);
};

/** Device-side fuel formula metadata (from Traccar device attributes / live API). */
export type DeviceFuelConfig = {
  analogInput: string;
  tankCapacity: number;
  /** Max voltage (mV) denominator for (capacity × voltage) / maxVoltage. */
  maxVoltage: number;
  inputMvMin?: number;
  inputMvMax?: number;
  tankCapacityMin?: number;
  calibrationPoints?: FuelCalibrationPoint[];
};

export const readDeviceFuelConfig = (
  source: Record<string, unknown> | null | undefined
): DeviceFuelConfig | null => {
  if (!source || typeof source !== "object") return null;
  const analogInput = String(
    source.analogInput ?? source.viviFuelAnalogInput ?? ""
  ).trim();
  const tankCapacity = parseFuelNumber(
    source.tankCapacity ?? source.viviFuelTankCapacityMax ?? source.viviFuelTankCapacity
  );
  if (!analogInput) return null;

  const inputMvMin = parseFuelNumber(source.analogMvMin ?? source.viviFuelAnalogMvMin ?? source.inputMvMin);
  const inputMvMax = parseFuelNumber(source.analogMvMax ?? source.viviFuelAnalogMvMax ?? source.inputMvMax);
  const tankCapacityMin = parseFuelNumber(
    source.tankCapacityMin ?? source.viviFuelTankCapacityMin
  );
  const calibrationPoints = normalizeFuelCalibration(
    source.calibrationPoints ?? source.viviFuelCalibration ?? source.fuelCalibration
  );
  const chartReady = hasUsableFuelCalibration(calibrationPoints);
  const chartCapacity = peakFuelCalibrationLiters(calibrationPoints);
  const resolvedCapacity =
    typeof tankCapacity === "number" && tankCapacity > 0
      ? tankCapacity
      : chartCapacity;
  if (!analogInput || typeof resolvedCapacity !== "number" || resolvedCapacity <= 0) return null;

  const maxVoltageCandidates = [inputMvMax, inputMvMin, peakFuelCalibrationMv(calibrationPoints)].filter(
    (value): value is number => typeof value === "number" && value > 0
  );
  const maxVoltage = maxVoltageCandidates.length
    ? (typeof inputMvMax === "number" && inputMvMax > 0 ? inputMvMax : Math.max(...maxVoltageCandidates))
    : undefined;
  if ((typeof maxVoltage !== "number" || !Number.isFinite(maxVoltage) || maxVoltage <= 0) && !chartReady) {
    return null;
  }

  return {
    analogInput,
    tankCapacity: resolvedCapacity,
    maxVoltage: typeof maxVoltage === "number" && maxVoltage > 0 ? maxVoltage : resolvedCapacity,
    ...(typeof inputMvMin === "number" ? { inputMvMin } : {}),
    ...(typeof inputMvMax === "number" ? { inputMvMax } : {}),
    ...(typeof tankCapacityMin === "number" ? { tankCapacityMin } : {}),
    ...(chartReady ? { calibrationPoints } : {})
  };
};

/** Use the mobile-device binding chart when Traccar device attributes have none. */
export const readDeviceFuelConfigFromBinding = (
  binding: DeviceBindingLike | null | undefined
): DeviceFuelConfig | null => {
  const line = resolveFuelAnalogLineFromDeviceBinding(binding);
  const compute = buildFuelComputeConfigFromDeviceLine(line);
  if (!compute) return null;
  return readDeviceFuelConfig({
    analogInput: compute.inputField,
    tankCapacity: compute.tankCapacity,
    analogMvMin: compute.inputMvMin,
    analogMvMax: compute.inputMvMax,
    tankCapacityMin: compute.tankCapacityMin,
    calibrationPoints: compute.calibrationPoints
  });
};

const readAnalogMillivolts = (
  attributes: Record<string, unknown>,
  analogInput: string
): number | undefined => {
  const ioKey = mapTeltonikaAnalogInputFieldToJexl(analogInput);
  if (!ioKey) return undefined;
  const channel = ioKey.replace(/^io/i, "");
  const channelNum = Number(channel);
  const candidates: unknown[] = [
    attributes[ioKey],
    attributes[`io_${channel}`],
    attributes[`IO${channel}`],
    attributes[`IO_${channel}`],
    attributes[`io ${channel}`],
    // Promoted from Teltonika AVL decode (AIN1→adc1, AIN2→adc2).
    channelNum === TELTONIKA_AVL_IO.ANALOG_INPUT_1 || channel === "1" ? attributes.adc1 : undefined,
    channelNum === TELTONIKA_AVL_IO.ANALOG_INPUT_2 || channel === "2" || channel === "6"
      ? attributes.adc2
      : undefined
  ];
  // Prefer explicit AVL analogue IDs when the binding says IO6 / IO9.
  if (channelNum === 6 || analogInput.toUpperCase() === "IO6") {
    candidates.unshift(readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.ANALOG_INPUT_2));
  }
  if (channelNum === 9 || analogInput.toUpperCase() === "IO9" || analogInput.toUpperCase() === "IO1") {
    candidates.unshift(readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.ANALOG_INPUT_1));
  }
  const nestedIo = attributes.io;
  if (nestedIo && typeof nestedIo === "object") {
    const io = nestedIo as Record<string, unknown>;
    candidates.push(io[ioKey], io[channel], io[`IO${channel}`]);
  }
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const mv = parseFuelNumber(candidate);
    // Analogue fuel senders are millivolts — reject boolean-like 0/1 unless explicitly 0 empty tank.
    if (typeof mv === "number" && (mv === 0 || mv >= 10)) return mv;
  }
  return undefined;
};

/** Convert raw analogue mV to litres using (Max Capacity × voltage) / Max voltage. */
export const computeFuelLitersFromAnalog = (
  attributes: Record<string, unknown> | null | undefined,
  config: DeviceFuelConfig | null | undefined
): number | undefined => {
  if (!attributes || !config) return undefined;
  let mv = readAnalogMillivolts(attributes, config.analogInput);
  if (typeof mv !== "number") return undefined;

  if (hasUsableFuelCalibration(config.calibrationPoints)) {
    const liters = interpolateFuelLitersFromCalibration(mv, config.calibrationPoints);
    if (typeof liters !== "number" || !Number.isFinite(liters)) return undefined;
    return Math.max(0, Math.min(config.tankCapacity, liters));
  }

  const maxVoltage = config.maxVoltage;
  if (!(maxVoltage > 0)) return undefined;

  const hasDistinctMax =
    typeof config.inputMvMax === "number" && config.inputMvMax > 0;
  // Only treat Min mV as a lower clamp when Max mV is also a real upper endpoint.
  if (
    hasDistinctMax
    && typeof config.inputMvMin === "number"
    && config.inputMvMin >= 0
    && config.inputMvMin < config.inputMvMax!
  ) {
    mv = Math.max(mv, config.inputMvMin);
  }
  if (hasDistinctMax) {
    mv = Math.min(mv, config.inputMvMax!);
  }
  mv = Math.max(0, Math.min(maxVoltage, mv));

  const liters = (config.tankCapacity * mv) / maxVoltage;
  if (!Number.isFinite(liters)) return undefined;
  return Math.max(0, Math.min(config.tankCapacity, liters));
};

/**
 * Interpret a numeric fuel candidate as tank litres.
 * - Traccar KEY_FUEL (`fuel`) is litres.
 * - KEY_FUEL_LEVEL (`fuelLevel`) may be litres (Vivi computed) or 0–100%.
 * - Never treat ignition/motion IO (239/240) as fuel.
 */
export const interpretFuelLitersCandidate = (
  value: unknown,
  options?: { tankCapacity?: number; preferPercent?: boolean; sourceKey?: string }
): number | undefined => {
  const litersOrPct = parseFuelNumber(value);
  if (typeof litersOrPct !== "number" || litersOrPct < 0) return undefined;

  const key = String(options?.sourceKey ?? "").trim().toLowerCase();
  if (key && TELTONIKA_NON_FUEL_IO_ATTRS.has(key)) return undefined;
  if (key === `io${TELTONIKA_AVL_IO.IGNITION}` || key === `io${TELTONIKA_AVL_IO.MOVEMENT}`) {
    return undefined;
  }

  const tankCapacity =
    typeof options?.tankCapacity === "number" && options.tankCapacity > 0
      ? options.tankCapacity
      : undefined;

  // Explicit percent sources (AVL io48 / fuelLevel when flagged).
  if (options?.preferPercent && tankCapacity && litersOrPct <= 100) {
    return Math.max(0, Math.min(tankCapacity, (litersOrPct / 100) * tankCapacity));
  }

  // AVL property 48 is documented as fuel level percentage on many FMx devices.
  if (key === `io${TELTONIKA_AVL_IO.FUEL_LEVEL_PERCENT}` && tankCapacity && litersOrPct <= 100) {
    return Math.max(0, Math.min(tankCapacity, (litersOrPct / 100) * tankCapacity));
  }

  // Values above 100 cannot be percent — treat as litres.
  if (litersOrPct > 100) return litersOrPct;

  // 0–100: Vivi computed fuelLevel is litres; only convert when source is clearly percent.
  if (key === "fuellevel" || key === TraccarPositionAttr.FUEL_LEVEL) {
    // Prefer litres: app writes computed tank litres into fuelLevel.
    return litersOrPct;
  }

  return litersOrPct;
};

const collectFuelCandidates = (
  attributes: Record<string, unknown>,
  extras: Record<string, unknown> = {}
): Array<{ value: unknown; key: string; preferPercent?: boolean }> => {
  const io = (attributes.io ?? attributes.IO ?? extras.io ?? {}) as Record<string, unknown>;
  const io48 = readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.FUEL_LEVEL_PERCENT);
  const namedFuelCandidates = Object.entries(attributes)
    .filter(([key]) => /fuel/i.test(key))
    .map(([key, value]) => ({ value, key }));
  const namedIoFuelCandidates = Object.entries(io)
    .filter(([key]) => /fuel/i.test(key))
    .map(([key, value]) => ({ value, key: `io.${key}` }));

  return [
    { value: extras.fuelReading, key: "fuelReading" },
    { value: extras.fuel, key: TraccarPositionAttr.FUEL },
    { value: attributes[TraccarPositionAttr.FUEL], key: TraccarPositionAttr.FUEL },
    { value: attributes.Fuel, key: "Fuel" },
    { value: attributes["fuel (l)"], key: "fuel (l)" },
    { value: attributes["Fuel (L)"], key: "Fuel (L)" },
    // Computed / litres output (Vivi default outputAttribute).
    { value: extras.fuelLevel, key: TraccarPositionAttr.FUEL_LEVEL },
    { value: attributes[TraccarPositionAttr.FUEL_LEVEL], key: TraccarPositionAttr.FUEL_LEVEL },
    { value: attributes.fuellevel, key: "fuellevel" },
    { value: attributes.fuelLevel, key: "fuelLevel" },
    { value: attributes.fuel_level, key: "fuel_level" },
    { value: attributes.fuelLiters, key: "fuelLiters" },
    { value: attributes.fuelLitres, key: "fuelLitres" },
    { value: attributes["Fuel Level"], key: "Fuel Level" },
    { value: attributes["Fuel level"], key: "Fuel level" },
    { value: attributes.fuel1, key: "fuel1" },
    { value: attributes.fuel2, key: "fuel2" },
    { value: attributes.canFuel, key: "canFuel" },
    { value: attributes.totalFuel, key: "totalFuel" },
    // Teltonika AVL fuel level % (property 48) — convert when tank capacity known.
    { value: io48, key: `io${TELTONIKA_AVL_IO.FUEL_LEVEL_PERCENT}`, preferPercent: true },
    { value: io.fuel, key: "io.fuel" },
    { value: io.Fuel, key: "io.Fuel" },
    { value: io["Fuel (L)"], key: "io.Fuel (L)" },
    { value: io.fuelLevel, key: "io.fuelLevel" },
    ...namedFuelCandidates,
    ...namedIoFuelCandidates
    // Intentionally omit io239 / io240 — those are ignition / motion, not fuel.
  ];
};

const isComputedFuelAttributeKey = (key: string): boolean => {
  const normalized = String(key ?? "").trim().toLowerCase();
  return (
    normalized === "fuel"
    || normalized === TraccarPositionAttr.FUEL.toLowerCase()
    || normalized === "fuellevel"
    || normalized === TraccarPositionAttr.FUEL_LEVEL.toLowerCase()
    || normalized === "fuel_level"
    || normalized === "fuelreading"
  );
};

export const extractFuelLitersFromAttributes = (
  attributes: Record<string, unknown> | null | undefined,
  extras: Record<string, unknown> = {},
  fuelConfig?: DeviceFuelConfig | null
): number | undefined => {
  const attrs = attributes && typeof attributes === "object" ? attributes : {};
  const config = fuelConfig ?? readDeviceFuelConfig(extras);
  const tankCapacity = config?.tankCapacity;
  const fromAnalog = computeFuelLitersFromAnalog(attrs, config);

  // Calibration chart is the source of truth whenever the sender mV is present.
  if (hasUsableFuelCalibration(config?.calibrationPoints)) {
    if (typeof fromAnalog === "number" && fromAnalog >= 0) return fromAnalog;
  }

  for (const candidate of collectFuelCandidates(attrs, extras)) {
    const liters = interpretFuelLitersCandidate(candidate.value, {
      tankCapacity,
      preferPercent: candidate.preferPercent,
      sourceKey: candidate.key
    });
    if (typeof liters !== "number" || liters < 0) continue;

    // Traccar computed fuel/fuelLevel often stores 0 when the analogue sender
    // dropped out or the expression failed. Prefer a live mV→litres reading.
    if (
      liters === 0
      && isComputedFuelAttributeKey(candidate.key)
      && typeof fromAnalog === "number"
      && fromAnalog > 0
    ) {
      return fromAnalog;
    }
    // Skip the zero sentinel so we do not plot a flat empty tank when IO is missing.
    if (liters === 0 && isComputedFuelAttributeKey(candidate.key) && config?.analogInput) {
      continue;
    }

    return liters;
  }
  return typeof fromAnalog === "number" && fromAnalog >= 0 ? fromAnalog : undefined;
};

export const extractFuelLitersFromPayload = (payload: any): number | undefined => {
  if (!payload || typeof payload !== "object") return undefined;

  const position = payload?.position ?? payload?.data?.position ?? null;
  const positionAttributes =
    position && typeof position === "object" && position.attributes && typeof position.attributes === "object"
      ? (position.attributes as Record<string, unknown>)
      : undefined;

  const nestedAttributes =
    payload?.attributes && typeof payload.attributes === "object"
      ? (payload.attributes as Record<string, unknown>)
      : undefined;

  const telemetryLatest = payload?.telemetryLatest ?? payload?.data?.telemetryLatest ?? null;
  const telemetryAttributes =
    telemetryLatest?.attributes && typeof telemetryLatest.attributes === "object"
      ? (telemetryLatest.attributes as Record<string, unknown>)
      : undefined;

  const telemetryIo =
    telemetryLatest?.io && typeof telemetryLatest.io === "object"
      ? (telemetryLatest.io as Record<string, unknown>)
      : undefined;

  const dataIo =
    payload?.data?.io && typeof payload.data.io === "object"
      ? (payload.data.io as Record<string, unknown>)
      : undefined;

  const fuelConfig =
    readDeviceFuelConfig(payload?.fuelConfig)
    ?? readDeviceFuelConfig(payload?.deviceAttributes)
    ?? readDeviceFuelConfig(payload?.attributes);
  const tankCapacity = fuelConfig?.tankCapacity;

  if (hasUsableFuelCalibration(fuelConfig?.calibrationPoints)) {
    const fromChart =
      computeFuelLitersFromAnalog(positionAttributes, fuelConfig)
      ?? computeFuelLitersFromAnalog(nestedAttributes, fuelConfig)
      ?? computeFuelLitersFromAnalog(telemetryAttributes, fuelConfig);
    if (typeof fromChart === "number" && fromChart >= 0) return fromChart;
  }

  const structured: Array<{ value: unknown; key: string; preferPercent?: boolean }> = [
    ...collectFuelCandidates(positionAttributes ?? {}, {
      fuelReading: payload?.fuelReading,
      fuel: payload?.fuel ?? position?.fuel,
      fuelLevel: payload?.fuelLevel ?? position?.fuelLevel
    }),
    ...collectFuelCandidates(nestedAttributes ?? {}, {}),
    ...collectFuelCandidates(telemetryAttributes ?? {}, {
      fuelReading: telemetryLatest?.fuelReading,
      fuel: telemetryLatest?.fuel,
      fuelLevel: telemetryLatest?.fuelLevel,
      io: telemetryIo
    }),
    ...collectFuelCandidates({}, { io: dataIo }),
    { value: payload?.data?.fuelReading, key: "fuelReading" },
    { value: payload?.data?.fuel, key: TraccarPositionAttr.FUEL },
    { value: payload?.fuelReading, key: "fuelReading" },
    { value: payload?.fuel, key: TraccarPositionAttr.FUEL },
    { value: payload?.fuelLevel, key: TraccarPositionAttr.FUEL_LEVEL },
    { value: payload?.fuelLiters, key: "fuelLiters" },
    { value: payload?.fuelLitres, key: "fuelLitres" },
    { value: telemetryLatest?.fuelReading, key: "fuelReading" },
    { value: telemetryLatest?.fuel, key: TraccarPositionAttr.FUEL },
    { value: telemetryLatest?.fuelLevel, key: TraccarPositionAttr.FUEL_LEVEL },
    { value: telemetryIo?.Fuel, key: "Fuel" },
    { value: telemetryIo?.["Fuel"], key: "Fuel" },
    { value: telemetryIo?.["Fuel (L)"], key: "Fuel (L)" },
    { value: dataIo?.Fuel, key: "Fuel" },
    { value: dataIo?.["Fuel"], key: "Fuel" },
    { value: dataIo?.["Fuel (L)"], key: "Fuel (L)" }
  ];

  for (const candidate of structured) {
    const liters = interpretFuelLitersCandidate(candidate.value, {
      tankCapacity,
      preferPercent: candidate.preferPercent,
      sourceKey: candidate.key
    });
    if (typeof liters === "number" && liters >= 0) return liters;
  }

  return (
    computeFuelLitersFromAnalog(positionAttributes, fuelConfig)
    ?? computeFuelLitersFromAnalog(nestedAttributes, fuelConfig)
    ?? computeFuelLitersFromAnalog(telemetryAttributes, fuelConfig)
  );
};

export const extractFuelReading = (payload: any): string => {
  return formatFuelLiters(extractFuelLitersFromPayload(payload));
};

export const extractIgnitionFromPayload = (payload: unknown): boolean | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const nested = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : null;
  const attributes = record.attributes && typeof record.attributes === "object"
    ? (record.attributes as Record<string, unknown>)
    : null;
  const nestedAttributes = nested?.attributes && typeof nested.attributes === "object"
    ? (nested.attributes as Record<string, unknown>)
    : null;
  const telemetryLatest = (record.telemetryLatest ?? nested?.telemetryLatest) as Record<string, unknown> | undefined;
  const telemetryAttributes = telemetryLatest?.attributes && typeof telemetryLatest.attributes === "object"
    ? (telemetryLatest.attributes as Record<string, unknown>)
    : null;
  const sources = [record, nested, attributes, nestedAttributes, telemetryLatest, telemetryAttributes];
  for (const source of sources) {
    if (!source) continue;
    const ignition = readTeltonikaIgnition(source);
    if (typeof ignition === "boolean") return ignition;
  }
  return null;
};

/** Millivolts on the analogue input configured for this asset's fuel sender. */
export const readFuelInputMillivolts = (
  attributes: Record<string, unknown> | null | undefined,
  analogInput: string | null | undefined
): number | undefined => {
  const input = String(analogInput ?? "").trim();
  if (!attributes || !input) return undefined;
  return readAnalogMillivolts(attributes, input);
};

export const extractFuelAnalogMillivoltsFromRoutePoint = (
  point: TraccarRoutePoint,
  fuelConfig?: DeviceFuelConfig | null
): number | undefined => readFuelInputMillivolts((point.attributes ?? {}) as Record<string, unknown>, fuelConfig?.analogInput);

const POWER_CUTOFF_VOLTS = 10;

/** Ignition off or external supply below ~10 V — sender readings are not trusted. */
export const isRoutePointPowerCutoff = (point: TraccarRoutePoint | null | undefined): boolean => {
  if (!point) return false;
  const ignition = readRoutePointIgnition(point);
  if (ignition === false) return true;
  const attrs = (point.attributes ?? {}) as Record<string, unknown>;
  const raw =
    readTeltonikaIoNumber(attrs, TELTONIKA_AVL_IO.EXTERNAL_VOLTAGE)
    ?? parseFuelNumber(attrs.power)
    ?? parseFuelNumber(attrs.externalPower)
    ?? parseFuelNumber(attrs.powerVoltage);
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return false;
  const volts = raw > 100 ? raw / 1000 : raw;
  return volts < POWER_CUTOFF_VOLTS;
};

export const extractFuelLitersFromRoutePoint = (
  point: TraccarRoutePoint,
  fuelConfig?: DeviceFuelConfig | null
): number | undefined => {
  const attributes = (point.attributes ?? {}) as Record<string, unknown>;
  return extractFuelLitersFromAttributes(
    attributes,
    {
      fuel: (point as unknown as Record<string, unknown>).fuel,
      fuelLevel: (point as unknown as Record<string, unknown>).fuelLevel
    },
    fuelConfig
  );
};

/** Litres for the current fix, using the device-binding calibration chart. */
export const formatFuelReadingFromBinding = (
  attributes: Record<string, unknown> | null | undefined,
  fuelConfig: DeviceFuelConfig | null | undefined
): string => {
  if (!attributes || !fuelConfig || !hasUsableFuelCalibration(fuelConfig.calibrationPoints)) return "";
  return formatFuelLiters(extractFuelLitersFromAttributes(attributes, {}, fuelConfig));
};

export const extractFuelLitersFromTraccarLivePosition = (
  position: { attributes?: Record<string, unknown> } | null | undefined,
  fuelConfig?: DeviceFuelConfig | null
): number | undefined => {
  if (!position || typeof position !== "object") return undefined;
  return extractFuelLitersFromAttributes(position.attributes ?? {}, {}, fuelConfig);
};

export const parseRoutePointTimestampMs = (point: TraccarRoutePoint): number => {
  for (const candidate of [point.fixTime, point.deviceTime, point.serverTime]) {
    const ts = Date.parse(String(candidate ?? ""));
    if (Number.isFinite(ts)) return ts;
  }
  return Number.NaN;
};

/** Keep the fuel graph responsive — dense Teltonika routes can be tens of thousands of points. */
export const thinRoutePointsForFuel = (
  points: TraccarRoutePoint[],
  maxPoints = 2_500
): TraccarRoutePoint[] => {
  if (!Array.isArray(points) || points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const thinned: TraccarRoutePoint[] = [];
  for (let index = 0; index < points.length; index += step) {
    thinned.push(points[index]);
  }
  const last = points[points.length - 1];
  if (thinned[thinned.length - 1] !== last) thinned.push(last);
  return thinned;
};

export const buildFuelTrendFromRoute = (
  points: TraccarRoutePoint[],
  fuelConfig?: DeviceFuelConfig | null
): FuelTrendPoint[] => {
  const trend: FuelTrendPoint[] = [];
  for (const point of thinRoutePointsForFuel(points)) {
    const atMs = parseRoutePointTimestampMs(point);
    if (!Number.isFinite(atMs)) continue;
    const ignition = readRoutePointIgnition(point);
    // Ignition-off / power-cut samples collapse the sender to ~0 mV and must not
    // enter the fuel line — they produce false empty-tank zeros.
    if (ignition === false || isRoutePointPowerCutoff(point)) continue;
    const liters = extractFuelLitersFromRoutePoint(point, fuelConfig);
    if (typeof liters !== "number" || liters < 0) continue;
    const millivolts = extractFuelAnalogMillivoltsFromRoutePoint(point, fuelConfig);
    const moving = isRoutePointMoving(point);
    trend.push({
      atMs,
      liters,
      moving,
      powerCutoff: false,
      ...(ignition === null ? {} : { ignition }),
      ...(typeof millivolts === "number" ? { millivolts } : {})
    });
  }
  trend.sort((a, b) => a.atMs - b.atMs);
  return trend;
};

/** Nearest route position for a chart timestamp (used for refuel/drop location labels). */
export const nearestRoutePointAt = (
  points: TraccarRoutePoint[],
  atMs: number
): TraccarRoutePoint | null => {
  if (!Array.isArray(points) || points.length === 0 || !Number.isFinite(atMs)) return null;
  let best: TraccarRoutePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const ts = parseRoutePointTimestampMs(point);
    if (!Number.isFinite(ts)) continue;
    const distance = Math.abs(ts - atMs);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best;
};

/** Speed above ~1 knot (~1.85 km/h) or Traccar motion flag = moving / in trip. */
const STATIONARY_MAX_SPEED_KNOTS = 1;

export const readRoutePointIgnition = (point: TraccarRoutePoint | null | undefined): boolean | null => {
  if (!point) return null;
  const attrs = (point.attributes ?? {}) as Record<string, unknown>;
  const ignition = readTeltonikaIgnition(attrs);
  return typeof ignition === "boolean" ? ignition : null;
};

export const isRoutePointMoving = (point: TraccarRoutePoint | null | undefined): boolean => {
  if (!point) return false;
  const attrs = (point.attributes ?? {}) as Record<string, unknown>;
  const motion = readTeltonikaMotion(attrs);
  if (motion === true) return true;
  if (motion === false) {
    const speedStill = Number(point.speed);
    return Number.isFinite(speedStill) && speedStill > STATIONARY_MAX_SPEED_KNOTS;
  }
  const speed = Number(point.speed);
  return Number.isFinite(speed) && speed > STATIONARY_MAX_SPEED_KNOTS;
};

const routePointsInWindow = (
  points: TraccarRoutePoint[],
  fromMs: number,
  toMs: number
): TraccarRoutePoint[] => {
  const start = Math.min(fromMs, toMs);
  const end = Math.max(fromMs, toMs);
  return points.filter((point) => {
    const ts = parseRoutePointTimestampMs(point);
    return Number.isFinite(ts) && ts >= start && ts <= end;
  });
};

const MOTION_CONSUMPTION_LOOKBACK_MS = 30 * 60 * 1000;

const wasMovingRecently = (routePoints: TraccarRoutePoint[], atMs: number, lookbackMs: number): boolean =>
  routePointsInWindow(routePoints, atMs - lookbackMs, atMs).some((point) => isRoutePointMoving(point));

/**
 * True when a fuel delta looks like splash/noise while moving:
 * ≥ 2 L within 10 seconds and the asset was in motion/trip during that window.
 * Parked/stationary changes are allowed through for refill/drop detection.
 */
export const isRapidFuelChangeWhileMoving = (
  routePoints: TraccarRoutePoint[],
  event: Pick<FuelChangePoint, "atMs" | "deltaLiters" | "fromLevel" | "toLevel">,
  fuelConfig?: DeviceFuelConfig | null
): boolean => {
  const absDelta = Math.abs(Number(event.deltaLiters ?? 0));
  if (!(absDelta >= MOTION_FUEL_IGNORE_MIN_L)) return false;

  const windowEnd = Number(event.atMs);
  const windowStart = windowEnd - MOTION_FUEL_IGNORE_WINDOW_MS;
  if (!Number.isFinite(windowEnd)) return false;

  const windowPoints = routePointsInWindow(routePoints, windowStart, windowEnd + 1_000);
  const movingShare = windowPoints.filter((point) => isRoutePointMoving(point)).length;
  const wasMoving =
    movingShare > 0
    || isRoutePointMoving(nearestRoutePointAt(routePoints, windowEnd))
    || isRoutePointMoving(nearestRoutePointAt(routePoints, windowStart));

  if (!wasMoving) return false;

  // Confirm the raw fuel samples also jump ≥ 2 L inside the 10 s window.
  const fuelSamples = windowPoints
    .map((point) => {
      const liters = extractFuelLitersFromRoutePoint(point, fuelConfig);
      const atMs = parseRoutePointTimestampMs(point);
      return typeof liters === "number" && Number.isFinite(atMs) ? { atMs, liters } : null;
    })
    .filter((row): row is { atMs: number; liters: number } => Boolean(row))
    .sort((a, b) => a.atMs - b.atMs);

  if (fuelSamples.length >= 2) {
    let maxSwing = 0;
    for (let i = 0; i < fuelSamples.length; i += 1) {
      for (let j = i + 1; j < fuelSamples.length; j += 1) {
        if (fuelSamples[j].atMs - fuelSamples[i].atMs > MOTION_FUEL_IGNORE_WINDOW_MS) break;
        maxSwing = Math.max(maxSwing, Math.abs(fuelSamples[j].liters - fuelSamples[i].liters));
      }
    }
    if (maxSwing >= MOTION_FUEL_IGNORE_MIN_L) return true;
  }

  // Stabilized event itself is already ≥ 2 L; treat as rapid if transition landed while moving.
  return absDelta >= MOTION_FUEL_IGNORE_MIN_L;
};

export type FuelStartStopRow = {
  ignitionOnAtMs: number;
  ignitionOffAtMs?: number;
  fuelStartLitres: number;
  fuelStopLitres?: number;
  usedLitres?: number;
  startLat?: number;
  startLng?: number;
  stopLat?: number;
  stopLng?: number;
};

/**
 * At every ignition ON, snapshot fuel start; at ignition OFF, snapshot fuel stop.
 * Used by the Fuel Start Stop report.
 */
export const extractFuelStartStopFromRoute = (params: {
  routePoints: TraccarRoutePoint[];
  tankCapacityLiters?: number;
  fuelConfig?: DeviceFuelConfig | null;
}): FuelStartStopRow[] => {
  const { routePoints, tankCapacityLiters, fuelConfig } = params;
  if (!Array.isArray(routePoints) || routePoints.length < 2) return [];

  const ordered = [...routePoints]
    .map((point) => ({ point, atMs: parseRoutePointTimestampMs(point) }))
    .filter((row) => Number.isFinite(row.atMs))
    .sort((a, b) => a.atMs - b.atMs);

  const levels = ordered
    .map((row) => extractFuelLitersFromRoutePoint(row.point, fuelConfig))
    .filter((value): value is number => typeof value === "number");
  const percentMode = readingsLookLikeTankPercentForEvents(levels);
  const tankCapacity =
    tankCapacityLiters && tankCapacityLiters > 0
      ? tankCapacityLiters
      : percentMode
        ? DEFAULT_TANK_CAPACITY_L
        : 0;

  const toLitres = (raw: number) =>
    percentMode && tankCapacity > 0 ? (raw / 100) * tankCapacity : raw;

  const rows: FuelStartStopRow[] = [];
  let previousIgnition: boolean | null = null;
  let open: FuelStartStopRow | null = null;

  for (const { point, atMs } of ordered) {
    const ignition = readRoutePointIgnition(point);
    if (ignition === null) continue;
    const litersRaw = extractFuelLitersFromRoutePoint(point, fuelConfig);
    if (typeof litersRaw !== "number") {
      previousIgnition = ignition;
      continue;
    }
    const liters = Math.round(toLitres(litersRaw) * 100) / 100;
    const lat = Number(point.latitude);
    const lng = Number(point.longitude);

    if (previousIgnition === false && ignition === true) {
      open = {
        ignitionOnAtMs: atMs,
        fuelStartLitres: liters,
        startLat: Number.isFinite(lat) ? lat : undefined,
        startLng: Number.isFinite(lng) ? lng : undefined
      };
    } else if (previousIgnition === true && ignition === false && open) {
      open.ignitionOffAtMs = atMs;
      open.fuelStopLitres = liters;
      open.usedLitres = Math.round(Math.max(0, open.fuelStartLitres - liters) * 100) / 100;
      open.stopLat = Number.isFinite(lat) ? lat : undefined;
      open.stopLng = Number.isFinite(lng) ? lng : undefined;
      rows.push(open);
      open = null;
    } else if (previousIgnition === null && ignition === true && !open) {
      // Series starts already ignited — still record a fuel start.
      open = {
        ignitionOnAtMs: atMs,
        fuelStartLitres: liters,
        startLat: Number.isFinite(lat) ? lat : undefined,
        startLng: Number.isFinite(lng) ? lng : undefined
      };
    }

    previousIgnition = ignition;
  }

  if (open) rows.push(open);
  return rows;
};

/** Wait past the key-on sender dip before reading the start level. */
export const IGNITION_FUEL_SETTLE_MS = 5_000;

/**
 * Key-off often collapses the analogue sender. A drop of this size to ≤85% of the
 * last ignition-on reading is the dead sender, not fuel that was burned.
 */
const isIgnitionOffSenderCollapse = (level: number, baseline: number): boolean => {
  if (!(baseline > 0) || !Number.isFinite(level)) return false;
  const drop = baseline - level;
  return drop >= 15 && level <= baseline * 0.85;
};

/**
 * Fuel used for the window: for each ignition cycle, litres at the first sample
 * ≥5s after ignition ON, minus litres at ignition OFF.
 * Classified refills inside the settled cycle are added back so a fill while
 * the engine is on does not shrink Fuel used.
 * Mid-run slosh and key-on dips are not summed. Parked drains (ignition off) are excluded.
 * Returns null when the route has no ignition flags.
 */
export const computeIgnitionCycleUsedFuelLitres = (params: {
  routePoints: TraccarRoutePoint[];
  fuelConfig?: DeviceFuelConfig | null;
  refillEvents?: Array<Pick<FuelChangePoint, "atMs" | "deltaLiters" | "rising">>;
}): number | null => {
  const routePoints = params.routePoints;
  if (!Array.isArray(routePoints) || routePoints.length < 2) return null;

  const samples = routePoints
    .map((point) => ({
      point,
      atMs: parseRoutePointTimestampMs(point),
      ignition: readRoutePointIgnition(point),
      liters: extractFuelLitersFromRoutePoint(point, params.fuelConfig)
    }))
    .filter((row) => Number.isFinite(row.atMs) && row.ignition !== null)
    .sort((a, b) => a.atMs - b.atMs);

  if (samples.length < 2) return null;

  const refillEvents = (params.refillEvents ?? []).filter(
    (event) => event.rising && Number.isFinite(event.atMs) && Number.isFinite(event.deltaLiters)
  );

  let total = 0;
  let previousIgnition: boolean | null = null;
  let cycleOnAtMs: number | null = null;
  let settlePending = false;
  let startLiters: number | null = null;
  let lastOnLiters: number | null = null;

  const refillLitresInCycle = (fromMs: number, toMs: number): number =>
    refillEvents
      .filter((event) => event.atMs >= fromMs && event.atMs <= toMs)
      .reduce((sum, event) => sum + Math.abs(event.deltaLiters), 0);

  const addUsed = (endLiters: number | null, endAtMs: number) => {
    if (startLiters == null || endLiters == null || cycleOnAtMs == null) return;
    const settleFromMs = cycleOnAtMs + IGNITION_FUEL_SETTLE_MS;
    const refillL = refillLitresInCycle(settleFromMs, endAtMs);
    total += Math.max(0, startLiters - endLiters + refillL);
  };

  const resetCycle = () => {
    cycleOnAtMs = null;
    settlePending = false;
    startLiters = null;
    lastOnLiters = null;
  };

  for (const sample of samples) {
    const ignition = sample.ignition === true;
    const rising = previousIgnition === false && ignition;
    const falling = previousIgnition === true && !ignition;
    const alreadyOn = previousIgnition === null && ignition;

    if (rising) {
      cycleOnAtMs = sample.atMs;
      settlePending = true;
      startLiters = null;
      lastOnLiters = null;
    } else if (alreadyOn) {
      cycleOnAtMs = sample.atMs;
      settlePending = false;
    }

    const usableLiters =
      ignition
      && typeof sample.liters === "number"
      && !(ignition && isRoutePointPowerCutoff(sample.point));

    if (usableLiters && cycleOnAtMs != null) {
      const liters = sample.liters as number;
      if (settlePending) {
        if (sample.atMs >= cycleOnAtMs + IGNITION_FUEL_SETTLE_MS) {
          startLiters = liters;
          lastOnLiters = liters;
          settlePending = false;
        }
      } else if (startLiters == null) {
        startLiters = liters;
        lastOnLiters = liters;
      } else {
        lastOnLiters = liters;
      }
    }

    if (falling && cycleOnAtMs != null) {
      let endLiters = lastOnLiters;
      if (
        endLiters != null
        && typeof sample.liters === "number"
        && !isIgnitionOffSenderCollapse(sample.liters, endLiters)
      ) {
        endLiters = sample.liters;
      }
      if (!settlePending) addUsed(endLiters, sample.atMs);
      resetCycle();
    }

    previousIgnition = ignition;
  }

  if (!settlePending && samples.length) {
    addUsed(lastOnLiters, samples[samples.length - 1].atMs);
  }
  return Math.round(total * 100) / 100;
};

const liveFuelSmoothing = new Map<string, number>();

/** Exponential moving average to reduce jitter on live fuel level displays. */
export const smoothFuelLitersForAsset = (
  assetKey: string,
  liters: number,
  alpha = 0.18
): number => {
  const key = String(assetKey ?? "").trim();
  if (!key || !Number.isFinite(liters) || liters < 0) return liters;
  const previous = liveFuelSmoothing.get(key);
  if (previous === undefined || !Number.isFinite(previous)) {
    liveFuelSmoothing.set(key, liters);
    return liters;
  }
  const next = previous + alpha * (liters - previous);
  liveFuelSmoothing.set(key, next);
  return next;
};

export const formatSmoothedFuelReading = (assetKey: string, payload: unknown): string => {
  const liters = extractFuelLitersFromPayload(payload);
  if (typeof liters !== "number") return extractFuelReading(payload);
  return formatFuelLiters(smoothFuelLitersForAsset(assetKey, liters));
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

/** Typical fleet consumption bounds (L/km). */
const MIN_LITRES_PER_KM = 0.012;
const MAX_LITRES_PER_KM = 0.85;
const DEFAULT_TANK_CAPACITY_L = 400;

export const isPlausibleTripFuelLitres = (liters: number, distanceKm: number) => {
  if (!Number.isFinite(liters) || liters < 0) return false;
  if (liters === 0) return distanceKm <= 2;
  if (distanceKm <= 0.5) return liters <= 80;
  const litresPerKm = liters / distanceKm;
  return litresPerKm >= MIN_LITRES_PER_KM && litresPerKm <= MAX_LITRES_PER_KM;
};

export const formatUsedFuelLitres = (liters: number | null | undefined, digits = 2) => {
  if (liters === null || liters === undefined || !Number.isFinite(liters)) {
    return (0).toFixed(digits);
  }
  return liters.toFixed(digits);
};

const extractCumulativeFuelUsedLitres = (point: TraccarRoutePoint): number | undefined => {
  const attributes = (point.attributes ?? {}) as Record<string, unknown>;
  return parseFuelNumber(
    attributes.fuelUsed
    ?? attributes.fuelConsumed
    ?? attributes.totalFuelUsed
    ?? attributes.totalFuel
    ?? attributes.io107
    ?? attributes.io108
  );
};

const filterRouteWindow = (
  routePoints: TraccarRoutePoint[],
  startMs: number,
  endMs: number
) => routePoints.filter((point) => {
  const ts = parseRoutePointTimestampMs(point);
  return Number.isFinite(ts) && ts >= startMs && ts <= endMs;
});

const computeFromCumulativeFuelUsed = (
  routePoints: TraccarRoutePoint[],
  startMs: number,
  endMs: number
): number => {
  const windowPoints = filterRouteWindow(routePoints, startMs, endMs);
  const readings: Array<{ atMs: number; liters: number }> = [];
  for (const point of windowPoints) {
    const atMs = parseRoutePointTimestampMs(point);
    const liters = extractCumulativeFuelUsedLitres(point);
    if (!Number.isFinite(atMs) || typeof liters !== "number") continue;
    readings.push({ atMs, liters });
  }
  if (readings.length < 2) return 0;
  readings.sort((a, b) => a.atMs - b.atMs);
  const delta = readings[readings.length - 1].liters - readings[0].liters;
  return delta > 0 ? delta : 0;
};

const readingsLookLikeTankPercent = (levels: number[]) => {
  if (levels.length < 2) return false;
  const max = Math.max(...levels);
  const min = Math.min(...levels);
  return max <= 100 && min >= 0 && max <= 100.5;
};

const computeFromTankTrend = (
  routePoints: TraccarRoutePoint[],
  startMs: number,
  endMs: number,
  tankCapacityLiters?: number
): number => {
  const windowPoints = filterRouteWindow(routePoints, startMs, endMs);
  if (windowPoints.length < 2) return 0;

  const rawTrend = buildFuelTrendFromRoute(windowPoints);
  if (rawTrend.length < 2) return 0;

  const levels = rawTrend.map((point) => point.liters);
  const percentMode = readingsLookLikeTankPercent(levels);
  const tankCapacity = tankCapacityLiters && tankCapacityLiters > 0
    ? tankCapacityLiters
    : percentMode
      ? DEFAULT_TANK_CAPACITY_L
      : 0;

  const stabilized = stabilizeFuelTrend(rawTrend);
  const trendUsed = computePeriodConsumedFuelLitres({
    trendPoints: stabilized.smoothed.length ? stabilized.smoothed : rawTrend,
    refillEvents: stabilized.events.filter((event) => event.rising)
  });

  if (percentMode && tankCapacity > 0) {
    if (trendUsed > 0) return (trendUsed / 100) * tankCapacity;
    return 0;
  }

  return trendUsed;
};

/** Litres consumed on a trip using the most reliable available source. */
export const computeTripUsedFuelLitres = (params: {
  spentFuel?: unknown;
  routePoints?: TraccarRoutePoint[];
  startMs?: number;
  endMs?: number;
  distanceKm?: number;
  tankCapacityLiters?: number;
}): number => {
  const startMs = params.startMs;
  const endMs = params.endMs;
  const distanceKm = Math.max(0, Number(params.distanceKm ?? 0));
  const routePoints = params.routePoints;
  const candidates: number[] = [];

  if (
    Array.isArray(routePoints)
    && routePoints.length > 1
    && Number.isFinite(startMs)
    && Number.isFinite(endMs)
  ) {
    const cumulative = computeFromCumulativeFuelUsed(routePoints, startMs!, endMs!);
    if (cumulative > 0) candidates.push(cumulative);

    const trendUsed = computeFromTankTrend(routePoints, startMs!, endMs!, params.tankCapacityLiters);
    if (trendUsed > 0) candidates.push(trendUsed);
  }

  const spent = parseFuelNumber(params.spentFuel);
  if (typeof spent === "number" && spent > 0) candidates.push(spent);

  for (const liters of candidates) {
    if (isPlausibleTripFuelLitres(liters, distanceKm)) {
      return Math.round(liters * 100) / 100;
    }
  }

  const positiveCandidate = candidates.find((liters) => Number.isFinite(liters) && liters > 0);
  if (positiveCandidate !== undefined) {
    return Math.round(positiveCandidate * 100) / 100;
  }

  if (typeof spent === "number" && Number.isFinite(spent) && spent >= 0) {
    return Math.round(spent * 100) / 100;
  }

  return 0;
};

export type FuelTrendEventRow = {
  atMs: number;
  rising: boolean;
  volumeLitres: number;
  fromLevel: number;
  toLevel: number;
  lat?: number;
  lng?: number;
};

const readingsLookLikeTankPercentForEvents = (levels: number[]) => {
  if (levels.length < 2) return false;
  const max = Math.max(...levels);
  const min = Math.min(...levels);
  return max <= 100 && min >= 0 && max <= 100.5;
};

/** Detect refuel (rising) and drop (falling) events from route fuel trend. */
export const extractFuelTrendEventsFromRoute = (params: {
  routePoints: TraccarRoutePoint[];
  tankCapacityLiters?: number;
  risingOnly?: boolean;
  droppingOnly?: boolean;
  fuelConfig?: DeviceFuelConfig | null;
}): FuelTrendEventRow[] => {
  const { routePoints, tankCapacityLiters, risingOnly, droppingOnly, fuelConfig } = params;
  const rawTrend = buildFuelTrendFromRoute(routePoints, fuelConfig);
  if (rawTrend.length < 2) return [];

  const levels = rawTrend.map((point) => point.liters);
  const percentMode = readingsLookLikeTankPercentForEvents(levels);
  const tankCapacity = tankCapacityLiters && tankCapacityLiters > 0
    ? tankCapacityLiters
    : percentMode
      ? DEFAULT_TANK_CAPACITY_L
      : 0;

  const stabilized = stabilizeFuelTrend(rawTrend);
  return stabilized.events
    .filter((event) => {
      if (risingOnly && !event.rising) return false;
      if (droppingOnly && event.rising) return false;
      // Splash / sensor jitter while moving or in trip must not count as refill or drop.
      if (isRapidFuelChangeWhileMoving(routePoints, event, fuelConfig)) return false;
      return true;
    })
    .map((event) => {
      const rawDelta = Math.abs(event.deltaLiters);
      const volumeLitres = percentMode && tankCapacity > 0
        ? (rawDelta / 100) * tankCapacity
        : rawDelta;
      const fromLevel = percentMode && tankCapacity > 0
        ? (event.fromLevel / 100) * tankCapacity
        : event.fromLevel;
      const toLevel = percentMode && tankCapacity > 0
        ? (event.toLevel / 100) * tankCapacity
        : event.toLevel;
      const nearest = nearestRoutePointAt(routePoints, event.atMs);
      const lat = nearest ? Number(nearest.latitude) : undefined;
      const lng = nearest ? Number(nearest.longitude) : undefined;
      return {
        atMs: event.atMs,
        rising: event.rising,
        volumeLitres: Math.round(volumeLitres * 100) / 100,
        fromLevel: Math.round(fromLevel * 100) / 100,
        toLevel: Math.round(toLevel * 100) / 100,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined
      };
    });
};

const FUEL_ADD_TRIP_BEFORE_MS = 60 * 1000;
const FUEL_ADD_TRIP_AFTER_MS = 4 * 60 * 1000;

/**
 * True when a rise happens while the asset is in trip.
 * A fill counts only when the truck is stopped for the rise itself.
 */
export const isFuelAddedInTrip = (
  routePoints: TraccarRoutePoint[],
  event: Pick<FuelChangePoint, "atMs" | "rising">
): boolean => {
  if (!event.rising) return false;
  const atMs = Number(event.atMs);
  if (!Number.isFinite(atMs)) return false;
  const window = routePointsInWindow(
    routePoints,
    atMs - FUEL_ADD_TRIP_BEFORE_MS,
    atMs + FUEL_ADD_TRIP_AFTER_MS
  );
  const samples = window.length
    ? window
    : [nearestRoutePointAt(routePoints, atMs)].filter((point): point is TraccarRoutePoint => Boolean(point));
  if (!samples.length) return false;
  const moving = samples.filter((point) => isRoutePointMoving(point)).length;
  return moving / samples.length >= 0.6;
};

/** Filter stabilized chart events with the same parked-only motion gate. */
export const filterFuelChangePointsForMotion = (
  events: FuelChangePoint[],
  routePoints: TraccarRoutePoint[],
  fuelConfig?: DeviceFuelConfig | null
): FuelChangePoint[] =>
  events.filter((event) => {
    if (isFuelAddedInTrip(routePoints, event)) return false;
    if (isRapidFuelChangeWhileMoving(routePoints, event, fuelConfig)) return false;
    // A tank drop just after a trip is consumption settling, not a parked drain.
    if (!event.rising && wasMovingRecently(routePoints, event.atMs, MOTION_CONSUMPTION_LOOKBACK_MS)) {
      return false;
    }
    return true;
  });

const medianFuelLevel = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const FUEL_ENDPOINT_WINDOW_MS = 45 * 60 * 1000;

/** Median tank litres at the start or end of the window, skipping brief dropouts. */
const stableFuelLevel = (points: FuelTrendPoint[], side: "start" | "end"): number => {
  if (!points.length) return 0;
  const edgeMs = side === "start" ? points[0].atMs : points[points.length - 1].atMs;
  const window = points.filter((point) =>
    side === "start"
      ? point.atMs <= edgeMs + FUEL_ENDPOINT_WINDOW_MS
      : point.atMs >= edgeMs - FUEL_ENDPOINT_WINDOW_MS
  );
  const source = window.length ? window : points;
  const levels = source.map((point) => point.liters);
  const med = medianFuelLevel(levels);
  const peak = Math.max(...levels);
  const floor = Math.max(med - Math.max(40, peak * 0.15), peak - Math.max(80, peak * 0.25));
  const kept = source.filter((point) => point.liters >= floor);
  return medianFuelLevel((kept.length ? kept : source).map((point) => point.liters));
};

const sumRisingRuns = (
  points: FuelTrendPoint[],
  minRefillLiters: number,
  minDurationMs: number,
  minStartLiters?: number
): number => {
  if (points.length < 2) return 0;
  let total = 0;
  let runStart = 0;
  const closeRun = (endIdx: number) => {
    if (
      typeof minStartLiters === "number"
      && runStart === 0
      && points[runStart].liters < minStartLiters - 40
    ) {
      return;
    }
    const rise = points[endIdx].liters - points[runStart].liters;
    const durationMs = points[endIdx].atMs - points[runStart].atMs;
    if (rise >= minRefillLiters && durationMs >= minDurationMs) total += rise;
  };
  for (let index = 1; index < points.length; index += 1) {
    const step = points[index].liters - points[index - 1].liters;
    if (step < -2.5) {
      closeRun(index - 1);
      runStart = index;
    }
  }
  closeRun(points.length - 1);
  return total;
};

/** Sum contiguous tank drops (consumption + drains). Ignores sub-litre noise steps. */
const sumFallingRuns = (points: FuelTrendPoint[], minDropLiters = 1): number => {
  if (points.length < 2) return 0;
  let total = 0;
  let runStart = 0;
  const closeRun = (endIdx: number) => {
    const drop = points[runStart].liters - points[endIdx].liters;
    if (drop >= minDropLiters) total += drop;
  };
  for (let index = 1; index < points.length; index += 1) {
    const step = points[index].liters - points[index - 1].liters;
    // Rising / flat break ends a falling run (refill, splash, or plateau).
    if (step > 2.5) {
      closeRun(index - 1);
      runStart = index;
    }
  }
  closeRun(points.length - 1);
  return total;
};

/**
 * Fuel consumed over the selected window.
 * Cumulative falling runs (plus mass-balance with refills) so a 24h total cannot
 * under-count a nested 12h window after overnight gaps or mid-window level recoveries.
 * Classified drains are subtracted so "Fuel used" stays operational consumption.
 */
export const computePeriodConsumedFuelLitres = (params: {
  trendPoints: FuelTrendPoint[];
  refillEvents?: Array<Pick<FuelChangePoint, "atMs" | "deltaLiters" | "rising">>;
  drainEvents?: Array<Pick<FuelChangePoint, "atMs" | "deltaLiters" | "rising">>;
  minRefillLiters?: number;
}): number => {
  const points = (params.trendPoints ?? [])
    .filter((point) => Number.isFinite(point.atMs) && Number.isFinite(point.liters))
    .slice()
    .sort((a, b) => a.atMs - b.atMs);
  if (points.length < 2) return 0;

  const minRefillLiters = params.minRefillLiters ?? 8;
  const startLiters = stableFuelLevel(points, "start");
  const endLiters = stableFuelLevel(points, "end");
  const seriesRefillL = sumRisingRuns(
    points,
    minRefillLiters,
    FUEL_REFILL_MIN_DURATION_MS,
    startLiters
  );
  const eventRefillL = (params.refillEvents ?? [])
    .filter((event) => event.rising)
    .reduce((sum, event) => sum + Math.abs(event.deltaLiters), 0);
  const refillL = Math.max(seriesRefillL, eventRefillL);
  const drainedL = (params.drainEvents ?? [])
    .filter((event) => !event.rising)
    .reduce((sum, event) => sum + Math.abs(event.deltaLiters), 0);

  // Net tank balance (works when endpoints are stable).
  const massBalanceL = Math.max(0, startLiters - endLiters + refillL - drainedL);
  // Cumulative drops across the whole series (survives mid-window rises / gaps).
  const cumulativeL = Math.max(0, sumFallingRuns(points) - drainedL);

  return Math.round(Math.max(massBalanceL, cumulativeL) * 100) / 100;
};

export const buildRouteDistanceKm = (points: TraccarRoutePoint[]): number => {
  let total = 0;
  let previous: { lat: number; lng: number } | null = null;
  for (const point of points) {
    const lat = Number(point.latitude);
    const lng = Number(point.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (previous) total += haversineKm(previous.lat, previous.lng, lat, lng);
    previous = { lat, lng };
  }
  return total;
};

export const formatFuelChartTime = (atMs: number): string => {
  if (!Number.isFinite(atMs)) return "";
  return new Date(atMs)
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
    .replace(",", "");
};
