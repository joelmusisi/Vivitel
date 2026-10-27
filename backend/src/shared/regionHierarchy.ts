import type { RegionId } from "./regionServers";

type HierarchySiteLike = { id?: string; name?: string; traccarGroupId?: number };
type HierarchyDatabaseLike = { id?: string; name?: string; sites?: HierarchySiteLike[] };
type HierarchyOrgLike = { id?: string; name?: string; databases?: HierarchyDatabaseLike[] };
type HierarchyDealerLike = { id?: string; name?: string; organisations?: HierarchyOrgLike[] };
type HierarchyRootLike = { dealers?: HierarchyDealerLike[]; updatedAt?: string };

const compactName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** Database that owns the ZA 808 fleet (AFRICA / EAST AFRICA / Advanced Securities / Karongo). */
export const isZaHierarchyDatabaseName = (name: unknown) => {
  const compact = compactName(name);
  return compact === "advancedsecurities" || compact === "advancedsecurity";
};

export const isZaHierarchySiteName = (name: unknown) => compactName(name) === "karongo";

const siteBelongsOnZa = (site: HierarchySiteLike) => isZaHierarchySiteName(site?.name);

/** Stable Demo tree. UI labels: dealer = Organisation, organisation = Dealer. */
export const DEMO_HIERARCHY_IDS = {
  organisation: "demo-organisation",
  dealer: "demo-dealer",
  database: "demo-database",
  site: "demo-site"
} as const;

export const DEMO_TENANT_ID = `${DEMO_HIERARCHY_IDS.organisation}:${DEMO_HIERARCHY_IDS.dealer}:${DEMO_HIERARCHY_IDS.database}`;

/** Shared Demo database, including when it sits under another organisation id. */
export const isSharedDemoDatabaseTenant = (tenantId: unknown) => {
  const id = String(tenantId ?? "").trim();
  if (!id) return false;
  if (id === DEMO_TENANT_ID) return true;
  const databaseId = id.split(":").filter(Boolean).pop() ?? "";
  return databaseId === DEMO_HIERARCHY_IDS.database;
};

export const isDemoHierarchyName = (name: unknown) => compactName(name) === "demo";

/** Legacy single-segment tenant ids that are not a dealer:org:database path. */
export const isLegacyFlatTenantId = (tenantId: unknown) => {
  const id = String(tenantId ?? "").trim().toLowerCase();
  return id === "west-africa" || id === "default";
};

export type SharedDemoPath = {
  tenantId: string;
  siteId: string;
  siteName: string;
};

/** The Demo organisation / dealer / database / site, including a tree created with its own ids. */
export function sharedDemoPathFromHierarchy(hierarchy: HierarchyRootLike | null | undefined): SharedDemoPath | null {
  const dealers = hierarchy?.dealers ?? [];
  const dealer = dealers.find((row) => row.id === DEMO_HIERARCHY_IDS.organisation || isDemoHierarchyName(row.name));
  const organisation = (dealer?.organisations ?? []).find(
    (row) => row.id === DEMO_HIERARCHY_IDS.dealer || isDemoHierarchyName(row.name)
  );
  const database = (organisation?.databases ?? []).find(
    (row) => row.id === DEMO_HIERARCHY_IDS.database || isDemoHierarchyName(row.name)
  );
  const site = (database?.sites ?? []).find((row) => row.id === DEMO_HIERARCHY_IDS.site || isDemoHierarchyName(row.name));
  const dealerId = String(dealer?.id ?? "").trim();
  const organisationId = String(organisation?.id ?? "").trim();
  const databaseId = String(database?.id ?? "").trim();
  const siteId = String(site?.id ?? "").trim();
  if (!dealerId || !organisationId || !databaseId || !siteId) return null;
  return {
    tenantId: `${dealerId}:${organisationId}:${databaseId}`,
    siteId,
    siteName: String(site?.name ?? "").trim() || "Demo"
  };
}

export type SharedDemoScopeRef = { tenantId?: string; siteId?: string; siteName?: string };

