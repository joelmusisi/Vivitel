export type FuelTrendPoint = {
  atMs: number;
  liters: number;
  /** Teltonika / Traccar ignition when known. Used to freeze dropouts around power transitions. */
  ignition?: boolean | null;
  /** True when the asset is moving / in trip. Meter is held while this is set. */
  moving?: boolean | null;
  /** True when ignition is off or external power is below cutoff. */
  powerCutoff?: boolean | null;
  /** Raw analogue sender millivolts (calibration-chart input). */
  millivolts?: number | null;
  /** Do not draw a line from the previous point. The tracker left a gap. */
  gapBefore?: boolean;
};

export type FuelChangePoint = FuelTrendPoint & {
  deltaLiters: number;
  rising: boolean;
  fromLevel: number;
  toLevel: number;
  lat?: number;
  lng?: number;
  locationName?: string;
};

export type StabilizedFuelTrend = {
  smoothed: FuelTrendPoint[];
  events: FuelChangePoint[];
  refuelCount: number;
  dropCount: number;
};

type FuelPlateau = {
  startMs: number;
  endMs: number;
  level: number;
  durationMs: number;
  pointCount: number;
};

const MEDIAN_WINDOW_MS = 8 * 60 * 1000;
const RESAMPLE_BUCKET_MS = 90 * 1000;
const PLATEAU_TOLERANCE_L = 2.5;
const HAMPEL_HALF_WINDOW = 5;
const HAMPEL_N_SIGMA = 2.8;
const SPIKE_THRESHOLD_L = 3;
const NEIGHBOR_TOLERANCE_L = 2;
const PLATEAU_MIN_POINTS = 4;
const PLATEAU_MIN_DURATION_MS = 4 * 60 * 1000;
const EVENT_MIN_LITERS = 8;
const EVENT_MIN_PLATEAU_MS = 5 * 60 * 1000;
/** Rising events shorter than this are splash/noise, not a refill. */
export const FUEL_REFILL_MIN_DURATION_MS = 3 * 60 * 1000;
/** Ignore analogue jitter smaller than this when deciding the meter can move. */
export const FUEL_VOLTAGE_CHANGE_MV = 50;

/** Treat as a dead/unpowered sender when the last valid level was still high. */
const FALSE_EMPTY_ABS_L = 3;
/** Sender min/empty often maps to 20–40 L after analog calibration, not 0. */
const SENSOR_FLOOR_RATIO = 0.15;
const MIN_BASELINE_L = 12;
/** Mid-level jump that snaps back is a sensor V, not consumption. */
const IMPLAUSIBLE_STEP_L = 15;
const RECOVERY_TOLERANCE_L = 10;
const RECOVERY_TOLERANCE_RATIO = 0.08;
/** Deep drop that later returns most of the way is a dropout, not theft + refill. */
const LARGE_DROPOUT_ABS_L = 50;
const LARGE_DROPOUT_RATIO = 0.18;
/**
 * Sudden analogue collapse vs last good sender (SHACKMAN IO6: ~2830 mV → 174 mV,
 * often partial-recovering to ~2200 mV). Relative so other tanks still work.
 */
const ANALOG_COLLAPSE_RATIO = 0.85;
const ANALOG_COLLAPSE_MIN_L = 15;
const ANALOG_COLLAPSE_MIN_MV = 250;
/** Collapse must stay down this long before we treat it as a real drain/theft. */
const ANALOG_COLLAPSE_ACCEPT_MS = 45 * 60 * 1000;
/** A tight new level (theft) is accepted sooner than a bouncing sender collapse. */
const ANALOG_COLLAPSE_STABLE_MS = 8 * 60 * 1000;
const ANALOG_COLLAPSE_STABLE_SPAN_L = 8;
/** Near-floor / huge V that returns to the prior level within this window is a dropout. */
const FALSE_EMPTY_RECOVERY_MS = 40 * 60 * 1000;
/** Non-zero spike that returns this quickly is noise; a longer new level is a real change. */
const TRANSIENT_SPIKE_MAX_MS = 4 * 60 * 1000;
const IGNITION_FREEZE_MS = 60 * 1000;
const IGNITION_FREEZE_DELTA_L = 8;

