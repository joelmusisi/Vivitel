import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getLiveShareSnapshot, type LiveShareSnapshot } from "../utils/api";

type ShareState = "loading" | "ready" | "expired";

const formatAt = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "Not available";
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  return new Date(parsed)
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

export default function LiveSharePublic() {
  const params = useParams();
  const token = String(params.token ?? "").trim();
  const [status, setStatus] = useState<ShareState>("loading");
  const [snapshot, setSnapshot] = useState<LiveShareSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const run = async () => {
      if (!token) {
        if (!cancelled) {
          setStatus("expired");
          setSnapshot(null);
        }
        return;
      }

      const next = await getLiveShareSnapshot(token);
      if (cancelled) return;
      if (!next) {
        setStatus("expired");
        setSnapshot(null);
        return;
      }

      setSnapshot(next);
      setStatus("ready");
      timer = window.setTimeout(run, 15_000);
    };

    void run();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [token]);

  const latest = snapshot?.latest;
  const lat = typeof latest?.lat === "number" ? latest.lat : null;
  const lng = typeof latest?.lng === "number" ? latest.lng : null;
  const mapEmbedUrl = useMemo(() => {
    if (typeof lat !== "number" || typeof lng !== "number") return "";
    return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
  }, [lat, lng]);

  return (
    <div className="live-share-page">
      <div className="live-share-card">
        <div className="live-share-title">Live asset location</div>
        {status === "loading" && <div className="live-share-empty">Loading shared location...</div>}
        {status === "expired" && (
          <div className="live-share-empty">
            This shared link is unavailable or has expired.
          </div>
        )}
        {status === "ready" && snapshot && (
          <>
            <div className="live-share-meta">
              <div><strong>Asset:</strong> {String((snapshot.asset as any)?.assetDescription ?? (snapshot.asset as any)?.registration ?? "Asset")}</div>
              <div><strong>Registration:</strong> {String((snapshot.asset as any)?.registration ?? "Not available")}</div>
              <div><strong>Updated:</strong> {formatAt(latest?.at)}</div>
              <div><strong>Coordinates:</strong> {typeof lat === "number" && typeof lng === "number" ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "Not available"}</div>
              <div><strong>Speed:</strong> {typeof latest?.speed === "number" ? `${latest.speed} km/h` : "Not available"}</div>
              <div><strong>Expires:</strong> {formatAt(snapshot.share?.expiresAt)}</div>
            </div>
            {mapEmbedUrl ? (
              <iframe
                className="live-share-map"
                src={mapEmbedUrl}
                title="Live asset location map"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="live-share-empty">No coordinates available yet.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
