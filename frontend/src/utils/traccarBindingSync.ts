import type { NotificationRow } from "../data/notificationLibrary";
import {
  resolveMonitoredEventDescription,
  toCanonicalNotificationDescription
} from "../data/notificationLibrary";
import {
  buildConfigGroupSourceSnapshot,
  configurationGroupCompileSucceeded,
  isBlockingCompileError,
  type ConfigGroupAssetCompileOutcome
} from "./configGroupCompileStatus";
import {
  listAssetsForConfigGroup
} from "./configGroupSiteAssets";
import {
  beginTraccarListCacheBatch,
  createTraccarNotification,
  createTraccarPermission,
  deleteTraccarComputedAttribute,
  deleteTraccarNotification,
  endTraccarListCacheBatch,
  getAssetsFromApi,
  getBindings,
  saveBindingDetailed,
  getConfigurationGroups,
  getHierarchy,
  getTraccarComputedAttributes,
  getTraccarDevices,
  getTraccarDevicesDetailed,
  getTraccarGroups,
  getTraccarNotifications,
  invalidateTraccarListCaches,
  listTraccarComputedAttributesForDevice,
  listTraccarGeofenceDefinitions,
  listTraccarNotificationsForDevice,
  loadFromApi,
  pushDeviceSettings,
  updateTraccarDevice,
  upsertAssetDetailed
} from "./api";
import { formatBindingsHintForSite, resolveBindingByRef, bindingRowMatchesRef, sitesEquivalent } from "./bindingResolve";
import { serializeFuelCalibration, peakFuelCalibrationLiters, hasUsableFuelCalibration } from "./fuelCalibration";
import {
  describeMissingFuelComputePrerequisites,
  readFuelAnalogMvRangeFromLine,
  readFuelTankCapacityRangeFromLine,
  readFuelComputeSettingsFromNotification,
  resolveFuelAnalogLineFromDeviceBinding,
  resolveFuelInputFromDeviceBinding,
  resolveFuelInputLineLabel
} from "./fuelComputeFromDevice";
import { isFuelComputeNotification } from "./traccarAttributeMapper";
import { loadNotificationLibraryItems, readActiveSiteName } from "./notificationLibraryStore";
import { bindingMatchesSite } from "./scopeIsolation";
import { saveScopedToApi, loadScopedFromApi } from "./scopeStorage";
import { isDatabaseTenant, readActiveTenantId } from "./tenantContext";
import { loadLocationGeofences, saveLocationGeofence } from "./locationGeofences";
import { isGpsIotServer } from "./regionServers";
import {
  parseViviScopedLibraryId,
  readViviLibraryIdFromComputedItem
} from "./traccarComputedAttributeApi";
import {
  mapPool,
  prefetchTraccarLibraryCatalogs,
  syncNotificationLibraryItemToTraccar,
  traccarItemMatchesLibraryRow,
  readTraccarItemBindingId,
  readTraccarItemConfigGroupId,
  readTraccarItemSite,
  readTraccarItemTenantId,
  type LibraryTraccarSyncOptions,
  type TraccarScopedSyncContext
} from "./traccarNotificationLibrarySync";
import {
  mapParameterFieldToJexl,
  parameterLibraryId,
  parameterToAttributeKey,
  parameterToComputedAttributeName,
  type ParameterCatalogRow
} from "./traccarAttributeMapper";

export type NotificationBindingRecord = {
  id: string;
  name: string;
  site?: string;
  monitoredEvents?: string[];
};

export type ConfigGroupCompileAcceptanceRecord = {
  compiledAt?: string;
  acceptedCount: number;
  totalCount: number;
  assets: ConfigGroupAssetCompileOutcome[];
  sourceSnapshot?: {
    notificationBinding?: string;
    locationBinding?: string;
    deviceBinding?: string;
    capturedAt?: string;
  };
};

export type ConfigGroupRecord = {
  id: string;
  name: string;
  site: string;
  notificationBinding: string;
  locationBinding?: string;
  deviceBinding?: string;
  status?: string;
  updatedAt?: string;
  compileAcceptance?: ConfigGroupCompileAcceptanceRecord;
};

export type LocationBindingRecord = {
  id: string;
  name: string;
  site?: string;
  locationsConfig?: Array<{
    id: string;
    name?: string;
    settings?: Record<string, unknown>;
  }>;
};

export type DeviceBindingRecord = {
  id: string;
  name: string;
  deviceType?: string;
  site?: string;
  lines?: Array<{
    id?: string;
    wire?: string;
    line?: string;
    connection?: string;
    parameter?: string;
    analogInput?: string;
    analogMvMin?: string;
    analogMvMax?: string;
    tankCapacityMin?: string;
    tankCapacityMax?: string;
    fuelScale?: string;
    fuelCalibration?: Array<{ mv?: string | number; liters?: string | number }>;
    bluetoothTraccarDeviceId?: string;
    bluetoothTraccarDeviceName?: string;
    rpmMin?: string;
    rpmMax?: string;
    rpmScale?: string;
    connected?: boolean;
    canEnabled?: boolean;
    canProtocol?: string;
  }>;
  advancedSettings?: Record<string, unknown>;
  gsmSettings?: Record<string, unknown>;
};

const normalize = (value: string) => String(value ?? "").trim().toLowerCase();

const matchesRef = (ref: string, candidates: string[]) => {
  const key = normalize(ref);
  if (!key) return false;
  return candidates.some((candidate) => normalize(candidate) === key);
};

function resolveSiteTraccarGroupId(
  hierarchy: Awaited<ReturnType<typeof getHierarchy>>,
  tenantId: string,
  siteName: string,
  traccarGroups: Awaited<ReturnType<typeof getTraccarGroups>>
): number | undefined {
  const parts = tenantId.split(":").filter(Boolean);
  if (parts.length >= 3) {
    const [dealerId, orgId, dbId] = parts;
    for (const dealer of hierarchy.dealers ?? []) {
      if (dealer.id !== dealerId) continue;
      for (const org of dealer.organisations ?? []) {
        if (org.id !== orgId) continue;
        for (const db of org.databases ?? []) {
          if (db.id !== dbId) continue;
          const site = (db.sites ?? []).find((row) => normalize(row.name) === normalize(siteName));
          const fromHierarchy = Number(site?.traccarGroupId ?? 0);
          if (
            Number.isFinite(fromHierarchy)
            && fromHierarchy > 0
            && !traccarGroupIdIsShared(hierarchy, Math.trunc(fromHierarchy))
          ) {
            return Math.trunc(fromHierarchy);
          }
        }
      }
    }
  }

  const named = traccarGroups.filter((group) => normalize(String(group.name ?? "")) === normalize(siteName));
  if (named.length !== 1) return undefined;
  const candidate = Number(named[0]?.id ?? 0);
  return Number.isFinite(candidate) && candidate > 0 ? Math.trunc(candidate) : undefined;
}

function traccarGroupIdIsShared(
  hierarchy: Awaited<ReturnType<typeof getHierarchy>>,
  groupId: number
): boolean {
  let count = 0;
  for (const dealer of hierarchy.dealers ?? []) {
    for (const org of dealer.organisations ?? []) {
      for (const db of org.databases ?? []) {
        for (const site of db.sites ?? []) {
          if (Number(site?.traccarGroupId ?? 0) === groupId) count += 1;
          if (count > 1) return true;
        }
      }
    }
  }
  return false;
}

export async function resolveNotificationBindingScopes(binding: NotificationBindingRecord): Promise<TraccarScopedSyncContext[]> {
  const tenantId = readActiveTenantId();
  if (!tenantId || !isDatabaseTenant(tenantId)) return [];

  const [configGroups, assets, hierarchy, traccarGroups] = await Promise.all([
    getConfigurationGroups<ConfigGroupRecord>(),
    getAssetsFromApi<any>(),
    getHierarchy(),
    getTraccarGroups()
  ]);

  const bindingRefs = [binding.id, binding.name].filter(Boolean);
  const linkedGroups = (configGroups ?? []).filter((group) => matchesRef(group.notificationBinding ?? "", bindingRefs));
  if (!linkedGroups.length) return [];

  const scopes: TraccarScopedSyncContext[] = [];
  const seen = new Set<string>();

  const bindingSite = String(binding.site ?? "").trim();

  for (const group of linkedGroups) {
    const site = String(group.site ?? "").trim();
    if (!site) continue;
    if (bindingSite && normalize(bindingSite) !== normalize(site)) continue;

    const groupRefs = [group.id, group.name].filter(Boolean);
    const groupAssets = (assets ?? []).filter((asset) => {
      const assetSite = String(asset?.site ?? "").trim();
      if (normalize(assetSite) !== normalize(site)) return false;
      return matchesRef(String(asset?.configGroup ?? asset?.configurationGroup ?? ""), groupRefs);
    });

    const traccarGroupId = resolveSiteTraccarGroupId(hierarchy, tenantId, site, traccarGroups);
    const scopeKey = `${tenantId}|${site}|${group.id}|${binding.id}`;
    if (seen.has(scopeKey)) continue;
    seen.add(scopeKey);

    scopes.push({
      tenantId,
      site,
      configGroupId: group.id,
      configGroupName: group.name,
      bindingId: binding.id,
      bindingName: binding.name,
      traccarGroupId,
      siteId: String(groupAssets[0]?.siteId ?? "").trim() || undefined
    });
  }

  if (!scopes.length) {
    const site = bindingSite || readActiveSiteName();
    if (site) {
      const traccarGroupId = resolveSiteTraccarGroupId(hierarchy, tenantId, site, traccarGroups);
      scopes.push({
        tenantId,
        site,
        configGroupId: `binding:${binding.id}`,
        configGroupName: String(binding.name ?? "").trim() || binding.id,
        bindingId: binding.id,
        bindingName: binding.name,
        traccarGroupId,
        siteId: undefined
      });
    }
  }

  return scopes;
}

function countConfigGroupSiteAssets(group: ConfigGroupRecord, assets: any[]): number {
  return listConfigGroupSiteAssets(group, assets).length;
}

export function listConfigGroupSiteAssets(
  group: ConfigGroupRecord,
  assets: any[],
  allGroups: ConfigGroupRecord[] = []
): any[] {
  return listAssetsForConfigGroup(group, assets ?? [], allGroups);
}

/** Persist config-group links for site assets that are empty / Default so they stick on Assets + compile. */
export async function ensureSiteAssetsLinkedToConfigGroup(
  group: ConfigGroupRecord,
  assets: any[]
): Promise<{ updated: number; errors: string[] }> {
  const groupId = String(group.id ?? "").trim();
  const groupName = String(group.name ?? "").trim();
  if (!groupId && !groupName) return { updated: 0, errors: [] };

  const desiredId = groupId || groupName;
  const desiredName = groupName || groupId;
  const errors: string[] = [];
  let updated = 0;
  for (const asset of assets) {
    const currentId = String(asset.configGroup ?? "").trim();
    const currentName = String(asset.configurationGroup ?? "").trim();
    if (currentId === desiredId && (currentName === desiredName || !currentName)) continue;

    const payload = {
      ...asset,
      configGroup: desiredId,
      configurationGroup: desiredName
    };
    const result = await upsertAssetDetailed(payload);
    if (!result.stored) {
      errors.push(`${String(asset.registration ?? asset.imei ?? asset.id ?? "asset")}: ${result.error ?? "Save failed"}`);
      continue;
    }
    asset.configGroup = payload.configGroup;
    asset.configurationGroup = payload.configurationGroup;
    updated += 1;
  }
  return { updated, errors };
}

async function ensureBindingSiteAnchored<T extends NotificationBindingRecord>(
  binding: T,
  site: string
): Promise<T> {
  const targetSite = String(site ?? "").trim();
  const bindingSite = String(binding.site ?? "").trim();
  if (!targetSite) return binding;
  if (bindingSite && normalize(bindingSite) === normalize(targetSite)) return binding;
  const next = { ...binding, site: targetSite };
  await saveBindingDetailed("notifications", next);
  return next;
}

