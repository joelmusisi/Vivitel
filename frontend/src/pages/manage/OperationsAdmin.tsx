import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { saveToApi } from "../../utils/api";
import "../../index.css";

type SummaryCard = { label: string; value: string | number };
type AdminRow = { id: string; cells: string[]; status?: string };

type AdminPageConfig = {
  title: string;
  pathLabel: string;
  summary: SummaryCard[];
  columns: string[];
  rows: AdminRow[];
  statusOptions?: string[];
  formFields?: { label: string; placeholder?: string; options?: string[] }[];
};

const pageConfigs: Record<string, AdminPageConfig> = {
  "/manage/operations/database-administration": {
    title: "Database administration",
    pathLabel: "Manage / Operations / Database administration",
    summary: [
      { label: "Clusters", value: 4 },
      { label: "Storage used", value: "68%" },
      { label: "Backups", value: "12" },
      { label: "Alerts", value: 1 }
    ],
    columns: ["Database Name", "Dealer", "Backup cadence", "Owner", "Status", "Actions"],
    rows: [
      { id: "db-1", cells: ["Primary", "EA-Transfleet Services-Tanzania", "Daily", "Platform", "Healthy"], status: "healthy" },
      { id: "db-2", cells: ["Analytics", "EA-Transfleet Services-Rwanda", "Daily", "Platform", "Healthy"], status: "healthy" },
      { id: "db-3", cells: ["Archive", "EA-Transfleet Services-Uganda", "Weekly", "Platform", "Warning"], status: "warning" }
    ],
    statusOptions: ["healthy", "warning"],
    formFields: [
      { label: "Database Name", placeholder: "Primary" },
      { label: "Dealer" },
      { label: "Backup cadence", placeholder: "Daily" },
      { label: "Owner", placeholder: "Platform" }
    ]
  },
  "/manage/operations/dealer-administration": {
    title: "Dealer Administration",
    pathLabel: "Manage / Operations / Dealer Administration",
    summary: [
      { label: "Dealers", value: 3 },
      { label: "Active", value: 3 },
      { label: "Regions", value: 5 },
      { label: "Last update", value: "Jan 20" }
    ],
    columns: ["Dealer", "Region", "Status", "Actions"],
    rows: [
      { id: "dealer-1", cells: ["EA-Transfleet Services-Tanzania", "EA", "Active"], status: "active" },
      { id: "dealer-2", cells: ["EA-Transfleet Services-Rwanda", "EA", "Active"], status: "active" },
      { id: "dealer-3", cells: ["EA-Transfleet Services-Uganda", "EA", "Active"], status: "active" }
    ],
    statusOptions: ["active", "inactive"],
    formFields: [
      { label: "Dealer name", placeholder: "EA-Transfleet Services-Kenya" },
      { label: "Region", placeholder: "EA" },
      { label: "Notes", placeholder: "Coverage details" }
    ]
  },
  "/manage/operations/organisation-settings": {
    title: "Organisation settings",
    pathLabel: "Manage / Operations / Organisation settings",
    summary: [
      { label: "Active orgs", value: 12 },
      { label: "Regions", value: 5 },
      { label: "Policies", value: 9 },
      { label: "Last update", value: "Jan 20" }
    ],
    columns: ["Setting", "Owner", "Updated", "Status", "Actions"],
    rows: [
      { id: "os-1", cells: ["Data retention", "Compliance", "Jan 20", "Active"], status: "active" },
      { id: "os-2", cells: ["Driver check-in", "Operations", "Jan 11", "Active"], status: "active" },
      { id: "os-3", cells: ["Night shift rules", "HR", "Dec 20", "Draft"], status: "draft" }
    ],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Setting name", placeholder: "Data retention" },
      { label: "Owner", placeholder: "Compliance" },
      { label: "Notes", placeholder: "Policy summary" }
    ]
  },
  "/manage/operations/data-exclusion": {
    title: "Data exclusion",
    pathLabel: "Manage / Operations / Data exclusion",
    summary: [
      { label: "Rules", value: 6 },
      { label: "Assets", value: 18 },
      { label: "Pending", value: 2 },
      { label: "Last sync", value: "Today" }
    ],
    columns: ["Rule", "Scope", "Updated", "Status", "Actions"],
    rows: [
      { id: "de-1", cells: ["Maintenance blackout", "Workshop", "Today 08:10", "Active"], status: "active" },
      { id: "de-2", cells: ["Camera downtime", "Video", "Jan 16", "Active"], status: "active" },
      { id: "de-3", cells: ["Legacy units", "Fleet", "Jan 04", "Draft"], status: "draft" }
    ],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Rule name", placeholder: "Maintenance blackout" },
      { label: "Scope", placeholder: "Workshop" },
      { label: "Effective dates", placeholder: "Jan 22 - Jan 28" }
    ]
  },
  "/manage/operations/release-management": {
    title: "Release management",
    pathLabel: "Manage / Operations / Release management",
    summary: [
      { label: "Upcoming", value: 2 },
      { label: "In progress", value: 1 },
      { label: "Released", value: 8 },
      { label: "Rollback", value: 0 }
    ],
    columns: ["Release", "Window", "Owner", "Status", "Actions"],
    rows: [
      { id: "rm-1", cells: ["v3.4.1", "Jan 24", "Platform", "Scheduled"], status: "scheduled" },
      { id: "rm-2", cells: ["v3.4.0", "Jan 10", "Platform", "Completed"], status: "completed" },
      { id: "rm-3", cells: ["v3.3.9", "Dec 18", "Platform", "Completed"], status: "completed" }
    ],
    statusOptions: ["scheduled", "completed"],
    formFields: [
      { label: "Release version", placeholder: "v3.4.2" },
      { label: "Window", placeholder: "Feb 02" },
      { label: "Owner", placeholder: "Platform" }
    ]
  },
  "/manage/operations/organisation-goals": {
    title: "Organisation goals",
    pathLabel: "Manage / Operations / Organisation goals",
    summary: [
      { label: "Active goals", value: 6 },
      { label: "On track", value: 4 },
      { label: "At risk", value: 2 },
      { label: "Review cycle", value: "Monthly" }
    ],
    columns: ["Goal", "Progress", "Owner", "Status", "Actions"],
    rows: [
      { id: "og-1", cells: ["Reduce idle time", "68%", "Ops", "On track"], status: "on-track" },
      { id: "og-2", cells: ["Improve on-time", "52%", "Dispatch", "At risk"], status: "at-risk" },
      { id: "og-3", cells: ["Lower incidents", "79%", "Safety", "On track"], status: "on-track" }
    ],
    statusOptions: ["on-track", "at-risk"],
    formFields: [
      { label: "Goal name", placeholder: "Reduce idle time" },
      { label: "Owner", placeholder: "Ops" },
      { label: "Target", placeholder: "80%" }
    ]
  },
  "/manage/operations/organisation-groups": {
    title: "Organisations",
    pathLabel: "Manage / Operations / Organisations",
    summary: [
      { label: "Groups", value: 14 },
      { label: "Managers", value: 9 },
      { label: "Assets", value: 224 },
      { label: "Last updated", value: "Jan 21" }
    ],
    columns: ["Organisation", "Database", "Manager", "Status", "Actions"],
    rows: [
      { id: "org-1", cells: ["Northern Ops", "Primary", "M. Apio", "Active"], status: "active" },
      { id: "org-2", cells: ["Port Ops", "Analytics", "S. Kato", "Active"], status: "active" },
      { id: "org-3", cells: ["New region", "Archive", "A. Ken", "Draft"], status: "draft" }
    ],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Organisation name", placeholder: "Northern Ops" },
      { label: "Database" },
      { label: "Manager", placeholder: "M. Apio" },
      { label: "Notes", placeholder: "Coverage details" }
    ]
  }
};

