import type { Express } from "express";

interface RegisterDeliverCatalogRoutesDeps {
  app: Express;
  requireApiKey: (req: any, res: any) => boolean;
  deliverReadStore: (tenant: string) => any;
  deliverWriteStore: (tenant: string, store: any) => void;
  deliverEnsureStoreShape: (store: any) => any;
  deliverSummarize: (store: any) => any;
  deliverSanitizeText: (value: any) => string;
  deliverNowIso: () => string;
}

export function registerDeliverCatalogRoutes(deps: RegisterDeliverCatalogRoutesDeps): void {
  const {
    app,
    requireApiKey,
    deliverReadStore,
    deliverWriteStore,
    deliverEnsureStoreShape,
    deliverSummarize,
    deliverSanitizeText,
    deliverNowIso,
  } = deps;

  app.get("/deliver/state", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
    res.json({
      summary: deliverSummarize(store),
      drones: store.drones,
      orders: store.orders,
      requirements: store.requirements,
      clients: store.clients,
      regions: store.regions,
      droneGroups: store.droneGroups,
    });
  });

  app.get("/deliver/clients", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
    res.json({ clients: store.clients });
  });

  app.post("/deliver/clients", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
    const id = deliverSanitizeText((body as any).id) || `CL-${Date.now()}`;
    const name = deliverSanitizeText((body as any).name);
    if (!name) return res.status(400).json({ error: "Client name is required" });
    const phone = deliverSanitizeText((body as any).phone);
    const region = deliverSanitizeText((body as any).region);
    const notes = deliverSanitizeText((body as any).notes);

    const idx = store.clients.findIndex((c: any) => String(c.id) === id);
    const rec = { id, name, phone, region, notes, updatedAt: deliverNowIso() };
    if (idx >= 0) store.clients[idx] = { ...store.clients[idx], ...rec };
    else store.clients.unshift(rec);
    deliverWriteStore(tenant, store);
    res.json({ stored: true, client: rec });
  });

  app.get("/deliver/regions", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
    res.json({ regions: store.regions });
  });

  app.post("/deliver/regions", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
    const name = deliverSanitizeText((body as any).name);
    if (!name) return res.status(400).json({ error: "Region name is required" });
    const id = deliverSanitizeText((body as any).id) || name.toLowerCase().replace(/\s+/g, "-");
    if (!store.regions.some((r: any) => String(r.id) === id)) {
      store.regions.unshift({ id, name, updatedAt: deliverNowIso() });
      deliverWriteStore(tenant, store);
    }
    res.json({ stored: true, id });
  });

  app.get("/deliver/drone-groups", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
    res.json({ droneGroups: store.droneGroups });
  });

  app.post("/deliver/drone-groups", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
    const name = deliverSanitizeText((body as any).name);
    if (!name) return res.status(400).json({ error: "Group name is required" });
    const id = deliverSanitizeText((body as any).id) || name.toLowerCase().replace(/\s+/g, "-");
    const owner = deliverSanitizeText((body as any).owner);
    const region = deliverSanitizeText((body as any).region);
    const notes = deliverSanitizeText((body as any).notes);
    const idx = store.droneGroups.findIndex((g: any) => String(g.id) === id);
    const rec = { id, name, owner, region, notes, updatedAt: deliverNowIso() };
    if (idx >= 0) store.droneGroups[idx] = { ...store.droneGroups[idx], ...rec };
    else store.droneGroups.unshift(rec);
    deliverWriteStore(tenant, store);
    res.json({ stored: true, droneGroup: rec });
  });
}
