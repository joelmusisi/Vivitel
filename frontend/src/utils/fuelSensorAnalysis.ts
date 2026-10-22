/**
 * Support table for Omnicomm LLS and DUT-E fuel samples.
 * One row per received tracker sample. Missing fields stay blank.
 * A digital LLS code is never labelled as millivolts.
 */
import type { TraccarRoutePoint } from "./api";
import type { FuelChangePoint, FuelTrendPoint } from "./fuelTrendStabilizer";
import type { DeviceFuelConfig } from "./traccarFuel";
import {
  extractFuelLitersFromAttributes,
  extractFuelLitersFromRoutePoint,
  parseFuelNumber,
  parseRoutePointTimestampMs,
  readFuelInputMillivolts,
  readRoutePointIgnition,
  thinRoutePointsForFuel
} from "./traccarFuel";
import { mapTeltonikaAnalogInputFieldToJexl } from "../data/teltonikaAnalogInputs";
import {
  TELTONIKA_AVL_IO,
  readTeltonikaIgnition,
  readTeltonikaIoNumber
} from "./teltonikaProtocol";

const RAISE_MIN_L = 5;
const SIPHON_MIN_L = 5;
const NOISE_MIN_L = 2;
const GAP_SECONDS = 30;

const LLS_CHANNELS = [
  { level: TELTONIKA_AVL_IO.LLS_1_FUEL_LEVEL, temp: TELTONIKA_AVL_IO.LLS_1_TEMPERATURE, name: "LLS 1" },
  { level: TELTONIKA_AVL_IO.LLS_2_FUEL_LEVEL, temp: TELTONIKA_AVL_IO.LLS_2_TEMPERATURE, name: "LLS 2" },
  { level: TELTONIKA_AVL_IO.LLS_3_FUEL_LEVEL, temp: TELTONIKA_AVL_IO.LLS_3_TEMPERATURE, name: "LLS 3" },
  { level: TELTONIKA_AVL_IO.LLS_4_FUEL_LEVEL, temp: TELTONIKA_AVL_IO.LLS_4_TEMPERATURE, name: "LLS 4" },
  { level: TELTONIKA_AVL_IO.LLS_5_FUEL_LEVEL, temp: TELTONIKA_AVL_IO.LLS_5_TEMPERATURE, name: "LLS 5" }
] as const;

export const FUEL_ANALYSIS_COLUMNS = [
  { key: "recordId", label: "Record_ID" },
  { key: "registration", label: "Asset_Registration" },
  { key: "imei", label: "Device_IMEI" },
  { key: "sensorModel", label: "Sensor_Model" },
  { key: "sensorFamily", label: "Sensor_Family" },
  { key: "sensorInterface", label: "Sensor_Interface / Protocol" },
  { key: "trackerModel", label: "Tracker_Model" },
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "deviceUtc", label: "Device time" },
  { key: "receivedUtc", label: "Received time" },
  { key: "sequenceNo", label: "Sequence_No" },
  { key: "raw", label: "Raw_Sensor_Value" },
  { key: "voltageMv", label: "Signal_Value_Converted_to_mV" },
  { key: "voltageSource", label: "Voltage_Value_Source" },
  { key: "analogInputId", label: "Analogue_Input_ID" },
  { key: "avlId", label: "AVL_IO_ID" },
  { key: "allAnalogInputs", label: "All_Analogue_Inputs_mV" },
  { key: "rawAdc", label: "Raw_ADC_Value" },
  { key: "scaledInput", label: "Scaled_Input_Value (V)" },
  { key: "supplyVoltage", label: "Sensor_Supply_Voltage_mV" },
  { key: "inputMode", label: "Input_Mode / Configuration" },
  { key: "mappingStatus", label: "Input_Mapping_Status" },
  { key: "packetSource", label: "Packet_Source / Protocol Field" },
  { key: "latitude", label: "GPS_Latitude" },
  { key: "longitude", label: "GPS_Longitude" },
  { key: "speed", label: "Speed_kmh" },
  { key: "ignition", label: "Ignition" },
  { key: "tankAngle", label: "Tank_Angle_Deg" },
  { key: "tiltStatus", label: "Tilt Status" },
  { key: "angleSource", label: "Angle_Source" },
  { key: "calibrationId", label: "Calibration_Profile_ID" },
  { key: "quality", label: "Data_Quality" },
  { key: "event", label: "Notification_Name" },
  { key: "packetId", label: "Packet_ID" },
  { key: "signal", label: "Signal_Strength" },
  { key: "temperature", label: "Sensor_Temperature_C" },
  { key: "capacity", label: "Tank_Capacity (L)" },
  { key: "percent", label: "Fuel Percentage (%)" },
  { key: "previousL", label: "Fuel Previous Value (L)" },
  { key: "currentL", label: "Fuel Current Value (L)" },
  { key: "deltaSeconds", label: "Delta Time (s)" },
  { key: "deltaL", label: "Fuel Delta (L)" },
  { key: "rate", label: "Rate_L_per_min" },
  { key: "filteredL", label: "Used/Filtered_Fuel_L" },
  { key: "suppressedL", label: "Suppressed Fuel (L)" },
  { key: "medianL", label: "Median_Filtered_Fuel_L" },
  { key: "signalQuality", label: "Signal_Quality" },
  { key: "noiseScore", label: "Noise_Score (L)" },
  { key: "faultCode", label: "Sensor_Fault_Code" },
  { key: "eventCandidate", label: "Event_Candidate" },
  { key: "filterReason", label: "Filter_Reason" },
  { key: "lastValid", label: "Last_Valid_Timestamp" },
  { key: "notes", label: "Support_Notes" }
] as const;

