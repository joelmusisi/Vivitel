import { useEffect, useMemo, useState } from "react";
import {
  deliverAutoAssignPending,
  deliverAssignOrder,
  deliverConfirmDelivery,
  deliverGetState,
  deliverPlaceOrder,
  deliverRegisterDrone,
  deliverTrackOrders
} from "../utils/api";

type Drone = {
  id: string;
  name: string;
  status: string;
  batteryPct: number;
  maxPayloadKg: number;
  rangeKm: number;
  speedKph: number;
  activeOrderId?: string;
  lastUpdated?: string;
};

type Order = {
  id: string;
  clientName: string;
  clientPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  packageWeightKg: number;
  priority: string;
  status: string;
  assignedDroneId?: string;
  createdAt?: string;
};

type Requirements = {
  user?: { lowEnd?: string[]; highEnd?: string[] };
  commandCenter?: { lowEnd?: string[]; highEnd?: string[] };
  collaboration?: string[];
};

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const pillClass = (status: string) => {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return "overview-pill";
  // reuse overview-pill variants where possible
  if (s === "pending") return "overview-pill warning";
  if (s === "assigned" || s === "in_transit" || s === "in-flight") return "overview-pill high";
  if (s === "delivered") return "overview-pill online";
  if (s === "charging") return "overview-pill medium";
  if (s === "available") return "overview-pill online";
  return "overview-pill";
};

