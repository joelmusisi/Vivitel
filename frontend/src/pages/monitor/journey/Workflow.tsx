import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type WorkflowRow = {
  id: string;
  name: string;
  owner: string;
  stageCount: number;
  lastUpdated: string;
  status: "active" | "draft" | "paused";
};

const workflows: WorkflowRow[] = [
  {
    id: "wf-1",
    name: "Fuel delivery run",
    owner: "Dispatch",
    stageCount: 6,
    lastUpdated: "Today 08:20",
    status: "active"
  },
  {
    id: "wf-2",
    name: "Cross-dock transfer",
    owner: "Logistics",
    stageCount: 4,
    lastUpdated: "Yesterday",
    status: "paused"
  },
  {
    id: "wf-3",
    name: "Port clearance",
    owner: "Compliance",
    stageCount: 7,
    lastUpdated: "Jan 10",
    status: "draft"
  }
];

export default function Workflow() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Active", value: workflows.filter((row) => row.status === "active").length },
      { label: "Drafts", value: workflows.filter((row) => row.status === "draft").length },
      { label: "Paused", value: workflows.filter((row) => row.status === "paused").length },
      { label: "Total workflows", value: workflows.length }
    ],
    []
  );

  const filtered = useMemo(() => {
    return workflows.filter((row) => {
      const matchesSearch = row.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="page journey-workflow-page">
      <div className="journey-topbar">
        <div>
          <div className="journey-title">Workflow</div>
          <div className="journey-path">Monitor / Journey management / Workflow</div>
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
            Import
          </button>
          <button
            type="button"
            className="journey-btn"
            data-modal="Create workflow"
            data-modal-sub="Define steps and routing logic."
            data-modal-fields="Workflow name|Owner|Template"
          >
            Create workflow
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
            <div className="journey-panel-title">Workflow library</div>
            <div className="journey-panel-sub">Operational playbooks used by live monitoring.</div>
          </div>
          <div className="journey-filter-row">
            <input
              className="journey-search"
              placeholder="Search workflow"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="journey-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="paused">Paused</option>
            </select>
          </div>
        </div>
        <div className="journey-table">
          <div className="journey-row journey-row-head">
            <span>Workflow</span>
            <span>Owner</span>
            <span>Stages</span>
            <span>Last updated</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="journey-empty">No workflows match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="journey-row">
                <span className="journey-name">{row.name}</span>
                <span>{row.owner}</span>
                <span>{row.stageCount}</span>
                <span>{row.lastUpdated}</span>
                <span className={`journey-pill ${row.status}`}>{row.status}</span>
                <span className="journey-actions-col">
                  <button type="button" className="journey-action">Open</button>
                  <button type="button" className="journey-action ghost">Duplicate</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
