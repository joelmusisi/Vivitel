import { useEffect, useState } from "react";
import DeliverSectionShell from "../../components/deliver/DeliverSectionShell";
import { deliverGetState, deliverPlatformList, deliverPlatformSave } from "../../utils/api";

const tabs = [
  { id: "fleet", label: "Fleet" },
  { id: "missions", label: "Missions" },
  { id: "flight-logs", label: "Flight logs" },
  { id: "maintenance", label: "Maintenance" },
  { id: "airspace", label: "Airspace" }
];

export default function DeliverDroneOps() {
  const [tab, setTab] = useState("fleet");
  const [drones, setDrones] = useState<any[]>([]);
  const [missions, setMissions] = useState<any[]>([]);
  const [flightLogs, setFlightLogs] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [airspace, setAirspace] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [missionForm, setMissionForm] = useState({ orderId: "", droneId: "", route: "" });
  const [maintForm, setMaintForm] = useState({ droneId: "", type: "inspection", dueAt: "" });
  const [zoneForm, setZoneForm] = useState({ name: "", restriction: "no-fly", radiusKm: 1 });

  const refresh = async () => {
    setBusy(true);
    try {
      const state = await deliverGetState();
      setDrones(state.drones ?? []);
      const [m, f, mt, a] = await Promise.all([
        deliverPlatformList("/deliver/platform/drone-ops/missions"),
        deliverPlatformList("/deliver/platform/drone-ops/flight-logs"),
        deliverPlatformList("/deliver/platform/drone-ops/maintenance"),
        deliverPlatformList("/deliver/platform/drone-ops/airspace")
      ]);
      setMissions(m);
      setFlightLogs(f);
      setMaintenance(mt);
      setAirspace(a);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <DeliverSectionShell
      eyebrow="Deliver · Section 3"
      title="Drone Operations"
      lead="Fleet status, mission planning, flight logs, maintenance, and airspace zones."
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      actions={<button className="btn ghost" type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button>}
    >
      {tab === "fleet" && (
        <div className="overview-card">
          <div className="overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr" }}>
              <span>Drone</span><span>Status</span><span>Battery</span><span>Payload</span><span>Active order</span>
            </div>
            {drones.map((d) => (
              <div key={d.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr" }}>
                <span>{d.name ?? d.id}</span><span>{d.status}</span><span>{d.batteryPct}%</span><span>{d.maxPayloadKg} kg</span><span>{d.activeOrderId || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "missions" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 12 }}>
            <input placeholder="Order ID" value={missionForm.orderId} onChange={(e) => setMissionForm((f) => ({ ...f, orderId: e.target.value }))} />
            <input placeholder="Drone ID" value={missionForm.droneId} onChange={(e) => setMissionForm((f) => ({ ...f, droneId: e.target.value }))} />
            <input placeholder="Route notes" value={missionForm.route} onChange={(e) => setMissionForm((f) => ({ ...f, route: e.target.value }))} />
            <button className="btn primary" type="button" onClick={async () => { setBusy(true); await deliverPlatformSave("/deliver/platform/drone-ops/missions", missionForm); setMissionForm({ orderId: "", droneId: "", route: "" }); await refresh(); setBusy(false); }} disabled={busy}>Plan mission</button>
          </div>
          <div className="overview-table">
            {missions.map((m) => (
              <div key={m.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                <span>{m.id}</span><span>{m.orderId}</span><span>{m.droneId}</span><span>{m.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "flight-logs" && (
        <div className="overview-card">
          <div className="overview-table">
            {flightLogs.map((f) => (
              <div key={f.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                <span>{f.id}</span><span>{f.droneId}</span><span>{f.durationMin} min</span><span>{f.distanceKm} km</span>
              </div>
            ))}
            {!flightLogs.length && <div>No flight logs yet.</div>}
          </div>
        </div>
      )}

      {tab === "maintenance" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 12 }}>
            <input placeholder="Drone ID" value={maintForm.droneId} onChange={(e) => setMaintForm((f) => ({ ...f, droneId: e.target.value }))} />
            <input placeholder="Due at (ISO)" value={maintForm.dueAt} onChange={(e) => setMaintForm((f) => ({ ...f, dueAt: e.target.value }))} />
            <button className="btn primary" type="button" onClick={async () => { setBusy(true); await deliverPlatformSave("/deliver/platform/drone-ops/maintenance", maintForm); await refresh(); setBusy(false); }} disabled={busy}>Schedule maintenance</button>
          </div>
          <div className="overview-table">
            {maintenance.map((m) => (
              <div key={m.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                <span>{m.id}</span><span>{m.droneId}</span><span>{m.type}</span><span>{m.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "airspace" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 12 }}>
            <input placeholder="Zone name" value={zoneForm.name} onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))} />
            <button className="btn primary" type="button" onClick={async () => { setBusy(true); await deliverPlatformSave("/deliver/platform/drone-ops/airspace", zoneForm); await refresh(); setBusy(false); }} disabled={busy}>Add zone</button>
          </div>
          <div className="overview-table">
            {airspace.map((z) => (
              <div key={z.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span>{z.name}</span><span>{z.restriction}</span><span>{z.radiusKm} km</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </DeliverSectionShell>
  );
}