async function loadNotificationLibraryItemsForSite(site: string): Promise<NotificationRow[]> {
  return loadNotificationLibraryItems(site);
}

function matchesConfigGroupTraccarScope(
  item: { attributes?: Record<string, unknown> },
  tenantId: string,
  site: string,
  configGroupId: string
): boolean {
  const itemTenant = readTraccarItemTenantId(item);
  if (itemTenant && itemTenant !== tenantId) return false;
  const itemSite = readTraccarItemSite(item);
  if (itemSite && normalize(itemSite) !== normalize(site)) return false;
  const scopedGroupId = readTraccarItemConfigGroupId(item);
  if (!scopedGroupId) return false;
  return normalize(scopedGroupId) === normalize(configGroupId);
}

/** Build a Traccar-valid permission body (deviceId first for notification/attribute/geofence links). */
function buildTraccarPermissionBody(payload: Record<string, number>): Record<string, number> | null {
  const deviceId = Math.trunc(Number(payload.deviceId));
  const groupId = Math.trunc(Number(payload.groupId));
  const notificationId = Math.trunc(Number(payload.notificationId));
  const attributeId = Math.trunc(Number(payload.attributeId));
  const geofenceId = Math.trunc(Number(payload.geofenceId));

  if (deviceId > 0 && notificationId > 0) return { deviceId, notificationId };
  if (deviceId > 0 && attributeId > 0) return { deviceId, attributeId };
  if (deviceId > 0 && geofenceId > 0) return { deviceId, geofenceId };
  if (groupId > 0 && geofenceId > 0) return { groupId, geofenceId };

  // Modern Traccar has no tc_device_group permission pair — assign via device.groupId instead.
  // Traccar also rejects groupId + notificationId / groupId + attributeId (400). Link those per device at compile.
  return null;
}

async function grantTraccarPermission(
  payload: Record<string, number>
): Promise<{ ok: boolean; error?: string }> {
  const normalized = buildTraccarPermissionBody(payload);
  if (!normalized) {
    // deviceId+groupId is intentionally unsupported — callers assign groupId on the device.
    if (Math.trunc(Number(payload.deviceId)) > 0 && Math.trunc(Number(payload.groupId)) > 0) {
      return { ok: true };
    }
    return { ok: false, error: "Permission requires two linked ids." };
  }
  const result = await createTraccarPermission(normalized);
  // Linking is idempotent: Traccar returns 400 when the pair already exists (or is invalid).
  // Treat soft-fail / 4xx conflict noise as success so re-compile never marks assets Failed.
  const message = String(result.error ?? "").toLowerCase();
  if (
    result.ok ||
    result.softFailed ||
    result.status === 204 ||
    result.status === 400 ||
    result.status === 409 ||
    /exist|duplicate|constraint|invalid permission|tc_device_group|null body status|soft/i.test(message)
  ) {
    return { ok: true };
  }
  if (/failed to fetch|http2|protocol|connection|timeout|network|unreachable|upstream unavailable/i.test(message)) {
    return { ok: false, error: "VIVI temporarily unreachable while linking — retry compile." };
  }
  return { ok: false, error: result.error || "Unable to create Traccar permission." };
}

async function collectConfigGroupTraccarResourceIds(
  group: ConfigGroupRecord,
  extraParameterNames: string[],
  monitoredLibraryItems: NotificationRow[] = [],
  knownIds?: { notificationIds?: number[]; attributeIds?: number[] }
): Promise<{ attributeIds: number[]; notificationIds: number[] }> {
  const tenantId = readActiveTenantId();
  const site = String(group.site ?? "").trim();
  const [notifications, computedAttributes] = await Promise.all([
    getTraccarNotifications(),
    getTraccarComputedAttributes()
  ]);

  const attributeIds = new Set<number>();
  const notificationIds = new Set<number>();
  const knownFromSync =
    (knownIds?.notificationIds?.length ?? 0) > 0 || (knownIds?.attributeIds?.length ?? 0) > 0;

  for (const id of knownIds?.notificationIds ?? []) {
    const n = Number(id ?? 0);
    if (Number.isFinite(n) && n > 0) notificationIds.add(Math.trunc(n));
  }
  for (const id of knownIds?.attributeIds ?? []) {
    const n = Number(id ?? 0);
    if (Number.isFinite(n) && n > 0) attributeIds.add(Math.trunc(n));
  }

  for (const libraryItem of monitoredLibraryItems) {
    if (normalize(String(libraryItem.availability ?? "")) !== "available") continue;

    // One notification + one computed attribute per library row — never link every historical copy.
    const cachedNotificationId = Number(libraryItem.traccarNotificationId ?? 0);
    if (Number.isFinite(cachedNotificationId) && cachedNotificationId > 0) {
      notificationIds.add(Math.trunc(cachedNotificationId));
    } else if (!knownFromSync) {
      const match = notifications.find((item) =>
        traccarItemMatchesLibraryRow(item, libraryItem, tenantId ?? undefined)
      );
      const notificationId = Number(match?.id ?? 0);
      if (Number.isFinite(notificationId) && notificationId > 0) {
        notificationIds.add(Math.trunc(notificationId));
      }
    }

    const cachedAttributeId = Number(libraryItem.traccarComputedAttributeId ?? 0);
    if (Number.isFinite(cachedAttributeId) && cachedAttributeId > 0) {
      attributeIds.add(Math.trunc(cachedAttributeId));
    } else if (!knownFromSync) {
      const match = computedAttributes.find((item) =>
        traccarItemMatchesLibraryRow(item, libraryItem, tenantId ?? undefined)
      );
      const attributeId = Number(match?.id ?? 0);
      if (Number.isFinite(attributeId) && attributeId > 0) {
        attributeIds.add(Math.trunc(attributeId));
      }
    }
  }

  // Scope sweep only when compile has no monitored library rows / sync IDs.
  // Otherwise legacy duplicate Traccar rows tagged with the same config group get re-linked.
  if (!knownFromSync && monitoredLibraryItems.length === 0) {
    for (const item of notifications) {
      if (!tenantId || !matchesConfigGroupTraccarScope(item, tenantId, site, group.id)) continue;
      const notificationId = Number(item.id ?? 0);
      if (Number.isFinite(notificationId) && notificationId > 0) {
        notificationIds.add(Math.trunc(notificationId));
      }
    }

    for (const item of computedAttributes) {
      if (!tenantId || !matchesConfigGroupTraccarScope(item, tenantId, site, group.id)) continue;
      const attributeId = Number(item.id ?? 0);
      if (Number.isFinite(attributeId) && attributeId > 0) {
        attributeIds.add(Math.trunc(attributeId));
      }
    }
  }

  const extraNames = new Set(extraParameterNames.map((name) => String(name ?? "").trim()).filter(Boolean));
  for (const name of extraNames) {
    const attributeName = parameterToComputedAttributeName(name);
    const parameterLibId = parameterLibraryId(name);
    const item =
      computedAttributes.find((row) => String(row.attribute ?? "").trim() === attributeName) ??
      computedAttributes.find((row) => readViviLibraryIdFromComputedItem(row) === parameterLibId) ??
      computedAttributes.find((row) => readTraccarItemTenantId(row) === tenantId && String((row.attributes as any)?.viviParameterName ?? "") === name) ??
      null;
    const attributeId = Number(item?.id ?? 0);
    if (Number.isFinite(attributeId) && attributeId > 0) {
      attributeIds.add(Math.trunc(attributeId));
    }
  }

  return {
    attributeIds: Array.from(attributeIds),
    notificationIds: Array.from(notificationIds)
  };
}

function buildCompileAssetKey(asset: Record<string, unknown>) {
  const imei = String(asset.imei ?? "").trim();
  if (imei) return `imei:${imei}`;
  const registration = String(asset.registration ?? "").trim();
  if (registration) return `reg:${registration}`;
  const assetId = String(asset.assetId ?? asset.id ?? "").trim();
  return assetId ? `id:${assetId}` : "";
}

function buildCompileAssetLabel(asset: Record<string, unknown>) {
  const registration = String(asset.registration ?? "").trim();
  const description = String(asset.assetDescription ?? "").trim();
  const imei = String(asset.imei ?? "").trim();
  if (registration && imei) return `${registration} (${imei})`;
  return registration || description || imei || "Unnamed asset";
}

async function linkConfigGroupResourcesToDevices(
  groupAssets: any[],
  traccarGroupId: number,
  resourceIds: { attributeIds: number[]; notificationIds: number[] }
): Promise<ConfigGroupAssetCompileOutcome[]> {
  const groupId = Math.trunc(Number(traccarGroupId ?? 0));
  const compiledAt = new Date().toISOString();
  const outcomes: ConfigGroupAssetCompileOutcome[] = [];
  const deviceByImei = new Map<string, Awaited<ReturnType<typeof getTraccarDevicesDetailed>>>();

  const lookupDevice = async (imei: string) => {
    const cached = deviceByImei.get(imei);
    if (cached) return cached;
    const detailed = await getTraccarDevicesDetailed({ uniqueId: imei });
    deviceByImei.set(imei, detailed);
    return detailed;
  };

  // Serialize per-asset linking so permission POSTs do not open dozens of HTTP/2 streams.
  for (const asset of groupAssets) {
    const imei = String(asset?.imei ?? "").trim();
    const registration = String(asset?.registration ?? "").trim();
    const label = buildCompileAssetLabel(asset ?? {});
    const assetKey = buildCompileAssetKey(asset ?? {});
    const linkErrors: string[] = [];

    if (!assetKey) {
      outcomes.push({
        assetKey: `asset:${outcomes.length}`,
        label,
        imei,
        registration,
        accepted: false,
        error: "Asset has no stable identifier.",
        compiledAt
      });
      continue;
    }

    if (!imei) {
      outcomes.push({
        assetKey,
        label,
        imei,
        registration,
        accepted: false,
        error: "Missing IMEI.",
        compiledAt
      });
      continue;
    }

    try {
      const lookup = await lookupDevice(imei);
      if (lookup.unreachable) {
        outcomes.push({
          assetKey,
          label,
          imei,
          registration,
          accepted: false,
          error: lookup.error || "VIVI unreachable (retry).",
          compiledAt
        });
        continue;
      }
      const device = lookup.devices[0];
      const deviceId = Number(device?.id ?? 0);
      if (!Number.isFinite(deviceId) || deviceId <= 0) {
        outcomes.push({
          assetKey,
          label,
          imei,
          registration,
          accepted: false,
          error: "VIVI device not found.",
          compiledAt
        });
        continue;
      }

      if (groupId > 0) {
        // Assign site membership via device.groupId — Traccar no longer has tc_device_group permissions.
        const currentGroupId = Number(device?.groupId ?? 0);
        if (currentGroupId !== groupId) {
          const update = await updateTraccarDevice(deviceId, { ...device, groupId });
          if (!update.ok && update.error) linkErrors.push(`Site group assignment: ${update.error}`);
        }
      }

      // Skip pairs already linked on the device so re-compile does not POST duplicates (400 spam).
      const [linkedNotifications, linkedAttributes] = await Promise.all([
        listTraccarNotificationsForDevice(Math.trunc(deviceId)).catch(() => []),
        listTraccarComputedAttributesForDevice(Math.trunc(deviceId)).catch(() => [])
      ]);
      const linkedNotificationIds = new Set(
        linkedNotifications
          .map((item) => Math.trunc(Number(item?.id ?? 0)))
          .filter((id) => Number.isFinite(id) && id > 0)
      );
      const linkedAttributeIds = new Set(
        linkedAttributes
          .map((item) => Math.trunc(Number(item?.id ?? 0)))
          .filter((id) => Number.isFinite(id) && id > 0)
      );

      const permissionJobs: Array<{ kind: "attribute" | "notification"; id: number }> = [
        ...resourceIds.attributeIds
          .map((id) => Math.trunc(id))
          .filter((id) => Number.isFinite(id) && id > 0 && !linkedAttributeIds.has(id))
          .map((id) => ({ kind: "attribute" as const, id })),
        ...resourceIds.notificationIds
          .map((id) => Math.trunc(id))
          .filter((id) => Number.isFinite(id) && id > 0 && !linkedNotificationIds.has(id))
          .map((id) => ({ kind: "notification" as const, id }))
      ];
      const permissionResults = await mapPool(permissionJobs, 2, async (job) => {
        if (job.kind === "attribute") {
          return grantTraccarPermission({
            deviceId: Math.trunc(deviceId),
            attributeId: Math.trunc(job.id)
          }).then((link) =>
            !link.ok && link.error ? `Attribute ${job.id}: ${link.error}` : ""
          );
        }
        return grantTraccarPermission({
          deviceId: Math.trunc(deviceId),
          notificationId: Math.trunc(job.id)
        }).then((link) =>
          !link.ok && link.error ? `Notification ${job.id}: ${link.error}` : ""
        );
      });
      for (const message of permissionResults) {
        if (message) linkErrors.push(message);
      }

      outcomes.push({
        assetKey,
        label,
        imei,
        registration,
        accepted: linkErrors.length === 0,
        error: linkErrors.length ? linkErrors.join("; ") : undefined,
        compiledAt
      });
    } catch (err: any) {
      outcomes.push({
        assetKey,
        label,
        imei,
        registration,
        accepted: false,
        error: String(err?.message ?? err),
        compiledAt
      });
    }
  }

  return outcomes;
}

