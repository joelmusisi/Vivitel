const env = (import.meta as any).env ?? {};
const apiBase = ((env.VITE_API_BASE_URL ?? env.VITE_API_BASE) as string | undefined) ?? "";
const defaultTenantId = "demo-tenant";

export const getTenantId = () => {
  if (typeof window === "undefined") return defaultTenantId;
  return window.localStorage.getItem("vivi.tenantId") ?? defaultTenantId;
};

export const getApiBaseUrl = () => apiBase.replace(/\/$/, "");

export const getApiKey = () => {
  const envKey = String((env.VITE_API_KEY ?? env.VITE_VIVITEL_API_KEY) as string | undefined ?? "").trim();
  if (envKey) return envKey;
  if (typeof window === "undefined") return "";
  const keys = ["vivi.apiKey", "vivi.auth.apiKey", "vivi.adminApiKey", "vivi.token"];
  for (const key of keys) {
    const value = String(window.localStorage.getItem(key) ?? "").trim();
    if (value) return value;
  }
  return "";
};

export const buildApiUrl = (path: string) => {
  if (!apiBase) return path;
  return `${apiBase.replace(/\/$/, "")}${path}`;
};

const headersFor = (tenantId: string | null = getTenantId(), json = true): HeadersInit => {
  const apiKey = getApiKey();
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    ...(tenantId ? { "x-tenant-id": tenantId } : {}),
    ...(apiKey ? { "x-api-key": apiKey } : {})
  };
};

const readJsonSafely = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

