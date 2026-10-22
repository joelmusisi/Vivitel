import {
  activateTenantContext,
  clearSelectionClientState,
  clearSessionClientState,
  isDatabaseTenant,
  readActiveSiteName,
  readActiveTenantId,
  registerKvCacheInvalidator,
  registerSessionCacheFlusher,
  restoreSessionResume,
  saveSessionResume
} from "./tenantContext";
import { mergeAssetsKeepingNewerLive, overlayLivePositions, rememberLivePositions } from "./assetLiveCache";
import {
  bindingIdsToPruneAfterSave,
  dedupeBindingRows,
  resolveBindingRecordForSave,
  type BindingType
} from "./bindingRecordUtils";
import {
  sanitizeTraccarComputedAttributeRequestBody,
  toTraccarComputedAttributeApiBody
} from "./traccarComputedAttributeApi";
import { guardFlatScopedKvAccess, siteScopeToken, siteScopesMatch } from "./scopeIsolation";
import {
  DRIVERS_KV_BASE,
  driverNamesFromAssets,
  driverSitesToLoad,
  driverTenantsToLoad,
  driversMissingFrom,
  groupDriversBySite,
  mergeDriverRecords,
  namedDriverStub,
  normalizeDriverRecord,
  readCachedDrivers,
  readLocalUnsyncedDrivers,
  tenantIdForDriverSite,
  writeCachedDrivers,
  type SharedDriverRecord
} from "./driverStore";
import { readStoredSelectionScope } from "./selectionScope";
import { canAccessPage, roleNamesFromPrincipal } from "./pageAccess";
import { filterHierarchyForRegion, isLegacyFlatTenantId, isSharedDemoDatabaseTenant } from "./regionHierarchy";
import { DEFAULT_REGION, isGpsIotServer, isLoopbackHost, isRegionId, isRegionalAppHost, readActiveRegion, rememberActiveRegion } from "./regionServers";
import {
  assetsLookLikeTraccarStubs,
  collectTenantIdsForSite,
  collectTenantIdsForSiteOrDatabase,
  discoverCachedTenantIds,
  hierarchyPathForTenant,
  isHierarchyUnavailable,
  isSyntheticTenantId,
  PUBLISHED_MMULU_PATH,
  publishedTenantIdForSite,
  resolveDatabaseTenantFromHierarchy,
  scoreTenantAssetRows,
  formatAssetDescription
} from "./hierarchyDisplay";

export { rbacCanonicalPath } from "./pageAccess";

const apiBase = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? "";
const buildTimeApiKey = ((import.meta as any).env?.VITE_API_KEY as string | undefined) ?? "";
const defaultTenantId = "west-africa";
const isViteDevRuntime = Boolean((import.meta as any).env?.DEV);

const rawDeviceServerDomain = String(((import.meta as any).env?.VITE_DEVICE_SERVER_DOMAIN as string | undefined) ?? "").trim();
const rawDeviceServerPort = Number(((import.meta as any).env?.VITE_DEVICE_SERVER_PORT as string | undefined) ?? "");
const rawDeviceServerProtocol = String(((import.meta as any).env?.VITE_DEVICE_SERVER_PROTOCOL as string | undefined) ?? "").trim().toLowerCase();

const isValidPort = (value: number) => Number.isFinite(value) && value > 0 && value <= 65535;

const buildDeviceServerBase = () => {
  if (!rawDeviceServerDomain) return "";
  const protocol = rawDeviceServerProtocol === "https" || rawDeviceServerProtocol === "http"
    ? rawDeviceServerProtocol
    : "http";
  const includePort = isValidPort(rawDeviceServerPort)
    && !((protocol === "http" && rawDeviceServerPort === 80) || (protocol === "https" && rawDeviceServerPort === 443));
  const portPart = includePort ? `:${Math.trunc(rawDeviceServerPort)}` : "";
  return `${protocol}://${rawDeviceServerDomain}${portPart}`;
};

const getSafeDeviceServerBase = () => {
  const base = buildDeviceServerBase();
  if (!base) return "";
  if (typeof window !== "undefined" && window.location?.protocol === "https:" && /^http:\/\//i.test(base)) {
    return "";
  }
  return base;
};

// Use the canonical API hostname instead of workers.dev for production app hosts.
const productionApiFallbackMain = "https://api.vivitelematics.ca";
const productionApiFallbackPublish = "https://api.vivitelematics.ca";

const isLocalhostHostname = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "::1";
const isLocalhostApiBase = (base: string) => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(String(base ?? "").trim());
const isWorkersDevApiBase = (base: string) => /workers\.dev/i.test(String(base ?? "").trim());

const isRetriableNetworkError = (error: unknown) => {
  const message = String((error as any)?.message ?? error ?? "").trim().toLowerCase();
  return message.includes("failed to fetch")
    || message.includes("networkerror")
    || message.includes("network changed")
    || message.includes("load failed");
};

const parseRetryAfterSec = (response: Response): number => {
  const header = String(response.headers.get("retry-after") ?? "").trim();
  const asNumber = Number(header);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.ceil(asNumber);
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    return Math.max(1, Math.ceil((asDate - Date.now()) / 1000));
  }
  return 2;
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Auth uses x-api-key headers; omit cookies so local dev proxy does not hit 431. */
const API_FETCH_INIT: Pick<RequestInit, "credentials"> = { credentials: "omit" };

const fetchWithAuthRetry = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const maxAttempts = 3;
  let lastError: unknown = null;
  const requestInit: RequestInit = { ...API_FETCH_INIT, ...init };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(input, requestInit);
      if (response.status === 429 && attempt < maxAttempts - 1) {
        const waitSec = parseRetryAfterSec(response);
        await sleep(waitSec * 1000);
        continue;
      }
      if (response.status >= 500 && response.status < 600 && attempt < maxAttempts - 1) {
        await sleep(Math.min(8_000, 500 * 2 ** attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (!isRetriableNetworkError(error) || attempt >= maxAttempts - 1) throw error;
      await sleep(Math.min(4_000, 400 * 2 ** attempt));
    }
  }
  if (lastError) throw lastError;
  return await fetch(input, requestInit);
};

const getEffectiveApiBase = () => {
  const raw = String(apiBase ?? "").trim();
  if (typeof window === "undefined") return raw;
  const host = String(window.location?.hostname ?? "");
  const isMainHost = isRegionalAppHost(host) || /vivi-telematics-frontend\.pages\.dev$/i.test(host);
  const isPublishHost = host === "api.vivitelematics.ca" || /vivi-telematics-main-publish-frontend\.pages\.dev$/i.test(host);

  // Only the Vite dev server provides the local API proxy. In preview/production-style localhost
  // sessions we must use a real API base so auth and reverse-geocode requests do not hit the static server.
  if (isLocalhostHostname(host) && isViteDevRuntime) {
    return "";
  }

  // Regional custom domains may be challenged by the zone WAF on API POSTs. Use the
  // canonical API hostname so login and authenticated API calls reach the Worker directly.
  if (isMainHost) {
    if (isRegionalAppHost(host)) return productionApiFallbackMain;
    // Respect explicit non-local API base for Pages preview hosts.
    if (raw && !isLocalhostApiBase(raw)) return raw;
    return productionApiFallbackMain;
  }

  // Publish hosts must use publish API.
  if (isPublishHost) {
    if (raw && !isLocalhostApiBase(raw)) return raw;
    return productionApiFallbackPublish;
  }

  // On other real hostnames: use explicit non-local base, else publish fallback.
  if (raw && !isLocalhostApiBase(raw)) return raw;
  return productionApiFallbackPublish;
};

const storedApiKeyKey = "vivi.apiKey";
const regionalApiKeyKey = (region = readActiveRegion()) => `${storedApiKeyKey}:${region}`;
const apiKeyDisabledKey = "vivi.apiKey.disabled";
const returnSessionKey = "vivi.returnSession";
const adminApiKeyKey = "vivi.adminApiKey";
const adminTenantKey = "vivi.adminTenantId";

const permsKey = "vivi.rbac.permissions";
const permsLoadedKey = "vivi.rbac.permissions.loaded";

export type RbacPermissionRow = { pagePath: string; view: boolean; edit: boolean; delete: boolean };
export type RbacPermissionMode = "allow-all" | "deny-by-default" | "not-loaded";
export type RbacPermissionsPayload = { mode: RbacPermissionMode; rows: RbacPermissionRow[] };

const readRbacPermissions = (): { loaded: boolean; mode: RbacPermissionMode; map: Map<string, RbacPermissionRow> } => {
  if (typeof window === "undefined") return { loaded: false, mode: "not-loaded", map: new Map() };
  const loaded = String(window.localStorage.getItem(permsLoadedKey) ?? "").trim() === "true";
  const raw = window.localStorage.getItem(permsKey) ?? "";
  if (!raw) return { loaded, mode: "not-loaded", map: new Map() };
  try {
    const parsed = JSON.parse(raw) as RbacPermissionsPayload;
    const mode = (parsed?.mode ?? "not-loaded") as RbacPermissionMode;
    const rows = Array.isArray(parsed?.rows)
      ? parsed.rows.filter(
          (row) => Boolean(String(row?.pagePath ?? "").trim()) && Boolean(row.view || row.edit || row.delete)
        )
      : [];
    const map = new Map(rows.map((r) => [String(r.pagePath ?? "").trim(), r]));
    return { loaded, mode, map };
  } catch {
    return { loaded, mode: "not-loaded", map: new Map() };
  }
};

const writeRbacPermissions = (payload: RbacPermissionsPayload) => {
  if (typeof window === "undefined") return;
  const rows = Array.isArray(payload?.rows)
    ? payload.rows.filter((row) => Boolean(row?.pagePath) && Boolean(row.view || row.edit || row.delete))
    : [];
  window.localStorage.setItem(
    permsKey,
    JSON.stringify({ mode: payload?.mode ?? "not-loaded", rows })
  );
  window.localStorage.setItem(permsLoadedKey, "true");
};

const clearRbacPermissions = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(permsKey);
  window.localStorage.removeItem(permsLoadedKey);
};

/** True when a previous session already stored RBAC rows — safe to paint the shell immediately. */
export const hasCachedRbacPermissions = () => {
  const { loaded, mode } = readRbacPermissions();
  return loaded && mode !== "not-loaded";
};

const readCachedPrincipal = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("vivi.auth.principal");
    return raw ? (JSON.parse(raw) as any) : null;
  } catch {
    return null;
  }
};

export type DemoSharedSite = {
  tenantId: string;
  siteId: string;
  siteName: string;
};

export type DemoSessionStatus = {
  active: boolean;
  expired: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number;
  showTour: boolean;
  activated: boolean;
  personalTenantId: string | null;
  sharedDemo: DemoSharedSite | null;
};

function readSharedDemoSite(value: unknown): DemoSharedSite | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { tenantId?: unknown; siteId?: unknown; siteName?: unknown };
  const tenantId = String(row.tenantId ?? "").trim();
  const siteId = String(row.siteId ?? "").trim();
  if (!tenantId || !siteId) return null;
  return {
    tenantId,
    siteId,
    siteName: String(row.siteName ?? "").trim() || "Demo"
  };
}

export function normalizeDemoSession(demo: unknown): DemoSessionStatus | null {
  if (!demo || typeof demo !== "object") return null;
  const row = demo as Partial<DemoSessionStatus> & { sharedDemo?: unknown };
  const daysRemaining = Number(row.daysRemaining ?? 0);
  return {
    active: Boolean(row.active),
    expired: Boolean(row.expired),
    startedAt: row.startedAt ? String(row.startedAt) : null,
    expiresAt: row.expiresAt ? String(row.expiresAt) : null,
    daysRemaining: Number.isFinite(daysRemaining) ? daysRemaining : 0,
    showTour: Boolean(row.showTour),
    activated: Boolean(row.activated),
    personalTenantId: row.personalTenantId ? String(row.personalTenantId) : null,
    sharedDemo: readSharedDemoSite(row.sharedDemo)
  };
}

export function readDemoSession(): DemoSessionStatus | null {
  return normalizeDemoSession(readCachedPrincipal()?.demo);
}

/** Demo signup databases stay empty. Customer vehicles are not copied into them. */
export function tenantSkipsAutomaticFleetImport(tenantId: unknown) {
  const id = String(tenantId ?? "").trim();
  if (!id) return false;
  if (isSharedDemoDatabaseTenant(id)) return true;
  const demo = readDemoSession();
  if (!demo) return false;
  if (demo.personalTenantId && demo.personalTenantId === id) return true;
  if (demo.sharedDemo?.tenantId === id) return true;
  return false;
}

export function isPersonalDemoTenant(tenantId: unknown) {
  const id = String(tenantId ?? "").trim();
  const personal = String(readDemoSession()?.personalTenantId ?? "").trim();
  return Boolean(id && personal && id === personal);
}

function rememberDemoSession(demo: unknown) {
  if (typeof window === "undefined") return;
  try {
    const cached = readCachedPrincipal() ?? {};
    if (!demo || typeof demo !== "object") {
      delete cached.demo;
    } else {
      const status = normalizeDemoSession(demo);
      cached.demo = status;
    }
    window.localStorage.setItem("vivi.auth.principal", JSON.stringify(cached));
  } catch {
    // ignore
  }
}

const dispatchAuthChange = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("vivi:authchange"));
};

export function readSignedInUser() {
  const cached = readCachedPrincipal();
  const principal = (cached?.principal ?? cached ?? {}) as Record<string, unknown>;
  const lastEmail = typeof window === "undefined" ? "" : String(window.localStorage.getItem("vivi.auth.lastLoginEmail") ?? "").trim();
  return {
    kind: String(principal.kind ?? "").trim(),
    userId: String(principal.userId ?? "").trim(),
    email: String(principal.email ?? lastEmail).trim(),
    name: String(principal.name ?? "").trim()
  };
}

export const canForPath = (pagePath: string, action: "view" | "edit" | "delete") => {
  const principal = readCachedPrincipal()?.principal as any;
  const { loaded, mode, map } = readRbacPermissions();
  return canAccessPage({
    pagePath,
    action,
    principalKind: String(principal?.kind ?? "").trim(),
    impersonating: Boolean(principal?.impersonatedBy),
    mode,
    loaded,
    rows: Array.from(map.values()),
    roleNames: roleNamesFromPrincipal(principal)
  });
};

const canForCurrentPath = (action: "view" | "edit" | "delete") => {
  if (typeof window === "undefined") return true;
  return canForPath(String(window.location?.pathname ?? ""), action);
};

const isApiKeyDisabled = () => {
  if (typeof window === "undefined") return false;
  return String(window.localStorage.getItem(apiKeyDisabledKey) ?? "").trim().toLowerCase() === "true";
};

export const getStoredApiKey = () => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(regionalApiKeyKey()) ?? "";
};

export const setStoredApiKey = (value: string) => {
  if (typeof window === "undefined") return;
  const v = String(value ?? "").trim();
  const scopedKey = regionalApiKeyKey();
  const previous = String(window.localStorage.getItem(scopedKey) ?? "").trim();
  if (!v) {
    const previousTenantId = readActiveTenantId();
    // Every sign-out path (button, inactivity, expired session) ends here: save the
    // account's hierarchy and page while its principal and tenant are still known.
    saveSessionResume();
    window.localStorage.removeItem(scopedKey);
    window.localStorage.removeItem(storedApiKeyKey);
    window.localStorage.removeItem("vivi.auth.principal");
    window.localStorage.removeItem("vivi.tenantId");
    window.localStorage.removeItem("vivi.lastActivityAt");
    // Logout: wipe site/tenant UI + in-memory caches immediately (no refresh needed).
    clearSessionClientState(previousTenantId);
    clearRbacPermissions();
    clearReturnSession();
    dispatchAuthChange();
    return;
  }
  if (previous !== v) {
    const previousTenantId = readActiveTenantId();
    saveSessionResume();
    window.localStorage.removeItem("vivi.auth.principal");
    window.localStorage.removeItem("vivi.tenantId");
    // New session must not keep another account's site/data.
    clearSessionClientState(previousTenantId);
    clearRbacPermissions();
  }
  // If the user explicitly logs in, clear any prior logout override.
  window.localStorage.removeItem(apiKeyDisabledKey);
  window.localStorage.setItem(scopedKey, v);
  window.localStorage.setItem(storedApiKeyKey, v);
  window.localStorage.setItem("vivi.lastActivityAt", String(Date.now()));
  dispatchAuthChange();
};

type ImpersonationReturnSession = {
  apiKey: string;
  tenantId: string;
  principal: string;
  permissions: string;
  permissionsLoaded: string;
};

const readReturnSession = (): ImpersonationReturnSession | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = String(window.localStorage.getItem(returnSessionKey) ?? "").trim();
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ImpersonationReturnSession>;
      const apiKey = String(parsed?.apiKey ?? "").trim();
      if (apiKey) {
        return {
          apiKey,
          tenantId: String(parsed?.tenantId ?? "").trim(),
          principal: String(parsed?.principal ?? ""),
          permissions: String(parsed?.permissions ?? ""),
          permissionsLoaded: String(parsed?.permissionsLoaded ?? "").trim()
        };
      }
    }
  } catch {
    // fall through to legacy keys
  }
  const legacyKey = String(window.localStorage.getItem(adminApiKeyKey) ?? "").trim();
  if (!legacyKey) return null;
  return {
    apiKey: legacyKey,
    tenantId: String(window.localStorage.getItem(adminTenantKey) ?? "").trim(),
    principal: "",
    permissions: "",
    permissionsLoaded: ""
  };
};

const clearReturnSession = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(returnSessionKey);
  window.localStorage.removeItem(adminApiKeyKey);
  window.localStorage.removeItem(adminTenantKey);
  window.localStorage.removeItem("vivi.impersonatedLabel");
};

/** Snapshot the investigator session before switching into an impersonated account. */
export const stashImpersonationReturnSession = () => {
  if (typeof window === "undefined") return;
  if (readReturnSession()) return;
  if (readCachedPrincipal()?.principal?.impersonatedBy) return;
  const apiKey = String(getStoredApiKey() || getApiKey() || "").trim();
  if (!apiKey) return;
  const snapshot: ImpersonationReturnSession = {
    apiKey,
    tenantId: String(window.localStorage.getItem("vivi.tenantId") ?? "").trim(),
    principal: String(window.localStorage.getItem("vivi.auth.principal") ?? ""),
    permissions: String(window.localStorage.getItem(permsKey) ?? ""),
    permissionsLoaded: String(window.localStorage.getItem(permsLoadedKey) ?? "").trim()
  };
  window.localStorage.setItem(returnSessionKey, JSON.stringify(snapshot));
  window.localStorage.setItem(adminApiKeyKey, apiKey);
  if (snapshot.tenantId) window.localStorage.setItem(adminTenantKey, snapshot.tenantId);
};

/** Restore the investigator session without logging out. */
export const restoreImpersonationReturnSession = (): boolean => {
  if (typeof window === "undefined") return false;
  const snapshot = readReturnSession();
  if (!snapshot?.apiKey) return false;

  window.localStorage.setItem(storedApiKeyKey, snapshot.apiKey);
  window.localStorage.removeItem(apiKeyDisabledKey);
  window.localStorage.setItem("vivi.lastActivityAt", String(Date.now()));
  if (snapshot.tenantId) window.localStorage.setItem("vivi.tenantId", snapshot.tenantId);
  else window.localStorage.removeItem("vivi.tenantId");
  if (snapshot.principal) window.localStorage.setItem("vivi.auth.principal", snapshot.principal);
  else window.localStorage.removeItem("vivi.auth.principal");
  if (snapshot.permissions) {
    window.localStorage.setItem(permsKey, snapshot.permissions);
    window.localStorage.setItem(permsLoadedKey, snapshot.permissionsLoaded || "true");
  }
  clearReturnSession();
  dispatchAuthChange();
  return true;
};

const applyRestoredInvestigatorSession = (token: string, tenantId?: string) => {
  setStoredApiKey(token);
  if (typeof window === "undefined") return;
  if (tenantId) window.localStorage.setItem("vivi.tenantId", tenantId);
  else window.localStorage.removeItem("vivi.tenantId");
  window.localStorage.removeItem("vivi.impersonatedLabel");
  window.localStorage.removeItem("vivi.org.dealers");
  clearReturnSession();
};

/** Restore the investigator session from local stash, or from the server if the stash is missing. */
export async function stopImpersonationSession(): Promise<{ ok: boolean; error?: string }> {
  const impersonationToken = String(getStoredApiKey() || getApiKey() || "").trim();
  if (readReturnSession()?.apiKey) {
    restoreImpersonationReturnSession();
    const auth = await refreshAuthMe();
    if (auth.ok) return { ok: true };
    if (impersonationToken) setStoredApiKey(impersonationToken);
  }

  if (!impersonationToken) {
    return { ok: false, error: "Could not restore the original session. You are still signed in." };
  }

  try {
    const response = await fetchWithAuthRetry(buildUrl("/auth/stop-impersonate"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildAuthHeaders(undefined, impersonationToken)
      }
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const nextToken = String(body?.token ?? "").trim();
    if (!response.ok || !nextToken) {
      return {
        ok: false,
        error: String(body?.error ?? body?.message ?? "Could not restore the original session. You are still signed in.")
      };
    }
    applyRestoredInvestigatorSession(nextToken, String(body?.tenantId ?? "").trim() || undefined);
    const auth = await refreshAuthMe();
    if (!auth.ok && auth.unauthorized) {
      return { ok: false, error: "Could not restore the original session. You are still signed in." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not restore the original session. You are still signed in." };
  }
}

export async function refreshAuthMe(): Promise<{
  ok: boolean;
  status?: number;
  unauthorized?: boolean;
  tenantId?: string;
  mode?: RbacPermissionMode;
}> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return { ok: false, status: 401, unauthorized: true };
    const stillCurrentSession = () => String(getApiKey() || "").trim() === apiKey;
    const fetchAuth = async (tenantIdOverride?: string) => {
      const response = await fetch(buildUrl("/auth/me"), {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...(tenantIdOverride ? { "x-tenant-id": tenantIdOverride } : {}),
          "x-api-key": apiKey
        }
      });
      return response;
    };

    let tenantId = getTenantId();
    let response = await fetchAuth(tenantId);
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: response.status, unauthorized: true };
    }
    if (!response.ok) {
      return { ok: false, status: response.status, unauthorized: false };
    }
    let body = (await response.json()) as any;

    const allowedTenants = Array.isArray(body?.allowedTenants) ? body.allowedTenants : [];
    const firstAllowedTenant = String(allowedTenants[0] ?? "").trim();
    if (!tenantId && firstAllowedTenant && typeof window !== "undefined") {
      window.localStorage.setItem("vivi.tenantId", firstAllowedTenant);
      tenantId = firstAllowedTenant;
      const hydrated = await fetchAuth(firstAllowedTenant);
      if (hydrated.ok) body = (await hydrated.json()) as any;
    }

    const resolvedTenantId = String(body?.tenantId ?? tenantId ?? "").trim();
    const authRegion = String(body?.region ?? "").trim().toLowerCase();
    if (typeof window !== "undefined" && isLoopbackHost(String(window.location?.hostname ?? "")) && isRegionId(authRegion)) {
      rememberActiveRegion(authRegion);
    }
    if (!stillCurrentSession()) {
      return { ok: true, status: 200, tenantId: resolvedTenantId || undefined };
    }
    if (resolvedTenantId && typeof window !== "undefined") {
      window.localStorage.setItem("vivi.tenantId", resolvedTenantId);
    }

    // Cache a small subset of /auth/me for UI features (e.g., impersonation banner).
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "vivi.auth.principal",
          JSON.stringify({
            principal: body?.principal ?? null,
            tenantId: resolvedTenantId,
            allowedTenants: body?.allowedTenants ?? [],
            ...(normalizeDemoSession(body?.demo) ? { demo: normalizeDemoSession(body?.demo) } : {})
          })
        );
        const allowedSiteNames = Array.isArray(body?.principal?.siteNames)
          ? body.principal.siteNames.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
          : [];
        const currentSite = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
        const currentSiteAllowed =
          !allowedSiteNames.length ||
          allowedSiteNames.some((name: string) => siteScopesMatch(name, currentSite));
        // Demo and site-scoped users: never keep a site from another account's browser session.
        if (body?.demo?.active || (allowedSiteNames.length > 0 && !currentSiteAllowed)) {
          const parts = resolvedTenantId.split(":").map((part: string) => part.trim()).filter(Boolean);
          if (parts.length >= 3) {
            window.localStorage.setItem("vivi.activeDealerId", parts[0]);
            window.localStorage.setItem("vivi.activeOrgId", parts[1]);
            window.localStorage.setItem("vivi.activeDbId", parts[2]);
          }
          const siteName = allowedSiteNames[0] || "";
          if (siteName) {
            if (!siteScopesMatch(currentSite, siteName)) {
              try {
                window.localStorage.removeItem("vivi.selectedPath");
                window.localStorage.removeItem("vivi.activeSiteId");
                window.localStorage.removeItem("vivi.org.dealers");
              } catch {
                // ignore
              }
            }
            window.localStorage.setItem("vivi.activeSite", siteName);
            window.localStorage.setItem("vivi.selectedScope", "site");
          } else if (currentSite && !currentSiteAllowed) {
            clearSelectionClientState();
          }
        }
      }
    } catch {
      // ignore
    }

    const permissions = (body?.permissions ?? null) as RbacPermissionsPayload | null;
    if (permissions && typeof permissions === "object") {
      writeRbacPermissions({
        mode: (permissions as any).mode ?? "not-loaded",
        rows: Array.isArray((permissions as any).rows) ? (permissions as any).rows : []
      });
    }
    dispatchAuthChange();
    return { ok: true, status: 200, tenantId: resolvedTenantId || undefined, mode: (permissions as any)?.mode };
  } catch {
    // Network/transient failures must not force logout.
    return { ok: false, status: 0, unauthorized: false };
  }
}

export const getCachedPrincipal = () => {
  return readCachedPrincipal();
};

export const isImpersonating = () => {
  const cached = getCachedPrincipal();
  return Boolean(cached?.principal?.impersonatedBy);
};

const ACCOUNT_NAME_OVERRIDES: Record<string, string> = {
  "kizzajamesmusisi@gmail.com": "Joel Musisi",
  "kizzajamesmusis@gmail.com": "Joel Musisi"
};

const toDisplayNameFromEmail = (value: string) => {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return "";
  if (ACCOUNT_NAME_OVERRIDES[email]) return ACCOUNT_NAME_OVERRIDES[email];
  const local = email.split("@")[0] ?? "";
  const tokens = local
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  if (!tokens.length) return "";
  return tokens
    .map((token) => token.slice(0, 1).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
};

export const getCurrentAccountLabel = () => {
  const cached = getCachedPrincipal();
  const principal = cached?.principal ?? null;
  const name = String(principal?.name ?? "").trim();
  if (name) return name;
  const impersonatedLabel = typeof window === "undefined" ? "" : String(window.localStorage.getItem("vivi.impersonatedLabel") ?? "").trim();
  if (impersonatedLabel && principal?.impersonatedBy) return impersonatedLabel;
  const email = String(principal?.email ?? "").trim();
  const fromEmail = toDisplayNameFromEmail(email);
  if (fromEmail) return fromEmail;
  if (email) return email;
  const loginEmail = typeof window === "undefined" ? "" : String(window.localStorage.getItem("vivi.auth.lastLoginEmail") ?? "").trim();
  const fromLoginEmail = toDisplayNameFromEmail(loginEmail);
  if (fromLoginEmail) return fromLoginEmail;
  if (loginEmail) return loginEmail;
  const userId = String(principal?.userId ?? "").trim();
  if (userId) return userId;
  if (String(principal?.kind ?? "").trim().toLowerCase() === "admin") return "Admin";
  return "";
};

export const getTenantId = () => {
  if (typeof window === "undefined") return defaultTenantId;
  const direct = String(window.localStorage.getItem("vivi.tenantId") ?? "").trim();
  if (direct && (isSyntheticTenantId(direct) || isLegacyFlatTenantId(direct))) {
    try {
      window.localStorage.removeItem("vivi.tenantId");
    } catch {
      // ignore
    }
  } else if (direct) {
    return direct;
  }

  // Fallback: recover tenant from cached /auth/me payload.
  try {
    const principalRaw = window.localStorage.getItem("vivi.auth.principal") ?? "";
    if (principalRaw) {
      const principal = JSON.parse(principalRaw) as any;
      const fromPrincipal = String(principal?.tenantId ?? "").trim();
      if (fromPrincipal && !isSyntheticTenantId(fromPrincipal) && !isLegacyFlatTenantId(fromPrincipal)) {
        return fromPrincipal;
      }
      const firstAllowed = Array.isArray(principal?.allowedTenants) ? principal.allowedTenants[0] : null;
      const fromAllowed = String(firstAllowed ?? "").trim();
      if (fromAllowed && !isSyntheticTenantId(fromAllowed) && !isLegacyFlatTenantId(fromAllowed)) {
        return fromAllowed;
      }
    }
  } catch {
    // ignore
  }

  return defaultTenantId;
};
const appendTenantQueryForD1 = (path: string, tenantId: string) => {
  const rawPath = String(path ?? "");
  const resolvedTenant = String(tenantId ?? "").trim();
  if (!resolvedTenant) return rawPath;
  if (!rawPath.startsWith("/d1/")) return rawPath;
  if (/(?:\?|&)tenant=/i.test(rawPath)) return rawPath;

  const hashIndex = rawPath.indexOf("#");
  const beforeHash = hashIndex >= 0 ? rawPath.slice(0, hashIndex) : rawPath;
  const hash = hashIndex >= 0 ? rawPath.slice(hashIndex) : "";
  const separator = beforeHash.includes("?") ? "&" : "?";
  return `${beforeHash}${separator}tenant=${encodeURIComponent(resolvedTenant)}${hash}`;
};

export const buildUrl = (path: string, tenantIdOverride?: string | null) => {
  const tenantForPath = tenantIdOverride === undefined ? getTenantId() : String(tenantIdOverride ?? "").trim();
  const tenantAwarePath = appendTenantQueryForD1(path, tenantForPath);
  const base = getEffectiveApiBase();
  if (!base) return tenantAwarePath;
  return `${base.replace(/\/$/, "")}${tenantAwarePath}`;
};

const buildAuthHeaders = (tenantIdOverride?: string | null, apiKeyOverride?: string | null) => {
  const tenantId = tenantIdOverride === undefined ? getTenantId() : tenantIdOverride;
  const apiKey = apiKeyOverride === undefined ? getApiKey() : apiKeyOverride;
  return {
    ...(tenantId ? { "x-tenant-id": tenantId } : {}),
    ...(apiKey ? { "x-api-key": apiKey } : {})
  };
};

const telemetryLookupCapabilityKeyPrefix = "vivi.capability.telemetryLookup.";

const getTelemetryLookupCapabilityKey = () => {
  const base = String(getEffectiveApiBase() ?? "").trim() || "relative";
  return `${telemetryLookupCapabilityKeyPrefix}${base}`;
};

const getTelemetryLookupCapability = (): "supported" | "unsupported" | "unknown" => {
  if (typeof window === "undefined") return "unknown";
  const value = String(window.localStorage.getItem(getTelemetryLookupCapabilityKey()) ?? "").trim().toLowerCase();
  if (value === "supported") return "supported";
  if (value === "unsupported") return "unsupported";
  return "unknown";
};

const setTelemetryLookupCapability = (value: "supported" | "unsupported") => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getTelemetryLookupCapabilityKey(), value);
};

const parseSseDataArray = (payload: string): any[] => {
  const raw = String(payload ?? "").trim();
  if (!raw) return [];

  // Try plain JSON first.
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray((parsed as any)?.items)) return (parsed as any).items;
  } catch {
    // Not plain JSON; continue with SSE parsing.
  }

  const lines = raw.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line.startsWith("data:")) continue;
    const dataChunk = line.slice(5).trim();
    if (!dataChunk) continue;
    try {
      const parsed = JSON.parse(dataChunk);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray((parsed as any)?.items)) return (parsed as any).items;
    } catch {
      // keep scanning older data lines
    }
  }

  return [];
};

