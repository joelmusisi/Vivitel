import { isSyntheticTenantId } from "./hierarchyDisplay";
import { isLegacyFlatTenantId } from "./regionHierarchy";

const LIVE_TRACKING_KEYS = [
  "vivi.liveTracking.selectedLocations",
  "vivi.liveTracking.selectedEvents",
  "vivi.liveTracking.customLocations",
  "vivi.liveTracking.mapLayers",
  "vivi.lockedAsset",
  "vivi.requestPositionAsset",
  "vivi.activeAsset",
  "vivi.activeRegistration",
  "vivi.activeImei",
  "vivi.historyTime"
] as const;

/** Org-ribbon / site selection — must never survive a login or tenant switch. */
const SELECTION_KEYS = [
  "vivi.activeSite",
  "vivi.activeSiteId",
  "vivi.activeDealerId",
  "vivi.activeOrgId",
  "vivi.activeDbId",
  "vivi.activeDbSites",
  "vivi.selectedPath",
  "vivi.selectedScope",
  "vivi.org.dealers",
  "vivi.home.dashboard.model.v1"
] as const;

/** UI scratch state that must never follow a site or account switch. */
const SITE_UI_KEYS = [
  ...LIVE_TRACKING_KEYS,
  "vivi.home.dashboard.model.v1",
  "vivi.contextOptions",
  "vivi.chat.conversationId",
  "vivi.assets"
] as const;

export function readActiveTenantId(): string {
  if (typeof window === "undefined") return "";
  const raw = String(window.localStorage.getItem("vivi.tenantId") ?? "").trim();
  if (!raw || isSyntheticTenantId(raw) || isLegacyFlatTenantId(raw)) {
    if (raw && (isSyntheticTenantId(raw) || isLegacyFlatTenantId(raw))) {
      try {
        window.localStorage.removeItem("vivi.tenantId");
      } catch {
        // ignore
      }
    }
    return "";
  }
  return raw;
}

export function readActiveSiteName(): string {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
}

export function isDatabaseTenant(tenantId = readActiveTenantId()): boolean {
  if (!tenantId) return false;
  return tenantId.split(":").filter(Boolean).length >= 3;
}

export function tenantStorageKey(base: string, tenantId = readActiveTenantId()): string {
  const resolved = String(tenantId ?? "").trim();
  return resolved ? `${base}:${resolved}` : base;
}

export function readTenantScopedJson<T>(base: string, tenantId = readActiveTenantId()): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(tenantStorageKey(base, tenantId));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeTenantScopedJson(base: string, value: unknown, tenantId = readActiveTenantId()) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tenantStorageKey(base, tenantId), JSON.stringify(value ?? null));
  } catch {
    // ignore
  }
}

/** Active signed-in user id (or email fallback). Stream prefs/notifications are scoped per user within a tenant. */
export function readActiveUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("vivi.auth.principal");
    if (!raw) return "";
    const principal = JSON.parse(raw) as { userId?: string; email?: string; kind?: string };
    const userId = String(principal?.userId ?? "").trim();
    if (userId) return userId;
    const email = String(principal?.email ?? "").trim().toLowerCase();
    if (email) return email;
    if (String(principal?.kind ?? "").trim().toLowerCase() === "admin") return "__admin__";
  } catch {
    // ignore
  }
  return "";
}

export function userStorageKey(
  base: string,
  tenantId = readActiveTenantId(),
  userId = readActiveUserId()
): string {
  const tenantKey = tenantStorageKey(base, tenantId);
  const user = String(userId ?? "").trim();
  return user ? `${tenantKey}:user:${user}` : tenantKey;
}

export function readUserScopedJson<T>(
  base: string,
  tenantId = readActiveTenantId(),
  userId = readActiveUserId()
): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(userStorageKey(base, tenantId, userId));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeUserScopedJson(
  base: string,
  value: unknown,
  tenantId = readActiveTenantId(),
  userId = readActiveUserId()
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(userStorageKey(base, tenantId, userId), JSON.stringify(value ?? null));
  } catch {
    // ignore
  }
}

function clearBindingsCacheForTenant(tenantId: string) {
  if (typeof window === "undefined" || !tenantId) return;
  for (const type of ["notifications", "locations", "devices"] as const) {
    try {
      window.localStorage.removeItem(`vivi.bindings:${tenantId}:${type}`);
    } catch {
      // ignore
    }
  }
}

