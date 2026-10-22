import { useEffect, useState } from "react";
import DeliverSectionShell from "../../components/deliver/DeliverSectionShell";
import { deliverDriverAssignments, deliverPlatformList, deliverSetDriverStatus, deliverSetOrderStatus } from "../../utils/api";

const tabs = [
  { id: "assignments", label: "Assignments" },
  { id: "navigation", label: "Navigation" },
  { id: "status", label: "Status" }
];

export default function DeliverDriverApp() {
  const [tab, setTab] = useState("assignments");
  const [driverId, setDriverId] = useState("");
  const [drivers, setDrivers] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState("available");

  const refresh = async () => {
    setBusy(true);
    try {
      setDrivers(await deliverPlatformList("/deliver/platform/drivers"));
      const result = await deliverDriverAssignments(driverId || undefined);
      setAssignments(result.orders ?? []);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [driverId]);

  const updateStatus = async (orderId: string, status: string) => {
    setBusy(true);
    try {
      await deliverSetOrderStatus(orderId, status);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const setDriverAvailability = async () => {
    if (!driverId) return;
    setBusy(true);
    try {
      await deliverSetDriverStatus(driverId, availability);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const active = assignments[0];

  return (
    <DeliverSectionShell
      eyebrow="Deliver · Section 4"
      title="Driver Application"
      lead="View assignments, update delivery status, and manage driver availability."
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      actions={<button className="btn ghost" type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button>}
    >
      <div className="overview-card" style={{ marginBottom: 12 }}>
        <div className="panel" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Driver</span>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">All drivers</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {tab === "assignments" && (
        <div className="overview-card">
          <div className="overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr" }}>
              <span>Order</span><span>Pickup</span><span>Drop-off</span><span>Status</span><span>Actions</span>
            </div>
            {assignments.map((o) => (
              <div key={o.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr" }}>
                <span>{o.id}</span>
                <span>{o.pickupAddress}</span>
                <span>{o.dropoffAddress}</span>
                <span>{o.status}</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button className="btn ghost" type="button" onClick={() => void updateStatus(o.id, "in_transit")} disabled={busy}>Start</button>
                  <button className="btn primary" type="button" onClick={() => void updateStatus(o.id, "delivered")} disabled={busy}>Complete</button>
                </span>
              </div>
            ))}
            {!assignments.length && <div>No active assignments.</div>}
          </div>
        </div>
      )}

      {tab === "navigation" && (
        <div className="overview-card">
          <div className="panel">
            {active ? (
              <>
                <h3>Active route: {active.id}</h3>
                <p><strong>From:</strong> {active.pickupAddress}</p>
                <p><strong>To:</strong> {active.dropoffAddress}</p>
                <p><strong>ETA:</strong> {active.eta ? new Date(active.eta).toLocaleString() : "Calculating…"}</p>
                <p className="overview-lead">Map integration can be wired to Google Maps or existing Leaflet/OSRM stack.</p>
              </>
            ) : (
              <p>No active delivery selected.</p>
            )}
          </div>
        </div>
      )}

      {tab === "status" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 10, maxWidth: 400 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Availability</span>
              <select value={availability} onChange={(e) => setAvailability(e.target.value)}>
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="offline">Offline</option>
              </select>
            </label>
            <button className="btn primary" type="button" onClick={() => void setDriverAvailability()} disabled={!driverId || busy}>
              Update status
            </button>
          </div>
        </div>
      )}
    </DeliverSectionShell>
  );
}
