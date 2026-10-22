import net from "net";
import { parseJt808Frame, buildJt808CommonAck, decodeJt808Location } from "../../../shared/jt808";
import {
  buildTeltonikaAck,
  isTeltonikaGpsFixValid,
  promoteTeltonikaIoToAttributes,
  teltonikaCrc16A001
} from "../../../shared/protocols/teltonikaFmxxxx";

interface TcpEvent {
  at: string;
  event: string;
  port: number;
  remote?: string;
  imei?: string;
  detail?: string;
}

interface TeltonikaTcpDiagnostics {
  listeners: number[];
  opened: number;
  closed: number;
  closedWithError: number;
  parserFallbackAcks: number;
  parserDecodeFailures: number;
  activeByPort: Record<number, number>;
}

interface ConcoxTcpDiagnostics {
  opened: number;
  closed: number;
  parseFailures: number;
  activeConnections: number;
}

interface QueclinkTcpDiagnostics {
  opened: number;
  closed: number;
  parseFailures: number;
  activeConnections: number;
}

interface Jt808TcpDiagnostics {
  frames: number;
  badFrames: number;
  acksSent: number;
  locations: number;
  lastByImei: Record<string, {
    at: string;
    port: number;
    remote?: string;
    msgId?: number;
    lat?: number;
    lon?: number;
    speed?: number;
    heading?: number;
    timestamp?: string;
  }>;
}

interface QueclinkTelemetryMessage {
  imei: string;
  messageType: string;
  lat: number;
  lon: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
  raw: string;
}

interface CreateTelemetryTcpIngestorsDeps {
  teltonikaPort: number;
  teltonikaDuplicatePorts: number[];
  teltonikaDefaultTenant: string;
  concoxPort: number;
  concoxDefaultTenant: string;
  queclinkPort: number;
  queclinkDefaultTenant: string;
  jt808DefaultTenant: string;
  findTenantForImeiWithDefault: (imei: string, preferredDefaultTenant?: string) => string;
  findTenantForImei: (imei: string) => string;
  parseQueclinkTextMessage: (rawLine: string) => QueclinkTelemetryMessage | null;
  storeTelemetryEventForTenant: (tenant: string, body: any) => { ok: boolean; stored?: boolean };
  forwardTelemetryToWorker: (body: Record<string, unknown>, tenant: string) => void;
  teltonikaTcpDiagnostics: TeltonikaTcpDiagnostics;
  concoxTcpDiagnostics: ConcoxTcpDiagnostics;
  queclinkTcpDiagnostics: QueclinkTcpDiagnostics;
  jt808Diagnostics: Jt808TcpDiagnostics;
  pushTeltonikaTcpEvent: (evt: TcpEvent) => void;
  pushConcoxTcpEvent: (evt: TcpEvent) => void;
  pushQueclinkTcpEvent: (evt: TcpEvent) => void;
  pushJt808Event: (evt: TcpEvent) => void;
}

type TeltonikaAvlRecord = {
  timestampMs: number;
  priority: number;
  codecId: number;
  eventIoId?: number;
  generationType?: number;
  gps: {
    lat: number;
    lon: number;
    altitude: number;
    angle: number;
    satellites: number;
    speedKph: number;
    /** FMXXXX §1.5 note 1 — false when angle/sats/speed are all 0 (last-fix coords). */
    valid: boolean;
  };
  ioById: Record<number, number | string | null>;
};

const isTeltonikaNullSentinel = (value: unknown) => {
  if (typeof value !== "number") return false;
  return value === 32767 || value === 65535 || value === 2147483647 || value === 4294967295;
};

function readConcoxImeiFromBcd(bytes: Buffer) {
  if (!bytes.length) return "";
  const digits = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .replace(/^0+/, "")
    .replace(/f+$/gi, "");
  return /^\d{14,17}$/.test(digits) ? digits : "";
}

function crc16X25(data: Buffer) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 1) crc = (crc >>> 1) ^ 0x8408;
      else crc >>>= 1;
    }
  }
  crc ^= 0xffff;
  return crc & 0xffff;
}

