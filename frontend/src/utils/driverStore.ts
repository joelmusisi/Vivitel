import { siteScopeToken, siteScopesMatch } from "./scopeIsolation";
import { readStoredSelectionScope } from "./selectionScope";
import { readActiveSiteName, readActiveTenantId } from "./tenantContext";

export const DRIVERS_KV_BASE = "fleet:drivers";

export type SharedDriverRecord = {
  id: string;
  name: string;
  site: string;
  driverId?: string;
  extendedDriverId?: string;
  employeeNumber?: string;
  mobileNumber?: string;
  country?: string;
  email?: string;
  lastTrip?: string;
  timeSinceLastTrip?: string;
  /** GPS IoT DriverType: ibutton | RFID | NONE | Beacon */
  driverType?: string;
  licenceNo?: string;
  licenseExpiryDate?: string;
  driverDob?: string;
  timeZone?: string;
  autoCreated?: boolean;
  remindersStatus?: "due-soon" | "overdue" | "none";
  updatedAt?: string;
  [key: string]: unknown;
};

const driversCacheKey = (tenantId = readActiveTenantId()) =>
  tenantId ? `vivi.drivers:${tenantId}` : "vivi.drivers";

const text = (value: unknown) => String(value ?? "").trim();

export function driverIdentityKey(row: { id?: unknown; driverId?: unknown; name?: unknown; site?: unknown }) {
  const site = siteScopeToken(text(row.site));
  const name = text(row.name).toLowerCase();
  if (name) return `name:${site || "_"}::${name}`;
  const id = text(row.id);
  if (id) return `id:${id}`;
  return text(row.driverId) ? `driverId:${text(row.driverId)}` : "";
}

function filledCount(row: SharedDriverRecord) {
  return [
    row.name,
    row.email,
    row.mobileNumber,
    row.employeeNumber,
    row.driverId,
    row.extendedDriverId,
    row.country
  ].filter((value) => text(value)).length;
}

export function normalizeDriverRecord(row: unknown, fallbackSite = ""): SharedDriverRecord | null {
  if (typeof row === "string") {
    const name = text(row);
    const site = text(fallbackSite);
    if (!name) return null;
    const id = name && site ? `drv-${siteScopeToken(site)}-${siteScopeToken(name)}` : `drv-${siteScopeToken(name)}`;
    return { id, name, site };
  }
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const name = text(record.name ?? record.driverName ?? record.fullName);
  const site = text(record.site) || text(fallbackSite);
  const id =
    text(record.id) ||
    text(record.driverId) ||
    (name ? `drv-${siteScopeToken(site || "none")}-${siteScopeToken(name)}` : "");
  if (!name || !id) return null;
  return {
    ...record,
    id,
    name,
    site,
    driverId: text(record.driverId),
    extendedDriverId: text(record.extendedDriverId),
    employeeNumber: text(record.employeeNumber),
    mobileNumber: text(record.mobileNumber ?? record.mobile ?? record.phone),
    country: text(record.country),
    email: text(record.email),
    lastTrip: text(record.lastTrip),
    timeSinceLastTrip: text(record.timeSinceLastTrip),
    driverType: text(record.driverType ?? record.DriverType) || undefined,
    licenceNo: text(record.licenceNo ?? record.LicenceNo) || undefined,
    licenseExpiryDate: text(record.licenseExpiryDate ?? record.license_expiry_date) || undefined,
    driverDob: text(record.driverDob ?? record.DriverDOB) || undefined,
    timeZone: text(record.timeZone ?? record.TimeZone) || undefined,
    updatedAt: text(record.updatedAt) || undefined
  };
}

export function mergeDriverRecords(...groups: Array<unknown[] | null | undefined>): SharedDriverRecord[] {
  const byKey = new Map<string, SharedDriverRecord>();
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const raw of group) {
      const row = normalizeDriverRecord(raw);
      if (!row) continue;
      const key = driverIdentityKey(row);
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing || filledCount(row) >= filledCount(existing)) {
        byKey.set(key, existing ? { ...existing, ...row, id: existing.id || row.id } : row);
      }
    }
  }
  return Array.from(byKey.values());
}

