export type AssetDotStatus = "online" | "warning" | "stale" | "offline";

const STALE_MINUTES = 30;
const STATIONARY_MINUTES = 2;

const parseTimestampMs = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const direct = Date.parse(raw);
  return Number.isNaN(direct) ? Number.NaN : direct;
};

const isMoving = (movement: unknown, speed: unknown): boolean => {
  const speedNum = typeof speed === "number" ? speed : Number(speed);
  if (Number.isFinite(speedNum)) return speedNum >= 5;
  const movementRaw = String(movement ?? "").trim().toLowerCase();
  return ["moving", "move", "in_motion", "in motion", "motion", "stationary"].includes(movementRaw)
    ? movementRaw !== "stationary"
    : false;
};

export const assetDotStatusLabel = (status: AssetDotStatus): string => {
  if (status === "online") return "Moving";
  if (status === "warning") return "Stopped";
  if (status === "stale") return "Idle";
  return "Offline";
};

export const assetDotStatusColor = (status: AssetDotStatus): string => {
  if (status === "online") return "#22c55e";
  if (status === "warning") return "#ef4444";
  if (status === "stale") return "#f59e0b";
  return "#64748b";
};

export const resolveAssetDotStatus = (asset: Record<string, unknown>): AssetDotStatus => {
  const lastSeen = asset.lastSeen ?? asset.last_seen ?? asset.lastUpdate;
  const fixMs = parseTimestampMs(lastSeen ?? asset.telemetryAtMs);
  if (!Number.isFinite(fixMs)) return "offline";

  const ageMinutes = (Date.now() - fixMs) / (1000 * 60);
  if (ageMinutes > STALE_MINUTES) return "stale";

  const speed = asset.speedKph ?? asset.speed;
  const movement = asset.movement;
  if (isMoving(movement, speed)) return "online";

  const stationaryMinutes = ageMinutes;
  if (stationaryMinutes >= STATIONARY_MINUTES) return "warning";
  return "online";
};