function buildConcoxAck(protocol: number, serial: Buffer) {
  const len = 0x05;
  const bodyNoCrc = Buffer.concat([Buffer.from([len, protocol]), serial.subarray(0, 2)]);
  const crc = crc16X25(bodyNoCrc);
  const out = Buffer.alloc(2 + bodyNoCrc.length + 2 + 2);
  out.writeUInt8(0x78, 0);
  out.writeUInt8(0x78, 1);
  bodyNoCrc.copy(out, 2);
  out.writeUInt16BE(crc, 2 + bodyNoCrc.length);
  out.writeUInt8(0x0d, out.length - 2);
  out.writeUInt8(0x0a, out.length - 1);
  return out;
}

function decodeConcoxGpsInfo(info: Buffer) {
  if (info.length < 18) return null;
  const yy = info.readUInt8(0);
  const mm = info.readUInt8(1);
  const dd = info.readUInt8(2);
  const hh = info.readUInt8(3);
  const mi = info.readUInt8(4);
  const ss = info.readUInt8(5);
  const sats = Number(info.readUInt8(6) & 0x0f);
  const latRaw = info.readUInt32BE(7);
  const lonRaw = info.readUInt32BE(11);
  const speed = info.readUInt8(15);
  const courseStatus = info.readUInt16BE(16);
  const west = (courseStatus & 0x0400) === 0x0400;
  const south = (courseStatus & 0x0800) === 0x0800;
  const heading = Number(courseStatus & 0x03ff);
  const latAbs = latRaw / 1_800_000;
  const lonAbs = lonRaw / 1_800_000;

  const timestamp = new Date(Date.UTC(2000 + yy, Math.max(0, mm - 1), dd, hh, mi, ss)).toISOString();
  return {
    lat: south ? -latAbs : latAbs,
    lon: west ? -lonAbs : lonAbs,
    speed,
    heading,
    satellites: sats,
    timestamp
  };
}

function decodeTeltonikaAvlPayload(data: Buffer): { codecId: number; records: TeltonikaAvlRecord[] } {
  let pos = 0;
  const readU8 = () => data.readUInt8(pos++);
  const readI16 = () => {
    const value = data.readInt16BE(pos);
    pos += 2;
    return value;
  };
  const readU16 = () => {
    const value = data.readUInt16BE(pos);
    pos += 2;
    return value;
  };
  const readI32 = () => {
    const value = data.readInt32BE(pos);
    pos += 4;
    return value;
  };
  const readU32 = () => {
    const value = data.readUInt32BE(pos);
    pos += 4;
    return value;
  };
  const readU64 = () => {
    const hi = readU32();
    const lo = readU32();
    return hi * 2 ** 32 + lo;
  };
  const readBytes = (count: number) => {
    const bytes = data.subarray(pos, pos + count);
    pos += count;
    return bytes;
  };

  const codecId = readU8();
  const count = readU8();
  const records: TeltonikaAvlRecord[] = [];
  const is8e = codecId === 0x8e;
  const is16 = codecId === 0x10;

  for (let i = 0; i < count; i += 1) {
    const timestampMs = readU64();
    const priority = readU8();
    const lonRaw = readI32();
    const latRaw = readI32();
    const altitude = readI16();
    const angle = readU16();
    const satellites = readU8();
    const speedKph = readU16();

    const ioById: Record<number, number | string | null> = {};
    let eventIoId: number | undefined;
    let generationType: number | undefined;

    if (is16) {
      eventIoId = readU16();
      generationType = readU8();
      readU8();
      const readGroup = (size: 1 | 2 | 4 | 8) => {
        const groupCount = readU8();
        for (let k = 0; k < groupCount; k += 1) {
          const id = readU16();
          let value: number;
          if (size === 1) value = readU8();
          else if (size === 2) value = readU16();
          else if (size === 4) value = readU32();
          else value = readU64();
          ioById[id] = isTeltonikaNullSentinel(value) ? null : value;
        }
      };
      readGroup(1);
      readGroup(2);
      readGroup(4);
      readGroup(8);
    } else if (!is8e) {
      readU8();
      readU8();
      const readGroup = (size: 1 | 2 | 4 | 8) => {
        const groupCount = readU8();
        for (let k = 0; k < groupCount; k += 1) {
          const id = readU8();
          let value: number;
          if (size === 1) value = readU8();
          else if (size === 2) value = readU16();
          else if (size === 4) value = readU32();
          else value = readU64();
          ioById[id] = isTeltonikaNullSentinel(value) ? null : value;
        }
      };
      readGroup(1);
      readGroup(2);
      readGroup(4);
      readGroup(8);
    } else {
      readU16();
      readU16();
      const readGroup = (size: 1 | 2 | 4 | 8) => {
        const groupCount = readU16();
        for (let k = 0; k < groupCount; k += 1) {
          const id = readU16();
          let value: number;
          if (size === 1) value = readU8();
          else if (size === 2) value = readU16();
          else if (size === 4) value = readU32();
          else value = readU64();
          ioById[id] = isTeltonikaNullSentinel(value) ? null : value;
        }
      };
      readGroup(1);
      readGroup(2);
      readGroup(4);
      readGroup(8);

      const variableCount = readU16();
      for (let k = 0; k < variableCount; k += 1) {
        const id = readU16();
        const len = readU16();
        const bytes = readBytes(len);
        ioById[id] = bytes.toString("hex");
      }
    }

    records.push({
      timestampMs,
      priority,
      codecId,
      ...(typeof eventIoId === "number" ? { eventIoId } : {}),
      ...(typeof generationType === "number" ? { generationType } : {}),
      gps: {
        lat: latRaw / 10_000_000,
        lon: lonRaw / 10_000_000,
        altitude,
        angle,
        satellites,
        speedKph,
        valid: isTeltonikaGpsFixValid({ angle, satellites, speedKph })
      },
      ioById
    });
  }

  readU8();
  return { codecId, records };
}

