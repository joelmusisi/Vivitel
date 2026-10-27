import { useEffect, useState } from "react";
import DeliverSectionShell from "../../components/deliver/DeliverSectionShell";
import { deliverGroundOpsDashboard, deliverPlatformSave } from "../../utils/api";

const tabs = [
  { id: "dashboard", label: "Dashboard" },
  { id: "dispatch", label: "Dispatch" },
  { id: "drivers", label: "Drivers" },
  { id: "vehicles", label: "Vehicles" },
  { id: "incidents", label: "Incidents" },
  { id: "exceptions", label: "Exceptions" }
];

export default function DeliverGroundOps() {
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driverForm, setDriverForm] = useState({ name: "", phone: "", licenseNo: "" });
  const [vehicleForm, setVehicleForm] = useState({ plate: "", type: "van", capacityKg: 500 });
  const [incidentForm, setIncidentForm] = useState({ orderId: "", type: "delay", notes: "" });

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await deliverGroundOpsDashboard());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const saveDriver = async () => {
    setBusy(true);
    try {
      await deliverPlatformSave("/deliver/platform/drivers", { ...driverForm, availability: "available" });
      setDriverForm({ name: "", phone: "", licenseNo: "" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const saveVehicle = async () => {
    setBusy(true);
    try {
      await deliverPlatformSave("/deliver/platform/vehicles", vehicleForm);
      setVehicleForm({ plate: "", type: "van", capacityKg: 500 });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const saveIncident = async () => {
    setBusy(true);
    try {
      await deliverPlatformSave("/deliver/platform/incidents", incidentForm);
      setIncidentForm({ orderId: "", type: "delay", notes: "" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const dash = data?.dashboard ?? {};

  return (
    <DeliverSectionShell
      eyebrow="Deliver · Section 2"
      title="Ground Operations"
      lead="Dispatch dashboard, driver and vehicle management, incidents and exceptions."
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      actions={<button className="btn ghost" type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button>}
    >
      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}

      {tab === "dashboard" && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {[
            ["Active deliveries", dash.activeDeliveries],
            ["Delayed", dash.delayedDeliveries],
            ["Drivers available", dash.driverAvailability],
            ["Drones available", dash.droneAvailability],
            ["Warehouse queue", dash.warehouseQueue],
            ["Open incidents", dash.openIncidents],
            ["Open exceptions", dash.openExceptions]
          ].map(([label, value]) => (
            <div key={String(label)} className="overview-card"><div className="panel"><strong>{label}</strong><div>{String(value ?? 0)}</div></div></div>
          ))}
        </div>
      )}

      {tab === "dispatch" && (
        <div className="overview-card">
          <div className="panel overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr" }}>
              <span>Order</span><span>Client</span><span>Status</span><span>Mode</span><span>Priority</span>
            </div>
            {(data?.orders ?? []).slice(0, 30).map((o: any) => (
              <div key={o.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr" }}>
                <span>{o.id}</span><span>{o.clientName}</span><span>{o.status}</span><span>{o.deliveryMode ?? "auto"}</span><span>{o.priority}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "drivers" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 16 }}>
            <input placeholder="Name" value={driverForm.name} onChange={(e) => setDriverForm((f) => ({ ...f, name: e.target.value }))} />
            <input placeholder="Phone" value={driverForm.phone} onChange={(e) => setDriverForm((f) => ({ ...f, phone: e.target.value }))} />
            <input placeholder="License" value={driverForm.licenseNo} onChange={(e) => setDriverForm((f) => ({ ...f, licenseNo: e.target.value }))} />
            <button className="btn primary" type="button" onClick={() => void saveDriver()} disabled={busy}>Add driver</button>
          </div>
          <div className="overview-table">
            {(data?.drivers ?? []).map((d: any) => (
              <div key={d.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span>{d.name}</span><span>{d.phone}</span><span>{d.availability}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "vehicles" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 16 }}>
            <input placeholder="Plate" value={vehicleForm.plate} onChange={(e) => setVehicleForm((f) => ({ ...f, plate: e.target.value }))} />
            <input placeholder="Type" value={vehicleForm.type} onChange={(e) => setVehicleForm((f) => ({ ...f, type: e.target.value }))} />
            <button className="btn primary" type="button" onClick={() => void saveVehicle()} disabled={busy}>Add vehicle</button>
          </div>
          <div className="overview-table">
            {(data?.vehicles ?? []).map((v: any) => (
              <div key={v.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span>{v.plate}</span><span>{v.type}</span><span>{v.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "incidents" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 16 }}>
            <input placeholder="Order ID" value={incidentForm.orderId} onChange={(e) => setIncidentForm((f) => ({ ...f, orderId: e.target.value }))} />
            <input placeholder="Notes" value={incidentForm.notes} onChange={(e) => setIncidentForm((f) => ({ ...f, notes: e.target.value }))} />
            <button className="btn primary" type="button" onClick={() => void saveIncident()} disabled={busy}>Report incident</button>
          </div>
          <div className="overview-table">
            {(data?.incidents ?? []).map((i: any) => (
              <div key={i.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                <span>{i.id}</span><span>{i.orderId}</span><span>{i.type}</span><span>{i.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "exceptions" && (
        <div className="overview-card">
          <div className="overview-table">
            {(data?.exceptions ?? []).map((e: any) => (
              <div key={e.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span>{e.id}</span><span>{e.orderId}</span><span>{e.reason}</span>
              </div>
            ))}
            {!(data?.exceptions ?? []).length && <div>No exceptions logged.</div>}
          </div>
        </div>
      )}
    </DeliverSectionShell>
  );
}
