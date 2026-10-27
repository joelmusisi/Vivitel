/**
 * Data sources shared by the realtime Worker hub and its VPS replacement.
 */

import { buildTraccarLivePayload, type TraccarLivePayload } from "./traccarLivePayload";
import {
  listRealtimePresenceFromVps,
  readRealtimeStateFromVps,
  writeRealtimeStateToVps,
  type VpsProxyEnv
} from "../shared/vpsOperationalProxy";
import { readSupportDeskRoleHolders } from "../shared/rbacUserDirectory";
import { createVpsKvNamespace, routeOperationalD1ToVps } from "../shared/vpsWorkerStorage";
import { createRegionScopedKv } from "../shared/regionStorage";
import { DEFAULT_REGION, isRegionId, type RegionId } from "../shared/regionServers";

export type RealtimeEnv = VpsProxyEnv & {
  TRACCAR_BASE_URL?: string;
  TRACCAR_TOKEN?: string;
  TRACCAR_USERNAME?: string;
  TRACCAR_PASSWORD?: string;
  ViviTEL: KVNamespace;
  VIVI_D1: D1Database;
  REALTIME_HUB?: DurableObjectNamespace;
  TRACCAR_SOCKET_BRIDGE?: DurableObjectNamespace;
};

const routedEnvs = new WeakMap<object, RealtimeEnv>();

const regionForTenant = (tenantId: string): RegionId => {
  const candidate = String(tenantId.match(/^region:([a-z0-9]+):/i)?.[1] ?? "").toLowerCase();
  return isRegionId(candidate) ? candidate : DEFAULT_REGION;
};

/**
 * Durable Objects receive the raw Cloudflare bindings (legacy, empty D1 tables and no KV
 * binding). Read through the VPS exactly like the Worker does, with the tenant's region
 * partition for KV keys.
 */
function storageEnv(env: RealtimeEnv, tenantId = ""): RealtimeEnv {
  let routed = routedEnvs.get(env);
  if (!routed) {
    routed = {
      ...env,
      VIVI_D1: routeOperationalD1ToVps(env.VIVI_D1 as any, env as any) as unknown as D1Database,
      ViviTEL: createVpsKvNamespace(env as any) as unknown as KVNamespace
    };
    routedEnvs.set(env, routed);
  }
  return tenantId ? { ...routed, ViviTEL: createRegionScopedKv(routed.ViviTEL, regionForTenant(tenantId)) } : routed;
}

const buildBasicAuth = (user: string, pass: string) => btoa(`${user}:${pass}`);

export async function traccarFetch(env: RealtimeEnv, pathnameWithQuery: string, init: RequestInit = {}) {
  const base = String(env.TRACCAR_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/api$/i, "");
  if (!base) return { ok: false as const, status: 503, body: { error: "Traccar not configured" } };

  const token = String(env.TRACCAR_TOKEN ?? "").trim();
  const user = String(env.TRACCAR_USERNAME ?? "").trim();
  const pass = String(env.TRACCAR_PASSWORD ?? "").trim();
  const authHeaderCandidates: string[] = [];
  if (user && pass) authHeaderCandidates.push(`Basic ${buildBasicAuth(user, pass)}`);
  if (token) {
    authHeaderCandidates.push(`Bearer ${token}`);
    authHeaderCandidates.push(`Basic ${buildBasicAuth(user || "admin", token)}`);
    authHeaderCandidates.push(`Basic ${buildBasicAuth(token, "")}`);
  } else if (pass && !user) {
    authHeaderCandidates.push(`Basic ${buildBasicAuth("admin", pass)}`);
  }
  const uniqueAuth = Array.from(new Set(authHeaderCandidates.filter(Boolean)));
  if (!uniqueAuth.length) {
    return { ok: false as const, status: 503, body: { error: "Traccar auth not configured" } };
  }

  const baseUrl = new URL(base.includes("://") ? base : `http://${base}`);
  const hostIsIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(baseUrl.hostname);
  const requestOrigin = hostIsIp ? `${baseUrl.protocol}//traccar.vivi.internal` : baseUrl.origin;
  const resolveOverride = hostIsIp ? baseUrl.hostname : "";
  const urlPath = `${pathnameWithQuery.startsWith("/") ? "" : "/"}${pathnameWithQuery}`;
  const url = `${requestOrigin}${urlPath}`;

  let lastFailure: { ok: false; status: number; body: any } | null = null;
  for (const authorization of uniqueAuth) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        Authorization: authorization,
        ...(init.headers as any)
      };
      if (hostIsIp) headers.Host = baseUrl.hostname;
      const fetchInit: RequestInit & { cf?: Record<string, unknown> } = {
        ...init,
        headers,
        signal: AbortSignal.timeout(12_000)
      };
      if (resolveOverride) fetchInit.cf = { ...(fetchInit.cf ?? {}), resolveOverride };
      const resp = await fetch(url, fetchInit);
      const text = await resp.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (resp.ok) return { ok: true as const, status: resp.status, body };
      lastFailure = { ok: false, status: resp.status, body };
      if (resp.status !== 401 && resp.status !== 403) break;
    } catch (err: any) {
      return {
        ok: false as const,
        status: 502,
        body: { error: String(err?.message ?? err) }
      };
    }
  }
  return lastFailure ?? { ok: false as const, status: 502, body: { error: "Traccar request failed" } };
}

