import { apiFetch } from "./client";
import { setApiKey, setLastLoginEmail, setTenantId } from "../storage/session";

type AuthMeResponse = {
  tenantId?: string;
  allowedTenants?: string[];
  principal?: {
    email?: string;
    displayName?: string;
    kind?: string;
  };
};

export async function login(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const body = await apiFetch<{ token?: string }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password })
      },
      { skipTenant: true }
    );
    const token = String(body?.token ?? "").trim();
    if (!token) return { ok: false, error: "Login did not return a token." };
    await setApiKey(token);
    await setLastLoginEmail(email);
    await refreshAuthMe();
    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Login failed";
    return { ok: false, error: message };
  }
}

export async function refreshAuthMe(): Promise<AuthMeResponse | null> {
  try {
    let body = await apiFetch<AuthMeResponse>("/auth/me", { method: "GET" });
    const allowed = Array.isArray(body?.allowedTenants) ? body.allowedTenants : [];
    const firstAllowed = String(allowed[0] ?? "").trim();
    const currentTenant = String(body?.tenantId ?? "").trim();
    if (!currentTenant && firstAllowed) {
      body = await apiFetch<AuthMeResponse>("/auth/me", { method: "GET" }, { tenantId: firstAllowed });
    }
    const tenantId = String(body?.tenantId ?? firstAllowed ?? "").trim();
    if (tenantId) await setTenantId(tenantId);
    return body;
  } catch {
    return null;
  }
}
