import { useCallback, useEffect, useMemo, useState } from "react";
import SortableColumnHeader from "../../../components/SortableColumnHeader";
import { useColumnSort } from "../../../hooks/useColumnSort";
import { Link, useNavigate } from "react-router-dom";
import { canForPath, getTenantId } from "../../../utils/api";
import { ROLES_PATH, SECURITY_GROUPS_PATH, USERS_PATH } from "./paths";
import { rbacApiJson } from "./rbacApi";
import type { RbacGroup, RbacRole, RbacUser } from "./types";
import "../../../index.css";

export default function SecurityGroupsListPage() {
  const navigate = useNavigate();
  const tenantId = getTenantId();
  const canEdit = canForPath(SECURITY_GROUPS_PATH, "edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState<RbacGroup[]>([]);
  const [groupRoles, setGroupRoles] = useState<{ groupId: string; roleId: string }[]>([]);
  const [groupUsers, setGroupUsers] = useState<{ groupId: string; userId: string }[]>([]);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [users, setUsers] = useState<RbacUser[]>([]);

  const reload = async () => {
    setBusy(true);
    setError(null);
    try {
      const activeTenant = String(getTenantId() ?? tenantId ?? "").trim();
      if (!activeTenant) {
        setGroups([]);
        setError("Select a database to load security groups.");
        return;
      }
      const [groupsBody, rolesBody, usersBody] = await Promise.all([
        rbacApiJson("/rbac/security-groups", { method: "GET" }, { tenantRequired: true, tenantId: activeTenant }),
        rbacApiJson("/rbac/roles", { method: "GET" }, { tenantId: activeTenant }).catch(() => null),
        rbacApiJson("/rbac/users", { method: "GET" }, { tenantRequired: true, tenantId: activeTenant }).catch(() => null)
      ]);
      setGroups(Array.isArray(groupsBody?.groups) ? (groupsBody.groups as RbacGroup[]) : []);
      setGroupRoles(Array.isArray(groupsBody?.groupRoles) ? groupsBody.groupRoles : []);
      setGroupUsers(Array.isArray(groupsBody?.groupUsers) ? groupsBody.groupUsers : []);
      setRoles(Array.isArray(rolesBody?.roles) ? (rolesBody.roles as RbacRole[]) : []);
      setUsers(Array.isArray(usersBody?.users) ? (usersBody.users as RbacUser[]) : []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setGroups([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const roleNameById = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);
  const userNameById = useMemo(() => new Map(users.map((u) => [u.id, u.name || u.email])), [users]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const roleNames = groupRoles.filter((r) => r.groupId === g.id).map((r) => roleNameById.get(r.roleId) ?? "").join(" ");
      const memberNames = groupUsers.filter((u) => u.groupId === g.id).map((u) => userNameById.get(u.userId) ?? "").join(" ");
      return `${g.name} ${g.description ?? ""} ${g.status} ${roleNames} ${memberNames}`.toLowerCase().includes(q);
    });
  }, [search, groups, groupRoles, groupUsers, roleNameById, userNameById]);

  const getGroupSortValue = useCallback(
    (group: RbacGroup, key: string) => {
      if (key === "group") return `${group.name} ${group.description ?? ""}`;
      if (key === "roles") {
        return groupRoles
          .filter((r) => r.groupId === group.id)
          .map((r) => roleNameById.get(r.roleId) ?? r.roleId)
          .filter(Boolean)
          .join(", ");
      }
      if (key === "members") {
        return groupUsers
          .filter((u) => u.groupId === group.id)
          .map((u) => userNameById.get(u.userId) ?? u.userId)
          .filter(Boolean)
          .join(", ");
      }
      if (key === "status") return group.status;
      return "";
    },
    [groupRoles, groupUsers, roleNameById, userNameById]
  );
  const groupSort = useColumnSort({ rows: filteredGroups, getValue: getGroupSortValue });

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <div>
          <div className="admin-title">Security groups</div>
          <div className="admin-path">Control / User admin / Security groups</div>
        </div>
        <div className="admin-actions">
          <Link className="admin-btn ghost" to={ROLES_PATH}>
            Roles
          </Link>
          <Link className="admin-btn ghost" to={USERS_PATH}>
            Users
          </Link>
          <button type="button" className="admin-btn ghost" onClick={() => void reload()} disabled={busy}>
            Refresh
          </button>
          {canEdit && (
            <button
              type="button"
              className="admin-btn"
              onClick={() => navigate(`${SECURITY_GROUPS_PATH}/create`)}
              disabled={busy || !tenantId}
            >
              Create security group
            </button>
          )}
        </div>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <div className="admin-panel-title">Security groups{!busy ? ` (${filteredGroups.length})` : ""}</div>
            <div className="admin-modal-sub">
              Assign roles to a group, then add users. Members inherit only those roles.
            </div>
          </div>
          <div className="admin-filter-row">
            <input className="admin-search" placeholder="Search groups, roles, members" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {error && <div className="admin-empty">{error}</div>}

        <div className="admin-table" style={{ "--admin-cols": 5 } as React.CSSProperties}>
          <div className="admin-row admin-row-head">
            <SortableColumnHeader as="span" label="Group" {...groupSort.getHeaderProps("group")} />
            <SortableColumnHeader as="span" label="Roles" {...groupSort.getHeaderProps("roles")} />
            <SortableColumnHeader as="span" label="Members" {...groupSort.getHeaderProps("members")} />
            <SortableColumnHeader as="span" label="Status" {...groupSort.getHeaderProps("status")} />
            <span>Actions</span>
          </div>
          {groupSort.sortedRows.map((g) => {
            const roleLabels = groupRoles
              .filter((r) => r.groupId === g.id)
              .map((r) => roleNameById.get(r.roleId) ?? r.roleId)
              .filter(Boolean);
            const memberLabels = groupUsers
              .filter((u) => u.groupId === g.id)
              .map((u) => userNameById.get(u.userId) ?? u.userId)
              .filter(Boolean);
            return (
              <div key={g.id} className="admin-row">
                <span>
                  {g.name}
                  {g.description ? <div className="admin-modal-sub">{g.description}</div> : null}
                </span>
                <span>{roleLabels.join(", ") || "—"}</span>
                <span>
                  {memberLabels.length ? `${memberLabels.slice(0, 3).join(", ")}${memberLabels.length > 3 ? ` +${memberLabels.length - 3}` : ""}` : "—"}
                </span>
                <span className={`admin-pill ${String(g.status || "").toLowerCase()}`}>{g.status}</span>
                <span className="admin-actions-col">
                  <button
                    type="button"
                    className="admin-action"
                    onClick={() => navigate(`${SECURITY_GROUPS_PATH}/edit/${encodeURIComponent(g.id)}`)}
                  >
                    Edit
                  </button>
                </span>
              </div>
            );
          })}
          {!busy && !error && filteredGroups.length === 0 ? (
            <div className="admin-empty" style={{ marginTop: 12 }}>
              {search.trim()
                ? "No security groups match this search."
                : tenantId
                  ? "No security groups yet. Create a group, assign roles, then add users."
                  : "Select a database to load security groups."}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
