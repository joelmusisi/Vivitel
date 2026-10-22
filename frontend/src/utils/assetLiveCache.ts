/**
 * Latest live fixes for Live Tracking and Assets.
 * The asset catalog stores an older GPS time. Live updates used to stay in memory,
 * so every refresh painted that catalog date until the feed caught up.
 * This cache keeps the newest fix and is overlaid on the asset list.
 */

export type LiveFix = {
  atMs: number;
  fixTime: string;
  lat?: number;
  lng?: number;
  speed?: number | string;
  heading?: string;
  location?: string;
  lastLocation?: string;
  movement?: string;
  ignition?: string;
  satellites?: string;
  powerVoltage?: string;
  fuelReading?: string;
  odometer?: string;
  gps?: string;
  speedKph?: number | string;
  lastMoveAtMs?: number;
};

type LiveStore = {
  byImei: Record<string, LiveFix>;
  byId: Record<string, LiveFix>;
};

const MAX_FIXES = 3000;

const storageKey = (tenantId: string) => `vivi.livePositions:${tenantId}`;

const readStorage = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota or private mode — the in-memory page still updates.
  }
};

export const imeiKey = (value: unknown): string => {
  const digits = String(value ?? "").replace(/\D+/g, "");
  return digits.length >= 14 && digits.length <= 17 ? digits : "";
};

export const rowIdKey = (row: { id?: unknown; assetId?: unknown }): string =>
  String(row.id ?? row.assetId ?? "").trim();

/** Absolute time for a catalog row or a live row. Formatted dd/mm/yyyy stamps count. */
export const liveFixAtMs = (row: Record<string, unknown> | null | undefined): number => {
  if (!row) return Number.NaN;
  const direct = Number(row.telemetryAtMs);
  if (Number.isFinite(direct) && direct > 1e11) return direct;
  const latest = row.telemetryLatest && typeof row.telemetryLatest === "object"
    ? (row.telemetryLatest as Record<string, unknown>)
    : null;
  const candidates = [
    latest?.at,
    latest?.timestamp,
    latest?.deviceAt,
    row.lastSeen,
    row.last_seen,
    row.lastPosition,
    row.last_position,
    row.lastActive
  ];
  let best = Number.NaN;
  for (const value of candidates) {
    const ms = parseStampMs(value);
    if (Number.isFinite(ms) && (!Number.isFinite(best) || ms > best)) best = ms;
  }
  return best;
};

export const parseStampMs = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value > 1e9 ? value * 1000 : Number.NaN;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  if (/^\d{10,13}$/.test(raw)) {
    const numeric = Number(raw);
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return direct;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return Number.NaN;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const second = Number(match[6] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > 31) return Number.NaN;
  const eat = /\bEAT\b/i.test(raw);
  return Date.UTC(year, month - 1, day, hour - (eat ? 3 : 0), minute, second);
};

const emptyStore = (): LiveStore => ({ byImei: {}, byId: {} });

const readStore = (tenantId: string): LiveStore => {
  const id = String(tenantId ?? "").trim();
  if (!id) return emptyStore();
  const raw = readStorage(storageKey(id));
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as LiveStore;
    return {
      byImei: parsed?.byImei && typeof parsed.byImei === "object" ? parsed.byImei : {},
      byId: parsed?.byId && typeof parsed.byId === "object" ? parsed.byId : {}
    };
  } catch {
    return emptyStore();
  }
};

const writeStore = (tenantId: string, store: LiveStore) => {
  const id = String(tenantId ?? "").trim();
  if (!id) return;
  const imeis = Object.entries(store.byImei);
  if (imeis.length > MAX_FIXES) {
    imeis.sort((a, b) => a[1].atMs - b[1].atMs);
    store.byImei = Object.fromEntries(imeis.slice(imeis.length - MAX_FIXES));
  }
  const ids = Object.entries(store.byId);
  if (ids.length > MAX_FIXES) {
    ids.sort((a, b) => a[1].atMs - b[1].atMs);
    store.byId = Object.fromEntries(ids.slice(ids.length - MAX_FIXES));
  }
  writeStorage(storageKey(id), JSON.stringify(store));
};

const finiteNumber = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : undefined;
};

const text = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  return raw && raw !== "—" ? raw : "";
};

const fixFromRow = (row: Record<string, unknown>): LiveFix | null => {
  const atMs = liveFixAtMs(row);
  if (!Number.isFinite(atMs) || atMs <= 0) return null;
  const lat = finiteNumber(row.lat);
  const lng = finiteNumber(row.lng);
  const speed = row.speed ?? row.speedKph;
  const fix: LiveFix = {
    atMs,
    fixTime: new Date(atMs).toISOString()
  };
  if (lat != null && lng != null) {
    fix.lat = lat;
    fix.lng = lng;
  }
  if (speed != null && String(speed).trim() !== "") fix.speed = speed as number | string;
  const speedKph = finiteNumber(row.speedKph);
  if (speedKph != null) fix.speedKph = speedKph;
  const heading = text(row.heading);
  if (heading) fix.heading = heading;
  const location = text(row.location ?? row.lastLocation);
  if (location) {
    fix.location = location;
    fix.lastLocation = location;
  }
  const movement = text(row.movement);
  if (movement) fix.movement = movement;
  const ignition = text(row.ignition);
  if (ignition) fix.ignition = ignition;
  const satellites = text(row.satellites);
  if (satellites) fix.satellites = satellites;
  const powerVoltage = text(row.powerVoltage);
  if (powerVoltage) fix.powerVoltage = powerVoltage;
  const fuelReading = text(row.fuelReading);
  if (fuelReading) fix.fuelReading = fuelReading;
  const odometer = text(row.odometer);
  if (odometer) fix.odometer = odometer;
  const gps = text(row.gps);
  if (gps) fix.gps = gps;
  const lastMoveAtMs = finiteNumber(row.lastMoveAtMs);
  if (lastMoveAtMs != null) fix.lastMoveAtMs = lastMoveAtMs;
  return fix;
};