export async function saveToApi(key: string, payload: unknown): Promise<boolean> {
  try {
    const response = await fetch(buildApiUrl(`/kv/${encodeURIComponent(key)}`), {
      method: "POST",
      headers: headersFor(),
      body: JSON.stringify(payload ?? {})
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const response = await fetch(buildApiUrl(path), {
      ...options,
      headers: {
        ...headersFor(),
        ...(options.headers ?? {})
      }
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchDetailed<T>(
  path: string,
  options: RequestInit = {},
  tenantId: string | null = getTenantId()
): Promise<{ ok: boolean; status: number; body: T | null; error?: string }> {
  try {
    const response = await fetch(buildApiUrl(path), {
      ...options,
      headers: {
        ...headersFor(tenantId),
        ...(options.headers ?? {})
      }
    });
    const body = (await readJsonSafely(response)) as T | null;
    return {
      ok: response.ok,
      status: response.status,
      body,
      error: response.ok ? undefined : String((body as any)?.error ?? (body as any)?.message ?? response.statusText)
    };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getAssetsFromApi<T = unknown>(): Promise<T[]> {
  const response = await fetchJson<{ assets: T[] }>("/d1/assets");
  return response?.assets ?? [];
}

export async function getAssetsFromApiForTenant<T = unknown>(tenantId: string | null): Promise<T[]> {
  const response = await fetchJson<{ assets: T[] }>("/d1/assets", {
    headers: headersFor(tenantId)
  });
  return response?.assets ?? [];
}

export async function upsertAssetToApi(payload: unknown): Promise<boolean> {
  const response = await fetchJson<{ stored: boolean }>("/d1/assets", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  return Boolean(response?.stored);
}

export async function upsertAssetDetailed(
  payload: unknown
): Promise<{ stored: boolean; source: "server" | "local"; status?: number; body?: any; error?: string }> {
  const result = await fetchDetailed<any>("/d1/assets", {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
  if (result.ok && result.body?.stored) return { stored: true, source: "server", status: result.status, body: result.body };
  if (result.status === 0 && typeof window !== "undefined") {
    const tenantId = getTenantId();
    const key = tenantId ? `vivi.assets:${tenantId}` : "vivi.assets";
    const current = JSON.parse(window.localStorage.getItem(key) || "[]") as any[];
    const incoming = (payload ?? {}) as any;
    const id = String(incoming.id ?? incoming.registration ?? incoming.imei ?? Date.now()).trim();
    const next = [{ ...incoming, id }, ...current.filter((item) => String(item?.id ?? "") !== id)];
    window.localStorage.setItem(key, JSON.stringify(next));
    window.localStorage.setItem("vivi.assets", JSON.stringify(next));
    return { stored: true, source: "local", body: { stored: true, id } };
  }
  return { stored: false, source: "server", status: result.status, body: result.body, error: result.error };
}

export async function upsertAssetDetailedForTenant(
  payload: unknown,
  tenantId: string | null
): Promise<{ stored: boolean; source: "server"; status?: number; body?: any; error?: string }> {
  const result = await fetchDetailed<any>(
    "/d1/assets",
    {
      method: "POST",
      body: JSON.stringify(payload ?? {})
    },
    tenantId
  );
  return {
    stored: Boolean(result.ok && result.body?.stored),
    source: "server",
    status: result.status,
    body: result.body,
    error: result.error
  };
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

export type SiteTimeZoneSettings = {
  defaultTimeZone?: string;
  sites?: Record<string, string>;
};

export async function getSiteTimeZoneSettings(): Promise<SiteTimeZoneSettings | null> {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("vivi.siteTimeZones");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SiteTimeZoneSettings) : null;
  } catch {
    return null;
  }
}

export function resolveTimeZoneForSite(site: string, settings: SiteTimeZoneSettings | null): string {
  const fallback = settings?.defaultTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const sites = settings?.sites ?? {};
  return sites[site] || sites[site.trim().toLowerCase()] || fallback;
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

export async function loadFromApi<T = unknown>(key: string): Promise<T | null> {
  return fetchJson<T>(`/kv/${encodeURIComponent(key)}`);
}

export async function getCamerasFromApi<T = unknown>(): Promise<T[]> {
  const response = await fetchJson<{ cameras: T[] }>("/d1/cameras");
  return response?.cameras ?? [];
}

export async function telemetryLookupByImeiDetailed(
  imei: string
): Promise<{ ok: boolean; status?: number; body?: any; error?: string }> {
  const params = new URLSearchParams({ imei, refreshLive: "1" });
  const result = await fetchDetailed<any>(`/telemetry/lookup?${params.toString()}`);
  return { ok: result.ok, status: result.status, body: result.body, error: result.error };
}

export async function getTelemetryHistory(params: {
  imei?: string;
  assetId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<{ ok: boolean; status?: number; body?: any; error?: string }> {
  const query = new URLSearchParams();
  if (params.imei) query.set("imei", params.imei);
  if (params.assetId) query.set("assetId", params.assetId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.limit) query.set("limit", String(params.limit));
  const result = await fetchDetailed<any>(`/telemetry/history?${query.toString()}`);
  return { ok: result.ok, status: result.status, body: result.body, error: result.error };
}

export async function confirmTelemetryForImei(
  imei: string
): Promise<{ ok: boolean; received: boolean; lastAt?: string; status?: number; body?: any; error?: string }> {
  const lookup = await telemetryLookupByImeiDetailed(imei);
  const latestAt = String(
    lookup.body?.latest?.at ?? lookup.body?.events?.[0]?.created_at ?? lookup.body?.events?.[0]?.createdAt ?? ""
  ).trim();
  return {
    ok: lookup.ok,
    received: lookup.ok && Boolean(latestAt),
    lastAt: latestAt || undefined,
    status: lookup.status,
    body: lookup.body,
    error: lookup.error
  };
}

export async function pushDeviceSettings(imei: string): Promise<{ queued: boolean; id?: string; error?: string }> {
  const result = await fetchDetailed<any>("/device/push-settings", {
    method: "POST",
    body: JSON.stringify({ imei })
  });
  return {
    queued: Boolean(result.ok && result.body?.queued),
    id: String(result.body?.id ?? ""),
    error: result.error
  };
}

export async function kickAvlSocket(imei: string, command?: string): Promise<{ queued: boolean; error?: string }> {
  const result = await fetchDetailed<any>("/device/kick-avl", {
    method: "POST",
    body: JSON.stringify({ imei, ...(command ? { command } : {}) })
  });
  return {
    queued: Boolean(result.ok && result.body?.queued),
    error: result.error
  };
}

export async function commissionDeviceDetailed(
  imei: string
): Promise<{ queued: boolean; id?: string; kickQueued?: boolean; kickError?: string; error?: string }> {
  const pushed = await pushDeviceSettings(imei);
  if (!pushed.queued) return { queued: false, error: pushed.error ?? "Unable to queue device settings." };
  const kicked = await kickAvlSocket(imei);
  return {
    queued: true,
    id: pushed.id,
    kickQueued: kicked.queued,
    kickError: kicked.queued ? undefined : kicked.error
  };
}

export async function getDeviceDetails(deviceId: string): Promise<{ ok: boolean; status?: number; body?: any; error?: string }> {
  const result = await fetchDetailed<any>(`/device/${encodeURIComponent(deviceId)}`, {
    method: "GET"
  });
  return { ok: result.ok, status: result.status, body: result.body, error: result.error };
}

export async function sendDeviceCommand(
  deviceId: string,
  command: string,
  payload: Record<string, unknown> = {}
): Promise<{ ok: boolean; status?: number; body?: any; error?: string }> {
  const result = await fetchDetailed<any>(`/device/${encodeURIComponent(deviceId)}/command`, {
    method: "POST",
    body: JSON.stringify({ command, ...payload })
  });
  return { ok: result.ok, status: result.status, body: result.body, error: result.error };
}

export function canForPath(_path: string, _action: "view" | "edit" | "delete" | string): boolean {
  return true;
}
