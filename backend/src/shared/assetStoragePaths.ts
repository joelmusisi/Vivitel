/**
 * Asset and module storage path helpers.
 *
 * Hierarchy for heavy blobs (B2 / local archive mirrors):
 *   dealer/{dealerId}/org/{orgId}/db/{dbId}/site/{siteToken}/assets/{assetId}/{kind}/…
 *
 * KV settings stay module-namespaced logical bases (APIs unchanged):
 *   {module}:{feature}:tenant:{tenantToken}:site:{siteToken}
 *
 * Modules are key prefixes only — not separate databases or HTTP APIs.
 */

export type StorageModule = "track" | "control" | "analyze" | "deliver";

export type AssetBlobKind = "telemetry" | "media" | "artifacts";

/** Logical feature bases mapped under a module for new writers (legacy keys unchanged). */
export const MODULE_FEATURE_BASES: Record<StorageModule, readonly string[]> = {
  track: ["coaching:debrief", "default-options", "live-tracking"],
  control: ["libraries:notification", "libraries:location", "libraries:location-alerts", "libraries:routes", "contacts", "operations", "config", "user-settings"],
  analyze: ["insights", "reports", "subscriptions"],
  deliver: ["store"]
} as const;

export function parseTenantHierarchy(tenantId: string): {
  dealerId: string;
  orgId: string;
  dbId: string;
} {
  const parts = String(tenantId ?? "")
    .split(":")
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return {
    dealerId: parts[0] ?? "",
    orgId: parts[1] ?? "",
    dbId: parts[2] ?? ""
  };
}

/** B2 / filesystem-safe segment (dashes). */
export function b2SafePart(value: string, fallback = "_"): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

/** KV-safe segment (underscores), matching scopeIsolation normalizeToken. */
export function kvSafePart(value: string, fallback = "global"): string {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

/**
 * Stable prefix for all blobs owned by one asset under its dealer/site path.
 * Example: dealer/acme/org/fleet/db/prod/site/warehouse_a/assets/truck-01
 */
export function buildAssetB2Prefix(args: {
  tenantId: string;
  site?: string;
  assetId: string;
}): string {
  const { dealerId, orgId, dbId } = parseTenantHierarchy(args.tenantId);
  const dealer = b2SafePart(dealerId || args.tenantId || "default", "default");
  const org = b2SafePart(orgId || "_", "_");
  const db = b2SafePart(dbId || "_", "_");
  const site = b2SafePart(args.site || "_", "_");
  const asset = b2SafePart(args.assetId || "unknown", "unknown");
  return `dealer/${dealer}/org/${org}/db/${db}/site/${site}/assets/${asset}`;
}

export function buildAssetB2Key(args: {
  tenantId: string;
  site?: string;
  assetId: string;
  kind: AssetBlobKind;
  rest: string[];
}): string {
  const prefix = buildAssetB2Prefix(args);
  const kind = b2SafePart(args.kind, "telemetry");
  const tail = (args.rest ?? [])
    .map((part) => b2SafePart(part, "_"))
    .filter(Boolean)
    .join("/");
  return tail ? `${prefix}/${kind}/${tail}` : `${prefix}/${kind}`;
}

/** New telemetry archive object key under the asset prefix. */
export function buildAssetTelemetryArchiveKey(args: {
  tenantId: string;
  site?: string;
  assetId: string;
  createdAt: string;
  eventId: string;
  extension?: string;
}): string {
  const d = Number.isNaN(Date.parse(args.createdAt)) ? new Date() : new Date(args.createdAt);
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const eventPart = b2SafePart(args.eventId || "event", "event");
  const ext = String(args.extension ?? ".json").replace(/^\.?/, ".");
  return buildAssetB2Key({
    tenantId: args.tenantId,
    site: args.site,
    assetId: args.assetId,
    kind: "telemetry",
    rest: [yyyy, mm, dd, `${eventPart}${ext}`]
  });
}

/**
 * Report run archive object key (Analyze / Reports → Vivi-Reports after hot retention).
 * Example: dealer/acme/org/fleet/db/prod/site/warehouse_a/reports/2026/03/rep-01.json.gz
 */
export function buildReportArchiveKey(args: {
  tenantId: string;
  site?: string;
  reportId: string;
  createdAt: string;
  extension?: string;
}): string {
  const { dealerId, orgId, dbId } = parseTenantHierarchy(args.tenantId);
  const dealer = b2SafePart(dealerId || args.tenantId || "default", "default");
  const org = b2SafePart(orgId || "_", "_");
  const db = b2SafePart(dbId || "_", "_");
  const site = b2SafePart(args.site || "_", "_");
  const d = Number.isNaN(Date.parse(args.createdAt)) ? new Date() : new Date(args.createdAt);
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const reportPart = b2SafePart(args.reportId || "report", "report");
  const ext = String(args.extension ?? ".json.gz").replace(/^\.?/, ".");
  return `dealer/${dealer}/org/${org}/db/${db}/site/${site}/reports/${yyyy}/${mm}/${reportPart}${ext}`;
}

/**
 * Module-prefixed KV feature base (logical namespace only).
 * Example: buildModuleFeatureBase("track", "coaching:debrief") → "track:coaching:debrief"
 */
export function buildModuleFeatureBase(module: StorageModule, feature: string): string {
  const mod = String(module ?? "").trim().toLowerCase() as StorageModule;
  const feat = String(feature ?? "").trim().replace(/^:+|:+$/g, "");
  if (!feat) return mod;
  // Avoid double-prefixing when callers already pass module:feature
  if (feat.startsWith(`${mod}:`)) return feat;
  return `${mod}:${feat}`;
}

/** Ensure asset JSON carries a stable storagePrefix for blob retrieval. */
export function withAssetStoragePrefix(
  tenantId: string,
  asset: Record<string, unknown>
): Record<string, unknown> {
  const assetId = String(asset.id ?? asset.assetId ?? asset.registration ?? "").trim();
  if (!assetId) return asset;
  const site = String(asset.site ?? "").trim();
  const prefix = buildAssetB2Prefix({ tenantId, site, assetId });
  const existing = String(asset.storagePrefix ?? "").trim();
  if (existing === prefix) return asset;
  // Recompute when site/id change; keep prior only if still matching hierarchy shape for same asset
  return { ...asset, storagePrefix: prefix };
}
