/**
 * Buzzer / relay actions on notification-library alerts.
 *
 * The library row says what to do when the alert fires (Actions → buzzer, relay drive
 * 1/2: delay, duration). The device binding is the master switch per device:
 *   - advancedSettings.buzzerEnabled: off → the buzzer never sounds from alerts
 *   - advancedSettings.relayAlertsEnabled: relays (Relay 1 is the immobilizer) are only
 *     switched by alerts when this is explicitly on
 *
 * Wiring (Teltonika `setdigout`): buzzer → DOUT2, relay drive 1 → DOUT1, relay drive 2 → DOUT2.
 */

export type HmsDelay = { hours?: string; minutes?: string; seconds?: string };
type LibraryAction = { enabled?: boolean; delay?: HmsDelay; duration?: string; override?: boolean };

export type DeviceActionKind = "buzzer" | "relayOne" | "relayTwo";

export type AlertDeviceAction = {
  kind: DeviceActionKind;
  output: 1 | 2;
  delayMs: number;
  /** Seconds the output stays on; null = on while the alert condition holds. */
  seconds: number | null;
};

const OUTPUT_FOR: Record<DeviceActionKind, 1 | 2> = { buzzer: 2, relayOne: 1, relayTwo: 2 };

/** Longest "while the condition holds" pulse when the end cannot be observed (Traccar events). */
export const CONTINUOUS_FALLBACK_SECONDS = 10;

