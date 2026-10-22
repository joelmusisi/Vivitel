import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { canForPath, getTenantId } from "../../../utils/api";
import { sortRolesByPrivilege } from "../../../utils/standardRoles";
import { showToast } from "../../../utils/toast";
import { USERS_PATH } from "./paths";
import { rbacApiJson } from "./rbacApi";
import type { RbacGroup, RbacRole } from "./types";
import "../../../index.css";

export default function UserAccessPage() {
  const navigate = useNavigate();
  const params = useParams();
  const userId = String(params.userId ?? "").trim();
  const tenantId = getTenantId();
  const canEdit = canForPath(USERS_PATH, "edit");
  const [busy, setBusy] = useState(false);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [groups, setGroups] = useState<RbacGroup[]>([]);
  const [draft, setDraft] = useState<{ tenantAccess: boolean; roleIds: string[]; groupIds: string[] }>({
    tenantAccess: true,
    roleIds: [],
    groupIds: []
  });

  useEffect(() => {
    if (!userId || !tenantId) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const [assignBody, rolesBody, groupsBody] = await Promise.all([
          rbacApiJson(`/rbac/assignments?userId=${encodeURIComponent(userId)}`, { method: "GET" }, { tenantRequired: true }),
          rbacApiJson("/rbac/roles", { method: "GET" }, { tenantRequired: true }),
          rbacApiJson("/rbac/security-groups", { method: "GET" }, { tenantRequired: true })
        ]);
        if (cancelled) return;
        setDraft({
          tenantAccess: Boolean(assignBody?.tenantAccess),
          roleIds: Array.isArray(assignBody?.roleIds) ? assignBody.roleIds : [],
          groupIds: Array.isArray(assignBody?.groupIds) ? assignBody.groupIds : []
        });
        setRoles(Array.isArray(rolesBody?.roles) ? (rolesBody.roles as RbacRole[]) : []);
        setGroups(Array.isArray(groupsBody?.groups) ? (groupsBody.groups as RbacGroup[]) : []);
      } catch (e: any) {
        showToast(String(e?.message ?? e), "error");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, tenantId]);

  const save = async () => {
    if (!canEdit) {
      showToast("You do not have permission to edit access.", "error");
      return;
    }
    setBusy(true);
    try {
      await rbacApiJson(
        "/rbac/assignments",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId, ...draft })
        },
        { tenantRequired: true }
      );
      showToast("Access updated.", "success");
      navigate(USERS_PATH);
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
          <div className="admin-title">Edit access</div>
          <div className="admin-path">Control / User admin / Users / Access</div>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-btn ghost" onClick={() => navigate(USERS_PATH)} disabled={busy}>
            Back to users
          </button>
          <button type="button" className="admin-btn" onClick={() => void save()} disabled={busy || !canEdit}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <section className="admin-panel admin-form-page">
        <div className="admin-modal-sub" style={{ marginBottom: 16 }}>
          Security groups are the preferred way to grant shared permissions. Direct roles are optional extras.
        </div>

        <label className="admin-permission-item">
          <input
            type="checkbox"
            checked={draft.tenantAccess}
            onChange={(e) => setDraft((c) => ({ ...c, tenantAccess: e.target.checked }))}
          />
          <span>Organisation access enabled</span>
        </label>

        <div className="admin-modal-field" style={{ gap: 12, marginTop: 16 }}>
          <span>Security groups</span>
          <div className="admin-permissions-list">
            {groups.map((g) => (
              <label key={g.id} className="admin-permission-item">
                <input
                  type="checkbox"
                  checked={draft.groupIds.includes(g.id)}
                  disabled={!draft.tenantAccess}
                  onChange={(e) =>
                    setDraft((c) => ({
                      ...c,
                      groupIds: e.target.checked ? [...c.groupIds, g.id] : c.groupIds.filter((x) => x !== g.id)
                    }))
                  }
                />
                <span>{g.name}</span>
              </label>
            ))}
            {!groups.length ? <div className="admin-choice-empty">No security groups in this database.</div> : null}
          </div>
        </div>

        <div className="admin-modal-field" style={{ gap: 12, marginTop: 16 }}>
          <span>Direct roles</span>
          <div className="admin-permissions-list">
            {sortRolesByPrivilege(roles).map((r) => (
              <label key={r.id} className="admin-permission-item">
                <input
                  type="checkbox"
                  checked={draft.roleIds.includes(r.id)}
                  disabled={!draft.tenantAccess}
                  onChange={(e) =>
                    setDraft((c) => ({
                      ...c,
                      roleIds: e.target.checked ? [...c.roleIds, r.id] : c.roleIds.filter((x) => x !== r.id)
                    }))
                  }
                />
                <span>{r.name}</span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
