import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
let Database: any = null;
try {
  // try dynamic require to allow optional native module
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Database = require("better-sqlite3");
} catch (e) {
  Database = null;
}
import path from "path";
import fs from "fs";
import https from "https";
import net from "net";
import crypto from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import zlib from "zlib";

const API_KEY = process.env.API_KEY ?? "";
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD ?? "");
// Optional stronger storage: scrypt:<saltHex>:<hashHex>
const ADMIN_PASSWORD_HASH = String(process.env.ADMIN_PASSWORD_HASH ?? "").trim();
const ADMIN_TOKEN_TTL_HOURS = Math.min(Math.max(Number(process.env.ADMIN_TOKEN_TTL_HOURS ?? 24 * 7), 1), 24 * 30);
const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "vivi.db");
const REQUIRE_PERSISTENT_DB =
  String(process.env.REQUIRE_PERSISTENT_DB ?? (process.env.NODE_ENV === "production" ? "true" : "false"))
    .trim()
    .toLowerCase() === "true";
const DEVICE_ARTIFACTS_DIR = process.env.DEVICE_ARTIFACTS_DIR ?? path.join(process.cwd(), "device-artifacts");
const B2_KEY_ID = process.env.B2_KEY_ID ?? "";
const B2_APP_KEY = process.env.B2_APP_KEY ?? "";
const B2_BUCKET = process.env.B2_BUCKET ?? "";
const B2_REGION = process.env.B2_REGION ?? "us-west-004";
const B2_ENDPOINT = process.env.B2_ENDPOINT ?? "";
const B2_ENABLED = Boolean(B2_KEY_ID && B2_APP_KEY && B2_BUCKET);
const TELEMETRY_ARCHIVE_PREFIX = String(process.env.TELEMETRY_ARCHIVE_PREFIX ?? "telemetry-archive").trim() || "telemetry-archive";
const TELEMETRY_ARCHIVE_LOCAL_DIR = process.env.TELEMETRY_ARCHIVE_LOCAL_DIR ?? path.join(process.cwd(), "telemetry-archive");
const CAMERA_RECORDINGS_DIR = process.env.CAMERA_RECORDINGS_DIR ?? path.join(process.cwd(), "camera-recordings");
const MAX_CAMERA_PCM_CHUNK_BYTES = Math.max(16_384, Number(process.env.MAX_CAMERA_PCM_CHUNK_BYTES ?? 1_048_576));

const b2Client = B2_ENABLED
  ? new S3Client({
      region: B2_REGION,
      credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APP_KEY },
      endpoint: B2_ENDPOINT || undefined,
      forcePathStyle: true
    })
  : null;

// Device server (for proxying requests to devices on mobile networks)
const DEVICE_SERVER_DOMAIN = process.env.DEVICE_SERVER_DOMAIN ?? process.env.VITE_DEVICE_SERVER_DOMAIN ?? "";
const DEVICE_SERVER_PORT = process.env.DEVICE_SERVER_PORT ?? process.env.VITE_DEVICE_SERVER_PORT ?? "";
const DEVICE_SERVER_PROTOCOL = (process.env.DEVICE_SERVER_PROTOCOL ?? "http").replace(/:\/\//, "");
const DEVICE_SERVER_API_KEY = process.env.DEVICE_SERVER_API_KEY ?? "";
// Optional master live-stream provider (single source for all devices)
const LIVE_STREAM_PROVIDER_URL = String(process.env.LIVE_STREAM_PROVIDER_URL ?? "").trim().replace(/\/$/, "");
const LIVE_STREAM_PROVIDER_API_KEY = String(process.env.LIVE_STREAM_PROVIDER_API_KEY ?? "").trim();
const LIVE_STREAM_PROVIDER_TENANT = String(process.env.LIVE_STREAM_PROVIDER_TENANT ?? "").trim();

// Traccar (for sending commands to devices)
const TRACCAR_BASE_URL = String(process.env.TRACCAR_BASE_URL ?? "").trim().replace(/\/$/, "");
const TRACCAR_USERNAME = String(process.env.TRACCAR_USERNAME ?? "").trim();
const TRACCAR_PASSWORD = String(process.env.TRACCAR_PASSWORD ?? "").trim();
const TRACCAR_TOKEN = String(process.env.TRACCAR_TOKEN ?? "").trim();
const TRACCAR_KICK_COMMAND = String(process.env.TRACCAR_KICK_COMMAND ?? "getgps").trim() || "getgps";

// Teltonika direct TCP ingest (Codec8 / Codec8 Extended)
// If you already ingest via Traccar, leave TELTONIKA_PORT unset to disable.
const TELTONIKA_PORT = Math.max(0, Number(process.env.TELTONIKA_PORT ?? 0));
const TELTONIKA_DUPLICATE_PORTS = String(
  process.env.TELTONIKA_DUPLICATE_PORTS
    ?? process.env.TELTONIKA_DUPLICATE_PORT
    ?? ""
)
  .split(",")
  .map((s) => Number(String(s ?? "").trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
  .map((n) => Math.floor(n));
const TELTONIKA_DEFAULT_TENANT = String(process.env.TELTONIKA_TENANT_ID ?? process.env.TELTONIKA_DEFAULT_TENANT ?? "").trim();
const CONCOX_PORT = Math.max(0, Number(process.env.CONCOX_PORT ?? 0));
const CONCOX_DEFAULT_TENANT = String(process.env.CONCOX_TENANT_ID ?? process.env.CONCOX_DEFAULT_TENANT ?? "").trim();
const QUECLINK_PORT = Math.max(0, Number(process.env.QUECLINK_PORT ?? 0));
const QUECLINK_DEFAULT_TENANT = String(process.env.QUECLINK_TENANT_ID ?? process.env.QUECLINK_DEFAULT_TENANT ?? "").trim();
const FREEMATICS_DEFAULT_TENANT = String(process.env.FREEMATICS_TENANT_ID ?? process.env.FREEMATICS_DEFAULT_TENANT ?? "").trim();

// Optional: forward Teltonika-decoded telemetry to the Cloudflare Worker API so existing Pages UI
// (which defaults to the Worker URL in production) receives real-time updates.
const WORKER_TELEMETRY_FORWARD_URL = String(
  process.env.WORKER_TELEMETRY_FORWARD_URL ?? "https://vivi-telematics-api.bwena.workers.dev/ingest/telemetry"
).trim();
const WORKER_TELEMETRY_FORWARD_ENABLED =
  String(process.env.WORKER_TELEMETRY_FORWARD_ENABLED ?? "true").trim().toLowerCase() === "true";
const WORKER_API_KEY = String(process.env.WORKER_API_KEY ?? API_KEY ?? "").trim();

const workerForwardDiagnostics: {
  enabled: boolean;
  url: string;
  attempts: number;
  success: number;
  failed: number;
  lastStatus?: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
} = {
  enabled: WORKER_TELEMETRY_FORWARD_ENABLED,
  url: WORKER_TELEMETRY_FORWARD_URL,
  attempts: 0,
  success: 0,
  failed: 0
};

function forwardTelemetryToWorker(body: Record<string, unknown>, tenant: string) {
  if (!WORKER_TELEMETRY_FORWARD_ENABLED || !WORKER_TELEMETRY_FORWARD_URL || !WORKER_API_KEY) return;
  try {
    const fetchFn = (globalThis as any).fetch as typeof fetch | undefined;
    if (!fetchFn) return;
    workerForwardDiagnostics.attempts += 1;
    void fetchFn(WORKER_TELEMETRY_FORWARD_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": WORKER_API_KEY,
        ...(tenant ? { "x-tenant-id": tenant } : {})
      },
      body: JSON.stringify(body)
    })
      .then((resp) => {
        workerForwardDiagnostics.lastStatus = resp.status;
        if (resp.ok) {
          workerForwardDiagnostics.success += 1;
          workerForwardDiagnostics.lastSuccessAt = new Date().toISOString();
          return;
        }
        workerForwardDiagnostics.failed += 1;
        workerForwardDiagnostics.lastFailureAt = new Date().toISOString();
        workerForwardDiagnostics.lastError = `HTTP ${resp.status}`;
      })
      .catch((err: any) => {
        workerForwardDiagnostics.failed += 1;
        workerForwardDiagnostics.lastFailureAt = new Date().toISOString();
        workerForwardDiagnostics.lastError = String(err?.message ?? err ?? "forward_failed");
      });
  } catch {
    // ignore
  }
}

type TcpEvent = {
  at: string;
  event: string;
  port: number;
  remote?: string;
  imei?: string;
  detail?: string;
};

const teltonikaTcpDiagnostics: {
  listeners: number[];
  opened: number;
  closed: number;
  closedWithError: number;
  parserFallbackAcks: number;
  parserDecodeFailures: number;
  activeByPort: Record<number, number>;
  recent: TcpEvent[];
} = {
  listeners: [],
  opened: 0,
  closed: 0,
  closedWithError: 0,
  parserFallbackAcks: 0,
  parserDecodeFailures: 0,
  activeByPort: {},
  recent: []
};

const concoxTcpDiagnostics: {
  listener: number;
  opened: number;
  closed: number;
  parseFailures: number;
  activeConnections: number;
  recent: TcpEvent[];
} = {
  listener: CONCOX_PORT,
  opened: 0,
  closed: 0,
  parseFailures: 0,
  activeConnections: 0,
  recent: []
};

const queclinkTcpDiagnostics: {
  listener: number;
  opened: number;
  closed: number;
  parseFailures: number;
  activeConnections: number;
  recent: TcpEvent[];
} = {
  listener: QUECLINK_PORT,
  opened: 0,
  closed: 0,
  parseFailures: 0,
  activeConnections: 0,
  recent: []
};

const pushTeltonikaTcpEvent = (evt: TcpEvent) => {
  teltonikaTcpDiagnostics.recent.unshift(evt);
  if (teltonikaTcpDiagnostics.recent.length > 200) {
    teltonikaTcpDiagnostics.recent.length = 200;
  }
};

const pushConcoxTcpEvent = (evt: TcpEvent) => {
  concoxTcpDiagnostics.recent.unshift(evt);
  if (concoxTcpDiagnostics.recent.length > 200) {
    concoxTcpDiagnostics.recent.length = 200;
  }
};

const pushQueclinkTcpEvent = (evt: TcpEvent) => {
  queclinkTcpDiagnostics.recent.unshift(evt);
  if (queclinkTcpDiagnostics.recent.length > 200) {
    queclinkTcpDiagnostics.recent.length = 200;
  }
};

const buildBasicAuth = (user: string, pass: string) => Buffer.from(`${user}:${pass}`, "utf8").toString("base64");

async function traccarFetch(pathnameWithQuery: string, init: RequestInit = {}) {
  if (!TRACCAR_BASE_URL) {
    return { ok: false as const, status: 503, body: { error: "Traccar not configured" } };
  }
  const fetchFn = (globalThis as any).fetch as typeof fetch | undefined;
  if (!fetchFn) {
    return { ok: false as const, status: 500, body: { error: "fetch not available in runtime" } };
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as any)
  };
  if (TRACCAR_TOKEN) {
    headers.Authorization = `Bearer ${TRACCAR_TOKEN}`;
  } else if (TRACCAR_USERNAME && TRACCAR_PASSWORD) {
    headers.Authorization = `Basic ${buildBasicAuth(TRACCAR_USERNAME, TRACCAR_PASSWORD)}`;
  }
  const url = `${TRACCAR_BASE_URL}${pathnameWithQuery.startsWith("/") ? "" : "/"}${pathnameWithQuery}`;
  try {
    const resp = await fetchFn(url, { ...init, headers });
    const text = await resp.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: resp.ok, status: resp.status, body };
  } catch (e: any) {
    return { ok: false as const, status: 502, body: { error: "Traccar request failed", message: e?.message ?? String(e) } };
  }
}

const pickTraccarPositionAt = (position: any): string => {
  const raw = String(
    position?.deviceTime ??
      position?.fixTime ??
      position?.serverTime ??
      position?.timestamp ??
      ""
  ).trim();
  if (!raw) return "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
};

const traccarResolveLatestPositionByImei = async (imei: string) => {
  const clean = String(imei ?? "").trim();
  if (!clean) return null;

  const devicesResp = await traccarFetch("/api/devices?all=true");
  if (!devicesResp.ok || !Array.isArray(devicesResp.body)) return null;

  const device = (devicesResp.body as any[]).find((d: any) => String(d?.uniqueId ?? "").trim() === clean) ?? null;
  if (!device) return null;

  const deviceId = Number((device as any)?.id);
  if (!Number.isFinite(deviceId)) return null;

  let positions: any[] = [];
  const byDeviceResp = await traccarFetch(`/api/positions?deviceId=${encodeURIComponent(String(deviceId))}`);
  if (byDeviceResp.ok && Array.isArray(byDeviceResp.body)) {
    positions = byDeviceResp.body as any[];
  }

  if (!positions.length) {
    const positionId = Number((device as any)?.positionId);
    if (Number.isFinite(positionId)) {
      const byIdResp = await traccarFetch(`/api/positions?id=${encodeURIComponent(String(positionId))}`);
      if (byIdResp.ok && Array.isArray(byIdResp.body)) {
        positions = byIdResp.body as any[];
      }
    }
  }

  if (!positions.length) return null;

  const sorted = [...positions].sort((a, b) => {
    const aAt = Date.parse(String(a?.deviceTime ?? a?.fixTime ?? a?.serverTime ?? ""));
    const bAt = Date.parse(String(b?.deviceTime ?? b?.fixTime ?? b?.serverTime ?? ""));
    const aTs = Number.isFinite(aAt) ? aAt : -1;
    const bTs = Number.isFinite(bAt) ? bAt : -1;
    return bTs - aTs;
  });

  return sorted[0] ?? null;
};

let db: any;

// in-process bindings store used when sqlite isn't available
const _inMemoryBindings: Record<string, any[]> = {};
// in-process KV store used when sqlite isn't available
const _inMemoryKv: Record<string, Record<string, string>> = {};

class InMemoryDB {
  assets: Record<string, any>[] = [];
  telemetry_events: Record<string, any>[] = [];
  alerts: Record<string, any>[] = [];
  pats: Record<string, any>[] = [];
  conversations: Record<string, any>[] = [];
  configuration_groups: Record<string, any>[] = [];
  device_reporting_settings: Record<string, any>[] = [];
  device_artifacts: Record<string, any>[] = [];
  device_push_queue: Record<string, any>[] = [];
  admin_sessions: Record<string, any>[] = [];
  deliver_store: Record<string, any>[] = [];

  exec(_sql: string) {
    return;
  }

  prepare(sql: string) {
    const self = this;
    return {
      all(...params: any[]) {
        // assets select
        if (sql.includes("FROM assets")) {
          const tenant = params[0] ?? "";
          return self.assets
            .filter((r) => r.tenant_id === tenant)
            .map((r) => ({ data: r.data, updated_at: r.updated_at }));
        }
        if (sql.includes("FROM telemetry_events")) {
          const tenant = params[0] ?? "";
          const imeiParam = params.length > 1 ? String(params[1] ?? "").trim() : "";
          const limitMatch = sql.match(/LIMIT (\d+)/i);
          const limit = limitMatch ? Number(limitMatch[1]) : undefined;
          const rows = self.telemetry_events.filter(
            (r) => r.tenant_id === tenant && (!imeiParam || String(r.imei ?? "").trim() === imeiParam)
          );
          rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return (limit ? rows.slice(0, limit) : rows).map((r) => ({ data: r.data, created_at: r.created_at }));
        }
        if (sql.includes("FROM alerts")) {
          const tenant = params[0] ?? "";
          const limitMatch = sql.match(/LIMIT (\d+)/i);
          const limit = limitMatch ? Number(limitMatch[1]) : undefined;
          const rows = self.alerts.filter((r) => r.tenant_id === tenant);
          rows.sort((a, b) => (String(a.updated_at ?? "") < String(b.updated_at ?? "") ? 1 : -1));
          return (limit ? rows.slice(0, limit) : rows).map((r) => ({ data: r.data, updated_at: r.updated_at }));
        }
        if (sql.includes("FROM pats")) {
          return self.pats.map((p) => ({ id: p.id, token: p.token, description: p.description, organisationName: p.organisationName, organisationGroup: p.organisationGroup, expiryDate: p.expiryDate, status: p.status, daysToExpiry: p.daysToExpiry, username: p.username, createdAt: p.createdAt }));
        }
        if (sql.includes("FROM conversations")) {
          return self.conversations.map((c) => ({ id: c.id, tenant_id: c.tenant_id, status: c.status, createdAt: c.createdAt, closedAt: c.closedAt, messages_json: c.messages_json }));
        }
        if (sql.includes("FROM configuration_groups")) {
          const tenant = params[0] ?? "";
          return self.configuration_groups.filter((g) => g.tenant_id === tenant).map((g) => ({ data: g.data, updated_at: g.updated_at }));
        }
        if (sql.includes("FROM device_reporting_settings")) {
          const tenant = params[0] ?? "";
          return self.device_reporting_settings.filter((r) => r.tenant_id === tenant).map((r) => ({ data: r.data, updated_at: r.updated_at }));
        }
        if (sql.includes("FROM device_artifacts")) {
          const tenant = params[0] ?? "";
          return self.device_artifacts.filter((r) => r.tenant_id === tenant).map((r) => ({ ...r }));
        }
        if (sql.includes("FROM device_push_queue")) {
          const tenant = params[0] ?? "";
          return self.device_push_queue.filter((r) => r.tenant_id === tenant).map((r) => ({ ...r }));
        }
        return [];
      },
      get(...params: any[]) {
        if (sql.includes("FROM device_reporting_settings")) {
          const tenant = params[0] ?? "";
          return self.device_reporting_settings.find((r) => r.tenant_id === tenant) ?? null;
        }
        if (sql.includes("FROM conversations WHERE id = ?")) {
          const id = params[0];
          return self.conversations.find((c) => c.id === id) ?? null;
        }
        if (sql.includes("FROM device_artifacts")) {
          const tenant = params[0] ?? "";
          if (sql.includes("type = ?")) {
            const type = params[1] ?? "";
            const rows = self.device_artifacts.filter((r) => r.tenant_id === tenant && r.type === type);
            rows.sort((a, b) => {
              const baseDiff = Number(b.is_base ?? 0) - Number(a.is_base ?? 0);
              if (baseDiff !== 0) return baseDiff;
              return String(a.created_at ?? "") < String(b.created_at ?? "") ? 1 : -1;
            });
            return rows[0] ?? null;
          }
          const id = params[1] ?? "";
          return self.device_artifacts.find((r) => r.tenant_id === tenant && r.id === id) ?? null;
        }
        if (sql.includes("FROM device_push_queue")) {
          const tenant = params[0] ?? "";
          const imei = params[1] ?? "";
          const row = self.device_push_queue
            .filter((r) => r.tenant_id === tenant && r.imei === imei && r.status === "queued")
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
          return row ?? null;
        }
        if (sql.includes("FROM deliver_store")) {
          const tenant_id = params[0] ?? "";
          return self.deliver_store.find((r) => r.tenant_id === tenant_id) ?? null;
        }
        return null;
      },
      run(...params: any[]) {
        // handle various inserts/updates
        if (sql.startsWith("INSERT OR REPLACE INTO assets")) {
          const [id, tenant_id, data, updated_at] = params;
          const idx = self.assets.findIndex((a) => a.id === id && a.tenant_id === tenant_id);
          const rec = { id, tenant_id, data: typeof data === "string" ? JSON.parse(data) : data, updated_at };
          if (idx >= 0) self.assets[idx] = rec;
          else self.assets.push(rec);
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO telemetry_events")) {
          const [id, tenant_id, type, asset_id, imei, created_at, data] = params;
          self.telemetry_events.unshift({ id, tenant_id, type, asset_id, imei, created_at, data: typeof data === "string" ? JSON.parse(data) : data });
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT OR REPLACE INTO alerts")) {
          const [id, tenant_id, data, updated_at] = params;
          const idx = self.alerts.findIndex((a) => a.id === id && a.tenant_id === tenant_id);
          const rec = { id, tenant_id, data: typeof data === "string" ? JSON.parse(data) : data, updated_at };
          if (idx >= 0) self.alerts[idx] = rec;
          else self.alerts.push(rec);
          return { changes: 1 };
        }
        if (sql.startsWith("DELETE FROM alerts")) {
          const [tenant_id, id] = params;
          const before = self.alerts.length;
          self.alerts = self.alerts.filter((a) => !(a.tenant_id === tenant_id && a.id === id));
          return { changes: before - self.alerts.length };
        }
        if (sql.startsWith("INSERT INTO pats")) {
          const [id, token, description, organisationName, organisationGroup, expiryDate, status, daysToExpiry, username, createdAt, data] = params;
          self.pats.push({ id, token, description, organisationName, organisationGroup, expiryDate, status, daysToExpiry, username, createdAt, data });
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO conversations")) {
          const [id, tenant_id, status, createdAt, messages_json] = params;
          self.conversations.push({ id, tenant_id, status, createdAt, messages_json });
          return { changes: 1 };
        }
        if (sql.startsWith("UPDATE conversations SET messages_json = ? WHERE id = ?")) {
          const [messages_json, id] = params;
          const conv = self.conversations.find((c) => c.id === id);
          if (conv) conv.messages_json = messages_json;
          return { changes: conv ? 1 : 0 };
        }
        if (sql.startsWith("UPDATE conversations SET status = ?")) {
          const [status, closedAt, id] = params;
          const conv = self.conversations.find((c) => c.id === id);
          if (conv) {
            conv.status = status;
            conv.closedAt = closedAt;
          }
          return { changes: conv ? 1 : 0 };
        }
        if (sql.startsWith("INSERT INTO configuration_groups")) {
          const [id, tenant_id, data, updated_at] = params;
          const idx = self.configuration_groups.findIndex((g) => g.id === id && g.tenant_id === tenant_id);
          const rec = { id, tenant_id, data: typeof data === "string" ? JSON.parse(data) : data, updated_at };
          if (idx >= 0) self.configuration_groups[idx] = rec;
          else self.configuration_groups.push(rec);
          return { changes: 1 };
        }
        if (sql.startsWith("DELETE FROM configuration_groups")) {
          const [tenant_id, id] = params;
          const before = self.configuration_groups.length;
          self.configuration_groups = self.configuration_groups.filter((g) => !(g.tenant_id === tenant_id && g.id === id));
          return { changes: before - self.configuration_groups.length };
        }
        if (sql.startsWith("INSERT INTO device_reporting_settings")) {
          const [tenant_id, data, updated_at] = params;
          const idx = self.device_reporting_settings.findIndex((r) => r.tenant_id === tenant_id);
          const rec = { tenant_id, data: typeof data === "string" ? JSON.parse(data) : data, updated_at };
          if (idx >= 0) self.device_reporting_settings[idx] = rec;
          else self.device_reporting_settings.push(rec);
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO device_artifacts")) {
          const [id, tenant_id, type, name, version, r2_key, content_type, sha256, is_base, created_at] = params;
          self.device_artifacts.push({ id, tenant_id, type, name, version, r2_key, content_type, sha256, is_base, created_at });
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO device_push_queue")) {
          const [id, tenant_id, imei, asset_id, status, payload, created_at, updated_at] = params;
          self.device_push_queue.push({ id, tenant_id, imei, asset_id, status, payload, created_at, updated_at });
          return { changes: 1 };
        }
        if (sql.startsWith("UPDATE device_push_queue SET status = 'delivered'")) {
          const [updated_at, tenant_id, id, imei] = params;
          const rec = self.device_push_queue.find((r) => r.tenant_id === tenant_id && r.id === id && r.imei === imei);
          if (rec) {
            rec.status = "delivered";
            rec.updated_at = updated_at;
            return { changes: 1 };
          }
          if (sql.startsWith("INSERT INTO deliver_store") || sql.startsWith("INSERT OR REPLACE INTO deliver_store")) {
            const [tenant_id, data, updated_at] = params;
            const idx = self.deliver_store.findIndex((r) => r.tenant_id === tenant_id);
            const rec = { tenant_id, data: String(data ?? ""), updated_at };
            if (idx >= 0) self.deliver_store[idx] = rec;
            else self.deliver_store.push(rec);
            return { changes: 1 };
          }
          return { changes: 0 };
        }
        return { changes: 0 };
      }
    };
  }
}

function timingSafeEq(a: string, b: string) {
  const ab = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifyAdminPassword(plain: string) {
  if (ADMIN_PASSWORD_HASH && ADMIN_PASSWORD_HASH.startsWith("scrypt:")) {
    try {
      const parts = ADMIN_PASSWORD_HASH.split(":");
      const saltHex = parts[1] ?? "";
      const hashHex = parts[2] ?? "";
      const salt = Buffer.from(saltHex, "hex");
      const expected = Buffer.from(hashHex, "hex");
      if (!salt.length || !expected.length) return false;
      const derived = crypto.scryptSync(String(plain ?? ""), salt, expected.length);
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  if (!ADMIN_PASSWORD) return false;
  return timingSafeEq(ADMIN_PASSWORD, String(plain ?? ""));
}

function readAuthToken(req: express.Request) {
  const header = String(req.header("x-api-key") ?? "").trim();
  if (header) return header;
  const auth = String(req.header("authorization") ?? "").trim();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] ?? "").trim() : "";
}

function normalizeTenantId(rawTenant: string) {
  const raw = String(rawTenant ?? "").trim();
  if (!raw) return "";
  const parts = raw
    .split(":")
    .map((p) => p.trim())
    .filter(Boolean);
  // tenant is database-scoped: dealer:org:db (ignore site)
  if (parts.length >= 3) return parts.slice(0, 3).join(":");
  return raw;
}

function readTenant(req: express.Request) {
  const raw = String(req.header("x-tenant-id") ?? (req.query as any)?.tenant ?? "").trim();
  const tenant = normalizeTenantId(raw);
  return { raw, tenant };
}

function nextAvailableNumericId(used: number[]): number {
  const set = new Set(
    used
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.floor(n))
  );
  let candidate = 1;
  while (set.has(candidate)) candidate += 1;
  return candidate;
}

