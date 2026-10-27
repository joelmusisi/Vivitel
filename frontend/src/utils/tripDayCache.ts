/**
 * Trip loading in small batches with a browser cache for finished time slices.
 *
 * A trips request is cut into slices at UTC midnight. A slice that ended a few
 * hours ago is settled: its trips are kept per vehicle in memory and IndexedDB
 * and never fetched again. Only open slices (usually today) and slices not seen
 * before go to the tracking server.
 */

const DAY_MS = 86_400_000;
/** A day is settled once it ended this long ago (late uploads from devices). */
const SETTLE_LAG_MS = 3 * 60 * 60 * 1000;
/** Settled days older than this are dropped from IndexedDB. */
const KEEP_DAYS = 62;
const DAY_FETCH_CONCURRENCY = 3;
/**
 * The Worker aborts a Traccar report at 60 s and a trips report costs roughly
 * 6 s per vehicle-day, so requests stay small and a failed batch is retried
 * vehicle by vehicle.
 */
const IDS_PER_REQUEST = 5;
/** Trip requests in flight from this module (the browser proxy pool is 6, shared with live polls). */
const REQUEST_CONCURRENCY = 4;

const DB_NAME = "vivi-trip-slices";
const STORE = "days";

type DeviceTrip = { deviceId?: unknown };
type FetchRange<T> = (ids: string[], fromIso: string, toIso: string) => Promise<{ ok: boolean; trips: T[] }>;

const memory = new Map<string, unknown[]>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
let pruned = false;

const openDb = (): Promise<IDBDatabase | null> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      // First version of this cache used whole-day keys; drop it.
      indexedDB.deleteDatabase("vivi-trip-days");
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE);
        store.createIndex("dayMs", "dayMs");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
};

const idbGetMany = async (keys: string[]): Promise<Map<string, unknown[]>> => {
  const found = new Map<string, unknown[]>();
  const db = await openDb();
  if (!db || keys.length === 0) return found;
  await new Promise<void>((resolve) => {
    try {
      const store = db.transaction(STORE, "readonly").objectStore(STORE);
      let pending = keys.length;
      keys.forEach((key) => {
        const request = store.get(key);
        request.onsuccess = () => {
          const row = request.result as { trips?: unknown[] } | undefined;
          if (row && Array.isArray(row.trips)) found.set(key, row.trips);
          if (--pending === 0) resolve();
        };
        request.onerror = () => {
          if (--pending === 0) resolve();
        };
      });
    } catch {
      resolve();
    }
  });
  return found;
};

const idbPutMany = async (rows: Array<{ key: string; dayMs: number; trips: unknown[] }>) => {
  const db = await openDb();
  if (!db || rows.length === 0) return;
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    rows.forEach((row) => store.put({ dayMs: row.dayMs, trips: row.trips }, row.key));
  } catch {
    // quota / private mode: memory cache still applies
  }
};

const pruneOldDays = async () => {
  if (pruned) return;
  pruned = true;
  const db = await openDb();
  if (!db) return;
  try {
    const cutoff = Date.now() - KEEP_DAYS * DAY_MS;
    const index = db.transaction(STORE, "readwrite").objectStore(STORE).index("dayMs");
    const request = index.openCursor(IDBKeyRange.upperBound(cutoff));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
  } catch {
    // ignore
  }
};

let requestsInFlight = 0;
const requestWaiters: Array<() => void> = [];

const withRequestSlot = async <R>(work: () => Promise<R>): Promise<R> => {
  if (requestsInFlight >= REQUEST_CONCURRENCY) {
    await new Promise<void>((resolve) => requestWaiters.push(resolve));
  }
  requestsInFlight += 1;
  try {
    return await work();
  } finally {
    requestsInFlight -= 1;
    requestWaiters.shift()?.();
  }
};

