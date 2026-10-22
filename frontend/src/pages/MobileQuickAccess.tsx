import { useEffect, useMemo, useState } from "react";
import "../mapStyles";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import ViviLogo from "../components/ViviLogo";
import { computeAssetDotStatus } from "../utils/assetStatus";
import {
  buildApiUrl,
  createLiveShareLink,
  getAssetsFromApi,
  getApiKey,
  getHierarchy,
  getLiveShareActive,
  getTraccarDevices,
  getTraccarEvents,
  getTraccarTrips,
  sendLiveShareEmail,
  type HierarchyDatabase,
  type HierarchyDealer,
  type HierarchyOrg,
  type HierarchyRoot,
  type HierarchySite,
  type LiveShareActiveInfo,
  type TraccarEvent,
  type TraccarTrip,
} from "../utils/api";
import { showToast } from "../utils/toast";
import {
  USER_PREF_KEYS,
  writeActiveAssetPrefs,
  writeUserPref
} from "../utils/userAppPrefs";
import "../index.css";

type MobileAsset = {
  id: string;
  assetDescription?: string;
  registration?: string;
  fleetNumber?: string;
  database?: string;
  site?: string;
  imei?: string;
  traccarDeviceId?: number;
  lastSeen?: string;
  lastPosition?: string;
  lastTrip?: string;
  speed?: number | string;
  movement?: string;
  availabilityStatus?: string;
  status?: string;
  driver?: string;
  location?: string;
  fuelReading?: string;
  lastNotificationValue?: string;
  lat?: number;
  lng?: number;
};

type MobileSection = "overview" | "live" | "history" | "share" | "access";
type HistoryPreset = "24h" | "7d" | "30d";

type HistorySummary = {
  trips: TraccarTrip[];
  events: TraccarEvent[];
  fromIso: string;
  toIso: string;
};

type ScopeState = {
  dealerId: string;
  orgId: string;
  dbId: string;
  siteId: string;
};

type MappableMobileAsset = MobileAsset & {
  lat: number;
  lng: number;
  dotStatus: "online" | "warning" | "offline";
};

const MOBILE_POLL_MS = 20_000;
const MOBILE_MAP_FALLBACK_CENTER: [number, number] = [0.55, 32.45];
const HISTORY_RANGE_LABELS: Record<HistoryPreset, string> = {
  "24h": "Last 24h",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const MAP_STATUS_COLORS: Record<MappableMobileAsset["dotStatus"], string> = {
  online: "#16a34a",
  warning: "#94a3b8",
  offline: "#800000",
};

const MOBILE_BASE_LAYER = {
  url: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
  attribution: "&copy; Google Maps",
};

const reverseGeocodeCache = new Map<string, string>();
const reverseGeocodePending = new Map<string, Promise<string>>();

const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizeLower = (value: unknown) => normalizeText(value).toLowerCase();

const buildReverseGeocodeKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

const looksLikeCoordinates = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) return false;
  return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(text);
};

const parseTimestampMs = (value: unknown): number => {
  const raw = normalizeText(value);
  if (!raw) return Number.NaN;
  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return direct;
  const legacy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!legacy) return Number.NaN;
  const day = Number(legacy[1]);
  const month = Number(legacy[2]);
  const year = Number(legacy[3]);
  const hour = Number(legacy[4] ?? "0");
  const minute = Number(legacy[5] ?? "0");
  const second = Number(legacy[6] ?? "0");
  return Date.UTC(year, month - 1, day, hour, minute, second);
};

const formatDateTime = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return "Not available";
  const parsed = parseTimestampMs(raw);
  if (Number.isNaN(parsed)) return raw;
  return new Date(parsed)
    .toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(",", "");
};

