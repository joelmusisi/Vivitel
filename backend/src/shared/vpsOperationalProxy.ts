/**
 * Proxy operational (non-credential) API traffic from the Cloudflare Worker
 * to the origin VPS (SQLite / Valkey / B2). Never write these rows to D1.
 */

export type VpsProxyEnv = {
  VPS_ORIGIN?: string;
  ORIGIN_SERVER_URL?: string;
  API_KEY?: string;
  API_KEY_PERMANENT?: string;
  DEVICE_SERVER_DOMAIN?: string;
  /** Hostname Workers can resolve to the VPS (must not be a bare IP). */
  VPS_HOSTNAME?: string;
  VPS_PORT?: string;
  VPS_PROTOCOL?: string;
};

/** Paths whose storage belongs on the VPS (SQLite) / B2 — not Cloudflare D1. */
export const OPERATIONAL_D1_PATH_PREFIXES = [
  "/d1/assets",
  "/d1/bindings",
  "/d1/configuration-groups",
  "/d1/device-reporting-settings",
  "/d1/cameras",
  "/d1/trips",
  "/d1/warehouses"
] as const;

export function isOperationalD1Path(pathname: string): boolean {
  const path = String(pathname ?? "").trim();
  const traccarImportPath = "/d1/assets/import-traccar";
  if (path === traccarImportPath || path.startsWith(`${traccarImportPath}?`)) return false;
  return OPERATIONAL_D1_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)
  );
}

/**
 * Resolve the VPS HTTP origin. Workers cannot fetch bare IPs — use a DNS name.
 * Prefer VPS_ORIGIN / ORIGIN_SERVER_URL; else build from VPS_HOSTNAME.
 */
