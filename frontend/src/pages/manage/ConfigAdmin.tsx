import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  deleteConfigurationGroup,
  getAssetsFromApi,
  getBindings,
  getConfigurationGroups,
  getHierarchy,
  getTenantId,
  saveConfigurationGroup,
  upsertAssetDetailed,
  upsertAssetToApi
} from "../../utils/api";
import {
  assetConfigurationStatus,
  buildConfigGroupSourceFingerprint,
  buildConfigGroupSourceSnapshot,
  configurationChangeLabel,
  configurationDateLabel,
  configurationStatusCellLabel,
  downloadConfigGroupCompileExcel,
  groupConfigurationStatus,
  CONFIGURATION_CHANGE,
  CONFIGURATION_RECEIVED_NOTE,
  CONFIGURATION_STATUS,
  type ConfigGroupCompileAcceptance,
  type ConfigGroupSourceRecords
} from "../../utils/configGroupCompileStatus";
import {
  compileConfigurationGroupAssetToTraccar,
  compileConfigurationGroupToTraccar,
  type ConfigurationGroupCompileResult,
  type ConfigGroupCompileAcceptanceRecord
} from "../../utils/traccarBindingSync";
import {
  countAssetsForConfigGroups,
  listAssetsForConfigGroup,
  assetConfigGroupIsUnassignedOrDefault
} from "../../utils/configGroupSiteAssets";
import {
  bindingMatchesSite,
  isUserNotificationBinding,
  readActiveSiteName
} from "../../utils/notificationLibraryStore";
import {
  configGroupsCacheKey,
  filterForSiteScope,
  filterRecordsForActiveSelection,
  loadScopedFromApi
} from "../../utils/scopeStorage";
import { loadSharedAdminRows, saveSharedAdminRows } from "../../utils/sharedRecords";
import { readStoredSelectionScope } from "../../utils/selectionScope";
import {
  filterOutMockConfigurationGroups,
  isMockConfigurationGroup,
  purgeMockConfigurationGroupsFromLocalStorage
} from "../../utils/configGroupMocks";
import { showToast } from "../../utils/toast";
import { siteScopeToken } from "../../utils/scopeIsolation";
import { readUserPrefJson, writeUserPrefJson } from "../../utils/userAppPrefs";
import { formatAssetDescription } from "../../utils/hierarchyDisplay";
import "../../index.css";

type AdminRow = { id: string; cells: string[]; status?: string };
type TenantAsset = Record<string, unknown>;

/** One right-panel row per assigned asset (configuration groups page). */
type ConfigAssetDetailRow = {
  id: string;
  groupId: string;
  groupName: string;
  assetKey: string;
  /** Registration / description only (IMEI is a separate column). */
  description: string;
  assetId: string;
  imei: string;
  site: string;
  deviceBindingName: string;
  notificationBindingName: string;
  flagged: boolean;
  configurationDate: string;
  configurationStatus: string;
  /** Config Compile Status column values. */
  configurationChange: string;
  statusKind: "accepted" | "failed" | "pending" | "changed";
};

const ASSET_OVERRIDE_FLAG_KEY = "configBindingOverrideFlag";
const ASSET_NOTIFICATION_OVERRIDE_KEY = "notificationBindingOverride";
const ASSET_DEVICE_OVERRIDE_KEY = "deviceBindingOverride";

const assetHasBindingOverride = (asset: TenantAsset | undefined | null) =>
  Boolean(asset?.[ASSET_OVERRIDE_FLAG_KEY] === true || asset?.[ASSET_OVERRIDE_FLAG_KEY] === "true");

const readAssetNotificationBinding = (asset: TenantAsset | undefined | null, groupFallback: string) => {
  if (assetHasBindingOverride(asset)) {
    const override = String(asset?.[ASSET_NOTIFICATION_OVERRIDE_KEY] ?? "").trim();
    if (override) return override;
  }
  return String(groupFallback ?? "").trim();
};

const readAssetDeviceBinding = (asset: TenantAsset | undefined | null, groupFallback: string) => {
  if (assetHasBindingOverride(asset)) {
    const override = String(asset?.[ASSET_DEVICE_OVERRIDE_KEY] ?? "").trim();
    if (override) return override;
  }
  return String(groupFallback ?? "").trim();
};

const assetDescriptionOnly = (asset: TenantAsset) => {
  return formatAssetDescription(asset) || String(asset.assetDescription ?? "").trim() || "Unnamed asset";
};

const assetIdDisplay = (asset: TenantAsset) => {
  const assetId = String(asset.assetId ?? "").trim();
  if (assetId) return assetId;
  return String(asset.id ?? "").trim();
};

type AdminPageConfig = {
  title: string;
  pathLabel: string;
  columns: string[];
  rows: AdminRow[];
  statusOptions?: string[];
  formFields?: { label: string; placeholder: string }[];
};

type ConfigGroupRecord = {
  id: string;
  name: string;
  site: string;
  notificationBinding: string;
  locationBinding: string;
  deviceBinding: string;
  status?: string;
  updatedAt?: string;
  compileAcceptance?: ConfigGroupCompileAcceptanceRecord;
};

type DeviceBindingOptionRecord = {
  name?: string;
  locationSpeedMonitoring?: boolean;
  advancedSettings?: {
    locationSpeedMonitoring?: boolean;
  };
};

const configGroupPath = "/Control/config/configuration-groups";
/** Assets column index in the right-hand detail table (Group lives in the sidebar). */
const CONFIG_GROUP_ASSETS_COLUMN = 1;

const normalizeConfigGroupKey = (value: string) => String(value ?? "").trim().toLowerCase();

const parseAssetCountCell = (cell: unknown) => {
  const raw = String(cell ?? "").trim();
  if (!/^\d+$/.test(raw)) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const readAssetConfigGroup = (asset: TenantAsset) =>
  String(asset.configGroup ?? asset.configurationGroup ?? "").trim();

const assetStableKey = (asset: TenantAsset) => {
  const imei = String(asset.imei ?? "").trim();
  if (imei) return `imei:${imei}`;
  const registration = String(asset.registration ?? "").trim();
  if (registration) return `reg:${registration}`;
  const assetId = String(asset.assetId ?? asset.id ?? "").trim();
  return assetId ? `id:${assetId}` : "";
};

const assetDisplayLabel = (asset: TenantAsset) => {
  const registration = String(asset.registration ?? "").trim();
  const description = String(asset.assetDescription ?? "").trim();
  const imei = String(asset.imei ?? "").trim();
  if (registration && imei) return `${registration} (${imei})`;
  return registration || description || imei || "Unnamed asset";
};

const assetMatchesSite = (asset: TenantAsset, site: string) => {
  if (!site) return true;
  return normalizeConfigGroupKey(String(asset.site ?? "")) === normalizeConfigGroupKey(site);
};

const assetMatchesConfigGroup = (
  asset: TenantAsset,
  group: Pick<ConfigGroupRecord, "id" | "name">
) => {
  const assigned = readAssetConfigGroup(asset);
  if (!assigned) return false;
  const refs = [group.id, group.name]
    .map((value) => normalizeConfigGroupKey(String(value ?? "")))
    .filter(Boolean);
  return refs.includes(normalizeConfigGroupKey(assigned));
};

const assetAssignedToOtherGroup = (
  asset: TenantAsset,
  group: Pick<ConfigGroupRecord, "id" | "name">
) => {
  if (assetConfigGroupIsUnassignedOrDefault(asset)) return false;
  const assigned = readAssetConfigGroup(asset);
  if (!assigned) return false;
  return !assetMatchesConfigGroup(asset, group);
};

const assetMatchesAnyGroupRef = (asset: TenantAsset, refs: string[]) => {
  if (assetConfigGroupIsUnassignedOrDefault(asset)) return false;
  const assigned = normalizeConfigGroupKey(readAssetConfigGroup(asset));
  if (!assigned) return false;
  const normalizedRefs = refs
    .map((value) => normalizeConfigGroupKey(String(value ?? "")))
    .filter(Boolean);
  return normalizedRefs.includes(assigned);
};

const persistConfigGroupAssetAssignments = async (
  group: ConfigGroupRecord,
  selectedKeys: string[],
  assets: TenantAsset[],
  options?: { previousGroupName?: string }
): Promise<{ ok: boolean; updated: number; errors: string[] }> => {
  const selected = new Set(selectedKeys);
  const site = String(group.site ?? "").trim();
  const previousGroupName = String(options?.previousGroupName ?? "").trim();
  const groupRefs = [group.id, group.name, previousGroupName].filter(Boolean);
  const errors: string[] = [];
  let updated = 0;

  for (const asset of assets) {
    const key = assetStableKey(asset);
    if (!key || !assetMatchesSite(asset, site)) continue;

    const wasAssigned = assetMatchesAnyGroupRef(asset, groupRefs);
    const shouldAssign = selected.has(key);
    const groupId = String(group.id ?? "").trim();
    const groupName = String(group.name ?? "").trim();
    if (shouldAssign === wasAssigned) {
      if (!shouldAssign) continue;
      const currentId = String(asset.configGroup ?? "").trim();
      if (currentId === (groupId || groupName)) continue;
    }

    const payload: TenantAsset = { ...asset };
    if (shouldAssign) {
      payload.configGroup = groupId || groupName;
      payload.configurationGroup = groupName || groupId;
    } else {
      payload.configGroup = "";
      payload.configurationGroup = "";
    }

    const result = await upsertAssetDetailed(payload);
    if (!result.stored) {
      errors.push(`${assetDisplayLabel(asset)}: ${result.error ?? "Save failed"}`);
      continue;
    }
    updated += 1;
  }

  return { ok: errors.length === 0, updated, errors };
};

type ConfigGroupChangeSource = {
  linkedSourceUpdatedAt?: string;
  currentSourceFingerprint?: string;
};

const buildConfigGroupAdminRow = (
  group: ConfigGroupRecord,
  assetCountsByRef: Map<string, number>,
  changeSource?: ConfigGroupChangeSource
): AdminRow => {
  const liveCount =
    assetCountsByRef.get(normalizeConfigGroupKey(group.id))
    ?? assetCountsByRef.get(normalizeConfigGroupKey(group.name))
    ?? 0;
  const assetCount = Math.max(liveCount, group.compileAcceptance?.totalCount ?? 0);
  const acceptance = group.compileAcceptance as ConfigGroupCompileAcceptance | undefined;
  const changeInput = {
    notificationBinding: group.notificationBinding,
    locationBinding: group.locationBinding,
    deviceBinding: group.deviceBinding,
    updatedAt: group.updatedAt,
    ...changeSource,
    compileAcceptance: acceptance
  };
  const statusLabel = configurationStatusCellLabel(acceptance, assetCount);
  const changeLabel = configurationChangeLabel(changeInput, assetCount);
  const dateLabel = configurationDateLabel(changeInput);
  const groupStatus = groupConfigurationStatus(acceptance, assetCount);
  return {
    id: group.id,
    cells: [
      group.name,
      group.site ?? "",
      String(assetCount),
      dateLabel,
      statusLabel,
      changeLabel
    ],
    status:
      groupStatus === CONFIGURATION_STATUS.ACCEPTED
        ? "configured"
        : groupStatus === CONFIGURATION_STATUS.FAILED
          ? "failed"
          : "pending"
  };
};

const buildConfigAssetDetailRows = (
  groups: ConfigGroupRecord[],
  assets: TenantAsset[],
  changeSourceForGroup: (group: ConfigGroupRecord) => ConfigGroupChangeSource
): ConfigAssetDetailRow[] => {
  const allGroups = groups;
  const rows: ConfigAssetDetailRow[] = [];
  for (const group of groups) {
    const acceptance = group.compileAcceptance as ConfigGroupCompileAcceptance | undefined;
    const changeInput = {
      notificationBinding: group.notificationBinding,
      locationBinding: group.locationBinding,
      deviceBinding: group.deviceBinding,
      updatedAt: group.updatedAt,
      ...changeSourceForGroup(group),
      compileAcceptance: acceptance
    };
    const dateLabel = configurationDateLabel(changeInput);
    const sourceChanged = configurationChangeLabel(changeInput, acceptance?.totalCount ?? 0) === CONFIGURATION_CHANGE.CHANGED;
    const assigned = listAssetsForConfigGroup(group, assets, allGroups);
    const outcomesByKey = new Map(
      (acceptance?.assets ?? []).map((row) => [String(row.assetKey ?? "").trim(), row])
    );

    for (const asset of assigned) {
      const assetKey = assetStableKey(asset);
      if (!assetKey) continue;
      const outcome = outcomesByKey.get(assetKey);
      const perAssetStatus = assetConfigurationStatus(outcome);
      let configurationChange = "";
      let statusKind: ConfigAssetDetailRow["statusKind"] = "pending";
      if (sourceChanged) {
        configurationChange = CONFIGURATION_CHANGE.CHANGED;
        statusKind = "changed";
      } else if (perAssetStatus === CONFIGURATION_STATUS.ACCEPTED) {
        configurationChange = "";
        statusKind = "accepted";
      } else {
        configurationChange = CONFIGURATION_CHANGE.UPLOAD_REQUESTED;
        statusKind = perAssetStatus === CONFIGURATION_STATUS.FAILED ? "failed" : "pending";
      }
      const flagged = assetHasBindingOverride(asset);
      rows.push({
        id: `${group.id}::${assetKey}`,
        groupId: group.id,
        groupName: group.name,
        assetKey,
        description: assetDescriptionOnly(asset),
        assetId: assetIdDisplay(asset),
        imei: String(asset.imei ?? "").trim(),
        site: String(group.site ?? asset.site ?? "").trim(),
        deviceBindingName: readAssetDeviceBinding(asset, group.deviceBinding),
        notificationBindingName: readAssetNotificationBinding(asset, group.notificationBinding),
        flagged,
        configurationDate: dateLabel,
        configurationStatus: perAssetStatus,
        configurationChange,
        statusKind
      });
    }

    // Include compile outcomes for assets no longer in the live list (stale IMEI / reassigned).
    for (const outcome of acceptance?.assets ?? []) {
      const assetKey = String(outcome.assetKey ?? "").trim();
      if (!assetKey) continue;
      if (rows.some((row) => row.groupId === group.id && row.assetKey === assetKey)) continue;
      const perAssetStatus = assetConfigurationStatus(outcome);
      let configurationChange = "";
      let statusKind: ConfigAssetDetailRow["statusKind"] = "pending";
      if (sourceChanged) {
        configurationChange = CONFIGURATION_CHANGE.CHANGED;
        statusKind = "changed";
      } else if (perAssetStatus === CONFIGURATION_STATUS.ACCEPTED) {
        configurationChange = "";
        statusKind = "accepted";
      } else {
        configurationChange = CONFIGURATION_CHANGE.UPLOAD_REQUESTED;
        statusKind = perAssetStatus === CONFIGURATION_STATUS.FAILED ? "failed" : "pending";
      }
      rows.push({
        id: `${group.id}::${assetKey}`,
        groupId: group.id,
        groupName: group.name,
        assetKey,
        description: String(outcome.label ?? assetKey).trim() || assetKey,
        assetId: "",
        imei: String(outcome.imei ?? "").trim(),
        site: String(group.site ?? "").trim(),
        deviceBindingName: String(group.deviceBinding ?? "").trim(),
        notificationBindingName: String(group.notificationBinding ?? "").trim(),
        flagged: false,
        configurationDate: dateLabel,
        configurationStatus: perAssetStatus,
        configurationChange,
        statusKind
      });
    }
  }
  return rows;
};

const resolveConfigGroupRecords = (
  groups: ConfigGroupRecord[],
  storedGroups: ConfigGroupRecord[]
) => {
  const apiGroups = filterOutMockConfigurationGroups(groups);
  if (apiGroups.length) return apiGroups;
  return filterOutMockConfigurationGroups(storedGroups);
};

const notificationBindingOptions: string[] = [];
const locationBindingOptions: string[] = [];
const deviceBindingOptions: string[] = [];

const defaultNotificationBindingOptions = [
  "Default notification template",
  "Speeding alerts",
  "Harsh braking"
];

const readBindingUpdatedAt = (item: { updatedAt?: unknown; updated_at?: unknown }) => {
  const iso = String(item?.updatedAt ?? item?.updated_at ?? "").trim();
  return iso && Number.isFinite(Date.parse(iso)) ? iso : "";
};

const mergeBindingSourceUpdatedAts = (
  current: Record<string, string>,
  items: Array<{ name?: unknown; updatedAt?: unknown; updated_at?: unknown }>
) => {
  const next = { ...current };
  for (const item of items) {
    const name = String(item?.name ?? "").trim().toLowerCase();
    const updatedAt = readBindingUpdatedAt(item);
    if (!name || !updatedAt) continue;
    const prevMs = Date.parse(String(next[name] ?? ""));
    const nextMs = Date.parse(updatedAt);
    if (!Number.isFinite(prevMs) || nextMs > prevMs) next[name] = updatedAt;
  }
  return next;
};

const dedupeStrings = (values: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
};

const pageConfigs: Record<string, AdminPageConfig> = {
  [configGroupPath]: {
    title: "Configuration groups",
    pathLabel: "Control / Config admin / Configuration groups",
    columns: [
      "",
      "Flag",
      "Asset description",
      "Configuration group",
      "Asset ID",
      "IMEI",
      "Site",
      "Mobile Device Binding",
      "Notification Binding",
      "Configuration Date",
      "Configuration status",
      "Config Compile Status",
      "Actions"
    ],
    rows: [],
    statusOptions: [
      CONFIGURATION_STATUS.ACCEPTED,
      CONFIGURATION_STATUS.FAILED,
      CONFIGURATION_STATUS.UPLOAD_REQUESTED,
      CONFIGURATION_CHANGE.CHANGED
    ],
    formFields: [
      { label: "Group name", placeholder: "e.g. Muli_Transport_Fuel_Test" },
      { label: "Site", placeholder: "Select site" },
      { label: "Notifications binding", placeholder: "Select notifications binding" },
      { label: "Location binding", placeholder: "Select location binding" },
      { label: "Devices binding", placeholder: "Select device binding" }
    ]
  },
  "/Control/config/Vivi-d-Track-configuration": {
    title: "Vivi D-Track configuration",
    pathLabel: "Control / Config admin / Vivi D-Track configuration",
    columns: ["Profile", "Vehicles", "Firmware", "Status", "Actions"],
    rows: [
      { id: "dm-1", cells: ["Standard tracking", "78", "v3.2.1", "Active"], status: "active" },
      { id: "dm-2", cells: ["High risk", "24", "v3.1.9", "Active"], status: "active" },
      { id: "dm-3", cells: ["Pilot", "12", "v3.3.0", "Draft"], status: "draft" }
    ],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Profile name", placeholder: "Standard tracking" },
      { label: "Firmware version", placeholder: "v3.2.1" },
      { label: "Target vehicles", placeholder: "78" }
    ]
  },
  "/Control/config/task-Controlment-configuration": {
    title: "Task Controlment configuration",
    pathLabel: "Control / Config admin / Task Controlment configuration",
    columns: ["Template", "Active tasks", "SLA", "Status", "Actions"],
    rows: [
      { id: "tm-1", cells: ["Breakdown workflow", "14", "2h", "Active"], status: "active" },
      { id: "tm-2", cells: ["Driver support", "6", "4h", "Active"], status: "active" },
      { id: "tm-3", cells: ["Workshop intake", "3", "8h", "Draft"], status: "draft" }
    ],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Template name", placeholder: "Breakdown workflow" },
      { label: "Default SLA", placeholder: "2h" },
      { label: "Owner", placeholder: "Dispatch" }
    ]
  },
  "/Control/config/asset-commissioning": {
    title: "Asset commissioning",
    pathLabel: "Control / Config admin / Asset commissioning",
    columns: ["Queue", "Pending", "Updated", "Status", "Actions"],
    rows: [
      { id: "ac-1", cells: ["Hardware install", "4", "Today 08:40", "Active"], status: "active" },
      { id: "ac-2", cells: ["QA checks", "3", "Yesterday", "Active"], status: "active" },
      { id: "ac-3", cells: ["SIM provisioning", "2", "Jan 14", "Paused"], status: "paused" }
    ],
    statusOptions: ["active", "paused"],
    formFields: [
      { label: "Queue name", placeholder: "Hardware install" },
      { label: "Default assignee", placeholder: "Workshop" },
      { label: "SLA", placeholder: "24h" }
    ]
  }
};

