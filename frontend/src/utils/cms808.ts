import { callCmsv6, connectCmsv6Sso, formatTimestampForSite, getCmsv6Vehicles, type Cmsv6Vehicle, type SiteTimeZoneSettings } from "./api";
import { movementFromSpeedKph } from "./assetTelemetryFields";
import { isCms808Server, isTraccarOnlyServer } from "./regionServers";
import { readScopeNaming } from "./selectionScope";
import { readActiveSiteName } from "./tenantContext";

/** 808 GPS cameras belong under this site in the VIVI hierarchy. */
export const CMS808_HIERARCHY_NAME = "Karongo";
/** Parent database on the live tree (AFRICA / EAST AFRICA / Advanced Securities / Karongo). */
export const CMS808_PARENT_NAME = "Advanced Securities";
const CMS808_HIERARCHY_PATH = ["africa", "east africa", "advanced securities", "karongo"];

const hierarchyTokenMatches = (actual: string, expected: string) => {
  if (actual === expected) return true;
  const actualCompact = compact(actual);
  const expectedCompact = compact(expected);
  if (expectedCompact === "advancedsecurities") {
    return actualCompact === "advancedsecurities" || actualCompact === "advancedsecurity";
  }
  return actualCompact === expectedCompact;
};

const text = (value: unknown) => String(value ?? "").trim();
const token = (value: unknown) => text(value).toLowerCase();
const compact = (value: unknown) => token(value).replace(/[^a-z0-9]+/g, "");

const selectedHierarchyParts = () => {
  if (typeof window === "undefined") return [];
  return String(window.localStorage.getItem("vivi.selectedPath") ?? "")
    .split("/")
    .map((part) => token(part))
    .filter(Boolean);
};

const hasExactCms808Hierarchy = (parts: unknown[]) => {
  const values = parts.map((part) => token(part)).filter(Boolean);
  const candidates = [values, selectedHierarchyParts()];
  return candidates.some((candidate) =>
    CMS808_HIERARCHY_PATH.every((part, index) => hierarchyTokenMatches(candidate[index] ?? "", part))
  );
};

/** True when the active site / path is the CMS 808 Karongo hierarchy (host-independent). */
export function cms808KarongoScopeSelected(extra: unknown[] = []): boolean {
  const naming = readScopeNaming();
  const namingParts = [
    naming.dealer,
    naming.organisation,
    naming.database,
    naming.site,
    naming.label,
    readActiveSiteName()
  ];
  const activeParts = [readActiveSiteName(), ...extra, ...selectedHierarchyParts().slice(-1)];
  const karongoSiteSelected = activeParts.some((part) => compact(part) === "karongo");
  return karongoSiteSelected || hasExactCms808Hierarchy(extra) || hasExactCms808Hierarchy(namingParts);
}

export function cms808HierarchyActive(extra: unknown[] = []): boolean {
  if (!isCms808Server()) return false;
  return cms808KarongoScopeSelected(extra);
}

/** Trip Timeline / Historical: load CMS trips when Karongo is selected, even off za.* hosts. */
export function cms808TripSourceAvailable(extra: unknown[] = []): boolean {
  if (isTraccarOnlyServer() && !cms808KarongoScopeSelected(extra)) return false;
  return cms808KarongoScopeSelected(extra) || isCms808Server();
}

export function cms808VehicleMatchesHierarchy(vehicle: Cmsv6Vehicle | null | undefined): boolean {
  if (!vehicle) return false;
  return cms808HierarchyActive();
}

export function filterCms808VehiclesForActiveHierarchy(vehicles: Cmsv6Vehicle[], extra: unknown[] = []): Cmsv6Vehicle[] {
  const rows = Array.isArray(vehicles) ? vehicles : [];
  if (!cms808HierarchyActive(extra)) return [];
  return rows.filter((row) => Boolean(text(row.devIdno || row.deviceId || row.vehiIdno)));
}

export const CMS808_KNOWN_VEHICLE: Cmsv6Vehicle = {
  vehiIdno: "UBP-119H",
  vehicleId: "UBP-119H",
  company: CMS808_HIERARCHY_NAME,
  companyId: "A10564",
  devIdno: "020262202629",
  deviceId: "020262202629",
  channels: 3,
  channelNames: ["CH1", "CH2", "CH3"]
};

export const CMS808_KNOWN_GPS: Record<string, unknown> = {
  vid: "UBP-119H",
  did: "020262202629",
  mlat: 0.638689,
  mlng: 34.25605,
  ol: 1,
  gt: "2026-09-19 01:22:00",
  sp: 0
};

const cms808VehicleListCache = new Map<string, { until: number; value: Cmsv6Vehicle[] }>();

export async function loadCms808VehiclesForActiveHierarchy(extra: unknown[] = []): Promise<Cmsv6Vehicle[]> {
  // 808 is isolated to the ZA Karongo hierarchy. Other regions must remain empty.
  if (isTraccarOnlyServer() || !cms808HierarchyActive(extra)) return [];

  const cacheKey = [
    readActiveSiteName(),
    ...extra.map((part) => text(part)),
    ...selectedHierarchyParts()
  ].join("|");
  const cached = cms808VehicleListCache.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.value;

  const remember = (value: Cmsv6Vehicle[]) => {
    cms808VehicleListCache.set(cacheKey, { until: Date.now() + 45_000, value });
    return value;
  };

  try {
    const result = await getCmsv6Vehicles();
    const filtered = filterCms808VehiclesForActiveHierarchy(Array.isArray(result?.vehicles) ? result.vehicles : [], extra);
    if (filtered.length) {
      const hasKnown = filtered.some((row) => text(row.devIdno || row.deviceId) === text(CMS808_KNOWN_VEHICLE.devIdno));
      return remember(hasKnown ? filtered : [CMS808_KNOWN_VEHICLE, ...filtered]);
    }
  } catch {
    // Keep the configured Karongo seed camera available only in its exact hierarchy.
  }
  return remember(cms808HierarchyActive(extra) ? [CMS808_KNOWN_VEHICLE] : []);
}

export function cms808SiteName(): string {
  const site = text(readActiveSiteName());
  if (token(site) === token(CMS808_HIERARCHY_NAME)) return site;
  return CMS808_HIERARCHY_NAME;
}

/** CMS 808 platform clocks are East Africa Time (UTC+3). */
const CMS808_EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

export function cms808FormatDateTime(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const shifted = new Date(value.getTime() + CMS808_EAT_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
}

export function cms808RangeFromDates(from: Date, to: Date) {
  return { begintime: cms808FormatDateTime(from), endtime: cms808FormatDateTime(to) };
}

/** Reject 808 location codes / bare coordinates — those are not place names. */
export function cms808PlaceLabel(...values: unknown[]): string {
  for (const value of values) {
    const label = text(value);
    if (!label) continue;
    const lowered = label.toLowerCase();
    if (lowered === "none" || lowered === "null" || lowered === "n/a" || lowered === "undefined") continue;
    if (/^\d{3,}$/.test(label)) continue;
    if (/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(label)) continue;
    if (/^-?\d+(?:\.\d+)?\s+\s*-?\d+(?:\.\d+)?$/.test(label)) continue;
    return label;
  }
  return "";
}

export function cms808LastHoursRange(hours = 24) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  return cms808RangeFromDates(start, end);
}

const toCoord = (value: unknown): number | undefined => {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw === 0) return undefined;
  if (Math.abs(raw) > 180) {
    const scaled = raw / 1_000_000;
    if (Number.isFinite(scaled) && Math.abs(scaled) <= 180) return scaled;
  }
  return raw;
};

export function parseCms808LatLng(gps: Record<string, unknown> | null | undefined): { lat?: number; lng?: number } {
  if (!gps || typeof gps !== "object") return {};
  const lat = toCoord(
    gps.mlat ?? gps.lat ?? gps.ml ?? gps.latitude ?? gps.weiDu ?? gps.weidu ?? gps.WeiDu ?? gps.mapWeiDu ?? gps.weiduMap
  );
  const lng = toCoord(
    gps.mlng ?? gps.lng ?? gps.lon ?? gps.mt ?? gps.longitude ?? gps.jingDu ?? gps.jingdu ?? gps.JingDu ?? gps.mapJingDu ?? gps.jingduMap
  );
  if (typeof lat !== "number" || typeof lng !== "number") return {};
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return {};
  return { lat, lng };
}

function unwrapCms808Gps(row: Record<string, unknown>): Record<string, unknown> {
  if (parseCms808LatLng(row).lat != null) return row;
  for (const key of ["gps", "position", "pos", "status", "info"]) {
    const nested = row[key];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const coords = parseCms808LatLng(nested as Record<string, unknown>);
    if (coords.lat != null) return { ...row, ...(nested as Record<string, unknown>) };
  }
  return row;
}

export function parseCms808GpsRow(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    const rows = payload
      .filter((row) => row && typeof row === "object")
      .map((row) => unwrapCms808Gps(row as Record<string, unknown>));
    if (!rows.length) return null;
    const withCoords = rows.filter((row) => parseCms808LatLng(row).lat != null);
    const pool = withCoords.length ? withCoords : rows;
    return pool.reduce((best, row) => {
      const bestMs = parseCms808TimeMs(cms808GpsTime(best));
      const rowMs = parseCms808TimeMs(cms808GpsTime(row));
      if (!Number.isFinite(bestMs)) return row;
      if (Number.isFinite(rowMs) && rowMs > bestMs) return row;
      return best;
    });
  }
  if (typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    if (Array.isArray(row.infos) || Array.isArray(row.status) || Array.isArray(row.locations) || Array.isArray(row.tracks)) {
      return parseCms808GpsRow(row.infos ?? row.status ?? row.locations ?? row.tracks);
    }
    return unwrapCms808Gps(row);
  }
  return null;
}

