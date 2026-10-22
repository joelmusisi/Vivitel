import type { Express } from "express";
import { validateRecordSiteAnchor } from "../../shared/scopeIsolation";

interface RegisterDeviceConfigurationRoutesDeps {
  app: Express;
  db: any;
  requireApiKey: (req: any, res: any) => boolean;
  valkeyGet: (key: string) => Promise<string | null>;
  valkeySet: (key: string, value: string, ttlSec?: number) => Promise<any>;
  valkeyDel: (key: string) => Promise<any>;
  parseStoredJson: (value: any) => any;
}

export function registerDeviceConfigurationRoutes(deps: RegisterDeviceConfigurationRoutesDeps): void {
  const {
    app,
    db,
    requireApiKey,
    valkeyGet,
    valkeySet,
    valkeyDel,
    parseStoredJson,
  } = deps;

  app.get("/d1/device-reporting-settings", async (req, res) => {
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const cacheKey = `vivi:${tenant}:device-reporting-settings`;
    const cached = await valkeyGet(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
    const row = db.prepare("SELECT data, updated_at FROM device_reporting_settings WHERE tenant_id = ?").get(tenant);
    if (!row) return res.json({ settings: null, tenantId: tenant });
    const payload = { settings: parseStoredJson(row.data), updatedAt: row.updated_at, tenantId: tenant };
    await valkeySet(cacheKey, JSON.stringify(payload));
    res.json(payload);
  });

  app.post("/d1/device-reporting-settings", async (req, res) => {
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const now = new Date().toISOString();
    const stmt = db.prepare("INSERT INTO device_reporting_settings (tenant_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at");
    stmt.run(tenant, JSON.stringify(body), now);
    await valkeyDel(`vivi:${tenant}:device-reporting-settings`);
    res.json({ stored: true, tenantId: tenant });
  });

  app.get("/d1/configuration-groups", async (req, res) => {
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const cacheKey = `vivi:${tenant}:cfg-groups`;
    const cached = await valkeyGet(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
    const rows = db.prepare("SELECT data, updated_at FROM configuration_groups WHERE tenant_id = ? ORDER BY updated_at DESC").all(tenant);
    const groups = rows.map((r: any) => parseStoredJson(r.data)).filter(Boolean);
    const payload = { groups, tenantId: tenant };
    await valkeySet(cacheKey, JSON.stringify(payload));
    res.json(payload);
  });

  app.post("/d1/configuration-groups", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const id = String(body.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "Configuration group id is required." });
    const siteError = validateRecordSiteAnchor("configuration-group", body, tenant);
    if (siteError) return res.status(400).json({ error: siteError });
    const now = new Date().toISOString();
    const stmt = db.prepare("INSERT INTO configuration_groups (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id, tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at");
    stmt.run(id, tenant, JSON.stringify(body), now);
    await valkeyDel(`vivi:${tenant}:cfg-groups`);
    res.json({ stored: true, id, tenantId: tenant });
  });

  app.delete("/d1/configuration-groups", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const id = String(req.query.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "Configuration group id is required." });
    const result = db.prepare("DELETE FROM configuration_groups WHERE tenant_id = ? AND id = ?").run(tenant, id);
    await valkeyDel(`vivi:${tenant}:cfg-groups`);
    res.json({ deleted: (result.changes ?? 0) > 0, id, tenantId: tenant });
  });
}
