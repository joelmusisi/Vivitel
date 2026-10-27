export type FuelCalibrationPoint = {
  mv: number;
  liters: number;
};

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

export const serializeFuelCalibration = (value: unknown): string => {
  const points = normalizeFuelCalibration(value);
  return points.length ? JSON.stringify(points) : "";
};

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
