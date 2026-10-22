import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ribbonPageLabel } from "../utils/ribbonPageLabel";
import {
  getApiKey,
  tenantSkipsAutomaticFleetImport,
  getCachedPrincipal,
  getTenantId,
  buildApiUrl,
  getAssetsFromApi,
  getAssetsFromApiForTenant,
  peekCachedAssets,
  upsertAssetDetailedForTenant,
  getHierarchy,
  addHierarchyDealer,
  addHierarchyOrganisation,
  addHierarchyDatabase,
  addHierarchySite,
  syncHierarchyTree,
  renameHierarchyItem,
  deleteHierarchyItem,
  deleteAssetFromApi,
  repairTraccarSiteGroups,
  getSiteTimeZoneSettings,
  saveSiteTimeZoneSettings,
  resolveTimeZoneForSite,
  type SiteTimeZoneSettings,
  isOwnSupportPrincipal
} from "../utils/api";
import { canManageHierarchyLevel, filterDealerRowsForActorScope, resolveRoleScopeRulesFromPrincipal, type HierarchyAction, type HierarchySegment } from "../utils/roleScopeRules";
import { activateSiteContext, activateTenantContext, readActiveTenantId, readUserScopedJson } from "../utils/tenantContext";
import {
  formatAssetDescription,
  formatAssetPickerLabel,
  hierarchyUsesSyntheticIds,
  PUBLISHED_MMULU_PATH,
  PUBLISHED_MMULU_TENANT_ID,
  resolveDatabaseTenantFromHierarchy,
  shouldPersistHierarchyCache
} from "../utils/hierarchyDisplay";
import { filterDealerRowsForActiveRegion, isDemoHierarchyName, isLegacyFlatTenantId, isZaHierarchySiteName } from "../utils/regionHierarchy";
import { readActiveRegion } from "../utils/regionServers";
import { assetLabelsForHierarchySite, assetSiteMatchesHierarchySite, resolveAssetSiteName } from "../utils/selectionScope";
import { groupSitesByFamily, parseViviSiteLabel } from "../utils/viviCategories";
import {
  clearActiveAssetPrefs,
  readUserPref,
  USER_PREF_KEYS,
  writeActiveAssetPrefs,
  writeUserPref
} from "../utils/userAppPrefs";
import { showToast } from "../utils/toast";
import { beginSaving, endSavingDone, endSavingError } from "../utils/saveFeedback";
import {
  cms808HierarchyActive,
  cms808SiteName,
  cms808VehicleToAssetRecord,
  loadCms808VehiclesForActiveHierarchy
} from "../utils/cms808";

type Site = {
  id: string;
  name: string;
  assets: string[];
};

type OrgModalAssetRecord = {
  label: string;
  description: string;
  registration: string;
  imei: string;
  siteName: string;
};

type OrgModalBrowseMode = "group" | "asset";
type OrgModalSearchBy = "description" | "registration";

type Database = {
  id: string;
  name: string;
  sites: Site[];
};

type Organisation = {
  id: string;
  name: string;
  databases: Database[];
};

type Dealer = {
  id: string;
  name: string;
  organisations: Organisation[];
};

function uniqueSiteNames(names: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function collectSitesForRibbonScope(
  scope: "dealer" | "org" | "db" | "site" | "asset",
  dealer: Dealer | null | undefined,
  org: Organisation | null | undefined,
  db: Database | null | undefined
): string[] {
  const fromDatabases = (databases: Database[] | undefined) =>
    uniqueSiteNames((databases ?? []).flatMap((item) => (item.sites ?? []).map((site) => site.name)));

  if (scope === "db" || scope === "site" || scope === "asset") {
    const sites = fromDatabases(db ? [db] : []);
    if (!sites.some((name) => name.toLowerCase() === "default")) sites.unshift("Default");
    return sites;
  }
  if (scope === "org") return fromDatabases(org?.databases);
  if (scope === "dealer") {
    return fromDatabases((dealer?.organisations ?? []).flatMap((item) => item.databases ?? []));
  }
  return [];
}

type RibbonAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  tooltip?: string;
  nav?: string;
  count?: number;
  variant?: "icon" | "add" | "pill";
  onClick?: () => void;
};

const RIBBON_EXPORT_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ribbon-quick-svg">
    <path d="M12 3v10" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M8 9l4 4 4-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4 17v3h16v-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const RIBBON_IMPORT_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ribbon-quick-svg">
    <path d="M12 21V11" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M8 15l4-4 4 4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4 4v3h16V4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const RIBBON_TEMPLATE_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ribbon-quick-svg">
    <path d="M6 2h9l3 3v17H6z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M15 2v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 11h8M8 15h8M8 19h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const RIBBON_REPORTS_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ribbon-quick-svg">
    <path d="M4 20V4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M8 17V11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12 20V7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M16 20v-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M20 20V9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const buildFleetListToolbarActions = (reportNav: string): RibbonAction[] => [
  { key: "refresh", label: "Refresh", tooltip: "Refresh", icon: "↻" },
  { key: "export", label: "Export", tooltip: "Export", icon: RIBBON_EXPORT_ICON },
  { key: "import", label: "Import", tooltip: "Import", icon: RIBBON_IMPORT_ICON },
  { key: "template", label: "Download template", tooltip: "Download template", icon: RIBBON_TEMPLATE_ICON },
  { key: "reports", label: "Reports", tooltip: "Reports", icon: RIBBON_REPORTS_ICON, nav: reportNav },
  { key: "add", label: "Add", icon: "+", tooltip: "Add", variant: "add" }
];

const DRIVER_LIST_REPORT_NAV =
  "/Analyze/insights/reports?category=List%20Reports&report=Driver%20List%20Report";

type HierarchyScope = "dealer" | "organisation" | "database" | "site" | "asset";

type HierarchyAssignment = {
  scope: HierarchyScope;
  targetId: string;
  targetLabel: string;
  userName: string;
  userEmail: string;
  assignedByName?: string;
  assignedByEmail?: string;
  createdAt: string;
};

type AssignmentCandidate = { name: string; email: string };

const hierarchyAssignmentsKey = "vivi.org.assignments";
const SITE_TIME_ZONE_CHOICES = [
  // UTC
  { value: "UTC", label: "(UTC±0) Coordinated Universal Time" },
  // Africa
  { value: "Africa/Cairo", label: "(UTC+2) Cairo, Egypt" },
  { value: "Africa/Johannesburg", label: "(UTC+2) Johannesburg, South Africa" },
  { value: "Africa/Lagos", label: "(UTC+1) Lagos, Nigeria" },
  { value: "Africa/Nairobi", label: "(UTC+3) Nairobi, Kenya" },
  { value: "Africa/Dar_es_Salaam", label: "(UTC+3) Dar es Salaam, Tanzania" },
  { value: "Africa/Khartoum", label: "(UTC+2) Khartoum, Sudan" },
  { value: "Africa/Casablanca", label: "(UTC+0/+1) Casablanca, Morocco" },
  { value: "Africa/Kinshasa", label: "(UTC+1) Kinshasa, Democratic Republic of Congo" },
  { value: "Africa/Luanda", label: "(UTC+1) Luanda, Angola" },
  { value: "Africa/Lusaka", label: "(UTC+2) Lusaka, Zambia" },
  { value: "Africa/Harare", label: "(UTC+2) Harare, Zimbabwe" },
  // Europe
  { value: "Europe/London", label: "(UTC+0/+1) London, United Kingdom" },
  { value: "Europe/Paris", label: "(UTC+1/+2) Paris, France" },
  { value: "Europe/Berlin", label: "(UTC+1/+2) Berlin, Germany" },
  { value: "Europe/Amsterdam", label: "(UTC+1/+2) Amsterdam, Netherlands" },
  { value: "Europe/Brussels", label: "(UTC+1/+2) Brussels, Belgium" },
  { value: "Europe/Vienna", label: "(UTC+1/+2) Vienna, Austria" },
  { value: "Europe/Prague", label: "(UTC+1/+2) Prague, Czech Republic" },
  { value: "Europe/Budapest", label: "(UTC+1/+2) Budapest, Hungary" },
  { value: "Europe/Warsaw", label: "(UTC+1/+2) Warsaw, Poland" },
  { value: "Europe/Moscow", label: "(UTC+3) Moscow, Russia" },
  { value: "Europe/Istanbul", label: "(UTC+3) Istanbul, Turkey" },
  { value: "Europe/Athens", label: "(UTC+2/+3) Athens, Greece" },
  { value: "Europe/Madrid", label: "(UTC+1/+2) Madrid, Spain" },
  { value: "Europe/Rome", label: "(UTC+1/+2) Rome, Italy" },
  { value: "Europe/Zurich", label: "(UTC+1/+2) Zurich, Switzerland" },
  // Asia
  { value: "Asia/Dubai", label: "(UTC+4) Dubai, United Arab Emirates" },
  { value: "Asia/Bangkok", label: "(UTC+7) Bangkok, Thailand" },
  { value: "Asia/Singapore", label: "(UTC+8) Singapore" },
  { value: "Asia/Hong_Kong", label: "(UTC+8) Hong Kong" },
  { value: "Asia/Shanghai", label: "(UTC+8) Shanghai, China" },
  { value: "Asia/Tokyo", label: "(UTC+9) Tokyo, Japan" },
  { value: "Asia/Seoul", label: "(UTC+9) Seoul, South Korea" },
  { value: "Asia/Manila", label: "(UTC+8) Manila, Philippines" },
  { value: "Asia/Jakarta", label: "(UTC+7) Jakarta, Indonesia" },
  { value: "Asia/Kolkata", label: "(UTC+5:30) New Delhi, India" },
  { value: "Asia/Karachi", label: "(UTC+5) Karachi, Pakistan" },
  { value: "Asia/Tehran", label: "(UTC+3:30/+4:30) Tehran, Iran" },
  { value: "Asia/Taipei", label: "(UTC+8) Taipei, Taiwan" },
  // Americas
  { value: "America/New_York", label: "(UTC-5/-4) New York, USA" },
  { value: "America/Chicago", label: "(UTC-6/-5) Chicago, USA" },
  { value: "America/Denver", label: "(UTC-7/-6) Denver, USA" },
  { value: "America/Los_Angeles", label: "(UTC-8/-7) Los Angeles, USA" },
  { value: "America/Toronto", label: "(UTC-5/-4) Toronto, Canada" },
  { value: "America/Vancouver", label: "(UTC-8/-7) Vancouver, Canada" },
  { value: "America/Mexico_City", label: "(UTC-6/-5) Mexico City, Mexico" },
  { value: "America/Sao_Paulo", label: "(UTC-3/-2) São Paulo, Brazil" },
  { value: "America/Buenos_Aires", label: "(UTC-3/-2) Buenos Aires, Argentina" },
  { value: "America/London", label: "(UTC-5/-4) London (deprecated - use Europe/London)" },
  // Oceania
  { value: "Australia/Sydney", label: "(UTC+10/+11) Sydney, Australia" },
  { value: "Australia/Melbourne", label: "(UTC+10/+11) Melbourne, Australia" },
  { value: "Australia/Brisbane", label: "(UTC+10) Brisbane, Australia" },
  { value: "Australia/Perth", label: "(UTC+8) Perth, Australia" },
  { value: "Pacific/Auckland", label: "(UTC+12/+13) Auckland, New Zealand" },
  { value: "Pacific/Fiji", label: "(UTC+12/+13) Fiji" },
  { value: "Pacific/Honolulu", label: "(UTC-10) Honolulu, Hawaii" },
];

const toLaymanTimeZoneLabel = (value: string, label: string) => {
  const withoutOffset = String(label ?? "").replace(/^\([^)]*\)\s*/, "").trim();
  if (value === "UTC") return "Universal Time (UTC)";
  return withoutOffset || value;
};

const getTimeZoneChoiceLabel = (value: string) => {
  const found = SITE_TIME_ZONE_CHOICES.find((choice) => choice.value === value);
  if (!found) return String(value ?? "").trim() || "Unknown";
  return toLaymanTimeZoneLabel(found.value, found.label);
};

const hierarchyUiLabels = {
  dealer: { singular: "Organisation", plural: "Organisations" },
  organisation: { singular: "Dealer", plural: "Dealers" },
  database: { singular: "Database", plural: "Databases" },
  site: { singular: "Site", plural: "Sites" },
  asset: { singular: "Asset", plural: "Assets" }
} as const;

const uiLabelForRowScope = (scope: "dealer" | "org" | "db" | "site" | "asset") => {
  if (scope === "dealer") return hierarchyUiLabels.dealer.singular;
  if (scope === "org") return hierarchyUiLabels.organisation.singular;
  if (scope === "db") return hierarchyUiLabels.database.singular;
  if (scope === "site") return hierarchyUiLabels.site.singular;
  return hierarchyUiLabels.asset.singular;
};
const rowActions = ["Duplicate", "Edit", "Suspend", "Revoke", "Assign", "Delete"];

const rowScopeToSegment = (scope: "dealer" | "org" | "db" | "site" | "asset"): HierarchySegment => {
  if (scope === "org") return "organisation";
  if (scope === "db") return "database";
  return scope;
};

const actionToHierarchyAction = (action: string): HierarchyAction | null => {
  const act = String(action ?? "").trim().toLowerCase();
  if (act === "edit" || act === "duplicate" || act === "suspend") return "edit";
  if (act === "assign" || act === "revoke") return "assign";
  if (act === "delete") return "delete";
  return null;
};

const initialDealers: Dealer[] = [];

const unionHierarchyRows = <T extends { id: string }>(primary: T[], extras: T[], merge: (current: T, extra: T) => T): T[] => {
  const rows = new Map<string, T>();
  const order: string[] = [];
  for (const row of primary) {
    const id = String(row?.id ?? "").trim();
    if (!id || rows.has(id)) continue;
    order.push(id);
    rows.set(id, row);
  }
  for (const row of extras) {
    const id = String(row?.id ?? "").trim();
    if (!id) continue;
    const current = rows.get(id);
    if (!current) {
      order.push(id);
      rows.set(id, row);
      continue;
    }
    rows.set(id, merge(current, row));
  }
  return order.map((id) => rows.get(id)).filter((row): row is T => Boolean(row));
};

/** Keep a node the save just returned when a later US read drops an empty organisation. */
const unionDealers = (confirmed: Dealer[], saved: Dealer[]): Dealer[] =>
  unionHierarchyRows(confirmed, saved, (current, extra) => ({
    ...current,
    name: current.name || extra.name,
    organisations: unionHierarchyRows(current.organisations ?? [], extra.organisations ?? [], (org, extraOrg) => ({
      ...org,
      name: org.name || extraOrg.name,
      databases: unionHierarchyRows(org.databases ?? [], extraOrg.databases ?? [], (db, extraDb) => ({
        ...db,
        name: db.name || extraDb.name,
        sites: unionHierarchyRows(db.sites ?? [], extraDb.sites ?? [], (site) => site)
      }))
    }))
  }));

const mapHierarchyToDealers = (hierarchy: any): Dealer[] => {
  const dealers = Array.isArray(hierarchy?.dealers) ? hierarchy.dealers : [];
  return dealers.map((dealer: any) => ({
    id: String(dealer?.id ?? ""),
    name: String(dealer?.name ?? ""),
    organisations: (Array.isArray(dealer?.organisations) ? dealer.organisations : []).map((org: any) => ({
      id: String(org?.id ?? ""),
      name: String(org?.name ?? ""),
      databases: (Array.isArray(org?.databases) ? org.databases : []).map((db: any) => ({
        id: String(db?.id ?? ""),
        name: String(db?.name ?? ""),
        sites: (Array.isArray(db?.sites) ? db.sites : []).map((site: any) => ({
          id: String(site?.id ?? ""),
          name: String(site?.name ?? ""),
          assets: []
        }))
      }))
    }))
  }));
};

const hierarchyNameKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