const canCompileConfigGroup = (
  group: ConfigGroupRecord | undefined,
  deviceLocationMonitoringByName: Record<string, boolean>
) => {
  if (!group) return false;
  const site = String(group.site ?? "").trim();
  const notificationBinding = String(group.notificationBinding ?? "").trim();
  const deviceBinding = String(group.deviceBinding ?? "").trim();
  if (!site || !notificationBinding || !deviceBinding) return false;
  const needsLocation = deviceBinding
    ? Boolean(deviceLocationMonitoringByName[deviceBinding.toLowerCase()])
    : false;
  if (needsLocation && !String(group.locationBinding ?? "").trim()) return false;
  return true;
};

const isTechnicalCompileDetail = (message: string) =>
  /traccar|upstream unavailable|site group|notification\s+\d+|attribute\s+\d+|soft.?fail/i.test(
    String(message ?? "")
  );

/** User-facing compile copy — hide Traccar/upstream technical details from frontend accounts. */
const buildCompileResultMessage = (result: ConfigurationGroupCompileResult) => {
  if (result.ok) return CONFIGURATION_STATUS.ACCEPTED;
  const pending = Math.max(0, result.assetsInGroup - result.acceptedCount);
  if (result.acceptedCount > 0) {
    return `${result.acceptedCount} of ${result.assetsInGroup} asset(s) accepted configurations. ${pending} still pending.`;
  }
  const technical =
    result.errors[0]
    ?? result.assetOutcomes.find((row) => row.error)?.error
    ?? "";
  if (technical && !isTechnicalCompileDetail(technical)) return technical;
  return CONFIGURATION_STATUS.FAILED;
};

type ConfigGroupSourceState = {
  bindings: Omit<ConfigGroupSourceRecords, "libraryItems">;
  /** Stored notification library rows keyed by lower-case site; missing when the read failed. */
  libraryItemsBySite: Record<string, ConfigGroupSourceRecords["libraryItems"]>;
};

/** Read-only load of everything a group compiles from (never writes library defaults). */
const loadConfigGroupSourceState = async (sites: string[]): Promise<ConfigGroupSourceState> => {
  const uniqueSites = dedupeStrings(sites);
  const [notificationBindings, locationBindings, deviceBindings, libraries] = await Promise.all([
    getBindings<ConfigGroupSourceRecords["notificationBindings"][number]>("notifications"),
    getBindings<ConfigGroupSourceRecords["locationBindings"][number]>("locations"),
    getBindings<ConfigGroupSourceRecords["deviceBindings"][number]>("devices"),
    Promise.all(
      uniqueSites.map((site) =>
        loadScopedFromApi<{ items?: ConfigGroupSourceRecords["libraryItems"] }>("libraries:notification", site)
          .then((stored) => (stored && typeof stored === "object" ? stored.items ?? [] : null))
          .catch(() => null)
      )
    )
  ]);
  const libraryItemsBySite: ConfigGroupSourceState["libraryItemsBySite"] = {};
  uniqueSites.forEach((site, index) => {
    const items = libraries[index];
    if (Array.isArray(items)) libraryItemsBySite[site.toLowerCase()] = items;
  });
  return { bindings: { notificationBindings, locationBindings, deviceBindings }, libraryItemsBySite };
};

const configGroupSourceFingerprint = (
  group: ConfigGroupRecord,
  state: ConfigGroupSourceState | null
): string | undefined => {
  if (!state) return undefined;
  const libraryItems = state.libraryItemsBySite[String(group.site ?? "").trim().toLowerCase()];
  if (!libraryItems) return undefined;
  const { notificationBindings, locationBindings, deviceBindings } = state.bindings;
  // An empty list for a referenced kind means the load failed — don't fingerprint a false "missing".
  if (String(group.notificationBinding ?? "").trim() && !notificationBindings.length) return undefined;
  if (String(group.locationBinding ?? "").trim() && !locationBindings.length) return undefined;
  if (String(group.deviceBinding ?? "").trim() && !deviceBindings.length) return undefined;
  return buildConfigGroupSourceFingerprint(group, { ...state.bindings, libraryItems });
};

/** Fingerprint of the group's binding sources right now — taken before compile / upload. */
const captureConfigGroupSourceFingerprint = async (group: ConfigGroupRecord) => {
  try {
    return configGroupSourceFingerprint(group, await loadConfigGroupSourceState([String(group.site ?? "")]));
  } catch {
    return undefined;
  }
};

const writeConfigGroupToCache = (payload: ConfigGroupRecord) => {
  const cacheKey = configGroupsCacheKey(String(payload.site ?? ""));
  const stored = window.localStorage.getItem(cacheKey);
  try {
    const parsed = stored ? JSON.parse(stored) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const filtered = list.filter((entry) => entry?.id !== payload.id);
    window.localStorage.setItem(cacheKey, JSON.stringify([payload, ...filtered]));
  } catch {
    window.localStorage.setItem(cacheKey, JSON.stringify([payload]));
  }
};

/** After a full upload, the devices hold the current sources — clear "Configurations Changed". */
const persistConfigGroupSourceSnapshot = async (group: ConfigGroupRecord, sourceFingerprint?: string) => {
  if (!group.compileAcceptance) return group;
  const payload: ConfigGroupRecord = {
    ...group,
    compileAcceptance: {
      ...group.compileAcceptance,
      sourceSnapshot: buildConfigGroupSourceSnapshot(group, sourceFingerprint)
    }
  };
  await saveConfigurationGroup(payload);
  writeConfigGroupToCache(payload);
  return payload;
};

const persistCompiledConfigGroup = async (
  group: ConfigGroupRecord,
  result: ConfigurationGroupCompileResult,
  sourceFingerprint?: string
) => {
  const payload: ConfigGroupRecord = {
    ...group,
    status: result.ok ? "configured" : group.status,
    updatedAt: new Date().toISOString(),
    compileAcceptance: result.compileAcceptance
      ? {
          ...result.compileAcceptance,
          // Group refs (not per-asset override refs) so the column compares like with like.
          sourceSnapshot: buildConfigGroupSourceSnapshot(group, sourceFingerprint)
        }
      : result.compileAcceptance
  };
  await saveConfigurationGroup(payload);
  writeConfigGroupToCache(payload);
  return payload;
};

