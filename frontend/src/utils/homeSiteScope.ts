import { siteScopesMatch } from "./scopeIsolation";
import {
  assetSiteMatchesHierarchySite,
  normalizeSelectionText,
  recoverActiveSiteName,
  readStoredSelectionScope,
  resolveAssetSiteName
} from "./selectionScope";

export type HomeSiteScope = {
  scopedSites: string[];
  siteLabel: string;
  ready: boolean;
};

const readAllowedSiteNames = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("vivi.auth.principal");
    if (!raw) return [];
    const cached = JSON.parse(raw) as {
      principal?: { siteNames?: unknown; siteAssignments?: unknown };
      siteNames?: unknown;
      siteAssignments?: unknown;
    };
    const principal = cached?.principal ?? cached;
    if (Array.isArray(principal?.siteNames)) {
      return principal.siteNames.map((value) => String(value ?? "").trim()).filter(Boolean);
    }
    if (Array.isArray(principal?.siteAssignments)) {
      return principal.siteAssignments
        .map((row: unknown) => String((row as { siteName?: unknown })?.siteName ?? "").trim())
        .filter(Boolean);
    }
  } catch {
    // ignore
  }
  return [];
};

const siteAllowedForPrincipal = (site: string, allowed: string[]): boolean => {
  if (!site) return false;
  if (!allowed.length) return true;
  return allowed.some((name) => siteScopesMatch(name, site));
};

/** Home dashboard is site-scoped only — never aggregate at dealer/org without sites. */
export const readHomeSiteScope = (): HomeSiteScope => {
  const selection = readStoredSelectionScope();
  const allowed = readAllowedSiteNames();
  let activeSite = recoverActiveSiteName();
  if (activeSite && !siteAllowedForPrincipal(activeSite, allowed)) {
    activeSite = allowed[0] || "";
  }

  if (selection.scope === "site" || selection.scope === "asset") {
    const sites = activeSite ? [activeSite] : [];
    return { scopedSites: sites, siteLabel: activeSite, ready: sites.length > 0 };
  }

  if (selection.scope === "db" && selection.activeDbSites.length > 0) {
    const scopedSites = selection.activeDbSites.filter((site) => siteAllowedForPrincipal(site, allowed));
    const sites = scopedSites.length ? scopedSites : activeSite ? [activeSite] : [];
    return {
      scopedSites: sites,
      siteLabel: activeSite || sites.join(" / "),
      ready: sites.length > 0
    };
  }

  if (selection.scope === "db" && activeSite) {
    return { scopedSites: [activeSite], siteLabel: activeSite, ready: true };
  }

  return { scopedSites: [], siteLabel: "", ready: false };
};

/**
 * Keep only assets on the sites the Home dashboard is showing. The shared asset
 * loader filters by the ribbon selection; this also drops sites the signed-in
 * user is not assigned to, so the "site" label and the totals cover the same fleet.
 */
export const filterAssetsToHomeSites = <T extends Record<string, unknown>>(assets: T[], scopedSites: string[]): T[] => {
  if (!scopedSites.length) return [];
  return assets.filter((asset) => {
    const site = resolveAssetSiteName(asset);
    if (!site) return false;
    return scopedSites.some(
      (allowed) =>
        assetSiteMatchesHierarchySite(site, allowed) ||
        siteScopesMatch(site, allowed) ||
        normalizeSelectionText(site) === normalizeSelectionText(allowed)
    );
  });
};
