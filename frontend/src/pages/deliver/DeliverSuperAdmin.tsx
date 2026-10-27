import { useEffect, useState } from "react";
import DeliverSectionShell from "../../components/deliver/DeliverSectionShell";
import {
  deliverExecutiveDashboard,
  deliverPlatformList,
  deliverPlatformSave,
  deliverSavePlatformSettings
} from "../../utils/api";

const tabs = [
  { id: "executive", label: "Executive dashboard" },
  { id: "pricing", label: "Pricing & fees" },
  { id: "promotions", label: "Promotions" },
  { id: "compliance", label: "Compliance" }
];

export default function DeliverSuperAdmin() {
  const [tab, setTab] = useState("executive");
  const [data, setData] = useState<any>(null);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ baseFare: 5, perKgRate: 2.5, taxRate: 0.16, insuranceRate: 0.05, commissionRate: 0.12 });
  const [promoForm, setPromoForm] = useState({ title: "", code: "", discountPct: 10 });

  const refresh = async () => {
    setBusy(true);
    try {
      const exec = await deliverExecutiveDashboard();
      setData(exec);
      if (exec.settings) setSettings(exec.settings);
      setPromotions(await deliverPlatformList("/deliver/platform/promotions/manage"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const dash = data?.dashboard ?? {};

  return (
    <DeliverSectionShell
      eyebrow="Deliver · Section 8"
      title="Super Admin"
      lead="Executive KPIs, platform pricing, promotions, and compliance overview."
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      actions={<button className="btn ghost" type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button>}
    >
      {tab === "executive" && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {[
            ["Total orders", dash.totalOrders],
            ["Delivered", dash.deliveredOrders],
            ["Revenue (KES)", dash.revenue],
            ["Commission (KES)", dash.commission],
            ["Drones", dash.totalDrones],
            ["Drivers", dash.totalDrivers],
            ["Merchants", dash.totalMerchants],
            ["Open tickets", dash.openTickets]
          ].map(([label, value]) => (
            <div key={String(label)} className="overview-card"><div className="panel"><strong>{label}</strong><div>{String(value ?? 0)}</div></div></div>
          ))}
        </div>
      )}

      {tab === "pricing" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 10, maxWidth: 420 }}>
            {(["baseFare", "perKgRate", "taxRate", "insuranceRate", "commissionRate"] as const).map((key) => (
              <label key={key} style={{ display: "grid", gap: 4 }}>
                <span>{key}</span>
                <input type="number" step="0.01" value={settings[key]} onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))} />
              </label>
            ))}
            <button className="btn primary" type="button" onClick={async () => { setBusy(true); await deliverSavePlatformSettings(settings); await refresh(); setBusy(false); }} disabled={busy}>Save settings</button>
          </div>
        </div>
      )}

      {tab === "promotions" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 12 }}>
            <input placeholder="Title" value={promoForm.title} onChange={(e) => setPromoForm((f) => ({ ...f, title: e.target.value }))} />
            <input placeholder="Code" value={promoForm.code} onChange={(e) => setPromoForm((f) => ({ ...f, code: e.target.value }))} />
            <input type="number" placeholder="Discount %" value={promoForm.discountPct} onChange={(e) => setPromoForm((f) => ({ ...f, discountPct: Number(e.target.value) }))} />
            <button className="btn primary" type="button" onClick={async () => { setBusy(true); await deliverPlatformSave("/deliver/platform/promotions/manage", promoForm); setPromoForm({ title: "", code: "", discountPct: 10 }); await refresh(); setBusy(false); }} disabled={busy}>Create promotion</button>
          </div>
          <div className="overview-table">
            {promotions.map((p) => (
              <div key={p.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span>{p.title}</span><span>{p.code}</span><span>{p.discountPct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "compliance" && (
        <div className="overview-card">
          <div className="panel">
            <ul>
              <li>Data storage: credentials on D1; operational data on KV/Valkey per platform policy.</li>
              <li>Order audit trail: timestamps on create, assign, status, and delivery confirmation.</li>
              <li>RBAC: each platform section has dedicated page permissions.</li>
              <li>Payment wallet: stub top-up flow — integrate PSP before production.</li>
            </ul>
          </div>
        </div>
      )}
    </DeliverSectionShell>
  );
}