/** Small batches, bounded concurrency, per-vehicle retry. Returns the ids that still failed. */
async function fetchInBatches<T extends DeviceTrip>(
  ids: string[],
  fromIso: string,
  toIso: string,
  fetchRange: FetchRange<T>
): Promise<{ trips: T[]; failedIds: Set<string> }> {
  const trips: T[] = [];
  const failedIds = new Set<string>();
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += IDS_PER_REQUEST) {
    batches.push(ids.slice(index, index + IDS_PER_REQUEST));
  }
  await Promise.all(batches.map(async (batch) => {
    const result = await withRequestSlot(() => fetchRange(batch, fromIso, toIso)).catch(() => ({ ok: false, trips: [] as T[] }));
    if (result.ok || batch.length === 1) {
      trips.push(...result.trips);
      if (!result.ok) batch.forEach((id) => failedIds.add(id));
      return;
    }
    await Promise.all(batch.map(async (id) => {
      const single = await withRequestSlot(() => fetchRange([id], fromIso, toIso)).catch(() => ({ ok: false, trips: [] as T[] }));
      trips.push(...single.trips);
      if (!single.ok) failedIds.add(id);
    }));
  }));
  return { trips, failedIds };
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await worker(item);
      }
    })
  );
}

/**
 * Trips for `ids` over [fromIso, toIso]. `ok` is false when any part failed to
 * load (failed days are not cached). `scope` separates servers / tenants.
 */
export async function loadTripsWithDayCache<T extends DeviceTrip>(
  ids: string[],
  fromIso: string,
  toIso: string,
  scope: string,
  fetchRange: FetchRange<T>
): Promise<{ ok: boolean; trips: T[] }> {
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs || ids.length === 0) {
    const direct = await fetchInBatches(ids, fromIso, toIso, fetchRange);
    return { ok: direct.failedIds.size === 0, trips: direct.trips };
  }
  void pruneOldDays();

  // Slices cut at UTC midnight. A slice that ended SETTLE_LAG_MS ago is settled and cached
  // per vehicle under its exact bounds, so partial days (e.g. a site-local "Yesterday") cache too.
  const settledBefore = Date.now() - SETTLE_LAG_MS;
  const slices: Array<{ start: number; end: number; settled: boolean }> = [];
  for (let start = fromMs; start < toMs;) {
    const end = Math.min(toMs, (Math.floor(start / DAY_MS) + 1) * DAY_MS);
    slices.push({ start, end, settled: end <= settledBefore });
    start = end;
  }

  const iso = (ms: number) => new Date(ms).toISOString();
  const cacheKey = (id: string, start: number, end: number) => `${scope}|${id}|${start}|${end}`;
  const settledKeys = slices
    .filter((slice) => slice.settled)
    .flatMap((slice) => ids.map((id) => cacheKey(id, slice.start, slice.end)));
  const stored = await idbGetMany(settledKeys.filter((key) => !memory.has(key)));
  stored.forEach((list, key) => memory.set(key, list));

  let ok = true;
  const trips: T[] = [];
  await mapPool(slices, DAY_FETCH_CONCURRENCY, async ({ start, end, settled }) => {
    const missing = settled ? ids.filter((id) => !memory.has(cacheKey(id, start, end))) : ids;
    if (missing.length > 0) {
      const result = await fetchInBatches(missing, iso(start), iso(end), fetchRange);
      if (result.failedIds.size > 0) ok = false;
      if (!settled) {
        trips.push(...result.trips);
      } else {
        // Cache only vehicles whose request succeeded; failed ones are fetched again next run.
        const byDevice = new Map<string, unknown[]>(
          missing.filter((id) => !result.failedIds.has(id)).map((id) => [id, []])
        );
        result.trips.forEach((trip) => {
          const list = byDevice.get(String(trip.deviceId ?? ""));
          if (list) list.push(trip);
          else trips.push(trip);
        });
        const rows = [...byDevice.entries()].map(([id, list]) => ({ key: cacheKey(id, start, end), dayMs: start, trips: list }));
        rows.forEach((row) => memory.set(row.key, row.trips));
        void idbPutMany(rows);
      }
    }
    if (settled) {
      ids.forEach((id) => {
        const cached = memory.get(cacheKey(id, start, end));
        if (cached) trips.push(...(cached as T[]));
      });
    }
  });

  trips.sort((a, b) => Date.parse(String((a as any).startTime ?? "")) - Date.parse(String((b as any).startTime ?? "")));
  return { ok, trips };
}