const toEpoch = (value: unknown): number => {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const telemetryLookupViaTraccarLive = async (
  imei: string
): Promise<{ ok: boolean; status?: number; error?: string; body?: TelemetryLookupResponse }> => {
  const needle = String(imei ?? "").trim();
  if (!needle) return { ok: false, status: 400, error: "imei is required" };
  try {
    const liveRows = await getTraccarLive();
    const matched =
      liveRows.find((row) => String(row?.imei ?? "").trim() === needle) ??
      null;
    if (!matched?.position) {
      // Fall back to device list + empty position so Assets can still resolve IMEI presence.
      const devices = await getTraccarDevices({ uniqueId: needle });
      const device =
        devices.find((row) => String((row as any)?.uniqueId ?? "").trim() === needle) ??
        devices[0] ??
        null;
      if (!device) return { ok: false, status: 404, error: "Device not found in VIVI live" };
      return {
        ok: true,
        status: 200,
        body: {
          imei: needle,
          tenantId: getTenantId() || defaultTenantId,
          assets: [{ imei: needle, id: String((device as any)?.id ?? ""), name: String((device as any)?.name ?? "") }],
          events: [],
          latest: undefined
        }
      };
    }

    const position = matched.position;
    const at =
      String(position.fixTime ?? position.deviceTime ?? matched.lastUpdate ?? "").trim() ||
      new Date().toISOString();
    const speed = typeof position.speed === "number" ? position.speed : undefined;
    const latest = {
      at,
      lat: typeof position.lat === "number" ? position.lat : undefined,
      lng: typeof position.lng === "number" ? position.lng : undefined,
      speed,
      heading: typeof position.heading === "number" ? position.heading : undefined,
      movement:
        typeof speed === "number" ? (speed > 5 ? ("moving" as const) : ("stationary" as const)) : ("unknown" as const)
    };

    return {
      ok: true,
      status: 200,
      body: {
        imei: needle,
        tenantId: getTenantId() || defaultTenantId,
        assets: [
          {
            imei: needle,
            id: String(matched.deviceId ?? ""),
            name: String(matched.name ?? "")
          }
        ],
        events: [{ at, lat: latest.lat, lng: latest.lng, speed: latest.speed, source: "traccar-live" }],
        latest
      }
    };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
};

const telemetryLookupViaStream = async (
  imei: string,
  headers: Record<string, string>,
  tenantId: string
): Promise<{ ok: boolean; status?: number; error?: string; body?: TelemetryLookupResponse }> => {
  try {
    // Prefer the JSON live endpoint — SSE /stream/telemetry is not a request/response lookup API.
    const live = await telemetryLookupViaTraccarLive(imei);
    if (live.ok) return live;

    const streamUrl = buildUrl("/stream/telemetry?limit=300");
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), 8_000) : 0;
    const response = await fetch(streamUrl, {
      method: "GET",
      headers,
      ...(controller ? { signal: controller.signal } : {})
    });
    if (timeout) window.clearTimeout(timeout);
    const status = response.status;
    const text = await response.text();

    if (!response.ok) {
      return { ok: false, status, error: text || "Request failed" };
    }

    const rows = parseSseDataArray(text);
    const needle = String(imei ?? "").trim();
    const matched = rows.filter((row) => String((row as any)?.imei ?? "").trim() === needle);

    const sorted = [...matched].sort((a, b) => {
      const aTime = Math.max(toEpoch((a as any)?.lastSeen), toEpoch((a as any)?.at));
      const bTime = Math.max(toEpoch((b as any)?.lastSeen), toEpoch((b as any)?.at));
      return bTime - aTime;
    });
    const latestRow = sorted[0] ?? null;

    const latestSpeed = Number((latestRow as any)?.speed ?? 0);
    const movement: "moving" | "stationary" | "unknown" = Number.isFinite(latestSpeed)
      ? (latestSpeed > 5 ? "moving" : "stationary")
      : "unknown";

    const events = sorted.map((row) => ({
      at: (row as any)?.at ?? (row as any)?.lastSeen,
      lat: (row as any)?.lat,
      lng: (row as any)?.lng,
      speed: (row as any)?.speed,
      heading: (row as any)?.heading,
      source: "stream"
    }));

    const assets = latestRow
      ? [{
        imei: needle,
        name: (latestRow as any)?.name ?? "",
        status: (latestRow as any)?.status ?? "unknown",
        lastSeen: (latestRow as any)?.lastSeen ?? (latestRow as any)?.at,
        lat: (latestRow as any)?.lat,
        lng: (latestRow as any)?.lng,
        speed: (latestRow as any)?.speed,
        heading: (latestRow as any)?.heading
      }]
      : [];

    const body: TelemetryLookupResponse = {
      imei: needle,
      tenantId,
      assets,
      events,
      latest: latestRow
        ? {
          at: (latestRow as any)?.at ?? (latestRow as any)?.lastSeen,
          lat: (latestRow as any)?.lat,
          lng: (latestRow as any)?.lng,
          speed: (latestRow as any)?.speed,
          heading: (latestRow as any)?.heading,
          movement
        }
        : undefined
    };

    return { ok: true, status, body };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
};

export const getApiBaseUrl = () => getEffectiveApiBase();
export const buildApiUrl = (path: string) => buildUrl(path);
const canUseBuildTimeApiKey = () => {
  if (typeof window === "undefined") return false;
  const host = String(window.location?.hostname ?? "").trim().toLowerCase();
  return isLocalhostHostname(host);
};

export const getApiKey = () => {
  const stored = getStoredApiKey();
  if (stored) return stored;
  if (isApiKeyDisabled()) return "";
  if (!canUseBuildTimeApiKey()) return "";
  return buildTimeApiKey;
};

/** Localhost-only fallback. Never clear the stored session on data-endpoint 401/403. */
const getLocalDevFallbackApiKey = (currentApiKey: string) => {
  if (!canUseBuildTimeApiKey() || isApiKeyDisabled()) return "";
  const fallback = String(buildTimeApiKey ?? "").trim();
  if (!fallback || fallback === String(currentApiKey ?? "").trim()) return "";
  return fallback;
};

export async function sendDeviceCommand(
  deviceId: string,
  command: string,
  payload?: unknown
): Promise<{ ok: boolean; status?: number; body?: any; error?: string }> {
  const targetDeviceId = String(deviceId ?? "").trim();
  const action = String(command ?? "").trim();
  if (!targetDeviceId) return { ok: false, status: 400, error: "deviceId is required" };
  if (!action) return { ok: false, status: 400, error: "command is required" };

  try {
    const response = await fetch(buildUrl(`/device/${encodeURIComponent(targetDeviceId)}/command`), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildAuthHeaders(undefined, undefined)
      },
      body: JSON.stringify({ command: action, software: "Vision", payload: payload ?? {} })
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body,
        error: extractErrorMessage(body, text)
      };
    }
    return { ok: true, status: response.status, body };
  } catch (err: any) {
    return { ok: false, status: 0, error: String(err?.message ?? err) };
  }
}

export async function getDeviceDetails(deviceId: string): Promise<{ ok: boolean; status?: number; body?: any; error?: string }> {
  const targetDeviceId = String(deviceId ?? "").trim();
  if (!targetDeviceId) return { ok: false, status: 400, error: "deviceId is required" };

  try {
    const response = await fetch(buildUrl(`/device/${encodeURIComponent(targetDeviceId)}`), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        ...buildAuthHeaders(undefined, undefined)
      }
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body,
        error: extractErrorMessage(body, text)
      };
    }
    return { ok: true, status: response.status, body };
  } catch (err: any) {
    return { ok: false, status: 0, error: String(err?.message ?? err) };
  }
}

export type MarketingContactRequest = {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  topic: string;
  message: string;
  /** Honeypot — must stay empty for real submissions */
  website?: string;
};

export async function submitMarketingContactRequest(
  payload: MarketingContactRequest
): Promise<{ ok: boolean; message?: string; error?: string; fallbackMailto?: string }> {
  try {
    const name = String(payload?.name ?? "").trim();
    const email = String(payload?.email ?? "").trim();
    const message = String(payload?.message ?? "").trim();
    const topic = String(payload?.topic ?? "General enquiry").trim() || "General enquiry";
    if (!name) return { ok: false, error: "Name is required." };
    if (!email) return { ok: false, error: "Email is required." };

    const response = await fetchWithAuthRetry(buildUrl("/marketing/contact"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        company: String(payload?.company ?? "").trim() || undefined,
        phone: String(payload?.phone ?? "").trim() || undefined,
        topic,
        message,
        website: String(payload?.website ?? "").trim() || undefined
      })
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      return {
        ok: false,
        error: String(body?.error ?? body?.message ?? "Could not send your message. Please try again."),
        fallbackMailto: String(body?.fallbackMailto ?? "").trim() || undefined
      };
    }
    return {
      ok: true,
      message: String(body?.message ?? "Thank you. Your message was sent successfully.")
    };
  } catch (err: any) {
    return {
      ok: false,
      error: String(err?.message ?? err ?? "Could not reach the server. Please try again.")
    };
  }
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message?: string; resetUrl?: string; error?: string }> {
  try {
    const e = String(email ?? "").trim();
    if (!e) return { ok: false, error: "Email is required." };
    const response = await fetchWithAuthRetry(buildUrl("/auth/forgot-password"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ email: e })
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      return { ok: false, error: (body && (body.error || body.message)) || "Request failed" };
    }
    const message = String((body as any)?.message ?? "").trim();
    const resetUrl = String((body as any)?.resetUrl ?? "").trim();
    return { ok: true, ...(message ? { message } : {}), ...(resetUrl ? { resetUrl } : {}) };
  } catch (err: any) {
    const message = String(err?.message ?? err ?? "").trim();
    return { ok: false, error: message || "Could not reach the password reset service. Please try again." };
  }
}

export async function resetPassword(token: string, password: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const response = await fetchWithAuthRetry(buildUrl("/auth/reset-password"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ token, password })
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      return { ok: false, error: (body && (body.error || body.message)) || "Reset failed" };
    }
    const t = String((body as any)?.token ?? "").trim();
    return { ok: true, ...(t ? { token: t } : {}) };
  } catch (err: any) {
    const message = String(err?.message ?? err ?? "").trim();
    return { ok: false, error: message || "Could not reach the reset service. Please try again." };
  }
}

export async function registerDemoAccount(input: {
  name: string;
  email: string;
  password: string;
  organisation: string;
  dealer: string;
  database: string;
  site: string;
  region?: string;
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const response = await fetchWithAuthRetry(buildUrl("/auth/demo-signup"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      return { ok: false, error: String(body?.error ?? body?.message ?? "Could not create the demo account.") };
    }
    return { ok: true, message: String(body?.message ?? "Demo account created.") };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err ?? "Could not reach the signup service.") };
  }
}

export async function activateDemoAccount(userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return { ok: false, error: "Sign in required." };
    const response = await fetchWithAuthRetry(buildUrl("/auth/demo-activate"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({ userId })
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) return { ok: false, error: String(body?.error ?? "Could not activate this account.") };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err ?? "Could not activate this account.") };
  }
}

export async function dismissDemoTour(): Promise<{ ok: boolean; error?: string }> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return { ok: false, error: "Sign in required." };
    const response = await fetchWithAuthRetry(buildUrl("/auth/demo-tour"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({ dismiss: true })
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      return { ok: false, error: String(body?.error ?? "Could not save the demo guide.") };
    }
    rememberDemoSession(body?.demo ?? { ...readDemoSession(), showTour: false });
    dispatchAuthChange();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err ?? "Could not save the demo guide.") };
  }
}

export async function login(email: string, password: string, region?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (typeof window !== "undefined" && isLoopbackHost(String(window.location?.hostname ?? ""))) {
      const named = String(region ?? "").trim().toLowerCase();
      rememberActiveRegion(isRegionId(named) ? named : DEFAULT_REGION);
    }
    const response = await fetchWithAuthRetry(buildUrl("/auth/login"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ email, password, ...(region ? { region } : {}) })
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      const errLabel = String(body?.error ?? "").trim();
      const errDetail = String(body?.message ?? "").trim();
      const combined =
        errLabel && errDetail && errLabel !== errDetail
          ? `${errLabel}: ${errDetail}`
          : errLabel || errDetail || (typeof body === "string" ? body : "Login failed");
      return { ok: false, error: combined };
    }
    const token = String(body?.token ?? "").trim();
    if (!token) return { ok: false, error: "Login did not return a token." };
    // The principal is gone after a sign-out, so compare login emails to tell
    // "same account back" from "someone else on this browser".
    const previousEmail =
      typeof window === "undefined" ? "" : String(window.localStorage.getItem("vivi.auth.lastLoginEmail") ?? "").trim();
    const sameAccount = Boolean(previousEmail) && previousEmail.toLowerCase() === String(email ?? "").trim().toLowerCase();
    if (typeof window !== "undefined") {
      window.localStorage.setItem("vivi.auth.lastLoginEmail", String(email ?? "").trim());
      window.localStorage.removeItem("vivi.impersonatedLabel");
      window.localStorage.removeItem("vivi.adminApiKey");
      window.localStorage.removeItem("vivi.adminTenantId");
      window.localStorage.removeItem("vivi.returnSession");
    }
    if (typeof window !== "undefined") {
      // Drop prior site/org/session data before the new session hydrates
      // (this also saves the previous account's selection for its next login).
      clearSessionClientState(readActiveTenantId());
    }
    setStoredApiKey(token);
    await refreshAuthMe();
    // Same account back: land on the hierarchy and page it left.
    restoreSessionResume(sameAccount);
    return { ok: true };
  } catch (err: any) {
    const message = String(err?.message ?? err ?? "").trim();
    return { ok: false, error: message || "Could not reach the login service. Please try again." };
  }
}

/** Short in-memory cache to avoid repeat KV GETs (esp. when Cloudflare daily limits trip). */
const KV_LOAD_CACHE_TTL_MS = 30_000;
const kvLoadCache = new Map<string, { expiresAt: number; value: unknown | null }>();
const kvLoadInflight = new Map<string, Promise<unknown | null>>();

/** Drop cached KV reads after a successful write so the next load sees fresh data. */
export function invalidateKvLoadCache(key?: string) {
  if (!key) {
    kvLoadCache.clear();
    kvLoadInflight.clear();
    return;
  }
  const suffix = `::${key}`;
  for (const cacheKey of [...kvLoadCache.keys()]) {
    if (cacheKey.endsWith(suffix) || cacheKey === key) kvLoadCache.delete(cacheKey);
  }
  for (const cacheKey of [...kvLoadInflight.keys()]) {
    if (cacheKey.endsWith(suffix) || cacheKey === key) kvLoadInflight.delete(cacheKey);
  }
}

export function invalidateKvLoadCacheForSite(siteName: string) {
  const token = siteScopeToken(siteName);
  if (!token) return;
  const needle = `:site:${token}`;
  for (const cacheKey of [...kvLoadCache.keys()]) {
    if (cacheKey.includes(needle)) kvLoadCache.delete(cacheKey);
  }
  for (const cacheKey of [...kvLoadInflight.keys()]) {
    if (cacheKey.includes(needle)) kvLoadInflight.delete(cacheKey);
  }
}

registerKvCacheInvalidator((site) => {
  if (site) invalidateKvLoadCacheForSite(site);
  else invalidateKvLoadCache();
});

const isTransientNetworkError = (error: unknown, status = 0) => {
  if (status === 0 || status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const message = String((error as any)?.message ?? error ?? "");
  return /failed to fetch|networkerror|network request failed|http2|protocol_error|connection_closed|connection reset|econnreset|etimedout|timeout|aborted|load failed/i.test(
    message
  );
};

async function sleepMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cap parallel browser→Worker Traccar proxy streams.
 * Worker Traccar pool is 6; stay at that so Home / Live / History / Reports share one wave. */
const TRACCAR_PROXY_MAX_INFLIGHT = 6;
/** Cap how long a caller can wait for a free proxy slot (timeout starts after acquire). */
const TRACCAR_PROXY_SLOT_WAIT_MS = 25_000;
let traccarProxyInflight = 0;
const traccarProxyWaiters: Array<() => void> = [];

async function acquireTraccarProxySlot() {
  if (traccarProxyInflight < TRACCAR_PROXY_MAX_INFLIGHT) {
    traccarProxyInflight += 1;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const clearTimer =
      typeof globalThis.clearTimeout === "function"
        ? (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id)
        : () => undefined;
    const waiter = () => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      resolve();
    };
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      const index = traccarProxyWaiters.indexOf(waiter);
      if (index >= 0) traccarProxyWaiters.splice(index, 1);
      reject(new Error("Traccar proxy is busy. Try again in a moment."));
    }, TRACCAR_PROXY_SLOT_WAIT_MS);
    traccarProxyWaiters.push(waiter);
  });
  traccarProxyInflight += 1;
}

function releaseTraccarProxySlot() {
  traccarProxyInflight = Math.max(0, traccarProxyInflight - 1);
  const next = traccarProxyWaiters.shift();
  if (next) next();
}

async function withTraccarProxySlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireTraccarProxySlot();
  try {
    return await fn();
  } finally {
    releaseTraccarProxySlot();
  }
}

type TimedCacheEntry<T> = { atMs: number; value: T };

const liveSnapshotCache = new Map<string, { entry: TimedCacheEntry<any[]> | null; inflight: Promise<any[]> | null }>();
const LIVE_SNAPSHOT_TTL_MS = 8_000;
const TRACCAR_GET_CACHE_TTL_MS = 45_000;
const traccarGetCache = new Map<string, TimedCacheEntry<unknown>>();
const traccarGetInflight = new Map<string, Promise<unknown>>();

const clearRuntimeApiCaches = () => {
  invalidateKvLoadCache();
  liveSnapshotCache.clear();
  traccarGetCache.clear();
  traccarGetInflight.clear();
};

registerSessionCacheFlusher(clearRuntimeApiCaches);

const readTimedCache = <T>(store: Map<string, TimedCacheEntry<unknown>>, key: string, ttlMs: number): T | undefined => {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.atMs > ttlMs) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
};

const rememberTimedCache = <T>(store: Map<string, TimedCacheEntry<unknown>>, key: string, value: T) => {
  store.set(key, { atMs: Date.now(), value });
  if (store.size > 80) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
};

export async function saveToApi(key: string, payload: unknown): Promise<boolean> {
  guardFlatScopedKvAccess(key, "write");
  const tenantId = getTenantId();
  const apiKey = getApiKey();
  const normalizedKeyPath = encodeURIComponent(key).replace(/%3A/gi, ":");
  const attempt = async () =>
    fetch(buildUrl(`/kv/${normalizedKeyPath}`), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        ...(apiKey ? { "x-api-key": apiKey } : {})
      },
      body: JSON.stringify(payload ?? {})
    });

  const maxAttempts = 4;
  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    try {
      let response = await attempt();
      // Cloudflare KV quota/transient 503 — short retry often succeeds.
      if (response.status === 503 && attemptIndex < maxAttempts - 1) {
        await sleepMs(600 * (attemptIndex + 1));
        continue;
      }
      if (response.ok) {
        invalidateKvLoadCache(key);
        kvLoadCache.set(`${tenantId || "_"}::${key}`, {
          expiresAt: Date.now() + KV_LOAD_CACHE_TTL_MS,
          value: payload ?? null
        });
        return true;
      }
      if (isTransientNetworkError(null, response.status) && attemptIndex < maxAttempts - 1) {
        await sleepMs(250 * 2 ** attemptIndex + Math.random() * 100);
        continue;
      }
      return false;
    } catch (err) {
      if (attemptIndex >= maxAttempts - 1 || !isTransientNetworkError(err)) return false;
      await sleepMs(250 * 2 ** attemptIndex + Math.random() * 100);
    }
  }
  return false;
}

export async function loadFromApi<T = unknown>(key: string): Promise<T | null> {
  guardFlatScopedKvAccess(key, "read");
  const cacheKey = `${getTenantId() || "_"}::${key}`;
  const cached = kvLoadCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T | null;
  }

  const inflight = kvLoadInflight.get(cacheKey);
  if (inflight) return (await inflight) as T | null;

  const request = (async (): Promise<T | null> => {
    try {
      const tenantId = getTenantId();
      const apiKey = getApiKey();
      const normalizedKeyPath = encodeURIComponent(key).replace(/%3A/gi, ":");
      const response = await fetch(buildUrl(`/kv/${normalizedKeyPath}`), {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...(tenantId ? { "x-tenant-id": tenantId } : {}),
          ...(apiKey ? { "x-api-key": apiKey } : {})
        }
      });

      if (response.status === 404) {
        kvLoadCache.set(cacheKey, { expiresAt: Date.now() + KV_LOAD_CACHE_TTL_MS, value: null });
        return null;
      }
      if (!response.ok) {
        // Do NOT cache failures as null — that made post-deploy cold starts look like
        // empty storage and caused callers to overwrite real KV with bundled defaults.
        return null;
      }
      const text = await response.text();
      if (!text || text.trim() === "null") {
        kvLoadCache.set(cacheKey, { expiresAt: Date.now() + KV_LOAD_CACHE_TTL_MS, value: null });
        return null;
      }
      try {
        const parsed = JSON.parse(text) as T;
        kvLoadCache.set(cacheKey, { expiresAt: Date.now() + KV_LOAD_CACHE_TTL_MS, value: parsed });
        return parsed;
      } catch {
        // Invalid JSON is not authoritative empty storage — do not cache.
        return null;
      }
    } catch {
      // Network errors must not be cached as empty keys.
      return null;
    } finally {
      kvLoadInflight.delete(cacheKey);
    }
  })();

  kvLoadInflight.set(cacheKey, request);
  return request;
}

export type SiteTimeZoneSettings = {
  defaultTimeZone?: string;
  sites?: Record<string, string>;
  updatedAt?: string;
};

export const SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT = "vivi.siteTimeZones.updated";

const siteTimeZoneSettingsKey = () => `settings:siteTimeZones`;

const normalizeSiteKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

export async function getSiteTimeZoneSettings(): Promise<SiteTimeZoneSettings | null> {
  return loadFromApi<SiteTimeZoneSettings>(siteTimeZoneSettingsKey());
}

export async function saveSiteTimeZoneSettings(settings: SiteTimeZoneSettings): Promise<boolean> {
  const next: SiteTimeZoneSettings = {
    defaultTimeZone: String(settings?.defaultTimeZone ?? "").trim() || undefined,
    sites: settings?.sites ?? {},
    updatedAt: new Date().toISOString()
  };
  const ok = await saveToApi(siteTimeZoneSettingsKey(), next);
  if (ok && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT, { detail: next }));
  }
  return ok;
}

export function resolveTimeZoneForSite(site: unknown, settings: SiteTimeZoneSettings | null | undefined): string {
  const fallback = String(settings?.defaultTimeZone ?? "").trim() || "Africa/Dar_es_Salaam";
  const sites = settings?.sites ?? {};
  const needle = normalizeSiteKey(site) || (
    typeof window !== "undefined" ? normalizeSiteKey(window.localStorage.getItem("vivi.activeSite")) : ""
  );

  // Prefer Org Ribbon → Set Timezone for the site (exact key match).
  if (needle) {
    for (const [k, v] of Object.entries(sites)) {
      if (normalizeSiteKey(k) === needle) {
        const tz = String(v ?? "").trim();
        if (tz) return tz;
      }
    }
  }

  // Practical built-in mapping only when no site override is saved.
  if (needle.includes("dar es salaam") || needle === "dar" || needle === "tanzania") {
    return "Africa/Dar_es_Salaam";
  }

  return fallback;
}

/** Prefer stable regional abbreviations over browser GMT+N labels. */
const TIME_ZONE_ABBR_BY_IANA: Record<string, string> = {
  UTC: "UTC",
  "Africa/Dar_es_Salaam": "EAT",
  "Africa/Nairobi": "EAT",
  "Africa/Kampala": "EAT",
  "Africa/Addis_Ababa": "EAT",
  "Africa/Johannesburg": "SAST",
  "Africa/Lagos": "WAT",
  "Africa/Accra": "GMT",
  "Africa/Cairo": "EET",
  "Africa/Harare": "CAT",
  "Africa/Lusaka": "CAT",
  "Africa/Maputo": "CAT",
  "Africa/Kigali": "CAT",
  "Africa/Khartoum": "CAT",
  "Europe/London": "GMT",
  "America/New_York": "EST",
  "America/Los_Angeles": "PST",
  "Asia/Dubai": "GST",
  "Asia/Singapore": "SGT",
  "Asia/Tokyo": "JST"
};

/**
 * Format an absolute timestamp in the configured site time zone.
 * Site settings come from Org Ribbon → Set Timezone (per site).
 */
export function formatTimestampForSite(
  value: unknown,
  site: unknown,
  settings: SiteTimeZoneSettings | null | undefined
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  const timeZone = resolveTimeZoneForSite(site, settings);
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short"
    }).formatToParts(new Date(parsed));
    const dt = formatted
      .filter((part) => part.type !== "timeZoneName")
      .map((part) => part.value)
      .join("")
      .replace(",", "")
      .trim();
    const tzRaw = String(formatted.find((part) => part.type === "timeZoneName")?.value ?? "").trim();
    const mapped = TIME_ZONE_ABBR_BY_IANA[timeZone];
    // Browsers often emit GMT+3 / UTC+02:00 for African zones — never show those offsets.
    const isOffsetLabel = /(?:gmt|utc)\s*[+-]/i.test(tzRaw) || /^[+-]\d/.test(tzRaw);
    const tzLabel = mapped || (!isOffsetLabel && tzRaw ? tzRaw : "") || "EAT";
    return `${dt} ${tzLabel}`;
  } catch {
    const dt = new Date(parsed)
      .toLocaleString("en-GB", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      })
      .replace(",", "");
    return `${dt} ${TIME_ZONE_ABBR_BY_IANA[timeZone] || "EAT"}`;
  }
}

export async function downloadAuthenticatedFile(
  path: string,
  filename?: string
): Promise<{ ok: boolean; error?: string }> {
  const maxAttempts = 3;
  try {
    const tenantId = getTenantId();
    const initialApiKey = getApiKey();
    const hadStoredToken = Boolean(getStoredApiKey());
    const doFetch = async (apiKey: string) =>
      fetchWithAuthRetry(buildUrl(path, tenantId), {
        method: "GET",
        headers: buildAuthHeaders(tenantId, apiKey)
      });

    let response: Response | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let apiKey = initialApiKey;
      if (attempt > 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 400 * attempt));
      }
      response = await doFetch(apiKey);
      if ((response.status === 401 || response.status === 403) && hadStoredToken) {
        const fallbackApiKey = getLocalDevFallbackApiKey(apiKey);
        if (fallbackApiKey) {
          apiKey = fallbackApiKey;
          response = await doFetch(apiKey);
        }
      }
      if (response.ok) break;
      if (response.status === 404) break;
      if (attempt === maxAttempts) break;
    }

    if (!response || !response.ok) {
      if (response?.status === 404) {
        return { ok: false, error: "Mitac software package is not available yet. Contact support." };
      }
      return { ok: false, error: `Download failed (${response?.status ?? 0}). Try again in a moment.` };
    }

    const blob = await response.blob();
    if (!blob.size) {
      return { ok: false, error: "Download failed: empty file received." };
    }
    const header = response.headers.get("content-disposition") ?? "";
    const match = /filename=\"?([^\";]+)\"?/i.exec(header);
    const resolvedName = String(filename ?? match?.[1] ?? "Vivitel_Mitac_Pack.zip").trim();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = resolvedName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return { ok: true };
  } catch {
    return { ok: false, error: "Download failed. Check your connection and try again." };
  }
}

export async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const method = String(options.method ?? "GET").toUpperCase();
    const requestPath = String(path ?? "").split("?")[0] ?? "";
    const isSupportPresenceWrite =
      method === "POST" && /^\/support\/agents\/[^/]+\/heartbeat$/i.test(requestPath);
    // Hierarchy CRUD is authorized by role scope on the server, not by whichever app page
    // is open. Driver writes use the Drivers page role, not the current route.
    const isHierarchyApi = /^\/b2\/hierarchy(\/|$)/i.test(requestPath);
    const isHierarchyRepair = /^\/admin\/traccar\/repair-site-groups$/i.test(requestPath);
    const isDriversApi = /^\/d1\/drivers$/i.test(requestPath);
    const isCmsv6Api = /^\/cmsv6(\/|$)/i.test(requestPath);
    const isCameraLiveSession = /^\/camera\/live\/session$/i.test(requestPath);
    const bypassPagePermissionGate =
      isSupportPresenceWrite || isHierarchyApi || isHierarchyRepair || isDriversApi || isCmsv6Api || isCameraLiveSession;
    if (method === "DELETE") {
      if (!bypassPagePermissionGate && !canForCurrentPath("delete")) return null;
    } else if (!bypassPagePermissionGate && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      if (!canForCurrentPath("edit")) return null;
    }
    const tenantId = getTenantId();
    const initialApiKey = getApiKey();
    const hadStoredToken = Boolean(getStoredApiKey());
    const siteName = readActiveSiteName();
    const needsSiteHeader = /^\/cmsv6(\/|$)/i.test(requestPath) || /^\/camera\/live\/session$/i.test(requestPath);
    const signedIn = needsSiteHeader ? readSignedInUser() : null;
    const doFetch = async (apiKey: string) =>
      fetch(buildUrl(path, tenantId), {
        ...options,
        headers: {
          "content-type": "application/json",
          ...(tenantId ? { "x-tenant-id": tenantId } : {}),
          ...(apiKey ? { "x-api-key": apiKey } : {}),
          ...(needsSiteHeader && siteName ? { "x-site-name": siteName } : {}),
          ...(signedIn?.userId ? { "x-vivi-user-id": signedIn.userId } : {}),
          ...(signedIn?.email ? { "x-vivi-user-email": signedIn.email } : {}),
          ...(signedIn?.name ? { "x-vivi-user-name": signedIn.name } : {}),
          ...(options.headers ?? {})
        }
      });

    let response = await doFetch(initialApiKey);
    if ((response.status === 401 || response.status === 403) && hadStoredToken) {
      const fallbackApiKey = getLocalDevFallbackApiKey(initialApiKey);
      if (fallbackApiKey) {
        response = await doFetch(fallbackApiKey);
      }
    }
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Persist a report-run snapshot on the server (hot store).
 * After REPORT_ARCHIVE_HOT_DAYS (90 days) the VPS promotes a copy to Vivi-Reports B2.
 */
export async function archiveReportRunToServer(args: {
  site?: string;
  title?: string;
  payload: unknown;
  createdAt?: string;
}): Promise<{ ok: boolean; reportId?: string; storageKey?: string } | null> {
  return fetchJson<{ ok: boolean; reportId?: string; storageKey?: string }>("/reports/archive", {
    method: "POST",
    body: JSON.stringify({
      site: args.site ?? "",
      title: args.title ?? "",
      createdAt: args.createdAt ?? new Date().toISOString(),
      payload: args.payload
    })
  });
}

export type ReportArchiveSummary = {
  report_id: string;
  tenant_id: string;
  site: string;
  title: string;
  created_at: string;
  storage: string;
  content_type: string;
  size_bytes: number;
};

export async function listReportArchivesFromServer(args: {
  site?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ reports: ReportArchiveSummary[]; hasMore: boolean } | null> {
  const query = new URLSearchParams({
    limit: String(args.limit ?? 50),
    offset: String(args.offset ?? 0)
  });
  if (args.site) query.set("site", args.site);
  return fetchJson<{ reports: ReportArchiveSummary[]; hasMore: boolean }>(
    `/reports/archive?${query.toString()}`
  );
}

export async function getReportArchiveFromServer<T = unknown>(
  reportId: string
): Promise<{ reportId: string; title: string; createdAt: string; payload: T } | null> {
  const encodedReportId = encodeURIComponent(reportId);
  return fetchJson<{ reportId: string; title: string; createdAt: string; payload: T }>(
    `/reports/archive/${encodedReportId}`
  );
}

async function fetchPublicJson<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const response = await fetch(buildUrl(path), {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers ?? {})
      }
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export type LiveShareCreateRequest = {
  assetId: string;
  expiresAt?: string;
  includeDriver?: boolean;
  includeAssetMeta?: boolean;
  comment?: string;
};

export type LiveShareCreateResponse = {
  token: string;
  createdAt: string;
  expiresAt: string;
  ttlSeconds: number;
};

export type LiveShareSnapshot = {
  ok: boolean;
  share: { createdAt: string; expiresAt: string; comment: string | null };
  asset: Record<string, unknown>;
  latest: { lat: number | null; lng: number | null; at: string | null; speed: number | null };
};

export type LiveShareEmailRequest = {
  to: string | string[];
  shareUrl: string;
  assetLabel?: string;
  expiresAt?: string;
  comment?: string;
};

export type LiveShareEmailResponse = {
  ok: boolean;
  emailSent: boolean;
  requestId?: string;
  recipients?: number;
  error?: string;
};

export type LiveShareActiveInfo = {
  active: boolean;
  expiresAt?: string;
  token?: string;
};

export async function createLiveShareLink(input: LiveShareCreateRequest): Promise<LiveShareCreateResponse | null> {
  const assetId = String(input?.assetId ?? "").trim();
  if (!assetId) return null;
  return fetchJson<LiveShareCreateResponse>("/share/live", {
    method: "POST",
    body: JSON.stringify({
      assetId,
      expiresAt: input.expiresAt ?? undefined,
      includeDriver: Boolean(input.includeDriver),
      includeAssetMeta: Boolean(input.includeAssetMeta),
      comment: String(input.comment ?? "").trim() || undefined
    })
  });
}

export async function getLiveShareSnapshot(token: string): Promise<LiveShareSnapshot | null> {
  const t = String(token ?? "").trim();
  if (!t) return null;
  return fetchPublicJson<LiveShareSnapshot>(`/share/live/${encodeURIComponent(t)}`);
}

export async function sendLiveShareEmail(input: LiveShareEmailRequest): Promise<LiveShareEmailResponse | null> {
  const to = Array.isArray(input?.to)
    ? input.to.map((v) => String(v ?? "").trim()).filter(Boolean)
    : String(input?.to ?? "")
        .split(/[;,]/)
        .map((v) => v.trim())
        .filter(Boolean);
  const shareUrl = String(input?.shareUrl ?? "").trim();
  if (!to.length || !shareUrl) return null;

  return fetchJson<LiveShareEmailResponse>("/share/live/email", {
    method: "POST",
    body: JSON.stringify({
      to,
      shareUrl,
      assetLabel: String(input?.assetLabel ?? "").trim() || undefined,
      expiresAt: String(input?.expiresAt ?? "").trim() || undefined,
      comment: String(input?.comment ?? "").trim() || undefined
    })
  });
}

export async function getLiveShareActive(assetIds: string[]): Promise<Record<string, LiveShareActiveInfo> | null> {
  const ids = Array.isArray(assetIds)
    ? assetIds
        .map((v) => String(v ?? "").trim())
        .filter((id) => Boolean(id) && !id.toLowerCase().startsWith("cms808:"))
        .slice(0, 500)
    : [];
  if (!ids.length) return {};

  const result = await fetchJson<{ active?: Record<string, LiveShareActiveInfo> }>("/share/live/active", {
    method: "POST",
    body: JSON.stringify({ assetIds: ids })
  });
  return result?.active ?? null;
}

async function fetchJsonForTenant<T>(
  path: string,
  options: RequestInit,
  tenantIdOverride: string | null
): Promise<{ ok: boolean; status?: number; body?: T; text?: string }>
{
  try {
    const initialApiKey = getApiKey();
    const hadStoredToken = Boolean(getStoredApiKey());
    const doFetch = async (apiKey: string) => {
      const headers = {
        "content-type": "application/json",
        ...buildAuthHeaders(tenantIdOverride, apiKey),
        ...(options.headers ?? {})
      };
      const explicitTenantId = tenantIdOverride === null ? "" : String(tenantIdOverride ?? "").trim();
      return fetch(buildUrl(path, explicitTenantId), { ...options, headers });
    };

    let response = await doFetch(initialApiKey);
    if ((response.status === 401 || response.status === 403) && hadStoredToken) {
      const fallbackApiKey = getLocalDevFallbackApiKey(initialApiKey);
      if (fallbackApiKey) {
        response = await doFetch(fallbackApiKey);
      }
    }
    const status = response.status;
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) return { ok: false, status, body: body ?? undefined, text };
    return { ok: true, status, body: (body as T) ?? undefined, text };
  } catch (err: any) {
    return { ok: false, status: 0, text: String(err?.message ?? err) };
  }
}

