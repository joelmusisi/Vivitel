import { useCallback, useMemo, useState } from "react";
import SortableColumnHeader from "../../../components/SortableColumnHeader";
import { useColumnSort } from "../../../hooks/useColumnSort";
import { useNavigate } from "react-router-dom";
import {
  dutyStatusLabel,
  formatDurationMs,
  useHosFleet
} from "../../../utils/hos";
import "../../../index.css";

export default function HosLogViewer() {
  const navigate = useNavigate();
  const { snapshot, busy, error, reload } = useHosFleet();
  const [search, setSearch] = useState("");

  const filteredSegments = useMemo(() => {
    const q = search.trim().toLowerCase();
    const segments = (snapshot?.drivers ?? []).flatMap((d) => d.segments);
    return segments
      .filter((seg) => {
        if (!q) return true;
        return `${seg.driverName} ${seg.assetLabel ?? ""} ${seg.status} ${seg.source}`.toLowerCase().includes(q);
      })
      .slice(0, 500);
  }, [snapshot, search]);

  type HosLogSortKey = "driver" | "asset" | "status" | "start" | "end" | "duration" | "source";

  const getLogSortValue = useCallback((row: (typeof filteredSegments)[number], key: HosLogSortKey) => {
    if (key === "driver") return row.driverName;
    if (key === "asset") return row.assetLabel ?? "";
    if (key === "status") return dutyStatusLabel(row.status);
    if (key === "start") return row.startMs;
    if (key === "end") return row.endMs;
    if (key === "duration") return row.endMs - row.startMs;
    if (key === "source") return row.source;
    return "";
  }, []);
  const logSort = useColumnSort<(typeof filteredSegments)[number], HosLogSortKey>({
    rows: filteredSegments,
    getValue: getLogSortValue,
    initialSort: { key: "start", direction: "desc" }
  });

  const exportCsv = () => {
    const headers = ["Driver", "Asset", "Status", "Start", "End", "Duration", "Source"];
    const body = logSort.sortedRows.map((row) => [
      row.driverName,
      row.assetLabel ?? "",
      dutyStatusLabel(row.status),
      new Date(row.startMs).toISOString(),
      new Date(row.endMs).toISOString(),
      formatDurationMs(row.endMs - row.startMs),
      row.source
    ]);
    const csv = [headers, ...body]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hos-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">Log viewer</div>
          <div className="hos-path">Track / Hours of service / Log viewer</div>
        </div>
        <div className="hos-actions">
          <button type="button" className="hos-btn ghost" onClick={exportCsv} disabled={!logSort.sortedRows.length}>
            Export
          </button>
          <button type="button" className="hos-btn ghost" onClick={() => navigate("/Track/hos/timeline")}>
            Timeline
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
            <div className="hos-panel-title">Duty audit log</div>
            <div className="hos-panel-sub">Segments from trips, gaps, and timeclock punches.</div>
          </div>
          <input
            className="hos-search"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="hos-table">
          <div className="hos-row hos-row-head hos-row-7">
            <SortableColumnHeader as="span" label="Driver" {...logSort.getHeaderProps("driver")} />
            <SortableColumnHeader as="span" label="Asset" {...logSort.getHeaderProps("asset")} />
            <SortableColumnHeader as="span" label="Status" {...logSort.getHeaderProps("status")} />
            <SortableColumnHeader as="span" label="Start" {...logSort.getHeaderProps("start")} />
            <SortableColumnHeader as="span" label="End" {...logSort.getHeaderProps("end")} />
            <SortableColumnHeader as="span" label="Duration" {...logSort.getHeaderProps("duration")} />
            <SortableColumnHeader as="span" label="Source" {...logSort.getHeaderProps("source")} />
          </div>
          {logSort.sortedRows.length === 0 ? (
            <div className="hos-empty">{busy ? "Loading…" : "No log records yet."}</div>
          ) : (
            logSort.sortedRows.map((row) => (
              <div key={row.id} className="hos-row hos-row-7">
                <span>{row.driverName}</span>
                <span>{row.assetLabel || "—"}</span>
                <span>{dutyStatusLabel(row.status)}</span>
                <span>{new Date(row.startMs).toLocaleString()}</span>
                <span>{new Date(row.endMs).toLocaleString()}</span>
                <span>{formatDurationMs(row.endMs - row.startMs)}</span>
                <span>{row.source}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
