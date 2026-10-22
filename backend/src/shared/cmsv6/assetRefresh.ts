import { cmsv6Call } from "./client";
import { cmsv6ObjectRows } from "./rows";
import { CMSV6_DEFAULT_CONFIG, cmsv6ConfigKey, cmsv6SsoSessionKey, parseCmsv6Config, type Cmsv6PlatformConfig } from "./storage";
import { flattenCmsv6Vehicles } from "./vehicles";

type Kv = {
  get: (key: string) => Promise<string | null | undefined>;
  set: (key: string, value: string) => Promise<void>;
};

export type Cms808Actor = { userId?: string; email?: string };

const STALE_MS = 20 * 60 * 1000;
const TRACK_DAYS = 18;
const FIX_CACHE_MS = 45 * 1000;
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

const text = (value: unknown) => String(value ?? "").trim();
const token = (value: unknown) => text(value).toLowerCase();

const pad = (value: number) => String(value).padStart(2, "0");

function formatEat(date: Date) {
  const shifted = new Date(date.getTime() + EAT_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
}

function eatDayRange(daysAgo: number, now = new Date()) {
  const shifted = new Date(now.getTime() + EAT_OFFSET_MS);
  const dayUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - daysAgo);
  const start = new Date(dayUtc - EAT_OFFSET_MS);
  const end = daysAgo === 0 ? now : new Date(dayUtc + 24 * 60 * 60 * 1000 - 1000 - EAT_OFFSET_MS);
  return { begintime: formatEat(start), endtime: formatEat(end) };
}

function toCoord(value: unknown): number | undefined {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw === 0) return undefined;
  if (Math.abs(raw) > 180) {
    const scaled = raw / 1_000_000;
    if (Number.isFinite(scaled) && Math.abs(scaled) <= 180) return scaled;
  }
  return raw;
}

