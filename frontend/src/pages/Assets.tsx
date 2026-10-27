import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SortableColumnHeader from "../components/SortableColumnHeader";
import { useColumnSort } from "../hooks/useColumnSort";
import { useNavigate } from "react-router-dom";
import { CompassIcon, DownloadIcon, EditIcon, PinsIcon, QueryIcon, ReportIcon, SettingsIcon, TimelineIcon, TrashIcon } from "../components/Icons";
import {
  buildApiUrl,
  canForPath,
  getCachedPrincipal,
  commissionDeviceDetailed,
  decommissionDeviceDetailed,
  confirmTelemetryForImei,
  getAssetsFromApi,
  getAssetsFromApiForTenant,
  clearCachedAssets,
  importAssetsFromTraccarApi,
  getConfigurationGroups,
  getSiteTimeZoneSettings,
  SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT,
  getApiBaseUrl,
  getTenantId,
  getApiKey,
  isPersonalDemoTenant,
  tenantSkipsAutomaticFleetImport,
  getTraccarDevices,
  getTraccarGroups,
  getTraccarEvents,
  kickAvlSocket,
  pushDeviceSettings,
  formatTimestampForSite,
  saveConfigurationGroup,
  SiteTimeZoneSettings,
  telemetryLookupByImeiDetailed,
  upsertAssetDetailed,
  upsertAssetDetailedForTenant,
  getDriversFromApi,
  ensureNamedDriverOnServer,
  getGpsIotAssetInputStatus,
  getTraccarLive,
  type TraccarLiveRow
} from "../utils/api";
import { configUploadDateFromGroups, deriveDeviceFaults } from "../utils/assetDeviceStatus";

/** Faults cell for a device that is reporting and has nothing wrong. */
const NO_DEVICE_FAULTS = "None";
import { resolveRoleScopeRulesFromPrincipal } from "../utils/roleScopeRules";
import { isGpsIotServer } from "../utils/regionServers";
import AssetIoListModal from "../components/AssetIoListModal";
import { resolveGpsIotFuelAssetId } from "../utils/gpsiotFuel";
import {
  formatGpsIotInputStatusLabel,
  sortGpsIotInputs,
  type GpsIotAssetInput
} from "../utils/gpsiotInputStatus";
import { readActiveTenantId, subscribeScopeChange } from "../utils/tenantContext";
import {
  clearUserPref,
  readUserPrefJson,
  USER_PREF_KEYS,
  writeActiveAssetPrefs,
  writeUserPrefJson
} from "../utils/userAppPrefs";
import { readActiveSiteName } from "../utils/notificationLibraryStore";
import {
  cms808DisplayTime,
  cms808HierarchyActive,
  cms808VehicleToAssetRecord,
  findCms808LiveMatch,
  isCms808LiveAsset,
  loadCms808Position,
  loadCms808VehiclesForActiveHierarchy,
  overlayCms808LiveFields
} from "../utils/cms808";
import { isCms808Server } from "../utils/regionServers";
import { buildAssetDriverFields, readAssetDefaultDriverFormState } from "../utils/assetDriver";
import { configGroupsCacheKey, filterForSiteScope, filterRecordsForActiveSelection, siteScopesMatch } from "../utils/scopeStorage";
import {
  filterOutMockConfigurationGroups,
  purgeMockConfigurationGroupsFromLocalStorage
} from "../utils/configGroupMocks";
import { syncConfigurationGroupToTraccar } from "../utils/traccarBindingSync";
import { mapPool } from "../utils/traccarNotificationLibrarySync";
import {
  buildDeviceModelMap,
  loadFirmwareLibraryOptions,
  loadMobileDeviceLibraryOptions,
  mergeCatalogOption
} from "../utils/libraryCatalog";
import { showToast } from "../utils/toast";
import {
  beginSaving,
  endSavingDone,
  endSavingError,
  showSaveDone,
  REQUIRED_MISSING_CLASS
} from "../utils/saveFeedback";
import { resolveAssetDotStatus, resolveLastMoveAtMs, shouldShowAssetStatusDot } from "../utils/assetStatus";
import { AssetStatusDot } from "../components/AssetStatusDot";
import { applyTraccarLiveSnapshotsToAssets, parseTimestampMs } from "../utils/traccarLive";
import { overlayLivePositions, rememberLivePositions } from "../utils/assetLiveCache";
import { extractAssetMovement, extractAssetSpeedKph, movementFromSpeedKph } from "../utils/assetTelemetryFields";
import { imeisForSiteGroup, matchesStoredSiteSelection, missingDevicesForSite, normalizeSelectionText, readStoredSelectionScope, resolveAssetSiteName, type StoredSelectionScope } from "../utils/selectionScope";
import { hierarchyLabelsFromSelectedPath } from "../utils/traccarViviNaming";
import { isSharedDemoDatabaseTenant } from "../utils/regionHierarchy";
import { formatAssetDescription } from "../utils/hierarchyDisplay";
import { getSharedRealtimeClient } from "../utils/realtimeWs";
import { countryOptions } from "../data/countryOptions";
import "../index.css";

type Asset = {
  id: string;
  status: "available" | "unavailable";
  assetDescription: string;
  fleetNumber: string;
  imei: string;
  site: string;
  model: string;
  lastPosition: string;
  lastTrip: string;
  lastSeen?: string;
  registration: string;
  assetId: number;
  country: string;
  assetType?: string;
  make?: string;
  year?: string;
  vin?: string;
  engineNumber?: string;
  mobileDevice?: string;
  mobileModel?: string;
  odometer?: string;
  engineHours?: string;
  lastLocation?: string;
  configUploadDate?: string;
  configGroup?: string;
  database?: string;
  dealer?: string;
  organisation?: string;
  imsi?: string;
  msisdn?: string;
  device?: string;
  installed?: string;
  firmware?: string;
  standaloneMode?: string;
  hasCamera?: boolean;
  camera?: string;
  cameraModel?: string;
  cameraComponents?: string;
  cameraPositioningProtocol?: string;
  cameraVideoProtocol?: string;
  cameraChannelsSelected?: string[];
  selectedChannels?: string[];
  selectedChannelsCount?: number;
  channelCount?: number;
  cameraSerial?: string;
  cameraStatus?: string;
  cameraFirmware?: string;
  faults?: string;
  hasDefaultDriver?: boolean;
  defaultDriver?: string;
  driver?: string;
  driverName?: string;
  assetStatus?: string;
  expiryMode?: string;
  expiryDate?: string;
  statusNotes?: string;
  speed?: number;
  gps?: string;
  movement?: string;
  lat?: number;
  lng?: number;
  lastMoveAtMs?: number;
  telemetryAtMs?: number;
  telemetryLatest?: Record<string, unknown>;
  hierarchyNamingVersion?: string;
  serviceHistory?: Array<Record<string, string>>;
  reminders?: Array<Record<string, string>>;
  fuelData?: Array<Record<string, string>>;
  otherCosts?: Array<Record<string, string>>;
  requiredCertificates?: Array<Record<string, string>>;
  requiredLicences?: Array<Record<string, string>>;
};

type AssetSectionField =
  | "serviceHistory"
  | "reminders"
  | "fuelData"
  | "otherCosts"
  | "requiredCertificates"
  | "requiredLicences";

const assetSectionField = (section: string): AssetSectionField | null => {
  switch (section) {
    case "Service history":
      return "serviceHistory";
    case "Reminders":
      return "reminders";
    case "Fuel data":
      return "fuelData";
    case "Other cost data":
      return "otherCosts";
    case "Required driver certificates":
      return "requiredCertificates";
    case "Required driver licences":
      return "requiredLicences";
    default:
      return null;
  }
};

const readAssetSectionRows = (asset: Asset | null | undefined, field: AssetSectionField) => {
  const raw = asset?.[field];
  return Array.isArray(raw) ? raw.map((row) => ({ ...row })) : [];
};

type DecommissionConfirmContext = {
  assetId: string;
  imei: string;
  deviceId?: string;
  assetLabel: string;
  registration: string;
  site: string;
  device: string;
  model: string;
};

type DeleteAssetConfirmContext = {
  id: string;
  imei: string;
  registration: string;
  assetLabel: string;
  site: string;
  model: string;
  assetId: number | string;
};

type MobileDeviceRow = {
  device: string;
  model: string;
  imei: string;
  odometer: string;
  status: string;
  firmware: string;
  standaloneMode: string;
  camera: string;
  cameraModel: string;
  cameraComponents: string;
  cameraPositioningProtocol: string;
  cameraVideoProtocol: string;
  cameraSerial: string;
  cameraStatus: string;
  cameraFirmware: string;
};

type InlineAddKind =
  | "tracking-device"
  | "tracking-model"
  | "tracking-status"
  | "tracking-firmware"
  | "camera-device"
  | "camera-model"
  | "camera-status"
  | "camera-firmware";

const createEmptyMobileDeviceRow = (): MobileDeviceRow => ({
  device: "",
  model: "",
  imei: "",
  odometer: "",
  status: "",
  firmware: "",
  standaloneMode: "no",
  camera: "",
  cameraModel: "",
  cameraComponents: "",
  cameraPositioningProtocol: "",
  cameraVideoProtocol: "",
  cameraSerial: "",
  cameraStatus: "",
  cameraFirmware: ""
});

const INLINE_ADD_META: Record<InlineAddKind, { title: string; subtitle: string; placeholder: string; actionLabel: string }> = {
  "tracking-device": {
    title: "Add tracking device",
    subtitle: "Create a new tracking device brand for this asset setup.",
    placeholder: "e.g. MiTAC",
    actionLabel: "Add device"
  },
  "tracking-model": {
    title: "Add tracking model",
    subtitle: "Add a model under the selected tracking device.",
    placeholder: "e.g. VC-400",
    actionLabel: "Add model"
  },
  "tracking-status": {
    title: "Add tracking status",
    subtitle: "Create a new device status option.",
    placeholder: "e.g. Installed",
    actionLabel: "Add status"
  },
  "tracking-firmware": {
    title: "Add tracking firmware",
    subtitle: "Register a firmware version for tracking devices.",
    placeholder: "e.g. v3.3.0",
    actionLabel: "Add firmware"
  },
  "camera-device": {
    title: "Add camera",
    subtitle: "Create a new camera family for this fleet.",
    placeholder: "e.g. MiTAC",
    actionLabel: "Add camera"
  },
  "camera-model": {
    title: "Add camera model",
    subtitle: "Add a model under the selected camera family.",
    placeholder: "e.g. VC-400",
    actionLabel: "Add model"
  },
  "camera-status": {
    title: "Add camera status",
    subtitle: "Create a new status option for camera health.",
    placeholder: "e.g. Commissioned",
    actionLabel: "Add status"
  },
  "camera-firmware": {
    title: "Add camera firmware",
    subtitle: "Register a firmware version for camera devices.",
    placeholder: "e.g. v1.2.0",
    actionLabel: "Add firmware"
  }
};

type DriverPick = {
  id: string;
  name: string;
  site: string;
};

const ASSET_TAB_META: Record<string, { title: string; description: string }> = {
  "Asset details": {
    title: "Asset details",
    description: "Core identity, site assignment, configuration group, and vehicle specifications."
  },
  "Asset status": {
    title: "Asset status",
    description: "Set availability, expiry rules, and operational notes for this asset."
  },
  "Access control": {
    title: "Access control",
    description: "Assign a default driver from your Drivers list for access and trip attribution."
  },
  "Custom groups": {
    title: "Custom groups",
    description: "Organise this asset into shared custom groups for filtering and reporting."
  },
  "Service history": {
    title: "Service history",
    description: "Track scheduled and unscheduled maintenance with cost and odometer history."
  },
  Reminders: {
    title: "Reminders",
    description: "Manage renewal and service reminders with due dates and costs."
  },
  "Fuel data": {
    title: "Fuel data",
    description: "Record fuel purchases, suppliers, and consumption against odometer readings."
  },
  "Other cost data": {
    title: "Other cost data",
    description: "Capture additional operating costs such as tolls, repairs, and fees."
  },
  "Mobile device settings": {
    title: "Mobile device settings",
    description: "Configure tracking devices, cameras, firmware, and commissioning details."
  },
  "Required driver certificates": {
    title: "Required driver certificates",
    description: "Track mandatory certificates held by drivers assigned to this asset."
  },
  "Required driver licences": {
    title: "Required driver licences",
    description: "Track licence types, holders, and expiry dates for compliance."
  }
};

type ColumnKey =
  | "assetDescription"
  | "fleetNumber"
  | "infoIssued"
  | "imei"
  | "site"
  | "model"
  | "lastPosition"
  | "lastTrip"
  | "registration"
  | "assetId"
  | "country"
  | "assetType"
  | "make"
  | "year"
  | "vin"
  | "mobileDevice"
  | "odometer"
  | "engineHours"
  | "status"
  | "lastLocation"
  | "configUploadDate"
  | "configGroup"
  | "imsi"
  | "msisdn"
  
  | "faults";

const vehicleMakes = [
  "Ashok Leyland",
  "Bajaj",
  "BMW",
  "Chevrolet",
  "Citro├½n",
  "DAF",
  "Daihatsu",
  "Dodge",
  "Eicher",
  "Faw",
  "Ford",
  "Foton",
  "Freightliner",
  "Hino",
  "Honda",
  "Hyundai",
  "Isuzu",
  "Iveco",
  "Kenworth",
  "Kia",
  "Lexus",
  "Mahindra",
  "MAN",
  "Maserati",
  "Mazda",
  "Mercedes-Benz",
  "Mitsubishi",
  "Nissan",
  "Peugeot",
  "Renault",
  "Scania",
  "Shackman",
  "Subaru",
  "Suzuki",
  "Tata",
  "Tesla",
  "Toyota",
  "UD Trucks",
  "Volkswagen",
  "Volvo",
  "Western Star",
  "Yutong"
];

const assetTypes = [
  "Heavy Vehicle - Articulated",
  "Heavy Vehicle - Non-Articulated",
  "Medium Truck",
  "Light Truck",
  "Pickup",
  "Van",
  "Bus",
  "Minibus",
  "Coach",
  "Car",
  "SUV",
  "Motorcycle",
  "Trailer",
  "Tanker",
  "Refrigerated Truck",
  "Tipper",
  "Flatbed",
  "Container",
  "Forklift",
  "Generator",
  "Construction Equipment",
  "Agricultural Equipment",
  "Marine Vessel"
];

const fuelTypes = [
  "Diesel",
  "Petrol/Gasoline",
  "Biodiesel",
  "Ethanol",
  "LPG",
  "CNG",
  "LNG",
  "Hybrid",
  "Electric",
  "Hydrogen"
];

