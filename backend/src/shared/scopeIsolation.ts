/**
 * Tenant / site isolation — authoritative rules for API and KV storage.
 * Dealer, organisation, database, and site settings must never leak across scopes.
 */

export const SITE_SCOPED_KV_BASES = [
  "libraries:notification",
  "libraries:location",
  "libraries:location-alerts",
  "libraries:routes",
  "fleet:passengers",
  "fleet:drivers",
  "platform:cmsv6"
] as const;

export type SiteScopedKvBase = (typeof SITE_SCOPED_KV_BASES)[number];

const normalizeToken = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export function isDatabaseTenantId(tenantId: string): boolean {
  return String(tenantId ?? "")
    .trim()
    .split(":")
    .filter(Boolean).length >= 3;
}

/** True when the KV key uses the required tenant/site suffix pattern. */
export function isScopedKvKey(key: string, base?: SiteScopedKvBase): boolean {
  const normalized = String(key ?? "").trim();
  if (!normalized) return false;
  const bases = base ? [base] : SITE_SCOPED_KV_BASES;
  for (const scopedBase of bases) {
    if (normalized === scopedBase) return false;
    if (normalized.startsWith(`${scopedBase}:tenant:`)) return true;
  }
  return true;
}

/** Legacy flat keys (e.g. libraries:notification) must not be written for database tenants. */
export function isLegacyFlatScopedKvKey(key: string): boolean {
  const normalized = String(key ?? "").trim();
  return SITE_SCOPED_KV_BASES.some((base) => normalized === base);
}

/**
 * True when a site-scoped library key is tenant-wide (missing :site:).
 * Those keys would leak settings across sites in the same database.
 */
export function isTenantWideSiteScopedKvKey(key: string): boolean {
  const normalized = String(key ?? "").trim();
  return SITE_SCOPED_KV_BASES.some((base) => {
    const prefix = `${base}:tenant:`;
    if (!normalized.startsWith(prefix)) return false;
    return !/:site:[a-z0-9_]+$/i.test(normalized) && !normalized.includes(":site:");
  });
}

export function buildScopedKvKey(base: SiteScopedKvBase, tenantId: string, siteName: string): string {
  const tenantToken = normalizeToken(tenantId) || "global";
  const siteToken = normalizeToken(siteName);
  if (!siteToken) return `${base}:tenant:${tenantToken}`;
  return `${base}:tenant:${tenantToken}:site:${siteToken}`;
}

export function siteScopesMatch(left: string, right: string): boolean {
  const a = normalizeToken(left);
  const b = normalizeToken(right);
  return Boolean(a) && a === b;
}

export function validateBindingSiteAnchor(
  type: string,
  body: Record<string, unknown>,
  tenantId: string
): string | null {
  const bindingType = String(type ?? "").trim().toLowerCase();
  if (!["notifications", "locations", "devices"].includes(bindingType)) return null;
  if (!isDatabaseTenantId(tenantId)) return null;
  const site = String(body.site ?? "").trim();
  if (!site) {
    return "Bindings must include a site field. Each site keeps its own notification, location, and device bindings.";
  }
  return null;
}

/**
 * Require a site on site-owned records (drivers, passengers, configuration groups)
 * for database tenants so settings never leak across sites.
 */
export function validateRecordSiteAnchor(
  kind: "driver" | "passenger" | "configuration-group",
  body: Record<string, unknown>,
  tenantId: string
): string | null {
  if (!isDatabaseTenantId(tenantId)) return null;
  const site = String(body.site ?? "").trim();
  if (!site) {
    const labels: Record<typeof kind, string> = {
      driver: "Drivers",
      passenger: "Passengers",
      "configuration-group": "Configuration groups"
    };
    return `${labels[kind]} must include a site field. Each site keeps its own ${labels[kind].toLowerCase()}.`;
  }
  return null;
}

export function bindingSiteDedupeKey(type: string, rec: Record<string, unknown>): string {
  const name = String(rec?.name ?? "").trim().toLowerCase();
  if (!name) return String(rec?.id ?? "").trim();
  const site = String(rec?.site ?? "").trim().toLowerCase();
  const bindingType = String(type ?? "").trim().toLowerCase();
  if (bindingType === "notifications" || bindingType === "locations" || bindingType === "devices") {
    return site ? `${site}::${name}` : `::${name}`;
  }
  return `${bindingType}::${name}`;
}
