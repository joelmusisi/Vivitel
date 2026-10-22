import type { IncomingMessage, Server } from "http";
import type { Server as HttpsServer } from "https";
import type { Express } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { buildTraccarLivePayload, type TraccarLivePayload } from "./traccarLivePayload";

type RealtimeChannel = "live" | "streams" | "support";
type RealtimeSocket = WebSocket & { tenantId?: string; userId?: string; channels?: RealtimeChannel[]; site?: string; since?: string; watchId?: string };

interface VpsRealtimeHubDeps {
  apiKey: string;
  db: any;
  traccarFetch: (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; body: any }>;
  listSupportDeskAgents: () => Array<{ id: string; name: string; email?: string; category?: string }>;
}

const INTERVAL_MS = 5_000;
const ALLOWED_CHANNELS = new Set<RealtimeChannel>(["live", "streams", "support"]);

export function attachVpsRealtimeHub(
  server: Server | HttpsServer,
  app: Express,
  deps: VpsRealtimeHubDeps
): void {
  const sockets = new Set<RealtimeSocket>();
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  let latestLivePayload: TraccarLivePayload | null = null;

  app.post("/operational/realtime/notify/:type", (req, res) => {
    const apiKey = String(req.header("x-api-key") ?? "").trim();
    const tenantId = String(req.header("x-tenant-id") ?? "").trim();
    const forwardedBy = String(req.header("x-vivi-forwarded-by") ?? "").trim();
    const type = String(req.params.type ?? "").trim();
    if (!deps.apiKey || apiKey !== deps.apiKey || forwardedBy !== "cloudflare-worker") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!tenantId) return res.status(400).json({ error: "tenant is required." });
    if (!["support", "presence", "catalog", "live"].includes(type)) {
      return res.status(404).json({ error: "Unknown realtime notification." });
    }
    if (type === "presence") {
      const agentId = String(req.body?.agentId ?? "").trim();
      if (!agentId) return res.status(400).json({ error: "agentId is required." });
      persistPresence(deps.db, tenantId, agentId);
    }
    if (type === "live" && req.body && Array.isArray(req.body.live)) {
      latestLivePayload = req.body as TraccarLivePayload;
      for (const client of sockets) {
        if (client.tenantId === tenantId && client.channels?.includes("live")) {
          sendJson(client, "live.positions", latestLivePayload);
        }
      }
    }
    if (type === "catalog") {
      for (const client of sockets) {
        if (client.tenantId === tenantId && client.channels?.some((channel) => channel === "live" || channel === "streams")) {
          sendJson(client, "catalog.assets", {
            tenantId,
            reason: String(req.body?.reason ?? "assets"),
            site: String(req.body?.site ?? ""),
            at: new Date().toISOString()
          });
        }
      }
    }
    if (type === "support" || type === "presence") {
      for (const client of sockets) {
        if (client.tenantId === tenantId && client.channels?.includes("support")) {
          void sendUpdates(client, deps, true);
        }
      }
    }
    return res.json({ ok: true });
  });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!["/ws", "/stream/ws", "/realtime/ws"].includes(url.pathname.replace(/\/+$/, "") || "/")) {
      socket.destroy();
      return;
    }
    const tenantId = String(request.headers["x-tenant-id"] ?? url.searchParams.get("tenant") ?? "").trim();
    const userId = String(request.headers["x-user-id"] ?? url.searchParams.get("userId") ?? "").trim();
    const apiKey = String(request.headers["x-api-key"] ?? "").trim();
    const forwardedBy = String(request.headers["x-vivi-forwarded-by"] ?? "").trim();
    if (!deps.apiKey || apiKey !== deps.apiKey || forwardedBy !== "cloudflare-worker" || !tenantId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      const client = webSocket as RealtimeSocket;
      client.tenantId = tenantId;
      client.userId = userId;
      client.channels = [];
      client.since = new Date().toISOString();
      sockets.add(client);
      client.on("message", (message) => {
        void handleMessage(client, message.toString(), deps);
      });
      client.on("close", () => sockets.delete(client));
      client.on("error", () => sockets.delete(client));
      sendJson(client, "ready", { ok: true, tenantId });
      client.ping();
    });
  });

  const timer = setInterval(() => {
    for (const socket of sockets) {
      if (socket.readyState !== WebSocket.OPEN) {
        sockets.delete(socket);
        continue;
      }
      if (socket.channels?.includes("support") && socket.tenantId && socket.userId) {
        persistPresence(deps.db, socket.tenantId, socket.userId);
      }
      void sendUpdates(socket, deps);
    }
  }, INTERVAL_MS);
  timer.unref();

  console.log("[realtime] VPS WebSocket upgrade handler enabled");
}