function listAssetIdsForTenant(tenant: string, rawTenant?: string): number[] {
  try {
    const t = tenant || "";
    const r = String(rawTenant ?? "").trim();
    const rows = r && r !== t
      ? db.prepare("SELECT data FROM assets WHERE tenant_id = ? OR tenant_id = ?").all(t, r)
      : db.prepare("SELECT data FROM assets WHERE tenant_id = ?").all(t);
    const ids: number[] = [];
    for (const row of rows as any[]) {
      try {
        const parsed = JSON.parse(String((row as any).data ?? "{}"));
        const n = Number((parsed as any).assetId ?? 0);
        if (n > 0) ids.push(n);
      } catch {
        // ignore
      }
    }
    return ids;
  } catch {
    return [];
  }
}

function normalizeAssetIdsForTenant(tenant: string) {
  try {
    const rows = db.prepare("SELECT id, data, updated_at FROM assets WHERE tenant_id = ? ORDER BY updated_at ASC, id ASC").all(tenant) as Array<any>;
    if (!rows.length) return;

    const updates: Array<{ id: string; data: any; updatedAt: string }> = [];
    let nextId = 1;

    for (const row of rows) {
      const id = String(row?.id ?? "").trim();
      if (!id) continue;
      const parsed = parseStoredJson(row?.data) ?? {};
      const current = Number((parsed as any)?.assetId ?? 0);
      const desired = nextId;
      nextId += 1;
      if (!Number.isFinite(current) || Math.floor(current) !== desired) {
        updates.push({
          id,
          data: { ...(parsed as any), id, assetId: desired },
          updatedAt: String(row?.updated_at ?? "") || new Date().toISOString()
        });
      }
    }

    if (!updates.length) return;
    const stmt = db.prepare("INSERT OR REPLACE INTO assets (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)");
    for (const u of updates) {
      stmt.run(u.id, tenant, JSON.stringify(u.data), u.updatedAt);
    }
  } catch {
    // ignore normalization failures
  }
}

if (Database) {
  try {
    const dbDir = path.dirname(DB_PATH);
    if (dbDir) fs.mkdirSync(dbDir, { recursive: true });
    db = new Database(DB_PATH);
  } catch (e: any) {
    throw new Error(`Failed to open SQLite DB at ${DB_PATH}: ${e?.message ?? String(e)}`);
  }
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
    CREATE TABLE IF NOT EXISTS telemetry_events (id TEXT, tenant_id TEXT, type TEXT, asset_id TEXT, imei TEXT, created_at TEXT, data TEXT, PRIMARY KEY (id, tenant_id));
    CREATE TABLE IF NOT EXISTS telemetry_archives (event_id TEXT, tenant_id TEXT, asset_id TEXT, imei TEXT, created_at TEXT, storage TEXT, storage_key TEXT, content_type TEXT, size_bytes INTEGER, PRIMARY KEY (event_id, tenant_id));
    CREATE TABLE IF NOT EXISTS alerts (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
    CREATE TABLE IF NOT EXISTS pats (id TEXT PRIMARY KEY, token TEXT, description TEXT, organisationName TEXT, organisationGroup TEXT, expiryDate TEXT, status TEXT, daysToExpiry INTEGER, username TEXT, createdAt TEXT, data TEXT);
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, tenant_id TEXT, status TEXT, createdAt TEXT, closedAt TEXT, user_json TEXT, messages_json TEXT);
    CREATE TABLE IF NOT EXISTS bindings (type TEXT, id TEXT, data TEXT, PRIMARY KEY(type, id));
    CREATE TABLE IF NOT EXISTS configuration_groups (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
    CREATE TABLE IF NOT EXISTS device_reporting_settings (tenant_id TEXT PRIMARY KEY, data TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS device_artifacts (id TEXT, tenant_id TEXT, type TEXT, name TEXT, version TEXT, r2_key TEXT, content_type TEXT, sha256 TEXT, is_base INTEGER, created_at TEXT, PRIMARY KEY (id, tenant_id));
    CREATE TABLE IF NOT EXISTS device_push_queue (id TEXT, tenant_id TEXT, imei TEXT, asset_id TEXT, status TEXT, payload TEXT, created_at TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
    CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, created_at TEXT, expires_at TEXT);
    CREATE TABLE IF NOT EXISTS password_reset_requests (id TEXT PRIMARY KEY, email TEXT, tenant_id TEXT, ip TEXT, user_agent TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS deliver_store (tenant_id TEXT PRIMARY KEY, data TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS support_agents (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
    CREATE TABLE IF NOT EXISTS kv_store (k TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (k, tenant_id));
    CREATE TABLE IF NOT EXISTS camera_health (camera_id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (camera_id, tenant_id));
    CREATE TABLE IF NOT EXISTS camera_audio_chunks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      camera_id TEXT,
      recorded_at TEXT,
      sample_rate INTEGER,
      channels INTEGER,
      bytes INTEGER,
      file_path TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS talkback_queue (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      camera_id TEXT,
      sample_rate INTEGER,
      channels INTEGER,
      payload_base64 TEXT,
      status TEXT,
      created_at TEXT,
      delivered_at TEXT
    );
  `);
  // lightweight migrations table and user_version init
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT);`);
    // ensure a minimum user_version so future migrations can be guarded
    try {
      const uvRow: any = db.prepare("PRAGMA user_version").get();
      let userVersion = 0;
      if (uvRow && typeof uvRow.user_version !== "undefined") userVersion = Number(uvRow.user_version);
      else if (typeof uvRow === "number") userVersion = Number(uvRow);
      if (!userVersion) db.exec("PRAGMA user_version = 1;");
    } catch (e) {
      // ignore if pragma read/write isn't supported in this runtime
    }
  } catch (e) {
    // ignore migrations table creation errors
  }
} else {
  if (REQUIRE_PERSISTENT_DB) {
    throw new Error(
      "Persistent DB is required but better-sqlite3 is unavailable. " +
      "Install dependencies on VPS with 'npm ci' and ensure native module build prerequisites are present."
    );
  }
  // fallback to in-memory DB for development-only environments without native sqlite build tools
  db = new InMemoryDB();
}

const readLatestTelemetryAt = (tenant?: string) => {
  try {
    const t = String(tenant ?? "").trim();
    const row = t
      ? db.prepare("SELECT created_at FROM telemetry_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1").get(t)
      : db.prepare("SELECT created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 1").get();
    const at = String(row?.created_at ?? "").trim();
    return at || null;
  } catch {
    return null;
  }
};

const readTelemetryCount = (tenant?: string) => {
  try {
    const t = String(tenant ?? "").trim();
    const row = t
      ? db.prepare("SELECT COUNT(1) AS c FROM telemetry_events WHERE tenant_id = ?").get(t)
      : db.prepare("SELECT COUNT(1) AS c FROM telemetry_events").get();
    const c = Number((row as any)?.c ?? 0);
    return Number.isFinite(c) ? c : 0;
  } catch {
    return 0;
  }
};

// bindings helpers (sqlite-backed when available)
function loadBindingsFromDb(type?: string) {
  try {
    if (!Database) {
      if (!type) {
        return Object.entries(_inMemoryBindings).flatMap(([t, arr]) => (arr || []).map((r) => ({ type: t, ...(r || {}) })));
      }
      return (_inMemoryBindings[type] || []).map((r) => ({ type, ...(r || {}) }));
    }
    const stmt = type ? db.prepare("SELECT type, id, data FROM bindings WHERE type = ?") : db.prepare("SELECT type, id, data FROM bindings");
    const rows = type ? stmt.all(type) : stmt.all();
    return rows.map((r: any) => ({ type: r.type, id: r.id, ...(r.data ? JSON.parse(r.data) : {}) }));
  } catch (e) {
    return [];
  }
}

function persistBindingToDb(type: string, rec: any) {
  try {
    if (!Database) {
      const arr = _inMemoryBindings[type] || [];
      const idx = arr.findIndex((r) => String(r.id ?? "") === String(rec.id ?? ""));
      if (idx >= 0) arr[idx] = { ...arr[idx], ...rec };
      else arr.push(rec);
      _inMemoryBindings[type] = arr;
      return;
    }
    db.prepare("INSERT OR REPLACE INTO bindings (type, id, data) VALUES (?, ?, ?)").run(type, rec.id, JSON.stringify(rec));
  } catch (e) {
    console.warn("persistBindingToDb failed", e);
  }
}

function deleteBindingFromDb(type: string, id: string) {
  try {
    if (!Database) {
      const arr = _inMemoryBindings[type] || [];
      _inMemoryBindings[type] = arr.filter((r) => String(r.id ?? "") !== String(id ?? ""));
      return;
    }
    db.prepare("DELETE FROM bindings WHERE type = ? AND id = ?").run(type, id);
  } catch (e) {
    console.warn("deleteBindingFromDb failed", e);
  }
}

function sanitizeCameraId(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .slice(0, 96);
}

function resolveCameraId(req: express.Request, body?: any) {
  return (
    sanitizeCameraId(body?.cameraId)
    || sanitizeCameraId(body?.deviceId)
    || sanitizeCameraId(body?.id)
    || sanitizeCameraId(req.query.cameraId)
    || sanitizeCameraId(req.query.deviceId)
    || sanitizeCameraId(req.query.id)
  );
}

function toIsoTimestamp(input: unknown) {
  const raw = String(input ?? "").trim();
  if (!raw) return new Date().toISOString();
  const ms = Date.parse(raw);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) return new Date(asNum).toISOString();
  return new Date().toISOString();
}

function ensureRecordingPath(tenantRaw: string, cameraIdRaw: string, recordedAtIso: string) {
  const tenant = sanitizeCameraId(tenantRaw) || "default";
  const cameraId = sanitizeCameraId(cameraIdRaw) || "camera-unknown";
  const yyyyMmDd = recordedAtIso.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const dir = path.join(CAMERA_RECORDINGS_DIR, tenant, cameraId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${yyyyMmDd}.pcm`);
  return { tenant, cameraId, filePath };
}

function upsertCameraHealth(tenant: string, cameraId: string, payload: any, atIso: string) {
  const next = {
    ...(payload ?? {}),
    id: cameraId,
    cameraId,
    tenantId: tenant,
    lastSeenAt: atIso
  };
  db.prepare("INSERT OR REPLACE INTO camera_health (camera_id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)")
    .run(cameraId, tenant || "", JSON.stringify(next), atIso);
  return next;
}

function listCameraHealth(tenant: string) {
  const rows = db
    .prepare("SELECT camera_id, data, updated_at FROM camera_health WHERE tenant_id = ? ORDER BY updated_at DESC")
    .all(tenant || "");
  return rows
    .map((r: any) => {
      let parsed: any = {};
      try {
        parsed = r?.data ? JSON.parse(String(r.data)) : {};
      } catch {
        parsed = {};
      }
      return {
        ...parsed,
        id: sanitizeCameraId(parsed?.id) || sanitizeCameraId(r?.camera_id) || "camera-unknown",
        cameraId: sanitizeCameraId(parsed?.cameraId) || sanitizeCameraId(r?.camera_id) || "camera-unknown",
        lastSeenAt: String(parsed?.lastSeenAt ?? r?.updated_at ?? "")
      };
    })
    .filter((row: any) => row.cameraId);
}

const liveText = (value: unknown) => String(value ?? "").trim();

const liveHasValue = (value: unknown) => {
  const raw = liveText(value).toLowerCase();
  if (!raw) return false;
  return raw !== "-" && raw !== "--" && raw !== "n/a" && raw !== "none" && raw !== "null" && raw !== "undefined";
};

const liveNormalizeChannelKey = (value: unknown) =>
  liveText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const liveChannelLabelByIndex = (index: number) => {
  if (index === 1) return "Forward";
  if (index === 2) return "DMS";
  if (index === 3) return "In cab";
  if (index === 4) return "External L";
  if (index === 5) return "External R";
  return `Camera ${index}`;
};

const liveNormalizeUrlCandidate = (value: unknown, index: number) => {
  let raw = liveText(value);
  if (!raw) return "";
  raw = raw
    .replace(/\{channel\}|\$\{channel\}|:channel/gi, String(index))
    .replace(/\{index\}|\$\{index\}|:index/gi, String(index));
  if (!raw) return "";
  if (/^(https?:|wss?:|rtsp:)/i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^[a-z0-9.-]+(?::\d+)?\//i.test(raw) || /^[a-z0-9.-]+(?::\d+)$/i.test(raw)) {
    return `http://${raw}`;
  }
  return "";
};

const liveReadChannelUrl = (row: Record<string, unknown>, index: number, key: string) => {
  const candidates = [
    row.streamUrl,
    row.liveStreamUrl,
    row.url,
    row.liveUrl,
    row.videoUrl,
    row.hlsUrl,
    row.webrtcUrl,
    row.rtspUrl,
    row.stream,
    row.hls,
    row.webrtc,
    row.rtsp,
    row.playbackUrl,
    row.streamUrlTemplate,
    row.channelUrlTemplate,
    row.liveUrlTemplate,
    row[`${key}StreamUrl`],
    row[`${key}Url`],
    row[`channel${index}StreamUrl`],
    row[`channel${index}Url`],
    row[`streamUrl${index}`],
    row[`liveUrl${index}`]
  ];

  for (const value of candidates) {
    const next = liveNormalizeUrlCandidate(value, index);
    if (!next) continue;
    return next;
  }

  const listCandidates = [row.channelUrls, row.streamUrls, row.liveUrls, row.hlsUrls];
  for (const candidate of listCandidates) {
    if (Array.isArray(candidate)) {
      const next = liveNormalizeUrlCandidate(candidate[index - 1], index);
      if (next) return next;
      continue;
    }
    if (candidate && typeof candidate === "object") {
      const map = candidate as Record<string, unknown>;
      const mapCandidates = [
        map[String(index)],
        map[key],
        map[liveChannelLabelByIndex(index)],
        map[liveChannelLabelByIndex(index).toLowerCase()],
        map[liveChannelLabelByIndex(index).replace(/\s+/g, "")],
        map[liveChannelLabelByIndex(index).toLowerCase().replace(/\s+/g, "")]
      ];
      for (const item of mapCandidates) {
        const next = liveNormalizeUrlCandidate(item, index);
        if (next) return next;
      }
    }
  }

  const channels = row.channels;
  if (Array.isArray(channels)) {
    const entry = channels[index - 1] as any;
    const next = liveNormalizeUrlCandidate(
      entry?.streamUrl
        ?? entry?.url
        ?? entry?.hlsUrl
        ?? entry?.webrtcUrl
        ?? entry?.rtspUrl
        ?? entry?.playbackUrl,
      index
    );
    if (next) return next;
  }

  // Last fallback: reuse a base URL and append channel as a query parameter.
  const shared = liveNormalizeUrlCandidate(
    row.streamUrl
      ?? row.liveStreamUrl
      ?? row.url
      ?? row.liveUrl
      ?? row.videoUrl
      ?? row.hlsUrl
      ?? row.webrtcUrl
      ?? row.rtspUrl,
    index
  );
  if (shared) {
    try {
      const parsed = new URL(shared);
      if (!parsed.searchParams.has("channel")) parsed.searchParams.set("channel", String(index));
      return parsed.toString();
    } catch {
      return shared;
    }
  }

  return "";
};

const liveResolveSessionUrl = (value: unknown, origin: string) => {
  const raw = liveText(value);
  if (!raw) return "";
  if (/^(https?:|wss?:|rtsp:)/i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^\//.test(raw) && origin) return `${origin.replace(/\/$/, "")}${raw}`;
  return raw;
};

const liveReadUrlFromUnknown = (value: unknown, index: number, key: string, label: string) => {
  if (!value) return "";
  if (typeof value === "string") return liveNormalizeUrlCandidate(value, index);
  if (Array.isArray(value)) {
    const byIndex = liveNormalizeUrlCandidate(value[index - 1], index);
    if (byIndex) return byIndex;
    return "";
  }
  if (typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  const direct = [
    row.streamUrl,
    row.url,
    row.hlsUrl,
    row.webrtcUrl,
    row.rtspUrl,
    row.playbackUrl,
    row[`${key}StreamUrl`],
    row[`${key}Url`],
    row[String(index)],
    row[key],
    row[label],
    row[label.toLowerCase()],
    row[label.replace(/\s+/g, "")],
    row[label.toLowerCase().replace(/\s+/g, "")]
  ];
  for (const candidate of direct) {
    const resolved = liveNormalizeUrlCandidate(candidate, index);
    if (resolved) return resolved;
  }
  const channels = row.channels;
  if (Array.isArray(channels)) {
    const entry = channels[index - 1] as any;
    return liveNormalizeUrlCandidate(
      entry?.streamUrl
        ?? entry?.url
        ?? entry?.hlsUrl
        ?? entry?.webrtcUrl
        ?? entry?.rtspUrl
        ?? entry?.playbackUrl,
      index
    );
  }
  return "";
};

const resolveLiveStreamFromDeviceServer = async (
  cameraId: string,
  channel: number,
  channelKey: string,
  channelLabel: string,
  diagnostics?: {
    attemptedEndpoints: string[];
    matchedEndpoint?: string;
    endpointStatuses?: Array<{ endpoint: string; status: number }>;
  }
) => {
  if (!DEVICE_SERVER_DOMAIN || !DEVICE_SERVER_PORT) return "";
  const fetchFn = (globalThis as any).fetch as typeof fetch | undefined;
  if (!fetchFn) return "";
  const base = `${DEVICE_SERVER_PROTOCOL}://${DEVICE_SERVER_DOMAIN}:${DEVICE_SERVER_PORT}`.replace(/\/$/, "");
  const id = encodeURIComponent(String(cameraId ?? "").trim());
  if (!id) return "";

  const queries = new URLSearchParams({
    channel: String(channel),
    channelKey: String(channelKey ?? "").trim(),
    channelLabel: String(channelLabel ?? "").trim()
  });
  const attempts = [
    `${base}/devices/${id}/stream?${queries.toString()}`,
    `${base}/devices/${id}/live?${queries.toString()}`,
    `${base}/device/${id}/stream?${queries.toString()}`,
    `${base}/stream/${id}?${queries.toString()}`,
    `${base}/devices/${id}`
  ];

  const headers: Record<string, string> = { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" };
  if (DEVICE_SERVER_API_KEY) headers["x-api-key"] = DEVICE_SERVER_API_KEY;

  for (const endpoint of attempts) {
    if (diagnostics) diagnostics.attemptedEndpoints.push(endpoint);
    try {
      const resp = await fetchFn(endpoint, { method: "GET", headers });
      if (diagnostics) {
        diagnostics.endpointStatuses = diagnostics.endpointStatuses ?? [];
        diagnostics.endpointStatuses.push({ endpoint, status: Number(resp.status ?? 0) });
      }
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text) continue;
      const fromText = liveNormalizeUrlCandidate(text.trim(), channel);
      if (fromText) {
        if (diagnostics) diagnostics.matchedEndpoint = endpoint;
        return liveResolveSessionUrl(fromText, base);
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const fromJson = liveReadUrlFromUnknown(parsed, channel, channelKey, channelLabel);
      if (fromJson) {
        if (diagnostics) diagnostics.matchedEndpoint = endpoint;
        return liveResolveSessionUrl(fromJson, base);
      }
    } catch {
      continue;
    }
  }

  return "";
};

const resolveLiveStreamFromProvider = async (
  assetId: string,
  cameraId: string,
  channel: number,
  channelKey: string,
  channelLabel: string,
  diagnostics?: {
    attemptedEndpoints: string[];
    matchedEndpoint?: string;
    endpointStatuses?: Array<{ endpoint: string; status: number }>;
  }
) => {
  if (!LIVE_STREAM_PROVIDER_URL) return "";
  const fetchFn = (globalThis as any).fetch as typeof fetch | undefined;
  if (!fetchFn) return "";

  const body = {
    ...(assetId ? { assetId } : {}),
    ...(cameraId ? { cameraId } : {}),
    channel,
    channelKey,
    channelLabel
  };

  const base = LIVE_STREAM_PROVIDER_URL.replace(/\/$/, "");
  const endpoints = [
    base,
    `${base}/camera/live/session`,
    `${base}/live/session`,
    `${base}/stream/session`,
    `${base}/stream/live`
  ];

  const headers: Record<string, string> = {
    "content-type": "application/json",
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8"
  };
  if (LIVE_STREAM_PROVIDER_API_KEY) {
    headers["x-api-key"] = LIVE_STREAM_PROVIDER_API_KEY;
    headers.Authorization = `Bearer ${LIVE_STREAM_PROVIDER_API_KEY}`;
  }
  if (LIVE_STREAM_PROVIDER_TENANT) headers["x-tenant-id"] = LIVE_STREAM_PROVIDER_TENANT;

  for (const endpoint of endpoints) {
    if (diagnostics) diagnostics.attemptedEndpoints.push(endpoint);
    try {
      const resp = await fetchFn(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
      if (diagnostics) {
        diagnostics.endpointStatuses = diagnostics.endpointStatuses ?? [];
        diagnostics.endpointStatuses.push({ endpoint, status: Number(resp.status ?? 0) });
      }
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text) continue;
      const fromText = liveNormalizeUrlCandidate(text.trim(), channel);
      if (fromText) {
        if (diagnostics) diagnostics.matchedEndpoint = endpoint;
        return fromText;
      }
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const fromPayload = liveReadUrlFromUnknown(
        parsed?.streamUrl
          ?? parsed?.url
          ?? parsed?.data
          ?? parsed?.payload
          ?? parsed,
        channel,
        channelKey,
        channelLabel
      );
      if (fromPayload) {
        if (diagnostics) diagnostics.matchedEndpoint = endpoint;
        return fromPayload;
      }
    } catch {
      continue;
    }
  }

  return "";
};

const liveBuildChannels = (camera: Record<string, unknown> | null, asset: Record<string, unknown> | null) => {
  const labels: string[] = [];

  const addLabel = (value: unknown) => {
    const label = liveText(value);
    if (!label || labels.includes(label)) return;
    labels.push(label);
  };

  const collect = (row: Record<string, unknown> | null) => {
    if (!row) return;
    const arrays = [row.channelNames, row.selectedChannels, row.cameraChannelsSelected];
    for (const arr of arrays) {
      if (!Array.isArray(arr)) continue;
      for (const value of arr) addLabel(value);
    }

    if (liveHasValue(row.forward) || liveHasValue(row.forwardCamera)) addLabel("Forward");
    if (liveHasValue((row as any).adas) || liveHasValue((row as any).adasCamera)) addLabel("ADAS");
    if (liveHasValue((row as any).dms) || liveHasValue((row as any).dmsCamera)) addLabel("DMS");
    if (liveHasValue(row.inCab) || liveHasValue(row.inCabCamera)) addLabel("In cab");
  };

  collect(camera);
  collect(asset);

  const numericCandidates = [
    Number((camera as any)?.channelCount ?? 0),
    Number((camera as any)?.channels ?? 0),
    Number((asset as any)?.channelCount ?? 0),
    Number((asset as any)?.channels ?? 0),
    Number((asset as any)?.cameraChannels ?? 0)
  ].filter((n) => Number.isFinite(n) && n > 0) as number[];
  const declaredCount = numericCandidates.length ? Math.max(...numericCandidates) : 0;
  const count = Math.max(3, declaredCount, labels.length, 1);

  return Array.from({ length: Math.min(count, 16) }, (_, idx) => {
    const index = idx + 1;
    const label = labels[idx] || liveChannelLabelByIndex(index);
    const key = liveNormalizeChannelKey(label) || `channel-${index}`;
    const url =
      (camera ? liveReadChannelUrl(camera, index, key) : "")
      || (asset ? liveReadChannelUrl(asset, index, key) : "");
    return {
      index,
      key,
      label,
      ...(url ? { streamUrl: url } : {})
    };
  });
};

const liveFindRecordByNeedle = (rows: Record<string, unknown>[], needle: string, fields: string[]) => {
  const target = liveText(needle).toLowerCase();
  if (!target) return null;
  return rows.find((row) => fields.some((field) => liveText((row as any)?.[field]).toLowerCase() === target)) ?? null;
};


const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "25mb" }));

const normalizeNumber = (value: unknown) => {
  const num = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(num) ? num : null;
};

const isPrimitive = (v: unknown) => v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean";

const maybeNullSentinel = (v: unknown) => {
  if (typeof v === "number") {
    if (v === 32767 || v === 65535 || v === 2147483647 || v === 4294967295) return null;
  }
  return v;
};

const normalizeKey = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ouput/g, "output")
    .replace(/temperature/g, "temp")
    .replace(/[^a-z0-9]+/g, "");

const flattenTelemetry = (payload: any, limit = 2500) => {
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
      for (let i = 0; i < Math.min(v.length, 50); i++) {
        queue.push({ v: v[i], path: `${path}[${i}]`, depth: depth + 1 });
      }
      continue;
    }
    if (depth >= 6) continue;
    for (const [k, child] of Object.entries(v)) {
      const nextPath = path ? `${path}.${k}` : k;
      queue.push({ v: child, path: nextPath, depth: depth + 1 });
    }
  }
  return out;
};

let _teltonikaIoNameById: Record<number, string> | null = null;
let _teltonikaIoIdByNormName: Record<string, number> | null = null;

