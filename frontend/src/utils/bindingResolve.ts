import { siteScopesMatch } from "./scopeIsolation";

const normalize = (value: string) => String(value ?? "").trim().toLowerCase();

const slug = (value: string) =>
  normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const matchesRefToken = (ref: string, candidates: string[]) => {
  const key = normalize(ref);
  if (!key) return false;
  return candidates.some((candidate) => normalize(candidate) === key);
};

/** Exact site-scope match only — no substring / cross-site fallbacks. */
export function sitesEquivalent(bindingSite: string, targetSite: string): boolean {
  const target = String(targetSite ?? "").trim();
  const binding = String(bindingSite ?? "").trim();
  if (!target || !binding) return false;
  return siteScopesMatch(binding, target);
}

export function bindingRowMatchesRef(
  row: { id?: string; name?: string },
  ref: string
): boolean {
  const needle = String(ref ?? "").trim();
  if (!needle) return false;
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  if (matchesRefToken(needle, [id, name])) return true;

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

  // Exact site match only — never resolve another site's binding or an unscoped row.
  const exactSite = candidates.filter((row) =>
    sitesEquivalent(String(row.site ?? ""), targetSite)
  );
  if (exactSite.length >= 1) return exactSite[0];

  return null;
}

export function formatBindingsHintForSite<T extends { name?: string; site?: string }>(
  bindings: T[],
  ref: string,
  site: string
): string {
  const needle = String(ref ?? "").trim();
  const targetSite = String(site ?? "").trim();
  const byRef = bindings.filter((row) => bindingRowMatchesRef(row, needle));
  if (byRef.length) {
    const sites = [...new Set(byRef.map((row) => String(row.site ?? "").trim() || "(no site)"))];
    return ` "${needle}" exists for site(s): ${sites.join(", ")}. Open Manage → Bindings and save it for "${targetSite}".`;
  }
  const forSite = bindings.filter((row) => sitesEquivalent(String(row.site ?? ""), targetSite));
  const names = forSite.map((row) => String(row.name ?? "").trim()).filter(Boolean);
  if (names.length) return ` Available for ${targetSite}: ${names.slice(0, 8).join(", ")}.`;
  const any = bindings.map((row) => String(row.name ?? "").trim()).filter(Boolean);
  if (any.length) return ` Available in this database: ${any.slice(0, 8).join(", ")}.`;
  return " Open Manage → Bindings and save the notification binding for this site.";
}
