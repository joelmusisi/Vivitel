import type { Express } from "express";
import { isLegacyFlatScopedKvKey, validateBindingSiteAnchor } from "../../shared/scopeIsolation";

interface RegisterPatBindingsKvRoutesDeps {
  app: Express;
  db: any;
  Database: any;
  requireApiKey: (req: any, res: any) => boolean;
  cryptoRandom: () => string;
  loadBindingsFromDb: (type?: string, tenant?: string) => any[];
  persistBindingToDb: (type: string, record: any, tenant?: string) => void;
  deleteBindingFromDb: (type: string, id: string, tenant?: string) => void;
  purgeBindingsForTenant: (tenant: string, type: string) => number;
  readTenant: (req: any) => { raw: string; tenant: string };
  inMemoryKv: Record<string, Record<string, string>>;
}

export function registerPatBindingsKvRoutes(deps: RegisterPatBindingsKvRoutesDeps): void {
  const {
    app,
    db,
    Database,
    requireApiKey,
    cryptoRandom,
    loadBindingsFromDb,
    persistBindingToDb,
    deleteBindingFromDb,
    purgeBindingsForTenant,
    readTenant,
    inMemoryKv,
  } = deps;

  app.get("/pat", (_req, res) => {
    const rows = db.prepare("SELECT id, token, description, organisationName, organisationGroup, expiryDate, status, daysToExpiry, username, createdAt FROM pats").all();
    res.json({ tokens: rows });
  });

  app.post("/pat", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body ?? {};
    const id = cryptoRandom();
    const token = cryptoRandom();
    const now = new Date().toISOString();
    const expiryDays = Math.min(Math.max(Number(body.expiryDays ?? 180), 30), 365);
    const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO pats (id, token, description, organisationName, organisationGroup, expiryDate, status, daysToExpiry, username, createdAt, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, token, body.description ?? "Personal access token", body.organisationName ?? "", body.organisationGroup ?? "", expiryDate, "Active", expiryDays, body.username ?? "", now, JSON.stringify(body));
    res.json({ token: { id, token, expiryDate } });
  });

  app.get("/d1/bindings", (req, res) => {
    const { tenant } = readTenant(req as any);
    const type = String(req.query.type ?? "");
    const rows = loadBindingsFromDb(type || undefined, tenant || "default");
    res.json({ bindings: rows, tenantId: tenant || "default", type: type || null });
  });

  app.post("/d1/bindings", (req, res) => {
    if (!requireApiKey(req as any, res)) return res.status(401).json({ error: "Unauthorized" });
    const { tenant } = readTenant(req as any);
    const type = String(req.query.type ?? "");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const siteError = validateBindingSiteAnchor(type, body, tenant || "default");
    if (siteError) return res.status(400).json({ error: siteError });
    const id = String(body.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "Binding id is required." });
    const rec = { ...body, id };
    try {
      persistBindingToDb(type, rec, tenant || "default");
    } catch {
      // ignore
    }
    res.json({ stored: true, id, tenantId: tenant || "default", type });
  });

  app.delete("/d1/bindings", (req, res) => {
    if (!requireApiKey(req as any, res)) return res.status(401).json({ error: "Unauthorized" });
    const { tenant } = readTenant(req as any);
    const id = String(req.query.id ?? "");
    const type = String(req.query.type ?? "");
    const tenantId = tenant || "default";
    if (String(req.query.purge ?? "") === "1") {
      try {
        const deleted = purgeBindingsForTenant(tenantId, type);
        return res.json({ purged: true, deleted, tenantId, type });
      } catch {
        return res.status(500).json({ error: "Purge failed" });
      }
    }
    if (!id) return res.status(400).json({ error: "id is required" });
    try {
      deleteBindingFromDb(type, id, tenant || "default");
    } catch {
      // ignore
    }
    res.json({ deleted: true, tenantId: tenant || "default", type, id });
  });

  app.get("/kv/:key", (req, res) => {
    if (!requireApiKey(req as any, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const key = String(req.params.key ?? "").trim();
    if (!key) return res.status(400).json({ error: "Key is required." });
    try {
      if (!Database) {
        const stored = inMemoryKv[tenant || "default"]?.[key] ?? (raw && raw !== tenant ? inMemoryKv[raw]?.[key] : undefined);
        if (!stored) return res.json(null);
        try {
          return res.json(JSON.parse(stored));
        } catch {
          return res.type("application/json").send(stored);
        }
      }
      const row: any = raw && raw !== tenant
        ? db.prepare("SELECT data FROM kv_store WHERE (tenant_id = ? OR tenant_id = ?) AND k = ? ORDER BY updated_at DESC LIMIT 1").get(tenant || "default", raw, key)
        : db.prepare("SELECT data FROM kv_store WHERE tenant_id = ? AND k = ?").get(tenant || "default", key);
      const stored = String(row?.data ?? "");
      if (!stored) return res.json(null);
      try {
        return res.json(JSON.parse(stored));
      } catch {
        return res.type("application/json").send(stored);
      }
    } catch {
      return res.status(500).json({ error: "KV read failed" });
    }
  });

  app.post("/kv/:key", (req, res) => {
    if (!requireApiKey(req as any, res)) return res.status(401).json({ error: "Unauthorized" });
    const { tenant } = readTenant(req as any);
    const key = String(req.params.key ?? "").trim();
    if (!key) return res.status(400).json({ error: "Key is required." });
    if (isLegacyFlatScopedKvKey(key)) {
      return res.status(400).json({
        error:
          "Legacy library keys are not allowed. Use a site-scoped key: libraries:{name}:tenant:{tenant}:site:{site}."
      });
    }
    const now = new Date().toISOString();
    try {
      const payload = req.body ?? {};
      const data = JSON.stringify(payload);
      if (!Database) {
        const scopedTenant = tenant || "default";
        if (!inMemoryKv[scopedTenant]) inMemoryKv[scopedTenant] = {};
        inMemoryKv[scopedTenant][key] = data;
        return res.json({ stored: true, key });
      }
      db.prepare("INSERT OR REPLACE INTO kv_store (k, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)").run(
        key,
        tenant || "default",
        data,
        now
      );
      return res.json({ stored: true, key });
    } catch {
      return res.status(500).json({ error: "KV write failed" });
    }
  });
}