const tryLoadTeltonikaIoMap = () => {
  if (_teltonikaIoNameById && _teltonikaIoIdByNormName) return;
  const candidates = [
    process.env.TELTONIKA_CFG_PATH,
    path.join(process.cwd(), "vivi_telematic", "120 - 190 FMB Configuration File New.cfg"),
    path.join(process.cwd(), "..", "120 - 190 FMB Configuration File New.cfg"),
    path.join(process.cwd(), "..", "vivi_telematic", "120 - 190 FMB Configuration File New.cfg"),
    path.join(process.cwd(), "..", "..", "vivi_telematic", "120 - 190 FMB Configuration File New.cfg")
  ].filter(Boolean) as string[];

  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) {
    _teltonikaIoNameById = {};
    _teltonikaIoIdByNormName = {};
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
      const [kRaw, vRaw] = token.split(":", 2);
      const keyStr = String(kRaw ?? "").trim();
      const name = String(vRaw ?? "").trim();
      if (!keyStr || !name) continue;
      if (!/^\d+$/.test(keyStr)) continue;
      const id = Number(keyStr);
      if (!Number.isFinite(id) || id < 1) continue;
      // Skip obvious numeric values; keep name-like values.
      if (/^\d+$/.test(name)) continue;
      byId[id] = name;
      const norm = normalizeKey(name);
      if (norm && typeof byNorm[norm] === "undefined") byNorm[norm] = id;
    }
    _teltonikaIoNameById = byId;
    _teltonikaIoIdByNormName = byNorm;
  } catch {
    _teltonikaIoNameById = {};
    _teltonikaIoIdByNormName = {};
  }
};

const buildIoNamedSnapshotFromTelemetry = (telemetryBody: any) => {
  tryLoadTeltonikaIoMap();
  const byId = _teltonikaIoNameById || {};
  const flat = flattenTelemetry(telemetryBody);
  const ioIdValues: Record<number, unknown> = {};

  for (const { key, value } of flat) {
    const lastSeg = key.split(".").slice(-1)[0] ?? "";
    // common Traccar attribute keys: io<id> (e.g. io8000)
    const m = String(lastSeg).match(/^io(\d{3,6})$/i) || String(lastSeg).match(/^(\d{3,6})$/);
    if (!m) continue;
    const id = Number(m[1]);
    if (!Number.isFinite(id)) continue;
    if (!isPrimitive(value)) continue;
    ioIdValues[id] = maybeNullSentinel(value);
  }

  const named: Record<string, unknown> = {};
  for (const [idStr, value] of Object.entries(ioIdValues)) {
    const id = Number(idStr);
    const name = byId[id];
    if (!name) continue;
    // Keep first occurrence of a name to avoid collisions.
    if (typeof named[name] === "undefined") named[name] = value;
  }
  return { ioById: ioIdValues, ioNamed: named };
};

const extractMonitoredValue = (telemetry: any, monitoredName: string) => {
  const flat = flattenTelemetry(telemetry);
  const keyIndex: Record<string, unknown> = {};
  const ioIdValues: Record<number, unknown> = {};

  for (const { key, value } of flat) {
    const lastSeg = key.split(".").slice(-1)[0] ?? "";
    const normLast = normalizeKey(lastSeg);
    if (normLast && typeof keyIndex[normLast] === "undefined") {
      keyIndex[normLast] = value;
    }

    // capture ioXXXX patterns
    const m = String(lastSeg).match(/^(?:io)?(\d{3,6})$/i) || String(lastSeg).match(/^io(\d{3,6})$/i);
    if (m) {
      const id = Number(m[1]);
      if (Number.isFinite(id)) ioIdValues[id] = value;
    }
  }

  const normNeedle = normalizeKey(monitoredName);
  if (normNeedle && typeof keyIndex[normNeedle] !== "undefined") {
    return { found: true as const, value: keyIndex[normNeedle] };
  }

  tryLoadTeltonikaIoMap();
  const idByNorm = _teltonikaIoIdByNormName || {};
  const byId = _teltonikaIoNameById || {};

  const ioId = normNeedle ? idByNorm[normNeedle] : undefined;
  if (ioId && typeof ioIdValues[ioId] !== "undefined") {
    return { found: true as const, value: ioIdValues[ioId], ioId };
  }

  // Last chance: if telemetry contains io ids, map them to names and compare normalized names.
  for (const [idStr, v] of Object.entries(ioIdValues)) {
    const id = Number(idStr);
    const name = byId[id];
    if (!name) continue;
    if (normalizeKey(name) === normNeedle) {
      return { found: true as const, value: v, ioId: id };
    }
  }
  return { found: false as const };
};

const getMonitoredEventsForAsset = (tenant: string, asset: any) => {
  const configGroupValue = String(asset?.configGroup ?? "").trim();
  if (!configGroupValue) return [] as string[];
  const groups = listConfigGroups(tenant);
  const group = resolveByNameOrId(groups, configGroupValue);
  if (!group) return [] as string[];
  const notificationBinding = resolveByNameOrId(listBindings(tenant, "notifications"), String(group.notificationBinding ?? ""));
  const monitored = (notificationBinding as any)?.monitoredEvents;
  if (!Array.isArray(monitored)) return [] as string[];
  return monitored.map((s: any) => String(s ?? "").trim()).filter(Boolean);
};

const extractLatLng = (payload: Record<string, unknown>) => {
  const data = (payload.data as Record<string, unknown> | undefined) ?? payload;
  const lat = normalizeNumber(data.lat ?? data.latitude);
  const lng = normalizeNumber(data.lon ?? data.lng ?? data.longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng };
};

const haversineMeters = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const r = 6_371_000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
};

const toNumberOrNull = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isTeltonikaNullSentinel = (v: unknown) => {
  if (typeof v !== "number") return false;
  return v === 32767 || v === 65535 || v === 2147483647 || v === 4294967295;
};

function findTenantForImeiWithDefault(imei: string, preferredDefaultTenant = ""): string {
  const clean = String(imei ?? "").trim();
  if (!clean) return preferredDefaultTenant || "default";
  if (preferredDefaultTenant) return preferredDefaultTenant;

  try {
    if (!Database) {
      const rows = (db as any).assets as Array<{ tenant_id: string; data: any; updated_at: string }>;
      const matches = (rows || []).filter((r) => String(r?.data?.imei ?? "").trim() === clean);
      matches.sort((a, b) => (String(a.updated_at ?? "") < String(b.updated_at ?? "") ? 1 : -1));
      return String(matches[0]?.tenant_id ?? "").trim() || "default";
    }
    const like = `%\"imei\":\"${clean}\"%`;
    const row = db
      .prepare("SELECT tenant_id, updated_at FROM assets WHERE data LIKE ? ORDER BY updated_at DESC LIMIT 1")
      .get(like);
    return String(row?.tenant_id ?? "").trim() || "default";
  } catch {
    return "default";
  }
}

function findTenantForImei(imei: string): string {
  return findTenantForImeiWithDefault(imei, TELTONIKA_DEFAULT_TENANT);
}

function parseUtcCompactTimestampYYMMDDhhmmss(raw: string) {
  const clean = String(raw ?? "").trim();
  if (!/^\d{12}$/.test(clean)) return "";
  const yy = Number(clean.slice(0, 2));
  const mm = Number(clean.slice(2, 4));
  const dd = Number(clean.slice(4, 6));
  const hh = Number(clean.slice(6, 8));
  const mi = Number(clean.slice(8, 10));
  const ss = Number(clean.slice(10, 12));
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(hh) || !Number.isFinite(mi) || !Number.isFinite(ss)) return "";
  const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
  return new Date(Date.UTC(yyyy, mm - 1, dd, hh, mi, ss)).toISOString();
}

function parseUtcCompactTimestampYYYYMMDDhhmmss(raw: string) {
  const clean = String(raw ?? "").trim();
  if (!/^\d{14}$/.test(clean)) return "";
  const yyyy = Number(clean.slice(0, 4));
  const mm = Number(clean.slice(4, 6));
  const dd = Number(clean.slice(6, 8));
  const hh = Number(clean.slice(8, 10));
  const mi = Number(clean.slice(10, 12));
  const ss = Number(clean.slice(12, 14));
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(hh) || !Number.isFinite(mi) || !Number.isFinite(ss)) return "";
  return new Date(Date.UTC(yyyy, mm - 1, dd, hh, mi, ss)).toISOString();
}

function readConcoxImeiFromBcd(bytes: Buffer) {
  if (!bytes.length) return "";
  const digits = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
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

function normalizeFreematicsTelemetryBody(body: any) {
  const source = body && typeof body === "object" ? body : {};
  const lat = normalizeNumber(source.lat ?? source.latitude ?? source.gps?.lat ?? source.gps?.latitude);
  const lon = normalizeNumber(source.lon ?? source.lng ?? source.longitude ?? source.gps?.lon ?? source.gps?.lng ?? source.gps?.longitude);
  if (lat === null || lon === null) return null;

  const timestampRaw = String(source.timestamp ?? source.time ?? source.ts ?? source.at ?? "").trim();
  const parsedMs = timestampRaw ? Date.parse(timestampRaw) : Number.NaN;
  const timestampIso = Number.isFinite(parsedMs) ? new Date(parsedMs).toISOString() : new Date().toISOString();
  const imei = String(source.imei ?? source.deviceId ?? source.device?.imei ?? source.modem?.imei ?? source.id ?? "").trim();

  return {
    data: {
      imei,
      lat,
      lon,
      speed: normalizeNumber(source.speed ?? source.gps?.speed) ?? undefined,
      heading: normalizeNumber(source.heading ?? source.course ?? source.gps?.heading ?? source.gps?.course) ?? undefined,
      satellites: normalizeNumber(source.satellites ?? source.gps?.satellites) ?? undefined,
      altitude: normalizeNumber(source.altitude ?? source.gps?.altitude) ?? undefined,
      timestamp: timestampIso,
      provider: "freematics",
      raw: source
    }
  } as any;
}

function parseQueclinkTextMessage(rawLine: string) {
  const line = String(rawLine ?? "").trim().replace(/\r|\n/g, "").replace(/\$$/, "");
  if (!line.startsWith("+")) return null;

  const parts = line.split(",").map((s) => s.trim());
  if (!parts.length) return null;
  const head = parts[0] ?? "";
  const typeMatch = head.match(/^\+(?:RESP|BUFF|ACK):([^,]+)/i);
  const messageType = String(typeMatch?.[1] ?? "").trim() || "UNKNOWN";

  const imei = parts.find((p) => /^\d{14,17}$/.test(p)) ?? "";

  let lat: number | null = null;
  let lon: number | null = null;
  let speed: number | null = null;
  let heading: number | null = null;

  for (let i = 1; i < parts.length - 1; i += 1) {
    const a = normalizeNumber(parts[i]);
    const b = normalizeNumber(parts[i + 1]);
    if (a === null || b === null) continue;
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      lat = a;
      lon = b;
      const speedCandidate = normalizeNumber(parts[i + 2]);
      if (speedCandidate !== null && speedCandidate >= 0 && speedCandidate <= 400) speed = speedCandidate;
      const headingCandidate = normalizeNumber(parts[i + 3]);
      if (headingCandidate !== null && headingCandidate >= 0 && headingCandidate <= 360) heading = headingCandidate;
      break;
    }
  }

  if (lat === null || lon === null) return null;

  const stampRaw = [...parts].reverse().find((p) => /^\d{14}$/.test(p)) ?? "";
  const timestamp = stampRaw ? parseUtcCompactTimestampYYYYMMDDhhmmss(stampRaw) : new Date().toISOString();

  return {
    imei,
    messageType,
    lat,
    lon,
    speed,
    heading,
    timestamp,
    raw: line
  };
}

function findExistingAssetIdByImei(tenant: string, imei: string): string {
  const clean = String(imei ?? "").trim();
  if (!clean) return "";
  try {
    const row = db
      .prepare("SELECT data FROM assets WHERE tenant_id = ? AND data LIKE ? ORDER BY updated_at DESC LIMIT 1")
      .get(tenant, `%\"imei\":\"${clean}\"%`);
    const parsed: any = row?.data ? parseStoredJson(row.data) : null;
    const direct = String(parsed?.id ?? "").trim();
    if (direct) return direct;

    const rows = db
      .prepare("SELECT data FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC")
      .all(tenant);
    for (const candidate of rows as any[]) {
      const item: any = candidate?.data ? parseStoredJson(candidate.data) : null;
      if (!item) continue;
      const itemImei = String(item?.imei ?? "").trim();
      if (itemImei && itemImei === clean) {
        const id = String(item?.id ?? "").trim();
        if (id) return id;
      }
    }
    return "";
  } catch {
    return "";
  }
}

function archiveSafePart(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
}

function buildTelemetryArchiveKey(tenant: string, imei: string, createdAt: string, eventId: string) {
  const date = new Date(createdAt || Date.now());
  const yyyy = Number.isFinite(date.getTime()) ? String(date.getUTCFullYear()) : "unknown";
  const mm = Number.isFinite(date.getTime()) ? String(date.getUTCMonth() + 1).padStart(2, "0") : "00";
  const dd = Number.isFinite(date.getTime()) ? String(date.getUTCDate()).padStart(2, "0") : "00";
  const tenantPart = archiveSafePart(tenant || "default") || "default";
  const imeiPart = archiveSafePart(imei || "unknown") || "unknown";
  const eventPart = archiveSafePart(eventId || cryptoRandom()) || cryptoRandom();
  return `${TELEMETRY_ARCHIVE_PREFIX}/${tenantPart}/${imeiPart}/${yyyy}/${mm}/${dd}/${eventPart}.json.gz`;
}

async function archiveTelemetryEventAsync(args: {
  tenant: string;
  assetId: string;
  imei: string;
  eventId: string;
  createdAt: string;
  payload: Record<string, unknown>;
}) {
  const { tenant, assetId, imei, eventId, createdAt, payload } = args;
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const gzipBytes = zlib.gzipSync(payloadBytes);
  const storageKey = buildTelemetryArchiveKey(tenant, imei, createdAt, eventId);
  let storage: "b2" | "local" = "local";
  let finalKey = storageKey;

  if (b2Client) {
    try {
      await b2Client.send(
        new PutObjectCommand({
          Bucket: B2_BUCKET,
          Key: storageKey,
          Body: gzipBytes,
          ContentType: "application/json",
          ContentEncoding: "gzip",
          Metadata: {
            tenant: String(tenant || "default"),
            imei: String(imei || ""),
            eventid: String(eventId || ""),
            createdat: String(createdAt || "")
          }
        })
      );
      storage = "b2";
    } catch {
      storage = "local";
    }
  }

  if (storage === "local") {
    const localPath = path.join(TELEMETRY_ARCHIVE_LOCAL_DIR, ...storageKey.split("/"));
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, gzipBytes);
    finalKey = localPath;
  }

  try {
    db.prepare(
      "INSERT OR REPLACE INTO telemetry_archives (event_id, tenant_id, asset_id, imei, created_at, storage, storage_key, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(eventId, tenant, assetId, imei, createdAt, storage, finalKey, "application/json", Number(gzipBytes.length));
  } catch {
    // ignore index write failures
  }
}

async function readTelemetryArchivePayload(row: any) {
  const storage = String(row?.storage ?? "").trim().toLowerCase();
  const key = String(row?.storage_key ?? "").trim();
  if (!key) return null;

  try {
    let compressed: Buffer | null = null;
    if (storage === "b2" && b2Client) {
      const result = await b2Client.send(new GetObjectCommand({ Bucket: B2_BUCKET, Key: key }));
      const body: any = result?.Body;
      if (body && typeof body.transformToByteArray === "function") {
        compressed = Buffer.from(await body.transformToByteArray());
      } else if (body && typeof body.pipe === "function") {
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          body.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          body.on("end", () => resolve());
          body.on("error", (err: Error) => reject(err));
        });
        compressed = Buffer.concat(chunks);
      }
    } else if (fs.existsSync(key)) {
      compressed = fs.readFileSync(key);
    }

    if (!compressed || !compressed.length) return null;
    const jsonBytes = zlib.gunzipSync(compressed);
    return JSON.parse(jsonBytes.toString("utf8"));
  } catch {
    return null;
  }
}