export function readCms808SpeedKph(gps: Record<string, unknown> | null | undefined): number | undefined {
  if (!gps) return undefined;
  const spText = String(gps.sp ?? "").trim();
  if (spText) {
    const tenths = Number(spText);
    if (Number.isFinite(tenths)) return Math.max(0, tenths / 10);
  }
  for (const key of ["speed", "speedKph", "gpsSpeed"]) {
    const text = String(gps[key] ?? "").trim();
    if (!text) continue;
    const raw = Number(text);
    if (Number.isFinite(raw)) return Math.max(0, raw);
  }
  return undefined;
}

export function cms808SpeedKph(gps: Record<string, unknown> | null | undefined): string {
  const speed = readCms808SpeedKph(gps);
  return speed == null ? "" : String(speed);
}

export function cms808OnlineLabel(gps: Record<string, unknown> | null | undefined): "online" | "offline" {
  if (!gps) return "offline";
  const raw = gps.ol ?? gps.online ?? gps.status;
  if (raw === 1 || raw === true || raw === "1" || token(raw) === "online") return "online";
  return "offline";
}

export function cms808GpsTime(gps: Record<string, unknown> | null | undefined): string {
  return text(gps?.gt ?? gps?.tm ?? gps?.gpsTime ?? gps?.devicetime ?? gps?.time);
}

export function cms808DisplayTime(value: unknown, site?: unknown, settings?: SiteTimeZoneSettings | null): string {
  const raw = text(value).replace(/(\d{2}:\d{2}:\d{2})\.\d+/, "$1");
  if (!raw) return "";
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
    return /\s[A-Z]{2,5}$/.test(raw) ? raw : `${raw} EAT`;
  }
  const naive = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (naive) {
    return `${naive[3]}/${naive[2]}/${naive[1]} ${naive[4]}:${naive[5]}:${(naive[6] || "00").padStart(2, "0")} EAT`;
  }
  return formatTimestampForSite(raw, site || CMS808_HIERARCHY_NAME, settings) || raw;
}

export async function loadCms808Gps(devIdno: string): Promise<Record<string, unknown> | null> {
  const device = text(devIdno);
  if (!device) return null;
  const result = await callCmsv6<{ ok?: boolean; gps?: unknown }>(`/cmsv6/gps?devIdno=${encodeURIComponent(device)}`);
  return parseCms808GpsRow(result?.gps);
}

export async function loadCms808Location(vehiIdno: string, devIdno = ""): Promise<Record<string, unknown> | null> {
  const plate = text(vehiIdno);
  const device = text(devIdno);
  if (!plate && !device) return null;
  const query = new URLSearchParams();
  if (device) query.set("devIdno", device);
  if (plate) query.set("vehiIdno", plate);
  query.set("geoaddress", "1");
  const result = await callCmsv6<{ ok?: boolean; location?: unknown }>(`/cmsv6/location?${query.toString()}`);
  return parseCms808GpsRow(result?.location);
}

const CMS808_STALE_FIX_MS = 20 * 60 * 1000;

export function newestCms808TrackPoint(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const row of flattenCms808TrackRows(rows)) {
    const coords = parseCms808LatLng(row);
    const atMs = parseCms808TimeMs(row.gt ?? row.tm ?? row.gpsTime ?? row.time ?? row.eTime ?? row.bTime);
    if (coords.lat == null || !Number.isFinite(atMs) || atMs < bestMs) continue;
    best = row;
    bestMs = atMs;
  }
  return best;
}

/** Device status can stay on an old border fix after later trips. Prefer the newer point. */
export function pickNewerCms808Fix(
  status: Record<string, unknown> | null | undefined,
  trackPoint: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  const statusCoords = parseCms808LatLng(status || undefined);
  const trackCoords = parseCms808LatLng(trackPoint || undefined);
  const statusMs = parseCms808TimeMs(cms808GpsTime(status));
  const trackMs = parseCms808TimeMs(
    cms808GpsTime(trackPoint) || trackPoint?.gt || trackPoint?.eTime || trackPoint?.bTime
  );
  const statusOk = statusCoords.lat != null && Number.isFinite(statusMs);
  const trackOk = trackCoords.lat != null && Number.isFinite(trackMs);
  if (trackOk && (!statusOk || trackMs > statusMs)) {
    return {
      ...(status || {}),
      ...(trackPoint || {}),
      mlat: trackCoords.lat,
      mlng: trackCoords.lng,
      gt: cms808GpsTime(trackPoint) || trackPoint?.gt || trackPoint?.eTime
    };
  }
  if (status && statusCoords.lat != null) return status;
  if (trackPoint && trackCoords.lat != null) {
    return { ...trackPoint, mlat: trackCoords.lat, mlng: trackCoords.lng };
  }
  return status || trackPoint || null;
}

function cms808TrackPageCount(result: { pagination?: { totalPages?: number; totalRecords?: number; pageRecords?: number }; pageCount?: number } | null | undefined, pageSize: number) {
  const direct = Number(result?.pagination?.totalPages ?? result?.pageCount ?? 0);
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);
  const total = Number(result?.pagination?.totalRecords ?? 0);
  const size = Number(result?.pagination?.pageRecords ?? pageSize) || pageSize;
  if (total > 0 && size > 0) return Math.ceil(total / size);
  return 1;
}

async function loadCms808TrackPage(devIdno: string, from: Date, to: Date, page: number, pageSize: number, vehiIdno = "") {
  return callCmsv6<{ ok?: boolean; tracks?: unknown; pagination?: { totalPages?: number; totalRecords?: number; pageRecords?: number }; pageCount?: number }>("/cmsv6/track", {
    method: "POST",
    body: JSON.stringify({
      devIdno,
      ...(text(vehiIdno) ? { vehiIdno: text(vehiIdno) } : {}),
      ...cms808RangeFromDates(from, to),
      distance: 0,
      parkTime: 0,
      currentPage: page,
      pageRecords: pageSize
    })
  });
}

async function newestCms808PointInRange(devIdno: string, from: Date, to: Date, vehiIdno = "") {
  const pageSize = 200;
  const first = await loadCms808TrackPage(devIdno, from, to, 1, pageSize, vehiIdno);
  const totalPages = cms808TrackPageCount(first, pageSize);
  const last = totalPages > 1 ? await loadCms808TrackPage(devIdno, from, to, totalPages, pageSize, vehiIdno) : first;
  return newestCms808TrackPoint(flattenCms808TrackRows([first?.tracks, last?.tracks]));
}

/** The platform rejects multi-day track queries, so walk backward one day at a time. */
export async function loadCms808NewestTrackPoint(devIdno: string, from: Date, to: Date, vehiIdno = ""): Promise<Record<string, unknown> | null> {
  const device = text(devIdno);
  if (!device) return null;
  const end = new Date(to);
  const startLimit = new Date(from);
  let cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const firstDay = new Date(startLimit.getFullYear(), startLimit.getMonth(), startLimit.getDate());
  for (let guard = 0; cursor >= firstDay && guard < 3; guard += 1) {
    const days = [0, 1, 2]
      .map((offset) => {
        const day = new Date(cursor);
        day.setDate(day.getDate() - offset);
        return day;
      })
      .filter((day) => day >= firstDay);
    const found = (
      await Promise.all(
        days.map(async (day) => {
          const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
          const fromAt = dayStart < startLimit ? startLimit : dayStart;
          const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
          const toAt = dayEnd > end ? end : dayEnd;
          if (toAt <= fromAt) return null;
          return newestCms808PointInRange(device, fromAt, toAt, vehiIdno).catch(() => null);
        })
      )
    ).filter((row): row is Record<string, unknown> => Boolean(row));
    const newest = newestCms808TrackPoint(found);
    if (newest) return newest;
    cursor.setDate(cursor.getDate() - days.length);
  }
  return null;
}

const cms808PositionCache = new Map<string, { until: number; value: Record<string, unknown> | null }>();

export async function loadCms808Position(vehicle: { devIdno?: string; deviceId?: string; vehiIdno?: string }): Promise<Record<string, unknown> | null> {
  const device = text(vehicle.devIdno || vehicle.deviceId);
  const plate = text(vehicle.vehiIdno);
  const cacheKey = `${device}|${plate}`;
  const cached = cms808PositionCache.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.value;
  const remember = (value: Record<string, unknown> | null, ttlMs: number) => {
    cms808PositionCache.set(cacheKey, { until: Date.now() + ttlMs, value });
    return value;
  };
  const gps = device ? await loadCms808Gps(device).catch(() => null) : null;
  const location = parseCms808LatLng(gps).lat == null
    ? await loadCms808Location(plate, device).catch(() => null)
    : null;
  let current: Record<string, unknown> | null = null;
  if (parseCms808LatLng(gps).lat != null) current = gps;
  else if (parseCms808LatLng(location).lat != null) current = { ...(gps || {}), ...(location || {}) };
  else current = gps || location;

  const currentMs = parseCms808TimeMs(cms808GpsTime(current));
  const stale = parseCms808LatLng(current).lat == null
    || !Number.isFinite(currentMs)
    || Date.now() - currentMs > CMS808_STALE_FIX_MS;
  if (stale && device) {
    const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const latest = await loadCms808NewestTrackPoint(device, from, new Date(), plate).catch(() => null);
    const picked = pickNewerCms808Fix(current, latest);
    if (parseCms808LatLng(picked).lat != null) return remember(picked, 45_000);
    current = picked;
  }
  // Live status is polled every few seconds. Never substitute the September seed fix.
  if (parseCms808LatLng(current).lat != null) return remember(current, 4_000);
  return remember(current, 4_000);
}

