import { useCallback, useEffect, useState } from "react";
import SortableColumnHeader from "../components/SortableColumnHeader";
import { useColumnSort } from "../hooks/useColumnSort";
import { deliverGetOrders } from "../utils/api";
import "../index.css";

export default function DeliverDroneHistoricalTracking() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await deliverGetOrders({ status: "closed" });
      setOrders(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getOrderSortValue = useCallback((row: Record<string, unknown>, key: string) => {
    if (key === "order") return row.id;
    if (key === "drone") return row.assignedDroneId;
    if (key === "status") return row.status;
    if (key === "client") return row.clientName;
    if (key === "pickup") return row.pickupAddress;
    if (key === "dropoff") return row.dropoffAddress;
    if (key === "created") return row.createdAt;
    if (key === "delivered") return row.deliveredAt;
    return "";
  }, []);
  const orderSort = useColumnSort({ rows: orders, getValue: getOrderSortValue });

  return (
    <div className="page">
      <div className="overview-header">
        <div>
          <div className="overview-title">Drone historical tracking</div>
          <div className="overview-subtitle">Closed deliveries (completed trips). Use this to audit drone movement history per order.</div>
        </div>
      </div>

      {error && <div className="admin-empty">{error}</div>}

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <div className="admin-panel-title">Closed orders</div>
            <div className="admin-panel-sub">{busy ? "Loading…" : ""}</div>
          </div>
          <div className="admin-actions">
            <button type="button" className="admin-btn ghost" onClick={() => void refresh()} disabled={busy}>
              Refresh
            </button>
          </div>
        </div>

        <div className="admin-table">
          <div className="admin-row admin-row-head">
            <SortableColumnHeader as="span" label="Order" {...orderSort.getHeaderProps("order")} />
            <SortableColumnHeader as="span" label="Drone" {...orderSort.getHeaderProps("drone")} />
            <SortableColumnHeader as="span" label="Status" {...orderSort.getHeaderProps("status")} />
            <SortableColumnHeader as="span" label="Client" {...orderSort.getHeaderProps("client")} />
            <SortableColumnHeader as="span" label="Pickup" {...orderSort.getHeaderProps("pickup")} />
            <SortableColumnHeader as="span" label="Dropoff" {...orderSort.getHeaderProps("dropoff")} />
            <SortableColumnHeader as="span" label="Created" {...orderSort.getHeaderProps("created")} />
            <SortableColumnHeader as="span" label="Delivered" {...orderSort.getHeaderProps("delivered")} />
          </div>
          {orderSort.sortedRows.map((o) => (
            <div key={String(o.id ?? Math.random())} className="admin-row">
              <span>{String(o.id ?? "")}</span>
              <span>{String(o.assignedDroneId ?? "")}</span>
              <span className={`admin-pill ${String(o.status ?? "").toLowerCase()}`}>{String(o.status ?? "")}</span>
              <span>{String(o.clientName ?? "")}</span>
              <span>{String(o.pickupAddress ?? "")}</span>
              <span>{String(o.dropoffAddress ?? "")}</span>
              <span>{String(o.createdAt ?? "")}</span>
              <span>{String(o.deliveredAt ?? "")}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
