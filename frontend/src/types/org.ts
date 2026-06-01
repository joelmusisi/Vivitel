export type OrgSite = {
  id: string;
  name: string;
  assets: string[];
};

export type OrgDatabase = {
  id: string;
  name: string;
  sites: OrgSite[];
};

export type OrgOrganisation = {
  id: string;
  name: string;
  databases: OrgDatabase[];
};

export type OrgDealer = {
  id: string;
  name: string;
  organisations: OrgOrganisation[];
};

export const ORG_STORAGE_KEY = "vivi.org.dealers";

export function loadOrgDealers(): OrgDealer[] | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ORG_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OrgDealer[]) : null;
  } catch {
    return null;
  }
}

export function saveOrgDealers(dealers: OrgDealer[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ORG_STORAGE_KEY, JSON.stringify(dealers));
}

export function buildTenantId(parts: {
  dealerId?: string;
  orgId?: string;
  dbId?: string;
  siteId?: string;
}) {
  return [parts.dealerId, parts.orgId, parts.dbId, parts.siteId].filter(Boolean).join(":") || "demo-tenant";
}
