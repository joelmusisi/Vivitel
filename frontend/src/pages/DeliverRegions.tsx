import { useEffect, useState } from "react";
import { deliverGetRegions, deliverSaveRegion } from "../utils/api";

export default function DeliverRegions() {
  const [regions, setRegions] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const r = await deliverGetRegions();
    setRegions(Array.isArray(r) ? r : []);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onSave = async () => {
    setError(null);
    const n = name.trim();
    if (!n) {
      setError("Region name is required.");
      return;
    }
    setBusy(true);
    try {
      const result = await deliverSaveRegion({ name: n });
      if (!result.ok) {
        setError(result.error ?? "Save failed");
        return;
      }
      setName("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="overview-header">
        <div>
          <div className="overview-eyebrow">Deliver</div>
          <h2 style={{ margin: 0 }}>Regions</h2>
          <p className="overview-lead">Define regions for filtering and categorization.</p>
        </div>
      </div>

      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}

      <div className="overview-grid">
        <div className="overview-card">
          <div className="panel">
          <div className="overview-card-header">
            <h3>Add region</h3>
            <span />
          </div>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" type="button" onClick={() => void onSave()} disabled={busy}>
              Save
            </button>
          </div>
          </div>
        </div>

        <div className="overview-card">
          <div className="panel">
          <div className="overview-card-header">
            <h3>Region list</h3>
            <span>{regions.length}</span>
          </div>
          <div className="overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "1fr" }}>
              <span>Name</span>
            </div>
            {regions.map((r) => (
              <div key={String(r.id)} className="overview-row" style={{ gridTemplateColumns: "1fr" }}>
                <span>{String(r.name ?? r.id)}</span>
              </div>
            ))}
            {!regions.length && <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>No regions yet.</div>}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