function extractErrorMessage(body: unknown, fallbackText: string) {
  if (body && typeof body === "object") {
    const anyBody = body as any;
    const m = anyBody?.error ?? anyBody?.message;
    if (m) return String(m);
    try {
      return JSON.stringify(body);
    } catch {
      // ignore
    }
  }
  const t = String(fallbackText ?? "").trim();
  return t || "Request failed";
}

const legacyAssetsCacheKey = "vivi.assets";
const assetsCacheKey = () => {
  const tenantId = getTenantId();
  return tenantId ? `vivi.assets:${tenantId}` : legacyAssetsCacheKey;
};

/** Instant first paint for Live Tracking / Home / History from the last assets list. */
export function peekCachedAssets<T = unknown>(): T[] {
  return readCachedAssets<T>();
}

/** Drop tenant asset cache so the next load hits the API (cross-user catalog updates). */
export function clearCachedAssets(tenantIdOverride?: string | null) {
  if (typeof window === "undefined") return;
  const tenantId = String(tenantIdOverride ?? readActiveTenantId() ?? getTenantId() ?? "").trim();
  try {
    if (tenantId) window.localStorage.removeItem(`vivi.assets:${tenantId}`);
    window.localStorage.removeItem(legacyAssetsCacheKey);
  } catch {
    // ignore
  }
}

export function peekCachedBindings<T = unknown>(type: "notifications" | "locations" | "devices"): T[] {
  return readCachedBindings<T>(type);
}

/** Synchronous KV memory-cache hit (undefined = no warm entry). */
export function peekFromApi<T = unknown>(key: string): T | null | undefined {
  guardFlatScopedKvAccess(key, "read");
  const cacheKey = `${getTenantId() || "_"}::${key}`;
  const cached = kvLoadCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) return undefined;
  return cached.value as T | null;
}

function readCachedAssets<T>(): T[] {
  if (typeof window === "undefined") return [];
  const tenantId = readActiveTenantId();
  if (!tenantId) return [];
  return readCachedAssetsForTenant<T>(tenantId);
}

function readCachedAssetsForTenant<T>(tenantId: string): T[] {
  if (typeof window === "undefined") return [];
  const id = String(tenantId ?? "").trim();
  if (!id) return [];
  try {
    const raw = window.localStorage.getItem(`vivi.assets:${id}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return overlayLivePositions(id, canonicalizeAssetRows(parsed as T[]));
  } catch {
    return [];
  }
}

function readSiteNeedleForAssets(): { siteNeedle: string; pathNames: string[] } {
  const pathNames = readStoredHierarchyPathNames();
  const siteName =
    typeof window === "undefined"
      ? ""
      : readActiveSiteName() || String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
  return { siteNeedle: siteName || pathNames[pathNames.length - 1] || "", pathNames };
}

function peekPublishedTenantAssets<T>(currentTenantId: string): T[] {
  const { siteNeedle, pathNames } = readSiteNeedleForAssets();
  const publishedId = publishedTenantIdForSite(siteNeedle, pathNames);
  if (!publishedId || publishedId === currentTenantId) return [];
  const rows = readCachedAssetsForTenant<T>(publishedId);
  if (!rows.length || scoreTenantAssetRows(rows, siteNeedle || "MMULU COMPANY") <= 1) return [];
  adoptDatabaseTenant(publishedId, siteNeedle || "MMULU COMPANY", PUBLISHED_MMULU_PATH);
  rememberAuthoritativeAssets(publishedId);
  writeCachedAssets(rows as unknown[]);
  return rows;
}

async function adoptPublishedTenantAssets<T>(currentTenantId: string): Promise<T[]> {
  const peeked = peekPublishedTenantAssets<T>(currentTenantId);
  if (peeked.length) return peeked;
  const { siteNeedle, pathNames } = readSiteNeedleForAssets();
  const publishedId = publishedTenantIdForSite(siteNeedle, pathNames);
  if (!publishedId || publishedId === currentTenantId) return [];
  const rows = await getAssetsFromApiForTenant<T>(publishedId);
  if (!rows.length || scoreTenantAssetRows(rows, siteNeedle || "MMULU COMPANY") <= 1) return [];
  adoptDatabaseTenant(publishedId, siteNeedle || "MMULU COMPANY", PUBLISHED_MMULU_PATH);
  rememberAuthoritativeAssets(publishedId);
  writeCachedAssets(rows as unknown[]);
  return rows;
}

const ASSET_LIST_FRESH_MS = 45_000;
const assetFetchInflight = new Map<string, Promise<unknown[]>>();

function assetCacheStampKey(tenantId: string) {
  return `vivi.assets.at:${tenantId}`;
}

function readAssetCacheAgeMs(tenantId: string): number {
  if (typeof window === "undefined" || !tenantId) return Number.POSITIVE_INFINITY;
  const raw = Number(window.localStorage.getItem(assetCacheStampKey(tenantId)) ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return Number.POSITIVE_INFINITY;
  return Date.now() - raw;
}

function readRawCachedAssets(tenantId: string): unknown[] {
  if (typeof window === "undefined") return [];
  const id = String(tenantId ?? "").trim();
  if (!id) return [];
  try {
    const raw = window.localStorage.getItem(`vivi.assets:${id}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedAssetsForTenant(tenantId: string, value: unknown[]): unknown[] {
  const incoming = Array.isArray(value) ? value : [];
  if (typeof window === "undefined") return incoming;
  const id = String(tenantId ?? "").trim();
  if (!id) return incoming;
  const merged = mergeAssetsKeepingNewerLive(incoming, readRawCachedAssets(id));
  const withLive = overlayLivePositions(id, merged);
  try {
    window.localStorage.setItem(`vivi.assets:${id}`, JSON.stringify(withLive));
    window.localStorage.setItem(assetCacheStampKey(id), String(Date.now()));
  } catch {
    // ignore
  }
  rememberLivePositions(id, withLive as Array<Record<string, unknown>>);
  return withLive;
}

function writeCachedAssets(value: unknown[]): unknown[] {
  const tenantId = readActiveTenantId();
  const incoming = Array.isArray(value) ? value : [];
  if (!tenantId) return incoming;
  return writeCachedAssetsForTenant(tenantId, incoming);
}

function dedupeAssetFetch<T>(tenantId: string, loader: () => Promise<T[]>): Promise<T[]> {
  const key = String(tenantId ?? "").trim() || "_";
  const existing = assetFetchInflight.get(key);
  if (existing) return existing as Promise<T[]>;
  const pending = loader().finally(() => {
    if (assetFetchInflight.get(key) === pending) assetFetchInflight.delete(key);
  });
  assetFetchInflight.set(key, pending as Promise<unknown[]>);
  return pending;
}

function upsertCachedAsset(record: any) {
  const next = [...readCachedAssets<any>()];
  const recordId = String(record?.id ?? "").trim();
  const recordImei = String(record?.imei ?? "").trim();
  const idx = recordId
    ? next.findIndex((x) => String((x as any)?.id ?? "").trim() === recordId)
    : recordImei
      ? next.findIndex((x) => String((x as any)?.imei ?? "").trim() === recordImei)
      : -1;
  if (idx >= 0) next.splice(idx, 1);
  next.unshift(record);
  writeCachedAssets(next);
}

const pickText = (...values: unknown[]) => {
  for (const value of values) {
    const raw = String(value ?? "").trim();
    if (raw && raw !== "--") return raw;
  }
  return "";
};

export function canonicalizeAssetRecord<T = Record<string, unknown>>(raw: T): T {
  const row = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  const imei = pickText(row.imei, row.uniqueId);
  const registration = pickText(row.registration, row.regNumber, row.reg);
  const assetIdRaw = Number(row.assetId ?? row.asset_id);
  if (imei) row.imei = imei;
  if (registration) row.registration = registration;
  // ISP Serial Number / Fleet number ← GPS IoT Sim.SimSerial (also accept Gsm aliases elsewhere).
  const fleetNumber = pickText(row.fleetNumber, row.ispSerial, row.ispSerialNumber, row.SimSerial, row.simSerial);
  if (fleetNumber) row.fleetNumber = fleetNumber;
  const msisdn = pickText(row.msisdn, row.GsmNo, row.gsmNo, row.GsmNumber, row.gsmNumber);
  if (msisdn) row.msisdn = msisdn;
  const imsi = pickText(row.imsi, row.IMSI);
  if (imsi) row.imsi = imsi;
  const netProvider = pickText(row.netProvider, row.NetProvider);
  if (netProvider) row.netProvider = netProvider;
  const lastPosition = pickText(row.lastPosition, row.last_position, row.lastSeen, row.last_seen);
  if (lastPosition) row.lastPosition = lastPosition;
  const lastTrip = pickText(row.lastTrip, row.last_trip);
  if (lastTrip) row.lastTrip = lastTrip;
  const lastSeen = pickText(row.lastSeen, row.last_seen, row.lastPosition);
  if (lastSeen) row.lastSeen = lastSeen;
  const country = pickText(row.country);
  if (country) row.country = country;
  const assetType = pickText(row.assetType, row.asset_type);
  if (assetType) row.assetType = assetType;
  const make = pickText(row.make);
  if (make) row.make = make;
  const year = pickText(row.year);
  if (year) row.year = year;
  const vin = pickText(row.vin);
  if (vin) row.vin = vin;
  const engineNumber = pickText(row.engineNumber, row.engine_no, row.engineNo);
  if (engineNumber) row.engineNumber = engineNumber;
  const model = pickText(row.model, row.mobileModel);
  if (model) row.model = model;
  if (Number.isFinite(assetIdRaw) && assetIdRaw > 0) row.assetId = assetIdRaw;
  const description = formatAssetDescription(row);
  if (description) row.assetDescription = description;
  return row as T;
}

function canonicalizeAssetRows<T>(rows: T[] | null | undefined): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => canonicalizeAssetRecord(row));
}

function readAllowedTenantIds(): string[] {
  const cached = getCachedPrincipal() as { allowedTenants?: unknown; principal?: { allowedTenants?: unknown } } | null;
  const rows = [
    ...(Array.isArray(cached?.allowedTenants) ? cached.allowedTenants : []),
    ...(Array.isArray(cached?.principal?.allowedTenants) ? cached.principal.allowedTenants : [])
  ];
  return rows
    .map((value) => String(value ?? "").trim())
    .filter((id, index, all) => id.includes(":") && !isSyntheticTenantId(id) && all.indexOf(id) === index);
}

function rememberAuthoritativeAssets(tenantId: string) {
  if (typeof window === "undefined" || !tenantId) return;
  try {
    window.localStorage.setItem(`vivi.assets.importedFromTraccar.v5:${tenantId}`, "true");
  } catch {
    // ignore
  }
}

function adoptDatabaseTenant(tenantId: string, siteName = "", path = "") {
  const parts = String(tenantId ?? "")
    .split(":")
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  if (parts.length < 3 || typeof window === "undefined") return;
  const next = parts.join(":");
  const current = readActiveTenantId();
  const scope = String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim().toLowerCase();
  if (current === next) {
    // Same database — do not rewrite site/path. That fights the org ribbon and
    // makes the Assets list filter assets out after a later refresh tick.
    return;
  }
  activateTenantContext(next);
  try {
    window.localStorage.setItem("vivi.tenantId", next);
    window.localStorage.setItem("vivi.activeDealerId", parts[0]);
    window.localStorage.setItem("vivi.activeOrgId", parts[1]);
    window.localStorage.setItem("vivi.activeDbId", parts[2]);
    if ((scope === "site" || scope === "asset") && siteName) {
      window.localStorage.setItem("vivi.activeSite", siteName);
    }
    if (path && !String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim()) {
      window.localStorage.setItem("vivi.selectedPath", path);
    }
  } catch {
    // ignore
  }
}

function readStoredHierarchyPathNames(): string[] {
  if (typeof window === "undefined") return [];
  return String(window.localStorage.getItem("vivi.selectedPath") ?? "")
    .split("/")
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
}

async function ensureLiveDatabaseTenant(currentTenantId: string): Promise<string> {
  const current = String(currentTenantId ?? "").trim();
  // A real selected database must stay selected. Re-probing on every assets
  // fetch was swapping tenants and wiping the Assets page after ~30s.
  // Legacy flat ids like west-africa are not database tenants — recover below.
  if (current && isDatabaseTenant(current) && !isSyntheticTenantId(current) && !isLegacyFlatTenantId(current)) {
    return current;
  }

  const siteName =
    typeof window === "undefined" ? "" : String(window.localStorage.getItem("vivi.activeSite") ?? "");
  const pathNames = readStoredHierarchyPathNames();
  const siteNeedle = siteName || pathNames[pathNames.length - 1] || "";
  const publishedTenantId = publishedTenantIdForSite(siteNeedle, pathNames);
  if (publishedTenantId) {
    const publishedRows = await getAssetsFromApiForTenant(publishedTenantId);
    if (scoreTenantAssetRows(publishedRows, siteNeedle || "MMULU COMPANY") > 1) {
      adoptDatabaseTenant(publishedTenantId, siteNeedle || "MMULU COMPANY", PUBLISHED_MMULU_PATH);
      rememberAuthoritativeAssets(publishedTenantId);
      return publishedTenantId;
    }
  }
  const hierarchy = await getHierarchy();
  if (isHierarchyUnavailable(hierarchy) || !Array.isArray(hierarchy.dealers) || !hierarchy.dealers.length) {
    return currentTenantId && !isSyntheticTenantId(currentTenantId) ? currentTenantId : "";
  }
  const databaseName = pathNames.find((part) => /transfleet|fleet/i.test(part)) || pathNames[2] || "";
  const resolved = resolveDatabaseTenantFromHierarchy({
    rows: hierarchy.dealers,
    dealerId: typeof window === "undefined" ? "" : String(window.localStorage.getItem("vivi.activeDealerId") ?? ""),
    orgId: typeof window === "undefined" ? "" : String(window.localStorage.getItem("vivi.activeOrgId") ?? ""),
    dbId: typeof window === "undefined" ? "" : String(window.localStorage.getItem("vivi.activeDbId") ?? ""),
    pathNames,
    siteName: siteNeedle
  });
  const uniqueIds = (ids: string[]) =>
    ids.filter((id, index, all) => id && !isSyntheticTenantId(id) && all.indexOf(id) === index);

  const siteCandidates = uniqueIds([
    publishedTenantId,
    resolved?.tenantId ?? "",
    currentTenantId,
    ...collectTenantIdsForSite(hierarchy.dealers, siteNeedle),
    ...collectTenantIdsForSiteOrDatabase(hierarchy.dealers, siteNeedle, databaseName)
  ]);
  const extraCandidates = uniqueIds([...readAllowedTenantIds(), ...discoverCachedTenantIds()]).filter(
    (id) => !siteCandidates.includes(id)
  );

  const scoreSite = resolved?.siteName || siteNeedle;
  const pickRichest = async (ids: string[]) => {
    const probed = await Promise.all(
      ids.slice(0, 24).map(async (id) => ({
        id,
        score: scoreTenantAssetRows(await getAssetsFromApiForTenant(id), scoreSite)
      }))
    );
    return probed.reduce(
      (best, row) => (row.score > best.score ? row : best),
      { id: ids[0] || "", score: -1 }
    );
  };

  let tenantId = resolved?.tenantId || (currentTenantId && !isSyntheticTenantId(currentTenantId) ? currentTenantId : "");
  let best = siteCandidates.length ? await pickRichest(siteCandidates) : { id: tenantId, score: -1 };
  if (best.score <= 1 && extraCandidates.length) {
    const extra = await pickRichest([best.id, ...extraCandidates].filter(Boolean));
    if (extra.score > best.score) best = extra;
  }
  if (best.id) tenantId = best.id;
  if (!tenantId) return "";
  const path =
    hierarchyPathForTenant(hierarchy.dealers, tenantId, scoreSite) ||
    (tenantId === publishedTenantId ? PUBLISHED_MMULU_PATH : "");
  if (tenantId && tenantId !== currentTenantId) {
    adoptDatabaseTenant(tenantId, resolved?.siteName || siteNeedle || "MMULU COMPANY", path);
  }
  if (best.score > 1) rememberAuthoritativeAssets(tenantId);
  return tenantId;
}

export async function getAssetsFromApi<T = unknown>(options?: { force?: boolean }): Promise<T[]> {
  let tenantId = readActiveTenantId();
  if (!tenantId && typeof window !== "undefined") {
    const parts = [
      window.localStorage.getItem("vivi.activeDealerId"),
      window.localStorage.getItem("vivi.activeOrgId"),
      window.localStorage.getItem("vivi.activeDbId")
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    if (parts.length >= 3 && !isSyntheticTenantId(parts.join(":"))) {
      tenantId = parts.join(":");
      try {
        window.localStorage.setItem("vivi.tenantId", tenantId);
      } catch {
        // ignore
      }
    }
  }

  const liveTenantId = await ensureLiveDatabaseTenant(tenantId);
  if (liveTenantId) tenantId = liveTenantId;
  if (!tenantId || isSyntheticTenantId(tenantId)) return [];

  const force = Boolean(options?.force);
  const requestTenantId = tenantId;
  const stillActiveTenant = () => {
    const active = readActiveTenantId();
    if (active === requestTenantId) return true;
    const { siteNeedle, pathNames } = readSiteNeedleForAssets();
    const publishedId = publishedTenantIdForSite(siteNeedle, pathNames);
    return Boolean(publishedId && active === publishedId);
  };
  if (!force) {
    const cached = readCachedAssets<T>();
    if (cached.length) {
      if (readAssetCacheAgeMs(requestTenantId) > ASSET_LIST_FRESH_MS) {
        void getAssetsFromApi<T>({ force: true }).catch(() => undefined);
      }
      return cached;
    }
    const publishedCached = peekPublishedTenantAssets<T>(requestTenantId);
    if (publishedCached.length) return publishedCached;
  }

  const fetchFresh = async (): Promise<T[]> => {
    if (isGpsIotServer()) {
      const ctx = resolveGpsIotClientContext();
      if (ctx.clientId || ctx.databaseName) {
        const gpsAssets = await listGpsIotAssets({
          ...(ctx.clientId ? { clientId: ctx.clientId } : {}),
          ...(ctx.databaseName ? { databaseName: ctx.databaseName } : {}),
          ...(ctx.site ? { site: ctx.site } : {})
        });
        if (gpsAssets.length) {
          const assets = canonicalizeAssetRows(gpsAssets as T[]);
          if (!stillActiveTenant()) return readCachedAssets<T>();
          try {
            const { loadScopedFromApi } = await import("./scopeStorage");
            const site = String(ctx.site ?? "").trim();
            if (site) {
              const overlay = await loadScopedFromApi<{
                byImei?: Record<string, Record<string, unknown>>;
              }>("fleet:compiled-asset-settings", site);
              const byImei = overlay?.byImei && typeof overlay.byImei === "object" ? overlay.byImei : null;
              if (byImei) {
                for (const row of assets as any[]) {
                  const imei = String(row?.imei ?? "").trim();
                  const stamped = imei ? byImei[imei] : null;
                  if (!stamped || typeof stamped !== "object") continue;
                  const stampedSite = String(stamped.site ?? "").trim();
                  if (stampedSite && stampedSite.toLowerCase() !== site.toLowerCase()) continue;
                  Object.assign(row, {
                    ...(stamped.configGroup != null ? { configGroup: stamped.configGroup } : {}),
                    ...(stamped.configurationGroup != null
                      ? { configurationGroup: stamped.configurationGroup }
                      : {}),
                    ...(stamped.fuelTankCapacity != null
                      ? { fuelTankCapacity: stamped.fuelTankCapacity }
                      : {}),
                    ...(stamped.viviFuelCalibration != null
                      ? { viviFuelCalibration: stamped.viviFuelCalibration }
                      : {}),
                    ...(stamped.viviFuelAnalogInput != null
                      ? { viviFuelAnalogInput: stamped.viviFuelAnalogInput }
                      : {}),
                    ...(stamped.viviFuelAnalogMvMin != null
                      ? { viviFuelAnalogMvMin: stamped.viviFuelAnalogMvMin }
                      : {}),
                    ...(stamped.viviFuelAnalogMvMax != null
                      ? { viviFuelAnalogMvMax: stamped.viviFuelAnalogMvMax }
                      : {}),
                    ...(stamped.viviCanProtocol != null
                      ? { viviCanProtocol: stamped.viviCanProtocol }
                      : {}),
                    ...(stamped.configUploadDate != null
                      ? { configUploadDate: stamped.configUploadDate }
                      : {}),
                    ...(stamped.mobileDevice != null ? { mobileDevice: stamped.mobileDevice } : {}),
                    attributes: {
                      ...(row.attributes && typeof row.attributes === "object" ? row.attributes : {}),
                      ...(stamped.attributes && typeof stamped.attributes === "object"
                        ? stamped.attributes
                        : {})
                    }
                  });
                }
              }
            }
          } catch {
            // Compiled overlay is optional.
          }
          return writeCachedAssets(assets as unknown[]) as T[];
        }
      }
    }

    const result = await fetchJsonForTenant<{ assets: T[]; tenantId?: string }>(
      "/d1/assets",
      { method: "GET" },
      requestTenantId
    );
    if (result.ok && result.body && Array.isArray((result.body as any).assets)) {
      const assets = canonicalizeAssetRows((result.body as any).assets as T[]);
      if (!stillActiveTenant()) return readCachedAssets<T>();
      if (assets.length) {
        return writeCachedAssets(assets as unknown[]) as T[];
      }
      const cached = readCachedAssets<T>();
      return cached.length ? cached : assets;
    }

    // Site-assigned users sometimes still have the wrong tenant header; retry allowed tenants.
    if ((result as any)?.status === 401 || (result as any)?.status === 403 || !result.ok) {
      for (const allowed of readAllowedTenantIds()) {
        if (!allowed || allowed === requestTenantId) continue;
        const retry = await fetchJsonForTenant<{ assets: T[] }>("/d1/assets", { method: "GET" }, allowed);
        if (retry.ok && retry.body && Array.isArray((retry.body as any).assets)) {
          const assets = canonicalizeAssetRows((retry.body as any).assets as T[]);
          if (assets.length) {
            adoptDatabaseTenant(allowed);
            return writeCachedAssets(assets as unknown[]) as T[];
          }
        }
      }
    }

    return stillActiveTenant() ? readCachedAssets<T>() : [];
  };

  const fresh = await dedupeAssetFetch(requestTenantId, fetchFresh);
  if (fresh.length) return fresh;

  const published = await adoptPublishedTenantAssets<T>(requestTenantId);
  if (published.length) return published;

  return stillActiveTenant() ? readCachedAssets<T>() : [];
}

export async function getAssetsFromApiForTenant<T = unknown>(tenantIdOverride: string | null): Promise<T[]> {
  const tenantId = String(tenantIdOverride ?? "").trim();
  const cached = tenantId ? readCachedAssetsForTenant<T>(tenantId) : [];
  const load = async () => {
    const result = await fetchJsonForTenant<{ assets: T[] }>("/d1/assets", { method: "GET" }, tenantIdOverride);
    const assets = canonicalizeAssetRows(
      (result.ok && result.body && Array.isArray((result.body as any).assets) ? (result.body as any).assets : null) as T[] | null
    );
    if (tenantId && assets.length) return writeCachedAssetsForTenant(tenantId, assets as unknown[]) as T[];
    return assets;
  };
  if (cached.length) {
    if (readAssetCacheAgeMs(tenantId) > ASSET_LIST_FRESH_MS) {
      void dedupeAssetFetch(tenantId, load).catch(() => undefined);
    }
    return cached;
  }
  if (!tenantId) return load();
  return dedupeAssetFetch(tenantId, load);
}

/** Import / remap Traccar devices into the active (or override) tenant as assets. */
export async function importAssetsFromTraccarApi(options?: {
  site?: string;
  tenantId?: string | null;
}): Promise<{ ok: boolean; imported: number; skipped: number; updated: number; assets: any[]; error?: string }> {
  const tenantId =
    options?.tenantId === undefined ? readActiveTenantId() || getTenantId() : String(options.tenantId ?? "").trim();
  const site =
    String(options?.site ?? "").trim() ||
    (typeof window !== "undefined" ? String(window.localStorage.getItem("vivi.activeSite") ?? "").trim() : "") ||
    "Default";
  if (!tenantId) return { ok: false, imported: 0, skipped: 0, updated: 0, assets: [], error: "tenant required" };

  const result = await fetchJsonForTenant<{
    ok?: boolean;
    imported?: number;
    skipped?: number;
    updated?: number;
    assets?: any[];
    error?: string;
  }>("/d1/assets/import-traccar", {
    method: "POST",
    body: JSON.stringify({ site })
  }, tenantId);

  if (!result.ok) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      updated: 0,
      assets: [],
      error: extractErrorMessage(
        result.body,
        result.text ?? "Import failed"
      ) + (result.body && typeof result.body === "object" && (result.body as any).upstreamStatus
        ? ` (upstream ${(result.body as any).upstreamStatus})`
        : "")
    };
  }
  const body = result.body as any;
  return {
    ok: Boolean(body?.ok ?? true),
    imported: Number(body?.imported ?? 0) || 0,
    skipped: Number(body?.skipped ?? 0) || 0,
    updated: Number(body?.updated ?? 0) || 0,
    assets: canonicalizeAssetRows(Array.isArray(body?.assets) ? body.assets : []),
    error: body?.error ? String(body.error) : undefined
  };
}

export type TelemetryLookupResponse = {
  imei: string;
  tenantId: string;
  assets: any[];
  events: any[];
  latest?: {
    at?: string;
    ignition?: boolean;
    powerVoltage?: number;
    satellites?: number;
    charging?: boolean;
    firmwareVersion?: string;
    lat?: number;
    lng?: number;
    speed?: number;
    heading?: number;
    movement?: "moving" | "stationary" | "unknown";
    odometer?: number;
    odometerKms?: number;
    ignitionOnAt?: string;
  };
};

