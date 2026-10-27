/**
 * App + DB cache helpers — Valkey/KV layer in front of SQLite/Postgres reads.
 */

export type JsonCacheStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlSec: number) => Promise<void>;
};

/** Short Worker KV TTL for D1 list GETs (bindings / assets). */
export const WORKER_LIST_CACHE_TTL_SEC = 120;

export function workerBindingsCacheKey(tenantId: string, type: string) {
  return `vivi:cache:d1:bindings:${encodeURIComponent(tenantId)}:${type}`;
}

export function workerAssetsCacheKey(tenantId: string) {
  return `vivi:cache:d1:assets:v7:${encodeURIComponent(tenantId)}`;
}

export async function readCachedJson<T>(store: JsonCacheStore, key: string): Promise<T | null> {
  try {
    const raw = await store.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeCachedJson<T>(
  store: JsonCacheStore,
  key: string,
  value: T,
  ttlSec: number
): Promise<void> {
  try {
    await store.set(key, JSON.stringify(value), ttlSec);
  } catch {
    // cache write failures must not break requests
  }
}

/** Read-through cache: Valkey/KV → compute (SQLite/Postgres) → store. */
export async function withDbCache<T>(
  store: JsonCacheStore,
  key: string,
  ttlSec: number,
  compute: () => Promise<T>
): Promise<T> {
  const cached = await readCachedJson<T>(store, key);
  if (cached !== null) return cached;
  const fresh = await compute();
  await writeCachedJson(store, key, fresh, ttlSec);
  return fresh;
}
