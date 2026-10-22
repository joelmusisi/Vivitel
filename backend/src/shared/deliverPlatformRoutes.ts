import {
  deliverBuildCustomerDashboard,
  deliverBuildExecutiveDashboard,
  deliverBuildGroundOpsDashboard,
  deliverCreateId,
  deliverEnsureExtendedStore,
  deliverNowIso,
  deliverSanitizeNumber,
  deliverSanitizeText,
  deliverWalletForPhone,
  type DeliverExtendedStore
} from "./deliverPlatform";

type RouteCtx = {
  request: Request;
  url: URL;
  tenantId: string;
  readStore: () => Promise<DeliverExtendedStore>;
  writeStore: (store: DeliverExtendedStore) => Promise<void>;
  json: (body: unknown, init?: ResponseInit) => Response;
  badRequest: (message: string, status?: number) => Response;
  requireRbac: (pagePath: string, action: "view" | "edit" | "delete") => Promise<Response | null>;
};

async function upsertById<T extends { id: string }>(list: T[], rec: T, prepend = true) {
  const idx = list.findIndex((x) => String(x.id) === String(rec.id));
  if (idx >= 0) list[idx] = { ...list[idx], ...rec };
  else if (prepend) list.unshift(rec);
  else list.push(rec);
}

export async function tryDeliverPlatformRoutes(ctx: RouteCtx): Promise<Response | null> {
  const { request, url, json, badRequest, requireRbac, readStore, writeStore } = ctx;
  const path = url.pathname;
  if (!path.startsWith("/deliver/platform/")) return null;

  const rbacPath = (section: string) => `/Deliver/platform/${section}`;

  if (path === "/deliver/platform/customer/dashboard" && request.method === "GET") {
    const access = await requireRbac(rbacPath("customer"), "view");
    if (access) return access;
    const phone = deliverSanitizeText(url.searchParams.get("phone"));
    if (!phone) return badRequest("phone is required");
    const store = await readStore();
    return json(deliverBuildCustomerDashboard(store, phone));
  }

  if (path === "/deliver/platform/customer/profile" && request.method === "POST") {
    const access = await requireRbac(rbacPath("customer"), "edit");
    if (access) return access;
    const body = await request.json().catch(() => ({}));
    const phone = deliverSanitizeText((body as any).phone);
    if (!phone) return badRequest("phone is required");
    const store = await readStore();
    const rec = {
      id: deliverSanitizeText((body as any).id) || `CP-${phone}`,
      phone,
      name: deliverSanitizeText((body as any).name),
      email: deliverSanitizeText((body as any).email),
      language: deliverSanitizeText((body as any).language) || "en",
      updatedAt: deliverNowIso()
    };
    await upsertById(store.customerProfiles, rec);
    await writeStore(store);
    return json({ ok: true, profile: rec });
  }

  if (path === "/deliver/platform/addresses") {
    const access = await requireRbac(rbacPath("customer"), request.method === "GET" ? "view" : "edit");
    if (access) return access;
    const store = await readStore();
    if (request.method === "GET") {
      const phone = deliverSanitizeText(url.searchParams.get("phone"));
      const addresses = phone
        ? store.savedAddresses.filter((a) => deliverSanitizeText(a.phone) === phone)
        : store.savedAddresses;
      return json({ addresses });
    }
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const phone = deliverSanitizeText((body as any).phone);
      const label = deliverSanitizeText((body as any).label);
      const address = deliverSanitizeText((body as any).address);
      if (!phone || !label || !address) return badRequest("phone, label, address are required");
      const rec = {
        id: deliverSanitizeText((body as any).id) || deliverCreateId("ADDR"),
        phone,
        label,
        address,
        lat: deliverSanitizeNumber((body as any).lat, 0),
        lng: deliverSanitizeNumber((body as any).lng, 0),
        updatedAt: deliverNowIso()
      };
      await upsertById(store.savedAddresses, rec);
      await writeStore(store);
      return json({ ok: true, address: rec });
    }
    return badRequest("Unsupported method.", 405);
  }

  if (path === "/deliver/platform/wallet") {
    const access = await requireRbac(rbacPath("customer"), request.method === "GET" ? "view" : "edit");
    if (access) return access;
    const store = await readStore();
    if (request.method === "GET") {
      const phone = deliverSanitizeText(url.searchParams.get("phone"));
      if (!phone) return badRequest("phone is required");
      const wallet = deliverWalletForPhone(store, phone);
      return json({ wallet });
    }
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const phone = deliverSanitizeText((body as any).phone);
      const amount = deliverSanitizeNumber((body as any).amount, 0);
      if (!phone || amount <= 0) return badRequest("phone and positive amount are required");
      const wallet = deliverWalletForPhone(store, phone);
      wallet.balance = Number((wallet.balance + amount).toFixed(2));
      wallet.transactions.unshift({
        id: deliverCreateId("TX"),
        type: "topup",
        amount,
        at: deliverNowIso(),
        note: deliverSanitizeText((body as any).note) || "Wallet top-up"
      });
      await writeStore(store);
      return json({ ok: true, wallet });
    }
    return badRequest("Unsupported method.", 405);
  }

  if (path === "/deliver/platform/promotions" && request.method === "GET") {
    const access = await requireRbac(rbacPath("customer"), "view");
    if (access) return access;
    const store = await readStore();
    return json({ promotions: store.promotions.filter((p) => p.active !== false) });
  }

  if (path === "/deliver/platform/ground-ops/dashboard" && request.method === "GET") {
    const access = await requireRbac(rbacPath("ground-ops"), "view");
    if (access) return access;
    const store = await readStore();
    return json({
      dashboard: deliverBuildGroundOpsDashboard(store),
      orders: store.orders,
      drivers: store.drivers,
      vehicles: store.vehicles,
      incidents: store.incidents,
      exceptions: store.exceptions
    });
  }

  const collectionRoutes: Array<{
    path: string;
    section: string;
    key: keyof DeliverExtendedStore;
    build?: (body: any) => Record<string, unknown>;
  }> = [
    {
      path: "/deliver/platform/drivers",
      section: "ground-ops",
      key: "drivers",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("DRV"),
        name: deliverSanitizeText(body.name),
        phone: deliverSanitizeText(body.phone),
        licenseNo: deliverSanitizeText(body.licenseNo),
        availability: deliverSanitizeText(body.availability) || "available",
        vehicleId: deliverSanitizeText(body.vehicleId),
        updatedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/vehicles",
      section: "ground-ops",
      key: "vehicles",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("VEH"),
        plate: deliverSanitizeText(body.plate),
        type: deliverSanitizeText(body.type) || "van",
        capacityKg: deliverSanitizeNumber(body.capacityKg, 500),
        status: deliverSanitizeText(body.status) || "available",
        updatedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/incidents",
      section: "ground-ops",
      key: "incidents",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("INC"),
        orderId: deliverSanitizeText(body.orderId),
        type: deliverSanitizeText(body.type) || "delay",
        severity: deliverSanitizeText(body.severity) || "medium",
        status: deliverSanitizeText(body.status) || "open",
        notes: deliverSanitizeText(body.notes),
        reportedAt: deliverNowIso(),
        updatedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/exceptions",
      section: "ground-ops",
      key: "exceptions",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("EXC"),
        orderId: deliverSanitizeText(body.orderId),
        reason: deliverSanitizeText(body.reason),
        status: deliverSanitizeText(body.status) || "open",
        updatedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/drone-ops/missions",
      section: "drone-ops",
      key: "missions",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("MSN"),
        orderId: deliverSanitizeText(body.orderId),
        droneId: deliverSanitizeText(body.droneId),
        status: deliverSanitizeText(body.status) || "planned",
        route: deliverSanitizeText(body.route),
        updatedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/drone-ops/flight-logs",
      section: "drone-ops",
      key: "flightLogs",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("FLT"),
        droneId: deliverSanitizeText(body.droneId),
        missionId: deliverSanitizeText(body.missionId),
        durationMin: deliverSanitizeNumber(body.durationMin, 0),
        distanceKm: deliverSanitizeNumber(body.distanceKm, 0),
        loggedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/drone-ops/maintenance",
      section: "drone-ops",
      key: "maintenanceRecords",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("MNT"),
        droneId: deliverSanitizeText(body.droneId),
        type: deliverSanitizeText(body.type) || "inspection",
        status: deliverSanitizeText(body.status) || "scheduled",
        dueAt: deliverSanitizeText(body.dueAt),
        notes: deliverSanitizeText(body.notes),
        updatedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/drone-ops/airspace",
      section: "drone-ops",
      key: "airspaceZones",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("AIR"),
        name: deliverSanitizeText(body.name),
        restriction: deliverSanitizeText(body.restriction) || "no-fly",
        centerLat: deliverSanitizeNumber(body.centerLat, 0),
        centerLng: deliverSanitizeNumber(body.centerLng, 0),
        radiusKm: deliverSanitizeNumber(body.radiusKm, 1),
        updatedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/warehouse/packages",
      section: "warehouse",
      key: "warehousePackages",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("PKG"),
        orderId: deliverSanitizeText(body.orderId),
        barcode: deliverSanitizeText(body.barcode),
        status: deliverSanitizeText(body.status) || "received",
        location: deliverSanitizeText(body.location),
        updatedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/warehouse/inventory",
      section: "warehouse",
      key: "warehouseInventory",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("INV"),
        sku: deliverSanitizeText(body.sku),
        name: deliverSanitizeText(body.name),
        quantity: deliverSanitizeNumber(body.quantity, 0),
        location: deliverSanitizeText(body.location),
        updatedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/merchants",
      section: "merchant",
      key: "merchants",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("MCH"),
        name: deliverSanitizeText(body.name),
        contactPhone: deliverSanitizeText(body.contactPhone),
        address: deliverSanitizeText(body.address),
        status: deliverSanitizeText(body.status) || "active",
        updatedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/support/tickets",
      section: "support",
      key: "supportTickets",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("TKT"),
        customerPhone: deliverSanitizeText(body.customerPhone),
        orderId: deliverSanitizeText(body.orderId),
        subject: deliverSanitizeText(body.subject),
        priority: deliverSanitizeText(body.priority) || "normal",
        status: deliverSanitizeText(body.status) || "open",
        messages: Array.isArray(body.messages) ? body.messages : [],
        updatedAt: deliverNowIso()
      })
    },
    {
      path: "/deliver/platform/promotions/manage",
      section: "super-admin",
      key: "promotions",
      build: (body) => ({
        id: deliverSanitizeText(body.id) || deliverCreateId("PROMO"),
        title: deliverSanitizeText(body.title),
        code: deliverSanitizeText(body.code),
        discountPct: deliverSanitizeNumber(body.discountPct, 0),
        active: body.active !== false,
        updatedAt: deliverNowIso()
      })
    }
  ];

  for (const route of collectionRoutes) {
    if (path !== route.path) continue;
    const access = await requireRbac(rbacPath(route.section), request.method === "GET" ? "view" : "edit");
    if (access) return access;
    const store = await readStore();
    const list = store[route.key] as any[];
    if (request.method === "GET") return json({ items: list });
    if (request.method === "POST") {
      if (!route.build) return badRequest("Unsupported method.", 405);
      const body = await request.json().catch(() => ({}));
      const rec = route.build(body as any);
      if (!rec.id) return badRequest("id generation failed");
      const identifier =
        rec.name ?? rec.title ?? rec.subject ?? rec.plate ?? rec.sku ?? rec.reason ?? rec.orderId ?? rec.barcode;
      if (!identifier && route.key !== "flightLogs") return badRequest("required fields missing");
      await upsertById(list, rec as any);
      await writeStore(store);
      return json({ ok: true, item: rec });
    }
    return badRequest("Unsupported method.", 405);
  }

  if (path === "/deliver/platform/driver/assignments" && request.method === "GET") {
    const access = await requireRbac(rbacPath("driver"), "view");
    if (access) return access;
    const driverId = deliverSanitizeText(url.searchParams.get("driverId"));
    const store = await readStore();
    const orders = (store.orders || []).filter((o) => {
      const s = deliverSanitizeText(o.status).toLowerCase();
      const match = driverId ? deliverSanitizeText(o.assignedDriverId) === driverId : true;
      return match && (s === "assigned" || s === "in_transit" || s === "pending");
    });
    return json({ orders, driver: driverId ? (store.drivers || []).find((d) => String(d.id) === driverId) : null });
  }

  if (path === "/deliver/platform/driver/status" && request.method === "POST") {
    const access = await requireRbac(rbacPath("driver"), "edit");
    if (access) return access;
    const body = await request.json().catch(() => ({}));
    const driverId = deliverSanitizeText((body as any).driverId);
    const availability = deliverSanitizeText((body as any).availability);
    if (!driverId || !availability) return badRequest("driverId and availability are required");
    const store = await readStore();
    const driver = (store.drivers || []).find((d) => String(d.id) === driverId);
    if (!driver) return badRequest("Driver not found");
    driver.availability = availability;
    driver.updatedAt = deliverNowIso();
    await writeStore(store);
    return json({ ok: true, driver });
  }

  if (path === "/deliver/platform/executive/dashboard" && request.method === "GET") {
    const access = await requireRbac(rbacPath("super-admin"), "view");
    if (access) return access;
    const store = await readStore();
    return json({
      dashboard: deliverBuildExecutiveDashboard(store),
      settings: store.platformSettings
    });
  }

  if (path === "/deliver/platform/settings" && request.method === "POST") {
    const access = await requireRbac(rbacPath("super-admin"), "edit");
    if (access) return access;
    const body = await request.json().catch(() => ({}));
    const store = await readStore();
    store.platformSettings = {
      ...store.platformSettings,
      baseFare: deliverSanitizeNumber((body as any).baseFare, store.platformSettings.baseFare),
      perKgRate: deliverSanitizeNumber((body as any).perKgRate, store.platformSettings.perKgRate),
      taxRate: deliverSanitizeNumber((body as any).taxRate, store.platformSettings.taxRate),
      insuranceRate: deliverSanitizeNumber((body as any).insuranceRate, store.platformSettings.insuranceRate),
      commissionRate: deliverSanitizeNumber((body as any).commissionRate, store.platformSettings.commissionRate)
    };
    await writeStore(store);
    return json({ ok: true, settings: store.platformSettings });
  }

  if (path === "/deliver/platform/support/tickets/reply" && request.method === "POST") {
    const access = await requireRbac(rbacPath("support"), "edit");
    if (access) return access;
    const body = await request.json().catch(() => ({}));
    const ticketId = deliverSanitizeText((body as any).ticketId);
    const message = deliverSanitizeText((body as any).message);
    const author = deliverSanitizeText((body as any).author) || "agent";
    if (!ticketId || !message) return badRequest("ticketId and message are required");
    const store = await readStore();
    const ticket = (store.supportTickets || []).find((t) => String(t.id) === ticketId);
    if (!ticket) return badRequest("Ticket not found");
    if (!Array.isArray(ticket.messages)) ticket.messages = [];
    ticket.messages.push({ id: deliverCreateId("MSG"), author, message, at: deliverNowIso() });
    ticket.updatedAt = deliverNowIso();
    await writeStore(store);
    return json({ ok: true, ticket });
  }

  return badRequest("Unknown deliver platform route.", 404);
}

export function deliverMergeExtendedStore(raw: any) {
  return deliverEnsureExtendedStore(raw);
}
