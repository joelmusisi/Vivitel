/**
 * Teltonika FMXXXX / Codec 8 (+8E/16) helpers from
 * `Protocals/FMXXXX Protocols v2_7.pdf`.
 *
 * Key protocol facts used for performance:
 * - AVL packets batch many records; ACK = record count (uint32 BE)
 * - Speed in GPS element is already km/h (0 = invalid / no fix)
 * - Invalid fix keeps last lat/lon/alt but forces angle/sats/speed to 0
 * - CRC-16 over AVL data array, polynomial 0xA001
 */

/** Codec IDs from FMXXXX / modern FMx. */
export const TELTONIKA_CODEC = {
  CODEC8: 0x08,
  CODEC8_EXTENDED: 0x8e,
  CODEC16: 0x10,
  SMS_CODEC4: 0x04
} as const;

/** Priority byte values (FMXXXX §1.4). */
export const TELTONIKA_PRIORITY = {
  LOW: 0,
  HIGH: 1,
  PANIC: 2,
  SECURITY: 3
} as const;

export type TeltonikaPriority = (typeof TELTONIKA_PRIORITY)[keyof typeof TELTONIKA_PRIORITY];

/**
 * Hot-path IO IDs (FMx / FMB family) — avoid loading the full CFG for common fields.
 * Values mirror Teltonika IO property IDs used by Traccar `io{N}` attributes.
 */
export const TELTONIKA_IO = {
  DIGITAL_INPUT_1: 1,
  DIGITAL_INPUT_2: 2,
  DIGITAL_INPUT_3: 3,
  ANALOG_INPUT_1: 9,
  ANALOG_INPUT_2: 6,
  ICCID: 11,
  FUEL_USED_GPS: 12,
  FUEL_RATE_GPS: 13,
  ECO_SCORE: 15,
  TOTAL_ODOMETER: 16,
  AXIS_X: 17,
  AXIS_Y: 18,
  AXIS_Z: 19,
  GSM_SIGNAL: 21,
  GPS_SPEED: 24,
  BLE_BATTERY_1: 25,
  /** Device fuel level (%) on many FMx — never confuse with ignition (239). */
  FUEL_LEVEL_PERCENT: 48,
  EXTERNAL_VOLTAGE: 66,
  BATTERY_VOLTAGE: 67,
  BATTERY_CURRENT: 68,
  GNSS_STATUS: 69,
  PDOP: 181,
  HDOP: 182,
  TRIP_ODOMETER: 199,
  SLEEP_MODE: 200,
  IGNITION: 239,
  MOVEMENT: 240,
  ACTIVE_GSM_OPERATOR: 241,
  GNSS_JAMMING: 249
} as const;

/** Traccar Position.attribute keys we promote from known Teltonika IO for faster analysis. */
export const TELTONIKA_IO_TO_TRACCAR_ATTR: Record<number, string> = {
  [TELTONIKA_IO.IGNITION]: "ignition",
  [TELTONIKA_IO.MOVEMENT]: "motion",
  [TELTONIKA_IO.EXTERNAL_VOLTAGE]: "power",
  [TELTONIKA_IO.BATTERY_VOLTAGE]: "battery",
  [TELTONIKA_IO.GSM_SIGNAL]: "rssi",
  [TELTONIKA_IO.TOTAL_ODOMETER]: "totalDistance",
  [TELTONIKA_IO.TRIP_ODOMETER]: "tripOdometer",
  [TELTONIKA_IO.PDOP]: "pdop",
  [TELTONIKA_IO.HDOP]: "hdop",
  [TELTONIKA_IO.GPS_SPEED]: "obdSpeed",
  [TELTONIKA_IO.ANALOG_INPUT_1]: "adc1",
  [TELTONIKA_IO.ANALOG_INPUT_2]: "adc2"
};

/**
 * CRC-16 (poly 0xA001, init 0) over AVL data array — FMXXXX §2.1.
 * Same algorithm family as Modbus/IBM CRC-16.
 */
export function teltonikaCrc16A001(data: Uint8Array | Buffer): number {
  let crc = 0;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 1) crc = (crc >>> 1) ^ 0xa001;
      else crc >>>= 1;
    }
  }
  return crc & 0xffff;
}

/** FMXXXX §1.5 note 1 — no fix when angle, satellites, and speed are all zero. */
export function isTeltonikaGpsFixValid(input: {
  angle?: number;
  satellites?: number;
  speedKph?: number;
}): boolean {
  const angle = Number(input.angle ?? 0);
  const satellites = Number(input.satellites ?? 0);
  const speedKph = Number(input.speedKph ?? 0);
  if (!Number.isFinite(angle) || !Number.isFinite(satellites) || !Number.isFinite(speedKph)) return false;
  return !(angle === 0 && satellites === 0 && speedKph === 0);
}

export function promoteTeltonikaIoToAttributes(
  ioById: Record<number, number | string | null | undefined>
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const [idStr, value] of Object.entries(ioById)) {
    const id = Number(idStr);
    if (!Number.isFinite(id) || value == null) continue;
    const key = TELTONIKA_IO_TO_TRACCAR_ATTR[id];
    if (!key) continue;
    if (key === "ignition" || key === "motion") {
      attrs[key] = Number(value) > 0;
    } else if (key === "power" || key === "battery") {
      // Protocol stores millivolts; expose volts for UI when clearly mV-scale.
      const n = Number(value);
      attrs[key] = Number.isFinite(n) && n >= 1000 ? n / 1000 : n;
      attrs[`${key}Mv`] = n;
    } else {
      attrs[key] = value;
    }
  }
  return attrs;
}

export function buildTeltonikaAck(recordCount: number): Buffer {
  const ack = Buffer.alloc(4);
  ack.writeUInt32BE(Math.max(0, Math.min(0xffffffff, Math.floor(recordCount))), 0);
  return ack;
}