const median = (values: number[]): number => {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const isNearEmptyVsBaseline = (liters: number, baseline: number): boolean => {
  if (!(baseline >= MIN_BASELINE_L)) return false;
  const floor = Math.max(FALSE_EMPTY_ABS_L, baseline * SENSOR_FLOOR_RATIO);
  return liters <= floor;
};

const recoveryToleranceL = (baseline: number): number =>
  Math.max(RECOVERY_TOLERANCE_L, baseline * RECOVERY_TOLERANCE_RATIO);

const isCloseToBaseline = (liters: number, baseline: number): boolean =>
  Math.abs(liters - baseline) <= recoveryToleranceL(baseline);

const isLargeDropoutFromBaseline = (liters: number, baseline: number): boolean => {
  const drop = baseline - liters;
  if (drop < LARGE_DROPOUT_ABS_L) return false;
  return drop >= Math.max(LARGE_DROPOUT_ABS_L, baseline * LARGE_DROPOUT_RATIO);
};

const isRelativeCollapse = (current: number, baseline: number, minDrop: number): boolean => {
  if (!(baseline > 0) || !Number.isFinite(current) || current > baseline) return false;
  const drop = baseline - current;
  if (drop < minDrop) return false;
  return current <= baseline * ANALOG_COLLAPSE_RATIO;
};

const stillCollapsed = (
  point: FuelTrendPoint,
  baselineLiters: number,
  baselineMv: number | null
): boolean => {
  const litersCollapsed = isRelativeCollapse(point.liters, baselineLiters, ANALOG_COLLAPSE_MIN_L);
  const mv = typeof point.millivolts === "number" && Number.isFinite(point.millivolts) ? point.millivolts : null;
  const mvCollapsed =
    baselineMv != null && mv != null && isRelativeCollapse(mv, baselineMv, ANALOG_COLLAPSE_MIN_MV);
  return litersCollapsed || mvCollapsed;
};

const collapseHasStablePlateau = (
  points: FuelTrendPoint[],
  fromIdx: number,
  baselineLiters: number,
  baselineMv: number | null
): boolean => {
  const startMs = points[fromIdx].atMs;
  const window: FuelTrendPoint[] = [];
  for (let index = fromIdx; index < points.length; index += 1) {
    const candidate = points[index];
    if (candidate.atMs - startMs > ANALOG_COLLAPSE_STABLE_MS * 2) break;
    if (!stillCollapsed(candidate, baselineLiters, baselineMv)) return false;
    window.push(candidate);
  }
  if (window.length < 2) return false;
  const durationMs = window[window.length - 1].atMs - window[0].atMs;
  if (durationMs < ANALOG_COLLAPSE_STABLE_MS) return false;
  const liters = window.map((row) => row.liters);
  return Math.max(...liters) - Math.min(...liters) <= ANALOG_COLLAPSE_STABLE_SPAN_L;
};

const collapseAcceptedAsReal = (
  points: FuelTrendPoint[],
  fromIdx: number,
  baselineLiters: number,
  baselineMv: number | null
): boolean => {
  if (collapseHasStablePlateau(points, fromIdx, baselineLiters, baselineMv)) return true;
  const startMs = points[fromIdx].atMs;
  for (let index = fromIdx; index < points.length; index += 1) {
    const candidate = points[index];
    if (!stillCollapsed(candidate, baselineLiters, baselineMv)) return false;
    if (candidate.atMs - startMs >= ANALOG_COLLAPSE_ACCEPT_MS) return true;
  }
  return false;
};

const pickIgnition = (points: FuelTrendPoint[]): boolean | null | undefined => {
  for (const point of points) {
    if (point.ignition === true || point.ignition === false) return point.ignition;
  }
  return undefined;
};

const collectIgnitionEdges = (points: FuelTrendPoint[]): number[] => {
  const edges: number[] = [];
  let previous: boolean | null = null;
  for (const point of points) {
    if (point.ignition !== true && point.ignition !== false) continue;
    if (previous !== null && point.ignition !== previous) {
      edges.push(point.atMs);
    }
    previous = point.ignition;
  }
  return edges;
};

const nearIgnitionEdge = (atMs: number, edges: number[]): boolean =>
  edges.some((edge) => Math.abs(atMs - edge) <= IGNITION_FREEZE_MS);

const recoveryAtMs = (
  points: FuelTrendPoint[],
  fromIdx: number,
  baseline: number,
  maxMs: number
): number | null => {
  const startMs = points[fromIdx].atMs;
  for (let index = fromIdx + 1; index < points.length; index += 1) {
    const candidate = points[index];
    if (candidate.atMs - startMs > maxMs) return null;
    if (isCloseToBaseline(candidate.liters, baseline)) return candidate.atMs;
  }
  return null;
};

const isTransientDropout = (
  points: FuelTrendPoint[],
  fromIdx: number,
  baseline: number
): boolean => {
  const liters = points[fromIdx].liters;
  const sensorFloor = isNearEmptyVsBaseline(liters, baseline);
  const largeDrop = isLargeDropoutFromBaseline(liters, baseline);
  const maxMs = sensorFloor || largeDrop ? FALSE_EMPTY_RECOVERY_MS : TRANSIENT_SPIKE_MAX_MS;
  const recoveredAt = recoveryAtMs(points, fromIdx, baseline, maxMs);
  if (recoveredAt == null) return false;
  const awayMs = recoveredAt - points[fromIdx].atMs;
  return sensorFloor || largeDrop ? awayMs <= FALSE_EMPTY_RECOVERY_MS : awayMs <= TRANSIENT_SPIKE_MAX_MS;
};

/**
 * Drop telemetry Vs (sensor disconnect, ignition brown-out) and hold the last valid litres.
 * Real refuels and thefts stay: they settle at a new level instead of snapping back.
 */
export const holdLastValidFuelReadings = (points: FuelTrendPoint[]): FuelTrendPoint[] => {
  if (points.length < 2) return points;

  const edges = collectIgnitionEdges(points);
  const invalid = new Array<boolean>(points.length).fill(false);
  let lastValid: number | null = null;
  let lastValidMv: number | null = null;

  const readMv = (row: FuelTrendPoint): number | null =>
    typeof row.millivolts === "number" && Number.isFinite(row.millivolts) ? row.millivolts : null;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const liters = point.liters;
    const mv = readMv(point);

    if (lastValid === null) {
      const laterHigh = points
        .slice(index + 1)
        .find((candidate, offset, rest) => {
          if (candidate.liters - liters < LARGE_DROPOUT_ABS_L) return false;
          if (candidate.atMs - point.atMs > TRANSIENT_SPIKE_MAX_MS) return false;
          const following = rest.slice(offset + 1).filter((row) => row.atMs - candidate.atMs <= 15 * 60 * 1000);
          if (!following.length) return true;
          const settled = following.filter((row) => Math.abs(row.liters - candidate.liters) <= RECOVERY_TOLERANCE_L);
          return settled.length >= Math.ceil(following.length * 0.5);
        });
      const leadingDropout =
        laterHigh
        && (
          liters <= FALSE_EMPTY_ABS_L
          || isLargeDropoutFromBaseline(liters, laterHigh.liters)
          || isNearEmptyVsBaseline(liters, laterHigh.liters)
          || isRelativeCollapse(liters, laterHigh.liters, ANALOG_COLLAPSE_MIN_L)
        );
      if (leadingDropout) {
        invalid[index] = true;
        continue;
      }
      lastValid = liters;
      lastValidMv = mv;
      continue;
    }

    const baseline = lastValid;
    const delta = Math.abs(liters - baseline);
    const falseEmpty = isNearEmptyVsBaseline(liters, baseline);
    const ignitionOff = point.ignition === false;
    const inFreeze = nearIgnitionEdge(point.atMs, edges);
    const analogCollapse =
      isRelativeCollapse(liters, baseline, ANALOG_COLLAPSE_MIN_L)
      || (lastValidMv != null && mv != null && isRelativeCollapse(mv, lastValidMv, ANALOG_COLLAPSE_MIN_MV));

    if (falseEmpty && ignitionOff) {
      invalid[index] = true;
      continue;
    }

    if (inFreeze && delta >= IGNITION_FREEZE_DELTA_L) {
      invalid[index] = true;
      continue;
    }

    if (analogCollapse && !collapseAcceptedAsReal(points, index, baseline, lastValidMv)) {
      invalid[index] = true;
      continue;
    }

    if ((falseEmpty || delta >= IMPLAUSIBLE_STEP_L) && isTransientDropout(points, index, baseline)) {
      invalid[index] = true;
      continue;
    }

    lastValid = liters;
    if (mv != null) lastValidMv = mv;
  }

  const held: FuelTrendPoint[] = [];
  let fill: number | null = null;
  for (let index = 0; index < points.length; index += 1) {
    if (invalid[index]) {
      if (fill === null) continue;
      held.push({ ...points[index], liters: fill });
      continue;
    }
    fill = points[index].liters;
    held.push(points[index]);
  }
  return held;
};