function storeTelemetryEventForTenant(tenant: string, body: any) {
  const imei = String(
    body?.imei ??
      body?.uniqueId ??
      body?.deviceUniqueId ??
      body?.data?.imei ??
      ""
  ).trim();
  const deviceId = String(body?.deviceId ?? body?.device?.id ?? "").trim();

  // Default asset id guess (may be overridden by existing IMEI mapping below)
  let id = String(
    body?.id ??
      body?.assetId ??
      body?.registration ??
      deviceId ??
      body?.deviceName ??
      body?.device?.name ??
      imei ??
      ""
  ).trim();

  // Critical: if we know the IMEI, prefer updating the existing asset record for that IMEI
  // even when the incoming id is just the IMEI (prevents duplicate assets).
  // If the IMEI is not yet commissioned, keep ingest alive by using the IMEI as the stable asset id.
  if (imei) {
    const existingId = findExistingAssetIdByImei(tenant, imei);
    id = existingId || imei;
  }

  if (!id) {
    return { ok: false as const, status: 400, error: "Asset id is required." };
  }

  const eventTimestampCandidate = String(
    body?.data?.timestamp ??
    body?.timestamp ??
    body?.data?.at ??
    body?.at ??
    ""
  ).trim();
  const parsedEventTime = eventTimestampCandidate ? Date.parse(eventTimestampCandidate) : NaN;
  const deviceAtIso = Number.isNaN(parsedEventTime) ? "" : new Date(parsedEventTime).toISOString();
  // Always use server ingest time for freshness/status fields.
  const now = new Date().toISOString();
  const latLng = extractLatLng(body);
  if (!latLng) {
    return { ok: false as const, status: 400, error: "Latitude and longitude are required for telemetry." };
  }

  let existing = db.prepare("SELECT data FROM assets WHERE tenant_id = ? AND id = ?").get(tenant, id);
  if (!existing?.data && imei) {
    const row = db
      .prepare("SELECT data FROM assets WHERE tenant_id = ? AND data LIKE ? ORDER BY updated_at DESC LIMIT 1")
      .get(tenant, `%\"imei\":\"${imei}\"%`);
    if (row?.data) {
      existing = row;
    }
  }

  let previousAsset: Record<string, unknown> | null = null;
  if (existing?.data) {
    try {
      previousAsset = parseStoredJson(existing.data) ?? null;
    } catch {
      previousAsset = null;
    }
  }

  let nextAsset: Record<string, unknown> = {
    id,
    lastSeen: now,
    lastPosition: now,
    lat: latLng.lat,
    lng: latLng.lng,
    lon: latLng.lng,
    gps: `${latLng.lat}, ${latLng.lng}`
  };

  if (existing?.data) {
    try {
      const parsed = parseStoredJson(existing.data) ?? {};
      nextAsset = { ...(parsed as any), ...nextAsset };
    } catch {
      // keep minimal
    }
  }
  if (imei) (nextAsset as any).imei = imei;
  if (deviceId) (nextAsset as any).deviceId = deviceId;
  if (deviceAtIso) (nextAsset as any).lastDeviceTime = deviceAtIso;

  try {
    const snapshot = buildIoNamedSnapshotFromTelemetry(body);
    (nextAsset as any).telemetryLatest = {
      at: now,
      ...(deviceAtIso ? { deviceAt: deviceAtIso } : {}),
      ioById: snapshot.ioById,
      io: snapshot.ioNamed
    };
    const io = snapshot.ioNamed;
    const speedFromPayload = Number(body?.data?.speed ?? body?.speed);
    const headingFromPayload = Number(body?.data?.heading ?? body?.heading);
    const satellitesFromPayload = Number(body?.data?.satellites ?? body?.satellites);
    if (Number.isFinite(speedFromPayload)) (nextAsset as any).speed = speedFromPayload;
    if (Number.isFinite(headingFromPayload)) (nextAsset as any).heading = headingFromPayload;
    if (Number.isFinite(satellitesFromPayload)) (nextAsset as any).satellites = satellitesFromPayload;
    if (typeof io["Ignition"] !== "undefined") (nextAsset as any).ignition = io["Ignition"];
    if (typeof io["Speed"] !== "undefined") (nextAsset as any).speed = io["Speed"];
    if (typeof io["GSM Signal"] !== "undefined") (nextAsset as any).gsmSignal = io["GSM Signal"];
    if (typeof io["External Voltage"] !== "undefined") (nextAsset as any).powerVoltage = io["External Voltage"];
    if (typeof io["ICCID"] !== "undefined") (nextAsset as any).iccid = io["ICCID"];
  } catch {
    // ignore
  }

  // Add lightweight quality diagnostics so bad AVL profiles are easy to spot in stored telemetry.
  try {
    const warnings: string[] = [];
    const diagnostics: Record<string, unknown> = { at: now };

    const satellites = toNumberOrNull((nextAsset as any).satellites);
    if (satellites !== null) {
      diagnostics.satellites = satellites;
      if (satellites <= 0) warnings.push("no_satellite_fix");
      else if (satellites <= 3) warnings.push("low_satellite_count");
    }

    const previousLat = toNumberOrNull((previousAsset as any)?.lat ?? (previousAsset as any)?.latitude);
    const previousLng = toNumberOrNull((previousAsset as any)?.lng ?? (previousAsset as any)?.lon ?? (previousAsset as any)?.longitude);
    const previousAtRaw = String((previousAsset as any)?.lastSeen ?? (previousAsset as any)?.lastPosition ?? "").trim();
    const previousAtMs = previousAtRaw ? Date.parse(previousAtRaw) : NaN;
    const currentAtMs = Date.parse(now);

    if (
      previousLat !== null &&
      previousLng !== null &&
      Number.isFinite(previousAtMs) &&
      Number.isFinite(currentAtMs) &&
      currentAtMs > previousAtMs
    ) {
      const deltaSeconds = (currentAtMs - previousAtMs) / 1000;
      if (deltaSeconds >= 5 && deltaSeconds <= 300) {
        const distanceMeters = haversineMeters(previousLat, previousLng, latLng.lat, latLng.lng);
        const impliedKph = deltaSeconds > 0 ? (distanceMeters / deltaSeconds) * 3.6 : 0;
        diagnostics.deltaSeconds = Number(deltaSeconds.toFixed(3));
        diagnostics.distanceMeters = Number(distanceMeters.toFixed(1));
        diagnostics.impliedSpeedKph = Number(impliedKph.toFixed(1));
        const reportedSpeed = Math.max(
          0,
          toNumberOrNull((nextAsset as any).speed) ?? 0
        );
        diagnostics.reportedSpeedKph = Number(reportedSpeed.toFixed(1));

        if (distanceMeters >= 120 && impliedKph >= 12 && reportedSpeed <= 1.2) {
          warnings.push("movement_speed_mismatch");
        }
      }
    }

    (nextAsset as any).telemetryQuality = {
      ...diagnostics,
      warnings
    };
  } catch {
    // ignore
  }

  // Evaluate monitored telemetry fields and generate alerts on change.
  try {
    const monitoredEvents = getMonitoredEventsForAsset(tenant, nextAsset);
    if (monitoredEvents.length) {
      const state: Record<string, any> = (nextAsset as any).telemetryState && typeof (nextAsset as any).telemetryState === "object"
        ? (nextAsset as any).telemetryState
        : {};
      const alertsToUpsert: any[] = [];
      for (const name of monitoredEvents) {
        const obs = extractMonitoredValue(body, name);
        if (!obs.found) continue;
        const val = obs.value;
        if (val !== null && typeof val === "object") continue;
        const key = normalizeKey(name);
        if (!key) continue;
        const prev = state[key]?.value;
        const prevJson = typeof prev === "undefined" ? undefined : JSON.stringify(prev);
        const curJson = JSON.stringify(val);
        if (typeof prev === "undefined") {
          state[key] = { name, value: val, at: now };
          continue;
        }
        if (prevJson === curJson) {
          state[key] = { name, value: val, at: now };
          continue;
        }
        state[key] = { name, value: val, at: now };
        const alertId = cryptoRandom();
        alertsToUpsert.push({
          id: alertId,
          type: "Telemetry",
          severity: "Low",
          assetId: id,
          message: `${name} changed: ${String(prev ?? "—")} → ${String(val ?? "—")}`,
          status: "Open",
          createdAt: now,
          field: name,
          previous: prev,
          current: val
        });
      }
      (nextAsset as any).telemetryState = state;
      if (alertsToUpsert.length) {
        const stmt = db.prepare("INSERT OR REPLACE INTO alerts (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)");
        for (const a of alertsToUpsert) {
          stmt.run(String(a.id), tenant, JSON.stringify(a), now);
        }
      }
    }
  } catch {
    // ignore
  }

  const insertAsset = db.prepare("INSERT OR REPLACE INTO assets (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)");
  insertAsset.run(id, tenant, JSON.stringify(nextAsset), now);

  const insertEvent = db.prepare(
    "INSERT INTO telemetry_events (id, tenant_id, type, asset_id, imei, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const eventId = cryptoRandom();
  insertEvent.run(
    eventId,
    tenant,
    "telemetry",
    id,
    imei,
    now,
    JSON.stringify({ id: eventId, type: "telemetry", assetId: id, createdAt: now, data: nextAsset })
  );

  void archiveTelemetryEventAsync({
    tenant,
    assetId: id,
    imei,
    eventId,
    createdAt: now,
    payload: { id: eventId, type: "telemetry", assetId: id, createdAt: now, data: nextAsset }
  });

  return { ok: true as const, status: 200, stored: true, id, tenantId: tenant, eventId };
}

type TeltonikaAvlRecord = {
  timestampMs: number;
  priority: number;
  gps: {
    lat: number;
    lon: number;
    altitude: number;
    angle: number;
    satellites: number;
    speedKph: number;
  };
  ioById: Record<number, number | string | null>;
};

function decodeTeltonikaAvlPayload(data: Buffer): { codecId: number; records: TeltonikaAvlRecord[] } {
  let pos = 0;
  const readU8 = () => data.readUInt8(pos++);
  const readI16 = () => {
    const v = data.readInt16BE(pos);
    pos += 2;
    return v;
  };
  const readU16 = () => {
    const v = data.readUInt16BE(pos);
    pos += 2;
    return v;
  };
  const readI32 = () => {
    const v = data.readInt32BE(pos);
    pos += 4;
    return v;
  };
  const readU32 = () => {
    const v = data.readUInt32BE(pos);
    pos += 4;
    return v;
  };
  const readU64 = () => {
    const hi = readU32();
    const lo = readU32();
    return hi * 2 ** 32 + lo;
  };
  const readBytes = (n: number) => {
    const b = data.subarray(pos, pos + n);
    pos += n;
    return b;
  };

  const codecId = readU8();
  const count = readU8();
  const records: TeltonikaAvlRecord[] = [];
  const is8e = codecId === 0x8e;

  for (let i = 0; i < count; i++) {
    const timestampMs = readU64();
    const priority = readU8();
    const lonRaw = readI32();
    const latRaw = readI32();
    const altitude = readI16();
    const angle = readU16();
    const satellites = readU8();
    const speedKph = readU16();

    const ioById: Record<number, number | string | null> = {};

    if (!is8e) {
      // Codec8 IO
      /* eventId */ readU8();
      /* total */ readU8();
      const readGroup = (size: 1 | 2 | 4 | 8) => {
        const cnt = readU8();
        for (let k = 0; k < cnt; k++) {
          const id = readU8();
          let value: any;
          if (size === 1) value = readU8();
          else if (size === 2) value = readU16();
          else if (size === 4) value = readU32();
          else value = readU64();
          if (isTeltonikaNullSentinel(value)) value = null;
          ioById[id] = value;
        }
      };
      readGroup(1);
      readGroup(2);
      readGroup(4);
      readGroup(8);
    } else {
      // Codec8 Extended IO
      /* eventId */ readU16();
      /* total */ readU16();
      const readGroup = (size: 1 | 2 | 4 | 8) => {
        const cnt = readU16();
        for (let k = 0; k < cnt; k++) {
          const id = readU16();
          let value: any;
          if (size === 1) value = readU8();
          else if (size === 2) value = readU16();
          else if (size === 4) value = readU32();
          else value = readU64();
          if (isTeltonikaNullSentinel(value)) value = null;
          ioById[id] = value;
        }
      };
      readGroup(1);
      readGroup(2);
      readGroup(4);
      readGroup(8);

      // variable length
      const varCnt = readU16();
      for (let k = 0; k < varCnt; k++) {
        const id = readU16();
        const len = readU16();
        const bytes = readBytes(len);
        ioById[id] = bytes.toString("hex");
      }
    }

    records.push({
      timestampMs,
      priority,
      gps: {
        lat: latRaw / 10_000_000,
        lon: lonRaw / 10_000_000,
        altitude,
        angle,
        satellites,
        speedKph
      },
      ioById
    });
  }

  // final record count byte
  /* trailingCount */ readU8();
  return { codecId, records };
}

function startTeltonikaTcpIngest() {
  // Bind all configured ingest ports so switching a device between main/duplicate sockets
  // does not require backend redeploys.
  const ports = Array.from(new Set([TELTONIKA_PORT, ...TELTONIKA_DUPLICATE_PORTS].filter((p) => p > 0)));
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

      const tryParse = () => {
        while (true) {
          if (!imei) {
            // Standard Teltonika login frame: [len:2][imei ascii]
            if (buf.length >= 2) {
              const lenBe = buf.readUInt16BE(0);
              const lenLe = buf.readUInt16LE(0);
              const candidateLens = Array.from(new Set([lenBe, lenLe])).filter((n) => n > 0 && n <= 32);
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

            // Compatibility mode: some gateways may send IMEI as plain ASCII (without 2-byte length).
            if (buf.length >= 14) {
              const probe = buf.toString("ascii", 0, Math.min(buf.length, 32));
              const m = probe.match(/^(\d{14,17})(?:\r\n|\n|\0)?/);
              if (m) {
                imei = String(m[1] ?? "").trim();
                const consumed = m[0]?.length ?? imei.length;
                buf = buf.subarray(consumed);
                socket.write(Buffer.from([0x01]));
                pushTeltonikaTcpEvent({ at: new Date().toISOString(), event: "imei_login_fallback", port, remote, imei });
                continue;
              }
            }

            // Do not hard-close on malformed first bytes; resync and keep socket alive.
            if (buf.length > 64) {
              buf = buf.subarray(1);
              continue;
            }

            // If buffer starts with obvious non-IMEI prefix bytes, drop one byte and retry.
            const first = buf[0];
            if (typeof first === "number" && (first < 0x30 || first > 0x39) && buf.length >= 4) {
              buf = buf.subarray(1);
              continue;
            }
            return;
          }

          // AVL packet framing: preamble(4) + dataLen(4) + data + crc(4)
          if (buf.length < 8) return;
          const preamble = buf.readUInt32BE(0);
          const dataLen = buf.readUInt32BE(4);
          if (preamble !== 0) {
            // resync: drop 1 byte
            buf = buf.subarray(1);
            continue;
          }
          const total = 8 + dataLen + 4;
          if (buf.length < total) return;
          const data = buf.subarray(8, 8 + dataLen);
          buf = buf.subarray(total);

          try {
            const decoded = decodeTeltonikaAvlPayload(data);
            const tenant = findTenantForImei(imei);
            let storedCount = 0;

            for (const rec of decoded.records) {
              const body: any = {
                data: {
                  imei,
                  lat: rec.gps.lat,
                  lon: rec.gps.lon,
                  speed: rec.gps.speedKph,
                  heading: rec.gps.angle,
                  satellites: rec.gps.satellites,
                  altitude: rec.gps.altitude,
                  priority: rec.priority,
                  timestamp: new Date(rec.timestampMs).toISOString(),
                  codec: decoded.codecId
                }
              };

              // Provide IO fields in the io<id> shape so existing mapping can name them.
              for (const [idStr, value] of Object.entries(rec.ioById)) {
                const idNum = Number(idStr);
                if (!Number.isFinite(idNum)) continue;
                (body.data as any)[`io${idNum}`] = value;
              }

              const stored = storeTelemetryEventForTenant(tenant, body);
              if (stored.ok) storedCount += 1;

              // Fire-and-forget forward to Worker ingest so Cloudflare Pages UI can stay pointed at the Worker.
              forwardTelemetryToWorker(body, tenant);
            }

            // Acknowledge number of records processed (int32be)
            const ack = Buffer.alloc(4);
            ack.writeUInt32BE(decoded.records.length, 0);
            socket.write(ack);
            if (storedCount) {
              // optional debug
              // console.log(`Teltonika ingest ${label} ${imei}: ${storedCount}/${decoded.records.length} records -> tenant ${tenant}`);
            }
          } catch {
            teltonikaTcpDiagnostics.parserDecodeFailures += 1;
            // If decode fails, attempt a protocol-level fallback ACK using the first record-count byte.
            // This avoids unnecessary reconnect loops for packets with unsupported/variant codec content.
            const fallbackCount = data.length >= 2 ? Number(data.readUInt8(1)) : 0;
            const safeCount = Number.isFinite(fallbackCount) && fallbackCount >= 0 && fallbackCount <= 255 ? fallbackCount : 0;
            const ack = Buffer.alloc(4);
            ack.writeUInt32BE(safeCount, 0);
            socket.write(ack);
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
        console.log(
          `Teltonika ${label}:${port} connection closed from ${remote}${imei ? ` imei=${imei}` : ""} hadError=${hadError}`
        );
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
        teltonikaTcpDiagnostics.listeners.sort((a, b) => a - b);
      }
      pushTeltonikaTcpEvent({ at: new Date().toISOString(), event: "listener_ready", port, detail: label });
    });
  };

  for (const p of ports) {
    createListener(p, "teltonika");
  }
}

function startConcoxTcpIngest() {
  if (CONCOX_PORT <= 0) return;

  const server = net.createServer((socket) => {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 15_000);
    socket.setTimeout(0);

    const remote = `${socket.remoteAddress ?? "unknown"}:${socket.remotePort ?? "?"}`;
    let buf = Buffer.alloc(0);
    let imei = "";

    concoxTcpDiagnostics.opened += 1;
    concoxTcpDiagnostics.activeConnections += 1;
    pushConcoxTcpEvent({ at: new Date().toISOString(), event: "open", port: CONCOX_PORT, remote });

    const tryParse = () => {
      while (buf.length >= 5) {
        // GT06 packets are framed with 0x7878 ... 0x0d0a.
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
          pushConcoxTcpEvent({ at: new Date().toISOString(), event: "bad_frame", port: CONCOX_PORT, remote });
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
            pushConcoxTcpEvent({ at: new Date().toISOString(), event: "imei_login", port: CONCOX_PORT, remote, imei });
          }
        }

        // 0x12 (GPS) and 0x22 (GPS with LBS) are the most common GT06 telemetry frames.
        if (protocol === 0x12 || protocol === 0x22) {
          const gps = decodeConcoxGpsInfo(info);
          if (gps) {
            const tenant = findTenantForImeiWithDefault(imei, CONCOX_DEFAULT_TENANT);
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
            if (stored.ok) {
              forwardTelemetryToWorker(body, tenant);
            }
          } else {
            concoxTcpDiagnostics.parseFailures += 1;
          }
        }

        // ACK login/status/gps frames to reduce resend loops.
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
      pushConcoxTcpEvent({ at: new Date().toISOString(), event: "close", port: CONCOX_PORT, remote, imei: imei || undefined });
    });
  });

  server.on("error", (err: any) => {
    console.warn(`Concox TCP server error on ${CONCOX_PORT}`, err?.message ?? err);
  });

  server.listen(CONCOX_PORT, "0.0.0.0", () => {
    console.log(`Concox TCP ingest listening on 0.0.0.0:${CONCOX_PORT}`);
    pushConcoxTcpEvent({ at: new Date().toISOString(), event: "listener_ready", port: CONCOX_PORT });
  });
}

function startQueclinkTcpIngest() {
  if (QUECLINK_PORT <= 0) return;

  const server = net.createServer((socket) => {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 15_000);
    socket.setTimeout(0);

    const remote = `${socket.remoteAddress ?? "unknown"}:${socket.remotePort ?? "?"}`;
    let textBuf = "";
    let imei = "";

    queclinkTcpDiagnostics.opened += 1;
    queclinkTcpDiagnostics.activeConnections += 1;
    pushQueclinkTcpEvent({ at: new Date().toISOString(), event: "open", port: QUECLINK_PORT, remote });

    const consumeLine = (line: string) => {
      const parsed = parseQueclinkTextMessage(line);
      if (!parsed) {
        queclinkTcpDiagnostics.parseFailures += 1;
        return;
      }
      if (parsed.imei) imei = parsed.imei;
      const tenant = findTenantForImeiWithDefault(parsed.imei, QUECLINK_DEFAULT_TENANT);
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
      if (stored.ok) {
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
      pushQueclinkTcpEvent({ at: new Date().toISOString(), event: "close", port: QUECLINK_PORT, remote, imei: imei || undefined });
    });
  });

  server.on("error", (err: any) => {
    console.warn(`Queclink TCP server error on ${QUECLINK_PORT}`, err?.message ?? err);
  });

  server.listen(QUECLINK_PORT, "0.0.0.0", () => {
    console.log(`Queclink TCP ingest listening on 0.0.0.0:${QUECLINK_PORT}`);
    pushQueclinkTcpEvent({ at: new Date().toISOString(), event: "listener_ready", port: QUECLINK_PORT });
  });
}

const sha256Hex = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");
const isReadableStream = (value: any): value is NodeJS.ReadableStream => Boolean(value && typeof value.pipe === "function");

const resolveByNameOrId = (items: any[], value: string) => {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return (
    items.find((item) => String(item.id ?? "").trim().toLowerCase() === needle) ||
    items.find((item) => String(item.name ?? "").trim().toLowerCase() === needle) ||
    null
  );
};

const parseStoredJson = (value: unknown) => {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  // In-memory DB mode stores JSON fields as objects already.
  return value;
};

const listConfigGroups = (tenant: string) => {
  const rows = db.prepare("SELECT data FROM configuration_groups WHERE tenant_id = ? ORDER BY updated_at DESC").all(tenant);
  return rows.map((r: any) => parseStoredJson(r.data)).filter(Boolean);
};

const listBindings = (tenant: string, type: string) => {
  if (!Database) {
    return (_inMemoryBindings[type] || []).map((r) => ({ type, ...(r || {}) }));
  }
  const rows = db.prepare("SELECT data FROM bindings WHERE type = ?").all(type);
  return rows.map((r: any) => JSON.parse(r.data));
};

const getDeviceReportingSettings = (tenant: string) => {
  const row = db.prepare("SELECT data FROM device_reporting_settings WHERE tenant_id = ?").get(tenant);
  return row ? parseStoredJson(row.data) : null;
};

const getBaseArtifact = (tenant: string, type: string) => {
  const row = db
    .prepare("SELECT id, name, version, r2_key, content_type, sha256, is_base, created_at FROM device_artifacts WHERE tenant_id = ? AND type = ? ORDER BY is_base DESC, created_at DESC LIMIT 1")
    .get(tenant, type);
  return row ?? null;
};

const buildDeviceSettingsPayload = (tenant: string, imei: string) => {
  const assets = db
    .prepare("SELECT data FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC")
    .all(tenant)
    .map((r: any) => parseStoredJson(r.data))
    .filter(Boolean);
  const asset = assets.find((a: any) => String(a.imei ?? "").trim() === imei) ?? null;
  if (!asset) return { ok: false, message: "Asset not found for IMEI." } as const;
  const configGroupValue = String(asset.configGroup ?? "").trim();
  if (!configGroupValue) return { ok: false, message: "Asset has no configuration group." } as const;
  const groups = listConfigGroups(tenant);
  const group = resolveByNameOrId(groups, configGroupValue);
  if (!group) return { ok: false, message: "Configuration group not found." } as const;
  const notificationBinding = resolveByNameOrId(listBindings(tenant, "notifications"), String(group.notificationBinding ?? ""));
  const locationBinding = resolveByNameOrId(listBindings(tenant, "locations"), String(group.locationBinding ?? ""));
  const deviceBinding = resolveByNameOrId(listBindings(tenant, "devices"), String(group.deviceBinding ?? ""));
  if (!notificationBinding || !locationBinding || !deviceBinding) {
    return { ok: false, message: "Configuration group bindings are missing." } as const;
  }
  const reporting = getDeviceReportingSettings(tenant);
  const firmware = getBaseArtifact(tenant, "firmware");
  const config = getBaseArtifact(tenant, "config");
  return {
    ok: true,
    payload: {
      asset,
      configurationGroup: group,
      bindings: { notifications: notificationBinding, locations: locationBinding, devices: deviceBinding },
      deviceReportingSettings: reporting,
      baseArtifacts: {
        firmware: firmware
          ? { id: firmware.id, name: firmware.name, version: firmware.version, sha256: firmware.sha256, downloadUrl: `/device/artifacts/${firmware.id}` }
          : null,
        config: config
          ? { id: config.id, name: config.name, version: config.version, sha256: config.sha256, downloadUrl: `/device/artifacts/${config.id}` }
          : null
      }
    }
  } as const;
};

function requireApiKey(req: express.Request, res: express.Response) {
  if (!API_KEY) return true;
  const key = readAuthToken(req);
  if (!key) return false;
  if (key === API_KEY) return true;
  try {
    const row = db
      .prepare("SELECT token, expires_at FROM admin_sessions WHERE token = ? ORDER BY expires_at DESC LIMIT 1")
      .get(key);
    if (!row) return false;
    const expiresAt = String(row.expires_at ?? "");
    if (!expiresAt) return false;
    if (Date.parse(expiresAt) < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

function isLoopbackRequest(req: express.Request) {
  const ipRaw = String(req.ip ?? req.socket?.remoteAddress ?? "").trim();
  const forwardedRaw = String(req.header("x-forwarded-for") ?? "").trim();
  const firstForwarded = forwardedRaw.split(",")[0]?.trim() ?? "";
  const candidates = [ipRaw, firstForwarded].filter(Boolean);
  return candidates.some((ip) => {
    const normalized = ip.toLowerCase();
    return (
      normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized === "::ffff:127.0.0.1" ||
      normalized.startsWith("127.")
    );
  });
}

app.get("/", (_req, res) => {
  res.json({ service: "Vivi telematics VPS API" });
});

app.get("/health", (_req, res) => {
  const tenant = String(_req.header("x-tenant-id") ?? _req.query.tenant ?? "").trim();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    storage: {
      mode: Database ? "sqlite" : "memory",
      dbPath: Database ? DB_PATH : null,
      requirePersistentDb: REQUIRE_PERSISTENT_DB
    },
    telemetry: {
      tenantId: tenant || undefined,
      totalEvents: readTelemetryCount(tenant || undefined),
      latestEventAt: readLatestTelemetryAt(tenant || undefined)
    },
    workerForward: {
      ...workerForwardDiagnostics,
      hasApiKey: Boolean(WORKER_API_KEY)
    }
  });
});

app.get("/health/tcp", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    teltonika: {
      listeners: teltonikaTcpDiagnostics.listeners,
      opened: teltonikaTcpDiagnostics.opened,
      closed: teltonikaTcpDiagnostics.closed,
      closedWithError: teltonikaTcpDiagnostics.closedWithError,
      parserDecodeFailures: teltonikaTcpDiagnostics.parserDecodeFailures,
      parserFallbackAcks: teltonikaTcpDiagnostics.parserFallbackAcks,
      activeByPort: teltonikaTcpDiagnostics.activeByPort,
      recent: teltonikaTcpDiagnostics.recent.slice(0, 50)
    },
    concox: {
      listener: concoxTcpDiagnostics.listener,
      opened: concoxTcpDiagnostics.opened,
      closed: concoxTcpDiagnostics.closed,
      parseFailures: concoxTcpDiagnostics.parseFailures,
      activeConnections: concoxTcpDiagnostics.activeConnections,
      recent: concoxTcpDiagnostics.recent.slice(0, 50)
    },
    queclink: {
      listener: queclinkTcpDiagnostics.listener,
      opened: queclinkTcpDiagnostics.opened,
      closed: queclinkTcpDiagnostics.closed,
      parseFailures: queclinkTcpDiagnostics.parseFailures,
      activeConnections: queclinkTcpDiagnostics.activeConnections,
      recent: queclinkTcpDiagnostics.recent.slice(0, 50)
    }
  });
});

app.post("/auth/login", (req, res) => {
  const body = req.body ?? {};
  const email = String((body as any).email ?? "").trim().toLowerCase();
  const password = String((body as any).password ?? "");

  if (!ADMIN_EMAIL) return res.status(503).json({ error: "Admin login is not configured." });
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });
  if (email !== ADMIN_EMAIL) return res.status(401).json({ error: "Invalid credentials" });
  if (!verifyAdminPassword(password)) return res.status(401).json({ error: "Invalid credentials" });

  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ADMIN_TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();
  try {
    db.prepare("INSERT OR REPLACE INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)").run(
      token,
      now.toISOString(),
      expiresAt
    );
  } catch {
    // ignore
  }
  res.json({ ok: true, token, expiresAt });
});

app.post("/auth/forgot-password", (req, res) => {
  try {
    const body = req.body ?? {};
    const email = String((body as any).email ?? "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "email is required" });
    const { raw, tenant } = readTenant(req);
    const tenantId = tenant || raw || "";
    const createdAt = new Date().toISOString();
    const id = crypto.randomBytes(16).toString("hex");
    const ip = String(req.header("cf-connecting-ip") ?? req.header("x-forwarded-for") ?? req.ip ?? "");
    const userAgent = String(req.header("user-agent") ?? "");
    try {
      db.prepare(
        "INSERT OR REPLACE INTO password_reset_requests (id, email, tenant_id, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, email, tenantId, ip, userAgent, createdAt);
    } catch {
      // ignore
    }
    return res.json({ ok: true, message: "If an account exists for this email, reset instructions will be sent." });
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
});

// --- Drone delivery (Deliver) ---

const defaultDeliverRequirements = {
  user: {
    lowEnd: [
      "Android 8+/iOS 13+ or any modern browser.",
      "2G/3G network support with offline queue for order submission.",
      "SMS fallback for order updates and delivery code.",
      "Compressed map images and text-first screens.",
      "Single-tap order tracking by phone number or order ID."
    ],
    highEnd: [
      "Push notifications with live ETA updates.",
      "Real-time map with drone position refresh every 3-5 seconds.",
      "Digital signature/photo upload as delivery proof.",
      "In-app secure wallet/payment integration.",
      "Rich order history with filters and CSV export."
    ]
  },
  commandCenter: {
    lowEnd: [
      "Browser dashboard that runs on standard office laptops.",
      "Manual order assignment to available drones.",
      "Color-coded statuses: pending, in_transit, delivered, failed.",
      "Battery threshold warnings and no-fly drone lock.",
      "Printable dispatch list and incident log."
    ],
    highEnd: [
      "Auto-assignment using payload, battery, and proximity scoring.",
      "Live fleet telemetry panel with alerts and SLA timers.",
      "Role-based access control for dispatcher/supervisor/auditor.",
      "Shift handover timeline with immutable action audit trail.",
      "Performance analytics by route, drone, and operator."
    ]
  },
  collaboration: [
    "Shared order timeline visible to client and command center.",
    "Single source of truth for drone availability and order state.",
    "Delivery confirmation using one-time proof code.",
    "Escalation path: delayed > 10 min triggers command center alert.",
    "Daily operating checklist covering drones, charging, and incidents."
  ]
};

function deliverNowIso() {
  return new Date().toISOString();
}

type DeliverStore = {
  drones: any[];
  orders: any[];
  requirements: any;
  clients: any[];
  regions: any[];
  droneGroups: any[];
};

function deliverReadStore(tenant: string): DeliverStore {
  try {
    const row = db.prepare("SELECT data FROM deliver_store WHERE tenant_id = ?").get(tenant);
    if (row?.data) {
      const parsed = JSON.parse(String(row.data));
      return {
        drones: Array.isArray(parsed?.drones) ? parsed.drones : [],
        orders: Array.isArray(parsed?.orders) ? parsed.orders : [],
        requirements: parsed?.requirements || defaultDeliverRequirements,
        clients: Array.isArray(parsed?.clients) ? parsed.clients : [],
        regions: Array.isArray(parsed?.regions) ? parsed.regions : [],
        droneGroups: Array.isArray(parsed?.droneGroups) ? parsed.droneGroups : []
      };
    }
  } catch {
    // ignore
  }
  return { drones: [], orders: [], requirements: defaultDeliverRequirements, clients: [], regions: [], droneGroups: [] };
}

function deliverWriteStore(tenant: string, store: DeliverStore) {
  const now = deliverNowIso();
  const stmt = db.prepare("INSERT OR REPLACE INTO deliver_store (tenant_id, data, updated_at) VALUES (?, ?, ?)");
  stmt.run(tenant, JSON.stringify(store ?? {}), now);
}

function deliverEnsureStoreShape(store: any) {
  if (!store || typeof store !== "object") return { drones: [], orders: [], requirements: defaultDeliverRequirements, clients: [], regions: [], droneGroups: [] };
  if (!Array.isArray(store.drones)) store.drones = [];
  if (!Array.isArray(store.orders)) store.orders = [];
  if (!store.requirements) store.requirements = defaultDeliverRequirements;
  if (!Array.isArray(store.clients)) store.clients = [];
  if (!Array.isArray(store.regions)) store.regions = [];
  if (!Array.isArray(store.droneGroups)) store.droneGroups = [];
  return store;
}

function deliverSummarize(store: { drones: any[]; orders: any[] }) {
  const orders = store.orders || [];
  const drones = store.drones || [];
  const pending = orders.filter((o: any) => o.status === "pending").length;
  const inTransit = orders.filter((o: any) => o.status === "assigned" || o.status === "in_transit" || o.status === "in-flight").length;
  const delivered = orders.filter((o: any) => o.status === "delivered").length;
  const availableDrones = drones.filter((d: any) => String(d.status || "") === "available").length;
  return {
    totalOrders: orders.length,
    pendingOrders: pending,
    inTransitOrders: inTransit,
    deliveredOrders: delivered,
    totalDrones: drones.length,
    availableDrones
  };
}

function deliverCreateOrderId() {
  const stamp = Date.now().toString().slice(-6);
  const rand = Math.floor(Math.random() * 900 + 100).toString();
  return `ORD-${stamp}${rand}`;
}

function deliverCreateDroneId() {
  const rand = Math.floor(Math.random() * 9000 + 1000).toString();
  return `DRN-${rand}`;
}

function deliverSanitizeText(v: any) {
  return String(v ?? "").trim();
}

function deliverSanitizeNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function deliverOrderPriorityScore(priority: any) {
  const p = deliverSanitizeText(priority).toLowerCase();
  if (p === "critical") return 4;
  if (p === "high") return 3;
  if (p === "normal") return 2;
  if (p === "low") return 1;
  return 0;
}

function deliverIsDroneAvailable(drone: any) {
  return deliverSanitizeText(drone.status).toLowerCase() === "available" && deliverSanitizeNumber(drone.batteryPct, 0) >= 35;
}

function deliverAssignmentScore(drone: any, order: any) {
  const battery = deliverSanitizeNumber(drone.batteryPct, 0);
  const payloadHeadroom = deliverSanitizeNumber(drone.maxPayloadKg, 0) - deliverSanitizeNumber(order.packageWeightKg, 0);
  const range = deliverSanitizeNumber(drone.rangeKm, 0);
  const priority = deliverOrderPriorityScore(order.priority);
  return battery + payloadHeadroom * 20 + range + priority * 5;
}

function deliverBestDroneForOrder(drones: any[], order: any) {
  const eligible = (drones || []).filter((drone) => {
    const payloadOk = deliverSanitizeNumber(drone.maxPayloadKg, 0) >= deliverSanitizeNumber(order.packageWeightKg, 0);
    return payloadOk && deliverIsDroneAvailable(drone);
  });
  if (!eligible.length) return null;
  eligible.sort((a, b) => deliverAssignmentScore(b, order) - deliverAssignmentScore(a, order));
  return eligible[0];
}

function deliverUpdateDroneAfterDelivery(drone: any) {
  const battery = deliverSanitizeNumber(drone.batteryPct, 0);
  drone.batteryPct = Math.max(5, battery - 8);
  drone.status = drone.batteryPct < 30 ? "charging" : "available";
  drone.activeOrderId = "";
  drone.lastUpdated = deliverNowIso();
}

app.get("/deliver/state", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
  res.json({
    summary: deliverSummarize(store),
    drones: store.drones,
    orders: store.orders,
    requirements: store.requirements,
    clients: store.clients,
    regions: store.regions,
    droneGroups: store.droneGroups
  });
});

app.get("/deliver/clients", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
  res.json({ clients: store.clients });
});

app.post("/deliver/clients", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
  const id = deliverSanitizeText((body as any).id) || `CL-${Date.now()}`;
  const name = deliverSanitizeText((body as any).name);
  if (!name) return res.status(400).json({ error: "Client name is required" });
  const phone = deliverSanitizeText((body as any).phone);
  const region = deliverSanitizeText((body as any).region);
  const notes = deliverSanitizeText((body as any).notes);

  const idx = store.clients.findIndex((c: any) => String(c.id) === id);
  const rec = { id, name, phone, region, notes, updatedAt: deliverNowIso() };
  if (idx >= 0) store.clients[idx] = { ...store.clients[idx], ...rec };
  else store.clients.unshift(rec);
  deliverWriteStore(tenant, store);
  res.json({ stored: true, client: rec });
});