export function createTelemetryTcpIngestors(deps: CreateTelemetryTcpIngestorsDeps) {
  const {
    teltonikaPort,
    teltonikaDuplicatePorts,
    teltonikaDefaultTenant,
    concoxPort,
    concoxDefaultTenant,
    queclinkPort,
    queclinkDefaultTenant,
    jt808DefaultTenant,
    findTenantForImeiWithDefault,
    findTenantForImei,
    parseQueclinkTextMessage,
    storeTelemetryEventForTenant,
    forwardTelemetryToWorker,
    teltonikaTcpDiagnostics,
    concoxTcpDiagnostics,
    queclinkTcpDiagnostics,
    jt808Diagnostics,
    pushTeltonikaTcpEvent,
    pushConcoxTcpEvent,
    pushQueclinkTcpEvent,
    pushJt808Event,
  } = deps;

  function startTeltonikaTcpIngest() {
    const ports = Array.from(new Set([teltonikaPort, ...teltonikaDuplicatePorts].filter((port) => port > 0)));
    if (!ports.length) return;

    const createListener = (port: number, label: string) => {
      teltonikaTcpDiagnostics.activeByPort[port] = teltonikaTcpDiagnostics.activeByPort[port] ?? 0;
      const server = net.createServer((socket) => {
        socket.setNoDelay(true);
        socket.setKeepAlive(true, 15_000);
        socket.setTimeout(0);
        const remote = `${socket.remoteAddress ?? "unknown"}:${socket.remotePort ?? "?"}`;
        console.log(`Teltonika ${label}:${port} connection opened from ${remote}`);
        teltonikaTcpDiagnostics.opened += 1;
        teltonikaTcpDiagnostics.activeByPort[port] = (teltonikaTcpDiagnostics.activeByPort[port] ?? 0) + 1;
        pushTeltonikaTcpEvent({ at: new Date().toISOString(), event: "open", port, remote });
        let buf = Buffer.alloc(0);
        let imei = "";
        let jt808Mode = false;

        const tryParse = () => {
          while (true) {
            if (jt808Mode || (buf.length >= 1 && buf[0] === 0x7e)) {
              jt808Mode = true;
              const start = buf.indexOf(0x7e);
              if (start < 0) {
                if (buf.length > 4096) buf = Buffer.alloc(0);
                return;
              }
              if (start > 0) buf = buf.subarray(start);
              const end = buf.indexOf(0x7e, 1);
              if (end < 0) return;
              const payload = buf.subarray(1, end);
              buf = buf.subarray(end + 1);
              if (!payload.length) continue;

              const parsed = parseJt808Frame(payload);
              if (!parsed) {
                jt808Diagnostics.badFrames += 1;
                pushTeltonikaTcpEvent({ at: new Date().toISOString(), event: "jt808_bad_frame", port, remote });
                pushJt808Event({ at: new Date().toISOString(), event: "bad_frame", port, remote });
                continue;
              }
              jt808Diagnostics.frames += 1;

              if (!imei) {
                imei = String(parsed.terminalId ?? "").trim();
                pushTeltonikaTcpEvent({ at: new Date().toISOString(), event: "jt808_login", port, remote, imei: imei || undefined, detail: `msg=0x${parsed.msgId.toString(16)}` });
                pushJt808Event({ at: new Date().toISOString(), event: "login", port, remote, imei: imei || undefined, detail: `msg=0x${parsed.msgId.toString(16)}` });
              }

              if (parsed.msgId === 0x0200) {
                const location = decodeJt808Location(parsed.body);
                if (location) {
                  jt808Diagnostics.locations += 1;
                  const tenant = findTenantForImeiWithDefault(imei, jt808DefaultTenant);
                  const body: any = {
                    data: {
                      imei,
                      lat: location.lat,
                      lon: location.lon,
                      speed: location.speed,
                      heading: location.heading,
                      satellites: typeof location.satellites === "number" ? location.satellites : undefined,
                      altitude: location.altitude,
                      timestamp: location.timestamp,
                      provider: "jt808",
                      messageId: parsed.msgId,
                      alarm: location.alarm,
                      status: location.status
                    }
                  };
                  const stored = storeTelemetryEventForTenant(tenant, body);
                  if (stored.ok && stored.stored !== false) {
                    forwardTelemetryToWorker(body, tenant);
                  }
                  pushTeltonikaTcpEvent({ at: new Date().toISOString(), event: "jt808_location", port, remote, imei: imei || undefined });
                  pushJt808Event({ at: new Date().toISOString(), event: "location", port, remote, imei: imei || undefined });
                  if (imei) {
                    jt808Diagnostics.lastByImei[imei] = {
                      at: new Date().toISOString(),
                      port,
                      remote,
                      msgId: parsed.msgId,
                      lat: location.lat,
                      lon: location.lon,
                      speed: location.speed,
                      heading: location.heading,
                      timestamp: location.timestamp
                    };
                  }
                }
              }

              try {
                socket.write(buildJt808CommonAck(parsed, 0x00));
                jt808Diagnostics.acksSent += 1;
              } catch {
                // ignore socket races
              }
              continue;
            }

            if (!imei) {
              if (buf.length >= 2) {
                const lenBe = buf.readUInt16BE(0);
                const lenLe = buf.readUInt16LE(0);
                const candidateLens = Array.from(new Set([lenBe, lenLe])).filter((len) => len > 0 && len <= 32);
                for (const len of candidateLens) {
                  if (buf.length < 2 + len) return;
                  const raw = buf.subarray(2, 2 + len).toString("ascii");
                  const clean = raw.replace(/\0/g, "").trim();
                  if (/^\d{14,17}$/.test(clean)) {
                    imei = clean;
                    buf = buf.subarray(2 + len);
                    socket.write(Buffer.from([0x01]));
                    pushTeltonikaTcpEvent({ at: new Date().toISOString(), event: "imei_login", port, remote, imei });
                    continue;
                  }
                }
              }

              if (buf.length >= 14) {
                const probe = buf.toString("ascii", 0, Math.min(buf.length, 32));
                const match = probe.match(/^(\d{14,17})(?:\r\n|\n|\0)?/);
                if (match) {
                  imei = String(match[1] ?? "").trim();
                  const consumed = match[0]?.length ?? imei.length;
                  buf = buf.subarray(consumed);
                  socket.write(Buffer.from([0x01]));
                  pushTeltonikaTcpEvent({ at: new Date().toISOString(), event: "imei_login_fallback", port, remote, imei });
                  continue;
                }
              }

              if (buf.length > 64) {
                buf = buf.subarray(1);
                continue;
              }
              const first = buf[0];
              if (typeof first === "number" && (first < 0x30 || first > 0x39) && buf.length >= 4) {
                buf = buf.subarray(1);
                continue;
              }
              return;
            }

            if (buf.length < 8) return;
            const preamble = buf.readUInt32BE(0);
            const dataLen = buf.readUInt32BE(4);
            if (preamble !== 0) {
              buf = buf.subarray(1);
              continue;
            }
            const total = 8 + dataLen + 4;
            if (buf.length < total) return;
            const data = buf.subarray(8, 8 + dataLen);
            // FMXXXX §2.1: 4-byte CRC trailer is CRC-16 (poly 0xA001) over AVL data, little-endian.
            const crcTrailer = buf.readUInt32LE(8 + dataLen) & 0xffff;
            const crcExpected = teltonikaCrc16A001(data);
            buf = buf.subarray(total);

            if (crcTrailer !== crcExpected) {
              teltonikaTcpDiagnostics.parserDecodeFailures += 1;
              pushTeltonikaTcpEvent({
                at: new Date().toISOString(),
                event: "crc_mismatch",
                port,
                remote,
                imei: imei || undefined,
                detail: `got=${crcTrailer} expected=${crcExpected} len=${dataLen}`
              });
              // Still ACK 0 so the device does not flood retries of a corrupt frame.
              socket.write(buildTeltonikaAck(0));
              continue;
            }

            try {
              const decoded = decodeTeltonikaAvlPayload(data);
              const tenant = findTenantForImei(imei) || teltonikaDefaultTenant;
              let storedCount = 0;

              for (const record of decoded.records) {
                const promoted = promoteTeltonikaIoToAttributes(record.ioById);
                const body: any = {
                  data: {
                    imei,
                    lat: record.gps.lat,
                    lon: record.gps.lon,
                    speed: record.gps.speedKph, // FMXXXX GPS speed is already km/h
                    speedUnit: "kph",
                    heading: record.gps.angle,
                    satellites: record.gps.satellites,
                    altitude: record.gps.altitude,
                    valid: record.gps.valid,
                    priority: record.priority,
                    timestamp: new Date(record.timestampMs).toISOString(),
                    codec: record.codecId,
                    provider: "teltonika",
                    attributes: promoted,
                    ...promoted,
                    ...(typeof record.eventIoId === "number" ? { eventIoId: record.eventIoId } : {}),
                    ...(typeof record.generationType === "number" ? { generationType: record.generationType } : {})
                  }
                };
                for (const [idStr, value] of Object.entries(record.ioById)) {
                  const idNum = Number(idStr);
                  if (!Number.isFinite(idNum)) continue;
                  (body.data as any)[`io${idNum}`] = value;
                }

                // Drop only pure last-fix heartbeats (no event IO, low priority) after the first
                // record in the batch — keeps ignition/IO events while cutting AVL flood volume.
                const hasEvent = typeof record.eventIoId === "number" && record.eventIoId > 0;
                const skipStore =
                  !record.gps.valid &&
                  record.priority === 0 &&
                  !hasEvent &&
                  typeof promoted.ignition !== "boolean" &&
                  storedCount > 0;
                if (!skipStore) {
                  const stored = storeTelemetryEventForTenant(tenant, body);
                  if (stored.ok && stored.stored !== false) {
                    storedCount += 1;
                    forwardTelemetryToWorker(body, tenant);
                  }
                }
              }

              socket.write(buildTeltonikaAck(decoded.records.length));
            } catch {
              teltonikaTcpDiagnostics.parserDecodeFailures += 1;
              const fallbackCount = data.length >= 2 ? Number(data.readUInt8(1)) : 0;
              const safeCount = Number.isFinite(fallbackCount) && fallbackCount >= 0 && fallbackCount <= 255 ? fallbackCount : 0;
              socket.write(buildTeltonikaAck(safeCount));
              teltonikaTcpDiagnostics.parserFallbackAcks += 1;
              pushTeltonikaTcpEvent({
                at: new Date().toISOString(),
                event: "decode_fallback_ack",
                port,
                remote,
                imei: imei || undefined,
                detail: `count=${safeCount}`
              });
            }
          }
        };

        socket.on("data", (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          tryParse();
        });
        socket.on("error", () => {
          // ignore per-connection noise
        });
        socket.on("close", (hadError) => {
          console.log(`Teltonika ${label}:${port} connection closed from ${remote}${imei ? ` imei=${imei}` : ""} hadError=${hadError}`);
          teltonikaTcpDiagnostics.closed += 1;
          if (hadError) teltonikaTcpDiagnostics.closedWithError += 1;
          teltonikaTcpDiagnostics.activeByPort[port] = Math.max(0, (teltonikaTcpDiagnostics.activeByPort[port] ?? 0) - 1);
          pushTeltonikaTcpEvent({ at: new Date().toISOString(), event: "close", port, remote, imei: imei || undefined, detail: `hadError=${hadError}` });
        });
      });

      server.on("error", (err: any) => {
        console.warn(`Teltonika TCP server error on ${label}:${port}`, err?.message ?? err);
      });
      server.listen(port, "0.0.0.0", () => {
        console.log(`Teltonika TCP ingest listening on 0.0.0.0:${port} (${label})`);
        if (!teltonikaTcpDiagnostics.listeners.includes(port)) {
          teltonikaTcpDiagnostics.listeners.push(port);
          teltonikaTcpDiagnostics.listeners.sort((left, right) => left - right);
        }
        pushTeltonikaTcpEvent({ at: new Date().toISOString(), event: "listener_ready", port, detail: label });
      });
    };

    for (const port of ports) {
      createListener(port, "teltonika");
    }
  }

  function startConcoxTcpIngest() {
    if (concoxPort <= 0) return;

    const server = net.createServer((socket) => {
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 15_000);
      socket.setTimeout(0);

      const remote = `${socket.remoteAddress ?? "unknown"}:${socket.remotePort ?? "?"}`;
      let buf = Buffer.alloc(0);
      let imei = "";

      concoxTcpDiagnostics.opened += 1;
      concoxTcpDiagnostics.activeConnections += 1;
      pushConcoxTcpEvent({ at: new Date().toISOString(), event: "open", port: concoxPort, remote });

      const tryParse = () => {
        while (buf.length >= 5) {
          if (!(buf[0] === 0x78 && buf[1] === 0x78)) {
            buf = buf.subarray(1);
            continue;
          }
          if (buf.length < 3) return;
          const len = buf.readUInt8(2);
          const total = len + 5;
          if (buf.length < total) return;
          const packet = buf.subarray(0, total);
          buf = buf.subarray(total);
          if (packet[total - 2] !== 0x0d || packet[total - 1] !== 0x0a) {
            concoxTcpDiagnostics.parseFailures += 1;
            pushConcoxTcpEvent({ at: new Date().toISOString(), event: "bad_frame", port: concoxPort, remote });
            continue;
          }

          const protocol = packet.readUInt8(3);
          const rest = packet.subarray(4, 4 + Math.max(0, len - 1));
          const info = rest.length >= 4 ? rest.subarray(0, rest.length - 4) : Buffer.alloc(0);
          const serial = rest.length >= 4 ? rest.subarray(rest.length - 4, rest.length - 2) : Buffer.from([0x00, 0x00]);

          if (protocol === 0x01 && !imei) {
            const parsedImei = readConcoxImeiFromBcd(info.subarray(0, Math.min(8, info.length)));
            if (parsedImei) {
              imei = parsedImei;
              pushConcoxTcpEvent({ at: new Date().toISOString(), event: "imei_login", port: concoxPort, remote, imei });
            }
          }

          if (protocol === 0x12 || protocol === 0x22) {
            const gps = decodeConcoxGpsInfo(info);
            if (gps) {
              const tenant = findTenantForImeiWithDefault(imei, concoxDefaultTenant);
              const body: any = {
                data: {
                  imei,
                  lat: gps.lat,
                  lon: gps.lon,
                  speed: gps.speed,
                  heading: gps.heading,
                  satellites: gps.satellites,
                  timestamp: gps.timestamp,
                  provider: "concox",
                  protocol: `0x${protocol.toString(16)}`
                }
              };
              const stored = storeTelemetryEventForTenant(tenant, body);
              if (stored.ok && stored.stored !== false) {
                forwardTelemetryToWorker(body, tenant);
              }
            } else {
              concoxTcpDiagnostics.parseFailures += 1;
            }
          }

          if (protocol === 0x01 || protocol === 0x12 || protocol === 0x13 || protocol === 0x16 || protocol === 0x22) {
            try {
              socket.write(buildConcoxAck(protocol, serial));
            } catch {
              // ignore socket races
            }
          }
        }
      };

      socket.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        tryParse();
      });
      socket.on("error", () => {
        // ignore per-connection noise
      });
      socket.on("close", () => {
        concoxTcpDiagnostics.closed += 1;
        concoxTcpDiagnostics.activeConnections = Math.max(0, concoxTcpDiagnostics.activeConnections - 1);
        pushConcoxTcpEvent({ at: new Date().toISOString(), event: "close", port: concoxPort, remote, imei: imei || undefined });
      });
    });

    server.on("error", (err: any) => {
      console.warn(`Concox TCP server error on ${concoxPort}`, err?.message ?? err);
    });
    server.listen(concoxPort, "0.0.0.0", () => {
      console.log(`Concox TCP ingest listening on 0.0.0.0:${concoxPort}`);
      pushConcoxTcpEvent({ at: new Date().toISOString(), event: "listener_ready", port: concoxPort });
    });
  }

  function startQueclinkTcpIngest() {
    if (queclinkPort <= 0) return;

    const server = net.createServer((socket) => {
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 15_000);
      socket.setTimeout(0);

      const remote = `${socket.remoteAddress ?? "unknown"}:${socket.remotePort ?? "?"}`;
      let textBuf = "";
      let imei = "";

      queclinkTcpDiagnostics.opened += 1;
      queclinkTcpDiagnostics.activeConnections += 1;
      pushQueclinkTcpEvent({ at: new Date().toISOString(), event: "open", port: queclinkPort, remote });

      const consumeLine = (line: string) => {
        const parsed = parseQueclinkTextMessage(line);
        if (!parsed) {
          queclinkTcpDiagnostics.parseFailures += 1;
          return;
        }
        if (parsed.imei) imei = parsed.imei;
        const tenant = findTenantForImeiWithDefault(parsed.imei, queclinkDefaultTenant);
        const body: any = {
          data: {
            imei: parsed.imei,
            lat: parsed.lat,
            lon: parsed.lon,
            speed: parsed.speed ?? undefined,
            heading: parsed.heading ?? undefined,
            timestamp: parsed.timestamp || new Date().toISOString(),
            provider: "queclink",
            messageType: parsed.messageType,
            raw: parsed.raw
          }
        };
        const stored = storeTelemetryEventForTenant(tenant, body);
        if (stored.ok && stored.stored !== false) {
          forwardTelemetryToWorker(body, tenant);
        }
      };

      socket.on("data", (chunk) => {
        textBuf += chunk.toString("utf8");
        while (true) {
          const dollarIdx = textBuf.indexOf("$");
          const newlineIdx = textBuf.indexOf("\n");
          const splitIdx = dollarIdx >= 0 && newlineIdx >= 0 ? Math.min(dollarIdx, newlineIdx) : Math.max(dollarIdx, newlineIdx);
          if (splitIdx < 0) break;
          const line = textBuf.slice(0, splitIdx + 1);
          textBuf = textBuf.slice(splitIdx + 1);
          consumeLine(line);
        }
      });
      socket.on("error", () => {
        // ignore per-connection noise
      });
      socket.on("close", () => {
        if (textBuf.trim()) consumeLine(textBuf);
        queclinkTcpDiagnostics.closed += 1;
        queclinkTcpDiagnostics.activeConnections = Math.max(0, queclinkTcpDiagnostics.activeConnections - 1);
        pushQueclinkTcpEvent({ at: new Date().toISOString(), event: "close", port: queclinkPort, remote, imei: imei || undefined });
      });
    });

    server.on("error", (err: any) => {
      console.warn(`Queclink TCP server error on ${queclinkPort}`, err?.message ?? err);
    });
    server.listen(queclinkPort, "0.0.0.0", () => {
      console.log(`Queclink TCP ingest listening on 0.0.0.0:${queclinkPort}`);
      pushQueclinkTcpEvent({ at: new Date().toISOString(), event: "listener_ready", port: queclinkPort });
    });
  }

  return {
    startTeltonikaTcpIngest,
    startConcoxTcpIngest,
    startQueclinkTcpIngest,
  };
}
