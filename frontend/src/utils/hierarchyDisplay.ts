import { isLegacyFlatTenantId } from "./regionHierarchy";

export type HierarchyDealerLike = {
  id: string;
  name: string;
  organisations?: Array<{
    id?: string;
    name?: string;
    databases?: Array<{
      id?: string;
      name?: string;
      sites?: Array<{ id?: string; name?: string; assets?: unknown[] }>;
    }>;
  }>;
};

type AssetLike = {
  site?: unknown;
  organisation?: unknown;
  dealer?: unknown;
  database?: unknown;
  assetDescription?: unknown;
  description?: unknown;
  registration?: unknown;
  name?: unknown;
  imei?: unknown;
  uniqueId?: unknown;
  assetId?: unknown;
  lastPosition?: unknown;
  lastSeen?: unknown;
  country?: unknown;
  assetType?: unknown;
  make?: unknown;
  tenantId?: unknown;
};

const text = (value: unknown) => String(value ?? "").trim();
const token = (value: unknown) => text(value).toLowerCase();

const HIERARCHY_UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const slugId = (prefix: string, value: string) => {
  const slug = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug ? `${prefix}-${slug}` : prefix;
};

const splitTenantParts = (tenantId: string) => {
  const parts = String(tenantId ?? "")
    .split(":")
    .map((part) => text(part))
    .filter(Boolean);
  if (parts.length < 3) return null;
  return { dealerId: parts[0], orgId: parts[1], dbId: parts[2], tenantId: parts.slice(0, 3).join(":") };
};

/** Live org-ribbon ids are UUID (or timestamp) based. Name slugs are recovery-only. */
export const isSyntheticHierarchyId = (id: string) => {
  const value = text(id);
  if (!value) return true;
  if (HIERARCHY_UUID_RE.test(value)) return false;
  if (/^(dealer|org|db|site)-\d{10,}$/i.test(value)) return false;
  return /^(org|dealer|db|site)-/i.test(value);
};

/** Live EAST AFRICA / AFRICA / TRANSFLEET / MMULU database on production D1. */
export const PUBLISHED_MMULU_TENANT_ID =
  "3bd6377d-36c6-40cb-a5ce-01feb806b2e5:b146a53b-4c96-4a77-a295-7a9c3c8536b9:7360f722-f18d-4797-bfed-4376f171878f";

export const PUBLISHED_MMULU_PATH = "EAST AFRICA / AFRICA / TRANSFLEET SERVICES / MMULU COMPANY";

export const publishedTenantIdForSite = (siteName: string, pathNames: string[] = []) => {
  const hay = [siteName, ...pathNames].map((part) => token(part)).join(" ");
  if (hay.includes("mmulu") || hay.includes("transfleet")) return PUBLISHED_MMULU_TENANT_ID;
  return "";
};

export const isSyntheticTenantId = (tenantId: string) => {
  const parts = String(tenantId ?? "")
    .split(":")
    .map((part) => text(part))
    .filter(Boolean);
  if (parts.length < 3) return false;
  return parts.some((part) => isSyntheticHierarchyId(part));
};

export const hierarchyUsesSyntheticIds = (rows: HierarchyDealerLike[] | null | undefined) => {
  for (const dealer of Array.isArray(rows) ? rows : []) {
    if (isSyntheticHierarchyId(String(dealer?.id ?? ""))) return true;
    for (const org of dealer.organisations ?? []) {
      if (isSyntheticHierarchyId(String(org?.id ?? ""))) return true;
      for (const db of org.databases ?? []) {
        if (isSyntheticHierarchyId(String(db?.id ?? ""))) return true;
      }
    }
  }
  return false;
};

/** True when GET /b2/hierarchy failed or was unreachable — not a real empty tree. */
export const isHierarchyUnavailable = (hierarchy: unknown) =>
  Boolean(
    hierarchy &&
      typeof hierarchy === "object" &&
      (hierarchy as { unavailable?: boolean }).unavailable
  );

export const countHierarchyDealerNodes = (rows: HierarchyDealerLike[] | null | undefined) => {
  let count = 0;
  for (const dealer of Array.isArray(rows) ? rows : []) {
    count += 1;
    for (const org of dealer.organisations ?? []) {
      count += 1;
      for (const db of org.databases ?? []) {
        count += 1 + (Array.isArray(db.sites) ? db.sites.length : 0);
      }
    }
  }
  return count;
};