export default function DroneDelivery() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drones, setDrones] = useState<Drone[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [requirements, setRequirements] = useState<Requirements>({});

  const [orderDraft, setOrderDraft] = useState({
    clientName: "",
    clientPhone: "",
    pickupAddress: "",
    dropoffAddress: "",
    packageWeightKg: "1.0",
    priority: "normal"
  });
  const [orderFeedback, setOrderFeedback] = useState<string | null>(null);

  const [phoneLookup, setPhoneLookup] = useState("");
  const [clientOrders, setClientOrders] = useState<Order[]>([]);

  const [droneDraft, setDroneDraft] = useState({
    id: "",
    name: "",
    status: "available",
    batteryPct: "100",
    maxPayloadKg: "2.0",
    rangeKm: "10",
    speedKph: "40"
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmOrderId, setConfirmOrderId] = useState("");
  const [confirmReceiver, setConfirmReceiver] = useState("");
  const [confirmProofCode, setConfirmProofCode] = useState("");
  const [confirmNotes, setConfirmNotes] = useState("");
  const [confirmFeedback, setConfirmFeedback] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await deliverGetState();
      setDrones(Array.isArray(state?.drones) ? state.drones : []);
      setOrders(Array.isArray(state?.orders) ? state.orders : []);
      setRequirements((state?.requirements ?? {}) as any);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const summary = useMemo(() => {
    const pending = orders.filter((o) => o.status === "pending").length;
    const inTransit = orders.filter((o) => o.status === "assigned" || o.status === "in_transit" || o.status === "in-flight").length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    const available = drones.filter((d) => String(d.status) === "available").length;
    return {
      totalOrders: orders.length,
      pendingOrders: pending,
      inTransitOrders: inTransit,
      deliveredOrders: delivered,
      totalDrones: drones.length,
      availableDrones: available
    };
  }, [orders, drones]);

  const eligibleDronesForOrder = (order: Order) => {
    const required = toNum(order.packageWeightKg, 0);
    return drones.filter((d) => {
      const payloadOk = toNum(d.maxPayloadKg, 0) >= required;
      return payloadOk && String(d.status) === "available" && toNum(d.batteryPct, 0) >= 35;
    });
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderFeedback(null);
    const payload = {
      clientName: orderDraft.clientName.trim(),
      clientPhone: orderDraft.clientPhone.trim(),
      pickupAddress: orderDraft.pickupAddress.trim(),
      dropoffAddress: orderDraft.dropoffAddress.trim(),
      packageWeightKg: toNum(orderDraft.packageWeightKg, 0),
      priority: orderDraft.priority
    };
    if (!payload.clientName || !payload.clientPhone || !payload.pickupAddress || !payload.dropoffAddress || payload.packageWeightKg <= 0) {
      setOrderFeedback("Fill all fields before placing an order.");
      return;
    }
    setLoading(true);
    try {
      const result = await deliverPlaceOrder(payload);
      if (!result.ok) {
        setOrderFeedback(result.error ?? "Failed to place order");
        return;
      }
      setOrderFeedback(`Order ${result.order?.id ?? ""} placed successfully.`);
      setOrderDraft({ clientName: "", clientPhone: "", pickupAddress: "", dropoffAddress: "", packageWeightKg: "1.0", priority: "normal" });
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = async () => {
    setClientOrders([]);
    const phone = phoneLookup.trim();
    if (!phone) return;
    setLoading(true);
    try {
      const result = await deliverTrackOrders(phone);
      setClientOrders(Array.isArray(result.orders) ? (result.orders as any) : []);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterDrone = async () => {
    setOrderFeedback(null);
    const payload = {
      id: droneDraft.id.trim() || undefined,
      name: droneDraft.name.trim() || undefined,
      status: droneDraft.status,
      batteryPct: toNum(droneDraft.batteryPct, 100),
      maxPayloadKg: toNum(droneDraft.maxPayloadKg, 2),
      rangeKm: toNum(droneDraft.rangeKm, 10),
      speedKph: toNum(droneDraft.speedKph, 40)
    };
    setLoading(true);
    try {
      const result = await deliverRegisterDrone(payload);
      if (!result.ok) {
        setOrderFeedback(result.error ?? "Failed to register drone");
        return;
      }
      setDroneDraft({ id: "", name: "", status: "available", batteryPct: "100", maxPayloadKg: "2.0", rangeKm: "10", speedKph: "40" });
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleAutoAssign = async () => {
    setLoading(true);
    try {
      const result = await deliverAutoAssignPending();
      setOrderFeedback(`Auto-assigned ${result.assignedCount ?? 0} orders.`);
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const openConfirm = (orderId: string) => {
    setConfirmOpen(true);
    setConfirmOrderId(orderId);
    setConfirmReceiver("");
    setConfirmProofCode("");
    setConfirmNotes("");
    setConfirmFeedback(null);
  };

  const handleConfirm = async () => {
    if (!confirmOrderId) return;
    setLoading(true);
    try {
      const result = await deliverConfirmDelivery(confirmOrderId, {
        receiverName: confirmReceiver.trim(),
        proofCode: confirmProofCode.trim(),
        notes: confirmNotes.trim()
      });
      if (!result.ok) {
        setConfirmFeedback(result.error ?? "Confirm failed");
        return;
      }
      setConfirmOpen(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="overview-header">
        <div>
          <div className="overview-eyebrow">Deliver</div>
          <h2 style={{ margin: 0 }}>Drone delivery operations</h2>
          <p className="overview-lead">Client orders, drone assignment, and delivery confirmation.</p>
        </div>
        <div className="overview-actions">
          <button className="btn ghost" type="button" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
          <button className="btn primary" type="button" onClick={() => void handleAutoAssign()} disabled={loading}>
            Auto assign pending
          </button>
        </div>
      </div>

      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
      {orderFeedback && <div>{orderFeedback}</div>}

      <div className="overview-metrics">
        {[
          ["Total Orders", summary.totalOrders],
          ["Pending", summary.pendingOrders],
          ["In Transit", summary.inTransitOrders],
          ["Delivered", summary.deliveredOrders],
          ["Total Drones", summary.totalDrones],
          ["Available Drones", summary.availableDrones]
        ].map(([label, value]) => (
          <div key={String(label)} className="metric">
            <div className="metric-label">{label as any}</div>
            <div className="metric-value">{value as any}</div>
          </div>
        ))}
      </div>

      <div className="overview-grid">
        <div className="overview-card">
          <div className="overview-card-header">
            <h3>Client workspace</h3>
            <span>Place order + track by phone</span>
          </div>
          <form onSubmit={handlePlaceOrder} className="admin-form" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label>
              Client name
              <input value={orderDraft.clientName} onChange={(e) => setOrderDraft((c) => ({ ...c, clientName: e.target.value }))} />
            </label>
            <label>
              Phone
              <input value={orderDraft.clientPhone} onChange={(e) => setOrderDraft((c) => ({ ...c, clientPhone: e.target.value }))} placeholder="+256..." />
            </label>
            <label>
              Pickup
              <input value={orderDraft.pickupAddress} onChange={(e) => setOrderDraft((c) => ({ ...c, pickupAddress: e.target.value }))} />
            </label>
            <label>
              Dropoff
              <input value={orderDraft.dropoffAddress} onChange={(e) => setOrderDraft((c) => ({ ...c, dropoffAddress: e.target.value }))} />
            </label>
            <label>
              Package (kg)
              <input type="number" min={0.1} step={0.1} value={orderDraft.packageWeightKg} onChange={(e) => setOrderDraft((c) => ({ ...c, packageWeightKg: e.target.value }))} />
            </label>
            <label>
              Priority
              <select value={orderDraft.priority} onChange={(e) => setOrderDraft((c) => ({ ...c, priority: e.target.value }))}>
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
                <option value="low">low</option>
              </select>
            </label>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="submit" className="btn primary" disabled={loading}>
                Place order
              </button>
            </div>
          </form>

          <div className="overview-card" style={{ marginTop: 12 }}>
            <div className="overview-card-header">
              <h3>Track my orders</h3>
              <span>Lookup by phone</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={{ flex: 1 }} value={phoneLookup} onChange={(e) => setPhoneLookup(e.target.value)} placeholder="Enter phone used on order" />
              <button type="button" className="btn" onClick={() => void handleTrack()} disabled={loading}>
                Track
              </button>
            </div>
            <div className="overview-table" style={{ marginTop: 10 }}>
              <div className="overview-row overview-head" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                <span>Order</span>
                <span>Status</span>
                <span>Drone</span>
                <span>Created</span>
              </div>
              {(clientOrders.length ? clientOrders : []).map((o) => (
                <div key={o.id} className="overview-row" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                  <span>{o.id}</span>
                  <span className={pillClass(o.status)}>{o.status}</span>
                  <span>{o.assignedDroneId || "-"}</span>
                  <span>{o.createdAt ? new Date(o.createdAt).toLocaleString() : "-"}</span>
                </div>
              ))}
              {!clientOrders.length && <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>No tracked orders.</div>}
            </div>
          </div>
        </div>

        <div className="overview-card">
          <div className="overview-card-header">
            <h3>Command center</h3>
            <span>Drones + orders board</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
            <label>
              Drone ID (optional)
              <input value={droneDraft.id} onChange={(e) => setDroneDraft((c) => ({ ...c, id: e.target.value }))} placeholder="DRN-1004" />
            </label>
            <label>
              Name
              <input value={droneDraft.name} onChange={(e) => setDroneDraft((c) => ({ ...c, name: e.target.value }))} placeholder="Atlas Two" />
            </label>
            <label>
              Status
              <select value={droneDraft.status} onChange={(e) => setDroneDraft((c) => ({ ...c, status: e.target.value }))}>
                <option value="available">available</option>
                <option value="charging">charging</option>
                <option value="maintenance">maintenance</option>
              </select>
            </label>
            <label>
              Battery %
              <input type="number" min={0} max={100} value={droneDraft.batteryPct} onChange={(e) => setDroneDraft((c) => ({ ...c, batteryPct: e.target.value }))} />
            </label>
            <label>
              Payload kg
              <input type="number" min={0.2} step={0.1} value={droneDraft.maxPayloadKg} onChange={(e) => setDroneDraft((c) => ({ ...c, maxPayloadKg: e.target.value }))} />
            </label>
            <label>
              Range km
              <input type="number" min={1} value={droneDraft.rangeKm} onChange={(e) => setDroneDraft((c) => ({ ...c, rangeKm: e.target.value }))} />
            </label>
            <label>
              Speed kph
              <input type="number" min={10} value={droneDraft.speedKph} onChange={(e) => setDroneDraft((c) => ({ ...c, speedKph: e.target.value }))} />
            </label>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="button" className="btn primary" onClick={() => void handleRegisterDrone()} disabled={loading}>
                Register drone
              </button>
            </div>
          </div>

          <div className="overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
              <span>ID</span>
              <span>Name</span>
              <span>Status</span>
              <span>Battery</span>
              <span>Payload</span>
              <span>Active order</span>
            </div>
            {drones.map((d) => (
              <div key={d.id} className="overview-row" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
                <span>{d.id}</span>
                <span>{d.name}</span>
                <span className={pillClass(d.status)}>{d.status}</span>
                <span>{d.batteryPct}%</span>
                <span>{d.maxPayloadKg} kg</span>
                <span>{d.activeOrderId || "-"}</span>
              </div>
            ))}
            {!drones.length && <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>No drones registered.</div>}
          </div>

          <div className="overview-table" style={{ marginTop: 16 }}>
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "1.1fr 1.3fr 0.7fr 0.7fr 0.7fr 1.5fr" }}>
              <span>Order</span>
              <span>Client</span>
              <span>Weight</span>
              <span>Status</span>
              <span>Drone</span>
              <span>Actions</span>
            </div>
            {orders.map((o) => {
              const eligible = eligibleDronesForOrder(o);
              return (
                <div key={o.id} className="overview-row" style={{ gridTemplateColumns: "1.1fr 1.3fr 0.7fr 0.7fr 0.7fr 1.5fr" }}>
                  <span>{o.id}</span>
                  <span>
                    {o.clientName}
                    <br />
                    <small>{o.clientPhone}</small>
                  </span>
                  <span>{o.packageWeightKg} kg</span>
                  <span className={pillClass(o.status)}>{o.status}</span>
                  <span>{o.assignedDroneId || "-"}</span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {o.status === "pending" && (
                      <>
                        <select
                          data-assign-order={o.id}
                          defaultValue=""
                          style={{ maxWidth: 180 }}
                        >
                          <option value="">Select drone</option>
                          {eligible.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.id} ({d.batteryPct}%)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn"
                          onClick={async () => {
                            const select = document.querySelector(`select[data-assign-order='${o.id}']`) as HTMLSelectElement | null;
                            const droneId = (select?.value ?? "").trim();
                            if (!droneId) {
                              setOrderFeedback("Select a drone before assignment.");
                              return;
                            }
                            setLoading(true);
                            try {
                              const result = await deliverAssignOrder(o.id, droneId);
                              if (!result.ok) {
                                setOrderFeedback(result.error ?? "Assignment failed");
                                return;
                              }
                              await refresh();
                            } finally {
                              setLoading(false);
                            }
                          }}
                          disabled={loading}
                        >
                          Assign
                        </button>
                      </>
                    )}
                    {(o.status === "assigned" || o.status === "in_transit" || o.status === "in-flight") && (
                      <button type="button" className="btn primary" onClick={() => openConfirm(o.id)} disabled={loading}>
                        Confirm delivery
                      </button>
                    )}
                    {o.status === "delivered" && <span>—</span>}
                  </span>
                </div>
              );
            })}
            {!orders.length && <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>No orders yet.</div>}
          </div>
        </div>
      </div>

      <div className="overview-card">
        <div className="overview-card-header">
          <h3>Operational requirements</h3>
          <span>Low-end and high-end requirements</span>
        </div>
        <div className="overview-grid">
          {[
            ["User low-end", requirements.user?.lowEnd ?? []],
            ["User high-end", requirements.user?.highEnd ?? []],
            ["Command center low-end", requirements.commandCenter?.lowEnd ?? []],
            ["Command center high-end", requirements.commandCenter?.highEnd ?? []],
            ["Collaboration", requirements.collaboration ?? []]
          ].map(([title, items]) => (
            <div key={String(title)} className="overview-card" style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid rgba(148, 163, 184, 0.25)" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{title as any}</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(items as any[]).map((it, idx) => (
                  <li key={idx}>{String(it)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {confirmOpen && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setConfirmOpen(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title">Confirm delivery</div>
                <div className="admin-modal-sub">Order {confirmOrderId}</div>
              </div>
              <button type="button" className="admin-modal-close" onClick={() => setConfirmOpen(false)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <label className="admin-modal-field">
                <span>Receiver name</span>
                <input value={confirmReceiver} onChange={(e) => setConfirmReceiver(e.target.value)} />
              </label>
              <label className="admin-modal-field">
                <span>Proof code</span>
                <input value={confirmProofCode} onChange={(e) => setConfirmProofCode(e.target.value)} />
              </label>
              <label className="admin-modal-field">
                <span>Notes</span>
                <input value={confirmNotes} onChange={(e) => setConfirmNotes(e.target.value)} />
              </label>
              {confirmFeedback && <div style={{ color: "#b91c1c" }}>{confirmFeedback}</div>}
            </div>
            <div className="admin-modal-footer" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn ghost" type="button" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button className="btn primary" type="button" onClick={() => void handleConfirm()} disabled={loading}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
