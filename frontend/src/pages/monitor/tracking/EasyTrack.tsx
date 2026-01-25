import { useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import { useNavigate } from "react-router-dom";
import StreetViewMini from "../../../components/StreetViewMini";
import "../../../index.css";

const assets = [
  {
    id: "asset-1",
    name: "Knuckle Boom Truck - UBS522G",
    organisation: "Africa - MiXEA - Transfleet Services - CPP East Africa",
    site: "China Petrol Pipeline Engineering Co.Ltd - Uganda",
    location: "FEEDER LINE and PIPELINE Temporary Easement / 30.0 9 MF",
    lastPosition: "13/01/2026 11:13:46 (EAT)",
    speed: "0 km/h",
    driver: "Unknown",
    heading: "WSW",
    ignition: "Not available",
    fuel: "74%",
    status: "live",
    lat: 1.715,
    lng: 32.468
  },
  {
    id: "asset-2",
    name: "Bulk Hauler - UBE101P",
    organisation: "Africa - MiXEA - Transfleet Services - CPP East Africa",
    site: "China Petrol Pipeline Engineering Co.Ltd - Uganda",
    location: "Kampala Northern Bypass",
    lastPosition: "13/01/2026 10:42:11 (EAT)",
    speed: "35 km/h",
    driver: "S. Mugisa",
    heading: "NE",
    ignition: "On",
    fuel: "58%",
    status: "live",
    lat: 0.357,
    lng: 32.582
  },
  {
    id: "asset-3",
    name: "Service Truck - UCA771P",
    organisation: "Africa - MiXEA - Transfleet Services - CPP East Africa",
    site: "China Petrol Pipeline Engineering Co.Ltd - Uganda",
    location: "Entebbe Road",
    lastPosition: "13/01/2026 09:24:02 (EAT)",
    speed: "12 km/h",
    driver: "P. Namugga",
    heading: "SE",
    ignition: "On",
    fuel: "46%",
    status: "parked",
    lat: 0.182,
    lng: 32.534
  }
];

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

const getNetworkStatus = (asset: (typeof assets)[number]) => {
  if (asset.status === "offline") return "offline";
  if (asset.status === "parked") return "parked";
  return "live";
};

const buildAssetIcon = (asset: (typeof assets)[number]) => {
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

export default function EasyTrack() {
  const navigate = useNavigate();
  const mapRef = useRef<L.Map | null>(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mapLayerSelectRef = useRef<HTMLSelectElement | null>(null);
  const [measureMode, setMeasureMode] = useState<"distance" | "area" | null>(null);
  const [mapLayer, setMapLayer] = useState("google-street");
  const [selectedAsset, setSelectedAsset] = useState<(typeof assets)[number] | null>(null);
  const [showMapRotate, setShowMapRotate] = useState(false);
  const [mapRotation, setMapRotation] = useState(0);
  const googleMapsKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

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

  const setAssetContext = (asset: (typeof assets)[number]) => {
    const assetLabel = asset.name;
    localStorage.setItem("vivi.activeAsset", assetLabel);
    localStorage.setItem("vivi.activeRegistration", asset.name);
    localStorage.setItem("vivi.activeSite", asset.site ?? "—");
    localStorage.removeItem("vivi.contextType");
    localStorage.removeItem("vivi.contextName");
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const handleViewLiveTracking = (asset: (typeof assets)[number]) => {
    setAssetContext(asset);
    navigate("/monitor/tracking/live");
  };

  const handleOpenAssetsWindow = () => {
    window.open("/monitor/fleet/assets", "_blank", "noopener,noreferrer");
  };

  const handleCreateLocation = () => {
    navigate("/monitor/tracking/manage-locations");
  };

  const handleAlerts = () => {
    navigate("/manage/notifications/satellite-assisted-notifications");
  };

  const handleFind = () => {
    searchInputRef.current?.focus();
  };

  const handleSelectAndZoom = () => {
    const zoom = mapRef.current?.getZoom() ?? 7;
    mapRef.current?.setView(mapCenter, zoom);
    setMeasureMode(null);
    setShowMapRotate(false);
  };

  const handleMeasureDistance = () => {
    setMeasureMode("distance");
    setShowMapRotate(false);
  };

  const handleMeasureArea = () => {
    setMeasureMode("area");
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
  return (
    <div className="page easytrack-map-page">
      <section className="live-map easytrack-map" ref={mapSectionRef}>
        <div className="easytrack-map-canvas" style={{ transform: `rotate(${mapRotation}deg)` }}>
          <MapContainer
            center={mapCenter}
            zoom={7}
            scrollWheelZoom
            className="easytrack-leaflet"
            ref={mapRef}
          >
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
            <MarkerClusterGroup chunkedLoading>
              {assets.map((asset) => (
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
            </MarkerClusterGroup>
          </MapContainer>
        </div>

        <div className="map-top-tools" aria-label="Map top tools">
          <button
            type="button"
            className="map-top-tool"
            data-tooltip="Query point on map"
            aria-label="Query point on map"
            data-toast-ignore
            onClick={handleFind}
          >
            ❓
            <span className="easytrack-icon-id">1</span>
          </button>
          <button
            type="button"
            className="map-top-tool"
            data-tooltip="Select and zoom"
            aria-label="Select and zoom"
            data-toast-ignore
            onClick={handleSelectAndZoom}
          >
            🔍
            <span className="easytrack-icon-id">2</span>
          </button>
          <button
            type="button"
            className="map-top-tool"
            data-tooltip="Measure distance"
            aria-label="Measure distance"
            data-toast-ignore
            onClick={handleMeasureDistance}
          >
            ↔
            <span className="easytrack-icon-id">3</span>
          </button>
          <button
            type="button"
            className="map-top-tool"
            data-tooltip="Measure area"
            aria-label="Measure area"
            data-toast-ignore
            onClick={handleMeasureArea}
          >
            ⬠
            <span className="easytrack-icon-id">4</span>
          </button>
        </div>

        <div className="easytrack-search-bar" role="search">
          <span className="easytrack-search-icon">🔍</span>
          <input placeholder="Search for asset" ref={searchInputRef} />
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

        <div className="easytrack-mini-tools" aria-label="Quick map tools">
          <button type="button" aria-label="Alerts" data-toast-ignore onClick={handleAlerts}>
            🔔
            <span className="easytrack-icon-id">5</span>
          </button>
          <button type="button" aria-label="Locations" data-toast-ignore onClick={handleCreateLocation}>
            📍
            <span className="easytrack-icon-id">6</span>
          </button>
          <button type="button" aria-label="Layers" data-toast-ignore onClick={() => mapLayerSelectRef.current?.focus()}>
            🗺️
            <span className="easytrack-icon-id">7</span>
          </button>
        </div>

        <div className="easytrack-map-controls" aria-label="Map controls">
          <button type="button" aria-label="Layers" data-toast-ignore onClick={() => mapLayerSelectRef.current?.focus()}>
            🗺️
            <span className="easytrack-icon-id">8</span>
          </button>
          <div className="easytrack-zoom">
            <button
              type="button"
              aria-label="Zoom in"
              data-toast-ignore
              onClick={() => mapRef.current?.zoomIn()}
            >
              ＋
              <span className="easytrack-icon-id">9</span>
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              data-toast-ignore
              onClick={() => mapRef.current?.zoomOut()}
            >
              －
              <span className="easytrack-icon-id">10</span>
            </button>
          </div>
        </div>

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
              data-tooltip="Query point on map"
              aria-label="Query point on map"
              data-toast-ignore
              onClick={handleFind}
            >
              🔍
              <span className="easytrack-icon-id">11</span>
            </button>
            <button
              type="button"
              className="map-tool"
              data-tooltip="Create geofence"
              aria-label="Create geofence"
              data-toast-ignore
              onClick={handleCreateLocation}
            >
              📍
              <span className="easytrack-icon-id">12</span>
            </button>
            <button
              type="button"
              className="map-tool"
              data-tooltip="View many assets (new window)"
              aria-label="View many assets in new window"
              data-toast-ignore
              onClick={handleOpenAssetsWindow}
            >
              ⌖
              <span className="easytrack-icon-id">13</span>
            </button>
            <button
              type="button"
              className="map-tool"
              data-tooltip="Map layers"
              aria-label="Map layers"
              data-toast-ignore
              onClick={() => mapLayerSelectRef.current?.focus()}
            >
              🗂
              <span className="easytrack-icon-id">14</span>
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
              <span className="easytrack-icon-id">15</span>
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
              <span className="easytrack-icon-id">16</span>
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
              <span className="easytrack-icon-id">17</span>
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
        {measureMode && (
          <div className="map-measure-badge" role="status">
            <span>{measureMode === "distance" ? "Measuring distance" : "Measuring area"}</span>
            <button
              type="button"
              aria-label="Clear measurement"
              data-toast-ignore
              onClick={() => setMeasureMode(null)}
            >
              ✕
            </button>
          </div>
        )}
        <div className="map-attribution">Map preview placeholder</div>
      </section>
    </div>
  );
}