async function handleMessage(socket: RealtimeSocket, raw: string, deps: VpsRealtimeHubDeps): Promise<void> {
  let message: any;
  try {
    message = JSON.parse(raw);
  } catch {
    sendJson(socket, "error", { message: "Invalid JSON message" });
    return;
  }
  const type = String(message?.type ?? "").trim().toLowerCase();
  if (type === "subscribe") {
    const channels: RealtimeChannel[] = Array.isArray(message.channels)
      ? message.channels
          .map((channel: unknown) => String(channel ?? "").trim().toLowerCase())
          .filter((channel: string): channel is RealtimeChannel => ALLOWED_CHANNELS.has(channel as RealtimeChannel))
      : [];
    socket.channels = channels;
    socket.site = String(message.site ?? "").trim();
    if (message.userId) socket.userId = String(message.userId).trim();
    if (channels.includes("support") && socket.userId && socket.tenantId) {
      persistPresence(deps.db, socket.tenantId, socket.userId);
    }
    sendJson(socket, "subscribed", { channels, site: socket.site });
    await sendUpdates(socket, deps, true);
    return;
  }
  if (type === "support.heartbeat") {
    const agentId = String(message.agentId ?? socket.userId ?? "").trim();
    if (agentId && socket.tenantId) {
      persistPresence(deps.db, socket.tenantId, agentId);
      socket.userId ||= agentId;
    }
    sendJson(socket, "support.heartbeat.ok", { agentId });
    await sendUpdates(socket, deps, true);
    return;
  }
  if (type === "support.watchconversation" || type === "support.watch_conversation") {
    socket.watchId = String(message.conversationId ?? "").trim();
    if (socket.watchId && socket.tenantId) {
      const conversation = readConversation(deps.db, socket.tenantId, socket.watchId);
      if (conversation) sendJson(socket, "support.conversation", conversation);
    }
    return;
  }
  if (type === "ping") {
    sendJson(socket, "pong", { at: new Date().toISOString() });
    return;
  }
  sendJson(socket, "error", { message: `Unknown message type: ${type || "empty"}` });
}

