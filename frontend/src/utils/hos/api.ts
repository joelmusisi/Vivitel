import {
  buildApiUrl,
  getApiKey,
  getDriversFromApi,
  getTenantId,
  getTraccarDevices,
  getTraccarTrips,
  type TraccarTrip
} from "../api";
import { buildScopedDeviceContext, loadScopedAssets } from "../homeScopedDevices";
import { filterRecordsForActiveSelection } from "../scopeStorage";
import { buildHosFleetSnapshot } from "./engine";
import { normalizeHosRules, rulesFromPreset } from "./presets";
import type { DutyStatus, HosAlert, HosFleetSnapshot, HosRules, HosTimeclockPunch } from "./types";

async function hosFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const tenantId = getTenantId();
  const apiKey = getApiKey();
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((body as any)?.error ?? (body as any)?.message ?? `HTTP ${response.status}`));
  }
  return body as T;
}

export async function loadHosRules(): Promise<HosRules> {
  try {
    const body = await hosFetch<{ rules?: unknown }>("/hos/rules", { method: "GET" });
    return normalizeHosRules(body?.rules);
  } catch {
    return rulesFromPreset("eu_aetr");
  }
}

export async function saveHosRules(rules: HosRules): Promise<HosRules> {
  const body = await hosFetch<{ rules?: unknown }>("/hos/rules", {
    method: "PUT",
    body: JSON.stringify({ rules })
  });
  return normalizeHosRules(body?.rules ?? rules);
}

export async function loadHosTimeclockPunches(since?: string): Promise<HosTimeclockPunch[]> {
  try {
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    const body = await hosFetch<{ punches?: HosTimeclockPunch[] }>(`/hos/timeclock${query}`, { method: "GET" });
    return Array.isArray(body?.punches) ? body.punches : [];
  } catch {
    return [];
  }
}

export async function postHosTimeclockPunch(input: {
  driverKey: string;
  driverName: string;
  status: DutyStatus;
  note?: string;
}): Promise<HosTimeclockPunch> {
  const body = await hosFetch<{ punch?: HosTimeclockPunch }>("/hos/timeclock", {
    method: "POST",
    body: JSON.stringify(input)
  });
  if (!body?.punch) throw new Error("Timeclock punch was not saved");
  return body.punch;
}

export async function loadHosAlertStates(): Promise<HosAlert[]> {
  try {
    const body = await hosFetch<{ alerts?: HosAlert[] }>("/hos/alerts", { method: "GET" });
    return Array.isArray(body?.alerts) ? body.alerts : [];
  } catch {
    return [];
  }
}

export async function saveHosAlertState(alert: HosAlert): Promise<HosAlert> {
  const body = await hosFetch<{ alert?: HosAlert }>("/hos/alerts", {
    method: "POST",
    body: JSON.stringify(alert)
  });
  return body?.alert ?? alert;
}

export async function loadHosFleetSnapshot(options?: {
  fromMs?: number;
  toMs?: number;
}): Promise<HosFleetSnapshot> {
  const toMs = options?.toMs ?? Date.now();
  // Load enough history for weekly / monthly driving checks (defaults to ~31 days).
  const fromMs = options?.fromMs ?? toMs - 31 * 24 * 60 * 60 * 1000;
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  const [rules, punches, existingAlerts, assets, devices] = await Promise.all([
    loadHosRules(),
    loadHosTimeclockPunches(fromIso),
    loadHosAlertStates(),
    loadScopedAssets().catch(() => [] as Record<string, unknown>[]),
    getTraccarDevices().catch(() => [])
  ]);

  const scoped = buildScopedDeviceContext(assets, devices as any[]);
  const deviceIds = scoped.deviceIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);

  const assetLabelByDeviceId = new Map<number, string>();
  for (const [id, asset] of scoped.assetByDeviceId) {
    const label = String(
      (asset as any).registration
      ?? (asset as any).assetDescription
      ?? (asset as any).name
      ?? id
    ).trim();
    assetLabelByDeviceId.set(Number(id), label);
  }

  const trips: TraccarTrip[] = [];
  const batchSize = 8;
  for (let i = 0; i < deviceIds.length; i += batchSize) {
    const batch = deviceIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((deviceId) =>
        getTraccarTrips({ from: fromIso, to: toIso, deviceId: String(deviceId) }).catch(() => [] as TraccarTrip[])
      )
    );
    for (const rows of results) trips.push(...rows);
  }

  // Also attach drivers that only exist in roster with no trips yet.
  const drivers = await getDriversFromApi<Record<string, unknown>>().catch(() => []);
  type ScopedDriver = Record<string, unknown> & { site: string };
  const scopedDrivers = filterRecordsForActiveSelection(
    (Array.isArray(drivers) ? drivers : []).map((driver): ScopedDriver => ({
      ...driver,
      site: String(driver.site ?? driver.organisation ?? "").trim()
    }))
  );
  const punchExtras: HosTimeclockPunch[] = [...punches];
  for (const driver of scopedDrivers) {
    const name = String(driver.name ?? driver.driverName ?? "").trim();
    const id = String(driver.id ?? driver.driverId ?? name).trim();
    if (!name && !id) continue;
    const key = id ? `drv:${id.toLowerCase()}` : `name:${name.toLowerCase()}`;
    if (trips.some((t) => String(t.driverUniqueId ?? "").toLowerCase() === id.toLowerCase())) continue;
    if (punchExtras.some((p) => p.driverKey === key)) continue;
    // Seed an off-duty marker so they appear on roster.
    punchExtras.push({
      id: `seed-${key}`,
      driverKey: key,
      driverName: name || id,
      status: "off_duty",
      at: new Date(fromMs).toISOString()
    });
  }

  return buildHosFleetSnapshot({
    rules,
    trips,
    punches: punchExtras,
    assetLabelByDeviceId,
    fromMs,
    toMs,
    nowMs: Date.now(),
    existingAlerts
  });
}
