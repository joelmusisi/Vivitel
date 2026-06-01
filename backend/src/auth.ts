import type { RbacEnv } from "./rbacAccess";
import { buildAccessProfile } from "./rbacAccess";

export interface AuthEnv extends RbacEnv {
  ViviTEL: KVNamespace;
}

const SESSION_PREFIX = "auth:session:";
const SESSION_TTL_SEC = 60 * 60 * 12;

const corsHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*"
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders });

const badRequest = (message: string) => json({ error: message }, 400);
const unauthorized = (message = "Unauthorized") => json({ error: message }, 401);

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const listUsers = async (env: AuthEnv) => {
  const result = await env.VIVI_D1.prepare(
    "SELECT data FROM bindings WHERE type = ?1 AND tenant_id = ?2"
  )
    .bind("rbac_users", "_global")
    .all();
  return (result.results ?? [])
    .map((row) => {
      try {
        return JSON.parse(String(row.data)) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Record<string, unknown>[];
};

export async function resolveUserIdFromRequest(env: AuthEnv, request: Request): Promise<string | null> {
  const token =
    request.headers.get("x-session-token")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";
  if (token) {
    const raw = await env.ViviTEL.get(`${SESSION_PREFIX}${token}`);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as { userId?: string; expiresAt?: string };
      if (session.expiresAt && Date.parse(session.expiresAt) < Date.now()) {
        await env.ViviTEL.delete(`${SESSION_PREFIX}${token}`);
        return null;
      }
      return String(session.userId ?? "").trim() || null;
    } catch {
      return null;
    }
  }
  const legacy = request.headers.get("x-user-id")?.trim();
  return legacy || null;
}

export async function handleAuthRequest(
  env: AuthEnv,
  request: Request,
  pathname: string,
  tenantId: string
): Promise<Response | null> {
  if (pathname === "/auth/login") {
    if (request.method !== "POST") return badRequest("Use POST for /auth/login");
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (!email || !password) return badRequest("Email and password are required");

      const rows = await listUsers(env);
      const found = rows.find((u) => String(u.email ?? "").trim().toLowerCase() === email);
      if (!found) return unauthorized("Invalid email or password");
      const status = String(found.status ?? "active").trim().toLowerCase();
      if (status === "inactive") return unauthorized("Account is inactive");
      const storedPassword = String(found.password ?? "").trim();
      if (storedPassword && storedPassword !== password) {
        return unauthorized("Invalid email or password");
      }

      const userId = String(found.id ?? "").trim();
      const token = uuid().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString();
      await env.ViviTEL.put(
        `${SESSION_PREFIX}${token}`,
        JSON.stringify({ userId, email, expiresAt }),
        { expirationTtl: SESSION_TTL_SEC }
      );
      const profile = await buildAccessProfile(env, userId, tenantId);
      return json({
        ok: true,
        token,
        expiresAt,
        user: {
          id: userId,
          email,
          name: String(found.name ?? email)
        },
        profile
      });
    } catch {
      return badRequest("Invalid JSON body.");
    }
  }

  if (pathname === "/auth/logout") {
    if (request.method !== "POST") return badRequest("Use POST for /auth/logout");
    const token =
      request.headers.get("x-session-token")?.trim() ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
      "";
    if (token) await env.ViviTEL.delete(`${SESSION_PREFIX}${token}`);
    return json({ ok: true });
  }

  if (pathname === "/auth/session") {
    if (request.method !== "GET") return badRequest("Use GET for /auth/session");
    const userId = await resolveUserIdFromRequest(env, request);
    if (!userId) return unauthorized();
    const profile = await buildAccessProfile(env, userId, tenantId);
    if (!profile) return unauthorized();
    return json({ ok: true, userId, profile });
  }

  return null;
}
