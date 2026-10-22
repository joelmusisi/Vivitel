export type TachoSample = {
  atMs: number;
  lat?: number | null;
  lng?: number | null;
  speedKph?: number | null;
  rpm?: unknown;
};

export type TachoSeriesPoint = {
  atMs: number;
  speedKph: number;
  rpmRevPerSec: number;
};

const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const n =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(n));
};

/** Engine speed as revolutions per second. Values above 200, or labeled rpm, are per minute. */
export const toRpmRevPerSec = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const text = String(value).trim().toLowerCase();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  const rpm = typeof value === "number" && Number.isFinite(value) ? value : match ? Number(match[0]) : Number.NaN;
  if (!Number.isFinite(rpm) || rpm <= 0) return null;
  if (text.includes("rev/s") || text.includes("rps")) return rpm;
  if (text.includes("rpm") || rpm > 200) return rpm / 60;
  return rpm;
};

const reportedSpeedKph = (value: number | null | undefined): number => {
  const speed = Number(value);
  return Number.isFinite(speed) ? Math.max(0, speed) : 0;
};

const derivedSpeedKph = (
  prev: { atMs: number; lat: number; lng: number } | null,
  next: { atMs: number; lat?: number | null; lng?: number | null }
): number | null => {
  if (!prev) return null;
  const lat = Number(next.lat);
  const lng = Number(next.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const deltaMs = next.atMs - prev.atMs;
  if (deltaMs < 15_000 || deltaMs > 30 * 60_000) return null;
  const km = haversineKm(prev.lat, prev.lng, lat, lng);
  if (!Number.isFinite(km) || km < 0.05 || km > 80) return null;
  const speed = km / (deltaMs / 3_600_000);
  if (!Number.isFinite(speed) || speed > 180) return null;
  return speed;
};

/**
 * Speed and RPM points for the trip tachograph.
 * Reported speed wins when it is present. A near-zero report with a real
 * position change uses the distance over time, so a track is not drawn flat.
 */
export const buildTachoPoints = (samples: TachoSample[]): TachoSeriesPoint[] => {
  const ordered = samples
    .filter((sample) => Number.isFinite(sample.atMs))
    .slice()
    .sort((a, b) => a.atMs - b.atMs);
  let previous: { atMs: number; lat: number; lng: number } | null = null;
  return ordered.map((sample) => {
    const reported = reportedSpeedKph(sample.speedKph);
    const derived = derivedSpeedKph(previous, sample);
    const lat = Number(sample.lat);
    const lng = Number(sample.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) previous = { atMs: sample.atMs, lat, lng };
    const speedKph = reported >= 3 || derived == null ? reported : derived;
    const rpm = toRpmRevPerSec(sample.rpm);
    return {
      atMs: sample.atMs,
      speedKph,
      rpmRevPerSec: rpm != null ? rpm : Math.max(0, speedKph * 0.42)
    };
  });
};

/** Axis top for a series. Empty data keeps the fallback scale. */
export const tachoAxisMax = (peak: number, fallback: number): number => {
  if (!(peak > 0) || !Number.isFinite(peak)) return fallback;
  return peak * 1.15;
};

/**
 * Keep the first/last point and local peaks so a dense track draws as a thin line
 * instead of a solid band, while the analyzer can still use every sample.
 */
export const thinTachoPathPoints = <T extends { atMs: number; speedKph: number; rpmRevPerSec: number }>(
  points: T[],
  maxPoints = 720
): T[] => {
  if (points.length <= maxPoints) return points;
  const bucketSize = Math.ceil(points.length / Math.max(2, Math.floor(maxPoints / 2)));
  const kept = new Map<number, T>();
  kept.set(0, points[0]);
  kept.set(points.length - 1, points[points.length - 1]);
  for (let start = 0; start < points.length; start += bucketSize) {
    const end = Math.min(points.length, start + bucketSize);
    let minSpeedIdx = start;
    let maxSpeedIdx = start;
    let minRpmIdx = start;
    let maxRpmIdx = start;
    for (let index = start; index < end; index += 1) {
      const point = points[index];
      if (point.speedKph < points[minSpeedIdx].speedKph) minSpeedIdx = index;
      if (point.speedKph > points[maxSpeedIdx].speedKph) maxSpeedIdx = index;
      if (point.rpmRevPerSec < points[minRpmIdx].rpmRevPerSec) minRpmIdx = index;
      if (point.rpmRevPerSec > points[maxRpmIdx].rpmRevPerSec) maxRpmIdx = index;
    }
    kept.set(minSpeedIdx, points[minSpeedIdx]);
    kept.set(maxSpeedIdx, points[maxSpeedIdx]);
    kept.set(minRpmIdx, points[minRpmIdx]);
    kept.set(maxRpmIdx, points[maxRpmIdx]);
  }
  return [...kept.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((entry) => entry[1]);
};
