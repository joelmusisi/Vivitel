import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import SortableColumnHeader from "../../../components/SortableColumnHeader";
import { useColumnSort } from "../../../hooks/useColumnSort";
import {
  dutyStatusLabel,
  formatDurationMs,
  useHosFleet
} from "../../../utils/hos";
import "../../../index.css";

export default function HosDashboard() {
  const navigate = useNavigate();
  const { snapshot, busy, error, reload } = useHosFleet();

  const drivers = snapshot?.drivers ?? [];

  const nearingBase = useMemo(
    () => drivers.filter((d) => d.nearLimit || !d.compliant).slice(0, 12),
    [drivers]
  );

  type HosDashboardSortKey = "driver" | "asset" | "remaining" | "lastBreak" | "status";

  const getNearingSortValue = useCallback((row: (typeof drivers)[number], key: HosDashboardSortKey) => {
    if (key === "driver") return row.driverName;
    if (key === "asset") return row.assetLabel;
    if (key === "remaining") return row.remainingDriveMs;
    if (key === "lastBreak") return row.lastBreakMs ?? 0;
    if (key === "status") return dutyStatusLabel(row.currentStatus);
    return "";
  }, []);
  const nearingSort = useColumnSort<(typeof drivers)[number], HosDashboardSortKey>({
    rows: nearingBase,
    getValue: getNearingSortValue,
    initialSort: { key: "remaining", direction: "asc" }
  });

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">HOS dashboard</div>
          <div className="hos-path">Track / Hours of service / Dashboard</div>
        </div>
        <div className="hos-actions">
          <button
            type="button"
            className="hos-btn ghost"
            onClick={() => navigate("/Analyze/insights/reports?category=Hours%20Of%20Service%20Reports")}
          >
            View HOS reports
          </button>
          <button type="button" className="hos-btn ghost" onClick={() => navigate("/Track/hos/overview")}>
            Overview
          </button>
          <button type="button" className="hos-btn" onClick={() => void reload()} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <div className="hos-empty" role="alert">{error}</div> : null}

      <section className="hos-panel">
        <div className="hos-panel-header">
          <div>
            <div className="hos-panel-title">Drivers nearing limits</div>
            <div className="hos-panel-sub">Prioritise breaks and shift swaps.</div>
          </div>
          <button type="button" className="hos-link" onClick={() => navigate("/Track/hos/overview")}>
            Open full roster
          </button>
        </div>
        <div className="hos-table">
          <div className="hos-row hos-row-head">
            <SortableColumnHeader as="span" label="Driver" {...nearingSort.getHeaderProps("driver")} />
            <SortableColumnHeader as="span" label="Asset" {...nearingSort.getHeaderProps("asset")} />
            <SortableColumnHeader as="span" label="Remaining" {...nearingSort.getHeaderProps("remaining")} />
            <SortableColumnHeader as="span" label="Last break" {...nearingSort.getHeaderProps("lastBreak")} />
            <SortableColumnHeader as="span" label="Status" {...nearingSort.getHeaderProps("status")} />
            <span>Actions</span>
          </div>
          {nearingSort.sortedRows.length === 0 ? (
            <div className="hos-empty">{busy ? "Loading HOS data…" : "No drivers near limits right now."}</div>
          ) : (
            nearingSort.sortedRows.map((row) => (
              <div key={row.driverKey} className="hos-row">
                <span>{row.driverName}</span>
                <span>{row.assetLabel}</span>
                <span>{formatDurationMs(row.remainingDriveMs)} drive</span>
                <span>{row.lastBreakMs ? new Date(row.lastBreakMs).toLocaleTimeString() : "—"}</span>
                <span className={`hos-pill ${row.compliant ? "ok" : "bad"}`}>
                  {dutyStatusLabel(row.currentStatus)}
                </span>
                <span>
                  <button type="button" className="hos-link" onClick={() => navigate("/Track/hos/timeline")}>
                    Timeline
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
