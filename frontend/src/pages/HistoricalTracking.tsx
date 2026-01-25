import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import { useNavigate } from "react-router-dom";
import "../index.css";

type HistoryAssetRow = {
  id: string;
  registration: string;
  assetDescription: string;
  totalDistance: string;
  events: number;
  hasTrips: boolean;
  hasEvents: boolean;
  trips: HistoryTrip[];
};

type HistoryTrip = {
  id: string;
  start: string;
  end: string;
  duration: string;
  distanceKm: string;
  maxSpeed: string;
  notifications: string[];
};

type HistoryAssetDerived = HistoryAssetRow & {
  tripsInRange: HistoryTrip[];
  eventsInRange: number;
  hasTripsInRange: boolean;
  hasEventsInRange: boolean;
};

type HistoryMapAsset = {
  id: string;
  name: string;
  registration: string;
  site: string;
  lastPosition: string;
  driver: string;
  speed: string;
  heading: string;
  ignition: string;
  fuel: string;
  status?: "live" | "offline" | "parked";
  lat: number;
  lng: number;
};

const historyAssets: HistoryAssetRow[] = [
  {
    id: "1",
    registration: "T196 DRP",
    assetDescription: "M. Benz T196 DRP",
    totalDistance: "814.00",
    events: 0,
    hasTrips: true,
    hasEvents: false,
    trips: []
  },
  {
    id: "2",
    registration: "T312 DRP",
    assetDescription: "M. Benz T312 DRP",
    totalDistance: "19.93",
    events: 4,
    hasTrips: true,
    hasEvents: true,
    trips: [
      {
        id: "t312-1",
        start: "13/01/2026 10:18:16 (EAT)",
        end: "13/01/2026 11:35:15 (EAT)",
        duration: "1:16:59",
        distanceKm: "9.49",
        maxSpeed: "46.00",
        notifications: ["Overspeed", "Harsh braking"]
      },
      {
        id: "t312-2",
        start: "13/01/2026 12:13:59 (EAT)",
        end: "13/01/2026 13:14:10 (EAT)",
        duration: "1:00:11",
        distanceKm: "10.45",
        maxSpeed: "66.00",
        notifications: ["Idle", "Harsh cornering"]
      }
    ]
  },
  {
    id: "3",
    registration: "T313 DRP",
    assetDescription: "M. Benz T313 DRP",
    totalDistance: "2,194.60",
    events: 1,
    hasTrips: true,
    hasEvents: true,
    trips: [
      {
        id: "t313-1",
        start: "19/01/2026 15:55:53 (EAT)",
        end: "19/01/2026 16:02:22 (EAT)",
        duration: "0:06:29",
        distanceKm: "0.00",
        maxSpeed: "0.00",
        notifications: ["Stop"]
      }
    ]
  },
  {
    id: "4",
    registration: "T314 DRP",
    assetDescription: "M. Benz T314 DRP",
    totalDistance: "217.20",
    events: 2,
    hasTrips: true,
    hasEvents: true,
    trips: [
      {
        id: "t314-1",
        start: "20/01/2026 10:43:27 (EAT)",
        end: "20/01/2026 11:57:16 (EAT)",
        duration: "1:13:49",
        distanceKm: "0.00",
        maxSpeed: "0.00",
        notifications: ["Geofence entry", "Geofence exit"]
      }
    ]
  },
  {
    id: "5",
    registration: "T315 DRP",
    assetDescription: "M. Benz T315 DRP",
    totalDistance: "2,194.70",
    events: 0,
    hasTrips: true,
    hasEvents: false,
    trips: []
  },
  {
    id: "6",
    registration: "T127 DNX",
    assetDescription: "MAN T127 DNX",
    totalDistance: "2,427.00",
    events: 11,
    hasTrips: true,
    hasEvents: true,
    trips: [
      {
        id: "t127-1",
        start: "18/01/2026 06:12:00 (EAT)",
        end: "18/01/2026 07:22:41 (EAT)",
        duration: "1:10:41",
        distanceKm: "18.20",
        maxSpeed: "72.00",
        notifications: ["Overspeed", "Harsh braking", "Idle"]
      }
    ]
  },
  {
    id: "7",
    registration: "T133 DNX",
    assetDescription: "MAN T133 DNX",
    totalDistance: "831.00",
    events: 0,
    hasTrips: true,
    hasEvents: false,
    trips: []
  },
  {
    id: "8",
    registration: "T134 DNX",
    assetDescription: "MAN T134 DNX",
    totalDistance: "1,870.86",
    events: 0,
    hasTrips: true,
    hasEvents: false,
    trips: []
  },
  {
    id: "9",
    registration: "T136 DNX",
    assetDescription: "MAN T136 DNX",
    totalDistance: "888.10",
    events: 0,
    hasTrips: true,
    hasEvents: false,
    trips: []
  },
  {
    id: "10",
    registration: "T137 DNX",
    assetDescription: "MAN T137 DNX",
    totalDistance: "1,939.80",
    events: 3,
    hasTrips: true,
    hasEvents: true,
    trips: [
      {
        id: "t137-1",
        start: "20/01/2026 12:09:24 (EAT)",
        end: "20/01/2026 12:20:41 (EAT)",
        duration: "0:11:17",
        distanceKm: "0.00",
        maxSpeed: "0.00",
        notifications: ["Stop"]
      },
      {
        id: "t137-2",
        start: "20/01/2026 12:25:47 (EAT)",
        end: "20/01/2026 13:08:48 (EAT)",
        duration: "0:43:01",
        distanceKm: "0.00",
        maxSpeed: "0.00",
        notifications: ["Stop", "Idle"]
      }
    ]
  },
  {
    id: "11",
    registration: "T141 EJR",
    assetDescription: "MAN T141 EJR",
    totalDistance: "1,853.88",
    events: 0,
    hasTrips: true,
    hasEvents: false,
    trips: []
  },
  {
    id: "12",
    registration: "T189 EJR",
    assetDescription: "MAN T189 EJR",
    totalDistance: "18.84",
    events: 4,
    hasTrips: true,
    hasEvents: true,
    trips: [
      {
        id: "t189-1",
        start: "17/01/2026 08:32:13 (EAT)",
        end: "17/01/2026 08:47:21 (EAT)",
        duration: "0:15:08",
        distanceKm: "4.60",
        maxSpeed: "52.00",
        notifications: ["Harsh braking"]
      }
    ]
  },
  {
    id: "13",
    registration: "T196 EJR",
    assetDescription: "MAN T196 EJR",
    totalDistance: "2,476.72",
    events: 4,
    hasTrips: true,
    hasEvents: true,
    trips: []
  },
  {
    id: "14",
    registration: "T208 EJR",
    assetDescription: "MAN T208 EJR",
    totalDistance: "2,279.56",
    events: 7,
    hasTrips: true,
    hasEvents: true,
    trips: []
  },
  {
    id: "15",
    registration: "T114 DFZ",
    assetDescription: "Scania T114 DFZ",
    totalDistance: "2,085.40",
    events: 0,
    hasTrips: true,
    hasEvents: false,
    trips: []
  },
  {
    id: "16",
    registration: "T147 DFX",
    assetDescription: "Scania T147 DFX",
    totalDistance: "1,608.67",
    events: 0,
    hasTrips: true,
    hasEvents: false,
    trips: []
  }
];