export async function attachConfigGroupTraccarResources(
  group: ConfigGroupRecord,
  traccarGroupId: number,
  options?: { extraParameterNames?: string[] }
): Promise<{ ok: boolean; attached: number; errors: string[] }> {
  const tenantId = readActiveTenantId();
  const site = String(group.site ?? "").trim();
  const groupId = Math.trunc(Number(traccarGroupId ?? 0));
  if (!tenantId || !site || groupId <= 0) {
    // Site group is assigned on the device during link. Missing mapping must not fail compile.
    return { ok: true, attached: 0, errors: [] };
  }

  const resourceIds = await collectConfigGroupTraccarResourceIds(
    group,
    options?.extraParameterNames ?? []
  );

  // Notifications and computed attributes are linked to each device in linkConfigGroupResourcesToDevices.
  // Traccar does not accept groupId + notificationId or groupId + attributeId permission pairs.
  const scheduled =
    resourceIds.notificationIds.length + resourceIds.attributeIds.length;
  return { ok: true, attached: scheduled, errors: [] };
}

/** @deprecated Prefer attachConfigGroupTraccarResources for configuration-group scoped assets */
export async function attachTenantComputedAttributesToSiteGroup(
  tenantId: string,
  site: string,
  traccarGroupId: number
): Promise<{ ok: boolean; attached: number; errors: string[] }> {
  const groupId = Math.trunc(Number(traccarGroupId ?? 0));
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return {
      ok: false,
      attached: 0,
      errors: [`No VIVI group is mapped for site "${site}". Link the site in the organisation ribbon first.`]
    };
  }

  const computedAttributes = await getTraccarComputedAttributes();
  const tenantAttributes = computedAttributes.filter((item) => {
    const itemTenant = readTraccarItemTenantId(item);
    return !itemTenant || itemTenant === tenantId;
  });

  let attached = 0;
  const errors: string[] = [];

  // Computed attributes must be linked per device (deviceId + attributeId), not to the site group alone.
  void tenantAttributes;
  void groupId;

  return { ok: true, attached: 0, errors: [] };
}

function collectParameterNamesFromDeviceBinding(binding: DeviceBindingRecord): string[] {
  const names = new Set<string>();
  for (const line of binding.lines ?? []) {
    if (!line?.connected) continue;
    const analog = String(line.analogInput ?? "").trim();
    if (analog) names.add(analog);
    const parameter = String(line.parameter ?? "").trim();
    if (parameter) names.add(parameter);
  }
  return Array.from(names);
}

function collectParameterNamesFromLibraryItems(items: NotificationRow[]): string[] {
  const names = new Set<string>();
  for (const row of items) {
    const conditions = Array.isArray(row.parameters?.conditions) ? row.parameters!.conditions! : [];
    for (const condition of conditions) {
      const field = String(condition?.field ?? "").trim();
      if (!field) continue;
      if (mapParameterFieldToJexl(field)) names.add(field);
    }
  }
  return Array.from(names);
}

function enrichDeviceBindingPayloadWithFuelSettings(
  payload: ReturnType<typeof buildDeviceBindingPayload>,
  notificationBinding: NotificationBindingRecord | null,
  deviceBinding: DeviceBindingRecord,
  libraryItems: NotificationRow[]
) {
  if (!notificationBinding) return payload;
  const monitored = Array.isArray(notificationBinding.monitoredEvents) ? notificationBinding.monitoredEvents : [];
  for (const description of monitored) {
    const libraryItem = findLibraryItem(libraryItems, description);
    if (!libraryItem || !readFuelComputeSettingsFromNotification(libraryItem)) continue;
    const settings = readFuelComputeSettingsFromNotification(libraryItem);
    if (!settings) continue;
    const fuelLine = resolveFuelAnalogLineFromDeviceBinding(deviceBinding);
    const analogInput = resolveFuelInputFromDeviceBinding(deviceBinding);
    const mvRange = readFuelAnalogMvRangeFromLine(fuelLine);
    const capRange = readFuelTankCapacityRangeFromLine(fuelLine);
    const maxCapacity = capRange.maxCapacity || String(settings.tankCapacity ?? "").trim();
    const attrs = payload.traccarAttributes as Record<string, unknown>;
    attrs.viviFuelComputeEnabled = true;
    attrs.viviFuelTankCapacity = maxCapacity;
    attrs.viviFuelOutputAttribute = String(settings.outputAttribute ?? "fuelLevel").trim();
    if (analogInput) attrs.viviFuelAnalogInput = analogInput;
    if (mvRange.minMv !== "") attrs.viviFuelAnalogMvMin = mvRange.minMv;
    if (mvRange.maxMv !== "") attrs.viviFuelAnalogMvMax = mvRange.maxMv;
    if (capRange.minCapacity) attrs.viviFuelTankCapacityMin = capRange.minCapacity;
    if (capRange.maxCapacity) attrs.viviFuelTankCapacityMax = capRange.maxCapacity;
    const calibration = serializeFuelCalibration(fuelLine?.fuelCalibration);
    if (calibration) attrs.viviFuelCalibration = calibration;
    const lineLabel = resolveFuelInputLineLabel(deviceBinding);
    if (lineLabel) attrs.viviFuelInputLine = lineLabel;
  }
  return payload;
}

function buildDeviceBindingPayload(binding: DeviceBindingRecord, group: ConfigGroupRecord) {
  const siteName = String(group.site ?? "").trim();
  const traccarAttributes: Record<string, unknown> = {
    viviConfigGroupId: group.id,
    viviConfigGroupName: group.name,
    viviSite: siteName,
    viviDeviceBindingId: binding.id,
    viviDeviceBindingName: binding.name
  };

  for (const line of binding.lines ?? []) {
    const canLineId = String(line.id ?? "").trim().toLowerCase();
    if ((canLineId === "c1" || canLineId === "c2") && line.canEnabled) {
      const protocol = String(line.canProtocol ?? "").trim();
      traccarAttributes.viviCanEnabled = true;
      if (protocol) {
        traccarAttributes.viviCanProtocol = protocol;
        traccarAttributes[`viviCanProtocol.${canLineId}`] = protocol;
      }
      traccarAttributes.viviCanLine = canLineId.toUpperCase();
      // Keep scanning other CAN lines; both C1 and C2 may be enabled.
    }
    if (!line?.connected) continue;
    if (String(line.id ?? "").trim().toLowerCase() === "bt") {
      const btId = String(line.bluetoothTraccarDeviceId ?? "").trim();
      if (btId) {
        traccarAttributes.viviBluetoothTraccarDeviceId = btId;
        const btName = String(line.bluetoothTraccarDeviceName ?? "").trim();
        if (btName) traccarAttributes.viviBluetoothTraccarDeviceName = btName;
      }
      continue;
    }
    if (String(line.id ?? "").trim().toLowerCase() === "rpm") {
      const analog = String(line.analogInput ?? line.parameter ?? "").trim();
      if (analog) traccarAttributes.viviRpmAnalogInput = analog;
      const mvMin = String(line.analogMvMin ?? "").trim();
      const mvMax = String(line.analogMvMax ?? "").trim();
      if (mvMin) traccarAttributes.viviRpmAnalogMvMin = mvMin;
      if (mvMax) traccarAttributes.viviRpmAnalogMvMax = mvMax;
      const rpmMin = String(line.rpmMin ?? "").trim();
      const rpmMax = String(line.rpmMax ?? "").trim();
      const rpmScale = String(line.rpmScale ?? "").trim();
      if (rpmMin) traccarAttributes.viviRpmMin = rpmMin;
      if (rpmMax) traccarAttributes.viviRpmMax = rpmMax;
      if (rpmScale) traccarAttributes.viviRpmScale = rpmScale;
      continue;
    }
    const fuelLineId = String(line.id ?? "").trim().toLowerCase();
    if (fuelLineId === "fuel" || fuelLineId === "f1i3" || fuelLineId === "f2i4") {
      const analog = String(line.analogInput ?? line.parameter ?? "").trim();
      const maxCapacity = String(line.tankCapacityMax ?? "").trim();
      const mvMin = String(line.analogMvMin ?? "").trim();
      const mvMax = String(line.analogMvMax ?? "").trim();
      if (analog) traccarAttributes.viviFuelAnalogInput = analog;
      if (maxCapacity) {
        traccarAttributes.viviFuelTankCapacity = maxCapacity;
        traccarAttributes.viviFuelTankCapacityMax = maxCapacity;
        traccarAttributes.viviFuelComputeEnabled = true;
        traccarAttributes.viviFuelOutputAttribute = "fuelLevel";
      }
      if (mvMin) traccarAttributes.viviFuelAnalogMvMin = mvMin;
      if (mvMax) traccarAttributes.viviFuelAnalogMvMax = mvMax;
      const minCapacity = String(line.tankCapacityMin ?? "").trim();
      if (minCapacity) traccarAttributes.viviFuelTankCapacityMin = minCapacity;
      const calibration = serializeFuelCalibration(line.fuelCalibration);
      if (calibration) traccarAttributes.viviFuelCalibration = calibration;
      if (analog || maxCapacity || calibration) {
        traccarAttributes.viviFuelInputLine = String(line.line ?? fuelLineId).trim() || fuelLineId;
      }
    }
    const parameter = String(line.analogInput ?? line.parameter ?? "").trim();
    if (!parameter) continue;
    const key = parameterToAttributeKey(parameter);
    traccarAttributes[key] = parameter;
    traccarAttributes[`${key}_connection`] = String(line.connection ?? "").trim();
    traccarAttributes[`${key}_wire`] = String(line.wire ?? "").trim();
  }

  return {
    viviSource: "device-binding",
    viviConfigGroupId: group.id,
    viviConfigGroupName: group.name,
    viviSite: group.site,
    viviDeviceBindingId: binding.id,
    viviDeviceBindingName: binding.name,
    viviDeviceType: String(binding.deviceType ?? "").trim(),
    lines: binding.lines ?? [],
    advancedSettings: binding.advancedSettings ?? {},
    gsmSettings: binding.gsmSettings ?? {},
    traccarAttributes
  };
}

