/**
 * Detailed 30-day IO6 dropout / stability report for SHACKMAN UA 822EC.
 * Do not print secrets.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const envDev = readFileSync(resolve(root, "../.env"), "utf8");
const apiKey = String(envDev.match(/^VITE_API_KEY=(.*)$/m)?.[1] ?? "").trim();
const apiBase = "https://vivi-telematics-api.bwena.workers.dev";
const tenantId = "west-africa";
const nameNeedle = "822EC";

const headers = {
  "x-api-key": apiKey,
  "x-tenant-id": tenantId,
  accept: "application/json"
};

const fetchJson = async (path) => {
  const response = await fetch(`${apiBase}${path}`, { headers });
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
};

const proxy = async (traccarPath) => {
  const body = await fetchJson(`/api/traccar/proxy?path=${encodeURIComponent(traccarPath)}`);
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.positions)) return body.positions;
  if (Array.isArray(body?.data)) return body.data;
  return [];
};

const toNum = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const truthy = (value) => {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return null;
};

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[i];
};

const now = new Date();
const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const devices = await proxy("/devices");
const matches = devices
  .filter((row) => String(row?.name ?? "").toUpperCase().includes(nameNeedle) || String(row?.uniqueId ?? "").includes("350612078"))
  .map((row) => ({
    id: row.id,
    name: row.name,
    uniqueId: row.uniqueId,
    attrs: Object.keys(row.attributes ?? {})
  }));
const device = devices.find((row) => String(row?.name ?? "").toUpperCase().includes(nameNeedle));
if (!device) {
  console.log(JSON.stringify({ error: "device not found", matches }, null, 2));
  process.exit(2);
}

const deviceId = device.id;
const attrs = device.attributes ?? {};
const chunkMs = 2 * 24 * 60 * 60 * 1000;
const rows = [];
for (let start = from.getTime(); start < now.getTime(); start += chunkMs) {
  const end = Math.min(start + chunkMs, now.getTime());
  const fromIso = new Date(start).toISOString();
  const toIso = new Date(end).toISOString();
  const chunk = await proxy(`/reports/route?deviceId=${deviceId}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
  for (const point of chunk) {
    const a = point.attributes && typeof point.attributes === "object" ? point.attributes : {};
    rows.push({
      t: new Date(point.fixTime || point.deviceTime || point.serverTime || 0).getTime(),
      io6: toNum(a.io6 ?? a.adc2),
      io9: toNum(a.io9 ?? a.adc1),
      fuel: toNum(a.fuel ?? a.fuelLevel),
      io113: toNum(a.io113),
      io12: toNum(a.io12),
      power: toNum(a.power),
      speed: toNum(point.speed),
      motion: truthy(a.motion),
      ignition: truthy(a.ignition ?? a.io239),
      in1: toNum(a.in1),
      in2: toNum(a.in2)
    });
  }
  console.error(`chunk ${fromIso.slice(0, 10)} : ${chunk.length} (rows ${rows.length})`);
}

rows.sort((a, b) => a.t - b.t);
const io6 = rows.map((r) => r.io6).filter((v) => v != null);
const sorted = [...io6].sort((a, b) => a - b);
const p05 = quantile(sorted, 0.05);
const p10 = quantile(sorted, 0.1);
const p50 = quantile(sorted, 0.5);
const p90 = quantile(sorted, 0.9);
const p95 = quantile(sorted, 0.95);
const floorMv = Math.max(1800, Math.round((p10 ?? 2600) * 0.75));

const buckets = {
  "0-500": 0,
  "500-1500": 0,
  "1500-2200": 0,
  "2200-2600": 0,
  "2600-3000": 0,
  "3000+": 0
};
for (const v of io6) {
  if (v < 500) buckets["0-500"] += 1;
  else if (v < 1500) buckets["500-1500"] += 1;
  else if (v < 2200) buckets["1500-2200"] += 1;
  else if (v < 2600) buckets["2200-2600"] += 1;
  else if (v < 3000) buckets["2600-3000"] += 1;
  else buckets["3000+"] += 1;
}

const groupStats = (list) => {
  const vals = list.filter((v) => v != null);
  if (!vals.length) return { n: 0 };
  const s = [...vals].sort((a, b) => a - b);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const stdev = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  let jumps = 0;
  for (let i = 1; i < vals.length; i += 1) {
    if (Math.abs(vals[i] - vals[i - 1]) >= 200) jumps += 1;
  }
  return {
    n: vals.length,
    min: s[0],
    max: s[s.length - 1],
    mean: Math.round(mean),
    median: quantile(s, 0.5),
    stdev: Math.round(stdev),
    jumps,
    jumpPct: Math.round((jumps / Math.max(1, vals.length - 1)) * 1000) / 10
  };
};

const parked = [];
const moving = [];
const ignOn = [];
const ignOff = [];
const powerOk = [];
const powerLow = [];
for (const r of rows) {
  if (r.io6 == null) continue;
  const isMoving = r.motion === true || (r.speed != null && r.speed > 3);
  if (isMoving) moving.push(r.io6);
  else parked.push(r.io6);
  if (r.ignition === true) ignOn.push(r.io6);
  else if (r.ignition === false) ignOff.push(r.io6);
  if (r.power != null && r.power < 10) powerLow.push(r.io6);
  else if (r.power != null) powerOk.push(r.io6);
}

const events = [];
let i = 0;
while (i < rows.length) {
  const r = rows[i];
  if (r.io6 == null || r.io6 >= floorMv) {
    i += 1;
    continue;
  }
  const start = i;
  let minMv = r.io6;
  let maxMv = r.io6;
  let movingHits = 0;
  let ignOffHits = 0;
  let powerLowHits = 0;
  while (i < rows.length && rows[i].io6 != null && rows[i].io6 < floorMv) {
    minMv = Math.min(minMv, rows[i].io6);
    maxMv = Math.max(maxMv, rows[i].io6);
    if (rows[i].motion === true || (rows[i].speed != null && rows[i].speed > 3)) movingHits += 1;
    if (rows[i].ignition === false) ignOffHits += 1;
    if (rows[i].power != null && rows[i].power < 10) powerLowHits += 1;
    i += 1;
  }
  const end = i - 1;
  const before = rows.slice(Math.max(0, start - 8), start).map((x) => x.io6).filter((v) => v != null && v >= floorMv);
  const after = rows.slice(i, Math.min(rows.length, i + 8)).map((x) => x.io6).filter((v) => v != null && v >= floorMv);
  const recovered = after.length > 0 && before.length > 0 && Math.abs(after[0] - before[before.length - 1]) < 250;
  events.push({
    from: new Date(rows[start].t).toISOString(),
    to: new Date(rows[end].t).toISOString(),
    minutes: Math.round((rows[end].t - rows[start].t) / 60000),
    points: end - start + 1,
    minMv,
    maxMv,
    movingHits,
    ignOffHits,
    powerLowHits,
    recovered,
    beforeMv: before[before.length - 1] ?? null,
    afterMv: after[0] ?? null
  });
}

const daily = new Map();
for (const r of rows) {
  if (r.io6 == null || r.t < 1) continue;
  const day = new Date(r.t).toISOString().slice(0, 10);
  if (!daily.has(day)) daily.set(day, []);
  daily.get(day).push(r.io6);
}

const dailyRows = [...daily.entries()].map(([day, vals]) => {
  const s = [...vals].sort((a, b) => a - b);
  const low = vals.filter((v) => v < floorMv).length;
  return {
    day,
    n: vals.length,
    min: s[0],
    p10: quantile(s, 0.1),
    median: quantile(s, 0.5),
    p90: quantile(s, 0.9),
    max: s[s.length - 1],
    dropoutPct: Math.round((low / vals.length) * 1000) / 10
  };
});

let corrN = 0;
let sumX = 0;
let sumY = 0;
let sumXY = 0;
let sumX2 = 0;
let sumY2 = 0;
for (const r of rows) {
  if (r.io6 == null || r.fuel == null) continue;
  corrN += 1;
  sumX += r.io6;
  sumY += r.fuel;
  sumXY += r.io6 * r.fuel;
  sumX2 += r.io6 * r.io6;
  sumY2 += r.fuel * r.fuel;
}
const corr = corrN > 2
  ? (corrN * sumXY - sumX * sumY) / Math.sqrt((corrN * sumX2 - sumX * sumX) * (corrN * sumY2 - sumY * sumY))
  : null;

const io9Count = rows.filter((r) => r.io9 != null).length;
const io113Vals = rows.map((r) => r.io113).filter((v) => v != null);
const io113Sorted = [...io113Vals].sort((a, b) => a - b);

const recovered = events.filter((e) => e.recovered);
const longEvents = events.filter((e) => e.minutes >= 10);
const movingEvents = events.filter((e) => e.movingHits > e.points / 2);
const powerEvents = events.filter((e) => e.powerLowHits > 0);

const report = {
  window: { from: from.toISOString(), to: now.toISOString(), points: rows.length },
  device: {
    id: device.id,
    name: device.name,
    uniqueId: device.uniqueId,
    catalogImeiHint: "350612078333583",
    fuelAnalog: attrs.viviFuelAnalogInput ?? null,
    tank: attrs.viviFuelTankCapacity ?? attrs.viviFuelTankCapacityMax ?? null,
    mvMin: attrs.viviFuelAnalogMvMin ?? null,
    mvMax: attrs.viviFuelAnalogMvMax ?? null,
    calibrationKeys: Object.keys(attrs).filter((k) => /fuel|analog|calib/i.test(k))
  },
  matches,
  presentLines: {
    io6: io6.length,
    io9: io9Count,
    fuel: rows.filter((r) => r.fuel != null).length,
    io113: io113Vals.length,
    io12: rows.filter((r) => r.io12 != null).length
  },
  io6: {
    p05, p10, p50, p90, p95,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    floorUsedMv: floorMv,
    buckets,
    parked: groupStats(parked),
    moving: groupStats(moving),
    ignitionOn: groupStats(ignOn),
    ignitionOff: groupStats(ignOff),
    powerOk: groupStats(powerOk),
    powerLow: groupStats(powerLow)
  },
  io113: {
    n: io113Vals.length,
    min: io113Sorted[0] ?? null,
    median: quantile(io113Sorted, 0.5),
    max: io113Sorted[io113Sorted.length - 1] ?? null,
    pctAt100: io113Vals.length ? Math.round((io113Vals.filter((v) => v >= 99).length / io113Vals.length) * 1000) / 10 : 0
  },
  fuelVsIo6Correlation: corr == null ? null : Math.round(corr * 1000) / 1000,
  dropouts: {
    eventCount: events.length,
    recoveredCount: recovered.length,
    longCount: longEvents.length,
    mostlyMoving: movingEvents.length,
    withLowPower: powerEvents.length,
    medianMinutes: events.length ? events.map((e) => e.minutes).sort((a, b) => a - b)[Math.floor(events.length / 2)] : 0,
    sample: events.slice(0, 25)
  },
  daily: dailyRows
};

writeFileSync(resolve(root, "analyze-shackman-io-detail.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ...report,
  dropouts: { ...report.dropouts, sample: report.dropouts.sample.slice(0, 12) },
  daily: dailyRows
}, null, 2));
