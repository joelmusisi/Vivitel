const apiBase = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? "";
const defaultTenantId = "demo-tenant";

export const getTenantId = () => {
  if (typeof window === "undefined") return defaultTenantId;
  return window.localStorage.getItem("vivi.tenantId") ?? defaultTenantId;
};

const buildUrl = (path: string) => {
  if (!apiBase) return path;
  return `${apiBase.replace(/\/$/, "")}${path}`;
};

export async function saveToApi(key: string, payload: unknown): Promise<boolean> {
  try {
    const response = await fetch(buildUrl(`/kv/${encodeURIComponent(key)}`), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload ?? {})
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const response = await fetch(buildUrl(path), {
      ...options,
      headers: {
        "content-type": "application/json",
        "x-tenant-id": getTenantId(),
        ...(options.headers ?? {})
      }
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getAssetsFromApi<T = unknown>(): Promise<T[]> {
  const response = await fetchJson<{ assets: T[] }>("/d1/assets");
  return response?.assets ?? [];
}

export async function upsertAssetToApi(payload: unknown): Promise<boolean> {
  const response = await fetchJson<{ stored: boolean }>("/d1/assets", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  return Boolean(response?.stored);
}

export async function getDeviceReportingSettings<T = unknown>(): Promise<T | null> {
  const response = await fetchJson<{ settings: T | null }>("/d1/device-reporting-settings");
  return response?.settings ?? null;
}

export async function saveDeviceReportingSettings(payload: unknown): Promise<boolean> {
  const response = await fetchJson<{ stored: boolean }>("/d1/device-reporting-settings", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  return Boolean(response?.stored);
}

export async function getConfigurationGroups<T = unknown>(): Promise<T[]> {
  const response = await fetchJson<{ groups: T[] }>("/d1/configuration-groups");
  return response?.groups ?? [];
}

export async function saveConfigurationGroup(payload: unknown): Promise<boolean> {
  const response = await fetchJson<{ stored: boolean }>("/d1/configuration-groups", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  return Boolean(response?.stored);
}

export async function deleteConfigurationGroup(id: string): Promise<boolean> {
  const response = await fetchJson<{ deleted: boolean }>(
    `/d1/configuration-groups?id=${encodeURIComponent(id)}`,
    {
      method: "DELETE"
    }
  );
  return Boolean(response?.deleted);
}

export async function getBindings<T = unknown>(type: "notifications" | "locations" | "devices"): Promise<T[]> {
  const response = await fetchJson<{ bindings: T[] }>(`/d1/bindings?type=${type}`);
  return response?.bindings ?? [];
}

export async function saveBinding(
  type: "notifications" | "locations" | "devices",
  payload: unknown
): Promise<boolean> {
  const response = await fetchJson<{ stored: boolean }>(`/d1/bindings?type=${type}` as string, {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  return Boolean(response?.stored);
}

export type RbacUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  assignedRoleId?: string;
  assignedRoleName?: string;
  assignedTenantId?: string;
};

export type RbacRole = {
  id: string;
  name: string;
  description?: string;
  status: string;
};

export type RbacRolePermission = {
  roleId: string;
  pagePath: string;
  canView: number;
};

export type RbacSecurityGroup = {
  id: string;
  name: string;
  description?: string;
  status: string;
  memberCount?: number;
};

export async function getRbacUsers(): Promise<RbacUser[]> {
  const response = await fetchJson<{ users: RbacUser[] }>("/rbac/users");
  return response?.users ?? [];
}

export async function createRbacUser(payload: {
  name: string;
  email: string;
  roleId: string;
  status?: string;
}): Promise<RbacUser | null> {
  const response = await fetchJson<{ ok: boolean; user: RbacUser }>("/rbac/users", {
    method: "POST",
    body: JSON.stringify({ ...payload, assignment: { tenantId: getTenantId() } })
  });
  return response?.user ?? null;
}

export async function updateRbacUser(payload: {
  id: string;
  name: string;
  email: string;
  roleId: string;
  status?: string;
}): Promise<RbacUser | null> {
  const response = await fetchJson<{ ok: boolean; user: RbacUser }>("/rbac/users", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return response?.user ?? null;
}

export async function getRbacRoles(): Promise<{ roles: RbacRole[]; permissions: RbacRolePermission[] }> {
  const response = await fetchJson<{ roles: RbacRole[]; permissions: RbacRolePermission[] }>("/rbac/roles");
  return { roles: response?.roles ?? [], permissions: response?.permissions ?? [] };
}

export async function saveRbacRole(
  payload: {
    id?: string;
    name: string;
    description?: string;
    status?: string;
    permissions?: Array<{ pagePath: string; view?: boolean }>;
  },
  isEdit: boolean
): Promise<RbacRole | null> {
  const response = await fetchJson<{ ok: boolean; role: RbacRole }>("/rbac/roles", {
    method: isEdit ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
  return response?.role ?? null;
}

export async function getRbacSecurityGroups(): Promise<RbacSecurityGroup[]> {
  const response = await fetchJson<{ groups: RbacSecurityGroup[] }>("/rbac/security-groups");
  return response?.groups ?? [];
}

export async function saveRbacSecurityGroup(
  payload: { id?: string; name: string; description?: string; status?: string },
  isEdit: boolean
): Promise<RbacSecurityGroup | null> {
  const response = await fetchJson<{ ok: boolean; group: RbacSecurityGroup }>("/rbac/security-groups", {
    method: isEdit ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
  return response?.group ?? null;
}