const findDealerNodeByIdOrName = (rows: Dealer[], id: string, name: string): Dealer | undefined => {
  const byId = rows.find((row) => row.id === id);
  if (byId) return byId;
  const key = hierarchyNameKey(name);
  if (!key) return undefined;
  return rows.find((row) => hierarchyNameKey(row.name) === key);
};

const findChildByIdOrName = <T extends { id: string; name: string }>(rows: T[], id: string, name: string): T | undefined => {
  const byId = rows.find((row) => row.id === id);
  if (byId) return byId;
  const key = hierarchyNameKey(name);
  if (!key) return undefined;
  return rows.find((row) => hierarchyNameKey(row.name) === key);
};

const collectAllHierarchyNames = (rows: Dealer[]) => {
  const names = new Set<string>();
  for (const dealer of rows ?? []) {
    const dealerName = hierarchyNameKey(dealer?.name);
    if (dealerName) names.add(`dealer:${dealerName}`);
    for (const org of dealer.organisations ?? []) {
      const orgName = hierarchyNameKey(org?.name);
      if (orgName) names.add(`org:${orgName}`);
      for (const db of org.databases ?? []) {
        const dbName = hierarchyNameKey(db?.name);
        if (dbName) names.add(`db:${dbName}`);
        for (const site of db.sites ?? []) {
          const siteName = hierarchyNameKey(site?.name);
          if (siteName) names.add(`site:${siteName}`);
        }
      }
    }
  }
  return names;
};

/**
 * Build a minimal merge payload: attach local-only databases/sites under the matching
 * *server* parent ids/names. Never promote a local node to a higher level when that name
 * already exists elsewhere (prevents OXFAM-as-Organisation pollution).
 */
const buildSafeHierarchyHealPayload = (localRows: Dealer[], serverRows: Dealer[]): Dealer[] => {
  if (!localRows.length) return [];
  const serverNames = collectAllHierarchyNames(serverRows);
  const payload: Dealer[] = [];

  for (const localDealer of localRows) {
    const dealerName = String(localDealer?.name ?? "").trim();
    const dealerId = String(localDealer?.id ?? "").trim();
    const serverDealer = findDealerNodeByIdOrName(serverRows, dealerId, dealerName);

    if (!serverDealer) {
      const key = hierarchyNameKey(dealerName);
      // Skip mis-shaped local "dealers" that are already an org/db/site on the server.
      if (
        !key ||
        serverNames.has(`org:${key}`) ||
        serverNames.has(`db:${key}`) ||
        serverNames.has(`site:${key}`)
      ) {
        continue;
      }
      payload.push(localDealer);
      continue;
    }

    const orgPayloads: Organisation[] = [];
    for (const localOrg of localDealer.organisations ?? []) {
      const orgName = String(localOrg?.name ?? "").trim();
      const orgId = String(localOrg?.id ?? "").trim();
      const serverOrg = findChildByIdOrName(serverDealer.organisations ?? [], orgId, orgName);

      if (!serverOrg) {
        const key = hierarchyNameKey(orgName);
        if (!key || serverNames.has(`db:${key}`) || serverNames.has(`site:${key}`)) continue;
        orgPayloads.push(localOrg);
        continue;
      }

      const missingDatabases: Database[] = [];
      for (const localDb of localOrg.databases ?? []) {
        const dbName = String(localDb?.name ?? "").trim();
        const dbId = String(localDb?.id ?? "").trim();
        const serverDb = findChildByIdOrName(serverOrg.databases ?? [], dbId, dbName);
        if (!serverDb) {
          missingDatabases.push(localDb);
          continue;
        }
        const missingSites = (localDb.sites ?? []).filter((site) => {
          const siteId = String(site?.id ?? "").trim();
          const siteName = String(site?.name ?? "").trim();
          return !findChildByIdOrName(serverDb.sites ?? [], siteId, siteName);
        });
        if (missingSites.length) {
          missingDatabases.push({
            id: serverDb.id,
            name: serverDb.name,
            sites: missingSites.map((site) => ({ ...site, assets: site.assets ?? [] }))
          });
        }
      }
      if (missingDatabases.length) {
        orgPayloads.push({
          id: serverOrg.id,
          name: serverOrg.name,
          databases: missingDatabases
        });
      }
    }

    if (orgPayloads.length) {
      payload.push({
        id: serverDealer.id,
        name: serverDealer.name,
        organisations: orgPayloads
      });
    }
  }

  return payload;
};

const localHierarchyHasUnsyncedNodes = (localRows: Dealer[], serverRows: Dealer[]) => {
  if (!localRows.length) return false;
  return buildSafeHierarchyHealPayload(localRows, serverRows).length > 0;
};

const canHealSharedHierarchyTree = () => {
  const principal = getCachedPrincipal()?.principal as any;
  if (!principal) return false;
  if (String(principal?.kind ?? "").trim().toLowerCase() === "admin") return true;
  return Boolean(principal?.isOwnSupport) || Boolean(principal?.isTenantAdmin);
};

const readCachedDealerRows = (): Dealer[] => {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("vivi.org.dealers");
    const parsed = stored ? (JSON.parse(stored) as Dealer[]) : [];
    return filterDealerRowsForActiveRegion(Array.isArray(parsed) ? parsed : []) as Dealer[];
  } catch {
    return [];
  }
};

const siteGroupRepairAttempted = new Set<string>();
const hierarchyHealAttempted = new Set<string>();

const filterDealerRowsForCurrentAccess = (rows: Dealer[]) => {
  const regionRows = filterDealerRowsForActiveRegion(rows) as Dealer[];
  const cached = getCachedPrincipal();
  const principal = cached?.principal ?? null;
  if (!principal) return [];
  const isPlatformAdmin = String(principal?.kind ?? "").trim().toLowerCase() === "admin";
  // Admin, Own Support, and Tenant Admin see this server's tree. Impersonation keeps the
  // target account's own role scope (Dealer Support does not inherit Own Support).
  if (
    isPlatformAdmin ||
    Boolean((principal as any)?.isTenantAdmin) ||
    Boolean((principal as any)?.isOwnSupport)
  ) {
    return regionRows;
  }

  const allowedTenants = Array.isArray(cached?.allowedTenants)
    ? cached!.allowedTenants.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const tenantId = String(getTenantId() ?? "").trim();
  const roleNames = Array.isArray((principal as any)?.roleNames)
    ? (principal as any).roleNames.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const siteIds = Array.isArray((principal as any)?.siteIds)
    ? (principal as any).siteIds.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const siteNames = Array.isArray((principal as any)?.siteNames)
    ? (principal as any).siteNames.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
    : Array.isArray((principal as any)?.siteAssignments)
      ? (principal as any).siteAssignments
          .map((row: any) => String(row?.siteName ?? "").trim())
          .filter(Boolean)
      : [];
  const scopedTenants = allowedTenants.length ? allowedTenants : tenantId ? [tenantId] : [];
  // Without tenant/site grants, do not paint a leftover cached tree from another login.
  if (!scopedTenants.length && !siteIds.length && !siteNames.length) return [];
  return filterDealerRowsForActorScope(
    regionRows,
    scopedTenants,
    siteIds,
    roleNames,
    isPlatformAdmin,
    siteNames
  ) as Dealer[];
};

