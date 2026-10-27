import type { GpsIotSecrets } from "./secrets.ts";

export type GpsIotToken = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
};

type TokenCache = {
  webApiKey: string;
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export function resetGpsIotTokenCache() {
  tokenCache = null;
}

export async function requestGpsIotToken(secrets: GpsIotSecrets, fetchImpl: typeof fetch = fetch): Promise<GpsIotToken> {
  const body = new URLSearchParams();
  body.set("username", secrets.webApiKey);
  body.set("password", secrets.webSecretKey);
  body.set("grant_type", "password");
  const response = await fetchImpl(`${secrets.baseUrl}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const description = String(record.error_description ?? record.error ?? "").trim();
    throw new Error(description || `GPS IoT token request failed (${response.status})`);
  }
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const accessToken = String(record.access_token ?? "").trim();
  if (!accessToken) throw new Error("GPS IoT token response did not include access_token");
  const expiresIn = Number(record.expires_in ?? 7200);
  return {
    accessToken,
    tokenType: String(record.token_type ?? "bearer").trim() || "bearer",
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 7200
  };
}

export async function getGpsIotAccessToken(secrets: GpsIotSecrets, fetchImpl: typeof fetch = fetch): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.webApiKey === secrets.webApiKey && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  const fresh = await requestGpsIotToken(secrets, fetchImpl);
  tokenCache = {
    webApiKey: secrets.webApiKey,
    accessToken: fresh.accessToken,
    expiresAt: now + fresh.expiresIn * 1000
  };
  return fresh.accessToken;
}
