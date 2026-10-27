/** Movement / last-move only count once speed is beyond this (km/h). */
export const MOVEMENT_MIN_SPEED_KPH = 5;

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim().replace(/km\/?h$/i, "").trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const parseSpeedKph = (value: unknown): number | undefined => toFiniteNumber(value);

export const isMovingSpeedKph = (speed: unknown): boolean => {
  const kph = parseSpeedKph(speed);
  return typeof kph === "number" && kph > MOVEMENT_MIN_SPEED_KPH;
};

export const movementFromSpeedKph = (speed: unknown): "moving" | "stationary" | undefined => {
  const kph = parseSpeedKph(speed);
  if (typeof kph !== "number") return undefined;
  return kph > MOVEMENT_MIN_SPEED_KPH ? "moving" : "stationary";
};

const normalizeSpeedToKph = (value: unknown, treatAsKnots: boolean): number | undefined => {
  const numeric = toFiniteNumber(value);
  if (typeof numeric !== "number") return undefined;
  const kph = treatAsKnots ? numeric * 1.852 : numeric;
  if (!Number.isFinite(kph) || kph < 0) return undefined;
  return kph;
};

const readIo = (payload: Record<string, unknown>) => {
  const latest = (payload as any)?.telemetryLatest;
  return (latest?.io ?? latest?.data?.io ?? (payload as any)?.io ?? {}) as Record<string, unknown>;
};

export const extractAssetSpeedKph = (payload: Record<string, unknown>): number | undefined => {
  const io = readIo(payload);

  const asKph = [
    (payload as any)?.speedKph,
    (payload as any)?.data?.speedKph,
    (payload as any)?.telemetryLatest?.data?.speedKph,
    io["Speed (km/h)"],
    io["GPS Speed"]
  ];
  for (const candidate of asKph) {
    const parsed = normalizeSpeedToKph(candidate, false);
    if (typeof parsed === "number") return parsed;
  }

  const asKnots = [
    (payload as any)?.position?.speed,
    (payload as any)?.raw?.speed,
    (payload as any)?.data?.raw?.speed,
    (payload as any)?.telemetryLatest?.raw?.speed
  ];
  for (const candidate of asKnots) {
    const parsed = normalizeSpeedToKph(candidate, true);
    if (typeof parsed === "number") return parsed;
  }

  const generic = [
    (payload as any)?.speed,
    (payload as any)?.data?.speed,
    (payload as any)?.telemetryLatest?.speed,
    io.Speed,
    io["Speed"],
    io.speed
  ];
  for (const candidate of generic) {
    const parsed = normalizeSpeedToKph(candidate, false);
    if (typeof parsed === "number") return parsed;
  }

  return undefined;
};

export const extractAssetMovement = (payload: Record<string, unknown>): string | undefined => {
  const io = readIo(payload);
  const raw = String(
    (payload as any)?.movement ??
      (payload as any)?.data?.movement ??
      (payload as any)?.telemetryLatest?.movement ??
      (payload as any)?.telemetryLatest?.data?.movement ??
      io.Motion ??
      io["Motion"] ??
      io.movement ??
      ""
  ).trim();
  return raw || undefined;
};