export default function OperationsAdmin() {
  const location = useLocation();
  const page = pageConfigs[location.pathname];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [formDraft, setFormDraft] = useState<Record<string, string>>({});
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowsByPath, setRowsByPath] = useState<Record<string, AdminRow[]>>(() =>
    Object.fromEntries(Object.entries(pageConfigs).map(([pathKey, config]) => [pathKey, [...config.rows]]))
  );

  const databaseNames = useMemo(() => {
    const rows = rowsByPath["/manage/operations/database-administration"] ?? [];
    return rows.map((row) => row.cells[0]).filter(Boolean);
  }, [rowsByPath]);

  const dealerNames = useMemo(() => {
    const rows = rowsByPath["/manage/operations/dealer-administration"] ?? [];
    return rows.map((row) => row.cells[0]).filter(Boolean);
  }, [rowsByPath]);

  const filteredRows = useMemo(() => {
    if (!page) return [];
    const rows = rowsByPath[location.pathname] ?? [];
    return rows.filter((row) => {
      const matchesSearch = row.cells.some((cell) => cell.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [location.pathname, page, rowsByPath, search, statusFilter]);

  if (!page) {
    return <div className="page admin-page">Page not found.</div>;
  }

  const buildRowFromDraft = () => {
    const columns = page.columns.filter((col) => col !== "Actions");
    const fields = page.formFields ?? [];
    const cells = columns.map((col, index) => {
      const field = fields[index];
      if (field) return formDraft[field.label] ?? "";
      if (col.toLowerCase() === "status") return "Draft";
      return "—";
    });
    const statusIndex = columns.findIndex((col) => col.toLowerCase() === "status");
    const statusValue = statusIndex >= 0 ? String(cells[statusIndex] ?? "draft").toLowerCase() : undefined;
    return {
      id: `row-${Date.now()}`,
      cells,
      status: statusValue
    } as AdminRow;
  };

  const buildDraftFromRow = (row: AdminRow) => {
    const fields = page.formFields ?? [];
    return fields.reduce<Record<string, string>>((acc, field, index) => {
      acc[field.label] = row.cells[index] ?? "";
      return acc;
    }, {});
  };

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <div>
          <div className="admin-title">{page.title}</div>
          <div className="admin-path">{page.pathLabel}</div>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-btn ghost">Export</button>
          <button
            type="button"
            className="admin-btn"
            onClick={() => {
              const initial = (page.formFields ?? []).reduce<Record<string, string>>((acc, field) => {
                if (field.label === "Database") {
                  acc[field.label] = databaseNames[0] ?? "";
                  return acc;
                }
                if (field.label === "Dealer") {
                  acc[field.label] = dealerNames[0] ?? "";
                  return acc;
                }
                if (field.options && field.options.length > 0) {
                  acc[field.label] = field.options[0];
                  return acc;
                }
                acc[field.label] = "";
                return acc;
              }, {});
              setFormDraft(initial);
              setModalMode("create");
              setEditingRowId(null);
              setModalOpen(true);
            }}
          >
            Create
          </button>
        </div>
      </div>

      <section className="admin-summary">
        {page.summary.map((card) => (
          <div key={card.label} className="admin-summary-card">
            <div className="admin-summary-label">{card.label}</div>
            <div className="admin-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <div className="admin-panel-title">Operations list</div>
            <div className="admin-panel-sub">Operational controls and governance.</div>
          </div>
          <div className="admin-filter-row">
            <input
              className="admin-search"
              placeholder="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {page.statusOptions && (
              <select
                className="admin-select"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All status</option>
                {page.statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status.replace("-", " ")}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="admin-table" style={{ "--admin-cols": page.columns.length } as React.CSSProperties}>
          <div className="admin-row admin-row-head">
            {page.columns.map((col) => (
              <span key={col}>{col}</span>
            ))}
          </div>
          {filteredRows.length === 0 ? (
            <div className="admin-empty">No rows match your filters.</div>
          ) : (
            filteredRows.map((row) => (
              <div key={row.id} className="admin-row">
                {page.columns.map((col, index) => {
                  if (col === "Actions") {
                    return (
                      <span key={`${row.id}-${col}`} className="admin-actions-col">
                        <button
                          type="button"
                          className="admin-action"
                          onClick={() => {
                            setFormDraft(buildDraftFromRow(row));
                            setEditingRowId(row.id);
                            setModalMode("view");
                            setModalOpen(true);
                          }}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="admin-action ghost"
                          onClick={() => {
                            setFormDraft(buildDraftFromRow(row));
                            setEditingRowId(row.id);
                            setModalMode("edit");
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                      </span>
                    );
                  }
                  const cellValue = row.cells[index] ?? "";
                  if (col === "Status") {
                    const status = row.status ?? cellValue.toLowerCase();
                    return (
                      <span key={`${row.id}-${col}`} className={`admin-pill ${status}`}>
                        {cellValue}
                      </span>
                    );
                  }
                  return <span key={`${row.id}-${col}`}>{cellValue}</span>;
                })}
              </div>
            ))
          )}
        </div>
      </section>

      {modalOpen && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal-card">
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title">
                  {modalMode === "create" ? "Create" : modalMode === "edit" ? "Edit" : "View"}{" "}
                  {page.title === "Dealer Administration" ? "Dealer" : page.title}
                </div>
                <div className="admin-modal-sub">Provide the operational details.</div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {(page.formFields ?? []).map((field) => (
                <label key={field.label} className="admin-modal-field">
                  {field.label}
                  {field.label === "Database" ? (
                    <select
                      value={formDraft[field.label] ?? databaseNames[0] ?? ""}
                      onChange={(event) =>
                        setFormDraft((current) => ({ ...current, [field.label]: event.target.value }))
                      }
                      disabled={modalMode === "view"}
                    >
                      {databaseNames.length === 0 ? (
                        <option value="" disabled>
                          No databases available
                        </option>
                      ) : (
                        databaseNames.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))
                      )}
                    </select>
                  ) : field.label === "Dealer" ? (
                    <select
                      value={formDraft[field.label] ?? dealerNames[0] ?? ""}
                      onChange={(event) =>
                        setFormDraft((current) => ({ ...current, [field.label]: event.target.value }))
                      }
                      disabled={modalMode === "view"}
                    >
                      {dealerNames.length === 0 ? (
                        <option value="" disabled>
                          No dealers available
                        </option>
                      ) : (
                        dealerNames.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))
                      )}
                    </select>
                  ) : field.options ? (
                    <select
                      value={formDraft[field.label] ?? field.options[0] ?? ""}
                      onChange={(event) =>
                        setFormDraft((current) => ({ ...current, [field.label]: event.target.value }))
                      }
                      disabled={modalMode === "view"}
                    >
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder={field.placeholder}
                      value={formDraft[field.label] ?? ""}
                      onChange={(event) =>
                        setFormDraft((current) => ({ ...current, [field.label]: event.target.value }))
                      }
                      disabled={modalMode === "view"}
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="admin-btn ghost" onClick={() => setModalOpen(false)}>
                {modalMode === "view" ? "Close" : "Cancel"}
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  if (modalMode === "view") {
                    setModalOpen(false);
                    return;
                  }
                  void saveToApi(`manage:operations:${page.title}`, {
                    title: page.title,
                    values: formDraft,
                    updatedAt: new Date().toISOString()
                  });
                  const nextRow = buildRowFromDraft();
                  setRowsByPath((current) => {
                    const rows = current[location.pathname] ?? [];
                    if (modalMode === "edit" && editingRowId) {
                      const existing = rows.find((r) => r.id === editingRowId);
                      const updated = rows.map((r) =>
                        r.id === editingRowId ? { ...nextRow, id: editingRowId, status: existing?.status } : r
                      );
                      return { ...current, [location.pathname]: updated };
                    }
                    return { ...current, [location.pathname]: [...rows, nextRow] };
                  });
                  setModalOpen(false);
                }}
              >
                {modalMode === "view" ? "Close" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
