import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  dutyStatusLabel,
  endOfLocalDay,
  startOfLocalDay,
  useHosFleet,
  type DutyStatus
} from "../../../utils/hos";
import "../../../index.css";

const STATUS_COLOR: Record<DutyStatus, string> = {
  driving: "#0f766e",
  on_duty: "#1d4ed8",
  break: "#ca8a04",
  off_duty: "#64748b",
  sleeper: "#7c3aed"
};

export default function HosTimeline() {
  const navigate = useNavigate();
  const [dayIso, setDayIso] = useState(() => new Date().toISOString().slice(0, 10));
  const dayMs = Date.parse(`${dayIso}T12:00:00`);
  const fromMs = startOfLocalDay(Number.isFinite(dayMs) ? dayMs : Date.now());
  const toMs = endOfLocalDay(fromMs);
  const { snapshot, busy, error, reload } = useHosFleet({ fromMs: fromMs - 2 * 24 * 3600_000, toMs });
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (snapshot?.drivers ?? [])
      .filter((d) => !q || `${d.driverName} ${d.assetLabel}`.toLowerCase().includes(q))
      .map((driver) => ({
        ...driver,
        daySegments: driver.segments.filter((s) => s.endMs >= fromMs && s.startMs <= toMs)
      }));
  }, [snapshot, search, fromMs, toMs]);

  const span = Math.max(1, toMs - fromMs);

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">Timeline</div>
          <div className="hos-path">Track / Hours of service / Timeline</div>
        </div>
        <div className="hos-actions">
          <input
            className="hos-search"
            type="date"
            value={dayIso}
            onChange={(e) => setDayIso(e.target.value)}
          />
          <button type="button" className="hos-btn ghost" onClick={() => navigate("/Track/hos/log-viewer")}>
            Log viewer
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
            <div className="hos-panel-title">Duty timeline</div>
            <div className="hos-panel-sub">Driving, on duty, break, and off-duty blocks for the selected day.</div>
          </div>
          <input
            className="hos-search"
            placeholder="Search drivers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="hos-timeline-legend">
          {(Object.keys(STATUS_COLOR) as DutyStatus[]).map((status) => (
            <span key={status} className="hos-timeline-legend-item">
              <i style={{ background: STATUS_COLOR[status] }} />
              {dutyStatusLabel(status)}
            </span>
          ))}
        </div>

        <div className="hos-timeline">
          {rows.length === 0 ? (
            <div className="hos-empty">{busy ? "Loading timeline…" : "No duty activity for this day."}</div>
          ) : (
            rows.map((row) => (
              <div key={row.driverKey} className="hos-timeline-row">
                <div className="hos-timeline-label">
                  <strong>{row.driverName}</strong>
                  <span>{row.assetLabel}</span>
                </div>
                <div className="hos-timeline-track" aria-label={`${row.driverName} timeline`}>
                  {row.daySegments.map((seg) => {
                    const left = ((Math.max(seg.startMs, fromMs) - fromMs) / span) * 100;
                    const width = ((Math.min(seg.endMs, toMs) - Math.max(seg.startMs, fromMs)) / span) * 100;
                    if (width <= 0) return null;
                    return (
                      <div
                        key={seg.id}
                        className="hos-timeline-block"
                        title={`${dutyStatusLabel(seg.status)} · ${new Date(seg.startMs).toLocaleTimeString()} – ${new Date(seg.endMs).toLocaleTimeString()}`}
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(width, 0.4)}%`,
                          background: STATUS_COLOR[seg.status]
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
