import { useEffect, useState } from "react";
import { deliverGetClients, deliverGetRegions, deliverSaveClient } from "../utils/api";

export default function DeliverClients() {
  const [clients, setClients] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [c, r] = await Promise.all([deliverGetClients(), deliverGetRegions()]);
    setClients(Array.isArray(c) ? c : []);
    setRegions(Array.isArray(r) ? r : []);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onSave = async () => {
    setError(null);
    const n = name.trim();
    if (!n) {
      setError("Client name is required.");
      return;
    }
    setBusy(true);
    try {
      const result = await deliverSaveClient({ name: n, phone: phone.trim(), region: region.trim(), notes: notes.trim() });
      if (!result.ok) {
        setError(result.error ?? "Save failed");
        return;
      }
      setName("");
      setPhone("");
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
          <h2 style={{ margin: 0 }}>Clients</h2>
          <p className="overview-lead">Maintain the client list used during order placement.</p>
        </div>
      </div>

      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}

      <div className="overview-grid">
        <div className="overview-card">
          <div className="panel">
          <div className="overview-card-header">
            <h3>Add client</h3>
            <span />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
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
            <h3>Client list</h3>
            <span>{clients.length}</span>
          </div>
          <div className="overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "1.2fr 1fr 1fr" }}>
              <span>Name</span>
              <span>Phone</span>
              <span>Region</span>
            </div>
            {clients.map((c) => (
              <div key={String(c.id)} className="overview-row" style={{ gridTemplateColumns: "1.2fr 1fr 1fr" }}>
                <span>{String(c.name ?? "")}</span>
                <span>{String(c.phone ?? "")}</span>
                <span>{String(c.region ?? "")}</span>
              </div>
            ))}
            {!clients.length && <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>No clients yet.</div>}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
