import { useEffect, useState } from "react";
import DeliverSectionShell from "../../components/deliver/DeliverSectionShell";
import { deliverPlatformList, deliverPlatformSave } from "../../utils/api";

const tabs = [
  { id: "packages", label: "Packages" },
  { id: "inventory", label: "Inventory" },
  { id: "scan", label: "Scan" }
];

export default function DeliverWarehouse() {
  const [tab, setTab] = useState("packages");
  const [packages, setPackages] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [pkgForm, setPkgForm] = useState({ orderId: "", barcode: "", location: "A-01" });
  const [invForm, setInvForm] = useState({ sku: "", name: "", quantity: 0, location: "Shelf-1" });
  const [scanCode, setScanCode] = useState("");

  const refresh = async () => {
    setBusy(true);
    try {
      const [p, i] = await Promise.all([
        deliverPlatformList("/deliver/platform/warehouse/packages"),
        deliverPlatformList("/deliver/platform/warehouse/inventory")
      ]);
      setPackages(p);
      setInventory(i);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const scanned = packages.find((p) => String(p.barcode) === scanCode.trim());

  return (
    <DeliverSectionShell
      eyebrow="Deliver · Section 5"
      title="Warehouse"
      lead="Receive packages, manage inventory, and scan barcodes at the hub."
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      actions={<button className="btn ghost" type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button>}
    >
      {tab === "packages" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 12 }}>
            <input placeholder="Order ID" value={pkgForm.orderId} onChange={(e) => setPkgForm((f) => ({ ...f, orderId: e.target.value }))} />
            <input placeholder="Barcode" value={pkgForm.barcode} onChange={(e) => setPkgForm((f) => ({ ...f, barcode: e.target.value }))} />
            <input placeholder="Location" value={pkgForm.location} onChange={(e) => setPkgForm((f) => ({ ...f, location: e.target.value }))} />
            <button className="btn primary" type="button" onClick={async () => { setBusy(true); await deliverPlatformSave("/deliver/platform/warehouse/packages", { ...pkgForm, status: "received" }); setPkgForm({ orderId: "", barcode: "", location: "A-01" }); await refresh(); setBusy(false); }} disabled={busy}>Receive package</button>
          </div>
          <div className="overview-table">
            {packages.map((p) => (
              <div key={p.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                <span>{p.barcode}</span><span>{p.orderId}</span><span>{p.location}</span><span>{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "inventory" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 12 }}>
            <input placeholder="SKU" value={invForm.sku} onChange={(e) => setInvForm((f) => ({ ...f, sku: e.target.value }))} />
            <input placeholder="Name" value={invForm.name} onChange={(e) => setInvForm((f) => ({ ...f, name: e.target.value }))} />
            <input type="number" placeholder="Quantity" value={invForm.quantity} onChange={(e) => setInvForm((f) => ({ ...f, quantity: Number(e.target.value) }))} />
            <button className="btn primary" type="button" onClick={async () => { setBusy(true); await deliverPlatformSave("/deliver/platform/warehouse/inventory", invForm); await refresh(); setBusy(false); }} disabled={busy}>Update inventory</button>
          </div>
          <div className="overview-table">
            {inventory.map((i) => (
              <div key={i.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                <span>{i.sku}</span><span>{i.name}</span><span>{i.quantity}</span><span>{i.location}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "scan" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 10, maxWidth: 480 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Barcode scan</span>
              <input value={scanCode} onChange={(e) => setScanCode(e.target.value)} placeholder="Scan or type barcode" />
            </label>
            {scanned ? (
              <div>
                <strong>Found:</strong> Order {scanned.orderId} at {scanned.location} ({scanned.status})
              </div>
            ) : scanCode ? (
              <div>No package found for this barcode.</div>
            ) : null}
          </div>
        </div>
      )}
    </DeliverSectionShell>
  );
}
