import { useCallback, useEffect, useMemo, useState } from "react";
import SortableColumnHeader from "../../../components/SortableColumnHeader";
import { useColumnSort } from "../../../hooks/useColumnSort";
import { Link, useNavigate } from "react-router-dom";
import { activateDemoAccount, canForPath, getTenantId, isOwnSupportPrincipal } from "../../../utils/api";
import { showToast } from "../../../utils/toast";
import { SECURITY_GROUPS_PATH, USERS_PATH, ROLES_PATH } from "./paths";
import { formatLastLogin, rbacApiJson, recoverUserAdminTenantId } from "./rbacApi";
import type { RbacGroup, RbacRole, RbacUser } from "./types";
import "../../../index.css";
import "../../../components/demo/TrialBanner.css";

export default function UsersListPage() {
  const navigate = useNavigate();
  const tenantId = recoverUserAdminTenantId();
  const canEdit = canForPath(USERS_PATH, "edit");
  const canActivateDemo = canEdit && isOwnSupportPrincipal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<RbacUser[]>([]);
  const [groups, setGroups] = useState<RbacGroup[]>([]);
  const [groupUsers, setGroupUsers] = useState<{ groupId: string; userId: string }[]>([]);
  const [roles, setRoles] = useState<RbacRole[]>([]);

  const reload = async () => {
    setBusy(true);
    setError(null);
    try {
      const activeTenant = String(recoverUserAdminTenantId() || getTenantId() || tenantId || "").trim();
      if (!activeTenant || activeTenant.split(":").filter(Boolean).length < 3) {
        setUsers([]);
        setError("Select a database to load users.");
        return;
      }
      const [body, rolesBody, groupsBody] = await Promise.all([
        rbacApiJson("/rbac/users", { method: "GET" }, { tenantRequired: true, tenantId: activeTenant }),
        rbacApiJson("/rbac/roles", { method: "GET" }, { tenantId: activeTenant }).catch(() => null),
        rbacApiJson("/rbac/security-groups", { method: "GET" }, { tenantId: activeTenant }).catch(() => null)
      ]);
      setUsers(Array.isArray(body?.users) ? (body.users as RbacUser[]) : []);
      setRoles(Array.isArray(rolesBody?.roles) ? (rolesBody.roles as RbacRole[]) : []);
      setGroups(Array.isArray(groupsBody?.groups) ? (groupsBody.groups as RbacGroup[]) : []);
      setGroupUsers(Array.isArray(groupsBody?.groupUsers) ? groupsBody.groupUsers : []);
    } catch (e: any) {
      const raw = String(e?.message ?? e);
      const looksLikeWorkerCrash = /error code:\s*1101|worker threw exception|internal server error/i.test(raw);
      setError(
        looksLikeWorkerCrash
          ? "Unable to load users from the API (worker error). Refresh once, or switch database and try again."
          : raw
      );
      setUsers([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const groupNameByUserId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of groupUsers) {
      const group = groups.find((g) => g.id === row.groupId);
      if (!group) continue;
      const list = map.get(row.userId) ?? [];
      list.push(group.name);
      map.set(row.userId, list);
    }
    return map;
  }, [groupUsers, groups]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const groupNames = (groupNameByUserId.get(u.id) ?? []).join(" ");
      return `${u.name} ${u.email} ${u.assignedRoleName ?? ""} ${groupNames}`.toLowerCase().includes(q);
    });
  }, [search, users, groupNameByUserId]);

  const getUserSortValue = useCallback(
    (user: RbacUser, key: string) => {
      if (key === "user") return `${user.name} ${user.assignedRoleName ?? ""}`;
      if (key === "email") return user.email;
      if (key === "groups") return (groupNameByUserId.get(user.id) ?? []).join(", ");
      if (key === "account") {
        if (user.demo && !user.demo.activated) return user.demo.expired ? "Suspended" : "Demo";
        if (user.demo?.activated) return "Active";
        return "—";
      }
      if (key === "lastLogin") return formatLastLogin(user.lastLoginAt ?? user.lastLogin);
      return "";
    },
    [groupNameByUserId]
  );
  const userSort = useColumnSort({ rows: filteredUsers, getValue: getUserSortValue });

  const activate = async (user: RbacUser) => {
    if (!canActivateDemo || !user.demo || user.demo.activated) return;
    setBusy(true);
    try {
      const result = await activateDemoAccount(user.id);
      if (!result.ok) {
        showToast(result.error ?? "Could not activate this account.", "error");
        return;
      }
      showToast(`${user.email} is now an active account.`, "success");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const impersonate = async (user: RbacUser) => {
    try {
      const { setStoredApiKey, refreshAuthMe, stashImpersonationReturnSession, restoreImpersonationReturnSession } = await import("../../../utils/api");
      stashImpersonationReturnSession();
      if (typeof window !== "undefined") {
        window.localStorage.setItem("vivi.impersonatedLabel", String(user.name ?? user.email ?? user.id ?? "").trim());
      }
      const body = await rbacApiJson(
        "/auth/impersonate",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: user.id })
        },
        { tenantId: String(user.assignedTenantId ?? tenantId ?? "").trim() || undefined }
      );
      const token = String(body?.token ?? "").trim();
      if (!token) throw new Error("Impersonation failed: no token returned");
      const nextTenant = String(body?.tenantId ?? user.assignedTenantId ?? "").trim();
      if (typeof window !== "undefined") {
        // Drop the admin browser's local hierarchy cache so we load the shared server tree
        // for the impersonated account (including recently added databases/sites).
        window.localStorage.removeItem("vivi.org.dealers");
      }
      setStoredApiKey(token);
      // setStoredApiKey clears tenantId — restore the impersonated user's database scope after.
      if (typeof window !== "undefined") {
        if (nextTenant) window.localStorage.setItem("vivi.tenantId", nextTenant);
        else window.localStorage.removeItem("vivi.tenantId");
        // Drop the previous account's organisation selection so this account opens on its own database.
        window.localStorage.removeItem("vivi.activeDealerId");
        window.localStorage.removeItem("vivi.activeOrgId");
        window.localStorage.removeItem("vivi.activeDbId");
        window.localStorage.removeItem("vivi.activeSiteId");
        window.localStorage.removeItem("vivi.activeSite");
        window.localStorage.removeItem("vivi.selectedPath");
      }
      const auth = await refreshAuthMe();
      if (!auth.ok) {
        throw new Error(auth.unauthorized ? "Unauthorized while starting impersonation." : "Failed to load impersonated session.");
      }
      showToast(`Impersonating ${user.email}`, "success");
      navigate("/");
    } catch (e: any) {
      const { restoreImpersonationReturnSession } = await import("../../../utils/api");
      restoreImpersonationReturnSession();
      showToast(String(e?.message ?? e), "error");
    }
  };

  const sendResetLink = async (user: RbacUser) => {
    try {
      if (!user?.id) return;
      if (!String(user.email ?? "").trim()) {
        showToast("User has no email address.", "error");
        return;
      }
      setBusy(true);
      const editTenantId = String(user.assignedTenantId ?? tenantId ?? "").trim();
      const body = await rbacApiJson(
        "/rbac/users",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: user.id, email: user.email, sendInvite: true })
        },
        { tenantId: editTenantId, tenantRequired: true }
      );
      const attempted = Boolean(body?.inviteEmailAttempted);
      const sent = Boolean(body?.inviteEmailSent);
      if (attempted && sent) showToast(`Reset link sent to ${user.email}.`, "success");
      else if (!attempted) showToast("Reset link was not attempted. Check MAIL_FROM/Resend settings.", "error");
      else showToast(`Reset link failed: ${String(body?.inviteEmailError ?? "Email provider error")}`, "error");
    } catch (e: any) {
      showToast(String(e?.message ?? e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <div>
          <div className="admin-title">Users</div>
          <div className="admin-path">Control / User admin / Users</div>
        </div>
        <div className="admin-actions">
          <Link className="admin-btn ghost" to={ROLES_PATH}>
            Roles
          </Link>
          <Link className="admin-btn ghost" to={SECURITY_GROUPS_PATH}>
            Security groups
          </Link>
          <button type="button" className="admin-btn ghost" onClick={() => void reload()} disabled={busy}>
            Refresh
          </button>
          {canEdit && (
            <button type="button" className="admin-btn" onClick={() => navigate(`${USERS_PATH}/create`)} disabled={busy}>
              Create user
            </button>
          )}
        </div>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <div className="admin-panel-title">Users{!busy ? ` (${filteredUsers.length})` : ""}</div>
            <div className="admin-modal-sub">
              You only see users in this database with equal or lower rights than your account.
            </div>
          </div>
          <div className="admin-filter-row">
            <input className="admin-search" placeholder="Search users, roles, groups" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {error && <div className="admin-empty">{error}</div>}

        <div className="admin-table" style={{ "--admin-cols": 6 } as React.CSSProperties}>
          <div className="admin-row admin-row-head">
            <SortableColumnHeader as="span" label="User" {...userSort.getHeaderProps("user")} />
            <SortableColumnHeader as="span" label="Email" {...userSort.getHeaderProps("email")} />
            <SortableColumnHeader as="span" label="Security groups" {...userSort.getHeaderProps("groups")} />
            <SortableColumnHeader as="span" label="Account" {...userSort.getHeaderProps("account")} />
            <SortableColumnHeader as="span" label="Last login" {...userSort.getHeaderProps("lastLogin")} />
            <span>Actions</span>
          </div>
          {userSort.sortedRows.map((u) => (
            <div key={u.id} className="admin-row">
              <span>
                {u.name}
                {u.assignedRoleName ? <span className="admin-pill">{u.assignedRoleName}</span> : null}
              </span>
              <span>{u.email}</span>
              <span>{(groupNameByUserId.get(u.id) ?? []).join(", ") || "—"}</span>
              <span>
                {u.demo && !u.demo.activated ? (
                  <label className="trial-switch" title={u.demo.expired ? "Trial ended" : `${u.demo.daysRemaining ?? 0} days left`}>
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={!canActivateDemo || busy}
                      onChange={() => void activate(u)}
                    />
                    <span>{u.demo.expired ? "Suspended" : "Demo"}</span>
                  </label>
                ) : u.demo?.activated ? (
                  <span className="admin-pill">Active</span>
                ) : (
                  "—"
                )}
              </span>
              <span>{formatLastLogin(u.lastLoginAt ?? u.lastLogin)}</span>
              <span className="admin-actions-col">
                <button type="button" className="admin-action" onClick={() => navigate(`${USERS_PATH}/edit/${encodeURIComponent(u.id)}`, { state: { user: u } })}>
                  Edit
                </button>
                <button
                  type="button"
                  className="admin-action ghost"
                  onClick={() => navigate(`${USERS_PATH}/access/${encodeURIComponent(u.id)}`)}
                  disabled={!tenantId}
                >
                  Access
                </button>
                <button type="button" className="admin-action ghost" onClick={() => void sendResetLink(u)} disabled={busy}>
                  Send reset link
                </button>
                <button type="button" className="admin-action ghost" onClick={() => void impersonate(u)}>
                  Impersonate
                </button>
              </span>
            </div>
          ))}
          {!busy && !error && filteredUsers.length === 0 ? (
            <div className="admin-empty" style={{ marginTop: 12 }}>
              {search.trim()
                ? "No users match this search."
                : tenantId
                  ? "No users found for this database yet. Create roles and a security group first, then add users."
                  : "Select a database to load users."}
            </div>
          ) : null}
        </div>
        {!roles.length && tenantId && !busy ? (
          <div className="admin-empty" style={{ marginTop: 8 }}>
            Tip: open <Link to={ROLES_PATH}>Roles</Link> once to seed standard roles for this database.
          </div>
        ) : null}
      </section>
    </div>
  );
}
