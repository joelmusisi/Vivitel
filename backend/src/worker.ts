import { handleRbacRequest } from "./rbac";

export interface Env {
  APP_NAME?: string;
  ViviTEL: KVNamespace;
  VIVI_D1: D1Database;
  STORAGE_BUCKET?: R2Bucket;
  TASK_QUEUE?: Queue;
}

type TokenStatus = "Active" | "Revoked";

interface PersonalAccessToken {
  id: string;
  token: string;
  description: string;
  organisationName: string;
  organisationGroup?: string;
  expiryDate: string;
  status: TokenStatus;
  daysToExpiry: number;
  username: string;
  createdAt: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    }
  });

const notFound = () => json({ error: "Not found" }, 404);
const badRequest = (message: string) => json({ error: message }, 400);
const serviceUnavailable = (data: unknown) => json(data, 503);

const PAT_INDEX_KEY = "pat:index";

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const daysUntil = (date: Date) => Math.max(0, Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

let d1Ready = false;

const ensureD1Tables = async (env: Env) => {
  if (d1Ready) return;
  await env.VIVI_D1.prepare(
    "CREATE TABLE IF NOT EXISTS assets (id TEXT NOT NULL, tenant_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_id))"
  ).run();
  await env.VIVI_D1.prepare(
    "CREATE TABLE IF NOT EXISTS device_reporting_settings (tenant_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)"
  ).run();
  await env.VIVI_D1.prepare(
    "CREATE TABLE IF NOT EXISTS configuration_groups (id TEXT NOT NULL, tenant_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_id))"
  ).run();
  await env.VIVI_D1.prepare(
    "CREATE TABLE IF NOT EXISTS bindings (id TEXT NOT NULL, tenant_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_id, type))"
  ).run();
  d1Ready = true;
};

type ResourceStatus = "ok" | "not_configured" | "error";

const checkKv = async (env: Env) => {
  const key = "health:kv";
  try {
    await env.ViviTEL.put(key, JSON.stringify({ ping: true, at: new Date().toISOString() }), { expirationTtl: 60 });
    const value = await env.ViviTEL.get(key);
    if (!value) return { status: "error" as ResourceStatus, message: "KV read failed" };
    await env.ViviTEL.delete(key);
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
};

const checkD1 = async (env: Env) => {
  try {
    await ensureD1Tables(env);
    await env.VIVI_D1.prepare("SELECT 1 as ok").first();
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
};

const checkBindingsTable = async (env: Env) => {
  try {
    await ensureD1Tables(env);
    await env.VIVI_D1.prepare("SELECT COUNT(*) as count FROM bindings").first();
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
};

const checkStorage = async (env: Env) => {
  if (!env.STORAGE_BUCKET) return { status: "not_configured" as ResourceStatus };
  try {
    await env.STORAGE_BUCKET.list({ limit: 1 });
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
};

const checkQueue = async (env: Env) => {
  if (!env.TASK_QUEUE) return { status: "not_configured" as ResourceStatus };
  try {
    await env.TASK_QUEUE.send({ type: "healthcheck", at: new Date().toISOString() });
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
};

const getTenantId = (request: Request, url: URL) => {
  return (
    request.headers.get("x-tenant-id")?.trim() ||
    url.searchParams.get("tenant")?.trim() ||
    "demo-tenant"
  );
};

async function getPatIndex(env: Env): Promise<string[]> {
  const raw = await env.ViviTEL.get(PAT_INDEX_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

async function setPatIndex(env: Env, ids: string[]) {
  await env.ViviTEL.put(PAT_INDEX_KEY, JSON.stringify(ids));
}

async function readPat(env: Env, id: string): Promise<PersonalAccessToken | null> {
  const raw = await env.ViviTEL.get(`pat:${id}`);
  if (!raw) return null;
  const token = JSON.parse(raw) as PersonalAccessToken;
  const expiry = new Date(token.expiryDate);
  token.daysToExpiry = daysUntil(expiry);
  return token;
}

async function writePat(env: Env, token: PersonalAccessToken) {
  await env.ViviTEL.put(`pat:${token.id}`, JSON.stringify(token));
}

async function listPats(env: Env): Promise<PersonalAccessToken[]> {
  const ids = await getPatIndex(env);
  const tokens: PersonalAccessToken[] = [];
  for (const id of ids) {
    const pat = await readPat(env, id);
    if (pat) tokens.push(pat);
  }
  return tokens;
}

async function createPat(env: Env, input: { description?: string; organisationName?: string; organisationGroup?: string; expiryDays?: number; username?: string }): Promise<PersonalAccessToken> {
  const id = uuid();
  const tokenValue = crypto.randomUUID().replace(/-/g, "");
  const now = new Date();
  const expiryDays = Math.min(Math.max(input.expiryDays ?? 180, 30), 365);
  const expiryDate = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

  const pat: PersonalAccessToken = {
    id,
    token: tokenValue,
    description: input.description ?? "Power BI access",
    organisationName: input.organisationName ?? "Demo Org",
    organisationGroup: input.organisationGroup,
    expiryDate: expiryDate.toISOString(),
    status: "Active",
    daysToExpiry: expiryDays,
    username: input.username ?? "demo-user",
    createdAt: now.toISOString()
  };

  const ids = await getPatIndex(env);
  ids.push(id);
  await writePat(env, pat);
  await setPatIndex(env, ids);
  return pat;
}

async function revokePat(env: Env, id: string): Promise<PersonalAccessToken | null> {
  const pat = await readPat(env, id);
  if (!pat) return null;
  pat.status = "Revoked";
  await writePat(env, pat);
  return pat;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
          "access-control-allow-headers": "content-type, x-tenant-id"
        }
      });
    }

    switch (url.pathname) {
      case "/":
        return json({
          service: env.APP_NAME ?? "Vivi Telematic API",
          routes: [
            "/health",
            "/health/resources",
            "/telemetry/summary",
            "/echo",
            "/kv/:key",
            "/pat",
            "/d1/assets",
            "/d1/device-reporting-settings",
            "/d1/configuration-groups",
            "/d1/bindings",
            "/rbac/users",
            "/rbac/roles",
            "/rbac/security-groups"
          ]
        });
      case "/health":
        return json({ status: "ok", timestamp: new Date().toISOString() });
      case "/health/resources": {
        const [kv, d1, bindings, storage, queue] = await Promise.all([
          checkKv(env),
          checkD1(env),
          checkBindingsTable(env),
          checkStorage(env),
          checkQueue(env)
        ]);
        const hasError = [kv, d1, bindings, storage, queue].some((item) => item.status === "error");
        const payload = {
          status: hasError ? "degraded" : "ok",
          timestamp: new Date().toISOString(),
          kv,
          storage,
          d1,
          bindings,
          queue
        };
        return hasError ? serviceUnavailable(payload) : json(payload);
      }
      case "/telemetry/summary":
        return json({
          vehiclesOnline: 128,
          averageSpeedKph: 63,
          alertsToday: 12,
          fuelBurnRateLph: 18.4
        });
      case "/echo":
        if (request.method !== "POST") {
          return badRequest("Use POST with a JSON payload.");
        }
        try {
          const body = await request.json();
          return json({ received: body, at: new Date().toISOString() });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      case "/pat":
        if (request.method === "GET") {
          const tokens = await listPats(env);
          return json({ tokens });
        }
        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Partial<PersonalAccessToken>;
            const pat = await createPat(env, {
              description: body.description,
              organisationName: body.organisationName,
              organisationGroup: body.organisationGroup,
              expiryDays: body.daysToExpiry,
              username: body.username
            });
            return json({ token: pat });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }
        return badRequest("Unsupported method for /pat");
      case "/d1/assets": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);

        if (request.method === "GET") {
          const result = await env.VIVI_D1.prepare(
            "SELECT data, updated_at FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC"
          )
            .bind(tenantId)
            .all();
          const assets = (result.results ?? []).map((row) => {
            try {
              return JSON.parse(String(row.data));
            } catch {
              return null;
            }
          }).filter(Boolean);
          return json({ assets, tenantId });
        }

        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const id = String(body.id ?? "").trim();
            if (!id) return badRequest("Asset id is required.");
            const now = new Date().toISOString();
            await env.VIVI_D1.prepare(
              "INSERT INTO assets (id, tenant_id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id, tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
            )
              .bind(id, tenantId, JSON.stringify(body), now)
              .run();
            return json({ stored: true, id, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        return badRequest("Unsupported method for /d1/assets");
      }
      case "/d1/device-reporting-settings": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);

        if (request.method === "GET") {
          const result = await env.VIVI_D1.prepare(
            "SELECT data, updated_at FROM device_reporting_settings WHERE tenant_id = ?"
          )
            .bind(tenantId)
            .first();
          if (!result) return json({ settings: null, tenantId });
          try {
            return json({ settings: JSON.parse(String(result.data)), tenantId, updatedAt: result.updated_at });
          } catch {
            return json({ settings: null, tenantId });
          }
        }

        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const now = new Date().toISOString();
            await env.VIVI_D1.prepare(
              "INSERT INTO device_reporting_settings (tenant_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
            )
              .bind(tenantId, JSON.stringify(body), now)
              .run();
            return json({ stored: true, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        return badRequest("Unsupported method for /d1/device-reporting-settings");
      }
      case "/d1/configuration-groups": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);

        if (request.method === "DELETE") {
          const id = (url.searchParams.get("id") ?? "").trim();
          if (!id) return badRequest("Configuration group id is required.");
          const result = await env.VIVI_D1.prepare(
            "DELETE FROM configuration_groups WHERE tenant_id = ? AND id = ?"
          )
            .bind(tenantId, id)
            .run();
          return json({ deleted: (result.meta?.changes ?? 0) > 0, id, tenantId });
        }

        if (request.method === "GET") {
          const result = await env.VIVI_D1.prepare(
            "SELECT data, updated_at FROM configuration_groups WHERE tenant_id = ? ORDER BY updated_at DESC"
          )
            .bind(tenantId)
            .all();
          const groups = (result.results ?? [])
            .map((row) => {
              try {
                return JSON.parse(String(row.data));
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          return json({ groups, tenantId });
        }

        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const id = String(body.id ?? "").trim();
            if (!id) return badRequest("Configuration group id is required.");
            const now = new Date().toISOString();
            await env.VIVI_D1.prepare(
              "INSERT INTO configuration_groups (id, tenant_id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id, tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
            )
              .bind(id, tenantId, JSON.stringify(body), now)
              .run();
            return json({ stored: true, id, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        return badRequest("Unsupported method for /d1/configuration-groups");
      }
      case "/d1/bindings": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);
        const type = (url.searchParams.get("type") ?? "").trim().toLowerCase();
        const allowed = ["notifications", "locations", "devices"];
        if (!allowed.includes(type)) return badRequest("type must be notifications, locations, or devices");

        if (request.method === "GET") {
          const result = await env.VIVI_D1.prepare(
            "SELECT data, updated_at FROM bindings WHERE tenant_id = ? AND type = ? ORDER BY updated_at DESC"
          )
            .bind(tenantId, type)
            .all();
          const bindings = (result.results ?? [])
            .map((row) => {
              try {
                return JSON.parse(String(row.data));
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          return json({ bindings, tenantId, type });
        }

        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const id = String(body.id ?? "").trim();
            if (!id) return badRequest("Binding id is required.");
            const now = new Date().toISOString();
            await env.VIVI_D1.prepare(
              "INSERT INTO bindings (id, tenant_id, type, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id, tenant_id, type) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
            )
              .bind(id, tenantId, type, JSON.stringify(body), now)
              .run();
            return json({ stored: true, id, tenantId, type });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        return badRequest("Unsupported method for /d1/bindings");
      }
      case "/kv":
        return badRequest("Provide a key, e.g. /kv/demo");
      default: {
        await ensureD1Tables(env);
        const rbacResponse = await handleRbacRequest(env, request, url.pathname, getTenantId(request, url));
        if (rbacResponse) return rbacResponse;

        if (url.pathname.startsWith("/pat/") && url.pathname.endsWith("/revoke")) {
          const parts = url.pathname.split("/");
          const id = parts[2];
          const revoked = await revokePat(env, id);
          if (!revoked) return notFound();
          return json({ token: revoked });
        }

        if (url.pathname.startsWith("/kv/")) {
          const key = url.pathname.replace("/kv/", "");
          if (!key) return badRequest("Key is required.");

          if (request.method === "POST") {
            try {
              const body = await request.json();
              await env.ViviTEL.put(key, JSON.stringify(body));
              return json({ stored: true, key });
            } catch {
              return badRequest("Invalid JSON body.");
            }
          }

          const stored = await env.ViviTEL.get(key);
          if (!stored) return notFound();
          return new Response(stored, {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "access-control-allow-origin": "*"
            }
          });
        }
        return notFound();
      }
    }
  }
};
