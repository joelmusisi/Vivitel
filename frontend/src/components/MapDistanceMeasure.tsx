import { useEffect, useRef, useState } from "react";
import { CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  fetchRoadRoute,
  formatMeasureDistance,
  polylineLengthMeters,
  type LatLngPoint
} from "../utils/mapRoadRoute";

type MeasureStatus = {
  loading: boolean;
  meters: number | null;
  hint: string;
};

type MapDistanceMeasureProps = {
  active: boolean;
  onStatusChange?: (status: MeasureStatus) => void;
};

const toPoint = (latlng: L.LatLng): LatLngPoint => ({ lat: latlng.lat, lng: latlng.lng });

export default function MapDistanceMeasure({ active, onStatusChange }: MapDistanceMeasureProps) {
  const map = useMap();
  const draggingRef = useRef(false);
  const startRef = useRef<LatLngPoint | null>(null);
  const [start, setStart] = useState<LatLngPoint | null>(null);
  const [end, setEnd] = useState<LatLngPoint | null>(null);
  const [routePoints, setRoutePoints] = useState<LatLngPoint[] | null>(null);
  const [meters, setMeters] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const publishStatus = (next: MeasureStatus) => {
    onStatusChange?.(next);
  };

  const resetMeasure = () => {
    draggingRef.current = false;
    startRef.current = null;
    setStart(null);
    setEnd(null);
    setRoutePoints(null);
    setMeters(null);
    setLoading(false);
    map.dragging.enable();
  };

  useEffect(() => {
    if (!active) {
      resetMeasure();
      publishStatus({ loading: false, meters: null, hint: "" });
    } else {
      publishStatus({ loading: false, meters: null, hint: "Press at point A, drag to point B, then release." });
    }
  }, [active]);

  const finishMeasure = async (from: LatLngPoint, to: LatLngPoint) => {
    if (polylineLengthMeters([from, to]) < 3) {
      resetMeasure();
      publishStatus({ loading: false, meters: null, hint: "Drag a little further to measure." });
      return;
    }

    setStart(from);
    setEnd(to);
    setRoutePoints(null);
    setMeters(null);
    setLoading(true);
    publishStatus({ loading: true, meters: null, hint: "Calculating road distance…" });

    try {
      const route = await fetchRoadRoute(from, to);
      setRoutePoints(route.points);
      setMeters(route.meters);
      publishStatus({
        loading: false,
        meters: route.meters,
        hint: `Road distance: ${formatMeasureDistance(route.meters)}`
      });
    } catch {
      const fallback = [from, to];
      const fallbackMeters = polylineLengthMeters(fallback);
      setRoutePoints(fallback);
      setMeters(fallbackMeters);
      publishStatus({
        loading: false,
        meters: fallbackMeters,
        hint: `Straight-line distance: ${formatMeasureDistance(fallbackMeters)} (road route unavailable)`
      });
    } finally {
      setLoading(false);
      map.dragging.enable();
    }
  };

  useMapEvents({
    mousedown(event) {
      if (!active || loading) return;
      L.DomEvent.stopPropagation(event.originalEvent);
      L.DomEvent.preventDefault(event.originalEvent);
      map.dragging.disable();
      draggingRef.current = true;
      const point = toPoint(event.latlng);
      startRef.current = point;
      setStart(point);
      setEnd(point);
      setRoutePoints(null);
      setMeters(null);
      publishStatus({ loading: false, meters: null, hint: "Drag to point B…" });
    },
    mousemove(event) {
      if (!active || !draggingRef.current || !startRef.current) return;
      setEnd(toPoint(event.latlng));
    }
  });

  useEffect(() => {
    if (!active) return;

    const handleDocumentMouseUp = (event: MouseEvent) => {
      if (!draggingRef.current || !startRef.current) return;
      draggingRef.current = false;
      const container = map.getContainer();
      const rect = container.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom;
      const point = inside
        ? toPoint(map.containerPointToLatLng(L.point(event.clientX - rect.left, event.clientY - rect.top)))
        : startRef.current;
      setEnd(point);
      void finishMeasure(startRef.current, point);
    };

    document.addEventListener("mouseup", handleDocumentMouseUp);
    return () => document.removeEventListener("mouseup", handleDocumentMouseUp);
  }, [active, map]);

  const previewLine = start && end && !routePoints ? [start, end] : null;
  const displayLine = routePoints && routePoints.length > 1 ? routePoints : previewLine;
  const labelPoint = routePoints?.length
    ? routePoints[Math.floor(routePoints.length / 2)]
    : end ?? start;

  return (
    <>
      {displayLine && displayLine.length > 1 && (
        <Polyline
          positions={displayLine.map((point) => [point.lat, point.lng])}
          pathOptions={{
            color: routePoints ? "#2563eb" : "#64748b",
            weight: routePoints ? 5 : 3,
            opacity: routePoints ? 0.95 : 0.65,
            dashArray: routePoints ? undefined : "8 6",
            lineCap: "round",
            lineJoin: "round"
          }}
        />
      )}
      {start && (
        <CircleMarker
          center={[start.lat, start.lng]}
          radius={6}
          pathOptions={{ color: "#15803d", fillColor: "#22c55e", fillOpacity: 1, weight: 2 }}
        />
      )}
      {end && (
        <CircleMarker
          center={[end.lat, end.lng]}
          radius={6}
          pathOptions={{
            color: routePoints ? "#15803d" : "#1d4ed8",
            fillColor: routePoints ? "#22c55e" : "#60a5fa",
            fillOpacity: 1,
            weight: 2
          }}
        />
      )}
      {labelPoint && meters !== null && !loading && (
        <CircleMarker
          center={[labelPoint.lat, labelPoint.lng]}
          radius={0}
          pathOptions={{ opacity: 0, fillOpacity: 0 }}
        >
          <Tooltip permanent direction="top" offset={[0, -8]} className="map-measure-distance-label">
            {formatMeasureDistance(meters)}
          </Tooltip>
        </CircleMarker>
      )}
    </>
  );
}