export async function loadCms808Alarms(devIdno: string, from: Date, to: Date): Promise<Record<string, unknown>[]> {
  const device = text(devIdno);
  if (!device) return [];
  const result = await callCmsv6<{ ok?: boolean; alarms?: unknown }>("/cmsv6/alarms", {
    method: "POST",
    body: JSON.stringify({ devIdno: device, ...cms808RangeFromDates(from, to), currentPage: 1, pageRecords: 50 })
  });
  return Array.isArray(result?.alarms) ? result.alarms.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")) : [];
}

function cms808Rows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)));
  }
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  for (const key of ["infos", "files", "list", "rows", "photos", "media", "safety", "alarms"]) {
    if (row[key] == null) continue;
    const nested = cms808Rows(row[key]);
    if (nested.length) return nested;
  }
  return [];
}

async function loadCms808PagedRows(
  path: string,
  body: Record<string, unknown>,
  listKey: string,
  maxPages = 2
): Promise<Record<string, unknown>[]> {
  const pageSize = 50;
  const loadPage = (page: number) =>
    callCmsv6<Record<string, unknown>>(path, {
      method: "POST",
      body: JSON.stringify({ ...body, currentPage: page, pageRecords: pageSize })
    });
  const first = await loadPage(1);
  const rows = cms808Rows(first?.[listKey] ?? first);
  const pages = Math.min(
    cms808TrackPageCount(first as { pagination?: { totalPages?: number; totalRecords?: number; pageRecords?: number } }, pageSize),
    Math.max(1, maxPages)
  );
  if (pages <= 1) return rows;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) => loadPage(index + 2).catch(() => null))
  );
  return [...rows, ...rest.flatMap((page) => cms808Rows(page?.[listKey] ?? page))];
}

export async function loadCms808Photos(devIdno: string, from: Date, to: Date, vehiIdno = ""): Promise<Record<string, unknown>[]> {
  const device = text(devIdno);
  if (!device) return [];
  return loadCms808PagedRows("/cmsv6/photos", {
    devIdno: device,
    ...(text(vehiIdno) ? { vehiIdno: text(vehiIdno) } : {}),
    ...cms808RangeFromDates(from, to)
  }, "photos");
}

export async function loadCms808Videos(devIdno: string, from: Date, to: Date, vehiIdno = ""): Promise<Record<string, unknown>[]> {
  const device = text(devIdno);
  if (!device) return [];
  return loadCms808PagedRows("/cmsv6/media", {
    devIdno: device,
    ...(text(vehiIdno) ? { vehiIdno: text(vehiIdno) } : {}),
    type: 2,
    ...cms808RangeFromDates(from, to)
  }, "media");
}

export async function loadCms808Safety(vehiIdno: string, from: Date, to: Date, mediaType: 0 | 1): Promise<Record<string, unknown>[]> {
  const plate = text(vehiIdno);
  if (!plate) return [];
  return loadCms808PagedRows("/cmsv6/safety", {
    vehiIdno: plate,
    mediaType,
    ...cms808RangeFromDates(from, to)
  }, "safety");
}

