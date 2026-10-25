/**
 * Day-split trip loading with a browser cache for finished days.
 *
 * A trips report over N days is split at UTC midnight. Whole days that ended a
 * few hours ago are settled: their trips are kept per device in memory and
 * IndexedDB and never fetched again. Only the partial head / tail of the range
 * (usually today) and days not seen before go to the tracking server.
 */

const DAY_MS = 86_400_000;
/** A day is settled once it ended this long ago (late uploads from devices). */
const SETTLE_LAG_MS = 3 * 60 * 60 * 1000;
/** Settled days older than this are dropped from IndexedDB. */
const KEEP_DAYS = 62;
const DAY_FETCH_CONCURRENCY = 3;

const DB_NAME = "vivi-trip-days";
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
  const settledBefore = Math.floor((Date.now() - SETTLE_LAG_MS) / DAY_MS) * DAY_MS;
  const firstDay = Math.ceil(fromMs / DAY_MS) * DAY_MS;
  const lastDayEnd = Math.min(Math.floor(toMs / DAY_MS) * DAY_MS, settledBefore);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || lastDayEnd - firstDay < DAY_MS || ids.length === 0) {
    return fetchRange(ids, fromIso, toIso);
  }
  void pruneOldDays();

  const iso = (ms: number) => new Date(ms).toISOString();
  const cacheKey = (id: string, dayMs: number) => `${scope}|${id}|${dayMs}`;
  const days: number[] = [];
  for (let day = firstDay; day < lastDayEnd; day += DAY_MS) days.push(day);

  // Settled days already in memory or IndexedDB.
  const allKeys = days.flatMap((day) => ids.map((id) => cacheKey(id, day)));
  const missingFromMemory = allKeys.filter((key) => !memory.has(key));
  const stored = await idbGetMany(missingFromMemory);
  stored.forEach((trips, key) => memory.set(key, trips));

  let ok = true;
  const trips: T[] = [];
  const edgeRanges: Array<[number, number]> = [];
  if (firstDay > fromMs) edgeRanges.push([fromMs, firstDay]);
  if (toMs > lastDayEnd) edgeRanges.push([lastDayEnd, toMs]);

  const edgeWork = edgeRanges.map(async ([start, end]) => {
    const result = await fetchRange(ids, iso(start), iso(end));
    if (!result.ok) ok = false;
    trips.push(...result.trips);
  });

  const dayWork = mapPool(days, DAY_FETCH_CONCURRENCY, async (day) => {
    const missing = ids.filter((id) => !memory.has(cacheKey(id, day)));
    if (missing.length > 0) {
      const result = await fetchRange(missing, iso(day), iso(day + DAY_MS));
      if (!result.ok) {
        ok = false;
        trips.push(...result.trips);
      } else {
        const byDevice = new Map<string, unknown[]>(missing.map((id) => [id, []]));
        result.trips.forEach((trip) => byDevice.get(String(trip.deviceId ?? ""))?.push(trip));
        const rows = [...byDevice.entries()].map(([id, list]) => ({ key: cacheKey(id, day), dayMs: day, trips: list }));
        rows.forEach((row) => memory.set(row.key, row.trips));
        void idbPutMany(rows);
      }
    }
    ids.forEach((id) => {
      const cached = memory.get(cacheKey(id, day));
      if (cached) trips.push(...(cached as T[]));
    });
  });

  await Promise.all([...edgeWork, dayWork]);
  trips.sort((a, b) => Date.parse(String((a as any).startTime ?? "")) - Date.parse(String((b as any).startTime ?? "")));
  return { ok, trips };
}