app.get("/deliver/regions", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
  res.json({ regions: store.regions });
});

app.post("/deliver/regions", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
  const name = deliverSanitizeText((body as any).name);
  if (!name) return res.status(400).json({ error: "Region name is required" });
  const id = deliverSanitizeText((body as any).id) || name.toLowerCase().replace(/\s+/g, "-");
  if (!store.regions.some((r: any) => String(r.id) === id)) {
    store.regions.unshift({ id, name, updatedAt: deliverNowIso() });
    deliverWriteStore(tenant, store);
  }
  res.json({ stored: true, id });
});

app.get("/deliver/drone-groups", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
  res.json({ droneGroups: store.droneGroups });
});

app.post("/deliver/drone-groups", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
  const name = deliverSanitizeText((body as any).name);
  if (!name) return res.status(400).json({ error: "Group name is required" });
  const id = deliverSanitizeText((body as any).id) || name.toLowerCase().replace(/\s+/g, "-");
  const owner = deliverSanitizeText((body as any).owner);
  const region = deliverSanitizeText((body as any).region);
  const notes = deliverSanitizeText((body as any).notes);
  const idx = store.droneGroups.findIndex((g: any) => String(g.id) === id);
  const rec = { id, name, owner, region, notes, updatedAt: deliverNowIso() };
  if (idx >= 0) store.droneGroups[idx] = { ...store.droneGroups[idx], ...rec };
  else store.droneGroups.unshift(rec);
  deliverWriteStore(tenant, store);
  res.json({ stored: true, droneGroup: rec });
});

app.get("/deliver/health", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
  const now = Date.now();
  const drones = store.drones || [];
  const health = drones.map((d: any) => {
    const id = String(d.id ?? "");
    const status = String(d.status ?? "");
    const batteryPct = deliverSanitizeNumber(d.batteryPct, 0);
    const lastUpdated = String(d.lastUpdated ?? "");
    const updatedMs = lastUpdated ? Date.parse(lastUpdated) : NaN;
    const staleHours = Number.isFinite(updatedMs) ? (now - updatedMs) / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;
    const reasons: string[] = [];
    if (status !== "available") reasons.push(`status=${status || "unknown"}`);
    if (batteryPct < 35) reasons.push(`battery=${batteryPct}%`);
    if (staleHours > 24) reasons.push("stale telemetry > 24h");
    const ok = reasons.length === 0;
    return { id, name: d.name ?? id, status, batteryPct, lastUpdated, ok, reasons };
  });
  res.json({ health, at: deliverNowIso() });
});

app.get("/deliver/requirements", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const store = deliverReadStore(tenant);
  res.json({ requirements: store.requirements });
});

app.get("/deliver/drones", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const store = deliverReadStore(tenant);
  res.json({ drones: store.drones, summary: deliverSummarize(store) });
});

app.post("/deliver/drones", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const store = deliverReadStore(tenant);
  const id = deliverSanitizeText((body as any).id) || deliverCreateDroneId();
  if (store.drones.some((d: any) => String(d.id) === id)) return res.status(400).json({ error: "Drone id already exists" });
  const drone = {
    id,
    name: deliverSanitizeText((body as any).name) || id,
    status: deliverSanitizeText((body as any).status || "available").toLowerCase(),
    batteryPct: Math.min(100, Math.max(0, deliverSanitizeNumber((body as any).batteryPct, 100))),
    maxPayloadKg: Math.max(0.2, deliverSanitizeNumber((body as any).maxPayloadKg, 1.5)),
    rangeKm: Math.max(1, deliverSanitizeNumber((body as any).rangeKm, 10)),
    speedKph: Math.max(10, deliverSanitizeNumber((body as any).speedKph, 40)),
    currentLat: deliverSanitizeNumber((body as any).currentLat, 0),
    currentLng: deliverSanitizeNumber((body as any).currentLng, 0),
    activeOrderId: "",
    lastUpdated: deliverNowIso()
  };
  store.drones.push(drone);
  deliverWriteStore(tenant, store);
  res.status(201).json({ stored: true, drone, summary: deliverSummarize(store) });
});

app.patch("/deliver/drones/:id", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const id = deliverSanitizeText(req.params.id);
  if (!id) return res.status(400).json({ error: "Drone id is required" });
  const body = req.body ?? {};
  const store = deliverReadStore(tenant);
  const drone = store.drones.find((d: any) => String(d.id) === id);
  if (!drone) return res.status(404).json({ error: "Not found" });
  if (typeof (body as any).status !== "undefined") drone.status = deliverSanitizeText((body as any).status).toLowerCase();
  if (typeof (body as any).batteryPct !== "undefined") drone.batteryPct = Math.min(100, Math.max(0, deliverSanitizeNumber((body as any).batteryPct, drone.batteryPct)));
  if (typeof (body as any).name !== "undefined") drone.name = deliverSanitizeText((body as any).name);
  if (typeof (body as any).maxPayloadKg !== "undefined") drone.maxPayloadKg = Math.max(0.2, deliverSanitizeNumber((body as any).maxPayloadKg, drone.maxPayloadKg));
  if (typeof (body as any).rangeKm !== "undefined") drone.rangeKm = Math.max(1, deliverSanitizeNumber((body as any).rangeKm, drone.rangeKm));
  if (typeof (body as any).speedKph !== "undefined") drone.speedKph = Math.max(10, deliverSanitizeNumber((body as any).speedKph, drone.speedKph));
  drone.lastUpdated = deliverNowIso();
  deliverWriteStore(tenant, store);
  res.json({ updated: true, drone, summary: deliverSummarize(store) });
});

app.get("/deliver/orders", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const phone = deliverSanitizeText(req.query.phone);
  const status = deliverSanitizeText(req.query.status).toLowerCase();
  const store = deliverReadStore(tenant);
  let orders = phone ? store.orders.filter((o: any) => deliverSanitizeText(o.clientPhone) === phone) : store.orders;
  if (status) {
    if (status === "pending") {
      orders = orders.filter((o: any) => {
        const s = deliverSanitizeText(o.status).toLowerCase();
        return s !== "suspended" && s !== "closed" && s !== "delivered";
      });
    } else if (status === "closed") {
      orders = orders.filter((o: any) => {
        const s = deliverSanitizeText(o.status).toLowerCase();
        return s === "closed" || s === "delivered";
      });
    } else {
      orders = orders.filter((o: any) => deliverSanitizeText(o.status).toLowerCase() === status);
    }
  }
  res.json({ orders, summary: deliverSummarize(store) });
});

app.post("/deliver/orders/:id/status", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const id = deliverSanitizeText(req.params.id);
  if (!id) return res.status(400).json({ error: "Order id is required" });
  const body = req.body ?? {};
  const status = deliverSanitizeText((body as any).status).toLowerCase();
  if (!(status === "pending" || status === "suspended" || status === "closed")) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const store = deliverReadStore(tenant);
  const order = store.orders.find((o: any) => String(o.id) === id);
  if (!order) return res.status(404).json({ error: "Not found" });

  const assignedDroneId = deliverSanitizeText(order.assignedDroneId);
  if (assignedDroneId) {
    const drone = store.drones.find((d: any) => String(d.id) === String(assignedDroneId));
    if (drone && String(drone.activeOrderId ?? "") === String(order.id ?? "")) {
      drone.status = "available";
      drone.activeOrderId = "";
      drone.lastUpdated = deliverNowIso();
    }
  }
  if (status === "pending" || status === "suspended" || status === "closed") {
    order.assignedDroneId = "";
    order.assignedAt = "";
  }
  order.status = status;
  deliverWriteStore(tenant, store);
  res.json({ updated: true, order, summary: deliverSummarize(store) });
});

app.post("/deliver/orders", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const store = deliverReadStore(tenant);
  const order = {
    id: deliverCreateOrderId(),
    clientName: deliverSanitizeText((body as any).clientName),
    clientPhone: deliverSanitizeText((body as any).clientPhone),
    pickupAddress: deliverSanitizeText((body as any).pickupAddress),
    dropoffAddress: deliverSanitizeText((body as any).dropoffAddress),
    packageWeightKg: Math.max(0.1, deliverSanitizeNumber((body as any).packageWeightKg, 0)),
    priority: deliverSanitizeText((body as any).priority || "normal").toLowerCase(),
    status: "pending",
    assignedDroneId: "",
    assignedAt: "",
    createdAt: deliverNowIso(),
    deliveredAt: "",
    confirmation: null
  };
  if (!order.clientName || !order.clientPhone || !order.pickupAddress || !order.dropoffAddress) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  store.orders.unshift(order);
  deliverWriteStore(tenant, store);
  res.status(201).json({ stored: true, order, summary: deliverSummarize(store) });
});

app.post("/deliver/orders/auto-assign", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const store = deliverReadStore(tenant);
  let assignedCount = 0;
  for (const order of store.orders) {
    if (order.status !== "pending") continue;
    const drone = deliverBestDroneForOrder(store.drones, order);
    if (!drone) continue;
    order.assignedDroneId = drone.id;
    order.assignedAt = deliverNowIso();
    order.status = "assigned";
    drone.status = "in-flight";
    drone.activeOrderId = order.id;
    drone.lastUpdated = deliverNowIso();
    assignedCount += 1;
  }
  deliverWriteStore(tenant, store);
  res.json({ assignedCount, summary: deliverSummarize(store) });
});

app.post("/deliver/orders/:id/assign", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const id = deliverSanitizeText(req.params.id);
  const body = req.body ?? {};
  const droneId = deliverSanitizeText((body as any).droneId);
  if (!id) return res.status(400).json({ error: "Order id is required" });
  if (!droneId) return res.status(400).json({ error: "droneId is required" });
  const store = deliverReadStore(tenant);
  const order = store.orders.find((o: any) => String(o.id) === id);
  if (!order) return res.status(404).json({ error: "Not found" });
  if (order.status !== "pending") return res.status(400).json({ error: "Order is not pending" });
  const drone = store.drones.find((d: any) => String(d.id) === droneId);
  if (!drone) return res.status(400).json({ error: "Drone not found" });
  if (!deliverIsDroneAvailable(drone)) return res.status(400).json({ error: "Drone is not available" });
  if (deliverSanitizeNumber(drone.maxPayloadKg, 0) < deliverSanitizeNumber(order.packageWeightKg, 0)) {
    return res.status(400).json({ error: "Drone payload limit is below package weight" });
  }
  order.assignedDroneId = drone.id;
  order.assignedAt = deliverNowIso();
  order.status = "assigned";
  drone.status = "in-flight";
  drone.activeOrderId = order.id;
  drone.lastUpdated = deliverNowIso();
  deliverWriteStore(tenant, store);
  res.json({ assigned: true, order, drone, summary: deliverSummarize(store) });
});

app.post("/deliver/orders/:id/confirm", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const id = deliverSanitizeText(req.params.id);
  if (!id) return res.status(400).json({ error: "Order id is required" });
  const body = req.body ?? {};
  const receiverName = deliverSanitizeText((body as any).receiverName);
  const proofCode = deliverSanitizeText((body as any).proofCode);
  const notes = deliverSanitizeText((body as any).notes);
  if (!receiverName || !proofCode) return res.status(400).json({ error: "receiverName and proofCode are required" });
  const store = deliverReadStore(tenant);
  const order = store.orders.find((o: any) => String(o.id) === id);
  if (!order) return res.status(404).json({ error: "Not found" });
  if (!(order.status === "assigned" || order.status === "in_transit" || order.status === "in-flight")) {
    return res.status(400).json({ error: "Order is not in transit" });
  }
  order.status = "delivered";
  order.deliveredAt = deliverNowIso();
  order.confirmation = { receiverName, proofCode, notes, confirmedAt: deliverNowIso() };
  if (order.assignedDroneId) {
    const drone = store.drones.find((d: any) => String(d.id) === String(order.assignedDroneId));
    if (drone) deliverUpdateDroneAfterDelivery(drone);
  }
  deliverWriteStore(tenant, store);
  res.json({ delivered: true, order, summary: deliverSummarize(store) });
});

app.get("/d1/assets", (req, res) => {
  const { raw, tenant } = readTenant(req as any);
  normalizeAssetIdsForTenant(tenant);
  const stmt = raw && raw !== tenant
    ? db.prepare("SELECT data, updated_at, created_at FROM assets WHERE tenant_id = ? OR tenant_id = ? ORDER BY updated_at DESC")
    : db.prepare("SELECT data, updated_at, created_at FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC");
  const rows = raw && raw !== tenant ? stmt.all(tenant, raw) : stmt.all(tenant);
  const assets = rows
    .map((r: any) => {
      const parsed = parseStoredJson(r.data);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        ...(parsed as any),
        updated_at: String(r.updated_at ?? "").trim() || undefined,
        created_at: String(r.created_at ?? "").trim() || undefined
      };
    })
    .filter(Boolean);
  res.json({ assets, tenantId: tenant });
});

app.post("/d1/assets", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const { raw, tenant } = readTenant(req as any);
  const body = req.body ?? {};
  const imei = String((body as any).imei ?? "").trim();
  const cameraSerial = String((body as any).cameraSerial ?? "").trim();
  const registration = String((body as any).registration ?? "").trim();

  const findExistingIdByImeiOrCameraSerialOrReg = (): string => {
    try {
      const rows = raw && raw !== tenant
        ? db.prepare("SELECT data FROM assets WHERE tenant_id = ? OR tenant_id = ? ORDER BY updated_at DESC").all(tenant, raw)
        : db.prepare("SELECT data FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC").all(tenant);

      const parsedRows = rows
        .map((row: any) => parseStoredJson(row?.data))
        .filter((row: any) => row && typeof row === "object");

      const findBy = (field: "imei" | "cameraSerial" | "registration", value: string) => {
        const needle = String(value ?? "").trim().toLowerCase();
        if (!needle) return "";
        const match = parsedRows.find((row: any) => String((row as any)?.[field] ?? "").trim().toLowerCase() === needle);
        return String((match as any)?.id ?? "").trim();
      };

      return findBy("imei", imei) || findBy("cameraSerial", cameraSerial) || findBy("registration", registration);
    } catch {
      // ignore
    }
    return "";
  };

  let id = String(body.id ?? body.assetId ?? body.registration ?? body.cameraSerial ?? "").trim();
  const matchId = findExistingIdByImeiOrCameraSerialOrReg();
  // Always prefer canonical existing identity by IMEI/camera serial/registration to avoid duplicates.
  if (matchId) {
    id = matchId;
  } else if (id) {
    try {
      const existingById = raw && raw !== tenant
        ? db.prepare("SELECT data FROM assets WHERE (tenant_id = ? OR tenant_id = ?) AND id = ? ORDER BY updated_at DESC LIMIT 1").get(tenant, raw, id)
        : db.prepare("SELECT data FROM assets WHERE tenant_id = ? AND id = ?").get(tenant, id);
      if (!existingById?.data) {
        // keep provided id for brand new assets only
      }
    } catch {
      // ignore
    }
  }

  if (!id) return res.status(400).json({ error: "id is required" });
  const now = new Date().toISOString();
  const configGroup = String((body as any).configGroup ?? "").trim();
  if (!configGroup) return res.status(400).json({ error: "Configuration group is required." });
  // IMEI can be saved later (save-per-page). Commissioning/commands will require IMEI.
  if (configGroup) {
    const groups = listConfigGroups(tenant);
    const fallbackGroups = raw && raw !== tenant ? listConfigGroups(raw) : [];
    let group = resolveByNameOrId(groups.length ? groups : fallbackGroups, configGroup);
    if (!group) {
      // Keep local VPS usable even when support users select a label that was never provisioned.
      // We create baseline bindings + the group, so the asset can be stored.
      const safeId = configGroup
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const groupId = safeId || `group-${Date.now()}`;
      const nowIso = new Date().toISOString();
      try {
        db.prepare("INSERT OR REPLACE INTO bindings (type, id, data) VALUES (?, ?, ?)").run(
          "notifications",
          "default-notifications",
          JSON.stringify({ id: "default-notifications", name: "Default Notifications", monitoredEvents: [] })
        );
        db.prepare("INSERT OR REPLACE INTO bindings (type, id, data) VALUES (?, ?, ?)").run(
          "locations",
          "default-locations",
          JSON.stringify({ id: "default-locations", name: "Default Locations" })
        );
        db.prepare("INSERT OR REPLACE INTO bindings (type, id, data) VALUES (?, ?, ?)").run(
          "devices",
          "default-devices",
          JSON.stringify({ id: "default-devices", name: "Default Devices" })
        );
        db.prepare("INSERT INTO configuration_groups (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id, tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").run(
          groupId,
          tenant,
          JSON.stringify({
            id: groupId,
            name: configGroup,
            notificationBinding: "default-notifications",
            locationBinding: "default-locations",
            deviceBinding: "default-devices"
          }),
          nowIso
        );
        group = { id: groupId, name: configGroup };
      } catch {
        return res.status(400).json({ error: "Configuration group not found." });
      }
    }
  }

  let existingNumericAssetId = 0;
  try {
    const existingById = raw && raw !== tenant
      ? db.prepare("SELECT data FROM assets WHERE (tenant_id = ? OR tenant_id = ?) AND id = ? ORDER BY updated_at DESC LIMIT 1").get(tenant, raw, id)
      : db.prepare("SELECT data FROM assets WHERE tenant_id = ? AND id = ? ORDER BY updated_at DESC LIMIT 1").get(tenant, id);
    const parsedExisting = existingById?.data ? parseStoredJson(existingById.data) : null;
    const n = Number((parsedExisting as any)?.assetId ?? 0);
    if (n > 0) existingNumericAssetId = Math.floor(n);
  } catch {
    // ignore
  }

  const usedAssetIds = listAssetIdsForTenant(tenant, raw);
  const isExistingIdUnique = existingNumericAssetId > 0 && usedAssetIds.filter((n) => n === existingNumericAssetId).length <= 1;
  const assetId = isExistingIdUnique ? existingNumericAssetId : nextAvailableNumericId(usedAssetIds);
  const stmt = db.prepare("INSERT OR REPLACE INTO assets (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)");
  stmt.run(id, tenant, JSON.stringify({ ...body, id, assetId }), now);
  normalizeAssetIdsForTenant(tenant);
  const saved = db.prepare("SELECT data FROM assets WHERE tenant_id = ? AND id = ? ORDER BY updated_at DESC LIMIT 1").get(tenant, id);
  const savedParsed = saved?.data ? parseStoredJson(saved.data) : null;
  const finalAssetId = Number((savedParsed as any)?.assetId ?? assetId);
  res.json({ stored: true, id, tenantId: tenant, assetId: finalAssetId });
});

app.post("/ingest/telemetry", (req, res) => {
  // Allow local forwarding from Traccar on the same VPS without requiring API key headers.
  if (!requireApiKey(req, res) && !isLoopbackRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const result = storeTelemetryEventForTenant(tenant, body);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ stored: true, id: result.id, eventId: result.eventId, tenantId: result.tenantId });
});

app.post("/ingest/freematics", (req, res) => {
  if (!requireApiKey(req, res) && !isLoopbackRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const body = req.body ?? {};
  const normalized = normalizeFreematicsTelemetryBody(body);
  if (!normalized) return res.status(400).json({ error: "Invalid Freematics payload. Latitude and longitude are required." });

  const imei = String((normalized as any)?.data?.imei ?? "").trim();
  const headerTenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
  const tenant = headerTenant || findTenantForImeiWithDefault(imei, FREEMATICS_DEFAULT_TENANT);
  const result = storeTelemetryEventForTenant(tenant, normalized);
  if (!result.ok) return res.status(result.status).json({ error: result.error });

  forwardTelemetryToWorker(normalized as any, tenant);
  res.json({ stored: true, id: result.id, eventId: result.eventId, tenantId: result.tenantId, provider: "freematics" });
});

app.post("/ingest/queclink", (req, res) => {
  if (!requireApiKey(req, res) && !isLoopbackRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const raw = String((req.body as any)?.line ?? (req.body as any)?.payload ?? "").trim();
  if (!raw) return res.status(400).json({ error: "line or payload is required" });

  const parsed = parseQueclinkTextMessage(raw);
  if (!parsed) return res.status(400).json({ error: "Unable to decode Queclink payload" });

  const headerTenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
  const tenant = headerTenant || findTenantForImeiWithDefault(parsed.imei, QUECLINK_DEFAULT_TENANT);
  const body: any = {
    data: {
      imei: parsed.imei,
      lat: parsed.lat,
      lon: parsed.lon,
      speed: parsed.speed ?? undefined,
      heading: parsed.heading ?? undefined,
      timestamp: parsed.timestamp,
      provider: "queclink",
      messageType: parsed.messageType,
      raw: parsed.raw
    }
  };

  const result = storeTelemetryEventForTenant(tenant, body);
  if (!result.ok) return res.status(result.status).json({ error: result.error });

  forwardTelemetryToWorker(body, tenant);
  res.json({ stored: true, id: result.id, eventId: result.eventId, tenantId: result.tenantId, provider: "queclink" });
});

// Alerts endpoints (VPS runtime parity with Worker)
app.get("/d1/alerts", (req, res) => {
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  try {
    const rows = db.prepare("SELECT data, updated_at FROM alerts WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 500").all(tenant);
    const alerts = rows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));
    res.json({ alerts, tenantId: tenant });
  } catch {
    res.json({ alerts: [], tenantId: tenant });
  }
});

app.post("/d1/alerts", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const id = String((body as any).id ?? cryptoRandom()).trim();
  const now = new Date().toISOString();
  try {
    db.prepare("INSERT OR REPLACE INTO alerts (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)").run(id, tenant, JSON.stringify({ ...body, id }), now);
    res.json({ stored: true, id, tenantId: tenant });
  } catch (e: any) {
    res.status(500).json({ stored: false, error: e?.message ?? String(e) });
  }
});

app.delete("/d1/alerts", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const id = String(req.query.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "id is required" });
  try {
    const result = db.prepare("DELETE FROM alerts WHERE tenant_id = ? AND id = ?").run(tenant, id);
    res.json({ deleted: (result.changes ?? 0) > 0, id, tenantId: tenant });
  } catch {
    res.json({ deleted: false, id, tenantId: tenant });
  }
});

app.get("/d1/device-reporting-settings", (req, res) => {
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const row = db.prepare("SELECT data, updated_at FROM device_reporting_settings WHERE tenant_id = ?").get(tenant);
  if (!row) return res.json({ settings: null, tenantId: tenant });
  res.json({ settings: parseStoredJson(row.data), updatedAt: row.updated_at, tenantId: tenant });
});

app.post("/d1/device-reporting-settings", (req, res) => {
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const now = new Date().toISOString();
  const stmt = db.prepare("INSERT INTO device_reporting_settings (tenant_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at");
  stmt.run(tenant, JSON.stringify(body), now);
  res.json({ stored: true, tenantId: tenant });
});

app.get("/d1/configuration-groups", (req, res) => {
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const rows = db.prepare("SELECT data, updated_at FROM configuration_groups WHERE tenant_id = ? ORDER BY updated_at DESC").all(tenant);
  const groups = rows.map((r: any) => parseStoredJson(r.data)).filter(Boolean);
  res.json({ groups, tenantId: tenant });
});

app.post("/d1/configuration-groups", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const id = String(body.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "Configuration group id is required." });
  const now = new Date().toISOString();
  const stmt = db.prepare("INSERT INTO configuration_groups (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id, tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at");
  stmt.run(id, tenant, JSON.stringify(body), now);
  res.json({ stored: true, id, tenantId: tenant });
});

