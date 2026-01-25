import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type StreamRow = {
  id: string;
  name: string;
  source: string;
  status: "live" | "paused" | "offline";
  lastEvent: string;
  alerts: number;
};

const streams: StreamRow[] = [
  {
    id: "st-1",
    name: "Realtime alerts",
    source: "Events bus",
    status: "live",
    lastEvent: "2 sec ago",
    alerts: 12
  },
  {
    id: "st-2",
    name: "Driver check-ins",
    source: "Mobile app",
    status: "paused",
    lastEvent: "5 min ago",
    alerts: 3
  },
  {
    id: "st-3",
    name: "Camera analytics",
    source: "Video service",
    status: "offline",
    lastEvent: "48 min ago",
    alerts: 0
  }
];

export default function Streams() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Live", value: streams.filter((row) => row.status === "live").length },
      { label: "Paused", value: streams.filter((row) => row.status === "paused").length },
      { label: "Offline", value: streams.filter((row) => row.status === "offline").length },
      { label: "Total alerts", value: streams.reduce((sum, row) => sum + row.alerts, 0) }
    ],
    []
  );

  const filtered = useMemo(() => {
    return streams.filter((row) => {
      const matchesSearch = row.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="page streams-page">
      <div className="streams-topbar">
        <div>
          <div className="streams-title">Streams</div>
          <div className="streams-path">Monitor / Info hub / Streams</div>
        </div>
        <div className="streams-actions">
          <button
            type="button"
            className="streams-btn ghost"
            onClick={() =>
              navigate(
                "/measure/insights/reports?category=List%20Reports&report=Info%20Hub%20Notification%20Report"
              )
            }
          >
            View info hub reports
          </button>
          <button type="button" className="streams-btn ghost">Export</button>
          <button
            type="button"
            className="streams-btn"
            data-modal="Create stream"
            data-modal-sub="Define the stream source and filters."
            data-modal-fields="Stream name|Source|Priority"
          >
            Create stream
          </button>
        </div>
      </div>

      <section className="streams-summary">
        {summary.map((card) => (
          <div key={card.label} className="streams-summary-card">
            <div className="streams-summary-label">{card.label}</div>
            <div className="streams-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="streams-panel">
        <div className="streams-panel-header">
          <div>
            <div className="streams-panel-title">Stream status</div>
            <div className="streams-panel-sub">Live ingestion pipelines and event feeds.</div>
          </div>
          <div className="streams-filter-row">
            <input
              className="streams-search"
              placeholder="Search stream"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="streams-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="live">Live</option>
              <option value="paused">Paused</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>

        <div className="streams-table">
          <div className="streams-row streams-row-head">
            <span>Stream</span>
            <span>Source</span>
            <span>Status</span>
            <span>Last event</span>
            <span>Alerts</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="streams-empty">No streams match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="streams-row">
                <span className="streams-name">{row.name}</span>
                <span>{row.source}</span>
                <span className={`streams-pill ${row.status}`}>{row.status}</span>
                <span>{row.lastEvent}</span>
                <span>{row.alerts}</span>
                <span className="streams-actions-col">
                  <button type="button" className="streams-action">Open</button>
                  <button type="button" className="streams-action ghost">Pause</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
