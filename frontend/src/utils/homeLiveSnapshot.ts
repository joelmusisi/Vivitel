import { getTenantId, getTraccarLive, type TraccarLiveRow } from "./api";
import { resolveAssetDotStatus, type AssetDotStatus } from "./assetStatus";
import type { HomeLiveSection, HomeStatusCounts } from "./homeDashboardApi";
import { loadScopedAssets, peekScopedAssets } from "./homeScopedDevices";
import { filterAssetsToHomeSites, readHomeSiteScope } from "./homeSiteScope";

/** How long Home waits for the live feed before classifying from stored last-seen. */
const LIVE_FEED_WAIT_MS = 8_000;

const dotToHomeStatus = (status: AssetDotStatus): keyof HomeStatusCounts => {
  if (status === "online") return "moving";
  if (status === "warning") return "stopped";
  if (status === "stale") return "idle";
  return "offline";
};

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

const imeiDigits = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D+/g, "");
  return digits.length >= 14 && digits.length <= 17 ? digits : "";
};

/** Index the live Traccar feed by device id, IMEI, and name for asset matching. */
const buildLiveIndex = (rows: TraccarLiveRow[]) => {
  const byDeviceId = new Map<string, TraccarLiveRow>();
  const byImei = new Map<string, TraccarLiveRow>();
  const byName = new Map<string, TraccarLiveRow>();
  for (const row of rows) {
    const deviceId = String(row.deviceId ?? "").trim();
    if (deviceId) byDeviceId.set(deviceId, row);
    const imei = norm(row.imei);
    if (imei) byImei.set(imei, row);
    const digits = imeiDigits(row.imei);
    if (digits) byImei.set(digits, row);
    const name = norm(row.name);
    if (name) byName.set(name, row);
  }
  return { byDeviceId, byImei, byName };
};

const matchLiveRow = (
  asset: Record<string, unknown>,
  index: ReturnType<typeof buildLiveIndex>
): TraccarLiveRow | undefined => {
  const directId = String(asset.traccarDeviceId ?? asset.deviceId ?? "").trim();
  if (directId && index.byDeviceId.has(directId)) return index.byDeviceId.get(directId);
  const imei = norm(asset.imei ?? asset.uniqueId);
  if (imei && index.byImei.has(imei)) return index.byImei.get(imei);
  const digits = imeiDigits(asset.imei ?? asset.uniqueId);
  if (digits && index.byImei.has(digits)) return index.byImei.get(digits);
  const name = norm(asset.registration ?? asset.assetDescription ?? asset.name);
  if (name && index.byName.has(name)) return index.byName.get(name);
  return undefined;
};

/**
 * Merge the latest live position (speed in knots → km/h, fix time) onto the asset
 * so status is computed from fresh telemetry — the same way Live Tracking does it.
 * Without this, a moving asset whose stored `lastSeen` is older than the stale
 * window is wrongly classed as "idle" on the dashboard.
 */
const enrichAssetWithLive = (
  asset: Record<string, unknown>,
  row: TraccarLiveRow | undefined
): Record<string, unknown> => {
  if (!row || !row.position) return asset;
  const knots = Number(row.position.speed);
  const speedKph = Number.isFinite(knots) ? knots * 1.852 : undefined;
  const fixTime = String(row.position.fixTime ?? row.position.deviceTime ?? row.lastUpdate ?? "").trim();
  const fixMs = fixTime ? Date.parse(fixTime) : Number.NaN;
  const movement =
    typeof speedKph === "number" ? (speedKph > 5 ? "moving" : "stationary") : undefined;

  return {
    ...asset,
    ...(speedKph != null ? { speedKph } : {}),
    ...(movement ? { movement } : {}),
    ...(fixTime ? { lastSeen: fixTime } : {}),
    ...(Number.isFinite(fixMs) ? { telemetryAtMs: fixMs } : {}),
    ...(typeof row.position.lat === "number" ? { lat: row.position.lat } : {}),
    ...(typeof row.position.lng === "number" ? { lng: row.position.lng } : {})
  };
};

/** Vehicle counts from the last asset list, before any network call. */
export function peekHomeLiveFromCache(): HomeLiveSection | null {
  const assets = filterAssetsToHomeSites(peekScopedAssets(), readHomeSiteScope().scopedSites);
  if (!assets.length) return null;
  const statusCounts: HomeStatusCounts = { moving: 0, stopped: 0, idle: 0, offline: 0 };
  for (const asset of assets) {
    statusCounts[dotToHomeStatus(resolveAssetDotStatus(asset))] += 1;
  }
  return { totalVehicles: assets.length, statusCounts };
}

const liveInflight = new Map<string, Promise<HomeLiveSection>>();

/** Live fleet counts using the same asset source and status rules as Live Tracking. */
export async function fetchHomeLiveFromTracking(): Promise<HomeLiveSection> {
  // Per site: a request started for the previous site must not answer for the new one.
  const key = `${getTenantId() || "_"}|${readHomeSiteScope().scopedSites.join("|")}`;
  const existing = liveInflight.get(key);
  if (existing) return existing;
  const request = fetchHomeLiveUncached().finally(() => {
    liveInflight.delete(key);
  });
  liveInflight.set(key, request);
  return request;
}

async function fetchHomeLiveUncached(): Promise<HomeLiveSection> {
  // Positions and the asset list start together. A slow live feed must not hold
  // the vehicle counts — stored last-seen still classifies the fleet.
  const [scopedAssets, liveRows] = await Promise.all([
    loadScopedAssets(),
    Promise.race([
      getTraccarLive().catch(() => [] as TraccarLiveRow[]),
      new Promise<TraccarLiveRow[]>((resolve) => setTimeout(() => resolve([]), LIVE_FEED_WAIT_MS))
    ])
  ]);
  const assets = filterAssetsToHomeSites(scopedAssets, readHomeSiteScope().scopedSites);
  const rows = Array.isArray(liveRows) ? liveRows : [];
  // No live rows for a non-empty fleet means the feed failed or timed out.
  const liveStale = rows.length === 0 && assets.length > 0;
  const liveIndex = buildLiveIndex(rows);

  const statusCounts: HomeStatusCounts = { moving: 0, stopped: 0, idle: 0, offline: 0 };
  for (const asset of assets) {
    const enriched = enrichAssetWithLive(asset, matchLiveRow(asset, liveIndex));
    statusCounts[dotToHomeStatus(resolveAssetDotStatus(enriched))] += 1;
  }

  return { totalVehicles: assets.length, statusCounts, liveStale };
}
