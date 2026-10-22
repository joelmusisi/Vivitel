/**
 * SkyPatrol TT8750+ position report decoding helpers from
 * `Protocals/TT8750+AN004 - SkyPatrol Position Report Decoding Rev 1_0.pdf`.
 *
 * Binary position reports are mask-driven: only enabled bits appear, in bit order.
 * Use `parseTt8750ApiHeader` + `decodeTt8750BinaryPosition` for UDP ingest.
 */

export const TT8750_MSG_TYPE = {
  POSITION: 1,
  COUNTER: 2,
  VARIABLES: 3,
  GEOFENCE: 4
} as const;

/** IO GPA bitfield (AN004 example) — bit0 = Input1 … bit8 = Ignition. */
export const TT8750_IO_BITS = {
  INPUT_1: 0,
  INPUT_2: 1,
  OUTPUT_1: 2,
  MAIN_POWER: 3,
  OUTPUT_2: 4,
  OUTPUT_3: 5,
  GSM_LED: 6,
  GPS_LED: 7,
  IGNITION: 8
} as const;

export type Tt8750ApiHeader = {
  apiNumber: number;
  commandType: number;
  messageType: number;
  needAck: boolean;
  optionalHeaderSize: number;
  optionalHeader: Buffer;
  headerLength: number;
};

export function parseTt8750ApiHeader(buf: Buffer, offset = 0): Tt8750ApiHeader | null {
  if (buf.length < offset + 5) return null;
  const apiNumber = buf.readUInt16BE(offset);
  const commandType = buf.readUInt8(offset + 2);
  const msgByte = buf.readUInt8(offset + 3);
  const optionalHeaderSize = buf.readUInt8(offset + 4);
  const headerLength = 5 + optionalHeaderSize;
  if (buf.length < offset + headerLength) return null;
  return {
    apiNumber,
    commandType,
    messageType: (msgByte >> 4) & 0x0f,
    needAck: (msgByte & 0x0f) === 1,
    optionalHeaderSize,
    optionalHeader: buf.subarray(offset + 5, offset + headerLength),
    headerLength
  };
}

/**
 * Lat/Long conversion from AN004 §“Lat/Long Conversion”.
 * Binary coords are packed as signed 32-bit; negative values use two's complement.
 * Decimal form is ddmm.mmmm → degrees = dd + mm.mmmm/60.
 */
export function decodeTt8750Coordinate(raw: number): number {
  let unsigned = raw >>> 0;
  let negative = false;
  if (unsigned > 0x7fffffff) {
    negative = true;
    unsigned = (0xffffffff - unsigned + 1) >>> 0;
  }
  const text = String(unsigned).padStart(8, "0");
  // Keep last 6 digits as mm.mmmm * 10000, remainder as degrees.
  const minutesRaw = Number(text.slice(-6));
  const degrees = Number(text.slice(0, Math.max(0, text.length - 6)) || "0");
  const minutes = minutesRaw / 10_000;
  const value = degrees + minutes / 60;
  return negative ? -value : value;
}

export function decodeTt8750IoBits(ioRaw: number): {
  ignition: boolean;
  mainPower: boolean;
  input1: boolean;
  input2: boolean;
  bits: number;
} {
  const bits = ioRaw & 0xffff;
  return {
    bits,
    ignition: ((bits >> TT8750_IO_BITS.IGNITION) & 1) === 1,
    mainPower: ((bits >> TT8750_IO_BITS.MAIN_POWER) & 1) === 1,
    input1: ((bits >> TT8750_IO_BITS.INPUT_1) & 1) === 1,
    input2: ((bits >> TT8750_IO_BITS.INPUT_2) & 1) === 1
  };
}

export type Tt8750BinaryPosition = {
  deviceId?: string;
  io?: ReturnType<typeof decodeTt8750IoBits>;
  analog1Mv?: number;
  analog2Mv?: number;
  eventCode?: number;
  gpsDate?: string;
  gpsValid?: boolean;
  lat?: number;
  lng?: number;
  /** Velocity from device — protocol documents binary velocity in knots. */
  speedKnots?: number;
  heading?: number;
  gpsTime?: string;
  altitudeM?: number;
  satellites?: number;
  batteryPercent?: number;
  tripOdometerM?: number;
  odometerM?: number;
  batteryVoltageMv?: number;
  sequence?: number;
  consumed: number;
};

/**
 * Decode a common full-mask binary position body (AN004 worked example order).
 * When a custom mask is used, pass `mask` and only enabled fields are read.
 * Default mask = all bits set (0x1fffffff) matching the doc example.
 */
