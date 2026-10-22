import { buildScopedKvKey } from "./scopeIsolation";

export const DRIVERS_KV_BASE = "fleet:drivers" as const;

export type DriverKvRecord = Record<string, unknown> & {
  id?: string;
  driverId?: string;
  name?: string;
  site?: string;
};

const text = (value: unknown) => String(value ?? "").trim();

function parseDriverItems(raw: string | null): DriverKvRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { items?: unknown } | unknown[];
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { items?: unknown }).items)
        ? ((parsed as { items: unknown[] }).items)
        : [];
    return items.filter((row): row is DriverKvRecord => Boolean(row) && typeof row === "object");
  } catch {
    return [];
  }
}

function driverRecordKey(row: DriverKvRecord) {
  const site = text(row.site).toLowerCase();
  const name = text(row.name).toLowerCase();
  if (name) return `name:${site || "_"}::${name}`;
  const id = text(row.id ?? row.driverId);
  if (id) return `id:${id}`;
  return "";
}

function driversPrefixForTenant(tenantId: string) {
  const sample = buildScopedKvKey(DRIVERS_KV_BASE, tenantId, "all_sites_marker");
  const marker = sample.lastIndexOf(":site:");
  if (marker < 0) return `${DRIVERS_KV_BASE}:tenant:`;
  return sample.slice(0, marker + ":site:".length);
}

export async function listAllSiteDriversFromKv(
  get: (key: string) => Promise<string | null>,
  list: (prefix: string) => Promise<string[]>,
  tenantId: string
): Promise<DriverKvRecord[]> {
  if (!text(tenantId)) return [];
  const keys = await list(driversPrefixForTenant(tenantId));
  const groups = await Promise.all(keys.map((key) => get(key).then((raw) => parseDriverItems(raw))));
  return mergeDriverKvRecords(...groups);
}

export async function readSiteDriversFromKv(
  get: (key: string) => Promise<string | null>,
  tenantId: string,
  site: string
): Promise<DriverKvRecord[]> {
  const siteName = text(site);
  if (!siteName) return [];
  const key = buildScopedKvKey(DRIVERS_KV_BASE, tenantId, siteName);
  return parseDriverItems(await get(key));
}

export async function upsertSiteDriverInKv(
  get: (key: string) => Promise<string | null>,
  put: (key: string, value: string) => Promise<boolean>,
  tenantId: string,
  driver: DriverKvRecord
): Promise<boolean> {
  const site = text(driver.site);
  if (!site) return false;
  const key = buildScopedKvKey(DRIVERS_KV_BASE, tenantId, site);
  const current = parseDriverItems(await get(key));
  const incomingKey = driverRecordKey(driver);
  const next = incomingKey
    ? current.filter((row) => driverRecordKey(row) !== incomingKey)
    : current;
  next.unshift({ ...driver, site });
  return put(key, JSON.stringify({ items: next }));
}

export async function removeSiteDriverFromKv(
  get: (key: string) => Promise<string | null>,
  put: (key: string, value: string) => Promise<boolean>,
  tenantId: string,
  driver: { id?: string; site?: string }
): Promise<boolean> {
  const site = text(driver.site);
  const id = text(driver.id);
  if (!site) return false;
  const key = buildScopedKvKey(DRIVERS_KV_BASE, tenantId, site);
  const current = parseDriverItems(await get(key));
  const next = id
    ? current.filter((row) => text(row.id ?? row.driverId) !== id)
    : current;
  if (next.length === current.length) return true;
  return put(key, JSON.stringify({ items: next }));
}

export function mergeDriverKvRecords(...groups: DriverKvRecord[][]): DriverKvRecord[] {
  const byKey = new Map<string, DriverKvRecord>();
  for (const group of groups) {
    for (const row of group ?? []) {
      const key = driverRecordKey(row);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}
