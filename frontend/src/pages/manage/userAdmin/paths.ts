export const USERS_PATH = "/Control/user-admin/users";
export const ROLES_PATH = "/Control/user-admin/roles";
export const SECURITY_GROUPS_PATH = "/Control/user-admin/security-groups";

const USER_ADMIN_BASES = [USERS_PATH, ROLES_PATH, SECURITY_GROUPS_PATH] as const;

/** Map create/edit/access sub-routes to the RBAC permission path. */
export function rbacCanonicalPath(path: string): string {
  const p = String(path ?? "").trim();
  for (const base of USER_ADMIN_BASES) {
    if (p === base || p.startsWith(`${base}/`)) return base;
  }
  return p;
}

export function parseUserAdminRoute(pathname: string): {
  base: typeof USER_ADMIN_BASES[number] | null;
  mode: "list" | "create" | "edit" | "access";
  entityId: string;
} {
  const p = String(pathname ?? "").trim();
  for (const base of USER_ADMIN_BASES) {
    if (p === base) return { base, mode: "list", entityId: "" };
    if (p === `${base}/create`) return { base, mode: "create", entityId: "" };
    const editPrefix = `${base}/edit/`;
    if (p.startsWith(editPrefix)) {
      return { base, mode: "edit", entityId: decodeURIComponent(p.slice(editPrefix.length)) };
    }
    const accessPrefix = `${base}/access/`;
    if (base === USERS_PATH && p.startsWith(accessPrefix)) {
      return { base, mode: "access", entityId: decodeURIComponent(p.slice(accessPrefix.length)) };
    }
  }
  return { base: null, mode: "list", entityId: "" };
}

export const USER_ADMIN_ROUTE_PATHS = [
  USERS_PATH,
  `${USERS_PATH}/create`,
  `${USERS_PATH}/edit/:userId`,
  `${USERS_PATH}/access/:userId`,
  ROLES_PATH,
  `${ROLES_PATH}/create`,
  `${ROLES_PATH}/edit/:roleId`,
  SECURITY_GROUPS_PATH,
  `${SECURITY_GROUPS_PATH}/create`,
  `${SECURITY_GROUPS_PATH}/edit/:groupId`
] as const;
