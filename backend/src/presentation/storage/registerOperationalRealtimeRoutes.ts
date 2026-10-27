import type { Express } from "express";

interface RegisterOperationalRealtimeRoutesDeps {
  app: Express;
  db: any;
  requireApiKey: (req: any, res: any) => boolean;
}

const MAX_VALUE_LENGTH = 5 * 1024 * 1024;

export function registerOperationalRealtimeRoutes(
  deps: RegisterOperationalRealtimeRoutesDeps
): void {
  const { app, db, requireApiKey } = deps;

  app.get("/operational/realtime/state", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenantId = String(req.query.tenant ?? req.header("x-tenant-id") ?? "").trim();
    const key = String(req.query.key ?? "").trim();
    if (!tenantId || !key) return res.status(400).json({ error: "tenant and key are required." });

    const row = db
      .prepare("SELECT data, expires_at FROM operational_realtime_state WHERE tenant_id = ? AND k = ?")
      .get(tenantId, key) as { data?: string; expires_at?: string | null } | undefined;
    if (!row) return res.json({ value: null });

    const expiresAt = String(row.expires_at ?? "");
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
      db.prepare("DELETE FROM operational_realtime_state WHERE tenant_id = ? AND k = ?").run(tenantId, key);
      return res.json({ value: null });
    }
    return res.json({ value: String(row.data ?? "") });
  });

  app.get("/operational/realtime/state/keys", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenantId = String(req.query.tenant ?? req.header("x-tenant-id") ?? "").trim();
    const prefix = String(req.query.prefix ?? "").trim();
    if (!tenantId || !prefix) return res.status(400).json({ error: "tenant and prefix are required." });
    const escaped = prefix.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const rows = db
      .prepare(
        `SELECT k FROM operational_realtime_state
         WHERE tenant_id = ? AND k LIKE ? ESCAPE '\\'
           AND (expires_at IS NULL OR expires_at > ?)
         LIMIT 500`
      )
      .all(tenantId, `${escaped}%`, new Date().toISOString()) as Array<{ k?: string }>;
    return res.json({ keys: rows.map((row) => String(row.k ?? "")).filter(Boolean) });
  });

  app.put("/operational/realtime/state", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenantId = String(req.query.tenant ?? req.header("x-tenant-id") ?? "").trim();
    const key = String(req.query.key ?? "").trim();
    const value = req.body?.value;
    const expiresAt = req.body?.expiresAt == null ? null : String(req.body.expiresAt).trim();
    if (!tenantId || !key) return res.status(400).json({ error: "tenant and key are required." });
    if (typeof value !== "string" || value.length > MAX_VALUE_LENGTH) {
      return res.status(400).json({ error: "value must be a string no larger than 5 MiB." });
    }
    if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
      return res.status(400).json({ error: "expiresAt must be a valid timestamp." });
    }

    db.prepare(
      `INSERT INTO operational_realtime_state (tenant_id, k, data, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, k) DO UPDATE SET
         data = excluded.data, expires_at = excluded.expires_at, updated_at = excluded.updated_at`
    ).run(tenantId, key, value, expiresAt, new Date().toISOString());
    return res.json({ stored: true });
  });

  app.get("/operational/realtime/presence", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenantId = String(req.query.tenant ?? req.header("x-tenant-id") ?? "").trim();
    if (!tenantId) return res.status(400).json({ error: "tenant is required." });

    const rows = db
      .prepare(
        `SELECT k, data FROM operational_realtime_state
         WHERE tenant_id = ? AND k LIKE 'presence:%'
           AND (expires_at IS NULL OR expires_at > ?)`
      )
      .all(tenantId, new Date().toISOString()) as Array<{ k?: string; data?: string }>;
    const presence = Object.fromEntries(
      rows.map((row) => [String(row.k ?? "").replace(/^presence:/, ""), String(row.data ?? "")])
    );
    return res.json({ presence });
  });
}
