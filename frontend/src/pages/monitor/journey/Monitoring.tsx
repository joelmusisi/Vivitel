import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type MonitoringRow = {
  id: string;
  route: string;
  activeUnits: number;
  alerts: number;
  lead: string;
  lastSync: string;
  status: "stable" | "warning" | "critical";
};

const monitoringRows: MonitoringRow[] = [
  {
    id: "mon-1",
    route: "Northern Fuel Corridor",
    activeUnits: 12,
    alerts: 2,
    lead: "Dispatch North",
    lastSync: "2 min ago",
    status: "warning"
  },
  {
    id: "mon-2",
    route: "Central Transfer",
    activeUnits: 7,
    alerts: 0,
    lead: "Operations",
    lastSync: "5 min ago",
    status: "stable"
  },
  {
    id: "mon-3",
    route: "Border Compliance",
    activeUnits: 4,
    alerts: 3,
    lead: "Compliance",
    lastSync: "Just now",
    status: "critical"
  }
];

export default function JourneyMonitoring() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Stable routes", value: monitoringRows.filter((row) => row.status === "stable").length },
      { label: "Warnings", value: monitoringRows.filter((row) => row.status === "warning").length },
      { label: "Critical", value: monitoringRows.filter((row) => row.status === "critical").length },
      { label: "Active units", value: monitoringRows.reduce((sum, row) => sum + row.activeUnits, 0) }
    ],
    []
  );

  const filtered = useMemo(() => {
    return monitoringRows.filter((row) => {
      const matchesSearch = row.route.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="page journey-monitoring-page">
      <div className="journey-topbar">
        <div>
          <div className="journey-title">Monitoring</div>
          <div className="journey-path">Monitor / Journey management / Monitoring</div>
        </div>
        <div className="journey-actions">
          <button
            type="button"
            className="journey-btn ghost"
            onClick={() => navigate("/measure/insights/reports?category=Journey%20Management%20Reports")}
          >
            View journey reports
          </button>
          <button type="button" className="journey-btn ghost">
            Export
          </button>
          <button type="button" className="journey-btn">Refresh status</button>
        </div>
      </div>

      <section className="journey-summary">
        {summary.map((card) => (
          <div key={card.label} className="journey-summary-card">
            <div className="journey-summary-label">{card.label}</div>
            <div className="journey-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="journey-panel">
        <div className="journey-panel-header">
          <div>
            <div className="journey-panel-title">Route monitoring</div>
            <div className="journey-panel-sub">Live route oversight and escalations.</div>
          </div>
          <div className="journey-filter-row">
            <input
              className="journey-search"
              placeholder="Search route"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="journey-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="stable">Stable</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div className="journey-table">
          <div className="journey-row journey-row-head journey-row-wide">
            <span>Route</span>
            <span>Active units</span>
            <span>Alerts</span>
            <span>Lead</span>
            <span>Last sync</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="journey-empty">No monitoring entries match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="journey-row journey-row-wide">
                <span className="journey-name">{row.route}</span>
                <span>{row.activeUnits}</span>
                <span>{row.alerts}</span>
                <span>{row.lead}</span>
                <span>{row.lastSync}</span>
                <span className={`journey-pill ${row.status}`}>{row.status}</span>
                <span className="journey-actions-col">
                  <button type="button" className="journey-action">Open</button>
                  <button type="button" className="journey-action ghost">Escalate</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
