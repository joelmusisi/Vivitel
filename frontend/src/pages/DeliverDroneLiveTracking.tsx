import { useCallback, useEffect, useState } from "react";
import SortableColumnHeader from "../components/SortableColumnHeader";
import { useColumnSort } from "../hooks/useColumnSort";
import { deliverGetState } from "../utils/api";
import "../index.css";

export default function DeliverDroneLiveTracking() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drones, setDrones] = useState<any[]>([]);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const state = await deliverGetState();
      setDrones(Array.isArray(state?.drones) ? state.drones : []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDroneSortValue = useCallback((row: Record<string, unknown>, key: string) => {
    if (key === "id") return row.id;
    if (key === "name") return row.name;
    if (key === "status") return row.status;
    if (key === "battery") return row.batteryPct;
    if (key === "lat") return row.currentLat;
    if (key === "lng") return row.currentLng;
    if (key === "activeOrder") return row.activeOrderId;
    if (key === "lastUpdated") return row.lastUpdated;
    return "";
  }, []);
  const droneSort = useColumnSort({ rows: drones, getValue: getDroneSortValue });

  return (
    <div className="page">
      <div className="overview-header">
        <div>
          <div className="overview-title">Drone live tracking</div>
          <div className="overview-subtitle">Live drone status and last known position (refreshes every 5 seconds).</div>
        </div>
      </div>

      {error && <div className="admin-empty">{error}</div>}

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <div className="admin-panel-title">Drones</div>
            <div className="admin-panel-sub">{busy ? "Refreshing…" : ""}</div>
          </div>
        </div>

        <div className="admin-table">
          <div className="admin-row admin-row-head">
            <SortableColumnHeader as="span" label="ID" {...droneSort.getHeaderProps("id")} />
            <SortableColumnHeader as="span" label="Name" {...droneSort.getHeaderProps("name")} />
            <SortableColumnHeader as="span" label="Status" {...droneSort.getHeaderProps("status")} />
            <SortableColumnHeader as="span" label="Battery" {...droneSort.getHeaderProps("battery")} />
            <SortableColumnHeader as="span" label="Lat" {...droneSort.getHeaderProps("lat")} />
            <SortableColumnHeader as="span" label="Lng" {...droneSort.getHeaderProps("lng")} />
            <SortableColumnHeader as="span" label="Active order" {...droneSort.getHeaderProps("activeOrder")} />
            <SortableColumnHeader as="span" label="Last updated" {...droneSort.getHeaderProps("lastUpdated")} />
          </div>
          {droneSort.sortedRows.map((d) => (
            <div key={String(d.id ?? Math.random())} className="admin-row">
              <span>{String(d.id ?? "")}</span>
              <span>{String(d.name ?? "")}</span>
              <span className={`admin-pill ${String(d.status ?? "").toLowerCase()}`}>{String(d.status ?? "")}</span>
              <span>{String(d.batteryPct ?? "")}%</span>
              <span>{String(d.currentLat ?? "")}</span>
              <span>{String(d.currentLng ?? "")}</span>
              <span>{String(d.activeOrderId ?? "")}</span>
              <span>{String(d.lastUpdated ?? "")}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
