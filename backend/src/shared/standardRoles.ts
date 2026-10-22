export type StandardRoleKey = "admin" | "own-support" | "dealer-support" | "database-support" | "advanced-user" | "basic-user";

export type PagePermission = { pagePath: string; view: boolean; edit: boolean; delete: boolean };

export type StandardRoleDefinition = {
  key: StandardRoleKey;
  name: string;
  description: string;
  roleLevel: number;
  buildPermissions: (allPaths: readonly string[]) => PagePermission[];
};

/**
 * Minimal D1 prepare/bind surface used by role seeding.
 * Kept local so VPS builds (no @cloudflare/workers-types) still typecheck.
 */
type RoleSeedBoundStatement = {
  first: <T = unknown>() => Promise<T | null>;
  run: () => Promise<unknown>;
  all: <T = unknown>() => Promise<{ results?: T[] }>;
};

type RoleSeedStatement = RoleSeedBoundStatement & {
  bind: (...values: unknown[]) => RoleSeedBoundStatement;
};

type RoleSeedD1 = {
  prepare: (query: string) => RoleSeedStatement;
};

const D1_BATCH_LIMIT = 80;

async function runSeedStatements(db: RoleSeedD1, statements: RoleSeedBoundStatement[]): Promise<void> {
  if (!statements.length) return;
  const batch = (db as { batch?: (items: RoleSeedBoundStatement[]) => Promise<unknown> }).batch;
  if (typeof batch === "function") {
    for (let index = 0; index < statements.length; index += D1_BATCH_LIMIT) {
      await batch.call(db, statements.slice(index, index + D1_BATCH_LIMIT));
    }
    return;
  }
  for (const statement of statements) {
    await statement.run();
  }
}

/** All navigable app pages used for RBAC seeding. */
export const ALL_RBAC_PAGE_PATHS: readonly string[] = [
  "/Track/overview/fleet",
  "/Track/activity/trip-timeline",
  "/Track/coaching/driver-debrief",
  "/Track/jobs/default-options",
  "/Track/jobs/message-box",
  "/Track/jobs/instant-messaging",
  "/Track/videos/dashboard",
  "/Track/fleet/assets",
  "/Track/fleet/drivers",
  "/Track/fleet/passengers",
  "/Track/fleet/customers",
  "/Track/journey/workflow",
  "/Track/journey/libraries",
  "/Track/journey/Tracking",
  "/Track/journey/resource-allocation",
  "/Track/routes/workflow",
  "/Track/routes/libraries",
  "/Track/routes/Tracking",
  "/Track/routes/resource-allocation",
  "/Track/hos/dashboard",
  "/Track/hos/overview",
  "/Track/hos/timeline",
  "/Track/hos/log-viewer",
  "/Track/hos/notifications",
  "/Track/hos/timeclock",
  "/Track/tasks/tasks",
  "/Track/tasks/templates",
  "/Track/tasks/workers",
  "/Track/info-hub/streams",
  "/Track/tracking/live",
  "/Track/tracking/historical",
  "/Track/tracking/easytrack",
  "/Track/tracking/Control-locations",
  "/Track/tracking/Control-road-hazards",
  "/Control/config/libraries",
  "/Control/config/templates",
  "/Control/config/configuration-groups",
  "/Control/config/Vivi-d-Track-configuration",
  "/Control/operations/database-administration",
  "/Control/operations/dealer-administration",
  "/Control/operations/organisation-goals",
  "/Control/operations/organisation-groups",
  "/Control/contacts/Control-contacts",
  "/Control/mobile-device-admin",
  "/Control/mobile-device-admin/mitac-software",
  "/Control/user-admin/users",
  "/Control/user-admin/roles",
  "/Control/user-admin/security-groups",
  "/Control/notifications/satellite-assisted-notifications",
  "/Control/notifications/device-Alerts",
  "/Control/user-settings/user-scoring",
  "/Control/user-settings/personal-access-tokens",
  "/Control/user-settings/personal-settings",
  "/Analyze/insights/dashboards",
  "/Analyze/insights/reports",
  "/Analyze/insights/Vivi-insight-agility",
  "/Analyze/insights/subscriptions",
  "/Analyze/insights/Notification-analyser",
  "/Analyze/insights/location-analyser",
  "/Deliver/drone-delivery",
  "/Deliver/orders",
  "/Deliver/drone-live-tracking",
  "/Deliver/drone-historical-tracking",
  "/Deliver/scheduling",
  "/Deliver/clients",
  "/Deliver/drone-groups",
  "/Deliver/regions",
  "/Deliver/health",
  "/Deliver/platform/customer",
  "/Deliver/platform/ground-ops",
  "/Deliver/platform/drone-ops",
  "/Deliver/platform/driver",
  "/Deliver/platform/warehouse",
  "/Deliver/platform/merchant",
  "/Deliver/platform/support",
  "/Deliver/platform/super-admin",
  "/mobile"
];

