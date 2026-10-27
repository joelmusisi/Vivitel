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
// Optional Valkey/Redis caching layer — graceful no-op if package not available
let Valkey: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Valkey = require("iovalkey");
  // iovalkey exports as { default } in ESM interop builds
  if (Valkey && Valkey.default) Valkey = Valkey.default;
} catch {
  Valkey = null;
}
import path from "path";
import fs from "fs";
import https from "https";
import crypto from "crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createVpsB2Storage } from "./shared/vpsB2Storage";
import zlib from "zlib";
import { registerAlertRoutes } from "./domains/alerts/presentation/registerAlertRoutes";
import { createAssetServices } from "./domains/assets/application/createAssetServices";
import { registerAssetRoutes } from "./domains/assets/presentation/registerAssetRoutes";
import { registerDeviceCommandRoutes } from "./domains/device/presentation/registerDeviceCommandRoutes";
import { registerCameraLiveSessionRoute } from "./domains/device/presentation/registerCameraLiveSessionRoute";
import { registerCmsv6Routes, resolveLiveStreamFromCmsv6 } from "./domains/device/presentation/registerCmsv6Routes";
import { registerIntercomAudioIngestRoute } from "./domains/device/presentation/registerIntercomAudioIngestRoute";
import { registerDeviceOpsRoutes } from "./domains/device/presentation/registerDeviceOpsRoutes";
import { registerSupportChatRoutes } from "./domains/device/presentation/registerSupportChatRoutes";
import { registerSupportAgentRoutes } from "./domains/device/presentation/registerSupportAgentRoutes";
import { createDeliverServices } from "./domains/deliver/application/createDeliverServices";
import { createRbacServices } from "./domains/rbac/application/createRbacServices";
import { createTelemetryServices } from "./domains/telemetry/application/createTelemetryServices";
import { createReportArchiveService } from "./shared/reportArchiveService";
import { registerReportArchiveRoutes } from "./presentation/reports/registerReportArchiveRoutes";
import { createTelemetryTcpIngestors } from "./domains/telemetry/infrastructure/createTelemetryTcpIngestors";
import { registerTelemetryIngestRoutes } from "./domains/telemetry/presentation/registerTelemetryIngestRoutes";
import { registerTelemetryQueryRoutes } from "./domains/telemetry/presentation/registerTelemetryQueryRoutes";
import { registerTelemetryStreamRoute } from "./domains/telemetry/presentation/registerTelemetryStreamRoute";
import { registerCameraHealthRoutes } from "./domains/telemetry/presentation/registerCameraHealthRoutes";
import { startVpsServer } from "./application/startup/startVpsServer";
import { createBackendDb } from "./infrastructure/persistence/createBackendDb";
import { createPostgresTelemetryMirror } from "./infrastructure/persistence/createPostgresTelemetryMirror";
import { createWorkerForwardQueue } from "./infrastructure/worker/createWorkerForwardQueue";
import { createTraccarFetch } from "./infrastructure/traccar/createTraccarFetch";
import { createTraccarOutbox } from "./infrastructure/traccar/createTraccarOutbox";
import { createTraccarPositionResolver, pickTraccarPositionAt } from "./infrastructure/traccar/resolveLatestTraccarPosition";
import { registerTraccarConfigRoutes } from "./infrastructure/traccar/presentation/registerTraccarConfigRoutes";
import { registerHealthRoutes } from "./presentation/health/registerHealthRoutes";
import { registerJt808HealthRoutes } from "./presentation/health/registerJt808HealthRoutes";
import { createVpsMetrics, registerMetricsRoutes } from "./presentation/metrics/registerMetricsRoutes";
import { createRateLimitMiddleware } from "./shared/http/createRateLimitMiddleware";
import { buildAssetTelemetryArchiveKey } from "./shared/assetStoragePaths";
import { registerAuthRoutes } from "./presentation/auth/registerAuthRoutes";
import { registerMarketingContactRoutes } from "./presentation/marketing/registerMarketingContactRoutes";
import { getAuthSessionInvalidationStats, registerAuthIdentityRoutes } from "./presentation/auth/registerAuthIdentityRoutes";
import { registerRootRoute } from "./presentation/root/registerRootRoute";
import { registerDeliverCatalogRoutes } from "./presentation/deliver/registerDeliverCatalogRoutes";
import { registerDeliverHealthRoutes } from "./presentation/deliver/registerDeliverHealthRoutes";
import { registerDeliverDronesRoutes } from "./presentation/deliver/registerDeliverDronesRoutes";
import { registerDeliverOrdersRoutes } from "./presentation/deliver/registerDeliverOrdersRoutes";
import { registerRbacRoutes } from "./presentation/rbac/registerRbacRoutes";
import { registerPatBindingsKvRoutes } from "./presentation/storage/registerPatBindingsKvRoutes";
import { registerOperationalHierarchyRoutes } from "./presentation/storage/registerOperationalHierarchyRoutes";
import { registerOperationalRealtimeRoutes } from "./presentation/storage/registerOperationalRealtimeRoutes";
import { registerOperationalWorkerStorageRoutes } from "./presentation/storage/registerOperationalWorkerStorageRoutes";
import { recoverLegacyAlertState } from "./shared/legacyAlertStateRecovery";
import { attachVpsRealtimeHub } from "./realtime/VpsRealtimeHub";
import { registerDeviceArtifactAdminRoute } from "./presentation/admin/registerDeviceArtifactAdminRoute";
import { registerDeviceConfigurationRoutes } from "./presentation/config/registerDeviceConfigurationRoutes";
import { cryptoRandom } from "./shared/cryptoRandom";
import { createServiceRoleGate } from "./shared/serviceRole";
import { coerceBool, coerceNumber } from "./shared/coercion";
import { pick } from "./shared/objectPath";
import { parseStoredJson } from "./shared/json";
import { resolveByNameOrId } from "./shared/collection";
import { sha256Hex } from "./shared/hash";
import { isReadableStream } from "./shared/stream";
import { listConfigGroups, listBindings, getDeviceReportingSettings, getBaseArtifact } from "./shared/config";
import { buildDeviceSettingsPayload, isRecordObject, mergeDeviceSettingsPayload } from "./shared/device-settings";
import { buildLatestTelemetrySummary } from "./shared/telemetry-summary";
import { timingSafeEq, verifyAdminPassword, readAuthToken, normalizeTenantId, readTenant } from "./shared/auth";
import { sanitizeCameraId, resolveCameraId, toIsoTimestamp } from "./shared/camera";
import { readLatestTelemetryAt, readTelemetryCount, loadBindingsFromDb, persistBindingToDb, deleteBindingFromDb, purgeBindingsForTenant } from "./shared/bindings";
import { ensureRecordingPath, upsertCameraHealth, listCameraHealth } from "./shared/camera-health";
import { nextAvailableNumericId, listAssetIdsForTenant, normalizeAssetIdsForTenant, configureAssetMirror } from "./shared/assets";
import { liveText, liveHasValue, liveNormalizeChannelKey, liveChannelLabelByIndex } from "./shared/live";
import { liveNormalizeUrlCandidate, liveReadChannelUrl, liveResolveSessionUrl, liveReadUrlFromUnknown } from "./shared/live-url";
import { resolveLiveStreamFromDeviceServer, resolveLiveStreamFromProvider, liveBuildChannels, liveFindRecordByNeedle, probeStreamQuality, liveResolveBoundCameraIdForAsset } from "./shared/live-stream";
import { requireApiKey, isLoopbackRequest, getAdminSessionHotCacheStats } from "./shared/api-key";
import { sendRbacInviteEmail } from "./shared/mail";
import { createGzipJsonMiddleware, gzipBuffer } from "./shared/performance/gzip";
import { buildIoNamedSnapshotFromTelemetry, extractMonitoredValue, normalizeTelemetryKey } from "./shared/teltonika-io";

