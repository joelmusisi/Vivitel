import { useCallback, useEffect, useMemo, useState } from "react";
import SortableColumnHeader from "../../../components/SortableColumnHeader";
import { useColumnSort } from "../../../hooks/useColumnSort";
import { Link, useNavigate } from "react-router-dom";
import { canForPath, getTenantId } from "../../../utils/api";
import { isStandardRoleName, roleDisplayName, sortRolesByPrivilege, standardRoleDescription } from "../../../utils/standardRoles";
import { sanitizeFeedbackLabel } from "../../../utils/uiMessage";
import { ROLES_PATH, SECURITY_GROUPS_PATH, USERS_PATH } from "./paths";
import { rbacApiJson } from "./rbacApi";
import type { RbacRole } from "./types";
import "../../../index.css";

export default function RolesListPage() {
  const navigate = useNavigate();
  const tenantId = getTenantId();
  const canEdit = canForPath(ROLES_PATH, "edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState<RbacRole[]>([]);

  const reload = async () => {
    setBusy(true);
    setError(null);
    try {
      const activeTenant = String(getTenantId() ?? tenantId ?? "").trim();
      const body = await rbacApiJson("/rbac/roles", { method: "GET" }, { tenantRequired: true, tenantId: activeTenant || undefined });
      setRoles(Array.isArray(body?.roles) ? (body.roles as RbacRole[]) : []);
    } catch (e: any) {
      setError(sanitizeFeedbackLabel(String(e?.message ?? e), "Unable to load roles. Please retry."));
      setRoles([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = sortRolesByPrivilege(roles);
    if (!q) return base;
    return base.filter((r) => `${roleDisplayName(r) || r.name} ${r.description ?? ""} ${r.status}`.toLowerCase().includes(q));
  }, [search, roles]);

  const getRoleSortValue = useCallback((role: RbacRole, key: string) => {
    if (key === "role") return roleDisplayName(role) || role.name;
    if (key === "level") return Number(role.roleLevel ?? 100);
    if (key === "description") return role.description || standardRoleDescription(role.name);
    if (key === "status") return role.status;
    return "";
  }, []);
  const roleSort = useColumnSort({ rows: filteredRoles, getValue: getRoleSortValue });

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <div>
          <div className="admin-title">Roles</div>
          <div className="admin-path">Control / User admin / Roles</div>
        </div>
        <div className="admin-actions">
          <Link className="admin-btn ghost" to={USERS_PATH}>
            Users
          </Link>
          <Link className="admin-btn ghost" to={SECURITY_GROUPS_PATH}>
            Security groups
          </Link>
          <button type="button" className="admin-btn ghost" onClick={() => void reload()} disabled={busy}>
            Refresh
          </button>
          {canEdit && (
            <button type="button" className="admin-btn" onClick={() => navigate(`${ROLES_PATH}/create`)} disabled={busy || !tenantId}>
              Create role
            </button>
          )}
        </div>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <div className="admin-panel-title">Roles</div>
            <div className="admin-modal-sub">
              Only roles available to your account (or equal/lower privilege roles you can assign) are listed.
            </div>
          </div>
          <div className="admin-filter-row">
            <input className="admin-search" placeholder="Search roles" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {error && <div className="admin-empty">{error}</div>}

        <div className="admin-table" style={{ "--admin-cols": 3 } as React.CSSProperties}>
          <div className="admin-row admin-row-head">
            <SortableColumnHeader as="span" label="Role" {...roleSort.getHeaderProps("role")} />
            <SortableColumnHeader as="span" label="Status" {...roleSort.getHeaderProps("status")} />
            <span>Actions</span>
          </div>
          {roleSort.sortedRows.map((r) => (
            <div key={r.id} className="admin-row">
              <span>
                {roleDisplayName(r) || "Role"}
                {(r.isSystem || isStandardRoleName(r.name)) && <span className="admin-pill system">Standard</span>}
              </span>
              <span className={`admin-pill ${String(r.status || "").toLowerCase()}`}>{r.status}</span>
              <span className="admin-actions-col">
                <button type="button" className="admin-action" onClick={() => navigate(`${ROLES_PATH}/edit/${encodeURIComponent(r.id)}`)}>
                  Edit
                </button>
              </span>
            </div>
          ))}
          {!busy && !error && filteredRoles.length === 0 ? (
            <div className="admin-empty" style={{ marginTop: 12 }}>
              {tenantId ? "No roles found. Create a role to get started." : "Select a database to load roles."}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