const perm = (pagePath: string, view: boolean, edit: boolean, deleteFlag: boolean): PagePermission => ({
  pagePath,
  view,
  edit,
  delete: deleteFlag
});

const fromPathSet = (allPaths: readonly string[], allowed: Set<string>, editPaths = new Set<string>(), deletePaths = new Set<string>()) =>
  allPaths
    .filter((pagePath) => allowed.has(pagePath) || editPaths.has(pagePath) || deletePaths.has(pagePath))
    .map((pagePath) => perm(pagePath, allowed.has(pagePath) || editPaths.has(pagePath) || deletePaths.has(pagePath), editPaths.has(pagePath), deletePaths.has(pagePath)));

const fullAccess = (allPaths: readonly string[]) => allPaths.map((pagePath) => perm(pagePath, true, true, true));

const BASIC_VIEW = new Set([
  "/Track/overview/fleet",
  "/Track/activity/trip-timeline",
  "/Track/tracking/live",
  "/Track/tracking/historical",
  "/Track/fleet/assets",
  "/Control/user-settings/personal-settings",
  "/mobile"
]);

const ADVANCED_VIEW = new Set([
  ...BASIC_VIEW,
  "/Track/tracking/easytrack",
  "/Track/fleet/drivers",
  "/Track/fleet/passengers",
  "/Track/fleet/customers",
  "/Track/coaching/driver-debrief",
  "/Track/jobs/message-box",
  "/Track/videos/dashboard",
  "/Analyze/insights/dashboards",
  "/Analyze/insights/reports",
  "/Track/tracking/Control-locations"
]);

const ADVANCED_EDIT = new Set([
  "/Track/fleet/assets",
  "/Track/fleet/drivers",
  "/Track/tracking/live",
  "/Track/tracking/historical",
  "/Control/user-settings/personal-settings"
]);

const DEALER_SUPPORT_VIEW = new Set([
  ...ADVANCED_VIEW,
  "/Control/config/libraries",
  "/Control/config/templates",
  "/Control/config/configuration-groups",
  "/Control/operations/dealer-administration",
  "/Control/user-admin/users",
  "/Control/user-admin/roles",
  "/Control/user-admin/security-groups",
  "/Control/contacts/Control-contacts",
  "/Control/mobile-device-admin",
  "/Control/mobile-device-admin/mitac-software",
  "/Control/notifications/device-Alerts",
  "/Analyze/insights/Notification-analyser",
  "/Analyze/insights/location-analyser"
]);

const DEALER_SUPPORT_EDIT = new Set([
  ...ADVANCED_EDIT,
  "/Control/user-admin/users",
  "/Control/user-admin/security-groups",
  "/Control/config/libraries",
  "/Control/config/configuration-groups",
  "/Control/notifications/device-Alerts"
]);