const pickFlag = (
  points: FuelTrendPoint[],
  key: "moving" | "powerCutoff"
): boolean | null | undefined => {
  if (points.some((point) => point[key] === true)) return true;
  if (points.some((point) => point[key] === false)) return false;
  return undefined;
};

/**
 * Hold the last accepted tank litres while ignition is off or power is cut.
 * Do not freeze the whole trip while moving — these trucks often never park
 * with ignition on, and that made Fuel Used stay at 0 for 175 km days.
 * Slosh is removed later by median / Hampel, not by locking the first sample.
 */
export const holdFuelMeterForMotionAndPower = (points: FuelTrendPoint[]): FuelTrendPoint[] => {
  if (points.length < 2) return points;

  const isFrozen = (point: FuelTrendPoint) =>
    point.powerCutoff === true || point.ignition === false;

  const held: FuelTrendPoint[] = [];
  let heldLiters: number | null = null;
  let heldMv: number | null = null;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const freeze = isFrozen(point);
    const mv = typeof point.millivolts === "number" && Number.isFinite(point.millivolts)
      ? point.millivolts
      : null;

    if (heldLiters === null) {
      const laterPowered = points.slice(index + 1).some((candidate) => !isFrozen(candidate));
      if (freeze && laterPowered) continue;
      heldLiters = point.liters;
      heldMv = mv;
      held.push(point);
      continue;
    }

    if (freeze) {
      held.push({ ...point, liters: heldLiters });
      continue;
    }

    if (mv !== null && heldMv !== null && Math.abs(mv - heldMv) < FUEL_VOLTAGE_CHANGE_MV) {
      held.push({ ...point, liters: heldLiters });
      continue;
    }

    heldLiters = point.liters;
    if (mv != null) heldMv = mv;
    held.push(point);
  }

  return held.length ? held : points;
};