const historyMapCenter: [number, number] = [0.55, 32.45];

const historyMapAssets: HistoryMapAsset[] = [
  {
    id: "history-1",
    name: "M. Benz T312 DRP",
    registration: "T312 DRP",
    site: "LV - Short Haul",
    lastPosition: "13/01/2026 11:35:15 (EAT)",
    driver: "Akili Mangala",
    speed: "42 km/h",
    heading: "NE",
    ignition: "On",
    fuel: "63%",
    status: "live",
    lat: 0.357,
    lng: 32.582
  },
  {
    id: "history-2",
    name: "M. Benz T313 DRP",
    registration: "T313 DRP",
    site: "HV - Long Haul",
    lastPosition: "19/01/2026 16:02:22 (EAT)",
    driver: "Henry Mwambungu",
    speed: "0 km/h",
    heading: "SW",
    ignition: "Off",
    fuel: "48%",
    status: "parked",
    lat: 0.182,
    lng: 32.534
  },
  {
    id: "history-3",
    name: "MAN T127 DNX",
    registration: "T127 DNX",
    site: "LV - Short Haul",
    lastPosition: "18/01/2026 07:22:41 (EAT)",
    driver: "E. Lwanga",
    speed: "58 km/h",
    heading: "E",
    ignition: "On",
    fuel: "71%",
    status: "live",
    lat: 0.55,
    lng: 32.45
  },
  {
    id: "history-4",
    name: "MAN T137 DNX",
    registration: "T137 DNX",
    site: "HV - Long Haul",
    lastPosition: "20/01/2026 13:08:48 (EAT)",
    driver: "R. Namara",
    speed: "12 km/h",
    heading: "SE",
    ignition: "On",
    fuel: "55%",
    status: "offline",
    lat: 0.71,
    lng: 32.31
  },
  {
    id: "history-5",
    name: "Scania T147 DFX",
    registration: "T147 DFX",
    site: "LV - Short Haul",
    lastPosition: "20/01/2026 09:11:03 (EAT)",
    driver: "S. Mugisa",
    speed: "25 km/h",
    heading: "NW",
    ignition: "On",
    fuel: "60%",
    status: "live",
    lat: 0.45,
    lng: 32.32
  }
];

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

