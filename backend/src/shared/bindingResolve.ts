/**
 * Site-exact binding resolution for compile / commission.
 * Mirrors frontend/src/utils/bindingResolve.ts — no cross-site fallbacks.
 */

const normalize = (value: string) => String(value ?? "").trim().toLowerCase();

const slug = (value: string) =>
  normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const siteScopeToken = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export function sitesEquivalent(bindingSite: string, targetSite: string): boolean {
  const target = String(targetSite ?? "").trim();
  const binding = String(bindingSite ?? "").trim();
  if (!target || !binding) return false;
  const a = siteScopeToken(binding);
  const b = siteScopeToken(target);
  return Boolean(a) && a === b;
}

export function bindingRowMatchesRef(row: { id?: string; name?: string }, ref: string): boolean {
  const needle = String(ref ?? "").trim();
  if (!needle) return false;
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  const key = normalize(needle);
  if (normalize(id) === key || normalize(name) === key) return true;

  const refSlug = slug(needle);
  if (!refSlug) return false;
  if (slug(name) === refSlug) return true;
  if (slug(id) === refSlug) return true;
  if (id.includes(":") && slug(id).endsWith(`:${refSlug}`)) return true;
  return false;
}

export function resolveBindingByRef<T extends { id?: string; name?: string; site?: string }>(
  bindings: T[],
  ref: string,
  site: string
): T | null {
  const needle = String(ref ?? "").trim();
  if (!needle) return null;

  const candidates = bindings.filter((row) => bindingRowMatchesRef(row, needle));
  if (!candidates.length) return null;

  const targetSite = String(site ?? "").trim();
  if (!targetSite) return null;

  const exactSite = candidates.filter((row) => sitesEquivalent(String(row.site ?? ""), targetSite));
  if (exactSite.length >= 1) return exactSite[0];
  return null;
}

export function deviceBindingNeedsLocation(deviceBinding: Record<string, unknown> | null | undefined): boolean {
  if (!deviceBinding) return false;
  if (deviceBinding.locationSpeedMonitoring === true) return true;
  const advanced = deviceBinding.advancedSettings;
  if (advanced && typeof advanced === "object" && !Array.isArray(advanced)) {
    return (advanced as Record<string, unknown>).locationSpeedMonitoring === true;
  }
  return false;
}