const prepareFuelTrendPoints = (raw: FuelTrendPoint[]): FuelTrendPoint[] => {
  const deduped = dedupeByTimestamp(raw);
  return holdLastValidFuelReadings(holdFuelMeterForMotionAndPower(deduped));
};

const dedupeByTimestamp = (points: FuelTrendPoint[]): FuelTrendPoint[] => {
  const byMs = new Map<number, FuelTrendPoint[]>();
  for (const point of points) {
    const bucket = byMs.get(point.atMs) ?? [];
    bucket.push(point);
    byMs.set(point.atMs, bucket);
  }
  return Array.from(byMs.entries())
    .map(([atMs, group]) => {
      const litersList = group.map((point) => point.liters);
      const peak = Math.max(...litersList);
      const kept =
        peak >= MIN_BASELINE_L
          ? litersList.filter((value) => !isNearEmptyVsBaseline(value, peak))
          : litersList;
      const liters = median(kept.length ? kept : litersList);
      const ignition = pickIgnition(group);
      const moving = pickFlag(group, "moving");
      const powerCutoff = pickFlag(group, "powerCutoff");
      const mvValues = group
        .map((point) => point.millivolts)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      const millivolts = mvValues.length ? median(mvValues) : undefined;
      return {
        atMs,
        liters,
        ...(ignition === undefined ? {} : { ignition }),
        ...(moving === undefined ? {} : { moving }),
        ...(powerCutoff === undefined ? {} : { powerCutoff }),
        ...(typeof millivolts === "number" ? { millivolts } : {})
      };
    })
    .sort((a, b) => a.atMs - b.atMs);
};

const removeSpikeOutliers = (points: FuelTrendPoint[]): FuelTrendPoint[] => {
  if (points.length < 3) return points;

  const values = points.map((point) => point.liters);
  for (let pass = 0; pass < 5; pass += 1) {
    for (let i = 1; i < points.length - 1; i += 1) {
      const prev = values[i - 1];
      const curr = values[i];
      const next = values[i + 1];
      const jumpIn = Math.abs(curr - prev);
      const jumpOut = Math.abs(next - curr);
      const baselineDelta = Math.abs(next - prev);

      if (
        jumpIn >= SPIKE_THRESHOLD_L &&
        jumpOut >= SPIKE_THRESHOLD_L &&
        baselineDelta <= NEIGHBOR_TOLERANCE_L
      ) {
        values[i] = (prev + next) / 2;
      }
    }
  }

  return points.map((point, index) => ({ ...point, liters: values[index] }));
};

const hampelFilter = (points: FuelTrendPoint[]): FuelTrendPoint[] => {
  if (points.length < 3) return points;

  return points.map((point, index) => {
    const start = Math.max(0, index - HAMPEL_HALF_WINDOW);
    const end = Math.min(points.length - 1, index + HAMPEL_HALF_WINDOW);
    const window = points.slice(start, end + 1).map((item) => item.liters);
    const med = median(window);
    const deviations = window.map((value) => Math.abs(value - med)).sort((a, b) => a - b);
    const mad = median(deviations);
    const scaledMad = mad > 0 ? mad * 1.4826 : 0;

    if (scaledMad > 0 && Math.abs(point.liters - med) > HAMPEL_N_SIGMA * scaledMad) {
      return { ...point, liters: med };
    }
    return point;
  });
};

const medianFilterByTime = (points: FuelTrendPoint[], halfWindowMs: number): FuelTrendPoint[] => {
  if (!points.length) return [];
  return points.map((point) => {
    const window = points.filter((candidate) => Math.abs(candidate.atMs - point.atMs) <= halfWindowMs);
    return { atMs: point.atMs, liters: median(window.map((item) => item.liters)) };
  });
};

const resampleToMinuteBuckets = (points: FuelTrendPoint[], bucketMs: number): FuelTrendPoint[] => {
  if (!points.length) return [];
  const buckets = new Map<number, number[]>();
  for (const point of points) {
    const key = Math.floor(point.atMs / bucketMs) * bucketMs;
    const bucket = buckets.get(key) ?? [];
    bucket.push(point.liters);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries())
    .map(([atMs, liters]) => ({ atMs, liters: median(liters) }))
    .sort((a, b) => a.atMs - b.atMs);
};

const segmentIntoPlateaus = (points: FuelTrendPoint[]): FuelPlateau[] => {
  if (!points.length) return [];

  const plateaus: FuelPlateau[] = [];
  let startIdx = 0;

  while (startIdx < points.length) {
    let endIdx = startIdx;
    while (endIdx + 1 < points.length) {
      const segment = points.slice(startIdx, endIdx + 2);
      const level = median(segment.map((point) => point.liters));
      const spread = Math.max(...segment.map((point) => Math.abs(point.liters - level)));
      if (spread <= PLATEAU_TOLERANCE_L) {
        endIdx += 1;
      } else {
        break;
      }
    }

    const segment = points.slice(startIdx, endIdx + 1);
    plateaus.push({
      startMs: segment[0].atMs,
      endMs: segment[segment.length - 1].atMs,
      level: median(segment.map((point) => point.liters)),
      durationMs: segment[segment.length - 1].atMs - segment[0].atMs,
      pointCount: segment.length
    });
    startIdx = endIdx + 1;
  }

  return plateaus;
};