function resolveGeofenceIdFromLocationEntry(
  entry: { id?: string; name?: string },
  geofences: Array<{ id?: number; name?: string; attributes?: Record<string, unknown> }>
): number | null {
  const rawId = String(entry.id ?? "").trim();
  const numericId = Number(rawId);
  if (Number.isFinite(numericId) && numericId > 0) {
    const matched = geofences.find((row) => Number(row.id ?? 0) === Math.trunc(numericId));
    if (matched) return Math.trunc(numericId);
  }
  // GPS IoT GeoID stored on binding entry id / attributes.
  if (rawId) {
    const byGeo = geofences.find((row) => {
      const geo = String(row.attributes?.gpsIotGeoId ?? row.attributes?.viviGpsIotGeofenceId ?? "").trim();
      return geo && geo === rawId;
    });
    const candidate = Number(byGeo?.id ?? 0);
    if (Number.isFinite(candidate) && candidate > 0) return Math.trunc(candidate);
  }
  const name = String(entry.name ?? rawId ?? "").trim();
  if (!name) return null;
  const matched = geofences.find((row) => normalize(String(row.name ?? "")) === normalize(name));
  const candidate = Number(matched?.id ?? 0);
  return Number.isFinite(candidate) && candidate > 0 ? Math.trunc(candidate) : null;
}

function readLocationSpeedKph(settings: Record<string, unknown>): number {
  const overSpeedKph = Number(settings.overSpeedKph ?? 0);
  const bufferKph = Number(settings.bufferKph ?? 0);
  if (!Number.isFinite(overSpeedKph) || overSpeedKph <= 0) return 0;
  const buffer = Number.isFinite(bufferKph) && bufferKph > 0 ? bufferKph : 0;
  return overSpeedKph + buffer;
}

async function ensureLocationOverspeedNotification(
  binding: LocationBindingRecord,
  geofenceId: number,
  geofenceName: string,
  speedKph: number,
  buzzerEnabled: boolean
): Promise<number | null> {
  if (!Number.isFinite(speedKph) || speedKph <= 0) return null;
  const markerId = `vivi:loc-binding:${binding.id}:geo:${geofenceId}:overspeed`;
  const notifications = await getTraccarNotifications();
  for (const row of notifications) {
    const attrs = row.attributes && typeof row.attributes === "object" ? row.attributes : {};
    if (String((attrs as any).viviLocationOverspeedMarker ?? "").trim() !== markerId) continue;
    const notificationId = Math.trunc(Number(row.id ?? 0));
    if (notificationId > 0) {
      const result = await deleteTraccarNotification(notificationId);
      if (!result.ok && result.status !== 404) {
        throw new Error(result.error || `Unable to refresh overspeed notification for "${geofenceName}".`);
      }
    }
  }

  const result = await createTraccarNotification({
    type: "deviceOverspeed",
    description: `${binding.name} - ${geofenceName} overspeed`,
    always: false,
    commandId: 0,
    calendarId: 0,
    notificators: buzzerEnabled ? "web,command" : "web",
    attributes: {
      viviLocationOverspeedMarker: markerId,
      viviLocationBindingId: binding.id,
      viviLocationBindingName: binding.name,
      viviTenantId: readActiveTenantId(),
      viviGeofenceId: geofenceId,
      viviBuzzerEnabled: buzzerEnabled,
      viviSpeedKph: speedKph
    }
  });
  if (!result.ok) {
    throw new Error(result.error || `Unable to create overspeed notification for "${geofenceName}".`);
  }
  const notificationId = Math.trunc(Number(result.body?.id ?? 0));
  return notificationId > 0 ? notificationId : null;
}

async function syncLocationBindingForConfigGroup(
  group: ConfigGroupRecord,
  binding: LocationBindingRecord,
  _traccarGroupId: number,
  groupAssets: any[]
): Promise<{ ok: boolean; linked: number; errors: string[] }> {
  const entries = Array.isArray(binding.locationsConfig) ? binding.locationsConfig : [];
  if (!entries.length) {
    return {
      ok: false,
      linked: 0,
      errors: [`Location binding "${binding.name}" has no locations configured.`]
    };
  }

  const bindingSite = String(group.site ?? binding.site ?? "").trim();
  const activeSite = readActiveSiteName();
  if (bindingSite && activeSite && !sitesEquivalent(bindingSite, activeSite)) {
    return {
      ok: false,
      linked: 0,
      errors: [`Location binding "${binding.name}" belongs to site "${bindingSite}", not active "${activeSite}".`]
    };
  }

  // UK GPS IoT: no Traccar geofences / permissions — site library + binding only.
  if (isGpsIotServer()) {
    const managedGeofences = await loadLocationGeofences();
    const errors: string[] = [];
    let linked = 0;
    for (const entry of entries) {
      const label = String(entry.name ?? entry.id ?? "").trim() || "location";
      const managed = managedGeofences.find(
        (row) =>
          (row.gpsIotGeoId && String(entry.id ?? "") === row.gpsIotGeoId)
          || normalize(String(row.name ?? "")) === normalize(label)
          || String(row.id ?? "") === String(entry.id ?? "")
      );
      if (!managed) {
        errors.push(`Geofence "${label}" was not found for site "${activeSite || bindingSite}".`);
        continue;
      }
      if (String(managed.site ?? "").trim() && activeSite
        && !sitesEquivalent(String(managed.site), activeSite)) {
        errors.push(`Geofence "${label}" belongs to another site.`);
        continue;
      }
      const settings =
        entry.settings && typeof entry.settings === "object"
          ? (entry.settings as Record<string, unknown>)
          : {};
      const speedKph = readLocationSpeedKph(settings);
      linked += 1;
      if (speedKph > 0) {
        try {
          await saveLocationGeofence(
            {
              ...managed,
              site: activeSite || managed.site,
              speed: String(speedKph),
              attributes: {
                ...(managed.attributes ?? {}),
                viviSpeed: String(speedKph),
                viviBufferKph: String(settings.bufferKph ?? 0),
                viviLocationBindingId: binding.id,
                viviLocationBindingName: binding.name,
                viviSite: activeSite || managed.site
              }
            },
            { libraryOnly: true }
          );
        } catch (err: any) {
          errors.push(`${label}: ${String(err?.message ?? err)}`);
        }
      }
    }
    return { ok: errors.length === 0, linked, errors };
  }

  const geofences = await listTraccarGeofenceDefinitions();
  const managedGeofences = await loadLocationGeofences();
  const deviceBindings = await getBindings<DeviceBindingRecord>("devices");
  const deviceBinding = resolveBindingByRef(
    deviceBindings,
    String(group.deviceBinding ?? ""),
    String(group.site ?? binding.site ?? "")
  );
  const buzzerEnabled = Boolean(deviceBinding?.advancedSettings?.buzzerEnabled ?? true);
  const geofenceIds = new Set<number>();
  const overspeedNotificationIds = new Set<number>();
  const compiledLocationSettings: Array<{
    geofenceId: number;
    name: string;
    settings: Record<string, unknown>;
  }> = [];
  const errors: string[] = [];

  for (const entry of entries) {
    const geofenceId = resolveGeofenceIdFromLocationEntry(entry, geofences);
    if (!geofenceId) {
      const label = String(entry.name ?? entry.id ?? "").trim() || "location";
      errors.push(`Geofence "${label}" was not found in VIVI.`);
      continue;
    }
    geofenceIds.add(geofenceId);
    const settings =
      entry.settings && typeof entry.settings === "object"
        ? (entry.settings as Record<string, unknown>)
        : {};
    const speedKph = readLocationSpeedKph(settings);
    const label = String(entry.name ?? entry.id ?? geofenceId).trim() || "location";
    const managed = managedGeofences.find(
      (row) =>
        Number(row.traccarId ?? row.id) === geofenceId
        || normalize(String(row.name ?? "")) === normalize(label)
        || (row.gpsIotGeoId && String(entry.id ?? "") === row.gpsIotGeoId)
    );
    if (managed && speedKph > 0) {
      try {
        await saveLocationGeofence({
          ...managed,
          speed: String(speedKph),
          attributes: {
            ...(managed.attributes ?? {}),
            viviSpeed: String(speedKph),
            viviBufferKph: String(settings.bufferKph ?? 0),
            viviLocationBindingId: binding.id,
            viviLocationBindingName: binding.name,
            viviBuzzerEnabled: buzzerEnabled
          }
        });
        const notificationId = await ensureLocationOverspeedNotification(
          binding,
          geofenceId,
          label,
          speedKph,
          buzzerEnabled
        );
        if (notificationId) overspeedNotificationIds.add(notificationId);
      } catch (err: any) {
        errors.push(`${label}: ${String(err?.message ?? err)}`);
      }
    }
    compiledLocationSettings.push({
      geofenceId,
      name: label,
      settings
    });
  }

  let linked = 0;
  for (const asset of groupAssets) {
    const imei = String(asset?.imei ?? "").trim();
    if (!imei) continue;
    try {
      const devices = await getTraccarDevices({ uniqueId: imei });
      const deviceId = Number(devices[0]?.id ?? 0);
      if (!Number.isFinite(deviceId) || deviceId <= 0) continue;
      for (const geofenceId of geofenceIds) {
        const deviceResult = await grantTraccarPermission({
          deviceId: Math.trunc(deviceId),
          geofenceId
        });
        if (deviceResult.ok) linked += 1;
        else if (deviceResult.error) errors.push(`${imei} geofence ${geofenceId}: ${deviceResult.error}`);
      }
      for (const notificationId of overspeedNotificationIds) {
        const notificationResult = await grantTraccarPermission({
          deviceId: Math.trunc(deviceId),
          notificationId
        });
        if (!notificationResult.ok && notificationResult.error) {
          errors.push(`${imei} overspeed notification ${notificationId}: ${notificationResult.error}`);
        }
      }
      const existingAttrs =
        devices[0]?.attributes && typeof devices[0].attributes === "object"
          ? (devices[0].attributes as Record<string, unknown>)
          : {};
      const update = await updateTraccarDevice(deviceId, {
        ...devices[0],
        attributes: {
          ...existingAttrs,
          viviLocationBindingId: binding.id,
          viviLocationBindingName: binding.name,
          viviLocationBindingSite: group.site,
          viviLocationSettings: JSON.stringify(compiledLocationSettings)
        }
      });
      if (!update.ok && update.error) errors.push(`${imei} location settings: ${update.error}`);
    } catch (err: any) {
      errors.push(`${imei} geofence link: ${String(err?.message ?? err)}`);
    }
  }

  return { ok: errors.length === 0, linked, errors };
}

async function linkConfigGroupDevicesToTraccarSiteGroup(
  groupAssets: any[],
  traccarGroupId: number
): Promise<{ ok: boolean; linked: number; errors: string[] }> {
  const groupId = Math.trunc(Number(traccarGroupId ?? 0));
  if (groupId <= 0) return { ok: true, linked: 0, errors: [] };

  let linked = 0;
  const errors: string[] = [];

  for (const asset of groupAssets) {
    const imei = String(asset?.imei ?? "").trim();
    if (!imei) continue;
    try {
      const devices = await getTraccarDevices({ uniqueId: imei });
      const device = devices[0];
      const deviceId = Number(device?.id ?? 0);
      if (!Number.isFinite(deviceId) || deviceId <= 0) {
        errors.push(`${String(asset?.registration ?? imei)}: VIVI device not found.`);
        continue;
      }

      const permission = await grantTraccarPermission({
        deviceId: Math.trunc(deviceId),
        groupId
      });
      if (permission.ok) linked += 1;
      else if (permission.error) errors.push(`${imei}: ${permission.error}`);

      const currentGroupId = Number(device?.groupId ?? 0);
      if (currentGroupId !== groupId) {
        const update = await updateTraccarDevice(deviceId, { ...device, groupId });
        if (!update.ok && update.error) errors.push(`${imei} site group: ${update.error}`);
      }
    } catch (err: any) {
      errors.push(`${imei}: ${String(err?.message ?? err)}`);
    }
  }

  return { ok: errors.length === 0, linked, errors };
}

