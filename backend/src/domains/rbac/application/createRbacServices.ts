import {
  isAdminLikeRoleName,
  isAdvancedLikeRoleName,
  isDealerSupportLikeRoleName,
  isOwnSupportLikeRoleName,
  isSupportLikeRoleName
} from "../../../shared/standardRoles";

export const RBAC_ROLES_BINDING_TYPE = "rbac_roles";
export const RBAC_ROLE_PERMS_BINDING_TYPE = "rbac_role_permissions";
export const RBAC_USERS_BINDING_TYPE = "rbac_users";
export const RBAC_GROUPS_BINDING_TYPE = "rbac_security_groups";
export const RBAC_GROUP_ROLES_BINDING_TYPE = "rbac_group_roles";
export const RBAC_GROUP_USERS_BINDING_TYPE = "rbac_group_users";
export const RBAC_ASSIGNMENTS_BINDING_TYPE = "rbac_assignments";
export const RBAC_IMPERSONATION_BINDING_TYPE = "rbac_impersonation_sessions";

type LoadBindings = (type?: string) => any[];
type PersistBinding = (type: string, record: any) => void;
type DeleteBinding = (type: string, id: string) => void;

type RbacRoleRecord = {
  id: string;
  roleId: string;
  tenantId: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type RbacRolePermissionRecord = {
  id: string;
  roleId: string;
  tenantId: string;
  pagePath: string;
  canView: number;
  canEdit: number;
  canDelete: number;
  updatedAt: string;
};

type RbacGroupRecord = {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export function createRbacServices(deps: {
  loadBindingsFromDb: LoadBindings;
  persistBindingToDb: PersistBinding;
  deleteBindingFromDb: DeleteBinding;
  adminEmail: string;
}) {
  const { loadBindingsFromDb, persistBindingToDb, deleteBindingFromDb, adminEmail } = deps;

  const toFlag = (value: unknown) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    const n = Number(value ?? 0);
    return Number.isFinite(n) && n > 0 ? 1 : 0;
  };

  const listRbacRolesForTenant = (tenant: string) => {
    const rows = loadBindingsFromDb(RBAC_ROLES_BINDING_TYPE) as any[];
    return rows
      .filter((row) => String(row?.tenantId ?? "").trim() === tenant)
      .map((row) => ({
        id: String(row.roleId ?? "").trim() || String(row.id ?? "").trim(),
        name: String(row.name ?? "").trim(),
        description: String(row.description ?? "").trim(),
        status: String(row.status ?? "active").trim() || "active",
        createdAt: String(row.createdAt ?? "").trim(),
        updatedAt: String(row.updatedAt ?? "").trim()
      }))
      .filter((row) => row.id && row.name)
      .sort((left, right) => left.name.localeCompare(right.name));
  };

  const listRbacRolePermsForTenant = (tenant: string) => {
    const rows = loadBindingsFromDb(RBAC_ROLE_PERMS_BINDING_TYPE) as any[];
    return rows
      .filter((row) => String(row?.tenantId ?? "").trim() === tenant)
      .map((row) => ({
        roleId: String(row.roleId ?? "").trim(),
        pagePath: String(row.pagePath ?? "").trim(),
        canView: toFlag(row.canView),
        canEdit: toFlag(row.canEdit),
        canDelete: toFlag(row.canDelete)
      }))
      .filter((row) => row.roleId && row.pagePath);
  };

  const saveRbacRole = (tenant: string, roleId: string, payload: { name: string; description?: string; status?: string }, createdAt?: string) => {
    const now = new Date().toISOString();
    const storageId = `${tenant}:${roleId}`;
    const record: RbacRoleRecord = {
      id: storageId,
      roleId,
      tenantId: tenant,
      name: payload.name,
      description: payload.description ?? "",
      status: String(payload.status ?? "active").trim() || "active",
      createdAt: createdAt || now,
      updatedAt: now
    };
    persistBindingToDb(RBAC_ROLES_BINDING_TYPE, record);
    return record;
  };

  const replaceRbacRolePermissions = (
    tenant: string,
    roleId: string,
    permissions: Array<{ pagePath: string; view?: boolean | number; edit?: boolean | number; delete?: boolean | number }>
  ) => {
    const existing = (loadBindingsFromDb(RBAC_ROLE_PERMS_BINDING_TYPE) as any[])
      .filter((row) => String(row?.tenantId ?? "").trim() === tenant && String(row?.roleId ?? "").trim() === roleId);
    for (const record of existing) {
      const existingId = String(record?.id ?? "").trim();
      if (existingId) deleteBindingFromDb(RBAC_ROLE_PERMS_BINDING_TYPE, existingId);
    }

    const now = new Date().toISOString();
    for (const permission of permissions) {
      const pagePath = String(permission?.pagePath ?? "").trim();
      if (!pagePath) continue;
      if (!toFlag(permission?.view) && !toFlag(permission?.edit) && !toFlag(permission?.delete)) continue;
      const id = `${tenant}:${roleId}:${pagePath}`;
      const record: RbacRolePermissionRecord = {
        id,
        roleId,
        tenantId: tenant,
        pagePath,
        canView: toFlag(permission?.view),
        canEdit: toFlag(permission?.edit),
        canDelete: toFlag(permission?.delete),
        updatedAt: now
      };
      persistBindingToDb(RBAC_ROLE_PERMS_BINDING_TYPE, record);
    }
  };

  const parseIdList = (value: unknown) => {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean)));
    }
    return Array.from(
      new Set(
        String(value ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  };

  const parseSiteAssignments = (value: unknown, fallbackTenantId = "", fallbackSiteId = "", fallbackSiteName = "") => {
    const seen = new Set<string>();
    const out: Array<{ tenantId: string; siteId: string; siteName?: string }> = [];
    const push = (tenantValue?: unknown, siteValue?: unknown, siteNameValue?: unknown) => {
      const tenantId = String(tenantValue ?? "").trim();
      const siteId = String(siteValue ?? "").trim();
      if (!tenantId || !siteId) return;
      const key = `${tenantId}::${siteId}`;
      if (seen.has(key)) return;
      seen.add(key);
      const siteName = String(siteNameValue ?? "").trim();
      out.push(siteName ? { tenantId, siteId, siteName } : { tenantId, siteId });
    };
    if (Array.isArray(value)) {
      for (const row of value) {
        if (!row || typeof row !== "object") continue;
        const rec = row as { tenantId?: unknown; siteId?: unknown; siteName?: unknown };
        push(rec.tenantId, rec.siteId, rec.siteName);
      }
    }
    push(fallbackTenantId, fallbackSiteId, fallbackSiteName);
    return out;
  };

  const listRbacUsers = () => {
    const rows = loadBindingsFromDb(RBAC_USERS_BINDING_TYPE) as any[];
    return rows
      .map((row) => {
        const assignedTenantId = String(row?.assignedTenantId ?? "").trim();
        const assignedSiteId = String(row?.assignedSiteId ?? "").trim();
        const assignedSiteName = String(row?.assignedSiteName ?? "").trim();
        const assignedTenantIds = parseIdList(row?.assignedTenantIds ?? assignedTenantId);
        const assignedSiteIds = parseIdList(row?.assignedSiteIds ?? assignedSiteId);
        const siteAssignments = parseSiteAssignments(row?.siteAssignments, assignedTenantId, assignedSiteId, assignedSiteName);
        return {
          id: String(row?.id ?? "").trim(),
          name: String(row?.name ?? "").trim(),
          email: String(row?.email ?? "").trim().toLowerCase(),
          status: String(row?.status ?? "active").trim() || "active",
          createdAt: String(row?.createdAt ?? "").trim(),
          updatedAt: String(row?.updatedAt ?? "").trim(),
          assignedTenantId: assignedTenantIds[0] || assignedTenantId,
          assignedTenantIds,
          assignedSiteId: assignedSiteIds[0] || assignedSiteId,
          assignedSiteName,
          assignedSiteIds,
          siteAssignments,
          assignedRoleId: String(row?.assignedRoleId ?? "").trim(),
          assignedRoleName: String(row?.assignedRoleName ?? "").trim()
        };
      })
      .filter((row) => row.id && row.email);
  };

  const listRbacUsersForTenant = (tenant: string) => {
    const tenantId = String(tenant ?? "").trim();
    if (!tenantId) return [];

    const assignments = listRoleAssignmentsForTenant(tenantId);
    const usersById = new Map(listRbacUsers().map((user) => [user.id, user]));
    const seen = new Set<string>();
    const out: ReturnType<typeof listRbacUsers> = [];

    for (const assignment of assignments) {
      // Pre-modules assignments may omit tenantAccess; still treat tenant-scoped rows as members.
      if (assignment.tenantAccess === false) continue;
      const user = usersById.get(assignment.userId);
      if (!user || seen.has(user.id)) continue;
      seen.add(user.id);
      const roleId = (assignment.roleIds ?? [])[0] ?? "";
      out.push({
        ...user,
        assignedTenantId: user.assignedTenantId || tenantId,
        assignedRoleId: roleId || user.assignedRoleId
      });
    }

    for (const user of usersById.values()) {
      if (seen.has(user.id)) continue;
      if (String(user.assignedTenantId ?? "").trim() !== tenantId) continue;
      seen.add(user.id);
      out.push({ ...user, assignedTenantId: user.assignedTenantId || tenantId });
    }

    return out.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  };

  const userBelongsToTenant = (userId: string, tenant: string) => {
    const cleanUserId = String(userId ?? "").trim();
    const tenantId = String(tenant ?? "").trim();
    if (!cleanUserId || !tenantId) return false;
    return listRoleAssignmentsForTenant(tenantId).some(
      (row) => row.userId === cleanUserId && row.tenantAccess
    );
  };

  const listRoleAssignmentsForTenant = (tenant: string) => {
    const rows = loadBindingsFromDb(RBAC_ASSIGNMENTS_BINDING_TYPE) as any[];
    return rows
      .filter((row) => String(row?.tenantId ?? "").trim() === tenant)
      .map((row) => ({
        id: String(row?.id ?? "").trim(),
        tenantId: String(row?.tenantId ?? "").trim(),
        userId: String(row?.userId ?? "").trim(),
        tenantAccess: Boolean(row?.tenantAccess),
        roleIds: Array.isArray(row?.roleIds) ? row.roleIds.map((value: any) => String(value ?? "").trim()).filter(Boolean) : [],
        groupIds: Array.isArray(row?.groupIds) ? row.groupIds.map((value: any) => String(value ?? "").trim()).filter(Boolean) : []
      }))
      .filter((row) => row.id && row.userId);
  };

  const saveRoleAssignmentForTenant = (tenant: string, userId: string, payload: { tenantAccess: boolean; roleIds: string[]; groupIds: string[] }) => {
    const id = `${tenant}:${userId}`;
    persistBindingToDb(RBAC_ASSIGNMENTS_BINDING_TYPE, {
      id,
      tenantId: tenant,
      userId,
      tenantAccess: Boolean(payload.tenantAccess),
      roleIds: (payload.roleIds || []).map((value) => String(value ?? "").trim()).filter(Boolean),
      groupIds: (payload.groupIds || []).map((value) => String(value ?? "").trim()).filter(Boolean),
      updatedAt: new Date().toISOString()
    });
  };

  const listAssignedTenantIdsForUser = (userId: string) => {
    const cleanUserId = String(userId ?? "").trim();
    if (!cleanUserId) return [] as string[];
    const fromAssignments = (loadBindingsFromDb(RBAC_ASSIGNMENTS_BINDING_TYPE) as any[])
      .filter((row) => String(row?.userId ?? "").trim() === cleanUserId && row?.tenantAccess !== false)
      .map((row) => String(row?.tenantId ?? "").trim())
      .filter(Boolean);
    const user = listRbacUsers().find((row) => row.id === cleanUserId);
    return Array.from(new Set([...(user?.assignedTenantIds ?? []), ...(user?.assignedTenantId ? [user.assignedTenantId] : []), ...fromAssignments]));
  };

  const resolveRoleIdForTenant = (tenant: string, roleId: string, roleName?: string) => {
    const roles = listRbacRolesForTenant(tenant);
    const wantedId = String(roleId ?? "").trim();
    const wantedName = String(roleName ?? "").trim().toLowerCase();
    const byId = wantedId ? roles.find((role) => role.id === wantedId) : null;
    if (byId?.id) return byId.id;
    const byName = wantedName ? roles.find((role) => String(role.name ?? "").trim().toLowerCase() === wantedName) : null;
    return byName?.id || wantedId;
  };

  const applyUserScopeAssignment = (input: {
    userId: string;
    roleId?: string;
    roleName?: string;
    tenantIds: string[];
    siteAssignments?: Array<{ tenantId?: string; siteId?: string; siteName?: string }>;
    keepGroupIdsForTenant?: string;
  }) => {
    const userId = String(input.userId ?? "").trim();
    const tenantIds = Array.from(new Set((input.tenantIds || []).map((value) => String(value ?? "").trim()).filter(Boolean)));
    if (!userId || !tenantIds.length) return;
    const keepTenant = String(input.keepGroupIdsForTenant ?? "").trim();
    const keepGroups =
      keepTenant
        ? listRoleAssignmentsForTenant(keepTenant).find((row) => row.userId === userId)?.groupIds ?? []
        : [];
    for (const tenantId of tenantIds) {
      const existing = listRoleAssignmentsForTenant(tenantId).find((row) => row.userId === userId);
      const resolvedRoleId = resolveRoleIdForTenant(tenantId, String(input.roleId ?? ""), input.roleName);
      saveRoleAssignmentForTenant(tenantId, userId, {
        tenantAccess: true,
        roleIds: resolvedRoleId ? [resolvedRoleId] : existing?.roleIds ?? [],
        groupIds: tenantId === keepTenant ? keepGroups : existing?.groupIds ?? []
      });
    }
  };

  const listRbacGroupsForTenant = (tenant: string) => {
    const rows = loadBindingsFromDb(RBAC_GROUPS_BINDING_TYPE) as any[];
    return rows
      .filter((row) => String(row?.tenantId ?? "").trim() === tenant)
      .map((row) => ({
        id: String(row?.id ?? "").trim(),
        name: String(row?.name ?? "").trim(),
        description: String(row?.description ?? "").trim(),
        status: String(row?.status ?? "active").trim() || "active",
        createdAt: String(row?.createdAt ?? "").trim(),
        updatedAt: String(row?.updatedAt ?? "").trim()
      }))
      .filter((row) => row.id && row.name)
      .sort((left, right) => left.name.localeCompare(right.name));
  };

  const saveRbacGroup = (tenant: string, groupId: string, payload: { name: string; description?: string; status?: string }, createdAt?: string) => {
    const now = new Date().toISOString();
    const record: RbacGroupRecord = {
      id: groupId,
      tenantId: tenant,
      name: payload.name,
      description: payload.description ?? "",
      status: String(payload.status ?? "active").trim() || "active",
      createdAt: createdAt || now,
      updatedAt: now
    };
    persistBindingToDb(RBAC_GROUPS_BINDING_TYPE, record);
    return record;
  };

  const listGroupRoleLinksForTenant = (tenant: string) => {
    const rows = loadBindingsFromDb(RBAC_GROUP_ROLES_BINDING_TYPE) as any[];
    return rows
      .filter((row) => String(row?.tenantId ?? "").trim() === tenant)
      .map((row) => ({
        groupId: String(row?.groupId ?? "").trim(),
        roleId: String(row?.roleId ?? "").trim()
      }))
      .filter((row) => row.groupId && row.roleId);
  };

  const listGroupUserLinksForTenant = (tenant: string) => {
    const rows = loadBindingsFromDb(RBAC_GROUP_USERS_BINDING_TYPE) as any[];
    return rows
      .filter((row) => String(row?.tenantId ?? "").trim() === tenant)
      .map((row) => ({
        groupId: String(row?.groupId ?? "").trim(),
        userId: String(row?.userId ?? "").trim()
      }))
      .filter((row) => row.groupId && row.userId);
  };

  const replaceGroupLinksForTenant = (tenant: string, groupId: string, roleIds: string[], userIds: string[]) => {
    const roleLinks = (loadBindingsFromDb(RBAC_GROUP_ROLES_BINDING_TYPE) as any[])
      .filter((row) => String(row?.tenantId ?? "").trim() === tenant && String(row?.groupId ?? "").trim() === groupId);
    for (const record of roleLinks) {
      const id = String(record?.id ?? "").trim();
      if (id) deleteBindingFromDb(RBAC_GROUP_ROLES_BINDING_TYPE, id);
    }
    for (const roleId of roleIds) {
      const cleanRoleId = String(roleId ?? "").trim();
      if (!cleanRoleId) continue;
      const id = `${tenant}:${groupId}:${cleanRoleId}`;
      persistBindingToDb(RBAC_GROUP_ROLES_BINDING_TYPE, { id, tenantId: tenant, groupId, roleId: cleanRoleId, updatedAt: new Date().toISOString() });
    }

    const userLinks = (loadBindingsFromDb(RBAC_GROUP_USERS_BINDING_TYPE) as any[])
      .filter((row) => String(row?.tenantId ?? "").trim() === tenant && String(row?.groupId ?? "").trim() === groupId);
    for (const record of userLinks) {
      const id = String(record?.id ?? "").trim();
      if (id) deleteBindingFromDb(RBAC_GROUP_USERS_BINDING_TYPE, id);
    }
    for (const userId of userIds) {
      const cleanUserId = String(userId ?? "").trim();
      if (!cleanUserId) continue;
      const id = `${tenant}:${groupId}:${cleanUserId}`;
      persistBindingToDb(RBAC_GROUP_USERS_BINDING_TYPE, { id, tenantId: tenant, groupId, userId: cleanUserId, updatedAt: new Date().toISOString() });
    }
  };

  /** Active users with Admin or Own Support roles — shown as Support Centre agents. */
  const listSupportDeskAgents = () => {
    const usersById = new Map(listRbacUsers().map((user) => [user.id, user]));
    const rolesById = new Map<string, { id: string; name: string; standardRoleKey: string }>();

    const registerRole = (raw: any) => {
      const roleId = String(raw?.roleId ?? "").trim();
      const storageId = String(raw?.id ?? "").trim();
      const name = String(raw?.name ?? "").trim();
      const standardRoleKey = String(raw?.standardRoleKey ?? raw?.standard_role_key ?? "").trim().toLowerCase();
      const resolvedId = roleId || (storageId.includes(":") ? storageId.slice(storageId.lastIndexOf(":") + 1) : storageId);
      if (!resolvedId || !name) return;
      const entry = { id: resolvedId, name, standardRoleKey };
      rolesById.set(resolvedId, entry);
      if (roleId) rolesById.set(roleId, entry);
      if (storageId) rolesById.set(storageId, entry);
    };

    for (const row of loadBindingsFromDb(RBAC_ROLES_BINDING_TYPE) as any[]) {
      registerRole(row);
    }

    const isSupportDeskRole = (role: { name: string; standardRoleKey: string } | undefined) => {
      if (!role) return false;
      if (role.standardRoleKey === "admin" || role.standardRoleKey === "own-support") return true;
      return isAdminLikeRoleName(role.name) || isOwnSupportLikeRoleName(role.name);
    };

    const categoryForRole = (role: { name: string; standardRoleKey: string }) => {
      if (role.standardRoleKey === "admin" || isAdminLikeRoleName(role.name)) return "Admins";
      return "Technical Support Telematics";
    };

    const seen = new Map<string, string>(); // userId -> category
    const pushAgent = (userId: string, category: string) => {
      const user = usersById.get(userId);
      if (!user) return;
      if (String(user.status ?? "active").trim().toLowerCase() !== "active") return;
      if (!user.id || !user.name) return;
      const existing = seen.get(user.id);
      if (existing === "Admins") return;
      if (existing && category !== "Admins") return;
      seen.set(user.id, category);
    };

    const assignments = (loadBindingsFromDb(RBAC_ASSIGNMENTS_BINDING_TYPE) as any[])
      .map((row) => ({
        userId: String(row?.userId ?? "").trim(),
        tenantAccess: Boolean(row?.tenantAccess),
        roleIds: Array.isArray(row?.roleIds)
          ? row.roleIds.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
          : [],
        groupIds: Array.isArray(row?.groupIds)
          ? row.groupIds.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
          : [],
        tenantId: String(row?.tenantId ?? "").trim()
      }))
      .filter((row) => row.userId && (row.tenantAccess || row.roleIds.length > 0 || row.groupIds.length > 0));

    const groupRoleLinks = (loadBindingsFromDb(RBAC_GROUP_ROLES_BINDING_TYPE) as any[]).map((row) => ({
      tenantId: String(row?.tenantId ?? "").trim(),
      groupId: String(row?.groupId ?? "").trim(),
      roleId: String(row?.roleId ?? "").trim()
    }));

    for (const assignment of assignments) {
      const roleIds = new Set(assignment.roleIds);
      if (assignment.groupIds.length > 0) {
        for (const link of groupRoleLinks) {
          if (link.tenantId && assignment.tenantId && link.tenantId !== assignment.tenantId) continue;
          if (assignment.groupIds.includes(link.groupId) && link.roleId) roleIds.add(link.roleId);
        }
      }
      for (const roleId of roleIds) {
        const role = rolesById.get(String(roleId));
        if (!isSupportDeskRole(role) || !role) continue;
        pushAgent(assignment.userId, categoryForRole(role));
      }
    }

    for (const user of usersById.values()) {
      if (seen.has(user.id)) continue;
      const roleId = String(user.assignedRoleId ?? "").trim();
      if (!roleId) continue;
      const role = rolesById.get(roleId);
      if (!isSupportDeskRole(role) || !role) continue;
      pushAgent(user.id, categoryForRole(role));
    }

    return Array.from(seen.entries())
      .map(([userId, category]) => {
        const user = usersById.get(userId);
        if (!user) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          category
        };
      })
      .filter((row): row is { id: string; name: string; email: string; category: string } => Boolean(row))
      .sort((left, right) => left.name.localeCompare(right.name));
  };

  const collectRoleNamesForUser = (userId: string, tenantIds: string[]) => {
    const names = new Set<string>();
    const cleanUserId = String(userId ?? "").trim();
    if (!cleanUserId) return [] as string[];
    for (const tenant of tenantIds) {
      const tenantId = String(tenant ?? "").trim();
      if (!tenantId) continue;
      const roles = listRbacRolesForTenant(tenantId);
      const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
      const assignments = listRoleAssignmentsForTenant(tenantId).filter((row) => row.userId === cleanUserId);
      for (const assignment of assignments) {
        for (const roleId of assignment.roleIds ?? []) {
          const name = roleNameById.get(roleId);
          if (name) names.add(name);
        }
        for (const groupId of assignment.groupIds ?? []) {
          for (const link of listGroupRoleLinksForTenant(tenantId)) {
            if (link.groupId !== groupId) continue;
            const name = roleNameById.get(link.roleId);
            if (name) names.add(name);
          }
        }
      }
      for (const link of listGroupUserLinksForTenant(tenantId)) {
        if (link.userId !== cleanUserId) continue;
        for (const roleLink of listGroupRoleLinksForTenant(tenantId)) {
          if (roleLink.groupId !== link.groupId) continue;
          const name = roleNameById.get(roleLink.roleId);
          if (name) names.add(name);
        }
      }
    }
    return Array.from(names);
  };

  const flagsFromRoleNames = (roleNames: string[]) => {
    const isTenantAdmin = roleNames.some((name) => isAdminLikeRoleName(name));
    const isOwnSupport = isTenantAdmin || roleNames.some((name) => isOwnSupportLikeRoleName(name));
    const isDealerSupport = roleNames.some((name) => isDealerSupportLikeRoleName(name));
    const isSupport =
      isTenantAdmin || isOwnSupport || isDealerSupport || roleNames.some((name) => isSupportLikeRoleName(name));
    const isAdvanced =
      isTenantAdmin || isOwnSupport || isDealerSupport || roleNames.some((name) => isAdvancedLikeRoleName(name));
    return { isTenantAdmin, isOwnSupport, isDealerSupport, isSupport, isAdvanced };
  };

  const buildImpersonatedPrincipal = (user: any, tenantHint: string) => {
    const hint = String(tenantHint ?? "").trim();
    const allowedTenants = listAssignedTenantIdsForUser(String(user?.id ?? ""));
    const tenantId = hint && allowedTenants.includes(hint)
      ? hint
      : allowedTenants[0] || hint || "";
    const roleNames = collectRoleNamesForUser(
      String(user?.id ?? ""),
      allowedTenants.length ? allowedTenants : tenantId ? [tenantId] : []
    );
    const assignedRoleId = String(user?.assignedRoleId ?? "").trim();
    if (assignedRoleId && tenantId) {
      const match = listRbacRolesForTenant(tenantId).find((role) => role.id === assignedRoleId);
      if (match?.name) roleNames.push(match.name);
    }
    const uniqueRoleNames = Array.from(new Set(roleNames.map((name) => String(name ?? "").trim()).filter(Boolean)));
    const flags = flagsFromRoleNames(uniqueRoleNames);
    return {
      tenantId,
      allowedTenants,
      principal: {
        id: String(user?.id ?? ""),
        userId: String(user?.id ?? ""),
        email: String(user?.email ?? ""),
        name: String(user?.name ?? user?.email ?? ""),
        role: "user",
        impersonatedBy: adminEmail || "admin",
        ...(uniqueRoleNames.length ? { roleNames: uniqueRoleNames } : {}),
        ...flags
      }
    };
  };

  return {
    RBAC_USERS_BINDING_TYPE,
    RBAC_IMPERSONATION_BINDING_TYPE,
    listRbacRolesForTenant,
    listRbacRolePermsForTenant,
    saveRbacRole,
    replaceRbacRolePermissions,
    listRbacUsers,
    listRbacUsersForTenant,
    listAssignedTenantIdsForUser,
    applyUserScopeAssignment,
    listSupportDeskAgents,
    userBelongsToTenant,
    listRoleAssignmentsForTenant,
    saveRoleAssignmentForTenant,
    listRbacGroupsForTenant,
    saveRbacGroup,
    listGroupRoleLinksForTenant,
    listGroupUserLinksForTenant,
    replaceGroupLinksForTenant,
    buildImpersonatedPrincipal
  };
}