const mergeShortPlateaus = (plateaus: FuelPlateau[]): FuelPlateau[] => {
  if (plateaus.length <= 1) return plateaus;

  const merged: FuelPlateau[] = [{ ...plateaus[0] }];
  for (let i = 1; i < plateaus.length; i += 1) {
    const prev = merged[merged.length - 1];
    const curr = plateaus[i];
    const gapMs = curr.startMs - prev.endMs;
    const levelClose = Math.abs(curr.level - prev.level) <= PLATEAU_TOLERANCE_L;
    const currShort = curr.durationMs < PLATEAU_MIN_DURATION_MS || curr.pointCount < PLATEAU_MIN_POINTS;
    const prevShort = prev.durationMs < PLATEAU_MIN_DURATION_MS || prev.pointCount < PLATEAU_MIN_POINTS;

    if (levelClose) {
      const totalPoints = prev.pointCount + curr.pointCount;
      const weightedLevel = (prev.level * prev.pointCount + curr.level * curr.pointCount) / totalPoints;
      prev.endMs = curr.endMs;
      prev.level = weightedLevel;
      prev.durationMs = prev.endMs - prev.startMs;
      prev.pointCount = totalPoints;
      continue;
    }

    if (
      currShort
      && gapMs <= RESAMPLE_BUCKET_MS * 2
      && Math.abs(curr.level - prev.level) < EVENT_MIN_LITERS
    ) {
      const totalPoints = prev.pointCount + curr.pointCount;
      const weightedLevel = (prev.level * prev.pointCount + curr.level * curr.pointCount) / totalPoints;
      prev.endMs = curr.endMs;
      prev.level = weightedLevel;
      prev.durationMs = prev.endMs - prev.startMs;
      prev.pointCount = totalPoints;
      continue;
    }

    if (prevShort && Math.abs(curr.level - prev.level) < EVENT_MIN_LITERS) {
      const totalPoints = prev.pointCount + curr.pointCount;
      prev.endMs = curr.endMs;
      prev.level = (prev.level * prev.pointCount + curr.level * curr.pointCount) / totalPoints;
      prev.durationMs = prev.endMs - prev.startMs;
      prev.pointCount = totalPoints;
      continue;
    }

    merged.push({ ...curr });
  }

  return merged;
};

const collapseRampPlateaus = (plateaus: FuelPlateau[]): FuelPlateau[] => {
  if (plateaus.length <= 2) return plateaus;

  const result: FuelPlateau[] = [plateaus[0]];
  for (let i = 1; i < plateaus.length; i += 1) {
    const prev = result[result.length - 1];
    const curr = plateaus[i];
    const delta = curr.level - prev.level;
    const next = i + 1 < plateaus.length ? plateaus[i + 1] : null;

    const isRampStep =
      Math.abs(delta) >= EVENT_MIN_LITERS / 2 &&
      curr.durationMs < 20 * 60 * 1000 &&
      next !== null &&
      Math.sign(next.level - curr.level) === Math.sign(delta) &&
      Math.abs(next.level - prev.level) > Math.abs(delta);

    if (isRampStep) continue;
    result.push({ ...curr });
  }

  return result;
};

const buildCollapsedPlateaus = (raw: FuelTrendPoint[]): FuelPlateau[] => {
  if (!raw.length) return [];

  const held = prepareFuelTrendPoints(raw);
  const despiked = removeSpikeOutliers(held);
  const hampel = hampelFilter(despiked);
  const filtered = medianFilterByTime(hampel, MEDIAN_WINDOW_MS / 2);
  const smoothed = resampleToMinuteBuckets(filtered, RESAMPLE_BUCKET_MS);
  const segmented = segmentIntoPlateaus(smoothed);
  const merged = mergeShortPlateaus(segmented);
  return collapseRampPlateaus(merged);
};

const medianOf = (values: number[]): number => median(values.filter((value) => Number.isFinite(value)));

/**
 * Build a tachograph-friendly clean line: sloped segments between refuel/drop
 * events with stepped transitions at each event. Intended for chart display
 * after "Remove noise" — not for event detection.
 */
export const buildCleanFuelTrendLine = (raw: FuelTrendPoint[]): FuelTrendPoint[] => {
  if (!raw.length) return [];
  if (raw.length === 1) return [...raw];

  const held = prepareFuelTrendPoints(raw);
  if (!held.length) return [];
  if (held.length === 1) return [...held];

  const startMs = held[0].atMs;
  const endMs = held[held.length - 1].atMs;
  const startLevel = medianOf(held.slice(0, Math.min(5, held.length)).map((point) => point.liters));
  const endLevel = medianOf(held.slice(-Math.min(5, held.length)).map((point) => point.liters));
  const { events } = stabilizeFuelTrend(raw);

  if (!events.length) {
    return [
      { atMs: startMs, liters: startLevel },
      { atMs: endMs, liters: endLevel }
    ];
  }

  const points: FuelTrendPoint[] = [{ atMs: startMs, liters: startLevel }];

  for (const event of events) {
    const last = points[points.length - 1];
    if (last.atMs < event.atMs) {
      points.push({ atMs: event.atMs, liters: event.fromLevel });
    } else {
      last.liters = event.fromLevel;
    }
    points.push({ atMs: event.atMs, liters: event.toLevel });
  }

  const last = points[points.length - 1];
  if (last.atMs < endMs) {
    points.push({ atMs: endMs, liters: endLevel });
  } else {
    last.liters = endLevel;
  }

  return points;
};