const formatRelative = (value: unknown) => {
  const parsed = parseTimestampMs(value);
  if (Number.isNaN(parsed)) return "No recent update";
  const deltaMinutes = Math.max(0, Math.round((Date.now() - parsed) / 60_000));
  if (deltaMinutes < 1) return "Just now";
  if (deltaMinutes < 60) return `${deltaMinutes} min ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours} hr ago`;
  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays} day${deltaDays === 1 ? "" : "s"} ago`;
};

const formatDistanceKm = (value: unknown) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0.0 km";
  const km = numeric > 1000 ? numeric / 1000 : numeric;
  return `${km.toFixed(1)} km`;
};

const buildShareUrl = (token: string) => {
  const base = typeof window !== "undefined" ? normalizeText(window.location.origin) : "";
  const path = `/share/live/${encodeURIComponent(token)}`;
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
};

const buildMapsUrl = (asset: Partial<MobileAsset>) => {
  const lat = Number(asset.lat ?? Number.NaN);
  const lng = Number(asset.lng ?? Number.NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  if (typeof navigator !== "undefined") {
    const userAgent = navigator.userAgent || "";
    if (/(iphone|ipad|ipod)/i.test(userAgent)) {
      return `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(assetLabel(asset))}`;
    }
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
};

const fetchReverseGeocodeLabel = async (lat: unknown, lng: unknown): Promise<string> => {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return "";
  if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) return "";

  const key = buildReverseGeocodeKey(parsedLat, parsedLng);
  const cached = normalizeText(reverseGeocodeCache.get(key));
  if (cached) return cached;

  const existing = reverseGeocodePending.get(key);
  if (existing) return existing;

  const request = (async () => {
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      const apiKey = getApiKey();
      if (apiKey) headers["x-api-key"] = apiKey;

      const response = await fetch(
        buildApiUrl(`/api/reverse-geocode?lat=${encodeURIComponent(String(parsedLat))}&lon=${encodeURIComponent(String(parsedLng))}`),
        { headers }
      );
      if (!response.ok) return "";

      const body = (await response.json()) as {
        display_name?: string;
        name?: string;
        address?: Record<string, string>;
      };
      const resolved = normalizeText(
        body?.display_name
          ?? body?.name
          ?? body?.address?.road
          ?? body?.address?.suburb
          ?? body?.address?.hamlet
          ?? body?.address?.neighbourhood
          ?? body?.address?.locality
          ?? body?.address?.city
          ?? body?.address?.town
          ?? body?.address?.village
          ?? body?.address?.county
          ?? body?.address?.municipality
          ?? body?.address?.state_district
      );

      if (resolved) reverseGeocodeCache.set(key, resolved);
      return resolved;
    } catch {
      return "";
    } finally {
      reverseGeocodePending.delete(key);
    }
  })();

  reverseGeocodePending.set(key, request);
  return request;
};

function MobileQuickMapViewport({ assets }: { assets: MappableMobileAsset[] }) {
  const map = useMap();

  useEffect(() => {
    if (!assets.length) {
      map.setView(MOBILE_MAP_FALLBACK_CENTER, 5, { animate: false });
      return;
    }

    const points = assets.map((asset) => [asset.lat, asset.lng] as [number, number]);
    if (points.length === 1) {
      map.setView(points[0], 13, { animate: false });
      return;
    }

    map.fitBounds(points, { padding: [24, 24], maxZoom: 13, animate: false });
  }, [assets, map]);

  return null;
}

const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const historyPresetStart = (preset: HistoryPreset) => {
  const now = Date.now();
  if (preset === "24h") return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  if (preset === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
};

const readStoredScope = (): ScopeState => {
  if (typeof window === "undefined") {
    return { dealerId: "", orgId: "", dbId: "", siteId: "" };
  }
  return {
    dealerId: normalizeText(window.localStorage.getItem("vivi.activeDealerId")),
    orgId: normalizeText(window.localStorage.getItem("vivi.activeOrgId")),
    dbId: normalizeText(window.localStorage.getItem("vivi.activeDbId")),
    siteId: normalizeText(window.localStorage.getItem("vivi.activeSiteId")),
  };
};

const assetLabel = (asset: Partial<MobileAsset>) => {
  const description = normalizeText(asset.assetDescription);
  const registration = normalizeText(asset.registration);
  if (description && registration && normalizeLower(description) !== normalizeLower(registration)) {
    return `${description} - ${registration}`;
  }
  return registration || description || normalizeText(asset.id) || "Asset";
};

const assetFreshnessTime = (asset: MobileAsset) => {
  const lastSeenMs = parseTimestampMs(asset.lastSeen);
  const lastPositionMs = parseTimestampMs(asset.lastPosition);
  return Math.max(Number.isFinite(lastSeenMs) ? lastSeenMs : 0, Number.isFinite(lastPositionMs) ? lastPositionMs : 0);
};

const resolveInitialScope = (hierarchy: HierarchyRoot): ScopeState => {
  const stored = readStoredScope();
  const dealer = hierarchy.dealers.find((item) => item.id === stored.dealerId) ?? hierarchy.dealers[0] ?? null;
  const org = dealer?.organisations.find((item) => item.id === stored.orgId) ?? dealer?.organisations[0] ?? null;
  const db = org?.databases.find((item) => item.id === stored.dbId) ?? org?.databases[0] ?? null;
  const hasStoredSite = db?.sites.some((item) => item.id === stored.siteId) ?? false;
  return {
    dealerId: dealer?.id ?? "",
    orgId: org?.id ?? "",
    dbId: db?.id ?? "",
    siteId: hasStoredSite ? stored.siteId : "",
  };
};

const writeMobileContext = (
  scope: ScopeState,
  dealer: HierarchyDealer | null,
  org: HierarchyOrg | null,
  database: HierarchyDatabase | null,
  site: HierarchySite | null
) => {
  if (typeof window === "undefined") return;

  const resolvedScope = site?.id ? "site" : database?.id ? "db" : org?.id ? "org" : dealer?.id ? "dealer" : "";
  const selectedPath = [dealer?.name, org?.name, database?.name, site?.name].filter(Boolean).join(" / ");
  const tenantId = dealer?.id && org?.id && database?.id ? `${dealer.id}:${org.id}:${database.id}` : "";
  const dbSites = database?.sites.map((item) => item.name).filter(Boolean) ?? [];
  const contextType = site?.id ? "site" : database?.id ? "database" : org?.id ? "organisation" : dealer?.id ? "dealer" : "";
  const contextName = site?.name ?? database?.name ?? org?.name ?? dealer?.name ?? "";

  if (scope.dealerId) window.localStorage.setItem("vivi.activeDealerId", scope.dealerId);
  else window.localStorage.removeItem("vivi.activeDealerId");
  if (scope.orgId) window.localStorage.setItem("vivi.activeOrgId", scope.orgId);
  else window.localStorage.removeItem("vivi.activeOrgId");
  if (scope.dbId) window.localStorage.setItem("vivi.activeDbId", scope.dbId);
  else window.localStorage.removeItem("vivi.activeDbId");
  if (scope.siteId) window.localStorage.setItem("vivi.activeSiteId", scope.siteId);
  else window.localStorage.removeItem("vivi.activeSiteId");
  if (site?.name) window.localStorage.setItem("vivi.activeSite", site.name);
  else window.localStorage.removeItem("vivi.activeSite");
  if (tenantId) window.localStorage.setItem("vivi.tenantId", tenantId);
  else window.localStorage.removeItem("vivi.tenantId");
  if (resolvedScope) window.localStorage.setItem("vivi.selectedScope", resolvedScope);
  else window.localStorage.removeItem("vivi.selectedScope");
  if (selectedPath) window.localStorage.setItem("vivi.selectedPath", selectedPath);
  else window.localStorage.removeItem("vivi.selectedPath");
  window.localStorage.setItem("vivi.activeDbSites", JSON.stringify(dbSites));
  writeUserPref(USER_PREF_KEYS.contextType, contextType || "");
  writeUserPref(USER_PREF_KEYS.contextName, contextName || "");

  window.dispatchEvent(new Event("vivi:orgchange"));
  window.dispatchEvent(new Event("vivi:contextchange"));
};

export default function MobileQuickAccess() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<MobileSection>("overview");
  const [hierarchy, setHierarchy] = useState<HierarchyRoot>({ dealers: [] });
  const [scope, setScope] = useState<ScopeState>({ dealerId: "", orgId: "", dbId: "", siteId: "" });
  const [assets, setAssets] = useState<MobileAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [contextApplying, setContextApplying] = useState(false);
  const [historyPreset, setHistoryPreset] = useState<HistoryPreset>("24h");
  const [historyAssetId, setHistoryAssetId] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySummary, setHistorySummary] = useState<HistorySummary | null>(null);
  const [shareAssetId, setShareAssetId] = useState("");
  const [shareRecipients, setShareRecipients] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [shareExpiresAt, setShareExpiresAt] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [activeShares, setActiveShares] = useState<Record<string, LiveShareActiveInfo>>({});
  const [resolvedLocations, setResolvedLocations] = useState<Record<string, string>>({});

  const currentDealer = useMemo(
    () => hierarchy.dealers.find((item) => item.id === scope.dealerId) ?? null,
    [hierarchy.dealers, scope.dealerId]
  );
  const currentOrg = useMemo(
    () => currentDealer?.organisations.find((item) => item.id === scope.orgId) ?? null,
    [currentDealer, scope.orgId]
  );
  const currentDb = useMemo(
    () => currentOrg?.databases.find((item) => item.id === scope.dbId) ?? null,
    [currentOrg, scope.dbId]
  );
  const currentSite = useMemo(
    () => currentDb?.sites.find((item) => item.id === scope.siteId) ?? null,
    [currentDb, scope.siteId]
  );

  useEffect(() => {
    let cancelled = false;

    const loadHierarchy = async () => {
      const nextHierarchy = await getHierarchy();
      if (cancelled) return;
      setHierarchy(nextHierarchy);
      setScope(resolveInitialScope(nextHierarchy));
    };

    void loadHierarchy();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAssets = async () => {
      setAssetsLoading(true);
      try {
        const nextAssets = await getAssetsFromApi<MobileAsset>();
        if (cancelled) return;
        setAssets(
          nextAssets
            .map((asset) => ({ ...asset, id: normalizeText(asset.id) }))
            .filter((asset) => asset.id)
        );
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    };

    void loadAssets();
    const timer = window.setInterval(() => void loadAssets(), MOBILE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const filteredAssets = useMemo(() => {
    const allowedSites = new Set((currentDb?.sites ?? []).map((item) => normalizeLower(item.name)).filter(Boolean));
    const selectedSite = normalizeLower(currentSite?.name);
    return assets
      .filter((asset) => {
        const assetSite = normalizeLower(asset.site);
        if (selectedSite) return assetSite === selectedSite;
        if (allowedSites.size > 0) return allowedSites.has(assetSite);
        return true;
      })
      .sort((left, right) => assetFreshnessTime(right) - assetFreshnessTime(left));
  }, [assets, currentDb, currentSite]);

  useEffect(() => {
    if (!filteredAssets.length) {
      setHistoryAssetId("");
      setShareAssetId("");
      return;
    }
    setHistoryAssetId((current) => current && filteredAssets.some((asset) => asset.id === current) ? current : filteredAssets[0].id);
    setShareAssetId((current) => current && filteredAssets.some((asset) => asset.id === current) ? current : filteredAssets[0].id);
  }, [filteredAssets]);

  useEffect(() => {
    let cancelled = false;

    const loadShares = async () => {
      if (!filteredAssets.length) {
        setActiveShares({});
        return;
      }
      const ids = filteredAssets.slice(0, 200).map((asset) => asset.id);
      const next = await getLiveShareActive(ids);
      if (cancelled) return;
      setActiveShares(next ?? {});
    };

    void loadShares();
    return () => {
      cancelled = true;
    };
  }, [filteredAssets]);

  const liveCounts = useMemo(() => {
    return filteredAssets.reduce(
      (totals, asset) => {
        const status = computeAssetDotStatus({
          availability: asset.availabilityStatus ?? asset.status,
          lastSeen: asset.lastSeen,
          lastPosition: asset.lastPosition,
          lastTrip: asset.lastTrip,
          speed: asset.speed,
          movement: asset.movement,
          staleHours: 2,
        });
        totals.total += 1;
        totals[status] += 1;
        return totals;
      },
          { total: 0, online: 0, warning: 0, stale: 0, offline: 0 }
    );
  }, [filteredAssets]);

  const recentNotifications = useMemo(() => {
    return filteredAssets
      .filter((asset) => normalizeText(asset.lastNotificationValue))
      .slice(0, 8);
  }, [filteredAssets]);

  const selectedHistoryAsset = useMemo(
    () => filteredAssets.find((asset) => asset.id === historyAssetId) ?? null,
    [filteredAssets, historyAssetId]
  );
  const selectedShareAsset = useMemo(
    () => filteredAssets.find((asset) => asset.id === shareAssetId) ?? null,
    [filteredAssets, shareAssetId]
  );

  const mapAssets = useMemo<MappableMobileAsset[]>(() => {
    return filteredAssets
      .map((asset) => {
        const lat = Number(asset.lat ?? Number.NaN);
        const lng = Number(asset.lng ?? Number.NaN);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const dotStatus = computeAssetDotStatus({
          availability: asset.availabilityStatus ?? asset.status,
          lastSeen: asset.lastSeen,
          lastPosition: asset.lastPosition,
          lastTrip: asset.lastTrip,
          speed: asset.speed,
          movement: asset.movement,
          staleHours: 2,
        });
        return { ...asset, lat, lng, dotStatus };
      })
      .filter(Boolean)
      .slice(0, 100) as MappableMobileAsset[];
  }, [filteredAssets]);

  useEffect(() => {
    let cancelled = false;

    const loadResolvedLocations = async () => {
      const pendingAssets = filteredAssets
        .filter((asset) => {
          const existing = normalizeText(asset.location);
          if (existing && !looksLikeCoordinates(existing)) return false;
          const lat = Number(asset.lat ?? Number.NaN);
          const lng = Number(asset.lng ?? Number.NaN);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
          return !normalizeText(resolvedLocations[asset.id]);
        })
        .slice(0, 24);

      if (!pendingAssets.length) return;

      const entries = await Promise.all(
        pendingAssets.map(async (asset) => {
          const label = await fetchReverseGeocodeLabel(asset.lat, asset.lng);
          return [asset.id, label] as const;
        })
      );

      if (cancelled) return;
      setResolvedLocations((current) => {
        const next = { ...current };
        for (const [assetId, label] of entries) {
          if (label) next[assetId] = label;
        }
        return next;
      });
    };

    void loadResolvedLocations();
    return () => {
      cancelled = true;
    };
  }, [filteredAssets, resolvedLocations]);

  const locationLabelForAsset = (asset: MobileAsset) => {
    const direct = normalizeText(asset.location);
    if (direct && !looksLikeCoordinates(direct)) return direct;
    return normalizeText(resolvedLocations[asset.id]) || "Location pending";
  };

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      if (!selectedHistoryAsset?.imei) {
        setHistorySummary(null);
        return;
      }

      setHistoryLoading(true);
      try {
        const fromIso = historyPresetStart(historyPreset);
        const toIso = new Date().toISOString();
        const directDeviceId = Number(selectedHistoryAsset.traccarDeviceId ?? 0);
        let deviceId = Number.isFinite(directDeviceId) && directDeviceId > 0 ? directDeviceId : 0;

        if (!deviceId) {
          const devices = await getTraccarDevices({ uniqueId: normalizeText(selectedHistoryAsset.imei) });
          deviceId = Number(devices[0]?.id ?? 0);
        }

        if (!deviceId) {
          if (!cancelled) setHistorySummary({ trips: [], events: [], fromIso, toIso });
          return;
        }

        const [trips, events] = await Promise.all([
          getTraccarTrips({ deviceId, from: fromIso, to: toIso }),
          getTraccarEvents({ deviceId, from: fromIso, to: toIso }),
        ]);

        if (cancelled) return;
        setHistorySummary({ trips, events, fromIso, toIso });
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [historyPreset, selectedHistoryAsset]);

  const applyScope = () => {
    setContextApplying(true);
    try {
      writeMobileContext(scope, currentDealer, currentOrg, currentDb, currentSite);
      showToast(`Context updated to ${currentSite?.name ?? currentDb?.name ?? currentOrg?.name ?? currentDealer?.name ?? "selection"}.`, "success");
    } finally {
      setContextApplying(false);
    }
  };

  const applyCurrentContextForNavigation = () => {
    writeMobileContext(scope, currentDealer, currentOrg, currentDb, currentSite);
  };

  const setAssetNavigationContext = (asset: MobileAsset, mode?: "history" | "live") => {
    if (typeof window === "undefined") return;
    writeActiveAssetPrefs({
      asset: assetLabel(asset),
      registration: normalizeText(asset.registration),
      imei: normalizeText(asset.imei)
    });
    if (normalizeText(asset.site)) window.localStorage.setItem("vivi.activeSite", normalizeText(asset.site));
    if (mode === "history") {
      const historyStart = historyPresetStart(historyPreset);
      const historyEnd = new Date().toISOString();
      window.localStorage.setItem("vivi.historyStart", historyStart);
      window.localStorage.setItem("vivi.historyTime", historyEnd);
      window.localStorage.setItem("vivi.historyEnd", historyEnd);
    }
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const openAssetRoute = (asset: MobileAsset, path: string) => {
    applyCurrentContextForNavigation();
    setAssetNavigationContext(asset, path.includes("historical") ? "history" : "live");
    navigate(path);
  };

  const openNotificationsSettings = () => {
    applyCurrentContextForNavigation();
    navigate("/Control/notifications/satellite-assisted-notifications");
  };

  const openMapsForAsset = (asset: MobileAsset) => {
    const url = buildMapsUrl(asset);
    if (!url || typeof window === "undefined") {
      showToast("No map coordinates are available for this asset yet.", "error");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCreateShare = async () => {
    if (!selectedShareAsset) return;

    setShareBusy(true);
    setShareStatus("Preparing live link...");

    try {
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const created = await createLiveShareLink({
        assetId: selectedShareAsset.id,
        expiresAt,
        includeAssetMeta: true,
        includeDriver: true,
        comment: `Shared from mobile quick check for ${assetLabel(selectedShareAsset)}`,
      });

      if (!created?.token) {
        setShareStatus("Could not create a live share link.");
        return;
      }

      const link = buildShareUrl(created.token);
      setShareLink(link);
      setShareExpiresAt(created.expiresAt || expiresAt);
      setActiveShares((current) => ({
        ...current,
        [selectedShareAsset.id]: { active: true, expiresAt: created.expiresAt || expiresAt, token: created.token },
      }));

      const recipients = shareRecipients
        .split(/[;,]/)
        .map((value) => value.trim())
        .filter(Boolean);

      if (recipients.length > 0) {
        const invalid = recipients.some((email) => !isLikelyEmail(email));
        if (invalid) {
          setShareStatus("Link created. Recipient email format needs correction before send.");
          return;
        }

        const sent = await sendLiveShareEmail({
          to: recipients,
          shareUrl: link,
          assetLabel: assetLabel(selectedShareAsset),
          expiresAt: created.expiresAt || expiresAt,
          comment: "This live location link auto-expires after 12 hours.",
        });

        if (sent?.ok && sent.emailSent) {
          setShareStatus(`Link emailed to ${sent.recipients ?? recipients.length} recipient(s).`);
          showToast("Live location link sent.", "success");
          return;
        }

        setShareStatus("Link created, but email delivery failed. You can still copy the link.");
        return;
      }

      setShareStatus("Link created. Copy and share it from your phone.");
      showToast("Live share link created.", "success");
    } catch (error: unknown) {
      setShareStatus(String((error as { message?: string })?.message ?? error ?? "Failed to share live location."));
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyShare = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setShareStatus("Link copied to clipboard.");
      showToast("Share link copied.", "success");
    } catch {
      setShareStatus("Copy failed. Please copy the link manually.");
    }
  };

  const handleShareLinkNative = async () => {
    if (!shareLink) return;
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      setShareStatus("Native share is not available here. Use Copy link instead.");
      return;
    }
    try {
      await navigator.share({
        title: selectedShareAsset ? `${assetLabel(selectedShareAsset)} live location` : "Live location",
        text: selectedShareAsset
          ? `Live tracking link for ${assetLabel(selectedShareAsset)}.`
          : "Live tracking link.",
        url: shareLink,
      });
      setShareStatus("Link shared from your phone.");
    } catch {
      setShareStatus("Phone share was cancelled or unavailable.");
    }
  };

  const overviewCards = [
    { label: "Online", value: liveCounts.online, tone: "online" },
    { label: "Stationary", value: liveCounts.warning, tone: "warning" },
    { label: "Offline", value: liveCounts.offline, tone: "offline" },
    { label: "Active shares", value: Object.values(activeShares).filter((entry) => entry?.active).length, tone: "neutral" },
  ];

  return (
    <div className="page mobile-quick-page">
      <section className="mobile-quick-hero">
        <div className="mobile-quick-hero__brand">
          <ViviLogo />
          <div>
            <div className="mobile-quick-kicker">Mobile Quick Check</div>
            <h1>Track live fleet health, history, and shareable locations from one phone screen.</h1>
          </div>
        </div>
        <div className="mobile-quick-hero__meta">
          <span>{currentDealer?.name || "Dealer not selected"}</span>
          <strong>{currentSite?.name || currentDb?.name || "Choose a database"}</strong>
        </div>
      </section>

      <nav className="mobile-quick-tabs" aria-label="Mobile quick sections">
        {[
          ["overview", "Overview"],
          ["live", "Live"],
          ["history", "History"],
          ["share", "Share"],
          ["access", "Access"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`mobile-quick-tab${activeSection === key ? " active" : ""}`}
            onClick={() => setActiveSection(key as MobileSection)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="mobile-quick-panel mobile-quick-panel--context">
        <div className="mobile-quick-panel__head">
          <div>
            <h2>Sites and databases</h2>
            <p>Switch dealer, organisation, database, and site context for the rest of the platform.</p>
          </div>
          <button type="button" className="mobile-quick-btn mobile-quick-btn--primary" onClick={applyScope} disabled={contextApplying || !currentDb}>
            {contextApplying ? "Applying..." : "Apply context"}
          </button>
        </div>
        <div className="mobile-quick-grid mobile-quick-grid--selectors">
          <label>
            Dealer
            <select
              value={scope.dealerId}
              onChange={(event) => {
                const dealer = hierarchy.dealers.find((item) => item.id === event.target.value) ?? null;
                const org = dealer?.organisations[0] ?? null;
                const database = org?.databases[0] ?? null;
                setScope({
                  dealerId: dealer?.id ?? "",
                  orgId: org?.id ?? "",
                  dbId: database?.id ?? "",
                  siteId: "",
                });
              }}
            >
              <option value="">Select dealer</option>
              {hierarchy.dealers.map((dealer) => (
                <option key={dealer.id} value={dealer.id}>{dealer.name}</option>
              ))}
            </select>
          </label>
          <label>
            Organisation
            <select
              value={scope.orgId}
              onChange={(event) => {
                const org = currentDealer?.organisations.find((item) => item.id === event.target.value) ?? null;
                const database = org?.databases[0] ?? null;
                setScope((current) => ({
                  ...current,
                  orgId: org?.id ?? "",
                  dbId: database?.id ?? "",
                  siteId: "",
                }));
              }}
              disabled={!currentDealer}
            >
              <option value="">Select organisation</option>
              {(currentDealer?.organisations ?? []).map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </label>
          <label>
            Database
            <select
              value={scope.dbId}
              onChange={(event) => {
                const database = currentOrg?.databases.find((item) => item.id === event.target.value) ?? null;
                setScope((current) => ({
                  ...current,
                  dbId: database?.id ?? "",
                  siteId: "",
                }));
              }}
              disabled={!currentOrg}
            >
              <option value="">Select database</option>
              {(currentOrg?.databases ?? []).map((database) => (
                <option key={database.id} value={database.id}>{database.name}</option>
              ))}
            </select>
          </label>
          <label>
            Site
            <select
              value={scope.siteId}
              onChange={(event) => setScope((current) => ({ ...current, siteId: event.target.value }))}
              disabled={!currentDb}
            >
              <option value="">All sites in database</option>
              {(currentDb?.sites ?? []).map((site) => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {(activeSection === "overview" || activeSection === "live") && (
        <section className="mobile-quick-panel">
          <div className="mobile-quick-panel__head">
            <div>
              <h2>Live tracking quick view</h2>
              <p>Phone-first fleet status, notification feed, and direct handoff into the full live map.</p>
            </div>
            <button
              type="button"
              className="mobile-quick-btn"
              onClick={() => {
                const asset = filteredAssets[0];
                if (asset) {
                  openAssetRoute(asset, "/Track/tracking/live");
                  return;
                }
                applyCurrentContextForNavigation();
                navigate("/Track/tracking/live");
              }}
            >
              Open full live tracking
            </button>
          </div>

          <div className="mobile-quick-stats">
            {overviewCards.map((card) => (
              <article key={card.label} className={`mobile-quick-stat mobile-quick-stat--${card.tone}`}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </article>
            ))}
          </div>

          <div className="mobile-quick-card">
            <div className="mobile-quick-card__title">Live map</div>
            {mapAssets.length === 0 ? (
              <div className="mobile-quick-empty">No live coordinates are available yet for assets in this scope.</div>
            ) : (
              <>
                <div className="mobile-quick-map-shell">
                  <MapContainer
                    center={MOBILE_MAP_FALLBACK_CENTER}
                    zoom={6}
                    scrollWheelZoom={false}
                    className="mobile-quick-map"
                  >
                    <TileLayer
                      attribution={MOBILE_BASE_LAYER.attribution}
                      subdomains="0123"
                      url={MOBILE_BASE_LAYER.url}
                    />
                    <MobileQuickMapViewport assets={mapAssets} />
                    {mapAssets.map((asset) => (
                      <CircleMarker
                        key={asset.id}
                        center={[asset.lat, asset.lng]}
                        radius={8}
                        pathOptions={{
                          color: "#ffffff",
                          weight: 2,
                          fillColor: MAP_STATUS_COLORS[asset.dotStatus],
                          fillOpacity: 1,
                        }}
                      >
                        <Popup>
                          <div className="mobile-quick-map-popup">
                            <strong>{assetLabel(asset)}</strong>
                            <span>{normalizeText(asset.site) || "No site"}</span>
                            <span>{locationLabelForAsset(asset)}</span>
                            <span>{formatRelative(asset.lastSeen || asset.lastPosition)}</span>
                            <div className="mobile-quick-map-popup__actions">
                              <button type="button" onClick={() => openAssetRoute(asset, "/Track/tracking/live")}>Live</button>
                              <button type="button" onClick={() => openMapsForAsset(asset)}>Maps</button>
                            </div>
                          </div>
                        </Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                </div>
                <div className="mobile-quick-map-legend">
                  <span><i className="mobile-quick-dot mobile-quick-dot--online" /> Online</span>
                  <span><i className="mobile-quick-dot mobile-quick-dot--warning" /> Stationary</span>
                  <span><i className="mobile-quick-dot mobile-quick-dot--offline" /> Offline</span>
                </div>
              </>
            )}
          </div>

          <div className="mobile-quick-grid mobile-quick-grid--feed">
            <div className="mobile-quick-card">
              <div className="mobile-quick-card__title">Recent notifications</div>
              <div className="mobile-quick-list">
                {recentNotifications.length === 0 && <div className="mobile-quick-empty">No recent live notification updates in this scope.</div>}
                {recentNotifications.map((asset) => (
                  <button key={asset.id} type="button" className="mobile-quick-list-item" onClick={() => openAssetRoute(asset, "/Track/tracking/live")}>
                    <div>
                      <strong>{assetLabel(asset)}</strong>
                      <span>{normalizeText(asset.lastNotificationValue)}</span>
                    </div>
                    <small>{formatRelative(asset.lastPosition || asset.lastSeen)}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="mobile-quick-card">
              <div className="mobile-quick-card__title">Fleet status</div>
              <div className="mobile-quick-list">
                {assetsLoading && <div className="mobile-quick-empty">Loading assets...</div>}
                {!assetsLoading && filteredAssets.length === 0 && <div className="mobile-quick-empty">No assets found for this mobile context.</div>}
                {filteredAssets.slice(0, 10).map((asset) => {
                  const status = computeAssetDotStatus({
                    availability: asset.availabilityStatus ?? asset.status,
                    lastSeen: asset.lastSeen,
                    lastPosition: asset.lastPosition,
                    lastTrip: asset.lastTrip,
                    speed: asset.speed,
                    movement: asset.movement,
                    staleHours: 2,
                  });
                  return (
                    <div key={asset.id} className="mobile-quick-asset-row">
                      <div className="mobile-quick-asset-row__main">
                        <span className={`mobile-quick-dot mobile-quick-dot--${status}`} />
                        <div>
                          <strong>{assetLabel(asset)}</strong>
                          <span>{normalizeText(asset.site) || "No site"} · {formatRelative(asset.lastSeen || asset.lastPosition)}</span>
                          <span>{locationLabelForAsset(asset)}</span>
                        </div>
                      </div>
                      <div className="mobile-quick-asset-row__actions">
                        <button type="button" onClick={() => openAssetRoute(asset, "/Track/tracking/live")}>Live</button>
                        <button type="button" onClick={() => openAssetRoute(asset, "/Track/tracking/historical")}>History</button>
                        <button type="button" onClick={() => openMapsForAsset(asset)}>Maps</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {(activeSection === "overview" || activeSection === "history") && (
        <section className="mobile-quick-panel">
          <div className="mobile-quick-panel__head">
            <div>
              <h2>Historical tracking quick check</h2>
              <p>Pull a compact trip summary for one asset, then jump into the full map timeline if deeper analysis is needed.</p>
            </div>
            <button
              type="button"
              className="mobile-quick-btn"
              onClick={() => selectedHistoryAsset && openAssetRoute(selectedHistoryAsset, "/Track/tracking/historical")}
              disabled={!selectedHistoryAsset}
            >
              Open full history
            </button>
          </div>

          <div className="mobile-quick-grid mobile-quick-grid--history-controls">
            <label>
              Asset
              <select value={historyAssetId} onChange={(event) => setHistoryAssetId(event.target.value)}>
                {filteredAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>
                ))}
              </select>
            </label>
            <div className="mobile-quick-range-pills" role="tablist" aria-label="History range">
              {(Object.keys(HISTORY_RANGE_LABELS) as HistoryPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`mobile-quick-pill${historyPreset === preset ? " active" : ""}`}
                  onClick={() => setHistoryPreset(preset)}
                >
                  {HISTORY_RANGE_LABELS[preset]}
                </button>
              ))}
            </div>
          </div>

          <div className="mobile-quick-grid mobile-quick-grid--history-summary">
            <article className="mobile-quick-card">
              <div className="mobile-quick-card__title">Range summary</div>
              {historyLoading && <div className="mobile-quick-empty">Loading historical summary...</div>}
              {!historyLoading && historySummary && (
                <div className="mobile-quick-history-meta">
                  <div><span>Trips</span><strong>{historySummary.trips.length}</strong></div>
                  <div><span>Events</span><strong>{historySummary.events.length}</strong></div>
                  <div>
                    <span>Total distance</span>
                    <strong>
                      {formatDistanceKm(historySummary.trips.reduce((sum, trip) => sum + Number((trip as any)?.distance ?? 0), 0))}
                    </strong>
                  </div>
                  <div><span>From</span><strong>{formatDateTime(historySummary.fromIso)}</strong></div>
                </div>
              )}
            </article>

            <article className="mobile-quick-card">
              <div className="mobile-quick-card__title">Recent trips</div>
              <div className="mobile-quick-list">
                {!historyLoading && (!historySummary || historySummary.trips.length === 0) && (
                  <div className="mobile-quick-empty">No trips were returned for this range.</div>
                )}
                {(historySummary?.trips ?? []).slice(0, 6).map((trip, index) => (
                  <div key={`${(trip as any)?.startTime ?? index}`} className="mobile-quick-trip-item">
                    <strong>{formatDistanceKm((trip as any)?.distance)}</strong>
                    <span>{formatDateTime((trip as any)?.startTime)} → {formatDateTime((trip as any)?.endTime)}</span>
                    <small>Max speed: {Number((trip as any)?.maxSpeed ?? 0).toFixed(0)} km/h</small>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      )}

      {(activeSection === "overview" || activeSection === "share") && (
        <section className="mobile-quick-panel">
          <div className="mobile-quick-panel__head">
            <div>
              <h2>Location share</h2>
              <p>Create a live share link from the phone, copy it instantly, or send it by email.</p>
            </div>
            <button type="button" className="mobile-quick-btn mobile-quick-btn--primary" onClick={handleCreateShare} disabled={!selectedShareAsset || shareBusy}>
              {shareBusy ? "Preparing..." : "Create share link"}
            </button>
          </div>

          <div className="mobile-quick-grid mobile-quick-grid--share">
            <label>
              Asset
              <select value={shareAssetId} onChange={(event) => setShareAssetId(event.target.value)}>
                {filteredAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>
                ))}
              </select>
            </label>
            <label>
              Email recipients
              <input
                type="text"
                placeholder="name@example.com, ops@example.com"
                value={shareRecipients}
                onChange={(event) => setShareRecipients(event.target.value)}
              />
            </label>
            <label className="mobile-quick-field--full">
              Share link
              <input type="text" readOnly value={shareLink} placeholder="Create a link to populate this field" />
            </label>
          </div>

          <div className="mobile-quick-actions-row">
            <button type="button" className="mobile-quick-btn" onClick={handleCopyShare} disabled={!shareLink}>Copy link</button>
            <button type="button" className="mobile-quick-btn" onClick={handleShareLinkNative} disabled={!shareLink}>Share from phone</button>
            {selectedShareAsset && (
              <span className="mobile-quick-share-state">
                {activeShares[selectedShareAsset.id]?.active
                  ? `Live share active${activeShares[selectedShareAsset.id]?.expiresAt ? ` until ${formatDateTime(activeShares[selectedShareAsset.id]?.expiresAt)}` : ""}`
                  : "No active share for this asset yet"}
              </span>
            )}
          </div>

          {shareExpiresAt && <div className="mobile-quick-note">Link expires: {formatDateTime(shareExpiresAt)}</div>}
          {shareStatus && <div className="mobile-quick-note">{shareStatus}</div>}
        </section>
      )}

      {(activeSection === "overview" || activeSection === "access") && (
        <section className="mobile-quick-panel">
          <div className="mobile-quick-panel__head">
            <div>
              <h2>Quick access</h2>
              <p>Fast links for the three pages field users need most on phone.</p>
            </div>
          </div>
          <div className="mobile-quick-shortcuts">
            {[
              {
                label: "Live Tracking",
                hint: "Open the full fleet live map",
                onClick: () => {
                  const asset = filteredAssets[0];
                  if (asset) {
                    openAssetRoute(asset, "/Track/tracking/live");
                    return;
                  }
                  applyCurrentContextForNavigation();
                  navigate("/Track/tracking/live");
                }
              },
              {
                label: "Historical Tracking",
                hint: "Deep-dive into historical movement",
                onClick: () => {
                  if (selectedHistoryAsset) {
                    openAssetRoute(selectedHistoryAsset, "/Track/tracking/historical");
                    return;
                  }
                  applyCurrentContextForNavigation();
                  navigate("/Track/tracking/historical");
                }
              },
              {
                label: "Notifications Settings",
                hint: "Open notification administration",
                onClick: openNotificationsSettings
              },
            ].map((shortcut) => (
              <button key={shortcut.label} type="button" className="mobile-quick-shortcut" onClick={shortcut.onClick}>
                <strong>{shortcut.label}</strong>
                <span>{shortcut.hint}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}