export function decodeTt8750BinaryPosition(
  body: Buffer,
  offset = 0,
  mask = 0x1fffffff
): Tt8750BinaryPosition {
  let pos = offset;
  const out: Tt8750BinaryPosition = { consumed: 0 };
  const has = (bit: number) => ((mask >>> bit) & 1) === 1;
  const need = (n: number) => {
    if (pos + n > body.length) throw new Error("TT8750 truncated position body");
  };

  // Bit1 parm1 (4 bytes) — skipped unless present; often event/status precursor in examples.
  if (has(1)) {
    need(4);
    pos += 4;
  }
  // Bit2 MDMID / device id — 8 bytes binary (spaces stripped ASCII digits in examples).
  if (has(2) || has(23)) {
    const len = has(23) ? 8 : 8;
    need(len);
    const raw = body.subarray(pos, pos + len).toString("ascii").replace(/\0/g, "").trim();
    out.deviceId = raw.replace(/\s+/g, "") || undefined;
    pos += len;
  }
  if (has(3)) {
    need(2);
    out.io = decodeTt8750IoBits(body.readUInt16BE(pos));
    pos += 2;
  }
  if (has(4)) {
    need(2);
    out.analog1Mv = body.readUInt16BE(pos);
    pos += 2;
  }
  if (has(5)) {
    need(2);
    out.analog2Mv = body.readUInt16BE(pos);
    pos += 2;
  }
  if (has(7)) {
    need(1);
    out.eventCode = body.readUInt8(pos);
    pos += 1;
  }
  if (has(8)) {
    need(3);
    const yy = body.readUInt8(pos);
    const mm = body.readUInt8(pos + 1);
    const dd = body.readUInt8(pos + 2);
    out.gpsDate = `20${String(yy).padStart(2, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    pos += 3;
  }
  if (has(9)) {
    need(1);
    out.gpsValid = body.readUInt8(pos) === 1;
    pos += 1;
  }
  if (has(10)) {
    need(4);
    out.lat = decodeTt8750Coordinate(body.readInt32BE(pos));
    pos += 4;
  }
  if (has(11)) {
    need(4);
    out.lng = decodeTt8750Coordinate(body.readInt32BE(pos));
    pos += 4;
  }
  if (has(12)) {
    need(2);
    out.speedKnots = body.readUInt16BE(pos);
    pos += 2;
  }
  if (has(13)) {
    need(2);
    out.heading = body.readUInt16BE(pos);
    pos += 2;
  }
  if (has(14)) {
    need(3);
    const hh = body.readUInt8(pos);
    const mi = body.readUInt8(pos + 1);
    const ss = body.readUInt8(pos + 2);
    out.gpsTime = `${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    pos += 3;
  }
  if (has(15)) {
    need(3);
    // 3-byte altitude (meters) — big-endian packed in high 24 bits of a 32-bit read.
    out.altitudeM = (body.readUInt8(pos) << 16) | (body.readUInt8(pos + 1) << 8) | body.readUInt8(pos + 2);
    pos += 3;
  }
  if (has(16)) {
    need(1);
    out.satellites = body.readUInt8(pos);
    pos += 1;
  }
  if (has(17) || has(24)) {
    need(2);
    out.batteryPercent = body.readUInt16BE(pos);
    pos += 2;
  }
  if (has(20)) {
    need(4);
    out.tripOdometerM = body.readUInt32BE(pos);
    pos += 4;
  }
  if (has(21)) {
    need(4);
    out.odometerM = body.readUInt32BE(pos);
    pos += 4;
  }
  if (has(22)) {
    need(6);
    pos += 6; // RTC time — stored as opaque skip for now
  }
  // Battery voltage (example field after RTC) — present when bit24-style voltage included in worked example.
  // Worked example places main battery voltage after overspeed/cell; keep optional trailing reads conservative.
  if (has(28)) {
    need(2);
    out.sequence = body.readUInt16BE(pos);
    pos += 2;
  }

  out.consumed = pos - offset;
  return out;
}

/** Normalize SkyPatrol fields into the Vivi telemetry body shape. */
export function tt8750ToTelemetryData(decoded: Tt8750BinaryPosition, imei?: string): Record<string, unknown> {
  const speedKph =
    typeof decoded.speedKnots === "number" && Number.isFinite(decoded.speedKnots)
      ? Number((decoded.speedKnots * 1.852).toFixed(2))
      : undefined;
  return {
    ...(imei || decoded.deviceId ? { imei: String(imei || decoded.deviceId || "").trim() } : {}),
    ...(typeof decoded.lat === "number" ? { lat: decoded.lat } : {}),
    ...(typeof decoded.lng === "number" ? { lon: decoded.lng, lng: decoded.lng } : {}),
    ...(typeof speedKph === "number" ? { speed: speedKph } : {}),
    ...(typeof decoded.heading === "number" ? { heading: decoded.heading } : {}),
    ...(typeof decoded.altitudeM === "number" ? { altitude: decoded.altitudeM } : {}),
    ...(typeof decoded.satellites === "number" ? { satellites: decoded.satellites } : {}),
    ...(typeof decoded.gpsValid === "boolean" ? { valid: decoded.gpsValid } : {}),
    ...(typeof decoded.io?.ignition === "boolean" ? { ignition: decoded.io.ignition } : {}),
    ...(typeof decoded.batteryPercent === "number" ? { batteryLevel: decoded.batteryPercent } : {}),
    ...(typeof decoded.odometerM === "number" ? { odometer: decoded.odometerM } : {}),
    ...(typeof decoded.tripOdometerM === "number" ? { tripOdometer: decoded.tripOdometerM } : {}),
    ...(typeof decoded.analog1Mv === "number" ? { adc1: decoded.analog1Mv } : {}),
    ...(typeof decoded.analog2Mv === "number" ? { adc2: decoded.analog2Mv } : {}),
    provider: "skypatrol-tt8750"
  };
}
