export interface RbacEnv {
  VIVI_D1: D1Database;
}

const RBAC_USER_SCOPES = "rbac_user_scopes";
const RBAC_ROLES = "rbac_roles";
const RBAC_ROLE_PERMS = "rbac_role_permissions";
const RBAC_USERS = "rbac_users";
const RBAC_ASSIGNMENTS = "rbac_assignments";
const RBAC_GROUP_USERS = "rbac_group_users";
const RBAC_GROUP_ROLES = "rbac_group_roles";
const GLOBAL_TENANT = "_global";

export type UserScopes = {
  userId: string;
  allowAll?: boolean;
  dealerIds: string[];
  orgIds: string[];
  databaseIds: string[];
  siteIds: string[];
  updatedAt?: string;
};

export type PagePermission = {
  pagePath: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const corsHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*"
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders });

const badRequest = (message: string) => json({ error: message }, 400);

const parseRow = (row: { data: unknown }) => {
  try {
    return JSON.parse(String(row.data)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const listBindings = async (env: RbacEnv, type: string, tenantId?: string) => {
  const query = tenantId
    ? "SELECT data FROM bindings WHERE type = ?1 AND tenant_id = ?2"
    : "SELECT data FROM bindings WHERE type = ?1";
  const stmt = tenantId
    ? env.VIVI_D1.prepare(query).bind(type, tenantId)
    : env.VIVI_D1.prepare(query).bind(type);
  const result = await stmt.all();
  return (result.results ?? []).map(parseRow).filter(Boolean) as Record<string, unknown>[];
};

const persistBinding = async (
  env: RbacEnv,
  type: string,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) => {
  const now = new Date().toISOString();
  await env.VIVI_D1.prepare(
    "INSERT INTO bindings (id, tenant_id, type, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id, tenant_id, type) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  )
    .bind(id, tenantId, type, JSON.stringify(data), now)
    .run();
};

const listUsers = async (env: RbacEnv) => {
  const rows = await listBindings(env, RBAC_USERS, GLOBAL_TENANT);
  return rows
    .map((r) => ({
      id: String(r.id ?? "").trim(),
      email: String(r.email ?? "").trim().toLowerCase(),
      name: String(r.name ?? "").trim(),
      assignedRoleId: String(r.assignedRoleId ?? "").trim(),
      assignedTenantId: String(r.assignedTenantId ?? "").trim(),
      status: String(r.status ?? "active").trim()
    }))
    .filter((u) => u.id);
};

const listRolesForTenant = async (env: RbacEnv, tenantId: string) => {
  const rows = await listBindings(env, RBAC_ROLES, tenantId);
  return rows
    .map((r) => ({
      id: String(r.roleId ?? "").trim(),
      name: String(r.name ?? "").trim()
    }))
    .filter((r) => r.id);
};

const listRolePerms = async (env: RbacEnv, tenantId: string) => {
  const rows = await listBindings(env, RBAC_ROLE_PERMS, tenantId);
  return rows.map((r) => ({
    roleId: String(r.roleId ?? "").trim(),
    pagePath: String(r.pagePath ?? "").trim(),
    canView: Number(r.canView ?? 0) > 0,
    canEdit: Number(r.canEdit ?? 0) > 0,
    canDelete: Number(r.canDelete ?? 0) > 0
  }));
};

const listAssignments = async (env: RbacEnv, tenantId: string) => {
  const rows = await listBindings(env, RBAC_ASSIGNMENTS, tenantId);
  return rows.map((r) => ({
    userId: String(r.userId ?? "").trim(),
    roleIds: Array.isArray(r.roleIds) ? (r.roleIds as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [],
    groupIds: Array.isArray(r.groupIds) ? (r.groupIds as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean) : []
  }));
};

const listGroupRoleLinks = async (env: RbacEnv, tenantId: string) => {
  const rows = await listBindings(env, RBAC_GROUP_ROLES, tenantId);
  return rows.map((r) => ({
    groupId: String(r.groupId ?? "").trim(),
    roleId: String(r.roleId ?? "").trim()
  }));
};

const listGroupUserLinks = async (env: RbacEnv, tenantId: string) => {
  const rows = await listBindings(env, RBAC_GROUP_USERS, tenantId);
  return rows.map((r) => ({
    groupId: String(r.groupId ?? "").trim(),
    userId: String(r.userId ?? "").trim()
  }));
};

export const getUserScopes = async (env: RbacEnv, userId: string): Promise<UserScopes> => {
  const rows = await listBindings(env, RBAC_USER_SCOPES, GLOBAL_TENANT);
  const rec = rows.find((r) => String(r.userId ?? r.id ?? "").trim() === userId);
  if (!rec) {
    return { userId, dealerIds: [], orgIds: [], databaseIds: [], siteIds: [] };
  }
  return {
    userId,
    allowAll: Boolean(rec.allowAll),
    dealerIds: Array.isArray(rec.dealerIds) ? (rec.dealerIds as string[]).map(String) : [],
    orgIds: Array.isArray(rec.orgIds) ? (rec.orgIds as string[]).map(String) : [],
    databaseIds: Array.isArray(rec.databaseIds) ? (rec.databaseIds as string[]).map(String) : [],
    siteIds: Array.isArray(rec.siteIds) ? (rec.siteIds as string[]).map(String) : [],
    updatedAt: String(rec.updatedAt ?? "")
  };
};

export const saveUserScopes = async (env: RbacEnv, scopes: UserScopes) => {
  const rec = {
    id: scopes.userId,
    userId: scopes.userId,
    allowAll: Boolean(scopes.allowAll),
    dealerIds: scopes.dealerIds ?? [],
    orgIds: scopes.orgIds ?? [],
    databaseIds: scopes.databaseIds ?? [],
    siteIds: scopes.siteIds ?? [],
    updatedAt: new Date().toISOString()
  };
  await persistBinding(env, RBAC_USER_SCOPES, GLOBAL_TENANT, scopes.userId, rec);
  return rec;
};

const mergePermissions = (rows: PagePermission[]) => {
  const byPath = new Map<string, PagePermission>();
  for (const row of rows) {
    if (!row.pagePath) continue;
    const existing = byPath.get(row.pagePath);
    if (!existing) {
      byPath.set(row.pagePath, { ...row });
      continue;
    }
    byPath.set(row.pagePath, {
      pagePath: row.pagePath,
      canView: existing.canView || row.canView,
      canEdit: existing.canEdit || row.canEdit,
      canDelete: existing.canDelete || row.canDelete
    });
  }
  return Array.from(byPath.values());
};

const permissionsForRoles = async (env: RbacEnv, tenantId: string, roleIds: string[]) => {
  const perms = await listRolePerms(env, tenantId);
  const rows: PagePermission[] = [];
  for (const roleId of roleIds) {
    for (const p of perms.filter((x) => x.roleId === roleId)) {
      rows.push({
        pagePath: p.pagePath,
        canView: p.canView,
        canEdit: p.canEdit,
        canDelete: p.canDelete
      });
    }
  }
  return mergePermissions(rows);
};

export const buildAccessProfile = async (env: RbacEnv, userId: string, tenantId: string) => {
  const users = await listUsers(env);
  const user = users.find((u) => u.id === userId);
  if (!user) return null;

  const scopes = await getUserScopes(env, userId);
  const tenantIds = Array.from(
    new Set([tenantId, user.assignedTenantId].map((t) => String(t ?? "").trim()).filter(Boolean))
  );

  const roleIdSet = new Set<string>();
  if (user.assignedRoleId) roleIdSet.add(user.assignedRoleId);

  for (const tid of tenantIds) {
    const assignment = (await listAssignments(env, tid)).find((a) => a.userId === userId);
    if (assignment) {
      assignment.roleIds.forEach((id) => roleIdSet.add(id));
      const groupRoles = await listGroupRoleLinks(env, tid);
      const groupUsers = await listGroupUserLinks(env, tid);
      const groupIds = new Set(assignment.groupIds);
      for (const link of groupUsers.filter((l) => l.userId === userId)) {
        groupIds.add(link.groupId);
      }
      for (const link of groupRoles.filter((l) => groupIds.has(l.groupId))) {
        roleIdSet.add(link.roleId);
      }
    }
  }

  let pagePermissions: PagePermission[] = [];
  if (scopes.allowAll || user.email === "admin@vivi.co" || user.email === "admin@local") {
    pagePermissions = [];
  } else {
    for (const tid of tenantIds.length ? tenantIds : [tenantId]) {
      const part = await permissionsForRoles(env, tid, Array.from(roleIdSet));
      pagePermissions = mergePermissions([...pagePermissions, ...part]);
    }
  }

  const allowedPagePaths = scopes.allowAll
    ? []
    : pagePermissions.filter((p) => p.canView).map((p) => p.pagePath);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.assignedTenantId || tenantId,
    allowAll: scopes.allowAll || user.email === "admin@vivi.co" || user.email === "admin@local",
    scopes: {
      dealerIds: scopes.dealerIds,
      orgIds: scopes.orgIds,
      databaseIds: scopes.databaseIds,
      siteIds: scopes.siteIds
    },
    roleIds: Array.from(roleIdSet),
    pagePermissions,
    allowedPagePaths,
    denyByDefault: true
  };
};

export const tenantAllowed = (tenantId: string, scopes: UserScopes, allowAll: boolean) => {
  if (allowAll) return true;
  const parts = tenantId.split(":").filter(Boolean);
  if (!parts.length) return false;
  const [dealerId, orgId, dbId, siteId] = parts;
  if (siteId && scopes.siteIds.includes(siteId)) return true;
  if (dbId && scopes.databaseIds.includes(dbId)) return true;
  if (orgId && scopes.orgIds.includes(orgId)) return true;
  if (dealerId && scopes.dealerIds.includes(dealerId)) return true;
  return false;
};

export async function handleRbacAccessRequest(
  env: RbacEnv,
  request: Request,
  pathname: string,
  tenantId: string
): Promise<Response | null> {
  if (pathname === "/rbac/me") {
    if (request.method !== "GET") return badRequest("Use GET for /rbac/me");
    const url = new URL(request.url);
    const userId =
      url.searchParams.get("userId")?.trim() ||
      request.headers.get("x-user-id")?.trim() ||
      "";
    if (!userId) return badRequest("userId is required (query or x-user-id header)");
    const profile = await buildAccessProfile(env, userId, tenantId);
    if (!profile) return json({ error: "User not found" }, 404);
    return json({ profile });
  }

  if (pathname === "/rbac/user-scopes") {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const userId = url.searchParams.get("userId")?.trim() ?? "";
      if (!userId) return badRequest("userId is required");
      const scopes = await getUserScopes(env, userId);
      return json({ scopes });
    }
    if (request.method === "PUT") {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        const userId = String(body.userId ?? "").trim();
        if (!userId) return badRequest("userId is required");
        const scopes: UserScopes = {
          userId,
          allowAll: Boolean(body.allowAll),
          dealerIds: Array.isArray(body.dealerIds) ? (body.dealerIds as string[]) : [],
          orgIds: Array.isArray(body.orgIds) ? (body.orgIds as string[]) : [],
          databaseIds: Array.isArray(body.databaseIds) ? (body.databaseIds as string[]) : [],
          siteIds: Array.isArray(body.siteIds) ? (body.siteIds as string[]) : []
        };
        const saved = await saveUserScopes(env, scopes);
        return json({ ok: true, scopes: saved });
      } catch {
        return badRequest("Invalid JSON body.");
      }
    }
    return badRequest("Unsupported method for /rbac/user-scopes");
  }

  if (pathname === "/rbac/validate-tenant") {
    if (request.method !== "GET") return badRequest("Use GET");
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId")?.trim() ?? "";
    const checkTenant = url.searchParams.get("tenantId")?.trim() ?? tenantId;
    if (!userId) return badRequest("userId is required");
    const profile = await buildAccessProfile(env, userId, tenantId);
    if (!profile) return json({ allowed: false, reason: "user_not_found" });
    const allowed = tenantAllowed(checkTenant, profile.scopes as UserScopes, profile.allowAll);
    return json({ allowed, tenantId: checkTenant, userId });
  }

  return null;
}