const CHART_BUCKET_MS = 90 * 1000;
const CHART_MEDIAN_MS = 4 * 60 * 1000;
/** Parked rise kept as fuel added. Smaller bumps stay off the graph. */
const CHART_ADDED_MIN_L = 8;
const CHART_ADDED_MIN_MS = 3 * 60 * 1000;
/** Parked drop kept as fuel drained. A longer fall is consumption, drawn as a slope. */
const CHART_DRAINED_MAX_MS = 20 * 60 * 1000;

const collapseFlatRuns = (points: FuelTrendPoint[]): FuelTrendPoint[] => {
  if (points.length < 3) return points;
  const kept: FuelTrendPoint[] = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = kept[kept.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const flat =
      Math.abs(current.liters - previous.liters) < 0.05
      && Math.abs(next.liters - current.liters) < 0.05;
    if (flat) continue;
    kept.push(current);
  }
  kept.push(points[points.length - 1]);
  return kept;
};

const resampleKeepingMotion = (points: FuelTrendPoint[], bucketMs: number): FuelTrendPoint[] => {
  if (!points.length) return [];
  const buckets = new Map<number, FuelTrendPoint[]>();
  for (const point of points) {
    const key = Math.floor(point.atMs / bucketMs) * bucketMs;
    const bucket = buckets.get(key) ?? [];
    bucket.push(point);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries())
    .map(([atMs, group]) => {
      const movingVotes = group.filter((point) => point.moving === true).length;
      const stoppedVotes = group.filter((point) => point.moving === false).length;
      const moving =
        movingVotes > stoppedVotes ? true : stoppedVotes > 0 ? false : undefined;
      const ignition = pickIgnition(group);
      return {
        atMs,
        liters: median(group.map((point) => point.liters)),
        ...(moving === undefined ? {} : { moving }),
        ...(ignition === undefined ? {} : { ignition })
      };
    })
    .sort((left, right) => left.atMs - right.atMs);
};

const smoothKeepingMotion = (points: FuelTrendPoint[]): FuelTrendPoint[] => {
  if (points.length < 2) return points;
  return points.map((point) => {
    const window = points.filter((candidate) => Math.abs(candidate.atMs - point.atMs) <= CHART_MEDIAN_MS);
    const movingVotes = window.filter((candidate) => candidate.moving === true).length;
    const stoppedVotes = window.filter((candidate) => candidate.moving === false).length;
    const moving =
      movingVotes > stoppedVotes ? true : stoppedVotes > 0 ? false : point.moving;
    return {
      ...point,
      liters: median(window.map((candidate) => candidate.liters)),
      ...(moving === undefined ? {} : { moving })
    };
  });
};

/** Fuel added while the asset is in trip is sender noise. Hold the last level instead. */
const suppressInTripAdditions = (points: FuelTrendPoint[]): FuelTrendPoint[] => {
  if (!points.length) return [];
  let level = points[0].liters;
  return points.map((point, index) => {
    if (index > 0 && point.moving === true && point.liters > level) {
      return { ...point, liters: level };
    }
    level = point.liters;
    return point;
  });
};

const stepEvent = (
  from: FuelTrendPoint,
  to: FuelTrendPoint,
  rising: boolean
): FuelChangePoint => {
  const delta = to.liters - from.liters;
  return {
    atMs: from.atMs,
    liters: to.liters,
    deltaLiters: delta,
    rising,
    fromLevel: from.liters,
    toLevel: to.liters,
    moving: false
  };
};

