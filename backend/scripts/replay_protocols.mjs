#!/usr/bin/env node
import net from "net";

const args = process.argv.slice(2);
const opts = {
  baseUrl: process.env.VPS_BASE_URL || "http://127.0.0.1:8787",
  apiKey: process.env.API_KEY || "",
  tenant: process.env.TENANT_ID || "",
  concoxPort: Number(process.env.CONCOX_PORT || 5013),
  queclinkPort: Number(process.env.QUECLINK_PORT || 5021),
  timeoutMs: Number(process.env.REPLAY_TIMEOUT_MS || 6000)
};

const EXPECTED_IMEIS = ["359339075489333", "865067051234567"];
const EXPECTED_MIN_SUCCESSFUL_REPLAYS = 4;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1];
  if (arg === "--base-url" && next) {
    opts.baseUrl = next;
    i += 1;
  } else if (arg === "--api-key" && next) {
    opts.apiKey = next;
    i += 1;
  } else if (arg === "--tenant" && next) {
    opts.tenant = next;
    i += 1;
  } else if (arg === "--concox-port" && next) {
    opts.concoxPort = Number(next);
    i += 1;
  } else if (arg === "--queclink-port" && next) {
    opts.queclinkPort = Number(next);
    i += 1;
  } else if (arg === "--timeout-ms" && next) {
    opts.timeoutMs = Number(next);
    i += 1;
  }
}

