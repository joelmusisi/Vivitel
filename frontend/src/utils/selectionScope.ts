import { siteScopesMatch } from "./scopeIsolation";
import { readUserPref, USER_PREF_KEYS } from "./userAppPrefs";
import { parseViviSiteLabel } from "./viviCategories";

export type StoredSelectionScope = {
  scope: "dealer" | "org" | "db" | "site" | "asset" | "";
  activeDealerId: string;
  activeOrgId: string;
  activeDbId: string;
  activeSiteId: string;
  activeSite: string;
  activeDbSites: string[];
  activeDbSiteSet: Set<string>;
};

export const normalizeSelectionText = (value: unknown) => String(value ?? "").trim().toLowerCase();

/** Site label from the org-ribbon path ("Dealer / Org / DB / Site"). */
export const readSiteNameFromSelectedPath = (): string => {
  if (typeof window === "undefined") return "";
  const parts = String(window.localStorage.getItem("vivi.selectedPath") ?? "")
    .split("/")
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts[3] ?? "";
};

/**
 * Resolve the active site label even if `vivi.activeSite` was briefly cleared
 * during a site/database switch. Prefers the explicit site key, then the path.
 */
export const recoverActiveSiteName = (): string => {
  if (typeof window === "undefined") return "";
  return (
    String(window.localStorage.getItem("vivi.activeSite") ?? "").trim() ||
    readSiteNameFromSelectedPath()
  );
};

