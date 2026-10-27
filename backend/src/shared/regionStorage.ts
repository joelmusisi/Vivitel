import { DEFAULT_REGION, isRegionId, regionUsesTraccar, type RegionId } from "./regionServers";

/** Logical keys under these prefixes stay shared (sign-in secrets and reset links). */
const GLOBAL_KEY_PREFIXES = [
  "auth:admin:",
  "auth:reset:",
  "auth:session:",
  "rbac:reset:",
  "rbac:invite:",
  "health:kv"
];

export const regionKeyPrefix = (region: RegionId) => `region:${region}:`;

export const isGlobalRegionKey = (key: string) => {
  const normalized = String(key ?? "").trim();
  return GLOBAL_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

export const regionStorageKey = (region: RegionId, key: string) => {
  const normalized = String(key ?? "").trim();
  if (!normalized || isGlobalRegionKey(normalized)) return normalized;
  const prefix = regionKeyPrefix(region);
  if (normalized.startsWith(prefix)) return normalized;
  return `${prefix}${normalized}`;
};

/** Tenant id stored in D1. United States keeps the existing ids. Other hosts get their own rows. */
export const storageTenantId = (region: RegionId, tenantId: string) => {
  const id = String(tenantId ?? "").trim();
  if (!id || region === DEFAULT_REGION) return id;
  const prefix = regionKeyPrefix(region);
  return id.startsWith(prefix) ? id : `${prefix}${id}`;
};

export const durableObjectNameForRegion = (region: RegionId | string | undefined, tenantId: string) => {
  const id = String(tenantId ?? "").trim();
  const regionId = String(region ?? DEFAULT_REGION).trim().toLowerCase();
  if (!id || !regionId || regionId === DEFAULT_REGION) return id;
  if (id.startsWith(regionKeyPrefix(regionId as RegionId))) return id;
  return `${regionId}:${id}`;
};

/** Skip Traccar cron / device sync for ZA (cms808) and other non-Traccar partitions. */
export const isTraccarStorageTenant = (tenantId: string) => {
  const id = String(tenantId ?? "").trim();
  if (!id) return false;
  const match = id.match(/^region:([a-z0-9]+):/i);
  if (!match) return true;
  const region = String(match[1] ?? "").trim().toLowerCase();
  return isRegionId(region) ? regionUsesTraccar(region) : false;
};

type ListedKey = { name: string; expiration?: number; metadata?: unknown };

const mapListedName = (region: RegionId, name: string) => {
  const prefix = regionKeyPrefix(region);
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
};

async function drainKeys(kv: KVNamespace, prefix: string): Promise<ListedKey[]> {
  const names: ListedKey[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, limit: 1000, cursor });
    for (const key of page.keys ?? []) {
      const name = String(key?.name ?? "").trim();
      if (name) names.push({ name, expiration: key.expiration, metadata: key.metadata });
    }
    cursor = page.list_complete ? undefined : page.cursor;
    if (names.length >= 5000) break;
  } while (cursor);
  return names;
}

/**
 * One physical KV, partitioned by regional host.
 * Existing unprefixed keys stay on the United States host only.
 */
export function createRegionScopedKv(kv: KVNamespace, region: RegionId): KVNamespace {
  const prefix = regionKeyPrefix(region);

  const get = (async (key: string, options?: any) => {
    const logical = String(key ?? "");
    if (isGlobalRegionKey(logical)) return kv.get(logical, options);
    const scoped = regionStorageKey(region, logical);
    const hit = await kv.get(scoped, options);
    if (hit != null) return hit;
    if (region !== DEFAULT_REGION) return null;
    if (scoped === logical) return null;
    return kv.get(logical, options);
  }) as KVNamespace["get"];

  return {
    get,
    put: async (key: string, value: string, options?: KVNamespacePutOptions) => {
      const logical = String(key ?? "");
      const stored = isGlobalRegionKey(logical) ? logical : regionStorageKey(region, logical);
      await kv.put(stored, value, options);
    },
    delete: async (key: string) => {
      const logical = String(key ?? "");
      if (isGlobalRegionKey(logical)) {
        await kv.delete(logical);
        return;
      }
      await kv.delete(regionStorageKey(region, logical));
      if (region === DEFAULT_REGION) await kv.delete(logical);
    },
    list: async (options?: KVNamespaceListOptions) => {
      const logicalPrefix = String(options?.prefix ?? "");
      const scoped = await drainKeys(kv, `${prefix}${logicalPrefix}`);
      const keys = new Map<string, ListedKey>();
      for (const key of scoped) {
        const name = mapListedName(region, key.name);
        if (!logicalPrefix || name.startsWith(logicalPrefix)) keys.set(name, { ...key, name });
      }
      if (region === DEFAULT_REGION) {
        const legacy = await drainKeys(kv, logicalPrefix);
        for (const key of legacy) {
          if (key.name.startsWith("region:")) continue;
          if (!keys.has(key.name)) keys.set(key.name, key);
        }
      }
      return {
        keys: Array.from(keys.values()),
        list_complete: true,
        cursor: "",
        cacheStatus: null
      } as KVNamespaceListResult<unknown, string>;
    },
    getWithMetadata: ((key: string, options?: any) => kv.getWithMetadata(regionStorageKey(region, String(key ?? "")), options)) as KVNamespace["getWithMetadata"]
  } as unknown as KVNamespace;
}
