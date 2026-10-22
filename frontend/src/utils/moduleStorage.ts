/**
 * Module storage namespaces (Track / Control / Analyze / Deliver).
 *
 * These are logical KV key prefixes only — HTTP APIs (/kv, /d1, /b2, /deliver) stay unchanged.
 * Site-scoped data still uses buildScopeStorageKey / loadScopedFromApi / saveScopedToApi.
 *
 * Target pattern:
 *   {module}:{feature}:tenant:{tenantToken}:site:{siteToken}
 *
 * Legacy bases (e.g. libraries:notification, driver-coaching:debrief) remain valid until migrated.
 */

import { buildScopeStorageKey } from "./scopeStorage";

export type StorageModule = "track" | "control" | "analyze" | "deliver";

/** Documented feature bases under each module for new writers. */
export const MODULE_FEATURE_BASES: Record<StorageModule, readonly string[]> = {
  track: ["coaching:debrief", "default-options", "live-tracking"],
  control: ["libraries:notification", "libraries:location", "libraries:routes", "contacts", "operations", "config", "user-settings"],
  analyze: ["insights", "reports", "subscriptions"],
  deliver: ["store"]
};

/**
 * Build a module-prefixed feature base.
 * Example: buildModuleFeatureBase("track", "coaching:debrief") → "track:coaching:debrief"
 */
export function buildModuleFeatureBase(module: StorageModule, feature: string): string {
  const mod = String(module ?? "").trim().toLowerCase() as StorageModule;
  const feat = String(feature ?? "").trim().replace(/^:+|:+$/g, "");
  if (!feat) return mod;
  if (feat.startsWith(`${mod}:`)) return feat;
  return `${mod}:${feat}`;
}

/** Scoped KV key for a module feature under the active tenant/site. */
export function buildModuleScopeStorageKey(module: StorageModule, feature: string, site?: string): string {
  return buildScopeStorageKey(buildModuleFeatureBase(module, feature), site);
}

/**
 * B2 / blob prefix convention (mirrors backend assetStoragePaths):
 *   dealer/{dealer}/org/{org}/db/{db}/site/{site}/assets/{assetId}/{kind}/…
 * Asset metadata still lives in SQL; this prefix is for heavy payloads only.
 */
export function describeAssetStoragePrefix(args: {
  dealerId: string;
  orgId: string;
  dbId: string;
  site: string;
  assetId: string;
}): string {
  const safe = (value: string, fallback = "_") =>
    String(value ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || fallback;
  return `dealer/${safe(args.dealerId, "default")}/org/${safe(args.orgId)}/db/${safe(args.dbId)}/site/${safe(args.site)}/assets/${safe(args.assetId, "unknown")}`;
}