export const readStoredSelectionScope = (): StoredSelectionScope => {
  if (typeof window === "undefined") {
    return {
      scope: "",
      activeDealerId: "",
      activeOrgId: "",
      activeDbId: "",
      activeSiteId: "",
      activeSite: "",
      activeDbSites: [],
      activeDbSiteSet: new Set<string>(),
    };
  }

  const rawScope = String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim().toLowerCase();
  const scope = rawScope === "dealer" || rawScope === "org" || rawScope === "db" || rawScope === "site" || rawScope === "asset"
    ? rawScope
    : "";

  let activeDbSites: string[] = [];
  try {
    const raw = String(window.localStorage.getItem("vivi.activeDbSites") ?? "").trim();
    const parsed = raw ? JSON.parse(raw) : [];
    activeDbSites = Array.isArray(parsed)
      ? parsed.map((site) => String(site ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    activeDbSites = [];
  }

  const activeSite = recoverActiveSiteName();

  return {
    scope,
    activeDealerId: String(window.localStorage.getItem("vivi.activeDealerId") ?? "").trim(),
    activeOrgId: String(window.localStorage.getItem("vivi.activeOrgId") ?? "").trim(),
    activeDbId: String(window.localStorage.getItem("vivi.activeDbId") ?? "").trim(),
    activeSiteId: String(window.localStorage.getItem("vivi.activeSiteId") ?? "").trim(),
    activeSite: normalizeSelectionText(activeSite),
    activeDbSites,
    activeDbSiteSet: new Set(activeDbSites.map((site) => normalizeSelectionText(site)).filter(Boolean)),
  };
};

export type ScopeNaming = {
  scope: string;
  dealer: string;
  organisation: string;
  database: string;
  site: string;
  /** Best single human label for the current selection (site → db → leaf). */
  label: string;
};

/**
 * Resolve the correctly-cased, human-readable names for the active selection.
 * Reads the breadcrumb path written by the org ribbon ("Dealer / Org / DB / Site")
 * plus the active site name, so the database and site are always labelled right.
 */
export const readScopeNaming = (): ScopeNaming => {
  const empty: ScopeNaming = {
    scope: "",
    dealer: "",
    organisation: "",
    database: "",
    site: "",
    label: "All sites"
  };
  if (typeof window === "undefined") return empty;

  const read = (key: string) => String(window.localStorage.getItem(key) ?? "").trim();
  const scope = read("vivi.selectedScope").toLowerCase();
  const path = read("vivi.selectedPath");
  const segments = path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const dealer = segments[0] ?? "";
  const organisation = segments[1] ?? "";
  const database = segments[2] ?? "";
  // Use the explicit site name (correctly cased) rather than the normalized token.
  const site = read("vivi.activeSite") || (scope === "site" || scope === "asset" ? segments[3] ?? "" : "");

  const contextName = readUserPref(USER_PREF_KEYS.contextName);
  const label = site || database || contextName || segments[segments.length - 1] || "All sites";

  return { scope, dealer, organisation, database, site, label };
};

const siteMatchToken = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/**
 * True when an asset's stored site belongs on a hierarchy site.
 * Hierarchy labels are often "FAMILY/Leaf" while the asset stores just the leaf.
 */
export const assetSiteMatchesHierarchySite = (assetSite: unknown, hierarchySiteName: unknown): boolean => {
  const left = String(assetSite ?? "").trim();
  const right = String(hierarchySiteName ?? "").trim();
  if (!left || !right) return false;
  if (siteScopesMatch(left, right) || siteMatchToken(left) === siteMatchToken(right)) return true;
  const asset = parseViviSiteLabel(left);
  const hierarchy = parseViviSiteLabel(right);
  const assetFull = siteMatchToken(asset.siteFull);
  const hierarchyFull = siteMatchToken(hierarchy.siteFull);
  const assetLeaf = siteMatchToken(asset.site || asset.siteFull);
  const hierarchyLeaf = siteMatchToken(hierarchy.site || hierarchy.siteFull);
  if (assetFull && (assetFull === hierarchyFull || assetFull === hierarchyLeaf)) return true;
  if (hierarchyFull && hierarchyFull === assetLeaf) return true;
  if (!assetLeaf || assetLeaf !== hierarchyLeaf) return false;
  const assetFamily = siteMatchToken(asset.siteFamily);
  const hierarchyFamily = siteMatchToken(hierarchy.siteFamily);
  return !assetFamily || !hierarchyFamily || assetFamily === hierarchyFamily;
};

/** Site label stored on an asset. A blank site falls back to the tracker group name. */
export const resolveAssetSiteName = (asset: unknown): string => {
  if (typeof asset === "string") return asset.trim();
  if (!asset || typeof asset !== "object") return "";
  const row = asset as Record<string, unknown>;
  const direct = String(row.site ?? row.siteName ?? "").trim();
  if (direct) return direct;
  return String(row.group ?? row.groupName ?? "").trim();
};

export type SiteGroupDevice = {
  id?: unknown;
  uniqueId?: unknown;
  name?: unknown;
  groupId?: unknown;
};

/** IMEIs of tracker devices whose group name is this site. */
export const imeisForSiteGroup = (
  devices: SiteGroupDevice[],
  groups: Array<{ id?: unknown; name?: unknown }>,
  siteName: unknown
): string[] => {
  const site = String(siteName ?? "").trim();
  if (!site) return [];
  const matchingGroupIds = new Set<number>();
  for (const group of groups) {
    const id = Number(group?.id ?? 0);
    const name = String(group?.name ?? "").trim();
    if (!Number.isFinite(id) || id <= 0 || !name) continue;
    if (assetSiteMatchesHierarchySite(name, site)) matchingGroupIds.add(id);
  }
  return Array.from(
    new Set(
      devices
        .filter((device) => matchingGroupIds.has(Number(device?.groupId ?? 0)))
        .map((device) => String(device?.uniqueId ?? "").trim())
        .filter(Boolean)
    )
  );
};

/** Devices whose tracker group is this site and that are not already in the fleet list. */
export const missingDevicesForSite = (
  devices: SiteGroupDevice[],
  groups: Array<{ id?: unknown; name?: unknown }>,
  siteName: unknown,
  existingImeis: Iterable<string>
): Array<{ imei: string; name: string; site: string; traccarDeviceId?: number }> => {
  const site = String(siteName ?? "").trim();
  if (!site) return [];
  const groupNameById = new Map<number, string>();
  const matchingGroupIds = new Set<number>();
  for (const group of groups) {
    const id = Number(group?.id ?? 0);
    const name = String(group?.name ?? "").trim();
    if (!Number.isFinite(id) || id <= 0 || !name) continue;
    groupNameById.set(id, name);
    if (assetSiteMatchesHierarchySite(name, site)) matchingGroupIds.add(id);
  }
  const known = new Set(
    Array.from(existingImeis)
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  );
  const missing: Array<{ imei: string; name: string; site: string; traccarDeviceId?: number }> = [];
  for (const device of devices) {
    const groupId = Number(device?.groupId ?? 0);
    if (!matchingGroupIds.has(groupId)) continue;
    const imei = String(device?.uniqueId ?? "").trim();
    if (!imei || known.has(imei)) continue;
    known.add(imei);
    const name = String(device?.name ?? "").trim() || imei;
    const traccarDeviceId = Number(device?.id);
    missing.push({
      imei,
      name,
      site: groupNameById.get(groupId) || site,
      ...(Number.isFinite(traccarDeviceId) && traccarDeviceId > 0 ? { traccarDeviceId } : {})
    });
  }
  return missing;
};

/** Asset labels that belong on one hierarchy site. Blank sites and other sites stay out. */
export const assetLabelsForHierarchySite = (
  records: Array<{ label?: unknown; siteName?: unknown }>,
  hierarchySiteName: unknown
): string[] => {
  const siteName = String(hierarchySiteName ?? "").trim();
  if (!siteName) return [];
  return Array.from(
    new Set(
      records
        .filter((row) => assetSiteMatchesHierarchySite(row.siteName, siteName))
        .map((row) => String(row.label ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
};

export const matchesStoredSiteSelection = (site: unknown, selection: StoredSelectionScope): boolean => {
  const normalizedSite = normalizeSelectionText(site);
  if (selection.scope === "site" || selection.scope === "asset") {
    const activeSite = selection.activeSite || recoverActiveSiteName();
    // Empty active site during a ribbon switch must not open every site.
    if (!activeSite) return false;
    // Keep sites isolated: assets without a site do not appear under another site.
    if (!normalizedSite) return false;
    return (
      assetSiteMatchesHierarchySite(site, activeSite) ||
      siteScopesMatch(String(site ?? ""), activeSite) ||
      normalizedSite === normalizeSelectionText(activeSite)
    );
  }
  // Database / org / dealer ribbon selection: only sites listed for the active database.
  if (
    (selection.scope === "db" || selection.scope === "org" || selection.scope === "dealer")
    && selection.activeDbSiteSet.size > 0
  ) {
    if (!normalizedSite) return false;
    return [...selection.activeDbSiteSet].some(
      (allowed) =>
        assetSiteMatchesHierarchySite(site, allowed) ||
        siteScopesMatch(String(site ?? ""), allowed) ||
        normalizedSite === normalizeSelectionText(allowed)
    );
  }
  if (selection.activeSite) {
    if (!normalizedSite) return false;
    return (
      assetSiteMatchesHierarchySite(site, selection.activeSite) ||
      siteScopesMatch(String(site ?? ""), selection.activeSite) ||
      normalizedSite === normalizeSelectionText(selection.activeSite)
    );
  }
  return true;
};