const API_KEY = process.env.API_KEY ?? "";
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD ?? "");
// Optional stronger storage: scrypt:<saltHex>:<hashHex>
const ADMIN_PASSWORD_HASH = String(process.env.ADMIN_PASSWORD_HASH ?? "").trim();
const ADMIN_TOKEN_TTL_HOURS = Math.min(Math.max(Number(process.env.ADMIN_TOKEN_TTL_HOURS ?? 24 * 7), 1), 24 * 30);
const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "vivi.db");
const PG_MIRROR_DATABASE_URL = String(process.env.PG_MIRROR_DATABASE_URL ?? process.env.DATABASE_URL ?? "").trim();
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
const TELEMETRY_ARCHIVE_PREFIX = String(process.env.TELEMETRY_ARCHIVE_PREFIX ?? "telemetry-archive").trim() || "telemetry-archive";
const TELEMETRY_ARCHIVE_LOCAL_DIR = process.env.TELEMETRY_ARCHIVE_LOCAL_DIR ?? path.join(process.cwd(), "telemetry-archive");
const REPORTS_ARCHIVE_LOCAL_DIR = process.env.REPORTS_ARCHIVE_LOCAL_DIR ?? path.join(process.cwd(), "reports-archive");
const REPORT_ARCHIVE_HOT_DAYS = Math.max(1, Number(process.env.REPORT_ARCHIVE_HOT_DAYS ?? 90) || 90);
const CAMERA_RECORDINGS_DIR = process.env.CAMERA_RECORDINGS_DIR ?? path.join(process.cwd(), "camera-recordings");
const MAX_CAMERA_PCM_CHUNK_BYTES = Math.max(16_384, Number(process.env.MAX_CAMERA_PCM_CHUNK_BYTES ?? 1_048_576));
const APP_BASE_URL = String(process.env.APP_BASE_URL ?? "").trim().replace(/\/$/, "");
const MAIL_FROM = String(process.env.MAIL_FROM ?? "").trim();
const MAIL_FROM_NAME = String(process.env.MAIL_FROM_NAME ?? process.env.APP_NAME ?? "Vivi Telematics").trim();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY ?? "").trim();

/** Multi-bucket B2: Track → VIVI-TRACK, Reports → Vivi-Reports, else legacy B2_BUCKET. */
const vpsB2 = createVpsB2Storage({
  region: B2_REGION,
  endpoint: B2_ENDPOINT || undefined
});
/** True when any purpose bucket is configured (Track / Reports / legacy default). */
const B2_ENABLED = vpsB2.enabled;
const b2Client = vpsB2.defaultClient;
const b2Bucket = vpsB2.defaultBucket || B2_BUCKET;