export async function fetchTraccarLivePayload(env: RealtimeEnv): Promise<TraccarLivePayload> {
  const at = new Date().toISOString();
  try {
    const [devicesResp, positionsResp] = await Promise.all([
      traccarFetch(env, "/api/devices?all=true"),
      traccarFetch(env, "/api/positions")
    ]);
    if (!devicesResp.ok) {
      return { ok: true, degraded: true, at, count: 0, live: [], error: "Failed to fetch Traccar devices", source: "http" };
    }
    const devices = Array.isArray(devicesResp.body) ? devicesResp.body : [];
    const positions = positionsResp.ok && Array.isArray(positionsResp.body) ? positionsResp.body : [];
    return buildTraccarLivePayload(devices, positions, {
      degraded: !positionsResp.ok,
      source: "http"
    });
  } catch (err: any) {
    return { ok: true, degraded: true, at, count: 0, live: [], error: String(err?.message ?? err), source: "http" };
  }
}

export async function fetchTelemetryEventsSince(
  env: RealtimeEnv,
  tenantId: string,
  since: string
): Promise<{ events: Record<string, unknown>[]; newestAt: string }> {
  const tid = String(tenantId ?? "").trim();
  if (!tid) return { events: [], newestAt: since };
  const db = storageEnv(env).VIVI_D1;
  try {
    const result = since
      ? await db.prepare(
          `SELECT data FROM telemetry_events WHERE tenant_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 200`
        )
          .bind(tid, since)
          .all()
      : await db.prepare(
          `SELECT data FROM telemetry_events WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 200`
        )
          .bind(tid)
          .all();
    const events = (result.results ?? [])
      .map((row) => {
        try {
          return JSON.parse(String((row as any).data));
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Record<string, unknown>[];
    let newestAt = since;
    for (const event of events) {
      const createdAt = String((event as any)?.createdAt ?? "").trim();
      if (createdAt && (!newestAt || createdAt > newestAt)) newestAt = createdAt;
    }
    return { events, newestAt: newestAt || since };
  } catch {
    return { events: [], newestAt: since };
  }
}

export async function fetchTraccarEventsWindow(env: RealtimeEnv, lookbackMs = 12_000) {
  const to = new Date();
  const from = new Date(to.getTime() - Math.max(3_000, lookbackMs));
  const path =
    `/api/reports/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  const resp = await traccarFetch(env, path);
  if (!resp.ok) return [] as any[];
  return Array.isArray(resp.body) ? resp.body : [];
}

export async function fetchUserAlerts(env: RealtimeEnv, tenantId: string, userId: string) {
  const tid = String(tenantId ?? "").trim();
  const uid = String(userId ?? "").trim();
  if (!tid || !uid) return [];
  try {
    const key = `vivi:user-alerts:${tid}:${uid}`;
    const raw = await storageEnv(env, tid).ViviTEL.get(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.alerts)) return parsed.alerts;
    return [];
  } catch {
    return [];
  }
}

type ChatConversation = {
  id: string;
  status: string;
  createdAt?: string;
  messages?: unknown[];
  user?: unknown;
  assignedAgent?: unknown;
};

async function readConversation(env: RealtimeEnv, tenantId: string, id: string): Promise<ChatConversation | null> {
  const raw = await storageEnv(env, tenantId).ViviTEL.get(`chat:${tenantId}:${id}`);
  return raw ? (JSON.parse(raw) as ChatConversation) : null;
}

export async function listOpenConversations(env: RealtimeEnv, tenantId: string, limit = 50) {
  const key = `chat:index:${tenantId}`;
  const raw = await storageEnv(env, tenantId).ViviTEL.get(key);
  let ids: string[] = [];
  try {
    ids = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    ids = [];
  }
  const out: ChatConversation[] = [];
  for (const id of ids.slice(0, Math.max(1, Math.min(100, limit)))) {
    const conversation = await readConversation(env, tenantId, id);
    if (conversation && conversation.status === "open") out.push(conversation);
  }
  return out;
}

export async function readConversationById(env: RealtimeEnv, tenantId: string, id: string) {
  return readConversation(env, tenantId, id);
}

const SUPPORT_AGENT_CATEGORIES = [
  "Sales",
  "Technical Support Telematics",
  "Support Vide Telematics",
  "Admins",
  "Support Deliver",
  "Support Maintenace"
] as const;

function normalizeSupportAgentCategory(input: unknown): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "Technical Support Telematics";
  const lower = raw.toLowerCase();
  if (lower === "support video telematics") return "Support Vide Telematics";
  if (lower === "support maintenance") return "Support Maintenace";
  if (lower === "admins" || lower === "admin") return "Admins";
  const exact = SUPPORT_AGENT_CATEGORIES.find((c) => c.toLowerCase() === lower);
  return exact ?? "Technical Support Telematics";
}

async function readOwnSupportAgents(env: RealtimeEnv) {
  try {
    // Roles on the VPS, users in D1 (see rbacUserDirectory).
    const rows = await readSupportDeskRoleHolders(storageEnv(env).VIVI_D1);

    const byId = new Map<string, { id: string; name: string; email: string; category: string; isAdmin: boolean }>();
    for (const row of rows.results ?? []) {
      const id = String(row?.id ?? "").trim();
      const name = String(row?.name ?? "").trim();
      if (!id || !name) continue;
      const standardRoleKey = String(row?.standardRoleKey ?? "").trim().toLowerCase();
      const roleName = String(row?.roleName ?? "").trim().toLowerCase();
      const isAdmin =
        standardRoleKey === "admin" ||
        roleName === "admin" ||
        roleName === "tenant admin" ||
        roleName === "administrator";
      const category = isAdmin ? "Admins" : "Technical Support Telematics";
      const existing = byId.get(id);
      if (existing) {
        if (isAdmin && !existing.isAdmin) {
          existing.category = "Admins";
          existing.isAdmin = true;
        }
        continue;
      }
      byId.set(id, {
        id,
        name,
        email: String(row?.email ?? "").trim(),
        category,
        isAdmin
      });
    }
    return Array.from(byId.values()).map(({ id, name, email, category }) => ({ id, name, email, category }));
  } catch {
    return [];
  }
}

export async function writeSupportAgentPresence(
  env: RealtimeEnv,
  tenantId: string,
  agentId: string,
  at = new Date().toISOString()
) {
  const id = String(agentId ?? "").trim();
  const tid = String(tenantId ?? "").trim();
  if (!id || !tid) return;
  const expiresAt = new Date(Date.parse(at) + 60 * 60 * 1000).toISOString();
  await writeRealtimeStateToVps(env, tid, `presence:${id}`, at, expiresAt);
}

export async function readSupportAgentPresenceSafe(
  env: RealtimeEnv,
  tenantId: string,
  agentId: string
): Promise<string> {
  const id = String(agentId ?? "").trim();
  const tid = String(tenantId ?? "").trim();
  if (!id || !tid) return "";
  return String((await readRealtimeStateFromVps(env, tid, `presence:${id}`)) ?? "").trim();
}

export async function fetchSupportSnapshot(
  env: RealtimeEnv,
  tenantId: string,
  windowSec = 90,
  livePresence?: Map<string, string> | Record<string, string>
) {
  const presenceWindowSec = Math.max(15, Math.min(600, windowSec));
  const now = Date.now();
  const agents = await readOwnSupportAgents(env);
  const categories: Record<string, any[]> = {};
  for (const c of SUPPORT_AGENT_CATEGORIES) categories[c] = [];
  const liveAtFor = (agentId: string) => {
    if (!livePresence) return "";
    if (livePresence instanceof Map) return String(livePresence.get(agentId) ?? "").trim();
    return String((livePresence as Record<string, string>)[agentId] ?? "").trim();
  };
  for (const agent of agents) {
    let lastSeenAt = liveAtFor(agent.id);
    if (!lastSeenAt) lastSeenAt = await readSupportAgentPresenceSafe(env, tenantId, agent.id);
    const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
    const staleSec = Number.isFinite(lastSeenMs) ? (now - lastSeenMs) / 1000 : Number.POSITIVE_INFINITY;
    const online = staleSec <= presenceWindowSec;
    const category = normalizeSupportAgentCategory(agent.category);
    categories[category].push({
      id: agent.id,
      name: agent.name,
      category,
      online,
      lastSeenAt: lastSeenAt || undefined
    });
  }
  for (const c of SUPPORT_AGENT_CATEGORIES) {
    categories[c].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  }
  const conversations = await listOpenConversations(env, tenantId, 50);
  return {
    categories,
    conversations,
    windowSec: presenceWindowSec,
    tenantId,
    at: new Date().toISOString()
  };
}

export function stablePayloadHash(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(Date.now());
  }
}
