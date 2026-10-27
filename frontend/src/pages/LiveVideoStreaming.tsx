import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  connectCmsv6Sso,
  createLiveVideoSession,
  getAssetsFromApi,
  getBindings,
  getCamerasFromApi,
  peekCachedAssets,
  callCmsv6,
  saveBinding,
  type Cmsv6Vehicle,
  type LiveVideoSessionResponse
} from "../utils/api";
import { subscribeScopeChange } from "../utils/tenantContext";
import {
  cms808HierarchyActive,
  isCms808PlayerUrl,
  isCms808StreamId,
  loadCms808LiveStream,
  loadCms808VehiclesForActiveHierarchy
} from "../utils/cms808";
import { isCms808Server } from "../utils/regionServers";
import {
  matchesStoredSiteSelection,
  normalizeSelectionText,
  readScopeNaming,
  readStoredSelectionScope
} from "../utils/selectionScope";
import { filterRecordsForActiveSelection } from "../utils/scopeStorage";
import IntercomSessionPopup, { type IntercomTarget } from "../components/IntercomSessionPopup";
import "../index.css";

type StreamAsset = {
  id: string;
  streamId: string;
  description: string;
  registration: string;
  channelCount: number;
  channelLabels: string[];
  activeChannelKeys?: string[];
  liveEnabled?: boolean;
  source: "asset" | "camera";
  cameraId?: string;
};

type AssetOption = {
  id: string;
  description: string;
  registration: string;
};

type CameraOption = {
  id: string;
  label: string;
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

const CAMERA_BINDINGS_ID = "camera-asset-bindings";

type StreamPopupState = {
  assetId: string;
  cameraId?: string;
  assetDescription: string;
  registration: string;
  channelNumber: number;
  channelKey: string;
  channelLabel: string;
  status: "connecting" | "verifying" | "connected" | "failed";
  startedAtMs: number;
  remainingSeconds: number;
  streamUrl?: string;
  token?: string;
  message?: string;
  playerKind?: "video" | "iframe";
};

type VideoRequestState = {
  asset: StreamAsset;
  from: string;
  to: string;
  channel: number;
  channelLabel: string;
};

const STREAM_CONNECT_TIMEOUT_SECONDS = 45;

const initialAssets: StreamAsset[] = [];

const FALLBACK_CHANNEL_LABELS = [
  "Road Cam",
  "Incab",
  "DMS",
  "External L",
  "External R",
  "Camera 6",
  "Camera 7",
  "Camera 8",
  "Camera 9",
  "Camera 10"
];

const DEFAULT_ACTIVE_CHANNEL_LABELS = ["Road Cam", "Incab", "DMS"];
const ADDITIONAL_COMPONENT_LABELS = ["External L", "External R"];

const isNonEmptyValue = (value: unknown) => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;
  return raw !== "-" && raw !== "--" && raw !== "n/a" && raw !== "na" && raw !== "none" && raw !== "null" && raw !== "undefined";
};

const toPositiveInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
};

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;
  return raw === "true" || raw === "yes" || raw === "1" || raw === "on";
};

const normalizeChannelKey = (value: unknown) => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const normalizeChannelLabel = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = normalizeChannelKey(raw);
  if (key === "adas") return "Forward";
  if (key === "dms") return "DMS";
  if (key === "incab" || key === "in-cab") return "In cab";
  if (key === "external-l" || key === "external-left" || key === "left-external" || key === "ext-l" || key === "ext-left") return "External L";
  if (key === "external-r" || key === "external-right" || key === "right-external" || key === "ext-r" || key === "ext-right") return "External R";
  if (key === "forward" || key === "front") return "Forward";
  return raw;
};

const parseAdditionalComponents = (value: unknown) => {
  const allowed = new Set(ADDITIONAL_COMPONENT_LABELS.map((label) => normalizeChannelKey(label)));
  const push = (target: string[], label: unknown) => {
    const normalized = normalizeChannelLabel(label);
    if (!normalized) return;
    const key = normalizeChannelKey(normalized);
    if (!key || !allowed.has(key) || target.includes(key)) return;
    target.push(key);
  };

  const parsed: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item) => push(parsed, item));
    return parsed;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return parsed;
  raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => push(parsed, item));
  return parsed;
};