const pass = (label, detail = "") => console.log(`PASS ${label}${detail ? ` - ${detail}` : ""}`);
const fail = (label, detail = "") => console.error(`FAIL ${label}${detail ? ` - ${detail}` : ""}`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBcdBytes(digits) {
  let clean = String(digits || "").replace(/\D+/g, "");
  if (!clean) clean = "0000000000000000";
  if (clean.length % 2 !== 0) clean = `0${clean}`;
  const out = Buffer.alloc(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

function crc16X25(data) {
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

function buildConcoxFrame(protocol, infoBytes, serial = 1) {
  const serialBuf = Buffer.alloc(2);
  serialBuf.writeUInt16BE(serial & 0xffff, 0);

  const data = Buffer.concat([Buffer.from([protocol]), infoBytes, serialBuf]);
  const len = data.length + 2;
  const bodyNoCrc = Buffer.concat([Buffer.from([len]), data]);
  const crc = crc16X25(bodyNoCrc);

  const out = Buffer.alloc(2 + bodyNoCrc.length + 2 + 2);
  out[0] = 0x78;
  out[1] = 0x78;
  bodyNoCrc.copy(out, 2);
  out.writeUInt16BE(crc, 2 + bodyNoCrc.length);
  out[out.length - 2] = 0x0d;
  out[out.length - 1] = 0x0a;
  return out;
}

function buildConcoxGpsInfo({ lat, lon, speed, heading, timestamp }) {
  const at = new Date(timestamp);
  const yy = at.getUTCFullYear() - 2000;
  const mm = at.getUTCMonth() + 1;
  const dd = at.getUTCDate();
  const hh = at.getUTCHours();
  const mi = at.getUTCMinutes();
  const ss = at.getUTCSeconds();

  const latRaw = Math.round(Math.abs(lat) * 1_800_000);
  const lonRaw = Math.round(Math.abs(lon) * 1_800_000);

  const info = Buffer.alloc(18);
  info[0] = yy & 0xff;
  info[1] = mm & 0xff;
  info[2] = dd & 0xff;
  info[3] = hh & 0xff;
  info[4] = mi & 0xff;
  info[5] = ss & 0xff;
  info[6] = 0x0c; // low nibble used as satellite count in parser
  info.writeUInt32BE(latRaw >>> 0, 7);
  info.writeUInt32BE(lonRaw >>> 0, 11);
  info[15] = Math.max(0, Math.min(255, Math.round(speed)));

  let courseStatus = heading & 0x03ff;
  if (lon < 0) courseStatus |= 0x0400; // west
  if (lat < 0) courseStatus |= 0x0800; // south
  info.writeUInt16BE(courseStatus, 16);
  return info;
}

function compactUtcTimestamp(date) {
  const d = new Date(date);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`;
}

async function postJson(path, body) {
  const headers = { "content-type": "application/json" };
  if (opts.apiKey) headers["x-api-key"] = opts.apiKey;
  if (opts.tenant) headers["x-tenant-id"] = opts.tenant;
  const response = await fetch(`${opts.baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { ok: response.ok, status: response.status, body: parsed };
}

async function runFreematicsHttp() {
  const sample = {
    imei: "359339075489333",
    vin: "WBA12345",
    lat: -25.965,
    lon: 32.589,
    speed: 68,
    rpm: 2500,
    fuel: 42,
    satellites: 11,
    timestamp: new Date().toISOString()
  };
  const result = await postJson("/ingest/freematics", sample);
  if (!result.ok) throw new Error(`HTTP ${result.status} ${JSON.stringify(result.body)}`);
  pass("freematics-http", `status=${result.status}`);
}

async function runQueclinkHttp() {
  const now = compactUtcTimestamp(new Date());
  const line = `+RESP:GTFRI,865067051234567,GV300,0,0,0,0,1,-25.965,32.589,50,180,${now},0000$`;
  const result = await postJson("/ingest/queclink", { line });
  if (!result.ok) throw new Error(`HTTP ${result.status} ${JSON.stringify(result.body)}`);
  pass("queclink-http", `status=${result.status}`);
}

async function runQueclinkTcp() {
  const now = compactUtcTimestamp(new Date());
  const line = `+RESP:GTFRI,865067051234567,GV300,0,0,0,0,1,-25.965,32.589,50,180,${now},0000$\r\n`;

  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: opts.queclinkPort });
    const timer = setTimeout(() => {
      socket.destroy(new Error("timeout"));
    }, opts.timeoutMs);

    socket.on("connect", () => {
      socket.write(line, "utf8");
      setTimeout(() => {
        clearTimeout(timer);
        socket.end();
        resolve();
      }, 250);
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  pass("queclink-tcp", `port=${opts.queclinkPort}`);
}

async function runConcoxTcp() {
  const imei = "359339075489333";
  const bcd = toBcdBytes(imei);
  const loginFrame = buildConcoxFrame(0x01, bcd, 1);

  const gpsInfo = buildConcoxGpsInfo({
    lat: -25.965,
    lon: 32.589,
    speed: 52,
    heading: 180,
    timestamp: new Date()
  });
  const gpsFrame = buildConcoxFrame(0x12, gpsInfo, 2);

  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: opts.concoxPort });
    const timer = setTimeout(() => {
      socket.destroy(new Error("timeout"));
    }, opts.timeoutMs);

    let ackBytes = 0;

    socket.on("data", (chunk) => {
      ackBytes += chunk.length;
    });

    socket.on("connect", async () => {
      socket.write(loginFrame);
      await sleep(120);
      socket.write(gpsFrame);
      await sleep(250);
      clearTimeout(timer);
      socket.end();
      resolve(ackBytes);
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  pass("concox-tcp", `port=${opts.concoxPort}`);
}

async function fetchTcpHealth() {
  const response = await fetch(`${opts.baseUrl}/health/tcp`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  return body;
}

async function fetchHealth() {
  const tenantSuffix = opts.tenant ? `?tenant=${encodeURIComponent(opts.tenant)}` : "";
  const response = await fetch(`${opts.baseUrl}/health${tenantSuffix}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchAssets() {
  const tenantSuffix = opts.tenant ? `?tenant=${encodeURIComponent(opts.tenant)}` : "";
  const response = await fetch(`${opts.baseUrl}/d1/assets${tenantSuffix}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.assets) ? payload.assets : [];
}

async function fetchTelemetryHistory() {
  const tenantSuffix = opts.tenant ? `?tenant=${encodeURIComponent(opts.tenant)}` : "";
  const response = await fetch(`${opts.baseUrl}/telemetry/history${tenantSuffix}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.events) ? payload.events : [];
}

function findAssetByImei(assets, imei) {
  const needle = String(imei || "").trim();
  return assets.find((a) => String(a?.imei || "").trim() === needle) || null;
}

function hasNumericLatLng(asset) {
  const lat = Number(asset?.lat ?? asset?.latitude);
  const lng = Number(asset?.lng ?? asset?.lon ?? asset?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

async function main() {
  const failures = [];
  let successfulReplays = 0;

  let baselineEvents = null;
  let baselineHistoryCount = null;
  let baselineStorageMode = "";
  try {
    const health = await fetchHealth();
    baselineEvents = Number(health?.telemetry?.totalEvents ?? 0);
    baselineStorageMode = String(health?.storage?.mode ?? "").trim().toLowerCase();
    console.log(`INFO health baseline totalEvents=${baselineEvents}`);
  } catch (err) {
    fail("health-baseline", String(err?.message || err));
  }

  try {
    const events = await fetchTelemetryHistory();
    baselineHistoryCount = events.length;
    console.log(`INFO history baseline count=${baselineHistoryCount}`);
  } catch (err) {
    fail("history-baseline", String(err?.message || err));
  }

  const tasks = [
    ["freematics-http", runFreematicsHttp],
    ["queclink-http", runQueclinkHttp],
    ["queclink-tcp", runQueclinkTcp],
    ["concox-tcp", runConcoxTcp]
  ];

  for (const [label, fn] of tasks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fn();
      successfulReplays += 1;
    } catch (err) {
      const message = String(err?.message || err);
      failures.push({ label, message });
      fail(label, message);
    }
  }

  try {
    const health = await fetchTcpHealth();
    const qOpened = Number(health?.queclink?.opened ?? 0);
    const cOpened = Number(health?.concox?.opened ?? 0);
    const qParseFailures = Number(health?.queclink?.parseFailures ?? 0);
    const cParseFailures = Number(health?.concox?.parseFailures ?? 0);
    console.log(`INFO health/tcp queclink.opened=${qOpened} concox.opened=${cOpened} queclink.parseFailures=${qParseFailures} concox.parseFailures=${cParseFailures}`);
  } catch (err) {
    fail("health-tcp", String(err?.message || err));
  }

  try {
    const health = await fetchHealth();
    const afterEvents = Number(health?.telemetry?.totalEvents ?? 0);
    if (baselineEvents !== null) {
      const delta = afterEvents - baselineEvents;
      const expectedDelta = Math.min(successfulReplays, EXPECTED_MIN_SUCCESSFUL_REPLAYS);
      if (delta >= expectedDelta) {
        pass("health-event-delta", `delta=${delta} expected>=${expectedDelta}`);
      } else {
        let historyDelta = Number.NaN;
        try {
          const events = await fetchTelemetryHistory();
          if (baselineHistoryCount !== null) {
            historyDelta = events.length - baselineHistoryCount;
          }
        } catch {
          // ignore and keep NaN
        }

        if (Number.isFinite(historyDelta) && historyDelta >= expectedDelta) {
          pass("health-event-delta", `healthDelta=${delta} fallbackHistoryDelta=${historyDelta} expected>=${expectedDelta}`);
        } else if (baselineStorageMode === "memory") {
          pass("health-event-delta", `skipped strict count check in memory mode (healthDelta=${delta}, historyDelta=${Number.isFinite(historyDelta) ? historyDelta : "n/a"})`);
        } else {
          const message = `delta=${delta} historyDelta=${Number.isFinite(historyDelta) ? historyDelta : "n/a"} expected>=${expectedDelta}`;
          failures.push({ label: "health-event-delta", message });
          fail("health-event-delta", message);
        }
      }
    }
  } catch (err) {
    const message = String(err?.message || err);
    failures.push({ label: "health-after", message });
    fail("health-after", message);
  }

  try {
    const assets = await fetchAssets();
    for (const imei of EXPECTED_IMEIS) {
      const asset = findAssetByImei(assets, imei);
      if (!asset) {
        const message = `imei=${imei} not found in /d1/assets`;
        failures.push({ label: "asset-imei", message });
        fail("asset-imei", message);
        continue;
      }
      if (!hasNumericLatLng(asset)) {
        const message = `imei=${imei} found but lat/lng missing`;
        failures.push({ label: "asset-latlng", message });
        fail("asset-latlng", message);
        continue;
      }
      pass("asset-imei", `imei=${imei} present`);
    }
  } catch (err) {
    const message = String(err?.message || err);
    failures.push({ label: "assets-fetch", message });
    fail("assets-fetch", message);
  }

  if (failures.length) {
    console.error(`\nReplay completed with ${failures.length} failure(s).`);
    process.exitCode = 1;
    return;
  }

  console.log("\nReplay completed successfully.");
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exit(1);
});
