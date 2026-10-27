import { useEffect, useMemo, useRef, useState } from "react";
import "../../../mapStyles";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import { useNavigate } from "react-router-dom";
import StreetViewMini from "../../../components/StreetViewMini";
import { getApiKey, getAssetsFromApi, getTenantId, buildApiUrl, getBindings } from "../../../utils/api";
import { computeAssetDotStatus } from "../../../utils/assetStatus";
import {
  clearUserPref,
  USER_PREF_KEYS,
  writeActiveAssetPrefs
} from "../../../utils/userAppPrefs";
import { useFleetFilterOptional } from "../../../contexts/FleetFilterContext";
import { FleetFilterBar } from "../../../components/FleetFilterBar";
import "../../../index.css";

type DotStatus = "online" | "warning" | "stale" | "offline";
type NetworkStatus = "live" | "parked" | "offline";

type EasyAsset = {
  id: string;
  name: string;
  organisation: string;
  site: string;
  location: string;
  lastPosition: string;
  lastSeen?: string;
  lastTrip?: string;
  speed: string;
  driver: string;
  heading: string;
  ignition: string;
  fuel: string;
  status: NetworkStatus;
  lat: number;
  lng: number;
};

type LocationPoint = {
  id: string;
  name: string;
  site: string;
  address: string;
  lat: number;
  lng: number;
};

type ScopeFilter = {
  scope: "dealer" | "org" | "db" | "site" | "asset" | "";
  activeSite: string;
  activeDbSites: Set<string>;
};

const mapCenter: [number, number] = [0.55, 32.45];

const headingToDegrees = (heading: string) => {
  const dir = heading.trim().toUpperCase();
  const lookup: Record<string, number> = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5
  };
  return lookup[dir] ?? 0;
};

const parseSpeedValue = (speed: string) => {
  const num = parseFloat(speed.replace(/[^0-9.]/g, ""));
  return Number.isNaN(num) ? 0 : num;
};

const computeDotStatus = (input: { lastSeen?: unknown; lastTrip?: unknown; speed?: unknown }): DotStatus => {
  return computeAssetDotStatus({
    lastSeen: input.lastSeen,
    lastTrip: input.lastTrip,
    speed: input.speed,
    staleHours: 2
  });
};

const dotToNetwork = (dot: DotStatus): NetworkStatus => {
  if (dot === "online") return "live";
  if (dot === "warning") return "offline";
  return "parked";
};

const getNetworkStatus = (asset: EasyAsset) => {
  const dot = computeDotStatus({ lastSeen: asset.lastSeen ?? asset.lastPosition, lastTrip: asset.lastTrip, speed: asset.speed });
  return dotToNetwork(dot);
};

/** Same white/blue truck badge used on Live Tracking. */
const buildAssetIcon = (asset: EasyAsset) => {
  const network = getNetworkStatus(asset);
  let borderColor = "#16a34a";
  let statusDot = "#16a34a";
  if (network === "parked") {
    borderColor = "#94a3b8";
    statusDot = "#94a3b8";
  } else if (network === "offline") {
    borderColor = "#800000";
    statusDot = "#800000";
  }

  const svg = `<svg width='56' height='56' viewBox='0 0 56 56' xmlns='http://www.w3.org/2000/svg'>
      <defs>
        <filter id='shadow' x='-40%' y='-40%' width='180%' height='180%'>
          <feDropShadow dx='0' dy='2' stdDeviation='1.8' flood-color='rgba(15,23,42,0.32)'/>
        </filter>
      </defs>
      <g filter='url(#shadow)'>
        <circle cx='28' cy='28' r='18' fill='#ffffff' stroke='${borderColor}' stroke-width='3'/>
        <g transform='translate(15.5,18.5)'>
          <rect x='1' y='7.5' width='11.5' height='5.8' rx='1.4' fill='#2563eb' stroke='#1d4ed8' stroke-width='1'/>
          <path d='M12.5 8h4.8l2.2 3v2.8h-9z' fill='#3b82f6' stroke='#1d4ed8' stroke-width='1' stroke-linejoin='round'/>
          <circle cx='4.2' cy='15.2' r='2.1' fill='#1e40af'/>
          <circle cx='16.8' cy='15.2' r='2.1' fill='#1e40af'/>
          <path d='M2 6.8V5.2h5.4V6.8' fill='none' stroke='#1d4ed8' stroke-width='1.3' stroke-linecap='round'/>
        </g>
        <circle cx='13' cy='42' r='5.2' fill='${statusDot}' stroke='#ffffff' stroke-width='2'/>
      </g>
    </svg>`;

  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    popupAnchor: [0, -24]
  });
};

const locationMarkerIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z" fill="#2563eb" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12" cy="9" r="2.5" fill="#fff"/>
    </svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28]
});

const parseFiniteNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const parseGpsCoordinates = (value: unknown): { lat: number; lng: number } | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parts = raw
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const lat = parseFiniteNumber(parts[0]);
  const lng = parseFiniteNumber(parts[1]);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const extractAssetCoordinates = (asset: any): { lat: number; lng: number } | null => {
  const fromTelemetry = {
    lat: parseFiniteNumber(asset?.telemetryLatest?.lat ?? asset?.telemetryLatest?.latitude ?? asset?.telemetryLatest?.data?.lat),
    lng: parseFiniteNumber(
      asset?.telemetryLatest?.lng ??
        asset?.telemetryLatest?.lon ??
        asset?.telemetryLatest?.longitude ??
        asset?.telemetryLatest?.data?.lng ??
        asset?.telemetryLatest?.data?.lon
    )
  };
  if (fromTelemetry.lat !== null && fromTelemetry.lng !== null) {
    if (fromTelemetry.lat >= -90 && fromTelemetry.lat <= 90 && fromTelemetry.lng >= -180 && fromTelemetry.lng <= 180) {
      return { lat: fromTelemetry.lat, lng: fromTelemetry.lng };
    }
  }

  const fromTopLevel = {
    lat: parseFiniteNumber(asset?.lat ?? asset?.latitude),
    lng: parseFiniteNumber(asset?.lng ?? asset?.lon ?? asset?.longitude)
  };
  if (fromTopLevel.lat !== null && fromTopLevel.lng !== null) {
    if (fromTopLevel.lat >= -90 && fromTopLevel.lat <= 90 && fromTopLevel.lng >= -180 && fromTopLevel.lng <= 180) {
      return { lat: fromTopLevel.lat, lng: fromTopLevel.lng };
    }
  }

  return parseGpsCoordinates(asset?.gps ?? asset?.lastGps);
};

const extractLocationPoint = (row: Record<string, unknown>, index: number): LocationPoint | null => {
  const directLat = parseFiniteNumber((row as any).lat ?? (row as any).latitude);
  const directLng = parseFiniteNumber((row as any).lng ?? (row as any).lon ?? (row as any).longitude);

  let lat = directLat;
  let lng = directLng;

  if (lat === null || lng === null) {
    const center = (row as any).center ?? (row as any).geofenceCenter ?? null;
    if (center && typeof center === "object") {
      lat = parseFiniteNumber((center as any).lat ?? (center as any).latitude);
      lng = parseFiniteNumber((center as any).lng ?? (center as any).lon ?? (center as any).longitude);
    }
  }

  if (lat === null || lng === null) {
    const coords = (row as any).coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const cLat = parseFiniteNumber(coords[0]);
      const cLng = parseFiniteNumber(coords[1]);
      if (cLat !== null && cLng !== null) {
        lat = cLat;
        lng = cLng;
      }
    }
  }

  if (lat === null || lng === null) return null;

  const id = String((row as any).id ?? (row as any).locationId ?? `loc-${index + 1}`).trim();
  const name = String((row as any).name ?? (row as any).locationName ?? id).trim() || id;
  return {
    id,
    name,
    site: String((row as any).site ?? "").trim(),
    address: String((row as any).address ?? (row as any).location ?? "").trim(),
    lat,
    lng
  };
};

const normalizeScopeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const readScopeFilter = (): ScopeFilter => {
  if (typeof window === "undefined") return { scope: "", activeSite: "", activeDbSites: new Set() };
  const scope = String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim() as ScopeFilter["scope"];
  const activeSite = normalizeScopeText(window.localStorage.getItem("vivi.activeSite") ?? "");
  let activeDbSites = new Set<string>();
  try {
    const raw = String(window.localStorage.getItem("vivi.activeDbSites") ?? "").trim();
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    activeDbSites = new Set(parsed.map((v) => normalizeScopeText(v)).filter(Boolean));
  } catch {
    activeDbSites = new Set();
  }
  return { scope, activeSite, activeDbSites };
};

