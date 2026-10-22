import { afterEach, describe, expect, it, vi } from "vitest";
import { registerOperationalHierarchyRoutes } from "../presentation/storage/registerOperationalHierarchyRoutes";
import { registerOperationalRealtimeRoutes } from "../presentation/storage/registerOperationalRealtimeRoutes";
import {
  isOperationalD1Path,
  listRealtimePresenceFromVps,
  resolveVpsOrigin,
  readHierarchyFromVps,
  readRealtimeStateFromVps,
  writeRealtimeStateToVps,
  writeHierarchyToVps,
} from "./vpsOperationalProxy";

const env = {
  VPS_ORIGIN: "https://vps.example",
  API_KEY_PERMANENT: "test-worker-key",
};

describe("operational request routing", () => {
  it("keeps the Traccar asset import on the Worker", () => {
    expect(isOperationalD1Path("/d1/assets")).toBe(true);
    expect(isOperationalD1Path("/d1/assets/import-traccar")).toBe(false);
    expect(isOperationalD1Path("/d1/assets/import-traccar?tenant=region%3Aza%3Ademo")).toBe(false);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VPS origin resolution", () => {
  it("accepts the dedicated HTTPS VPS API hostname", () => {
    expect(resolveVpsOrigin({ VPS_ORIGIN: "https://vps-api.vivitelematics.ca" })).toBe(
      "https://vps-api.vivitelematics.ca",
    );
  });
});

describe("VPS hierarchy persistence", () => {
  it("reads the regional hierarchy from the protected VPS endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ hierarchy: { dealers: [{ id: "dealer-1" }] } }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(readHierarchyFromVps(env, "za")).resolves.toEqual({
      dealers: [{ id: "dealer-1" }],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vps.example/operational/hierarchy");
    expect((init.headers as Headers).get("x-api-key")).toBe("test-worker-key");
    expect((init.headers as Headers).get("x-vivi-region")).toBe("za");
  });

  it("writes hierarchy updates to the VPS and requires confirmation", async () => {
    const hierarchy = { dealers: [{ id: "dealer-1" }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ stored: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      writeHierarchyToVps(env, "us", hierarchy),
    ).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vps.example/operational/hierarchy");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ hierarchy }));
    expect((init.headers as Headers).get("x-api-key")).toBe("test-worker-key");
    expect((init.headers as Headers).get("x-vivi-region")).toBe("us");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    await expect(writeHierarchyToVps(env, "us", hierarchy)).rejects.toThrow(
      "VPS hierarchy store did not confirm the write.",
    );
  });

  it("fails explicitly when the VPS is unavailable or rejects the request", async () => {
    await expect(readHierarchyFromVps({}, "us")).rejects.toThrow(
      "VPS origin is not configured",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    );
    await expect(readHierarchyFromVps(env, "us")).rejects.toThrow(
      "VPS hierarchy read failed (503)",
    );
  });

  it("stores hierarchy in regional SQLite behind API-key authentication", () => {
    const handlers: Record<string, (req: any, res: any) => unknown> = {};
    const app = {
      get: vi.fn((path: string, handler: (req: any, res: any) => unknown) => {
        handlers[`GET ${path}`] = handler;
      }),
      put: vi.fn((path: string, handler: (req: any, res: any) => unknown) => {
        handlers[`PUT ${path}`] = handler;
      }),
    };
    const run = vi.fn();
    const db = {
      prepare: vi.fn(() => ({
        get: () => ({
          data: JSON.stringify({ dealers: [{ id: "dealer-1" }] }),
          updated_at: "now",
        }),
        run,
      })),
    };
    const requireApiKey = vi.fn(() => true);
    registerOperationalHierarchyRoutes({ app: app as any, db, requireApiKey });

    const response = {
      status: vi.fn(function (this: any) {
        return this;
      }),
      json: vi.fn(function (this: any) {
        return this;
      }),
    };
    const request = {
      header: (name: string) => (name === "x-vivi-region" ? "za" : ""),
      body: { hierarchy: { dealers: [{ id: "dealer-2" }] } },
    };

    handlers["GET /operational/hierarchy"](request, response);
    expect(response.json).toHaveBeenCalledWith({
      hierarchy: { dealers: [{ id: "dealer-1" }] },
      updatedAt: "now",
    });

    handlers["PUT /operational/hierarchy"](request, response);
    expect(db.prepare).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO operational_hierarchies"),
    );
    expect(run).toHaveBeenCalledWith(
      "za",
      JSON.stringify(request.body.hierarchy),
      expect.any(String),
    );

    requireApiKey.mockReturnValue(false);
    db.prepare.mockClear();
    handlers["PUT /operational/hierarchy"](request, response);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(db.prepare).not.toHaveBeenCalled();
  });
});

describe("VPS realtime state persistence", () => {
  it("reads and writes tenant-scoped state through the authenticated VPS API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: "stored-payload" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stored: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ presence: { agent: "2026-01-01T00:00:00Z" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readRealtimeStateFromVps(env, "tenant-a", "scoped-kv:key"))
      .resolves.toBe("stored-payload");
    await expect(writeRealtimeStateToVps(env, "tenant-a", "presence:agent", "now", "later"))
      .resolves.toBeUndefined();
    await expect(listRealtimePresenceFromVps(env, "tenant-a"))
      .resolves.toEqual({ agent: "2026-01-01T00:00:00Z" });

    const [readUrl, readInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(readUrl).toContain("/operational/realtime/state?tenant=tenant-a&key=scoped-kv%3Akey");
    expect((readInit.headers as Headers).get("x-api-key")).toBe("test-worker-key");
    const [writeUrl, writeInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(writeUrl).toContain("tenant=tenant-a");
    expect(writeInit.method).toBe("PUT");
    expect(JSON.parse(String(writeInit.body))).toEqual({ value: "now", expiresAt: "later" });
  });

  it("stores and expires state on the VPS behind API-key authentication", () => {
    const handlers: Record<string, (req: any, res: any) => unknown> = {};
    const app = {
      get: vi.fn((path: string, handler: (req: any, res: any) => unknown) => {
        handlers[`GET ${path}`] = handler;
      }),
      put: vi.fn((path: string, handler: (req: any, res: any) => unknown) => {
        handlers[`PUT ${path}`] = handler;
      }),
    };
    const state = new Map<string, { data: string; expires_at: string | null }>();
    const db = {
      prepare: vi.fn((sql: string) => ({
        get: (tenantId: string, key: string) => state.get(`${tenantId}:${key}`),
        all: (tenantId: string, now: string) =>
          Array.from(state.entries())
            .filter(([compoundKey, row]) =>
              compoundKey.startsWith(`${tenantId}:presence:`) &&
              (!row.expires_at || row.expires_at > now)
            )
            .map(([compoundKey, row]) => ({ k: compoundKey.slice(tenantId.length + 1), data: row.data })),
        run: (...args: string[]) => {
          if (sql.startsWith("INSERT INTO operational_realtime_state")) {
            const [tenantId, key, data, expiresAt] = args;
            state.set(`${tenantId}:${key}`, { data, expires_at: expiresAt || null });
          } else if (sql.startsWith("DELETE FROM operational_realtime_state")) {
            state.delete(`${args[0]}:${args[1]}`);
          }
        },
      })),
    };
    const requireApiKey = vi.fn(() => true);
    registerOperationalRealtimeRoutes({ app: app as any, db, requireApiKey });
    const response = {
      status: vi.fn(function (this: any) { return this; }),
      json: vi.fn(function (this: any) { return this; }),
    };
    const request = (key: string, body: unknown = {}) => ({
      query: { tenant: "tenant-a", key },
      header: () => "",
      body,
    });

    handlers["PUT /operational/realtime/state"](
      request("presence:agent", { value: "2026-01-01T00:00:00Z", expiresAt: "2999-01-01T00:00:00Z" }),
      response,
    );
    expect(response.json).toHaveBeenCalledWith({ stored: true });
    response.json.mockClear();
    handlers["GET /operational/realtime/state"](request("presence:agent"), response);
    expect(response.json).toHaveBeenCalledWith({ value: "2026-01-01T00:00:00Z" });
    response.json.mockClear();
    handlers["GET /operational/realtime/presence"](
      { query: { tenant: "tenant-a" }, header: () => "" },
      response,
    );
    expect(response.json).toHaveBeenCalledWith({ presence: { agent: "2026-01-01T00:00:00Z" } });
    response.json.mockClear();
    handlers["PUT /operational/realtime/state"](
      request("presence:expired", { value: "stale", expiresAt: "2000-01-01T00:00:00Z" }),
      response,
    );
    response.json.mockClear();
    handlers["GET /operational/realtime/state"](request("presence:expired"), response);
    expect(response.json).toHaveBeenCalledWith({ value: null });

    requireApiKey.mockReturnValue(false);
    db.prepare.mockClear();
    handlers["PUT /operational/realtime/state"](
      request("presence:agent", { value: "should-not-store" }),
      response,
    );
    expect(response.status).toHaveBeenCalledWith(401);
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
