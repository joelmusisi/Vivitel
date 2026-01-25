import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type HosNotification = {
  id: string;
  driver: string;
  type: string;
  severity: "low" | "medium" | "high";
  time: string;
  status: "open" | "acknowledged" | "resolved";
};

const notifications: HosNotification[] = [
  {
    id: "hn-1",
    driver: "Asha Kibanja",
    type: "Shift limit exceeded",
    severity: "high",
    time: "10 min ago",
    status: "open"
  },
  {
    id: "hn-2",
    driver: "Grace Nanyonga",
    type: "Break overdue",
    severity: "medium",
    time: "28 min ago",
    status: "acknowledged"
  },
  {
    id: "hn-3",
    driver: "Musa Okello",
    type: "Drive time nearing",
    severity: "low",
    time: "1 hr ago",
    status: "resolved"
  }
];

export default function HosNotifications() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Open", value: notifications.filter((row) => row.status === "open").length },
      { label: "Acknowledged", value: notifications.filter((row) => row.status === "acknowledged").length },
      { label: "Resolved", value: notifications.filter((row) => row.status === "resolved").length },
      { label: "Total alerts", value: notifications.length }
    ],
    []
  );

  const filtered = useMemo(() => {
    return notifications.filter((row) => {
      const matchesSearch = row.driver.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">HOS notifications</div>
          <div className="hos-path">Monitor / Hours of service / Notifications</div>
        </div>
        <div className="hos-actions">
          <button
            type="button"
            className="hos-btn ghost"
            onClick={() => navigate("/measure/insights/reports?category=Hours%20Of%20Service%20Reports")}
          >
            View HOS reports
          </button>
          <button type="button" className="hos-btn ghost">Export</button>
          <button type="button" className="hos-btn">Acknowledge all</button>
        </div>
      </div>

      <section className="hos-summary">
        {summary.map((card) => (
          <div key={card.label} className="hos-summary-card">
            <div className="hos-summary-label">{card.label}</div>
            <div className="hos-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="hos-panel">
        <div className="hos-panel-header">
          <div>
            <div className="hos-panel-title">Alerts</div>
            <div className="hos-panel-sub">Latest violations and warnings.</div>
          </div>
          <div className="hos-filter-row">
            <input
              className="hos-search"
              placeholder="Search driver"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="hos-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>

        <div className="hos-table">
          <div className="hos-row hos-row-head hos-row-wide">
            <span>Driver</span>
            <span>Alert</span>
            <span>Severity</span>
            <span>Time</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="hos-empty">No notifications match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="hos-row hos-row-wide">
                <span className="hos-name">{row.driver}</span>
                <span>{row.type}</span>
                <span className={`hos-pill ${row.severity}`}>{row.severity}</span>
                <span>{row.time}</span>
                <span className={`hos-pill ${row.status}`}>{row.status}</span>
                <span className="hos-actions-col">
                  <button type="button" className="hos-action">Open</button>
                  <button type="button" className="hos-action ghost">Resolve</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
