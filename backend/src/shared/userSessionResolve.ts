export const USER_SESSION_PREFIX = "auth:userSession:";
const IMPERSONATION_CACHE_PREFIX = "vivi:auth:impersonation:";

export async function resolveUserIdFromAuthToken(
  kvGet: (key: string) => Promise<string | null | undefined>,
  token: string
): Promise<string | null> {
  const trimmed = String(token ?? "").trim();
  if (!trimmed) return null;

  const sessionRaw = await kvGet(`${USER_SESSION_PREFIX}${trimmed}`);
  if (sessionRaw) {
    try {
      const userId = String(JSON.parse(sessionRaw)?.userId ?? "").trim();
      if (userId) return userId;
    } catch {
      // ignore malformed session payload
    }
  }

  const impersonationRaw = await kvGet(`${IMPERSONATION_CACHE_PREFIX}${trimmed}`);
  if (impersonationRaw) {
    try {
      const userId = String(JSON.parse(impersonationRaw)?.userId ?? "").trim();
      if (userId) return userId;
    } catch {
      // ignore malformed impersonation payload
    }
  }

  return null;
}
