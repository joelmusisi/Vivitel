import {
  activateDemoRecord,
  advanceDemoOnLogin,
  buildDemoOnboardingMessages,
  claimDemoNotifications,
  createPendingDemoRecord,
  demoBlocksAccess,
  dismissDemoTour,
  demoRecordHasPersonalHierarchy,
  demoSharedHierarchyVisible,
  loadDemoRecord,
  markDemoNotificationResult,
  mergeActiveDemoPermissions,
  parseSupportNotifyEmails,
  saveDemoRecord,
  toPublicDemoStatus,
  DEMO_EXPIRED_MESSAGE,
  type DemoAccessRecord,
  type DemoKv,
  type DemoPublicStatus
} from "./shared/demoAccess";
import {
  ensureStandardRolesForTenant,
  isAdminLikeRoleName,
  isAdvancedLikeRoleName,
  isDealerSupportLikeRoleName,
  isDatabaseSupportLikeRoleName,
  isOwnSupportLikeRoleName,
  isStandardRoleName,
  isSupportLikeRoleName,
  standardRoleAllowsPage
} from "./shared/standardRoles";
import { filterHierarchyForActorScope, validateAssignmentForRoleScope, validateAssignmentWithinActorAccess, tenantIdsWithinActorAccess, sitesWithinActorAccessForTenant, isActorAdminScope, resolveRoleScopeRules, canManageHierarchyLevel, type HierarchyAction, type HierarchySegment } from "./shared/roleScopeRules";
import { handleHomeDashboardRequest } from "./shared/homeDashboardService";
import { refreshCms808AssetPositions } from "./shared/cmsv6/assetRefresh";
import { handleCmsv6Request, resolveLiveStreamFromCmsv6 } from "./shared/cmsv6/handleRequest";
import { buildTraccarComputedAttributePayload as buildTraccarComputedAttributePayloadShared } from "./shared/traccarNotificationLibrarySync";
import {
  readViviLibraryIdFromComputedItem,
  sanitizeTraccarComputedAttributeRequestBody,
  toTraccarComputedAttributeApiBody
} from "./shared/traccarComputedAttributeApi";
import {
  buildTraccarDeviceHierarchyFields,
  looksLikeMisplacedDatabaseLabel,
  resolveAssetDatabaseLabel,
  resolveViviFieldsFromTraccarDevice,
  resolveViviHierarchyFromAsset
} from "./shared/traccarViviNaming";
import {
  bindingSiteDedupeKey,
  isLegacyFlatScopedKvKey,
  isTenantWideSiteScopedKvKey,
  SITE_SCOPED_KV_BASES,
  siteScopesMatch,
  validateBindingSiteAnchor,
  validateRecordSiteAnchor
} from "./shared/scopeIsolation";
import {
  listAllSiteDriversFromKv,
  mergeDriverKvRecords,
  readSiteDriversFromKv,
  removeSiteDriverFromKv,
  upsertSiteDriverInKv
} from "./shared/driverKvMirror";
import { deviceBindingNeedsLocation, resolveBindingByRef } from "./shared/bindingResolve";
import {
  buildAssetTelemetryArchiveKey,
  withAssetStoragePrefix
} from "./shared/assetStoragePaths";
import {
  buildAssetAfterDeviceDecommission,
  completeDeviceDecommission,
  deleteTraccarDeviceByImei,
  purgeD1OperationalDeviceTraces
} from "./shared/deviceDecommission";
import {
  type B2Purpose,
  resolveB2Credentials,
  resolveB2Purpose,
  resolveB2ReadCredentials,
  b2DefaultConfigured
} from "./shared/b2BucketRouter";
import {
  actionUserAlertForUser,
  isTraccarEventPayload,
  pollTraccarUserAlertsForAllTenants,
  processTraccarUserAlertEventIngest,
  readUserAlertsForUser
} from "./shared/userAlertDispatch";
import { handlePushTokenRequest } from "./shared/mobilePushTokens";
import {
  appendHosPunch,
  readHosAlerts,
  readHosPunches,
  readHosRules,
  upsertHosAlert,
  writeHosRules
} from "./shared/hosStorage";
import {
  deleteUserAlertRule,
  readUserAlertRules,
  upsertUserAlertRule
} from "./shared/userAlertRulesStorage";
import {
  readInfoHubStreamMonitor,
  upsertInfoHubSiteStreamMonitor,
  type InfoHubSiteStreamMonitor
} from "./shared/infoHubStreamMonitor";
import {
  buildAuthProfilePayload,
  normalizeThemePreference,
  pickProfileDetailsPatch,
  readUserProfile,
  resolveComposedName,
  writeUserProfile
} from "./shared/userProfileStorage";
import { DEMO_HIERARCHY_IDS, DEMO_TENANT_ID, filterHierarchyForRegion, isSharedDemoDatabaseTenant, sharedDemoPathFromHierarchy, type SharedDemoPath } from "./shared/regionHierarchy";
import { hierarchyHasZaBranch, migrateZaKarongoPartition } from "./shared/migrateZaKarongo";
import {
  createRegionScopedKv,
  durableObjectNameForRegion,
  isTraccarStorageTenant,
  storageTenantId
} from "./shared/regionStorage";
import {
  DEFAULT_REGION,
  REGION_IDS,
  REGION_SERVERS,
  isRegionId,
  isRegionalAppHost,
  publicOriginForRegion,
  regionUsesCms808,
  regionUsesGpsIot,
  regionUsesTraccar,
  resolveEffectiveRegion,
  resolveRegionFromRequestLike,
  type RegionId
} from "./shared/regionServers";
import { databasesFromHierarchy } from "./shared/gpsiot/clients";
import { handleGpsIotRequest } from "./shared/gpsiot/handleRequest";
import { readZaGpsIotSecrets } from "./shared/gpsiot/secrets";
import { deleteSiteGpsIotClient, ensureSiteGpsIotClient, renameSiteGpsIotClient } from "./shared/gpsiot/siteClient";
import { sanitizeRbacUserRowForTenant } from "./shared/rbacTenantIsolation";
import { deliverEnhanceOrderBody, type DeliverExtendedStore } from "./shared/deliverPlatform";
import { deliverMergeExtendedStore, tryDeliverPlatformRoutes } from "./shared/deliverPlatformRoutes";
import { withEdgeCache } from "./shared/performance/edgeCache";
import {
  withDbCache,
  WORKER_LIST_CACHE_TTL_SEC,
  workerAssetsCacheKey,
  workerBindingsCacheKey
} from "./shared/performance/dbCache";
import { scheduleServerlessWarm, warmServerlessBindings } from "./shared/performance/serverlessWarm";
import { createVpsKvNamespace, routeOperationalD1ToVps } from "./shared/vpsWorkerStorage";
import {
  compareSqliteText,
  listAllRbacUsers,
  readRbacUsersByIds,
  readSupportDeskRoleHolders
} from "./shared/rbacUserDirectory";
import {
  LOCATION_ALERTS_KV_BASE,
  itemsForSite,
  confineToSite,
  locationAlertIdentity,
  mergeLocationAlertItems,
  parseLocationAlertItems,
  parseLocationAlertsKey,
  serializeLocationAlerts
} from "./shared/locationAlertsMerge";
import {
  deleteEntityOnVps,
  isOperationalD1Path,
  listRealtimePresenceFromVps,
  listRealtimeStateKeysFromVps,
  listBindingsFromVps,
  listEntitiesFromVps,
  proxyOperationalRequestToVps,
  readRealtimeStateFromVps,
  readHierarchyFromVps,
  resolveVpsOrigin,
  upsertEntityOnVps,
  writeRealtimeStateToVps,
  writeHierarchyToVps
} from "./shared/vpsOperationalProxy";
import {
  MITAC_SOFTWARE_R2_KEY,
  MITAC_SOFTWARE_CONTENT_TYPE,
  MITAC_SOFTWARE_FILENAME,
  mitacSoftwareDownloadHeaders
} from "./shared/mitacSoftwareDownload";
import {
  ViviRealtimeHub,
  notifyRealtimeSupport,
  notifyRealtimeCatalog,
  notifyRealtimeLive,
  readRouteLibraryFromDurableStore,
  readScopedKvFromDurableStore
} from "./realtime/ViviRealtimeHub";
import {
  TraccarSocketBridge,
  fetchTraccarLiveFromBridge,
  forwardTraccarPayloadToBridge,
  readDeviceTelemetryFromBridge
} from "./realtime/TraccarSocketBridge";
import { normalizeTraccarForwardPayload } from "./realtime/traccarForward";
import { runServerAlertRules } from "./realtime/serverAlertEngine";
import { buildTraccarLivePayload, type TraccarLivePayload } from "./realtime/traccarLivePayload";
import {
  gpsIotLiveCacheKey,
  mergeGpsIotLiveDevices,
  parseGpsIotForwardedLivePayload
} from "./shared/gpsiot/forwarding";
import { gpsIotLiveToTraccarLiveRow, type GpsIotLiveDevice } from "./shared/gpsiot/fleet";
import {
  TraccarPositionAttr
} from "./shared/traccarPositionKeys";

export { ViviRealtimeHub, TraccarSocketBridge };

export interface Env {
  APP_NAME?: string;
  API_KEY?: string;
  API_KEY_PERMANENT?: string;
  CMS808_ACCOUNT?: string;
  CMS808_PASSWORD?: string;
  CMS808_BASE_URL?: string;
  ADMIN_API_KEY?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_PASSWORD_HASH?: string;
  DEFAULT_TENANT_ID?: string;
  GOOGLE_MAPS_API_KEY?: string;
  SUPPORT_EMAIL?: string;
  MAIL_FROM?: string;
  MAIL_FROM_NAME?: string;
  RESEND_API_KEY?: string;
  /** Firebase service-account JSON (secret) for VIVI Mobile push notifications. */
  FCM_SERVICE_ACCOUNT_JSON?: string;
  /** Comma-separated support inboxes. Never return this value to the client. */
  DEMO_SUPPORT_NOTIFY_EMAILS?: string;
  ADMIN_EMAIL?: string;
  APP_BASE_URL?: string;
  // When set to "true", enables /auth/admin/bootstrap (requires x-api-key).
  ALLOW_ADMIN_BOOTSTRAP?: string;

  // Traccar integration (optional; used by /ingest/traccar).
  TRACCAR_BASE_URL?: string;
  TRACCAR_TOKEN?: string;
  TRACCAR_USERNAME?: string;
  TRACCAR_PASSWORD?: string;
  TRACCAR_KICK_COMMAND?: string;
  // Shared secret required for incoming Traccar webhooks.
  TRACCAR_WEBHOOK_SECRET?: string;
  // Temporary escape hatch: allow unsigned /ingest/traccar webhooks.
  // Set only in controlled environments when webhook headers cannot be set.
  TRACCAR_ALLOW_UNSIGNED_WEBHOOKS?: string;

  // United Kingdom GPS IoT only. Set with `wrangler secret put`, never in [vars].
  // Code uses these only when the request host is uk.vivitelematics.ca.
  GPSIOT_BASE_URL?: string;
  GPSIOT_WEB_API_KEY?: string;
  GPSIOT_WEB_SECRET_KEY?: string;
  /** Bearer token GPS IoT Data Forwarding providers must send to /ingest/gpsiot. */
  GPSIOT_FORWARD_TOKEN?: string;

  ViviTEL: KVNamespace;
  VIVI_D1: D1Database;
  REALTIME_HUB: DurableObjectNamespace;
  TRACCAR_SOCKET_BRIDGE?: DurableObjectNamespace;
  STORAGE_BUCKET?: R2Bucket;
  TASK_QUEUE?: Queue;

  // Optional Backblaze B2 archive for movement telemetry
  B2_KEY_ID?: string;
  B2_APP_KEY?: string;
  B2_BUCKET_ID?: string;
  B2_BUCKET_NAME?: string;
  /** Alias used by VPS-style env; treated as B2_BUCKET_NAME when set. */
  B2_BUCKET?: string;
  B2_API_BASE?: string;
  B2_ARCHIVE_PREFIX?: string;

  /** Track module bucket (telemetry + route libraries). Falls back to default when unset. */
  B2_TRACK_KEY_ID?: string;
  B2_TRACK_APP_KEY?: string;
  B2_BUCKET_ID_TRACK?: string;
  B2_BUCKET_NAME_TRACK?: string;
  B2_BUCKET_TRACK?: string;

  /** Reports cold archive bucket (promoted after hot retention). Falls back to default when unset. */
  B2_REPORTS_KEY_ID?: string;
  B2_REPORTS_APP_KEY?: string;
  B2_BUCKET_ID_REPORTS?: string;
  B2_BUCKET_NAME_REPORTS?: string;
  B2_BUCKET_REPORTS?: string;

  // Optional master live-stream provider (single source for all devices)
  LIVE_STREAM_PROVIDER_URL?: string;
  LIVE_STREAM_PROVIDER_API_KEY?: string;
  LIVE_STREAM_PROVIDER_TENANT?: string;
  DEVICE_SERVER_BASE_URL?: string;
  DEVICE_SERVER_DOMAIN?: string;
  DEVICE_SERVER_PORT?: string;
  DEVICE_SERVER_PROTOCOL?: string;
  DEVICE_SERVER_API_KEY?: string;
  VITE_DEVICE_SERVER_DOMAIN?: string;
  VITE_DEVICE_SERVER_PORT?: string;
  VITE_DEVICE_SERVER_PROTOCOL?: string;
  /** Origin VPS for operational data (SQLite / Valkey / B2). Must be a DNS hostname, not a bare IP. */
  VPS_ORIGIN?: string;
  ORIGIN_SERVER_URL?: string;
  VPS_HOSTNAME?: string;
  VPS_PORT?: string;
  VPS_PROTOCOL?: string;
}

type TokenStatus = "Active" | "Revoked";

type ResourceStatus = "ok" | "error" | "unconfigured";

interface PersonalAccessToken {
  id: string;
  token: string;
  description?: string;
  organisationName?: string;
  organisationGroup?: string;
  expiryDate: string;
  status: TokenStatus;
  daysToExpiry: number;
  username?: string;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  at: string;
}

interface ChatConversation {
  id: string;
  status: "open" | "closed";
  createdAt: string;
  closedAt?: string;
  user?: { name?: string; email?: string };
  assignedAgent?: { id?: string; name?: string; category?: string };
  messages: ChatMessage[];
}

type DeviceArtifactType = "firmware" | "config";

interface DeviceArtifactRecord {
  id: string;
  tenantId: string;
  type: DeviceArtifactType;
  name: string;
  version: string;
  r2Key: string;
  contentType: string;
  sha256: string;
  isBase: boolean;
  createdAt: string;
}

interface DevicePushRecord {
  id: string;
  tenantId: string;
  imei: string;
  assetId: string;
  status: "queued" | "delivered" | "failed";
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const PAT_INDEX_KEY = "pat:index";

const ADMIN_EMAIL_KEY = "auth:admin:email";
const ADMIN_PASSWORD_HASH_KEY = "auth:admin:passwordHash";
const ADMIN_SESSION_VERSION_KEY = "auth:admin:sessionVersion";
const ADMIN_SESSION_PREFIX = "auth:session:";
const ADMIN_RESET_PREFIX = "auth:reset:";
const USER_SESSION_PREFIX = "auth:userSession:";
const IMPERSONATION_RETURN_PREFIX = "auth:impersonationReturn:";
const RBAC_INVITE_PREFIX = "rbac:invite:";
const RBAC_RESET_PREFIX = "rbac:reset:";

// Cloudflare Workers WebCrypto may reject very high iteration counts.
// Keep this at or under 100k to avoid runtime errors.
const PBKDF2_ITERATIONS = 100_000;
const RESET_TOKEN_TTL_SECONDS = 60 * 30;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const INVITE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

const CORS_ALLOW_HEADERS = "content-type, authorization, x-tenant-id, x-api-key, x-home-sites, x-site-name, x-vivi-user-id, x-vivi-user-email, x-vivi-user-name";

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": CORS_ALLOW_HEADERS,
      ...(init.headers ?? {})
    }
  });

/** Guarantee CORS on every Worker response (including error paths browsers otherwise flag as CORS failures). */
const ensureCorsHeaders = (response: Response): Response => {
  // WebSocket upgrade (101) must keep its internal webSocket handle — cloning breaks the handshake.
  if (response.status === 101 || typeof (response as any).webSocket !== "undefined") {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", CORS_ALLOW_HEADERS);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

const badRequest = (message: string, status = 400) => json({ error: message }, { status });
const unauthorized = () => json({ error: "Unauthorized" }, { status: 401 });
const forbidden = () => json({ error: "Forbidden" }, { status: 403 });
const notFound = () => json({ error: "Not found" }, { status: 404 });
const serviceUnavailable = (payload: unknown) => json(payload, { status: 503 });
/** Never forward upstream Traccar 401/403 — clients treat those as Vivitel session expiry. */
const sanitizeUpstreamAuthStatus = (status: number) =>
  status === 401 || status === 403 ? 502 : status || 502;

const uuid = () => crypto.randomUUID();
const createEmailRequestId = () => `mail_${Date.now()}_${uuid().replace(/-/g, "").slice(0, 12)}`;

type B2AuthState = {
  authorizationToken: string;
  apiUrl: string;
  downloadUrl: string;
  accountId: string;
  expiresAt: number;
};

type B2UploadState = {
  uploadUrl: string;
  authorizationToken: string;
  expiresAt: number;
};

/** Per application-key auth cache (default / track / reports may differ). */
const b2AuthCacheByKeyId = new Map<string, B2AuthState>();
const b2UploadCache = new Map<string, B2UploadState>();

const b2EnvOf = (env: Env) => env;

const b2ArchiveEnabled = (env: Env) => b2DefaultConfigured(b2EnvOf(env));

const archiveSafePart = (value: string) =>
  String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

/** Legacy IMEI-dated path — reads still resolve via SQL storage_key. Not used for new writes. */
const buildLegacyB2ArchiveKey = (env: Env, tenantId: string, imei: string, createdAt: string, eventId: string) => {
  const d = Number.isNaN(Date.parse(createdAt)) ? new Date() : new Date(createdAt);
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const prefix = archiveSafePart(String(env.B2_ARCHIVE_PREFIX ?? "telemetry-archive")) || "telemetry-archive";
  const tenantPart = archiveSafePart(tenantId || "default") || "default";
  const imeiPart = archiveSafePart(imei || "unknown") || "unknown";
  const eventPart = archiveSafePart(eventId || uuid()) || uuid();
  return `${prefix}/${tenantPart}/${imeiPart}/${yyyy}/${mm}/${dd}/${eventPart}.json`;
};

// Expose for tests / dual-read tooling that need the historic key shape.
export const __legacyB2ArchiveKeyForTests = buildLegacyB2ArchiveKey;

const buildB2ArchiveKey = (
  _env: Env,
  tenantId: string,
  assetId: string,
  site: string,
  createdAt: string,
  eventId: string
) =>
  buildAssetTelemetryArchiveKey({
    tenantId,
    site,
    assetId: assetId || "unknown",
    createdAt,
    eventId: eventId || uuid(),
    extension: ".json"
  });

const b2BasicAuth = (keyId: string, appKey: string) => btoa(`${keyId}:${appKey}`);

async function b2AuthorizeWithCredentials(
  env: Env,
  keyId: string,
  appKey: string
): Promise<B2AuthState | null> {
  if (!keyId || !appKey) return null;
  const now = Date.now();
  const cached = b2AuthCacheByKeyId.get(keyId);
  if (cached && cached.expiresAt > now) return cached;

  const base = String(env.B2_API_BASE ?? "https://api.backblazeb2.com").trim().replace(/\/$/, "");
  const response = await fetch(`${base}/b2api/v2/b2_authorize_account`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${b2BasicAuth(keyId, appKey)}`
    }
  });

  if (!response.ok) return null;
  const body = (await response.json()) as any;
  const token = String(body?.authorizationToken ?? "").trim();
  const apiUrl = String(body?.apiUrl ?? "").trim();
  const downloadUrl = String(body?.downloadUrl ?? "").trim();
  const accountId = String(body?.accountId ?? "").trim();
  if (!token || !apiUrl || !accountId) return null;

  const state: B2AuthState = {
    authorizationToken: token,
    apiUrl,
    downloadUrl,
    accountId,
    expiresAt: now + 55 * 60 * 1000
  };
  b2AuthCacheByKeyId.set(keyId, state);
  return state;
}

async function b2AuthorizeForPurpose(env: Env, purpose: B2Purpose): Promise<{
  auth: B2AuthState;
  bucketId: string;
  bucketName: string;
  keyId: string;
} | null> {
  const creds = resolveB2Credentials(b2EnvOf(env), purpose);
  if (!creds) return null;
  const auth = await b2AuthorizeWithCredentials(env, creds.keyId, creds.appKey);
  if (!auth) return null;

  let bucketId = creds.bucketId;
  let bucketName = creds.bucketName;

  if (!bucketId && bucketName) {
    const response = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
      method: "POST",
      headers: {
        Authorization: auth.authorizationToken,
        "content-type": "application/json"
      },
      body: JSON.stringify({ accountId: auth.accountId, bucketName })
    });
    if (!response.ok) return null;
    const body = (await response.json()) as any;
    const bucket = Array.isArray(body?.buckets) ? body.buckets[0] : null;
    bucketId = String(bucket?.bucketId ?? "").trim();
  }

  if (!bucketName && bucketId) {
    const response = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
      method: "POST",
      headers: {
        Authorization: auth.authorizationToken,
        "content-type": "application/json"
      },
      body: JSON.stringify({ accountId: auth.accountId })
    });
    if (!response.ok) return null;
    const body = (await response.json()) as any;
    const buckets = Array.isArray(body?.buckets) ? body.buckets : [];
    const match = buckets.find((row: any) => String(row?.bucketId ?? "").trim() === bucketId);
    bucketName = String(match?.bucketName ?? "").trim();
  }

  if (!bucketId || !bucketName) return null;
  return { auth, bucketId, bucketName, keyId: creds.keyId };
}

async function b2GetUploadTarget(
  auth: B2AuthState,
  bucketId: string,
  forceRefresh = false
): Promise<B2UploadState | null> {
  const now = Date.now();
  if (!forceRefresh) {
    const cached = b2UploadCache.get(bucketId);
    if (cached && cached.expiresAt > now) return cached;
  } else {
    b2UploadCache.delete(bucketId);
  }

  const response = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: {
      Authorization: auth.authorizationToken,
      "content-type": "application/json"
    },
    body: JSON.stringify({ bucketId })
  });
  if (!response.ok) return null;
  const body = (await response.json()) as any;
  const uploadUrl = String(body?.uploadUrl ?? "").trim();
  const token = String(body?.authorizationToken ?? "").trim();
  if (!uploadUrl || !token) return null;

  const state: B2UploadState = {
    uploadUrl,
    authorizationToken: token,
    expiresAt: now + 30 * 60 * 1000
  };
  b2UploadCache.set(bucketId, state);
  return state;
}

async function archiveTelemetryEventToB2(
  env: Env,
  args: { tenantId: string; assetId: string; imei: string; createdAt: string; eventId: string; payload: unknown; site?: string }
): Promise<{ storage: "b2"; storageKey: string; sizeBytes: number } | null> {
  if (!b2ArchiveEnabled(env)) return null;
  const payloadObj = args.payload && typeof args.payload === "object" ? (args.payload as Record<string, unknown>) : {};
  const dataObj = payloadObj.data && typeof payloadObj.data === "object" ? (payloadObj.data as Record<string, unknown>) : {};
  const site = String(args.site ?? payloadObj.site ?? dataObj.site ?? "").trim();
  const storageKey = buildB2ArchiveKey(env, args.tenantId, args.assetId, site, args.createdAt, args.eventId);
  const bytes = new TextEncoder().encode(JSON.stringify(args.payload ?? {}));

  const target = await b2AuthorizeForPurpose(env, "track");
  if (!target) return null;
  const upload = await b2GetUploadTarget(target.auth, target.bucketId);
  if (!upload) return null;

  const response = await fetch(upload.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: upload.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(storageKey),
      "Content-Type": "application/json",
      "X-Bz-Content-Sha1": "do_not_verify"
    },
    body: bytes
  });

  if (!response.ok) return null;

  await ensureD1Tables(env);
  await env.VIVI_D1.prepare(
    "INSERT OR REPLACE INTO telemetry_archives (event_id, tenant_id, asset_id, imei, created_at, storage, storage_key, content_type, size_bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
  )
    .bind(args.eventId, args.tenantId, args.assetId, args.imei, args.createdAt, "b2", storageKey, "application/json", bytes.byteLength)
    .run();

  return { storage: "b2", storageKey, sizeBytes: bytes.byteLength };
}

async function b2DownloadFileByNameFromPurpose(
  env: Env,
  fileName: string,
  purpose: B2Purpose
): Promise<{ body: ReadableStream<Uint8Array>; size?: number; contentType?: string } | null> {
  const target = await b2AuthorizeForPurpose(env, purpose);
  if (!target?.auth.downloadUrl) return null;
  const encodedPath = String(fileName ?? "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = `${target.auth.downloadUrl.replace(/\/$/, "")}/file/${encodeURIComponent(target.bucketName)}/${encodedPath}`;
  const response = await fetch(url, {
    headers: { Authorization: target.auth.authorizationToken }
  });
  if (response.status === 404) return null;
  if (!response.ok || !response.body) return null;
  const sizeHeader = Number(response.headers.get("content-length") ?? 0);
  return {
    body: response.body,
    size: Number.isFinite(sizeHeader) && sizeHeader > 0 ? sizeHeader : undefined,
    contentType: response.headers.get("content-type") || undefined
  };
}

async function b2DownloadFileByName(
  env: Env,
  fileName: string
): Promise<{ body: ReadableStream<Uint8Array>; size?: number; contentType?: string } | null> {
  if (!b2ArchiveEnabled(env)) return null;
  const targets = resolveB2ReadCredentials(b2EnvOf(env), fileName);
  for (const creds of targets) {
    const file = await b2DownloadFileByNameFromPurpose(env, fileName, creds.purpose);
    if (file) return file;
  }
  return null;
}

async function b2UploadBytesByName(
  env: Env,
  fileName: string,
  bytes: Uint8Array,
  contentType: string,
  purposeHint?: B2Purpose
): Promise<boolean> {
  if (!b2ArchiveEnabled(env)) return false;
  const purpose = purposeHint ?? resolveB2Purpose(fileName);
  const target = await b2AuthorizeForPurpose(env, purpose);
  if (!target) return false;

  const bodyBytes =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();

  const attempt = async (forceRefresh: boolean) => {
    const upload = await b2GetUploadTarget(target.auth, target.bucketId, forceRefresh);
    if (!upload) return { ok: false as const, status: 0 };
    const response = await fetch(upload.uploadUrl, {
      method: "POST",
      headers: {
        Authorization: upload.authorizationToken,
        "X-Bz-File-Name": encodeURIComponent(fileName),
        "Content-Type": contentType,
        "Content-Length": String(bodyBytes.byteLength),
        "X-Bz-Content-Sha1": "do_not_verify"
      },
      body: bodyBytes
    });
    return { ok: response.ok, status: response.status };
  };

  let result = await attempt(false);
  if (!result.ok && (result.status === 401 || result.status === 403 || result.status === 503)) {
    b2AuthCacheByKeyId.delete(target.keyId);
    result = await attempt(true);
  }
  return result.ok;
}

async function b2ReadTextByName(env: Env, fileName: string): Promise<string | null> {
  if (!b2ArchiveEnabled(env)) return null;
  const file = await b2DownloadFileByName(env, fileName);
  if (!file?.body) return null;
  return await new Response(file.body).text();
}

async function b2ReadBytesByName(env: Env, fileName: string): Promise<Uint8Array | null> {
  if (!b2ArchiveEnabled(env)) return null;
  const file = await b2DownloadFileByName(env, fileName);
  if (!file?.body) return null;
  const buffer = await new Response(file.body).arrayBuffer();
  return new Uint8Array(buffer);
}

async function gunzipBytesToText(bytes: Uint8Array): Promise<string | null> {
  try {
    if (typeof DecompressionStream === "undefined") {
      return new TextDecoder().decode(bytes);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  } catch {
    try {
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }
}

async function readWorkerTelemetryArchivePayload(env: Env, row: any): Promise<any | null> {
  const storage = String(row?.storage ?? "").trim().toLowerCase();
  const key = String(row?.storage_key ?? "").trim();
  if (!key) return null;
  try {
    if (storage === "b2" || storage === "") {
      const bytes = await b2ReadBytesByName(env, key);
      if (!bytes?.length) return null;
      const text = await gunzipBytesToText(bytes);
      if (!text) return null;
      return JSON.parse(text);
    }
  } catch {
    return null;
  }
  return null;
}

const normalizeScopeToken = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Site-isolated route archive object key in Backblaze B2. */
const buildRoutesLibraryB2Key = (tenantId: string, siteName: string) => {
  const tenantToken = normalizeScopeToken(tenantId) || "global";
  const siteToken = normalizeScopeToken(siteName);
  return `libraries/routes/tenant/${tenantToken}/site/${siteToken}.json`;
};

const legacyRoutesLibraryKvKey = (tenantId: string, siteName: string) => {
  const tenantToken = normalizeScopeToken(tenantId) || "global";
  const siteToken = normalizeScopeToken(siteName);
  return `libraries:routes:tenant:${tenantToken}:site:${siteToken}`;
};

const timingSafeEqBytes = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a[i] ^ b[i];
  return out === 0;
};

const timingSafeEqText = (a: string, b: string) => {
  const encoder = new TextEncoder();
  return timingSafeEqBytes(encoder.encode(String(a ?? "")), encoder.encode(String(b ?? "")));
};

const normalizeId = (value: unknown) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

async function readJsonBody<T = any>(request: Request): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    const text = await request.text();
    if (!String(text ?? "").trim()) return { ok: false, error: "Empty request body." };
    try {
      return { ok: true, value: JSON.parse(text) as T };
    } catch {
      return { ok: false, error: "Invalid JSON body." };
    }
  } catch {
    return { ok: false, error: "Invalid JSON body." };
  }
}

const getTenantId = (request: Request, url: URL) => {
  const raw = request.headers.get("x-tenant-id")?.trim() || url.searchParams.get("tenant")?.trim() || "";
  if (!raw) return "";
  const region = resolveRequestRegion(request);
  return storageTenantId(region, raw);
};

type HierarchySite = {
  id: string;
  name: string;
  traccarGroupId?: number;
  gpsIotClientId?: string;
  ownerUserId?: string;
};

type HierarchyDatabase = {
  id: string;
  name: string;
  sites: HierarchySite[];
  ownerUserId?: string;
};

type HierarchyOrg = {
  id: string;
  name: string;
  databases: HierarchyDatabase[];
  ownerUserId?: string;
};

type HierarchyDealer = {
  id: string;
  name: string;
  organisations: HierarchyOrg[];
  ownerUserId?: string;
};

type HierarchyRoot = {
  dealers: HierarchyDealer[];
  updatedAt?: string;
};

type HierarchyAssignment = {
  scope: "dealer" | "organisation" | "database" | "site" | "asset";
  targetId: string;
  targetLabel: string;
  userName: string;
  userEmail: string;
  assignedByName?: string;
  assignedByEmail?: string;
  createdAt: string;
};

/** Single shared org tree for all database tenants (dealers → orgs → dbs → sites). */
const HIERARCHY_GLOBAL_KEY = "hierarchy:v1:global";
const hierarchyAssignmentsStorageKey = (tenantId: string) => `hierarchy:assign:v1:${tenantId || "global"}`;

const createEmptyHierarchy = (): HierarchyRoot => ({ dealers: [], updatedAt: new Date().toISOString() });

const countHierarchyNodes = (hierarchy: HierarchyRoot) => {
  let count = 0;
  for (const dealer of hierarchy.dealers ?? []) {
    count += 1;
    for (const org of dealer.organisations ?? []) {
      count += 1;
      for (const db of org.databases ?? []) {
        count += 1 + (db.sites?.length ?? 0);
      }
    }
  }
  return count;
};

const normalizeHierarchyRoot = (value: unknown): HierarchyRoot => {
  const source = value as any;
  const dealers = Array.isArray(source?.dealers) ? source.dealers : [];
  const ownerOf = (value: unknown) => {
    const ownerUserId = normalizeId((value as { ownerUserId?: unknown })?.ownerUserId);
    return ownerUserId ? { ownerUserId } : {};
  };
  const normalizedDealers: HierarchyDealer[] = dealers.map((dealer: any) => ({
    id: normalizeId(dealer?.id) || uuid(),
    name: String(dealer?.name ?? "").trim(),
    ...ownerOf(dealer),
    organisations: (Array.isArray(dealer?.organisations) ? dealer.organisations : []).map((org: any) => ({
      id: normalizeId(org?.id) || uuid(),
      name: String(org?.name ?? "").trim(),
      ...ownerOf(org),
      databases: (Array.isArray(org?.databases) ? org.databases : []).map((db: any) => ({
        id: normalizeId(db?.id) || uuid(),
        name: String(db?.name ?? "").trim(),
        ...ownerOf(db),
        sites: (Array.isArray(db?.sites) ? db.sites : []).map((site: any) => {
          const rawGroup = Number(site?.traccarGroupId);
          const traccarGroupId = Number.isFinite(rawGroup) && rawGroup > 0 ? Math.trunc(rawGroup) : undefined;
          const gpsIotClientId = String(site?.gpsIotClientId ?? "").trim();
          return {
            id: normalizeId(site?.id) || uuid(),
            name: String(site?.name ?? "").trim(),
            ...ownerOf(site),
            ...(traccarGroupId ? { traccarGroupId } : {}),
            ...(gpsIotClientId ? { gpsIotClientId } : {})
          };
        })
      }))
    }))
  }));
  return {
    dealers: normalizedDealers,
    updatedAt: String(source?.updatedAt ?? "").trim() || new Date().toISOString()
  };
};

const hierarchyNameKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

const hierarchyRegionFromTenant = (tenantId: string): string => {
  const match = String(tenantId ?? "").trim().match(/^region:([a-z0-9]+):/i);
  return match ? String(match[1]).toLowerCase() : DEFAULT_REGION;
};

const findByIdOrName = <T extends { id: string; name: string; ownerUserId?: string }>(
  rows: T[],
  id: string,
  name: string,
  ownerUserId = ""
): T | undefined => {
  const byId = id ? rows.find((row) => row.id === id) : undefined;
  if (byId) return byId;
  // Trial branches are owned by one account. Same display names must not collapse together.
  if (ownerUserId) return undefined;
  const key = hierarchyNameKey(name);
  if (!key) return undefined;
  return rows.find((row) => !row.ownerUserId && hierarchyNameKey(row.name) === key);
};

/**
 * Merge hierarchy trees by id, and also by same-name siblings under the same parent.
 * Local-only creates often minted new ids for an existing "EAST AFRICA" dealer/org, so
 * id-only merge left Admin looking at the empty shared node while the creator still saw
 * databases under a duplicate local node.
 */
const mergeHierarchyRoots = (roots: HierarchyRoot[]): HierarchyRoot => {
  const merged: HierarchyRoot = createEmptyHierarchy();
  let updatedAt = "";

  for (const root of roots) {
    const normalized = normalizeHierarchyRoot(root);
    if (normalized.updatedAt && normalized.updatedAt > updatedAt) updatedAt = normalized.updatedAt;

    for (const dealer of normalized.dealers) {
      let targetDealer = findByIdOrName(merged.dealers, dealer.id, dealer.name, dealer.ownerUserId);
      if (!targetDealer) {
        targetDealer = { ...dealer, organisations: [] };
        merged.dealers.push(targetDealer);
      } else {
        if (!targetDealer.name && dealer.name) targetDealer.name = dealer.name;
      }

      for (const org of dealer.organisations) {
        let targetOrg = findByIdOrName(targetDealer.organisations, org.id, org.name, org.ownerUserId);
        if (!targetOrg) {
          targetOrg = { ...org, databases: [] };
          targetDealer.organisations.push(targetOrg);
        } else if (!targetOrg.name && org.name) {
          targetOrg.name = org.name;
        }

        for (const db of org.databases) {
          let targetDb = findByIdOrName(targetOrg.databases, db.id, db.name, db.ownerUserId);
          if (!targetDb) {
            targetDb = { ...db, sites: [] };
            targetOrg.databases.push(targetDb);
          } else if (!targetDb.name && db.name) {
            targetDb.name = db.name;
          }

          for (const site of db.sites) {
            const existingSite = findByIdOrName(targetDb.sites, site.id, site.name, site.ownerUserId);
            if (!existingSite) {
              targetDb.sites.push({ ...site });
            } else {
              if (!existingSite.traccarGroupId && site.traccarGroupId) {
                existingSite.traccarGroupId = site.traccarGroupId;
              }
              if (!existingSite.gpsIotClientId && site.gpsIotClientId) {
                existingSite.gpsIotClientId = site.gpsIotClientId;
              }
              if (!existingSite.name && site.name) existingSite.name = site.name;
            }
          }
        }
      }
    }
  }

  merged.updatedAt = updatedAt || new Date().toISOString();
  return collapseHierarchyNameDuplicates(merged);
};

/** Collapse any remaining same-name siblings so the UI shows one EAST AFRICA with all databases. */
const collapseHierarchyNameDuplicates = (root: HierarchyRoot): HierarchyRoot => {
  const dealers: HierarchyDealer[] = [];
  for (const dealer of root.dealers ?? []) {
    const existingDealer = findByIdOrName(dealers, dealer.id, dealer.name, dealer.ownerUserId);
    const targetDealer = existingDealer ?? { ...dealer, organisations: [] as HierarchyOrg[] };
    if (!existingDealer) dealers.push(targetDealer);

    for (const org of dealer.organisations ?? []) {
      const existingOrg = findByIdOrName(targetDealer.organisations, org.id, org.name, org.ownerUserId);
      const targetOrg = existingOrg ?? { ...org, databases: [] as HierarchyDatabase[] };
      if (!existingOrg) targetDealer.organisations.push(targetOrg);

      for (const db of org.databases ?? []) {
        const existingDb = findByIdOrName(targetOrg.databases, db.id, db.name, db.ownerUserId);
        const targetDb = existingDb ?? { ...db, sites: [] as HierarchySite[] };
        if (!existingDb) targetOrg.databases.push(targetDb);

        for (const site of db.sites ?? []) {
          const existingSite = findByIdOrName(targetDb.sites, site.id, site.name, site.ownerUserId);
          if (!existingSite) {
            targetDb.sites.push({ ...site });
          } else {
            if (!existingSite.traccarGroupId && site.traccarGroupId) {
              existingSite.traccarGroupId = site.traccarGroupId;
            }
            if (!existingSite.gpsIotClientId && site.gpsIotClientId) {
              existingSite.gpsIotClientId = site.gpsIotClientId;
            }
          }
        }
      }
    }
  }
  return { dealers, updatedAt: root.updatedAt || new Date().toISOString() };
};

const readHierarchy = async (env: Env, tenantId: string): Promise<HierarchyRoot> => {
  const region = hierarchyRegionFromTenant(tenantId);
  const serverTree = await readHierarchyFromVps(env, region);
  if (serverTree !== null) {
    if (typeof serverTree !== "object" || !Array.isArray((serverTree as { dealers?: unknown }).dealers)) {
      throw new Error("VPS hierarchy store returned an invalid hierarchy structure.");
    }
    return normalizeHierarchyRoot(serverTree);
  }

  // One-time, read-only import from legacy Worker KV. The VPS SQLite copy is
  // authoritative after this write; application reads never rewrite Worker KV.
  const listed = await env.ViviTEL.list({ prefix: "hierarchy:v1:", limit: 1000 });
  const keys = new Set<string>();
  for (const item of listed.keys ?? []) {
    const key = String(item?.name ?? "").trim();
    if (key && key !== HIERARCHY_GLOBAL_KEY && !key.startsWith("hierarchy:assign:")) keys.add(key);
  }
  let cursor = listed.list_complete ? undefined : listed.cursor;
  while (cursor) {
    const page = await env.ViviTEL.list({ prefix: "hierarchy:v1:", limit: 1000, cursor });
    for (const item of page.keys ?? []) {
      const key = String(item?.name ?? "").trim();
      if (key && key !== HIERARCHY_GLOBAL_KEY && !key.startsWith("hierarchy:assign:")) keys.add(key);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  }

  const roots: HierarchyRoot[] = [];
  for (const key of [HIERARCHY_GLOBAL_KEY, ...keys]) {
    const raw = await env.ViviTEL.get(key);
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error(`Legacy hierarchy entry "${key}" contains invalid JSON.`);
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { dealers?: unknown }).dealers)) {
      throw new Error(`Legacy hierarchy entry "${key}" has an invalid structure.`);
    }
    const hierarchy = normalizeHierarchyRoot(parsed);
    if (hierarchy.dealers.length) roots.push(hierarchy);
  }

  const imported = roots.length ? mergeHierarchyRoots(roots) : createEmptyHierarchy();
  await writeHierarchyToVps(env, region, imported);
  return imported;
};

const readHierarchyForTenantScope = async (env: Env, tenantId: string, tenantIds: string[] = []): Promise<HierarchyRoot> => {
  // Hierarchy is platform-global; tenant scope only filters visibility after read.
  const primary = await readHierarchy(env, tenantId);
  const extras = tenantIds
    .map((value) => String(value ?? "").trim())
    .filter((value) => value && value !== String(tenantId ?? "").trim());
  if (!extras.length) return primary;
  const roots = await Promise.all(extras.map((scopedTenantId) => readHierarchy(env, scopedTenantId)));
  return mergeHierarchyRoots([primary, ...roots]);
};

const saveHierarchy = async (
  env: Env,
  tenantId: string,
  hierarchy: HierarchyRoot,
  options?: { mode?: "replace" | "merge" }
): Promise<HierarchyRoot> => {
  const mode = options?.mode ?? "replace";
  const incoming = normalizeHierarchyRoot(hierarchy);
  incoming.updatedAt = new Date().toISOString();

  let toStore = incoming;
  if (mode === "merge") {
    const existing = await readHierarchy(env, tenantId);
    toStore = mergeHierarchyRoots([existing, incoming]);
    toStore.updatedAt = incoming.updatedAt;
  }

  await writeHierarchyToVps(env, hierarchyRegionFromTenant(tenantId), toStore);
  return toStore;
};

const findDealerInHierarchy = (h: HierarchyRoot, id: string): HierarchyDealer | null => {
  const key = normalizeId(id);
  if (!key) return null;
  return h.dealers.find((dealer) => dealer.id === key) ?? null;
};

const findOrgInHierarchy = (h: HierarchyRoot, id: string): { dealer: HierarchyDealer; org: HierarchyOrg } | null => {
  const key = normalizeId(id);
  if (!key) return null;
  for (const dealer of h.dealers) {
    const org = dealer.organisations.find((item) => item.id === key);
    if (org) return { dealer, org };
  }
  return null;
};

const findDbInHierarchy = (h: HierarchyRoot, id: string): { dealer: HierarchyDealer; org: HierarchyOrg; db: HierarchyDatabase } | null => {
  const key = normalizeId(id);
  if (!key) return null;
  for (const dealer of h.dealers) {
    for (const org of dealer.organisations) {
      const db = org.databases.find((item) => item.id === key);
      if (db) return { dealer, org, db };
    }
  }
  return null;
};

const findSiteInHierarchy = (h: HierarchyRoot, id: string): { dealer: HierarchyDealer; org: HierarchyOrg; db: HierarchyDatabase; site: HierarchySite } | null => {
  const key = normalizeId(id);
  if (!key) return null;
  for (const dealer of h.dealers) {
    for (const org of dealer.organisations) {
      for (const db of org.databases) {
        const site = db.sites.find((item) => item.id === key);
        if (site) return { dealer, org, db, site };
      }
    }
  }
  return null;
};

const findSiteByNameInHierarchy = (
  h: HierarchyRoot,
  siteName: string,
  databaseName?: string
): { dealer: HierarchyDealer; org: HierarchyOrg; db: HierarchyDatabase; site: HierarchySite } | null => {
  const key = String(siteName ?? "").trim().toLowerCase();
  if (!key) return null;
  const databaseKey = String(databaseName ?? "").trim().toLowerCase();

  const search = (requireDatabaseMatch: boolean) => {
    for (const dealer of h.dealers) {
      for (const org of dealer.organisations) {
        for (const db of org.databases) {
          if (requireDatabaseMatch && databaseKey && String(db.name ?? "").trim().toLowerCase() !== databaseKey) {
            continue;
          }
          const site = db.sites.find((item) => String(item.name ?? "").trim().toLowerCase() === key);
          if (site) return { dealer, org, db, site };
        }
      }
    }
    return null;
  };

  if (databaseKey) {
    return search(true) ?? search(false);
  }
  return search(false);
};

function gpsIotClientIdsInHierarchy(hierarchy: HierarchyRoot, exceptSiteId = "") {
  const ids = new Set<string>();
  for (const dealer of hierarchy.dealers) {
    for (const org of dealer.organisations) {
      for (const db of org.databases) {
        for (const site of db.sites) {
          if (exceptSiteId && site.id === exceptSiteId) continue;
          const clientId = String(site.gpsIotClientId ?? "").trim();
          if (clientId) ids.add(clientId);
        }
      }
    }
  }
  return ids;
}

async function ensureGpsIotClientForHierarchySite(request: Request, env: Env, hierarchy: HierarchyRoot, site: HierarchySite) {
  const region = resolveRequestRegion(request);
  if (region !== "za") return { created: false, attached: false };
  const secrets = readZaGpsIotSecrets(region, env);
  if (!secrets) return { created: false, attached: false, error: "South Africa GPS IoT keys are not set" };
  return ensureSiteGpsIotClient(secrets, site, gpsIotClientIdsInHierarchy(hierarchy, site.id));
}

async function renameGpsIotClientForHierarchySite(request: Request, env: Env, hierarchy: HierarchyRoot, site: HierarchySite, name: string) {
  const region = resolveRequestRegion(request);
  if (region !== "za") return { created: false, attached: false };
  const secrets = readZaGpsIotSecrets(region, env);
  if (!secrets) return { created: false, attached: false, error: "South Africa GPS IoT keys are not set" };
  return renameSiteGpsIotClient(secrets, site, name, gpsIotClientIdsInHierarchy(hierarchy, site.id));
}

async function removeGpsIotClientsForSites(request: Request, env: Env, sites: HierarchySite[]) {
  const region = resolveRequestRegion(request);
  if (region !== "za") return;
  const secrets = readZaGpsIotSecrets(region, env);
  if (!secrets) return;
  for (const site of sites) {
    const clientId = String(site.gpsIotClientId ?? "").trim();
    if (!clientId) continue;
    try {
      await deleteSiteGpsIotClient(secrets, clientId);
    } catch (error) {
      console.warn("[gpsiot] failed to delete client", clientId, error);
    }
  }
}

function sitesInDealer(dealer: HierarchyDealer) {
  return dealer.organisations.flatMap((org) => org.databases.flatMap((db) => db.sites));
}

/** Create or reuse a Traccar group for a VIVI site and persist traccarGroupId on the site. */
async function ensureTraccarGroupForSite(
  env: Env,
  tenantId: string,
  site: HierarchySite,
  options?: { hierarchy?: HierarchyRoot; persist?: boolean }
): Promise<{ groupId?: number; created: boolean; error?: string }> {
  const existingId = Number(site.traccarGroupId ?? 0);
  if (Number.isFinite(existingId) && existingId > 0) {
    return { groupId: Math.trunc(existingId), created: false };
  }

  const siteName = String(site.name ?? "").trim();
  if (!siteName) return { created: false, error: "Site name is required" };

  const base = String(env.TRACCAR_BASE_URL ?? "").trim();
  if (!base) return { created: false, error: "Traccar not configured" };

  const matchGroupId = (groupsBody: unknown): number | undefined => {
    if (!Array.isArray(groupsBody)) return undefined;
    const matched = (groupsBody as any[]).find(
      (row) => String(row?.name ?? "").trim().toLowerCase() === siteName.toLowerCase()
    );
    const candidate = Number(matched?.id ?? 0);
    return Number.isFinite(candidate) && candidate > 0 ? Math.trunc(candidate) : undefined;
  };

  const persistGroupId = async (groupId: number) => {
    site.traccarGroupId = groupId;
    if (options?.persist !== false && options?.hierarchy) {
      await saveHierarchy(env, tenantId, options.hierarchy);
    }
  };

  const listed = await traccarFetch(env, "/api/groups");
  if (listed.ok) {
    const existing = matchGroupId(listed.body);
    if (existing) {
      await persistGroupId(existing);
      return { groupId: existing, created: false };
    }
  }

  const groupResp = await traccarFetch(env, "/api/groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: siteName, attributes: {} })
  });
  if (groupResp.ok) {
    const parsedGroupId = Number((groupResp.body as any)?.id ?? 0);
    if (Number.isFinite(parsedGroupId) && parsedGroupId > 0) {
      const groupId = Math.trunc(parsedGroupId);
      await persistGroupId(groupId);
      return { groupId, created: true };
    }
  }

  // Create can fail on duplicate name — re-list and attach the existing group.
  const retryListed = await traccarFetch(env, "/api/groups");
  if (retryListed.ok) {
    const existing = matchGroupId(retryListed.body);
    if (existing) {
      await persistGroupId(existing);
      return { groupId: existing, created: false };
    }
  }

  const errMsg = String(
    (groupResp.body as any)?.message ??
      (groupResp.body as any)?.error ??
      (listed.ok ? `POST /api/groups ${groupResp.status}` : `GET /api/groups ${listed.status}`)
  );
  return { created: false, error: errMsg };
}

/** Push dealer/organisation/database labels onto Traccar devices in the sites of the given databases (update only, never creates). */
async function syncHierarchyLabelsToTraccarDevices(
  env: Env,
  hierarchy: HierarchyRoot,
  scope: { dealerId?: string; orgId?: string; dbId?: string }
): Promise<{ updated: number }> {
  let updated = 0;
  const targets: Array<{ dealer: string; org: string; db: string; groupIds: number[] }> = [];
  for (const dealer of hierarchy.dealers) {
    if (scope.dealerId && dealer.id !== scope.dealerId) continue;
    for (const org of dealer.organisations) {
      if (scope.orgId && org.id !== scope.orgId) continue;
      for (const db of org.databases) {
        if (scope.dbId && db.id !== scope.dbId) continue;
        const groupIds = db.sites
          .map((site) => Number(site.traccarGroupId ?? 0))
          .filter((id) => Number.isFinite(id) && id > 0);
        if (groupIds.length) targets.push({ dealer: dealer.name, org: org.name, db: db.name, groupIds });
      }
    }
  }
  if (!targets.length) return { updated };
  const all = await traccarFetch(env, "/api/devices?all=true");
  if (!all.ok || !Array.isArray(all.body)) return { updated };
  for (const target of targets) {
    const fields = buildTraccarDeviceHierarchyFields({
      dealer: target.dealer,
      organisation: target.org,
      database: target.db,
      site: ""
    });
    for (const device of all.body as Record<string, any>[]) {
      if (!target.groupIds.includes(Number(device?.groupId ?? 0))) continue;
      const needs = Object.entries(fields).some(([key, value]) => String(device?.[key] ?? "") !== String(value ?? ""));
      if (!needs) continue;
      const resp = await traccarFetch(env, `/api/devices/${device.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...device, ...fields })
      });
      if (resp.ok) updated += 1;
    }
  }
  return { updated };
}

const readHierarchyAssignments = async (env: Env, tenantId: string): Promise<HierarchyAssignment[]> => {
  try {
    const raw = await env.ViviTEL.get(hierarchyAssignmentsStorageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: unknown[] };
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return items
      .map((entry: any) => ({
        scope: String(entry?.scope ?? "").trim() as HierarchyAssignment["scope"],
        targetId: normalizeId(entry?.targetId),
        targetLabel: String(entry?.targetLabel ?? "").trim(),
        userName: String(entry?.userName ?? "").trim(),
        userEmail: String(entry?.userEmail ?? "").trim().toLowerCase(),
        assignedByName: String(entry?.assignedByName ?? "").trim() || undefined,
        assignedByEmail: String(entry?.assignedByEmail ?? "").trim().toLowerCase() || undefined,
        createdAt: String(entry?.createdAt ?? "").trim() || new Date().toISOString()
      }))
      .filter((entry) => Boolean(entry.scope && entry.targetId && (entry.userName || entry.userEmail)));
  } catch {
    return [];
  }
};

const saveHierarchyAssignments = async (env: Env, tenantId: string, items: HierarchyAssignment[]): Promise<void> => {
  await env.ViviTEL.put(
    hierarchyAssignmentsStorageKey(tenantId),
    JSON.stringify({ items, updatedAt: new Date().toISOString() })
  );
};

const resolveTenantId = async (request: Request, url: URL, env: Env) => {
  const region = resolveRequestRegion(request);
  const direct = getTenantId(request, url);
  if (direct) return direct;
  const fallbackTenantId = storageTenantId(region, String(env.DEFAULT_TENANT_ID ?? "").trim() || "west-africa");
  const principal = await getPrincipal(request, env);
  if (principal.kind === "user") {
    const allowed = await readAllowedTenantIdsForUser(env, principal.userId);
    const firstAllowed = String(allowed[0] ?? "").trim();
    if (firstAllowed) return storageTenantId(region, firstAllowed);
  }
  return fallbackTenantId;
};

const buildBasicAuth = (user: string, pass: string) => btoa(`${user}:${pass}`);

/** Cap concurrent Worker→Traccar HTTP (Traccar has no API rate limit; overload stalls Jetty). */
const traccarRouteCache = new Map<string, { at: number; body: any[] }>();

/** Bucketed thinning that keeps first/last and each bucket's min/max fuel-like reading. */
function thinRoutePointsServer(points: any[], maxPoints: number): any[] {
  if (points.length <= maxPoints) return points;
  const fuelOf = (point: any): number => {
    const attrs = point?.attributes ?? {};
    for (const key of ["fuel", "fuelLevel", "io6", "io87", "io89"]) {
      const value = Number(attrs[key]);
      if (Number.isFinite(value)) return value;
    }
    return Number.NaN;
  };
  const bucketCount = Math.max(2, Math.floor(maxPoints / 3));
  const bucketSize = Math.ceil(points.length / bucketCount);
  const kept = new Set<number>([0, points.length - 1]);
  for (let start = 0; start < points.length; start += bucketSize) {
    const end = Math.min(points.length, start + bucketSize);
    let minIdx = -1;
    let maxIdx = -1;
    let minFuel = Infinity;
    let maxFuel = -Infinity;
    for (let i = start; i < end; i += 1) {
      const fuel = fuelOf(points[i]);
      if (!Number.isFinite(fuel)) continue;
      if (fuel < minFuel) { minFuel = fuel; minIdx = i; }
      if (fuel > maxFuel) { maxFuel = fuel; maxIdx = i; }
    }
    kept.add(start);
    if (minIdx >= 0) kept.add(minIdx);
    if (maxIdx >= 0) kept.add(maxIdx);
  }
  return [...kept].sort((a, b) => a - b).map((i) => points[i]);
}

type TraccarSlotPool = {
  max: number;
  inflight: number;
  waiters: Array<() => void>;
  queueTimeoutMs: number;
};

// Slow report calls get their own pool so they cannot starve normal reads/writes.
const traccarSlotPools: Record<"default" | "reports", TraccarSlotPool> = {
  default: { max: 6, inflight: 0, waiters: [], queueTimeoutMs: 20_000 },
  reports: { max: 4, inflight: 0, waiters: [], queueTimeoutMs: 30_000 }
};

const traccarPoolFor = (pathnameWithQuery: string): TraccarSlotPool =>
  /\/reports\//i.test(pathnameWithQuery) ? traccarSlotPools.reports : traccarSlotPools.default;

async function acquireTraccarFetchSlot(pool: TraccarSlotPool) {
  if (pool.inflight < pool.max) {
    pool.inflight += 1;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = pool.waiters.indexOf(wake);
      if (idx >= 0) pool.waiters.splice(idx, 1);
      reject(new Error("Traccar request queue timed out"));
    }, pool.queueTimeoutMs);
    const wake = () => {
      clearTimeout(timer);
      resolve();
    };
    pool.waiters.push(wake);
  });
  pool.inflight += 1;
}

function releaseTraccarFetchSlot(pool: TraccarSlotPool) {
  pool.inflight = Math.max(0, pool.inflight - 1);
  const next = pool.waiters.shift();
  if (next) next();
}

/** Short TTL for GET /devices?all=true — avoids N× full-fleet scans under Assets refreshLive. */
const TRACCAR_DEVICES_ALL_CACHE_TTL_MS = 15_000;
let traccarDevicesAllCache: { at: number; body: any } | null = null;
/** Sticky Traccar auth — avoid probing a stale password on every compile PUT. */
let traccarPreferredAuthHeader: string | null = null;

const isDevicesAllQuery = (pathnameWithQuery: string) => {
  const path = String(pathnameWithQuery ?? "").split("?")[0]?.replace(/\/+$/, "") ?? "";
  if (!/\/api\/devices$/i.test(path) && path !== "/devices") return false;
  const q = String(pathnameWithQuery ?? "").includes("?")
    ? new URLSearchParams(String(pathnameWithQuery).slice(String(pathnameWithQuery).indexOf("?") + 1))
    : new URLSearchParams();
  // Cache only unfiltered / all=true fleet lists.
  if (q.has("id") || q.has("uniqueId") || q.has("userId") || q.has("groupId")) return false;
  return !q.has("all") || q.get("all") === "true";
};

async function traccarFetch(env: Env, pathnameWithQuery: string, init: RequestInit = {}) {
  // Accept both "https://host" and "https://host/api" style base URLs.
  const base = String(env.TRACCAR_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/api$/i, "");
  if (!base) return { ok: false as const, status: 503, body: { error: "Traccar not configured" } };

  const method = String(init.method ?? "GET").toUpperCase();
  if (method === "GET" && isDevicesAllQuery(pathnameWithQuery) && traccarDevicesAllCache) {
    if (Date.now() - traccarDevicesAllCache.at < TRACCAR_DEVICES_ALL_CACHE_TTL_MS) {
      return { ok: true as const, status: 200, body: traccarDevicesAllCache.body };
    }
  }

  const pool = traccarPoolFor(pathnameWithQuery);
  let acquired = false;
  try {
    await acquireTraccarFetchSlot(pool);
    acquired = true;
    return await traccarFetchUnlocked(env, pathnameWithQuery, init, base);
  } catch (err: any) {
    return {
      ok: false as const,
      status: 502,
      body: {
        error: "Traccar request failed",
        message: String(err?.message ?? err ?? "")
      }
    };
  } finally {
    if (acquired) releaseTraccarFetchSlot(pool);
  }
}

async function traccarFetchUnlocked(
  env: Env,
  pathnameWithQuery: string,
  init: RequestInit,
  base: string
) {
  const token = String(env.TRACCAR_TOKEN ?? "").trim();
  const user = String(env.TRACCAR_USERNAME ?? "").trim();
  const pass = String(env.TRACCAR_PASSWORD ?? "").trim();

  const authHeaderCandidates: string[] = [];
  // Prefer token when present — TRACCAR_PASSWORD is often stale while the token works.
  // On 401/403, try the next scheme. Cache the first success for this isolate.
  if (token) {
    authHeaderCandidates.push(`Basic ${buildBasicAuth(user || "admin", token)}`);
    authHeaderCandidates.push(`Bearer ${token}`);
  }
  if (user && pass) {
    authHeaderCandidates.push(`Basic ${buildBasicAuth(user, pass)}`);
  } else if (pass && !user) {
    authHeaderCandidates.push(`Basic ${buildBasicAuth("admin", pass)}`);
  }
  const uniqueAuth = Array.from(new Set(authHeaderCandidates.filter(Boolean)));
  if (traccarPreferredAuthHeader && uniqueAuth.includes(traccarPreferredAuthHeader)) {
    uniqueAuth.splice(uniqueAuth.indexOf(traccarPreferredAuthHeader), 1);
    uniqueAuth.unshift(traccarPreferredAuthHeader);
  }
  if (!uniqueAuth.length) {
    return {
      ok: false as const,
      status: 503,
      body: { error: "Traccar auth not configured", hint: "Set TRACCAR_TOKEN or TRACCAR_USERNAME/TRACCAR_PASSWORD" }
    };
  }

  // Workers cannot fetch bare IPs (platform 403). Prefer hostname bases.
  // When the configured host is still an IP, attempt cf.resolveOverride via an
  // in-zone style hostname — operators should set TRACCAR_BASE_URL to a DNS name.
  const baseUrl = new URL(base.includes("://") ? base : `http://${base}`);
  const hostIsIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(baseUrl.hostname);
  const requestOrigin = hostIsIp ? `${baseUrl.protocol}//traccar.vivi.internal` : baseUrl.origin;
  const resolveOverride = hostIsIp ? baseUrl.hostname : "";
  const urlPath = `${pathnameWithQuery.startsWith("/") ? "" : "/"}${pathnameWithQuery}`;
  const url = `${requestOrigin}${urlPath}`;

  const method = String(init.method ?? "GET").toUpperCase();
  const rawBody = typeof init.body === "string" ? init.body : undefined;
  const sanitizedBody = sanitizeTraccarComputedAttributeRequestBody(pathnameWithQuery, method, rawBody);
  const forwardInit =
    sanitizedBody !== undefined && sanitizedBody !== rawBody
      ? { ...init, body: sanitizedBody }
      : init;

  // Route/trip/summary reports can exceed the default budget on busy fleets; keep live reads snappy.
  const reportTimeoutMs = /\/reports\//i.test(pathnameWithQuery) ? 60_000 : 12_000;

  const buildFetchInit = (authorization: string): RequestInit => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: authorization,
      ...(init.headers as any)
    };
    if (hostIsIp) headers.Host = baseUrl.hostname;
    const next: RequestInit & { cf?: Record<string, unknown> } = {
      ...forwardInit,
      headers,
      signal: AbortSignal.timeout(reportTimeoutMs)
    };
    if (resolveOverride) next.cf = { ...(next.cf ?? {}), resolveOverride };
    return next;
  };

  let lastFailure: { ok: false; status: number; body: any } | null = null;
  for (const authorization of uniqueAuth) {
    try {
      const resp = await fetch(url, buildFetchInit(authorization));
      const text = await resp.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (resp.ok) {
        traccarPreferredAuthHeader = authorization;
        if (method === "GET" && isDevicesAllQuery(pathnameWithQuery) && Array.isArray(body)) {
          traccarDevicesAllCache = { at: Date.now(), body };
        }
        return { ok: true as const, status: resp.status, body };
      }
      if (resp.status === 401 || resp.status === 403) {
        if (traccarPreferredAuthHeader === authorization) traccarPreferredAuthHeader = null;
      }
      lastFailure = { ok: false, status: resp.status, body };
      if (resp.status !== 401 && resp.status !== 403) break;
    } catch (err: any) {
      const message = String(err?.message ?? err);
      const timedOut = /abort|timeout/i.test(message);
      return {
        ok: false as const,
        status: timedOut ? 504 : 502,
        body: {
          error: timedOut ? "Traccar request timed out" : "Traccar request failed",
          message,
          base,
          resolveOverride: resolveOverride || undefined
        }
      };
    }
  }

  // Fallback: direct IP URL if hostname override failed.
  if (lastFailure && hostIsIp) {
    const directUrl = `${baseUrl.origin}${urlPath}`;
    for (const authorization of uniqueAuth) {
      try {
        const resp = await fetch(directUrl, {
          ...forwardInit,
          headers: {
            Accept: "application/json",
            Authorization: authorization,
            ...(init.headers as any)
          },
          signal: AbortSignal.timeout(reportTimeoutMs)
        });
        const text = await resp.text();
        let body: any = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = text;
        }
        if (resp.ok) {
          traccarPreferredAuthHeader = authorization;
          if (method === "GET" && isDevicesAllQuery(pathnameWithQuery) && Array.isArray(body)) {
            traccarDevicesAllCache = { at: Date.now(), body };
          }
          return { ok: true as const, status: resp.status, body };
        }
        if (resp.status === 401 || resp.status === 403) {
          if (traccarPreferredAuthHeader === authorization) traccarPreferredAuthHeader = null;
        }
        lastFailure = { ok: false, status: resp.status, body };
        if (resp.status !== 401 && resp.status !== 403) break;
      } catch (err: any) {
        const message = String(err?.message ?? err);
        const timedOut = /abort|timeout/i.test(message);
        return {
          ok: false as const,
          status: timedOut ? 504 : 502,
          body: {
            error: timedOut ? "Traccar request timed out" : "Traccar request failed",
            message,
            base,
            direct: true
          }
        };
      }
    }
  }

  return lastFailure ?? { ok: false as const, status: 502, body: { error: "Traccar request failed" } };
}

type NotificationSyncJobRow = {
  job_id: string;
  tenant_id: string;
  binding_id: string;
  operation: string;
  payload: string;
};

const buildTraccarNotificationPayload = (bindingId: string, payload: Record<string, unknown>) => {
  const description = String(payload.description ?? payload.name ?? bindingId).trim() || bindingId;
  const eventId = String(payload.eventId ?? "").trim();
  const availability = String(payload.availability ?? "").trim();
  const libraryType = String(payload.type ?? "").trim();
  const parameters = payload.parameters && typeof payload.parameters === "object" ? payload.parameters : {};
  const conditions = Array.isArray((parameters as any).conditions) ? (parameters as any).conditions : [];
  const normalizeKey = (value: string) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const resolveType = () => {
    const mapped: Record<string, string> = {
      "status online": "deviceOnline",
      "status offline": "deviceOffline",
      "device inactive": "deviceUnknown",
      "device moving": "deviceMoving",
      "ignition on": "ignitionOn",
      "ignition off": "ignitionOff",
      "speed limit exceeded": "deviceOverspeed",
      "geofence entered": "geofenceEnter",
      "geofence exited": "geofenceExit"
    };
    return mapped[normalizeKey(description)] ?? "alarm";
  };
  const buildExpression = () => {
    const parts = conditions
      .map((row: any) => {
        const field = String(row?.field ?? "").trim();
        const operator = String(row?.operator ?? "").trim();
        const value = String(row?.value ?? "").trim();
        if (!field || !operator) return null;
        const fieldExpr = field.toLowerCase() === "speed" ? "speed" : `attributes.${field.replace(/[^a-zA-Z0-9]+/g, "_")}`;
        const formatted = /^-?\d+(\.\d+)?$/.test(value) ? value : JSON.stringify(value);
        let expr = "";
        if (operator === "is" || operator === "=") expr = `${fieldExpr} == ${formatted}`;
        else if (operator === "is not") expr = `${fieldExpr} != ${formatted}`;
        else if (operator === "<") expr = `${fieldExpr} < ${formatted}`;
        else if (operator === "<=") expr = `${fieldExpr} <= ${formatted}`;
        else if (operator === ">") expr = `${fieldExpr} > ${formatted}`;
        else if (operator === ">=") expr = `${fieldExpr} >= ${formatted}`;
        if (!expr) return null;
        const joinRaw = String(row?.join ?? "and").trim().toLowerCase();
        return { expr, join: joinRaw === "or" || joinRaw === "||" ? "||" : "&&" };
      })
      .filter(Boolean) as Array<{ expr: string; join: "&&" | "||" }>;
    if (!parts.length) return "false";
    if (parts.length === 1) return parts[0].expr;
    let combined = parts[0].expr;
    for (let index = 1; index < parts.length; index += 1) {
      combined = `${combined} ${parts[index - 1].join} ${parts[index].expr}`;
    }
    return combined;
  };

  return {
    type: resolveType(),
    description,
    always: false,
    notificators: "",
    commandId: 0,
    calendarId: 0,
    attributes: {
      viviLibraryId: bindingId,
      viviBindingId: bindingId,
      viviSource: "notification-library",
      ...(eventId ? { viviEventId: eventId } : {}),
      ...(libraryType ? { viviType: libraryType } : {}),
      ...(availability ? { viviAvailability: availability } : {}),
      viviConfig: JSON.stringify({
        description,
        eventId,
        type: libraryType,
        availability,
        notificationVideo: payload.notificationVideo ?? null,
        parameters
      }),
      viviConditions: JSON.stringify(conditions),
      viviComputedExpression: buildExpression()
    }
  };
};

const buildTraccarComputedAttributePayload = (bindingId: string, payload: Record<string, unknown>) => {
  const shared = buildTraccarComputedAttributePayloadShared(bindingId, payload);
  return shared;
};

const readViviLibraryId = (item: any) => readViviLibraryIdFromComputedItem(item);

async function syncComputedAttributeJobToTraccar(
  env: Env,
  bindingId: string,
  operation: string,
  payload: Record<string, unknown>
) {
  const listResp = await traccarFetch(env, "/api/attributes/computed");
  if (!listResp.ok) {
    const msg = String((listResp.body as any)?.message ?? (listResp.body as any)?.error ?? `GET /api/attributes/computed ${listResp.status}`);
    throw new Error(msg);
  }

  const items = Array.isArray(listResp.body) ? listResp.body : [];
  const computedPayload = buildTraccarComputedAttributePayload(bindingId, payload);
  const existing =
    items.find((item: any) => readViviLibraryId(item) === bindingId) ??
    items.find((item: any) => String(item?.attribute ?? "").trim() === computedPayload.attribute) ??
    null;
  const traccarId = Number((existing as any)?.id ?? 0);

  if (operation === "delete") {
    if (Number.isFinite(traccarId) && traccarId > 0) {
      const delResp = await traccarFetch(env, `/api/attributes/computed/${traccarId}`, { method: "DELETE" });
      if (!delResp.ok && delResp.status !== 404) {
        const msg = String((delResp.body as any)?.message ?? (delResp.body as any)?.error ?? `DELETE /api/attributes/computed/${traccarId} ${delResp.status}`);
        throw new Error(msg);
      }
    }
    return;
  }

  const availability = String(payload.availability ?? "").trim().toLowerCase();
  if (availability && availability !== "available") {
    if (Number.isFinite(traccarId) && traccarId > 0) {
      const delResp = await traccarFetch(env, `/api/attributes/computed/${traccarId}`, { method: "DELETE" });
      if (!delResp.ok && delResp.status !== 404) {
        const msg = String((delResp.body as any)?.message ?? (delResp.body as any)?.error ?? `DELETE /api/attributes/computed/${traccarId} ${delResp.status}`);
        throw new Error(msg);
      }
    }
    return;
  }

  if (Number.isFinite(traccarId) && traccarId > 0) {
    const putResp = await traccarFetch(env, `/api/attributes/computed/${traccarId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" } as any,
      body: JSON.stringify(toTraccarComputedAttributeApiBody({ ...computedPayload, id: traccarId }))
    });
    if (!putResp.ok) {
      const msg = String((putResp.body as any)?.message ?? (putResp.body as any)?.error ?? `PUT /api/attributes/computed/${traccarId} ${putResp.status}`);
      throw new Error(msg);
    }
    return;
  }

  const postResp = await traccarFetch(env, "/api/attributes/computed", {
    method: "POST",
    headers: { "Content-Type": "application/json" } as any,
    body: JSON.stringify(toTraccarComputedAttributeApiBody(computedPayload))
  });
  if (!postResp.ok) {
    const msg = String((postResp.body as any)?.message ?? (postResp.body as any)?.error ?? `POST /api/attributes/computed ${postResp.status}`);
    throw new Error(msg);
  }
}

async function syncNotificationJobToTraccar(
  env: Env,
  bindingId: string,
  operation: string,
  payload: Record<string, unknown>
) {
  if (Boolean((payload as any).libraryTemplate)) return;
  if (Array.isArray((payload as any).monitoredEvents) && (payload as any).monitoredEvents.length) {
    // Scoped notification bindings are synced from the frontend using config groups and site assets.
    return;
  }

  const listResp = await traccarFetch(env, "/api/notifications");
  if (!listResp.ok) {
    const msg = String((listResp.body as any)?.message ?? (listResp.body as any)?.error ?? `GET /api/notifications ${listResp.status}`);
    throw new Error(msg);
  }

  const items = Array.isArray(listResp.body) ? listResp.body : [];
  const existing = items.find((item: any) => readViviLibraryId(item) === bindingId);
  const traccarId = Number((existing as any)?.id ?? 0);

  if (operation === "delete") {
    if (Number.isFinite(traccarId) && traccarId > 0) {
      const delResp = await traccarFetch(env, `/api/notifications/${traccarId}`, { method: "DELETE" });
      if (!delResp.ok && delResp.status !== 404) {
        const msg = String((delResp.body as any)?.message ?? (delResp.body as any)?.error ?? `DELETE /api/notifications/${traccarId} ${delResp.status}`);
        throw new Error(msg);
      }
    }
    await syncComputedAttributeJobToTraccar(env, bindingId, "delete", payload);
    return;
  }

  const availability = String(payload.availability ?? "").trim().toLowerCase();
  if (availability && availability !== "available") {
    if (Number.isFinite(traccarId) && traccarId > 0) {
      const delResp = await traccarFetch(env, `/api/notifications/${traccarId}`, { method: "DELETE" });
      if (!delResp.ok && delResp.status !== 404) {
        const msg = String((delResp.body as any)?.message ?? (delResp.body as any)?.error ?? `DELETE /api/notifications/${traccarId} ${delResp.status}`);
        throw new Error(msg);
      }
    }
    await syncComputedAttributeJobToTraccar(env, bindingId, "delete", payload);
    return;
  }

  const traccarPayload = buildTraccarNotificationPayload(bindingId, payload);
  if (Number.isFinite(traccarId) && traccarId > 0) {
    const putResp = await traccarFetch(env, `/api/notifications/${traccarId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" } as any,
      body: JSON.stringify({ ...(existing as any), ...traccarPayload })
    });
    if (!putResp.ok) {
      const msg = String((putResp.body as any)?.message ?? (putResp.body as any)?.error ?? `PUT /api/notifications/${traccarId} ${putResp.status}`);
      throw new Error(msg);
    }
  } else {
  const postResp = await traccarFetch(env, "/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" } as any,
    body: JSON.stringify(traccarPayload)
  });
  if (!postResp.ok) {
    const msg = String((postResp.body as any)?.message ?? (postResp.body as any)?.error ?? `POST /api/notifications ${postResp.status}`);
    throw new Error(msg);
  }
  }

  await syncComputedAttributeJobToTraccar(env, bindingId, operation, payload);
}

async function processNotificationSyncJobs(env: Env, options?: { limit?: number; includeFailed?: boolean }) {
  await ensureD1Tables(env);
  const limit = Math.max(1, Math.min(100, Number(options?.limit ?? 25)));
  const includeFailed = Boolean(options?.includeFailed);
  const statuses = includeFailed ? ["pending", "failed"] : ["pending"];
  const statusList = statuses.map((s) => `'${s}'`).join(", ");
  const rowsResult = await env.VIVI_D1.prepare(
    `SELECT job_id, tenant_id, binding_id, operation, payload FROM notification_sync_jobs WHERE status IN (${statusList}) ORDER BY created_at ASC LIMIT ?1`
  )
    .bind(limit)
    .all();

  const rows = (rowsResult.results ?? []) as NotificationSyncJobRow[];
  let processed = 0;
  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    const jobTenantId = String(row.tenant_id ?? "").trim();
    if (jobTenantId && !isTraccarStorageTenant(jobTenantId)) {
      const at = new Date().toISOString();
      await env.VIVI_D1.prepare(
        "UPDATE notification_sync_jobs SET status = 'synced', error = ?1, last_attempt_at = ?2, updated_at = ?2 WHERE job_id = ?3 AND tenant_id = ?4"
      )
        .bind("skipped: non-traccar region", at, String(row.job_id ?? ""), jobTenantId)
        .run();
      processed += 1;
      synced += 1;
      continue;
    }
    processed += 1;
    const now = new Date().toISOString();
    await env.VIVI_D1.prepare(
      "UPDATE notification_sync_jobs SET status = 'processing', last_attempt_at = ?1, updated_at = ?1 WHERE job_id = ?2 AND tenant_id = ?3"
    )
      .bind(now, String(row.job_id ?? ""), String(row.tenant_id ?? ""))
      .run();

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(String(row.payload ?? "{}"));
    } catch {
      payload = {};
    }

    try {
      await syncNotificationJobToTraccar(env, String(row.binding_id ?? ""), String(row.operation ?? "").toLowerCase(), payload);
      const at = new Date().toISOString();
      await env.VIVI_D1.prepare(
        "UPDATE notification_sync_jobs SET status = 'synced', error = '', last_attempt_at = ?1, updated_at = ?1 WHERE job_id = ?2 AND tenant_id = ?3"
      )
        .bind(at, String(row.job_id ?? ""), String(row.tenant_id ?? ""))
        .run();
      synced += 1;
    } catch (err: any) {
      const at = new Date().toISOString();
      const errorText = String(err?.message ?? err ?? "Unknown sync error").slice(0, 1000);
      await env.VIVI_D1.prepare(
        "UPDATE notification_sync_jobs SET status = 'failed', error = ?1, last_attempt_at = ?2, updated_at = ?2 WHERE job_id = ?3 AND tenant_id = ?4"
      )
        .bind(errorText, at, String(row.job_id ?? ""), String(row.tenant_id ?? ""))
        .run();
      failed += 1;
    }
  }

  return { processed, synced, failed, remainingHint: Math.max(0, rows.length - processed) };
}

type DeviceSyncJobRow = {
  job_id?: unknown;
  tenant_id?: unknown;
  asset_id?: unknown;
  operation?: unknown;
  payload?: unknown;
  status?: unknown;
  error?: unknown;
  attempts?: unknown;
  available_at?: unknown;
  last_attempt_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

const DEVICE_SYNC_MAX_ATTEMPTS = 5;
/** Stale "processing" jobs (Worker killed / subrequest limit) must be retried. */
const DEVICE_SYNC_STALE_PROCESSING_MS = 2 * 60 * 1000;

function buildDeviceSyncBackoffIso(attempt: number) {
  const delayMs = Math.min(300_000, Math.max(5_000, 5_000 * 2 ** Math.max(0, attempt - 1)));
  return new Date(Date.now() + delayMs).toISOString();
}

function buildDeviceSyncJobId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function recoverStaleDeviceSyncJobs(env: Env) {
  await ensureD1Tables(env);
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - DEVICE_SYNC_STALE_PROCESSING_MS).toISOString();
  const result = await env.VIVI_D1.prepare(
    `UPDATE device_sync_jobs
     SET status = 'retry',
         available_at = ?1,
         error = CASE
           WHEN error IS NULL OR TRIM(error) = '' THEN 'Recovered from stale processing'
           ELSE error
         END,
         updated_at = ?1
     WHERE status = 'processing'
       AND COALESCE(last_attempt_at, updated_at, created_at, '') <= ?2`
  )
    .bind(now, staleBefore)
    .run();
  return Number((result as any)?.meta?.changes ?? 0) || 0;
}

async function enqueueTraccarDeviceSyncJob(
  env: Env,
  tenantId: string,
  assetId: string,
  asset: Record<string, unknown>,
  operation = "upsert"
) {
  await ensureD1Tables(env);
  const now = new Date().toISOString();
  const jobId = buildDeviceSyncJobId();
  await env.VIVI_D1.prepare(
    "INSERT INTO device_sync_jobs (job_id, tenant_id, asset_id, operation, payload, status, error, attempts, available_at, last_attempt_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"
  )
    .bind(jobId, tenantId, assetId, operation, JSON.stringify(asset), "pending", "", 0, now, "", now, now)
    .run();
  if (env.TASK_QUEUE) {
    try {
      await env.TASK_QUEUE.send({ type: "device-sync", tenantId, jobId, at: now });
    } catch {
      // Keep the canonical asset write available even if queue notification fails.
    }
  }
  return { jobId, queuedAt: now };
}

// Ensure a Traccar device exists for the given asset. Creates it if absent, updates name/model if present.
// Non-blocking: returns sync status metadata and never throws.
// Ensure a Traccar device exists for the given asset. Creates it if absent, updates name/model if present.
// Non-blocking: returns sync status metadata and never throws.
async function ensureTraccarGroupIdByName(env: Env, siteName: string): Promise<number | undefined> {
  const name = String(siteName ?? "").trim();
  if (!name) return undefined;
  const matchGroupId = (groupsBody: unknown): number | undefined => {
    if (!Array.isArray(groupsBody)) return undefined;
    const matched = (groupsBody as any[]).find(
      (row) => String(row?.name ?? "").trim().toLowerCase() === name.toLowerCase()
    );
    const candidate = Number(matched?.id ?? 0);
    return Number.isFinite(candidate) && candidate > 0 ? Math.trunc(candidate) : undefined;
  };

  const listed = await traccarFetch(env, "/api/groups");
  if (listed.ok) {
    const existing = matchGroupId(listed.body);
    if (existing) return existing;
  }

  const created = await traccarFetch(env, "/api/groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, attributes: {} })
  });
  if (created.ok) {
    const parsed = Number((created.body as any)?.id ?? 0);
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
  }

  const retry = await traccarFetch(env, "/api/groups");
  if (retry.ok) return matchGroupId(retry.body);
  return undefined;
}

async function decommissionDeviceForTenant(
  env: Env,
  tenantId: string,
  opts: { assetId?: string; imei?: string }
): Promise<
  | {
      ok: true;
      asset: Record<string, unknown>;
      traccar: { removed: boolean; skipped?: boolean; error?: string };
      purged: Awaited<ReturnType<typeof purgeD1OperationalDeviceTraces>>;
      traccarDeleteQueued?: boolean;
    }
  | { ok: false; status: number; message: string }
> {
  const requestedAssetId = normalizeId(opts.assetId);
  const requestedImei = String(opts.imei ?? "").trim();
  let asset: Record<string, unknown> | null = null;
  let resolvedAssetId = requestedAssetId;

  if (requestedAssetId) {
    asset = (await readEntityById(env, "assets", tenantId, requestedAssetId)) as Record<string, unknown> | null;
  }
  if (!asset && requestedImei) {
    const matches = (await findAssetsByImei(env, tenantId, requestedImei)) as unknown as Record<string, unknown>[];
    asset = pickBestAssetForImei(matches);
    resolvedAssetId = normalizeId((asset as any)?.id ?? (asset as any)?.registration ?? (asset as any)?.imei);
  }
  if (!asset) {
    return { ok: false, status: 404, message: "Asset not found for decommission." };
  }

  const imei = requestedImei || String((asset as any).imei ?? "").trim();
  if (!imei) {
    return { ok: false, status: 400, message: "This asset has no IMEI to decommission." };
  }
  if (!resolvedAssetId) {
    resolvedAssetId = normalizeId((asset as any).id ?? (asset as any).registration ?? imei);
  }
  if (!resolvedAssetId) {
    return { ok: false, status: 400, message: "Asset id could not be resolved." };
  }

  try {
    const completed = await completeDeviceDecommission({
      asset,
      assetId: resolvedAssetId,
      imei,
      removeTraccarDevice: (needle) =>
        deleteTraccarDeviceByImei((path, init) => traccarFetch(env, path, init as RequestInit), needle),
      purgeOperationalTraces: (needle, assetKey, cameraSerial) =>
        purgeD1OperationalDeviceTraces(
          env.VIVI_D1,
          tenantId,
          needle,
          assetKey,
          cameraSerial ? [cameraSerial] : []
        ),
      persistDecommissionedAsset: async (assetKey, nextAsset) => {
        const saved = await upsertEntity(env, "assets", tenantId, nextAsset);
        if (!saved.ok) {
          throw new Error(saved.message ?? "Failed to save asset after decommission.");
        }
        await invalidateAssetsListCache(env, tenantId);
        const stored = (await readEntityById(env, "assets", tenantId, assetKey)) as Record<string, unknown> | null;
        return stored ?? nextAsset;
      }
    });

    let traccarDeleteQueued = false;
    if (!completed.traccar.removed && !completed.traccar.skipped) {
      try {
        await enqueueTraccarDeviceSyncJob(
          env,
          tenantId,
          resolvedAssetId,
          { id: resolvedAssetId, imei },
          "delete"
        );
        traccarDeleteQueued = true;
      } catch {
        traccarDeleteQueued = false;
      }
    }

    return {
      ok: true,
      asset: completed.asset,
      traccar: completed.traccar,
      purged: completed.purged,
      traccarDeleteQueued
    };
  } catch (err: any) {
    return { ok: false, status: 500, message: String(err?.message ?? err ?? "Device decommission failed.") };
  }
}

async function syncDeviceJobToTraccar(
  env: Env,
  asset: Record<string, unknown>,
  tenantId = ""
): Promise<{ synced: boolean; traccarDeviceId?: string; traccarError?: string }> {
  const imei = String((asset as any).imei ?? "").trim();
  if (!imei) return { synced: false, traccarError: "No IMEI on asset" };
  const base = String(env.TRACCAR_BASE_URL ?? "").trim();
  if (!base) return { synced: false, traccarError: "Traccar not configured" };
  // Traccar mapping: model -> Organisation, contact -> Dealer, phone -> Database, groupId -> Site.
  const registration = String((asset as any).registration ?? "").trim();
  const assetDescription = String((asset as any).assetDescription ?? "").trim();
  const deviceName = registration || assetDescription || imei;
  const hierarchy = resolveViviHierarchyFromAsset(asset);
  // Never push configuration / site group names into Phone.
  if (looksLikeMisplacedDatabaseLabel(hierarchy.database)) {
    hierarchy.database = "";
  }
  if (!hierarchy.database && isSharedDemoDatabaseTenant(tenantId) && hierarchy.site) {
    hierarchy.database = hierarchy.site;
  }
  const traccarHierarchy = buildTraccarDeviceHierarchyFields(hierarchy);
  const site = hierarchy.site;

  let groupId: number | undefined;
  const scopedTenantId = String(tenantId ?? "").trim();
  if (site && scopedTenantId) {
    try {
      const hierarchyRoot = await readHierarchy(env, scopedTenantId);
      const found = findSiteByNameInHierarchy(hierarchyRoot, site, hierarchy.database);
      if (found) {
        const ensured = await ensureTraccarGroupForSite(env, scopedTenantId, found.site, {
          hierarchy: hierarchyRoot
        });
        if (ensured.groupId) groupId = ensured.groupId;
      }
    } catch {
      // Fall through to name-based group ensure below.
    }
  }
  // Always ensure the Traccar group exists for the asset site (e.g. WJL), even if hierarchy KV is incomplete.
  if (!groupId && site) {
    try {
      groupId = await ensureTraccarGroupIdByName(env, site);
    } catch (err: any) {
      return { synced: false, traccarError: `Traccar group "${site}": ${String(err?.message ?? err)}` };
    }
    if (!groupId) {
      return { synced: false, traccarError: `Unable to create or find Traccar group for site "${site}"` };
    }
  }

  try {
    const existingResp = await traccarFetch(env, `/api/devices?uniqueId=${encodeURIComponent(imei)}`);
    let existingList = existingResp.ok && Array.isArray(existingResp.body)
      ? (existingResp.body as Record<string, unknown>[])
      : [];
    if (!existingList.length && existingResp.ok === false) {
      // Fall back to full list scan when uniqueId filter fails upstream.
      const allResp = await traccarFetch(env, "/api/devices?all=true");
      if (allResp.ok && Array.isArray(allResp.body)) {
        existingList = (allResp.body as Record<string, unknown>[]).filter(
          (row) => String((row as any)?.uniqueId ?? "").trim() === imei
        );
      }
    }

    const writeDevice = async (existing: Record<string, unknown> | null) => {
      if (existing) {
        const traccarId = Number((existing as any).id ?? 0);
        if (!(traccarId > 0)) return { synced: false as const, traccarError: "Invalid Traccar device id" };
        const updated = {
          ...existing,
          name: deviceName,
          uniqueId: imei,
          disabled: Boolean((existing as any).disabled),
          ...traccarHierarchy,
          ...(groupId ? { groupId } : {}),
          attributes:
            (existing as any).attributes && typeof (existing as any).attributes === "object"
              ? (existing as any).attributes
              : {}
        };
        const updateResp = await traccarFetch(env, `/api/devices/${traccarId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" } as any,
          body: JSON.stringify(updated)
        });
        if (updateResp.ok) return { synced: true as const, traccarDeviceId: String(traccarId) };
        return {
          synced: false as const,
          traccarError: String((updateResp.body as any)?.message ?? `PUT ${updateResp.status}`)
        };
      }

      const newDevice: Record<string, unknown> = {
        name: deviceName,
        uniqueId: imei,
        ...traccarHierarchy,
        ...(groupId ? { groupId } : {}),
        attributes: {}
      };
      const createResp = await traccarFetch(env, "/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" } as any,
        body: JSON.stringify(newDevice)
      });
      if (createResp.ok && (createResp.body as any)?.id) {
        return { synced: true as const, traccarDeviceId: String((createResp.body as any).id) };
      }

      // Duplicate uniqueId — look up again and update into the target group.
      const duplicateHint = String(
        (createResp.body as any)?.message ?? (createResp.body as any)?.error ?? ""
      ).toLowerCase();
      if (createResp.status === 400 || duplicateHint.includes("unique") || duplicateHint.includes("duplicate")) {
        const again = await traccarFetch(env, `/api/devices?uniqueId=${encodeURIComponent(imei)}`);
        const againList = again.ok && Array.isArray(again.body) ? (again.body as Record<string, unknown>[]) : [];
        if (againList[0]) return writeDevice(againList[0]);
      }

      return {
        synced: false as const,
        traccarError: String(
          (createResp.body as any)?.message ??
            (createResp.body as any)?.error ??
            `POST /api/devices ${createResp.status}`
        )
      };
    };

    return await writeDevice(existingList[0] ?? null);
  } catch (err: any) {
    return { synced: false, traccarError: String(err?.message ?? err) };
  }
}

async function processDeviceSyncJobs(env: Env, options?: { limit?: number; includeFailed?: boolean }) {
  await ensureD1Tables(env);
  const recovered = await recoverStaleDeviceSyncJobs(env);
  // Keep batches tiny — each job can issue several Traccar subrequests and CF kills the isolate.
  const limit = Math.max(1, Math.min(4, Number(options?.limit ?? 3)));
  const includeFailed = Boolean(options?.includeFailed);
  const statuses = includeFailed ? ["pending", "retry", "failed"] : ["pending", "retry"];
  const statusList = statuses.map((s) => `'${s}'`).join(", ");
  const now = new Date().toISOString();
  const rowsResult = await env.VIVI_D1.prepare(
    `SELECT job_id, tenant_id, asset_id, operation, payload, status, error, attempts, available_at, last_attempt_at, created_at, updated_at FROM device_sync_jobs WHERE status IN (${statusList}) AND COALESCE(available_at, created_at, '') <= ?1 ORDER BY created_at ASC LIMIT ?2`
  )
    .bind(now, limit)
    .all();

  const rows = (rowsResult.results ?? []) as DeviceSyncJobRow[];
  let processed = 0;
  let synced = 0;
  let failed = 0;
  let retried = 0;
  let stoppedEarly = false;

  for (const row of rows) {
    const jobTenantId = String(row.tenant_id ?? "").trim();
    if (jobTenantId && !isTraccarStorageTenant(jobTenantId)) {
      await env.VIVI_D1.prepare(
        "UPDATE device_sync_jobs SET status = 'done', error = ?1, updated_at = ?2 WHERE job_id = ?3 AND tenant_id = ?4"
      )
        .bind("skipped: non-traccar region", new Date().toISOString(), String(row.job_id ?? ""), jobTenantId)
        .run();
      processed += 1;
      continue;
    }
    processed += 1;
    const attemptNumber = Math.max(0, Number(row.attempts ?? 0)) + 1;
    const processingAt = new Date().toISOString();
    await env.VIVI_D1.prepare(
      "UPDATE device_sync_jobs SET status = 'processing', attempts = ?1, last_attempt_at = ?2, updated_at = ?2 WHERE job_id = ?3 AND tenant_id = ?4"
    )
      .bind(attemptNumber, processingAt, String(row.job_id ?? ""), String(row.tenant_id ?? ""))
      .run();

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(String(row.payload ?? "{}"));
    } catch {
      payload = {};
    }

    try {
      const operation = String(row.operation ?? "").trim().toLowerCase();
      if (operation === "delete") {
        const imei = String((payload as any).imei ?? "").trim();
        if (!imei) throw new Error("Device delete job missing imei");
        const deleted = await deleteTraccarDeviceByImei(
          (path, init) => traccarFetch(env, path, init as RequestInit),
          imei
        );
        if (!deleted.removed && !deleted.skipped) {
          throw new Error(String(deleted.error ?? "Traccar device delete failed"));
        }
      } else {
        const result = await syncDeviceJobToTraccar(env, payload, String(row.tenant_id ?? ""));
        if (!result.synced) {
          throw new Error(String(result.traccarError ?? "Unknown Traccar sync error"));
        }
        const syncedDeviceId = Number(result.traccarDeviceId ?? 0);
        const syncedAssetId = String(row.asset_id ?? "").trim();
        const syncedImei = String((payload as any).imei ?? "").trim();
        if (syncedAssetId && syncedImei && Number.isFinite(syncedDeviceId) && syncedDeviceId > 0) {
          await upsertAssetMerged(env, jobTenantId, {
            id: syncedAssetId,
            imei: syncedImei,
            traccarDeviceId: Math.trunc(syncedDeviceId)
          });
        }
      }
      const at = new Date().toISOString();
      await env.VIVI_D1.prepare(
        "UPDATE device_sync_jobs SET status = 'synced', error = '', available_at = ?1, last_attempt_at = ?1, updated_at = ?1 WHERE job_id = ?2 AND tenant_id = ?3"
      )
        .bind(at, String(row.job_id ?? ""), String(row.tenant_id ?? ""))
        .run();
      synced += 1;
    } catch (err: any) {
      const at = new Date().toISOString();
      const errorText = String(err?.message ?? err ?? "Unknown device sync error").slice(0, 1000);
      const hitSubrequestLimit = /too many subrequests/i.test(errorText);
      const nextStatus = attemptNumber >= DEVICE_SYNC_MAX_ATTEMPTS ? "failed" : "retry";
      const nextAvailableAt =
        nextStatus === "retry"
          ? hitSubrequestLimit
            ? new Date(Date.now() + 30_000).toISOString()
            : buildDeviceSyncBackoffIso(attemptNumber)
          : at;
      await env.VIVI_D1.prepare(
        "UPDATE device_sync_jobs SET status = ?1, error = ?2, available_at = ?3, last_attempt_at = ?4, updated_at = ?4 WHERE job_id = ?5 AND tenant_id = ?6"
      )
        .bind(nextStatus, errorText, nextAvailableAt, at, String(row.job_id ?? ""), String(row.tenant_id ?? ""))
        .run();
      if (nextStatus === "failed") failed += 1;
      else retried += 1;
      // Stop this invocation — further Traccar calls will also fail the subrequest budget.
      if (hitSubrequestLimit) {
        stoppedEarly = true;
        break;
      }
    }
  }

  return {
    processed,
    synced,
    retried,
    failed,
    recovered,
    stoppedEarly,
    remainingHint: Math.max(0, rows.length - processed)
  };
}

async function getDeviceSyncJobDiagnostics(env: Env, tenantId: string) {
  await ensureD1Tables(env);
  const rowsResult = await env.VIVI_D1.prepare(
    "SELECT job_id, tenant_id, asset_id, operation, status, error, attempts, available_at, last_attempt_at, created_at, updated_at FROM device_sync_jobs WHERE tenant_id = ?1 ORDER BY updated_at DESC LIMIT 100"
  )
    .bind(tenantId)
    .all();
  const rows = (rowsResult.results ?? []) as DeviceSyncJobRow[];
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const status = String(row.status ?? "unknown").trim() || "unknown";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
  const recentFailures = rows
    .filter((row) => String(row.status ?? "").trim().toLowerCase() === "failed")
    .slice(0, 10)
    .map((row) => ({
      jobId: String(row.job_id ?? ""),
      assetId: String(row.asset_id ?? ""),
      operation: String(row.operation ?? ""),
      status: String(row.status ?? ""),
      attempts: Number(row.attempts ?? 0),
      availableAt: String(row.available_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      lastAttemptAt: String(row.last_attempt_at ?? ""),
      error: String(row.error ?? ""),
    }));
  const nextPending = rows
    .filter((row) => {
      const status = String(row.status ?? "").trim().toLowerCase();
      return status === "pending" || status === "retry";
    })
    .sort((left, right) => String(left.available_at ?? left.created_at ?? "").localeCompare(String(right.available_at ?? right.created_at ?? "")))[0] ?? null;
  return {
    tenantId,
    counts,
    nextPendingAt: nextPending ? String(nextPending.available_at ?? nextPending.created_at ?? "") : null,
    recentFailures,
  };
}

async function processQueuedSupportEmail(env: Env, payload: Record<string, unknown>) {
  const to = String(payload.to ?? env.SUPPORT_EMAIL ?? "").trim();
  if (!to) {
    await env.ViviTEL.put(`support-email:${Date.now()}`, JSON.stringify(payload));
    return;
  }

  const fromEmail = String(env.MAIL_FROM ?? "").trim();
  const fromName = String(env.MAIL_FROM_NAME ?? env.APP_NAME ?? "Vivi Telematics").trim();
  const resendKey = String(env.RESEND_API_KEY ?? "").trim();
  if (!fromEmail || !resendKey) {
    await env.ViviTEL.put(`support-email:${Date.now()}`, JSON.stringify(payload));
    return;
  }

  const conversationId = String(payload.conversationId ?? "").trim();
  const tenantId = String(payload.tenantId ?? "").trim();
  const endedAt = String(payload.endedAt ?? new Date().toISOString()).trim();
  const user = payload.user as { name?: unknown; email?: unknown } | null | undefined;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const lines = messages.slice(-50).map((message: any) => {
    const role = String(message?.role ?? "unknown").trim() || "unknown";
    const at = String(message?.at ?? "").trim();
    const text = String(message?.text ?? "").trim();
    return `[${at}] ${role}: ${text}`;
  });

  const subject = `Support chat ended${conversationId ? `: ${conversationId}` : ""}`;
  const text = [
    `Tenant: ${tenantId || "default"}`,
    `Conversation: ${conversationId || "n/a"}`,
    `Ended At: ${endedAt}`,
    `User Name: ${String(user?.name ?? "").trim() || "n/a"}`,
    `User Email: ${String(user?.email ?? "").trim() || "n/a"}`,
    "",
    "Messages:",
    ...(lines.length ? lines : ["No messages captured."])
  ].join("\n");

  await sendResendEmail({
    apiKey: resendKey,
    to,
    from: fromEmail,
    fromName: fromName || undefined,
    subject,
    text,
  });
}

const parseIsoMs = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

async function traccarResolveLatestPositionByImei(env: Env, imei: string) {
  const uniqueId = String(imei ?? "").trim();
  if (!uniqueId) return null;

  // Prefer uniqueId filter (Traccar DeviceResource) — avoids full-fleet /devices?all=true per asset.
  let device: any = null;
  const byUnique = await traccarFetch(env, `/api/devices?uniqueId=${encodeURIComponent(uniqueId)}`);
  if (byUnique.ok && Array.isArray(byUnique.body) && byUnique.body.length) {
    device =
      (byUnique.body as any[]).find((row) => String((row as any)?.uniqueId ?? "").trim() === uniqueId) ??
      (byUnique.body as any[])[0] ??
      null;
  }
  if (!device) {
    const devicesResp = await traccarFetch(env, "/api/devices?all=true");
    if (!devicesResp.ok || !Array.isArray(devicesResp.body)) return null;
    device = (devicesResp.body as any[]).find(
      (row) => String((row as any)?.uniqueId ?? "").trim() === uniqueId
    );
  }
  if (!device) return null;

  const positionId = normalizeId((device as any)?.positionId);
  if (positionId) {
    const byId = await traccarFetch(env, `/api/positions?id=${encodeURIComponent(positionId)}`);
    if (byId.ok && Array.isArray(byId.body) && byId.body[0]) return byId.body[0];
  }

  const deviceId = normalizeId((device as any)?.id ?? (device as any)?.deviceId);
  if (!deviceId) return null;

  const byDevice = await traccarFetch(env, `/api/positions?deviceId=${encodeURIComponent(deviceId)}`);
  if (!byDevice.ok || !Array.isArray(byDevice.body) || byDevice.body.length === 0) return null;

  const latest = [...(byDevice.body as any[])].sort((a, b) => {
    const atA =
      parseIsoMs((a as any)?.deviceTime) ||
      parseIsoMs((a as any)?.fixTime) ||
      parseIsoMs((a as any)?.serverTime) ||
      0;
    const atB =
      parseIsoMs((b as any)?.deviceTime) ||
      parseIsoMs((b as any)?.fixTime) ||
      parseIsoMs((b as any)?.serverTime) ||
      0;
    return atB - atA;
  })[0];

  return latest ?? null;
}

const requireTraccarWebhookSecret = (request: Request, url: URL, env: Env) => {
  const expected = String(env.TRACCAR_WEBHOOK_SECRET ?? "").trim();
  const allowUnsigned = String(env.TRACCAR_ALLOW_UNSIGNED_WEBHOOKS ?? "").trim().toLowerCase() === "true";
  if (!expected) {
    if (allowUnsigned) return null;
    return serviceUnavailable({ error: "Traccar webhook secret not configured." });
  }
  const provided =
    String(request.headers.get("x-webhook-secret") ?? "").trim() ||
    String(request.headers.get("x-traccar-webhook-secret") ?? "").trim() ||
    String(url.searchParams.get("secret") ?? "").trim();
  if (!provided) return unauthorized();
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  if (!timingSafeEqBytes(a, b)) return unauthorized();
  return null;
};

const isBootstrapEnabled = (env: Env) => String(env.ALLOW_ADMIN_BOOTSTRAP ?? "").trim().toLowerCase() === "true";

const CAMERA_DEVICE_VPS_PATHS = new Set([
  "/device/settings",
  "/device/push-settings",
  "/device/pending-settings",
  "/device/ack-settings"
]);
// Single-segment /device/* names the worker handles itself.
const WORKER_LOCAL_DEVICE_SEGMENTS = new Set(["artifacts", "decommission", "kick-avl"]);

/** Camera settings queue + per-device info/commands, all served by the VPS. */
const isCameraDeviceVpsPath = (pathname: string) => {
  if (CAMERA_DEVICE_VPS_PATHS.has(pathname)) return true;
  const match = /^\/device\/([^/]+)(\/command)?$/.exec(pathname);
  if (!match) return false;
  let segment = match[1];
  try {
    segment = decodeURIComponent(segment);
  } catch {
    // Keep the raw segment for malformed escapes.
  }
  return !WORKER_LOCAL_DEVICE_SEGMENTS.has(segment);
};

const requireApiKey = async (request: Request, env: Env) => {
  const key = request.headers.get("x-api-key")?.trim() ?? "";
  if (!key) return unauthorized();
  const currentApiKey = String(env.API_KEY ?? "").trim();
  const permanentApiKey = String(env.API_KEY_PERMANENT ?? "").trim();
  const adminApiKey = String(env.ADMIN_API_KEY ?? "").trim();
  if (
    (currentApiKey && key === currentApiKey) ||
    (permanentApiKey && key === permanentApiKey) ||
    (adminApiKey && key === adminApiKey)
  ) {
    return null;
  }
  try {
    const ok = await validateAdminSession(env, key);
    if (ok) return null;
  } catch {
    // ignore
  }
  try {
    const ok = await validateUserSession(env, key);
    if (ok) return null;
  } catch {
    // ignore
  }
  return unauthorized();
};

const daysUntil = (date: Date) => {
  const diff = date.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

const normalizeNumber = (value: unknown) => {
  const num = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(num) ? num : null;
};

const looksLikeCoordinates = (value: unknown) => /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(String(value ?? ""));

const toCoordKey = (value: number) => Math.round(value * 10_000) / 10_000;

const readCachedReverseGeo = async (env: Env, lat: number, lng: number) => {
  try {
    const key = `geo:rev:${toCoordKey(lat)}:${toCoordKey(lng)}`;
    const raw = await env.ViviTEL.get(key);
    return String(raw ?? "").trim();
  } catch {
    return "";
  }
};

const writeCachedReverseGeo = async (env: Env, lat: number, lng: number, name: string) => {
  const value = String(name ?? "").trim();
  if (!value) return;
  try {
    const key = `geo:rev:${toCoordKey(lat)}:${toCoordKey(lng)}`;
    await env.ViviTEL.put(key, value, { expirationTtl: 60 * 60 * 24 * 30 });
  } catch {
    // ignore cache failures
  }
};

const reverseGeocodeGoogle = async (env: Env, lat: number, lng: number): Promise<string> => {
  const key = String(env.GOOGLE_MAPS_API_KEY ?? "").trim();
  if (!key) return "";
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}&key=${encodeURIComponent(key)}`;
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return "";
    const body = (await response.json()) as any;
    const result = Array.isArray(body?.results) ? body.results[0] : null;
    const formatted = String(result?.formatted_address ?? "").trim();
    return formatted;
  } catch {
    return "";
  }
};

const reverseGeocodeFallback = async (lat: number, lng: number): Promise<string> => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=17&addressdetails=1`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "user-agent": "ViviTelematics/1.0 (reverse-geocode)"
      }
    });
    if (!response.ok) return "";
    const body = (await response.json()) as any;
    const display = String(body?.display_name ?? "").trim();
    if (display) return display;
    const address = body?.address ?? {};
    const local = String(address?.road ?? address?.suburb ?? address?.city ?? address?.town ?? "").trim();
    const country = String(address?.country ?? "").trim();
    return [local, country].filter(Boolean).join(", ");
  } catch {
    return "";
  }
};

const resolveLocationName = async (env: Env, lat: number, lng: number): Promise<string> => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  const cached = await readCachedReverseGeo(env, lat, lng);
  if (cached) return cached;

  const googleName = await reverseGeocodeGoogle(env, lat, lng);
  const fallbackName = googleName || (await reverseGeocodeFallback(lat, lng));
  const name = String(fallbackName ?? "").trim();
  if (name) await writeCachedReverseGeo(env, lat, lng, name);
  return name;
};

const extractLatLng = (payload: Record<string, unknown>) => {
  const data = (payload.data as Record<string, unknown> | undefined) ?? payload;
  const lat = normalizeNumber(data.lat ?? data.latitude);
  const lng = normalizeNumber(data.lon ?? data.lng ?? data.longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng };
};

const pickFirstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const n = normalizeNumber(value);
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return null;
};

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const s = String(value ?? "").trim();
    if (s) return s;
  }
  return "";
};

const timestampMs = (value: unknown): number => {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

/** Newest real instant. A copied asset lastSeen must not hide a later ingest time. */
const newestTimestamp = (...values: unknown[]): string => {
  let best = "";
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const raw = String(value ?? "").trim();
    const ms = timestampMs(raw);
    if (!raw || !Number.isFinite(ms) || ms < bestMs) continue;
    best = raw;
    bestMs = ms;
  }
  return best;
};

const pickFirstBoolean = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
    const s = String(value ?? "").trim().toLowerCase();
    if (!s) continue;
    if (s === "true" || s === "yes" || s === "on" || s === "1") return true;
    if (s === "false" || s === "no" || s === "off" || s === "0") return false;
  }
  return undefined;
};

const extractTelemetryMeta = (payload: Record<string, unknown>) => {
  const root: any = payload as any;
  const data: any = root?.data ?? root;
  const io: any = data?.io ?? root?.io ?? data?.IO ?? root?.IO;

  const speed = pickFirstNumber(
    data?.speed,
    root?.speed,
    io?.Speed,
    io?.speed,
    io?.["GPS speed"],
    io?.["GPS Speed"],
    io?.["Vehicle speed"],
    io?.["Vehicle Speed"],
    data?.attributes?.speed,
    root?.attributes?.speed
  );

  const satellites = pickFirstNumber(
    data?.attributes?.[TraccarPositionAttr.SATELLITES],
    root?.attributes?.[TraccarPositionAttr.SATELLITES],
    data?.attributes?.[TraccarPositionAttr.SATELLITES_VISIBLE],
    data?.satellites,
    data?.satelliteCount,
    data?.sats,
    data?.sat,
    root?.satellites,
    root?.satelliteCount,
    root?.sats,
    root?.sat,
    io?.["Number of Satellites"],
    io?.["Satellites"],
    io?.["GNSS Satellites"],
    io?.["GPS Satellites"],
    io?.["Sats"],
    io?.sat,
    data?.attributes?.satellites,
    data?.attributes?.satelliteCount,
    data?.attributes?.sats,
    root?.attributes?.satellites
  );

  const ignition = pickFirstBoolean(
    data?.attributes?.[TraccarPositionAttr.IGNITION],
    root?.attributes?.[TraccarPositionAttr.IGNITION],
    data?.ignition,
    root?.ignition,
    io?.Ignition,
    io?.["Ignition"],
    io?.["Ignition (1)"],
    io?.["Ignition status"]
  );

  const powerVoltage = pickFirstNumber(
    data?.attributes?.[TraccarPositionAttr.POWER],
    root?.attributes?.[TraccarPositionAttr.POWER],
    data?.attributes?.[TraccarPositionAttr.BATTERY],
    root?.attributes?.[TraccarPositionAttr.BATTERY],
    data?.powerVoltage,
    root?.powerVoltage,
    data?.voltage,
    root?.voltage,
    data?.power,
    root?.power,
    io?.["Power Voltage"],
    io?.["External Voltage"],
    io?.["Voltage"],
    io?.["Battery Voltage"],
    data?.attributes?.powerVoltage,
    data?.attributes?.voltage,
    data?.attributes?.power,
    data?.attributes?.externalPower,
    root?.attributes?.powerVoltage,
    root?.attributes?.power,
    root?.attributes?.externalPower
  );

  const charging = pickFirstBoolean(
    data?.attributes?.[TraccarPositionAttr.CHARGE],
    root?.attributes?.[TraccarPositionAttr.CHARGE],
    data?.charging,
    root?.charging,
    io?.Charging,
    io?.["Charging"],
    data?.attributes?.charging,
    root?.attributes?.charging
  );

  const firmwareVersion = pickFirstString(
    data?.attributes?.[TraccarPositionAttr.VERSION_FW],
    root?.attributes?.[TraccarPositionAttr.VERSION_FW],
    data?.firmwareVersion,
    root?.firmwareVersion,
    io?.["Firmware Version"],
    io?.["FW version"],
    io?.["FW Version"],
    data?.attributes?.firmwareVersion,
    root?.attributes?.firmwareVersion
  );

  const movementRaw = pickFirstString(
    data?.attributes?.[TraccarPositionAttr.MOTION],
    root?.attributes?.[TraccarPositionAttr.MOTION],
    data?.movement,
    root?.movement,
    data?.attributes?.movement,
    root?.attributes?.movement
  );
  const movement = classifyMovementState({ speed, satellites, ignition, movementRaw });

  return {
    ...(typeof speed === "number" ? { speed } : {}),
    ...(typeof satellites === "number" ? { satellites } : {}),
    ...(typeof ignition === "boolean" ? { ignition } : {}),
    ...(typeof powerVoltage === "number" ? { powerVoltage } : {}),
    ...(typeof charging === "boolean" ? { charging } : {}),
    ...(firmwareVersion ? { firmwareVersion } : {}),
    movement
  };
};

const classifyMovementState = (input: {
  speed?: number | null;
  satellites?: number | null;
  ignition?: boolean;
  movementRaw?: string;
}): "moving" | "stationary" | "unknown" => {
  const speed = typeof input.speed === "number" && Number.isFinite(input.speed) ? input.speed : null;
  const satellites = typeof input.satellites === "number" && Number.isFinite(input.satellites) ? input.satellites : null;
  const ignition = typeof input.ignition === "boolean" ? input.ignition : undefined;
  const movementRaw = String(input.movementRaw ?? "").trim().toLowerCase();

  if (speed !== null) {
    if (speed <= 1.2) return "stationary";
    if (satellites !== null && satellites <= 3 && speed < 8) return "stationary";
    if (ignition === false && speed < 8) return "stationary";
    return "moving";
  }

  if (movementRaw === "moving") {
    if (satellites !== null && satellites <= 3) return "stationary";
    if (ignition === false) return "stationary";
    return "moving";
  }
  if (movementRaw === "stationary") return "stationary";

  if (ignition === false) return "stationary";
  return "unknown";
};

const decodeBase64 = (value: string) => {
  if (!value) return new Uint8Array();
  const bufferCtor = (globalThis as any).Buffer as { from: (input: string, enc: string) => Uint8Array } | undefined;
  if (bufferCtor) {
    return Uint8Array.from(bufferCtor.from(value, "base64"));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const encodeBase64 = (bytes: Uint8Array) => {
  const bufferCtor = (globalThis as any).Buffer as { from: (input: Uint8Array) => { toString: (enc: string) => string } } | undefined;
  if (bufferCtor) return bufferCtor.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

async function pbkdf2HashPassword(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, keyMaterial, 256);
  return new Uint8Array(bits);
}

function formatPasswordHash(iterations: number, salt: Uint8Array, hash: Uint8Array) {
  return `pbkdf2:${iterations}:${encodeBase64(salt)}:${encodeBase64(hash)}`;
}

function parsePasswordHash(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("pbkdf2:")) return null;
  const parts = raw.split(":");
  if (parts.length !== 4) return null;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 50_000) return null;
  // Guardrail: avoid WebCrypto failures on excessively large iteration counts.
  if (iterations > 100_000) return null;
  const salt = decodeBase64(parts[2]);
  const hash = decodeBase64(parts[3]);
  if (!salt.length || !hash.length) return null;
  return { iterations, salt, hash };
}

async function verifyPassword(password: string, storedHash: string) {
  try {
    const parsed = parsePasswordHash(storedHash);
    if (!parsed) return false;
    const derived = await pbkdf2HashPassword(password, parsed.salt, parsed.iterations);
    return timingSafeEqBytes(derived, parsed.hash);
  } catch {
    return false;
  }
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2HashPassword(password, salt, PBKDF2_ITERATIONS);
  return formatPasswordHash(PBKDF2_ITERATIONS, salt, hash);
}

const encodeBase64Url = (bytes: Uint8Array) =>
  encodeBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const decodeBase64Url = (value: string) => {
  const padded = String(value ?? "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(String(value ?? "").length / 4) * 4, "=");
  return decodeBase64(padded);
};

type SignedSessionClaims = {
  v: 1;
  kind: "user" | "admin";
  userId?: string;
  version?: string;
  region?: RegionId;
  iat: number;
  exp: number;
  impersonatedBy?: { kind: "admin"; at: string };
};

const requestRegionCache = new WeakMap<Request, RegionId>();

const resolveRequestRegion = (request: Request): RegionId => {
  const cached = requestRegionCache.get(request);
  if (cached) return cached;
  const origin = String(request.headers.get("origin") ?? "").trim();
  const host = String(request.headers.get("host") ?? "").trim();
  return resolveRegionFromRequestLike({ url: request.url, origin, host });
};

const copyRequestRegion = (from: Request, to: Request) => {
  const region = requestRegionCache.get(from);
  if (region) requestRegionCache.set(to, region);
};

const requestIsPinnedToRegionalHost = (request: Request) => {
  const origin = String(request.headers.get("origin") ?? "").trim();
  const host = String(request.headers.get("host") ?? "").replace(/:\d+$/, "").trim();
  let originHost = "";
  try {
    if (/^https?:\/\//i.test(origin)) originHost = new URL(origin).hostname;
  } catch {
    originHost = "";
  }
  return isRegionalAppHost(originHost) || isRegionalAppHost(host);
};

/** Marketing and local sign-in can name the server. A regional host always uses its own server. */
const resolveLoginRegion = (request: Request, requested: unknown): RegionId => {
  if (requestIsPinnedToRegionalHost(request)) return resolveRequestRegion(request);
  const picked = String(requested ?? "").trim().toLowerCase();
  return isRegionId(picked) ? picked : resolveRequestRegion(request);
};

const isDemoLoginEmail = (email: string) => String(email ?? "").trim().toLowerCase().split("@")[0] === "demo";

async function getSessionHmacKey(env: Env): Promise<CryptoKey> {
  const secret = String(env.API_KEY_PERMANENT ?? env.API_KEY ?? env.ADMIN_API_KEY ?? "vivi-session").trim() || "vivi-session";
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify"
  ]);
}

async function mintSignedSessionToken(env: Env, claims: SignedSessionClaims): Promise<string> {
  const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await getSessionHmacKey(env);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `v1.${body}.${encodeBase64Url(sig)}`;
}

async function readSignedSessionClaims(env: Env, token: string): Promise<SignedSessionClaims | null> {
  const raw = String(token ?? "").trim();
  if (!raw.startsWith("v1.")) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [, body, sigPart] = parts;
  if (!body || !sigPart) return null;
  try {
    const key = await getSessionHmacKey(env);
    const sig = decodeBase64Url(sigPart);
    const ok = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(body));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(body))) as SignedSessionClaims;
    if (claims?.v !== 1) return null;
    if (claims.kind !== "user" && claims.kind !== "admin") return null;
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(claims.exp) || claims.exp < now) return null;
    return claims;
  } catch {
    return null;
  }
}

const NAMED_REGION_PATHS = new Set(["/auth/login", "/auth/demo-signup"]);

/** Local sign-in names a server in the body. Later calls carry that server on the session. */
async function bindRequestRegion(request: Request, env: Env): Promise<RegionId> {
  const origin = String(request.headers.get("origin") ?? "").trim();
  const host = String(request.headers.get("host") ?? "").trim();
  if (requestIsPinnedToRegionalHost(request)) {
    const region = resolveRequestRegion(request);
    requestRegionCache.set(request, region);
    return region;
  }
  const url = new URL(request.url);
  const tokens = [
    String(request.headers.get("x-api-key") ?? "").trim(),
    String(url.searchParams.get("token") ?? "").trim()
  ].filter(Boolean);
  let sessionRegion: RegionId | undefined;
  for (const token of tokens) {
    const claims = await readSignedSessionClaims(env, token);
    const claimedRegion = String(claims?.region ?? "").trim().toLowerCase();
    if (isRegionId(claimedRegion)) {
      sessionRegion = claimedRegion;
      break;
    }
  }
  let bodyRegion: string | undefined;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!sessionRegion && request.method === "POST" && NAMED_REGION_PATHS.has(path)) {
    try {
      const body = (await request.clone().json()) as { region?: unknown };
      bodyRegion = String(body?.region ?? "");
    } catch {
      bodyRegion = undefined;
    }
  }
  const region = resolveEffectiveRegion({
    url: request.url,
    origin,
    host,
    sessionRegion,
    bodyRegion
  });
  requestRegionCache.set(request, region);
  return region;
}

async function kvGetSafe(env: Env, key: string): Promise<string | null> {
  try {
    return await env.ViviTEL.get(key);
  } catch {
    return null;
  }
}

async function kvPutSafe(env: Env, key: string, value: string, expirationTtl?: number): Promise<boolean> {
  try {
    if (expirationTtl) await env.ViviTEL.put(key, value, { expirationTtl });
    else await env.ViviTEL.put(key, value);
    return true;
  } catch {
    // ignore KV quota / binding failures — signed sessions do not require KV
    return false;
  }
}

async function kvListSafe(env: Env, prefix: string): Promise<string[]> {
  const names: string[] = [];
  try {
    let cursor: string | undefined;
    do {
      const listed = await env.ViviTEL.list({ prefix, limit: 1000, cursor });
      for (const key of listed.keys ?? []) {
        const name = String(key?.name ?? "").trim();
        if (name) names.push(name);
      }
      cursor = listed.list_complete ? undefined : listed.cursor;
    } while (cursor);
  } catch {
    return names;
  }
  return names;
}

function isSiteScopedLibraryKvKey(key: string): boolean {
  const normalized = String(key ?? "").trim();
  return SITE_SCOPED_KV_BASES.some(
    (base) => normalized.startsWith(`${base}:tenant:`) && normalized.includes(":site:")
  );
}

async function readRouteLibraryFromVps(
  env: Env,
  tenantId: string,
  site: string
): Promise<string | null> {
  const siteKey = String(site ?? "").trim().toLowerCase();
  if (!tenantId || !siteKey) return null;
  const key = `routes-library:${siteKey}`;
  const stored = await readRealtimeStateFromVps(env, tenantId, key);
  if (stored) return stored;
  const legacy = await readRouteLibraryFromDurableStore(env, tenantId, siteKey);
  if (legacy) await writeRealtimeStateToVps(env, tenantId, key, legacy);
  return legacy;
}

async function writeRouteLibraryToVps(
  env: Env,
  tenantId: string,
  site: string,
  payloadText: string
): Promise<boolean> {
  const siteKey = String(site ?? "").trim().toLowerCase();
  if (!tenantId || !siteKey) return false;
  await writeRealtimeStateToVps(env, tenantId, `routes-library:${siteKey}`, payloadText);
  return true;
}

async function readScopedKvFromVps(
  env: Env,
  tenantId: string,
  key: string
): Promise<string | null> {
  const tid = String(tenantId ?? "").trim();
  const scopedKey = String(key ?? "").trim();
  if (!tid || !scopedKey) return null;
  const storageKey = `scoped-kv:${scopedKey}`;
  const stored = await readRealtimeStateFromVps(env, tid, storageKey);
  if (stored) return stored;
  const legacy = await readScopedKvFromDurableStore(env, tid, scopedKey);
  if (legacy) await writeRealtimeStateToVps(env, tid, storageKey, legacy);
  return legacy;
}

async function writeScopedKvToVps(
  env: Env,
  tenantId: string,
  key: string,
  payloadText: string
): Promise<boolean> {
  const tid = String(tenantId ?? "").trim();
  const scopedKey = String(key ?? "").trim();
  if (!tid || !scopedKey) return false;
  await writeRealtimeStateToVps(env, tid, `scoped-kv:${scopedKey}`, payloadText);
  return true;
}

async function readLocationAlertsExact(env: Env, tenantId: string, key: string): Promise<string | null> {
  return readScopedKvFromVps(env, tenantId, key);
}

/**
 * One-time, additive recovery of location alerts that ended up in a different storage slot
 * (legacy flat key, tenant-wide key, or another site key). Only items whose own `site` matches
 * the requested site are adopted, so sites stay isolated. Merging is keyed by alert identity,
 * so nothing is duplicated and nothing existing is removed.
 */
async function recoverLocationAlerts(env: Env, tenantId: string, key: string, exactRaw: string | null): Promise<string | null> {
  const parsedKey = parseLocationAlertsKey(key);
  if (!parsedKey) return exactRaw;
  const markerKey = `location-alerts-recovered:v2:${key}`;
  try {
    if (await readRealtimeStateFromVps(env, tenantId, markerKey)) return exactRaw;
  } catch {
    return exactRaw;
  }

  const { tenantToken, siteToken } = parsedKey;
  const sources: Array<string | null> = [];
  const attempt = async (read: () => Promise<string | null>) => {
    try {
      sources.push(await read());
    } catch {
      // best-effort source
    }
  };
  const tenantWideKey = `${LOCATION_ALERTS_KV_BASE}:tenant:${tenantToken}`;
  await attempt(() => readScopedKvFromVps(env, tenantId, LOCATION_ALERTS_KV_BASE));
  await attempt(() => readScopedKvFromVps(env, tenantId, tenantWideKey));

  const sitePrefix = `${LOCATION_ALERTS_KV_BASE}:tenant:${tenantToken}:site:`;
  const otherKeys = new Set<string>();
  try {
    for (const stored of await listRealtimeStateKeysFromVps(env, tenantId, `scoped-kv:${sitePrefix}`)) {
      otherKeys.add(stored.replace(/^scoped-kv:/, ""));
    }
  } catch {
    // listing is optional
  }
  otherKeys.delete(key);
  for (const other of Array.from(otherKeys).slice(0, 50)) {
    await attempt(() => readScopedKvFromVps(env, tenantId, other));
  }

  const exactItems = parseLocationAlertItems(exactRaw);
  const recovered = sources.flatMap((raw) => itemsForSite(parseLocationAlertItems(raw), siteToken, siteToken));
  const known = new Set(exactItems.map(locationAlertIdentity));
  const additions = recovered.filter((row) => !known.has(locationAlertIdentity(row)));
  let result = exactRaw;
  if (additions.length > 0) {
    const merged = serializeLocationAlerts(mergeLocationAlertItems(additions, exactItems));
    if (await writeScopedKvToVps(env, tenantId, key, merged).then(() => true, () => false)) result = merged;
  }
  await writeRealtimeStateToVps(env, tenantId, markerKey, new Date().toISOString()).catch(() => undefined);
  return result;
}

async function kvGetWithVpsFallback(env: Env, key: string, tenantId: string): Promise<string | null> {
  if (isSiteScopedLibraryKvKey(key)) {
    const exact = await readLocationAlertsExact(env, tenantId, key);
    const parsedKey = parseLocationAlertsKey(key);
    if (!parsedKey) return exact;
    const recovered = await recoverLocationAlerts(env, tenantId, key, exact);
    if (!recovered) return recovered;
    return serializeLocationAlerts(confineToSite(parseLocationAlertItems(recovered), parsedKey.siteToken));
  }
  const fromKv = await kvGetSafe(env, key);
  return fromKv;
}

async function kvPutWithVpsFallback(
  env: Env,
  key: string,
  value: string,
  tenantId: string
): Promise<boolean> {
  if (isSiteScopedLibraryKvKey(key)) {
    const parsedKey = parseLocationAlertsKey(key);
    if (parsedKey) {
      // Merge instead of overwrite: a client that failed to load must never wipe saved alerts.
      const current = await readLocationAlertsExact(env, tenantId, key).catch(() => null);
      const merged = mergeLocationAlertItems(
        parseLocationAlertItems(current),
        confineToSite(parseLocationAlertItems(value), parsedKey.siteToken)
      );
      return writeScopedKvToVps(env, tenantId, key, serializeLocationAlerts(merged));
    }
    return writeScopedKvToVps(env, tenantId, key, value);
  }
  return kvPutSafe(env, key, value);
}

async function kvDeleteSafe(env: Env, key: string): Promise<void> {
  try {
    await env.ViviTEL.delete(key);
  } catch {
    // ignore KV quota / binding failures
  }
}

function workerListCacheStore(env: Env) {
  return {
    get: (key: string) => kvGetSafe(env, key),
    set: async (key: string, value: string, ttlSec: number) => {
      await kvPutSafe(env, key, value, ttlSec);
    }
  };
}

async function invalidateBindingsListCache(env: Env, tenantId: string, type: string): Promise<void> {
  await kvDeleteSafe(env, workerBindingsCacheKey(tenantId, type));
}

async function invalidateAssetsListCache(env: Env, tenantId: string): Promise<void> {
  await kvDeleteSafe(env, workerAssetsCacheKey(tenantId));
  try {
    await notifyRealtimeCatalog(env, tenantId, { reason: "assets" });
  } catch {
    // best-effort realtime fan-out
  }
}

const AUTH_ADMIN_CREDENTIALS_ID = "default";
type AuthResetTokenKind = "admin" | "rbac" | "invite";

async function ensureAuthSchema(env: Env) {
  const db = env.VIVI_D1;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS auth_admin_credentials (
        id TEXT PRIMARY KEY,
        email TEXT,
        password_hash TEXT NOT NULL,
        session_version TEXT,
        updated_at TEXT NOT NULL
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS auth_reset_tokens (
        token TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        email TEXT,
        user_id TEXT,
        tenant_id TEXT,
        payload TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    )
    .run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_reset_tokens_expires ON auth_reset_tokens(expires_at)`).run();
}

async function getAdminEmail(env: Env) {
  // Prefer wrangler/env ADMIN_EMAIL so login does not burn a KV/D1 read.
  const fromEnv = String(env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (fromEnv) return fromEnv;
  try {
    await ensureAuthSchema(env);
    const row = await env.VIVI_D1
      .prepare(`SELECT email FROM auth_admin_credentials WHERE id = ?1`)
      .bind(AUTH_ADMIN_CREDENTIALS_ID)
      .first<{ email: string }>();
    const fromD1 = String(row?.email ?? "").trim().toLowerCase();
    if (fromD1) return fromD1;
  } catch {
    // fall through
  }
  const fromKv = (await kvGetSafe(env, ADMIN_EMAIL_KEY))?.trim() ?? "";
  return fromKv;
}

async function getAdminPasswordHash(env: Env) {
  const fromEnv = String(env.ADMIN_PASSWORD_HASH ?? "").trim();
  if (fromEnv) return fromEnv;

  try {
    await ensureAuthSchema(env);
    const row = await env.VIVI_D1
      .prepare(`SELECT password_hash AS passwordHash FROM auth_admin_credentials WHERE id = ?1`)
      .bind(AUTH_ADMIN_CREDENTIALS_ID)
      .first<{ passwordHash: string }>();
    const fromD1 = String(row?.passwordHash ?? "").trim();
    if (fromD1) return fromD1;
  } catch {
    // fall through to KV
  }

  // Legacy KV fallback + one-time migrate into D1 (credentials must not depend on KV).
  const fromKv = (await kvGetSafe(env, ADMIN_PASSWORD_HASH_KEY))?.trim() ?? "";
  if (fromKv) {
    try {
      await ensureAuthSchema(env);
      const now = new Date().toISOString();
      const version = (await kvGetSafe(env, ADMIN_SESSION_VERSION_KEY))?.trim() || crypto.randomUUID().replace(/-/g, "");
      const email = String(env.ADMIN_EMAIL ?? "").trim().toLowerCase();
      await env.VIVI_D1
        .prepare(
          `INSERT OR IGNORE INTO auth_admin_credentials (id, email, password_hash, session_version, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        )
        .bind(AUTH_ADMIN_CREDENTIALS_ID, email || null, fromKv, version, now)
        .run();
    } catch {
      // ignore migration failures; hash is still usable from this request
    }
  }
  return fromKv;
}

async function setAdminPasswordHash(env: Env, hash: string, email?: string): Promise<string> {
  await ensureAuthSchema(env);
  const now = new Date().toISOString();
  const version = crypto.randomUUID().replace(/-/g, "");
  const adminEmail = String(email ?? (await getAdminEmail(env)) ?? "")
    .trim()
    .toLowerCase();
  await env.VIVI_D1
    .prepare(
      `INSERT INTO auth_admin_credentials (id, email, password_hash, session_version, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET
         email = COALESCE(NULLIF(?2, ''), email),
         password_hash = excluded.password_hash,
         session_version = excluded.session_version,
         updated_at = excluded.updated_at`
    )
    .bind(AUTH_ADMIN_CREDENTIALS_ID, adminEmail || null, hash, version, now)
    .run();
  // Best-effort KV mirror for older tooling; D1 is authoritative.
  await kvPutSafe(env, ADMIN_PASSWORD_HASH_KEY, hash);
  await kvPutSafe(env, ADMIN_SESSION_VERSION_KEY, version);
  if (adminEmail) await kvPutSafe(env, ADMIN_EMAIL_KEY, adminEmail);
  return version;
}

async function verifyAdminPassword(env: Env, password: string) {
  const storedHash = await getAdminPasswordHash(env);
  if (storedHash) {
    return verifyPassword(password, storedHash);
  }
  const plainFromEnv = String(env.ADMIN_PASSWORD ?? "");
  if (!plainFromEnv) return false;
  return timingSafeEqText(plainFromEnv, String(password ?? ""));
}

async function getAdminSessionVersion(env: Env) {
  try {
    await ensureAuthSchema(env);
    const row = await env.VIVI_D1
      .prepare(`SELECT session_version AS sessionVersion FROM auth_admin_credentials WHERE id = ?1`)
      .bind(AUTH_ADMIN_CREDENTIALS_ID)
      .first<{ sessionVersion: string }>();
    const fromD1 = String(row?.sessionVersion ?? "").trim();
    if (fromD1) return fromD1;
  } catch {
    // fall through
  }
  const fromKv = (await kvGetSafe(env, ADMIN_SESSION_VERSION_KEY))?.trim() ?? "";
  if (fromKv) return fromKv;
  // Stable fallback so signed admin sessions still validate when storage is unavailable.
  const fromEnv = String(env.ADMIN_PASSWORD_HASH ?? env.ADMIN_API_KEY ?? "env").trim() || "env";
  return `env:${fromEnv.slice(0, 32)}`;
}

async function storeAuthResetToken(
  env: Env,
  input: {
    token: string;
    kind: AuthResetTokenKind;
    email?: string;
    userId?: string;
    tenantId?: string;
    payload: Record<string, unknown>;
    ttlSeconds: number;
  }
): Promise<boolean> {
  await ensureAuthSchema(env);
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + Math.max(60, input.ttlSeconds) * 1000).toISOString();
  try {
    await env.VIVI_D1
      .prepare(
        `INSERT OR REPLACE INTO auth_reset_tokens
          (token, kind, email, user_id, tenant_id, payload, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .bind(
        input.token,
        input.kind,
        input.email ?? null,
        input.userId ?? null,
        input.tenantId ?? null,
        JSON.stringify(input.payload),
        expiresAt,
        createdAt
      )
      .run();
    return true;
  } catch {
    return false;
  }
}

async function readAuthResetToken(
  env: Env,
  token: string
): Promise<{ kind: AuthResetTokenKind; payload: string } | null> {
  const key = String(token ?? "").trim();
  if (!key) return null;
  const nowIso = new Date().toISOString();

  try {
    await ensureAuthSchema(env);
    const row = await env.VIVI_D1
      .prepare(
        `SELECT kind, payload, expires_at AS expiresAt FROM auth_reset_tokens WHERE token = ?1 LIMIT 1`
      )
      .bind(key)
      .first<{ kind: string; payload: string; expiresAt: string }>();
    if (row?.payload) {
      if (String(row.expiresAt ?? "") < nowIso) {
        try {
          await env.VIVI_D1.prepare(`DELETE FROM auth_reset_tokens WHERE token = ?1`).bind(key).run();
        } catch {
          // ignore
        }
        return null;
      }
      const kind = String(row.kind ?? "").trim() as AuthResetTokenKind;
      if (kind === "admin" || kind === "rbac" || kind === "invite") {
        return { kind, payload: String(row.payload) };
      }
    }
  } catch {
    // fall through to legacy KV
  }

  const rawAdmin = await kvGetSafe(env, `${ADMIN_RESET_PREFIX}${key}`);
  if (rawAdmin) return { kind: "admin", payload: rawAdmin };
  const rawUser = await kvGetSafe(env, `${RBAC_RESET_PREFIX}${key}`);
  if (rawUser) return { kind: "rbac", payload: rawUser };
  const rawInvite = await kvGetSafe(env, `${RBAC_INVITE_PREFIX}${key}`);
  if (rawInvite) return { kind: "invite", payload: rawInvite };
  return null;
}

async function deleteAuthResetToken(env: Env, token: string, kind?: AuthResetTokenKind): Promise<void> {
  const key = String(token ?? "").trim();
  if (!key) return;
  try {
    await ensureAuthSchema(env);
    await env.VIVI_D1.prepare(`DELETE FROM auth_reset_tokens WHERE token = ?1`).bind(key).run();
  } catch {
    // ignore
  }
  if (!kind || kind === "admin") await kvDeleteSafe(env, `${ADMIN_RESET_PREFIX}${key}`);
  if (!kind || kind === "rbac") await kvDeleteSafe(env, `${RBAC_RESET_PREFIX}${key}`);
  if (!kind || kind === "invite") await kvDeleteSafe(env, `${RBAC_INVITE_PREFIX}${key}`);
}

async function createAdminSession(env: Env, region?: RegionId) {
  const version = await getAdminSessionVersion(env);
  const createdAt = new Date().toISOString();
  const now = Math.floor(Date.now() / 1000);
  const namedRegion = region && isRegionId(region) ? region : undefined;
  const token = await mintSignedSessionToken(env, {
    v: 1,
    kind: "admin",
    version,
    ...(namedRegion ? { region: namedRegion } : {}),
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  });
  await kvPutSafe(env, `${ADMIN_SESSION_PREFIX}${token}`, JSON.stringify({ version, createdAt }), SESSION_TTL_SECONDS);
  return token;
}

async function validateAdminSession(env: Env, token: string) {
  const signed = await readSignedSessionClaims(env, token);
  if (signed?.kind === "admin") {
    const current = await getAdminSessionVersion(env);
    return String(signed.version ?? "") === current;
  }
  const raw = await kvGetSafe(env, `${ADMIN_SESSION_PREFIX}${token}`);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { version?: string };
    const current = await getAdminSessionVersion(env);
    return String(parsed?.version ?? "") === current;
  } catch {
    return false;
  }
}

type UserSessionPayload = {
  userId: string;
  createdAt: string;
  region?: RegionId;
  impersonatedBy?: { kind: "admin"; at: string };
};

async function createUserSession(
  env: Env,
  userId: string,
  meta?: {
    impersonatedBy?: { kind: "admin" };
    region?: RegionId;
  }
) {
  const createdAt = new Date().toISOString();
  const now = Math.floor(Date.now() / 1000);
  const region = meta?.region && isRegionId(meta.region) ? meta.region : undefined;
  const payload: UserSessionPayload = {
    userId,
    createdAt,
    ...(region ? { region } : {}),
    ...(meta?.impersonatedBy ? { impersonatedBy: { kind: "admin", at: createdAt } } : {})
  };
  const token = await mintSignedSessionToken(env, {
    v: 1,
    kind: "user",
    userId,
    ...(region ? { region } : {}),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    ...(payload.impersonatedBy ? { impersonatedBy: payload.impersonatedBy } : {})
  });
  // Best-effort mirror for tooling/revocation; login must not depend on KV writes.
  await kvPutSafe(env, `${USER_SESSION_PREFIX}${token}`, JSON.stringify(payload), SESSION_TTL_SECONDS);
  return token;
}

async function getUserSessionPayload(env: Env, token: string): Promise<UserSessionPayload | null> {
  const signed = await readSignedSessionClaims(env, token);
  if (signed?.kind === "user") {
    const userId = String(signed.userId ?? "").trim();
    if (!userId) return null;
    const createdAt = new Date((Number(signed.iat) || Math.floor(Date.now() / 1000)) * 1000).toISOString();
    return {
      userId,
      createdAt,
      ...(isRegionId(signed.region) ? { region: signed.region } : {}),
      ...(signed.impersonatedBy ? { impersonatedBy: signed.impersonatedBy } : {})
    };
  }

  const raw = await kvGetSafe(env, `${USER_SESSION_PREFIX}${token}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UserSessionPayload>;
    const userId = String(parsed?.userId ?? "").trim();
    if (!userId) return null;
    const createdAt = String((parsed as any)?.createdAt ?? "").trim() || new Date().toISOString();
    const impersonatedBy = (parsed as any)?.impersonatedBy;
    const region = String((parsed as any)?.region ?? "").trim().toLowerCase();
    const normalized: UserSessionPayload = {
      userId,
      createdAt,
      ...(isRegionId(region) ? { region } : {}),
      ...(impersonatedBy && typeof impersonatedBy === "object"
        ? { impersonatedBy: { kind: "admin", at: String((impersonatedBy as any).at ?? createdAt) } }
        : {})
    };
    return normalized;
  } catch {
    return null;
  }
}

async function getUserIdForSession(env: Env, token: string) {
  const payload = await getUserSessionPayload(env, token);
  return payload?.userId ?? "";
}

function demoKv(env: Env): DemoKv {
  return {
    get: (key) => kvGetSafe(env, key),
    put: async (key, value) => {
      const ok = await kvPutSafe(env, key, value);
      if (!ok) throw new Error("Unable to store demo access.");
    }
  };
}

const SHARED_DEMO_TENANT_KEY = "vivi:shared-demo-tenant";
const demoPersonalTenantKey = (tenantId: string) => `vivi:demo-personal-tenant:${tenantId}`;

async function fleetImportBlockedForTenant(env: Env, tenantId: string) {
  const id = String(tenantId ?? "").trim();
  if (!id) return false;
  if (isSharedDemoDatabaseTenant(id)) return true;
  const shared = String((await kvGetSafe(env, SHARED_DEMO_TENANT_KEY)) ?? "").trim();
  if (shared && shared === id) return true;
  const personal = String((await kvGetSafe(env, demoPersonalTenantKey(id))) ?? "").trim();
  return Boolean(personal);
}

async function revokeTenantAssignment(env: Env, userId: string, tenantId: string) {
  const scoped = String(tenantId ?? "").trim();
  const uid = normalizeId(userId);
  if (!scoped || !uid) return;
  await env.VIVI_D1.prepare(`DELETE FROM rbac_user_roles WHERE tenant_id = ?1 AND user_id = ?2`).bind(scoped, uid).run();
  await env.VIVI_D1.prepare(`DELETE FROM rbac_user_groups WHERE tenant_id = ?1 AND user_id = ?2`).bind(scoped, uid).run();
  await env.VIVI_D1.prepare(`DELETE FROM rbac_user_sites WHERE tenant_id = ?1 AND user_id = ?2`).bind(scoped, uid).run();
  await env.VIVI_D1.prepare(`DELETE FROM rbac_user_tenants WHERE tenant_id = ?1 AND user_id = ?2`).bind(scoped, uid).run();
}

async function resolveSharedDemoPath(env: Env, region: string): Promise<SharedDemoPath> {
  const stored = await readHierarchy(env, DEMO_TENANT_ID);
  let path = sharedDemoPathFromHierarchy(stored);
  if (!path) {
    const filtered = filterHierarchyForRegion(stored, region || "us");
    path = sharedDemoPathFromHierarchy(filtered) ?? {
      tenantId: DEMO_TENANT_ID,
      siteId: DEMO_HIERARCHY_IDS.site,
      siteName: "Demo"
    };
    const dealerId = path.tenantId.split(":")[0] ?? "";
    const dealer = (filtered.dealers ?? []).find((row) => String(row.id ?? "").trim() === dealerId);
    if (dealer?.id) {
      await saveHierarchy(
        env,
        path.tenantId,
        { dealers: [dealer as HierarchyDealer], updatedAt: new Date().toISOString() },
        { mode: "merge" }
      );
    }
  }
  await kvPutSafe(env, SHARED_DEMO_TENANT_KEY, path.tenantId);
  return path;
}

async function resolvePersonalDemoTenantId(env: Env, userId: string, record: DemoAccessRecord, sharedTenantId: string) {
  const stored = String(record.personalTenantId ?? "").trim();
  if (stored && stored !== sharedTenantId && !isSharedDemoDatabaseTenant(stored)) return stored;
  const refs = await readAllAssignedSiteRefsForUser(env, userId);
  const siteName = String(record.siteName ?? "").trim().toLowerCase();
  const named = refs.find((row) => {
    const tenantId = String(row.tenantId ?? "").trim();
    if (!tenantId || tenantId === sharedTenantId || isSharedDemoDatabaseTenant(tenantId)) return false;
    return Boolean(siteName) && String(row.siteName ?? "").trim().toLowerCase() === siteName;
  });
  if (named?.tenantId) return String(named.tenantId).trim();
  const tenants = Array.from(
    new Set(
      refs
        .map((row) => String(row.tenantId ?? "").trim())
        .filter((tenantId) => tenantId && tenantId !== sharedTenantId && !isSharedDemoDatabaseTenant(tenantId))
    )
  );
  return tenants[0] ?? "";
}

function assetBelongsToAnotherHierarchy(asset: Record<string, unknown>, record: DemoAccessRecord) {
  const compactLabel = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const pairs: Array<[unknown, string]> = [
    [asset.organisation ?? asset.organization, record.organisationName],
    [asset.dealer, record.dealerName],
    [asset.database, record.databaseName]
  ];
  return pairs.some(([value, expected]) => {
    const left = compactLabel(value);
    const right = compactLabel(expected);
    return Boolean(left && right && left !== right);
  });
}

async function purgeCopiedAssetsFromPersonalDemoTenant(env: Env, personalTenantId: string, record: DemoAccessRecord) {
  const tenantId = String(personalTenantId ?? "").trim();
  if (!tenantId || isSharedDemoDatabaseTenant(tenantId)) return;
  const shared = String((await kvGetSafe(env, SHARED_DEMO_TENANT_KEY)) ?? "").trim();
  if (shared && shared === tenantId) return;
  const assets = (await listEntity(env, "assets", tenantId)) as Array<Record<string, unknown>>;
  let removed = 0;
  for (const asset of assets) {
    if (!asset || typeof asset !== "object") continue;
    const imei = String(asset.imei ?? "").trim();
    const imported = String(asset.importedFrom ?? "").trim().toLowerCase() === "traccar";
    let copied = assetBelongsToAnotherHierarchy(asset, record);
    if (!copied && imei) {
      const tenants = await findTenantIdsByImei(env, imei);
      copied = tenants.some((id) => id && id !== tenantId);
    }
    if (!copied && !imported) continue;
    const id = normalizeId(asset.id);
    if (!id) continue;
    if (await deleteEntity(env, "assets", tenantId, id)) removed += 1;
  }
  if (removed) await invalidateAssetsListCache(env, tenantId);
}

type DemoHierarchySync = {
  record: DemoAccessRecord | null;
  shared: SharedDemoPath | null;
  personalTenantId: string;
  allowedTenants: string[];
};

/** Give a demo signup the shared Demo site for 14 days, then take only that site away. */
async function syncDemoHierarchyAccess(env: Env, userId: string, region: string): Promise<DemoHierarchySync> {
  const uid = normalizeId(userId);
  const allowedNow = uid ? await readAllowedTenantIdsForUser(env, uid) : [];
  const empty: DemoHierarchySync = { record: null, shared: null, personalTenantId: "", allowedTenants: allowedNow };
  if (!uid) return empty;
  const record = await loadDemoRecord(demoKv(env), uid);
  if (!record || !demoRecordHasPersonalHierarchy(record)) return { ...empty, record };
  const path = await resolveSharedDemoPath(env, region);
  const personalTenantId = await resolvePersonalDemoTenantId(env, uid, record, path.tenantId);
  let nextRecord = record;
  if (personalTenantId && personalTenantId !== record.personalTenantId) {
    nextRecord = { ...record, personalTenantId };
    await saveDemoRecord(demoKv(env), nextRecord);
  }
  if (personalTenantId) {
    await kvPutSafe(env, demoPersonalTenantKey(personalTenantId), uid);
    await purgeCopiedAssetsFromPersonalDemoTenant(env, personalTenantId, nextRecord);
  }
  const now = new Date().toISOString();
  const visible = demoSharedHierarchyVisible(nextRecord, Date.now());
  if (visible) {
    await ensureStandardRolesForTenant(env.VIVI_D1, path.tenantId);
    const role = await env.VIVI_D1
      .prepare(`SELECT id FROM rbac_roles WHERE tenant_id = ?1 AND standard_role_key = ?2 LIMIT 1`)
      .bind(path.tenantId, "basic-user")
      .first<{ id: string }>();
    await applyRbacUserTenantAssignments(
      env,
      uid,
      [path.tenantId],
      [{ tenantId: path.tenantId, siteId: path.siteId, siteName: path.siteName }],
      role?.id ? [{ tenantId: path.tenantId, roleId: String(role.id) }] : [],
      now
    );
  } else {
    await revokeTenantAssignment(env, uid, path.tenantId);
    if (path.tenantId !== DEMO_TENANT_ID) await revokeTenantAssignment(env, uid, DEMO_TENANT_ID);
  }
  let allowedTenants = await readAllowedTenantIdsForUser(env, uid);
  if (visible) allowedTenants = [path.tenantId, ...allowedTenants.filter((id) => id !== path.tenantId)];
  return { record: nextRecord, shared: visible ? path : null, personalTenantId, allowedTenants };
}

function demoStatusFromSync(record: DemoAccessRecord | null, sync: Pick<DemoHierarchySync, "shared" | "personalTenantId"> | null): DemoPublicStatus | null {
  const status = toPublicDemoStatus(record, Date.now());
  if (!status) return null;
  return {
    ...status,
    personalTenantId: sync?.personalTenantId || status.personalTenantId,
    sharedDemo: sync?.shared ?? null
  };
}

async function validateUserSession(env: Env, token: string) {
  const userId = await getUserIdForSession(env, token);
  if (!userId) return false;
  const record = await loadDemoRecord(demoKv(env), userId);
  if (demoBlocksAccess(record, Date.now())) return false;
  return true;
}

function queueDemoOnboardingMail(ctx: ExecutionContext, env: Env, record: DemoAccessRecord, claim: { sendClient: boolean; sendSupport: boolean }) {
  const supportEmails = parseSupportNotifyEmails(String(env.DEMO_SUPPORT_NOTIFY_EMAILS ?? ""));
  ctx.waitUntil((async () => {
    const fromEmail = String(env.MAIL_FROM ?? "").trim();
    const fromName = String(env.MAIL_FROM_NAME ?? env.APP_NAME ?? "Vivi Telematics").trim();
    const resendKey = String(env.RESEND_API_KEY ?? "").trim();
    const base = String(env.APP_BASE_URL ?? "https://us.vivitelematics.ca").trim().replace(/\/$/, "");
    const messages = buildDemoOnboardingMessages({
      name: record.name,
      email: record.email,
      startedAt: record.startedAt ?? "",
      expiresAt: record.expiresAt ?? "",
      signInUrl: `${base}/login`
    });
    let clientSent = false;
    let supportSent = false;
    if (fromEmail && resendKey) {
      if (claim.sendClient && record.email) {
        try {
          await sendResendEmail({
            apiKey: resendKey,
            to: record.email,
            from: fromEmail,
            fromName,
            subject: messages.client.subject,
            text: messages.client.text
          });
          clientSent = true;
        } catch {
          clientSent = false;
        }
      }
      if (claim.sendSupport && supportEmails.length) {
        try {
          for (const to of supportEmails) {
            await sendResendEmail({
              apiKey: resendKey,
              to,
              from: fromEmail,
              fromName,
              subject: messages.support.subject,
              text: messages.support.text,
              replyTo: record.email || undefined
            });
          }
          supportSent = true;
        } catch {
          supportSent = false;
        }
      }
    }
    try {
      const latest = (await loadDemoRecord(demoKv(env), record.userId)) ?? record;
      const marked = markDemoNotificationResult(
        latest,
        {
          attemptedClient: claim.sendClient,
          attemptedSupport: claim.sendSupport,
          clientSent,
          supportSent
        },
        new Date().toISOString()
      );
      await saveDemoRecord(demoKv(env), marked);
    } catch {
      // The claim expires and the next login can retry.
    }
  })());
}

type Principal =
  | { kind: "admin"; token: string }
  | { kind: "user"; token: string; userId: string }
  | { kind: "none" };

async function getPrincipal(request: Request, env: Env): Promise<Principal> {
  const token = request.headers.get("x-api-key")?.trim() ?? "";
  if (!token) return { kind: "none" };
  if (env.API_KEY && token === String(env.API_KEY)) return { kind: "admin", token };
  const permanentApiKey = String(env.API_KEY_PERMANENT ?? "").trim();
  if (permanentApiKey && token === permanentApiKey) return { kind: "admin", token };
  const adminApiKey = String(env.ADMIN_API_KEY ?? "").trim();
  if (adminApiKey && token === adminApiKey) return { kind: "admin", token };
  try {
    const okAdmin = await validateAdminSession(env, token);
    if (okAdmin) return { kind: "admin", token };
  } catch {
    // ignore
  }
  try {
    const payload = await getUserSessionPayload(env, token);
    const userId = String(payload?.userId ?? "").trim();
    if (!userId) return { kind: "none" };
    const demoRecord = await loadDemoRecord(demoKv(env), userId);
    if (demoBlocksAccess(demoRecord, Date.now())) return { kind: "none" };
    const requestRegion = resolveRequestRegion(request);
    const sessionRegion = payload?.region;
    if (sessionRegion && sessionRegion !== requestRegion) return { kind: "none" };
    if (!sessionRegion && requestRegion !== DEFAULT_REGION) return { kind: "none" };
    return { kind: "user", token, userId };
  } catch {
    // ignore
  }
  return { kind: "none" };
}

type RbacPermissionRow = { pagePath: string; view: boolean; edit: boolean; delete: boolean };

let rbacSchemaEnsured = false;

async function ensureRbacSchema(env: Env) {
  if (rbacSchemaEnsured) return;
  const db = env.VIVI_D1;
  const statements = [
    "CREATE TABLE IF NOT EXISTS rbac_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS rbac_roles (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id, name))",
    "CREATE TABLE IF NOT EXISTS rbac_security_groups (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id, name))",
    "CREATE TABLE IF NOT EXISTS rbac_user_roles (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id, role_id))",
    "CREATE TABLE IF NOT EXISTS rbac_user_groups (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, group_id TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id, group_id))",
    "CREATE TABLE IF NOT EXISTS rbac_group_roles (tenant_id TEXT NOT NULL, group_id TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (tenant_id, group_id, role_id))",
    "CREATE TABLE IF NOT EXISTS rbac_user_tenants (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id))",
    "CREATE TABLE IF NOT EXISTS rbac_user_sites (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, site_id TEXT NOT NULL, site_name TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id, site_id))",
    "CREATE TABLE IF NOT EXISTS rbac_role_permissions (tenant_id TEXT NOT NULL, role_id TEXT NOT NULL, page_path TEXT NOT NULL, can_view INTEGER NOT NULL, can_edit INTEGER NOT NULL, can_delete INTEGER NOT NULL, PRIMARY KEY (tenant_id, role_id, page_path))",
    "CREATE INDEX IF NOT EXISTS idx_rbac_roles_tenant ON rbac_roles(tenant_id)",
    "CREATE INDEX IF NOT EXISTS idx_rbac_groups_tenant ON rbac_security_groups(tenant_id)",
    "CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_user ON rbac_user_roles(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_rbac_user_groups_user ON rbac_user_groups(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_rbac_user_tenants_user ON rbac_user_tenants(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_rbac_user_sites_user ON rbac_user_sites(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_rbac_role_perms_role ON rbac_role_permissions(role_id)",
    "CREATE TABLE IF NOT EXISTS rbac_user_regions (user_id TEXT NOT NULL, region TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user_id, region))",
    "CREATE INDEX IF NOT EXISTS idx_rbac_user_regions_region ON rbac_user_regions(region)"
  ];

  try {
    if (typeof db.batch === "function") {
      await db.batch(statements.map((statement) => db.prepare(statement)));
    } else {
      for (const statement of statements) {
        await db.prepare(statement).run();
      }
    }
  } catch {
    for (const statement of statements) {
      try {
        await db.prepare(statement).run();
      } catch {
        // ignore duplicate-object races between isolates
      }
    }
  }

  // Backward-compatible migration for existing deployments.
  // Older schemas do not have last_login_at.
  try {
    await db.prepare("ALTER TABLE rbac_users ADD COLUMN last_login_at TEXT").run();
  } catch {
    // ignore when column already exists
  }
  try {
    await db.prepare("ALTER TABLE rbac_users ADD COLUMN created_by_user_id TEXT").run();
  } catch {
    // ignore when column already exists
  }
  try {
    await db.prepare("ALTER TABLE rbac_roles ADD COLUMN role_level INTEGER NOT NULL DEFAULT 100").run();
  } catch {
    // ignore when column already exists
  }
  try {
    await db.prepare("ALTER TABLE rbac_roles ADD COLUMN standard_role_key TEXT").run();
  } catch {
    // ignore when column already exists
  }
  try {
    await db.prepare("ALTER TABLE rbac_roles ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0").run();
  } catch {
    // ignore when column already exists
  }
  try {
    // rbac_users is in D1 and rbac_user_regions on the VPS, so seed in two steps.
    const now = new Date().toISOString();
    const seeds = (await listAllRbacUsers(db)).map((user) =>
      db
        .prepare(`INSERT OR IGNORE INTO rbac_user_regions (user_id, region, created_at) VALUES (?1, 'us', ?2)`)
        .bind(user.id, user.createdAt || now)
    );
    for (let offset = 0; offset < seeds.length; offset += 100) {
      await db.batch(seeds.slice(offset, offset + 100));
    }
  } catch {
    // ignore when table is empty or already seeded
  }
  rbacSchemaEnsured = true;
}

async function listUserRegions(env: Env, userId: string): Promise<RegionId[]> {
  const id = String(userId ?? "").trim();
  if (!id) return [];
  try {
    const result = await env.VIVI_D1
      .prepare(`SELECT region FROM rbac_user_regions WHERE user_id = ?1`)
      .bind(id)
      .all<{ region: string }>();
    const rows = Array.isArray(result?.results) ? result.results : [];
    return rows
      .map((row) => String(row?.region ?? "").trim().toLowerCase())
      .filter(isRegionId);
  } catch {
    return [];
  }
}

async function grantUserRegion(env: Env, userId: string, region: string, at = new Date().toISOString()) {
  const id = String(userId ?? "").trim();
  const next = String(region ?? "").trim().toLowerCase();
  if (!id || !isRegionId(next)) return;
  await env.VIVI_D1
    .prepare(`INSERT OR IGNORE INTO rbac_user_regions (user_id, region, created_at) VALUES (?1, ?2, ?3)`)
    .bind(id, next, at)
    .run();
}

async function userCanAccessRegion(env: Env, userId: string, region: string) {
  const allowed = await listUserRegions(env, userId);
  if (!allowed.length) return region === DEFAULT_REGION;
  return allowed.includes(region as RegionId);
}

async function readAllowedTenantIdsForUser(env: Env, userId: string): Promise<string[]> {
  await ensureRbacSchema(env);
  const rows = await env.VIVI_D1
    .prepare(`SELECT tenant_id AS tenantId FROM rbac_user_tenants WHERE user_id = ?1 ORDER BY tenant_id ASC`)
    .bind(userId)
    .all<{ tenantId: string }>();
  return (rows.results ?? []).map((r: any) => String(r.tenantId ?? "").trim()).filter(Boolean);
}

async function readRbacUserIdentity(env: Env, userId: string): Promise<{ id: string; name: string; email: string; status: string } | null> {
  await ensureRbacSchema(env);
  const key = String(userId ?? "").trim();
  if (!key) return null;

  const byId = await env.VIVI_D1
    .prepare(`SELECT id, name, email, status FROM rbac_users WHERE id = ?1 LIMIT 1`)
    .bind(key)
    .first<{ id: string; name: string; email: string; status: string }>();
  const found = byId?.id
    ? byId
    : await env.VIVI_D1
        .prepare(`SELECT id, name, email, status FROM rbac_users WHERE lower(email) = lower(?1) LIMIT 1`)
        .bind(key)
        .first<{ id: string; name: string; email: string; status: string }>();
  if (!found?.id) return null;
  return {
    id: String(found.id ?? "").trim(),
    name: String(found.name ?? "").trim(),
    email: String(found.email ?? "").trim(),
    status: String(found.status ?? "").trim()
  };
}

async function findRbacUserByEmail(
  env: Env,
  email: string,
  exceptUserId?: string
): Promise<{ id: string; email: string } | null> {
  await ensureRbacSchema(env);
  const needle = String(email ?? "").trim().toLowerCase();
  if (!needle) return null;

  const found = await env.VIVI_D1
    .prepare(`SELECT id, email FROM rbac_users WHERE lower(email) = ?1 LIMIT 1`)
    .bind(needle)
    .first<{ id: string; email: string }>();
  if (!found?.id) return null;

  const blockedId = normalizeId(exceptUserId);
  if (blockedId && normalizeId(found.id) === blockedId) return null;
  return { id: String(found.id), email: String(found.email ?? "") };
}

function rbacUserEmailExistsResponse(email: string, existingId?: string) {
  return json(
    { error: "User Email Exists", field: "email", value: email, ...(existingId ? { existingId } : {}) },
    { status: 409 }
  );
}

function isRbacUserEmailUniqueConstraintError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? "");
  return /unique constraint failed:\s*rbac_users\.email/i.test(message);
}

async function applyRbacUserTenantAssignments(
  env: Env,
  userId: string,
  tenantIds: string[],
  siteAssignments: Array<{ tenantId: string; siteId: string; siteName?: string | null }>,
  roleAssignments: Array<{ tenantId: string; roleId: string }>,
  now: string
): Promise<void> {
  const uid = normalizeId(userId);
  if (!uid) return;
  for (const tenantId of tenantIds) {
    const scoped = String(tenantId ?? "").trim();
    if (!scoped) continue;
    await env.VIVI_D1
      .prepare(`INSERT OR IGNORE INTO rbac_user_tenants (tenant_id, user_id, created_at) VALUES (?1, ?2, ?3)`)
      .bind(scoped, uid, now)
      .run();
  }
  // Site grants imply database tenant access — never leave site rows without a tenant grant.
  for (const siteAssignment of siteAssignments) {
    const scoped = String(siteAssignment.tenantId ?? "").trim();
    if (!scoped) continue;
    await env.VIVI_D1
      .prepare(`INSERT OR IGNORE INTO rbac_user_tenants (tenant_id, user_id, created_at) VALUES (?1, ?2, ?3)`)
      .bind(scoped, uid, now)
      .run();
  }
  for (const siteAssignment of siteAssignments) {
    const scoped = String(siteAssignment.tenantId ?? "").trim();
    const siteId = String(siteAssignment.siteId ?? "").trim();
    if (!scoped || !siteId) continue;
    await env.VIVI_D1
      .prepare(
        `INSERT OR REPLACE INTO rbac_user_sites (tenant_id, user_id, site_id, site_name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)`
      )
      .bind(scoped, uid, siteId, siteAssignment.siteName || null, now)
      .run();
  }
  for (const roleAssignment of roleAssignments) {
    const scoped = String(roleAssignment.tenantId ?? "").trim();
    const roleId = normalizeId(roleAssignment.roleId);
    if (!scoped || !roleId) continue;
    await env.VIVI_D1
      .prepare(`INSERT OR REPLACE INTO rbac_user_roles (tenant_id, user_id, role_id) VALUES (?1, ?2, ?3)`)
      .bind(scoped, uid, roleId)
      .run();
  }
}

async function replaceRbacUserTenantAssignments(
  env: Env,
  userId: string,
  tenantIds: string[],
  siteAssignments: Array<{ tenantId: string; siteId: string; siteName?: string | null }>,
  roleAssignments: Array<{ tenantId: string; roleId: string }>,
  now: string
): Promise<void> {
  const uid = normalizeId(userId);
  if (!uid) return;
  const nextTenants = uniqueNormalizedIds([
    ...tenantIds,
    ...siteAssignments.map((row) => row.tenantId)
  ]);
  const existingTenants = await readAllowedTenantIdsForUser(env, uid);
  for (const oldTenant of existingTenants) {
    if (nextTenants.includes(oldTenant)) continue;
    await env.VIVI_D1.prepare(`DELETE FROM rbac_user_roles WHERE tenant_id = ?1 AND user_id = ?2`).bind(oldTenant, uid).run();
    await env.VIVI_D1.prepare(`DELETE FROM rbac_user_groups WHERE tenant_id = ?1 AND user_id = ?2`).bind(oldTenant, uid).run();
    await env.VIVI_D1.prepare(`DELETE FROM rbac_user_sites WHERE tenant_id = ?1 AND user_id = ?2`).bind(oldTenant, uid).run();
    await env.VIVI_D1.prepare(`DELETE FROM rbac_user_tenants WHERE tenant_id = ?1 AND user_id = ?2`).bind(oldTenant, uid).run();
  }
  for (const scoped of nextTenants) {
    await env.VIVI_D1.prepare(`DELETE FROM rbac_user_sites WHERE tenant_id = ?1 AND user_id = ?2`).bind(scoped, uid).run();
    await env.VIVI_D1.prepare(`DELETE FROM rbac_user_roles WHERE tenant_id = ?1 AND user_id = ?2`).bind(scoped, uid).run();
  }
  await applyRbacUserTenantAssignments(env, uid, nextTenants, siteAssignments, roleAssignments, now);
}

/** Users inserted then rejected (role/scope) have no tenant row, so they 409 on create and vanish from the list. */
async function healOrphanRbacUsersForTenant(env: Env, tenantId: string, actor: RbacActorContext): Promise<void> {
  const scopedTenant = normalizeId(tenantId);
  if (!scopedTenant || scopedTenant.split(":").filter(Boolean).length < 3) return;
  const now = new Date().toISOString();
  const unrestricted = actor.isAdmin || actor.isTenantAdmin || actor.isOwnSupport ? 1 : 0;
  // Users are in D1 and their assignments on the VPS: find unlinked users in two reads.
  const linked = await env.VIVI_D1
    .prepare(
      `SELECT user_id AS userId FROM rbac_user_tenants
       UNION SELECT user_id FROM rbac_user_roles
       UNION SELECT user_id FROM rbac_user_sites
       UNION SELECT user_id FROM rbac_user_groups`
    )
    .all<{ userId: string }>();
  const linkedIds = new Set((linked.results ?? []).map((row) => String(row?.userId ?? "")));
  const orphans = (await listAllRbacUsers(env.VIVI_D1, { full: true })).filter(
    (user) => !linkedIds.has(user.id) && (unrestricted === 1 || user.createdByUserId === (actor.userId || ""))
  );
  for (const row of orphans) {
    const userId = normalizeId(row?.id);
    if (!userId) continue;
    await env.VIVI_D1
      .prepare(`INSERT OR IGNORE INTO rbac_user_tenants (tenant_id, user_id, created_at) VALUES (?1, ?2, ?3)`)
      .bind(scopedTenant, userId, now)
      .run();
  }
}

async function readEffectivePermissionsForUser(env: Env, tenantId: string, userId: string): Promise<RbacPermissionRow[]> {
  await ensureRbacSchema(env);
  const db = env.VIVI_D1;

  const directRoleIds = await db
    .prepare(`SELECT role_id AS roleId FROM rbac_user_roles WHERE tenant_id = ?1 AND user_id = ?2`)
    .bind(tenantId, userId)
    .all<{ roleId: string }>();

  const groupRoleIds = await db
    .prepare(
      `SELECT gr.role_id AS roleId
       FROM rbac_user_groups ug
       INNER JOIN rbac_group_roles gr ON gr.tenant_id = ug.tenant_id AND gr.group_id = ug.group_id
       WHERE ug.tenant_id = ?1 AND ug.user_id = ?2`
    )
    .bind(tenantId, userId)
    .all<{ roleId: string }>();

  const roleIds = Array.from(
    new Set(
      [...(directRoleIds.results ?? []), ...(groupRoleIds.results ?? [])]
        .map((r) => String((r as any).roleId ?? "").trim())
        .filter(Boolean)
    )
  );
  if (!roleIds.length) return [];

  const placeholders = roleIds.map(() => "?").join(",");
  const stmt = db.prepare(
    `
    SELECT p.page_path AS pagePath,
           p.can_view AS canView,
           p.can_edit AS canEdit,
           p.can_delete AS canDelete,
           COALESCE(r.standard_role_key, '') AS standardRoleKey,
           COALESCE(r.name, '') AS roleName
    FROM rbac_role_permissions p
    LEFT JOIN rbac_roles r ON r.id = p.role_id AND r.tenant_id = p.tenant_id
    WHERE p.tenant_id = ?1 AND p.role_id IN (${placeholders})
    `
  );
  const bound = stmt.bind(tenantId, ...roleIds);
  const rows = await bound.all<{
    pagePath: string;
    canView: number;
    canEdit: number;
    canDelete: number;
    standardRoleKey?: string;
    roleName?: string;
  }>();
  const grouped = new Map<string, RbacPermissionRow>();
  for (const row of rows.results ?? []) {
    const pagePath = String((row as any).pagePath ?? "").trim();
    if (!pagePath) continue;
    if (!standardRoleAllowsPage(String((row as any).standardRoleKey ?? ""), pagePath, String((row as any).roleName ?? ""))) {
      continue;
    }
    const current = grouped.get(pagePath) ?? { pagePath, view: false, edit: false, delete: false };
    current.view = current.view || permissionFlagEnabled((row as any).canView ?? (row as any).can_view);
    current.edit = current.edit || permissionFlagEnabled((row as any).canEdit ?? (row as any).can_edit);
    current.delete = current.delete || permissionFlagEnabled((row as any).canDelete ?? (row as any).can_delete);
    grouped.set(pagePath, current);
  }
  return Array.from(grouped.values()).filter((row) => row.view || row.edit || row.delete);
}

const permissionFlagEnabled = (value: unknown) => {
  if (value === true) return true;
  if (value === false || value == null || value === "") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
};

async function readDirectRolesForUser(
  env: Env,
  tenantId: string,
  userId: string
): Promise<Array<{ roleId: string; roleName: string; roleLevel: number }>> {
  await ensureRbacSchema(env);
  const rows = await env.VIVI_D1
    .prepare(
      `SELECT ur.role_id AS roleId, rr.name AS roleName, COALESCE(rr.role_level, 100) AS roleLevel
       FROM rbac_user_roles ur
       LEFT JOIN rbac_roles rr ON rr.id = ur.role_id AND rr.tenant_id = ur.tenant_id
       WHERE ur.tenant_id = ?1 AND ur.user_id = ?2
       UNION
       SELECT gr.role_id AS roleId, rr.name AS roleName, COALESCE(rr.role_level, 100) AS roleLevel
       FROM rbac_user_groups ug
       INNER JOIN rbac_group_roles gr ON gr.tenant_id = ug.tenant_id AND gr.group_id = ug.group_id
       LEFT JOIN rbac_roles rr ON rr.id = gr.role_id AND rr.tenant_id = gr.tenant_id
       WHERE ug.tenant_id = ?1 AND ug.user_id = ?2
       ORDER BY roleLevel ASC, roleName ASC, roleId ASC`
    )
    .bind(tenantId, userId)
    .all<{ roleId: string; roleName: string; roleLevel: number }>();
  return (rows.results ?? [])
    .map((row: any) => ({
      roleId: String(row?.roleId ?? "").trim(),
      roleName: String(row?.roleName ?? "").trim(),
      roleLevel: Number.isFinite(Number(row?.roleLevel)) ? Math.trunc(Number(row?.roleLevel)) : 100
    }))
    .filter((row) => Boolean(row.roleId));
}

/** Legacy ids for the same database only. Sibling databases are not included. */
function databaseTenantAliases(tenantId: string): string[] {
  const scoped = String(tenantId ?? "").trim();
  if (!scoped) return [];
  const parts = scoped.split(":").map((part) => part.trim()).filter(Boolean);
  const aliases = new Set<string>([scoped]);
  if (parts.length >= 3) {
    aliases.add(parts[parts.length - 1]);
    aliases.add(`${parts[parts.length - 2]}:${parts[parts.length - 1]}`);
  } else if (parts.length === 2) {
    aliases.add(parts[1]);
  }
  return Array.from(aliases);
}

/**
 * Roles assigned on this database, directly and through security groups.
 * A role on another database is not added here.
 */
async function readDatabaseRolesForUser(
  env: Env,
  tenantId: string,
  userId: string
): Promise<Array<{ roleId: string; roleName: string; roleLevel: number }>> {
  const merged = new Map<string, { roleId: string; roleName: string; roleLevel: number }>();
  for (const scope of databaseTenantAliases(tenantId)) {
    const roles = await readDirectRolesForUser(env, scope, userId);
    for (const role of roles) {
      if (!role.roleId || merged.has(role.roleId)) continue;
      merged.set(role.roleId, role);
    }
  }
  return Array.from(merged.values());
}

async function readRoleAssignmentsForUser(
  env: Env,
  userId: string
): Promise<Array<{ tenantId: string; roleId: string; roleName: string; roleLevel: number }>> {
  await ensureRbacSchema(env);
  const uid = normalizeId(userId);
  if (!uid) return [];
  const rows = await env.VIVI_D1
    .prepare(
      `SELECT ur.tenant_id AS tenantId, ur.role_id AS roleId, rr.name AS roleName, COALESCE(rr.role_level, 100) AS roleLevel
       FROM rbac_user_roles ur
       LEFT JOIN rbac_roles rr ON rr.id = ur.role_id AND rr.tenant_id = ur.tenant_id
       WHERE ur.user_id = ?1
       UNION
       SELECT ug.tenant_id AS tenantId, gr.role_id AS roleId, rr.name AS roleName, COALESCE(rr.role_level, 100) AS roleLevel
       FROM rbac_user_groups ug
       INNER JOIN rbac_group_roles gr ON gr.tenant_id = ug.tenant_id AND gr.group_id = ug.group_id
       LEFT JOIN rbac_roles rr ON rr.id = gr.role_id AND rr.tenant_id = gr.tenant_id
       WHERE ug.user_id = ?1
       ORDER BY roleLevel ASC, roleName ASC, roleId ASC`
    )
    .bind(uid)
    .all<{ tenantId: string; roleId: string; roleName: string; roleLevel: number }>();
  return (rows.results ?? [])
    .map((row: any) => ({
      tenantId: String(row?.tenantId ?? "").trim(),
      roleId: String(row?.roleId ?? "").trim(),
      roleName: String(row?.roleName ?? "").trim(),
      roleLevel: Number.isFinite(Number(row?.roleLevel)) ? Math.trunc(Number(row?.roleLevel)) : 100
    }))
    .filter((row) => Boolean(row.tenantId && row.roleId));
}

/**
 * Page rights for the signed-in account on the active database.
 * The result is the union of checked pages on roles assigned directly and on
 * roles attached to security groups the user belongs to. A role name, another
 * database, or the standard-role catalogue does not add pages.
 */
async function readPermissionsForSession(env: Env, tenantId: string, userId: string): Promise<RbacPermissionRow[]> {
  const merged = new Map<string, RbacPermissionRow>();
  for (const scope of databaseTenantAliases(tenantId)) {
    const rows = await readEffectivePermissionsForUser(env, scope, userId);
    for (const row of rows) {
      const pagePath = String(row?.pagePath ?? "").trim();
      if (!pagePath) continue;
      const current = merged.get(pagePath) ?? { pagePath, view: false, edit: false, delete: false };
      current.view = Boolean(current.view || row.view);
      current.edit = Boolean(current.edit || row.edit);
      current.delete = Boolean(current.delete || row.delete);
      merged.set(pagePath, current);
    }
  }
  const rows = Array.from(merged.values()).filter((row) => row.view || row.edit || row.delete);
  const demoRecord = await loadDemoRecord(demoKv(env), userId);
  return mergeActiveDemoPermissions(rows, demoRecord, Date.now());
}

async function ensureTenantGrantsFromSiteAssignments(env: Env, userId: string): Promise<string[]> {
  const uid = normalizeId(userId);
  if (!uid) return [];
  await ensureRbacSchema(env);
  const refs = await readAllAssignedSiteRefsForUser(env, uid);
  const now = new Date().toISOString();
  for (const ref of refs) {
    const scoped = String(ref.tenantId ?? "").trim();
    if (!scoped) continue;
    try {
      await env.VIVI_D1
        .prepare(`INSERT OR IGNORE INTO rbac_user_tenants (tenant_id, user_id, created_at) VALUES (?1, ?2, ?3)`)
        .bind(scoped, uid, now)
        .run();
    } catch {
      // ignore per-row heal failures
    }
  }
  return readAllowedTenantIdsForUser(env, uid);
}

async function readAssignedSiteIdsForUser(env: Env, tenantId: string, userId: string): Promise<string[]> {
  await ensureRbacSchema(env);
  const rows = await env.VIVI_D1
    .prepare(`SELECT site_id AS siteId FROM rbac_user_sites WHERE tenant_id = ?1 AND user_id = ?2 ORDER BY site_id ASC`)
    .bind(tenantId, userId)
    .all<{ siteId: string }>();
  return (rows.results ?? []).map((row: any) => String(row?.siteId ?? "").trim()).filter(Boolean);
}

async function readAllAssignedSiteIdsForUser(env: Env, userId: string): Promise<string[]> {
  const refs = await readAllAssignedSiteRefsForUser(env, userId);
  return Array.from(new Set(refs.map((row) => row.siteId).filter(Boolean)));
}

/**
 * When a database is added under a dealer/org, grant that tenant to peers who already
 * have access higher in the same hierarchy (same org, or Dealer Support on the dealer).
 */
async function propagateDatabaseAccessToHierarchyPeers(
  env: Env,
  dealerId: string,
  orgId: string,
  databaseId: string
): Promise<void> {
  const scopedDealer = normalizeId(dealerId);
  const scopedOrg = normalizeId(orgId);
  const scopedDb = normalizeId(databaseId);
  if (!scopedDealer || !scopedOrg || !scopedDb) return;

  const newTenantId = `${scopedDealer}:${scopedOrg}:${scopedDb}`;
  const orgPrefix = `${scopedDealer}:${scopedOrg}:`;
  const now = new Date().toISOString();
  await ensureRbacSchema(env);
  await ensureStandardRolesForTenant(env.VIVI_D1, newTenantId);

  const peerRows = await env.VIVI_D1
    .prepare(
      `SELECT DISTINCT user_id AS userId, tenant_id AS sourceTenantId
       FROM rbac_user_tenants
       WHERE tenant_id = ?1
          OR tenant_id = ?2
          OR tenant_id LIKE ?3
          OR tenant_id LIKE ?4`
    )
    .bind(scopedDealer, `${scopedDealer}:${scopedOrg}`, `${orgPrefix}%`, `${scopedDealer}:%`)
    .all<{ userId: string; sourceTenantId: string }>();

  const peers = peerRows.results ?? [];
  if (!peers.length) return;

  const sourceByUser = new Map<string, string>();
  for (const row of peers) {
    const userId = normalizeId(row?.userId);
    const sourceTenantId = String(row?.sourceTenantId ?? "").trim();
    if (!userId || !sourceTenantId || sourceTenantId === newTenantId) continue;
    // Prefer an exact org sibling as the role source over a dealer-wide grant.
    const existing = sourceByUser.get(userId);
    if (!existing || (sourceTenantId.startsWith(orgPrefix) && !existing.startsWith(orgPrefix))) {
      sourceByUser.set(userId, sourceTenantId);
    }
  }

  for (const [userId, sourceTenantId] of sourceByUser.entries()) {
    const roleRows = await readRoleAssignmentsForUser(env, userId);
    const roleNames = roleRows.map((row) => row.roleName).filter(Boolean);
    const isHierarchyManager =
      roleNames.some((name) => isAdminLikeRoleName(name)) ||
      roleNames.some((name) => isOwnSupportLikeRoleName(name)) ||
      roleNames.some((name) => isDealerSupportLikeRoleName(name));

    const parentGrant = sourceTenantId === scopedDealer || sourceTenantId === `${scopedDealer}:${scopedOrg}`;

    // End users keep exact database grants; hierarchy managers inherit new DBs under their dealer/org.
    if (!isHierarchyManager && !parentGrant) continue;

    await env.VIVI_D1
      .prepare(`INSERT OR IGNORE INTO rbac_user_tenants (tenant_id, user_id, created_at) VALUES (?1, ?2, ?3)`)
      .bind(newTenantId, userId, now)
      .run();

    const sourceRoles = await env.VIVI_D1
      .prepare(
        `SELECT ur.role_id AS roleId, rr.name AS roleName
         FROM rbac_user_roles ur
         LEFT JOIN rbac_roles rr ON rr.id = ur.role_id AND rr.tenant_id = ur.tenant_id
         WHERE ur.tenant_id = ?1 AND ur.user_id = ?2`
      )
      .bind(sourceTenantId, userId)
      .all<{ roleId: string; roleName: string }>();

    for (const roleRow of sourceRoles.results ?? []) {
      const sourceRoleId = normalizeId(roleRow?.roleId);
      const sourceRoleName = String(roleRow?.roleName ?? "").trim();
      if (!sourceRoleId && !sourceRoleName) continue;
      try {
        const resolved = await resolveRoleAssignmentsForTenants(env, [newTenantId], sourceRoleId, sourceRoleName);
        const roleId = resolved[0]?.roleId;
        if (!roleId) continue;
        await env.VIVI_D1
          .prepare(`INSERT OR IGNORE INTO rbac_user_roles (tenant_id, user_id, role_id) VALUES (?1, ?2, ?3)`)
          .bind(newTenantId, userId, roleId)
          .run();
      } catch {
        // Role may not exist yet on the new tenant; tenant grant alone still unlocks hierarchy visibility.
      }
    }
  }
}

/**
 * When a site is added, extend site grants for peers who already cover that database
 * (support roles, or users who previously had every site on the database).
 */
async function propagateSiteAccessToHierarchyPeers(
  env: Env,
  tenantId: string,
  siteId: string,
  siteName: string,
  previousSiteIds: string[]
): Promise<void> {
  const scopedTenant = normalizeId(tenantId);
  const scopedSite = normalizeId(siteId);
  if (!scopedTenant || !scopedSite) return;
  const now = new Date().toISOString();
  const prior = previousSiteIds.map((id) => normalizeId(id)).filter(Boolean);

  await ensureRbacSchema(env);

  const tenantUsers = await env.VIVI_D1
    .prepare(`SELECT DISTINCT user_id AS userId FROM rbac_user_tenants WHERE tenant_id = ?1`)
    .bind(scopedTenant)
    .all<{ userId: string }>();

  for (const row of tenantUsers.results ?? []) {
    const userId = normalizeId(row?.userId);
    if (!userId) continue;

    const assigned = await readAssignedSiteIdsForUser(env, scopedTenant, userId);
    if (!assigned.length) continue; // empty = all current and future sites already

    const roleRows = await readRoleAssignmentsForUser(env, userId);
    const roleNames = roleRows.map((r) => r.roleName).filter(Boolean);
    const isHierarchyManager =
      roleNames.some((name) => isAdminLikeRoleName(name)) ||
      roleNames.some((name) => isOwnSupportLikeRoleName(name)) ||
      roleNames.some((name) => isDealerSupportLikeRoleName(name));

    const hadFullCoverage = prior.length > 0 && prior.every((id) => assigned.includes(id));
    if (!isHierarchyManager && !hadFullCoverage) continue;
    if (assigned.includes(scopedSite)) continue;

    await env.VIVI_D1
      .prepare(
        `INSERT OR REPLACE INTO rbac_user_sites (tenant_id, user_id, site_id, site_name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)`
      )
      .bind(scopedTenant, userId, scopedSite, String(siteName ?? "").trim() || null, now)
      .run();
  }
}

async function readAllAssignedSiteRefsForUser(
  env: Env,
  userId: string
): Promise<Array<{ tenantId: string; siteId: string; siteName?: string }>> {
  await ensureRbacSchema(env);
  const rows = await env.VIVI_D1
    .prepare(`SELECT tenant_id AS tenantId, site_id AS siteId, site_name AS siteName FROM rbac_user_sites WHERE user_id = ?1 ORDER BY tenant_id ASC, site_id ASC`)
    .bind(userId)
    .all<{ tenantId: string; siteId: string; siteName?: string }>();
  return (rows.results ?? [])
    .map((row: any) => ({
      tenantId: String(row?.tenantId ?? "").trim(),
      siteId: String(row?.siteId ?? "").trim(),
      siteName: String(row?.siteName ?? "").trim()
    }))
    .filter((row) => Boolean(row.tenantId && row.siteId));
}

async function hydrateRbacUserAssignmentFields(
  env: Env,
  user: Record<string, unknown>,
  userId: string
): Promise<Record<string, unknown>> {
  const assignedTenantIds = await readAllowedTenantIdsForUser(env, userId);
  const siteAssignments = await readAllAssignedSiteRefsForUser(env, userId);
  return {
    ...user,
    assignedTenantId: assignedTenantIds[0] || user.assignedTenantId || "",
    assignedTenantIds: assignedTenantIds.length ? assignedTenantIds : user.assignedTenantIds,
    assignedSiteId: siteAssignments[0]?.siteId || user.assignedSiteId || "",
    assignedSiteName: siteAssignments[0]?.siteName || user.assignedSiteName || "",
    assignedSiteIds: siteAssignments.map((row) => row.siteId),
    siteAssignments
  };
}

async function readActorSiteIdsByTenant(env: Env, userId: string, tenantIds: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const tenantId of tenantIds) {
    out[tenantId] = await readAssignedSiteIdsForUser(env, tenantId, userId);
  }
  return out;
}

async function validateActorAssignmentScope(
  env: Env,
  actor: RbacActorContext,
  assignmentTenantIds: string[],
  siteAssignments: Array<{ tenantId: string; siteId: string; siteName?: string }>
): Promise<string | null> {
  // Own Support assigns across the platform. A single stored site must not cap who they can grant.
  if (isActorAdminScope(actor) || actor.isOwnSupport) return null;
  const tenantIds = assignmentTenantIds.map((value) => String(value ?? "").trim()).filter(Boolean);
  const actorSiteIdsByTenant = await readActorSiteIdsByTenant(env, actor.userId, tenantIds);
  return validateAssignmentWithinActorAccess(
    actor.allowedTenants,
    actorSiteIdsByTenant,
    tenantIds,
    siteAssignments.map((row) => ({ tenantId: row.tenantId, siteId: row.siteId })),
    false
  );
}

const uniqueNormalizedIds = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => normalizeId(value))
        .filter(Boolean)
    )
  );

type RequestedSiteAssignment = { tenantId?: string; siteId?: string; siteName?: string };

const normalizeRequestedTenantIds = (assignment?: { tenantId?: string; tenantIds?: string[] }) =>
  uniqueNormalizedIds([assignment?.tenantId, ...(Array.isArray(assignment?.tenantIds) ? assignment.tenantIds : [])]);

const normalizeRequestedSiteAssignments = (
  assignment?: { tenantId?: string; siteId?: string; siteName?: string; siteAssignments?: RequestedSiteAssignment[] }
) => {
  const seen = new Set<string>();
  const out: Array<{ tenantId: string; siteId: string; siteName: string }> = [];
  const push = (tenantValue?: string, siteValue?: string, siteNameValue?: string) => {
    const tenantId = normalizeId(tenantValue);
    const siteId = normalizeId(siteValue);
    if (!tenantId || !siteId) return;
    const key = `${tenantId}:${siteId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ tenantId, siteId, siteName: normalizeId(siteNameValue) });
  };

  for (const row of Array.isArray(assignment?.siteAssignments) ? assignment!.siteAssignments : []) {
    push(row?.tenantId, row?.siteId, row?.siteName);
  }
  push(assignment?.tenantId, assignment?.siteId, assignment?.siteName);
  return out;
};

async function resolveRoleAssignmentsForTenants(env: Env, tenantIds: string[], requestedRoleId: string, requestedRoleName?: string) {
  const normalizedTenantIds = uniqueNormalizedIds(tenantIds);
  const roleId = normalizeId(requestedRoleId);
  const roleNameHint = normalizeId(requestedRoleName);
  if ((!roleId && !roleNameHint) || !normalizedTenantIds.length) {
    return [] as Array<{ tenantId: string; roleId: string; roleName: string }>;
  }

  for (const tenantId of normalizedTenantIds) {
    await ensureStandardRolesForTenant(env.VIVI_D1, tenantId);
  }

  let templateRoleName = roleNameHint;
  if (!templateRoleName && roleId) {
    for (const tenantId of normalizedTenantIds) {
      const direct = await env.VIVI_D1
        .prepare(`SELECT id, name FROM rbac_roles WHERE tenant_id = ?1 AND id = ?2 LIMIT 1`)
        .bind(tenantId, roleId)
        .first<{ id: string; name: string }>();
      if (direct?.id) {
        templateRoleName = normalizeId(direct.name);
        break;
      }
    }
    if (!templateRoleName) {
      const template = await env.VIVI_D1
        .prepare(`SELECT name FROM rbac_roles WHERE id = ?1 LIMIT 1`)
        .bind(roleId)
        .first<{ name: string }>();
      templateRoleName = normalizeId(template?.name);
    }
  }

  const out: Array<{ tenantId: string; roleId: string; roleName: string }> = [];
  for (const tenantId of normalizedTenantIds) {
    let row = await env.VIVI_D1
      .prepare(`SELECT id, name FROM rbac_roles WHERE tenant_id = ?1 AND id = ?2 LIMIT 1`)
      .bind(tenantId, roleId)
      .first<{ id: string; name: string }>();
    if (!row?.id && templateRoleName) {
      row = await env.VIVI_D1
        .prepare(`SELECT id, name FROM rbac_roles WHERE tenant_id = ?1 AND LOWER(name) = LOWER(?2) ORDER BY COALESCE(role_level, 100) ASC, id ASC LIMIT 1`)
        .bind(tenantId, templateRoleName)
        .first<{ id: string; name: string }>();
    }
    if (!row?.id) {
      throw new Error(`Role \"${templateRoleName || roleId}\" is not available for every selected database.`);
    }
    out.push({ tenantId, roleId: normalizeId(row.id), roleName: normalizeId(row.name) });
  }
  return out;
}

async function readCreatedByUserId(env: Env, userId: string): Promise<string> {
  await ensureRbacSchema(env);
  const row = await env.VIVI_D1
    .prepare(`SELECT created_by_user_id AS createdByUserId FROM rbac_users WHERE id = ?1 LIMIT 1`)
    .bind(userId)
    .first<{ createdByUserId: string }>();
  return String(row?.createdByUserId ?? "").trim();
}

const permissionRowMap = (rows: RbacPermissionRow[]) => {
  const map = new Map<string, RbacPermissionRow>();
  for (const row of rows) {
    const pagePath = String(row?.pagePath ?? "").trim();
    if (!pagePath) continue;
    map.set(pagePath, row);
  }
  return map;
};

const permissionsAreWithinScope = (actorRows: RbacPermissionRow[], targetRows: RbacPermissionRow[]) => {
  const actorMap = permissionRowMap(actorRows);
  for (const target of targetRows) {
    const pagePath = String(target?.pagePath ?? "").trim();
    if (!pagePath) continue;
    const actor = actorMap.get(pagePath);
    if (target.view && !actor?.view) return false;
    if (target.edit && !actor?.edit) return false;
    if (target.delete && !actor?.delete) return false;
  }
  return true;
};

type RbacActorContext = {
  principal: Awaited<ReturnType<typeof getPrincipal>>;
  isAdmin: boolean;
  isTenantAdmin: boolean;
  isSupport: boolean;
  isOwnSupport: boolean;
  isDealerSupport: boolean;
  isDatabaseSupport: boolean;
  isAdvanced: boolean;
  isImpersonating: boolean;
  userId: string;
  allowedTenants: string[];
  roleIds: string[];
  roleNames: string[];
  roleLevels: number[];
  highestPrivilegeRoleLevel: number;
  permissions: RbacPermissionRow[];
  siteIds: string[];
};

async function ensureDefaultSupportSecurityGroups(env: Env, tenantId: string): Promise<void> {
  const defaults = ["Dealer Support", "Database Support"];
  const existing = await env.VIVI_D1
    .prepare(`SELECT LOWER(name) AS name FROM rbac_security_groups WHERE tenant_id = ?1`)
    .bind(tenantId)
    .all<{ name: string }>();
  const have = new Set((existing.results ?? []).map((row) => String(row?.name ?? "").trim()));
  const missing = defaults.filter((name) => !have.has(name.toLowerCase()));
  if (!missing.length) return;
  await ensureStandardRolesForTenant(env.VIVI_D1, tenantId);
  const now = new Date().toISOString();
  for (const name of missing) {
    const role = await env.VIVI_D1
      .prepare(`SELECT id FROM rbac_roles WHERE tenant_id = ?1 AND LOWER(name) = ?2 LIMIT 1`)
      .bind(tenantId, name.toLowerCase())
      .first<{ id: string }>();
    const groupId = uuid();
    await env.VIVI_D1
      .prepare(
        `INSERT INTO rbac_security_groups (id, tenant_id, name, description, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)`
      )
      .bind(groupId, tenantId, name, `Default ${name} group`, now)
      .run();
    if (role?.id) {
      await env.VIVI_D1
        .prepare(`INSERT OR REPLACE INTO rbac_group_roles (tenant_id, group_id, role_id) VALUES (?1, ?2, ?3)`)
        .bind(tenantId, groupId, role.id)
        .run();
    }
  }
}

async function readRbacActorContext(request: Request, env: Env, tenantId: string): Promise<RbacActorContext | null> {
  const principal = await getPrincipal(request, env);
  if (principal.kind === "admin") {
    return {
      principal,
      isAdmin: true,
      isTenantAdmin: true,
      isSupport: true,
      isOwnSupport: true,
      isDealerSupport: false,
      isDatabaseSupport: false,
      isAdvanced: true,
      isImpersonating: false,
      userId: "",
      allowedTenants: [],
      roleIds: [],
      roleNames: [],
      roleLevels: [],
      highestPrivilegeRoleLevel: 0,
      permissions: [],
      siteIds: []
    };
  }
  if (principal.kind !== "user") return null;

  const sessionPayload = await getUserSessionPayload(env, principal.token);
  const isImpersonating = Boolean(sessionPayload?.impersonatedBy);
  const allowedTenants = await ensureTenantGrantsFromSiteAssignments(env, principal.userId);
  const databaseRoles = tenantId ? await readDatabaseRolesForUser(env, tenantId, principal.userId) : [];
  const roleIds = Array.from(new Set(databaseRoles.map((row) => row.roleId).filter(Boolean)));
  const roleNames = Array.from(new Set(databaseRoles.map((row) => row.roleName).filter(Boolean)));
  const roleLevels = databaseRoles.map((row) => row.roleLevel).filter((level) => Number.isFinite(level));
  const permissions = await readPermissionsForSession(env, tenantId, principal.userId);
  const siteIds = principal.userId
    ? await readAllAssignedSiteIdsForUser(env, principal.userId)
    : [];
  const isTenantAdmin = roleNames.some((name) => isAdminLikeRoleName(name));
  const isOwnSupport = isTenantAdmin || roleNames.some((name) => isOwnSupportLikeRoleName(name));
  const isDealerSupport = roleNames.some((name) => isDealerSupportLikeRoleName(name));
  const isDatabaseSupport = !isTenantAdmin && !isOwnSupport && !isDealerSupport && roleNames.some((name) => isDatabaseSupportLikeRoleName(name));
  const isSupport = isTenantAdmin || isOwnSupport || isDealerSupport || isDatabaseSupport || roleNames.some((name) => isSupportLikeRoleName(name));
  const isAdvanced =
    isTenantAdmin ||
    isOwnSupport ||
    isDealerSupport ||
    isDatabaseSupport ||
    roleNames.some((name) => isAdvancedLikeRoleName(name));

  // Impersonation sessions keep the target identity but must not 401 when the admin/support
  // browser still has a previous tenant header that the target user does not own.
  if (
    tenantId &&
    !actorCanAccessTenantId(allowedTenants, tenantId) &&
    !isTenantAdmin &&
    !isOwnSupport &&
    !isImpersonating
  ) {
    return null;
  }

  return {
    principal,
    isAdmin: false,
    isTenantAdmin,
    isSupport,
    isOwnSupport,
    isDealerSupport,
    isDatabaseSupport,
    isAdvanced,
    isImpersonating,
    userId: principal.userId,
    allowedTenants,
    roleIds,
    roleNames,
    roleLevels,
    highestPrivilegeRoleLevel: roleLevels.length ? Math.min(...roleLevels) : 100,
    permissions,
    siteIds
  };
}

function roleIsAtOrAboveDealerSupport(name: string, standardKey: string): boolean {
  const key = String(standardKey ?? "").trim().toLowerCase();
  if (key === "admin" || key === "own-support" || key === "dealer-support") return true;
  return isAdminLikeRoleName(name) || isOwnSupportLikeRoleName(name) || isDealerSupportLikeRoleName(name);
}

async function readVisibleRoleIdsForActor(env: Env, tenantId: string, actor: RbacActorContext): Promise<string[]> {
  if (actor.isAdmin || actor.isTenantAdmin) {
    const rows = await env.VIVI_D1
      .prepare(`SELECT id FROM rbac_roles WHERE tenant_id = ?1 ORDER BY COALESCE(role_level, 100) ASC, name ASC, id ASC`)
      .bind(tenantId)
      .all<{ id: string }>();
    return (rows.results ?? []).map((row: any) => String(row?.id ?? "").trim()).filter(Boolean);
  }

  // Roles the actor actually holds (direct + security group).
  const assigned = await readDirectRolesForUser(env, tenantId, actor.userId || "");
  const assignedIds = new Set(assigned.map((row) => String(row.roleId ?? "").trim()).filter(Boolean));

  // Managers may also see equal/lower-privilege roles so they can assign them.
  const canManageRoles = actor.isOwnSupport || actor.isDealerSupport || actor.isSupport;
  if (canManageRoles) {
    const rows = await env.VIVI_D1
      .prepare(
        `SELECT id, name, COALESCE(standard_role_key, '') AS standardRoleKey FROM rbac_roles WHERE tenant_id = ?1 AND COALESCE(role_level, 100) >= ?2 ORDER BY COALESCE(role_level, 100) ASC, name ASC, id ASC`
      )
      .bind(tenantId, actor.highestPrivilegeRoleLevel)
      .all<{ id: string; name: string; standardRoleKey: string }>();
    return (rows.results ?? [])
      .filter((row: any) => {
        const id = String(row?.id ?? "").trim();
        if (assignedIds.has(id)) return true;
        // Database Support must never see or assign Dealer Support / Own Support / Admin rights.
        if (actor.isDatabaseSupport && !actor.isDealerSupport && !actor.isOwnSupport) {
          return !roleIsAtOrAboveDealerSupport(String(row?.name ?? ""), String(row?.standardRoleKey ?? ""));
        }
        return true;
      })
      .map((row: any) => String(row?.id ?? "").trim())
      .filter(Boolean);
  }

  // Everyone else: only roles already given to them (group or direct). Unassigned roles are invisible.
  return Array.from(assignedIds);
}

async function readHighestPrivilegeRoleLevelForUser(env: Env, tenantId: string, userId: string): Promise<number> {
  const roles = await readDirectRolesForUser(env, tenantId, userId);
  const levels = roles.map((row) => row.roleLevel).filter((level) => Number.isFinite(level));
  return levels.length ? Math.min(...levels) : 100;
}

async function backfillLegacyUserTenantMembership(env: Env, tenantId: string): Promise<void> {
  const scopedTenant = normalizeId(tenantId);
  if (!scopedTenant) return;
  const now = new Date().toISOString();
  const parts = scopedTenant.split(":").map((p) => normalizeId(p)).filter(Boolean);
  const dbId = parts.length >= 3 ? parts[2] : parts[parts.length - 1] || "";
  const legacyTenantIds = Array.from(
    new Set([scopedTenant, dbId, parts.length >= 2 ? `${parts[parts.length - 2]}:${parts[parts.length - 1]}` : ""].filter(Boolean))
  );

  // Repair missing membership rows from roles / sites / groups (exact + legacy short tenant ids).
  for (const legacyTenantId of legacyTenantIds) {
    await env.VIVI_D1
      .prepare(
        `INSERT OR IGNORE INTO rbac_user_tenants (tenant_id, user_id, created_at)
         SELECT ?1, linked.user_id, ?2
         FROM (
           SELECT user_id FROM rbac_user_roles WHERE tenant_id = ?3
           UNION
           SELECT user_id FROM rbac_user_sites WHERE tenant_id = ?3
           UNION
           SELECT user_id FROM rbac_user_groups WHERE tenant_id = ?3
         ) AS linked
         WHERE TRIM(COALESCE(linked.user_id, '')) != ''`
      )
      .bind(scopedTenant, now, legacyTenantId)
      .run();
  }

  // Also attach users whose role/site tenant_id ends with ":{databaseId}" (pre-modules variants).
  if (dbId && scopedTenant.includes(":")) {
    const likeSuffix = `%:${dbId}`;
    await env.VIVI_D1
      .prepare(
        `INSERT OR IGNORE INTO rbac_user_tenants (tenant_id, user_id, created_at)
         SELECT ?1, linked.user_id, ?2
         FROM (
           SELECT user_id FROM rbac_user_roles WHERE tenant_id = ?1 OR tenant_id = ?3 OR tenant_id LIKE ?4
           UNION
           SELECT user_id FROM rbac_user_sites WHERE tenant_id = ?1 OR tenant_id = ?3 OR tenant_id LIKE ?4
           UNION
           SELECT user_id FROM rbac_user_groups WHERE tenant_id = ?1 OR tenant_id = ?3 OR tenant_id LIKE ?4
         ) AS linked
         WHERE TRIM(COALESCE(linked.user_id, '')) != ''`
      )
      .bind(scopedTenant, now, dbId, likeSuffix)
      .run();
  }
}

async function listRbacUserRowsForTenant(env: Env, tenantId: string): Promise<Record<string, unknown>[]> {
  const scopedTenant = normalizeId(tenantId);
  if (!scopedTenant) return [];
  const parts = scopedTenant.split(":").map((p) => normalizeId(p)).filter(Boolean);
  const dbId = parts.length >= 3 ? parts[2] : parts[parts.length - 1] || "";
  const likeSuffix = dbId ? `%:${dbId}` : scopedTenant;

  // Assignments come from the VPS; user identity (rbac_users) is joined in from D1 below.
  const rows = await env.VIVI_D1
    .prepare(
      `SELECT
         scope.user_id AS id,
         ?1 AS assignedTenantId,
         ?1 AS assignedTenantIds,
         us_scoped.assignedSiteId AS assignedSiteId,
         us_scoped.assignedSiteName AS assignedSiteName,
         us_scoped.assignedSiteIds AS assignedSiteIds,
         ur.role_id AS assignedRoleId,
         ur.role_level AS assignedRoleLevel,
         rr.name AS assignedRoleName
       FROM (
         SELECT user_id AS user_id FROM rbac_user_tenants WHERE tenant_id = ?1
         UNION
         SELECT user_id FROM rbac_user_roles WHERE tenant_id = ?1 OR (?2 != '' AND (tenant_id = ?2 OR tenant_id LIKE ?3))
         UNION
         SELECT user_id FROM rbac_user_sites WHERE tenant_id = ?1 OR (?2 != '' AND (tenant_id = ?2 OR tenant_id LIKE ?3))
         UNION
         SELECT user_id FROM rbac_user_groups WHERE tenant_id = ?1 OR (?2 != '' AND (tenant_id = ?2 OR tenant_id LIKE ?3))
       ) AS scope
       LEFT JOIN (
         SELECT user_id,
                MIN(site_id) AS assignedSiteId,
                MIN(site_name) AS assignedSiteName,
                GROUP_CONCAT(site_id) AS assignedSiteIds
         FROM rbac_user_sites
         WHERE tenant_id = ?1 OR (?2 != '' AND (tenant_id = ?2 OR tenant_id LIKE ?3))
         GROUP BY user_id
       ) us_scoped ON us_scoped.user_id = scope.user_id
       LEFT JOIN (
         SELECT rbac_user_roles.user_id AS user_id,
                MIN(rbac_user_roles.role_id) AS role_id,
                MIN(COALESCE(rbac_roles.role_level, 100)) AS role_level
         FROM rbac_user_roles
         LEFT JOIN rbac_roles
           ON rbac_roles.id = rbac_user_roles.role_id
          AND rbac_roles.tenant_id = rbac_user_roles.tenant_id
         WHERE rbac_user_roles.tenant_id = ?1
            OR (?2 != '' AND (rbac_user_roles.tenant_id = ?2 OR rbac_user_roles.tenant_id LIKE ?3))
         GROUP BY rbac_user_roles.user_id
       ) ur ON ur.user_id = scope.user_id
       LEFT JOIN rbac_roles rr ON rr.id = ur.role_id AND (rr.tenant_id = ?1 OR rr.tenant_id = ?2 OR rr.tenant_id LIKE ?3)`
    )
    .bind(scopedTenant, dbId || "", likeSuffix)
    .all<Record<string, unknown>>();

  const assignments = Array.isArray(rows.results) ? rows.results : [];
  const users = await readRbacUsersByIds(env.VIVI_D1, assignments.map((row) => row.id), { full: true });
  const creators = await readRbacUsersByIds(
    env.VIVI_D1,
    [...users.values()].map((user) => user.createdByUserId).filter((id) => id && !users.has(id))
  );
  const nameOf = (id: string | null) => (id ? (users.get(id) ?? creators.get(id))?.name ?? null : null);
  return assignments
    .flatMap((row) => {
      const user = users.get(String(row.id ?? ""));
      if (!user) return [];
      return [
        {
          ...row,
          id: user.id,
          name: user.name,
          email: user.email,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt,
          createdByUserId: user.createdByUserId,
          createdByName: nameOf(user.createdByUserId)
        }
      ];
    })
    .sort((a, b) => compareSqliteText(b.updatedAt, a.updatedAt));
}

async function canActorSeeUserInTenant(
  env: Env,
  tenantId: string,
  actor: RbacActorContext,
  targetUserId: string,
  options?: { skipMembershipCheck?: boolean }
): Promise<boolean> {
  const targetId = normalizeId(targetUserId);
  if (!targetId) return false;
  if (actor.isAdmin || actor.isTenantAdmin) return true;
  if (!actor.userId) return false;
  if (targetId === actor.userId) return true;

  const scopedTenant = normalizeId(tenantId);
  const parts = scopedTenant.split(":").map((p) => normalizeId(p)).filter(Boolean);
  const dbId = parts.length >= 3 ? parts[2] : parts[parts.length - 1] || "";
  const likeSuffix = dbId ? `%:${dbId}` : scopedTenant;

  // Users are independent of site/org/dealer browsing — visibility is by database + privilege only.
  const targetTenant = options?.skipMembershipCheck
    ? { ok: 1 }
    : await env.VIVI_D1
    .prepare(
      `SELECT 1 AS ok FROM (
         SELECT user_id FROM rbac_user_tenants WHERE tenant_id = ?1 AND user_id = ?2
         UNION
         SELECT user_id FROM rbac_user_roles
           WHERE user_id = ?2 AND (tenant_id = ?1 OR (?3 != '' AND (tenant_id = ?3 OR tenant_id LIKE ?4)))
         UNION
         SELECT user_id FROM rbac_user_sites
           WHERE user_id = ?2 AND (tenant_id = ?1 OR (?3 != '' AND (tenant_id = ?3 OR tenant_id LIKE ?4)))
         UNION
         SELECT user_id FROM rbac_user_groups
           WHERE user_id = ?2 AND (tenant_id = ?1 OR (?3 != '' AND (tenant_id = ?3 OR tenant_id LIKE ?4)))
       ) LIMIT 1`
    )
    .bind(scopedTenant, targetId, dbId || "", likeSuffix)
    .first<{ ok: number }>();
  if (!targetTenant) return false;

  // Non–Own Support actors may only see users under databases they can access.
  if (!actor.isOwnSupport && actor.allowedTenants.length > 0) {
    if (!actorCanAccessTenantId(actor.allowedTenants, scopedTenant)) return false;
  }

  // Never see accounts with higher rights than the actor.
  const targetHighestPrivilegeRoleLevel = await readHighestPrivilegeRoleLevelForUser(env, tenantId, targetId);
  if (targetHighestPrivilegeRoleLevel < actor.highestPrivilegeRoleLevel) return false;

  return true;
}

const filterHierarchyForTenantScope = (
  hierarchy: HierarchyRoot,
  tenantId: string,
  siteIds: string[],
  roleNames: string[] = [],
  isPlatformAdmin = false,
  allowedTenantIds: string[] = [],
  siteNames: string[] = []
) =>
  filterHierarchyForActorScope(
    hierarchy as Parameters<typeof filterHierarchyForActorScope>[0],
    allowedTenantIds.length ? allowedTenantIds : tenantId ? [tenantId] : [],
    siteIds,
    roleNames,
    isPlatformAdmin,
    siteNames
  ) as HierarchyRoot;

const actorHierarchyRoleKey = (actor: RbacActorContext): string[] => {
  if (actor.isAdmin || actor.isTenantAdmin) return ["Admin"];
  if (actor.isOwnSupport) return ["Own Support"];
  if (actor.isDealerSupport) return ["Dealer Support"];
  if (actor.isDatabaseSupport) return ["Database Support"];
  if (actor.isAdvanced) return ["Advanced User"];
  if (Array.isArray(actor.roleNames) && actor.roleNames.length) return actor.roleNames;
  return ["Basic User"];
};

const canActorManageHierarchySegment = (
  actor: RbacActorContext,
  segment: HierarchySegment,
  action: HierarchyAction = "edit"
) => {
  const rules = resolveRoleScopeRules(actorHierarchyRoleKey(actor));
  return canManageHierarchyLevel(rules, segment, action);
};

const actorCanAccessSiteTarget = (actor: RbacActorContext, siteId: string) => {
  const target = normalizeId(siteId);
  if (!target) return false;
  if (actor.isAdmin || actor.isOwnSupport) return true;
  if (actor.isDealerSupport || actor.isDatabaseSupport || actor.isAdvanced) {
    if (!actor.siteIds.length) return true;
    return actor.siteIds.includes(target);
  }
  // End users (including Basic User) may touch sites they are assigned to.
  if (!actor.siteIds.length) return false;
  return actor.siteIds.includes(target);
};

const actorCanAccessTenantId = (allowedTenants: string[], tenantId: string) => {
  const target = String(tenantId ?? "").trim();
  if (!target) return false;
  return allowedTenants.some((raw) => {
    const allowed = String(raw ?? "").trim();
    if (!allowed) return false;
    if (allowed === target) return true;
    // Composite database tenant under an allowed dealer/org allocation.
    if (target.startsWith(`${allowed}:`)) return true;
    // Legacy base-tenant checks against a concrete database allocation.
    if (allowed.startsWith(`${target}:`)) return true;
    return false;
  });
};

async function requireRbacPermission(request: Request, env: Env, tenantId: string, pagePath: string, action: "view" | "edit" | "delete") {
  const principal = await getPrincipal(request, env);
  if (principal.kind === "admin") return null;
  if (principal.kind !== "user") return unauthorized();
  if (!tenantId) return unauthorized();

  const allowedTenants = await ensureTenantGrantsFromSiteAssignments(env, principal.userId);
  const databaseRoles = await readDatabaseRolesForUser(env, tenantId, principal.userId);
  const roleNames = Array.from(new Set(databaseRoles.map((row) => row.roleName).filter(Boolean)));
  const isTenantAdmin = roleNames.some((name) => isAdminLikeRoleName(name));
  const isOwnSupport = isTenantAdmin || roleNames.some((name) => isOwnSupportLikeRoleName(name));

  if (!actorCanAccessTenantId(allowedTenants, tenantId) && !isTenantAdmin && !isOwnSupport) {
    return unauthorized();
  }

  const perms = await readPermissionsForSession(env, tenantId, principal.userId);

  const row = perms.find((p) => p.pagePath === pagePath);
  const ok = action === "view" ? Boolean(row?.view) : action === "edit" ? Boolean(row?.edit) : Boolean(row?.delete);
  if (!ok) return forbidden();
  return null;
}

async function sendMailchannelsEmail(input: {
  to: string;
  from: string;
  fromName?: string;
  subject: string;
  text: string;
}) {
  const payload = {
    personalizations: [{ to: [{ email: input.to }] }],
    from: { email: input.from, ...(input.fromName ? { name: input.fromName } : {}) },
    subject: input.subject,
    content: [{ type: "text/plain", value: input.text }]
  };

  const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`MailChannels failed (${response.status}): ${text || response.statusText}`);
  }
}

async function sendResendEmail(input: {
  apiKey: string;
  to: string;
  from: string;
  fromName?: string;
  subject: string;
  text: string;
  replyTo?: string;
}) {
  const from = input.fromName ? `${input.fromName} <${input.from}>` : input.from;
  const replyTo = String(input.replyTo ?? "").trim();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(replyTo ? { reply_to: replyTo } : {})
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Resend failed (${response.status}): ${text || response.statusText}`);
  }
}

async function getPatIndex(env: Env): Promise<string[]> {
  const raw = await env.ViviTEL.get(PAT_INDEX_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

async function setPatIndex(env: Env, ids: string[]) {
  await env.ViviTEL.put(PAT_INDEX_KEY, JSON.stringify(ids));
}

async function readPat(env: Env, id: string): Promise<PersonalAccessToken | null> {
  const raw = await env.ViviTEL.get(`pat:${id}`);
  if (!raw) return null;
  const token = JSON.parse(raw) as PersonalAccessToken;
  const expiry = new Date(token.expiryDate);
  token.daysToExpiry = daysUntil(expiry);
  return token;
}

async function writePat(env: Env, token: PersonalAccessToken) {
  await env.ViviTEL.put(`pat:${token.id}`, JSON.stringify(token));
}

async function listPats(env: Env): Promise<PersonalAccessToken[]> {
  const ids = await getPatIndex(env);
  const tokens: PersonalAccessToken[] = [];
  for (const id of ids) {
    const pat = await readPat(env, id);
    if (pat) tokens.push(pat);
  }
  return tokens;
}

async function createPat(
  env: Env,
  input: {
    description?: string;
    organisationName?: string;
    organisationGroup?: string;
    expiryDays?: number;
    username?: string;
  }
): Promise<PersonalAccessToken> {
  const id = uuid();
  const tokenValue = crypto.randomUUID().replace(/-/g, "");
  const now = new Date();
  const expiryDays = Math.min(Math.max(input.expiryDays ?? 180, 30), 365);
  const expiryDate = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

  const pat: PersonalAccessToken = {
    id,
    token: tokenValue,
    description: input.description ?? "Personal access token",
    organisationName: input.organisationName ?? "",
    organisationGroup: input.organisationGroup,
    expiryDate: expiryDate.toISOString(),
    status: "Active",
    daysToExpiry: expiryDays,
    username: input.username ?? "",
    createdAt: now.toISOString()
  };

  const ids = await getPatIndex(env);
  ids.push(id);
  await writePat(env, pat);
  await setPatIndex(env, ids);
  return pat;
}

async function revokePat(env: Env, id: string): Promise<PersonalAccessToken | null> {
  const pat = await readPat(env, id);
  if (!pat) return null;
  pat.status = "Revoked";
  await writePat(env, pat);
  return pat;
}

const d1SchemaReady = new WeakSet<object>();

/**
 * Operational tables are no longer created or written on Cloudflare D1
 * (credentials/RBAC only — see d1CredentialGate + data-storage-policy).
 * Operational data lives on the VPS (SQLite/Valkey) and Backblaze B2.
 * Legacy D1 rows remain readable as a one-time migration fallback.
 */
async function ensureD1Tables(env: Env) {
  const db = env.VIVI_D1 as object | undefined;
  if (db && d1SchemaReady.has(db)) return;
  if (db) d1SchemaReady.add(db);
}

/** Best-effort read of legacy D1 operational rows (never writes). */
async function listLegacyD1Entities(env: Env, table: string, tenantId: string): Promise<Record<string, unknown>[]> {
  try {
    const result = await env.VIVI_D1.prepare(
      `SELECT id, data, updated_at FROM ${table} WHERE tenant_id = ? ORDER BY updated_at DESC`
    )
      .bind(tenantId)
      .all();
    return (result.results ?? [])
      .map((row) => {
        try {
          const parsed = JSON.parse(String((row as any).data ?? ""));
          if (parsed && typeof parsed === "object" && !normalizeId((parsed as any).id)) {
            (parsed as any).id = normalizeId((row as any).id);
          }
          return parsed;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

async function listBindingsByType(env: Env, tenantId: string, type: string) {
  const fromVps = await listBindingsFromVps(env, tenantId, type);
  if (fromVps !== null) return fromVps;
  // Legacy D1 read-only fallback (never writes).
  await ensureD1Tables(env);
  try {
    const result = await env.VIVI_D1.prepare(
      "SELECT data FROM bindings WHERE tenant_id = ? AND type = ? ORDER BY updated_at DESC"
    )
      .bind(tenantId, type)
      .all();
    return (result.results ?? [])
      .map((row) => {
        try {
          return JSON.parse(String((row as { data?: unknown }).data ?? ""));
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

async function listConfigurationGroups(env: Env, tenantId: string) {
  const fromVps = await listEntitiesFromVps(env, "configuration_groups", tenantId);
  if (fromVps !== null) return fromVps;
  return listLegacyD1Entities(env, "configuration_groups", tenantId);
}

const normalizeConfigGroupKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

const isDefaultConfigurationGroupRef = (value: unknown) => {
  const key = normalizeConfigGroupKey(value);
  return !key || key === "default" || key === "default-group" || key === "default group";
};

/** Prefer the sole non-default configuration group for a site when assigning new assets. */
async function resolvePreferredConfigurationGroupForSite(
  env: Env,
  tenantId: string,
  siteName: string
): Promise<Record<string, unknown> | null> {
  const site = String(siteName ?? "").trim();
  if (!site) return null;
  const groups = await listConfigurationGroups(env, tenantId);
  const siteGroups = groups.filter((group) => {
    const groupSite = normalizeConfigGroupKey((group as any).site);
    if (groupSite !== normalizeConfigGroupKey(site)) return false;
    return !isDefaultConfigurationGroupRef((group as any).id) && !isDefaultConfigurationGroupRef((group as any).name);
  });
  return siteGroups.length === 1 ? siteGroups[0] : null;
}

async function ensureDefaultConfigurationGroup(env: Env, tenantId: string): Promise<string> {
  const groups = await listConfigurationGroups(env, tenantId);
  const existing =
    resolveByNameOrId(groups as any, "default") ??
    resolveByNameOrId(groups as any, "default-group") ??
    groups[0] ??
    null;
  if (existing) return String((existing as any).id ?? "default-group").trim() || "default-group";

  const id = "default-group";
  const now = new Date().toISOString();
  const payload = {
    id,
    name: "Default",
    description: "Auto-created for asset import",
    createdAt: now,
    updatedAt: now
  };
  await env.VIVI_D1.prepare(
    "INSERT INTO configuration_groups (id, tenant_id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id, tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  )
    .bind(id, tenantId, JSON.stringify(payload), now)
    .run();
  return id;
}

async function resolveConfigurationGroupIdForAsset(
  env: Env,
  tenantId: string,
  siteName: string,
  requestedGroup?: string
): Promise<string> {
  const requested = String(requestedGroup ?? "").trim();
  if (requested && !isDefaultConfigurationGroupRef(requested)) {
    const groups = await listConfigurationGroups(env, tenantId);
    const match = resolveByNameOrId(groups as any, requested);
    if (match) return String((match as any).id ?? requested).trim() || requested;
    return requested;
  }
  const preferred = await resolvePreferredConfigurationGroupForSite(env, tenantId, siteName);
  if (preferred) return String((preferred as any).id ?? "").trim() || (await ensureDefaultConfigurationGroup(env, tenantId));
  return ensureDefaultConfigurationGroup(env, tenantId);
}

async function importAssetsFromTraccar(
  env: Env,
  tenantId: string,
  siteName: string
): Promise<{
  imported: number;
  skipped: number;
  updated: number;
  phonesRepaired: number;
  totalDevices: number;
  error?: string;
  details?: unknown;
  upstreamStatus?: number;
}> {
  // Shared Demo and a demo account's own database start empty. Customer vehicles stay on their own sites.
  if (await fleetImportBlockedForTenant(env, tenantId)) {
    return { imported: 0, skipped: 0, updated: 0, phonesRepaired: 0, totalDevices: 0 };
  }
  const devicesResp = await traccarFetch(env, "/api/devices?all=true");
  if (!devicesResp.ok) {
    const detail =
      devicesResp.body && typeof devicesResp.body === "object"
        ? devicesResp.body
        : { raw: devicesResp.body };
    const message =
      String((detail as any)?.error ?? (detail as any)?.message ?? "").trim() ||
      "Failed to list Traccar devices";
    return {
      imported: 0,
      skipped: 0,
      updated: 0,
      phonesRepaired: 0,
      totalDevices: 0,
      error: message,
      details: detail,
      upstreamStatus: devicesResp.status
    };
  }
  const devices = Array.isArray(devicesResp.body) ? devicesResp.body : [];
  const configGroupId = await resolveConfigurationGroupIdForAsset(env, tenantId, siteName);
  const fallbackSite = String(siteName ?? "").trim() || "Default";

  const groupNameById = new Map<number, string>();
  const groupsResp = await traccarFetch(env, "/api/groups");
  if (groupsResp.ok && Array.isArray(groupsResp.body)) {
    for (const row of groupsResp.body as any[]) {
      const id = Number((row as any)?.id ?? 0);
      const name = String((row as any)?.name ?? "").trim();
      if (Number.isFinite(id) && id > 0 && name) groupNameById.set(id, name);
    }
  }

  let imported = 0;
  let skipped = 0;
  let updated = 0;
  let phonesRepaired = 0;

  const knownGroupNames = Array.from(groupNameById.values());
  const namingExtras = { knownGroupNames };

  const hasUserValue = (value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    return lower !== "—" && lower !== "-" && lower !== "n/a" && lower !== "null" && lower !== "undefined";
  };

  const looksLikeImeiDeviceName = (value: unknown, imeiValue: string) => {
    const raw = String(value ?? "").trim();
    if (!raw) return true;
    if (imeiValue && raw === imeiValue) return true;
    return /^\d{10,17}$/.test(raw);
  };

  const pickNonImeiLabel = (imeiValue: string, ...values: unknown[]) => {
    for (const value of values) {
      const raw = String(value ?? "").trim();
      if (raw && !looksLikeImeiDeviceName(raw, imeiValue)) return raw;
    }
    return "";
  };

  const resolveImportedAssetNames = (device: Record<string, unknown>, imeiValue: string) => {
    const attrs =
      device?.attributes && typeof device.attributes === "object"
        ? (device.attributes as Record<string, unknown>)
        : {};
    const deviceName = String(device?.name ?? "").trim();
    const make = String(attrs.make ?? "").trim();
    const registration = pickNonImeiLabel(
      imeiValue,
      attrs.registration,
      attrs.regNumber,
      attrs.reg,
      looksLikeImeiDeviceName(deviceName, imeiValue) ? "" : deviceName
    );
    let description = pickNonImeiLabel(
      imeiValue,
      attrs.assetDescription,
      attrs.description,
      looksLikeImeiDeviceName(deviceName, imeiValue) ? "" : deviceName
    );
    if (make && registration) {
      const composed = `${make} ${registration}`.replace(/\s+/g, " ").trim();
      const descKey = description.toLowerCase();
      const regKey = registration.toLowerCase();
      if (!description || descKey === regKey || descKey.includes(regKey)) {
        description = !description || descKey === regKey ? composed : description;
      }
    }
    return {
      assetDescription: description || registration,
      registration
    };
  };

  const pushCorrectedPhoneToTraccar = async (assetPayload: Record<string, unknown>, devicePhone: string) => {
    const desiredPhone = resolveAssetDatabaseLabel(assetPayload, namingExtras);
    const currentPhone = String(devicePhone ?? "").trim();
    if (currentPhone === desiredPhone && !looksLikeMisplacedDatabaseLabel(currentPhone, namingExtras)) {
      return false;
    }
    const sync = await syncDeviceJobToTraccar(env, {
      ...assetPayload,
      database: desiredPhone
    }, tenantId);
    return Boolean(sync.synced);
  };

  // Fields owned by the user / Assets UI — never clobber on Traccar re-sync.
  const USER_OWNED_KEYS = [
    "mobileDevice",
    "device",
    "mobileModel",
    "configGroup",
    "configurationGroup",
    "status",
    "assetStatus",
    "assetDescription",
    "registration",
    "fleetNumber",
    "make",
    "model",
    "year",
    "vin",
    "country",
    "assetType",
    "odometer",
    "engineHours",
    "camera",
    "cameraModel",
    "cameraSerial",
    "firmware",
    "imsi",
    "msisdn",
    "defaultDriver",
    "driverName",
    "hasDefaultDriver",
    "expiryMode",
    "expiryDate",
    "statusNotes",
    "faults"
  ] as const;

  for (const device of devices) {
    const imei = String((device as any)?.uniqueId ?? "").trim();
    const name = String((device as any)?.name ?? "").trim() || imei;
    if (!imei) {
      skipped += 1;
      continue;
    }
    const id = `asset-${imei}`;
    const mapped = resolveViviFieldsFromTraccarDevice(device as any, groupNameById);
    const existingMatches = (await findAssetsByImei(env, tenantId, imei)) as unknown as Record<string, unknown>[];
    const existing = pickBestAssetForImei(existingMatches);
    const existingId = existing ? String((existing as any).id ?? id) : id;

    if (existing) {
      // Update path: refresh Traccar linkage + fill blank hierarchy only. Keep user edits.
      const patch: Record<string, unknown> = {
        id: existingId,
        imei,
        hierarchyNamingVersion: "2",
        traccarDeviceId: Number((device as any)?.id) || (existing as any).traccarDeviceId,
        traccarGroupId: Number((device as any)?.groupId) || (existing as any).traccarGroupId,
        importedFrom: "traccar",
        lastTraccarSyncAt: new Date().toISOString()
      };
      if (!hasUserValue((existing as any).site) && mapped.site) patch.site = mapped.site;
      else if (!hasUserValue((existing as any).site) && fallbackSite) patch.site = fallbackSite;
      if (!hasUserValue((existing as any).dealer) && mapped.dealer) patch.dealer = mapped.dealer;
      if (!hasUserValue((existing as any).organisation) && mapped.organisation) {
        patch.organisation = mapped.organisation;
      }
      const existingDatabaseClean = resolveAssetDatabaseLabel(existing as any, namingExtras);
      const existingDatabaseRaw = String((existing as any).database ?? "").trim();
      if (existingDatabaseRaw && !existingDatabaseClean) {
        // Wipe config-group / Traccar-group names incorrectly stored as database (Phone).
        patch.database = "";
      } else if (!hasUserValue(existingDatabaseClean) && mapped.database) {
        patch.database = mapped.database;
      }
      if (
        mapped.deviceModel &&
        !hasUserValue((existing as any).mobileModel) &&
        !hasUserValue((existing as any).device)
      ) {
        patch.mobileModel = mapped.deviceModel;
        patch.device = mapped.deviceModel;
      }
      // Explicitly do not set mobileDevice / configGroup / status / description here.
      for (const key of USER_OWNED_KEYS) {
        if (key in patch) delete (patch as any)[key];
      }
      const names = resolveImportedAssetNames(device as Record<string, unknown>, imei);
      const existingDescription = String((existing as any).assetDescription ?? "").trim();
      const existingRegistration = String((existing as any).registration ?? "").trim();
      const nextDescription = String(names.assetDescription ?? "").trim();
      const nextRegistration = String(names.registration ?? "").trim();
      // Never "upgrade" a blank/IMEI description to another IMEI-like Traccar device name.
      if (
        nextDescription &&
        !looksLikeImeiDeviceName(nextDescription, imei) &&
        (!hasUserValue(existingDescription) || looksLikeImeiDeviceName(existingDescription, imei))
      ) {
        patch.assetDescription = nextDescription;
      }
      if (
        nextRegistration &&
        !looksLikeImeiDeviceName(nextRegistration, imei) &&
        (!hasUserValue(existingRegistration) || looksLikeImeiDeviceName(existingRegistration, imei))
      ) {
        patch.registration = nextRegistration;
      }
      const result = await upsertAssetMerged(env, tenantId, patch);
      if (!result.ok) {
        skipped += 1;
        continue;
      }
      const mergedAsset = { ...(existing as any), ...patch };
      // Push corrected hierarchy to Traccar immediately so Phone shows Database (not group names).
      try {
        const repaired = await pushCorrectedPhoneToTraccar(
          mergedAsset,
          String((device as any)?.phone ?? "")
        );
        if (repaired) phonesRepaired += 1;
      } catch {
        // Keep import successful even if live Traccar repair fails.
      }
      try {
        await enqueueTraccarDeviceSyncJob(env, tenantId, existingId, mergedAsset, "upsert");
      } catch {
        // Keep import successful even if sync queueing fails.
      }
      updated += 1;
      continue;
    }

    // Create path: seed from Traccar with defaults (user can edit later in Assets).
    // Do not set mobileDevice to "Traccar" — that label was clobbering the Assets column.
    const names = resolveImportedAssetNames(device as Record<string, unknown>, imei);
    const safeDescription = String(names.assetDescription ?? "").trim();
    const safeRegistration = String(names.registration ?? "").trim();
    const payload: Record<string, unknown> = {
      id: existingId,
      imei,
      // Prefer a real plate/name; never persist the Traccar uniqueId/IMEI as the description.
      assetDescription:
        (safeDescription && !looksLikeImeiDeviceName(safeDescription, imei) ? safeDescription : "") ||
        (safeRegistration && !looksLikeImeiDeviceName(safeRegistration, imei) ? safeRegistration : "") ||
        (looksLikeImeiDeviceName(name, imei) ? "" : name) ||
        "Unnamed asset",
      registration:
        (safeRegistration && !looksLikeImeiDeviceName(safeRegistration, imei) ? safeRegistration : "") ||
        (looksLikeImeiDeviceName(name, imei) ? "" : name),
      site: mapped.site || fallbackSite,
      dealer: mapped.dealer || undefined,
      organisation: mapped.organisation || undefined,
      database: mapped.database || undefined,
      hierarchyNamingVersion: "2",
      configGroup: configGroupId,
      status: "available",
      ...(mapped.deviceModel
        ? { mobileModel: mapped.deviceModel, device: mapped.deviceModel, mobileDevice: mapped.deviceModel }
        : {}),
      traccarDeviceId: Number((device as any)?.id) || undefined,
      traccarGroupId: Number((device as any)?.groupId) || undefined,
      importedFrom: "traccar",
      importedAt: new Date().toISOString()
    };
    const result = await upsertAssetMerged(env, tenantId, payload);
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    try {
      const repaired = await pushCorrectedPhoneToTraccar(
        payload,
        String((device as any)?.phone ?? "")
      );
      if (repaired) phonesRepaired += 1;
    } catch {
      // ignore
    }
    try {
      await enqueueTraccarDeviceSyncJob(env, tenantId, existingId, payload, "upsert");
    } catch {
      // ignore
    }
    imported += 1;
  }

  if (imported > 0 || updated > 0) await normalizeAssetIdsForTenant(env, tenantId);
  return { imported, skipped, updated, phonesRepaired, totalDevices: devices.length };
}


function resolveByNameOrId<T extends { id?: string; name?: string }>(items: T[], value: string) {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return (
    items.find((item) => String(item.id ?? "").trim().toLowerCase() === needle) ??
    items.find((item) => String(item.name ?? "").trim().toLowerCase() === needle) ??
    null
  );
}

const hasMeaningfulValue = (value: unknown) => {
  const raw = String(value ?? "").trim();
  return Boolean(raw) && raw !== "—";
};

const pickBestAssetForImei = (assets: Record<string, unknown>[]) => {
  if (!assets.length) return null;
  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  for (const asset of assets) {
    let score = 0;
    if (hasMeaningfulValue((asset as any).registration)) score += 3;
    if (hasMeaningfulValue((asset as any).assetDescription)) score += 3;
    if (hasMeaningfulValue((asset as any).fleetNumber)) score += 1;
    if (hasMeaningfulValue((asset as any).site)) score += 1;
    if (hasMeaningfulValue((asset as any).configGroup)) score += 2;
    if (hasMeaningfulValue((asset as any).model) || hasMeaningfulValue((asset as any).make)) score += 1;
    if (hasMeaningfulValue((asset as any).defaultDriver) || hasMeaningfulValue((asset as any).driverName)) score += 2;
    if ((asset as any).hasDefaultDriver === true) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = asset;
    }
  }
  return best;
};

async function getDeviceReportingSettingsForTenant(env: Env, tenantId: string) {
  await ensureD1Tables(env);
  const result = await env.VIVI_D1.prepare(
    "SELECT data FROM device_reporting_settings WHERE tenant_id = ?"
  )
    .bind(tenantId)
    .first();
  if (!result) return null;
  try {
    return JSON.parse(String((result as { data?: unknown }).data ?? ""));
  } catch {
    return null;
  }
}

async function getBaseArtifact(env: Env, tenantId: string, type: DeviceArtifactType) {
  await ensureD1Tables(env);
  const result = await env.VIVI_D1.prepare(
    "SELECT id, name, version, r2_key, content_type, sha256, is_base, created_at FROM device_artifacts WHERE tenant_id = ? AND type = ? ORDER BY is_base DESC, created_at DESC LIMIT 1"
  )
    .bind(tenantId, type)
    .first();
  if (!result) return null;
  return {
    id: String((result as any).id),
    name: String((result as any).name ?? ""),
    version: String((result as any).version ?? ""),
    r2Key: String((result as any).r2_key ?? ""),
    contentType: String((result as any).content_type ?? ""),
    sha256: String((result as any).sha256 ?? ""),
    isBase: Boolean((result as any).is_base),
    createdAt: String((result as any).created_at ?? "")
  } as DeviceArtifactRecord;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeDeviceSettingsPayload(
  basePayload: Record<string, unknown>,
  overridePayload: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...basePayload };
  for (const [key, value] of Object.entries(overridePayload)) {
    const current = merged[key];
    if (isRecordObject(current) && isRecordObject(value)) {
      merged[key] = mergeDeviceSettingsPayload(current, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

async function buildDeviceSettingsPayload(env: Env, tenantId: string, imei: string) {
  const assets = await findAssetsByImei(env, tenantId, imei);
  if (!assets.length) return { ok: false, message: "Asset not found for IMEI." } as const;
  const asset = assets[0] as Record<string, unknown>;
  const configGroupValue = String((asset as any).configGroup ?? "").trim();
  if (!configGroupValue) return { ok: false, message: "Asset has no configuration group." } as const;

  const groups = await listConfigurationGroups(env, tenantId);
  const group = resolveByNameOrId(groups as any, configGroupValue);
  if (!group) return { ok: false, message: "Configuration group not found." } as const;

  const [notificationBindings, locationBindings, deviceBindings] = await Promise.all([
    listBindingsByType(env, tenantId, "notifications"),
    listBindingsByType(env, tenantId, "locations"),
    listBindingsByType(env, tenantId, "devices")
  ]);

  const site = String((group as any).site ?? (asset as any).site ?? "").trim();
  const notificationRef = String((group as any).notificationBinding ?? "").trim();
  const locationRef = String((group as any).locationBinding ?? "").trim();
  const deviceRef = String((group as any).deviceBinding ?? "").trim();

  const notificationBinding = resolveBindingByRef(notificationBindings as any, notificationRef, site);
  const deviceBinding = resolveBindingByRef(deviceBindings as any, deviceRef, site);
  const locationBinding = locationRef
    ? resolveBindingByRef(locationBindings as any, locationRef, site)
    : null;

  const missing: string[] = [];
  if (!notificationRef) {
    missing.push("notification binding is not set on the configuration group");
  } else if (!notificationBinding) {
    missing.push(
      site
        ? `notification binding "${notificationRef}" not found for site "${site}"`
        : `notification binding "${notificationRef}" not found`
    );
  }
  if (!deviceRef) {
    missing.push("device binding is not set on the configuration group");
  } else if (!deviceBinding) {
    missing.push(
      site
        ? `device binding "${deviceRef}" not found for site "${site}"`
        : `device binding "${deviceRef}" not found`
    );
  }

  const needsLocation = deviceBindingNeedsLocation(deviceBinding as Record<string, unknown> | null);
  if (needsLocation) {
    if (!locationRef) {
      missing.push("location binding is required because the device binding has location monitoring enabled");
    } else if (!locationBinding) {
      missing.push(
        site
          ? `location binding "${locationRef}" not found for site "${site}"`
          : `location binding "${locationRef}" not found`
      );
    }
  } else if (locationRef && !locationBinding) {
    missing.push(
      site
        ? `location binding "${locationRef}" not found for site "${site}"`
        : `location binding "${locationRef}" not found`
    );
  }

  if (missing.length) {
    return { ok: false, message: `Configuration group bindings are missing: ${missing.join("; ")}.` } as const;
  }

  const deviceReportingSettings = await getDeviceReportingSettingsForTenant(env, tenantId);
  const baseFirmware = await getBaseArtifact(env, tenantId, "firmware");
  const baseConfig = await getBaseArtifact(env, tenantId, "config");

  return {
    ok: true,
    payload: {
      asset,
      configurationGroup: group,
      bindings: {
        notifications: notificationBinding,
        locations: locationBinding,
        devices: deviceBinding
      },
      deviceReportingSettings,
      baseArtifacts: {
        firmware: baseFirmware
          ? {
              id: baseFirmware.id,
              name: baseFirmware.name,
              version: baseFirmware.version,
              sha256: baseFirmware.sha256,
              downloadUrl: `/device/artifacts/${baseFirmware.id}`
            }
          : null,
        config: baseConfig
          ? {
              id: baseConfig.id,
              name: baseConfig.name,
              version: baseConfig.version,
              sha256: baseConfig.sha256,
              downloadUrl: `/device/artifacts/${baseConfig.id}`
            }
          : null
      }
    }
  } as const;
}

async function listEntity(env: Env, table: string, tenantId: string) {
  const fromVps = await listEntitiesFromVps(env, table, tenantId);
  if (fromVps !== null) return fromVps;
  return listLegacyD1Entities(env, table, tenantId);
}

async function readEntityById(env: Env, table: string, tenantId: string, id: string) {
  const entityId = normalizeId(id);
  if (!entityId) return null;
  const items = (await listEntity(env, table, tenantId)) as Record<string, unknown>[];
  return (
    items.find(
      (row) => normalizeId((row as any).id ?? (row as any).registration ?? (row as any).imei) === entityId
    ) ?? null
  );
}

async function findAssetsByImei(env: Env, tenantId: string, imei: string) {
  const needle = imei.trim();
  if (!needle) return [];
  const assets = (await listEntity(env, "assets", tenantId)) as Record<string, unknown>[];
  return assets.filter((row) => String((row as any)?.imei ?? "").trim() === needle);
}

async function findTenantIdsByImei(env: Env, imei: string) {
  await ensureD1Tables(env);
  const needle = String(imei ?? "").trim();
  if (!needle) return [] as string[];
  const rows = await env.VIVI_D1
    .prepare(`SELECT tenant_id FROM assets WHERE data LIKE ?1 OR data LIKE ?2 OR data LIKE ?3 ORDER BY updated_at DESC`)
    .bind(`%"imei":"${needle}"%`, `%"imei": "${needle}"%`, `%"imei":${needle}%`)
    .all<{ tenant_id?: string }>();
  const unique = new Set<string>();
  for (const row of rows.results ?? []) {
    const id = String((row as any)?.tenant_id ?? "").trim();
    if (!id) continue;
    unique.add(id);
  }
  return Array.from(unique);
}

async function upsertAssetMerged(env: Env, tenantId: string, patch: Record<string, unknown>) {
  const imei = String((patch as any).imei ?? "").trim();
  const explicitId = normalizeId((patch as any).id ?? (patch as any).registration ?? (patch as any).imei);

  let base: Record<string, unknown> | null = null;
  if (imei) {
    const matches = (await findAssetsByImei(env, tenantId, imei)) as unknown as Record<string, unknown>[];
    base = pickBestAssetForImei(matches);
  }

  const baseId = normalizeId((base as any)?.id ?? (base as any)?.registration ?? (base as any)?.imei);
  // Demo databases do not absorb vehicles that already belong to another site, or a bulk tracker import.
  if (!base && imei && (await fleetImportBlockedForTenant(env, tenantId))) {
    const imported = String((patch as any).importedFrom ?? "").trim().toLowerCase() === "traccar";
    const otherTenants = (await findTenantIdsByImei(env, imei)).filter((id) => id !== tenantId);
    if (imported || otherTenants.length) {
      return { ok: false, message: "This vehicle already belongs to another site." } as const;
    }
  }
  // If we found an existing asset for this IMEI, always prefer updating that record.
  const id = baseId || explicitId || (imei ? `asset-${imei}` : uuid());
  const merged = { ...(base ?? {}), ...patch, id };
  return upsertEntity(env, "assets", tenantId, merged);
}

async function upsertEntity(env: Env, table: string, tenantId: string, body: Record<string, unknown>) {
  const id = normalizeId(body.id ?? body.registration ?? body.imei);
  if (!id) return { ok: false, message: "id is required." } as const;
  const withId = { ...body, id };
  // Drivers are site-scoped KV (fleet:drivers) — never D1. Callers persist via driverKvMirror.
  if (table === "drivers") return { ok: true, id } as const;
  const payload = table === "assets" ? withAssetStoragePrefix(tenantId, withId) : withId;
  // Operational rows go to the VPS (SQLite) / B2 — never Cloudflare D1.
  const vpsResult = await upsertEntityOnVps(env, table, tenantId, payload);
  if (vpsResult) return vpsResult;
  if (!resolveVpsOrigin(env)) {
    return { ok: false, message: "Origin server is not configured for operational storage." } as const;
  }
  return { ok: false, message: "Origin server unavailable for operational storage." } as const;
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

const workerResolveDeviceServerBase = (env: Env) => {
  const explicit = String((env as any).DEVICE_SERVER_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const domain = String((env as any).DEVICE_SERVER_DOMAIN ?? (env as any).VITE_DEVICE_SERVER_DOMAIN ?? "").trim();
  if (!domain) return "";
  const portRaw = String((env as any).DEVICE_SERVER_PORT ?? (env as any).VITE_DEVICE_SERVER_PORT ?? "").trim();
  const protocolRaw = String((env as any).DEVICE_SERVER_PROTOCOL ?? (env as any).VITE_DEVICE_SERVER_PROTOCOL ?? "http").trim().toLowerCase();
  const protocol = protocolRaw === "https" || protocolRaw === "http" ? protocolRaw : "http";
  const port = Number(portRaw);
  const includePort = Number.isFinite(port) && port > 0 && !((protocol === "http" && port === 80) || (protocol === "https" && port === 443));
  return `${protocol}://${domain}${includePort ? `:${Math.floor(port)}` : ""}`.replace(/\/$/, "");
};

const resolveLiveStreamFromDeviceServer = async (
  env: Env,
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
  const base = workerResolveDeviceServerBase(env);
  if (!base) return "";
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
  const deviceKey = String((env as any).DEVICE_SERVER_API_KEY ?? "").trim();
  if (deviceKey) headers["x-api-key"] = deviceKey;

  for (const endpoint of attempts) {
    if (diagnostics) diagnostics.attemptedEndpoints.push(endpoint);
    try {
      const resp = await fetch(endpoint, { method: "GET", headers });
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
  env: Env,
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
  const providerBase = String(env.LIVE_STREAM_PROVIDER_URL ?? "").trim().replace(/\/$/, "");
  if (!providerBase) return "";

  const body = {
    ...(assetId ? { assetId } : {}),
    ...(cameraId ? { cameraId } : {}),
    channel,
    channelKey,
    channelLabel
  };

  const endpoints = [
    providerBase,
    `${providerBase}/camera/live/session`,
    `${providerBase}/live/session`,
    `${providerBase}/stream/session`,
    `${providerBase}/stream/live`
  ];

  const headers: Record<string, string> = {
    "content-type": "application/json",
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8"
  };
  const providerKey = String(env.LIVE_STREAM_PROVIDER_API_KEY ?? "").trim();
  if (providerKey) {
    headers["x-api-key"] = providerKey;
    headers.Authorization = `Bearer ${providerKey}`;
  }
  const providerTenant = String(env.LIVE_STREAM_PROVIDER_TENANT ?? "").trim();
  if (providerTenant) headers["x-tenant-id"] = providerTenant;

  for (const endpoint of endpoints) {
    if (diagnostics) diagnostics.attemptedEndpoints.push(endpoint);
    try {
      const resp = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
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

const liveResolveBoundCameraIdForAsset = (bindings: Record<string, unknown>[], assetId: string) => {
  const cleanAssetId = liveText(assetId);
  if (!cleanAssetId) return "";
  const record = bindings.find((row) => liveText((row as any)?.id) === "camera-asset-bindings") ?? null;
  const mappings = Array.isArray((record as any)?.mappings) ? (record as any).mappings : [];
  const match = mappings.find((m: any) => liveText(m?.assetId) === cleanAssetId) ?? null;
  if (match) return liveText(match?.cameraId);
  if (/^\d{14,17}$/.test(cleanAssetId)) return cleanAssetId;
  return "";
};

type AssetDuplicateConflict = {
  field: "imei" | "assetDescription" | "registration";
  value: string;
  existingId: string;
};

const normalizeComparable = (value: unknown) => String(value ?? "").trim().toLowerCase();

async function normalizeAssetIdsForTenant(env: Env, tenantId: string) {
  await ensureD1Tables(env);
  const rows = await env.VIVI_D1.prepare(
    "SELECT id, data, updated_at FROM assets WHERE tenant_id = ? ORDER BY updated_at ASC, id ASC"
  )
    .bind(tenantId)
    .all();

  // Number assets per site from 1 so site A and site B never share a sequence.
  const bySite = new Map<string, Array<{ id: string; data: Record<string, unknown>; updatedAt: string }>>();

  for (const row of rows.results ?? []) {
    const rowId = normalizeId((row as any).id);
    if (!rowId) continue;
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(String((row as any).data ?? "")) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    const siteKey = String((parsed as any)?.site ?? "").trim().toLowerCase() || "__unset__";
    const list = bySite.get(siteKey) ?? [];
    list.push({
      id: rowId,
      data: { ...parsed, id: rowId },
      updatedAt: String((row as any).updated_at ?? "") || new Date().toISOString()
    });
    bySite.set(siteKey, list);
  }

  const updates: Array<{ id: string; data: Record<string, unknown>; updatedAt: string }> = [];
  for (const list of bySite.values()) {
    let next = 1;
    for (const item of list) {
      const current = Number((item.data as any)?.assetId ?? 0);
      const desired = next;
      next += 1;
      if (!Number.isFinite(current) || Math.floor(current) !== desired) {
        updates.push({
          id: item.id,
          data: { ...item.data, assetId: desired },
          updatedAt: item.updatedAt
        });
      }
    }
  }

  for (const u of updates) {
    await env.VIVI_D1.prepare(
      "INSERT INTO assets (id, tenant_id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id, tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
    )
      .bind(u.id, tenantId, JSON.stringify(u.data), u.updatedAt)
      .run();
  }
}

async function findAssetDuplicateConflict(
  env: Env,
  tenantId: string,
  body: Record<string, unknown>
): Promise<AssetDuplicateConflict | null> {
  let incomingId = normalizeId((body as any).id ?? "");
  const incomingImei = String((body as any).imei ?? "").trim();
  const incomingDescription = String((body as any).assetDescription ?? "").trim();
  const incomingRegistration = String((body as any).registration ?? "").trim();

  if (!incomingImei && !incomingDescription && !incomingRegistration) return null;

  // Editing an existing IMEI: canonicalize to the stored asset id so self-updates never 409.
  if (incomingImei) {
    const imeiMatches = (await findAssetsByImei(env, tenantId, incomingImei)) as unknown as Record<
      string,
      unknown
    >[];
    const best = pickBestAssetForImei(imeiMatches);
    const bestId = normalizeId((best as any)?.id ?? (best as any)?.registration ?? (best as any)?.imei);
    const ownsIncomingId = imeiMatches.some(
      (row) => normalizeId((row as any)?.id ?? (row as any)?.registration ?? (row as any)?.imei) === incomingId
    );
    if (bestId) {
      if (!incomingId || incomingId === bestId || ownsIncomingId) {
        incomingId = bestId;
        (body as any).id = bestId;
      } else {
        return { field: "imei", value: incomingImei, existingId: bestId };
      }
    }
  }

  const assets = (await listEntity(env, "assets", tenantId)) as Record<string, unknown>[];
  for (const existing of assets) {
    const existingId = normalizeId((existing as any).id ?? (existing as any).assetId ?? (existing as any).registration);
    if (incomingId && existingId && incomingId === existingId) continue;

    if (incomingImei && normalizeComparable((existing as any).imei) === normalizeComparable(incomingImei)) {
      return { field: "imei", value: incomingImei, existingId };
    }
    if (
      incomingDescription &&
      normalizeComparable((existing as any).assetDescription) === normalizeComparable(incomingDescription)
    ) {
      return { field: "assetDescription", value: incomingDescription, existingId };
    }
    if (incomingRegistration && normalizeComparable((existing as any).registration) === normalizeComparable(incomingRegistration)) {
      return { field: "registration", value: incomingRegistration, existingId };
    }
  }

  return null;
}

async function deleteEntity(env: Env, table: string, tenantId: string, id: string) {
  // Drivers are removed from site-scoped KV by the /d1/drivers handler.
  if (table === "drivers") return true;
  const vpsResult = await deleteEntityOnVps(env, table, tenantId, id);
  if (vpsResult !== null) return vpsResult;
  return false;
}

async function resolveAssetIdsForDelete(
  env: Env,
  tenantId: string,
  opts: { id?: string; imei?: string; registration?: string }
): Promise<string[]> {
  const explicitId = normalizeId(opts.id);
  const imei = String(opts.imei ?? "").trim();
  const registration = String(opts.registration ?? "").trim();
  if (!explicitId && !imei && !registration) return [];

  const assets = (await listEntity(env, "assets", tenantId)) as Record<string, unknown>[];
  const ids = new Set<string>();
  for (const parsed of assets) {
    const rowId = normalizeId((parsed as any)?.id);
    const rowImei = String((parsed as any)?.imei ?? "").trim();
    const rowRegistration = String((parsed as any)?.registration ?? "").trim();
    const hit =
      (explicitId && rowId === explicitId) ||
      (imei && rowImei === imei) ||
      (registration && rowRegistration === registration);
    if (hit && rowId) ids.add(rowId);
  }
  return [...ids];
}

type LatestTelemetrySnapshot = {
  at: string;
  lat: number | null;
  lng: number | null;
  locationName?: string;
  speed?: number;
  satellites?: number;
  ignition?: boolean;
  powerVoltage?: number;
  movement?: "moving" | "stationary" | "unknown";
};

const getLatestTelemetrySnapshot = (eventRecord: any, createdAtFallback: string): LatestTelemetrySnapshot | null => {
  if (!eventRecord || typeof eventRecord !== "object") return null;
  const payload: any = eventRecord?.data ?? eventRecord;
  const nested: any = payload?.data ?? payload;
  const lat = pickFirstNumber(
    nested?.lat,
    nested?.latitude,
    payload?.lat,
    payload?.latitude,
    nested?.telemetryLatest?.lat,
    nested?.telemetryLatest?.latitude
  );
  const lng = pickFirstNumber(
    nested?.lng,
    nested?.lon,
    nested?.longitude,
    payload?.lng,
    payload?.lon,
    payload?.longitude,
    nested?.telemetryLatest?.lng,
    nested?.telemetryLatest?.lon,
    nested?.telemetryLatest?.longitude
  );
  const at =
    newestTimestamp(
      createdAtFallback,
      eventRecord?.createdAt,
      eventRecord?.created_at,
      nested?.fixTime,
      nested?.deviceTime,
      nested?.serverTime,
      payload?.fixTime,
      payload?.deviceTime,
      payload?.serverTime,
      nested?.lastSeen,
      payload?.lastSeen,
      nested?.lastPosition,
      payload?.lastPosition
    ) || String(createdAtFallback ?? "").trim();
  const locationName = pickFirstString(
    nested?.locationName,
    nested?.location,
    nested?.lastLocation,
    payload?.locationName,
    payload?.location,
    payload?.lastLocation
  );
  const speed = pickFirstNumber(
    nested?.speed,
    payload?.speed,
    nested?.telemetryLatest?.speed,
    nested?.attributes?.speed,
    payload?.attributes?.speed
  );
  const satellites = pickFirstNumber(
    nested?.attributes?.[TraccarPositionAttr.SATELLITES],
    payload?.attributes?.[TraccarPositionAttr.SATELLITES],
    nested?.satellites,
    nested?.satelliteCount,
    nested?.sats,
    payload?.satellites,
    payload?.satelliteCount,
    payload?.sats,
    nested?.telemetryLatest?.satellites,
    nested?.io?.["Number of Satellites"],
    nested?.io?.["Satellites"],
    nested?.io?.["GNSS Satellites"],
    nested?.io?.["GPS Satellites"],
    nested?.attributes?.satellites,
    payload?.attributes?.satellites
  );
  const ignition = pickFirstBoolean(
    nested?.attributes?.[TraccarPositionAttr.IGNITION],
    payload?.attributes?.[TraccarPositionAttr.IGNITION],
    nested?.ignition,
    payload?.ignition,
    nested?.telemetryLatest?.ignition,
    nested?.io?.Ignition,
    nested?.io?.["Ignition"],
    nested?.attributes?.ignition,
    payload?.attributes?.ignition
  );
  const powerVoltage = pickFirstNumber(
    nested?.attributes?.[TraccarPositionAttr.POWER],
    payload?.attributes?.[TraccarPositionAttr.POWER],
    nested?.attributes?.[TraccarPositionAttr.BATTERY],
    payload?.attributes?.[TraccarPositionAttr.BATTERY],
    nested?.powerVoltage,
    payload?.powerVoltage,
    nested?.voltage,
    payload?.voltage,
    nested?.telemetryLatest?.powerVoltage,
    nested?.io?.["Power Voltage"],
    nested?.io?.["External Voltage"],
    nested?.io?.["Voltage"],
    nested?.attributes?.powerVoltage,
    payload?.attributes?.powerVoltage
  );
  const movementRaw = pickFirstString(nested?.movement, payload?.movement, nested?.telemetryLatest?.movement).toLowerCase();
  const movement = classifyMovementState({ speed, satellites, ignition, movementRaw });

  return {
    at,
    lat,
    lng,
    ...(locationName ? { locationName } : {}),
    ...(typeof speed === "number" ? { speed } : {}),
    ...(typeof satellites === "number" ? { satellites } : {}),
    ...(typeof ignition === "boolean" ? { ignition } : {}),
    ...(typeof powerVoltage === "number" ? { powerVoltage } : {}),
    movement
  };
};

/** One latest fix per asset. Avoids scanning hundreds of full telemetry blobs on the fleet list. */
async function readLatestTelemetryForAssetList(env: Env, tenantId: string) {
  await ensureD1Tables(env);
  const rows = await env.VIVI_D1.prepare(
    `SELECT e.asset_id, e.imei, e.created_at, e.data
     FROM telemetry_events e
     INNER JOIN (
       SELECT asset_id, MAX(created_at) AS created_at
       FROM telemetry_events
       WHERE tenant_id = ?1 AND IFNULL(asset_id, '') != ''
       GROUP BY asset_id
     ) latest
       ON e.tenant_id = ?1
      AND e.asset_id = latest.asset_id
      AND e.created_at = latest.created_at`
  )
    .bind(tenantId)
    .all();

  const byAssetId = new Map<string, LatestTelemetrySnapshot>();
  const byImei = new Map<string, LatestTelemetrySnapshot>();

  for (const row of rows.results ?? []) {
    const createdAt = String((row as any).created_at ?? "").trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(String((row as any).data ?? ""));
    } catch {
      parsed = null;
    }
    const snapshot = getLatestTelemetrySnapshot(parsed, createdAt);
    if (!snapshot) continue;

    const eventAssetId = normalizeId((row as any).asset_id ?? (parsed as any)?.assetId ?? (parsed as any)?.data?.assetId);
    const eventImei = String((row as any).imei ?? (parsed as any)?.data?.imei ?? (parsed as any)?.imei ?? "").trim();

    if (eventAssetId && !byAssetId.has(eventAssetId)) byAssetId.set(eventAssetId, snapshot);
    if (eventImei && !byImei.has(eventImei)) byImei.set(eventImei, snapshot);
  }

  return { byAssetId, byImei };
}

async function readLatestTelemetryIndex(env: Env, tenantId: string, limit = 4000) {
  await ensureD1Tables(env);
  const capped = Math.max(100, Math.min(limit, 10000));
  const rows = await env.VIVI_D1.prepare(
    `SELECT asset_id, imei, created_at, data FROM telemetry_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ${capped}`
  )
    .bind(tenantId)
    .all();

  const byAssetId = new Map<string, LatestTelemetrySnapshot>();
  const byImei = new Map<string, LatestTelemetrySnapshot>();

  for (const row of rows.results ?? []) {
    const createdAt = String((row as any).created_at ?? "").trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(String((row as any).data ?? ""));
    } catch {
      parsed = null;
    }
    const snapshot = getLatestTelemetrySnapshot(parsed, createdAt);
    if (!snapshot) continue;

    const eventAssetId = normalizeId((row as any).asset_id ?? (parsed as any)?.assetId ?? (parsed as any)?.data?.assetId);
    const eventImei = String((row as any).imei ?? (parsed as any)?.data?.imei ?? (parsed as any)?.imei ?? "").trim();

    if (eventAssetId && !byAssetId.has(eventAssetId)) byAssetId.set(eventAssetId, snapshot);
    if (eventImei && !byImei.has(eventImei)) byImei.set(eventImei, snapshot);
  }

  return { byAssetId, byImei };
}

async function readLatestTelemetrySnapshotForAsset(
  env: Env,
  tenantId: string,
  assetId: string,
  imei: string
): Promise<LatestTelemetrySnapshot | null> {
  await ensureD1Tables(env);
  const normalizedAssetId = normalizeId(assetId);
  const normalizedImei = String(imei ?? "").trim();
  if (!normalizedAssetId && !normalizedImei) return null;

  const rows =
    normalizedAssetId && normalizedImei
      ? await env.VIVI_D1.prepare(
          `SELECT asset_id, imei, created_at, data
           FROM telemetry_events
           WHERE tenant_id = ? AND (asset_id = ? OR imei = ?)
           ORDER BY created_at DESC
           LIMIT 80`
        )
          .bind(tenantId, normalizedAssetId, normalizedImei)
          .all()
      : normalizedAssetId
        ? await env.VIVI_D1.prepare(
            `SELECT asset_id, imei, created_at, data
             FROM telemetry_events
             WHERE tenant_id = ? AND asset_id = ?
             ORDER BY created_at DESC
             LIMIT 80`
          )
            .bind(tenantId, normalizedAssetId)
            .all()
        : await env.VIVI_D1.prepare(
            `SELECT asset_id, imei, created_at, data
             FROM telemetry_events
             WHERE tenant_id = ? AND imei = ?
             ORDER BY created_at DESC
             LIMIT 80`
          )
            .bind(tenantId, normalizedImei)
            .all();

  for (const row of rows.results ?? []) {
    const createdAt = String((row as any).created_at ?? "").trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(String((row as any).data ?? ""));
    } catch {
      parsed = null;
    }
    const snapshot = getLatestTelemetrySnapshot(parsed, createdAt);
    if (snapshot) return snapshot;
  }

  return null;
}

async function readLatestTelemetrySnapshotByImeiAnyTenant(env: Env, imei: string): Promise<LatestTelemetrySnapshot | null> {
  await ensureD1Tables(env);
  const normalizedImei = String(imei ?? "").trim();
  if (!normalizedImei) return null;

  const rows = await env.VIVI_D1.prepare(
    `SELECT created_at, data
     FROM telemetry_events
     WHERE imei = ?
     ORDER BY created_at DESC
     LIMIT 80`
  )
    .bind(normalizedImei)
    .all();

  for (const row of rows.results ?? []) {
    const createdAt = String((row as any).created_at ?? "").trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(String((row as any).data ?? ""));
    } catch {
      parsed = null;
    }
    const snapshot = getLatestTelemetrySnapshot(parsed, createdAt);
    if (snapshot) return snapshot;
  }

  return null;
}

async function appendEvent(_env: Env, _tenantId: string, _event: Record<string, unknown>) {
  // Do not insert telemetry into D1. Each GPS point was a billed row write
  // (177,112,537 rows, $178, for 4 Sep–3 Oct 2026). History stays on the VPS.
}

async function readEventsSince(env: Env, tenantId: string, since: string, order: "asc" | "desc" = "desc") {
  await ensureD1Tables(env);
  const orderClause = order === "asc" ? "ASC" : "DESC";
  const result = since
    ? await env.VIVI_D1.prepare(
        `SELECT data FROM telemetry_events WHERE tenant_id = ? AND created_at > ? ORDER BY created_at ${orderClause} LIMIT 200`
      )
        .bind(tenantId, since)
        .all()
    : await env.VIVI_D1.prepare(
        `SELECT data FROM telemetry_events WHERE tenant_id = ? ORDER BY created_at ${orderClause} LIMIT 200`
      )
        .bind(tenantId)
        .all();
  return (result.results ?? [])
    .map((row) => {
      try {
        return JSON.parse(String(row.data));
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Record<string, unknown>[];
}

async function readConversation(env: Env, tenantId: string, id: string): Promise<ChatConversation | null> {
  const key = `chat:${tenantId}:${id}`;
  const raw = await readRealtimeStateWithLegacyKv(env, tenantId, key);
  return raw ? (JSON.parse(raw) as ChatConversation) : null;
}

async function writeConversation(env: Env, tenantId: string, conversation: ChatConversation) {
  await writeRealtimeStateToVps(
    env,
    tenantId,
    `chat:${tenantId}:${conversation.id}`,
    JSON.stringify(conversation)
  );
  if (conversation.status === "open") {
    await appendConversationToIndex(env, tenantId, conversation.id);
  } else {
    await removeConversationFromIndex(env, tenantId, conversation.id);
  }
}

async function appendConversationToIndex(env: Env, tenantId: string, conversationId: string) {
  const key = `chat:index:${tenantId}`;
  const raw = await readRealtimeStateWithLegacyKv(env, tenantId, key);
  let ids: string[] = [];
  try {
    ids = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    ids = [];
  }
  if (!ids.includes(conversationId)) {
    ids.unshift(conversationId);
    await writeRealtimeStateToVps(env, tenantId, key, JSON.stringify(ids.slice(0, 200)));
  }
}

async function removeConversationFromIndex(env: Env, tenantId: string, conversationId: string) {
  const key = `chat:index:${tenantId}`;
  const raw = await readRealtimeStateWithLegacyKv(env, tenantId, key);
  let ids: string[] = [];
  try {
    ids = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    ids = [];
  }
  const next = ids.filter((id) => id !== conversationId);
  await writeRealtimeStateToVps(env, tenantId, key, JSON.stringify(next));
}

async function listOpenConversations(env: Env, tenantId: string, limit = 50): Promise<ChatConversation[]> {
  const key = `chat:index:${tenantId}`;
  const raw = await readRealtimeStateWithLegacyKv(env, tenantId, key);
  let ids: string[] = [];
  try {
    ids = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    ids = [];
  }
  const out: ChatConversation[] = [];
  for (const id of ids.slice(0, Math.max(1, Math.min(100, limit)))) {
    const conversation = await readConversation(env, tenantId, id);
    if (conversation && conversation.status === "open") out.push(conversation);
  }
  return out;
}

async function readRealtimeStateWithLegacyKv(
  env: Env,
  tenantId: string,
  key: string
): Promise<string | null> {
  const stored = await readRealtimeStateFromVps(env, tenantId, key);
  if (stored) return stored;
  const legacy = await kvGetSafe(env, key);
  if (legacy) await writeRealtimeStateToVps(env, tenantId, key, legacy);
  return legacy;
}

const SUPPORT_AGENT_CATEGORIES = [
  "Sales",
  "Technical Support Telematics",
  "Support Vide Telematics",
  "Admins",
  "Support Deliver",
  "Support Maintenace"
] as const;

function normalizeSupportAgentCategory(input: unknown): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "Technical Support Telematics";
  const lower = raw.toLowerCase();
  if (lower === "support video telematics") return "Support Vide Telematics";
  if (lower === "support vide telematics") return "Support Vide Telematics";
  if (lower === "support maintenance") return "Support Maintenace";
  if (lower === "support maintenace") return "Support Maintenace";
  if (lower === "admins" || lower === "admin") return "Admins";
  const exact = SUPPORT_AGENT_CATEGORIES.find((c) => c.toLowerCase() === lower);
  return exact ?? "Technical Support Telematics";
}

function isSupportDeskRoleKeyOrName(standardRoleKey: string, roleName: string): boolean {
  const key = String(standardRoleKey ?? "").trim().toLowerCase();
  if (key === "admin" || key === "own-support") return true;
  return isAdminLikeRoleName(roleName) || isOwnSupportLikeRoleName(roleName);
}

function supportDeskCategoryForRole(standardRoleKey: string, roleName: string): string {
  const key = String(standardRoleKey ?? "").trim().toLowerCase();
  if (key === "admin" || isAdminLikeRoleName(roleName)) return "Admins";
  return "Technical Support Telematics";
}

/** Active users with Admin or Own Support (direct or via security group) appear in Support Centre. */
async function readOwnSupportAgents(env: Env): Promise<Array<{ id: string; name: string; email: string; category: string }>> {
  await ensureRbacSchema(env);
  const rows = await readSupportDeskRoleHolders(env.VIVI_D1);

  const byId = new Map<string, { id: string; name: string; email: string; category: string; isAdmin: boolean }>();
  for (const row of rows.results ?? []) {
    const id = String((row as any)?.id ?? "").trim();
    const name = String((row as any)?.name ?? "").trim();
    const standardRoleKey = String((row as any)?.standardRoleKey ?? "").trim();
    const roleName = String((row as any)?.roleName ?? "").trim();
    if (!id || !name || !isSupportDeskRoleKeyOrName(standardRoleKey, roleName)) continue;
    const isAdmin = standardRoleKey.toLowerCase() === "admin" || isAdminLikeRoleName(roleName);
    const existing = byId.get(id);
    if (existing) {
      if (isAdmin && !existing.isAdmin) {
        existing.category = "Admins";
        existing.isAdmin = true;
      }
      continue;
    }
    byId.set(id, {
      id,
      name,
      email: String((row as any)?.email ?? "").trim(),
      category: supportDeskCategoryForRole(standardRoleKey, roleName),
      isAdmin
    });
  }

  return Array.from(byId.values())
    .map(({ id, name, email, category }) => ({ id, name, email, category }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function readSupportAgentPresence(env: Env, tenantId: string, agentId: string): Promise<string> {
  const key = `presence:${agentId}`;
  const stored = await readRealtimeStateFromVps(env, tenantId, key);
  if (stored) return stored.trim();
  const legacy = String((await kvGetSafe(env, `support:presence:${agentId}`)) ?? "").trim();
  if (legacy) {
    const expiresAt = new Date(Date.parse(legacy) + 60 * 60 * 1000).toISOString();
    await writeRealtimeStateToVps(env, tenantId, key, legacy, expiresAt);
  }
  return legacy;
}

async function writeSupportAgentPresence(env: Env, tenantId: string, agentId: string, at: string) {
  const expiresAt = new Date(Date.parse(at) + 60 * 60 * 1000).toISOString();
  await writeRealtimeStateToVps(env, tenantId, `presence:${agentId}`, at, expiresAt);
}

async function queueSupportEmail(env: Env, payload: Record<string, unknown>) {
  if (env.TASK_QUEUE) {
    await env.TASK_QUEUE.send({ type: "support-email", ...payload });
    return;
  }
  await env.ViviTEL.put(`support-email:${Date.now()}`, JSON.stringify(payload));
}

async function checkKv(env: Env) {
  try {
    await env.ViviTEL.put("health:kv", new Date().toISOString(), { expirationTtl: 60 });
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
}

async function checkD1(env: Env) {
  try {
    await env.VIVI_D1.exec("SELECT 1");
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
}

async function checkBindingsTable(env: Env) {
  try {
    await ensureD1Tables(env);
    await env.VIVI_D1.exec("SELECT 1 FROM bindings LIMIT 1");
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
}

async function checkStorage(env: Env) {
  if (!env.STORAGE_BUCKET) return { status: "unconfigured" as ResourceStatus };
  try {
    await env.STORAGE_BUCKET.list({ limit: 1 });
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
}

async function checkQueue(env: Env) {
  if (!env.TASK_QUEUE) return { status: "unconfigured" as ResourceStatus };
  try {
    await env.TASK_QUEUE.send({ type: "healthcheck", at: new Date().toISOString() });
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
}

// --- Deliver (Drone delivery) store (Worker/KV) ---

type DeliverStore = DeliverExtendedStore;

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
  }
};

function deliverNowIso() {
  return new Date().toISOString();
}

function deliverStoreKey(tenantId: string) {
  const t = String(tenantId ?? "").trim();
  return `deliver:store:${t || "default"}`;
}

function deliverEnsureStoreShape(store: any): DeliverStore {
  const out = deliverMergeExtendedStore(store);
  if (!out.requirements || Object.keys(out.requirements).length === 0) {
    out.requirements = defaultDeliverRequirements;
  }
  return out;
}

async function deliverReadStore(env: Env, tenantId: string): Promise<DeliverStore> {
  try {
    const raw = await env.ViviTEL.get(deliverStoreKey(tenantId));
    if (!raw) return deliverEnsureStoreShape(null);
    return deliverEnsureStoreShape(JSON.parse(raw));
  } catch {
    return deliverEnsureStoreShape(null);
  }
}

async function deliverWriteStore(env: Env, tenantId: string, store: DeliverStore) {
  await env.ViviTEL.put(deliverStoreKey(tenantId), JSON.stringify(store ?? {}));
}

function deliverSanitizeText(v: any) {
  return String(v ?? "").trim();
}

function deliverSanitizeNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

function deliverOrderPriorityScore(priority: any) {
  const p = deliverSanitizeText(priority).toLowerCase();
  if (p === "critical") return 4;
  if (p === "high") return 3;
  if (p === "normal") return 2;
  if (p === "low") return 1;
  return 0;
}

function deliverIsDroneAvailable(drone: any) {
  return deliverSanitizeText(drone?.status).toLowerCase() === "available" && deliverSanitizeNumber(drone?.batteryPct, 0) >= 35;
}

function deliverAssignmentScore(drone: any, order: any) {
  const battery = deliverSanitizeNumber(drone?.batteryPct, 0);
  const payloadHeadroom = deliverSanitizeNumber(drone?.maxPayloadKg, 0) - deliverSanitizeNumber(order?.packageWeightKg, 0);
  const range = deliverSanitizeNumber(drone?.rangeKm, 0);
  const priority = deliverOrderPriorityScore(order?.priority);
  return battery + payloadHeadroom * 20 + range + priority * 5;
}

function deliverBestDroneForOrder(drones: any[], order: any) {
  const eligible = (drones || []).filter((drone) => {
    const payloadOk = deliverSanitizeNumber(drone?.maxPayloadKg, 0) >= deliverSanitizeNumber(order?.packageWeightKg, 0);
    return payloadOk && deliverIsDroneAvailable(drone);
  });
  if (!eligible.length) return null;
  eligible.sort((a, b) => deliverAssignmentScore(b, order) - deliverAssignmentScore(a, order));
  return eligible[0];
}

function deliverSummarize(store: DeliverStore) {
  const orders = store.orders || [];
  const drones = store.drones || [];
  const pending = orders.filter((o: any) => String(o.status) === "pending").length;
  const inTransit = orders.filter((o: any) => {
    const s = String(o.status ?? "").toLowerCase();
    return s === "assigned" || s === "in_transit" || s === "in-flight";
  }).length;
  const delivered = orders.filter((o: any) => String(o.status) === "delivered").length;
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

async function refreshZaCms808Fleet(env: Env) {
  let tenants: string[] = [];
  try {
    const listed = await env.VIVI_D1.prepare(`SELECT DISTINCT tenant_id AS tenantId FROM assets`).all<{ tenantId?: string }>();
    tenants = (listed.results ?? [])
      .map((row) => String(row?.tenantId ?? "").trim())
      .filter((id) => id.startsWith("region:za:"))
      .slice(0, 6);
  } catch {
    return;
  }
  for (const tenantId of tenants) {
    try {
      const assets = (await listEntity(env, "assets", tenantId)) as Record<string, unknown>[];
      await refreshCms808AssetPositions({
        kv: {
          get: (key) => kvGetWithVpsFallback(env, key, tenantId),
          set: async (key, value) => {
            await kvPutWithVpsFallback(env, key, value, tenantId);
          }
        },
        tenantId,
        assets,
        persist: async (patch) => {
          await upsertAssetMerged(env, tenantId, patch);
          // Keep each new 808 fix so dashboard trends survive beyond what the platform serves.
          try {
            const createdAt = String(patch.lastSeen ?? "").trim() || new Date().toISOString();
            const assetId = String(patch.id ?? "").trim();
            const eventId = `cms808:${assetId}:${createdAt}`;
            await env.VIVI_D1.prepare(
              "INSERT OR REPLACE INTO telemetry_events (id, tenant_id, type, asset_id, imei, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )
              .bind(eventId, tenantId, "telemetry", assetId, String(patch.imei ?? ""), createdAt, JSON.stringify({ id: eventId, type: "telemetry", assetId, createdAt, data: patch }))
              .run();
          } catch {
            // History is best effort.
          }
        }
      });
      // Positions only: clear the list cache but tell clients it is a position refresh,
      // so open Live Tracking pages do not reload their whole asset list every 2 minutes.
      await kvDeleteSafe(env, workerAssetsCacheKey(tenantId));
      try {
        await notifyRealtimeCatalog(env, tenantId, { reason: "positions" });
      } catch {
        // best-effort realtime fan-out
      }
    } catch {
      // One tenant must not stop the live 808 refresh for the others.
    }
  }
}

/** Keep auth/RBAC in D1; route every other database and KV operation to the VPS. */
function routeCloudflareStorage(env: Env) {
  if (!env) return;
  if (env.VIVI_D1) {
    env.VIVI_D1 = routeOperationalD1ToVps(env.VIVI_D1, env) as unknown as D1Database;
  }
  env.ViviTEL = createVpsKvNamespace(env) as unknown as KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    routeCloudflareStorage(env);
    try {
      return ensureCorsHeaders(await handleWorkerFetch(request, env, ctx));
    } catch (err: any) {
      // Ensure runtime errors still get CORS headers so the browser doesn't surface it as a CORS failure.
      return ensureCorsHeaders(
        json(
          {
            error: "Internal error",
            message: String(err?.message ?? err ?? ""),
            ok: false
          },
          { status: 500 }
        )
      );
    }
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    routeCloudflareStorage(env);
    // Traccar jobs stay on the US partition. 808 live positions refresh on the ZA partition.
    const usEnv: Env = {
      ...env,
      ViviTEL: createRegionScopedKv(env.ViviTEL, DEFAULT_REGION)
    };
    scheduleServerlessWarm(ctx, usEnv);
    ctx.waitUntil(processNotificationSyncJobs(usEnv, { limit: 20 }));
    // Small batches avoid Cloudflare "Too many subrequests" killing jobs mid-flight.
    ctx.waitUntil(processDeviceSyncJobs(usEnv, { limit: 3 }));
    if (regionUsesTraccar(DEFAULT_REGION) && String(usEnv.TRACCAR_BASE_URL ?? "").trim()) {
      ctx.waitUntil(pollTraccarUserAlertsForAllTenants(usEnv, env.ViviTEL));
      // Custom alert rules: latest positions from Traccar, evaluated here every 2 minutes.
      // No always-on Durable Object and no Cloudflare storage writes (state is on the VPS).
      ctx.waitUntil(
        runServerAlertRules(env, (path) => traccarFetch(usEnv, path)).catch((error) =>
          console.warn("Server alert rules failed:", error)
        )
      );
    }
    const zaEnv: Env = {
      ...env,
      ViviTEL: createRegionScopedKv(env.ViviTEL, "za")
    };
    ctx.waitUntil(refreshZaCms808Fleet(zaEnv));
  },
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext): Promise<void> {
    routeCloudflareStorage(env);
    const usEnv: Env = {
      ...env,
      ViviTEL: createRegionScopedKv(env.ViviTEL, DEFAULT_REGION)
    };
    scheduleServerlessWarm(ctx, usEnv);
    for (const message of batch.messages) {
      const body = (message.body ?? {}) as Record<string, unknown>;
      const type = String(body.type ?? "").trim().toLowerCase();
      try {
        if (type === "healthcheck") {
          message.ack();
          continue;
        }
        if (type === "device-sync") {
          await processDeviceSyncJobs(usEnv, { limit: 2 });
          message.ack();
          continue;
        }
        if (type === "support-email") {
          await processQueuedSupportEmail(usEnv, body);
          message.ack();
          continue;
        }
        message.ack();
      } catch {
        message.retry();
      }
    }
  }
};

async function handleWorkerFetch(request: Request, rawEnv: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      void warmServerlessBindings(rawEnv);
      const region = await bindRequestRegion(request, rawEnv);
      const env: Env = {
        ...rawEnv,
        ViviTEL: createRegionScopedKv(rawEnv.ViviTEL, region)
      };
      // First ZA request after deploy: copy Karongo / cmsv6 into the ZA partition if missing.
      if (region === "za") {
        try {
          const existing = await env.ViviTEL.get(HIERARCHY_GLOBAL_KEY);
          let needsZaMigration = !existing;
          if (existing) {
            try {
              needsZaMigration = !hierarchyHasZaBranch(JSON.parse(existing) as { dealers?: Array<Record<string, unknown>> });
            } catch {
              needsZaMigration = true;
            }
          }
          if (needsZaMigration) {
            await migrateZaKarongoPartition(rawEnv.ViviTEL);
          }
        } catch {
          // Best-effort; admin can re-run POST /admin/region/migrate-za-karongo.
        }
      }
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "access-control-allow-headers": CORS_ALLOW_HEADERS
          }
        });
      }

      // WebSocket realtime hub (Live Tracking / Streams / Support).
      // Normalize trailing slashes so /ws and /ws/ both match.
      const wsPath = url.pathname.replace(/\/+$/, "") || "/";
      if (wsPath === "/ws" || wsPath === "/stream/ws" || wsPath === "/realtime/ws") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
          return badRequest("Expected WebSocket upgrade on /ws");
        }
        const token = String(url.searchParams.get("token") ?? request.headers.get("x-api-key") ?? "").trim();
        const logicalTenant = String(url.searchParams.get("tenant") ?? request.headers.get("x-tenant-id") ?? "").trim();
        const tenantId = storageTenantId(region, logicalTenant);
        if (!token) return unauthorized();
        if (!tenantId) return badRequest("tenant is required (?tenant= or x-tenant-id)");

        const authedHeaders = new Headers(request.headers);
        authedHeaders.set("x-api-key", token);
        authedHeaders.set("x-tenant-id", logicalTenant);
        const authedRequest = new Request(request.url, { method: request.method, headers: authedHeaders });
        copyRequestRegion(request, authedRequest);

        const auth = await requireApiKey(authedRequest, env);
        if (auth) return auth;
        // Any authenticated session may open the socket; channel payloads stay tenant-scoped.
        // Live Tracking RBAC is enforced on the underlying data sources / REST fallbacks.
        const principal = await getPrincipal(authedRequest, env);
        // requireApiKey already validated the token; never block the upgrade if principal
        // resolution lags (e.g. permanent API key variants).
        const userId =
          principal.kind === "user"
            ? principal.userId
            : principal.kind === "admin"
              ? "__admin__"
              : String(url.searchParams.get("userId") ?? "").trim() || "__session__";

        const doTenant = durableObjectNameForRegion(region, tenantId);
        const forwardUrl = new URL(request.url);
        forwardUrl.searchParams.set("tenant", doTenant);
        if (userId) forwardUrl.searchParams.set("userId", userId);
        forwardUrl.searchParams.delete("token");
        const vpsOrigin = resolveVpsOrigin(env);
        if (!vpsOrigin) return json({ error: "Realtime VPS origin is not configured" }, { status: 503 });
        const target = new URL(forwardUrl.pathname + forwardUrl.search, vpsOrigin);
        const headers = new Headers(request.headers);
        headers.delete("x-api-key");
        headers.delete("authorization");
        headers.set("x-tenant-id", doTenant);
        headers.set("x-user-id", userId);
        headers.set("x-vivi-forwarded-by", "cloudflare-worker");
        const apiKey = String(env.API_KEY ?? env.API_KEY_PERMANENT ?? "").trim();
        if (apiKey) headers.set("x-api-key", apiKey);
        try {
          return await fetch(target, {
            method: "GET",
            headers,
            redirect: "manual"
          });
        } catch (error: any) {
          return json(
            { error: "Realtime VPS is unavailable", message: String(error?.message ?? error) },
            { status: 502 }
          );
        }
      }

      if (wsPath === "/realtime/ping") {
        return json({
          ok: true,
          realtime: true,
          hub: Boolean(resolveVpsOrigin(env)),
          traccarSocketBridge: Boolean(env.TRACCAR_BASE_URL),
          path: url.pathname
        });
      }

      if (url.pathname === "/cmsv6" || url.pathname.startsWith("/cmsv6/")) {
        if (!regionUsesCms808(region)) {
          return json({ error: "CMS808 is only available on the South Africa server" }, { status: 404 });
        }
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url) || storageTenantId(region, "default");
        const site = String(request.headers.get("x-site-name") ?? url.searchParams.get("site") ?? "").trim();
        const principal = await getPrincipal(request, env);
        let actor: { userId?: string; email?: string; name?: string } | undefined;
        if (principal.kind === "user") {
          const identity = await readRbacUserIdentity(env, principal.userId);
          actor = { userId: principal.userId, email: identity?.email, name: identity?.name };
        } else if (principal.kind === "admin") {
          const adminEmail = await getAdminEmail(env);
          actor = { userId: "admin", email: adminEmail || undefined, name: "Admin" };
        }
        const query: Record<string, string> = {};
        url.searchParams.forEach((value, key) => {
          query[key] = value;
        });
        let body: Record<string, unknown> = {};
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
          try {
            const parsed = await request.json();
            if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
          } catch {
            body = {};
          }
        }
        const result = await handleCmsv6Request({
          method: request.method,
          pathname: url.pathname.replace(/\/+$/, "") || "/cmsv6",
          query,
          body,
          tenantId,
          site: site || String(body.site ?? "").trim(),
          actor,
          defaultLogin: { account: env.CMS808_ACCOUNT, password: env.CMS808_PASSWORD, baseUrl: env.CMS808_BASE_URL },
          kv: {
            get: (key) => kvGetWithVpsFallback(env, key, tenantId),
            set: async (key, value) => {
              await kvPutWithVpsFallback(env, key, value, tenantId);
            }
          }
        });
        return json(result.body, { status: result.status });
      }

      if (url.pathname === "/gpsiot" || url.pathname.startsWith("/gpsiot/")) {
        const region = resolveRequestRegion(request);
        if (!regionUsesGpsIot(region)) {
          return json({ error: "GPS IoT is only available on the United Kingdom server" }, { status: 404 });
        }
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url) || "default";
        const hierarchy = filterHierarchyForRegion(await readHierarchy(env, tenantId), region);
        let body: Record<string, unknown> = {};
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
          try {
            const parsed = await request.json();
            if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
          } catch {
            body = {};
          }
        }
        const result = await handleGpsIotRequest({
          region,
          method: request.method,
          pathname: url.pathname.replace(/\/+$/, "") || "/gpsiot",
          env,
          databases: databasesFromHierarchy(hierarchy),
          body,
          tenantId,
          liveCache: {
            read: async (tid: string) => {
              const raw = await env.ViviTEL.get(gpsIotLiveCacheKey(tid));
              if (!raw) return [];
              try {
                const parsed = JSON.parse(raw) as { devices?: GpsIotLiveDevice[] };
                return Array.isArray(parsed?.devices) ? parsed.devices : [];
              } catch {
                return [];
              }
            }
          }
        });
        return json(result.body, { status: result.status });
      }

      // Device Health (Live Tracking): recent raw telemetry for one device from the
      // push feed (Traccar socket / forwarding). Platform Admin and Own Support only.
      if (url.pathname === "/api/device-health") {
        if (request.method !== "GET") return badRequest("Use GET.");
        const tenantId = getTenantId(request, url);
        const actor = await readRbacActorContext(request, env, tenantId || "");
        if (!actor) return unauthorized();
        if (!(actor.isAdmin || actor.isOwnSupport)) return forbidden();
        const deviceId = String(url.searchParams.get("deviceId") ?? "").trim();
        const imei = String(url.searchParams.get("imei") ?? "").trim();
        if (!deviceId && !imei) return badRequest("deviceId or imei is required.");
        const result = await readDeviceTelemetryFromBridge(env, { deviceId, imei });
        return json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
      }

      if (url.pathname.startsWith("/api/home/dashboard/")) {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const homeResp = await handleHomeDashboardRequest(
          request,
          url,
          {
            env,
            traccarFetch: (fetchEnv, pathnameWithQuery, init) =>
              traccarFetch(fetchEnv as Env, pathnameWithQuery, init),
            listAssets: async (tenantId: string) => {
              await ensureD1Tables(env);
              await normalizeAssetIdsForTenant(env, tenantId);
              const assets = await listEntity(env, "assets", tenantId);
              return Array.isArray(assets) ? assets : [];
            },
            kvGet: (key: string) => env.ViviTEL.get(key),
            kvPut: async (key: string, value: string, ttlSec = 300) => {
              await env.ViviTEL.put(key, value, { expirationTtl: ttlSec });
            }
          },
          (req, u) => resolveTenantId(req, u, env)
        );
        if (homeResp) {
          // Ensure CORS even if a future handler forgets headers (us.vivitelematics.ca → api).
          const headers = new Headers(homeResp.headers);
          if (!headers.has("access-control-allow-origin")) headers.set("access-control-allow-origin", "*");
          return new Response(homeResp.body, { status: homeResp.status, statusText: homeResp.statusText, headers });
        }
      }

      if (url.pathname === "/admin/notification-sync/run") {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST.");
        const limit = Number(url.searchParams.get("limit") ?? "25");
        const includeFailed = String(url.searchParams.get("includeFailed") ?? "").trim().toLowerCase() === "true";
        const result = await processNotificationSyncJobs(env, { limit, includeFailed });
        return json({ ok: true, ...result });
      }

      if (url.pathname === "/admin/region/migrate-za-karongo") {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST.");
        // Must use the raw KV namespace so we can copy between US and ZA partitions.
        const result = await migrateZaKarongoPartition(rawEnv.ViviTEL);
        return json(result, { status: result.ok ? 200 : 400 });
      }

      if (url.pathname === "/admin/device-sync/run") {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST.");
        const limit = Number(url.searchParams.get("limit") ?? "8");
        const includeFailed = String(url.searchParams.get("includeFailed") ?? "").trim().toLowerCase() === "true";
        const result = await processDeviceSyncJobs(env, { limit, includeFailed });
        return json({ ok: true, ...result });
      }

      if (url.pathname === "/admin/device-sync/status") {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "GET") return badRequest("Use GET.");
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        return json(await getDeviceSyncJobDiagnostics(env, tenantId));
      }

      if (url.pathname === "/admin/traccar/repair-site-groups") {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST.");
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const hierarchy = await readHierarchy(env, tenantId);
        let checked = 0;
        let linked = 0;
        let created = 0;
        const errors: Array<{ siteId: string; siteName: string; error: string }> = [];
        for (const dealer of hierarchy.dealers) {
          for (const org of dealer.organisations) {
            for (const db of org.databases) {
              for (const site of db.sites) {
                checked += 1;
                const hadId = Number(site.traccarGroupId ?? 0) > 0;
                const ensured = await ensureTraccarGroupForSite(env, tenantId, site, {
                  hierarchy,
                  persist: false
                });
                if (ensured.groupId) {
                  if (!hadId) linked += 1;
                  if (ensured.created) created += 1;
                } else if (ensured.error) {
                  errors.push({
                    siteId: site.id,
                    siteName: site.name,
                    error: ensured.error
                  });
                }
              }
            }
          }
        }
        await saveHierarchy(env, tenantId, hierarchy);
        return json({
          ok: errors.length === 0,
          tenantId,
          checked,
          linked,
          created,
          errors,
          hierarchy
        });
      }

      // --- Deliver dynamic routes ---
      if (url.pathname.startsWith("/deliver/orders/") && url.pathname.split("/").length >= 4) {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");

        const parts = url.pathname.split("/").filter(Boolean);
        const orderId = decodeURIComponent(parts[2] ?? "");
        const action = String(parts[3] ?? "");
        if (!orderId) return badRequest("orderId is required");

        const store = await deliverReadStore(env, tenantId);
        const order = (store.orders || []).find((o: any) => String(o.id ?? "") === orderId);
        if (!order) return notFound();

        if (action === "assign" && request.method === "POST") {
          const access = await requireRbacPermission(request, env, tenantId, "/Deliver/orders", "edit");
          if (access) return access;
          const parsed = await readJsonBody<{ droneId?: string }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const droneId = deliverSanitizeText(parsed.value?.droneId);
          if (!droneId) return badRequest("droneId is required");
          const drone = (store.drones || []).find((d: any) => String(d.id ?? "") === droneId);
          if (!drone) return badRequest("Drone not found");
          order.assignedDroneId = droneId;
          order.status = "assigned";
          order.updatedAt = deliverNowIso();
          drone.activeOrderId = orderId;
          drone.status = "in_transit";
          drone.lastUpdated = deliverNowIso();
          await deliverWriteStore(env, tenantId, store);
          return json({ ok: true, order });
        }

        if (action === "status" && request.method === "POST") {
          const access = await requireRbacPermission(request, env, tenantId, "/Deliver/orders", "edit");
          if (access) return access;
          const parsed = await readJsonBody<{ status?: string }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const next = deliverSanitizeText(parsed.value?.status).toLowerCase();
          if (!next) return badRequest("status is required");
          order.status = next;
          order.updatedAt = deliverNowIso();
          if (next === "closed" || next === "delivered") {
            order.deliveredAt = deliverNowIso();
            const droneId = deliverSanitizeText(order.assignedDroneId);
            const drone = droneId ? (store.drones || []).find((d: any) => String(d.id ?? "") === droneId) : null;
            if (drone) {
              const battery = deliverSanitizeNumber(drone.batteryPct, 0);
              drone.batteryPct = Math.max(5, battery - 8);
              drone.status = drone.batteryPct < 30 ? "charging" : "available";
              drone.activeOrderId = "";
              drone.lastUpdated = deliverNowIso();
            }
          }
          await deliverWriteStore(env, tenantId, store);
          return json({ ok: true, order });
        }

        if (action === "confirm" && request.method === "POST") {
          const access = await requireRbacPermission(request, env, tenantId, "/Deliver/orders", "edit");
          if (access) return access;
          const parsed = await readJsonBody<{ receiverName?: string; proofCode?: string; notes?: string }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const proofCode = deliverSanitizeText(parsed.value?.proofCode);
          if (!proofCode) return badRequest("proofCode is required");
          order.status = "delivered";
          order.deliveredAt = deliverNowIso();
          order.confirmation = {
            receiverName: deliverSanitizeText(parsed.value?.receiverName),
            proofCode,
            notes: deliverSanitizeText(parsed.value?.notes),
            confirmedAt: deliverNowIso()
          };
          await deliverWriteStore(env, tenantId, store);
          return json({ ok: true, order });
        }

        return badRequest("Unsupported deliver order action.", 405);
      }

      if (url.pathname.startsWith("/deliver/platform/")) {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const platformResponse = await tryDeliverPlatformRoutes({
          request,
          url,
          tenantId,
          readStore: () => deliverReadStore(env, tenantId),
          writeStore: (store) => deliverWriteStore(env, tenantId, store),
          json,
          badRequest,
          requireRbac: (pagePath, action) => requireRbacPermission(request, env, tenantId, pagePath, action)
        });
        if (platformResponse) return platformResponse;
      }

      const supportAgentHeartbeatMatch = url.pathname.match(/^\/support\/agents\/([^/]+)\/heartbeat$/);
      if (supportAgentHeartbeatMatch) {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST.");
        const agentId = normalizeId(supportAgentHeartbeatMatch[1]);
        if (!agentId) return badRequest("Agent id is required.");
        const now = new Date().toISOString();
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required.");
        await writeSupportAgentPresence(env, tenantId, agentId, now);
        ctx.waitUntil(notifyRealtimeSupport(env, tenantId));
        return json({ ok: true, id: agentId, lastSeenAt: now });
      }

      // Camera settings queue and device commands live on the VPS: MiTAC cameras poll the VPS
      // directly, so dashboard pushes must land in the same queue (not D1).
      if (isCameraDeviceVpsPath(url.pathname)) {
        const callerAuth = await requireApiKey(request, env);
        if (callerAuth) return callerAuth;
        try {
          const proxied = await proxyOperationalRequestToVps(request, env, { useServiceKey: true });
          if (proxied) return proxied;
        } catch (err: any) {
          return json({ error: "Origin server unavailable", message: String(err?.message ?? err ?? "") }, { status: 502 });
        }
        // Never fall back to the legacy D1 queue: rows belong on the VPS / Backblaze only.
        return json(
          { error: "Origin server is not configured for device settings", hint: "Set Worker var VPS_ORIGIN." },
          { status: 503 }
        );
      }
      // Operational rows (assets, bindings, config, cameras, …) live on the VPS / B2 — not D1.
      if (isOperationalD1Path(url.pathname)) {
        try {
          // Sessions live in the worker (D1); the VPS only knows the service key.
          // Validate the caller here, then forward with the service key.
          const callerAuth = await requireApiKey(request, env);
          const method = request.method.toUpperCase();
          if (callerAuth && method !== "GET" && method !== "HEAD") return callerAuth;
          const proxied = await proxyOperationalRequestToVps(request, env, { useServiceKey: !callerAuth });
          if (proxied) return proxied;
        } catch (err: any) {
          return json(
            {
              error: "Origin server unavailable for operational storage",
              message: String(err?.message ?? err ?? "")
            },
            { status: 502 }
          );
        }
        return json(
          {
            error: "Origin server is not configured for operational storage",
            hint: "Set Worker var VPS_ORIGIN (or VPS_HOSTNAME) to a DNS hostname for the VPS API."
          },
          { status: 503 }
        );
      }

      switch (url.pathname) {
      case "/":
        return json({
          service: env.APP_NAME ?? "Vivi telematics API",
          routes: [
            "/health",
            "/health/resources",
            "/auth/login",
            "/auth/forgot-password",
            "/auth/reset-password",
            "/auth/admin/bootstrap",
            "/telemetry/summary",
            "/telemetry/lookup",
            "/echo",
            "/kv/:key",
            "/pat",
            "/d1/assets",
            "/d1/assets/import-traccar",
            "/d1/device-reporting-settings",
            "/d1/configuration-groups",
            "/d1/bindings",
            "/d1/drivers",
            "/d1/trips",
            "/d1/cameras",
            "/d1/warehouses",
            "/d1/alerts",
            "/d1/infohub-streams",
            "/d1/user-alerts",
            "/support/chat",
            "/support/chat/end",
            "/support/chat/reply",
            "/support/chat/inbox",
            "/support/agents",
            "/support/agents/:id/heartbeat",
            "/ingest/telemetry",
            "/ingest/traccar",
            "/ingest/gpsiot",
            "/ingest/camera-health",
            "/stream/telemetry",
            "/ws",
            "/share/live",
            "/share/live/email",
            "/share/live/active",
            "/share/live/:token",
            "/admin/device-artifacts",
            "/admin/mitac-software",
            "/downloads/mitac-software",
            "/device/artifacts/:id",
            "/downloads/mitac-software",
            "/device/settings",
            "/device/push-settings",
            "/device/decommission",
            "/device/kick-avl",
            "/device/pending-settings",
            "/device/ack-settings",
            "/deliver/state",
            "/deliver/orders",
            "/deliver/orders/auto-assign",
            "/deliver/clients",
            "/deliver/regions",
            "/deliver/drone-groups",
            "/deliver/health",
            "/deliver/drones",
            "/deliver/schedules",
            "/deliver/platform/customer/dashboard",
            "/deliver/platform/ground-ops/dashboard",
            "/deliver/platform/drivers",
            "/deliver/platform/warehouse/packages",
            "/deliver/platform/executive/dashboard"
          ]
        });
      case "/health":
        return json({ status: "ok", timestamp: new Date().toISOString() });

      case "/deliver/state": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const access = await requireRbacPermission(request, env, tenantId, "/Deliver/drone-delivery", "view");
        if (access) return access;
        const store = await deliverReadStore(env, tenantId);
        return json({
          summary: deliverSummarize(store),
          drones: store.drones,
          orders: store.orders,
          requirements: store.requirements,
          clients: store.clients,
          regions: store.regions,
          droneGroups: store.droneGroups
        });
      }

      case "/deliver/drones": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const access = await requireRbacPermission(request, env, tenantId, "/Deliver/drone-delivery", request.method === "GET" ? "view" : "edit");
        if (access) return access;

        if (request.method === "GET") {
          const store = await deliverReadStore(env, tenantId);
          return json({ drones: store.drones, summary: deliverSummarize(store) });
        }

        if (request.method === "POST") {
          const body = await request.json().catch(() => ({} as any));
          const store = await deliverReadStore(env, tenantId);
          const id = deliverSanitizeText((body as any).id) || deliverCreateDroneId();
          if ((store.drones || []).some((d: any) => String(d.id) === id)) return badRequest("Drone id already exists");
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
          store.drones = [...(store.drones || []), drone];
          await deliverWriteStore(env, tenantId, store);
          return json({ stored: true, drone, summary: deliverSummarize(store) }, { status: 201 });
        }

        return badRequest("Unsupported method.", 405);
      }

      case "/deliver/orders": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const access = await requireRbacPermission(request, env, tenantId, "/Deliver/orders", request.method === "GET" ? "view" : "edit");
        if (access) return access;

        const store = await deliverReadStore(env, tenantId);

        if (request.method === "GET") {
          const phone = deliverSanitizeText(url.searchParams.get("phone"));
          const status = deliverSanitizeText(url.searchParams.get("status")).toLowerCase();
          let orders = phone ? (store.orders || []).filter((o: any) => deliverSanitizeText(o.clientPhone) === phone) : (store.orders || []);
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
          return json({ orders });
        }

        if (request.method === "POST") {
          const body = await request.json().catch(() => ({} as any));
          const enhanced = deliverEnhanceOrderBody(body as Record<string, unknown>, store.platformSettings ?? {
            baseFare: 5,
            perKgRate: 2.5,
            taxRate: 0.16,
            insuranceRate: 0.05,
            commissionRate: 0.12
          });
          const order = {
            id: deliverCreateOrderId(),
            clientName: deliverSanitizeText((body as any).clientName),
            clientPhone: deliverSanitizeText((body as any).clientPhone),
            pickupAddress: deliverSanitizeText((body as any).pickupAddress),
            dropoffAddress: deliverSanitizeText((body as any).dropoffAddress),
            packageWeightKg: Math.max(0, deliverSanitizeNumber((body as any).packageWeightKg, 0)),
            priority: deliverSanitizeText((body as any).priority) || "normal",
            status: "pending",
            assignedDroneId: "",
            createdAt: deliverNowIso(),
            updatedAt: deliverNowIso(),
            deliveredAt: "",
            ...enhanced
          };
          if (!order.clientName || !order.clientPhone) return badRequest("clientName and clientPhone are required");
          store.orders = [order, ...(store.orders || [])];
          await deliverWriteStore(env, tenantId, store);
          return json({ ok: true, order }, { status: 201 });
        }

        return badRequest("Unsupported method.", 405);
      }

      case "/deliver/orders/auto-assign": {
        if (request.method !== "POST") return badRequest("Use POST");
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const access = await requireRbacPermission(request, env, tenantId, "/Deliver/orders", "edit");
        if (access) return access;
        const store = await deliverReadStore(env, tenantId);
        let assignedCount = 0;
        for (const order of store.orders || []) {
          const status = deliverSanitizeText(order.status).toLowerCase();
          if (status !== "pending") continue;
          if (deliverSanitizeText(order.assignedDroneId)) continue;
          const best = deliverBestDroneForOrder(store.drones || [], order);
          if (!best) continue;
          order.assignedDroneId = String(best.id);
          order.status = "assigned";
          order.updatedAt = deliverNowIso();
          best.activeOrderId = String(order.id);
          best.status = "in_transit";
          best.lastUpdated = deliverNowIso();
          assignedCount += 1;
        }
        await deliverWriteStore(env, tenantId, store);
        return json({ assignedCount });
      }

      case "/deliver/clients": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const access = await requireRbacPermission(request, env, tenantId, "/Deliver/clients", request.method === "GET" ? "view" : "edit");
        if (access) return access;
        const store = await deliverReadStore(env, tenantId);
        if (request.method === "GET") return json({ clients: store.clients });
        if (request.method === "POST") {
          const body = await request.json().catch(() => ({} as any));
          const id = deliverSanitizeText((body as any).id) || `CL-${Date.now()}`;
          const name = deliverSanitizeText((body as any).name);
          if (!name) return badRequest("Client name is required");
          const rec = {
            id,
            name,
            phone: deliverSanitizeText((body as any).phone),
            region: deliverSanitizeText((body as any).region),
            notes: deliverSanitizeText((body as any).notes),
            updatedAt: deliverNowIso()
          };
          const idx = (store.clients || []).findIndex((c: any) => String(c.id) === id);
          if (idx >= 0) store.clients[idx] = { ...store.clients[idx], ...rec };
          else store.clients.unshift(rec);
          await deliverWriteStore(env, tenantId, store);
          return json({ stored: true, client: rec });
        }
        return badRequest("Unsupported method.", 405);
      }

      case "/deliver/regions": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const access = await requireRbacPermission(request, env, tenantId, "/Deliver/regions", request.method === "GET" ? "view" : "edit");
        if (access) return access;
        const store = await deliverReadStore(env, tenantId);
        if (request.method === "GET") return json({ regions: store.regions });
        if (request.method === "POST") {
          const body = await request.json().catch(() => ({} as any));
          const name = deliverSanitizeText((body as any).name);
          if (!name) return badRequest("Region name is required");
          const id = deliverSanitizeText((body as any).id) || name.toLowerCase().replace(/\s+/g, "-");
          if (!(store.regions || []).some((r: any) => String(r.id) === id)) {
            store.regions.unshift({ id, name, updatedAt: deliverNowIso() });
            await deliverWriteStore(env, tenantId, store);
          }
          return json({ stored: true, id });
        }
        return badRequest("Unsupported method.", 405);
      }

      case "/deliver/drone-groups": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const access = await requireRbacPermission(request, env, tenantId, "/Deliver/drone-groups", request.method === "GET" ? "view" : "edit");
        if (access) return access;
        const store = await deliverReadStore(env, tenantId);
        if (request.method === "GET") return json({ droneGroups: store.droneGroups });
        if (request.method === "POST") {
          const body = await request.json().catch(() => ({} as any));
          const name = deliverSanitizeText((body as any).name);
          if (!name) return badRequest("Group name is required");
          const id = deliverSanitizeText((body as any).id) || name.toLowerCase().replace(/\s+/g, "-");
          const rec = {
            id,
            name,
            owner: deliverSanitizeText((body as any).owner),
            region: deliverSanitizeText((body as any).region),
            notes: deliverSanitizeText((body as any).notes),
            updatedAt: deliverNowIso()
          };
          const idx = (store.droneGroups || []).findIndex((g: any) => String(g.id) === id);
          if (idx >= 0) store.droneGroups[idx] = { ...store.droneGroups[idx], ...rec };
          else store.droneGroups.unshift(rec);
          await deliverWriteStore(env, tenantId, store);
          return json({ stored: true, droneGroup: rec });
        }
        return badRequest("Unsupported method.", 405);
      }

      case "/deliver/health": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const access = await requireRbacPermission(request, env, tenantId, "/Deliver/health", "view");
        if (access) return access;
        const store = await deliverReadStore(env, tenantId);
        const now = Date.now();
        const health = (store.drones || []).map((d: any) => {
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
        return json({ health, at: deliverNowIso() });
      }

      case "/deliver/schedules": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const pagePath = "/Deliver/scheduling";
        const access = await requireRbacPermission(request, env, tenantId, pagePath, request.method === "GET" ? "view" : request.method === "DELETE" ? "delete" : "edit");
        if (access) return access;

        const store = await deliverReadStore(env, tenantId);
        store.schedules = Array.isArray(store.schedules) ? store.schedules : [];

        if (request.method === "GET") {
          return json({ schedules: store.schedules });
        }

        if (request.method === "POST") {
          const body = await request.json().catch(() => ({} as any));
          const id = deliverSanitizeText((body as any).id) || `SCH-${Date.now()}`;
          const scheduledAt = deliverSanitizeText((body as any).scheduledAt);
          const clientName = deliverSanitizeText((body as any).clientName);
          const pickupAddress = deliverSanitizeText((body as any).pickupAddress);
          const dropoffAddress = deliverSanitizeText((body as any).dropoffAddress);
          const status = deliverSanitizeText((body as any).status).toLowerCase() || "scheduled";
          if (!scheduledAt || !clientName || !pickupAddress || !dropoffAddress) {
            return badRequest("clientName, pickupAddress, dropoffAddress, scheduledAt are required");
          }
          const rec = {
            id,
            clientName,
            pickupAddress,
            dropoffAddress,
            scheduledAt,
            status,
            updatedAt: deliverNowIso()
          };
          const idx = (store.schedules || []).findIndex((s: any) => String(s.id) === id);
          if (idx >= 0) (store.schedules as any[])[idx] = { ...(store.schedules as any[])[idx], ...rec };
          else (store.schedules as any[]).unshift(rec);
          await deliverWriteStore(env, tenantId, store);
          return json({ stored: true, schedule: rec });
        }

        if (request.method === "DELETE") {
          const id = deliverSanitizeText(url.searchParams.get("id"));
          if (!id) return badRequest("id is required");
          store.schedules = (store.schedules || []).filter((s: any) => String(s.id) !== id);
          await deliverWriteStore(env, tenantId, store);
          return json({ deleted: true, id });
        }

        return badRequest("Unsupported method.", 405);
      }
      case "/auth/demo-signup": {
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        const parsed = await readJsonBody<{
          name?: string;
          email?: string;
          password?: string;
          region?: string;
          organisation?: string;
          dealer?: string;
          database?: string;
          site?: string;
        }>(request);
        if (!parsed.ok) return badRequest(parsed.error);
        const name = String(parsed.value?.name ?? "").trim();
        const email = String(parsed.value?.email ?? "").trim().toLowerCase();
        const password = String(parsed.value?.password ?? "");
        const organisationName = String(parsed.value?.organisation ?? "").trim();
        const dealerName = String(parsed.value?.dealer ?? "").trim();
        const databaseName = String(parsed.value?.database ?? "").trim();
        const siteName = String(parsed.value?.site ?? "").trim();
        if (!name || name.length > 80) return badRequest("Enter your name.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return badRequest("Enter a valid email.");
        if (password.length < 8) return badRequest("Password must be at least 8 characters.");
        if (!organisationName || !dealerName || !databaseName || !siteName) {
          return badRequest("Enter organisation, dealer, database, and site.");
        }
        if ([organisationName, dealerName, databaseName, siteName].some((value) => value.length > 80)) {
          return badRequest("Hierarchy names must be 80 characters or less.");
        }

        const trialNodeId = (label: string) => {
          const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18) || "trial";
          return `${slug}-${crypto.randomUUID().slice(0, 8)}`;
        };
        const dealerId = trialNodeId(organisationName);
        const orgId = trialNodeId(dealerName);
        const databaseId = trialNodeId(databaseName);
        const siteId = trialNodeId(siteName);
        const tenantId = `${dealerId}:${orgId}:${databaseId}`;

        const ip = String(request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "")
          .split(",")[0]
          .trim() || "unknown";
        const rateKey = `vivi:demo-signup-rate:${ip}`;
        const attempts = Number(await kvGetSafe(env, rateKey) ?? "0") || 0;
        if (attempts >= 8) return json({ error: "Too many demo signups from this network. Try again later." }, { status: 429 });
        await kvPutSafe(env, rateKey, String(attempts + 1), 3600);

        await ensureRbacSchema(env);
        const existing = await findRbacUserByEmail(env, email);
        if (existing) return json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });

        await ensureStandardRolesForTenant(env.VIVI_D1, tenantId);
        const role = await env.VIVI_D1
          .prepare(`SELECT id, name FROM rbac_roles WHERE tenant_id = ?1 AND standard_role_key = ?2 LIMIT 1`)
          .bind(tenantId, "basic-user")
          .first<{ id: string; name: string }>();
        if (!role?.id) return serviceUnavailable({ error: "Demo signup is not configured." });

        const id = uuid();
        const now = new Date().toISOString();
        const passwordHash = await hashPassword(password);
        try {
          await env.VIVI_D1
            .prepare(
              `INSERT INTO rbac_users (id, name, email, password_hash, status, created_at, updated_at, created_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)`
            )
            .bind(id, name, email, passwordHash, "active", now, null)
            .run();
          await applyRbacUserTenantAssignments(
            env,
            id,
            [tenantId],
            [{ tenantId, siteId, siteName }],
            [{ tenantId, roleId: String(role.id) }],
            now
          );
          await grantUserRegion(env, id, resolveLoginRegion(request, parsed.value?.region), now);
          await saveHierarchy(
            env,
            tenantId,
            {
              dealers: [
                {
                  id: dealerId,
                  name: organisationName,
                  ownerUserId: id,
                  organisations: [
                    {
                      id: orgId,
                      name: dealerName,
                      ownerUserId: id,
                      databases: [
                        {
                          id: databaseId,
                          name: databaseName,
                          ownerUserId: id,
                          sites: [{ id: siteId, name: siteName, ownerUserId: id }]
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            { mode: "merge" }
          );
          await saveDemoRecord(
            demoKv(env),
            createPendingDemoRecord({
              userId: id,
              email,
              name,
              nowIso: now,
              organisationName,
              dealerName,
              databaseName,
              siteName,
              personalTenantId: tenantId
            })
          );
          await syncDemoHierarchyAccess(env, id, resolveLoginRegion(request, parsed.value?.region));
        } catch (error) {
          try {
            await env.VIVI_D1.prepare(`DELETE FROM rbac_user_roles WHERE user_id = ?1`).bind(id).run();
            await env.VIVI_D1.prepare(`DELETE FROM rbac_user_sites WHERE user_id = ?1`).bind(id).run();
            await env.VIVI_D1.prepare(`DELETE FROM rbac_user_tenants WHERE user_id = ?1`).bind(id).run();
            await env.VIVI_D1.prepare(`DELETE FROM rbac_users WHERE id = ?1`).bind(id).run();
          } catch {
            // Best-effort cleanup after a failed demo signup.
          }
          if (isRbacUserEmailUniqueConstraintError(error)) {
            return json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
          }
          return serviceUnavailable({ error: "Demo signup could not be completed. Try again." });
        }
        return json({ ok: true, message: "Demo account created. Sign in to start your 14 days." });
      }
      case "/auth/login": {
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        {
          const parsed = await readJsonBody<{ email?: string; password?: string; region?: string }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const email = String(parsed.value?.email ?? "").trim().toLowerCase();
          const password = String(parsed.value?.password ?? "");
          if (!email || !password) return badRequest("email and password are required");

          // 1) Admin login (backward compatible)
          const adminEmail = await getAdminEmail(env);
          if (adminEmail && email === adminEmail) {
            const configuredPlain = String(env.ADMIN_PASSWORD ?? "");
            const storedHash = await getAdminPasswordHash(env);
            if (!storedHash && !configuredPlain) {
              return serviceUnavailable({ error: "Admin password is not configured. Use forgot password to set it." });
            }
            const ok = await verifyAdminPassword(env, password);
            if (!ok) return unauthorized();
            const region = resolveLoginRegion(request, parsed.value?.region);
            const token = await createAdminSession(env, region);
            return json({ ok: true, token });
          }

          // 2) RBAC user login
          await ensureRbacSchema(env);
          const found = await env.VIVI_D1
            .prepare(
              `SELECT id, password_hash AS passwordHash, status FROM rbac_users WHERE lower(email) = ?1 LIMIT 1`
            )
            .bind(email)
            .first<{ id: string; passwordHash: string; status: string }>();
          if (!found) return unauthorized();
          const accountStatus = String((found as any).status ?? "").trim().toLowerCase();
          if (accountStatus !== "active" && accountStatus !== "suspended") return unauthorized();

          const ok = await verifyPassword(password, String((found as any).passwordHash ?? ""));
          if (!ok) return unauthorized();
          if (accountStatus === "suspended") {
            const suspendedRecord = await loadDemoRecord(demoKv(env), String((found as any).id ?? ""));
            if (suspendedRecord && !suspendedRecord.activatedAt) {
              return json({ error: DEMO_EXPIRED_MESSAGE }, { status: 403 });
            }
            return unauthorized();
          }

          const userId = String((found as any).id ?? "").trim();
          const region = resolveLoginRegion(request, parsed.value?.region);
          if (isDemoLoginEmail(email)) {
            const now = new Date().toISOString();
            for (const regionId of REGION_IDS) {
              await grantUserRegion(env, userId, regionId, now);
            }
            await ensureStandardRolesForTenant(env.VIVI_D1, DEMO_TENANT_ID);
            const demoRole = await env.VIVI_D1
              .prepare(`SELECT id FROM rbac_roles WHERE tenant_id = ?1 AND standard_role_key = ?2 LIMIT 1`)
              .bind(DEMO_TENANT_ID, "basic-user")
              .first<{ id: string }>();
            await applyRbacUserTenantAssignments(
              env,
              userId,
              [DEMO_TENANT_ID],
              [{ tenantId: DEMO_TENANT_ID, siteId: DEMO_HIERARCHY_IDS.site, siteName: "Demo" }],
              demoRole?.id ? [{ tenantId: DEMO_TENANT_ID, roleId: String(demoRole.id) }] : [],
              now
            );
            if (!(await loadDemoRecord(demoKv(env), userId))) {
              const identity = await readRbacUserIdentity(env, userId);
              try {
                await saveDemoRecord(
                  demoKv(env),
                  createPendingDemoRecord({
                    userId,
                    email,
                    name: identity?.name || email,
                    nowIso: now
                  })
                );
              } catch {
                // The next sign-in can start the 14-day window.
              }
            }
          }
          if (!(await userCanAccessRegion(env, userId, region))) {
            const server = REGION_SERVERS[region];
            return json({
              ok: false,
              error: `No account on ${server.label}. Sign in at ${publicOriginForRegion("us")} or ask an administrator to create access on this server.`
            }, { status: 403 });
          }
          const nowMs = Date.now();
          const demoAdvance = advanceDemoOnLogin(await loadDemoRecord(demoKv(env), userId), nowMs);
          if (demoAdvance.blocked) {
            try {
              await env.VIVI_D1
                .prepare(`UPDATE rbac_users SET status = 'suspended', updated_at = ?2 WHERE id = ?1`)
                .bind(userId, new Date().toISOString())
                .run();
            } catch {
              // The trial window still blocks sign-in if the status update fails.
            }
            return json({ error: demoAdvance.blockMessage || DEMO_EXPIRED_MESSAGE }, { status: 403 });
          }
          if (demoAdvance.changed && demoAdvance.record) {
            try {
              await saveDemoRecord(demoKv(env), demoAdvance.record);
            } catch {
              return serviceUnavailable({ error: "Demo access could not be started. Try signing in again." });
            }
          }
          if (demoAdvance.record?.startedAt) {
            const supportConfigured = parseSupportNotifyEmails(String(env.DEMO_SUPPORT_NOTIFY_EMAILS ?? "")).length > 0;
            const claim = claimDemoNotifications(demoAdvance.record, nowMs, { supportConfigured });
            if (claim.sendClient || claim.sendSupport) {
              try {
                await saveDemoRecord(demoKv(env), claim.record);
                queueDemoOnboardingMail(ctx, env, claim.record, claim);
              } catch {
                // Login still succeeds. The next sign-in can send the onboarding mail.
              }
            }
          }
          try {
            await syncDemoHierarchyAccess(env, userId, region);
          } catch {
            // Sign-in still succeeds. The next session load can attach the shared Demo site.
          }
          const token = await createUserSession(env, userId, { region });
          const now = new Date().toISOString();
          try {
            await env.VIVI_D1
              .prepare(`UPDATE rbac_users SET last_login_at = ?2, updated_at = ?2 WHERE id = ?1`)
              .bind(userId, now)
              .run();
          } catch {
            // Login must succeed even if last_login_at migration/update fails.
          }
          return json({ ok: true, token });
        }
      }

      case "/auth/demo-tour": {
        if (request.method !== "POST") return badRequest("Use POST.");
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const principal = await getPrincipal(request, env);
        if (principal.kind !== "user") return unauthorized();
        const record = await loadDemoRecord(demoKv(env), principal.userId);
        if (!record) return json({ error: "Demo guide is not available for this account." }, { status: 404 });
        const next = dismissDemoTour(record, new Date().toISOString());
        try {
          await saveDemoRecord(demoKv(env), next);
        } catch {
          return serviceUnavailable({ error: "Could not save the demo guide." });
        }
        let demoSync: DemoHierarchySync | null = null;
        try {
          demoSync = await syncDemoHierarchyAccess(env, principal.userId, region);
        } catch {
          demoSync = null;
        }
        return json({ ok: true, demo: demoStatusFromSync(demoSync?.record ?? next, demoSync) });
      }

      case "/auth/demo-activate": {
        if (request.method !== "POST") return badRequest("Use POST.");
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const principal = await getPrincipal(request, env);
        if (principal.kind === "user") {
          const roleRows = await env.VIVI_D1
            .prepare(
              `SELECT r.name AS name
               FROM rbac_user_roles ur
               JOIN rbac_roles r ON r.id = ur.role_id
               WHERE ur.user_id = ?1`
            )
            .bind(principal.userId)
            .all<{ name: string }>();
          const allowed = (roleRows.results ?? []).some((row) => {
            const roleName = String(row?.name ?? "");
            return isAdminLikeRoleName(roleName) || isOwnSupportLikeRoleName(roleName);
          });
          if (!allowed) return unauthorized();
        } else if (principal.kind !== "admin") {
          return unauthorized();
        }
        const parsed = await readJsonBody<{ userId?: string }>(request);
        if (!parsed.ok) return badRequest(parsed.error);
        const targetUserId = normalizeId(parsed.value?.userId);
        if (!targetUserId) return badRequest("userId is required");
        const record = await loadDemoRecord(demoKv(env), targetUserId);
        if (!record) return json({ error: "This account is not a demo." }, { status: 404 });
        const now = new Date().toISOString();
        const next = activateDemoRecord(record, now);
        try {
          await saveDemoRecord(demoKv(env), next);
          await env.VIVI_D1
            .prepare(`UPDATE rbac_users SET status = 'active', updated_at = ?2 WHERE id = ?1`)
            .bind(targetUserId, now)
            .run();
        } catch {
          return serviceUnavailable({ error: "Could not activate this account." });
        }
        let demoSync: DemoHierarchySync | null = null;
        try {
          demoSync = await syncDemoHierarchyAccess(env, targetUserId, region);
        } catch {
          demoSync = null;
        }
        return json({ ok: true, demo: demoStatusFromSync(demoSync?.record ?? next, demoSync) });
      }

      case "/auth/me": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;

        const principal = await getPrincipal(request, env);
          let tenantId = getTenantId(request, url);
          const defaultTenantId = storageTenantId(region, String(env.DEFAULT_TENANT_ID ?? "").trim() || "");
        
          // Use default tenant if not provided
          if (!tenantId) {
            tenantId = defaultTenantId;
          }

        if (principal.kind === "admin") {
          const adminEmail = await getAdminEmail(env);
          let adminDisplayName = "";
          try {
            const adminStored = await readUserProfile({ get: (key: string) => kvGetSafe(env, key), put: async () => {} }, "admin");
            adminDisplayName = String(adminStored.displayName ?? "").trim();
          } catch {
            adminDisplayName = "";
          }
          return json({
            ok: true,
            principal: { kind: "admin", name: adminDisplayName || "Admin", ...(adminEmail ? { email: adminEmail } : {}) },
            tenantId: tenantId || "",
            region,
            permissions: { mode: "allow-all", rows: [] as RbacPermissionRow[] }
          });
        }

        if (principal.kind !== "user") return unauthorized();

        const sessionPayload = await getUserSessionPayload(env, principal.token);
        let demoSync: DemoHierarchySync | null = null;
        try {
          demoSync = await syncDemoHierarchyAccess(env, principal.userId, region);
        } catch {
          demoSync = null;
        }
        await ensureTenantGrantsFromSiteAssignments(env, principal.userId);
        let allowedTenants = await readAllowedTenantIdsForUser(env, principal.userId);
        if (demoSync?.shared?.tenantId) {
          const sharedTenantId = demoSync.shared.tenantId;
          allowedTenants = [sharedTenantId, ...allowedTenants.filter((id) => id !== sharedTenantId)];
        }
        if ((!tenantId || !actorCanAccessTenantId(allowedTenants, tenantId)) && allowedTenants.length > 0) {
          tenantId = allowedTenants[0];
        }
        const identity = await readRbacUserIdentity(env, principal.userId);
        const databaseRoles = tenantId ? await readDatabaseRolesForUser(env, tenantId, principal.userId) : [];
        const roleNames = Array.from(new Set(databaseRoles.map((row) => row.roleName).filter(Boolean)));
        const roleLevels = databaseRoles.map((row) => row.roleLevel).filter((level) => Number.isFinite(level));
        const siteAssignments = await readAllAssignedSiteRefsForUser(env, principal.userId);
        const siteIds = Array.from(new Set(siteAssignments.map((row) => row.siteId).filter(Boolean)));
        const siteNames = Array.from(new Set(siteAssignments.map((row) => String(row.siteName ?? "").trim()).filter(Boolean)));
        const isTenantAdminFlag = roleNames.some((name) => isAdminLikeRoleName(name));
        const isOwnSupportFlag = isTenantAdminFlag || roleNames.some((name) => isOwnSupportLikeRoleName(name));
        const isDealerSupportFlag = roleNames.some((name) => isDealerSupportLikeRoleName(name));
        const isDatabaseSupportFlag =
          !isOwnSupportFlag && !isDealerSupportFlag &&           roleNames.some((name) => isDatabaseSupportLikeRoleName(name));
                  const principalPayload = {
                    kind: "user",
          userId: principal.userId,
          ...(identity?.name ? { name: identity.name } : {}),
          ...(identity?.email ? { email: identity.email } : {}),
          ...(roleNames.length ? { roleNames } : {}),
          ...(roleLevels.length ? { roleLevels } : {}),
          ...(siteIds.length ? { siteIds } : {}),
          ...(siteNames.length ? { siteNames } : {}),
          ...(siteAssignments.length ? { siteAssignments } : {}),
          isTenantAdmin: isTenantAdminFlag,
          isOwnSupport: isOwnSupportFlag,
          isDealerSupport: isDealerSupportFlag,
          isDatabaseSupport: isDatabaseSupportFlag,
          isSupport:
            isTenantAdminFlag ||
            isOwnSupportFlag ||
            isDealerSupportFlag ||
            isDatabaseSupportFlag ||
            roleNames.some((name) => isSupportLikeRoleName(name) || isAdminLikeRoleName(name)),
          isAdvanced:
            isTenantAdminFlag ||
            isOwnSupportFlag ||
            isDealerSupportFlag ||
            isDatabaseSupportFlag ||
            roleNames.some((name) => isAdvancedLikeRoleName(name) || isAdminLikeRoleName(name)),
          ...(sessionPayload?.impersonatedBy ? { impersonatedBy: sessionPayload.impersonatedBy } : {})
        };
        const demo = demoStatusFromSync(
          demoSync?.record ?? (await loadDemoRecord(demoKv(env), principal.userId)),
          demoSync
        );

        const isTenantAdminActor = isTenantAdminFlag;
        const isOwnSupportActor = isOwnSupportFlag;
        const platformWideActor = Boolean(isTenantAdminActor || isOwnSupportActor);

        if (!tenantId) {
          const fallbackRows = await readPermissionsForSession(env, "", principal.userId);
          return json({
            ok: true,
            principal: principalPayload,
            tenantId: "",
            allowedTenants,
            region,
            ...(demo ? { demo } : {}),
            permissions: { mode: "deny-by-default", rows: fallbackRows }
          });
        }

        // Platform-wide roles may resolve into a tenant outside their explicit allocation; do
        // not lock them out. Impersonation sessions also remapped tenant above — never 401 the
        // admin mid-investigation just because the previous browser tenant header lingered.
        if (
          !actorCanAccessTenantId(allowedTenants, tenantId) &&
          !platformWideActor &&
          !sessionPayload?.impersonatedBy
        ) {
          return unauthorized();
        }
        if (!actorCanAccessTenantId(allowedTenants, tenantId) && sessionPayload?.impersonatedBy && allowedTenants.length) {
          tenantId = allowedTenants[0];
        }

        const effectiveRows = await readPermissionsForSession(env, tenantId, principal.userId);
        return json({
          ok: true,
          principal: principalPayload,
          tenantId,
          allowedTenants,
          region,
          ...(demo ? { demo } : {}),
          permissions: { mode: "deny-by-default", rows: effectiveRows }
        });
      }

      case "/auth/profile": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const principal = await getPrincipal(request, env);
        const profileKv = {
          get: (key: string) => kvGetSafe(env, key),
          put: async (key: string, value: string) => {
            const ok = await kvPutSafe(env, key, value);
            if (!ok) throw new Error("Unable to store profile right now.");
          }
        };

        if (principal.kind === "admin") {
          const adminEmail = await getAdminEmail(env);
          const profileKey = "admin";
          const stored = await readUserProfile(profileKv, profileKey);

          if (request.method === "GET") {
            return json({
              ok: true,
              profile: buildAuthProfilePayload({
                userId: "admin",
                email: adminEmail || "",
                fallbackName: stored.displayName || "Admin",
                stored
              })
            });
          }

          if (request.method !== "PATCH" && request.method !== "PUT" && request.method !== "POST") {
            return badRequest("Use GET or PATCH.", 405);
          }

          const parsed = await readJsonBody<{
            name?: string;
            firstName?: string;
            lastName?: string;
            employer?: string;
            homeNumber?: string;
            workNumber?: string;
            country?: string;
            language?: string;
            timezone?: string;
            format?: string;
            measurementUnits?: string;
            consumption?: string;
            phone?: string;
            theme?: string;
            currentPassword?: string;
            newPassword?: string;
            email?: string;
          }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          if (parsed.value?.email !== undefined) return badRequest("Email cannot be changed here.");

          const detailsPatch = pickProfileDetailsPatch(parsed.value);
          const composedName = resolveComposedName(parsed.value, stored, stored.displayName || "Admin");
          const phone = String(parsed.value?.phone ?? "").trim();
          const themePatch =
            parsed.value?.theme !== undefined
              ? normalizeThemePreference(parsed.value.theme)
              : undefined;
          if (
            composedName ||
            Object.keys(detailsPatch).length > 0 ||
            parsed.value?.phone !== undefined ||
            themePatch !== undefined
          ) {
            await writeUserProfile(profileKv, profileKey, {
              ...(composedName ? { displayName: composedName } : {}),
              ...detailsPatch,
              ...(parsed.value?.phone !== undefined ? { phone } : {}),
              ...(themePatch !== undefined ? { theme: themePatch } : {})
            });
          }

          const newPassword = String(parsed.value?.newPassword ?? "");
          if (newPassword) {
            const currentPassword = String(parsed.value?.currentPassword ?? "");
            if (!currentPassword) return badRequest("currentPassword is required to set a new password.");
            if (newPassword.length < 8) return badRequest("Password must be at least 8 characters.");
            const ok = await verifyAdminPassword(env, currentPassword);
            if (!ok) return badRequest("Current password is incorrect.");
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const hash = await pbkdf2HashPassword(newPassword, salt, PBKDF2_ITERATIONS);
            const formatted = formatPasswordHash(PBKDF2_ITERATIONS, salt, hash);
            try {
              await setAdminPasswordHash(env, formatted, adminEmail || undefined);
            } catch {
              return serviceUnavailable({ error: "Unable to store the new password right now." });
            }
          }

          const refreshed = await readUserProfile(profileKv, profileKey);
          return json({
            ok: true,
            profile: buildAuthProfilePayload({
              userId: "admin",
              email: adminEmail || "",
              fallbackName: refreshed.displayName || composedName || "Admin",
              stored: refreshed
            })
          });
        }

        if (principal.kind !== "user") return unauthorized();

        await ensureRbacSchema(env);
        const identity = await readRbacUserIdentity(env, principal.userId);
        if (!identity) return notFound();

        const stored = await readUserProfile(profileKv, principal.userId);

        if (request.method === "GET") {
          return json({
            ok: true,
            profile: buildAuthProfilePayload({
              userId: identity.id,
              email: identity.email,
              fallbackName: identity.name,
              stored
            })
          });
        }

        if (request.method !== "PATCH" && request.method !== "PUT" && request.method !== "POST") {
          return badRequest("Use GET or PATCH.", 405);
        }

        const parsed = await readJsonBody<{
          name?: string;
          firstName?: string;
          lastName?: string;
          employer?: string;
          homeNumber?: string;
          workNumber?: string;
          country?: string;
          language?: string;
          timezone?: string;
          format?: string;
          measurementUnits?: string;
          consumption?: string;
          phone?: string;
          theme?: string;
          currentPassword?: string;
          newPassword?: string;
          email?: string;
        }>(request);
        if (!parsed.ok) return badRequest(parsed.error);
        if (parsed.value?.email !== undefined) return badRequest("Email cannot be changed here.");

        const detailsPatch = pickProfileDetailsPatch(parsed.value);
        const composedName = resolveComposedName(parsed.value, stored, identity.name);
        const phone = parsed.value?.phone !== undefined ? String(parsed.value?.phone ?? "").trim() : undefined;
        const themePatch =
          parsed.value?.theme !== undefined
            ? normalizeThemePreference(parsed.value.theme)
            : undefined;
        const now = new Date().toISOString();

        let passwordHash: string | null = null;
        const newPassword = String(parsed.value?.newPassword ?? "");
        if (newPassword) {
          const currentPassword = String(parsed.value?.currentPassword ?? "");
          if (!currentPassword) return badRequest("currentPassword is required to set a new password.");
          if (newPassword.length < 8) return badRequest("Password must be at least 8 characters.");
          const creds = await env.VIVI_D1
            .prepare(`SELECT password_hash AS passwordHash FROM rbac_users WHERE id = ?1`)
            .bind(principal.userId)
            .first<{ passwordHash: string }>();
          const ok = await verifyPassword(currentPassword, String(creds?.passwordHash ?? ""));
          if (!ok) return badRequest("Current password is incorrect.");
          passwordHash = await hashPassword(newPassword);
        }

        if (composedName || passwordHash) {
          await env.VIVI_D1
            .prepare(
              `UPDATE rbac_users SET name = COALESCE(NULLIF(?2, ''), name), password_hash = COALESCE(?3, password_hash), updated_at = ?4 WHERE id = ?1`
            )
            .bind(principal.userId, composedName, passwordHash, now)
            .run();
        }

        if (
          Object.keys(detailsPatch).length > 0 ||
          composedName ||
          phone !== undefined ||
          themePatch !== undefined
        ) {
          await writeUserProfile(profileKv, principal.userId, {
            ...(composedName ? { displayName: composedName } : {}),
            ...detailsPatch,
            ...(phone !== undefined ? { phone } : {}),
            ...(themePatch !== undefined ? { theme: themePatch } : {})
          });
        }

        const refreshedIdentity = await readRbacUserIdentity(env, principal.userId);
        const refreshedProfile = await readUserProfile(profileKv, principal.userId);
        return json({
          ok: true,
          profile: buildAuthProfilePayload({
            userId: refreshedIdentity?.id ?? principal.userId,
            email: refreshedIdentity?.email ?? identity.email,
            fallbackName: refreshedIdentity?.name ?? (composedName || identity.name),
            stored: refreshedProfile
          })
        });
      }

      case "/auth/impersonate": {
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        const auth = await requireApiKey(request, env);
        if (auth) return auth;

        await ensureRbacSchema(env);
        const parsed = await readJsonBody<{ userId?: string }>(request);
        if (!parsed.ok) return badRequest(parsed.error);
        const userId = normalizeId(parsed.value?.userId);
        if (!userId) return badRequest("userId is required");

        const tenantId = getTenantId(request, url);
        const actor = await readRbacActorContext(request, env, tenantId || "");
        if (!actor) return unauthorized();
        // Platform Admin, Tenant Admin, and Own Support may impersonate accounts they can see.
        if (!(actor.isAdmin || actor.isTenantAdmin || actor.isOwnSupport)) return unauthorized();

        const existing = await env.VIVI_D1.prepare(`SELECT id FROM rbac_users WHERE id = ?1`).bind(userId).first();
        if (!existing) return notFound();

        if (!actor.isAdmin) {
          const scopeTenantId = String(tenantId || actor.allowedTenants[0] || "").trim();
          if (!scopeTenantId) return badRequest("Select a database before impersonating.");
          if (!(await canActorSeeUserInTenant(env, scopeTenantId, actor, userId))) {
            return unauthorized();
          }
        }

        let sharedDemoTenantId = "";
        try {
          const demoSync = await syncDemoHierarchyAccess(env, userId, region);
          sharedDemoTenantId = demoSync.shared?.tenantId ?? "";
        } catch {
          sharedDemoTenantId = "";
        }
        const token = await createUserSession(env, userId, { impersonatedBy: { kind: "admin" } });
        const actorToken = String(request.headers.get("x-api-key") ?? "").trim();
        const actorKind = actor.isAdmin ? "admin" : "user";
        const actorUserId = String(actor.userId ?? "").trim();
        await kvPutSafe(
          env,
          `${IMPERSONATION_RETURN_PREFIX}${token}`,
          JSON.stringify({
            actorKind,
            actorUserId,
            actorToken,
            tenantId: String(tenantId || actor.allowedTenants[0] || "").trim()
          }),
          SESSION_TTL_SECONDS
        );
        const allowedTenants = await readAllowedTenantIdsForUser(env, userId);
        const preferredTenantId = String(
          (sharedDemoTenantId && actorCanAccessTenantId(allowedTenants, sharedDemoTenantId) ? sharedDemoTenantId : "") ||
            (tenantId && actorCanAccessTenantId(allowedTenants, tenantId) ? tenantId : "") ||
            allowedTenants[0] ||
            tenantId ||
            ""
        ).trim();
        return json({
          ok: true,
          token,
          userId,
          impersonated: true,
          tenantId: preferredTenantId || undefined,
          allowedTenants
        });
      }

      case "/auth/stop-impersonate": {
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const principal = await getPrincipal(request, env);
        if (principal.kind === "none") return unauthorized();
        const currentToken = String(request.headers.get("x-api-key") ?? "").trim();
        if (!currentToken) return unauthorized();

        const sessionPayload = principal.kind === "user" ? await getUserSessionPayload(env, principal.token) : null;
        if (!sessionPayload?.impersonatedBy) {
          return badRequest("You are not impersonating an account.");
        }

        let actorKind = "";
        let actorUserId = "";
        let actorToken = "";
        let returnTenantId = "";
        try {
          const raw = await kvGetSafe(env, `${IMPERSONATION_RETURN_PREFIX}${currentToken}`);
          if (raw) {
            const parsed = JSON.parse(raw) as {
              actorKind?: string;
              actorUserId?: string;
              actorToken?: string;
              tenantId?: string;
            };
            actorKind = String(parsed?.actorKind ?? "").trim();
            actorUserId = String(parsed?.actorUserId ?? "").trim();
            actorToken = String(parsed?.actorToken ?? "").trim();
            returnTenantId = String(parsed?.tenantId ?? "").trim();
          }
        } catch {
          // ignore malformed return payload
        }

        let nextToken = "";
        if (actorToken && actorToken !== currentToken) {
          const adminOk = await validateAdminSession(env, actorToken);
          const userId = adminOk ? "" : await getUserIdForSession(env, actorToken);
          if (adminOk || userId) nextToken = actorToken;
        }
        if (!nextToken && actorKind === "user" && actorUserId) {
          nextToken = await createUserSession(env, actorUserId);
        }
        if (!nextToken) {
          nextToken = await createAdminSession(env);
        }

        await kvDeleteSafe(env, `${USER_SESSION_PREFIX}${currentToken}`);
        await kvDeleteSafe(env, `${IMPERSONATION_RETURN_PREFIX}${currentToken}`);
        return json({
          ok: true,
          token: nextToken,
          tenantId: returnTenantId || undefined
        });
      }

      // --- RBAC CRUD ---
      case "/rbac/users": {
        await ensureRbacSchema(env);
        if (request.method === "GET") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const tenantId = getTenantId(request, url);
          if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
          // Do not seed roles on list — that previously burned Worker CPU with hundreds of D1 writes
          // and returned Cloudflare 1101, which made the users list appear empty in the UI.
          try {
            await backfillLegacyUserTenantMembership(env, tenantId);
          } catch {
            // Best-effort repair; listing still uses UNION of membership sources below.
          }
          const access = await requireRbacPermission(request, env, tenantId, "/Control/user-admin/users", "view");
          if (access) return access;
          const actor = await readRbacActorContext(request, env, tenantId);
          if (!actor) return unauthorized();
          try {
            await healOrphanRbacUsersForTenant(env, tenantId, actor);
          } catch {
            // listing still proceeds
          }
          const requestedUserId = normalizeId(url.searchParams.get("userId") || url.searchParams.get("id"));
          if (requestedUserId) {
            if (!(await canActorSeeUserInTenant(env, tenantId, actor, requestedUserId))) return unauthorized();
            let row: Record<string, unknown> | null = null;
            try {
              const source = await listRbacUserRowsForTenant(env, tenantId);
              row =
                source.find((item) => normalizeId((item as { id?: unknown }).id) === requestedUserId) ?? null;
            } catch {
              row = null;
            }
            if (!row) {
              const identity = await readRbacUserIdentity(env, requestedUserId);
              if (!identity) return notFound();
              const assignedTenantIds = await readAllowedTenantIdsForUser(env, requestedUserId);
              row = {
                ...identity,
                assignedTenantId: assignedTenantIds[0] || tenantId,
                assignedTenantIds: assignedTenantIds.join(",") || tenantId
              };
            }
            const user = await hydrateRbacUserAssignmentFields(
              env,
              sanitizeRbacUserRowForTenant(row, tenantId),
              requestedUserId
            );
            return json({ user, users: [user], tenantId });
          }
          let source: Record<string, unknown>[] = [];
          try {
            source = await listRbacUserRowsForTenant(env, tenantId);
          } catch (e: any) {
            return badRequest(`Unable to load users: ${String(e?.message ?? e)}`);
          }
          // Always apply privilege + database visibility (no support bypass).
          const users: any[] = [];
          const kv = demoKv(env);
          const CHUNK = 12;
          for (let i = 0; i < source.length; i += CHUNK) {
            const chunk = source.slice(i, i + CHUNK);
            const built = await Promise.all(
              chunk.map(async (row) => {
                const targetUserId = normalizeId((row as any)?.id);
                if (!targetUserId) return null;
                if (!(await canActorSeeUserInTenant(env, tenantId, actor, targetUserId, { skipMembershipCheck: true }))) return null;
                const user = sanitizeRbacUserRowForTenant(row as Record<string, unknown>, tenantId);
                const demo = toPublicDemoStatus(await loadDemoRecord(kv, targetUserId), Date.now());
                return demo ? { ...user, demo } : user;
              })
            );
            for (const item of built) if (item) users.push(item);
          }
          return json({ users, tenantId, count: users.length });
        }
        if (request.method === "POST") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const parsed = await readJsonBody<{
            name?: string;
            email?: string;
            password?: string;
            status?: string;
            roleId?: string;
            roleName?: string;
            sendInvite?: boolean;
            assignment?: {
              tenantId?: string;
              tenantIds?: string[];
              siteId?: string;
              siteName?: string;
              siteAssignments?: RequestedSiteAssignment[];
            };
          }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const name = String(parsed.value?.name ?? "").trim();
          const email = String(parsed.value?.email ?? "").trim().toLowerCase();
          const password = String(parsed.value?.password ?? "");
          const requestedStatus = String(parsed.value?.status ?? "").trim().toLowerCase();
          if (!name) return badRequest("name is required");
          if (!email) return badRequest("email is required");

          const isInvite = !password;
          const status = requestedStatus || (isInvite ? "invited" : "active");
          const passwordHash = await hashPassword(password || crypto.randomUUID() + crypto.randomUUID());
          const id = uuid();
          const now = new Date().toISOString();
          const requestTenantId = getTenantId(request, url);
          let assignmentTenantIds = normalizeRequestedTenantIds(parsed.value?.assignment);
          // Fall back to the active database header so create does not 400 when the UI
          // only selected a site (or omitted tenantIds after the modules upgrade).
          if (!assignmentTenantIds.length && requestTenantId) {
            assignmentTenantIds = [requestTenantId];
          }
          const primaryAssignmentTenantId = assignmentTenantIds[0] ?? "";
          if (!primaryAssignmentTenantId) {
            return badRequest("Select a database (or include assignment.tenantIds) before creating a user.");
          }
          if (requestTenantId && !assignmentTenantIds.every((tid) => tid === requestTenantId)) {
            const scopeActor = await readRbacActorContext(request, env, requestTenantId);
            if (!scopeActor?.isAdmin && !scopeActor?.isTenantAdmin) {
              return badRequest("Users can only be created in the active database (x-tenant-id)");
            }
          }

          const actorByTenant = new Map<string, RbacActorContext>();
          for (const assignmentTenantId of assignmentTenantIds) {
            const assignmentParts = assignmentTenantId
              .split(":")
              .map((v) => normalizeId(v))
              .filter(Boolean);
            if (assignmentParts.length < 3) {
              return badRequest("assignment.tenantIds must include dealer:organisation:database");
            }
            await ensureStandardRolesForTenant(env.VIVI_D1, assignmentTenantId);
            await backfillLegacyUserTenantMembership(env, assignmentTenantId);
            const access = await requireRbacPermission(request, env, assignmentTenantId, "/Control/user-admin/users", "edit");
            if (access) return access;
            const actorForTenant = await readRbacActorContext(request, env, assignmentTenantId);
            if (!actorForTenant) return unauthorized();
            if (!actorForTenant.isAdmin && !actorForTenant.isTenantAdmin && !actorCanAccessTenantId(actorForTenant.allowedTenants, assignmentTenantId)) {
              return unauthorized();
            }
            actorByTenant.set(assignmentTenantId, actorForTenant);
          }
          const actor = actorByTenant.get(primaryAssignmentTenantId);
          if (!actor) return unauthorized();

          let assignmentSiteAssignments = normalizeRequestedSiteAssignments(parsed.value?.assignment).filter((row) =>
            assignmentTenantIds.includes(row.tenantId)
          );
          if (!assignmentSiteAssignments.length) {
            const rawSites = normalizeRequestedSiteAssignments(parsed.value?.assignment);
            assignmentSiteAssignments = rawSites.map((row) => ({
              ...row,
              tenantId: row.tenantId || primaryAssignmentTenantId
            }));
          }
          const assignmentRoleId = normalizeId(parsed.value?.roleId);
          const assignmentRoleNameHint = normalizeId(parsed.value?.roleName);
          if (!assignmentRoleId && !assignmentRoleNameHint) {
            return badRequest("roleId is required");
          }
          let assignmentRoleName = "";
          let resolvedRoleAssignments: Array<{ tenantId: string; roleId: string; roleName: string }> = [];
          try {
            resolvedRoleAssignments = await resolveRoleAssignmentsForTenants(
              env,
              assignmentTenantIds,
              assignmentRoleId,
              assignmentRoleNameHint
            );
          } catch (e: any) {
            return badRequest(String(e?.message ?? e));
          }
          for (const roleAssignment of resolvedRoleAssignments) {
            const actorForTenant = actorByTenant.get(roleAssignment.tenantId);
            if (!actorForTenant) return unauthorized();
            const visibleRoleIds = await readVisibleRoleIdsForActor(env, roleAssignment.tenantId, actorForTenant);
            if (!visibleRoleIds.includes(roleAssignment.roleId) && !actorForTenant.isAdmin && !actorForTenant.isTenantAdmin) {
              return unauthorized();
            }
          }
          assignmentRoleName = resolvedRoleAssignments[0]?.roleName ?? "";
          if (!resolvedRoleAssignments.length) {
            return badRequest("Selected role is not available in the active database. Open Roles once to seed standard roles, then retry.");
          }

          const scopeError = validateAssignmentForRoleScope(assignmentRoleName ? [assignmentRoleName] : [], {
            tenantIds: assignmentTenantIds,
            siteIds: assignmentSiteAssignments.map((row) => row.siteId),
            siteAssignments: assignmentSiteAssignments
          });
          if (scopeError) return badRequest(scopeError);

          const actorScopeError = await validateActorAssignmentScope(env, actor, assignmentTenantIds, assignmentSiteAssignments);
          if (actorScopeError) return badRequest(actorScopeError);

          let savedUserId = id;
          let reusedExisting = false;
          const existingByEmail = await findRbacUserByEmail(env, email);
          if (existingByEmail) {
            const existingId = normalizeId(existingByEmail.id);
            const targetLevel = await readHighestPrivilegeRoleLevelForUser(env, primaryAssignmentTenantId, existingId);
            if (targetLevel < actor.highestPrivilegeRoleLevel && !actor.isAdmin && !actor.isTenantAdmin) {
              return rbacUserEmailExistsResponse(email, existingId);
            }
            savedUserId = existingId;
            reusedExisting = true;
            await env.VIVI_D1
              .prepare(`UPDATE rbac_users SET name = COALESCE(NULLIF(?2, ''), name), updated_at = ?3 WHERE id = ?1`)
              .bind(savedUserId, name, now)
              .run();
          } else {
            try {
              await env.VIVI_D1
                .prepare(`INSERT INTO rbac_users (id, name, email, password_hash, status, created_at, updated_at, created_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)`)
                .bind(id, name, email, passwordHash, status, now, actor.userId || null)
                .run();
            } catch (e: any) {
              if (isRbacUserEmailUniqueConstraintError(e)) {
                const raced = await findRbacUserByEmail(env, email);
                if (!raced?.id) return rbacUserEmailExistsResponse(email);
                savedUserId = normalizeId(raced.id);
                reusedExisting = true;
              } else {
                return badRequest(String(e?.message ?? e));
              }
            }
          }

          await applyRbacUserTenantAssignments(
            env,
            savedUserId,
            assignmentTenantIds,
            assignmentSiteAssignments,
            resolvedRoleAssignments,
            now
          );
          await grantUserRegion(env, savedUserId, resolveRequestRegion(request), now);

          const shouldSendInvite = reusedExisting
            ? Boolean(parsed.value?.sendInvite)
            : Boolean(parsed.value?.sendInvite) || isInvite;
          const inviteEmailRequestId = shouldSendInvite ? createEmailRequestId() : "";
          let inviteEmailAttempted = false;
          let inviteEmailSent = false;
          let inviteEmailProvider: "resend" | "none" = "none";
          let inviteEmailError = "";

          if (shouldSendInvite) {
            const fromEmail = String(env.MAIL_FROM ?? "").trim();
            const fromName = String(env.MAIL_FROM_NAME ?? env.APP_NAME ?? "").trim();
            const resendKey = String(env.RESEND_API_KEY ?? "").trim();
            if (!fromEmail || !resendKey) {
              inviteEmailError = "MAIL_FROM or RESEND_API_KEY is not configured";
            } else {
              const inviteToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
              try {
                const stored = await storeAuthResetToken(env, {
                  token: inviteToken,
                  kind: "invite",
                  email,
                  userId: savedUserId,
                  payload: { userId: savedUserId, email, createdAt: now },
                  ttlSeconds: INVITE_TOKEN_TTL_SECONDS
                });
                if (!stored) throw new Error("Unable to store invite token");
                const originFromHeader = String(request.headers.get("origin") ?? "").trim();
                const base = String(env.APP_BASE_URL ?? originFromHeader).trim() || "https://us.vivitelematics.ca";
                const inviteUrl = `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(inviteToken)}`;
                const subject = `Set up your Vivi Telematics password [${inviteEmailRequestId}]`;
                const text =
                  `Hi ${name || ""},\n\n` +
                  `An account has been created for you on Vivi Telematics.\n\n` +
                  `Set your password here:\n${inviteUrl}\n\n` +
                  `Reference: ${inviteEmailRequestId}\n\n` +
                  `This link expires in 7 days.\n`;

                inviteEmailAttempted = true;
                inviteEmailProvider = "resend";
                await sendResendEmail({ apiKey: resendKey, to: email, from: fromEmail, fromName: fromName || undefined, subject, text });
                inviteEmailSent = true;
              } catch (error: any) {
                inviteEmailError = String(error?.message ?? error ?? "Invite email send failed");
              }
            }
          }

          return json({
            stored: true,
            id: savedUserId,
            reused: reusedExisting,
            assignedTenantId: primaryAssignmentTenantId || undefined,
            assignedTenantIds: assignmentTenantIds,
            assignedSiteId: assignmentSiteAssignments[0]?.siteId || undefined,
            assignedSiteName: assignmentSiteAssignments[0]?.siteName || undefined,
            assignedSiteIds: assignmentSiteAssignments.map((row) => row.siteId),
            assignedRoleId: resolvedRoleAssignments[0]?.roleId || undefined,
            assignedRoleName: assignmentRoleName || undefined,
            inviteEmailRequested: shouldSendInvite,
            inviteEmailRequestId: inviteEmailRequestId || undefined,
            inviteEmailAttempted,
            inviteEmailSent,
            inviteEmailProvider,
            inviteEmailError: inviteEmailError || undefined
          });
        }
        if (request.method === "PUT") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const parsed = await readJsonBody<{
            id?: string;
            name?: string;
            email?: string;
            password?: string;
            status?: string;
            sendInvite?: boolean;
            roleId?: string;
            roleName?: string;
            assignment?: {
              tenantId?: string;
              tenantIds?: string[];
              siteId?: string;
              siteName?: string;
              siteAssignments?: RequestedSiteAssignment[];
            };
          }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const id = normalizeId(parsed.value?.id);
          if (!id) return badRequest("id is required");
          const name = String(parsed.value?.name ?? "").trim();
          const email = String(parsed.value?.email ?? "").trim().toLowerCase();
          const password = String(parsed.value?.password ?? "");
          const status = String(parsed.value?.status ?? "").trim().toLowerCase();
          const now = new Date().toISOString();
          const tenantId = getTenantId(request, url);
          if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");

          const access = await requireRbacPermission(request, env, tenantId, "/Control/user-admin/users", "edit");
          if (access) return access;
          const actor = await readRbacActorContext(request, env, tenantId);
          if (!actor) return unauthorized();
          if (!(await canActorSeeUserInTenant(env, tenantId, actor, id))) return unauthorized();

          const existing = await env.VIVI_D1.prepare(`SELECT id FROM rbac_users WHERE id = ?1`).bind(id).first();
          if (!existing) return notFound();

          if (email) {
            const existingByEmail = await findRbacUserByEmail(env, email, id);
            if (existingByEmail) {
              return rbacUserEmailExistsResponse(email, existingByEmail.id);
            }
          }

          const assignmentRoleId = normalizeId(parsed.value?.roleId);
          const assignmentRoleNameHint = normalizeId(parsed.value?.roleName);
          const hasAssignmentPayload = Object.prototype.hasOwnProperty.call(parsed.value ?? {}, "assignment");
          const requestedAssignmentTenantIds = normalizeRequestedTenantIds(parsed.value?.assignment);
          let nextTenantIds = requestedAssignmentTenantIds.length ? requestedAssignmentTenantIds : assignmentRoleId ? [tenantId] : [];
          if (hasAssignmentPayload && !requestedAssignmentTenantIds.length) {
            if (!assignmentRoleId) {
            return badRequest("assignment.tenantIds is required");
          }
            try {
              const probe = await resolveRoleAssignmentsForTenants(env, [tenantId], assignmentRoleId, assignmentRoleNameHint);
              const scopeError = validateAssignmentForRoleScope(
                probe.map((row) => row.roleName),
                {
                  tenantIds: [],
                  siteIds: normalizeRequestedSiteAssignments(parsed.value?.assignment).map((row) => row.siteId),
                  siteAssignments: normalizeRequestedSiteAssignments(parsed.value?.assignment)
                }
              );
              if (scopeError) return badRequest(scopeError);
              nextTenantIds = [tenantId];
            } catch (error: any) {
              return badRequest(String(error?.message ?? error ?? "roleId is invalid for the selected tenant"));
            }
          }
          const canManageMultiTenantAssignments =
            isActorAdminScope(actor) || actor.isOwnSupport || actor.isDealerSupport || actor.isAdvanced;
          if (!canManageMultiTenantAssignments) {
            nextTenantIds = [tenantId];
          } else if (hasAssignmentPayload && requestedAssignmentTenantIds.length) {
            nextTenantIds = requestedAssignmentTenantIds;
          }
          let assignmentSiteAssignments = normalizeRequestedSiteAssignments(parsed.value?.assignment);
          if (nextTenantIds.length) {
            const allowed = new Set(nextTenantIds);
            const matched = assignmentSiteAssignments.filter((row) => allowed.has(row.tenantId));
            assignmentSiteAssignments = matched.length ? matched : assignmentSiteAssignments.map((row) => ({
              ...row,
              tenantId: row.tenantId || nextTenantIds[0]
            }));
          }
          if (!canManageMultiTenantAssignments) {
            assignmentSiteAssignments = assignmentSiteAssignments.filter((row) => row.tenantId === tenantId);
          }
          const actorByTenant = new Map<string, RbacActorContext>([[tenantId, actor]]);
          for (const nextTenantId of nextTenantIds) {
            if (nextTenantId !== tenantId && !actor.isAdmin && !actor.isTenantAdmin) {
              if (!actorCanAccessTenantId(actor.allowedTenants, nextTenantId)) return unauthorized();
            }
            const assignmentParts = nextTenantId
              .split(":")
              .map((v) => normalizeId(v))
              .filter(Boolean);
            if (assignmentParts.length < 3) return badRequest("assignment.tenantIds must include dealer:organisation:database");
            if (nextTenantId === tenantId) continue;
            const nextActor = await readRbacActorContext(request, env, nextTenantId);
            if (!nextActor) return unauthorized();
            actorByTenant.set(nextTenantId, nextActor);
          }

          let assignmentRoleName = "";
          let resolvedRoleAssignments: Array<{ tenantId: string; roleId: string; roleName: string }> = [];
          if (assignmentRoleId) {
            const roleTenantIds = nextTenantIds.length ? nextTenantIds : [tenantId];
            resolvedRoleAssignments = await resolveRoleAssignmentsForTenants(env, roleTenantIds, assignmentRoleId, assignmentRoleNameHint);
            for (const roleAssignment of resolvedRoleAssignments) {
              const actorForTenant = actorByTenant.get(roleAssignment.tenantId);
              if (!actorForTenant) return unauthorized();
              const visibleRoleIds = await readVisibleRoleIdsForActor(env, roleAssignment.tenantId, actorForTenant);
              if (!visibleRoleIds.includes(roleAssignment.roleId) && !actorForTenant.isAdmin && !actorForTenant.isTenantAdmin) {
                return unauthorized();
              }
            }
            assignmentRoleName = resolvedRoleAssignments[0]?.roleName ?? "";
          }

          if (hasAssignmentPayload || assignmentRoleId) {
            const scopeError = validateAssignmentForRoleScope(assignmentRoleName ? [assignmentRoleName] : [], {
              tenantIds: nextTenantIds,
              siteIds: assignmentSiteAssignments.map((row) => row.siteId),
              siteAssignments: assignmentSiteAssignments
            });
            if (scopeError) return badRequest(scopeError);

            const actorScopeError = await validateActorAssignmentScope(env, actor, nextTenantIds, assignmentSiteAssignments);
            if (actorScopeError) return badRequest(actorScopeError);
          }

          let passwordHash: string | null = null;
          if (password) passwordHash = await hashPassword(password);

          try {
            await env.VIVI_D1
              .prepare(
                `UPDATE rbac_users SET name = COALESCE(NULLIF(?2, ''), name), email = COALESCE(NULLIF(?3, ''), email), status = COALESCE(NULLIF(?4, ''), status), password_hash = COALESCE(?5, password_hash), updated_at = ?6 WHERE id = ?1`
              )
              .bind(id, name, email, status, passwordHash, now)
              .run();
          } catch (e: any) {
            if (isRbacUserEmailUniqueConstraintError(e)) {
              return rbacUserEmailExistsResponse(email);
            }
            return badRequest(String(e?.message ?? e));
          }

          if (hasAssignmentPayload || assignmentRoleId) {
            const updateTenantIds = nextTenantIds.length ? nextTenantIds : [tenantId];
            const roleAssignmentsToApply = canManageMultiTenantAssignments
              ? resolvedRoleAssignments
              : resolvedRoleAssignments.filter((row) => row.tenantId === tenantId);
            await replaceRbacUserTenantAssignments(
              env,
              id,
              updateTenantIds,
              assignmentSiteAssignments,
              roleAssignmentsToApply,
              now
            );
            try {
              await syncDemoHierarchyAccess(env, id, region);
            } catch {
              // The account save stands. The next sign-in restores the shared Demo site while the window is open.
            }
          }

          const shouldSendInvite = Boolean(parsed.value?.sendInvite);
          const inviteEmailRequestId = shouldSendInvite ? createEmailRequestId() : "";
          let inviteEmailAttempted = false;
          let inviteEmailSent = false;
          let inviteEmailProvider: "resend" | "none" = "none";
          let inviteEmailError = "";

          if (parsed.value?.sendInvite) {
            const fromEmail = String(env.MAIL_FROM ?? "").trim();
            const fromName = String(env.MAIL_FROM_NAME ?? env.APP_NAME ?? "").trim();
            const resendKey = String(env.RESEND_API_KEY ?? "").trim();
            if (!fromEmail || !resendKey) {
              inviteEmailError = "MAIL_FROM or RESEND_API_KEY is not configured";
            } else {
              const inviteToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
              try {
                const stored = await storeAuthResetToken(env, {
                  token: inviteToken,
                  kind: "invite",
                  email: email || undefined,
                  userId: id,
                  payload: { userId: id, email: email || undefined, createdAt: now },
                  ttlSeconds: INVITE_TOKEN_TTL_SECONDS
                });
                if (!stored) throw new Error("Unable to store invite token");
                const originFromHeader = String(request.headers.get("origin") ?? "").trim();
                const base = String(env.APP_BASE_URL ?? originFromHeader).trim() || "https://us.vivitelematics.ca";
                const inviteUrl = `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(inviteToken)}`;
                const subject = `Set up your Vivi Telematics password [${inviteEmailRequestId}]`;
                const text = `Set your password here:\n${inviteUrl}\n\nReference: ${inviteEmailRequestId}\n\nThis link expires in 7 days.\n`;
                inviteEmailAttempted = true;
                inviteEmailProvider = "resend";
                await sendResendEmail({ apiKey: resendKey, to: email, from: fromEmail, fromName: fromName || undefined, subject, text });
                inviteEmailSent = true;
              } catch (error: any) {
                inviteEmailError = String(error?.message ?? error ?? "Invite email send failed");
              }
            }
          }
          return json({
            stored: true,
            id,
            assignedTenantId: nextTenantIds[0] || undefined,
            assignedTenantIds: nextTenantIds,
            assignedSiteId: assignmentSiteAssignments[0]?.siteId || undefined,
            assignedSiteName: assignmentSiteAssignments[0]?.siteName || undefined,
            assignedSiteIds: assignmentSiteAssignments.map((row) => row.siteId),
            assignedRoleId: resolvedRoleAssignments[0]?.roleId || undefined,
            assignedRoleName: assignmentRoleName || undefined,
            inviteEmailRequested: shouldSendInvite,
            inviteEmailRequestId: inviteEmailRequestId || undefined,
            inviteEmailAttempted,
            inviteEmailSent,
            inviteEmailProvider,
            inviteEmailError: inviteEmailError || undefined
          });
        }
        return badRequest("Unsupported method.", 405);
      }

      case "/rbac/roles": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        await ensureRbacSchema(env);
        try {
          await ensureStandardRolesForTenant(env.VIVI_D1, tenantId);
        } catch {
          // Best-effort; listing roles should still work if seed already exists.
        }
        const actor = await readRbacActorContext(request, env, tenantId);
        if (!actor) return unauthorized();

        if (request.method === "GET") {
          const access = await requireRbacPermission(request, env, tenantId, "/Control/user-admin/roles", "view");
          if (access) return access;
          const visibleRoleIds = await readVisibleRoleIdsForActor(env, tenantId, actor);
          if (!visibleRoleIds.length) return json({ roles: [], permissions: [], tenantId });
          const placeholders = visibleRoleIds.map(() => "?").join(",");
          const roles = await env.VIVI_D1
            .prepare(`SELECT id, name, description, status, COALESCE(role_level, 100) AS roleLevel, COALESCE(is_system, 0) AS isSystem, standard_role_key AS standardRoleKey, created_at AS createdAt, updated_at AS updatedAt FROM rbac_roles WHERE tenant_id = ?1 AND id IN (${placeholders}) ORDER BY COALESCE(role_level, 100) ASC, updated_at DESC`)
            .bind(tenantId, ...visibleRoleIds)
            .all();
          const perms = await env.VIVI_D1
            .prepare(`SELECT role_id AS roleId, page_path AS pagePath, can_view AS canView, can_edit AS canEdit, can_delete AS canDelete FROM rbac_role_permissions WHERE tenant_id = ?1 AND role_id IN (${placeholders})`)
            .bind(tenantId, ...visibleRoleIds)
            .all();
          const roleRows = Array.isArray(roles.results) ? roles.results : [];
          const permRows = Array.isArray(perms.results) ? perms.results : [];
          const roleMeta = new Map(
            roleRows.map((role: any) => [
              String(role?.id ?? "").trim(),
              {
                key: String(role?.standardRoleKey ?? "").trim(),
                name: String(role?.name ?? "").trim()
              }
            ])
          );
          const filteredPerms = permRows.filter((row: any) => {
            const roleId = String(row?.roleId ?? "").trim();
            const meta = roleMeta.get(roleId);
            return standardRoleAllowsPage(meta?.key ?? "", String(row?.pagePath ?? ""), meta?.name ?? "");
          });
          return json({ roles: roleRows, permissions: filteredPerms, tenantId });
        }
        if (request.method === "POST") {
          const access = await requireRbacPermission(request, env, tenantId, "/Control/user-admin/roles", "edit");
          if (access) return access;
          if (!actor.isAdmin && !actor.isSupport && !actor.isTenantAdmin) return unauthorized();
          const parsed = await readJsonBody<{ name?: string; description?: string; status?: string; roleLevel?: number; permissions?: RbacPermissionRow[] }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const name = String(parsed.value?.name ?? "").trim();
          if (!name) return badRequest("name is required");
          if (isStandardRoleName(name)) {
            return badRequest(`"${name}" is a built-in role. Pick a different custom role name.`);
          }
          const description = String(parsed.value?.description ?? "").trim();
          const status = String(parsed.value?.status ?? "active").trim().toLowerCase() || "active";
          const roleLevel = Math.max(0, Math.min(999, Math.trunc(Number(parsed.value?.roleLevel ?? 100) || 100)));
          const id = uuid();
          const now = new Date().toISOString();
          try {
            await env.VIVI_D1
              .prepare(`INSERT INTO rbac_roles (id, tenant_id, name, description, status, role_level, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`)
              .bind(id, tenantId, name, description || null, status, roleLevel, now)
              .run();
          } catch (e: any) {
            const message = String(e?.message ?? e);
            if (/UNIQUE|unique|constraint/i.test(message)) {
              return badRequest(`A role named "${name}" already exists in this database.`);
            }
            return badRequest(message);
          }

          const permissions = Array.isArray(parsed.value?.permissions) ? parsed.value.permissions : [];
          for (const row of permissions) {
            const pagePath = String((row as any).pagePath ?? "").trim();
            if (!pagePath || !(row.view || row.edit || row.delete)) continue;
            await env.VIVI_D1
              .prepare(
                `INSERT OR REPLACE INTO rbac_role_permissions (tenant_id, role_id, page_path, can_view, can_edit, can_delete) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
              )
              .bind(tenantId, id, pagePath, row.view ? 1 : 0, row.edit ? 1 : 0, row.delete ? 1 : 0)
              .run();
          }
          return json({ stored: true, id, tenantId, roleLevel });
        }
        if (request.method === "PUT") {
          const access = await requireRbacPermission(request, env, tenantId, "/Control/user-admin/roles", "edit");
          if (access) return access;
          if (!actor.isAdmin && !actor.isSupport) return unauthorized();
          const parsed = await readJsonBody<{ id?: string; name?: string; description?: string; status?: string; roleLevel?: number; permissions?: RbacPermissionRow[] }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const id = normalizeId(parsed.value?.id);
          if (!id) return badRequest("id is required");
          const existingRole = await env.VIVI_D1
            .prepare(`SELECT name, COALESCE(role_level, 100) AS roleLevel, COALESCE(is_system, 0) AS isSystem, COALESCE(standard_role_key, '') AS standardRoleKey FROM rbac_roles WHERE tenant_id = ?1 AND id = ?2 LIMIT 1`)
            .bind(tenantId, id)
            .first<{ name: string; roleLevel: number; isSystem: number; standardRoleKey?: string }>();
          if (!existingRole) return notFound();
          const isSystemRole = Number((existingRole as any).isSystem ?? 0) === 1;
          const name = String(parsed.value?.name ?? "").trim();
          const description = String(parsed.value?.description ?? "").trim();
          const status = String(parsed.value?.status ?? "active").trim().toLowerCase() || "active";
          const requestedRoleLevel = Math.max(0, Math.min(999, Math.trunc(Number(parsed.value?.roleLevel ?? 100) || 100)));
          const roleLevel = isSystemRole && !actor.isAdmin ? Number((existingRole as any).roleLevel ?? 100) : requestedRoleLevel;
          const resolvedName = isSystemRole && !actor.isAdmin ? String((existingRole as any).name ?? "").trim() : name;
          const now = new Date().toISOString();
          await env.VIVI_D1
            .prepare(`UPDATE rbac_roles SET name = COALESCE(NULLIF(?3, ''), name), description = ?4, status = COALESCE(NULLIF(?5, ''), status), role_level = ?6, updated_at = ?7 WHERE tenant_id = ?2 AND id = ?1`)
            .bind(id, tenantId, resolvedName, description || null, status, roleLevel, now)
            .run();

          await env.VIVI_D1.prepare(`DELETE FROM rbac_role_permissions WHERE tenant_id = ?1 AND role_id = ?2`).bind(tenantId, id).run();
          const permissions = Array.isArray(parsed.value?.permissions) ? parsed.value.permissions : [];
          const roleKey = String((existingRole as any)?.standardRoleKey ?? "").trim();
          const roleNameForPerms = String((existingRole as any)?.name ?? resolvedName ?? "").trim();
          for (const row of permissions) {
            const pagePath = String((row as any).pagePath ?? "").trim();
            if (!pagePath || !(row.view || row.edit || row.delete)) continue;
            if (!standardRoleAllowsPage(roleKey, pagePath, roleNameForPerms)) continue;
            await env.VIVI_D1
              .prepare(
                `INSERT OR REPLACE INTO rbac_role_permissions (tenant_id, role_id, page_path, can_view, can_edit, can_delete) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
              )
              .bind(tenantId, id, pagePath, row.view ? 1 : 0, row.edit ? 1 : 0, row.delete ? 1 : 0)
              .run();
          }
          return json({ stored: true, id, tenantId, roleLevel });
        }
        return badRequest("Unsupported method.", 405);
      }

      case "/rbac/security-groups": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        await ensureRbacSchema(env);

        if (request.method === "GET") {
          const access = await requireRbacPermission(request, env, tenantId, "/Control/user-admin/security-groups", "view");
          if (access) return access;
          try {
            await ensureDefaultSupportSecurityGroups(env, tenantId);
          } catch {
            // Listing still proceeds without the defaults.
          }
          const groups = await env.VIVI_D1
            .prepare(`SELECT id, name, description, status, created_at AS createdAt, updated_at AS updatedAt FROM rbac_security_groups WHERE tenant_id = ?1 ORDER BY updated_at DESC`)
            .bind(tenantId)
            .all();
          const groupRoles = await env.VIVI_D1
            .prepare(`SELECT group_id AS groupId, role_id AS roleId FROM rbac_group_roles WHERE tenant_id = ?1`)
            .bind(tenantId)
            .all();
          const groupUsers = await env.VIVI_D1
            .prepare(`SELECT group_id AS groupId, user_id AS userId FROM rbac_user_groups WHERE tenant_id = ?1`)
            .bind(tenantId)
            .all();
          const allGroupRoles = Array.isArray(groupRoles.results) ? (groupRoles.results as any[]) : [];
          let groupRows = Array.isArray(groups.results) ? (groups.results as any[]) : [];
          let groupRoleRows = allGroupRoles;
          const sgActor = await readRbacActorContext(request, env, tenantId);
          if (sgActor && !sgActor.isAdmin && sgActor.isDatabaseSupport && !sgActor.isDealerSupport && !sgActor.isOwnSupport && !sgActor.isTenantAdmin) {
            const visible = new Set(await readVisibleRoleIdsForActor(env, tenantId, sgActor));
            const hiddenGroupIds = new Set<string>();
            for (const g of groupRows) {
              if (roleIsAtOrAboveDealerSupport(String(g?.name ?? ""), "")) hiddenGroupIds.add(String(g?.id ?? ""));
            }
            for (const gr of allGroupRoles) {
              if (!visible.has(String(gr?.roleId ?? ""))) hiddenGroupIds.add(String(gr?.groupId ?? ""));
            }
            groupRows = groupRows.filter((g) => !hiddenGroupIds.has(String(g?.id ?? "")));
            groupRoleRows = allGroupRoles.filter((gr) => !hiddenGroupIds.has(String(gr?.groupId ?? "")));
          }
          return json({ groups: groupRows, groupRoles: groupRoleRows, groupUsers: groupUsers.results ?? [], tenantId });
        }

        if (request.method === "POST") {
          const access = await requireRbacPermission(request, env, tenantId, "/Control/user-admin/security-groups", "edit");
          if (access) return access;
          const parsed = await readJsonBody<{ name?: string; description?: string; status?: string; roleIds?: string[]; userIds?: string[] }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const name = String(parsed.value?.name ?? "").trim();
          if (!name) return badRequest("name is required");
          const description = String(parsed.value?.description ?? "").trim();
          const status = String(parsed.value?.status ?? "active").trim().toLowerCase() || "active";
          const id = uuid();
          const now = new Date().toISOString();
          await env.VIVI_D1
            .prepare(`INSERT INTO rbac_security_groups (id, tenant_id, name, description, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`)
            .bind(id, tenantId, name, description || null, status, now)
            .run();

          const roleIds = Array.isArray(parsed.value?.roleIds) ? parsed.value.roleIds : [];
          for (const roleId of roleIds) {
            const rid = normalizeId(roleId);
            if (!rid) continue;
            await env.VIVI_D1.prepare(`INSERT OR REPLACE INTO rbac_group_roles (tenant_id, group_id, role_id) VALUES (?1, ?2, ?3)`).bind(tenantId, id, rid).run();
          }
          const userIds = Array.isArray(parsed.value?.userIds) ? parsed.value.userIds : [];
          for (const userId of userIds) {
            const uid = normalizeId(userId);
            if (!uid) continue;
            await env.VIVI_D1.prepare(`INSERT OR REPLACE INTO rbac_user_groups (tenant_id, user_id, group_id) VALUES (?1, ?2, ?3)`).bind(tenantId, uid, id).run();
          }
          return json({ stored: true, id, tenantId });
        }

        if (request.method === "PUT") {
          const access = await requireRbacPermission(request, env, tenantId, "/Control/user-admin/security-groups", "edit");
          if (access) return access;
          const parsed = await readJsonBody<{ id?: string; name?: string; description?: string; status?: string; roleIds?: string[]; userIds?: string[] }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const id = normalizeId(parsed.value?.id);
          if (!id) return badRequest("id is required");
          const name = String(parsed.value?.name ?? "").trim();
          const description = String(parsed.value?.description ?? "").trim();
          const status = String(parsed.value?.status ?? "active").trim().toLowerCase() || "active";
          const now = new Date().toISOString();
          await env.VIVI_D1
            .prepare(`UPDATE rbac_security_groups SET name = COALESCE(NULLIF(?3, ''), name), description = ?4, status = COALESCE(NULLIF(?5, ''), status), updated_at = ?6 WHERE tenant_id = ?2 AND id = ?1`)
            .bind(id, tenantId, name, description || null, status, now)
            .run();

          await env.VIVI_D1.prepare(`DELETE FROM rbac_group_roles WHERE tenant_id = ?1 AND group_id = ?2`).bind(tenantId, id).run();
          await env.VIVI_D1.prepare(`DELETE FROM rbac_user_groups WHERE tenant_id = ?1 AND group_id = ?2`).bind(tenantId, id).run();
          const roleIds = Array.isArray(parsed.value?.roleIds) ? parsed.value.roleIds : [];
          for (const roleId of roleIds) {
            const rid = normalizeId(roleId);
            if (!rid) continue;
            await env.VIVI_D1.prepare(`INSERT OR REPLACE INTO rbac_group_roles (tenant_id, group_id, role_id) VALUES (?1, ?2, ?3)`).bind(tenantId, id, rid).run();
          }
          const userIds = Array.isArray(parsed.value?.userIds) ? parsed.value.userIds : [];
          for (const userId of userIds) {
            const uid = normalizeId(userId);
            if (!uid) continue;
            await env.VIVI_D1.prepare(`INSERT OR REPLACE INTO rbac_user_groups (tenant_id, user_id, group_id) VALUES (?1, ?2, ?3)`).bind(tenantId, uid, id).run();
          }
          return json({ stored: true, id, tenantId });
        }

        return badRequest("Unsupported method.", 405);
      }

      case "/rbac/assignments": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        await ensureRbacSchema(env);
        const actor = await readRbacActorContext(request, env, tenantId);
        if (!actor) return unauthorized();

        if (request.method === "GET") {
          const access = await requireRbacPermission(request, env, tenantId, "/Control/user-admin/users", "view");
          if (access) return access;
          const userId = normalizeId(url.searchParams.get("userId"));
          if (!userId) return badRequest("userId is required");
          if (!(await canActorSeeUserInTenant(env, tenantId, actor, userId))) return unauthorized();
          const roles = await env.VIVI_D1.prepare(`SELECT role_id AS roleId FROM rbac_user_roles WHERE tenant_id = ?1 AND user_id = ?2`).bind(tenantId, userId).all();
          const groups = await env.VIVI_D1.prepare(`SELECT group_id AS groupId FROM rbac_user_groups WHERE tenant_id = ?1 AND user_id = ?2`).bind(tenantId, userId).all();
          const tenantRow = await env.VIVI_D1.prepare(`SELECT tenant_id AS tenantId FROM rbac_user_tenants WHERE tenant_id = ?1 AND user_id = ?2`).bind(tenantId, userId).first();
          return json({
            tenantId,
            userId,
            tenantAccess: Boolean(tenantRow),
            roleIds: (roles.results ?? []).map((r: any) => r.roleId),
            groupIds: (groups.results ?? []).map((r: any) => r.groupId)
          });
        }

        if (request.method === "PUT") {
          const access = await requireRbacPermission(request, env, tenantId, "/Control/user-admin/users", "edit");
          if (access) return access;
          const parsed = await readJsonBody<{ userId?: string; roleIds?: string[]; groupIds?: string[]; tenantAccess?: boolean }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const userId = normalizeId(parsed.value?.userId);
          if (!userId) return badRequest("userId is required");
          if (!(await canActorSeeUserInTenant(env, tenantId, actor, userId))) return unauthorized();
          const visibleRoleIds = await readVisibleRoleIdsForActor(env, tenantId, actor);
          const canManageMultiTenantAssignments = isActorAdminScope(actor) || actor.isOwnSupport || actor.isDealerSupport;

          const tenantAccess = parsed.value?.tenantAccess;
          if (tenantAccess === false) {
            await env.VIVI_D1.prepare(`DELETE FROM rbac_user_roles WHERE tenant_id = ?1 AND user_id = ?2`).bind(tenantId, userId).run();
            await env.VIVI_D1.prepare(`DELETE FROM rbac_user_groups WHERE tenant_id = ?1 AND user_id = ?2`).bind(tenantId, userId).run();
            await env.VIVI_D1.prepare(`DELETE FROM rbac_user_tenants WHERE tenant_id = ?1 AND user_id = ?2`).bind(tenantId, userId).run();
            return json({ stored: true, tenantId, userId, tenantAccess: false });
          }

          // Ensure tenant access is granted when assignments are updated.
          const now = new Date().toISOString();
          const existingTenantIds = await readAllowedTenantIdsForUser(env, userId);
          const targetTenantIds = canManageMultiTenantAssignments && existingTenantIds.length ? existingTenantIds : [tenantId];
          for (const targetTenantId of targetTenantIds) {
            if (targetTenantId !== tenantId && !actor.isAdmin && !actor.isTenantAdmin && !actor.allowedTenants.includes(targetTenantId)) {
              return unauthorized();
            }
            await env.VIVI_D1
              .prepare(`INSERT OR IGNORE INTO rbac_user_tenants (tenant_id, user_id, created_at) VALUES (?1, ?2, ?3)`)
              .bind(targetTenantId, userId, now)
              .run();
          }

          for (const targetTenantId of targetTenantIds) {
            await env.VIVI_D1.prepare(`DELETE FROM rbac_user_roles WHERE tenant_id = ?1 AND user_id = ?2`).bind(targetTenantId, userId).run();
            await env.VIVI_D1.prepare(`DELETE FROM rbac_user_groups WHERE tenant_id = ?1 AND user_id = ?2`).bind(targetTenantId, userId).run();
          }

          const roleIds = Array.isArray(parsed.value?.roleIds) ? parsed.value.roleIds : [];
          for (const roleId of roleIds) {
            const rid = normalizeId(roleId);
            if (!rid) continue;
            if (!visibleRoleIds.includes(rid)) return unauthorized();
            const role = await env.VIVI_D1
              .prepare(`SELECT name FROM rbac_roles WHERE tenant_id = ?1 AND id = ?2 LIMIT 1`)
              .bind(tenantId, rid)
              .first<{ name: string }>();
            const roleName = normalizeId(role?.name);
            const roleAssignments = canManageMultiTenantAssignments
              ? await resolveRoleAssignmentsForTenants(env, targetTenantIds, rid, roleName)
              : [{ tenantId, roleId: rid, roleName }];
            for (const roleAssignment of roleAssignments) {
              const actorForTenant =
                roleAssignment.tenantId === tenantId
                  ? actor
                  : await readRbacActorContext(request, env, roleAssignment.tenantId);
              if (!actorForTenant) return unauthorized();
              const targetVisibleRoleIds = await readVisibleRoleIdsForActor(env, roleAssignment.tenantId, actorForTenant);
              if (!targetVisibleRoleIds.includes(roleAssignment.roleId)) return unauthorized();
              await env.VIVI_D1
                .prepare(`INSERT OR REPLACE INTO rbac_user_roles (tenant_id, user_id, role_id) VALUES (?1, ?2, ?3)`)
                .bind(roleAssignment.tenantId, userId, roleAssignment.roleId)
                .run();
            }
          }
          const groupIds = Array.isArray(parsed.value?.groupIds) ? parsed.value.groupIds : [];
          for (const groupId of groupIds) {
            const gid = normalizeId(groupId);
            if (!gid) continue;
            await env.VIVI_D1.prepare(`INSERT OR REPLACE INTO rbac_user_groups (tenant_id, user_id, group_id) VALUES (?1, ?2, ?3)`).bind(tenantId, userId, gid).run();
          }
          return json({ stored: true, tenantId, userId, tenantAccess: true });
        }

        return badRequest("Unsupported method.", 405);
      }
      case "/auth/forgot-password":
      case "/auth/forgot_password": {
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        {
          const parsed = await readJsonBody<{ email?: string }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const email = String(parsed.value?.email ?? "").trim().toLowerCase();
          if (!email) return badRequest("email is required");

          const adminEmail = await getAdminEmail(env);
          const rbacUser =
            adminEmail && email === adminEmail ? null : await findRbacUserByEmail(env, email);
          const tenantId = getTenantId(request, url);
          const now = new Date().toISOString();
          const payload = {
            type: "forgot-password",
            email,
            tenantId,
            at: now,
            ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "",
            userAgent: request.headers.get("user-agent") ?? ""
          };
          const key = `auth:forgot:${Date.now()}:${uuid()}`;
          await kvPutSafe(env, key, JSON.stringify(payload), 60 * 60 * 24 * 14);

          let resetToken = "";
          if (adminEmail && email === adminEmail) {
            resetToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
            const stored = await storeAuthResetToken(env, {
              token: resetToken,
              kind: "admin",
              email,
              tenantId,
              payload: { email, tenantId, createdAt: now },
              ttlSeconds: RESET_TOKEN_TTL_SECONDS
            });
            if (!stored) resetToken = "";
          } else if (rbacUser?.id) {
            resetToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
            const stored = await storeAuthResetToken(env, {
              token: resetToken,
              kind: "rbac",
              email,
              userId: rbacUser.id,
              tenantId,
              payload: { userId: rbacUser.id, email, tenantId, createdAt: now },
              ttlSeconds: RESET_TOKEN_TTL_SECONDS
            });
            if (!stored) resetToken = "";
          }

          const fromEmail = String(env.MAIL_FROM ?? "").trim();
          const fromName = String(env.MAIL_FROM_NAME ?? env.APP_NAME ?? "").trim();
          const resendKey = String(env.RESEND_API_KEY ?? "").trim();
          const resetEmailRequestId = createEmailRequestId();
          let emailSent = false;
          let emailProviderAttempted: "resend" | "mailchannels" | "none" = "none";
          let emailProvider: "resend" | "mailchannels" | "none" = "none";

          const originFromHeader = String(request.headers.get("origin") ?? "").trim();
          const base =
            String(env.APP_BASE_URL ?? "").trim() ||
            originFromHeader ||
            "https://us.vivitelematics.ca";
          const resetUrl =
            resetToken && base
              ? `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(resetToken)}`
              : "";

          if (fromEmail && resetUrl) {
            const subject = `Password reset request [${resetEmailRequestId}]`;
            const text =
              `We received a request to reset the password for ${email}.\n\n` +
              `Reset your password:\n${resetUrl}\n\n` +
              `Reference: ${resetEmailRequestId}\n\n` +
              `If you did not request this, you can ignore this message.\n\n` +
              `This link expires in 30 minutes.\n`;

            if (resendKey) {
              emailProviderAttempted = "resend";
              try {
                await sendResendEmail({
                  apiKey: resendKey,
                  to: email,
                  from: fromEmail,
                  fromName: fromName || undefined,
                  subject,
                  text
                });
                emailProvider = "resend";
                emailSent = true;
              } catch {
                // fall through to MailChannels
              }
            }

            if (!emailSent) {
              emailProviderAttempted = "mailchannels";
              try {
                await sendMailchannelsEmail({
                  to: email,
                  from: fromEmail,
                  fromName: fromName || undefined,
                  subject,
                  text
                });
                emailProvider = "mailchannels";
                emailSent = true;
              } catch {
                // ignore send failures; response remains generic
              }
            }

            const supportTo = String(env.SUPPORT_EMAIL ?? "").trim();
            if (supportTo && resendKey) {
              try {
                await sendResendEmail({
                  apiKey: resendKey,
                  to: supportTo,
                  from: fromEmail,
                  fromName: fromName || undefined,
                  subject: `Password reset requested: ${email} [${resetEmailRequestId}]`,
                  text: `A password reset was requested.\n\nReference: ${resetEmailRequestId}\nEmail: ${email}\nTenant: ${tenantId || "(none)"}\nAt: ${now}\nIP: ${payload.ip}\nUA: ${payload.userAgent}`
                });
              } catch {
                // ignore
              }
            }
          }

          return json({
            ok: true,
            resetEmailRequestId,
            emailSent,
            emailProviderAttempted,
            emailProvider,
            message: "If an account exists for this email, reset instructions will be sent."
          });
        }
      }
      case "/auth/reset-password":
      case "/auth/reset_password": {
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        {
          const parsed = await readJsonBody<{ token?: string; password?: string }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const token = String(parsed.value?.token ?? "").trim();
          const newPassword = String(parsed.value?.password ?? "");
          if (!token || !newPassword) return badRequest("token and password are required");
          if (newPassword.length < 8) return badRequest("Password must be at least 8 characters.");

          const resetRecord = await readAuthResetToken(env, token);
          if (!resetRecord) {
            return badRequest("Reset link is invalid or expired.");
          }

          // RBAC invite and user reset flows both set a user password and create a session.
          if (resetRecord.kind === "rbac" || resetRecord.kind === "invite") {
            let userId = "";
            try {
              const parsedUserToken = JSON.parse(resetRecord.payload) as { userId?: string };
              userId = String(parsedUserToken?.userId ?? "").trim();
            } catch {
              userId = "";
            }
            if (!userId) return badRequest("Reset link is invalid or expired.");

            await ensureRbacSchema(env);
            const existing = await env.VIVI_D1.prepare(`SELECT id FROM rbac_users WHERE id = ?1`).bind(userId).first();
            if (!existing) return badRequest("Reset link is invalid or expired.");

            const formatted = await hashPassword(newPassword);
            const now = new Date().toISOString();
            await env.VIVI_D1
              .prepare(
                `UPDATE rbac_users SET password_hash = ?2, status = 'active', updated_at = ?3 WHERE id = ?1`
              )
              .bind(userId, formatted, now)
              .run();
            await deleteAuthResetToken(env, token, resetRecord.kind);

            const sessionToken = await createUserSession(env, userId);
            return json({
              ok: true,
              token: sessionToken,
              userId,
              invited: resetRecord.kind === "invite"
            });
          }

          const adminEmail = await getAdminEmail(env);
          if (!adminEmail) return serviceUnavailable({ error: "Admin login is not configured." });

          let email = "";
          try {
            const parsedAdmin = JSON.parse(resetRecord.payload || "{}") as { email?: string };
            email = String(parsedAdmin?.email ?? "").trim().toLowerCase();
          } catch {
            email = "";
          }
          if (!email || email !== adminEmail) return unauthorized();

          const formatted = await hashPassword(newPassword);
          try {
            await setAdminPasswordHash(env, formatted, email);
          } catch {
            return serviceUnavailable({
              error: "Unable to store the new password right now. Please try again shortly."
            });
          }
          await deleteAuthResetToken(env, token, "admin");

          const sessionToken = await createAdminSession(env);
          return json({ ok: true, token: sessionToken });
        }
      }
      case "/auth/admin/bootstrap": {
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        if (!isBootstrapEnabled(env)) return unauthorized();
        // Requires x-api-key (env.API_KEY or a valid admin session token).
        const auth = await requireApiKey(request, env);
        if (auth) return auth;

        const parsed = await readJsonBody<{ email?: string; password?: string }>(request);
        if (!parsed.ok) return badRequest(parsed.error);
        const email = String(parsed.value?.email ?? "").trim().toLowerCase();
        const password = String(parsed.value?.password ?? "");
        if (!email || !password) return badRequest("email and password are required");
        if (password.length < 8) return badRequest("Password must be at least 8 characters.");

        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash = await pbkdf2HashPassword(password, salt, PBKDF2_ITERATIONS);
        const formatted = formatPasswordHash(PBKDF2_ITERATIONS, salt, hash);

        try {
          await setAdminPasswordHash(env, formatted, email);
        } catch {
          return serviceUnavailable({ error: "Unable to store admin credentials right now." });
        }

        const sessionToken = await createAdminSession(env);
        return json({ ok: true, token: sessionToken, email });
      }
      case "/health/resources": {
        const [kv, d1, bindings, storage, queue] = await Promise.all([
          checkKv(env),
          checkD1(env),
          checkBindingsTable(env),
          checkStorage(env),
          checkQueue(env)
        ]);
        const hasError = [kv, d1, bindings, storage, queue].some((item) => item.status === "error");
        const payload = {
          status: hasError ? "degraded" : "ok",
          timestamp: new Date().toISOString(),
          kv,
          storage,
          d1,
          bindings,
          queue
        };
        return hasError ? serviceUnavailable(payload) : json(payload);
      }
      case "/telemetry/summary":
        return json({
          vehiclesOnline: 0,
          averageSpeedKph: 0,
          alertsToday: 0,
          fuelBurnRateLph: 0
        });
      case "/api/reverse-geocode": {
        const lat = Number(String(url.searchParams.get("lat") ?? "").trim());
        const lon = Number(String(url.searchParams.get("lon") ?? "").trim());
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return badRequest("lat and lon query params are required");
        }

        return withEdgeCache(request, 60 * 60 * 24, async () => {
          const name = await resolveLocationName(env, lat, lon);
          if (name) {
            return json({ display_name: name, cached: true });
          }

          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
            const upstream = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`,
              {
                headers: {
                  Accept: "application/json",
                  "User-Agent": "ViviTelematics/1.0 (support@vivitelematics.ca)"
                },
                signal: controller.signal
              }
            );
            clearTimeout(timeout);
            if (!upstream.ok) return json({ error: "Reverse geocode lookup failed" }, { status: upstream.status || 502 });
            const data = await upstream.json();
            return json(data);
          } catch {
            return json({ error: "Reverse geocode lookup failed" }, { status: 502 });
          }
        });
      }
      case "/api/map-route": {
        const fromLat = Number(String(url.searchParams.get("fromLat") ?? "").trim());
        const fromLng = Number(String(url.searchParams.get("fromLng") ?? "").trim());
        const toLat = Number(String(url.searchParams.get("toLat") ?? "").trim());
        const toLng = Number(String(url.searchParams.get("toLng") ?? "").trim());
        if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
          return badRequest("fromLat, fromLng, toLat, and toLng query params are required");
        }

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 25_000);
          const routePath = `${encodeURIComponent(String(fromLng))},${encodeURIComponent(String(fromLat))};${encodeURIComponent(String(toLng))},${encodeURIComponent(String(toLat))}`;
          const upstream = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${routePath}?overview=full&geometries=geojson&steps=false`,
            {
              headers: { Accept: "application/json" },
              signal: controller.signal
            }
          );
          clearTimeout(timeout);
          if (!upstream.ok) return json({ error: "Road route lookup failed" }, { status: upstream.status || 502 });
          const data = await upstream.json();
          if (String((data as any)?.code ?? "") !== "Ok") {
            return json({ error: "Road route lookup failed", details: data }, { status: 404 });
          }
          return json(data);
        } catch {
          return json({ error: "Road route lookup failed" }, { status: 502 });
        }
      }
      case "/api/traccar/status": {
        const base = String(env.TRACCAR_BASE_URL ?? "")
          .trim()
          .replace(/\/$/, "")
          .replace(/\/api$/i, "");
        // Unauthenticated: network reachability only (Traccar /api/server is public).
        let reachable = false;
        let reachError = "";
        if (base) {
          try {
            const baseUrl = new URL(base.includes("://") ? base : `http://${base}`);
            const hostIsIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(baseUrl.hostname);
            const requestUrl = hostIsIp
              ? `${baseUrl.protocol}//traccar.vivi.internal/api/server`
              : `${baseUrl.origin}/api/server`;
            const init: RequestInit & { cf?: Record<string, unknown> } = {
              method: "GET",
              headers: {
                Accept: "application/json",
                ...(hostIsIp ? { Host: baseUrl.hostname } : {})
              },
              signal: AbortSignal.timeout(8_000)
            };
            if (hostIsIp) init.cf = { resolveOverride: baseUrl.hostname };
            const resp = await fetch(requestUrl, init);
            reachable = resp.ok;
            if (!resp.ok) reachError = `HTTP ${resp.status}`;
          } catch (err: any) {
            reachError = String(err?.message ?? err).slice(0, 200);
          }
        } else {
          reachError = "TRACCAR_BASE_URL not set";
        }

        const auth = await requireApiKey(request, env);
        // Even without a client session, probe device auth using Worker secrets so we can
        // diagnose Traccar credentials after DNS is in place (no device payloads returned).
        const hasToken = Boolean(String(env.TRACCAR_TOKEN ?? "").trim());
        const hasUser = Boolean(String(env.TRACCAR_USERNAME ?? "").trim());
        const hasPass = Boolean(String(env.TRACCAR_PASSWORD ?? "").trim());
        const serverResp = await traccarFetch(env, "/api/server");
        const devicesResp = await traccarFetch(env, "/api/devices?all=true");
        const deviceCount = Array.isArray(devicesResp.body) ? devicesResp.body.length : null;

        if (auth) {
          return json({
            ok: false,
            base,
            reachable,
            reachError: reachError || undefined,
            authRequired: true,
            authConfigured: hasToken || (hasUser && hasPass),
            hasToken,
            hasUser,
            hasPass,
            server: { ok: serverResp.ok, status: serverResp.status },
            devices: {
              ok: devicesResp.ok,
              status: devicesResp.status,
              count: deviceCount,
              error: devicesResp.ok
                ? undefined
                : String(
                    (devicesResp.body as any)?.error ??
                      (devicesResp.body as any)?.message ??
                      devicesResp.body ??
                      ""
                  ).slice(0, 300)
            }
          });
        }

        return json({
          ok: serverResp.ok && devicesResp.ok,
          base,
          reachable,
          reachError: reachError || undefined,
          authConfigured: hasToken || (hasUser && hasPass),
          hasToken,
          hasUser,
          hasPass,
          server: { ok: serverResp.ok, status: serverResp.status },
          devices: {
            ok: devicesResp.ok,
            status: devicesResp.status,
            count: deviceCount,
            error:
              devicesResp.ok
                ? undefined
                : String((devicesResp.body as any)?.error ?? (devicesResp.body as any)?.message ?? devicesResp.body ?? "").slice(0, 300)
          }
        });
      }
      case "/api/traccar/live":
      case "/api/traccar/proxy/live": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        // Pushed feed first (Traccar socket / forwarding): no Traccar API calls per request.
        const bridged = (await fetchTraccarLiveFromBridge(env)) as (TraccarLivePayload & { feedFresh?: boolean }) | null;
        if (bridged?.feedFresh && Array.isArray(bridged.live) && bridged.live.length) {
          const { feedFresh: _fresh, ...payload } = bridged;
          return json(payload);
        }
        try {
          const [devicesResp, positionsResp] = await Promise.all([
            traccarFetch(env, "/api/devices?all=true"),
            traccarFetch(env, "/api/positions")
          ]);

          // Soft-fail: Home/Live Tracking should still render assets when Traccar is down.
          if (!devicesResp.ok) {
            return json({
              ok: true,
              degraded: true,
              at: new Date().toISOString(),
              count: 0,
              live: [],
              error: "Failed to fetch Traccar devices",
              details: devicesResp.body,
              upstreamStatus: devicesResp.status
            });
          }
          if (!positionsResp.ok) {
            const devices = Array.isArray(devicesResp.body) ? devicesResp.body : [];
            const live = devices.map((device: any) => ({
              deviceId: (device as any)?.id,
              imei: (device as any)?.uniqueId,
              name: (device as any)?.name,
              status: (device as any)?.status,
              lastUpdate: (device as any)?.lastUpdate,
              position: null
            }));
            return json({
              ok: true,
              degraded: true,
              at: new Date().toISOString(),
              count: live.length,
              live,
              error: "Failed to fetch Traccar positions",
              details: positionsResp.body,
              upstreamStatus: positionsResp.status
            });
          }

          const devices = Array.isArray(devicesResp.body) ? devicesResp.body : [];
          const positions = Array.isArray(positionsResp.body) ? positionsResp.body : [];
          return json(buildTraccarLivePayload(devices, positions, { source: "http" }));
        } catch (err: any) {
          return json({
            ok: true,
            degraded: true,
            at: new Date().toISOString(),
            count: 0,
            live: [],
            error: String(err?.message ?? err)
          });
        }
      }
      case "/api/traccar/proxy": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;

        const softFailTraccarWrite = (traccarPath: string, method: string, details?: unknown, upstreamStatus = 502) =>
          json(
            {
              ok: false,
              softFailed: true,
              upstreamStatus,
              error: "Traccar upstream unavailable",
              details: details ?? null,
              path: traccarPath,
              method
            },
            { status: 200 }
          );

        try {
          const method = String(request.method ?? "GET").toUpperCase();
          const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
          if (!allowedMethods.has(method)) return badRequest("Unsupported method for /api/traccar/proxy", 405);

          let proxyPath = String(url.searchParams.get("path") ?? "").trim();
          if (!proxyPath && url.pathname.startsWith("/api/traccar/proxy/")) {
            proxyPath = `/${url.pathname.slice("/api/traccar/proxy/".length)}`;
          }

          if (!proxyPath) return badRequest("path query param is required (e.g. /devices or /notifications)");
          if (/^https?:\/\//i.test(proxyPath)) return badRequest("Absolute URLs are not allowed");
          if (!proxyPath.startsWith("/")) proxyPath = `/${proxyPath}`;

          const traccarPath = proxyPath.startsWith("/api/") ? proxyPath : `/api${proxyPath}`;
          // Permissions, notifications, and computed attributes are non-blocking for library/compile UX.
          // Must match /notifications/{id} and /permissions (not only collection roots).
          const isSoftWritePath =
            /\/permissions(?:\/|\?|$)/.test(traccarPath) ||
            /\/notifications(?:\/|\?|$)/.test(traccarPath) ||
            /\/attributes\/computed(?:\/|\?|$)/.test(traccarPath);

          const forwardHeaders: Record<string, string> = {};
          const contentType = String(request.headers.get("content-type") ?? "").trim();
          if (contentType) forwardHeaders["Content-Type"] = contentType;

          const init: RequestInit = {
            method,
            headers: forwardHeaders
          };

          if (method !== "GET") {
            const rawBody = await request.text();
            const sanitized = sanitizeTraccarComputedAttributeRequestBody(traccarPath, method, rawBody || undefined);
            if (sanitized) init.body = sanitized;
          }

          // Optional server-side thinning + short cache for heavy route downloads (fuel graphs).
          let routeThinMax = 0;
          let routeCacheKey = "";
          let upstreamPath = traccarPath;
          if (method === "GET" && /\/reports\/route(?:\?|$)/.test(traccarPath) && /[?&]viviThin=/.test(traccarPath)) {
            const [pathOnly, qs = ""] = traccarPath.split("?");
            const params = new URLSearchParams(qs);
            routeThinMax = Math.max(0, Math.min(10_000, Math.floor(Number(params.get("viviThin")) || 0)));
            params.delete("viviThin");
            upstreamPath = `${pathOnly}?${params.toString()}`;
            routeCacheKey = `${upstreamPath}|${routeThinMax}`;
            const hit = traccarRouteCache.get(routeCacheKey);
            if (hit && Date.now() - hit.at < 60_000) return json(hit.body, { status: 200 });
          }

          const resp = await traccarFetch(env, upstreamPath, init);
          if (routeThinMax > 0 && resp.ok && Array.isArray(resp.body)) {
            const thinned = thinRoutePointsServer(resp.body as any[], routeThinMax);
            if (thinned.length > 0) {
              if (traccarRouteCache.size > 40) traccarRouteCache.delete(traccarRouteCache.keys().next().value as string);
              traccarRouteCache.set(routeCacheKey, { at: Date.now(), body: thinned });
            }
            return json(thinned, { status: 200 });
          }
          if (!resp.ok && method === "GET") {
            // Soft-fail read proxies with Traccar-shaped empty payloads so clients keep working.
            // Unique-ID device lookups must not look like "device missing" — compile treats [] as not found.
            const isUniqueDeviceLookup = /\/devices(?:\?|$)/.test(traccarPath) && /[?&]uniqueId=/.test(traccarPath);
            const emptyBody = isUniqueDeviceLookup
              ? {
                  softFailed: true,
                  devices: [],
                  error: "Traccar upstream unavailable",
                  details: resp.body,
                  upstreamStatus: resp.status
                }
              : /\/devices(?:\?|$)/.test(traccarPath) || /\/positions(?:\?|$)/.test(traccarPath)
                ? []
                : /\/reports\//.test(traccarPath)
                  ? []
                  : { error: "Traccar upstream unavailable", details: resp.body, upstreamStatus: resp.status };
            return json(emptyBody, { status: 200 });
          }
          // Permission writes often 400 when the link already exists. Return 200 so the
          // browser does not log a failed resource, and keep the upstream message for callers.
          const isPermissionWrite = /\/permissions(?:\/|\?|$)/.test(traccarPath);
          if (!resp.ok && method !== "GET" && isPermissionWrite && resp.status >= 400 && resp.status < 500) {
            const details = resp.body;
            const message = typeof details === "string"
              ? details
              : String((details as any)?.message ?? (details as any)?.error ?? (details as any)?.details ?? "");
            return json(
              {
                ok: false,
                softFailed: true,
                upstreamStatus: resp.status,
                error: message || "Traccar permission was not applied",
                details,
                path: traccarPath,
                method
              },
              { status: 200 }
            );
          }
          // Soft-fail only transport/5xx on write paths. Preserve 4xx so callers can detect
          // "already exists" / schema mismatches instead of opaque "upstream unavailable".
          if (!resp.ok && method !== "GET" && isSoftWritePath && resp.status >= 500) {
            return softFailTraccarWrite(traccarPath, method, resp.body, resp.status);
          }
          // Never forward raw upstream 5xx as Worker 500 — keep 4xx (except auth) and map 5xx → 502.
          // Traccar permission POST often returns 204 No Content; Workers forbid a JSON body on 204,
          // which previously crashed into a soft-failed 502 and marked compile as Configurations Failed.
          let status = resp.ok ? resp.status || 200 : sanitizeUpstreamAuthStatus(resp.status);
          if (!resp.ok && status >= 500) status = 502;
          if (resp.ok && (status === 204 || status === 205 || status === 304 || resp.body == null || resp.body === "")) {
            return json({ ok: true }, { status: 200 });
          }
          return json(resp.body, { status });
        } catch (err: any) {
          const proxyPath = String(url.searchParams.get("path") ?? "").trim();
          const traccarPath = proxyPath
            ? proxyPath.startsWith("/api/")
              ? proxyPath
              : `/api${proxyPath.startsWith("/") ? proxyPath : `/${proxyPath}`}`
            : "/api/permissions";
          const method = String(request.method ?? "GET").toUpperCase();
          if (method === "GET") {
            const isUniqueDeviceLookup = /\/devices(?:\?|$)/.test(traccarPath) && /[?&]uniqueId=/.test(traccarPath);
            const emptyBody = isUniqueDeviceLookup
              ? {
                  softFailed: true,
                  devices: [],
                  error: "Traccar proxy failed",
                  message: String(err?.message ?? err ?? ""),
                  path: traccarPath
                }
              : /\/devices(?:\?|$)/.test(traccarPath) ||
                  /\/positions(?:\?|$)/.test(traccarPath) ||
                  /\/reports\//.test(traccarPath)
                ? []
                : {
                    error: "Traccar proxy failed",
                    message: String(err?.message ?? err ?? ""),
                    path: traccarPath
                  };
            return json(emptyBody, { status: 200 });
          }
          if (
            /\/permissions(?:\/|\?|$)/.test(traccarPath) ||
            /\/notifications(?:\/|\?|$)/.test(traccarPath) ||
            /\/attributes\/computed(?:\/|\?|$)/.test(traccarPath)
          ) {
            return softFailTraccarWrite(traccarPath, method, String(err?.message ?? err ?? "proxy error"));
          }
          return json(
            { error: "Traccar proxy failed", message: String(err?.message ?? err ?? "") },
            { status: 502 }
          );
        }
      }
      case "/telemetry/lookup": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = await resolveTenantId(request, url, env);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        {
          const access = await requireRbacPermission(request, env, tenantId, "/Track/fleet/assets", "view");
          if (access) return access;
        }
        const imei = url.searchParams.get("imei")?.trim() || "";
        if (!imei) return badRequest("imei query param is required.");
        try {
        let assets = await findAssetsByImei(env, tenantId, imei);
        let events = (await readEventsSince(env, tenantId, "")).filter((event) => {
          const eventImei = pickFirstString(
            (event as any)?.imei,
            (event as any)?.data?.imei,
            (event as any)?.data?.data?.imei,
            (event as any)?.raw?.imei
          );
          return eventImei === imei;
        });

        const latestEvent = (events as any[])[0] ?? null;
        const latestSnapshot = latestEvent
          ? getLatestTelemetrySnapshot(
              latestEvent,
              String((latestEvent as any)?.createdAt ?? (latestEvent as any)?.created_at ?? (latestEvent as any)?.at ?? "")
            )
          : null;
        let latest =
          latestSnapshot && typeof latestSnapshot.lat === "number" && typeof latestSnapshot.lng === "number"
            ? {
                at: latestSnapshot.at || undefined,
                lat: latestSnapshot.lat,
                lng: latestSnapshot.lng,
                locationName: latestSnapshot.locationName,
                ...(typeof latestSnapshot.speed === "number" ? { speed: latestSnapshot.speed } : {}),
                ...(typeof latestSnapshot.satellites === "number" ? { satellites: latestSnapshot.satellites } : {}),
                ...(typeof latestSnapshot.ignition === "boolean" ? { ignition: latestSnapshot.ignition } : {}),
                ...(typeof latestSnapshot.powerVoltage === "number" ? { powerVoltage: latestSnapshot.powerVoltage } : {}),
                ...(latestSnapshot.movement ? { movement: latestSnapshot.movement } : {})
              }
            : undefined;

        // If DB telemetry is missing or stale, fetch live latest from Traccar and persist it.
        const latestAgeHours = Number.isFinite(parseIsoMs((latest as any)?.at))
          ? (Date.now() - (parseIsoMs((latest as any)?.at) as number)) / (1000 * 60 * 60)
          : Number.POSITIVE_INFINITY;
        const refreshLiveRequested = ["1", "true", "yes"].includes(
          String(url.searchParams.get("refreshLive") ?? "")
            .trim()
            .toLowerCase()
        );
        const shouldRefreshFromTraccar = refreshLiveRequested && (!latest || latestAgeHours > (2 / 60));

        if (shouldRefreshFromTraccar) {
          try {
          const livePosition = await traccarResolveLatestPositionByImei(env, imei);
          const latLng = livePosition ? extractLatLng(livePosition as any) : null;
          if (livePosition && latLng) {
            const createdAt =
              String(
                (livePosition as any)?.deviceTime ??
                (livePosition as any)?.fixTime ??
                (livePosition as any)?.serverTime ??
                ""
              ).trim() || new Date().toISOString();

            const speedNum = normalizeNumber((livePosition as any)?.speed ?? (livePosition as any)?.attributes?.speed);
            const satellites = normalizeNumber(
              (livePosition as any)?.attributes?.[TraccarPositionAttr.SATELLITES] ??
                (livePosition as any)?.satellites ??
                (livePosition as any)?.attributes?.satellites ??
                (livePosition as any)?.attributes?.satelliteCount ??
                (livePosition as any)?.attributes?.["Number of Satellites"]
            );
            const ignition = pickFirstBoolean(
              (livePosition as any)?.attributes?.[TraccarPositionAttr.IGNITION],
              (livePosition as any)?.ignition,
              (livePosition as any)?.attributes?.ignition,
              (livePosition as any)?.attributes?.Ignition,
              (livePosition as any)?.attributes?.["Ignition"]
            );
            const movementRaw = String(
              (livePosition as any)?.movement ??
                (livePosition as any)?.attributes?.movement ??
                (livePosition as any)?.attributes?.moving ??
                ""
            )
              .trim()
              .toLowerCase();
            const movement = classifyMovementState({ speed: speedNum, satellites, ignition, movementRaw });

            const telemetryPayload: Record<string, unknown> = {
              id: normalizeId(imei) || `asset-${imei}`,
              imei,
              deviceId: normalizeId((livePosition as any)?.deviceId) || undefined,
              lat: latLng.lat,
              lng: latLng.lng,
              lon: latLng.lng,
              speed: speedNum ?? undefined,
              satellites: typeof satellites === "number" ? satellites : undefined,
              ignition: typeof ignition === "boolean" ? ignition : undefined,
              movement,
              course: (livePosition as any)?.course ?? undefined,
              altitude: (livePosition as any)?.altitude ?? undefined,
              accuracy: (livePosition as any)?.accuracy ?? undefined,
              attributes: (livePosition as any)?.attributes ?? undefined,
              raw: livePosition,
              lastSeen: createdAt,
              lastPosition: createdAt,
              ...(movement === "moving" || ignition === true ? { lastTrip: createdAt } : {})
            };

            const locationName = await resolveLocationName(env, latLng.lat, latLng.lng);
            if (locationName) {
              telemetryPayload.locationName = locationName;
              telemetryPayload.location = locationName;
              telemetryPayload.lastLocation = locationName;
            }

            const liveAssetId = normalizeId((assets[0] as any)?.id) || normalizeId(imei) || `asset-${imei}`;
            const eventId = uuid();
            events = [
              {
                id: eventId,
                type: "telemetry",
                assetId: liveAssetId,
                createdAt,
                data: telemetryPayload
              },
              ...events
            ];

            const liveMeta = extractTelemetryMeta(telemetryPayload as any);
            latest = {
              at: createdAt,
              lat: latLng.lat,
              lng: latLng.lng,
              locationName: pickFirstString(
                (telemetryPayload as any)?.locationName,
                (telemetryPayload as any)?.location,
                (telemetryPayload as any)?.lastLocation
              ) || undefined,
              ...(liveMeta as any)
            };
          }
          } catch {
            // Live Traccar refresh is best-effort; return D1 snapshot below.
          }
        }

        return json({ imei, tenantId, assets, events, ...(latest ? { latest } : {}) });
        } catch (err: any) {
          return json(
            {
              imei,
              tenantId,
              assets: [],
              events: [],
              softFailed: true,
              error: "Telemetry lookup failed",
              message: String(err?.message ?? err ?? "")
            },
            { status: 200 }
          );
        }
      }
      case "/telemetry/history": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        {
          const access = await requireRbacPermission(request, env, tenantId, "/Track/fleet/assets", "view");
          if (access) return access;
        }

        const imei = String(url.searchParams.get("imei") ?? "").trim();
        const assetId = String(url.searchParams.get("assetId") ?? "").trim();
        const from = String(url.searchParams.get("from") ?? "").trim();
        const to = String(url.searchParams.get("to") ?? "").trim();
        const includeArchive = String(url.searchParams.get("includeArchive") ?? "false").trim().toLowerCase() === "true";
        const includeArchivePayload =
          String(url.searchParams.get("includeArchivePayload") ?? "false").trim().toLowerCase() === "true";
        const limitRaw = Number(url.searchParams.get("limit") ?? 500);
        const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 500, 5000));

        const clauses: string[] = ["tenant_id = ?"]; 
        const params: any[] = [tenantId];
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

        const rows = await env.VIVI_D1.prepare(
          `SELECT id, asset_id, imei, created_at, data FROM telemetry_events WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`
        )
          .bind(...params)
          .all();

        const events = (rows.results ?? []).map((row: any) => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(String(row?.data ?? ""));
          } catch {
            parsed = null;
          }
          return {
            id: String(row?.id ?? ""),
            assetId: String(row?.asset_id ?? ""),
            imei: String(row?.imei ?? ""),
            createdAt: String(row?.created_at ?? ""),
            data: parsed
          };
        });

        // Mirror lookup fallback: if history is empty for an IMEI, pull latest live
        // position from Traccar and persist it so subsequent reads are consistent.
        if (events.length === 0 && imei) {
          const livePosition = await traccarResolveLatestPositionByImei(env, imei);
          const latLng = livePosition ? extractLatLng(livePosition as any) : null;
          if (livePosition && latLng) {
            const createdAt =
              String(
                (livePosition as any)?.deviceTime ??
                (livePosition as any)?.fixTime ??
                (livePosition as any)?.serverTime ??
                ""
              ).trim() || new Date().toISOString();

            const speedNum = normalizeNumber((livePosition as any)?.speed ?? (livePosition as any)?.attributes?.speed);
            const satellites = normalizeNumber(
              (livePosition as any)?.attributes?.[TraccarPositionAttr.SATELLITES] ??
                (livePosition as any)?.satellites ??
                (livePosition as any)?.attributes?.satellites ??
                (livePosition as any)?.attributes?.satelliteCount ??
                (livePosition as any)?.attributes?.["Number of Satellites"]
            );
            const ignition = pickFirstBoolean(
              (livePosition as any)?.attributes?.[TraccarPositionAttr.IGNITION],
              (livePosition as any)?.ignition,
              (livePosition as any)?.attributes?.ignition,
              (livePosition as any)?.attributes?.Ignition,
              (livePosition as any)?.attributes?.["Ignition"]
            );
            const movementRaw = String(
              (livePosition as any)?.movement ??
                (livePosition as any)?.attributes?.movement ??
                (livePosition as any)?.attributes?.moving ??
                ""
            )
              .trim()
              .toLowerCase();
            const movement = classifyMovementState({ speed: speedNum, satellites, ignition, movementRaw });

            const telemetryPayload: Record<string, unknown> = {
              id: normalizeId(imei) || `asset-${imei}`,
              imei,
              deviceId: normalizeId((livePosition as any)?.deviceId) || undefined,
              lat: latLng.lat,
              lng: latLng.lng,
              lon: latLng.lng,
              speed: speedNum ?? undefined,
              satellites: typeof satellites === "number" ? satellites : undefined,
              ignition: typeof ignition === "boolean" ? ignition : undefined,
              movement,
              course: (livePosition as any)?.course ?? undefined,
              altitude: (livePosition as any)?.altitude ?? undefined,
              accuracy: (livePosition as any)?.accuracy ?? undefined,
              attributes: (livePosition as any)?.attributes ?? undefined,
              raw: livePosition,
              lastSeen: createdAt,
              lastPosition: createdAt,
              ...(movement === "moving" || ignition === true ? { lastTrip: createdAt } : {})
            };

            const locationName = await resolveLocationName(env, latLng.lat, latLng.lng);
            if (locationName) {
              telemetryPayload.locationName = locationName;
              telemetryPayload.location = locationName;
              telemetryPayload.lastLocation = locationName;
            }

            const liveAssetId = normalizeId(assetId) || normalizeId(imei) || `asset-${imei}`;
            const eventId = uuid();
            events.unshift({
              id: eventId,
              assetId: liveAssetId,
              imei,
              createdAt,
              data: telemetryPayload
            });
          }
        }

        let archives: any[] = [];
        if (includeArchive) {
          try {
            const archiveClauses: string[] = ["tenant_id = ?"];
            const archiveParams: any[] = [tenantId];
            if (imei) {
              archiveClauses.push("imei = ?");
              archiveParams.push(imei);
            }
            if (assetId) {
              archiveClauses.push("asset_id = ?");
              archiveParams.push(assetId);
            }
            if (from) {
              archiveClauses.push("created_at >= ?");
              archiveParams.push(from);
            }
            if (to) {
              archiveClauses.push("created_at <= ?");
              archiveParams.push(to);
            }
            const archiveWhere = archiveClauses.join(" AND ");
            const archiveLimit = Math.min(limit, includeArchivePayload ? 50 : limit);
            const archiveRows = await env.VIVI_D1.prepare(
              `SELECT event_id, asset_id, imei, created_at, storage, storage_key, content_type, size_bytes FROM telemetry_archives WHERE ${archiveWhere} ORDER BY created_at DESC LIMIT ${archiveLimit}`
            )
              .bind(...archiveParams)
              .all();

            const rowsList = Array.isArray(archiveRows.results) ? archiveRows.results : [];
            if (includeArchivePayload) {
              for (const row of rowsList) {
                const payload = await readWorkerTelemetryArchivePayload(env, row);
                archives.push({
                  eventId: String((row as any)?.event_id ?? ""),
                  assetId: String((row as any)?.asset_id ?? ""),
                  imei: String((row as any)?.imei ?? ""),
                  createdAt: String((row as any)?.created_at ?? ""),
                  storage: String((row as any)?.storage ?? ""),
                  storageKey: String((row as any)?.storage_key ?? ""),
                  contentType: String((row as any)?.content_type ?? "application/json"),
                  sizeBytes: Number((row as any)?.size_bytes ?? 0),
                  payload
                });
              }
            } else {
              archives = rowsList.map((row: any) => ({
                eventId: String(row?.event_id ?? ""),
                assetId: String(row?.asset_id ?? ""),
                imei: String(row?.imei ?? ""),
                createdAt: String(row?.created_at ?? ""),
                storage: String(row?.storage ?? ""),
                storageKey: String(row?.storage_key ?? ""),
                contentType: String(row?.content_type ?? "application/json"),
                sizeBytes: Number(row?.size_bytes ?? 0)
              }));
            }
          } catch {
            archives = [];
          }
        }

        return json({
          tenantId,
          filters: { imei, assetId, from, to, limit, includeArchive, includeArchivePayload },
          counts: { events: events.length, archives: archives.length },
          events,
          ...(includeArchive ? { archives } : {})
        });
      }
      case "/echo":
        if (request.method !== "POST") {
          return badRequest("Use POST with a JSON payload.");
        }
        {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
        }
        try {
          const body = await request.json();
          return json({ received: body, at: new Date().toISOString() });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      case "/pat":
        if (request.method === "GET") {
          const tokens = await listPats(env);
          return json({ tokens });
        }
        if (request.method === "POST") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          try {
            const body = (await request.json()) as Partial<PersonalAccessToken>;
            const pat = await createPat(env, {
              description: body.description,
              organisationName: body.organisationName,
              organisationGroup: body.organisationGroup,
              expiryDays: body.daysToExpiry,
              username: body.username
            });
            return json({ token: pat });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }
        return badRequest("Unsupported method for /pat");
      case "/ingest/gpsiot": {
        // Hybrid Live Tracking sink: GPS IoT Data Forwarding HTTP Common JSON.
        // Auth is the forwarding provider Token (Authorization Bearer), not the app API key.
        if (request.method !== "POST") return badRequest("Use POST with Common JSON telemetry.");
        const expectedToken = String(env.GPSIOT_FORWARD_TOKEN ?? "").trim();
        if (!expectedToken) {
          return json({ error: "GPSIOT_FORWARD_TOKEN is not configured" }, { status: 503 });
        }
        const authHeader = String(request.headers.get("authorization") ?? "").trim();
        const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
        const headerToken = String(
          request.headers.get("x-gpsiot-token")
          ?? request.headers.get("token")
          ?? url.searchParams.get("token")
          ?? ""
        ).trim();
        const provided = bearer || headerToken;
        if (!provided || provided !== expectedToken) {
          return json({ error: "Unauthorized forwarding token" }, { status: 401 });
        }

        let body: unknown = null;
        try {
          body = await request.json();
        } catch {
          return badRequest("Invalid JSON body.");
        }

        const devices = parseGpsIotForwardedLivePayload(body);
        if (!devices.length) {
          return badRequest("No valid GPS IoT Common JSON rows (ImeiNumber + Lat/Lon required).");
        }

        let tenantId = getTenantId(request, url);
        if (!tenantId) {
          const tenants = new Set<string>();
          for (const device of devices.slice(0, 5)) {
            for (const id of await findTenantIdsByImei(env, device.imei)) tenants.add(id);
          }
          if (tenants.size === 1) tenantId = Array.from(tenants)[0] ?? "";
        }
        if (!tenantId) tenantId = String(env.DEFAULT_TENANT_ID ?? "default").trim() || "default";

        const cacheKey = gpsIotLiveCacheKey(tenantId);
        let previous: GpsIotLiveDevice[] = [];
        try {
          const raw = await env.ViviTEL.get(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw) as { devices?: GpsIotLiveDevice[] };
            previous = Array.isArray(parsed?.devices) ? parsed.devices : [];
          }
        } catch {
          previous = [];
        }
        const merged = mergeGpsIotLiveDevices(previous, devices);
        await env.ViviTEL.put(
          cacheKey,
          JSON.stringify({ at: new Date().toISOString(), devices: merged }),
          { expirationTtl: 60 * 30 }
        );

        const liveRows = devices.map((device) => gpsIotLiveToTraccarLiveRow(device));
        await notifyRealtimeLive(env, tenantId, {
          ok: true,
          at: new Date().toISOString(),
          count: liveRows.length,
          live: liveRows,
          source: "http"
        });

        return json({
          stored: true,
          kind: "gpsiot-forward",
          tenantId,
          count: devices.length,
          cached: merged.length
        });
      }
      case "/ingest/telemetry": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        try {
          const body = (await request.json()) as Record<string, unknown>;
          let tenantId = getTenantId(request, url);
          const latLng = extractLatLng(body);
          if (!latLng) return badRequest("Latitude and longitude are required for telemetry.");
          const now = new Date().toISOString();
          const imei = String((body as any).imei ?? (body as any)?.data?.imei ?? "").trim();
          if (!tenantId && imei) {
            const candidates = await findTenantIdsByImei(env, imei);
            if (candidates.length === 1) tenantId = candidates[0] ?? "";
            else if (candidates.length > 1) {
              return badRequest("Multiple tenant matches for IMEI. Provide x-tenant-id.");
            }
          }
          if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
          if (imei) {
            const boundAssets = await findAssetsByImei(env, tenantId, imei);
            if (!boundAssets.length) {
              return badRequest("Asset not found for IMEI. Bind this IMEI to an asset before ingesting telemetry.");
            }
          }

          const id = normalizeId(imei) || normalizeId((body as any).id) || uuid();
          return json({ stored: true, persistedToD1: false, id, tenantId, at: now });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      }
      case "/ingest/traccar": {
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        const secretErr = requireTraccarWebhookSecret(request, url, env);
        if (secretErr) return secretErr;

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return badRequest("Invalid JSON body.");
        }

        let tenantId = getTenantId(request, url);

        // Traccar HTTP forwarding (forward.url + forward.json, event.forward.url):
        // { position, device } / { event, position, device }. These are pushed by Traccar
        // as data arrives, so live views stay current without polling the Traccar API.
        const forwarded = normalizeTraccarForwardPayload(body);
        const isWrappedForward =
          (Array.isArray(body) ? body : [body]).some(
            (item: any) => item && typeof item === "object" && (item.position || item.device || item.event)
          );
        if (isWrappedForward) {
          await forwardTraccarPayloadToBridge(env, body);
          for (const event of forwarded.events) {
            await processTraccarUserAlertEventIngest(env, event as Record<string, unknown>, tenantId || undefined).catch(
              (error) => console.warn("Forwarded Traccar event dispatch failed:", error)
            );
          }
          return json({
            stored: true,
            kind: "traccar-forward",
            positions: forwarded.positions.length,
            events: forwarded.events.length
          });
        }
        // Bare positions / events (older webhook setups) also feed the live bridge.
        if (forwarded.positions.length || forwarded.events.length) {
          await forwardTraccarPayloadToBridge(env, body);
        }

        // Traccar webhooks can vary. We accept:
        // - a Position object (with latitude/longitude)
        // - an array of Positions
        // - an object with { positionId } and optionally { deviceId }
        const payload = Array.isArray(body) ? body[0] : body;

        if (payload && typeof payload === "object" && isTraccarEventPayload(payload as Record<string, unknown>)) {
          const preferredTenant = tenantId;
          await processTraccarUserAlertEventIngest(env, payload as Record<string, unknown>, preferredTenant || undefined);
          return json({ stored: true, kind: "traccar-event", tenantId: preferredTenant || null });
        }

        const positionId = normalizeId(payload?.positionId ?? payload?.id);
        const deviceId = normalizeId(payload?.deviceId);

        let position: any = payload;

        // If we don't have coordinates, try to resolve position by id from Traccar.
        if (!extractLatLng(position) && positionId) {
          const resp = await traccarFetch(env, `/api/positions?id=${encodeURIComponent(positionId)}`);
          if (resp.ok && Array.isArray(resp.body) && resp.body[0]) position = resp.body[0];
        }

        const latLng = extractLatLng(position as any);
        if (!latLng) return badRequest("Latitude and longitude are required for telemetry.");

        // Prefer IMEI/uniqueId if present.
        let imei = String(position?.uniqueId ?? position?.imei ?? position?.deviceUniqueId ?? "").trim();
        if (!imei && deviceId) {
          // Try to resolve deviceId -> uniqueId (IMEI) from Traccar.
          const resp = await traccarFetch(env, `/api/devices?id=${encodeURIComponent(deviceId)}`);
          if (resp.ok && Array.isArray(resp.body) && resp.body[0]) {
            imei = String(resp.body[0]?.uniqueId ?? "").trim();
          }
        }
        if (!tenantId && imei) {
          const candidates = await findTenantIdsByImei(env, imei);
          if (candidates.length === 1) tenantId = candidates[0] ?? "";
          else if (candidates.length > 1) {
            return badRequest("Multiple tenant matches for IMEI. Provide x-tenant-id.");
          }
        }
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        if (imei) {
          const boundAssets = await findAssetsByImei(env, tenantId, imei);
          if (!boundAssets.length) {
            return badRequest("Asset not found for IMEI. Bind this IMEI to an asset before ingesting telemetry.");
          }
        }

        const fallbackId = normalizeId(imei || deviceId || position?.deviceId || position?.id);
        if (!fallbackId) return badRequest("Asset id is required.");

        const createdAt =
          String(position?.deviceTime ?? position?.fixTime ?? position?.serverTime ?? "").trim() ||
          new Date().toISOString();
        return json({
          stored: true,
          persistedToD1: false,
          id: fallbackId,
          imei: imei || null,
          tenantId,
          at: createdAt
        });
      }
      case "/ingest/camera-health": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const tenantId = getTenantId(request, url);
          const id = normalizeId(body.id ?? body.cameraId ?? body.serial);
          if (!id) return badRequest("Camera id is required.");
          const payload = {
            id,
            ...body,
            lastSeen: new Date().toISOString()
          };
          const result = await upsertEntity(env, "cameras", tenantId, payload);
          if (!result.ok) return badRequest(result.message);
          await appendEvent(env, tenantId, {
            id: uuid(),
            type: "camera",
            cameraId: id,
            createdAt: payload.lastSeen,
            data: payload
          });
          return json({ stored: true, id, tenantId });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      }
      case "/stream/telemetry": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        {
          const access = await requireRbacPermission(request, env, tenantId, "/Track/tracking/live", "view");
          if (access) return access;
        }
        const since = url.searchParams.get("since") ?? "";
        const encoder = new TextEncoder();
        let lastSentAt = since || new Date().toISOString();

        const stream = new ReadableStream({
          start(controller) {
            const send = (event: string, data: unknown) => {
              controller.enqueue(encoder.encode(`event: ${event}\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            send("ready", { ok: true, at: new Date().toISOString() });

            const interval = setInterval(async () => {
              const events = await readEventsSince(env, tenantId, lastSentAt, "asc");
              if (events.length > 0) {
                const byIdentity = new Map<string, Record<string, unknown>>();
                for (const event of events) {
                  const rec = (event ?? {}) as Record<string, unknown>;
                  const data = (rec.data ?? {}) as Record<string, unknown>;
                  const eventAssetId = normalizeId(rec.assetId ?? (data as any).assetId ?? (data as any).id);
                  const eventImei = String((rec as any).imei ?? (data as any).imei ?? "").trim();
                  const identity = eventAssetId || eventImei || normalizeId(rec.id) || `evt-${Date.now()}-${Math.random()}`;
                  byIdentity.set(identity, rec);
                }

                const compacted = Array.from(byIdentity.values()).sort((a, b) => {
                  const ams = Date.parse(String((a as any)?.createdAt ?? ""));
                  const bms = Date.parse(String((b as any)?.createdAt ?? ""));
                  if (!Number.isFinite(ams) && !Number.isFinite(bms)) return 0;
                  if (!Number.isFinite(ams)) return -1;
                  if (!Number.isFinite(bms)) return 1;
                  return ams - bms;
                });

                const newest = compacted[compacted.length - 1]?.createdAt;
                if (typeof newest === "string") lastSentAt = newest;
                send("telemetry", compacted);
              } else {
                send("ping", { at: new Date().toISOString() });
              }
            }, 5000);

            (controller as unknown as { interval?: ReturnType<typeof setInterval> }).interval = interval;
          },
          cancel() {
            const interval = (this as unknown as { interval?: ReturnType<typeof setInterval> }).interval;
            if (interval) clearInterval(interval);
          }
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
            "access-control-allow-origin": "*"
          }
        });
      }
      case "/support/chat": {
        const tenantId = getTenantId(request, url);
        if (request.method === "GET") {
          const id = normalizeId(url.searchParams.get("id"));
          if (!id) return badRequest("Conversation id is required.");
          const conversation = await readConversation(env, tenantId, id);
          return json({ conversation, tenantId });
        }
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        try {
          const body = (await request.json()) as {
            conversationId?: string;
            message?: string;
            userName?: string;
            userEmail?: string;
            agentId?: string;
            agentName?: string;
            agentCategory?: string;
          };
          const message = String(body.message ?? "").trim();
          if (!message) return badRequest("Message is required.");
          const conversationId = normalizeId(body.conversationId) || uuid();
          const existing = await readConversation(env, tenantId, conversationId);
          const now = new Date().toISOString();
          const nextConversation: ChatConversation = existing ?? {
            id: conversationId,
            status: "open",
            createdAt: now,
            messages: []
          };
          if (body.userName || body.userEmail) {
            nextConversation.user = {
              name: body.userName ?? nextConversation.user?.name,
              email: body.userEmail ?? nextConversation.user?.email
            };
          }
          const agentId = String(body.agentId ?? "").trim();
          const agentName = String(body.agentName ?? "").trim();
          const agentCategory = normalizeSupportAgentCategory(body.agentCategory);
          if (agentId || agentName) {
            nextConversation.assignedAgent = {
              id: agentId || nextConversation.assignedAgent?.id,
              name: agentName || nextConversation.assignedAgent?.name,
              category: agentCategory || nextConversation.assignedAgent?.category
            };
          }
          nextConversation.messages.push({
            id: uuid(),
            role: "user",
            text: message,
            at: now
          });
          await writeConversation(env, tenantId, nextConversation);
          ctx.waitUntil(notifyRealtimeSupport(env, tenantId));
          return json({ conversation: nextConversation, tenantId });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      }
      case "/support/chat/reply": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        try {
          const body = (await request.json()) as {
            conversationId?: string;
            message?: string;
            agentId?: string;
            agentName?: string;
          };
          const conversationId = normalizeId(body.conversationId);
          const message = String(body.message ?? "").trim();
          if (!conversationId) return badRequest("Conversation id is required.");
          if (!message) return badRequest("Message is required.");
          const conversation = await readConversation(env, tenantId, conversationId);
          if (!conversation) return notFound();
          if (conversation.status === "closed") return badRequest("Conversation is closed.");
          const now = new Date().toISOString();
          const agentId = String(body.agentId ?? "").trim();
          const agentName = String(body.agentName ?? "").trim();
          if (agentId || agentName) {
            conversation.assignedAgent = {
              id: agentId || conversation.assignedAgent?.id,
              name: agentName || conversation.assignedAgent?.name,
              category: conversation.assignedAgent?.category
            };
          }
          conversation.messages.push({
            id: uuid(),
            role: "agent",
            text: message,
            at: now
          });
          await writeConversation(env, tenantId, conversation);
          if (agentId) await writeSupportAgentPresence(env, tenantId, agentId, now);
          ctx.waitUntil(notifyRealtimeSupport(env, tenantId));
          return json({ conversation, tenantId });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      }
      case "/support/chat/inbox": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (request.method !== "GET") return badRequest("Use GET.");
        const principal = await getPrincipal(request, env);
        if (principal.kind !== "admin" && principal.kind !== "user") return unauthorized();
        if (principal.kind === "user") {
          const identity = await readRbacUserIdentity(env, principal.userId);
          const roleNames = tenantId ? (await readDirectRolesForUser(env, tenantId, principal.userId)).map((r) => r.roleName) : [];
          const isSupport =
            roleNames.some((name) => isOwnSupportLikeRoleName(name) || isAdminLikeRoleName(name));
          if (!isSupport) return json({ conversations: [], tenantId });
          if (identity?.name)
            await writeSupportAgentPresence(env, tenantId, principal.userId, new Date().toISOString());
        }
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 50) || 50));
        const conversations = await listOpenConversations(env, tenantId, limit);
        return json({ conversations, tenantId, at: new Date().toISOString() });
      }
      case "/support/agents": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (request.method !== "GET") return badRequest("Use GET.");
        try {
          const presenceWindowSec = Math.max(15, Math.min(600, Number(url.searchParams.get("windowSec") ?? 90) || 90));
          const now = Date.now();
          const agents = await readOwnSupportAgents(env);
          const livePresence = tenantId ? await listRealtimePresenceFromVps(env, tenantId) : {};
          const categories: Record<string, any[]> = {};
          for (const c of SUPPORT_AGENT_CATEGORIES) categories[c] = [];
          for (const agent of agents) {
            let lastSeenAt = String(livePresence[agent.id] ?? "").trim();
            if (!lastSeenAt) lastSeenAt = await readSupportAgentPresence(env, tenantId, agent.id);
            const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
            const staleSec = Number.isFinite(lastSeenMs) ? (now - lastSeenMs) / 1000 : Number.POSITIVE_INFINITY;
            const online = staleSec <= presenceWindowSec;
            const category = normalizeSupportAgentCategory(agent.category);
            categories[category].push({
              id: agent.id,
              name: agent.name,
              category,
              online,
              lastSeenAt: lastSeenAt || undefined
            });
          }
          for (const c of SUPPORT_AGENT_CATEGORIES) {
            categories[c].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
          }
          return json({ categories, at: new Date().toISOString(), windowSec: presenceWindowSec, tenantId });
        } catch (error) {
          const categories: Record<string, any[]> = {};
          for (const c of SUPPORT_AGENT_CATEGORIES) categories[c] = [];
          return json({
            categories,
            at: new Date().toISOString(),
            tenantId,
            warning: error instanceof Error ? error.message : String(error)
          });
        }
      }
      case "/support/chat/end": {
        const tenantId = getTenantId(request, url);
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        try {
          const body = (await request.json()) as { conversationId?: string };
          const conversationId = normalizeId(body.conversationId);
          if (!conversationId) return badRequest("Conversation id is required.");
          const conversation = await readConversation(env, tenantId, conversationId);
          if (!conversation) return notFound();
          const now = new Date().toISOString();
          conversation.status = "closed";
          conversation.closedAt = now;
          await writeConversation(env, tenantId, conversation);
          ctx.waitUntil(notifyRealtimeSupport(env, tenantId));
          await queueSupportEmail(env, {
            conversationId,
            tenantId,
            user: conversation.user ?? null,
            messages: conversation.messages,
            endedAt: now,
            to: env.SUPPORT_EMAIL ?? null
          });
          return json({ ended: true, conversationId, emailQueued: true });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      }
      case "/d1/assets/duplicate-check": {
        await ensureD1Tables(env);
        const tenantId = await resolveTenantId(request, url, env);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        if (request.method !== "GET") return badRequest("Use GET.");
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const access = await requireRbacPermission(request, env, tenantId, "/Track/fleet/assets", "view");
        if (access) return access;
        const imei = String(url.searchParams.get("imei") ?? "").trim();
        const cameraSerial = String(url.searchParams.get("cameraSerial") ?? "").trim();
        const excludeId = normalizeId(url.searchParams.get("excludeId") ?? "");
        let duplicateImei = false;
        let duplicateCameraSerial = false;
        let imeiExistingId = "";
        let cameraExistingId = "";
        if (imei) {
          const matches = (await findAssetsByImei(env, tenantId, imei)) as unknown as Record<string, unknown>[];
          for (const row of matches) {
            const rowId = normalizeId((row as any)?.id ?? (row as any)?.registration ?? (row as any)?.imei);
            if (excludeId && rowId === excludeId) continue;
            duplicateImei = true;
            imeiExistingId = rowId;
            break;
          }
        }
        if (cameraSerial) {
          const assets = (await listEntity(env, "assets", tenantId)) as Record<string, unknown>[];
          for (const row of assets) {
            const rowId = normalizeId((row as any)?.id ?? (row as any)?.registration ?? (row as any)?.imei);
            if (excludeId && rowId === excludeId) continue;
            if (normalizeComparable((row as any)?.cameraSerial) === normalizeComparable(cameraSerial)) {
              duplicateCameraSerial = true;
              cameraExistingId = rowId;
              break;
            }
          }
        }
        return json({
          duplicateImei,
          duplicateCameraSerial,
          message: duplicateImei || duplicateCameraSerial ? "Device IMEI in use" : "",
          details: {
            imei: duplicateImei ? { id: imeiExistingId, tenantId } : null,
            cameraSerial: duplicateCameraSerial ? { id: cameraExistingId, tenantId } : null
          }
        });
      }
      case "/d1/assets/import-traccar": {
        await ensureD1Tables(env);
        const tenantId = await resolveTenantId(request, url, env);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        if (request.method !== "POST") return badRequest("Use POST.");
        if (regionUsesCms808(region)) return badRequest("Traccar import is not supported for the CMS808 region.");
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const access = await requireRbacPermission(request, env, tenantId, "/Track/fleet/assets", "edit");
        if (access) return access;
        let siteName = String(url.searchParams.get("site") ?? "").trim();
        try {
          const body = (await request.json()) as { site?: string };
          if (!siteName) siteName = String(body?.site ?? "").trim();
        } catch {
          // optional body
        }
        const result = await importAssetsFromTraccar(env, tenantId, siteName);
        if (result.error) {
          return json({ ok: false, ...result, tenantId }, { status: 502 });
        }
        const assets = await listEntity(env, "assets", tenantId);
        await invalidateAssetsListCache(env, tenantId);
        return json({ ok: true, ...result, assets, tenantId });
      }
      case "/d1/assets": {
        await ensureD1Tables(env);
        const tenantId = await resolveTenantId(request, url, env);

        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");

        if (request.method === "GET") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const access = await requireRbacPermission(request, env, tenantId, "/Track/fleet/assets", "view");
          if (access) return access;
          const listAssetsOnly = async () => {
            let assets = await listEntity(env, "assets", tenantId);
            const missingAssetIds = (assets as any[]).some((asset) => !(Number((asset as any)?.assetId) > 0));
            if (missingAssetIds) {
              await normalizeAssetIdsForTenant(env, tenantId);
              assets = await listEntity(env, "assets", tenantId);
            }
            return assets as any[];
          };
          try {
            const payload = await withDbCache(
              workerListCacheStore(env),
              workerAssetsCacheKey(tenantId),
              WORKER_LIST_CACHE_TTL_SEC,
              async () => {
                const assets = await listAssetsOnly();
                const lightenAssetForList = (asset: any) => {
                  if (!asset || typeof asset !== "object") return asset;
                  const { raw: _raw, attributes: _attributes, telemetryLatest: _telemetryLatest, ...rest } = asset;
                  return rest;
                };
                let latest = {
                  byAssetId: new Map<string, LatestTelemetrySnapshot>(),
                  byImei: new Map<string, LatestTelemetrySnapshot>()
                };
                try {
                  latest = await readLatestTelemetryForAssetList(env, tenantId);
                } catch {
                  // Fleet list still returns when the latest-fix query is unavailable.
                }
                const enrichedAssets = assets.map((asset) => {
                  const id = normalizeId((asset as any)?.id ?? (asset as any)?.registration ?? (asset as any)?.imei);
                  const imei = String((asset as any)?.imei ?? "").trim();
                  const snap =
                    (id ? latest.byAssetId.get(id) : undefined) ?? (imei ? latest.byImei.get(imei) : undefined);
                  if (!snap) return lightenAssetForList(asset);

                  const seenAt = pickFirstString((asset as any)?.lastSeen, (asset as any)?.lastPosition);
                  const tripAt = pickFirstString((asset as any)?.lastTrip);
                  const seenMs = seenAt ? Date.parse(seenAt) : NaN;
                  const tripMs = tripAt ? Date.parse(tripAt) : NaN;
                  const snapMs = Date.parse(snap.at);
                  const positionStale = !Number.isFinite(seenMs) || (Number.isFinite(snapMs) && snapMs >= seenMs);
                  const tripStale = !Number.isFinite(tripMs) || (Number.isFinite(snapMs) && snapMs >= tripMs);
                  // Last Position must never lag behind Last Trip.
                  const positionBehindTrip =
                    Number.isFinite(tripMs) && (!Number.isFinite(seenMs) || tripMs > seenMs);
                  if (!positionStale && !tripStale && !positionBehindTrip) return lightenAssetForList(asset);

                  const nextPositionAt =
                    newestTimestamp(positionStale || tripStale ? snap.at : "", positionBehindTrip ? tripAt : "", seenAt) ||
                    snap.at;
                  const nextTripAt = tripStale ? snap.at : tripAt || nextPositionAt;

                  const existingLocation = pickFirstString(
                    (asset as any)?.lastLocation,
                    (asset as any)?.location,
                    (asset as any)?.locationName
                  );
                  const resolvedLocation = pickFirstString(snap.locationName, existingLocation);
                  const hasCoordinates = typeof snap.lat === "number" && typeof snap.lng === "number";
                  const applyLiveFields = positionStale || tripStale || positionBehindTrip;
                  return lightenAssetForList({
                    ...(asset as any),
                    lastSeen: nextPositionAt,
                    lastPosition: nextPositionAt,
                    lastTrip: newestTimestamp(nextTripAt, nextPositionAt) || nextPositionAt,
                    ...(applyLiveFields && hasCoordinates
                      ? {
                          lat: snap.lat,
                          lng: snap.lng,
                          lon: snap.lng,
                          gps: `${Number(snap.lat).toFixed(6)}, ${Number(snap.lng).toFixed(6)}`
                        }
                      : {}),
                    ...(applyLiveFields && resolvedLocation
                      ? { locationName: resolvedLocation, location: resolvedLocation, lastLocation: resolvedLocation }
                      : {}),
                    ...(applyLiveFields && typeof snap.speed === "number" ? { speed: snap.speed } : {}),
                    ...(applyLiveFields && typeof snap.satellites === "number" ? { satellites: snap.satellites } : {}),
                    ...(applyLiveFields && typeof snap.ignition === "boolean" ? { ignition: snap.ignition } : {}),
                    ...(applyLiveFields && typeof snap.powerVoltage === "number" ? { powerVoltage: snap.powerVoltage } : {}),
                    ...(applyLiveFields && snap.movement ? { movement: snap.movement } : {})
                  });
                });
                return { assets: enrichedAssets, tenantId };
              }
            );
            return json(payload);
          } catch {
            const assets = await listAssetsOnly().catch(() => []);
            return json({
              assets: assets.map((asset) => {
                if (!asset || typeof asset !== "object") return asset;
                const { raw: _raw, attributes: _attributes, telemetryLatest: _telemetryLatest, ...rest } = asset as any;
                return rest;
              }),
              tenantId
            });
          }
        }

        if (request.method === "POST" || request.method === "PUT") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const access = await requireRbacPermission(request, env, tenantId, "/Track/fleet/assets", "edit");
          if (access) return access;
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const userProvidedConfigGroup = String(
              (body as any).configGroup ?? (body as any).configurationGroup ?? ""
            ).trim();
            const siteName = String((body as any).site ?? "").trim();
            let configGroupRaw = userProvidedConfigGroup;
            if (!configGroupRaw || isDefaultConfigurationGroupRef(configGroupRaw)) {
              configGroupRaw = await resolveConfigurationGroupIdForAsset(
                env,
                tenantId,
                siteName,
                userProvidedConfigGroup
              );
            }

            let groups = await listConfigurationGroups(env, tenantId);
            let group = resolveByNameOrId(groups as any, configGroupRaw);
            if (!group && !userProvidedConfigGroup) {
              // Only fall back to default when the client omitted the field and no site group exists.
              await ensureDefaultConfigurationGroup(env, tenantId);
              groups = await listConfigurationGroups(env, tenantId);
              group =
                resolveByNameOrId(groups as any, configGroupRaw) ??
                resolveByNameOrId(groups as any, "default-group") ??
                resolveByNameOrId(groups as any, "default") ??
                groups[0] ??
                null;
            }
            if (!group) {
              return badRequest(
                userProvidedConfigGroup
                  ? `Configuration group not found: ${userProvidedConfigGroup}`
                  : "Configuration group not found."
              );
            }
            (body as any).configGroup = String((group as any).id ?? configGroupRaw);
            const groupName = String((group as any).name ?? "").trim();
            if (groupName) (body as any).configurationGroup = groupName;
            // Never persist configuration group names into `database` (maps to Traccar Phone).
            (body as any).database = resolveAssetDatabaseLabel({
              ...body,
              configGroup: (body as any).configGroup,
              configurationGroup: groupName || (body as any).configurationGroup
            });

            const duplicate = await findAssetDuplicateConflict(env, tenantId, body);
            if (duplicate) {
              const message =
                duplicate.field === "imei"
                  ? "IMEI in use"
                  : duplicate.field === "registration"
                    ? "Reg Number in use"
                    : "Asset Description in use";
              return json(
                {
                  error: message,
                  field: duplicate.field,
                  value: duplicate.value,
                  existingId: duplicate.existingId
                },
                { status: 409 }
              );
            }

            const incomingImei = String((body as any).imei ?? "").trim();
            if (incomingImei && isSharedDemoDatabaseTenant(tenantId)) {
              const otherTenants = (await findTenantIdsByImei(env, incomingImei)).filter((id) => id !== tenantId);
              if (otherTenants.length && !(await findAssetsByImei(env, tenantId, incomingImei)).length) {
                return json(
                  {
                    stored: false,
                    error: "This vehicle already belongs to another site.",
                    field: "imei",
                    value: incomingImei
                  },
                  { status: 409 }
                );
              }
            }

            const result = await upsertAssetMerged(env, tenantId, body);
            if (!result.ok) return badRequest(result.message);
            await normalizeAssetIdsForTenant(env, tenantId);
            await invalidateAssetsListCache(env, tenantId);
            const savedRow = await readEntityById(env, "assets", tenantId, result.id);
            const assignedAssetId = Number((savedRow as any)?.assetId ?? 0) || 0;
            const syncPayload = (savedRow && typeof savedRow === "object" ? { ...body, ...savedRow } : body) as Record<
              string,
              unknown
            >;
            let deviceSyncJob: { jobId: string; queuedAt: string } | null = null;
            let traccarSynced = false;
            let traccarError = "";
            if (isSharedDemoDatabaseTenant(tenantId) && String((syncPayload as any).imei ?? "").trim()) {
              const syncedNow = await syncDeviceJobToTraccar(env, syncPayload, tenantId);
              traccarSynced = syncedNow.synced;
              traccarError = String(syncedNow.traccarError ?? "");
              const syncedDeviceId = Number(syncedNow.traccarDeviceId ?? 0);
              if (syncedNow.synced && Number.isFinite(syncedDeviceId) && syncedDeviceId > 0) {
                await upsertAssetMerged(env, tenantId, {
                  id: result.id,
                  imei: String((syncPayload as any).imei ?? ""),
                  traccarDeviceId: Math.trunc(syncedDeviceId)
                });
                (syncPayload as any).traccarDeviceId = Math.trunc(syncedDeviceId);
                await invalidateAssetsListCache(env, tenantId);
              }
            }
            if (!traccarSynced) {
              try {
                deviceSyncJob = await enqueueTraccarDeviceSyncJob(env, tenantId, result.id, syncPayload, "upsert");
              } catch {
                deviceSyncJob = null;
              }
            }
            const assetForResponse = traccarSynced
              ? ((await readEntityById(env, "assets", tenantId, result.id)) as Record<string, unknown> | null) ?? savedRow
              : savedRow;
            return json({
              stored: true,
              id: result.id,
              asset: assetForResponse ?? { ...body, id: result.id },
              assetId: assignedAssetId,
              traccarSynced,
              ...(traccarError ? { traccarError } : {}),
              traccarSyncQueued: Boolean(deviceSyncJob),
              ...(deviceSyncJob ? { traccarSyncJobId: deviceSyncJob.jobId, traccarSyncQueuedAt: deviceSyncJob.queuedAt } : {}),
              tenantId
            });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        if (request.method === "DELETE") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const access = await requireRbacPermission(request, env, tenantId, "/Track/fleet/assets", "delete");
          if (access) return access;
          const id = normalizeId(url.searchParams.get("id"));
          const imei = String(url.searchParams.get("imei") ?? "").trim();
          const registration = String(url.searchParams.get("registration") ?? "").trim();
          if (!id && !imei && !registration) return badRequest("Asset id, imei, or registration is required.");
          const resolvedIds = await resolveAssetIdsForDelete(env, tenantId, { id, imei, registration });
          if (!resolvedIds.length) {
            return json({ deleted: false, id: id || imei || registration, tenantId, message: "Asset not found for delete criteria." });
          }
          let deleted = false;
          let resolvedId = resolvedIds[0];
          for (const assetId of resolvedIds) {
            const removed = await deleteEntity(env, "assets", tenantId, assetId);
            if (removed) {
              deleted = true;
              resolvedId = assetId;
            }
          }
          await invalidateAssetsListCache(env, tenantId);
          return json({ deleted, id: resolvedId, tenantId });
        }

        return badRequest("Unsupported method for /d1/assets");
      }
      case "/d1/device-reporting-settings": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);

        if (request.method === "GET") {
          const result = await env.VIVI_D1.prepare(
            "SELECT data, updated_at FROM device_reporting_settings WHERE tenant_id = ?"
          )
            .bind(tenantId)
            .first();
          if (!result) return json({ settings: null, tenantId });
          try {
            return json({ settings: JSON.parse(String(result.data)), tenantId, updatedAt: result.updated_at });
          } catch {
            return json({ settings: null, tenantId });
          }
        }

        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const now = new Date().toISOString();
            await env.VIVI_D1.prepare(
              "INSERT INTO device_reporting_settings (tenant_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
            )
              .bind(tenantId, JSON.stringify(body), now)
              .run();
            return json({ stored: true, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        return badRequest("Unsupported method for /d1/device-reporting-settings");
      }
      case "/d1/configuration-groups": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);

        if (request.method === "DELETE") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const id = (url.searchParams.get("id") ?? "").trim();
          if (!id) return badRequest("Configuration group id is required.");
          const result = await env.VIVI_D1.prepare(
            "DELETE FROM configuration_groups WHERE tenant_id = ? AND id = ?"
          )
            .bind(tenantId, id)
            .run();
          return json({ deleted: (result.meta?.changes ?? 0) > 0, id, tenantId });
        }

        if (request.method === "GET") {
          const result = await env.VIVI_D1.prepare(
            "SELECT data, updated_at FROM configuration_groups WHERE tenant_id = ? ORDER BY updated_at DESC"
          )
            .bind(tenantId)
            .all();
          const groups = (result.results ?? [])
            .map((row) => {
              try {
                return JSON.parse(String(row.data));
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          return json({ groups, tenantId });
        }

        if (request.method === "POST") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const id = String(body.id ?? "").trim();
            if (!id) return badRequest("Configuration group id is required.");
            const siteError = validateRecordSiteAnchor("configuration-group", body, tenantId);
            if (siteError) return badRequest(siteError);
            const now = new Date().toISOString();
            await env.VIVI_D1.prepare(
              "INSERT INTO configuration_groups (id, tenant_id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id, tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
            )
              .bind(id, tenantId, JSON.stringify(body), now)
              .run();
            return json({ stored: true, id, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        return badRequest("Unsupported method for /d1/configuration-groups");
      }
      case "/d1/drivers": {
        const tenantId = getTenantId(request, url);
        const kvGet = (key: string) => kvGetWithVpsFallback(env, key, tenantId);
        const kvPut = (key: string, value: string) => kvPutWithVpsFallback(env, key, value, tenantId);
        if (request.method === "GET") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const drivers = await listEntity(env, "drivers", tenantId);
          const siteFilter = String(url.searchParams.get("site") ?? "").trim();
          const extraSites = url.searchParams
            .getAll("sites")
            .map((value) => String(value ?? "").trim())
            .filter(Boolean);
          let scoped = siteFilter
            ? (drivers as Record<string, unknown>[]).filter((row) =>
                siteScopesMatch(String((row as any).site ?? ""), siteFilter)
              )
            : drivers;
          const kvSites = Array.from(
            new Set(
              [
                siteFilter,
                ...extraSites,
                ...(scoped as Record<string, unknown>[]).map((row) => String((row as any).site ?? "").trim())
              ].filter(Boolean)
            )
          );
          const fromKnownSites = kvSites.length
            ? await Promise.all(kvSites.map((site) => readSiteDriversFromKv(kvGet, tenantId, site)))
            : [];
          const fromListed = await listAllSiteDriversFromKv(kvGet, (prefix) => kvListSafe(env, prefix), tenantId);
          scoped = mergeDriverKvRecords(
            scoped as Record<string, unknown>[],
            ...fromKnownSites,
            fromListed
          );
          if (siteFilter) {
            scoped = (scoped as Record<string, unknown>[]).filter((row) =>
              siteScopesMatch(String((row as any).site ?? ""), siteFilter)
            );
          }
          return json({ drivers: scoped, tenantId });
        }
        if (request.method === "POST" || request.method === "PUT") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const access = await requireRbacPermission(request, env, tenantId, "/Track/fleet/drivers", "edit");
          if (access) return access;
          try {
            const body = (await request.json()) as Record<string, unknown>;

            const siteError = validateRecordSiteAnchor("driver", body, tenantId);
            if (siteError) return badRequest(siteError);

            const incomingId = normalizeId((body as any).id);
            const incomingEmail = String((body as any).email ?? "").trim().toLowerCase();
            const incomingSite = String((body as any).site ?? "").trim();
            const incomingName = String((body as any).name ?? (body as any).driverName ?? "").trim();
            if (!incomingName) return badRequest("Driver name is required.");
            if (incomingEmail) {
              const existingDrivers = (await listEntity(env, "drivers", tenantId)) as Record<string, unknown>[];
              const duplicateEmail = existingDrivers.find((row) => {
                const rowId = normalizeId((row as any).id ?? (row as any).driverId);
                if (incomingId && rowId && incomingId === rowId) return false;
                if (!siteScopesMatch(String((row as any).site ?? ""), incomingSite)) return false;
                return String((row as any).email ?? "").trim().toLowerCase() === incomingEmail;
              });
              if (duplicateEmail) {
                return json(
                  {
                    error: "Driver Email Exists",
                    field: "email",
                    value: incomingEmail,
                    existingId: normalizeId((duplicateEmail as any).id ?? (duplicateEmail as any).driverId)
                  },
                  { status: 409 }
                );
              }
            }

            const result = await upsertEntity(env, "drivers", tenantId, body);
            if (!result.ok) return badRequest(result.message);
            if (incomingSite) {
              await upsertSiteDriverInKv(kvGet, kvPut, tenantId, { ...body, id: result.id, site: incomingSite });
            }
            return json({ stored: true, id: result.id, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }
        if (request.method === "DELETE") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const access = await requireRbacPermission(request, env, tenantId, "/Track/fleet/drivers", "delete");
          if (access) return access;
          const id = normalizeId(url.searchParams.get("id"));
          if (!id) return badRequest("Driver id is required.");
          const existing = await readEntityById(env, "drivers", tenantId, id);
          const deleted = await deleteEntity(env, "drivers", tenantId, id);
          const site = String((existing as any)?.site ?? url.searchParams.get("site") ?? "").trim();
          if (site) {
            await removeSiteDriverFromKv(kvGet, kvPut, tenantId, { id, site });
          }
          return json({ deleted, id, tenantId });
        }
        return badRequest("Unsupported method for /d1/drivers");
      }
      case "/d1/trips": {
        const tenantId = getTenantId(request, url);
        if (request.method === "GET") {
          const trips = await listEntity(env, "trips", tenantId);
          return json({ trips, tenantId });
        }
        if (request.method === "POST" || request.method === "PUT") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const result = await upsertEntity(env, "trips", tenantId, body);
            if (!result.ok) return badRequest(result.message);
            return json({ stored: true, id: result.id, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }
        if (request.method === "DELETE") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const id = normalizeId(url.searchParams.get("id"));
          if (!id) return badRequest("Trip id is required.");
          const deleted = await deleteEntity(env, "trips", tenantId, id);
          return json({ deleted, id, tenantId });
        }
        return badRequest("Unsupported method for /d1/trips");
      }
      case "/d1/cameras": {
        const tenantId = getTenantId(request, url);
        if (request.method === "GET") {
          const cameras = await listEntity(env, "cameras", tenantId);
          return json({ cameras, tenantId });
        }
        if (request.method === "POST" || request.method === "PUT") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const result = await upsertEntity(env, "cameras", tenantId, body);
            if (!result.ok) return badRequest(result.message);
            return json({ stored: true, id: result.id, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }
        if (request.method === "DELETE") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const id = normalizeId(url.searchParams.get("id"));
          if (!id) return badRequest("Camera id is required.");
          const deleted = await deleteEntity(env, "cameras", tenantId, id);
          return json({ deleted, id, tenantId });
        }
        return badRequest("Unsupported method for /d1/cameras");
      }
      case "/camera/live/session": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Unsupported method for /camera/live/session");
        const tenantId = getTenantId(request, url);
        {
          const access = await requireRbacPermission(request, env, tenantId, "/Track/videos/live-video-streaming", "view");
          if (access) return access;
        }
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const requestedChannel = Number(body.channel ?? 1);
          const channel = Number.isFinite(requestedChannel) && requestedChannel > 0 ? Math.min(16, Math.floor(requestedChannel)) : 1;
          const requestedCameraId = liveText(body.cameraId ?? body.deviceId);
          const requestedAssetId = liveText(body.assetId);
          const includeDebug = String(body.debugLive ?? body.debug ?? url.searchParams.get("debug") ?? "").trim().toLowerCase() === "1"
            || String(body.debugLive ?? body.debug ?? url.searchParams.get("debug") ?? "").trim().toLowerCase() === "true";

          const cameras = (await listEntity(env, "cameras", tenantId)) as Record<string, unknown>[];
          const assets = (await listEntity(env, "assets", tenantId)) as Record<string, unknown>[];
          const deviceBindings = (await listBindingsByType(env, tenantId, "devices")) as Record<string, unknown>[];

          const boundCameraId = requestedAssetId ? liveResolveBoundCameraIdForAsset(deviceBindings, requestedAssetId) : "";

          const asset = liveFindRecordByNeedle(assets, requestedAssetId, ["id", "assetId", "registration", "imei"]) ?? null;
          const cameraFromAsset = asset
            ? liveFindRecordByNeedle(
              cameras,
              liveText((asset as any)?.cameraId ?? (asset as any)?.cameraSerial ?? (asset as any)?.imei),
              ["cameraId", "id", "cameraSerial", "serial", "deviceId", "imei", "deviceImei"]
            )
            : null;
          const cameraFromBinding = boundCameraId
            ? liveFindRecordByNeedle(cameras, boundCameraId, ["cameraId", "id", "cameraSerial", "serial", "deviceId", "imei", "deviceImei"])
            : null;
          const cameraFromAssetId = requestedAssetId
            ? liveFindRecordByNeedle(cameras, requestedAssetId, ["cameraId", "id", "cameraSerial", "serial", "deviceId", "imei", "deviceImei"])
            : null;
          const camera =
            liveFindRecordByNeedle(cameras, requestedCameraId, ["cameraId", "id", "cameraSerial", "serial", "deviceId", "imei", "deviceImei"])
            || cameraFromBinding
            || cameraFromAssetId
            || cameraFromAsset
            || null;

          const channels = liveBuildChannels(camera, asset);
          const normalizedChannels = channels.map((row: any) => ({
            ...row,
            ...(row?.streamUrl ? { streamUrl: liveResolveSessionUrl(row.streamUrl, url.origin) } : {})
          }));
          let selected = normalizedChannels.find((row) => row.index === channel) || normalizedChannels[0] || null;
          let streamUrl = liveText((selected as any)?.streamUrl);
          const selectedChannelKey = liveText((selected as any)?.key) || liveNormalizeChannelKey((selected as any)?.label) || `channel-${channel}`;
          const selectedChannelLabel = liveText((selected as any)?.label) || liveChannelLabelByIndex(channel);
          const selectedCameraId = liveText(
            (camera as any)?.cameraId
            ?? (camera as any)?.id
            ?? boundCameraId
            ?? (asset as any)?.cameraId
            ?? (asset as any)?.cameraSerial
            ?? (asset as any)?.imei
            ?? requestedCameraId
          );
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
              env,
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
              env,
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

          if (!streamUrl && selectedCameraId) {
            const site = liveText(request.headers.get("x-site-name") ?? url.searchParams.get("site") ?? body.site);
            const cmsUrl = await resolveLiveStreamFromCmsv6(
              {
                get: (key) => kvGetWithVpsFallback(env, key, tenantId),
                set: async (key, value) => {
                  await kvPutWithVpsFallback(env, key, value, tenantId);
                }
              },
              tenantId,
              site,
              selectedCameraId,
              channel,
              liveText(request.headers.get("x-vivi-user-id") ?? request.headers.get("x-vivi-user-email"))
            );
            if (cmsUrl) {
              streamUrl = cmsUrl;
              selected = {
                ...(selected as any),
                streamUrl: cmsUrl,
                provider: "cmsv6"
              };
            }
          }

          return json({
            ok: true,
            available: Boolean(streamUrl),
            source: camera ? "camera" : asset ? "asset" : "none",
            cameraId: liveText((camera as any)?.cameraId ?? (camera as any)?.id) || requestedCameraId || null,
            assetId: liveText((asset as any)?.id ?? (asset as any)?.assetId) || null,
            channel: selected,
            channels: normalizedChannels,
            streamUrl: streamUrl || null,
            token: streamUrl ? uuid() : null,
            message: streamUrl
              ? "Live stream session prepared."
              : "No stream URL configured for the selected channel.",
            ...(includeDebug
              ? {
                  diagnostics: {
                    tenantId,
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
                    deviceServerFallback: fallbackDiagnostics,
                    providerFallback: providerDiagnostics
                  }
                }
              : {})
          });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      }
      case "/d1/warehouses": {
        const tenantId = getTenantId(request, url);
        if (request.method === "GET") {
          const warehouses = await listEntity(env, "warehouses", tenantId);
          return json({ warehouses, tenantId });
        }
        if (request.method === "POST" || request.method === "PUT") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const result = await upsertEntity(env, "warehouses", tenantId, body);
            if (!result.ok) return badRequest(result.message);
            return json({ stored: true, id: result.id, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }
        if (request.method === "DELETE") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const id = normalizeId(url.searchParams.get("id"));
          if (!id) return badRequest("Warehouse id is required.");
          const deleted = await deleteEntity(env, "warehouses", tenantId, id);
          return json({ deleted, id, tenantId });
        }
        return badRequest("Unsupported method for /d1/warehouses");
      }
      case "/d1/user-alerts": {
        const tenantId = getTenantId(request, url);
        const principal = await getPrincipal(request, env);
        if (principal.kind === "admin") {
          if (request.method === "GET") return json({ alerts: [], tenantId, userId: "admin" });
          return json({ stored: false, skipped: true, reason: "admin has no personal stream alerts" });
        }
        if (principal.kind !== "user") return unauthorized();

        if (request.method === "GET") {
          const since = String(url.searchParams.get("since") ?? "").trim();
          const alerts = await readUserAlertsForUser(env, tenantId, principal.userId, since || undefined);
          return json({ alerts, tenantId, userId: principal.userId });
        }

        if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
          const parsed = await readJsonBody<{
            id?: string;
            alertId?: string;
            decision?: string;
            action?: string;
            note?: string;
            comment?: string;
          }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const alertId = String(parsed.value?.id ?? parsed.value?.alertId ?? "").trim();
          const decisionRaw = String(parsed.value?.decision ?? parsed.value?.action ?? "").trim().toLowerCase();
          const note = String(parsed.value?.note ?? parsed.value?.comment ?? "").trim();
          if (!alertId) return badRequest("Alert id is required.");
          if (decisionRaw !== "yes" && decisionRaw !== "no") {
            return badRequest("decision must be yes or no");
          }

          const actor = await env.VIVI_D1
            .prepare(`SELECT name, email FROM rbac_users WHERE id = ?1 LIMIT 1`)
            .bind(principal.userId)
            .first<{ name?: string; email?: string }>();
          const result = await actionUserAlertForUser(env, {
            tenantId,
            userId: principal.userId,
            alertId,
            decision: decisionRaw,
            note,
            actorName: String(actor?.name ?? "").trim() || "User",
            actorEmail: String(actor?.email ?? "").trim().toLowerCase()
          });
          if (!result.ok) return badRequest(result.error);
          return json({ stored: true, alert: result.alert, tenantId, userId: principal.userId });
        }

        return badRequest("Use GET or POST for user alerts.", 405);
      }

      case "/api/mobile/push-tokens": {
        // VIVI Mobile registers its FCM token on sign-in (POST) and forgets it on sign-out (DELETE).
        const result = await handlePushTokenRequest(env.ViviTEL, {
          method: request.method,
          principal: await getPrincipal(request, env),
          tenantId: getTenantId(request, url),
          body: await readJsonBody(request)
        });
        return json(result.body, { status: result.status });
      }

      case "/hos/rules": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const kv = {
          get: (key: string) => env.ViviTEL.get(key),
          put: (key: string, value: string) => env.ViviTEL.put(key, value)
        };
        if (request.method === "GET") {
          const rules = await readHosRules(kv, tenantId);
          return json({
            rules: rules ?? { jurisdiction: "eu_aetr", label: "EU / AETR (Reg. 561/2006)" },
            tenantId
          });
        }
        if (request.method === "PUT" || request.method === "POST") {
          const principal = await getPrincipal(request, env);
          if (principal.kind === "none") return unauthorized();
          const parsed = await readJsonBody<{ rules?: Record<string, unknown> }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const incoming = (parsed.value?.rules ?? parsed.value) as Record<string, unknown>;
          const saved = await writeHosRules(kv, tenantId, {
            jurisdiction: String(incoming?.jurisdiction ?? "eu_aetr") as any,
            label: String(incoming?.label ?? "").trim() || undefined,
            limits: (incoming?.limits && typeof incoming.limits === "object"
              ? (incoming.limits as Record<string, unknown>)
              : undefined),
            updatedBy: principal.kind === "user" ? principal.userId : "admin"
          });
          return json({ stored: true, rules: saved, tenantId });
        }
        return badRequest("Use GET or PUT for /hos/rules.", 405);
      }

      case "/hos/timeclock": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const kv = {
          get: (key: string) => env.ViviTEL.get(key),
          put: (key: string, value: string) => env.ViviTEL.put(key, value)
        };
        if (request.method === "GET") {
          const since = String(url.searchParams.get("since") ?? "").trim();
          const punches = await readHosPunches(kv, tenantId, since || undefined);
          return json({ punches, tenantId });
        }
        if (request.method === "POST") {
          const principal = await getPrincipal(request, env);
          if (principal.kind === "none") return unauthorized();
          const parsed = await readJsonBody<{
            driverKey?: string;
            driverName?: string;
            status?: string;
            note?: string;
            at?: string;
          }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const driverKey = String(parsed.value?.driverKey ?? "").trim();
          const driverName = String(parsed.value?.driverName ?? "").trim() || driverKey;
          const status = String(parsed.value?.status ?? "").trim().toLowerCase();
          if (!driverKey) return badRequest("driverKey is required");
          if (!["driving", "on_duty", "break", "off_duty", "sleeper"].includes(status)) {
            return badRequest("status must be driving, on_duty, break, off_duty, or sleeper");
          }
          const punch = await appendHosPunch(kv, tenantId, {
            id: uuid(),
            driverKey,
            driverName,
            status,
            at: String(parsed.value?.at ?? "").trim() || new Date().toISOString(),
            note: String(parsed.value?.note ?? "").trim() || undefined,
            createdBy: principal.kind === "user" ? principal.userId : "admin"
          });
          return json({ stored: true, punch, tenantId });
        }
        return badRequest("Use GET or POST for /hos/timeclock.", 405);
      }

      case "/hos/alerts": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        const tenantId = getTenantId(request, url);
        if (!tenantId) return badRequest("tenant is required (x-tenant-id or ?tenant=)");
        const kv = {
          get: (key: string) => env.ViviTEL.get(key),
          put: (key: string, value: string) => env.ViviTEL.put(key, value)
        };
        if (request.method === "GET") {
          const alerts = await readHosAlerts(kv, tenantId);
          return json({ alerts, tenantId });
        }
        if (request.method === "POST" || request.method === "PUT") {
          const parsed = await readJsonBody<{
            id?: string;
            driverKey?: string;
            driverName?: string;
            type?: string;
            severity?: string;
            message?: string;
            time?: string;
            status?: string;
            atMs?: number;
          }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const id = String(parsed.value?.id ?? "").trim();
          if (!id) return badRequest("id is required");
          const statusRaw = String(parsed.value?.status ?? "open").trim().toLowerCase();
          if (!["open", "acknowledged", "resolved"].includes(statusRaw)) {
            return badRequest("status must be open, acknowledged, or resolved");
          }
          const alert = await upsertHosAlert(kv, tenantId, {
            id,
            driverKey: String(parsed.value?.driverKey ?? "").trim(),
            driverName: String(parsed.value?.driverName ?? "").trim(),
            type: String(parsed.value?.type ?? "").trim(),
            severity: String(parsed.value?.severity ?? "medium").trim(),
            message: String(parsed.value?.message ?? "").trim(),
            time: String(parsed.value?.time ?? "").trim() || new Date().toISOString(),
            status: statusRaw as "open" | "acknowledged" | "resolved",
            atMs: Number(parsed.value?.atMs) || Date.now()
          });
          return json({ stored: true, alert, tenantId });
        }
        return badRequest("Use GET or POST for /hos/alerts.", 405);
      }

      case "/d1/alerts": {
        const tenantId = getTenantId(request, url);
        const principal = await getPrincipal(request, env);
        if (principal.kind === "admin") {
          if (request.method === "GET") return json({ alerts: [], tenantId, userId: "admin" });
          return json({ stored: false, skipped: true, reason: "admin has no personal alert rules" });
        }
        if (principal.kind !== "user") return unauthorized();
        const alertRulesKv = {
          get: (key: string) => env.ViviTEL.get(key),
          set: async (key: string, value: string) => {
            await env.ViviTEL.put(key, value);
          }
        };
        if (request.method === "GET") {
          const alerts = await readUserAlertRules(alertRulesKv, tenantId, principal.userId);
          return json({ alerts, tenantId, userId: principal.userId });
        }
        if (request.method === "POST" || request.method === "PUT") {
          const parsed = await readJsonBody<Record<string, unknown>>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const result = await upsertUserAlertRule(
            alertRulesKv,
            tenantId,
            principal.userId,
            parsed.value,
            () => uuid()
          );
            if (!result.ok) return badRequest(result.message);
          return json({ stored: true, id: result.id, tenantId, userId: principal.userId });
        }
        if (request.method === "DELETE") {
          const id = normalizeId(url.searchParams.get("id"));
          if (!id) return badRequest("Alert id is required.");
          const deleted = await deleteUserAlertRule(alertRulesKv, tenantId, principal.userId, id);
          return json({ deleted, id, tenantId, userId: principal.userId });
        }
        return badRequest("Unsupported method for /d1/alerts");
      }
      case "/d1/infohub-notifications": {
        const tenantId = getTenantId(request, url);
        const principal = await getPrincipal(request, env);
        if (principal.kind !== "admin" && principal.kind !== "user") return unauthorized();
        const historyUserId = principal.kind === "admin" ? "admin" : principal.userId;
        await env.VIVI_D1.prepare(
          "CREATE TABLE IF NOT EXISTS user_settings_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"
        ).run();
        const readBody = async (site: string) => {
          const siteToken = site.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "_none";
          const key = `vivi:infohub-notifications:${tenantId}:${historyUserId}:${siteToken}`;
          const row = await env.VIVI_D1.prepare("SELECT value FROM user_settings_kv WHERE key = ?")
            .bind(key)
            .first<{ value: string }>();
          let items: Array<Record<string, unknown>> = [];
          try {
            const parsed = row?.value ? JSON.parse(row.value) : [];
            if (Array.isArray(parsed)) items = parsed;
          } catch {
            items = [];
          }
          return { key, items };
        };
        if (request.method === "GET") {
          const site = String(url.searchParams.get("site") ?? "").trim();
          const { items } = await readBody(site);
          return json({ site, notifications: items, tenantId, userId: historyUserId });
        }
        if (request.method === "POST" || request.method === "PUT") {
          const parsed = await readJsonBody<Record<string, unknown>>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const site = String(parsed.value.site ?? "").trim();
          if (!site) return badRequest("site is required");
          const incoming = Array.isArray(parsed.value.notifications)
            ? (parsed.value.notifications as Array<Record<string, unknown>>)
            : [];
          const { key, items } = await readBody(site);
          const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const byId = new Map<string, Record<string, unknown>>();
          for (const item of [...items, ...incoming]) {
            const id = String(item?.id ?? "").trim();
            if (!id) continue;
            byId.set(id, { ...(byId.get(id) ?? {}), ...item });
          }
          const merged = Array.from(byId.values())
            .filter((item) => {
              const ts = Number(item.timestamp);
              return !Number.isFinite(ts) || ts >= cutoff;
            })
            .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))
            .slice(0, 500);
          await env.VIVI_D1.prepare(
            "INSERT INTO user_settings_kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
          )
            .bind(key, JSON.stringify(merged), new Date().toISOString())
            .run();
          return json({ stored: true, count: merged.length, notifications: merged });
        }
        return badRequest("Unsupported method for /d1/infohub-notifications");
      }
      case "/d1/infohub-streams": {
        const tenantId = getTenantId(request, url);
        const principal = await getPrincipal(request, env);
        if (principal.kind !== "admin" && principal.kind !== "user") return unauthorized();
        const streamUserId = principal.kind === "admin" ? "admin" : principal.userId;
        // No KV namespace is bound in production, so persist in D1 (account-wide, any machine).
        await env.VIVI_D1.prepare(
          "CREATE TABLE IF NOT EXISTS user_settings_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"
        ).run();
        const streamKv = {
          get: async (key: string) => {
            const row = await env.VIVI_D1.prepare("SELECT value FROM user_settings_kv WHERE key = ?")
              .bind(key)
              .first<{ value: string }>();
            return row?.value ?? null;
          },
          put: async (key: string, value: string) => {
            await env.VIVI_D1.prepare(
              "INSERT INTO user_settings_kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
            )
              .bind(key, value, new Date().toISOString())
              .run();
          }
        };
        if (request.method === "GET") {
          const site = String(url.searchParams.get("site") ?? "").trim();
          const monitor = await readInfoHubStreamMonitor(streamKv, tenantId, streamUserId);
          if (site) {
            const token = site.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "_none";
            return json({
              site,
              siteMonitor: monitor.bySite?.[token] ?? null,
              monitor,
              tenantId,
              userId: streamUserId
            });
          }
          return json({ monitor, tenantId, userId: streamUserId });
        }
        if (request.method === "POST" || request.method === "PUT") {
          const parsed = await readJsonBody<Record<string, unknown>>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const site = String(parsed.value.site ?? "").trim();
          if (!site) return badRequest("site is required");
          const siteMonitor = (parsed.value.siteMonitor ?? parsed.value) as InfoHubSiteStreamMonitor;
          const monitor = await upsertInfoHubSiteStreamMonitor(
            streamKv,
            tenantId,
            streamUserId,
            site,
            {
              customStreams: Array.isArray(siteMonitor.customStreams) ? siteMonitor.customStreams : [],
              preferences:
                siteMonitor.preferences && typeof siteMonitor.preferences === "object"
                  ? siteMonitor.preferences
                  : {},
              monitoredTypes: Array.isArray(siteMonitor.monitoredTypes)
                ? siteMonitor.monitoredTypes.map((item) => String(item ?? "").trim()).filter(Boolean)
                : [],
              monitoredLabels: Array.isArray(siteMonitor.monitoredLabels)
                ? siteMonitor.monitoredLabels.map((item) => String(item ?? "").trim()).filter(Boolean)
                : []
            }
          );
          return json({ stored: true, monitor, tenantId, userId: streamUserId, site });
        }
        return badRequest("Unsupported method for /d1/infohub-streams");
      }
      case "/d1/bindings": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);
        const type = (url.searchParams.get("type") ?? "").trim().toLowerCase();
        const allowed = ["notifications", "locations", "devices"];
        if (!allowed.includes(type)) return badRequest("type must be notifications, locations, or devices");

        if (request.method === "GET") {
          const payload = await withDbCache(
            workerListCacheStore(env),
            workerBindingsCacheKey(tenantId, type),
            WORKER_LIST_CACHE_TTL_SEC,
            async () => {
          const result = await env.VIVI_D1.prepare(
            "SELECT id, data, updated_at FROM bindings WHERE tenant_id = ? AND type = ? ORDER BY updated_at DESC"
          )
            .bind(tenantId, type)
            .all();
          const bindingsRaw = (result.results ?? [])
            .map((row) => {
              try {
                const parsed = JSON.parse(String(row.data)) as Record<string, unknown>;
                const dbId = String((row as any).id ?? "").trim();
                if (dbId) parsed.id = dbId;
                return parsed;
              } catch {
                return null;
              }
            })
            .filter(Boolean) as Record<string, unknown>[];
          const dedupeKey = (rec: Record<string, unknown>) => bindingSiteDedupeKey(type, rec);
          const byKey = new Map<string, Record<string, unknown>>();
          for (const item of bindingsRaw) {
            const key = dedupeKey(item);
            if (!key) continue;
            const prev = byKey.get(key);
            if (!prev) {
              byKey.set(key, item);
              continue;
            }
            const prevN = Array.isArray((prev as any).monitoredEvents) ? (prev as any).monitoredEvents.length : 0;
            const nextN = Array.isArray((item as any).monitoredEvents) ? (item as any).monitoredEvents.length : 0;
            byKey.set(key, nextN >= prevN ? item : prev);
          }
          const bindings = [...byKey.values()];
          return { bindings, tenantId, type };
            }
          );
          return json(payload);
        }

        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const siteError = validateBindingSiteAnchor(type, body, tenantId);
            if (siteError) return badRequest(siteError);
            const id = String(body.id ?? "").trim();
            if (!id) return badRequest("Binding id is required.");
            const now = new Date().toISOString();
            await env.VIVI_D1.prepare(
              "INSERT INTO bindings (id, tenant_id, type, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id, tenant_id, type) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
            )
              .bind(id, tenantId, type, JSON.stringify(body), now)
              .run();
            if (type === "notifications") {
              const name = String(body.name ?? "").trim().toLowerCase();
              const site = String(body.site ?? "").trim().toLowerCase();
              if (name) {
                const siblings = await env.VIVI_D1.prepare(
                  "SELECT id, data FROM bindings WHERE tenant_id = ?1 AND type = ?2"
                )
                  .bind(tenantId, type)
                  .all();
                for (const row of siblings.results ?? []) {
                  const rowId = String((row as any).id ?? "").trim();
                  if (!rowId || rowId === id) continue;
                  try {
                    const parsed = JSON.parse(String((row as any).data ?? "{}")) as Record<string, unknown>;
                    const rowName = String(parsed.name ?? "").trim().toLowerCase();
                    const rowSite = String(parsed.site ?? "").trim().toLowerCase();
                    if (rowName === name && rowSite === site) {
                      await env.VIVI_D1.prepare(
                        "DELETE FROM bindings WHERE id = ?1 AND tenant_id = ?2 AND type = ?3"
                      )
                        .bind(rowId, tenantId, type)
                        .run();
                    }
                  } catch {
                    // ignore
                  }
                }
              }
            }
            if (type === "notifications") {
              try {
                const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
                await env.VIVI_D1.prepare(
                  "INSERT INTO notification_sync_jobs (job_id, tenant_id, binding_id, operation, payload, status, error, last_attempt_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
                )
                  .bind(jobId, tenantId, id, "upsert", JSON.stringify(body), "pending", "", "", now, now)
                  .run();
              } catch {
                // Keep writes available even if sync queue insert fails.
              }
            }
            await invalidateBindingsListCache(env, tenantId, type);
            return json({ stored: true, id, tenantId, type });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        if (request.method === "DELETE") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const purge = url.searchParams.get("purge") === "1";
          if (purge) {
            const result = await env.VIVI_D1.prepare(
              "DELETE FROM bindings WHERE tenant_id = ?1 AND type = ?2"
            )
              .bind(tenantId, type)
              .run();
            const deleted = Number((result as any)?.meta?.changes ?? 0) || 0;
            await invalidateBindingsListCache(env, tenantId, type);
            return json({ purged: true, deleted, tenantId, type });
          }
          const id = normalizeId(url.searchParams.get("id"));
          if (!id) return badRequest("Binding id is required.");
          const now = new Date().toISOString();
          const result = await env.VIVI_D1.prepare(
            "DELETE FROM bindings WHERE id = ?1 AND tenant_id = ?2 AND type = ?3"
          )
            .bind(id, tenantId, type)
            .run();
          if (type === "notifications") {
            try {
              const payload = JSON.stringify({ id, deleted: true });
              const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
              await env.VIVI_D1.prepare(
                "INSERT INTO notification_sync_jobs (job_id, tenant_id, binding_id, operation, payload, status, error, last_attempt_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
              )
                .bind(jobId, tenantId, id, "delete", payload, "pending", "", "", now, now)
                .run();
            } catch {
              // Keep deletes available even if sync queue insert fails.
            }
          }
          const deleted = Boolean((result as any)?.meta?.changes ?? 0);
          await invalidateBindingsListCache(env, tenantId, type);
          return json({ deleted, id, tenantId, type });
        }

        return badRequest("Unsupported method for /d1/bindings");
      }
      case "/admin/device-artifacts": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        if (!env.STORAGE_BUCKET) return serviceUnavailable({ error: "Storage bucket not configured." });
        try {
          const tenantId = getTenantId(request, url);
          const body = (await request.json()) as Record<string, unknown>;
          const type = String(body.type ?? "").trim().toLowerCase() as DeviceArtifactType;
          if (type !== "firmware" && type !== "config") return badRequest("type must be firmware or config");
          const name = String(body.name ?? "").trim();
          const version = String(body.version ?? "").trim();
          const contentBase64 = String(body.contentBase64 ?? "").trim();
          const contentType = String(body.contentType ?? "application/octet-stream").trim();
          const isBase = Boolean(body.isBase ?? true);
          if (!name || !version || !contentBase64) return badRequest("name, version, and contentBase64 are required.");
          const id = uuid();
          const bytes = decodeBase64(contentBase64);
          if (!bytes.length) return badRequest("contentBase64 is invalid.");
          const sha256 = await sha256Hex(bytes);
          const r2Key = `device-artifacts/${tenantId}/${type}/${id}`;
          await env.STORAGE_BUCKET.put(r2Key, bytes, { httpMetadata: { contentType } });
          const now = new Date().toISOString();
          await ensureD1Tables(env);
          await env.VIVI_D1.prepare(
            "INSERT INTO device_artifacts (id, tenant_id, type, name, version, r2_key, content_type, sha256, is_base, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
          )
            .bind(id, tenantId, type, name, version, r2Key, contentType, sha256, isBase ? 1 : 0, now)
            .run();
          return json({ stored: true, id, tenantId, type, sha256, isBase });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      }
      case "/admin/mitac-software": {
        // Replacing the pack is admin-only: service/admin keys or an admin session, not user sessions.
        const uploaderKey = request.headers.get("x-api-key")?.trim() ?? "";
        const serviceKeys = [env.API_KEY, env.API_KEY_PERMANENT, env.ADMIN_API_KEY]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean);
        const isAdminUploader =
          Boolean(uploaderKey) &&
          (serviceKeys.includes(uploaderKey) || (await validateAdminSession(env, uploaderKey).catch(() => false)));
        if (!isAdminUploader) return unauthorized();
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        // The pack lives on the VPS disk (device-artifacts); the worker has no storage for it.
        try {
          const proxied = await proxyOperationalRequestToVps(request, env, { useServiceKey: true });
          if (proxied) return proxied;
        } catch (err: any) {
          return json({ error: "Origin server unavailable", message: String(err?.message ?? err ?? "") }, { status: 502 });
        }
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const contentBase64 = String(body.contentBase64 ?? "").trim();
          if (!contentBase64) return badRequest("contentBase64 is required.");
          const bytes = decodeBase64(contentBase64);
          if (!bytes.length) return badRequest("contentBase64 is invalid.");
          let storedInR2 = false;
          if (env.STORAGE_BUCKET) {
            await env.STORAGE_BUCKET.put(MITAC_SOFTWARE_R2_KEY, bytes, {
              httpMetadata: { contentType: MITAC_SOFTWARE_CONTENT_TYPE }
            });
            storedInR2 = true;
          }
          const storedInB2 = await b2UploadBytesByName(env, MITAC_SOFTWARE_R2_KEY, bytes, MITAC_SOFTWARE_CONTENT_TYPE, "default");
          if (!storedInR2 && !storedInB2) {
            return serviceUnavailable({ error: "No storage backend configured for Mitac software." });
          }
          return json({
            stored: true,
            storage: storedInR2 && storedInB2 ? "r2+b2" : storedInR2 ? "r2" : "b2",
            key: MITAC_SOFTWARE_R2_KEY,
            bytes: bytes.length,
            downloadUrl: "/downloads/mitac-software"
          });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      }
      case "/downloads/mitac-software": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "GET") return badRequest("Use GET.");
        try {
          const proxied = await proxyOperationalRequestToVps(request, env, { useServiceKey: true });
          if (proxied && proxied.status !== 404) return proxied;
        } catch {
          // Fall through to bucket storage below.
        }
        if (env.STORAGE_BUCKET) {
          const obj = await env.STORAGE_BUCKET.get(MITAC_SOFTWARE_R2_KEY);
          if (obj) {
            return new Response(obj.body, {
              headers: {
                ...mitacSoftwareDownloadHeaders(),
                "content-type": obj.httpMetadata?.contentType ?? MITAC_SOFTWARE_CONTENT_TYPE,
                "content-disposition": `attachment; filename="${MITAC_SOFTWARE_FILENAME}"`,
                ...(obj.size ? { "content-length": String(obj.size) } : {}),
                "access-control-allow-origin": "*"
              }
            });
          }
        }
        const b2File = await b2DownloadFileByName(env, MITAC_SOFTWARE_R2_KEY);
        if (b2File) {
          return new Response(b2File.body, {
            headers: {
              ...mitacSoftwareDownloadHeaders(),
              "content-type": b2File.contentType ?? MITAC_SOFTWARE_CONTENT_TYPE,
              "content-disposition": `attachment; filename="${MITAC_SOFTWARE_FILENAME}"`,
              ...(b2File.size ? { "content-length": String(b2File.size) } : {}),
              "access-control-allow-origin": "*"
            }
          });
        }
        return json({ error: "Mitac software package not found" }, { status: 404 });
      }
      case "/device/artifacts": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "GET") return badRequest("Use GET.");
        const tenantId = getTenantId(request, url);
        const type = (url.searchParams.get("type") ?? "").trim().toLowerCase() as DeviceArtifactType;
        if (type !== "firmware" && type !== "config") return badRequest("type must be firmware or config");
        const artifact = await getBaseArtifact(env, tenantId, type);
        if (!artifact) return json({ artifact: null, tenantId, type });
        return json({
          artifact: {
            id: artifact.id,
            name: artifact.name,
            version: artifact.version,
            sha256: artifact.sha256,
            downloadUrl: `/device/artifacts/${artifact.id}`
          },
          tenantId,
          type
        });
      }
      case "/device/settings": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "GET") return badRequest("Use GET.");
        const tenantId = getTenantId(request, url);
        const imei = (url.searchParams.get("imei") ?? "").trim();
        if (!imei) return badRequest("imei is required.");
        const result = await buildDeviceSettingsPayload(env, tenantId, imei);
        if (!result.ok) return badRequest(result.message);
        return json({ settings: result.payload, tenantId, imei });
      }
      case "/device/push-settings": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        try {
          const tenantId = getTenantId(request, url);
          const body = (await request.json()) as Record<string, unknown>;
          const imei = String(body.imei ?? "").trim();
          if (!imei) return badRequest("imei is required.");
          const build = await buildDeviceSettingsPayload(env, tenantId, imei);
          if (!build.ok) return badRequest(build.message);
          const overridePayload = body.payload;
          const settingsPayload =
            isRecordObject(overridePayload)
              ? mergeDeviceSettingsPayload(build.payload as Record<string, unknown>, overridePayload)
              : build.payload;
          const assetId = String((settingsPayload as any)?.asset?.id ?? (build.payload.asset as any)?.id ?? "");
          const now = new Date().toISOString();
          const id = uuid();
          await ensureD1Tables(env);
          await env.VIVI_D1.prepare(
            "INSERT INTO device_push_queue (id, tenant_id, imei, asset_id, status, payload, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
          )
            .bind(id, tenantId, imei, assetId, "queued", JSON.stringify(settingsPayload), now, now)
            .run();
          return json({ queued: true, id, tenantId, imei });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      }
      case "/device/decommission": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        const tenantId = getTenantId(request, url);
        const access = await requireRbacPermission(request, env, tenantId, "/Track/fleet/assets", "edit");
        if (access) return access;
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const assetId = String(body.assetId ?? body.id ?? "").trim();
          const imei = String(body.imei ?? "").trim();
          if (!assetId && !imei) return badRequest("assetId or imei is required.");
          await ensureD1Tables(env);
          const result = await decommissionDeviceForTenant(env, tenantId, { assetId, imei });
          if (!result.ok) {
            return json({ decommissioned: false, error: result.message, tenantId }, { status: result.status });
          }
          return json({
            decommissioned: true,
            tenantId,
            asset: result.asset,
            traccar: result.traccar,
            purged: result.purged,
            traccarDeleteQueued: Boolean(result.traccarDeleteQueued)
          });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      }
      case "/device/kick-avl": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");

        try {
          const tenantId = getTenantId(request, url);
          const body = (await request.json()) as Record<string, unknown>;
          const imei = String(body.imei ?? body.uniqueId ?? "").trim();
          const commandText = String(body.command ?? env.TRACCAR_KICK_COMMAND ?? "getinfo").trim() || "getinfo";
          if (!imei) return badRequest("imei is required");

          const traccarBase = String(env.TRACCAR_BASE_URL ?? "").trim();
          const traccarToken = String(env.TRACCAR_TOKEN ?? "").trim();
          const traccarUser = String(env.TRACCAR_USERNAME ?? "").trim();
          const traccarPass = String(env.TRACCAR_PASSWORD ?? "").trim();
          if (!traccarBase) {
            return json({
              queued: false,
              skipped: true,
              error: "Traccar not configured",
              hint: "Set TRACCAR_BASE_URL (+ auth)",
              tenantId,
              imei,
              command: commandText
            });
          }
          if (!traccarToken && !(traccarUser && traccarPass)) {
            return json({
              queued: false,
              skipped: true,
              error: "Traccar auth not configured",
              hint: "Set TRACCAR_TOKEN or TRACCAR_USERNAME/TRACCAR_PASSWORD",
              tenantId,
              imei,
              command: commandText
            });
          }

          const findDeviceByImei = async () => {
            // Prefer targeted lookup — full /devices?all=true often trips Worker subrequest / upstream limits.
            const byUnique = await traccarFetch(env, `/api/devices?uniqueId=${encodeURIComponent(imei)}`);
            if (byUnique.ok && Array.isArray(byUnique.body)) {
              const match =
                (byUnique.body as any[]).find((d) => String(d?.uniqueId ?? "").trim() === imei) ??
                (byUnique.body as any[])[0] ??
                null;
              if (match) return { device: match, listError: null as string | null };
            }
            const allResp = await traccarFetch(env, "/api/devices?all=true");
            if (!allResp.ok) {
              return {
                device: null,
                listError: String((allResp.body as any)?.message ?? (allResp.body as any)?.error ?? `HTTP ${allResp.status}`)
              };
            }
            const devices = Array.isArray(allResp.body) ? (allResp.body as any[]) : [];
            const match = devices.find((d) => String(d?.uniqueId ?? "").trim() === imei) ?? null;
            return { device: match, listError: null as string | null };
          };

          let { device, listError } = await findDeviceByImei();

          // If the device is missing in Traccar, ensure/sync it from the VIVI asset then retry once.
          if (!device) {
            const assets = await findAssetsByImei(env, tenantId, imei);
            const asset = (assets[0] as Record<string, unknown> | undefined) ?? { imei };
            const synced = await syncDeviceJobToTraccar(env, { ...asset, imei }, tenantId);
            if (synced.synced) {
              const again = await findDeviceByImei();
              device = again.device;
              listError = again.listError;
            } else if (!listError && synced.traccarError) {
              listError = synced.traccarError;
            }
          }

          if (!device && listError) {
            return json({
              queued: false,
              error: "Failed to list Traccar devices",
              details: listError,
              tenantId,
              imei,
              command: commandText
            });
          }
          if (!device) {
            return json({
              queued: false,
              skipped: true,
              error: "Traccar device not found for IMEI",
              tenantId,
              imei,
              command: commandText
            });
          }

          const deviceId = Number((device as any).id);
          if (!Number.isFinite(deviceId)) {
            return json({
              queued: false,
              error: "Invalid Traccar device id",
              tenantId,
              imei,
              command: commandText,
              device
            });
          }

          const payload = {
            deviceId,
            type: "custom",
            attributes: { data: commandText }
          };
          const sendResp = await traccarFetch(env, "/api/commands/send", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (!sendResp.ok) {
            // Some Traccar builds accept /api/commands instead of /api/commands/send.
            const altResp = await traccarFetch(env, "/api/commands", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload)
            });
            if (!altResp.ok) {
              return json({
                queued: false,
                error: "Traccar command send failed",
                imei,
                deviceId,
                command: commandText,
                body: sendResp.body ?? altResp.body
              });
            }
            return json({
              queued: true,
              tenantId,
              imei,
              deviceId,
              command: commandText,
              traccar: altResp.body
            });
          }

          return json({ queued: true, tenantId, imei, deviceId, command: commandText, traccar: sendResp.body });
        } catch (err: any) {
          return json(
            {
              queued: false,
              error: "Kick AVL failed",
              message: String(err?.message ?? err ?? "Invalid JSON body.")
            },
            { status: 400 }
          );
        }
      }
      case "/device/pending-settings": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "GET") return badRequest("Use GET.");
        const tenantId = getTenantId(request, url);
        const imei = (url.searchParams.get("imei") ?? "").trim();
        if (!imei) return badRequest("imei is required.");
        await ensureD1Tables(env);
        const result = await env.VIVI_D1.prepare(
          "SELECT id, payload, created_at FROM device_push_queue WHERE tenant_id = ? AND imei = ? AND status = 'queued' ORDER BY created_at DESC LIMIT 1"
        )
          .bind(tenantId, imei)
          .first();
        if (!result) return json({ pending: null, tenantId, imei });
        let payload: Record<string, unknown> | null = null;
        try {
          payload = JSON.parse(String((result as any).payload ?? ""));
        } catch {
          payload = null;
        }
        return json({ pending: { id: (result as any).id, payload, createdAt: (result as any).created_at }, tenantId, imei });
      }
      case "/device/ack-settings": {
        const auth = await requireApiKey(request, env);
        if (auth) return auth;
        if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
        try {
          const tenantId = getTenantId(request, url);
          const body = (await request.json()) as Record<string, unknown>;
          const id = String(body.id ?? "").trim();
          const imei = String(body.imei ?? "").trim();
          if (!id || !imei) return badRequest("id and imei are required.");
          const now = new Date().toISOString();
          await ensureD1Tables(env);
          const result = await env.VIVI_D1.prepare(
            "UPDATE device_push_queue SET status = 'delivered', updated_at = ? WHERE tenant_id = ? AND id = ? AND imei = ?"
          )
            .bind(now, tenantId, id, imei)
            .run();
          return json({ delivered: (result.meta?.changes ?? 0) > 0, id, tenantId, imei });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      }
      case "/kv":
        return badRequest("Provide a key, e.g. /kv/demo");
      default: {
        if (url.pathname === "/b2/libraries/routes" || url.pathname === "/libraries/routes") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const tenantId = getTenantId(request, url);
          if (!tenantId) return badRequest("Tenant is required.");

          if (request.method === "GET") {
            const site = String(url.searchParams.get("site") ?? "").trim();
            if (!site) return badRequest("site query parameter is required.");
            const b2Key = buildRoutesLibraryB2Key(tenantId, site);
            const kvKey = legacyRoutesLibraryKvKey(tenantId, site);
            let raw = await b2ReadTextByName(env, b2Key);
            let source: "b2" | "vps" | "kv" | "kv-migrated" | "empty" = "empty";

            if (raw) {
              source = "b2";
            } else {
              raw = await readRouteLibraryFromVps(env, tenantId, site);
              if (raw) source = "vps";
            }

            if (!raw) {
              const kvRaw = await kvGetSafe(env, kvKey);
              if (kvRaw) {
                raw = kvRaw;
                source = "kv";
                const bytes = new TextEncoder().encode(kvRaw);
                ctx.waitUntil(
                  (async () => {
                    if (b2ArchiveEnabled(env)) {
                      await b2UploadBytesByName(env, b2Key, bytes, "application/json", "track");
                    }
                    await writeRouteLibraryToVps(env, tenantId, site, kvRaw);
                  })()
                );
              }
            } else if (source === "vps" && b2ArchiveEnabled(env)) {
              const bytes = new TextEncoder().encode(raw);
              ctx.waitUntil(b2UploadBytesByName(env, b2Key, bytes, "application/json", "track"));
            }

            if (!raw) {
              return json({
                ok: true,
                items: [],
                site,
                tenantId,
                source,
                at: new Date().toISOString()
              });
            }

            try {
              const parsed = JSON.parse(raw) as { items?: unknown[]; updatedAt?: string };
              const items = Array.isArray(parsed?.items) ? parsed.items : [];
              return json({
                ok: true,
                items,
                updatedAt: parsed?.updatedAt,
                site,
                tenantId,
                source,
                at: new Date().toISOString()
              });
            } catch {
              return json({
                ok: true,
                items: [],
                site,
                tenantId,
                source: "empty",
                warning: "Corrupt route archive ignored.",
                at: new Date().toISOString()
              });
            }
          }

          if (request.method === "PUT" || request.method === "POST") {
            const parsed = await readJsonBody<{
              site?: string;
              items?: unknown[];
              updatedAt?: string;
            }>(request);
            if (!parsed.ok) return badRequest(parsed.error);
            const site = String(parsed.value?.site ?? url.searchParams.get("site") ?? "").trim();
            if (!site) return badRequest("site is required.");
            const items = Array.isArray(parsed.value?.items) ? parsed.value!.items : [];
            const payload = {
              items,
              site,
              tenantId,
              updatedAt: String(parsed.value?.updatedAt ?? "").trim() || new Date().toISOString()
            };
            const payloadText = JSON.stringify(payload);
            const b2Key = buildRoutesLibraryB2Key(tenantId, site);
            const kvKey = legacyRoutesLibraryKvKey(tenantId, site);
            const bytes = new TextEncoder().encode(payloadText);

            let storedInB2 = false;
            if (b2ArchiveEnabled(env)) {
              storedInB2 = await b2UploadBytesByName(env, b2Key, bytes, "application/json", "track");
            }
            const storedVps = await writeRouteLibraryToVps(env, tenantId, site, payloadText);

            if (!storedInB2 && !storedVps) {
              return json(
                { ok: false, error: "Unable to save the route right now. Please try again in a moment." },
                { status: 503 }
              );
            }

            return json({
              ok: true,
              stored: true,
              count: items.length,
              site,
              tenantId,
              key: b2Key,
              updatedAt: payload.updatedAt
            });
          }

          return badRequest("Use GET, PUT, or POST for /libraries/routes", 405);
        }

        if (url.pathname === "/b2/hierarchy/assign") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const tenantId = await resolveTenantId(request, url, env);
          const actor = await readRbacActorContext(request, env, tenantId);
          if (!actor) return unauthorized();

          if (request.method === "GET") {
            const items = await readHierarchyAssignments(env, tenantId);
            return json({ items, tenantId });
          }

          if (request.method === "POST") {
            const parsed = await readJsonBody<HierarchyAssignment>(request);
            if (!parsed.ok) return badRequest(parsed.error);
            const scope = String(parsed.value?.scope ?? "").trim() as HierarchyAssignment["scope"];
            const targetId = normalizeId(parsed.value?.targetId);
            const targetLabel = String(parsed.value?.targetLabel ?? "").trim();
            const userName = String(parsed.value?.userName ?? "").trim();
            const userEmail = String(parsed.value?.userEmail ?? "").trim().toLowerCase();
            if (!scope || !targetId || (!userName && !userEmail)) {
              return badRequest("scope, targetId and userName or userEmail are required");
            }
            if (!canActorManageHierarchySegment(actor, scope as HierarchySegment, "assign")) {
              return unauthorized();
            }
            const next: HierarchyAssignment = {
              scope,
              targetId,
              targetLabel,
              userName,
              userEmail,
              assignedByName: String(parsed.value?.assignedByName ?? "").trim() || undefined,
              assignedByEmail: String(parsed.value?.assignedByEmail ?? "").trim().toLowerCase() || undefined,
              createdAt: String(parsed.value?.createdAt ?? "").trim() || new Date().toISOString()
            };
            const items = await readHierarchyAssignments(env, tenantId);
            const index = items.findIndex((item) => item.scope === scope && item.targetId === targetId);
            if (index >= 0) items[index] = next;
            else items.unshift(next);
            await saveHierarchyAssignments(env, tenantId, items.slice(0, 1000));
            return json({ ok: true, assignment: next, tenantId });
          }

          if (request.method === "DELETE") {
            const parsed = await readJsonBody<{ scope?: string; targetId?: string; userEmail?: string }>(request);
            if (!parsed.ok) return badRequest(parsed.error);
            const scope = String(parsed.value?.scope ?? "").trim();
            const targetId = normalizeId(parsed.value?.targetId);
            const userEmail = String(parsed.value?.userEmail ?? "").trim().toLowerCase();
            if (!scope || !targetId) return badRequest("scope and targetId are required");
            if (!canActorManageHierarchySegment(actor, scope as HierarchySegment, "assign")) {
              return unauthorized();
            }
            const items = await readHierarchyAssignments(env, tenantId);
            const next = items.filter((item) => {
              if (item.scope !== scope || item.targetId !== targetId) return true;
              if (!userEmail) return false;
              return String(item.userEmail ?? "").trim().toLowerCase() !== userEmail;
            });
            await saveHierarchyAssignments(env, tenantId, next);
            return json({ ok: true, removed: items.length - next.length, tenantId });
          }

          return badRequest("Unsupported method for /b2/hierarchy/assign", 405);
        }

        if (url.pathname === "/b2/hierarchy" || url.pathname.startsWith("/b2/hierarchy/")) {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          const tenantId = await resolveTenantId(request, url, env);
          const actor = await readRbacActorContext(request, env, tenantId);
          if (!actor) return unauthorized();
          const segment = url.pathname.replace("/b2/hierarchy", "").replace(/^\/+/, "");

          if (segment === "sync") {
            if (request.method !== "POST") return badRequest("Use POST for /b2/hierarchy/sync");
            if (!(actor.isAdmin || actor.isTenantAdmin || actor.isOwnSupport)) {
              return unauthorized();
            }
            const parsed = await readJsonBody<{ dealers?: unknown }>(request);
            if (!parsed.ok) return badRequest(parsed.error);
            const incoming = normalizeHierarchyRoot(parsed.value ?? {});
            if (!incoming.dealers.length) return badRequest("dealers are required");
            const hierarchy = await saveHierarchy(env, tenantId, incoming, { mode: "merge" });
            return json({ ok: true, hierarchy, tenantId, merged: true });
          }

          if (!segment) {
            if (request.method !== "GET") return badRequest("Use GET for /b2/hierarchy");
            const actorSeesFullHierarchy =
              actor.isAdmin || actor.isTenantAdmin || actor.isOwnSupport || actor.isImpersonating;
            const hierarchy = filterHierarchyForRegion(await readHierarchy(env, tenantId), resolveRequestRegion(request));
            if (actorSeesFullHierarchy) return json(hierarchy);
            const siteRefs = actor.userId ? await readAllAssignedSiteRefsForUser(env, actor.userId) : [];
            const hierarchySiteIds = siteRefs.map((row) => row.siteId).filter(Boolean);
            const hierarchySiteNames = siteRefs.map((row) => String(row.siteName ?? "").trim()).filter(Boolean);
            return json(
              filterHierarchyForTenantScope(
                hierarchy,
                tenantId,
                hierarchySiteIds.length ? hierarchySiteIds : actor.siteIds,
                actor.roleNames,
                false,
                actor.allowedTenants.length ? actor.allowedTenants : tenantId ? [tenantId] : [],
                hierarchySiteNames
              )
            );
          }

          const validTypes = new Set(["dealer", "organisation", "database", "site"]);
          if (!validTypes.has(segment)) return notFound();
          const hierarchySegment = segment as "dealer" | "organisation" | "database" | "site";

          if (request.method === "DELETE") {
            if (!canActorManageHierarchySegment(actor, hierarchySegment, "delete")) return unauthorized();
            const id = normalizeId(url.searchParams.get("id"));
            if (!id) return badRequest("id is required");
            const parentId = normalizeId(url.searchParams.get("parentId"));
            const hierarchy = await readHierarchy(env, tenantId);
            const removedSites: HierarchySite[] = [];

            if (segment === "dealer") {
              const idx = hierarchy.dealers.findIndex((dealer) => dealer.id === id);
              if (idx === -1) return notFound();
              removedSites.push(...sitesInDealer(hierarchy.dealers[idx]));
              for (const org of hierarchy.dealers[idx].organisations) {
                for (const db of org.databases) {
                  for (const site of db.sites) {
                    if (site.traccarGroupId) {
                      await traccarFetch(env, `/api/groups/${site.traccarGroupId}`, { method: "DELETE" });
                    }
                  }
                }
              }
              hierarchy.dealers.splice(idx, 1);
            } else if (segment === "organisation") {
              // The same id can be duplicated under several parents; remove every copy in scope.
              let matched = false;
              for (const dealer of hierarchy.dealers) {
                if (parentId && dealer.id !== parentId) continue;
                const org = dealer.organisations.find((item) => item.id === id);
                if (!org) continue;
                matched = true;
                for (const db of org.databases) removedSites.push(...db.sites);
                dealer.organisations = dealer.organisations.filter((item) => item.id !== id);
              }
              if (!matched) return notFound();
            } else if (segment === "database") {
              let matched = false;
              for (const dealer of hierarchy.dealers) {
                for (const org of dealer.organisations) {
                  if (parentId && org.id !== parentId) continue;
                  const db = org.databases.find((item) => item.id === id);
                  if (!db) continue;
                  matched = true;
                  removedSites.push(...db.sites);
                  org.databases = org.databases.filter((item) => item.id !== id);
                }
              }
              if (!matched) return notFound();
            } else if (segment === "site") {
              let matched = false;
              for (const dealer of hierarchy.dealers) {
                for (const org of dealer.organisations) {
                  for (const db of org.databases) {
                    if (parentId && db.id !== parentId) continue;
                    const site = db.sites.find((item) => item.id === id);
                    if (!site) continue;
                    if (!actorCanAccessSiteTarget(actor, site.id)) return unauthorized();
                    matched = true;
                    removedSites.push(site);
                    db.sites = db.sites.filter((item) => item.id !== id);
                  }
                }
              }
              if (!matched) return notFound();
            }

            if (segment !== "dealer") {
              // Keep Traccar groups still used by a surviving site.
              const survivingGroupIds = new Set<number>();
              for (const dealer of hierarchy.dealers) {
                for (const site of sitesInDealer(dealer)) {
                  const groupId = Number(site.traccarGroupId ?? 0);
                  if (groupId > 0) survivingGroupIds.add(groupId);
                }
              }
              const deletedGroupIds = new Set<number>();
              for (const site of removedSites) {
                const groupId = Number(site.traccarGroupId ?? 0);
                if (groupId > 0 && !survivingGroupIds.has(groupId) && !deletedGroupIds.has(groupId)) {
                  deletedGroupIds.add(groupId);
                  await traccarFetch(env, `/api/groups/${groupId}`, { method: "DELETE" });
                }
              }
            }

            await removeGpsIotClientsForSites(request, env, removedSites);
            await saveHierarchy(env, tenantId, hierarchy);
            return json({ ok: true, id, type: segment, hierarchy, tenantId });
          }

          if (request.method === "PUT") {
            if (!canActorManageHierarchySegment(actor, hierarchySegment, "edit")) return unauthorized();
            const parsed = await readJsonBody<{ id?: string; name?: string }>(request);
            if (!parsed.ok) return badRequest(parsed.error);
            const id = normalizeId(parsed.value?.id);
            const name = String(parsed.value?.name ?? "").trim();
            if (!id || !name) return badRequest("id and name are required");

            const hierarchy = await readHierarchy(env, tenantId);
            let gpsIotError = "";
            if (segment === "dealer") {
              const dealer = findDealerInHierarchy(hierarchy, id);
              if (!dealer) return notFound();
              dealer.name = name;
            } else if (segment === "organisation") {
              const found = findOrgInHierarchy(hierarchy, id);
              if (!found) return notFound();
              found.org.name = name;
            } else if (segment === "database") {
              const found = findDbInHierarchy(hierarchy, id);
              if (!found) return notFound();
              found.db.name = name;
            } else if (segment === "site") {
              const found = findSiteInHierarchy(hierarchy, id);
              if (!found) return notFound();
              if (!actorCanAccessSiteTarget(actor, found.site.id)) return unauthorized();
              const gps = await renameGpsIotClientForHierarchySite(request, env, hierarchy, found.site, name);
              if (gps.status === 409) {
                return json({ ok: false, error: gps.error || "Client exists. Please choose another name!" }, { status: 409 });
              }
              if (gps.error) gpsIotError = gps.error;
              found.site.name = name;
              if (found.site.traccarGroupId) {
                await traccarFetch(env, `/api/groups/${found.site.traccarGroupId}`, {
                  method: "PUT",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ id: found.site.traccarGroupId, name, attributes: {} })
                });
              } else {
                await ensureTraccarGroupForSite(env, tenantId, found.site, {
                  hierarchy,
                  persist: false
                });
              }
            }

            await saveHierarchy(env, tenantId, hierarchy);
            if (segment !== "site") {
              try {
                const scope =
                  segment === "dealer"
                    ? { dealerId: id }
                    : segment === "organisation"
                      ? { orgId: id }
                      : { dbId: id };
                await syncHierarchyLabelsToTraccarDevices(env, hierarchy, scope);
              } catch (error) {
                console.warn("[hierarchy] failed to sync labels to Traccar", error);
              }
            }
            return json({
              ok: true,
              id,
              name,
              type: segment,
              hierarchy,
              ...(segment === "site"
                ? {
                    traccarGroupId: findSiteInHierarchy(hierarchy, id)?.site.traccarGroupId ?? null,
                    ...(findSiteInHierarchy(hierarchy, id)?.site.gpsIotClientId
                      ? { gpsIotClientId: findSiteInHierarchy(hierarchy, id)?.site.gpsIotClientId }
                      : {}),
                    ...(gpsIotError ? { gpsIotError } : {})
                  }
                : {}),
              tenantId
            });
          }

          if (request.method === "POST") {
            if (!canActorManageHierarchySegment(actor, hierarchySegment, "create")) return unauthorized();
            const parsed = await readJsonBody<{ name?: string; dealerId?: string; organisationId?: string; databaseId?: string }>(request);
            if (!parsed.ok) return badRequest(parsed.error);
            const name = String(parsed.value?.name ?? "").trim();
            if (!name) return badRequest("name is required");

            const hierarchy = await readHierarchy(env, tenantId);
            const newId = uuid();

            if (segment === "dealer") {
              const existingDealer = findByIdOrName(hierarchy.dealers, "", name);
              if (existingDealer) {
                return json({ ok: true, dealer: existingDealer, hierarchy, tenantId, reused: true });
              }
              const dealer: HierarchyDealer = { id: newId, name, organisations: [] };
              hierarchy.dealers.push(dealer);
              const saved = await saveHierarchy(env, tenantId, hierarchy, { mode: "merge" });
              return json({ ok: true, dealer, hierarchy: saved, tenantId });
            }

            if (segment === "organisation") {
              const dealerId = normalizeId(parsed.value?.dealerId);
              if (!dealerId) return badRequest("dealerId is required");
              const dealer = findDealerInHierarchy(hierarchy, dealerId);
              if (!dealer) return notFound();
              const existingOrg = findByIdOrName(dealer.organisations, "", name);
              if (existingOrg) {
                return json({ ok: true, organisation: existingOrg, hierarchy, tenantId, reused: true });
              }
              const organisation: HierarchyOrg = { id: newId, name, databases: [] };
              dealer.organisations.push(organisation);
              const saved = await saveHierarchy(env, tenantId, hierarchy, { mode: "merge" });
              return json({ ok: true, organisation, hierarchy: saved, tenantId });
            }

            if (segment === "database") {
              const organisationId = normalizeId(parsed.value?.organisationId);
              if (!organisationId) return badRequest("organisationId is required");
              const found = findOrgInHierarchy(hierarchy, organisationId);
              if (!found) return notFound();
              const existingDb = findByIdOrName(found.org.databases, "", name);
              if (existingDb) {
                return json({ ok: true, database: existingDb, hierarchy, tenantId, reused: true });
              }
              const database: HierarchyDatabase = { id: newId, name, sites: [] };
              found.org.databases.push(database);
              const saved = await saveHierarchy(env, tenantId, hierarchy, { mode: "merge" });
              try {
                await propagateDatabaseAccessToHierarchyPeers(env, found.dealer.id, found.org.id, database.id);
              } catch (error) {
                console.warn("[hierarchy] failed to propagate database access", error);
              }
              return json({ ok: true, database, hierarchy: saved, tenantId });
            }

            if (segment === "site") {
              const databaseId = normalizeId(parsed.value?.databaseId);
              if (!databaseId) return badRequest("databaseId is required");
              const found = findDbInHierarchy(hierarchy, databaseId);
              if (!found) return notFound();

              const existingSite = findByIdOrName(found.db.sites, "", name);
              if (existingSite) {
                const beforeClientId = String(existingSite.gpsIotClientId ?? "");
                const gps = await ensureGpsIotClientForHierarchySite(request, env, hierarchy, existingSite);
                if (gps.status === 409) {
                  return json({ ok: false, error: gps.error || "Client exists. Please choose another name!" }, { status: 409 });
                }
                if (String(existingSite.gpsIotClientId ?? "") !== beforeClientId) {
                  await saveHierarchy(env, tenantId, hierarchy);
                }
                return json({
                  ok: true,
                  site: existingSite,
                  traccarGroupId: existingSite.traccarGroupId ?? null,
                  ...(existingSite.gpsIotClientId ? { gpsIotClientId: existingSite.gpsIotClientId } : {}),
                  ...(gps.error ? { gpsIotError: gps.error } : {}),
                  hierarchy,
                  tenantId,
                  reused: true
                });
              }

              const previousSiteIds = (found.db.sites ?? []).map((site) => String(site?.id ?? "").trim()).filter(Boolean);
              const site: HierarchySite = {
                id: newId,
                name
              };
              const gps = await ensureGpsIotClientForHierarchySite(request, env, hierarchy, site);
              if (gps.status === 409) {
                return json({ ok: false, error: gps.error || "Client exists. Please choose another name!" }, { status: 409 });
              }
              found.db.sites.push(site);
              const ensured = await ensureTraccarGroupForSite(env, tenantId, site, {
                hierarchy,
                persist: false
              });
              const saved = await saveHierarchy(env, tenantId, hierarchy, { mode: "merge" });
              const dbTenantId = [found.dealer.id, found.org.id, found.db.id].filter(Boolean).join(":");
              try {
                await propagateSiteAccessToHierarchyPeers(env, dbTenantId, site.id, site.name, previousSiteIds);
              } catch (error) {
                console.warn("[hierarchy] failed to propagate site access", error);
              }
              return json({
                ok: true,
                site,
                traccarGroupId: site.traccarGroupId ?? null,
                traccarGroupCreated: Boolean(ensured.created),
                ...(ensured.error ? { traccarGroupError: ensured.error } : {}),
                ...(site.gpsIotClientId ? { gpsIotClientId: site.gpsIotClientId } : {}),
                ...(gps.error ? { gpsIotError: gps.error } : {}),
                hierarchy: saved,
                tenantId
              });
            }
          }

          return badRequest(`Unsupported method for /b2/hierarchy/${segment}`, 405);
        }

        if (url.pathname === "/share/live") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");

          const tenantId = getTenantId(request, url);
          const parsed = await readJsonBody<{
            assetId?: string;
            expiresAt?: string;
            expiryDate?: string;
            includeDriver?: boolean;
            includeAssetMeta?: boolean;
            comment?: string;
          }>(request);
          if (!parsed.ok) return badRequest(parsed.error);

          const assetId = normalizeId(parsed.value?.assetId);
          if (!assetId) return badRequest("assetId is required.");

          const now = Date.now();
          const expiryRaw = String(parsed.value?.expiresAt ?? parsed.value?.expiryDate ?? "").trim();
          const expiryMs = expiryRaw ? Date.parse(expiryRaw) : NaN;
          const desiredTtl = Number.isFinite(expiryMs) ? Math.ceil((expiryMs - now) / 1000) : 12 * 60 * 60;
          const ttlSeconds = Math.max(60, Math.min(12 * 60 * 60, desiredTtl || 12 * 60 * 60));
          const createdAt = new Date(now).toISOString();
          const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();

          const token = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
          const record = {
            tenantId,
            assetId,
            createdAt,
            expiresAt,
            includeDriver: Boolean(parsed.value?.includeDriver),
            includeAssetMeta: Boolean(parsed.value?.includeAssetMeta),
            comment: String(parsed.value?.comment ?? "").trim().slice(0, 500) || undefined
          };

          await env.ViviTEL.put(`share:live:${token}`, JSON.stringify(record), { expirationTtl: ttlSeconds });
          // Track whether an asset has an active share link for UI display.
          await env.ViviTEL.put(
            `share:live:asset:${tenantId}:${assetId}`,
            JSON.stringify({ token, expiresAt }),
            { expirationTtl: ttlSeconds }
          );
          return json({ token, createdAt, expiresAt, ttlSeconds });
        }

        if (url.pathname === "/share/live/email") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");

          const parsed = await readJsonBody<{
            to?: string | string[];
            shareUrl?: string;
            assetLabel?: string;
            expiresAt?: string;
            comment?: string;
          }>(request);
          if (!parsed.ok) return badRequest(parsed.error);

          const toRaw = parsed.value?.to;
          const recipients = Array.isArray(toRaw)
            ? toRaw
            : String(toRaw ?? "")
                .split(/[;,]/)
                .map((v) => v.trim())
                .filter(Boolean);
          const normalizedRecipients = recipients
            .map((v) => String(v ?? "").trim().toLowerCase())
            .filter((v) => v.includes("@"))
            .slice(0, 20);
          const shareUrl = String(parsed.value?.shareUrl ?? "").trim();
          const assetLabel = String(parsed.value?.assetLabel ?? "").trim() || "Asset";
          const expiresAt = String(parsed.value?.expiresAt ?? "").trim();
          const comment = String(parsed.value?.comment ?? "").trim();

          if (!normalizedRecipients.length) return badRequest("At least one valid recipient email is required.");
          if (!shareUrl) return badRequest("shareUrl is required.");

          const fromEmail = String(env.MAIL_FROM ?? "").trim();
          const fromName = String(env.MAIL_FROM_NAME ?? env.APP_NAME ?? "Vivi Telematics").trim();
          const resendKey = String(env.RESEND_API_KEY ?? "").trim();
          if (!fromEmail || !resendKey) {
            return json(
              { ok: false, emailSent: false, error: "MAIL_FROM or RESEND_API_KEY is not configured." },
              { status: 503 }
            );
          }

          const requestId = createEmailRequestId();
          const subject = `Live location share: ${assetLabel} [${requestId}]`;
          const text =
            `A live location link has been shared with you for ${assetLabel}.\n\n` +
            `Open live location:\n${shareUrl}\n\n` +
            (expiresAt ? `Expires at: ${expiresAt}\n\n` : "") +
            (comment ? `Comment: ${comment}\n\n` : "") +
            `Reference: ${requestId}\n`;

          try {
            await Promise.all(
              normalizedRecipients.map((to) =>
                sendResendEmail({
                  apiKey: resendKey,
                  to,
                  from: fromEmail,
                  fromName: fromName || undefined,
                  subject,
                  text
                })
              )
            );
            return json({ ok: true, emailSent: true, requestId, recipients: normalizedRecipients.length });
          } catch (error: any) {
            return json(
              {
                ok: false,
                emailSent: false,
                requestId,
                error: String(error?.message ?? error ?? "Failed to send email")
              },
              { status: 502 }
            );
          }
        }

        if (url.pathname === "/share/live/active") {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          if (request.method !== "POST") return badRequest("Use POST with a JSON payload.");
          const tenantId = getTenantId(request, url);
          const parsed = await readJsonBody<{ assetIds?: unknown }>(request);
          if (!parsed.ok) return badRequest(parsed.error);
          const idsRaw = parsed.value?.assetIds;
          const assetIds = Array.isArray(idsRaw)
            ? (idsRaw as unknown[])
                .map((v) => normalizeId(v))
                .filter((v): v is string => Boolean(v))
                .slice(0, 500)
            : [];
          if (!assetIds.length) return json({ active: {}, tenantId });

          const entries = await Promise.all(
            assetIds.map(async (id) => {
              // One failed lookup must not fail the whole list (it returned 500 for every asset).
              const raw = await env.ViviTEL.get(`share:live:asset:${tenantId}:${id}`).catch(() => null);
              if (!raw) return [id, { active: false }] as const;
              try {
                const parsed = JSON.parse(raw) as { token?: string; expiresAt?: string };
                const expiresAt = String(parsed?.expiresAt ?? "").trim();
                const token = String(parsed?.token ?? "").trim();
                return [id, { active: true, ...(expiresAt ? { expiresAt } : {}), ...(token ? { token } : {}) }] as const;
              } catch {
                return [id, { active: true }] as const;
              }
            })
          );
          const active: Record<string, { active: boolean; expiresAt?: string; token?: string }> = {};
          for (const [id, info] of entries) active[id] = info;
          return json({ active, tenantId });
        }

        if (url.pathname.startsWith("/share/live/")) {
          if (request.method !== "GET") return badRequest("Use GET.");
          const token = url.pathname.replace("/share/live/", "").trim();
          if (!token) return notFound();
          const raw = await env.ViviTEL.get(`share:live:${token}`);
          if (!raw) return notFound();

          let record: {
            tenantId: string;
            assetId: string;
            createdAt: string;
            expiresAt: string;
            includeDriver?: boolean;
            includeAssetMeta?: boolean;
            comment?: string;
          } | null = null;
          try {
            record = JSON.parse(raw);
          } catch {
            record = null;
          }
          if (!record?.tenantId || !record.assetId) return notFound();

          const expiresMs = Date.parse(String(record.expiresAt ?? ""));
          if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) return notFound();

          const asset = await readEntityById(env, "assets", record.tenantId, record.assetId);
          if (!asset) return notFound();

          const lat = normalizeNumber((asset as any).lat ?? (asset as any).latitude);
          const lng = normalizeNumber((asset as any).lng ?? (asset as any).lon ?? (asset as any).longitude);
          const at = String((asset as any).lastSeen ?? (asset as any).lastPosition ?? "").trim() || null;
          const speed = normalizeNumber((asset as any).speed);

          const baseAsset: Record<string, unknown> = {
            id: String((asset as any).id ?? record.assetId),
            assetDescription: (asset as any).assetDescription ?? (asset as any).description ?? null,
            registration: (asset as any).registration ?? (asset as any).registrationNumber ?? null,
            site: (asset as any).site ?? null
          };

          if (record.includeDriver) {
            (baseAsset as any).driverName =
              (asset as any).defaultDriver
              ?? (asset as any).driverName
              ?? (asset as any).driver
              ?? (asset as any).driverFullName
              ?? null;
            (baseAsset as any).driverMobile =
              (asset as any).driverMobile ?? (asset as any).driverPhone ?? (asset as any).driverNumber ?? null;
          }

          if (record.includeAssetMeta) {
            (baseAsset as any).make = (asset as any).make ?? (asset as any).assetMake ?? null;
            (baseAsset as any).model = (asset as any).model ?? (asset as any).assetModel ?? null;
          }

          return json({
            ok: true,
            share: {
              createdAt: record.createdAt,
              expiresAt: record.expiresAt,
              comment: record.comment ?? null
            },
            asset: baseAsset,
            latest: {
              lat,
              lng,
              at,
              speed
            }
          });
        }

        if (url.pathname.startsWith("/device/artifacts/")) {
          const auth = await requireApiKey(request, env);
          if (auth) return auth;
          if (!env.STORAGE_BUCKET) return serviceUnavailable({ error: "Storage bucket not configured." });
          const tenantId = getTenantId(request, url);
          const id = url.pathname.replace("/device/artifacts/", "").trim();
          if (!id) return notFound();
          await ensureD1Tables(env);
          const meta = await env.VIVI_D1.prepare(
            "SELECT r2_key, content_type FROM device_artifacts WHERE tenant_id = ? AND id = ?"
          )
            .bind(tenantId, id)
            .first();
          if (!meta) return notFound();
          const r2Key = String((meta as any).r2_key ?? "");
          if (!r2Key) return notFound();
          const obj = await env.STORAGE_BUCKET.get(r2Key);
          if (!obj) return notFound();
          return new Response(obj.body, {
            headers: {
              "content-type": (meta as any).content_type ?? "application/octet-stream",
              "access-control-allow-origin": "*"
            }
          });
        }
        if (url.pathname.startsWith("/pat/") && url.pathname.endsWith("/revoke")) {
          const parts = url.pathname.split("/");
          const id = parts[2];
          const revoked = await revokePat(env, id);
          if (!revoked) return notFound();
          return json({ token: revoked });
        }

        if (url.pathname.startsWith("/kv/")) {
          const rawKey = url.pathname.replace("/kv/", "");
          let key = rawKey;
          try {
            key = decodeURIComponent(rawKey);
          } catch {
            key = rawKey;
          }
          if (!key) return badRequest("Key is required.");

          if (request.method === "POST") {
            try {
              const tenantId = getTenantId(request, url);
              if (isLegacyFlatScopedKvKey(key)) {
                return badRequest(
                  "Legacy library keys are not allowed. Use a site-scoped key: libraries:{name}:tenant:{tenant}:site:{site}."
                );
              }
              if (isTenantWideSiteScopedKvKey(key)) {
                return badRequest(
                  "Site library keys must include :site:{site}. Tenant-wide keys are not allowed — sites in the same database stay isolated."
                );
              }
              const body = await request.json();
              const payloadText = JSON.stringify(body);
              const stored = await kvPutWithVpsFallback(env, key, payloadText, tenantId);
              if (!stored) {
                return json(
                  { stored: false, key, tenantId, error: "KV temporarily unavailable" },
                  { status: 503 }
                );
              }
              return json({ stored: true, key, tenantId });
            } catch {
              return badRequest("Invalid JSON body.");
            }
          }

          // Soft-fail on KV quota / binding errors so the UI can render empty state
          // instead of surfacing 500s (e.g. "KV get() limit exceeded for the day").
          const tenantId = getTenantId(request, url);
          const stored = await kvGetWithVpsFallback(env, key, tenantId);
          if (!stored) {
            return new Response("null", {
              headers: {
                "content-type": "application/json; charset=utf-8",
                "access-control-allow-origin": "*"
              }
            });
          }
          return new Response(stored, {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "access-control-allow-origin": "*"
            }
          });
        }
        return notFound();
      }
      }
    } catch (err: any) {
      return json(
        {
          error: "Internal error",
          message: String(err?.message ?? err ?? ""),
          ok: false
        },
        { status: 500 }
      );
    }
}
