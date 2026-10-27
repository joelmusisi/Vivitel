import { useEffect, useMemo, useState } from "react";
import DeliverSectionShell from "../../components/deliver/DeliverSectionShell";
import {
  deliverCustomerDashboard,
  deliverGetAddresses,
  deliverGetWallet,
  deliverPlaceOrder,
  deliverSaveAddress,
  deliverSaveCustomerProfile,
  deliverTopUpWallet,
  deliverTrackOrders
} from "../../utils/api";

const PHONE_KEY = "vivitel.deliver.customerPhone";
const tabs = [
  { id: "home", label: "Home" },
  { id: "create", label: "Create delivery" },
  { id: "summary", label: "Summary" },
  { id: "track", label: "Track" },
  { id: "history", label: "History" },
  { id: "wallet", label: "Wallet" },
  { id: "profile", label: "Profile" }
];

export default function DeliverCustomerApp() {
  const [tab, setTab] = useState("home");
  const [phone, setPhone] = useState(() => localStorage.getItem(PHONE_KEY) ?? "");
  const [dashboard, setDashboard] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    clientName: "",
    pickupAddress: "",
    dropoffAddress: "",
    packageWeightKg: 1,
    packageType: "parcel",
    deliveryMode: "auto",
    priority: "normal",
    insuranceSelected: false,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10
  });
  const [lastOrder, setLastOrder] = useState<any>(null);
  const [profile, setProfile] = useState({ name: "", email: "", language: "en" });
  const [addressForm, setAddressForm] = useState({ label: "Home", address: "" });
  const [topUpAmount, setTopUpAmount] = useState(500);
  const [trackId, setTrackId] = useState("");

  const activePhone = useMemo(() => phone.trim(), [phone]);

  const refresh = async () => {
    if (!activePhone) return;
    setBusy(true);
    setError(null);
    try {
      const [dash, w, hist] = await Promise.all([
        deliverCustomerDashboard(activePhone),
        deliverGetWallet(activePhone),
        deliverTrackOrders(activePhone)
      ]);
      setDashboard(dash);
      setWallet(w);
      setHistory(hist.orders ?? []);
      if (dash?.profile) {
        setProfile({
          name: String(dash.profile.name ?? ""),
          email: String(dash.profile.email ?? ""),
          language: String(dash.profile.language ?? "en")
        });
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (activePhone) {
      localStorage.setItem(PHONE_KEY, activePhone);
      void refresh();
    }
  }, [activePhone]);

  const placeOrder = async () => {
    if (!activePhone) return setError("Enter your phone number first.");
    setBusy(true);
    setError(null);
    try {
      const result = await deliverPlaceOrder({
        clientName: draft.clientName || profile.name || "Customer",
        clientPhone: activePhone,
        pickupAddress: draft.pickupAddress,
        dropoffAddress: draft.dropoffAddress,
        packageWeightKg: Number(draft.packageWeightKg) || 0,
        priority: draft.priority,
        packageType: draft.packageType,
        deliveryMode: draft.deliveryMode,
        insuranceSelected: draft.insuranceSelected,
        dimensions: { lengthCm: draft.lengthCm, widthCm: draft.widthCm, heightCm: draft.heightCm }
      });
      if (!result.ok) {
        setError(result.error ?? "Order failed");
        return;
      }
      setLastOrder(result.order);
      setTab("summary");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!activePhone) return;
    setBusy(true);
    try {
      await deliverSaveCustomerProfile({ phone: activePhone, ...profile });
      await refresh();
      setTab("home");
    } finally {
      setBusy(false);
    }
  };

  const saveAddress = async () => {
    if (!activePhone || !addressForm.address) return;
    setBusy(true);
    try {
      await deliverSaveAddress({ phone: activePhone, ...addressForm });
      setAddressForm({ label: "Home", address: "" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const topUp = async () => {
    if (!activePhone) return;
    setBusy(true);
    try {
      await deliverTopUpWallet(activePhone, topUpAmount, "Customer top-up");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const trackedOrder = history.find((o) => String(o.id) === trackId) ?? dashboard?.activeDelivery;

  return (
    <DeliverSectionShell
      eyebrow="Deliver · Section 1"
      title="Customer Application"
      lead="Book deliveries, track orders, manage wallet and saved addresses."
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      actions={
        <button className="btn ghost" type="button" onClick={() => void refresh()} disabled={busy}>
          Refresh
        </button>
      }
    >
      <div className="overview-card" style={{ marginBottom: 12 }}>
        <div className="panel" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Customer phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254..." />
          </label>
          <button className="btn primary" type="button" onClick={() => void refresh()} disabled={!activePhone || busy}>
            Load account
          </button>
        </div>
      </div>
      {error && <div style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</div>}

      {tab === "home" && dashboard && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div className="overview-card"><div className="panel"><strong>Wallet</strong><div>{wallet?.currency ?? "KES"} {Number(wallet?.balance ?? 0).toFixed(2)}</div></div></div>
          <div className="overview-card"><div className="panel"><strong>Active delivery</strong><div>{dashboard.activeDelivery?.id ?? "None"}</div></div></div>
          <div className="overview-card"><div className="panel"><strong>Saved addresses</strong><div>{dashboard.savedAddresses?.length ?? 0}</div></div></div>
          <div className="overview-card"><div className="panel"><strong>Promotions</strong><div>{dashboard.promotions?.length ?? 0} active</div></div></div>
        </div>
      )}

      {tab === "create" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 10, maxWidth: 640 }}>
            {[
              ["clientName", "Recipient name"],
              ["pickupAddress", "Pickup address"],
              ["dropoffAddress", "Drop-off address"]
            ].map(([key, label]) => (
              <label key={key} style={{ display: "grid", gap: 4 }}>
                <span>{label}</span>
                <input
                  value={(draft as any)[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                />
              </label>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <label style={{ display: "grid", gap: 4 }}><span>Weight (kg)</span><input type="number" value={draft.packageWeightKg} onChange={(e) => setDraft((d) => ({ ...d, packageWeightKg: Number(e.target.value) }))} /></label>
              <label style={{ display: "grid", gap: 4 }}><span>Mode</span><select value={draft.deliveryMode} onChange={(e) => setDraft((d) => ({ ...d, deliveryMode: e.target.value }))}><option value="auto">Auto</option><option value="drone">Drone</option><option value="ground">Ground</option></select></label>
              <label style={{ display: "grid", gap: 4 }}><span>Priority</span><select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            </div>
            <label><input type="checkbox" checked={draft.insuranceSelected} onChange={(e) => setDraft((d) => ({ ...d, insuranceSelected: e.target.checked }))} /> Add insurance</label>
            <button className="btn primary" type="button" onClick={() => void placeOrder()} disabled={busy}>Continue to summary</button>
          </div>
        </div>
      )}

      {tab === "summary" && lastOrder && (
        <div className="overview-card">
          <div className="panel">
            <h3>Order {lastOrder.id}</h3>
            <p>Total: {lastOrder.pricing?.currency ?? "KES"} {Number(lastOrder.pricing?.total ?? 0).toFixed(2)}</p>
            <p>ETA: {lastOrder.eta ? new Date(lastOrder.eta).toLocaleString() : "—"}</p>
            <p>Mode: {lastOrder.deliveryMode} · Priority: {lastOrder.priority}</p>
          </div>
        </div>
      )}

      {tab === "track" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 520 }}>
            <label style={{ display: "grid", gap: 4 }}><span>Order ID</span><input value={trackId} onChange={(e) => setTrackId(e.target.value)} placeholder={dashboard?.activeDelivery?.id ?? "ORD-..."} /></label>
            {trackedOrder ? (
              <div>
                <div>Status: <strong>{trackedOrder.status}</strong></div>
                <div>Pickup: {trackedOrder.pickupAddress}</div>
                <div>Drop-off: {trackedOrder.dropoffAddress}</div>
                <div>Assigned drone: {trackedOrder.assignedDroneId || "Pending assignment"}</div>
              </div>
            ) : (
              <div>No matching order.</div>
            )}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="overview-card">
          <div className="panel overview-table">
            {history.map((o) => (
              <div key={String(o.id)} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span>{o.id}</span>
                <span>{o.status}</span>
                <span>{o.createdAt ? new Date(o.createdAt).toLocaleString() : ""}</span>
              </div>
            ))}
            {!history.length && <div>No deliveries yet.</div>}
          </div>
        </div>
      )}

      {tab === "wallet" && wallet && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 10, maxWidth: 480 }}>
            <div>Balance: <strong>{wallet.currency} {Number(wallet.balance).toFixed(2)}</strong></div>
            <label style={{ display: "grid", gap: 4 }}><span>Top-up amount</span><input type="number" value={topUpAmount} onChange={(e) => setTopUpAmount(Number(e.target.value))} /></label>
            <button className="btn primary" type="button" onClick={() => void topUp()} disabled={busy}>Top up wallet</button>
            <div>
              <h4>Recent transactions</h4>
              {(wallet.transactions ?? []).slice(0, 8).map((t: any) => (
                <div key={t.id}>{t.at}: {t.type} +{t.amount}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "profile" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 10, maxWidth: 480 }}>
            <label style={{ display: "grid", gap: 4 }}><span>Name</span><input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} /></label>
            <label style={{ display: "grid", gap: 4 }}><span>Email</span><input value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} /></label>
            <label style={{ display: "grid", gap: 4 }}><span>Language</span><select value={profile.language} onChange={(e) => setProfile((p) => ({ ...p, language: e.target.value }))}><option value="en">English</option><option value="sw">Swahili</option></select></label>
            <button className="btn primary" type="button" onClick={() => void saveProfile()} disabled={busy}>Save profile</button>
            <hr />
            <h4>Saved addresses</h4>
            {(dashboard?.savedAddresses ?? []).map((a: any) => (
              <div key={a.id}>{a.label}: {a.address}</div>
            ))}
            <label style={{ display: "grid", gap: 4 }}><span>Label</span><input value={addressForm.label} onChange={(e) => setAddressForm((f) => ({ ...f, label: e.target.value }))} /></label>
            <label style={{ display: "grid", gap: 4 }}><span>Address</span><input value={addressForm.address} onChange={(e) => setAddressForm((f) => ({ ...f, address: e.target.value }))} /></label>
            <button className="btn ghost" type="button" onClick={() => void saveAddress()} disabled={busy}>Add address</button>
          </div>
        </div>
      )}
    </DeliverSectionShell>
  );
}