const extractChannelLabels = (row: Record<string, unknown>) => {
  const labels: string[] = [];
  const arrayCandidates = [row.channelNames, row.selectedChannels, row.cameraChannelsSelected];
  for (const candidate of arrayCandidates) {
    if (!Array.isArray(candidate)) continue;
    for (const label of candidate) {
      const next = normalizeChannelLabel(label);
      if (!next || labels.includes(next)) continue;
      labels.push(next);
    }
  }

  const fieldCandidates: Array<[unknown, string]> = [
    [row.forward, "Forward"],
    [row.forwardCamera, "Forward"],
    [row.adas, "Forward"],
    [row.adasCamera, "Forward"],
    [row.dms, "DMS"],
    [row.dmsCamera, "DMS"],
    [row.inCab, "In cab"],
    [row.inCabCamera, "In cab"],
    [row.externalL, "External L"],
    [row.externalLeft, "External L"],
    [row.externalLeftCamera, "External L"],
    [row.extL, "External L"],
    [row.externalR, "External R"],
    [row.externalRight, "External R"],
    [row.externalRightCamera, "External R"],
    [row.extR, "External R"]
  ];
  for (const [value, label] of fieldCandidates) {
    if (!isNonEmptyValue(value)) continue;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
};

const isCommissionedAsset = (asset: Record<string, unknown>) => {
  const hasConfigGroup = isNonEmptyValue(asset.configGroup ?? asset.configurationGroup);
  return hasConfigGroup && hasAttachedCamera(asset);
};

const isStandaloneAsset = (asset: Record<string, unknown>) => {
  return String(asset.standaloneMode ?? "").trim().toLowerCase() === "yes";
};

const isCommissionedCamera = (camera: Record<string, unknown>) => {
  const commissionedFlag = toBoolean(
    camera.commissioned
      ?? camera.isCommissioned
      ?? camera.commissioningComplete
      ?? camera.liveEnabled
  );
  const status = String(camera.status ?? camera.cameraStatus ?? "").trim().toLowerCase();
  const hasConfigGroup = isNonEmptyValue(camera.configGroup ?? camera.configurationGroup);
  const hasIdentity = isNonEmptyValue(camera.cameraSerial) || isNonEmptyValue(camera.cameraId ?? camera.id);
  return Boolean(
    hasIdentity
      && (commissionedFlag
        || hasConfigGroup
        || status === "commissioned"
        || status === "online"
        || status === "active")
  );
};

/** Camera must be installed/attached in commissioning — GPS IMEI alone is not enough. */
const hasAttachedCamera = (asset: Record<string, unknown>) => {
  const explicit = String(asset.hasCamera ?? asset.cameraAdded ?? asset.hasCameraDevice ?? "").trim().toLowerCase();
  if (["yes", "true", "1", "on"].includes(explicit)) return true;
  if (toBoolean(asset.hasCamera ?? asset.cameraAdded ?? asset.hasCameraDevice)) return true;
  return [
    asset.cameraSerial,
    asset.camera,
    asset.cameraModel,
    asset.cameraStatus,
    asset.cameraFirmware,
    asset.cameraDevice,
    asset.cameraType,
    asset.devIdno,
    asset.deviceId,
    asset.forward,
    asset.forwardCamera,
    asset.inCab,
    asset.inCabCamera,
    asset.camera3,
    asset.camera4,
    asset.camera5,
    asset.camera6,
    asset.camera7,
    asset.camera8,
    asset.camera9,
    asset.camera10
  ].some(isNonEmptyValue);
};

/** Keep live video rows inside the active site + database hierarchy only. */
const matchesLiveVideoHierarchy = (row: Record<string, unknown>) => {
  const selection = readStoredSelectionScope();
  if (!matchesStoredSiteSelection(row.site, selection)) return false;
  const naming = readScopeNaming();
  const expectedDb = normalizeSelectionText(naming.database);
  const rowDb = normalizeSelectionText(row.database ?? row.organisation ?? row.contact);
  if (expectedDb && rowDb && rowDb !== expectedDb) return false;
  if ((selection.scope === "site" || selection.scope === "asset" || selection.scope === "db") && !normalizeSelectionText(row.site)) {
    return false;
  }
  return true;
};

const resolveChannelCount = (asset: Record<string, unknown>) => {
  const numericCandidates = [
    asset.cameraChannels,
    asset.channels,
    asset.channelCount,
    asset.numberOfChannels,
    asset.noOfChannels,
    asset.selectedChannelsCount
  ];
  for (const candidate of numericCandidates) {
    const count = toPositiveInteger(candidate);
    if (count > 0) return Math.min(count, 16);
  }

  const arrayCandidates = [asset.channelNames, asset.selectedChannels, asset.cameraChannelsSelected];
  for (const candidate of arrayCandidates) {
    if (Array.isArray(candidate) && candidate.length) return Math.min(candidate.length, 16);
  }

  const legacyFields = [
    asset.forward,
    asset.forwardCamera,
    asset.adas,
    asset.adasCamera,
    asset.dms,
    asset.dmsCamera,
    asset.inCab,
    asset.inCabCamera,
    asset.externalL,
    asset.externalLeft,
    asset.externalLeftCamera,
    asset.extL,
    asset.externalR,
    asset.externalRight,
    asset.externalRightCamera,
    asset.extR,
    asset.camera3,
    asset.camera4,
    asset.camera5,
    asset.camera6,
    asset.camera7,
    asset.camera8,
    asset.camera9,
    asset.camera10
  ];
  const legacyCount = legacyFields.filter(isNonEmptyValue).length;
  if (legacyCount > 0) return Math.min(legacyCount, 16);

  return 0;
};

const toStreamAsset = (asset: Record<string, unknown>): StreamAsset | null => {
  if (!matchesLiveVideoHierarchy(asset)) return null;
  if (!hasAttachedCamera(asset)) return null;
  if (!isCommissionedAsset(asset) && !(isStandaloneAsset(asset) && isNonEmptyValue(asset.cameraSerial))) return null;

  const derivedLabels = extractChannelLabels(asset);
  const additionalComponentKeys = parseAdditionalComponents(
    asset.cameraComponents ?? asset.cameraChannelsSelected ?? asset.selectedChannels
  );
  const activeChannelKeys = Array.from(
    new Set([
      ...DEFAULT_ACTIVE_CHANNEL_LABELS.map((label) => normalizeChannelKey(label)),
      ...additionalComponentKeys
    ])
  ).filter(Boolean);
  const channelCount = Math.max(
    isStandaloneAsset(asset) ? 1 : 0,
    resolveChannelCount(asset),
    derivedLabels.length
  );
  if (channelCount < 1) return null;

  return {
    id: String(asset.id ?? asset.assetId ?? asset.registration ?? asset.assetDescription ?? Math.random()),
    streamId: `asset:${String(asset.id ?? asset.assetId ?? asset.registration ?? asset.assetDescription ?? Math.random())}`,
    description: String(asset.assetDescription ?? asset.description ?? asset.name ?? ""),
    registration: String(asset.registration ?? asset.registrationNumber ?? ""),
    channelCount,
    channelLabels: derivedLabels,
    activeChannelKeys,
    liveEnabled: Boolean(asset.aiDevice ?? asset.isAiDevice ?? true),
    source: "asset",
    cameraId: String(asset.cameraSerial ?? asset.cameraId ?? asset.devIdno ?? "").trim() || undefined
  };
};

const toStandaloneCameraStreamAsset = (
  camera: Record<string, unknown>,
  bindingsByCameraId: Map<string, CameraAssetBinding>
): StreamAsset | null => {
  if (!matchesLiveVideoHierarchy(camera)) return null;
  if (!isCommissionedCamera(camera)) return null;
  const cameraId = String(camera.cameraId ?? camera.id ?? "").trim();
  if (!cameraId) return null;
  const linkedAsset = bindingsByCameraId.get(cameraId);
  if (linkedAsset?.assetId) return null;

  const derivedLabels = extractChannelLabels(camera);
  const channelCount = Math.max(3, Math.min(resolveChannelCount(camera) || 1, 16), derivedLabels.length);
  const description = String(
    linkedAsset?.assetDescription
      ?? camera.assetDescription
      ?? camera.name
      ?? camera.cameraName
      ?? camera.deviceName
      ?? camera.cameraModel
      ?? `Camera ${cameraId}`
  ).trim();
  const registration = String(linkedAsset?.registration ?? camera.registration ?? camera.registrationNumber ?? cameraId).trim();

  return {
    id: cameraId,
    streamId: `camera:${cameraId}`,
    description: description || `Camera ${cameraId}`,
    registration: registration || cameraId,
    channelCount,
    channelLabels: derivedLabels,
    liveEnabled: toBoolean(camera.liveEnabled ?? camera.online ?? true),
    source: "camera",
    cameraId
  };
};

const toCms808StreamAsset = (row: Cmsv6Vehicle): StreamAsset | null => {
  const cameraId = String(row.devIdno ?? row.deviceId ?? "").trim();
  if (!cameraId) return null;
  const names = (Array.isArray(row.channelNames) ? row.channelNames : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  const channelCount = Math.max(Number(row.channels) || 0, names.length, 5);
  const plate = String(row.vehiIdno ?? cameraId).trim();
  return {
    id: cameraId,
    streamId: `cms808:${cameraId}`,
    description: plate,
    registration: plate,
    channelCount,
    channelLabels: Array.from({ length: channelCount }, (_, index) => getChannelLabel(index + 1)),
    liveEnabled: true,
    source: "camera",
    cameraId
  };
};

const mergeStreamAssets = (items: StreamAsset[]) => {
  const merged = new Map<string, StreamAsset>();
  for (const item of items) {
    const current = merged.get(item.id);
    if (!current) {
      merged.set(item.id, item);
      continue;
    }
    merged.set(item.id, {
      ...current,
      description: current.description || item.description,
      registration: current.registration || item.registration,
      channelCount: Math.max(current.channelCount, item.channelCount),
      liveEnabled: current.liveEnabled || item.liveEnabled
    });
  }
  return Array.from(merged.values());
};

const getChannelLabel = (channelNumber: number) => {
  const idx = channelNumber - 1;
  return FALLBACK_CHANNEL_LABELS[idx] ?? `Camera ${channelNumber}`;
};

type LiveVideoStreamingProps = {
  embed?: boolean;
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

const createBindingsMap = (mappings: CameraAssetBinding[]) => {
  const byCameraId = new Map<string, CameraAssetBinding>();
  mappings.forEach((row) => {
    if (row.cameraId) byCameraId.set(row.cameraId, row);
  });
  return byCameraId;
};

const saveCameraAssetBindings = async (mappings: CameraAssetBinding[]) => {
  return saveBinding("devices", {
    id: CAMERA_BINDINGS_ID,
    name: "Camera Asset Bindings",
    mappings
  });
};

export default function LiveVideoStreaming({ embed = false }: LiveVideoStreamingProps) {
  const navigate = useNavigate();
  const [streamAssets, setStreamAssets] = useState<StreamAsset[]>(initialAssets);
  const [allAssets, setAllAssets] = useState<AssetOption[]>([]);
  const [allStandaloneCameras, setAllStandaloneCameras] = useState<CameraOption[]>([]);
  const [cameraAssetBindings, setCameraAssetBindings] = useState<CameraAssetBinding[]>([]);
  const [bindingCameraId, setBindingCameraId] = useState("");
  const [bindingAssetId, setBindingAssetId] = useState("");
  const [bindingMessage, setBindingMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [streamPopup, setStreamPopup] = useState<StreamPopupState | null>(null);
  const [videoRequest, setVideoRequest] = useState<VideoRequestState | null>(null);
  const [videoRequestBusy, setVideoRequestBusy] = useState(false);
  const [videoRequestMessage, setVideoRequestMessage] = useState("");
  const [intercomTargets, setIntercomTargets] = useState<IntercomTarget[] | null>(null);
  const streamVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadAssets = async () => {
      const use808 = cms808HierarchyActive() || isCms808Server();
      if (use808) {
        void connectCmsv6Sso().catch(() => null);
      }
      const [apiAssets, apiCameras, deviceBindings, cmsVehicles] = await Promise.all([
        getAssetsFromApi<Record<string, unknown>>().catch(() => []),
        getCamerasFromApi<Record<string, unknown>>().catch(() => []),
        getBindings<DeviceBindingRecord>("devices").catch(() => []),
        use808 ? loadCms808VehiclesForActiveHierarchy() : Promise.resolve([])
      ]);
      if (!mounted) return;

      const mappings = parseCameraAssetBindings(Array.isArray(deviceBindings) ? deviceBindings : []);
      const cameraBindingsMap = createBindingsMap(mappings);
      const scopedAssets = filterRecordsForActiveSelection(
        (Array.isArray(apiAssets) ? apiAssets : []) as Array<Record<string, unknown>>
      ).filter((asset) => matchesLiveVideoHierarchy(asset) && hasAttachedCamera(asset));
      const scopedCameras = filterRecordsForActiveSelection(
        (Array.isArray(apiCameras) ? apiCameras : []) as Array<Record<string, unknown>>
      ).filter((camera) => matchesLiveVideoHierarchy(camera));

      const fromAssets = scopedAssets
        .map((asset) => toStreamAsset(asset))
        .filter(Boolean) as StreamAsset[];
      const fromCameras = scopedCameras
        .map((camera) => toStandaloneCameraStreamAsset(camera, cameraBindingsMap))
        .filter(Boolean) as StreamAsset[];
      const fromCms = cmsVehicles
        .map((row) => toCms808StreamAsset(row))
        .filter(Boolean) as StreamAsset[];

      const cameraOptions = scopedCameras
        .filter((camera) => isCommissionedCamera(camera))
        .map((camera) => {
          const row = camera;
          const id = String(row.cameraId ?? row.id ?? "").trim();
          const label = String(
            row.cameraSerial ?? row.cameraName ?? row.name ?? row.deviceName ?? row.cameraModel ?? id
          ).trim();
          return { id, label };
        })
        .filter((row) => row.id);

      const assetOptions = scopedAssets
        .map((asset) => ({
          id: String(asset.id ?? asset.assetId ?? "").trim(),
          description: String(asset.assetDescription ?? asset.description ?? asset.name ?? "").trim(),
          registration: String(asset.registration ?? asset.registrationNumber ?? "").trim()
        }))
        .filter((asset) => asset.id);

      const merged = mergeStreamAssets([...fromCms, ...fromAssets, ...fromCameras]);
      setAllAssets(assetOptions);
      setAllStandaloneCameras(cameraOptions);
      setCameraAssetBindings(mappings);
      setStreamAssets((current) => (merged.length === 0 && current.length > 0 ? current : JSON.stringify(current) === JSON.stringify(merged) ? current : merged));
      setSelectedIds((current) => current.filter((id) => merged.some((row) => row.id === id)));
    };
    const paintCachedAssets = () => {
      const cached = peekCachedAssets<Record<string, unknown>>();
      if (!cached.length) return;
      const scopedAssets = filterRecordsForActiveSelection(cached).filter(
        (asset) => matchesLiveVideoHierarchy(asset) && hasAttachedCamera(asset)
      );
      const fromAssets = scopedAssets.map((asset) => toStreamAsset(asset)).filter(Boolean) as StreamAsset[];
      if (!fromAssets.length) return;
      setStreamAssets((current) => { const next = mergeStreamAssets([...fromAssets, ...current]); return JSON.stringify(next) === JSON.stringify(current) ? current : next; });
      setAllAssets(
        scopedAssets
          .map((asset) => ({
            id: String(asset.id ?? asset.assetId ?? "").trim(),
            description: String(asset.assetDescription ?? asset.description ?? asset.name ?? "").trim(),
            registration: String(asset.registration ?? asset.registrationNumber ?? "").trim()
          }))
          .filter((asset) => asset.id)
      );
    };
    paintCachedAssets();
    void loadAssets();
    const unsubscribeScope = subscribeScopeChange(() => {
      paintCachedAssets();
      void loadAssets();
    });
    return () => {
      mounted = false;
      unsubscribeScope();
    };
  }, []);

  useEffect(() => {
    if (!streamPopup || (streamPopup.status !== "connecting" && streamPopup.status !== "verifying")) return;
    const timer = window.setInterval(() => {
      setStreamPopup((current) => {
        if (!current || (current.status !== "connecting" && current.status !== "verifying")) return current;
        const elapsed = Math.floor((Date.now() - current.startedAtMs) / 1000);
        const remainingSeconds = Math.max(0, STREAM_CONNECT_TIMEOUT_SECONDS - elapsed);
        if (remainingSeconds <= 0) {
          return {
            ...current,
            status: "failed",
            remainingSeconds: 0,
            message: "Connection timed out while validating the stream."
          };
        }
        if (remainingSeconds === current.remainingSeconds) return current;
        return {
          ...current,
          remainingSeconds
        };
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [streamPopup]);

  const refreshAssets = async () => {
    const [apiAssets, apiCameras, deviceBindings, cmsVehicles] = await Promise.all([
      getAssetsFromApi<Record<string, unknown>>().catch(() => []),
      getCamerasFromApi<Record<string, unknown>>().catch(() => []),
      getBindings<DeviceBindingRecord>("devices").catch(() => []),
      cms808HierarchyActive() || isCms808Server() ? loadCms808VehiclesForActiveHierarchy() : Promise.resolve([])
    ]);

    const mappings = parseCameraAssetBindings(Array.isArray(deviceBindings) ? deviceBindings : []);
    const cameraBindingsMap = createBindingsMap(mappings);
    const scopedAssets = filterRecordsForActiveSelection(
      (Array.isArray(apiAssets) ? apiAssets : []) as Array<Record<string, unknown>>
    ).filter((asset) => matchesLiveVideoHierarchy(asset) && hasAttachedCamera(asset));
    const scopedCameras = filterRecordsForActiveSelection(
      (Array.isArray(apiCameras) ? apiCameras : []) as Array<Record<string, unknown>>
    ).filter((camera) => matchesLiveVideoHierarchy(camera));

    const fromAssets = scopedAssets
      .map((asset) => toStreamAsset(asset))
      .filter(Boolean) as StreamAsset[];
    const fromCameras = scopedCameras
      .map((camera) => toStandaloneCameraStreamAsset(camera, cameraBindingsMap))
      .filter(Boolean) as StreamAsset[];
    const fromCms = cmsVehicles
      .map((row) => toCms808StreamAsset(row))
      .filter(Boolean) as StreamAsset[];

    const cameraOptions = scopedCameras
      .filter((camera) => isCommissionedCamera(camera))
      .map((camera) => {
        const row = camera;
        const id = String(row.cameraId ?? row.id ?? "").trim();
        const label = String(
          row.cameraSerial ?? row.cameraName ?? row.name ?? row.deviceName ?? row.cameraModel ?? id
        ).trim();
        return { id, label };
      })
      .filter((row) => row.id);

    const assetOptions = scopedAssets
      .map((asset) => ({
        id: String(asset.id ?? asset.assetId ?? "").trim(),
        description: String(asset.assetDescription ?? asset.description ?? asset.name ?? "").trim(),
        registration: String(asset.registration ?? asset.registrationNumber ?? "").trim()
      }))
      .filter((asset) => asset.id);

    setAllAssets(assetOptions);
    setAllStandaloneCameras(cameraOptions);
    setCameraAssetBindings(mappings);

    const merged = mergeStreamAssets([...fromCms, ...fromAssets, ...fromCameras]);
    setStreamAssets((current) => (merged.length === 0 && current.length > 0 ? current : JSON.stringify(current) === JSON.stringify(merged) ? current : merged));
    setSelectedIds((current) => current.filter((id) => merged.some((row) => row.id === id)));
  };

  const filteredAssets = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    const base = showSelectedOnly
      ? streamAssets.filter((asset) => selectedIds.includes(asset.id))
      : streamAssets;
    if (!normalized) return base;
    return base.filter((asset) =>
      [asset.description, asset.registration].some((value) =>
        value.toLowerCase().includes(normalized)
      )
    );
  }, [filter, showSelectedOnly, selectedIds, streamAssets]);

  const bindingsByCameraId = useMemo(
    () => createBindingsMap(cameraAssetBindings),
    [cameraAssetBindings]
  );

  const addCameraAssetBinding = async () => {
    const cameraId = String(bindingCameraId ?? "").trim();
    const assetId = String(bindingAssetId ?? "").trim();
    if (!cameraId || !assetId) {
      setBindingMessage("Select both camera and asset.");
      return;
    }

    const linkedAsset = allAssets.find((asset) => asset.id === assetId);
    const next = [
      ...cameraAssetBindings.filter((row) => row.cameraId !== cameraId),
      {
        cameraId,
        assetId,
        assetDescription: linkedAsset?.description ?? "",
        registration: linkedAsset?.registration ?? ""
      }
    ];

    const stored = await saveCameraAssetBindings(next);
    if (!stored) {
      setBindingMessage("Failed to save binding.");
      return;
    }

    setBindingMessage("Binding saved.");
    await refreshAssets();
  };

  const removeCameraAssetBinding = async (cameraId: string) => {
    const next = cameraAssetBindings.filter((row) => row.cameraId !== cameraId);
    const stored = await saveCameraAssetBindings(next);
    if (!stored) {
      setBindingMessage("Failed to remove binding.");
      return;
    }

    setBindingMessage("Binding removed.");
    await refreshAssets();
  };

  const allSelected =
    filteredAssets.length > 0 && filteredAssets.every((asset) => selectedIds.includes(asset.id));

  const maxChannelCount = useMemo(() => {
    if (!filteredAssets.length) return 5;
    return Math.max(5, ...filteredAssets.map((asset) => asset.channelCount));
  }, [filteredAssets]);

  const streamGridColumns = useMemo(
    () => `32px 2.2fr 1.4fr repeat(${maxChannelCount}, minmax(110px, 1fr)) 1fr 1.2fr`,
    [maxChannelCount]
  );

  const tableChannelLabels = useMemo(() => {
    return Array.from({ length: maxChannelCount }, (_, index) => {
      const fallback = getChannelLabel(index + 1);
      const discovered = streamAssets
        .map((asset) => String(asset.channelLabels[index] ?? "").trim())
        .find((value) => Boolean(value));
      return discovered || fallback;
    });
  }, [maxChannelCount, streamAssets]);

  const startLiveChannelConnect = async (asset: StreamAsset, channelNumber: number, channelLabel: string) => {
    const channelKey = normalizeChannelKey(channelLabel) || `channel-${channelNumber}`;
    const is808 = isCms808StreamId(asset.streamId) || isCms808StreamId(asset.id);
    const cameraId = String(asset.cameraId || (is808 ? asset.id : "") || "").trim();
    setStreamPopup({
      assetId: asset.id,
      cameraId: cameraId || asset.cameraId,
      assetDescription: asset.description,
      registration: asset.registration,
      channelNumber,
      channelKey,
      channelLabel,
      status: "connecting",
      startedAtMs: Date.now(),
      remainingSeconds: STREAM_CONNECT_TIMEOUT_SECONDS
    });

    const pickPlayerKind = (url: string): "video" | "iframe" =>
      /808gps\/open\/player|video\.html|hls\/index\.html|playbackvideo\.html/i.test(url)
      && !/\.(m3u8|flv|mp4)(\?|$)/i.test(url)
        ? "iframe"
        : "video";

    let session: LiveVideoSessionResponse | null = null;
    let playerKind: "video" | "iframe" = "video";
    try {
      // 808 devices go straight to the per-channel platform player.
      if (!is808) session = await createLiveVideoSession({
        cameraId: cameraId || undefined,
        assetId: asset.source === "asset" && !is808 ? asset.id : undefined,
        channel: channelNumber,
        channelKey,
        channelLabel
      });
      const cameraUrl = String(session?.streamUrl ?? "").trim();
      if (session?.ok && session.available && cameraUrl && (!is808 || isCms808PlayerUrl(cameraUrl) || /[?&]jsession=/i.test(cameraUrl))) {
        playerKind = pickPlayerKind(cameraUrl);
      } else {
        session = null;
      }

      // Fall back to signed VIVI live media for CMS cameras.
      if (!session?.streamUrl && is808) {
        const live = await loadCms808LiveStream(cameraId || asset.id, channelNumber);
        if (live?.streamUrl) {
          session = { ok: true, available: true, streamUrl: live.streamUrl, message: "VIVI Telematics live stream ready." };
          playerKind = live.playerKind;
        }
      }
    } catch {
      session = session?.streamUrl ? session : null;
    }

    if (!session?.ok || !session.available || !session.streamUrl) {
      setStreamPopup((current) => {
        if (!current || current.assetId !== asset.id || current.channelNumber !== channelNumber) return current;
        return {
          ...current,
          status: "failed",
          message: session?.message || "VIVI Telematics could not open a live stream for this channel."
        };

      });
      return;
    }

    setStreamPopup((current) => {
      if (!current || current.assetId !== asset.id || current.channelNumber !== channelNumber) return current;
      return {
        ...current,
        status: playerKind === "iframe" ? "connected" : "verifying",
        streamUrl: String(session?.streamUrl ?? ""),
        token: String(session?.token ?? "") || undefined,
        playerKind,
        message:
          playerKind === "iframe"
            ? "VIVI Telematics live player connected. A black screen at 0 KB/s means the device is not sending video right now (asleep or poor signal)."
                        : "Stream session opened. Verifying playback…"
                  };
    });
  };

  const openVideoRequest = (asset: StreamAsset, channelNumber: number, channelLabel: string) => {
    const to = new Date();
    const from = new Date(to.getTime() - 2 * 60 * 1000);
    const localInput = (date: Date) => {
      const offset = date.getTimezoneOffset();
      return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
    };
    setVideoRequest({
      asset,
      from: localInput(from),
      to: localInput(to),
      channel: channelNumber,
      channelLabel
    });
    setVideoRequestMessage("");
  };

  const submitVideoRequest = async () => {
    if (!videoRequest) return;
    const fromMs = Date.parse(videoRequest.from);
    const toMs = Date.parse(videoRequest.to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      setVideoRequestMessage("Choose a valid video period.");
      return;
    }
    if (toMs - fromMs > 2 * 60 * 1000) {
      setVideoRequestMessage("Video requests cannot be longer than 2 minutes.");
      return;
    }
    setVideoRequestBusy(true);
    setVideoRequestMessage("");
    try {
      const device = String(videoRequest.asset.cameraId || videoRequest.asset.id || "").replace(/^cms808:/i, "");
      const fromDate = new Date(fromMs);
      const toDate = new Date(toMs);
      const seconds = (date: Date) => date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
      const cmsTime = (date: Date) => {
        const pad = (value: number) => String(value).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
      };
      const result = await callCmsv6<{ ok?: boolean; error?: string; message?: string }>("/cmsv6/video/download", {
        method: "POST",
        body: JSON.stringify({
          did: device,
          fbtm: cmsTime(fromDate),
          fetm: cmsTime(toDate),
          sbtm: cmsTime(fromDate),
          setm: cmsTime(toDate),
          chn: videoRequest.channel - 1,
          vtp: 0,
          len: Math.ceil((toMs - fromMs) / 1000),
          dtp: 0,
          begSeconds: seconds(fromDate),
          endSeconds: seconds(toDate)
        })
      });
      if (result?.ok === false) throw new Error(result.error || result.message || "The video request was not accepted.");
      setVideoRequest(null);
      setVideoRequestMessage("Video request submitted. It will remain pending until the device is online.");
    } catch (error) {
      setVideoRequestMessage(String((error as Error)?.message ?? error ?? "Unable to submit the video request."));
    } finally {
      setVideoRequestBusy(false);
    }
  };

  const toIntercomTarget = (asset: StreamAsset): IntercomTarget => {
    const is808 = isCms808StreamId(asset.streamId) || isCms808StreamId(asset.id);
    return {
      assetId: asset.id,
      cameraId: String(asset.cameraId || (is808 ? asset.id : "") || "").trim() || undefined,
      description: asset.description,
      registration: asset.registration
    };
  };

  const openIntercomForAssets = (assets: StreamAsset[]) => {
    setIntercomTargets(assets.map(toIntercomTarget));
  };

  const retryLiveChannelConnect = () => {
    const current = streamPopup;
    if (!current) return;
    const target = streamAssets.find((asset) => asset.id === current.assetId || asset.streamId === current.assetId);
    if (!target) {
      setStreamPopup((row) => {
        if (!row) return row;
        return { ...row, status: "failed", message: "Unable to locate the selected asset for retry." };
      });
      return;
    }
    void startLiveChannelConnect(target, current.channelNumber, current.channelLabel);
  };

  const closeLivePopup = () => {
    setStreamPopup(null);
  };

  const formatCountdown = (value: number) => {
    const clamped = Math.max(0, Math.floor(value));
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className={embed ? "live-stream-page live-embed" : "page live-stream-page"}>
      {!embed && (
        <div className="video-back-row">
          <button
            type="button"
            className="video-back-btn"
            onClick={() => navigate("/Track/videos/dashboard")}
          >
            ← Back to Dashboard
          </button>
        </div>
      )}
      <div className="live-stream-card">
        <div className="live-stream-header">
          <div className="live-stream-title">
            <span>Assets</span>
            <span className="live-stream-count">{streamAssets.length}</span>
          </div>
          <label className="live-stream-checkbox">
            <input
              type="checkbox"
              checked={showSelectedOnly}
              onChange={(event) => setShowSelectedOnly(event.target.checked)}
            />
            Show selected assets
          </label>
          <div className="live-stream-actions">
            <button
              className={`live-stream-btn${intercomTargets ? " is-hot" : ""}`}
              type="button"
              onClick={() => {
                const selected = filteredAssets.filter((asset) => selectedIds.includes(asset.id) && asset.liveEnabled);
                openIntercomForAssets(selected.length ? selected : filteredAssets.filter((asset) => asset.liveEnabled));
              }}
            >
              Activate Intercom
            </button>
            <button className="live-stream-icon" type="button" aria-label="Stop streaming">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 3l18 18" />
                <rect x="3" y="6" width="12" height="12" rx="2" />
                <path d="M15 10l6-3v10l-6-3" />
              </svg>
            </button>
            <button className="live-stream-icon live-stream-primary" type="button" aria-label="Start streaming">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5l12 7-12 7V5z" />
              </svg>
            </button>
            <button
              className="live-stream-refresh"
              type="button"
              data-nav="/Analyze/insights/reports?category=Dashboard%20Widgets&report=Asset%20Performance%20Dashboard%20Report"
            >
              View reports
            </button>
            <button className="live-stream-refresh" type="button" onClick={refreshAssets}>
              Refresh
            </button>
          </div>
        </div>
        <div className="live-stream-filter">
          <input
            type="search"
            placeholder="Filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter assets"
          />
        </div>

        <div className="live-stream-filter live-stream-binding-row">
          <select
            className="live-stream-select"
            aria-label="Standalone camera"
            value={bindingCameraId}
            onChange={(event) => setBindingCameraId(event.target.value)}
          >
            <option value="">Select standalone camera</option>
            {allStandaloneCameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.label}
              </option>
            ))}
          </select>

          <select
            className="live-stream-select"
            aria-label="Asset"
            value={bindingAssetId}
            onChange={(event) => setBindingAssetId(event.target.value)}
          >
            <option value="">Select asset</option>
            {allAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.description || asset.id} {asset.registration ? `(${asset.registration})` : ""}
              </option>
            ))}
          </select>

          <button type="button" className="live-stream-refresh" onClick={() => void addCameraAssetBinding()}>
            Bind camera
          </button>
        </div>

        {bindingMessage ? <div className="live-stream-filter">{bindingMessage}</div> : null}

        {cameraAssetBindings.length > 0 && (
          <div className="live-stream-filter" style={{ display: "grid", gap: "0.35rem" }}>
            {cameraAssetBindings.map((binding) => {
              const boundTo = binding.assetDescription || binding.assetId;
              return (
                <div key={binding.cameraId} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem", alignItems: "center" }}>
                  <span>
                    {binding.cameraId} {" -> "} {boundTo}
                    {binding.registration ? ` (${binding.registration})` : ""}
                  </span>
                  <button
                    type="button"
                    className="live-stream-refresh"
                    onClick={() => void removeCameraAssetBinding(binding.cameraId)}
                  >
                    Unbind
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="live-stream-table">
          <div className="live-stream-row live-stream-head" style={{ gridTemplateColumns: streamGridColumns }}>
            <div className="live-stream-cell checkbox">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                onChange={(event) => {
                  if (event.target.checked) {
                    setSelectedIds(filteredAssets.map((asset) => asset.id));
                  } else {
                    setSelectedIds([]);
                  }
                }}
              />
            </div>
            <div className="live-stream-cell">Asset description</div>
            <div className="live-stream-cell">Registration number</div>
            {Array.from({ length: maxChannelCount }, (_, index) => (
              <div key={`head-channel-${index + 1}`} className="live-stream-cell">
                {tableChannelLabels[index]}
              </div>
            ))}
            <div className="live-stream-cell">Intercom</div>
            <div className="live-stream-cell">Request video</div>
          </div>
          {filteredAssets.length === 0 ? (
            <div className="live-stream-row live-stream-empty" style={{ gridTemplateColumns: streamGridColumns }}>
              <div className="live-stream-empty-text">No records available.</div>
            </div>
          ) : (
            filteredAssets.map((asset) => (
              <div key={asset.streamId} className="live-stream-row" style={{ gridTemplateColumns: streamGridColumns }}>
                <div className="live-stream-cell checkbox">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(asset.id)}
                    onChange={(event) => {
                      setSelectedIds((current) =>
                        event.target.checked
                          ? [...current, asset.id]
                          : current.filter((id) => id !== asset.id)
                      );
                    }}
                    aria-label={`Select ${asset.description}`}
                  />
                </div>
                <div className="live-stream-cell">{asset.description}</div>
                <div className="live-stream-cell">{asset.registration}</div>
                {Array.from({ length: maxChannelCount }, (_, index) => {
                  const channelNumber = index + 1;
                  const channelLabel = asset.channelLabels[index] || tableChannelLabels[index] || getChannelLabel(channelNumber);
                  const channelKey = normalizeChannelKey(channelLabel) || `channel-${channelNumber}`;
                  const hasConfiguredChannels = Array.isArray(asset.activeChannelKeys) && asset.activeChannelKeys.length > 0;
                  const isConfiguredActive = !hasConfiguredChannels || asset.activeChannelKeys!.includes(channelKey);
                  const isEnabled = Boolean(asset.liveEnabled) && channelNumber <= asset.channelCount && isConfiguredActive;
                  return (
                    <div key={`${asset.id}-channel-${channelNumber}`} className="live-stream-cell">
                      <button
                        className="live-stream-action"
                        type="button"
                        disabled={!isEnabled}
                        onClick={() => {
                          if (!isEnabled) return;
                          void startLiveChannelConnect(asset, channelNumber, channelLabel);
                        }}
                      >
                        View live
                      </button>
                    </div>
                  );
                })}
                <div className="live-stream-cell">
                  <button
                    className={`live-stream-action${intercomTargets?.some((target) => target.assetId === asset.id) ? " is-hot" : ""}`}
                    type="button"
                    disabled={!asset.liveEnabled}
                    onClick={() => {
                      if (!asset.liveEnabled) return;
                      openIntercomForAssets([asset]);
                    }}
                  >
                    {intercomTargets?.some((target) => target.assetId === asset.id) ? "Live" : "Activate"}
                  </button>
                </div>
                <div className="live-stream-cell">
                  <button
                    className="live-stream-action"
                    type="button"
                    disabled={!isCms808Server()}
                    title={
                      isCms808Server()
                        ? "Request a video clip of up to 2 minutes"
                        : "Video requests are currently available for ZA/CMS808"
                    }
                    onClick={() => {
                      if (isCms808Server()) {
                        openVideoRequest(asset, 1, tableChannelLabels[0] || "Road Cam");
                      }
                    }}
                  >
                    Request
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {intercomTargets ? (
        <IntercomSessionPopup targets={intercomTargets} onClose={() => setIntercomTargets(null)} />
      ) : null}

      {streamPopup && (
        <div className="live-stream-popup-backdrop" role="dialog" aria-modal="true" aria-label="VIVI Telematics live video">
          <div className="live-stream-popup-card">
            <div className="live-stream-popup-brand">VIVI Telematics</div>
            <div className="live-stream-popup-title">
              {streamPopup.status === "failed" ? "Live stream unavailable" : "Live video"}
            </div>
            <div className="live-stream-popup-meta">
              <strong>{streamPopup.assetDescription || streamPopup.registration || streamPopup.assetId}</strong>
              <span>{streamPopup.channelLabel}</span>
            </div>

            {streamPopup.status === "connecting" ? (
              <>
                <div className="live-stream-popup-stage live-stream-popup-stage-empty">
                  <div className="live-stream-popup-loader" aria-hidden="true" />
                  <p className="live-stream-popup-copy">Connecting to the selected camera…</p>
                </div>
                <p className="live-stream-popup-timer">Time remaining: {formatCountdown(streamPopup.remainingSeconds)}</p>
                <div className="live-stream-popup-actions">
                  <button type="button" className="live-stream-popup-btn ghost" onClick={closeLivePopup}>
                    Cancel
                  </button>
                </div>
              </>
            ) : streamPopup.status === "verifying" || streamPopup.status === "connected" ? (
              <>
                <div className="live-stream-popup-stage">
                  {streamPopup.streamUrl && streamPopup.playerKind === "iframe" ? (
                    <iframe
                      className="live-stream-popup-video"
                      key={`${streamPopup.assetId}-ch${streamPopup.channelNumber}`}
                      src={streamPopup.streamUrl}
                      title={`${streamPopup.assetDescription || "VIVI"} ${streamPopup.channelLabel} live video`}
                      allow="autoplay; fullscreen"
                      referrerPolicy="no-referrer"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-downloads"
                      onLoad={() => {
                        setStreamPopup((current) => {
                          if (!current) return current;
                          return { ...current, status: "connected", message: "VIVI Telematics live player connected." };
                        });
                      }}
                    />
                  ) : streamPopup.streamUrl ? (
                    <video
                      ref={streamVideoRef}
                      className="live-stream-popup-video"
                      src={streamPopup.streamUrl}
                      controls
                      autoPlay
                      muted
                      playsInline
                      onCanPlay={() => {
                        setStreamPopup((current) => {
                          if (!current) return current;
                          return { ...current, status: "connected", message: "Live stream connected." };
                        });
                      }}
                      onError={() => {
                        setStreamPopup((current) => {
                          if (!current) return current;
                          return {
                            ...current,
                            status: "failed",
                            message: "VIVI Telematics could not play this live channel."
                          };
                        });
                      }}
                    />
                  ) : null}
                </div>
                <p className="live-stream-popup-copy">
                  {streamPopup.message || (streamPopup.status === "connected" ? "Live stream connected." : "Verifying stream playback…")}
                </p>
                <p className="live-stream-popup-timer">Time remaining: {formatCountdown(streamPopup.remainingSeconds)}</p>
                <div className="live-stream-popup-actions">
                  <button type="button" className="live-stream-popup-btn ghost" onClick={closeLivePopup}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="live-stream-popup-stage live-stream-popup-stage-empty">
                  <p className="live-stream-popup-copy">{streamPopup.message || "Connection failed."}</p>
                  <p className="live-stream-popup-copy">Try again, or close and select another channel.</p>
                </div>
                <div className="live-stream-popup-actions">
                  <button type="button" className="live-stream-popup-btn" onClick={retryLiveChannelConnect}>
                    Try again
                  </button>
                  <button type="button" className="live-stream-popup-btn ghost" onClick={closeLivePopup}>
                    Cancel
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    {videoRequest && (
      <div className="trip-video-modal" role="dialog" aria-modal="true" aria-label="Request video">
        <div className="trip-video-card">
          <div className="trip-video-header">
            <div>Request video</div>
            <button
              type="button"
              className="trip-video-close"
              onClick={() => setVideoRequest(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="trip-video-body">
            <div className="trip-video-help">
              Request a maximum two-minute clip. The request will be sent to the device when it is online.
            </div>
            <div className="trip-video-note">
              {videoRequest.asset.description || videoRequest.asset.registration} — {videoRequest.channelLabel}
            </div>
            <label className="trip-video-field">
              <span>Channel</span>
              <select
                value={videoRequest.channel}
                onChange={(event) => {
                  const channel = Number(event.target.value);
                  setVideoRequest((current) =>
                    current ? { ...current, channel, channelLabel: getChannelLabel(channel) } : current
                  );
                }}
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    CH{index + 1} — {getChannelLabel(index + 1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="trip-video-field">
              <span>From</span>
              <input
                type="datetime-local"
                value={videoRequest.from}
                onChange={(event) => setVideoRequest((current) => current ? { ...current, from: event.target.value } : current)}
              />
            </label>
            <label className="trip-video-field">
              <span>To</span>
              <input
                type="datetime-local"
                value={videoRequest.to}
                onChange={(event) => setVideoRequest((current) => current ? { ...current, to: event.target.value } : current)}
              />
            </label>
            {videoRequestMessage ? <div className="trip-video-note">{videoRequestMessage}</div> : null}
          </div>
          <div className="trip-video-actions">
            <button type="button" className="trip-video-cancel" onClick={() => setVideoRequest(null)}>
              Cancel
            </button>
            <button type="button" className="trip-video-submit" disabled={videoRequestBusy} onClick={() => void submitVideoRequest()}>
              {videoRequestBusy ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