// Device server (for proxying requests to devices on mobile networks)
const DEVICE_SERVER_DOMAIN = process.env.DEVICE_SERVER_DOMAIN ?? process.env.VITE_DEVICE_SERVER_DOMAIN ?? "";
const DEVICE_SERVER_PORT = process.env.DEVICE_SERVER_PORT ?? process.env.VITE_DEVICE_SERVER_PORT ?? "";
const DEVICE_SERVER_PROTOCOL = (process.env.DEVICE_SERVER_PROTOCOL ?? "http").replace(/:\/\//, "");
const DEVICE_SERVER_API_KEY = process.env.DEVICE_SERVER_API_KEY ?? "";
// Optional master live-stream provider (single source for all devices)
const LIVE_STREAM_PROVIDER_URL = String(process.env.LIVE_STREAM_PROVIDER_URL ?? "").trim().replace(/\/$/, "");
const LIVE_STREAM_PROVIDER_API_KEY = String(process.env.LIVE_STREAM_PROVIDER_API_KEY ?? "").trim();
// Valkey/Redis — set VALKEY_URL to enable caching (e.g. redis://127.0.0.1:6379 or valkey://localhost:6379)
const VALKEY_URL = String(process.env.VALKEY_URL ?? "").trim();
// Default cache TTL in seconds; tune per deployment with VALKEY_TTL env var
const VALKEY_TTL = Math.max(5, Number(process.env.VALKEY_TTL ?? 30));
const LIVE_STREAM_PROVIDER_TENANT = String(process.env.LIVE_STREAM_PROVIDER_TENANT ?? "").trim();

// Traccar (for sending commands to devices)
let TRACCAR_BASE_URL = String(process.env.TRACCAR_BASE_URL ?? "").trim().replace(/\/$/, "");
let TRACCAR_USERNAME = String(process.env.TRACCAR_USERNAME ?? "").trim();
let TRACCAR_PASSWORD = String(process.env.TRACCAR_PASSWORD ?? "").trim();
let TRACCAR_TOKEN = String(process.env.TRACCAR_TOKEN ?? "").trim();
let TRACCAR_KICK_COMMAND = String(process.env.TRACCAR_KICK_COMMAND ?? "getgps").trim() || "getgps";

// Teltonika direct TCP ingest (Codec8 / Codec8 Extended).
// JT/T808 frames are auto-detected on the same listener; use JT808_PORT when you want
// to expose an explicit JT/T808-facing port without reusing the Teltonika variable name.
const TELTONIKA_PORT = Math.max(0, Number(process.env.TELTONIKA_PORT ?? 0));
const JT808_PORT = Math.max(0, Number(process.env.JT808_PORT ?? 0));
const TELTONIKA_DUPLICATE_PORTS = String(
  process.env.TELTONIKA_DUPLICATE_PORTS
    ?? process.env.TELTONIKA_DUPLICATE_PORT
    ?? ""
)
  .split(",")
  .map((s) => Number(String(s ?? "").trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
  .map((n) => Math.floor(n));
const TELEMETRY_TCP_PRIMARY_PORT = TELTONIKA_PORT > 0 ? TELTONIKA_PORT : JT808_PORT;
const TELEMETRY_TCP_DUPLICATE_PORTS = [
  ...TELTONIKA_DUPLICATE_PORTS,
  ...(TELTONIKA_PORT > 0 && JT808_PORT > 0 ? [JT808_PORT] : []),
];
const TELTONIKA_DEFAULT_TENANT = String(process.env.TELTONIKA_TENANT_ID ?? process.env.TELTONIKA_DEFAULT_TENANT ?? "").trim();
const CONCOX_PORT = Math.max(0, Number(process.env.CONCOX_PORT ?? 0));
const CONCOX_DEFAULT_TENANT = String(process.env.CONCOX_TENANT_ID ?? process.env.CONCOX_DEFAULT_TENANT ?? "").trim();
const QUECLINK_PORT = Math.max(0, Number(process.env.QUECLINK_PORT ?? 0));
const QUECLINK_DEFAULT_TENANT = String(process.env.QUECLINK_TENANT_ID ?? process.env.QUECLINK_DEFAULT_TENANT ?? "").trim();
const FREEMATICS_DEFAULT_TENANT = String(process.env.FREEMATICS_TENANT_ID ?? process.env.FREEMATICS_DEFAULT_TENANT ?? "").trim();
const JT808_DEFAULT_TENANT = String(process.env.JT808_TENANT_ID ?? process.env.JT808_DEFAULT_TENANT ?? "").trim();

// Do not forward GPS points to the Cloudflare Worker. That path inserted one D1 row
// per point and billed 177 million row writes in a month. Telemetry stays on this server.
const WORKER_TELEMETRY_FORWARD_URL = String(
  process.env.WORKER_TELEMETRY_FORWARD_URL ?? "https://vivi-telematics-api.bwena.workers.dev/ingest/telemetry"
).trim();
const WORKER_TELEMETRY_FORWARD_ENABLED = false;
const WORKER_API_KEY = String(process.env.WORKER_API_KEY ?? API_KEY ?? "").trim();

const VPS_RATE_LIMIT_ENABLED =
  String(process.env.VPS_RATE_LIMIT_ENABLED ?? "true").trim().toLowerCase() === "true";
const VPS_RATE_LIMIT_WINDOW_MS = Math.max(1_000, Number(process.env.VPS_RATE_LIMIT_WINDOW_MS ?? 60_000));
const VPS_RATE_LIMIT_MAX = Math.max(10, Number(process.env.VPS_RATE_LIMIT_MAX ?? 600));

const workerForwardQueue = createWorkerForwardQueue({
  enabled: WORKER_TELEMETRY_FORWARD_ENABLED,
  url: WORKER_TELEMETRY_FORWARD_URL,
  apiKey: WORKER_API_KEY,
  logger: console,
});
workerForwardQueue.start();

const workerForwardMetricBaselines = { success: 0, failed: 0, dropped: 0 };

function forwardTelemetryToWorker(body: Record<string, unknown>, tenant: string) {
  workerForwardQueue.enqueue(tenant, body);
}

function readWorkerForwardDiagnostics() {
  return workerForwardQueue.getDiagnostics();
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

const jt808Diagnostics: {
  frames: number;
  badFrames: number;
  acksSent: number;
  locations: number;
  recent: TcpEvent[];
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
} = {
  frames: 0,
  badFrames: 0,
  acksSent: 0,
  locations: 0,
  recent: [],
  lastByImei: {}
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

const pushJt808Event = (evt: TcpEvent) => {
  jt808Diagnostics.recent.unshift(evt);
  if (jt808Diagnostics.recent.length > 200) {
    jt808Diagnostics.recent.length = 200;
  }
};

const traccarFetch = createTraccarFetch({
  getBaseUrl: () => TRACCAR_BASE_URL,
  getToken: () => TRACCAR_TOKEN,
  getUsername: () => TRACCAR_USERNAME,
  getPassword: () => TRACCAR_PASSWORD,
});
const traccarResolveLatestPositionByImei = createTraccarPositionResolver(traccarFetch);

let db: any;

// in-process bindings store used when sqlite isn't available
const _inMemoryBindings: Record<string, Record<string, any[]>> = {};
(globalThis as any)._inMemoryBindings = _inMemoryBindings;
// in-process KV store used when sqlite isn't available
const _inMemoryKv: Record<string, Record<string, string>> = {};

db = createBackendDb({
  DatabaseCtor: Database,
  dbPath: DB_PATH,
  requirePersistentDb: REQUIRE_PERSISTENT_DB,
  fsModule: fs,
  pathModule: path,
});

// shared/api-key.ts reads these as ambient globals
(globalThis as any).API_KEY = API_KEY;
(globalThis as any).db = db;
(globalThis as any).Database = Database;

const traccarOutbox = createTraccarOutbox({
  db,
  generateId: cryptoRandom,
  traccarFetch,
  isTraccarConfigured: () => Boolean(TRACCAR_BASE_URL && (TRACCAR_TOKEN || (TRACCAR_USERNAME && TRACCAR_PASSWORD))),
  logger: console,
});

const drainTraccarOutbox = () => {
  void traccarOutbox.processPendingJobs().catch((error: any) => {
    console.warn("[traccar-outbox] drain failed:", error?.message ?? String(error));
  });
};

const traccarOutboxTimer = setInterval(drainTraccarOutbox, 5_000);
if (typeof (traccarOutboxTimer as any).unref === "function") {
  (traccarOutboxTimer as any).unref();
}
drainTraccarOutbox();

const postgresTelemetryMirror = createPostgresTelemetryMirror({ connectionString: PG_MIRROR_DATABASE_URL, logger: console });
configureAssetMirror(postgresTelemetryMirror);

// ---------------------------------------------------------------------------
// Valkey/Redis optional caching layer
// Both SQLite and PostgreSQL deployments benefit — Valkey is the hot read-tier
// and sits alongside (not replacing) either database.
// If VALKEY_URL is not set or the server is unavailable, all ops are no-ops.
// ---------------------------------------------------------------------------
let valkeyClient: any = null;
if (Valkey && VALKEY_URL) {
  try {
    valkeyClient = new Valkey(VALKEY_URL, {
      enableOfflineQueue: false,
      retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 200, 2000)),
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
    } as any);
    valkeyClient.on("error", (err: Error) => {
      // Suppress to avoid crashing Express; SQLite is always the source of truth
      console.warn("[valkey] connection error:", err.message);
    });
    valkeyClient.on("ready", () => {
      console.log(`[valkey] connected: ${VALKEY_URL} (TTL=${VALKEY_TTL}s)`);
    });
  } catch (e: any) {
    console.warn("[valkey] init failed, running without cache:", e?.message ?? String(e));
    valkeyClient = null;
  }
}

/** Read a cached value. Returns null on miss, error, or when Valkey is disabled. */
async function valkeyGet(key: string): Promise<string | null> {
  if (!valkeyClient) return null;
  try { return (await valkeyClient.get(key)) as string | null; } catch { return null; }
}
/** Store a cached value with TTL. Silent no-op on error or when Valkey is disabled. */
async function valkeySet(key: string, value: string, ttlSec: number = VALKEY_TTL): Promise<void> {
  if (!valkeyClient) return;
  try { await valkeyClient.setex(key, ttlSec, value); } catch { /* silent */ }
}
/** Invalidate one or more cache keys. Silent no-op on error or when Valkey is disabled. */
async function valkeyDel(...keys: string[]): Promise<void> {
  if (!valkeyClient || !keys.length) return;
  try { await (valkeyClient.del as (...args: string[]) => Promise<number>)(...keys); } catch { /* silent */ }
}

const app = express();
const serviceRole = createServiceRoleGate();
console.log(`Vivi service role: ${serviceRole.role}`);

// Load-balancer overload shedding: track in-flight HTTP work + event-loop lag.
// When overloaded, /health/ready returns 503 so Kubernetes Service endpoints drop this pod.
const MAX_IN_FLIGHT = Math.max(50, Number(process.env.VPS_MAX_IN_FLIGHT ?? 400) || 400);
let inFlightRequests = 0;
let eventLoopLagMs = 0;
const lagSampleStarted = Date.now();
setInterval(() => {
  const expected = Date.now();
  setImmediate(() => {
    eventLoopLagMs = Math.max(0, Date.now() - expected);
  });
}, 1000).unref?.();
void lagSampleStarted;

app.use((req, res, next) => {
  if (req.path === "/health/live" || req.path === "/health/ready" || req.path === "/metrics") {
    return next();
  }
  inFlightRequests += 1;
  let settled = false;
  const release = () => {
    if (settled) return;
    settled = true;
    inFlightRequests = Math.max(0, inFlightRequests - 1);
  };
  res.on("finish", release);
  res.on("close", release);
  next();
});

app.use(cors());
app.use(createGzipJsonMiddleware(1024));
app.use(bodyParser.json({ limit: "25mb" }));

// Prometheus instrumentation — middleware must be mounted before routes so it
// observes every request. The /metrics endpoint itself is registered later,
// alongside /health, where all live diagnostics are in scope.
const vpsMetrics = createVpsMetrics();
app.use(vpsMetrics.httpMiddleware);

if (VPS_RATE_LIMIT_ENABLED) {
  app.use(
    createRateLimitMiddleware({
      windowMs: VPS_RATE_LIMIT_WINDOW_MS,
      max: VPS_RATE_LIMIT_MAX,
      skip: (req) =>
        req.path === "/health"
        || req.path === "/health/live"
        || req.path === "/health/ready"
        || req.path === "/metrics"
        || req.path.startsWith("/health/")
        || req.path === "/deliver/health",
      onLimited: () => {
        vpsMetrics.counters.rateLimitExceeded.inc();
      },
    })
  );
  console.log(
    `[rate-limit] enabled window=${VPS_RATE_LIMIT_WINDOW_MS}ms max=${VPS_RATE_LIMIT_MAX}/window`
  );
}

const normalizeNumber = (value: unknown) => {
  const num = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(num) ? num : null;
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
  return telemetryServices.findTenantForImeiWithDefault(imei, preferredDefaultTenant);
}

function findTenantForImei(imei: string): string {
  return telemetryServices.findTenantForImei(imei, TELTONIKA_DEFAULT_TENANT);
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
  return telemetryServices.normalizeFreematicsTelemetryBody(body);
}

function normalizeCameraHealthTelemetryBody(body: any, cameraId: string) {
  return telemetryServices.normalizeCameraHealthTelemetryBody(body, cameraId);
}

function parseQueclinkTextMessage(rawLine: string) {
  return telemetryServices.parseQueclinkTextMessage(rawLine);
}

const assetServices = createAssetServices({ db, parseStoredJson, postgresMirror: postgresTelemetryMirror });

const telemetryServices = createTelemetryServices({
  db,
  hasSqlite: Boolean(Database),
  normalizeNumber,
  parseStoredJson,
  findExistingAssetIdByImei: assetServices.findExistingAssetIdByImei,
  extractLatLng,
  buildIoNamedSnapshotFromTelemetry,
  toNumberOrNull,
  haversineMeters,
  getMonitoredEventsForAsset,
  extractMonitoredValue,
  normalizeTelemetryKey,
  generateId: cryptoRandom,
  archivePrefix: TELEMETRY_ARCHIVE_PREFIX,
  archiveLocalDir: TELEMETRY_ARCHIVE_LOCAL_DIR,
  b2PutObject: vpsB2.enabled
    ? async (args) =>
        vpsB2.putObject({
          key: args.key,
          body: args.body,
          contentType: args.contentType,
          contentEncoding: args.contentEncoding,
          metadata: args.metadata
        })
    : undefined,
  b2GetObject: vpsB2.enabled ? (key) => vpsB2.getObject(key) : undefined,
  b2Client,
  b2Bucket,
  pathModule: path,
  fsModule: fs,
  zlibModule: zlib,
  gzipAsync: gzipBuffer,
  PutObjectCommandCtor: PutObjectCommand,
  GetObjectCommandCtor: GetObjectCommand,
  postgresMirror: postgresTelemetryMirror,
});

const reportArchiveService = createReportArchiveService({
  db,
  hotDir: REPORTS_ARCHIVE_LOCAL_DIR,
  hotDays: REPORT_ARCHIVE_HOT_DAYS,
  vpsB2,
  pathModule: path,
  fsModule: fs,
  zlibModule: zlib,
  generateId: cryptoRandom
});

const reportArchivePromoteTimer = setInterval(() => {
  void reportArchiveService.promoteExpiredReportArchives(50).then((result) => {
    if (result.failed > 0) console.error(`[reports-archive] ${result.failed} archive(s) failed promotion.`);
  }).catch((error) => {
    console.error("[reports-archive] Scheduled promotion failed:", error);
  });
}, 60 * 60 * 1000);
reportArchivePromoteTimer.unref?.();
// Kick once shortly after boot (non-blocking).
setTimeout(() => {
  void reportArchiveService.promoteExpiredReportArchives(25).then((result) => {
    if (result.failed > 0) console.error(`[reports-archive] ${result.failed} archive(s) failed promotion.`);
  }).catch((error) => {
    console.error("[reports-archive] Startup promotion failed:", error);
  });
}, 15_000).unref?.();

function buildTelemetryArchiveKey(args: {
  tenant: string;
  assetId: string;
  site?: string;
  createdAt: string;
  eventId: string;
}) {
  return buildAssetTelemetryArchiveKey({
    tenantId: args.tenant,
    site: args.site,
    assetId: args.assetId || "unknown",
    createdAt: args.createdAt,
    eventId: args.eventId || cryptoRandom(),
    extension: ".json.gz"
  });
}

async function archiveTelemetryEventAsync(args: {
  tenant: string;
  assetId: string;
  imei: string;
  eventId: string;
  createdAt: string;
  payload: Record<string, unknown>;
  site?: string;
}) {
  const { tenant, assetId, imei, eventId, createdAt, payload } = args;
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const gzipBytes = await gzipBuffer(payloadBytes);
  const dataObj = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
  const site = String(args.site ?? payload.site ?? dataObj.site ?? "").trim();
  const storageKey = buildTelemetryArchiveKey({ tenant, assetId, site, createdAt, eventId });
  let storage: "b2" | "local" = "local";
  let finalKey = storageKey;

  if (vpsB2.enabled) {
    try {
      const ok = await vpsB2.putObject({
        key: storageKey,
        body: gzipBytes,
        contentType: "application/json",
        contentEncoding: "gzip",
        metadata: {
          tenant: String(tenant || "default"),
          imei: String(imei || ""),
          eventid: String(eventId || ""),
          createdat: String(createdAt || "")
        }
      });
      if (ok) storage = "b2";
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
  return telemetryServices.readTelemetryArchivePayload(row);
}

function storeTelemetryEventForTenant(tenant: string, body: any) {
  return telemetryServices.storeTelemetryEventForTenant(tenant, body);
}

const telemetryTcpIngestors = createTelemetryTcpIngestors({
  teltonikaPort: TELEMETRY_TCP_PRIMARY_PORT,
  teltonikaDuplicatePorts: TELEMETRY_TCP_DUPLICATE_PORTS,
  teltonikaDefaultTenant: TELTONIKA_DEFAULT_TENANT,
  concoxPort: CONCOX_PORT,
  concoxDefaultTenant: CONCOX_DEFAULT_TENANT,
  queclinkPort: QUECLINK_PORT,
  queclinkDefaultTenant: QUECLINK_DEFAULT_TENANT,
  jt808DefaultTenant: JT808_DEFAULT_TENANT,
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
});

function startTeltonikaTcpIngest() {
  return telemetryTcpIngestors.startTeltonikaTcpIngest();
}

function startConcoxTcpIngest() {
  return telemetryTcpIngestors.startConcoxTcpIngest();
}

function startQueclinkTcpIngest() {
  return telemetryTcpIngestors.startQueclinkTcpIngest();
}





registerRootRoute({ app });

registerOperationalHierarchyRoutes({ app, db, requireApiKey });
registerOperationalRealtimeRoutes({ app, db, requireApiKey });
const requireConfiguredWorkerApiKey = (req: any, res: any): boolean => {
  if (!API_KEY.trim()) {
    res.status(503).json({ error: "VPS API_KEY is not configured for internal storage requests." });
    return false;
  }
  return requireApiKey(req, res);
};

registerOperationalWorkerStorageRoutes({ app, db, requireApiKey: requireConfiguredWorkerApiKey });

void recoverLegacyAlertState({
  db,
  scanValkey: valkeyClient
    ? async (pattern) => {
        const found: Array<{ key: string; value: string }> = [];
        let cursor = "0";
        do {
          const [next, keys] = (await valkeyClient.scan(cursor, "MATCH", pattern, "COUNT", 500)) as [string, string[]];
          cursor = next;
          for (const key of keys) {
            const value = await valkeyClient.get(key);
            if (typeof value === "string") found.push({ key, value });
          }
        } while (cursor !== "0" && found.length < 20000);
        return found;
      }
    : undefined
})
  .then((r) => console.log(`[alerts] legacy recovery scanned=${r.scanned} inserted=${r.inserted} merged=${r.merged}`))
  .catch((e) => console.warn("[alerts] legacy recovery failed:", e?.message ?? String(e)));

registerTraccarConfigRoutes({
  app,
  requireApiKey,
  getConfig: () => ({
    baseUrl: TRACCAR_BASE_URL,
    username: TRACCAR_USERNAME,
    password: TRACCAR_PASSWORD,
    token: TRACCAR_TOKEN,
    kickCommand: TRACCAR_KICK_COMMAND,
  }),
  setConfig: (next) => {
    TRACCAR_BASE_URL = next.baseUrl;
    TRACCAR_USERNAME = next.username;
    TRACCAR_PASSWORD = next.password;
    TRACCAR_TOKEN = next.token;
    TRACCAR_KICK_COMMAND = next.kickCommand;
    process.env.TRACCAR_BASE_URL = TRACCAR_BASE_URL;
    process.env.TRACCAR_USERNAME = TRACCAR_USERNAME;
    process.env.TRACCAR_PASSWORD = TRACCAR_PASSWORD;
    process.env.TRACCAR_TOKEN = TRACCAR_TOKEN;
    process.env.TRACCAR_KICK_COMMAND = TRACCAR_KICK_COMMAND;
  },
});

registerHealthRoutes({
  app,
  hasSqlite: Boolean(Database),
  dbPath: DB_PATH,
  requirePersistentDb: REQUIRE_PERSISTENT_DB,
  valkeyClient,
  valkeyUrl: VALKEY_URL,
  valkeyTtl: VALKEY_TTL,
  readTelemetryCount,
  readLatestTelemetryAt,
  postgresTelemetryMirror,
  b2Enabled: B2_ENABLED,
  workerForwardDiagnostics: readWorkerForwardDiagnostics,
  hasWorkerApiKey: Boolean(WORKER_API_KEY),
  getTraccarConfig: () => ({
    baseUrl: TRACCAR_BASE_URL,
    username: TRACCAR_USERNAME,
    token: TRACCAR_TOKEN,
    kickCommand: TRACCAR_KICK_COMMAND,
  }),
  teltonikaTcpDiagnostics,
  concoxTcpDiagnostics,
  queclinkTcpDiagnostics,
  jt808Diagnostics,
    getAdminSessionHotCacheStats,
  getAuthSessionInvalidationStats,
  serviceRole: serviceRole.role,
  getLoadStats: () => ({
    inFlight: inFlightRequests,
    maxInFlight: MAX_IN_FLIGHT,
    eventLoopLagMs
  }),
});

registerMetricsRoutes({
  app,
  metrics: vpsMetrics,
  collectBusinessMetrics: async () => {
    const g = vpsMetrics.business;
    const c = vpsMetrics.counters;
    g.storageSqlite.set(Database ? 1 : 0);
    g.valkeyConnected.set(valkeyClient && valkeyClient.status === "ready" ? 1 : 0);
    g.postgresMirror.set(postgresTelemetryMirror ? 1 : 0);
    g.b2Enabled.set(B2_ENABLED ? 1 : 0);

    const sqliteCount = readTelemetryCount(undefined);
    const pgCount = await postgresTelemetryMirror?.readTelemetryCount(undefined);
    const events = pgCount ?? sqliteCount;
    if (Number.isFinite(events)) g.telemetryEvents.set(Number(events));

    if (postgresTelemetryMirror) {
      const pgReachable = pgCount !== null && Number.isFinite(pgCount);
      g.postgresMirrorReachable.set(pgReachable ? 1 : 0);
      if (pgReachable && Number.isFinite(sqliteCount)) {
        g.postgresMirrorLagEvents.set(Math.max(0, Number(sqliteCount) - Number(pgCount)));
      } else {
        g.postgresMirrorLagEvents.set(0);
      }
    } else {
      g.postgresMirrorReachable.set(0);
      g.postgresMirrorLagEvents.set(0);
    }

    const forwardDiag = workerForwardQueue.getDiagnostics();
    g.workerForwardQueueDepth.set(Number(forwardDiag.queued) || 0);
    const successDelta = Math.max(0, forwardDiag.success - workerForwardMetricBaselines.success);
    const failedDelta = Math.max(0, forwardDiag.failed - workerForwardMetricBaselines.failed);
    const droppedDelta = Math.max(0, forwardDiag.dropped - workerForwardMetricBaselines.dropped);
    if (successDelta) c.workerForwardSuccess.inc(successDelta);
    if (failedDelta) c.workerForwardFailed.inc(failedDelta);
    if (droppedDelta) c.workerForwardDropped.inc(droppedDelta);
    workerForwardMetricBaselines.success = forwardDiag.success;
    workerForwardMetricBaselines.failed = forwardDiag.failed;
    workerForwardMetricBaselines.dropped = forwardDiag.dropped;

    g.traccarOutboxPending.set(traccarOutbox.getGlobalPendingCount());

    const teltonikaActive = Object.values(teltonikaTcpDiagnostics.activeByPort ?? {}).reduce(
      (sum: number, n: unknown) => sum + (Number(n) || 0),
      0
    );
    const tcpActive =
      teltonikaActive +
      (Number(concoxTcpDiagnostics.activeConnections) || 0) +
      (Number(queclinkTcpDiagnostics.activeConnections) || 0);
    g.tcpActiveConnections.set(tcpActive);

    g.authSessionCacheSize.set(Number(getAdminSessionHotCacheStats().size) || 0);
  },
});

registerJt808HealthRoutes({
  app,
  jt808Diagnostics,
  findTenantForImeiWithDefault,
  jt808DefaultTenant: JT808_DEFAULT_TENANT,
  db,
  parseStoredJson,
  coerceNumber,
  postgresTelemetryMirror,
});

registerAuthRoutes({
  app,
  db,
  adminEmail: ADMIN_EMAIL,
  adminTokenTtlHours: ADMIN_TOKEN_TTL_HOURS,
  verifyAdminPassword,
  randomHex: (bytes: number) => crypto.randomBytes(bytes).toString("hex"),
  readTenant: (req) => readTenant(req as any),
  valkeySet,
});

registerMarketingContactRoutes({
  app,
  db,
  randomHex: (bytes: number) => crypto.randomBytes(bytes).toString("hex"),
  contactTo: String(process.env.MARKETING_CONTACT_TO ?? "care@vivitelematics.com").trim().toLowerCase()
});

const deliverServices = createDeliverServices({ db });

if (serviceRole.isDeliver()) {
registerDeliverCatalogRoutes({
  app,
  requireApiKey,
  deliverReadStore: deliverServices.readStore,
  deliverWriteStore: deliverServices.writeStore,
  deliverEnsureStoreShape: deliverServices.ensureStoreShape,
  deliverSummarize: deliverServices.summarize,
  deliverSanitizeText: deliverServices.sanitizeText,
  deliverNowIso: deliverServices.nowIso,
});

registerDeliverHealthRoutes({
  app,
  requireApiKey,
  deliverReadStore: deliverServices.readStore,
  deliverEnsureStoreShape: deliverServices.ensureStoreShape,
  deliverSanitizeNumber: deliverServices.sanitizeNumber,
  deliverNowIso: deliverServices.nowIso,
});

registerDeliverDronesRoutes({
  app,
  requireApiKey,
  deliverReadStore: deliverServices.readStore,
  deliverWriteStore: deliverServices.writeStore,
  deliverSummarize: deliverServices.summarize,
  deliverSanitizeText: deliverServices.sanitizeText,
  deliverSanitizeNumber: deliverServices.sanitizeNumber,
  deliverCreateDroneId: deliverServices.createDroneId,
  deliverNowIso: deliverServices.nowIso,
});

registerDeliverOrdersRoutes({
  app,
  requireApiKey,
  deliverReadStore: deliverServices.readStore,
  deliverWriteStore: deliverServices.writeStore,
  deliverSummarize: deliverServices.summarize,
  deliverSanitizeText: deliverServices.sanitizeText,
  deliverSanitizeNumber: deliverServices.sanitizeNumber,
  deliverCreateOrderId: deliverServices.createOrderId,
  deliverNowIso: deliverServices.nowIso,
  deliverBestDroneForOrder: deliverServices.bestDroneForOrder,
  deliverIsDroneAvailable: deliverServices.isDroneAvailable,
  deliverUpdateDroneAfterDelivery: deliverServices.updateDroneAfterDelivery,
});
}
// Assets bounded context (DDD): presentation route module
if (serviceRole.isTrack()) {
registerAssetRoutes({
  app,
  db,
  requireApiKey,
  readTenant: (req) => readTenant(req as any),
  normalizeAssetIdsForTenant,
  parseStoredJson,
  normalizeNumber,
  readAssetById: assetServices.readAssetById,
  findExistingAssetIdByImei: assetServices.findExistingAssetIdByImei,
  upsertAsset: assetServices.upsertAsset,
  deleteMatchingAssets: assetServices.deleteMatchingAssets,
  findGlobalAssetIdentityConflict: assetServices.findGlobalAssetIdentityConflict,
  listConfigGroups,
  resolveByNameOrId,
  listAssetIdsForTenant,
  nextAvailableNumericId,
  cache: {
    get: valkeyGet,
    set: valkeySet,
    del: valkeyDel,
  },
  cacheTtlSeconds: VALKEY_TTL,
});

// Telemetry bounded context (DDD): ingest presentation routes
registerTelemetryIngestRoutes({
  app,
  requireApiKey,
  isLoopbackRequest,
  normalizeFreematicsTelemetryBody,
  parseQueclinkTextMessage,
  findTenantForImeiWithDefault,
  storeTelemetryEventForTenant,
  forwardTelemetryToWorker,
  freematicsDefaultTenant: FREEMATICS_DEFAULT_TENANT,
  queclinkDefaultTenant: QUECLINK_DEFAULT_TENANT,
});
}
// Alerts bounded context (DDD): presentation -> application -> infrastructure
if (serviceRole.isControl()) {
registerAlertRoutes({
  app,
  requireApiKey,
  readAuthToken,
  getTenantId: (req) => String(req.header("x-tenant-id") ?? req.query.tenant ?? ""),
  generateId: cryptoRandom,
  cache: {
    get: valkeyGet,
    set: valkeySet,
  },
});
}
if (serviceRole.isControl()) {
registerDeviceConfigurationRoutes({
  app,
  db,
  requireApiKey,
  valkeyGet,
  valkeySet,
  valkeyDel,
  parseStoredJson,
});
}

// Device artifact/proxy/kick bounded context (DDD): presentation route module
if (serviceRole.isTrack()) {
registerDeviceOpsRoutes({
  app,
  db,
  fs,
  requireApiKey,
  getBaseArtifact,
  b2Client,
  b2Bucket,
  getObjectCommandCtor: GetObjectCommand,
  isReadableStream,
  deviceServerDomain: DEVICE_SERVER_DOMAIN,
  deviceServerPort: DEVICE_SERVER_PORT,
  deviceServerProtocol: DEVICE_SERVER_PROTOCOL,
  deviceServerApiKey: DEVICE_SERVER_API_KEY,
  traccarBaseUrl: () => TRACCAR_BASE_URL,
  traccarUsername: () => TRACCAR_USERNAME,
  traccarPassword: () => TRACCAR_PASSWORD,
  traccarToken: () => TRACCAR_TOKEN,
  traccarKickCommand: () => TRACCAR_KICK_COMMAND,
  enqueueTraccarKickCommandJob: traccarOutbox.enqueueKickAvlCommandJob,
  triggerTraccarOutboxDrain: drainTraccarOutbox,
  getTraccarOutboxDiagnostics: traccarOutbox.getDiagnostics,
  traccarFetch,
  readAssetById: assetServices.readAssetById,
  findExistingAssetIdByImei: assetServices.findExistingAssetIdByImei,
  upsertAsset: assetServices.upsertAsset,
  readTenant: (req) => readTenant(req as any),
  invalidateAssetsCache: async (tenant, raw) => {
    await valkeyDel(`vivi:${tenant}:${raw ?? ""}:assets`, `vivi:${raw ?? ""}:${tenant}:assets`);
  },
});
}



const rbacServices = createRbacServices({
  loadBindingsFromDb,
  persistBindingToDb,
  deleteBindingFromDb,
  adminEmail: ADMIN_EMAIL,
});

if (serviceRole.isControl()) {
registerRbacRoutes({
  app,
  requireApiKey,
  readTenant: (req) => readTenant(req as any),
  listRbacRolesForTenant: rbacServices.listRbacRolesForTenant,
  listRbacRolePermsForTenant: rbacServices.listRbacRolePermsForTenant,
  saveRbacRole: rbacServices.saveRbacRole,
  replaceRbacRolePermissions: rbacServices.replaceRbacRolePermissions,
  listRbacUsers: rbacServices.listRbacUsers,
  listRbacUsersForTenant: rbacServices.listRbacUsersForTenant,
  listAssignedTenantIdsForUser: rbacServices.listAssignedTenantIdsForUser,
  applyUserScopeAssignment: rbacServices.applyUserScopeAssignment,
  userBelongsToTenant: rbacServices.userBelongsToTenant,
  persistBindingToDb,
  rbacUsersBindingType: rbacServices.RBAC_USERS_BINDING_TYPE,
  saveRoleAssignmentForTenant: rbacServices.saveRoleAssignmentForTenant,
  sendRbacInviteEmail,
  cryptoRandom,
  listRbacGroupsForTenant: rbacServices.listRbacGroupsForTenant,
  listGroupRoleLinksForTenant: rbacServices.listGroupRoleLinksForTenant,
  listGroupUserLinksForTenant: rbacServices.listGroupUserLinksForTenant,
  saveRbacGroup: rbacServices.saveRbacGroup,
  replaceGroupLinksForTenant: rbacServices.replaceGroupLinksForTenant,
  listRoleAssignmentsForTenant: rbacServices.listRoleAssignmentsForTenant,
  valkeyDel,
});

registerAuthIdentityRoutes({
  app,
  db,
  requireApiKey,
  listRbacUsers: rbacServices.listRbacUsers,
  listRbacUsersForTenant: rbacServices.listRbacUsersForTenant,
  userBelongsToTenant: rbacServices.userBelongsToTenant,
  buildImpersonatedPrincipal: rbacServices.buildImpersonatedPrincipal,
  listRbacRolePermsForTenant: rbacServices.listRbacRolePermsForTenant,
  listRbacRolesForTenant: rbacServices.listRbacRolesForTenant,
  listRoleAssignmentsForTenant: rbacServices.listRoleAssignmentsForTenant,
  listGroupRoleLinksForTenant: rbacServices.listGroupRoleLinksForTenant,
  persistBindingToDb,
  loadBindingsFromDb,
  deleteBindingFromDb,
  rbacImpersonationBindingType: rbacServices.RBAC_IMPERSONATION_BINDING_TYPE,
  adminTokenTtlHours: ADMIN_TOKEN_TTL_HOURS,
  randomHex: (bytes: number) => crypto.randomBytes(bytes).toString("hex"),
  readAuthToken,
  readTenant: (req) => readTenant(req as any),
  adminEmail: ADMIN_EMAIL,
  valkeyGet,
  valkeySet,
  valkeyDel,
  valkeyTtl: VALKEY_TTL,
});
}
if (serviceRole.isTrack()) {
registerTelemetryStreamRoute({
  app,
  db,
  requireApiKey,
  parseStoredJson,
});
}
// Telemetry bounded context (DDD): query/read presentation routes
if (serviceRole.isAnalyse() || serviceRole.isTrack()) {
registerTelemetryQueryRoutes({
  app,
  db,
  requireApiKey,
  findTenantForImeiWithDefault,
  parseStoredJson,
  buildLatestTelemetrySummary,
  traccarResolveLatestPositionByImei,
  coerceNumber,
  coerceBool,
  pickTraccarPositionAt,
  readTelemetryArchivePayload,
  valkeyGet,
  valkeySet,
  valkeyTtl: VALKEY_TTL,
  postgresTelemetryMirror,
});
}

// Device commands/intercom bounded context (DDD): presentation route module
if (serviceRole.isTrack()) {
registerDeviceCommandRoutes({
  app,
  db,
  requireApiKey,
  buildDeviceSettingsPayload,
  mergeDeviceSettingsPayload,
  isRecordObject,
  resolveCameraId,
  generateId: cryptoRandom,
});
}

if (serviceRole.isControl()) {
registerPatBindingsKvRoutes({
  app,
  db,
  Database,
  requireApiKey,
  cryptoRandom,
  loadBindingsFromDb,
  persistBindingToDb,
  deleteBindingFromDb,
  purgeBindingsForTenant,
  readTenant,
  inMemoryKv: _inMemoryKv,
});
}
if (serviceRole.isTrack()) {
registerDeviceArtifactAdminRoute({
  app,
  db,
  requireApiKey,
  cryptoRandom,
  sha256Hex,
  b2Client,
  b2Bucket,
  deviceArtifactsDir: DEVICE_ARTIFACTS_DIR,
  path,
  fs,
  createPutObjectCommand: (input: any) => new PutObjectCommand(input),
});


registerCameraHealthRoutes({
  app,
  db,
  requireApiKey,
  resolveCameraId,
  toIsoTimestamp,
  normalizeCameraHealthTelemetryBody,
  findTenantForImeiWithDefault,
  upsertCameraHealth,
  valkeyDel,
  storeTelemetryEventForTenant,
  forwardTelemetryToWorker,
  valkeyGet,
  listCameraHealth,
  valkeySet,
  valkeyTtl: VALKEY_TTL,
  sanitizeCameraId,
  parseStoredJson,
  liveText,
  liveChannelLabelByIndex,
  liveNormalizeChannelKey,
  probeStreamQuality,
});

registerCameraLiveSessionRoute({
  app,
  db,
  requireApiKey,
  readTenant,
  listCameraHealth,
  parseStoredJson,
  liveText,
  liveResolveBoundCameraIdForAsset,
  liveFindRecordByNeedle,
  liveBuildChannels,
  liveResolveSessionUrl,
  liveNormalizeChannelKey,
  liveChannelLabelByIndex,
  resolveLiveStreamFromProvider,
  resolveLiveStreamFromDeviceServer,
  resolveLiveStreamFromCmsv6: (tenantId, site, cameraId, channel, userId) =>
    resolveLiveStreamFromCmsv6(
      {
        get: valkeyGet,
        set: async (key, value) => {
          await valkeySet(key, value, 60 * 60 * 24 * 400);
        }
      },
      tenantId,
      site,
      cameraId,
      channel,
      userId
    ),
  cryptoRandom,
});

registerCmsv6Routes({
  app,
  db,
  requireApiKey,
  readTenant: (req) => readTenant(req as any),
  valkeyGet,
  valkeySet,
});

registerIntercomAudioIngestRoute({
  app,
  db,
  requireApiKey,
  resolveCameraId,
  toIsoTimestamp,
  maxCameraPcmChunkBytes: MAX_CAMERA_PCM_CHUNK_BYTES,
  ensureRecordingPath,
  fs,
  cryptoRandom,
  upsertCameraHealth,
});
}

// Support agents presence (Command Center)
if (serviceRole.isControl()) {
registerSupportAgentRoutes({
  app,
  db,
  requireApiKey,
  supportAgentSeedJson: String(process.env.SUPPORT_AGENT_SEED_JSON ?? ""),
  listSupportDeskAgents: rbacServices.listSupportDeskAgents
});

registerSupportChatRoutes({
  app,
  db,
  generateId: cryptoRandom
});
}

if (serviceRole.isAnalyse()) {
  registerReportArchiveRoutes({
    app,
    requireApiKey: requireConfiguredWorkerApiKey,
    readTenant: (req) => readTenant(req as any),
    reportArchives: reportArchiveService
  });
}

const noopTcp = () => undefined;
startVpsServer({
  app,
  fs,
  httpsModule: https,
  port: PORT,
  hasSqlite: Boolean(Database),
  dbPath: DB_PATH,
  workerForwardEnabled: WORKER_TELEMETRY_FORWARD_ENABLED,
  workerForwardUrl: WORKER_TELEMETRY_FORWARD_URL,
  startTeltonikaTcpIngest: serviceRole.isTrack() ? startTeltonikaTcpIngest : noopTcp,
  startConcoxTcpIngest: serviceRole.isTrack() ? startConcoxTcpIngest : noopTcp,
  startQueclinkTcpIngest: serviceRole.isTrack() ? startQueclinkTcpIngest : noopTcp,
  configureHttpServer: (server, realtimeApp) =>
    attachVpsRealtimeHub(server, realtimeApp, {
      apiKey: API_KEY,
      db,
      traccarFetch,
      listSupportDeskAgents: () => rbacServices.listSupportDeskAgents(),
    }),
});
