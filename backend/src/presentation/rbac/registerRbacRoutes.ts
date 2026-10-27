import type { Express } from "express";

interface RegisterRbacRoutesDeps {
  app: Express;
  requireApiKey: (req: any, res: any) => boolean;
  readTenant: (req: any) => { raw: string; tenant: string };
  listRbacRolesForTenant: (tenantId: string) => any[];
  listRbacRolePermsForTenant: (tenantId: string) => any[];
  saveRbacRole: (tenantId: string, roleId: string, patch: any, createdAt?: string) => any;
  replaceRbacRolePermissions: (tenantId: string, roleId: string, permissions: any[]) => void;
  listRbacUsers: () => any[];
  listRbacUsersForTenant: (tenantId: string) => any[];
  listAssignedTenantIdsForUser?: (userId: string) => string[];
  applyUserScopeAssignment?: (input: {
    userId: string;
    roleId?: string;
    roleName?: string;
    tenantIds: string[];
    siteAssignments?: Array<{ tenantId?: string; siteId?: string; siteName?: string }>;
    keepGroupIdsForTenant?: string;
  }) => void;
  userBelongsToTenant: (userId: string, tenantId: string) => boolean;
  persistBindingToDb: (type: string, record: any) => void;
  rbacUsersBindingType: string;
  saveRoleAssignmentForTenant: (tenantId: string, userId: string, value: any) => void;
  sendRbacInviteEmail: (req: any, payload: { email: string; name: string }) => Promise<any>;
  cryptoRandom: () => string;
  listRbacGroupsForTenant: (tenantId: string) => any[];
  listGroupRoleLinksForTenant: (tenantId: string) => any[];
  listGroupUserLinksForTenant: (tenantId: string) => any[];
  saveRbacGroup: (tenantId: string, groupId: string, patch: any, createdAt?: string) => any;
  replaceGroupLinksForTenant: (tenantId: string, groupId: string, roleIds: string[], userIds: string[]) => void;
  listRoleAssignmentsForTenant: (tenantId: string) => any[];
  valkeyDel?: (...keys: string[]) => Promise<void>;
}

const RBAC_USERS_CACHE_KEY = "vivi:auth:rbac-users";
const rbacUsersCacheKeyForTenant = (tenantId: string) =>
  `vivi:auth:rbac-users:${encodeURIComponent(String(tenantId ?? "").trim())}`;

const uniqueIds = (values: Array<string | undefined | null>) =>
  Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));

type AssignmentSite = { tenantId: string; siteId: string; siteName?: string };

const normalizeAssignmentFromBody = (
  body: any,
  fallbackTenantId: string
): {
  tenantIds: string[];
  assignedTenantId: string;
  assignedSiteId: string;
  assignedSiteName: string;
  siteAssignments: AssignmentSite[];
} => {
  const assignment = (body ?? {}).assignment ?? {};
  const siteAssignments: AssignmentSite[] = Array.isArray(assignment?.siteAssignments)
    ? assignment.siteAssignments
        .map((row: any) => ({
          tenantId: String(row?.tenantId ?? "").trim(),
          siteId: String(row?.siteId ?? "").trim(),
          siteName: String(row?.siteName ?? "").trim()
        }))
        .filter((row: AssignmentSite) => row.tenantId && row.siteId)
    : [];
  const firstSite = siteAssignments[0] ?? null;
  const assignedSiteId = String(assignment?.siteId ?? firstSite?.siteId ?? "").trim();
  const assignedSiteName = String(assignment?.siteName ?? firstSite?.siteName ?? "").trim();
  const tenantIds = uniqueIds([
    assignment?.tenantId,
    ...(Array.isArray(assignment?.tenantIds) ? assignment.tenantIds : []),
    ...siteAssignments.map((row: { tenantId: string }) => row.tenantId)
  ]);
  if (!tenantIds.length && fallbackTenantId) tenantIds.push(fallbackTenantId);
  if (assignedSiteId && tenantIds[0] && !siteAssignments.some((row: { siteId: string }) => row.siteId === assignedSiteId)) {
    siteAssignments.unshift({ tenantId: String(assignment?.tenantId ?? tenantIds[0]).trim(), siteId: assignedSiteId, siteName: assignedSiteName });
  }
  return {
    tenantIds,
    assignedTenantId: tenantIds[0] || fallbackTenantId,
    assignedSiteId: siteAssignments[0]?.siteId || assignedSiteId,
    assignedSiteName: siteAssignments[0]?.siteName || assignedSiteName,
    siteAssignments
  };
};