export async function syncDeviceBindingForConfigGroup(
  group: ConfigGroupRecord,
  binding: DeviceBindingRecord,
  assets?: any[],
  options?: { notificationBinding?: NotificationBindingRecord | null; libraryItems?: NotificationRow[] }
): Promise<{
  ok: boolean;
  pushed: number;
  traccarUpdated: number;
  failed: number;
  errors: string[];
  assetOutcomes: ConfigGroupAssetCompileOutcome[];
}> {
  const site = String(group.site ?? "").trim();
  const libraryItems = options?.libraryItems ?? (await loadNotificationLibraryItemsForSite(site));
  const payloadTemplate = enrichDeviceBindingPayloadWithFuelSettings(
    buildDeviceBindingPayload(binding, group),
    options?.notificationBinding ?? null,
    binding,
    libraryItems
  );
  const groupAssets = listConfigGroupSiteAssets(group, assets ?? (await getAssetsFromApi<any>()));
  const deviceType = String(binding.deviceType ?? "").trim().toLowerCase();
  const compiledAt = new Date().toISOString();
  const bindingAttrs =
    payloadTemplate.traccarAttributes && typeof payloadTemplate.traccarAttributes === "object"
      ? (payloadTemplate.traccarAttributes as Record<string, unknown>)
      : {};

  let pushed = 0;
  let traccarUpdated = 0;
  let failed = 0;
  const errors: string[] = [];
  const assetOutcomes: ConfigGroupAssetCompileOutcome[] = [];

  // UK GPS IoT: push compiled binding parameters onto each site asset (no Traccar / Teltonika OTA).
  if (isGpsIotServer()) {
    const fuelLine = resolveFuelAnalogLineFromDeviceBinding(binding);
    const capacityRange = readFuelTankCapacityRangeFromLine(fuelLine);
    const calibration = serializeFuelCalibration(fuelLine?.fuelCalibration);
    const chartPeak =
      hasUsableFuelCalibration(fuelLine?.fuelCalibration)
        ? peakFuelCalibrationLiters(fuelLine?.fuelCalibration)
        : undefined;
    const fuelTankCapacity =
      String(capacityRange.maxCapacity || bindingAttrs.viviFuelTankCapacity || "").trim()
      || (typeof chartPeak === "number" && chartPeak > 0 ? String(chartPeak) : "");

    for (const asset of groupAssets) {
      const imei = String(asset?.imei ?? "").trim();
      const registration = String(asset?.registration ?? "").trim();
      const label = buildCompileAssetLabel(asset ?? {});
      const assetKey = buildCompileAssetKey(asset ?? {});
      const assetSite = String(asset?.site ?? "").trim();

      if (assetSite && site && !sitesEquivalent(assetSite, site)) {
        continue;
      }

      if (!assetKey || !imei) {
        failed += 1;
        const message = !imei
          ? `${registration || asset?.id || "asset"}: missing IMEI`
          : `${label}: missing stable asset key`;
        errors.push(message);
        assetOutcomes.push({
          assetKey: assetKey || `asset:${assetOutcomes.length}`,
          label,
          imei,
          registration,
          accepted: false,
          error: message,
          compiledAt
        });
        continue;
      }

      const assetDevice = String(asset?.mobileDevice ?? asset?.model ?? "").trim().toLowerCase();
      if (deviceType && assetDevice && assetDevice !== deviceType) {
        assetOutcomes.push({
          assetKey,
          label,
          imei,
          registration,
          accepted: false,
          error: `Device type mismatch (binding ${binding.deviceType}, asset ${asset.mobileDevice || asset.model}).`,
          compiledAt
        });
        failed += 1;
        continue;
      }

      const existingAttrs =
        asset?.attributes && typeof asset.attributes === "object"
          ? (asset.attributes as Record<string, unknown>)
          : {};
      const nextAttrs = {
        ...existingAttrs,
        ...bindingAttrs,
        viviCompiledAt: compiledAt,
        viviConfigGroupId: String(group.id ?? "").trim(),
        viviConfigGroupName: String(group.name ?? "").trim(),
        viviDeviceBindingId: String(binding.id ?? "").trim(),
        viviDeviceBindingName: String(binding.name ?? "").trim(),
        viviSite: site
      };

      const payload = {
        ...asset,
        site: site || assetSite,
        configGroup: String(group.id ?? "").trim() || String(group.name ?? "").trim(),
        configurationGroup: String(group.name ?? "").trim() || String(group.id ?? "").trim(),
        ...(fuelTankCapacity ? { fuelTankCapacity } : {}),
        ...(String(binding.deviceType ?? "").trim()
          ? {
              mobileDevice: String(binding.deviceType).trim(),
              model: String(asset?.model ?? binding.deviceType).trim() || String(binding.deviceType).trim()
            }
          : {}),
        attributes: nextAttrs,
        ...(calibration ? { viviFuelCalibration: calibration } : {}),
        ...(String(bindingAttrs.viviFuelAnalogInput ?? "").trim()
          ? { viviFuelAnalogInput: String(bindingAttrs.viviFuelAnalogInput).trim() }
          : {}),
        ...(String(bindingAttrs.viviFuelAnalogMvMin ?? "").trim()
          ? { viviFuelAnalogMvMin: String(bindingAttrs.viviFuelAnalogMvMin).trim() }
          : {}),
        ...(String(bindingAttrs.viviFuelAnalogMvMax ?? "").trim()
          ? { viviFuelAnalogMvMax: String(bindingAttrs.viviFuelAnalogMvMax).trim() }
          : {}),
        ...(String(bindingAttrs.viviCanProtocol ?? "").trim()
          ? { viviCanProtocol: String(bindingAttrs.viviCanProtocol).trim() }
          : {}),
        configUploadDate: compiledAt
      };

      const result = await upsertAssetDetailed(payload);
      if (result.stored) {
        pushed += 1;
        asset.configGroup = payload.configGroup;
        asset.configurationGroup = payload.configurationGroup;
        if (fuelTankCapacity) asset.fuelTankCapacity = fuelTankCapacity;
        asset.attributes = nextAttrs;
        asset.configUploadDate = compiledAt;
        assetOutcomes.push({
          assetKey,
          label,
          imei,
          registration,
          accepted: true,
          compiledAt
        });
      } else {
        failed += 1;
        const message = `${imei}: ${result.error ?? "Failed to push compiled settings to asset"}`;
        errors.push(message);
        assetOutcomes.push({
          assetKey,
          label,
          imei,
          registration,
          accepted: false,
          error: message,
          compiledAt
        });
      }
    }

    // Persist site-scoped compiled parameters so they stay on assets after GPS IoT list refresh.
    try {
      const previous =
        (await loadScopedFromApi<{ byImei?: Record<string, Record<string, unknown>> }>(
          "fleet:compiled-asset-settings",
          site
        )) ?? {};
      const byImei: Record<string, Record<string, unknown>> = {
        ...(previous.byImei && typeof previous.byImei === "object" ? previous.byImei : {})
      };
      for (const outcome of assetOutcomes) {
        if (!outcome.accepted || !outcome.imei) continue;
        const asset = groupAssets.find((row) => String(row?.imei ?? "").trim() === outcome.imei);
        if (!asset) continue;
        byImei[outcome.imei] = {
          site,
          configGroup: asset.configGroup,
          configurationGroup: asset.configurationGroup,
          fuelTankCapacity: asset.fuelTankCapacity,
          viviFuelCalibration: asset.viviFuelCalibration,
          viviFuelAnalogInput: asset.viviFuelAnalogInput,
          viviFuelAnalogMvMin: asset.viviFuelAnalogMvMin,
          viviFuelAnalogMvMax: asset.viviFuelAnalogMvMax,
          viviCanProtocol: asset.viviCanProtocol,
          attributes: asset.attributes,
          configUploadDate: asset.configUploadDate || compiledAt,
          mobileDevice: asset.mobileDevice
        };
      }
      await saveScopedToApi(
        "fleet:compiled-asset-settings",
        { byImei, updatedAt: compiledAt },
        site
      );
    } catch {
      // Overlay persistence is best-effort; GPS IoT UpdateAsset already received tank capacity.
    }

    return {
      ok: failed === 0 && assetOutcomes.length > 0,
      pushed,
      traccarUpdated: pushed,
      failed,
      errors,
      assetOutcomes
    };
  }

  for (const asset of groupAssets) {
    const imei = String(asset?.imei ?? "").trim();
    const registration = String(asset?.registration ?? "").trim();
    const label = buildCompileAssetLabel(asset ?? {});
    const assetKey = buildCompileAssetKey(asset ?? {});
    if (!imei) {
      failed += 1;
      errors.push(`${String(asset?.registration ?? asset?.id ?? "asset")}: missing IMEI`);
      assetOutcomes.push({
        assetKey: assetKey || `asset:${assetOutcomes.length}`,
        label,
        imei,
        registration,
        accepted: false,
        error: "Missing IMEI.",
        compiledAt
      });
      continue;
    }

    const assetDevice = String(asset?.mobileDevice ?? asset?.model ?? "").trim().toLowerCase();
    if (deviceType && assetDevice && assetDevice !== deviceType) {
      continue;
    }

    const push = await pushDeviceSettings(imei, payloadTemplate);
    if (push.queued) pushed += 1;
    else {
      failed += 1;
      if (push.error) errors.push(`${imei}: ${push.error}`);
    }

    let deviceAccepted = false;
    let deviceError = "";
    try {
      const devices = await getTraccarDevices({ uniqueId: imei });
      const device = devices[0];
      const deviceId = Number(device?.id ?? 0);
      if (!Number.isFinite(deviceId) || deviceId <= 0) {
        deviceError = "VIVI device not found.";
      } else {
        const existingAttrs =
          device?.attributes && typeof device.attributes === "object"
            ? (device.attributes as Record<string, unknown>)
            : {};
        const mergedAttrs = {
          ...existingAttrs,
          ...bindingAttrs
        };

        const update = await updateTraccarDevice(deviceId, {
          ...device,
          model: String(binding.deviceType ?? device?.model ?? "").trim() || device?.model,
          attributes: mergedAttrs
        });
        if (update.ok) {
          traccarUpdated += 1;
          deviceAccepted = true;
        } else if (update.error) {
          deviceError = update.error;
          errors.push(`${imei} VIVI: ${update.error}`);
        }
      }
    } catch (err: any) {
      deviceError = String(err?.message ?? err);
      errors.push(`${imei} VIVI: ${deviceError}`);
    }

    assetOutcomes.push({
      assetKey: assetKey || `imei:${imei}`,
      label,
      imei,
      registration,
      accepted: deviceAccepted || push.queued,
      error: deviceAccepted || push.queued ? undefined : (deviceError || push.error || "Push failed"),
      compiledAt
    });
  }

  return { ok: failed === 0, pushed, traccarUpdated, failed, errors, assetOutcomes };
}

function findLibraryItem(items: NotificationRow[], description: string): NotificationRow | null {
  const resolved = resolveMonitoredEventDescription(items, description);
  if (resolved) {
    return items.find((row) => String(row.description ?? "").trim() === resolved) ?? null;
  }
  const key = normalize(toCanonicalNotificationDescription(description));
  return (
    items.find((row) => normalize(toCanonicalNotificationDescription(row.description)) === key)
    ?? items.find((row) => normalize(row.description) === normalize(description))
    ?? null
  );
}

