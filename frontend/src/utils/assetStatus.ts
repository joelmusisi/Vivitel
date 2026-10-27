import { extractAssetMovement, extractAssetSpeedKph, isMovingSpeedKph } from "./assetTelemetryFields";

export type AssetDotStatus = "online" | "warning" | "stale" | "offline";

const STALE_MINUTES = 30;

type AssetStatusInput = {
  availability?: unknown;
  lastSeen?: unknown;
  lastPosition?: unknown;
  lastTrip?: unknown;
  speed?: unknown;
  movement?: unknown;
  lat?: unknown;
  lng?: unknown;
  lastMoveAtMs?: unknown;
  telemetryAtMs?: unknown;
  staleMinutes?: number;
  /** @deprecated Use staleMinutes instead */
  staleHours?: number;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseTimestampMs = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;

  if (/^\d{10,13}$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  }

  const cleaned = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();

  // Support legacy dd/mm/yyyy hh:mm[:ss] values.
  const match = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const hour = Number(match[4] ?? "0");
    const minute = Number(match[5] ?? "0");
    const second = Number(match[6] ?? "0");
    const ms = Date.UTC(year, month - 1, day, hour, minute, second);
    return Number.isFinite(ms) ? ms : Number.NaN;
  }

  const direct = Date.parse(cleaned);
  if (!Number.isNaN(direct)) return direct;
  return Number.NaN;
};

const isAvailable = (value: unknown): boolean => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return true;
  return raw === "available" || raw === "online";
};

const DOT_STATUS_VALUES = new Set(["online", "warning", "stale", "offline"]);

const resolveAvailability = (live: Record<string, unknown>): unknown => {
  const explicit = live?.availabilityStatus ?? live?.availability;
  if (String(explicit ?? "").trim()) return explicit;

  // Live rows store computed dot status in `status`; only use it for API availability values.
  const statusRaw = String(live?.status ?? "").trim().toLowerCase();
  if (!statusRaw || DOT_STATUS_VALUES.has(statusRaw)) return undefined;
  return live?.status;
};

const isMoving = (_movement: unknown, speed: unknown): boolean => isMovingSpeedKph(speed);

const resolveNewestTelemetryMs = (input: AssetStatusInput): number => {
  const candidates = [
    parseTimestampMs(input.lastSeen),
    parseTimestampMs(input.lastPosition),
    toFiniteNumber(input.telemetryAtMs)
  ].filter((value) => Number.isFinite(value)) as number[];
  if (!candidates.length) return Number.NaN;
  return Math.max(...candidates);
};

const resolveTelemetryAgeMinutes = (input: AssetStatusInput): number => {
  const newestMs = resolveNewestTelemetryMs(input);
  if (!Number.isFinite(newestMs)) return Number.POSITIVE_INFINITY;
  return (Date.now() - newestMs) / (1000 * 60);
};

export const resolveLastMoveAtMs = (params: {
  previousLastMoveAtMs?: number;
  atMs: number;
  speed?: unknown;
  movement?: unknown;
  previousLat?: number;
  previousLng?: number;
  lat?: number;
  lng?: number;
}): number => {
  if (isMoving(params.movement, params.speed)) return params.atMs;
  if (Number.isFinite(params.previousLastMoveAtMs)) return Number(params.previousLastMoveAtMs);
  return params.atMs;
};

export const assetDotStatusLabel = (status: AssetDotStatus): string => {
  if (status === "online") return "Moving";
  if (status === "warning") return "Stationary";
  if (status === "stale") return "Old Information";
  return "Offline";
};

export const computeAssetDotStatus = (input: AssetStatusInput): AssetDotStatus => {
  if (!isAvailable(input.availability)) return "offline";

  const staleMinutes = Number.isFinite(input.staleMinutes as number)
    ? Number(input.staleMinutes)
    : Number.isFinite(input.staleHours as number)
      ? Number(input.staleHours) * 60
      : STALE_MINUTES;
  const ageMinutes = resolveTelemetryAgeMinutes(input);
  if (!Number.isFinite(ageMinutes)) return "offline";
  if (ageMinutes > staleMinutes) return "stale";

  if (isMoving(input.movement, input.speed)) return "online";
  return "warning";
};

const isDashPlaceholder = (value: unknown): boolean => {
  const raw = String(value ?? "").trim();
  return !raw || raw === "-" || raw === "—" || raw === "--";
};

const hasProvisionedImei = (asset: Record<string, unknown>): boolean => {
  const imei = String(asset?.imei ?? "").trim();
  return Boolean(imei && !isDashPlaceholder(imei));
};

export const buildAssetStatusInput = (asset: Record<string, unknown>, staleMinutes = STALE_MINUTES): AssetStatusInput => {
  const live = asset as Record<string, unknown> & {
    telemetryLatest?: { timestamp?: unknown; at?: unknown; speed?: unknown; movement?: unknown; data?: { speed?: unknown; movement?: unknown } };
    availabilityStatus?: unknown;
  };

  const speedKph = extractAssetSpeedKph(live);

  return {
    availability: resolveAvailability(live),
    lastSeen:
      live?.lastSeen ??
      live?.last_seen ??
      live?.lastServerTime ??
      live?.last_server_time ??
      live?.lastActive ??
      live?.last_active ??
      live?.telemetryLatest?.timestamp ??
      live?.telemetryLatest?.at,
    lastPosition: live?.lastPosition ?? live?.last_position,
    lastTrip: live?.lastTrip ?? live?.last_trip,
    speed: speedKph ?? live?.speed,
    movement: extractAssetMovement(live),
    lat: live?.lat,
    lng: live?.lng,
    lastMoveAtMs: live?.lastMoveAtMs,
    telemetryAtMs: live?.telemetryAtMs,
    staleMinutes
  };
};

export const shouldShowAssetStatusDot = (asset: Record<string, unknown>): boolean => {
  if (!hasProvisionedImei(asset)) return false;

  const input = buildAssetStatusInput(asset);
  const lastSeenRaw = String(input.lastSeen ?? "").trim();
  if (lastSeenRaw && !Number.isNaN(parseTimestampMs(lastSeenRaw))) return true;

  const lastPositionRaw = String(input.lastPosition ?? "").trim();
  if (lastPositionRaw && !Number.isNaN(parseTimestampMs(lastPositionRaw))) return true;

  const telemetryAtMs = Number((asset as any)?.telemetryAtMs ?? Number.NaN);
  return Number.isFinite(telemetryAtMs);
};

export const resolveAssetDotStatus = (asset: Record<string, unknown>, staleMinutes = STALE_MINUTES): AssetDotStatus =>
  computeAssetDotStatus(buildAssetStatusInput(asset, staleMinutes));