const DIAGNOSTIC_COLUMN_KEYS: ReadonlySet<string> = new Set([
  "analogInputId", "avlId", "allAnalogInputs", "rawAdc", "scaledInput", "supplyVoltage",
  "inputMode", "mappingStatus", "packetSource", "medianL", "signalQuality", "noiseScore",
  "faultCode", "eventCandidate", "filterReason", "lastValid"
]);

/** The analogue diagnostic columns are left out for the ZA / CMS 808 server. */
export const getFuelAnalysisColumns = (includeDiagnostics: boolean) =>
  includeDiagnostics
    ? FUEL_ANALYSIS_COLUMNS
    : FUEL_ANALYSIS_COLUMNS.filter((column) => !DIAGNOSTIC_COLUMN_KEYS.has(column.key));

export type FuelAnalysisEvent = "NORMAL" | "RAISE" | "SIPHONING" | "NOISE" | "DATA_GAP";
export type FuelAnalysisQuality = "VALID" | "SUSPECT" | "INVALID" | "MISSING" | "STALE";

export type FuelAnalysisSampleInput = {
  assetId: string;
  registration: string;
  imei: string;
  trackerModel: string;
  deviceTimeMs: number | null;
  receivedTimeMs: number | null;
  latitude?: number;
  longitude?: number;
  speedKph?: number;
  /** Tracking device angle in degrees (course/heading). This is the sensor tilt source. */
  deviceAngleDeg?: number | null;
  ignition?: string;
  attributes?: Record<string, unknown>;
  fuelConfig?: DeviceFuelConfig | null;
  /** Litres already shown on the live asset, used when the packet has no separate fuel field. */
  displayedFuel?: string;
  site?: string;
  /** Site-timezone clock, for example "09/10/2026 23:21:35 EAT". */
  formatWhen?: (ms: number) => string;
  packetId?: string;
  /** When true, a sample older than two minutes is marked stale. History rows stay as received. */
  live?: boolean;
  /** Poll time for 30-second live rows, so each poll produces its own row. */
  sampleTick?: number;
};

export type FuelAnalysisRow = {
  id: string;
  assetId: string;
  site: string;
  sortMs: number;
  event: FuelAnalysisEvent;
  quality: FuelAnalysisQuality;
  currentLiters: number | null;
  cells: Record<string, string>;
  /** Rolling per-asset state carried to the next sample for noise, median and stuck-signal checks. */
  state?: {
    recentLiters: number[];
    recentRaw: Array<number | null>;
    lastValidMs: number | null;
    lastValidLabel: string;
  };
};

const blank = "—";

const num = (value: number | null | undefined, digits = 1): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return blank;
  return value.toFixed(digits);
};

/** Fuel added shows +. A drop keeps the minus from the number itself. */
const signedFuelChange = (value: number | null | undefined, digits = 1): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return blank;
  if (value > 0) return `+${value.toFixed(digits)}`;
  return value.toFixed(digits);
};

/** Used fuel: added fuel shows +litres. Consumed fuel stays a positive amount. */
const formatUsedFuel = (usedLitres: number | null | undefined, digits = 1): string => {
  if (typeof usedLitres !== "number" || !Number.isFinite(usedLitres)) return blank;
  if (usedLitres < 0) return `+${Math.abs(usedLitres).toFixed(digits)}`;
  return usedLitres.toFixed(digits);
};

const localDate = (ms: number | null): string => {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return blank;
  const date = new Date(ms);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const localTime = (ms: number | null): string => {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return blank;
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const readNamedNumber = (attributes: Record<string, unknown>, pattern: RegExp): number | undefined => {
  for (const [key, value] of Object.entries(attributes)) {
    if (!pattern.test(key)) continue;
    const parsed = parseFuelNumber(value);
    if (typeof parsed === "number") return parsed;
  }
  const nested = attributes.io;
  if (nested && typeof nested === "object") {
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      if (!pattern.test(key)) continue;
      const parsed = parseFuelNumber(value);
      if (typeof parsed === "number") return parsed;
    }
  }
  return undefined;
};

const plausibleCelsius = (value: number): number | undefined => {
  if (value >= -40 && value <= 125) return value;
  if (Math.abs(value) > 125 && Math.abs(value) <= 8500) {
    const scaled = value / 10;
    if (scaled >= -40 && scaled <= 125) return scaled;
  }
  if (Math.abs(value) > 8500 && Math.abs(value) <= 12500) {
    const scaled = value / 100;
    if (scaled >= -40 && scaled <= 125) return scaled;
  }
  return undefined;
};

const readTemperatureC = (attributes: Record<string, unknown>, llsTempIo: number | null): number | undefined => {
  if (typeof llsTempIo === "number") {
    const raw = readTeltonikaIoNumber(attributes, llsTempIo);
    if (typeof raw === "number" && raw > -100 && raw < 126) return raw;
  }
  const named = readNamedNumber(attributes, /temperature|fuel.?temp|ble.?temp/i);
  if (typeof named === "number") {
    const scaled = plausibleCelsius(named);
    if (typeof scaled === "number") return scaled;
  }
  const ble = readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.BLE_TEMPERATURE_1);
  if (typeof ble === "number") return plausibleCelsius(ble);
  return undefined;
};