app.delete("/d1/configuration-groups", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const id = String(req.query.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "Configuration group id is required." });
  const result = db.prepare("DELETE FROM configuration_groups WHERE tenant_id = ? AND id = ?").run(tenant, id);
  res.json({ deleted: (result.changes ?? 0) > 0, id, tenantId: tenant });
});

app.get("/device/artifacts", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const type = String(req.query.type ?? "").trim().toLowerCase();
  if (type !== "firmware" && type !== "config") return res.status(400).json({ error: "type must be firmware or config" });
  const artifact = getBaseArtifact(tenant, type);
  if (!artifact) return res.json({ artifact: null, tenantId: tenant, type });
  res.json({ artifact: { id: artifact.id, name: artifact.name, version: artifact.version, sha256: artifact.sha256, downloadUrl: `/device/artifacts/${artifact.id}` }, tenantId: tenant, type });
});

app.get("/device/artifacts/:id", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const id = String(req.params.id ?? "").trim();
  const row = db.prepare("SELECT r2_key, content_type FROM device_artifacts WHERE tenant_id = ? AND id = ?").get(tenant, id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const ref = String(row.r2_key ?? "");
  res.setHeader("content-type", row.content_type ?? "application/octet-stream");

  if (b2Client && ref && !fs.existsSync(ref)) {
    const key = ref;
    b2Client
      .send(new GetObjectCommand({ Bucket: B2_BUCKET, Key: key }))
      .then((result: any) => {
        if (!result?.Body) return res.status(404).json({ error: "Not found" });
        if (isReadableStream(result.Body)) {
          result.Body.pipe(res);
        } else {
          res.send(result.Body as any);
        }
      })
      .catch(() => res.status(404).json({ error: "Not found" }));
    return;
  }

  if (!ref || !fs.existsSync(ref)) return res.status(404).json({ error: "Not found" });
  fs.createReadStream(ref).pipe(res);
});

// Proxy requests to a device endpoint by device id (simple HTTP proxy)
app.get("/device/:deviceId", async (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  if (!DEVICE_SERVER_DOMAIN || !DEVICE_SERVER_PORT) return res.status(503).json({ error: "Device server not configured" });
  const deviceId = String(req.params.deviceId ?? "");
  const url = `${DEVICE_SERVER_PROTOCOL}://${DEVICE_SERVER_DOMAIN}:${DEVICE_SERVER_PORT}/devices/${encodeURIComponent(deviceId)}`;
  try {
    const fetchFn = (globalThis as any).fetch;
    if (!fetchFn) return res.status(500).json({ error: "fetch not available in runtime" });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (DEVICE_SERVER_API_KEY) headers["x-api-key"] = DEVICE_SERVER_API_KEY;
    const resp = await fetchFn(url, { method: "GET", headers });
    const text = await resp.text();
    res.status(resp.status).set(Object.fromEntries(resp.headers.entries ? resp.headers.entries() : [])).send(text);
  } catch (err: any) {
    res.status(502).json({ error: "Device proxy failed", message: err?.message ?? String(err) });
  }
});

app.post("/device/:deviceId/command", async (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  if (!DEVICE_SERVER_DOMAIN || !DEVICE_SERVER_PORT) return res.status(503).json({ error: "Device server not configured" });
  const deviceId = String(req.params.deviceId ?? "");
  const url = `${DEVICE_SERVER_PROTOCOL}://${DEVICE_SERVER_DOMAIN}:${DEVICE_SERVER_PORT}/devices/${encodeURIComponent(deviceId)}/command`;
  try {
    const fetchFn = (globalThis as any).fetch;
    if (!fetchFn) return res.status(500).json({ error: "fetch not available in runtime" });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (DEVICE_SERVER_API_KEY) headers["x-api-key"] = DEVICE_SERVER_API_KEY;
    const resp = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(req.body ?? {}) });
    const text = await resp.text();
    res.status(resp.status).set(Object.fromEntries(resp.headers.entries ? resp.headers.entries() : [])).send(text);
  } catch (err: any) {
    res.status(502).json({ error: "Device proxy failed", message: err?.message ?? String(err) });
  }
});

function cryptoRandom() {
  return [...Array(4)].map(() => Math.floor(Math.random() * 0xffffffff).toString(16)).join("");
}

const coerceBool = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "true" || s === "yes" || s === "on" || s === "1") return true;
  if (s === "false" || s === "no" || s === "off" || s === "0") return false;
  return null;
};

const coerceNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return null;
};

const pick = (obj: any, paths: string[]) => {
  for (const p of paths) {
    const parts = p.split(".");
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || !(part in cur)) {
        ok = false;
        break;
      }
      cur = cur[part];
    }
    if (ok && typeof cur !== "undefined") return cur;
  }
  return undefined;
};

const buildLatestTelemetrySummary = (event: any, createdAt: string) => {
  const ignitionRaw = pick(event, [
    "data.data.ignition",
    "data.ignition",
    "ignition",
    "attributes.ignition",
    "decoded.ignition",
    "decoded.Ignition"
  ]);
  const ignition = coerceBool(ignitionRaw);

  const powerRaw = pick(event, [
    "data.data.power",
    "data.power",
    "power",
    "attributes.power",
    "data.data.externalPower",
    "data.externalPower",
    "attributes.externalPower",
    "data.data.voltage",
    "data.voltage",
    "attributes.voltage"
  ]);
  const powerVoltage = coerceNumber(powerRaw);

  const batteryRaw = pick(event, [
    "data.data.battery",
    "data.battery",
    "battery",
    "attributes.battery",
    "data.data.batteryVoltage",
    "data.batteryVoltage",
    "attributes.batteryVoltage"
  ]);
  const batteryVoltage = coerceNumber(batteryRaw);

  const satsRaw = pick(event, [
    "data.data.satellites",
    "data.satellites",
    "satellites",
    "attributes.satellites",
    "data.data.sats",
    "data.sats",
    "attributes.sats"
  ]);
  const satellites = coerceNumber(satsRaw);

  const chargingRaw = pick(event, [
    "data.data.charging",
    "data.charging",
    "charging",
    "attributes.charging",
    "data.data.charge",
    "data.charge",
    "attributes.charge"
  ]);
  let charging = coerceBool(chargingRaw);
  if (charging === null && powerVoltage !== null && batteryVoltage !== null) charging = powerVoltage > batteryVoltage + 0.3;

  const firmwareVersion = String(
    pick(event, [
      "data.data.firmware",
      "data.firmware",
      "firmware",
      "attributes.firmware",
      "data.data.fw",
      "data.fw",
      "attributes.fw",
      "device.firmware",
      "device.firmwareVersion"
    ])
      ?? ""
  ).trim();

  const lat = coerceNumber(pick(event, ["data.data.lat", "data.lat", "data.data.latitude", "data.latitude", "lat", "latitude"]));
  const lng = coerceNumber(
    pick(event, [
      "data.data.lon",
      "data.lon",
      "data.data.lng",
      "data.lng",
      "data.data.longitude",
      "data.longitude",
      "lon",
      "lng",
      "longitude"
    ])
  );
  const speed = coerceNumber(pick(event, ["data.data.speed", "data.speed", "speed", "attributes.speed", "position.speed"]));
  const heading = coerceNumber(pick(event, ["data.data.heading", "data.heading", "heading", "attributes.heading", "position.course", "position.heading"]));
  const motionRaw = pick(event, ["data.data.motion", "data.motion", "motion", "attributes.motion", "data.data.moving", "data.moving", "moving"]);
  const motion = coerceBool(motionRaw);
  const movement = (() => {
    if (speed !== null) {
      if (speed <= 1.2) return "stationary" as const;
      if (satellites !== null && satellites <= 3 && speed < 8) return "stationary" as const;
      if (ignition === false && speed < 8) return "stationary" as const;
      return "moving" as const;
    }
    if (motion === true) {
      if (satellites !== null && satellites <= 3) return "stationary" as const;
      if (ignition === false) return "stationary" as const;
      return "moving" as const;
    }
    if (motion === false) return "stationary" as const;
    if (ignition === false) return "stationary" as const;
    return "unknown" as const;
  })();

  return {
    at: createdAt,
    ignition: ignition === null ? undefined : ignition,
    powerVoltage: powerVoltage === null ? undefined : powerVoltage,
    satellites: satellites === null ? undefined : satellites,
    charging: charging === null ? undefined : charging,
    firmwareVersion: firmwareVersion || undefined,
    lat: lat === null ? undefined : lat,
    lng: lng === null ? undefined : lng,
    speed: speed === null ? undefined : speed,
    heading: heading === null ? undefined : heading,
    movement
  };
};

const RBAC_ROLES_BINDING_TYPE = "rbac_roles";
const RBAC_ROLE_PERMS_BINDING_TYPE = "rbac_role_permissions";
const RBAC_USERS_BINDING_TYPE = "rbac_users";
const RBAC_GROUPS_BINDING_TYPE = "rbac_security_groups";
const RBAC_GROUP_ROLES_BINDING_TYPE = "rbac_group_roles";
const RBAC_GROUP_USERS_BINDING_TYPE = "rbac_group_users";
const RBAC_ASSIGNMENTS_BINDING_TYPE = "rbac_assignments";
const RBAC_IMPERSONATION_BINDING_TYPE = "rbac_impersonation_sessions";

type RbacRoleRecord = {
  id: string;
  roleId: string;
  tenantId: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type RbacRolePermissionRecord = {
  id: string;
  roleId: string;
  tenantId: string;
  pagePath: string;
  canView: number;
  canEdit: number;
  canDelete: number;
  updatedAt: string;
};

type RbacUserRecord = {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  assignedTenantId?: string;
  assignedSiteId?: string;
  assignedSiteName?: string;
  assignedRoleId?: string;
};

type RbacGroupRecord = {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const toFlag = (value: unknown) => {
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? 1 : 0;
};

const listRbacRolesForTenant = (tenant: string) => {
  const rows = loadBindingsFromDb(RBAC_ROLES_BINDING_TYPE) as any[];
  return rows
    .filter((r) => String(r?.tenantId ?? "").trim() === tenant)
    .map((r) => ({
      id: String(r.roleId ?? "").trim() || String(r.id ?? "").trim(),
      name: String(r.name ?? "").trim(),
      description: String(r.description ?? "").trim(),
      status: String(r.status ?? "active").trim() || "active",
      createdAt: String(r.createdAt ?? "").trim(),
      updatedAt: String(r.updatedAt ?? "").trim()
    }))
    .filter((r) => r.id && r.name)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const listRbacRolePermsForTenant = (tenant: string) => {
  const rows = loadBindingsFromDb(RBAC_ROLE_PERMS_BINDING_TYPE) as any[];
  return rows
    .filter((r) => String(r?.tenantId ?? "").trim() === tenant)
    .map((r) => ({
      roleId: String(r.roleId ?? "").trim(),
      pagePath: String(r.pagePath ?? "").trim(),
      canView: toFlag(r.canView),
      canEdit: toFlag(r.canEdit),
      canDelete: toFlag(r.canDelete)
    }))
    .filter((r) => r.roleId && r.pagePath);
};

const saveRbacRole = (tenant: string, roleId: string, payload: { name: string; description?: string; status?: string }, createdAt?: string) => {
  const now = new Date().toISOString();
  const storageId = `${tenant}:${roleId}`;
  const rec: RbacRoleRecord = {
    id: storageId,
    roleId,
    tenantId: tenant,
    name: payload.name,
    description: payload.description ?? "",
    status: String(payload.status ?? "active").trim() || "active",
    createdAt: createdAt || now,
    updatedAt: now
  };
  persistBindingToDb(RBAC_ROLES_BINDING_TYPE, rec);
  return rec;
};

const replaceRbacRolePermissions = (tenant: string, roleId: string, permissions: Array<{ pagePath: string; view?: boolean | number; edit?: boolean | number; delete?: boolean | number }>) => {
  const existing = (loadBindingsFromDb(RBAC_ROLE_PERMS_BINDING_TYPE) as any[])
    .filter((r) => String(r?.tenantId ?? "").trim() === tenant && String(r?.roleId ?? "").trim() === roleId);
  for (const rec of existing) {
    const existingId = String(rec?.id ?? "").trim();
    if (existingId) deleteBindingFromDb(RBAC_ROLE_PERMS_BINDING_TYPE, existingId);
  }

  const now = new Date().toISOString();
  for (const p of permissions) {
    const pagePath = String(p?.pagePath ?? "").trim();
    if (!pagePath) continue;
    const id = `${tenant}:${roleId}:${pagePath}`;
    const rec: RbacRolePermissionRecord = {
      id,
      roleId,
      tenantId: tenant,
      pagePath,
      canView: toFlag(p?.view),
      canEdit: toFlag(p?.edit),
      canDelete: toFlag(p?.delete),
      updatedAt: now
    };
    persistBindingToDb(RBAC_ROLE_PERMS_BINDING_TYPE, rec);
  }
};

const listRbacUsers = () => {
  const rows = loadBindingsFromDb(RBAC_USERS_BINDING_TYPE) as any[];
  return rows
    .map((r) => ({
      id: String(r?.id ?? "").trim(),
      name: String(r?.name ?? "").trim(),
      email: String(r?.email ?? "").trim().toLowerCase(),
      status: String(r?.status ?? "active").trim() || "active",
      createdAt: String(r?.createdAt ?? "").trim(),
      updatedAt: String(r?.updatedAt ?? "").trim(),
      assignedTenantId: String(r?.assignedTenantId ?? "").trim(),
      assignedSiteId: String(r?.assignedSiteId ?? "").trim(),
      assignedSiteName: String(r?.assignedSiteName ?? "").trim(),
      assignedRoleId: String(r?.assignedRoleId ?? "").trim()
    }))
    .filter((u) => u.id && u.email);
};

const listRoleAssignmentsForTenant = (tenant: string) => {
  const rows = loadBindingsFromDb(RBAC_ASSIGNMENTS_BINDING_TYPE) as any[];
  return rows
    .filter((r) => String(r?.tenantId ?? "").trim() === tenant)
    .map((r) => ({
      id: String(r?.id ?? "").trim(),
      tenantId: String(r?.tenantId ?? "").trim(),
      userId: String(r?.userId ?? "").trim(),
      tenantAccess: Boolean(r?.tenantAccess),
      roleIds: Array.isArray(r?.roleIds) ? r.roleIds.map((x: any) => String(x ?? "").trim()).filter(Boolean) : [],
      groupIds: Array.isArray(r?.groupIds) ? r.groupIds.map((x: any) => String(x ?? "").trim()).filter(Boolean) : []
    }))
    .filter((r) => r.id && r.userId);
};

const saveRoleAssignmentForTenant = (tenant: string, userId: string, payload: { tenantAccess: boolean; roleIds: string[]; groupIds: string[] }) => {
  const id = `${tenant}:${userId}`;
  persistBindingToDb(RBAC_ASSIGNMENTS_BINDING_TYPE, {
    id,
    tenantId: tenant,
    userId,
    tenantAccess: Boolean(payload.tenantAccess),
    roleIds: (payload.roleIds || []).map((x) => String(x ?? "").trim()).filter(Boolean),
    groupIds: (payload.groupIds || []).map((x) => String(x ?? "").trim()).filter(Boolean),
    updatedAt: new Date().toISOString()
  });
};

const listRbacGroupsForTenant = (tenant: string) => {
  const rows = loadBindingsFromDb(RBAC_GROUPS_BINDING_TYPE) as any[];
  return rows
    .filter((r) => String(r?.tenantId ?? "").trim() === tenant)
    .map((r) => ({
      id: String(r?.id ?? "").trim(),
      name: String(r?.name ?? "").trim(),
      description: String(r?.description ?? "").trim(),
      status: String(r?.status ?? "active").trim() || "active",
      createdAt: String(r?.createdAt ?? "").trim(),
      updatedAt: String(r?.updatedAt ?? "").trim()
    }))
    .filter((g) => g.id && g.name)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const saveRbacGroup = (tenant: string, groupId: string, payload: { name: string; description?: string; status?: string }, createdAt?: string) => {
  const now = new Date().toISOString();
  const rec: RbacGroupRecord = {
    id: groupId,
    tenantId: tenant,
    name: payload.name,
    description: payload.description ?? "",
    status: String(payload.status ?? "active").trim() || "active",
    createdAt: createdAt || now,
    updatedAt: now
  };
  persistBindingToDb(RBAC_GROUPS_BINDING_TYPE, rec);
  return rec;
};

const listGroupRoleLinksForTenant = (tenant: string) => {
  const rows = loadBindingsFromDb(RBAC_GROUP_ROLES_BINDING_TYPE) as any[];
  return rows
    .filter((r) => String(r?.tenantId ?? "").trim() === tenant)
    .map((r) => ({
      groupId: String(r?.groupId ?? "").trim(),
      roleId: String(r?.roleId ?? "").trim()
    }))
    .filter((r) => r.groupId && r.roleId);
};

const listGroupUserLinksForTenant = (tenant: string) => {
  const rows = loadBindingsFromDb(RBAC_GROUP_USERS_BINDING_TYPE) as any[];
  return rows
    .filter((r) => String(r?.tenantId ?? "").trim() === tenant)
    .map((r) => ({
      groupId: String(r?.groupId ?? "").trim(),
      userId: String(r?.userId ?? "").trim()
    }))
    .filter((r) => r.groupId && r.userId);
};

const replaceGroupLinksForTenant = (tenant: string, groupId: string, roleIds: string[], userIds: string[]) => {
  const roleLinks = (loadBindingsFromDb(RBAC_GROUP_ROLES_BINDING_TYPE) as any[])
    .filter((r) => String(r?.tenantId ?? "").trim() === tenant && String(r?.groupId ?? "").trim() === groupId);
  for (const rec of roleLinks) {
    const id = String(rec?.id ?? "").trim();
    if (id) deleteBindingFromDb(RBAC_GROUP_ROLES_BINDING_TYPE, id);
  }
  for (const roleId of roleIds) {
    const cleanRoleId = String(roleId ?? "").trim();
    if (!cleanRoleId) continue;
    const id = `${tenant}:${groupId}:${cleanRoleId}`;
    persistBindingToDb(RBAC_GROUP_ROLES_BINDING_TYPE, { id, tenantId: tenant, groupId, roleId: cleanRoleId, updatedAt: new Date().toISOString() });
  }

  const userLinks = (loadBindingsFromDb(RBAC_GROUP_USERS_BINDING_TYPE) as any[])
    .filter((r) => String(r?.tenantId ?? "").trim() === tenant && String(r?.groupId ?? "").trim() === groupId);
  for (const rec of userLinks) {
    const id = String(rec?.id ?? "").trim();
    if (id) deleteBindingFromDb(RBAC_GROUP_USERS_BINDING_TYPE, id);
  }
  for (const userId of userIds) {
    const cleanUserId = String(userId ?? "").trim();
    if (!cleanUserId) continue;
    const id = `${tenant}:${groupId}:${cleanUserId}`;
    persistBindingToDb(RBAC_GROUP_USERS_BINDING_TYPE, { id, tenantId: tenant, groupId, userId: cleanUserId, updatedAt: new Date().toISOString() });
  }
};

const buildImpersonatedPrincipal = (user: any, tenantHint: string) => {
  const assignmentRows = (loadBindingsFromDb(RBAC_ASSIGNMENTS_BINDING_TYPE) as any[])
    .filter((r) => String(r?.userId ?? "").trim() === String(user?.id ?? "").trim());
  const assignmentTenants = assignmentRows
    .map((r) => String(r?.tenantId ?? "").trim())
    .filter(Boolean);
  const allowedTenants = Array.from(new Set([tenantHint, user?.assignedTenantId, ...assignmentTenants].map((v) => String(v ?? "").trim()).filter(Boolean)));
  const tenantId = allowedTenants[0] || tenantHint || "";
  return {
    tenantId,
    allowedTenants,
    principal: {
      id: String(user?.id ?? ""),
      email: String(user?.email ?? ""),
      name: String(user?.name ?? user?.email ?? ""),
      role: "user",
      impersonatedBy: ADMIN_EMAIL || "admin"
    }
  };
};

app.get("/rbac/roles", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const { raw, tenant } = readTenant(req as any);
  const tenantId = String(tenant || raw || "").trim();
  if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

  const roles = listRbacRolesForTenant(tenantId);
  const permissions = listRbacRolePermsForTenant(tenantId);
  res.json({ roles, permissions, tenantId });
});

app.post("/rbac/roles", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const { raw, tenant } = readTenant(req as any);
  const tenantId = String(tenant || raw || "").trim();
  if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

  const body = req.body ?? {};
  const name = String((body as any).name ?? "").trim();
  const description = String((body as any).description ?? "").trim();
  const status = String((body as any).status ?? "active").trim() || "active";
  const roleId = String((body as any).id ?? cryptoRandom()).trim();
  const permissions = Array.isArray((body as any).permissions) ? ((body as any).permissions as any[]) : [];

  if (!name) return res.status(400).json({ error: "Role name is required" });
  if (!roleId) return res.status(400).json({ error: "Role id is required" });

  const existing = listRbacRolesForTenant(tenantId).find((r) => r.id === roleId);
  if (existing) return res.status(409).json({ error: "Role already exists" });

  const created = saveRbacRole(tenantId, roleId, { name, description, status });
  replaceRbacRolePermissions(tenantId, roleId, permissions as any);

  res.json({ ok: true, role: { id: created.roleId, name: created.name, description: created.description, status: created.status, createdAt: created.createdAt, updatedAt: created.updatedAt } });
});

app.put("/rbac/roles", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const { raw, tenant } = readTenant(req as any);
  const tenantId = String(tenant || raw || "").trim();
  if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

  const body = req.body ?? {};
  const roleId = String((body as any).id ?? "").trim();
  const name = String((body as any).name ?? "").trim();
  const description = String((body as any).description ?? "").trim();
  const status = String((body as any).status ?? "active").trim() || "active";
  const permissions = Array.isArray((body as any).permissions) ? ((body as any).permissions as any[]) : [];
  if (!roleId) return res.status(400).json({ error: "Role id is required" });
  if (!name) return res.status(400).json({ error: "Role name is required" });

  const existing = listRbacRolesForTenant(tenantId).find((r) => r.id === roleId);
  if (!existing) return res.status(404).json({ error: "Role not found" });

  const updated = saveRbacRole(tenantId, roleId, { name, description, status }, existing.createdAt || undefined);
  replaceRbacRolePermissions(tenantId, roleId, permissions as any);

  res.json({ ok: true, role: { id: updated.roleId, name: updated.name, description: updated.description, status: updated.status, createdAt: updated.createdAt, updatedAt: updated.updatedAt } });
});

app.get("/rbac/users", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const users = listRbacUsers();
  const roleById = new Map<string, any>();
  for (const tenantCandidate of Array.from(new Set(users.map((u) => String(u.assignedTenantId ?? "").trim()).filter(Boolean)))) {
    for (const role of listRbacRolesForTenant(tenantCandidate)) roleById.set(role.id, role);
  }
  const hydrated = users.map((u) => {
    const role = u.assignedRoleId ? roleById.get(u.assignedRoleId) : null;
    return {
      ...u,
      assignedRoleName: role?.name ?? (u.assignedRoleId || "")
    };
  });
  res.json({ users: hydrated });
});

app.post("/rbac/users", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const body = req.body ?? {};
  const name = String((body as any).name ?? "").trim();
  const email = String((body as any).email ?? "").trim().toLowerCase();
  const roleId = String((body as any).roleId ?? "").trim();
  const assignment = ((body as any).assignment ?? {}) as any;
  const assignedTenantId = String(assignment?.tenantId ?? "").trim();
  const assignedSiteId = String(assignment?.siteId ?? "").trim();
  const assignedSiteName = String(assignment?.siteName ?? "").trim();
  if (!name) return res.status(400).json({ error: "User name is required" });
  if (!email) return res.status(400).json({ error: "User email is required" });
  if (!roleId) return res.status(400).json({ error: "roleId is required" });
  if (!assignedTenantId) return res.status(400).json({ error: "assignment.tenantId is required" });

  const existing = listRbacUsers().find((u) => u.email === email);
  if (existing) return res.status(409).json({ error: "User already exists" });

  const now = new Date().toISOString();
  const id = String((body as any).id ?? cryptoRandom()).trim() || cryptoRandom();
  const rec: RbacUserRecord = {
    id,
    name,
    email,
    status: "active",
    createdAt: now,
    updatedAt: now,
    assignedTenantId,
    assignedSiteId,
    assignedSiteName,
    assignedRoleId: roleId
  };
  persistBindingToDb(RBAC_USERS_BINDING_TYPE, rec);
  saveRoleAssignmentForTenant(assignedTenantId, id, { tenantAccess: true, roleIds: [roleId], groupIds: [] });

  res.json({ ok: true, user: rec, inviteEmailRequested: Boolean((body as any).sendInvite), inviteEmailAttempted: false, inviteEmailSent: false });
});

app.put("/rbac/users", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const body = req.body ?? {};
  const id = String((body as any).id ?? "").trim();
  if (!id) return res.status(400).json({ error: "User id is required" });

  const existing = listRbacUsers().find((u) => u.id === id);
  if (!existing) return res.status(404).json({ error: "User not found" });

  const now = new Date().toISOString();
  const rec: RbacUserRecord = {
    ...existing,
    name: String((body as any).name ?? existing.name).trim() || existing.name,
    email: String((body as any).email ?? existing.email).trim().toLowerCase() || existing.email,
    status: String((body as any).status ?? existing.status).trim() || existing.status,
    updatedAt: now
  };
  persistBindingToDb(RBAC_USERS_BINDING_TYPE, rec);
  res.json({ ok: true, user: rec });
});

