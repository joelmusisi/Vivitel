import { getApiKey, getTenantId, readPrincipalIdentity } from "./api";
import { isLoopbackHost, readRememberedRegion } from "./regionServers";
import { readActiveSiteName, readActiveTenantId } from "./tenantContext";

export type RealtimeChannel = "live" | "streams" | "support";
export type RealtimeStatus = "connecting" | "open" | "closed";

export type RealtimeEnvelope = {
  type: string;
  at?: string;
  payload?: unknown;
};

type Handler = (message: RealtimeEnvelope) => void;

type SubscribeOptions = {
  channels: RealtimeChannel[];
  site?: string;
  userId?: string;
  onMessage?: Handler;
  onStatus?: (status: RealtimeStatus) => void;
};

type Subscriber = {
  id: number;
  channels: RealtimeChannel[];
  site: string;
  userId: string;
  onMessage: Handler | null;
  onStatus: ((status: RealtimeStatus) => void) | null;
};

const MAX_BACKOFF_MS = 30_000;
const PING_INTERVAL_MS = 20_000;
const PONG_TIMEOUT_MS = 45_000;
const HOST_ROTATE_AFTER_FAILURES = 3;
const WS_HOST_CANDIDATES = [
  "https://api.vivitelematics.ca",
  "https://vivi-telematics-api.bwena.workers.dev"
];

function listWsHttpBases(): string[] {
  const bases: string[] = [];
  const push = (value: string) => {
    const next = String(value ?? "").trim().replace(/\/+$/, "");
    if (!next) return;
    if (!bases.includes(next)) bases.push(next);
  };

  if (typeof window !== "undefined") {
    const host = String(window.location.hostname ?? "").toLowerCase();
    // Regional custom domains may be challenged by the zone WAF; use the direct Worker origin.
    if (host.endsWith(".vivi-telematics-frontend.pages.dev")) push(window.location.origin);
    if (host === "api.vivitelematics.ca") {
      push(window.location.origin);
    }
    if (isLoopbackHost(host)) {
      // Stay on the Vite proxy so the chosen server is applied to the websocket too.
      push(window.location.origin);
    }
  }

  for (const candidate of WS_HOST_CANDIDATES) push(candidate);
  return bases;
}

function buildWsUrl(httpBase: string, token: string, tenantId: string, userId: string): string {
  const wsBase = httpBase.replace(/^http/i, "ws");
  const url = new URL("/ws", wsBase.endsWith("/") ? wsBase : `${wsBase}/`);
  url.searchParams.set("token", token);
  url.searchParams.set("tenant", tenantId);
  if (userId) url.searchParams.set("userId", userId);
  if (typeof window !== "undefined" && isLoopbackHost(String(window.location.hostname ?? ""))) {
    const region = readRememberedRegion();
    if (region) url.searchParams.set("region", region);
  }
  return url.toString();
}

/**
 * Shared WebSocket client for Live Tracking, Streams, and Support Command Centre.
 * Keeps one socket alive across page navigations while any subscriber remains.
 */
export class RealtimeWsClient {
  private socket: WebSocket | null = null;
  private status: RealtimeStatus = "closed";
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private pongTimer: number | null = null;
  private backoffMs = 1_000;
  private stopped = true;
  private subscribers = new Map<number, Subscriber>();
  private nextSubscriberId = 1;
  private channels: RealtimeChannel[] = [];
  private site = "";
  private userId = "";
  private watchConversationId = "";
  private hostIndex = 0;
  private consecutiveFailures = 0;
  private connectGeneration = 0;
  private lifecycleBound = false;

  get connectionStatus() {
    return this.status;
  }

  get isOpen() {
    return this.status === "open";
  }

  subscribe(options: SubscribeOptions) {
    this.ensureLifecycleHooks();
    const id = this.nextSubscriberId++;
    const subscriber: Subscriber = {
      id,
      channels: Array.isArray(options.channels) ? [...options.channels] : [],
      site: String(options.site ?? readActiveSiteName() ?? "").trim(),
      userId:
        String(options.userId ?? "").trim() ||
        String(readPrincipalIdentity()?.userId ?? "").trim(),
      onMessage: options.onMessage ?? null,
      onStatus: options.onStatus ?? null
    };
    this.subscribers.set(id, subscriber);
    this.stopped = false;
    this.recomputeSubscription();
    subscriber.onStatus?.(this.status);
    this.connect();
    return () => this.unsubscribe(id);
  }