const fuelInputVoltage = (
  attributes: Record<string, unknown>,
  analogInput: string | undefined
): { mv: number; source: "MEASURED_MV" | "CONVERTED_FROM_MEASURED_V" } | null => {
  const mv = readFuelInputMillivolts(attributes, analogInput);
  if (typeof mv !== "number") return null;
  if (mv > 0 && mv <= 36) {
    return { mv: Math.round(mv * 1000), source: "CONVERTED_FROM_MEASURED_V" };
  }
  return { mv: Math.round(mv), source: "MEASURED_MV" };
};

const wrapDeviceAngle = (value: number): number => ((value % 360) + 360) % 360;

/** Off-level angle, in degrees, above which the 3-axis G-sensor counts as tilted. */
const TILT_YES_DEGREES = 5;

/**
 * Inclination from level using the tracker 3-axis G-sensor (AVL 17/18/19, milli-g).
 * A level vehicle sits near 1 G on one axis. Missing or implausible axes are not a lock.
 */
const readThreeAxisTilt = (
  attributes: Record<string, unknown>
): { tilted: boolean; degrees: number } | null => {
  const x = readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.AXIS_X);
  const y = readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.AXIS_Y);
  const z = readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.AXIS_Z);
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return null;
  const magnitude = Math.hypot(x, y, z);
  if (magnitude < 500 || magnitude > 2500) return null;
  const fromVertical = (Math.acos(Math.min(1, Math.abs(z) / magnitude)) * 180) / Math.PI;
  return { tilted: fromVertical > TILT_YES_DEGREES, degrees: fromVertical };
};

/** Tilt comes from the tracking device angle (course/heading), not an accelerometer estimate. */
const readDeviceAngleDeg = (
  deviceAngleDeg: number | null | undefined,
  attributes: Record<string, unknown>
): number | null => {
  if (typeof deviceAngleDeg === "number" && Number.isFinite(deviceAngleDeg)) {
    return wrapDeviceAngle(deviceAngleDeg);
  }
  const named = readNamedNumber(attributes, /^(angle|course|heading)$|device.?angle|gps.?angle/i);
  if (typeof named === "number" && Number.isFinite(named)) return wrapDeviceAngle(named);
  return null;
};

const detectSensor = (attributes: Record<string, unknown>, config: DeviceFuelConfig | null) => {
  for (const channel of LLS_CHANNELS) {
    const level = readTeltonikaIoNumber(attributes, channel.level);
    if (typeof level === "number") {
      return {
        family: "OMNICOMM",
        model: "OMNICOMM LLS 5",
        iface: `RS-232/RS-485 ${channel.name}`,
        raw: level,
        rawUnit: "LLS code",
        tempIo: channel.temp,
        analog: false
      };
    }
  }
  const frequency = readNamedNumber(attributes, /fuel.?frequency|dut|ble.?fuel/i);
  if (typeof frequency === "number") {
    return {
      family: "DUT-E",
      model: "DUT-E",
      iface: "Frequency / BLE / digital — confirm variant",
      raw: frequency,
      rawUnit: "native",
      tempIo: null,
      analog: false
    };
  }
  const analog = fuelInputVoltage(attributes, config?.analogInput);
  if (analog) {
    return {
      family: "Analogue",
      model: config?.analogInput ? `Fuel input ${config.analogInput}` : "Analogue fuel sender",
      iface: config?.analogInput ? `Configured fuel input ${config.analogInput}` : "Analogue voltage input",
      raw: analog.mv,
      rawUnit: "mV",
      tempIo: null,
      analog: true,
      voltage: analog
    };
  }
  return {
    family: "Unknown",
    model: "Confirm sensor",
    iface: "Not identified in this packet",
    raw: null as number | null,
    rawUnit: "",
    tempIo: null as number | null,
    analog: false
  };
};

const ignitionLabel = (input: FuelAnalysisSampleInput, attributes: Record<string, unknown>): string => {
  const text = String(input.ignition ?? "").trim();
  if (text) return /on|true|1/i.test(text) && !/off/i.test(text) ? "ON" : /off|false|0/i.test(text) ? "OFF" : text;
  const parsed = readTeltonikaIgnition(attributes);
  if (parsed === true) return "ON";
  if (parsed === false) return "OFF";
  return blank;
};

const STATE_WINDOW = 5;
const STUCK_SAMPLES = 10;

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const stdDev = (values: number[]): number | null => {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
};

const readAnalogMv = (attributes: Record<string, unknown>, ioId: number, adcKey: string): number | undefined => {
  const direct = readTeltonikaIoNumber(attributes, ioId);
  if (typeof direct === "number") return direct;
  const adc = parseFuelNumber(attributes[adcKey]);
  return typeof adc === "number" ? adc : undefined;
};

