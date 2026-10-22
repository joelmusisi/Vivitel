import type { FuelChangePoint, FuelTrendPoint } from "./fuelTrendStabilizer";

export type GpsIotFuelRefill = {
  date: string;
  initialLevel: number;
  finalLevel: number;
  filled: number;
  location: string;
  latitude: number;
  longitude: number;
};

export type GpsIotFuelDrain = {
  date: string;
  initialLevel: number;
  finalLevel: number;
  drained: number;
  location: string;
  latitude: number;
  longitude: number;
};

export type GpsIotFuelInfo = {
  sensors: Array<{
    sensor: string;
    refills: GpsIotFuelRefill[];
    drains: GpsIotFuelDrain[];
    totalDistance: number;
    totalEngineHours: number;
    fuelConsumption: number;
    fuelUsed: number;
    totalDrains: number;
    totalRefills: number;
  }>;
  refills: GpsIotFuelRefill[];
  drains: GpsIotFuelDrain[];
  totalDistance: number;
  totalEngineHours: number;
  fuelConsumption: number;
  fuelUsed: number;
  totalDrains: number;
  totalRefills: number;
};

/** GPS IoT AssetId for fuel APIs (AssetFuelInfo / AssetCurrentReading / GetFuelTelemetry). */
export function resolveGpsIotFuelAssetId(asset: {
  assetId?: unknown;
  id?: unknown;
  imei?: unknown;
}): string {
  const direct = String(asset.assetId ?? "").trim();
  if (direct) return direct.replace(/^gpsiot:/i, "");
  const fromId = String(asset.id ?? "").trim();
  if (/^gpsiot:/i.test(fromId)) return fromId.replace(/^gpsiot:/i, "");
  return String(asset.imei ?? "").trim();
}

export function parseGpsIotFuelDateMs(value: string): number {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
    return Date.parse(raw.replace(" ", "T") + ( /Z$/i.test(raw) ? "" : "Z"));
  }
  return Date.parse(raw);
}

export function formatGpsIotFuelStamp(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

/** Step-line trend + refill/drain markers from AssetFuelInfo / GetFuelTelemetry (litres). */
export function buildFuelModelFromGpsIotInfo(
  info: GpsIotFuelInfo,
  options?: { currentLiters?: number | null; rangeEndMs?: number }
): {
  trend: FuelTrendPoint[];
  changePoints: FuelChangePoint[];
  refills: FuelChangePoint[];
  drains: FuelChangePoint[];
} {
  const changePoints: FuelChangePoint[] = [];

  for (const event of info.refills) {
    const atMs = parseGpsIotFuelDateMs(event.date);
    if (!Number.isFinite(atMs)) continue;
    changePoints.push({
      atMs,
      liters: event.finalLevel,
      deltaLiters: event.filled,
      rising: true,
      fromLevel: event.initialLevel,
      toLevel: event.finalLevel,
      lat: event.latitude || undefined,
      lng: event.longitude || undefined,
      locationName: event.location || undefined
    });
  }

  for (const event of info.drains) {
    const atMs = parseGpsIotFuelDateMs(event.date);
    if (!Number.isFinite(atMs)) continue;
    changePoints.push({
      atMs,
      liters: event.finalLevel,
      deltaLiters: -Math.abs(event.drained),
      rising: false,
      fromLevel: event.initialLevel,
      toLevel: event.finalLevel,
      lat: event.latitude || undefined,
      lng: event.longitude || undefined,
      locationName: event.location || undefined
    });
  }

  changePoints.sort((a, b) => a.atMs - b.atMs);

  const trend: FuelTrendPoint[] = [];
  for (const point of changePoints) {
    trend.push({ atMs: point.atMs - 1000, liters: point.fromLevel });
    trend.push({ atMs: point.atMs, liters: point.toLevel });
  }

  const current = options?.currentLiters;
  const endMs = options?.rangeEndMs ?? Date.now();
  if (typeof current === "number" && Number.isFinite(current)) {
    const last = trend[trend.length - 1];
    if (!last || endMs > last.atMs) {
      trend.push({ atMs: endMs, liters: current });
    } else {
      trend.push({ atMs: last.atMs + 1, liters: current });
    }
  }

  return {
    trend,
    changePoints,
    refills: changePoints.filter((point) => point.rising),
    drains: changePoints.filter((point) => !point.rising)
  };
}

export function gpsIotFuelEfficiencyLPerKm(info: Pick<GpsIotFuelInfo, "fuelUsed" | "totalDistance" | "fuelConsumption">): number {
  const distance = Number(info.totalDistance) || 0;
  const used = Number(info.fuelUsed) || 0;
  if (distance > 0 && used > 0) return used / distance;
  const consumption = Number(info.fuelConsumption) || 0;
  return consumption > 0 ? consumption : 0;
}
