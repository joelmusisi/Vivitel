import { personalAssignmentScope, type SharedDemoScopeRef } from "./regionHierarchy";
import {
  isAdminLikeRoleName,
  isAdvancedLikeRoleName,
  isBasicLikeRoleName,
  isDealerSupportLikeRoleName,
  isDatabaseSupportLikeRoleName,
  isOwnSupportLikeRoleName
} from "./standardRoles";

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
  key: "admin" | "own-support" | "dealer-support" | "database-support" | "advanced-user" | "basic-user" | "custom";
  maxSites: number | null;
  minDatabases: number;
  maxDatabases: number | null;
  visibility: HierarchyVisibility;
  canAssignDealer: boolean;
  canAssignOrganisation: boolean;
  canAssignDatabase: boolean;
  canAssignSite: boolean;
  databaseOnlyNavigation: boolean;
  flattenOrganisations: boolean;
  hierarchy: Record<HierarchySegment, HierarchyLevelCapabilities>;
};

const fullVisibility = (): HierarchyVisibility => ({
  showDealer: true,
  showOrganisation: true,
  showDatabase: true,
  showSite: true,
  showAsset: true
});

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
  if (key === "advanced-user" || key === "basic-user" || key === "database-support") {
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

export const resolveRoleScopeRules = (roleNames: string[]): RoleScopeRules => {
  const names = roleNames.map((name) => String(name ?? "").trim()).filter(Boolean);
  if (names.some(isAdminLikeRoleName)) {
    const hierarchy = resolveHierarchyCapabilities("admin");
    return {
      key: "admin",
      maxSites: null,
      minDatabases: 0,
      maxDatabases: null,
      visibility: fullVisibility(),
      canAssignDealer: true,
      canAssignOrganisation: true,
      canAssignDatabase: true,
      canAssignSite: true,
      databaseOnlyNavigation: false,
      flattenOrganisations: false,
      hierarchy
    };
  }
  if (names.some(isOwnSupportLikeRoleName)) {
    const hierarchy = resolveHierarchyCapabilities("own-support");
    return {
      key: "own-support",
      maxSites: null,
      minDatabases: 0,
      maxDatabases: null,
      visibility: {
        showDealer: false,
        showOrganisation: true,
        showDatabase: true,
        showSite: true,
        showAsset: true
      },
      canAssignDealer: true,
      canAssignOrganisation: false,
      canAssignDatabase: true,
      canAssignSite: true,
      databaseOnlyNavigation: false,
      flattenOrganisations: false,
      hierarchy
    };
  }
  if (names.some(isDealerSupportLikeRoleName)) {
    const hierarchy = resolveHierarchyCapabilities("dealer-support");
    return {
      key: "dealer-support",
      maxSites: null,
      minDatabases: 0,
      maxDatabases: null,
      visibility: {
        showDealer: false,
        showOrganisation: true,
        showDatabase: false,
        showSite: true,
        showAsset: true
      },
      canAssignDealer: true,
      canAssignOrganisation: false,
      canAssignDatabase: false,
      canAssignSite: true,
      databaseOnlyNavigation: false,
      flattenOrganisations: false,
      hierarchy
    };
  }
  if (names.some(isDatabaseSupportLikeRoleName)) {
    const hierarchy = resolveHierarchyCapabilities("database-support");
    return {
      key: "database-support",
      maxSites: null,
      minDatabases: 1,
      maxDatabases: 1,
      visibility: {
        showDealer: false,
        showOrganisation: false,
        showDatabase: true,
        showSite: true,
        showAsset: true
      },
      canAssignDealer: false,
      canAssignOrganisation: false,
      canAssignDatabase: true,
      canAssignSite: true,
      databaseOnlyNavigation: false,
      flattenOrganisations: false,
      hierarchy
    };
  }
  if (names.some(isAdvancedLikeRoleName)) {
    const hierarchy = resolveHierarchyCapabilities("advanced-user");
    return {
      key: "advanced-user",
      maxSites: null,
      minDatabases: 0,
      maxDatabases: null,
      visibility: {
        showDealer: false,
        showOrganisation: false,
        showDatabase: false,
        showSite: true,
        showAsset: true
      },
      canAssignDealer: false,
      canAssignOrganisation: false,
      canAssignDatabase: true,
      canAssignSite: true,
      databaseOnlyNavigation: false,
      flattenOrganisations: false,
      hierarchy
    };
  }
  if (names.some(isBasicLikeRoleName)) {
    const hierarchy = resolveHierarchyCapabilities("basic-user");
    return {
      key: "basic-user",
      maxSites: 1,
      minDatabases: 0,
      maxDatabases: null,
      visibility: {
        showDealer: false,
        showOrganisation: false,
        showDatabase: false,
        showSite: true,
        showAsset: true
      },
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
    maxDatabases: null,
    visibility: fullVisibility(),
    canAssignDealer: false,
    canAssignOrganisation: false,
    canAssignDatabase: true,
    canAssignSite: true,
    databaseOnlyNavigation: false,
    flattenOrganisations: false,
    hierarchy
  };
};

export type AssignmentValidationInput = {
  tenantIds: string[];
  siteIds: string[];
  siteAssignments?: SharedDemoScopeRef[];
};

export type SiteAssignmentRef = {
  tenantId: string;
  siteId: string;
};

export const isActorAdminScope = (flags: { isAdmin?: boolean; isTenantAdmin?: boolean }) =>
  Boolean(flags.isAdmin || flags.isTenantAdmin);

export const tenantIdsWithinActorAccess = (
  actorAllowedTenantIds: string[],
  targetTenantIds: string[],
  unrestricted = false
): boolean => {
  if (unrestricted) return true;
  const allowed = new Set(actorAllowedTenantIds.map((value) => String(value ?? "").trim()).filter(Boolean));
  if (!allowed.size) return false;
  const targets = targetTenantIds.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (!targets.length) return false;
  return targets.every((tenantId) => allowed.has(tenantId));
};

export const sitesWithinActorAccessForTenant = (
  actorSiteIds: string[],
  targetSiteIds: string[],
  unrestricted = false
): boolean => {
  if (unrestricted) return true;
  const actorSites = actorSiteIds.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (!actorSites.length) return true;
  const targets = targetSiteIds.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (!targets.length) return true;
  return targets.every((siteId) => actorSites.includes(siteId));
};

export const validateAssignmentWithinActorAccess = (
  actorAllowedTenantIds: string[],
  actorSiteIdsByTenant: Record<string, string[]>,
  assignmentTenantIds: string[],
  siteAssignments: SiteAssignmentRef[],
  unrestricted = false
): string | null => {
  if (unrestricted) return null;

  const allowedTenants = actorAllowedTenantIds.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (!allowedTenants.length) {
    return "You do not have any database allocations to assign users.";
  }

  const tenants = assignmentTenantIds.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (!tenants.length) {
    return "Select at least one database within your allocated scope.";
  }

  const allowed = new Set(allowedTenants);
  for (const tenantId of tenants) {
    if (!allowed.has(tenantId)) {
      return "You can only assign users to databases you have access to.";
    }
  }

  for (const assignment of siteAssignments) {
    const tenantId = String(assignment.tenantId ?? "").trim();
    const siteId = String(assignment.siteId ?? "").trim();
    if (!tenantId || !siteId) continue;
    if (!allowed.has(tenantId)) {
      return "You can only assign sites within your allocated databases.";
    }
    const actorSites = (actorSiteIdsByTenant[tenantId] ?? []).map((value) => String(value ?? "").trim()).filter(Boolean);
    if (actorSites.length && !actorSites.includes(siteId)) {
      return "You can only assign sites you have access to.";
    }
  }

  return null;
};

export const validateAssignmentForRoleScope = (
  roleNames: string[],
  input: AssignmentValidationInput
): string | null => {
  const rules = resolveRoleScopeRules(roleNames);
  const personal = personalAssignmentScope(input.tenantIds, input.siteIds, input.siteAssignments ?? []);
  const tenantIds = personal.tenantIds;
  const siteIds = personal.siteIds;

  if (rules.minDatabases > 0 && tenantIds.length < rules.minDatabases) {
    return `This role requires at least ${rules.minDatabases} database assignment(s).`;
  }
  if (rules.maxDatabases !== null && tenantIds.length > rules.maxDatabases) {
    return `This role allows at most ${rules.maxDatabases} database assignment(s).`;
  }
  if (rules.maxSites !== null && siteIds.length > rules.maxSites) {
    return rules.maxSites === 1
      ? "Basic User accounts can only be assigned to one site."
      : `This role allows at most ${rules.maxSites} site assignment(s).`;
  }
  if (rules.key === "basic-user" && tenantIds.length === 0 && siteIds.length === 0) {
    return "Basic User accounts require one database and exactly one site.";
  }
  if (rules.key === "basic-user" && siteIds.length !== 1) {
    return "Basic User accounts must have exactly one site assigned.";
  }
  if (rules.key === "advanced-user" && siteIds.length === 0 && tenantIds.length === 0) {
    return "Advanced User accounts require at least one database or one site.";
  }
  return null;
};

type HierarchySite = { id: string; name: string; assets?: unknown[]; traccarGroupId?: string };
type HierarchyDb = { id: string; name: string; sites: HierarchySite[] };
type HierarchyOrg = { id: string; name: string; databases: HierarchyDb[] };
type HierarchyDealer = { id: string; name: string; organisations: HierarchyOrg[] };
export type HierarchyRoot = { dealers: HierarchyDealer[]; updatedAt?: string };

const parseTenantParts = (tenantId: string) => {
  const parts = String(tenantId ?? "")
    .split(":")
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return {
    dealerId: parts[0] ?? "",
    orgId: parts[1] ?? "",
    dbId: parts[2] ?? ""
  };
};

const emptyHierarchy = (): HierarchyRoot => ({ dealers: [], updatedAt: new Date().toISOString() });

/**
 * True when a grant covers a concrete dealer/org/database path.
 * Supports dealer-only (`dealer`), org-level (`dealer:org`), and exact DB (`dealer:org:db`) grants.
 * Dealer Support grants expand to the whole assigned dealer so new child nodes stay visible.
 */
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

export const filterHierarchyForActorScope = (
  hierarchy: HierarchyRoot,
  allowedTenantIds: string[],
  siteIds: string[],
  roleNames: string[],
  isPlatformAdmin = false,
  siteNames: string[] = []
): HierarchyRoot => {
  if (isPlatformAdmin) return hierarchy;

  const rules = resolveRoleScopeRules(roleNames);
  // Admin sees the full tree. Own Support sees everything except Organisations (UI hides that column).
  if (rules.key === "admin") return hierarchy;

  const databaseSupport = rules.key === "database-support";
  const tenants = allowedTenantIds
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value) => !databaseSupport || value.split(":").filter(Boolean).length >= 3);
  const scopedSiteIds = siteIds.map((value) => String(value ?? "").trim()).filter(Boolean);
  const scopedSiteNames = siteNames
    .map((value) => hierarchySiteNameToken(value))
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);

  if (rules.key === "own-support") {
    // Own Support keeps platform-wide dealers/databases/sites; Organisations column is hidden in UI.
    return hierarchy;
  }

  // No grants → no tree. Never fall back to the shared hierarchy (cross-tenant leak).
  if (!tenants.length && !scopedSiteIds.length && !scopedSiteNames.length) {
    return emptyHierarchy();
  }

  const expandDealerSupportToDealer = rules.key === "dealer-support";
  const dealers: HierarchyDealer[] = [];

  for (const dealer of hierarchy.dealers ?? []) {
    const organisations: HierarchyOrg[] = [];
    for (const org of dealer.organisations ?? []) {
      const databases: HierarchyDb[] = [];
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