/** Channel of the configured fuel input, e.g. "IO9" -> 9. */
const configuredChannel = (analogInput: string | undefined): number | null => {
  if (!analogInput) return null;
  const jexl = mapTeltonikaAnalogInputFieldToJexl(analogInput);
  if (!jexl) return null;
  const channel = Number(jexl.replace(/^io/i, ""));
  return Number.isFinite(channel) ? channel : null;
};

const analogLabel = (channel: number): string => {
  if (channel === TELTONIKA_AVL_IO.ANALOG_INPUT_1) return "AI1";
  if (channel === TELTONIKA_AVL_IO.ANALOG_INPUT_2) return "AI2";
  return `IO${channel}`;
};

/** Native sensor channels have no configured analogue input, so the ID reflects the digital line. */
const sensorChannelLabel = (iface: string): string => {
  const match = iface.match(/LLS \d/);
  return match ? match[0] : blank;
};

export const fuelSampleFingerprint = (input: FuelAnalysisSampleInput): string => {
  const attributes = input.attributes ?? {};
  const sensor = detectSensor(attributes, input.fuelConfig ?? null);
  return [
    input.assetId,
    input.deviceTimeMs ?? "",
    input.packetId ?? "",
    sensor.raw ?? "",
    input.deviceAngleDeg ?? "",
    input.displayedFuel ?? "",
    input.sampleTick ? Math.floor(input.sampleTick / 30_000) : ""
  ].join("|");
};

