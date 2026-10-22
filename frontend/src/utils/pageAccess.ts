export type PageAccessRow = { pagePath: string; view: boolean; edit: boolean; delete: boolean };
export type PageAccessMode = "allow-all" | "deny-by-default" | "not-loaded";

const USER_ADMIN_BASES = [
  "/Control/user-admin/users",
  "/Control/user-admin/roles",
  "/Control/user-admin/security-groups"
];

const VIDEO_DASHBOARD = "/Track/videos/dashboard";
const VIDEO_SUBPAGES = [
  "/Track/videos/video-gallery",
  "/Track/videos/live-video-streaming",
  "/Track/videos/device-remote-actions"
];

/** Map nested editor/sub-routes onto the page that is actually listed in role permissions. */
export const rbacCanonicalPath = (pagePath: string) => {
  const p = String(pagePath ?? "").trim();
  for (const base of USER_ADMIN_BASES) {
    if (p === base || p.startsWith(`${base}/`)) return base;
  }
  if (VIDEO_SUBPAGES.includes(p)) return VIDEO_DASHBOARD;
  return p;
};

export const rbacPathAliases = (pagePath: string) => {
  const p = rbacCanonicalPath(pagePath);
  if (!p) return [] as string[];
  const aliases = [p];
  if (p.startsWith("/Track/routes/")) aliases.push(p.replace("/Track/routes/", "/Track/journey/"));
  if (p.startsWith("/Track/journey/")) aliases.push(p.replace("/Track/journey/", "/Track/routes/"));
  return aliases;
};

const permissionMap = (rows: PageAccessRow[]) => {
  const map = new Map<string, PageAccessRow>();
  for (const row of rows) {
    const pagePath = String(row?.pagePath ?? "").trim();
    if (!pagePath) continue;
    if (!row.view && !row.edit && !row.delete) continue;
    map.set(pagePath, row);
    map.set(pagePath.toLowerCase(), row);
  }
  return map;
};

export const roleNamesFromPrincipal = (principal: {
  roleNames?: unknown;
  isTenantAdmin?: unknown;
  isOwnSupport?: unknown;
  isDealerSupport?: unknown;
  isAdvanced?: unknown;
} | null | undefined) => {
  const names = new Set<string>();
  const raw = Array.isArray(principal?.roleNames) ? principal.roleNames : [];
  for (const value of raw) {
    const name = String(value ?? "").trim();
    if (name) names.add(name);
  }
  if (names.size > 0) return Array.from(names);
  if (principal?.isTenantAdmin) names.add("Admin");
  else if (principal?.isOwnSupport) names.add("Own Support");
  else if (principal?.isDealerSupport) names.add("Dealer Support");
  else if (principal?.isAdvanced) names.add("Advanced User");
  return Array.from(names);
};

/**
 * Deny-by-default page access.
 * Rights are the union of pages checked on the account's roles and on roles
 * attached to its security groups. A role name does not add pages.
 * Only the platform admin session (kind === "admin") is unrestricted.
 */
export const canAccessPage = (input: {
  pagePath: string;
  action: "view" | "edit" | "delete";
  principalKind?: string;
  impersonating?: boolean;
  mode: PageAccessMode;
  loaded: boolean;
  rows: PageAccessRow[];
  roleNames?: string[];
}) => {
  const p = rbacCanonicalPath(input.pagePath);
  if (!p) return false;
  if (p === "/") return input.action === "view";

  const principalKind = String(input.principalKind ?? "").trim().toLowerCase();
  const impersonating = Boolean(input.impersonating);
  // Impersonation must follow the target account's role matrix, never the investigator's allow-all session.
  if (!impersonating && principalKind === "admin") return true;
  if (!input.loaded || input.mode === "not-loaded") return false;

  const map = permissionMap(input.rows);
  const row = rbacPathAliases(p)
    .map((alias) => map.get(alias) ?? map.get(alias.toLowerCase()))
    .find(Boolean);
  if (!row) return false;
  if (input.action === "view") return Boolean(row.view);
  if (input.action === "edit") return Boolean(row.edit);
  return Boolean(row.delete);
};
