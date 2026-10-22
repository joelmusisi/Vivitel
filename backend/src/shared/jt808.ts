export function jt808CalcBcc(bytes: Buffer) {
  let bcc = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    bcc ^= bytes[i];
  }
  return bcc & 0xff;
}

export function jt808Unescape(bytes: Buffer) {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b === 0x7d && i + 1 < bytes.length) {
      const n = bytes[i + 1];
      if (n === 0x01) {
        out.push(0x7d);
        i += 1;
        continue;
      }
      if (n === 0x02) {
        out.push(0x7e);
        i += 1;
        continue;
      }
    }
    out.push(b);
  }
  return Buffer.from(out);
}

export function jt808Escape(bytes: Buffer) {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b === 0x7d) {
      out.push(0x7d, 0x01);
    } else if (b === 0x7e) {
      out.push(0x7d, 0x02);
    } else {
      out.push(b);
    }
  }
  return Buffer.from(out);
}

export function jt808ReadBcdDigits(bytes: Buffer) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .replace(/f+$/gi, "")
    .replace(/^0+/, "") || "0";
}

let jt808PlatformSerial = 1;

export function jt808NextPlatformSerial() {
  const next = jt808PlatformSerial & 0xffff;
  jt808PlatformSerial = (jt808PlatformSerial + 1) & 0xffff;
  if (jt808PlatformSerial === 0) jt808PlatformSerial = 1;
  return next;
}

export function buildJt808CommonAck(
  parsed: {
    msgId: number;
    msgSerial: number;
    msgProps: number;
    protocolVersion: number;
    hasVersionFlag: boolean;
    terminalIdBytes: Buffer;
  },
  result = 0x00
) {
  const body = Buffer.alloc(5);
  body.writeUInt16BE(parsed.msgSerial & 0xffff, 0);
  body.writeUInt16BE(parsed.msgId & 0xffff, 2);
  body.writeUInt8(result & 0xff, 4);

  const bodyLen = body.length & 0x03ff;
  const versionBit = parsed.hasVersionFlag ? 0x4000 : 0;
  const props = bodyLen | versionBit;

  const header = Buffer.alloc(parsed.hasVersionFlag ? (2 + 2 + 1 + 10 + 2) : (2 + 2 + 6 + 2));
  let pos = 0;
  header.writeUInt16BE(0x8001, pos);
  pos += 2;
  header.writeUInt16BE(props, pos);
  pos += 2;
  if (parsed.hasVersionFlag) {
    header.writeUInt8(parsed.protocolVersion & 0xff, pos);
    pos += 1;
    parsed.terminalIdBytes.copy(header, pos, 0, 10);
    pos += 10;
  } else {
    parsed.terminalIdBytes.copy(header, pos, 0, 6);
    pos += 6;
  }
  header.writeUInt16BE(jt808NextPlatformSerial(), pos);

  const bodyNoBcc = Buffer.concat([header, body]);
  const bcc = Buffer.from([jt808CalcBcc(bodyNoBcc)]);
  return Buffer.concat([Buffer.from([0x7e]), jt808Escape(Buffer.concat([bodyNoBcc, bcc])), Buffer.from([0x7e])]);
}

export function decodeJt808Location(body: Buffer) {
  if (body.length < 28) return null;
  const alarm = body.readUInt32BE(0);
  const status = body.readUInt32BE(4);
  let lat = body.readUInt32BE(8) / 1_000_000;
  let lon = body.readUInt32BE(12) / 1_000_000;
  const altitude = body.readUInt16BE(16);
  const speed = body.readUInt16BE(18) / 10;
  const heading = body.readUInt16BE(20);
  const yy = body.readUInt8(22);
  const mm = body.readUInt8(23);
  const dd = body.readUInt8(24);
  const hh = body.readUInt8(25);
  const mi = body.readUInt8(26);
  const ss = body.readUInt8(27);

  if ((status & (1 << 2)) !== 0) lat = -Math.abs(lat);
  if ((status & (1 << 3)) !== 0) lon = -Math.abs(lon);

  let satellites: number | undefined;
  let pos = 28;
  while (pos + 2 <= body.length) {
    const itemId = body.readUInt8(pos);
    const len = body.readUInt8(pos + 1);
    pos += 2;
    if (pos + len > body.length) break;
    const value = body.subarray(pos, pos + len);
    pos += len;
    if (itemId === 0x31 && len >= 1) satellites = value.readUInt8(0);
  }

  const timestamp = new Date(Date.UTC(2000 + yy, Math.max(0, mm - 1), dd, hh, mi, ss)).toISOString();
  return { alarm, status, lat, lon, altitude, speed, heading, satellites, timestamp };
}

export function parseJt808Frame(framePayload: Buffer) {
  const raw = jt808Unescape(framePayload);
  if (raw.length < 13) return null;
  const bodyWithoutBcc = raw.subarray(0, raw.length - 1);
  const bcc = raw[raw.length - 1];
  if (jt808CalcBcc(bodyWithoutBcc) !== bcc) return null;

  let pos = 0;
  const msgId = bodyWithoutBcc.readUInt16BE(pos);
  pos += 2;
  const msgProps = bodyWithoutBcc.readUInt16BE(pos);
  pos += 2;
  const bodyLen = msgProps & 0x03ff;
  const hasSubPackage = (msgProps & 0x2000) === 0x2000;
  const hasVersionFlag = (msgProps & 0x4000) === 0x4000;

  let protocolVersion = 0;
  let terminalIdBytes: Buffer;
  if (hasVersionFlag) {
    if (bodyWithoutBcc.length < pos + 1 + 10 + 2) return null;
    protocolVersion = bodyWithoutBcc.readUInt8(pos);
    pos += 1;
    terminalIdBytes = bodyWithoutBcc.subarray(pos, pos + 10);
    pos += 10;
  } else {
    if (bodyWithoutBcc.length < pos + 6 + 2) return null;
    terminalIdBytes = bodyWithoutBcc.subarray(pos, pos + 6);
    pos += 6;
  }

  const msgSerial = bodyWithoutBcc.readUInt16BE(pos);
  pos += 2;

  if (hasSubPackage) {
    if (bodyWithoutBcc.length < pos + 4) return null;
    pos += 4;
  }

  if (bodyWithoutBcc.length < pos + bodyLen) return null;
  const body = bodyWithoutBcc.subarray(pos, pos + bodyLen);

  return {
    msgId,
    msgProps,
    msgSerial,
    body,
    protocolVersion,
    hasVersionFlag,
    terminalIdBytes,
    terminalId: jt808ReadBcdDigits(terminalIdBytes)
  };
}