/** The shared Demo site is granted automatically and does not count as the user's own site. */
export function isAutomaticSharedDemoScope(ref: SharedDemoScopeRef) {
  const tenantId = String(ref.tenantId ?? "").trim();
  const siteId = String(ref.siteId ?? "").trim();
  const siteName = compactName(ref.siteName);
  if (siteId === DEMO_HIERARCHY_IDS.site) return true;
  if (tenantId && isSharedDemoDatabaseTenant(tenantId)) return true;
  if (siteName === "demo" && (tenantId || siteId)) return true;
  return false;
}

/** Drop the shared Demo database and site so a Basic User still has one personal site. */
export function personalAssignmentScope(
  tenantIds: string[],
  siteIds: string[],
  siteAssignments: SharedDemoScopeRef[] = []
) {
  const ignoredSites = new Set<string>([DEMO_HIERARCHY_IDS.site]);
  const ignoredTenants = new Set<string>();
  for (const row of siteAssignments) {
    if (!isAutomaticSharedDemoScope(row)) continue;
    const siteId = String(row.siteId ?? "").trim();
    const tenantId = String(row.tenantId ?? "").trim();
    if (siteId) ignoredSites.add(siteId);
    if (tenantId) ignoredTenants.add(tenantId);
  }
  return {
    tenantIds: tenantIds
      .map((value) => String(value ?? "").trim())
      .filter((tenantId) => tenantId && !ignoredTenants.has(tenantId) && !isSharedDemoDatabaseTenant(tenantId)),
    siteIds: siteIds
      .map((value) => String(value ?? "").trim())
      .filter((siteId) => siteId && !ignoredSites.has(siteId))
  };
}

const demoHierarchyDealer = (): HierarchyDealerLike => ({
  id: DEMO_HIERARCHY_IDS.organisation,
  name: "Demo",
  organisations: [
    {
      id: DEMO_HIERARCHY_IDS.dealer,
      name: "Demo",
      databases: [
        {
          id: DEMO_HIERARCHY_IDS.database,
          name: "Demo",
          sites: [{ id: DEMO_HIERARCHY_IDS.site, name: "Demo" }]
        }
      ]
    }
  ]
});

const ensureDemoHierarchy = (dealers: HierarchyDealerLike[]): HierarchyDealerLike[] => {
  const next: HierarchyDealerLike[] = dealers.map((dealer) => ({
    ...dealer,
    organisations: [...(dealer.organisations ?? [])]
  }));
  let dealer: HierarchyDealerLike | undefined = next.find(
    (row) => row.id === DEMO_HIERARCHY_IDS.organisation || isDemoHierarchyName(row.name)
  );
  if (!dealer) {
    dealer = demoHierarchyDealer();
    next.unshift(dealer);
  }
  const dealerOrganisations = [...(dealer.organisations ?? [])];
  let organisation: HierarchyOrgLike | undefined = dealerOrganisations.find(
    (row) => row.id === DEMO_HIERARCHY_IDS.dealer || isDemoHierarchyName(row.name)
  );
  if (!organisation) {
    organisation = demoHierarchyDealer().organisations?.[0] ?? {
      id: DEMO_HIERARCHY_IDS.dealer,
      name: "Demo",
      databases: [{
        id: DEMO_HIERARCHY_IDS.database,
        name: "Demo",
        sites: [{ id: DEMO_HIERARCHY_IDS.site, name: "Demo" }]
      }]
    };
    dealer.organisations = [organisation, ...dealerOrganisations];
  }
  const organisationDatabases = [...(organisation.databases ?? [])];
  let database = organisationDatabases.find(
    (row) => row.id === DEMO_HIERARCHY_IDS.database || isDemoHierarchyName(row.name)
  );
  if (!database) {
    database = demoHierarchyDealer().organisations?.[0]?.databases?.[0] ?? {
      id: DEMO_HIERARCHY_IDS.database,
      name: "Demo",
      sites: [{ id: DEMO_HIERARCHY_IDS.site, name: "Demo" }]
    };
    organisation.databases = [database, ...organisationDatabases];
  }
  const siteList = [...(database.sites ?? [])];
  const hasSite = siteList.some((row) => row.id === DEMO_HIERARCHY_IDS.site || isDemoHierarchyName(row.name));
  if (!hasSite) {
    database.sites = [{ id: DEMO_HIERARCHY_IDS.site, name: "Demo" }, ...siteList];
  }
  return next;
};

