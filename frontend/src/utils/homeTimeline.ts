import type { HomeDayPoint } from "./homeDashboardApi";

export type HomeTimelineMode = "day" | "week" | "month";

export type HomeTimeline = {
  buckets: HomeDayPoint[];
  bucketIndexByKey: Map<string, number>;
  mode: HomeTimelineMode;
};

const localIsoDay = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const weekStart = (date: Date) => {
  const cursor = new Date(date);
  cursor.setHours(0, 0, 0, 0);
  const weekday = cursor.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  cursor.setDate(cursor.getDate() + diff);
  return cursor;
};

const monthStart = (date: Date) => {
  const cursor = new Date(date.getFullYear(), date.getMonth(), 1);
  cursor.setHours(0, 0, 0, 0);
  return cursor;
};

const timelineModeForRange = (dayCount: number): HomeTimelineMode => {
  if (dayCount <= 14) return "day";
  if (dayCount <= 62) return "week";
  return "month";
};

const bucketLabel = (cursor: Date, mode: HomeTimelineMode, sameYear: boolean) => {
  if (mode === "day") {
    return cursor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
  }
  if (mode === "week") {
    const end = new Date(cursor);
    end.setDate(end.getDate() + 6);
    const startLabel = cursor.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const endLabel = end.toLocaleDateString("en-GB", {
      day: "numeric",
      month: end.getMonth() === cursor.getMonth() ? undefined : "short"
    });
    return `${startLabel}–${endLabel}`;
  }
  return cursor.toLocaleDateString("en-GB", {
    month: "short",
    year: sameYear ? undefined : "numeric"
  });
};

/** Build daily, weekly, or monthly buckets based on the selected date range length. */
export function buildHomeTimeline(fromDate: string, toDate: string): HomeTimeline {
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { buckets: [], bucketIndexByKey: new Map(), mode: "day" };
  }

  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  const mode = timelineModeForRange(dayCount);
  const sameYear = start.getFullYear() === end.getFullYear();
  const buckets: HomeDayPoint[] = [];
  const bucketIndexByKey = new Map<string, number>();

  let cursor =
    mode === "week" ? weekStart(start) : mode === "month" ? monthStart(start) : new Date(start);

  while (cursor.getTime() <= end.getTime() && buckets.length < 45) {
    const key =
      mode === "day"
        ? localIsoDay(cursor)
        : mode === "week"
          ? localIsoDay(cursor)
          : `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;

    if (!bucketIndexByKey.has(key)) {
      bucketIndexByKey.set(key, buckets.length);
      buckets.push({
        label: bucketLabel(cursor, mode, sameYear),
        value: 0
      });
    }

    if (mode === "day") cursor.setDate(cursor.getDate() + 1);
    else if (mode === "week") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }

  return { buckets, bucketIndexByKey, mode };
}

/**
 * Map a timestamp to the timeline bucket key for the active mode. With a time
 * zone, the calendar day is taken in that zone (the site's), not the browser's.
 */
export function homeTimelineBucketKey(date: Date, mode: HomeTimelineMode, timeZone?: string): string {
  const day = timeZone ? new Date(`${dayKeyInZone(date.getTime(), timeZone)}T00:00:00`) : date;
  if (mode === "day") return localIsoDay(day);
  if (mode === "week") return localIsoDay(weekStart(day));
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
}

const zonePartsFormatters = new Map<string, Intl.DateTimeFormat>();

const zoneParts = (ms: number, timeZone: string) => {
  let formatter = zonePartsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    zonePartsFormatters.set(timeZone, formatter);
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(ms))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts;
};

export const isValidTimeZone = (timeZone: string): boolean => {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
};

/** YYYY-MM-DD of a timestamp in the given IANA time zone. */
export const dayKeyInZone = (ms: number, timeZone: string): string => {
  const p = zoneParts(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

const zoneOffsetMs = (ms: number, timeZone: string) => {
  const p = zoneParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (ms - (((ms % 1000) + 1000) % 1000));
};

/** UTC ms of 00:00 on a calendar day (YYYY-MM-DD) in the given time zone. */
export const zonedMidnightMs = (day: string, timeZone: string): number => {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - zoneOffsetMs(guess, timeZone);
  return guess - zoneOffsetMs(first, timeZone);
};

const nextDayKey = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
};

/** Report window for a date range: from site-local 00:00 on the first day to 23:59:59.999 on the last. */
export function homeRangeBounds(fromDate: string, toDate: string, timeZone: string) {
  const startMs = zonedMidnightMs(fromDate, timeZone);
  const endMs = zonedMidnightMs(nextDayKey(toDate), timeZone) - 1;
  return { from: new Date(startMs).toISOString(), to: new Date(endMs).toISOString(), startMs, endMs };
}

/**
 * Standing time between two consecutive trips. Only a stop that starts and ends
 * on the same site-local day counts; overnight and multi-day parking is not
 * standing time (it would otherwise dominate the total).
 */
export function sameDayStandingMs(endMs: number, nextStartMs: number, timeZone: string): number {
  if (!Number.isFinite(endMs) || !Number.isFinite(nextStartMs) || nextStartMs <= endMs) return 0;
  if (dayKeyInZone(endMs, timeZone) !== dayKeyInZone(nextStartMs, timeZone)) return 0;
  return nextStartMs - endMs;
}