export function OrgRibbon({ hideRibbon = false }: { hideRibbon?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [authStamp, setAuthStamp] = useState(0);
  useEffect(() => {
    const syncAuth = () => setAuthStamp((value) => value + 1);
    window.addEventListener("vivi:authchange", syncAuth);
    return () => window.removeEventListener("vivi:authchange", syncAuth);
  }, []);
  const actorScope = useMemo(
    () => resolveRoleScopeRulesFromPrincipal(getCachedPrincipal()?.principal ?? null),
    [location.pathname, authStamp]
  );
  const hierarchyVisibility = actorScope.visibility;
  const allowedRowActions = (scope: "dealer" | "org" | "db" | "site" | "asset") => {
    const segment = rowScopeToSegment(scope);
    return rowActions.filter((action) => {
      const hierarchyAction = actionToHierarchyAction(action);
      if (!hierarchyAction) return true;
      return canManageHierarchyLevel(actorScope, segment, hierarchyAction);
    });
  };
  const canCreateSegment = (segment: HierarchySegment) => canManageHierarchyLevel(actorScope, segment, "create");
  const [quickCounts, setQuickCounts] = useState({ locations: 0, alerts: 0 });
  const [ribbonSearch, setRibbonSearch] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const readCounts = () => {
      try {
        const locations = readUserScopedJson<string[]>("vivi.liveTracking.selectedLocations") ?? [];
        const alerts = readUserScopedJson<string[]>("vivi.liveTracking.selectedEvents") ?? [];
        setQuickCounts({
          locations: Array.isArray(locations) ? locations.length : 0,
          alerts: Array.isArray(alerts) ? alerts.length : 0
        });
      } catch {
        setQuickCounts({ locations: 0, alerts: 0 });
      }
    };
    readCounts();
    const handler = () => readCounts();
    window.addEventListener("vivi.liveTracking.selectionUpdate", handler as EventListener);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("vivi.liveTracking.selectionUpdate", handler as EventListener);
      window.removeEventListener("storage", handler);
    };
  }, []);
  const baseQuickActions = useMemo<RibbonAction[]>(
    () => [
      ...(isOwnSupportPrincipal()
        ? [{
        key: "fuel-analysis",
        label: "Fuel/Temp Analysis",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="ribbon-quick-svg">
            <path
              d="M12 3c-3.2 4.2-6 7-6 10.2a6 6 0 0 0 12 0C18 10 15.2 7.2 12 3z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M12 11v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ),
        onClick: () => {
          if (typeof window === "undefined") return;
          window.dispatchEvent(new CustomEvent("vivi.liveTracking.openFuelAnalysis"));
        }
      }]
        : []),
      {
        key: "locations",
        label: "Locations",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="ribbon-quick-svg">
            <path
              d="M12 21s7-7.16 7-12a7 7 0 1 0-14 0c0 4.84 7 12 7 12z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <circle cx="12" cy="9" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        ),
        count: quickCounts.locations,
        onClick: () => {
          if (typeof window === "undefined") return;
          window.dispatchEvent(new CustomEvent("vivi.liveTracking.openLocations"));
        }
      },
      {
        key: "alerts",
        label: "Alerts",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="ribbon-quick-svg">
            <path
              d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path d="M9.5 20a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        ),
        count: quickCounts.alerts,
        onClick: () => {
          if (typeof window === "undefined") return;
          window.dispatchEvent(new CustomEvent("vivi.liveTracking.openEvents"));
        }
      }
    ],
    [quickCounts]
  );
  const ribbonQuickActions = useMemo(() => {
    if (location.pathname === "/Track/tracking/live") {
      return baseQuickActions;
    }
    return [] as RibbonAction[];
  }, [baseQuickActions, location.pathname]);
  const pageLabel = useMemo(() => ribbonPageLabel(location.pathname), [location.pathname]);
  const ribbonToolbar = useMemo(() => {
    const configs: {
      match: (path: string) => boolean;
      search?: boolean;
      actions: RibbonAction[];
    }[] = [
      {
        match: (path) => path === "/Track/fleet/assets",
        search: true,
        actions: [
          { key: "refresh", label: "Refresh", tooltip: "Refresh assets", icon: "↻" },
          { key: "export", label: "Export", tooltip: "Export", icon: RIBBON_EXPORT_ICON },
          { key: "import", label: "Import", tooltip: "Import", icon: RIBBON_IMPORT_ICON },
          { key: "template", label: "Download template", tooltip: "Download template", icon: RIBBON_TEMPLATE_ICON },
          { key: "move-site", label: "Move all assets to site", tooltip: "Move all assets to selected site", icon: "⚙" },
          { key: "add", label: "Add", icon: "+", tooltip: "Add", variant: "add" }
        ]
      },
      {
        match: (path) => path === "/Track/fleet/drivers",
        search: true,
        actions: buildFleetListToolbarActions(DRIVER_LIST_REPORT_NAV)
      },
      {
        match: (path) => path === "/Track/fleet/passengers",
        search: true,
        actions: buildFleetListToolbarActions(DRIVER_LIST_REPORT_NAV)
      }
    ];
    return configs.find((config) => config.match(location.pathname)) ?? null;
  }, [location.pathname]);

  useEffect(() => {
    setRibbonSearch("");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vivi.ribbon.search", { detail: { value: "" } }));
    }
  }, [location.pathname]);

  const handleRibbonAction = (action: RibbonAction) => {
    if (action.onClick) {
      action.onClick();
      return;
    }
    if (action.nav) {
      navigate(action.nav);
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vivi.ribbon.action", { detail: { key: action.key } }));
    }
  };
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [orgModalSearch, setOrgModalSearch] = useState("");
  const [orgModalBrowseMode, setOrgModalBrowseMode] = useState<OrgModalBrowseMode>(() => {
    if (typeof window === "undefined") return "group";
    return window.localStorage.getItem("vivi.orgModal.browseMode") === "asset" ? "asset" : "group";
  });
  const [orgModalSearchBy, setOrgModalSearchBy] = useState<OrgModalSearchBy>(() => {
    if (typeof window === "undefined") return "description";
    return window.localStorage.getItem("vivi.orgModal.searchBy") === "registration"
      ? "registration"
      : "description";
  });
  const [orgModalExpanded, setOrgModalExpanded] = useState(false);
  const [orgModalAssetRecords, setOrgModalAssetRecords] = useState<OrgModalAssetRecord[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const loadedAssetTenantRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOpenOrgModal = () => setOrgModalOpen(true);
    window.addEventListener("vivi.orgRibbon.open", handleOpenOrgModal);
    return () => window.removeEventListener("vivi.orgRibbon.open", handleOpenOrgModal);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("vivi.orgModal.browseMode", orgModalBrowseMode);
  }, [orgModalBrowseMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("vivi.orgModal.searchBy", orgModalSearchBy);
  }, [orgModalSearchBy]);

  useEffect(() => {
    if (!orgModalOpen) {
      setOrgModalSearch("");
      setOrgModalExpanded(false);
    }
  }, [orgModalOpen]);

  const [selectedPath, setSelectedPath] = useState(() => localStorage.getItem("vivi.selectedPath") ?? "");
  const [openActionRow, setOpenActionRow] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  // Cache is a mirror of the last successful server tree only — never invent sites locally.
  const [dealerRows, setDealerRows] = useState<Dealer[]>(() => {
    const cached = readCachedDealerRows();
    return cached.length ? filterDealerRowsForCurrentAccess(cached) : initialDealers;
  });
  const [activeDealerId, setActiveDealerId] = useState<string>("");
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [activeDbId, setActiveDbId] = useState<string>("");
  const [activeSiteId, setActiveSiteId] = useState<string>("");
  const [activeAsset, setActiveAsset] = useState<string>("");
  const dealerRowsCommittedRef = useRef(false);
  const hierarchyHydratedRef = useRef(false);
  const skipHydrationRewriteRef = useRef(false);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [activeScope, setActiveScope] = useState<"dealer" | "org" | "db" | "site" | "asset">(() => {
    if (typeof window === "undefined") return "dealer";
    const raw = String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim().toLowerCase();
    if (raw === "dealer" || raw === "org" || raw === "db" || raw === "site" || raw === "asset") return raw;
    return "dealer";
  });

  const resolveStoredSelection = (rows: Dealer[]) => {
    if (typeof window === "undefined" || rows.length === 0) {
      return { scope: "dealer" as const, dealer: null, org: null, db: null, site: null, asset: "", path: "", tenant: "", dbSites: [] as string[] };
    }

    const storedTenantRaw = String(window.localStorage.getItem("vivi.tenantId") ?? "").trim();
    const storedTenant =
      isLegacyFlatTenantId(storedTenantRaw) || storedTenantRaw.split(":").filter(Boolean).length < 3
        ? ""
        : storedTenantRaw;
    const [tenantDealerId, tenantOrgId, tenantDbId] = storedTenant.split(":").map((part) => String(part ?? "").trim());
    const storedDealerIdRaw = String(window.localStorage.getItem("vivi.activeDealerId") ?? tenantDealerId ?? "").trim();
    const storedOrgIdRaw = String(window.localStorage.getItem("vivi.activeOrgId") ?? tenantOrgId ?? "").trim();
    const storedDbIdRaw = String(window.localStorage.getItem("vivi.activeDbId") ?? tenantDbId ?? "").trim();
    const storedDealerId = isLegacyFlatTenantId(storedDealerIdRaw) ? "" : storedDealerIdRaw;
    const storedOrgId = isLegacyFlatTenantId(storedOrgIdRaw) ? "" : storedOrgIdRaw;
    const storedDbId = isLegacyFlatTenantId(storedDbIdRaw) ? "" : storedDbIdRaw;
    const storedSiteId = String(window.localStorage.getItem("vivi.activeSiteId") ?? "").trim();
    const storedSiteName = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
    const storedAsset = readUserPref(USER_PREF_KEYS.activeAsset);
    const rawScope = String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim().toLowerCase();

    // Fresh login: nothing was explicitly picked, so do not derive a selection from the default tenant.
    if (
      !storedSiteId &&
      !storedSiteName &&
      !String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim() &&
      readActiveRegion() !== "za"
    ) {
      return { scope: "dealer" as const, dealer: null, org: null, db: null, site: null, asset: "", path: "", tenant: storedTenant, dbSites: [] as string[] };
    }

    const scope =
      rawScope === "dealer" || rawScope === "org" || rawScope === "db" || rawScope === "site" || rawScope === "asset"
        ? (rawScope as "dealer" | "org" | "db" | "site" | "asset")
        : storedSiteId || storedSiteName
          ? "site"
          : storedDbId
            ? "db"
            : storedOrgId
              ? "org"
              : storedDealerId
                ? "dealer"
                : "dealer";

    if (readActiveRegion() === "za") {
      for (const dealer of rows) {
        for (const org of dealer.organisations ?? []) {
          for (const db of org.databases ?? []) {
            const site = (db.sites ?? []).find((row) => isZaHierarchySiteName(row.name)) ?? null;
            if (!site) continue;
            return {
              scope: "site" as const,
              dealer,
              org,
              db,
              site,
              asset: "",
              path: [dealer.name, org.name, db.name, site.name].filter(Boolean).join(" / "),
              tenant: [dealer.id, org.id, db.id].filter(Boolean).join(":"),
              dbSites: collectSitesForRibbonScope("site", dealer, org, db)
            };
          }
        }
      }
    }

    const storedPath = String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim();
    const pathNames = storedPath
      .split("/")
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .map((part) => (isLegacyFlatTenantId(part) ? "" : part))
      .filter(Boolean);

    const located = resolveDatabaseTenantFromHierarchy({
      rows,
      dealerId: storedDealerId,
      orgId: storedOrgId,
      dbId: storedDbId,
      pathNames,
      siteName: storedSiteName || pathNames[pathNames.length - 1] || ""
    });

    const dealer =
      (located
        ? rows.find((row) => row.id === located.dealerId)
        : undefined) ??
      findDealerNodeByIdOrName(rows, storedDealerId, pathNames[0] || "") ??
      rows.find((d) => d.id === storedDealerId) ??
      rows[0] ??
      null;
    const org = scope === "dealer"
      ? null
      : (located
          ? (dealer?.organisations ?? []).find((row) => row.id === located.orgId)
          : undefined) ??
        findChildByIdOrName(dealer?.organisations ?? [], storedOrgId, pathNames[1] || "") ??
        ((scope === "org" || scope === "db" || scope === "site" || scope === "asset") ? (dealer?.organisations ?? [])[0] ?? null : null);
    const db = scope === "db" || scope === "site" || scope === "asset"
      ? (located
          ? (org?.databases ?? []).find((row) => row.id === located.dbId)
          : undefined) ??
        findChildByIdOrName(org?.databases ?? [], storedDbId, pathNames[2] || "") ??
        // Prefer the shared Demo database when the organisation is Demo.
        (isDemoHierarchyName(dealer?.name) || isDemoHierarchyName(org?.name)
          ? (org?.databases ?? []).find((row) => isDemoHierarchyName(row.name))
          : undefined) ??
        (org?.databases ?? [])[0] ??
        null
      : null;
    const storedSiteLabel = located?.siteName || storedSiteName || pathNames[3] || "";
    // Only resolve sites that exist on this database. Never invent a leftover
    // label (e.g. WJL) from another account's localStorage.
    const site =
      scope === "site" || scope === "asset"
        ? findChildByIdOrName(db?.sites ?? [], located?.siteId || storedSiteId, storedSiteLabel) ??
          (db?.sites ?? [])[0] ??
          null
        : null;

    const pathParts = [
      hierarchyVisibility.showDealer ? dealer?.name : "",
      hierarchyVisibility.showOrganisation &&
      (scope === "org" || scope === "db" || scope === "site" || scope === "asset")
        ? org?.name
        : "",
      hierarchyVisibility.showDatabase && (scope === "db" || scope === "site" || scope === "asset") ? db?.name : "",
      scope === "site" || scope === "asset" ? site?.name : "",
      scope === "asset" ? storedAsset : ""
    ]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean);

    return {
      scope,
      dealer,
      org,
      db,
      site,
      asset: scope === "asset" ? storedAsset : "",
      path: pathParts.join(" / "),
      tenant: db ? [dealer?.id, org?.id, db?.id].filter(Boolean).join(":") : storedTenant,
      dbSites: collectSitesForRibbonScope(scope, dealer, org, db)
    };
  };

  useEffect(() => {
    let cancelled = false;
    const hydrateHierarchy = async (opts?: { fromModal?: boolean }) => {
      setHierarchyLoading(true);
      try {
        const hierarchy = await getHierarchy();
        if (cancelled) return;
        if (hierarchy?.unavailable) return;
        const rawRows = mapHierarchyToDealers(hierarchy);
        const filteredRows = filterDealerRowsForCurrentAccess(rawRows);
        const serverRows = filteredRows;
        const localRows = readCachedDealerRows();
        const tenantKey = String(getTenantId() ?? "").trim() || "_";
        const canHealSharedTree = canHealSharedHierarchyTree();
        const healPayload =
          canHealSharedTree && serverRows.length === 0 && !hierarchyUsesSyntheticIds(localRows)
            ? buildSafeHierarchyHealPayload(localRows, serverRows)
            : [];
        const needsHeal = healPayload.length > 0;

        if (needsHeal) {
          const healed = await syncHierarchyTree(healPayload as any);
          if (!cancelled && healed?.hierarchy) {
            hierarchyHealAttempted.add(tenantKey);
          } else if (!cancelled) {
            hierarchyHealAttempted.delete(tenantKey);
            if (opts?.fromModal && localRows.length > 0 && serverRows.length > 0) {
              setLastAction("Could not sync local hierarchy yet — will retry when you reopen this window.");
            }
          }
        }

        let displayRows = serverRows;
        if (canHealSharedTree) {
          const refreshed = needsHeal ? await getHierarchy() : hierarchy;
          if (cancelled) return;
          const usable = refreshed?.unavailable ? hierarchy : refreshed;
          if (usable?.unavailable) return;
          const refreshedRaw = mapHierarchyToDealers(usable);
          const refreshedFiltered = filterDealerRowsForCurrentAccess(refreshedRaw);
          displayRows = refreshedFiltered;
          if (displayRows.length > 0 || readActiveRegion() !== "za") {
            hierarchyHydratedRef.current = true;
            setDealerRows(displayRows);
            try {
              window.localStorage.setItem("vivi.org.dealers", JSON.stringify(displayRows));
            } catch {
              // ignore
            }
            if (needsHeal && hierarchyHealAttempted.has(tenantKey) && opts?.fromModal) {
              setLastAction("Synced local organisations/databases to the shared tree.");
            }
          }
        } else if (serverRows.length > 0 || readActiveRegion() !== "za") {
          hierarchyHydratedRef.current = true;
          setDealerRows(serverRows);
          displayRows = serverRows;
          try {
            window.localStorage.setItem("vivi.org.dealers", JSON.stringify(serverRows));
          } catch {
            // ignore
          }
        } else if (localRows.length > 0) {
          displayRows = filterDealerRowsForCurrentAccess(localRows);
          setDealerRows(displayRows);
        }

        const source = displayRows.length > 0 ? displayRows : dealerRows;
        if (source.length === 0) return;
        const resolved = resolveStoredSelection(source);
        setActiveScope(resolved.scope);
        setActiveDealerId(resolved.dealer?.id ?? "");
        setActiveOrgId(resolved.org?.id ?? "");
        setActiveDbId(resolved.db?.id ?? "");
        setActiveSiteId(resolved.site?.id ?? "");
        setActiveAsset(resolved.asset);

        const missingGroup = (hierarchy?.dealers ?? []).some((dealer: any) =>
          (dealer?.organisations ?? []).some((org: any) =>
            (org?.databases ?? []).some((db: any) =>
              (db?.sites ?? []).some((site: any) => !(Number(site?.traccarGroupId ?? 0) > 0))
            )
          )
        );
        const onLocalDev =
          typeof window !== "undefined"
          && /^(localhost|127\.0\.0\.1|::1)$/i.test(String(window.location?.hostname ?? ""));
        // Vite's /admin proxy often 404s against the worker; skip auto-repair on local dev.
        if (missingGroup && !onLocalDev && !siteGroupRepairAttempted.has(tenantKey)) {
          siteGroupRepairAttempted.add(tenantKey);
          try {
            const repaired = await repairTraccarSiteGroups();
            if (cancelled || !repaired?.hierarchy) return;
            const repairedRows = filterDealerRowsForCurrentAccess(mapHierarchyToDealers(repaired.hierarchy));
            if (repairedRows.length > 0) setDealerRows(repairedRows);
          } catch {
            // Missing worker route must not block the ribbon.
          }
        }
      } catch {
        // Keep provisional cache if backend hierarchy isn't reachable.
      } finally {
        if (!cancelled) setHierarchyLoading(false);
      }
    };

    void hydrateHierarchy({ fromModal: false });
    return () => {
      cancelled = true;
    };
  }, [authStamp]);

  useEffect(() => {
    if (!orgModalOpen) return;
    let cancelled = false;
    const reload = async () => {
      setHierarchyLoading(true);
      try {
        const hierarchy = await getHierarchy();
        if (cancelled) return;
        if (hierarchy?.unavailable) return;
        const rawRows = mapHierarchyToDealers(hierarchy);
        const filteredRows = filterDealerRowsForCurrentAccess(rawRows);
        const serverRows = filteredRows;
        const localRows = readCachedDealerRows();
        const tenantKey = String(getTenantId() ?? "").trim() || "_";
        const canHealSharedTree = canHealSharedHierarchyTree();
        const healPayload =
          canHealSharedTree && serverRows.length === 0 && !hierarchyUsesSyntheticIds(localRows)
            ? buildSafeHierarchyHealPayload(localRows, serverRows)
            : [];
        if (healPayload.length > 0) {
          const healed = await syncHierarchyTree(healPayload as any);
          if (!cancelled && healed?.hierarchy) hierarchyHealAttempted.add(tenantKey);
        }
        const refreshed = healPayload.length > 0 ? await getHierarchy() : hierarchy;
        if (cancelled) return;
        const usable = refreshed?.unavailable ? hierarchy : refreshed;
        if (usable?.unavailable) return;
        const refreshedRaw = mapHierarchyToDealers(usable);
        const refreshedFiltered = filterDealerRowsForCurrentAccess(refreshedRaw);
        const displayRows = refreshedFiltered;
        if (canHealSharedTree) {
          if (displayRows.length > 0 || readActiveRegion() !== "za") {
            hierarchyHydratedRef.current = true;
            setDealerRows(displayRows);
            try {
              window.localStorage.setItem("vivi.org.dealers", JSON.stringify(displayRows));
            } catch {
              // ignore
            }
          }
        } else if (displayRows.length > 0 || readActiveRegion() !== "za") {
          hierarchyHydratedRef.current = true;
          setDealerRows(displayRows);
          try {
            window.localStorage.setItem("vivi.org.dealers", JSON.stringify(displayRows));
          } catch {
            // ignore
          }
        } else if (localRows.length > 0) {
          setDealerRows(filterDealerRowsForCurrentAccess(localRows));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setHierarchyLoading(false);
      }
    };
    void reload();
    return () => {
      cancelled = true;
    };
  }, [orgModalOpen]);

  useEffect(() => {
    if (!orgModalOpen || dealerRows.length === 0) return;
    const dealer = dealerRows.find((row) => row.id === activeDealerId) ?? dealerRows[0];
    if (!dealer) return;
    if (dealer.id !== activeDealerId) setActiveDealerId(dealer.id);
    const orgs = dealer.organisations ?? [];
    if (!orgs.length) return;
    const org = orgs.find((row) => row.id === activeOrgId) ?? orgs[0];
    if (org.id !== activeOrgId) setActiveOrgId(org.id);
    const dbs = org.databases ?? [];
    if (!dbs.length) return;
    const db = dbs.find((row) => row.id === activeDbId) ?? dbs[0];
    if (db.id !== activeDbId) setActiveDbId(db.id);
    const siteRows = db.sites ?? [];
    if (!siteRows.length) return;
    const site = siteRows.find((row) => row.id === activeSiteId) ?? siteRows[0];
    if (site.id !== activeSiteId) setActiveSiteId(site.id);
  }, [activeDealerId, activeOrgId, activeDbId, activeSiteId, dealerRows, orgModalOpen]);

  const activeDealer = useMemo(
    () => dealerRows.find((d) => d.id === activeDealerId),
    [activeDealerId, dealerRows]
  );
  const organisations = useMemo(() => {
    // When Organisations (code: dealer) are hidden, list Dealers across the whole tree.
    if (!hierarchyVisibility.showDealer) {
      return dealerRows.flatMap((dealer) => dealer.organisations ?? []);
    }
    return activeDealer?.organisations ?? [];
  }, [activeDealer, dealerRows, hierarchyVisibility.showDealer]);
  const activeOrg = useMemo(
    () => organisations.find((o) => o.id === activeOrgId),
    [organisations, activeOrgId]
  );
  const databases = useMemo(() => {
    // Own Support (and any role with organisations hidden) browses all databases under the dealer.
    if (!hierarchyVisibility.showOrganisation) {
      if (!activeDealer) return [] as Database[];
      return (activeDealer.organisations ?? []).flatMap((org) => org.databases ?? []);
    }
    if (!activeOrgId) return [] as Database[];
    return activeOrg?.databases ?? [];
  }, [activeDealer, activeOrg, activeOrgId, hierarchyVisibility.showOrganisation]);

  const findOrganisationForDatabase = (databaseId: string) => {
    const needle = String(databaseId ?? "").trim();
    if (!needle) return null;
    for (const org of organisations) {
      if ((org.databases ?? []).some((db) => String(db.id ?? "").trim() === needle)) return org;
    }
    return null;
  };
  const findDealerForOrganisation = (organisationId: string) => {
    const needle = String(organisationId ?? "").trim();
    if (!needle) return null;
    for (const dealer of dealerRows) {
      if ((dealer.organisations ?? []).some((org) => String(org.id ?? "").trim() === needle)) return dealer;
    }
    return null;
  };
  const activeDb = useMemo(
    () => databases.find((db) => db.id === activeDbId),
    [databases, activeDbId]
  );
  const sites = useMemo(() => {
    if (hierarchyVisibility.showDatabase) {
      if (!activeDbId) return [] as Site[];
      return activeDb?.sites ?? [];
    }
    // Basic and advanced users only see the site column, so list every site they can open.
    if (!hierarchyVisibility.showDealer && !hierarchyVisibility.showOrganisation) {
      const rows: Site[] = [];
      for (const dealer of dealerRows) {
        for (const org of dealer.organisations ?? []) {
          for (const db of org.databases ?? []) {
            for (const site of db.sites ?? []) rows.push(site);
          }
        }
      }
      return rows;
    }
    // Databases hidden: show sites under the active dealer (UI) / assigned scope.
    const rows: Site[] = [];
    const orgPool = activeOrgId
      ? organisations.filter((org) => org.id === activeOrgId)
      : organisations;
    for (const org of orgPool) {
      for (const db of org.databases ?? []) {
        for (const site of db.sites ?? []) rows.push(site);
      }
    }
    if (rows.length) return rows;
    for (const dealer of dealerRows) {
      for (const org of dealer.organisations ?? []) {
        for (const db of org.databases ?? []) {
          for (const site of db.sites ?? []) rows.push(site);
        }
      }
    }
    return rows;
  }, [
    activeDb,
    activeDbId,
    activeOrgId,
    dealerRows,
    hierarchyVisibility.showDatabase,
    hierarchyVisibility.showDealer,
    hierarchyVisibility.showOrganisation,
    organisations
  ]);
  const activeSite = useMemo(
    () => sites.find((site) => site.id === activeSiteId),
    [sites, activeSiteId]
  );

  const normalizeSiteName = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const buildAssetLabel = (asset: any) => formatAssetPickerLabel(asset);

  useEffect(() => {
    if (!orgModalOpen) return;
    if (!activeDealerId || !activeOrgId || !activeDbId) return;
    let cancelled = false;

    const sync = async () => {
      const tenantId = [activeDealerId, activeOrgId, activeDbId].filter(Boolean).join(":");
      setAssetsLoading(true);
      try {
      const assets = await getAssetsFromApiForTenant<any>(tenantId);
      if (cancelled) return;

      let workingAssets = Array.isArray(assets) ? assets : [];
      if (workingAssets.length === 0) {
        const activeTenant = String(readActiveTenantId() ?? "").trim();
        if (!activeTenant || activeTenant === tenantId) {
          const cached = peekCachedAssets<any>();
          workingAssets = cached.length > 0 ? cached : await getAssetsFromApi<any>();
          if (cancelled) return;
        }
      }

      // If this DB/tenant has no assets yet, but legacy (no-tenant) does, migrate them in.
      // Demo databases stay empty so another fleet's vehicles are not copied onto the new site.
      if (workingAssets.length === 0 && !tenantSkipsAutomaticFleetImport(tenantId)) {
        const migratedKey = tenantId ? `vivi.assets.migratedFromLegacy:${tenantId}` : "";
        const alreadyMigrated = migratedKey
          ? String(window.localStorage.getItem(migratedKey) ?? "").trim().toLowerCase() === "true"
          : false;

        const legacy = alreadyMigrated ? [] : await getAssetsFromApiForTenant<any>(null);
        if (!alreadyMigrated && legacy.length > 0) {
          const apiKey = getApiKey();
          if (!apiKey) {
            setLastAction(`Login required to migrate ${legacy.length} assets into this database.`);
          } else {
            const targetSite = String(activeSite?.name ?? "").trim() || "Gamini";
            setLastAction(`Migrating ${legacy.length} assets into ${targetSite}...`);
            let okCount = 0;
            for (const asset of legacy) {
              const id = String(asset?.id ?? "").trim();
              const imei = String(asset?.imei ?? "").trim();
              const configGroup = String(asset?.configGroup ?? asset?.configurationGroup ?? "").trim();
              if (!id || !imei) continue;
              const payload = { ...asset, id, imei, configGroup: configGroup || "", site: targetSite };
              const res = await upsertAssetDetailedForTenant(payload, tenantId);
              if (res.stored) okCount += 1;
            }
            try {
              if (migratedKey) window.localStorage.setItem(migratedKey, "true");
            } catch {
              // ignore
            }
            if (okCount > 0) {
              workingAssets = await getAssetsFromApiForTenant<any>(tenantId);
              setLastAction(`Migrated ${okCount} assets.`);
            } else {
              setLastAction("Migration attempted but no assets were saved.");
            }
          }
        }
      }

      // Always rewrite hierarchy asset labels from D1 for this database.
      // Keeping stale local labels when D1 is empty made the picker look full
      // while Assets / Live / Home stayed empty.
      const records: OrgModalAssetRecord[] = [];
      const rememberAsset = (label: string, description: string, registration: string, imei: string, siteName: string) => {
        if (!label) return;
        records.push({
          label,
          description: description || label,
          registration,
          imei,
          siteName
        });
      };
      for (const asset of workingAssets) {
        const label = buildAssetLabel(asset);
        if (!label) continue;
        rememberAsset(
          label,
          formatAssetDescription(asset) || label,
          String(asset?.registration ?? "").trim(),
          String(asset?.imei ?? "").trim(),
          resolveAssetSiteName(asset)
        );
      }

      const ribbonScope = [activeDealer?.name, activeOrg?.name, activeDb?.name, activeSite?.name];
      if (cms808HierarchyActive(ribbonScope)) {
        const cmsVehicles = await loadCms808VehiclesForActiveHierarchy(ribbonScope);
        const existingKeys = new Set(
          records.flatMap((row) => [row.label, row.registration, row.imei].map((value) => normalizeSiteName(value)).filter(Boolean))
        );
        for (const vehicle of cmsVehicles) {
          const rec = cms808VehicleToAssetRecord(vehicle);
          const label = String(rec.assetDescription || rec.registration || rec.imei || "").trim();
          const imei = String(rec.imei || "").trim();
          if (!label) continue;
          if (existingKeys.has(normalizeSiteName(label)) || existingKeys.has(normalizeSiteName(imei))) continue;
          const siteName = String(rec.site || cms808SiteName());
          rememberAsset(label, label, String(rec.registration || label), imei, siteName);
          existingKeys.add(normalizeSiteName(label));
          if (imei) existingKeys.add(normalizeSiteName(imei));
        }
      }
      if (records.length > 0 || loadedAssetTenantRef.current !== tenantId) {
        setOrgModalAssetRecords(records);
        loadedAssetTenantRef.current = tenantId;
      }

      const labelsForHierarchySite = (siteName: string) => assetLabelsForHierarchySite(records, siteName);

      updateDealers((rows) =>
        rows.map((dealer) => {
          if (dealer.id !== activeDealerId) return dealer;
          return {
            ...dealer,
            organisations: (dealer.organisations ?? []).map((org) => {
              if (org.id !== activeOrgId) return org;
              return {
                ...org,
                databases: (org.databases ?? []).map((db) => {
                  if (db.id !== activeDbId) return db;
                  const nextSites = (db.sites ?? []).map((site) => ({
                    ...site,
                    assets: labelsForHierarchySite(site.name)
                  }));
                  return { ...db, sites: nextSites };
                })
              };
            })
          };
        })
      );
      if (workingAssets.length === 0 && records.length === 0 && loadedAssetTenantRef.current === tenantId && orgModalAssetRecords.length === 0) {
        setLastAction("No saved assets in this database yet. Add them on the Assets page.");
      }
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    };

    void sync();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgModalOpen, activeDealerId, activeOrgId, activeDbId, activeSiteId]);
  const assets = useMemo(() => {
    const selectedSite = activeSiteId ? sites.find((site) => site.id === activeSiteId) : undefined;
    if (!selectedSite) return [] as string[];
    return assetLabelsForHierarchySite(orgModalAssetRecords, selectedSite.name);
  }, [activeSiteId, orgModalAssetRecords, sites]);

  const orgModalQuery = orgModalSearch.trim().toLowerCase();

  const matchesGroupQuery = (name: string) => {
    if (!orgModalQuery || orgModalBrowseMode !== "group") return true;
    return String(name ?? "").toLowerCase().includes(orgModalQuery);
  };

  const visibleDealerRows = useMemo(
    () => dealerRows.filter((dealer) => matchesGroupQuery(dealer.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dealerRows, orgModalBrowseMode, orgModalQuery]
  );

  const visibleOrganisations = useMemo(
    () => organisations.filter((org) => matchesGroupQuery(org.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organisations, orgModalBrowseMode, orgModalQuery]
  );

  const visibleDatabases = useMemo(
    () => databases.filter((db) => matchesGroupQuery(db.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [databases, orgModalBrowseMode, orgModalQuery]
  );

  const visibleSites = useMemo(
    () => sites.filter((site) => matchesGroupQuery(site.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sites, orgModalBrowseMode, orgModalQuery]
  );

  const visibleSiteGroups = useMemo(() => groupSitesByFamily(visibleSites), [visibleSites]);

  const visibleAssets = useMemo(() => {
    if (orgModalBrowseMode === "asset") {
      const siteScoped = activeSiteId
        ? orgModalAssetRecords.filter((row) => {
            const site = sites.find((item) => item.id === activeSiteId);
            if (!site) return false;
            return assetSiteMatchesHierarchySite(row.siteName, site.name);
          })
        : orgModalAssetRecords;
      const pool = siteScoped;
      if (!orgModalQuery) return pool.map((row) => row.label);
      return pool
        .filter((row) => {
          const primary = orgModalSearchBy === "registration" ? row.registration : row.description;
          if (primary) return primary.toLowerCase().includes(orgModalQuery);
          return row.label.toLowerCase().includes(orgModalQuery);
        })
        .map((row) => row.label);
    }
    if (!orgModalQuery) return assets;
    return assets.filter((label) => label.toLowerCase().includes(orgModalQuery));
  }, [
    activeSite,
    activeSiteId,
    assets,
    orgModalAssetRecords,
    orgModalBrowseMode,
    orgModalQuery,
    orgModalSearchBy,
    sites
  ]);

  const findAssetLocation = (assetName: string) => {
    for (const dealer of dealerRows) {
      for (const org of dealer.organisations) {
        for (const db of org.databases) {
          for (const site of db.sites) {
            if (site.assets.includes(assetName)) {
              return {
                dealerId: dealer.id,
                orgId: org.id,
                dbId: db.id,
                siteId: site.id
              };
            }
          }
        }
      }
    }
    return null;
  };

  const draftPath = useMemo(() => {
    const parts: string[] = [];
    if (hierarchyVisibility.showDealer && activeDealer?.name) parts.push(activeDealer.name);
    if (activeScope === "dealer") return parts.join(" / ");
    if (hierarchyVisibility.showOrganisation && activeOrg?.name) parts.push(activeOrg.name);
    if (activeScope === "org") return parts.join(" / ");
    if (hierarchyVisibility.showDatabase && activeDb?.name) parts.push(activeDb.name);
    if (activeScope === "db") return parts.join(" / ");
    if (activeSite?.name) parts.push(activeSite.name);
    if (activeScope === "asset" && activeAsset) {
      parts.push(activeAsset);
    }
    return parts.filter(Boolean).join(" / ");
  }, [activeDealer, activeOrg, activeDb, activeSite, activeAsset, activeScope, hierarchyVisibility.showDealer, hierarchyVisibility.showOrganisation, hierarchyVisibility.showDatabase]);
  const ribbonPath = (orgModalOpen ? draftPath || selectedPath : selectedPath || draftPath) || "Select organisation";

  useEffect(() => {
    if (hierarchyVisibility.showOrganisation) return;
    if (activeScope !== "org") return;
    setActiveScope(activeDbId ? "db" : "dealer");
  }, [activeScope, activeDbId, hierarchyVisibility.showOrganisation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (orgModalOpen) return;
    if (dealerRows.length === 0) return;
    if (!hierarchyHydratedRef.current) return;

    const resolved = resolveStoredSelection(dealerRows);
    if (skipHydrationRewriteRef.current) {
      skipHydrationRewriteRef.current = false;
      setActiveScope(resolved.scope);
      setActiveDealerId(resolved.dealer?.id ?? "");
      setActiveOrgId(resolved.org?.id ?? "");
      setActiveDbId(resolved.db?.id ?? "");
      setActiveSiteId(resolved.site?.id ?? "");
      setActiveAsset(resolved.asset);
      return;
    }
    const storedTenant = String(window.localStorage.getItem("vivi.tenantId") ?? "").trim();
    if (storedTenant === PUBLISHED_MMULU_TENANT_ID && resolved.tenant !== storedTenant) {
      if (String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim() !== PUBLISHED_MMULU_PATH) {
        window.localStorage.setItem("vivi.selectedPath", PUBLISHED_MMULU_PATH);
        setSelectedPath(PUBLISHED_MMULU_PATH);
      }
      return;
    }
    setActiveScope(resolved.scope);
    setActiveDealerId(resolved.dealer?.id ?? "");
    setActiveOrgId(resolved.org?.id ?? "");
    setActiveDbId(resolved.db?.id ?? "");
    setActiveSiteId(resolved.site?.id ?? "");
    setActiveAsset(resolved.asset);

    let changed = false;
    if (String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim() !== resolved.scope) {
      window.localStorage.setItem("vivi.selectedScope", resolved.scope);
      changed = true;
    }
    if (String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim() !== resolved.path) {
      window.localStorage.setItem("vivi.selectedPath", resolved.path);
      setSelectedPath(resolved.path);
      changed = true;
    }
    if (String(window.localStorage.getItem("vivi.activeDealerId") ?? "").trim() !== String(resolved.dealer?.id ?? "")) {
      if (resolved.dealer?.id) window.localStorage.setItem("vivi.activeDealerId", resolved.dealer.id);
      else window.localStorage.removeItem("vivi.activeDealerId");
      changed = true;
    }
    if (String(window.localStorage.getItem("vivi.activeOrgId") ?? "").trim() !== String(resolved.org?.id ?? "")) {
      if (resolved.org?.id) window.localStorage.setItem("vivi.activeOrgId", resolved.org.id);
      else window.localStorage.removeItem("vivi.activeOrgId");
      changed = true;
    }
    if (String(window.localStorage.getItem("vivi.tenantId") ?? "").trim() !== resolved.tenant) {
      activateTenantContext(resolved.tenant);
      if (resolved.tenant) window.localStorage.setItem("vivi.tenantId", resolved.tenant);
      else window.localStorage.removeItem("vivi.tenantId");
      changed = true;
    }
    if (String(window.localStorage.getItem("vivi.activeDbId") ?? "").trim() !== String(resolved.db?.id ?? "")) {
      if (resolved.db?.id) window.localStorage.setItem("vivi.activeDbId", resolved.db.id);
      else window.localStorage.removeItem("vivi.activeDbId");
      changed = true;
    }
    if (String(window.localStorage.getItem("vivi.activeSiteId") ?? "").trim() !== String(resolved.site?.id ?? "")) {
      if (resolved.site?.id) window.localStorage.setItem("vivi.activeSiteId", resolved.site.id);
      else window.localStorage.removeItem("vivi.activeSiteId");
      changed = true;
    }
    const previousSite = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
    const nextSite =
      resolved.scope === "site" || resolved.scope === "asset"
        ? String(resolved.site?.name ?? "").trim()
        : "";
    if (previousSite !== nextSite) {
      activateSiteContext(previousSite, nextSite);
      if (nextSite) window.localStorage.setItem("vivi.activeSite", nextSite);
      else window.localStorage.removeItem("vivi.activeSite");
      changed = true;
    }
    if (readUserPref(USER_PREF_KEYS.activeAsset) !== resolved.asset) {
      writeUserPref(USER_PREF_KEYS.activeAsset, resolved.asset);
      changed = true;
    }

    const resolvedContextType = resolved.scope === "org"
      ? "organisation"
      : resolved.scope === "db"
        ? "database"
        : resolved.scope;
    const resolvedContextName = resolved.scope === "asset"
      ? resolved.asset
      : resolved.scope === "site"
        ? String(resolved.site?.name ?? "")
        : resolved.scope === "db"
          ? String(resolved.db?.name ?? "")
          : resolved.scope === "org"
            ? String(resolved.org?.name ?? "")
            : String(resolved.dealer?.name ?? "");

    if (readUserPref(USER_PREF_KEYS.contextType) !== resolvedContextType) {
      writeUserPref(USER_PREF_KEYS.contextType, resolvedContextType);
      changed = true;
    }
    if (readUserPref(USER_PREF_KEYS.contextName) !== resolvedContextName) {
      writeUserPref(USER_PREF_KEYS.contextName, resolvedContextName);
      changed = true;
    }
    if (resolved.scope !== "asset") {
      if (readUserPref(USER_PREF_KEYS.activeRegistration) || readUserPref(USER_PREF_KEYS.activeImei)) {
        clearActiveAssetPrefs();
        // Keep activeAsset cleared when scope is not asset — writeActiveAssetPrefs not needed;
        // resolved.asset already handled above as empty string.
        changed = true;
      }
    }

    window.localStorage.setItem("vivi.activeDbSites", JSON.stringify(resolved.dbSites));

    if (changed) {
      window.dispatchEvent(new Event("vivi:orgchange"));
      window.dispatchEvent(new Event("vivi:contextchange"));
    }
  }, [dealerRows, orgModalOpen]);

  useEffect(() => {
    if (!selectedPath) return;
    const [dealerName] = selectedPath
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!dealerName) return;
    const exists = dealerRows.some((dealer) => dealer.name === dealerName);
    if (!exists) {
      setSelectedPath("");
      try {
        localStorage.removeItem("vivi.selectedPath");
      } catch {
        // ignore storage errors
      }
    }
  }, [dealerRows, selectedPath]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Mirror of last good server tree only — never clobber a healable cache with empty pre-hydrate state.
    if (!hierarchyHydratedRef.current && dealerRows.length === 0) return;
    if (!shouldPersistHierarchyCache(dealerRows, readCachedDealerRows())) return;
    try {
      localStorage.setItem("vivi.org.dealers", JSON.stringify(dealerRows));
    } catch {
      // ignore storage failures
    }
    if (!dealerRowsCommittedRef.current) {
      dealerRowsCommittedRef.current = true;
      return;
    }
    // Hierarchy object identity changes on hydrate/heal. Only notify when
    // the selected org context actually needs a refresh — not on every persist.
  }, [dealerRows]);

  useEffect(() => {
    if (!orgModalOpen) return;
    void refreshAssignments();
  }, [orgModalOpen]);

  const canSelect = useMemo(() => {
    if (activeScope === "dealer") return Boolean(activeDealerId);
    if (activeScope === "org") return Boolean(activeOrgId);
    if (activeScope === "db") return Boolean(activeDbId);
    if (activeScope === "site") return Boolean(activeSiteId);
    return Boolean(activeAsset);
  }, [activeDealerId, activeOrgId, activeDbId, activeSiteId, activeAsset, activeScope]);

  const updateDealers = (updater: (rows: Dealer[]) => Dealer[]) => {
    setDealerRows((current) => updater(current));
  };

  const createId = (prefix: string) =>
    `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`;

  const renameResolverRef = useRef<((value: string | null) => void) | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameLabel, setRenameLabel] = useState("item");
  const [renameValue, setRenameValue] = useState("");

  const closeRenameModal = (value: string | null = null) => {
    setRenameModalOpen(false);
    setRenameLabel("item");
    setRenameValue("");
    const resolver = renameResolverRef.current;
    renameResolverRef.current = null;
    if (resolver) resolver(value);
  };

  const requestName = (label: string, currentValue: string) => {
    setRenameLabel(String(label ?? "item"));
    setRenameValue(String(currentValue ?? "").trim());
    setRenameModalOpen(true);
    return new Promise<string | null>((resolve) => {
      renameResolverRef.current = resolve;
    });
  };

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addScope, setAddScope] = useState<"dealer" | "organisation" | "database" | "site" | "asset">("dealer");
  const [addValue, setAddValue] = useState("");
  const addScopeLabels: Record<typeof addScope, string> = {
    dealer: hierarchyUiLabels.dealer.singular,
    organisation: hierarchyUiLabels.organisation.singular,
    database: hierarchyUiLabels.database.singular,
    site: hierarchyUiLabels.site.singular,
    asset: hierarchyUiLabels.asset.singular
  };

  // --- Assign / Revoke modal state ---
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignScope, setAssignScope] = useState<HierarchyScope | null>(null);
  const [assignTargetId, setAssignTargetId] = useState("");
  const [assignTargetLabel, setAssignTargetLabel] = useState("");
  const [assignUserName, setAssignUserName] = useState("");
  const [assignUserEmail, setAssignUserEmail] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [knownUsers, setKnownUsers] = useState<AssignmentCandidate[]>([]);
  const [assignmentMap, setAssignmentMap] = useState<Record<string, HierarchyAssignment>>({});
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [revokeScope, setRevokeScope] = useState<HierarchyScope | null>(null);
  const [revokeTargetId, setRevokeTargetId] = useState("");
  const [revokeTargetLabel, setRevokeTargetLabel] = useState("");
  const [revokeUserEmail, setRevokeUserEmail] = useState("");
  const [revokeSaving, setRevokeSaving] = useState(false);

  const assignmentKey = (scope: HierarchyScope, targetId: string) => `${scope}:${String(targetId ?? "").trim()}`;

  const assignmentPrincipal = (scope: HierarchyScope, targetId: string) => {
    const assignment = assignmentMap[assignmentKey(scope, targetId)];
    if (!assignment) return "";
    return String(assignment.userName || assignment.userEmail || "").trim();
  };

  const readLocalAssignmentMap = (): Record<string, HierarchyAssignment> => {
    try {
      const raw = window.localStorage.getItem(hierarchyAssignmentsKey) ?? "";
      if (!raw) return {};
      const parsed = JSON.parse(raw) as { items?: HierarchyAssignment[] };
      const next: Record<string, HierarchyAssignment> = {};
      for (const item of parsed?.items ?? []) {
        next[assignmentKey(item.scope, item.targetId)] = item;
      }
      return next;
    } catch { return {}; }
  };

  const refreshAssignments = async () => {
    const localMap = readLocalAssignmentMap();
    setAssignmentMap(localMap);
    try {
      const response = await fetch(buildApiUrl("/b2/hierarchy/assign"), {
        method: "GET",
        headers: {
          ...(getTenantId() ? { "x-tenant-id": getTenantId() } : {}),
          ...(getApiKey() ? { "x-api-key": getApiKey() } : {})
        }
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { items?: HierarchyAssignment[] };
      const remoteMap: Record<string, HierarchyAssignment> = {};
      for (const item of payload?.items ?? []) {
        remoteMap[assignmentKey(item.scope, item.targetId)] = item;
      }
      setAssignmentMap({ ...localMap, ...remoteMap });
    } catch { /* keep local fallback */ }
  };

  const collectKnownUsers = (): AssignmentCandidate[] => {
    const users = new Map<string, AssignmentCandidate>();
    const upsert = (nameRaw: unknown, emailRaw: unknown) => {
      const name = String(nameRaw ?? "").trim();
      const email = String(emailRaw ?? "").trim().toLowerCase();
      if (!name && !email) return;
      const key = email || name.toLowerCase();
      if (!key) return;
      users.set(key, { name: name || email, email });
    };
    try {
      const principalRaw = window.localStorage.getItem("vivi.auth.principal") ?? "";
      if (principalRaw) {
        const principal = JSON.parse(principalRaw) as any;
        upsert(principal?.principal?.name, principal?.principal?.email);
      }
    } catch { /* ignore */ }
    upsert(window.localStorage.getItem("vivi.impersonatingName"), window.localStorage.getItem("vivi.impersonating"));
    try {
      const raw = window.localStorage.getItem(hierarchyAssignmentsKey) ?? "";
      if (raw) {
        const parsed = JSON.parse(raw) as { items?: HierarchyAssignment[] };
        for (const item of parsed?.items ?? []) upsert(item?.userName, item?.userEmail);
      }
    } catch { /* ignore */ }
    return Array.from(users.values()).sort((a, b) => `${a.name} ${a.email}`.localeCompare(`${b.name} ${b.email}`));
  };

  const openAssignModal = (scope: HierarchyScope, targetId: string, targetLabel: string) => {
    setAssignScope(scope);
    setAssignTargetId(String(targetId ?? "").trim());
    setAssignTargetLabel(String(targetLabel ?? "").trim());
    setAssignUserName("");
    setAssignUserEmail("");
    setKnownUsers(collectKnownUsers());
    setAssignModalOpen(true);
  };

  const closeAssignModal = () => {
    setAssignModalOpen(false);
    setAssignScope(null);
    setAssignTargetId("");
    setAssignTargetLabel("");
    setAssignUserName("");
    setAssignUserEmail("");
  };

  const openRevokeModal = (scope: HierarchyScope, targetId: string, targetLabel: string) => {
    setRevokeScope(scope);
    setRevokeTargetId(String(targetId ?? "").trim());
    setRevokeTargetLabel(String(targetLabel ?? "").trim());
    const current = assignmentMap[assignmentKey(scope, targetId)];
    setRevokeUserEmail(String(current?.userEmail ?? "").trim());
    setKnownUsers(collectKnownUsers());
    setRevokeModalOpen(true);
  };

  const closeRevokeModal = () => {
    setRevokeModalOpen(false);
    setRevokeScope(null);
    setRevokeTargetId("");
    setRevokeTargetLabel("");
    setRevokeUserEmail("");
  };

  const persistHierarchyAssignment = async (entry: HierarchyAssignment): Promise<{ ok: boolean; viaApi?: boolean }> => {
    try {
      const response = await fetch(buildApiUrl("/b2/hierarchy/assign"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(getTenantId() ? { "x-tenant-id": getTenantId() } : {}),
          ...(getApiKey() ? { "x-api-key": getApiKey() } : {})
        },
        body: JSON.stringify(entry)
      });
      if (response.ok) {
        const data = (await response.json()) as { assignment?: HierarchyAssignment };
        const saved = data?.assignment ?? entry;
        setAssignmentMap((current) => ({ ...current, [assignmentKey(saved.scope, saved.targetId)]: saved }));
        return { ok: true, viaApi: true };
      }
    } catch { /* fallback */ }
    try {
      const raw = window.localStorage.getItem(hierarchyAssignmentsKey) ?? "";
      const parsed = raw ? (JSON.parse(raw) as { items?: HierarchyAssignment[] }) : { items: [] as HierarchyAssignment[] };
      const items = Array.isArray(parsed.items) ? [...parsed.items] : [];
      const idx = items.findIndex((i) => i.scope === entry.scope && i.targetId === entry.targetId && i.userEmail.toLowerCase() === entry.userEmail.toLowerCase());
      if (idx >= 0) items[idx] = entry; else items.unshift(entry);
      window.localStorage.setItem(hierarchyAssignmentsKey, JSON.stringify({ items: items.slice(0, 500), updatedAt: new Date().toISOString() }));
      setAssignmentMap((current) => ({ ...current, [assignmentKey(entry.scope, entry.targetId)]: entry }));
      return { ok: true, viaApi: false };
    } catch { return { ok: false }; }
  };

  const handleAssignSubmit = async () => {
    if (!assignScope || !assignTargetId || !assignTargetLabel) return;
    const normalizedName = assignUserName.trim();
    const normalizedEmail = assignUserEmail.trim().toLowerCase();
    if (!normalizedName && !normalizedEmail) {
      showToast("Enter a user name or email address.", "error");
      return;
    }
    if (normalizedEmail && !normalizedEmail.includes("@")) {
      showToast("Enter a valid email address.", "error");
      return;
    }
    const assignment: HierarchyAssignment = {
      scope: assignScope,
      targetId: assignTargetId,
      targetLabel: assignTargetLabel,
      userName: normalizedName || normalizedEmail,
      userEmail: normalizedEmail,
      assignedByName: String(localStorage.getItem("vivi.impersonatingName") ?? "").trim(),
      assignedByEmail: String(localStorage.getItem("vivi.impersonating") ?? "").trim().toLowerCase(),
      createdAt: new Date().toISOString()
    };
    setAssignSaving(true);
    const result = await persistHierarchyAssignment(assignment);
    setAssignSaving(false);
    if (!result.ok) { showToast("Could not save assignment.", "error"); return; }
    const principal = assignment.userName || assignment.userEmail;
    showToast(`Assigned "${assignment.targetLabel}" to ${principal}${result.viaApi ? "." : " (saved locally)."}`, "success");
    setLastAction(`Assigned ${assignment.scope} "${assignment.targetLabel}" to ${principal}`);
    void refreshAssignments();
    closeAssignModal();
  };

  const handleRevokeSubmit = async () => {
    if (!revokeScope || !revokeTargetId) return;
    const normalizedEmail = revokeUserEmail.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      showToast("Enter a valid email address to revoke access.", "error");
      return;
    }
    setRevokeSaving(true);
    let revokedViaApi = false;
    try {
      const response = await fetch(buildApiUrl("/b2/hierarchy/assign"), {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          ...(getTenantId() ? { "x-tenant-id": getTenantId() } : {}),
          ...(getApiKey() ? { "x-api-key": getApiKey() } : {})
        },
        body: JSON.stringify({ scope: revokeScope, targetId: revokeTargetId, userEmail: normalizedEmail })
      });
      if (response.ok) revokedViaApi = true;
    } catch { /* fallback to local */ }
    try {
      const raw = window.localStorage.getItem(hierarchyAssignmentsKey) ?? "";
      const parsed = raw ? (JSON.parse(raw) as { items?: HierarchyAssignment[]; updatedAt?: string }) : { items: [] as HierarchyAssignment[] };
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const filtered = items.filter(
        (item) => !(item.scope === revokeScope && item.targetId === revokeTargetId && item.userEmail.toLowerCase() === normalizedEmail)
      );
      window.localStorage.setItem(hierarchyAssignmentsKey, JSON.stringify({ items: filtered, updatedAt: new Date().toISOString() }));
      setAssignmentMap((current) => {
        const next = { ...current };
        delete next[assignmentKey(revokeScope!, revokeTargetId)];
        return next;
      });
    } catch { /* ignore */ }
    setRevokeSaving(false);
    showToast(`Access revoked for "${revokeTargetLabel}"${revokedViaApi ? "." : " (saved locally)."}`, "success");
    setLastAction(`Revoked access for ${normalizedEmail} on ${revokeTargetLabel}`);
    void refreshAssignments();
    closeRevokeModal();
  };

  // ── Site timezone modal ──────────────────────────────────
  const [siteTimeZoneModalOpen, setSiteTimeZoneModalOpen] = useState(false);
  const [siteTimeZoneTargetId, setSiteTimeZoneTargetId] = useState("");
  const [siteTimeZoneTargetName, setSiteTimeZoneTargetName] = useState("");
  const [siteTimeZoneValue, setSiteTimeZoneValue] = useState("Africa/Dar_es_Salaam");
  const [siteTimeZoneSearch, setSiteTimeZoneSearch] = useState("");
  const [siteTimeZoneSaving, setSiteTimeZoneSaving] = useState(false);
  const [siteTimeZoneSettings, setSiteTimeZoneSettings] = useState<SiteTimeZoneSettings | null>(null);
  const [showTimeZoneDropdown, setShowTimeZoneDropdown] = useState(false);

  const openSiteTimeZoneModal = async (siteId: string, siteName: string) => {
    setSiteTimeZoneTargetId(siteId);
    setSiteTimeZoneTargetName(siteName);
    const settings = await getSiteTimeZoneSettings();
    setSiteTimeZoneSettings(settings);
    setSiteTimeZoneValue(resolveTimeZoneForSite(siteName, settings));
    setSiteTimeZoneSearch("");
    setShowTimeZoneDropdown(false);
    setSiteTimeZoneModalOpen(true);
  };

  const closeSiteTimeZoneModal = () => {
    setSiteTimeZoneModalOpen(false);
    setSiteTimeZoneTargetId("");
    setSiteTimeZoneTargetName("");
    setSiteTimeZoneSearch("");
    setShowTimeZoneDropdown(false);
  };

  const filteredTimeZones = SITE_TIME_ZONE_CHOICES.filter((tz) =>
    toLaymanTimeZoneLabel(tz.value, tz.label).toLowerCase().includes(siteTimeZoneSearch.toLowerCase()) ||
    tz.label.toLowerCase().includes(siteTimeZoneSearch.toLowerCase()) ||
    tz.value.toLowerCase().includes(siteTimeZoneSearch.toLowerCase())
  );

  const handleSiteTimeZoneSave = async () => {
    if (!siteTimeZoneTargetName) return;
    beginSaving("Saving");
    setSiteTimeZoneSaving(true);
    const current = siteTimeZoneSettings ?? {};
    const updated: SiteTimeZoneSettings = {
      ...current,
      sites: { ...(current.sites ?? {}), [siteTimeZoneTargetName.trim().toLowerCase()]: siteTimeZoneValue }
    };
    const ok = await saveSiteTimeZoneSettings(updated);
    setSiteTimeZoneSaving(false);
    if (ok) {
      setSiteTimeZoneSettings(updated);
      setLastAction(`Time zone updated for ${siteTimeZoneTargetName}`);
      endSavingDone("Saved");
      closeSiteTimeZoneModal();
    } else {
      endSavingError("Failed to save time zone.");
    }
  };

  const handleAction = async (
    action: string,
    scope: "dealer" | "org" | "db" | "site" | "asset",
    id: string
  ) => {
    const hierarchyAction = actionToHierarchyAction(action);
    const segment = rowScopeToSegment(scope);
    if (hierarchyAction && !canManageHierarchyLevel(actorScope, segment, hierarchyAction)) {
      setLastAction(`You do not have permission to ${String(action).toLowerCase()} ${uiLabelForRowScope(scope).toLowerCase()}s.`);
      setOpenActionRow(null);
      return;
    }
    if (scope === "org" && !canManageHierarchyLevel(actorScope, "organisation", hierarchyAction ?? "edit")) {
      setLastAction("Dealers are managed by Admin or Own Support accounts.");
      setOpenActionRow(null);
      return;
    }
    if (scope === "dealer" && !canManageHierarchyLevel(actorScope, "dealer", hierarchyAction ?? "edit")) {
      setLastAction("Organisations are managed by Admin accounts.");
      setOpenActionRow(null);
      return;
    }
    const act = action.toLowerCase();

    if (act === "delete" && typeof window !== "undefined" && !window.confirm(`Delete this ${uiLabelForRowScope(scope).toLowerCase()}? This cannot be undone.`)) {
      setOpenActionRow(null);
      return;
    }

    if (act === "assign" || act === "revoke") {
      const scopeApiMap: Record<"dealer" | "org" | "db" | "site" | "asset", HierarchyScope> = {
        dealer: "dealer", org: "organisation", db: "database", site: "site", asset: "asset"
      };
      const hscope = scopeApiMap[scope];
      const label = scope === "dealer" ? (dealerRows.find((d) => d.id === id)?.name ?? id)
        : scope === "org" ? (organisations.find((o) => o.id === id)?.name ?? id)
        : scope === "db" ? (databases.find((d) => d.id === id)?.name ?? id)
        : scope === "site" ? (sites.find((s) => s.id === id)?.name ?? id)
        : id;
      if (act === "assign") openAssignModal(hscope, id, label);
      else openRevokeModal(hscope, id, label);
      setOpenActionRow(null);
      return;
    }

    if (act === "set timezone") {
      const siteName = sites.find((s) => s.id === id)?.name ?? id;
      void openSiteTimeZoneModal(id, siteName);
      setOpenActionRow(null);
      return;
    }

    let editName: string | null = null;
    if (act === "edit") {
      const currentLabel = scope === "dealer"
        ? (dealerRows.find((d) => d.id === id)?.name ?? "")
        : scope === "org"
          ? (organisations.find((o) => o.id === id)?.name ?? "")
          : scope === "db"
            ? (databases.find((d) => d.id === id)?.name ?? "")
            : scope === "site"
              ? (sites.find((s) => s.id === id)?.name ?? "")
              : id;
      const labelForUi = uiLabelForRowScope(scope);
      editName = await requestName(labelForUi, currentLabel);
      if (!editName) {
        setOpenActionRow(null);
        return;
      }
    }

    if (scope !== "asset") {
      const typeMap: Record<"dealer" | "org" | "db" | "site", "dealer" | "organisation" | "database" | "site"> = {
        dealer: "dealer",
        org: "organisation",
        db: "database",
        site: "site"
      };
      const apiType = typeMap[scope as "dealer" | "org" | "db" | "site"];
      try {
        if (act === "delete") {
          const res = await deleteHierarchyItem(apiType, id);
          const hier = (res as any)?.hierarchy;
          if (hier && Array.isArray(hier.dealers) && hier.dealers.length > 0) {
            setDealerRows(filterDealerRowsForCurrentAccess(mapHierarchyToDealers(hier)));
            setLastAction(`${action} on ${id}`);
            setOpenActionRow(null);
            return;
          }
          if (res?.ok) {
            setLastAction(`${action} on ${id}`);
            setOpenActionRow(null);
            const refreshed = await getHierarchy();
            if (refreshed?.dealers?.length) {
              setDealerRows(filterDealerRowsForCurrentAccess(mapHierarchyToDealers(refreshed)));
            }
            return;
          }
          const deleteError = String((res as any)?.error ?? "").trim();
          setLastAction(
            deleteError
              ? `Failed to delete ${uiLabelForRowScope(scope).toLowerCase()}. (${deleteError})`
              : `Failed to delete ${uiLabelForRowScope(scope).toLowerCase()}. Check connection and try again.`
          );
          setOpenActionRow(null);
          return;
        }
        if (act === "edit") {
          const nextName = String(editName ?? "").trim();
          if (!nextName) {
            setOpenActionRow(null);
            return;
          }
          const res = await renameHierarchyItem(apiType, id, nextName);
          const hier = (res as any)?.hierarchy;
          if (hier && Array.isArray(hier.dealers) && hier.dealers.length > 0) {
            setDealerRows(filterDealerRowsForCurrentAccess(mapHierarchyToDealers(hier)));
            setLastAction(`${action} on ${id}`);
            setOpenActionRow(null);
            return;
          }
          const renameError = String((res as any)?.error ?? "").trim();
          setLastAction(
            renameError
              ? `Failed to rename ${uiLabelForRowScope(scope).toLowerCase()}. (${renameError})`
              : `Failed to rename ${uiLabelForRowScope(scope).toLowerCase()}. Check connection and try again.`
          );
          setOpenActionRow(null);
          return;
        }
      } catch {
        setLastAction(`Failed to ${act} ${scope}.`);
        setOpenActionRow(null);
        return;
      }
    }

    if (scope !== "asset") {
      setOpenActionRow(null);
      return;
    }

    if (act === "delete") {
      const record = orgModalAssetRecords.find((row) => row.label === id);
      const assetTenantId = [activeDealerId, activeOrgId, activeDbId].filter(Boolean).join(":");
      if (!record || !assetTenantId || (!record.imei && !record.registration)) {
        setLastAction("Could not identify this asset to delete.");
        setOpenActionRow(null);
        return;
      }
      const result = await deleteAssetFromApi(
        assetTenantId,
        record.imei ? { imei: record.imei } : { registration: record.registration }
      );
      if (!result.deleted) {
        setLastAction(`Failed to delete asset. (${result.error ?? "Check connection and try again."})`);
        setOpenActionRow(null);
        return;
      }
      setOrgModalAssetRecords((rows) => rows.filter((row) => row !== record));
    }
    updateDealers((rows) =>
      rows.map((dealer) => ({
        ...dealer,
        organisations: dealer.organisations.map((org) => ({
          ...org,
          databases: org.databases.map((db) => ({
            ...db,
            sites: db.sites.map((site) => {
              const assets = site.assets ?? [];
              if (act === "delete") {
                return { ...site, assets: assets.filter((asset) => asset !== id) };
              }
              if (act === "duplicate") {
                return { ...site, assets: [...assets, `${id} Copy`] };
              }
              if (act === "edit") {
                const nextName = String(editName ?? "").trim();
                if (!nextName) return site;
                return {
                  ...site,
                  assets: assets.map((asset) => (asset === id ? nextName : asset))
                };
              }
              return site;
            })
          }))
        }))
      }))
    );

    const message = `${action} on ${id}`;
    setLastAction(message);
    setOpenActionRow(null);
  };

  const applyServerHierarchy = (hierarchy: any, successMsg?: string) => {
    const rows = filterDealerRowsForCurrentAccess(mapHierarchyToDealers(hierarchy));
    if (!rows.length) return false;
    hierarchyHydratedRef.current = true;
    setDealerRows(rows);
    try {
      window.localStorage.setItem("vivi.org.dealers", JSON.stringify(rows));
    } catch {
      // ignore
    }
    if (successMsg) setLastAction(successMsg);
    return true;
  };

  const applyHierarchyOrFallback = async (
    apiResult: any,
    _fallback: () => void,
    successMsg: string,
    options?: { allowLocalFallback?: boolean; failureMsg?: string }
  ) => {
    // Hierarchy mutations are server-authoritative only. Never invent local-only nodes.
    const hier = (apiResult as any)?.hierarchy;
    if (hier && Array.isArray(hier.dealers) && hier.dealers.length > 0) {
      const groupErr = String((apiResult as any)?.traccarGroupError ?? "").trim();
      const gpsErr = String((apiResult as any)?.gpsIotError ?? "").trim();
      const warning = [groupErr ? `Traccar warning: ${groupErr}` : "", gpsErr ? `GPS IoT warning: ${gpsErr}` : ""].filter(Boolean).join("; ");
      applyServerHierarchy(hier, warning ? `${successMsg} (${warning})` : successMsg);
      const savedRows = filterDealerRowsForCurrentAccess(mapHierarchyToDealers(hier));
      // Re-read the shared tree, then put back any organisation the US read still omitted.
      try {
        const confirmed = await getHierarchy();
        if (confirmed?.dealers?.length) {
          const confirmedRows = filterDealerRowsForCurrentAccess(mapHierarchyToDealers(confirmed));
          applyServerHierarchy({ dealers: unionDealers(confirmedRows, savedRows) });
        }
      } catch {
        // keep response hierarchy
      }
      return;
    }
    const apiError = String((apiResult as any)?.error ?? "").trim();
    setLastAction(
      apiError
        ? `${options?.failureMsg ?? "Failed to save."} (${apiError})`
        : options?.failureMsg ?? "Failed to save. Check connection and try again."
    );
  };

  const addEntity = async (scope: "dealer" | "organisation" | "database" | "site" | "asset", name: string) => {
    if (!name) return;
    if (!canCreateSegment(scope)) {
      setLastAction(`You do not have permission to create ${scope === "dealer" ? "organisations" : scope === "organisation" ? "dealers" : `${scope}s`}.`);
      return;
    }

    if (scope === "dealer") {
      const res = await addHierarchyDealer(name);
      await applyHierarchyOrFallback(
        res,
        () => {},
        `Added ${hierarchyUiLabels.dealer.singular.toLowerCase()} ${name}`,
        {
          allowLocalFallback: false,
          failureMsg: `Failed to add ${hierarchyUiLabels.dealer.singular.toLowerCase()} ${name}. Check connection and try again.`
        }
      );
      const createdId = String(res?.dealer?.id ?? "").trim();
      if (createdId && res?.ok !== false && !res?.error) {
        setActiveDealerId(createdId);
        setActiveOrgId("");
        setActiveDbId("");
        setActiveSiteId("");
        setActiveAsset("");
        setActiveScope("dealer");
      }
      return;
    }

    if (scope === "organisation") {
      if (!canCreateSegment("organisation")) {
        setLastAction("Dealers are managed by Admin or Own Support accounts.");
        return;
      }
      if (!activeDealerId) { setLastAction(`Select an ${hierarchyUiLabels.dealer.singular.toLowerCase()} to add a ${hierarchyUiLabels.organisation.singular.toLowerCase()}.`); return; }
      const res = await addHierarchyOrganisation(activeDealerId, name);
      await applyHierarchyOrFallback(
        res,
        () => {},
        `Added ${hierarchyUiLabels.organisation.singular.toLowerCase()} ${name}`,
        {
          allowLocalFallback: false,
          failureMsg: `Failed to add ${hierarchyUiLabels.organisation.singular.toLowerCase()} ${name}. Check connection and try again.`
        }
      );
      const createdId = String(res?.organisation?.id ?? "").trim();
      if (createdId && res?.ok !== false && !res?.error) {
        setActiveOrgId(createdId);
        setActiveDbId("");
        setActiveSiteId("");
        setActiveAsset("");
        setActiveScope("org");
      }
      return;
    }

    if (scope === "database") {
      let organisationId = activeOrgId;
      if (!hierarchyVisibility.showOrganisation) {
        organisationId =
          activeOrgId ||
          String((activeDealer?.organisations ?? [])[0]?.id ?? "").trim();
        if (organisationId && organisationId !== activeOrgId) setActiveOrgId(organisationId);
      }
      if (!activeDealerId || !organisationId) {
        setLastAction(
          hierarchyVisibility.showOrganisation
            ? `Select a ${hierarchyUiLabels.organisation.singular.toLowerCase()} to add a database.`
            : "Select a dealer that already has an organisation (Admin creates organisations)."
        );
        return;
      }
      const res = await addHierarchyDatabase(organisationId, name);
      await applyHierarchyOrFallback(
        res,
        () => {},
        `Added database ${name}`,
        {
          allowLocalFallback: false,
          failureMsg: `Failed to add database ${name}. Check connection and try again.`
        }
      );
      return;
    }

    if (scope === "site") {
      if (!activeDealerId || !activeOrgId || !activeDbId) { setLastAction("Select a database to add a site."); return; }
      const res = await addHierarchySite(activeDbId, name);
      await applyHierarchyOrFallback(
        res,
        () => {},
        `Added site ${name}`,
        {
          allowLocalFallback: false,
          failureMsg: `Failed to add site ${name}. Check connection and try again.`
        }
      );
      return;
    }

    if (scope === "asset") {
      // Handled in handleAdd — hierarchy cannot create telemetry assets.
      return;
    }
  };

  const handleAdd = (scope: "dealer" | "organisation" | "database" | "site" | "asset") => {
    if (!canCreateSegment(scope)) {
      const label =
        scope === "dealer"
          ? hierarchyUiLabels.dealer.plural
          : scope === "organisation"
            ? hierarchyUiLabels.organisation.plural
            : scope === "database"
              ? hierarchyUiLabels.database.plural
              : scope === "site"
                ? hierarchyUiLabels.site.plural
                : hierarchyUiLabels.asset.plural;
      setLastAction(`You do not have permission to create ${label.toLowerCase()}.`);
      return;
    }
    if (scope === "organisation" && !canCreateSegment("organisation")) {
      setLastAction("Dealers are managed by Admin or Own Support accounts.");
      return;
    }
    if (scope === "organisation" && !activeDealerId) {
      setLastAction(`Select an ${hierarchyUiLabels.dealer.singular.toLowerCase()} to add a ${hierarchyUiLabels.organisation.singular.toLowerCase()}.`);
      return;
    }
    if (scope === "database" && (!activeDealerId || !activeOrgId)) {
      setLastAction(`Select a ${hierarchyUiLabels.organisation.singular.toLowerCase()} to add a database.`);
      return;
    }
    if (scope === "site" && (!activeDealerId || !activeOrgId || !activeDbId)) {
      setLastAction("Select a database to add a site.");
      return;
    }
    if (scope === "asset" && (!activeDealerId || !activeOrgId || !activeDbId || !activeSiteId)) {
      setLastAction("Select a site to add an asset.");
      return;
    }
    if (scope === "asset") {
      // Hierarchy labels are not real asset records. Open Assets with the
      // current site context so the device is stored and visible on pages.
      const tenantId = [activeDealerId, activeOrgId, activeDbId].filter(Boolean).join(":");
      const siteName = String(activeSite?.name ?? "").trim();
      if (tenantId) {
        activateTenantContext(tenantId);
        localStorage.setItem("vivi.tenantId", tenantId);
      }
      if (siteName) localStorage.setItem("vivi.activeSite", siteName);
      localStorage.setItem("vivi.selectedScope", "site");
      if (activeSiteId) localStorage.setItem("vivi.activeSiteId", activeSiteId);
      setOrgModalOpen(false);
      window.dispatchEvent(new Event("vivi:orgchange"));
      window.dispatchEvent(new Event("vivi:contextchange"));
      navigate("/Track/fleet/assets");
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("vivi.ribbon.action", { detail: { key: "add" } }));
      }, 50);
      setLastAction("Add the asset on the Assets page (IMEI required for telemetry).");
      return;
    }
    setAddScope(scope);
    setAddValue("");
    setAddModalOpen(true);
  };

  return (
    <>
      {!hideRibbon && <div className="org-ribbon" onClick={() => setOrgModalOpen(true)}>
        <div className="org-ribbon-left">
          <span className="org-ribbon-label">{pageLabel}</span>
          <span className="org-ribbon-divider" />
          <span className="org-ribbon-path">{ribbonPath}</span>
        </div>
        <div className="org-ribbon-right" onClick={(event) => event.stopPropagation()}>
          {ribbonQuickActions.length > 0 && (
            <div className="assets-toolbar-right">
              {ribbonQuickActions.map((action) => (
                <div key={action.key} className="org-ribbon-quick-item">
                  <button
                    type="button"
                    className={action.variant === "pill" ? "assets-toolbar-pill" : "assets-toolbar-icon"}
                    aria-label={action.label}
                    data-tooltip={action.variant === "pill" ? undefined : action.label}
                    data-toast-ignore
                    data-nav={action.nav}
                    onClick={action.onClick}
                  >
                    <span className="ribbon-quick-icon" aria-hidden="true">{action.icon}</span>
                    {action.variant === "pill" && <span className="ribbon-report-label">{action.label}</span>}
                  </button>
                  {typeof action.count === "number" && (
                    <span className="assets-toolbar-count">{action.count}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {ribbonToolbar && (
            <>
              <span className="org-ribbon-divider" />
              <div className="org-ribbon-toolbar">
                {ribbonToolbar.search && (
                  <div className="assets-toolbar-search">
                    <input
                      type="search"
                      placeholder="Search"
                      aria-label="Search"
                      value={ribbonSearch}
                      onChange={(event) => {
                        const value = event.target.value;
                        setRibbonSearch(value);
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(new CustomEvent("vivi.ribbon.search", { detail: { value } }));
                        }
                      }}
                    />
                    <span className="assets-toolbar-search-icon" aria-hidden="true">🔍</span>
                  </div>
                )}
                {ribbonToolbar.actions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    className={action.variant === "add" ? "assets-toolbar-add" : "assets-toolbar-icon"}
                    aria-label={action.label}
                    data-tooltip={action.tooltip ?? action.label}
                    data-toast-ignore
                    data-nav={action.nav}
                    onClick={() => handleRibbonAction(action)}
                  >
                    {action.icon}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>}

      {orgModalOpen && (
        <div className="org-modal">
          <div className="org-modal-backdrop" onClick={() => setOrgModalOpen(false)} />
          <div className={`org-modal-card${orgModalExpanded ? " org-modal-card--expanded" : ""}`}>
            <header className="org-modal-header">
              <div className="org-modal-title">Select asset(s)</div>
              <div className="org-modal-toolbar">
                {orgModalBrowseMode === "asset" && (
                  <div className="org-search-by" role="radiogroup" aria-label="Search by">
                    <span className="org-search-by-label">Search by</span>
                    <label className="org-search-by-option">
                      <input
                        type="radio"
                        name="org-modal-search-by"
                        value="description"
                        checked={orgModalSearchBy === "description"}
                        onChange={() => setOrgModalSearchBy("description")}
                      />
                      <span>Description</span>
                    </label>
                    <label className="org-search-by-option">
                      <input
                        type="radio"
                        name="org-modal-search-by"
                        value="registration"
                        checked={orgModalSearchBy === "registration"}
                        onChange={() => setOrgModalSearchBy("registration")}
                      />
                      <span>Registration</span>
                    </label>
                  </div>
                )}
                <div className="org-browse-toggle" role="group" aria-label="Browse mode">
                  <button
                    type="button"
                    className={`org-browse-toggle-btn${orgModalBrowseMode === "group" ? " active" : ""}`}
                    data-tooltip="Search group"
                    title="Search group"
                    aria-label="Search group"
                    aria-pressed={orgModalBrowseMode === "group"}
                    onClick={() => setOrgModalBrowseMode("group")}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="5" r="2.2" fill="currentColor" />
                      <circle cx="6" cy="18" r="2.2" fill="currentColor" />
                      <circle cx="18" cy="18" r="2.2" fill="currentColor" />
                      <path d="M12 7.2v4.2M12 11.4 6.8 16M12 11.4l5.2 4.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`org-browse-toggle-btn${orgModalBrowseMode === "asset" ? " active" : ""}`}
                    data-tooltip="Search asset"
                    title="Search asset"
                    aria-label="Search asset"
                    aria-pressed={orgModalBrowseMode === "asset"}
                    onClick={() => setOrgModalBrowseMode("asset")}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M3 7h11v8H3zM14 9h4l3 3v3h-7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="7" cy="17" r="1.8" fill="currentColor" />
                      <circle cx="17" cy="17" r="1.8" fill="currentColor" />
                    </svg>
                  </button>
                </div>
                <div className="org-search-wrap">
                  <input
                    className="org-search"
                    placeholder="Search"
                    aria-label={orgModalBrowseMode === "group" ? "Search groups" : "Search assets"}
                    value={orgModalSearch}
                    onChange={(event) => setOrgModalSearch(event.target.value)}
                  />
                  <span className="org-search-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="m16.2 16.2 3.3 3.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </span>
                </div>
                <button
                  type="button"
                  className="org-expand"
                  aria-label={orgModalExpanded ? "Shrink selection window" : "Expand selection window"}
                  title={orgModalExpanded ? "Shrink" : "Expand"}
                  onClick={() => setOrgModalExpanded((current) => !current)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="m4 4 5 5M20 4l-5 5M4 20l5-5M20 20l-5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <button className="org-close" onClick={() => setOrgModalOpen(false)} aria-label="Close">
                ×
              </button>
            </header>

            <div className="org-modal-body">
              {hierarchyVisibility.showDealer && (
              <div className="org-column">
                <div className="org-column-title">
                  <span>{hierarchyUiLabels.dealer.plural}</span>
                  {canCreateSegment("dealer") && (
                  <button className="org-column-add" type="button" onClick={() => handleAdd("dealer")}
                  >
                    Add
                  </button>
                  )}
                </div>
                <div className="org-list">
                  {visibleDealerRows.length === 0 && (
                    <div className="org-empty">
                      {hierarchyLoading
                        ? "Loading organisations…"
                        : `No ${hierarchyUiLabels.dealer.plural.toLowerCase()} available.`}
                    </div>
                  )}
                  {visibleDealerRows.map((dealer) => (
                    <div key={dealer.id} className={`org-row ${dealer.id === activeDealerId ? "active" : ""}`}>
                      <button
                        className="org-row-main"
                        onClick={() => {
                          setActiveDealerId(dealer.id);
                          setActiveOrgId("");
                          setActiveDbId("");
                          setActiveSiteId("");
                          setActiveAsset("");
                          setActiveScope("dealer");
                        }}
                      >
                        <span className="org-icon" aria-hidden="true">
                          <svg className="org-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                            <path
                              d="m9.5 9.5 5-2-2 5-5 2 2-5z"
                              fill="currentColor"
                            />
                          </svg>
                        </span>
                        <span className="org-name">{dealer.name}</span>
                        <span className="org-caret">›</span>
                      </button>
                      <div className="org-row-actions">
                        <button
                          className="org-action-trigger"
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionRow(openActionRow === dealer.id ? null : dealer.id);
                          }}
                        >
                          ⋯
                        </button>
                        {openActionRow === dealer.id && (
                          <div className="org-action-menu">
                            {allowedRowActions("dealer").map((action) => (
                              <button
                                key={action}
                                className="org-action-item"
                                type="button"
                                onClick={() => handleAction(action, "dealer", dealer.id)}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {hierarchyVisibility.showOrganisation && (
              <div className="org-column">
                <div className="org-column-title">
                  <span>{hierarchyUiLabels.organisation.plural}</span>
                  {canCreateSegment("organisation") && (
                  <button className="org-column-add" type="button" onClick={() => handleAdd("organisation")}
                  >
                    Add
                  </button>
                  )}
                </div>
                <div className="org-list">
                  {visibleOrganisations.length === 0 && (
                    <div className="org-empty">
                      {hierarchyLoading
                        ? "Loading dealers…"
                        : `No ${hierarchyUiLabels.organisation.plural.toLowerCase()} available.`}
                    </div>
                  )}
                  {visibleOrganisations.map((org) => (
                    <div key={org.id} className={`org-row ${org.id === activeOrgId ? "active" : ""}`}>
                      <button
                        className="org-row-main"
                        onClick={() => {
                          const parentDealer = findDealerForOrganisation(org.id);
                          if (parentDealer?.id) setActiveDealerId(parentDealer.id);
                          setActiveOrgId(org.id);
                          setActiveDbId("");
                          setActiveSiteId("");
                          setActiveAsset("");
                          setActiveScope("org");
                        }}
                      >
                        <span className="org-icon" aria-hidden="true">
                          <svg className="org-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M4 21h16M7 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                            />
                          </svg>
                        </span>
                        <span className="org-name">{org.name}</span>
                        <span className="org-caret">›</span>
                      </button>
                      <div className="org-row-actions">
                        <button
                          className="org-action-trigger"
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionRow(openActionRow === org.id ? null : org.id);
                          }}
                        >
                          ⋯
                        </button>
                        {openActionRow === org.id && (
                          <div className="org-action-menu">
                            {allowedRowActions("org").map((action) => (
                              <button
                                key={action}
                                className="org-action-item"
                                type="button"
                                onClick={() => handleAction(action, "org", org.id)}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {hierarchyVisibility.showDatabase && (
              <div className="org-column">
                <div className="org-column-title">
                  <span>Databases</span>
                  {canCreateSegment("database") && (
                  <button className="org-column-add" type="button" onClick={() => handleAdd("database")}
                  >
                    Add
                  </button>
                  )}
                </div>
                <div className="org-list">
                  {visibleDatabases.length === 0 && (
                    <div className="org-empty">{hierarchyLoading ? "Loading databases…" : "No databases available."}</div>
                  )}
                  {visibleDatabases.map((db) => (
                    <div key={db.id} className={`org-row ${db.id === activeDbId ? "active" : ""}`}>
                      <button
                        className="org-row-main"
                        onClick={() => {
                          if (!hierarchyVisibility.showOrganisation) {
                            const parentOrg = findOrganisationForDatabase(db.id);
                            if (parentOrg?.id) setActiveOrgId(parentOrg.id);
                          }
                          setActiveDbId(db.id);
                          setActiveSiteId("");
                          setActiveAsset("");
                          setActiveScope("db");
                        }}
                      >
                        <span className="org-icon" aria-hidden="true">
                          <svg className="org-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                            <ellipse
                              cx="12"
                              cy="6"
                              rx="7"
                              ry="3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                            <path
                              d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                            <path
                              d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                          </svg>
                        </span>
                        <span className="org-name">{db.name}</span>
                        <span className="org-caret">›</span>
                      </button>
                      <div className="org-row-actions">
                        <button
                          className="org-action-trigger"
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionRow(openActionRow === db.id ? null : db.id);
                          }}
                        >
                          ⋯
                        </button>
                        {openActionRow === db.id && (
                          <div className="org-action-menu">
                            {allowedRowActions("db").map((action) => (
                              <button
                                key={action}
                                className="org-action-item"
                                type="button"
                                onClick={() => handleAction(action, "db", db.id)}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {hierarchyVisibility.showSite && (
              <div className="org-column">
                <div className="org-column-title">
                  <span>Sites</span>
                  {canCreateSegment("site") && (
                  <button className="org-column-add" type="button" onClick={() => handleAdd("site")}
                  >
                    Add
                  </button>
                  )}
                </div>
                <div className="org-list">
                  {visibleSites.length === 0 && (
                    <div className="org-empty">{hierarchyLoading ? "Loading sites…" : "No sites available."}</div>
                  )}
                  {visibleSiteGroups.map((group) => (
                    <Fragment key={group.family || "__ungrouped__"}>
                      {group.family ? <div className="org-family-header">{group.family}</div> : null}
                      {group.sites.map((site) => {
                        const parsed = parseViviSiteLabel(site.name);
                        const displayName =
                          parsed.siteFamily && parsed.site && parsed.site !== parsed.siteFamily
                            ? parsed.site
                            : site.name;
                        return (
                    <div key={site.id} className={`org-row ${site.id === activeSiteId ? "active" : ""}`}>
                      <button
                        className="org-row-main"
                        onClick={() => {
                          setActiveSiteId(site.id);
                          setActiveAsset("");
                          setActiveScope("site");
                          if (!hierarchyVisibility.showDatabase) {
                            for (const dealer of dealerRows) {
                              for (const org of dealer.organisations ?? []) {
                                for (const db of org.databases ?? []) {
                                  if ((db.sites ?? []).some((row) => row.id === site.id)) {
                                    setActiveDealerId(dealer.id);
                                    setActiveOrgId(org.id);
                                    setActiveDbId(db.id);
                                    return;
                                  }
                                }
                              }
                            }
                          }
                        }}
                      >
                        <span className="org-icon" aria-hidden="true">
                          <svg className="org-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M12 21s7-7.16 7-12a7 7 0 1 0-14 0c0 4.84 7 12 7 12z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                            <circle cx="12" cy="9" r="2.6" fill="currentColor" />
                          </svg>
                        </span>
                        <span className="org-name">
                          {displayName}
                          {parsed.siteFamily && parsed.site && parsed.site !== parsed.siteFamily ? (
                            <span className="org-name-family">{parsed.siteFamily}</span>
                          ) : null}
                        </span>
                        <span className="org-caret">›</span>
                      </button>
                      <div className="org-row-actions">
                        <button
                          className="org-action-trigger"
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionRow(openActionRow === site.id ? null : site.id);
                          }}
                        >
                          ⋯
                        </button>
                        {openActionRow === site.id && (
                          <div className="org-action-menu">
                            {allowedRowActions("site").map((action) => (
                              <button
                                key={action}
                                className="org-action-item"
                                type="button"
                                onClick={() => handleAction(action, "site", site.id)}
                              >
                                {action}
                              </button>
                            ))}
                            <button
                              className="org-action-item org-action-item-tz"
                              type="button"
                              onClick={() => handleAction("Set Timezone", "site", site.id)}
                            >
                              Set Timezone
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
              )}

              {hierarchyVisibility.showAsset && (
              <div className="org-column">
                <div className="org-column-title">
                  <span>Assets</span>
                  {canCreateSegment("asset") && (
                  <button className="org-column-add" type="button" onClick={() => handleAdd("asset")}
                  >
                    Add
                  </button>
                  )}
                </div>
                <div className="org-list">
                  {visibleAssets.length === 0 && (
                    <div className="org-empty">{hierarchyLoading || assetsLoading ? "Loading assets…" : "No assets available."}</div>
                  )}
                  {visibleAssets.map((asset) => (
                    <div key={asset} className={`org-row org-row-asset ${asset === activeAsset ? "active" : ""}`}>
                      <button
                        className="org-row-main"
                        onClick={() => {
                          setActiveAsset(asset);
                          setActiveScope("asset");
                          let location = findAssetLocation(asset);
                          if (!location) {
                            const record = orgModalAssetRecords.find((row) => row.label === asset);
                            const siteName = normalizeSiteName(record?.siteName);
                            if (siteName) {
                              for (const dealer of dealerRows) {
                                for (const org of dealer.organisations ?? []) {
                                  for (const db of org.databases ?? []) {
                                    const site = (db.sites ?? []).find(
                                      (item) => normalizeSiteName(item.name) === siteName
                                    );
                                    if (site) {
                                      location = {
                                        dealerId: dealer.id,
                                        orgId: org.id,
                                        dbId: db.id,
                                        siteId: site.id
                                      };
                                      break;
                                    }
                                  }
                                  if (location) break;
                                }
                                if (location) break;
                              }
                            }
                          }
                          if (location) {
                            setActiveDealerId(location.dealerId);
                            setActiveOrgId(location.orgId);
                            setActiveDbId(location.dbId);
                            setActiveSiteId(location.siteId);
                          }
                        }}
                      >
                        <span className="org-icon" aria-hidden="true">
                          <svg className="org-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M3 7h11v8H3zM14 9h4l3 3v3h-7"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <circle cx="7" cy="17" r="2" fill="currentColor" />
                            <circle cx="17" cy="17" r="2" fill="currentColor" />
                          </svg>
                        </span>
                        <span className="org-name">{asset}</span>
                      </button>
                      <div className="org-row-actions">
                        <button
                          className="org-action-trigger"
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionRow(openActionRow === asset ? null : asset);
                          }}
                        >
                          ⋯
                        </button>
                        {openActionRow === asset && (
                          <div className="org-action-menu">
                            {allowedRowActions("asset").map((action) => (
                              <button
                                key={action}
                                className="org-action-item"
                                type="button"
                                onClick={() => handleAction(action, "asset", asset)}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}
            </div>

            <footer className="org-modal-footer">
              <div className="org-footer-path">
                {draftPath}
                {lastAction && <span className="org-action-status">Last action: {lastAction}</span>}
              </div>
              <div className="org-actions">
                <button className="btn ghost" onClick={() => setOrgModalOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    const assetLabel = activeScope === "asset" ? activeAsset ?? "" : "";
                    const matchedRecord = orgModalAssetRecords.find((row) => row.label === assetLabel);
                    const registration = matchedRecord?.registration
                      || (assetLabel.includes(" - ")
                        ? assetLabel.split(" - ").slice(-1)[0]
                        : assetLabel);
                    const imei = matchedRecord?.imei ?? "";
                    const dbSites = collectSitesForRibbonScope(activeScope, activeDealer, activeOrg, activeDb);
                    const tenantId = [activeDealer?.id, activeOrg?.id, activeDb?.id]
                      .filter(Boolean)
                      .join(":");
                    const previousSite = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
                    const nextSite =
                      activeScope === "site" || activeScope === "asset"
                        ? String(activeSite?.name ?? "").trim()
                        : "";
                    localStorage.setItem("vivi.selectedScope", activeScope);
                    if (activeDealer?.id) localStorage.setItem("vivi.activeDealerId", activeDealer.id); else localStorage.removeItem("vivi.activeDealerId");
                    if (activeOrg?.id) localStorage.setItem("vivi.activeOrgId", activeOrg.id); else localStorage.removeItem("vivi.activeOrgId");
                    if (activeDb?.id) localStorage.setItem("vivi.activeDbId", activeDb.id); else localStorage.removeItem("vivi.activeDbId");
                    if (activeSite?.id) localStorage.setItem("vivi.activeSiteId", activeSite.id); else localStorage.removeItem("vivi.activeSiteId");
                    if (activeScope === "db" || activeScope === "site" || activeScope === "asset") {
                      activateTenantContext(tenantId);
                      localStorage.setItem("vivi.tenantId", tenantId);
                    } else {
                      activateTenantContext("");
                      localStorage.removeItem("vivi.tenantId");
                    }
                    if (activeScope === "site" || activeScope === "asset") localStorage.setItem("vivi.activeSite", activeSite?.name ?? ""); else localStorage.removeItem("vivi.activeSite");
                    activateSiteContext(previousSite, nextSite);

                    const clearAssetKeys = () => {
                      clearActiveAssetPrefs(tenantId);
                    };

                    if (activeScope === "asset" && assetLabel) {
                      writeActiveAssetPrefs(
                        {
                          asset: assetLabel,
                          registration: registration ?? "",
                          imei: imei || ""
                        },
                        tenantId
                      );
                    } else {
                      clearAssetKeys();
                      writeUserPref(USER_PREF_KEYS.activeAsset, "", tenantId);
                    }

                    const contextType = activeScope === "org"
                      ? "organisation"
                      : activeScope === "db"
                        ? "database"
                        : activeScope;
                    const contextName = activeScope === "asset"
                      ? assetLabel
                      : activeScope === "site"
                        ? String(activeSite?.name ?? "")
                        : activeScope === "db"
                          ? String(activeDb?.name ?? "")
                          : activeScope === "org"
                            ? String(activeOrg?.name ?? "")
                            : String(activeDealer?.name ?? "");
                    writeUserPref(USER_PREF_KEYS.contextType, contextType || "", tenantId);
                    writeUserPref(USER_PREF_KEYS.contextName, contextName || "", tenantId);

                    localStorage.setItem("vivi.activeDbSites", JSON.stringify(dbSites));
                    localStorage.setItem("vivi.selectedPath", draftPath);
                    setSelectedPath(draftPath);
                    setActiveAsset(activeScope === "asset" ? assetLabel : "");
                    skipHydrationRewriteRef.current = true;
                    window.dispatchEvent(new Event("vivi:orgchange"));
                    window.dispatchEvent(new Event("vivi:contextchange"));
                    setOrgModalOpen(false);
                  }}
                  disabled={!canSelect}
                >
                  Select
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {addModalOpen && (
        <div className="org-modal" role="dialog" aria-modal="true">
          <div className="org-modal-backdrop" onClick={() => setAddModalOpen(false)} />
          <div className="org-modal-card org-modal-card-compact">
            <header className="org-modal-header">
              <div>
                <div className="util-eyebrow">Add new {addScopeLabels[addScope]}</div>
                <div className="org-modal-path">Provide details to save</div>
              </div>
              <button className="org-close" onClick={() => setAddModalOpen(false)} aria-label="Close">
                ×
              </button>
            </header>

            <form
              className="org-add-form"
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = addValue.trim();
                if (!trimmed) {
                  setLastAction("Enter a name to save.");
                  return;
                }
                addEntity(addScope, trimmed);
                setAddModalOpen(false);
              }}
            >
              <label className="org-field">
                <span className="org-field-label">{addScopeLabels[addScope]} name</span>
                <input
                  className="org-input"
                  value={addValue}
                  onChange={(event) => setAddValue(event.target.value)}
                  placeholder={`Enter ${addScopeLabels[addScope].toLowerCase()} name`}
                  autoFocus
                />
              </label>
              <div className="org-modal-footer org-modal-footer-compact">
                <div className="org-footer-path">
                  {lastAction && <span className="org-action-status">Last action: {lastAction}</span>}
                </div>
                <div className="org-actions">
                  <button className="btn ghost" type="button" onClick={() => setAddModalOpen(false)}>
                    Cancel
                  </button>
                  <button className="btn primary" type="submit">
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {renameModalOpen && (
        <div className="org-modal" role="dialog" aria-modal="true" aria-label={`Rename ${renameLabel}`}>
          <div className="org-modal-backdrop" onClick={() => closeRenameModal(null)} />
          <div className="org-modal-card org-modal-card-compact">
            <header className="org-modal-header">
              <div>
                <div className="util-eyebrow">Rename {renameLabel}</div>
                <div className="org-modal-path">Use a clear and unique name for this level.</div>
              </div>
              <button className="org-close" onClick={() => closeRenameModal(null)} aria-label="Close">
                ×
              </button>
            </header>

            <form
              className="org-add-form"
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = renameValue.trim();
                if (!trimmed) {
                  setLastAction("Enter a name to save.");
                  return;
                }
                closeRenameModal(trimmed);
              }}
            >
              <label className="org-field">
                <span className="org-field-label">{renameLabel} name</span>
                <input
                  className="org-input"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  placeholder={`Enter ${renameLabel} name`}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeRenameModal(null);
                    }
                  }}
                />
              </label>
              <div className="org-modal-footer org-modal-footer-compact">
                <div className="org-footer-path">
                  {lastAction && <span className="org-action-status">Last action: {lastAction}</span>}
                </div>
                <div className="org-actions">
                  <button className="btn ghost" type="button" onClick={() => closeRenameModal(null)}>
                    Cancel
                  </button>
                  <button className="btn primary" type="submit">
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {siteTimeZoneModalOpen && (
        <div className="org-assign-modal" role="dialog" aria-modal="true" aria-label="Set site timezone">
          <div className="org-assign-backdrop" onClick={closeSiteTimeZoneModal} />
          <div className="org-assign-card">
            <div className="org-assign-header">
              <div>
                <div className="org-assign-title">Set site time zone</div>
                <div className="org-assign-subtitle">Site: {siteTimeZoneTargetName}</div>
              </div>
              <button type="button" className="org-assign-close" onClick={closeSiteTimeZoneModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="org-assign-body">
              <div className="org-assign-field">
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#0f172a", fontSize: "0.92rem" }}>Time zone</label>
                <input
                  type="text"
                  placeholder="Search cities or countries..."
                  value={siteTimeZoneSearch}
                  onChange={(e) => setSiteTimeZoneSearch(e.target.value)}
                  onFocus={() => setShowTimeZoneDropdown(true)}
                  style={{
                    width: "100%",
                    border: "1px solid rgba(15,23,42,0.16)",
                    borderRadius: 10,
                    minHeight: 38,
                    padding: "8px 10px",
                    fontWeight: 600,
                    color: "#0f172a",
                    background: "#fff",
                    fontSize: "0.92rem",
                    boxSizing: "border-box"
                  }}
                />
                {showTimeZoneDropdown && (
                  <div
                    style={{
                      position: "relative",
                      marginTop: 4,
                      border: "1px solid rgba(15,23,42,0.16)",
                      borderRadius: 8,
                      background: "#fff",
                      maxHeight: 280,
                      overflowY: "auto",
                      zIndex: 100,
                      boxShadow: "0 4px 8px rgba(0,0,0,0.08)"
                    }}
                  >
                    {filteredTimeZones.length > 0 ? (
                      filteredTimeZones.map((tz) => (
                        <div
                          key={tz.value}
                          onClick={() => {
                            setSiteTimeZoneValue(tz.value);
                            setShowTimeZoneDropdown(false);
                            setSiteTimeZoneSearch("");
                          }}
                          style={{
                            padding: "10px 12px",
                            borderBottom: "1px solid rgba(15,23,42,0.08)",
                            cursor: "pointer",
                            background: siteTimeZoneValue === tz.value ? "rgba(4,120,87,0.1)" : "transparent",
                            color: "#0f172a",
                            fontSize: "0.9rem",
                            fontWeight: siteTimeZoneValue === tz.value ? 700 : 500,
                            transition: "background 0.15s ease"
                          }}
                          onMouseEnter={(e) => {
                            if (siteTimeZoneValue !== tz.value) {
                              (e.currentTarget as HTMLDivElement).style.background = "rgba(15,23,42,0.05)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (siteTimeZoneValue !== tz.value) {
                              (e.currentTarget as HTMLDivElement).style.background = "transparent";
                            }
                          }}
                        >
                          <div>{toLaymanTimeZoneLabel(tz.value, tz.label)}</div>
                          <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: 2 }}>{tz.value}</div>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: "12px", color: "#64748b", fontSize: "0.9rem", textAlign: "center" }}>
                        No timezones found
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="org-assign-help">Selected time zone: <strong>{getTimeZoneChoiceLabel(siteTimeZoneValue)}</strong></div>
              <div className="org-assign-help">This timezone applies to date/time displays for assets in this site only.</div>
            </div>
            <div className="org-assign-actions">
              <button type="button" className="btn ghost" onClick={closeSiteTimeZoneModal} disabled={siteTimeZoneSaving}>Cancel</button>
              <button type="button" className="btn primary" onClick={() => void handleSiteTimeZoneSave()} disabled={siteTimeZoneSaving}>
                {siteTimeZoneSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignModalOpen && (
        <div className="org-assign-modal" role="dialog" aria-modal="true" aria-label="Assign user">
          <div className="org-assign-backdrop" onClick={closeAssignModal} />
          <div className="org-assign-card">
            <div className="org-assign-header">
              <div>
                <div className="org-assign-title">Assign user</div>
                <div className="org-assign-subtitle">
                  {assignScope ? `${assignScope.charAt(0).toUpperCase() + assignScope.slice(1)}: ${assignTargetLabel}` : assignTargetLabel}
                </div>
              </div>
              <button type="button" className="org-assign-close" onClick={closeAssignModal} aria-label="Close assign dialog">
                ×
              </button>
            </div>
            <div className="org-assign-body">
              <label className="org-assign-field">
                User name (optional)
                <input
                  type="text"
                  value={assignUserName}
                  onChange={(event) => setAssignUserName(event.target.value)}
                  placeholder="Type user name"
                  list="org-assign-user-list"
                />
                <datalist id="org-assign-user-list">
                  {knownUsers.map((user) => (
                    <option key={`${user.name}-${user.email}`} value={user.name} />
                  ))}
                </datalist>
              </label>
              <label className="org-assign-field">
                Email address
                <input
                  type="email"
                  value={assignUserEmail}
                  onChange={(event) => setAssignUserEmail(event.target.value)}
                  placeholder="name@example.com"
                  list="org-assign-email-list"
                />
                <datalist id="org-assign-email-list">
                  {knownUsers.map((user) => (
                    <option key={`${user.email}-${user.name}`} value={user.email} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="org-assign-actions">
              <button type="button" className="btn ghost" onClick={closeAssignModal} disabled={assignSaving}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleAssignSubmit} disabled={assignSaving}>
                {assignSaving ? "Saving..." : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {revokeModalOpen && (
        <div className="org-assign-modal" role="dialog" aria-modal="true" aria-label="Revoke access">
          <div className="org-assign-backdrop" onClick={closeRevokeModal} />
          <div className="org-assign-card">
            <div className="org-assign-header">
              <div>
                <div className="org-assign-title">Revoke access</div>
                <div className="org-assign-subtitle">
                  {revokeScope ? `${revokeScope.charAt(0).toUpperCase() + revokeScope.slice(1)}: ${revokeTargetLabel}` : revokeTargetLabel}
                </div>
              </div>
              <button type="button" className="org-assign-close" onClick={closeRevokeModal} aria-label="Close revoke dialog">
                ×
              </button>
            </div>
            <div className="org-assign-body">
              <label className="org-assign-field">
                User email to revoke access
                <input
                  type="email"
                  value={revokeUserEmail}
                  onChange={(event) => setRevokeUserEmail(event.target.value)}
                  placeholder="name@example.com"
                  list="org-revoke-user-list"
                  autoFocus
                />
                <datalist id="org-revoke-user-list">
                  {knownUsers.map((user) => (
                    <option key={`${user.name}-${user.email}`} value={user.email} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="org-assign-actions">
              <button type="button" className="btn ghost" onClick={closeRevokeModal} disabled={revokeSaving}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleRevokeSubmit} disabled={revokeSaving} style={{ background: "#800000", borderColor: "#800000" }}>
                {revokeSaving ? "Revoking..." : "Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

export default OrgRibbon;
