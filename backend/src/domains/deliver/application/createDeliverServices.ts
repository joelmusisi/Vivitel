interface SqliteDbLike {
  prepare(query: string): {
    get: (...params: any[]) => any;
    run: (...params: any[]) => any;
  };
}

export interface DeliverStore {
  drones: any[];
  orders: any[];
  requirements: any;
  clients: any[];
  regions: any[];
  droneGroups: any[];
}

const defaultDeliverRequirements = {
  user: {
    lowEnd: [
      "Android 8+/iOS 13+ or any modern browser.",
      "2G/3G network support with offline queue for order submission.",
      "SMS fallback for order updates and delivery code.",
      "Compressed map images and text-first screens.",
      "Single-tap order tracking by phone number or order ID."
    ],
    highEnd: [
      "Push notifications with live ETA updates.",
      "Real-time map with drone position refresh every 3-5 seconds.",
      "Digital signature/photo upload as delivery proof.",
      "In-app secure wallet/payment integration.",
      "Rich order history with filters and CSV export."
    ]
  },
  commandCenter: {
    lowEnd: [
      "Browser dashboard that runs on standard office laptops.",
      "Manual order assignment to available drones.",
      "Color-coded statuses: pending, in_transit, delivered, failed.",
      "Battery threshold warnings and no-fly drone lock.",
      "Printable dispatch list and incident log."
    ],
    highEnd: [
      "Auto-assignment using payload, battery, and proximity scoring.",
      "Live fleet telemetry panel with alerts and SLA timers.",
      "Role-based access control for dispatcher/supervisor/auditor.",
      "Shift handover timeline with immutable action audit trail.",
      "Performance analytics by route, drone, and operator."
    ]
  },
  collaboration: [
    "Shared order timeline visible to client and command center.",
    "Single source of truth for drone availability and order state.",
    "Delivery confirmation using one-time proof code.",
    "Escalation path: delayed > 10 min triggers command center alert.",
    "Daily operating checklist covering drones, charging, and incidents."
  ]
};

export function createDeliverServices(deps: { db: SqliteDbLike }) {
  const { db } = deps;

  function nowIso() {
    return new Date().toISOString();
  }

  function readStore(tenant: string): DeliverStore {
    try {
      const row = db.prepare("SELECT data FROM deliver_store WHERE tenant_id = ?").get(tenant);
      if (row?.data) {
        const parsed = JSON.parse(String(row.data));
        return {
          drones: Array.isArray(parsed?.drones) ? parsed.drones : [],
          orders: Array.isArray(parsed?.orders) ? parsed.orders : [],
          requirements: parsed?.requirements || defaultDeliverRequirements,
          clients: Array.isArray(parsed?.clients) ? parsed.clients : [],
          regions: Array.isArray(parsed?.regions) ? parsed.regions : [],
          droneGroups: Array.isArray(parsed?.droneGroups) ? parsed.droneGroups : []
        };
      }
    } catch {
      // ignore malformed store rows and fall back to defaults
    }

    return {
      drones: [],
      orders: [],
      requirements: defaultDeliverRequirements,
      clients: [],
      regions: [],
      droneGroups: []
    };
  }

  function writeStore(tenant: string, store: DeliverStore) {
    const stmt = db.prepare("INSERT OR REPLACE INTO deliver_store (tenant_id, data, updated_at) VALUES (?, ?, ?)");
    stmt.run(tenant, JSON.stringify(store ?? {}), nowIso());
  }

  function ensureStoreShape(store: any): DeliverStore {
    if (!store || typeof store !== "object") {
      return {
        drones: [],
        orders: [],
        requirements: defaultDeliverRequirements,
        clients: [],
        regions: [],
        droneGroups: []
      };
    }
    if (!Array.isArray(store.drones)) store.drones = [];
    if (!Array.isArray(store.orders)) store.orders = [];
    if (!store.requirements) store.requirements = defaultDeliverRequirements;
    if (!Array.isArray(store.clients)) store.clients = [];
    if (!Array.isArray(store.regions)) store.regions = [];
    if (!Array.isArray(store.droneGroups)) store.droneGroups = [];
    return store as DeliverStore;
  }

  function summarize(store: { drones: any[]; orders: any[] }) {
    const orders = store.orders || [];
    const drones = store.drones || [];
    const pending = orders.filter((order: any) => order.status === "pending").length;
    const inTransit = orders.filter((order: any) => order.status === "assigned" || order.status === "in_transit" || order.status === "in-flight").length;
    const delivered = orders.filter((order: any) => order.status === "delivered").length;
    const availableDrones = drones.filter((drone: any) => String(drone.status || "") === "available").length;
    return {
      totalOrders: orders.length,
      pendingOrders: pending,
      inTransitOrders: inTransit,
      deliveredOrders: delivered,
      totalDrones: drones.length,
      availableDrones
    };
  }

  function createOrderId() {
    const stamp = Date.now().toString().slice(-6);
    const rand = Math.floor(Math.random() * 900 + 100).toString();
    return `ORD-${stamp}${rand}`;
  }

  function createDroneId() {
    const rand = Math.floor(Math.random() * 9000 + 1000).toString();
    return `DRN-${rand}`;
  }

  function sanitizeText(value: any) {
    return String(value ?? "").trim();
  }

  function sanitizeNumber(value: any, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function orderPriorityScore(priority: any) {
    const normalized = sanitizeText(priority).toLowerCase();
    if (normalized === "critical") return 4;
    if (normalized === "high") return 3;
    if (normalized === "normal") return 2;
    if (normalized === "low") return 1;
    return 0;
  }

  function isDroneAvailable(drone: any) {
    return sanitizeText(drone.status).toLowerCase() === "available" && sanitizeNumber(drone.batteryPct, 0) >= 35;
  }

  function assignmentScore(drone: any, order: any) {
    const battery = sanitizeNumber(drone.batteryPct, 0);
    const payloadHeadroom = sanitizeNumber(drone.maxPayloadKg, 0) - sanitizeNumber(order.packageWeightKg, 0);
    const range = sanitizeNumber(drone.rangeKm, 0);
    const priority = orderPriorityScore(order.priority);
    return battery + payloadHeadroom * 20 + range + priority * 5;
  }

  function bestDroneForOrder(drones: any[], order: any) {
    const eligible = (drones || []).filter((drone) => {
      const payloadOk = sanitizeNumber(drone.maxPayloadKg, 0) >= sanitizeNumber(order.packageWeightKg, 0);
      return payloadOk && isDroneAvailable(drone);
    });
    if (!eligible.length) return null;
    eligible.sort((left, right) => assignmentScore(right, order) - assignmentScore(left, order));
    return eligible[0];
  }

  function updateDroneAfterDelivery(drone: any) {
    const battery = sanitizeNumber(drone.batteryPct, 0);
    drone.batteryPct = Math.max(5, battery - 8);
    drone.status = drone.batteryPct < 30 ? "charging" : "available";
    drone.activeOrderId = "";
    drone.lastUpdated = nowIso();
  }

  return {
    defaultRequirements: defaultDeliverRequirements,
    readStore,
    writeStore,
    ensureStoreShape,
    summarize,
    createOrderId,
    createDroneId,
    sanitizeText,
    sanitizeNumber,
    isDroneAvailable,
    bestDroneForOrder,
    updateDroneAfterDelivery,
    nowIso
  };
}