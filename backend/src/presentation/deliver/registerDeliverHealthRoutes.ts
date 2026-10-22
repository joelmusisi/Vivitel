import type { Express } from "express";

interface RegisterDeliverHealthRoutesDeps {
  app: Express;
  requireApiKey: (req: any, res: any) => boolean;
  deliverReadStore: (tenant: string) => any;
  deliverEnsureStoreShape: (store: any) => any;
  deliverSanitizeNumber: (value: any, fallback?: number) => number;
  deliverNowIso: () => string;
}

export function registerDeliverHealthRoutes(deps: RegisterDeliverHealthRoutesDeps): void {
  const {
    app,
    requireApiKey,
    deliverReadStore,
    deliverEnsureStoreShape,
    deliverSanitizeNumber,
    deliverNowIso,
  } = deps;

  app.get("/deliver/health", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const store = deliverEnsureStoreShape(deliverReadStore(tenant) as any);
    const now = Date.now();
    const drones = store.drones || [];
    const health = drones.map((d: any) => {
      const id = String(d.id ?? "");
      const status = String(d.status ?? "");
      const batteryPct = deliverSanitizeNumber(d.batteryPct, 0);
      const lastUpdated = String(d.lastUpdated ?? "");
      const updatedMs = lastUpdated ? Date.parse(lastUpdated) : NaN;
      const staleHours = Number.isFinite(updatedMs) ? (now - updatedMs) / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;
      const reasons: string[] = [];
      if (status !== "available") reasons.push(`status=${status || "unknown"}`);
      if (batteryPct < 35) reasons.push(`battery=${batteryPct}%`);
      if (staleHours > 24) reasons.push("stale telemetry > 24h");
      const ok = reasons.length === 0;
      return { id, name: d.name ?? id, status, batteryPct, lastUpdated, ok, reasons };
    });
    res.json({ health, at: deliverNowIso() });
  });

  app.get("/deliver/requirements", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const store = deliverReadStore(tenant);
    res.json({ requirements: store.requirements });
  });
}
