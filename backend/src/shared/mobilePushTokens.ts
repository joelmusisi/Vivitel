import {
  getFcmAccessToken,
  parseFcmServiceAccount,
  sendFcmMessage,
  type FcmEnv,
  type FcmNotification
} from "./fcmPush";

/**
 * VIVI Mobile push tokens, per user and tenant. Stored in the VPS-backed ViviTEL store
 * next to the user's in-app alerts (the Worker never writes Cloudflare KV or D1 for this).
 */

export type MobilePushPlatform = "ios" | "android";

export type MobilePushTokenRecord = {
  token: string;
  platform: MobilePushPlatform;
  updatedAt: string;
};

type PushTokenKv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

const MAX_TOKENS_PER_USER = 10;
const MAX_TOKEN_LENGTH = 4096;

function userTokensKey(tenantId: string, userId: string) {
  return `vivi:push-tokens:${tenantId}:${userId}`;
}

async function tokenOwnerKey(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `vivi:push-token-owner:${hex}`;
}

function ownerValue(tenantId: string, userId: string) {
  return JSON.stringify({ tenantId, userId });
}

/** Clear the owner marker only when it still points at this user. */
async function forgetTokenOwner(kv: PushTokenKv, token: string, tenantId: string, userId: string) {
  const ownerKey = await tokenOwnerKey(token);
  if ((await kv.get(ownerKey)) === ownerValue(tenantId, userId)) await kv.delete(ownerKey);
}

export function parsePushTokenBody(
  body: unknown
): { ok: true; token: string; platform: MobilePushPlatform } | { ok: false; error: string } {
  const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const token = String(value.token ?? "").trim();
  const platform = String(value.platform ?? "").trim().toLowerCase();
  if (!token) return { ok: false, error: "token is required" };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, error: "token is too long" };
  if (platform !== "ios" && platform !== "android") return { ok: false, error: 'platform must be "ios" or "android"' };
  return { ok: true, token, platform };
}

export async function readPushTokensForUser(
  kv: PushTokenKv,
  tenantId: string,
  userId: string
): Promise<MobilePushTokenRecord[]> {
  const raw = await kv.get(userTokensKey(tenantId, userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as MobilePushTokenRecord[];
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row.token === "string" && row.token) : [];
  } catch {
    return [];
  }
}

async function writePushTokensForUser(kv: PushTokenKv, tenantId: string, userId: string, list: MobilePushTokenRecord[]) {
  const key = userTokensKey(tenantId, userId);
  if (list.length) await kv.put(key, JSON.stringify(list));
  else await kv.delete(key);
}

async function removeTokensFromUser(kv: PushTokenKv, tenantId: string, userId: string, tokens: Set<string>) {
  const list = await readPushTokensForUser(kv, tenantId, userId);
  const kept = list.filter((row) => !tokens.has(row.token));
  if (kept.length !== list.length) await writePushTokensForUser(kv, tenantId, userId, kept);
  return list.length - kept.length;
}

/**
 * Save the device token for this user. A device belongs to one person at a time: when the
 * token was registered by someone else (signed in on the same phone before), it moves here.
 */
export async function upsertPushToken(
  kv: PushTokenKv,
  input: { tenantId: string; userId: string; token: string; platform: MobilePushPlatform; now?: Date }
): Promise<MobilePushTokenRecord> {
  const ownerKey = await tokenOwnerKey(input.token);
  const owner = String((await kv.get(ownerKey)) ?? "");
  const currentOwner = ownerValue(input.tenantId, input.userId);
  if (owner && owner !== currentOwner) {
    try {
      const previous = JSON.parse(owner) as { tenantId?: string; userId?: string };
      if (previous.tenantId && previous.userId) {
        await removeTokensFromUser(kv, previous.tenantId, previous.userId, new Set([input.token]));
      }
    } catch {
      // Unreadable owner marker: overwrite it below.
    }
  }
  const record: MobilePushTokenRecord = {
    token: input.token,
    platform: input.platform,
    updatedAt: (input.now ?? new Date()).toISOString()
  };
  const list = await readPushTokensForUser(kv, input.tenantId, input.userId);
  const next = [record, ...list.filter((row) => row.token !== input.token)].slice(0, MAX_TOKENS_PER_USER);
  await writePushTokensForUser(kv, input.tenantId, input.userId, next);
  if (owner !== currentOwner) await kv.put(ownerKey, currentOwner);
  return record;
}