export async function telemetryLookupByImeiDetailed(
  imei: string,
  options?: { refreshLive?: boolean }
): Promise<{ ok: boolean; status?: number; error?: string; body?: TelemetryLookupResponse }> {
  const needle = String(imei ?? "").trim();
  if (!needle) return { ok: false, status: 400, error: "imei is required" };

  // UK hybrid: diagnostics / Live Tracking telemetry from GPS IoT live (forward + API), never Traccar.
  if (isGpsIotServer()) {
    try {
      const devices = await loadGpsIotLiveDevices();
      const match = devices.find((row) => String(row.imei ?? "").trim() === needle) ?? null;
      if (!match) {
        return { ok: false, status: 404, error: "Device not found in GPS IoT live" };
      }
      const speedKph = Number(match.speed);
      const movement: "moving" | "stationary" | "unknown" = Number.isFinite(speedKph)
        ? (speedKph > 1 ? "moving" : "stationary")
        : "unknown";
      const at = String(match.deviceTime ?? "").trim() || new Date().toISOString();
      const eventName = String(match.eventName ?? match.attributes?.eventName ?? "").trim();
      const body: TelemetryLookupResponse = {
        imei: needle,
        tenantId: getTenantId() || defaultTenantId,
        assets: [{
          imei: needle,
          id: match.id,
          name: match.name,
          ignition: match.ignition,
          locationName: match.address
        }],
        events: eventName
          ? [{
              at,
              type: eventName,
              eventName,
              lat: match.latitude,
              lng: match.longitude,
              speed: speedKph,
              heading: match.course,
              source: "gpsiot"
            }]
          : [],
        latest: {
          at,
          ignition: match.ignition,
          powerVoltage: match.powerVoltage || undefined,
          satellites: match.satellites || undefined,
          lat: match.latitude,
          lng: match.longitude,
          speed: speedKph,
          heading: match.course,
          movement,
          odometer: match.odometerM || undefined,
          odometerKms: match.odometerM ? match.odometerM / 1000 : undefined,
          locationName: match.address,
          ...(match.attributes ?? {})
        } as TelemetryLookupResponse["latest"]
      };
      return { ok: true, status: 200, body };
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  }

  try {
    const tenantId = getTenantId();
    const apiKey = getApiKey();
    const headers = {
      "content-type": "application/json",
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...(apiKey ? { "x-api-key": apiKey } : {})
    };

    const requestLookup = async (url: string) => {
      const response = await fetch(url, { method: "GET", headers });
      const status = response.status;
      const text = await response.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { response, status, text, body };
    };

    const query = new URLSearchParams({ imei: needle });
    if (options?.refreshLive) query.set("refreshLive", "1");

    // Always try /telemetry/lookup first. Only skip when this API base previously
    // confirmed the route is missing (cached capability), never by hostname alone.
    if (getTelemetryLookupCapability() === "unsupported") {
      const streamFallback = await telemetryLookupViaStream(needle, headers, tenantId || defaultTenantId);
      if (streamFallback.ok) return streamFallback;
      // If stream also fails, still attempt primary once in case the API was upgraded.
    }

    const primaryUrl = buildUrl(`/telemetry/lookup?${query.toString()}`);
    let result = await requestLookup(primaryUrl);

    if (result.response.ok) {
      setTelemetryLookupCapability("supported");
    } else if (result.status === 404) {
      setTelemetryLookupCapability("unsupported");
      const liveFallback = await telemetryLookupViaTraccarLive(needle);
      if (liveFallback.ok) return liveFallback;
      const streamFallback = await telemetryLookupViaStream(needle, headers, tenantId || defaultTenantId);
      if (streamFallback.ok) return streamFallback;
    } else if (!result.response.ok) {
      // Transient upstream failures: prefer live Traccar before giving up.
      const liveFallback = await telemetryLookupViaTraccarLive(needle);
      if (liveFallback.ok) return liveFallback;
    }

    const deviceBase = getSafeDeviceServerBase();
    const shouldFallback =
      Boolean(deviceBase)
      && !primaryUrl.startsWith(deviceBase)
      && !result.response.ok;

    if (shouldFallback) {
      const fallbackUrl = `${deviceBase.replace(/\/$/, "")}/telemetry/lookup?${query.toString()}`;
      const fallback = await requestLookup(fallbackUrl);
      if (fallback.response.ok) {
        result = fallback;
      }
    }

    if (!result.response.ok) {
      const message =
        (result.body && typeof result.body === "object" && (result.body.error || result.body.message)) ||
        (typeof result.body === "string" ? result.body : "Request failed");
      return { ok: false, status: result.status, error: String(message) };
    }

    return { ok: true, status: result.status, body: result.body as TelemetryLookupResponse };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

const tryGetIsoTime = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return "";
};

export async function confirmTelemetryForImei(imei: string): Promise<{
  ok: boolean;
  received: boolean;
  lastAt?: string;
  source?: "telemetry-lookup" | "assets";
  status?: number;
  error?: string;
}> {
  const needle = String(imei ?? "").trim();
  if (!needle) return { ok: false, received: false, error: "imei is required" };

  // 1) Preferred: ask the telemetry lookup endpoint (Worker environments).
  const lookup = await telemetryLookupByImeiDetailed(needle);
  if (lookup.ok && lookup.body) {
    const events = Array.isArray(lookup.body.events) ? lookup.body.events : [];
    const assets = Array.isArray(lookup.body.assets) ? lookup.body.assets : [];

    const eventTimes = events
      .map((e) => tryGetIsoTime((e as any)?.created_at ?? (e as any)?.createdAt ?? (e as any)?.at))
      .filter(Boolean)
      .sort()
      .reverse();
    const lastEventAt = eventTimes[0] ?? "";

    const assetTimes = assets
      .map((a) => tryGetIsoTime((a as any)?.lastSeen ?? (a as any)?.last_seen))
      .filter(Boolean)
      .sort()
      .reverse();
    const lastSeenAt = assetTimes[0] ?? "";

    const lastAt = lastEventAt || lastSeenAt;
    return { ok: true, received: Boolean(lastAt), lastAt: lastAt || undefined, source: "telemetry-lookup" };
  }

  // 2) Fallback: read the asset record (server or cache) and use lastSeen if present.
  // This is helpful when /telemetry/lookup isn't available, or is unauthorized.
  try {
    const assets = await getAssetsFromApi<any>();
    const match = assets.find((a) => String(a?.imei ?? "").trim() === needle) ?? null;
    const lastAt = tryGetIsoTime(match?.lastSeen ?? match?.last_seen);
    if (lastAt) return { ok: true, received: true, lastAt, source: "assets" };
  } catch {
    // ignore and fall through to error shaping
  }

  const status = lookup.status;
  const errorText = String(lookup.error ?? "").trim();

  // Endpoint exists but returned an auth error.
  if (status === 401 || status === 403) {
    return {
      ok: false,
      received: false,
      status,
      error: "Unauthorized. Please log in / set an API key for this environment to confirm telemetry."
    };
  }

  // Backend unreachable / network error.
  if (!status && errorText) {
    return { ok: false, received: false, error: `Backend offline/unreachable: ${errorText}` };
  }

  // Endpoint not present (e.g. VPS server), or other non-fatal cases: we simply can't confirm yet.
  if (!status || status === 404) return { ok: true, received: false, source: "assets" };

  return { ok: false, received: false, status, error: lookup.error || `HTTP ${status}` };
}

export async function pushDeviceSettings(imei: string, settings?: unknown): Promise<{ queued: boolean; id?: string; error?: string }> {
  try {
    const tenantId = getTenantId();
    const apiKey = getApiKey();
    const response = await fetch(buildUrl("/device/push-settings"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        ...(apiKey ? { "x-api-key": apiKey } : {})
      },
      body: JSON.stringify({ imei, payload: settings ?? {} })
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      return { queued: false, error: extractErrorMessage(body, text) };
    }
    return { queued: Boolean(body?.queued), id: body?.id };
  } catch (err: any) {
    return { queued: false, error: String(err?.message ?? err) };
  }
}

export async function decommissionDeviceDetailed(args: {
  assetId?: string;
  imei: string;
  deviceId?: string;
  id?: string;
}): Promise<{
  decommissioned: boolean;
  asset?: Record<string, unknown>;
  traccar?: { removed: boolean; skipped?: boolean; error?: string };
  purged?: Record<string, number>;
  traccarDeleteQueued?: boolean;
  error?: string;
  status?: number;
  source?: "server";
}> {
  const imei = String(args.imei ?? "").trim();
  const assetId = String(args.assetId ?? "").trim();
  const deviceId = String(args.deviceId ?? "").trim();
  const rowId = String(args.id ?? "").trim();
  if (!imei && !deviceId) return { decommissioned: false, error: "imei is required" };

  try {
    if (isGpsIotServer()) {
      const ctx = resolveGpsIotClientContext();
      const result = await fetchJsonForTenant<{
        ok?: boolean;
        decommissioned?: boolean;
        asset?: Record<string, unknown>;
        error?: string;
      }>(
        "/gpsiot/devices/decommission",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            imei,
            ...(assetId ? { assetId } : {}),
            ...(deviceId ? { deviceId } : {}),
            ...(rowId ? { id: rowId } : {}),
            ...(ctx.clientId ? { clientId: ctx.clientId } : {}),
            ...(ctx.databaseName ? { databaseName: ctx.databaseName } : {}),
            ...(ctx.site ? { site: ctx.site } : {})
          })
        },
        getTenantId()
      );
      if (!result.ok) {
        return {
          decommissioned: false,
          status: result.status,
          error: String((result.body as any)?.error ?? result.text ?? "GPS IoT decommission failed")
        };
      }
      const serverAsset =
        result.body?.asset && typeof result.body.asset === "object"
          ? (result.body.asset as Record<string, unknown>)
          : undefined;
      if (serverAsset) {
        // Merge onto existing cached row so site/registration survive; IMEI/device cleared for reuse.
        const cached = readCachedAssets<Record<string, unknown>>();
        const match = cached.find(
          (row) =>
            String(row?.id ?? "").trim() === rowId
            || String(row?.assetId ?? "").trim() === assetId
            || String(row?.imei ?? "").trim() === imei
        );
        const cleared = {
          ...(match ?? {}),
          ...serverAsset,
          imei: "",
          deviceId: "",
          device: "",
          mobileDevice: "",
          serialNumber: "",
          status: "unavailable",
          assetStatus: "Decommissioned"
        };
        upsertCachedAsset(cleared);
        return { decommissioned: true, source: "server", status: result.status, asset: cleared };
      }
      return {
        decommissioned: Boolean(result.body?.decommissioned),
        source: "server",
        status: result.status,
        asset: serverAsset,
        error: result.body?.decommissioned ? undefined : String(result.body?.error ?? "Decommission failed")
      };
    }

    const tenantId = getTenantId();
    const apiKey = getApiKey();
    const response = await fetch(buildUrl("/device/decommission"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        ...(apiKey ? { "x-api-key": apiKey } : {})
      },
      body: JSON.stringify({ imei, ...(assetId ? { assetId } : {}) })
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      const message = extractErrorMessage(body, text);
      const hint =
        response.status === 404
          ? " Deploy the latest backend (POST /device/decommission) and try again."
          : "";
      return {
        decommissioned: false,
        status: response.status,
        error: `${message}${hint}`.trim()
      };
    }
    const serverAsset =
      body?.asset && typeof body.asset === "object" ? (body.asset as Record<string, unknown>) : undefined;
    if (serverAsset) upsertCachedAsset(serverAsset as any);
    const decommissioned = Boolean(body?.decommissioned);
    const persistedImei = String(serverAsset?.imei ?? "").trim();
    if (decommissioned && persistedImei) {
      return {
        decommissioned: false,
        source: "server",
        asset: serverAsset,
        error: "Backend did not clear the IMEI on the asset record."
      };
    }
    return {
      decommissioned,
      source: "server",
      asset: serverAsset,
      traccar: body?.traccar,
      purged: body?.purged,
      traccarDeleteQueued: Boolean(body?.traccarDeleteQueued),
      error: decommissioned ? undefined : extractErrorMessage(body, text)
    };
  } catch (err: any) {
    return { decommissioned: false, error: String(err?.message ?? err) };
  }
}

export async function commissionDeviceDetailed(imei: string): Promise<{
  queued: boolean;
  settingsId?: string;
  kickQueued?: boolean;
  kickError?: string;
  error?: string;
}> {
  const needle = String(imei ?? "").trim();
  if (!needle) return { queued: false, error: "imei is required" };

  const push = await pushDeviceSettings(needle);
  if (!push.queued) return { queued: false, error: push.error ?? "Failed to queue settings" };

  // Best-effort prompt: not all deployments expose /device/kick-avl.
  let kickQueued: boolean | undefined = undefined;
  let kickError: string | undefined = undefined;
  try {
    const kick = await kickAvlSocket(needle);
    kickQueued = Boolean(kick.queued);
    if (!kick.queued && kick.error) kickError = kick.error;
  } catch (e: any) {
    kickQueued = false;
    kickError = String(e?.message ?? e);
  }

  return { queued: true, settingsId: push.id, kickQueued, kickError };
}

export async function upsertAssetToApi(payload: unknown): Promise<boolean> {
  const result = await upsertAssetDetailed(payload);
  return Boolean(result.stored);
}

export async function upsertAssetDetailed(payload: unknown): Promise<{
  stored: boolean;
  source?: "server" | "local";
  status?: number;
  error?: string;
  body?: any;
}> {
  try {
    if (isGpsIotServer()) {
      const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const saved = await saveGpsIotAssetDetails(row);
      if (saved.stored) {
        const assetId = String(saved.body?.assetId ?? row.assetId ?? "").trim();
        const record = {
          ...row,
          ...(assetId ? { assetId, id: String(row.id ?? "").trim() || `gpsiot:${assetId}` } : {})
        };
        upsertCachedAsset(record);
        return {
          stored: true,
          source: "server",
          status: saved.status,
          body: { stored: true, created: saved.body?.created, updated: saved.body?.updated, assetId, asset: record, ...saved.body }
        };
      }
      return { stored: false, source: "server", status: saved.status, error: saved.error, body: saved.body };
    }

    let tenantId = getTenantId();
    const apiKey = getApiKey();
    const storedToken = getStoredApiKey();
    const fallbackApiKey = String(buildTimeApiKey ?? "").trim();
    if (!tenantId) {
      const refreshed = await refreshAuthMe();
      const recoveredTenant = String(refreshed?.tenantId ?? "").trim();
      if (recoveredTenant && typeof window !== "undefined") {
        window.localStorage.setItem("vivi.tenantId", recoveredTenant);
        tenantId = recoveredTenant;
        window.dispatchEvent(new Event("vivi:orgchange"));
      }
      if (!tenantId) {
        return { stored: false, source: "server", status: 400, error: "Tenant is required. Select organisation/database first." };
      }
    }
    if (!apiKey) {
      return { stored: false, source: "server", status: 401, error: "API key is required. Please log in again." };
    }
    const postAsset = async (key: string) => {
      const response = await fetch(buildUrl(`/d1/assets`), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(tenantId ? { "x-tenant-id": tenantId } : {}),
          ...(key ? { "x-api-key": key } : {})
        },
        body: JSON.stringify(payload ?? {})
      });
      const text = await response.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { response, text, body };
    };

    let { response, text, body } = await postAsset(apiKey);

    // Recovery path: impersonation/session tokens are in-memory on local backend.
    // After backend restart they can go stale while UI still appears logged in.
    if (
      (response.status === 401 || response.status === 403)
      && storedToken
      && fallbackApiKey
      && fallbackApiKey !== apiKey
    ) {
      const retry = await postAsset(fallbackApiKey);
      response = retry.response;
      text = retry.text;
      body = retry.body;
      if (response.ok) {
        setStoredApiKey(fallbackApiKey);
      }
    }
    if (!response.ok) {
      return {
        stored: false,
        source: "server",
        status: response.status,
        error: extractErrorMessage(body, text),
        body
      };
    }
    const stored = Boolean(body?.stored);
    if (stored) {
      const serverAsset =
        body?.asset && typeof body.asset === "object"
          ? (body.asset as Record<string, unknown>)
          : null;
      const record = (serverAsset ?? (payload && typeof payload === "object" ? (payload as any) : {})) as any;
      const serverAssetId = Number(body?.assetId ?? record?.assetId ?? 0) || 0;
      if (serverAssetId > 0) record.assetId = serverAssetId;
      if (body?.id && !record.id) record.id = String(body.id);
      upsertCachedAsset(record);
    }
    return { stored, source: "server", status: response.status, body };
  } catch (err: any) {
    return {
      stored: false,
      source: "server",
      status: 0,
      error: `Backend unavailable: ${String(err?.message ?? err)}`
    };
  }
}

export async function upsertAssetDetailedForTenant(
  payload: unknown,
  tenantIdOverride: string | null
): Promise<{ stored: boolean; status?: number; error?: string; body?: any }> {
  try {
    const initialApiKey = getApiKey();
    const hadStoredToken = Boolean(getStoredApiKey());
    const postAsset = async (apiKey: string) =>
      fetch(buildUrl(`/d1/assets`, tenantIdOverride), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...buildAuthHeaders(tenantIdOverride, apiKey)
        },
        body: JSON.stringify(payload ?? {})
      });

    let response = await postAsset(initialApiKey);
    if ((response.status === 401 || response.status === 403) && hadStoredToken) {
      const fallbackApiKey = getLocalDevFallbackApiKey(initialApiKey);
      if (fallbackApiKey) {
        response = await postAsset(fallbackApiKey);
      }
    }
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      return { stored: false, status: response.status, error: extractErrorMessage(body, text), body };
    }
    return { stored: Boolean(body?.stored), status: response.status, body };
  } catch (err: any) {
    return { stored: false, status: 0, error: String(err?.message ?? err) };
  }
}

export async function getDeviceReportingSettings<T = unknown>(): Promise<T | null> {
  const response = await fetchJson<{ settings: T | null }>("/d1/device-reporting-settings");
  return response?.settings ?? null;
}

