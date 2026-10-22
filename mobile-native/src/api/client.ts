import { API_BASE_URL } from "../config";
import { getApiKey, getTenantId } from "../storage/session";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  opts?: { tenantId?: string; skipTenant?: boolean }
): Promise<T> {
  const apiKey = await getApiKey();
  const tenantId = opts?.tenantId ?? (opts?.skipTenant ? "" : await getTenantId());
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string> | undefined)
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  if (tenantId) headers["x-tenant-id"] = tenantId;

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const errLabel = String((body as any)?.error ?? "").trim();
    const errDetail = String((body as any)?.message ?? "").trim();
    const message =
      errLabel && errDetail && errLabel !== errDetail
        ? `${errLabel}: ${errDetail}`
        : errLabel || errDetail || `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return body as T;
}
