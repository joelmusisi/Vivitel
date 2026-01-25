import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type JourneyLibraryRow = {
  id: string;
  name: string;
  type: string;
  assets: number;
  updated: string;
  status: "active" | "draft";
};

const libraries: JourneyLibraryRow[] = [
  {
    id: "jl-1",
    name: "Regional route presets",
    type: "Routes",
    assets: 84,
    updated: "Today 07:40",
    status: "active"
  },
  {
    id: "jl-2",
    name: "Driver checklist",
    type: "Checklists",
    assets: 52,
    updated: "Jan 15",
    status: "active"
  },
  {
    id: "jl-3",
    name: "Port compliance pack",
    type: "Documents",
    assets: 16,
    updated: "Jan 06",
    status: "draft"
  }
];

export default function JourneyLibraries() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Active", value: libraries.filter((row) => row.status === "active").length },
      { label: "Drafts", value: libraries.filter((row) => row.status === "draft").length },
      { label: "Library items", value: libraries.length },
      { label: "Assets covered", value: libraries.reduce((sum, row) => sum + row.assets, 0) }
    ],
    []
  );

  const filtered = useMemo(() => {
    return libraries.filter((row) => {
      const matchesSearch = row.name.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || row.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [search, typeFilter]);

  return (
    <div className="page journey-libraries-page">
      <div className="journey-topbar">
        <div>
          <div className="journey-title">Libraries</div>
          <div className="journey-path">Monitor / Journey management / Libraries</div>
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
            Upload
          </button>
          <button
            type="button"
            className="journey-btn"
            data-modal="Create library"
            data-modal-sub="Upload routing references."
            data-modal-fields="Library name|Owner|Type"
          >
            Create library
          </button>
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
            <div className="journey-panel-title">Journey libraries</div>
            <div className="journey-panel-sub">Reusable playbooks, docs, and route presets.</div>
          </div>
          <div className="journey-filter-row">
            <input
              className="journey-search"
              placeholder="Search library"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="journey-select"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="all">All types</option>
              <option value="Routes">Routes</option>
              <option value="Checklists">Checklists</option>
              <option value="Documents">Documents</option>
            </select>
          </div>
        </div>
        <div className="journey-table">
          <div className="journey-row journey-row-head">
            <span>Library</span>
            <span>Type</span>
            <span>Assets</span>
            <span>Updated</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="journey-empty">No library entries match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="journey-row">
                <span className="journey-name">{row.name}</span>
                <span>{row.type}</span>
                <span>{row.assets}</span>
                <span>{row.updated}</span>
                <span className={`journey-pill ${row.status}`}>{row.status}</span>
                <span className="journey-actions-col">
                  <button type="button" className="journey-action">Open</button>
                  <button type="button" className="journey-action ghost">Share</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
