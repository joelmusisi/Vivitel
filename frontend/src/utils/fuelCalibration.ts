export type FuelCalibrationPoint = {
  mv: number;
  liters: number;
};

export type FuelCalibrationDraftPoint = {
  mv: string;
  liters: string;
};

export const emptyFuelCalibrationDraftPoint = (): FuelCalibrationDraftPoint => ({ mv: "", liters: "" });

const parseFinite = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const normalizeFuelCalibration = (value: unknown): FuelCalibrationPoint[] => {
  let rows: unknown[] = [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) rows = parsed;
    } catch {
      return [];
    }
  } else if (Array.isArray(value)) {
    rows = value;
  }

  const points: FuelCalibrationPoint[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const mv = parseFinite(record.mv ?? record.voltage ?? record.millivolts);
    const liters = parseFinite(record.liters ?? record.litres ?? record.l);
    if (typeof mv !== "number" || typeof liters !== "number" || mv < 0 || liters < 0) continue;
    const key = `${mv}:${liters}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push({ mv, liters });
  }
  return points.sort((a, b) => a.mv - b.mv || a.liters - b.liters);
};

export const hasUsableFuelCalibration = (value: unknown): boolean =>
  normalizeFuelCalibration(value).length >= 2;

const draftPointFromRecord = (row: Record<string, unknown>): FuelCalibrationDraftPoint => {
  const mvRaw = row.mv ?? row.voltage ?? row.millivolts;
  const litersRaw = row.liters ?? row.litres ?? row.l;
  return {
    mv: mvRaw === undefined || mvRaw === null ? "" : String(mvRaw),
    liters: litersRaw === undefined || litersRaw === null ? "" : String(litersRaw)
  };
};

/** Keep in-progress mV/litre cells. Normalization drops blanks and made the chart untypable. */
export const draftFuelCalibration = (value: unknown): FuelCalibrationDraftPoint[] => {
  if (Array.isArray(value) && value.some((row) => row && typeof row === "object")) {
    const drafts = value
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      .map((row) => draftPointFromRecord(row));
    if (drafts.length === 1) return [...drafts, emptyFuelCalibrationDraftPoint()];
    if (drafts.length >= 2) return drafts;
  }
  const points = normalizeFuelCalibration(value);
  if (!points.length) return [emptyFuelCalibrationDraftPoint(), emptyFuelCalibrationDraftPoint()];
  return points.map((point) => ({ mv: String(point.mv), liters: String(point.liters) }));
};

export const seedFuelCalibrationFromRange = (input: {
  analogMvMin?: string;
  analogMvMax?: string;
  tankCapacityMin?: string;
  tankCapacityMax?: string;
}): FuelCalibrationDraftPoint[] => {
  const minMv = parseFinite(input.analogMvMin) ?? 0;
  const maxMv = parseFinite(input.analogMvMax);
  const minLiters = parseFinite(input.tankCapacityMin) ?? 0;
  const maxLiters = parseFinite(input.tankCapacityMax);
  if (typeof maxMv !== "number" || maxMv <= 0 || typeof maxLiters !== "number" || maxLiters <= 0) {
    return draftFuelCalibration([]);
  }
  return [
    { mv: String(minMv), liters: String(minLiters) },
    { mv: String(maxMv), liters: String(maxLiters) }
  ];
};

export const serializeFuelCalibration = (value: unknown): string => {
  const points = normalizeFuelCalibration(value);
  return points.length ? JSON.stringify(points) : "";
};

export const interpolateFuelLitersFromCalibration = (
  millivolts: number,
  value: unknown
): number | undefined => {
  if (!Number.isFinite(millivolts)) return undefined;
  const points = normalizeFuelCalibration(value);
  if (points.length < 2) return undefined;
  if (millivolts <= points[0].mv) return points[0].liters;
  const last = points[points.length - 1];
  if (millivolts >= last.mv) return last.liters;

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (millivolts > to.mv) continue;
    const span = to.mv - from.mv;
    if (span <= 0) return from.liters;
    const ratio = (millivolts - from.mv) / span;
    return from.liters + ratio * (to.liters - from.liters);
  }
  return last.liters;
};

export const peakFuelCalibrationLiters = (value: unknown): number | undefined => {
  const points = normalizeFuelCalibration(value);
  if (!points.length) return undefined;
  return Math.max(...points.map((point) => point.liters));
};

export const peakFuelCalibrationMv = (value: unknown): number | undefined => {
  const points = normalizeFuelCalibration(value);
  if (!points.length) return undefined;
  return Math.max(...points.map((point) => point.mv));
};

/** Piecewise-linear Traccar JEXL from calibration points. */
export const buildFuelCalibrationJexlExpression = (voltageExpr: string, value: unknown): string => {
  const io = String(voltageExpr ?? "").trim();
  const points = normalizeFuelCalibration(value);
  if (!io || points.length < 2) return "null";

  const last = points[points.length - 1];
  let body = String(last.liters);
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const from = points[index];
    const to = points[index + 1];
    const span = to.mv - from.mv;
    const segment =
      span <= 0
        ? String(from.liters)
        : `(${from.liters} + ((${io} - ${from.mv}) * ${to.liters - from.liters}) / ${span})`;
    if (index === 0) {
      body = `(${io} <= ${from.mv} ? ${from.liters} : (${io} < ${to.mv} ? ${segment} : ${body}))`;
    } else {
      body = `(${io} < ${to.mv} ? ${segment} : ${body})`;
    }
  }
  return `(${io} != null ? ${body} : null)`;
};