const parkedSteps = (
  points: FuelTrendPoint[]
): { refills: FuelChangePoint[]; drains: FuelChangePoint[] } => {
  const refills: FuelChangePoint[] = [];
  const drains: FuelChangePoint[] = [];
  let riseFrom: number | null = null;
  let fallFrom: number | null = null;

  const closeRise = (endIdx: number) => {
    if (riseFrom === null || endIdx <= riseFrom) {
      riseFrom = null;
      return;
    }
    const from = points[riseFrom];
    const to = points[endIdx];
    const delta = to.liters - from.liters;
    const durationMs = to.atMs - from.atMs;
    const parked = points.slice(riseFrom, endIdx + 1).every((point) => point.moving !== true);
    if (parked && delta >= CHART_ADDED_MIN_L && durationMs >= CHART_ADDED_MIN_MS) {
      refills.push(stepEvent(from, to, true));
    }
    riseFrom = null;
  };

  const closeFall = (endIdx: number) => {
    if (fallFrom === null || endIdx <= fallFrom) {
      fallFrom = null;
      return;
    }
    const from = points[fallFrom];
    const to = points[endIdx];
    const delta = to.liters - from.liters;
    const durationMs = to.atMs - from.atMs;
    const parked = points.slice(fallFrom, endIdx + 1).every((point) => point.moving !== true);
    if (parked && delta <= -CHART_ADDED_MIN_L && durationMs <= CHART_DRAINED_MAX_MS) {
      drains.push(stepEvent(from, to, false));
    }
    fallFrom = null;
  };

  for (let index = 1; index < points.length; index += 1) {
    const step = points[index].liters - points[index - 1].liters;
    const moving = points[index].moving === true || points[index - 1].moving === true;
    if (moving || step < -0.4) closeRise(index - 1);
    else if (step > 0.4 && riseFrom === null) riseFrom = index - 1;
    if (moving || step > 0.4) closeFall(index - 1);
    else if (step < -0.4 && fallFrom === null) fallFrom = index - 1;
  }
  closeRise(points.length - 1);
  closeFall(points.length - 1);
  return { refills, drains };
};

export type FuelChartModel = {
  line: FuelTrendPoint[];
  refills: FuelChangePoint[];
  drains: FuelChangePoint[];
};

/**
 * Litres to draw, plus the parked additions and drains on that same line.
 * Consumption is the slope. A fill or drain is a step. Rises while moving are omitted.
 */
export const buildFuelChartModel = (raw: FuelTrendPoint[]): FuelChartModel => {
  const prepared = prepareFuelTrendPoints(raw);
  if (prepared.length < 2) return { line: prepared, refills: [], drains: [] };
  const resampled = resampleKeepingMotion(prepared, CHART_BUCKET_MS);
  const smoothed = smoothKeepingMotion(resampled);
  const line = collapseFlatRuns(suppressInTripAdditions(smoothed));
  const { refills, drains } = parkedSteps(line);
  return { line, refills, drains };
};

/**
 * Chart line for the live-tracking fuel graph.
 * Downward movement stays a slope. Parked fills and drains stay steps.
 * Fuel added while moving is not drawn.
 */
export const buildStableFuelChartLine = (raw: FuelTrendPoint[]): FuelTrendPoint[] =>
  buildFuelChartModel(raw).line;
/** Smooth each connected run independently so a real data gap stays visible. */
export const buildFuelChartLinePreservingGaps = (raw: FuelTrendPoint[]): FuelTrendPoint[] => {
  if (!raw.length) return [];

  const result: FuelTrendPoint[] = [];
  let segment: FuelTrendPoint[] = [];
  const flush = () => {
    if (!segment.length) return;
    const line = buildCleanFuelTrendLine(segment);
    if (line.length && segment[0].gapBefore) {
      line[0] = { ...line[0], gapBefore: true };
    }
    result.push(...line);
    segment = [];
  };

  for (const point of raw) {
    if (point.gapBefore && segment.length) flush();
    segment.push(point);
  }
  flush();
  return result;
};

/** Sum contiguous downward runs on the plotted line (consumption + drains). */
const sumChartFallingRuns = (line: FuelTrendPoint[], minDropLiters = 1): number => {
  if (line.length < 2) return 0;
  let total = 0;
  let runStart = 0;
  const closeRun = (endIdx: number) => {
    const drop = line[runStart].liters - line[endIdx].liters;
    if (drop >= minDropLiters) total += drop;
  };
  for (let index = 1; index < line.length; index += 1) {
    const step = line[index].liters - line[index - 1].liters;
    if (step > 2.5) {
      closeRun(index - 1);
      runStart = index;
    }
  }
  closeRun(line.length - 1);
  return total;
};

/** In tank, consumed, added, and drained for the line that is actually plotted. */
export const fuelChartBalances = (model: FuelChartModel): {
  inTankL: number;
  consumedL: number;
  addedL: number;
  drainedL: number;
} => {
  const line = model.line.filter((point) => Number.isFinite(point.liters));
  if (!line.length) return { inTankL: 0, consumedL: 0, addedL: 0, drainedL: 0 };
  const startL = line[0].liters;
  const inTankL = line[line.length - 1].liters;
  const addedL = model.refills.reduce((sum, event) => sum + Math.abs(event.deltaLiters), 0);
  const drainedL = model.drains.reduce((sum, event) => sum + Math.abs(event.deltaLiters), 0);
  // Prefer cumulative falling runs so longer windows cannot under-count nested ones.
  const massBalanceL = Math.max(0, startL - inTankL + addedL - drainedL);
  const cumulativeL = Math.max(0, sumChartFallingRuns(line) - drainedL);
  const consumedL = Math.max(massBalanceL, cumulativeL);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    inTankL: round(inTankL),
    consumedL: round(consumedL),
    addedL: round(addedL),
    drainedL: round(drainedL)
  };
};