export async function deletePushToken(
  kv: PushTokenKv,
  input: { tenantId: string; userId: string; token: string }
): Promise<boolean> {
  const removed = await removeTokensFromUser(kv, input.tenantId, input.userId, new Set([input.token]));
  await forgetTokenOwner(kv, input.token, input.tenantId, input.userId);
  return removed > 0;
}

export type PushTokenRoutePrincipal = { kind: "admin" } | { kind: "user"; userId: string } | { kind: "none" };

/**
 * POST / DELETE /api/mobile/push-tokens with body `{ token, platform }`. The Worker resolves
 * the caller (x-api-key session) and tenant (x-tenant-id); this decides the response.
 */
export async function handlePushTokenRequest(
  kv: PushTokenKv,
  input: {
    method: string;
    principal: PushTokenRoutePrincipal;
    tenantId: string;
    body: { ok: true; value: unknown } | { ok: false; error: string };
  }
): Promise<{ status: number; body: Record<string, unknown> }> {
  const method = input.method.toUpperCase();
  if (method !== "POST" && method !== "DELETE") {
    return { status: 405, body: { error: "Use POST or DELETE for push tokens." } };
  }
  if (input.principal.kind === "admin") {
    return { status: 200, body: { stored: false, skipped: true, reason: "admin has no personal device notifications" } };
  }
  if (input.principal.kind !== "user") return { status: 401, body: { error: "Unauthorized" } };
  if (!input.tenantId) return { status: 400, body: { error: "tenant is required (x-tenant-id or ?tenant=)" } };
  if (!input.body.ok) return { status: 400, body: { error: input.body.error } };
  const parsed = parsePushTokenBody(input.body.value);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const userId = input.principal.userId;
  if (method === "POST") {
    const record = await upsertPushToken(kv, {
      tenantId: input.tenantId,
      userId,
      token: parsed.token,
      platform: parsed.platform
    });
    return { status: 200, body: { stored: true, platform: record.platform, updatedAt: record.updatedAt, tenantId: input.tenantId } };
  }
  const deleted = await deletePushToken(kv, { tenantId: input.tenantId, userId, token: parsed.token });
  return { status: 200, body: { deleted, tenantId: input.tenantId } };
}

export type PushDeliverySummary = { sent: number; failed: number; removed: number; skipped?: string };

/**
 * Send one notification to every device the user registered. Tokens FCM reports as
 * unregistered are dropped. Never throws: push is best-effort next to in-app and email.
 */
export async function sendPushToUser(
  env: FcmEnv,
  kv: PushTokenKv,
  input: { tenantId: string; userId: string; notification: FcmNotification },
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch
): Promise<PushDeliverySummary> {
  try {
    const tokens = await readPushTokensForUser(kv, input.tenantId, input.userId);
    if (!tokens.length) return { sent: 0, failed: 0, removed: 0, skipped: "no devices" };
    const account = parseFcmServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON);
    if (!account) return { sent: 0, failed: 0, removed: 0, skipped: "FCM_SERVICE_ACCOUNT_JSON not configured" };
    const accessToken = await getFcmAccessToken(account, fetchImpl);
    const results = await Promise.all(
      tokens.map(async (row) => {
        try {
          return { token: row.token, result: await sendFcmMessage(account, accessToken, row.token, input.notification, fetchImpl) };
        } catch (error) {
          console.warn("FCM send error:", error);
          return { token: row.token, result: "failed" as const };
        }
      })
    );
    const dead = new Set(results.filter((r) => r.result === "unregistered").map((r) => r.token));
    const removed = dead.size ? await removeTokensFromUser(kv, input.tenantId, input.userId, dead) : 0;
    for (const token of dead) await forgetTokenOwner(kv, token, input.tenantId, input.userId);
    return {
      sent: results.filter((r) => r.result === "sent").length,
      failed: results.filter((r) => r.result === "failed").length,
      removed
    };
  } catch (error) {
    console.warn("Push delivery failed:", input.userId, error);
    return { sent: 0, failed: 1, removed: 0 };
  }
}
