import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../../mapStyles";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import { loadScopedAssets } from "../../utils/homeScopedDevices";
import {
  assetDisplayName,
  fetchAssetTripHistory,
  fetchTripRoute,
  resolveDeviceIdForAsset,
  type MobileTripDayGroup,
  type MobileTripStage,
  type ReplayPoint
} from "../../utils/mobileTripHistory";
import "./MobilePreview.css";

function FitRoute({ points }: { points: ReplayPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    const bounds = points.map((p) => [p.lat, p.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, points]);
  return null;
}

function TripReplayOverlay({
  assetName,
  trip,
  deviceId,
  onClose
}: {
  assetName: string;
  trip: MobileTripStage;
  deviceId: number;
  onClose: () => void;
}) {
  const [points, setPoints] = useState<ReplayPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPlaying(false);
    setIndex(0);
    void fetchTripRoute(deviceId, trip.startIso, trip.endIso).then((route) => {
      if (cancelled) return;
      setPoints(route);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [deviceId, trip]);

  useEffect(() => {
    if (!playing || points.length < 2) return;
    timerRef.current = window.setInterval(() => {
      setIndex((current) => (current >= points.length - 1 ? 0 : current + 1));
    }, 700);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [playing, points.length]);

  const positions = useMemo(
    () => points.map((p) => [p.lat, p.lng] as [number, number]),
    [points]
  );
  const active = points[index];

  return (
    <div className="mpreview-replay" role="dialog" aria-modal="true" aria-label="Trip replay">
      <div className="mpreview-replay__head">
        <button type="button" className="mpreview-back" onClick={onClose}>
          Close
        </button>
        <div className="mpreview-replay__title">
          <strong>{assetName}</strong>
          <span>
            {trip.startLabel} – {trip.endLabel} · {trip.distanceKm} km
          </span>
        </div>
      </div>
      <div className="mpreview-replay__map">
        {loading ? (
          <p className="mpreview-empty">Loading route…</p>
        ) : points.length < 2 ? (
          <p className="mpreview-empty">No route points for this trip.</p>
        ) : (
          <MapContainer center={[points[0].lat, points[0].lng]} zoom={13} style={{ height: "100%", width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitRoute points={points} />
            <Polyline positions={positions} pathOptions={{ color: "#ff5722", weight: 4, opacity: 0.9 }} />
            {active && (
              <CircleMarker
                center={[active.lat, active.lng]}
                radius={8}
                pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#22c55e", fillOpacity: 1 }}
              />
            )}
          </MapContainer>
        )}
      </div>
      <div className="mpreview-replay__controls">
        <button
          type="button"
          className="mpreview-play"
          disabled={points.length < 2}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? "Pause" : "Play trip"}
        </button>
        <span className="mpreview-progress">
          Point {points.length === 0 ? 0 : index + 1} / {points.length}
        </span>
      </div>
    </div>
  );
}

type AssetRow = {
  id: string;
  name: string;
  asset: Record<string, unknown>;
};

export default function MobilePreview() {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [selected, setSelected] = useState<AssetRow | null>(null);
  const [history, setHistory] = useState<MobileTripDayGroup[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [replayTrip, setReplayTrip] = useState<MobileTripStage | null>(null);

  const loadAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const rows = await loadScopedAssets();
      setAssets(
        rows.map((asset, index) => ({
          id: String(asset.id ?? asset.registration ?? index),
          name: assetDisplayName(asset),
          asset
        }))
      );
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
    const refresh = () => void loadAssets();
    window.addEventListener("vivi:orgchange", refresh);
    window.addEventListener("vivi:contextchange", refresh);
    return () => {
      window.removeEventListener("vivi:orgchange", refresh);
      window.removeEventListener("vivi:contextchange", refresh);
    };
  }, [loadAssets]);

  const openAsset = async (row: AssetRow) => {
    setSelected(row);
    setHistory([]);
    setReplayTrip(null);
    setLoadingHistory(true);
    try {
      const [groups, resolvedDeviceId] = await Promise.all([
        fetchAssetTripHistory(row.asset, 7),
        resolveDeviceIdForAsset(row.asset)
      ]);
      setHistory(groups);
      setDeviceId(resolvedDeviceId);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (replayTrip && selected && deviceId) {
    return (
      <TripReplayOverlay
        assetName={selected.name}
        trip={replayTrip}
        deviceId={deviceId}
        onClose={() => setReplayTrip(null)}
      />
    );
  }

  if (selected) {
    return (
      <div className="mpreview">
        <header className="mpreview-head">
          <button type="button" className="mpreview-back" onClick={() => setSelected(null)}>
            ← Assets
          </button>
          <h1>{selected.name}</h1>
          <p>Last 7 days · tap a trip stage to play it on the map</p>
        </header>

        {loadingHistory && <p className="mpreview-empty">Loading trip history…</p>}

        {!loadingHistory && history.length === 0 && (
          <p className="mpreview-empty">No trips found in the last 7 days.</p>
        )}

        {history.map((day) => (
          <section key={day.dayKey} className="mpreview-day">
            <h2>{day.dayLabel}</h2>
            <ul className="mpreview-stages">
              {day.trips.map((trip) => (
                <li key={trip.id} className="mpreview-stage">
                  <div className="mpreview-stage__main">
                    <span className="mpreview-stage__badge">Stage {trip.stageIndex}</span>
                    <span className="mpreview-stage__time">
                      {trip.startLabel} – {trip.endLabel}
                    </span>
                    <span className="mpreview-stage__meta">
                      {trip.durationLabel} · {trip.distanceKm} km
                    </span>
                    <span className="mpreview-stage__route">
                      {trip.startAddress} → {trip.endAddress}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mpreview-play"
                    disabled={!deviceId}
                    onClick={() => setReplayTrip(trip)}
                  >
                    Play
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="mpreview">
      <header className="mpreview-head">
        <h1>Preview</h1>
      </header>

      {loadingAssets && <p className="mpreview-empty">Loading assets…</p>}

      {!loadingAssets && assets.length === 0 && (
        <p className="mpreview-empty">No assets in the current site scope.</p>
      )}

      <ul className="mpreview-assets">
        {assets.map((row) => (
          <li key={row.id}>
            <button type="button" className="mpreview-asset" onClick={() => void openAsset(row)}>
              <span>{row.name}</span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