export async function saveDeviceReportingSettings(payload: unknown): Promise<boolean> {
  const response = await fetchJson<{ stored: boolean }>("/d1/device-reporting-settings", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  return Boolean(response?.stored);
}

const configGroupsCacheKeyForTenant = (tenantId = readActiveTenantId()) =>
  tenantId ? `vivi.configGroups.cache:${tenantId}` : "";

function readCachedConfigurationGroups<T>(tenantId = readActiveTenantId()): T[] {
  if (typeof window === "undefined" || !tenantId) return [];
  try {
    const raw = window.localStorage.getItem(configGroupsCacheKeyForTenant(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeCachedConfigurationGroups(value: unknown[], tenantId = readActiveTenantId()) {
  if (typeof window === "undefined" || !tenantId) return;
  try {
    window.localStorage.setItem(configGroupsCacheKeyForTenant(tenantId), JSON.stringify(value ?? []));
  } catch {
    // ignore
  }
}

export async function getConfigurationGroups<T = unknown>(): Promise<T[]> {
  const tenantId = readActiveTenantId();
  if (!tenantId) return [];
  try {
    const response = await fetchJson<{ groups: T[]; tenantId?: string }>("/d1/configuration-groups");
    const responseTenantId = String(response?.tenantId ?? "").trim();
    if (responseTenantId && responseTenantId !== tenantId) {
      return readCachedConfigurationGroups<T>(tenantId);
    }
    const groups = Array.isArray(response?.groups) ? response.groups : [];
    const cached = readCachedConfigurationGroups<T>(tenantId);
    if (groups.length) {
      writeCachedConfigurationGroups(groups as unknown[], tenantId);
      return groups;
    }
    if (cached.length) return cached;
    writeCachedConfigurationGroups([], tenantId);
    return [];
  } catch {
    return readCachedConfigurationGroups<T>(tenantId);
  }
}

export async function saveConfigurationGroup(payload: unknown): Promise<boolean> {
  const response = await fetchJson<{ stored: boolean }>("/d1/configuration-groups", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  const stored = Boolean(response?.stored);
  if (stored && payload && typeof payload === "object") {
    const tenantId = readActiveTenantId();
    const id = String((payload as any).id ?? "").trim();
    if (tenantId && id) {
      const cached = readCachedConfigurationGroups<Record<string, unknown>>(tenantId);
      const next = [...cached.filter((row) => String(row?.id ?? "").trim() !== id), payload as Record<string, unknown>];
      writeCachedConfigurationGroups(next, tenantId);
    }
  }
  return stored;
}

export async function deleteConfigurationGroup(id: string): Promise<boolean> {
  const response = await fetchJson<{ deleted: boolean }>(
    `/d1/configuration-groups?id=${encodeURIComponent(id)}`,
    {
      method: "DELETE"
    }
  );
  return Boolean(response?.deleted);
}

export type HierarchySite = {
  id: string;
  name: string;
  traccarGroupId?: number;
  gpsIotClientId?: string;
};

export type HierarchyDatabase = {
  id: string;
  name: string;
  sites: HierarchySite[];
};

export type HierarchyOrg = {
  id: string;
  name: string;
  databases: HierarchyDatabase[];
};

export type HierarchyDealer = {
  id: string;
  name: string;
  organisations: HierarchyOrg[];
};

export type HierarchyRoot = {
  dealers: HierarchyDealer[];
  updatedAt?: string;
  /** Set when the hierarchy API did not return a body — do not treat as an empty tree. */
  unavailable?: boolean;
};

export async function getHierarchy(): Promise<HierarchyRoot> {
  const response = await fetchJson<HierarchyRoot>("/b2/hierarchy");
  if (!response || response.unavailable) {
    return { dealers: [], updatedAt: new Date().toISOString(), unavailable: true };
  }
  return filterHierarchyForRegion(response);
}

/** Merge a local/client hierarchy tree into the shared server tree (heal missing orgs/dbs/sites). */
export async function syncHierarchyTree(dealers: HierarchyDealer[]): Promise<{
  ok?: boolean;
  hierarchy?: HierarchyRoot;
  error?: string;
} | null> {
  return fetchHierarchyMutation("/b2/hierarchy/sync", {
    method: "POST",
    body: JSON.stringify({ dealers })
  });
}

/** Backfill missing Traccar groups for VIVI sites in the active tenant. */
export async function repairTraccarSiteGroups(): Promise<{
  ok: boolean;
  linked?: number;
  created?: number;
  errors?: Array<{ siteId: string; siteName: string; error: string }>;
  hierarchy?: HierarchyRoot;
} | null> {
  return fetchJson("/admin/traccar/repair-site-groups", { method: "POST" });
}

async function fetchHierarchyMutation(path: string, options: RequestInit = {}): Promise<any | null> {
  try {
    const tenantId = getTenantId();
    const initialApiKey = getApiKey();
    const hadStoredToken = Boolean(getStoredApiKey());
    const doFetch = async (apiKey: string) =>
      fetch(buildUrl(path, tenantId), {
        ...API_FETCH_INIT,
        ...options,
        headers: {
          "content-type": "application/json",
          ...(tenantId ? { "x-tenant-id": tenantId } : {}),
          ...(apiKey ? { "x-api-key": apiKey } : {}),
          ...(options.headers ?? {})
        }
      });

    let response = await doFetch(initialApiKey);
    if ((response.status === 401 || response.status === 403) && hadStoredToken) {
      const fallbackApiKey = getLocalDevFallbackApiKey(initialApiKey);
      if (fallbackApiKey) response = await doFetch(fallbackApiKey);
    }
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      return {
        ok: false,
        error: String(body?.error ?? body?.message ?? text ?? `HTTP ${response.status}`),
        status: response.status
      };
    }
    return body;
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error ?? "Network error") };
  }
}

export async function addHierarchyDealer(name: string): Promise<any> {
  return fetchHierarchyMutation("/b2/hierarchy/dealer", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export async function addHierarchyOrganisation(dealerId: string, name: string): Promise<any> {
  return fetchHierarchyMutation("/b2/hierarchy/organisation", {
    method: "POST",
    body: JSON.stringify({ dealerId, name })
  });
}

export async function addHierarchyDatabase(organisationId: string, name: string): Promise<any> {
  return fetchHierarchyMutation("/b2/hierarchy/database", {
    method: "POST",
    body: JSON.stringify({ organisationId, name })
  });
}

export async function addHierarchySite(databaseId: string, name: string): Promise<any> {
  return fetchHierarchyMutation("/b2/hierarchy/site", {
    method: "POST",
    body: JSON.stringify({ databaseId, name })
  });
}

export async function renameHierarchyItem(type: "dealer" | "organisation" | "database" | "site", id: string, name: string): Promise<any> {
  return fetchHierarchyMutation(`/b2/hierarchy/${type}`, {
    method: "PUT",
    body: JSON.stringify({ id, name })
  });
}

export async function deleteHierarchyItem(type: "dealer" | "organisation" | "database" | "site", id: string): Promise<any> {
  return fetchHierarchyMutation(`/b2/hierarchy/${type}?id=${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export async function deleteAssetFromApi(
  tenantId: string,
  criteria: { id?: string; imei?: string; registration?: string }
): Promise<{ ok: boolean; deleted: boolean; error?: string }> {
  const params = new URLSearchParams();
  if (criteria.id) params.set("id", criteria.id);
  if (criteria.imei) params.set("imei", criteria.imei);
  if (criteria.registration) params.set("registration", criteria.registration);
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, deleted: false, error: "You need to sign in again before deleting." };
  try {
    const response = await fetch(buildUrl(`/d1/assets?${params.toString()}`, tenantId), {
      method: "DELETE",
      ...API_FETCH_INIT,
      headers: {
        "content-type": "application/json",
        ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        "x-api-key": apiKey
      }
    });
    const body = (await response.json().catch(() => ({}))) as { deleted?: boolean; error?: string; message?: string };
    if (!response.ok) return { ok: false, deleted: false, error: String(body?.error ?? body?.message ?? `HTTP ${response.status}`) };
    if (!body?.deleted) return { ok: true, deleted: false, error: String(body?.message ?? "Asset not found.") };
    clearCachedAssets(tenantId);
    return { ok: true, deleted: true };
  } catch (error: any) {
    return { ok: false, deleted: false, error: String(error?.message ?? "Network error") };
  }
}

const bindingsCacheKey = (type: "notifications" | "locations" | "devices", tenantId = readActiveTenantId()) =>
  tenantId ? `vivi.bindings:${tenantId}:${type}` : "";

function readCachedBindings<T>(type: "notifications" | "locations" | "devices", tenantId = readActiveTenantId()): T[] {
  if (typeof window === "undefined" || !tenantId) return [];
  try {
    const raw = window.localStorage.getItem(bindingsCacheKey(type, tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeCachedBindings(type: "notifications" | "locations" | "devices", value: unknown[], tenantId = readActiveTenantId()) {
  if (typeof window === "undefined" || !tenantId) return;
  try {
    window.localStorage.setItem(bindingsCacheKey(type, tenantId), JSON.stringify(value ?? []));
  } catch {
    // ignore
  }
}

export function clearBindingsCache() {
  if (typeof window === "undefined") return;
  const tenantId = readActiveTenantId();
  if (!tenantId) return;
  for (const type of ["notifications", "locations", "devices"] as const) {
    try {
      window.localStorage.removeItem(bindingsCacheKey(type, tenantId));
    } catch {
      // ignore
    }
  }
}

function removeCachedBinding(type: "notifications" | "locations" | "devices", id: string, tenantId = readActiveTenantId()) {
  if (typeof window === "undefined" || !tenantId) return;
  const bindingId = String(id ?? "").trim();
  if (!bindingId) return;
  const current = readCachedBindings<any>(type, tenantId);
  const next = current.filter((row) => String(row?.id ?? "").trim() !== bindingId);
  writeCachedBindings(type, next, tenantId);
}

function dedupeBindings<T extends { id?: any; name?: any; site?: any }>(
  type: BindingType,
  items: T[]
): T[] {
  return dedupeBindingRows(type, items ?? []);
}

export async function getBindings<T = unknown>(
  type: "notifications" | "locations" | "devices",
  options?: { refresh?: boolean }
): Promise<T[]> {
  const tenantId = readActiveTenantId();
  if (!tenantId || !isDatabaseTenant(tenantId)) return [];
  if (options?.refresh) clearBindingsCache();

  try {
    const apiKey = getApiKey();
    const response = await fetch(buildUrl(`/d1/bindings?type=${type}`, tenantId), {
      ...API_FETCH_INIT,
      method: "GET",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": tenantId,
        ...(apiKey ? { "x-api-key": apiKey } : {})
      }
    });
    if (response.ok) {
      const body = (await response.json()) as any;
      const responseTenantId = String(body?.tenantId ?? "").trim();
      if (responseTenantId && responseTenantId !== tenantId) {
        const cached = dedupeBindings(type, readCachedBindings<T>(type, tenantId) as any[]);
        return cached as T[];
      }
      const bindings = Array.isArray(body?.bindings) ? (body.bindings as T[]) : [];
      const deduped = dedupeBindings(type, bindings as any[]);
      const cached = dedupeBindings(type, readCachedBindings<T>(type, tenantId) as any[]);

      if (deduped.length) {
        writeCachedBindings(type, deduped as unknown[], tenantId);
        return deduped as T[];
      }
      // Never wipe user bindings when the server returns empty (deploy, cold start, transient API).
      if (cached.length) return cached as T[];
      writeCachedBindings(type, [], tenantId);
      return [];
    }
    if (readActiveTenantId() !== tenantId) return [];
    const cached = dedupeBindings(type, readCachedBindings<T>(type, tenantId) as any[]);
    return cached as T[];
  } catch {
    if (readActiveTenantId() !== tenantId) return [];
    return dedupeBindings(type, readCachedBindings<T>(type, tenantId) as any[]) as unknown as T[];
  }
}

export async function saveBinding(
  type: "notifications" | "locations" | "devices",
  payload: unknown
): Promise<boolean> {
  const result = await saveBindingDetailed(type, payload);
  return result.stored;
}

export async function saveBindingDetailed(
  type: "notifications" | "locations" | "devices",
  payload: unknown
): Promise<{ stored: boolean; source: "server" | "local"; id?: string; status?: number; error?: string }> {
  const tenantId = readActiveTenantId();
  if (!tenantId || !isDatabaseTenant(tenantId)) {
    return { stored: false, source: "server", error: "Select a database before saving bindings." };
  }

  const existing = readCachedBindings<any>(type, tenantId);
  const resolved = resolveBindingRecordForSave(
    type,
    (payload && typeof payload === "object" ? payload : {}) as { id?: string; name?: string; site?: string },
    existing
  );
  if (resolved.error) return { stored: false, source: "server", error: resolved.error };
  const record = resolved.record;
  const pruneIds = bindingIdsToPruneAfterSave(type, record, existing);

  try {
    const initialApiKey = getApiKey();
    const hadStoredToken = Boolean(getStoredApiKey());
    const postBinding = async (apiKey: string) =>
      fetch(buildUrl(`/d1/bindings?type=${type}`, tenantId), {
        ...API_FETCH_INIT,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
          ...(apiKey ? { "x-api-key": apiKey } : {})
        },
        body: JSON.stringify(record)
      });

    let response = await postBinding(initialApiKey);
    if ((response.status === 401 || response.status === 403) && hadStoredToken) {
      const fallbackApiKey = getLocalDevFallbackApiKey(initialApiKey);
      if (fallbackApiKey) {
        response = await postBinding(fallbackApiKey);
      }
    }

    if (!response.ok) {
      let errorText = "";
      try {
        errorText = await response.text();
        const parsed = JSON.parse(errorText) as { error?: string };
        if (parsed?.error) errorText = String(parsed.error);
      } catch {
        // ignore
      }
      return { stored: false, source: "server", status: response.status, error: errorText || `HTTP ${response.status}` };
    }

    const body = (await response.json()) as any;
    if (!body?.stored) {
      return {
        stored: false,
        source: "server",
        error: String(body?.error ?? "Server did not confirm the save.")
      };
    }

    for (const dupId of pruneIds) {
      try {
        await deleteBindingDetailed(type, dupId);
      } catch {
        // ignore prune failures
      }
    }

    const next = existing.filter((row) => !pruneIds.includes(String((row as any)?.id ?? "").trim()));
    const recordId = String(record.id ?? body?.id ?? "").trim();
    if (recordId) (record as any).id = recordId;
    const idx = recordId ? next.findIndex((x) => String((x as any)?.id ?? "").trim() === recordId) : -1;
    if (idx >= 0) next[idx] = record as any;
    else next.unshift(record as any);
    const deduped = dedupeBindings(type, next);
    writeCachedBindings(type, deduped, tenantId);
    return { stored: true, source: "server", id: recordId || undefined, status: response.status };
  } catch (err: any) {
    if (readActiveTenantId() !== tenantId) {
      return { stored: false, source: "server", error: "Database context changed before save completed." };
    }
    const next = existing.filter((row) => !pruneIds.includes(String((row as any)?.id ?? "").trim()));
    const recordId = String(record.id ?? "").trim();
    if (recordId) (record as any).id = recordId;
    const idx = recordId ? next.findIndex((x) => String((x as any)?.id ?? "").trim() === recordId) : -1;
    if (idx >= 0) next[idx] = record as any;
    else next.unshift(record as any);
    const deduped = dedupeBindings(type, next);
    writeCachedBindings(type, deduped, tenantId);
    return { stored: true, source: "local", id: recordId || undefined, error: String(err?.message ?? err) };
  }
}

export async function deleteBindingDetailed(
  type: "notifications" | "locations" | "devices",
  id: string
): Promise<{ deleted: boolean; source: "server" | "local"; status?: number; error?: string }> {
  const bindingId = String(id ?? "").trim();
  if (!bindingId) return { deleted: false, source: "server", error: "id is required" };
  const tenantId = readActiveTenantId();
  if (!tenantId || !isDatabaseTenant(tenantId)) {
    return { deleted: false, source: "server", error: "Select a database before deleting bindings." };
  }

  try {
    const initialApiKey = getApiKey();
    const hadStoredToken = Boolean(getStoredApiKey());
    const deleteBinding = async (apiKey: string) =>
      fetch(buildUrl(`/d1/bindings?type=${encodeURIComponent(type)}&id=${encodeURIComponent(bindingId)}`, tenantId), {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
          ...(apiKey ? { "x-api-key": apiKey } : {})
        }
      });

    let response = await deleteBinding(initialApiKey);
    if ((response.status === 401 || response.status === 403) && hadStoredToken) {
      const fallbackApiKey = getLocalDevFallbackApiKey(initialApiKey);
      if (fallbackApiKey) {
        response = await deleteBinding(fallbackApiKey);
      }
    }

    if (!response.ok) {
      let errorText = "";
      try {
        errorText = await response.text();
      } catch {
        // ignore
      }
      return { deleted: false, source: "server", status: response.status, error: errorText || `HTTP ${response.status}` };
    }

    removeCachedBinding(type, bindingId, tenantId);
    return { deleted: true, source: "server", status: response.status };
  } catch (err: any) {
    if (readActiveTenantId() !== tenantId) {
      return { deleted: false, source: "server", error: "Database context changed before delete completed." };
    }
    removeCachedBinding(type, bindingId, tenantId);
    return { deleted: true, source: "local", error: String(err?.message ?? err) };
  }
}

function bindingDeleteCandidates(row: { id?: string; name?: string }, type: string): string[] {
  const candidates = new Set<string>();
  const id = String(row?.id ?? "").trim();
  if (id) candidates.add(id);
  const name = String(row?.name ?? "").trim();
  if (name) {
    candidates.add(name);
    candidates.add(
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    );
    candidates.add(`${type}-${name.toLowerCase().replace(/\s+/g, "-")}`);
  }
  return [...candidates].filter(Boolean);
}

export async function purgeAllBindingsForCurrentTenant(): Promise<{ ok: boolean; deleted: number; remaining: number }> {
  const tenantId = readActiveTenantId();
  if (!tenantId || !isDatabaseTenant(tenantId)) return { ok: false, deleted: 0, remaining: 0 };

  let deleted = 0;
  const apiKey = getApiKey();

  for (const type of ["notifications", "locations", "devices"] as const) {
    try {
      const response = await fetch(buildUrl(`/d1/bindings?type=${type}&purge=1`, tenantId), {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
          ...(apiKey ? { "x-api-key": apiKey } : {})
        }
      });
      if (response.ok) {
        const body = (await response.json()) as any;
        deleted += Number(body?.deleted ?? 0) || 0;
        writeCachedBindings(type, [], tenantId);
        continue;
      }
    } catch {
      // fall through to row-by-row delete
    }

    const rows = await getBindings<{ id?: string; name?: string }>(type);
    for (const row of rows) {
      for (const id of bindingDeleteCandidates(row, type)) {
        const result = await deleteBindingDetailed(type, id);
        if (result.deleted) {
          deleted += 1;
          break;
        }
      }
    }
    writeCachedBindings(type, [], tenantId);
  }

  clearBindingsCache();

  const [notifications, locations, devices] = await Promise.all([
    getBindings("notifications"),
    getBindings("locations"),
    getBindings("devices")
  ]);
  const remaining = notifications.length + locations.length + devices.length;
  return { ok: remaining === 0, deleted, remaining };
}

function recoverCompositeTenantId(): string {
  let tenantId = String(getTenantId() ?? "").trim();
  if (tenantId) return tenantId;
  if (typeof window === "undefined") return "";
  const parts = [
    window.localStorage.getItem("vivi.activeDealerId"),
    window.localStorage.getItem("vivi.activeOrgId"),
    window.localStorage.getItem("vivi.activeDbId")
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    tenantId = parts.join(":");
    try {
      window.localStorage.setItem("vivi.tenantId", tenantId);
    } catch {
      // ignore
    }
  }
  return tenantId;
}

function driverScopeKey(site: string, tenantId = recoverCompositeTenantId()) {
  const tenantToken = siteScopeToken(tenantId) || "global";
  const siteToken = siteScopeToken(site);
  return `${DRIVERS_KV_BASE}:tenant:${tenantToken}:site:${siteToken}`;
}

async function fetchDriversFromD1<T = SharedDriverRecord>(sites: string[] = [], tenantId = recoverCompositeTenantId()): Promise<T[]> {
  if (!tenantId) return [];
  const params = new URLSearchParams();
  for (const site of sites) {
    const name = String(site ?? "").trim();
    if (name) params.append("sites", name);
  }
  const path = params.toString() ? `/d1/drivers?${params.toString()}` : "/d1/drivers";
  const result = await fetchJsonForTenant<{ drivers: T[]; tenantId?: string }>(
    path,
    { method: "GET" },
    tenantId
  );
  if (result.ok && Array.isArray(result.body?.drivers)) return result.body.drivers;
  return [];
}

async function loadDriversFromSiteKv(site: string, tenantId = recoverCompositeTenantId()): Promise<SharedDriverRecord[]> {
  const siteName = String(site ?? "").trim();
  if (!siteName) return [];
  const stored = await loadFromApi<{ items?: unknown[] } | unknown[]>(driverScopeKey(siteName, tenantId));
  const items = Array.isArray(stored)
    ? stored
    : Array.isArray((stored as { items?: unknown[] } | null)?.items)
      ? ((stored as { items: unknown[] }).items)
      : [];
  return mergeDriverRecords(items.map((row) => normalizeDriverRecord(row, siteName)));
}

async function saveDriversToSiteKv(
  site: string,
  rows: SharedDriverRecord[],
  tenantId = recoverCompositeTenantId()
): Promise<boolean> {
  const siteName = String(site ?? "").trim();
  if (!siteName || !tenantId) return false;
  const scoped = rows
    .map((row) => normalizeDriverRecord({ ...row, site: String(row.site ?? "").trim() || siteName }, siteName))
    .filter((row): row is SharedDriverRecord => Boolean(row));
  return saveToApi(driverScopeKey(siteName, tenantId), { items: scoped });
}

export async function getDriversFromApi<T = unknown>(options?: { heal?: boolean }): Promise<T[]> {
  const recoveredTenant = recoverCompositeTenantId() || getTenantId();
  const tenants = driverTenantsToLoad(recoveredTenant ? [recoveredTenant] : []);
  const sites = driverSitesToLoad();
  const cached = readCachedDrivers();
  const [d1Groups, kvGroups] = await Promise.all([
    Promise.all(tenants.map((tenantId) => fetchDriversFromD1<SharedDriverRecord>(sites, tenantId))),
    Promise.all(tenants.flatMap((tenantId) => sites.map((site) => loadDriversFromSiteKv(site, tenantId))))
  ]);
  const serverMerged = mergeDriverRecords(...d1Groups, ...kvGroups, cached);
  const canEditDrivers = canForPath("/Track/fleet/drivers", "edit");
  const selection = readStoredSelectionScope();
  const shouldHeal = Boolean(options?.heal) && canEditDrivers;

  const healed: SharedDriverRecord[] = [];
  if (shouldHeal) {
    const assetGroups = await Promise.all(
      tenants.map((tenantId) => getAssetsFromApiForTenant(tenantId).catch(() => [] as unknown[]))
    );
    const fromAssets = driverNamesFromAssets(assetGroups.flat());
    const localExtras = driversMissingFrom(
      mergeDriverRecords(readCachedDrivers(), readLocalUnsyncedDrivers()),
      serverMerged
    );
    for (const row of localExtras) {
      const posted = await postDriverToD1(row, tenantIdForDriverSite(row.site) || recoveredTenant);
      if (posted.stored) healed.push(normalizeDriverRecord(row) ?? row);
    }
    for (const stub of driversMissingFrom(fromAssets, mergeDriverRecords(serverMerged, healed))) {
      const posted = await postDriverToD1(stub, tenantIdForDriverSite(stub.site) || recoveredTenant);
      if (posted.stored) healed.push(stub);
    }
  }

  const merged = mergeDriverRecords(serverMerged, healed);
  const canRewriteSiteKv =
    shouldHeal &&
    (selection.scope === "db" || selection.scope === "site" || selection.scope === "asset") &&
    Boolean(recoveredTenant);
  if (canRewriteSiteKv) {
    const bySite = groupDriversBySite(merged);
    await Promise.all(
      Array.from(bySite.entries()).map(async ([site, rows]) => {
        const tenantId = tenantIdForDriverSite(site) || recoveredTenant;
        const existing = await loadDriversFromSiteKv(site, tenantId);
        if (driversMissingFrom(rows, existing).length === 0 && driversMissingFrom(existing, rows).length === 0) return;
        await saveDriversToSiteKv(site, rows, tenantId);
      })
    );
  }

  writeCachedDrivers(merged);
  return merged as T[];
}

export type ViviUserAlertAction = {
  decision: "yes" | "no";
  note?: string;
  actionedAt: string;
  actionedByUserId: string;
  actionedByName: string;
  actionedByEmail: string;
};

export type ViviUserAlert = {
  id: string;
  tenantId: string;
  userId: string;
  eventLabel: string;
  assetLabel: string;
  site?: string;
  locationName?: string;
  driver?: string;
  speedKph?: number;
  distanceKm?: number;
  latitude?: number;
  headingDeg?: number;
  positionId?: number;
  longitude?: number;
  message: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
  traccarEventId?: number;
  traccarDeviceId?: number;
  channels?: { email?: boolean; inApp?: boolean; sms?: boolean };
  read?: boolean;
  action?: ViviUserAlertAction;
};

/** In-app alerts dispatched by the Vivitel worker (Resend email is separate). */
const userAlertsCapabilityKeyPrefix = "vivi.capability.userAlerts.";

export type InfoHubSiteStreamMonitorPayload = {
  customStreams?: Array<{ id: string; name: string; source?: string }>;
  preferences?: Record<string, {
    name?: string;
    activeEventsEnabled?: boolean;
    selectedEvents?: string[];
    selectedEventTypes?: Record<string, string>;
    selectedAssets?: string[];
    playSounds?: boolean;
    eventPlaySounds?: Record<string, boolean>;
    undocked?: boolean;
    removed?: boolean;
  }>;
  monitoredTypes?: string[];
  monitoredLabels?: string[];
};

/** Load Info Hub stream selections for the signed-in user (server KV). */
export async function getInfoHubStreamMonitorFromApi(site?: string): Promise<{
  monitor?: { bySite?: Record<string, InfoHubSiteStreamMonitorPayload> };
  siteMonitor?: InfoHubSiteStreamMonitorPayload | null;
} | null> {
  const tenantId = getTenantId();
  const apiKey = getApiKey();
  const query = site ? `?site=${encodeURIComponent(site)}` : "";
  try {
    const response = await fetch(buildUrl(`/d1/infohub-streams${query}`, tenantId), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        ...(apiKey ? { "x-api-key": apiKey } : {})
      }
    });
    if (!response.ok) return null;
    return (await response.json()) as {
      monitor?: { bySite?: Record<string, InfoHubSiteStreamMonitorPayload> };
      siteMonitor?: InfoHubSiteStreamMonitorPayload | null;
    };
  } catch {
    return null;
  }
}

const infoHubNotificationHeaders = () => {
  const tenantId = getTenantId();
  const apiKey = getApiKey();
  return {
    tenantId,
    headers: {
      "content-type": "application/json",
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...(apiKey ? { "x-api-key": apiKey } : {})
    }
  };
};

/** Account-wide Info Hub notification history so every machine sees the same streams content. */
export async function getInfoHubNotificationsFromApi(site: string): Promise<Record<string, unknown>[] | null> {
  const { tenantId, headers } = infoHubNotificationHeaders();
  try {
    const response = await fetch(
      buildUrl(`/d1/infohub-notifications?site=${encodeURIComponent(site)}`, tenantId),
      { method: "GET", headers }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { notifications?: Record<string, unknown>[] };
    return Array.isArray(data.notifications) ? data.notifications : [];
  } catch {
    return null;
  }
}

export async function saveInfoHubNotificationsToApi(
  site: string,
  notifications: Record<string, unknown>[]
): Promise<boolean> {
  const { tenantId, headers } = infoHubNotificationHeaders();
  try {
    const response = await fetch(buildUrl("/d1/infohub-notifications", tenantId), {
      method: "POST",
      headers,
      body: JSON.stringify({ site, notifications })
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Persist Info Hub stream selections so the server can track them while Streams is closed. */
export async function saveInfoHubStreamMonitorToApi(
  site: string,
  siteMonitor: InfoHubSiteStreamMonitorPayload
): Promise<boolean> {
  const tenantId = getTenantId();
  const apiKey = getApiKey();
  try {
    const response = await fetch(buildUrl("/d1/infohub-streams", tenantId), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        ...(apiKey ? { "x-api-key": apiKey } : {})
      },
      body: JSON.stringify({ site, siteMonitor })
    });
    return response.ok;
  } catch {
    return false;
  }
}

const getUserAlertsCapabilityKey = () => {
  const base = String(getEffectiveApiBase() ?? "").trim() || "relative";
  return `${userAlertsCapabilityKeyPrefix}${base}`;
};

const getUserAlertsCapability = (): "supported" | "unsupported" | "unknown" => {
  if (typeof window === "undefined") return "unknown";
  const value = String(window.localStorage.getItem(getUserAlertsCapabilityKey()) ?? "").trim().toLowerCase();
  if (value === "supported") return "supported";
  if (value === "unsupported") return "unsupported";
  return "unknown";
};

const setUserAlertsCapability = (value: "supported" | "unsupported") => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getUserAlertsCapabilityKey(), value);
};

export async function getUserAlertsFromApi(since?: string): Promise<ViviUserAlert[]> {
  let viviAlerts: ViviUserAlert[] = [];
  if (getUserAlertsCapability() !== "unsupported") {
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    try {
      const tenantId = getTenantId();
      const apiKey = getApiKey();
      const response = await fetch(buildUrl(`/d1/user-alerts${query}`, tenantId), {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...(tenantId ? { "x-tenant-id": tenantId } : {}),
          ...(apiKey ? { "x-api-key": apiKey } : {})
        }
      });
      if (response.status === 404 || response.status === 405) {
        setUserAlertsCapability("unsupported");
      } else if (response.ok) {
        setUserAlertsCapability("supported");
        const body = (await response.json()) as { alerts?: ViviUserAlert[] };
        viviAlerts = body?.alerts ?? [];
      }
    } catch {
      // Soft-fail; GPS IoT alerts may still load below.
    }
  }

  if (!isGpsIotServer()) return viviAlerts;

  // UK: merge site-scoped GetNotificationAlerts into the alerts feed (never cross-site).
  try {
    const { mapGpsIotNotificationAlertToViviUserAlert } = await import("./gpsiotNotificationMap");
    const { readActiveSiteName } = await import("./tenantContext");
    const { sitesEquivalent } = await import("./bindingResolve");
    const site = readActiveSiteName();
    if (site) {
      viviAlerts = viviAlerts.filter((alert) => {
        const alertSite = String(alert.site ?? "").trim();
        return !alertSite || sitesEquivalent(alertSite, site);
      });
    }
    const sinceMs = since ? Date.parse(since) : NaN;
    const end = new Date();
    const start = Number.isFinite(sinceMs)
      ? new Date(sinceMs)
      : new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = (d: Date) =>
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    const rows = await getGpsIotNotificationAlerts({
      startDate: stamp(start),
      endDate: stamp(end),
      timeZoneId: "UTC",
      site: site || undefined
    });
    const tenantId = getTenantId();
    const mapped = rows.map((raw) =>
      mapGpsIotNotificationAlertToViviUserAlert(
        {
          alertId: String(raw.alertId ?? raw.AlertId ?? ""),
          imei: String(raw.imei ?? raw.ImeiNumber ?? ""),
          latitude: Number(raw.latitude ?? raw.Latitude ?? NaN),
          longitude: Number(raw.longitude ?? raw.Longitude ?? NaN),
          assetName: String(raw.assetName ?? raw.AssetName ?? ""),
          alertName: String(raw.alertName ?? raw.AlertName ?? ""),
          priority: String(raw.priority ?? raw.Priority ?? ""),
          eventName: String(raw.eventName ?? raw.EventName ?? ""),
          location: String(raw.location ?? raw.Location ?? ""),
          gpsDateTime: String(raw.gpsDateTime ?? raw.GpsDateTime ?? ""),
          speed: Number(raw.speed ?? raw.Speed ?? NaN),
          roadSpeed: Number(raw.roadSpeed ?? raw.RoadSpeed ?? NaN),
          ignition: Boolean(raw.ignition ?? raw.IgnitionStatus),
          eventId: String(raw.eventId ?? raw.EventId ?? ""),
          additionalEventInfo: String(raw.additionalEventInfo ?? raw.AdditionalEventInfo ?? ""),
          isDismissed: Boolean(raw.isDismissed ?? raw.IsDismissed),
          userTimeDate: String(raw.userTimeDate ?? raw.UserTimeDate ?? "")
        },
        { tenantId, site }
      )
    ) as ViviUserAlert[];
    const byId = new Map<string, ViviUserAlert>();
    for (const row of viviAlerts) byId.set(row.id, row);
    for (const row of mapped) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    return Array.from(byId.values()).sort(
      (a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt))
    );
  } catch {
    return viviAlerts;
  }
}

/** Action a stream / in-app user alert with Yes (requires note) or No (auto-save). */
export async function actionUserAlertApi(input: {
  id: string;
  decision: "yes" | "no";
  note?: string;
}): Promise<{ ok: boolean; alert?: ViviUserAlert; error?: string }> {
  try {
    const tenantId = getTenantId();
    const apiKey = getApiKey();
    const response = await fetch(buildUrl("/d1/user-alerts", tenantId), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        ...(apiKey ? { "x-api-key": apiKey } : {})
      },
      body: JSON.stringify({
        id: input.id,
        decision: input.decision,
        note: input.note
      })
    });
    const body = (await response.json().catch(() => null)) as
      | { alert?: ViviUserAlert; error?: string; message?: string }
      | null;
    if (!response.ok) {
      return {
        ok: false,
        error: String(body?.error ?? body?.message ?? `HTTP ${response.status}`)
      };
    }
    return { ok: true, alert: body?.alert };
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error ?? "Unable to action alert") };
  }
}

async function postDriverToD1(
  payload: unknown,
  tenantIdOverride?: string
): Promise<{
  stored: boolean;
  status?: number;
  error?: string;
  body?: any;
}> {
  try {
    const tenantId = String(tenantIdOverride ?? "").trim() || recoverCompositeTenantId();
    const apiKey = getApiKey();
    const hadStoredToken = Boolean(getStoredApiKey());
    if (!tenantId) {
      return { stored: false, status: 400, error: "Select a database before saving a driver." };
    }

    const doFetch = async (key: string) =>
      fetch(buildUrl(`/d1/drivers`, tenantId), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(tenantId ? { "x-tenant-id": tenantId } : {}),
          ...(key ? { "x-api-key": key } : {})
        },
        body: JSON.stringify(payload ?? {})
      });

    let response = await doFetch(apiKey);
    if ((response.status === 401 || response.status === 403) && hadStoredToken) {
      const fallback = getLocalDevFallbackApiKey(apiKey);
      if (fallback) {
        response = await doFetch(fallback);
      }
    }

    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!response.ok) {
      return {
        stored: false,
        status: response.status,
        error: extractErrorMessage(body, text),
        body
      };
    }

    return {
      stored: Boolean(body?.stored),
      status: response.status,
      body
    };
  } catch (err: any) {
    return {
      stored: false,
      status: 0,
      error: String(err?.message ?? err)
    };
  }
}

export async function upsertDriverDetailed(payload: unknown): Promise<{
  stored: boolean;
  status?: number;
  error?: string;
  body?: any;
}> {
  const row = normalizeDriverRecord(payload);
  if (!row?.name) {
    return { stored: false, status: 400, error: "Driver name and site are required." };
  }
  if (!row.site) {
    return { stored: false, status: 400, error: "Select a site before saving the driver." };
  }

  if (isGpsIotServer()) {
    // Local placeholder Driver IDs must not trigger UpdateDriver — only gpsiot-driver:* identities do.
    const rowId = String(row.id ?? "").trim();
    const isExistingGpsIot = /^gpsiot-driver:/i.test(rowId);
    const saved = await saveGpsIotDriverDetails({
      ...row,
      name: row.name,
      driverId: isExistingGpsIot ? row.driverId : "",
      id: isExistingGpsIot ? rowId : "",
      extendedDriverId: row.extendedDriverId,
      employeeNumber: row.employeeNumber,
      mobileNumber: row.mobileNumber,
      driverType: row.driverType,
      licenceNo: row.licenceNo,
      licenseExpiryDate: row.licenseExpiryDate,
      driverDob: row.driverDob,
      timeZone: row.timeZone,
      site: row.site
    });
    if (saved.stored) {
      const driverId = String(saved.body?.driverId ?? row.driverId ?? "").trim();
      const next = normalizeDriverRecord({
        ...row,
        ...(driverId ? { driverId, id: `gpsiot-driver:${driverId}` } : {}),
        ...(saved.body?.driver && typeof saved.body.driver === "object" ? saved.body.driver : {})
      });
      if (next) {
        writeCachedDrivers(mergeDriverRecords(readCachedDrivers(), [next]));
        const tenantId = tenantIdForDriverSite(row.site) || recoverCompositeTenantId();
        if (tenantId) {
          const siteRows = mergeDriverRecords(await loadDriversFromSiteKv(row.site, tenantId), [next]);
          await saveDriversToSiteKv(row.site, siteRows, tenantId);
        }
      }
      return {
        stored: true,
        status: saved.status,
        body: { stored: true, created: saved.body?.created, updated: saved.body?.updated, ...saved.body }
      };
    }
    return { stored: false, status: saved.status, error: saved.error, body: saved.body };
  }

  const tenantId = tenantIdForDriverSite(row.site) || recoverCompositeTenantId();
  const d1 = await postDriverToD1(row, tenantId);
  const siteRows = mergeDriverRecords(await loadDriversFromSiteKv(row.site, tenantId), [row]);
  const kvStored = await saveDriversToSiteKv(row.site, siteRows, tenantId);
  if (d1.stored || kvStored) {
    writeCachedDrivers(mergeDriverRecords(readCachedDrivers(), [row]));
    return { stored: true, status: d1.status ?? 200, body: d1.body, error: d1.stored ? undefined : d1.error };
  }
  return d1;
}

export async function upsertDriverToApi(payload: unknown): Promise<boolean> {
  const result = await upsertDriverDetailed(payload);
  return Boolean(result.stored);
}

export async function ensureNamedDriverOnServer(name: string, site: string): Promise<boolean> {
  const stub = namedDriverStub(name, site);
  if (!stub) return false;
  const existing = await getDriversFromApi<SharedDriverRecord>();
  const already = existing.some(
    (row) =>
      String(row.site ?? "").trim() &&
      siteScopeToken(String(row.site ?? "")) === siteScopeToken(stub.site) &&
      String(row.name ?? "").trim().toLowerCase() === stub.name.toLowerCase()
  );
  if (already) return true;
  const result = await upsertDriverDetailed(stub);
  return Boolean(result.stored);
}

export async function deleteDriverFromApi(id: string, site?: string): Promise<boolean> {
  const driverId = String(id ?? "").trim();
  if (!driverId) return false;
  const siteName = String(site ?? "").trim();
  const tenantId = tenantIdForDriverSite(siteName) || recoverCompositeTenantId();

  if (isGpsIotServer()) {
    const gpsIotId = driverId.replace(/^gpsiot-driver:/i, "").trim();
    if (gpsIotId) {
      try {
        await fetchJson("/gpsiot/drivers", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ driverId: gpsIotId })
        });
      } catch {
        // Still clear local/site cache below.
      }
    }
    if (siteName && tenantId) {
      const remaining = (await loadDriversFromSiteKv(siteName, tenantId)).filter(
        (row) => String(row.id ?? "").trim() !== driverId
          && String(row.driverId ?? "").trim() !== gpsIotId
      );
      await saveDriversToSiteKv(siteName, remaining, tenantId);
    }
    writeCachedDrivers(
      readCachedDrivers().filter(
        (row) => String(row.id ?? "").trim() !== driverId
          && String(row.driverId ?? "").trim() !== gpsIotId
      )
    );
    return true;
  }

  const result = await fetchJsonForTenant<{ deleted: boolean }>(
    `/d1/drivers?id=${encodeURIComponent(driverId)}`,
    { method: "DELETE" },
    tenantId || null
  );
  const deletedOnD1 = Boolean(result.ok && result.body?.deleted);
  if (siteName && tenantId) {
    const remaining = (await loadDriversFromSiteKv(siteName, tenantId)).filter(
      (row) => String(row.id ?? "").trim() !== driverId
    );
    await saveDriversToSiteKv(siteName, remaining, tenantId);
  }
  writeCachedDrivers(readCachedDrivers().filter((row) => String(row.id ?? "").trim() !== driverId));
  return deletedOnD1 || Boolean(siteName);
}

export async function getTripsFromApi<T = unknown>(
  query?: Record<string, string | number | boolean | null | undefined>
): Promise<T[]> {
  let url = "/d1/trips";
  if (query && typeof query === "object") {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      const text = String(value).trim();
      if (!text) return;
      params.set(key, text);
    });
    const qs = params.toString();
    if (qs) url = `${url}?${qs}`;
  }
  const response = await fetchJson<{ trips: T[] }>(url);
  return response?.trips ?? [];
}

export async function upsertTripToApi(payload: unknown): Promise<boolean> {
  const response = await fetchJson<{ stored: boolean }>("/d1/trips", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  return Boolean(response?.stored);
}

export async function getCamerasFromApi<T = unknown>(): Promise<T[]> {
  const response = await fetchJson<{ cameras: T[] }>("/d1/cameras");
  return response?.cameras ?? [];
}

export async function upsertCameraToApi(payload: unknown): Promise<boolean> {
  const response = await fetchJson<{ stored: boolean }>("/d1/cameras", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  return Boolean(response?.stored);
}

export async function getWarehousesFromApi<T = unknown>(): Promise<T[]> {
  const response = await fetchJson<{ warehouses: T[] }>("/d1/warehouses");
  return response?.warehouses ?? [];
}

export async function upsertWarehouseToApi(payload: unknown): Promise<boolean> {
  const response = await fetchJson<{ stored: boolean }>("/d1/warehouses", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  return Boolean(response?.stored);
}

export async function getAlertsFromApi<T = unknown>(): Promise<T[]> {
  const response = await fetchJson<{ alerts: T[] }>("/d1/alerts");
  return response?.alerts ?? [];
}

export async function upsertAlertToApi(payload: unknown): Promise<boolean> {
  const response = await fetchJson<{ stored: boolean }>("/d1/alerts", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  return Boolean(response?.stored);
}

export async function deleteAlertFromApi(id: string): Promise<boolean> {
  const response = await fetchJson<{ deleted: boolean }>(
    `/d1/alerts?id=${encodeURIComponent(String(id ?? "").trim())}`,
    { method: "DELETE" }
  );
  return Boolean(response?.deleted);
}

export type LiveVideoChannel = {
  index: number;
  key: string;
  label: string;
  streamUrl?: string | null;
};

export type LiveVideoSessionResponse = {
  ok: boolean;
  available: boolean;
  streamUrl?: string | null;
  token?: string | null;
  source?: "camera" | "asset" | "none";
  cameraId?: string | null;
  assetId?: string | null;
  channel?: LiveVideoChannel | null;
  channels?: LiveVideoChannel[];
  message?: string;
};

export async function createLiveVideoSession(input: {
  cameraId?: string;
  assetId?: string;
  channel?: number;
  channelKey?: string;
  channelLabel?: string;
}): Promise<LiveVideoSessionResponse | null> {
  const channelNumber = Number(input?.channel ?? 1);
  const body = {
    ...(String(input?.cameraId ?? "").trim() ? { cameraId: String(input?.cameraId ?? "").trim() } : {}),
    ...(String(input?.assetId ?? "").trim() ? { assetId: String(input?.assetId ?? "").trim() } : {}),
    channel: Number.isFinite(channelNumber) && channelNumber > 0 ? Math.floor(channelNumber) : 1,
    ...(String(input?.channelKey ?? "").trim() ? { channelKey: String(input?.channelKey ?? "").trim() } : {}),
    ...(String(input?.channelLabel ?? "").trim() ? { channelLabel: String(input?.channelLabel ?? "").trim() } : {})
  };

  return fetchJson<LiveVideoSessionResponse>("/camera/live/session", {
    method: "POST",
    body: JSON.stringify({ ...body, site: readActiveSiteName() })
  });
}

export type IntercomSessionStartResponse = {
  started: boolean;
  sessionId?: string;
  cameraId?: string;
  assetId?: string | null;
  queued?: boolean;
  queueId?: string | null;
  startedAt?: string;
  talkbackReady?: boolean;
  message?: string;
  error?: string;
};

export type IntercomSessionStatusResponse = {
  cameraId?: string;
  lastSeenAt?: string;
  lastAudioAt?: string;
  inboundLive?: boolean;
  audioChunks?: number;
  pendingTalkback?: boolean;
  transport?: string;
  online?: boolean;
};

const intercomAuthHeaders = () => {
  const tenantId = getTenantId();
  const apiKey = getApiKey();
  return {
    "content-type": "application/json",
    ...(tenantId ? { "x-tenant-id": tenantId } : {}),
    ...(apiKey ? { "x-api-key": apiKey } : {})
  };
};

export async function startIntercomSession(input: {
  cameraId: string;
  assetId?: string;
}): Promise<IntercomSessionStartResponse> {
  const cameraId = String(input?.cameraId ?? "").trim();
  if (!cameraId) return { started: false, error: "cameraId is required" };

  try {
    const response = await fetch(buildUrl("/intercom/session/start"), {
      method: "POST",
      headers: intercomAuthHeaders(),
      body: JSON.stringify({
        cameraId,
        deviceId: cameraId,
        imei: cameraId,
        ...(String(input?.assetId ?? "").trim() ? { assetId: String(input.assetId).trim() } : {})
      })
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      return { started: false, error: extractErrorMessage(body, text) };
    }
    return {
      started: Boolean(body?.started ?? true),
      sessionId: body?.sessionId,
      cameraId: body?.cameraId ?? cameraId,
      assetId: body?.assetId ?? input.assetId ?? null,
      queued: Boolean(body?.queued),
      queueId: body?.queueId ?? null,
      startedAt: body?.startedAt,
      talkbackReady: Boolean(body?.talkbackReady ?? true),
      message: String(body?.message ?? "")
    };
  } catch (err: any) {
    return { started: false, error: String(err?.message ?? err) };
  }
}

export async function getIntercomSessionStatus(cameraId: string): Promise<IntercomSessionStatusResponse | null> {
  const id = String(cameraId ?? "").trim();
  if (!id) return null;
  try {
    const response = await fetch(
      buildUrl(`/intercom/session/status?cameraId=${encodeURIComponent(id)}`),
      { method: "GET", headers: intercomAuthHeaders() }
    );
    if (!response.ok) return null;
    return (await response.json()) as IntercomSessionStatusResponse;
  } catch {
    return null;
  }
}

export async function enqueueIntercomTalkback(input: {
  cameraId: string;
  pcm16leBase64: string;
  sampleRate?: number;
  channels?: number;
}): Promise<{ queued: boolean; id?: string; error?: string }> {
  const cameraId = String(input?.cameraId ?? "").trim();
  const pcm16leBase64 = String(input?.pcm16leBase64 ?? "").trim();
  if (!cameraId) return { queued: false, error: "cameraId is required" };
  if (!pcm16leBase64) return { queued: false, error: "audio payload is required" };

  try {
    const response = await fetch(buildUrl("/intercom/talkback/enqueue"), {
      method: "POST",
      headers: intercomAuthHeaders(),
      body: JSON.stringify({
        cameraId,
        deviceId: cameraId,
        pcm16leBase64,
        sampleRate: input.sampleRate ?? 16_000,
        channels: input.channels ?? 1
      })
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      return { queued: false, error: extractErrorMessage(body, text) };
    }
    return { queued: Boolean(body?.queued ?? true), id: body?.id };
  } catch (err: any) {
    return { queued: false, error: String(err?.message ?? err) };
  }
}

export type Cmsv6Config = {
  site?: string;
  enabled?: boolean;
  authMode?: "sso" | "password";
  baseUrl?: string;
  account?: string;
  password?: string;
  passwordSet?: boolean;
  sessionSet?: boolean;
  ssoUser?: string;
  ssoConnected?: boolean;
  language?: string;
  mediaHost?: string;
  mediaPort?: number;
  toMap?: number;
  positioningProtocol?: string;
  videoProtocol?: string;
};

export type Cmsv6Vehicle = {
  vehiIdno?: string;
  vehicleId?: string;
  company?: string;
  companyId?: string;
  devIdno?: string;
  deviceId?: string;
  channels?: number;
  channelNames?: string[];
  installedAt?: string;
  gbCode?: string;
};

export async function getCmsv6Config() {
  return fetchJson<{ ok: boolean; config: Cmsv6Config; site?: string; authMode?: string; ssoUser?: string; ssoConnected?: boolean }>("/cmsv6/config");
}

export async function saveCmsv6Config(payload: Cmsv6Config) {
  return fetchJson<{ ok: boolean; stored?: boolean; config?: Cmsv6Config; error?: string }>("/cmsv6/config", {
    method: "POST",
    body: JSON.stringify({ ...payload, site: payload.site || readActiveSiteName() })
  });
}

export async function testCmsv6Connection() {
  return fetchJson<{ ok: boolean; message?: string; result?: number; session?: boolean; authMode?: string; ssoUser?: string }>("/cmsv6/test", {
    method: "POST",
    body: JSON.stringify({ site: readActiveSiteName() })
  });
}

export async function connectCmsv6Sso(input?: { account?: string; password?: string; force?: boolean }) {
  const signedIn = readSignedInUser();
  return fetchJson<{ ok: boolean; message?: string; session?: boolean; authMode?: string; ssoUser?: string; error?: string }>("/cmsv6/sso", {
    method: "POST",
    body: JSON.stringify({
      site: readActiveSiteName(),
      account: String(input?.account ?? signedIn.email).trim(),
      ...(input?.force ? { force: true } : {}),
      ...(String(input?.password ?? "").trim() ? { password: String(input?.password ?? "").trim() } : {})
    })
  });
}

export async function getCmsv6Catalog() {
  return fetchJson<{ ok: boolean; groups: string[]; endpoints: Array<Record<string, unknown>> }>("/cmsv6/catalog");
}

export async function getCmsv6Vehicles() {
  const site = readActiveSiteName();
  const path = site ? `/cmsv6/vehicles?site=${encodeURIComponent(site)}` : "/cmsv6/vehicles";
  return fetchJson<{ ok: boolean; vehicles?: Cmsv6Vehicle[]; count?: number; message?: string }>(path);
}

export async function callCmsv6<T = Record<string, unknown>>(path: string, init?: RequestInit) {
  const method = String(init?.method ?? "GET").toUpperCase();
  const site = readActiveSiteName();
  const separator = path.includes("?") ? "&" : "?";
  const withSite = site && !/[?&]site=/.test(path) ? `${path}${separator}site=${encodeURIComponent(site)}` : path;
  if (method === "GET" || method === "HEAD") {
    return fetchJson<T>(withSite, init);
  }
  let body: Record<string, unknown> = { site };
  if (init?.body) {
    try {
      const parsed = JSON.parse(String(init.body));
      if (parsed && typeof parsed === "object") body = { ...parsed, site: (parsed as any).site || site };
    } catch {
      body = { site };
    }
  }
  return fetchJson<T>(path, { ...init, body: JSON.stringify(body) });
}

export async function kickAvlSocket(imei: string, command?: string): Promise<{ queued: boolean; error?: string }> {
  try {
    const tenantId = getTenantId();
    const apiKey = getApiKey();
    const payload = JSON.stringify({ imei, ...(command ? { command } : {}) });

    const sendKick = async (url: string) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(tenantId ? { "x-tenant-id": tenantId } : {}),
          ...(apiKey ? { "x-api-key": apiKey } : {})
        },
        body: payload
      });
      const text = await response.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { response, text, body };
    };

    const primaryUrl = buildUrl("/device/kick-avl");
    let result = await sendKick(primaryUrl);

    const primaryErr = extractErrorMessage(result.body, result.text).toLowerCase();
    const shouldFallbackToDeviceServer =
      Boolean(getSafeDeviceServerBase())
      && !primaryUrl.startsWith(getSafeDeviceServerBase())
      && (!result.response.ok || !Boolean(result.body?.queued))
      && (
        Boolean(result.body?.skipped)
        || primaryErr.includes("traccar not configured")
        || primaryErr.includes("traccar auth not configured")
      );

    if (shouldFallbackToDeviceServer) {
      const fallbackUrl = `${getSafeDeviceServerBase().replace(/\/$/, "")}/device/kick-avl`;
      result = await sendKick(fallbackUrl);
    }

    if (!result.response.ok) {
      return { queued: false, error: extractErrorMessage(result.body, result.text) };
    }
    const queued = Boolean(result.body?.queued);
    if (!queued) {
      return {
        queued: false,
        error: extractErrorMessage(result.body, result.text) || "Device wake-up command was not queued."
      };
    }
    return { queued: true };
  } catch (err: any) {
    return { queued: false, error: String(err?.message ?? err) };
  }
}

// --- Drone delivery (Deliver) ---

export async function deliverGetState(): Promise<any> {
  const response = await fetchJson<any>("/deliver/state");
  return response ?? { summary: {}, drones: [], orders: [], requirements: {} };
}

export async function deliverTrackOrders(phone: string): Promise<{ orders: any[] }> {
  const response = await fetchJson<{ orders: any[] }>(`/deliver/orders?phone=${encodeURIComponent(phone)}`);
  return { orders: response?.orders ?? [] };
}

export async function deliverPlaceOrder(payload: {
  clientName: string;
  clientPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  packageWeightKg: number;
  priority: string;
  packageType?: string;
  deliveryMode?: string;
  insuranceSelected?: boolean;
  scheduledAt?: string;
  dimensions?: { lengthCm?: number; widthCm?: number; heightCm?: number };
}): Promise<{ ok: boolean; order?: any; error?: string }> {
  const response = await fetchJson<any>("/deliver/orders", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  if (!response) return { ok: false, error: "Request failed" };
  if (response.error) return { ok: false, error: String(response.error) };
  return { ok: true, order: response.order };
}

export async function deliverRegisterDrone(payload: Record<string, unknown>): Promise<{ ok: boolean; drone?: any; error?: string }> {
  const response = await fetchJson<any>("/deliver/drones", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  if (!response) return { ok: false, error: "Request failed" };
  if (response.error) return { ok: false, error: String(response.error) };
  return { ok: true, drone: response.drone };
}

export async function deliverAutoAssignPending(): Promise<{ assignedCount: number; error?: string }> {
  const response = await fetchJson<any>("/deliver/orders/auto-assign", { method: "POST", body: "{}" });
  if (!response) return { assignedCount: 0, error: "Request failed" };
  if (response.error) return { assignedCount: 0, error: String(response.error) };
  return { assignedCount: Number(response.assignedCount ?? 0) || 0 };
}

export async function deliverAssignOrder(orderId: string, droneId: string): Promise<{ ok: boolean; error?: string }> {
  const response = await fetchJson<any>(`/deliver/orders/${encodeURIComponent(orderId)}/assign`, {
    method: "POST",
    body: JSON.stringify({ droneId })
  });
  if (!response) return { ok: false, error: "Request failed" };
  if (response.error) return { ok: false, error: String(response.error) };
  return { ok: true };
}

export async function deliverConfirmDelivery(
  orderId: string,
  payload: { receiverName: string; proofCode: string; notes?: string }
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetchJson<any>(`/deliver/orders/${encodeURIComponent(orderId)}/confirm`, {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  if (!response) return { ok: false, error: "Request failed" };
  if (response.error) return { ok: false, error: String(response.error) };
  return { ok: true };
}

export async function deliverGetClients(): Promise<any[]> {
  const response = await fetchJson<{ clients: any[] }>("/deliver/clients");
  return response?.clients ?? [];
}

export async function deliverSaveClient(payload: any): Promise<{ ok: boolean; error?: string }> {
  const response = await fetchJson<any>("/deliver/clients", { method: "POST", body: JSON.stringify(payload ?? {}) });
  if (!response) return { ok: false, error: "Request failed" };
  if (response.error) return { ok: false, error: String(response.error) };
  return { ok: true };
}

export async function deliverGetRegions(): Promise<any[]> {
  const response = await fetchJson<{ regions: any[] }>("/deliver/regions");
  return response?.regions ?? [];
}

export async function deliverSaveRegion(payload: any): Promise<{ ok: boolean; error?: string }> {
  const response = await fetchJson<any>("/deliver/regions", { method: "POST", body: JSON.stringify(payload ?? {}) });
  if (!response) return { ok: false, error: "Request failed" };
  if (response.error) return { ok: false, error: String(response.error) };
  return { ok: true };
}

export async function deliverGetDroneGroups(): Promise<any[]> {
  const response = await fetchJson<{ droneGroups: any[] }>("/deliver/drone-groups");
  return response?.droneGroups ?? [];
}

export async function deliverSaveDroneGroup(payload: any): Promise<{ ok: boolean; error?: string }> {
  const response = await fetchJson<any>("/deliver/drone-groups", { method: "POST", body: JSON.stringify(payload ?? {}) });
  if (!response) return { ok: false, error: "Request failed" };
  if (response.error) return { ok: false, error: String(response.error) };
  return { ok: true };
}

export async function deliverGetHealth(): Promise<any[]> {
  const response = await fetchJson<{ health: any[] }>("/deliver/health");
  return response?.health ?? [];
}

export async function deliverGetOrders(filter: { status?: string } = {}): Promise<any[]> {
  const qs = filter.status ? `?status=${encodeURIComponent(filter.status)}` : "";
  const response = await fetchJson<{ orders: any[] }>(`/deliver/orders${qs}`);
  return response?.orders ?? [];
}

export async function deliverSetOrderStatus(orderId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const response = await fetchJson<any>(`/deliver/orders/${encodeURIComponent(orderId)}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
  if (!response) return { ok: false, error: "Request failed" };
  if (response.error) return { ok: false, error: String(response.error) };
  return { ok: true };
}

// --- Deliver platform (8-panel spec) ---

async function deliverPlatformJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  return fetchJson<T>(path, init);
}

export async function deliverCustomerDashboard(phone: string) {
  return (
    (await deliverPlatformJson<any>(`/deliver/platform/customer/dashboard?phone=${encodeURIComponent(phone)}`)) ?? {
      activeDelivery: null,
      recentDeliveries: [],
      savedAddresses: [],
      walletBalance: 0,
      currency: "KES",
      profile: null,
      promotions: [],
      recommendations: []
    }
  );
}

export async function deliverSaveCustomerProfile(payload: Record<string, unknown>) {
  const response = await deliverPlatformJson<any>("/deliver/platform/customer/profile", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return { ok: Boolean(response?.ok), profile: response?.profile, error: response?.error };
}

export async function deliverGetAddresses(phone: string) {
  const response = await deliverPlatformJson<{ addresses: any[] }>(
    `/deliver/platform/addresses?phone=${encodeURIComponent(phone)}`
  );
  return response?.addresses ?? [];
}

export async function deliverSaveAddress(payload: Record<string, unknown>) {
  const response = await deliverPlatformJson<any>("/deliver/platform/addresses", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return { ok: Boolean(response?.ok), address: response?.address, error: response?.error };
}

export async function deliverGetWallet(phone: string) {
  const response = await deliverPlatformJson<{ wallet: any }>(`/deliver/platform/wallet?phone=${encodeURIComponent(phone)}`);
  return response?.wallet ?? { balance: 0, currency: "KES", transactions: [] };
}

export async function deliverTopUpWallet(phone: string, amount: number, note?: string) {
  const response = await deliverPlatformJson<any>("/deliver/platform/wallet", {
    method: "POST",
    body: JSON.stringify({ phone, amount, note })
  });
  return { ok: Boolean(response?.ok), wallet: response?.wallet, error: response?.error };
}

export async function deliverGetPromotions() {
  const response = await deliverPlatformJson<{ promotions: any[] }>("/deliver/platform/promotions");
  return response?.promotions ?? [];
}

export async function deliverGroundOpsDashboard() {
  return (
    (await deliverPlatformJson<any>("/deliver/platform/ground-ops/dashboard")) ?? {
      dashboard: {},
      orders: [],
      drivers: [],
      vehicles: [],
      incidents: [],
      exceptions: []
    }
  );
}

export async function deliverPlatformList(path: string) {
  const response = await deliverPlatformJson<{ items: any[] }>(path);
  return response?.items ?? [];
}

export async function deliverPlatformSave(path: string, payload: Record<string, unknown>) {
  const response = await deliverPlatformJson<any>(path, { method: "POST", body: JSON.stringify(payload) });
  return { ok: Boolean(response?.ok), item: response?.item, error: response?.error };
}

export async function deliverDriverAssignments(driverId?: string) {
  const qs = driverId ? `?driverId=${encodeURIComponent(driverId)}` : "";
  return (await deliverPlatformJson<any>(`/deliver/platform/driver/assignments${qs}`)) ?? { orders: [], driver: null };
}

export async function deliverSetDriverStatus(driverId: string, availability: string) {
  const response = await deliverPlatformJson<any>("/deliver/platform/driver/status", {
    method: "POST",
    body: JSON.stringify({ driverId, availability })
  });
  return { ok: Boolean(response?.ok), driver: response?.driver, error: response?.error };
}

export async function deliverExecutiveDashboard() {
  return (await deliverPlatformJson<any>("/deliver/platform/executive/dashboard")) ?? { dashboard: {}, settings: {} };
}

export async function deliverSavePlatformSettings(payload: Record<string, unknown>) {
  const response = await deliverPlatformJson<any>("/deliver/platform/settings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return { ok: Boolean(response?.ok), settings: response?.settings, error: response?.error };
}

export async function deliverReplySupportTicket(ticketId: string, message: string, author?: string) {
  const response = await deliverPlatformJson<any>("/deliver/platform/support/tickets/reply", {
    method: "POST",
    body: JSON.stringify({ ticketId, message, author })
  });
  return { ok: Boolean(response?.ok), ticket: response?.ticket, error: response?.error };
}

export type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  at: string;
};

export type ChatConversation = {
  id: string;
  status: "open" | "closed";
  createdAt: string;
  closedAt?: string;
  user?: { name?: string; email?: string };
  assignedAgent?: { id?: string; name?: string; category?: string };
  messages: ChatMessage[];
};

export async function getChatConversation(conversationId: string): Promise<ChatConversation | null> {
  const response = await fetchJson<{ conversation: ChatConversation | null }>(
    `/support/chat?id=${encodeURIComponent(conversationId)}`
  );
  return response?.conversation ?? null;
}

export async function sendChatMessage(payload: {
  conversationId?: string;
  message: string;
  userName?: string;
  userEmail?: string;
  agentId?: string;
  agentName?: string;
  agentCategory?: string;
}): Promise<ChatConversation | null> {
  const response = await fetchJson<{ conversation: ChatConversation }>("/support/chat", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response?.conversation ?? null;
}

export async function endChatConversation(conversationId: string): Promise<boolean> {
  const response = await fetchJson<{ ended: boolean }>("/support/chat/end", {
    method: "POST",
    body: JSON.stringify({ conversationId })
  });
  return Boolean(response?.ended);
}

export async function sendSupportChatReply(payload: {
  conversationId: string;
  message: string;
  agentId?: string;
  agentName?: string;
}): Promise<ChatConversation | null> {
  const response = await fetchJson<{ conversation: ChatConversation }>("/support/chat/reply", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response?.conversation ?? null;
}

export async function getSupportChatInbox(limit = 50): Promise<ChatConversation[]> {
  const response = await fetchJson<{ conversations: ChatConversation[] }>(
    `/support/chat/inbox?limit=${encodeURIComponent(String(limit))}`
  );
  return Array.isArray(response?.conversations) ? response.conversations : [];
}

export async function postSupportAgentHeartbeat(agentId: string): Promise<boolean> {
  const response = await fetchJson<{ ok?: boolean }>(`/support/agents/${encodeURIComponent(agentId)}/heartbeat`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return Boolean(response?.ok);
}

export const isOwnSupportPrincipal = () => {
  const principal = readCachedPrincipal()?.principal as {
    isOwnSupport?: boolean;
    isTenantAdmin?: boolean;
    kind?: string;
  } | undefined;
  if (!principal) return false;
  if (String(principal.kind ?? "").toLowerCase() === "admin") return true;
  // Own Support / tenant Admin only — Dealer Support still uses the customer "Live agents" view.
  return Boolean(principal.isOwnSupport || principal.isTenantAdmin);
};

export const readPrincipalIdentity = () => {
  const principal = readCachedPrincipal()?.principal as { userId?: string; name?: string; email?: string; kind?: string } | undefined;
  return {
    userId: String(principal?.userId ?? "").trim(),
    name: String(principal?.name ?? "").trim(),
    email: String(principal?.email ?? "").trim(),
    isAdmin: String(principal?.kind ?? "").toLowerCase() === "admin"
  };
};

export type SupportAgent = {
  id: string;
  name: string;
  category: string;
  online: boolean;
  lastSeenAt?: string;
};

export async function getSupportAgents(): Promise<{
  categories: Record<string, SupportAgent[]>;
  at?: string;
  windowSec?: number;
} | null> {
  const response = await fetchJson<any>("/support/agents");
  if (!response) return null;
  return response;
}

// ─── Traccar historical reports ───────────────────────────────────────────────

export interface TraccarRoutePoint {
  id: number;
  deviceId: number;
  protocol: string;
  deviceTime: string;
  fixTime: string;
  serverTime: string;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;       // knots from Traccar
  course: number;
  address: string | null;
  accuracy: number;
  network: Record<string, unknown>;
  geofenceIds: number[];
  attributes: Record<string, unknown>;
}

export interface TraccarTrip {
  deviceId: number;
  deviceName: string;
  maxSpeed: number;
  averageSpeed: number;
  distance: number;
  spentFuel?: number;
  duration: number;
  startTime: string;
  startAddress: string | null;
  startLat: number;
  startLon: number;
  endTime: string;
  endAddress: string | null;
  endLat: number;
  endLon: number;
  driverUniqueId: string | null;
  driverName: string | null;
}

export interface TraccarEvent {
  id: number;
  type: string;
  eventTime: string;
  serverTime?: string;
  deviceId: number;
  positionId: number;
  geofenceId: number;
  maintenanceId: number;
  attributes: Record<string, unknown>;
}

export interface TraccarGeofenceVisit {
  deviceId: number;
  deviceName: string;
  geofenceId: number;
  startTime: string;
  endTime: string;
}

export interface TraccarStop {
  deviceId: number;
  deviceName: string;
  duration: number;
  startTime: string;
  startAddress: string | null;
  startLat: number;
  startLon: number;
  endTime: string;
  endAddress: string | null;
  endLat: number;
  endLon: number;
  engineHours?: number;
  spentFuel?: number;
  distance?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  positionId?: number;
}

export interface TraccarSummary {
  deviceId: number;
  deviceName: string;
  maxSpeed: number;
  averageSpeed: number;
  distance: number;
  spentFuel: number;
  engineHours: number;
  /** GPS IoT DailySummary / movement summary trip count (Summary Movement "Value"). */
  tripCount?: number;
  registration?: string;
  driverName?: string;
  source?: string;
}

export interface TraccarNotification {
  id?: number | string;
  type?: string;
  name?: string;
  event?: string;
  severity?: string;
  timestamp?: string;
  time?: string;
  eventTime?: string;
  occurredAt?: string;
  deviceId?: number;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TraccarNotificationWritePayload {
  type: string;
  description?: string | null;
  always?: boolean;
  commandId?: number;
  notificators?: string;
  calendarId?: number;
  attributes?: Record<string, unknown>;
}

export interface TraccarDevice {
  id: number;
  name?: string;
  uniqueId?: string;
  identifier?: string;
  [key: string]: unknown;
}

/**
 * Fetch Traccar devices. Optionally filter by unique device id (IMEI).
 * Calls Traccar GET /devices via the proxy.
 */
export async function updateTraccarDevice(
  id: number | string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status?: number; body?: TraccarDevice; error?: string }> {
  const targetId = String(id ?? "").trim();
  if (!targetId) return { ok: false, status: 400, error: "id is required" };

  const result = await traccarProxyRequest<TraccarDevice>(`/devices/${targetId}`, {
    method: "PUT",
    body: JSON.stringify({ ...payload, id: Number(targetId) || targetId })
  });

  return {
    ok: result.ok,
    status: result.status,
    body: (result.body ?? undefined) as TraccarDevice | undefined,
    error: result.error
  };
}

export type GpsIotLiveDevice = {
  id: string;
  name: string;
  imei: string;
  latitude: number;
  longitude: number;
  /** km/h */
  speed: number;
  roadSpeed?: number;
  course: number;
  address: string;
  deviceTime: string;
  ignition?: boolean;
  eventName?: string;
  batteryLevel?: number;
  altitude?: number;
  odometerM?: number;
  workingHours?: number;
  satellites?: number;
  powerVoltage?: number;
  sensorData?: Record<string, number>;
  attributes?: Record<string, unknown>;
};

const gpsIotDeviceId = (imei: string) => {
  let hash = 0;
  const value = String(imei ?? "");
  for (let index = 0; index < value.length; index += 1) hash = (hash * 33 + value.charCodeAt(index)) % 900000000;
  return hash + 1000;
};

let gpsIotLiveCache: { at: number; devices: GpsIotLiveDevice[] } | null = null;
let gpsIotLiveInflight: Promise<GpsIotLiveDevice[]> | null = null;
const GPS_IOT_LIVE_CACHE_MS = 15_000;

export async function loadGpsIotLiveDevices(): Promise<GpsIotLiveDevice[]> {
  if (gpsIotLiveCache && Date.now() - gpsIotLiveCache.at < GPS_IOT_LIVE_CACHE_MS) {
    return gpsIotLiveCache.devices;
  }
  if (gpsIotLiveInflight) return gpsIotLiveInflight;
  gpsIotLiveInflight = (async () => {
    try {
      const result = await fetchJson<{ devices?: GpsIotLiveDevice[] }>("/gpsiot/live");
      const devices = Array.isArray(result?.devices) ? result.devices : [];
      if (devices.length) gpsIotLiveCache = { at: Date.now(), devices };
      return devices;
    } finally {
      gpsIotLiveInflight = null;
    }
  })();
  return gpsIotLiveInflight;
}

/** Provision GPS IoT Data Forwarding so Live Tracking receives Common JSON pushes. */
export async function ensureGpsIotLiveForwarding(params?: {
  clientId?: string;
  site?: string;
  ingestUrl?: string;
  token?: string;
  providerName?: string;
}): Promise<{ ok: boolean; providerId?: number; message?: string; error?: string }> {
  const ctx = resolveGpsIotClientContext();
  const origin = typeof window !== "undefined" ? String(window.location?.origin ?? "").replace(/\/+$/, "") : "";
  const tenantId = getTenantId();
  const ingestBase = String(params?.ingestUrl ?? `${origin}/ingest/gpsiot`).trim();
  const ingestUrl = tenantId && !/[?&]tenant=/.test(ingestBase)
    ? `${ingestBase}${ingestBase.includes("?") ? "&" : "?"}tenant=${encodeURIComponent(tenantId)}`
    : ingestBase;
  try {
    const result = await fetchJson<{
      ok?: boolean;
      providerId?: number;
      message?: string;
      error?: string;
    }>("/gpsiot/forwarding/ensure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: params?.clientId || ctx.clientId || undefined,
        site: params?.site || ctx.site || undefined,
        ingestUrl,
        token: params?.token || undefined,
        providerName: params?.providerName || undefined
      })
    });
    if (result?.error && !result.providerId) return { ok: false, error: result.error };
    return {
      ok: Boolean(result?.ok ?? result?.providerId),
      providerId: result?.providerId,
      message: result?.message,
      error: result?.error
    };
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error ?? "GPS IoT forwarding ensure failed") };
  }
}

const gpsIotLiveToDevice = (device: GpsIotLiveDevice): TraccarDevice => ({
  id: gpsIotDeviceId(device.imei),
  name: device.name,
  uniqueId: device.imei,
  status: "online",
  lastUpdate: device.deviceTime,
  latitude: device.latitude,
  longitude: device.longitude,
  position: {
    latitude: device.latitude,
    longitude: device.longitude,
    speed: device.speed,
    course: device.course,
    address: device.address,
    deviceTime: device.deviceTime
  }
});

const gpsIotLiveToPoint = (device: GpsIotLiveDevice): TraccarRoutePoint => ({
  id: gpsIotDeviceId(device.imei),
  deviceId: gpsIotDeviceId(device.imei),
  protocol: "gpsiot",
  deviceTime: device.deviceTime,
  fixTime: device.deviceTime,
  serverTime: device.deviceTime,
  valid: true,
  latitude: device.latitude,
  longitude: device.longitude,
  altitude: 0,
  speed: device.speed / 1.852,
  course: device.course,
  address: device.address || null,
  accuracy: 0,
  network: {},
  geofenceIds: [],
  attributes: {
    source: "gpsiot",
    ...(device.attributes && typeof device.attributes === "object" ? device.attributes : {}),
    ...(device.sensorData && typeof device.sensorData === "object" ? device.sensorData : {})
  }
});

export type GpsIotFuelInfoDto = {
  sensors: Array<{
    sensor: string;
    refills: Array<{ date: string; filled: number; latitude: number; longitude: number; location: string; initialLevel: number; finalLevel: number }>;
    drains: Array<{ date: string; drained: number; latitude: number; longitude: number; location: string; initialLevel: number; finalLevel: number }>;
    totalDistance: number;
    totalEngineHours: number;
    fuelConsumption: number;
    fuelUsed: number;
    totalDrains: number;
    totalRefills: number;
  }>;
  refills: Array<{ date: string; filled: number; latitude: number; longitude: number; location: string; initialLevel: number; finalLevel: number }>;
  drains: Array<{ date: string; drained: number; latitude: number; longitude: number; location: string; initialLevel: number; finalLevel: number }>;
  totalDistance: number;
  totalEngineHours: number;
  fuelConsumption: number;
  fuelUsed: number;
  totalDrains: number;
  totalRefills: number;
};

export async function getGpsIotFuelInfo(params: {
  assetId?: string;
  imei?: string;
  imeiArray?: string[];
  startDate: string;
  endDate: string;
  timeZoneId?: string;
}): Promise<GpsIotFuelInfoDto> {
  const result = await fetchJson<Partial<GpsIotFuelInfoDto> & { ok?: boolean; error?: string; source?: string }>(
    "/gpsiot/fuel",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetId: params.assetId,
        imei: params.imei,
        imeiArray: params.imeiArray
          ?? (params.imei ? [params.imei] : undefined),
        startDate: params.startDate,
        endDate: params.endDate,
        timeZoneId: params.timeZoneId
      })
    }
  );
  return {
    sensors: Array.isArray(result?.sensors) ? result.sensors : [],
    refills: Array.isArray(result?.refills) ? result.refills : [],
    drains: Array.isArray(result?.drains) ? result.drains : [],
    totalDistance: Number(result?.totalDistance) || 0,
    totalEngineHours: Number(result?.totalEngineHours) || 0,
    fuelConsumption: Number(result?.fuelConsumption) || 0,
    fuelUsed: Number(result?.fuelUsed) || 0,
    totalDrains: Number(result?.totalDrains) || 0,
    totalRefills: Number(result?.totalRefills) || 0
  };
}

export async function getGpsIotFuelRefills(params: {
  assetId?: string;
  imei?: string;
  startDate: string;
  endDate: string;
  timeZoneId?: string;
}): Promise<Array<{ date: string; filled: number; latitude: number; longitude: number; location: string; initialLevel: number; finalLevel: number }>> {
  const info = await getGpsIotFuelInfo(params);
  return info.refills;
}

export async function getGpsIotFuelTelemetry(params: {
  startDate: string;
  endDate: string;
  imeiArray: string[];
}): Promise<Array<{
  imei: string;
  events: Array<{ location: string; eventName: string; date: string; isDrain: boolean }>;
  sensorReadings: Array<{ startDate: string; endDate: string; initial: number; final: number; sensorName: string }>;
}>> {
  const result = await fetchJson<{
    data?: Array<{
      imei: string;
      events: Array<{ location: string; eventName: string; date: string; isDrain: boolean }>;
      sensorReadings: Array<{ startDate: string; endDate: string; initial: number; final: number; sensorName: string }>;
    }>;
    telemetry?: Array<{
      imei: string;
      events: Array<{ location: string; eventName: string; date: string; isDrain: boolean }>;
      sensorReadings: Array<{ startDate: string; endDate: string; initial: number; final: number; sensorName: string }>;
    }>;
  }>("/gpsiot/fuel/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      startDate: params.startDate,
      endDate: params.endDate,
      imeiArray: params.imeiArray
    })
  });
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.telemetry)) return result.telemetry;
  return [];
}

