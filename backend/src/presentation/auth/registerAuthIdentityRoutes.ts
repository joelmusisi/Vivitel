import type { Express, Request, Response } from "express";
import { forgetAdminSessionToken, rememberAdminSessionToken } from "../../shared/api-key";
import { standardRoleAllowsPage } from "../../shared/standardRoles";

interface RegisterAuthIdentityRoutesDeps {
  app: Express;
  db: any;
  requireApiKey: (req: Request, res: Response) => boolean;
  listRbacUsers: () => any[];
  listRbacUsersForTenant?: (tenantId: string) => any[];
  userBelongsToTenant?: (userId: string, tenantId: string) => boolean;
  buildImpersonatedPrincipal: (user: any, tenantId: string) => any;
  listRbacRolePermsForTenant?: (tenantId: string) => any[];
  listRbacRolesForTenant?: (tenantId: string) => any[];
  listRoleAssignmentsForTenant?: (tenantId: string) => any[];
  listGroupRoleLinksForTenant?: (tenantId: string) => any[];
  persistBindingToDb: (type: string, record: any) => void;
  loadBindingsFromDb: (type: string) => any[];
  deleteBindingFromDb: (type: string, id: string) => void;
  rbacImpersonationBindingType: string;
  adminTokenTtlHours: number;
  randomHex: (bytes: number) => string;
  readAuthToken: (req: Request) => string;
  readTenant: (req: Request) => { raw: string; tenant: string };
  adminEmail: string;
  valkeyGet?: (key: string) => Promise<string | null>;
  valkeySet?: (key: string, value: string, ttlSec?: number) => Promise<void>;
  valkeyDel?: (...keys: string[]) => Promise<void>;
  valkeyTtl?: number;
}

const authSessionInvalidationStats = {
  logoutCalls: 0,
  revokeCalls: 0,
  revokedSessions: 0,
  revokeMisses: 0,
};

export function getAuthSessionInvalidationStats() {
  return { ...authSessionInvalidationStats };
}

const rbacUsersCacheKey = (tenantId?: string) =>
  tenantId ? `vivi:auth:rbac-users:${encodeURIComponent(tenantId)}` : "vivi:auth:rbac-users";
const authMeCacheKey = (token: string, tenantHint: string) =>
  `vivi:auth:me:${encodeURIComponent(String(token ?? "").trim() || "-")}:${encodeURIComponent(String(tenantHint ?? "").trim() || "-")}`;
const impersonationCacheKey = (token: string) => `vivi:auth:impersonation:${String(token ?? "").trim()}`;
const adminSessionCacheKey = (token: string) => `vivi:auth:admin-session:${String(token ?? "").trim()}`;

