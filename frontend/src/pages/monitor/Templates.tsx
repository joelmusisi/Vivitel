import { useCallback, useMemo, useState } from "react";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
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

export default function Templates() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const templates: TemplateRow[] = [];

  const filtered = useMemo(() => {
    return templates.filter((row) => {
      const matchesSearch = row.name.toLowerCase().includes(search.toLowerCase());
      const matchesChannel = channelFilter === "all" || row.channel === channelFilter;
      return matchesSearch && matchesChannel;
    });
  }, [templates, search, channelFilter]);

  const hasActiveFilters = search.trim().length > 0 || channelFilter !== "all";

  const getTemplateSortValue = useCallback((row: TemplateRow, key: string) => {
    if (key === "template") return row.name;
    if (key === "category") return row.category;
    if (key === "channel") return row.channel;
    if (key === "owner") return row.owner;
    if (key === "updated") return row.updated;
    if (key === "status") return row.status;
    return "";
  }, []);
  const templateSort = useColumnSort({ rows: filtered, getValue: getTemplateSortValue });

  return (
    <div className="page templates-page">
      <div className="templates-topbar">
        <div>
          <div className="templates-title">Templates</div>
          <div className="templates-path">Track / Task Controlment / Templates</div>
        </div>
        <div className="templates-actions">
          <button
            type="button"
            className="templates-btn ghost"
            onClick={() =>
              navigate(
                "/Analyze/insights/reports?category=List%20Reports&report=Job%20Detail%20Report"
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
            <SortableColumnHeader as="span" label="Template" {...templateSort.getHeaderProps("template")} />
            <SortableColumnHeader as="span" label="Category" {...templateSort.getHeaderProps("category")} />
            <SortableColumnHeader as="span" label="Channel" {...templateSort.getHeaderProps("channel")} />
            <SortableColumnHeader as="span" label="Owner" {...templateSort.getHeaderProps("owner")} />
            <SortableColumnHeader as="span" label="Updated" {...templateSort.getHeaderProps("updated")} />
            <SortableColumnHeader as="span" label="Status" {...templateSort.getHeaderProps("status")} />
            <span>Actions</span>
          </div>
          {templateSort.sortedRows.length === 0 ? (
            <div className="templates-empty">
              {hasActiveFilters ? "No templates match your filters." : "No records yet."}
            </div>
          ) : (
            templateSort.sortedRows.map((row) => (
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
