import { useCallback, useMemo, useState } from "react";
import SortableColumnHeader from "../../../components/SortableColumnHeader";
import { useColumnSort } from "../../../hooks/useColumnSort";
import { useNavigate } from "react-router-dom";
import {
  dutyStatusLabel,
  formatDurationMs,
  postHosTimeclockPunch,
  useHosFleet,
  type DutyStatus,
  type DriverHosStatus
} from "../../../utils/hos";
import { beginSaving, endSavingDone, endSavingError } from "../../../utils/saveFeedback";
import "../../../index.css";

const CLOCK_OPTIONS: DutyStatus[] = ["on_duty", "driving", "break", "off_duty", "sleeper"];

export default function HosTimeclock() {
  const navigate = useNavigate();
  const { snapshot, busy, error, reload } = useHosFleet();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [punchBusy, setPunchBusy] = useState<string | null>(null);

  const drivers = snapshot?.drivers ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter((row) => {
      if (q && !`${row.driverName} ${row.assetLabel}`.toLowerCase().includes(q)) return false;
      if (statusFilter === "all") return true;
      return row.currentStatus === statusFilter;
    });
  }, [drivers, search, statusFilter]);

  const getTimeclockSortValue = useCallback((row: DriverHosStatus, key: string) => {
    if (key === "driver") return row.driverName;
    if (key === "asset") return row.assetLabel;
    if (key === "current") return dutyStatusLabel(row.currentStatus);
    if (key === "driveToday") return row.driveMsToday;
    return "";
  }, []);
  const timeclockSort = useColumnSort({ rows: filtered, getValue: getTimeclockSortValue });

  const clock = async (row: DriverHosStatus, status: DutyStatus) => {
    setPunchBusy(row.driverKey);
    beginSaving(`Clock ${dutyStatusLabel(status)}`);
    try {
      await postHosTimeclockPunch({
        driverKey: row.driverKey,
        driverName: row.driverName,
        status
      });
      endSavingDone(`${dutyStatusLabel(status)} recorded`);
      await reload();
    } catch (e: any) {
      endSavingError(String(e?.message ?? e));
    } finally {
      setPunchBusy(null);
    }
  };

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">Timeclock</div>
          <div className="hos-path">Track / Hours of service / Timeclock</div>
        </div>
        <div className="hos-actions">
          <button
            type="button"
            className="hos-btn ghost"
            onClick={() => navigate("/Analyze/insights/reports?category=Hours%20Of%20Service%20Reports")}
          >
            View HOS reports
          </button>
          <button type="button" className="hos-btn ghost" onClick={() => navigate("/Track/hos/log-viewer")}>
            View log
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
            <div className="hos-panel-title">Duty roster</div>
            <div className="hos-panel-sub">Clock status changes for drivers; punches feed the HOS engine.</div>
          </div>
          <div className="hos-filter-row">
            <input
              className="hos-search"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="hos-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {CLOCK_OPTIONS.map((status) => (
                <option key={status} value={status}>{dutyStatusLabel(status)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="hos-table">
          <div className="hos-row hos-row-head hos-row-5">
            <SortableColumnHeader as="span" label="Driver" {...timeclockSort.getHeaderProps("driver")} />
            <SortableColumnHeader as="span" label="Asset" {...timeclockSort.getHeaderProps("asset")} />
            <SortableColumnHeader as="span" label="Current" {...timeclockSort.getHeaderProps("current")} />
            <SortableColumnHeader as="span" label="Drive today" {...timeclockSort.getHeaderProps("driveToday")} />
            <span>Clock</span>
          </div>
          {timeclockSort.sortedRows.length === 0 ? (
            <div className="hos-empty">{busy ? "Loading…" : "No drivers on the roster yet."}</div>
          ) : (
            timeclockSort.sortedRows.map((row) => (
              <div key={row.driverKey} className="hos-row hos-row-5">
                <span>{row.driverName}</span>
                <span>{row.assetLabel}</span>
                <span className="hos-pill ok">{dutyStatusLabel(row.currentStatus)}</span>
                <span>{formatDurationMs(row.driveMsToday)}</span>
                <span className="hos-actions-inline">
                  {CLOCK_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className="hos-link"
                      disabled={punchBusy === row.driverKey || row.currentStatus === status}
                      onClick={() => void clock(row, status)}
                    >
                      {dutyStatusLabel(status)}
                    </button>
                  ))}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