async function loadParameterCatalog(): Promise<ParameterCatalogRow[]> {
  const stored = await loadFromApi<{
    items?: Array<{ name?: string; type?: string; units?: string; availability?: string }>;
    overrides?: Record<string, { name?: string; type?: string; units?: string; availability?: string }>;
  }>("libraries:parameters");
  const items = Array.isArray(stored?.items) ? stored.items : [];
  const overrides = stored?.overrides ?? {};
  const catalog: ParameterCatalogRow[] = [];

  for (const row of items) {
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const override = overrides[name] ?? {};
    catalog.push({
      name: String(override.name ?? name).trim(),
      type: String(override.type ?? row.type ?? "").trim(),
      units: String(override.units ?? row.units ?? "").trim(),
      availability: String(override.availability ?? row.availability ?? "").trim()
    });
  }

  return catalog;
}

function readTraccarViviLibraryId(item: {
  attributes?: Record<string, unknown>;
  description?: string;
}): string {
  const attrs = item?.attributes;
  if (attrs && typeof attrs === "object") {
    const fromAttrs = String((attrs as any).viviLibraryId ?? "").trim();
    if (fromAttrs) return fromAttrs;
  }
  return readViviLibraryIdFromComputedItem(item);
}

function traccarItemBelongsToNotificationBinding(
  item: { attributes?: Record<string, unknown>; description?: string },
  tenantId: string,
  bindingId: string
): boolean {
  if (readTraccarItemTenantId(item) !== tenantId) return false;
  const libraryId = readTraccarViviLibraryId(item);
  if (libraryId.startsWith("vivi:")) {
    const scoped = parseViviScopedLibraryId(libraryId);
    return scoped?.bindingId === bindingId;
  }
  return readTraccarItemBindingId(item) === bindingId;
}

export async function resolveDeviceBindingForNotificationBinding(
  binding: NotificationBindingRecord
): Promise<DeviceBindingRecord | null> {
  const site = String(binding.site ?? readActiveSiteName()).trim();
  if (!site) return null;

  const configGroups = await getConfigurationGroups<ConfigGroupRecord>();
  const bindingRefs = [binding.id, binding.name].filter(Boolean);
  const linkedGroup = (configGroups ?? []).find(
    (group) =>
      matchesRef(String(group.notificationBinding ?? ""), bindingRefs) &&
      normalize(String(group.site ?? "")) === normalize(site)
  );
  const deviceRef = String(linkedGroup?.deviceBinding ?? "").trim();
  if (!deviceRef) return null;

  const deviceBindings = await getBindings<DeviceBindingRecord>("devices");
  return resolveBindingByRef(deviceBindings, deviceRef, site);
}

/** Remove legacy per-site Traccar copies; library definitions are tenant-global. */
async function deleteLegacyScopedTraccarResourcesForBinding(bindingId: string, tenantId: string) {
  const [notifications, computedAttributes] = await Promise.all([
    getTraccarNotifications(),
    getTraccarComputedAttributes()
  ]);

  for (const item of notifications) {
    if (!traccarItemBelongsToNotificationBinding(item, tenantId, bindingId)) continue;
    const libraryId = readTraccarViviLibraryId(item);
    if (!libraryId.startsWith("vivi:")) continue;
    const id = Number(item.id ?? 0);
    if (id > 0) await deleteTraccarNotification(id);
  }

  for (const item of computedAttributes) {
    if (!traccarItemBelongsToNotificationBinding(item, tenantId, bindingId)) continue;
    const libraryId = readTraccarViviLibraryId(item);
    if (!libraryId.startsWith("vivi:")) continue;
    const id = Number(item.id ?? 0);
    if (id > 0) await deleteTraccarComputedAttribute(id);
  }
}

export async function syncNotificationBindingToTraccar(
  binding: NotificationBindingRecord,
  options?: { deviceBinding?: DeviceBindingRecord | null; configGroupId?: string; site?: string }
): Promise<{
  ok: boolean;
  synced: number;
  failed: number;
  scopes: number;
  errors: string[];
  notificationIds: number[];
  attributeIds: number[];
  libraryItemsWithIds: NotificationRow[];
}> {
  const tenantId = readActiveTenantId();
  if (!tenantId || !isDatabaseTenant(tenantId)) {
    return {
      ok: false,
      synced: 0,
      failed: 0,
      scopes: 0,
      errors: ["Select a database before syncing bindings."],
      notificationIds: [],
      attributeIds: [],
      libraryItemsWithIds: []
    };
  }

  const bindingSite = String(options?.site ?? binding.site ?? readActiveSiteName()).trim();
  const libraryItems = await loadNotificationLibraryItemsForSite(bindingSite);
  const monitoredEvents = Array.isArray(binding.monitoredEvents) ? binding.monitoredEvents : [];

  // UK GPS IoT: update library eventIds from GetEvents; never create Traccar notification duplicates.
  if (isGpsIotServer()) {
    const { listGpsIotEvents } = await import("./api");
    const { stampNotificationRowsWithGpsIotEventIds, matchGpsIotEventToDescription } = await import("./gpsiotNotificationMap");
    const catalog = await listGpsIotEvents().catch(() => []);
    const stamped = stampNotificationRowsWithGpsIotEventIds(libraryItems, catalog);
    const monitoredRows = monitoredEvents
      .map((description) => {
        const direct = stamped.find(
          (row) => String(row.description ?? "").trim().toLowerCase() === String(description ?? "").trim().toLowerCase()
        );
        if (direct) return direct;
        const match = matchGpsIotEventToDescription(catalog, String(description ?? ""));
        if (!match) return null;
        return stamped.find((row) => String(row.eventId ?? "").trim() === match.id) ?? null;
      })
      .filter((row): row is NotificationRow => Boolean(row));
    try {
      const { persistNotificationLibraryItemsForSite } = await import("./notificationLibraryStore");
      await persistNotificationLibraryItemsForSite(bindingSite, stamped);
    } catch {
      // Binding monitoredEvents already saved; eventId stamp is best-effort.
    }
    return {
      ok: true,
      synced: monitoredRows.length,
      failed: 0,
      scopes: 1,
      errors: [],
      notificationIds: [],
      attributeIds: [],
      libraryItemsWithIds: monitoredRows
    };
  }

  const parameterCatalog = await loadParameterCatalog();
  const deviceBinding =
    options?.deviceBinding ?? (await resolveDeviceBindingForNotificationBinding(binding));

  const availableRows: NotificationRow[] = [];
  const errors: string[] = [];
  let failed = 0;
  let synced = 0;
  const notificationIds = new Set<number>();
  const attributeIds = new Set<number>();

  for (const eventDescription of monitoredEvents) {
    const libraryItem = findLibraryItem(libraryItems, eventDescription);
    if (!libraryItem) {
      failed += 1;
      errors.push(`Library item not found for "${eventDescription}"`);
      continue;
    }
    if (normalize(String(libraryItem.availability ?? "")) !== "available") continue;
    availableRows.push(libraryItem);
  }

  beginTraccarListCacheBatch();
  try {
    const catalogs = await prefetchTraccarLibraryCatalogs();
    const syncOptions: LibraryTraccarSyncOptions = {
      tenantId,
      parameterCatalog,
      deviceBinding: deviceBinding ?? null,
      notificationsCatalog: catalogs.notifications,
      computedAttributesCatalog: catalogs.computedAttributes
    };

    const results = await mapPool(availableRows, 2, async (libraryItem) => {
      const result = await syncNotificationLibraryItemToTraccar(libraryItem, syncOptions);
      return { libraryItem, result };
    });

    const idByDescription = new Map<string, { traccarNotificationId?: number; traccarComputedAttributeId?: number }>();
    for (const { libraryItem, result } of results) {
      if (result.ok) synced += 1;
      else {
        failed += 1;
        if (result.error) errors.push(`${libraryItem.description}: ${result.error}`);
      }
      const notifId = Number(result.traccarNotificationId ?? 0);
      if (Number.isFinite(notifId) && notifId > 0) notificationIds.add(Math.trunc(notifId));
      const attrId = Number(result.traccarComputedAttributeId ?? 0);
      if (Number.isFinite(attrId) && attrId > 0) attributeIds.add(Math.trunc(attrId));
      idByDescription.set(String(libraryItem.description ?? "").trim(), {
        ...(result.traccarNotificationId && result.traccarNotificationId > 0
          ? { traccarNotificationId: result.traccarNotificationId }
          : {}),
        ...(result.traccarComputedAttributeId && result.traccarComputedAttributeId > 0
          ? { traccarComputedAttributeId: result.traccarComputedAttributeId }
          : {})
      });
    }

    const libraryItemsWithIds = libraryItems.map((row) => {
      const patch = idByDescription.get(String(row.description ?? "").trim());
      if (!patch) return row;
      const next = { ...row };
      if (patch.traccarNotificationId) next.traccarNotificationId = patch.traccarNotificationId;
      else delete next.traccarNotificationId;
      if (patch.traccarComputedAttributeId) next.traccarComputedAttributeId = patch.traccarComputedAttributeId;
      else delete next.traccarComputedAttributeId;
      return next;
    });

    if (idByDescription.size > 0) {
      try {
        await saveScopedToApi("libraries:notification", {
          items: libraryItemsWithIds,
          unavailableDefaultsApplied: true
        });
      } catch {
        // ID cache is best-effort; sync itself already completed.
      }
    }

    await deleteLegacyScopedTraccarResourcesForBinding(binding.id, tenantId);
    invalidateTraccarListCaches();

    return {
      ok: failed === 0,
      synced,
      failed,
      scopes: 0,
      errors,
      notificationIds: Array.from(notificationIds),
      attributeIds: Array.from(attributeIds),
      libraryItemsWithIds
    };
  } finally {
    endTraccarListCacheBatch();
  }
}

export async function deleteNotificationBindingFromTraccar(bindingId: string): Promise<{ ok: boolean }> {
  const tenantId = readActiveTenantId();
  if (!tenantId || !isDatabaseTenant(tenantId)) return { ok: false };
  await deleteLegacyScopedTraccarResourcesForBinding(bindingId, tenantId);
  return { ok: true };
}

export type ConfigurationGroupCompileResult = {
  ok: boolean;
  errors: string[];
  attributesAttached: number;
  eventsSynced: number;
  scopes: number;
  devicesPushed: number;
  devicesTraccarUpdated: number;
  geofencesLinked: number;
  devicesLinked: number;
  assetsInGroup: number;
  acceptedCount: number;
  assetOutcomes: ConfigGroupAssetCompileOutcome[];
  compileAcceptance: ConfigGroupCompileAcceptanceRecord;
};

export type ConfigurationGroupCompileOptions = {
  /** When set, only these assets are compiled (stable keys from compile outcomes). */
  assetKeys?: string[];
};