export const analyzeFuelSample = (
  input: FuelAnalysisSampleInput,
  previous: FuelAnalysisRow | null
): FuelAnalysisRow => {
  const attributes = input.attributes ?? {};
  const config = input.fuelConfig ?? null;
  const sensor = detectSensor(attributes, config);
  const configuredVoltage = fuelInputVoltage(attributes, config?.analogInput);
  const analog = configuredVoltage ?? ("voltage" in sensor ? sensor.voltage : null);
  const liters = extractFuelLitersFromAttributes(attributes, { fuelReading: input.displayedFuel }, config);
  const displayedLiters = parseFuelNumber(input.displayedFuel);
  const currentL = typeof liters === "number" ? liters : typeof displayedLiters === "number" ? displayedLiters : null;
  const capacity = config && config.tankCapacity > 0 ? config.tankCapacity : null;
  const percent = currentL != null && capacity ? (currentL / capacity) * 100 : null;
  const temperature = readTemperatureC(attributes, sensor.tempIo);
  const deviceAngle = readDeviceAngleDeg(input.deviceAngleDeg, attributes);
  const threeAxisTilt = readThreeAxisTilt(attributes);
  const tiltStatus = threeAxisTilt?.tilted ? "YES" : "NO";
  const gsm = readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.GSM_SIGNAL);
  const supplyMv = readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.EXTERNAL_VOLTAGE);
  const deviceMs = input.deviceTimeMs;
  const receivedMs = input.receivedTimeMs;
  const previousL = previous?.currentLiters ?? null;
  const previousMs = previous?.sortMs ?? null;
  const deltaBaseMs = input.sampleTick ? receivedMs : deviceMs;
  const deltaSeconds =
    deltaBaseMs != null && previousMs != null && previous?.assetId === input.assetId
      ? Math.round((deltaBaseMs - previousMs) / 1000)
      : null;
  const deltaL =
    currentL != null && previousL != null && previous?.assetId === input.assetId
      ? currentL - previousL
      : null;
  const rate =
    deltaL != null && deltaSeconds != null && deltaSeconds > 0 ? (deltaL / deltaSeconds) * 60 : null;
  const moving = typeof input.speedKph === "number" && input.speedKph > 5;
  const spikeWhileMoving = moving && deltaL != null && Math.abs(deltaL) >= NOISE_MIN_L;
  const usedL =
    currentL != null && previousL != null && previous?.assetId === input.assetId
      ? previousL - currentL
      : null;
  const suppressedLevel = spikeWhileMoving && previousL != null ? previousL : currentL;
  const notes: string[] = [];

  let quality: FuelAnalysisQuality = "VALID";
  if (currentL == null && sensor.raw == null) quality = "MISSING";
  else if (input.live && deviceMs != null && Date.now() - deviceMs > 120_000) quality = "STALE";
  else if (percent != null && (percent < -1 || percent > 105)) quality = "SUSPECT";
  else if (spikeWhileMoving) quality = "SUSPECT";

  let event: FuelAnalysisEvent = "NORMAL";
  if (deltaL != null && deltaL >= RAISE_MIN_L) event = "RAISE";
  else if (deltaL != null && deltaL <= -SIPHON_MIN_L) event = "SIPHONING";
  else if (deltaL != null && Math.abs(deltaL) >= NOISE_MIN_L && rate != null && Math.abs(rate) >= 30) event = "NOISE";
  else if (deltaSeconds != null && deltaSeconds > GAP_SECONDS) event = "DATA_GAP";

  if (analog && config?.analogInput) notes.push(`Millivolts are taken from the configured fuel input ${config.analogInput}.`);
  else if (config?.analogInput) notes.push(`Configured fuel input ${config.analogInput} had no millivolt value in this packet.`);
  else if (!sensor.analog) notes.push("No fuel input is configured for this asset, so millivolts are left blank.");
  if (sensor.raw != null && currentL == null) notes.push("Raw sensor value is stored. Litres need this asset's calibration before the reading is usable.");
  if (temperature == null) notes.push("Temperature was not in this packet.");
  if (deviceAngle == null) notes.push("Tracking device angle was not in this sample. The angle cell is left blank, not zero.");
  else notes.push("Tank angle is the tracking device angle.");
  if (!threeAxisTilt) notes.push("Tilt status is NO because the 3-axis G-sensor lock was not in this packet.");
  else notes.push(
    threeAxisTilt.tilted
      ? `Tilt status is YES. The 3-axis G-sensor is ${threeAxisTilt.degrees.toFixed(1)}° off level.`
      : `Tilt status is NO. The 3-axis G-sensor is ${threeAxisTilt.degrees.toFixed(1)}° off level.`
  );
  if (deltaSeconds != null && deltaSeconds > 1) notes.push(`Actual gap since the previous sample is ${deltaSeconds}s. One-second rows are shown only when the tracker sends them.`);
  if (event === "RAISE") notes.push(moving ? "Fuel increase while moving. Confirm before treating it as a refill." : "Fuel increase meets the 5 L raise rule.");
  if (event === "SIPHONING") notes.push("Fuel decrease meets the 5 L rule. This is a suspected loss, not confirmed theft.");
  if (event === "NOISE") notes.push("Change is fast but below the raise/siphon threshold. Check sensor stability.");
  if (event === "DATA_GAP") notes.push("No sample arrived inside 30 seconds. The missing interval is not filled in.");
  if (spikeWhileMoving) notes.push("Moving-vehicle change is kept out of the suppressed fuel level.");
  if (typeof supplyMv === "number" && supplyMv > 0) notes.push(`Tracker supply ${supplyMv} mV.`);
  if (quality === "SUSPECT" && percent != null && percent > 105) notes.push("Level is above the configured tank capacity. Review calibration or the input channel.");

  const priorState = previous && previous.assetId === input.assetId ? previous.state : undefined;
  const recentLiters = [...(priorState?.recentLiters ?? []), ...(currentL != null ? [currentL] : [])].slice(-STATE_WINDOW);
  const recentRaw = [...(priorState?.recentRaw ?? []), sensor.raw ?? null].slice(-STUCK_SAMPLES);
  const medianL = median(recentLiters);
  const noise = stdDev(recentLiters);
  const noiseLimit = Math.max(1, (capacity ?? 100) * 0.01);

  const mvMin = config?.inputMvMin;
  const mvMax = config?.inputMvMax;
  const margin = typeof mvMin === "number" && typeof mvMax === "number" ? (mvMax - mvMin) * 0.05 : 0;
  const ignitionOn = ignitionLabel(input, attributes) === "ON";
  const stuck =
    moving &&
    recentRaw.length >= STUCK_SAMPLES &&
    recentRaw.every((value) => value != null && value === recentRaw[0]);
  let faultCode = sensor.raw == null ? "NO_DATA" : "NONE";
  if (config?.analogInput && !analog && !sensor.analog && sensor.raw == null) faultCode = "NO_SIGNAL";
  else if (analog && analog.mv === 0 && ignitionOn) faultCode = "OPEN_CIRCUIT_OR_ZERO";
  else if (analog && typeof mvMax === "number" && analog.mv > mvMax + margin) faultCode = "ABOVE_RANGE";
  else if (analog && typeof mvMin === "number" && analog.mv < mvMin - margin) faultCode = "BELOW_RANGE";
  else if (stuck) faultCode = "STUCK_SIGNAL";
  if (faultCode !== "NONE" && faultCode !== "NO_DATA") notes.push(`Sensor fault check: ${faultCode}.`);

  let signalQuality = "GOOD";
  if (quality === "MISSING") signalQuality = "MISSING";
  else if (quality === "STALE") signalQuality = "STALE";
  else if (quality === "SUSPECT" || (faultCode !== "NONE" && faultCode !== "NO_DATA")) signalQuality = "SUSPECT";
  else if (noise != null && noise > noiseLimit) signalQuality = "NOISY";

  const eventCandidate =
    event === "RAISE" ? "REFUEL_CANDIDATE" : event === "SIPHONING" ? "DRAIN_CANDIDATE" : blank;
  const filterReasons: string[] = [];
  if (spikeWhileMoving) filterReasons.push("Change while moving held at previous level");
  if (quality === "STALE") filterReasons.push("Sample older than 2 minutes");
  if (quality === "MISSING") filterReasons.push("No fuel value in packet");
  if (percent != null && (percent < -1 || percent > 105)) filterReasons.push("Outside tank range");
  if (event === "NOISE") filterReasons.push("Fast change below refuel/drain threshold");
  if (faultCode === "STUCK_SIGNAL") filterReasons.push("Unchanged signal while moving");

  const validNow = quality === "VALID" && currentL != null;
  const clockLabel = (ms: number | null) => {
    if (ms == null || !Number.isFinite(ms)) return blank;
    return input.formatWhen ? input.formatWhen(ms) : `${localDate(ms)} ${localTime(ms)}`;
  };
  const lastValidMs = validNow ? (deviceMs ?? receivedMs ?? null) : priorState?.lastValidMs ?? null;
  const lastValidLabel = validNow ? clockLabel(lastValidMs) : priorState?.lastValidLabel ?? blank;

  const channel = configuredChannel(config?.analogInput);
  const ai1 = readAnalogMv(attributes, TELTONIKA_AVL_IO.ANALOG_INPUT_1, "adc1");
  const ai2 = readAnalogMv(attributes, TELTONIKA_AVL_IO.ANALOG_INPUT_2, "adc2");
  const allAnalog = [
    typeof ai1 === "number" ? `AI1(IO9)=${ai1}` : "",
    typeof ai2 === "number" ? `AI2(IO6)=${ai2}` : ""
  ].filter(Boolean).join("; ");
  const rawAdc = readNamedNumber(attributes, /^(raw.?adc|adc.?raw)$/i);
  const analogInputId = channel != null ? analogLabel(channel) : sensorChannelLabel(sensor.iface);
  const avlId = channel != null ? String(channel) : sensor.family === "OMNICOMM"
    ? String(LLS_CHANNELS.find((c) => readTeltonikaIoNumber(attributes, c.level) != null)?.level ?? "")
    : "";
  const supplyText = typeof supplyMv === "number" && supplyMv > 0 ? String(supplyMv) : blank;
  const inputMode = sensor.analog || config?.analogInput
    ? `Analogue ${config?.analogInput ?? ""}${typeof mvMin === "number" && typeof mvMax === "number" ? ` ${mvMin}–${mvMax} mV` : " (range not set)"}`.trim()
    : sensor.family === "OMNICOMM" || sensor.family === "DUT-E"
      ? "Digital / frequency — decoded by tracker"
      : "Not configured";
  let mappingStatus = "NOT_BOUND";
  if (sensor.family === "OMNICOMM") mappingStatus = "DIGITAL_DECODED";
  else if (config?.analogInput) {
    if (!analog) mappingStatus = "BOUND_NO_SIGNAL";
    else if (faultCode === "ABOVE_RANGE" || faultCode === "BELOW_RANGE") mappingStatus = "BOUND_OUT_OF_RANGE";
    else mappingStatus = "BOUND_UNVERIFIED";
  }
  const sourceKey = avlId ? `io${avlId}` : blank;
  const packetSource = `${input.live ? "Live feed" : "Route history"} · VIVI/Teltonika AVL${sourceKey === blank ? "" : ` · ${sourceKey}`}`;

  const voltageSource = analog ? analog.source : "NOT_AVAILABLE";
  const clockOf = (ms: number | null) => {
    if (ms == null || !Number.isFinite(ms)) return { date: blank, time: blank, full: blank };
    const full = input.formatWhen ? input.formatWhen(ms) : `${localDate(ms)} ${localTime(ms)}`;
    const match = full.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)$/);
    if (!match) return { date: localDate(ms), time: localTime(ms), full };
    return { date: match[1], time: match[2], full };
  };
  const shown = clockOf(deviceMs ?? receivedMs);
  const deviceClock = clockOf(deviceMs);
  const receivedClock = clockOf(receivedMs);
  const uniqueId = `${input.assetId}:${deviceMs ?? receivedMs ?? "live"}:${sensor.raw ?? analog?.mv ?? "na"}${input.sampleTick ? `:${input.sampleTick}` : ""}`;
  const registrationLabel = String(input.registration ?? "").trim().toUpperCase();
  const id = registrationLabel ? `${registrationLabel}-${uniqueId}` : uniqueId;
  const cells: Record<string, string> = {
    recordId: id,
    registration: input.registration || blank,
    imei: input.imei || blank,
    sensorModel: sensor.model,
    sensorFamily: sensor.family,
    sensorInterface: sensor.iface,
    trackerModel: input.trackerModel || blank,
    date: shown.date,
    time: shown.time,
    deviceUtc: deviceClock.full === blank ? shown.full : deviceClock.full,
    receivedUtc: receivedClock.full,
    sequenceNo: input.packetId || blank,
    raw: sensor.raw == null ? blank : `${sensor.raw}${sensor.rawUnit ? ` ${sensor.rawUnit}` : ""}`,
    voltageMv: analog ? String(analog.mv) : blank,
    voltageSource,
    analogInputId: analogInputId || blank,
    avlId: avlId || blank,
    allAnalogInputs: allAnalog || blank,
    rawAdc: rawAdc == null ? blank : String(rawAdc),
    scaledInput: analog ? (analog.mv / 1000).toFixed(3) : blank,
    supplyVoltage: supplyText,
    inputMode,
    mappingStatus,
    packetSource,
    latitude: typeof input.latitude === "number" ? input.latitude.toFixed(6) : blank,
    longitude: typeof input.longitude === "number" ? input.longitude.toFixed(6) : blank,
    speed: typeof input.speedKph === "number" ? num(input.speedKph, 1) : blank,
    ignition: ignitionLabel(input, attributes),
    tankAngle: deviceAngle == null ? blank : num(deviceAngle, 1),
    tiltStatus,
    angleSource: deviceAngle == null ? "not_available" : "tracking device",
    calibrationId: config?.analogInput ? `binding:${config.analogInput}` : "none",
    quality,
    event,
    packetId: input.packetId || blank,
    signal: typeof gsm === "number" ? String(gsm) : blank,
    temperature: num(temperature, 1),
    capacity: capacity == null ? blank : num(capacity, 1),
    percent: num(percent, 1),
    previousL: num(previousL, 1),
    currentL: num(currentL, 1),
    deltaSeconds: deltaSeconds == null ? blank : String(deltaSeconds),
    deltaL: signedFuelChange(deltaL, 1),
    rate: num(rate, 1),
    filteredL: formatUsedFuel(usedL, 1),
    suppressedL: num(suppressedLevel, 1),
    medianL: num(medianL, 1),
    signalQuality,
    noiseScore: num(noise, 2),
    faultCode,
    eventCandidate,
    filterReason: filterReasons.join("; ") || blank,
    lastValid: lastValidLabel,
    notes: notes.join(" ")
  };

  return {
    id,
    assetId: input.assetId,
    site: input.site ?? "",
    sortMs: (input.sampleTick ? receivedMs : null) ?? deviceMs ?? receivedMs ?? 0,
    event,
    quality,
    currentLiters: currentL,
    cells,
    state: { recentLiters, recentRaw, lastValidMs, lastValidLabel }
  };
};