const readStoredConfigGroups = (tenantKey: string): ConfigGroupRecord[] => {
  const raw = window.localStorage.getItem(tenantKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const BINDINGS_PAGE_PATH = "/Control/config/templates";

/** Grid track per asset-table column (header label → width). */
const CONFIG_ASSET_COLUMN_WIDTHS: Record<string, string> = {
  "": "36px",
  Flag: "40px",
  "Asset description": "minmax(140px, 1.4fr)",
  "Configuration group": "minmax(140px, 1.2fr)",
  "Asset ID": "minmax(80px, 0.7fr)",
  IMEI: "minmax(110px, 0.9fr)",
  Site: "minmax(90px, 0.8fr)",
  "Mobile Device Binding": "minmax(120px, 1fr)",
  "Notification Binding": "minmax(120px, 1fr)",
  "Configuration Date": "minmax(110px, 0.9fr)",
  "Configuration status": "minmax(130px, 1fr)",
  "Config Compile Status": "minmax(120px, 1fr)",
  Actions: "48px"
};

/** Columns the chooser never hides (selection, identity, row menu). */
const CONFIG_ASSET_FIXED_COLUMNS = new Set(["", "Asset description", "Actions"]);

/** Per-account (user + tenant) and per-site key for the asset table's hidden columns. */
const configAssetColumnPrefsKey = (site: string) =>
  `vivi.configGroups.assetColumns:${siteScopeToken(site) || "all"}`;

const readHiddenConfigAssetColumns = (site: string): string[] => {
  const saved = readUserPrefJson<{ hidden?: unknown }>(configAssetColumnPrefsKey(site));
  return Array.isArray(saved?.hidden)
    ? saved!.hidden.map((col) => String(col)).filter((col) => !CONFIG_ASSET_FIXED_COLUMNS.has(col))
    : [];
};

export default function ConfigAdmin() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const page = pageConfigs[location.pathname];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<Record<string, string>>({});
  const [rowsByPath, setRowsByPath] = useState<Record<string, AdminRow[]>>(() =>
    Object.fromEntries(Object.entries(pageConfigs).map(([pathKey, config]) => [pathKey, [...config.rows]]))
  );
  const [configGroups, setConfigGroups] = useState<Record<string, ConfigGroupRecord>>({});
  const [selectedSidebarGroupId, setSelectedSidebarGroupId] = useState<string>("all");
  const [notificationOptions, setNotificationOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<string[]>([]);
  const [deviceLocationMonitoringByName, setDeviceLocationMonitoringByName] = useState<Record<string, boolean>>({});
  /** Latest binding/library update times keyed by binding name (lower-case). */
  const [bindingSourceUpdatedAtByName, setBindingSourceUpdatedAtByName] = useState<Record<string, string>>({});
  /** Current bindings + notification library, for comparing against each group's compile fingerprint. */
  const [configGroupSources, setConfigGroupSources] = useState<ConfigGroupSourceState | null>(null);
  const [siteOptions, setSiteOptions] = useState<string[]>([]);
  const [tenantAssets, setTenantAssets] = useState<TenantAsset[]>([]);
  const [assignedAssetKeys, setAssignedAssetKeys] = useState<string[]>([]);
  const [assetPickerValue, setAssetPickerValue] = useState("");
  const [assetAssignmentSaving, setAssetAssignmentSaving] = useState(false);
  const [compilingGroupId, setCompilingGroupId] = useState<string | null>(null);
  const [compilingAssetKey, setCompilingAssetKey] = useState<string | null>(null);
  const [uploadingGroupId, setUploadingGroupId] = useState<string | null>(null);
  const [compileBanner, setCompileBanner] = useState<string | null>(null);
  const compileBannerTimerRef = useRef<number | null>(null);
  const [compileResultModal, setCompileResultModal] = useState<{
    groupId: string;
    groupName: string;
    result: ConfigurationGroupCompileResult;
  } | null>(null);
  const [acceptanceModalGroupId, setAcceptanceModalGroupId] = useState<string | null>(null);
  const [selectedAssetRowIds, setSelectedAssetRowIds] = useState<string[]>([]);
  const [openSidebarMenuId, setOpenSidebarMenuId] = useState<string | null>(null);
  const [openAssetMenuId, setOpenAssetMenuId] = useState<string | null>(null);
  const [assetOverrideModal, setAssetOverrideModal] = useState<{
    rowId: string;
    groupId: string;
    assetKey: string;
    description: string;
    notificationBinding: string;
    deviceBinding: string;
  } | null>(null);
  const [assetOverrideSaving, setAssetOverrideSaving] = useState(false);
  const openedGroupFromQueryRef = useRef("");
  const [columnPrefsSite, setColumnPrefsSite] = useState(() => readActiveSiteName());
  const [hiddenConfigAssetCols, setHiddenConfigAssetCols] = useState<string[]>(() =>
    readHiddenConfigAssetColumns(readActiveSiteName())
  );
  const [assetColMenuPos, setAssetColMenuPos] = useState<{ top: number; left: number } | null>(null);
  const assetColMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleSiteChange = () => setColumnPrefsSite(readActiveSiteName());
    window.addEventListener("vivi:orgchange", handleSiteChange);
    window.addEventListener("vivi:contextchange", handleSiteChange);
    return () => {
      window.removeEventListener("vivi:orgchange", handleSiteChange);
      window.removeEventListener("vivi:contextchange", handleSiteChange);
    };
  }, []);

  useEffect(() => {
    setHiddenConfigAssetCols(readHiddenConfigAssetColumns(columnPrefsSite));
  }, [columnPrefsSite]);

  useEffect(() => {
    if (!assetColMenuPos) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (assetColMenuRef.current?.contains(event.target as Node)) return;
      setAssetColMenuPos(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [assetColMenuPos]);

  const isConfigAssetColVisible = (col: string) => !hiddenConfigAssetCols.includes(col);

  const toggleConfigAssetCol = (col: string) => {
    if (CONFIG_ASSET_FIXED_COLUMNS.has(col)) return;
    const next = hiddenConfigAssetCols.includes(col)
      ? hiddenConfigAssetCols.filter((item) => item !== col)
      : [...hiddenConfigAssetCols, col];
    setHiddenConfigAssetCols(next);
    writeUserPrefJson(configAssetColumnPrefsKey(columnPrefsSite), { hidden: next });
  };

  const resolveLinkedSourceUpdatedAt = useCallback(
    (group: ConfigGroupRecord | undefined) => {
      if (!group) return undefined;
      const refs = [group.notificationBinding, group.locationBinding, group.deviceBinding]
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean);
      let bestMs = Number.NaN;
      let bestIso = "";
      for (const ref of refs) {
        const iso = String(bindingSourceUpdatedAtByName[ref] ?? "").trim();
        if (!iso) continue;
        const ms = Date.parse(iso);
        if (!Number.isFinite(ms)) continue;
        if (!Number.isFinite(bestMs) || ms > bestMs) {
          bestMs = ms;
          bestIso = iso;
        }
      }
      return bestIso || undefined;
    },
    [bindingSourceUpdatedAtByName]
  );

  const resolveChangeSource = useCallback(
    (group: ConfigGroupRecord): ConfigGroupChangeSource => ({
      linkedSourceUpdatedAt: resolveLinkedSourceUpdatedAt(group),
      currentSourceFingerprint: configGroupSourceFingerprint(group, configGroupSources)
    }),
    [configGroupSources, resolveLinkedSourceUpdatedAt]
  );
  // Long-lived loaders (scope-change listeners) read the latest resolver through this ref.
  const resolveChangeSourceRef = useRef(resolveChangeSource);
  resolveChangeSourceRef.current = resolveChangeSource;

  const showCompileStartedBanner = (message: string) => {
    if (compileBannerTimerRef.current != null) {
      window.clearTimeout(compileBannerTimerRef.current);
      compileBannerTimerRef.current = null;
    }
    setCompileBanner(message);
    compileBannerTimerRef.current = window.setTimeout(() => {
      setCompileBanner(null);
      compileBannerTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (compileBannerTimerRef.current != null) {
        window.clearTimeout(compileBannerTimerRef.current);
      }
    };
  }, []);

  const loadSiteOptions = async () => {
    const sites = new Set<string>();
    const selection = readStoredSelectionScope();
    const activeSite = readActiveSiteName();
    if (activeSite) sites.add(activeSite);

    for (const raw of selection.activeDbSites) {
      const name = String(raw ?? "").trim();
      if (name) sites.add(name);
    }

    const tenantId = String(getTenantId() ?? "").trim();
    const parts = tenantId.split(":").filter(Boolean);
    const [dealerId = "", orgId = "", dbId = ""] = parts;
    const activeDbId = String(selection.activeDbId ?? dbId).trim();

    const collectFromDealers = (dealers: any[]) => {
      for (const dealer of dealers) {
        const dealerMatch =
          !dealerId
          || String(dealer?.id ?? "").trim() === dealerId
          || String(dealer?.id ?? "").trim().toLowerCase() === dealerId.toLowerCase();
        if (dealerId && !dealerMatch) continue;
        for (const org of dealer?.organisations ?? []) {
          const orgMatch =
            !orgId
            || String(org?.id ?? "").trim() === orgId
            || String(org?.id ?? "").trim().toLowerCase() === orgId.toLowerCase();
          if (orgId && !orgMatch) continue;
          for (const db of org?.databases ?? []) {
            const thisDbId = String(db?.id ?? "").trim();
            const dbMatch =
              !activeDbId
              || thisDbId === activeDbId
              || thisDbId.toLowerCase() === activeDbId.toLowerCase();
            if (activeDbId && !dbMatch) continue;
            for (const site of db?.sites ?? []) {
              const name = String(site?.name ?? "").trim();
              if (name) sites.add(name);
            }
          }
        }
      }
    };

    // Merge hierarchy/local dealers so newly created sites appear.
    try {
      const dealersRaw = window.localStorage.getItem("vivi.org.dealers");
      if (dealersRaw) {
        const dealers = JSON.parse(dealersRaw);
        if (Array.isArray(dealers)) collectFromDealers(dealers);
      }
    } catch {
      // ignore
    }

    try {
      const hierarchy = await getHierarchy();
      collectFromDealers(hierarchy.dealers ?? []);
    } catch {
      // ignore
    }

    setSiteOptions(dedupeStrings(Array.from(sites)));
  };

  const selectedDeviceBinding = String(formDraft["Devices binding"] ?? "").trim();
  const selectedDeviceAllowsLocationBinding = selectedDeviceBinding
    ? Boolean(deviceLocationMonitoringByName[selectedDeviceBinding.toLowerCase()])
    : false;

  const editingConfigGroup = useMemo<ConfigGroupRecord | null>(() => {
    if (location.pathname !== configGroupPath) return null;
    const id = editingRowId ?? "";
    const stored = id ? configGroups[id] : null;
    const name = String(formDraft["Group name"] ?? stored?.name ?? "").trim();
    const site = String(formDraft["Site"] ?? stored?.site ?? "").trim();
    if (!name && !site && !id) return null;
    return {
      id,
      name,
      site,
      notificationBinding: stored?.notificationBinding ?? "",
      locationBinding: stored?.locationBinding ?? "",
      deviceBinding: stored?.deviceBinding ?? "",
      status: stored?.status,
      updatedAt: stored?.updatedAt
    };
  }, [configGroups, editingRowId, formDraft, location.pathname]);

  const tenantAssetsByKey = useMemo(() => {
    const map = new Map<string, TenantAsset>();
    for (const asset of tenantAssets) {
      const key = assetStableKey(asset);
      if (key) map.set(key, asset);
    }
    return map;
  }, [tenantAssets]);

  const availableAssetsToAssign = useMemo(() => {
    if (!editingConfigGroup) return [];
    const site = String(editingConfigGroup.site ?? "").trim();
    return tenantAssets
      .filter((asset) => assetMatchesSite(asset, site))
      .filter((asset) => !assetAssignedToOtherGroup(asset, editingConfigGroup))
      .filter((asset) => {
        const key = assetStableKey(asset);
        return key && !assignedAssetKeys.includes(key);
      })
      .sort((left, right) => assetDisplayLabel(left).localeCompare(assetDisplayLabel(right)));
  }, [assignedAssetKeys, editingConfigGroup, tenantAssets]);

  const assignedAssetRows = useMemo(
    () =>
      assignedAssetKeys
        .map((key) => {
          const asset = tenantAssetsByKey.get(key);
          return asset ? { key, asset, label: assetDisplayLabel(asset) } : null;
        })
        .filter((row): row is { key: string; asset: TenantAsset; label: string } => Boolean(row))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [assignedAssetKeys, tenantAssetsByKey]
  );

  useEffect(() => {
    if (!modalOpen || location.pathname !== configGroupPath) return;
    let cancelled = false;

    void (async () => {
      const assets = await getAssetsFromApi<TenantAsset>().catch(() => [] as TenantAsset[]);
      if (cancelled) return;
      setTenantAssets(assets);

      const group = editingRowId ? configGroups[editingRowId] : null;
      const groupName = String(formDraft["Group name"] ?? group?.name ?? "").trim();
      const site = String(formDraft["Site"] ?? group?.site ?? "").trim();
      const groupStub: ConfigGroupRecord = {
        id: editingRowId ?? "",
        name: groupName,
        site,
        notificationBinding: "",
        locationBinding: "",
        deviceBinding: ""
      };

      const allGroups = Object.values(configGroups);
      const keys = listAssetsForConfigGroup(groupStub, assets, allGroups)
        .map((asset) => assetStableKey(asset))
        .filter(Boolean);
      setAssignedAssetKeys(keys);
      setAssetPickerValue("");
    })();

    return () => {
      cancelled = true;
    };
  }, [modalOpen, editingRowId, location.pathname]);

  const toggleAssignedAsset = (key: string, checked: boolean) => {
    setAssignedAssetKeys((current) => {
      if (checked) return current.includes(key) ? current : [...current, key];
      return current.filter((value) => value !== key);
    });
  };

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    if (selectedDeviceAllowsLocationBinding) return;
    setFormDraft((current) => {
      if (!current["Location binding"]) return current;
      return { ...current, ["Location binding"]: "" };
    });
  }, [location.pathname, selectedDeviceAllowsLocationBinding]);

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    void loadSiteOptions();
  }, [location.pathname]);

  useEffect(() => {
    if (!modalOpen || location.pathname !== configGroupPath) return;
    void loadSiteOptions();
    if (modalMode === "create") {
      const activeSite = readActiveSiteName();
      if (activeSite) {
        setFormDraft((current) => {
          if (String(current.Site ?? "").trim()) return current;
          return { ...current, Site: activeSite };
        });
      }
    }
  }, [modalOpen, modalMode, location.pathname]);

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    const handleOrgChange = () => {
      void loadSiteOptions();
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => window.removeEventListener("vivi:orgchange", handleOrgChange);
  }, [location.pathname]);

  useEffect(() => {
    if (!page || location.pathname === configGroupPath) return;
    let cancelled = false;
    const storageBase = `control:config:${page.title}`;
    void loadSharedAdminRows(storageBase).then((rows) => {
      if (cancelled || !rows) return;
      setRowsByPath((current) => ({ ...current, [location.pathname]: rows }));
    });
    const handleOrgChange = () => {
      void loadSharedAdminRows(storageBase).then((rows) => {
        if (cancelled || !rows) return;
        setRowsByPath((current) => ({ ...current, [location.pathname]: rows }));
      });
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:orgchange", handleOrgChange);
    };
  }, [location.pathname, page]);

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    let mounted = true;

    const applyConfigurationGroups = async () => {
      purgeMockConfigurationGroupsFromLocalStorage();
      const cacheKey = configGroupsCacheKey();
      const [groups, assets] = await Promise.all([
        getConfigurationGroups<ConfigGroupRecord>(),
        getAssetsFromApi<unknown>().catch(() => [] as unknown[])
      ]);
      if (!mounted) return;

      for (const group of groups) {
        if (!isMockConfigurationGroup(group)) continue;
        try {
          await deleteConfigurationGroup(group.id);
        } catch {
          // ignore
        }
      }

      const scopedGroups = filterRecordsForActiveSelection(filterOutMockConfigurationGroups(groups));
      const storedGroups = filterRecordsForActiveSelection(
        filterOutMockConfigurationGroups(readStoredConfigGroups(cacheKey))
      );

      if (scopedGroups.length) {
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify(scopedGroups));
        } catch {
          // ignore
        }
      }

      const source = resolveConfigGroupRecords(scopedGroups, storedGroups);
      if (!source.length) {
        // Keep the last good table during transient API / scope reloads.
        if (Object.keys(configGroups).length > 0) return;
        setConfigGroups({});
        setRowsByPath((current) => ({ ...current, [configGroupPath]: [] }));
        return;
      }

      const typedAssets = assets as TenantAsset[];
      setTenantAssets(typedAssets);
      const assetCountsByRef = countAssetsForConfigGroups(source, typedAssets);
      const byId: Record<string, ConfigGroupRecord> = {};
      const rows: AdminRow[] = source.map((group) => {
        byId[group.id] = group;
        return buildConfigGroupAdminRow(group, assetCountsByRef, resolveChangeSourceRef.current(group));
      });
      setConfigGroups(byId);
      setRowsByPath((current) => ({ ...current, [configGroupPath]: rows }));
      setSelectedSidebarGroupId((current) => {
        if (current === "all") return current;
        return byId[current] ? current : "all";
      });
    };

    void applyConfigurationGroups();
    const handleScopeChange = () => {
      void applyConfigurationGroups();
    };
    window.addEventListener("vivi:orgchange", handleScopeChange);
    window.addEventListener("vivi:contextchange", handleScopeChange);
    return () => {
      mounted = false;
      window.removeEventListener("vivi:orgchange", handleScopeChange);
      window.removeEventListener("vivi:contextchange", handleScopeChange);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    let mounted = true;
    const loadOptions = async () => {
      const [notifications, locations, devices] = await Promise.all([
        getBindings<{ name?: string; updatedAt?: string }>("notifications"),
        getBindings<{ name?: string; locationsConfig?: unknown[]; updatedAt?: string }>("locations"),
        getBindings<DeviceBindingOptionRecord & { updatedAt?: string }>("devices")
      ]);
      if (!mounted) return;

      const siteForOptions = String(formDraft["Site"] ?? readActiveSiteName()).trim();
      const notificationNames = notifications
        .filter((item) => isUserNotificationBinding(item))
        .filter((item) => Boolean(siteForOptions) && bindingMatchesSite(item, siteForOptions))
        .map((item) => String(item.name ?? "").trim())
        .filter(Boolean);
      setNotificationOptions(dedupeStrings(notificationNames.length ? notificationNames : defaultNotificationBindingOptions));

      const locationNames = locations
        .filter((item) => Boolean(siteForOptions) && bindingMatchesSite(item, siteForOptions))
        .filter((item) => Array.isArray(item.locationsConfig) && item.locationsConfig.length > 0)
        .map((item) => String(item.name ?? "").trim())
        .filter(Boolean);
      setLocationOptions(dedupeStrings(locationNames));
      const deviceNames = dedupeStrings(
        devices
          .filter((item) => Boolean(siteForOptions) && bindingMatchesSite(item, siteForOptions))
          .map((item) => String(item.name ?? "").trim())
          .filter(Boolean)
      );
      setDeviceOptions(deviceNames);
      const nextDeviceMonitoringMap = devices.reduce<Record<string, boolean>>((acc, item) => {
        const name = String(item?.name ?? "").trim();
        if (!name) return acc;
        if (siteForOptions && !bindingMatchesSite(item, siteForOptions)) return acc;
        const enabled = Boolean(
          item?.locationSpeedMonitoring === true
          || item?.advancedSettings?.locationSpeedMonitoring === true
        );
        acc[name.toLowerCase()] = enabled;
        return acc;
      }, {});
      setDeviceLocationMonitoringByName(nextDeviceMonitoringMap);
      setBindingSourceUpdatedAtByName((current) =>
        mergeBindingSourceUpdatedAts(current, [...notifications, ...locations, ...devices])
      );
    };
    void loadOptions();
    return () => {
      mounted = false;
    };
  }, [location.pathname, formDraft["Site"]]);

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    const handleOrgChange = () => {
      void (async () => {
        const [notifications, locations, devices] = await Promise.all([
          getBindings<{ name?: string; updatedAt?: string }>("notifications"),
          getBindings<{ name?: string; locationsConfig?: unknown[]; updatedAt?: string }>("locations"),
          getBindings<DeviceBindingOptionRecord & { updatedAt?: string }>("devices")
        ]);

        const siteForOptions = String(formDraft["Site"] ?? readActiveSiteName()).trim();
        const notificationNames = notifications
          .filter((item) => isUserNotificationBinding(item))
          .filter((item) => Boolean(siteForOptions) && bindingMatchesSite(item, siteForOptions))
          .map((item) => String(item.name ?? "").trim())
          .filter(Boolean);
        setNotificationOptions(dedupeStrings(notificationNames.length ? notificationNames : defaultNotificationBindingOptions));

        const locationNames = locations
          .filter((item) => Boolean(siteForOptions) && bindingMatchesSite(item, siteForOptions))
          .filter((item) => Array.isArray(item.locationsConfig) && item.locationsConfig.length > 0)
          .map((item) => String(item.name ?? "").trim())
          .filter(Boolean);
        setLocationOptions(dedupeStrings(locationNames));
        const deviceNames = dedupeStrings(
          devices
            .filter((item) => Boolean(siteForOptions) && bindingMatchesSite(item, siteForOptions))
            .map((item) => String(item.name ?? "").trim())
            .filter(Boolean)
        );
        setDeviceOptions(deviceNames);
        const nextDeviceMonitoringMap = devices.reduce<Record<string, boolean>>((acc, item) => {
          const name = String(item?.name ?? "").trim();
          if (!name) return acc;
          if (siteForOptions && !bindingMatchesSite(item, siteForOptions)) return acc;
          const enabled = Boolean(
            item?.locationSpeedMonitoring === true
            || item?.advancedSettings?.locationSpeedMonitoring === true
          );
          acc[name.toLowerCase()] = enabled;
          return acc;
        }, {});
        setDeviceLocationMonitoringByName(nextDeviceMonitoringMap);
        setBindingSourceUpdatedAtByName((current) =>
          mergeBindingSourceUpdatedAts(current, [...notifications, ...locations, ...devices])
        );
      })();
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    window.addEventListener("vivi:bindingschange", handleOrgChange);
    window.addEventListener("vivi:notificationLibraryUpdated", handleOrgChange);
    return () => {
      window.removeEventListener("vivi:orgchange", handleOrgChange);
      window.removeEventListener("vivi:bindingschange", handleOrgChange);
      window.removeEventListener("vivi:notificationLibraryUpdated", handleOrgChange);
    };
  }, [location.pathname, formDraft["Site"]]);

  const configGroupSitesKey = useMemo(
    () =>
      dedupeStrings([
        readActiveSiteName(),
        ...Object.values(configGroups).map((group) => String(group.site ?? ""))
      ]).join("\n"),
    [configGroups]
  );

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    let mounted = true;
    const sites = configGroupSitesKey ? configGroupSitesKey.split("\n") : [];
    const reload = () => {
      void loadConfigGroupSourceState(sites)
        .then((state) => {
          if (mounted) setConfigGroupSources(state);
        })
        .catch(() => {
          // Keep the last known sources on transient failures.
        });
    };
    reload();
    const events = ["vivi:orgchange", "vivi:contextchange", "vivi:bindingschange", "vivi:notificationLibraryUpdated"];
    for (const name of events) window.addEventListener(name, reload);
    return () => {
      mounted = false;
      for (const name of events) window.removeEventListener(name, reload);
    };
  }, [location.pathname, configGroupSitesKey]);

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    const groups = Object.values(configGroups);
    if (!groups.length) return;
    const assetCountsByRef = countAssetsForConfigGroups(groups, tenantAssets);
    setRowsByPath((current) => {
      const rows = current[configGroupPath] ?? [];
      return {
        ...current,
        [configGroupPath]: rows.map((row) => {
          const group = configGroups[row.id];
          return group ? buildConfigGroupAdminRow(group, assetCountsByRef, resolveChangeSource(group)) : row;
        })
      };
    });
    // Only re-derive when binding sources change; group/asset edits rebuild their own rows.
  }, [resolveChangeSource]);

  const sidebarGroups = useMemo(() => {
    return Object.values(configGroups)
      .slice()
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" }));
  }, [configGroups]);

  const allConfigAssetRows = useMemo(() => {
    if (location.pathname !== configGroupPath) return [] as ConfigAssetDetailRow[];
    return buildConfigAssetDetailRows(sidebarGroups, tenantAssets, resolveChangeSource);
  }, [location.pathname, resolveChangeSource, sidebarGroups, tenantAssets]);

  const configAssetRows = useMemo(() => {
    if (selectedSidebarGroupId === "all") return allConfigAssetRows;
    return allConfigAssetRows.filter((row) => row.groupId === selectedSidebarGroupId);
  }, [allConfigAssetRows, selectedSidebarGroupId]);

  const sidebarAssetCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of sidebarGroups) {
      counts.set(group.id, listAssetsForConfigGroup(group, tenantAssets, sidebarGroups).length);
    }
    return counts;
  }, [sidebarGroups, tenantAssets]);

  const filteredConfigAssetRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return configAssetRows.filter((row) => {
      const matchesSearch =
        !needle
        || row.description.toLowerCase().includes(needle)
        || row.assetId.toLowerCase().includes(needle)
        || row.imei.toLowerCase().includes(needle)
        || row.site.toLowerCase().includes(needle)
        || row.groupName.toLowerCase().includes(needle)
        || row.deviceBindingName.toLowerCase().includes(needle)
        || row.notificationBindingName.toLowerCase().includes(needle)
        || row.configurationStatus.toLowerCase().includes(needle)
        || row.configurationChange.toLowerCase().includes(needle);
      if (!matchesSearch) return false;
      if (statusFilter === "all") return true;
      if (statusFilter === CONFIGURATION_CHANGE.CHANGED) {
        return row.configurationChange === CONFIGURATION_CHANGE.CHANGED;
      }
      return row.configurationStatus === statusFilter || row.configurationChange === statusFilter;
    });
  }, [configAssetRows, search, statusFilter]);

  const filteredRows = useMemo(() => {
    if (!page) return [];
    if (location.pathname === configGroupPath) return [];
    const rows = rowsByPath[location.pathname] ?? [];
    return rows.filter((row) => {
      const matchesSearch = row.cells.some((cell) => cell.toLowerCase().includes(search.toLowerCase()));
      if (statusFilter === "all") return matchesSearch;
      const matchesStatus = row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [location.pathname, page, rowsByPath, search, statusFilter]);

  const getAdminRowSortValue = useCallback(
    (row: AdminRow, key: string) => {
      const columns = page?.columns ?? [];
      const index = columns.indexOf(key);
      if (index < 0) return "";
      return row.cells[index] ?? "";
    },
    [page]
  );
  const adminRowSort = useColumnSort({ rows: filteredRows, getValue: getAdminRowSortValue });

  const getConfigAssetSortValue = useCallback((row: ConfigAssetDetailRow, key: string) => {
    switch (key) {
      case "Flag":
        return row.flagged ? "1" : "0";
      case "Asset description":
        return row.description;
      case "Configuration group":
        return row.groupName;
      case "Asset ID":
        return row.assetId;
      case "IMEI":
        return row.imei;
      case "Site":
        return row.site;
      case "Mobile Device Binding":
        return row.deviceBindingName;
      case "Notification Binding":
        return row.notificationBindingName;
      case "Configuration Date":
        return row.configurationDate;
      case "Configuration status":
        return row.configurationStatus;
      case "Config Compile Status":
        return row.configurationChange;
      default:
        return "";
    }
  }, []);
  const configAssetSort = useColumnSort({
    rows: filteredConfigAssetRows,
    getValue: getConfigAssetSortValue
  });
  const configAssetVisibleColumns = useMemo(
    () => pageConfigs[configGroupPath].columns.filter((col) => !hiddenConfigAssetCols.includes(col)),
    [hiddenConfigAssetCols]
  );
  const configAssetGrid = configAssetVisibleColumns
    .map((col) => CONFIG_ASSET_COLUMN_WIDTHS[col] ?? "minmax(100px, 1fr)")
    .join(" ");
  // Sum of track minimums (+ grid gaps) so hiding columns also narrows the scroll width.
  const configAssetMinWidth = configAssetVisibleColumns.reduce((total, col) => {
    const match = /(\d+)px/.exec(CONFIG_ASSET_COLUMN_WIDTHS[col] ?? "100px");
    return total + Number(match?.[1] ?? 100) + 12;
  }, 0);
  const configAssetRowStyle: CSSProperties = {
    gridTemplateColumns: configAssetGrid,
    minWidth: `${configAssetMinWidth}px`
  };

  const selectedSidebarGroup =
    selectedSidebarGroupId === "all" ? null : configGroups[selectedSidebarGroupId] ?? null;

  useEffect(() => {
    if (!openSidebarMenuId && !openAssetMenuId) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".config-groups-menu") || target.closest(".config-groups-menu-btn")) return;
      setOpenSidebarMenuId(null);
      setOpenAssetMenuId(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [openSidebarMenuId, openAssetMenuId]);

  useEffect(() => {
    if (location.pathname !== configGroupPath) {
      openedGroupFromQueryRef.current = "";
      return;
    }
    const requested = String(searchParams.get("group") ?? "").trim();
    if (!requested) {
      openedGroupFromQueryRef.current = "";
      return;
    }
    if (openedGroupFromQueryRef.current === requested) return;
    const rows = rowsByPath[configGroupPath] ?? [];
    const needle = requested.toLowerCase();
    const match = rows.find((row) => {
      const group = configGroups[row.id];
      const name = String(group?.name ?? row.cells[0] ?? "").trim();
      return (
        row.id === requested
        || name === requested
        || row.id.toLowerCase() === needle
        || name.toLowerCase() === needle
      );
    });
    if (!match) return;
    const group = configGroups[match.id];
    openedGroupFromQueryRef.current = requested;
    setFormDraft({
      "Group name": group?.name ?? match.cells[0] ?? "",
      Site: group?.site ?? match.cells[1] ?? "",
      "Notifications binding": group?.notificationBinding ?? "",
      "Location binding": group?.locationBinding ?? "",
      "Devices binding": group?.deviceBinding ?? ""
    });
    setEditingRowId(match.id);
    setModalMode("edit");
    setModalOpen(true);
  }, [configGroups, location.pathname, rowsByPath, searchParams]);

  if (!page) {
    return <div className="page admin-page">Page not found.</div>;
  }

  const buildRowFromDraft = () => {
    const columns = page.columns.filter((col) => col !== "Actions");
    const fields = page.formFields ?? [];
    if (location.pathname === configGroupPath) {
      const name = formDraft["Group name"] ?? "";
      const statusValue = "Active";
      const site = formDraft["Site"] ?? "";
      return {
        id: `cfg-${Date.now()}`,
        cells: [name, site, "0", "Just now", statusValue],
        status: statusValue.toLowerCase()
      } as AdminRow;
    }
    const cells = columns.map((col, index) => {
      const field = fields[index];
      if (field) return formDraft[field.label] ?? "";
      if (col.toLowerCase() === "status") return "Active";
      return "";
    });
    const statusIndex = columns.findIndex((col) => col.toLowerCase() === "status");
    const statusValue = statusIndex >= 0 ? String(cells[statusIndex] ?? "active").toLowerCase() : undefined;
    return {
      id: `row-${Date.now()}`,
      cells,
      status: statusValue
    } as AdminRow;
  };

  const buildDraftFromGroup = (group: ConfigGroupRecord) => ({
    "Group name": group.name ?? "",
    Site: group.site ?? "",
    "Notifications binding": group.notificationBinding ?? "",
    "Location binding": group.locationBinding ?? "",
    "Devices binding": group.deviceBinding ?? ""
  });

  const buildDraftFromRow = (row: AdminRow) => {
    const fields = page.formFields ?? [];
    if (location.pathname === configGroupPath) {
      const group = configGroups[row.id];
      if (group) return buildDraftFromGroup(group);
      return {
        "Group name": row.cells[0] ?? "",
        Site: row.cells[1] ?? "",
        "Notifications binding": "",
        "Location binding": "",
        "Devices binding": ""
      };
    }
    return fields.reduce<Record<string, string>>((acc, field, index) => {
      acc[field.label] = row.cells[index] ?? "";
      return acc;
    }, {});
  };

  const openConfigGroupEditor = (groupId: string, mode: "edit" | "view" = "edit") => {
    const group = configGroups[groupId];
    if (!group) return;
    setFormDraft(buildDraftFromGroup(group));
    setEditingRowId(groupId);
    setModalMode(mode);
    setModalOpen(true);
    setOpenSidebarMenuId(null);
    setOpenAssetMenuId(null);
  };

  /** Open shared Bindings settings for a named binding (site-scoped; visible to everyone on the site). */
  const openBindingSettingsPanel = (
    kind: "notifications" | "devices",
    bindingName: string
  ) => {
    const name = String(bindingName ?? "").trim();
    if (!name) {
      showToast("No binding is assigned yet. Edit the configuration group first.", "info");
      return;
    }
    navigate(BINDINGS_PAGE_PATH, {
      state: {
        section: kind === "notifications" ? "Notifications Bindings" : "Devices Bindings",
        bindingName: name
      }
    });
  };

  const findTenantAssetByKey = useCallback(
    (assetKey: string) =>
      tenantAssets.find((asset) => assetStableKey(asset) === assetKey) ?? null,
    [tenantAssets]
  );

  const effectiveGroupForAsset = useCallback(
    (group: ConfigGroupRecord, asset: TenantAsset | null): ConfigGroupRecord => {
      if (!asset || !assetHasBindingOverride(asset)) return group;
      return {
        ...group,
        notificationBinding: readAssetNotificationBinding(asset, group.notificationBinding),
        deviceBinding: readAssetDeviceBinding(asset, group.deviceBinding)
      };
    },
    []
  );

  const toggleAssetRowSelected = (rowId: string) => {
    setSelectedAssetRowIds((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]
    );
  };

  const openAssetOverrideEditor = (row: ConfigAssetDetailRow) => {
    const group = configGroups[row.groupId];
    if (!group) return;
    setAssetOverrideModal({
      rowId: row.id,
      groupId: row.groupId,
      assetKey: row.assetKey,
      description: row.description,
      notificationBinding: row.notificationBindingName || group.notificationBinding || "",
      deviceBinding: row.deviceBindingName || group.deviceBinding || ""
    });
    setOpenAssetMenuId(null);
  };

  const handleSaveAssetBindingOverride = async () => {
    if (!assetOverrideModal) return;
    const notificationBinding = String(assetOverrideModal.notificationBinding ?? "").trim();
    const deviceBinding = String(assetOverrideModal.deviceBinding ?? "").trim();
    if (!notificationBinding || !deviceBinding) {
      showToast("Select both notification and mobile device bindings.", "error");
      return;
    }
    const asset = findTenantAssetByKey(assetOverrideModal.assetKey);
    if (!asset) {
      showToast("Asset not found.", "error");
      return;
    }
    setAssetOverrideSaving(true);
    try {
      const nextAsset: TenantAsset = {
        ...asset,
        [ASSET_OVERRIDE_FLAG_KEY]: true,
        [ASSET_NOTIFICATION_OVERRIDE_KEY]: notificationBinding,
        [ASSET_DEVICE_OVERRIDE_KEY]: deviceBinding
      };
      const saved = await upsertAssetDetailed(nextAsset);
      if (!saved.stored) {
        showToast(saved.error || "Failed to save asset binding overrides.", "error");
        return;
      }
      setTenantAssets((current) =>
        current.map((row) => (assetStableKey(row) === assetOverrideModal.assetKey ? nextAsset : row))
      );
      setAssetOverrideModal(null);
      showToast("Asset bindings saved. Asset is flagged — compile and upload when ready.", "success");
      window.dispatchEvent(new Event("vivi:orgchange"));
    } finally {
      setAssetOverrideSaving(false);
    }
  };

  const handleResetAssetBindingOverride = async (row: ConfigAssetDetailRow) => {
    const asset = findTenantAssetByKey(row.assetKey);
    if (!asset) {
      showToast("Asset not found.", "error");
      return;
    }
    setOpenAssetMenuId(null);
    const nextAsset: TenantAsset = {
      ...asset,
      [ASSET_OVERRIDE_FLAG_KEY]: false,
      [ASSET_NOTIFICATION_OVERRIDE_KEY]: "",
      [ASSET_DEVICE_OVERRIDE_KEY]: ""
    };
    const saved = await upsertAssetDetailed(nextAsset);
    if (!saved.stored) {
      showToast(saved.error || "Failed to reset asset bindings.", "error");
      return;
    }
    setTenantAssets((current) =>
      current.map((item) => (assetStableKey(item) === row.assetKey ? nextAsset : item))
    );
    showToast("Asset reset to configuration group bindings. Compile and upload again.", "info");
    window.dispatchEvent(new Event("vivi:orgchange"));
  };

  const handleSuspendConfigGroup = async (groupId: string) => {
    const group = configGroups[groupId];
    if (!group) return;
    setOpenSidebarMenuId(null);
    const payload: ConfigGroupRecord = {
      ...group,
      status: "Suspended",
      updatedAt: new Date().toISOString()
    };
    await saveConfigurationGroup(payload);
    setConfigGroups((current) => ({ ...current, [groupId]: payload }));
    showToast(`Suspended ${group.name || "configuration group"}.`, "info");
  };

  const handleResumeConfigGroup = async (groupId: string) => {
    const group = configGroups[groupId];
    if (!group) return;
    setOpenSidebarMenuId(null);
    const payload: ConfigGroupRecord = {
      ...group,
      status: "Active",
      updatedAt: new Date().toISOString()
    };
    await saveConfigurationGroup(payload);
    setConfigGroups((current) => ({ ...current, [groupId]: payload }));
    showToast(`Resumed ${group.name || "configuration group"}.`, "success");
  };

  const handleUploadConfigGroup = async (groupId: string) => {
    const group = configGroups[groupId];
    if (!group) return;
    if (String(group.status ?? "").toLowerCase() === "suspended") {
      showToast("Resume this configuration group before uploading.", "error");
      return;
    }
    setOpenSidebarMenuId(null);
    if (uploadingGroupId || compilingGroupId) {
      showToast("A compile or upload is already running.", "info");
      return;
    }
    const groupRows = allConfigAssetRows.filter((row) => row.groupId === groupId);
    const selectedInGroup = groupRows.filter((row) => selectedAssetRowIds.includes(row.id));
    const targetRows = selectedInGroup.length ? selectedInGroup : groupRows;
    const uploadRows = targetRows.filter((row) => {
      const acceptance = group.compileAcceptance as ConfigGroupCompileAcceptance | undefined;
      const outcome = (acceptance?.assets ?? []).find((item) => item.assetKey === row.assetKey);
      return Boolean(outcome?.accepted);
    });
    if (!uploadRows.length) {
      showToast("Compile accepted assets first, then upload.", "error");
      return;
    }
    setUploadingGroupId(groupId);
    showCompileStartedBanner(`Uploading compiled configuration for ${group.name || "group"}…`);
    try {
      const sourceFingerprint = await captureConfigGroupSourceFingerprint(group);
      const uploadedAt = new Date().toISOString();
      let uploaded = 0;
      for (const row of uploadRows) {
        const asset = findTenantAssetByKey(row.assetKey);
        if (!asset) continue;
        const nextAsset: TenantAsset = {
          ...asset,
          configUploadDate: uploadedAt
        };
        const ok = await upsertAssetToApi(nextAsset);
        if (!ok) continue;
        uploaded += 1;
        setTenantAssets((current) =>
          current.map((item) => (assetStableKey(item) === row.assetKey ? nextAsset : item))
        );
        // Re-push compiled settings for this asset using effective (override or group) bindings.
        const effectiveGroup = effectiveGroupForAsset(group, nextAsset);
        await compileConfigurationGroupAssetToTraccar(effectiveGroup, row.assetKey);
      }
      if (uploaded > 0 && uploaded === groupRows.length) {
        const payload = await persistConfigGroupSourceSnapshot(group, sourceFingerprint);
        updateConfigGroupRowAfterCompile(payload, tenantAssets);
      }
      showToast(
        uploaded
          ? `Uploaded compiled configuration for ${uploaded} asset${uploaded === 1 ? "" : "s"}.`
          : "No assets were uploaded.",
        uploaded ? "success" : "error"
      );
      window.dispatchEvent(new Event("vivi:orgchange"));
    } catch (err: any) {
      showToast(String(err?.message ?? err ?? "Upload failed."), "error");
    } finally {
      setUploadingGroupId(null);
    }
  };

  const updateConfigGroupRowAfterCompile = (payload: ConfigGroupRecord, assets: TenantAsset[]) => {
    const allGroups = Object.values(configGroups);
    const withPayload = allGroups.some((group) => group.id === payload.id)
      ? allGroups.map((group) => (group.id === payload.id ? payload : group))
      : [...allGroups, payload];
    const assetCountsByRef = countAssetsForConfigGroups(withPayload, assets);
    const nextRow = buildConfigGroupAdminRow(payload, assetCountsByRef, resolveChangeSourceRef.current(payload));
    setConfigGroups((current) => ({ ...current, [payload.id]: payload }));
    setRowsByPath((current) => {
      const rows = current[configGroupPath] ?? [];
      return {
        ...current,
        [configGroupPath]: rows.map((row) => (row.id === payload.id ? nextRow : row))
      };
    });
  };

  const handleCompileConfigGroup = async (rowId: string) => {
    const group = configGroups[rowId];
    if (!group) return;
    setOpenSidebarMenuId(null);
    if (String(group.status ?? "").toLowerCase() === "suspended") {
      showToast("Resume this configuration group before compiling.", "error");
      return;
    }
    if (!canCompileConfigGroup(group, deviceLocationMonitoringByName)) {
      showToast(
        "Set site, notifications, and devices bindings (and location when required) before compiling.",
        "error"
      );
      return;
    }
    if (compilingGroupId) {
      showToast("A compile is already running. You can keep using the page while it finishes.", "info");
      return;
    }
    setCompilingGroupId(rowId);
    setCompileResultModal(null);
    showCompileStartedBanner(
      `Compiling configuration for ${String(group.name ?? "group").trim() || "group"}…`
    );
    // Clear prior Failed label so the row reflects an in-progress compile, not the last run.
    const compilingPlaceholder: ConfigGroupCompileAcceptanceRecord = {
      compiledAt: undefined,
      acceptedCount: 0,
      totalCount: Math.max(0, Number((group as any)?.assignedAssetCount ?? 0)),
      assets: []
    };
    setConfigGroups((current) => ({
      ...current,
      [rowId]: { ...group, compileAcceptance: compilingPlaceholder }
    }));
    try {
      const sourceFingerprint = await captureConfigGroupSourceFingerprint(group);
      const groupAssetRows = allConfigAssetRows.filter((row) => row.groupId === rowId);
      const flaggedKeys = groupAssetRows.filter((row) => row.flagged).map((row) => row.assetKey);
      const unflaggedKeys = groupAssetRows.filter((row) => !row.flagged).map((row) => row.assetKey);

      let result: ConfigurationGroupCompileResult;
      if (!flaggedKeys.length) {
        result = await compileConfigurationGroupToTraccar(group);
      } else {
        // Group defaults for unflagged assets, then each flagged asset with its overrides.
        const baseResult =
          unflaggedKeys.length > 0
            ? await compileConfigurationGroupToTraccar(group, { assetKeys: unflaggedKeys })
            : null;
        let merged = baseResult;
        for (const assetKey of flaggedKeys) {
          const asset = findTenantAssetByKey(assetKey);
          const effectiveGroup = effectiveGroupForAsset(group, asset);
          const assetResult = await compileConfigurationGroupAssetToTraccar(effectiveGroup, assetKey);
          if (!merged) {
            merged = assetResult;
            continue;
          }
          const compileAcceptance = {
            compiledAt: assetResult.compileAcceptance?.compiledAt ?? merged.compileAcceptance?.compiledAt,
            acceptedCount: 0,
            totalCount: groupAssetRows.length,
            assets: [
              ...(merged.compileAcceptance?.assets ?? []).filter(
                (row) => !assetResult.compileAcceptance?.assets?.some((next) => next.assetKey === row.assetKey)
              ),
              ...(assetResult.compileAcceptance?.assets ?? [])
            ],
            sourceSnapshot:
              assetResult.compileAcceptance?.sourceSnapshot ?? merged.compileAcceptance?.sourceSnapshot
          };
          compileAcceptance.acceptedCount = compileAcceptance.assets.filter((row) => row.accepted).length;
          merged = {
            ...merged,
            ok: merged.ok && assetResult.ok,
            errors: [...(merged.errors ?? []), ...(assetResult.errors ?? [])],
            acceptedCount: compileAcceptance.acceptedCount,
            assetOutcomes: compileAcceptance.assets,
            compileAcceptance,
            assetsInGroup: groupAssetRows.length
          };
        }
        result =
          merged ??
          (await compileConfigurationGroupToTraccar(group));
      }

      const payload = await persistCompiledConfigGroup(group, result, sourceFingerprint);
      const assets = await getAssetsFromApi<TenantAsset>().catch(() => [] as TenantAsset[]);
      setTenantAssets(assets);
      updateConfigGroupRowAfterCompile(payload, assets);
      setCompileResultModal({
        groupId: payload.id,
        groupName: payload.name,
        result
      });
      showToast(buildCompileResultMessage(result), result.ok ? "success" : "error");
      window.dispatchEvent(new Event("vivi:orgchange"));
    } catch (err: any) {
      showToast(String(err?.message ?? err ?? "Compile failed. Please try again."), "error");
      setConfigGroups((current) => ({
        ...current,
        [rowId]: group
      }));
    } finally {
      setCompilingGroupId(null);
    }
  };

  const handleCompileConfigGroupAsset = async (groupId: string, assetKey: string) => {
    const group = configGroups[groupId];
    if (!group) return;
    setOpenAssetMenuId(null);
    if (String(group.status ?? "").toLowerCase() === "suspended") {
      showToast("Resume this configuration group before compiling.", "error");
      return;
    }
    if (!canCompileConfigGroup(group, deviceLocationMonitoringByName)) {
      showToast(
        "Set site, notifications, and devices bindings (and location when required) before compiling.",
        "error"
      );
      return;
    }
    const key = String(assetKey ?? "").trim();
    if (!key) return;
    if (compilingGroupId || compilingAssetKey) {
      showToast("A compile is already running. You can keep using the page while it finishes.", "info");
      return;
    }
    setCompilingAssetKey(key);
    showCompileStartedBanner(
      `Compiling configuration for ${String(group.name ?? "group").trim() || "group"}…`
    );
    try {
      const asset = findTenantAssetByKey(key);
      const effectiveGroup = effectiveGroupForAsset(group, asset);
      const sourceFingerprint = await captureConfigGroupSourceFingerprint(group);
      const result = await compileConfigurationGroupAssetToTraccar(effectiveGroup, key);
      const payload = await persistCompiledConfigGroup(group, result, sourceFingerprint);
      const assets = await getAssetsFromApi<TenantAsset>().catch(() => [] as TenantAsset[]);
      setTenantAssets(assets);
      updateConfigGroupRowAfterCompile(payload, assets);
      setConfigGroups((current) => ({ ...current, [payload.id]: payload }));
      if (compileResultModal?.groupId === groupId) {
        setCompileResultModal({
          groupId: payload.id,
          groupName: payload.name,
          result
        });
      }
      showToast(buildCompileResultMessage(result), result.ok ? "success" : "error");
      window.dispatchEvent(new Event("vivi:orgchange"));
    } finally {
      setCompilingAssetKey(null);
    }
  };

  const handleDeleteConfigGroup = async (rowId: string) => {
    const confirmDelete = window.confirm("Delete this configuration group?");
    if (!confirmDelete) return;
    const deleted = await deleteConfigurationGroup(rowId);
    if (!deleted) return;
    setSelectedSidebarGroupId((current) => (current === rowId ? "all" : current));
    setRowsByPath((current) => {
      const rows = current[configGroupPath] ?? [];
      return { ...current, [configGroupPath]: rows.filter((row) => row.id !== rowId) };
    });
    setConfigGroups((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    const deletedGroup = configGroups[rowId];
    const cacheKey = configGroupsCacheKey(String(deletedGroup?.site ?? ""));
    const stored = window.localStorage.getItem(cacheKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const next = parsed.filter((group) => group?.id !== rowId);
          window.localStorage.setItem(cacheKey, JSON.stringify(next));
        }
      } catch {
        // ignore
      }
    }
    window.dispatchEvent(new Event("vivi:orgchange"));
  };

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <div>
          <div className="admin-title">{page.title}</div>
          <div className="admin-path">{page.pathLabel}</div>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-btn ghost">Export</button>
          <button
            type="button"
            className="admin-btn"
            onClick={() => {
              const initial = (page.formFields ?? []).reduce<Record<string, string>>((acc, field) => {
                acc[field.label] = "";
                return acc;
              }, {});
              setFormDraft(initial);
              setModalMode("create");
              setEditingRowId(null);
              setModalOpen(true);
            }}
          >
            Create
          </button>
        </div>
      </div>

      {location.pathname === configGroupPath ? (
        <div className="config-groups-layout">
          <aside className="config-groups-sidebar">
            <button
              type="button"
              className={`config-groups-sideitem${selectedSidebarGroupId === "all" ? " active" : ""}`}
              onClick={() => {
                setSelectedSidebarGroupId("all");
                setOpenSidebarMenuId(null);
              }}
            >
              <span>All groups</span>
              <span className="config-groups-count">{sidebarGroups.length}</span>
            </button>
            {sidebarGroups.map((group) => {
              const isSuspended = String(group.status ?? "").toLowerCase() === "suspended";
              const menuOpen = openSidebarMenuId === group.id;
              return (
                <div
                  key={group.id}
                  className={`config-groups-sideitem-wrap${selectedSidebarGroupId === group.id ? " active" : ""}`}
                >
                  <button
                    type="button"
                    className={`config-groups-sideitem${selectedSidebarGroupId === group.id ? " active" : ""}`}
                    onClick={() => {
                      setSelectedSidebarGroupId(group.id);
                      setOpenSidebarMenuId(null);
                    }}
                  >
                    <span className="config-groups-sidename">
                      {group.name || "Unnamed group"}
                      {isSuspended ? <em className="config-groups-suspended-tag">Suspended</em> : null}
                    </span>
                    <span className="config-groups-count">{sidebarAssetCounts.get(group.id) ?? 0}</span>
                  </button>
                  <div className="config-groups-side-more">
                    <button
                      type="button"
                      className="config-groups-menu-btn"
                      aria-label="More options"
                      aria-expanded={menuOpen}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenSidebarMenuId((current) => (current === group.id ? null : group.id));
                        setOpenAssetMenuId(null);
                      }}
                    >
                      ⋮
                    </button>
                    {menuOpen && (
                      <div className="config-groups-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openConfigGroupEditor(group.id, "edit")}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={
                            isSuspended
                            || compilingGroupId === group.id
                            || !canCompileConfigGroup(group, deviceLocationMonitoringByName)
                          }
                          onClick={() => void handleCompileConfigGroup(group.id)}
                        >
                          {compilingGroupId === group.id ? "Compiling…" : "Compile"}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={isSuspended || uploadingGroupId === group.id}
                          onClick={() => void handleUploadConfigGroup(group.id)}
                        >
                          {uploadingGroupId === group.id ? "Uploading…" : "Upload"}
                        </button>
                        {isSuspended ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void handleResumeConfigGroup(group.id)}
                          >
                            Resume
                          </button>
                        ) : (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void handleSuspendConfigGroup(group.id)}
                          >
                            Suspend
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          onClick={() => {
                            setOpenSidebarMenuId(null);
                            handleDeleteConfigGroup(group.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {sidebarGroups.length === 0 && (
              <div className="config-groups-sidebar-empty">No configuration groups yet.</div>
            )}
          </aside>

          <section className="admin-panel config-groups-panel">
            <div className="admin-panel-header">
              <div>
                <div className="admin-panel-title">
                  {selectedSidebarGroup?.name ?? "All groups"}
                </div>
                <div className="admin-panel-sub">
                  {selectedSidebarGroup
                    ? "One row per asset assigned to this configuration group."
                    : "One row per asset across all configuration groups."}
                </div>
              </div>
              <div className="admin-filter-row">
                <input
                  className="admin-search"
                  placeholder="Search assets"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {page.statusOptions && (
                  <select
                    className="admin-select"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option value="all">All configuration status</option>
                    {page.statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status === CONFIGURATION_CHANGE.CHANGED ? "Config Compile Status: Changed" : status}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div
              className="admin-table config-groups-asset-table"
              style={{ "--admin-cols": String(configAssetVisibleColumns.length) } as CSSProperties}
            >
              <div className="admin-row admin-row-head" style={configAssetRowStyle}>
                {configAssetVisibleColumns.map((col) => {
                  if (col === "") {
                    const visibleIds = configAssetSort.sortedRows.map((row) => row.id);
                    const allSelected =
                      visibleIds.length > 0 && visibleIds.every((id) => selectedAssetRowIds.includes(id));
                    return (
                      <span key="select-all" className="config-groups-check-col">
                        <input
                          type="checkbox"
                          aria-label="Select all visible assets"
                          checked={allSelected}
                          onChange={() => {
                            setSelectedAssetRowIds((current) => {
                              if (allSelected) {
                                return current.filter((id) => !visibleIds.includes(id));
                              }
                              const next = new Set(current);
                              for (const id of visibleIds) next.add(id);
                              return Array.from(next);
                            });
                          }}
                        />
                      </span>
                    );
                  }
                  if (col === "Actions") {
                    return (
                      <span key={col} className="admin-col-actions config-groups-col-menu" ref={assetColMenuRef}>
                        <button
                          type="button"
                          className="menu-icon-btn"
                          aria-label="Choose columns"
                          title="Choose columns"
                          aria-expanded={Boolean(assetColMenuPos)}
                          onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            setAssetColMenuPos((current) =>
                              current ? null : { top: rect.bottom + 6, left: Math.max(8, rect.right - 220) }
                            );
                          }}
                        >
                          <span />
                          <span />
                          <span />
                        </button>
                        {assetColMenuPos && (
                          <div
                            className="assets-col-dropdown"
                            style={{ top: assetColMenuPos.top, left: assetColMenuPos.left }}
                          >
                            {page.columns
                              .filter((option) => !CONFIG_ASSET_FIXED_COLUMNS.has(option))
                              .map((option) => (
                                <label key={option} className="columns-option">
                                  <input
                                    type="checkbox"
                                    checked={isConfigAssetColVisible(option)}
                                    onChange={() => toggleConfigAssetCol(option)}
                                  />
                                  {option}
                                </label>
                              ))}
                          </div>
                        )}
                      </span>
                    );
                  }
                  if (col === "Flag") {
                    return <span key={col}>{col}</span>;
                  }
                  return (
                    <SortableColumnHeader
                      key={col}
                      as="span"
                      label={col}
                      {...configAssetSort.getHeaderProps(col)}
                    />
                  );
                })}
              </div>
              {configAssetSort.sortedRows.length === 0 ? (
                <div className="admin-empty">No assets match your filters.</div>
              ) : (
                configAssetSort.sortedRows.map((row) => {
                  const group = configGroups[row.groupId];
                  const canCompileAsset = canCompileConfigGroup(group, deviceLocationMonitoringByName);
                  const isCompilingThisAsset =
                    compilingAssetKey === row.assetKey
                    || (compilingGroupId === row.groupId && !compilingAssetKey);
                  const menuOpen = openAssetMenuId === row.id;
                  return (
                    <div key={row.id} className="admin-row" style={configAssetRowStyle}>
                      <span className="config-groups-check-col">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.description}`}
                          checked={selectedAssetRowIds.includes(row.id)}
                          onChange={() => toggleAssetRowSelected(row.id)}
                        />
                      </span>
                      {isConfigAssetColVisible("Flag") && (
                        <span className="config-groups-flag-col" title={row.flagged ? "Custom bindings" : ""}>
                          {row.flagged ? <span className="config-groups-flag" aria-label="Flagged">⚑</span> : null}
                        </span>
                      )}
                      <span className="config-groups-asset-cell">
                        <button
                          type="button"
                          className="config-groups-asset-link"
                          title="Adjust notification and mobile device bindings for this asset"
                          onClick={() => openAssetOverrideEditor(row)}
                        >
                          {row.description}
                        </button>
                      </span>
                      {isConfigAssetColVisible("Configuration group") && <span>{row.groupName || "—"}</span>}
                      {isConfigAssetColVisible("Asset ID") && <span>{row.assetId || "—"}</span>}
                      {isConfigAssetColVisible("IMEI") && <span>{row.imei || "—"}</span>}
                      {isConfigAssetColVisible("Site") && <span>{row.site || "—"}</span>}
                      {isConfigAssetColVisible("Mobile Device Binding") && (
                      <span>
                        {row.deviceBindingName ? (
                          <button
                            type="button"
                            className="config-groups-binding-link"
                            title="Open mobile device binding settings"
                            onClick={() => openBindingSettingsPanel("devices", row.deviceBindingName)}
                          >
                            {row.deviceBindingName}
                          </button>
                        ) : (
                          "—"
                        )}
                      </span>
                      )}
                      {isConfigAssetColVisible("Notification Binding") && (
                      <span>
                        {row.notificationBindingName ? (
                          <button
                            type="button"
                            className="config-groups-binding-link"
                            title="Open notification binding settings"
                            onClick={() =>
                              openBindingSettingsPanel("notifications", row.notificationBindingName)
                            }
                          >
                            {row.notificationBindingName}
                          </button>
                        ) : (
                          "—"
                        )}
                      </span>
                      )}
                      {isConfigAssetColVisible("Configuration Date") && <span>{row.configurationDate || "—"}</span>}
                      {isConfigAssetColVisible("Configuration status") && (
                      <span
                        className={`admin-configured-count${
                          row.statusKind === "accepted"
                            ? " is-complete"
                            : row.statusKind === "failed"
                              ? " is-failed"
                              : ""
                        }`}
                      >
                        {isCompilingThisAsset ? "Compiling…" : row.configurationStatus}
                      </span>
                      )}
                      {isConfigAssetColVisible("Config Compile Status") && (
                      <span
                        className={
                          row.configurationChange
                            ? `admin-pill ${
                                row.statusKind === "changed"
                                  ? "warning"
                                  : row.statusKind === "failed"
                                    ? "failed"
                                    : "pending"
                              }`
                            : "config-groups-change-blank"
                        }
                      >
                        {row.configurationChange || ""}
                      </span>
                      )}
                      <span className="admin-actions-col config-groups-row-actions">
                        <button
                          type="button"
                          className="config-groups-menu-btn"
                          aria-label="More options"
                          aria-expanded={menuOpen}
                          onClick={() => {
                            setOpenAssetMenuId((current) => (current === row.id ? null : row.id));
                            setOpenSidebarMenuId(null);
                          }}
                        >
                          ⋮
                        </button>
                        {menuOpen && (
                          <div className="config-groups-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              disabled={
                                !canCompileAsset
                                || Boolean(compilingAssetKey)
                                || Boolean(compilingGroupId)
                                || String(group?.status ?? "").toLowerCase() === "suspended"
                              }
                              onClick={() => void handleCompileConfigGroupAsset(row.groupId, row.assetKey)}
                            >
                              {compilingAssetKey === row.assetKey ? "Compiling…" : "Compile"}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => openConfigGroupEditor(row.groupId, "edit")}
                            >
                              Edit
                            </button>
                            {row.flagged && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => void handleResetAssetBindingOverride(row)}
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      ) : (
        <section className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <div className="admin-panel-title">Configuration list</div>
              <div className="admin-panel-sub">Control configuration sets and templates.</div>
            </div>
            <div className="admin-filter-row">
              <input
                className="admin-search"
                placeholder="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {page.statusOptions && (
                <select
                  className="admin-select"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All configuration status</option>
                  {page.statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div
            className="admin-table"
            style={{ "--admin-cols": String(page.columns.length) } as CSSProperties}
          >
            <div className="admin-row admin-row-head">
              {page.columns.map((col) =>
                col === "Actions" ? (
                  <span key={col} className="admin-col-actions">
                    {col}
                  </span>
                ) : (
                  <SortableColumnHeader key={col} as="span" label={col} {...adminRowSort.getHeaderProps(col)} />
                )
              )}
            </div>
            {adminRowSort.sortedRows.length === 0 ? (
              <div className="admin-empty">No rows match your filters.</div>
            ) : (
              adminRowSort.sortedRows.map((row) => (
                <div key={row.id} className="admin-row">
                  {page.columns.map((col, index) => {
                    if (col === "Actions") {
                      return (
                        <span key={`${row.id}-${col}`} className="admin-actions-col">
                          <button
                            type="button"
                            className="admin-action"
                            onClick={() => {
                              setFormDraft(buildDraftFromRow(row));
                              setEditingRowId(row.id);
                              setModalMode("view");
                              setModalOpen(true);
                            }}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="admin-action ghost"
                            onClick={() => {
                              setFormDraft(buildDraftFromRow(row));
                              setEditingRowId(row.id);
                              setModalMode("edit");
                              setModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                        </span>
                      );
                    }
                    const dataIndex = page.columns
                      .slice(0, index)
                      .filter((column) => column !== "Actions").length;
                    const cellValue = row.cells[dataIndex] ?? "";
                    if (col === "Status") {
                      const status = row.status ?? cellValue.toLowerCase();
                      return (
                        <span key={`${row.id}-${col}`} className={`admin-pill ${status}`}>
                          {cellValue}
                        </span>
                      );
                    }
                    return <span key={`${row.id}-${col}`}>{cellValue}</span>;
                  })}
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {compileBanner && location.pathname === configGroupPath ? (
        <div className="admin-compile-banner" role="status" aria-live="polite">
          <span className="admin-modal-progress-spinner" aria-hidden="true" />
          <span>{compileBanner}</span>
        </div>
      ) : null}

      {compileResultModal && location.pathname === configGroupPath && (() => {
        const { groupId, groupName, result } = compileResultModal;
        const assets = result.assetOutcomes ?? [];
        const canCompileAsset = canCompileConfigGroup(
          configGroups[groupId],
          deviceLocationMonitoringByName
        );
        return (
          <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
            <div className="admin-modal-card admin-modal-card--acceptance">
              <div className="admin-modal-header">
                <div>
                  <div className="admin-modal-title">
                    {result.ok ? CONFIGURATION_STATUS.ACCEPTED : CONFIGURATION_STATUS.FAILED}
                  </div>
                  <div className="admin-modal-sub">
                    {groupName} — {result.acceptedCount} of {result.assetsInGroup} asset(s)
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-modal-close"
                  onClick={() => setCompileResultModal(null)}
                >
                  ✕
                </button>
              </div>
              <div className="admin-modal-body admin-acceptance-body">
                <ul className="admin-acceptance-list">
                  {assets.map((row) => {
                    const status = assetConfigurationStatus(row);
                    const isCompilingThis = compilingAssetKey === row.assetKey;
                    return (
                      <li key={row.assetKey} className={row.accepted ? "is-accepted" : "is-pending"}>
                        <div className="admin-acceptance-asset">
                          <strong>{row.label}</strong>
                          <div className="admin-acceptance-asset-actions">
                            <span className={`admin-pill ${row.accepted ? "configured" : row.error ? "failed" : "pending"}`}>
                              {status}
                            </span>
                            <button
                              type="button"
                              className="admin-btn admin-btn--asset-compile"
                              disabled={!canCompileAsset || Boolean(compilingAssetKey) || Boolean(compilingGroupId)}
                              title="Compile configuration for this asset only"
                              onClick={() => void handleCompileConfigGroupAsset(groupId, row.assetKey)}
                            >
                              {isCompilingThis ? "Compiling…" : "Compile"}
                            </button>
                          </div>
                        </div>
                        {row.accepted ? (
                          <small className="admin-acceptance-note">{CONFIGURATION_RECEIVED_NOTE}</small>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => {
                    setAcceptanceModalGroupId(compileResultModal.groupId);
                    setCompileResultModal(null);
                  }}
                >
                  View configuration status
                </button>
                <button type="button" className="admin-btn ghost" onClick={() => setCompileResultModal(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {acceptanceModalGroupId && location.pathname === configGroupPath && (() => {
        const group = configGroups[acceptanceModalGroupId];
        const acceptance = group?.compileAcceptance;
        const fallbackAssets =
          group && tenantAssets.length
            ? tenantAssets
                .filter((asset) => assetMatchesConfigGroup(asset, group))
                .map((asset) => ({
                  assetKey: assetStableKey(asset),
                  label: assetDisplayLabel(asset),
                  imei: String(asset.imei ?? ""),
                  registration: String(asset.registration ?? ""),
                  accepted: false,
                  error: undefined as string | undefined
                }))
            : [];
        const assets = acceptance?.assets?.length ? acceptance.assets : fallbackAssets;
        const assignedTotal = parseAssetCountCell(
          (rowsByPath[configGroupPath] ?? []).find((row) => row.id === acceptanceModalGroupId)?.cells[
            CONFIG_GROUP_ASSETS_COLUMN
          ]
        );
        const groupStatus = groupConfigurationStatus(
          acceptance as ConfigGroupCompileAcceptance | undefined,
          assignedTotal
        );
        const canCompileAsset = canCompileConfigGroup(group, deviceLocationMonitoringByName);

        return (
          <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
            <div className="admin-modal-card admin-modal-card--acceptance">
              <div className="admin-modal-header">
                <div>
                  <div className="admin-modal-title">Configuration status</div>
                  <div className="admin-modal-sub">
                    {group?.name ?? "Configuration group"} — {groupStatus} ({acceptance?.acceptedCount ?? 0}/
                    {acceptance?.totalCount ?? assignedTotal})
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-modal-close"
                  onClick={() => setAcceptanceModalGroupId(null)}
                >
                  ✕
                </button>
              </div>
              <div className="admin-modal-body admin-acceptance-body">
                <div className="admin-acceptance-section">
                  <div className="admin-acceptance-section-title">Assets</div>
                  {assets.length ? (
                    <ul className="admin-acceptance-list">
                      {assets.map((row) => {
                        const status = assetConfigurationStatus(row);
                        const isCompilingThis = compilingAssetKey === row.assetKey;
                        return (
                          <li key={row.assetKey} className={row.accepted ? "is-accepted" : "is-pending"}>
                            <div className="admin-acceptance-asset">
                              <strong>{row.label}</strong>
                              <div className="admin-acceptance-asset-actions">
                                <span
                                  className={`admin-pill ${
                                    row.accepted ? "configured" : row.error ? "failed" : "pending"
                                  }`}
                                >
                                  {status}
                                </span>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--asset-compile"
                                  disabled={
                                    !canCompileAsset || Boolean(compilingAssetKey) || Boolean(compilingGroupId)
                                  }
                                  title="Compile configuration for this asset only"
                                  onClick={() =>
                                    void handleCompileConfigGroupAsset(acceptanceModalGroupId, row.assetKey)
                                  }
                                >
                                  {isCompilingThis ? "Compiling…" : "Compile"}
                                </button>
                              </div>
                            </div>
                            {row.accepted ? (
                              <small className="admin-acceptance-note">{CONFIGURATION_RECEIVED_NOTE}</small>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="admin-choice-empty">No assets assigned to this configuration group.</div>
                  )}
                </div>
              </div>
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-btn ghost"
                  disabled={!assets.length}
                  onClick={() => {
                    if (!group || !assets.length) return;
                    void downloadConfigGroupCompileExcel(group.name, {
                      compiledAt: acceptance?.compiledAt,
                      acceptedCount: assets.filter((row) => row.accepted).length,
                      totalCount: acceptance?.totalCount ?? assets.length,
                      assets
                    });
                  }}
                >
                  Download Excel
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => setAcceptanceModalGroupId(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}


      {assetOverrideModal && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal-card">
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title">Asset bindings</div>
                <div className="admin-modal-sub">
                  Adjust notification and mobile device bindings for {assetOverrideModal.description}. Changes
                  apply to this asset only and will flag it.
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setAssetOverrideModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <label className="admin-modal-field">
                <span className="config-groups-field-label-row">
                  Notification Binding
                  {assetOverrideModal.notificationBinding ? (
                    <button
                      type="button"
                      className="config-groups-binding-link"
                      onClick={() =>
                        openBindingSettingsPanel("notifications", assetOverrideModal.notificationBinding)
                      }
                    >
                      Open settings
                    </button>
                  ) : null}
                </span>
                <select
                  value={assetOverrideModal.notificationBinding}
                  onChange={(event) =>
                    setAssetOverrideModal((current) =>
                      current ? { ...current, notificationBinding: event.target.value } : current
                    )
                  }
                >
                  <option value="">Select notification binding</option>
                  {(
                    assetOverrideModal.notificationBinding
                    && !notificationOptions.includes(assetOverrideModal.notificationBinding)
                      ? [assetOverrideModal.notificationBinding, ...notificationOptions]
                      : notificationOptions
                  ).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-modal-field">
                <span className="config-groups-field-label-row">
                  Mobile Device Binding
                  {assetOverrideModal.deviceBinding ? (
                    <button
                      type="button"
                      className="config-groups-binding-link"
                      onClick={() =>
                        openBindingSettingsPanel("devices", assetOverrideModal.deviceBinding)
                      }
                    >
                      Open settings
                    </button>
                  ) : null}
                </span>
                <select
                  value={assetOverrideModal.deviceBinding}
                  onChange={(event) =>
                    setAssetOverrideModal((current) =>
                      current ? { ...current, deviceBinding: event.target.value } : current
                    )
                  }
                >
                  <option value="">Select mobile device binding</option>
                  {(
                    assetOverrideModal.deviceBinding
                    && !deviceOptions.includes(assetOverrideModal.deviceBinding)
                      ? [assetOverrideModal.deviceBinding, ...deviceOptions]
                      : deviceOptions
                  ).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-btn ghost"
                onClick={() => setAssetOverrideModal(null)}
                disabled={assetOverrideSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn"
                disabled={assetOverrideSaving}
                onClick={() => void handleSaveAssetBindingOverride()}
              >
                {assetOverrideSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal-card">
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title">
                  {modalMode === "create" ? "Create" : modalMode === "edit" ? "Edit" : "View"} {page.title}
                </div>
                <div className="admin-modal-sub">
                  Edit the configuration group name and bindings. Changes are shared for everyone with access to this site.
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {(page.formFields ?? []).map((field) => {
                if (location.pathname === configGroupPath && field.label !== "Group name") {
                  if (field.label === "Location binding" && !selectedDeviceAllowsLocationBinding) {
                    return null;
                  }
                  const options =
                    field.label === "Site"
                      ? siteOptions
                      : field.label === "Notifications binding"
                      ? notificationOptions
                      : field.label === "Location binding"
                        ? locationOptions
                        : deviceOptions;
                  const currentValue = String(formDraft[field.label] ?? "").trim();
                  const optionsWithCurrent = currentValue && !options.includes(currentValue)
                    ? [currentValue, ...options]
                    : options;
                  const openSettingsKind =
                    field.label === "Notifications binding"
                      ? ("notifications" as const)
                      : field.label === "Devices binding"
                        ? ("devices" as const)
                        : null;
                  return (
                    <label key={field.label} className="admin-modal-field">
                      <span className="config-groups-field-label-row">
                        {field.label}
                        {openSettingsKind && currentValue ? (
                          <button
                            type="button"
                            className="config-groups-binding-link"
                            onClick={() => openBindingSettingsPanel(openSettingsKind, currentValue)}
                          >
                            Open settings
                          </button>
                        ) : null}
                      </span>
                      <select
                        value={formDraft[field.label] ?? ""}
                        onChange={(event) =>
                          setFormDraft((current) => ({ ...current, [field.label]: event.target.value }))
                        }
                        disabled={modalMode === "view"}
                      >
                        <option value="">Select {field.label.toLowerCase()}</option>
                        {optionsWithCurrent.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {field.label === "Devices binding" && selectedDeviceBinding && !selectedDeviceAllowsLocationBinding && (
                        <small style={{ color: "#64748b", fontWeight: 600 }}>
                          Location monitoring is not enabled for this mobile device binding. Location binding is hidden.
                        </small>
                      )}
                    </label>
                  );
                }

                return (
                  <label key={field.label} className="admin-modal-field">
                    {field.label}
                    <input
                      type="text"
                      placeholder={field.placeholder}
                      value={formDraft[field.label] ?? ""}
                      onChange={(event) =>
                        setFormDraft((current) => ({ ...current, [field.label]: event.target.value }))
                      }
                      disabled={modalMode === "view"}
                    />
                  </label>
                );
              })}

            </div>
            <div className="admin-modal-actions">
              <button type="button" className="admin-btn ghost" onClick={() => setModalOpen(false)}>
                {modalMode === "view" ? "Close" : "Cancel"}
              </button>
              <button
                type="button"
                className="admin-btn"
                disabled={assetAssignmentSaving}
                onClick={() => {
                  void (async () => {
                    if (modalMode === "view") {
                      setModalOpen(false);
                      return;
                    }
                    if (location.pathname === configGroupPath) {
                      const name = (formDraft["Group name"] ?? "").trim();
                      const site = (formDraft["Site"] ?? "").trim();
                      const notificationBinding = (formDraft["Notifications binding"] ?? "").trim();
                      const locationBinding = (formDraft["Location binding"] ?? "").trim();
                      const deviceBinding = (formDraft["Devices binding"] ?? "").trim();
                      const requiresLocationBinding = deviceBinding
                        ? Boolean(deviceLocationMonitoringByName[deviceBinding.toLowerCase()])
                        : false;
                      if (!name || !site || !notificationBinding || !deviceBinding || (requiresLocationBinding && !locationBinding)) {
                        alert(requiresLocationBinding
                          ? "Select a site, Notifications, Devices, and Location binding before saving."
                          : "Select a site, Notifications, and Devices binding before saving.");
                        return;
                      }
                      const id = editingRowId ?? `cfg-${Date.now()}`;
                      const payload: ConfigGroupRecord = {
                        id,
                        name,
                        site,
                        notificationBinding,
                        locationBinding: requiresLocationBinding ? locationBinding : "",
                        deviceBinding,
                        status: "Active",
                        updatedAt: new Date().toISOString()
                      };

                      setAssetAssignmentSaving(true);
                      try {
                        const previousGroupName = editingRowId
                          ? String(configGroups[editingRowId]?.name ?? "").trim()
                          : "";
                        const assignmentResult = await persistConfigGroupAssetAssignments(
                          payload,
                          assignedAssetKeys,
                          tenantAssets.length ? tenantAssets : await getAssetsFromApi<TenantAsset>(),
                          { previousGroupName }
                        );
                        if (!assignmentResult.ok) {
                          showToast(assignmentResult.errors[0] ?? "Some asset assignments could not be saved.", "error");
                          if (assignmentResult.updated === 0) return;
                        }

                        await saveConfigurationGroup(payload);
                        setConfigGroups((current) => ({ ...current, [id]: payload }));

                        let compileResult: ConfigurationGroupCompileResult | null = null;
                        if (assignedAssetKeys.length > 0) {
                          const sourceFingerprint = await captureConfigGroupSourceFingerprint(payload);
                          compileResult = await compileConfigurationGroupToTraccar(payload);
                          const compiledPayload = await persistCompiledConfigGroup(
                            payload,
                            compileResult,
                            sourceFingerprint
                          );
                          const assetsAfterCompile = await getAssetsFromApi<TenantAsset>().catch(
                            () => [] as TenantAsset[]
                          );
                          updateConfigGroupRowAfterCompile(compiledPayload, assetsAfterCompile);
                          payload.compileAcceptance = compiledPayload.compileAcceptance;
                        }

                        const parts = [
                          `Configuration group saved for site "${site}".`,
                          assignmentResult.updated > 0
                            ? `${assignmentResult.updated} asset assignment(s) updated.`
                            : "",
                          compileResult
                            ? compileResult.ok
                              ? "Configurations Accepted"
                              : buildCompileResultMessage(compileResult)
                            : ""
                        ].filter(Boolean);
                        if (parts.length) {
                          showToast(
                            parts.join(" "),
                            compileResult?.ok && assignmentResult.ok ? "success" : "info"
                          );
                        }

                        const cacheKey = configGroupsCacheKey(String(payload.site ?? ""));
                        const stored = window.localStorage.getItem(cacheKey);
                        try {
                          const parsed = stored ? JSON.parse(stored) : [];
                          const list = Array.isArray(parsed) ? parsed : [];
                          const filtered = list.filter((group) => group?.id !== id);
                          window.localStorage.setItem(
                            cacheKey,
                            JSON.stringify([payload, ...filtered])
                          );
                        } catch {
                          window.localStorage.setItem(cacheKey, JSON.stringify([payload]));
                        }
                        window.dispatchEvent(new Event("vivi:orgchange"));

                        const nextRow = buildRowFromDraft();
                        setRowsByPath((current) => {
                          const rows = current[location.pathname] ?? [];
                          if (modalMode === "edit" && editingRowId) {
                            const existing = rows.find((r) => r.id === editingRowId);
                            const updated = rows.map((r) =>
                              r.id === editingRowId ? { ...nextRow, id: editingRowId, status: existing?.status } : r
                            );
                            return { ...current, [location.pathname]: updated };
                          }
                          return { ...current, [location.pathname]: [...rows, nextRow] };
                        });
                        setModalOpen(false);
                      } finally {
                        setAssetAssignmentSaving(false);
                      }
                      return;
                    }

                    const nextRow = buildRowFromDraft();
                    setRowsByPath((current) => {
                      const rows = current[location.pathname] ?? [];
                      const next =
                        modalMode === "edit" && editingRowId
                          ? rows.map((row) => {
                              if (row.id !== editingRowId) return row;
                              const existing = rows.find((item) => item.id === editingRowId);
                              return { ...nextRow, id: editingRowId, status: existing?.status };
                            })
                          : [...rows, nextRow];
                      void saveSharedAdminRows(`control:config:${page.title}`, next);
                      return { ...current, [location.pathname]: next };
                    });
                    setModalOpen(false);
                  })();
                }}
              >
                {assetAssignmentSaving ? "Saving..." : modalMode === "view" ? "Close" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