const databaseBelongsOnZa = (database: HierarchyDatabaseLike) =>
  isZaHierarchyDatabaseName(database?.name) || (database?.sites ?? []).some(siteBelongsOnZa);

/**
 * ZA keeps only Advanced Securities / Karongo.
 * UK, US, Enterprise, and UAE keep the rest of the shared tree.
 * Karongo stays on the South Africa server.
 */
const keepDatabaseForRegion = (database: HierarchyDatabaseLike, za: boolean) => {
  const sites = database?.sites ?? [];
  // A database with no sites yet is still being set up. Keep it so a new
  // organisation or dealer does not vanish before the rest of the tree exists.
  if (sites.length === 0 && !isZaHierarchyDatabaseName(database?.name)) return true;
  return za ? databaseBelongsOnZa(database) : !isZaHierarchyDatabaseName(database?.name);
};

export const filterHierarchyForRegion = <T extends HierarchyRootLike>(hierarchy: T, region: RegionId | string): T => {
  const id = String(region ?? "").trim().toLowerCase();
  const za = id === "za";
  const dealers = (hierarchy?.dealers ?? []).flatMap((dealer) => {
    const originalOrganisations = dealer.organisations ?? [];
    const organisations = originalOrganisations.flatMap((org) => {
      const originalDatabases = org.databases ?? [];
      const databases = originalDatabases
        .filter((database) => keepDatabaseForRegion(database, za))
        .map((database) => {
          const sites = (database.sites ?? []).filter((site) => (za ? siteBelongsOnZa(site) : !siteBelongsOnZa(site)));
          if (za && isZaHierarchyDatabaseName(database?.name) && sites.length === 0) {
            return { ...database, sites: database.sites ?? [] };
          }
          return { ...database, sites };
        })
        .filter((database) => za || (database.sites ?? []).length > 0 || !databaseBelongsOnZa(database));
      // Drop a dealer whose databases all belong on the other region.
      // Keep one that was just created and has no databases yet.
      if (databases.length === 0 && originalDatabases.length > 0) return [];
      return [{ ...org, databases }];
    });
    // Drop an organisation whose dealers all belong on the other region.
    // Keep one that was just created and has no dealers yet.
    if (organisations.length === 0 && originalOrganisations.length > 0) return [];
    return [{ ...dealer, organisations }];
  });

  return { ...hierarchy, dealers: ensureDemoHierarchy(dealers) };
};

/** Advanced Securities / Karongo branch for the ZA partition. */
export const extractZaHierarchy = <T extends HierarchyRootLike>(hierarchy: T): T =>
  withoutSyntheticDemo(filterHierarchyForRegion(hierarchy, "za"));

/** Shared US (and other Traccar) tree with Karongo removed. */
export const stripZaHierarchy = <T extends HierarchyRootLike>(hierarchy: T): T =>
  withoutSyntheticDemo(filterHierarchyForRegion(hierarchy, "us"));

const withoutSyntheticDemo = <T extends HierarchyRootLike>(hierarchy: T): T => ({
  ...hierarchy,
  dealers: (hierarchy.dealers ?? []).filter(
    (dealer) => dealer.id !== DEMO_HIERARCHY_IDS.organisation && !isDemoHierarchyName(dealer.name)
  )
});

export const hierarchyHasDealers = (hierarchy: HierarchyRootLike | null | undefined) =>
  (hierarchy?.dealers ?? []).some((dealer) => (dealer.organisations ?? []).length > 0);