export const shouldPersistHierarchyCache = (
  nextRows: HierarchyDealerLike[],
  existingRows: HierarchyDealerLike[]
) => {
  if (hierarchyUsesSyntheticIds(nextRows) && !hierarchyUsesSyntheticIds(existingRows)) return false;
  if (hierarchyUsesSyntheticIds(nextRows)) return false;
  if (countHierarchyDealerNodes(nextRows) > 0) return true;
  // Never replace a last-good tree with an empty write.
  return !(countHierarchyDealerNodes(existingRows) > 0);
};

/**
 * Prefer the live server tree for tenant ids. Recovered name-slug trees can have
 * more nodes but they point at the wrong D1 database and must not win.
 */
export const resolveHierarchyDisplayRows = <T extends HierarchyDealerLike>(input: {
  serverRows: T[];
  localRows: T[];
  serverUnavailable?: boolean;
}): T[] => {
  const serverRows = Array.isArray(input.serverRows) ? input.serverRows : [];
  const localRows = Array.isArray(input.localRows) ? input.localRows : [];
  const serverCount = countHierarchyDealerNodes(serverRows);
  const localCount = countHierarchyDealerNodes(localRows);
  const serverSynthetic = hierarchyUsesSyntheticIds(serverRows);
  const localSynthetic = hierarchyUsesSyntheticIds(localRows);
  if (serverCount > 0 && !serverSynthetic && localSynthetic) return serverRows;
  if (localCount > 0 && !localSynthetic && (serverSynthetic || input.serverUnavailable || localCount > serverCount)) {
    return localRows;
  }
  if (input.serverUnavailable) return localCount > 0 ? localRows : serverRows;
  if (serverCount > 0 && !serverSynthetic) return serverRows;
  if (localCount > 0) return localRows;
  return serverRows;
};

/** Accept both `{ dealers }` and `{ hierarchy: { dealers } }` payloads. */
export const dealersFromHierarchyPayload = (payload: unknown): unknown[] => {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const nested =
    root.hierarchy && typeof root.hierarchy === "object"
      ? (root.hierarchy as Record<string, unknown>)
      : null;
  const dealers = root.dealers ?? nested?.dealers;
  return Array.isArray(dealers) ? dealers : [];
};

export const discoverCachedTenantIds = (): string[] => {
  if (typeof window === "undefined") return [];
  const found = new Set<string>();
  const push = (value: unknown) => {
    const id = text(value);
    if (!id.includes(":")) return;
    if (isSyntheticTenantId(id)) return;
    found.add(id);
  };
  push(window.localStorage.getItem("vivi.tenantId"));
  push(window.localStorage.getItem("vivi.activeTenantId"));
  const dealerId = text(window.localStorage.getItem("vivi.activeDealerId"));
  const orgId = text(window.localStorage.getItem("vivi.activeOrgId"));
  const dbId = text(window.localStorage.getItem("vivi.activeDbId"));
  if (dealerId && orgId && dbId) push(`${dealerId}:${orgId}:${dbId}`);

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = text(window.localStorage.key(index));
      if (key.startsWith("vivi.assets:") && key.includes(":")) {
        push(key.slice("vivi.assets:".length));
      }
    }
  } catch {
    // ignore
  }
  return [...found];
};