function removeLocalKeys(keys: readonly string[]) {
  if (typeof window === "undefined") return;
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

/** Drop dealer/org/db/site selection so another account cannot inherit WJL (etc.). */
export function clearSelectionClientState() {
  removeLocalKeys(SELECTION_KEYS);
  if (typeof window === "undefined") return;
  try {
    const bases = ["vivi.activeAsset", "vivi.activeRegistration", "vivi.activeImei", "vivi.contextType", "vivi.contextName", "vivi.dbProfile.selected", "vivi.fleetFilter."];
    const ls = window.localStorage;
    for (let i = ls.length - 1; i >= 0; i -= 1) {
      const key = ls.key(i) ?? "";
      if (bases.some((base) => key.includes(base))) ls.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/** Drop live/map/home UI scratch so the next site never paints the previous one. */
export function clearSiteUiClientState() {
  removeLocalKeys(SITE_UI_KEYS);
}

/** Registered by api.ts so site/session switches can drop in-memory API caches. */
let kvCacheInvalidator: ((site?: string) => void) | null = null;
let sessionCacheFlusher: (() => void) | null = null;

export function registerKvCacheInvalidator(fn: (site?: string) => void) {
  kvCacheInvalidator = fn;
}

export function registerSessionCacheFlusher(fn: () => void) {
  sessionCacheFlusher = fn;
}

function flushRuntimeCaches(previousSiteName?: string) {
  try {
    if (previousSiteName) kvCacheInvalidator?.(previousSiteName);
  } catch {
    // ignore
  }
  try {
    // Full in-memory flush so the next paint never reuses another site/account.
    kvCacheInvalidator?.();
  } catch {
    // ignore
  }
  try {
    sessionCacheFlusher?.();
  } catch {
    // ignore
  }
}

function dispatchScopeChangeEvents() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event("vivi:orgchange"));
    window.dispatchEvent(new Event("vivi:contextchange"));
  } catch {
    // ignore
  }
}

/**
 * Clear everything that can leak across sites. Safe to call before the new
 * site name is written — does not touch the active selection keys themselves.
 */
export function clearSiteSessionClientState(previousSiteName?: string) {
  clearSiteUiClientState();
  const tenantId = readActiveTenantId();
  if (tenantId) {
    try {
      window.localStorage.removeItem(`vivi.assets:${tenantId}`);
    } catch {
      // ignore
    }
    for (const key of LIVE_TRACKING_KEYS) {
      try {
        window.localStorage.removeItem(`${key}:${tenantId}`);
      } catch {
        // ignore
      }
    }
  }
  flushRuntimeCaches(previousSiteName);
}

/**
 * Clear tenant-scoped caches/UI. Does not touch org-ribbon selection keys —
 * callers rewrite those after switching databases.
 */
export function clearTenantClientState(previousTenantId?: string) {
  if (typeof window === "undefined") return;

  const previous = String(previousTenantId ?? "").trim();
  const current = readActiveTenantId();

  clearSiteUiClientState();

  if (previous) {
    try {
      window.localStorage.removeItem(`vivi.assets:${previous}`);
      window.localStorage.removeItem(`vivi.configGroups:${previous}`);
    } catch {
      // ignore
    }
    clearBindingsCacheForTenant(previous);
    for (const key of LIVE_TRACKING_KEYS) {
      try {
        window.localStorage.removeItem(`${key}:${previous}`);
      } catch {
        // ignore
      }
    }
  }

  clearBindingsCacheForTenant(current);
  flushRuntimeCaches();
}

/** Full wipe for logout / new login — selection, site UI, tenant caches, memory. */
export function clearSessionClientState(previousTenantId?: string) {
  clearSelectionClientState();
  clearTenantClientState(previousTenantId);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("vivi.impersonatedLabel");
  } catch {
    // ignore
  }
}

export function activateTenantContext(nextTenantId: string) {
  const previousTenantId = readActiveTenantId();
  const next = String(nextTenantId ?? "").trim();
  if (previousTenantId === next) return;
  clearTenantClientState(previousTenantId);
  dispatchScopeChangeEvents();
}

const normalizeSiteToken = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

/**
 * Site change within the same database: drop previous site UI + in-memory
 * caches immediately so pages reload the new site without a browser refresh.
 */
export function activateSiteContext(previousSiteName: string, nextSiteName: string) {
  const previous = normalizeSiteToken(previousSiteName);
  const next = normalizeSiteToken(nextSiteName);
  if (previous === next) return;
  clearSiteSessionClientState(previousSiteName);
  dispatchScopeChangeEvents();
}

/** Coalesce org + context events so a site switch reloads lists once, not twice. */
export function subscribeScopeChange(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  let timer = 0;
  const run = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      handler();
    }, 0);
  };
  window.addEventListener("vivi:orgchange", run);
  window.addEventListener("vivi:contextchange", run);
  return () => {
    window.removeEventListener("vivi:orgchange", run);
    window.removeEventListener("vivi:contextchange", run);
    if (timer) window.clearTimeout(timer);
  };
}
