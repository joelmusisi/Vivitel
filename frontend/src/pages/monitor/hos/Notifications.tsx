import { useCallback, useMemo, useState } from "react";
import SortableColumnHeader from "../../../components/SortableColumnHeader";
import { useColumnSort } from "../../../hooks/useColumnSort";
import { useNavigate } from "react-router-dom";
import {
  saveHosAlertState,
  useHosFleet,
  type HosAlert
} from "../../../utils/hos";
import { beginSaving, endSavingDone, endSavingError } from "../../../utils/saveFeedback";
import "../../../index.css";

export default function HosNotifications() {
  const navigate = useNavigate();
  const { snapshot, busy, error, reload, setSnapshot } = useHosFleet();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const notifications = snapshot?.alerts ?? [];

  const filtered = useMemo(() => {
    return notifications.filter((row) => {
      const hay = `${row.driverName} ${row.type} ${row.message}`.toLowerCase();
      const matchesSearch = !search.trim() || hay.includes(search.trim().toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [notifications, search, statusFilter]);

  const getAlertSortValue = useCallback((row: HosAlert, key: string) => {
    if (key === "driver") return `${row.driverName} ${row.message}`;
    if (key === "type") return row.type;
    if (key === "severity") return row.severity;
    if (key === "when") return row.time;
    if (key === "status") return row.status;
    return "";
  }, []);
  const alertSort = useColumnSort({ rows: filtered, getValue: getAlertSortValue });

  const setStatus = async (alert: HosAlert, status: HosAlert["status"]) => {
    beginSaving("Updating alert");
    try {
      const next = await saveHosAlertState({ ...alert, status });
      setSnapshot((current) => {
        if (!current) return current;
        return {
          ...current,
          alerts: current.alerts.map((row) => (row.id === next.id ? { ...row, ...next } : row))
        };
      });
      endSavingDone(status === "resolved" ? "Alert resolved" : "Alert updated");
    } catch (e: any) {
      endSavingError(String(e?.message ?? e));
    }
  };

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">HOS alerts</div>
          <div className="hos-path">Track / Hours of service / Hos Alerts</div>
        </div>
        <div className="hos-actions">
          <button
            type="button"
            className="hos-btn ghost"
            onClick={() => navigate("/Analyze/insights/reports?category=Hours%20Of%20Service%20Reports&report=Hours%20Of%20Service%20Violations%20Report")}
          >
            Violations report
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
            <div className="hos-panel-title">Limit and rest alerts</div>
            <div className="hos-panel-sub">Generated from organisation HOS rules and trip activity.</div>
          </div>
          <div className="hos-filter-row">
            <input
              className="hos-search"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="hos-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>
        <div className="hos-table">
          <div className="hos-row hos-row-head hos-row-6">
            <SortableColumnHeader as="span" label="Driver" {...alertSort.getHeaderProps("driver")} />
            <SortableColumnHeader as="span" label="Type" {...alertSort.getHeaderProps("type")} />
            <SortableColumnHeader as="span" label="Severity" {...alertSort.getHeaderProps("severity")} />
            <SortableColumnHeader as="span" label="When" {...alertSort.getHeaderProps("when")} />
            <SortableColumnHeader as="span" label="Status" {...alertSort.getHeaderProps("status")} />
            <span>Actions</span>
          </div>
          {alertSort.sortedRows.length === 0 ? (
            <div className="hos-empty">{busy ? "Loading…" : "No HOS alerts right now."}</div>
          ) : (
            alertSort.sortedRows.map((row) => (
              <div key={row.id} className="hos-row hos-row-6">
                <span>
                  <strong>{row.driverName}</strong>
                  <div className="hos-panel-sub">{row.message}</div>
                </span>
                <span>{row.type.replace(/_/g, " ")}</span>
                <span className={`hos-pill ${row.severity === "high" ? "bad" : row.severity === "medium" ? "warn" : "ok"}`}>
                  {row.severity}
                </span>
                <span>{new Date(row.time).toLocaleString()}</span>
                <span>{row.status}</span>
                <span className="hos-actions-inline">
                  {row.status === "open" ? (
                    <button type="button" className="hos-link" onClick={() => void setStatus(row, "acknowledged")}>
                      Ack
                    </button>
                  ) : null}
                  {row.status !== "resolved" ? (
                    <button type="button" className="hos-link" onClick={() => void setStatus(row, "resolved")}>
                      Resolve
                    </button>
                  ) : null}
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
