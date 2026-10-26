import {
  fetchSupportSnapshot,
  fetchTelemetryEventsSince,
  fetchTraccarEventsWindow,
  fetchTraccarLivePayload,
  fetchUserAlerts,
  readConversationById,
  stablePayloadHash,
  writeSupportAgentPresence,
  type RealtimeEnv
} from "./realtimeSources";
import { listRealtimePresenceFromVps } from "../shared/vpsOperationalProxy";
import { notifyRealtimeOnVps, type VpsProxyEnv } from "../shared/vpsOperationalProxy";
import {
  fetchTraccarLiveFromBridge,
  registerTraccarLiveInterest
} from "./TraccarSocketBridge";
import type { TraccarLivePayload } from "./traccarLivePayload";

export type RealtimeChannel = "live" | "streams" | "support";

type SocketAttachment = {
  /** Kept on each socket (survives hibernation in memory) so the hub never stores its tenant. */
  tenantId: string;
  channels: RealtimeChannel[];
  site: string;
  userId: string;
  telemetrySince: string;
  watchConversationId: string;
  lastLiveHash: string;
  lastStreamsHash: string;
  lastSupportHash: string;
};

const ALARM_MS = 5_000;

const emptyAttachment = (): SocketAttachment => ({
  tenantId: "",
  channels: [],
  site: "",
  userId: "",
  telemetrySince: new Date().toISOString(),
  watchConversationId: "",
  lastLiveHash: "",
  lastStreamsHash: "",
  lastSupportHash: ""
});

const parseChannels = (raw: unknown): RealtimeChannel[] => {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<RealtimeChannel>(["live", "streams", "support"]);
  return raw
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter((value): value is RealtimeChannel => allowed.has(value as RealtimeChannel));
};

const sendJson = (ws: WebSocket, type: string, payload: unknown) => {
  try {
    ws.send(JSON.stringify({ type, at: new Date().toISOString(), payload }));
  } catch {
    // ignore closed sockets
  }
};