  send(type: string, payload: Record<string, unknown> = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify({ type, ...payload }));
      return true;
    } catch {
      return false;
    }
  }

  heartbeat(agentId?: string) {
    return this.send("support.heartbeat", {
      agentId: String(agentId ?? this.userId ?? "").trim()
    });
  }

  watchConversation(conversationId: string) {
    this.watchConversationId = String(conversationId ?? "").trim();
    return this.send("support.watchConversation", {
      conversationId: this.watchConversationId
    });
  }

  /** Force a reconnect attempt (e.g. after auth/tenant change). */
  wake() {
    if (this.subscribers.size === 0) return;
    this.stopped = false;
    this.backoffMs = 1_000;
    this.consecutiveFailures = 0;
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendSubscribe();
      return;
    }
    this.disposeSocket();
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.subscribers.clear();
    this.channels = [];
    this.connectGeneration += 1;
    this.clearKeepalive();
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.disposeSocket();
    this.setStatus("closed");
  }

  private unsubscribe(id: number) {
    this.subscribers.delete(id);
    if (this.subscribers.size === 0) {
      this.stop();
      return;
    }
    this.recomputeSubscription();
    this.sendSubscribe();
  }

  private recomputeSubscription() {
    const channelSet = new Set<RealtimeChannel>();
    let site = "";
    let userId = "";
    for (const sub of this.subscribers.values()) {
      for (const channel of sub.channels) channelSet.add(channel);
      if (!site && sub.site) site = sub.site;
      if (!userId && sub.userId) userId = sub.userId;
    }
    this.channels = Array.from(channelSet);
    this.site = site || String(readActiveSiteName() ?? "").trim();
    this.userId = userId || String(readPrincipalIdentity()?.userId ?? "").trim();
  }

  private sendSubscribe() {
    if (!this.channels.length) return;
    this.send("subscribe", {
      channels: this.channels,
      site: this.site,
      userId: this.userId
    });
    if (this.watchConversationId) {
      this.watchConversation(this.watchConversationId);
    }
  }

  private disposeSocket() {
    this.clearKeepalive();
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    try {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      // Avoid Chrome's "closed before the connection is established" when React remounts.
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.addEventListener("open", () => {
          try {
            socket.close();
          } catch {
            // ignore
          }
        });
      } else if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    } catch {
      // ignore
    }
  }

  private setStatus(next: RealtimeStatus) {
    if (this.status === next) return;
    this.status = next;
    for (const sub of this.subscribers.values()) {
      try {
        sub.onStatus?.(next);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  private clearKeepalive() {
    if (this.pingTimer != null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer != null) {
      window.clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private startKeepalive() {
    this.clearKeepalive();
    this.pingTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      const ok = this.send("ping", { at: new Date().toISOString() });
      if (!ok) return;
      if (this.pongTimer != null) window.clearTimeout(this.pongTimer);
      this.pongTimer = window.setTimeout(() => {
        // Missed pong — force reconnect so proxies/idle closes recover quickly.
        this.disposeSocket();
        this.setStatus("closed");
        this.scheduleReconnect();
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  private notePong() {
    if (this.pongTimer != null) {
      window.clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private ensureLifecycleHooks() {
    if (this.lifecycleBound || typeof window === "undefined") return;
    this.lifecycleBound = true;
    window.addEventListener("online", () => this.wake());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.wake();
    });
    window.addEventListener("focus", () => this.wake());
  }

  private connect() {
    if (this.stopped || typeof window === "undefined") return;
    if (this.subscribers.size === 0) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = String(getApiKey() ?? "").trim();
    const tenantId = String(readActiveTenantId() || getTenantId() || "").trim();
    if (!token || !tenantId) {
      this.setStatus("closed");
      this.scheduleReconnect();
      return;
    }

    const bases = listWsHttpBases();
    if (!bases.length) {
      this.setStatus("closed");
      this.scheduleReconnect();
      return;
    }
    if (this.hostIndex >= bases.length) this.hostIndex = 0;
    const httpBase = bases[this.hostIndex] ?? bases[0];
    const generation = ++this.connectGeneration;

    this.setStatus("connecting");
    const url = buildWsUrl(httpBase, token, tenantId, this.userId);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.noteConnectFailure(bases.length);
      this.setStatus("closed");
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (generation !== this.connectGeneration || this.stopped) {
        try {
          socket.close();
        } catch {
          // ignore
        }
        return;
      }
      this.backoffMs = 1_000;
      this.consecutiveFailures = 0;
      this.setStatus("open");
      this.sendSubscribe();
      this.startKeepalive();
    };

    socket.onmessage = (event) => {
      if (generation !== this.connectGeneration || this.stopped) return;
      try {
        const parsed = JSON.parse(String(event.data ?? "")) as RealtimeEnvelope;
        if (!parsed || typeof parsed !== "object" || !parsed.type) return;
        if (parsed.type === "pong" || parsed.type === "tick") {
          this.notePong();
          if (parsed.type === "pong") return;
        }
        for (const sub of this.subscribers.values()) {
          try {
            sub.onMessage?.(parsed);
          } catch {
            // ignore subscriber errors
          }
        }
      } catch {
        // ignore malformed frames
      }
    };

    socket.onerror = () => {
      // onclose handles reconnect / host failover
    };

    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (generation !== this.connectGeneration) return;
      this.clearKeepalive();
      this.setStatus("closed");
      if (this.stopped) return;
      this.noteConnectFailure(bases.length);
      this.scheduleReconnect();
    };
  }

  private noteConnectFailure(baseCount: number) {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= HOST_ROTATE_AFTER_FAILURES) {
      this.hostIndex = (this.hostIndex + 1) % Math.max(baseCount, 1);
      this.consecutiveFailures = 0;
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer != null) return;
    if (this.subscribers.size === 0) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(MAX_BACKOFF_MS, Math.round(this.backoffMs * 1.7));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

/** Singleton helper — one socket per browser tab while any page needs realtime. */
let sharedClient: RealtimeWsClient | null = null;

export function getSharedRealtimeClient(): RealtimeWsClient {
  if (!sharedClient) sharedClient = new RealtimeWsClient();
  return sharedClient;
}
