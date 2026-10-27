import { personalAssignmentScope, type SharedDemoScopeRef } from "./regionHierarchy";
import { STANDARD_ROLES } from "./standardRoles";

export type HierarchyVisibility = {
  showDealer: boolean;
  showOrganisation: boolean;
  showDatabase: boolean;
  showSite: boolean;
  showAsset: boolean;
};

/** Code segment names (UI: dealer=Organisation, organisation=Dealer). */
export type HierarchySegment = "dealer" | "organisation" | "database" | "site" | "asset";
export type HierarchyAction = "create" | "edit" | "assign" | "delete";

export type HierarchyLevelCapabilities = {
  create: boolean;
  edit: boolean;
  assign: boolean;
  delete: boolean;
};

export type RoleScopeRules = {
  key: string;
  maxSites: number | null;
  minDatabases: number;
  visibility: HierarchyVisibility;
  canAssignDealer: boolean;
  canAssignOrganisation: boolean;
  canAssignDatabase: boolean;
  canAssignSite: boolean;
  databaseOnlyNavigation: boolean;
  flattenOrganisations: boolean;
  hierarchy: Record<HierarchySegment, HierarchyLevelCapabilities>;
};

const none = (): HierarchyLevelCapabilities => ({ create: false, edit: false, assign: false, delete: false });
const manageNoDelete = (): HierarchyLevelCapabilities => ({ create: true, edit: true, assign: true, delete: false });
const full = (): HierarchyLevelCapabilities => ({ create: true, edit: true, assign: true, delete: true });
const manageSitesAssets = (): HierarchyLevelCapabilities => ({ create: true, edit: true, assign: true, delete: false });

/**
 * Default hierarchy access control (UI labels):
 * - Organisations (code: dealer): Admin only
 * - Dealers (code: organisation): Admin + Own Support manage; Dealer Support sees assigned only
 * - Databases: Admin + Own Support (Dealer Support does not see/access databases)
 * - Sites / Assets: Admin + Own Support + Dealer Support + End users
 */
export const resolveHierarchyCapabilities = (
  key: RoleScopeRules["key"]
): Record<HierarchySegment, HierarchyLevelCapabilities> => {
  if (key === "admin") {
    return {
      dealer: full(),
      organisation: manageNoDelete(),
      database: manageNoDelete(),
      site: manageSitesAssets(),
      asset: manageSitesAssets()
    };
  }
  if (key === "own-support") {
    return {
      dealer: none(),
      organisation: manageNoDelete(),
      database: manageNoDelete(),
      site: manageSitesAssets(),
      asset: manageSitesAssets()
    };
  }
  if (key === "dealer-support") {
    return {
      dealer: none(),
      organisation: none(),
      database: none(),
      site: manageSitesAssets(),
      asset: manageSitesAssets()
    };
  }
  if (key === "advanced-user" || key === "database-support") {
    return {
      dealer: none(),
      organisation: none(),
      database: none(),
      site: manageSitesAssets(),
      asset: manageSitesAssets()
    };
  }
  return {
    dealer: none(),
    organisation: none(),
    database: none(),
    site: none(),
    asset: none()
  };
};

export const canManageHierarchyLevel = (
  rules: Pick<RoleScopeRules, "hierarchy">,
  segment: HierarchySegment,
  action: HierarchyAction
): boolean => Boolean(rules.hierarchy?.[segment]?.[action]);

const isAdminLike = (name: string) => /^admin$/i.test(name);
const isOwnSupportLike = (name: string) => /^(own support|own-support)$/i.test(name);
const isDealerSupportLike = (name: string) => /^dealer support$/i.test(name);
const isDatabaseSupportLike = (name: string) => /^database support$/i.test(name);
const isAdvancedLike = (name: string) => /^advanced user$/i.test(name) || /advanced/i.test(name);
const isBasicLike = (name: string) => /^basic user$/i.test(name) || /^basic$/i.test(name);

export const resolveRoleScopeRulesByName = (roleName: string): RoleScopeRules => {
  return resolveRoleScopeRulesFromNames([roleName]);
};