export async function syncConfigurationGroupToTraccar(
  group: ConfigGroupRecord,
  options?: ConfigurationGroupCompileOptions
): Promise<ConfigurationGroupCompileResult> {
  const tenantId = readActiveTenantId();
  if (!tenantId || !isDatabaseTenant(tenantId)) {
    return {
      ok: false,
      errors: ["Select a database before syncing configuration groups."],
      attributesAttached: 0,
      eventsSynced: 0,
      scopes: 0,
      devicesPushed: 0,
      devicesTraccarUpdated: 0,
      geofencesLinked: 0,
      devicesLinked: 0,
      assetsInGroup: 0,
      acceptedCount: 0,
      assetOutcomes: [],
      compileAcceptance: { acceptedCount: 0, totalCount: 0, assets: [] }
    };
  }

  const site = String(group.site ?? "").trim();
  if (!site) {
    return {
      ok: false,
      errors: ["Configuration group must be anchored to a site before syncing to VIVI."],
      attributesAttached: 0,
      eventsSynced: 0,
      scopes: 0,
      devicesPushed: 0,
      devicesTraccarUpdated: 0,
      geofencesLinked: 0,
      devicesLinked: 0,
      assetsInGroup: 0,
      acceptedCount: 0,
      assetOutcomes: [],
      compileAcceptance: { acceptedCount: 0, totalCount: 0, assets: [] }
    };
  }

  const errors: string[] = [];
  let eventsSynced = 0;
  let scopes = 0;
  let attributesAttached = 0;
  let devicesPushed = 0;
  let devicesTraccarUpdated = 0;
  let geofencesLinked = 0;
  let devicesLinked = 0;

  const [assets, hierarchy, traccarGroups, libraryItems, allConfigGroups] = await Promise.all([
    getAssetsFromApi<any>(),
    getHierarchy(),
    getTraccarGroups(),
    loadNotificationLibraryItemsForSite(site),
    getConfigurationGroups<ConfigGroupRecord>()
  ]);
  const allGroupAssets = listConfigGroupSiteAssets(group, assets ?? [], allConfigGroups ?? []);
  const assetKeyFilter = new Set(
    (options?.assetKeys ?? []).map((key) => String(key ?? "").trim()).filter(Boolean)
  );
  const groupAssets = assetKeyFilter.size
    ? allGroupAssets.filter((asset) => assetKeyFilter.has(buildCompileAssetKey(asset ?? {})))
    : allGroupAssets;
  if (groupAssets.length) {
    const linked = await ensureSiteAssetsLinkedToConfigGroup(group, groupAssets);
    if (linked.errors.length) errors.push(...linked.errors);
  }
  if (!groupAssets.length) {
    return {
      ok: false,
      errors: assetKeyFilter.size
        ? ["Selected asset was not found in this configuration group."]
        : ["No assets are assigned to this configuration group. Assign assets in Edit, save, then compile."],
      attributesAttached: 0,
      eventsSynced: 0,
      scopes: 0,
      devicesPushed: 0,
      devicesTraccarUpdated: 0,
      geofencesLinked: 0,
      devicesLinked: 0,
      assetsInGroup: assetKeyFilter.size ? allGroupAssets.length : 0,
      acceptedCount: 0,
      assetOutcomes: [],
      compileAcceptance: { acceptedCount: 0, totalCount: allGroupAssets.length, assets: [] }
    };
  }
  const extraParameterNames = new Set<string>();
  const traccarGroupId = resolveSiteTraccarGroupId(hierarchy, tenantId, site, traccarGroups) ?? 0;

  // When compiling a single flagged asset, honour its per-asset binding overrides.
  let effectiveGroup: ConfigGroupRecord = group;
  if (assetKeyFilter.size === 1 && groupAssets.length === 1) {
    const onlyAsset = groupAssets[0] as Record<string, unknown>;
    const flagged =
      onlyAsset?.configBindingOverrideFlag === true
      || String(onlyAsset?.configBindingOverrideFlag ?? "").trim() === "true";
    if (flagged) {
      const notificationOverride = String(onlyAsset?.notificationBindingOverride ?? "").trim();
      const deviceOverride = String(onlyAsset?.deviceBindingOverride ?? "").trim();
      effectiveGroup = {
        ...group,
        notificationBinding: notificationOverride || group.notificationBinding,
        deviceBinding: deviceOverride || group.deviceBinding
      };
    }
  }

  const deviceRef = String(effectiveGroup.deviceBinding ?? "").trim();
  let deviceBinding: DeviceBindingRecord | null = null;
  if (deviceRef) {
    const deviceBindings = await getBindings<DeviceBindingRecord>("devices", { refresh: true });
    deviceBinding = resolveBindingByRef(deviceBindings, deviceRef, site);
    if (!deviceBinding) {
      errors.push(`Device binding "${deviceRef}" not found for site "${site}".`);
    } else {
      const bindingSite = String(deviceBinding.site ?? "").trim();
      if (!bindingSite || normalize(bindingSite) !== normalize(site)) {
        deviceBinding = { ...deviceBinding, site };
      }
    }
  }

  const notificationRef = String(effectiveGroup.notificationBinding ?? "").trim();
  let notificationBinding: NotificationBindingRecord | null = null;
  let syncedNotificationIds: number[] = [];
  let syncedAttributeIds: number[] = [];
  let monitoredLibraryItems: NotificationRow[] = [];
  if (notificationRef) {
    const bindings = await getBindings<NotificationBindingRecord>("notifications", { refresh: true });
    notificationBinding = resolveBindingByRef(bindings, notificationRef, site);
    if (!notificationBinding) {
      const hint = formatBindingsHintForSite(bindings, notificationRef, site);
      errors.push(`Notification binding "${notificationRef}" not found for site "${site}".${hint}`);
    } else {
      notificationBinding = await ensureBindingSiteAnchored(notificationBinding, site);
      const monitored = Array.isArray(notificationBinding.monitoredEvents) ? notificationBinding.monitoredEvents : [];
      monitoredLibraryItems = monitored
        .map((description) => findLibraryItem(libraryItems, description))
        .filter((row): row is NotificationRow => Boolean(row));
      for (const name of collectParameterNamesFromLibraryItems(monitoredLibraryItems)) {
        extraParameterNames.add(name);
      }
      if (deviceBinding) {
        for (const name of collectParameterNamesFromDeviceBinding(deviceBinding)) {
          extraParameterNames.add(name);
        }
      }
      for (const libraryItem of monitoredLibraryItems) {
        if (!isFuelComputeNotification(libraryItem)) continue;
        const missing = describeMissingFuelComputePrerequisites(libraryItem, deviceBinding);
        if (missing) errors.push(`${libraryItem.description}: ${missing}`);
      }

      const result = await syncNotificationBindingToTraccar(notificationBinding, {
        deviceBinding,
        configGroupId: group.id,
        site
      });
      eventsSynced = result.synced;
      scopes = result.scopes;
      errors.push(...result.errors);
      syncedNotificationIds = result.notificationIds ?? [];
      syncedAttributeIds = result.attributeIds ?? [];
      if (result.libraryItemsWithIds?.length) {
        monitoredLibraryItems = monitored
          .map((description) => findLibraryItem(result.libraryItemsWithIds, description))
          .filter((row): row is NotificationRow => Boolean(row));
      }
    }
  }

  const locationRef = String(group.locationBinding ?? "").trim();
  if (locationRef) {
    const locationBindings = await getBindings<LocationBindingRecord>("locations");
    let locationBinding = resolveBindingByRef(locationBindings, locationRef, site);
    if (!locationBinding) {
      errors.push(`Location binding "${locationRef}" not found for site "${site}".`);
    } else {
      const bindingSite = String(locationBinding.site ?? "").trim();
      if (!bindingSite || normalize(bindingSite) !== normalize(site)) {
        locationBinding = { ...locationBinding, site };
      }
      const locationResult = await syncLocationBindingForConfigGroup(
        group,
        locationBinding,
        traccarGroupId,
        groupAssets
      );
      geofencesLinked = locationResult.linked;
      if (!locationResult.ok) errors.push(...locationResult.errors);
    }
  }

  if (deviceBinding) {
    const deviceResult = await syncDeviceBindingForConfigGroup(group, deviceBinding, groupAssets, {
      notificationBinding,
      libraryItems
    });
    devicesPushed = deviceResult.pushed;
    devicesTraccarUpdated = deviceResult.traccarUpdated;
    if (!deviceResult.ok) errors.push(...deviceResult.errors);

    // UK GPS IoT: compiled parameters are pushed onto assets above — skip Traccar permission linking.
    if (isGpsIotServer()) {
      let assetOutcomes = deviceResult.assetOutcomes ?? [];
      if (!assetOutcomes.length) {
        const compiledAt = new Date().toISOString();
        assetOutcomes = groupAssets.map((asset) => {
          const imei = String(asset?.imei ?? "").trim();
          return {
            assetKey: buildCompileAssetKey(asset ?? {}),
            label: buildCompileAssetLabel(asset ?? {}),
            imei,
            registration: String(asset?.registration ?? "").trim(),
            accepted: Boolean(imei),
            error: imei ? undefined : "Missing IMEI.",
            compiledAt
          };
        }).filter((row) => row.assetKey);
      }

      const acceptedCount = assetOutcomes.filter((row) => row.accepted).length;
      const compileAcceptance: ConfigGroupCompileAcceptanceRecord = {
        compiledAt: new Date().toISOString(),
        acceptedCount,
        totalCount: groupAssets.length,
        assets: assetOutcomes,
        sourceSnapshot: buildConfigGroupSourceSnapshot(group)
      };
      return {
        ok: configurationGroupCompileSucceeded({
          acceptedCount,
          assetsInGroup: groupAssets.length,
          errors
        }),
        errors,
        attributesAttached: 0,
        eventsSynced,
        scopes,
        devicesPushed,
        devicesTraccarUpdated,
        geofencesLinked,
        devicesLinked: acceptedCount,
        assetsInGroup: groupAssets.length,
        acceptedCount,
        assetOutcomes,
        compileAcceptance
      };
    }
  } else if (isGpsIotServer()) {
    // Notification / location-only compile: accept site assets once bindings are anchored.
    const compiledAt = new Date().toISOString();
    const assetOutcomes = groupAssets.map((asset) => {
      const imei = String(asset?.imei ?? "").trim();
      const blocking = errors.filter((message) => isBlockingCompileError(message));
      return {
        assetKey: buildCompileAssetKey(asset ?? {}),
        label: buildCompileAssetLabel(asset ?? {}),
        imei,
        registration: String(asset?.registration ?? "").trim(),
        accepted: Boolean(imei) && blocking.length === 0,
        error: !imei
          ? "Missing IMEI."
          : blocking.length
            ? blocking[0]
            : undefined,
        compiledAt
      };
    }).filter((row) => row.assetKey);
    const acceptedCount = assetOutcomes.filter((row) => row.accepted).length;
    const compileAcceptance: ConfigGroupCompileAcceptanceRecord = {
      compiledAt,
      acceptedCount,
      totalCount: groupAssets.length,
      assets: assetOutcomes,
      sourceSnapshot: buildConfigGroupSourceSnapshot(group)
    };
    return {
      ok: configurationGroupCompileSucceeded({
        acceptedCount,
        assetsInGroup: groupAssets.length,
        errors
      }),
      errors,
      attributesAttached: 0,
      eventsSynced,
      scopes,
      devicesPushed: 0,
      devicesTraccarUpdated: 0,
      geofencesLinked,
      devicesLinked: acceptedCount,
      assetsInGroup: groupAssets.length,
      acceptedCount,
      assetOutcomes,
      compileAcceptance
    };
  }

  const resourceIds = await collectConfigGroupTraccarResourceIds(
    group,
    Array.from(extraParameterNames),
    monitoredLibraryItems,
    {
      notificationIds: syncedNotificationIds,
      attributeIds: syncedAttributeIds
    }
  );

  if (notificationBinding && monitoredLibraryItems.length > 0 && resourceIds.notificationIds.length === 0) {
    errors.push(
      `Notification binding "${notificationBinding.name}" synced events but no Traccar notification IDs were found to link to assets.`
    );
  }

  if (groupAssets.length > 0) {
    const attachResult = await attachConfigGroupTraccarResources(group, traccarGroupId, {
      extraParameterNames: Array.from(extraParameterNames)
    });
    attributesAttached = attachResult.attached;
    errors.push(...attachResult.errors);
  }

  let assetOutcomes = await linkConfigGroupResourcesToDevices(groupAssets, traccarGroupId, resourceIds);
  devicesLinked = assetOutcomes.filter((row) => row.accepted).length;

  const deviceSyncFailures = new Map<string, string>();
  for (const message of errors) {
    if (!/device not found|permission|notification\s+\d+|attribute\s+\d+|geofence|site group/i.test(message)) {
      continue;
    }
    const match = message.match(/^([^:]+):/);
    if (!match) continue;
    const token = String(match[1] ?? "").trim();
    if (token) deviceSyncFailures.set(token.toLowerCase(), message);
  }

  assetOutcomes = assetOutcomes.map((outcome) => {
    if (!outcome.accepted || !outcome.imei) return outcome;
    const failure =
      deviceSyncFailures.get(outcome.imei.toLowerCase())
      ?? deviceSyncFailures.get(outcome.registration.toLowerCase());
    if (!failure) return outcome;
    return {
      ...outcome,
      accepted: false,
      error: failure
    };
  });

  const blockingGroupErrors = errors.filter((message) => isBlockingCompileError(message));
  const linkedAnyResource =
    resourceIds.notificationIds.length > 0 || resourceIds.attributeIds.length > 0;
  if (blockingGroupErrors.length && !linkedAnyResource) {
    assetOutcomes = assetOutcomes.map((outcome) =>
      outcome.accepted
        ? { ...outcome, accepted: false, error: outcome.error || blockingGroupErrors[0] }
        : outcome
    );
  }

  const acceptedCount = assetOutcomes.filter((row) => row.accepted).length;
  const compileAcceptance: ConfigGroupCompileAcceptanceRecord = {
    compiledAt: new Date().toISOString(),
    acceptedCount,
    totalCount: groupAssets.length,
    assets: assetOutcomes,
    sourceSnapshot: buildConfigGroupSourceSnapshot(group)
  };

  return {
    ok: configurationGroupCompileSucceeded({
      acceptedCount,
      assetsInGroup: groupAssets.length,
      errors
    }),
    errors,
    attributesAttached,
    eventsSynced,
    scopes,
    devicesPushed,
    devicesTraccarUpdated,
    geofencesLinked,
    devicesLinked,
    assetsInGroup: groupAssets.length,
    acceptedCount,
    assetOutcomes,
    compileAcceptance
  };
}

