import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CompassIcon, DownloadIcon, EditIcon, PinsIcon, QueryIcon, ReportIcon, SettingsIcon, TimelineIcon } from "../components/Icons";
import {
  buildApiUrl,
  canForPath,
  commissionDeviceDetailed,
  confirmTelemetryForImei,
  getAssetsFromApi,
  getAssetsFromApiForTenant,
  getBindings,
  getCamerasFromApi,
  getConfigurationGroups,
  getSiteTimeZoneSettings,
  getApiBaseUrl,
  getTenantId,
  getApiKey,
  kickAvlSocket,
  pushDeviceSettings,
  resolveTimeZoneForSite,
  saveBinding,
  saveConfigurationGroup,
  saveToApi,
  SiteTimeZoneSettings,
  telemetryLookupByImeiDetailed,
  upsertAssetDetailed,
  upsertAssetDetailedForTenant
} from "../utils/api";
import { showToast } from "../utils/toast";
import { computeAssetDotStatus } from "../utils/assetStatus";
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
  mobileDevice?: string;
  mobileModel?: string;
  odometer?: string;
  engineHours?: string;
  lastLocation?: string;
  configUploadDate?: string;
  configGroup?: string;
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
};

type MobileDeviceRow = {
  device: string;
  model: string;
  imei: string;
  installed: string;
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

type CameraAssetBinding = {
  cameraId: string;
  assetId: string;
  assetDescription?: string;
  registration?: string;
};

type DeviceBindingRecord = {
  id?: string;
  name?: string;
  mappings?: CameraAssetBinding[];
};

type AssetBindingOption = {
  id: string;
  description: string;
  registration: string;
};

const CAMERA_BINDINGS_ID = "camera-asset-bindings";

const extractCameraIdFromRecord = (record: Record<string, unknown>) => {
  return String(record.cameraId ?? record.id ?? "").trim();
};

const parseCameraAssetBindings = (bindings: DeviceBindingRecord[]) => {
  const record = bindings.find((row) => String(row?.id ?? "").trim() === CAMERA_BINDINGS_ID);
  if (!record || !Array.isArray(record.mappings)) return [] as CameraAssetBinding[];

  return record.mappings
    .map((row) => ({
      cameraId: String(row?.cameraId ?? "").trim(),
      assetId: String(row?.assetId ?? "").trim(),
      assetDescription: String(row?.assetDescription ?? "").trim(),
      registration: String(row?.registration ?? "").trim()
    }))
    .filter((row) => row.cameraId && row.assetId);
};

const saveCameraAssetBindings = async (mappings: CameraAssetBinding[]) => {
  return saveBinding("devices", {
    id: CAMERA_BINDINGS_ID,
    name: "Camera Asset Bindings",
    mappings
  });
};

const createEmptyMobileDeviceRow = (): MobileDeviceRow => ({
  device: "",
  model: "",
  imei: "",
  installed: "",
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

const initialAssets: Asset[] = [];

const writeAssetsCache = (assets: Asset[]) => {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(Array.isArray(assets) ? assets : []);
  window.localStorage.setItem("vivi.assets", serialized);
  const tenantId = String(getTenantId() ?? "").trim();
  if (tenantId) {
    window.localStorage.setItem(`vivi.assets:${tenantId}`, serialized);
  }
};

const columns: { key: ColumnKey; label: string }[] = [
  { key: "assetDescription", label: "Asset description" },
  { key: "fleetNumber", label: "Fleet number" },
  { key: "infoIssued", label: "Info issued" },
  { key: "imei", label: "IMEI" },
  { key: "site", label: "Site" },
  { key: "model", label: "Model" },
  { key: "lastPosition", label: "Last position" },
  { key: "lastTrip", label: "Last trip" },
  { key: "registration", label: "Registration number" },
  { key: "assetId", label: "Asset ID" },
  { key: "country", label: "Country" },
  { key: "assetType", label: "Asset type" },
  { key: "make", label: "Make" },
  { key: "year", label: "Year" },
  { key: "vin", label: "VIN number" },
  { key: "mobileDevice", label: "Mobile device" },
  { key: "odometer", label: "Odometer" },
  { key: "engineHours", label: "Engine hours" },
  { key: "status", label: "Status" },
  { key: "lastLocation", label: "Last location" },
  { key: "configUploadDate", label: "Config upload date" },
  { key: "configGroup", label: "Configuration group" },
  { key: "imsi", label: "IMSI" },
  { key: "msisdn", label: "MSISDN" },
  { key: "faults", label: "Faults" }
];

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

const normalizeVc400Protocols = (
  cameraModel: unknown,
  positioningProtocol: unknown,
  videoProtocol: unknown
) => {
  const positioning = String(positioningProtocol ?? "").trim();
  const video = String(videoProtocol ?? "").trim();
  if (!isVc400Model(cameraModel)) {
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
  const canEditAssets = canForPath("/Track/fleet/assets", "edit");
  const canDeleteAssets = canForPath("/Track/fleet/assets", "delete");
  const DASH = "—";
  const readActiveOrganisationLabel = () => {
    if (typeof window === "undefined") return "";
    const selectedPath = String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim();
    if (!selectedPath) return "";
    const parts = selectedPath
      .split("/")
      .map((part) => String(part ?? "").trim())
      .filter(Boolean);
    return parts[1] ?? parts[0] ?? "";
  };
  const [activeOrganisationLabel, setActiveOrganisationLabel] = useState<string>(() => readActiveOrganisationLabel());
  const normalizeUiText = (value: unknown) =>
    String(value ?? "")
      .replaceAll("ΓÇö", DASH)
      .replaceAll("ΓëÑ", "≥")
      .trim();

  useEffect(() => {
    const syncOrganisation = () => setActiveOrganisationLabel(readActiveOrganisationLabel());
    syncOrganisation();
    window.addEventListener("vivi:orgchange", syncOrganisation);
    window.addEventListener("storage", syncOrganisation);
    return () => {
      window.removeEventListener("vivi:orgchange", syncOrganisation);
      window.removeEventListener("storage", syncOrganisation);
    };
  }, []);

  const formatTimestampWithZone = (iso: unknown, timeZone: string) => {
    const raw = String(iso ?? "").trim();
    if (!raw || raw === DASH) return "";
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return raw;
    try {
      const dt = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: "short"
      }).format(new Date(parsed));
      return dt.replace(",", "");
    } catch {
      const dt = new Date(parsed)
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
      return `${dt} (${timeZone})`;
    }
  };

  const displayValue = (value: unknown) => {
    const normalized = normalizeUiText(value);
    return normalized ? normalized : "";
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
    const reg = String((asset as any)?.registration ?? "").trim();
    if (reg && !isDashPlaceholder(reg)) return `asset-${slug(reg)}`;
    const imei = String((asset as any)?.imei ?? "").trim();
    if (imei && !isDashPlaceholder(imei)) return `asset-${slug(imei)}`;
    const cameraSerial = String((asset as any)?.cameraSerial ?? "").trim();
    if (cameraSerial && !isDashPlaceholder(cameraSerial)) return `asset-cam-${slug(cameraSerial)}`;
    return "";
  };

  const normalizeAndDedupeAssets = (items: any[]) => {
    const tryIso = (value: unknown): string => {
      const raw = String(value ?? "").trim();
      if (!raw) return "";
      const ms = Date.parse(raw);
      if (Number.isNaN(ms)) return "";
      return new Date(ms).toISOString();
    };

    const getFreshestServerTimestamp = (asset: any): string => {
      const latest = asset?.telemetryLatest && typeof asset.telemetryLatest === "object" ? asset.telemetryLatest : null;
      const candidates = [
        // Preferred server-side freshness candidates.
        asset?.lastSeen,
        asset?.last_seen,
        asset?.lastSeenAt,
        asset?.last_seen_at,
        latest?.at,
        latest?.serverAt,
        asset?.updatedAt,
        asset?.updated_at,
        asset?.modifiedAt,
        asset?.modified_at,
        asset?.createdAt,
        asset?.created_at
      ]
        .map((v) => tryIso(v))
        .filter(Boolean)
        .sort()
        .reverse();

      return candidates[0] ?? "";
    };

    const next: Asset[] = [];
    const seen = new Set<string>();
    for (const a of Array.isArray(items) ? items : []) {
      const stableId = getStableAssetId(a) || `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      if (seen.has(stableId)) continue;
      seen.add(stableId);

      const anyAsset = a as any;
  const lastSeenIso = getFreshestServerTimestamp(anyAsset);
      const rawLastPosition = String(anyAsset.lastPosition ?? "").trim();
      const rawLastTrip = String(anyAsset.lastTrip ?? "").trim();

      const lastPositionRaw = lastSeenIso
        ? lastSeenIso
        : rawLastPosition && !looksLikeCoords(rawLastPosition)
          ? rawLastPosition
          : "";

      const lastTripRaw = rawLastTrip && !looksLikeCoords(rawLastTrip) ? rawLastTrip : "";

      next.push({
        ...(anyAsset as any),
        id: stableId,
        lastPosition: lastPositionRaw || "",
        lastTrip: lastTripRaw || "",
        lastSeen: lastSeenIso || undefined
      } as Asset);
    }
    return next;
  };

  const toIsoOrEmpty = (value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) return "";
    return new Date(ms).toISOString();
  };

  const toMsOrNaN = (value: unknown) => {
    const iso = toIsoOrEmpty(value);
    if (!iso) return Number.NaN;
    return Date.parse(iso);
  };

  const enrichAssetsWithFreshTelemetry = async (assets: Asset[]): Promise<Asset[]> => {
    const candidates = assets.filter((asset) => {
      const imei = String(asset.imei ?? "").trim();
      if (!imei) return false;
      const lastSeenMs = toMsOrNaN(asset.lastSeen ?? asset.lastPosition);
      // Only probe rows that are stale or missing to avoid unnecessary API calls.
      return !Number.isFinite(lastSeenMs) || Date.now() - lastSeenMs > 60 * 60 * 1000;
    });
    if (!candidates.length) return assets;

    const updates = await Promise.all(
      candidates.map(async (asset) => {
        const imei = String(asset.imei ?? "").trim();
        const telemetry = await confirmTelemetryForImei(imei);
        const telemetryAt = toIsoOrEmpty(telemetry.lastAt);
        if (!telemetry.ok || !telemetry.received || !telemetryAt) return { id: asset.id, at: "" };
        return { id: asset.id, at: telemetryAt };
      })
    );

    const byId = new Map(updates.filter((u) => u.at).map((u) => [u.id, u.at]));
    if (!byId.size) return assets;

    return assets.map((asset) => {
      const incomingAt = byId.get(asset.id);
      if (!incomingAt) return asset;

      const currentSeenMs = toMsOrNaN(asset.lastSeen ?? asset.lastPosition);
      const incomingMs = Date.parse(incomingAt);
      if (Number.isFinite(currentSeenMs) && currentSeenMs >= incomingMs) return asset;

      return {
        ...asset,
        lastSeen: incomingAt,
        // Keep table freshness aligned to confirmed telemetry receive time.
        lastPosition: incomingAt
      };
    });
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
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(new Set(columns.map((c) => c.key)));
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [colMenuPos, setColMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(columns.map((c) => c.key));
  const [dragCol, setDragCol] = useState<ColumnKey | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [assetSaved, setAssetSaved] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [activeAddTab, setActiveAddTab] = useState("Asset details");
  const [dirtyTabs, setDirtyTabs] = useState<Record<string, boolean>>({});
  const [customGroupFilter, setCustomGroupFilter] = useState("");
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [lastSaveWasLocal, setLastSaveWasLocal] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsTarget, setSmsTarget] = useState<string | null>(null);
  const [smsTargetImei, setSmsTargetImei] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [diagnosticsAsset, setDiagnosticsAsset] = useState<Asset | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState({
    assetDetails: true,
    mobileDevice: true,
    tripInfo: false,
    latestPosition: false
  });
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
    .filter((key) => visibleCols.has(key))
    .map((key) => columns.find((c) => c.key === key)!)
    .filter(Boolean);
  const grid = `${activeCols.map((col) => `${columnWidths[col.key]}px`).join(" ")} 48px`;

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

  const hasProvisionedImei = (asset: Asset): boolean => {
    const imei = String(asset.imei ?? "").trim();
    return Boolean(imei && !isDashPlaceholder(imei));
  };

  const hasTelemetryTimestamp = (asset: Asset): boolean => {
    // Prevent false "issued" status when rows have manual timestamps but no linked device IMEI.
    if (!hasProvisionedImei(asset)) return false;
    const lastSeenRaw = String(asset.lastSeen ?? "").trim();
    if (lastSeenRaw && !Number.isNaN(Date.parse(lastSeenRaw))) return true;
    return hasUpdatedLastPosition(asset);
  };

  const getInfoIssued = (asset: Asset): boolean => {
    // If telemetry timestamp exists, info is considered issued.
    return hasTelemetryTimestamp(asset);
  };

  const hasUpdatedLastPosition = (asset: Asset): boolean => {
    const parsed = parseAssetDate(asset.lastPosition);
    return Boolean(parsed && !Number.isNaN(parsed.getTime()));
  };

  const shouldShowStatusDot = (asset: Asset): boolean => {
    return hasTelemetryTimestamp(asset);
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

  const getDotStatus = (asset: Asset): "online" | "warning" | "offline" => {
    return computeAssetDotStatus({
      availability: (asset as any)?.status,
      lastSeen: (asset as any)?.lastSeen,
      lastPosition: (asset as any)?.lastPosition,
      lastTrip: (asset as any)?.lastTrip,
      speed: (asset as any)?.speed,
      staleHours: 2
    });
  };

  const matchesFilter = (asset: Asset, filter: string) => {
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

  type ConfigGroupLike = {
    id?: string;
    name?: string;
    [key: string]: unknown;
  };

  type ConfigGroupOption = { value: string; label: string };

  const defaultConfigGroupOptions: ConfigGroupOption[] = [
    { value: "Fuel haulers", label: "Fuel haulers" },
    { value: "Line haul", label: "Line haul" },
    { value: "New onboarding", label: "New onboarding" }
  ];

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

      const value = name || id;
      const label = name || id;
      if (!value) continue;
      if (seen.has(value)) continue;
      seen.add(value);
      options.push({ value, label });
    }

    return options;
  };

  const [assetsData, setAssetsData] = useState<Asset[]>(initialAssets);
  const [configGroupOptions, setConfigGroupOptions] = useState<ConfigGroupOption[]>([]);
  const [siteOptions, setSiteOptions] = useState<string[]>([]);
  const [availableCameraIds, setAvailableCameraIds] = useState<string[]>([]);
  const [cameraAssetBindings, setCameraAssetBindings] = useState<CameraAssetBinding[]>([]);
  const [bindingCameraId, setBindingCameraId] = useState("");
  const [bindingAssetId, setBindingAssetId] = useState("");
  const [bindingMessage, setBindingMessage] = useState("");

  const computeSiteOptions = () => {
    const sites = new Set<string>();

    const stored = window.localStorage.getItem("vivi.activeDbSites");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          parsed.forEach((s) => {
            const name = String(s ?? "").trim();
            if (name) sites.add(name);
          });
        }
      } catch {
        // ignore
      }
    }

    if (sites.size === 0) {
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

    // Always include any sites already present on assets.
    assetsData.forEach((a) => {
      const name = String(a.site ?? "").trim();
      if (name) sites.add(name);
    });

    return Array.from(sites);
  };

  const ensureDefaultConfigGroup = async (): Promise<void> => {
    const existing = await getConfigurationGroups<{ id?: string; name?: string }>();
    if (existing.length) return;

    // Minimal bindings + group so support agents can create assets from the UI without backend access.
    await saveBinding("notifications", { id: "default-notifications", name: "Default Notifications", monitoredEvents: [] });
    await saveBinding("locations", { id: "default-locations", name: "Default Locations" });
    await saveBinding("devices", { id: "default-devices", name: "Default Devices" });
    await saveConfigurationGroup({
      id: "default-group",
      name: "Default Group",
      notificationBinding: "default-notifications",
      locationBinding: "default-locations",
      deviceBinding: "default-devices"
    });
  };

  const ensureSelectedConfigGroupExists = async (groupValue: string): Promise<boolean> => {
    const selected = String(groupValue ?? "").trim();
    if (!selected) return false;

    const existing = await getConfigurationGroups<{ id?: string; name?: string }>();
    const hasMatch = existing.some((group) => {
      const id = String(group?.id ?? "").trim().toLowerCase();
      const name = String(group?.name ?? "").trim().toLowerCase();
      const needle = selected.toLowerCase();
      return (id && id === needle) || (name && name === needle);
    });
    if (hasMatch) return true;

    await saveBinding("notifications", { id: "default-notifications", name: "Default Notifications", monitoredEvents: [] });
    await saveBinding("locations", { id: "default-locations", name: "Default Locations" });
    await saveBinding("devices", { id: "default-devices", name: "Default Devices" });

    const generatedId = selected
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const groupId = generatedId || `group-${Date.now()}`;
    const created = await saveConfigurationGroup({
      id: groupId,
      name: selected,
      notificationBinding: "default-notifications",
      locationBinding: "default-locations",
      deviceBinding: "default-devices"
    });

    if (!created) return false;

    const refreshed = await getConfigurationGroups<ConfigGroupLike>();
    const options = buildConfigGroupOptions(refreshed);
    const finalOptions = options.length ? options : defaultConfigGroupOptions;
    setConfigGroupOptions(finalOptions);
    return true;
  };

  useEffect(() => {
    let mounted = true;
    const loadAssets = async () => {
      const tz = await getSiteTimeZoneSettings();
      if (mounted) setSiteTimeZones(tz);
      const apiAssets = await getAssetsFromApi<Asset>();
      if (!mounted) return;
      if (apiAssets.length) {
        const normalized = normalizeAndDedupeAssets(apiAssets as any[]);
        const enriched = await enrichAssetsWithFreshTelemetry(normalized);
        setAssetsData(enriched);
        writeAssetsCache(enriched);
      } else {
        // If this tenant has no assets yet, try a one-time migration from the legacy (no-tenant) store.
        // This happens when the org selector generates a new tenant id, but earlier assets were created before tenancy.
        const tenantId = String(getTenantId() ?? "").trim();
        const migratedKey = tenantId ? `vivi.assets.migratedFromLegacy:${tenantId}` : "";
        const alreadyMigrated = migratedKey
          ? String(window.localStorage.getItem(migratedKey) ?? "").trim().toLowerCase() === "true"
          : false;

        if (tenantId && !alreadyMigrated) {
          const legacyAssets = await getAssetsFromApiForTenant<Asset>(null);
          if (legacyAssets.length > 0) {
            // Requires login token.
            if (!getApiKey()) {
              showToast("Log in to migrate assets into this database.", "error");
              navigate("/login");
              return;
            }

            const targetSite = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim() || "Gamini";
            showToast(`Migrating ${legacyAssets.length} assets into this database...`, "info");

            let okCount = 0;
            for (const asset of legacyAssets) {
              const id = String((asset as any)?.id ?? "").trim();
              const imei = String((asset as any)?.imei ?? "").trim();
              const configGroup = String((asset as any)?.configGroup ?? (asset as any)?.configurationGroup ?? "").trim();
              if (!id || !imei || !configGroup) continue;
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
              const refreshed = await getAssetsFromApi<Asset>();
              const normalized = normalizeAndDedupeAssets(refreshed as any[]);
              const enriched = await enrichAssetsWithFreshTelemetry(normalized);
              setAssetsData(enriched);
              writeAssetsCache(enriched);
              showToast(`Migrated ${okCount} assets.`, "success");
              return;
            }
          }
        }

        writeAssetsCache(initialAssets);
      }
    };
    void loadAssets();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadCameraBindings = async () => {
      const [apiCameras, deviceBindings] = await Promise.all([
        getCamerasFromApi<Record<string, unknown>>(),
        getBindings<DeviceBindingRecord>("devices")
      ]);
      if (!mounted) return;

      const cameraIds = Array.from(
        new Set(
          apiCameras
            .map((camera) => extractCameraIdFromRecord(camera as Record<string, unknown>))
            .filter(Boolean)
        )
      );
      cameraIds.sort((a, b) => a.localeCompare(b));
      setAvailableCameraIds(cameraIds);
      setCameraAssetBindings(parseCameraAssetBindings(deviceBindings));
    };

    void loadCameraBindings();
    const onOrgChange = () => {
      void loadCameraBindings();
    };
    window.addEventListener("vivi:orgchange", onOrgChange);
    return () => {
      mounted = false;
      window.removeEventListener("vivi:orgchange", onOrgChange);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadConfigGroups = async () => {
      const tenantKey = `vivi.configGroups:${getTenantId()}`;
      const groups = await getConfigurationGroups<ConfigGroupLike>();
      if (!mounted) return;
      let source = groups;
      if (groups.length) {
        try {
          window.localStorage.setItem(tenantKey, JSON.stringify(groups));
        } catch {
          // ignore
        }
      } else {
        const stored = window.localStorage.getItem(tenantKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            source = Array.isArray(parsed) ? parsed : [];
          } catch {
            source = [];
          }
        }
      }

      const options = buildConfigGroupOptions(source);
      setConfigGroupOptions(options.length ? options : defaultConfigGroupOptions);
    };
    void loadConfigGroups();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleOrgChange = () => {
      void (async () => {
        const tenantKey = `vivi.configGroups:${getTenantId()}`;
        const groups = await getConfigurationGroups<ConfigGroupLike>();
        let source = groups;
        if (groups.length) {
          try {
            window.localStorage.setItem(tenantKey, JSON.stringify(groups));
          } catch {
            // ignore
          }
        } else {
          const stored = window.localStorage.getItem(tenantKey);
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              source = Array.isArray(parsed) ? parsed : [];
            } catch {
              source = [];
            }
          }
        }

        const options = buildConfigGroupOptions(source);
        setConfigGroupOptions(options.length ? options : defaultConfigGroupOptions);
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
      const tenantKey = `vivi.configGroups:${getTenantId()}`;
      let groups = await getConfigurationGroups<ConfigGroupLike>();
      if (!groups.length) {
        await ensureDefaultConfigGroup();
        groups = await getConfigurationGroups<ConfigGroupLike>();
      }
      if (!mounted) return;
      let source = groups;
      if (groups.length) {
        try {
          window.localStorage.setItem(tenantKey, JSON.stringify(groups));
        } catch {
          // ignore
        }
      } else {
        const stored = window.localStorage.getItem(tenantKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            source = Array.isArray(parsed) ? parsed : [];
          } catch {
            source = [];
          }
        }
      }

      const options = buildConfigGroupOptions(source);
      const finalOptions = options.length ? options : defaultConfigGroupOptions;
      setConfigGroupOptions(finalOptions);
      if (finalOptions.length) {
        setFormValues((current) => {
          if (current.configurationGroup) return current;
          return { ...current, configurationGroup: finalOptions[0].value };
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
      void (async () => {
        try {
          const refreshed = await getAssetsFromApi<Asset>();
          const normalized = normalizeAndDedupeAssets(refreshed as any[]);
          setAssetsData(normalized);
          writeAssetsCache(normalized);
        } catch {
          // Keep current list if refresh fails.
        }
      })();
    };
    window.addEventListener("vivi:orgchange", onOrgChange);
    return () => {
      window.removeEventListener("vivi:orgchange", onOrgChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsData, showAddModal]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const byFilter = assetsData.filter((asset) => matchesFilter(asset, activeFilter));
    if (!q) return byFilter;
    return byFilter.filter((a) => {
      const displayModel = resolveAssetDisplayModel(a);
      const hay = [
        a.assetDescription,
        a.registration,
        a.imei,
        a.fleetNumber,
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
  }, [assetsData, activeFilter, searchQuery]);
  const assetBindingOptions = useMemo(
    () =>
      assetsData
        .map((asset) => ({
          id: String(asset.id ?? "").trim(),
          description: String(asset.assetDescription ?? "").trim(),
          registration: String(asset.registration ?? "").trim()
        }))
        .filter((asset): asset is AssetBindingOption => Boolean(asset.id)),
    [assetsData]
  );

  useEffect(() => {
    setBindingCameraId((current) => {
      if (current && availableCameraIds.includes(current)) return current;
      return availableCameraIds[0] ?? "";
    });
  }, [availableCameraIds]);

  useEffect(() => {
    setBindingAssetId((current) => {
      if (current && assetBindingOptions.some((asset) => asset.id === current)) return current;
      if (editingAssetId && assetBindingOptions.some((asset) => asset.id === editingAssetId)) return editingAssetId;
      return assetBindingOptions[0]?.id ?? "";
    });
  }, [assetBindingOptions, editingAssetId]);
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / ASSETS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * ASSETS_PER_PAGE;
  const pagedAssets = filteredAssets.slice(pageStart, pageStart + ASSETS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const countFor = (label: string) => assetsData.filter((asset) => matchesFilter(asset, label)).length;

  const addCameraAssetBinding = async () => {
    const cameraId = String(bindingCameraId ?? "").trim();
    const assetId = String(bindingAssetId ?? "").trim();
    if (!cameraId || !assetId) {
      setBindingMessage("Select a camera and an asset before binding.");
      return;
    }

    const linkedAsset = assetBindingOptions.find((asset) => asset.id === assetId);
    if (!linkedAsset) {
      setBindingMessage("Selected asset is no longer available.");
      return;
    }

    const next: CameraAssetBinding[] = [
      ...cameraAssetBindings.filter((row) => row.cameraId !== cameraId),
      {
        cameraId,
        assetId,
        assetDescription: linkedAsset.description,
        registration: linkedAsset.registration
      }
    ];
    const stored = await saveCameraAssetBindings(next);
    if (!stored) {
      setBindingMessage("Failed to save binding. Please retry.");
      return;
    }

    setCameraAssetBindings(next);
    setBindingMessage(`Bound ${cameraId} to ${linkedAsset.description || linkedAsset.registration || assetId}.`);
  };

  const removeCameraAssetBinding = async (cameraId: string) => {
    const target = String(cameraId ?? "").trim();
    if (!target) return;

    const next = cameraAssetBindings.filter((row) => row.cameraId !== target);
    const stored = await saveCameraAssetBindings(next);
    if (!stored) {
      setBindingMessage("Failed to remove binding. Please retry.");
      return;
    }

    setCameraAssetBindings(next);
    setBindingMessage(`Unbound ${target}.`);
  };

  const toggleCol = (key: ColumnKey) => {
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
  };

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
    setShowAddModal(true);
  };

  const openEditModal = (asset: Asset) => {
    const stableId = getStableAssetId(asset) || asset.id;
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
      engineNumber: "",
      fuelType: "",
      targetFuel: "",
      fuelTankCapacity: "",
      serialNumber: "",
      additionalMobileDevice: asset.mobileDevice ?? "",
      trackingIcon: "",
      assetColour: "",
      assetStatus: asset.status === "unavailable" ? "Not available" : "Available",
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
      cameraSerial: asset.cameraSerial ?? "",
      faults: ""
    });
    setMobileDeviceRows([
      {
        ...createEmptyMobileDeviceRow(),
        device: String((asset as any).device ?? "").trim(),
        model: String((asset as any).mobileModel ?? "").trim(),
        imei: String(asset.imei ?? "").trim(),
        installed: String((asset as any).installed ?? "").trim(),
        status: String(asset.status ?? "").trim(),
        firmware: String((asset as any).firmware ?? "").trim(),
        standaloneMode: String((asset as any).standaloneMode ?? "").trim().toLowerCase() === "yes" ? "yes" : "no",
        camera: String((asset as any).camera ?? "").trim(),
        cameraModel: String((asset as any).cameraModel ?? "").trim(),
        ...normalizeVc400Protocols(
          (asset as any).cameraModel,
          (asset as any).cameraPositioningProtocol,
          (asset as any).cameraVideoProtocol
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
    setShowAddModal(true);
  };

  const openDuplicateModal = (asset: Asset) => {
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
      assetStatus: asset.status === "unavailable" ? "Not available" : "Available",
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
    setShowAddModal(true);
  };

  const customGroups: { id: string; name: string; assets: number }[] = [];
  const filteredCustomGroups = customGroups.filter((group) =>
    group.name.toLowerCase().includes(customGroupFilter.trim().toLowerCase())
  );
  const driverOptions = [
    "Tumwine Kevin",
    "Wangwe Joel",
    "Said Musa",
    "Asha Kimaro",
    "Peter Mussa",
    "Neema Paul"
  ];

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
      { key: "installed", label: "Installed" },
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
        return String((a as any)[c.key] ?? "");
      })
    );
    downloadCsv(`assets-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const handleRefreshAssets = async (silent = false) => {
    try {
      const refreshed = await getAssetsFromApi<Asset>();
      const normalized = normalizeAndDedupeAssets(refreshed as any[]);
      setAssetsData(normalized);
      writeAssetsCache(normalized);
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
      setAssetsData(refreshed);
      writeAssetsCache(refreshed);
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
    const normalized = normalizeAndDedupeAssets(apiAssets as any[]);
    setAssetsData(normalized);
    writeAssetsCache(normalized);

    const existsByImei = normalized.some((row) => String(row?.imei ?? "").trim() === String(imei ?? "").trim());
    const payloadRegistration = String(payload.registration ?? "").trim().toLowerCase();
    const payloadDescription = String(payload.assetDescription ?? "").trim().toLowerCase();
    const existsByRegistration = Boolean(
      payloadRegistration &&
        normalized.some((row) => String(row?.registration ?? "").trim().toLowerCase() === payloadRegistration)
    );
    const existsByDescription = Boolean(
      payloadDescription &&
        normalized.some((row) => String(row?.assetDescription ?? "").trim().toLowerCase() === payloadDescription)
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      void handleRefreshAssets(true);
    }, 20_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

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
      setAssetsData(apiAssets);
      writeAssetsCache(apiAssets);
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

  const [serviceHistoryRows, setServiceHistoryRows] = useState([
    {
      date: "2025-12-12",
      service: "Scheduled service",
      vendor: "Tanga Auto",
      odometer: "121,420",
      cost: "2,450,000",
      currency: "TZS",
      invoice: "INV-2391",
      notes: "Oil + filters"
    },
    {
      date: "2025-10-03",
      service: "Brake pads",
      vendor: "Peak Garage",
      odometer: "116,008",
      cost: "980,000",
      currency: "TZS",
      invoice: "INV-2214",
      notes: "Front axle"
    }
  ]);

  const [reminderRows, setReminderRows] = useState([
    {
      reminder: "Insurance renewal",
      dueDate: "2026-02-01",
      status: "Due soon",
      cost: "1,200,000",
      currency: "TZS",
      notes: "Annual premium"
    },
    {
      reminder: "Service interval",
      dueDate: "2026-03-15",
      status: "Scheduled",
      cost: "",
      currency: "TZS",
      notes: "Every 15,000 km"
    }
  ]);

  const [fuelRows, setFuelRows] = useState([
    {
      date: "2025-12-18",
      supplier: "TotalEnergies",
      location: "Dar Depot",
      litres: "420",
      pricePerLitre: "3,200",
      total: "1,344,000",
      currency: "TZS",
      odometer: "122,104",
      invoice: "FUEL-0881"
    },
    {
      date: "2025-12-05",
      supplier: "Puma",
      location: "Morogoro",
      litres: "360",
      pricePerLitre: "3,150",
      total: "1,134,000",
      currency: "TZS",
      odometer: "121,010",
      invoice: "FUEL-0804"
    }
  ]);

  const [otherCostRows, setOtherCostRows] = useState([
    {
      date: "2025-11-22",
      category: "Toll fees",
      vendor: "TANROADS",
      cost: "120,000",
      currency: "TZS",
      invoice: "TOLL-331",
      notes: "Up-country"
    },
    {
      date: "2025-09-14",
      category: "Tyres",
      vendor: "Tyre World",
      cost: "1,680,000",
      currency: "TZS",
      invoice: "TYR-558",
      notes: "2 rear tyres"
    }
  ]);

  const [mobileDeviceRows, setMobileDeviceRows] = useState<MobileDeviceRow[]>([createEmptyMobileDeviceRow()]);

  const isSaveDisabled = (() => {
    if (activeAddTab === "Asset details") {
      return Boolean(
        !formValues.assetDescription.trim() ||
          !formValues.assetType.trim() ||
          !formValues.registration.trim() ||
          !formValues.site.trim() ||
          !formValues.make.trim() ||
          !formValues.configurationGroup.trim()
      );
    }
    if (activeAddTab === "Mobile device settings") {
      return Boolean(!mobileDeviceRows[0]?.imei?.trim());
    }
    return false;
  })();

  const [deviceCatalog, setDeviceCatalog] = useState([
    "Vivi4000",
    "ViviMini",
    "ViviPro",
    "Teltonika",
    "Queclink",
    "Concox",
    "Ruptela",
    "CalAmp",
    "SinoTrack",
    "Jimi",
    "TKStar",
    "MeiTrack",
    "Cobblestone",
    "Trackimo",
    "Geotab",
    "Traccar",
    "Omnicomm",
    "Sierra Wireless",
    "Novatel",
    "Suntech",
    "Atrack",
    "Xirgo",
    "Gurtam",
    "GalileoSky",
    "Navixy",
    "Fleet Complete",
    "Digi",
    "Micronet",
    "CareTrack",
    "Jablotron",
    "ATrack",
    "Gosafe",
    "iStartek",
    "Rohde & Schwarz",
    "Honeywell",
    "Trimble",
    "Orbcomm",
    "StarLink",
    "Quectel",
    "U-Blox",
    "Neomatica",
    "Technoton",
    "Argus",
    "Bitrek",
    "Digital Matter",
    "FleetGO",
    "Itron",
    "Gosafe (Meiligao)",
    "Smartrak",
    "Samsara",
    "OneStep GPS",
    "Spireon",
    "Linxup",
    "GpsGate",
    "Autofleet",
    "BCE",
    "Monico",
    "Navtelecom",
    "ATrack",
    "Lacuna",
    "Zonar",
    "Inseego",
    "Topflytech",
    "Navixy X",
    "Wialon"
  ]);

  const [deviceModels, setDeviceModels] = useState<Record<string, string[]>>({
    Vivi4000: ["Vivi4000 Pro", "Vivi4000 Lite"],
    ViviMini: ["ViviMini X", "ViviMini 2"],
    ViviPro: ["ViviPro Max", "ViviPro S"],
    Teltonika: ["FMB920", "FMB130", "FMC650"],
    Queclink: ["GV300", "GV500", "GV600"],
    Concox: ["GT06", "JM-VL103"],
    Ruptela: ["FM-Pro4", "FM-Tco4"],
    CalAmp: ["LMU-2630", "LMU-3640"],
    SinoTrack: ["ST-901", "ST-905"],
    Jimi: ["GV55", "GV75"],
    TKStar: ["TK905", "TK909"],
    MeiTrack: ["T366", "T622"],
    Cobblestone: ["Cobblestone Gen2"],
    Trackimo: ["Trackimo 3G"],
    Geotab: ["GO9", "GO8"],
    Traccar: ["Traccar Client"],
    Omnicomm: ["L-Series"],
    "Sierra Wireless": ["FX30", "FX11"],
    Novatel: ["MiFi 8800"],
    Suntech: ["ST3300", "ST4310"],
    Atrack: ["AX7", "AK11"],
    Xirgo: ["XT63", "XT65"],
    GalileoSky: ["7x", "9x"],
    Navixy: ["X-Box", "Tracker"],
    "Fleet Complete": ["FCG100", "FCG200"],
    Digi: ["IX20", "IX30"],
    Micronet: ["Nexus", "Control"],
    CareTrack: ["GT06N"],
    Jablotron: ["JA-82"],
    "Digital Matter": ["Oyster", "Hawk"],
    Samsara: ["VG34", "VG54"],
    Spireon: ["GoldStar", "FleetLocate"],
    Zonar: ["ZTrak", "V4"],
    Inseego: ["FX2000"],
    Topflytech: ["TLW2", "TLD2"],
    Wialon: ["Wialon Pro"],
    Quectel: ["EC25", "EG25"],
    "U-Blox": ["SARA-R5", "TOBY"],
    Neomatica: ["Galileosky Mini"],
    Technoton: ["DUT-E", "DUT-S"],
    Argus: ["Track L1"],
    Bitrek: ["BI-810"],
    "Navtelecom": ["Smart S-2433"],
    Lacuna: ["Lacuna 1"],
    "OneStep GPS": ["OS-100"],
    "Smartrak": ["SMT-1"],
    "GpsGate": ["Gateway"],
    "Autofleet": ["AutoTrack"],
    "BCE": ["BCE-100"],
    "Monico": ["MoniPro"],
    "Gosafe": ["GS-01"],
    "iStartek": ["VT900"],
    "Rohde & Schwarz": ["R&S Track"],
    "Honeywell": ["HX-20"],
    "Trimble": ["TL200"],
    "Orbcomm": ["OG2", "IDP"],
    "StarLink": ["SL-Tracker"],
    "Itron": ["IT-Track"],
    "Gurtam": ["Wialon App"],
    "Navixy X": ["Navixy X1"],
    "ATrack": ["AX5", "AL11"],
    "FleetGO": ["FG-1"],
    "Gosafe (Meiligao)": ["Meiligao GT30"],
    "LinXup": ["LX-200"]
  });

  const [deviceSearch, setDeviceSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [cameraDeviceSearch, setCameraDeviceSearch] = useState("");
  const [cameraModelSearch, setCameraModelSearch] = useState("");
  const [firmwareOptions, setFirmwareOptions] = useState([
    "v3.2.1",
    "v3.1.8",
    "v3.0.5",
    "v2.9.9"
  ]);
  const [statusOptions, setStatusOptions] = useState(["Online", "Offline", "Deinstalled"]);
  const [cameraCatalog, setCameraCatalog] = useState(["ViviCam", "RoadEye", "MiXVision", "TrackCam", "VisionTrack"]);
  const [cameraModels, setCameraModels] = useState<Record<string, string[]>>({
    ViviCam: ["VC-200", "VC-400"],
    RoadEye: ["RE-1"],
    MiXVision: ["MX-500"],
    TrackCam: ["TC-100"],
    VisionTrack: ["VT-20"]
  });
  const [cameraFirmwareOptions, setCameraFirmwareOptions] = useState(["v1.1.0", "v1.0.4", "v0.9.8"]);

  const [certificateRows, setCertificateRows] = useState([
    {
      certificate: "Hazmat",
      holder: "Tumwine Kevin",
      issued: "2024-04-01",
      expiry: "2026-04-01",
      status: "Valid"
    }
  ]);

  const [licenceRows, setLicenceRows] = useState([
    {
      licence: "Class E",
      holder: "Tumwine Kevin",
      issued: "2023-08-12",
      expiry: "2026-08-12",
      status: "Valid"
    }
  ]);

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
    }
    setDataModalOpen(true);
  };

  const closeDataModal = () => {
    setDataModalOpen(false);
    setDataModalSection(null);
    setDataModalIndex(null);
    setDataDraft({});
  };

  const saveDataModal = () => {
    if (!dataModalSection) return;
    const normalizedDraft = { ...dataDraft };
    if (dataModalSection === "Mobile device settings") {
      const hasCamera = String(normalizedDraft.hasCamera ?? "no").trim().toLowerCase() === "yes";
      const standaloneMode = String(normalizedDraft.standaloneMode ?? "").trim().toLowerCase() === "yes" ? "yes" : "no";
      normalizedDraft.standaloneMode = standaloneMode;
      if (standaloneMode === "yes") {
        normalizedDraft.device = "";
        normalizedDraft.model = "";
        normalizedDraft.installed = "";
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
          normalizedDraft.cameraVideoProtocol
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
    void saveToApi(`assets:data:${dataModalSection}`, {
      section: dataModalSection,
      rows: nextRows,
      updatedAt: new Date().toISOString()
    });
    markTabDirty(dataModalSection);
    closeDataModal();
  };

  const validateMandatoryForTab = (tab: string) => {
    if (tab === "Asset details") {
      if (!formValues.assetDescription.trim()) return "Asset description is required.";
      if (!formValues.assetType.trim()) return "Asset type is required.";
      if (!formValues.registration.trim()) return "Registration number is required.";
      if (!formValues.site.trim()) return "Site is required.";
      if (!formValues.make.trim()) return "Make is required.";
      if (!formValues.configurationGroup.trim()) return "Configuration group is required.";
      return "";
    }
    if (tab === "Mobile device settings") {
      const imei = String(mobileDeviceRows[0]?.imei ?? "").trim();
      const cameraSerial = String(mobileDeviceRows[0]?.cameraSerial ?? "").trim();
      if (!imei && !cameraSerial) return "Either IMEI or Camera serial is required on Mobile device settings.";
      return "";
    }
    return "";
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
    const requiredError = validateMandatoryForTab(activeAddTab);
    if (requiredError) {
      showToast(requiredError, "error");
      return;
    }

    const configGroupReady = await ensureSelectedConfigGroupExists(formValues.configurationGroup);
    if (!configGroupReady) {
      showToast("Unable to prepare configuration group. Please check your login and retry.", "error");
      return;
    }

    const imei = String(mobileDeviceRows[0]?.imei ?? "").trim();
    const cameraSerialFromRow = String(mobileDeviceRows[0]?.cameraSerial ?? "").trim();
    const cameraSerialFromForm = String(formValues.cameraSerial ?? "").trim();
    const cameraSerial = cameraSerialFromRow || cameraSerialFromForm;
    const derivedId =
      String(editingAssetId ?? "").trim() ||
      getStableAssetId({ registration: formValues.registration, imei, cameraSerial, assetId: 0 }) ||
      `asset-${Date.now()}`;
    const assetId = derivedId;
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
      mobileDevice: formValues.additionalMobileDevice || "",
      odometer: formValues.odometer || "",
      engineHours: formValues.engineHours || "",
      lastLocation: formValues.lastLocation || "",
      configUploadDate: formValues.configUploadDate || "",
      configGroup: formValues.configurationGroup || "",
      imsi: formValues.imsi || "",
      msisdn: formValues.msisdn || "",
      cameraSerial: formValues.cameraSerial || "",
      faults: formValues.faults || ""
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
      mobileRow.cameraVideoProtocol
    );

    payload.device = String(mobileRow.device ?? "").trim();
    payload.mobileModel = String(mobileRow.model ?? "").trim();
    payload.installed = String(mobileRow.installed ?? "").trim();
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
        showToast("You are not logged in. Please log in to save changes.", "error");
        navigate("/login");
        return;
      }
      const status = typeof result.status === "number" ? `HTTP ${result.status}` : "";
      const message =
        (result.body && typeof result.body === "object" && (result.body.error || result.body.message)) ||
        result.error ||
        "Unknown error";
      showToast(`Failed to save asset. ${status ? `${status}: ` : ""}${String(message)}`, "error");
      return;
    }

    setLastSaveWasLocal(result.source === "local");

    const serverAssetId = Number((result.body as any)?.assetId ?? 0) || 0;
    const nextPayload = serverAssetId > 0 ? ({ ...payload, assetId: serverAssetId } as Asset) : payload;

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
      const refreshed = await getAssetsFromApi<Asset>();
      if (refreshed.length) {
        const normalized = normalizeAndDedupeAssets(refreshed as any[]);
        setAssetsData(normalized);
        writeAssetsCache(normalized);
      }
    } catch {
      // keep current UI state if refresh fails
    }

    setAssetSaved(true);
    setShowSaveToast(true);
    window.setTimeout(() => {
      setShowSaveToast(false);
    }, 1400);
    clearTabDirty(activeAddTab);
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
  };

  return (
    <div className="assets-layout assets-layout--full">
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
      <div className="assets-toolbar">
        <div className="assets-toolbar-left">
          <span className="assets-toolbar-pill">All</span>
          <span className="assets-toolbar-count">{filteredAssets.length}</span>
        </div>
      </div>

      {(availableCameraIds.length > 0 || cameraAssetBindings.length > 0) && (
        <section className="assets-camera-binding">
          <div className="assets-camera-binding__header">
            <strong>Camera to Asset Binding</strong>
            <span className="assets-camera-binding__hint">
              Map standalone cameras to assets for tracking and video context
            </span>
          </div>
          <div className="assets-camera-binding__controls">
            <select value={bindingCameraId} onChange={(event) => setBindingCameraId(event.target.value)}>
              <option value="">Select camera</option>
              {availableCameraIds.map((cameraId) => (
                <option key={cameraId} value={cameraId}>
                  {cameraId}
                </option>
              ))}
            </select>
            <select value={bindingAssetId} onChange={(event) => setBindingAssetId(event.target.value)}>
              <option value="">Select asset</option>
              {assetBindingOptions.map((asset) => {
                const label = [asset.description, asset.registration].filter(Boolean).join(" - ") || asset.id;
                return (
                  <option key={asset.id} value={asset.id}>
                    {label}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              className="assets-camera-binding__bind"
              onClick={() => void addCameraAssetBinding()}
            >
              Bind
            </button>
          </div>
          {bindingMessage ? <p className="assets-camera-binding__message">{bindingMessage}</p> : null}
          {cameraAssetBindings.length > 0 && (
            <ul className="assets-camera-binding__list">
              {cameraAssetBindings.map((binding) => {
                const currentAsset =
                  assetBindingOptions.find((asset) => asset.id === binding.assetId) ??
                  ({
                    id: binding.assetId,
                    description: binding.assetDescription ?? "",
                    registration: binding.registration ?? ""
                  } as AssetBindingOption);
                const label = [currentAsset.description, currentAsset.registration].filter(Boolean).join(" - ") || currentAsset.id;
                return (
                  <li key={binding.cameraId}>
                    <span>
                      {binding.cameraId} {" -> "} {label}
                    </span>
                    <button
                      type="button"
                      className="assets-camera-binding__unbind"
                      onClick={() => void removeCameraAssetBinding(binding.cameraId)}
                    >
                      Unbind
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <aside className="assets-filter">
        <button
          type="button"
          className={`assets-filter-header${activeFilter === "All" ? " active" : ""}`}
          onClick={() => setActiveFilter("All")}
        >
          <span>All</span>
          <span className="pill-active" style={{ padding: "6px 10px" }}>
            {countFor("All")}
          </span>
        </button>
        {[
          "Available",
          "Not available",
          "No Mobile device",
          "No trips and positions ≥ 5 days",
          "No trips ≥ 5 days",
          "No positions ≥ 5 days",
          "Decommissioned",
          "Reminders due soon",
          "Reminders overdue"
        ].map((label) => (
          <button
            key={label}
            type="button"
            className={`filter-row${activeFilter === label ? " active" : ""}`}
            onClick={() => setActiveFilter(label)}
          >
            <span>{label}</span>
            <span className="count-pill">{countFor(label)}</span>
          </button>
        ))}
      </aside>

      <section className="assets-table-wrap">
        <div className="assets-table-scroll">
          <div className="assets-table-inner">
            <div className="assets-table-head" style={{ gridTemplateColumns: grid }}>
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
                {c.label}
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
                  {columns.map((opt) => (
                    <label key={opt.key} className="columns-option">
                      <input type="checkbox" checked={visibleCols.has(opt.key)} onChange={() => toggleCol(opt.key)} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            </div>
            <div className="assets-table-body">
              {pagedAssets.map((a) => (
                <div key={a.id} className="assets-row" style={{ gridTemplateColumns: grid }}>
                  {activeCols.map((col) => (
                    <div key={col.key} className={`assets-cell${centeredColumns.has(col.key) ? " is-center" : ""}`}>
                      {col.key === "assetDescription" ? (
                        (() => {
                          const status = getDotStatus(a);
                          return (
                            <span className="assets-cell--asset-description">
                              {shouldShowStatusDot(a) ? <span className={`status-dot status-${status}`} /> : null}
                          {canEditAssets ? (
                            <button
                              type="button"
                              className={`assets-asset-description-btn status-${status}`}
                              onClick={() => openEditModal(a)}
                              aria-label={`Edit ${displayValue(a[col.key as keyof Asset])}`}
                            >
                              {displayValue(a[col.key as keyof Asset])}
                            </button>
                          ) : (
                            <span className={`assets-asset-description-text status-${status}`}>{displayValue(a[col.key as keyof Asset])}</span>
                          )}
                        </span>
                          );
                        })()
                      ) : col.key === "infoIssued" ? (
                        getInfoIssued(a) ? "Yes" : "No"
                      ) : col.key === "lastPosition" || col.key === "lastTrip" ? (
                        (() => {
                          const tz = resolveTimeZoneForSite(String(a.site ?? ""), siteTimeZones);
                          const raw = a[col.key as "lastPosition" | "lastTrip"];
                          const formatted = siteTimeZones ? formatTimestampWithZone(raw, tz) : formatTimestamp(raw);
                          return formatted ? formatted : "";
                        })()
                      ) : col.key === "model" ? (
                        displayValue(resolveAssetDisplayModel(a))
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
                          ...(canEditAssets ? [{ label: "Edit", icon: <EditIcon /> }] : []),
                          ...(canEditAssets ? [{ label: "Duplicate", icon: <ReportIcon /> }] : []),
                          ...(canEditAssets ? [{ label: "Commission asset", icon: <SettingsIcon /> }] : []),
                          ...(canEditAssets ? [{ label: "Confirm data received", icon: <QueryIcon /> }] : []),
                          { label: "Show on historical tracking", icon: <PinsIcon /> },
                          { label: "Show on trip timeline", icon: <TimelineIcon /> },
                          { label: "Diagnostics", icon: <QueryIcon /> },
                          { label: "Resend commissioning SMS", icon: <CompassIcon /> },
                          ...(canDeleteAssets ? [{ label: "Delete", icon: <QueryIcon /> }] : [])
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            className="assets-row-menu-item"
                            role="menuitem"
                            onClick={() => {
                              setOpenRowMenu(null);
                              if (item.label === "Edit") {
                                openEditModal(a);
                              } else if (item.label === "Duplicate") {
                                openDuplicateModal(a);
                              } else if (item.label === "Delete") {
                              const id = String(a.id ?? "").trim();
                              const imei = String(a.imei ?? "").trim();
                              const registration = String(a.registration ?? "").trim();
                              if (!id && !imei && !registration) return;
                              const ok = window.confirm(`Delete asset "${String(a.assetDescription ?? id)}"? This cannot be undone.`);
                              if (!ok) return;
                              (async () => {
                                try {
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
                                  const params = new URLSearchParams();
                                  if (id) params.set("id", id);
                                  if (imei) params.set("imei", imei);
                                  if (registration) params.set("registration", registration);
                                  const url = buildApiUrl(`/d1/assets?${params.toString()}`);
                                  const res = await fetch(url, {
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
                                    const msg = (body && (body.error || body.message)) || text || `HTTP ${res.status}`;
                                    showToast(`Delete failed: ${String(msg)}`, "error");
                                    return;
                                  }
                                  setAssetsData((current) =>
                                    current.filter((x) => {
                                      const xid = String((x as any).id ?? "").trim();
                                      const ximei = String((x as any).imei ?? "").trim();
                                      const xreg = String((x as any).registration ?? "").trim();
                                      if (id && xid === id) return false;
                                      if (imei && ximei === imei) return false;
                                      if (registration && xreg === registration) return false;
                                      return true;
                                    })
                                  );
                                  showToast("Asset deleted.", "success");
                                } catch (e: any) {
                                  showToast(`Delete failed: ${String(e?.message ?? e)}`, "error");
                                }
                              })();
                              } else if (item.label === "Show on trip timeline") {
                              const assetLabel = `${a.assetDescription} - ${a.registration}`;
                              const assetImei = String(a.imei ?? "").trim();
                              localStorage.setItem("vivi.activeAsset", assetLabel);
                              localStorage.setItem("vivi.activeRegistration", displayValue(a.registration));
                              if (assetImei) localStorage.setItem("vivi.activeImei", assetImei);
                              localStorage.setItem("vivi.activeSite", displayValue(a.site));
                              localStorage.removeItem("vivi.contextType");
                              localStorage.removeItem("vivi.contextName");
                              localStorage.removeItem("vivi.contextOptions");
                              window.dispatchEvent(new Event("vivi:contextchange"));
                              navigate("/Track/activity/trip-timeline");
                              } else if (item.label === "Show on historical tracking") {
                              const assetLabel = `${a.assetDescription} - ${a.registration}`;
                              const assetImei = String(a.imei ?? "").trim();
                              localStorage.setItem("vivi.activeAsset", assetLabel);
                              localStorage.setItem("vivi.activeRegistration", displayValue(a.registration));
                              if (assetImei) localStorage.setItem("vivi.activeImei", assetImei);
                              localStorage.setItem("vivi.activeSite", displayValue(a.site));
                              localStorage.setItem("vivi.historyTime", new Date().toISOString().slice(0, 16));
                              localStorage.removeItem("vivi.contextType");
                              localStorage.removeItem("vivi.contextName");
                              localStorage.removeItem("vivi.contextOptions");
                              window.dispatchEvent(new Event("vivi:contextchange"));
                              navigate("/Track/tracking/historical");
                              } else if (item.label === "Diagnostics") {
                              setDiagnosticsAsset(a);
                              setDiagnosticsOpen({
                                assetDetails: true,
                                mobileDevice: true,
                                tripInfo: false,
                                latestPosition: false
                              });
                              setShowDiagnosticsModal(true);
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

                              showToast("Asset commissioning: syncing asset…", "info");

                              (async () => {
                                const syncResult = await syncAssetForCommission(a, imei);
                                if (!syncResult.ok) {
                                  showToast(String(syncResult.error ?? "Cannot commission this asset."), "error");
                                  return;
                                }

                                showToast("Asset commissioning: compiling and queuing settings…", "info");
                                const result = await commissionDeviceDetailed(imei);
                                if (!result.queued) {
                                  showToast(`Asset commissioning failed: ${result.error ?? "Unknown error"}`, "error");
                                  return;
                                }
                                showToast("Commissioning confirmed. Settings queued.", "success");
                                if (result.kickQueued) {
                                  showToast("Telemetry wake-up command sent to device.", "success");
                                } else if (result.kickError) {
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

                                showToast("Commissioning complete. Waiting for first telemetry…", "info");
                                let telemetryConfirmed = false;
                                let telemetryLastAt = "";
                                for (let attempt = 0; attempt < 5; attempt += 1) {
                                  const telemetry = await confirmTelemetryForImei(imei);
                                  if (telemetry.ok && telemetry.received) {
                                    telemetryConfirmed = true;
                                    telemetryLastAt = String(telemetry.lastAt ?? "");
                                    break;
                                  }
                                  if (attempt < 4) {
                                    await new Promise((resolve) => window.setTimeout(resolve, 6000));
                                  }
                                }

                                if (telemetryConfirmed) {
                                  showToast(
                                    telemetryLastAt
                                      ? `Telemetry confirmed (last: ${telemetryLastAt}).`
                                      : "Telemetry confirmed.",
                                    "success"
                                  );
                                } else {
                                  showToast(
                                    "Commissioning saved. Telemetry not received yet—device should report shortly.",
                                    "info"
                                  );
                                }
                                const apiAssets = await getAssetsFromApi<Asset>();
                                if (apiAssets.length) {
                                  const normalized = normalizeAndDedupeAssets(apiAssets as any[]);
                                  setAssetsData(normalized);
                                  writeAssetsCache(normalized);
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
                                    const normalized = normalizeAndDedupeAssets(apiAssets as any[]);
                                    setAssetsData(normalized);
                                    writeAssetsCache(normalized);
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
                                  const normalized = normalizeAndDedupeAssets(apiAssets as any[]);
                                  setAssetsData(normalized);
                                  writeAssetsCache(normalized);
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
              {pagedAssets.length === 0 ? <div className="assets-empty">No assets to display.</div> : null}
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
                  disabled={isSaveDisabled}
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
                {activeAddTab === "Asset details" && (
                  <>
                    <h3>Asset details</h3>
                    <div className="assets-add-grid">
                      <label>
                        Asset description <span>*</span>
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.assetDescription}
                          onChange={(e) => updateField("assetDescription", e.target.value)}
                        />
                      </label>
                      <label>
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
                      <label>
                        Registration number <span>*</span>
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.registration}
                          onChange={(e) => updateField("registration", e.target.value)}
                        />
                      </label>
                      <label>
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
                      <label>
                        Configuration group
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
                        Fleet number
                        <input
                          type="text"
                          placeholder=""
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
                      <label>
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
                          <input
                            type="text"
                            placeholder=""
                            value={formValues.additionalMobileDevice}
                            onChange={(e) => updateField("additionalMobileDevice", e.target.value)}
                          />
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
                    <h3>Asset status</h3>
                    <div className="assets-add-section">
                      <div className="assets-add-section-title">Current asset status</div>
                      <label>
                        <select
                          value={formValues.assetStatus}
                          onChange={(e) => updateField("assetStatus", e.target.value)}
                        >
                          <option value="Available">Available</option>
                          <option value="Not available">Not available</option>
                          <option value="Decommissioned">Decommissioned</option>
                        </select>
                      </label>
                    </div>
                    <div className="assets-add-section">
                      <div className="assets-add-section-title">Expiry date</div>
                      <label>
                        <input
                          type="radio"
                          name="expiryMode"
                          checked={formValues.expiryMode === "date"}
                          onChange={() => updateField("expiryMode", "date")}
                        />
                        On specified date
                      </label>
                      <input
                        type="date"
                        value={formValues.expiryDate}
                        onChange={(e) => updateField("expiryDate", e.target.value)}
                        disabled={formValues.expiryMode !== "date"}
                      />
                      <label>
                        <input
                          type="radio"
                          name="expiryMode"
                          checked={formValues.expiryMode === "never"}
                          onChange={() => updateField("expiryMode", "never")}
                        />
                        Never
                      </label>
                    </div>
                    <div className="assets-add-section">
                      <label>
                        <textarea
                          rows={3}
                          placeholder=""
                          value={formValues.statusNotes}
                          onChange={(e) => updateField("statusNotes", e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="assets-add-section">
                      <small>
                        This asset status was last changed to '{formValues.assetStatus}' on 25/06/2024 13:49 (EAT) by
                        MUSISI JOEL
                      </small>
                      <small>This asset was created on 25/06/2024 13:49 (EAT) by MUSISI JOEL</small>
                    </div>
                  </>
                )}

                {activeAddTab === "Custom groups" && (
                  <>
                    <h3>Custom groups</h3>
                    <div className="assets-add-section">
                      <small>Select the custom groups that this asset should be assigned to</small>
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
                    <h3>Access control</h3>
                    <div className="assets-add-section">
                      <label className="assets-add-checkbox">
                        <input
                          type="checkbox"
                          checked={formValues.hasDefaultDriver}
                          onChange={(e) => updateField("hasDefaultDriver", e.target.checked)}
                        />
                        Asset has a default driver
                      </label>
                    </div>
                    <div className="assets-add-section">
                      <label>
                        Default driver name <span>*</span>
                        <select
                          value={formValues.defaultDriver}
                          onChange={(e) => updateField("defaultDriver", e.target.value)}
                          disabled={!formValues.hasDefaultDriver}
                        >
                          <option value="">Select a driver</option>
                          {driverOptions.map((driver) => (
                            <option key={driver} value={driver}>
                              {driver}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </>
                )}

                {activeAddTab !== "Asset details" && activeAddTab !== "Asset status" && activeAddTab !== "Custom groups" && activeAddTab !== "Access control" && (
                  <>
                    <h3>{activeAddTab}</h3>
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
                      <div className="assets-data-card">
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
                                    "Installed",
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
                                    row.installed,
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

                                showToast("Asset commissioning: syncing asset…", "info");
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
                                    mobileDevice: formValues.additionalMobileDevice || "",
                                    odometer: formValues.odometer || "",
                                    engineHours: formValues.engineHours || "",
                                    lastLocation: formValues.lastLocation || "",
                                    configUploadDate: formValues.configUploadDate || "",
                                    configGroup: configGroup || "",
                                    imsi: formValues.imsi || "",
                                    msisdn: formValues.msisdn || "",
                                    device: String(mobileRow.device ?? "").trim(),
                                    mobileModel: String(mobileRow.model ?? "").trim(),
                                    installed: String(mobileRow.installed ?? "").trim(),
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
                                    showToast(String(syncResult.error ?? "Cannot commission this asset."), "error");
                                    return;
                                  }

                                  setLastSaveWasLocal(false);
                                  setAssetSaved(true);

                                  showToast("Asset commissioning: compiling and queuing settings…", "info");
                                  const result = await commissionDeviceDetailed(imei);
                                  if (!result.queued) {
                                    showToast(`Asset commissioning failed: ${result.error ?? "Unknown error"}`, "error");
                                    return;
                                  }
                                  showToast("Commissioning confirmed. Settings queued.", "success");
                                  if (result.kickQueued) {
                                    showToast("Telemetry wake-up command sent to device.", "success");
                                  } else if (result.kickError) {
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

                                  showToast("Commissioning complete. Waiting for first telemetry…", "info");
                                  let telemetryConfirmed = false;
                                  let telemetryLastAt = "";
                                  for (let attempt = 0; attempt < 5; attempt += 1) {
                                    const telemetry = await confirmTelemetryForImei(imei);
                                    if (telemetry.ok && telemetry.received) {
                                      telemetryConfirmed = true;
                                      telemetryLastAt = String(telemetry.lastAt ?? "");
                                      break;
                                    }
                                    if (attempt < 4) {
                                      await new Promise((resolve) => window.setTimeout(resolve, 6000));
                                    }
                                  }

                                  if (telemetryConfirmed) {
                                    showToast(
                                      telemetryLastAt
                                        ? `Telemetry confirmed (last: ${telemetryLastAt}).`
                                        : "Telemetry confirmed.",
                                      "success"
                                    );
                                  } else {
                                    showToast(
                                      "Commissioning saved. Telemetry not received yet—device should report shortly.",
                                      "info"
                                    );
                                  }
                                })();
                              }}
                              title="Compile and queue settings for this IMEI, then prompt the device to communicate"
                            >
                              Commission
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Device</div>
                            <div className="assets-data-cell">Model</div>
                            <div className="assets-data-cell">IMEI</div>
                            <div className="assets-data-cell">Installed</div>
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
                                <div className="assets-data-cell">{row.installed}</div>
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
                            onClick={() => {
                              const next = window.prompt("Add device");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setDeviceCatalog((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setDeviceModels((current) =>
                                current[trimmed] ? current : { ...current, [trimmed]: [] }
                              );
                              setDataDraft((current) => ({ ...current, device: trimmed, model: "" }));
                            }}
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
                              const device = dataDraft.device ?? "";
                              if (!device) return;
                              const next = window.prompt("Add model");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setDeviceModels((current) => ({
                                ...current,
                                [device]: current[device]?.includes(trimmed)
                                  ? current[device]
                                  : [...(current[device] ?? []), trimmed]
                              }));
                              setDataDraft((current) => ({ ...current, model: trimmed }));
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
                      <label>
                        IMEI
                        <input
                          type="text"
                          value={dataDraft.imei ?? ""}
                          onChange={(event) =>
                            setDataDraft((current) => ({ ...current, imei: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Installed
                        <input
                          type="text"
                          value={dataDraft.installed ?? ""}
                          onChange={(event) =>
                            setDataDraft((current) => ({ ...current, installed: event.target.value }))
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
                            onClick={() => {
                              const next = window.prompt("Add status");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setStatusOptions((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setDataDraft((current) => ({ ...current, status: trimmed }));
                            }}
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
                            onClick={() => {
                              const next = window.prompt("Add firmware version");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setFirmwareOptions((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setDataDraft((current) => ({ ...current, firmware: trimmed }));
                            }}
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
                                installed: "",
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
                            onClick={() => {
                              const next = window.prompt("Add camera");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setCameraCatalog((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setCameraModels((current) =>
                                current[trimmed] ? current : { ...current, [trimmed]: [] }
                              );
                              setDataDraft((current) => ({ ...current, camera: trimmed, cameraModel: "" }));
                            }}
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
                                  current.cameraVideoProtocol
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
                              const camera = dataDraft.camera ?? "";
                              if (!camera) return;
                              const next = window.prompt("Add camera model");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setCameraModels((current) => ({
                                ...current,
                                [camera]: current[camera]?.includes(trimmed)
                                  ? current[camera]
                                  : [...(current[camera] ?? []), trimmed]
                              }));
                              setDataDraft((current) => {
                                const protocols = normalizeVc400Protocols(
                                  trimmed,
                                  current.cameraPositioningProtocol,
                                  current.cameraVideoProtocol
                                );
                                return {
                                  ...current,
                                  cameraModel: trimmed,
                                  cameraPositioningProtocol: protocols.cameraPositioningProtocol,
                                  cameraVideoProtocol: protocols.cameraVideoProtocol
                                };
                              });
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
                        <small>Select additional cameras to activate in Live Video (Forward, DMS and In cab stay active).</small>
                      </label>
                      <label>
                        Camera serial
                        <input
                          type="text"
                          value={dataDraft.cameraSerial ?? ""}
                          onChange={(event) =>
                            setDataDraft((current) => ({ ...current, cameraSerial: event.target.value }))
                          }
                        />
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
                            onClick={() => {
                              const next = window.prompt("Add status");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setStatusOptions((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setDataDraft((current) => ({ ...current, cameraStatus: trimmed }));
                            }}
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
                            onClick={() => {
                              const next = window.prompt("Add camera firmware");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setCameraFirmwareOptions((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setDataDraft((current) => ({ ...current, cameraFirmware: trimmed }));
                            }}
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
                        <input
                          type="text"
                          value={dataDraft[field.key] ?? ""}
                          onChange={(event) =>
                            setDataDraft((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {showSaveToast && (
        <div className="assets-save-toast" role="status" aria-live="polite">
          {lastSaveWasLocal ? "Saved locally (backend offline)" : "Changes Successfully Saved"}
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
                    <div className="diagnostics-row"><span>Site</span><span>{diagnosticsAsset.site}</span></div>
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
                        <div className="diagnostics-row"><span>Mobile device</span><span>{displayValue(rowFromAsset?.device ?? anyAsset?.mobileDevice ?? anyAsset?.device ?? "")}</span></div>
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
                    return (
                      <div className="diagnostics-table">
                        <div className="diagnostics-row"><span>Trip mode</span><span>{displayValue(anyAsset?.tripMode ?? "Out of Trip")}</span></div>
                        <div className="diagnostics-row"><span>Driver</span><span>{displayValue(anyAsset?.defaultDriver ?? anyAsset?.driver ?? anyAsset?.assignedDriver ?? "")}</span></div>
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
                      const sats = io["Number of Satellites"] ?? io["Satellites"];
                      const heading = io["Heading"];
                      return (
                        <>
                          <div className="diagnostics-row"><span>Date and time of last AVL</span><span>{lastSeen || ""}</span></div>
                          <div className="diagnostics-row"><span>Longitude</span><span>{lng || ""}</span></div>
                          <div className="diagnostics-row"><span>Latitude</span><span>{lat || ""}</span></div>
                          <div className="diagnostics-row"><span>GPS velocity</span><span>{typeof speed !== "undefined" ? `${String(speed)} km/h` : ""}</span></div>
                          <div className="diagnostics-row"><span>Heading</span><span>{typeof heading !== "undefined" ? String(heading) : ""}</span></div>
                          <div className="diagnostics-row"><span>Number of satellites</span><span>{typeof sats !== "undefined" ? String(sats) : ""}</span></div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
