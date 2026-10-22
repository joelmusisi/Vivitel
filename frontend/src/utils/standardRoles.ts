export type StandardRoleKey = "admin" | "own-support" | "dealer-support" | "database-support" | "advanced-user" | "basic-user";

export type StandardRoleInfo = {
  key: StandardRoleKey;
  name: string;
  description: string;
  roleLevel: number;
};

export const STANDARD_ROLES: StandardRoleInfo[] = [
  {
    key: "admin",
    name: "Admin",
    description: "Full organisation control (create/edit/assign/delete). Can manage dealers and databases without delete, plus sites and assets.",
    roleLevel: 0
  },
  {
    key: "own-support",
    name: "Own Support",
    description: "Sees dealers, databases, and any number of sites and assets. Organisations are hidden and Admin-only.",
    roleLevel: 10
  },
  {
    key: "dealer-support",
    name: "Dealer Support",
    description: "Sees assigned dealers, sites, and assets only. Databases and organisations are hidden.",
    roleLevel: 20
  },
  {
    key: "database-support",
    name: "Database Support",
    description: "Access to exactly one assigned database, with its sites and assets. Nothing above or outside that database is visible.",
    roleLevel: 30
  },
  {
    key: "advanced-user",
    name: "Advanced User",
    description: "End user with access to sites and assets only.",
    roleLevel: 50
  },
  {
    key: "basic-user",
    name: "Basic User",
    description: "End user with access to a single site and its assets.",
    roleLevel: 100
  }
];

export const STANDARD_ROLE_NAMES = STANDARD_ROLES.map((role) => role.name);

export const isStandardRoleName = (value: string) =>
  STANDARD_ROLE_NAMES.some((name) => name.toLowerCase() === String(value ?? "").trim().toLowerCase());

const looksLikeRoleId = (value: string) => {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const compact = text.replace(/[\s-]/g, "");
  return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(text) || /^[0-9a-f]{32}$/i.test(compact);
};

/** Human-readable role title. Never returns a raw database id. */
export function roleDisplayName(role: { name?: string; standardRoleKey?: string } | null | undefined): string {
  const name = String(role?.name ?? "").trim();
  const key = String(role?.standardRoleKey ?? "").trim().toLowerCase();
  const fromKey = STANDARD_ROLES.find((row) => row.key === key)?.name ?? "";
  if (name && !looksLikeRoleId(name)) return name;
  return fromKey;
}

export const standardRoleDescription = (name: string) =>
  STANDARD_ROLES.find((role) => role.name.toLowerCase() === String(name ?? "").trim().toLowerCase())?.description ?? "";

export const sortRolesByPrivilege = <T extends { name?: string; roleLevel?: number }>(roles: T[]) =>
  [...roles].sort((a, b) => {
    const levelDelta = (Number(a.roleLevel ?? 100) || 100) - (Number(b.roleLevel ?? 100) || 100);
    if (levelDelta !== 0) return levelDelta;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });

export type RbacRolePickerRow = {
  id: string;
  name: string;
  description?: string;
  status: string;
  roleLevel?: number;
  isSystem?: boolean;
  standardRoleKey?: string;
};

const normalizeRoleNameKey = (value: string) => String(value ?? "").trim().toLowerCase();

/** Merge API roles only — do not invent catalog roles the API hid from this actor. */
export function buildUserRolePickerOptions(apiRoles: RbacRolePickerRow[]): RbacRolePickerRow[] {
  const byName = new Map<string, RbacRolePickerRow>();
  for (const role of apiRoles) {
    const name = String(role.name ?? "").trim();
    if (!name) continue;
    byName.set(normalizeRoleNameKey(name), role);
  }
  return sortRolesByPrivilege(Array.from(byName.values()));
}

/** Roles end users are usually assigned (excludes platform-only support roles when narrowing). */
export const END_USER_ASSIGNABLE_ROLE_NAMES = ["Advanced User", "Basic User"] as const;