export async function getGpsIotCurrentFuelReading(params: {
  assetId: string;
}): Promise<{ fuelLevel: number | null; readings: Array<{ sensor: string; fuelLevel: number }> }> {
  const result = await fetchJson<{
    fuelLevel?: number | null;
    readings?: Array<{ sensor: string; fuelLevel: number }>;
  }>("/gpsiot/fuel/current", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params)
  });
  return {
    fuelLevel: typeof result?.fuelLevel === "number" && Number.isFinite(result.fuelLevel) ? result.fuelLevel : null,
    readings: Array.isArray(result?.readings) ? result.readings : []
  };
}

export type GpsIotCanBusStatus = {
  assetId: string;
  fields: Record<string, string>;
  parsed: Array<{ key: string; raw: string; value: number | null; unit: string }>;
  attributes: Record<string, unknown>;
};

/** POST /api/Status/v2/GetCanBus — only meaningful when CAN library protocol is bound on C1/C2. */
export async function getGpsIotCanBus(params: { assetId: string }): Promise<GpsIotCanBusStatus> {
  const result = await fetchJson<Partial<GpsIotCanBusStatus> & { ok?: boolean; error?: string }>("/gpsiot/canbus", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params)
  });
  return {
    assetId: String(result?.assetId ?? params.assetId ?? "").trim(),
    fields: result?.fields && typeof result.fields === "object" ? result.fields : {},
    parsed: Array.isArray(result?.parsed) ? result.parsed : [],
    attributes: result?.attributes && typeof result.attributes === "object" ? result.attributes : {}
  };
}

export type GpsIotAssetInputDto = {
  name: string;
  status: string;
  value: string | number | boolean | null;
  kind: "digital" | "analogue" | "unknown";
};

export type GpsIotAssetInputStatusDto = {
  assetId: string;
  assetName: string;
  imei: string;
  registration: string;
  inputs: GpsIotAssetInputDto[];
  attributes: Record<string, unknown>;
};

/** GET api/InputStatus/GetClientAssetsStatus — digital/analogue inputs for Diagnostics. */
export async function getGpsIotAssetInputStatus(params: {
  assetId?: string;
  imei?: string;
  assetName?: string;
  registration?: string;
  clientId?: string;
  site?: string;
}): Promise<{
  asset: GpsIotAssetInputStatusDto | null;
  inputs: GpsIotAssetInputDto[];
  attributes: Record<string, unknown>;
  assets: GpsIotAssetInputStatusDto[];
}> {
  const ctx = resolveGpsIotClientContext();
  const result = await fetchJson<{
    ok?: boolean;
    asset?: GpsIotAssetInputStatusDto | null;
    inputs?: GpsIotAssetInputDto[];
    attributes?: Record<string, unknown>;
    assets?: GpsIotAssetInputStatusDto[];
    error?: string;
  }>("/gpsiot/input-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      assetId: params.assetId,
      imei: params.imei,
      assetName: params.assetName,
      registration: params.registration,
      clientId: params.clientId || ctx.clientId || undefined,
      site: params.site || ctx.site || undefined
    })
  });
  return {
    asset: result?.asset ?? null,
    inputs: Array.isArray(result?.inputs) ? result.inputs : (result?.asset?.inputs ?? []),
    attributes: result?.attributes && typeof result.attributes === "object"
      ? result.attributes
      : (result?.asset?.attributes ?? {}),
    assets: Array.isArray(result?.assets) ? result.assets : []
  };
}

export type GpsIotEventCatalogItem = { id: string; eventName: string };

let gpsIotEventCatalogCache: { at: number; items: GpsIotEventCatalogItem[] } | null = null;
let gpsIotEventCatalogInflight: Promise<GpsIotEventCatalogItem[]> | null = null;

export async function listGpsIotEvents(): Promise<GpsIotEventCatalogItem[]> {
  if (gpsIotEventCatalogCache && Date.now() - gpsIotEventCatalogCache.at < 60_000) {
    return gpsIotEventCatalogCache.items;
  }
  if (gpsIotEventCatalogInflight) return gpsIotEventCatalogInflight;
  gpsIotEventCatalogInflight = (async () => {
    try {
      const result = await fetchJson<{ events?: GpsIotEventCatalogItem[] }>("/gpsiot/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const items = Array.isArray(result?.events) ? result.events : [];
      if (items.length) gpsIotEventCatalogCache = { at: Date.now(), items };
      return items;
    } finally {
      gpsIotEventCatalogInflight = null;
    }
  })();
  return gpsIotEventCatalogInflight;
}

export async function getGpsIotEventTelemetry(params: {
  assetId: string;
  startTime: string;
  endTime: string;
  events?: string[];
  eventNames?: string[];
  timeZone?: string;
}): Promise<Array<{
  eventName: string;
  location: string;
  latitude: number;
  longitude: number;
  odometer: number;
  battery: number;
  speed: number;
  roadSpeed: number;
  date: string;
  attributes?: Record<string, unknown>;
  rawAttributes?: string;
}>> {
  const result = await fetchJson<{ events?: any[]; telemetry?: any[] }>("/gpsiot/events/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params)
  });
  if (Array.isArray(result?.events)) return result.events;
  if (Array.isArray(result?.telemetry)) return result.telemetry;
  return [];
}

export async function listGpsIotClientAlerts(params?: {
  clientId?: string;
  site?: string;
}): Promise<Array<{ id: string; alertName: string; priority: string; createdBy: string; active: boolean }>> {
  const ctx = resolveGpsIotClientContext();
  const result = await fetchJson<{ alerts?: Array<{ id: string; alertName: string; priority: string; createdBy: string; active: boolean }> }>(
    "/gpsiot/alerts",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: params?.clientId || ctx.clientId || undefined,
        site: params?.site || ctx.site || undefined
      })
    }
  );
  return Array.isArray(result?.alerts) ? result.alerts : [];
}

const gpsIotNotificationAlertCache = new Map<string, { at: number; promise: Promise<Array<Record<string, unknown>>> }>();

export async function getGpsIotNotificationAlerts(params: {
  startDate: string;
  endDate: string;
  clientId?: string;
  site?: string;
  timeZoneId?: string;
  alertIds?: string[];
}): Promise<Array<Record<string, unknown>>> {
  const ctx = resolveGpsIotClientContext();
  const cacheKey = [
    params.startDate,
    params.endDate,
    params.clientId || ctx.clientId || "",
    params.site || ctx.site || "",
    params.timeZoneId || "UTC"
  ].join("|");
  const cached = gpsIotNotificationAlertCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 20_000) return cached.promise;
  const promise = (async () => {
    const result = await fetchJson<{ alerts?: Array<Record<string, unknown>>; notifications?: Array<Record<string, unknown>> }>(
      "/gpsiot/alerts/notifications",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: params.clientId || ctx.clientId || undefined,
          site: params.site || ctx.site || undefined,
          startDate: params.startDate,
          endDate: params.endDate,
          timeZoneId: params.timeZoneId || "UTC",
          alertIds: params.alertIds
        })
      }
    );
    if (Array.isArray(result?.alerts)) return result.alerts;
    if (Array.isArray(result?.notifications)) return result.notifications;
    return [] as Array<Record<string, unknown>>;
  })().catch((error) => {
    gpsIotNotificationAlertCache.delete(cacheKey);
    throw error;
  });
  gpsIotNotificationAlertCache.set(cacheKey, { at: Date.now(), promise });
  return promise;
}

export type GpsIotGeofenceDto = {
  geoId: string;
  name: string;
  description?: string;
  contact?: string;
  contactTel?: string;
  area: string;
  numericId: number;
  shape: {
    type: "circle" | "polygon";
    center?: { lat: number; lng: number };
    radius?: number;
    points?: Array<{ lat: number; lng: number }>;
  };
};

export async function listGpsIotGeofences(params?: {
  clientId?: string;
  databaseName?: string;
  site?: string;
}): Promise<GpsIotGeofenceDto[]> {
  const ctx = resolveGpsIotClientContext();
  const clientId = String(params?.clientId || ctx.clientId || "").trim();
  const site = String(params?.site || ctx.site || "").trim();
  // Geofences are per GPS IoT ClientID (= Vivitel site). Never list without a site client.
  if (!clientId && !site) return [];
  const result = await fetchJson<{ geofences?: GpsIotGeofenceDto[]; error?: string }>("/gpsiot/geofences/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: clientId || undefined,
      site: site || undefined
      // Intentionally omit databaseName — database clients must not share geofences across sites.
    })
  });
  return Array.isArray(result?.geofences) ? result.geofences : [];
}

