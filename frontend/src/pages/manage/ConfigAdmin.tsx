import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { deleteConfigurationGroup, getBindings, getConfigurationGroups, getTenantId, saveConfigurationGroup, saveToApi } from "../../utils/api";
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

type ConfigGroupRecord = {
  id: string;
  name: string;
  notificationBinding: string;
  locationBinding: string;
  deviceBinding: string;
  status?: string;
  updatedAt?: string;
};

const configGroupPath = "/manage/config/configuration-groups";

const notificationBindingOptions: string[] = [];
const locationBindingOptions: string[] = [];
const deviceBindingOptions: string[] = [];

const pageConfigs: Record<string, AdminPageConfig> = {
  [configGroupPath]: {
    title: "Configuration groups",
    pathLabel: "Manage / Config admin / Configuration groups",
    summary: [
      { label: "Active groups", value: 8 },
      { label: "Assets covered", value: 240 },
      { label: "Pending reviews", value: 3 },
      { label: "Last audit", value: "Jan 18" }
    ],
    columns: ["Group", "Assets", "Updated", "Status", "Actions"],
    rows: [
      { id: "cfg-1", cells: ["Fuel haulers", "96", "Today 09:20", "Active"], status: "active" },
      { id: "cfg-2", cells: ["Line haul", "68", "Yesterday", "Active"], status: "active" },
      { id: "cfg-3", cells: ["New onboarding", "12", "Jan 12", "Draft"], status: "draft" }
    ],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Group name", placeholder: "e.g. Fuel haulers" },
      { label: "Notifications binding", placeholder: "Select notifications binding" },
      { label: "Location binding", placeholder: "Select location binding" },
      { label: "Devices binding", placeholder: "Select device binding" }
    ]
  },
  "/manage/config/Vivi-d-monitor-configuration": {
    title: "Vivi D-Monitor configuration",
    pathLabel: "Manage / Config admin / Vivi D-Monitor configuration",
    summary: [
      { label: "Profiles", value: 5 },
      { label: "Vehicles", value: 132 },
      { label: "Firmware", value: "v3.2" },
      { label: "Alerts", value: 4 }
    ],
    columns: ["Profile", "Vehicles", "Firmware", "Status", "Actions"],
    rows: [
      { id: "dm-1", cells: ["Standard tracking", "78", "v3.2.1", "Active"], status: "active" },
      { id: "dm-2", cells: ["High risk", "24", "v3.1.9", "Active"], status: "active" },
      { id: "dm-3", cells: ["Pilot", "12", "v3.3.0", "Draft"], status: "draft" }
    ],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Profile name", placeholder: "Standard tracking" },
      { label: "Firmware version", placeholder: "v3.2.1" },
      { label: "Target vehicles", placeholder: "78" }
    ]
  },
  "/manage/config/task-management-configuration": {
    title: "Task Management configuration",
    pathLabel: "Manage / Config admin / Task Management configuration",
    summary: [
      { label: "Active templates", value: 12 },
      { label: "Queues", value: 6 },
      { label: "SLA policies", value: 4 },
      { label: "Escalations", value: 2 }
    ],
    columns: ["Template", "Active tasks", "SLA", "Status", "Actions"],
    rows: [
      { id: "tm-1", cells: ["Breakdown workflow", "14", "2h", "Active"], status: "active" },
      { id: "tm-2", cells: ["Driver support", "6", "4h", "Active"], status: "active" },
      { id: "tm-3", cells: ["Workshop intake", "3", "8h", "Draft"], status: "draft" }
    ],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Template name", placeholder: "Breakdown workflow" },
      { label: "Default SLA", placeholder: "2h" },
      { label: "Owner", placeholder: "Dispatch" }
    ]
  },
  "/manage/config/asset-commissioning": {
    title: "Asset commissioning",
    pathLabel: "Manage / Config admin / Asset commissioning",
    summary: [
      { label: "Pending", value: 9 },
      { label: "Commissioned", value: 148 },
      { label: "Rejected", value: 2 },
      { label: "Avg time", value: "1.2d" }
    ],
    columns: ["Queue", "Pending", "Updated", "Status", "Actions"],
    rows: [
      { id: "ac-1", cells: ["Hardware install", "4", "Today 08:40", "Active"], status: "active" },
      { id: "ac-2", cells: ["QA checks", "3", "Yesterday", "Active"], status: "active" },
      { id: "ac-3", cells: ["SIM provisioning", "2", "Jan 14", "Paused"], status: "paused" }
    ],
    statusOptions: ["active", "paused"],
    formFields: [
      { label: "Queue name", placeholder: "Hardware install" },
      { label: "Default assignee", placeholder: "Workshop" },
      { label: "SLA", placeholder: "24h" }
    ]
  }
};

