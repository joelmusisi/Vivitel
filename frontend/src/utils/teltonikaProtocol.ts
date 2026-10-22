/**
 * Teltonika FMx AVL property IDs used at runtime (Codec 8 / 8E).
 * Mirrors `backend/src/shared/protocols/teltonikaFmxxxx.ts` + FMXXXX / FMB docs.
 * Do not confuse with Configurator parameter IDs (8000+ in .cfg exports).
 */

export const TELTONIKA_AVL_IO = {
  DIGITAL_INPUT_1: 1,
  DIGITAL_INPUT_2: 2,
  DIGITAL_INPUT_3: 3,
  /** Analogue input 2 (mV) — often wired as fuel sender on FMB. */
  ANALOG_INPUT_2: 6,
  /** Analogue input 1 (mV). */
  ANALOG_INPUT_1: 9,
  GSM_SIGNAL: 21,
  /** Fuel Used GPS (cumulative liters) — not tank level. */
  FUEL_USED_GPS: 12,
  /** Fuel Rate GPS (L/h) — not tank level. */
  FUEL_RATE_GPS: 13,
  TOTAL_ODOMETER: 16,
  /** Accelerometer axes, milli-g. Used only as a tilt estimate when a tank angle is not reported. */
  AXIS_X: 17,
  AXIS_Y: 18,
  AXIS_Z: 19,
  GPS_SPEED: 24,
  /** BLE Temperature #1. Scale depends on firmware; do not assume a multiplier. */
  BLE_TEMPERATURE_1: 25,
  /** Device fuel level (%). Prefer converting with tank capacity when present. */
  FUEL_LEVEL_PERCENT: 48,
  EXTERNAL_VOLTAGE: 66,
  BATTERY_VOLTAGE: 67,
  /** Omnicomm LLS via RS-232/RS-485. Level is a native code (kvants or litres), not millivolts. */
  LLS_1_FUEL_LEVEL: 201,
  LLS_1_TEMPERATURE: 202,
  LLS_2_FUEL_LEVEL: 203,
  LLS_2_TEMPERATURE: 204,
  LLS_3_FUEL_LEVEL: 210,
  LLS_3_TEMPERATURE: 211,
  LLS_4_FUEL_LEVEL: 212,
  LLS_4_TEMPERATURE: 213,
  LLS_5_FUEL_LEVEL: 214,
  LLS_5_TEMPERATURE: 215,
  IGNITION: 239,
  MOVEMENT: 240,
  TRIP_ODOMETER: 199
} as const;

/** Attribute keys that must never be treated as tank litres. */
export const TELTONIKA_NON_FUEL_IO_ATTRS = new Set([
  `io${TELTONIKA_AVL_IO.IGNITION}`,
  `io_${TELTONIKA_AVL_IO.IGNITION}`,
  `io${TELTONIKA_AVL_IO.MOVEMENT}`,
  `io_${TELTONIKA_AVL_IO.MOVEMENT}`,
  `io${TELTONIKA_AVL_IO.GSM_SIGNAL}`,
  `io${TELTONIKA_AVL_IO.EXTERNAL_VOLTAGE}`,
  `io${TELTONIKA_AVL_IO.BATTERY_VOLTAGE}`,
  `io${TELTONIKA_AVL_IO.DIGITAL_INPUT_1}`,
  `io${TELTONIKA_AVL_IO.DIGITAL_INPUT_2}`,
  `io${TELTONIKA_AVL_IO.DIGITAL_INPUT_3}`
]);

export function readTeltonikaIoNumber(
  attributes: Record<string, unknown> | null | undefined,
  ioId: number
): number | undefined {
  if (!attributes || typeof attributes !== "object") return undefined;
  const candidates = [
    attributes[`io${ioId}`],
    attributes[`io_${ioId}`],
    attributes[`IO${ioId}`],
    attributes[String(ioId)]
  ];
  const nested = attributes.io;
  if (nested && typeof nested === "object") {
    const io = nested as Record<string, unknown>;
    candidates.push(io[`io${ioId}`], io[String(ioId)], io[`IO${ioId}`]);
  }
  for (const raw of candidates) {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    const text = String(raw ?? "").trim();
    if (!text) continue;
    const n = Number(text);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function readTeltonikaIgnition(
  attributes: Record<string, unknown> | null | undefined
): boolean | undefined {
  if (!attributes || typeof attributes !== "object") return undefined;
  const direct = attributes.ignition ?? attributes.Ignition;
  if (typeof direct === "boolean") return direct;
  if (direct === 1 || direct === "1" || direct === "true" || direct === "on") return true;
  if (direct === 0 || direct === "0" || direct === "false" || direct === "off") return false;
  const io239 = readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.IGNITION);
  if (typeof io239 === "number") return io239 > 0;
  return undefined;
}

export function readTeltonikaMotion(
  attributes: Record<string, unknown> | null | undefined
): boolean | undefined {
  if (!attributes || typeof attributes !== "object") return undefined;
  const direct = attributes.motion ?? attributes.Motion;
  if (typeof direct === "boolean") return direct;
  if (direct === 1 || direct === "1" || direct === "true") return true;
  if (direct === 0 || direct === "0" || direct === "false") return false;
  const io240 = readTeltonikaIoNumber(attributes, TELTONIKA_AVL_IO.MOVEMENT);
  if (typeof io240 === "number") return io240 > 0;
  return undefined;
}