const readAssetsCache = (): Asset[] => {
  if (typeof window === "undefined") return [];
  const tenantId = String(getTenantId() ?? "").trim();
  if (!tenantId) return [];
  try {
    const raw = window.localStorage.getItem(`vivi.assets:${tenantId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? overlayLivePositions(tenantId, parsed as Asset[]) : [];
  } catch {
    return [];
  }
};

const writeAssetsCache = (assets: Asset[], options?: { allowEmpty?: boolean }) => {
  if (typeof window === "undefined") return;
  const tenantId = String(getTenantId() ?? "").trim();
  if (!tenantId) return;
  const rows = Array.isArray(assets) ? assets : [];
  if (!rows.length && !options?.allowEmpty) {
    const existing = readAssetsCache();
    if (existing.length) return;
  }
  const withLive = overlayLivePositions(tenantId, rows);
  rememberLivePositions(tenantId, withLive as unknown as Array<Record<string, unknown>>);
  window.localStorage.setItem(`vivi.assets:${tenantId}`, JSON.stringify(withLive));
};

const columns: { key: ColumnKey; label: string }[] = [
  { key: "assetDescription", label: "Asset Description" },
  { key: "fleetNumber", label: "ISP Serial Number" },
  { key: "infoIssued", label: "Info Issued" },
  { key: "imei", label: "IMEI" },
  { key: "site", label: "Site" },
  { key: "model", label: "Model" },
  { key: "lastPosition", label: "Last Position" },
  { key: "lastTrip", label: "Last Trip" },
  { key: "registration", label: "Registration Number" },
  { key: "assetId", label: "Asset ID" },
  { key: "country", label: "Country" },
  { key: "assetType", label: "Asset Type" },
  { key: "make", label: "Make" },
  { key: "year", label: "Year" },
  { key: "vin", label: "VIN Number" },
  { key: "mobileDevice", label: "Mobile Device" },
  { key: "odometer", label: "Odometer" },
  { key: "engineHours", label: "Engine Hours" },
  { key: "status", label: "Status" },
  { key: "lastLocation", label: "Last Location" },
  { key: "configUploadDate", label: "Config Upload Date" },
  { key: "configGroup", label: "Configuration Group" },
  { key: "imsi", label: "IMSI" },
  { key: "msisdn", label: "MSISDN" },
  { key: "faults", label: "Faults" }
];

/** Sidebar identity filters — paste one or many values (VIN / ISP / REG / IMEI / engine). */
type BulkIdentityFilter = "VIN" | "ISP" | "REG NUMBER" | "IMEIs" | "ENGINE NUMBER";

const BULK_IDENTITY_FILTERS: Array<{
  label: BulkIdentityFilter;
  field: "vin" | "fleetNumber" | "registration" | "imei" | "engineNumber";
  title: string;
  hint: string;
  placeholder: string;
}> = [
  {
    label: "VIN",
    field: "vin",
    title: "Bulk search by VIN",
    hint: "Paste one or more VIN numbers. Separate with new lines, commas, or semicolons.",
    placeholder: "e.g.\nWVWZZZ1JZ3W386752\n1HGCM82633A004352"
  },
  {
    label: "ISP",
    field: "fleetNumber",
    title: "Bulk search by ISP serial",
    hint: "Paste one or more ISP / SIM serial numbers (SimSerial).",
    placeholder: "e.g.\n8944111122223333444\n8944111122223333555"
  },
  {
    label: "REG NUMBER",
    field: "registration",
    title: "Bulk search by registration",
    hint: "Paste one or more registration / plate numbers.",
    placeholder: "e.g.\nAB12 CDE\nXY99 ZZZ"
  },
  {
    label: "IMEIs",
    field: "imei",
    title: "Bulk search by IMEI",
    hint: "Paste one or more device IMEIs.",
    placeholder: "e.g.\n866907050769800\n866907050769801"
  },
  {
    label: "ENGINE NUMBER",
    field: "engineNumber",
    title: "Bulk search by engine number",
    hint: "Paste one or more engine numbers.",
    placeholder: "e.g.\nENG-1001\nENG-1002"
  }
];

const STATUS_FILTERS = [
  "Available",
  "Not available",
  "No Mobile device",
  "No trips and positions ≥ 5 days",
  "No trips ≥ 5 days",
  "No positions ≥ 5 days",
  "Decommissioned",
  "Reminders due soon",
  "Reminders overdue"
] as const;

const parseBulkSearchTokens = (raw: string) =>
  String(raw ?? "")
    .split(/[\n,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

const normalizeIdentityToken = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const identityFieldMatches = (fieldValue: unknown, tokens: string[]) => {
  const field = normalizeIdentityToken(fieldValue);
  if (!field || !tokens.length) return false;
  const compactField = field.replace(/\s+/g, "");
  return tokens.some((token) => {
    const normalized = normalizeIdentityToken(token);
    if (!normalized) return false;
    const compactToken = normalized.replace(/\s+/g, "");
    return (
      field === normalized
      || compactField === compactToken
      || field.includes(normalized)
      || compactField.includes(compactToken)
    );
  });
};

const isBulkIdentityFilter = (value: string): value is BulkIdentityFilter =>
  BULK_IDENTITY_FILTERS.some((row) => row.label === value);

const columnWidths: Record<ColumnKey, number> = {
  assetDescription: 200,
  fleetNumber: 130,
  infoIssued: 100,
  imei: 175,
  site: 110,
  model: 120,
  lastPosition: 195,
  lastTrip: 195,
  registration: 170,
  assetId: 95,
  country: 120,
  assetType: 135,
  make: 125,
  year: 80,
  vin: 170,
  mobileDevice: 150,
  odometer: 120,
  engineHours: 130,
  status: 120,
  lastLocation: 170,
  configUploadDate: 170,
  configGroup: 180,
  imsi: 145,
  msisdn: 145,
  faults: 120
};

const centeredColumns = new Set<ColumnKey>(["infoIssued", "assetId", "year"]);
const ADDITIONAL_CAMERA_COMPONENTS = ["External L", "External R"];
const DEFAULT_CAMERA_CHANNEL_LABELS = ["Forward", "DMS", "In cab"];
const VC400_CAMERA_MODEL = "VC-400";
const VC400_POSITIONING_PROTOCOL = "JT/T808";
const VC400_VIDEO_PROTOCOL = "JT/T1078";
const POSITIONING_PROTOCOL_OPTIONS = ["N9M", VC400_POSITIONING_PROTOCOL];
const VIDEO_PROTOCOL_OPTIONS = ["N9M", VC400_VIDEO_PROTOCOL];

const isVc400Model = (value: unknown) => String(value ?? "").trim().toUpperCase() === VC400_CAMERA_MODEL;
const isCms808Camera = (camera: unknown, model: unknown) => {
  const family = String(camera ?? "").trim().toUpperCase();
  const mdl = String(model ?? "").trim().toUpperCase();
  return family === "CMS 808" || mdl.startsWith("MDVR") || mdl.startsWith("AHD-") || mdl === "AI-MDVR";
};

const normalizeVc400Protocols = (
  cameraModel: unknown,
  positioningProtocol: unknown,
  videoProtocol: unknown,
  cameraFamily?: unknown
) => {
  const positioning = String(positioningProtocol ?? "").trim();
  const video = String(videoProtocol ?? "").trim();
  if (!isVc400Model(cameraModel) && !isCms808Camera(cameraFamily, cameraModel)) {
    return {
      cameraPositioningProtocol: positioning,
      cameraVideoProtocol: video
    };
  }
  return {
    cameraPositioningProtocol: positioning || VC400_POSITIONING_PROTOCOL,
    cameraVideoProtocol: video || VC400_VIDEO_PROTOCOL
  };
};

export default function Assets() {
  const navigate = useNavigate();
  const assetPrincipal = getCachedPrincipal()?.principal as any;
  const assetRoleKey = resolveRoleScopeRulesFromPrincipal(assetPrincipal).key;
  const isPlatformAdminPrincipal = String(assetPrincipal?.kind ?? "").trim().toLowerCase() === "admin";
  const isFullAccessRole = isPlatformAdminPrincipal || assetRoleKey === "admin" || assetRoleKey === "own-support";
  /** Diagnostic columns (Info Issued, device Faults) are for Own Support and admins only. */
  const canSeeColumn = (key: ColumnKey) => (key !== "infoIssued" && key !== "faults") || isFullAccessRole;
  const isBasicAssetUser = !isFullAccessRole && assetRoleKey === "basic-user";
  const isSupportLimitedRole = !isFullAccessRole && (assetRoleKey === "dealer-support" || assetRoleKey === "database-support");
  const canEditAssets = !isBasicAssetUser && canForPath("/Track/fleet/assets", "edit");
  const canDeleteAssets = isFullAccessRole && canForPath("/Track/fleet/assets", "delete");
  const DASH = "—";
  const normalizeKeyText = normalizeSelectionText;
  const readHierarchyLabelsFromRibbon = () => {
    if (typeof window === "undefined") {
      return hierarchyLabelsFromSelectedPath("");
    }
    return hierarchyLabelsFromSelectedPath(
      String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim()
    );
  };
  const initialHierarchyLabels = readHierarchyLabelsFromRibbon();
  const [activeOrganisationLabel, setActiveOrganisationLabel] = useState<string>(
    () => initialHierarchyLabels.organisation
  );
  const [activeDealerLabel, setActiveDealerLabel] = useState<string>(() => initialHierarchyLabels.dealer);
  const [activeDatabaseLabel, setActiveDatabaseLabel] = useState<string>(() => initialHierarchyLabels.database);
  const readActiveSiteFilter = () => {
    if (typeof window === "undefined") return "";
    const directSite = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
    if (directSite) return directSite;
    return readHierarchyLabelsFromRibbon().site;
  };
  const [activeSiteFilter, setActiveSiteFilter] = useState<string>(() => readActiveSiteFilter());
  const [selectionScope, setSelectionScope] = useState<StoredSelectionScope>(() => readStoredSelectionScope());
  const normalizeUiText = (value: unknown) =>
    String(value ?? "")
      .replaceAll("ΓÇö", DASH)
      .replaceAll("ΓëÑ", "≥")
      .trim();

  useEffect(() => {
    const syncOrganisation = () => {
      const labels = readHierarchyLabelsFromRibbon();
      setActiveOrganisationLabel(labels.organisation);
      setActiveDealerLabel(labels.dealer);
      setActiveDatabaseLabel(labels.database);
    };
    syncOrganisation();
    window.addEventListener("vivi:orgchange", syncOrganisation);
    window.addEventListener("storage", syncOrganisation);
    return () => {
      window.removeEventListener("vivi:orgchange", syncOrganisation);
      window.removeEventListener("storage", syncOrganisation);
    };
  }, []);

  useEffect(() => {
    const syncActiveSite = () => {
      setActiveSiteFilter(readActiveSiteFilter());
      setSelectionScope(readStoredSelectionScope());
    };
    syncActiveSite();
    window.addEventListener("vivi:orgchange", syncActiveSite);
    window.addEventListener("vivi:contextchange", syncActiveSite);
    window.addEventListener("storage", syncActiveSite);
    return () => {
      window.removeEventListener("vivi:orgchange", syncActiveSite);
      window.removeEventListener("vivi:contextchange", syncActiveSite);
      window.removeEventListener("storage", syncActiveSite);
    };
  }, []);

  const displayValue = (value: unknown) => {
    const normalized = normalizeUiText(value);
    return normalized ? normalized : "";
  };
  const toIgnitionLabel = (value: unknown) => {
    if (typeof value === "boolean") return value ? "On" : "Off";
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const normalized = raw.toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return "On";
    if (["0", "false", "no", "off"].includes(normalized)) return "Off";
    return raw;
  };
  const isDashPlaceholder = (value: unknown) => {
    const normalized = normalizeUiText(value);
    return !normalized || normalized === DASH;
  };
  const resolveAssetDisplayModel = (asset: Partial<Asset> | null | undefined) => {
    const trackerModel = String(asset?.model ?? "").trim();
    const mobileModel = String((asset as any)?.mobileModel ?? "").trim();
    const cameraModel = String((asset as any)?.cameraModel ?? "").trim();
    const standaloneMode = String((asset as any)?.standaloneMode ?? "").trim().toLowerCase() === "yes";
    if (standaloneMode) {
      return cameraModel || mobileModel || trackerModel;
    }
    return trackerModel || mobileModel || cameraModel;
  };
  const resolveMobileRowDisplayModel = (row: Partial<MobileDeviceRow> | null | undefined) => {
    const trackerModel = String(row?.model ?? "").trim();
    const cameraModel = String(row?.cameraModel ?? "").trim();
    const standaloneMode = String(row?.standaloneMode ?? "").trim().toLowerCase() === "yes";
    if (standaloneMode) {
      return cameraModel || trackerModel;
    }
    return trackerModel || cameraModel;
  };
  const parseAdditionalCameraComponents = (value: unknown) => {
    const allowed = new Set(ADDITIONAL_CAMERA_COMPONENTS);
    return String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => Boolean(item) && allowed.has(item));
  };
  const buildSelectedCameraChannels = (componentsRaw: unknown) => {
    return Array.from(new Set([...DEFAULT_CAMERA_CHANNEL_LABELS, ...parseAdditionalCameraComponents(componentsRaw)]));
  };

  const formatTelemetryLatest = (latest: any) => {
    if (!latest || typeof latest !== "object") return "";
    const parts: string[] = [];
    const at = String(latest.at ?? "").trim();
    if (at) parts.push(`At ${at}`);
    if (typeof latest.ignition === "boolean") parts.push(`Ignition: ${latest.ignition ? "On" : "Off"}`);
    if (typeof latest.powerVoltage === "number") parts.push(`Power: ${latest.powerVoltage.toFixed(1)}V`);
    if (typeof latest.satellites === "number") parts.push(`Satellites: ${Math.round(latest.satellites)}`);
    if (typeof latest.charging === "boolean") parts.push(`Charging: ${latest.charging ? "Yes" : "No"}`);
    const fw = String(latest.firmwareVersion ?? "").trim();
    if (fw) parts.push(`Firmware: ${fw}`);
    const movement = String(latest.movement ?? "").trim();
    if (movement) parts.push(`Movement: ${movement}`);
    const locationName = String(latest.locationName ?? latest.location ?? latest.lastLocation ?? "").trim();
    if (locationName) parts.push(`Location: ${locationName}`);
    const lat = typeof latest.lat === "number" ? latest.lat : null;
    const lng = typeof latest.lng === "number" ? latest.lng : null;
    if (!locationName && lat !== null && lng !== null) parts.push(`Location: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    return parts.join(" · ");
  };

  const slug = (value: unknown) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const getStableAssetId = (asset: Partial<Asset> | null | undefined) => {
    const rawId = String((asset as any)?.id ?? "").trim();
    if (rawId) return rawId;
    const numericId = Number((asset as any)?.assetId ?? 0) || 0;
    if (numericId > 0) return `asset-${numericId}`;
    // Prefer IMEI so manual creates match Traccar import ids (`asset-{imei}`) and avoid duplicates.
    const imei = String((asset as any)?.imei ?? "").trim();
    if (imei && !isDashPlaceholder(imei)) return `asset-${slug(imei)}`;
    const reg = String((asset as any)?.registration ?? "").trim();
    if (reg && !isDashPlaceholder(reg)) return `asset-${slug(reg)}`;
    const cameraSerial = String((asset as any)?.cameraSerial ?? "").trim();
    if (cameraSerial && !isDashPlaceholder(cameraSerial)) return `asset-cam-${slug(cameraSerial)}`;
    return "";
  };

  const normalizeAndDedupeAssets = (items: any[]) => {
    const tryIso = (value: unknown): string => {
      const ms = parseTimestampMs(value);
      if (!Number.isFinite(ms)) return "";
      return new Date(ms).toISOString();
    };

    const getFreshestServerTimestamp = (asset: any): string => {
      const latest = asset?.telemetryLatest && typeof asset.telemetryLatest === "object" ? asset.telemetryLatest : null;
      const candidates = [
        // Only real telemetry timestamps should drive freshness.
        asset?.lastSeen,
        asset?.last_seen,
        asset?.lastSeenAt,
        asset?.last_seen_at,
        asset?.lastPosition,
        asset?.last_position,
        latest?.at,
        latest?.serverAt,
        asset?.lastServerTime,
        asset?.last_server_time
      ]
        .map((v) => tryIso(v))
        .filter(Boolean)
        .sort()
        .reverse();

      return candidates[0] ?? "";
    };

    const getLatestIgnitionOnTimestamp = (asset: any): string => {
      const latest = asset?.telemetryLatest && typeof asset.telemetryLatest === "object" ? asset.telemetryLatest : null;
      const candidates = [
        asset?.ignitionOnAt,
        asset?.ignition_on_at,
        asset?.lastIgnitionOnAt,
        asset?.last_ignition_on_at,
        latest?.ignitionOnAt,
        latest?.ignition_on_at,
        latest?.lastIgnitionOnAt,
        latest?.attributes?.ignitionOnAt,
        latest?.attributes?.lastIgnitionOnAt,
        latest?.data?.ignitionOnAt,
        latest?.data?.lastIgnitionOnAt
      ]
        .map((v) => tryIso(v))
        .filter(Boolean)
        .sort()
        .reverse();
      return candidates[0] ?? "";
    };

    const richness = (asset: any): number => {
      let score = 0;
      if (String(asset?.assetDescription ?? "").trim()) score += 2;
      if (String(asset?.registration ?? "").trim()) score += 2;
      if (String(asset?.make ?? "").trim()) score += 1;
      if (String(asset?.country ?? "").trim()) score += 1;
      if (String(asset?.fleetNumber ?? "").trim()) score += 1;
      if (Number(asset?.assetId ?? 0) > 0) score += 3;
      if (String(asset?.importedFrom ?? "").trim().toLowerCase() !== "traccar") score += 2;
      return score;
    };

    const byIdentity = new Map<string, any>();
    for (const a of Array.isArray(items) ? items : []) {
      const imei = String((a as any)?.imei ?? "").trim();
      const stableId = getStableAssetId(a) || `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const key = imei && !isDashPlaceholder(imei) ? `imei:${imei}` : `id:${stableId}`;
      const prev = byIdentity.get(key);
      if (!prev || richness(a) >= richness(prev)) {
        byIdentity.set(key, { ...(a as any), id: String((a as any)?.id ?? "").trim() || stableId });
      }
    }

    const next: Asset[] = [];
    const seenIds = new Set<string>();
    for (const a of byIdentity.values()) {
      const stableId = getStableAssetId(a) || String(a.id ?? "").trim();
      if (!stableId || seenIds.has(stableId)) continue;
      seenIds.add(stableId);

      const anyAsset = a as any;
      const lastSeenIso = getFreshestServerTimestamp(anyAsset);
      const rawLastPosition = String(anyAsset.lastPosition ?? "").trim();
      const rawLastTrip = String(anyAsset.lastTrip ?? "").trim();
      const ignitionOnIso = getLatestIgnitionOnTimestamp(anyAsset);

      const lastPositionRaw = rawLastPosition && !looksLikeCoords(rawLastPosition)
        ? rawLastPosition
        : "";

      const lastTripRaw = rawLastTrip && !looksLikeCoords(rawLastTrip) ? rawLastTrip : "";
      const newestIso = (...values: string[]) =>
        values
          .map((value) => tryIso(value))
          .filter(Boolean)
          .sort()
          .reverse()[0] ?? "";
      // Live lastSeen must win over a stale stored lastPosition; trip may not lead position.
      const lastPositionIso = newestIso(lastPositionRaw, lastSeenIso);
      const lastTripIso = newestIso(ignitionOnIso, lastTripRaw, lastSeenIso);
      const positionIso = newestIso(lastPositionIso, lastTripIso);

      next.push({
        ...(anyAsset as any),
        id: stableId,
        assetDescription: formatAssetDescription(anyAsset) || String(anyAsset.assetDescription ?? "").trim(),
        lastPosition: positionIso || lastPositionRaw || lastSeenIso || "",
        lastTrip: lastTripIso || lastTripRaw || "",
        lastSeen: positionIso || lastSeenIso || undefined
      } as Asset);
    }
    return next;
  };

  /** Keep local rows that a concurrent older fetch would otherwise wipe after create. */
  const assetDeleteKeys = (asset: { id?: string; imei?: string; registration?: string }) => {
    const keys: string[] = [];
    const id = String(asset.id ?? "").trim();
    const imei = String(asset.imei ?? "").trim();
    const registration = String(asset.registration ?? "").trim().toLowerCase();
    if (id) keys.push(`id:${id}`);
    if (imei && !isDashPlaceholder(imei)) keys.push(`imei:${imei}`);
    if (registration) keys.push(`reg:${registration}`);
    return keys;
  };

  const isDeletedAsset = (asset: { id?: string; imei?: string; registration?: string }) =>
    assetDeleteKeys(asset).some((key) => deletedAssetKeysRef.current.has(key));

  const withoutDeletedAssets = (rows: Asset[]) => rows.filter((asset) => !isDeletedAsset(asset));

  const mergeAssetListsPreservingLocal = (incoming: Asset[], current: Asset[]) => {
    const incomingLive = withoutDeletedAssets(incoming);
    const currentLive = withoutDeletedAssets(current);
    if (!currentLive.length) return incomingLive;
    if (!incomingLive.length) return currentLive;
    const identityKeys = new Set<string>();
    for (const asset of incomingLive) {
      const imei = String(asset.imei ?? "").trim();
      if (imei && !isDashPlaceholder(imei)) identityKeys.add(`imei:${imei}`);
      identityKeys.add(`id:${asset.id}`);
    }
    const extras = currentLive.filter((asset) => {
      const imei = String(asset.imei ?? "").trim();
      if (imei && !isDashPlaceholder(imei) && identityKeys.has(`imei:${imei}`)) return false;
      return !identityKeys.has(`id:${asset.id}`);
    });
    return normalizeAndDedupeAssets([...incomingLive, ...extras] as any[]);
  };

  const toIsoOrEmpty = (value: unknown) => {
    const ms = parseTimestampMs(value);
    if (!Number.isFinite(ms)) return "";
    return new Date(ms).toISOString();
  };

  const toMsOrNaN = (value: unknown) => {
    const iso = toIsoOrEmpty(value);
    if (!iso) return Number.NaN;
    return Date.parse(iso);
  };

  const mergeLiveTelemetryFields = (
    asset: Asset,
    incoming: {
      at?: string;
      speed?: number;
      movement?: string;
      telemetryLatest?: unknown;
      lat?: number;
      lng?: number;
    }
  ): Asset => {
    const incomingMs = toMsOrNaN(incoming.at);
    const currentSeenMs = toMsOrNaN(asset.lastSeen ?? asset.lastPosition);
    const currentTripMs = toMsOrNaN(asset.lastTrip);
    const canRefreshSeen = Boolean(incoming.at) && (!Number.isFinite(currentSeenMs) || incomingMs >= currentSeenMs);
    const canRefreshTrip = Boolean(incoming.at) && (!Number.isFinite(currentTripMs) || incomingMs >= currentTripMs);
    const latest = incoming.telemetryLatest as Record<string, unknown> | undefined;
    const lat =
      typeof incoming.lat === "number"
        ? incoming.lat
        : typeof latest?.lat === "number"
          ? latest.lat
          : asset.lat;
    const lng =
      typeof incoming.lng === "number"
        ? incoming.lng
        : typeof latest?.lng === "number"
          ? latest.lng
          : asset.lng;
    const atMs = Number.isFinite(incomingMs) ? incomingMs : Number(asset.telemetryAtMs);
    const speed = typeof incoming.speed === "number" ? incoming.speed : asset.speed;
    const movement = movementFromSpeedKph(speed) ?? incoming.movement ?? asset.movement;
    const lastMoveAtMs = resolveLastMoveAtMs({
      previousLastMoveAtMs: asset.lastMoveAtMs,
      atMs,
      speed,
      movement,
      previousLat: asset.lat,
      previousLng: asset.lng,
      lat,
      lng
    });

    const nextTrip =
      canRefreshTrip && incoming.at
        ? incoming.at
        : asset.lastTrip;
    const nextTripMs = toMsOrNaN(nextTrip);
    // A live fix always advances Last Position; it must never lag behind Last Trip.
    const shouldAdvancePosition =
      Boolean(incoming.at) &&
      (!Number.isFinite(currentSeenMs) ||
        incomingMs >= currentSeenMs ||
        (Number.isFinite(nextTripMs) && nextTripMs >= currentSeenMs));
    const nextPosition =
      shouldAdvancePosition && incoming.at
        ? Number.isFinite(nextTripMs) && nextTripMs > incomingMs
          ? nextTrip
          : incoming.at
        : Number.isFinite(nextTripMs) && nextTripMs > currentSeenMs
          ? nextTrip
          : undefined;

    return {
      ...asset,
      ...(nextPosition ? { lastSeen: nextPosition, lastPosition: nextPosition } : {}),
      ...(canRefreshTrip && incoming.at ? { lastTrip: incoming.at } : {}),
      ...(typeof incoming.speed === "number" ? { speed: incoming.speed } : {}),
      ...(movement ? { movement } : {}),
      ...(typeof lat === "number" ? { lat } : {}),
      ...(typeof lng === "number" ? { lng } : {}),
      lastMoveAtMs,
      ...(nextPosition && Number.isFinite(toMsOrNaN(nextPosition))
        ? { telemetryAtMs: toMsOrNaN(nextPosition) }
        : canRefreshSeen && Number.isFinite(incomingMs)
          ? { telemetryAtMs: incomingMs }
          : {}),
      ...(incoming.telemetryLatest
        ? {
            telemetryLatest: {
              ...(asset.telemetryLatest ?? {}),
              ...(incoming.telemetryLatest as Record<string, unknown>)
            }
          }
        : {})
    };
  };

  const enrichAssetsWithFreshTelemetry = async (assets: Asset[]): Promise<Asset[]> => {
    const candidates = assets.filter((asset) => {
      const imei = String(asset.imei ?? "").trim();
      if (!imei) return false;
      const lastSeenMs = toMsOrNaN(asset.lastSeen ?? asset.lastPosition);
      const lastTripMs = toMsOrNaN(asset.lastTrip);
      // Probe rows that are stale, or rows still missing Last Trip so ignition-on can be backfilled.
      return !Number.isFinite(lastSeenMs) || Date.now() - lastSeenMs > 60 * 60 * 1000 || !Number.isFinite(lastTripMs);
    });
    if (!candidates.length) return assets;

    const traccarDeviceIdByImei = new Map<string, string>();
    const traccarIgnitionOnByImei = new Map<string, string>();
    const traccarEventsFrom = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const traccarEventsTo = new Date().toISOString();

    const loadLatestIgnitionOnFromTraccar = async (imei: string) => {
      const needle = String(imei ?? "").trim();
      if (!needle) return "";
      if (traccarIgnitionOnByImei.has(needle)) {
        return traccarIgnitionOnByImei.get(needle) ?? "";
      }

      try {
        let deviceId = traccarDeviceIdByImei.get(needle) ?? "";
        if (!deviceId) {
          const devices = await getTraccarDevices({ uniqueId: needle });
          const matchedDevice = devices.find((device) => String((device as any)?.uniqueId ?? "").trim() === needle)
            ?? devices.find((device) => String((device as any)?.identifier ?? "").trim() === needle)
            ?? null;
          deviceId = matchedDevice ? String((matchedDevice as any)?.id ?? "").trim() : "";
          if (deviceId) traccarDeviceIdByImei.set(needle, deviceId);
        }
        if (!deviceId) {
          traccarIgnitionOnByImei.set(needle, "");
          return "";
        }

        const events = await getTraccarEvents({
          deviceId,
          from: traccarEventsFrom,
          to: traccarEventsTo,
          type: ["ignitionOn"]
        });

        const latestIgnitionOn = events
          .map((event) => toIsoOrEmpty(
            (event as any)?.eventTime
            ?? (event as any)?.timestamp
            ?? (event as any)?.time
            ?? (event as any)?.occurredAt
            ?? (event as any)?.serverTime
          ))
          .filter(Boolean)
          .sort()
          .reverse()[0] ?? "";

        traccarIgnitionOnByImei.set(needle, latestIgnitionOn);
        return latestIgnitionOn;
      } catch {
        traccarIgnitionOnByImei.set(needle, "");
        return "";
      }
    };

    const updates = await mapPool(candidates, 2, async (asset) => {
        const imei = String(asset.imei ?? "").trim();
        // Avoid refreshLive storms — they fan out into Traccar proxy calls and trip Worker 500s.
        const telemetry = await telemetryLookupByImeiDetailed(imei, { refreshLive: false });
        const telemetryAt = toIsoOrEmpty(telemetry.body?.latest?.at);
        const latest = telemetry.body?.latest as any;
        const ignitionOnAt = toIsoOrEmpty(
          latest?.ignitionOnAt
          ?? latest?.ignition_on_at
          ?? latest?.lastIgnitionOnAt
          ?? latest?.attributes?.ignitionOnAt
          ?? latest?.attributes?.lastIgnitionOnAt
          ?? latest?.data?.ignitionOnAt
          ?? latest?.data?.lastIgnitionOnAt
        );
        // Prefer telemetry snapshot; only hit Traccar events when Last Trip is still empty.
        const traccarIgnitionOnAt =
          ignitionOnAt ||
          (Number.isFinite(toMsOrNaN(asset.lastTrip)) ? "" : await loadLatestIgnitionOnFromTraccar(imei));
        if (!telemetry.ok) return { id: asset.id, at: "", odometer: "", lastTrip: traccarIgnitionOnAt };
        
        // Extract odometer from telemetry (try both field names for compatibility)
        const odometerValue = telemetry.body?.latest?.odometerKms ?? telemetry.body?.latest?.odometer ?? undefined;
        const odometerStr = odometerValue !== undefined ? String(Math.round(odometerValue)).trim() : "";
        const speed =
          typeof latest?.speed === "number"
            ? latest.speed
            : extractAssetSpeedKph((latest ?? {}) as Record<string, unknown>);
        const movement = String(latest?.movement ?? extractAssetMovement((latest ?? {}) as Record<string, unknown>) ?? "").trim();
        const lat = typeof latest?.lat === "number" ? latest.lat : undefined;
        const lng = typeof latest?.lng === "number" ? latest.lng : undefined;

        return {
          id: asset.id,
          at: telemetryAt,
          odometer: odometerStr,
          lastTrip: traccarIgnitionOnAt,
          speed,
          movement,
          lat,
          lng,
          telemetryLatest: latest ?? undefined
        };
    });

    const byId = new Map(
      updates
        .filter((u) => u.at || (u as any).lastTrip || typeof (u as any).speed === "number" || (u as any).movement)
        .map((u) => [u.id, u])
    );
    if (!byId.size) return assets;

    return assets.map((asset) => {
      const incoming = byId.get(asset.id);
      if (!incoming) return asset;

      const currentSeenMs = toMsOrNaN(asset.lastSeen ?? asset.lastPosition);
      const incomingMs = Date.parse(incoming.at);
      const canRefreshSeen = Boolean(incoming.at) && (!Number.isFinite(currentSeenMs) || incomingMs > currentSeenMs);

      const incomingOdo = Number(incoming.odometer);
      const currentOdo = Number(asset.odometer ?? "");
      const incomingLastTrip = String((incoming as any).lastTrip ?? "").trim();
      const currentLastTripMs = toMsOrNaN(asset.lastTrip);
      const incomingLastTripMs = toMsOrNaN(incomingLastTrip);
      const nextOdometer =
        Number.isFinite(incomingOdo) && incomingOdo >= 0
          ? Number.isFinite(currentOdo) && currentOdo >= 0
            ? String(Math.max(currentOdo, incomingOdo))
            : String(incomingOdo)
          : asset.odometer;
      const nextLastTrip =
        incomingLastTrip && (!Number.isFinite(currentLastTripMs) || (Number.isFinite(incomingLastTripMs) && incomingLastTripMs > currentLastTripMs))
          ? incomingLastTrip
          : asset.lastTrip;

      return mergeLiveTelemetryFields(
        {
          ...asset,
          lastTrip: nextLastTrip,
          odometer: canRefreshSeen ? nextOdometer : asset.odometer
        },
        {
          at: canRefreshSeen ? incoming.at : asset.lastSeen,
          speed: (incoming as any).speed,
          movement: (incoming as any).movement,
          lat: (incoming as any).lat,
          lng: (incoming as any).lng,
          telemetryLatest: (incoming as any).telemetryLatest
        }
      );
    });
  };

  const refreshAssetsLiveStatus = async (rows: Asset[]): Promise<Asset[]> => {
    const targets = rows.filter((asset) => String(asset.imei ?? "").trim()).slice(0, 25);
    if (!targets.length) return rows;

    const updates = await mapPool(targets, 3, async (asset) => {
        const imei = String(asset.imei ?? "").trim();
        const lookup = await telemetryLookupByImeiDetailed(imei, { refreshLive: true });
        const latest = lookup.body?.latest;
        if (!lookup.ok || !latest) return null;

        const at = toIsoOrEmpty(latest.at);
        const speed =
          typeof latest.speed === "number"
            ? latest.speed
            : extractAssetSpeedKph(latest as Record<string, unknown>);
        const movement = String(latest.movement ?? extractAssetMovement(latest as Record<string, unknown>) ?? "").trim();
        const lat = typeof latest.lat === "number" ? latest.lat : undefined;
        const lng = typeof latest.lng === "number" ? latest.lng : undefined;

        return {
          id: asset.id,
          at,
          speed,
          movement,
          lat,
          lng,
          telemetryLatest: latest
        };
    });

    const byId = new Map(updates.filter(Boolean).map((entry) => [entry!.id, entry!]));
    if (!byId.size) return rows;

    return rows.map((asset) => {
      const incoming = byId.get(asset.id);
      if (!incoming) return asset;

      return mergeLiveTelemetryFields(asset, {
        at: incoming.at,
        speed: incoming.speed,
        movement: incoming.movement,
        lat: incoming.lat,
        lng: incoming.lng,
        telemetryLatest: incoming.telemetryLatest
      });
    });
  };

  const mergeStickyLastTrip = (incoming: Asset[], current: Asset[]) => {
    const currentByKey = new Map<string, Asset>();
    for (const asset of current) {
      const imei = String(asset.imei ?? "").trim();
      if (imei) currentByKey.set(`imei:${imei}`, asset);
      currentByKey.set(`id:${asset.id}`, asset);
    }

    const newerStamp = (incomingValue: string, existingValue: string) => {
      const incomingMs = toMsOrNaN(incomingValue);
      const existingMs = toMsOrNaN(existingValue);
      if (incomingValue && (!Number.isFinite(existingMs) || (Number.isFinite(incomingMs) && incomingMs >= existingMs))) {
        return incomingValue;
      }
      return existingValue || incomingValue;
    };

    return incoming.map((asset) => {
      const imei = String(asset.imei ?? "").trim();
      const existing = currentByKey.get(imei ? `imei:${imei}` : `id:${asset.id}`) ?? currentByKey.get(`id:${asset.id}`);
      if (!existing) return asset;

      const nextLastTrip = newerStamp(String(asset.lastTrip ?? "").trim(), String(existing.lastTrip ?? "").trim());
      const nextLastSeen = newerStamp(
        newerStamp(
          String(asset.lastSeen ?? asset.lastPosition ?? "").trim(),
          String(existing.lastSeen ?? existing.lastPosition ?? "").trim()
        ),
        nextLastTrip
      );

      return {
        ...asset,
        ...(nextLastSeen ? { lastSeen: nextLastSeen, lastPosition: nextLastSeen } : {}),
        lastTrip: nextLastTrip || asset.lastTrip
      };
    });
  };

  const syncAssetsForDisplay = async (rawAssets: Asset[], options?: { enrich?: boolean }) => {
    const normalized = withoutDeletedAssets(normalizeAndDedupeAssets(rawAssets as any[]));
    if (!normalized.length && withoutDeletedAssets(assetsDataRef.current).length) {
      // Keep the last good list — empty fetches were wiping the page after ~30s.
      return withoutDeletedAssets(assetsDataRef.current);
    }
    // Preserve locally created rows that a concurrent older fetch would drop.
    const preserved = mergeAssetListsPreservingLocal(normalized, assetsDataRef.current);
    const merged = mergeStickyLastTrip(preserved, assetsDataRef.current);
    const withLive = withoutDeletedAssets((await applyTraccarLiveSnapshotsToAssets(merged)) as Asset[]);
    const stickyLive = mergeStickyLastTrip(withLive, assetsDataRef.current);
    // Paint immediately; optional last-trip enrich runs after so navigation stays snappy.
    assetsDataRef.current = stickyLive;
    setAssetsData(stickyLive);
    writeAssetsCache(stickyLive);
    if (options?.enrich === false) return stickyLive;
    try {
      const enriched = await enrichAssetsWithFreshTelemetry(withLive);
      const live = await refreshAssetsLiveStatus(enriched);
      const liveAligned = withoutDeletedAssets((await applyTraccarLiveSnapshotsToAssets(live)) as Asset[]);
      const stickyAligned = mergeStickyLastTrip(liveAligned, assetsDataRef.current);
      if (!stickyAligned.length && withoutDeletedAssets(assetsDataRef.current).length) {
        return withoutDeletedAssets(assetsDataRef.current);
      }
      const preservedLive = mergeAssetListsPreservingLocal(stickyAligned, assetsDataRef.current);
      assetsDataRef.current = preservedLive;
      setAssetsData(preservedLive);
      writeAssetsCache(preservedLive);
      return preservedLive;
    } catch {
      return stickyLive;
    }
  };

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const ASSETS_PER_PAGE = 50;
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [backendProbe, setBackendProbe] = useState<{
    status: "idle" | "checking" | "ok" | "error";
    message: string;
  }>({ status: "idle", message: "Not checked" });
  const [telemetryAudit, setTelemetryAudit] = useState<{
    status: "idle" | "checking" | "ok" | "error";
    message: string;
  }>({ status: "idle", message: "Telemetry audit not run" });
  const [siteTimeZones, setSiteTimeZones] = useState<SiteTimeZoneSettings | null>(null);
  const ribbonHandlersRef = useRef<{ onAction: (key: string) => void; onSearch: (value: string) => void } | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(() => {
    const saved = readUserPrefJson<{ visible?: string[]; order?: string[] }>(USER_PREF_KEYS.assetsColumnPrefs);
    const defaults = columns.map((c) => c.key);
    const allowed = new Set(defaults);
    const visible = Array.isArray(saved?.visible)
      ? saved!.visible.filter((key): key is ColumnKey => allowed.has(key as ColumnKey))
      : defaults;
    return new Set(visible.length > 0 ? visible : defaults);
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [colMenuPos, setColMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => {
    const saved = readUserPrefJson<{ visible?: string[]; order?: string[] }>(USER_PREF_KEYS.assetsColumnPrefs);
    const defaults = columns.map((c) => c.key);
    const allowed = new Set(defaults);
    const order = Array.isArray(saved?.order)
      ? saved!.order.filter((key): key is ColumnKey => allowed.has(key as ColumnKey))
      : [];
    const missing = defaults.filter((key) => !order.includes(key));
    return order.length > 0 ? [...order, ...missing] : defaults;
  });

  useEffect(() => {
    writeUserPrefJson(USER_PREF_KEYS.assetsColumnPrefs, {
      visible: Array.from(visibleCols),
      order: columnOrder
    });
  }, [visibleCols, columnOrder]);
  const [dragCol, setDragCol] = useState<ColumnKey | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [assetSaved, setAssetSaved] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [activeAddTab, setActiveAddTab] = useState("Asset details");
  const [dirtyTabs, setDirtyTabs] = useState<Record<string, boolean>>({});
  const [customGroupFilter, setCustomGroupFilter] = useState("");
  const [driverList, setDriverList] = useState<DriverPick[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [missingRequiredFields, setMissingRequiredFields] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState("All");
  const [bulkFilterTokens, setBulkFilterTokens] = useState<string[]>([]);
  const [bulkPasteDraft, setBulkPasteDraft] = useState("");
  const [bulkSearchKind, setBulkSearchKind] = useState<BulkIdentityFilter | null>(null);
  const [showBulkSearchModal, setShowBulkSearchModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsTarget, setSmsTarget] = useState<string | null>(null);
  const [smsTargetImei, setSmsTargetImei] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [decommissionConfirm, setDecommissionConfirm] = useState<DecommissionConfirmContext | null>(null);
  const [decommissionAcknowledged, setDecommissionAcknowledged] = useState(false);
  const [decommissionInProgress, setDecommissionInProgress] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteAssetConfirmContext | null>(null);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [ioListAsset, setIoListAsset] = useState<Asset | null>(null);
  const [diagnosticsAsset, setDiagnosticsAsset] = useState<Asset | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState({
    assetDetails: true,
    mobileDevice: true,
    tripInfo: false,
    latestPosition: false,
    inputStatus: true
  });
  const [diagnosticsInputStatus, setDiagnosticsInputStatus] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    error?: string;
    inputs: GpsIotAssetInput[];
  }>({ status: "idle", inputs: [] });

  useEffect(() => {
    if (!showDiagnosticsModal || !diagnosticsAsset) return;
    if (!isGpsIotServer()) return;
    if (!diagnosticsOpen.inputStatus) return;
    if (diagnosticsInputStatus.status === "ready" || diagnosticsInputStatus.status === "loading") return;
    let cancelled = false;
    setDiagnosticsInputStatus((prev) => ({ ...prev, status: "loading", error: undefined }));
    void getGpsIotAssetInputStatus({
      assetId: resolveGpsIotFuelAssetId(diagnosticsAsset),
      imei: String(diagnosticsAsset.imei ?? "").trim(),
      assetName: String(diagnosticsAsset.assetDescription ?? "").trim(),
      registration: String(diagnosticsAsset.registration ?? "").trim(),
      site: String(diagnosticsAsset.site ?? "").trim() || undefined
    })
      .then((result) => {
        if (cancelled) return;
        setDiagnosticsInputStatus({
          status: "ready",
          inputs: sortGpsIotInputs(Array.isArray(result.inputs) ? result.inputs : [])
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setDiagnosticsInputStatus({
          status: "error",
          error: String(error?.message ?? "Input status unavailable"),
          inputs: []
        });
      });
    return () => {
      cancelled = true;
    };
  }, [showDiagnosticsModal, diagnosticsAsset, diagnosticsOpen.inputStatus, diagnosticsInputStatus.status]);

  const [formValues, setFormValues] = useState({
    assetDescription: "",
    assetType: "",
    registration: "",
    site: "",
    configurationGroup: "",
    country: "",
    fleetNumber: "",
    vin: "",
    make: "",
    model: "",
    year: "",
    engineNumber: "",
    fuelType: "",
    targetFuel: "",
    fuelTankCapacity: "",
    serialNumber: "",
    additionalMobileDevice: "",
    trackingIcon: "",
    assetColour: "",
    assetStatus: "Available",
    expiryMode: "never",
    expiryDate: "",
    statusNotes: "",
    hasDefaultDriver: false,
    defaultDriver: "",

    lastPosition: "",
    lastTrip: "",
    odometer: "",
    engineHours: "",
    lastLocation: "",
    configUploadDate: "",
    imsi: "",
    msisdn: "",
    cameraSerial: "",
    faults: ""
  });

  const runLiveRecheck = async () => {
    setBackendProbe({ status: "checking", message: "Checking assets + telemetry..." });
    showToast("Running live recheck for REG-006...", "info");
    try {
      const tenant = String(getTenantId() ?? "").trim();
      if (!tenant) {
        const msg = "No tenant selected.";
        setBackendProbe({ status: "error", message: msg });
        showToast(msg, "error");
        return;
      }

      const assets = await getAssetsFromApi<Asset>();
      const regRow = assets.find(
        (x) => String((x as any)?.assetDescription ?? "").trim() === "REG-006"
          || String((x as any)?.imei ?? "").trim() === "866907050769800"
      );

      if (!regRow) {
        const msg = `Tenant ${tenant}: REG-006 / IMEI 866907050769800 not found in /d1/assets.`;
        setBackendProbe({
          status: "error",
          message: msg
        });
        showToast(msg, "error");
        return;
      }

      const imei = String((regRow as any)?.imei ?? "").trim();
      if (!imei) {
        const msg = `Tenant ${tenant}: row found but IMEI missing.`;
        setBackendProbe({
          status: "error",
          message: msg
        });
        showToast(msg, "error");
        return;
      }

      const lookup = await telemetryLookupByImeiDetailed(imei);
      if (lookup.ok && lookup.body) {
        const events = Array.isArray((lookup.body as any)?.events) ? (lookup.body as any).events.length : 0;
        const latestAt = String((lookup.body as any)?.latest?.at ?? "").trim();
        const msg = `Tenant ${tenant}: REG-006 found. Telemetry events=${events}${latestAt ? `, latest=${latestAt}` : ""}.`;
        setBackendProbe({
          status: "ok",
          message: msg
        });
        showToast(msg, "success");
        return;
      }

      const statusText = typeof lookup.status === "number" ? `HTTP ${lookup.status}` : "request failed";
      const msg = `Tenant ${tenant}: REG-006 found, telemetry lookup failed (${statusText}).`;
      setBackendProbe({
        status: "error",
        message: msg
      });
      showToast(msg, "info");
    } catch (error: any) {
      const msg = `Recheck failed: ${String(error?.message ?? error)}`;
      setBackendProbe({
        status: "error",
        message: msg
      });
      showToast(msg, "error");
    }
  };

  const runTelemetryAudit = async () => {
    setTelemetryAudit({ status: "checking", message: "Auditing telemetry across assets..." });
    showToast("Running telemetry audit for all device IMEIs...", "info");

    try {
      const latestAssets = await getAssetsFromApi<Asset>();
      const source = latestAssets.length ? latestAssets : assetsData;
      const candidates = source.filter((asset) => {
        const imei = String(asset.imei ?? "").trim();
        return imei && !isDashPlaceholder(imei);
      });

      if (!candidates.length) {
        const msg = "No assets with IMEI found to audit.";
        setTelemetryAudit({ status: "error", message: msg });
        showToast(msg, "error");
        return;
      }

      const liveWindowMs = 15 * 60 * 1000;
      const delayedWindowMs = 2 * 60 * 60 * 1000;
      let live = 0;
      let delayed = 0;
      let stale = 0;
      let failed = 0;
      const staleNames: string[] = [];

      // Probe in small batches to avoid flooding the API.
      for (let i = 0; i < candidates.length; i += 5) {
        const chunk = candidates.slice(i, i + 5);
        const results = await Promise.all(
          chunk.map(async (asset) => {
            const imei = String(asset.imei ?? "").trim();
            const out = await confirmTelemetryForImei(imei);
            return { asset, out };
          })
        );

        for (const { asset, out } of results) {
          if (!out.ok) {
            failed += 1;
            continue;
          }
          if (!out.received || !out.lastAt) {
            stale += 1;
            staleNames.push(String(asset.assetDescription ?? asset.fleetNumber ?? asset.imei ?? "Unknown"));
            continue;
          }

          const ageMs = Date.now() - Date.parse(String(out.lastAt));
          if (Number.isNaN(ageMs)) {
            stale += 1;
            staleNames.push(String(asset.assetDescription ?? asset.fleetNumber ?? asset.imei ?? "Unknown"));
          } else if (ageMs <= liveWindowMs) {
            live += 1;
          } else if (ageMs <= delayedWindowMs) {
            delayed += 1;
          } else {
            stale += 1;
            staleNames.push(String(asset.assetDescription ?? asset.fleetNumber ?? asset.imei ?? "Unknown"));
          }
        }
      }

      const checked = candidates.length;
      const stalePreview = staleNames.slice(0, 4).join(", ");
      const summary = `Checked ${checked} IMEIs: live(<=15m)=${live}, delayed(<=2h)=${delayed}, stale/no data=${stale}, failed=${failed}${stalePreview ? ` | stale: ${stalePreview}${staleNames.length > 4 ? ", ..." : ""}` : ""}`;
      const status: "ok" | "error" = stale === 0 && failed === 0 ? "ok" : "error";

      setTelemetryAudit({ status, message: summary });
      showToast(summary, status === "ok" ? "success" : "info");
    } catch (error: any) {
      const msg = `Telemetry audit failed: ${String(error?.message ?? error)}`;
      setTelemetryAudit({ status: "error", message: msg });
      showToast(msg, "error");
    }
  };

  const activeCols = columnOrder
    .filter((key) => key === "lastPosition" || visibleCols.has(key))
    .filter(canSeeColumn)
    .map((key) => columns.find((c) => c.key === key)!)
    .filter(Boolean);

  const parseAssetDate = (value?: string) => {
    if (!value) return null;
    // Support ISO timestamps from the backend.
    const isoParsed = Date.parse(value);
    if (!Number.isNaN(isoParsed) && (value.includes("T") || value.includes("-"))) {
      return new Date(isoParsed);
    }
    const cleaned = value.replace("(EAT)", "").trim();
    const [datePart, timePart] = cleaned.split(" ");
    if (!datePart || !timePart) return null;
    const [day, month, year] = datePart.split("/").map(Number);
    const [hours, minutes] = timePart.split(":").map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
  };

  const formatTimestamp = (value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw || raw === DASH) return "";
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return raw;
    const d = new Date(parsed);
    return d
      .toLocaleString("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      })
      .replace(",", "");
  };

  const looksLikeCoords = (value: unknown) => {
    const raw = String(value ?? "").trim();
    return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(raw);
  };

  const daysSince = (value?: string) => {
    const parsed = parseAssetDate(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
    const diffMs = Date.now() - parsed.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  };

  const hasTelemetryTimestamp = (asset: Asset): boolean => shouldShowAssetStatusDot(asset as any);

  const getInfoIssued = (asset: Asset): boolean => {
    // If telemetry timestamp exists, info is considered issued.
    return hasTelemetryTimestamp(asset);
  };

  const [statusTick, setStatusTick] = useState(0);
  const shouldShowStatusDot = (asset: Asset): boolean => {
    void statusTick;
    return shouldShowAssetStatusDot(asset as any);
  };

  const isAssetAvailable = (asset: Asset): boolean => {
    const raw = String((asset as any)?.status ?? "").trim().toLowerCase();
    // Treat missing/legacy values as available so telemetry can drive the dot.
    if (!raw) return true;
    return raw === "available";
  };

  const isAssetUnavailable = (asset: Asset): boolean => {
    const raw = String((asset as any)?.status ?? "").trim().toLowerCase();
    return raw === "unavailable" || raw === "not available";
  };

  const getDotStatus = (asset: Asset): "online" | "warning" | "stale" | "offline" => resolveAssetDotStatus(asset as any);

  const readBulkIdentityValue = (asset: Asset, field: (typeof BULK_IDENTITY_FILTERS)[number]["field"]) => {
    if (field === "engineNumber") {
      return String((asset as any).engineNumber ?? (asset as any).engine_no ?? "").trim();
    }
    return String(asset[field] ?? "").trim();
  };

  const matchesBulkIdentityFilter = (asset: Asset, filter: BulkIdentityFilter, tokens: string[]) => {
    const meta = BULK_IDENTITY_FILTERS.find((row) => row.label === filter);
    if (!meta) return true;
    if (!tokens.length) return false;
    return identityFieldMatches(readBulkIdentityValue(asset, meta.field), tokens);
  };

  const matchesFilter = (asset: Asset, filter: string, tokens = bulkFilterTokens) => {
    if (isBulkIdentityFilter(filter)) {
      return matchesBulkIdentityFilter(asset, filter, tokens);
    }
    const tripAge = daysSince(asset.lastTrip);
    const positionAge = daysSince(asset.lastPosition);
    switch (filter) {
      case "All":
        return true;
      case "Available":
        return isAssetAvailable(asset);
      case "Not available":
        return !isAssetAvailable(asset);
      case "No Mobile device":
        return !asset.mobileDevice || isDashPlaceholder(asset.mobileDevice);
      case "No trips and positions ≥ 5 days":
        return tripAge >= 5 && positionAge >= 5;
      case "No trips ≥ 5 days":
        return tripAge >= 5;
      case "No positions ≥ 5 days":
        return positionAge >= 5;
      case "Decommissioned":
        return isAssetUnavailable(asset);
      case "Reminders due soon":
        return false;
      case "Reminders overdue":
        return false;
      default:
        return true;
    }
  };

  const openBulkSearchModal = (kind: BulkIdentityFilter) => {
    setBulkSearchKind(kind);
    setBulkPasteDraft(bulkFilterTokens.length && activeFilter === kind ? bulkFilterTokens.join("\n") : "");
    setShowBulkSearchModal(true);
  };

  const applyBulkSearch = () => {
    if (!bulkSearchKind) return;
    const tokens = parseBulkSearchTokens(bulkPasteDraft);
    if (!tokens.length) {
      showToast("Paste at least one value to search.", "error");
      return;
    }
    setBulkFilterTokens(tokens);
    setActiveFilter(bulkSearchKind);
    setShowBulkSearchModal(false);
    setCurrentPage(1);
    showToast(`Filtering ${tokens.length} ${bulkSearchKind} value${tokens.length === 1 ? "" : "s"}`, "info");
  };

  const clearBulkSearch = () => {
    setBulkFilterTokens([]);
    setBulkPasteDraft("");
    setBulkSearchKind(null);
    setShowBulkSearchModal(false);
    setActiveFilter("All");
  };

  const selectStatusFilter = (label: string) => {
    setBulkFilterTokens([]);
    setBulkPasteDraft("");
    setBulkSearchKind(null);
    setActiveFilter(label);
  };

  type ConfigGroupLike = {
    id?: string;
    name?: string;
    site?: string;
    [key: string]: unknown;
  };

  type ConfigGroupOption = { value: string; label: string };

  const buildConfigGroupOptions = (source: unknown[]): ConfigGroupOption[] => {
    const options: ConfigGroupOption[] = [];
    const seen = new Set<string>();

    for (const raw of source) {
      if (!raw) continue;

      if (typeof raw === "string") {
        const label = raw.trim();
        if (!label) continue;
        if (seen.has(label)) continue;
        seen.add(label);
        options.push({ value: label, label });
        continue;
      }

      const group = raw as ConfigGroupLike;
      const name = String(group.name ?? (group as any).groupName ?? (group as any)["Group name"] ?? "").trim();
      const id = String(group.id ?? "").trim();
      // Prefer id as value so table/storage stay aligned with /d1/assets (stores group id).
      const value = id || name;
      const label = name || id;
      if (!value) continue;
      if (seen.has(value)) continue;
      seen.add(value);
      options.push({ value, label });
    }

    return options;
  };

  const [assetsData, setAssetsData] = useState<Asset[]>(() => readAssetsCache());
  const [activeSiteGroupImeis, setActiveSiteGroupImeis] = useState<string[]>([]);
  const [cms808Assets, setCms808Assets] = useState<Asset[]>([]);
  const assetsDataRef = useRef<Asset[]>(readAssetsCache());
  const deletedAssetKeysRef = useRef<Set<string>>(new Set());
  const loadedTenantRef = useRef(String(readActiveTenantId() || getTenantId() || "").trim());
  const loadedSiteRef = useRef(readActiveSiteName());
  const [assetsListLoading, setAssetsListLoading] = useState(() => readAssetsCache().length === 0);
  const [configGroupOptions, setConfigGroupOptions] = useState<ConfigGroupOption[]>([]);
  /** Raw scoped groups: their compile records give each device's config upload date. */
  const [configGroupRecords, setConfigGroupRecords] = useState<ConfigGroupLike[]>([]);
  /** Latest Traccar report per IMEI: what the device itself says about its faults. */
  const [liveDeviceByImei, setLiveDeviceByImei] = useState<Map<string, TraccarLiveRow>>(() => new Map());
  const [siteOptions, setSiteOptions] = useState<string[]>([]);

  const resolveConfigGroupLabel = (raw: unknown) => {
    const value = String(raw ?? "").trim();
    if (!value || isDashPlaceholder(value)) return "";
    const match = configGroupOptions.find(
      (g) => g.value === value || g.label === value || g.value.toLowerCase() === value.toLowerCase()
    );
    return match?.label || value;
  };

  const resolveMobileDeviceLabel = (asset: Asset) => {
    const device = String((asset as any).device ?? "").trim();
    const model = String(asset.mobileModel ?? "").trim();
    const mobile = String(asset.mobileDevice ?? "").trim();
    // Prefer real device/model; never show the legacy import placeholder "Traccar".
    if (device && device.toLowerCase() !== "traccar") return device;
    if (model && model.toLowerCase() !== "traccar") return model;
    if (mobile && mobile.toLowerCase() !== "traccar") return mobile;
    return "";
  };

  useEffect(() => {
    assetsDataRef.current = assetsData;
  }, [assetsData]);

  useEffect(() => {
    const tenantId = String(getTenantId() ?? "").trim();
    if (!tenantId || assetsData.length === 0) return;
    const flush = () => rememberLivePositions(tenantId, assetsData as unknown as Array<Record<string, unknown>>);
    const timer = window.setTimeout(flush, 400);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, [assetsData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStatusTick((n) => n + 1);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      if (cancelled) return;
      const current = assetsDataRef.current;
      if (!current.length) {
        timer = window.setTimeout(poll, 20_000);
        return;
      }
      const refreshed = await refreshAssetsLiveStatus(current);
      if (!cancelled) {
        setAssetsData(refreshed);
        writeAssetsCache(refreshed);
      }
      if (!cancelled) timer = window.setTimeout(poll, 20_000);
    };

    timer = window.setTimeout(poll, 20_000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [getTenantId()]);

  const computeSiteOptions = () => {
    const sites = new Set<string>();
    const selection = readStoredSelectionScope();

    // Only sites that belong to the active database.
    for (const raw of selection.activeDbSites) {
      const name = String(raw ?? "").trim();
      if (name) sites.add(name);
    }

    if (sites.size === 0) {
      const activeDbId = String(selection.activeDbId ?? "").trim().toLowerCase();
      const activeDbName = String(activeDatabaseLabel ?? "").trim().toLowerCase();
      const dealersRaw = window.localStorage.getItem("vivi.org.dealers");
      if (dealersRaw) {
        try {
          const dealers = JSON.parse(dealersRaw);
          if (Array.isArray(dealers)) {
            for (const dealer of dealers) {
              const orgs = Array.isArray(dealer?.organisations) ? dealer.organisations : [];
              for (const org of orgs) {
                const dbs = Array.isArray(org?.databases) ? org.databases : [];
                for (const db of dbs) {
                  const dbId = String(db?.id ?? "").trim().toLowerCase();
                  const dbName = String(db?.name ?? "").trim().toLowerCase();
                  const matchesDb =
                    (activeDbId && dbId === activeDbId) ||
                    (activeDbName && dbName === activeDbName);
                  if (!matchesDb) continue;
                  const s = Array.isArray(db?.sites) ? db.sites : [];
                  for (const site of s) {
                    const name = String(site?.name ?? "").trim();
                    if (name) sites.add(name);
                  }
                }
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    // Include sites already used by assets that belong to this database only.
    const dbNeedle = String(activeDatabaseLabel ?? "").trim().toLowerCase();
    assetsData.forEach((a) => {
      const name = String(a.site ?? "").trim();
      if (!name) return;
      if (sites.size > 0) {
        // Only add if already in the active DB site set, or asset is tagged with this database.
        const assetDb = String((a as any).database ?? "").trim().toLowerCase();
        if (sites.has(name) || (dbNeedle && assetDb === dbNeedle)) sites.add(name);
        return;
      }
      if (!dbNeedle || String((a as any).database ?? "").trim().toLowerCase() === dbNeedle) {
        sites.add(name);
      }
    });

    const activeSite = String(selection.activeSite ?? "").trim();
    if (activeSite && (sites.size === 0 || sites.has(activeSite))) sites.add(activeSite);

    return Array.from(sites).sort((a, b) => a.localeCompare(b));
  };

  const configGroupExists = async (groupValue: string): Promise<boolean> => {
    const selected = String(groupValue ?? "").trim();
    if (!selected) return false;

    const existing = await getConfigurationGroups<{ id?: string; name?: string }>();
    return existing.some((group) => {
      const id = String(group?.id ?? "").trim().toLowerCase();
      const name = String(group?.name ?? "").trim().toLowerCase();
      const needle = selected.toLowerCase();
      return (id && id === needle) || (name && name === needle);
    });
  };

  useEffect(() => {
    let mounted = true;
    let loadGen = 0;
    const loadAssets = async (options?: { force?: boolean }) => {
      const my = ++loadGen;
      if (assetsDataRef.current.length === 0) {
        const cached = readAssetsCache();
        if (cached.length) {
          assetsDataRef.current = cached;
          setAssetsData(cached);
        } else {
          setAssetsListLoading(true);
        }
      }
      try {
      const [tz, apiAssets] = await Promise.all([
        getSiteTimeZoneSettings(),
        getAssetsFromApi<Asset>({ force: options?.force !== false })
      ]);
      if (!mounted || my !== loadGen) return;
      setSiteTimeZones(tz);

      const tenantId = String(readActiveTenantId() || getTenantId() || "").trim();
      const syncFromTraccarIfNeeded = async (afterRows: Asset[]) => {
        // Only auto-import when the fleet is empty — never re-import over user-created
        // assets (that race made rows disappear, then reappear as duplicates).
        if (afterRows.length > 0) return afterRows;
        if (isCms808Server()) return afterRows;
        if (tenantSkipsAutomaticFleetImport(tenantId)) return afterRows;
        const importKey = tenantId ? `vivi.assets.importedFromTraccar.v5:${tenantId}` : "";
        const attemptKey = tenantId ? `vivi.assets.importTraccarAttempted.v1:${tenantId}` : "";
        const alreadyImported = importKey
          ? String(window.localStorage.getItem(importKey) ?? "").trim().toLowerCase() === "true"
          : false;
        const lastAttemptMs = attemptKey ? Number(window.localStorage.getItem(attemptKey) ?? 0) || 0 : 0;
        const attemptedRecently = lastAttemptMs > 0 && Date.now() - lastAttemptMs < 15 * 60 * 1000;
        if (!tenantId || alreadyImported || attemptedRecently || !getApiKey()) return afterRows;
        const targetSite = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim() || "Default";
        try {
          if (attemptKey) window.localStorage.setItem(attemptKey, String(Date.now()));
        } catch {
          // ignore
        }
        showToast("Syncing devices from VIVI…", "info");
        const imported = await importAssetsFromTraccarApi({ site: targetSite, tenantId });
        if (!mounted || my !== loadGen) return afterRows;
        if (imported.imported > 0 || imported.updated > 0 || imported.assets.length > 0) {
          try {
            if (importKey) window.localStorage.setItem(importKey, "true");
          } catch {
            // ignore
          }
          const rows = imported.assets.length
            ? (imported.assets as Asset[])
            : await getAssetsFromApi<Asset>({ force: true });
          if (!mounted || my !== loadGen) return afterRows;
          const parts = [
            imported.imported > 0 ? `${imported.imported} imported` : "",
            imported.updated > 0 ? `${imported.updated} updated` : ""
          ].filter(Boolean);
          showToast(
            parts.length
              ? `VIVI sync: ${parts.join(", ")}.`
              : `Synced ${rows.length} devices from VIVI.`,
            "success"
          );
          return rows;
        }
        if (imported.error) {
          showToast(`VIVI import: ${imported.error}`, "error");
        }
        return afterRows;
      };

      const attachMissingSiteDevices = async (rows: Asset[]) => {
        if (isPersonalDemoTenant(tenantId)) return rows;
        const siteName = readActiveSiteName();
        if (!siteName) {
          if (mounted && my === loadGen) setActiveSiteGroupImeis([]);
          return rows;
        }
        try {
          const [groups, devices] = await Promise.all([getTraccarGroups(), getTraccarDevices({ all: true })]);
          if (!mounted || my !== loadGen) return rows;
          const groupImeis = imeisForSiteGroup(devices, groups, siteName);
          setActiveSiteGroupImeis(groupImeis);
          const missing = missingDevicesForSite(
            devices,
            groups,
            siteName,
            rows.map((row) => String(row.imei ?? ""))
          );
          const extras = missing.map((device) => ({
            id: `asset-${device.imei}`,
            status: "available" as const,
            assetDescription: device.name,
            fleetNumber: "",
            imei: device.imei,
            site: device.site,
            model: "",
            lastPosition: "",
            lastTrip: "",
            registration: device.name,
            assetId: 0,
            country: "",
            importedFrom: "traccar",
            ...(device.traccarDeviceId ? { traccarDeviceId: device.traccarDeviceId } : {})
          })) as Asset[];
          const selection = readStoredSelectionScope();
          const misplaced = rows.filter((row) => {
            const imei = String(row.imei ?? "").trim();
            if (!imei || !groupImeis.includes(imei)) return false;
            return !matchesStoredSiteSelection(resolveAssetSiteName(row), selection);
          });
          if (canForPath("/Track/fleet/assets", "edit") && (extras.length || misplaced.length)) {
            const syncKey = `vivi.assets.missingSiteSync:${tenantId}:${siteName}`;
            const last = Number(window.sessionStorage.getItem(syncKey) ?? 0) || 0;
            if (Date.now() - last > 10 * 60 * 1000) {
              try {
                window.sessionStorage.setItem(syncKey, String(Date.now()));
              } catch {
                // ignore
              }
              void (async () => {
                let stored = 0;
                for (const extra of extras) {
                  const saved = await upsertAssetDetailed({
                    id: extra.id,
                    imei: extra.imei,
                    assetDescription: extra.assetDescription,
                    registration: extra.registration,
                    site: extra.site,
                    status: "available",
                    importedFrom: "traccar",
                    ...(extra as { traccarDeviceId?: number }).traccarDeviceId
                      ? { traccarDeviceId: (extra as { traccarDeviceId?: number }).traccarDeviceId }
                      : {}
                  });
                  if (saved.stored) stored += 1;
                }
                for (const row of misplaced) {
                  const saved = await upsertAssetDetailed({
                    id: row.id,
                    imei: row.imei,
                    site: siteName,
                    ...(String(row.configGroup ?? "").trim() ? { configGroup: row.configGroup } : {})
                  });
                  if (saved.stored) stored += 1;
                }
                if (!stored || !mounted || my !== loadGen) return;
                const refreshed = await getAssetsFromApi<Asset>({ force: true });
                if (!mounted || my !== loadGen || !refreshed.length) return;
                await syncAssetsForDisplay(refreshed, { enrich: false });
              })();
            }
          }
          return extras.length ? [...rows, ...extras] : rows;
        } catch {
          return rows;
        }
      };

      const sharedDemoDatabase = isSharedDemoDatabaseTenant(tenantId);
      if (apiAssets.length) {
        const rows = sharedDemoDatabase
          ? apiAssets
          : await attachMissingSiteDevices(await syncFromTraccarIfNeeded(apiAssets));
        if (!mounted || my !== loadGen) return;
        // Show rows now; enrich telemetry without blocking the page.
        await syncAssetsForDisplay(rows, { enrich: false });
        if (mounted && my === loadGen) setAssetsListLoading(false);
        void syncAssetsForDisplay(rows);
      } else if (sharedDemoDatabase) {
        assetsDataRef.current = [];
        setAssetsData([]);
        clearCachedAssets(tenantId || null);
      } else {
        // If this tenant has no assets yet, try a one-time migration from the legacy (no-tenant) store.
        // This happens when the org selector generates a new tenant id, but earlier assets were created before tenancy.
        const migratedKey = tenantId ? `vivi.assets.migratedFromLegacy:${tenantId}` : "";
        const alreadyMigrated = migratedKey
          ? String(window.localStorage.getItem(migratedKey) ?? "").trim().toLowerCase() === "true"
          : false;

        if (tenantId && !alreadyMigrated && !tenantSkipsAutomaticFleetImport(tenantId)) {
          const legacyAssets = await getAssetsFromApiForTenant<Asset>(null);
          if (!mounted || my !== loadGen) return;
          const emptyTenantAssets = await getAssetsFromApiForTenant<Asset>("");
          if (!mounted || my !== loadGen) return;
          const sourceLegacy = legacyAssets.length ? legacyAssets : emptyTenantAssets;
          if (sourceLegacy.length > 0) {
            // Requires login token.
            if (!getApiKey()) {
              showToast("Log in to migrate assets into this database.", "error");
              navigate("/login");
              return;
            }

            const targetSite = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim() || "Default";
            showToast(`Migrating ${sourceLegacy.length} assets into this database...`, "info");

            let okCount = 0;
            for (const asset of sourceLegacy) {
              const id = String((asset as any)?.id ?? "").trim();
              const imei = String((asset as any)?.imei ?? "").trim();
              const configGroup = String((asset as any)?.configGroup ?? (asset as any)?.configurationGroup ?? "").trim() || "default-group";
              if (!id || !imei) continue;
              const payload: any = {
                ...asset,
                id,
                imei,
                configGroup,
                site: targetSite
              };
              const res = await upsertAssetDetailedForTenant(payload, tenantId);
              if (res.stored) okCount += 1;
            }

            try {
              window.localStorage.setItem(migratedKey, "true");
            } catch {
              // ignore
            }

            if (okCount > 0) {
              const refreshed = await getAssetsFromApi<Asset>({ force: true });
              if (!mounted || my !== loadGen) return;
              const rows = await syncFromTraccarIfNeeded(refreshed);
              if (!mounted || my !== loadGen) return;
              await syncAssetsForDisplay(rows);
              showToast(`Migrated ${okCount} assets.`, "success");
              return;
            }
          }
        }

        const rows = await syncFromTraccarIfNeeded([]);
        if (!mounted || my !== loadGen) return;
        if (rows.length) {
          await syncAssetsForDisplay(rows);
          return;
        }

        if (!assetsDataRef.current.length) {
          setAssetsData([]);
        }
      }
      } finally {
        if (mounted && my === loadGen) setAssetsListLoading(false);
      }
    };
    const handleTimeZoneUpdate = (event: Event) => {
      const detail = (event as CustomEvent<SiteTimeZoneSettings | null>)?.detail;
      if (detail && typeof detail === "object") {
        setSiteTimeZones(detail);
        return;
      }
      void (async () => {
        const tz = await getSiteTimeZoneSettings();
        if (mounted) setSiteTimeZones(tz);
      })();
    };
    const onContextChange = () => {
      const nextTenant = String(readActiveTenantId() || getTenantId() || "").trim();
      const nextSite = readActiveSiteName();
      const tenantChanged = nextTenant !== loadedTenantRef.current;
      const siteChanged = nextSite !== loadedSiteRef.current;
      if (!tenantChanged && !siteChanged) return;
      loadedTenantRef.current = nextTenant;
      loadedSiteRef.current = nextSite;
      const cached = readAssetsCache();
      const selection = readStoredSelectionScope();
      const cachedForSite = cached.filter((asset) => matchesStoredSiteSelection(resolveAssetSiteName(asset), selection));
      assetsDataRef.current = cached;
      setAssetsData(cached);
      // Same database with rows for this site: refilter only. Empty after a
      // switch must refetch — cache-first otherwise leaves Assets at 0.
      if (!tenantChanged && cachedForSite.length) {
        setAssetsListLoading(false);
        return;
      }
      setAssetsListLoading(!cachedForSite.length);
      void loadAssets({ force: !cachedForSite.length });
    };
    const onAssetsChange = (event: Event) => {
      const detail = (event as CustomEvent<{ assets?: Asset[]; tenantId?: string; reason?: string }>)?.detail;
      const assets = detail?.assets;
      const eventTenant = String(detail?.tenantId ?? "").trim();
      const activeTenant = String(readActiveTenantId() || getTenantId() || "").trim();
      if (eventTenant && activeTenant && eventTenant !== activeTenant) return;
      if (Array.isArray(assets) && mounted) {
        void syncAssetsForDisplay(assets, { enrich: false });
        void syncAssetsForDisplay(assets);
        return;
      }
      // Catalog invalidate from another session / websocket — force refetch.
      clearCachedAssets(activeTenant || null);
      void loadAssets({ force: true });
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void loadAssets({ force: true });
    };
    window.addEventListener(SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT, handleTimeZoneUpdate as EventListener);
    const unsubscribeScope = subscribeScopeChange(onContextChange);
    window.addEventListener("vivi:assetschange", onAssetsChange as EventListener);
    document.addEventListener("visibilitychange", onVisibility);
    void loadAssets();
    return () => {
      mounted = false;
      window.removeEventListener(SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT, handleTimeZoneUpdate as EventListener);
      unsubscribeScope();
      window.removeEventListener("vivi:assetschange", onAssetsChange as EventListener);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Keep Assets in sync when another account/session adds or edits fleet rows.
  useEffect(() => {
    const client = getSharedRealtimeClient();
    const unsub = client.subscribe({
      channels: ["live"],
      site: readActiveSiteName(),
      onMessage: (message) => {
        if (message.type !== "catalog.assets") return;
        const eventTenant = String((message.payload as any)?.tenantId ?? "").trim();
        const activeTenant = String(readActiveTenantId() || getTenantId() || "").trim();
        if (eventTenant && activeTenant && eventTenant !== activeTenant) return;
        clearCachedAssets(activeTenant || null);
        window.dispatchEvent(
          new CustomEvent("vivi:assetschange", {
            detail: { tenantId: activeTenant || eventTenant, reason: "catalog" }
          })
        );
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!assetsData.length) return;
    let cancelled = false;
    let timer: number | null = null;

    const pollLivePositions = async () => {
      const current = assetsDataRef.current;
      const next = (await applyTraccarLiveSnapshotsToAssets(current)) as Asset[];
      if (cancelled) return;
      const changed = next.some((row, index) => row !== current[index]);
      if (changed) {
        assetsDataRef.current = next;
        setAssetsData(next);
      }
      timer = window.setTimeout(() => {
        void pollLivePositions();
      }, 5_000);
    };

    void pollLivePositions();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [assetsData.length]);

  useEffect(() => {
    let mounted = true;
    const applyMobileCatalog = (mobile: string[]) => {
      setDeviceCatalog(mobile);
      setDeviceModels(buildDeviceModelMap(mobile));
    };

    const loadLibraryCatalogs = async () => {
      const [mobile, firmware] = await Promise.all([
        loadMobileDeviceLibraryOptions(),
        loadFirmwareLibraryOptions()
      ]);
      if (!mounted) return;
      applyMobileCatalog(mobile);
      setFirmwareOptions(firmware);
    };

    void loadLibraryCatalogs();
    const onOrgChange = () => void loadLibraryCatalogs();
    window.addEventListener("vivi:orgchange", onOrgChange);
    return () => {
      mounted = false;
      window.removeEventListener("vivi:orgchange", onOrgChange);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadConfigGroups = async () => {
      purgeMockConfigurationGroupsFromLocalStorage();
      const cacheKey = configGroupsCacheKey();
      const groups = filterOutMockConfigurationGroups(await getConfigurationGroups<ConfigGroupLike>());
      if (!mounted) return;
      const activeSite = readActiveSiteName();
      const scopedGroups = filterForSiteScope(groups, activeSite);
      let source = scopedGroups;
      if (scopedGroups.length) {
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify(scopedGroups));
        } catch {
          // ignore
        }
      } else {
        const stored = window.localStorage.getItem(cacheKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            source = filterForSiteScope(
              filterOutMockConfigurationGroups(Array.isArray(parsed) ? parsed : []),
              activeSite
            );
          } catch {
            source = [];
          }
        }
      }

      const options = buildConfigGroupOptions(source);
      setConfigGroupOptions(options);
      setConfigGroupRecords(source as ConfigGroupLike[]);
    };
    void loadConfigGroups();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleOrgChange = () => {
      void (async () => {
        purgeMockConfigurationGroupsFromLocalStorage();
        const cacheKey = configGroupsCacheKey();
        const groups = filterOutMockConfigurationGroups(await getConfigurationGroups<ConfigGroupLike>());
        const activeSite = readActiveSiteName();
        const scopedGroups = filterForSiteScope(groups, activeSite);
        let source = scopedGroups;
        if (scopedGroups.length) {
          try {
            window.localStorage.setItem(cacheKey, JSON.stringify(scopedGroups));
          } catch {
            // ignore
          }
        } else {
          const stored = window.localStorage.getItem(cacheKey);
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              source = filterForSiteScope(
                filterOutMockConfigurationGroups(Array.isArray(parsed) ? parsed : []),
                activeSite
              );
            } catch {
              source = [];
            }
          }
        }

        const options = buildConfigGroupOptions(source);
        setConfigGroupOptions(options);
        setConfigGroupRecords(source as ConfigGroupLike[]);
      })();
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => {
      window.removeEventListener("vivi:orgchange", handleOrgChange);
    };
  }, []);

  useEffect(() => {
    if (!showAddModal) return;
    let mounted = true;
    const refreshGroups = async () => {
      purgeMockConfigurationGroupsFromLocalStorage();
      const cacheKey = configGroupsCacheKey();
      const groups = filterOutMockConfigurationGroups(await getConfigurationGroups<ConfigGroupLike>());
      if (!mounted) return;
      const activeSite = readActiveSiteName();
      const scopedGroups = filterForSiteScope(groups, activeSite);
      let source = scopedGroups;
      if (scopedGroups.length) {
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify(scopedGroups));
        } catch {
          // ignore
        }
      } else {
        const stored = window.localStorage.getItem(cacheKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            source = filterForSiteScope(
              filterOutMockConfigurationGroups(Array.isArray(parsed) ? parsed : []),
              activeSite
            );
          } catch {
            source = [];
          }
        }
      }

      const options = buildConfigGroupOptions(source);
      setConfigGroupOptions(options);
      setConfigGroupRecords(source as ConfigGroupLike[]);
      if (options.length) {
        setFormValues((current) => {
          if (current.configurationGroup) return current;
          return { ...current, configurationGroup: options[0].value };
        });
      }
    };
    void refreshGroups();
    return () => {
      mounted = false;
    };
  }, [showAddModal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => {
      const sites = computeSiteOptions();
      setSiteOptions(sites);
      if (showAddModal) {
        setFormValues((current) => {
          if (current.site) return current;
          if (!sites.length) return current;
          return { ...current, site: sites[0] };
        });
      }
    };
    refresh();
    const onOrgChange = () => {
      refresh();
    };
    window.addEventListener("vivi:orgchange", onOrgChange);
    return () => {
      window.removeEventListener("vivi:orgchange", onOrgChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal]);

  useEffect(() => {
    let cancelled = false;
    const mergeCmsRows = (rows: Asset[], previous: Asset[]): Asset[] =>
      rows.map((row): Asset => {
        const prior = previous.find(
          (item) => String(item.id) === String(row.id) || (row.imei && String(item.imei) === String(row.imei))
        );
        if (!prior) return row;
        const hasFreshFix = Boolean(String(row.lastSeen ?? "").trim() || String(row.lastPosition ?? "").trim());
        if (hasFreshFix) {
          const rowTrip = String(row.lastTrip ?? "").trim();
          const priorTrip = String(prior.lastTrip ?? "").trim();
          const rowSeen = String(row.lastSeen ?? row.lastPosition ?? "").trim();
          const newerStamp = (left: string, right: string) => {
            const leftMs = Date.parse(left);
            const rightMs = Date.parse(right);
            if (!left) return right;
            if (!right) return left;
            if (Number.isNaN(leftMs)) return right;
            if (Number.isNaN(rightMs)) return left;
            return leftMs >= rightMs ? left : right;
          };
          return {
            ...row,
            lastTrip: newerStamp(newerStamp(rowTrip, priorTrip), rowSeen)
          } as Asset;
        }
        return {
          ...row,
          lastSeen: prior.lastSeen,
          lastPosition: prior.lastPosition,
          lastTrip: prior.lastTrip || prior.lastSeen,
          lat: typeof row.lat === "number" ? row.lat : prior.lat,
          lng: typeof row.lng === "number" ? row.lng : prior.lng,
          gps: row.gps || prior.gps,
          speed: row.speed ?? prior.speed
        } as Asset;
      });
    const loadCms = async () => {
      if (!cms808HierarchyActive()) {
        setCms808Assets([]);
        return;
      }
      const vehicles = await loadCms808VehiclesForActiveHierarchy();
      if (cancelled) return;
      // First paint only when nothing is on screen yet — never wipe times on each poll.
      setCms808Assets((prev) => {
        if (prev.length) return prev;
        return vehicles.map((vehicle) => cms808VehicleToAssetRecord(vehicle, null) as Asset);
      });
      const rows: Asset[] = await Promise.all(
        vehicles.map(async (vehicle) => {
          const gps = await loadCms808Position(vehicle).catch(() => null);
          return cms808VehicleToAssetRecord(vehicle, gps) as Asset;
        })
      );
      if (cancelled) return;
      setCms808Assets((prev) => mergeCmsRows(rows, prev));
    };
    void loadCms();
    const timer = window.setInterval(() => {
      void loadCms();
    }, 5_000);
    const reload = () => void loadCms();
    window.addEventListener("vivi:orgchange", reload);
    window.addEventListener("vivi:contextchange", reload);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("vivi:orgchange", reload);
      window.removeEventListener("vivi:contextchange", reload);
    };
  }, []);

  const pathScopedAssets = useMemo(() => {
    const groupImeis = new Set(activeSiteGroupImeis);
    const activeSiteName = String(selectionScope.activeSite ?? "").trim();
    const scoped = assetsData.filter((asset) => {
      const imei = String(asset.imei ?? "").trim();
      if (imei && groupImeis.has(imei)) return true;
      return matchesStoredSiteSelection(resolveAssetSiteName(asset), selectionScope);
    }).map((asset) => {
      const imei = String(asset.imei ?? "").trim();
      const resolved = resolveAssetSiteName(asset);
      if (imei && groupImeis.has(imei) && activeSiteName && !matchesStoredSiteSelection(resolved, selectionScope)) {
        return { ...asset, site: readActiveSiteName() || asset.site };
      }
      if (!String(asset.site ?? "").trim() && resolved) return { ...asset, site: resolved };
      return asset;
    });
    const usedLive = new Set<string>();
    const withLiveFix = scoped.map((asset) => {
      const live = findCms808LiveMatch(asset, cms808Assets);
      if (!live) return asset;
      usedLive.add(String(live.id));
      return overlayCms808LiveFields(asset, live);
    });
    const extra = cms808Assets.filter((asset) => !usedLive.has(String(asset.id)));
    return [...withLiveFix, ...extra];
  }, [activeSiteGroupImeis, assetsData, cms808Assets, selectionScope]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const byFilter = pathScopedAssets.filter((asset) => matchesFilter(asset, activeFilter, bulkFilterTokens));
    if (!q) return byFilter;
    return byFilter.filter((a) => {
      const displayModel = resolveAssetDisplayModel(a);
      const hay = [
        a.assetDescription,
        a.registration,
        a.imei,
        a.fleetNumber,
        a.vin,
        a.engineNumber,
        a.site,
        displayModel,
        a.mobileModel,
        a.cameraModel,
        a.country,
        a.configGroup
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [pathScopedAssets, activeFilter, searchQuery, bulkFilterTokens]);

  // Device-reported faults: refresh from the shared (cached) Traccar live snapshot.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const live = await getTraccarLive();
      if (!mounted) return;
      const next = new Map<string, TraccarLiveRow>();
      for (const row of live) {
        const imei = String(row.imei ?? "").trim();
        if (imei) next.set(imei, row);
      }
      setLiveDeviceByImei(next);
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    window.addEventListener("vivi:orgchange", load);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("vivi:orgchange", load);
    };
  }, []);

  /** Stored faults win; otherwise what the tracker reports through Traccar. */
  const resolveAssetFaults = useCallback(
    (asset: Asset): string => {
      const stored = String(asset.faults ?? "").trim();
      if (stored) return stored;
      const imei = String(asset.imei ?? "").trim();
      const live = imei ? liveDeviceByImei.get(imei) : undefined;
      if (!live) return "";
      return deriveDeviceFaults(live).join(", ") || NO_DEVICE_FAULTS;
    },
    [liveDeviceByImei]
  );

  /** Stored upload date wins; otherwise the device's accepted upload in its configuration group. */
  const resolveConfigUploadDate = useCallback(
    (asset: Asset): string => {
      const raw = String(asset.configUploadDate ?? "").trim()
        || configUploadDateFromGroups(asset, configGroupRecords as any);
      return raw ? formatTimestampForSite(raw, asset.site, siteTimeZones) || raw : "";
    },
    [configGroupRecords, siteTimeZones]
  );

  const getAssetColumnSortValue = useCallback(
    (asset: Asset, key: ColumnKey): unknown => {
      if (key === "assetDescription") {
        return formatAssetDescription(asset) || asset.assetDescription || "";
      }
      if (key === "infoIssued") return getInfoIssued(asset) ? "Yes" : "No";
      if (key === "lastPosition" || key === "lastTrip") {
        const raw =
          key === "lastPosition" ? (asset.lastSeen || asset.lastPosition || "") : asset.lastTrip;
        if (key === "lastPosition" && isCms808LiveAsset(asset)) {
          return (
            cms808DisplayTime(raw, asset.site, siteTimeZones)
            || formatTimestampForSite(raw, asset.site, siteTimeZones)
            || ""
          );
        }
        return formatTimestampForSite(raw, asset.site, siteTimeZones) || "";
      }
      if (key === "model") return resolveAssetDisplayModel(asset);
      if (key === "mobileDevice") return resolveMobileDeviceLabel(asset);
      if (key === "configGroup") return resolveConfigGroupLabel(asset.configGroup);
      if (key === "faults") return resolveAssetFaults(asset);
      if (key === "configUploadDate") {
        const raw = String(asset.configUploadDate ?? "").trim()
          || configUploadDateFromGroups(asset, configGroupRecords as any);
        return raw ? Date.parse(raw) || raw : "";
      }
      return asset[key as keyof Asset] ?? "";
    },
    [siteTimeZones, configGroupOptions, resolveAssetFaults, configGroupRecords]
  );

  const { sortedRows: sortedFilteredAssets, getHeaderProps: getAssetHeaderProps } = useColumnSort({
    rows: filteredAssets,
    getValue: getAssetColumnSortValue
  });

  const fleetNumberColWidth = Math.max(
    130,
    Math.min(
      320,
      sortedFilteredAssets.reduce((max, a) => {
        const len = String(a.fleetNumber ?? "").length;
        return len > max ? len : max;
      }, "ISP Serial Number".length) * 8 + 24
    )
  );
  // Each column is at least its preset width and grows to its longest cell (rows are subgrids).
  const grid = `${activeCols.map((col) => `minmax(${col.key === "fleetNumber" ? fleetNumberColWidth : columnWidths[col.key]}px, max-content)`).join(" ")} 48px`;

  const totalPages = Math.max(1, Math.ceil(sortedFilteredAssets.length / ASSETS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * ASSETS_PER_PAGE;
  const pagedAssets = sortedFilteredAssets.slice(pageStart, pageStart + ASSETS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter, bulkFilterTokens]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const countFor = (label: string) =>
    pathScopedAssets.filter((asset) =>
      matchesFilter(asset, label, isBulkIdentityFilter(label) ? bulkFilterTokens : [])
    ).length;

  const toggleCol = (key: ColumnKey) => {
    if (key === "lastPosition") return;
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setVisibleCols(next);
  };

  const markTabDirty = (tab: string) =>
    setDirtyTabs((current) => ({ ...current, [tab]: true }));
  const clearTabDirty = (tab: string) =>
    setDirtyTabs((current) => ({ ...current, [tab]: false }));

  const attemptSwitchAddTab = (nextTab: string) => {
    if (dirtyTabs[activeAddTab]) {
      showToast("Save this page before switching.", "error");
      return;
    }
    setActiveAddTab(nextTab);
  };

  const updateField = (key: keyof typeof formValues, value: (typeof formValues)[keyof typeof formValues]) => {
    setFormValues((current) => ({ ...current, [key]: value }));
    markTabDirty(activeAddTab);
    setMissingRequiredFields((current) => {
      if (!current.has(String(key))) return current;
      const next = new Set(current);
      next.delete(String(key));
      return next;
    });
  };

  const fieldMissingClass = (key: string) =>
    missingRequiredFields.has(key) ? REQUIRED_MISSING_CLASS : undefined;

  const openAddModal = () => {
    setEditingAssetId(null);
    setAssetSaved(false);
    setActiveAddTab("Asset details");
    setDirtyTabs({});
    setFormValues({
      assetDescription: "",
      assetType: "",
      registration: "",
      site: "",
      configurationGroup: "",
      country: "",
      fleetNumber: "",
      vin: "",
      make: "",
      model: "",
      year: "",
      engineNumber: "",
      fuelType: "",
      targetFuel: "",
      fuelTankCapacity: "",
      serialNumber: "",
      additionalMobileDevice: "",
      trackingIcon: "",
      assetColour: "",
      assetStatus: "Available",
      expiryMode: "never",
      expiryDate: "",
      statusNotes: "",
      hasDefaultDriver: false,
      defaultDriver: "",
      lastPosition: "",
      lastTrip: "",
      odometer: "",
      engineHours: "",
      lastLocation: "",
      configUploadDate: "",
      imsi: "",
      msisdn: "",
      cameraSerial: "",
      faults: ""
    });
    setMobileDeviceRows([createEmptyMobileDeviceRow()]);
    setServiceHistoryRows([]);
    setReminderRows([]);
    setFuelRows([]);
    setOtherCostRows([]);
    setCertificateRows([]);
    setLicenceRows([]);
    setShowAddModal(true);
  };

  const openEditModal = (asset: Asset) => {
    const stableId = getStableAssetId(asset) || asset.id;
    const driverState = readAssetDefaultDriverFormState(asset as Record<string, unknown>);
    setEditingAssetId(stableId || null);
    setAssetSaved(true);
    setActiveAddTab("Asset details");
    setDirtyTabs({});
    setFormValues({
      assetDescription: asset.assetDescription ?? "",
      assetType: asset.assetType ?? "",
      registration: asset.registration ?? "",
      site: asset.site ?? "",
      configurationGroup: asset.configGroup ?? "",
      country: asset.country ?? "",
      fleetNumber: asset.fleetNumber ?? "",
      vin: asset.vin ?? "",
      make: asset.make ?? "",
      model: asset.model ?? "",
      year: asset.year ?? "",
      engineNumber: String(asset.engineNumber ?? (asset as any).engine_no ?? "").trim(),
      fuelType: "",
      targetFuel: "",
      fuelTankCapacity: "",
      serialNumber: "",
      additionalMobileDevice: asset.mobileDevice ?? "",
      trackingIcon: "",
      assetColour: "",
      assetStatus: asset.status === "unavailable" ? "Not available" : String((asset as any).assetStatus ?? "Available"),
      expiryMode: String((asset as any).expiryMode ?? "never"),
      expiryDate: String((asset as any).expiryDate ?? ""),
      statusNotes: String((asset as any).statusNotes ?? ""),
      hasDefaultDriver: driverState.hasDefaultDriver,
      defaultDriver: driverState.defaultDriver,
      lastPosition: "",
      lastTrip: "",
      odometer: "",
      engineHours: "",
      lastLocation: "",
      configUploadDate: "",
      imsi: "",
      msisdn: "",
      cameraSerial: asset.cameraSerial ?? "",
      faults: ""
    });
    setMobileDeviceRows([
      {
        ...createEmptyMobileDeviceRow(),
        device: String((asset as any).device ?? "").trim(),
        model: String((asset as any).mobileModel ?? "").trim(),
        imei: String(asset.imei ?? "").trim(),
        odometer: String(asset.odometer ?? "").trim(),
        status: String(asset.status ?? "").trim(),
        firmware: String((asset as any).firmware ?? "").trim(),
        standaloneMode: String((asset as any).standaloneMode ?? "").trim().toLowerCase() === "yes" ? "yes" : "no",
        camera: String((asset as any).camera ?? "").trim(),
        cameraModel: String((asset as any).cameraModel ?? "").trim(),
        ...normalizeVc400Protocols(
          (asset as any).cameraModel,
          (asset as any).cameraPositioningProtocol,
          (asset as any).cameraVideoProtocol,
          (asset as any).camera
        ),
        cameraComponents: parseAdditionalCameraComponents(
          (asset as any).cameraComponents
            ?? (Array.isArray((asset as any).cameraChannelsSelected)
              ? (asset as any).cameraChannelsSelected.join(", ")
              : "")
        ).join(", "),
        cameraSerial: String((asset as any).cameraSerial ?? "").trim(),
        cameraStatus: String((asset as any).cameraStatus ?? "").trim(),
        cameraFirmware: String((asset as any).cameraFirmware ?? "").trim()
      }
    ]);
    const editDevice = String((asset as any).device ?? asset.mobileDevice ?? "").trim();
    const editModel = String((asset as any).mobileModel ?? "").trim();
    const editFirmware = String((asset as any).firmware ?? "").trim();
    setDeviceCatalog((current) => {
      let next = current;
      if (editDevice) next = mergeCatalogOption(next, editDevice);
      if (String(asset.mobileDevice ?? "").trim()) {
        next = mergeCatalogOption(next, String(asset.mobileDevice ?? "").trim());
      }
      return next;
    });
    setDeviceModels((current) => {
      const next = { ...current };
      const names = [editDevice, String(asset.mobileDevice ?? "").trim()].filter(Boolean);
      for (const name of names) {
        const model = editModel || name;
        const models = [...(next[name] ?? [])];
        if (!models.some((item) => item.trim().toLowerCase() === model.toLowerCase())) models.push(model);
        next[name] = models.sort((a, b) => a.localeCompare(b));
      }
      return next;
    });
    if (editFirmware) {
      setFirmwareOptions((current) => mergeCatalogOption(current, editFirmware));
    }
    setServiceHistoryRows(readAssetSectionRows(asset, "serviceHistory"));
    setReminderRows(readAssetSectionRows(asset, "reminders"));
    setFuelRows(readAssetSectionRows(asset, "fuelData"));
    setOtherCostRows(readAssetSectionRows(asset, "otherCosts"));
    setCertificateRows(readAssetSectionRows(asset, "requiredCertificates") as typeof certificateRows);
    setLicenceRows(readAssetSectionRows(asset, "requiredLicences") as typeof licenceRows);
    setShowAddModal(true);
  };

  const openDuplicateModal = (asset: Asset) => {
    const driverState = readAssetDefaultDriverFormState(asset as Record<string, unknown>);
    setEditingAssetId(null);
    setAssetSaved(true);
    setActiveAddTab("Asset details");
    setDirtyTabs({});
    setFormValues({
      assetDescription: asset.assetDescription ?? "",
      assetType: asset.assetType ?? "",
      registration: "",
      site: asset.site ?? "",
      configurationGroup: asset.configGroup ?? "",
      country: asset.country ?? "",
      fleetNumber: "",
      vin: asset.vin ?? "",
      make: asset.make ?? "",
      model: asset.model ?? "",
      year: asset.year ?? "",
      engineNumber: "",
      fuelType: "",
      targetFuel: "",
      fuelTankCapacity: "",
      serialNumber: "",
      additionalMobileDevice: asset.mobileDevice ?? "",
      trackingIcon: "",
      assetColour: "",
      assetStatus: asset.status === "unavailable" ? "Not available" : String((asset as any).assetStatus ?? "Available"),
      expiryMode: String((asset as any).expiryMode ?? "never"),
      expiryDate: String((asset as any).expiryDate ?? ""),
      statusNotes: String((asset as any).statusNotes ?? ""),
      hasDefaultDriver: driverState.hasDefaultDriver,
      defaultDriver: driverState.defaultDriver,
      lastPosition: "",
      lastTrip: "",
      odometer: "",
      engineHours: "",
      lastLocation: "",
      configUploadDate: "",
      imsi: "",
      msisdn: "",
      cameraSerial: "",
      faults: ""
    });
    setMobileDeviceRows([createEmptyMobileDeviceRow()]);
    setServiceHistoryRows(readAssetSectionRows(asset, "serviceHistory"));
    setReminderRows(readAssetSectionRows(asset, "reminders"));
    setFuelRows(readAssetSectionRows(asset, "fuelData"));
    setOtherCostRows(readAssetSectionRows(asset, "otherCosts"));
    setCertificateRows(readAssetSectionRows(asset, "requiredCertificates") as typeof certificateRows);
    setLicenceRows(readAssetSectionRows(asset, "requiredLicences") as typeof licenceRows);
    setShowAddModal(true);
  };

  const customGroups: { id: string; name: string; assets: number }[] = [];
  const filteredCustomGroups = customGroups.filter((group) =>
    group.name.toLowerCase().includes(customGroupFilter.trim().toLowerCase())
  );

  const driverOptions = useMemo(() => {
    const site = String(formValues.site ?? "").trim();
    const filtered = site
      ? driverList.filter((driver) => siteScopesMatch(String(driver.site ?? ""), site))
      : driverList.filter((driver) => Boolean(String(driver.site ?? "").trim()));
    return filtered
      .map((driver) => driver.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [driverList, formValues.site]);

  const loadDriverList = async () => {
    setDriversLoading(true);
    try {
      const rows = await getDriversFromApi<{ id?: string; name?: string; site?: string }>();
      setDriverList(
        filterRecordsForActiveSelection(
          (Array.isArray(rows) ? rows : [])
            .map((row) => ({
              id: String(row.id ?? "").trim(),
              name: String(row.name ?? "").trim(),
              site: String(row.site ?? "").trim()
            }))
            .filter((row) => row.name)
        )
      );
    } catch {
      setDriverList([]);
    } finally {
      setDriversLoading(false);
    }
  };

  useEffect(() => {
    void loadDriverList();
    const onContextChange = () => void loadDriverList();
    window.addEventListener("vivi:orgchange", onContextChange);
    window.addEventListener("vivi:contextchange", onContextChange);
    return () => {
      window.removeEventListener("vivi:orgchange", onContextChange);
      window.removeEventListener("vivi:contextchange", onContextChange);
    };
  }, []);

  useEffect(() => {
    if (showAddModal) void loadDriverList();
  }, [showAddModal]);

  type SectionKey =
    | "Service history"
    | "Reminders"
    | "Fuel data"
    | "Other cost data"
    | "Mobile device settings"
    | "Required driver certificates"
    | "Required driver licences";

  const sectionFields: Record<SectionKey, { key: string; label: string }[]> = {
    "Service history": [
      { key: "date", label: "Date" },
      { key: "service", label: "Service" },
      { key: "vendor", label: "Vendor" },
      { key: "odometer", label: "Odometer" },
      { key: "cost", label: "Cost" },
      { key: "currency", label: "Currency" },
      { key: "invoice", label: "Invoice" },
      { key: "notes", label: "Notes" }
    ],
    Reminders: [
      { key: "reminder", label: "Reminder" },
      { key: "dueDate", label: "Due date" },
      { key: "status", label: "Status" },
      { key: "cost", label: "Cost" },
      { key: "currency", label: "Currency" },
      { key: "notes", label: "Notes" }
    ],
    "Fuel data": [
      { key: "date", label: "Date" },
      { key: "supplier", label: "Supplier" },
      { key: "location", label: "Location" },
      { key: "litres", label: "Litres" },
      { key: "pricePerLitre", label: "Price/Litre" },
      { key: "total", label: "Total" },
      { key: "currency", label: "Currency" },
      { key: "odometer", label: "Odometer" },
      { key: "invoice", label: "Invoice" }
    ],
    "Other cost data": [
      { key: "date", label: "Date" },
      { key: "category", label: "Category" },
      { key: "vendor", label: "Vendor" },
      { key: "cost", label: "Cost" },
      { key: "currency", label: "Currency" },
      { key: "invoice", label: "Invoice" },
      { key: "notes", label: "Notes" }
    ],
    "Mobile device settings": [
      { key: "device", label: "Device" },
      { key: "model", label: "Model" },
      { key: "imei", label: "IMEI" },
      { key: "odometer", label: "Odometer (KMs)" },
      { key: "status", label: "Status" },
      { key: "firmware", label: "Firmware" },
      { key: "standaloneMode", label: "Standalone mode" },
      { key: "camera", label: "Camera" },
      { key: "cameraModel", label: "Camera model" },
      { key: "cameraPositioningProtocol", label: "Positioning protocol" },
      { key: "cameraVideoProtocol", label: "Video protocol" },
      { key: "cameraComponents", label: "Additional components" },
      { key: "cameraSerial", label: "Camera serial" },
      { key: "cameraStatus", label: "Camera status" },
      { key: "cameraFirmware", label: "Camera firmware" }
    ],
    "Required driver certificates": [
      { key: "certificate", label: "Certificate" },
      { key: "holder", label: "Holder" },
      { key: "issued", label: "Issued" },
      { key: "expiry", label: "Expiry" },
      { key: "status", label: "Status" }
    ],
    "Required driver licences": [
      { key: "licence", label: "Licence" },
      { key: "holder", label: "Holder" },
      { key: "issued", label: "Issued" },
      { key: "expiry", label: "Expiry" },
      { key: "status", label: "Status" }
    ]
  };

  const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
    const escapeValue = (value: string) => {
      if (/[",\n]/.test(value)) return `"${value.replace(/"/g, "\"\"")}"`;
      return value;
    };
    const csvRows = [headers, ...rows].map((row) => row.map((cell) => escapeValue(String(cell))).join(","));
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const headers = activeCols.map((c) => c.label);
    const rows = filteredAssets.map((a) =>
      activeCols.map((c) => {
        if (c.key === "infoIssued") return getInfoIssued(a) ? "Yes" : "No";
        if (c.key === "faults") return resolveAssetFaults(a);
        if (c.key === "configUploadDate") return resolveConfigUploadDate(a);
        return String((a as any)[c.key] ?? "");
      })
    );
    downloadCsv(`assets-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const handleRefreshAssets = async (silent = false) => {
    try {
      const refreshed = await getAssetsFromApi<Asset>();
      if (refreshed.length) {
        await syncAssetsForDisplay(refreshed);
      } else if (!assetsDataRef.current.length) {
        await syncAssetsForDisplay(refreshed);
      }
      if (!silent) showToast("Assets refreshed.", "success");
    } catch (error: any) {
      if (!silent) showToast(`Failed to refresh assets: ${String(error?.message ?? error)}`, "error");
    }
  };

  const moveAllAssetsToActiveSite = async () => {
    const targetSite = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim() || "Gamini";
    const tenantId = String(getTenantId() ?? "").trim();
    if (!targetSite) {
      showToast("Select a site first.", "error");
      return;
    }
    if (!tenantId) {
      showToast("Select an organisation/database first.", "error");
      return;
    }

    const ok = window.confirm(`Move all assets in this organisation to site "${targetSite}"?`);
    if (!ok) return;

    let sourceAssets = await getAssetsFromApi<Asset>();
    let copiedFromLegacy = false;

    if (sourceAssets.length === 0) {
      const legacy = await getAssetsFromApiForTenant<Asset>(null);
      if (legacy.length > 0) {
        const copyOk = window.confirm(
          `No assets found in the current organisation, but found ${legacy.length} in legacy storage. Copy them into this organisation and set site to "${targetSite}"?`
        );
        if (!copyOk) return;
        sourceAssets = legacy;
        copiedFromLegacy = true;
      }
    }

    if (sourceAssets.length === 0) {
      showToast("No assets found to move.", "info");
      return;
    }

    showToast(`Updating ${sourceAssets.length} assets...`, "info");
    let okCount = 0;
    let failCount = 0;

    for (const asset of sourceAssets) {
      const id = String((asset as any)?.id ?? "").trim();
      const imei = String((asset as any)?.imei ?? "").trim();
      const configGroup = String((asset as any)?.configGroup ?? (asset as any)?.configurationGroup ?? "").trim();
      if (!id || !imei) {
        failCount += 1;
        continue;
      }
      const payload: any = {
        ...asset,
        id,
        imei,
        configGroup: configGroup || "",
        site: targetSite
      };
      const result = await upsertAssetDetailedForTenant(payload, tenantId);
      if (result.stored) okCount += 1;
      else failCount += 1;
    }

    const msg = `${okCount} updated, ${failCount} failed${copiedFromLegacy ? " (copied from legacy)" : ""}.`;
    showToast(msg, failCount === 0 ? "success" : okCount > 0 ? "info" : "error");

    const refreshed = await getAssetsFromApi<Asset>();
    if (refreshed.length) {
      await syncAssetsForDisplay(refreshed);
    }
  };

  const syncAssetForCommission = async (payload: Asset, imei: string): Promise<{ ok: boolean; error?: string }> => {
    const sync = await upsertAssetDetailed(payload);
    if (sync.stored) {
      if (sync.source !== "server") {
        return {
          ok: false,
          error: "Cannot commission while backend is offline/unreachable. The asset is only saved locally."
        };
      }
      return { ok: true };
    }

    const status = typeof sync.status === "number" ? sync.status : 0;
    const message = String(
      (sync.body && typeof sync.body === "object" && ((sync.body as any).error || (sync.body as any).message)) ||
      sync.error ||
      "Unknown error"
    );
    const lower = message.toLowerCase();
    const duplicateConflict =
      status === 409 &&
      (lower.includes("duplicate imei") ||
        lower.includes("duplicate asset description") ||
        lower.includes("duplicate registration"));

    if (!duplicateConflict) {
      return {
        ok: false,
        error: `Cannot commission: failed to sync asset to server. ${status ? `HTTP ${status}: ` : ""}${message}`
      };
    }

    const apiAssets = await getAssetsFromApi<Asset>();
    await syncAssetsForDisplay(apiAssets);
    const normalizedAssets = normalizeAndDedupeAssets(apiAssets as any[]);

    const existsByImei = normalizedAssets.some((row: Asset) => String(row?.imei ?? "").trim() === String(imei ?? "").trim());
    const payloadRegistration = String(payload.registration ?? "").trim().toLowerCase();
    const payloadDescription = String(payload.assetDescription ?? "").trim().toLowerCase();
    const existsByRegistration = Boolean(
      payloadRegistration &&
        normalizedAssets.some((row: Asset) => String(row?.registration ?? "").trim().toLowerCase() === payloadRegistration)
    );
    const existsByDescription = Boolean(
      payloadDescription &&
        normalizedAssets.some((row: Asset) => String(row?.assetDescription ?? "").trim().toLowerCase() === payloadDescription)
    );

    if (!existsByImei && !existsByRegistration && !existsByDescription) {
      return {
        ok: false,
        error:
          "Cannot commission: duplicate record exists on server, but a matching asset could not be resolved in this tenant."
      };
    }

    return { ok: true };
  };

  const closeDecommissionConfirm = () => {
    if (decommissionInProgress) return;
    setDecommissionConfirm(null);
    setDecommissionAcknowledged(false);
  };

  useEffect(() => {
    if (!decommissionConfirm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDecommissionConfirm();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [decommissionConfirm, decommissionInProgress]);

  const closeDeleteConfirm = () => {
    if (deleteInProgress) return;
    setDeleteConfirm(null);
    setDeleteAcknowledged(false);
  };

  const openDeleteConfirm = (asset: Asset) => {
    const id = String(asset.id ?? "").trim();
    const imei = String(asset.imei ?? "").trim();
    const registration = String(asset.registration ?? "").trim();
    if (!id && !imei && !registration) {
      showToast("This asset cannot be deleted because it has no identifier.", "error");
      return;
    }
    setDeleteAcknowledged(false);
    setDeleteConfirm({
      id,
      imei,
      registration,
      assetLabel:
        String(asset.assetDescription ?? "").trim() ||
        registration ||
        id ||
        "Untitled asset",
      site: String(asset.site ?? "").trim(),
      model: String(asset.model ?? "").trim(),
      assetId: asset.assetId ?? ""
    });
  };

  const executeAssetDelete = async () => {
    if (!deleteConfirm || deleteInProgress || !deleteAcknowledged) return;
    const { id, imei, registration } = deleteConfirm;
    const tenantId = getTenantId();
    const apiKey = getApiKey();
    if (!tenantId) {
      showToast("Select organisation/database first.", "error");
      return;
    }
    if (!apiKey) {
      showToast("You are not logged in. Please log in and retry.", "error");
      return;
    }
    setDeleteInProgress(true);
    const mark = { id, imei, registration };
    for (const key of assetDeleteKeys(mark)) deletedAssetKeysRef.current.add(key);
    const dropDeleted = (rows: Asset[]) => withoutDeletedAssets(rows);
    assetsDataRef.current = dropDeleted(assetsDataRef.current);
    setAssetsData(assetsDataRef.current);
    writeAssetsCache(assetsDataRef.current, { allowEmpty: true });
    try {
      const params = new URLSearchParams();
      if (id) params.set("id", id);
      if (imei) params.set("imei", imei);
      if (registration) params.set("registration", registration);
      const res = await fetch(buildApiUrl(`/d1/assets?${params.toString()}`), {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          ...(tenantId ? { "x-tenant-id": tenantId } : {}),
          ...(apiKey ? { "x-api-key": apiKey } : {})
        }
      });
      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      if (!res.ok || !body?.deleted) {
        for (const key of assetDeleteKeys(mark)) deletedAssetKeysRef.current.delete(key);
        const msg = (body && (body.error || body.message)) || text || `HTTP ${res.status}`;
        showToast(`Delete failed: ${String(msg)}`, "error");
        const refreshed = await getAssetsFromApi<Asset>({ force: true });
        await syncAssetsForDisplay(refreshed, { enrich: false });
        return;
      }
      const remaining = dropDeleted(assetsDataRef.current);
      assetsDataRef.current = remaining;
      setAssetsData(remaining);
      writeAssetsCache(remaining, { allowEmpty: true });
      showToast("Asset deleted.", "success");
      setDeleteConfirm(null);
      setDeleteAcknowledged(false);
    } catch (e: any) {
      for (const key of assetDeleteKeys(mark)) deletedAssetKeysRef.current.delete(key);
      showToast(`Delete failed: ${String(e?.message ?? e)}`, "error");
      try {
        const refreshed = await getAssetsFromApi<Asset>({ force: true });
        await syncAssetsForDisplay(refreshed, { enrich: false });
      } catch {
        // The next assets refresh will restore the row if the delete did not land.
      }
    } finally {
      setDeleteInProgress(false);
    }
  };

  useEffect(() => {
    if (!deleteConfirm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDeleteConfirm();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteConfirm, deleteInProgress]);

  const openDecommissionConfirm = () => {
    if (!assetSaved) {
      showToast("Save the asset before decommissioning.", "error");
      return;
    }
    const imei = String(mobileDeviceRows[0]?.imei ?? "").trim();
    if (!imei || isDashPlaceholder(imei)) {
      showToast("Enter an IMEI in Mobile device settings before decommissioning.", "error");
      return;
    }
    const assetId =
      String(editingAssetId ?? "").trim() ||
      getStableAssetId({
        registration: formValues.registration,
        imei,
        cameraSerial: formValues.cameraSerial,
        assetId: 0
      });
    const mobileRow = mobileDeviceRows[0] ?? createEmptyMobileDeviceRow();
    const editing =
      assetsDataRef.current.find((asset) => String(asset.id ?? "").trim() === String(editingAssetId ?? "").trim()) ??
      null;
    setDecommissionAcknowledged(false);
    setDecommissionConfirm({
      assetId,
      imei,
      deviceId: String((editing as any)?.deviceId ?? (mobileRow as any)?.deviceId ?? "").trim(),
      assetLabel:
        String(formValues.assetDescription ?? "").trim() ||
        String(formValues.registration ?? "").trim() ||
        assetId,
      registration: String(formValues.registration ?? "").trim(),
      site: String(formValues.site ?? "").trim(),
      device: String(mobileRow.device ?? "").trim(),
      model: String(resolveMobileRowDisplayModel(mobileRow) ?? "").trim()
    });
  };

  const applyDecommissionedAssetFromServer = (serverAsset: Asset) => {
    setMobileDeviceRows([createEmptyMobileDeviceRow()]);
    setFormValues((current) => ({
      ...current,
      assetStatus: "Decommissioned",
      imsi: "",
      msisdn: "",
      cameraSerial: "",
      additionalMobileDevice: "",
      assetDescription: String(serverAsset.assetDescription ?? current.assetDescription ?? ""),
      registration: String(serverAsset.registration ?? current.registration ?? ""),
      site: String(serverAsset.site ?? current.site ?? "")
    }));
    setSelectedRowBySection((current) => ({
      ...current,
      "Mobile device settings": null
    }));
    setAssetSaved(true);
  };

  const executeDeviceDecommission = async (assetId: string, imei: string) => {
    beginSaving("Decommissioning");
    setDecommissionInProgress(true);
    try {
      const result = await decommissionDeviceDetailed({
        assetId,
        imei,
        deviceId: String(decommissionConfirm?.deviceId ?? "").trim(),
        id: String(editingAssetId ?? assetId).trim()
      });
      if (!result.decommissioned || result.source !== "server") {
        endSavingError(String(result.error ?? "Device decommission failed on the server."));
        return;
      }

      const clearedFromApi = result.asset ? (result.asset as Asset) : null;
      const refreshed = await getAssetsFromApi<Asset>({ force: true }).catch(() => [] as Asset[]);
      const serverRow =
        refreshed.find((row) => {
          const id = String(row?.id ?? "").trim();
          const numericId = String(row?.assetId ?? "").trim();
          return id === String(assetId).trim()
            || id === String(editingAssetId ?? "").trim()
            || (numericId && numericId === String(assetId).replace(/^gpsiot:/i, "").trim());
        })
        ?? clearedFromApi;
      if (!serverRow) {
        endSavingError("Decommission API succeeded but the asset could not be reloaded from the server.");
        return;
      }
      // Force-clear local device identity even if the list refresh still echoes a stale IMEI briefly.
      const clearedRow: Asset = {
        ...serverRow,
        imei: "",
        device: "",
        mobileDevice: "",
        status: "unavailable",
        assetStatus: "Decommissioned",
        ...( { deviceId: "" } as any )
      };
      if (String(serverRow.imei ?? "").trim() && !clearedFromApi) {
        endSavingError("Server still reports an IMEI for this asset. Decommission did not fully apply.");
        return;
      }

      const nextList = refreshed.length
        ? refreshed.map((row) => (String(row.id ?? "") === String(clearedRow.id ?? "") ? clearedRow : row))
        : [clearedRow];
      await syncAssetsForDisplay(nextList);
      applyDecommissionedAssetFromServer(clearedRow);

      setDecommissionConfirm(null);
      setDecommissionAcknowledged(false);
      showSaveDone();
      const traccarNote = result.traccar?.removed
        ? "Traccar device removed."
        : result.traccar?.skipped
          ? "Traccar device was not found (already removed)."
          : result.traccarDeleteQueued
            ? "Traccar delete queued for retry."
            : result.traccar?.error
              ? `Traccar: ${result.traccar.error}`
              : "";
      const purgedTelemetry = Number(result.purged?.telemetry ?? 0);
      const purgeNote = purgedTelemetry > 0 ? ` Cleared ${purgedTelemetry} live telemetry row(s).` : "";
      showToast(
        traccarNote
          ? `Device decommissioned on server.${purgeNote} ${traccarNote}`
          : `Device decommissioned on server.${purgeNote} Asset history remains in Backblaze.`,
        traccarNote && result.traccar?.error ? "info" : "success"
      );
    } finally {
      setDecommissionInProgress(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "assetDescription",
      "registration",
      "imei",
      "site",
      "model",
      "country",
      "configurationGroup",
      "fleetNumber"
    ];
    const sample = [
      ["Truck 1", "REG-001", "353691840776321", "Main yard", "FMC130", "UG", "Default", "FLEET-001"]
    ];
    downloadCsv("assets-import-template.csv", headers, sample);
  };

  const parseCsv = (text: string) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cur += '"';
          i++;
          continue;
        }
        if (ch === '"') {
          inQuotes = false;
          continue;
        }
        cur += ch;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      if (ch === ",") {
        row.push(cur);
        cur = "";
        continue;
      }
      if (ch === "\n") {
        row.push(cur);
        cur = "";
        if (row.some((c) => String(c ?? "").trim() !== "")) rows.push(row);
        row = [];
        continue;
      }
      if (ch === "\r") continue;
      cur += ch;
    }
    row.push(cur);
    if (row.some((c) => String(c ?? "").trim() !== "")) rows.push(row);
    return rows;
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      showToast("CSV is empty.", "error");
      return;
    }
    const headers = rows[0].map((h) => String(h ?? "").trim());
    const dataRows = rows.slice(1);
    const get = (obj: Record<string, string>, key: string) => String(obj[key] ?? "").trim();

    const mapped: Record<string, string>[] = dataRows
      .map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          obj[h] = String(r[idx] ?? "");
        });
        return obj;
      })
      .filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""));

    if (!mapped.length) {
      showToast("No rows found.", "error");
      return;
    }

    let okCount = 0;
    let failCount = 0;
    for (const r of mapped) {
      const configurationGroup = get(r, "configurationGroup") || get(r, "configGroup") || get(r, "Configuration group");
      const imei = get(r, "imei") || get(r, "IMEI");
      const cameraSerial = get(r, "cameraSerial") || get(r, "Camera serial");
      const registration = get(r, "registration") || get(r, "Registration number") || get(r, "reg");
      const assetDescription = get(r, "assetDescription") || get(r, "Asset description") || registration;
      if (!configurationGroup || (!imei && !cameraSerial)) {
        failCount += 1;
        continue;
      }
      const id = registration
        ? `asset-${registration}`
        : imei
          ? `asset-${imei}`
          : `asset-cam-${cameraSerial}`;
      const payload: any = {
        id,
        status: "available",
        assetDescription: assetDescription || "",
        fleetNumber: get(r, "fleetNumber") || "",
        imei,
        site: get(r, "site") || "",
        model: get(r, "model") || "",
        lastPosition: "",
        lastTrip: "",
        registration: registration || "",
        assetId: 0,
        country: get(r, "country") || "",
        assetType: get(r, "assetType") || "",
        make: get(r, "make") || "",
        year: get(r, "year") || "",
        vin: get(r, "vin") || "",
        mobileDevice: "",
        odometer: "",
        engineHours: "",
        lastLocation: "",
        configUploadDate: "",
        configGroup: configurationGroup,
        imsi: get(r, "imsi") || "",
        msisdn: get(r, "msisdn") || "",
        cameraSerial: cameraSerial || "",
        faults: ""
      };

      const result = await upsertAssetDetailed(payload);
      if (result.stored) {
        okCount += 1;
      } else {
        failCount += 1;
      }
    }

    const importMsg = `Import complete: ${okCount} saved, ${failCount} failed.`;
    showToast(importMsg, failCount === 0 ? "success" : okCount > 0 ? "info" : "error");
    const apiAssets = await getAssetsFromApi<Asset>();
    if (apiAssets.length) {
      await syncAssetsForDisplay(apiAssets);
    }
  };

  ribbonHandlersRef.current = {
    onAction: (key: string) => {
      if (!key) return;
      if (key === "add") openAddModal();
      if (key === "export") handleExport();
      if (key === "template") handleDownloadTemplate();
      if (key === "import") importInputRef.current?.click();
      if (key === "refresh") {
        void handleRefreshAssets();
      }
      if (key === "move-site") {
        void moveAllAssetsToActiveSite();
      }
    },
    onSearch: (value: string) => {
      setSearchQuery(value);
    }
  };

  useEffect(() => {
    const onAction = (event: Event) => {
      const e = event as CustomEvent;
      const key = String(e?.detail?.key ?? "");
      ribbonHandlersRef.current?.onAction(key);
    };
    const onSearch = (event: Event) => {
      const e = event as CustomEvent;
      const value = String(e?.detail?.value ?? "");
      ribbonHandlersRef.current?.onSearch(value);
    };
    window.addEventListener("vivi.ribbon.action", onAction as EventListener);
    window.addEventListener("vivi.ribbon.search", onSearch as EventListener);
    return () => {
      window.removeEventListener("vivi.ribbon.action", onAction as EventListener);
      window.removeEventListener("vivi.ribbon.search", onSearch as EventListener);
    };
  }, []);

  const [serviceHistoryRows, setServiceHistoryRows] = useState<Array<Record<string, string>>>([]);
  const [reminderRows, setReminderRows] = useState<Array<Record<string, string>>>([]);
  const [fuelRows, setFuelRows] = useState<Array<Record<string, string>>>([]);
  const [otherCostRows, setOtherCostRows] = useState<Array<Record<string, string>>>([]);

  const [mobileDeviceRows, setMobileDeviceRows] = useState<MobileDeviceRow[]>([createEmptyMobileDeviceRow()]);

  const [deviceCatalog, setDeviceCatalog] = useState<string[]>([]);
  const [deviceModels, setDeviceModels] = useState<Record<string, string[]>>({});

  const [deviceSearch, setDeviceSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [cameraDeviceSearch, setCameraDeviceSearch] = useState("");
  const [cameraModelSearch, setCameraModelSearch] = useState("");
  const [firmwareOptions, setFirmwareOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState(["Online", "Offline", "Deinstalled"]);
  const [cameraCatalog, setCameraCatalog] = useState(["ViviCam", "RoadEye", "VIVIVision", "TrackCam", "VisionTrack", "CMS 808"]);
  const [cameraModels, setCameraModels] = useState<Record<string, string[]>>({
    ViviCam: ["VC-200", "VC-400"],
    RoadEye: ["RE-1"],
    VIVIVision: ["MX-500"],
    TrackCam: ["TC-100"],
    VisionTrack: ["VT-20"],
    "CMS 808": ["MDVR-3CH", "MDVR-4CH", "MDVR-8CH", "AI-MDVR", "AHD-4CH"]
  });
  const [cameraFirmwareOptions, setCameraFirmwareOptions] = useState(["v1.1.0", "v1.0.4", "v0.9.8"]);
  const [inlineAddKind, setInlineAddKind] = useState<InlineAddKind | null>(null);
  const [inlineAddValue, setInlineAddValue] = useState("");

  const ensureMobileCatalogValues = (device: string, model: string, firmware: string) => {
    const deviceName = String(device ?? "").trim();
    const modelName = String(model ?? "").trim();
    const firmwareName = String(firmware ?? "").trim();
    if (deviceName) {
      setDeviceCatalog((current) => mergeCatalogOption(current, deviceName));
      setDeviceModels((current) => {
        const next = { ...current };
        const models = [...(next[deviceName] ?? [])];
        const candidate = modelName || deviceName;
        if (!models.some((item) => item.trim().toLowerCase() === candidate.toLowerCase())) {
          models.push(candidate);
        }
        next[deviceName] = models.sort((a, b) => a.localeCompare(b));
        return next;
      });
    }
    if (firmwareName) {
      setFirmwareOptions((current) => mergeCatalogOption(current, firmwareName));
    }
  };

  const closeInlineAddModal = () => {
    setInlineAddKind(null);
    setInlineAddValue("");
  };

  const openInlineAddModal = (kind: InlineAddKind) => {
    setInlineAddKind(kind);
    setInlineAddValue("");
  };

  const includesIgnoreCase = (items: string[], candidate: string) => {
    const normalized = candidate.trim().toLowerCase();
    return items.some((item) => item.trim().toLowerCase() === normalized);
  };

  const findCaseInsensitive = (items: string[], candidate: string) => {
    const normalized = candidate.trim().toLowerCase();
    return items.find((item) => item.trim().toLowerCase() === normalized) ?? null;
  };

  const confirmInlineAddModal = () => {
    if (!inlineAddKind) return;
    const trimmed = inlineAddValue.trim();
    if (!trimmed) {
      showToast("Enter a value before adding.", "error");
      return;
    }

    if (inlineAddKind === "tracking-device") {
      const existing = findCaseInsensitive(deviceCatalog, trimmed);
      const nextDevice = existing ?? trimmed;
      if (!existing) {
        setDeviceCatalog((current) => [...current, trimmed]);
      }
      setDeviceModels((current) => (current[nextDevice] ? current : { ...current, [nextDevice]: [] }));
      setDataDraft((current) => ({ ...current, device: nextDevice, model: "" }));
      closeInlineAddModal();
      return;
    }

    if (inlineAddKind === "tracking-model") {
      const device = String(dataDraft.device ?? "").trim();
      if (!device) {
        showToast("Select a tracking device first.", "error");
        return;
      }
      const existing = findCaseInsensitive(deviceModels[device] ?? [], trimmed);
      const nextModel = existing ?? trimmed;
      if (!existing) {
        setDeviceModels((current) => ({
          ...current,
          [device]: [...(current[device] ?? []), trimmed]
        }));
      }
      setDataDraft((current) => ({ ...current, model: nextModel }));
      closeInlineAddModal();
      return;
    }

    if (inlineAddKind === "tracking-status") {
      const existing = findCaseInsensitive(statusOptions, trimmed);
      const nextStatus = existing ?? trimmed;
      if (!existing) {
        setStatusOptions((current) => [...current, trimmed]);
      }
      setDataDraft((current) => ({ ...current, status: nextStatus }));
      closeInlineAddModal();
      return;
    }

    if (inlineAddKind === "tracking-firmware") {
      const existing = findCaseInsensitive(firmwareOptions, trimmed);
      const nextFirmware = existing ?? trimmed;
      if (!existing) {
        setFirmwareOptions((current) => [...current, trimmed]);
      }
      setDataDraft((current) => ({ ...current, firmware: nextFirmware }));
      closeInlineAddModal();
      return;
    }

    if (inlineAddKind === "camera-device") {
      const existing = findCaseInsensitive(cameraCatalog, trimmed);
      const nextCamera = existing ?? trimmed;
      if (!existing) {
        setCameraCatalog((current) => [...current, trimmed]);
      }
      setCameraModels((current) => (current[nextCamera] ? current : { ...current, [nextCamera]: [] }));
      setDataDraft((current) => ({ ...current, camera: nextCamera, cameraModel: "" }));
      closeInlineAddModal();
      return;
    }

    if (inlineAddKind === "camera-model") {
      const camera = String(dataDraft.camera ?? "").trim();
      if (!camera) {
        showToast("Select a camera first.", "error");
        return;
      }
      const existing = findCaseInsensitive(cameraModels[camera] ?? [], trimmed);
      const nextModel = existing ?? trimmed;
      if (!existing) {
        setCameraModels((current) => ({
          ...current,
          [camera]: [...(current[camera] ?? []), trimmed]
        }));
      }
      setDataDraft((current) => {
        const protocols = normalizeVc400Protocols(
          nextModel,
          current.cameraPositioningProtocol,
          current.cameraVideoProtocol,
          current.camera
        );
        return {
          ...current,
          cameraModel: nextModel,
          cameraPositioningProtocol: protocols.cameraPositioningProtocol,
          cameraVideoProtocol: protocols.cameraVideoProtocol
        };
      });
      closeInlineAddModal();
      return;
    }

    if (inlineAddKind === "camera-status") {
      const existing = findCaseInsensitive(statusOptions, trimmed);
      const nextStatus = existing ?? trimmed;
      if (!existing) {
        setStatusOptions((current) => [...current, trimmed]);
      }
      setDataDraft((current) => ({ ...current, cameraStatus: nextStatus }));
      closeInlineAddModal();
      return;
    }

    if (inlineAddKind === "camera-firmware") {
      const existing = findCaseInsensitive(cameraFirmwareOptions, trimmed);
      const nextFirmware = existing ?? trimmed;
      if (!existing) {
        setCameraFirmwareOptions((current) => [...current, trimmed]);
      }
      setDataDraft((current) => ({ ...current, cameraFirmware: nextFirmware }));
      closeInlineAddModal();
      return;
    }
  };

  const [certificateRows, setCertificateRows] = useState<
    Array<{ certificate: string; holder: string; issued: string; expiry: string; status: string }>
  >([]);

  const [licenceRows, setLicenceRows] = useState<
    Array<{ licence: string; holder: string; issued: string; expiry: string; status: string }>
  >([]);

  const sectionRows = useMemo(
    () => ({
      "Service history": serviceHistoryRows,
      Reminders: reminderRows,
      "Fuel data": fuelRows,
      "Other cost data": otherCostRows,
      "Mobile device settings": mobileDeviceRows,
      "Required driver certificates": certificateRows,
      "Required driver licences": licenceRows
    }),
    [
      certificateRows,
      licenceRows,
      mobileDeviceRows,
      otherCostRows,
      reminderRows,
      fuelRows,
      serviceHistoryRows
    ]
  );

  const [selectedRowBySection, setSelectedRowBySection] = useState<Record<SectionKey, number | null>>({
    "Service history": null,
    Reminders: null,
    "Fuel data": null,
    "Other cost data": null,
    "Mobile device settings": null,
    "Required driver certificates": null,
    "Required driver licences": null
  });

  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [dataModalSection, setDataModalSection] = useState<SectionKey | null>(null);
  const [dataModalIndex, setDataModalIndex] = useState<number | null>(null);
  const [dataDraft, setDataDraft] = useState<Record<string, string>>({});
  const [deviceIdentityErrors, setDeviceIdentityErrors] = useState<{ imei?: string; cameraSerial?: string }>({});

  const checkGlobalDeviceIdentityConflicts = async (
    imeiRaw: string,
    cameraSerialRaw: string,
    excludeIdRaw?: string
  ): Promise<{ imei?: string; cameraSerial?: string }> => {
    const imei = String(imeiRaw ?? "").trim();
    const cameraSerial = String(cameraSerialRaw ?? "").trim();
    const excludeId = String(excludeIdRaw ?? "").trim();
    if (!imei && !cameraSerial) return {};
    try {
      const params = new URLSearchParams();
      if (imei) params.set("imei", imei);
      if (cameraSerial) params.set("cameraSerial", cameraSerial);
      if (excludeId) params.set("excludeId", excludeId);
      const response = await fetch(buildApiUrl(`/d1/assets/duplicate-check?${params.toString()}`), {
        method: "GET",
        headers: {
          ...(getTenantId() ? { "x-tenant-id": getTenantId() } : {}),
          ...(getApiKey() ? { "x-api-key": getApiKey() } : {})
        }
      });
      const text = await response.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      return {
        ...(body?.duplicateImei ? { imei: "Device IMEI in use" } : {}),
        ...(body?.duplicateCameraSerial ? { cameraSerial: "Device IMEI in use" } : {})
      };
    } catch {
      return {};
    }
  };

  const openDataModal = (section: SectionKey, index: number | null) => {
    setDataModalSection(section);
    setDataModalIndex(index);
    const fields = sectionFields[section];
    if (index === null) {
      const emptyDraft: Record<string, string> = {};
      fields.forEach((field) => {
        emptyDraft[field.key] = "";
      });
      if (section === "Mobile device settings") {
        emptyDraft.hasCamera = "no";
        emptyDraft.standaloneMode = "no";
      }
      setDataDraft(emptyDraft);
    } else {
      const row = sectionRows[section][index] as Record<string, string>;
      const draft: Record<string, string> = {};
      fields.forEach((field) => {
        draft[field.key] = row[field.key] ?? "";
      });
      if (section === "Mobile device settings") {
        const hasCamera = Boolean(
          String(row.camera ?? "").trim() ||
            String(row.cameraModel ?? "").trim() ||
            String(row.cameraPositioningProtocol ?? "").trim() ||
            String(row.cameraVideoProtocol ?? "").trim() ||
            String(row.cameraSerial ?? "").trim() ||
            String(row.cameraStatus ?? "").trim() ||
            String(row.cameraFirmware ?? "").trim()
        );
        draft.hasCamera = hasCamera ? "yes" : "no";
        draft.standaloneMode = String(row.standaloneMode ?? "").trim().toLowerCase() === "yes" ? "yes" : "no";
      }
      setDataDraft(draft);
      if (section === "Mobile device settings") {
        ensureMobileCatalogValues(
          String(draft.device ?? ""),
          String(draft.model ?? ""),
          String(draft.firmware ?? "")
        );
      }
    }
    setDeviceIdentityErrors({});
    setDataModalOpen(true);
  };

  const closeDataModal = () => {
    setDataModalOpen(false);
    setDataModalSection(null);
    setDataModalIndex(null);
    setDataDraft({});
    setDeviceIdentityErrors({});
  };

  const persistSharedAssetSection = async (section: string, rows: Array<Record<string, string>>) => {
    const field = assetSectionField(section);
    const assetId = String(editingAssetId ?? "").trim();
    if (!field || !assetId) return;
    const existing =
      assetsDataRef.current.find((asset) => String(asset.id ?? "").trim() === assetId) ?? null;
    if (!existing) return;
    const next = { ...existing, [field]: rows } as Asset;
    const result = await upsertAssetDetailed(next);
    if (!result.stored) {
      showToast("The change is on this screen. It could not be stored for other users yet.", "error");
      return;
    }
    setAssetsData((current) => {
      const index = current.findIndex((asset) => String(asset.id ?? "").trim() === assetId);
      if (index < 0) return current;
      const updated = [...current];
      updated[index] = next;
      writeAssetsCache(updated);
      return updated;
    });
  };

  const saveDataModal = async () => {
    if (!dataModalSection) return;
    const normalizedDraft = { ...dataDraft };
    if (dataModalSection === "Mobile device settings") {
      const duplicateErrors = await checkGlobalDeviceIdentityConflicts(
        String(normalizedDraft.imei ?? "").trim(),
        String(normalizedDraft.cameraSerial ?? "").trim(),
        String(editingAssetId ?? "").trim()
      );
      if (duplicateErrors.imei || duplicateErrors.cameraSerial) {
        setDeviceIdentityErrors(duplicateErrors);
        showToast("Device IMEI in use", "error");
        return;
      }
      setDeviceIdentityErrors({});

      const hasCamera = String(normalizedDraft.hasCamera ?? "no").trim().toLowerCase() === "yes";
      const standaloneMode = String(normalizedDraft.standaloneMode ?? "").trim().toLowerCase() === "yes" ? "yes" : "no";
      normalizedDraft.standaloneMode = standaloneMode;
      if (standaloneMode === "yes") {
        normalizedDraft.device = "";
        normalizedDraft.model = "";
        normalizedDraft.odometer = "";
        normalizedDraft.status = "";
        normalizedDraft.firmware = "";
      } else if (!String(normalizedDraft.device ?? "").trim()) {
        normalizedDraft.model = "";
      }
      if (!hasCamera) {
        normalizedDraft.camera = "";
        normalizedDraft.cameraModel = "";
        normalizedDraft.cameraPositioningProtocol = "";
        normalizedDraft.cameraVideoProtocol = "";
        normalizedDraft.cameraComponents = "";
        normalizedDraft.cameraSerial = "";
        normalizedDraft.cameraStatus = "";
        normalizedDraft.cameraFirmware = "";
      } else {
        const protocols = normalizeVc400Protocols(
          normalizedDraft.cameraModel,
          normalizedDraft.cameraPositioningProtocol,
          normalizedDraft.cameraVideoProtocol,
          normalizedDraft.camera
        );
        normalizedDraft.cameraPositioningProtocol = protocols.cameraPositioningProtocol;
        normalizedDraft.cameraVideoProtocol = protocols.cameraVideoProtocol;
      }
      delete normalizedDraft.hasCamera;
    }

    const nextRows = [...sectionRows[dataModalSection]] as Record<string, string>[];
    if (dataModalIndex === null) {
      nextRows.unshift({ ...normalizedDraft });
    } else {
      nextRows[dataModalIndex] = { ...normalizedDraft };
    }
    switch (dataModalSection) {
      case "Service history":
        setServiceHistoryRows(nextRows as typeof serviceHistoryRows);
        break;
      case "Reminders":
        setReminderRows(nextRows as typeof reminderRows);
        break;
      case "Fuel data":
        setFuelRows(nextRows as typeof fuelRows);
        break;
      case "Other cost data":
        setOtherCostRows(nextRows as typeof otherCostRows);
        break;
      case "Mobile device settings":
        if (dataModalIndex === null) {
          setMobileDeviceRows([
            {
              ...(normalizedDraft as MobileDeviceRow)
            }
          ]);
        } else {
          setMobileDeviceRows(nextRows as MobileDeviceRow[]);
        }
        break;
      case "Required driver certificates":
        setCertificateRows(nextRows as typeof certificateRows);
        break;
      case "Required driver licences":
        setLicenceRows(nextRows as typeof licenceRows);
        break;
      default:
        break;
    }
    void persistSharedAssetSection(dataModalSection, nextRows as Array<Record<string, string>>);
    markTabDirty(dataModalSection);
    closeDataModal();
  };

  const validateMandatoryForTab = (tab: string): { error: string; fields: string[] } => {
    if (tab === "Asset details") {
      const fields: string[] = [];
      if (!formValues.assetDescription.trim()) fields.push("assetDescription");
      if (!formValues.assetType.trim()) fields.push("assetType");
      if (!formValues.registration.trim()) fields.push("registration");
      if (!formValues.site.trim()) fields.push("site");
      if (!formValues.make.trim()) fields.push("make");
      if (!formValues.configurationGroup.trim()) fields.push("configurationGroup");
      if (fields.length) {
        return { error: "Fill in the required fields marked in red.", fields };
      }
      return { error: "", fields: [] };
    }
    if (tab === "Mobile device settings") {
      const imei = String(mobileDeviceRows[0]?.imei ?? "").trim();
      const cameraSerial = String(mobileDeviceRows[0]?.cameraSerial ?? "").trim();
      if (!imei && !cameraSerial) {
        return {
          error: "Either IMEI or Camera serial is required on Mobile device settings.",
          fields: ["imei", "cameraSerial"]
        };
      }
      return { error: "", fields: [] };
    }
    return { error: "", fields: [] };
  };

  const showCameraSettingsInModal =
    dataModalSection === "Mobile device settings" &&
    (() => {
      const explicit = String(dataDraft.hasCamera ?? "").trim().toLowerCase();
      if (explicit === "yes") return true;
      if (explicit === "no") return false;
      return Boolean(
        String(dataDraft.camera ?? "").trim() ||
          String(dataDraft.cameraModel ?? "").trim() ||
          String(dataDraft.cameraPositioningProtocol ?? "").trim() ||
          String(dataDraft.cameraVideoProtocol ?? "").trim() ||
          String(dataDraft.cameraSerial ?? "").trim() ||
          String(dataDraft.cameraStatus ?? "").trim() ||
          String(dataDraft.cameraFirmware ?? "").trim()
      );
    })();

  const isStandaloneModeInModal =
    dataModalSection === "Mobile device settings"
    && String(dataDraft.standaloneMode ?? "").trim().toLowerCase() === "yes";

  const handleSaveAssetModal = async () => {
    if (isSaving) return;
    const { error: requiredError, fields: missingFields } = validateMandatoryForTab(activeAddTab);
    if (requiredError) {
      setMissingRequiredFields(new Set(missingFields));
      if (activeAddTab === "Mobile device settings" && !(dataModalOpen && dataModalSection === "Mobile device settings")) {
        openDataModal("Mobile device settings", 0);
      }
      showToast(requiredError, "error");
      return;
    }
    setMissingRequiredFields(new Set());

    const configGroupReady = await configGroupExists(formValues.configurationGroup);
    if (!configGroupReady) {
      setMissingRequiredFields(new Set(["configurationGroup"]));
      showToast("Configuration group not found. Create bindings and a configuration group first.", "error");
      return;
    }

    const imei = String(mobileDeviceRows[0]?.imei ?? "").trim();
    const cameraSerialFromRow = String(mobileDeviceRows[0]?.cameraSerial ?? "").trim();
    const cameraSerialFromForm = String(formValues.cameraSerial ?? "").trim();
    const cameraSerial = cameraSerialFromRow || cameraSerialFromForm;

    const duplicateErrors = await checkGlobalDeviceIdentityConflicts(
      imei,
      cameraSerial,
      String(editingAssetId ?? "").trim()
    );
    if (duplicateErrors.imei || duplicateErrors.cameraSerial) {
      setDeviceIdentityErrors(duplicateErrors);
      setActiveAddTab("Mobile device settings");
      if (!(dataModalOpen && dataModalSection === "Mobile device settings")) {
        openDataModal("Mobile device settings", 0);
      }
      showToast("Device IMEI in use", "error");
      return;
    }
    setDeviceIdentityErrors({});

    const derivedId =
      String(editingAssetId ?? "").trim() ||
      getStableAssetId({ registration: formValues.registration, imei, cameraSerial, assetId: 0 }) ||
      `asset-${Date.now()}`;
    const assetId = derivedId;
    setIsSaving(true);
    beginSaving();
    try {
    const editingExisting =
      assetsDataRef.current.find((asset) => String(asset.id ?? "").trim() === String(editingAssetId ?? "").trim()) ??
      null;
    const payload: Asset = {
      id: assetId,
      status: formValues.assetStatus === "Not available" ? "unavailable" : "available",
      assetDescription: formValues.assetDescription || "",
      fleetNumber: formValues.fleetNumber || "",
      imei: imei || "",
      site: formValues.site || "",
      model: formValues.model || "",
      lastPosition: formValues.lastPosition || "",
      lastTrip: formValues.lastTrip || "",
      registration: formValues.registration || "",
      // numeric Asset ID is assigned by the server
      assetId: 0,
      country: formValues.country || "",
      assetType: formValues.assetType || "",
      make: formValues.make || "",
      year: formValues.year || "",
      vin: formValues.vin || "",
      engineNumber: formValues.engineNumber || "",
      mobileDevice:
        String(formValues.additionalMobileDevice ?? "").trim() ||
        String(mobileDeviceRows[0]?.device ?? "").trim() ||
        String((editingExisting as any)?.mobileDevice ?? "").trim() ||
        "",
      odometer: formValues.odometer || "",
      engineHours: formValues.engineHours || "",
      lastLocation: formValues.lastLocation || "",
      configUploadDate: formValues.configUploadDate || "",
      configGroup: formValues.configurationGroup || "",
      database:
        String((editingExisting as any)?.database ?? "").trim() ||
        String(activeDatabaseLabel ?? "").trim() ||
        "",
      organisation:
        String((editingExisting as any)?.organisation ?? "").trim() ||
        String(activeOrganisationLabel ?? "").trim() ||
        undefined,
      dealer:
        String((editingExisting as any)?.dealer ?? "").trim() ||
        String(activeDealerLabel ?? "").trim() ||
        undefined,
      hierarchyNamingVersion: "2",
      imsi: formValues.imsi || "",
      msisdn: formValues.msisdn || "",
      cameraSerial: formValues.cameraSerial || "",
      faults: formValues.faults || "",
      ...buildAssetDriverFields(formValues.hasDefaultDriver, formValues.defaultDriver),
      assetStatus: formValues.assetStatus || "Available",
      expiryMode: formValues.expiryMode || "never",
      expiryDate: formValues.expiryMode === "date" ? String(formValues.expiryDate ?? "").trim() : "",
      statusNotes: String(formValues.statusNotes ?? "").trim(),
      serviceHistory: serviceHistoryRows,
      reminders: reminderRows,
      fuelData: fuelRows,
      otherCosts: otherCostRows,
      requiredCertificates: certificateRows,
      requiredLicences: licenceRows
    };

    const mobileRow = mobileDeviceRows[0] ?? createEmptyMobileDeviceRow();
    const standaloneMode = String(mobileRow.standaloneMode ?? "").trim().toLowerCase() === "yes" ? "yes" : "no";
    const hasCamera =
      standaloneMode === "yes" ||
      Boolean(
        String(mobileRow.camera ?? "").trim() ||
        String(mobileRow.cameraModel ?? "").trim() ||
        String(mobileRow.cameraPositioningProtocol ?? "").trim() ||
        String(mobileRow.cameraVideoProtocol ?? "").trim() ||
        String(mobileRow.cameraSerial ?? "").trim() ||
        String(mobileRow.cameraStatus ?? "").trim() ||
        String(mobileRow.cameraFirmware ?? "").trim()
      );

    const vc400Protocols = normalizeVc400Protocols(
      mobileRow.cameraModel,
      mobileRow.cameraPositioningProtocol,
      mobileRow.cameraVideoProtocol,
      mobileRow.camera
    );

    payload.device = String(mobileRow.device ?? "").trim();
    payload.mobileModel = String(mobileRow.model ?? "").trim();
    // Keep Mobile Device column in sync with the Device chosen in Mobile device settings.
    const existingMobile = String(payload.mobileDevice ?? "").trim();
    if (
      payload.device &&
      (!existingMobile || existingMobile.toLowerCase() === "traccar")
    ) {
      payload.mobileDevice = payload.device;
    }
    formValues.odometer = String(mobileRow.odometer ?? "").trim();
    payload.odometer = String(mobileRow.odometer ?? "").trim();
    payload.status = String(mobileRow.status ?? "").trim().toLowerCase() === "unavailable" ? "unavailable" : payload.status;
    payload.firmware = String(mobileRow.firmware ?? "").trim();
    payload.standaloneMode = standaloneMode;
    payload.hasCamera = hasCamera;
    payload.camera = String(mobileRow.camera ?? "").trim();
    payload.cameraModel = String(mobileRow.cameraModel ?? "").trim();
    payload.cameraPositioningProtocol = hasCamera ? vc400Protocols.cameraPositioningProtocol : "";
    payload.cameraVideoProtocol = hasCamera ? vc400Protocols.cameraVideoProtocol : "";
    payload.cameraComponents = parseAdditionalCameraComponents(mobileRow.cameraComponents).join(", ");
    payload.cameraChannelsSelected = buildSelectedCameraChannels(mobileRow.cameraComponents);
    payload.selectedChannels = payload.cameraChannelsSelected;
    payload.selectedChannelsCount = payload.cameraChannelsSelected.length;
    payload.channelCount = payload.cameraChannelsSelected.length;
    payload.cameraSerial = String(mobileRow.cameraSerial ?? payload.cameraSerial ?? "").trim();
    payload.cameraStatus = String(mobileRow.cameraStatus ?? "").trim();
    payload.cameraFirmware = String(mobileRow.cameraFirmware ?? "").trim();

    const result = await upsertAssetDetailed(payload);
    if (!result.stored) {
      if (result.status === 401 || result.status === 403) {
        endSavingError("You are not logged in. Please log in to save changes.");
        navigate("/login");
        return;
      }
      const status = typeof result.status === "number" ? `HTTP ${result.status}` : "";
      const message =
        (result.body && typeof result.body === "object" && (result.body.error || result.body.message)) ||
        result.error ||
        "Unknown error";
      if (String(message).toLowerCase().includes("device imei in use")) {
        const field = String((result.body as any)?.field ?? "").trim();
        setDeviceIdentityErrors(
          field === "cameraSerial"
            ? { cameraSerial: "Device IMEI in use" }
            : { imei: "Device IMEI in use" }
        );
      }
      endSavingError(`Failed to save asset. ${status ? `${status}: ` : ""}${String(message)}`);
      return;
    }

    const driverName = String((payload as any)?.defaultDriver ?? "").trim();
    const driverSite = String((payload as any)?.site ?? "").trim();
    if (driverName && driverSite) {
      void ensureNamedDriverOnServer(driverName, driverSite);
    }

    const serverAssetId = Number((result.body as any)?.assetId ?? 0) || 0;
    const nextPayload = serverAssetId > 0 ? ({ ...payload, assetId: serverAssetId } as Asset) : payload;

    // Keep editing on the same record across tab saves to avoid duplicate inserts.
    if (!editingAssetId) {
      setEditingAssetId(assetId);
    }

    setAssetsData((current) => {
      const existingIndex = current.findIndex((asset) => asset.id === assetId);
      const next = [...current];
      if (existingIndex >= 0) {
        next[existingIndex] = nextPayload;
      } else {
        next.unshift(nextPayload);
      }
      const deduped = normalizeAndDedupeAssets(next as any[]);
      writeAssetsCache(deduped);
      return deduped;
    });

    try {
      const refreshed = await getAssetsFromApi<Asset>({ force: true });
      if (refreshed.length) {
        // Paint saved data immediately; live Traccar enrich must not block Saving / Done.
        // Merge with local list so a concurrent older loadAssets cannot drop this row.
        await syncAssetsForDisplay(
          mergeAssetListsPreservingLocal(refreshed, [nextPayload, ...assetsDataRef.current]),
          { enrich: false }
        );
        void syncAssetsForDisplay(refreshed);
      }
    } catch {
      // keep current UI state if refresh fails
    }

    if (result.body?.traccarError) {
      // Keep Done as the primary success signal; sync detail stays as info toast.
      showToast(`VIVI sync: ${String(result.body.traccarError)}`, "info");
    } else if (result.body?.traccarSynced !== true && result.body?.traccarSyncQueued) {
      showToast("Asset saved. VIVI device sync queued.", "info");
    } else if (result.body?.traccarSynced !== true && String(payload.imei ?? "").trim()) {
      showToast("Asset saved, but VIVI device sync did not start.", "info");
    }

    const configGroupName = String(formValues.configurationGroup ?? "").trim();
    if (configGroupName) {
      void (async () => {
        const groups = await getConfigurationGroups<{
          id: string;
          name: string;
          site?: string;
          notificationBinding: string;
          locationBinding?: string;
          deviceBinding?: string;
        }>();
        const group =
          groups.find((entry) => entry.id === configGroupName || entry.name === configGroupName) ?? null;
        if (group) {
          const syncResult = await syncConfigurationGroupToTraccar({
            id: group.id,
            name: group.name,
            site: String(group.site ?? "").trim(),
            notificationBinding: String(group.notificationBinding ?? ""),
            locationBinding: String(group.locationBinding ?? ""),
            deviceBinding: String(group.deviceBinding ?? "")
          });
          if (syncResult.errors.length && !(
            syncResult.eventsSynced > 0 ||
            syncResult.attributesAttached > 0 ||
            syncResult.devicesPushed > 0 ||
            syncResult.devicesTraccarUpdated > 0
          )) {
            showToast(syncResult.errors[0], "error");
          }
        }
      })();
    }

    setAssetSaved(true);
    endSavingDone();
    clearTabDirty(activeAddTab);
    } catch (error: any) {
      endSavingError(String(error?.message ?? error ?? "Unable to save asset."));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSelectedRow = (section: SectionKey) => {
    const selected = selectedRowBySection[section];
    if (selected === null) {
      showToast("Select a row first.", "error");
      return;
    }
    const nextRows = sectionRows[section].filter((_, index) => index !== selected);
    switch (section) {
      case "Service history":
        setServiceHistoryRows(nextRows as typeof serviceHistoryRows);
        break;
      case "Reminders":
        setReminderRows(nextRows as typeof reminderRows);
        break;
      case "Fuel data":
        setFuelRows(nextRows as typeof fuelRows);
        break;
      case "Other cost data":
        setOtherCostRows(nextRows as typeof otherCostRows);
        break;
      case "Mobile device settings":
        setMobileDeviceRows(nextRows as typeof mobileDeviceRows);
        break;
      case "Required driver certificates":
        setCertificateRows(nextRows as typeof certificateRows);
        break;
      case "Required driver licences":
        setLicenceRows(nextRows as typeof licenceRows);
        break;
      default:
        break;
    }
    setSelectedRowBySection((current) => ({ ...current, [section]: null }));
    void persistSharedAssetSection(section, nextRows as Array<Record<string, string>>);
  };

  return (
    <div className="page assets-page">
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void handleImportFile(file);
        }}
      />

      <div className="assets-layout assets-layout--full">
      <aside className="assets-filter">
        <button
          type="button"
          className={`assets-filter-header${activeFilter === "All" ? " active" : ""}`}
          onClick={() => selectStatusFilter("All")}
        >
          <span className="assets-filter-label">{activeFilter}</span>
          <span className="assets-filter-count" aria-label={`${countFor(activeFilter)} assets`}>
            {countFor(activeFilter)}
          </span>
        </button>
        <div className="assets-filter-section-label">Identity bulk search</div>
        {BULK_IDENTITY_FILTERS.map((row) => {
          const active = activeFilter === row.label && bulkFilterTokens.length > 0;
          return (
            <button
              key={row.label}
              type="button"
              className={`filter-row${active ? " active" : ""}`}
              onClick={() => openBulkSearchModal(row.label)}
              title={`Paste multiple ${row.label} values`}
            >
              <span>
                {row.label}
                {active ? (
                  <span className="assets-bulk-filter-meta"> · {bulkFilterTokens.length}</span>
                ) : null}
              </span>
              <span className="count-pill">{active ? countFor(row.label) : "…"}</span>
            </button>
          );
        })}
        <div className="assets-filter-section-label">Status</div>
        {STATUS_FILTERS.map((label) => (
          <button
            key={label}
            type="button"
            className={`filter-row${activeFilter === label ? " active" : ""}`}
            onClick={() => selectStatusFilter(label)}
          >
            <span>{label}</span>
            <span className="count-pill">{countFor(label)}</span>
          </button>
        ))}
      </aside>

      <section className="assets-table-wrap">
        <div className="assets-table-scroll">
          <div className="assets-table-inner" style={{ gridTemplateColumns: grid }}>
            <div className="assets-table-head">
            {activeCols.map((c) => (
              <div
                key={c.key}
                className={`assets-col${centeredColumns.has(c.key) ? " is-center" : ""}${dragCol === c.key ? " dragging" : ""}`}
                draggable
                onDragStart={(event) => {
                  setDragCol(c.key);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", c.key);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const fromKey = (event.dataTransfer.getData("text/plain") as ColumnKey) || dragCol;
                  if (!fromKey || fromKey === c.key) return;
                  setColumnOrder((current) => {
                    const next = current.filter((key) => key !== fromKey);
                    const targetIndex = next.indexOf(c.key);
                    next.splice(Math.max(0, targetIndex), 0, fromKey);
                    return next;
                  });
                  setDragCol(null);
                }}
                onDragEnd={() => setDragCol(null)}
              >
                <SortableColumnHeader
                  label={c.label}
                  {...getAssetHeaderProps(c.key)}
                  className={centeredColumns.has(c.key) ? "is-center" : ""}
                />
              </div>
            ))}
            <div className="assets-col-menu">
              <button
                className="menu-icon-btn"
                aria-label="Toggle columns"
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  setColMenuOpen((v) => !v);
                  setColMenuPos({ top: rect.bottom + 6, left: rect.right - 220 });
                }}
              >
                <span />
                <span />
                <span />
              </button>
              {colMenuOpen && colMenuPos && (
                <div className="assets-col-dropdown" style={{ top: colMenuPos.top, left: colMenuPos.left }}>
                  {columns.filter((opt) => canSeeColumn(opt.key)).map((opt) => (
                    <label key={opt.key} className="columns-option">
                      <input
                        type="checkbox"
                        checked={opt.key === "lastPosition" ? true : visibleCols.has(opt.key)}
                        disabled={opt.key === "lastPosition"}
                        onChange={() => toggleCol(opt.key)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
            <div className="assets-table-body">
              {pagedAssets.map((a) => (
                <div key={a.id} className="assets-row">
                  {activeCols.map((col) => (
                    <div key={col.key} className={`assets-cell${centeredColumns.has(col.key) ? " is-center" : ""}`}>
                      {col.key === "assetDescription" ? (
                        (() => {
                          const status = getDotStatus(a);
                          return (
                            <span className="assets-cell--asset-description">
                              {shouldShowStatusDot(a) ? <AssetStatusDot asset={a as any} status={status} /> : null}
                          {canEditAssets ? (
                            <button
                              type="button"
                              className="assets-asset-description-btn"
                              onClick={() => openEditModal(a)}
                              aria-label={`Edit ${displayValue(formatAssetDescription(a) || a[col.key as keyof Asset])}`}
                            >
                              {displayValue(formatAssetDescription(a) || a[col.key as keyof Asset])}
                            </button>
                          ) : (
                            <span className="assets-asset-description-text">{displayValue(formatAssetDescription(a) || a[col.key as keyof Asset])}</span>
                          )}
                        </span>
                          );
                        })()
                      ) : col.key === "infoIssued" ? (
                        getInfoIssued(a) ? "Yes" : "No"
                      ) : col.key === "lastPosition" || col.key === "lastTrip" ? (
                        (() => {
                          const raw = col.key === "lastPosition"
                            ? (a.lastSeen || a.lastPosition || "")
                            : a.lastTrip;
                          if (col.key === "lastPosition" && isCms808LiveAsset(a)) {
                            return cms808DisplayTime(raw, a.site, siteTimeZones) || formatTimestampForSite(raw, a.site, siteTimeZones) || "";
                          }
                          return formatTimestampForSite(raw, a.site, siteTimeZones) || "";
                        })()
                      ) : col.key === "faults" ? (
                        (() => {
                          const faults = resolveAssetFaults(a);
                          if (!faults || faults === NO_DEVICE_FAULTS) return faults;
                          return <span className="assets-cell-faults" title={faults}>{faults}</span>;
                        })()
                      ) : col.key === "configUploadDate" ? (
                        resolveConfigUploadDate(a)
                      ) : col.key === "model" ? (
                        displayValue(resolveAssetDisplayModel(a))
                      ) : col.key === "mobileDevice" ? (
                        displayValue(resolveMobileDeviceLabel(a))
                      ) : col.key === "configGroup" ? (
                        (() => {
                          const raw = String(a.configGroup ?? "").trim();
                          const label = resolveConfigGroupLabel(raw);
                          const shown = displayValue(label);
                          if (!shown) return shown;
                          const groupRef = raw || label;
                          return (
                            <button
                              type="button"
                              className="assets-config-group-btn"
                              onClick={() =>
                                navigate(
                                  `/Control/config/configuration-groups?group=${encodeURIComponent(groupRef)}`
                                )
                              }
                              aria-label={`Open configuration group ${shown}`}
                            >
                              {shown}
                            </button>
                          );
                        })()
                      ) : (
                        displayValue(a[col.key as keyof Asset])
                      )}
                    </div>
                  ))}
                  <div className="assets-cell actions">
                    <button
                      className="actions-trigger"
                      aria-label="Row actions"
                      onClick={() => setOpenRowMenu((current) => (current === a.id ? null : a.id))}
                    >
                      ⋯
                    </button>
                    {openRowMenu === a.id && (
                      <div className="assets-row-menu" role="menu">
                        {[
                          ...(canEditAssets && !isBasicAssetUser ? [{ label: "Edit", icon: <EditIcon /> }] : []),
                          ...(canEditAssets && !isBasicAssetUser ? [{ label: "Duplicate", icon: <ReportIcon /> }] : []),
                          ...(canEditAssets && !isBasicAssetUser ? [{ label: "Commission asset", icon: <SettingsIcon /> }] : []),
                          ...(isFullAccessRole || (canEditAssets && !isSupportLimitedRole && !isBasicAssetUser)
                            ? [{ label: "Confirm data received", icon: <QueryIcon /> }]
                            : []),
                          { label: "Show on historical tracking", icon: <PinsIcon /> },
                          { label: "Show on trip timeline", icon: <TimelineIcon /> },
                          ...(isBasicAssetUser ? [] : [{ label: "Diagnostics", icon: <QueryIcon /> }]),
                          ...(isCms808Server() || isBasicAssetUser || isSupportLimitedRole ? [] : [{ label: "IOs List", icon: <QueryIcon /> }]),
                          ...(isBasicAssetUser || isSupportLimitedRole ? [] : [{ label: "Resend commissioning SMS", icon: <CompassIcon /> }]),
                          ...(canDeleteAssets ? [{ label: "Delete", icon: <TrashIcon /> }] : [])
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            className={`assets-row-menu-item${item.label === "Delete" ? " assets-row-menu-item--danger" : ""}`}
                            role="menuitem"
                            onClick={() => {
                              setOpenRowMenu(null);
                              if (item.label === "Edit") {
                                openEditModal(a);
                              } else if (item.label === "Duplicate") {
                                openDuplicateModal(a);
                              } else if (item.label === "Delete") {
                              openDeleteConfirm(a);
                              } else if (item.label === "Show on trip timeline") {
                              const assetLabel = `${a.assetDescription} - ${a.registration}`;
                              const assetImei = String(a.imei ?? "").trim();
                              writeActiveAssetPrefs({
                                asset: assetLabel,
                                registration: displayValue(a.registration),
                                imei: assetImei
                              });
                              localStorage.setItem("vivi.activeSite", displayValue(a.site));
                              clearUserPref(USER_PREF_KEYS.contextType);
                              clearUserPref(USER_PREF_KEYS.contextName);
                              localStorage.removeItem("vivi.contextOptions");
                              window.setTimeout(() => {
                                window.dispatchEvent(new Event("vivi:contextchange"));
                              }, 0);
                              navigate("/Track/activity/trip-timeline");
                              } else if (item.label === "Show on historical tracking") {
                              const assetLabel = `${a.assetDescription} - ${a.registration}`;
                              const assetImei = String(a.imei ?? "").trim();
                              writeActiveAssetPrefs({
                                asset: assetLabel,
                                registration: displayValue(a.registration),
                                imei: assetImei
                              });
                              localStorage.setItem("vivi.activeSite", displayValue(a.site));
                              localStorage.setItem("vivi.historyTime", new Date().toISOString().slice(0, 16));
                              clearUserPref(USER_PREF_KEYS.contextType);
                              clearUserPref(USER_PREF_KEYS.contextName);
                              localStorage.removeItem("vivi.contextOptions");
                              window.setTimeout(() => {
                                window.dispatchEvent(new Event("vivi:contextchange"));
                              }, 0);
                              navigate("/Track/tracking/historical");
                              } else if (item.label === "Diagnostics") {
                              setDiagnosticsAsset(a);
                              setDiagnosticsOpen({
                                assetDetails: true,
                                mobileDevice: true,
                                tripInfo: false,
                                latestPosition: false,
                                inputStatus: true
                              });
                              setDiagnosticsInputStatus({ status: "idle", inputs: [] });
                              setShowDiagnosticsModal(true);
                              } else if (item.label === "IOs List") {
                              setIoListAsset(a);
                              } else if (item.label === "Commission asset") {
                              const imei = String(a.imei ?? "").trim();
                              if (!imei || isDashPlaceholder(imei)) {
                                showToast("Add an IMEI to this asset before commissioning.", "error");
                                return;
                              }

                              const configGroup = String((a as any)?.configGroup ?? "").trim();
                              if (!configGroup || isDashPlaceholder(configGroup)) {
                                showToast("Set a configuration group for this asset before commissioning.", "error");
                                return;
                              }

                              beginSaving("Commissioning");

                              (async () => {
                                const syncResult = await syncAssetForCommission(a, imei);
                                if (!syncResult.ok) {
                                  endSavingError(String(syncResult.error ?? "Cannot commission this asset."));
                                  return;
                                }

                                beginSaving("Compiling");
                                const result = await commissionDeviceDetailed(imei);
                                if (!result.queued) {
                                  endSavingError(`Asset commissioning failed: ${result.error ?? "Unknown error"}`);
                                  return;
                                }
                                showSaveDone();
                                if (result.kickError) {
                                  const kickMessage = String(result.kickError).trim().toLowerCase();
                                  const ignorableKickError =
                                    kickMessage.includes("not found") ||
                                    kickMessage.includes("not configured") ||
                                    kickMessage.includes("auth not configured") ||
                                    kickMessage.includes("503");
                                  if (!ignorableKickError) {
                                    showToast(`Telemetry wake-up not sent: ${result.kickError}`, "info");
                                  }
                                }

                                let telemetryConfirmed = false;
                                for (let attempt = 0; attempt < 5; attempt += 1) {
                                  const telemetry = await confirmTelemetryForImei(imei);
                                  if (telemetry.ok && telemetry.received) {
                                    telemetryConfirmed = true;
                                    break;
                                  }
                                  if (attempt < 4) {
                                    await new Promise((resolve) => window.setTimeout(resolve, 6000));
                                  }
                                }

                                if (!telemetryConfirmed) {
                                  showToast(
                                    "Telemetry not received yet—device should report shortly.",
                                    "info"
                                  );
                                }
                                const apiAssets = await getAssetsFromApi<Asset>();
                                if (apiAssets.length) {
                                  await syncAssetsForDisplay(apiAssets);
                                }
                              })();
                              } else if (item.label === "Confirm data received") {
                              const imei = String(a.imei ?? "").trim();
                              if (!imei || isDashPlaceholder(imei)) {
                                showToast("No IMEI set for this asset yet.", "error");
                                return;
                              }
                              showToast("Checking device telemetry…", "info");
                              (async () => {
                                const lookup = await telemetryLookupByImeiDetailed(imei);
                                if (lookup.ok && lookup.body) {
                                  const latestText = formatTelemetryLatest((lookup.body as any).latest);
                                  showToast(latestText ? `Telemetry received. ${latestText}` : "Telemetry received.", "success");
                                  const apiAssets = await getAssetsFromApi<Asset>();
                                  if (apiAssets.length) {
                                    await syncAssetsForDisplay(apiAssets);
                                  }
                                  return;
                                }

                                const result = await confirmTelemetryForImei(imei);
                                if (!result.ok) {
                                  const status = typeof result.status === "number" ? `HTTP ${result.status}` : "";
                                  const msg = String(result.error ?? "Unknown error");
                                  const isAuth = result.status === 401 || result.status === 403 || msg.toLowerCase().includes("unauthorized");
                                  const isOffline = msg.toLowerCase().includes("offline") || msg.toLowerCase().includes("unreachable") || msg.toLowerCase().includes("failed to fetch");
                                  showToast(
                                    isAuth
                                      ? "Cannot confirm yet: API key missing/unauthorized. Log in or set the API key for this environment."
                                      : isOffline
                                        ? "Cannot confirm yet: backend offline/unreachable. Start the API server then try again."
                                        : `Telemetry check failed. ${status ? `${status}: ` : ""}${msg}`,
                                    isAuth || isOffline ? "info" : "error"
                                  );
                                  return;
                                }
                                if (result.received) {
                                  showToast(`Telemetry received (last: ${result.lastAt ?? ""}).`, "success");
                                } else {
                                  showToast("No telemetry received yet for this IMEI.", "info");
                                }
                                const apiAssets = await getAssetsFromApi<Asset>();
                                if (apiAssets.length) {
                                  await syncAssetsForDisplay(apiAssets);
                                }
                              })();
                              } else if (item.label === "Push device settings") {
                              const imei = String(a.imei ?? "").trim();
                              if (!imei || isDashPlaceholder(imei)) {
                                showToast("Add an IMEI to this asset before pushing settings.", "error");
                                return;
                              }
                              (async () => {
                                const result = await pushDeviceSettings(imei);
                                if (result.queued) {
                                  showToast("Device settings queued for delivery.", "success");
                                } else {
                                  showToast(`Push failed: ${result.error ?? "Unknown error"}`, "error");
                                }
                              })();
                              } else if (item.label === "Resend commissioning SMS") {
                              const imei = String(a.imei ?? "").trim();
                              if (!imei || isDashPlaceholder(imei)) {
                                showToast("No IMEI set for this asset yet.", "error");
                                return;
                              }
                              setSmsTarget(`${a.assetDescription} - ${a.registration}`);
                              setSmsTargetImei(imei);
                              setSmsMessage("");
                              setShowSmsModal(true);
                              } else {
                              showToast(`${item.label} - ${a.assetDescription}`, "info");
                              }
                              setOpenRowMenu(null);
                            }}
                          >
                            <span className="assets-row-menu-icon" aria-hidden="true">
                              {item.icon}
                            </span>
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!assetsListLoading && pagedAssets.length === 0 ? (
                <div className="assets-empty">No assets to display.</div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="assets-table-footer">
          <div className="assets-pagination-meta">Showing {ASSETS_PER_PAGE} assets per page</div>
          <div className="assets-pagination-controls">
            <button
              type="button"
              className="assets-pagination-btn"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safeCurrentPage <= 1}
            >
              Prev
            </button>
            <span className="assets-pagination-page">
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="assets-pagination-btn"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safeCurrentPage >= totalPages}
            >
              Next
            </button>
            <button
              type="button"
              className="assets-pagination-btn"
              onClick={() => {
                void handleRefreshAssets();
              }}
            >
              Refresh
            </button>
          </div>
          <div className="assets-copyright">Copyright Reserved © 2025 Vivi Telematics.</div>
        </div>
      </section>
      </div>

      {showBulkSearchModal && bulkSearchKind && (
        <div
          className="assets-add-modal"
          role="dialog"
          aria-modal="true"
          aria-label={BULK_IDENTITY_FILTERS.find((row) => row.label === bulkSearchKind)?.title || "Bulk search"}
          onClick={() => setShowBulkSearchModal(false)}
        >
          <div className="assets-add-card assets-bulk-search-card" onClick={(event) => event.stopPropagation()}>
            <div className="assets-add-header">
              <div>
                <div className="assets-add-title">
                  {BULK_IDENTITY_FILTERS.find((row) => row.label === bulkSearchKind)?.title}
                </div>
                <p className="assets-bulk-search-hint">
                  {BULK_IDENTITY_FILTERS.find((row) => row.label === bulkSearchKind)?.hint}
                </p>
              </div>
              <div className="assets-add-actions">
                <button type="button" className="btn ghost" onClick={() => setShowBulkSearchModal(false)}>
                  Cancel
                </button>
                {(activeFilter === bulkSearchKind && bulkFilterTokens.length > 0) || bulkPasteDraft.trim() ? (
                  <button type="button" className="btn ghost" onClick={clearBulkSearch}>
                    Clear
                  </button>
                ) : null}
                <button type="button" className="btn primary" onClick={applyBulkSearch}>
                  Apply filter
                </button>
              </div>
            </div>
            <div className="assets-add-body assets-bulk-search-body">
              <label className="assets-bulk-search-label">
                Paste values
                <textarea
                  className="assets-bulk-search-textarea"
                  value={bulkPasteDraft}
                  onChange={(event) => setBulkPasteDraft(event.target.value)}
                  placeholder={BULK_IDENTITY_FILTERS.find((row) => row.label === bulkSearchKind)?.placeholder}
                  rows={12}
                  autoFocus
                />
              </label>
              <div className="assets-bulk-search-footer">
                {parseBulkSearchTokens(bulkPasteDraft).length} value
                {parseBulkSearchTokens(bulkPasteDraft).length === 1 ? "" : "s"} ready
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Create new asset">
          <div className="assets-add-card">
            <div className="assets-add-header">
              <div className="assets-add-title">{editingAssetId ? "Edit asset" : "Create new asset"}</div>
              <div className="assets-add-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setShowAddModal(false);
                    setAssetSaved(false);
                    setEditingAssetId(null);
                    setDirtyTabs({});
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleSaveAssetModal}
                  disabled={isSaving}
                >
                  Save
                </button>
              </div>
            </div>
            <div className="assets-add-body">
              <aside className="assets-add-sidebar">
                <div className="assets-add-tab-list">
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Asset details" ? "active" : ""}`}
                    onClick={() => attemptSwitchAddTab("Asset details")}
                  >
                    Asset details
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Asset status" ? "active" : ""}`}
                    onClick={() => attemptSwitchAddTab("Asset status")}
                  >
                    Asset status
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Access control" ? "active" : ""}`}
                    onClick={() => attemptSwitchAddTab("Access control")}
                  >
                    Access control
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Custom groups" ? "active" : ""}`}
                    onClick={() => attemptSwitchAddTab("Custom groups")}
                  >
                    Custom groups
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Service history" ? "active" : ""}`}
                    onClick={() => attemptSwitchAddTab("Service history")}
                  >
                    Service history
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Reminders" ? "active" : ""}`}
                    onClick={() => attemptSwitchAddTab("Reminders")}
                  >
                    Reminders
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Fuel data" ? "active" : ""}`}
                    onClick={() => attemptSwitchAddTab("Fuel data")}
                  >
                    Fuel data
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Other cost data" ? "active" : ""}`}
                    onClick={() => attemptSwitchAddTab("Other cost data")}
                  >
                    Other cost data
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Mobile device settings" ? "active" : ""}`}
                    onClick={() => attemptSwitchAddTab("Mobile device settings")}
                  >
                    Mobile device settings
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Required driver certificates" ? "active" : ""}`}
                    onClick={() => attemptSwitchAddTab("Required driver certificates")}
                  >
                    Required driver certificates
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Required driver licences" ? "active" : ""}`}
                    onClick={() => attemptSwitchAddTab("Required driver licences")}
                  >
                    Required driver licences
                  </button>
                </div>
              </aside>
              <section className="assets-add-form">
                <div className="assets-add-form-panel">
                  <div className="assets-add-page-header">
                    <h3>{ASSET_TAB_META[activeAddTab]?.title ?? activeAddTab}</h3>
                    {ASSET_TAB_META[activeAddTab]?.description ? (
                      <p>{ASSET_TAB_META[activeAddTab].description}</p>
                    ) : null}
                  </div>
                  <div className="assets-add-panel-body">
                {activeAddTab === "Asset details" && (
                  <>
                    <div className="assets-add-grid">
                      <label className={fieldMissingClass("assetDescription")}>
                        Asset description <span>*</span>
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.assetDescription}
                          onChange={(e) => updateField("assetDescription", e.target.value)}
                        />
                      </label>
                      <label className={fieldMissingClass("assetType")}>
                        Asset type <span>*</span>
                        <select
                          value={formValues.assetType}
                          onChange={(e) => updateField("assetType", e.target.value)}
                        >
                          <option value="">Select an asset type</option>
                          {assetTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={fieldMissingClass("registration")}>
                        Registration number <span>*</span>
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.registration}
                          onChange={(e) => updateField("registration", e.target.value)}
                        />
                      </label>
                      <label className={fieldMissingClass("site")}>
                        Site <span>*</span>
                        <select value={formValues.site} onChange={(e) => updateField("site", e.target.value)}>
                          <option value="">Select a site</option>
                          {siteOptions.map((site) => (
                            <option key={site} value={site}>
                              {site}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={fieldMissingClass("configurationGroup")}>
                        Configuration group <span>*</span>
                        <select
                          value={formValues.configurationGroup}
                          onChange={(e) => updateField("configurationGroup", e.target.value)}
                        >
                          <option value="">Select a configuration group</option>
                          {(() => {
                            const current = String(formValues.configurationGroup ?? "").trim();
                            if (!current) return null;
                            if (configGroupOptions.some((g) => g.value === current)) return null;
                            return (
                              <option key="__current_config_group" value={current}>
                                {current}
                              </option>
                            );
                          })()}
                          {configGroupOptions.map((group) => (
                            <option key={group.value} value={group.value}>
                              {group.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Country
                        <select value={formValues.country} onChange={(e) => updateField("country", e.target.value)}>
                          <option value="">Choose country</option>
                          {countryOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        ISP Serial Number
                        <input
                          type="text"
                          placeholder="SIM serial (SimSerial)"
                          value={formValues.fleetNumber}
                          onChange={(e) => updateField("fleetNumber", e.target.value)}
                        />
                      </label>
                      <label>
                        Vehicle Identification Number (VIN)
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.vin}
                          onChange={(e) => updateField("vin", e.target.value)}
                        />
                      </label>
                      <label className={fieldMissingClass("make")}>
                        Make <span>*</span>
                        <select value={formValues.make} onChange={(e) => updateField("make", e.target.value)}>
                          <option value="">Select a make</option>
                          {vehicleMakes.map((make) => (
                            <option key={make} value={make}>
                              {make}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Model
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.model}
                          onChange={(e) => updateField("model", e.target.value)}
                        />
                      </label>
                      <label>
                        Year
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.year}
                          onChange={(e) => updateField("year", e.target.value)}
                        />
                      </label>
                      <label>
                        Engine number
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.engineNumber}
                          onChange={(e) => updateField("engineNumber", e.target.value)}
                        />
                      </label>
                      <label>
                        Fuel type
                        <select value={formValues.fuelType} onChange={(e) => updateField("fuelType", e.target.value)}>
                          <option value="">Select a fuel type</option>
                          {fuelTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Target fuel consumption (km/l)
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.targetFuel}
                          onChange={(e) => updateField("targetFuel", e.target.value)}
                        />
                      </label>
                      <label>
                        Fuel tank capacity (l)
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.fuelTankCapacity}
                          onChange={(e) => updateField("fuelTankCapacity", e.target.value)}
                        />
                      </label>
                      <label>
                        Serial number
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.serialNumber}
                          onChange={(e) => updateField("serialNumber", e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="assets-add-section">
                      <div className="assets-add-grid">
                        <label>
                          Additional mobile device
                          <select
                            value={formValues.additionalMobileDevice}
                            onChange={(e) => updateField("additionalMobileDevice", e.target.value)}
                          >
                            <option value="">Select mobile device</option>
                            {deviceCatalog.map((device) => (
                              <option key={device} value={device}>
                                {device}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="assets-add-section">
                      <div className="assets-add-section-title">Tracking Icon & colour</div>
                      <div className="assets-add-grid">
                        <label>
                          This icon will be displayed on the map
                          <button type="button" className="assets-add-icon-btn">Select icon</button>
                        </label>
                        <label>
                          Asset colour
                          <input
                            type="text"
                            placeholder=""
                            value={formValues.assetColour}
                            onChange={(e) => updateField("assetColour", e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {activeAddTab === "Asset status" && (
                  <>
                    <div className="assets-status-panel">
                      <div className="assets-status-intro">
                        <h3>Asset status</h3>
                        <p>Set availability, expiry rules, and operational notes for this asset.</p>
                      </div>
                      <div className="assets-access-card assets-status-card">
                        <label className="assets-form-field">
                          <span className="assets-form-label">Current asset status</span>
                          <select
                            className="assets-field-select"
                            value={formValues.assetStatus}
                            onChange={(e) => updateField("assetStatus", e.target.value)}
                          >
                            <option value="Available">Available</option>
                            <option value="Not available">Not available</option>
                            <option value="Decommissioned">Decommissioned</option>
                          </select>
                        </label>
                      </div>
                      <div className="assets-access-card assets-status-card">
                        <div className="assets-form-label">Expiry date</div>
                        <div className="assets-radio-group">
                          <label className="assets-radio-option">
                            <input
                              type="radio"
                              name="expiryMode"
                              checked={formValues.expiryMode === "date"}
                              onChange={() => updateField("expiryMode", "date")}
                            />
                            <span>On specified date</span>
                          </label>
                          <input
                            className="assets-field-input"
                            type="date"
                            value={formValues.expiryDate}
                            onChange={(e) => updateField("expiryDate", e.target.value)}
                            disabled={formValues.expiryMode !== "date"}
                          />
                          <label className="assets-radio-option">
                            <input
                              type="radio"
                              name="expiryMode"
                              checked={formValues.expiryMode === "never"}
                              onChange={() => updateField("expiryMode", "never")}
                            />
                            <span>Never</span>
                          </label>
                        </div>
                      </div>
                      <div className="assets-access-card assets-status-card">
                        <label className="assets-form-field">
                          <span className="assets-form-label">Operational notes</span>
                          <textarea
                            className="assets-field-textarea"
                            rows={4}
                            placeholder="Add operational notes for this asset..."
                            value={formValues.statusNotes}
                            onChange={(e) => updateField("statusNotes", e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="assets-status-audit">
                        <p>
                          This asset status was last changed to &lsquo;{formValues.assetStatus}&rsquo; on 25/06/2024 13:49 (EAT) by MUSISI JOEL.
                        </p>
                        <p>This asset was created on 25/06/2024 13:49 (EAT) by MUSISI JOEL.</p>
                      </div>
                    </div>
                  </>
                )}

                {activeAddTab === "Custom groups" && (
                  <>
                    <div className="assets-add-section">
                    </div>
                    <div className="assets-groups-card">
                      <input
                        className="assets-groups-filter"
                        type="search"
                        placeholder="Filter"
                        value={customGroupFilter}
                        onChange={(e) => setCustomGroupFilter(e.target.value)}
                        aria-label="Filter custom groups"
                      />
                      <div className="assets-groups-table">
                        <div className="assets-groups-row assets-groups-head">
                          <div className="assets-groups-cell checkbox">
                            <input type="checkbox" disabled aria-label="Select all" />
                          </div>
                          <div className="assets-groups-cell name">Group name</div>
                          <div className="assets-groups-cell assets">Assets</div>
                        </div>
                        {filteredCustomGroups.length === 0 ? (
                          <div className="assets-groups-empty">No items to display</div>
                        ) : (
                          filteredCustomGroups.map((group) => (
                            <div key={group.id} className="assets-groups-row">
                              <div className="assets-groups-cell checkbox">
                                <input type="checkbox" aria-label={`Select ${group.name}`} />
                              </div>
                              <div className="assets-groups-cell name">{group.name}</div>
                              <div className="assets-groups-cell assets">{group.assets}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}

                {activeAddTab === "Access control" && (
                  <>
                    <div className="assets-access-panel">
                      <div className="assets-status-intro">
                        <h3>Access control</h3>
                        <p>Assign a default driver for trips, alerts, and live tracking attribution.</p>
                      </div>
                      <div className="assets-access-card">
                        <label className="assets-add-checkbox assets-add-checkbox--card">
                          <input
                            type="checkbox"
                            checked={formValues.hasDefaultDriver}
                            onChange={(e) => updateField("hasDefaultDriver", e.target.checked)}
                          />
                          <span>
                            <strong>Asset has a default driver</strong>
                            <small>When enabled, trips and alerts can be attributed to the selected driver.</small>
                          </span>
                        </label>
                      </div>
                      <div className="assets-access-card">
                        <label className="assets-form-field">
                          <span className="assets-form-label">
                            Default driver name <span className="assets-required">*</span>
                          </span>
                          <select
                            className="assets-field-select"
                            value={formValues.defaultDriver}
                            onChange={(e) => updateField("defaultDriver", e.target.value)}
                            disabled={!formValues.hasDefaultDriver || driversLoading}
                          >
                            <option value="">
                              {driversLoading
                                ? "Loading drivers..."
                                : driverOptions.length > 0
                                  ? "Select a driver"
                                  : "No drivers found — add drivers on the Drivers page"}
                            </option>
                            {driverOptions.map((driver) => (
                              <option key={driver} value={driver}>
                                {driver}
                              </option>
                            ))}
                          </select>
                          {!driversLoading && driverOptions.length === 0 && (
                            <small className="assets-add-helper">
                              Create drivers under Control → Drivers, then return here to assign a default driver.
                            </small>
                          )}
                          {formValues.site && driverOptions.length > 0 && (
                            <small className="assets-add-helper">
                              Showing drivers for site &ldquo;{formValues.site}&rdquo; and unassigned drivers.
                            </small>
                          )}
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {activeAddTab !== "Asset details" && activeAddTab !== "Asset status" && activeAddTab !== "Custom groups" && activeAddTab !== "Access control" && (
                  <>
                    {activeAddTab === "Service history" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Track scheduled and unscheduled services with cost history.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Service history", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Service history"];
                                if (selected === null) {
                                  showToast("Select a row first.", "error");
                                  return;
                                }
                                openDataModal("Service history", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Service history")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "service-history.csv",
                                  ["Date", "Service", "Vendor", "Odometer", "Cost", "Currency", "Invoice", "Notes"],
                                  serviceHistoryRows.map((row) => [
                                    row.date,
                                    row.service,
                                    row.vendor,
                                    row.odometer,
                                    row.cost,
                                    row.currency,
                                    row.invoice,
                                    row.notes
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Date</div>
                            <div className="assets-data-cell">Service</div>
                            <div className="assets-data-cell">Vendor</div>
                            <div className="assets-data-cell">Odometer</div>
                            <div className="assets-data-cell">Cost</div>
                            <div className="assets-data-cell">Currency</div>
                            <div className="assets-data-cell">Invoice</div>
                            <div className="assets-data-cell">Notes</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {serviceHistoryRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            serviceHistoryRows.map((row, index) => (
                              <div
                                key={`${row.date}-${row.service}`}
                                className={`assets-data-row${selectedRowBySection["Service history"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Service history": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.date}</div>
                                <div className="assets-data-cell">{row.service}</div>
                                <div className="assets-data-cell">{row.vendor}</div>
                                <div className="assets-data-cell">{row.odometer}</div>
                                <div className="assets-data-cell">{row.cost}</div>
                                <div className="assets-data-cell">{row.currency}</div>
                                <div className="assets-data-cell">{row.invoice}</div>
                                <div className="assets-data-cell">{row.notes}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Service history", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Service history": index }));
                                      deleteSelectedRow("Service history");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Reminders" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Manage upcoming obligations and renewal costs.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Reminders", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection.Reminders;
                                if (selected === null) {
                                  showToast("Select a row first.", "error");
                                  return;
                                }
                                openDataModal("Reminders", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Reminders")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "reminders.csv",
                                  ["Reminder", "Due date", "Status", "Cost", "Currency", "Notes"],
                                  reminderRows.map((row) => [
                                    row.reminder,
                                    row.dueDate,
                                    row.status,
                                    row.cost,
                                    row.currency,
                                    row.notes
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Reminder</div>
                            <div className="assets-data-cell">Due date</div>
                            <div className="assets-data-cell">Status</div>
                            <div className="assets-data-cell">Cost</div>
                            <div className="assets-data-cell">Currency</div>
                            <div className="assets-data-cell">Notes</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {reminderRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            reminderRows.map((row, index) => (
                              <div
                                key={`${row.reminder}-${row.dueDate}`}
                                className={`assets-data-row${selectedRowBySection.Reminders === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, Reminders: index }))
                                }
                              >
                                <div className="assets-data-cell">{row.reminder}</div>
                                <div className="assets-data-cell">{row.dueDate}</div>
                                <div className="assets-data-cell">{row.status}</div>
                                <div className="assets-data-cell">{row.cost}</div>
                                <div className="assets-data-cell">{row.currency}</div>
                                <div className="assets-data-cell">{row.notes}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Reminders", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, Reminders: index }));
                                      deleteSelectedRow("Reminders");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Fuel data" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Record all fuel issued for this vehicle for finance reporting.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Fuel data", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Fuel data"];
                                if (selected === null) {
                                  showToast("Select a row first.", "error");
                                  return;
                                }
                                openDataModal("Fuel data", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Fuel data")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "fuel-data.csv",
                                  ["Date", "Supplier", "Location", "Litres", "Price/Litre", "Total", "Currency", "Odometer", "Invoice"],
                                  fuelRows.map((row) => [
                                    row.date,
                                    row.supplier,
                                    row.location,
                                    row.litres,
                                    row.pricePerLitre,
                                    row.total,
                                    row.currency,
                                    row.odometer,
                                    row.invoice
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Date</div>
                            <div className="assets-data-cell">Supplier</div>
                            <div className="assets-data-cell">Location</div>
                            <div className="assets-data-cell">Litres</div>
                            <div className="assets-data-cell">Price/Litre</div>
                            <div className="assets-data-cell">Total</div>
                            <div className="assets-data-cell">Currency</div>
                            <div className="assets-data-cell">Odometer</div>
                            <div className="assets-data-cell">Invoice</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {fuelRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            fuelRows.map((row, index) => (
                              <div
                                key={`${row.date}-${row.invoice}`}
                                className={`assets-data-row${selectedRowBySection["Fuel data"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Fuel data": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.date}</div>
                                <div className="assets-data-cell">{row.supplier}</div>
                                <div className="assets-data-cell">{row.location}</div>
                                <div className="assets-data-cell">{row.litres}</div>
                                <div className="assets-data-cell">{row.pricePerLitre}</div>
                                <div className="assets-data-cell">{row.total}</div>
                                <div className="assets-data-cell">{row.currency}</div>
                                <div className="assets-data-cell">{row.odometer}</div>
                                <div className="assets-data-cell">{row.invoice}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Fuel data", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Fuel data": index }));
                                      deleteSelectedRow("Fuel data");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Other cost data" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Capture non-fuel expenses like tolls, tyres, and fines.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Other cost data", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Other cost data"];
                                if (selected === null) {
                                  showToast("Select a row first.", "error");
                                  return;
                                }
                                openDataModal("Other cost data", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Other cost data")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "other-costs.csv",
                                  ["Date", "Category", "Vendor", "Cost", "Currency", "Invoice", "Notes"],
                                  otherCostRows.map((row) => [
                                    row.date,
                                    row.category,
                                    row.vendor,
                                    row.cost,
                                    row.currency,
                                    row.invoice,
                                    row.notes
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Date</div>
                            <div className="assets-data-cell">Category</div>
                            <div className="assets-data-cell">Vendor</div>
                            <div className="assets-data-cell">Cost</div>
                            <div className="assets-data-cell">Currency</div>
                            <div className="assets-data-cell">Invoice</div>
                            <div className="assets-data-cell">Notes</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {otherCostRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            otherCostRows.map((row, index) => (
                              <div
                                key={`${row.date}-${row.category}`}
                                className={`assets-data-row${selectedRowBySection["Other cost data"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Other cost data": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.date}</div>
                                <div className="assets-data-cell">{row.category}</div>
                                <div className="assets-data-cell">{row.vendor}</div>
                                <div className="assets-data-cell">{row.cost}</div>
                                <div className="assets-data-cell">{row.currency}</div>
                                <div className="assets-data-cell">{row.invoice}</div>
                                <div className="assets-data-cell">{row.notes}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Other cost data", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Other cost data": index }));
                                      deleteSelectedRow("Other cost data");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Mobile device settings" && (
                      <div className="assets-data-card assets-data-card--wide">
                        <div className="assets-data-toolbar">
                          <small>Hardware and SIM details tied to the asset.</small>
                          <div className="assets-data-actions">
                            <button
                              type="button"
                              onClick={() => openDataModal("Mobile device settings", null)}
                              disabled={mobileDeviceRows.length > 0}
                              title={
                                mobileDeviceRows.length > 0
                                  ? "Only one row is allowed per asset"
                                  : "Add mobile device settings"
                              }
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Mobile device settings"];
                                if (selected === null) {
                                  showToast("Select a row first.", "error");
                                  return;
                                }
                                openDataModal("Mobile device settings", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Mobile device settings")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "mobile-device-settings.csv",
                                  [
                                    "Device",
                                    "Model",
                                    "IMEI",
                                    "Odometer (KMs)",
                                    "Status",
                                    "Firmware",
                                    "Camera",
                                    "Camera model",
                                    "Additional components",
                                    "Camera serial",
                                    "Camera status",
                                    "Camera firmware"
                                  ],
                                  mobileDeviceRows.map((row) => [
                                    row.device,
                                    resolveMobileRowDisplayModel(row),
                                    row.imei,
                                    row.odometer,
                                    row.status,
                                    row.firmware,
                                    row.camera,
                                    row.cameraModel,
                                    row.cameraComponents,
                                    row.cameraSerial,
                                    row.cameraStatus,
                                    row.cameraFirmware
                                  ])
                                )
                              }
                            >
                              Download
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (!assetSaved) {
                                  showToast("Save the asset before commissioning.", "error");
                                  return;
                                }
                                const imei = String(mobileDeviceRows[0]?.imei ?? "").trim();
                                if (!imei || isDashPlaceholder(imei)) {
                                  showToast("Enter an IMEI in Mobile device settings before commissioning.", "error");
                                  return;
                                }

                                const configGroup = String(formValues.configurationGroup ?? "").trim();
                                if (!configGroup || isDashPlaceholder(configGroup)) {
                                  showToast("Select a configuration group before commissioning.", "error");
                                  return;
                                }

                                beginSaving("Commissioning");
                                (async () => {
                                  const assetId = editingAssetId ?? `asset-${Date.now()}`;
                                  const mobileRow = mobileDeviceRows[0] ?? createEmptyMobileDeviceRow();
                                  const standaloneMode = String(mobileRow.standaloneMode ?? "").trim().toLowerCase() === "yes" ? "yes" : "no";
                                  const hasCamera =
                                    standaloneMode === "yes" ||
                                    Boolean(
                                      String(mobileRow.camera ?? "").trim() ||
                                      String(mobileRow.cameraModel ?? "").trim() ||
                                      String(mobileRow.cameraSerial ?? "").trim() ||
                                      String(mobileRow.cameraStatus ?? "").trim() ||
                                      String(mobileRow.cameraFirmware ?? "").trim()
                                    );
                                  const payload: Asset = {
                                    id: assetId,
                                    status: formValues.assetStatus === "Not available" ? "unavailable" : "available",
                                    assetDescription: formValues.assetDescription || "",
                                    fleetNumber: formValues.fleetNumber || "",
                                    imei: imei || "",
                                    site: formValues.site || "",
                                    model: formValues.model || "",
                                    lastPosition: formValues.lastPosition || "",
                                    lastTrip: formValues.lastTrip || "",
                                    registration: formValues.registration || "",
                                    assetId: 0,
                                    country: formValues.country || "",
                                    assetType: formValues.assetType || "",
                                    make: formValues.make || "",
                                    year: formValues.year || "",
                                    vin: formValues.vin || "",
                                    mobileDevice:
                                      String(formValues.additionalMobileDevice ?? "").trim() ||
                                      String(mobileRow.device ?? "").trim() ||
                                      "",
                                    engineHours: formValues.engineHours || "",
                                    lastLocation: formValues.lastLocation || "",
                                    configUploadDate: formValues.configUploadDate || "",
                                    configGroup: configGroup || "",
                                    database: String(activeDatabaseLabel ?? "").trim() || "",
                                    organisation: String(activeOrganisationLabel ?? "").trim() || undefined,
                                    dealer: String(activeDealerLabel ?? "").trim() || undefined,
                                    hierarchyNamingVersion: "2",
                                    imsi: formValues.imsi || "",
                                    msisdn: formValues.msisdn || "",
                                    device: String(mobileRow.device ?? "").trim(),
                                    mobileModel: String(mobileRow.model ?? "").trim(),
                                    odometer: String(mobileRow.odometer ?? "").trim(),
                                    firmware: String(mobileRow.firmware ?? "").trim(),
                                    standaloneMode,
                                    hasCamera,
                                    camera: String(mobileRow.camera ?? "").trim(),
                                    cameraModel: String(mobileRow.cameraModel ?? "").trim(),
                                    cameraComponents: parseAdditionalCameraComponents(mobileRow.cameraComponents).join(", "),
                                    cameraChannelsSelected: buildSelectedCameraChannels(mobileRow.cameraComponents),
                                    selectedChannels: buildSelectedCameraChannels(mobileRow.cameraComponents),
                                    selectedChannelsCount: buildSelectedCameraChannels(mobileRow.cameraComponents).length,
                                    channelCount: buildSelectedCameraChannels(mobileRow.cameraComponents).length,
                                    cameraSerial: String(mobileRow.cameraSerial ?? formValues.cameraSerial ?? "").trim(),
                                    cameraStatus: String(mobileRow.cameraStatus ?? "").trim(),
                                    cameraFirmware: String(mobileRow.cameraFirmware ?? "").trim(),
                                    faults: formValues.faults || ""
                                  };

                                  const syncResult = await syncAssetForCommission(payload, imei);
                                  if (!syncResult.ok) {
                                    endSavingError(String(syncResult.error ?? "Cannot commission this asset."));
                                    return;
                                  }

                                  setAssetSaved(true);

                                  beginSaving("Compiling");
                                  const result = await commissionDeviceDetailed(imei);
                                  if (!result.queued) {
                                    endSavingError(`Asset commissioning failed: ${result.error ?? "Unknown error"}`);
                                    return;
                                  }
                                  showSaveDone();
                                  if (result.kickError) {
                                    const kickMessage = String(result.kickError).trim().toLowerCase();
                                    const ignorableKickError =
                                      kickMessage.includes("not found") ||
                                      kickMessage.includes("not configured") ||
                                      kickMessage.includes("auth not configured") ||
                                      kickMessage.includes("503");
                                    if (!ignorableKickError) {
                                      showToast(`Telemetry wake-up not sent: ${result.kickError}`, "info");
                                    }
                                  }

                                  let telemetryConfirmed = false;
                                  for (let attempt = 0; attempt < 5; attempt += 1) {
                                    const telemetry = await confirmTelemetryForImei(imei);
                                    if (telemetry.ok && telemetry.received) {
                                      telemetryConfirmed = true;
                                      break;
                                    }
                                    if (attempt < 4) {
                                      await new Promise((resolve) => window.setTimeout(resolve, 6000));
                                    }
                                  }

                                  if (!telemetryConfirmed) {
                                    showToast(
                                      "Telemetry not received yet—device should report shortly.",
                                      "info"
                                    );
                                  }
                                })();
                              }}
                              title="Compile and queue settings for this IMEI, then prompt the device to communicate"
                            >
                              Commission
                            </button>
                            <button
                              type="button"
                              className="assets-data-decommission"
                              onClick={openDecommissionConfirm}
                              title="Remove this IMEI from the system; asset history stays in Backblaze"
                            >
                              Decommission
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table assets-data-table--mobile-device">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Device</div>
                            <div className="assets-data-cell">Model</div>
                            <div className="assets-data-cell">IMEI</div>
                            <div className="assets-data-cell">Odometer (KMs)</div>
                            <div className="assets-data-cell">Status</div>
                            <div className="assets-data-cell">Firmware</div>
                            <div className="assets-data-cell">Camera</div>
                            <div className="assets-data-cell">Camera model</div>
                            <div className="assets-data-cell">Additional components</div>
                            <div className="assets-data-cell">Camera serial</div>
                            <div className="assets-data-cell">Camera status</div>
                            <div className="assets-data-cell">Camera firmware</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {mobileDeviceRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            mobileDeviceRows.map((row, index) => (
                              <div
                                key={`${row.device}-${row.imei}`}
                                className={`assets-data-row${selectedRowBySection["Mobile device settings"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Mobile device settings": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.device}</div>
                                <div className="assets-data-cell">{resolveMobileRowDisplayModel(row)}</div>
                                <div className="assets-data-cell">{row.imei}</div>
                                <div className="assets-data-cell">{row.odometer}</div>
                                <div className="assets-data-cell">{row.status}</div>
                                <div className="assets-data-cell">{row.firmware}</div>
                                <div className="assets-data-cell">{row.camera}</div>
                                <div className="assets-data-cell">{row.cameraModel}</div>
                                <div className="assets-data-cell">{row.cameraComponents}</div>
                                <div className="assets-data-cell">{row.cameraSerial}</div>
                                <div className="assets-data-cell">{row.cameraStatus}</div>
                                <div className="assets-data-cell">{row.cameraFirmware}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Mobile device settings", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Mobile device settings": index }));
                                      deleteSelectedRow("Mobile device settings");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Required driver certificates" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Track certificates required for this asset.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Required driver certificates", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Required driver certificates"];
                                if (selected === null) {
                                  showToast("Select a row first.", "error");
                                  return;
                                }
                                openDataModal("Required driver certificates", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Required driver certificates")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "driver-certificates.csv",
                                  ["Certificate", "Holder", "Issued", "Expiry", "Status"],
                                  certificateRows.map((row) => [
                                    row.certificate,
                                    row.holder,
                                    row.issued,
                                    row.expiry,
                                    row.status
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Certificate</div>
                            <div className="assets-data-cell">Holder</div>
                            <div className="assets-data-cell">Issued</div>
                            <div className="assets-data-cell">Expiry</div>
                            <div className="assets-data-cell">Status</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {certificateRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            certificateRows.map((row, index) => (
                              <div
                                key={`${row.certificate}-${row.holder}`}
                                className={`assets-data-row${selectedRowBySection["Required driver certificates"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Required driver certificates": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.certificate}</div>
                                <div className="assets-data-cell">{row.holder}</div>
                                <div className="assets-data-cell">{row.issued}</div>
                                <div className="assets-data-cell">{row.expiry}</div>
                                <div className="assets-data-cell">{row.status}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Required driver certificates", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Required driver certificates": index }));
                                      deleteSelectedRow("Required driver certificates");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Required driver licences" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Track driver licences tied to this asset.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Required driver licences", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Required driver licences"];
                                if (selected === null) {
                                  showToast("Select a row first.", "error");
                                  return;
                                }
                                openDataModal("Required driver licences", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Required driver licences")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "driver-licences.csv",
                                  ["Licence", "Holder", "Issued", "Expiry", "Status"],
                                  licenceRows.map((row) => [
                                    row.licence,
                                    row.holder,
                                    row.issued,
                                    row.expiry,
                                    row.status
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Licence</div>
                            <div className="assets-data-cell">Holder</div>
                            <div className="assets-data-cell">Issued</div>
                            <div className="assets-data-cell">Expiry</div>
                            <div className="assets-data-cell">Status</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {licenceRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            licenceRows.map((row, index) => (
                              <div
                                key={`${row.licence}-${row.holder}`}
                                className={`assets-data-row${selectedRowBySection["Required driver licences"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Required driver licences": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.licence}</div>
                                <div className="assets-data-cell">{row.holder}</div>
                                <div className="assets-data-cell">{row.issued}</div>
                                <div className="assets-data-cell">{row.expiry}</div>
                                <div className="assets-data-cell">{row.status}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Required driver licences", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Required driver licences": index }));
                                      deleteSelectedRow("Required driver licences");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {dataModalOpen && dataModalSection && (
        <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Edit data">
          <div className="assets-add-card data-modal-card">
            <div className="assets-add-header">
              <div className="assets-add-title">
                {dataModalIndex === null ? "Add" : "Edit"} {dataModalSection}
              </div>
              <div className="assets-add-actions">
                <button type="button" className="btn ghost" onClick={closeDataModal}>
                  Close
                </button>
                <button type="button" className="btn primary" onClick={saveDataModal}>
                  Save
                </button>
              </div>
            </div>
            <div className="assets-add-body data-modal-body">
              <section className="assets-add-form" style={{ maxHeight: "unset" }}>
                {dataModalSection === "Mobile device settings" ? (
                  <div className="assets-data-columns">
                    <div className="assets-data-column">
                      {!isStandaloneModeInModal && (
                      <label>
                        Device
                        <input
                          className="assets-data-search"
                          type="search"
                          placeholder="Search device"
                          value={deviceSearch}
                          onChange={(event) => setDeviceSearch(event.target.value)}
                        />
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.device ?? ""}
                            onChange={(event) => {
                              setDataDraft((current) => ({ ...current, device: event.target.value, model: "" }));
                              setModelSearch("");
                            }}
                          >
                            <option value="">Select device</option>
                            {deviceCatalog
                              .filter((device) => device.toLowerCase().includes(deviceSearch.trim().toLowerCase()))
                              .map((device) => (
                                <option key={device} value={device}>
                                  {device}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add device"
                            onClick={() => openInlineAddModal("tracking-device")}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove device"
                            onClick={() => {
                              const selected = dataDraft.device ?? "";
                              if (!selected) return;
                              setDeviceCatalog((current) => current.filter((item) => item !== selected));
                              setDeviceModels((current) => {
                                const next = { ...current };
                                delete next[selected];
                                return next;
                              });
                              setDataDraft((current) => ({ ...current, device: "", model: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      )}
                      {!isStandaloneModeInModal && (
                      <label>
                        Model
                        <input
                          className="assets-data-search"
                          type="search"
                          placeholder="Search model"
                          value={modelSearch}
                          onChange={(event) => setModelSearch(event.target.value)}
                        />
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.model ?? ""}
                            onChange={(event) => setDataDraft((current) => ({ ...current, model: event.target.value }))}
                          >
                            <option value="">Select model</option>
                            {(deviceModels[dataDraft.device ?? ""] ?? [])
                              .filter((model) => model.toLowerCase().includes(modelSearch.trim().toLowerCase()))
                              .map((model) => (
                                <option key={model} value={model}>
                                  {model}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add model"
                            onClick={() => {
                              if (!String(dataDraft.device ?? "").trim()) {
                                showToast("Select a tracking device first.", "error");
                                return;
                              }
                              openInlineAddModal("tracking-model");
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove model"
                            onClick={() => {
                              const device = dataDraft.device ?? "";
                              const selected = dataDraft.model ?? "";
                              if (!device || !selected) return;
                              setDeviceModels((current) => ({
                                ...current,
                                [device]: (current[device] ?? []).filter((item) => item !== selected)
                              }));
                              setDataDraft((current) => ({ ...current, model: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      )}
                      <label className={fieldMissingClass("imei")}>
                        IMEI
                        <input
                          type="text"
                          value={dataDraft.imei ?? ""}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setDataDraft((current) => ({ ...current, imei: nextValue }));
                            if (deviceIdentityErrors.imei) {
                              setDeviceIdentityErrors((current) => ({ ...current, imei: undefined }));
                            }
                            setMissingRequiredFields((current) => {
                              if (!current.has("imei") && !current.has("cameraSerial")) return current;
                              const next = new Set(current);
                              next.delete("imei");
                              next.delete("cameraSerial");
                              return next;
                            });
                          }}
                        />
                        {deviceIdentityErrors.imei && <small className="assets-field-error">{deviceIdentityErrors.imei}</small>}
                      </label>
                      <label>
                        Odometer (KMs)
                        <input
                          type="text"
                          value={dataDraft.odometer ?? ""}
                          onChange={(event) =>
                            setDataDraft((current) => ({ ...current, odometer: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Status
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.status ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => ({ ...current, status: event.target.value }))
                            }
                          >
                            <option value="">Select status</option>
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add status"
                            onClick={() => openInlineAddModal("tracking-status")}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove status"
                            onClick={() => {
                              const selected = dataDraft.status ?? "";
                              if (!selected) return;
                              setStatusOptions((current) => current.filter((item) => item !== selected));
                              setDataDraft((current) => ({ ...current, status: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      <label>
                        Firmware
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.firmware ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => ({ ...current, firmware: event.target.value }))
                            }
                          >
                            <option value="">Select firmware</option>
                            {firmwareOptions.map((fw) => (
                              <option key={fw} value={fw}>
                                {fw}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add firmware"
                            onClick={() => openInlineAddModal("tracking-firmware")}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove firmware"
                            onClick={() => {
                              const selected = dataDraft.firmware ?? "";
                              if (!selected) return;
                              setFirmwareOptions((current) => current.filter((item) => item !== selected));
                              setDataDraft((current) => ({ ...current, firmware: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                    </div>
                    <div className="assets-data-column">
                      <label>
                        Add camera details
                        <div className="assets-data-actions">
                          <button
                            type="button"
                            onClick={() => setDataDraft((current) => ({ ...current, hasCamera: "yes" }))}
                            aria-pressed={showCameraSettingsInModal}
                            disabled={showCameraSettingsInModal}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDataDraft((current) => ({
                                ...current,
                                hasCamera: "no",
                                camera: "",
                                cameraModel: "",
                                cameraPositioningProtocol: "",
                                cameraVideoProtocol: "",
                                cameraComponents: "",
                                cameraSerial: "",
                                cameraStatus: "",
                                cameraFirmware: ""
                              }))
                            }
                            aria-pressed={!showCameraSettingsInModal}
                            disabled={!showCameraSettingsInModal}
                          >
                            No
                          </button>
                        </div>
                      </label>
                      <label>
                        Use standalone mode
                        <div className="assets-data-actions">
                          <button
                            type="button"
                            onClick={() =>
                              setDataDraft((current) => ({
                                ...current,
                                standaloneMode: "yes",
                                device: "",
                                model: "",
                                odometer: "",
                                status: "",
                                firmware: ""
                              }))
                            }
                            aria-pressed={String(dataDraft.standaloneMode ?? "").trim().toLowerCase() === "yes"}
                            disabled={String(dataDraft.standaloneMode ?? "").trim().toLowerCase() === "yes"}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setDataDraft((current) => ({ ...current, standaloneMode: "no" }))}
                            aria-pressed={String(dataDraft.standaloneMode ?? "").trim().toLowerCase() !== "yes"}
                            disabled={String(dataDraft.standaloneMode ?? "").trim().toLowerCase() !== "yes"}
                          >
                            No
                          </button>
                        </div>
                        <small>
                          Standalone mode marks this setup for single-camera standalone usage.
                        </small>
                      </label>
                      {showCameraSettingsInModal && (
                        <>
                      <label>
                        Camera
                        <input
                          className="assets-data-search"
                          type="search"
                          placeholder="Search camera"
                          value={cameraDeviceSearch}
                          onChange={(event) => setCameraDeviceSearch(event.target.value)}
                        />
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.camera ?? ""}
                            onChange={(event) => {
                              setDataDraft((current) => ({ ...current, camera: event.target.value, cameraModel: "" }));
                              setCameraModelSearch("");
                            }}
                          >
                            <option value="">Select camera</option>
                            {cameraCatalog
                              .filter((camera) => camera.toLowerCase().includes(cameraDeviceSearch.trim().toLowerCase()))
                              .map((camera) => (
                                <option key={camera} value={camera}>
                                  {camera}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add camera"
                            onClick={() => openInlineAddModal("camera-device")}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove camera"
                            onClick={() => {
                              const selected = dataDraft.camera ?? "";
                              if (!selected) return;
                              setCameraCatalog((current) => current.filter((item) => item !== selected));
                              setCameraModels((current) => {
                                const next = { ...current };
                                delete next[selected];
                                return next;
                              });
                              setDataDraft((current) => ({ ...current, camera: "", cameraModel: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      <label>
                        Camera model
                        <input
                          className="assets-data-search"
                          type="search"
                          placeholder="Search camera model"
                          value={cameraModelSearch}
                          onChange={(event) => setCameraModelSearch(event.target.value)}
                        />
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.cameraModel ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => {
                                const nextModel = event.target.value;
                                const protocols = normalizeVc400Protocols(
                                  nextModel,
                                  current.cameraPositioningProtocol,
                                  current.cameraVideoProtocol,
                                  current.camera
                                );
                                return {
                                  ...current,
                                  cameraModel: nextModel,
                                  cameraPositioningProtocol: protocols.cameraPositioningProtocol,
                                  cameraVideoProtocol: protocols.cameraVideoProtocol
                                };
                              })
                            }
                          >
                            <option value="">Select camera model</option>
                            {(cameraModels[dataDraft.camera ?? ""] ?? [])
                              .filter((model) => model.toLowerCase().includes(cameraModelSearch.trim().toLowerCase()))
                              .map((model) => (
                                <option key={model} value={model}>
                                  {model}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add camera model"
                            onClick={() => {
                              if (!String(dataDraft.camera ?? "").trim()) {
                                showToast("Select a camera first.", "error");
                                return;
                              }
                              openInlineAddModal("camera-model");
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove camera model"
                            onClick={() => {
                              const camera = dataDraft.camera ?? "";
                              const selected = dataDraft.cameraModel ?? "";
                              if (!camera || !selected) return;
                              setCameraModels((current) => ({
                                ...current,
                                [camera]: (current[camera] ?? []).filter((item) => item !== selected)
                              }));
                              setDataDraft((current) => ({
                                ...current,
                                cameraModel: "",
                                cameraPositioningProtocol: "",
                                cameraVideoProtocol: ""
                              }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      <label>
                        Positioning protocol
                        <select
                          value={dataDraft.cameraPositioningProtocol ?? ""}
                          onChange={(event) =>
                            setDataDraft((current) => ({ ...current, cameraPositioningProtocol: event.target.value }))
                          }
                        >
                          <option value="">Select positioning protocol</option>
                          {POSITIONING_PROTOCOL_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Video protocol
                        <select
                          value={dataDraft.cameraVideoProtocol ?? ""}
                          onChange={(event) =>
                            setDataDraft((current) => ({ ...current, cameraVideoProtocol: event.target.value }))
                          }
                        >
                          <option value="">Select video protocol</option>
                          {VIDEO_PROTOCOL_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        {isVc400Model(dataDraft.cameraModel) && (
                          <small>VC-400 defaults to JT/T808 (positioning) and JT/T1078 (video).</small>
                        )}
                        {isCms808Camera(dataDraft.camera, dataDraft.cameraModel) && (
                          <small>CMS 808 standalone cameras default to JT/T808 (GPS) and JT/T1078 (video).</small>
                        )}
                      </label>
                      <label>
                        Additional components
                        <div className="assets-data-checkbox-list" style={{ display: "grid", gap: "0.35rem" }}>
                          {ADDITIONAL_CAMERA_COMPONENTS.map((component) => {
                            const selected = parseAdditionalCameraComponents(dataDraft.cameraComponents);
                            const checked = selected.includes(component);
                            return (
                              <label key={component} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    const current = parseAdditionalCameraComponents(dataDraft.cameraComponents);
                                    const next = event.target.checked
                                      ? Array.from(new Set([...current, component]))
                                      : current.filter((item) => item !== component);
                                    setDataDraft((draft) => ({ ...draft, cameraComponents: next.join(", ") }));
                                  }}
                                />
                                <span>{component}</span>
                              </label>
                            );
                          })}
                        </div>
                      </label>
                      <label className={fieldMissingClass("cameraSerial")}>
                        Camera serial
                        <input
                          type="text"
                          value={dataDraft.cameraSerial ?? ""}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setDataDraft((current) => ({ ...current, cameraSerial: nextValue }));
                            if (deviceIdentityErrors.cameraSerial) {
                              setDeviceIdentityErrors((current) => ({ ...current, cameraSerial: undefined }));
                            }
                            setMissingRequiredFields((current) => {
                              if (!current.has("imei") && !current.has("cameraSerial")) return current;
                              const next = new Set(current);
                              next.delete("imei");
                              next.delete("cameraSerial");
                              return next;
                            });
                          }}
                        />
                        {deviceIdentityErrors.cameraSerial && <small className="assets-field-error">{deviceIdentityErrors.cameraSerial}</small>}
                      </label>
                      <label>
                        Camera status
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.cameraStatus ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => ({ ...current, cameraStatus: event.target.value }))
                            }
                          >
                            <option value="">Select camera status</option>
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add camera status"
                            onClick={() => openInlineAddModal("camera-status")}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove camera status"
                            onClick={() => {
                              const selected = dataDraft.cameraStatus ?? "";
                              if (!selected) return;
                              setStatusOptions((current) => current.filter((item) => item !== selected));
                              setDataDraft((current) => ({ ...current, cameraStatus: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      <label>
                        Camera firmware
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.cameraFirmware ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => ({ ...current, cameraFirmware: event.target.value }))
                            }
                          >
                            <option value="">Select camera firmware</option>
                            {cameraFirmwareOptions.map((fw) => (
                              <option key={fw} value={fw}>
                                {fw}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add camera firmware"
                            onClick={() => openInlineAddModal("camera-firmware")}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove camera firmware"
                            onClick={() => {
                              const selected = dataDraft.cameraFirmware ?? "";
                              if (!selected) return;
                              setCameraFirmwareOptions((current) => current.filter((item) => item !== selected));
                              setDataDraft((current) => ({ ...current, cameraFirmware: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="assets-add-grid data-modal-grid">
                    {sectionFields[dataModalSection].map((field) => (
                      <label key={field.key}>
                        {field.label}
                        {field.key === "holder" ? (
                          <select
                            value={dataDraft[field.key] ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => ({ ...current, [field.key]: event.target.value }))
                            }
                          >
                            <option value="">
                              {driversLoading
                                ? "Loading drivers..."
                                : driverOptions.length > 0
                                  ? "Select a driver"
                                  : "No drivers found"}
                            </option>
                            {driverOptions.map((driver) => (
                              <option key={driver} value={driver}>
                                {driver}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={dataDraft[field.key] ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => ({ ...current, [field.key]: event.target.value }))
                            }
                          />
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {inlineAddKind && (
        <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label={INLINE_ADD_META[inlineAddKind].title}>
          <div className="assets-add-card inline-add-modal-card">
            <div className="assets-add-header inline-add-header">
              <div>
                <div className="assets-add-title">{INLINE_ADD_META[inlineAddKind].title}</div>
                <div className="inline-add-subtitle">{INLINE_ADD_META[inlineAddKind].subtitle}</div>
              </div>
              <div className="assets-add-actions">
                <button type="button" className="btn ghost" onClick={closeInlineAddModal}>
                  Cancel
                </button>
                <button type="button" className="btn primary" onClick={confirmInlineAddModal}>
                  {INLINE_ADD_META[inlineAddKind].actionLabel}
                </button>
              </div>
            </div>
            <div className="assets-add-body inline-add-body">
              <label className="inline-add-field">
                Value
                <input
                  autoFocus
                  type="text"
                  value={inlineAddValue}
                  placeholder={INLINE_ADD_META[inlineAddKind].placeholder}
                  onChange={(event) => setInlineAddValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      confirmInlineAddModal();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeInlineAddModal();
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {decommissionConfirm && (
        <div
          className="assets-add-modal decommission-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="decommission-modal-title"
          onClick={closeDecommissionConfirm}
        >
          <div
            className="assets-add-card decommission-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="decommission-modal-header">
              <div className="decommission-modal-header-main">
                <div className="decommission-modal-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  </svg>
                </div>
                <div>
                  <div className="decommission-modal-eyebrow">Device lifecycle · irreversible</div>
                  <h2 id="decommission-modal-title" className="decommission-modal-title">
                    Confirm device decommission
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className="decommission-modal-close"
                aria-label="Close decommission dialog"
                disabled={decommissionInProgress}
                onClick={closeDecommissionConfirm}
              >
                ×
              </button>
            </header>

            <div className="decommission-modal-body">
              <section className="decommission-summary" aria-label="Asset and device summary">
                <div className="decommission-summary-head">
                  <span className="decommission-summary-label">Target asset</span>
                  <span className="decommission-summary-pill">IMEI ending {decommissionConfirm.imei.slice(-4)}</span>
                </div>
                <div className="decommission-summary-title">{decommissionConfirm.assetLabel}</div>
                <dl className="decommission-summary-grid">
                  <div>
                    <dt>Registration</dt>
                    <dd>{decommissionConfirm.registration || "—"}</dd>
                  </div>
                  <div>
                    <dt>Site</dt>
                    <dd>{decommissionConfirm.site || "—"}</dd>
                  </div>
                  <div>
                    <dt>Device</dt>
                    <dd>{decommissionConfirm.device || "—"}</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{decommissionConfirm.model || "—"}</dd>
                  </div>
                  <div className="decommission-summary-imei">
                    <dt>IMEI</dt>
                    <dd>
                      <code>{decommissionConfirm.imei}</code>
                    </dd>
                  </div>
                </dl>
              </section>

              <label className="decommission-ack">
                <input
                  type="checkbox"
                  checked={decommissionAcknowledged}
                  disabled={decommissionInProgress}
                  onChange={(event) => setDecommissionAcknowledged(event.target.checked)}
                />
                <span>
                  I authorize decommission of IMEI <code>{decommissionConfirm.imei}</code> and understand this cannot be
                  undone from the application.
                </span>
              </label>
            </div>

            <footer className="decommission-modal-footer">
              <p className="decommission-modal-footer-note">
                {decommissionAcknowledged
                  ? "Ready to proceed when you confirm below."
                  : "Review the summary and acknowledge to enable decommission."}
              </p>
              <div className="decommission-modal-footer-actions">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={decommissionInProgress}
                  onClick={closeDecommissionConfirm}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={decommissionInProgress || !decommissionAcknowledged}
                  onClick={() =>
                    void executeDeviceDecommission(decommissionConfirm.assetId, decommissionConfirm.imei)
                  }
                >
                  {decommissionInProgress ? "Decommissioning…" : "Confirm decommission"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div
          className="assets-add-modal decommission-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-asset-modal-title"
          onClick={closeDeleteConfirm}
        >
          <div className="assets-add-card decommission-modal-card" onClick={(event) => event.stopPropagation()}>
            <header className="decommission-modal-header">
              <div className="decommission-modal-header-main">
                <div className="decommission-modal-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M3 6h18" />
                    <path d="M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" />
                    <path d="M10 11v6M14 11v6M9 6V4h6v2" />
                  </svg>
                </div>
                <div>
                  <div className="decommission-modal-eyebrow">Fleet records · irreversible</div>
                  <h2 id="delete-asset-modal-title" className="decommission-modal-title">
                    Delete this asset?
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className="decommission-modal-close"
                aria-label="Close delete dialog"
                disabled={deleteInProgress}
                onClick={closeDeleteConfirm}
              >
                ×
              </button>
            </header>

            <div className="decommission-modal-body">
              <section className="decommission-summary" aria-label="Asset to delete">
                <div className="decommission-summary-head">
                  <span className="decommission-summary-label">Target asset</span>
                  {deleteConfirm.imei ? (
                    <span className="decommission-summary-pill">
                      IMEI ending {deleteConfirm.imei.slice(-4)}
                    </span>
                  ) : (
                    <span className="decommission-summary-pill">No IMEI on file</span>
                  )}
                </div>
                <div className="decommission-summary-title">{deleteConfirm.assetLabel}</div>
                <dl className="decommission-summary-grid">
                  <div>
                    <dt>Registration</dt>
                    <dd>{deleteConfirm.registration || "—"}</dd>
                  </div>
                  <div>
                    <dt>Site</dt>
                    <dd>{deleteConfirm.site || "—"}</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{deleteConfirm.model || "—"}</dd>
                  </div>
                  <div>
                    <dt>Asset ID</dt>
                    <dd>{deleteConfirm.assetId || "—"}</dd>
                  </div>
                  {deleteConfirm.imei ? (
                    <div className="decommission-summary-imei">
                      <dt>IMEI</dt>
                      <dd>
                        <code>{deleteConfirm.imei}</code>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              <ul className="asset-delete-consequences">
                <li>The asset record is removed from this database and site.</li>
                <li>This cannot be undone from the application.</li>
              </ul>

              <label className="decommission-ack">
                <input
                  type="checkbox"
                  checked={deleteAcknowledged}
                  disabled={deleteInProgress}
                  onChange={(event) => setDeleteAcknowledged(event.target.checked)}
                />
                <span>
                  I understand that deleting <strong>{deleteConfirm.assetLabel}</strong> is permanent and cannot be reversed.
                </span>
              </label>
            </div>

            <footer className="decommission-modal-footer">
              <p className="decommission-modal-footer-note">
                {deleteAcknowledged
                  ? "Ready to delete when you confirm below."
                  : "Review the asset and acknowledge to enable delete."}
              </p>
              <div className="decommission-modal-footer-actions">
                <button type="button" className="btn ghost" disabled={deleteInProgress} onClick={closeDeleteConfirm}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={deleteInProgress || !deleteAcknowledged}
                  onClick={() => void executeAssetDelete()}
                >
                  {deleteInProgress ? "Deleting…" : "Delete asset"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {showSmsModal && (
        <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Resend commissioning SMS">
          <div className="assets-add-card sms-modal-card">
            <div className="assets-add-header">
              <div className="assets-add-title">Resend commissioning SMS</div>
              <div className="assets-add-actions">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={sendingSms}
                  onClick={() => {
                    setShowSmsModal(false);
                    setSmsTarget(null);
                    setSmsTargetImei("");
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={sendingSms || !smsTargetImei}
                  onClick={async () => {
                    if (!smsTargetImei) {
                      showToast("No IMEI set for this asset yet.", "error");
                      return;
                    }
                    setSendingSms(true);
                    try {
                      const command = String(smsMessage ?? "").trim();
                      const result = await kickAvlSocket(smsTargetImei, command || undefined);
                      if (!result.queued) {
                        showToast(`Resend failed: ${result.error ?? "Unknown error"}`, "error");
                        return;
                      }
                      showToast(`Command sent to ${smsTarget ?? smsTargetImei}.`, "success");
                      setShowSmsModal(false);
                      setSmsTarget(null);
                      setSmsTargetImei("");
                      setSmsMessage("");
                    } finally {
                      setSendingSms(false);
                    }
                  }}
                >
                  {sendingSms ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
            <div className="assets-add-body sms-modal-body">
              <div className="sms-modal-content">
                <div className="sms-modal-label">Send message to device</div>
                <div className="sms-modal-target">{smsTarget ?? "Selected asset"}</div>
                <textarea
                  rows={4}
                  placeholder="Type commissioning message"
                  value={smsMessage}
                  onChange={(event) => setSmsMessage(event.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {ioListAsset && (
        <AssetIoListModal
          asset={{
            registration: ioListAsset.registration,
            assetDescription: ioListAsset.assetDescription,
            imei: ioListAsset.imei,
            traccarDeviceId: (ioListAsset as { traccarDeviceId?: number | string }).traccarDeviceId
          }}
          onClose={() => setIoListAsset(null)}
        />
      )}

      {showDiagnosticsModal && diagnosticsAsset && (
        <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Diagnostics">
          <div className="assets-add-card diagnostics-modal-card">
            <div className="assets-add-header">
              <div className="assets-add-title">Diagnostics</div>
              <div className="assets-add-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setShowDiagnosticsModal(false);
                    setDiagnosticsAsset(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="assets-add-body diagnostics-modal-body">
              <button type="button" className="diagnostics-pill">Request firmware version</button>

              <div className="diagnostics-card">
                <button
                  type="button"
                  className="diagnostics-toggle"
                  onClick={() =>
                    setDiagnosticsOpen((current) => ({ ...current, assetDetails: !current.assetDetails }))
                  }
                >
                  Asset details
                  <span>{diagnosticsOpen.assetDetails ? "−" : "+"}</span>
                </button>
                {diagnosticsOpen.assetDetails && (
                  <div className="diagnostics-table">
                    <div className="diagnostics-row"><span>Asset description</span><span>{diagnosticsAsset.assetDescription}</span></div>
                    <div className="diagnostics-row"><span>Registration number</span><span>{diagnosticsAsset.registration}</span></div>
                    <div className="diagnostics-row"><span>Asset ID</span><span>{diagnosticsAsset.assetId}</span></div>
                    <div className="diagnostics-row"><span>Organisation</span><span>{activeOrganisationLabel || "Not available"}</span></div>
                    <div className="diagnostics-row"><span>Dealer</span><span>{activeDealerLabel || "Not available"}</span></div>
                    <div className="diagnostics-row"><span>Database</span><span>{activeDatabaseLabel || diagnosticsAsset.configGroup || "Not available"}</span></div>
                    <div className="diagnostics-row"><span>Site</span><span>{diagnosticsAsset.site || activeSiteFilter || "Not available"}</span></div>
                    <div className="diagnostics-row"><span>Asset type</span><span>{displayValue(diagnosticsAsset.assetType)}</span></div>
                    <div className="diagnostics-row"><span>Status</span><span>{diagnosticsAsset.status === "available" ? "Available" : "Unavailable"}</span></div>
                    <div className="diagnostics-row"><span>Vehicle Identification Number (VIN)</span><span>{diagnosticsAsset.vin ?? "Not available"}</span></div>
                    <div className="diagnostics-row"><span>Asset site time</span><span>Not available</span></div>
                  </div>
                )}
              </div>

              <div className="diagnostics-card">
                <button
                  type="button"
                  className="diagnostics-toggle"
                  onClick={() =>
                    setDiagnosticsOpen((current) => ({ ...current, mobileDevice: !current.mobileDevice }))
                  }
                >
                  Mobile device details
                  <span>{diagnosticsOpen.mobileDevice ? "−" : "+"}</span>
                </button>
                {diagnosticsOpen.mobileDevice && (
                  (() => {
                    const anyAsset: any = diagnosticsAsset as any;
                    const rowFromAsset =
                      (Array.isArray(anyAsset?.mobileDeviceSettings) ? anyAsset.mobileDeviceSettings[0] : null) ??
                      (Array.isArray(anyAsset?.["Mobile device settings"])
                        ? anyAsset["Mobile device settings"][0]
                        : null);
                    const latest = anyAsset?.telemetryLatest && typeof anyAsset.telemetryLatest === "object"
                      ? anyAsset.telemetryLatest
                      : null;
                    const fw = latest?.firmwareVersion ?? anyAsset?.firmwareVersion ?? anyAsset?.firmware ?? "";
                    return (
                      <div className="diagnostics-table">
                        <div className="diagnostics-row"><span>Mobile device</span><span>{displayValue(anyAsset?.device ?? rowFromAsset?.device ?? anyAsset?.mobileDevice ?? "")}</span></div>
                        <div className="diagnostics-row"><span>IMEI</span><span>{displayValue(rowFromAsset?.imei ?? anyAsset?.imei ?? "")}</span></div>
                        <div className="diagnostics-row"><span>Firmware version</span><span>{displayValue(fw)}</span></div>
                        <div className="diagnostics-row"><span>GPS module</span><span>{displayValue(anyAsset?.gpsModule ?? "")}</span></div>
                        <div className="diagnostics-row"><span>Hardware version</span><span>{displayValue(anyAsset?.hardwareVersion ?? "")}</span></div>
                        <div className="diagnostics-row"><span>Hardware version modification</span><span>{displayValue(rowFromAsset?.model ?? anyAsset?.model ?? "")}</span></div>
                      </div>
                    );
                  })()
                )}
              </div>

              <div className="diagnostics-card">
                <button
                  type="button"
                  className="diagnostics-toggle"
                  onClick={() =>
                    setDiagnosticsOpen((current) => ({ ...current, tripInfo: !current.tripInfo }))
                  }
                >
                  Trip information
                  <span>{diagnosticsOpen.tripInfo ? "−" : "+"}</span>
                </button>
                {diagnosticsOpen.tripInfo && (
                  (() => {
                    const anyAsset: any = diagnosticsAsset as any;
                    const latest = anyAsset?.telemetryLatest && typeof anyAsset.telemetryLatest === "object"
                      ? anyAsset.telemetryLatest
                      : null;
                    const speed =
                      typeof anyAsset?.speed !== "undefined"
                        ? anyAsset.speed
                        : typeof latest?.speed !== "undefined"
                          ? latest.speed
                          : typeof latest?.io?.Speed !== "undefined"
                            ? latest.io.Speed
                          : "";
                    const ignition =
                      typeof latest?.ignition !== "undefined"
                        ? latest.ignition
                        : typeof latest?.io?.Ignition !== "undefined"
                          ? latest.io.Ignition
                          : anyAsset?.ignition;
                    return (
                      <div className="diagnostics-table">
                        <div className="diagnostics-row"><span>Trip mode</span><span>{displayValue(anyAsset?.tripMode ?? "Out of Trip")}</span></div>
                        <div className="diagnostics-row"><span>Driver</span><span>{displayValue(readAssetDefaultDriverFormState(anyAsset).defaultDriver || anyAsset?.driver || "")}</span></div>
                        <div className="diagnostics-row"><span>Ignition state</span><span>{toIgnitionLabel(ignition) || "Off"}</span></div>
                        <div className="diagnostics-row"><span>Speed</span><span>{typeof speed !== "undefined" && String(speed) !== "" ? `${String(speed)} km/h` : ""}</span></div>
                        <div className="diagnostics-row"><span>Odometer</span><span>{displayValue(anyAsset?.odometer)}</span></div>
                      </div>
                    );
                  })()
                )}
              </div>

              <div className="diagnostics-card">
                <button
                  type="button"
                  className="diagnostics-toggle"
                  onClick={() =>
                    setDiagnosticsOpen((current) => ({ ...current, latestPosition: !current.latestPosition }))
                  }
                >
                  Latest position information
                  <span>{diagnosticsOpen.latestPosition ? "−" : "+"}</span>
                </button>
                {diagnosticsOpen.latestPosition && (
                  <div className="diagnostics-table">
                    {(() => {
                      const anyAsset: any = diagnosticsAsset as any;
                      const lastSeen = String(anyAsset.lastSeen ?? "");
                      const pos = String(anyAsset.lastPosition ?? "");
                      const parts = pos.split(",").map((p: string) => p.trim());
                      const lat = parts.length >= 1 ? parts[0] : "";
                      const lng = parts.length >= 2 ? parts[1] : "";
                      const tl = anyAsset.telemetryLatest;
                      const io = tl?.io && typeof tl.io === "object" ? tl.io : {};
                      const speed = typeof anyAsset.speed !== "undefined" ? anyAsset.speed : io["Speed"];
                      const sats =
                        io["Number of Satellites"] ??
                        io["Satellites"] ??
                        io["GNSS Satellites"] ??
                        io["GPS Satellites"] ??
                        io["sat"] ??
                        tl?.satellites ??
                        tl?.sat ??
                        anyAsset?.satellites ??
                        anyAsset?.sat;
                      const heading = io["Heading"] ?? tl?.heading ?? anyAsset?.heading;
                      const ignition =
                        typeof tl?.ignition !== "undefined"
                          ? tl.ignition
                          : typeof io["Ignition"] !== "undefined"
                            ? io["Ignition"]
                            : anyAsset?.ignition;
                      return (
                        <>
                          <div className="diagnostics-row"><span>Date and time of last AVL</span><span>{lastSeen || ""}</span></div>
                          <div className="diagnostics-row"><span>Ignition state</span><span>{toIgnitionLabel(ignition) || "Off"}</span></div>
                          <div className="diagnostics-row"><span>Longitude</span><span>{lng || ""}</span></div>
                          <div className="diagnostics-row"><span>Latitude</span><span>{lat || ""}</span></div>
                          <div className="diagnostics-row"><span>GPS velocity</span><span>{typeof speed !== "undefined" ? `${String(speed)} km/h` : ""}</span></div>
                          <div className="diagnostics-row"><span>Heading</span><span>{typeof heading !== "undefined" ? String(heading) : ""}</span></div>
                          <div className="diagnostics-row"><span>Number of satellites</span><span>{typeof sats !== "undefined" && String(sats).trim() !== "" ? String(sats) : "0"}</span></div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {isGpsIotServer() && (
                <div className="diagnostics-card">
                  <button
                    type="button"
                    className="diagnostics-toggle"
                    onClick={() =>
                      setDiagnosticsOpen((current) => ({ ...current, inputStatus: !current.inputStatus }))
                    }
                  >
                    Input status
                    <span>{diagnosticsOpen.inputStatus ? "−" : "+"}</span>
                  </button>
                  {diagnosticsOpen.inputStatus && (
                    <div className="diagnostics-table">
                      {diagnosticsInputStatus.status === "loading" && (
                        <div className="diagnostics-row"><span>Loading</span><span>Fetching GPS IoT input status…</span></div>
                      )}
                      {diagnosticsInputStatus.status === "error" && (
                        <div className="diagnostics-row"><span>Error</span><span>{diagnosticsInputStatus.error || "Unavailable"}</span></div>
                      )}
                      {diagnosticsInputStatus.status === "ready" && diagnosticsInputStatus.inputs.length === 0 && (
                        <div className="diagnostics-row"><span>Inputs</span><span>No input status reported</span></div>
                      )}
                      {diagnosticsInputStatus.inputs.map((input) => (
                        <div className="diagnostics-row" key={`${input.name}-${input.kind}`}>
                          <span>{input.name}{input.kind !== "unknown" ? ` (${input.kind})` : ""}</span>
                          <span>{formatGpsIotInputStatusLabel(input)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
