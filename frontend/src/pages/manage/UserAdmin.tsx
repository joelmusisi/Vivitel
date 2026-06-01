import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { manageNav, measureNav, monitorNav } from "../../navData";
import {
  createRbacUser,
  getRbacRoles,
  getRbacSecurityGroups,
  getRbacUsers,
  getTenantId,
  saveRbacRole,
  saveRbacSecurityGroup,
  updateRbacUser,
  getUserScopesApi,
  saveUserScopesApi,
  deleteRbacUser,
  getRbacSecurityGroupsFull,
  type RbacRole,
  type RbacRolePermission,
  type RbacSecurityGroup,
  type RbacUser
} from "../../utils/api";
import { SecurityGroupMembers } from "../../components/SecurityGroupMembers";
import { ScopeTreePicker } from "../../components/ScopeTreePicker";
import { seedOrgDealers } from "../../data/orgSeed";
import { loadOrgDealers } from "../../types/org";
import type { UserScopes } from "../../utils/accessControl";
import "../../index.css";

type SummaryCard = { label: string; value: string | number };
type AdminRow = { id: string; cells: string[]; status?: string };

type AdminPageConfig = {
  title: string;
  pathLabel: string;
  summary: SummaryCard[];
  columns: string[];
  statusOptions?: string[];
  formFields?: { label: string; placeholder: string }[];
};

const USERS_PATH = "/manage/user-admin/users";
const ROLES_PATH = "/manage/user-admin/roles";
const GROUPS_PATH = "/manage/user-admin/security-groups";

const pageConfigs: Record<string, AdminPageConfig> = {
  [USERS_PATH]: {
    title: "Users",
    pathLabel: "Manage / User admin / Users",
    summary: [],
    columns: ["User", "Role", "Email", "Status", "Actions"],
    statusOptions: ["active", "inactive"],
    formFields: [
      { label: "Full name", placeholder: "Grace Nanyonga" },
      { label: "Email", placeholder: "grace@vivi.co" },
      { label: "Role", placeholder: "Select role" }
    ]
  },
  [ROLES_PATH]: {
    title: "Roles",
    pathLabel: "Manage / User admin / Roles",
    summary: [],
    columns: ["Role", "Users", "Level", "Status", "Actions"],
    statusOptions: ["active"],
    formFields: [
      { label: "Role name", placeholder: "Dispatcher" },
      { label: "Level", placeholder: "Operations" },
      { label: "Description", placeholder: "Access scope" }
    ]
  },
  [GROUPS_PATH]: {
    title: "Security groups",
    pathLabel: "Manage / User admin / Security groups",
    summary: [],
    columns: ["Group", "Members", "Owner", "Status", "Actions"],
    statusOptions: ["active", "draft"],
    formFields: [
      { label: "Group name", placeholder: "Dispatch Leads" },
      { label: "Owner", placeholder: "Operations" },
      { label: "Notes", placeholder: "Access scope" }
    ]
  }
};

const capitalize = (value: string) => {
  const v = value.trim();
  if (!v) return "—";
  return v.charAt(0).toUpperCase() + v.slice(1);
};

const usersToRows = (users: RbacUser[]): AdminRow[] =>
  users.map((user) => ({
    id: user.id,
    cells: [user.name, user.assignedRoleName ?? "—", user.email, capitalize(user.status)],
    status: user.status.toLowerCase()
  }));

const rolesToRows = (roles: RbacRole[], users: RbacUser[]): AdminRow[] =>
  roles.map((role) => ({
    id: role.id,
    cells: [
      role.name,
      String(users.filter((u) => u.assignedRoleId === role.id).length),
      role.description || "—",
      capitalize(role.status)
    ],
    status: role.status.toLowerCase()
  }));

const groupsToRows = (groups: RbacSecurityGroup[]): AdminRow[] =>
  groups.map((group) => ({
    id: group.id,
    cells: [group.name, String(group.memberCount ?? 0), group.description || "—", capitalize(group.status)],
    status: group.status.toLowerCase()
  }));