export function parseCms808TimeMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1_000_000_000_000 ? value : value * 1000;
  const raw = text(value);
  if (!raw) return Number.NaN;
  if (/^\d{13}$/.test(raw)) return Number(raw);
  if (/^\d{10}$/.test(raw)) return Number(raw) * 1000;
  const compactTime = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compactTime) {
    return Date.parse(`${compactTime[1]}-${compactTime[2]}-${compactTime[3]}T${compactTime[4]}:${compactTime[5]}:${compactTime[6]}+03:00`);
  }
  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    return Date.parse(`${dmy[3]}-${dmy[2]}-${dmy[1]}T${dmy[4] || "00"}:${dmy[5] || "00"}:${dmy[6] || "00"}+03:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw) && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(raw)) {
    return Date.parse(raw.replace(" ", "T") + "+03:00");
  }
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  return Date.parse(normalized);
}

export function flattenCms808TrackRows(payload: unknown, into: Record<string, unknown>[] = [], seen = new WeakSet<object>()): Record<string, unknown>[] {
  if (payload == null) return into;
  if (typeof payload === "string") {
    for (const part of payload.split(/[;|]/).map((row) => row.trim()).filter(Boolean)) {
      const bits = part.split(",").map((bit) => bit.trim());
      if (bits.length < 2) continue;
      const lat = toCoord(bits[0]);
      const lng = toCoord(bits[1]);
      if (lat == null || lng == null) continue;
      into.push({ mlat: lat, mlng: lng, gt: bits[2] ?? bits[3] });
    }
    return into;
  }
  if (Array.isArray(payload)) {
    payload.forEach((row) => flattenCms808TrackRows(row, into, seen));
    return into;
  }
  if (typeof payload !== "object") return into;
  if (seen.has(payload)) return into;
  seen.add(payload);
  const row = payload as Record<string, unknown>;
  const nested = row.tracks ?? row.infos ?? row.track ?? row.gps ?? row.list ?? row.rows;
  if (nested && nested !== payload) flattenCms808TrackRows(nested, into, seen);
  const point = parseCms808LatLng(row);
  if (point.lat != null && point.lng != null) {
    into.push(row);
    return into;
  }
  const begin = parseCms808LatLng({
    mlat: row.bLat ?? row.blat ?? row.beginLat ?? row.startLat ?? row.sLat,
    mlng: row.bLng ?? row.blng ?? row.beginLng ?? row.startLng ?? row.sLng
  });
  const end = parseCms808LatLng({
    mlat: row.eLat ?? row.elat ?? row.endLat,
    mlng: row.eLng ?? row.elng ?? row.endLng
  });
  if (begin.lat != null && begin.lng != null) {
    into.push({ ...row, mlat: begin.lat, mlng: begin.lng, gt: row.bTime ?? row.begintime ?? row.startTime ?? row.gt });
  }
  if (end.lat != null && end.lng != null) {
    into.push({ ...row, mlat: end.lat, mlng: end.lng, gt: row.eTime ?? row.endtime ?? row.endTime ?? row.gt });
  }
  return into;
}

export async function loadCms808Track(devIdno: string, from: Date, to: Date, vehiIdno = ""): Promise<Record<string, unknown>[]> {
  const device = text(devIdno);
  if (!device) return [];
  const collected: Record<string, unknown>[] = [];
  const pageSize = 500;
  const plate = text(vehiIdno);
  const fetchPage = (page: number) =>
    callCmsv6<{ ok?: boolean; tracks?: unknown; pagination?: { totalPages?: number }; pageCount?: number }>("/cmsv6/track", {
      method: "POST",
      body: JSON.stringify({
        devIdno: device,
        ...(plate ? { vehiIdno: plate } : {}),
        ...cms808RangeFromDates(from, to),
        distance: 0,
        parkTime: 0,
        currentPage: page,
        pageRecords: pageSize
      })
    });
  const first = await fetchPage(1);
  const firstRows = flattenCms808TrackRows(first?.tracks ?? first);
  if (!firstRows.length) return collected;
  collected.push(...firstRows);
  const totalPages = cms808TrackPageCount(first, pageSize);
  if (firstRows.length < pageSize || totalPages <= 1) return collected;
  const pages = Array.from({ length: Math.min(totalPages, 20) - 1 }, (_, index) => index + 2);
  const results: Record<string, unknown>[][] = new Array(pages.length);
  let nextPage = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, pages.length) }, async () => {
      while (nextPage < pages.length) {
        const slot = nextPage;
        nextPage += 1;
        const result = await fetchPage(pages[slot]).catch(() => null);
        results[slot] = flattenCms808TrackRows(result?.tracks ?? result);
      }
    })
  );
  results.forEach((rows) => rows && collected.push(...rows));
  if (totalPages > 20) {
    const last = await loadCms808TrackPage(device, from, to, totalPages, pageSize, plate);
    collected.push(...flattenCms808TrackRows(last?.tracks ?? last));
  }
  return collected;
}

/** Walk one calendar day at a time — multi-day track queries are often rejected. */
export async function loadCms808TrackRange(devIdno: string, from: Date, to: Date, vehiIdno = ""): Promise<Record<string, unknown>[]> {
  const device = text(devIdno).replace(/^cms808:/i, "");
  if (!device) return [];
  const days: Array<{ fromAt: Date; toAt: Date }> = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const lastDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  for (let guard = 0; cursor <= lastDay && guard < 40; guard += 1) {
    const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0);
    const dayEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 23, 59, 59);
    const fromAt = dayStart < from ? from : dayStart;
    const toAt = dayEnd > to ? to : dayEnd;
    if (toAt > fromAt) days.push({ fromAt, toAt });
    cursor.setDate(cursor.getDate() + 1);
  }
  const batches: Record<string, unknown>[][] = new Array(days.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(4, days.length) }, async () => {
    while (next < days.length) {
      const index = next;
      next += 1;
      const day = days[index];
      batches[index] = await loadCms808Track(device, day.fromAt, day.toAt, vehiIdno).catch(() => []);
    }
  });
  await Promise.all(workers);
  return batches.flat();
}


function parsePlaybackSeconds(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const clock = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!clock) return null;
  return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] || 0);
}

export function cms808PlaybackFileWindow(row: Record<string, unknown>, fallback: Date): { from: Date; to: Date } | null {
  const startMs = parseCms808TimeMs(row.begintime ?? row.beginTime ?? row.bTime ?? row.fbtm ?? row.fileSTime ?? row.startTime);
  const endMs = parseCms808TimeMs(row.endtime ?? row.endTime ?? row.eTime ?? row.fetm ?? row.fileETime);
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    return { from: new Date(startMs), to: new Date(endMs) };
  }
  const year = Number(row.YEAR ?? row.year ?? fallback.getFullYear());
  const mon = Number(row.MON ?? row.mon ?? row.month ?? fallback.getMonth() + 1);
  const day = Number(row.DAY ?? row.day ?? fallback.getDate());
  if (!year || !mon || !day) return null;
  const beg = parsePlaybackSeconds(row.beg ?? row.begin ?? row.sbtm ?? row.recStart) ?? 0;
  const end = parsePlaybackSeconds(row.end ?? row.recEnd ?? row.setm) ?? 24 * 3600 - 1;
  if (end <= beg) return null;
  const from = new Date(year, mon - 1, day, 0, 0, 0);
  from.setSeconds(beg);
  const to = new Date(year, mon - 1, day, 0, 0, 0);
  to.setSeconds(end);
  return { from, to };
}

function flattenCms808Files(value: unknown, into: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    value.forEach((row) => {
      if (row && typeof row === "object") into.push(row as Record<string, unknown>);
    });
    return into;
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    flattenCms808Files(row.files ?? row.infos ?? row.list ?? row.rows, into);
  }
  return into;
}

function mergeCms808Windows(windows: { from: Date; to: Date }[]): { from: Date; to: Date }[] {
  const ordered = [...windows].sort((left, right) => left.from.getTime() - right.from.getTime());
  const out: { from: Date; to: Date }[] = [];
  for (const window of ordered) {
    const last = out[out.length - 1];
    if (last && window.from.getTime() <= last.to.getTime() + 5 * 60 * 1000) {
      if (window.to > last.to) last.to = window.to;
    } else {
      out.push({ from: new Date(window.from), to: new Date(window.to) });
    }
  }
  return out;
}

function cms808EatCalendarParts(day: Date) {
  const shifted = new Date(day.getTime() + CMS808_EAT_OFFSET_MS);
  return {
    YEAR: shifted.getUTCFullYear(),
    MON: shifted.getUTCMonth() + 1,
    DAY: shifted.getUTCDate()
  };
}

export async function loadCms808PlaybackFiles(devIdno: string, day: Date, channels: number[] = [0, 1]): Promise<Record<string, unknown>[]> {
  const device = text(devIdno);
  if (!device) return [];
  const dateParts = cms808EatCalendarParts(day);
  const channelList = (channels.length ? channels : [0]).slice(0, 3);
  const seen = new Set<string>();
  const batches = await Promise.all(channelList.map(async (channel) => {
    const payload = {
      DevIDNO: device,
      CHN: channel,
      ...dateParts,
      RECTYPE: -1,
      FILEATTR: 2,
      BEG: 0,
      END: 86399
    };
    const [deviceStore, serverStore] = await Promise.all([
      callCmsv6<{ files?: unknown }>("/cmsv6/video/search", {
        method: "POST",
        body: JSON.stringify({ ...payload, LOC: 1 })
      }).catch(() => null),
      callCmsv6<{ files?: unknown }>("/cmsv6/video/history", {
        method: "POST",
        body: JSON.stringify({ ...payload, LOC: 2 })
      }).catch(() => null)
    ]);
    return [...flattenCms808Files(deviceStore?.files), ...flattenCms808Files(serverStore?.files)].map((row) => ({
      ...row,
      chn: row.chn ?? row.CHN ?? channel
    } as Record<string, unknown>));
  }));
  const collected: Record<string, unknown>[] = [];
  for (const row of batches.flat()) {
    const key = text(row.guid ?? row.id ?? row.fph ?? row.FilePath ?? `${row.chn}:${row.begintime ?? row.bTime ?? row.fileSTime}:${row.endtime ?? row.eTime ?? row.fileETime}`);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    collected.push(row);
  }
  return collected;
}

export async function buildCms808PlaybackPlayerUrl(
  devIdno: string,
  vehiIdno = "",
  opts: { begintime?: string; endtime?: string; channel?: number } = {}
): Promise<string> {
  const device = text(devIdno).replace(/^cms808:/i, "");
  const plate = text(vehiIdno);
  if (!device && !plate) return "";
  const query = new URLSearchParams({ kind: "playback" });
  if (device) query.set("devIdno", device);
  if (plate) query.set("vehiIdno", plate);
  if (text(opts.begintime)) query.set("begintime", text(opts.begintime));
  if (text(opts.endtime)) query.set("endtime", text(opts.endtime));
  if (Number.isFinite(Number(opts.channel))) query.set("channel", String(Math.max(0, Math.floor(Number(opts.channel)))));
  const opened = await callCmsv6<{ url?: string; ok?: boolean }>(`/cmsv6/open-url?${query.toString()}`).catch(() => null);
  return text(opened?.url);
}

export async function loadCms808PlaybackTrail(devIdno: string, from: Date, to: Date, vehiIdno = "") {
  const device = text(devIdno);
  if (!device) return [];
  const days: Date[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= last && days.length < 8) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const direct = await loadCms808TrackRange(device, from, to, vehiIdno).catch(() => []);
  const directTrail = mapCms808TracksToTrailPoints(direct);
  if (directTrail.length >= 2) return directTrail;

  const files = (await Promise.all(days.map((day) => loadCms808PlaybackFiles(device, day)))).flat();
  const windows = mergeCms808Windows(
    files
      .map((row) => cms808PlaybackFileWindow(row, from))
      .filter((row): row is { from: Date; to: Date } => Boolean(row))
      .map((window) => ({
        from: window.from < from ? from : window.from,
        to: window.to > to ? to : window.to
      }))
      .filter((window) => window.to > window.from)
  );
  const ranges = windows.length ? windows.slice(0, 12) : [{ from, to }];
  const tracks: Record<string, unknown>[] = [];
  for (const range of ranges) {
    const rows = await loadCms808Track(device, range.from, range.to, vehiIdno).catch(() => []);
    tracks.push(...rows);
  }
  return mapCms808TracksToTrailPoints(tracks);
}

export async function resolveCms808DeviceId(asset: {
  imei?: unknown;
  cameraSerial?: unknown;
  assetId?: unknown;
  id?: unknown;
  registration?: unknown;
  assetDescription?: unknown;
}): Promise<string> {
  const numeric = [asset.imei, asset.cameraSerial, asset.assetId, asset.id]
    .map((value) => text(value).replace(/^cms808:/i, ""))
    .find((value) => /^\d{6,}$/.test(value));
  if (numeric) return numeric;
  const vehicles = await loadCms808VehiclesForActiveHierarchy();
  const match = vehicles.find((vehicle) => cms808MatchesAsset(vehicle, asset));
  return text(match?.devIdno || match?.deviceId);
}

export type Cms808TrailPoint = {
  lat: number;
  lng: number;
  atMs: number;
  speedKph?: number;
  rpm?: unknown;
  location?: string;
  /** Platform odometer in meters (`lc`). Missing or zero means it was not reported. */
  odometerM?: number;
  /** Ignition (ACC) from JT808 status bit 0. Undefined when the platform did not report it. */
  acc?: boolean;
};

function cms808Acc(row: Record<string, unknown>): boolean | undefined {
  const s1 = Number(row.s1);
  if (!Number.isFinite(s1)) return undefined;
  return (s1 & 1) === 1;
}

function cms808OdometerM(row: Record<string, unknown>): number | undefined {
  const raw = Number(row.lc ?? row.liCheng ?? row.licheng);
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  return raw;
}

export function mapCms808TracksToTrailPoints(tracks: Record<string, unknown>[]): Cms808TrailPoint[] {
  const points: Cms808TrailPoint[] = [];
  for (const row of flattenCms808TrackRows(tracks)) {
    const coords = parseCms808LatLng(row);
    const atMs = parseCms808TimeMs(row.gt ?? row.tm ?? row.gpsTime ?? row.time ?? row.devicetime ?? row.bTime);
    if (coords.lat == null || coords.lng == null || !Number.isFinite(atMs)) continue;
    points.push({
      lat: coords.lat,
      lng: coords.lng,
      atMs,
      speedKph: readCms808SpeedKph(row),
      rpm: row.rpm ?? row.RPM ?? row.engineRpm ?? row.engineRPM ?? row.tach ?? row.tachograph,
      location: cms808PlaceLabel(row.address, row.pos, row.location, row.placeName) || undefined,
      odometerM: cms808OdometerM(row),
      acc: cms808Acc(row)
    });
  }

  points.sort((left, right) => left.atMs - right.atMs);
  const deduped: Cms808TrailPoint[] = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (!prev) {
      deduped.push(point);
      continue;
    }
    const samePlace = Math.abs(prev.lat - point.lat) < 0.000001 && Math.abs(prev.lng - point.lng) < 0.000001;
    const accChanged = prev.acc != null && point.acc != null && prev.acc !== point.acc;
    if (!samePlace || accChanged) {
      deduped.push(point);
      continue;
    }
    const prevOdo = prev.odometerM;
    const nextOdo = point.odometerM;
    if (prevOdo != null && nextOdo != null && nextOdo - prevOdo >= 80) {
      deduped.push(point);
    }
  }
  return deduped;
}

function cms808HaversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const n = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(n)));
}

export type Cms808TimelineTrip = {
  start: string;
  end: string;
  distanceKm: number;
  maxSpeedKph: number;
  durationMs: number;
  segments: { start: string; end: string; type: "moving" | "idle" }[];
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startAddress: string;
  endAddress: string;
};

const CMS808_TRIP_GAP_MS = 20 * 60 * 1000;
const CMS808_TRIP_IDLE_BREAK_MS = 5 * 60 * 1000;
const CMS808_MIN_TRIP_KM = 0.2;

function cms808Step(prev: Cms808TrailPoint, point: Cms808TrailPoint) {
  const dtMs = point.atMs - prev.atMs;
  const dtHours = dtMs / 3_600_000;
  const gpsKm = cms808HaversineKm(prev.lat, prev.lng, point.lat, point.lng);
  const plausibleGps = Number.isFinite(gpsKm) && gpsKm >= 0 && gpsKm <= 80 && (dtHours <= 0 || gpsKm / Math.max(dtHours, 1 / 3600) <= 160);
  let odoKm = 0;
  if (prev.odometerM != null && point.odometerM != null) {
    const deltaM = point.odometerM - prev.odometerM;
    const deltaKm = deltaM / 1000;
    if (deltaM > 0 && deltaM <= 120_000 && (dtHours <= 0 || deltaKm / Math.max(dtHours, 1 / 3600) <= 160)) odoKm = deltaKm;
  }
  const moved = Number(point.speedKph ?? 0) > 2 || (plausibleGps && gpsKm >= 0.08) || odoKm >= 0.08;
  return {
    dtMs,
    moved,
    distanceKm: Math.max(plausibleGps ? gpsKm : 0, odoKm)
  };
}

/** Driving trips from a CMS 808 trail. Parked heartbeats are not trips and do not get a 0 km bar. */
export function buildCms808TimelineTrips(trail: Cms808TrailPoint[]): Cms808TimelineTrip[] {
  const points = [...trail]
    .filter((point) => Number.isFinite(point.atMs) && Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .sort((left, right) => left.atMs - right.atMs);
  const trips: Cms808TimelineTrip[] = [];
  type Draft = {
    startMs: number;
    endMs: number;
    distanceKm: number;
    maxSpeedKph: number;
    lastMovingMs: number;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    startAddress: string;
    endAddress: string;
    segments: { start: string; end: string; type: "moving" | "idle" }[];
  };
  let current: Draft | null = null;
  const mergeSegment = (draft: Draft, atMs: number, type: "moving" | "idle") => {
    const at = new Date(atMs).toISOString();
    const last = draft.segments[draft.segments.length - 1];
    if (!last || last.type !== type) draft.segments.push({ start: at, end: at, type });
    else last.end = at;
  };
  const flush = () => {
    if (current == null) return;
    const draft = current;
    current = null;
    if (draft.distanceKm < CMS808_MIN_TRIP_KM || draft.endMs <= draft.startMs) return;
    trips.push({
      start: new Date(draft.startMs).toISOString(),
      end: new Date(draft.endMs).toISOString(),
      distanceKm: draft.distanceKm,
      maxSpeedKph: draft.maxSpeedKph,
      durationMs: draft.endMs - draft.startMs,
      segments: draft.segments,
      startLat: draft.startLat,
      startLng: draft.startLng,
      endLat: draft.endLat,
      endLng: draft.endLng,
      startAddress: draft.startAddress,
      endAddress: draft.endAddress
    });
  };
  const begin = (from: Cms808TrailPoint) => {
    const at = new Date(from.atMs).toISOString();
    current = {
      startMs: from.atMs,
      endMs: from.atMs,
      distanceKm: 0,
      maxSpeedKph: Math.max(0, Number(from.speedKph ?? 0)),
      lastMovingMs: from.atMs,
      startLat: from.lat,
      startLng: from.lng,
      endLat: from.lat,
      endLng: from.lng,
      startAddress: from.location || "",
      endAddress: from.location || "",
      segments: [{ start: at, end: at, type: "moving" }]
    };
  };

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const point = points[index];
    const step = cms808Step(prev, point);
    if (step.dtMs <= 0) continue;
    const gap = step.dtMs > CMS808_TRIP_GAP_MS;
    if (gap) flush();
    if (!step.moved) {
      const idleDraft: Draft | null = current;
      if (idleDraft != null && !gap && point.atMs - idleDraft.lastMovingMs > CMS808_TRIP_IDLE_BREAK_MS) {
        flush();
      } else if (idleDraft != null && !gap) {
        idleDraft.endMs = point.atMs;
        idleDraft.endLat = point.lat;
        idleDraft.endLng = point.lng;
        if (point.location) idleDraft.endAddress = point.location;
        mergeSegment(idleDraft, point.atMs, "idle");
        current = idleDraft;
        if (point.acc === false) flush();
      }
      continue;
    }
    if (current == null) begin(prev);
    const movingDraft: Draft | null = current;
    if (movingDraft == null) continue;
    movingDraft.endMs = point.atMs;
    movingDraft.distanceKm += step.distanceKm;
    movingDraft.maxSpeedKph = Math.max(movingDraft.maxSpeedKph, Number(point.speedKph ?? 0));
    movingDraft.lastMovingMs = point.atMs;
    movingDraft.endLat = point.lat;
    movingDraft.endLng = point.lng;
    if (point.location) movingDraft.endAddress = point.location;
    mergeSegment(movingDraft, point.atMs, "moving");
    current = movingDraft;
    if (prev.acc === true && point.acc === false) flush();
  }
  flush();
  return trips;
}

export type Cms808EvidenceItem = {
  id: string;
  plate: string;
  deviceId: string;
  at: string;
  atMs: number;
  url: string;
  alarmType: string;
  site: string;
  driver: string;
  vehicleLabel: string;
  location: string;
  mediaKind: "image" | "video";
};

export function cms808PhotoUrl(row: Record<string, unknown>): string {
  const candidates = [
    row.DownUrl,
    row.downUrl,
    row.FileUrl,
    row.fileUrl,
    row.videoUrl,
    row.VideoUrl,
    row.mediaUrl,
    row.downloadUrl,
    row.PlaybackUrl,
    row.playbackUrl,
    row.hlsUrl,
    row.imgUrl,
    row.url,
    row.picUrl,
    row.ThumbUrl,
    row.thumbUrl,
    row.src,
    row.fph,
    row.FilePath,
    row.filePath,
    row.path
  ];
  for (const candidate of candidates) {
    const value = text(candidate);
    if (!value) continue;
    if (/^https?:\/\//i.test(value) || value.startsWith("//") || /video\.html|playbackvideo|\.m3u8|\.mp4|\.flv/i.test(value)) {
      return value.startsWith("//") ? `https:${value}` : value;
    }
  }
  return "";
}

export function cms808EvidenceKind(row: Record<string, unknown>, url: string): "image" | "video" {
  if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(url)) return "image";
  if (/\.(mp4|flv|m3u8|webm|mov)(\?|$)/i.test(url) || /playbackvideo|video\.html/i.test(url)) return "video";
  const mediaType = token(row.mediaType ?? row.fileType ?? row.filetype);
  const kind = token(row.type);
  if (mediaType === "1" || mediaType === "video" || kind === "2" || kind === "video") return "video";
  return "image";
}

export function mapCms808PhotoToEvidence(row: Record<string, unknown>, vehicle?: Cmsv6Vehicle): Cms808EvidenceItem | null {
  const url = cms808PhotoUrl(row);
  const deviceId = text(row.devIdno ?? row.DevIDNO ?? row.did ?? vehicle?.devIdno);
  const plate = text(row.vehiIdno ?? row.vid ?? vehicle?.vehiIdno ?? deviceId);
  const rawAt = text(row.fileTime ?? row.fileTimeStr ?? row.startTime ?? row.time ?? row.gpsTime ?? row.gt ?? row.bTime ?? row.fileSTime ?? row.updateTime);
  const at = /^\d{12,}$/.test(rawAt) ? cms808FormatDateTime(new Date(Number(rawAt))) : rawAt;
  if (!deviceId && !plate && !url) return null;
  const atMs = parseCms808TimeMs(at);
  const isPhoto = cms808EvidenceKind(row, url) === "image";
  const channel = text(row.chn ?? row.CHN ?? row.channel ?? row.Chn);
  const namedAlarm = [row.armType, row.alarmType, row.desc].map(text).find((value) => value && value !== "0") ?? "";
  const rawType = text(row.type);
  const alarmType = namedAlarm || (rawType && !/^\d+$/.test(rawType) ? rawType : "") || (isPhoto ? (channel ? `Photo CH${channel}` : "Photo") : channel ? `Recorded video CH${channel}` : "Evidence");
  const driver = text(row.driverName ?? row.driver ?? row.DriverName ?? row.driverId);
  const location = cms808PlaceLabel(row.address, row.placeName, row.location, row.pos, row.lc);
  const site = text(row.site ?? row.company) || cms808SiteName();
  const vehicleLabel = plate
    ? text(vehicle?.vehiIdno) && text(vehicle?.vehiIdno) !== plate
      ? `${plate} - ${text(vehicle?.vehiIdno)}`
      : plate
    : deviceId;
  return {
    id: text(row.guid ?? row.id ?? `${deviceId}:${at}:${url || alarmType}`),
    plate,
    deviceId,
    at,
    atMs: Number.isFinite(atMs) ? atMs : 0,
    url,
    alarmType,
    site,
    driver: driver || "Unknown",
    vehicleLabel: vehicleLabel || deviceId || "Unknown asset",
    location,
    mediaKind: cms808EvidenceKind(row, url)
  };
}

function cms808EvidenceDays(from: Date, to: Date, max = 16) {
  const days: Date[] = [];
  const cursor = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const first = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (cursor >= first && days.length < max) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return days;
}

/** Photos, 1078 clips, safety evidence, and device recordings for the gallery range. */
export async function loadCms808Evidence(
  vehicle: Cmsv6Vehicle,
  from: Date,
  to: Date
): Promise<Cms808EvidenceItem[]> {
  const device = text(vehicle.devIdno || vehicle.deviceId);
  const plate = text(vehicle.vehiIdno);
  if (!device && !plate) return [];

  // Keep gallery queries snappy — long month ranges used to fan out into 50–100 CMS calls.
  const rangeEnd = to.getTime() >= from.getTime() ? to : from;
  const rangeStartMs = Math.max(from.getTime(), rangeEnd.getTime() - 60 * 24 * 60 * 60 * 1000);
  const rangeStart = new Date(rangeStartMs);

  const limit = <T,>(work: Promise<T[]>): Promise<T[]> =>
    Promise.race([work, new Promise<T[]>((resolve) => window.setTimeout(() => resolve([]), 12_000))]);
  const items: Cms808EvidenceItem[] = [];
  const seen = new Set<string>();
  const push = (row: Record<string, unknown>) => {
    const item = mapCms808PhotoToEvidence(row, vehicle);
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };


  const [photos, recordedClips, safetyImages, safetyVideos, alarms] = await Promise.all(([
    device ? loadCms808PagedRows("/cmsv6/photos", {
      devIdno: device,
      ...(plate ? { vehiIdno: plate } : {}),
      ...cms808RangeFromDates(rangeStart, rangeEnd)
    }, "photos", 1).catch(() => []) : Promise.resolve([] as Record<string, unknown>[]),
    device ? loadCms808PagedRows("/cmsv6/media", {
      devIdno: device,
      ...(plate ? { vehiIdno: plate } : {}),
      type: 1,
      ...cms808RangeFromDates(rangeStart, rangeEnd)
    }, "media", 1).catch(() => []) : Promise.resolve([] as Record<string, unknown>[]),
    loadCms808PagedRows("/cmsv6/safety", {
      vehiIdno: plate || device,
      mediaType: 0,
      ...cms808RangeFromDates(rangeStart, rangeEnd)
    }, "safety", 1).catch(() => []),
    loadCms808PagedRows("/cmsv6/safety", {
      vehiIdno: plate || device,
      mediaType: 1,
      ...cms808RangeFromDates(rangeStart, rangeEnd)
    }, "safety", 1).catch(() => []),
    device
      ? callCmsv6<{ alarms?: unknown }>("/cmsv6/alarms", {
          method: "POST",
          body: JSON.stringify({
            devIdno: device,
            vehiIdno: plate,
            ...cms808RangeFromDates(rangeStart, rangeEnd),
            handle: 0,
            currentPage: 1,
            pageRecords: 50
          })
        })
          .then((result) => cms808Rows(result?.alarms ?? result))
          .catch(() => [])
      : Promise.resolve([] as Record<string, unknown>[])
  ] as Promise<Record<string, unknown>[]>[]).map((work) => limit(work)));

  photos.forEach((row) => push(row));
  recordedClips.forEach((row) => push({ ...row, mediaType: 1 }));
  safetyImages.forEach((row) => push({ ...row, mediaType: row.mediaType ?? 0 }));
  safetyVideos.forEach((row) => push({ ...row, mediaType: row.mediaType ?? 1 }));
  alarms.forEach((row) => {
    const hasMedia = Boolean(cms808PhotoUrl(row));
    push({
      ...row,
      mediaType: hasMedia && /video|mp4|flv|m3u8/i.test(cms808PhotoUrl(row)) ? 1 : row.mediaType ?? 0,
      alarmType: row.armType ?? row.alarmType ?? row.desc ?? row.type ?? "808 alarm"
    });
  });

  return items.sort((left, right) => (right.atMs || 0) - (left.atMs || 0));
}

export function cms808IdentityKeys(row: object): string[] {
  const record = row as Record<string, unknown>;
  return [record.imei, record.cameraSerial, record.registration, record.assetDescription, record.fleetNumber, record.devIdno, record.deviceId, record.vehiIdno, record.assetId, text(record.id).replace(/^cms808:/i, "")]
    .map(token)
    .filter((value) => value.length >= 3);
}

/** Copy a newer 808 fix onto the stored fleet row so last position is not left on the old asset snapshot. */
export function overlayCms808LiveFields<T extends object>(stored: T, live: object): T {
  const liveRow = live as Record<string, unknown>;
  const storedRow = stored as Record<string, unknown>;
  const liveMs = parseCms808TimeMs(liveRow.lastSeen ?? liveRow.telemetryAtMs ?? liveRow.lastPosition ?? liveRow.gt);
  const storedMs = parseCms808TimeMs(storedRow.lastSeen ?? storedRow.telemetryAtMs ?? storedRow.lastPosition);
  const liveLat = Number(liveRow.lat);
  const liveLng = Number(liveRow.lng);
  const hasLiveCoords = Number.isFinite(liveLat) && Number.isFinite(liveLng) && !(liveLat === 0 && liveLng === 0);
  const newer = Number.isFinite(liveMs) && (!Number.isFinite(storedMs) || liveMs > storedMs + 1000);
  if (!newer || !hasLiveCoords) return stored;
  const wall = text(liveRow.lastSeen);
  const naive = wall.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const lastSeen = naive && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(wall)
    ? `${naive[1]}-${naive[2]}-${naive[3]}T${naive[4]}:${naive[5]}:${naive[6] || "00"}+03:00`
    : wall || new Date(liveMs).toISOString();
  const lastPosition = text(liveRow.lastPosition) || lastSeen;
  return {
    ...stored,
    lastSeen,
    lastPosition,
    lastTrip: lastSeen || text(storedRow.lastTrip),
    lastActive: text(liveRow.lastActive) || lastPosition,
    lat: liveLat,
    lng: liveLng,
    gps: text(liveRow.gps) || `${liveLat.toFixed(6)}, ${liveLng.toFixed(6)}`,
    speed: liveRow.speed ?? storedRow.speed,
    movement: liveRow.movement ?? storedRow.movement,
    telemetryAtMs: liveMs,
    ...(text(liveRow.location || liveRow.lastLocation)
      ? { location: text(liveRow.location || liveRow.lastLocation), lastLocation: text(liveRow.lastLocation || liveRow.location) }
      : {})
  } as T;
}

export function findCms808LiveMatch<T extends object>(stored: object, liveRows: T[]): T | undefined {
  const keys = new Set(cms808IdentityKeys(stored));
  return liveRows.find((live) => cms808IdentityKeys(live).some((key) => keys.has(key)));
}

export function cms808VehicleToAssetRecord(vehicle: Cmsv6Vehicle, gps?: Record<string, unknown> | null): Record<string, unknown> {
  const device = text(vehicle.devIdno || vehicle.deviceId);
  const plate = text(vehicle.vehiIdno) || device;
  const coords = parseCms808LatLng(gps || undefined);
  const lastSeen = cms808GpsTime(gps || undefined);
  const site = cms808SiteName();
  const lastPosition = cms808DisplayTime(lastSeen) || lastSeen;
  return {
    id: `cms808:${device}`,
    assetId: device,
    assetDescription: plate,
    registration: plate,
    fleetNumber: plate,
    imei: device,
    cameraSerial: device,
    camera: "VIVI Camera",
    cameraModel: vehicle.channels ? `MDVR-${vehicle.channels}CH` : "MDVR",
    cameraStatus: cms808OnlineLabel(gps),
    hasCamera: true,
    standaloneMode: "yes",
    site,
    organisation: CMS808_PARENT_NAME,
    database: CMS808_PARENT_NAME,
    company: vehicle.company,
    lastPosition,
    lastSeen: lastSeen || undefined,
    lastTrip: lastSeen || undefined,
    lastLocation: cms808PlaceLabel(gps?.address, gps?.pos, gps?.placeName, gps?.location, gps?.lc),
    lat: coords.lat,
    lng: coords.lng,
    speed: Number(cms808SpeedKph(gps)) || 0,
    heading: text(gps?.hx ?? gps?.head ?? gps?.direction),
    gps: coords.lat && coords.lng ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : "",
    status: cms808OnlineLabel(gps),
    channelCount: vehicle.channels,
    cameraChannelsSelected: Array.isArray(vehicle.channelNames) ? vehicle.channelNames : [],
    cameraPositioningProtocol: "JT/T808",
    cameraVideoProtocol: "JT/T1078"
  };
}

export function isCms808LiveAsset(asset: {
  id?: unknown;
  device?: unknown;
  camera?: unknown;
  mobileDeviceType?: unknown;
  registration?: unknown;
  imei?: unknown;
}) {
  return text(asset.id).toLowerCase().startsWith("cms808:")
    || token(asset.device) === "cms 808"
    || token(asset.device) === "vivi camera"
    || token(asset.mobileDeviceType) === "cms 808"
    || token(asset.mobileDeviceType) === "vivi camera"
    || token(asset.camera) === "cms 808"
    || token(asset.camera) === "vivi camera";
}

export function cms808VehicleToLiveRow(vehicle: Cmsv6Vehicle, gps?: Record<string, unknown> | null) {
  const rec = cms808VehicleToAssetRecord(vehicle, gps);
  const lastSeen = text(rec.lastSeen);
  const lastSeenMs = lastSeen ? Date.parse(lastSeen.includes("T") ? lastSeen : lastSeen.replace(" ", "T")) : Number.NaN;
  const lastSeenIso = Number.isFinite(lastSeenMs)
    ? new Date(lastSeenMs).toISOString()
    : lastSeen || (typeof rec.lat === "number" ? new Date().toISOString() : "");
  const lastPosition = cms808DisplayTime(lastSeen) || cms808DisplayTime(lastSeenIso);
  const site = text(rec.site) || CMS808_HIERARCHY_NAME;
  return {
    id: text(rec.id),
    assetDescription: text(rec.assetDescription),
    registration: text(rec.registration),
    fleetNumber: text(rec.fleetNumber),
    database: text(rec.database) || CMS808_PARENT_NAME,
    imei: text(rec.imei),
    site,
    driver: "",
    lastActive: lastPosition,
    lastPosition,
    location: text(rec.lastLocation),
    assetId: text(rec.assetId),
    gps: text(rec.gps),
    heading: text(rec.heading),
    ignition: "",
    lastNotificationValue: "",
    mobileDeviceType: "VIVI Camera",
    device: "VIVI Camera",
    speed: String(rec.speed || "0"),
    movement: movementFromSpeedKph(rec.speed) || "stationary",
    timeInIgnition: "",
    fuelReading: "",
    satellites: text(gps?.ps),
    availabilityStatus: text(rec.status),
    status: rec.status === "offline" ? "offline" : movementFromSpeedKph(rec.speed) === "moving" ? "online" : "warning",
    lat: typeof rec.lat === "number" ? rec.lat : undefined,
    lng: typeof rec.lng === "number" ? rec.lng : undefined,
    telemetryAtMs: lastSeenIso ? Date.parse(lastSeenIso) : Date.now()
  };
}

export function mapCms808AlarmTypeToVt(value: unknown): string {
  const raw = text(value);
  if (!raw) return "808 alarm";
  if (raw.startsWith("Ai:") || raw.startsWith("DVR ")) return raw;
  const key = token(raw);
  if (/video.?loss|signal.?lost|\b11\b/.test(key)) return "Ai: Video loss";
  if (/fatigue|yawn|eye.?clos|tired/.test(key)) return "Ai: Driver fatigue - eye closing";
  if (/phone/.test(key)) return "Ai: Mobile phone distraction";
  if (/distract/.test(key)) return "Ai: Driver distraction";
  if (/seat.?belt/.test(key)) return "Ai: Driver not wearing seatbelt";
  if (/smok/.test(key)) return "Ai: Driver smoking";
  if (/collision|forward.?crash/.test(key)) return "Ai: Forward collision warning";
  if (/lane/.test(key)) return "Ai: Lane departure warning";
  if (/speed/.test(key)) return "Ai: Speed sign overspeeding";
  if (/motion/.test(key)) return "Ai: Motion detection";
  if (/storage|dvr|disk|sd.?card/.test(key)) return "DVR Error detected";
  if (/gps/.test(key)) return "Ai: GPS loss";
  return raw.startsWith("808") ? raw : `808 ${raw}`;
}

export function mapCms808AlarmToDashboard(row: Record<string, unknown>, vehicle?: Cmsv6Vehicle): Record<string, unknown> {
  const device = text(row.devIdno ?? row.DevIDNO ?? vehicle?.devIdno);
  const plate = text(row.vehiIdno ?? row.vid ?? vehicle?.vehiIdno ?? device);
  const alarmType = mapCms808AlarmTypeToVt(row.armType ?? row.alarmType ?? row.type ?? row.desc);
  return {
    id: text(row.guid ?? row.id ?? `${device}:${row.bTime ?? row.time}`),
    alarmType,
    type: alarmType,
    title: text(row.desc ?? row.info ?? alarmType),
    message: text(row.info ?? row.desc ?? alarmType),
    createdAt: text(row.bTime ?? row.time ?? row.gpsTime ?? row.gt),
    registration: plate,
    assetDescription: plate,
    deviceId: device,
    cameraSerial: device,
    imei: device,
    site: cms808SiteName()
  };
}

export function isCms808StreamId(value: unknown): boolean {
  return token(value).startsWith("cms808:");
}

export function isCms808PlayerUrl(value: unknown): boolean {
  const url = token(value);
  return /video\.html|playbackvideo\.html|hls\/index\.html|808gps\/open\/player|realplayvideo\.html/.test(url);
}

export function isCms808AuthenticatedStreamUrl(value: unknown): boolean {
  const url = text(value);
  if (!url) return false;
  return /[?&]jsession=/i.test(url);
}

export async function loadCms808LiveStream(devIdno: string, channel = 1): Promise<{ streamUrl: string; playerKind: "iframe" | "video" } | null> {
  const device = text(devIdno).replace(/^cms808:/i, "");
  if (!device) return null;
  const ch = Math.max(0, Math.floor(Number(channel) || 1) - 1);

  await connectCmsv6Sso().catch(() => null);

  const pickLiveUrl = (payload: Record<string, unknown> | null | undefined) => {
    const urls = (payload?.urls as Record<string, unknown> | undefined) || {};
    const candidates = [
      // The vendor player is served over HTTPS; raw HLS/FLV is plain http and is blocked as mixed content.
      urls.player,
      urls.hlsMedia,
      urls.hls,
      urls.flvMedia,
      urls.flv,
      payload?.streamUrl,
      payload?.url,
      urls.hlsPage
    ].map((value) => text(value));
    const authenticated = candidates.find((url) => url && isCms808AuthenticatedStreamUrl(url));
    if (authenticated) return authenticated;
    // Never open an unauthenticated vendor player page — that surfaces host alerts.
    return "";
  };

  const live = await callCmsv6<{ ok?: boolean; streamUrl?: string; url?: string; urls?: Record<string, string>; message?: string; error?: string }>(
    `/cmsv6/live?devIdno=${encodeURIComponent(device)}&channel=${ch}`
  ).catch(() => null);
  let streamUrl = pickLiveUrl(live as Record<string, unknown> | null);

  if (!streamUrl) {
    const opened = await callCmsv6<{ ok?: boolean; url?: string; streamUrl?: string; urls?: Record<string, string> }>(
      `/cmsv6/open-url?kind=live&devIdno=${encodeURIComponent(device)}&channel=${ch}`
    ).catch(() => null);
    streamUrl = pickLiveUrl(opened as Record<string, unknown> | null);
  }

  if (!streamUrl) return null;
  const playerKind =
    isCms808PlayerUrl(streamUrl) && !/\.(m3u8|flv|mp4)(\?|$)/i.test(streamUrl)
      ? "iframe"
      : "video";
  return { streamUrl, playerKind };
}

export async function loadCms808DashboardRecords(from: Date, to: Date) {
  const vehicles = await loadCms808VehiclesForActiveHierarchy();
  const settled = await Promise.all(
    vehicles.slice(0, 20).map(async (vehicle) => {
      const gps = await loadCms808Position(vehicle).catch(() => null);
      const record = cms808VehicleToAssetRecord(vehicle, gps);
      const device = text(vehicle.devIdno || vehicle.deviceId);
      const plate = text(vehicle.vehiIdno) || device;
      const [rows, mileage] = await Promise.all([
        device ? loadCms808Alarms(device, from, to).catch(() => []) : Promise.resolve([]),
        plate ? loadCms808MileageDetail(plate, from, to, device).catch(() => []) : Promise.resolve([])
      ]);
      // Trips become activity points so the online trend and work-time charts have real data.
      const history: Array<{ assetId: string; imei: string; createdAt: string; data: Record<string, unknown> }> = [];
      for (const trip of mapCms808MileageRowsToTimelineTrips(mileage)) {
        const startMs = Date.parse(trip.start);
        const endMs = Date.parse(trip.end);
        const step = 20 * 60 * 1000;
        for (let at = startMs; at < endMs; at += step) {
          history.push({ assetId: device, imei: device, createdAt: new Date(at).toISOString(), data: { speed: 1, movement: "moving" } });
        }
        history.push({ assetId: device, imei: device, createdAt: trip.end, data: { speed: 1, movement: "moving" } });
      }
      return {
        record,
        alarms: rows.map((row) => mapCms808AlarmToDashboard(row, vehicle)),
        history
      };
    })
  );
  return {
    vehicles,
    devices: settled.map((row) => row.record),
    alarms: settled.flatMap((row) => row.alarms),
    history: settled.flatMap((row) => row.history)
  };
}

export function cms808MatchesAsset(
  vehicle: Cmsv6Vehicle,
  asset: { imei?: unknown; cameraSerial?: unknown; registration?: unknown; assetDescription?: unknown; id?: unknown }
): boolean {
  const device = token(vehicle.devIdno || vehicle.deviceId);
  const plate = token(vehicle.vehiIdno);
  const ids = [asset.imei, asset.cameraSerial, asset.registration, asset.assetDescription, asset.id].map((value) => token(value)).filter(Boolean);
  if (device && ids.some((id) => id === device || id.endsWith(device) || id.includes(device))) return true;
  if (plate && ids.some((id) => id === plate)) return true;
  return false;
}

export type Cms808MileageRow = {
  plate: string;
  deviceId: string;
  mileageKm: number;
  platformMilesKm: number;
  startTime: string;
  endTime: string;
  startMileageKm: number;
  startPosition: string;
  endPosition: string;
  company: string;
};

const cms808Number = (value: unknown): number => {
  const raw = Number(value);
  return Number.isFinite(raw) ? raw : 0;
};

export function mapCms808MileageRow(row: Record<string, unknown>, fallbackPlate = ""): Cms808MileageRow {
  const plate = text(row.vehiIdno ?? row.vehIdno ?? row.PlateNum ?? row.plate ?? row.vid ?? fallbackPlate);
  const startTime = text(
    row.begintime ?? row.beginTime ?? row.bTimeStr ?? row.sTimeStr ?? row.bTime ?? row.startTime ?? row.StartTime ?? row.gt
  );
  const endTime = text(
    row.endtime ?? row.endTime ?? row.eTimeStr ?? row.eTime ?? row.EndTime ?? startTime
  );
  // Platform mileage fields (liCheng, mile, trackGPSLiCheng) are metres; the rest are already km.
  const metresToKm = (value: unknown) => cms808Number(value) / 1000;
  const hasMetres = [row.liCheng, row.licheng, row.mile].some((value) => value != null && value !== "");
  const totalDistance = hasMetres
    ? metresToKm(row.liCheng ?? row.licheng ?? row.mile)
    : cms808Number(row.TotalDistance ?? row.totalDistance ?? row.mileage ?? row.Miles ?? row.miles ?? row.distance);
  return {
    plate,
    deviceId: text(row.devIdno ?? row.DevIDNO ?? row.did),
    mileageKm: totalDistance,
    platformMilesKm: row.trackGPSLiCheng != null
      ? metresToKm(row.trackGPSLiCheng)
      : cms808Number(row.platformMiles ?? row.platformMileage ?? totalDistance),
    startTime,
    endTime,
    startMileageKm: row.startLiCheng != null
      ? metresToKm(row.startLiCheng)
      : cms808Number(row.startMileage ?? row.sMileage ?? row.StartMileage),
    startPosition: cms808PlaceLabel(
      row.startPosition ?? row.StartPosition ?? row.sPosition ?? row.bPosition ?? row.address ?? row.pos,
      row.lc
    ),
    endPosition: cms808PlaceLabel(
      row.endPosition ?? row.EndPosition ?? row.ePosition ?? row.address ?? row.pos,
      row.lc
    ),
    company: text(row.company ?? row.companyName ?? row.CompanyName)
  };
}

/** Mileage Summary / Daily-Monthly style totals from StandardApiAction_runMileage. */
export async function loadCms808Mileage(vehiIdno: string, from: Date, to: Date, devIdno = ""): Promise<Cms808MileageRow[]> {
  const plate = text(vehiIdno);
  const device = text(devIdno);
  if (!plate && !device) return [];
  const beginDay = cms808FormatDateTime(from).slice(0, 10);
  const endDay = cms808FormatDateTime(to).slice(0, 10);
  const result = await callCmsv6<{ ok?: boolean; mileage?: unknown }>("/cmsv6/mileage", {
    method: "POST",
    body: JSON.stringify({
      vehiIdno: plate || device,
      ...(device ? { devIdno: device } : {}),
      begintime: beginDay,
      endtime: endDay,
      currentPage: 1,
      pageRecords: 200
    })
  });
  return cms808Rows(result?.mileage ?? result).map((row) => mapCms808MileageRow(row, plate));
}

/** Mileage / Trip Detailed style rows from StandardApiAction_getOilTrackDetail. */
export async function loadCms808MileageDetail(vehiIdno: string, from: Date, to: Date, devIdno = ""): Promise<Cms808MileageRow[]> {
  const plate = text(vehiIdno);
  const device = text(devIdno);
  if (!plate && !device) return [];
  const collected: Cms808MileageRow[] = [];
  const pageSize = 100;
  for (let page = 1; page <= 20; page += 1) {
    const result = await callCmsv6<{
      ok?: boolean;
      detail?: unknown;
      pagination?: { totalPages?: number; pageCount?: number };
      pageCount?: number;
    }>("/cmsv6/mileage-detail", {
      method: "POST",
      body: JSON.stringify({
        vehiIdno: plate || device,
        ...(device ? { devIdno: device } : {}),
        ...cms808RangeFromDates(from, to),
        currentPage: page,
        pageRecords: pageSize
      })
    });
    const rows = cms808Rows(result?.detail ?? result).map((row) => mapCms808MileageRow(row, plate));
    if (!rows.length) break;
    collected.push(...rows);
    const totalPages = Math.max(
      1,
      Number(result?.pagination?.totalPages ?? result?.pagination?.pageCount ?? result?.pageCount ?? 1) || 1
    );
    if (rows.length < pageSize || page >= totalPages) break;
  }
  return collected;
}

export function mapCms808MileageRowsToTimelineTrips(rows: Cms808MileageRow[]): Cms808TimelineTrip[] {
  const trips: Cms808TimelineTrip[] = [];
  for (const row of rows) {
    const startMs = parseCms808TimeMs(row.startTime);
    const endMs = parseCms808TimeMs(row.endTime) || startMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) continue;
    const distanceKm = Math.max(row.mileageKm, row.platformMilesKm, 0);
    // Platform rows for a parked vehicle span days with ~0 km; they are not trips.
    if (distanceKm < CMS808_MIN_TRIP_KM) continue;
    const start = new Date(startMs).toISOString();
    const end = new Date(endMs).toISOString();
    trips.push({
      start,
      end,
      distanceKm,
      maxSpeedKph: 0,
      durationMs: Math.max(0, endMs - startMs),
      segments: [{ start, end, type: "moving" as const }],
      startLat: 0,
      startLng: 0,
      endLat: 0,
      endLng: 0,
      startAddress: row.startPosition || "",
      endAddress: row.endPosition || row.startPosition || ""
    });
  }
  return trips.sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

const mapTimelineTripsToMovementRows = (
  trips: Cms808TimelineTrip[],
  deviceName: string
): Array<{
  startTime: string;
  endTime: string;
  distance: number;
  maxSpeed: number;
  averageSpeed: number;
  duration: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  startAddress: string;
  endAddress: string;
  deviceName: string;
}> =>
  trips.map((trip) => ({
    startTime: trip.start,
    endTime: trip.end,
    distance: trip.distanceKm * 1000,
    maxSpeed: trip.maxSpeedKph / 1.852,
    averageSpeed: trip.durationMs > 0 ? (trip.distanceKm / (trip.durationMs / 3_600_000)) / 1.852 : 0,
    duration: trip.durationMs,
    startLat: trip.startLat,
    startLon: trip.startLng,
    endLat: trip.endLat,
    endLon: trip.endLng,
    startAddress: trip.startAddress,
    endAddress: trip.endAddress,
    deviceName
  }));

/** Map CMS 808 track points / Trip Detailed report rows into Traccar-shaped trips. */
export async function loadCms808MovementTrips(
  devIdno: string,
  from: Date,
  to: Date,
  vehiIdno = ""
): Promise<Array<{
  startTime: string;
  endTime: string;
  distance: number;
  maxSpeed: number;
  averageSpeed: number;
  duration: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  startAddress: string;
  endAddress: string;
  deviceName: string;
}>> {
  const plate = text(vehiIdno) || text(devIdno);
  const tracks = await loadCms808TrackRange(devIdno, from, to, vehiIdno).catch(() => []);
  const trail = mapCms808TracksToTrailPoints(tracks);
  let trips = trail.length >= 2 ? buildCms808TimelineTrips(trail) : [];
  // Parked heartbeats can leave a trail with zero driving trips — use the Trip Detailed report.
  if (trips.length === 0) {
    const mileage = await loadCms808MileageDetail(plate || devIdno, from, to, devIdno).catch(() => []);
    trips = mapCms808MileageRowsToTimelineTrips(mileage);
  }
  return mapTimelineTripsToMovementRows(trips, plate || devIdno);
}

/** Timeline trips for Karongo / CMS 808 assets (tracks first, Trip Detailed report fallback). */
export async function loadCms808TimelineTripsForDevice(
  devIdno: string,
  from: Date,
  to: Date,
  vehiIdno = ""
): Promise<{ trips: Cms808TimelineTrip[]; trail: Cms808TrailPoint[] }> {
  const plate = text(vehiIdno) || text(devIdno);
  const [tracks, mileage] = await Promise.all([
    loadCms808TrackRange(devIdno, from, to, vehiIdno).catch(() => []),
    loadCms808MileageDetail(plate, from, to, devIdno).catch(() => [])
  ]);
  let trail = mapCms808TracksToTrailPoints(tracks);
  let trips = trail.length >= 2 ? buildCms808TimelineTrips(trail) : [];
  if (trips.length === 0) trips = mapCms808MileageRowsToTimelineTrips(mileage);
  return { trips, trail };
}

/** Canonical Movement Report name for CMS 808 Mileage Report categories. */
export function normalizeCms808MovementReportName(reportName: string): string {
  const name = text(reportName);
  if (/mileage\s*summary/i.test(name)) return "Summary Movement Report";
  if (/mileage\s*detail/i.test(name)) return "Movement Overview Report";
  if (/mileage\s*daily|daily\s*monthly/i.test(name)) return "Daily Movement Report";
  if (/mileage\s*monthly/i.test(name)) return "Summary Movement Report";
  return name;
}