export function resolveVpsOrigin(env: VpsProxyEnv): string {
  const explicit = String(env.VPS_ORIGIN ?? env.ORIGIN_SERVER_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (explicit) {
    if (/^https?:\/\/(\d{1,3}\.){3}\d{1,3}/i.test(explicit)) return "";
    return explicit;
  }
  const host = String(env.VPS_HOSTNAME ?? "").trim();
  if (!host || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return "";
  const protocolRaw = String(env.VPS_PROTOCOL ?? "http").trim().toLowerCase();
  const protocol = protocolRaw === "https" ? "https" : "http";
  const port = Number(env.VPS_PORT ?? 8787);
  const includePort =
    Number.isFinite(port) &&
    port > 0 &&
    !((protocol === "http" && port === 80) || (protocol === "https" && port === 443));
  return `${protocol}://${host}${includePort ? `:${Math.floor(port)}` : ""}`;
}

function workerApiKey(env: VpsProxyEnv): string {
  return String(env.API_KEY ?? env.API_KEY_PERMANENT ?? "").trim();
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "cf-connecting-ip",
  "cf-ray",
  "cf-visitor",
  "cf-ipcountry",
  "x-forwarded-for",
  "x-forwarded-proto",
  "content-length"
]);

/** Forward an operational request to the VPS; returns null when VPS origin is not configured. */
export async function proxyOperationalRequestToVps(
  request: Request,
  env: VpsProxyEnv,
  options?: { pathname?: string; search?: string; useServiceKey?: boolean }
): Promise<Response | null> {
  const origin = resolveVpsOrigin(env);
  if (!origin) return null;

  const url = new URL(request.url);
  const pathname = String(options?.pathname ?? url.pathname).trim() || "/";
  const search = options?.search !== undefined ? options.search : url.search;
  const target = `${origin}${pathname}${search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.set(key, value);
  });
  const apiKey = workerApiKey(env);
  if (apiKey && (options?.useServiceKey || !headers.get("x-api-key"))) {
    headers.set("x-api-key", apiKey);
    if (options?.useServiceKey) headers.delete("authorization");
  }
  headers.set("x-vivi-forwarded-by", "cloudflare-worker");

  const method = String(request.method ?? "GET").toUpperCase();
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    outHeaders.set(key, value);
  });
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}

export async function readHierarchyFromVps(env: VpsProxyEnv, region: string): Promise<unknown | null> {
  const origin = resolveVpsOrigin(env);
  if (!origin) throw new Error("VPS origin is not configured for hierarchy storage.");

  const headers = new Headers({ "x-vivi-region": region, "x-vivi-forwarded-by": "cloudflare-worker" });
  const apiKey = workerApiKey(env);
  if (apiKey) headers.set("x-api-key", apiKey);
  const response = await fetch(`${origin}/operational/hierarchy`, { headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`VPS hierarchy read failed (${response.status}): ${text.slice(0, 300)}`);
  let result: { hierarchy?: unknown } | null;
  try {
    result = text ? (JSON.parse(text) as { hierarchy?: unknown } | null) : null;
  } catch {
    throw new Error("VPS hierarchy store returned invalid JSON.");
  }
  if (!result || !Object.prototype.hasOwnProperty.call(result, "hierarchy")) {
    throw new Error("VPS hierarchy store returned an unexpected response.");
  }
  return result.hierarchy ?? null;
}

export async function writeHierarchyToVps(
  env: VpsProxyEnv,
  region: string,
  hierarchy: unknown
): Promise<void> {
  const origin = resolveVpsOrigin(env);
  if (!origin) throw new Error("VPS origin is not configured for hierarchy storage.");

  const headers = new Headers({
    "content-type": "application/json",
    "x-vivi-region": region,
    "x-vivi-forwarded-by": "cloudflare-worker"
  });
  const apiKey = workerApiKey(env);
  if (apiKey) headers.set("x-api-key", apiKey);
  const response = await fetch(`${origin}/operational/hierarchy`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ hierarchy })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`VPS hierarchy write failed (${response.status}): ${text.slice(0, 300)}`);

  let result: { stored?: boolean } | null = null;
  try {
    result = text ? (JSON.parse(text) as { stored?: boolean }) : null;
  } catch {
    throw new Error("VPS hierarchy store returned invalid JSON after write.");
  }
  if (!result?.stored) throw new Error("VPS hierarchy store did not confirm the write.");
}

export async function readRealtimeStateFromVps(
  env: VpsProxyEnv,
  tenantId: string,
  key: string
): Promise<string | null> {
  const result = await requestRealtimeState(env, tenantId, key, "GET");
  if (!result.ok) {
    throw new Error(`VPS realtime state read failed (${result.status}).`);
  }
  const body = result.body as { value?: unknown } | null;
  return typeof body?.value === "string" ? body.value : null;
}

export async function listRealtimeStateKeysFromVps(
  env: VpsProxyEnv,
  tenantId: string,
  prefix: string
): Promise<string[]> {
  const origin = resolveVpsOrigin(env);
  if (!origin) throw new Error("VPS origin is not configured for realtime state.");
  const response = await fetch(
    `${origin}/operational/realtime/state/keys?tenant=${encodeURIComponent(tenantId)}&prefix=${encodeURIComponent(prefix)}`,
    { headers: realtimeHeaders(env, tenantId) }
  );
  if (!response.ok) throw new Error(`VPS realtime key list failed (${response.status}).`);
  const body = (await response.json().catch(() => null)) as { keys?: unknown } | null;
  return Array.isArray(body?.keys) ? body.keys.map((key) => String(key)) : [];
}

export async function writeRealtimeStateToVps(
  env: VpsProxyEnv,
  tenantId: string,
  key: string,
  value: string,
  expiresAt?: string
): Promise<void> {
  const result = await requestRealtimeState(env, tenantId, key, "PUT", { value, expiresAt });
  if (!result.ok || (result.body as { stored?: unknown } | null)?.stored !== true) {
    throw new Error(`VPS realtime state write failed (${result.status}).`);
  }
}

export async function listRealtimePresenceFromVps(
  env: VpsProxyEnv,
  tenantId: string
): Promise<Record<string, string>> {
  const origin = resolveVpsOrigin(env);
  if (!origin) throw new Error("VPS origin is not configured for realtime state.");
  const headers = realtimeHeaders(env, tenantId);
  const response = await fetch(
    `${origin}/operational/realtime/presence?tenant=${encodeURIComponent(tenantId)}`,
    { headers }
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`VPS presence read failed (${response.status}): ${text.slice(0, 300)}`);
  let result: { presence?: unknown };
  try {
    result = JSON.parse(text) as { presence?: unknown };
  } catch {
    throw new Error("VPS presence store returned invalid JSON.");
  }
  if (!result.presence || typeof result.presence !== "object" || Array.isArray(result.presence)) {
    throw new Error("VPS presence store returned an unexpected response.");
  }
  return result.presence as Record<string, string>;
}

async function requestRealtimeState(
  env: VpsProxyEnv,
  tenantId: string,
  key: string,
  method: "GET" | "PUT",
  body?: { value: string; expiresAt?: string }
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const origin = resolveVpsOrigin(env);
  if (!origin) throw new Error("VPS origin is not configured for realtime state.");
  const headers = realtimeHeaders(env, tenantId);
  let url: string;
  try {
    url = `${origin}/operational/realtime/state?tenant=${encodeURIComponent(tenantId)}&key=${encodeURIComponent(key)}`;
  } catch {
    throw new Error("Invalid realtime state key.");
  }
  const response = await fetch(url, {
    method,
    headers: (() => {
      const requestHeaders = new Headers(headers);
      if (method === "PUT") requestHeaders.set("content-type", "application/json");
      return requestHeaders;
    })(),
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let result: unknown = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("VPS realtime state store returned invalid JSON.");
  }
  return { ok: response.ok, status: response.status, body: result };
}

function realtimeHeaders(env: VpsProxyEnv, tenantId: string): Headers {
  const headers = new Headers({
    "x-tenant-id": tenantId,
    "x-vivi-forwarded-by": "cloudflare-worker"
  });
  const apiKey = workerApiKey(env);
  if (apiKey) headers.set("x-api-key", apiKey);
  return headers;
}

export async function notifyRealtimeOnVps(
  env: VpsProxyEnv,
  tenantId: string,
  type: "support" | "presence" | "catalog" | "live",
  payload?: unknown
): Promise<void> {
  const origin = resolveVpsOrigin(env);
  if (!origin) throw new Error("VPS origin is not configured for realtime notifications.");
  const response = await fetch(`${origin}/operational/realtime/notify/${type}`, {
    method: "POST",
    headers: (() => {
      const headers = realtimeHeaders(env, tenantId);
      headers.set("content-type", "application/json");
      return headers;
    })(),
    body: JSON.stringify(payload ?? {})
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`VPS realtime notification failed (${response.status}): ${text.slice(0, 300)}`);
  }
}

const ENTITY_LIST_PATH: Record<string, string> = {
  assets: "/d1/assets",
  cameras: "/d1/cameras",
  trips: "/d1/trips",
  warehouses: "/d1/warehouses",
  configuration_groups: "/d1/configuration-groups"
};

const ENTITY_LIST_FIELD: Record<string, string> = {
  assets: "assets",
  cameras: "cameras",
  trips: "trips",
  warehouses: "warehouses",
  configuration_groups: "groups"
};

async function vpsJson<T>(
  env: VpsProxyEnv,
  path: string,
  init: RequestInit & { tenantId: string }
): Promise<{ ok: boolean; status: number; body: T | null }> {
  const origin = resolveVpsOrigin(env);
  if (!origin) return { ok: false, status: 503, body: null };
  const headers = new Headers(init.headers ?? {});
  headers.set("content-type", "application/json");
  headers.set("x-tenant-id", init.tenantId);
  const apiKey = workerApiKey(env);
  if (apiKey) headers.set("x-api-key", apiKey);
  headers.set("x-vivi-forwarded-by", "cloudflare-worker");
  try {
    const resp = await fetch(`${origin}${path}`, { ...init, headers });
    const text = await resp.text();
    let body: T | null = null;
    try {
      body = text ? (JSON.parse(text) as T) : null;
    } catch {
      body = null;
    }
    return { ok: resp.ok, status: resp.status, body };
  } catch {
    return { ok: false, status: 502, body: null };
  }
}

/** List operational entities from VPS SQLite. Returns null if VPS is unreachable/unconfigured. */
export async function listEntitiesFromVps(
  env: VpsProxyEnv,
  table: string,
  tenantId: string
): Promise<Record<string, unknown>[] | null> {
  const path = ENTITY_LIST_PATH[table];
  const field = ENTITY_LIST_FIELD[table];
  if (!path || !field) return null;
  const result = await vpsJson<Record<string, unknown>>(env, path, { method: "GET", tenantId });
  if (!result.ok || !result.body) return null;
  const rows = (result.body as any)?.[field];
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

export async function upsertEntityOnVps(
  env: VpsProxyEnv,
  table: string,
  tenantId: string,
  body: Record<string, unknown>
): Promise<{ ok: true; id: string } | { ok: false; message: string } | null> {
  const path = ENTITY_LIST_PATH[table];
  if (!path) return null;
  const result = await vpsJson<{ stored?: boolean; id?: string; error?: string }>(env, path, {
    method: "POST",
    tenantId,
    body: JSON.stringify(body)
  });
  if (result === null) return null;
  if (!result.ok) {
    return {
      ok: false,
      message: String((result.body as any)?.error ?? `Origin server rejected ${table} write (${result.status}).`)
    };
  }
  const id = String((result.body as any)?.id ?? body.id ?? "").trim();
  if (!id) return { ok: false, message: "Origin server did not return an id." };
  return { ok: true, id };
}

export async function deleteEntityOnVps(
  env: VpsProxyEnv,
  table: string,
  tenantId: string,
  id: string
): Promise<boolean | null> {
  const path = ENTITY_LIST_PATH[table];
  if (!path) return null;
  const result = await vpsJson<{ deleted?: boolean }>(env, `${path}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    tenantId
  });
  if (!result.ok && result.status === 503) return null;
  return Boolean((result.body as any)?.deleted);
}

export async function listBindingsFromVps(
  env: VpsProxyEnv,
  tenantId: string,
  type: string
): Promise<Record<string, unknown>[] | null> {
  const result = await vpsJson<{ bindings?: Record<string, unknown>[] }>(
    env,
    `/d1/bindings?type=${encodeURIComponent(type)}`,
    { method: "GET", tenantId }
  );
  if (!result.ok || !result.body) return null;
  return Array.isArray(result.body.bindings) ? result.body.bindings : [];
}
