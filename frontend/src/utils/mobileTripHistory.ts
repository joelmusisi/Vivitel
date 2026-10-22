import { getTraccarDevices, getTraccarRoute, getTraccarTrips, type TraccarTrip } from "./api";

export type MobileTripStage = {
  id: string;
  stageIndex: number;
  startIso: string;
  endIso: string;
  startLabel: string;
  endLabel: string;
  durationLabel: string;
  distanceKm: string;
  startAddress: string;
  endAddress: string;
};

export type MobileTripDayGroup = {
  dayKey: string;
  dayLabel: string;
  trips: MobileTripStage[];
};

export type ReplayPoint = {
  lat: number;
  lng: number;
  atMs: number;
};

const isoDay = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatClock = (iso: string) => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

const formatDuration = (durationMs: number) => {
  const mins = Math.max(0, Math.round(durationMs / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
};

const tripDistanceKm = (trip: TraccarTrip): string => {
  const raw = Number(trip.distance ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return "0.0";
  const km = raw >= 1000 ? raw / 1000 : raw;
  return km.toFixed(1);
};

export async function resolveDeviceIdForAsset(asset: Record<string, unknown>): Promise<number | null> {
  const directId = Number(asset.traccarDeviceId ?? asset.deviceId);
  if (Number.isFinite(directId) && directId > 0) return directId;

  const devices = await getTraccarDevices().catch(() => []);
  const imei = String(asset.imei ?? asset.uniqueId ?? "").trim().toLowerCase();
  const registration = String(asset.registration ?? asset.assetDescription ?? asset.name ?? "")
    .trim()
    .toLowerCase();

  for (const device of Array.isArray(devices) ? devices : []) {
    const id = Number((device as { id?: unknown })?.id);
    if (!Number.isFinite(id)) continue;
    const uniqueId = String((device as { uniqueId?: unknown })?.uniqueId ?? "").trim().toLowerCase();
    const name = String((device as { name?: unknown })?.name ?? "").trim().toLowerCase();
    if ((imei && uniqueId === imei) || (registration && name === registration)) return id;
  }
  return null;
}

export function assetDisplayName(asset: Record<string, unknown>): string {
  return (
    String(asset.registration ?? "").trim() ||
    String(asset.assetDescription ?? "").trim() ||
    String(asset.name ?? "").trim() ||
    "Asset"
  );
}

export async function fetchAssetTripHistory(
  asset: Record<string, unknown>,
  days = 7
): Promise<MobileTripDayGroup[]> {
  const deviceId = await resolveDeviceIdForAsset(asset);
  if (!deviceId) return [];

  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400000);
  from.setHours(0, 0, 0, 0);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const trips = await getTraccarTrips({ deviceId, from: fromIso, to: toIso }).catch(() => []);
  const sorted = [...trips].sort(
    (a, b) => Date.parse(String(b.startTime ?? "")) - Date.parse(String(a.startTime ?? ""))
  );

  const byDay = new Map<string, MobileTripStage[]>();
  sorted.forEach((trip) => {
    const startIso = String(trip.startTime ?? "").trim();
    const endIso = String(trip.endTime ?? startIso).trim();
    const startMs = Date.parse(startIso);
    if (!Number.isFinite(startMs)) return;
    const dayKey = isoDay(new Date(startMs));
    const list = byDay.get(dayKey) ?? [];
    const stage: MobileTripStage = {
      id: `${deviceId}-${startIso}-${list.length}`,
      stageIndex: list.length + 1,
      startIso,
      endIso,
      startLabel: formatClock(startIso),
      endLabel: formatClock(endIso),
      durationLabel: formatDuration(Number(trip.duration) || Math.max(0, Date.parse(endIso) - startMs)),
      distanceKm: tripDistanceKm(trip),
      startAddress: String(trip.startAddress ?? "Start").trim() || "Start",
      endAddress: String(trip.endAddress ?? "End").trim() || "End"
    };
    list.push(stage);
    byDay.set(dayKey, list);
  });

  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, dayTrips]) => ({
      dayKey,
      dayLabel: new Date(`${dayKey}T12:00:00`).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short"
      }),
      trips: dayTrips.sort((a, b) => Date.parse(b.startIso) - Date.parse(a.startIso))
    }));
}

export async function fetchTripRoute(
  deviceId: number,
  startIso: string,
  endIso: string
): Promise<ReplayPoint[]> {
  const route = await getTraccarRoute({ deviceId, from: startIso, to: endIso }).catch(() => []);
  return route
    .map((point) => {
      const lat = Number((point as { latitude?: unknown }).latitude);
      const lng = Number((point as { longitude?: unknown }).longitude);
      const atMs = Date.parse(
        String((point as { fixTime?: unknown }).fixTime ?? (point as { deviceTime?: unknown }).deviceTime ?? "")
      );
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng, atMs: Number.isFinite(atMs) ? atMs : 0 };
    })
    .filter((row): row is ReplayPoint => Boolean(row))
    .sort((a, b) => a.atMs - b.atMs);
}
