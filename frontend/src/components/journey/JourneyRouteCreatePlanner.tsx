import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { fetchRoadTrailThroughWaypoints, formatMeasureDistance } from "../../utils/mapRoadRoute";
import { reverseGeocodeLabel, resolveLocationQuery } from "../../utils/routeGeocode";
import "leaflet/dist/leaflet.css";

export type PlannerWaypoint = {
  id: string;
  kind: "start" | "stop" | "rest" | "destination";
  name: string;
  query: string;
  lat: number | null;
  lng: number | null;
};

type MapLayerKey = "roadmap" | "terrain" | "satellite" | "hybrid";

const DEFAULT_CENTER: [number, number] = [49.2827, -123.1207];
const LOCATION_PLACEHOLDER = "Vancouver Canada or 49.2827, -123.1207";

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

function pinIcon(kind: PlannerWaypoint["kind"], active: boolean) {
  const fill =
    kind === "start"
      ? "#059669"
      : kind === "destination"
        ? "#dc2626"
        : kind === "rest"
          ? "#d97706"
          : "#0284c8";
  const size = active ? 34 : 26;
  const ring = active ? `<circle cx="12" cy="12" r="10" fill="none" stroke="#fbbf24" stroke-width="3"/>` : "";
  return L.divIcon({
    className: "journey-planner-pin",
    html: `<svg width="${size}" height="${Math.round(size * 1.5)}" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z" fill="${fill}"/>
      ${ring}
      <circle cx="12" cy="12" r="5" fill="#fff"/>
    </svg>`,
    iconSize: [size, Math.round(size * 1.5)],
    iconAnchor: [size / 2, Math.round(size * 1.5)],
    popupAnchor: [0, -Math.round(size * 1.4)]
  });
}

function FitTrail({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 13));
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
  }, [map, points]);
  return null;
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 100);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

function MapClickPlace({
  enabled,
  onPlace
}: {
  enabled: boolean;
  onPlace: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onPlace(event.latlng.lat, event.latlng.lng);
    }
  });
  return null;
}

