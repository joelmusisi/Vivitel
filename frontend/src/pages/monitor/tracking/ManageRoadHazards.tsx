import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type HazardRow = {
  id: string;
  name: string;
  type: string;
  severity: "low" | "medium" | "high";
  region: string;
  updated: string;
  status: "active" | "inactive";
};

const hazards: HazardRow[] = [
  {
    id: "hz-1",
    name: "Namanve bridge works",
    type: "Roadworks",
    severity: "medium",
    region: "Central",
    updated: "Today 06:50",
    status: "active"
  },
  {
    id: "hz-2",
    name: "Kafu river flooding",
    type: "Flood",
    severity: "high",
    region: "North",
    updated: "Jan 20",
    status: "active"
  },
  {
    id: "hz-3",
    name: "Mukono diversion",
    type: "Diversion",
    severity: "low",
    region: "East",
    updated: "Dec 30",
    status: "inactive"
  }
];

export default function ManageRoadHazards() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Active", value: hazards.filter((row) => row.status === "active").length },
      { label: "Inactive", value: hazards.filter((row) => row.status === "inactive").length },
      { label: "Hazards", value: hazards.length },
      { label: "High severity", value: hazards.filter((row) => row.severity === "high").length }
    ],
    []
  );

  const filtered = useMemo(() => {
    return hazards.filter((row) => {
      const matchesSearch = row.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="page tracking-page">
      <div className="tracking-topbar">
        <div>
          <div className="tracking-title">Manage road hazards</div>
          <div className="tracking-path">Monitor / Tracking / Manage road hazards</div>
        </div>
        <div className="tracking-actions">
          <button
            type="button"
            className="tracking-btn ghost"
            onClick={() => navigate("/measure/insights/reports?category=Risk%20Management%20Reports")}
          >
            View risk reports
          </button>
          <button type="button" className="tracking-btn ghost">Import</button>
          <button
            type="button"
            className="tracking-btn"
            data-modal="Add hazard"
            data-modal-sub="Log a new road hazard."
            data-modal-fields="Hazard type|Location|Severity"
          >
            Add hazard
          </button>
        </div>
      </div>

      <section className="tracking-summary">
        {summary.map((card) => (
          <div key={card.label} className="tracking-summary-card">
            <div className="tracking-summary-label">{card.label}</div>
            <div className="tracking-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="tracking-panel">
        <div className="tracking-panel-header">
          <div>
            <div className="tracking-panel-title">Hazard register</div>
            <div className="tracking-panel-sub">Road hazards flagged for routing alerts.</div>
          </div>
          <div className="tracking-filter-row">
            <input
              className="tracking-search"
              placeholder="Search hazard"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="tracking-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="tracking-table">
          <div className="tracking-row tracking-row-head tracking-row-wide">
            <span>Hazard</span>
            <span>Type</span>
            <span>Severity</span>
            <span>Region</span>
            <span>Updated</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="tracking-empty">No hazards match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="tracking-row tracking-row-wide">
                <span className="tracking-name">{row.name}</span>
                <span>{row.type}</span>
                <span className={`tracking-pill ${row.severity}`}>{row.severity}</span>
                <span>{row.region}</span>
                <span>{row.updated}</span>
                <span className={`tracking-pill ${row.status}`}>{row.status}</span>
                <span className="tracking-actions-col">
                  <button type="button" className="tracking-action">Edit</button>
                  <button type="button" className="tracking-action ghost">Deactivate</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
