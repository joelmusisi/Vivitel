import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../index.css";

type TemplateRow = {
  id: string;
  name: string;
  category: string;
  channel: "Email" | "SMS" | "In-app";
  updated: string;
  owner: string;
  status: "active" | "draft" | "archived";
};

const templates: TemplateRow[] = [
  {
    id: "tpl-1",
    name: "Incident acknowledgement",
    category: "Safety",
    channel: "SMS",
    updated: "08 Jan 2026",
    owner: "Ops Comms",
    status: "active"
  },
  {
    id: "tpl-2",
    name: "Shift handover summary",
    category: "Operations",
    channel: "Email",
    updated: "18 Dec 2025",
    owner: "Dispatch",
    status: "draft"
  },
  {
    id: "tpl-3",
    name: "Route delay update",
    category: "Logistics",
    channel: "In-app",
    updated: "12 Jan 2026",
    owner: "Control",
    status: "active"
  },
  {
    id: "tpl-4",
    name: "Maintenance completion",
    category: "Workshop",
    channel: "Email",
    updated: "05 Jan 2026",
    owner: "Workshop",
    status: "archived"
  }
];

export default function Templates() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Active", value: templates.filter((row) => row.status === "active").length },
      { label: "Drafts", value: templates.filter((row) => row.status === "draft").length },
      { label: "Archived", value: templates.filter((row) => row.status === "archived").length },
      { label: "Total templates", value: templates.length }
    ],
    []
  );

  const filtered = useMemo(() => {
    return templates.filter((row) => {
      const matchesSearch = row.name.toLowerCase().includes(search.toLowerCase());
      const matchesChannel = channelFilter === "all" || row.channel === channelFilter;
      return matchesSearch && matchesChannel;
    });
  }, [search, channelFilter]);

  return (
    <div className="page templates-page">
      <div className="templates-topbar">
        <div>
          <div className="templates-title">Templates</div>
          <div className="templates-path">Monitor / Task management / Templates</div>
        </div>
        <div className="templates-actions">
          <button
            type="button"
            className="templates-btn ghost"
            onClick={() =>
              navigate(
                "/measure/insights/reports?category=List%20Reports&report=Job%20Detail%20Report"
              )
            }
          >
            View job reports
          </button>
          <button type="button" className="templates-btn ghost">
            Import
          </button>
          <button
            type="button"
            className="templates-btn"
            data-modal="Create template"
            data-modal-sub="Define a reusable task workflow."
            data-modal-fields="Template name|Owner|Default priority"
          >
            Create template
          </button>
        </div>
      </div>

      <section className="templates-summary">
        {summary.map((card) => (
          <div key={card.label} className="templates-summary-card">
            <div className="templates-summary-label">{card.label}</div>
            <div className="templates-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="templates-panel">
        <div className="templates-panel-header">
          <div>
            <div className="templates-panel-title">Message templates</div>
            <div className="templates-panel-sub">Reusable copy for task and incident workflows.</div>
          </div>
          <div className="templates-filter-row">
            <input
              className="templates-search"
              placeholder="Search templates"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="templates-select"
              value={channelFilter}
              onChange={(event) => setChannelFilter(event.target.value)}
            >
              <option value="all">All channels</option>
              <option value="Email">Email</option>
              <option value="SMS">SMS</option>
              <option value="In-app">In-app</option>
            </select>
          </div>
        </div>
        <div className="templates-table">
          <div className="templates-row templates-row-head">
            <span>Template</span>
            <span>Category</span>
            <span>Channel</span>
            <span>Owner</span>
            <span>Updated</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="templates-empty">No templates match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="templates-row">
                <span className="templates-title-cell">{row.name}</span>
                <span>{row.category}</span>
                <span>{row.channel}</span>
                <span>{row.owner}</span>
                <span>{row.updated}</span>
                <span className={`templates-pill ${row.status}`}>{row.status}</span>
                <span className="templates-actions-col">
                  <button type="button" className="templates-action">Open</button>
                  <button type="button" className="templates-action ghost">Duplicate</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