export const resolveRoleScopeRulesFromNames = (roleNames: string[]): RoleScopeRules => {
  const names = roleNames.map((name) => String(name ?? "").trim()).filter(Boolean);
  if (names.some(isAdminLike)) {
    const hierarchy = resolveHierarchyCapabilities("admin");
    return {
      key: "admin",
      maxSites: null,
      minDatabases: 0,
      visibility: { showDealer: true, showOrganisation: true, showDatabase: true, showSite: true, showAsset: true },
      canAssignDealer: true,
      canAssignOrganisation: true,
      canAssignDatabase: true,
      canAssignSite: true,
      databaseOnlyNavigation: false,
      flattenOrganisations: false,
      hierarchy
    };
  }
  if (names.some(isOwnSupportLike)) {
    const hierarchy = resolveHierarchyCapabilities("own-support");
    return {
      key: "own-support",
      maxSites: null,
      minDatabases: 0,
      // Organisations (code: dealer) are hidden from Own Support.
      visibility: { showDealer: false, showOrganisation: true, showDatabase: true, showSite: true, showAsset: true },
      canAssignDealer: true,
      canAssignOrganisation: false,
      canAssignDatabase: true,
      canAssignSite: true,
      databaseOnlyNavigation: false,
      flattenOrganisations: false,
      hierarchy
    };
  }
  if (names.some(isDealerSupportLike)) {
    const hierarchy = resolveHierarchyCapabilities("dealer-support");
    return {
      key: "dealer-support",
      maxSites: null,
      minDatabases: 0,
      // Databases are hidden; Dealer Support sees assigned Dealers + sites + assets.
      visibility: { showDealer: false, showOrganisation: true, showDatabase: false, showSite: true, showAsset: true },
      canAssignDealer: true,
      canAssignOrganisation: false,
      canAssignDatabase: false,
      canAssignSite: true,
      databaseOnlyNavigation: false,
      flattenOrganisations: false,
      hierarchy
    };
  }
  if (names.some(isDatabaseSupportLike)) {
    const hierarchy = resolveHierarchyCapabilities("database-support");
    return {
      key: "database-support",
      maxSites: null,
      minDatabases: 1,
      visibility: { showDealer: false, showOrganisation: false, showDatabase: true, showSite: true, showAsset: true },
      canAssignDealer: false,
      canAssignOrganisation: false,
      canAssignDatabase: true,
      canAssignSite: true,
      databaseOnlyNavigation: false,
      flattenOrganisations: false,
      hierarchy
    };
  }
  if (names.some(isAdvancedLike)) {
    const hierarchy = resolveHierarchyCapabilities("advanced-user");
    return {
      key: "advanced-user",
      maxSites: null,
      minDatabases: 0,
      visibility: { showDealer: false, showOrganisation: false, showDatabase: false, showSite: true, showAsset: true },
      canAssignDealer: false,
      canAssignOrganisation: false,
      canAssignDatabase: true,
      canAssignSite: true,
      databaseOnlyNavigation: false,
      flattenOrganisations: false,
      hierarchy
    };
  }
  if (names.some(isBasicLike)) {
    const hierarchy = resolveHierarchyCapabilities("basic-user");
    return {
      key: "basic-user",
      maxSites: 1,
      minDatabases: 0,
      visibility: { showDealer: false, showOrganisation: false, showDatabase: false, showSite: true, showAsset: true },
      canAssignDealer: false,
      canAssignOrganisation: false,
      canAssignDatabase: true,
      canAssignSite: true,
      databaseOnlyNavigation: false,
      flattenOrganisations: false,
      hierarchy
    };
  }
  const hierarchy = resolveHierarchyCapabilities("custom");
  return {
    key: "custom",
    maxSites: null,
    minDatabases: 0,
    visibility: { showDealer: false, showOrganisation: false, showDatabase: true, showSite: true, showAsset: true },
    canAssignDealer: false,
    canAssignOrganisation: false,
    canAssignDatabase: true,
    canAssignSite: true,
    databaseOnlyNavigation: false,
    flattenOrganisations: false,
    hierarchy
  };
};

export const resolveRoleScopeRulesFromPrincipal = (principal: any): RoleScopeRules => {
  if (String(principal?.kind ?? "").trim().toLowerCase() === "admin") {
    return resolveRoleScopeRulesFromNames(["Admin"]);
  }
  const roleNames = Array.isArray(principal?.roleNames) ? principal.roleNames : [];
  if (Boolean(principal?.isTenantAdmin)) return resolveRoleScopeRulesFromNames(["Admin"]);
  if (Boolean(principal?.isOwnSupport)) return resolveRoleScopeRulesFromNames(["Own Support"]);
  if (Boolean(principal?.isDealerSupport)) return resolveRoleScopeRulesFromNames(["Dealer Support"]);
  if (Boolean(principal?.isDatabaseSupport)) return resolveRoleScopeRulesFromNames(["Database Support"]);
  if (Boolean(principal?.isAdvanced)) return resolveRoleScopeRulesFromNames(["Advanced User"]);
  return resolveRoleScopeRulesFromNames(roleNames);
};