export type HierarchyDriverScope = {
  tenants: string[];
  sites: string[];
  siteTenant: Record<string, string>;
};

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = text(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function readCachedDealerHierarchy(): Array<{
  id?: string;
  organisations?: Array<{
    id?: string;
    databases?: Array<{
      id?: string;
      sites?: Array<{ name?: string }>;
    }>;
  }>;
}> {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem("vivi.org.dealers") ?? "");
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.dealers)) return parsed.dealers;
  } catch {
    // ignore
  }
  return [];
}

function databaseTenantId(dealerId: string, orgId: string, dbId: string) {
  if (!dealerId || !orgId || !dbId) return "";
  return `${dealerId}:${orgId}:${dbId}`;
}

/** Databases and sites under the current org-ribbon selection. */
export function readHierarchyDriverScope(): HierarchyDriverScope {
  const selection = readStoredSelectionScope();
  const tenants: string[] = [];
  const sites: string[] = [];
  const siteTenant: Record<string, string> = {};
  const addDb = (dealerId: string, orgId: string, db: { id?: string; sites?: Array<{ name?: string }> } | undefined) => {
    const tenant = databaseTenantId(dealerId, orgId, text(db?.id));
    if (tenant) tenants.push(tenant);
    for (const site of db?.sites ?? []) {
      const name = text(site?.name);
      if (!name) continue;
      sites.push(name);
      const key = name.toLowerCase();
      if (!siteTenant[key] && tenant) siteTenant[key] = tenant;
    }
  };

  const dealers = readCachedDealerHierarchy();
  const dealer =
    dealers.find((row) => text(row.id) === selection.activeDealerId) ??
    (dealers.length === 1 ? dealers[0] : undefined);
  if (!dealer) {
    return { tenants: uniqueNames(tenants), sites: uniqueNames(sites), siteTenant };
  }
  const dealerId = text(dealer.id);
  const organisations = dealer.organisations ?? [];
  if (selection.scope === "dealer") {
    for (const org of organisations) {
      for (const db of org.databases ?? []) addDb(dealerId, text(org.id), db);
    }
    return { tenants: uniqueNames(tenants), sites: uniqueNames(sites), siteTenant };
  }

  const org =
    organisations.find((row) => text(row.id) === selection.activeOrgId) ??
    (organisations.length === 1 ? organisations[0] : undefined);
  if (!org) return { tenants: uniqueNames(tenants), sites: uniqueNames(sites), siteTenant };

  const orgId = text(org.id);
  const databases = org.databases ?? [];
  if (selection.scope === "org") {
    for (const db of databases) addDb(dealerId, orgId, db);
    return { tenants: uniqueNames(tenants), sites: uniqueNames(sites), siteTenant };
  }

  const db =
    databases.find((row) => text(row.id) === selection.activeDbId) ??
    (databases.length === 1 ? databases[0] : undefined);
  if (db) addDb(dealerId, orgId, db);
  return { tenants: uniqueNames(tenants), sites: uniqueNames(sites), siteTenant };
}

export function tenantIdForDriverSite(siteName: string): string {
  const scope = readHierarchyDriverScope();
  const mapped = scope.siteTenant[text(siteName).toLowerCase()];
  if (mapped) return mapped;
  return scope.tenants[0] ?? "";
}

export function driverSitesToLoad(extraSites: string[] = []): string[] {
  const selection = readStoredSelectionScope();
  const hierarchy = readHierarchyDriverScope();
  const activeSite = text(readActiveSiteName()) || text(selection.activeSite);
  if ((selection.scope === "site" || selection.scope === "asset") && activeSite) {
    return uniqueNames([activeSite, ...extraSites]);
  }
  const sites = new Set<string>();
  if (activeSite) sites.add(activeSite);
  for (const site of [...(selection.activeDbSites ?? []), ...hierarchy.sites, ...extraSites]) {
    const name = text(site);
    if (name) sites.add(name);
  }
  return Array.from(sites);
}