async function sendUpdates(socket: RealtimeSocket, deps: VpsRealtimeHubDeps, force = false): Promise<void> {
  const tenantId = String(socket.tenantId ?? "").trim();
  if (!tenantId || !socket.channels?.length || socket.readyState !== WebSocket.OPEN) return;
  let pushed = false;

  if (socket.channels.includes("live")) {
    const [devices, positions] = await Promise.all([
      deps.traccarFetch("/api/devices?all=true"),
      deps.traccarFetch("/api/positions")
    ]);
    const payload = buildTraccarLivePayload(
      devices.ok && Array.isArray(devices.body) ? devices.body : [],
      positions.ok && Array.isArray(positions.body) ? positions.body : [],
      { degraded: !devices.ok || !positions.ok, source: "http" }
    );
    const hash = JSON.stringify(payload.live);
    if (force || hash !== (socket as any).lastLiveHash) {
      (socket as any).lastLiveHash = hash;
      sendJson(socket, "live.positions", payload);
      pushed = true;
    }

    const telemetry = readTelemetrySince(deps.db, tenantId, socket.since ?? "");
    if (telemetry.events.length) {
      socket.since = telemetry.newestAt;
      sendJson(socket, "live.telemetry", telemetry.events);
      pushed = true;
    }
  }

  if (socket.channels.includes("streams")) {
    const to = new Date();
    const from = new Date(to.getTime() - 15_000);
    const events = await deps.traccarFetch(
      `/api/reports/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
    );
    const alerts = readUserAlerts(deps.db, tenantId, socket.userId ?? "");
    sendJson(socket, "streams.events", {
      events: events.ok && Array.isArray(events.body) ? events.body : [],
      alerts,
      tenantId
    });
    pushed = true;
  }

  if (socket.channels.includes("support")) {
    const snapshot = buildSupportSnapshot(deps, tenantId);
    sendJson(socket, "support.snapshot", snapshot);
    if (socket.watchId) {
      const conversation = readConversation(deps.db, tenantId, socket.watchId);
      if (conversation) sendJson(socket, "support.conversation", conversation);
    }
    pushed = true;
  }
  if (!pushed) sendJson(socket, "tick", { at: new Date().toISOString() });
}

function buildSupportSnapshot(deps: VpsRealtimeHubDeps, tenantId: string) {
  const now = Date.now();
  const presenceRows = deps.db
    .prepare(
      `SELECT k, data FROM operational_realtime_state
       WHERE tenant_id = ? AND k LIKE 'presence:%'
         AND (expires_at IS NULL OR expires_at > ?)`
    )
    .all(tenantId, new Date(now).toISOString()) as Array<{ k?: string; data?: string }>;
  const presence = new Map(presenceRows.map((row) => [String(row.k ?? "").replace(/^presence:/, ""), String(row.data ?? "")]));
  const categories: Record<string, any[]> = {};
  const categoryNames = ["Sales", "Technical Support Telematics", "Support Vide Telematics", "Admins", "Support Deliver", "Support Maintenace"];
  for (const name of categoryNames) categories[name] = [];
  for (const agent of deps.listSupportDeskAgents()) {
    const id = String(agent.id ?? "").trim();
    const name = String(agent.name ?? "").trim();
    if (!id || !name) continue;
    const category = categoryNames.includes(String(agent.category)) ? String(agent.category) : "Technical Support Telematics";
    const lastSeenAt = presence.get(id) ?? "";
    const online = lastSeenAt ? (now - Date.parse(lastSeenAt)) / 1000 <= 90 : false;
    categories[category].push({ id, name, category, online, ...(lastSeenAt ? { lastSeenAt } : {}) });
  }
  const rows = deps.db
    .prepare("SELECT data FROM operational_realtime_state WHERE tenant_id = ? AND k = ?")
    .get(tenantId, `chat:index:${tenantId}`) as { data?: string } | undefined;
  let conversationIds: string[] = [];
  try {
    const parsed = JSON.parse(String(rows?.data ?? "[]"));
    if (Array.isArray(parsed)) conversationIds = parsed.map(String);
  } catch {
    conversationIds = [];
  }
  const indexedConversations = conversationIds
    .slice(0, 50)
    .map((id) => readConversation(deps.db, tenantId, id))
    .filter((conversation) => conversation?.status === "open");
  const legacyRows = conversationIds.length
    ? []
    : (deps.db
        .prepare("SELECT * FROM conversations WHERE tenant_id = ? AND status = 'open' ORDER BY createdAt DESC LIMIT 50")
        .all(tenantId) as any[]);
  return {
    categories,
    conversations: indexedConversations.length
      ? indexedConversations
      : legacyRows.map((row) => conversationFromRow(row)),
    windowSec: 90,
    tenantId,
    at: new Date().toISOString()
  };
}

function readConversation(db: any, tenantId: string, id: string): any | null {
  const stored = db
    .prepare("SELECT data FROM operational_realtime_state WHERE tenant_id = ? AND k = ?")
    .get(tenantId, `chat:${tenantId}:${id}`) as { data?: string } | undefined;
  if (stored?.data) {
    try {
      return JSON.parse(String(stored.data));
    } catch {
      return null;
    }
  }
  const row = db.prepare("SELECT * FROM conversations WHERE tenant_id = ? AND id = ?").get(tenantId, id);
  return row ? conversationFromRow(row) : null;
}

function conversationFromRow(row: any) {
  let user: any = {};
  let messages: any[] = [];
  try { user = JSON.parse(String(row.user_json ?? "{}")); } catch { user = {}; }
  try { messages = JSON.parse(String(row.messages_json ?? "[]")); } catch { messages = []; }
  return {
    id: String(row.id ?? ""),
    status: String(row.status ?? "open"),
    createdAt: String(row.createdAt ?? ""),
    closedAt: row.closedAt ? String(row.closedAt) : undefined,
    user: { name: user.name, email: user.email },
    assignedAgent: user.assignedAgent,
    messages
  };
}

function readTelemetrySince(db: any, tenantId: string, since: string) {
  const rows = since
    ? db.prepare("SELECT data, created_at FROM telemetry_events WHERE tenant_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 200").all(tenantId, since)
    : db.prepare("SELECT data, created_at FROM telemetry_events WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 200").all(tenantId);
  const events = rows.flatMap((row: any) => {
    try { return [typeof row.data === "string" ? JSON.parse(row.data) : row.data]; } catch { return []; }
  });
  return { events, newestAt: String(rows.at(-1)?.created_at ?? since) };
}

function readUserAlerts(db: any, tenantId: string, userId: string): any[] {
  if (!userId) return [];
  const key = `vivi:user-alerts:${tenantId}:${userId}`;
  // The Worker writes in-app alerts to worker_kv; kv_store is the older location.
  let row: { data?: string; value?: string } | undefined;
  try {
    const stored = db.prepare("SELECT value FROM worker_kv WHERE k = ?").get(key) as { value?: string } | undefined;
    if (stored?.value) row = { data: stored.value };
  } catch {
    row = undefined;
  }
  if (!row) {
    row = db
      .prepare("SELECT data FROM kv_store WHERE tenant_id = ? AND k = ? ORDER BY updated_at DESC LIMIT 1")
      .get(tenantId, key);
  }
  try {
    const parsed = JSON.parse(String(row?.data ?? "[]"));
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.alerts) ? parsed.alerts : [];
  } catch {
    return [];
  }
}

function persistPresence(db: any, tenantId: string, agentId: string): void {
  const at = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO operational_realtime_state (tenant_id, k, data, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, k) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at, updated_at = excluded.updated_at`
  ).run(tenantId, `presence:${agentId}`, at, expiresAt, at);
}

function sendJson(socket: WebSocket, type: string, payload: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type, at: new Date().toISOString(), payload }));
}
