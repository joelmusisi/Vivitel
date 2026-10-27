import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
import { useLocation } from "react-router-dom";
import {
  addHierarchyDatabase,
  addHierarchyDealer,
  addHierarchyOrganisation,
  getHierarchy,
  renameHierarchyItem,
  type HierarchyRoot
} from "../../utils/api";
import { loadSharedAdminRows, saveSharedAdminRows, type SharedAdminRow } from "../../utils/sharedRecords";
import "../../index.css";

type AdminRow = { id: string; cells: string[]; status?: string };

type AdminPageConfig = {
  title: string;
  pathLabel: string;
  columns: string[];
  rows: AdminRow[];
  statusOptions?: string[];
  formFields?: { label: string; placeholder?: string; options?: string[] }[];
};

const buildDealerRows = (hierarchy: HierarchyRoot): AdminRow[] =>
  (hierarchy.dealers ?? [])
    .filter((dealer) => String(dealer.name ?? "").trim())
    .map((dealer) => ({
      id: dealer.id,
      cells: [dealer.name, "—", "Active"],
      status: "active"
    }));

const buildDatabaseRows = (hierarchy: HierarchyRoot): AdminRow[] => {
  const rows: AdminRow[] = [];
  for (const dealer of hierarchy.dealers ?? []) {
    for (const org of dealer.organisations ?? []) {
      for (const db of org.databases ?? []) {
        const name = String(db.name ?? "").trim();
        if (!name) continue;
        rows.push({
          id: db.id,
          cells: [name, dealer.name, String(org.name ?? "").trim() || "—", "—", "Active"],
          status: "healthy"
        });
      }
    }
  }
  return rows;
};

const buildOrganisationRows = (hierarchy: HierarchyRoot): AdminRow[] => {
  const rows: AdminRow[] = [];
  for (const dealer of hierarchy.dealers ?? []) {
    for (const org of dealer.organisations ?? []) {
      const name = String(org.name ?? "").trim();
      if (!name) continue;
      const databaseNames = (org.databases ?? [])
        .map((db) => String(db.name ?? "").trim())
        .filter(Boolean);
      rows.push({
        id: org.id,
        cells: [name, databaseNames.join(", ") || "—", "—", "Active"],
        status: "active"
      });
    }
  }
  return rows;
};

const HIERARCHY_OPERATION_PATHS = new Set([
  "/Control/operations/database-administration",
  "/Control/operations/dealer-administration",
  "/Control/operations/organisation-groups"
]);