const OWN_SUPPORT_VIEW = new Set(
  ALL_RBAC_PAGE_PATHS.filter((pagePath) => pagePath !== "/Control/operations/organisation-groups")
);
const OWN_SUPPORT_EDIT = new Set([
  ...DEALER_SUPPORT_EDIT,
  "/Control/user-admin/roles",
  "/Control/user-admin/security-groups",
  "/Control/operations/dealer-administration",
  "/Control/operations/database-administration",
  "/Control/operations/organisation-goals",
  "/Control/config/templates",
  "/Control/config/Vivi-d-Track-configuration",
  "/Control/notifications/satellite-assisted-notifications",
  "/Control/notifications/device-Alerts",
  "/Deliver/drone-delivery",
  "/Deliver/orders",
  "/Deliver/scheduling"
]);

export const STANDARD_ROLE_DEFINITIONS: StandardRoleDefinition[] = [
  {
    key: "admin",
    name: "Admin",
    description: "Full organisation control (create/edit/assign/delete). Can manage dealers and databases without delete, plus sites and assets.",
    roleLevel: 0,
    buildPermissions: (allPaths) => fullAccess(allPaths)
  },
  {
    key: "own-support",
    name: "Own Support",
    description: "Can create/edit/assign dealers and databases (no delete). Organisations are hidden. Any number of sites and assets can be included.",
    roleLevel: 10,
    buildPermissions: (allPaths) => fromPathSet(allPaths, OWN_SUPPORT_VIEW, OWN_SUPPORT_EDIT)
  },
  {
    key: "dealer-support",
    name: "Dealer Support",
    description: "Sees assigned dealers, sites, and assets only. Databases and organisations are hidden.",
    roleLevel: 20,
    buildPermissions: (allPaths) => fromPathSet(allPaths, DEALER_SUPPORT_VIEW, DEALER_SUPPORT_EDIT)
  },
  {
    key: "database-support",
    name: "Database Support",
    description: "Access to exactly one assigned database, with its sites and assets. Nothing above or outside that database is visible.",
    roleLevel: 30,
    buildPermissions: (allPaths) => fromPathSet(allPaths, DEALER_SUPPORT_VIEW, DEALER_SUPPORT_EDIT)
  },
  {
    key: "advanced-user",
    name: "Advanced User",
    description: "End user with access to sites and assets only.",
    roleLevel: 50,
    buildPermissions: (allPaths) => fromPathSet(allPaths, ADVANCED_VIEW, ADVANCED_EDIT)
  },
  {
    key: "basic-user",
    name: "Basic User",
    description: "End user with access to a single site and its assets.",
    roleLevel: 100,
    buildPermissions: (allPaths) => fromPathSet(allPaths, BASIC_VIEW, new Set(["/Control/user-settings/personal-settings"]))
  }
];

export const STANDARD_ROLE_NAMES = STANDARD_ROLE_DEFINITIONS.map((role) => role.name);

const ROLES_WITHOUT_DELIVER = new Set<string>(["basic-user", "advanced-user", "dealer-support", "database-support"]);

export const isDeliverPagePath = (pagePath: string) => {
  const path = String(pagePath ?? "").trim();
  return path === "/Deliver" || path.startsWith("/Deliver/");
};

/** Basic User, Advanced User, and Dealer Support never include Deliver in their catalogue. */
export const standardRoleAllowsPage = (roleKey: string, pagePath: string, roleName = "") => {
  const key = String(roleKey ?? "").trim().toLowerCase();
  const name = String(roleName ?? "").trim().toLowerCase();
  const rejectsDeliver =
    ROLES_WITHOUT_DELIVER.has(key) ||
    name === "basic user" ||
    name === "advanced user" ||
    name === "dealer support" ||
    name === "database support";
  if (!rejectsDeliver) return true;
  return !isDeliverPagePath(pagePath);
};

export const isStandardRoleName = (value: string) =>
  STANDARD_ROLE_NAMES.some((name) => name.toLowerCase() === String(value ?? "").trim().toLowerCase());