const getNetworkStatus = (asset: HistoryMapAsset) => {
  if (asset.status === "offline") return "offline";
  if (asset.status === "parked") return "parked";
  return "live";
};

const buildAssetIcon = (asset: HistoryMapAsset) => {
  const dir = headingToDegrees(asset.heading);
  const network = getNetworkStatus(asset);
  const isStationary = network === "parked";
  return L.divIcon({
    className: "asset-marker-wrapper",
    html: `
      <div class="asset-marker ${network}${isStationary ? " is-stationary" : ""}" style="--dir:${dir}deg">
        <div class="asset-arrow">➤</div>
        <div class="asset-body ${network}">🚚</div>
        <div class="asset-net ${network}"></div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
};

export default function HistoricalTracking() {
  const navigate = useNavigate();
  const [selectedAsset, setSelectedAsset] = useState(() => localStorage.getItem("vivi.activeAsset") || "—");
  const [selectedSite, setSelectedSite] = useState(() => localStorage.getItem("vivi.activeSite") || "—");
  const [contextType, setContextType] = useState(() => localStorage.getItem("vivi.contextType") || "");
  const [contextName, setContextName] = useState(() => localStorage.getItem("vivi.contextName") || "");
  const [selectedRegistration, setSelectedRegistration] = useState(() => {
    const stored = localStorage.getItem("vivi.activeRegistration");
    if (stored) return stored;
    const assetLabel = localStorage.getItem("vivi.activeAsset") || "";
    return assetLabel.includes(" - ") ? assetLabel.split(" - ").slice(-1)[0] : assetLabel || "—";
  });

  const [rangeStart, setRangeStart] = useState(() => {
    const stored = localStorage.getItem("vivi.historyStart");
    if (stored) return stored;
    const fallback = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString().slice(0, 16);
    return fallback;
  });
  const [rangeEnd, setRangeEnd] = useState(() => {
    const stored = localStorage.getItem("vivi.historyTime") || localStorage.getItem("vivi.historyEnd");
    if (stored) return stored;
    return new Date().toISOString().slice(0, 16);
  });
  const [filter, setFilter] = useState("");
  const [showTrips, setShowTrips] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState<number>(560);
  const [dragging, setDragging] = useState(false);
  const [openTripMenu, setOpenTripMenu] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<HistoryTrip | null>(null);
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const mapLayerSelectRef = useRef<HTMLSelectElement | null>(null);
  const [mapLayer, setMapLayer] = useState("google-street");
  const [showMapRotate, setShowMapRotate] = useState(false);
  const [mapRotation, setMapRotation] = useState(0);
  const baseLayers: Record<string, { url: string; attribution: string }> = {
    "google-street": {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    "google-terrain": {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
    },
    "google-satellite": {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri"
    },
    "google-hybrid": {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri"
    }
  };
  const overlayLayers: Record<string, { url: string; attribution: string }> = {
    "google-hybrid": {
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri"
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragging) return;
      const min = 320;
      const max = 780;
      const next = Math.min(max, Math.max(min, event.clientX));
      setSidebarWidth(next);
    };
    const stop = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
    };
  }, [dragging]);

  useEffect(() => {
    const closeMenu = () => setOpenTripMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const parseTripTimestamp = (value: string) => {
    const cleaned = value.replace("(EAT)", "").trim();
    const [datePart, timePart] = cleaned.split(" ");
    if (!datePart || !timePart) return null;
    const [day, month, year] = datePart.split("/").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day, hour || 0, minute || 0, second || 0);
  };

  const derivedAssets = useMemo<HistoryAssetDerived[]>(() => {
    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);
    return historyAssets.map((row) => {
      const tripsInRange = row.trips.filter((trip) => {
        const tripStart = parseTripTimestamp(trip.start);
        const tripEnd = parseTripTimestamp(trip.end);
        if (!tripStart || !tripEnd || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
        return tripStart <= end && tripEnd >= start;
      });
      const eventsInRange = tripsInRange.reduce((sum, trip) => sum + trip.notifications.length, 0);
      return {
        ...row,
        tripsInRange,
        eventsInRange,
        hasTripsInRange: tripsInRange.length > 0,
        hasEventsInRange: eventsInRange > 0
      };
    });
  }, [rangeStart, rangeEnd]);

  const handleShowOnMap = (trip: HistoryTrip) => {
    setSelectedTrip(trip);
    setOpenTripMenu(null);
  };

  const handleShowOnTimeline = (trip: HistoryTrip) => {
    localStorage.setItem("vivi.tripTimelineStart", trip.start);
    localStorage.setItem("vivi.tripTimelineEnd", trip.end);
    localStorage.setItem("vivi.tripTimelineAsset", selectedAsset);
    setOpenTripMenu(null);
    navigate("/monitor/activity/trip-timeline");
  };

  const setAssetContext = (asset: HistoryMapAsset) => {
    const assetLabel = `${asset.name} - ${asset.registration}`;
    localStorage.setItem("vivi.activeAsset", assetLabel);
    localStorage.setItem("vivi.activeRegistration", asset.registration ?? "—");
    localStorage.setItem("vivi.activeSite", asset.site ?? "—");
    localStorage.removeItem("vivi.contextType");
    localStorage.removeItem("vivi.contextName");
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const handleViewLiveTracking = (asset: HistoryMapAsset) => {
    setAssetContext(asset);
    navigate("/monitor/tracking/live");
  };

  const handleCreateLocation = () => {
    navigate("/monitor/tracking/manage-locations");
  };

  const handleNotifications = () => {
    navigate("/manage/notifications/satellite-assisted-notifications");
  };

  const handleOpenAssetsWindow = () => {
    window.open("/monitor/fleet/assets", "_blank", "noopener,noreferrer");
  };

  const handleDownloadSummary = () => {
    const payload = {
      rangeStart,
      rangeEnd,
      asset: selectedAsset,
      site: selectedSite,
      trips: selectedTrip ? [selectedTrip] : [],
      assets: filteredAssets
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "historical-tracking-summary.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const focusFilter = () => {
    filterInputRef.current?.focus();
  };

  const focusLayerSelect = () => {
    mapLayerSelectRef.current?.focus();
  };

  const toggleMapFullscreen = () => {
    if (!mapSectionRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void mapSectionRef.current.requestFullscreen();
  };

  const filteredAssets = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return derivedAssets.filter((row) => {
      const matchesToggle = (showTrips && row.hasTripsInRange) || (showEvents && row.hasEventsInRange);
      if (!matchesToggle) return false;
      if (!query) return true;
      return (
        row.registration.toLowerCase().includes(query)
        || row.assetDescription.toLowerCase().includes(query)
      );
    });
  }, [derivedAssets, filter, showTrips, showEvents]);

  useEffect(() => {
    const updateFromStorage = () => {
      const site = localStorage.getItem("vivi.activeSite") || "—";
      const reg = localStorage.getItem("vivi.activeRegistration");
      const assetLabel = localStorage.getItem("vivi.activeAsset") || selectedAsset;
      const derivedReg = reg || (assetLabel?.includes(" - ") ? assetLabel.split(" - ").slice(-1)[0] : assetLabel);
      const storedContextType = localStorage.getItem("vivi.contextType") || "";
      const storedContextName = localStorage.getItem("vivi.contextName") || "";
      setSelectedAsset(assetLabel || "—");
      setSelectedSite(site || "—");
      setSelectedRegistration(derivedReg || "—");
      setContextType(storedContextType);
      setContextName(storedContextName);
      const storedTime = localStorage.getItem("vivi.historyTime");
      if (storedTime) setRangeEnd(storedTime);
      const storedStart = localStorage.getItem("vivi.historyStart");
      if (storedStart) setRangeStart(storedStart);
    };
    updateFromStorage();
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key?.startsWith("vivi.active")
        || event.key?.startsWith("vivi.context")
        || event.key === "vivi.historyTime"
        || event.key === "vivi.historyStart"
        || event.key === "vivi.historyEnd"
      ) {
        updateFromStorage();
      }
    };
    const handleContextChange = () => updateFromStorage();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("vivi:contextchange", handleContextChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("vivi:contextchange", handleContextChange as EventListener);
    };
  }, [selectedAsset]);

  return (
    <div className="history-page">
      <header className="live-topbar">
        <div className="live-topbar-left">
          <div className="live-topbar-title">Historical tracking</div>
          <div className="history-topbar-range">
            <label className="history-range">
              <span>From</span>
              <input
                type="datetime-local"
                value={rangeStart}
                onChange={(event) => {
                  setRangeStart(event.target.value);
                  localStorage.setItem("vivi.historyStart", event.target.value);
                }}
              />
            </label>
            <label className="history-range">
              <span>To</span>
              <input
                type="datetime-local"
                value={rangeEnd}
                onChange={(event) => {
                  setRangeEnd(event.target.value);
                  localStorage.setItem("vivi.historyTime", event.target.value);
                  localStorage.setItem("vivi.historyEnd", event.target.value);
                }}
              />
            </label>
          </div>
        </div>
        <div className="live-topbar-right">
          <button
            className="live-topbar-chip"
            type="button"
            data-tooltip="Notifications"
            data-toast-ignore
            onClick={handleNotifications}
          >
            <span className="live-chip-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                <path d="M9 19a3 3 0 006 0" />
              </svg>
            </span>
            6
          </button>
          <button
            className="live-topbar-chip"
            type="button"
            data-tooltip="Locations"
            data-toast-ignore
            onClick={handleCreateLocation}
          >
            <span className="live-chip-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
                <circle cx="12" cy="10" r="2.6" />
              </svg>
            </span>
            0
          </button>
          <button
            className="live-topbar-chip"
            type="button"
            data-tooltip="Reports"
            data-nav="/measure/insights/reports?category=Movement%20Reports&report=Summary%20Movement%20Report"
          >
            <span className="live-chip-icon" aria-hidden="true">📊</span>
            Reports
          </button>
        </div>
      </header>

      <div className={`history-layout${sidebarExpanded ? "" : " collapsed"}`}>
        <aside
          className={`history-sidebar${sidebarExpanded ? "" : " collapsed"}`}
          style={{ width: sidebarExpanded ? sidebarWidth : undefined }}
        >
          <div className="history-sidebar-header">
            <div className="history-sidebar-title">Assets</div>
            <button
              type="button"
              className="history-collapse"
              onClick={() => setSidebarExpanded((current) => !current)}
              aria-label={sidebarExpanded ? "Collapse panel" : "Expand panel"}
            >
              {sidebarExpanded ? "❮" : "❯"}
            </button>
          </div>
          <div className="history-search">
            <input
              className="history-input"
              placeholder="Filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              ref={filterInputRef}
            />
          </div>
          <div className="history-toggles">
            <label>
              <input
                type="checkbox"
                checked={showTrips}
                onChange={(event) => setShowTrips(event.target.checked)}
              />
              Assets with trips
            </label>
            <label>
              <input
                type="checkbox"
                checked={showEvents}
                onChange={(event) => setShowEvents(event.target.checked)}
              />
              Assets with events
            </label>
          </div>

          <div className="history-table-wrapper">
            <div className="history-table-head">
              <div>Events</div>
              <div>Registration</div>
              <div>Asset description</div>
              <div>Total distance (km)</div>
            </div>
            <div className="history-table">
              {filteredAssets.length === 0 ? (
                <div className="history-empty">
                  {contextType && contextName
                    ? `No historical trips found for this ${contextType}.`
                    : "No historical trips found for this asset."}
                </div>
              ) : (
                filteredAssets.map((row) => (
                  <div key={row.id} className="history-row-group">
                    <div className="history-row">
                      <div className="history-cell history-events">
                        <button
                          type="button"
                          className="history-expander"
                          aria-label={expandedRows.has(row.id) ? "Collapse row" : "Expand row"}
                          aria-expanded={expandedRows.has(row.id)}
                          onClick={() => toggleRow(row.id)}
                        >
                          {expandedRows.has(row.id) ? "−" : "+"}
                        </button>
                        <span className="history-event-count">{row.eventsInRange}</span>
                      </div>
                      <div className="history-cell">{row.registration}</div>
                      <div className="history-cell history-asset-desc">{row.assetDescription}</div>
                      <div className="history-cell history-distance">{row.totalDistance}</div>
                    </div>
                    {expandedRows.has(row.id) && (
                      <div className="history-row-detail">
                        {row.tripsInRange.length === 0 ? (
                          <div className="history-detail-empty">No trips found in the selected time range.</div>
                        ) : (
                          <div className="history-detail-table">
                            <div className="history-detail-head">
                              <div>Trip start</div>
                              <div>Trip end</div>
                              <div>Duration</div>
                              <div>Distance (km)</div>
                              <div>Max speed (km/h)</div>
                              <div>Notifications</div>
                              <div />
                            </div>
                            {row.tripsInRange.map((trip) => (
                              <div key={trip.id} className="history-detail-row">
                                <div>{trip.start}</div>
                                <div>{trip.end}</div>
                                <div>{trip.duration}</div>
                                <div>{trip.distanceKm}</div>
                                <div>{trip.maxSpeed}</div>
                                <div className="history-notifications-cell">
                                  {trip.notifications.length > 0 && (
                                    <span className="history-notification-icon" aria-hidden="true">🔔</span>
                                  )}
                                  {trip.notifications.join(", ") || "—"}
                                </div>
                                <div className="history-detail-actions">
                                  <button
                                    type="button"
                                    className="history-actions-trigger"
                                    aria-label="Trip actions"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenTripMenu((current) => (current === trip.id ? null : trip.id));
                                    }}
                                  >
                                    ⋯
                                  </button>
                                  {openTripMenu === trip.id && (
                                    <div
                                      className="history-actions-pop"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <button type="button" onClick={() => handleShowOnMap(trip)}>Show on map</button>
                                      <button type="button" onClick={() => handleShowOnTimeline(trip)}>Show on trip timeline</button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <div
          className={`history-resizer${dragging ? " dragging" : ""}`}
          onMouseDown={() => setDragging(true)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
        >
          <span className="history-resizer-dots" aria-hidden="true">⋮</span>
        </div>

        <section className="history-map live-map" ref={mapSectionRef}>
          <div className="map-leaflet-canvas" style={{ transform: `rotate(${mapRotation}deg)` }}>
            <MapContainer center={historyMapCenter} zoom={7} scrollWheelZoom className="map-leaflet">
              <TileLayer
                key={mapLayer}
                attribution={baseLayers[mapLayer].attribution}
                url={baseLayers[mapLayer].url}
              />
              {mapLayer === "google-hybrid" && (
                <TileLayer
                  attribution={overlayLayers[mapLayer].attribution}
                  url={overlayLayers[mapLayer].url}
                />
              )}
              {historyMapAssets.map((asset) => (
                <Marker key={asset.id} position={[asset.lat, asset.lng]} icon={buildAssetIcon(asset)}>
                  <Popup>
                    <div className="easytrack-popup">
                      <div className="easytrack-popup-title">Asset info</div>
                      <div className="easytrack-popup-body">
                        <div className="easytrack-popup-row">
                          <span>Asset</span>
                          <strong>{`${asset.name} - ${asset.registration}`}</strong>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Site</span>
                          <div>{asset.site}</div>
                        </div>
                        <div className="easytrack-popup-row">
                          <span>Location</span>
                          <div>Historical route sample</div>
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
            </MapContainer>
          </div>
          {selectedTrip && (
            <div className="history-map-trip" role="status">
              <div className="history-map-trip-title">Trip selected</div>
              <div className="history-map-trip-meta">{selectedTrip.start} → {selectedTrip.end}</div>
              <div className="history-map-trip-meta">Distance: {selectedTrip.distanceKm} km · Max speed: {selectedTrip.maxSpeed} km/h</div>
              <div className="history-map-trip-meta">Notifications: {selectedTrip.notifications.join(", ") || "—"}</div>
              <svg className="history-map-trip-line" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
                <polyline
                  points="10,90 60,70 90,80 130,50 170,60 210,35 260,45 290,20"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
          <div className="map-ui">
            <select
              className="map-layer-select"
              value={mapLayer}
              aria-label="Map layer"
              ref={mapLayerSelectRef}
              onChange={(event) => setMapLayer(event.target.value)}
            >
              <option value="google-hybrid">Google (hybrid)</option>
              <option value="google-street">Google (street)</option>
              <option value="google-terrain">Google (terrain)</option>
              <option value="google-satellite">Google (satellite)</option>
            </select>

            <div className="map-tools" aria-label="Map tools">
              <button
                type="button"
                className="map-tool"
                data-tooltip="Find"
                aria-label="Find"
                data-toast-ignore
                onClick={focusFilter}
              >
                🔍
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="Create location"
                aria-label="Create location"
                data-toast-ignore
                onClick={handleCreateLocation}
              >
                📍
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="View many assets in new window"
                aria-label="View many assets in new window"
                data-toast-ignore
                onClick={handleOpenAssetsWindow}
              >
                ⌖
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="Map layers"
                aria-label="Map layers"
                data-toast-ignore
                onClick={focusLayerSelect}
              >
                🗂
              </button>
              <button
                type="button"
                className={`map-tool${showMapRotate ? " active" : ""}`}
                data-tooltip="Rotate map"
                aria-label="Rotate map"
                data-toast-ignore
                onClick={() => setShowMapRotate((current) => !current)}
              >
                ⟳
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="Map tools"
                aria-label="Map tools"
                data-toast-ignore
                onClick={() => navigate("/monitor/tracking/manage-road-hazards")}
              >
                🔧
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="Full screen"
                aria-label="Full screen"
                data-toast-ignore
                onClick={toggleMapFullscreen}
              >
                ⤢
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

          <div className="history-map-toolbar" aria-label="Map actions">
            <button
              type="button"
              className="history-map-btn"
              data-tooltip="Find"
              aria-label="Find"
              data-toast-ignore
              onClick={focusFilter}
            >
              🔎
            </button>
            <button
              type="button"
              className="history-map-btn"
              data-tooltip="Create location"
              aria-label="Create location"
              data-toast-ignore
              onClick={handleCreateLocation}
            >
              📍
            </button>
            <button
              type="button"
              className="history-map-btn"
              data-tooltip="Download"
              aria-label="Download"
              data-toast-ignore
              onClick={handleDownloadSummary}
            >
              ⤓
            </button>
            <button
              type="button"
              className="history-map-btn"
              data-tooltip="Compass"
              aria-label="Compass"
              data-toast-ignore
              onClick={() => setSelectedTrip(null)}
            >
              🧭
            </button>
            <button
              type="button"
              className="history-map-btn"
              data-tooltip="Settings"
              aria-label="Settings"
              data-toast-ignore
              onClick={() => navigate("/monitor/tracking/manage-road-hazards")}
            >
              ⚙️
            </button>
          </div>

          <div className="map-attribution">Map preview placeholder</div>
        </section>
      </div>
    </div>
  );
}
