import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type ResourceRow = {
  id: string;
  resource: string;
  type: string;
  assigned: string;
  utilization: number;
  region: string;
  status: "available" | "allocated" | "maintenance";
};

const resources: ResourceRow[] = [
  {
    id: "res-1",
    resource: "Escort Team A",
    type: "Personnel",
    assigned: "Northern Fuel Corridor",
    utilization: 72,
    region: "North",
    status: "allocated"
  },
  {
    id: "res-2",
    resource: "Trailer Pool C",
    type: "Asset",
    assigned: "Central Transfer",
    utilization: 54,
    region: "Central",
    status: "available"
  },
  {
    id: "res-3",
    resource: "Port Liaison",
    type: "Personnel",
    assigned: "Border Compliance",
    utilization: 88,
    region: "East",
    status: "maintenance"
  }
];

export default function ResourceAllocation() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Available", value: resources.filter((row) => row.status === "available").length },
      { label: "Allocated", value: resources.filter((row) => row.status === "allocated").length },
      { label: "Maintenance", value: resources.filter((row) => row.status === "maintenance").length },
      { label: "Avg utilization", value: "71%" }
    ],
    []
  );

  const filtered = useMemo(() => {
    return resources.filter((row) => {
      const matchesSearch = row.resource.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="page journey-resources-page">
      <div className="journey-topbar">
        <div>
          <div className="journey-title">Resource allocation</div>
          <div className="journey-path">Monitor / Journey management / Resource allocation</div>
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
          <button type="button" className="journey-btn">Assign resource</button>
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
            <div className="journey-panel-title">Allocation board</div>
            <div className="journey-panel-sub">Tracking people, assets, and escort coverage.</div>
          </div>
          <div className="journey-filter-row">
            <input
              className="journey-search"
              placeholder="Search resource"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="journey-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="available">Available</option>
              <option value="allocated">Allocated</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </div>
        <div className="journey-table">
          <div className="journey-row journey-row-head journey-row-wide">
            <span>Resource</span>
            <span>Type</span>
            <span>Assigned</span>
            <span>Utilization</span>
            <span>Region</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="journey-empty">No resources match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="journey-row journey-row-wide">
                <span className="journey-name">{row.resource}</span>
                <span>{row.type}</span>
                <span>{row.assigned}</span>
                <span>{row.utilization}%</span>
                <span>{row.region}</span>
                <span className={`journey-pill ${row.status}`}>{row.status}</span>
                <span className="journey-actions-col">
                  <button type="button" className="journey-action">Open</button>
                  <button type="button" className="journey-action ghost">Reassign</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