export const isAdminLikeRoleName = (value: string) => {
  const name = String(value ?? "").trim().toLowerCase();
  return name === "admin" || name === "tenant admin" || name === "administrator";
};
export const isOwnSupportLikeRoleName = (value: string) => /^(own support|own-support)$/i.test(String(value ?? "").trim());
export const isDealerSupportLikeRoleName = (value: string) => /^dealer support$/i.test(String(value ?? "").trim());
export const isDatabaseSupportLikeRoleName = (value: string) => /^database support$/i.test(String(value ?? "").trim());
export const isSupportLikeRoleName = (value: string) =>
  isAdminLikeRoleName(value) || isOwnSupportLikeRoleName(value) || isDealerSupportLikeRoleName(value) || /support/i.test(String(value ?? "").trim());
export const isAdvancedLikeRoleName = (value: string) =>
  isAdminLikeRoleName(value) ||
  isOwnSupportLikeRoleName(value) ||
  isDealerSupportLikeRoleName(value) ||
  /^advanced user$/i.test(String(value ?? "").trim()) ||
  /advanced/i.test(String(value ?? "").trim());

export const isBasicLikeRoleName = (value: string) => /^basic user$/i.test(String(value ?? "").trim()) || /^basic$/i.test(String(value ?? "").trim());

/**
 * Catalogue of pages a freshly seeded standard role starts with.
 * Session access does not call this. A signed-in user only receives pages
 * checked on roles assigned directly or through a security group.
 */
export function defaultPermissionsForRoleNames(roleNames: string[]): PagePermission[] {
  const names = roleNames.map((name) => String(name ?? "").trim()).filter(Boolean);
  if (!names.length) return [];
  const ranked = [...STANDARD_ROLE_DEFINITIONS].sort((a, b) => a.roleLevel - b.roleLevel);
  for (const definition of ranked) {
    const matched = names.some((name) => {
      const key = name.toLowerCase();
      return key === definition.name.toLowerCase() || key === definition.key;
    });
    if (!matched) continue;
    return definition.buildPermissions(ALL_RBAC_PAGE_PATHS).filter((row) => row.view || row.edit || row.delete);
  }
  if (names.some((name) => isAdminLikeRoleName(name))) return fullAccess(ALL_RBAC_PAGE_PATHS);
  return [];
}

