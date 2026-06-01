import type { OrgDatabase, OrgDealer, OrgOrganisation, OrgSite } from "../types/org";
import { buildTenantId } from "../types/org";

export type UserScopes = {
  dealerIds: string[];
  orgIds: string[];
  databaseIds: string[];
  siteIds: string[];
};

export type PagePermission = {
  pagePath: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type AccessProfile = {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  allowAll: boolean;
  scopes: UserScopes;
  roleIds: string[];
  pagePermissions: PagePermission[];
  allowedPagePaths: string[];
  denyByDefault: boolean;
};

export const SESSION_USER_KEY = "vivi.session.userId";

export function getSessionUserId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(SESSION_USER_KEY)?.trim() ?? "";
}

export function setSessionUserId(userId: string) {
  if (typeof window === "undefined") return;
  if (userId) window.localStorage.setItem(SESSION_USER_KEY, userId);
  else window.localStorage.removeItem(SESSION_USER_KEY);
  window.dispatchEvent(new Event("vivi:sessionchange"));
}

export function canViewPath(profile: AccessProfile | null, path: string): boolean {
  if (!profile) return false;
  if (profile.allowAll) return true;
  if (path === "/" || path === "/access-denied") return true;
  if (!profile.denyByDefault) return true;
  if (!profile.allowedPagePaths.length) return false;
  return profile.allowedPagePaths.some(
    (allowed) => path === allowed || path.startsWith(`${allowed}/`)
  );
}

export function canAccessTenant(profile: AccessProfile | null, tenantId: string): boolean {
  if (!profile) return false;
  if (profile.allowAll) return true;
  const parts = tenantId.split(":").filter(Boolean);
  if (!parts.length) return false;
  const [dealerId, orgId, dbId, siteId] = parts;
  const { scopes } = profile;
  if (siteId && scopes.siteIds.includes(siteId)) return true;
  if (dbId && scopes.databaseIds.includes(dbId)) return true;
  if (orgId && scopes.orgIds.includes(orgId)) return true;
  if (dealerId && scopes.dealerIds.includes(dealerId)) return true;
  return false;
}

function siteAllowed(site: OrgSite, scopes: UserScopes, allowAll: boolean, inherited: boolean) {
  if (allowAll) return true;
  if (inherited) return true;
  if (scopes.siteIds.includes(site.id)) return true;
  return false;
}

function dbAllowed(
  db: OrgDatabase,
  scopes: UserScopes,
  allowAll: boolean,
  inherited: boolean
): OrgDatabase | null {
  if (allowAll) return db;
  const dbInherited = inherited || scopes.databaseIds.includes(db.id);
  const sites = db.sites
    .map((site) => {
      if (!siteAllowed(site, scopes, allowAll, dbInherited)) return null;
      return site;
    })
    .filter(Boolean) as OrgSite[];
  if (dbInherited || sites.length) {
    return { ...db, sites: dbInherited ? db.sites : sites };
  }
  return null;
}

function orgAllowed(
  org: OrgOrganisation,
  scopes: UserScopes,
  allowAll: boolean,
  inherited: boolean
): OrgOrganisation | null {
  if (allowAll) return org;
  const orgInherited = inherited || scopes.orgIds.includes(org.id);
  const databases = org.databases
    .map((db) => dbAllowed(db, scopes, allowAll, orgInherited))
    .filter(Boolean) as OrgDatabase[];
  if (orgInherited || databases.length) {
    return { ...org, databases: orgInherited ? org.databases : databases };
  }
  return null;
}

export function filterDealersByScope(dealers: OrgDealer[], profile: AccessProfile | null): OrgDealer[] {
  if (!profile) return [];
  if (profile.allowAll) return dealers;
  const { scopes } = profile;
  return dealers
    .map((dealer) => {
      const dealerInherited = scopes.dealerIds.includes(dealer.id);
      const organisations = dealer.organisations
        .map((org) => orgAllowed(org, scopes, false, dealerInherited))
        .filter(Boolean) as OrgOrganisation[];
      if (dealerInherited || organisations.length) {
        return {
          ...dealer,
          organisations: dealerInherited ? dealer.organisations : organisations
        };
      }
      return null;
    })
    .filter(Boolean) as OrgDealer[];
}

export function tenantFromSelection(parts: {
  dealerId?: string;
  orgId?: string;
  dbId?: string;
  siteId?: string;
}) {
  return buildTenantId(parts);
}
