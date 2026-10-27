/** KV helpers for Hours of Service rules, timeclock punches, and alert states. */

export type HosJurisdiction = "eu_aetr" | "us_fmcsa" | "ca_federal";

export type HosRulesPayload = {
  jurisdiction: HosJurisdiction;
  label?: string;
  /** Flat numbers plus optional `breakRules` array for multi-threshold rest. */
  limits?: Record<string, unknown>;
  updatedAt?: string;
  updatedBy?: string;
};

export type HosTimeclockPunch = {
  id: string;
  driverKey: string;
  driverName: string;
  status: string;
  at: string;
  note?: string;
  createdBy?: string;
};

export type HosAlertState = {
  id: string;
  driverKey: string;
  driverName: string;
  type: string;
  severity: string;
  message: string;
  time: string;
  status: "open" | "acknowledged" | "resolved";
  atMs?: number;
};

type KvLike = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<unknown>;
};

const rulesKey = (tenantId: string) => `vivi:hos-rules:${tenantId}`;
const punchesKey = (tenantId: string) => `vivi:hos-timeclock:${tenantId}`;
const alertsKey = (tenantId: string) => `vivi:hos-alerts:${tenantId}`;

export async function readHosRules(kv: KvLike, tenantId: string): Promise<HosRulesPayload | null> {
  const raw = await kv.get(rulesKey(tenantId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HosRulesPayload;
  } catch {
    return null;
  }
}

export async function writeHosRules(kv: KvLike, tenantId: string, rules: HosRulesPayload): Promise<HosRulesPayload> {
  const next: HosRulesPayload = {
    ...rules,
    jurisdiction: (["eu_aetr", "us_fmcsa", "ca_federal"].includes(String(rules.jurisdiction))
      ? rules.jurisdiction
      : "eu_aetr") as HosJurisdiction,
    updatedAt: new Date().toISOString()
  };
  await kv.put(rulesKey(tenantId), JSON.stringify(next));
  return next;
}

export async function readHosPunches(kv: KvLike, tenantId: string, since?: string): Promise<HosTimeclockPunch[]> {
  const raw = await kv.get(punchesKey(tenantId));
  if (!raw) return [];
  let list: HosTimeclockPunch[] = [];
  try {
    const parsed = JSON.parse(raw) as HosTimeclockPunch[];
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    return [];
  }
  const sinceMs = since ? Date.parse(since) : NaN;
  if (!Number.isFinite(sinceMs)) return list;
  return list.filter((row) => Date.parse(String(row.at ?? "")) >= sinceMs);
}

export async function appendHosPunch(
  kv: KvLike,
  tenantId: string,
  punch: HosTimeclockPunch
): Promise<HosTimeclockPunch> {
  const raw = await kv.get(punchesKey(tenantId));
  let list: HosTimeclockPunch[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as HosTimeclockPunch[];
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  list = [punch, ...list.filter((row) => row.id !== punch.id)].slice(0, 2000);
  await kv.put(punchesKey(tenantId), JSON.stringify(list));
  return punch;
}

export async function readHosAlerts(kv: KvLike, tenantId: string): Promise<HosAlertState[]> {
  const raw = await kv.get(alertsKey(tenantId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as HosAlertState[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function upsertHosAlert(kv: KvLike, tenantId: string, alert: HosAlertState): Promise<HosAlertState> {
  const list = await readHosAlerts(kv, tenantId);
  const index = list.findIndex((row) => row.id === alert.id);
  if (index >= 0) list[index] = { ...list[index], ...alert };
  else list.unshift(alert);
  await kv.put(alertsKey(tenantId), JSON.stringify(list.slice(0, 500)));
  return alert;
}