export async function ensureStandardRolesForTenant(db: RoleSeedD1, tenantId: string): Promise<void> {
  const normalizedTenant = String(tenantId ?? "").trim();
  if (!normalizedTenant) return;

  try {
    await db
      .prepare(
        `DELETE FROM rbac_role_permissions
         WHERE tenant_id = ?1
           AND (page_path = '/Deliver' OR page_path LIKE '/Deliver/%')
           AND role_id IN (
             SELECT id FROM rbac_roles
             WHERE tenant_id = ?1
               AND standard_role_key IN ('basic-user', 'advanced-user', 'dealer-support', 'database-support')
           )`
      )
      .bind(normalizedTenant)
      .run();
  } catch {
    // Best-effort: read-time filtering still hides these pages.
  }

  // Fast path: all standard roles exist and already have a permission matrix.
  // Never re-open the seed because Admin has fewer pages than the current catalogue —
  // that previously re-granted unchecked pages (including Deliver) on every /rbac/roles call.
  try {
    const seedStatus = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM rbac_roles
             WHERE tenant_id = ?1 AND standard_role_key IS NOT NULL AND TRIM(standard_role_key) != '') AS roleCount,
           (SELECT COUNT(DISTINCT LOWER(standard_role_key)) FROM rbac_roles
             WHERE tenant_id = ?1 AND standard_role_key IN (${STANDARD_ROLE_DEFINITIONS.map((d) => `'${d.key}'`).join(",")})) AS distinctKeyCount,
           (SELECT COUNT(*) FROM rbac_roles r
             WHERE r.tenant_id = ?1
               AND r.standard_role_key IS NOT NULL
               AND TRIM(r.standard_role_key) != ''
               AND NOT EXISTS (
                 SELECT 1 FROM rbac_role_permissions p
                 WHERE p.tenant_id = r.tenant_id AND p.role_id = r.id
               )) AS emptyPermRoleCount`
      )
      .bind(normalizedTenant)
      .first<{ roleCount: number; distinctKeyCount: number; emptyPermRoleCount: number }>();
    const distinctKeyCount = Number(seedStatus?.distinctKeyCount ?? 0);
    const emptyPermRoleCount = Number(seedStatus?.emptyPermRoleCount ?? 0);
    if (distinctKeyCount >= STANDARD_ROLE_DEFINITIONS.length && emptyPermRoleCount === 0) {
      return;
    }
  } catch {
    // If the probe fails, do not fall through to hundreds of sequential writes — that
    // previously returned Cloudflare 1102 on GET /rbac/roles.
    return;
  }

  const now = new Date().toISOString();
  const existingRoleRows = await db
    .prepare(
      `SELECT id, name, standard_role_key AS standardRoleKey
       FROM rbac_roles
       WHERE tenant_id = ?1`
    )
    .bind(normalizedTenant)
    .all<{ id?: string; name?: string; standardRoleKey?: string }>();
  const existingByKey = new Map<string, string>();
  const existingByName = new Map<string, string>();
  for (const row of existingRoleRows.results ?? []) {
    const id = String(row?.id ?? "").trim();
    if (!id) continue;
    const key = String(row?.standardRoleKey ?? "").trim().toLowerCase();
    const name = String(row?.name ?? "").trim().toLowerCase();
    if (key) existingByKey.set(key, id);
    if (name) existingByName.set(name, id);
  }

  const existingPermRows = await db
    .prepare(
      `SELECT role_id AS roleId, page_path AS pagePath
       FROM rbac_role_permissions
       WHERE tenant_id = ?1`
    )
    .bind(normalizedTenant)
    .all<{ roleId?: string; pagePath?: string }>();
  const existingPermKeys = new Set(
    (existingPermRows.results ?? [])
      .map((row) => `${String(row?.roleId ?? "").trim()}::${String(row?.pagePath ?? "").trim()}`)
      .filter((key) => key !== "::")
  );

  const statements: RoleSeedBoundStatement[] = [];

  for (const definition of STANDARD_ROLE_DEFINITIONS) {
    const existingId = existingByKey.get(definition.key) || existingByName.get(definition.name.toLowerCase());
    const roleId = existingId || crypto.randomUUID();
    if (!existingId) {
      statements.push(
        db
          .prepare(
            `INSERT INTO rbac_roles (id, tenant_id, name, description, status, role_level, standard_role_key, is_system, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6, 1, ?7, ?7)`
          )
          .bind(roleId, normalizedTenant, definition.name, definition.description, definition.roleLevel, definition.key, now)
      );
    } else if (!existingByKey.get(definition.key)) {
      statements.push(
        db
          .prepare(
            `UPDATE rbac_roles
             SET standard_role_key = ?3, is_system = 1, updated_at = ?4
             WHERE tenant_id = ?2 AND id = ?1`
          )
          .bind(roleId, normalizedTenant, definition.key, now)
      );
    }

    const roleAlreadyHasPermissions = [...existingPermKeys].some((key) => key.startsWith(`${roleId}::`));
    if (roleAlreadyHasPermissions) continue;

    const permissions = definition.buildPermissions(ALL_RBAC_PAGE_PATHS);
    for (const row of permissions) {
      if (!row.view && !row.edit && !row.delete) continue;
      const permKey = `${roleId}::${row.pagePath}`;
      if (existingPermKeys.has(permKey)) continue;
      statements.push(
        db
          .prepare(
            `INSERT INTO rbac_role_permissions (tenant_id, role_id, page_path, can_view, can_edit, can_delete)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(tenant_id, role_id, page_path) DO NOTHING`
          )
          .bind(normalizedTenant, roleId, row.pagePath, row.view ? 1 : 0, row.edit ? 1 : 0, row.delete ? 1 : 0)
      );
    }
  }

  await runSeedStatements(db, statements);
}