const readJsonArray = (key: string): unknown[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const compactLabel = (value: unknown) => text(value).replace(/\s+/g, " ").trim();
const compactLabelKey = (value: unknown) => compactLabel(value).toLowerCase();
const compactLabelTight = (value: unknown) => compactLabelKey(value).replace(/\s+/g, "");

export const looksLikeImeiLabel = (value: unknown, imei = "") => {
  const raw = compactLabel(value);
  if (!raw) return true;
  const imeiKey = compactLabel(imei);
  if (imeiKey && raw === imeiKey) return true;
  return /^\d{10,17}$/.test(raw);
};

const descriptionIncludesRegistration = (description: string, registration: string) => {
  const desc = compactLabelKey(description);
  const reg = compactLabelKey(registration);
  if (!desc || !reg) return false;
  if (desc === reg) return true;
  if (desc.includes(reg)) return true;
  const descTight = compactLabelTight(description);
  const regTight = compactLabelTight(registration);
  return Boolean(descTight && regTight && descTight.includes(regTight));
};

const usablePlate = (value: unknown, imei: string) => {
  const raw = compactLabel(value);
  if (!raw || looksLikeImeiLabel(raw, imei)) return "";
  return raw;
};

/** Prefer plate-only registration values (UA 814EC), not Make+Plate. */
const plateOnlyLabel = (label: string, make: string, imei: string) => {
  const raw = compactLabel(label);
  if (!raw || looksLikeImeiLabel(raw, imei)) return "";
  if (make) {
    const withoutMake = compactLabel(
      raw.replace(new RegExp(`^${make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "")
    );
    if (withoutMake && withoutMake !== raw && !looksLikeImeiLabel(withoutMake, imei)) {
      return withoutMake;
    }
  }
  const match = raw.match(/^([A-Za-z][A-Za-z0-9\-]*)\s+((?:UA|UB|UG|UAA|UAB|UAC)\s*[0-9].*)$/i);
  if (match) {
    const rest = compactLabel(match[2]);
    if (rest && !looksLikeImeiLabel(rest, imei)) return rest;
  }
  return raw;
};

const displayMake = (make: string) => compactLabel(make).toUpperCase();

/**
 * Asset Description display: keep "SHACKMAN UA 814EC" (Make + plate).
 * Never use IMEI. Registration column stays plate-only separately.
 */
export const formatAssetDescription = (asset: AssetLike | Record<string, unknown> | null | undefined) => {
  if (!asset || typeof asset !== "object") return "";
  const row = asset as Record<string, unknown>;
  const imei = compactLabel(row.imei ?? row.uniqueId);
  const make = compactLabel(row.make);
  const registrationRaw = usablePlate(row.registration ?? row.regNumber ?? row.reg, imei);
  const registration = plateOnlyLabel(registrationRaw, make, imei) || registrationRaw;
  let description = compactLabel(row.assetDescription ?? row.description ?? row.name);
  if (looksLikeImeiLabel(description, imei)) description = "";

  // Already stored as Make+Plate (or any non-IMEI description that isn't bare plate) — keep it.
  if (description) {
    if (registration && compactLabelKey(description) === compactLabelKey(registration) && make) {
      return `${displayMake(make)} ${registration}`;
    }
    return description;
  }

  // Compose Make + plate when description is missing/IMEI (matches Assets table convention).
  if (make && registration) return `${displayMake(make)} ${registration}`;
  if (registration) return registration;
  if (make) return displayMake(make);
  // Never fall back to IMEI — that is what made Live Tracking flip between plates and numbers.
  return "";
};

/**
 * Keep a human plate/name when an incoming Traccar/live refresh tries to replace it with an IMEI.
 */
export const preferHumanAssetLabel = (previous: unknown, incoming: unknown, imei = "") => {
  const prev = compactLabel(previous);
  const next = compactLabel(incoming);
  const imeiKey = compactLabel(imei);
  const prevIsHuman = Boolean(prev) && !looksLikeImeiLabel(prev, imeiKey);
  const nextIsHuman = Boolean(next) && !looksLikeImeiLabel(next, imeiKey);
  if (prevIsHuman && !nextIsHuman) return prev;
  if (nextIsHuman) return next;
  if (prevIsHuman) return prev;
  return "";
};

export const formatAssetPickerLabel = (asset: AssetLike | Record<string, unknown> | null | undefined) => {
  const description = formatAssetDescription(asset);
  if (!asset || typeof asset !== "object") return description;
  const row = asset as Record<string, unknown>;
  const imei = compactLabel(row.imei ?? row.uniqueId);
  const registration = usablePlate(row.registration ?? row.regNumber ?? row.reg, imei);
  if (description && registration && !descriptionIncludesRegistration(description, registration)) {
    return `${description} - ${registration}`;
  }
  return description || registration || imei || compactLabel(row.id ?? row.assetId);
};

export const assetRecordRichness = (asset: AssetLike | Record<string, unknown> | null | undefined) => {
  if (!asset || typeof asset !== "object") return 0;
  const row = asset as Record<string, unknown>;
  const imei = text(row.imei);
  let score = 0;
  const description = text(row.assetDescription ?? row.description ?? row.name);
  if (description && !looksLikeImeiLabel(description, imei)) score += 6;
  const registration = text(row.registration);
  if (registration && !looksLikeImeiLabel(registration, imei)) score += 3;
  if (Number(row.assetId ?? row.asset_id) > 0) score += 3;
  if (text(row.lastPosition ?? row.last_position ?? row.lastSeen)) score += 2;
  if (text(row.lastTrip ?? row.last_trip)) score += 1;
  if (text(row.country)) score += 2;
  if (text(row.assetType ?? row.asset_type)) score += 2;
  if (text(row.make)) score += 2;
  if (text(row.fleetNumber ?? row.ispSerial)) score += 3;
  if (text(row.year)) score += 1;
  if (text(row.vin)) score += 1;
  const configGroup = text(row.configGroup ?? row.configurationGroup).toLowerCase();
  if (configGroup && configGroup !== "default" && configGroup !== "default-group") score += 3;
  return score;
};

export const assetsLookLikeTraccarStubs = (assets: unknown[] | null | undefined) => {
  const rows = Array.isArray(assets) ? assets : [];
  if (!rows.length) return true;
  const thin = rows.filter((item) => {
    if (!item || typeof item !== "object") return true;
    const row = item as Record<string, unknown>;
    const imei = text(row.imei);
    const description = text(row.assetDescription ?? row.description ?? row.name);
    const country = text(row.country);
    const make = text(row.make);
    const fleet = text(row.fleetNumber ?? row.ispSerial);
    const assetType = text(row.assetType ?? row.asset_type);
    const config = text(row.configGroup ?? row.configurationGroup).toLowerCase();
    const defaultConfig = !config || config === "default" || config === "default-group";
    // Plate-style names (e.g. UA 111EF) are real user descriptions — not Traccar stubs.
    // Only treat as thin when the label is empty or is literally the IMEI.
    const thinName = !description || looksLikeImeiLabel(description, imei);
    return defaultConfig && !country && !make && !fleet && !assetType && thinName;
  }).length;
  return thin >= Math.ceil(rows.length * 0.5);
};

export const collectTenantIdsFromHierarchy = (rows: HierarchyDealerLike[] | null | undefined) => {
  const ids: string[] = [];
  for (const dealer of Array.isArray(rows) ? rows : []) {
    for (const org of dealer.organisations ?? []) {
      for (const db of org.databases ?? []) {
        const tenantId = [dealer.id, org.id, db.id].map((part) => text(part)).filter(Boolean).join(":");
        if (tenantId.split(":").filter(Boolean).length >= 3 && !isSyntheticTenantId(tenantId)) ids.push(tenantId);
      }
    }
  }
  return [...new Set(ids)];
};

export const collectTenantIdsForSite = (rows: HierarchyDealerLike[] | null | undefined, siteName: string) => {
  const needle = token(siteName);
  if (!needle) return collectTenantIdsFromHierarchy(rows);
  const ids: string[] = [];
  const siteMatches = (value: unknown) => {
    const name = token(value);
    if (!name) return false;
    return name === needle || name.startsWith(needle) || needle.startsWith(name);
  };
  for (const dealer of Array.isArray(rows) ? rows : []) {
    for (const org of dealer.organisations ?? []) {
      for (const db of org.databases ?? []) {
        const hasSite = (db.sites ?? []).some((site) => siteMatches(site?.name) || siteMatches(site?.id));
        if (!hasSite) continue;
        const tenantId = [dealer.id, org.id, db.id].map((part) => text(part)).filter(Boolean).join(":");
        if (tenantId.split(":").filter(Boolean).length >= 3 && !isSyntheticTenantId(tenantId)) ids.push(tenantId);
      }
    }
  }
  return [...new Set(ids)];
};

/** Databases whose name or sites match the ribbon path (TRANSFLEET / MMULU), not every AFRICA node. */
export const collectTenantIdsForSiteOrDatabase = (
  rows: HierarchyDealerLike[] | null | undefined,
  siteName: string,
  databaseName = ""
) => {
  const fromSite = collectTenantIdsForSite(rows, siteName);
  const dbNeedle = token(databaseName);
  if (!dbNeedle) return fromSite;
  const ids = [...fromSite];
  for (const dealer of Array.isArray(rows) ? rows : []) {
    for (const org of dealer.organisations ?? []) {
      for (const db of org.databases ?? []) {
        const name = token(db?.name);
        if (!name || !(name === dbNeedle || name.startsWith(dbNeedle) || dbNeedle.startsWith(name))) continue;
        const tenantId = [dealer.id, org.id, db.id].map((part) => text(part)).filter(Boolean).join(":");
        if (tenantId.split(":").filter(Boolean).length >= 3 && !isSyntheticTenantId(tenantId)) ids.push(tenantId);
      }
    }
  }
  return [...new Set(ids)];
};

export const scoreTenantAssetRows = (assets: unknown[] | null | undefined, siteName = "") => {
  const rows = Array.isArray(assets) ? assets : [];
  const siteToken = token(siteName);
  const scoped = siteToken
    ? rows.filter((row) => row && typeof row === "object" && token((row as AssetLike).site) === siteToken)
    : rows;
  const used = scoped.length ? scoped : rows;
  if (!used.length) return 0;
  if (assetsLookLikeTraccarStubs(used)) return 1;
  return used.reduce<number>((sum, row) => sum + assetRecordRichness(row as AssetLike), 0) + 1000;
};

export const hierarchyPathForTenant = (
  rows: HierarchyDealerLike[] | null | undefined,
  tenantId: string,
  siteName = ""
) => {
  const parts = String(tenantId ?? "")
    .split(":")
    .map((part) => text(part))
    .filter(Boolean);
  if (parts.length < 3) return "";
  for (const dealer of Array.isArray(rows) ? rows : []) {
    if (text(dealer.id) !== parts[0]) continue;
    for (const org of dealer.organisations ?? []) {
      if (text(org.id) !== parts[1]) continue;
      for (const db of org.databases ?? []) {
        if (text(db.id) !== parts[2]) continue;
        const sites = db.sites ?? [];
        const siteNeedle = token(siteName);
        const site =
          sites.find((row) => {
            const name = token(row?.name);
            return Boolean(siteNeedle && name && (name === siteNeedle || name.startsWith(siteNeedle) || siteNeedle.startsWith(name)));
          }) ?? sites[0];
        return [dealer.name, org.name, db.name, site?.name].map((value) => text(value)).filter(Boolean).join(" / ");
      }
    }
  }
  return "";
};

export const readCachedAssetRecords = (): AssetLike[] => {
  if (typeof window === "undefined") return [];
  const rows: AssetLike[] = [];
  const pushAll = (items: unknown[], tenantId = "") => {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      rows.push(tenantId ? { ...(item as AssetLike), tenantId } : (item as AssetLike));
    }
  };
  pushAll(readJsonArray("vivi.assets"));
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = text(window.localStorage.key(index));
      if (key === "vivi.assets") {
        pushAll(readJsonArray(key));
        continue;
      }
      if (!key.startsWith("vivi.assets:")) continue;
      const tenantId = key.slice("vivi.assets:".length);
      if (isSyntheticTenantId(tenantId)) continue;
      pushAll(readJsonArray(key), tenantId);
    }
  } catch {
    // ignore
  }
  return rows;
};

export const pickRichestCachedTenantId = (siteName = ""): string => {
  if (typeof window === "undefined") return "";
  const siteToken = token(siteName);
  let bestId = "";
  let bestScore = -1;
  const consider = (tenantId: string, assets: unknown[]) => {
    if (!tenantId || isSyntheticTenantId(tenantId)) return;
    const rows = Array.isArray(assets) ? assets : [];
    const scoped = siteToken
      ? rows.filter((row) => row && typeof row === "object" && token((row as AssetLike).site) === siteToken)
      : rows;
    const scored = (scoped.length ? scoped : rows).reduce<number>(
      (sum, row) => sum + assetRecordRichness(row as AssetLike),
      0
    );
    const score = scored * 10 + (scoped.length ? 5 : 0) + rows.length;
    if (score > bestScore) {
      bestScore = score;
      bestId = tenantId;
    }
  };

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = text(window.localStorage.key(index));
      if (!key.startsWith("vivi.assets:") || !key.includes(":")) continue;
      consider(key.slice("vivi.assets:".length), readJsonArray(key));
    }
  } catch {
    // ignore
  }
  return bestId;
};

export const resolveRealTenantId = (input: { candidate?: string; siteName?: string }) => {
  const candidate = text(input.candidate);
  if (candidate && !isSyntheticTenantId(candidate)) return candidate;
  const fromSite = pickRichestCachedTenantId(text(input.siteName));
  if (fromSite) return fromSite;
  const discovered = discoverCachedTenantIds();
  return discovered[0] || "";
};

const namesMatch = (left: unknown, right: unknown) => {
  const a = token(left);
  const b = token(right);
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
};

const findHierarchyChild = <T extends { id?: string; name?: string }>(
  rows: T[] | null | undefined,
  id: string,
  name: string
): T | undefined => {
  const list = Array.isArray(rows) ? rows : [];
  const idKey = text(id);
  if (idKey) {
    const byId = list.find((row) => text(row?.id) === idKey);
    if (byId) return byId;
  }
  const nameKey = token(name);
  if (!nameKey) return undefined;
  return list.find((row) => namesMatch(row?.name, name));
};

export type ResolvedHierarchyTenant = {
  tenantId: string;
  dealerId: string;
  orgId: string;
  dbId: string;
  siteId: string;
  siteName: string;
};

/**
 * Map the ribbon's EAST AFRICA / AFRICA / TRANSFLEET / MMULU path onto the live
 * server tree. Returns null for name-slug ids so localhost never activates a stub tenant.
 */
export const resolveDatabaseTenantFromHierarchy = (input: {
  rows: HierarchyDealerLike[] | null | undefined;
  dealerId?: string;
  orgId?: string;
  dbId?: string;
  pathNames?: string[];
  siteName?: string;
}): ResolvedHierarchyTenant | null => {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) return null;
  const path = (input.pathNames ?? [])
    .map((part) => text(part))
    .filter(Boolean)
    .filter((part) => !isLegacyFlatTenantId(part));
  const siteNeedle = text(input.siteName) || path[3] || "";
  const storedDealerId = isLegacyFlatTenantId(input.dealerId) ? "" : text(input.dealerId);
  const storedOrgId = isLegacyFlatTenantId(input.orgId) ? "" : text(input.orgId);
  const storedDbId = isLegacyFlatTenantId(input.dbId) ? "" : text(input.dbId);
  const storedIdsAreLive =
    Boolean(storedDealerId && storedOrgId && storedDbId) &&
    !isSyntheticHierarchyId(storedDealerId) &&
    !isSyntheticHierarchyId(storedOrgId) &&
    !isSyntheticHierarchyId(storedDbId);

  let dealer = findHierarchyChild(rows, storedDealerId, storedIdsAreLive ? "" : path[0] || "");
  if (dealer && path[0] && !namesMatch(dealer.name, path[0]) && !storedIdsAreLive) {
    dealer = findHierarchyChild(rows, "", path[0]);
  }
  let org = dealer
    ? findHierarchyChild(dealer.organisations ?? [], storedOrgId, storedIdsAreLive ? "" : path[1] || "")
    : undefined;
  if (org && path[1] && !namesMatch(org.name, path[1]) && !storedIdsAreLive) {
    org = findHierarchyChild(dealer?.organisations ?? [], "", path[1]);
  }
  let db = org
    ? findHierarchyChild(org.databases ?? [], storedDbId, storedIdsAreLive ? "" : path[2] || "")
    : undefined;
  if (db && path[2] && !namesMatch(db.name, path[2]) && !storedIdsAreLive) {
    db = findHierarchyChild(org?.databases ?? [], "", path[2]);
  }

  const haveLiveResolution = Boolean(
    storedIdsAreLive &&
      dealer &&
      org &&
      db &&
      text(dealer.id) === storedDealerId &&
      text(org.id) === storedOrgId &&
      text(db.id) === storedDbId
  );

  if (siteNeedle && !haveLiveResolution) {
    const matches: Array<{
      dealer: HierarchyDealerLike;
      org: NonNullable<HierarchyDealerLike["organisations"]>[number];
      db: NonNullable<NonNullable<HierarchyDealerLike["organisations"]>[number]["databases"]>[number];
    }> = [];
    for (const nextDealer of rows) {
      for (const nextOrg of nextDealer.organisations ?? []) {
        for (const nextDb of nextOrg.databases ?? []) {
          const hasSite = (nextDb.sites ?? []).some((site) => namesMatch(site?.name, siteNeedle));
          if (!hasSite) continue;
          const tenantId = [nextDealer.id, nextOrg.id, nextDb.id].map((part) => text(part)).filter(Boolean).join(":");
          if (isSyntheticTenantId(tenantId)) continue;
          matches.push({ dealer: nextDealer, org: nextOrg, db: nextDb });
        }
      }
    }
    const byStoredId = storedIdsAreLive
      ? matches.find(
          (item) =>
            text(item.dealer.id) === storedDealerId &&
            text(item.org.id) === storedOrgId &&
            text(item.db.id) === storedDbId
        )
      : undefined;
    const pathTokens = path.map((part) => token(part)).filter(Boolean);
    const scoreMatch = (item: (typeof matches)[number]) => {
      const names = [item.dealer.name, item.org.name, item.db.name].map((value) => token(value));
      const unordered = pathTokens.filter((part) =>
        names.some((name) => name === part || name.startsWith(part) || part.startsWith(name))
      ).length;
      const ordered =
        (path[0] && namesMatch(item.dealer.name, path[0]) ? 2 : 0) +
        (path[1] && namesMatch(item.org.name, path[1]) ? 2 : 0) +
        (path[2] && namesMatch(item.db.name, path[2]) ? 2 : 0);
      return unordered + ordered;
    };
    matches.sort((left, right) => scoreMatch(right) - scoreMatch(left));
    const picked = byStoredId ?? matches[0];
    if (picked) {
      dealer = picked.dealer;
      org = picked.org;
      db = picked.db;
    }
  }

  if (!dealer || !org || !db) return null;
  const tenantId = [dealer.id, org.id, db.id].map((part) => text(part)).filter(Boolean).join(":");
  if (tenantId.split(":").filter(Boolean).length < 3 || isSyntheticTenantId(tenantId)) return null;
  const site =
    findHierarchyChild(db.sites ?? [], "", siteNeedle) ??
    (db.sites ?? [])[0];
  return {
    tenantId,
    dealerId: text(dealer.id),
    orgId: text(org.id),
    dbId: text(db.id),
    siteId: text(site?.id),
    siteName: text(site?.name)
  };
};

const findOrCreate = <T extends { id: string; name: string }>(
  rows: T[],
  id: string,
  name: string,
  create: () => T
): T => {
  const byId = rows.find((row) => row.id === id);
  if (byId) {
    if (!byId.name && name) byId.name = name;
    return byId;
  }
  const byName = name ? rows.find((row) => token(row.name) === token(name)) : undefined;
  if (byName) {
    if (id && byName.id && id !== byName.id && !isSyntheticHierarchyId(id) && !isSyntheticHierarchyId(byName.id)) {
      const created = create();
      rows.push(created);
      return created;
    }
    if (id && !isSyntheticHierarchyId(id) && isSyntheticHierarchyId(byName.id)) byName.id = id;
    if (!byName.name && name) byName.name = name;
    return byName;
  }
  const created = create();
  rows.push(created);
  return created;
};

/**
 * Rebuild Organisation → Dealer → Database → Site from cached fleet rows when
 * GET /b2/hierarchy is empty (typical after tenant was cleared).
 */
export const buildHierarchyDealersFromAssets = (
  assets: AssetLike[] = readCachedAssetRecords(),
  tenantIds: string[] = discoverCachedTenantIds()
): HierarchyDealerLike[] => {
  const dealers: HierarchyDealerLike[] = [];
  const realHints = tenantIds
    .map((id) => splitTenantParts(id))
    .filter((hint): hint is NonNullable<ReturnType<typeof splitTenantParts>> => Boolean(hint && !isSyntheticTenantId(hint.tenantId)));

  for (const asset of assets) {
    const siteName = text(asset.site);
    const organisationName = text(asset.organisation) || text(asset.dealer) || "Organisation";
    const dealerName = text(asset.dealer) || text(asset.organisation) || "Dealer";
    const databaseName = text(asset.database) || "Database";
    if (!siteName && !text(asset.organisation) && !text(asset.dealer) && !text(asset.database)) continue;

    const fromAsset = splitTenantParts(text(asset.tenantId));
    const hint =
      (fromAsset && !isSyntheticTenantId(fromAsset.tenantId) ? fromAsset : null) ||
      realHints.find((row) => row.tenantId === text(asset.tenantId)) ||
      (realHints.length === 1 ? realHints[0] : null);

    const dealerId = hint?.dealerId || slugId("org", organisationName);
    const orgId = hint?.orgId || slugId("dealer", dealerName);
    const dbId = hint?.dbId || slugId("db", databaseName);

    const dealer = findOrCreate(dealers, dealerId, organisationName, () => ({
      id: dealerId,
      name: organisationName,
      organisations: []
    }));
    dealer.organisations = dealer.organisations ?? [];
    const org = findOrCreate(dealer.organisations as Array<{ id: string; name: string; databases: any[] }>, orgId, dealerName, () => ({
      id: orgId,
      name: dealerName,
      databases: []
    }));
    const db = findOrCreate(org.databases as Array<{ id: string; name: string; sites: any[] }>, dbId, databaseName, () => ({
      id: dbId,
      name: databaseName,
      sites: []
    }));
    if (siteName) {
      const siteId = slugId("site", siteName);
      findOrCreate(db.sites as Array<{ id: string; name: string; assets: string[] }>, siteId, siteName, () => ({
        id: siteId,
        name: siteName,
        assets: []
      }));
    }
  }

  return dealers;
};

const mergeHierarchyByName = <T extends HierarchyDealerLike>(baseRows: T[], extraRows: HierarchyDealerLike[]): T[] => {
  if (!extraRows.length) return baseRows;
  const rows = (baseRows.length ? [...baseRows] : []) as HierarchyDealerLike[];
  const source = baseRows.length ? extraRows : [];
  if (!baseRows.length) return extraRows as T[];

  for (const extraDealer of source) {
    const dealer = findOrCreate(rows, String(extraDealer.id ?? ""), String(extraDealer.name ?? ""), () => ({
      id: extraDealer.id,
      name: extraDealer.name,
      organisations: []
    }));
    dealer.organisations = dealer.organisations ?? [];
    for (const extraOrg of extraDealer.organisations ?? []) {
      const org = findOrCreate(
        dealer.organisations as Array<{ id: string; name: string; databases: any[] }>,
        String(extraOrg.id ?? ""),
        String(extraOrg.name ?? ""),
        () => ({ id: extraOrg.id ?? "", name: extraOrg.name ?? "", databases: [] })
      );
      org.databases = org.databases ?? [];
      for (const extraDb of extraOrg.databases ?? []) {
        const db = findOrCreate(
          org.databases as Array<{ id: string; name: string; sites: any[] }>,
          String(extraDb.id ?? ""),
          String(extraDb.name ?? ""),
          () => ({ id: extraDb.id ?? "", name: extraDb.name ?? "", sites: [] })
        );
        db.sites = db.sites ?? [];
        for (const extraSite of extraDb.sites ?? []) {
          findOrCreate(
            db.sites as Array<{ id: string; name: string; assets: unknown[] }>,
            String(extraSite.id ?? ""),
            String(extraSite.name ?? ""),
            () => ({ id: extraSite.id ?? "", name: extraSite.name ?? "", assets: extraSite.assets ?? [] })
          );
        }
      }
    }
  }
  return rows as T[];
};

export const recoverLocalHierarchyRows = <T extends HierarchyDealerLike>(localRows: T[]): T[] => {
  const recovered = buildHierarchyDealersFromAssets();
  const merged = mergeHierarchyByName(localRows, recovered);
  return resolveHierarchyDisplayRows({
    serverRows: merged as T[],
    localRows,
    serverUnavailable: countHierarchyDealerNodes(recovered) === 0
  });
};
