import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { JourneyRouteDetail, LatLng } from "../../utils/journeyRouteDetails";
import { downloadJourneyRoutePdf } from "../../utils/journeyRoutePdf";
import { buildLiveAssetMapIcon, journeyHealthToMapStatus } from "../../utils/liveAssetMapIcon";
import { fetchRoadTrailThroughWaypoints, formatMeasureDistance } from "../../utils/mapRoadRoute";
import "leaflet/dist/leaflet.css";

type JourneyRouteMapModalProps = {
  detail: JourneyRouteDetail;
  onClose: () => void;
  onOpenTimeline: () => void;
};

type MapLayerKey = "roadmap" | "terrain" | "satellite" | "hybrid";

const googleLayers: Record<MapLayerKey, { url: string; attribution: string; label: string }> = {
  roadmap: {
    url: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps",
    label: "Road"
  },
  terrain: {
    url: "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps",
    label: "Terrain"
  },
  satellite: {
    url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps",
    label: "Satellite"
  },
  hybrid: {
    url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps",
    label: "Hybrid"
  }
};

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(points.map((p) => [p[0], p[1]] as [number, number]), { padding: [36, 36] });
  }, [map, points]);
  return null;
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

export default function JourneyRouteMapModal({ detail, onClose, onOpenTimeline }: JourneyRouteMapModalProps) {
  const [mapLayer, setMapLayer] = useState<MapLayerKey>("roadmap");
  const [roadPlannedPath, setRoadPlannedPath] = useState<LatLng[]>([]);
  const [roadDistanceKm, setRoadDistanceKm] = useState<number | null>(null);
  const [trailDistanceLabel, setTrailDistanceLabel] = useState("");

  const waypointPath = useMemo<LatLng[]>(() => {
    if (detail.plannedPath.length > 1) return detail.plannedPath;
    return detail.stops
      .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
      .map((stop) => [stop.lat, stop.lng] as LatLng);
  }, [detail.plannedPath, detail.stops]);

  useEffect(() => {
    let cancelled = false;
    if (waypointPath.length < 2) {
      setRoadPlannedPath([]);
      setRoadDistanceKm(null);
      setTrailDistanceLabel("");
      return;
    }

    const run = async () => {
      const route = await fetchRoadTrailThroughWaypoints(waypointPath);
      if (cancelled) return;
      const path = route.points.map((point) => [point.lat, point.lng] as LatLng);
      setRoadPlannedPath(path.length >= 2 ? path : waypointPath);
      const km = route.meters > 0 ? Number((route.meters / 1000).toFixed(2)) : null;
      setRoadDistanceKm(km);
      setTrailDistanceLabel(route.meters > 0 ? formatMeasureDistance(route.meters) : "");
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [waypointPath]);

  const plannedPath = roadPlannedPath.length >= 2 ? roadPlannedPath : waypointPath;
  const distanceKm = roadDistanceKm ?? detail.distanceKm;
  const allPoints: LatLng[] = plannedPath.length
    ? plannedPath
    : detail.stops.map((stop) => [stop.lat, stop.lng] as LatLng);
  const current =
    detail.coveredPath.length > 0
      ? detail.coveredPath[detail.coveredPath.length - 1]
      : detail.started
        ? plannedPath[0]
        : null;
  const layer = googleLayers[mapLayer] ?? googleLayers.roadmap;
  const vehicleIcon = useMemo(
    () =>
      buildLiveAssetMapIcon({
        status: journeyHealthToMapStatus(detail.health),
        showDirectionArrow: detail.started,
        headingDeg: detail.started ? 35 : 0
      }),
    [detail.health, detail.started]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="journey-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Map for ${detail.routeName}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="journey-modal journey-modal--map">
        <header className="journey-modal-head">
          <div>
            <div className="journey-modal-kicker">Route map · stays on Tracking</div>
            <h2>{detail.routeName}</h2>
            <p>
              {detail.workflowName} · {detail.site} · {detail.lead}
            </p>
          </div>
          <div className="journey-modal-head-actions">
            <button
              type="button"
              className="journey-btn ghost"
              onClick={() =>
                downloadJourneyRoutePdf({
                  ...detail,
                  distanceKm,
                  plannedPath
                })
              }
            >
              Download PDF
            </button>
            <button type="button" className="journey-btn ghost" onClick={onOpenTimeline}>
              Timeline
            </button>
            <button type="button" className="journey-btn ghost journey-modal-close-btn" onClick={onClose}>
              Close
            </button>
            <button type="button" className="journey-modal-close" onClick={onClose} aria-label="Close map" title="Close">
              ×
            </button>
          </div>
        </header>

        <div className="journey-modal-body journey-modal-body--map">
          <div className="journey-map-canvas">
            <div className="journey-map-layers" role="group" aria-label="Map layer">
              {(Object.keys(googleLayers) as MapLayerKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={mapLayer === key ? "is-active" : undefined}
                  onClick={() => setMapLayer(key)}
                >
                  {googleLayers[key].label}
                </button>
              ))}
            </div>
            <MapContainer
              center={allPoints[0] ?? [0.35, 32.58]}
              zoom={11}
              className="journey-leaflet"
              scrollWheelZoom
            >
              <TileLayer
                key={mapLayer}
                subdomains="0123"
                url={layer.url}
                attribution={layer.attribution}
              />
              <InvalidateSize />
              <FitBounds points={allPoints} />
              {plannedPath.length > 1 && (
                <Polyline
                  positions={plannedPath}
                  pathOptions={{ color: "#0f766e", weight: 5, opacity: 0.9 }}
                />
              )}
              {detail.coveredPath.length > 1 && (
                <Polyline
                  positions={detail.coveredPath}
                  pathOptions={{ color: "#16a34a", weight: 6, opacity: 0.95 }}
                />
              )}
              {detail.stops.map((stop) => {
                const color =
                  stop.kind === "start"
                    ? "#16a34a"
                    : stop.kind === "destination"
                      ? "#dc2626"
                      : stop.status === "skipped"
                        ? "#ef4444"
                        : stop.status === "current"
                          ? "#0284c7"
                          : stop.status === "arrived"
                            ? "#16a34a"
                            : "#0284c7";
                return (
                  <CircleMarker
                    key={stop.id}
                    center={[stop.lat, stop.lng]}
                    radius={stop.kind === "stop" ? 8 : 10}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 2 }}
                  >
                    <Popup>
                      <strong>{stop.name}</strong>
                      <br />
                      {stop.kind} · {stop.status}
                      <br />
                      ETA {stop.eta}
                      {stop.dwellMinutes ? ` · dwell ${stop.dwellMinutes}m` : ""}
                    </Popup>
                  </CircleMarker>
                );
              })}
              {current && (
                <Marker position={current} icon={vehicleIcon}>
                  <Popup>
                    <strong>{detail.vehicle.registration}</strong>
                    <br />
                    {detail.driver.name}
                    <br />
                    {detail.progressPercent}% covered · {detail.fuelUsedLiters} L fuel
                  </Popup>
                </Marker>
              )}
            </MapContainer>
            <div className="journey-map-legend">
              <span>
                <i className="lg-planned" /> Planned
              </span>
              <span>
                <i className="lg-covered" /> Covered
              </span>
              <span>
                <i className="lg-vehicle" /> Vehicle
              </span>
              <span>
                <i className="lg-stop" /> Stops
              </span>
            </div>
            {trailDistanceLabel ? (
              <p className="journey-map-trail-note">
                Trail shows planned road movement · ~{trailDistanceLabel} from start through stops/rest points to the
                end.
              </p>
            ) : null}
          </div>

          <aside className="journey-map-side">
            <div className="journey-map-progress">
              <div className="journey-map-progress-label">
                <strong>{detail.started ? `${detail.progressPercent}% covered` : "Not started"}</strong>
                <span>
                  {detail.coveredKm} / {distanceKm} km
                </span>
              </div>
              <div className="journey-map-progress-bar" aria-hidden="true">
                <span style={{ width: `${detail.started ? detail.progressPercent : 0}%` }} />
              </div>
            </div>

            <dl className="journey-map-facts">
              <div>
                <dt>Driver</dt>
                <dd>
                  {detail.driver.name}
                  <small>{detail.driver.phone}</small>
                </dd>
              </div>
              <div>
                <dt>License</dt>
                <dd>{detail.driver.license}</dd>
              </div>
              <div>
                <dt>Registration</dt>
                <dd>{detail.vehicle.registration}</dd>
              </div>
              <div>
                <dt>Vehicle</dt>
                <dd>
                  {detail.vehicle.make} · {detail.vehicle.type}
                </dd>
              </div>
              <div>
                <dt>Site</dt>
                <dd>{detail.site}</dd>
              </div>
              <div>
                <dt>Region / lead</dt>
                <dd>{detail.region}</dd>
              </div>
              <div>
                <dt>Fuel used</dt>
                <dd>
                  {detail.started ? `${detail.fuelUsedLiters} L` : "—"}
                  <small>{detail.fuelRateLPer100Km} L/100km</small>
                </dd>
              </div>
              <div>
                <dt>Avg speed</dt>
                <dd>{detail.started ? `${detail.speedAvgKph} km/h` : "—"}</dd>
              </div>
              <div>
                <dt>Departed</dt>
                <dd>{detail.departedAt ?? "—"}</dd>
              </div>
              <div>
                <dt>ETA destination</dt>
                <dd>{detail.etaDestination}</dd>
              </div>
              <div>
                <dt>Health</dt>
                <dd>
                  <span className={`journey-pill ${detail.health}`}>{detail.health}</span>
                  {detail.exception ? ` · ${detail.exception}` : ""}
                </dd>
              </div>
            </dl>

            <div className="journey-map-stops">
              <h3>Stops</h3>
              <ol>
                {detail.stops.map((stop) => (
                  <li key={stop.id} className={`is-${stop.status}`}>
                    <strong>{stop.name}</strong>
                    <span>
                      {stop.kind} · {stop.status} · ETA {stop.eta}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
