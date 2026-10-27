export type DeliverExtendedStore = {
  drones: any[];
  orders: any[];
  clients: any[];
  regions: any[];
  droneGroups: any[];
  requirements: any;
  schedules: any[];
  savedAddresses: any[];
  promotions: any[];
  wallets: Record<string, { balance: number; currency: string; transactions: any[] }>;
  customerProfiles: any[];
  drivers: any[];
  vehicles: any[];
  incidents: any[];
  exceptions: any[];
  warehousePackages: any[];
  warehouseInventory: any[];
  merchants: any[];
  supportTickets: any[];
  flightLogs: any[];
  maintenanceRecords: any[];
  airspaceZones: any[];
  missions: any[];
  platformSettings: {
    baseFare: number;
    perKgRate: number;
    taxRate: number;
    insuranceRate: number;
    commissionRate: number;
  };
};

export function deliverSanitizeText(v: unknown) {
  return String(v ?? "").trim();
}

export function deliverSanitizeNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function deliverNowIso() {
  return new Date().toISOString();
}

export function deliverCreateId(prefix: string) {
  const stamp = Date.now().toString().slice(-6);
  const rand = Math.floor(Math.random() * 900 + 100).toString();
  return `${prefix}-${stamp}${rand}`;
}

export function deliverEnsureExtendedStore(store: any): DeliverExtendedStore {
  return {
    drones: Array.isArray(store?.drones) ? store.drones : [],
    orders: Array.isArray(store?.orders) ? store.orders : [],
    clients: Array.isArray(store?.clients) ? store.clients : [],
    regions: Array.isArray(store?.regions) ? store.regions : [],
    droneGroups: Array.isArray(store?.droneGroups) ? store.droneGroups : [],
    requirements: store?.requirements ?? {},
    schedules: Array.isArray(store?.schedules) ? store.schedules : [],
    savedAddresses: Array.isArray(store?.savedAddresses) ? store.savedAddresses : [],
    promotions: Array.isArray(store?.promotions) ? store.promotions : [],
    wallets: store?.wallets && typeof store.wallets === "object" ? store.wallets : {},
    customerProfiles: Array.isArray(store?.customerProfiles) ? store.customerProfiles : [],
    drivers: Array.isArray(store?.drivers) ? store.drivers : [],
    vehicles: Array.isArray(store?.vehicles) ? store.vehicles : [],
    incidents: Array.isArray(store?.incidents) ? store.incidents : [],
    exceptions: Array.isArray(store?.exceptions) ? store.exceptions : [],
    warehousePackages: Array.isArray(store?.warehousePackages) ? store.warehousePackages : [],
    warehouseInventory: Array.isArray(store?.warehouseInventory) ? store.warehouseInventory : [],
    merchants: Array.isArray(store?.merchants) ? store.merchants : [],
    supportTickets: Array.isArray(store?.supportTickets) ? store.supportTickets : [],
    flightLogs: Array.isArray(store?.flightLogs) ? store.flightLogs : [],
    maintenanceRecords: Array.isArray(store?.maintenanceRecords) ? store.maintenanceRecords : [],
    airspaceZones: Array.isArray(store?.airspaceZones) ? store.airspaceZones : [],
    missions: Array.isArray(store?.missions) ? store.missions : [],
    platformSettings: {
      baseFare: deliverSanitizeNumber(store?.platformSettings?.baseFare, 5),
      perKgRate: deliverSanitizeNumber(store?.platformSettings?.perKgRate, 2.5),
      taxRate: deliverSanitizeNumber(store?.platformSettings?.taxRate, 0.16),
      insuranceRate: deliverSanitizeNumber(store?.platformSettings?.insuranceRate, 0.05),
      commissionRate: deliverSanitizeNumber(store?.platformSettings?.commissionRate, 0.12),
      ...(store?.platformSettings ?? {})
    }
  };
}

