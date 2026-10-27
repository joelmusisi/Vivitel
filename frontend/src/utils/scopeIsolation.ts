/**
 * Tenant / site isolation — authoritative rules for the VIVI frontend.
 * Use scopeStorage helpers for KV; never use flat library keys when a site is active.
 */

import { isDatabaseTenant, readActiveSiteName, readActiveTenantId } from "./tenantContext";

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

const normalizeScopeToken = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Stable site token used in KV keys and exact-scope filters (no substring matching). */
export function siteScopeToken(value: string) {
  return normalizeScopeToken(value);
}

/** True when two site labels resolve to the same storage scope. */
export function siteScopesMatch(left: string, right: string) {
  const a = siteScopeToken(left);
  const b = siteScopeToken(right);
  return Boolean(a) && a === b;
}

export function isLegacyFlatScopedKvKey(key: string): boolean {
  const normalized = String(key ?? "").trim();
  return SITE_SCOPED_KV_BASES.some((base) => normalized === base);
}

export function isScopedKvKey(key: string): boolean {
  const normalized = String(key ?? "").trim();
  if (isLegacyFlatScopedKvKey(normalized)) return false;
  return SITE_SCOPED_KV_BASES.some((base) => normalized.startsWith(`${base}:tenant:`));
}

/**
 * Blocks direct load/save of legacy tenant-wide library keys when a site is selected.
 * Call from loadFromApi / saveToApi only.
 */
export function guardFlatScopedKvAccess(key: string, mode: "read" | "write"): void {
  if (!isLegacyFlatScopedKvKey(key)) return;

  const activeSite = readActiveSiteName();
  const tenantId = readActiveTenantId();
  if (!isDatabaseTenant(tenantId)) return;

  if (activeSite) {
    const verb = mode === "write" ? "saveScopedToApi" : "loadScopedFromApi";
    const message =
      `Refusing ${mode} on legacy KV key "${key}" while site "${activeSite}" is active. ` +
      `Use ${verb}("${key}", ...) from scopeStorage.ts instead.`;
    if (import.meta.env?.DEV) {
      throw new Error(message);
    }
    console.error(`[scopeIsolation] ${message}`);
    if (mode === "write") {
      throw new Error(message);
    }
  }
}

/** Exact site match only. Bindings without a site never match an active site. */
export function bindingMatchesSite(row: unknown, siteName: string): boolean {
  const target = String(siteName ?? "").trim();
  if (!target) return true;
  const bindingSite = String((row as { site?: unknown })?.site ?? "").trim();
  if (!bindingSite) return false;
  return siteScopesMatch(bindingSite, target);
}

export function filterBindingsForSite<T extends { site?: unknown }>(rows: T[], siteName?: string): T[] {
  const active = String(siteName ?? readActiveSiteName()).trim();
  if (!active) return rows;
  return rows.filter((row) => bindingMatchesSite(row, active));
}
