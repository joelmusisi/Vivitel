import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { manageNav, measureNav, monitorNav } from "../../navData";
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
  "/manage/user-admin/users": {
    title: "Users",
    pathLabel: "Manage / User admin / Users",
    summary: [
      { label: "Active", value: 34 },
      { label: "Inactive", value: 5 },
      { label: "Admins", value: 4 },
      { label: "Invites", value: 2 }
    ],
    columns: ["User", "Role", "Email", "Status", "Actions"],
    rows: [
      { id: "usr-1", cells: ["Grace Nanyonga", "Admin", "grace@vivi.co", "Active"], status: "active" },
      { id: "usr-2", cells: ["Musa Okello", "Dispatcher", "musa@vivi.co", "Active"], status: "active" },
      { id: "usr-3", cells: ["Asha Kibanja", "Viewer", "asha@vivi.co", "Inactive"], status: "inactive" }
    ],
    statusOptions: ["active", "inactive"],
    formFields: [
      { label: "Full name", placeholder: "Grace Nanyonga" },
      { label: "Email", placeholder: "grace@vivi.co" },
      { label: "Role", placeholder: "Dispatcher" }
    ]
  },
  "/manage/user-admin/roles": {
    title: "Roles",
    pathLabel: "Manage / User admin / Roles",
    summary: [
      { label: "Roles", value: 8 },
      { label: "Admins", value: 2 },
      { label: "Dispatch", value: 3 },
      { label: "Custom", value: 1 }
    ],
    columns: ["Role", "Users", "Level", "Status", "Actions"],
    rows: [
      { id: "role-1", cells: ["Administrator", "4", "System", "Active"], status: "active" },
      { id: "role-2", cells: ["Dispatcher", "12", "Operations", "Active"], status: "active" },
      { id: "role-3", cells: ["Viewer", "18", "Read-only", "Active"], status: "active" },
      { id: "role-4", cells: ["Support", "6", "Operations", "Active"], status: "active" }
    ],
    statusOptions: ["active"],
    formFields: [
      { label: "Role name", placeholder: "Dispatcher" },
      { label: "Level", placeholder: "Operations" },
      { label: "Description", placeholder: "Access scope" }
    ]
  },
  "/manage/user-admin/security-groups": {
    title: "Security groups",
    pathLabel: "Manage / User admin / Security groups",
    summary: [
      { label: "Groups", value: 5 },
      { label: "Members", value: 38 },
      { label: "Policies", value: 6 },
      { label: "Last review", value: "Jan 12" }
    ],
    columns: ["Group", "Members", "Owner", "Status", "Actions"],
    rows: [
      { id: "sg-1", cells: ["Ops Admin", "8", "Security", "Active"], status: "active" },
      { id: "sg-2", cells: ["Dispatch Leads", "12", "Operations", "Active"], status: "active" },
      { id: "sg-3", cells: ["Audit", "4", "Compliance", "Draft"], status: "draft" }
    ],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Group name", placeholder: "Dispatch Leads" },
      { label: "Owner", placeholder: "Operations" },
      { label: "Notes", placeholder: "Access scope" }
    ]
  }
};

export default function UserAdmin() {
  const location = useLocation();
  const page = pageConfigs[location.pathname];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<Record<string, string>>({});
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
  const [rowsByPath, setRowsByPath] = useState<Record<string, AdminRow[]>>(() =>
    Object.fromEntries(Object.entries(pageConfigs).map(([pathKey, config]) => [pathKey, [...config.rows]]))
  );

  const permissionGroups = useMemo(
    () => [
      { title: "Monitor", items: monitorNav.flatMap((group) => group.items) },
      { title: "Manage", items: manageNav.flatMap((group) => group.items) },
      { title: "Measure", items: measureNav.flatMap((group) => group.items) }
    ],
    []
  );

  const permissionIds = useMemo(
    () => new Set(permissionGroups.flatMap((group) => group.items.map((item) => item.path))),
    [permissionGroups]
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

  const resetRolePermissions = () => {
    setRolePermissions(new Set());
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
              if (location.pathname === "/manage/user-admin/roles") {
                resetRolePermissions();
              }
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
            <div className="admin-panel-title">Admin list</div>
            <div className="admin-panel-sub">User accounts and access configuration.</div>
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
                            if (location.pathname === "/manage/user-admin/roles") {
                              resetRolePermissions();
                            }
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
                            if (location.pathname === "/manage/user-admin/roles") {
                              resetRolePermissions();
                            }
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
                <div className="admin-modal-sub">Set up access and roles.</div>
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
              {location.pathname === "/manage/user-admin/roles" && (
                <div className="admin-modal-field" style={{ gap: 12 }}>
                  <span>Permissions</span>
                  <div className="admin-permissions">
                    {permissionGroups.map((group) => (
                      <div key={group.title} className="admin-permissions-group">
                        <div className="admin-permissions-title">{group.title}</div>
                        <div className="admin-permissions-list">
                          {group.items.map((item) => (
                            <label key={item.path} className="admin-permission-item">
                              <input
                                type="checkbox"
                                checked={rolePermissions.has(item.path)}
                                onChange={(event) => {
                                  setRolePermissions((current) => {
                                    const next = new Set(current);
                                    if (event.target.checked) {
                                      next.add(item.path);
                                    } else {
                                      next.delete(item.path);
                                    }
                                    return next;
                                  });
                                }}
                                disabled={modalMode === "view"}
                              />
                              <span>{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                  void saveToApi(`manage:user-admin:${page.title}`, {
                    title: page.title,
                    values: formDraft,
                    permissions:
                      location.pathname === "/manage/user-admin/roles"
                        ? Array.from(rolePermissions).filter((path) => permissionIds.has(path))
                        : undefined,
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