export async function saveGpsIotGeofence(payload: {
  name: string;
  geoId?: string;
  shape: GpsIotGeofenceDto["shape"];
  description?: string;
  contact?: string;
  contactTel?: string;
  locationType?: string;
  clientId?: string;
  databaseName?: string;
  site?: string;
}): Promise<{
  ok: boolean;
  geoId?: string;
  numericId?: number;
  area?: string;
  shape?: GpsIotGeofenceDto["shape"];
  replaced?: boolean;
  deletedPriorId?: string;
  error?: string;
}> {
  const ctx = resolveGpsIotClientContext();
  const clientId = String(payload.clientId || ctx.clientId || "").trim();
  const site = String(payload.site || ctx.site || "").trim();
  if (!clientId && !site) {
    return { ok: false, error: "Select a site with a GPS IoT ClientID before saving a location." };
  }
  try {
    const result = await fetchJson<{
      ok?: boolean;
      geoId?: string;
      numericId?: number;
      area?: string;
      shape?: GpsIotGeofenceDto["shape"];
      replaced?: boolean;
      deletedPriorId?: string;
      error?: string;
    }>("/gpsiot/geofences/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        clientId: clientId || undefined,
        site: site || undefined
      })
    });
    if (result?.error && !result.geoId) return { ok: false, error: result.error };
    return {
      ok: Boolean(result?.geoId),
      geoId: result?.geoId,
      numericId: result?.numericId,
      area: result?.area,
      shape: result?.shape,
      replaced: result?.replaced,
      deletedPriorId: result?.deletedPriorId,
      error: result?.error
    };
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error ?? "GPS IoT geofence save failed") };
  }
}

export async function deleteGpsIotGeofence(params: {
  geoId: string;
  name?: string;
  clientId?: string;
  databaseName?: string;
  site?: string;
}): Promise<{ ok: boolean; deleted?: boolean; error?: string }> {
  const ctx = resolveGpsIotClientContext();
  try {
    const result = await fetchJson<{ ok?: boolean; deleted?: boolean; error?: string }>("/gpsiot/geofences/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        geoId: params.geoId,
        name: params.name,
        clientId: params.clientId || ctx.clientId || undefined,
        site: params.site || ctx.site || undefined
      })
    });
    if (result?.error && result.deleted === false) return { ok: false, error: result.error };
    return { ok: true, deleted: result?.deleted !== false };
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error ?? "GPS IoT geofence delete failed") };
  }
}

export type GpsIotAsset = {
  assetId: string;
  name: string;
  colour: string;
  make: string;
  model: string;
  trackerType: string;
  status: boolean;
  customId: string;
};

/** AssetTypeId: 1 Driver, 2 General, 3 Vehicle, 4 Static, 6 E.V. Battery */
export async function createGpsIotAsset(params: {
  clientId: string;
  name: string;
  make?: string;
  color?: string;
  model?: string;
  assetTypeId: number;
  customId?: string;
}): Promise<{ message: string }> {
  const result = await fetchJson<{ message?: string }>("/gpsiot/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params)
  });
  return { message: String(result?.message ?? "Asset Created Successfully!") };
}

export async function getGpsIotAssetByCustomId(customId: string): Promise<GpsIotAsset[]> {
  const result = await fetchJson<{ assets?: GpsIotAsset[] }>("/gpsiot/assets/by-custom-id", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customId })
  });
  return Array.isArray(result?.assets) ? result.assets : [];
}

export async function getGpsIotAssetByName(name: string): Promise<GpsIotAsset[]> {
  const result = await fetchJson<{ assets?: GpsIotAsset[] }>("/gpsiot/assets/by-name", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name })
  });
  return Array.isArray(result?.assets) ? result.assets : [];
}

export async function listGpsIotAssets(params: {
  clientId?: string;
  databaseName?: string;
  site?: string;
}): Promise<unknown[]> {
  const result = await fetchJson<{ assets?: unknown[] }>("/gpsiot/assets/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params)
  });
  return Array.isArray(result?.assets) ? result.assets : [];
}

export function resolveGpsIotClientContext(): { clientId: string; databaseName: string; site: string } {
  const site = readActiveSiteName();
  let clientId = "";
  let databaseName = "";
  if (typeof window !== "undefined") {
    try {
      const hierarchy = JSON.parse(window.localStorage.getItem("vivi.org.hierarchy") ?? "null");
      const siteId = String(window.localStorage.getItem("vivi.activeSiteId") ?? "").trim();
      const dbId = String(window.localStorage.getItem("vivi.activeDbId") ?? "").trim();
      // Prefer exact site-id match inside the active database so ClientIDs never leak across sites.
      const tryMatch = (requireDb: boolean, requireSiteId: boolean) => {
        for (const dealer of hierarchy?.dealers ?? []) {
          for (const org of dealer?.organisations ?? []) {
            for (const database of org?.databases ?? []) {
              const thisDbId = String(database?.id ?? "").trim();
              if (requireDb && dbId && thisDbId !== dbId) continue;
              if (!requireDb && dbId && thisDbId === dbId) {
                databaseName = String(database?.name ?? "").trim() || databaseName;
              }
              for (const row of database?.sites ?? []) {
                const rowId = String(row?.id ?? "").trim();
                const rowName = String(row?.name ?? "").trim();
                const idHit = Boolean(siteId && rowId === siteId);
                const nameHit = Boolean(site && rowName === site);
                if (requireSiteId ? idHit : (idHit || nameHit)) {
                  clientId = String(row?.gpsIotClientId ?? "").trim();
                  databaseName = String(database?.name ?? "").trim() || databaseName;
                  return Boolean(clientId);
                }
              }
            }
          }
        }
        return false;
      };
      if (dbId) {
        databaseName = "";
        for (const dealer of hierarchy?.dealers ?? []) {
          for (const org of dealer?.organisations ?? []) {
            for (const database of org?.databases ?? []) {
              if (String(database?.id ?? "").trim() === dbId) {
                databaseName = String(database?.name ?? "").trim();
              }
            }
          }
        }
      }
      if (!(siteId && tryMatch(true, true)) && !(siteId && tryMatch(false, true))) {
        tryMatch(Boolean(dbId), false);
      }
    } catch {
      // ignore
    }
  }
  return { clientId, databaseName, site };
}

/** Create when no AssetId; UpdateAsset + UpdateAssetWithExtraDetails when AssetId is present. */
export async function saveGpsIotAssetDetails(payload: Record<string, unknown>): Promise<{
  stored: boolean;
  status?: number;
  error?: string;
  body?: any;
}> {
  const ctx = resolveGpsIotClientContext();
  const result = await fetchJsonForTenant<{
    ok?: boolean;
    stored?: boolean;
    created?: boolean;
    updated?: boolean;
    assetId?: string;
    message?: string;
    error?: string;
  }>(
    "/gpsiot/assets/save",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        ...(ctx.clientId ? { clientId: ctx.clientId } : {}),
        ...(ctx.databaseName ? { databaseName: ctx.databaseName } : {}),
        ...(ctx.site ? { site: ctx.site } : {})
      })
    },
    getTenantId()
  );
  if (!result.ok) {
    return {
      stored: false,
      status: result.status,
      error: String((result.body as any)?.error ?? result.text ?? "GPS IoT asset save failed"),
      body: result.body
    };
  }
  return { stored: true, status: result.status, body: result.body };
}

/** CreateDriver when no DriverID; UpdateDriver when DriverID is present. */
export async function saveGpsIotDriverDetails(payload: Record<string, unknown>): Promise<{
  stored: boolean;
  status?: number;
  error?: string;
  body?: any;
}> {
  const ctx = resolveGpsIotClientContext();
  const result = await fetchJsonForTenant<{
    ok?: boolean;
    stored?: boolean;
    created?: boolean;
    updated?: boolean;
    driverId?: string;
    driver?: Record<string, unknown>;
    error?: string;
  }>(
    "/gpsiot/drivers/save",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        ...(ctx.clientId ? { clientId: ctx.clientId } : {}),
        ...(ctx.databaseName ? { databaseName: ctx.databaseName } : {}),
        ...(ctx.site ? { site: String(payload.site ?? ctx.site) } : {})
      })
    },
    getTenantId()
  );
  if (!result.ok) {
    return {
      stored: false,
      status: result.status,
      error: String((result.body as any)?.error ?? result.text ?? "GPS IoT driver save failed"),
      body: result.body
    };
  }
  return { stored: true, status: result.status, body: result.body };
}

export async function getTraccarDevices(params?: {
  uniqueId?: string;
  keyword?: string;
  all?: boolean;
}): Promise<TraccarDevice[]> {
  if (isGpsIotServer()) {
    const uniqueId = String(params?.uniqueId ?? "").trim();
    const keyword = String(params?.keyword ?? "").trim().toLowerCase();
    const devices = (await loadGpsIotLiveDevices())
      .filter((device) => !uniqueId || device.imei === uniqueId)
      .filter((device) => !keyword || device.name.toLowerCase().includes(keyword) || device.imei.includes(keyword));
    return devices.map(gpsIotLiveToDevice);
  }
  const search = new URLSearchParams();
  const uniqueId = String(params?.uniqueId ?? "").trim();
  const keyword = String(params?.keyword ?? "").trim();
  if (uniqueId) search.set("uniqueId", uniqueId);
  if (keyword) search.set("keyword", keyword);
  if (params?.all) search.set("all", "true");
  const query = search.toString() ? `?${search.toString()}` : "";

  const result = await traccarProxyRequest<TraccarDevice[] | { devices?: TraccarDevice[]; data?: TraccarDevice[] }>(
    `/devices${query}`,
    { method: "GET" }
  );
  if (!result.ok || result.body == null) return [];

  const body = result.body;
  if (Array.isArray(body)) return body;
  if (Array.isArray((body as any)?.devices)) return (body as any).devices;
  if (Array.isArray((body as any)?.data)) return (body as any).data;
  return [];
}

/** Device lookup that distinguishes network failure from a missing IMEI (for compile). */
export async function getTraccarDevicesDetailed(params?: {
  uniqueId?: string;
  keyword?: string;
}): Promise<{ devices: TraccarDevice[]; unreachable?: boolean; error?: string }> {
  const search = new URLSearchParams();
  const uniqueId = String(params?.uniqueId ?? "").trim();
  const keyword = String(params?.keyword ?? "").trim();
  if (uniqueId) search.set("uniqueId", uniqueId);
  if (keyword) search.set("keyword", keyword);
  const query = search.toString() ? `?${search.toString()}` : "";

  const result = await traccarProxyRequest<
    TraccarDevice[] | { devices?: TraccarDevice[]; data?: TraccarDevice[]; softFailed?: boolean; error?: string }
  >(
    `/devices${query}`,
    { method: "GET" }
  );
  const body = result.body;
  const devices = Array.isArray(body)
    ? body
    : Array.isArray((body as any)?.devices)
      ? (body as any).devices
      : Array.isArray((body as any)?.data)
        ? (body as any).data
        : [];
  const bodySoftFailed = Boolean((body as any)?.softFailed) || Boolean((body as any)?.upstreamStatus);
  const unreachable =
    !result.ok
    || result.body == null
    || Boolean(result.softFailed)
    || bodySoftFailed
    || isTransientNetworkError(result.error, result.status);
  if (unreachable && devices.length === 0) {
    return {
      devices: [],
      unreachable: true,
      error:
        result.error
        || String((body as any)?.error ?? "")
        || "VIVI unreachable (retry)."
    };
  }
  if (!result.ok || result.body == null) {
    return {
      devices: [],
      unreachable,
      error: result.error || (unreachable ? "VIVI unreachable (retry)." : undefined)
    };
  }

  return { devices };
}

export type TraccarLivePosition = {
  lat?: number;
  lng?: number;
  speed?: number;
  /** Traccar `course` (degrees); mirrored as heading for UI. */
  heading?: number;
  course?: number;
  altitude?: number;
  accuracy?: number;
  address?: string | null;
  valid?: boolean;
  protocol?: string;
  serverTime?: string;
  fixTime?: string;
  deviceTime?: string;
  geofenceIds?: number[];
  attributes?: Record<string, unknown>;
};

export type TraccarLiveFuelConfig = {
  enabled?: boolean;
  analogInput?: string;
  tankCapacity?: string;
  scale?: string;
  analogMvMin?: string;
  analogMvMax?: string;
  outputAttribute?: string;
  calibrationPoints?: unknown;
};

export type TraccarLiveRow = {
  deviceId?: number;
  imei?: string;
  name?: string;
  status?: string;
  lastUpdate?: string;
  fuelConfig?: TraccarLiveFuelConfig | null;
  position?: TraccarLivePosition | null;
};

/** Live Traccar devices with latest positions (includes fuel attributes). */
export async function getTraccarLive(): Promise<TraccarLiveRow[]> {
  const liveCacheKey = getTenantId() || "_";
  const cachedSnapshot = liveSnapshotCache.get(liveCacheKey) ?? { entry: null, inflight: null };
  liveSnapshotCache.set(liveCacheKey, cachedSnapshot);
  const now = Date.now();
  if (cachedSnapshot.entry && now - cachedSnapshot.entry.atMs < LIVE_SNAPSHOT_TTL_MS) {
    return cachedSnapshot.entry.value;
  }
  if (cachedSnapshot.inflight) return cachedSnapshot.inflight;

  const request = (async () => {
    try {
      const result = await withTraccarProxySlot(async () =>
        fetchJson<{ ok?: boolean; live?: TraccarLiveRow[]; degraded?: boolean }>("/api/traccar/live")
      );
      const live = Array.isArray(result?.live) ? result.live : [];
      cachedSnapshot.entry = { atMs: Date.now(), value: live };
      return live;
    } catch {
      return cachedSnapshot.entry?.value ?? [];
    } finally {
      cachedSnapshot.inflight = null;
    }
  })();
  cachedSnapshot.inflight = request;
  return request;
}

const normalizeTraccarRoutePoints = (
  result: TraccarRoutePoint[] | { positions?: TraccarRoutePoint[]; data?: TraccarRoutePoint[] } | null
): TraccarRoutePoint[] => {
  if (Array.isArray(result)) return result;
  if (Array.isArray((result as any)?.positions)) return (result as any).positions;
  if (Array.isArray((result as any)?.data)) return (result as any).data;
  return [];
};

const TRACCAR_POSITIONS_ID_BATCH = 25;

/** Fetch one or more Traccar positions by id (GET /positions?id=…). */
export async function getTraccarPositionsByIds(positionIds: number[]): Promise<TraccarRoutePoint[]> {
  const ids = [...new Set(
    positionIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  )];
  if (!ids.length) return [];

  const batches: number[][] = [];
  for (let index = 0; index < ids.length; index += TRACCAR_POSITIONS_ID_BATCH) {
    batches.push(ids.slice(index, index + TRACCAR_POSITIONS_ID_BATCH));
  }

  const points: TraccarRoutePoint[] = [];
  for (const batch of batches) {
    const query = new URLSearchParams();
    batch.forEach((id) => query.append("id", String(id)));
    try {
      const result = await traccarProxyRequest<
        TraccarRoutePoint[] | { positions?: TraccarRoutePoint[]; data?: TraccarRoutePoint[] }
      >(`/positions?${query.toString()}`, { method: "GET" });
      if (result.status === 431) continue;
      points.push(...normalizeTraccarRoutePoints(result.ok ? result.body : null));
    } catch {
      // Keep enriching other batches when one lookup fails.
    }
  }
  return points;
}

type TraccarProxyRequestOptions = {
  /** Skip the shared proxy concurrency queue (fuel modal must not wait behind live polls). */
  bypassSlot?: boolean;
  /** Per-attempt fetch abort timeout. Default 20s. */
  timeoutMs?: number;
  /** Override GET/write retry count. */
  maxAttempts?: number;
  /** When true, do not join/reuse an in-flight GET for this path. */
  skipInflightDedupe?: boolean;
};

/**
 * Fetch breadcrumb positions for a device over a time range.
 * Calls Traccar GET /reports/route via the proxy.
 * params.deviceId — Traccar device id
 * params.from / params.to — ISO 8601 strings
 */
export async function getTraccarRoute(params: {
  deviceId: number | string;
  from: string;
  to: string;
  /** When false, skip /positions fallback so parallel trip/event fetches keep proxy slots. Default true. */
  allowPositionsFallback?: boolean;
  /** Proxy options (e.g. bypassSlot + longer timeout for the fuel modal). */
  proxy?: TraccarProxyRequestOptions;
  /** Ask the Worker to thin and briefly cache the route (fuel graphs). */
  serverThinMax?: number;
}): Promise<TraccarRoutePoint[]> {
  const deviceId = String(params.deviceId ?? "").trim();
  if (!deviceId) return [];
  const from = String(params.from ?? "").trim();
  const to = String(params.to ?? "").trim();
  if (!from || !to) return [];
  if (isGpsIotServer()) {
    const devices = await loadGpsIotLiveDevices();
    const match = devices.find((device) => device.imei === deviceId || String(gpsIotDeviceId(device.imei)) === deviceId);
    if (!match?.imei) return [];
    try {
      const result = await fetchJson<{ positions?: TraccarRoutePoint[] }>("/gpsiot/trips/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imei: match.imei,
          deviceId: gpsIotDeviceId(match.imei),
          deviceName: match.name,
          startTime: from,
          endTime: to
        })
      });
      const positions = Array.isArray(result?.positions) ? result.positions : [];
      if (positions.length) return positions;
    } catch {
      // Fall through to a live pin so the map still has a last known point.
    }
    return [gpsIotLiveToPoint(match)];
  }

  const query = new URLSearchParams({ deviceId, from, to });
  const proxyOpts = params.proxy;
  const routeQuery = new URLSearchParams(query);
  if (params.serverThinMax) routeQuery.set("viviThin", String(params.serverThinMax));
  const result = await traccarProxyRequest<TraccarRoutePoint[] | { positions?: TraccarRoutePoint[]; data?: TraccarRoutePoint[] }>(
    `/reports/route?${routeQuery.toString()}`,
    { method: "GET" },
    proxyOpts
  );

  let points = normalizeTraccarRoutePoints(result.ok ? result.body : null);
  if (points.length > 0) return points;
  if (params.allowPositionsFallback === false) return [];

  // Fallback when reports/route soft-fails or times out: positions history is usually lighter.
  const fallback = await traccarProxyRequest<TraccarRoutePoint[] | { positions?: TraccarRoutePoint[]; data?: TraccarRoutePoint[] }>(
    `/positions?${query.toString()}`,
    { method: "GET" },
    proxyOpts
  );
  points = normalizeTraccarRoutePoints(fallback.ok ? fallback.body : null);
  return points;
}

/** Thin route history while keeping local fuel min/max so longer windows do not erase consumption. */
const thinFuelRouteChunk = (points: TraccarRoutePoint[], maxPoints: number): TraccarRoutePoint[] => {
  if (points.length <= maxPoints) return points;
  const fuelOf = (point: TraccarRoutePoint): number => {
    const attrs = (point.attributes ?? {}) as Record<string, unknown>;
    for (const key of ["fuel", "fuelLevel", "io6", "io87", "io89"]) {
      const value = Number(attrs[key]);
      if (Number.isFinite(value)) return value;
    }
    return Number.NaN;
  };
  const bucketCount = Math.max(2, Math.floor(maxPoints / 2));
  const bucketSize = Math.ceil(points.length / bucketCount);
  const kept = new Map<number, TraccarRoutePoint>();
  kept.set(0, points[0]);
  kept.set(points.length - 1, points[points.length - 1]);
  for (let start = 0; start < points.length; start += bucketSize) {
    const end = Math.min(points.length, start + bucketSize);
    let minIdx = start;
    let maxIdx = start;
    let minFuel = Number.POSITIVE_INFINITY;
    let maxFuel = Number.NEGATIVE_INFINITY;
    for (let index = start; index < end; index += 1) {
      const fuel = fuelOf(points[index]);
      if (!Number.isFinite(fuel)) continue;
      if (fuel < minFuel) {
        minFuel = fuel;
        minIdx = index;
      }
      if (fuel > maxFuel) {
        maxFuel = fuel;
        maxIdx = index;
      }
    }
    kept.set(minIdx, points[minIdx]);
    kept.set(maxIdx, points[maxIdx]);
  }
  return [...kept.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((entry) => entry[1]);
};

/**
 * Fuel graph history — matches deployed Live Tracking: one getTraccarRoute (/reports/route)
 * for the full window, bypassing the live-poll proxy queue and allowing a longer timeout
 * so localhost → Vite → edge stays under the modal watchdog.
 */
export async function getTraccarFuelRoute(params: {
  deviceId: number | string;
  from: string;
  to: string;
}): Promise<TraccarRoutePoint[]> {
  const points = await getTraccarRoute({
    ...params,
    serverThinMax: 4_000,
    proxy: {
      bypassSlot: true,
      timeoutMs: 60_000,
      maxAttempts: 2,
      skipInflightDedupe: true
    }
  });
  return thinFuelRouteChunk(points, 2_400);
}

/**
 * Fetch trip summaries for a device over a time range.
 * Calls Traccar GET /reports/trips via the proxy.
 */
async function mapWithLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index]);
      }
    })
  );
  return results;
}

function collectTripDeviceIds(params: { deviceId?: number | string; deviceIds?: Array<number | string> }) {
  const ids = [
    ...(params.deviceId != null && String(params.deviceId).trim() ? [String(params.deviceId).trim()] : []),
    ...(Array.isArray(params.deviceIds) ? params.deviceIds.map((id) => String(id ?? "").trim()).filter(Boolean) : [])
  ];
  return Array.from(new Set(ids));
}

/** One /gpsiot/trips call per device. Segments already include parked rows, so stops do not need a second fetch. */
async function loadGpsIotTripWindows(uniqueIds: string[], from: string, to: string): Promise<Array<{ trips: TraccarTrip[]; stops: TraccarStop[] }>> {
  const devices = await loadGpsIotLiveDevices();
  return mapWithLimit(uniqueIds, 6, async (id) => {
    const match = devices.find((device) => device.imei === id || String(gpsIotDeviceId(device.imei)) === id);
    const imei = match?.imei || (/^\d{10,20}$/.test(id) ? id : "");
    if (!imei) return { trips: [] as TraccarTrip[], stops: [] as TraccarStop[] };
    try {
      const result = await fetchJson<{ trips?: TraccarTrip[]; segments?: Array<TraccarTrip & { isStoppage?: boolean }> }>("/gpsiot/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imei,
          deviceId: match ? gpsIotDeviceId(match.imei) : id,
          deviceName: match?.name,
          startTime: from,
          endTime: to
        })
      });
      const trips = Array.isArray(result?.trips) ? result.trips : [];
      const stops = (Array.isArray(result?.segments) ? result.segments : [])
        .filter((row) => row.isStoppage)
        .map((row) => ({
          deviceId: row.deviceId,
          deviceName: row.deviceName,
          duration: Number(row.duration ?? 0),
          startTime: row.startTime,
          startAddress: row.startAddress,
          startLat: row.startLat,
          startLon: row.startLon,
          endTime: row.endTime,
          endAddress: row.endAddress,
          endLat: row.endLat,
          endLon: row.endLon
        }));
      return { trips, stops };
    } catch {
      return { trips: [] as TraccarTrip[], stops: [] as TraccarStop[] };
    }
  });
}

/** Trips and parked rows for a GPS IoT window, from a single mileage-backed request per device. */
export async function getGpsIotMovementBundle(params: {
  deviceId?: number | string;
  deviceIds?: Array<number | string>;
  from: string;
  to: string;
}): Promise<{ trips: TraccarTrip[]; stops: TraccarStop[] }> {
  const uniqueIds = collectTripDeviceIds(params);
  const from = String(params.from ?? "").trim();
  const to = String(params.to ?? "").trim();
  if (!isGpsIotServer() || uniqueIds.length === 0 || !from || !to) return { trips: [], stops: [] };
  const windows = await loadGpsIotTripWindows(uniqueIds, from, to);
  return {
    trips: windows.flatMap((window) => window.trips),
    stops: windows.flatMap((window) => window.stops)
  };
}

type TripBatchWaiter = {
  deviceId: string;
  resolve: (trips: TraccarTrip[]) => void;
};
const tripBatchQueues = new Map<string, TripBatchWaiter[]>();

/**
 * Report pages call getTraccarTrips once per asset with the same window. Coalesce
 * those calls into one multi-device /reports/trips request and split the rows back
 * by deviceId, so the proxy and Traccar see one query instead of one per asset.
 */
function getTraccarTripsCoalesced(deviceId: string, from: string, to: string): Promise<TraccarTrip[]> {
  const key = `${getTenantId() || "_"}|${from}|${to}`;
  return new Promise<TraccarTrip[]>((resolve) => {
    let queue = tripBatchQueues.get(key);
    if (!queue) {
      queue = [];
      tripBatchQueues.set(key, queue);
      globalThis.setTimeout(() => {
        const waiters = tripBatchQueues.get(key) ?? [];
        tripBatchQueues.delete(key);
        const ids = Array.from(new Set(waiters.map((waiter) => waiter.deviceId)));
        const run = async () => {
          const rows: TraccarTrip[] = [];
          for (let index = 0; index < ids.length; index += 40) {
            const query = new URLSearchParams({ from, to });
            for (const id of ids.slice(index, index + 40)) query.append("deviceId", id);
            const result = await traccarProxyRequest<TraccarTrip[] | { trips?: TraccarTrip[]; data?: TraccarTrip[] }>(
              `/reports/trips?${query.toString()}`,
              { method: "GET" }
            );
            const body: any = result.ok ? result.body : null;
            const list = Array.isArray(body) ? body : Array.isArray(body?.trips) ? body.trips : Array.isArray(body?.data) ? body.data : [];
            rows.push(...(list as TraccarTrip[]));
          }
          return rows;
        };
        run()
          .catch(() => [] as TraccarTrip[])
          .then((rows) => {
            for (const waiter of waiters) {
              waiter.resolve(rows.filter((row) => String((row as any)?.deviceId ?? "") === waiter.deviceId));
            }
          });
      }, 25);
    }
    queue.push({ deviceId, resolve });
  });
}

export async function getTraccarTrips(params: {
  deviceId?: number | string;
  deviceIds?: Array<number | string>;
  from: string;
  to: string;
}): Promise<TraccarTrip[]> {
  const uniqueIds = collectTripDeviceIds(params);
  if (uniqueIds.length === 0) return [];
  const from = String(params.from ?? "").trim();
  const to = String(params.to ?? "").trim();
  if (!from || !to) return [];

  if (isGpsIotServer()) {
    const windows = await loadGpsIotTripWindows(uniqueIds, from, to);
    return windows.flatMap((window) => window.trips);
  }

  if (uniqueIds.length === 1) return getTraccarTripsCoalesced(uniqueIds[0], from, to);

  const query = new URLSearchParams({ from, to });
  for (const id of uniqueIds) query.append("deviceId", id);
  const result = await traccarProxyRequest<TraccarTrip[] | { trips?: TraccarTrip[]; data?: TraccarTrip[] }>(
    `/reports/trips?${query.toString()}`,
    { method: "GET" }
  );
  const body = result.ok ? result.body : null;

  if (Array.isArray(body)) return body;
  if (Array.isArray((body as any)?.trips)) return (body as any).trips;
  if (Array.isArray((body as any)?.data)) return (body as any).data;
  return [];
}

/**
 * Multi-device trips report that throws when the request fails, so callers can
 * tell "no trips" apart from "the report did not load". GPS IoT keeps its own path.
 */
export async function getTraccarTripsStrict(params: {
  deviceIds: Array<number | string>;
  from: string;
  to: string;
}): Promise<TraccarTrip[]> {
  if (isGpsIotServer()) return getTraccarTrips(params);
  const uniqueIds = collectTripDeviceIds(params);
  const from = String(params.from ?? "").trim();
  const to = String(params.to ?? "").trim();
  if (uniqueIds.length === 0 || !from || !to) return [];

  const query = new URLSearchParams({ from, to });
  for (const id of uniqueIds) query.append("deviceId", id);
  const result = await traccarProxyRequest<TraccarTrip[] | { trips?: TraccarTrip[]; data?: TraccarTrip[] }>(
    `/reports/trips?${query.toString()}`,
    { method: "GET" }
  );
  if (!result.ok) throw new Error(`Trips report failed (${result.status})`);
  const body = result.body;
  if (Array.isArray(body)) return body;
  if (Array.isArray((body as any)?.trips)) return (body as any).trips;
  if (Array.isArray((body as any)?.data)) return (body as any).data;
  return [];
}

/**
 * Fetch events report for devices or groups over a time range.
 * Calls Traccar GET /reports/events via the proxy.
 * At least one of deviceId or groupId must be provided.
 */
export async function getTraccarEvents(params: {
  from: string;
  to: string;
  deviceId?: number | string;
  deviceIds?: Array<number | string>;
  groupId?: number | string;
  type?: string[];
  /** Throw when the Traccar report request fails instead of returning []. */
  strict?: boolean;
}): Promise<TraccarEvent[]> {
  const from = String(params.from ?? "").trim();
  const to = String(params.to ?? "").trim();
  const deviceIds = [
    ...(params.deviceId != null && String(params.deviceId).trim() ? [String(params.deviceId).trim()] : []),
    ...(Array.isArray(params.deviceIds) ? params.deviceIds.map((id) => String(id ?? "").trim()).filter(Boolean) : [])
  ];
  const uniqueDeviceIds = Array.from(new Set(deviceIds));
  const groupId = String(params.groupId ?? "").trim();
  if (!from || !to) return [];
  if (uniqueDeviceIds.length === 0 && !groupId) return [];

  if (isGpsIotServer()) {
    const { mapGpsIotNotificationAlertToTraccarEvent, mapGpsIotTelemetryToTraccarEvent, matchGpsIotEventToDescription } = await import("./gpsiotNotificationMap");
    const { resolveGpsIotFuelAssetId } = await import("./gpsiotFuel");
    const devices = await loadGpsIotLiveDevices();
    const assets = await getAssetsFromApi<any>().catch(() => [] as any[]);
    const catalog = await listGpsIotEvents().catch(() => []);
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = (iso: string) => {
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return iso.replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, "");
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    };
    const startDate = stamp(from);
    const endDate = stamp(to);
    const types = Array.isArray(params.type) ? params.type.map((t) => String(t ?? "").trim()).filter(Boolean) : [];

    // Prefer monitored binding descriptions → library eventIds, then GetEvents catalog.
    let eventIds: string[] = [];
    let eventNames: string[] = types.slice();
    try {
      const { loadBoundNotificationOptionsForSite, loadNotificationLibraryItems } = await import("./notificationLibraryStore");
      const [boundOptions, library] = await Promise.all([
        loadBoundNotificationOptionsForSite(),
        loadNotificationLibraryItems()
      ]);
      const byDescription = new Map(
        library.map((row) => [String(row.description ?? "").trim().toLowerCase(), row])
      );
      const targets = types.length
        ? boundOptions.filter((opt) =>
            types.some((t) => opt.description.toLowerCase().includes(t.toLowerCase()))
          )
        : boundOptions;
      for (const opt of targets) {
        const row = byDescription.get(opt.description.toLowerCase());
        const id = String(row?.eventId ?? "").trim();
        if (id) eventIds.push(id);
        else eventNames.push(opt.description);
      }
    } catch {
      // Catalog-only fallback below.
    }

    if (!eventIds.length) {
      eventIds = (types.length
        ? catalog.filter((item) => types.some((t) => item.eventName.toLowerCase().includes(t.toLowerCase())))
        : catalog
      ).map((item) => item.id).filter(Boolean);
    }

    // Resolve leftover names → ids via catalog so GetTelemetry always gets Event ids when possible.
    if (eventNames.length && catalog.length) {
      for (const name of eventNames) {
        const match = matchGpsIotEventToDescription(catalog, name);
        if (match?.id) eventIds.push(match.id);
      }
    }
    eventIds = Array.from(new Set(eventIds)).slice(0, 40);

    const telemetryBatches = await mapWithLimit(uniqueDeviceIds, 6, async (deviceId) => {
      const match = devices.find((device) => device.imei === deviceId || String(gpsIotDeviceId(device.imei)) === deviceId);
      const imei = match?.imei || (/^\d{10,20}$/.test(deviceId) ? deviceId : "");
      const asset = assets.find((row: any) => String(row?.imei ?? "").trim() === imei);
      const assetId = resolveGpsIotFuelAssetId(asset ?? { imei, id: deviceId });
      const hashedId = match ? gpsIotDeviceId(match.imei) : Number(deviceId) || 0;
      if (!assetId) return [] as TraccarEvent[];
      try {
        const rows = await getGpsIotEventTelemetry({
          assetId,
          startTime: startDate,
          endTime: endDate,
          events: eventIds.length ? eventIds : undefined,
          eventNames: !eventIds.length && eventNames.length ? eventNames : undefined,
          timeZone: "UTC"
        });
        return rows.map((row, index) => mapGpsIotTelemetryToTraccarEvent(row, hashedId, index) as TraccarEvent);
      } catch {
        return [] as TraccarEvent[];
      }
    });
    const out: TraccarEvent[] = telemetryBatches.flat();
    let seq = out.length;

    try {
      const alerts = await getGpsIotNotificationAlerts({ startDate, endDate, timeZoneId: "UTC" });
      for (const raw of alerts) {
        const imei = String(raw.imei ?? raw.ImeiNumber ?? "").trim();
        if (uniqueDeviceIds.length && imei) {
          const wanted = uniqueDeviceIds.some(
            (id) => id === imei || String(gpsIotDeviceId(imei)) === id
          );
          if (!wanted) continue;
        }
        if (types.length) {
          const name = String(raw.eventName ?? raw.alertName ?? "").toLowerCase();
          if (!types.some((t) => name.includes(t.toLowerCase()))) continue;
        }
        const hashedId = imei ? gpsIotDeviceId(imei) : 0;
        out.push(mapGpsIotNotificationAlertToTraccarEvent(raw as any, hashedId, seq) as TraccarEvent);
        seq += 1;
      }
    } catch {
      // Keep telemetry-only results.
    }

    return out.sort((a, b) => Date.parse(String(a.eventTime)) - Date.parse(String(b.eventTime)));
  }

  const query = new URLSearchParams({ from, to });
  for (const id of uniqueDeviceIds) query.append("deviceId", id);
  if (groupId) query.set("groupId", groupId);
  const types = Array.isArray(params.type) ? params.type.map((t) => String(t ?? "").trim()).filter(Boolean) : [];
  for (const t of types) query.append("type", t);

  const result = await traccarProxyRequest<TraccarEvent[] | { events?: TraccarEvent[]; data?: TraccarEvent[] }>(
    `/reports/events?${query.toString()}`,
    { method: "GET" }
  );
  if (!result.ok && params.strict) throw new Error(`Events report failed (${result.status})`);
  const body = result.ok ? result.body : null;

  if (Array.isArray(body)) return body;
  if (Array.isArray((body as any)?.events)) return (body as any).events;
  if (Array.isArray((body as any)?.data)) return (body as any).data;
  return [];
}