const invalidateRbacUsersCache = (tenantId: string | undefined, valkeyDel?: (...keys: string[]) => Promise<void>, extraTenantIds: string[] = []) => {
  if (!valkeyDel) return;
  const keys = [RBAC_USERS_CACHE_KEY];
  const tenants = uniqueIds([tenantId, ...extraTenantIds]);
  for (const scoped of tenants) keys.push(rbacUsersCacheKeyForTenant(scoped));
  void valkeyDel(...keys);
};

export function registerRbacRoutes(deps: RegisterRbacRoutesDeps): void {
  const {
    app,
    requireApiKey,
    readTenant,
    listRbacRolesForTenant,
    listRbacRolePermsForTenant,
    saveRbacRole,
    replaceRbacRolePermissions,
    listRbacUsers,
    listRbacUsersForTenant,
    listAssignedTenantIdsForUser,
    applyUserScopeAssignment,
    userBelongsToTenant,
    persistBindingToDb,
    rbacUsersBindingType,
    saveRoleAssignmentForTenant,
    sendRbacInviteEmail,
    cryptoRandom,
    listRbacGroupsForTenant,
    listGroupRoleLinksForTenant,
    listGroupUserLinksForTenant,
    saveRbacGroup,
    replaceGroupLinksForTenant,
    listRoleAssignmentsForTenant,
    valkeyDel,
  } = deps;

  app.get("/rbac/roles", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantId = String(tenant || raw || "").trim();
    if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

    const roles = listRbacRolesForTenant(tenantId);
    const permissions = listRbacRolePermsForTenant(tenantId);
    res.json({ roles, permissions, tenantId });
  });

  app.post("/rbac/roles", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantId = String(tenant || raw || "").trim();
    if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

    const body = req.body ?? {};
    const name = String((body as any).name ?? "").trim();
    const description = String((body as any).description ?? "").trim();
    const status = String((body as any).status ?? "active").trim() || "active";
    const roleId = String((body as any).id ?? cryptoRandom()).trim();
    const permissions = Array.isArray((body as any).permissions) ? ((body as any).permissions as any[]) : [];

    if (!name) return res.status(400).json({ error: "Role name is required" });
    if (!roleId) return res.status(400).json({ error: "Role id is required" });

    const existing = listRbacRolesForTenant(tenantId).find((r) => r.id === roleId);
    if (existing) return res.status(409).json({ error: "Role already exists" });

    const created = saveRbacRole(tenantId, roleId, { name, description, status });
    replaceRbacRolePermissions(tenantId, roleId, permissions as any);

    res.json({ ok: true, role: { id: created.roleId, name: created.name, description: created.description, status: created.status, createdAt: created.createdAt, updatedAt: created.updatedAt } });
  });

  app.put("/rbac/roles", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantId = String(tenant || raw || "").trim();
    if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

    const body = req.body ?? {};
    const roleId = String((body as any).id ?? "").trim();
    const name = String((body as any).name ?? "").trim();
    const description = String((body as any).description ?? "").trim();
    const status = String((body as any).status ?? "active").trim() || "active";
    const permissions = Array.isArray((body as any).permissions) ? ((body as any).permissions as any[]) : [];
    if (!roleId) return res.status(400).json({ error: "Role id is required" });
    if (!name) return res.status(400).json({ error: "Role name is required" });

    const existing = listRbacRolesForTenant(tenantId).find((r) => r.id === roleId);
    if (!existing) return res.status(404).json({ error: "Role not found" });

    const updated = saveRbacRole(tenantId, roleId, { name, description, status }, existing.createdAt || undefined);
    replaceRbacRolePermissions(tenantId, roleId, permissions as any);

    res.json({ ok: true, role: { id: updated.roleId, name: updated.name, description: updated.description, status: updated.status, createdAt: updated.createdAt, updatedAt: updated.updatedAt } });
  });

  app.get("/rbac/users", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantId = String(tenant || raw || "").trim();
    if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

    const requestedUserId = String(req.query.userId ?? req.query.id ?? "").trim();
    let users = listRbacUsersForTenant(tenantId);
    if (requestedUserId) {
      users = users.filter((u) => u.id === requestedUserId);
      if (!users.length) {
        const global = listRbacUsers().find((u) => u.id === requestedUserId);
        if (global) users = [global];
      }
    }
    const roleById = new Map(listRbacRolesForTenant(tenantId).map((role) => [role.id, role]));
    const hydrated = users.map((u) => {
      const role = u.assignedRoleId ? roleById.get(u.assignedRoleId) : null;
      const assignedTenantIds = uniqueIds([
        ...(Array.isArray(u.assignedTenantIds) ? u.assignedTenantIds : []),
        u.assignedTenantId,
        ...(listAssignedTenantIdsForUser ? listAssignedTenantIdsForUser(u.id) : [])
      ]);
      return {
        ...u,
        assignedTenantId: assignedTenantIds[0] || u.assignedTenantId || tenantId,
        assignedTenantIds: assignedTenantIds.length ? assignedTenantIds : [tenantId],
        assignedSiteIds: Array.isArray(u.assignedSiteIds) ? u.assignedSiteIds : uniqueIds([u.assignedSiteId]),
        siteAssignments: Array.isArray(u.siteAssignments) ? u.siteAssignments : [],
        assignedRoleName: u.assignedRoleName || role?.name || u.assignedRoleId || ""
      };
    });
    const selected = requestedUserId ? hydrated[0] ?? null : null;
    res.json({ users: hydrated, user: selected, tenantId });
  });

  app.post("/rbac/users", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantId = String(tenant || raw || "").trim();
    if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

    const body = req.body ?? {};
    const name = String((body as any).name ?? "").trim();
    const email = String((body as any).email ?? "").trim().toLowerCase();
    const roleId = String((body as any).roleId ?? "").trim();
    const roleName = String((body as any).roleName ?? "").trim();
    const scoped = normalizeAssignmentFromBody(body, tenantId);
    if (!name) return res.status(400).json({ error: "User name is required" });
    if (!email) return res.status(400).json({ error: "User email is required" });
    if (!roleId) return res.status(400).json({ error: "roleId is required" });
    if (!scoped.assignedTenantId) return res.status(400).json({ error: "assignment.tenantId is required" });

    const existing = listRbacUsers().find((u) => String(u.email ?? "").trim().toLowerCase() === email);
    if (existing) {
      return res.status(409).json({ error: "User Email Exists", field: "email", value: email, existingId: existing.id });
    }

    const now = new Date().toISOString();
    const id = String((body as any).id ?? cryptoRandom()).trim() || cryptoRandom();
    const rec: any = {
      id,
      name,
      email,
      status: "active",
      createdAt: now,
      updatedAt: now,
      assignedTenantId: scoped.assignedTenantId,
      assignedTenantIds: scoped.tenantIds,
      assignedSiteId: scoped.assignedSiteId,
      assignedSiteName: scoped.assignedSiteName,
      assignedSiteIds: scoped.siteAssignments.map((row) => row.siteId),
      siteAssignments: scoped.siteAssignments,
      assignedRoleId: roleId,
      assignedRoleName: roleName
    };
    persistBindingToDb(rbacUsersBindingType, rec);
    if (applyUserScopeAssignment) {
      applyUserScopeAssignment({
        userId: id,
        roleId,
        roleName,
        tenantIds: scoped.tenantIds,
        siteAssignments: scoped.siteAssignments,
        keepGroupIdsForTenant: tenantId
      });
    } else {
      saveRoleAssignmentForTenant(scoped.assignedTenantId, id, { tenantAccess: true, roleIds: [roleId], groupIds: [] });
    }
    invalidateRbacUsersCache(scoped.assignedTenantId, valkeyDel, scoped.tenantIds);

    const inviteRequested = Boolean((body as any).sendInvite);
    if (!inviteRequested) {
      return res.json({ ok: true, user: rec, inviteEmailRequested: false, inviteEmailAttempted: false, inviteEmailSent: false });
    }

    void sendRbacInviteEmail(req, { email: rec.email, name: rec.name }).then((emailResult) => {
      res.json({
        ok: true,
        user: rec,
        inviteEmailRequested: true,
        inviteEmailAttempted: emailResult.attempted,
        inviteEmailSent: emailResult.sent,
        ...(emailResult.error ? { inviteEmailError: emailResult.error } : {})
      });
    });
  });

  app.put("/rbac/users", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantId = String(tenant || raw || "").trim();
    if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

    const body = req.body ?? {};
    const id = String((body as any).id ?? "").trim();
    if (!id) return res.status(400).json({ error: "User id is required" });

    const existing = listRbacUsers().find((u) => u.id === id) ?? listRbacUsersForTenant(tenantId).find((u) => u.id === id);
    if (!existing) return res.status(404).json({ error: "User not found" });

    const now = new Date().toISOString();
    const nextEmail = String((body as any).email ?? existing.email).trim().toLowerCase() || existing.email;
    const emailOwner = listRbacUsers().find(
      (u) => String(u.email ?? "").trim().toLowerCase() === nextEmail && String(u.id ?? "").trim() !== id
    );
    if (emailOwner) {
      return res.status(409).json({ error: "User Email Exists", field: "email", value: nextEmail, existingId: emailOwner.id });
    }
    const hasAssignmentPayload = Object.prototype.hasOwnProperty.call(body, "assignment");
    const scoped = hasAssignmentPayload ? normalizeAssignmentFromBody(body, tenantId) : null;
    const nextRoleId = String((body as any).roleId ?? existing.assignedRoleId ?? "").trim();
    const nextRoleName = String((body as any).roleName ?? existing.assignedRoleName ?? "").trim();
    const rec: any = {
      ...existing,
      name: String((body as any).name ?? existing.name).trim() || existing.name,
      email: nextEmail,
      status: String((body as any).status ?? existing.status).trim() || existing.status,
      updatedAt: now,
      assignedRoleId: nextRoleId || existing.assignedRoleId,
      assignedRoleName: nextRoleName || existing.assignedRoleName
    };
    if (scoped) {
      rec.assignedTenantId = scoped.assignedTenantId;
      rec.assignedTenantIds = scoped.tenantIds;
      rec.assignedSiteId = scoped.assignedSiteId;
      rec.assignedSiteName = scoped.assignedSiteName;
      rec.assignedSiteIds = scoped.siteAssignments.map((row) => row.siteId);
      rec.siteAssignments = scoped.siteAssignments;
    }
    persistBindingToDb(rbacUsersBindingType, rec);
    if (scoped && applyUserScopeAssignment) {
      applyUserScopeAssignment({
        userId: id,
        roleId: nextRoleId,
        roleName: nextRoleName,
        tenantIds: scoped.tenantIds,
        siteAssignments: scoped.siteAssignments,
        keepGroupIdsForTenant: tenantId
      });
    } else if (nextRoleId && tenantId) {
      const existingAssignment = listRoleAssignmentsForTenant(tenantId).find((row) => row.userId === id);
      saveRoleAssignmentForTenant(tenantId, id, {
        tenantAccess: existingAssignment?.tenantAccess !== false,
        roleIds: [nextRoleId],
        groupIds: existingAssignment?.groupIds ?? []
      });
    }
    invalidateRbacUsersCache(tenantId, valkeyDel, scoped?.tenantIds ?? []);

    const inviteRequested = Boolean((body as any).sendInvite);
    if (!inviteRequested) return res.json({ ok: true, user: rec });

    void sendRbacInviteEmail(req, { email: rec.email, name: rec.name }).then((emailResult) => {
      res.json({
        ok: true,
        user: rec,
        inviteEmailRequested: true,
        inviteEmailAttempted: emailResult.attempted,
        inviteEmailSent: emailResult.sent,
        ...(emailResult.error ? { inviteEmailError: emailResult.error } : {})
      });
    });
  });

  app.get("/rbac/security-groups", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantId = String(tenant || raw || "").trim();
    if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

    const groups = listRbacGroupsForTenant(tenantId);
    const groupRoles = listGroupRoleLinksForTenant(tenantId);
    const groupUsers = listGroupUserLinksForTenant(tenantId);
    res.json({ groups, groupRoles, groupUsers, tenantId });
  });

  app.post("/rbac/security-groups", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantId = String(tenant || raw || "").trim();
    if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

    const body = req.body ?? {};
    const id = String((body as any).id ?? cryptoRandom()).trim();
    const name = String((body as any).name ?? "").trim();
    const description = String((body as any).description ?? "").trim();
    const status = String((body as any).status ?? "active").trim() || "active";
    const roleIds = Array.isArray((body as any).roleIds) ? ((body as any).roleIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    const userIds = Array.isArray((body as any).userIds) ? ((body as any).userIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    if (!name) return res.status(400).json({ error: "Group name is required" });
    if (!id) return res.status(400).json({ error: "Group id is required" });

    const existing = listRbacGroupsForTenant(tenantId).find((g) => g.id === id);
    if (existing) return res.status(409).json({ error: "Security group already exists" });

    const created = saveRbacGroup(tenantId, id, { name, description, status });
    replaceGroupLinksForTenant(tenantId, id, roleIds, userIds);
    res.json({ ok: true, group: created });
  });

  app.put("/rbac/security-groups", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantId = String(tenant || raw || "").trim();
    if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });

    const body = req.body ?? {};
    const id = String((body as any).id ?? "").trim();
    const name = String((body as any).name ?? "").trim();
    const description = String((body as any).description ?? "").trim();
    const status = String((body as any).status ?? "active").trim() || "active";
    const roleIds = Array.isArray((body as any).roleIds) ? ((body as any).roleIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    const userIds = Array.isArray((body as any).userIds) ? ((body as any).userIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    if (!id) return res.status(400).json({ error: "Group id is required" });
    if (!name) return res.status(400).json({ error: "Group name is required" });

    const existing = listRbacGroupsForTenant(tenantId).find((g) => g.id === id);
    if (!existing) return res.status(404).json({ error: "Security group not found" });

    const updated = saveRbacGroup(tenantId, id, { name, description, status }, existing.createdAt || undefined);
    replaceGroupLinksForTenant(tenantId, id, roleIds, userIds);
    res.json({ ok: true, group: updated });
  });

  app.get("/rbac/assignments", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantId = String(tenant || raw || "").trim();
    if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });
    const userId = String(req.query.userId ?? "").trim();
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!userBelongsToTenant(userId, tenantId)) return res.status(404).json({ error: "User not found in this database" });

    const assignment = listRoleAssignmentsForTenant(tenantId).find((r) => r.userId === userId) ?? null;
    res.json({
      userId,
      tenantId,
      tenantAccess: Boolean(assignment?.tenantAccess),
      roleIds: assignment?.roleIds ?? [],
      groupIds: assignment?.groupIds ?? []
    });
  });

  app.put("/rbac/assignments", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantId = String(tenant || raw || "").trim();
    if (!tenantId) return res.status(400).json({ error: "x-tenant-id is required" });
    const body = req.body ?? {};
    const userId = String((body as any).userId ?? "").trim();
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!userBelongsToTenant(userId, tenantId) && (body as any).tenantAccess !== true) {
      return res.status(404).json({ error: "User not found in this database" });
    }
    const tenantAccess = Boolean((body as any).tenantAccess);
    const roleIds = Array.isArray((body as any).roleIds) ? ((body as any).roleIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    const groupIds = Array.isArray((body as any).groupIds) ? ((body as any).groupIds as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    saveRoleAssignmentForTenant(tenantId, userId, { tenantAccess, roleIds, groupIds });

    const existingUser = listRbacUsers().find((u) => u.id === userId);
    if (existingUser) {
      const patch: any = { ...existingUser, updatedAt: new Date().toISOString() };
      if (roleIds.length) patch.assignedRoleId = roleIds[0];
      if (tenantId) patch.assignedTenantId = tenantId;
      persistBindingToDb(rbacUsersBindingType, patch);
    }

    invalidateRbacUsersCache(tenantId, valkeyDel);

    res.json({ ok: true });
  });
}
