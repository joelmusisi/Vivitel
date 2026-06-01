export interface RbacEnv {
  VIVI_D1: D1Database;
}

const RBAC_ROLES = "rbac_roles";
const RBAC_ROLE_PERMS = "rbac_role_permissions";
const RBAC_USERS = "rbac_users";
const RBAC_GROUPS = "rbac_security_groups";
const RBAC_GROUP_ROLES = "rbac_group_roles";
const RBAC_GROUP_USERS = "rbac_group_users";
const RBAC_ASSIGNMENTS = "rbac_assignments";
const GLOBAL_TENANT = "_global";

const corsHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*"
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders });

const badRequest = (message: string) => json({ error: message }, 400);
const notFound = () => json({ error: "Not found" }, 404);

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const toFlag = (value: unknown) => {
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? 1 : 0;
};

const parseRow = (row: { data: unknown }) => {
  try {
    return JSON.parse(String(row.data)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const listBindingsByType = async (env: RbacEnv, type: string, tenantId?: string) => {
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

const deleteBindings = async (
  env: RbacEnv,
  type: string,
  tenantId: string,
  filter: (row: Record<string, unknown>) => boolean
) => {
  const rows = await listBindingsByType(env, type, tenantId);
  for (const row of rows) {
    if (!filter(row)) continue;
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    await env.VIVI_D1.prepare("DELETE FROM bindings WHERE type = ?1 AND tenant_id = ?2 AND id = ?3")
      .bind(type, tenantId, id)
      .run();
  }
};

const listRoles = async (env: RbacEnv, tenantId: string) => {
  const rows = await listBindingsByType(env, RBAC_ROLES, tenantId);
  return rows
    .map((r) => ({
      id: String(r.roleId ?? r.id ?? "").trim(),
      name: String(r.name ?? "").trim(),
      description: String(r.description ?? "").trim(),
      status: String(r.status ?? "active").trim() || "active",
      createdAt: String(r.createdAt ?? "").trim(),
      updatedAt: String(r.updatedAt ?? "").trim()
    }))
    .filter((r) => r.id && r.name)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const listRolePermissions = async (env: RbacEnv, tenantId: string) => {
  const rows = await listBindingsByType(env, RBAC_ROLE_PERMS, tenantId);
  return rows
    .map((r) => ({
      roleId: String(r.roleId ?? "").trim(),
      pagePath: String(r.pagePath ?? "").trim(),
      canView: toFlag(r.canView),
      canEdit: toFlag(r.canEdit),
      canDelete: toFlag(r.canDelete)
    }))
    .filter((r) => r.roleId && r.pagePath);
};

const saveRole = async (
  env: RbacEnv,
  tenantId: string,
  roleId: string,
  payload: { name: string; description?: string; status?: string },
  createdAt?: string
) => {
  const now = new Date().toISOString();
  const storageId = `${tenantId}:${roleId}`;
  const rec = {
    id: storageId,
    roleId,
    tenantId,
    name: payload.name,
    description: payload.description ?? "",
    status: String(payload.status ?? "active").trim() || "active",
    createdAt: createdAt || now,
    updatedAt: now
  };
  await persistBinding(env, RBAC_ROLES, tenantId, storageId, rec);
  return rec;
};

const replaceRolePermissions = async (
  env: RbacEnv,
  tenantId: string,
  roleId: string,
  permissions: Array<{ pagePath: string; view?: boolean | number; edit?: boolean | number; delete?: boolean | number }>
) => {
  await deleteBindings(env, RBAC_ROLE_PERMS, tenantId, (r) => String(r.roleId ?? "").trim() === roleId);
  const now = new Date().toISOString();
  for (const p of permissions) {
    const pagePath = String(p.pagePath ?? "").trim();
    if (!pagePath) continue;
    const id = `${tenantId}:${roleId}:${pagePath}`;
    await persistBinding(env, RBAC_ROLE_PERMS, tenantId, id, {
      id,
      roleId,
      tenantId,
      pagePath,
      canView: toFlag(p.view),
      canEdit: toFlag(p.edit),
      canDelete: toFlag(p.delete),
      updatedAt: now
    });
  }
};

const listUsers = async (env: RbacEnv) => {
  const rows = await listBindingsByType(env, RBAC_USERS, GLOBAL_TENANT);
  return rows
    .map((r) => ({
      id: String(r.id ?? "").trim(),
      name: String(r.name ?? "").trim(),
      email: String(r.email ?? "").trim().toLowerCase(),
      status: String(r.status ?? "active").trim() || "active",
      createdAt: String(r.createdAt ?? "").trim(),
      updatedAt: String(r.updatedAt ?? "").trim(),
      assignedTenantId: String(r.assignedTenantId ?? "").trim(),
      assignedSiteId: String(r.assignedSiteId ?? "").trim(),
      assignedSiteName: String(r.assignedSiteName ?? "").trim(),
      assignedRoleId: String(r.assignedRoleId ?? "").trim()
    }))
    .filter((u) => u.id && u.email);
};

const saveUser = async (env: RbacEnv, rec: Record<string, unknown>) => {
  await persistBinding(env, RBAC_USERS, GLOBAL_TENANT, String(rec.id), rec);
};

const saveAssignment = async (
  env: RbacEnv,
  tenantId: string,
  userId: string,
  payload: { tenantAccess: boolean; roleIds: string[]; groupIds: string[] }
) => {
  const id = `${tenantId}:${userId}`;
  await persistBinding(env, RBAC_ASSIGNMENTS, tenantId, id, {
    id,
    tenantId,
    userId,
    tenantAccess: Boolean(payload.tenantAccess),
    roleIds: payload.roleIds.filter(Boolean),
    groupIds: payload.groupIds.filter(Boolean),
    updatedAt: new Date().toISOString()
  });
};

const listGroups = async (env: RbacEnv, tenantId: string) => {
  const rows = await listBindingsByType(env, RBAC_GROUPS, tenantId);
  return rows
    .map((r) => ({
      id: String(r.id ?? "").trim(),
      name: String(r.name ?? "").trim(),
      description: String(r.description ?? "").trim(),
      status: String(r.status ?? "active").trim() || "active",
      createdAt: String(r.createdAt ?? "").trim(),
      updatedAt: String(r.updatedAt ?? "").trim()
    }))
    .filter((g) => g.id && g.name)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const saveGroup = async (
  env: RbacEnv,
  tenantId: string,
  groupId: string,
  payload: { name: string; description?: string; status?: string },
  createdAt?: string
) => {
  const now = new Date().toISOString();
  const rec = {
    id: groupId,
    tenantId,
    name: payload.name,
    description: payload.description ?? "",
    status: String(payload.status ?? "active").trim() || "active",
    createdAt: createdAt || now,
    updatedAt: now
  };
  await persistBinding(env, RBAC_GROUPS, tenantId, groupId, rec);
  return rec;
};

const listGroupRoleLinks = async (env: RbacEnv, tenantId: string) => {
  const rows = await listBindingsByType(env, RBAC_GROUP_ROLES, tenantId);
  return rows
    .map((r) => ({
      groupId: String(r.groupId ?? "").trim(),
      roleId: String(r.roleId ?? "").trim()
    }))
    .filter((r) => r.groupId && r.roleId);
};

const listGroupUserLinks = async (env: RbacEnv, tenantId: string) => {
  const rows = await listBindingsByType(env, RBAC_GROUP_USERS, tenantId);
  return rows
    .map((r) => ({
      groupId: String(r.groupId ?? "").trim(),
      userId: String(r.userId ?? "").trim()
    }))
    .filter((r) => r.groupId && r.userId);
};

export async function handleRbacRequest(
  env: RbacEnv,
  request: Request,
  pathname: string,
  tenantId: string
): Promise<Response | null> {
  if (!pathname.startsWith("/rbac/")) return null;

  if (pathname === "/rbac/roles") {
    if (request.method === "GET") {
      const roles = await listRoles(env, tenantId);
      const permissions = await listRolePermissions(env, tenantId);
      return json({ roles, permissions, tenantId });
    }
    if (request.method === "POST" || request.method === "PUT") {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        const name = String(body.name ?? "").trim();
        const description = String(body.description ?? body.Level ?? "").trim();
        const status = String(body.status ?? "active").trim() || "active";
        const roleId = String(body.id ?? uuid()).trim();
        const permissions = Array.isArray(body.permissions) ? (body.permissions as unknown[]) : [];
        if (!name) return badRequest("Role name is required");

        const existing = (await listRoles(env, tenantId)).find((r) => r.id === roleId);
        if (request.method === "POST" && existing) {
          return json({ error: "Role already exists" }, 409);
        }
        if (request.method === "PUT" && !existing) {
          return notFound();
        }

        const created = await saveRole(
          env,
          tenantId,
          roleId,
          { name, description, status },
          existing?.createdAt
        );
        await replaceRolePermissions(
          env,
          tenantId,
          roleId,
          permissions.map((p) => {
            const item = p as Record<string, unknown>;
            return {
              pagePath: String(item.pagePath ?? ""),
              view: item.view ?? item.canView,
              edit: item.edit ?? item.canEdit,
              delete: item.delete ?? item.canDelete
            };
          })
        );
        return json({
          ok: true,
          role: {
            id: created.roleId,
            name: created.name,
            description: created.description,
            status: created.status,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt
          }
        });
      } catch {
        return badRequest("Invalid JSON body.");
      }
    }
    return badRequest("Unsupported method for /rbac/roles");
  }

  if (pathname === "/rbac/users") {
    if (request.method === "GET") {
      const users = await listUsers(env);
      const roleById = new Map<string, { name: string }>();
      const tenantIds = Array.from(new Set(users.map((u) => u.assignedTenantId).filter(Boolean)));
      for (const tid of tenantIds) {
        for (const role of await listRoles(env, tid)) {
          roleById.set(role.id, role);
        }
      }
      for (const role of await listRoles(env, tenantId)) {
        roleById.set(role.id, role);
      }
      const hydrated = users.map((u) => ({
        ...u,
        assignedRoleName: u.assignedRoleId ? roleById.get(u.assignedRoleId)?.name ?? u.assignedRoleId : ""
      }));
      return json({ users: hydrated });
    }
    if (request.method === "POST") {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        const name = String(body.name ?? "").trim();
        const email = String(body.email ?? "").trim().toLowerCase();
        const roleId = String(body.roleId ?? "").trim();
        const assignment = (body.assignment ?? {}) as Record<string, unknown>;
        const assignedTenantId = String(assignment.tenantId ?? tenantId).trim();
        if (!name) return badRequest("User name is required");
        if (!email) return badRequest("User email is required");
        if (!roleId) return badRequest("roleId is required");

        const existing = (await listUsers(env)).find((u) => u.email === email);
        if (existing) return json({ error: "User already exists" }, 409);

        const now = new Date().toISOString();
        const id = String(body.id ?? uuid()).trim() || uuid();
        const rec = {
          id,
          name,
          email,
          status: String(body.status ?? "active").trim() || "active",
          createdAt: now,
          updatedAt: now,
          assignedTenantId,
          assignedSiteId: String(assignment.siteId ?? "").trim(),
          assignedSiteName: String(assignment.siteName ?? "").trim(),
          assignedRoleId: roleId
        };
        await saveUser(env, rec);
        await saveAssignment(env, assignedTenantId, id, {
          tenantAccess: true,
          roleIds: [roleId],
          groupIds: []
        });
        return json({ ok: true, user: rec });
      } catch {
        return badRequest("Invalid JSON body.");
      }
    }
    if (request.method === "PUT") {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        const id = String(body.id ?? "").trim();
        if (!id) return badRequest("User id is required");
        const existing = (await listUsers(env)).find((u) => u.id === id);
        if (!existing) return notFound();

        const roleId = String(body.roleId ?? body.assignedRoleId ?? existing.assignedRoleId).trim();
        const now = new Date().toISOString();
        const rec = {
          ...existing,
          name: String(body.name ?? existing.name).trim() || existing.name,
          email: String(body.email ?? existing.email).trim().toLowerCase() || existing.email,
          status: String(body.status ?? existing.status).trim() || existing.status,
          assignedRoleId: roleId,
          updatedAt: now
        };
        await saveUser(env, rec);
        if (existing.assignedTenantId) {
          await saveAssignment(env, existing.assignedTenantId, id, {
            tenantAccess: true,
            roleIds: roleId ? [roleId] : [],
            groupIds: []
          });
        }
        return json({ ok: true, user: rec });
      } catch {
        return badRequest("Invalid JSON body.");
      }
    }
    return badRequest("Unsupported method for /rbac/users");
  }

  if (pathname === "/rbac/security-groups") {
    if (request.method === "GET") {
      const groups = await listGroups(env, tenantId);
      const groupRoles = await listGroupRoleLinks(env, tenantId);
      const groupUsers = await listGroupUserLinks(env, tenantId);
      const enriched = groups.map((g) => ({
        ...g,
        memberCount: groupUsers.filter((l) => l.groupId === g.id).length,
        roleCount: groupRoles.filter((l) => l.groupId === g.id).length
      }));
      return json({ groups: enriched, groupRoles, groupUsers, tenantId });
    }
    if (request.method === "POST" || request.method === "PUT") {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        const id = String(body.id ?? uuid()).trim();
        const name = String(body.name ?? "").trim();
        const description = String(body.description ?? body.Notes ?? body.Owner ?? "").trim();
        const status = String(body.status ?? "active").trim() || "active";
        if (!name) return badRequest("Group name is required");

        const existing = (await listGroups(env, tenantId)).find((g) => g.id === id);
        if (request.method === "POST" && existing) {
          return json({ error: "Security group already exists" }, 409);
        }
        if (request.method === "PUT" && !existing) {
          return notFound();
        }

        const saved = await saveGroup(
          env,
          tenantId,
          id,
          { name, description, status },
          existing?.createdAt
        );
        return json({ ok: true, group: saved });
      } catch {
        return badRequest("Invalid JSON body.");
      }
    }
    return badRequest("Unsupported method for /rbac/security-groups");
  }

  return null;
}
