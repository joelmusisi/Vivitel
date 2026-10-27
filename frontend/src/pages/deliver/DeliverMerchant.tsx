import { useEffect, useState } from "react";
import DeliverSectionShell from "../../components/deliver/DeliverSectionShell";
import { deliverGetOrders, deliverPlaceOrder, deliverPlatformList, deliverPlatformSave } from "../../utils/api";

const tabs = [
  { id: "merchants", label: "Merchants" },
  { id: "orders", label: "Bulk orders" },
  { id: "analytics", label: "Analytics" }
];

export default function DeliverMerchant() {
  const [tab, setTab] = useState("merchants");
  const [merchants, setMerchants] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", contactPhone: "", address: "" });
  const [bulk, setBulk] = useState({ merchantName: "", phone: "", pickup: "", dropoff: "", count: 1, weight: 1 });

  const refresh = async () => {
    setBusy(true);
    try {
      setMerchants(await deliverPlatformList("/deliver/platform/merchants"));
      setOrders(await deliverGetOrders());
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const merchantOrders = orders.filter((o) => String(o.clientName ?? "").toLowerCase().includes(bulk.merchantName.toLowerCase()) && bulk.merchantName);

  return (
    <DeliverSectionShell
      eyebrow="Deliver · Section 6"
      title="Merchant Portal"
      lead="Onboard merchants, submit bulk orders, and review delivery performance."
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      actions={<button className="btn ghost" type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button>}
    >
      {tab === "merchants" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 12 }}>
            <input placeholder="Merchant name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <input placeholder="Phone" value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} />
            <input placeholder="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            <button className="btn primary" type="button" onClick={async () => { setBusy(true); await deliverPlatformSave("/deliver/platform/merchants", form); setForm({ name: "", contactPhone: "", address: "" }); await refresh(); setBusy(false); }} disabled={busy}>Register merchant</button>
          </div>
          <div className="overview-table">
            {merchants.map((m) => (
              <div key={m.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span>{m.name}</span><span>{m.contactPhone}</span><span>{m.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 520 }}>
            <input placeholder="Merchant name" value={bulk.merchantName} onChange={(e) => setBulk((b) => ({ ...b, merchantName: e.target.value }))} />
            <input placeholder="Contact phone" value={bulk.phone} onChange={(e) => setBulk((b) => ({ ...b, phone: e.target.value }))} />
            <input placeholder="Pickup hub" value={bulk.pickup} onChange={(e) => setBulk((b) => ({ ...b, pickup: e.target.value }))} />
            <input placeholder="Default drop-off" value={bulk.dropoff} onChange={(e) => setBulk((b) => ({ ...b, dropoff: e.target.value }))} />
            <input type="number" placeholder="Order count" value={bulk.count} onChange={(e) => setBulk((b) => ({ ...b, count: Number(e.target.value) }))} />
            <button className="btn primary" type="button" onClick={async () => {
              setBusy(true);
              for (let i = 0; i < bulk.count; i += 1) {
                await deliverPlaceOrder({
                  clientName: bulk.merchantName,
                  clientPhone: bulk.phone,
                  pickupAddress: bulk.pickup,
                  dropoffAddress: bulk.dropoff,
                  packageWeightKg: bulk.weight,
                  priority: "normal",
                  deliveryMode: "ground"
                });
              }
              await refresh();
              setBusy(false);
            }} disabled={busy}>Submit bulk orders</button>
          </div>
        </div>
      )}

      {tab === "analytics" && (
        <div className="overview-card">
          <div className="panel">
            <p>Merchant orders in system: <strong>{merchantOrders.length || orders.length}</strong></p>
            <p>Delivered: <strong>{orders.filter((o) => o.status === "delivered").length}</strong></p>
            <p>Pending: <strong>{orders.filter((o) => o.status === "pending").length}</strong></p>
          </div>
        </div>
      )}
    </DeliverSectionShell>
  );
}