export default function UserAdmin() {
  const location = useLocation();
  const page = pageConfigs[location.pathname];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<Record<string, string>>({});
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [summary, setSummary] = useState<SummaryCard[]>([]);
  const [roleOptions, setRoleOptions] = useState<RbacRole[]>([]);
  const [allUsers, setAllUsers] = useState<RbacUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [userScopes, setUserScopes] = useState<UserScopes & { allowAll?: boolean }>({
    dealerIds: [],
    orgIds: [],
    databaseIds: [],
    siteIds: []
  });
  const [groupRoleIds, setGroupRoleIds] = useState<string[]>([]);
  const [groupUserIds, setGroupUserIds] = useState<string[]>([]);
  const [userPassword, setUserPassword] = useState("");
  const orgDealers = useMemo(() => loadOrgDealers() ?? seedOrgDealers, []);

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

  const reload = useCallback(async () => {
    if (!page) return;
    setLoading(true);
    try {
      const [{ roles, permissions }, users, groups] = await Promise.all([
        getRbacRoles(),
        getRbacUsers(),
        getRbacSecurityGroups()
      ]);
      setRoleOptions(roles);
      setAllUsers(users);

      if (location.pathname === USERS_PATH) {
        setRows(usersToRows(users));
        setSummary([
          { label: "Active", value: users.filter((u) => u.status === "active").length },
          { label: "Inactive", value: users.filter((u) => u.status === "inactive").length },
          {
            label: "Admins",
            value: users.filter((u) => /admin/i.test(u.assignedRoleName ?? "")).length
          },
          { label: "Total", value: users.length }
        ]);
      } else if (location.pathname === ROLES_PATH) {
        setRows(rolesToRows(roles, users));
        setSummary([
          { label: "Roles", value: roles.length },
          { label: "Active", value: roles.filter((r) => r.status === "active").length },
          { label: "Custom", value: Math.max(0, roles.length - 2) },
          { label: "Permissions", value: permissions.length }
        ]);
      } else if (location.pathname === GROUPS_PATH) {
        setRows(groupsToRows(groups));
        setSummary([
          { label: "Groups", value: groups.length },
          { label: "Members", value: groups.reduce((n, g) => n + (g.memberCount ?? 0), 0) },
          { label: "Active", value: groups.filter((g) => g.status === "active").length },
          { label: "Draft", value: groups.filter((g) => g.status === "draft").length }
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, [location.pathname, page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onOrgChange = () => void reload();
    window.addEventListener("vivi:orgchange", onOrgChange);
    return () => window.removeEventListener("vivi:orgchange", onOrgChange);
  }, [reload]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch = row.cells.some((cell) => cell.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  if (!page) {
    return <div className="page admin-page">Page not found.</div>;
  }

  const buildDraftFromRow = (row: AdminRow) => {
    const fields = page.formFields ?? [];
    return fields.reduce<Record<string, string>>((acc, field, index) => {
      acc[field.label] = row.cells[index] ?? "";
      return acc;
    }, {});
  };


  const openUserModal = async (mode: "create" | "edit" | "view", row?: AdminRow) => {
    setModalMode(mode);
    setEditingRowId(row?.id ?? null);
    setSaveError(null);
    if (row) {
      setFormDraft(buildDraftFromRow(row));
      const user = allUsers.find((u) => u.id === row.id);
      setSelectedRoleId(user?.assignedRoleId ?? "");
    } else {
      setFormDraft(
        (page.formFields ?? []).reduce<Record<string, string>>((acc, field) => {
          acc[field.label] = "";
          return acc;
        }, {})
      );
      setSelectedRoleId(roleOptions[0]?.id ?? "");
      setUserScopes({ dealerIds: [], orgIds: [], databaseIds: [], siteIds: [], allowAll: false });
    }
    if (location.pathname === USERS_PATH && row?.id) {
      const scopes = await getUserScopesApi(row.id);
      setUserScopes({
        dealerIds: scopes?.dealerIds ?? [],
        orgIds: scopes?.orgIds ?? [],
        databaseIds: scopes?.databaseIds ?? [],
        siteIds: scopes?.siteIds ?? [],
        allowAll: Boolean(scopes?.allowAll)
      });
    }

    if (location.pathname === GROUPS_PATH && row?.id) {
      const full = await getRbacSecurityGroupsFull();
      setGroupRoleIds(full.groupRoles.filter((l) => l.groupId === row.id).map((l) => l.roleId));
      setGroupUserIds(full.groupUsers.filter((l) => l.groupId === row.id).map((l) => l.userId));
    }
    if (location.pathname === GROUPS_PATH && !row) {
      setGroupRoleIds([]);
      setGroupUserIds([]);
    }
    if (location.pathname === ROLES_PATH && row?.id) {
      await loadRolePermissions(row.id);
    } else if (location.pathname === ROLES_PATH) {
      setRolePermissions(new Set());
    }
    setModalOpen(true);
  };

  const loadRolePermissions = async (roleId: string) => {
    const { permissions } = await getRbacRoles();
    setRolePermissions(
      new Set(permissions.filter((p) => p.roleId === roleId && p.canView > 0).map((p) => p.pagePath))
    );
  };

  const handleSave = async () => {
    setSaveError(null);
    if (location.pathname === USERS_PATH) {
      const name = formDraft["Full name"]?.trim() ?? "";
      const email = formDraft["Email"]?.trim() ?? "";
      const roleId = selectedRoleId.trim();
      if (!name || !email || !roleId) {
        setSaveError("Name, email, and role are required.");
        return;
      }
      const status = (formDraft.Status?.toLowerCase() === "inactive" ? "inactive" : "active") as const;
      const payload = { name, email, roleId, status, password: userPassword };
      const saved =
        modalMode === "edit" && editingRowId
          ? await updateRbacUser({ id: editingRowId, ...payload })
          : await createRbacUser(payload);
      if (!saved) {
        setSaveError("Could not save user. Create a role first and ensure the email is unique.");
        return;
      }
      const scopeUserId = (modalMode === "edit" && editingRowId) ? editingRowId : saved.id;
      if (scopeUserId) {
        const scopeOk = await saveUserScopesApi(scopeUserId, userScopes);
        if (!scopeOk) {
          setSaveError("User saved but organisation scope could not be saved.");
          return;
        }
      }
    } else if (location.pathname === ROLES_PATH) {
      const name = formDraft["Role name"]?.trim() ?? "";
      if (!name) {
        setSaveError("Role name is required.");
        return;
      }
      const saved = await saveRbacRole(
        {
          id: editingRowId ?? undefined,
          name,
          description: formDraft["Description"] || formDraft["Level"] || "",
          permissions: Array.from(rolePermissions)
            .filter((path) => permissionIds.has(path))
            .map((pagePath) => ({ pagePath, view: true }))
        },
        modalMode === "edit"
      );
      if (!saved) {
        setSaveError("Could not save role.");
        return;
      }
    } else if (location.pathname === GROUPS_PATH) {
      const name = formDraft["Group name"]?.trim() ?? "";
      if (!name) {
        setSaveError("Group name is required.");
        return;
      }
      const saved = await saveRbacSecurityGroup(
        {
          id: editingRowId ?? undefined,
          name,
          description: formDraft["Notes"] || formDraft["Owner"] || "",
          status: formDraft.Status?.toLowerCase() === "draft" ? "draft" : "active",
          roleIds: groupRoleIds,
          userIds: groupUserIds
        },
        modalMode === "edit"
      );
      if (!saved) {
        setSaveError("Could not save security group.");
        return;
      }
    }
    setModalOpen(false);
    await reload();
  };

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <div>
          <div className="admin-title">{page.title}</div>
          <div className="admin-path">{page.pathLabel}</div>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-btn ghost" onClick={() => void reload()} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="admin-btn" onClick={() => void openUserModal("create")}>
            Create
          </button>
        </div>
      </div>

      <section className="admin-summary">
        {summary.map((card) => (
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
            <div className="admin-panel-sub">
              {loading ? "Loading…" : `Tenant: ${getTenantId()}`}
            </div>
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
            <div className="admin-empty">{loading ? "Loading…" : "No users yet. Create a role, then add a user."}</div>
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
                          onClick={() => void openUserModal("view", row)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="admin-action ghost"
                          onClick={() => void openUserModal("edit", row)}
                        >
                          Edit
                        </button>
                        {location.pathname === USERS_PATH && (
                          <button
                            type="button"
                            className="admin-action ghost danger"
                            onClick={() => {
                              void (async () => {
                                if (!window.confirm("Delete this user permanently?")) return;
                                if (!(await deleteRbacUser(row.id))) {
                                  setSaveError("Could not delete user.");
                                  return;
                                }
                                await reload();
                              })();
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </span>
                    );
                  }
                  const cellValue = row.cells[index] ?? "";
                  if (col === "Status") {
                    return (
                      <span key={`${row.id}-${col}`} className={`admin-pill ${row.status}`}>
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
              </div>
              <button type="button" className="admin-modal-close" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {(page.formFields ?? []).map((field) => {
                if (location.pathname === USERS_PATH && field.label === "Role") {
                  return (
                    <label key={field.label} className="admin-modal-field">
                      {field.label}
                      <select
                        value={selectedRoleId}
                        onChange={(e) => setSelectedRoleId(e.target.value)}
                        disabled={modalMode === "view"}
                      >
                        <option value="">Select role</option>
                        {roleOptions.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
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
                      type={field.label === "Email" ? "email" : "text"}
                      value={formDraft[field.label] ?? ""}
                      onChange={(e) => setFormDraft((c) => ({ ...c, [field.label]: e.target.value }))}
                      disabled={modalMode === "view"}
                      placeholder={field.placeholder}
                    />
                  </label>
                );
              })}
              {location.pathname === ROLES_PATH && (
                <div className="admin-permissions">
                  {permissionGroups.map((group) => (
                    <div key={group.title}>
                      <div className="admin-permissions-title">{group.title}</div>
                      {group.items.map((item) => (
                        <label key={item.path} className="admin-permission-item">
                          <input
                            type="checkbox"
                            checked={rolePermissions.has(item.path)}
                            disabled={modalMode === "view"}
                            onChange={(e) => {
                              setRolePermissions((current) => {
                                const next = new Set(current);
                                if (e.target.checked) next.add(item.path);
                                else next.delete(item.path);
                                return next;
                              });
                            }}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              
              {location.pathname === USERS_PATH && modalMode === "create" && (
                <label className="admin-modal-field">
                  Temporary password
                  <input type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} />
                </label>
              )}
              {location.pathname === USERS_PATH && (
                <label className="admin-modal-field">
                  Status
                  <select
                    value={formDraft.Status ?? "Active"}
                    disabled={modalMode === "view"}
                    onChange={(e) => setFormDraft((c) => ({ ...c, Status: e.target.value }))}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </label>
              )}
              {location.pathname === GROUPS_PATH && (
                <SecurityGroupMembers
                  roles={roleOptions}
                  users={allUsers}
                  roleIds={groupRoleIds}
                  userIds={groupUserIds}
                  disabled={modalMode === "view"}
                  onChange={({ roleIds, userIds }) => {
                    setGroupRoleIds(roleIds);
                    setGroupUserIds(userIds);
                  }}
                />
              )}
{location.pathname === USERS_PATH && (
                <ScopeTreePicker
                  dealers={orgDealers}
                  scopes={userScopes}
                  disabled={modalMode === "view"}
                  onChange={setUserScopes}
                />
              )}
              {saveError && <p style={{ color: "#b42318" }}>{saveError}</p>}
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="admin-btn ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  if (modalMode === "view") setModalOpen(false);
                  else void handleSave();
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
