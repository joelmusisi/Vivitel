import type { Express } from "express";

interface RegisterDeliverDronesRoutesDeps {
  app: Express;
  requireApiKey: (req: any, res: any) => boolean;
  deliverReadStore: (tenant: string) => any;
  deliverWriteStore: (tenant: string, store: any) => void;
  deliverSummarize: (store: any) => any;
  deliverSanitizeText: (value: any) => string;
  deliverSanitizeNumber: (value: any, fallback?: number) => number;
  deliverCreateDroneId: () => string;
  deliverNowIso: () => string;
}

export function registerDeliverDronesRoutes(deps: RegisterDeliverDronesRoutesDeps): void {
  const {
    app,
    requireApiKey,
    deliverReadStore,
    deliverWriteStore,
    deliverSummarize,
    deliverSanitizeText,
    deliverSanitizeNumber,
    deliverCreateDroneId,
    deliverNowIso,
  } = deps;

  app.get("/deliver/drones", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const store = deliverReadStore(tenant);
    res.json({ drones: store.drones, summary: deliverSummarize(store) });
  });

  app.post("/deliver/drones", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const store = deliverReadStore(tenant);
    const id = deliverSanitizeText((body as any).id) || deliverCreateDroneId();
    if (store.drones.some((d: any) => String(d.id) === id)) return res.status(400).json({ error: "Drone id already exists" });
    const drone = {
      id,
      name: deliverSanitizeText((body as any).name) || id,
      status: deliverSanitizeText((body as any).status || "available").toLowerCase(),
      batteryPct: Math.min(100, Math.max(0, deliverSanitizeNumber((body as any).batteryPct, 100))),
      maxPayloadKg: Math.max(0.2, deliverSanitizeNumber((body as any).maxPayloadKg, 1.5)),
      rangeKm: Math.max(1, deliverSanitizeNumber((body as any).rangeKm, 10)),
      speedKph: Math.max(10, deliverSanitizeNumber((body as any).speedKph, 40)),
      currentLat: deliverSanitizeNumber((body as any).currentLat, 0),
      currentLng: deliverSanitizeNumber((body as any).currentLng, 0),
      activeOrderId: "",
      lastUpdated: deliverNowIso(),
    };
    store.drones.push(drone);
    deliverWriteStore(tenant, store);
    res.status(201).json({ stored: true, drone, summary: deliverSummarize(store) });
  });

  app.patch("/deliver/drones/:id", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const id = deliverSanitizeText(req.params.id);
    if (!id) return res.status(400).json({ error: "Drone id is required" });
    const body = req.body ?? {};
    const store = deliverReadStore(tenant);
    const drone = store.drones.find((d: any) => String(d.id) === id);
    if (!drone) return res.status(404).json({ error: "Not found" });
    if (typeof (body as any).status !== "undefined") drone.status = deliverSanitizeText((body as any).status).toLowerCase();
    if (typeof (body as any).batteryPct !== "undefined") drone.batteryPct = Math.min(100, Math.max(0, deliverSanitizeNumber((body as any).batteryPct, drone.batteryPct)));
    if (typeof (body as any).name !== "undefined") drone.name = deliverSanitizeText((body as any).name);
    if (typeof (body as any).maxPayloadKg !== "undefined") drone.maxPayloadKg = Math.max(0.2, deliverSanitizeNumber((body as any).maxPayloadKg, drone.maxPayloadKg));
    if (typeof (body as any).rangeKm !== "undefined") drone.rangeKm = Math.max(1, deliverSanitizeNumber((body as any).rangeKm, drone.rangeKm));
    if (typeof (body as any).speedKph !== "undefined") drone.speedKph = Math.max(10, deliverSanitizeNumber((body as any).speedKph, drone.speedKph));
    drone.lastUpdated = deliverNowIso();
    deliverWriteStore(tenant, store);
    res.json({ updated: true, drone, summary: deliverSummarize(store) });
  });
}