export function registerAuthIdentityRoutes(deps: RegisterAuthIdentityRoutesDeps): void {
  const {
    app,
    db,
    requireApiKey,
    listRbacUsers,
    listRbacUsersForTenant,
    userBelongsToTenant,
    buildImpersonatedPrincipal,
    listRbacRolePermsForTenant,
    listRbacRolesForTenant,
    listRoleAssignmentsForTenant,
    listGroupRoleLinksForTenant,
    persistBindingToDb,
    loadBindingsFromDb,
    deleteBindingFromDb,
    rbacImpersonationBindingType,
    adminTokenTtlHours,
    randomHex,
    readAuthToken,
    readTenant,
    adminEmail,
    valkeyGet,
    valkeySet,
    valkeyDel,
    valkeyTtl,
  } = deps;

  const authCacheTtlSeconds = Math.max(15, Math.min(Number(valkeyTtl ?? 60), 300));

  const toPermissionFlag = (value: unknown) => {
    if (typeof value === "boolean") return value;
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) && numeric > 0;
  };

  const buildEffectivePermissionsForUser = (tenantId: string, userId: string) => {
    if (!listRbacRolePermsForTenant || !listRoleAssignmentsForTenant) {
      return [];
    }

    const assignment = (listRoleAssignmentsForTenant(tenantId) ?? []).find(
      (row: any) => String(row?.userId ?? "").trim() === userId && Boolean(row?.tenantAccess)
    );
    if (!assignment) return [];

    const roleIds = new Set(
      (Array.isArray(assignment.roleIds) ? assignment.roleIds : [])
        .map((value: unknown) => String(value ?? "").trim())
        .filter(Boolean)
    );

    if (listGroupRoleLinksForTenant) {
      const groupIds = new Set(
        (Array.isArray(assignment.groupIds) ? assignment.groupIds : [])
          .map((value: unknown) => String(value ?? "").trim())
          .filter(Boolean)
      );
      if (groupIds.size > 0) {
        for (const link of listGroupRoleLinksForTenant(tenantId) ?? []) {
          const groupId = String((link as any)?.groupId ?? "").trim();
          const roleId = String((link as any)?.roleId ?? "").trim();
          if (groupIds.has(groupId) && roleId) roleIds.add(roleId);
        }
      }
    }

    if (roleIds.size === 0) return [];

    const rolesById = new Map(
      (listRbacRolesForTenant?.(tenantId) ?? []).map((role: any) => [String(role?.id ?? "").trim(), role])
    );

    const grouped = new Map<string, { pagePath: string; view: boolean; edit: boolean; delete: boolean }>();
    for (const row of listRbacRolePermsForTenant(tenantId) ?? []) {
      const roleId = String((row as any)?.roleId ?? "").trim();
      const pagePath = String((row as any)?.pagePath ?? "").trim();
      if (!roleIds.has(roleId) || !pagePath) continue;
      const role = rolesById.get(roleId);
      if (!standardRoleAllowsPage(String((role as any)?.standardRoleKey ?? ""), pagePath, String((role as any)?.name ?? ""))) {
        continue;
      }
      const current = grouped.get(pagePath) ?? { pagePath, view: false, edit: false, delete: false };
      current.view = current.view || toPermissionFlag((row as any)?.canView ?? (row as any)?.view);
      current.edit = current.edit || toPermissionFlag((row as any)?.canEdit ?? (row as any)?.edit);
      current.delete = current.delete || toPermissionFlag((row as any)?.canDelete ?? (row as any)?.delete);
      grouped.set(pagePath, current);
    }
    return Array.from(grouped.values()).filter((row) => row.view || row.edit || row.delete);
  };

  const readCachedJson = async <T>(key: string): Promise<T | null> => {
    if (!valkeyGet) return null;
    try {
      const raw = await valkeyGet(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };

  const writeCachedJson = async (key: string, value: unknown, ttlSeconds: number) => {
    if (!valkeySet) return;
    try {
      await valkeySet(key, JSON.stringify(value), ttlSeconds);
    } catch {
      // ignore cache write failures
    }
  };

  const clearCachedAuthArtifacts = async (token: string, tenantHint?: string) => {
    if (!valkeyDel) return;
    const keys = [adminSessionCacheKey(token), impersonationCacheKey(token)];
    if (typeof tenantHint !== "undefined") {
      keys.push(authMeCacheKey(token, tenantHint));
    }
    try {
      await valkeyDel(...keys);
    } catch {
      // ignore cache delete failures
    }
  };

  const mintAdminSession = async () => {
    const token = randomHex(32);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + adminTokenTtlHours * 60 * 60 * 1000).toISOString();
    try {
      db.prepare("INSERT OR REPLACE INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)").run(
        token,
        now.toISOString(),
        expiresAt
      );
      rememberAdminSessionToken(token, expiresAt);
    } catch {
      // ignore
    }
    const ttlSeconds = Math.max(5, Math.floor((Date.parse(expiresAt) - now.getTime()) / 1000));
    await writeCachedJson(adminSessionCacheKey(token), { token, createdAt: now.toISOString(), expiresAt }, ttlSeconds);
    return { token, expiresAt };
  };

  const isLiveAdminSession = (token: string) => {
    const cleanToken = String(token ?? "").trim();
    if (!cleanToken) return false;
    try {
      const row = db.prepare("SELECT expires_at FROM admin_sessions WHERE token = ?").get(cleanToken) as
        | { expires_at?: string }
        | undefined;
      return Boolean(row && Date.parse(String(row.expires_at ?? "")) > Date.now());
    } catch {
      return false;
    }
  };

  const revokeAdminSession = async (token: string, tenantHint?: string) => {
    const cleanToken = String(token ?? "").trim();
    if (!cleanToken) return false;

    let removed = false;
    try {
      const result = db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(cleanToken);
      removed = Number(result?.changes ?? 0) > 0;
    } catch {
      // ignore
    }

    try {
      deleteBindingFromDb(rbacImpersonationBindingType, cleanToken);
    } catch {
      // ignore
    }

    forgetAdminSessionToken(cleanToken);
    await clearCachedAuthArtifacts(cleanToken, tenantHint);
    if (removed) authSessionInvalidationStats.revokedSessions += 1;
    else authSessionInvalidationStats.revokeMisses += 1;
    return removed;
  };

  const readCachedRbacUsers = async (tenantId?: string): Promise<any[]> => {
    const cacheKey = rbacUsersCacheKey(tenantId);
    const cached = await readCachedJson<any[]>(cacheKey);
    if (Array.isArray(cached)) return cached;
    const users = tenantId && listRbacUsersForTenant ? listRbacUsersForTenant(tenantId) : listRbacUsers();
    await writeCachedJson(cacheKey, users, authCacheTtlSeconds);
    return users;
  };

  app.post("/auth/impersonate", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req);
    const tenantHint = String(tenant || raw || "").trim();
    const body = req.body ?? {};
    const userId = String((body as any).userId ?? "").trim();
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (tenantHint && userBelongsToTenant && !userBelongsToTenant(userId, tenantHint)) {
      return res.status(404).json({ error: "User not found in this database" });
    }
    const user = (await readCachedRbacUsers(tenantHint || undefined)).find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const returnToken = String(readAuthToken(req) ?? "").trim();
    const { token, expiresAt } = await mintAdminSession();
    const now = new Date();
    const principal = buildImpersonatedPrincipal(user, tenantHint || String(user.assignedTenantId ?? ""));
    const binding = {
      id: token,
      token,
      userId,
      principal,
      expiresAt,
      createdAt: now.toISOString(),
      returnToken,
      returnTenantId: tenantHint
    };
    persistBindingToDb(rbacImpersonationBindingType, binding);

    const ttlSeconds = Math.max(5, Math.floor((Date.parse(expiresAt) - now.getTime()) / 1000));
    await writeCachedJson(impersonationCacheKey(token), binding, ttlSeconds);

    res.json({ ok: true, token, expiresAt });
  });

  app.post("/auth/stop-impersonate", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const token = String(readAuthToken(req) ?? "").trim();
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req);
    const tenantHint = String(tenant || raw || "").trim();

    let imp = await readCachedJson<any>(impersonationCacheKey(token));
    if (!imp) {
      imp =
        (loadBindingsFromDb(rbacImpersonationBindingType) as any[]).find(
          (row) => String(row?.token ?? "").trim() === token
        ) ?? null;
    }
    if (!imp) return res.status(400).json({ error: "You are not impersonating an account." });

    const storedReturn = String(imp.returnToken ?? "").trim();
    const returnTenantId = String(imp.returnTenantId ?? "").trim();
    let nextToken = storedReturn && storedReturn !== token && isLiveAdminSession(storedReturn) ? storedReturn : "";
    if (!nextToken) {
      nextToken = (await mintAdminSession()).token;
    }

    try {
      db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
    } catch {
      // ignore
    }
    try {
      deleteBindingFromDb(rbacImpersonationBindingType, token);
    } catch {
      // ignore
    }
    forgetAdminSessionToken(token);
    await clearCachedAuthArtifacts(token, tenantHint);
    return res.json({ ok: true, token: nextToken, tenantId: returnTenantId || undefined });
  });

  app.get("/auth/me", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const token = readAuthToken(req);
    const { raw, tenant } = readTenant(req);
    const tenantHint = String(tenant || raw || "").trim();

    const cachedResponse = await readCachedJson<any>(authMeCacheKey(token, tenantHint));
    if (cachedResponse) return res.json(cachedResponse);

    let imp = await readCachedJson<any>(impersonationCacheKey(token));
    if (!imp || Date.parse(String(imp?.expiresAt ?? "")) <= Date.now()) {
      imp = (loadBindingsFromDb(rbacImpersonationBindingType) as any[])
        .find((r) => String(r?.token ?? "").trim() === token && Date.parse(String(r?.expiresAt ?? "")) > Date.now()) ?? null;
      if (imp) {
        const ttlSeconds = Math.max(5, Math.floor((Date.parse(String(imp.expiresAt ?? "")) - Date.now()) / 1000));
        await writeCachedJson(impersonationCacheKey(token), imp, ttlSeconds);
      }
    }

    if (imp?.principal) {
      const principal = imp.principal as any;
      const allowedTenants = Array.isArray(principal.allowedTenants) ? principal.allowedTenants : [];
      const resolvedTenantId =
        tenantHint && allowedTenants.includes(tenantHint)
          ? tenantHint
          : String(principal.tenantId ?? "").trim() && allowedTenants.includes(String(principal.tenantId ?? "").trim())
            ? String(principal.tenantId ?? "").trim()
            : String(allowedTenants[0] ?? "").trim();
      const userId = String(
        principal.principal?.userId ?? principal.principal?.id ?? (imp as any)?.userId ?? ""
      ).trim();
      const principalPayload = {
        ...(principal.principal ?? {}),
        kind: "user",
        userId,
        impersonatedBy: { kind: "admin", at: String(imp?.createdAt ?? new Date().toISOString()) }
      };
      const payload = {
        ok: true,
        tenantId: resolvedTenantId,
        allowedTenants,
        principal: principalPayload,
        permissions: {
          mode: "deny-by-default",
          rows: resolvedTenantId && userId ? buildEffectivePermissionsForUser(resolvedTenantId, userId) : []
        }
      };
      const ttlSeconds = Math.max(5, Math.min(authCacheTtlSeconds, Math.floor((Date.parse(String(imp.expiresAt ?? "")) - Date.now()) / 1000) || authCacheTtlSeconds));
      await writeCachedJson(authMeCacheKey(token, tenantHint), payload, ttlSeconds);
      return res.json(payload);
    }

    const tenantId = tenantHint;
    const allowedTenants = tenantId ? [tenantId] : [];
    const payload = {
      tenantId,
      allowedTenants,
      principal: {
        kind: "admin",
        id: "admin",
        email: adminEmail || "admin@local",
        name: "Admin",
        role: "admin"
      },
      permissions: { mode: "allow-all", rows: [] }
    };
    await writeCachedJson(authMeCacheKey(token, tenantHint), payload, authCacheTtlSeconds);
    return res.json(payload);
  });

  app.post("/auth/logout", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    authSessionInvalidationStats.logoutCalls += 1;
    const token = readAuthToken(req);
    const { raw, tenant } = readTenant(req);
    const tenantHint = String(tenant || raw || "").trim();
    const revoked = await revokeAdminSession(token, tenantHint);
    return res.json({ ok: true, revoked, token: revoked ? token : undefined });
  });

  app.post("/auth/revoke", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    authSessionInvalidationStats.revokeCalls += 1;
    const body = req.body ?? {};
    const token = String((body as any).token ?? "").trim();
    if (!token) return res.status(400).json({ error: "token is required" });
    const revoked = await revokeAdminSession(token);
    return res.json({ ok: true, revoked, token });
  });
}