export default function ConfigAdmin() {
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
  const [configGroups, setConfigGroups] = useState<Record<string, ConfigGroupRecord>>({});
  const [notificationOptions, setNotificationOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<string[]>([]);

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    let mounted = true;
    const loadGroups = async () => {
      const groups = await getConfigurationGroups<ConfigGroupRecord>();
      if (!mounted) return;
      const tenantKey = `vivi.configGroups:${getTenantId()}`;
      const storedGroups: ConfigGroupRecord[] = (() => {
        const raw = window.localStorage.getItem(tenantKey);
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();

      const source = groups.length ? groups : storedGroups;
      if (!source.length) return;

      const byId: Record<string, ConfigGroupRecord> = {};
      const rows: AdminRow[] = source.map((group) => {
        byId[group.id] = group;
        return {
          id: group.id,
          cells: [
            group.name,
            "0",
            group.updatedAt ? new Date(group.updatedAt).toLocaleString() : "—",
            group.status ?? "Active"
          ],
          status: (group.status ?? "active").toLowerCase()
        };
      });
      setConfigGroups(byId);
      setRowsByPath((current) => ({ ...current, [configGroupPath]: rows }));
    };
    void loadGroups();
    return () => {
      mounted = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    const handleOrgChange = () => {
      void (async () => {
        const groups = await getConfigurationGroups<ConfigGroupRecord>();
        const tenantKey = `vivi.configGroups:${getTenantId()}`;
        const storedGroups: ConfigGroupRecord[] = (() => {
          const raw = window.localStorage.getItem(tenantKey);
          if (!raw) return [];
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })();
        const source = groups.length ? groups : storedGroups;
        if (!source.length) {
          setConfigGroups({});
          setRowsByPath((current) => ({ ...current, [configGroupPath]: [] }));
          return;
        }
        const byId: Record<string, ConfigGroupRecord> = {};
        const rows: AdminRow[] = source.map((group) => {
          byId[group.id] = group;
          return {
            id: group.id,
            cells: [
              group.name,
              "0",
              group.updatedAt ? new Date(group.updatedAt).toLocaleString() : "—",
              group.status ?? "Active"
            ],
            status: (group.status ?? "active").toLowerCase()
          };
        });
        setConfigGroups(byId);
        setRowsByPath((current) => ({ ...current, [configGroupPath]: rows }));
      })();
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => {
      window.removeEventListener("vivi:orgchange", handleOrgChange);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    let mounted = true;
    const loadOptions = async () => {
      const [notifications, locations, devices] = await Promise.all([
        getBindings<{ name?: string }>("notifications"),
        getBindings<{ name?: string }>("locations"),
        getBindings<{ name?: string }>("devices")
      ]);
      if (!mounted) return;
      setNotificationOptions(
        notifications.map((item) => String(item.name ?? "").trim()).filter(Boolean)
      );
      setLocationOptions(
        locations.map((item) => String(item.name ?? "").trim()).filter(Boolean)
      );
      setDeviceOptions(
        devices.map((item) => String(item.name ?? "").trim()).filter(Boolean)
      );
    };
    void loadOptions();
    return () => {
      mounted = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname !== configGroupPath) return;
    const handleOrgChange = () => {
      void (async () => {
        const [notifications, locations, devices] = await Promise.all([
          getBindings<{ name?: string }>("notifications"),
          getBindings<{ name?: string }>("locations"),
          getBindings<{ name?: string }>("devices")
        ]);
        setNotificationOptions(
          notifications.map((item) => String(item.name ?? "").trim()).filter(Boolean)
        );
        setLocationOptions(
          locations.map((item) => String(item.name ?? "").trim()).filter(Boolean)
        );
        setDeviceOptions(
          devices.map((item) => String(item.name ?? "").trim()).filter(Boolean)
        );
      })();
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => {
      window.removeEventListener("vivi:orgchange", handleOrgChange);
    };
  }, [location.pathname]);

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
    if (location.pathname === configGroupPath) {
      const name = formDraft["Group name"] ?? "—";
      const statusValue = "Active";
      return {
        id: `cfg-${Date.now()}`,
        cells: [name, "0", "Just now", statusValue],
        status: statusValue.toLowerCase()
      } as AdminRow;
    }
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
    if (location.pathname === configGroupPath) {
      const group = configGroups[row.id];
      return {
        "Group name": group?.name ?? row.cells[0] ?? "",
        "Notifications binding": group?.notificationBinding ?? "",
        "Location binding": group?.locationBinding ?? "",
        "Devices binding": group?.deviceBinding ?? ""
      };
    }
    return fields.reduce<Record<string, string>>((acc, field, index) => {
      acc[field.label] = row.cells[index] ?? "";
      return acc;
    }, {});
  };

  const handleDeleteConfigGroup = async (rowId: string) => {
    const confirmDelete = window.confirm("Delete this configuration group?");
    if (!confirmDelete) return;
    const deleted = await deleteConfigurationGroup(rowId);
    if (!deleted) return;
    setRowsByPath((current) => {
      const rows = current[configGroupPath] ?? [];
      return { ...current, [configGroupPath]: rows.filter((row) => row.id !== rowId) };
    });
    setConfigGroups((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    const tenantKey = `vivi.configGroups:${getTenantId()}`;
    const stored = window.localStorage.getItem(tenantKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const next = parsed.filter((group) => group?.id !== rowId);
          window.localStorage.setItem(tenantKey, JSON.stringify(next));
        }
      } catch {
        // ignore
      }
    }
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
            <div className="admin-panel-title">Configuration list</div>
            <div className="admin-panel-sub">Manage configuration sets and templates.</div>
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
                    {status}
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
                        {location.pathname === configGroupPath && (
                          <button
                            type="button"
                            className="admin-action ghost danger"
                            onClick={() => handleDeleteConfigGroup(row.id)}
                          >
                            Delete
                          </button>
                        )}
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
                <div className="admin-modal-sub">Provide the core configuration details.</div>
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
              {(page.formFields ?? []).map((field) => {
                if (location.pathname === configGroupPath && field.label !== "Group name") {
                  const options =
                    field.label === "Notifications binding"
                      ? notificationOptions
                      : field.label === "Location binding"
                        ? locationOptions
                        : deviceOptions;
                  return (
                    <label key={field.label} className="admin-modal-field">
                      {field.label}
                      <select
                        value={formDraft[field.label] ?? ""}
                        onChange={(event) =>
                          setFormDraft((current) => ({ ...current, [field.label]: event.target.value }))
                        }
                        disabled={modalMode === "view"}
                      >
                        <option value="">Select {field.label.toLowerCase()}</option>
                        {options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }

                return (
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
                );
              })}
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
                  if (location.pathname === configGroupPath) {
                    const name = (formDraft["Group name"] ?? "").trim();
                    const notificationBinding = (formDraft["Notifications binding"] ?? "").trim();
                    const locationBinding = (formDraft["Location binding"] ?? "").trim();
                    const deviceBinding = (formDraft["Devices binding"] ?? "").trim();
                    if (!name || !notificationBinding || !locationBinding || !deviceBinding) {
                      alert("Select all three bindings before saving.");
                      return;
                    }
                    const id = editingRowId ?? `cfg-${Date.now()}`;
                    const payload: ConfigGroupRecord = {
                      id,
                      name,
                      notificationBinding,
                      locationBinding,
                      deviceBinding,
                      status: "Active",
                      updatedAt: new Date().toISOString()
                    };
                    void saveConfigurationGroup(payload);
                    setConfigGroups((current) => ({ ...current, [id]: payload }));
                    const tenantKey = `vivi.configGroups:${getTenantId()}`;
                    const stored = window.localStorage.getItem(tenantKey);
                    try {
                      const parsed = stored ? JSON.parse(stored) : [];
                      const list = Array.isArray(parsed) ? parsed : [];
                      const filtered = list.filter((group) => group?.id !== id);
                      window.localStorage.setItem(
                        tenantKey,
                        JSON.stringify([payload, ...filtered])
                      );
                    } catch {
                      window.localStorage.setItem(tenantKey, JSON.stringify([payload]));
                    }
                  } else {
                    void saveToApi(`manage:config:${page.title}`, {
                      title: page.title,
                      values: formDraft,
                      updatedAt: new Date().toISOString()
                    });
                  }

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
