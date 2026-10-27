import type { Express } from "express";

interface RegisterTelemetryStreamRouteDeps {
  app: Express;
  db: any;
  requireApiKey: (req: any, res: any) => boolean;
  parseStoredJson: (value: any) => any;
}

export function registerTelemetryStreamRoute(deps: RegisterTelemetryStreamRouteDeps): void {
  const { app, db, requireApiKey, parseStoredJson } = deps;

  app.get("/stream/telemetry", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");

    res.writeHead(200, {
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*"
    });

    // Disable buffering so ping frames keep proxies/load balancers awake.
    (res as any).flushHeaders?.();

    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`);

    const iv = setInterval(() => {
      try {
        const rows = db.prepare("SELECT data, created_at FROM telemetry_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20").all(tenant);
        const events = rows.map((r: any) => parseStoredJson(r.data)).filter(Boolean);
        if (events.length) {
          res.write(`event: telemetry\ndata: ${JSON.stringify(events)}\n\n`);
        } else {
          res.write(`event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
        }
        (res as any).flush?.();
      } catch {
        clearInterval(iv);
        try {
          res.end();
        } catch {
          // ignore
        }
      }
    }, 5000);

    req.on("close", () => clearInterval(iv));
  });
}
