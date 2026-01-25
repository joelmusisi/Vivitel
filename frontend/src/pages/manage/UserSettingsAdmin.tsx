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
  formFields?: { label: string; placeholder: string }[];
};

const pageConfigs: Record<string, AdminPageConfig> = {
  "/manage/user-settings/user-scoring": {
    title: "User scoring",
    pathLabel: "Manage / User settings / User scoring",
    summary: [
      { label: "Profiles", value: 4 },
      { label: "Active", value: 3 },
      { label: "Draft", value: 1 },
      { label: "Last update", value: "Jan 16" }
    ],
    columns: ["Profile", "Weighting", "Updated", "Status", "Actions"],
    rows: [
      { id: "us-1", cells: ["Standard", "Balanced", "Jan 16", "Active"], status: "active" },
      { id: "us-2", cells: ["Safety", "High", "Jan 02", "Active"], status: "active" },
      { id: "us-3", cells: ["Fuel focus", "Medium", "Dec 20", "Draft"], status: "draft" }
    ],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Profile name", placeholder: "Standard" },
      { label: "Weighting", placeholder: "Balanced" },
      { label: "Notes", placeholder: "Optional" }
    ]
  },
  "/manage/user-settings/personal-access-tokens": {
    title: "Personal access tokens",
    pathLabel: "Manage / User settings / Personal access tokens",
    summary: [
      { label: "Active tokens", value: 6 },
      { label: "Revoked", value: 2 },
      { label: "API scopes", value: 5 },
      { label: "Last created", value: "Jan 21" }
    ],
    columns: ["Token", "Scope", "Created", "Status", "Actions"],
    rows: [
      { id: "pat-1", cells: ["Dispatch API", "Read/Write", "Jan 21", "Active"], status: "active" },
      { id: "pat-2", cells: ["Analytics", "Read", "Jan 14", "Active"], status: "active" },
      { id: "pat-3", cells: ["Legacy", "Read", "Dec 10", "Revoked"], status: "revoked" }
    ],
    statusOptions: ["active", "revoked"],
    formFields: [
      { label: "Token label", placeholder: "Dispatch API" },
      { label: "Scope", placeholder: "Read/Write" },
      { label: "Expiry", placeholder: "30 days" }
    ]
  },
  "/manage/user-settings/personal-settings": {
    title: "Personal settings",
    pathLabel: "Manage / User settings / Personal settings",
    summary: [
      { label: "Profiles", value: 3 },
      { label: "Preferences", value: 12 },
      { label: "Notifications", value: 6 },
      { label: "Last update", value: "Jan 19" }
    ],
    columns: ["Setting", "Value", "Updated", "Status", "Actions"],
    rows: [
      { id: "ps-1", cells: ["Timezone", "EAT", "Jan 19", "Active"], status: "active" },
      { id: "ps-2", cells: ["Theme", "Light", "Jan 05", "Active"], status: "active" },
      { id: "ps-3", cells: ["Alerts", "Paused", "Dec 29", "Paused"], status: "paused" }
    ],
    statusOptions: ["active", "paused"],
    formFields: [
      { label: "Setting name", placeholder: "Timezone" },
      { label: "Value", placeholder: "EAT" },
      { label: "Notes", placeholder: "Optional" }
    ]
  }
};

export default function UserSettingsAdmin() {
  const location = useLocation();
  const page = pageConfigs[location.pathname];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<Record<string, string>>({});
  const [rowsByPath, setRowsByPath] = useState<Record<string, AdminRow[]>>(() =>
    Object.fromEntries(Object.entries(pageConfigs).map(([pathKey, config]) => [pathKey, [...config.rows]]))
  );

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
      if (col.toLowerCase() === "status") return "Active";
      return "—";
    });
    const statusIndex = columns.findIndex((col) => col.toLowerCase() === "status");
    const statusValue = statusIndex >= 0 ? String(cells[statusIndex] ?? "active").toLowerCase() : undefined;
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
            <div className="admin-panel-title">Settings list</div>
            <div className="admin-panel-sub">Personal preferences and access controls.</div>
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

        <div className="admin-table">
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
                  {modalMode === "create" ? "Create" : modalMode === "edit" ? "Edit" : "View"} {page.title}
                </div>
                <div className="admin-modal-sub">Adjust user settings and access.</div>
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
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={formDraft[field.label] ?? ""}
                    onChange={(event) =>
                      setFormDraft((current) => ({ ...current, [field.label]: event.target.value }))
                    }
                    disabled={modalMode === "view"}
                  />
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
                  void saveToApi(`manage:user-settings:${page.title}`, {
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
