import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AnalyzeNav, ControlNav, DeliverNav, TrackNav } from "../../../navData";
import { canForPath, getTenantId } from "../../../utils/api";
import { roleDisplayName } from "../../../utils/standardRoles";
import { showToast } from "../../../utils/toast";
import { beginSaving, endSavingDone, endSavingError } from "../../../utils/saveFeedback";
import { sanitizeFeedbackLabel } from "../../../utils/uiMessage";
import { parseUserAdminRoute, ROLES_PATH } from "./paths";
import { rbacApiJson, uniqBy } from "./rbacApi";
import type { Action, PageDef, RolePermRow, RbacRole } from "./types";
import "../../../index.css";

export default function RoleEditorPage({ mode, entityId }: { mode: "create" | "edit"; entityId?: string }) {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const route = parseUserAdminRoute(location.pathname);
  const editingId = mode === "edit" ? String(entityId || route.entityId || params.roleId || "").trim() : "";
  const tenantId = getTenantId();
  const canEdit = canForPath(ROLES_PATH, "edit");
  const [busy, setBusy] = useState(false);
  const [roleDraft, setRoleDraft] = useState({
    name: "",
    description: "",
    status: "active",
    roleLevel: 100,
    standardRoleKey: ""
  });
  const [rolePermDraft, setRolePermDraft] = useState<Record<string, { view: boolean; edit: boolean; delete: boolean }>>({});
  const headingName = roleDisplayName(roleDraft);

  const allPages: PageDef[] = useMemo(() => {
    const track = TrackNav.flatMap((g) => g.items).map((i) => ({ path: i.path, label: i.label, area: "Track" as const }));
    const control = ControlNav.flatMap((g) => g.items).map((i) => ({ path: i.path, label: i.label, area: "Control" as const }));
    const analyze = AnalyzeNav.flatMap((g) => g.items).map((i) => ({ path: i.path, label: i.label, area: "Analyze" as const }));
    const deliver = DeliverNav.flatMap((g) => g.items).map((i) => ({ path: i.path, label: i.label, area: "Deliver" as const }));
    return uniqBy([...track, ...control, ...analyze, ...deliver], (p) => p.path).sort((a, b) => a.path.localeCompare(b.path));
  }, []);

  useEffect(() => {
    const initial: Record<string, { view: boolean; edit: boolean; delete: boolean }> = {};
    for (const p of allPages) initial[p.path] = { view: false, edit: false, delete: false };
    setRolePermDraft(initial);

    if (mode !== "edit" || !editingId) {
      setRoleDraft({ name: "", description: "", status: "active", roleLevel: 100, standardRoleKey: "" });
      return;
    }

    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const body = await rbacApiJson("/rbac/roles", { method: "GET" }, { tenantRequired: true });
        const roles = Array.isArray(body?.roles) ? (body.roles as RbacRole[]) : [];
        const perms = Array.isArray(body?.permissions) ? (body.permissions as RolePermRow[]) : [];
        const role =
          roles.find((r) => r.id === editingId) ??
          roles.find((r) => String(r.id ?? "").toLowerCase() === editingId.toLowerCase());
        if (!role) throw new Error("Role not found");
        if (cancelled) return;
        setRoleDraft({
          name: roleDisplayName(role),
          description: String(role.description ?? ""),
          status: role.status || "active",
          roleLevel: Number(role.roleLevel ?? 100) || 100,
          standardRoleKey: String(role.standardRoleKey ?? "")
        });
        const next = { ...initial };
        for (const row of perms.filter((p) => p.roleId === role.id)) {
          next[String(row.pagePath)] = {
            view: Number(row.canView) === 1,
            edit: Number(row.canEdit) === 1,
            delete: Number(row.canDelete) === 1
          };
        }
        setRolePermDraft(next);
      } catch (e: any) {
        showToast(sanitizeFeedbackLabel(String(e?.message ?? e), "Unable to load this role."), "error");
        navigate(ROLES_PATH);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, editingId, allPages, navigate]);

  const saveRole = async () => {
    if (!canEdit) {
      showToast("You do not have permission to edit roles.", "error");
      return;
    }
    setBusy(true);
    let feedbackStarted = false;
    const isCreate = mode === "create";
    try {
      const permissions = Object.entries(rolePermDraft)
        .map(([pagePath, row]) => ({ pagePath, view: Boolean(row.view), edit: Boolean(row.edit), delete: Boolean(row.delete) }))
        .filter((r) => r.view || r.edit || r.delete);
      const payload = {
        name: headingName || roleDraft.name,
        description: roleDraft.description,
        status: roleDraft.status,
        roleLevel: roleDraft.roleLevel,
        permissions
      };
      feedbackStarted = true;
      beginSaving(isCreate ? "Creating role" : "Updating role");
      if (isCreate) {
        await rbacApiJson("/rbac/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }, { tenantRequired: true });
        endSavingDone("Role created");
      } else {
        await rbacApiJson(
          "/rbac/roles",
          { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editingId, ...payload }) },
          { tenantRequired: true }
        );
        endSavingDone("Role updated");
      }
      navigate(ROLES_PATH);
    } catch (e: any) {
      const message = sanitizeFeedbackLabel(String(e?.message ?? e), "Unable to save this role.");
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
          <div className="admin-title">
            {mode === "create" ? "Create role" : headingName ? `Edit role — ${headingName}` : "Edit role"}
          </div>
          <div className="admin-path">Control / User admin / Roles / {mode === "create" ? "Create" : "Edit"}</div>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-btn ghost" onClick={() => navigate(ROLES_PATH)} disabled={busy}>
            Back to roles
          </button>
          <button type="button" className="admin-btn" onClick={() => void saveRole()} disabled={busy || !canEdit || !tenantId}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <section className="admin-panel admin-form-page admin-form-page--wide">
        <div className="admin-form-grid admin-form-grid--wide">
          {mode === "create" && (
            <label className="admin-modal-field">
              Role name
              <input
                value={roleDraft.name}
                onChange={(e) => setRoleDraft((c) => ({ ...c, name: e.target.value }))}
              />
            </label>
          )}

          <div className="admin-modal-field admin-modal-field--permissions" style={{ gap: 12 }}>
            <span>Page permissions</span>
            <div className="admin-permissions">
              {(["Track", "Control", "Analyze", "Deliver"] as const).map((area) => (
                <div key={area} className="admin-permissions-group admin-permissions-group--role">
                  {(() => {
                    const areaPages = allPages.filter((p) => p.area === area);
                    const areaAllChecked =
                      areaPages.length > 0 &&
                      areaPages.every((p) => {
                        const row = rolePermDraft[p.path] ?? { view: false, edit: false, delete: false };
                        return row.view && row.edit && row.delete;
                      });
                    const toggleAreaAll = (checked: boolean) => {
                      setRolePermDraft((current) => {
                        const next = { ...current };
                        for (const page of areaPages) next[page.path] = { view: checked, edit: checked, delete: checked };
                        return next;
                      });
                    };
                    return (
                      <>
                        <div className="admin-permissions-title-row">
                          <div className="admin-permissions-title">{area}</div>
                          <label className="admin-permission-item admin-permission-item--compact">
                            <input
                              type="checkbox"
                              aria-label={`${area} select all permissions`}
                              checked={areaAllChecked}
                              onChange={(e) => toggleAreaAll(e.target.checked)}
                            />
                            <span>All</span>
                          </label>
                        </div>
                        <div className="admin-role-permission-head">
                          <span>Page</span>
                          <span>View</span>
                          <span>Edit</span>
                          <span>Delete</span>
                        </div>
                        <div className="admin-permissions-list admin-permissions-list--role">
                          {areaPages.map((p) => {
                            const row = rolePermDraft[p.path] ?? { view: false, edit: false, delete: false };
                            const onToggle = (key: Action, checked: boolean) => {
                              const next = { ...row, [key]: checked } as any;
                              if ((key === "edit" || key === "delete") && checked) next.view = true;
                              setRolePermDraft((c) => ({ ...c, [p.path]: next }));
                            };
                            return (
                              <div key={p.path} className="admin-role-permission-row">
                                <span className="admin-role-permission-page">{p.label}</span>
                                <span className="admin-role-permission-cell">
                                  <input type="checkbox" aria-label={`${p.label} view`} checked={row.view} onChange={(e) => onToggle("view", e.target.checked)} />
                                </span>
                                <span className="admin-role-permission-cell">
                                  <input type="checkbox" aria-label={`${p.label} edit`} checked={row.edit} onChange={(e) => onToggle("edit", e.target.checked)} />
                                </span>
                                <span className="admin-role-permission-cell">
                                  <input type="checkbox" aria-label={`${p.label} delete`} checked={row.delete} onChange={(e) => onToggle("delete", e.target.checked)} />
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
