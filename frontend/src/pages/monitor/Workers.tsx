import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../index.css";

type WorkerRow = {
  id: string;
  name: string;
  role: string;
  region: string;
  status: "available" | "busy" | "offline";
  activeTasks: number;
  lastActive: string;
};

const workers: WorkerRow[] = [
  {
    id: "wrk-1",
    name: "Grace Nanyonga",
    role: "Dispatcher",
    region: "Northern",
    status: "busy",
    activeTasks: 4,
    lastActive: "2 min ago"
  },
  {
    id: "wrk-2",
    name: "Amos Kigozi",
    role: "Workshop Lead",
    region: "Central",
    status: "available",
    activeTasks: 1,
    lastActive: "5 min ago"
  },
  {
    id: "wrk-3",
    name: "Vivi Support",
    role: "Support",
    region: "East",
    status: "offline",
    activeTasks: 0,
    lastActive: "1 hr ago"
  }
];

export default function Workers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Available", value: workers.filter((row) => row.status === "available").length },
      { label: "Busy", value: workers.filter((row) => row.status === "busy").length },
      { label: "Offline", value: workers.filter((row) => row.status === "offline").length },
      { label: "Total workers", value: workers.length }
    ],
    []
  );

  const filtered = useMemo(() => {
    return workers.filter((row) => {
      const matchesSearch =
        row.name.toLowerCase().includes(search.toLowerCase()) ||
        row.role.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="page workers-page">
      <div className="workers-topbar">
        <div>
          <div className="workers-title">Workers</div>
          <div className="workers-path">Monitor / Task management / Workers</div>
        </div>
        <div className="workers-actions">
          <button
            type="button"
            className="workers-btn ghost"
            onClick={() =>
              navigate(
                "/measure/insights/reports?category=List%20Reports&report=Driver%20List%20Report"
              )
            }
          >
            View driver reports
          </button>
          <button type="button" className="workers-btn ghost">
            Export roster
          </button>
          <button
            type="button"
            className="workers-btn"
            data-modal="Add worker"
            data-modal-sub="Assign a worker to the roster."
            data-modal-fields="Worker name|Role|Site"
          >
            Add worker
          </button>
        </div>
      </div>

      <section className="workers-summary">
        {summary.map((card) => (
          <div key={card.label} className="workers-summary-card">
            <div className="workers-summary-label">{card.label}</div>
            <div className="workers-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="workers-panel">
        <div className="workers-panel-header">
          <div>
            <div className="workers-panel-title">Worker roster</div>
            <div className="workers-panel-sub">Monitor availability and workload distribution.</div>
          </div>
          <div className="workers-filter-row">
            <input
              className="workers-search"
              placeholder="Search workers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="workers-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>

        <div className="workers-table">
          <div className="workers-row workers-row-head">
            <span>Name</span>
            <span>Role</span>
            <span>Region</span>
            <span>Status</span>
            <span>Active tasks</span>
            <span>Last active</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="workers-empty">No workers match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="workers-row">
                <span className="workers-name">{row.name}</span>
                <span>{row.role}</span>
                <span>{row.region}</span>
                <span className={`workers-pill ${row.status}`}>{row.status}</span>
                <span>{row.activeTasks}</span>
                <span>{row.lastActive}</span>
                <span className="workers-actions-col">
                  <button type="button" className="workers-action">Assign</button>
                  <button type="button" className="workers-action ghost">Profile</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
