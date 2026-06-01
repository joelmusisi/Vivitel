import type { AuthEnv } from "./auth";
import { resolveUserIdFromRequest } from "./auth";
import { buildAccessProfile, tenantAllowed } from "./rbacAccess";

const corsHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*"
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders });

const PUBLIC_PATHS = new Set([
  "/",
  "/health",
  "/health/resources",
  "/telemetry/summary",
  "/echo",
  "/auth/login"
]);

const RBAC_PUBLIC_PREFIXES = ["/rbac/me", "/auth/session", "/auth/logout"];

export function isPublicPath(pathname: string, method: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/rbac/") && method === "OPTIONS") return true;
  if (pathname === "/auth/login" && method === "POST") return true;
  if (RBAC_PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return false;
  return false;
}

export async function enforceApiAccess(
  env: AuthEnv,
  request: Request,
  pathname: string,
  tenantId: string
): Promise<Response | null> {
  if (request.method === "OPTIONS") return null;
  if (isPublicPath(pathname, request.method)) return null;

  const needsAuth =
    pathname.startsWith("/d1/") ||
    pathname.startsWith("/kv/") ||
    pathname.startsWith("/pat") ||
    pathname.startsWith("/rbac/");

  if (!needsAuth) return null;

  const userId = await resolveUserIdFromRequest(env, request);
  if (!userId) {
    return json({ error: "Unauthorized. Sign in required." }, 401);
  }

  const profile = await buildAccessProfile(env, userId, tenantId);
  if (!profile) {
    return json({ error: "Unauthorized. User not found." }, 401);
  }

  if (pathname.startsWith("/d1/") || (pathname.startsWith("/kv/") && request.method !== "GET")) {
    if (!tenantAllowed(tenantId, profile.scopes, profile.allowAll)) {
      return json(
        {
          error: "Forbidden",
          message: "You do not have access to this organisation scope.",
          tenantId
        },
        403
      );
    }
  }

  if (pathname.startsWith("/rbac/users") && request.method !== "GET" && !profile.allowAll) {
    const canAdmin = profile.pagePermissions.some(
      (p) => p.canView && p.pagePath.startsWith("/manage/user-admin")
    );
    if (!canAdmin) {
      return json({ error: "Forbidden", message: "User admin permission required." }, 403);
    }
  }

  return null;
}

export async function getAuthenticatedUserId(env: AuthEnv, request: Request) {
  return resolveUserIdFromRequest(env, request);
}