const lookupFix = (store: LiveStore, row: { id?: unknown; assetId?: unknown; imei?: unknown }): LiveFix | undefined => {
  const imei = imeiKey(row.imei);
  if (imei && store.byImei[imei]) return store.byImei[imei];
  const id = rowIdKey(row);
  if (id && store.byId[id]) return store.byId[id];
  return undefined;
};

const applyFix = <T extends Record<string, unknown>>(row: T, fix: LiveFix): T => {
  const rowMs = liveFixAtMs(row);
  const newer = !Number.isFinite(rowMs) || fix.atMs > rowMs;
  const same = Number.isFinite(rowMs) && fix.atMs === rowMs;
  const missingCoords = finiteNumber(row.lat) == null || finiteNumber(row.lng) == null;
  if (!newer && !(same && missingCoords && fix.lat != null && fix.lng != null)) return row;

  const next: Record<string, unknown> = { ...row };
  if (newer) {
    next.lastPosition = fix.fixTime;
    next.lastSeen = fix.fixTime;
    next.telemetryAtMs = fix.atMs;
    if (next.telemetryLatest && typeof next.telemetryLatest === "object") {
      next.telemetryLatest = {
        ...(next.telemetryLatest as Record<string, unknown>),
        at: fix.fixTime,
        timestamp: fix.fixTime
      };
    }
    if (fix.speed != null) {
      next.speed = typeof row.speed === "number" ? finiteNumber(fix.speed) ?? row.speed : fix.speed;
    }
    if (fix.speedKph != null) next.speedKph = finiteNumber(fix.speedKph) ?? fix.speedKph;
    if (fix.heading) next.heading = fix.heading;
    if (fix.location) {
      next.location = fix.location;
      next.lastLocation = fix.lastLocation || fix.location;
    }
    if (fix.movement) next.movement = fix.movement;
    if (fix.ignition) next.ignition = fix.ignition;
    if (fix.satellites) next.satellites = fix.satellites;
    if (fix.powerVoltage) next.powerVoltage = fix.powerVoltage;
    if (fix.fuelReading) next.fuelReading = fix.fuelReading;
    if (fix.odometer) next.odometer = fix.odometer;
    if (fix.gps) next.gps = fix.gps;
    if (fix.lastMoveAtMs != null) next.lastMoveAtMs = fix.lastMoveAtMs;
  }
  if ((newer || missingCoords) && fix.lat != null && fix.lng != null) {
    next.lat = fix.lat;
    next.lng = fix.lng;
  }
  return next as T;
};

/** Remember newer fixes from the rows currently on screen. Older stamps are ignored. */
export function rememberLivePositions(tenantId: string, rows: Array<Record<string, unknown>>): void {
  const id = String(tenantId ?? "").trim();
  if (!id || !Array.isArray(rows) || !rows.length) return;
  const store = readStore(id);
  let changed = false;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const fix = fixFromRow(row);
    if (!fix) continue;
    const imei = imeiKey(row.imei);
    const rowId = rowIdKey(row);
    const current = (imei && store.byImei[imei]) || (rowId && store.byId[rowId]) || undefined;
    if (current && current.atMs > fix.atMs) continue;
    if (current && current.atMs === fix.atMs && current.lat != null) continue;
    if (imei) store.byImei[imei] = fix;
    if (rowId) store.byId[rowId] = fix;
    changed = true;
  }
  if (changed) writeStore(id, store);
}

/** Paint cached fixes onto asset rows when they are newer than the catalog stamp. */
export function overlayLivePositions<T>(tenantId: string, rows: T[]): T[] {
  const id = String(tenantId ?? "").trim();
  if (!id || !Array.isArray(rows) || !rows.length) return rows;
  const store = readStore(id);
  if (!Object.keys(store.byImei).length && !Object.keys(store.byId).length) return rows;
  let changed = false;
  const next = rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const fix = lookupFix(store, row as { id?: unknown; assetId?: unknown; imei?: unknown });
    if (!fix) return row;
    const applied = applyFix(row as T & Record<string, unknown>, fix);
    if (applied !== row) changed = true;
    return applied;
  });
  return changed ? next : rows;
}

const indexRows = (rows: unknown[]) => {
  const byImei = new Map<string, Record<string, unknown>>();
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const imei = imeiKey(record.imei);
    const id = rowIdKey(record);
    if (imei) byImei.set(imei, record);
    if (id) byId.set(id, record);
  }
  return { byImei, byId };
};

/**
 * Catalog refreshes must not rewind a newer cached fix.
 * Incoming rows keep their identity fields; live fields come from whichever side is newer.
 */
export function mergeAssetsKeepingNewerLive<T>(incoming: T[], existing: unknown[]): T[] {
  if (!Array.isArray(incoming) || !incoming.length || !Array.isArray(existing) || !existing.length) {
    return incoming;
  }
  const index = indexRows(existing);
  return incoming.map((row) => {
    if (!row || typeof row !== "object") return row;
    const record = row as T & Record<string, unknown>;
    const imei = imeiKey(record.imei);
    const id = rowIdKey(record);
    const previous = (imei && index.byImei.get(imei)) || (id && index.byId.get(id)) || undefined;
    if (!previous) return row;
    const previousFix = fixFromRow(previous);
    if (!previousFix) return row;
    return applyFix(record, previousFix);
  });
}