/**
 * Fetch geofence entry/exit intervals for devices or groups over a time range.
 * Calls Traccar GET /reports/geofences via the proxy.
 * At least one of deviceId or groupId must be provided.
 *
 * UK GPS IoT: synthesize visits from GetTelemetry / GetNotificationAlerts
 * geofence enter·exit events + site geofence library (no Traccar /reports/geofences).
 */
export async function getTraccarGeofences(params: {
  from: string;
  to: string;
  deviceId?: number | string;
  groupId?: number | string;
  geofenceId?: Array<number | string>;
}): Promise<TraccarGeofenceVisit[]> {
  const from = String(params.from ?? "").trim();
  const to = String(params.to ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();
  const groupId = String(params.groupId ?? "").trim();
  if (!from || !to) return [];
  if (!deviceId && !groupId) return [];

  if (isGpsIotServer()) {
    if (!deviceId) return [];
    const filterIds = new Set(
      (Array.isArray(params.geofenceId) ? params.geofenceId : [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    );

    const events = await getTraccarEvents({
      from,
      to,
      deviceId,
      type: [
        "geofenceEnter",
        "geofenceExit",
        "Geofence Entered",
        "Geofence Exited",
        "Location Entry",
        "Location Exit",
        "geofence",
        "location entry",
        "location exit"
      ]
    }).catch(() => [] as TraccarEvent[]);

    const isEnter = (event: TraccarEvent) => {
      const attrs = (event.attributes ?? {}) as Record<string, unknown>;
      const bag = [
        event.type,
        attrs.eventName,
        attrs.event,
        attrs.alarm,
        attrs.alertName
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      return /geofence\s*enter|enter(ed)?\s*(geofence|location)|location\s*entry|\barriv/i.test(bag)
        && !/exit|left|depart/i.test(bag);
    };
    const isExit = (event: TraccarEvent) => {
      const attrs = (event.attributes ?? {}) as Record<string, unknown>;
      const bag = [
        event.type,
        attrs.eventName,
        attrs.event,
        attrs.alarm,
        attrs.alertName
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      return /geofence\s*exit|exit(ed)?\s*(geofence|location)|location\s*exit|\bleft\b|\bdepart/i.test(bag);
    };

    const geofenceLabel = (event: TraccarEvent) => {
      const attrs = (event.attributes ?? {}) as Record<string, unknown>;
      return String(
        attrs.geofenceName
        ?? attrs.geofence
        ?? attrs.address
        ?? attrs.location
        ?? attrs.name
        ?? event.type
        ?? ""
      ).trim();
    };

    const hashGeofenceId = (label: string) => {
      const text = String(label ?? "").trim().toLowerCase();
      if (!text) return 0;
      let hash = 0;
      for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
      }
      return Math.abs(hash) || 1;
    };

    const openByKey = new Map<string, { startTime: string; geofenceId: number; deviceName: string }>();
    const visits: TraccarGeofenceVisit[] = [];
    const sorted = [...events].sort(
      (a, b) => Date.parse(String(a.eventTime ?? "")) - Date.parse(String(b.eventTime ?? ""))
    );
    const numericDeviceId = Number(deviceId) || gpsIotDeviceId(deviceId) || 0;

    for (const event of sorted) {
      const label = geofenceLabel(event);
      if (!label) continue;
      const geofenceId = hashGeofenceId(label);
      if (filterIds.size && !filterIds.has(String(geofenceId)) && !filterIds.has(label)) continue;
      const key = `${numericDeviceId}:${label.toLowerCase()}`;
      const deviceName = String(
        (event.attributes as any)?.assetName
        ?? (event.attributes as any)?.deviceName
        ?? ""
      ).trim();
      const at = String(event.eventTime ?? "").trim() || from;

      if (isEnter(event)) {
        openByKey.set(key, { startTime: at, geofenceId, deviceName });
        continue;
      }
      if (isExit(event)) {
        const open = openByKey.get(key);
        const startTime = open?.startTime || at;
        const endTime = at;
        openByKey.delete(key);
        visits.push({
          deviceId: numericDeviceId,
          deviceName: open?.deviceName || deviceName,
          geofenceId: open?.geofenceId || geofenceId,
          startTime,
          endTime
        });
      }
    }

    // Open enters without exit → dwell until range end.
    for (const open of openByKey.values()) {
      visits.push({
        deviceId: numericDeviceId,
        deviceName: open.deviceName,
        geofenceId: open.geofenceId,
        startTime: open.startTime,
        endTime: to
      });
    }

    return visits;
  }

  const query = new URLSearchParams({ from, to });
  if (deviceId) query.set("deviceId", deviceId);
  if (groupId) query.set("groupId", groupId);
  const geofenceIds = Array.isArray(params.geofenceId)
    ? params.geofenceId.map((id) => String(id ?? "").trim()).filter(Boolean)
    : [];
  for (const geofenceId of geofenceIds) query.append("geofenceId", geofenceId);

  const result = await traccarProxyRequest<TraccarGeofenceVisit[] | { data?: TraccarGeofenceVisit[] }>(
    `/reports/geofences?${query.toString()}`,
    { method: "GET" }
  );
  const body = result.ok ? result.body : null;

  if (Array.isArray(body)) return body;
  if (Array.isArray((body as any)?.data)) return (body as any).data;
  return [];
}

/**
 * Fetch summary metrics over a period for devices or groups.
 * Calls Traccar GET /reports/summary via the proxy.
 * At least one of deviceId or groupId must be provided.
 *
 * UK GPS IoT: GetDailySummary ≤24h, ClientAssetsMileage ≤30d. Outside those
 * windows (or when they fail), backend + this client fall back to chunked
 * GetTrips → GetTripDetails — same path as Detailed Movement, so Utilisation
 * and Historical Tracking still populate.
 */
export async function getTraccarSummary(params: {
  from: string;
  to: string;
  deviceId?: number | string;
  groupId?: number | string;
  /** Registration / plate — used to match GPS IoT GetDailySummary rows. */
  registration?: string;
  deviceName?: string;
}): Promise<TraccarSummary[]> {
  const from = String(params.from ?? "").trim();
  const to = String(params.to ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();
  const groupId = String(params.groupId ?? "").trim();
  if (!from || !to) return [];
  if (!deviceId && !groupId) return [];

  if (isGpsIotServer()) {
    if (!deviceId) return [];
    const devices = await loadGpsIotLiveDevices();
    const match = devices.find((device) => device.imei === deviceId || String(gpsIotDeviceId(device.imei)) === deviceId);
    const imei = match?.imei || (/^\d{10,20}$/.test(deviceId) ? deviceId : "");
    if (!imei) return [];
    const ctx = resolveGpsIotClientContext();
    let summary: TraccarSummary[] = [];
    try {
      const result = await fetchJson<{ summary?: TraccarSummary[] }>("/gpsiot/trips/summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imei,
          deviceId: match ? gpsIotDeviceId(match.imei) : deviceId,
          deviceName: String(params.deviceName ?? match?.name ?? "").trim() || undefined,
          registration: String(params.registration ?? "").trim() || undefined,
          startTime: from,
          endTime: to,
          ...(ctx.clientId ? { clientId: ctx.clientId } : {}),
          ...(ctx.databaseName ? { databaseName: ctx.databaseName } : {})
        })
      });
      summary = Array.isArray(result?.summary) ? result.summary : [];
    } catch {
      summary = [];
    }
    // When summary APIs are limited/empty, build from Detailed Movement trips
    // (same GetTrips path Utilisation + Historical already use).
    if (!summary.length) {
      const trips = await getTraccarTrips({ deviceId, from, to }).catch(() => [] as TraccarTrip[]);
      if (trips.length) {
        const distance = trips.reduce((sum, trip) => sum + Math.max(0, Number(trip.distance ?? 0)), 0);
        const durationMs = trips.reduce((sum, trip) => {
          const explicit = Number(trip.duration ?? 0);
          if (explicit > 0) return sum + explicit;
          const start = Date.parse(String(trip.startTime ?? ""));
          const end = Date.parse(String(trip.endTime ?? ""));
          return sum + (Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0);
        }, 0);
        const maxSpeed = trips.reduce((max, trip) => Math.max(max, Number(trip.maxSpeed ?? 0)), 0);
        const engineHours = durationMs > 0 ? durationMs / 3_600_000 : 0;
        return [{
          deviceId: match ? gpsIotDeviceId(match.imei) : Number(deviceId) || 0,
          deviceName: String(params.deviceName ?? match?.name ?? imei),
          maxSpeed,
          averageSpeed: engineHours > 0 ? ((distance / 1000) / engineHours) / 1.852 : 0,
          distance,
          spentFuel: 0,
          engineHours,
          tripCount: trips.length,
          registration: String(params.registration ?? "").trim() || undefined,
          source: "trips"
        }];
      }
    }
    return summary;
  }

  const query = new URLSearchParams({ from, to });
  if (deviceId) query.set("deviceId", deviceId);
  if (groupId) query.set("groupId", groupId);

  const result = await traccarProxyRequest<TraccarSummary[] | { data?: TraccarSummary[] }>(
    `/reports/summary?${query.toString()}`,
    { method: "GET" }
  );
  const body = result.ok ? result.body : null;

  if (Array.isArray(body)) return body;
  if (Array.isArray((body as any)?.data)) return (body as any).data;
  return [];
}

/**
 * Fetch stop intervals for a device over a time range.
 * Calls Traccar GET /reports/stops via the proxy.
 */
export async function getTraccarStops(params: {
  deviceId: number | string;
  from: string;
  to: string;
}): Promise<TraccarStop[]> {
  const deviceId = String(params.deviceId ?? "").trim();
  if (!deviceId) return [];
  const from = String(params.from ?? "").trim();
  const to = String(params.to ?? "").trim();
  if (!from || !to) return [];

  if (isGpsIotServer()) {
    const devices = await loadGpsIotLiveDevices();
    const match = devices.find((device) => device.imei === deviceId || String(gpsIotDeviceId(device.imei)) === deviceId);
    const imei = match?.imei || (/^\d{10,20}$/.test(deviceId) ? deviceId : "");
    if (!imei) return [];
    try {
      const result = await fetchJson<{ stops?: TraccarStop[] }>("/gpsiot/trips/stops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imei,
          deviceId: match ? gpsIotDeviceId(match.imei) : deviceId,
          deviceName: match?.name,
          startTime: from,
          endTime: to
        })
      });
      return Array.isArray(result?.stops) ? result.stops : [];
    } catch {
      return [];
    }
  }

  const query = new URLSearchParams({ deviceId, from, to });
  const result = await traccarProxyRequest<TraccarStop[] | { stops?: TraccarStop[]; data?: TraccarStop[] }>(
    `/reports/stops?${query.toString()}`,
    { method: "GET" }
  );
  const body = result.ok ? result.body : null;

  if (Array.isArray(body)) return body;
  if (Array.isArray((body as any)?.stops)) return (body as any).stops;
  if (Array.isArray((body as any)?.data)) return (body as any).data;
  return [];
}

/**
 * Fetch Traccar notifications.
 * Calls Traccar GET /notifications via the proxy.
 */
let traccarNotificationsCache: { at: number; items: TraccarNotification[] } | null = null;
let traccarComputedAttributesCache: { at: number; items: TraccarComputedAttribute[] } | null = null;
const TRACCAR_LIST_CACHE_MS = 4000;
let traccarListCacheBatchDepth = 0;
let traccarListCacheDirty = false;

function invalidateTraccarNotificationsCache() {
  if (traccarListCacheBatchDepth > 0) {
    traccarListCacheDirty = true;
    return;
  }
  traccarNotificationsCache = null;
}

function invalidateTraccarComputedAttributesCache() {
  if (traccarListCacheBatchDepth > 0) {
    traccarListCacheDirty = true;
    return;
  }
  traccarComputedAttributesCache = null;
}

/** Defer list-cache clears until endTraccarListCacheBatch (avoids N× GET during binding sync). */
export function beginTraccarListCacheBatch() {
  traccarListCacheBatchDepth += 1;
}

export function endTraccarListCacheBatch() {
  traccarListCacheBatchDepth = Math.max(0, traccarListCacheBatchDepth - 1);
  if (traccarListCacheBatchDepth === 0 && traccarListCacheDirty) {
    traccarNotificationsCache = null;
    traccarComputedAttributesCache = null;
    traccarListCacheDirty = false;
  }
}

export function invalidateTraccarListCaches() {
  traccarNotificationsCache = null;
  traccarComputedAttributesCache = null;
  traccarListCacheDirty = false;
}

function parseTraccarNotificationList(
  body: TraccarNotification[] | { notifications?: TraccarNotification[]; data?: TraccarNotification[] } | null
): TraccarNotification[] {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray((body as any)?.notifications)) return (body as any).notifications;
  if (Array.isArray((body as any)?.data)) return (body as any).data;
  return [];
}

export async function getTraccarNotifications(): Promise<TraccarNotification[]> {
  // UK GPS IoT: notifications live in site library + bindings — never hit Traccar.
  if (isGpsIotServer()) return [];
  if (traccarNotificationsCache && Date.now() - traccarNotificationsCache.at < TRACCAR_LIST_CACHE_MS) {
    return traccarNotificationsCache.items;
  }
  const result = await traccarProxyRequest<TraccarNotification[] | { notifications?: TraccarNotification[]; data?: TraccarNotification[] }>(
    "/notifications",
    { method: "GET" }
  );

  const items = result.ok ? parseTraccarNotificationList(result.body) : [];
  traccarNotificationsCache = { at: Date.now(), items };
  return items;
}

/** Device-linked notifications only — not cached with the global catalog. */
export async function listTraccarNotificationsForDevice(deviceId: number): Promise<TraccarNotification[]> {
  if (isGpsIotServer()) return [];
  const id = Math.trunc(Number(deviceId ?? 0));
  if (!Number.isFinite(id) || id <= 0) return [];
  const result = await traccarProxyRequest<TraccarNotification[] | { notifications?: TraccarNotification[]; data?: TraccarNotification[] }>(
    `/notifications?deviceId=${id}`,
    { method: "GET" },
    { skipInflightDedupe: true }
  );
  return result.ok ? parseTraccarNotificationList(result.body) : [];
}

/**
 * Create a Traccar notification.
 * Calls Traccar POST /notifications via the proxy.
 */
export async function createTraccarNotification(
  payload: TraccarNotificationWritePayload
): Promise<{ ok: boolean; status?: number; body?: TraccarNotification; error?: string }> {
  if (isGpsIotServer()) {
    return { ok: false, status: 400, error: "Traccar notifications are not used on GPS IoT (UK)." };
  }
  const type = String(payload?.type ?? "").trim();
  if (!type) return { ok: false, status: 400, error: "type is required" };

  const result = await traccarProxyRequest<TraccarNotification>("/notifications", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (!result.ok || result.softFailed) {
    return {
      ok: false,
      status: result.status,
      error: result.error || "Unable to create notification."
    };
  }
  invalidateTraccarNotificationsCache();
  return {
    ok: true,
    status: result.status,
    body: (result.body ?? undefined) as TraccarNotification | undefined
  };
}

/**
 * Update an existing Traccar notification.
 * Calls Traccar PUT /notifications/{id} via the proxy.
 */
export async function updateTraccarNotification(
  id: number | string,
  payload: TraccarNotificationWritePayload
): Promise<{ ok: boolean; status?: number; body?: TraccarNotification; error?: string }> {
  if (isGpsIotServer()) {
    return { ok: false, status: 400, error: "Traccar notifications are not used on GPS IoT (UK)." };
  }
  const targetId = String(id ?? "").trim();
  const type = String(payload?.type ?? "").trim();
  if (!targetId) return { ok: false, status: 400, error: "id is required" };
  if (!type) return { ok: false, status: 400, error: "type is required" };

  const result = await traccarProxyRequest<TraccarNotification>(`/notifications/${targetId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  if (!result.ok || result.softFailed) {
    return {
      ok: false,
      status: result.status,
      error: result.error || "Unable to update notification."
    };
  }
  invalidateTraccarNotificationsCache();
  return {
    ok: true,
    status: result.status,
    body: (result.body ?? undefined) as TraccarNotification | undefined
  };
}

/**
 * Delete an existing Traccar notification.
 * Calls Traccar DELETE /notifications/{id} via the proxy.
 */
export async function deleteTraccarNotification(
  id: number | string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (isGpsIotServer()) {
    return { ok: false, status: 400, error: "Traccar notifications are not used on GPS IoT (UK)." };
  }
  const targetId = String(id ?? "").trim();
  if (!targetId) return { ok: false, status: 400, error: "id is required" };

  const result = await traccarProxyRequest(`/notifications/${targetId}`, { method: "DELETE" });
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error };
  }
  invalidateTraccarNotificationsCache();
  return { ok: true, status: result.status };
}

export interface TraccarComputedAttribute {
  id?: number | string;
  description?: string;
  attribute?: string;
  expression?: string;
  type?: string;
  priority?: number;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TraccarComputedAttributeWritePayload {
  id?: number | string;
  description: string;
  attribute: string;
  expression: string;
  type: string;
  priority?: number;
  attributes?: Record<string, unknown>;
}

async function traccarProxyRequest<T = unknown>(
  path: string,
  init: RequestInit,
  options?: TraccarProxyRequestOptions
): Promise<{ ok: boolean; status: number; body: T | null; error?: string; softFailed?: boolean }> {
  const method = String(init.method ?? "GET").toUpperCase();
  const bypassSlot = options?.bypassSlot === true;
  const attemptTimeoutMs =
    typeof options?.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 20_000;
  const getCacheKey = method === "GET" ? `GET:${getTenantId() || "_"}:${String(path ?? "").trim()}` : "";
  const useInflightDedupe = Boolean(getCacheKey) && !options?.skipInflightDedupe;
  if (useInflightDedupe) {
    const cached = readTimedCache<
      { ok: boolean; status: number; body: T | null; error?: string; softFailed?: boolean }
    >(traccarGetCache, getCacheKey, TRACCAR_GET_CACHE_TTL_MS);
    if (cached) return cached;
    const inflight = traccarGetInflight.get(getCacheKey);
    if (inflight) {
      return inflight as Promise<{ ok: boolean; status: number; body: T | null; error?: string; softFailed?: boolean }>;
    }
  }

  const execute = async (): Promise<{ ok: boolean; status: number; body: T | null; error?: string; softFailed?: boolean }> => {
  const softWritePath =
    /^\/?(permissions|notifications)(?:\/|\?|$)/i.test(String(path ?? "").trim()) ||
    /^\/?attributes\/computed(?:\/|\?|$)/i.test(String(path ?? "").trim());
  // GETs fail fast into telemetry/B2 fallbacks; writes keep more retries.
  const maxAttempts =
    typeof options?.maxAttempts === "number" && options.maxAttempts > 0
      ? options.maxAttempts
      : method === "GET"
        ? 2
        : 4;

  const runAttempt = async () => {
        const rawBody = typeof init.body === "string" ? init.body : undefined;
        const sanitizedBody = sanitizeTraccarComputedAttributeRequestBody(path, method, rawBody);
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timeoutId =
          controller && typeof globalThis.setTimeout === "function"
            ? globalThis.setTimeout(() => controller.abort(), attemptTimeoutMs)
            : 0;
        try {
          const response = await fetch(buildUrl(`/api/traccar/proxy?path=${encodeURIComponent(path)}`), {
            ...API_FETCH_INIT,
            ...init,
            ...(sanitizedBody !== undefined ? { body: sanitizedBody } : {}),
            ...(controller ? { signal: controller.signal } : {}),
            headers: {
              "content-type": "application/json",
              ...buildAuthHeaders(undefined, undefined),
              ...(init.headers ?? {})
            }
          });

          const text = await response.text();
          let body: T | null = null;
          try {
            body = text ? (JSON.parse(text) as T) : null;
          } catch {
            body = text as T;
          }

          const softFailed = Boolean((body as any)?.softFailed);
          if (softFailed) {
            return {
              ok: true,
              status: response.status || 200,
              body,
              softFailed: true,
              error: extractErrorMessage(body, text)
            };
          }

          // Permissions / notifications / computed-attribute writes must never surface as hard console failures.
          if (!response.ok && method !== "GET" && softWritePath) {
            return {
              ok: true,
              status: 200,
              body,
              softFailed: true,
              error: extractErrorMessage(body, text)
            };
          }

          if (!response.ok) {
            return {
              ok: false,
              status: response.status,
              body,
              error: extractErrorMessage(body, text)
            };
          }

          return { ok: true, status: response.status, body };
        } finally {
          if (timeoutId) globalThis.clearTimeout(timeoutId);
        }
  };

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    try {
      const result = bypassSlot
        ? await runAttempt()
        : await withTraccarProxySlot(runAttempt);

      const retryableStatus = isTransientNetworkError(result.error, result.status);
      const retryableSoftFail =
        Boolean(result.softFailed) &&
        isTransientNetworkError(result.error, result.status || 0);
      if ((retryableStatus || retryableSoftFail) && attemptIndex < maxAttempts - 1) {
        await sleepMs(300 * 2 ** attemptIndex + Math.random() * 150);
        continue;
      }
      return result;
    } catch (err: any) {
      if (attemptIndex < maxAttempts - 1 && isTransientNetworkError(err)) {
        await sleepMs(300 * 2 ** attemptIndex + Math.random() * 150);
        continue;
      }
      if (softWritePath && method !== "GET") {
        return { ok: true, status: 200, body: null, softFailed: true, error: String(err?.message ?? err) };
      }
      return { ok: false, status: 0, body: null, error: String(err?.message ?? err) };
    }
  }

  return { ok: false, status: 0, body: null, error: "Traccar proxy request failed after retries." };
  };

  if (useInflightDedupe) {
    const pending = execute()
      .then((result) => {
        if (result.ok && !result.softFailed) {
          const pathText = String(path ?? "");
          const emptyUniqueLookup =
            /\/devices\?/i.test(pathText)
            && /[?&]uniqueId=/i.test(pathText)
            && Array.isArray(result.body)
            && result.body.length === 0;
          if (!emptyUniqueLookup) {
            rememberTimedCache(traccarGetCache, getCacheKey, result);
          }
        }
        return result;
      })
      .finally(() => {
        traccarGetInflight.delete(getCacheKey);
      });
    traccarGetInflight.set(getCacheKey, pending);
    return pending;
  }
  return execute();
}

/**
 * Fetch Traccar computed attributes.
 * Calls Traccar GET /attributes/computed via the proxy.
 */
function parseTraccarComputedAttributeList(
  body: TraccarComputedAttribute[] | { data?: TraccarComputedAttribute[] } | null
): TraccarComputedAttribute[] {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray((body as any)?.data)) return (body as any).data;
  return [];
}

export async function getTraccarComputedAttributes(): Promise<TraccarComputedAttribute[]> {
  if (traccarComputedAttributesCache && Date.now() - traccarComputedAttributesCache.at < TRACCAR_LIST_CACHE_MS) {
    return traccarComputedAttributesCache.items;
  }
  const result = await traccarProxyRequest<TraccarComputedAttribute[] | { data?: TraccarComputedAttribute[] }>(
    "/attributes/computed",
    { method: "GET" }
  );
  const items = result.ok ? parseTraccarComputedAttributeList(result.body) : [];
  traccarComputedAttributesCache = { at: Date.now(), items };
  return items;
}

/** Device-linked computed attributes only — not cached with the global catalog. */
export async function listTraccarComputedAttributesForDevice(
  deviceId: number
): Promise<TraccarComputedAttribute[]> {
  if (isGpsIotServer()) return [];
  const id = Math.trunc(Number(deviceId ?? 0));
  if (!Number.isFinite(id) || id <= 0) return [];
  const result = await traccarProxyRequest<TraccarComputedAttribute[] | { data?: TraccarComputedAttribute[] }>(
    `/attributes/computed?deviceId=${id}`,
    { method: "GET" },
    { skipInflightDedupe: true }
  );
  return result.ok ? parseTraccarComputedAttributeList(result.body) : [];
}

export async function createTraccarComputedAttribute(
  payload: TraccarComputedAttributeWritePayload
): Promise<{ ok: boolean; status?: number; body?: TraccarComputedAttribute; error?: string }> {
  const attribute = String(payload?.attribute ?? "").trim();
  if (!attribute) return { ok: false, status: 400, error: "attribute is required" };

  const result = await traccarProxyRequest<TraccarComputedAttribute>("/attributes/computed", {
    method: "POST",
    body: JSON.stringify(toTraccarComputedAttributeApiBody(payload))
  });

  if (result.ok) invalidateTraccarComputedAttributesCache();
  return {
    ok: result.ok,
    status: result.status,
    body: (result.body ?? undefined) as TraccarComputedAttribute | undefined,
    error: result.error
  };
}

export async function updateTraccarComputedAttribute(
  id: number | string,
  payload: TraccarComputedAttributeWritePayload
): Promise<{ ok: boolean; status?: number; body?: TraccarComputedAttribute; error?: string }> {
  const targetId = String(id ?? "").trim();
  if (!targetId) return { ok: false, status: 400, error: "id is required" };

  const result = await traccarProxyRequest<TraccarComputedAttribute>(`/attributes/computed/${targetId}`, {
    method: "PUT",
    body: JSON.stringify(toTraccarComputedAttributeApiBody({ ...payload, id: Number(targetId) || targetId }))
  });

  if (result.ok) invalidateTraccarComputedAttributesCache();
  return {
    ok: result.ok,
    status: result.status,
    body: (result.body ?? undefined) as TraccarComputedAttribute | undefined,
    error: result.error
  };
}

export async function deleteTraccarComputedAttribute(
  id: number | string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const targetId = String(id ?? "").trim();
  if (!targetId) return { ok: false, status: 400, error: "id is required" };

  const result = await traccarProxyRequest(`/attributes/computed/${targetId}`, { method: "DELETE" });
  if (result.ok) invalidateTraccarComputedAttributesCache();
  return { ok: result.ok, status: result.status, error: result.error };
}

export async function createTraccarPermission(payload: Record<string, number>): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  softFailed?: boolean;
}> {
  const keys = Object.keys(payload ?? {}).filter((key) => Number.isFinite(Number((payload as any)[key])));
  if (keys.length < 2) return { ok: false, status: 400, error: "Permission requires two linked ids." };
  const result = await traccarProxyRequest("/permissions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (result.softFailed) {
    const details = String(
      (result.body as any)?.details ??
        (result.body as any)?.message ??
        (result.body as any)?.error ??
        result.error ??
        ""
    );
    return {
      ok: false,
      status: Number((result.body as any)?.upstreamStatus ?? result.status) || result.status,
      softFailed: true,
      error: details || result.error || "Traccar permission soft-failed"
    };
  }
  return { ok: result.ok, status: result.status, error: result.error };
}

export async function deleteTraccarPermission(payload: Record<string, number>): Promise<{ ok: boolean; status?: number; error?: string }> {
  const keys = Object.keys(payload ?? {}).filter((key) => Number.isFinite(Number((payload as any)[key])));
  if (keys.length < 2) return { ok: false, status: 400, error: "Permission requires two linked ids." };
  const result = await traccarProxyRequest("/permissions", {
    method: "DELETE",
    body: JSON.stringify(payload)
  });
  return { ok: result.ok, status: result.status, error: result.error };
}

export async function getTraccarGroups(): Promise<Array<{ id?: number; name?: string; [key: string]: unknown }>> {
  const result = await traccarProxyRequest<Array<{ id?: number; name?: string }>>("/groups", { method: "GET" });
  if (!result.ok || !result.body) return [];
  return Array.isArray(result.body) ? result.body : [];
}

export async function listTraccarGeofenceDefinitions(): Promise<
  Array<{
    id?: number;
    name?: string;
    description?: string;
    area?: string;
    calendarId?: number;
    attributes?: Record<string, unknown>;
  }>
> {
  const result = await traccarProxyRequest<
    Array<{
      id?: number;
      name?: string;
      description?: string;
      area?: string;
      calendarId?: number;
      attributes?: Record<string, unknown>;
    }>
  >("/geofences", { method: "GET" });
  if (!result.ok || !result.body) return [];
  return Array.isArray(result.body) ? result.body : [];
}

export type TraccarGeofenceWritePayload = {
  id?: number;
  name: string;
  description?: string;
  area: string;
  calendarId?: number;
  attributes?: Record<string, unknown>;
};

export async function createTraccarGeofence(
  payload: TraccarGeofenceWritePayload
): Promise<{ ok: boolean; status?: number; body?: Record<string, unknown>; error?: string }> {
  const result = await traccarProxyRequest<Record<string, unknown>>("/geofences", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return {
    ok: result.ok,
    status: result.status,
    body: result.body ?? undefined,
    error: result.error
  };
}

export async function updateTraccarGeofence(
  id: number | string,
  payload: TraccarGeofenceWritePayload
): Promise<{ ok: boolean; status?: number; body?: Record<string, unknown>; error?: string }> {
  const targetId = String(id ?? "").trim();
  if (!targetId) return { ok: false, status: 400, error: "Geofence id is required." };
  const result = await traccarProxyRequest<Record<string, unknown>>(`/geofences/${targetId}`, {
    method: "PUT",
    body: JSON.stringify({ ...payload, id: Number(targetId) || payload.id })
  });
  return {
    ok: result.ok,
    status: result.status,
    body: result.body ?? undefined,
    error: result.error
  };
}

export async function deleteTraccarGeofence(
  id: number | string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const targetId = String(id ?? "").trim();
  if (!targetId) return { ok: false, status: 400, error: "Geofence id is required." };
  const result = await traccarProxyRequest(`/geofences/${targetId}`, { method: "DELETE" });
  return { ok: result.ok, status: result.status, error: result.error };
}

export type UserProfile = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  theme: "light" | "dark";
  emailLocked: boolean;
  canChangePassword: boolean;
  firstName?: string;
  lastName?: string;
  employer?: string;
  homeNumber?: string;
  workNumber?: string;
  country?: string;
  language?: string;
  timezone?: string;
  format?: string;
  measurementUnits?: "metric" | "imperial";
  consumption?: string;
};

export async function fetchUserProfile(): Promise<UserProfile | null> {
  const body = await fetchJson<{ ok?: boolean; profile?: UserProfile }>("/auth/profile");
  if (!body?.profile) return null;
  return {
    ...body.profile,
    theme: body.profile.theme === "dark" ? "dark" : "light"
  };
}

export async function updateUserProfile(payload: {
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
  measurementUnits?: "metric" | "imperial";
  consumption?: string;
  phone?: string;
  theme?: "light" | "dark";
  currentPassword?: string;
  newPassword?: string;
}): Promise<{ ok: boolean; profile?: UserProfile; error?: string }> {
  try {
    const tenantId = getTenantId();
    const apiKey = getApiKey();
    if (!apiKey) return { ok: false, error: "You need to sign in again before saving." };
    const response = await fetch(buildUrl("/auth/profile", tenantId), {
      method: "PATCH",
      ...API_FETCH_INIT,
      headers: {
        "content-type": "application/json",
        ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        "x-api-key": apiKey
      },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      profile?: UserProfile;
      error?: string;
    };
    if (!response.ok) {
      return { ok: false, error: String(body?.error ?? "Unable to save profile.") };
    }
    if (!body.profile) return { ok: true };
    return {
      ok: true,
      profile: {
        ...body.profile,
        theme: body.profile.theme === "dark" ? "dark" : "light"
      }
    };
  } catch {
    return { ok: false, error: "Unable to save profile." };
  }
}