export class ViviRealtimeHub implements DurableObject {
  private tenantId = "";

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: RealtimeEnv & { REALTIME_HUB?: DurableObjectNamespace }
  ) {
    // In-memory only (no Durable Object storage writes): after hibernation the tenant
    // comes back from the open sockets' attachments; every request also carries it.
    for (const ws of this.state.getWebSockets()) {
      const tenantId = this.readAttachment(ws).tenantId.trim();
      if (tenantId) {
        this.tenantId = tenantId;
        break;
      }
    }
  }

  private async ensureTenant(tenantId: string) {
    const next = String(tenantId ?? "").trim();
    if (next) this.tenantId = next;
  }

  private async ensureAlarm() {
    const existing = await this.state.storage.getAlarm();
    if (existing == null) {
      await this.state.storage.setAlarm(Date.now() + ALARM_MS);
    }
  }

  private readAttachment(ws: WebSocket): SocketAttachment {
    try {
      const raw = ws.deserializeAttachment() as SocketAttachment | null;
      if (raw && typeof raw === "object") {
        return {
          ...emptyAttachment(),
          ...raw,
          channels: Array.isArray(raw.channels) ? raw.channels : []
        };
      }
    } catch {
      // ignore
    }
    return emptyAttachment();
  }

  private writeAttachment(ws: WebSocket, next: SocketAttachment) {
    try {
      ws.serializeAttachment(next);
    } catch {
      // ignore
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path.endsWith("/notify/support") || path === "/notify/support") {
      const tenantId = String(url.searchParams.get("tenant") ?? request.headers.get("x-tenant-id") ?? "").trim();
      if (tenantId) await this.ensureTenant(tenantId);
      await this.pushSupportToAll(true);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" }
      });
    }

    if (path.endsWith("/notify/live") || path === "/notify/live") {
      const tenantId = String(url.searchParams.get("tenant") ?? request.headers.get("x-tenant-id") ?? "").trim();
      if (tenantId) await this.ensureTenant(tenantId);
      let payload: TraccarLivePayload | null = null;
      try {
        payload = (await request.json()) as TraccarLivePayload;
      } catch {
        payload = null;
      }
      await this.pushLiveToAll(payload);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" }
      });
    }

    if (path.endsWith("/notify/catalog") || path === "/notify/catalog") {
      const tenantId = String(url.searchParams.get("tenant") ?? request.headers.get("x-tenant-id") ?? "").trim();
      if (tenantId) await this.ensureTenant(tenantId);
      let body: { reason?: string; site?: string } = {};
      try {
        body = (await request.json()) as { reason?: string; site?: string };
      } catch {
        body = {};
      }
      await this.pushCatalogToAll(body);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" }
      });
    }

    if (path.endsWith("/notify/streams") || path === "/notify/streams") {
      const tenantId = String(url.searchParams.get("tenant") ?? request.headers.get("x-tenant-id") ?? "").trim();
      if (tenantId) await this.ensureTenant(tenantId);
      let body: { events?: any[]; alerts?: any[] } = {};
      try {
        body = (await request.json()) as { events?: any[]; alerts?: any[] };
      } catch {
        body = {};
      }
      await this.pushStreamsToAll(Array.isArray(body.events) ? body.events : [], Array.isArray(body.alerts) ? body.alerts : []);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" }
      });
    }

    if (path.endsWith("/presence") || path === "/presence") {
      const tenantId = String(url.searchParams.get("tenant") ?? request.headers.get("x-tenant-id") ?? "").trim();
      if (tenantId) await this.ensureTenant(tenantId);

      if (request.method === "POST") {
        let agentId = String(url.searchParams.get("agentId") ?? "").trim();
        if (!agentId) {
          try {
            const body = (await request.json()) as { agentId?: string };
            agentId = String(body?.agentId ?? "").trim();
          } catch {
            // ignore
          }
        }
        if (!agentId) {
          return new Response(JSON.stringify({ ok: false, error: "agentId required" }), {
            status: 400,
            headers: { "content-type": "application/json" }
          });
        }
        await this.recordPresence(agentId);
        await this.pushSupportToAll(true);
        return new Response(JSON.stringify({ ok: true, agentId }), {
          headers: { "content-type": "application/json" }
        });
      }

      const presence = Object.fromEntries(await this.mergeLivePresence());
      return new Response(JSON.stringify({ ok: true, presence, tenantId: this.tenantId }), {
        headers: { "content-type": "application/json" }
      });
    }

    // Durable site route archives (fallback when object storage upload is unavailable).
    if (path.endsWith("/routes-library") || path === "/routes-library") {
      const tenantId = String(url.searchParams.get("tenant") ?? request.headers.get("x-tenant-id") ?? "").trim();
      const site = String(url.searchParams.get("site") ?? "").trim();
      if (!tenantId) {
        return new Response(JSON.stringify({ ok: false, error: "tenant is required" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      if (!site) {
        return new Response(JSON.stringify({ ok: false, error: "site is required" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      await this.ensureTenant(tenantId);
      const siteKey = site.trim().toLowerCase();
      const storageKey = `routes-library:${siteKey}`;

      // Legacy read-only store: no DDL here; a missing table just means no saved library.
      if (request.method === "GET") {
        let raw: string | null = null;
        try {
          const row = this.state.storage.sql
            .exec(`SELECT payload FROM route_libraries WHERE site = ?`, siteKey)
            .one();
          raw = row ? String((row as { payload?: string }).payload ?? "") : null;
        } catch {
          raw = (await this.state.storage.get<string>(storageKey)) ?? null;
        }
        if (!raw) {
          raw = (await this.state.storage.get<string>(storageKey)) ?? null;
        }
        return new Response(JSON.stringify({ ok: true, raw: raw || null, site, tenantId }), {
          headers: { "content-type": "application/json" }
        });
      }

      if (request.method === "PUT" || request.method === "POST") {
        const text = await request.text();
        if (!String(text ?? "").trim()) {
          return new Response(JSON.stringify({ ok: false, error: "Empty body" }), {
            status: 400,
            headers: { "content-type": "application/json" }
          });
        }
        const updatedAt = new Date().toISOString();
        let stored = false;
        try {
          this.state.storage.sql.exec(
            `INSERT OR REPLACE INTO route_libraries (site, payload, updated_at) VALUES (?, ?, ?)`,
            siteKey,
            text,
            updatedAt
          );
          stored = true;
        } catch {
          try {
            await this.state.storage.put(storageKey, text);
            stored = true;
          } catch {
            stored = false;
          }
        }
        if (!stored) {
          return new Response(JSON.stringify({ ok: false, error: "Unable to persist route archive" }), {
            status: 503,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ ok: true, stored: true, site, tenantId }), {
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ ok: false, error: "Use GET or PUT" }), {
        status: 405,
        headers: { "content-type": "application/json" }
      });
    }

    // Durable fallback for site-scoped libraries when Cloudflare KV is unavailable/quota-limited.
    if (path.endsWith("/scoped-kv") || path === "/scoped-kv") {
      const tenantId = String(url.searchParams.get("tenant") ?? request.headers.get("x-tenant-id") ?? "").trim();
      const key = String(url.searchParams.get("key") ?? "").trim();
      if (!tenantId) {
        return new Response(JSON.stringify({ ok: false, error: "tenant is required" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      if (!key) {
        return new Response(JSON.stringify({ ok: false, error: "key is required" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      await this.ensureTenant(tenantId);
      const storageKey = `scoped-kv:${key}`;

      // Legacy read-only store: no DDL here; a missing table just means no saved value.
      if (request.method === "GET") {
        let raw: string | null = null;
        try {
          const row = this.state.storage.sql.exec(`SELECT payload FROM scoped_kv WHERE k = ?`, key).one();
          raw = row ? String((row as { payload?: string }).payload ?? "") : null;
        } catch {
          raw = (await this.state.storage.get<string>(storageKey)) ?? null;
        }
        if (!raw) {
          raw = (await this.state.storage.get<string>(storageKey)) ?? null;
        }
        return new Response(JSON.stringify({ ok: true, raw: raw || null, key, tenantId }), {
          headers: { "content-type": "application/json" }
        });
      }

      if (request.method === "PUT" || request.method === "POST") {
        const text = await request.text();
        if (!String(text ?? "").trim()) {
          return new Response(JSON.stringify({ ok: false, error: "Empty body" }), {
            status: 400,
            headers: { "content-type": "application/json" }
          });
        }
        const updatedAt = new Date().toISOString();
        let stored = false;
        try {
          this.state.storage.sql.exec(
            `INSERT OR REPLACE INTO scoped_kv (k, payload, updated_at) VALUES (?, ?, ?)`,
            key,
            text,
            updatedAt
          );
          stored = true;
        } catch {
          try {
            await this.state.storage.put(storageKey, text);
            stored = true;
          } catch {
            stored = false;
          }
        }
        if (!stored) {
          return new Response(JSON.stringify({ ok: false, error: "Unable to persist scoped library" }), {
            status: 503,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ ok: true, stored: true, key, tenantId }), {
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ ok: false, error: "Use GET or PUT" }), {
        status: 405,
        headers: { "content-type": "application/json" }
      });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const tenantId = String(
      url.searchParams.get("tenant") ?? request.headers.get("x-tenant-id") ?? ""
    ).trim();
    if (!tenantId) return new Response("tenant is required", { status: 400 });
    await this.ensureTenant(tenantId);

    const userId = String(request.headers.get("x-user-id") ?? url.searchParams.get("userId") ?? "").trim();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    this.writeAttachment(server, {
      ...emptyAttachment(),
      tenantId,
      userId,
      telemetrySince: new Date().toISOString()
    });
    sendJson(server, "ready", { ok: true, tenantId });
    await this.ensureAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    try {
      await this.tickAll();
    } finally {
      const sockets = this.state.getWebSockets();
      if (sockets.length > 0) {
        await this.state.storage.setAlarm(Date.now() + ALARM_MS);
      }
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let text = "";
    if (typeof message === "string") text = message;
    else text = new TextDecoder().decode(message);
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      sendJson(ws, "error", { message: "Invalid JSON message" });
      return;
    }

    const type = String(body?.type ?? "").trim().toLowerCase();
    const attachment = this.readAttachment(ws);

    if (type === "subscribe") {
      attachment.channels = parseChannels(body?.channels);
      attachment.site = String(body?.site ?? "").trim();
      if (body?.userId) attachment.userId = String(body.userId).trim();
      this.writeAttachment(ws, attachment);
      if (attachment.channels.includes("support") && attachment.userId) {
        await this.recordPresence(attachment.userId);
      }
      if (attachment.channels.includes("live") && this.tenantId) {
        await registerTraccarLiveInterest(this.env, this.tenantId);
      }
      sendJson(ws, "subscribed", { channels: attachment.channels, site: attachment.site });
      await this.pushForSocket(ws, true);
      await this.ensureAlarm();
      return;
    }

    if (type === "support.heartbeat") {
      const agentId = String(body?.agentId ?? attachment.userId ?? "").trim();
      if (agentId) {
        await this.recordPresence(agentId);
        attachment.userId = attachment.userId || agentId;
        this.writeAttachment(ws, attachment);
      }
      sendJson(ws, "support.heartbeat.ok", { agentId });
      await this.pushSupportToAll(true);
      return;
    }

    if (type === "support.watchconversation" || type === "support.watch_conversation") {
      attachment.watchConversationId = String(body?.conversationId ?? "").trim();
      this.writeAttachment(ws, attachment);
      if (attachment.watchConversationId && this.tenantId) {
        const conversation = await readConversationById(this.env, this.tenantId, attachment.watchConversationId);
        if (conversation) sendJson(ws, "support.conversation", conversation);
      }
      return;
    }

    if (type === "ping") {
      sendJson(ws, "pong", { at: new Date().toISOString() });
      return;
    }

    sendJson(ws, "error", { message: `Unknown message type: ${type || "empty"}` });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, "error");
    } catch {
      // ignore
    }
  }

  private async recordPresence(agentId: string) {
    const id = String(agentId ?? "").trim();
    if (!id || !this.tenantId) return;
    const at = new Date().toISOString();
    await writeSupportAgentPresence(this.env, this.tenantId, id, at);
  }

  /** Active support sockets + recent DO-stored heartbeats (does not require KV). */
  private async mergeLivePresence(windowSec = 90): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    for (const ws of this.state.getWebSockets()) {
      const attachment = this.readAttachment(ws);
      if (!attachment.channels.includes("support")) continue;
      const id = String(attachment.userId ?? "").trim();
      if (id) map.set(id, nowIso);
    }

    if (this.tenantId) {
      const storedPresence = await listRealtimePresenceFromVps(this.env, this.tenantId);
      for (const [id, value] of Object.entries(storedPresence)) {
        const at = String(value ?? "").trim();
        const ms = Date.parse(at);
        if (!id || !Number.isFinite(ms)) continue;
        if ((now - ms) / 1000 > windowSec) continue;
        const existing = map.get(id);
        const existingMs = existing ? Date.parse(existing) : 0;
        if (!existing || ms >= existingMs) map.set(id, at);
      }
    }
    return map;
  }

  private async buildSupportSnapshot(forceWindowSec = 90) {
    if (!this.tenantId) return null;
    const livePresence = await this.mergeLivePresence(forceWindowSec);
    return fetchSupportSnapshot(this.env, this.tenantId, forceWindowSec, livePresence);
  }

  private async tickAll() {
    const sockets = this.state.getWebSockets();
    if (!sockets.length || !this.tenantId) return;

    const needsLive = sockets.some((ws) => this.readAttachment(ws).channels.includes("live"));
    const needsStreams = sockets.some((ws) => this.readAttachment(ws).channels.includes("streams"));
    const needsSupport = sockets.some((ws) => this.readAttachment(ws).channels.includes("support"));

    let livePayload: Awaited<ReturnType<typeof fetchTraccarLivePayload>> | null = null;
    let traccarEvents: any[] | null = null;
    let supportSnapshot: Awaited<ReturnType<typeof fetchSupportSnapshot>> | null = null;

    if (needsLive) {
      livePayload =
        (await fetchTraccarLiveFromBridge(this.env)) ??
        (await fetchTraccarLivePayload(this.env));
      if (this.tenantId) {
        void registerTraccarLiveInterest(this.env, this.tenantId);
      }
    }
    if (needsStreams) traccarEvents = await fetchTraccarEventsWindow(this.env, 15_000);
    if (needsSupport) supportSnapshot = await this.buildSupportSnapshot();

    for (const ws of sockets) {
      const attachment = this.readAttachment(ws);
      if (!attachment.channels.length) continue;
      let pushed = false;

      if (attachment.channels.includes("live") && livePayload) {
        const hash = stablePayloadHash(livePayload.live);
        if (hash !== attachment.lastLiveHash) {
          attachment.lastLiveHash = hash;
          sendJson(ws, "live.positions", livePayload);
          pushed = true;
        }
        const { events, newestAt } = await fetchTelemetryEventsSince(
          this.env,
          this.tenantId,
          attachment.telemetrySince
        );
        if (events.length) {
          attachment.telemetrySince = newestAt || attachment.telemetrySince;
          sendJson(ws, "live.telemetry", events);
          pushed = true;
        }
      }

      if (attachment.channels.includes("streams") && traccarEvents) {
        const alerts = attachment.userId
          ? await fetchUserAlerts(this.env, this.tenantId, attachment.userId)
          : [];
        const payload = { events: traccarEvents, alerts, tenantId: this.tenantId };
        const hash = stablePayloadHash({
          eventCount: traccarEvents.length,
          alertCount: alerts.length,
          lastEvent: traccarEvents[0]?.id ?? traccarEvents[0]?.type,
          lastAlert: (alerts[0] as any)?.id
        });
        if (hash !== attachment.lastStreamsHash) {
          attachment.lastStreamsHash = hash;
          sendJson(ws, "streams.events", payload);
          pushed = true;
        }
      }

      if (attachment.channels.includes("support") && supportSnapshot) {
        const hash = stablePayloadHash({
          at: supportSnapshot.at,
          inbox: supportSnapshot.conversations.map((c) => ({
            id: c.id,
            n: Array.isArray(c.messages) ? c.messages.length : 0
          })),
          online: Object.values(supportSnapshot.categories).flat().filter((a: any) => a?.online).length
        });
        if (hash !== attachment.lastSupportHash) {
          attachment.lastSupportHash = hash;
          sendJson(ws, "support.snapshot", supportSnapshot);
          pushed = true;
        }
        if (attachment.watchConversationId) {
          const conversation = await readConversationById(
            this.env,
            this.tenantId,
            attachment.watchConversationId
          );
          if (conversation) {
            sendJson(ws, "support.conversation", conversation);
            pushed = true;
          }
        }
      }

      // Keep proxies/clients awake when Traccar payload hashes are unchanged.
      if (!pushed) {
        sendJson(ws, "tick", { at: new Date().toISOString() });
      }

      this.writeAttachment(ws, attachment);
    }
  }

  private async pushLiveToAll(incoming: TraccarLivePayload | null) {
    if (!this.tenantId) return;
    const livePayload =
      incoming && Array.isArray(incoming.live)
        ? incoming
        : (await fetchTraccarLiveFromBridge(this.env)) ?? (await fetchTraccarLivePayload(this.env));
    const hash = stablePayloadHash(livePayload.live);
    for (const ws of this.state.getWebSockets()) {
      const attachment = this.readAttachment(ws);
      if (!attachment.channels.includes("live")) continue;
      if (hash === attachment.lastLiveHash) continue;
      attachment.lastLiveHash = hash;
      this.writeAttachment(ws, attachment);
      sendJson(ws, "live.positions", livePayload);
    }
  }

  private async pushCatalogToAll(body: { reason?: string; site?: string }) {
    if (!this.tenantId) return;
    const payload = {
      tenantId: this.tenantId,
      reason: String(body?.reason ?? "assets").trim() || "assets",
      site: String(body?.site ?? "").trim(),
      at: new Date().toISOString()
    };
    for (const ws of this.state.getWebSockets()) {
      const attachment = this.readAttachment(ws);
      // Live Tracking and Streams both keep asset lists — notify anyone subscribed.
      if (!attachment.channels.includes("live") && !attachment.channels.includes("streams")) continue;
      sendJson(ws, "catalog.assets", payload);
    }
  }

  private async pushStreamsToAll(events: any[], alerts: any[] = []) {
    if (!this.tenantId || (!events.length && !alerts.length)) return;
    const hash = stablePayloadHash({
      events: events.map((e) => e?.id ?? e),
      alerts: alerts.map((a) => a?.id ?? a)
    });
    for (const ws of this.state.getWebSockets()) {
      const attachment = this.readAttachment(ws);
      if (!attachment.channels.includes("streams")) continue;
      if (hash === attachment.lastStreamsHash) continue;
      attachment.lastStreamsHash = hash;
      this.writeAttachment(ws, attachment);
      sendJson(ws, "streams.events", { events, alerts, tenantId: this.tenantId });
    }
  }

  private async pushForSocket(ws: WebSocket, force = false) {
    const attachment = this.readAttachment(ws);
    if (!this.tenantId || !attachment.channels.length) return;

    if (attachment.channels.includes("live")) {
      void registerTraccarLiveInterest(this.env, this.tenantId);
      const livePayload =
        (await fetchTraccarLiveFromBridge(this.env)) ?? (await fetchTraccarLivePayload(this.env));
      const hash = stablePayloadHash(livePayload.live);
      if (force || hash !== attachment.lastLiveHash) {
        attachment.lastLiveHash = hash;
        sendJson(ws, "live.positions", livePayload);
      }
    }
    if (attachment.channels.includes("streams")) {
      const events = await fetchTraccarEventsWindow(this.env, 15_000);
      const alerts = attachment.userId
        ? await fetchUserAlerts(this.env, this.tenantId, attachment.userId)
        : [];
      sendJson(ws, "streams.events", { events, alerts, tenantId: this.tenantId });
      attachment.lastStreamsHash = stablePayloadHash({ events: events.length, alerts: alerts.length });
    }
    if (attachment.channels.includes("support")) {
      const snapshot = await this.buildSupportSnapshot();
      if (snapshot) {
        sendJson(ws, "support.snapshot", snapshot);
        attachment.lastSupportHash = stablePayloadHash(snapshot.at);
      }
    }
    this.writeAttachment(ws, attachment);
  }

  private async pushSupportToAll(force = false) {
    if (!this.tenantId) return;
    const snapshot = await this.buildSupportSnapshot();
    if (!snapshot) return;
    const hash = stablePayloadHash({
      at: snapshot.at,
      inbox: snapshot.conversations.map((c) => ({
        id: c.id,
        n: Array.isArray(c.messages) ? c.messages.length : 0
      })),
      online: Object.values(snapshot.categories).flat().filter((a: any) => a?.online).length
    });
    for (const ws of this.state.getWebSockets()) {
      const attachment = this.readAttachment(ws);
      if (!attachment.channels.includes("support")) continue;
      if (!force && hash === attachment.lastSupportHash) continue;
      attachment.lastSupportHash = hash;
      this.writeAttachment(ws, attachment);
      sendJson(ws, "support.snapshot", snapshot);
      if (attachment.watchConversationId) {
        const conversation = await readConversationById(
          this.env,
          this.tenantId,
          attachment.watchConversationId
        );
        if (conversation) sendJson(ws, "support.conversation", conversation);
      }
    }
  }
}

export async function notifyRealtimeSupport(
  env: VpsProxyEnv,
  tenantId: string
): Promise<void> {
  const tid = String(tenantId ?? "").trim();
  if (!tid) return;
  await notifyRealtimeOnVps(env, tid, "support");
}

/** Fan live.positions into a tenant hub (used by TraccarSocketBridge and optional callers). */
export async function notifyRealtimeLive(
  env: VpsProxyEnv,
  tenantId: string,
  payload: TraccarLivePayload
): Promise<void> {
  const tid = String(tenantId ?? "").trim();
  if (!tid) return;
  await notifyRealtimeOnVps(env, tid, "live", payload);
}

/** Tell connected clients to reload the asset catalog (adds/edits/deletes). */
export async function notifyRealtimeCatalog(
  env: VpsProxyEnv,
  tenantId: string,
  payload?: { reason?: string; site?: string }
): Promise<void> {
  const tid = String(tenantId ?? "").trim();
  if (!tid) return;
  await notifyRealtimeOnVps(env, tid, "catalog", payload ?? { reason: "assets" });
}

/** Record agent presence in the tenant realtime DO (survives KV quota limits). */
export async function notifyRealtimePresence(
  env: VpsProxyEnv,
  tenantId: string,
  agentId: string
): Promise<void> {
  const tid = String(tenantId ?? "").trim();
  const aid = String(agentId ?? "").trim();
  if (!tid || !aid) return;
  await notifyRealtimeOnVps(env, tid, "presence", { agentId: aid });
}

export async function fetchRealtimePresenceMap(
  env: { REALTIME_HUB?: DurableObjectNamespace },
  tenantId: string
): Promise<Record<string, string>> {
  const tid = String(tenantId ?? "").trim();
  const ns = env.REALTIME_HUB;
  if (!tid || !ns) return {};
  try {
    const id = ns.idFromName(tid);
    const stub = ns.get(id);
    const res = await stub.fetch(`https://realtime/presence?tenant=${encodeURIComponent(tid)}`, {
      method: "GET",
      headers: { "x-tenant-id": tid }
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { presence?: Record<string, string> };
    return data?.presence && typeof data.presence === "object" ? data.presence : {};
  } catch {
    return {};
  }
}

/** Durable route-library blob for a tenant+site (survives when B2 secrets are missing). */
export async function readRouteLibraryFromDurableStore(
  env: { REALTIME_HUB?: DurableObjectNamespace },
  tenantId: string,
  site: string
): Promise<string | null> {
  const tid = String(tenantId ?? "").trim();
  const siteName = String(site ?? "").trim();
  const ns = env.REALTIME_HUB;
  if (!tid || !siteName || !ns) return null;
  try {
    const id = ns.idFromName(tid);
    const stub = ns.get(id);
    const res = await stub.fetch(
      `https://realtime/routes-library?tenant=${encodeURIComponent(tid)}&site=${encodeURIComponent(siteName)}`,
      { method: "GET", headers: { "x-tenant-id": tid } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { raw?: string | null };
    const raw = String(data?.raw ?? "").trim();
    return raw || null;
  } catch {
    return null;
  }
}

export async function writeRouteLibraryToDurableStore(
  env: { REALTIME_HUB?: DurableObjectNamespace },
  tenantId: string,
  site: string,
  payloadText: string
): Promise<boolean> {
  const tid = String(tenantId ?? "").trim();
  const siteName = String(site ?? "").trim();
  const ns = env.REALTIME_HUB;
  if (!tid || !siteName || !ns) return false;
  try {
    const id = ns.idFromName(tid);
    const stub = ns.get(id);
    const res = await stub.fetch(
      `https://realtime/routes-library?tenant=${encodeURIComponent(tid)}&site=${encodeURIComponent(siteName)}`,
      {
        method: "PUT",
        headers: { "x-tenant-id": tid, "content-type": "application/json" },
        body: payloadText
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function readScopedKvFromDurableStore(
  env: { REALTIME_HUB?: DurableObjectNamespace },
  tenantId: string,
  key: string
): Promise<string | null> {
  const tid = String(tenantId ?? "").trim();
  const scopedKey = String(key ?? "").trim();
  const ns = env.REALTIME_HUB;
  if (!tid || !scopedKey || !ns) return null;
  try {
    const id = ns.idFromName(tid);
    const stub = ns.get(id);
    const res = await stub.fetch(
      `https://realtime/scoped-kv?tenant=${encodeURIComponent(tid)}&key=${encodeURIComponent(scopedKey)}`,
      { method: "GET", headers: { "x-tenant-id": tid } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { raw?: string | null };
    const raw = String(data?.raw ?? "").trim();
    return raw || null;
  } catch {
    return null;
  }
}

export async function writeScopedKvToDurableStore(
  env: { REALTIME_HUB?: DurableObjectNamespace },
  tenantId: string,
  key: string,
  payloadText: string
): Promise<boolean> {
  const tid = String(tenantId ?? "").trim();
  const scopedKey = String(key ?? "").trim();
  const ns = env.REALTIME_HUB;
  if (!tid || !scopedKey || !ns) return false;
  try {
    const id = ns.idFromName(tid);
    const stub = ns.get(id);
    const res = await stub.fetch(
      `https://realtime/scoped-kv?tenant=${encodeURIComponent(tid)}&key=${encodeURIComponent(scopedKey)}`,
      {
        method: "PUT",
        headers: { "x-tenant-id": tid, "content-type": "application/json" },
        body: payloadText
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}