/** Compile and push configuration group bindings to assigned assets and Traccar. */
export async function compileConfigurationGroupToTraccar(
  group: ConfigGroupRecord,
  options?: ConfigurationGroupCompileOptions
): Promise<ConfigurationGroupCompileResult> {
  return syncConfigurationGroupToTraccar(group, options);
}

function mergeCompileAcceptanceAssets(
  previous: ConfigGroupAssetCompileOutcome[] | undefined,
  nextOutcomes: ConfigGroupAssetCompileOutcome[],
  totalCount: number,
  group?: ConfigGroupRecord,
  previousAcceptance?: ConfigGroupCompileAcceptanceRecord
): ConfigGroupCompileAcceptanceRecord {
  const byKey = new Map<string, ConfigGroupAssetCompileOutcome>();
  for (const row of previous ?? []) {
    const key = String(row.assetKey ?? "").trim();
    if (key) byKey.set(key, row);
  }
  for (const row of nextOutcomes) {
    const key = String(row.assetKey ?? "").trim();
    if (key) byKey.set(key, row);
  }
  const previousOrder = (previous ?? []).map((row) => String(row.assetKey ?? "").trim()).filter(Boolean);
  const seen = new Set<string>();
  const assets: ConfigGroupAssetCompileOutcome[] = [];
  for (const key of previousOrder) {
    const row = byKey.get(key);
    if (!row || seen.has(key)) continue;
    seen.add(key);
    assets.push(row);
  }
  for (const row of nextOutcomes) {
    const key = String(row.assetKey ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    assets.push(row);
  }
  const acceptedCount = assets.filter((row) => row.accepted).length;
  return {
    compiledAt: new Date().toISOString(),
    acceptedCount,
    totalCount: Math.max(totalCount, assets.length),
    assets,
    sourceSnapshot: group
      ? buildConfigGroupSourceSnapshot(group)
      : previousAcceptance?.sourceSnapshot
  };
}

/** Compile configuration for a single asset in a group, merging into existing acceptance. */
export async function compileConfigurationGroupAssetToTraccar(
  group: ConfigGroupRecord,
  assetKey: string
): Promise<ConfigurationGroupCompileResult> {
  const key = String(assetKey ?? "").trim();
  const result = await syncConfigurationGroupToTraccar(group, key ? { assetKeys: [key] } : undefined);

  let previousAssets = group.compileAcceptance?.assets ?? [];
  if (!previousAssets.length) {
    const [assets, allGroups] = await Promise.all([
      getAssetsFromApi<any>().catch(() => [] as any[]),
      getConfigurationGroups<ConfigGroupRecord>().catch(() => [] as ConfigGroupRecord[])
    ]);
    previousAssets = listConfigGroupSiteAssets(group, assets ?? [], allGroups ?? []).map((asset) => ({
      assetKey: buildCompileAssetKey(asset ?? {}),
      label: buildCompileAssetLabel(asset ?? {}),
      imei: String(asset?.imei ?? "").trim(),
      registration: String(asset?.registration ?? "").trim(),
      accepted: false
    })).filter((row) => row.assetKey);
  }

  const previousTotal = Math.max(
    Number(group.compileAcceptance?.totalCount ?? 0),
    previousAssets.length,
    result.assetsInGroup
  );
  const compileAcceptance = mergeCompileAcceptanceAssets(
    previousAssets,
    result.assetOutcomes,
    previousTotal,
    group,
    group.compileAcceptance
  );
  return {
    ...result,
    ok: configurationGroupCompileSucceeded({
      acceptedCount: compileAcceptance.acceptedCount,
      assetsInGroup: compileAcceptance.totalCount,
      errors: result.errors
    }),
    assetsInGroup: compileAcceptance.totalCount,
    acceptedCount: compileAcceptance.acceptedCount,
    assetOutcomes: compileAcceptance.assets,
    compileAcceptance
  };
}

export async function syncConfigurationGroupNotificationBinding(
  group: ConfigGroupRecord
): Promise<{ ok: boolean; errors: string[] }> {
  const result = await syncConfigurationGroupToTraccar(group);
  return { ok: result.ok, errors: result.errors };
}

export async function resyncAllConfigurationGroupsToTraccar(): Promise<void> {
  const activeSite = readActiveSiteName();
  const groups = await getConfigurationGroups<ConfigGroupRecord>();
  for (const group of groups) {
    const groupSite = String(group.site ?? "").trim();
    if (!activeSite || !groupSite || !sitesEquivalent(groupSite, activeSite)) continue;
    await syncConfigurationGroupToTraccar(group);
  }
}

export async function resyncBindingsForMonitoredEvent(eventDescription: string): Promise<void> {
  const activeSite = readActiveSiteName();
  const bindings = await getBindings<NotificationBindingRecord>("notifications");
  const key = normalize(eventDescription);
  const affected = bindings.filter((binding) => {
    if (!activeSite || !bindingMatchesSite(binding, activeSite)) return false;
    return (binding.monitoredEvents ?? []).some((event) => normalize(event) === key);
  });
  for (const binding of affected) {
    const deviceBinding = await resolveDeviceBindingForNotificationBinding(binding);
    const result = await syncNotificationBindingToTraccar(binding, { deviceBinding });
    if (!result.ok && result.errors.length) {
      console.warn("[VIVI] Notification binding sync failed:", result.errors.join("; "));
    }
  }
}

export type BindingAttachmentCounts = {
  groupCount: number;
  assetCount: number;
};

function countBindingAttachmentsFromCatalog(
  kind: "notifications" | "devices" | "locations",
  binding: { id: string; name: string; site?: string },
  groups: ConfigGroupRecord[],
  assets: any[]
): BindingAttachmentCounts {
  const field =
    kind === "notifications"
      ? "notificationBinding"
      : kind === "locations"
        ? "locationBinding"
        : "deviceBinding";
  const bindingSite = String(binding.site ?? "").trim();
  const matched = (groups ?? []).filter((group) => {
    const ref = String(group[field] ?? "").trim();
    if (!bindingRowMatchesRef(binding, ref)) return false;
    const groupSite = String(group.site ?? "").trim();
    if (!bindingSite || !groupSite || !sitesEquivalent(bindingSite, groupSite)) return false;
    return true;
  });

  const assetKeys = new Set<string>();
  for (const group of matched) {
    for (const asset of listConfigGroupSiteAssets(group, assets ?? [], groups ?? [])) {
      const key = String(asset?.imei ?? asset?.id ?? asset?.registration ?? "")
        .trim()
        .toLowerCase();
      if (key) assetKeys.add(key);
    }
  }

  return {
    groupCount: matched.length,
    assetCount: assetKeys.size
  };
}

/**
 * Count config groups that reference this binding and unique assets assigned to those groups.
 * Used for Bindings list Asset / Groups columns (attachment, not only last sync upload).
 */
export async function countBindingAttachments(
  kind: "notifications" | "devices" | "locations",
  binding: { id: string; name: string; site?: string }
): Promise<BindingAttachmentCounts> {
  const [groups, assets] = await Promise.all([
    getConfigurationGroups<ConfigGroupRecord>(),
    getAssetsFromApi<any>()
  ]);
  return countBindingAttachmentsFromCatalog(kind, binding, groups ?? [], assets ?? []);
}

/** Enrich many device bindings with attachment counts using one groups/assets fetch. */
export async function enrichDeviceBindingsWithAttachmentCounts<
  T extends { id?: string; name?: string; site?: string; assetCount?: number; groupCount?: number }
>(rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const [groups, assets] = await Promise.all([
    getConfigurationGroups<ConfigGroupRecord>(),
    getAssetsFromApi<any>()
  ]);
  return rows.map((row) => {
    const counts = countBindingAttachmentsFromCatalog(
      "devices",
      {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        site: String(row.site ?? "").trim()
      },
      groups ?? [],
      assets ?? []
    );
    return {
      ...row,
      assetCount: counts.assetCount,
      groupCount: counts.groupCount
    };
  });
}

export type BindingResyncSummary = {
  /** Config groups that reference this binding. */
  groupCount: number;
  /** Assets attached to those groups (and successfully uploaded when sync reports more). */
  assetCount: number;
  errors: string[];
};

export async function resyncConfigurationGroupsForBinding(
  kind: "notifications" | "devices" | "locations",
  binding: { id: string; name: string; site?: string }
): Promise<BindingResyncSummary> {
  const attached = await countBindingAttachments(kind, binding);
  const groups = await getConfigurationGroups<ConfigGroupRecord>();
  const field =
    kind === "notifications"
      ? "notificationBinding"
      : kind === "locations"
        ? "locationBinding"
        : "deviceBinding";
  const matched = groups.filter((group) => {
    const ref = String(group[field] ?? "").trim();
    if (!bindingRowMatchesRef(binding, ref)) return false;
    const groupSite = String(group.site ?? "").trim();
    const bindingSite = String(binding.site ?? "").trim();
    if (!bindingSite || !groupSite || !sitesEquivalent(bindingSite, groupSite)) return false;
    return true;
  });

  const errors: string[] = [];
  const successfulAssetKeys = new Set<string>();
  let uploadedAssetTotal = 0;

  for (const group of matched) {
    const result = await syncConfigurationGroupToTraccar(group);
    if (result.errors.length) errors.push(...result.errors);

    for (const outcome of result.assetOutcomes ?? []) {
      if (!outcome.accepted) continue;
      const key = String(outcome.assetKey || outcome.imei || outcome.registration || "")
        .trim()
        .toLowerCase();
      if (key) successfulAssetKeys.add(key);
    }

    if (kind === "devices") {
      uploadedAssetTotal += Math.max(
        Number(result.devicesTraccarUpdated ?? 0),
        Number(result.devicesPushed ?? 0),
        Number(result.acceptedCount ?? 0)
      );
    }
  }

  return {
    groupCount: attached.groupCount,
    assetCount: Math.max(attached.assetCount, successfulAssetKeys.size, uploadedAssetTotal),
    errors
  };
}