export const validateAssignmentDraft = (
  roleName: string,
  tenantIds: string[],
  siteIds: string[],
  siteAssignments: SharedDemoScopeRef[] = []
): string | null => {
  const personal = personalAssignmentScope(tenantIds, siteIds, siteAssignments);
  tenantIds = personal.tenantIds;
  siteIds = personal.siteIds;
  const rules = resolveRoleScopeRulesByName(roleName);
  if (rules.minDatabases > 0 && tenantIds.length < rules.minDatabases) {
    return `Select at least ${rules.minDatabases} database(s) for ${roleName}.`;
  }
  if (rules.key === "database-support" && tenantIds.length !== 1) {
    return "Database Support accounts must be assigned to exactly one database.";
  }
  if (rules.maxSites !== null && siteIds.length > rules.maxSites) {
    return rules.maxSites === 1
      ? "Basic User accounts can only have one site."
      : `This role allows at most ${rules.maxSites} site(s).`;
  }
  if (rules.key === "basic-user" && siteIds.length !== 1) {
    return "Basic User accounts must have exactly one site.";
  }
  if (rules.key === "basic-user" && tenantIds.length === 0) {
    return "Select a database for the Basic User.";
  }
  if (rules.key === "advanced-user" && tenantIds.length === 0 && siteIds.length === 0) {
    return "Select at least one database or site for the Advanced User.";
  }
  return null;
};

export const validateEditorAssignmentDraft = (
  allowedTenantIds: string[],
  assignmentTenantIds: string[],
  siteAssignments: Array<{ tenantId: string; siteId: string }>,
  unrestricted = false
): string | null => {
  if (unrestricted) return null;
  const allowed = new Set(allowedTenantIds.map((value) => String(value ?? "").trim()).filter(Boolean));
  if (!allowed.size) return "You do not have any database allocations to assign users.";
  for (const tenantId of assignmentTenantIds) {
    if (!allowed.has(String(tenantId ?? "").trim())) {
      return "You can only assign users within your allocated databases.";
    }
  }
  for (const assignment of siteAssignments) {
    const tenantId = String(assignment.tenantId ?? "").trim();
    const siteId = String(assignment.siteId ?? "").trim();
    if (!tenantId || !siteId) continue;
    if (!allowed.has(tenantId)) return "You can only assign sites within your allocated databases.";
  }
  return null;
};

export const standardRoleScopeSummary = (roleName: string): string => {
  const match = STANDARD_ROLES.find((role) => role.name.toLowerCase() === roleName.toLowerCase());
  if (!match) return "";
  switch (match.key) {
    case "database-support":
      return "One database only, with its sites and assets. Nothing above or outside that database is visible.";
    case "basic-user":
      return "Sites and assets only. Cannot manage organisations, dealers, or databases.";
    case "advanced-user":
      return "Sites and assets only. Cannot manage organisations, dealers, or databases.";
    case "dealer-support":
      return "Sees assigned dealers, sites, and assets only. Databases and organisations are hidden.";
    case "own-support":
      return "Choose dealers, databases, and any number of sites. Leave sites empty to include every site in that scope. Organisations are hidden.";
    case "admin":
      return "Full control of organisations (including delete). Can create/edit/assign dealers and databases (no delete). Sites and assets included.";
    default:
      return "";
  }
};

type ScopeDealer = {
  id: string;
  name: string;
  organisations: Array<{
    id: string;
    name: string;
    databases: Array<{
      id: string;
      name: string;
      sites: Array<{ id: string; name: string; assets?: unknown[] }>;
    }>;
  }>;
};

type HierarchyRoot = { dealers: ScopeDealer[]; updatedAt?: string };

const parseTenantParts = (tenantId: string) => {
  const parts = String(tenantId ?? "")
    .split(":")
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return { dealerId: parts[0] ?? "", orgId: parts[1] ?? "", dbId: parts[2] ?? "" };
};

const emptyHierarchy = (): HierarchyRoot => ({ dealers: [], updatedAt: new Date().toISOString() });

