import fs from "fs";
import path from "path";
import zlib from "zlib";

const isPrimitive = (value: unknown) =>
  value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const maybeNullSentinel = (value: unknown) => {
  if (typeof value === "number") {
    if (value === 32767 || value === 65535 || value === 2147483647 || value === 4294967295) return null;
  }
  return value;
};

export const normalizeTelemetryKey = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ouput/g, "output")
    .replace(/temperature/g, "temp")
    .replace(/[^a-z0-9]+/g, "");

export const flattenTelemetry = (payload: any, limit = 2500) => {
  const out: Array<{ key: string; value: unknown }> = [];
  const queue: Array<{ v: any; path: string; depth: number }> = [{ v: payload, path: "", depth: 0 }];
  const seen = new Set<any>();
  while (queue.length && out.length < limit) {
    const { v, path, depth } = queue.shift()!;
    if (v && typeof v === "object") {
      if (seen.has(v)) continue;
      seen.add(v);
    }
    if (v === null || v === undefined) continue;
    if (typeof v !== "object") {
      out.push({ key: path, value: v });
      continue;
    }
    if (Array.isArray(v)) {
      if (depth >= 6) continue;
      for (let i = 0; i < Math.min(v.length, 50); i += 1) {
        queue.push({ v: v[i], path: `${path}[${i}]`, depth: depth + 1 });
      }
      continue;
    }
    if (depth >= 6) continue;
    for (const [key, child] of Object.entries(v)) {
      const nextPath = path ? `${path}.${key}` : key;
      queue.push({ v: child, path: nextPath, depth: depth + 1 });
    }
  }
  return out;
};

let teltonikaIoNameById: Record<number, string> | null = null;
let teltonikaIoIdByNormName: Record<string, number> | null = null;

const tryLoadTeltonikaIoMap = () => {
  if (teltonikaIoNameById && teltonikaIoIdByNormName) return;
  const candidates = [
    process.env.TELTONIKA_CFG_PATH,
    path.join(process.cwd(), "vivi_telematic", "120 - 190 FMB Configuration File New.cfg"),
    path.join(process.cwd(), "..", "120 - 190 FMB Configuration File New.cfg"),
    path.join(process.cwd(), "..", "vivi_telematic", "120 - 190 FMB Configuration File New.cfg"),
    path.join(process.cwd(), "..", "..", "vivi_telematic", "120 - 190 FMB Configuration File New.cfg")
  ].filter(Boolean) as string[];

  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) {
    teltonikaIoNameById = {};
    teltonikaIoIdByNormName = {};
    return;
  }

  try {
    let bytes = fs.readFileSync(found);
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      bytes = zlib.gunzipSync(bytes);
    }
    const text = bytes.toString("utf8");
    const byId: Record<number, string> = {};
    const byNorm: Record<string, number> = {};
    for (const token of text.split(";")) {
      if (!token.includes(":")) continue;
      const [keyRaw, valueRaw] = token.split(":", 2);
      const keyStr = String(keyRaw ?? "").trim();
      const name = String(valueRaw ?? "").trim();
      if (!keyStr || !name) continue;
      if (!/^\d+$/.test(keyStr)) continue;
      const id = Number(keyStr);
      if (!Number.isFinite(id) || id < 1) continue;
      if (/^\d+$/.test(name)) continue;
      byId[id] = name;
      const normalized = normalizeTelemetryKey(name);
      if (normalized && typeof byNorm[normalized] === "undefined") byNorm[normalized] = id;
    }
    teltonikaIoNameById = byId;
    teltonikaIoIdByNormName = byNorm;
  } catch {
    teltonikaIoNameById = {};
    teltonikaIoIdByNormName = {};
  }
};

export const buildIoNamedSnapshotFromTelemetry = (telemetryBody: any) => {
  tryLoadTeltonikaIoMap();
  const byId = teltonikaIoNameById || {};
  const flat = flattenTelemetry(telemetryBody);
  const ioIdValues: Record<number, unknown> = {};

  for (const { key, value } of flat) {
    const lastSeg = key.split(".").slice(-1)[0] ?? "";
    const match = String(lastSeg).match(/^io(\d{3,6})$/i) || String(lastSeg).match(/^(\d{3,6})$/);
    if (!match) continue;
    const id = Number(match[1]);
    if (!Number.isFinite(id)) continue;
    if (!isPrimitive(value)) continue;
    ioIdValues[id] = maybeNullSentinel(value);
  }

  const named: Record<string, unknown> = {};
  for (const [idStr, value] of Object.entries(ioIdValues)) {
    const id = Number(idStr);
    const name = byId[id];
    if (!name) continue;
    if (typeof named[name] === "undefined") named[name] = value;
  }

  return { ioById: ioIdValues, ioNamed: named };
};

export const extractMonitoredValue = (telemetry: any, monitoredName: string) => {
  const flat = flattenTelemetry(telemetry);
  const keyIndex: Record<string, unknown> = {};
  const ioIdValues: Record<number, unknown> = {};

  for (const { key, value } of flat) {
    const lastSeg = key.split(".").slice(-1)[0] ?? "";
    const normalizedLastSeg = normalizeTelemetryKey(lastSeg);
    if (normalizedLastSeg && typeof keyIndex[normalizedLastSeg] === "undefined") {
      keyIndex[normalizedLastSeg] = value;
    }

    const match = String(lastSeg).match(/^(?:io)?(\d{3,6})$/i) || String(lastSeg).match(/^io(\d{3,6})$/i);
    if (!match) continue;
    const id = Number(match[1]);
    if (Number.isFinite(id)) ioIdValues[id] = value;
  }

  const normalizedNeedle = normalizeTelemetryKey(monitoredName);
  if (normalizedNeedle && typeof keyIndex[normalizedNeedle] !== "undefined") {
    return { found: true as const, value: keyIndex[normalizedNeedle] };
  }

  tryLoadTeltonikaIoMap();
  const idByNorm = teltonikaIoIdByNormName || {};
  const byId = teltonikaIoNameById || {};
  const ioId = normalizedNeedle ? idByNorm[normalizedNeedle] : undefined;
  if (ioId && typeof ioIdValues[ioId] !== "undefined") {
    return { found: true as const, value: ioIdValues[ioId], ioId };
  }

  for (const [idStr, value] of Object.entries(ioIdValues)) {
    const id = Number(idStr);
    const name = byId[id];
    if (!name) continue;
    if (normalizeTelemetryKey(name) === normalizedNeedle) {
      return { found: true as const, value, ioId: id };
    }
  }

  return { found: false as const };
};