/** A chart hole this long is left open. Shorter tracker intervals still connect. */
const POPUP_GAP_MS = 15 * 60 * 1000;
/** A parked drop inside this window is a drain. A longer fall is fuel used. */
const POPUP_DRAIN_MAX_MS = 20 * 60 * 1000;

export type LiveFuelPopupModel = {
  raw: FuelTrendPoint[];
  line: FuelTrendPoint[];
  refills: FuelChangePoint[];
  drains: FuelChangePoint[];
  currentFuelL: number;
  fuelUsedL: number;
};

const roundFuel = (value: number): number => Math.round(value * 100) / 100;

const supplyIsLow = (attributes: Record<string, unknown>): boolean => {
  const raw = readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.EXTERNAL_VOLTAGE);
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return false;
  const volts = raw > 100 ? raw / 1000 : raw;
  return volts < 10;
};

const pushFuelStep = (
  list: FuelChangePoint[],
  fromLevel: number,
  toLevel: number,
  atMs: number,
  rising: boolean
) => {
  list.push({
    atMs,
    liters: toLevel,
    deltaLiters: toLevel - fromLevel,
    rising,
    fromLevel,
    toLevel
  });
};

/**
 * Litres, used fuel, refills, and drains for the live-tracking fuel popup.
 * Uses the same sample rules as the fuel analysis table: calibrated litres,
 * 5 L raise / 5 L siphon, moving spikes held, and 3-axis tilt held.
 * A dead analogue sender while ignition is off stays on the last good level.
 * Keep real route gaps visible, but connect across known ignition-off periods.
 */