const pageConfigs: Record<string, AdminPageConfig> = {
  "/Control/operations/database-administration": {
    title: "Database administration",
    pathLabel: "Control / Operations / Database administration",
    columns: ["Database Name", "Dealer", "Organisations", "Owner", "Status", "Actions"],
    rows: [],
    statusOptions: ["healthy", "warning"],
    formFields: [
      { label: "Database Name", placeholder: "Database name" },
      { label: "Dealer" },
      { label: "Organisations", placeholder: "Organisation name" },
      { label: "Owner", placeholder: "Platform" }
    ]
  },
  "/Control/operations/dealer-administration": {
    title: "Dealer Administration",
    pathLabel: "Control / Operations / Dealer Administration",
    columns: ["Dealer", "Region", "Status", "Actions"],
    rows: [],
    statusOptions: ["active", "inactive"],
    formFields: [
      { label: "Dealer name", placeholder: "Dealer name" },
      { label: "Region", placeholder: "Region" },
      { label: "Notes", placeholder: "Coverage details" }
    ]
  },
  "/Control/operations/organisation-settings": {
    title: "Organisation settings",
    pathLabel: "Control / Operations / Organisation settings",
    columns: ["Setting", "Owner", "Updated", "Status", "Actions"],
    rows: [],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Setting name", placeholder: "Setting name" },
      { label: "Owner", placeholder: "Owner" },
      { label: "Notes", placeholder: "Policy summary" }
    ]
  },
  "/Control/operations/data-exclusion": {
    title: "Data exclusion",
    pathLabel: "Control / Operations / Data exclusion",
    columns: ["Rule", "Scope", "Updated", "Status", "Actions"],
    rows: [],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Rule name", placeholder: "Rule name" },
      { label: "Scope", placeholder: "Scope" },
      { label: "Effective dates", placeholder: "Start - End" }
    ]
  },
  "/Control/operations/release-Controlment": {
    title: "Release Controlment",
    pathLabel: "Control / Operations / Release Controlment",
    columns: ["Release", "Window", "Owner", "Status", "Actions"],
    rows: [],
    statusOptions: ["scheduled", "completed"],
    formFields: [
      { label: "Release version", placeholder: "v1.0.0" },
      { label: "Window", placeholder: "Release window" },
      { label: "Owner", placeholder: "Owner" }
    ]
  },
  "/Control/operations/organisation-goals": {
    title: "Organisation goals",
    pathLabel: "Control / Operations / Organisation goals",
    columns: ["Goal", "Progress", "Owner", "Status", "Actions"],
    rows: [],
    statusOptions: ["on-track", "at-risk"],
    formFields: [
      { label: "Goal name", placeholder: "Goal name" },
      { label: "Owner", placeholder: "Owner" },
      { label: "Target", placeholder: "Target" }
    ]
  },
  "/Control/operations/organisation-groups": {
    title: "Organisations",
    pathLabel: "Control / Operations / Organisations",
    columns: ["Organisation", "Database", "Manager", "Status", "Actions"],
    rows: [],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Organisation name", placeholder: "Organisation name" },
      { label: "Database" },
      { label: "Manager", placeholder: "Manager" },
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
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const hierarchyRef = useRef<HierarchyRoot | null>(null);
  const hierarchyLoadToken = useRef(0);
  const [rowsByPath, setRowsByPath] = useState<Record<string, AdminRow[]>>(() =>
    Object.fromEntries(Object.entries(pageConfigs).map(([pathKey, config]) => [pathKey, [...config.rows]]))
  );

  const reloadHierarchyRows = async () => {
    const token = ++hierarchyLoadToken.current;
    try {
      const hierarchy = await getHierarchy();
      if (token !== hierarchyLoadToken.current) return;
      hierarchyRef.current = hierarchy;
      setRowsByPath((current) => ({
        ...current,
        "/Control/operations/dealer-administration": buildDealerRows(hierarchy),
        "/Control/operations/database-administration": buildDatabaseRows(hierarchy),
        "/Control/operations/organisation-groups": buildOrganisationRows(hierarchy)
      }));
    } catch {
      if (token !== hierarchyLoadToken.current) return;
      setRowsByPath((current) => ({
        ...current,
        "/Control/operations/dealer-administration": [],
        "/Control/operations/database-administration": [],
        "/Control/operations/organisation-groups": []
      }));
    }
  };

  useEffect(() => {
    void reloadHierarchyRows();
    const handleOrgChange = () => {
      void reloadHierarchyRows();
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => {
      window.removeEventListener("vivi:orgchange", handleOrgChange);
    };
  }, []);

  useEffect(() => {
    if (!page || HIERARCHY_OPERATION_PATHS.has(location.pathname)) return;
    let cancelled = false;
    const storageBase = `control:operations:${page.title}`;
    const applyRows = (rows: SharedAdminRow[] | null) => {
      if (cancelled || !rows) return;
      setRowsByPath((current) => ({ ...current, [location.pathname]: rows }));
    };
    void loadSharedAdminRows(storageBase).then(applyRows);
    const handleOrgChange = () => {
      void loadSharedAdminRows(storageBase).then(applyRows);
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:orgchange", handleOrgChange);
    };
  }, [location.pathname, page]);

  const databaseNames = useMemo(() => {
    const rows = rowsByPath["/Control/operations/database-administration"] ?? [];
    return rows.map((row) => row.cells[0]).filter(Boolean);
  }, [rowsByPath]);

  const dealerNames = useMemo(() => {
    const rows = rowsByPath["/Control/operations/dealer-administration"] ?? [];
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
      if (col.toLowerCase() === "status") return "Draft";
      return "";
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

  const hasActiveFilters = search.trim().length > 0 || statusFilter !== "all";

  const hierarchyMutationError = (result: { ok?: boolean; error?: string } | null, fallback: string) => {
    if (result && result.ok !== false && !result.error) return "";
    return String(result?.error ?? fallback);
  };

  const resolveParentDealerId = () => {
    const active = String(window.localStorage.getItem("vivi.activeDealerId") ?? "").trim();
    const dealers = hierarchyRef.current?.dealers ?? [];
    if (active && dealers.some((dealer) => dealer.id === active)) return active;
    return String(dealers[0]?.id ?? "").trim();
  };

  const resolveParentOrganisationId = () => {
    const active = String(window.localStorage.getItem("vivi.activeOrgId") ?? "").trim();
    const dealers = hierarchyRef.current?.dealers ?? [];
    if (active && dealers.some((dealer) => (dealer.organisations ?? []).some((org) => org.id === active))) return active;
    const dealerName = String(formDraft["Dealer"] ?? "").trim().toLowerCase();
    const orgName = String(formDraft["Organisations"] ?? "").trim().toLowerCase();
    for (const dealer of dealers) {
      if (dealerName && String(dealer.name ?? "").trim().toLowerCase() !== dealerName) continue;
      for (const org of dealer.organisations ?? []) {
        if (!orgName || String(org.name ?? "").trim().toLowerCase() === orgName) return String(org.id ?? "").trim();
      }
    }
    for (const dealer of dealers) {
      const first = String(dealer.organisations?.[0]?.id ?? "").trim();
      if (first) return first;
    }
    return "";
  };

  const persistHierarchyEdits = async () => {
    if (location.pathname === "/Control/operations/dealer-administration") {
      const name = String(formDraft["Dealer name"] ?? "").trim();
      if (!name) return "Enter a dealer name.";
      const result =
        modalMode === "edit" && editingRowId
          ? await renameHierarchyItem("dealer", editingRowId, name)
          : await addHierarchyDealer(name);
      return hierarchyMutationError(result, "Could not save the dealer.");
    }
    if (location.pathname === "/Control/operations/organisation-groups") {
      const name = String(formDraft["Organisation name"] ?? "").trim();
      if (!name) return "Enter an organisation name.";
      if (modalMode === "edit" && editingRowId) {
        return hierarchyMutationError(
          await renameHierarchyItem("organisation", editingRowId, name),
          "Could not save the organisation."
        );
      }
      const dealerId = resolveParentDealerId();
      if (!dealerId) return "Select a dealer before creating an organisation.";
      return hierarchyMutationError(await addHierarchyOrganisation(dealerId, name), "Could not save the organisation.");
    }
    if (location.pathname === "/Control/operations/database-administration") {
      const name = String(formDraft["Database Name"] ?? "").trim();
      if (!name) return "Enter a database name.";
      if (modalMode === "edit" && editingRowId) {
        return hierarchyMutationError(
          await renameHierarchyItem("database", editingRowId, name),
          "Could not save the database."
        );
      }
      const organisationId = resolveParentOrganisationId();
      if (!organisationId) return "Select an organisation before creating a database.";
      return hierarchyMutationError(await addHierarchyDatabase(organisationId, name), "Could not save the database.");
    }
    return "";
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
              setSaveError("");
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
            {saveError ? <div className="admin-modal-sub">{saveError}</div> : null}
            <div className="admin-modal-actions">
              <button type="button" className="admin-btn ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                {modalMode === "view" ? "Close" : "Cancel"}
              </button>
              <button
                type="button"
                className="admin-btn"
                disabled={saving}
                onClick={() => {
                  if (modalMode === "view") {
                    setModalOpen(false);
                    return;
                  }
                  if (HIERARCHY_OPERATION_PATHS.has(location.pathname)) {
                    setSaving(true);
                    setSaveError("");
                    void persistHierarchyEdits()
                      .then(async (error) => {
                        if (error) {
                          setSaveError(error);
                          return;
                        }
                        await reloadHierarchyRows();
                        window.dispatchEvent(new Event("vivi:orgchange"));
                        setModalOpen(false);
                      })
                      .catch(() => {
                        setSaveError("Could not save. Check the connection and try again.");
                      })
                      .finally(() => setSaving(false));
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
                    void saveSharedAdminRows(`control:operations:${page.title}`, next);
                    return { ...current, [location.pathname]: next };
                  });
                  setModalOpen(false);
                }}
              >
                {modalMode === "view" ? "Close" : saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
