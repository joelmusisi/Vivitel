/**
 * One-month analogue IO stability report for SHACKMAN UA 822EC.
 * Reads API key from frontend/.env.local — do not print secrets.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const envLocal = readFileSync(resolve(root, "../.env.local"), "utf8");
const envDev = readFileSync(resolve(root, "../.env"), "utf8");
const apiKey =
  String(envDev.match(/^VITE_API_KEY=(.*)$/m)?.[1] ?? "").trim()
  || String(envLocal.match(/^VITE_API_KEY=(.*)$/m)?.[1] ?? "").trim();
const apiBase = "https://vivi-telematics-api.bwena.workers.dev";
const tenantId = "west-africa";
const imei = "350612078333583";
const nameNeedle = "822EC";

if (!apiKey) {
  console.error("Missing VITE_API_KEY");
  process.exit(1);
}

const headers = {
  "x-api-key": apiKey,
  "x-tenant-id": tenantId,
  accept: "application/json"
};

const fetchJson = async (path) => {
  const url = `${apiBase}${path}`;
  const response = await fetch(url, { headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, ok: response.ok, body };
};

const proxy = async (traccarPath) => {
  const path = `/api/traccar/proxy?path=${encodeURIComponent(traccarPath)}`;
  const result = await fetchJson(path);
  const body = result.body;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.positions)) return body.positions;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.devices)) return body.devices;
  if (Array.isArray(body?.live)) return body.live;
  return [];
};

const toNum = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const stats = (values) => {
  if (!values.length) {
    return { n: 0, min: null, max: null, mean: null, median: null, stdev: null, p10: null, p90: null, pctZero: null, jumps: 0, jumpPct: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = values.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const p10 = sorted[Math.floor((n - 1) * 0.1)];
  const p90 = sorted[Math.floor((n - 1) * 0.9)];
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  const zeros = values.filter((v) => v === 0).length;
  let jumps = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (Math.abs(values[i] - values[i - 1]) >= Math.max(200, Math.abs(mean) * 0.08)) jumps += 1;
  }
  return {
    n,
    min: sorted[0],
    max: sorted[n - 1],
    mean: Math.round(mean * 10) / 10,
    median: Math.round(median * 10) / 10,
    stdev: Math.round(stdev * 10) / 10,
    p10,
    p90,
    pctZero: Math.round((zeros / n) * 1000) / 10,
    jumps,
    jumpPct: Math.round((jumps / Math.max(1, n - 1)) * 1000) / 10
  };
};

const looksDigital = (s) => s.n > 0 && s.min >= 0 && s.max <= 1.5;
const looksMvAnalog = (s) => s.n > 0 && s.max >= 200 && s.max <= 40000 && s.stdev > 5;
const looksPercent = (s) => s.n > 0 && s.min >= 0 && s.max <= 100.5 && s.max > 5;

const now = new Date();
const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

console.log(JSON.stringify({ phase: "start", from: from.toISOString(), to: now.toISOString() }));

const devices = await proxy("/devices");
const device = devices.find((row) => {
  const unique = String(row?.uniqueId ?? row?.imei ?? "").trim();
  const name = String(row?.name ?? "").toUpperCase();
  return unique === imei || name.includes(nameNeedle);
});

if (!device) {
  const sample = devices.slice(0, 8).map((row) => ({ id: row?.id, name: row?.name, uniqueId: row?.uniqueId }));
  console.log(JSON.stringify({ error: "device not found", deviceCount: devices.length, sample }, null, 2));
  process.exit(2);
}

const deviceId = device.id;
const attrs = device.attributes ?? {};
console.log(JSON.stringify({
  phase: "device",
  id: deviceId,
  name: device.name,
  uniqueId: device.uniqueId,
  fuelAnalog: attrs.viviFuelAnalogInput ?? attrs.analogInput ?? null,
  tank: attrs.viviFuelTankCapacity ?? attrs.viviFuelTankCapacityMax ?? null,
  mvMin: attrs.viviFuelAnalogMvMin ?? null,
  mvMax: attrs.viviFuelAnalogMvMax ?? null,
  hasCalibration: Boolean(attrs.viviFuelCalibration)
}, null, 2));

const chunkMs = 2 * 24 * 60 * 60 * 1000;
const points = [];
for (let start = from.getTime(); start < now.getTime(); start += chunkMs) {
  const end = Math.min(start + chunkMs, now.getTime());
  const fromIso = new Date(start).toISOString();
  const toIso = new Date(end).toISOString();
  const query = `/reports/route?deviceId=${deviceId}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
  let chunk = await proxy(query);
  if (!chunk.length) {
    chunk = await proxy(`/positions?deviceId=${deviceId}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
  }
  points.push(...chunk);
  console.error(`chunk ${fromIso.slice(0, 10)} -> ${toIso.slice(0, 10)} : ${chunk.length} points (total ${points.length})`);
}

const series = new Map();
const extraKeys = new Set();
for (const point of points) {
  const a = point?.attributes && typeof point.attributes === "object" ? point.attributes : {};
  for (const [key, raw] of Object.entries(a)) {
    const n = toNum(raw);
    if (n == null) continue;
    const lk = key.toLowerCase();
    if (
      /^io\d+$/i.test(key)
      || /^adc\d+$/i.test(key)
      || lk === "fuel"
      || lk === "fuellevel"
      || lk === "power"
      || lk === "battery"
    ) {
      if (!series.has(key)) series.set(key, []);
      series.get(key).push(n);
    } else if (typeof n === "number") {
      extraKeys.add(key);
    }
  }
}

const rows = [...series.entries()]
  .map(([key, values]) => {
    const s = stats(values);
    const coverage = Math.round((s.n / Math.max(1, points.length)) * 1000) / 10;
    let kind = "other";
    if (looksDigital(s)) kind = "digital";
    else if (looksPercent(s)) kind = "percent";
    else if (looksMvAnalog(s)) kind = "analog-mV";
    const cv = s.mean ? Math.round((s.stdev / Math.abs(s.mean)) * 1000) / 10 : null;
    return { key, coverage, kind, cv, ...s };
  })
  .sort((a, b) => b.n - a.n);

const analogCandidates = rows.filter((row) => row.kind === "analog-mV" || /^io6$|^io9$|^adc/i.test(row.key));

const score = (row) => {
  if (!row.n) return -1;
  let pts = 0;
  if (row.kind === "analog-mV") pts += 40;
  if (row.coverage >= 80) pts += 25;
  else if (row.coverage >= 40) pts += 10;
  if (row.pctZero <= 5) pts += 15;
  else if (row.pctZero >= 40) pts -= 20;
  if (row.jumpPct != null && row.jumpPct <= 8) pts += 15;
  else if (row.jumpPct != null && row.jumpPct >= 20) pts -= 10;
  if (row.cv != null && row.cv >= 2 && row.cv <= 25) pts += 10;
  if (row.max > 500 && row.max < 35000) pts += 10;
  if (String(row.key).toLowerCase() === "io6") pts -= 5;
  return pts;
};

const ranked = analogCandidates
  .map((row) => ({ ...row, score: score(row) }))
  .sort((a, b) => b.score - a.score);

console.log(JSON.stringify({
  phase: "report",
  points: points.length,
  device: { id: deviceId, name: device.name, uniqueId: device.uniqueId },
  ioRows: rows,
  analogRanked: ranked,
  extraNumericKeys: [...extraKeys].sort().slice(0, 40)
}, null, 2));