export function driverTenantsToLoad(extraTenants: string[] = []): string[] {
  const hierarchy = readHierarchyDriverScope();
  return uniqueNames([...hierarchy.tenants, ...extraTenants]);
}

function readJsonArray(key: string): unknown[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

/** Browser-only leftovers (same class of bug as local hierarchy databases). */
export function readLocalUnsyncedDrivers(): SharedDriverRecord[] {
  const hierarchy = readHierarchyDriverScope();
  const fallbackSite = text(readActiveSiteName()) || hierarchy.sites[0] || "";
  const tenantId = readActiveTenantId();
  const hints: unknown[] = [
    ...readJsonArray(driversCacheKey(tenantId)),
    ...readJsonArray("vivi.drivers"),
    ...readJsonArray("vivi.contextOptions.driver")
  ];
  return mergeDriverRecords(
    hints.map((item) => {
      if (typeof item === "string") return normalizeDriverRecord(item, fallbackSite);
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name = text(row.name ?? row.driverName);
      if (!name) return null;
      const site = text(row.site) || fallbackSite;
      return normalizeDriverRecord({ ...row, name, site }, fallbackSite);
    })
  );
}

export function readCachedDrivers(): SharedDriverRecord[] {
  return mergeDriverRecords(readJsonArray(driversCacheKey()));
}

export function writeCachedDrivers(rows: SharedDriverRecord[]) {
  if (typeof window === "undefined") return;
  const tenantId = readActiveTenantId();
  if (!tenantId) return;
  try {
    window.localStorage.setItem(driversCacheKey(tenantId), JSON.stringify(rows));
  } catch {
    // ignore quota
  }
}

export function driversMissingFrom(source: SharedDriverRecord[], reference: SharedDriverRecord[]) {
  const keys = new Set(reference.map((row) => driverIdentityKey(row)).filter(Boolean));
  return source.filter((row) => {
    const key = driverIdentityKey(row);
    return Boolean(key) && !keys.has(key);
  });
}

export function groupDriversBySite(rows: SharedDriverRecord[]) {
  const groups = new Map<string, SharedDriverRecord[]>();
  for (const row of rows) {
    const site = text(row.site);
    if (!site) continue;
    const list = groups.get(site) ?? [];
    list.push(row);
    groups.set(site, list);
  }
  return groups;
}

export function namedDriverStub(name: string, site: string): SharedDriverRecord | null {
  const driverName = text(name);
  const siteName = text(site);
  if (!driverName || !siteName) return null;
  const token = `${siteScopeToken(siteName)}-${siteScopeToken(driverName)}`;
  return {
    id: `drv-${token}`,
    name: driverName,
    site: siteName,
    driverId: "",
    extendedDriverId: "",
    employeeNumber: "",
    mobileNumber: "",
    country: "",
    email: "",
    lastTrip: "",
    timeSinceLastTrip: "",
    autoCreated: true,
    remindersStatus: "none",
    updatedAt: new Date().toISOString()
  };
}

export function driverNamesFromAssets(assets: unknown[]): SharedDriverRecord[] {
  const fallbackSite = text(readActiveSiteName()) || readHierarchyDriverScope().sites[0] || "";
  return mergeDriverRecords(
    (Array.isArray(assets) ? assets : []).map((asset) => {
      if (!asset || typeof asset !== "object") return null;
      const row = asset as Record<string, unknown>;
      const name = text(row.defaultDriver ?? row.driverName ?? row.driver ?? row.assignedDriver);
      const site = text(row.site) || fallbackSite;
      return namedDriverStub(name, site);
    })
  );
}

export function sameDriverSite(left: string, right: string) {
  return siteScopesMatch(left, right);
}
