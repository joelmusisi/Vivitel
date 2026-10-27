/**
 * `rbac_users` (login identity + password hash) stays in Cloudflare D1, while role,
 * permission and assignment tables live on the VPS. SQL cannot join across the two,
 * so callers read assignments from the VPS and then look users up here by id.
 * Never selects `password_hash`.
 */

type DirectoryStatement = {
  bind(...values: unknown[]): DirectoryStatement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
};
type DirectoryDb = { prepare(sql: string): DirectoryStatement };

export type RbacUserRecord = {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  createdByUserId: string | null;
};

const BASIC_COLUMNS = "id, name, email, status, created_at AS createdAt, updated_at AS updatedAt";
const FULL_COLUMNS = `${BASIC_COLUMNS}, last_login_at AS lastLoginAt, created_by_user_id AS createdByUserId`;
const IDS_PER_QUERY = 50;

function toRecord(row: Record<string, unknown>): RbacUserRecord {
  const text = (value: unknown) => (value == null ? "" : String(value));
  return {
    id: text(row.id),
    name: text(row.name),
    email: text(row.email),
    status: text(row.status),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    lastLoginAt: row.lastLoginAt == null ? null : String(row.lastLoginAt),
    createdByUserId: row.createdByUserId == null ? null : String(row.createdByUserId)
  };
}

/** Users with the given ids. `full` adds last_login_at and created_by_user_id. */
export async function readRbacUsersByIds(
  db: DirectoryDb,
  ids: Iterable<unknown>,
  options: { full?: boolean } = {}
): Promise<Map<string, RbacUserRecord>> {
  const unique = [...new Set([...ids].map((id) => String(id ?? "").trim()).filter(Boolean))];
  const byId = new Map<string, RbacUserRecord>();
  const columns = options.full ? FULL_COLUMNS : BASIC_COLUMNS;
  for (let offset = 0; offset < unique.length; offset += IDS_PER_QUERY) {
    const chunk = unique.slice(offset, offset + IDS_PER_QUERY);
    const result = await db
      .prepare(`SELECT ${columns} FROM rbac_users WHERE id IN (${chunk.map(() => "?").join(", ")})`)
      .bind(...chunk)
      .all<Record<string, unknown>>();
    for (const row of result.results ?? []) {
      const record = toRecord(row);
      if (record.id) byId.set(record.id, record);
    }
  }
  return byId;
}

/** Every user (the table is small: one row per login). */
export async function listAllRbacUsers(db: DirectoryDb, options: { full?: boolean } = {}): Promise<RbacUserRecord[]> {
  const result = await db
    .prepare(`SELECT ${options.full ? FULL_COLUMNS : BASIC_COLUMNS} FROM rbac_users`)
    .all<Record<string, unknown>>();
  return (result.results ?? []).map(toRecord).filter((user) => user.id);
}

export const isActiveRbacUser = (user: Pick<RbacUserRecord, "status">) =>
  String(user.status || "active").trim().toLowerCase() === "active";

/** Same order as SQLite's default BINARY collation. */
export const compareSqliteText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type SupportDeskRoleHolder = { id: string; name: string; email: string; standardRoleKey: string; roleName: string };

/** Active users holding Admin / Own Support (directly or via a security group), ordered by name. */
export async function readSupportDeskRoleHolders(db: DirectoryDb): Promise<{ results: SupportDeskRoleHolder[] }> {
  const assigned = await db
    .prepare(
      `SELECT assigned.user_id AS userId,
              COALESCE(rr.standard_role_key, '') AS standardRoleKey,
              COALESCE(rr.name, '') AS roleName
       FROM (
         SELECT ur.user_id AS user_id, ur.role_id AS role_id, ur.tenant_id AS tenant_id
         FROM rbac_user_roles ur
         UNION
         SELECT ug.user_id AS user_id, gr.role_id AS role_id, ug.tenant_id AS tenant_id
         FROM rbac_user_groups ug
         INNER JOIN rbac_group_roles gr
           ON gr.group_id = ug.group_id
          AND (gr.tenant_id = ug.tenant_id OR gr.tenant_id = '' OR ug.tenant_id = '')
       ) assigned
       INNER JOIN rbac_roles rr
         ON rr.id = assigned.role_id
       WHERE lower(trim(COALESCE(rr.standard_role_key, ''))) IN ('admin', 'own-support')
          OR lower(trim(COALESCE(rr.name, ''))) IN ('admin', 'own support', 'tenant admin', 'administrator')`
    )
    .all<{ userId: string; standardRoleKey: string; roleName: string }>();
  const rows = assigned.results ?? [];
  const users = await readRbacUsersByIds(db, rows.map((row) => row.userId));
  const results = rows.flatMap((row) => {
    const user = users.get(String(row.userId ?? ""));
    if (!user || String(user.status || "active").trim().toLowerCase() !== "active") return [];
    return [{ id: user.id, name: user.name, email: user.email, standardRoleKey: row.standardRoleKey, roleName: row.roleName }];
  });
  return { results: results.sort((a, b) => compareSqliteText(a.name, b.name)) };
}