export const buildLiveFuelPopupFromRoute = (
  points: TraccarRoutePoint[],
  fuelConfig?: DeviceFuelConfig | null
): LiveFuelPopupModel => {
  const empty: LiveFuelPopupModel = {
    raw: [],
    line: [],
    refills: [],
    drains: [],
    currentFuelL: 0,
    fuelUsedL: 0
  };
  const ordered = thinRoutePointsForFuel(points)
    .map((point) => ({ point, atMs: parseRoutePointTimestampMs(point) }))
    .filter((row) => Number.isFinite(row.atMs))
    .sort((left, right) => left.atMs - right.atMs);

  type AcceptedSample = {
    atMs: number;
    rawL: number;
    acceptedL: number;
    ignition: boolean | null;
    gapBefore: boolean;
  };
  const samples: AcceptedSample[] = [];
  let previousAccepted: number | null = null;
  let previousAt: number | null = null;
  let lastKnownIgnition: boolean | null = null;

  for (const row of ordered) {
    const liters = extractFuelLitersFromRoutePoint(row.point, fuelConfig);
    if (typeof liters !== "number" || !Number.isFinite(liters) || liters < 0) continue;
    const attributes = (row.point.attributes ?? {}) as Record<string, unknown>;
    const ignition = readRoutePointIgnition(row.point);
    const speedKnots = Number(row.point.speed);
    const speedKph = Number.isFinite(speedKnots) ? speedKnots * 1.852 : 0;
    const longGap = previousAt != null && row.atMs - previousAt > POPUP_GAP_MS;
    const gapBefore = longGap && lastKnownIgnition !== false && ignition !== false;
    let accepted = liters;
    if (previousAccepted != null) {
      const tilted = readThreeAxisTilt(attributes)?.tilted === true;
      const movingSpike = speedKph > 5 && Math.abs(liters - previousAccepted) >= NOISE_MIN_L;
      const nearEmpty = liters <= Math.max(3, previousAccepted * 0.15);
      const analogueCollapse =
        (ignition === false || supplyIsLow(attributes))
        && nearEmpty
        && previousAccepted - liters >= 15;
      if (tilted || movingSpike || analogueCollapse) accepted = previousAccepted;
    }
    samples.push({
      atMs: row.atMs,
      rawL: liters,
      acceptedL: accepted,
      ignition,
      gapBefore
    });
    previousAccepted = accepted;
    previousAt = row.atMs;
    if (ignition !== null) lastKnownIgnition = ignition;
  }

  if (!samples.length) return empty;

  const toPoint = (sample: AcceptedSample, liters: number): FuelTrendPoint => ({
    atMs: sample.atMs,
    liters,
    ...(sample.ignition === null ? {} : { ignition: sample.ignition }),
    ...(sample.gapBefore ? { gapBefore: true } : {})
  });
  const raw = samples.map((sample) => toPoint(sample, sample.rawL));

  // Rolling median inside each continuous segment: removes sensor jitter and
  // sloshing without blurring real refill or drain steps.
  const MEDIAN_HALF_WINDOW = 3;
  const smoothed: number[] = new Array(samples.length);
  let segmentStart = 0;
  for (let index = 0; index <= samples.length; index += 1) {
    if (index < samples.length && !(index > 0 && samples[index].gapBefore)) continue;
    for (let at = segmentStart; at < index; at += 1) {
      const radius = Math.min(MEDIAN_HALF_WINDOW, at - segmentStart, index - 1 - at);
      if (radius < MEDIAN_HALF_WINDOW) {
        smoothed[at] = samples[at].acceptedL;
        continue;
      }
      const from = at - radius;
      const to = at + radius;
      const window: number[] = [];
      for (let cursor = from; cursor <= to; cursor += 1) window.push(samples[cursor].acceptedL);
      window.sort((a, b) => a - b);
      smoothed[at] = window[Math.floor(window.length / 2)];
    }
    segmentStart = index;
  }
  for (let index = 0; index < samples.length; index += 1) samples[index].acceptedL = smoothed[index];
  const line = samples.map((sample) => toPoint(sample, sample.acceptedL));

  const refills: FuelChangePoint[] = [];
  const drains: FuelChangePoint[] = [];
  let used = 0;
  /** Reversals smaller than this are jitter, not a change of direction. */
  const DEADBAND_L = 0.6;

  const closeRun = (startIndex: number, endIndex: number) => {
    if (endIndex <= startIndex) return;
    const start = samples[startIndex];
    const end = samples[endIndex];
    const delta = end.acceptedL - start.acceptedL;
    const durationMs = end.atMs - start.atMs;
    if (delta >= RAISE_MIN_L) pushFuelStep(refills, start.acceptedL, end.acceptedL, end.atMs, true);
    else if (delta <= -SIPHON_MIN_L && durationMs <= POPUP_DRAIN_MAX_MS) {
      pushFuelStep(drains, start.acceptedL, end.acceptedL, end.atMs, false);
    } else if (delta < 0) used += -delta;
  };

  let runStart = 0;
  let extreme = 0;
  let runDir = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].gapBefore) {
      closeRun(runStart, extreme);
      const from = samples[index - 1].acceptedL;
      const to = samples[index].acceptedL;
      const jumped = to - from;
      const gapMs = samples[index].atMs - samples[index - 1].atMs;
      if (jumped >= RAISE_MIN_L) pushFuelStep(refills, from, to, samples[index].atMs, true);
      else if (jumped <= -SIPHON_MIN_L && gapMs <= POPUP_DRAIN_MAX_MS) {
        pushFuelStep(drains, from, to, samples[index].atMs, false);
      } else if (jumped < 0) used += -jumped;
      runStart = index;
      extreme = index;
      runDir = 0;
      continue;
    }
    const level = samples[index].acceptedL;
    if (runDir === 0) {
      const move = level - samples[runStart].acceptedL;
      if (Math.abs(move) >= DEADBAND_L) {
        runDir = move > 0 ? 1 : -1;
        extreme = index;
      }
      continue;
    }
    if ((level - samples[extreme].acceptedL) * runDir > 0) {
      extreme = index;
    } else if ((samples[extreme].acceptedL - level) * runDir >= DEADBAND_L) {
      closeRun(runStart, extreme);
      runStart = extreme;
      runDir = -runDir;
      extreme = index;
    }
  }
  closeRun(runStart, extreme);

  return {
    raw,
    line,
    refills,
    drains,
    currentFuelL: roundFuel(samples[samples.length - 1].acceptedL),
    fuelUsedL: roundFuel(used)
  };
};

export const buildFuelAnalysisRows = (samples: FuelAnalysisSampleInput[]): FuelAnalysisRow[] => {
  const ordered = [...samples].sort((a, b) => (a.deviceTimeMs ?? 0) - (b.deviceTimeMs ?? 0));
  const previous = new Map<string, FuelAnalysisRow>();
  const rows: FuelAnalysisRow[] = [];
  for (const sample of ordered) {
    const row = analyzeFuelSample(sample, previous.get(sample.assetId) ?? null);
    previous.set(sample.assetId, row);
    rows.push(row);
  }
  return rows;
};