const detectEventsFromPlateaus = (plateaus: FuelPlateau[]): FuelChangePoint[] => {
  if (plateaus.length < 2) return [];

  const events: FuelChangePoint[] = [];
  for (let i = 1; i < plateaus.length; i += 1) {
    const previous = plateaus[i - 1];
    const current = plateaus[i];
    const delta = current.level - previous.level;

    if (Math.abs(delta) < EVENT_MIN_LITERS) continue;

    if (delta > 0) {
      const fillMs = Math.max(0, current.startMs - previous.endMs);
      if (fillMs < FUEL_REFILL_MIN_DURATION_MS) continue;
    }

    const previousStable =
      previous.durationMs >= EVENT_MIN_PLATEAU_MS || previous.pointCount >= PLATEAU_MIN_POINTS;
    const currentStable =
      current.durationMs >= EVENT_MIN_PLATEAU_MS || current.pointCount >= PLATEAU_MIN_POINTS;
    if (!previousStable || !currentStable) continue;

    events.push({
      atMs: current.startMs,
      liters: current.level,
      fromLevel: previous.level,
      toLevel: current.level,
      deltaLiters: delta,
      rising: delta > 0
    });
  }

  return events;
};

export const stabilizeFuelTrend = (raw: FuelTrendPoint[]): StabilizedFuelTrend => {
  if (!raw.length) {
    return { smoothed: [], events: [], refuelCount: 0, dropCount: 0 };
  }

  const held = prepareFuelTrendPoints(raw);
  const despiked = removeSpikeOutliers(held);
  const hampel = hampelFilter(despiked);
  const filtered = medianFilterByTime(hampel, MEDIAN_WINDOW_MS / 2);
  const smoothed = resampleToMinuteBuckets(filtered, RESAMPLE_BUCKET_MS);
  const collapsed = buildCollapsedPlateaus(raw);
  const events = detectEventsFromPlateaus(collapsed);

  return {
    smoothed,
    events,
    refuelCount: events.filter((event) => event.rising).length,
    dropCount: events.filter((event) => !event.rising).length
  };
};

/** Round chart axis bounds to readable liter steps. */
export const fuelAxisBounds = (values: number[], padRatio = 0.1): { min: number; max: number } => {
  if (!values.length) return { min: 0, max: 100 };
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, 8);
  const pad = Math.max(span * padRatio, 3);
  const step = span > 40 ? 5 : 2;
  const min = Math.max(0, Math.floor((low - pad) / step) * step);
  const max = Math.ceil((high + pad) / step) * step;
  return { min, max };
};

const NICE_FUEL_AXIS_MAXIMA = [
  50, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000
];

/** Tank-style Y max: always includes 0 and a round capacity ceiling. */
export const fuelReportAxisMax = (values: number[], tankCapacity?: number | null): number => {
  const finite = values.filter((value) => Number.isFinite(value));
  const dataMax = finite.length ? Math.max(...finite, 0) : 0;
  const cap = typeof tankCapacity === "number" && Number.isFinite(tankCapacity) && tankCapacity > 0
    ? tankCapacity
    : 0;
  const peak = Math.max(dataMax, cap, 50);
  return NICE_FUEL_AXIS_MAXIMA.find((value) => value >= peak) ?? Math.ceil(peak / 200) * 200;
};

export const fuelReportAxisBounds = (
  values: number[],
  tankCapacity?: number | null
): { min: number; max: number } => ({
  min: 0,
  max: fuelReportAxisMax(values, tankCapacity)
});

export const fuelReportYTicks = (max: number): number[] => {
  const ceiling = Number.isFinite(max) && max > 0 ? max : 100;
  const step = ceiling <= 100 ? 20 : ceiling <= 200 ? 50 : ceiling <= 600 ? 100 : ceiling <= 1200 ? 200 : 250;
  const ticks: number[] = [];
  for (let value = 0; value <= ceiling + 1e-9; value += step) {
    ticks.push(value);
  }
  if (ticks[ticks.length - 1] !== ceiling) ticks.push(ceiling);
  return ticks;
};

/** Straight segments so a refill step cannot bow into a spike. */
export const buildLinearSvgPath = (points: Array<{ x: number; y: number; gapBefore?: boolean }>): string => {
  if (!points.length) return "";
  const fmt = (value: number) => value.toFixed(2);
  return points
    .map((point, index) => `${index === 0 || point.gapBefore ? "M" : "L"}${fmt(point.x)} ${fmt(point.y)}`)
    .join(" ");
};

/** Catmull-Rom style cubic path for a report-like fuel area chart. */
export const buildSmoothSvgPath = (points: Array<{ x: number; y: number }>): string => {
  if (!points.length) return "";
  const fmt = (value: number) => value.toFixed(2);
  if (points.length === 1) return `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
  if (points.length === 2) {
    return `M${fmt(points[0].x)} ${fmt(points[0].y)} L${fmt(points[1].x)} ${fmt(points[1].y)}`;
  }

  let path = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return path;
};

/** Rapid fuel splash while moving: ≥ 2 L within 10 seconds. */
export const MOTION_FUEL_IGNORE_MIN_L = 2;
export const MOTION_FUEL_IGNORE_WINDOW_MS = 10_000;
