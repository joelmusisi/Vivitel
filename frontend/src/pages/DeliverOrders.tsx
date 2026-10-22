import { useEffect, useMemo, useState } from "react";
import { deliverGetOrders, deliverSetOrderStatus } from "../utils/api";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type StatusTab = "pending" | "suspended" | "closed";

const statusLabel: Record<StatusTab, string> = {
  pending: "Pending",
  suspended: "Suspended",
  closed: "Closed"
};

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: any[]) {
  const headers = [
    "id",
    "clientName",
    "clientPhone",
    "pickupAddress",
    "dropoffAddress",
    "packageWeightKg",
    "priority",
    "status",
    "assignedDroneId",
    "createdAt",
    "deliveredAt"
  ];
  const esc = (v: any) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(","))].join("\n");
}

export default function DeliverOrders() {
  const [tab, setTab] = useState<StatusTab>("pending");
  const [orders, setOrders] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await deliverGetOrders({ status: tab });
      setOrders(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [tab]);

  const rows = useMemo(() => {
    const sorted = [...orders];
    sorted.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    return sorted;
  }, [orders]);

  const exportCsv = () => {
    downloadText(`orders-${tab}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, `orders-${tab}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text(`Orders (${statusLabel[tab]})`, 14, 12);
    autoTable(doc, {
      startY: 18,
      head: [["Order", "Client", "Phone", "Weight", "Priority", "Status", "Drone", "Created", "Delivered"]],
      body: rows.map((o) => [
        String(o.id ?? ""),
        String(o.clientName ?? ""),
        String(o.clientPhone ?? ""),
        String(o.packageWeightKg ?? ""),
        String(o.priority ?? ""),
        String(o.status ?? ""),
        String(o.assignedDroneId ?? ""),
        String(o.createdAt ?? ""),
        String(o.deliveredAt ?? "")
      ])
    });
    doc.save(`orders-${tab}.pdf`);
  };

  const setStatus = async (orderId: string, status: StatusTab) => {
    setBusy(true);
    try {
      const result = await deliverSetOrderStatus(orderId, status);
      if (!result.ok) {
        setError(result.error ?? "Status update failed");
        return;
      }
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
          <h2 style={{ margin: 0 }}>Orders</h2>
          <p className="overview-lead">Browse pending, suspended, and closed orders. Export to CSV, Excel, or PDF.</p>
        </div>
        <div className="overview-actions">
          <button className="btn ghost" type="button" onClick={exportCsv} disabled={busy}>
            Download CSV
          </button>
          <button className="btn ghost" type="button" onClick={exportExcel} disabled={busy}>
            Download Excel
          </button>
          <button className="btn primary" type="button" onClick={exportPdf} disabled={busy}>
            Download PDF
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {(["pending", "suspended", "closed"] as StatusTab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={"btn " + (tab === t ? "primary" : "ghost")}
            onClick={() => setTab(t)}
          >
            {statusLabel[t]}
          </button>
        ))}
        <button className="btn ghost" type="button" onClick={() => void refresh()} disabled={busy}>
          Refresh
        </button>
      </div>

      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}

      <div className="overview-card">
        <div className="panel">
          <div className="overview-card-header">
            <h3>{statusLabel[tab]} orders</h3>
            <span>{rows.length}</span>
          </div>

          <div className="overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "1fr 1.2fr 0.7fr 0.7fr 0.8fr 1fr 1.1fr" }}>
              <span>Order</span>
              <span>Client</span>
              <span>Weight</span>
              <span>Priority</span>
              <span>Status</span>
              <span>Drone</span>
              <span>Actions</span>
            </div>
            {rows.map((o) => (
              <div key={String(o.id)} className="overview-row" style={{ gridTemplateColumns: "1fr 1.2fr 0.7fr 0.7fr 0.8fr 1fr 1.1fr" }}>
                <span>{String(o.id ?? "")}</span>
                <span>
                  {String(o.clientName ?? "")}
                  <br />
                  <small>{String(o.clientPhone ?? "")}</small>
                </span>
                <span>{String(o.packageWeightKg ?? "")}</span>
                <span>{String(o.priority ?? "")}</span>
                <span>{String(o.status ?? "")}</span>
                <span>{String(o.assignedDroneId ?? "-")}</span>
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {tab !== "suspended" && (
                    <button className="btn ghost" type="button" onClick={() => void setStatus(String(o.id), "suspended")} disabled={busy}>
                      Suspend
                    </button>
                  )}
                  {tab === "suspended" && (
                    <button className="btn ghost" type="button" onClick={() => void setStatus(String(o.id), "pending")} disabled={busy}>
                      Reopen
                    </button>
                  )}
                  {tab !== "closed" && (
                    <button className="btn primary" type="button" onClick={() => void setStatus(String(o.id), "closed")} disabled={busy}>
                      Close
                    </button>
                  )}
                </span>
              </div>
            ))}
            {!rows.length && <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>No orders.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