export function parseCmsInstantMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1_000_000_000_000 ? value : value * 1000;
  const raw = text(value);
  if (!raw) return Number.NaN;
  if (/^\d{13}$/.test(raw)) return Number(raw);
  if (/^\d{10}$/.test(raw)) return Number(raw) * 1000;
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compact) return Date.parse(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}+03:00`);
  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) return Date.parse(`${dmy[3]}-${dmy[2]}-${dmy[1]}T${dmy[4] || "00"}:${dmy[5] || "00"}:${dmy[6] || "00"}+03:00`);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    return Date.parse(raw.replace(" ", "T") + "+03:00");
  }
  return Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T"));
}

function readLatLng(row: Record<string, unknown>) {
  const lat = toCoord(row.mlat ?? row.lat ?? row.ml ?? row.latitude ?? row.weiDu ?? row.weidu);
  const lng = toCoord(row.mlng ?? row.lng ?? row.lon ?? row.mt ?? row.longitude ?? row.jingDu ?? row.jingdu);
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function readGpsTime(row: Record<string, unknown>) {
  return text(row.gt ?? row.tm ?? row.gpsTime ?? row.devicetime ?? row.time ?? row.ft ?? row.eTime ?? row.bTime);
}

export type Cms808Fix = {
  atMs: number;
  iso: string;
  lat: number;
  lng: number;
  speed: number;
  location: string;
};

export function newestCms808Fix(payload: unknown): Cms808Fix | null {
  let best: Cms808Fix | null = null;
  for (const row of cmsv6ObjectRows(payload)) {
    const coords = readLatLng(row);
    const atMs = parseCmsInstantMs(readGpsTime(row));
    if (!coords || !Number.isFinite(atMs)) continue;
    if (best && atMs <= best.atMs) continue;
    const rawSpeed = Number(row.sp ?? row.speed);
    const speed = Number.isFinite(Number(row.sp)) ? Number(row.sp) / 10 : rawSpeed;
    best = {
      atMs,
      iso: new Date(atMs).toISOString(),
      lat: coords.lat,
      lng: coords.lng,
      speed: Number.isFinite(speed) ? speed : 0,
      location: (() => {
        const label = text(row.address ?? row.pos ?? row.placeName ?? row.location ?? row.lc);
        if (!label || /^\d{3,}$/.test(label)) return "";
        return label;
      })()
    };
  }
  return best;
}

function pageCount(data: Record<string, unknown> | undefined, pageSize: number) {
  const pagination = (data?.pagination ?? {}) as Record<string, unknown>;
  const direct = Number(pagination.totalPages ?? data?.pageCount ?? 0);
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);
  const total = Number(pagination.totalRecords ?? 0);
  const size = Number(pagination.pageRecords ?? pageSize) || pageSize;
  if (total > 0 && size > 0) return Math.ceil(total / size);
  return 1;
}

function assetIdentity(asset: Record<string, unknown>) {
  return [asset.imei, asset.cameraSerial, asset.registration, asset.assetDescription, asset.fleetNumber, text(asset.id).replace(/^cms808:/i, "")]
    .map(token)
    .filter((value) => value.length >= 3);
}

function looksLikeCmsAsset(asset: Record<string, unknown>) {
  const hay = [asset.camera, asset.device, asset.mobileDevice, asset.cameraModel, asset.model, asset.mobileModel, asset.cameraPositioningProtocol, asset.cameraVideoProtocol]
    .map(token)
    .join(" ");
  return /808|mdvr|jtt808|jt\/t808|1078/.test(hay);
}

async function loadPlatformConfig(kv: Kv, tenantId: string, site: string, actor?: Cms808Actor): Promise<Cmsv6PlatformConfig | null> {
  const raw = await kv.get(cmsv6ConfigKey(tenantId, site));
  const parsed = parseCmsv6Config(raw ?? null);
  const config = parsed ? { ...parsed, site: parsed.site || site } : null;
  if (!config) return null;
  const sessionRaw = await kv.get(cmsv6SsoSessionKey(tenantId, site, text(actor?.userId) || text(actor?.email) || "session"));
  let jsession = text(config.jsession);
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw) as { jsession?: string; expiresAt?: number };
      if (text(session.jsession) && Number(session.expiresAt) > Date.now()) jsession = text(session.jsession);
    } catch {
      // Ignore a damaged session and fall back to the stored platform login.
    }
  }
  if (!text(config.password) && !jsession) return null;
  return { ...config, jsession, account: text(config.account) || text(actor?.email) };
}

async function readCachedFix(kv: Kv, key: string): Promise<Cms808Fix | null | undefined> {
  const raw = await kv.get(key);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { fetchedAt?: number; fix?: Cms808Fix | null };
    if (!Number.isFinite(parsed.fetchedAt) || Date.now() - Number(parsed.fetchedAt) > FIX_CACHE_MS) return undefined;
    return parsed.fix ?? null;
  } catch {
    return undefined;
  }
}

async function trackNewest(config: Cmsv6PlatformConfig, devIdno: string, vehiIdno: string, daysAgo: number) {
  const pageSize = 200;
  const range = eatDayRange(daysAgo);
  const loadPage = (page: number) =>
    cmsv6Call(config, "StandardApiAction_queryTrackDetail", {
      devIdno,
      vehiIdno,
      ...range,
      distance: 0,
      parkTime: 0,
      currentPage: page,
      pageRecords: pageSize,
      toMap: config.toMap
    });
  const first = await loadPage(1);
  if (!first.ok) return null;
  const pages = pageCount(first.data, pageSize);
  const last = pages > 1 ? await loadPage(pages) : first;
  return newestCms808Fix([first.data, last.data]);
}

async function liveFix(config: Cmsv6PlatformConfig, devIdno: string, vehiIdno: string): Promise<Cms808Fix | null> {
  const status = await cmsv6Call(config, "StandardApiAction_getDeviceStatus", {
    devIdno,
    toMap: config.toMap,
    language: config.language || "en"
  });
  let best = status.ok ? newestCms808Fix(status.data) : null;
  const location = await cmsv6Call(config, "StandardApiAction_vehicleStatus", {
    vehiIdno: vehiIdno || devIdno,
    toMap: config.toMap,
    geoaddress: 1,
    currentPage: 1,
    pageRecords: 10
  });
  const located = location.ok ? newestCms808Fix(location.data) : null;
  if (located && (!best || located.atMs > best.atMs)) best = located;
  const stale = !best || Date.now() - best.atMs > STALE_MS;
  if (!stale) return best;
  for (let day = 0; day < TRACK_DAYS; day += 3) {
    const found = (
      await Promise.all([0, 1, 2].map((offset) => (day + offset < TRACK_DAYS ? trackNewest(config, devIdno, vehiIdno, day + offset) : Promise.resolve(null))))
    ).filter((fix): fix is Cms808Fix => Boolean(fix));
    const newest = found.sort((left, right) => right.atMs - left.atMs)[0];
    if (newest && (!best || newest.atMs > best.atMs)) return newest;
  }
  return best;
}

function applyFix(asset: Record<string, unknown>, fix: Cms808Fix): { asset: Record<string, unknown>; changed: boolean } {
  const currentMs = parseCmsInstantMs(asset.lastSeen ?? asset.lastPosition);
  if (Number.isFinite(currentMs) && fix.atMs <= currentMs) return { asset, changed: false };
  const next: Record<string, unknown> = {
    ...asset,
    lastSeen: fix.iso,
    lastPosition: fix.iso,
    lastTrip: fix.iso,
    lat: fix.lat,
    lng: fix.lng,
    lon: fix.lng,
    gps: `${fix.lat.toFixed(6)}, ${fix.lng.toFixed(6)}`,
    speed: fix.speed,
    movement: fix.speed > 5 ? "moving" : "stationary"
  };
  if (fix.location) {
    next.lastLocation = fix.location;
    next.location = fix.location;
    next.locationName = fix.location;
  }
  return { asset: next, changed: true };
}

/**
 * Device status on the 808 platform can stay on an old GPS time while the camera
 * is still reporting. Refresh matching fleet rows from status, vehicle location,
 * and recent day tracks, and write a newer fix back onto the asset.
 */
export async function refreshCms808AssetPositions(input: {
  kv: Kv;
  tenantId: string;
  actor?: Cms808Actor;
  assets: Record<string, unknown>[];
  persist: (patch: Record<string, unknown>) => Promise<void>;
}): Promise<Record<string, unknown>[]> {
  const assets = Array.isArray(input.assets) ? input.assets : [];
  if (!assets.length) return assets;
  const sites = Array.from(new Set(assets.map((asset) => text(asset.site)).filter(Boolean)));
  if (!sites.length) sites.push("Karongo");
  const configs = new Map<string, Cmsv6PlatformConfig | null>();
  for (const site of sites) {
    configs.set(site, await loadPlatformConfig(input.kv, input.tenantId, site, input.actor).catch(() => null));
  }
  const config = Array.from(configs.values()).find((row) => row && (text(row.password) || text(row.jsession) || text(row.baseUrl)))
    || { ...CMSV6_DEFAULT_CONFIG, site: sites[0] || "Karongo", enabled: true };

  let vehicles: ReturnType<typeof flattenCmsv6Vehicles> = [];
  try {
    const listed = await cmsv6Call(config, "StandardApiAction_queryUserVehicle", { language: config.language || "en" });
    vehicles = listed.ok ? flattenCmsv6Vehicles(listed.data) : [];
  } catch {
    vehicles = [];
  }

  const targets = assets
    .map((asset, index) => {
      const keys = assetIdentity(asset);
      const vehicle = vehicles.find((row) => {
        const device = token(row.devIdno || row.deviceId);
        const plate = token(row.vehiIdno);
        return keys.some((key) => key === device || key === plate);
      });
      if (!vehicle && !looksLikeCmsAsset(asset)) return null;
      const devIdno = text(vehicle?.devIdno || vehicle?.deviceId || asset.cameraSerial || asset.imei);
      const vehiIdno = text(vehicle?.vehiIdno || asset.registration || asset.assetDescription);
      if (!/^\d{6,}$/.test(devIdno)) return null;
      return { index, devIdno, vehiIdno, site: text(asset.site) || text(config.site) || "Karongo" };
    })
    .filter((row): row is { index: number; devIdno: string; vehiIdno: string; site: string } => Boolean(row))
    .slice(0, 8);

  if (!targets.length) return assets;
  const next = assets.slice();
  for (const target of targets) {
    const siteConfig = configs.get(target.site) || config;
    const cacheKey = `cms808:live-fix:${token(input.tenantId)}:${target.devIdno}`;
    let fix = await readCachedFix(input.kv, cacheKey).catch(() => undefined);
    if (fix === undefined) {
      fix = await liveFix(siteConfig, target.devIdno, target.vehiIdno).catch(() => null);
      await input.kv.set(cacheKey, JSON.stringify({ fetchedAt: Date.now(), fix })).catch(() => undefined);
    }
    if (!fix) continue;
    const applied = applyFix(next[target.index] || {}, fix);
    next[target.index] = applied.asset;
    if (!applied.changed) continue;
    const asset = applied.asset;
    await input.persist({
      id: asset.id,
      imei: asset.imei,
      registration: asset.registration,
      site: asset.site,
      lastSeen: asset.lastSeen,
      lastPosition: asset.lastPosition,
      lastTrip: asset.lastTrip,
      lat: asset.lat,
      lng: asset.lng,
      gps: asset.gps,
      speed: asset.speed,
      movement: asset.movement,
      ...(text(asset.lastLocation)
        ? { lastLocation: asset.lastLocation, location: asset.location, locationName: asset.locationName }
        : {})
    }).catch(() => undefined);
  }
  return next;
}
