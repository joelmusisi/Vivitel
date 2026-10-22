import { useEffect, useState } from "react";
import { deliverGetDroneGroups, deliverGetRegions, deliverSaveDroneGroup } from "../utils/api";

export default function DeliverDroneGroups() {
  const [groups, setGroups] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [region, setRegion] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [g, r] = await Promise.all([deliverGetDroneGroups(), deliverGetRegions()]);
    setGroups(Array.isArray(g) ? g : []);
    setRegions(Array.isArray(r) ? r : []);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onSave = async () => {
    setError(null);
    const n = name.trim();
    if (!n) {
      setError("Group name is required.");
      return;
    }
    setBusy(true);
    try {
      const result = await deliverSaveDroneGroup({ name: n, owner: owner.trim(), region: region.trim(), notes: notes.trim() });
      if (!result.ok) {
        setError(result.error ?? "Save failed");
        return;
      }
      setName("");
      setOwner("");
      setRegion("");
      setNotes("");
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
          <h2 style={{ margin: 0 }}>Drone groups</h2>
          <p className="overview-lead">Categorize drones by owner/group and optionally region.</p>
        </div>
      </div>

      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}

      <div className="overview-grid">
        <div className="overview-card">
          <div className="panel">
          <div className="overview-card-header">
            <h3>Add group</h3>
            <span />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label>
              Group name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Owner
              <input value={owner} onChange={(e) => setOwner(e.target.value)} />
            </label>
            <label>
              Region
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">—</option>
                {regions.map((r) => (
                  <option key={String(r.id)} value={String(r.name ?? r.id)}>
                    {String(r.name ?? r.id)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Notes
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
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
            <h3>Groups</h3>
            <span>{groups.length}</span>
          </div>
          <div className="overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <span>Name</span>
              <span>Owner</span>
              <span>Region</span>
            </div>
            {groups.map((g) => (
              <div key={String(g.id)} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span>{String(g.name ?? "")}</span>
                <span>{String(g.owner ?? "")}</span>
                <span>{String(g.region ?? "")}</span>
              </div>
            ))}
            {!groups.length && <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>No groups yet.</div>}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
