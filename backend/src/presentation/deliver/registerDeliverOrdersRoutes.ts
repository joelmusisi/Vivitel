import type { Express } from "express";

interface RegisterDeliverOrdersRoutesDeps {
  app: Express;
  requireApiKey: (req: any, res: any) => boolean;
  deliverReadStore: (tenant: string) => any;
  deliverWriteStore: (tenant: string, store: any) => void;
  deliverSummarize: (store: any) => any;
  deliverSanitizeText: (value: any) => string;
  deliverSanitizeNumber: (value: any, fallback?: number) => number;
  deliverCreateOrderId: () => string;
  deliverNowIso: () => string;
  deliverBestDroneForOrder: (drones: any[], order: any) => any;
  deliverIsDroneAvailable: (drone: any) => boolean;
  deliverUpdateDroneAfterDelivery: (drone: any) => void;
}

export function registerDeliverOrdersRoutes(deps: RegisterDeliverOrdersRoutesDeps): void {
  const {
    app,
    requireApiKey,
    deliverReadStore,
    deliverWriteStore,
    deliverSummarize,
    deliverSanitizeText,
    deliverSanitizeNumber,
    deliverCreateOrderId,
    deliverNowIso,
    deliverBestDroneForOrder,
    deliverIsDroneAvailable,
    deliverUpdateDroneAfterDelivery,
  } = deps;

  app.get("/deliver/orders", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const phone = deliverSanitizeText(req.query.phone);
    const status = deliverSanitizeText(req.query.status).toLowerCase();
    const store = deliverReadStore(tenant);
    let orders = phone ? store.orders.filter((o: any) => deliverSanitizeText(o.clientPhone) === phone) : store.orders;
    if (status) {
      if (status === "pending") {
        orders = orders.filter((o: any) => {
          const s = deliverSanitizeText(o.status).toLowerCase();
          return s !== "suspended" && s !== "closed" && s !== "delivered";
        });
      } else if (status === "closed") {
        orders = orders.filter((o: any) => {
          const s = deliverSanitizeText(o.status).toLowerCase();
          return s === "closed" || s === "delivered";
        });
      } else {
        orders = orders.filter((o: any) => deliverSanitizeText(o.status).toLowerCase() === status);
      }
    }
    res.json({ orders, summary: deliverSummarize(store) });
  });

  app.post("/deliver/orders/:id/status", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const id = deliverSanitizeText(req.params.id);
    if (!id) return res.status(400).json({ error: "Order id is required" });
    const body = req.body ?? {};
    const status = deliverSanitizeText((body as any).status).toLowerCase();
    if (!(status === "pending" || status === "suspended" || status === "closed")) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const store = deliverReadStore(tenant);
    const order = store.orders.find((o: any) => String(o.id) === id);
    if (!order) return res.status(404).json({ error: "Not found" });

    const assignedDroneId = deliverSanitizeText(order.assignedDroneId);
    if (assignedDroneId) {
      const drone = store.drones.find((d: any) => String(d.id) === String(assignedDroneId));
      if (drone && String(drone.activeOrderId ?? "") === String(order.id ?? "")) {
        drone.status = "available";
        drone.activeOrderId = "";
        drone.lastUpdated = deliverNowIso();
      }
    }
    if (status === "pending" || status === "suspended" || status === "closed") {
      order.assignedDroneId = "";
      order.assignedAt = "";
    }
    order.status = status;
    deliverWriteStore(tenant, store);
    res.json({ updated: true, order, summary: deliverSummarize(store) });
  });

  app.post("/deliver/orders", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const store = deliverReadStore(tenant);
    const order = {
      id: deliverCreateOrderId(),
      clientName: deliverSanitizeText((body as any).clientName),
      clientPhone: deliverSanitizeText((body as any).clientPhone),
      pickupAddress: deliverSanitizeText((body as any).pickupAddress),
      dropoffAddress: deliverSanitizeText((body as any).dropoffAddress),
      packageWeightKg: Math.max(0.1, deliverSanitizeNumber((body as any).packageWeightKg, 0)),
      priority: deliverSanitizeText((body as any).priority || "normal").toLowerCase(),
      status: "pending",
      assignedDroneId: "",
      assignedAt: "",
      createdAt: deliverNowIso(),
      deliveredAt: "",
      confirmation: null
    };
    if (!order.clientName || !order.clientPhone || !order.pickupAddress || !order.dropoffAddress) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    store.orders.unshift(order);
    deliverWriteStore(tenant, store);
    res.status(201).json({ stored: true, order, summary: deliverSummarize(store) });
  });

  app.post("/deliver/orders/auto-assign", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const store = deliverReadStore(tenant);
    let assignedCount = 0;
    for (const order of store.orders) {
      if (order.status !== "pending") continue;
      const drone = deliverBestDroneForOrder(store.drones, order);
      if (!drone) continue;
      order.assignedDroneId = drone.id;
      order.assignedAt = deliverNowIso();
      order.status = "assigned";
      drone.status = "in-flight";
      drone.activeOrderId = order.id;
      drone.lastUpdated = deliverNowIso();
      assignedCount += 1;
    }
    deliverWriteStore(tenant, store);
    res.json({ assignedCount, summary: deliverSummarize(store) });
  });

  app.post("/deliver/orders/:id/assign", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const id = deliverSanitizeText(req.params.id);
    const body = req.body ?? {};
    const droneId = deliverSanitizeText((body as any).droneId);
    if (!id) return res.status(400).json({ error: "Order id is required" });
    if (!droneId) return res.status(400).json({ error: "droneId is required" });
    const store = deliverReadStore(tenant);
    const order = store.orders.find((o: any) => String(o.id) === id);
    if (!order) return res.status(404).json({ error: "Not found" });
    if (order.status !== "pending") return res.status(400).json({ error: "Order is not pending" });
    const drone = store.drones.find((d: any) => String(d.id) === droneId);
    if (!drone) return res.status(400).json({ error: "Drone not found" });
    if (!deliverIsDroneAvailable(drone)) return res.status(400).json({ error: "Drone is not available" });
    if (deliverSanitizeNumber(drone.maxPayloadKg, 0) < deliverSanitizeNumber(order.packageWeightKg, 0)) {
      return res.status(400).json({ error: "Drone payload limit is below package weight" });
    }
    order.assignedDroneId = drone.id;
    order.assignedAt = deliverNowIso();
    order.status = "assigned";
    drone.status = "in-flight";
    drone.activeOrderId = order.id;
    drone.lastUpdated = deliverNowIso();
    deliverWriteStore(tenant, store);
    res.json({ assigned: true, order, drone, summary: deliverSummarize(store) });
  });

  app.post("/deliver/orders/:id/confirm", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const id = deliverSanitizeText(req.params.id);
    if (!id) return res.status(400).json({ error: "Order id is required" });
    const body = req.body ?? {};
    const receiverName = deliverSanitizeText((body as any).receiverName);
    const proofCode = deliverSanitizeText((body as any).proofCode);
    const notes = deliverSanitizeText((body as any).notes);
    if (!receiverName || !proofCode) return res.status(400).json({ error: "receiverName and proofCode are required" });
    const store = deliverReadStore(tenant);
    const order = store.orders.find((o: any) => String(o.id) === id);
    if (!order) return res.status(404).json({ error: "Not found" });
    if (!(order.status === "assigned" || order.status === "in_transit" || order.status === "in-flight")) {
      return res.status(400).json({ error: "Order is not in transit" });
    }
    order.status = "delivered";
    order.deliveredAt = deliverNowIso();
    order.confirmation = { receiverName, proofCode, notes, confirmedAt: deliverNowIso() };
    if (order.assignedDroneId) {
      const drone = store.drones.find((d: any) => String(d.id) === String(order.assignedDroneId));
      if (drone) deliverUpdateDroneAfterDelivery(drone);
    }
    deliverWriteStore(tenant, store);
    res.json({ delivered: true, order, summary: deliverSummarize(store) });
  });
}
