/**
 * Firebase Cloud Messaging (HTTP v1) sender for the VIVI Mobile app.
 *
 * Credentials come from the FCM_SERVICE_ACCOUNT_JSON secret (the Firebase service-account
 * key file, as JSON text). It is never committed. iOS goes through the same API (APNs is
 * configured inside the Firebase project).
 */

export type FcmServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
};

export type FcmEnv = {
  FCM_SERVICE_ACCOUNT_JSON?: string;
};

export type FcmNotification = {
  title: string;
  body: string;
  /** FCM data values must be strings; the app reads `screen` or `url`. */
  data?: Record<string, string>;
};

export type FcmSendResult = "sent" | "unregistered" | "failed";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

export function parseFcmServiceAccount(raw: string | undefined): FcmServiceAccount | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const projectId = String(parsed.project_id ?? "").trim();
    const clientEmail = String(parsed.client_email ?? "").trim();
    // Secrets pasted through some shells keep the key's newlines escaped.
    const privateKey = String(parsed.private_key ?? "").replace(/\\n/g, "\n").trim();
    if (!projectId || !clientEmail || !privateKey) return null;
    return {
      projectId,
      clientEmail,
      privateKey,
      tokenUri: String(parsed.token_uri ?? "").trim() || DEFAULT_TOKEN_URI
    };
  } catch {
    return null;
  }
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromJson(value: unknown): string {
  return base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Signed RS256 JWT assertion for the Google OAuth2 service-account flow. */
export async function buildServiceAccountAssertion(account: FcmServiceAccount, nowMs = Date.now()): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const header = base64UrlFromJson({ alg: "RS256", typ: "JWT" });
  const claims = base64UrlFromJson({
    iss: account.clientEmail,
    scope: FCM_SCOPE,
    aud: account.tokenUri,
    iat,
    exp: iat + 3600
  });
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(account.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

// Access tokens last an hour; keep one per service account in isolate memory only.
let cachedAccessToken: { clientEmail: string; token: string; expiresAt: number } | null = null;

export function resetFcmAccessTokenCacheForTests(): void {
  cachedAccessToken = null;
}

export async function getFcmAccessToken(
  account: FcmServiceAccount,
  fetchImpl: FetchLike = fetch,
  nowMs = Date.now()
): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.clientEmail === account.clientEmail && cachedAccessToken.expiresAt > nowMs + 60_000) {
    return cachedAccessToken.token;
  }
  const assertion = await buildServiceAccountAssertion(account, nowMs);
  const response = await fetchImpl(account.tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!response.ok || !body.access_token) {
    throw new Error(`FCM OAuth token request failed (${response.status})`);
  }
  cachedAccessToken = {
    clientEmail: account.clientEmail,
    token: body.access_token,
    expiresAt: nowMs + Math.max(60, Number(body.expires_in ?? 3600)) * 1000
  };
  return body.access_token;
}

export function buildFcmMessage(token: string, notification: FcmNotification) {
  return {
    message: {
      token,
      notification: { title: notification.title, body: notification.body },
      ...(notification.data && Object.keys(notification.data).length ? { data: notification.data } : {}),
      android: { priority: "HIGH" },
      apns: { payload: { aps: { sound: "default" } } }
    }
  };
}

/** True when FCM says the token will never work again and should be forgotten. */
export function isUnregisteredFcmError(status: number, body: unknown): boolean {
  const error = (body as { error?: { status?: string; details?: Array<Record<string, unknown>> } })?.error;
  const codes = (error?.details ?? []).map((detail) => String(detail?.errorCode ?? ""));
  if (codes.includes("UNREGISTERED")) return true;
  return status === 404 && String(error?.status ?? "") === "NOT_FOUND";
}

export async function sendFcmMessage(
  account: FcmServiceAccount,
  accessToken: string,
  token: string,
  notification: FcmNotification,
  fetchImpl: FetchLike = fetch
): Promise<FcmSendResult> {
  const response = await fetchImpl(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(buildFcmMessage(token, notification))
    }
  );
  if (response.ok) return "sent";
  const body = await response.json().catch(() => null);
  if (isUnregisteredFcmError(response.status, body)) return "unregistered";
  console.warn("FCM send failed:", response.status, JSON.stringify(body)?.slice(0, 300));
  return "failed";
}
