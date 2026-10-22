import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { canForPath, getTenantId } from "../../../utils/api";
import { sortRolesByPrivilege } from "../../../utils/standardRoles";
import { showToast } from "../../../utils/toast";
import { beginSaving, endSavingDone, endSavingError } from "../../../utils/saveFeedback";
import { ROLES_PATH, SECURITY_GROUPS_PATH, USERS_PATH } from "./paths";
import { rbacApiJson } from "./rbacApi";
import type { RbacGroup, RbacRole, RbacUser } from "./types";
import "../../../index.css";

export default function SecurityGroupEditorPage({ mode }: { mode: "create" | "edit" }) {
  const navigate = useNavigate();
  const params = useParams();
  const editingId = mode === "edit" ? String(params.groupId ?? "").trim() : "";
  const tenantId = getTenantId();
  const canEdit = canForPath(SECURITY_GROUPS_PATH, "edit");
  const [busy, setBusy] = useState(false);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [users, setUsers] = useState<RbacUser[]>([]);
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    status: "active",
    roleIds: [] as string[],
    userIds: [] as string[]
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const activeTenant = String(tenantId ?? "").trim();
        if (!activeTenant) throw new Error("Select a database first.");
        const [rolesBody, usersBody, groupsBody] = await Promise.all([
          rbacApiJson("/rbac/roles", { method: "GET" }, { tenantRequired: true, tenantId: activeTenant }),
          rbacApiJson("/rbac/users", { method: "GET" }, { tenantRequired: true, tenantId: activeTenant }),
          mode === "edit"
            ? rbacApiJson("/rbac/security-groups", { method: "GET" }, { tenantRequired: true, tenantId: activeTenant })
            : Promise.resolve(null)
        ]);
        if (cancelled) return;
        setRoles(Array.isArray(rolesBody?.roles) ? (rolesBody.roles as RbacRole[]) : []);
        setUsers(Array.isArray(usersBody?.users) ? (usersBody.users as RbacUser[]) : []);

        if (mode === "edit" && editingId && groupsBody) {
          const groups = Array.isArray(groupsBody?.groups) ? (groupsBody.groups as RbacGroup[]) : [];
          const group = groups.find((g) => g.id === editingId);
          if (!group) throw new Error("Security group not found");
          const roleIds = (Array.isArray(groupsBody?.groupRoles) ? groupsBody.groupRoles : [])
            .filter((r: { groupId: string; roleId: string }) => r.groupId === editingId)
            .map((r: { roleId: string }) => r.roleId);
          const userIds = (Array.isArray(groupsBody?.groupUsers) ? groupsBody.groupUsers : [])
            .filter((u: { groupId: string; userId: string }) => u.groupId === editingId)
            .map((u: { userId: string }) => u.userId);
          setDraft({
            name: group.name,
            description: String(group.description ?? ""),
            status: group.status || "active",
            roleIds,
            userIds
          });
        }
      } catch (e: any) {
        showToast(String(e?.message ?? e), "error");
        if (mode === "edit") navigate(SECURITY_GROUPS_PATH);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, editingId, tenantId, navigate]);

  const save = async () => {
    if (!canEdit) {
      showToast("You do not have permission to edit security groups.", "error");
      return;
    }
    if (!String(draft.name ?? "").trim()) {
      showToast("Group name is required.", "error");
      return;
    }
    setBusy(true);
    let feedbackStarted = false;
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description,
        status: draft.status,
        roleIds: draft.roleIds,
        userIds: draft.userIds
      };
      feedbackStarted = true;
      beginSaving(mode === "create" ? "Creating security group" : "Updating security group");
      if (mode === "create") {
        await rbacApiJson(
          "/rbac/security-groups",
          { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
          { tenantRequired: true }
        );
        endSavingDone("Security group created");
      } else {
        await rbacApiJson(
          "/rbac/security-groups",
          { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editingId, ...payload }) },
          { tenantRequired: true }
        );
        endSavingDone("Security group updated");
      }
      navigate(SECURITY_GROUPS_PATH);
    } catch (e: any) {
      const message = String(e?.message ?? e);
      if (feedbackStarted) endSavingError(message);
      else showToast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <div>
          <div className="admin-title">{mode === "create" ? "Create security group" : "Edit security group"}</div>
          <div className="admin-path">
            Control / User admin / Security groups / {mode === "create" ? "Create" : "Edit"}
          </div>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-btn ghost" onClick={() => navigate(SECURITY_GROUPS_PATH)} disabled={busy}>
            Back to groups
          </button>
          <button type="button" className="admin-btn" onClick={() => void save()} disabled={busy || !canEdit || !tenantId}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <section className="admin-panel admin-form-page">
        <div className="admin-modal-sub" style={{ marginBottom: 16 }}>
          Assign one or more roles (what actions are allowed), then add users. Members inherit the group's roles. Create{" "}
          <Link to={`${ROLES_PATH}/create`}>roles</Link> first if needed; add more <Link to={`${USERS_PATH}/create`}>users</Link>{" "}
          after the group exists.
        </div>

        <div className="admin-form-grid">
          <label className="admin-modal-field">
            Group name
            <input value={draft.name} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} />
          </label>
          <label className="admin-modal-field">
            Description
            <input value={draft.description} onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value }))} />
          </label>
          <label className="admin-modal-field">
            Status
            <select value={draft.status} onChange={(e) => setDraft((c) => ({ ...c, status: e.target.value }))}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>

          <div className="admin-modal-field" style={{ gap: 12 }}>
            <span>Assigned roles</span>
            <div className="admin-modal-sub">Roles unlock the actions members can perform on accessible assets and drivers.</div>
            <div className="admin-permissions-list">
              {sortRolesByPrivilege(roles).map((r) => (
                <label key={r.id} className="admin-permission-item">
                  <input
                    type="checkbox"
                    checked={draft.roleIds.includes(r.id)}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        roleIds: e.target.checked ? [...c.roleIds, r.id] : c.roleIds.filter((id) => id !== r.id)
                      }))
                    }
                  />
                  <span>
                    {r.name}
                    {r.description ? ` — ${r.description}` : ""}
                  </span>
                </label>
              ))}
              {!roles.length ? (
                <div className="admin-choice-empty">
                  No roles available. <Link to={`${ROLES_PATH}/create`}>Create a role</Link> first.
                </div>
              ) : null}
            </div>
          </div>

          <div className="admin-modal-field" style={{ gap: 12 }}>
            <span>Members</span>
            <div className="admin-modal-sub">Users in this group inherit the assigned roles.</div>
            <div className="admin-permissions-list">
              {users.map((u) => (
                <label key={u.id} className="admin-permission-item">
                  <input
                    type="checkbox"
                    checked={draft.userIds.includes(u.id)}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        userIds: e.target.checked ? [...c.userIds, u.id] : c.userIds.filter((id) => id !== u.id)
                      }))
                    }
                  />
                  <span>
                    {u.name} ({u.email})
                  </span>
                </label>
              ))}
              {!users.length ? (
                <div className="admin-choice-empty">
                  No users in this database yet. You can save the group now and <Link to={`${USERS_PATH}/create`}>add users</Link>{" "}
                  later.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