const getSiteFilterStorageKey = () => {
  if (typeof window === "undefined") return "vivi.easytrack.siteFilters:global";
  const dbId = String(window.localStorage.getItem("vivi.activeDbId") ?? "").trim();
  const tenantId = String(window.localStorage.getItem("vivi.tenantId") ?? "").trim();
  if (dbId) return `vivi.easytrack.siteFilters:db:${dbId}`;
  if (tenantId) return `vivi.easytrack.siteFilters:tenant:${tenantId}`;
  return "vivi.easytrack.siteFilters:global";
};

const readStoredSiteFilters = (key: string): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = String(window.localStorage.getItem(key) ?? "").trim();
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(parsed.map((v) => String(v ?? "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
};

export default function EasyTrack() {
  const navigate = useNavigate();
  const fleetFilter = useFleetFilterOptional();
  const mapRef = useRef<L.Map | null>(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [AnalyzeMode, setAnalyzeMode] = useState<"distance" | "area" | null>(null);
  const [mapLayer, setMapLayer] = useState("google-street");
  const [assets, setAssets] = useState<EasyAsset[]>([]);
  const [locationPoints, setLocationPoints] = useState<LocationPoint[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<EasyAsset | null>(null);
  const [showMapRotate, setShowMapRotate] = useState(false);
  const [mapRotation, setMapRotation] = useState(0);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(() => readScopeFilter());
  const [assetSearch, setAssetSearch] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedSiteFilters, setSelectedSiteFilters] = useState<Set<string>>(() =>
    readStoredSiteFilters(getSiteFilterStorageKey())
  );
  const googleMapsKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  const buildGoogleTileUrl = (lyrs: string) => {
    const keyPart = googleMapsKey ? `&key=${encodeURIComponent(googleMapsKey)}` : "";
    return `https://mt{s}.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}${keyPart}`;
  };

  const baseLayers: Record<string, { url: string; attribution: string }> = {
    "google-street": {
      url: buildGoogleTileUrl("m"),
      attribution: "&copy; Google Maps"
    },
    "google-terrain": {
      url: buildGoogleTileUrl("p"),
      attribution: "&copy; Google Maps"
    },
    "google-satellite": {
      url: buildGoogleTileUrl("s"),
      attribution: "&copy; Google Maps"
    },
    "google-hybrid": {
      url: buildGoogleTileUrl("y"),
      attribution: "&copy; Google Maps"
    }
  };

  const layerLabelById: Record<string, string> = {
    "google-hybrid": "Hybrid",
    "google-street": "Street",
    "google-terrain": "Terrain",
    "google-satellite": "Satellite"
  };

  const setAssetContext = (asset: EasyAsset) => {
    const assetLabel = asset.name;
    writeActiveAssetPrefs({
      asset: assetLabel,
      registration: asset.name,
      imei: ""
    });
    localStorage.setItem("vivi.activeSite", asset.site ?? "");
    clearUserPref(USER_PREF_KEYS.contextType);
    clearUserPref(USER_PREF_KEYS.contextName);
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const handleViewLiveTracking = (asset: EasyAsset) => {
    setAssetContext(asset);
    navigate("/Track/tracking/live");
  };

  const handleOpenAssetsWindow = () => {
    window.open("/Track/fleet/assets", "_blank", "noopener,noreferrer");
  };

  const handleCreateLocation = () => {
    navigate("/Track/tracking/Control-locations");
  };

  const handleAlerts = () => {
    navigate("/Control/notifications/satellite-assisted-notifications");
  };

  const handleFind = () => {
    setShowFilterPanel((open) => !open);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const handleCycleLayer = () => {
    const order = ["google-hybrid", "google-street", "google-terrain", "google-satellite"];
    const current = order.indexOf(mapLayer);
    const next = current < 0 ? order[0] : order[(current + 1) % order.length];
    setMapLayer(next);
  };

  const handleSelectAndZoom = () => {
    const zoom = mapRef.current?.getZoom() ?? 7;
    mapRef.current?.setView(mapCenter, zoom);
    setAnalyzeMode(null);
    setShowMapRotate(false);
  };

  const handleAnalyzeDistance = () => {
    setAnalyzeMode("distance");
    setShowMapRotate(false);
  };

  const handleAnalyzeArea = () => {
    setAnalyzeMode("area");
    setShowMapRotate(false);
  };

  const toggleMapFullscreen = () => {
    if (!mapSectionRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void mapSectionRef.current.requestFullscreen();
  };
  useEffect(() => {
    const syncScope = () => setScopeFilter(readScopeFilter());
    syncScope();
    window.addEventListener("vivi:contextchange", syncScope);
    window.addEventListener("vivi:orgchange", syncScope);
    return () => {
      window.removeEventListener("vivi:contextchange", syncScope);
      window.removeEventListener("vivi:orgchange", syncScope);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let timer: number | null = null;
    const load = async () => {
      const apiAssets = await getAssetsFromApi<Record<string, unknown>>();
      if (!mounted) return;
      const mapped: EasyAsset[] = apiAssets
        .map((raw, idx) => {
          const id = String((raw as any).id ?? (raw as any).assetId ?? idx);
          const name = String((raw as any).assetDescription ?? (raw as any).description ?? (raw as any).name ?? id);
          const site = String((raw as any).site ?? "");
          const location = String((raw as any).lastLocation ?? (raw as any).location ?? "");
          const lastSeen = String((raw as any).lastSeen ?? (raw as any).last_seen ?? (raw as any).lastPosition ?? (raw as any).last_position ?? "").trim();
          const lastTrip = String((raw as any).lastTrip ?? (raw as any).last_trip ?? "").trim();
          const speedVal = (raw as any).speed ?? (raw as any)?.telemetryLatest?.speed ?? (raw as any)?.telemetryLatest?.io?.Speed ?? "0";
          const heading = String((raw as any).heading ?? (raw as any).course ?? "NE");
          const coords = extractAssetCoordinates(raw);
          if (!coords) return null;
          const dot = computeDotStatus({ lastSeen, lastTrip, speed: speedVal });
          const status = dotToNetwork(dot);
          return {
            id,
            name,
            organisation: String((raw as any).organisation ?? ""),
            site,
            location,
            lastPosition: lastSeen,
            lastSeen: lastSeen || undefined,
            lastTrip: lastTrip || undefined,
            speed: String(speedVal ?? "0"),
            driver: String((raw as any).driver ?? ""),
            heading,
            ignition: String((raw as any).ignition ?? (raw as any)?.telemetryLatest?.io?.Ignition ?? ""),
            fuel: String((raw as any).fuel ?? ""),
            status,
            lat: coords.lat,
            lng: coords.lng
          } as EasyAsset;
        })
        .filter(Boolean) as EasyAsset[];
      setAssets(mapped);
    };
    void load();
    timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => {
      mounted = false;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let timer: number | null = null;

    const loadLocations = async () => {
      const rows = await getBindings<Record<string, unknown>>("locations");
      if (!mounted) return;
      const points = rows
        .map((row, index) => extractLocationPoint(row, index))
        .filter((row): row is LocationPoint => Boolean(row));
      setLocationPoints(points);
    };

    void loadLocations();
    timer = window.setInterval(() => {
      void loadLocations();
    }, 15000);

    const onOrgChange = () => {
      void loadLocations();
    };
    window.addEventListener("vivi:orgchange", onOrgChange);

    return () => {
      mounted = false;
      if (timer) window.clearInterval(timer);
      window.removeEventListener("vivi:orgchange", onOrgChange);
    };
  }, []);

  // Optional live updates (same SSE feed as LiveTracking).
  useEffect(() => {
    const tenant = getTenantId();
    const url = buildApiUrl(`/stream/telemetry`) + `?tenant=${encodeURIComponent(tenant)}`;
    const apiKey = getApiKey();
    let cancelled = false;

    const start = async () => {
      try {
        const headers: Record<string, string> = { Accept: "text/event-stream" };
        if (apiKey) headers["x-api-key"] = apiKey;
        if (tenant) headers["x-tenant-id"] = tenant;
        const res = await fetch(url, { headers });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        const processChunk = (chunk: string) => {
          buf += chunk;
          while (buf.indexOf("\n\n") >= 0) {
            const idx = buf.indexOf("\n\n");
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const lines = block.split(/\r?\n/);
            let event = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (event === "telemetry" && data) {
              try {
                const parsed = JSON.parse(data) as any[];
                setAssets((prev) => {
                  const map = new Map(prev.map((a) => [a.id, { ...a }]));
                  for (const ev of parsed) {
                    const id = String(ev.assetId ?? (ev.data && ev.data.assetId) ?? (ev.data && ev.data.id) ?? "");
                    if (!id) continue;
                    if (!map.has(id)) continue;
                    const existing = map.get(id);
                    const payload = ev.data ?? ev;
                    const lat = payload?.data?.lat ?? payload?.lat;
                    const lng = payload?.data?.lng ?? payload?.data?.lon ?? payload?.lng;
                    if (typeof lat !== "number" || typeof lng !== "number") continue;

                    const speed = payload?.data?.speed ?? payload?.speed ?? existing?.speed ?? "0";
                    const heading = payload?.data?.heading ?? payload?.heading ?? existing?.heading ?? "NE";
                    const lastSeen =
                      payload?.data?.lastSeen ??
                      payload?.lastSeen ??
                      payload?.data?.lastPosition ??
                      payload?.lastPosition ??
                      ev?.createdAt ??
                      ev?.created_at ??
                      existing?.lastSeen ??
                      "";
                    const lastTrip = payload?.data?.lastTrip ?? payload?.lastTrip ?? existing?.lastTrip ?? "";

                    const dot = computeDotStatus({ lastSeen, lastTrip, speed });
                    const status = dotToNetwork(dot);

                    const merged: EasyAsset = {
                      id,
                      name: existing?.name ?? id,
                      organisation: existing?.organisation ?? "",
                      site: existing?.site ?? "",
                      location: existing?.location ?? "",
                      lastPosition: String(lastSeen ?? ""),
                      lastSeen: String(lastSeen ?? "") || undefined,
                      lastTrip: String(lastTrip ?? "") || undefined,
                      speed: String(speed ?? "0"),
                      driver: existing?.driver ?? "",
                      heading: String(heading ?? "NE"),
                      ignition: existing?.ignition ?? "",
                      fuel: existing?.fuel ?? "",
                      status,
                      lat,
                      lng
                    };
                    map.set(id, merged);
                  }
                  return Array.from(map.values());
                });
              } catch {
                // ignore
              }
            }
          }
        };

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          processChunk(decoder.decode(value, { stream: true }));
        }
      } catch {
        // ignore
      }
    };

    void start();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableSites = useMemo(() => {
    const unique = new Set<string>();
    for (const asset of assets) {
      const s = String(asset.site ?? "").trim();
      if (s) unique.add(s);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [assets]);

  const siteFilterStorageKey = useMemo(() => getSiteFilterStorageKey(), [scopeFilter]);

  useEffect(() => {
    const restored = readStoredSiteFilters(siteFilterStorageKey);
    if (restored.size > 0) {
      setSelectedSiteFilters(restored);
    }
  }, [siteFilterStorageKey]);

  useEffect(() => {
    setSelectedSiteFilters((current) => {
      if (current.size === 0) return new Set(availableSites);
      const next = new Set(Array.from(current).filter((s) => availableSites.includes(s)));
      if (next.size === 0) return new Set(availableSites);
      return next;
    });
  }, [availableSites]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(siteFilterStorageKey, JSON.stringify(Array.from(selectedSiteFilters)));
    } catch {
      // ignore storage errors
    }
  }, [selectedSiteFilters, siteFilterStorageKey]);

  const visibleAssets = useMemo(() => {
    const scope = scopeFilter.scope;
    const activeSite = scopeFilter.activeSite;
    const dbSites = scopeFilter.activeDbSites;
    const query = String(assetSearch ?? "").trim().toLowerCase();

    const scoped = assets.filter((a) => {
      if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return false;

      const siteText = String(a.site ?? "").trim();
      const siteNorm = normalizeScopeText(siteText);

      if (scope === "db") {
        if (dbSites.size > 0 && !dbSites.has(siteNorm)) return false;
      } else if (scope === "site" || scope === "asset") {
        if (activeSite && siteNorm !== activeSite) return false;
      }

      // Prefer shared Mix-style FleetFilter; fall back to local EasyTrack site chips.
      if (fleetFilter && (fleetFilter.selectedSites.length > 0 || fleetFilter.selectedAssets.length > 0)) {
        if (!fleetFilter.matchesSite(siteText)) return false;
        if (!fleetFilter.matchesAsset(a.name, a.id)) return false;
      } else if (selectedSiteFilters.size > 0 && !selectedSiteFilters.has(siteText)) {
        return false;
      }

      if (!query) return true;
      return (
        String(a.name ?? "").toLowerCase().includes(query) ||
        String(a.driver ?? "").toLowerCase().includes(query) ||
        String(a.site ?? "").toLowerCase().includes(query) ||
        String(a.location ?? "").toLowerCase().includes(query)
      );
    });

    return scoped;
  }, [
    assets,
    scopeFilter,
    assetSearch,
    selectedSiteFilters,
    fleetFilter?.selectedSites,
    fleetFilter?.selectedAssets,
    fleetFilter?.matchesSite,
    fleetFilter?.matchesAsset
  ]);

  const fleetSiteOptions = useMemo(
    () =>
      Array.from(new Set(assets.map((a) => String(a.site ?? "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [assets]
  );
  const fleetAssetOptions = useMemo(
    () =>
      Array.from(new Set(assets.map((a) => String(a.name ?? "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [assets]
  );

  const toggleSiteFilter = (site: string) => {
    setSelectedSiteFilters((current) => {
      const next = new Set(current);
      if (next.has(site)) next.delete(site);
      else next.add(site);
      return next;
    });
  };

  const EasyTrackMapClickHandler = () => {
    const map = useMap();
    useMapEvents({
      click() {
        if (AnalyzeMode) return;
        try {
          map.closePopup();
        } catch {
          // ignore
        }
        setSelectedAsset(null);
        setShowFilterPanel(false);
        setShowMapRotate(false);
      }
    });
    return null;
  };

  return (
    <div className="page easytrack-map-page">
      <FleetFilterBar siteOptions={fleetSiteOptions} assetOptions={fleetAssetOptions} />
      <section className="live-map easytrack-map" ref={mapSectionRef}>
        <div className="easytrack-map-canvas" style={{ transform: `rotate(${mapRotation}deg)` }}>
          <MapContainer
            center={mapCenter}
            zoom={7}
            scrollWheelZoom
            className="easytrack-leaflet"
            ref={mapRef}
          >
            <EasyTrackMapClickHandler />
            <TileLayer
              key={mapLayer}
              subdomains="0123"
              attribution={baseLayers[mapLayer].attribution}
              url={baseLayers[mapLayer].url}
            />
            <MarkerClusterGroup chunkedLoading>
              {visibleAssets.map((asset) => (
                <Marker
                  key={asset.id}
                  position={[asset.lat, asset.lng]}
                  icon={buildAssetIcon(asset)}
                  eventHandlers={{
                    click: () => setSelectedAsset(asset)
                  }}
                >
                  <Popup>
                    <div className="easytrack-popup">
                      <div className="easytrack-popup-title">Asset info</div>
                      <div className="easytrack-popup-body">
                        <div className="easytrack-popup-row">
                          <span>Asset</span>
                          <strong>{asset.name}</strong>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Site</span>
                          <div>{asset.site}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Location</span>
                          <div>{asset.location}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Last position</span>
                          <div>{asset.lastPosition}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Speed</span>
                          <div>{asset.speed}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Driver</span>
                          <div>{asset.driver}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Heading</span>
                          <div>{asset.heading}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Ignition</span>
                          <div>{asset.ignition}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Fuel</span>
                          <div>{asset.fuel}</div>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {locationPoints.map((location) => (
                <Marker
                  key={`location-${location.id}`}
                  position={[location.lat, location.lng]}
                  icon={locationMarkerIcon}
                >
                  <Popup>
                    <div className="easytrack-popup">
                      <div className="easytrack-popup-title">Location</div>
                      <div className="easytrack-popup-body">
                        <div className="easytrack-popup-row">
                          <span>Name</span>
                          <strong>{location.name}</strong>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Site</span>
                          <div>{location.site || "-"}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Address</span>
                          <div>{location.address || "-"}</div>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          </MapContainer>
        </div>

        <div className="easytrack-search-bar" role="search">
          <span className="easytrack-search-icon">🔍</span>
          <input
            placeholder="Search for asset"
            ref={searchInputRef}
            value={assetSearch}
            onChange={(event) => setAssetSearch(event.target.value)}
          />
          <button
            type="button"
            className="easytrack-filter-btn"
            aria-label="Filter"
            data-toast-ignore
            onClick={handleFind}
          >
            <span className="easytrack-filter-pill">Filter</span>
            <span className="easytrack-caret">▾</span>
          </button>
        </div>
        {showFilterPanel && (
          <div className="easytrack-filter-panel" role="dialog" aria-label="Filter assets and sites">
            <div className="easytrack-filter-title">Filter assets and sites</div>
            <div className="easytrack-filter-actions">
              <button
                type="button"
                onClick={() => setSelectedSiteFilters(new Set(availableSites))}
              >
                Select all sites
              </button>
              <button
                type="button"
                onClick={() => setSelectedSiteFilters(new Set())}
              >
                Clear sites
              </button>
            </div>
            <div className="easytrack-filter-sites">
              {availableSites.length === 0 ? (
                <div className="easytrack-filter-empty">No sites available.</div>
              ) : (
                availableSites.map((site) => (
                  <label key={site}>
                    <input
                      type="checkbox"
                      checked={selectedSiteFilters.has(site)}
                      onChange={() => toggleSiteFilter(site)}
                    />
                    <span>{site}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}

        <div className="map-ui">
          <div className="easytrack-layer-dock" role="group" aria-label="Map layer">
            {Object.entries(layerLabelById).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`easytrack-layer-chip${mapLayer === id ? " active" : ""}`}
                aria-pressed={mapLayer === id}
                onClick={() => setMapLayer(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="map-tools" aria-label="Map tools">
            <button
              type="button"
              className="map-tool"
              data-tooltip="Query point on map"
              aria-label="Query point on map"
              data-toast-ignore
              onClick={handleFind}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.2-3.2" />
              </svg>
            </button>
            <button
              type="button"
              className="map-tool"
              data-tooltip="Create geofence"
              aria-label="Create geofence"
              data-toast-ignore
              onClick={handleCreateLocation}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </button>
            <button
              type="button"
              className="map-tool"
              data-tooltip="View many assets (new window)"
              aria-label="View many assets in new window"
              data-toast-ignore
              onClick={handleOpenAssetsWindow}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4h7M4 4v7M20 4h-7M20 4v7M4 20h7M4 20v-7M20 20h-7M20 20v-7" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </button>
            <button
              type="button"
              className="map-tool"
              data-tooltip="Map layers"
              aria-label="Map layers"
              data-toast-ignore
              onClick={handleCycleLayer}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4l8 4-8 4-8-4 8-4z" />
                <path d="M4 12l8 4 8-4" />
                <path d="M4 16l8 4 8-4" />
              </svg>
            </button>
            <button
              type="button"
              className={`map-tool${showMapRotate ? " active" : ""}`}
              data-tooltip="Rotate map"
              aria-label="Rotate map"
              data-toast-ignore
              onClick={() => setShowMapRotate((current) => !current)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
            </button>
            <button
              type="button"
              className="map-tool"
              data-tooltip="Map tools"
              aria-label="Map tools"
              data-toast-ignore
              onClick={() => navigate("/Track/tracking/Control-road-hazards")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.7 6.3a4 4 0 0 1-5.6 5.6l-5 5a2 2 0 0 0 2.8 2.8l5-5a4 4 0 0 1 5.6-5.6l-2.8 2.8 2 2 2.8-2.8z" />
              </svg>
            </button>
            <button
              type="button"
              className="map-tool"
              data-tooltip="Full screen"
              aria-label="Full screen"
              data-toast-ignore
              onClick={toggleMapFullscreen}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9V4h5" />
                <path d="M20 9V4h-5" />
                <path d="M4 15v5h5" />
                <path d="M20 15v5h-5" />
              </svg>
            </button>
          </div>
        </div>
        {showMapRotate && (
          <div className="map-rotate-panel" role="dialog" aria-label="Rotate map">
            <label className="map-rotate-label">
              Rotation: {Math.round(mapRotation)}°
              <input
                type="range"
                min={0}
                max={360}
                value={mapRotation}
                onChange={(event) => setMapRotation(Number(event.target.value))}
              />
            </label>
            <button type="button" className="map-rotate-reset" onClick={() => setMapRotation(0)}>
              Reset
            </button>
          </div>
        )}
        <StreetViewMini
          apiKey={googleMapsKey}
          lat={selectedAsset?.lat}
          lng={selectedAsset?.lng}
          heading={selectedAsset ? headingToDegrees(selectedAsset.heading) : 0}
        />
        {AnalyzeMode && (
          <div className="map-Analyze-badge" role="status">
            <span>{AnalyzeMode === "distance" ? "Measuring distance" : "Measuring area"}</span>
            <button
              type="button"
              aria-label="Clear Analyzement"
              data-toast-ignore
              onClick={() => setAnalyzeMode(null)}
            >
              ✕
            </button>
          </div>
        )}
        <div className="map-attribution">Layer: {layerLabelById[mapLayer] ?? "Street"} • Google Maps</div>
      </section>
    </div>
  );
}
