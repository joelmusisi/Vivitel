import { apiFetch } from "./client";
import { fetchAssets, type FleetAsset } from "./fleet";
import { assetDotStatusLabel, resolveAssetDotStatus, type AssetDotStatus } from "../utils/assetStatus";

export type TraccarLivePosition = {
  lat?: number;
  lng?: number;
  speed?: number;
  fixTime?: string;
  deviceTime?: string;
  address?: string | null;
};

export type TraccarLiveRow = {
  deviceId?: number;
  imei?: string;
  name?: string;
  status?: string;
  lastUpdate?: string;
  position?: TraccarLivePosition | null;
};

export type LiveMapMarker = {
  id: string;
  label: string;
  subtitle: string;
  lat: number;
  lng: number;
  speedKph?: number;
  status: AssetDotStatus;
  fixTime?: string;
  address?: string;
};

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

const buildLiveIndex = (rows: TraccarLiveRow[]) => {
  const byDeviceId = new Map<string, TraccarLiveRow>();
  const byImei = new Map<string, TraccarLiveRow>();
  const byName = new Map<string, TraccarLiveRow>();
  for (const row of rows) {
    const deviceId = String(row.deviceId ?? "").trim();
    if (deviceId) byDeviceId.set(deviceId, row);
    const imei = norm(row.imei);
    if (imei) byImei.set(imei, row);
    const name = norm(row.name);
    if (name) byName.set(name, row);
  }
  return { byDeviceId, byImei, byName };
};

const matchLiveRow = (asset: FleetAsset, index: ReturnType<typeof buildLiveIndex>): TraccarLiveRow | undefined => {
  const directId = String((asset as any).traccarDeviceId ?? (asset as any).deviceId ?? "").trim();
  if (directId && index.byDeviceId.has(directId)) return index.byDeviceId.get(directId);
  const imei = norm(asset.imei);
  if (imei && index.byImei.has(imei)) return index.byImei.get(imei);
  const name = norm(asset.registration ?? asset.assetDescription);
  if (name && index.byName.has(name)) return index.byName.get(name);
  return undefined;
};

const enrichAssetWithLive = (asset: FleetAsset, row: TraccarLiveRow | undefined): Record<string, unknown> => {
  if (!row?.position) return asset as Record<string, unknown>;
  const knots = Number(row.position.speed);
  const speedKph = Number.isFinite(knots) ? knots * 1.852 : undefined;
  const fixTime = String(row.position.fixTime ?? row.position.deviceTime ?? row.lastUpdate ?? "").trim();
  const fixMs = fixTime ? Date.parse(fixTime) : Number.NaN;
  const movement =
    typeof speedKph === "number" ? (speedKph >= 5 ? "moving" : "stationary") : undefined;

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

const assetLabel = (asset: FleetAsset): string =>
  String(asset.registration ?? "").trim() ||
  String(asset.assetDescription ?? "").trim() ||
  String(asset.assetId ?? asset.id ?? "").trim() ||
  "Unknown asset";

export async function fetchTraccarLive(): Promise<{ rows: TraccarLiveRow[]; degraded: boolean }> {
  const body = await apiFetch<{ live?: TraccarLiveRow[]; degraded?: boolean }>("/api/traccar/live", {
    method: "GET"
  });
  return {
    rows: Array.isArray(body?.live) ? body.live : [],
    degraded: Boolean(body?.degraded)
  };
}

export async function fetchLiveMapMarkers(): Promise<{ markers: LiveMapMarker[]; degraded: boolean }> {
  const [assets, liveResult] = await Promise.all([fetchAssets(), fetchTraccarLive()]);
  const liveIndex = buildLiveIndex(liveResult.rows);
  const markers: LiveMapMarker[] = [];

  for (const asset of assets) {
    const enriched = enrichAssetWithLive(asset, matchLiveRow(asset, liveIndex));
    const lat = Number(enriched.lat);
    const lng = Number(enriched.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const status = resolveAssetDotStatus(enriched);
    const speedKph = Number(enriched.speedKph);
    const fixTime = String(enriched.lastSeen ?? "").trim();
    const liveRow = matchLiveRow(asset, liveIndex);
    const address = String(liveRow?.position?.address ?? "").trim();
    const parts = [assetDotStatusLabel(status)];
    if (Number.isFinite(speedKph)) parts.push(`${Math.round(speedKph)} km/h`);
    if (String(asset.site ?? "").trim()) parts.unshift(String(asset.site).trim());

    markers.push({
      id: String(asset.assetId ?? asset.id ?? `${lat},${lng}`),
      label: assetLabel(asset),
      subtitle: parts.join(" · "),
      lat,
      lng,
      speedKph: Number.isFinite(speedKph) ? speedKph : undefined,
      status,
      fixTime: fixTime || undefined,
      address: address || undefined
    });
  }

  return { markers, degraded: liveResult.degraded };
}

export function regionForMarkers(
  markers: LiveMapMarker[],
  padding = 0.08
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } {
  if (markers.length === 0) {
    return { latitude: 43.6532, longitude: -79.3832, latitudeDelta: 8, longitudeDelta: 8 };
  }
  if (markers.length === 1) {
    return {
      latitude: markers[0].lat,
      longitude: markers[0].lng,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08
    };
  }

  let minLat = markers[0].lat;
  let maxLat = markers[0].lat;
  let minLng = markers[0].lng;
  let maxLng = markers[0].lng;
  for (const marker of markers) {
    minLat = Math.min(minLat, marker.lat);
    maxLat = Math.max(maxLat, marker.lat);
    minLng = Math.min(minLng, marker.lng);
    maxLng = Math.max(maxLng, marker.lng);
  }

  const latitudeDelta = Math.max(0.05, maxLat - minLat + padding);
  const longitudeDelta = Math.max(0.05, maxLng - minLng + padding);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta,
    longitudeDelta
  };
}
