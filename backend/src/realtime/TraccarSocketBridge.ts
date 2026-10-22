/**
 * Singleton Durable Object that opens one Traccar session + /api/socket
 * and fans live.positions into per-tenant ViviRealtimeHub instances.
 */

import {
  fetchTraccarLivePayload,
  type RealtimeEnv
} from "./realtimeSources";
import { buildTraccarLivePayload, type TraccarLivePayload } from "./traccarLivePayload";

const BRIDGE_NAME = "__traccar_socket_bridge__";
const RECONNECT_ALARM_MS = 15_000;
const INTEREST_TTL_MS = 5 * 60_000;
const EVENT_RING_MAX = 200;

type BridgeEnv = RealtimeEnv & {
  REALTIME_HUB?: DurableObjectNamespace;
  TRACCAR_SOCKET_BRIDGE?: DurableObjectNamespace;
};

type InterestMap = Record<string, number>;

const normalizeBase = (raw: string) =>
  String(raw ?? "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/api$/i, "");

const pickSetCookie = (headers: Headers): string => {
  const anyHeaders = headers as Headers & { getAll?: (name: string) => string[] };
  const all =
    typeof anyHeaders.getAll === "function"
      ? anyHeaders.getAll("set-cookie")
      : [headers.get("set-cookie") ?? ""];
  return all
    .flatMap((value) => String(value ?? "").split(/,(?=[^;]+?=)/))
    .map((part) => String(part ?? "").split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
};

export class TraccarSocketBridge implements DurableObject {
  private devices = new Map<number, any>();
  private positions = new Map<number, any>();
  private cookie = "";
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private lastPayload: TraccarLivePayload | null = null;
  private lastError = "";
  private interested: InterestMap = {};
  private recentEvents: any[] = [];

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: BridgeEnv
  ) {
    this.state.blockConcurrencyWhile(async () => {
      this.cookie = String((await this.state.storage.get<string>("cookie")) ?? "").trim();
      this.interested = ((await this.state.storage.get<InterestMap>("interested")) ?? {}) as InterestMap;
      this.lastPayload = ((await this.state.storage.get<TraccarLivePayload>("lastPayload")) ?? null) as TraccarLivePayload | null;
    });
  }

  private async ensureAlarm(ms = RECONNECT_ALARM_MS) {
    const existing = await this.state.storage.getAlarm();
    if (existing == null) {
      await this.state.storage.setAlarm(Date.now() + ms);
    }
  }

  private async persistInterest() {
    await this.state.storage.put("interested", this.interested);
  }

  private async persistCookie() {
    if (this.cookie) await this.state.storage.put("cookie", this.cookie);
    else await this.state.storage.delete("cookie");
  }

  private buildPayload(source: TraccarLivePayload["source"] = "socket"): TraccarLivePayload {
    const payload = buildTraccarLivePayload(
      Array.from(this.devices.values()),
      Array.from(this.positions.values()),
      { source, degraded: this.socket == null }
    );
    this.lastPayload = payload;
    void this.state.storage.put("lastPayload", payload);
    return payload;
  }

  private async openSession(): Promise<boolean> {
    const base = normalizeBase(String(this.env.TRACCAR_BASE_URL ?? ""));
    if (!base) {
      this.lastError = "TRACCAR_BASE_URL not configured";
      return false;
    }

    const token = String(this.env.TRACCAR_TOKEN ?? "").trim();
    const user = String(this.env.TRACCAR_USERNAME ?? "").trim();
    const pass = String(this.env.TRACCAR_PASSWORD ?? "").trim();

    const attempts: Array<() => Promise<Response>> = [];
    if (token) {
      attempts.push(() =>
        fetch(`${base}/api/session?token=${encodeURIComponent(token)}`, {
          method: "GET",
          redirect: "manual"
        })
      );
    }
    if (user && pass) {
      attempts.push(() => {
        const body = new URLSearchParams({ email: user, password: pass });
        return fetch(`${base}/api/session`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body,
          redirect: "manual"
        });
      });
    }

    for (const attempt of attempts) {
      try {
        const resp = await attempt();
        const cookie = pickSetCookie(resp.headers);
        if (cookie) {
          this.cookie = cookie;
          await this.persistCookie();
        }
        if (resp.ok || (resp.status >= 300 && resp.status < 400 && cookie)) {
          this.lastError = "";
          return Boolean(this.cookie);
        }
        this.lastError = `session HTTP ${resp.status}`;
      } catch (err: any) {
        this.lastError = String(err?.message ?? err);
      }
    }
    return Boolean(this.cookie);
  }

  private async seedFromHttp() {
    const seeded = await fetchTraccarLivePayload(this.env);
    if (!seeded.ok || !Array.isArray(seeded.live)) return;
    // Reconstruct device/position maps from the HTTP live rows so socket deltas merge cleanly.
    for (const row of seeded.live) {
      const id = Number(row?.deviceId ?? 0);
      if (!Number.isFinite(id) || id <= 0) continue;
      this.devices.set(id, {
        id,
        uniqueId: row.imei,
        name: row.name,
        status: row.status,
        lastUpdate: row.lastUpdate,
        attributes: row.fuelConfig ? { viviFuelComputeEnabled: row.fuelConfig.enabled } : undefined
      });
      if (row.position) {
        this.positions.set(id, {
          deviceId: id,
          latitude: row.position.lat,
          longitude: row.position.lng,
          speed: row.position.speed,
          course: row.position.course ?? row.position.heading,
          altitude: row.position.altitude,
          accuracy: row.position.accuracy,
          address: row.position.address,
          valid: row.position.valid,
          protocol: row.position.protocol,
          serverTime: row.position.serverTime,
          fixTime: row.position.fixTime,
          deviceTime: row.position.deviceTime,
          geofenceIds: row.position.geofenceIds,
          attributes: row.position.attributes
        });
      }
    }
    this.lastPayload = { ...seeded, source: "http" };
    await this.state.storage.put("lastPayload", this.lastPayload);
  }

  private applySocketMessage(raw: string): { liveChanged: boolean; events: any[] } {
    let body: any = null;
    try {
      body = JSON.parse(raw);
    } catch {
      return { liveChanged: false, events: [] };
    }
    let liveChanged = false;
    const devices = Array.isArray(body?.devices) ? body.devices : [];
    const positions = Array.isArray(body?.positions) ? body.positions : [];
    const events = Array.isArray(body?.events) ? body.events : [];
    for (const device of devices) {
      const id = Number(device?.id ?? 0);
      if (!Number.isFinite(id) || id <= 0) continue;
      this.devices.set(id, { ...(this.devices.get(id) ?? {}), ...device });
      liveChanged = true;
    }
    for (const position of positions) {
      const id = Number(position?.deviceId ?? 0);
      if (!Number.isFinite(id) || id <= 0) continue;
      this.positions.set(id, position);
      liveChanged = true;
    }
    if (events.length) {
      this.recentEvents = [...this.recentEvents, ...events].slice(-EVENT_RING_MAX);
    }
    return { liveChanged, events };
  }

  private interestedTenants(): string[] {
    const now = Date.now();
    return Object.entries(this.interested)
      .filter(([, at]) => now - Number(at ?? 0) < INTEREST_TTL_MS)
      .map(([tenantId]) => tenantId);
  }

  private async fanOutLive() {
    const payload = this.buildPayload("socket");
    const tenants = this.interestedTenants();
    const ns = this.env.REALTIME_HUB;
    if (!tenants.length || !ns) return;
    await Promise.allSettled(
      tenants.map(async (tenantId) => {
        try {
          const stub = ns.get(ns.idFromName(tenantId));
          await stub.fetch(`https://realtime/notify/live?tenant=${encodeURIComponent(tenantId)}`, {
            method: "POST",
            headers: { "x-tenant-id": tenantId, "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
        } catch {
          // best-effort
        }
      })
    );
  }

  private async fanOutEvents(events: any[]) {
    if (!events.length) return;
    const tenants = this.interestedTenants();
    const ns = this.env.REALTIME_HUB;
    if (!tenants.length || !ns) return;
    await Promise.allSettled(
      tenants.map(async (tenantId) => {
        try {
          const stub = ns.get(ns.idFromName(tenantId));
          await stub.fetch(`https://realtime/notify/streams?tenant=${encodeURIComponent(tenantId)}`, {
            method: "POST",
            headers: { "x-tenant-id": tenantId, "content-type": "application/json" },
            body: JSON.stringify({ events, alerts: [], tenantId })
          });
        } catch {
          // best-effort
        }
      })
    );
  }

  private async connectSocket(): Promise<void> {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const base = normalizeBase(String(this.env.TRACCAR_BASE_URL ?? ""));
      if (!base) {
        this.lastError = "TRACCAR_BASE_URL not configured";
        return;
      }
      if (!this.cookie && !String(this.env.TRACCAR_TOKEN ?? "").trim()) {
        const ok = await this.openSession();
        if (!ok) return;
      }
      if (!this.devices.size) {
        await this.seedFromHttp();
      }

      const httpUrl = new URL(base.includes("://") ? base : `http://${base}`);
      const wsProtocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
      // AsyncSocketServlet accepts ?token= (preferred) or session cookie.
      const token = String(this.env.TRACCAR_TOKEN ?? "").trim();
      const wsUrl = token
        ? `${wsProtocol}//${httpUrl.host}/api/socket?token=${encodeURIComponent(token)}`
        : `${wsProtocol}//${httpUrl.host}/api/socket`;

      try {
        const headers: Record<string, string> = {
          Upgrade: "websocket",
          Connection: "Upgrade",
          Origin: httpUrl.origin
        };
        if (this.cookie) headers.Cookie = this.cookie;
        const resp = await fetch(wsUrl, { headers });
        const socket = resp.webSocket;
        if (!socket) {
          this.lastError = `socket upgrade failed (${resp.status})`;
          // Cookie may be stale — clear and retry next alarm.
          if (resp.status === 401 || resp.status === 403) {
            this.cookie = "";
            await this.persistCookie();
          }
          return;
        }
        socket.accept();
        this.socket = socket;
        this.lastError = "";

        socket.addEventListener("message", (event) => {
          const text = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
          const applied = this.applySocketMessage(text);
          if (applied.liveChanged) void this.fanOutLive();
          if (applied.events.length) void this.fanOutEvents(applied.events);
        });
        socket.addEventListener("close", () => {
          this.socket = null;
          void this.ensureAlarm(3_000);
        });
        socket.addEventListener("error", () => {
          this.socket = null;
          this.lastError = "socket error";
          void this.ensureAlarm(3_000);
        });

        // Push current cache immediately after connect.
        void this.fanOutLive();
      } catch (err: any) {
        this.lastError = String(err?.message ?? err);
        this.socket = null;
      }
    })().finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  private pruneInterest() {
    const now = Date.now();
    let changed = false;
    for (const [tenantId, at] of Object.entries(this.interested)) {
      if (now - Number(at ?? 0) >= INTEREST_TTL_MS) {
        delete this.interested[tenantId];
        changed = true;
      }
    }
    return changed;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path.endsWith("/interest") || path === "/interest") {
      const tenantId = String(url.searchParams.get("tenant") ?? request.headers.get("x-tenant-id") ?? "").trim();
      if (!tenantId) {
        return new Response(JSON.stringify({ ok: false, error: "tenant required" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      this.interested[tenantId] = Date.now();
      await this.persistInterest();
      await this.connectSocket();
      await this.ensureAlarm();
      return new Response(JSON.stringify({ ok: true, tenantId, socket: Boolean(this.socket) }), {
        headers: { "content-type": "application/json" }
      });
    }

    if (path.endsWith("/live") || path === "/live" || path === "/") {
      await this.connectSocket();
      await this.ensureAlarm();
      if (!this.lastPayload || !this.lastPayload.live?.length) {
        await this.seedFromHttp();
      }
      const payload = this.lastPayload ?? this.buildPayload(this.socket ? "socket" : "cache");
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" }
      });
    }

    if (path.endsWith("/status") || path === "/status") {
      return new Response(
        JSON.stringify({
          ok: true,
          socket: Boolean(this.socket),
          devices: this.devices.size,
          positions: this.positions.size,
          interested: Object.keys(this.interested).length,
          error: this.lastError || undefined
        }),
        { headers: { "content-type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: false, error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });
  }

  async alarm(): Promise<void> {
    try {
      if (this.pruneInterest()) await this.persistInterest();
      const hasInterest = Object.keys(this.interested).length > 0;
      if (!hasInterest) {
        try {
          this.socket?.close();
        } catch {
          // ignore
        }
        this.socket = null;
        return;
      }
      if (!this.socket) {
        await this.connectSocket();
      } else if (!this.devices.size) {
        await this.seedFromHttp();
        await this.fanOutLive();
      }
    } finally {
      if (Object.keys(this.interested).length > 0) {
        await this.state.storage.setAlarm(Date.now() + RECONNECT_ALARM_MS);
      }
    }
  }
}

export async function registerTraccarLiveInterest(
  env: { TRACCAR_SOCKET_BRIDGE?: DurableObjectNamespace },
  tenantId: string
): Promise<void> {
  const tid = String(tenantId ?? "").trim();
  const ns = env.TRACCAR_SOCKET_BRIDGE;
  if (!tid || !ns) return;
  try {
    const stub = ns.get(ns.idFromName(BRIDGE_NAME));
    await stub.fetch(`https://traccar-bridge/interest?tenant=${encodeURIComponent(tid)}`, {
      method: "POST",
      headers: { "x-tenant-id": tid }
    });
  } catch {
    // best-effort
  }
}

export async function fetchTraccarLiveFromBridge(
  env: { TRACCAR_SOCKET_BRIDGE?: DurableObjectNamespace } & RealtimeEnv
): Promise<TraccarLivePayload | null> {
  const ns = env.TRACCAR_SOCKET_BRIDGE;
  if (!ns) return null;
  try {
    const stub = ns.get(ns.idFromName(BRIDGE_NAME));
    const res = await stub.fetch("https://traccar-bridge/live", { method: "GET" });
    if (!res.ok) return null;
    return (await res.json()) as TraccarLivePayload;
  } catch {
    return null;
  }
}
