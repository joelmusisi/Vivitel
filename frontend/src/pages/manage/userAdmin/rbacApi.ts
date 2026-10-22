import { buildApiUrl, getApiKey, getTenantId } from "../../../utils/api";
import { STANDARD_ROLES, isStandardRoleName } from "../../../utils/standardRoles";
import type { RbacRole, RbacUser } from "./types";

function looksLikeRawId(value: string): boolean {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const compact = text.replace(/[\s-]/g, "");
  return /^[0-9a-f]{8}[- ]?[0-9a-f]{4}[- ]?[0-9a-f]{4}[- ]?[0-9a-f]{4}[- ]?[0-9a-f]{12}$/i.test(text) || /^[0-9a-f]{32}$/i.test(compact);
}

function readApiErrorMessage(res: Response, text: string, body: any): string {
  const jsonMessage = String(body?.error || body?.message || "").trim();
  if (jsonMessage && !looksLikeRawId(jsonMessage)) return jsonMessage;

  const raw = String(text ?? "").trim();
  const looksLikeHtml = /<!DOCTYPE html|<html[\s>]|cf-error-details|Cloudflare/i.test(raw);
  if (looksLikeHtml || /Error 110[12]/i.test(raw) || /Worker exceeded resource limits/i.test(raw)) {
    if (/1102|exceeded resource limits/i.test(raw)) {
      return "The server ran out of time loading roles. Please retry.";
    }
    if (/1101/i.test(raw)) {
      return "The server hit a worker error loading this page. Please retry.";
    }
    return `The server returned an error (${res.status || 502}). Please retry.`;
  }
  if (looksLikeRawId(raw)) return `The server returned an error (${res.status || 502}). Please retry.`;
  return raw || `HTTP ${res.status}`;
}

export const USER_EXISTS_POPUP = "User exist";

export class RbacApiError extends Error {
  status: number;
  existingId: string;
  body: any;
  constructor(message: string, status: number, body?: any) {
    super(message);
    this.name = "RbacApiError";
    this.status = status;
    this.body = body ?? null;
    this.existingId = String(body?.existingId ?? "").trim();
  }
}

export function isDuplicateUserEmailError(message: string): boolean {
  const text = String(message ?? "").trim().toLowerCase();
  return (
    text.includes("user email exists") ||
    text.includes("user already exists") ||
    text.includes("user exist") ||
    /unique constraint failed:\s*rbac_users\.email/i.test(text)
  );
}

export async function rbacApiJson(path: string, init: RequestInit, opts?: { tenantRequired?: boolean; tenantId?: string }) {
  const initialApiKey = getApiKey();
  const tenantId = getTenantId();
  const tenantHeaderId = String(opts?.tenantId ?? tenantId ?? "").trim();
  if (!initialApiKey) throw new Error("Not logged in");
  if (opts?.tenantRequired && !tenantHeaderId) throw new Error("Select organisation first.");
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      ...(tenantHeaderId ? { "x-tenant-id": tenantHeaderId } : {}),
      "x-api-key": initialApiKey,
      ...(init.headers ?? {})
    }
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new RbacApiError(readApiErrorMessage(res, text, body), res.status, body);
  }
  return body;
}

export function recoverUserAdminTenantId() {
  const direct = String(getTenantId() ?? "").trim();
  const partsOf = (value: string) => value.split(":").map((part) => part.trim()).filter(Boolean);
  if (partsOf(direct).length >= 3) return direct;
  if (typeof window === "undefined") return direct;
  const fromIds = [
    window.localStorage.getItem("vivi.activeDealerId"),
    window.localStorage.getItem("vivi.activeOrgId"),
    window.localStorage.getItem("vivi.activeDbId")
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (fromIds.length >= 3) return fromIds.join(":");
  return direct;
}

export function pickRbacUserFromResponse(body: unknown, userId: string): RbacUser | null {
  const wanted = String(userId ?? "").trim();
  if (!wanted || !body || typeof body !== "object") return null;
  const payload = body as { user?: unknown; users?: unknown };
  const asUser = (value: unknown): RbacUser | null => {
    if (!value || typeof value !== "object") return null;
    const row = value as RbacUser;
    const id = String(row.id ?? "").trim();
    if (id && id !== wanted) return null;
    const name = String(row.name ?? "").trim();
    const email = String(row.email ?? "").trim();
    if (!id && !name && !email) return null;
    return { ...row, id: id || wanted, name, email, status: String(row.status ?? "active") };
  };
  const direct = asUser(payload.user);
  if (direct) return direct;
  const list = Array.isArray(payload.users) ? payload.users : [];
  return list.map(asUser).find((row) => row?.id === wanted) ?? null;
}

export const uniqStrings = (values: Array<string | undefined>) =>
  Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));

export const parseIdList = (value: unknown) => {
  if (Array.isArray(value)) return uniqStrings(value.map((item) => String(item ?? "").trim()));
  return uniqStrings(String(value ?? "").split(",").map((item) => item.trim()));
};

export const formatLastLogin = (value?: string) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString();
};

export const toRolePickerRow = (role: RbacRole) => ({
  ...role,
  isSystem: typeof role.isSystem === "number" ? role.isSystem > 0 : role.isSystem
});

export async function resolveRoleIdAcrossTenants(input: {
  roleId: string;
  roleName?: string;
  tenantIds: string[];
}): Promise<{ roleId: string; tenantId: string } | null> {
  const roleId = String(input.roleId ?? "").trim();
  if (!roleId) return null;
  const standardFromKey = STANDARD_ROLES.find((row) => row.key === roleId)?.name ?? "";
  const normalizedRoleName = String(input.roleName ?? standardFromKey ?? "").trim().toLowerCase();
  const tenantIds = Array.from(new Set(input.tenantIds.map((value) => String(value ?? "").trim()).filter(Boolean)));
  for (const tenantId of tenantIds) {
    try {
      const rolesBody = await rbacApiJson("/rbac/roles", { method: "GET" }, { tenantId });
      const apiRoles = Array.isArray(rolesBody?.roles) ? (rolesBody.roles as RbacRole[]) : [];
      const byId = apiRoles.find((row) => row.id === roleId);
      if (byId?.id) return { roleId: byId.id, tenantId };
      const byKey = apiRoles.find((row) => String(row.standardRoleKey ?? "").trim() === roleId);
      if (byKey?.id) return { roleId: byKey.id, tenantId };
      if (normalizedRoleName) {
        const byName = apiRoles.find((row) => String(row.name ?? "").trim().toLowerCase() === normalizedRoleName);
        if (byName?.id) return { roleId: byName.id, tenantId };
      }
    } catch {
      // try the next tenant scope
    }
  }
  if (normalizedRoleName && isStandardRoleName(normalizedRoleName) && tenantIds[0]) {
    return { roleId, tenantId: tenantIds[0] };
  }
  return null;
}

export const uniqBy = <T,>(items: T[], keyFn: (v: T) => string) => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = keyFn(it);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
};

export const toggleId = (values: string[], id: string) => {
  const nextId = String(id ?? "").trim();
  if (!nextId) return values;
  return values.includes(nextId) ? values.filter((value) => value !== nextId) : [...values, nextId];
};

export const buildSelectedAllocationLabel = (sections: Array<{ label: string; values: string[] }>) => {
  const visible = sections.filter((section) => section.values.length > 0);
  if (!visible.length) return "Nothing selected yet.";
  return visible.map((section) => `${section.label}: ${section.values.join(", ")}`).join(" | ");
};