const hmsMs = (delay: HmsDelay | undefined) => {
  const part = (value: unknown) => {
    const n = Number(String(value ?? "").trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return ((part(delay?.hours) * 60 + part(delay?.minutes)) * 60 + part(delay?.seconds)) * 1000;
};

/** "Sound the buzzer for 5 seconds" → 5; "… continuously when the condition is true" → null. */
export function actionDurationSeconds(duration: string | undefined): number | null {
  const text = String(duration ?? "").trim().toLowerCase();
  if (!text || text.includes("continuous")) return text ? null : 1;
  const match = text.match(/(\d+)\s*sec/);
  const seconds = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
}

export function libraryRowDeviceActions(row: { parameters?: { actions?: Record<string, LibraryAction> } }): AlertDeviceAction[] {
  const actions = row.parameters?.actions ?? {};
  const out: AlertDeviceAction[] = [];
  for (const kind of ["buzzer", "relayOne", "relayTwo"] as DeviceActionKind[]) {
    const action = actions[kind];
    if (!action?.enabled) continue;
    out.push({
      kind,
      output: OUTPUT_FOR[kind],
      delayMs: hmsMs(action.delay),
      seconds: actionDurationSeconds(action.duration)
    });
  }
  return out;
}

/** Device binding master switches: which actions this device may perform at all. */
export function allowedDeviceActions(
  deviceBinding: { advancedSettings?: Record<string, unknown> } | null | undefined
): Set<DeviceActionKind> {
  const settings = (deviceBinding?.advancedSettings ?? {}) as Record<string, unknown>;
  const allowed = new Set<DeviceActionKind>();
  // Buzzer defaults to on (the binding page's default); relays must be switched on explicitly.
  if (settings.buzzerEnabled !== false) allowed.add("buzzer");
  if (settings.relayAlertsEnabled === true) {
    allowed.add("relayOne");
    allowed.add("relayTwo");
  }
  return allowed;
}

/**
 * Teltonika `setdigout`: one character per output (1 on, 0 off, ? unchanged), then
 * optional per-output timeouts in seconds after which the output reverts.
 */
export function digitalOutputCommand(output: 1 | 2, on: boolean, seconds?: number | null): string {
  const state = on ? "1" : "0";
  const states = output === 1 ? `${state}?` : `?${state}`;
  if (!on || !seconds) return `setdigout ${states}`;
  return output === 1 ? `setdigout ${states} ${seconds}` : `setdigout ${states} 0 ${seconds}`;
}

type TraccarSend = (path: string, init: RequestInit) => Promise<{ ok: boolean; status: number; body: unknown }>;

/** Queue a text command on the device through Traccar (same path as Remote Actions). */
export async function sendDeviceCommand(traccarFetch: TraccarSend, deviceId: number, command: string) {
  const payload = JSON.stringify({ deviceId, type: "custom", attributes: { data: command } });
  const init = { method: "POST", headers: { "content-type": "application/json" }, body: payload };
  const sent = await traccarFetch("/api/commands/send", init);
  if (sent.ok) return true;
  const queued = await traccarFetch("/api/commands", init);
  if (!queued.ok) {
    console.warn("Alert device command failed:", { deviceId, command, status: sent.status, body: sent.body });
  }
  return queued.ok;
}

/** Traccar fetch with the Worker's credentials (token, else user/password). */
export function createTraccarSender(env: {
  TRACCAR_BASE_URL?: string;
  TRACCAR_TOKEN?: string;
  TRACCAR_USERNAME?: string;
  TRACCAR_PASSWORD?: string;
}): TraccarSend {
  return async (path, init) => {
    const base = String(env.TRACCAR_BASE_URL ?? "").trim().replace(/\/$/, "").replace(/\/api$/i, "");
    if (!base) return { ok: false, status: 0, body: null };
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    const token = String(env.TRACCAR_TOKEN ?? "").trim();
    const user = String(env.TRACCAR_USERNAME ?? "").trim();
    const pass = String(env.TRACCAR_PASSWORD ?? "").trim();
    if (token) headers.set("authorization", `Bearer ${token}`);
    else if (user && pass) headers.set("authorization", `Basic ${btoa(`${user}:${pass}`)}`);
    try {
      const response = await fetch(`${base}${path}`, { ...init, headers });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      return { ok: false, status: 0, body: String((error as Error)?.message ?? error) };
    }
  };
}

type DeviceBindingLookupEnv = { VIVI_D1: D1Database };

const parseRows = (rows: Array<{ data?: string }> | undefined) =>
  (rows ?? [])
    .map((row) => {
      try {
        return JSON.parse(String(row.data ?? "{}")) as Record<string, any>;
      } catch {
        return null;
      }
    })
    .filter((row): row is Record<string, any> => Boolean(row));

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const siteToken = (value: unknown) => norm(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** The device binding for an asset: asset → configuration group (same site) → device binding. */
export async function loadAssetDeviceBinding(
  env: DeviceBindingLookupEnv,
  tenantId: string,
  asset: Record<string, unknown>
): Promise<Record<string, any> | null> {
  const site = String(asset.site ?? "").trim();
  const groupRef = String(asset.configGroup ?? asset.configurationGroup ?? asset.configGroupName ?? "").trim();
  if (!site || !groupRef) return null;
  const [groups, bindings] = await Promise.all([
    env.VIVI_D1.prepare("SELECT data FROM configuration_groups WHERE tenant_id = ?1")
      .bind(tenantId)
      .all<{ data?: string }>()
      .then((result) => parseRows(result.results))
      .catch(() => []),
    env.VIVI_D1.prepare("SELECT data FROM bindings WHERE tenant_id = ?1 AND type = ?2")
      .bind(tenantId, "devices")
      .all<{ data?: string }>()
      .then((result) => parseRows(result.results))
      .catch(() => [])
  ]);
  const group = groups.find(
    (row) => (norm(row.name) === norm(groupRef) || norm(row.id) === norm(groupRef)) && siteToken(row.site) === siteToken(site)
  );
  const bindingRef = norm(group?.deviceBinding);
  if (!bindingRef) return null;
  return (
    bindings.find(
      (row) => (norm(row.name) === bindingRef || norm(row.id) === bindingRef) && siteToken(row.site) === siteToken(site)
    ) ?? null
  );
}