/** True when a grant covers a concrete dealer/org/database path (including parent prefixes). */
export const grantCoversHierarchyPath = (
  grantTenantId: string,
  dealerId: string,
  orgId: string,
  dbId: string,
  options?: { expandDealerSupportToDealer?: boolean }
): boolean => {
  const grant = String(grantTenantId ?? "").trim();
  const targetDealer = String(dealerId ?? "").trim();
  const targetOrg = String(orgId ?? "").trim();
  const targetDb = String(dbId ?? "").trim();
  if (!grant || !targetDealer) return false;

  const parts = parseTenantParts(grant);
  if (!parts.dealerId || parts.dealerId !== targetDealer) return false;

  if (options?.expandDealerSupportToDealer) return true;

  if (!parts.orgId) return true;
  if (!targetOrg || parts.orgId !== targetOrg) return false;
  if (!parts.dbId) return true;
  return Boolean(targetDb) && parts.dbId === targetDb;
};

const hierarchySiteNameToken = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const siteMatchesActorScope = (
  site: { id?: string; name?: string },
  scopedSiteIds: string[],
  scopedSiteNames: string[]
) => {
  if (!scopedSiteIds.length && !scopedSiteNames.length) return true;
  const siteId = String(site?.id ?? "").trim();
  if (siteId && scopedSiteIds.includes(siteId)) return true;
  const nameTok = hierarchySiteNameToken(site?.name);
  return Boolean(nameTok) && scopedSiteNames.includes(nameTok);
};

const filterHierarchyForActorScope = (
  hierarchy: HierarchyRoot,
  allowedTenantIds: string[],
  siteIds: string[],
  roleNames: string[],
  isPlatformAdmin = false,
  siteNames: string[] = []
): HierarchyRoot => {
  if (isPlatformAdmin) return hierarchy;

  const rules = resolveRoleScopeRulesFromNames(roleNames);
  if (rules.key === "admin") return hierarchy;
  if (rules.key === "own-support") return hierarchy;

  const tenants = allowedTenantIds
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value) => rules.key !== "database-support" || value.split(":").filter(Boolean).length >= 3);
  const scopedSiteIds = siteIds.map((value) => String(value ?? "").trim()).filter(Boolean);
  const scopedSiteNames = siteNames
    .map((value) => hierarchySiteNameToken(value))
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);

  // No grants → no tree. Never fall back to the shared hierarchy (cross-tenant leak).
  if (!tenants.length && !scopedSiteIds.length && !scopedSiteNames.length) return emptyHierarchy();

  const expandDealerSupportToDealer = rules.key === "dealer-support";
  const dealers: ScopeDealer[] = [];

  for (const dealer of hierarchy.dealers ?? []) {
    const organisations: ScopeDealer["organisations"] = [];
    for (const org of dealer.organisations ?? []) {
      const databases: ScopeDealer["organisations"][number]["databases"] = [];
      for (const db of org.databases ?? []) {
        const covered = tenants.some((grant) =>
          grantCoversHierarchyPath(grant, dealer.id, org.id, db.id, { expandDealerSupportToDealer })
        );
        if (!covered) continue;
        const visibleSites =
          scopedSiteIds.length > 0 || scopedSiteNames.length > 0
            ? db.sites.filter((site) => siteMatchesActorScope(site, scopedSiteIds, scopedSiteNames))
            : db.sites;
        databases.push({ ...db, sites: visibleSites });
      }
      if (!databases.length) continue;
      organisations.push({ ...org, databases });
    }
    if (!organisations.length) continue;
    dealers.push({ ...dealer, organisations });
  }

  if (!dealers.length) return emptyHierarchy();

  if (rules.flattenOrganisations) {
    return {
      dealers: dealers.map((dealer) => ({
        ...dealer,
        organisations: [
          {
            id: `${dealer.id}__scope_org`,
            name: "Databases",
            databases: dealer.organisations.flatMap((org) => org.databases)
          }
        ]
      })),
      updatedAt: hierarchy.updatedAt
    };
  }

  if (rules.databaseOnlyNavigation) {
    const databases = dealers.flatMap((dealer) => dealer.organisations.flatMap((org) => org.databases));
    return {
      dealers: [
        {
          id: "__scope_dealer",
          name: "Databases",
          organisations: [
            {
              id: "__scope_org",
              name: "Assigned databases",
              databases
            }
          ]
        }
      ],
      updatedAt: hierarchy.updatedAt
    };
  }

  return { dealers, updatedAt: hierarchy.updatedAt };
};

export const filterDealerRowsForActorScope = (
  rows: ScopeDealer[],
  allowedTenantIds: string[],
  siteIds: string[],
  roleNames: string[],
  isPlatformAdmin = false,
  siteNames: string[] = []
): ScopeDealer[] => {
  return filterHierarchyForActorScope(
    { dealers: rows, updatedAt: "" },
    allowedTenantIds,
    siteIds,
    roleNames,
    isPlatformAdmin,
    siteNames
  ).dealers;
};
