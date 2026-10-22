import { getAssetsFromApi, getAssetsFromApiForTenant, getTenantId, getTraccarDevices, peekCachedAssets } from "./api";
import { filterAssetsToHomeSites, readHomeSiteScope } from "./homeSiteScope";
import { matchesStoredSiteSelection, readStoredSelectionScope } from "./selectionScope";

const readScopedTenantId = (): string => {
  if (typeof window === "undefined") return "";
  const dealerId = String(window.localStorage.getItem("vivi.activeDealerId") ?? "").trim();
  const orgId = String(window.localStorage.getItem("vivi.activeOrgId") ?? "").trim();
  const dbId = String(window.localStorage.getItem("vivi.activeDbId") ?? "").trim();
  if (dealerId && orgId && dbId) return `${dealerId}:${orgId}:${dbId}`;
  return String(window.localStorage.getItem("vivi.tenantId") ?? "").trim();
};

const assetSite = (asset: Record<string, unknown>) =>
  String(asset.site ?? asset.group ?? asset.groupName ?? "").trim();

const filterAssetsForSelection = (
  rows: Record<string, unknown>[],
  selection: ReturnType<typeof readStoredSelectionScope>
) => rows.filter((asset) => matchesStoredSiteSelection(assetSite(asset), selection));

/**
 * Assets for the active site, using the same feed as Live Tracking.
 * A non-empty payload from the wrong tenant must not hide the live fleet:
 * if the first list filters down to nothing, try the selected tenant, then cache.
 */
const scopedAssetsInflight = new Map<string, Promise<Record<string, unknown>[]>>();

export function peekScopedAssets(): Record<string, unknown>[] {
  const selection = readStoredSelectionScope();
  return filterAssetsForSelection(peekCachedAssets<Record<string, unknown>>(), selection);
}

export async function loadScopedAssets(): Promise<Record<string, unknown>[]> {
  const key = `${getTenantId() || "_"}|${JSON.stringify(readStoredSelectionScope())}`;
  const existing = scopedAssetsInflight.get(key);
  if (existing) return existing;
  const request = loadScopedAssetsUncached().finally(() => {
    scopedAssetsInflight.delete(key);
  });
  scopedAssetsInflight.set(key, request);
  return request;
}

async function loadScopedAssetsUncached(): Promise<Record<string, unknown>[]> {
  const selection = readStoredSelectionScope();
  const scopedTenantId = readScopedTenantId();

  const primary = await getAssetsFromApi<Record<string, unknown>>();
  let scoped = filterAssetsForSelection(Array.isArray(primary) ? primary : [], selection);

  if (!scoped.length && scopedTenantId) {
    const tenantRows = await getAssetsFromApiForTenant<Record<string, unknown>>(scopedTenantId);
    scoped = filterAssetsForSelection(Array.isArray(tenantRows) ? tenantRows : [], selection);
  }

  if (!scoped.length) {
    scoped = filterAssetsForSelection(peekCachedAssets<Record<string, unknown>>(), selection);
  }

  return scoped;
}

type TraccarDeviceRef = { id?: unknown; uniqueId?: unknown; name?: unknown };

const looseKey = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const imeiDigits = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D+/g, "");
  return digits.length >= 14 && digits.length <= 17 ? digits : "";
};

const buildDeviceLookup = (devices: TraccarDeviceRef[]) => {
  const byImei = new Map<string, string>();
  const byName = new Map<string, string>();

  const remember = (map: Map<string, string>, key: string, id: string) => {
    if (key && !map.has(key)) map.set(key, id);
  };

  for (const device of devices) {
    const id = String(device?.id ?? "").trim();
    if (!id) continue;
    const uniqueId = String(device?.uniqueId ?? "").trim().toLowerCase();
    remember(byImei, uniqueId, id);
    remember(byImei, imeiDigits(device?.uniqueId), id);
    const name = String(device?.name ?? "").trim().toLowerCase();
    remember(byName, name, id);
    remember(byName, looseKey(device?.name), id);
  }

  return { byImei, byName };
};

const resolveDeviceIdForAsset = (
  asset: Record<string, unknown>,
  lookup: ReturnType<typeof buildDeviceLookup>
) => {
  const directId = Number(asset.traccarDeviceId ?? asset.deviceId);
  if (Number.isFinite(directId) && directId > 0) return String(directId);

  const imeiRaw = String(asset.imei ?? asset.uniqueId ?? "").trim().toLowerCase();
  const imei = imeiDigits(asset.imei ?? asset.uniqueId);
  const registration = String(asset.registration ?? asset.assetDescription ?? asset.name ?? "")
    .trim()
    .toLowerCase();
  return (
    (imei && lookup.byImei.get(imei)) ||
    (imeiRaw && lookup.byImei.get(imeiRaw)) ||
    (registration && lookup.byName.get(registration)) ||
    (looseKey(registration) && lookup.byName.get(looseKey(registration))) ||
    ""
  );
};

/** Map Traccar device ids to scoped assets (IMEI, registration, or stored device id). */
export function buildScopedDeviceContext(
  assets: Record<string, unknown>[],
  devices: TraccarDeviceRef[]
) {
  const lookup = buildDeviceLookup(Array.isArray(devices) ? devices : []);
  const ids = new Set<string>();
  const assetByDeviceId = new Map<string, Record<string, unknown>>();

  for (const asset of assets) {
    const deviceId = resolveDeviceIdForAsset(asset, lookup);
    if (!deviceId) continue;
    ids.add(deviceId);
    if (!assetByDeviceId.has(deviceId)) assetByDeviceId.set(deviceId, asset);
  }

  return { deviceIds: [...ids], assetByDeviceId };
}

const scopedDeviceContextInflight = new Map<string, Promise<{
  assets: Record<string, unknown>[];
  deviceIds: string[];
  assetByDeviceId: Map<string, Record<string, unknown>>;
}>>();

/** Home dashboard assets and their Traccar device ids, limited to the sites Home is showing. */
export async function loadScopedDeviceContext() {
  const homeSites = readHomeSiteScope().scopedSites;
  const key = `${getTenantId() || "_"}|${JSON.stringify(readStoredSelectionScope())}|${homeSites.join("|")}`;
  const existing = scopedDeviceContextInflight.get(key);
  if (existing) return existing;
  const request = (async () => {
    const assets = filterAssetsToHomeSites(await loadScopedAssets(), homeSites);
    const devices = await getTraccarDevices().catch(() => []);
    const { deviceIds, assetByDeviceId } = buildScopedDeviceContext(assets, devices);
    return { assets, deviceIds, assetByDeviceId };
  })().finally(() => {
    scopedDeviceContextInflight.delete(key);
  });
  scopedDeviceContextInflight.set(key, request);
  return request;
}

/** Resolve scoped assets to unique Traccar device ids (direct id, IMEI, or name). */
export async function resolveScopedDeviceIds(assets: Record<string, unknown>[]): Promise<string[]> {
  const devices = await getTraccarDevices().catch(() => []);
  return buildScopedDeviceContext(assets, devices).deviceIds;
}