function newId() {
  return `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultWaypoints(): PlannerWaypoint[] {
  return [
    { id: newId(), kind: "start", name: "", query: "", lat: null, lng: null },
    { id: newId(), kind: "destination", name: "", query: "", lat: null, lng: null }
  ];
}

export function waypointsFromStops(
  stops: Array<{ name: string; kind: PlannerWaypoint["kind"]; lat?: number; lng?: number }>
): PlannerWaypoint[] {
  const mapped = stops
    .filter((stop) => stop.name.trim())
    .map((stop) => ({
      id: newId(),
      kind: stop.kind,
      name: stop.name,
      query:
        typeof stop.lat === "number" && typeof stop.lng === "number"
          ? `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`
          : stop.name,
      lat: typeof stop.lat === "number" ? stop.lat : null,
      lng: typeof stop.lng === "number" ? stop.lng : null
    }));
  if (!mapped.some((row) => row.kind === "start")) {
    mapped.unshift({ id: newId(), kind: "start", name: "", query: "", lat: null, lng: null });
  }
  if (!mapped.some((row) => row.kind === "destination")) {
    mapped.push({ id: newId(), kind: "destination", name: "", query: "", lat: null, lng: null });
  }
  return mapped;
}

type JourneyRouteCreatePlannerProps = {
  waypoints: PlannerWaypoint[];
  activeId: string | null;
  onChange: (next: PlannerWaypoint[]) => void;
  onActiveIdChange: (id: string | null) => void;
};

export default function JourneyRouteCreatePlanner({
  waypoints,
  activeId,
  onChange,
  onActiveIdChange
}: JourneyRouteCreatePlannerProps) {
  const [mapLayer, setMapLayer] = useState<MapLayerKey>("roadmap");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roadTrail, setRoadTrail] = useState<Array<[number, number]>>([]);
  const [trailDistance, setTrailDistance] = useState<string>("");

  const layer = googleLayers[mapLayer] ?? googleLayers.roadmap;
  const trailPoints = useMemo(
    () =>
      waypoints
        .filter((row) => typeof row.lat === "number" && typeof row.lng === "number")
        .map((row) => [row.lat as number, row.lng as number] as [number, number]),
    [waypoints]
  );

  useEffect(() => {
    let cancelled = false;
    if (trailPoints.length < 2) {
      setRoadTrail([]);
      setTrailDistance("");
      return;
    }

    const run = async () => {
      const route = await fetchRoadTrailThroughWaypoints(trailPoints);
      if (!cancelled) {
        const segments = route.points.map((point) => [point.lat, point.lng] as [number, number]);
        setRoadTrail(segments.length >= 2 ? segments : trailPoints);
        setTrailDistance(route.meters > 0 ? formatMeasureDistance(route.meters) : "");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [trailPoints]);

  const displayTrail = roadTrail.length >= 2 ? roadTrail : trailPoints;

  const updateWaypoint = (id: string, patch: Partial<PlannerWaypoint>) => {
    onChange(waypoints.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const resolveWaypoint = async (id: string) => {
    const row = waypoints.find((item) => item.id === id);
    if (!row) return;
    const query = row.query.trim() || row.name.trim();
    if (!query) {
      setError("Enter a place name or coordinates (e.g. 0.3476, 32.5825).");
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const point = await resolveLocationQuery(query);
      updateWaypoint(id, {
        lat: point.lat,
        lng: point.lng,
        name: row.name.trim() || point.label || query,
        query: point.label || query
      });
      onActiveIdChange(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resolve location.");
    } finally {
      setBusyId(null);
    }
  };

  const placeActiveAt = async (lat: number, lng: number) => {
    if (!activeId) {
      setError("Select a start, stop, or end point first, then move the pin.");
      return;
    }
    setBusyId(activeId);
    setError(null);
    try {
      const label = await reverseGeocodeLabel(lat, lng);
      const row = waypoints.find((item) => item.id === activeId);
      updateWaypoint(activeId, {
        lat,
        lng,
        query: label,
        name: row?.name.trim() || label
      });
    } catch {
      updateWaypoint(activeId, {
        lat,
        lng,
        query: `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      });
    } finally {
      setBusyId(null);
    }
  };

  const addWaypoint = (kind: "stop" | "rest") => {
    const destIndex = waypoints.findIndex((row) => row.kind === "destination");
    const insertAt = destIndex >= 0 ? destIndex : waypoints.length;
    const next = [...waypoints];
    const stop: PlannerWaypoint = {
      id: newId(),
      kind,
      name: "",
      query: "",
      lat: null,
      lng: null
    };
    next.splice(insertAt, 0, stop);
    onChange(next);
    onActiveIdChange(stop.id);
  };

  const removeWaypoint = (id: string) => {
    const row = waypoints.find((item) => item.id === id);
    if (!row || (row.kind !== "stop" && row.kind !== "rest")) return;
    onChange(waypoints.filter((item) => item.id !== id));
    if (activeId === id) onActiveIdChange(null);
  };

  const waypointLabel = (row: PlannerWaypoint, index: number) => {
    if (row.kind === "start") return "Start point";
    if (row.kind === "destination") return "End point";
    if (row.kind === "rest") {
      const restNumber = waypoints.slice(0, index + 1).filter((item) => item.kind === "rest").length;
      return `Rest point ${restNumber}`;
    }
    const stopNumber = waypoints.slice(0, index + 1).filter((item) => item.kind === "stop").length;
    return `Stop ${stopNumber}`;
  };

  return (
    <div className="journey-planner">
      <div className="journey-planner-list">
        <div className="journey-planner-list-head">
          <strong>Start, stops, rest & end</strong>
          <div className="journey-planner-add-actions">
            <button type="button" className="journey-action" onClick={() => addWaypoint("stop")}>
              Add stop
            </button>
            <button type="button" className="journey-action ghost" onClick={() => addWaypoint("rest")}>
              Add rest point
            </button>
          </div>
        </div>
        {waypoints.map((row, index) => {
          const label = waypointLabel(row, index);
          const isActive = activeId === row.id;
          const pillClass =
            row.kind === "stop" ? "scheduled" : row.kind === "rest" ? "rest" : row.kind;
          return (
            <div
              key={row.id}
              className={`journey-planner-stop${isActive ? " is-active" : ""}`}
              onClick={() => onActiveIdChange(row.id)}
            >
              <div className="journey-planner-stop-top">
                <span className={`journey-pill ${pillClass}`}>{label}</span>
                {row.kind === "stop" || row.kind === "rest" ? (
                  <button
                    type="button"
                    className="journey-action ghost"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeWaypoint(row.id);
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <label className="journey-create-field">
                <span>Label</span>
                <input
                  value={row.name}
                  onChange={(event) => updateWaypoint(row.id, { name: event.target.value })}
                  placeholder={label}
                  onClick={(event) => event.stopPropagation()}
                />
              </label>
              <label className="journey-create-field">
                <span>Find by name or coordinates</span>
                <div className="journey-planner-lookup">
                  <input
                    value={row.query}
                    onChange={(event) => updateWaypoint(row.id, { query: event.target.value })}
                    placeholder={LOCATION_PLACEHOLDER}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void resolveWaypoint(row.id);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="journey-btn ghost"
                    disabled={busyId === row.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void resolveWaypoint(row.id);
                    }}
                  >
                    {busyId === row.id ? "…" : "Find"}
                  </button>
                </div>
              </label>
              {typeof row.lat === "number" && typeof row.lng === "number" ? (
                <div className="journey-planner-coords">
                  Pin: {row.lat.toFixed(5)}, {row.lng.toFixed(5)}
                  {isActive ? " · drag pin to adjust" : " · select to move pin"}
                </div>
              ) : (
                <div className="journey-planner-coords is-missing">Not plotted yet</div>
              )}
            </div>
          );
        })}
        {error ? <div className="journey-planner-error">{error}</div> : null}
      </div>

      <div className="journey-planner-map">
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
        <MapContainer center={DEFAULT_CENTER} zoom={11} className="journey-planner-leaflet" scrollWheelZoom>
          <TileLayer key={mapLayer} subdomains="0123" url={layer.url} attribution={layer.attribution} />
          <InvalidateSize />
          <FitTrail points={displayTrail.length ? displayTrail : trailPoints} />
          <MapClickPlace enabled={Boolean(activeId)} onPlace={(lat, lng) => void placeActiveAt(lat, lng)} />
          {displayTrail.length >= 2 ? (
            <Polyline positions={displayTrail} pathOptions={{ color: "#0f766e", weight: 4, opacity: 0.85 }} />
          ) : null}
          {waypoints.map((row) =>
            typeof row.lat === "number" && typeof row.lng === "number" ? (
              <Marker
                key={row.id}
                position={[row.lat, row.lng]}
                icon={pinIcon(row.kind, activeId === row.id)}
                draggable={activeId === row.id}
                eventHandlers={{
                  click: () => onActiveIdChange(row.id),
                  dragend: (event) => {
                    const marker = event.target as L.Marker;
                    const pos = marker.getLatLng();
                    void placeActiveAt(pos.lat, pos.lng);
                  }
                }}
              >
                <Popup>
                  <strong>{row.name || row.kind}</strong>
                  <br />
                  {row.lat.toFixed(5)}, {row.lng.toFixed(5)}
                </Popup>
              </Marker>
            ) : null
          )}
        </MapContainer>
        <div className="journey-planner-map-caption">
          {displayTrail.length >= 2
            ? `Trail shows planned road movement${trailDistance ? ` · ~${trailDistance}` : ""} from start through stops/rest points to the end.`
            : "Plot start and end (optional stops and rest points) to preview the route trail."}
        </div>
      </div>
    </div>
  );
}