app.get("/rbac/security-groups", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const { raw, tenant } = readTenant(req as any);
  const tenantId = String(tenant || raw || "").trim();
  if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

  const groups = listRbacGroupsForTenant(tenantId);
  const groupRoles = listGroupRoleLinksForTenant(tenantId);
  const groupUsers = listGroupUserLinksForTenant(tenantId);
  res.json({ groups, groupRoles, groupUsers, tenantId });
});

app.post("/rbac/security-groups", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const { raw, tenant } = readTenant(req as any);
  const tenantId = String(tenant || raw || "").trim();
  if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

  const body = req.body ?? {};
  const id = String((body as any).id ?? cryptoRandom()).trim();
  const name = String((body as any).name ?? "").trim();
  const description = String((body as any).description ?? "").trim();
  const status = String((body as any).status ?? "active").trim() || "active";
  const roleIds = Array.isArray((body as any).roleIds) ? ((body as any).roleIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const userIds = Array.isArray((body as any).userIds) ? ((body as any).userIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  if (!name) return res.status(400).json({ error: "Group name is required" });
  if (!id) return res.status(400).json({ error: "Group id is required" });

  const existing = listRbacGroupsForTenant(tenantId).find((g) => g.id === id);
  if (existing) return res.status(409).json({ error: "Security group already exists" });

  const created = saveRbacGroup(tenantId, id, { name, description, status });
  replaceGroupLinksForTenant(tenantId, id, roleIds, userIds);
  res.json({ ok: true, group: created });
});

app.put("/rbac/security-groups", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const { raw, tenant } = readTenant(req as any);
  const tenantId = String(tenant || raw || "").trim();
  if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

  const body = req.body ?? {};
  const id = String((body as any).id ?? "").trim();
  const name = String((body as any).name ?? "").trim();
  const description = String((body as any).description ?? "").trim();
  const status = String((body as any).status ?? "active").trim() || "active";
  const roleIds = Array.isArray((body as any).roleIds) ? ((body as any).roleIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const userIds = Array.isArray((body as any).userIds) ? ((body as any).userIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  if (!id) return res.status(400).json({ error: "Group id is required" });
  if (!name) return res.status(400).json({ error: "Group name is required" });

  const existing = listRbacGroupsForTenant(tenantId).find((g) => g.id === id);
  if (!existing) return res.status(404).json({ error: "Security group not found" });

  const updated = saveRbacGroup(tenantId, id, { name, description, status }, existing.createdAt || undefined);
  replaceGroupLinksForTenant(tenantId, id, roleIds, userIds);
  res.json({ ok: true, group: updated });
});

app.get("/rbac/assignments", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const { raw, tenant } = readTenant(req as any);
  const tenantId = String(tenant || raw || "").trim();
  if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });
  const userId = String(req.query.userId ?? "").trim();
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const assignment = listRoleAssignmentsForTenant(tenantId).find((r) => r.userId === userId) ?? null;
  res.json({
    userId,
    tenantId,
    tenantAccess: Boolean(assignment?.tenantAccess),
    roleIds: assignment?.roleIds ?? [],
    groupIds: assignment?.groupIds ?? []
  });
});

app.put("/rbac/assignments", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const { raw, tenant } = readTenant(req as any);
  const tenantId = String(tenant || raw || "").trim();
  if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });
  const body = req.body ?? {};
  const userId = String((body as any).userId ?? "").trim();
  if (!userId) return res.status(400).json({ error: "userId is required" });
  const tenantAccess = Boolean((body as any).tenantAccess);
  const roleIds = Array.isArray((body as any).roleIds) ? ((body as any).roleIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const groupIds = Array.isArray((body as any).groupIds) ? ((body as any).groupIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  saveRoleAssignmentForTenant(tenantId, userId, { tenantAccess, roleIds, groupIds });

  const existingUser = listRbacUsers().find((u) => u.id === userId);
  if (existingUser) {
    const patch: any = { ...existingUser, updatedAt: new Date().toISOString() };
    if (roleIds.length) patch.assignedRoleId = roleIds[0];
    if (tenantId) patch.assignedTenantId = tenantId;
    persistBindingToDb(RBAC_USERS_BINDING_TYPE, patch);
  }

  res.json({ ok: true });
});

app.post("/auth/impersonate", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const body = req.body ?? {};
  const userId = String((body as any).userId ?? "").trim();
  if (!userId) return res.status(400).json({ error: "userId is required" });
  const user = listRbacUsers().find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ADMIN_TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();
  try {
    db.prepare("INSERT OR REPLACE INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)").run(token, now.toISOString(), expiresAt);
  } catch {
    // ignore
  }

  const principal = buildImpersonatedPrincipal(user, String(user.assignedTenantId ?? ""));
  persistBindingToDb(RBAC_IMPERSONATION_BINDING_TYPE, {
    id: token,
    token,
    userId,
    principal,
    expiresAt,
    createdAt: now.toISOString()
  });

  res.json({ ok: true, token, expiresAt });
});

app.get("/auth/me", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const token = readAuthToken(req);
  const { raw, tenant } = readTenant(req as any);
  const tenantHint = String(tenant || raw || "").trim();

  const imp = (loadBindingsFromDb(RBAC_IMPERSONATION_BINDING_TYPE) as any[])
    .find((r) => String(r?.token ?? "").trim() === token && Date.parse(String(r?.expiresAt ?? "")) > Date.now());
  if (imp?.principal) {
    const principal = imp.principal as any;
    const allowedTenants = Array.isArray(principal.allowedTenants) ? principal.allowedTenants : [];
    return res.json({
      tenantId: String(principal.tenantId ?? tenantHint ?? "").trim(),
      allowedTenants,
      principal: principal.principal ?? null,
      permissions: { mode: "allow-all", rows: [] }
    });
  }

  const tenantId = tenantHint;
  const allowedTenants = tenantId ? [tenantId] : [];
  return res.json({
    tenantId,
    allowedTenants,
    principal: {
      id: "admin",
      email: ADMIN_EMAIL || "admin@local",
      name: "Admin",
      role: "admin"
    },
    permissions: { mode: "allow-all", rows: [] }
  });
});

// Simple SSE stream for telemetry
app.get("/stream/telemetry", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  res.writeHead(200, {
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*"
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`);
  const iv = setInterval(() => {
    const rows = db.prepare("SELECT data, created_at FROM telemetry_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20").all(tenant);
    const events = rows.map((r: any) => parseStoredJson(r.data)).filter(Boolean);
    if (events.length) {
      res.write(`event: telemetry\ndata: ${JSON.stringify(events)}\n\n`);
    } else {
      res.write(`event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    }
  }, 5000);
  req.on("close", () => clearInterval(iv));
});

// Telemetry lookup (compatible with frontend's telemetryLookupByImeiDetailed)
app.get("/telemetry/lookup", async (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const imei = String(req.query.imei ?? "").trim();
  if (!imei) return res.status(400).json({ error: "imei is required" });

  try {
    const assetRows = db.prepare("SELECT data, updated_at FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC").all(tenant);
    const assets = assetRows
      .map((r: any) => parseStoredJson(r.data))
      .filter(Boolean)
      .filter((a: any) => String(a?.imei ?? "").trim() === imei);

    let eventRows = db.prepare("SELECT data, created_at FROM telemetry_events WHERE tenant_id = ? AND imei = ? ORDER BY created_at DESC LIMIT 50").all(tenant, imei);
    if ((!eventRows || eventRows.length === 0) && assets.length) {
      const assetIds = assets
        .map((a: any) => String(a?.id ?? "").trim())
        .filter(Boolean)
        .slice(0, 20);
      if (assetIds.length) {
        const placeholders = assetIds.map(() => "?").join(", ");
        eventRows = db
          .prepare(`SELECT data, created_at FROM telemetry_events WHERE tenant_id = ? AND asset_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 50`)
          .all(tenant, ...assetIds);
      }
    }
    const events = eventRows
      .map((r: any) => ({ data: parseStoredJson(r.data), created_at: String(r.created_at ?? "").trim() }))
      .filter((r: any) => r.data);

    const latestRow = events[0] ?? null;
    let latest = latestRow ? buildLatestTelemetrySummary(latestRow.data, latestRow.created_at || new Date().toISOString()) : undefined;

    const refreshLiveRequested = ["1", "true", "yes"].includes(String(req.query.refreshLive ?? "").trim().toLowerCase());
    const latestAtMs = Date.parse(String((latest as any)?.at ?? ""));
    const latestStale = !Number.isFinite(latestAtMs) || (Date.now() - latestAtMs) > 2 * 60 * 1000;
    const latestHasCoords = typeof (latest as any)?.lat === "number" && typeof (latest as any)?.lng === "number";

    if (refreshLiveRequested && (!latestHasCoords || latestStale)) {
      const livePosition = await traccarResolveLatestPositionByImei(imei);
      if (livePosition) {
        const attrs = ((livePosition as any)?.attributes ?? {}) as Record<string, unknown>;
        const lat = coerceNumber((livePosition as any)?.latitude ?? (livePosition as any)?.lat);
        const lng = coerceNumber((livePosition as any)?.longitude ?? (livePosition as any)?.lon ?? (livePosition as any)?.lng);
        const speed = coerceNumber((livePosition as any)?.speed ?? attrs.speed);
        const heading = coerceNumber((livePosition as any)?.course ?? (livePosition as any)?.heading ?? attrs.heading);
        const satellites = coerceNumber(
          (livePosition as any)?.satellites ??
            attrs.satellites ??
            attrs.satelliteCount ??
            attrs["Number of Satellites"]
        );
        const ignition = coerceBool((livePosition as any)?.ignition ?? attrs.ignition ?? attrs.Ignition ?? attrs["Ignition"]);
        const charging = coerceBool((livePosition as any)?.charging ?? attrs.charging ?? attrs.charge);
        const powerVoltage = coerceNumber(
          (livePosition as any)?.power ??
            attrs.power ??
            attrs.externalPower ??
            attrs.voltage ??
            attrs["Power Voltage"]
        );
        const firmwareVersion = String(
          (livePosition as any)?.firmwareVersion ??
            (livePosition as any)?.firmware ??
            attrs.firmwareVersion ??
            attrs.firmware ??
            attrs.fw ??
            ""
        ).trim();
        const movement = (() => {
          if (typeof speed === "number") {
            if (speed <= 1.2) return "stationary" as const;
            if (typeof satellites === "number" && satellites <= 3 && speed < 8) return "stationary" as const;
            if (ignition === false && speed < 8) return "stationary" as const;
            return "moving" as const;
          }
          if (ignition === false) return "stationary" as const;
          return "unknown" as const;
        })();

        if (typeof lat === "number" && typeof lng === "number") {
          const at = pickTraccarPositionAt(livePosition) || new Date().toISOString();
          latest = {
            at,
            ignition: typeof ignition === "boolean" ? ignition : undefined,
            powerVoltage: typeof powerVoltage === "number" ? powerVoltage : undefined,
            satellites: typeof satellites === "number" ? satellites : undefined,
            charging: typeof charging === "boolean" ? charging : undefined,
            firmwareVersion: firmwareVersion || undefined,
            lat,
            lng,
            speed: typeof speed === "number" ? speed : undefined,
            heading: typeof heading === "number" ? heading : undefined,
            movement
          };
        }
      }
    }

    res.json({
      imei,
      tenantId: tenant,
      assets,
      events: events.map((e: any) => ({ ...(e.data || {}), created_at: e.created_at })),
      latest
    });
  } catch (e: any) {
    res.status(500).json({ error: "Telemetry lookup failed", message: e?.message ?? String(e) });
  }
});

app.get("/telemetry/history", async (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const imei = String(req.query.imei ?? "").trim();
  const assetId = String(req.query.assetId ?? "").trim();
  const from = String(req.query.from ?? "").trim();
  const to = String(req.query.to ?? "").trim();
  const includeArchive = String(req.query.includeArchive ?? "false").trim().toLowerCase() === "true";
  const includeArchivePayload = String(req.query.includeArchivePayload ?? "false").trim().toLowerCase() === "true";
  const limitRaw = Number(req.query.limit ?? 500);
  const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 500, 5000));

  try {
    const clauses: string[] = ["tenant_id = ?"];
    const params: any[] = [tenant];
    if (imei) {
      clauses.push("imei = ?");
      params.push(imei);
    }
    if (assetId) {
      clauses.push("asset_id = ?");
      params.push(assetId);
    }
    if (from) {
      clauses.push("created_at >= ?");
      params.push(from);
    }
    if (to) {
      clauses.push("created_at <= ?");
      params.push(to);
    }

    const where = clauses.join(" AND ");
    const rows = db
      .prepare(`SELECT id, asset_id, imei, created_at, data FROM telemetry_events WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`)
      .all(...params);

    const events = rows.map((row: any) => {
      const parsed = parseStoredJson(row.data);
      return {
        id: String(row.id ?? ""),
        assetId: String(row.asset_id ?? ""),
        imei: String(row.imei ?? ""),
        createdAt: String(row.created_at ?? ""),
        data: parsed
      };
    });

    let archives: any[] = [];
    if (includeArchive) {
      const archiveRows = db
        .prepare(`SELECT event_id, asset_id, imei, created_at, storage, storage_key, content_type, size_bytes FROM telemetry_archives WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`)
        .all(...params);

      if (includeArchivePayload) {
        const maxWithPayload = Math.min(50, archiveRows.length);
        const enriched: any[] = [];
        for (let i = 0; i < maxWithPayload; i += 1) {
          const row = archiveRows[i];
          const payload = await readTelemetryArchivePayload(row);
          enriched.push({
            eventId: String(row.event_id ?? ""),
            assetId: String(row.asset_id ?? ""),
            imei: String(row.imei ?? ""),
            createdAt: String(row.created_at ?? ""),
            storage: String(row.storage ?? ""),
            storageKey: String(row.storage_key ?? ""),
            contentType: String(row.content_type ?? "application/json"),
            sizeBytes: Number(row.size_bytes ?? 0),
            payload
          });
        }
        archives = enriched;
      } else {
        archives = archiveRows.map((row: any) => ({
          eventId: String(row.event_id ?? ""),
          assetId: String(row.asset_id ?? ""),
          imei: String(row.imei ?? ""),
          createdAt: String(row.created_at ?? ""),
          storage: String(row.storage ?? ""),
          storageKey: String(row.storage_key ?? ""),
          contentType: String(row.content_type ?? "application/json"),
          sizeBytes: Number(row.size_bytes ?? 0)
        }));
      }
    }

    res.json({
      tenantId: tenant,
      filters: { imei, assetId, from, to, limit },
      counts: { events: events.length, archives: archives.length },
      events,
      ...(includeArchive ? { archives } : {})
    });
  } catch (e: any) {
    res.status(500).json({ error: "Telemetry history lookup failed", message: e?.message ?? String(e) });
  }
});

app.get("/telemetry/archive/:eventId", async (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const eventId = String(req.params.eventId ?? "").trim();
  if (!eventId) return res.status(400).json({ error: "eventId is required" });

  try {
    const row = db
      .prepare("SELECT event_id, asset_id, imei, created_at, storage, storage_key, content_type, size_bytes FROM telemetry_archives WHERE tenant_id = ? AND event_id = ? LIMIT 1")
      .get(tenant, eventId);
    if (!row) return res.status(404).json({ error: "Archive not found" });
    const payload = await readTelemetryArchivePayload(row);
    if (!payload) return res.status(404).json({ error: "Archive payload unavailable" });
    res.json({
      eventId: String(row.event_id ?? ""),
      tenantId: tenant,
      assetId: String(row.asset_id ?? ""),
      imei: String(row.imei ?? ""),
      createdAt: String(row.created_at ?? ""),
      storage: String(row.storage ?? ""),
      storageKey: String(row.storage_key ?? ""),
      contentType: String(row.content_type ?? "application/json"),
      sizeBytes: Number(row.size_bytes ?? 0),
      payload
    });
  } catch (e: any) {
    res.status(500).json({ error: "Telemetry archive read failed", message: e?.message ?? String(e) });
  }
});

// Basic PAT endpoints
app.get("/pat", (_req, res) => {
  const rows = db.prepare("SELECT id, token, description, organisationName, organisationGroup, expiryDate, status, daysToExpiry, username, createdAt FROM pats").all();
  res.json({ tokens: rows });
});

app.post("/pat", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const body = req.body ?? {};
  const id = cryptoRandom();
  const token = cryptoRandom();
  const now = new Date().toISOString();
  const expiryDays = Math.min(Math.max(Number(body.expiryDays ?? 180), 30), 365);
  const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO pats (id, token, description, organisationName, organisationGroup, expiryDate, status, daysToExpiry, username, createdAt, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, token, body.description ?? "Personal access token", body.organisationName ?? "", body.organisationGroup ?? "", expiryDate, "Active", expiryDays, body.username ?? "", now, JSON.stringify(body));
  res.json({ token: { id, token, expiryDate } });
});

// Bindings endpoints (persistent when sqlite available)
app.get("/d1/bindings", (req, res) => {
  const type = String(req.query.type ?? "");
  // bindings are database-scoped via normalized tenantId; stored without tenant dimension
  const rows = loadBindingsFromDb(type || undefined);
  res.json({ bindings: rows });
});

app.post("/d1/bindings", (req, res) => {
  if (!requireApiKey(req as any, res)) return res.status(401).json({ error: "Unauthorized" });
  const type = String(req.query.type ?? "");
  const body = req.body ?? {};
  const id = String((body as any).id ?? "").trim();
  if (!id) return res.status(400).json({ error: "Binding id is required." });
  const rec = { ...body, id };
  try {
    persistBindingToDb(type, rec);
  } catch (e) {
    // ignore
  }
  res.json({ stored: true, id });
});

app.delete("/d1/bindings", (req, res) => {
  if (!requireApiKey(req as any, res)) return res.status(401).json({ error: "Unauthorized" });
  const id = String(req.query.id ?? "");
  const type = String(req.query.type ?? "");
  if (!id) return res.status(400).json({ error: "id is required" });
  try {
    deleteBindingFromDb(type, id);
  } catch (e) {
    // ignore
  }
  res.json({ deleted: true });
});

// KV endpoints (sqlite-backed when available). Used by frontend saveToApi/loadFromApi.
app.get("/kv/:key", (req, res) => {
  if (!requireApiKey(req as any, res)) return res.status(401).json({ error: "Unauthorized" });
  const { raw, tenant } = readTenant(req as any);
  const key = String(req.params.key ?? "").trim();
  if (!key) return res.status(400).json({ error: "Key is required." });
  try {
    if (!Database) {
      const stored = _inMemoryKv[tenant || "default"]?.[key] ?? (raw && raw !== tenant ? _inMemoryKv[raw]?.[key] : undefined);
      if (!stored) return res.status(404).json({ error: "Not found" });
      try {
        return res.json(JSON.parse(stored));
      } catch {
        return res.type("application/json").send(stored);
      }
    }
    const row: any = raw && raw !== tenant
      ? db.prepare("SELECT data FROM kv_store WHERE (tenant_id = ? OR tenant_id = ?) AND k = ? ORDER BY updated_at DESC LIMIT 1").get(tenant || "default", raw, key)
      : db.prepare("SELECT data FROM kv_store WHERE tenant_id = ? AND k = ?").get(tenant || "default", key);
    const stored = String(row?.data ?? "");
    if (!stored) return res.status(404).json({ error: "Not found" });
    try {
      return res.json(JSON.parse(stored));
    } catch {
      return res.type("application/json").send(stored);
    }
  } catch (e) {
    return res.status(500).json({ error: "KV read failed" });
  }
});

app.post("/kv/:key", (req, res) => {
  if (!requireApiKey(req as any, res)) return res.status(401).json({ error: "Unauthorized" });
  const { tenant } = readTenant(req as any);
  const key = String(req.params.key ?? "").trim();
  if (!key) return res.status(400).json({ error: "Key is required." });
  const now = new Date().toISOString();
  try {
    const payload = req.body ?? {};
    const data = JSON.stringify(payload);
    if (!Database) {
      const t = tenant || "default";
      if (!_inMemoryKv[t]) _inMemoryKv[t] = {};
      _inMemoryKv[t][key] = data;
      return res.json({ stored: true, key });
    }
    db.prepare("INSERT OR REPLACE INTO kv_store (k, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)").run(
      key,
      tenant || "default",
      data,
      now
    );
    return res.json({ stored: true, key });
  } catch (e) {
    return res.status(500).json({ error: "KV write failed" });
  }
});

app.post("/admin/device-artifacts", async (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const type = String(body.type ?? "").trim().toLowerCase();
  if (type !== "firmware" && type !== "config") return res.status(400).json({ error: "type must be firmware or config" });
  const name = String(body.name ?? "").trim();
  const version = String(body.version ?? "").trim();
  const contentBase64 = String(body.contentBase64 ?? "").trim();
  const contentType = String(body.contentType ?? "application/octet-stream").trim();
  const isBase = Boolean(body.isBase ?? true);
  if (!name || !version || !contentBase64) return res.status(400).json({ error: "name, version, and contentBase64 are required." });
  const id = cryptoRandom();
  const bytes = Buffer.from(contentBase64, "base64");
  if (!bytes.length) return res.status(400).json({ error: "contentBase64 is invalid." });
  const hash = sha256Hex(bytes);
  const storageKey = `${tenant || "default"}/${type}/${id}`;
  let storageRef = "";
  if (b2Client) {
    try {
      const put = new PutObjectCommand({
        Bucket: B2_BUCKET,
        Key: storageKey,
        Body: bytes,
        ContentType: contentType,
        Metadata: { sha256: hash, type }
      });
      await b2Client.send(put);
      storageRef = storageKey;
    } catch (e) {
      // fall back to local storage if B2 fails
      storageRef = "";
    }
  }
  if (!storageRef) {
    const tenantDir = path.join(DEVICE_ARTIFACTS_DIR, tenant || "default", type);
    fs.mkdirSync(tenantDir, { recursive: true });
    const filePath = path.join(tenantDir, id);
    fs.writeFileSync(filePath, bytes);
    storageRef = filePath;
  }
  const now = new Date().toISOString();
  const stmt = db.prepare("INSERT INTO device_artifacts (id, tenant_id, type, name, version, r2_key, content_type, sha256, is_base, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  stmt.run(id, tenant, type, name, version, storageRef, contentType, hash, isBase ? 1 : 0, now);
  res.json({ stored: true, id, tenantId: tenant, type, sha256: hash, isBase, storage: b2Client ? "b2" : "local" });
});


app.get("/device/settings", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const imei = String(req.query.imei ?? "").trim();
  if (!imei) return res.status(400).json({ error: "imei is required." });
  const result = buildDeviceSettingsPayload(tenant, imei);
  if (!result.ok) return res.status(400).json({ error: result.message });
  res.json({ settings: result.payload, tenantId: tenant, imei });
});

app.post("/device/push-settings", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const imei = String(req.body?.imei ?? "").trim();
  if (!imei) return res.status(400).json({ error: "imei is required." });
  const result = buildDeviceSettingsPayload(tenant, imei);
  if (!result.ok) return res.status(400).json({ error: result.message });
  const id = cryptoRandom();
  const assetId = String((result.payload as any).asset?.id ?? "");
  const now = new Date().toISOString();
  const stmt = db.prepare("INSERT INTO device_push_queue (id, tenant_id, imei, asset_id, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  stmt.run(id, tenant, imei, assetId, "queued", JSON.stringify(result.payload), now, now);
  res.json({ queued: true, id, tenantId: tenant, imei });
});

app.get("/device/pending-settings", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const imei = String(req.query.imei ?? "").trim();
  if (!imei) return res.status(400).json({ error: "imei is required." });
  const row = db.prepare("SELECT id, payload, created_at FROM device_push_queue WHERE tenant_id = ? AND imei = ? AND status = 'queued' ORDER BY created_at DESC LIMIT 1").get(tenant, imei);
  if (!row) return res.json({ pending: null, tenantId: tenant, imei });
  const payload = JSON.parse(row.payload ?? "{}");
  res.json({ pending: { id: row.id, payload, createdAt: row.created_at }, tenantId: tenant, imei });
});

app.post("/device/ack-settings", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const id = String(req.body?.id ?? "").trim();
  const imei = String(req.body?.imei ?? "").trim();
  if (!id || !imei) return res.status(400).json({ error: "id and imei are required." });
  const now = new Date().toISOString();
  const result = db.prepare("UPDATE device_push_queue SET status = 'delivered', updated_at = ? WHERE tenant_id = ? AND id = ? AND imei = ?").run(now, tenant, id, imei);
  res.json({ delivered: (result.changes ?? 0) > 0, id, tenantId: tenant, imei });
});

app.post("/ingest/camera-health", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
  const body = req.body ?? {};
  const cameraId = resolveCameraId(req, body);
  if (!cameraId) return res.status(400).json({ error: "cameraId/deviceId is required" });
  const atIso = toIsoTimestamp((body as any).recordedAt ?? (body as any).at ?? Date.now());
  try {
    const stored = upsertCameraHealth(tenant, cameraId, body, atIso);
    res.status(202).json({ accepted: true, cameraId, tenantId: tenant, at: atIso, camera: stored });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to ingest camera health", message: e?.message ?? String(e) });
  }
});