export function deliverCalculateFare(
  input: {
    packageWeightKg?: number;
    priority?: string;
    deliveryMode?: string;
    insuranceSelected?: boolean;
    dimensions?: { lengthCm?: number; widthCm?: number; heightCm?: number };
  },
  settings: DeliverExtendedStore["platformSettings"]
) {
  const weight = Math.max(0, deliverSanitizeNumber(input.packageWeightKg, 0));
  const priority = deliverSanitizeText(input.priority).toLowerCase();
  const mode = deliverSanitizeText(input.deliveryMode).toLowerCase();
  let deliveryCost = settings.baseFare + weight * settings.perKgRate;
  if (priority === "high") deliveryCost *= 1.25;
  if (priority === "critical") deliveryCost *= 1.5;
  if (mode === "drone") deliveryCost *= 1.15;
  if (mode === "ground") deliveryCost *= 0.95;
  const dims = input.dimensions ?? {};
  const volumeLiters =
    (deliverSanitizeNumber(dims.lengthCm, 0) * deliverSanitizeNumber(dims.widthCm, 0) * deliverSanitizeNumber(dims.heightCm, 0)) /
    1000;
  if (volumeLiters > 20) deliveryCost += (volumeLiters - 20) * 0.15;
  const insuranceFee = input.insuranceSelected ? deliveryCost * settings.insuranceRate : 0;
  const tax = (deliveryCost + insuranceFee) * settings.taxRate;
  const total = deliveryCost + insuranceFee + tax;
  const etaMinutes = mode === "drone" ? 25 + weight * 2 : 40 + weight * 3;
  return {
    deliveryCost: Number(deliveryCost.toFixed(2)),
    insuranceFee: Number(insuranceFee.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number(total.toFixed(2)),
    etaMinutes: Math.round(etaMinutes),
    estimatedArrival: new Date(Date.now() + etaMinutes * 60 * 1000).toISOString()
  };
}

export function deliverWalletForPhone(store: DeliverExtendedStore, phone: string) {
  const key = deliverSanitizeText(phone);
  if (!key) return { balance: 0, currency: "KES", transactions: [] as any[] };
  if (!store.wallets[key]) {
    store.wallets[key] = { balance: 0, currency: "KES", transactions: [] };
  }
  return store.wallets[key];
}

export function deliverBuildCustomerDashboard(store: DeliverExtendedStore, phone: string) {
  const normalized = deliverSanitizeText(phone);
  const orders = (store.orders || []).filter((o) => deliverSanitizeText(o.clientPhone) === normalized);
  const active = orders.find((o) => {
    const s = deliverSanitizeText(o.status).toLowerCase();
    return s === "pending" || s === "assigned" || s === "in_transit" || s === "in-flight";
  });
  const recent = [...orders].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))).slice(0, 5);
  const addresses = (store.savedAddresses || []).filter((a) => deliverSanitizeText(a.phone) === normalized);
  const wallet = deliverWalletForPhone(store, normalized);
  const profile = (store.customerProfiles || []).find((p) => deliverSanitizeText(p.phone) === normalized) ?? null;
  return {
    activeDelivery: active ?? null,
    recentDeliveries: recent,
    savedAddresses: addresses,
    walletBalance: wallet.balance,
    currency: wallet.currency,
    profile,
    promotions: store.promotions.filter((p) => p.active !== false).slice(0, 5),
    recommendations: recent.length
      ? [{ label: "Reorder last delivery", orderId: recent[0].id }]
      : [{ label: "Create your first delivery", orderId: null }]
  };
}

export function deliverBuildGroundOpsDashboard(store: DeliverExtendedStore) {
  const orders = store.orders || [];
  const active = orders.filter((o) => {
    const s = deliverSanitizeText(o.status).toLowerCase();
    return s === "assigned" || s === "in_transit" || s === "in-flight" || s === "pending";
  });
  const delayed = active.filter((o) => {
    const created = Date.parse(String(o.createdAt ?? ""));
    return Number.isFinite(created) && Date.now() - created > 2 * 60 * 60 * 1000;
  });
  const availableDrivers = (store.drivers || []).filter((d) => deliverSanitizeText(d.availability) === "available").length;
  const availableDrones = (store.drones || []).filter((d) => deliverSanitizeText(d.status) === "available").length;
  const warehouseQueue = (store.warehousePackages || []).filter((p) => deliverSanitizeText(p.status) === "received").length;
  return {
    activeDeliveries: active.length,
    delayedDeliveries: delayed.length,
    driverAvailability: availableDrivers,
    droneAvailability: availableDrones,
    warehouseQueue,
    openIncidents: (store.incidents || []).filter((i) => deliverSanitizeText(i.status) !== "resolved").length,
    openExceptions: (store.exceptions || []).filter((e) => deliverSanitizeText(e.status) !== "closed").length
  };
}

export function deliverBuildExecutiveDashboard(store: DeliverExtendedStore) {
  const orders = store.orders || [];
  const delivered = orders.filter((o) => deliverSanitizeText(o.status).toLowerCase() === "delivered");
  const revenue = delivered.reduce((sum, o) => sum + deliverSanitizeNumber(o.pricing?.total, 0), 0);
  const commission = revenue * store.platformSettings.commissionRate;
  return {
    totalOrders: orders.length,
    deliveredOrders: delivered.length,
    totalDrones: (store.drones || []).length,
    totalDrivers: (store.drivers || []).length,
    totalMerchants: (store.merchants || []).length,
    openTickets: (store.supportTickets || []).filter((t) => deliverSanitizeText(t.status) !== "closed").length,
    revenue: Number(revenue.toFixed(2)),
    commission: Number(commission.toFixed(2)),
    currency: "KES"
  };
}

export function deliverEnhanceOrderBody(body: Record<string, unknown>, settings: DeliverExtendedStore["platformSettings"]) {
  const pricing = deliverCalculateFare(
    {
      packageWeightKg: deliverSanitizeNumber(body.packageWeightKg, 0),
      priority: deliverSanitizeText(body.priority),
      deliveryMode: deliverSanitizeText(body.deliveryMode) || "auto",
      insuranceSelected: Boolean(body.insuranceSelected),
      dimensions: body.dimensions as any
    },
    settings
  );
  return {
    packageType: deliverSanitizeText(body.packageType) || "parcel",
    dimensions: {
      lengthCm: deliverSanitizeNumber((body.dimensions as any)?.lengthCm, 0),
      widthCm: deliverSanitizeNumber((body.dimensions as any)?.widthCm, 0),
      heightCm: deliverSanitizeNumber((body.dimensions as any)?.heightCm, 0)
    },
    deliveryMode: deliverSanitizeText(body.deliveryMode) || "auto",
    scheduledAt: deliverSanitizeText(body.scheduledAt),
    insuranceSelected: Boolean(body.insuranceSelected),
    pricing,
    eta: pricing.estimatedArrival,
    assignedDriverId: "",
    paymentStatus: deliverSanitizeText(body.paymentStatus) || "pending"
  };
}
