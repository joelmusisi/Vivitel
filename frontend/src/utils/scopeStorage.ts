import { loadFromApi, peekFromApi, saveToApi } from "./api";
import {
  SITE_SCOPED_KV_BASES,
  siteScopeToken,
  siteScopesMatch,
  type SiteScopedKvBase
} from "./scopeIsolation";
import { readActiveSiteName, readActiveTenantId } from "./tenantContext";
import { recoverActiveSiteName, readStoredSelectionScope } from "./selectionScope";

export { SITE_SCOPED_KV_BASES, siteScopeToken, siteScopesMatch, type SiteScopedKvBase };
export {
  buildModuleFeatureBase,
  buildModuleScopeStorageKey,
  describeAssetStoragePrefix,
  MODULE_FEATURE_BASES,
  type StorageModule
} from "./moduleStorage";

const normalizeScopeToken = (value: string) => siteScopeToken(value);

/** Build an isolated KV key for the active tenant and optional site. */
export function buildScopeStorageKey(base: string, site?: string) {
  const tenantId = readActiveTenantId();
  const tenantToken = normalizeScopeToken(tenantId) || "global";
  const siteName = String(site ?? readActiveSiteName()).trim();
  if (siteName) {
    return `${base}:tenant:${tenantToken}:site:${normalizeScopeToken(siteName)}`;
  }
  return `${base}:tenant:${tenantToken}`;
}

export function configGroupsCacheKey(site?: string) {
  const tenantId = readActiveTenantId();
  const siteName = String(site ?? readActiveSiteName()).trim();
  if (!tenantId) return "vivi.configGroups";
  if (siteName) return `vivi.configGroups:${tenantId}:${normalizeScopeToken(siteName)}`;
  return `vivi.configGroups:${tenantId}`;
}

export function peekScopedFromApi<T>(base: string, site?: string): T | null | undefined {
  const siteName = String(site ?? readActiveSiteName()).trim();
  const isSiteScopedBase = (SITE_SCOPED_KV_BASES as readonly string[]).includes(base);
  if (isSiteScopedBase) {
    if (!siteName) return undefined;
    return peekFromApi<T>(buildScopeStorageKey(base, siteName));
  }
  if (siteName) {
    const scoped = peekFromApi<T>(buildScopeStorageKey(base, siteName));
    if (scoped !== undefined) return scoped;
    return peekFromApi<T>(buildScopeStorageKey(base, ""));
  }
  const tenantScoped = peekFromApi<T>(buildScopeStorageKey(base, ""));
  if (tenantScoped !== undefined) return tenantScoped;
  return peekFromApi<T>(base);
}

export async function loadScopedFromApi<T>(base: string, site?: string): Promise<T | null> {
  const siteName = String(site ?? readActiveSiteName()).trim();
  const isSiteScopedBase = (SITE_SCOPED_KV_BASES as readonly string[]).includes(base);

  // Site-scoped libraries must use exact scope keys only — no tenant/flat fallback.
  // Without an active site, do not load tenant-wide data (that would cross sites).
  if (isSiteScopedBase) {
    if (!siteName) return null;
    return loadFromApi<T>(buildScopeStorageKey(base, siteName));
  }

  if (siteName) {
    const scoped = await loadFromApi<T>(buildScopeStorageKey(base, siteName));
    if (scoped) return scoped;
    return loadFromApi<T>(buildScopeStorageKey(base, ""));
  }

  const tenantScoped = await loadFromApi<T>(buildScopeStorageKey(base, ""));
  if (tenantScoped) return tenantScoped;

  return loadFromApi<T>(base);
}

export async function saveScopedToApi(base: string, payload: unknown, site?: string): Promise<boolean> {
  const siteName = String(site ?? readActiveSiteName()).trim();
  const isSiteScopedBase = (SITE_SCOPED_KV_BASES as readonly string[]).includes(base);
  if (isSiteScopedBase && !siteName) {
    console.error(
      `[scopeStorage] Refusing to save "${base}" without an active site — site libraries must not use tenant-wide keys.`
    );
    return false;
  }
  return saveToApi(buildScopeStorageKey(base, siteName), payload);
}

/**
 * Keep only records anchored to the active site.
 * Uses normalized site tokens (exact scope), never substring / cross-site fallbacks.
 */
export function filterForSiteScope<T extends { site?: unknown }>(records: T[], siteName: string): T[] {
  const active = siteScopeToken(siteName);
  if (!active) return [];
  return records.filter((row) => siteScopesMatch(String(row.site ?? ""), siteName));
}

/**
 * Filter site-owned fleet/config rows for the current org-ribbon selection.
 * Site/asset selection → exact active site only.
 * Database (or higher) selection → sites in the active database that this account can access.
 * Empty site on a record never matches a concrete site.
 */
export function filterRecordsForActiveSelection<T extends { site?: unknown }>(records: T[]): T[] {
  const selection = readStoredSelectionScope();
  const activeSite = String(selection.activeSite || recoverActiveSiteName() || readActiveSiteName()).trim();

  if (selection.scope === "site" || selection.scope === "asset") {
    if (!activeSite) return [];
    return filterForSiteScope(records, activeSite);
  }

  if (selection.activeDbSites.length > 0 && (selection.scope === "db" || selection.scope === "org" || selection.scope === "dealer" || !activeSite)) {
    const allowed = new Set(selection.activeDbSites.map((site) => siteScopeToken(site)).filter(Boolean));
    return records.filter((row) => {
      const site = String(row.site ?? "").trim();
      if (!site) return false;
      return allowed.has(siteScopeToken(site));
    });
  }

  if (activeSite) {
    return filterForSiteScope(records, activeSite);
  }

  return records.filter((row) => Boolean(String(row.site ?? "").trim()));
}