app.get("/d1/cameras", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
  try {
    const cameras = listCameraHealth(tenant);
    const nowMs = Date.now();
    const items = cameras.map((camera: any) => {
      const lastSeenMs = Date.parse(String(camera?.lastSeenAt ?? ""));
      const staleSec = Number.isFinite(lastSeenMs) ? Math.floor((nowMs - lastSeenMs) / 1000) : null;
      return { ...camera, staleSec };
    });
    res.json({ tenantId: tenant, cameras: items, count: items.length, at: new Date().toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to list cameras", message: e?.message ?? String(e) });
  }
});

app.get("/d1/cameras/:cameraId", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
  const cameraId = sanitizeCameraId(req.params.cameraId);
  if (!cameraId) return res.status(400).json({ error: "cameraId is required" });
  try {
    const row = db.prepare("SELECT data, updated_at FROM camera_health WHERE tenant_id = ? AND camera_id = ?").get(tenant, cameraId);
    if (!row) return res.status(404).json({ error: "Not found" });
    const parsed = parseStoredJson((row as any).data) || {};
    const latestAudio = db
      .prepare(
        "SELECT id, recorded_at, sample_rate, channels, bytes, file_path, created_at FROM camera_audio_chunks WHERE tenant_id = ? AND camera_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(tenant, cameraId);
    res.json({
      tenantId: tenant,
      camera: {
        ...parsed,
        id: cameraId,
        cameraId,
        lastSeenAt: String((parsed as any)?.lastSeenAt ?? (row as any)?.updated_at ?? "")
      },
      latestAudio: latestAudio || null
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to read camera", message: e?.message ?? String(e) });
  }
});

app.post("/camera/live/session", async (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const { raw, tenant } = readTenant(req as any);
  const body = (req.body ?? {}) as Record<string, unknown>;

  const requestedChannel = Number(body.channel ?? 1);
  const channel = Number.isFinite(requestedChannel) && requestedChannel > 0 ? Math.min(16, Math.floor(requestedChannel)) : 1;

  const cameraRows = listCameraHealth(tenant) as Record<string, unknown>[];
  const assetStmt = raw && raw !== tenant
    ? db.prepare("SELECT data FROM assets WHERE tenant_id = ? OR tenant_id = ? ORDER BY updated_at DESC")
    : db.prepare("SELECT data FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC");
  const assetRows = (raw && raw !== tenant ? assetStmt.all(tenant, raw) : assetStmt.all(tenant))
    .map((row: any) => parseStoredJson(row?.data))
    .filter((row: any) => row && typeof row === "object") as Record<string, unknown>[];

  const requestedCameraId = liveText(body.cameraId ?? body.deviceId);
  const requestedAssetId = liveText(body.assetId);
  const includeDebug = String(body.debugLive ?? body.debug ?? req.query.debug ?? "").trim().toLowerCase() === "1"
    || String(body.debugLive ?? body.debug ?? req.query.debug ?? "").trim().toLowerCase() === "true";

  const asset = liveFindRecordByNeedle(assetRows, requestedAssetId, ["id", "assetId", "registration", "imei"]) ?? null;
  const cameraFromAsset = asset
    ? liveFindRecordByNeedle(
      cameraRows,
      liveText((asset as any)?.cameraId ?? (asset as any)?.cameraSerial),
      ["cameraId", "id", "cameraSerial", "serial", "deviceId"]
    )
    : null;
  const camera =
    liveFindRecordByNeedle(cameraRows, requestedCameraId, ["cameraId", "id", "cameraSerial", "serial", "deviceId"])
    || cameraFromAsset
    || null;

  const channels = liveBuildChannels(camera, asset);
  const origin = `${req.protocol}://${req.get("host")}`;
  const normalizedChannels = channels.map((row: any) => ({
    ...row,
    ...(row?.streamUrl ? { streamUrl: liveResolveSessionUrl(row.streamUrl, origin) } : {})
  }));
  let selected = normalizedChannels.find((row) => row.index === channel) || normalizedChannels[0] || null;
  let streamUrl = liveText((selected as any)?.streamUrl);
  const selectedChannelKey = liveText((selected as any)?.key) || liveNormalizeChannelKey((selected as any)?.label) || `channel-${channel}`;
  const selectedChannelLabel = liveText((selected as any)?.label) || liveChannelLabelByIndex(channel);
  const selectedCameraId = liveText((camera as any)?.cameraId ?? (camera as any)?.id ?? (asset as any)?.cameraId ?? (asset as any)?.cameraSerial);
  const selectedAssetId = liveText((asset as any)?.id ?? (asset as any)?.assetId);
  const fallbackDiagnostics: {
    attemptedEndpoints: string[];
    matchedEndpoint?: string;
    endpointStatuses?: Array<{ endpoint: string; status: number }>;
  } = { attemptedEndpoints: [] };
  const providerDiagnostics: {
    attemptedEndpoints: string[];
    matchedEndpoint?: string;
    endpointStatuses?: Array<{ endpoint: string; status: number }>;
  } = { attemptedEndpoints: [] };

  if (!streamUrl && (selectedCameraId || selectedAssetId)) {
    const providerUrl = await resolveLiveStreamFromProvider(
      selectedAssetId,
      selectedCameraId,
      channel,
      selectedChannelKey,
      selectedChannelLabel,
      providerDiagnostics
    );
    if (providerUrl) {
      streamUrl = providerUrl;
      selected = {
        ...(selected as any),
        streamUrl: providerUrl
      };
    }
  }

  if (!streamUrl && selectedCameraId) {
    const fallbackUrl = await resolveLiveStreamFromDeviceServer(
      selectedCameraId,
      channel,
      selectedChannelKey,
      selectedChannelLabel,
      fallbackDiagnostics
    );
    if (fallbackUrl) {
      streamUrl = fallbackUrl;
      selected = {
        ...(selected as any),
        streamUrl: fallbackUrl
      };
    }
  }

  return res.json({
    ok: true,
    available: Boolean(streamUrl),
    source: camera ? "camera" : asset ? "asset" : "none",
    cameraId: liveText((camera as any)?.cameraId ?? (camera as any)?.id) || null,
    assetId: liveText((asset as any)?.id ?? (asset as any)?.assetId) || null,
    channel: selected,
    channels: normalizedChannels,
    streamUrl: streamUrl || null,
    token: streamUrl ? cryptoRandom() : null,
    message: streamUrl
      ? "Live stream session prepared."
      : "No stream URL configured for the selected channel.",
    ...(includeDebug
      ? {
          diagnostics: {
            tenant,
            requested: {
              assetId: requestedAssetId || null,
              cameraId: requestedCameraId || null,
              channel,
              channelKey: selectedChannelKey,
              channelLabel: selectedChannelLabel
            },
            resolved: {
              source: camera ? "camera" : asset ? "asset" : "none",
              assetFound: Boolean(asset),
              cameraFound: Boolean(camera),
              selectedCameraId: selectedCameraId || null,
              channelsDiscovered: normalizedChannels.length,
              selectedHasStreamUrl: Boolean(streamUrl)
            },
            deviceServerFallback: fallbackDiagnostics
            ,
            providerFallback: providerDiagnostics
          }
        }
      : {})
  });
});

app.post("/ingest/intercom-audio", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
  const body = req.body ?? {};
  const cameraId = resolveCameraId(req, body);
  if (!cameraId) return res.status(400).json({ error: "cameraId/deviceId is required" });

  const pcmBase64 = String((body as any).pcm16leBase64 ?? "").trim();
  if (!pcmBase64) return res.status(400).json({ error: "pcm16leBase64 is required" });

  let pcm: Buffer;
  try {
    pcm = Buffer.from(pcmBase64, "base64");
  } catch {
    return res.status(400).json({ error: "pcm16leBase64 is invalid" });
  }
  if (!pcm.length) return res.status(400).json({ error: "Audio chunk is empty" });
  if (pcm.length > MAX_CAMERA_PCM_CHUNK_BYTES) {
    return res.status(413).json({ error: "Audio chunk too large", maxBytes: MAX_CAMERA_PCM_CHUNK_BYTES });
  }

  const sampleRate = Math.max(8_000, Math.min(48_000, Number((body as any).sampleRate ?? 16_000) || 16_000));
  const channels = Math.max(1, Math.min(2, Number((body as any).channels ?? 1) || 1));
  const recordedAt = toIsoTimestamp((body as any).recordedAt ?? (body as any).recordedAtMs ?? Date.now());
  const receivedAt = new Date().toISOString();

  try {
    const recordingPath = ensureRecordingPath(tenant, cameraId, recordedAt);
    fs.appendFileSync(recordingPath.filePath, pcm);

    const chunkId = cryptoRandom();
    db.prepare(
      "INSERT INTO camera_audio_chunks (id, tenant_id, camera_id, recorded_at, sample_rate, channels, bytes, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(chunkId, tenant, cameraId, recordedAt, sampleRate, channels, pcm.length, recordingPath.filePath, receivedAt);

    let existingHealth: any = {};
    try {
      const row = db.prepare("SELECT data FROM camera_health WHERE tenant_id = ? AND camera_id = ?").get(tenant, cameraId);
      existingHealth = row?.data ? JSON.parse(String(row.data)) : {};
    } catch {
      existingHealth = {};
    }
    const audioChunks = Number(existingHealth?.audioChunks ?? 0) + 1;
    const audioBytes = Number(existingHealth?.audioBytes ?? 0) + pcm.length;
    upsertCameraHealth(tenant, cameraId, {
      ...existingHealth,
      cameraId,
      id: cameraId,
      tenantId: tenant,
      transport: "intercom",
      sampleRate,
      channels,
      audioChunks,
      audioBytes,
      lastAudioAt: recordedAt,
      receivedAt
    }, receivedAt);

    res.status(202).json({
      accepted: true,
      id: chunkId,
      tenantId: tenant,
      cameraId,
      bytes: pcm.length,
      sampleRate,
      channels,
      recordedAt,
      receivedAt
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to ingest intercom audio", message: e?.message ?? String(e) });
  }
});

app.post("/intercom/talkback/enqueue", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
  const body = req.body ?? {};
  const cameraId = resolveCameraId(req, body);
  if (!cameraId) return res.status(400).json({ error: "cameraId/deviceId is required" });

  const pcmBase64 = String((body as any).pcm16leBase64 ?? "").trim();
  if (!pcmBase64) return res.status(400).json({ error: "pcm16leBase64 is required" });
  const sampleRate = Math.max(8_000, Math.min(48_000, Number((body as any).sampleRate ?? 16_000) || 16_000));
  const channels = Math.max(1, Math.min(2, Number((body as any).channels ?? 1) || 1));

  const createdAt = new Date().toISOString();
  const id = cryptoRandom();
  try {
    db.prepare(
      "INSERT INTO talkback_queue (id, tenant_id, camera_id, sample_rate, channels, payload_base64, status, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, '')"
    ).run(id, tenant, cameraId, sampleRate, channels, pcmBase64, createdAt);
    res.status(201).json({ queued: true, id, tenantId: tenant, cameraId, sampleRate, channels, createdAt });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to enqueue talkback", message: e?.message ?? String(e) });
  }
});

app.get("/intercom/talkback/next", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
  const cameraId = resolveCameraId(req);
  if (!cameraId) return res.status(400).json({ error: "cameraId/deviceId is required" });
  try {
    const row = db
      .prepare(
        "SELECT id, sample_rate, channels, payload_base64, created_at FROM talkback_queue WHERE tenant_id = ? AND camera_id = ? AND status = 'queued' ORDER BY created_at ASC LIMIT 1"
      )
      .get(tenant, cameraId);
    if (!row) return res.status(204).send();
    db.prepare("UPDATE talkback_queue SET status = 'delivering' WHERE id = ? AND status = 'queued'").run(String((row as any).id ?? ""));
    res.json({
      id: String((row as any).id ?? ""),
      cameraId,
      tenantId: tenant,
      sampleRate: Number((row as any).sample_rate ?? 16_000),
      channels: Number((row as any).channels ?? 1),
      pcm16leBase64: String((row as any).payload_base64 ?? ""),
      queuedAt: String((row as any).created_at ?? "")
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch talkback frame", message: e?.message ?? String(e) });
  }
});

app.post("/intercom/talkback/:id/ack", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "id is required" });
  const deliveredAt = new Date().toISOString();
  try {
    const result = db
      .prepare("UPDATE talkback_queue SET status = 'delivered', delivered_at = ? WHERE id = ? AND tenant_id = ?")
      .run(deliveredAt, id, tenant);
    res.json({ delivered: Number(result?.changes ?? 0) > 0, id, deliveredAt, tenantId: tenant });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to ack talkback frame", message: e?.message ?? String(e) });
  }
});

// Kick the AVL socket / request immediate position via Traccar Commands API.
app.post("/device/kick-avl", async (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  if (!TRACCAR_BASE_URL) return res.status(503).json({ error: "Traccar not configured", hint: "Set TRACCAR_BASE_URL (+ auth)" });
  if (!TRACCAR_TOKEN && !(TRACCAR_USERNAME && TRACCAR_PASSWORD)) {
    return res.status(503).json({ error: "Traccar auth not configured", hint: "Set TRACCAR_TOKEN or TRACCAR_USERNAME/TRACCAR_PASSWORD" });
  }

  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const imei = String(req.body?.imei ?? req.body?.uniqueId ?? "").trim();
  const commandText = String(req.body?.command ?? TRACCAR_KICK_COMMAND).trim() || TRACCAR_KICK_COMMAND;
  if (!imei) return res.status(400).json({ error: "imei is required" });

  // 1) Find Traccar device by uniqueId == IMEI
  const devicesResp = await traccarFetch(`/api/devices?all=true`);
  if (!devicesResp.ok) return res.status(devicesResp.status).json({ error: "Failed to list Traccar devices", body: devicesResp.body });
  const devices = Array.isArray(devicesResp.body) ? devicesResp.body : [];
  const device = devices.find((d: any) => String(d?.uniqueId ?? "").trim() === imei) ?? null;
  if (!device) return res.status(404).json({ error: "Traccar device not found for IMEI", imei, tenantId: tenant });

  const deviceId = Number((device as any).id);
  if (!Number.isFinite(deviceId)) return res.status(500).json({ error: "Invalid Traccar device id", imei, device });

  // 2) Send command
  const payload = {
    deviceId,
    type: "custom",
    attributes: { data: commandText }
  };
  const sendResp = await traccarFetch(`/api/commands/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!sendResp.ok) {
    return res.status(sendResp.status).json({
      queued: false,
      error: "Traccar command send failed",
      imei,
      deviceId,
      command: commandText,
      body: sendResp.body
    });
  }
  res.json({ queued: true, tenantId: tenant, imei, deviceId, command: commandText, traccar: sendResp.body });
});

// Support agents presence (Command Center)

type SupportAgentCategory =
  | "Sales"
  | "Technical Support Telematics"
  | "Support Vide Telematics"
  | "Admins"
  | "Support Deliver"
  | "Support Maintenace";

const supportAgentCategories: SupportAgentCategory[] = [
  "Sales",
  "Technical Support Telematics",
  "Support Vide Telematics",
  "Admins",
  "Support Deliver",
  "Support Maintenace"
];

function normalizeSupportAgentCategory(input: any): SupportAgentCategory {
  const raw = String(input ?? "").trim();
  if (!raw) return "Technical Support Telematics";
  const lower = raw.toLowerCase();
  if (lower === "support video telematics") return "Support Vide Telematics";
  if (lower === "support vide telematics") return "Support Vide Telematics";
  if (lower === "support maintenance") return "Support Maintenace";
  if (lower === "support maintenace") return "Support Maintenace";
  const exact = supportAgentCategories.find((c) => c.toLowerCase() === lower);
  return exact ?? "Technical Support Telematics";
}

function toSupportAgentId(name: string) {
  return (
    "AG-" +
    String(name || "agent")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .slice(0, 48) +
    "-" +
    Date.now().toString(36)
  );
}

function readSupportAgents(tenant: string): any[] {
  const stmt = db.prepare("SELECT data FROM support_agents WHERE tenant_id = ? ORDER BY updated_at DESC");
  const rows = stmt.all(tenant);
  const agents: any[] = [];
  for (const r of rows) {
    try {
      agents.push(JSON.parse(String((r as any).data ?? "{}")));
    } catch {
      // ignore
    }
  }
  return agents;
}

function upsertSupportAgent(tenant: string, id: string, data: any) {
  const now = new Date().toISOString();
  const stmt = db.prepare("INSERT OR REPLACE INTO support_agents (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)");
  stmt.run(id, tenant, JSON.stringify(data ?? {}), now);
}

function seedSupportAgentsIfConfigured(tenant: string) {
  if (readSupportAgents(tenant).length) return;
  const raw = String(process.env.SUPPORT_AGENT_SEED_JSON ?? "").trim();
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.agents) ? parsed.agents : [];
    for (const a of list) {
      const name = String(a?.name ?? "").trim();
      if (!name) continue;
      const id = String(a?.id ?? "").trim() || toSupportAgentId(name);
      const category = normalizeSupportAgentCategory(a?.category);
      upsertSupportAgent(tenant, id, { id, name, category, forcedStatus: "", lastSeenAt: "" });
    }
  } catch {
    // ignore
  }
}

app.get("/support/agents", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  seedSupportAgentsIfConfigured(tenant);
  const presenceWindowSec = Math.max(15, Math.min(600, Number(req.query.windowSec ?? 90) || 90));
  const now = Date.now();

  const agents = readSupportAgents(tenant);
  const categories: Record<string, any[]> = {};
  for (const c of supportAgentCategories) categories[c] = [];

  for (const agent of agents) {
    const id = String(agent?.id ?? "").trim();
    const name = String(agent?.name ?? "").trim();
    if (!id || !name) continue;
    const category = normalizeSupportAgentCategory(agent?.category);
    const lastSeenAt = String(agent?.lastSeenAt ?? "");
    const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
    const staleSec = Number.isFinite(lastSeenMs) ? (now - lastSeenMs) / 1000 : Number.POSITIVE_INFINITY;
    const forced = String(agent?.forcedStatus ?? "").toLowerCase();
    const online = forced === "online" ? true : forced === "offline" ? false : staleSec <= presenceWindowSec;
    categories[category].push({ id, name, category, online, lastSeenAt });
  }

  for (const c of supportAgentCategories) {
    categories[c].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  }

  res.json({ categories, at: new Date().toISOString(), windowSec: presenceWindowSec });
});

app.post("/support/agents", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const name = String((body as any).name ?? "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  const id = String((body as any).id ?? "").trim() || toSupportAgentId(name);
  const category = normalizeSupportAgentCategory((body as any).category);
  const existing = readSupportAgents(tenant).find((a: any) => String(a.id) === id);
  const rec = {
    ...(existing ?? {}),
    id,
    name,
    category,
    forcedStatus: String((body as any).forcedStatus ?? existing?.forcedStatus ?? "") || "",
    lastSeenAt: String(existing?.lastSeenAt ?? "")
  };
  upsertSupportAgent(tenant, id, rec);
  res.status(existing ? 200 : 201).json({ stored: true, agent: rec });
});

app.post("/support/agents/:id/heartbeat", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "id is required" });
  const agents = readSupportAgents(tenant);
  const existing = agents.find((a: any) => String(a.id) === id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const now = new Date().toISOString();
  const rec = { ...existing, lastSeenAt: now };
  upsertSupportAgent(tenant, id, rec);
  res.json({ ok: true, id, lastSeenAt: now });
});

app.post("/support/agents/:id/status", (req, res) => {
  if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "id is required" });
  const body = req.body ?? {};
  const status = String((body as any).forcedStatus ?? "").trim().toLowerCase();
  if (!(status === "" || status === "online" || status === "offline")) return res.status(400).json({ error: "Invalid forcedStatus" });
  const agents = readSupportAgents(tenant);
  const existing = agents.find((a: any) => String(a.id) === id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const rec = { ...existing, forcedStatus: status };
  upsertSupportAgent(tenant, id, rec);
  res.json({ ok: true, agent: rec });
});

// Support chat (simple store in sqlite)
app.post("/support/chat", (req, res) => {
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const message = String(body.message ?? "").trim();
  if (!message) return res.status(400).json({ error: "Message is required." });
  const userName = String((body as any).userName ?? "").trim();
  const userEmail = String((body as any).userEmail ?? "").trim();
  const agentId = String((body as any).agentId ?? "").trim();
  const agentName = String((body as any).agentName ?? "").trim();
  const agentCategory = String((body as any).agentCategory ?? "").trim();
  const conversationId = String(body.conversationId ?? cryptoRandom());
  const existing = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
  let conv: any;

  const nextUserJson = () => {
    const u: any = {};
    if (userName) u.name = userName;
    if (userEmail) u.email = userEmail;
    if (agentId || agentName || agentCategory) {
      u.assignedAgent = { id: agentId || undefined, name: agentName || undefined, category: agentCategory || undefined };
    }
    return u;
  };

  const mergeUserJson = (prevRaw: any) => {
    let prev: any = {};
    try {
      prev = prevRaw ? JSON.parse(String(prevRaw)) : {};
    } catch {
      prev = {};
    }
    const next = nextUserJson();
    const merged = { ...prev, ...next };
    if (next.assignedAgent) merged.assignedAgent = { ...(prev.assignedAgent ?? {}), ...(next.assignedAgent ?? {}) };
    return merged;
  };

  if (existing) {
    conv = existing;
    const messages = JSON.parse(conv.messages_json || "[]");
    messages.push({ id: cryptoRandom(), role: "user", text: message, at: new Date().toISOString() });
    db.prepare("UPDATE conversations SET messages_json = ? WHERE id = ?").run(JSON.stringify(messages), conversationId);
    const mergedUser = mergeUserJson(conv.user_json);
    db.prepare("UPDATE conversations SET user_json = ? WHERE id = ?").run(JSON.stringify(mergedUser), conversationId);
    conv = { ...conv, messages_json: JSON.stringify(messages), user_json: JSON.stringify(mergedUser) };
  } else {
    const messages = [{ id: cryptoRandom(), role: "user", text: message, at: new Date().toISOString() }];
    const userJson = mergeUserJson(null);
    db.prepare("INSERT INTO conversations (id, tenant_id, status, createdAt, user_json, messages_json) VALUES (?, ?, ?, ?, ?, ?)").run(
      conversationId,
      tenant,
      "open",
      new Date().toISOString(),
      JSON.stringify(userJson),
      JSON.stringify(messages)
    );
    conv = { id: conversationId, tenant_id: tenant, status: "open", user_json: JSON.stringify(userJson), messages_json: JSON.stringify(messages), createdAt: new Date().toISOString() };
  }
  let parsedUser: any = {};
  try {
    parsedUser = conv.user_json ? JSON.parse(String(conv.user_json)) : {};
  } catch {
    parsedUser = {};
  }
  res.json({
    conversation: {
      id: conv.id,
      status: conv.status || "open",
      createdAt: conv.createdAt || new Date().toISOString(),
      closedAt: conv.closedAt || undefined,
      user: { name: parsedUser?.name, email: parsedUser?.email },
      assignedAgent: parsedUser?.assignedAgent,
      messages: JSON.parse(conv.messages_json)
    }
  });
});

app.get("/support/chat", (req, res) => {
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const id = String(req.query.id ?? "");
  if (!id) return res.status(400).json({ error: "Conversation id is required." });
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
  if (!conv) return res.json({ conversation: null, tenantId: tenant });
  let parsedUser: any = {};
  try {
    parsedUser = conv.user_json ? JSON.parse(String(conv.user_json)) : {};
  } catch {
    parsedUser = {};
  }
  res.json({
    conversation: {
      id: conv.id,
      status: conv.status,
      createdAt: conv.createdAt,
      closedAt: conv.closedAt || undefined,
      user: { name: parsedUser?.name, email: parsedUser?.email },
      assignedAgent: parsedUser?.assignedAgent,
      messages: JSON.parse(conv.messages_json)
    },
    tenantId: tenant
  });
});

app.post("/support/chat/end", (req, res) => {
  const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
  const body = req.body ?? {};
  const conversationId = String(body.conversationId ?? "");
  if (!conversationId) return res.status(400).json({ error: "Conversation id is required." });
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
  if (!conv) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE conversations SET status = ?, closedAt = ? WHERE id = ?").run("closed", new Date().toISOString(), conversationId);
  res.json({ ended: true, conversationId, emailQueued: true });
});

function startServer() {
  startTeltonikaTcpIngest();
  startConcoxTcpIngest();
  startQueclinkTcpIngest();
  console.log(
    `Storage mode: ${Database ? "sqlite" : "memory"}` +
    `${Database ? ` (DB_PATH=${DB_PATH})` : ""}; ` +
    `Worker forward: ${WORKER_TELEMETRY_FORWARD_ENABLED ? "enabled" : "disabled"} ` +
    `${WORKER_TELEMETRY_FORWARD_URL ? `(url=${WORKER_TELEMETRY_FORWARD_URL})` : ""}`
  );
  // If TLS cert/key provided, start HTTPS server
  const certPath = process.env.TLS_CERT_PATH ?? "";
  const keyPath = process.env.TLS_KEY_PATH ?? "";
  const certPem = process.env.TLS_CERT ?? null; // base64 or raw
  const keyPem = process.env.TLS_KEY ?? null;

  if ((certPath && keyPath) || (certPem && keyPem)) {
    let cert: string | Buffer;
    let key: string | Buffer;
    if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      cert = fs.readFileSync(certPath);
      key = fs.readFileSync(keyPath);
    } else if (certPem && keyPem) {
      cert = Buffer.from(certPem as string, "base64").toString();
      key = Buffer.from(keyPem as string, "base64").toString();
    } else {
      console.warn("TLS configured but cert/key not found; falling back to HTTP");
      app.listen(PORT, () => console.log(`Vivi telematics VPS API listening on http://0.0.0.0:${PORT}`));
      return;
    }

    const httpsServer = https.createServer({ cert, key }, app);
    httpsServer.listen(PORT, () => {
      console.log(`Vivi telematics VPS API listening on https://0.0.0.0:${PORT}`);
    });
    return;
  }

  app.listen(PORT, () => {
    console.log(`Vivi telematics VPS API listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
