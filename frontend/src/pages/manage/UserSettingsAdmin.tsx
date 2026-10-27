import { useCallback, useEffect, useMemo, useState } from "react";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
import { useLocation } from "react-router-dom";
import {
  loadAccountRecords,
  loadSharedAdminRows,
  saveAccountRecords,
  saveSharedAdminRows,
  type SharedAdminRow
} from "../../utils/sharedRecords";
import "../../index.css";

const PERSONAL_SETTINGS_PATHS = new Set([
  "/Control/user-settings/personal-access-tokens",
  "/Control/user-settings/personal-settings"
]);

type AdminRow = { id: string; cells: string[]; status?: string };

type AdminPageConfig = {
  title: string;
  pathLabel: string;
  columns: string[];
  rows: AdminRow[];
  statusOptions?: string[];
  formFields?: { label: string; placeholder: string }[];
};

const pageConfigs: Record<string, AdminPageConfig> = {
  "/Control/user-settings/user-scoring": {
    title: "User scoring",
    pathLabel: "Control / User settings / User scoring",
    columns: ["Profile", "Weighting", "Updated", "Status", "Actions"],
    rows: [],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Profile name", placeholder: "Profile name" },
      { label: "Weighting", placeholder: "Balanced" },
      { label: "Notes", placeholder: "Optional" }
    ]
  },
  "/Control/user-settings/personal-access-tokens": {
    title: "Personal access tokens",
    pathLabel: "Control / User settings / Personal access tokens",
    columns: ["Token", "Scope", "Created", "Status", "Actions"],
    rows: [],
    statusOptions: ["active", "revoked"],
    formFields: [
      { label: "Token label", placeholder: "Token label" },
      { label: "Scope", placeholder: "Read/Write" },
      { label: "Expiry", placeholder: "30 days" }
    ]
  },
  "/Control/user-settings/personal-settings": {
    title: "Personal settings",
    pathLabel: "Control / User settings / Personal settings",
    columns: ["Setting", "Value", "Updated", "Status", "Actions"],
    rows: [],
    statusOptions: ["active", "paused"],
    formFields: [
      { label: "Setting name", placeholder: "Setting name" },
      { label: "Value", placeholder: "Value" },
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

  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    const apply = (rows: SharedAdminRow[] | null) => {
      if (cancelled || !rows) return;
      setRowsByPath((current) => ({ ...current, [location.pathname]: rows }));
    };
    if (PERSONAL_SETTINGS_PATHS.has(location.pathname)) {
      apply(loadAccountRecords<SharedAdminRow>(`control:user-settings:${page.title}`));
      return () => {
        cancelled = true;
      };
    }
    void loadSharedAdminRows("control:user-scoring").then(apply);
    const handleOrgChange = () => {
      void loadSharedAdminRows("control:user-scoring").then(apply);
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:orgchange", handleOrgChange);
    };
  }, [location.pathname, page]);

  const filteredRows = useMemo(() => {
    if (!page) return [];
    const rows = rowsByPath[location.pathname] ?? [];
    return rows.filter((row) => {
      const matchesSearch = row.cells.some((cell) => cell.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [location.pathname, page, rowsByPath, search, statusFilter]);

  const getAdminRowSortValue = useCallback(
    (row: AdminRow, key: string) => {
      const columns = page?.columns ?? [];
      const index = columns.indexOf(key);
      if (index < 0) return "";
      return row.cells[index] ?? "";
    },
    [page]
  );
  const adminRowSort = useColumnSort({ rows: filteredRows, getValue: getAdminRowSortValue });

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
      return "";
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

  const hasActiveFilters = search.trim().length > 0 || statusFilter !== "all";

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

        <div className="admin-table" style={{ "--admin-cols": page.columns.length } as React.CSSProperties}>
          <div className="admin-row admin-row-head">
            {page.columns.map((col) =>
              col === "Actions" ? (
                <span key={col}>{col}</span>
              ) : (
                <SortableColumnHeader key={col} as="span" label={col} {...adminRowSort.getHeaderProps(col)} />
              )
            )}
          </div>
          {adminRowSort.sortedRows.length === 0 ? (
            <div className="admin-empty">
              {hasActiveFilters ? "No rows match your filters." : "No records yet."}
            </div>
          ) : (
            adminRowSort.sortedRows.map((row) => (
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
                <div className="admin-modal-sub">Provide the settings details.</div>
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
                  const nextRow = buildRowFromDraft();
                  setRowsByPath((current) => {
                    const rows = current[location.pathname] ?? [];
                    const next =
                      modalMode === "edit" && editingRowId
                        ? rows.map((row) => {
                            if (row.id !== editingRowId) return row;
                            const existing = rows.find((item) => item.id === editingRowId);
                            return { ...nextRow, id: editingRowId, status: existing?.status };
                          })
                        : [...rows, nextRow];
                    if (PERSONAL_SETTINGS_PATHS.has(location.pathname)) {
                      saveAccountRecords(`control:user-settings:${page.title}`, next);
                    } else {
                      void saveSharedAdminRows("control:user-scoring", next);
                    }
                    return { ...current, [location.pathname]: next };
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
