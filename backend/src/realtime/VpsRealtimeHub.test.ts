import express from "express";
import { createServer } from "http";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { attachVpsRealtimeHub } from "./VpsRealtimeHub";

describe("VPS realtime WebSocket hub", () => {
  let server: ReturnType<typeof createServer> | undefined;
  let client: WebSocket | undefined;

  afterEach(async () => {
    client?.close();
    if (server?.listening) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    client = undefined;
    server = undefined;
  });

  it("authenticates Worker-forwarded WebSockets and emits subscribed Traccar live data", async () => {
    const app = express();
    app.use(express.json());
    server = createServer(app);
    attachVpsRealtimeHub(server, app, {
      apiKey: "worker-secret",
      db: {
        prepare: () => ({
          all: () => [],
          get: () => undefined
        })
      },
      traccarFetch: vi.fn(async (path: string) => ({
        ok: true,
        status: 200,
        body:
          path === "/api/devices?all=true"
            ? [{ id: 7, uniqueId: "imei-7", name: "Truck 7", status: "online" }]
            : [{ deviceId: 7, latitude: -1.2, longitude: 36.8, speed: 4 }]
      })),
      listSupportDeskAgents: () => []
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener.");

    client = new WebSocket(`ws://127.0.0.1:${address.port}/ws?tenant=tenant-a`, {
      headers: {
        "x-api-key": "worker-secret",
        "x-tenant-id": "tenant-a",
        "x-vivi-forwarded-by": "cloudflare-worker"
      }
    });
    const envelopes: Array<{ type: string; payload?: any }> = [];
    client.on("message", (data) => {
      const message = JSON.parse(data.toString());
      envelopes.push(message);
      if (message.type === "ready") client?.send(JSON.stringify({ type: "subscribe", channels: ["live"] }));
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for live data.")), 5_000);
      const check = setInterval(() => {
        if (envelopes.some((message) => message.type === "live.positions")) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        }
      }, 20);
      client!.once("error", reject);
    });
    const live = envelopes.find((message) => message.type === "live.positions");
    expect(live?.payload.live).toMatchObject([
      { deviceId: 7, imei: "imei-7", name: "Truck 7", position: { lat: -1.2, lng: 36.8 } }
    ]);
  });
});
