import { useEffect, useState } from "react";
import DeliverSectionShell from "../../components/deliver/DeliverSectionShell";
import { deliverPlatformList, deliverPlatformSave, deliverReplySupportTicket } from "../../utils/api";

const tabs = [
  { id: "queue", label: "Ticket queue" },
  { id: "create", label: "Create ticket" },
  { id: "detail", label: "Conversation" }
];

export default function DeliverSupport() {
  const [tab, setTab] = useState("queue");
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ customerPhone: "", orderId: "", subject: "", priority: "normal" });

  const refresh = async () => {
    setBusy(true);
    try {
      setTickets(await deliverPlatformList("/deliver/platform/support/tickets"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selected = tickets.find((t) => String(t.id) === selectedId);

  return (
    <DeliverSectionShell
      eyebrow="Deliver · Section 7"
      title="Support Center"
      lead="Manage customer tickets, priorities, and agent conversations."
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      actions={<button className="btn ghost" type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button>}
    >
      {tab === "queue" && (
        <div className="overview-card">
          <div className="overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr" }}>
              <span>Ticket</span><span>Customer</span><span>Order</span><span>Priority</span><span>Status</span>
            </div>
            {tickets.map((t) => (
              <div key={t.id} className="overview-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", cursor: "pointer" }} onClick={() => { setSelectedId(t.id); setTab("detail"); }}>
                <span>{t.id}</span><span>{t.customerPhone}</span><span>{t.orderId}</span><span>{t.priority}</span><span>{t.status}</span>
              </div>
            ))}
            {!tickets.length && <div>No tickets.</div>}
          </div>
        </div>
      )}

      {tab === "create" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
            <input placeholder="Customer phone" value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} />
            <input placeholder="Order ID" value={form.orderId} onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))} />
            <input placeholder="Subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
            </select>
            <button className="btn primary" type="button" onClick={async () => { setBusy(true); await deliverPlatformSave("/deliver/platform/support/tickets", form); setForm({ customerPhone: "", orderId: "", subject: "", priority: "normal" }); await refresh(); setTab("queue"); setBusy(false); }} disabled={busy}>Create ticket</button>
          </div>
        </div>
      )}

      {tab === "detail" && (
        <div className="overview-card">
          <div className="panel" style={{ display: "grid", gap: 10, maxWidth: 640 }}>
            {selected ? (
              <>
                <h3>{selected.subject} ({selected.id})</h3>
                <div>
                  {(selected.messages ?? []).map((m: any) => (
                    <div key={m.id} style={{ marginBottom: 6 }}><strong>{m.author}:</strong> {m.message} <small>{m.at}</small></div>
                  ))}
                </div>
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Agent reply" />
                <button className="btn primary" type="button" onClick={async () => { setBusy(true); await deliverReplySupportTicket(selected.id, reply, "agent"); setReply(""); await refresh(); setBusy(false); }} disabled={!reply || busy}>Send reply</button>
              </>
            ) : (
              <p>No ticket selected.</p>
            )}
          </div>
        </div>
      )}
    </DeliverSectionShell>
  );
}
