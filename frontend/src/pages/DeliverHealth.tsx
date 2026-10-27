import { useEffect, useState } from "react";
import { deliverGetHealth } from "../utils/api";

export default function DeliverHealth() {
  const [health, setHealth] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const h = await deliverGetHealth();
      setHealth(Array.isArray(h) ? h : []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="page">
      <div className="overview-header">
        <div>
          <div className="overview-eyebrow">Deliver</div>
          <h2 style={{ margin: 0 }}>Drone health</h2>
          <p className="overview-lead">Basic fitness-for-work view based on status, battery, and staleness.</p>
        </div>
        <div className="overview-actions">
          <button className="btn ghost" type="button" onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}

      <div className="overview-card">
        <div className="panel">
          <div className="overview-card-header">
            <h3>Health table</h3>
            <span>{health.length}</span>
          </div>
          <div className="overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "1fr 0.8fr 0.8fr 2fr" }}>
              <span>Drone</span>
              <span>Battery</span>
              <span>OK</span>
              <span>Reasons</span>
            </div>
            {health.map((h) => (
              <div key={String(h.id)} className="overview-row" style={{ gridTemplateColumns: "1fr 0.8fr 0.8fr 2fr" }}>
                <span>{String(h.name ?? h.id)}</span>
                <span>{typeof h.batteryPct === "number" ? `${h.batteryPct}%` : "-"}</span>
                <span>{h.ok ? "Yes" : "No"}</span>
                <span>{Array.isArray(h.reasons) ? h.reasons.join(", ") : ""}</span>
              </div>
            ))}
            {!health.length && <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>No drones yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
