import type { TraccarTrip } from "../api";
import { endOfLocalDay, hoursToMs, minutesToMs, msToHours, startOfLocalDay } from "./format";
import { resolveBreakRules } from "./presets";
import type {
  DutySegment,
  DutyStatus,
  DriverHosStatus,
  HosAlert,
  HosFleetSnapshot,
  HosRules,
  HosTimeclockPunch,
  HosViolation
} from "./types";

const GAP_BREAK_MS = minutesToMs(15);
const GAP_OFF_MS = hoursToMs(1);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const BIWEEK_MS = 14 * 24 * 60 * 60 * 1000;

function driverKeyFromTrip(trip: TraccarTrip, fallbackDevice: string): string {
  const unique = String(trip.driverUniqueId ?? "").trim();
  if (unique) return `drv:${unique.toLowerCase()}`;
  const name = String(trip.driverName ?? "").trim();
  if (name) return `name:${name.toLowerCase()}`;
  return `device:${fallbackDevice}`;
}

function driverNameFromTrip(trip: TraccarTrip, assetLabel: string): string {
  return String(trip.driverName ?? "").trim() || assetLabel || `Device ${trip.deviceId}`;
}

function overlapMs(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function sumStatusMs(segments: DutySegment[], status: DutyStatus, fromMs: number, toMs: number): number {
  return segments.reduce((sum, seg) => {
    if (seg.status !== status) return sum;
    return sum + overlapMs(seg.startMs, seg.endMs, fromMs, toMs);
  }, 0);
}

function continuousDriveBefore(segments: DutySegment[], atMs: number): number {
  const driving = segments
    .filter((s) => s.status === "driving" && s.endMs <= atMs + 1)
    .sort((a, b) => b.endMs - a.endMs);
  if (!driving.length) return 0;
  let total = 0;
  let cursor = atMs;
  for (const seg of driving) {
    if (seg.endMs < cursor - GAP_BREAK_MS) break;
    total += Math.max(0, Math.min(seg.endMs, cursor) - seg.startMs);
    cursor = seg.startMs;
  }
  return total;
}

export function buildSegmentsFromTrips(input: {
  trips: TraccarTrip[];
  punches?: HosTimeclockPunch[];
  assetLabelByDeviceId?: Map<number, string>;
  fromMs: number;
  toMs: number;
}): DutySegment[] {
  const { trips, punches = [], assetLabelByDeviceId, fromMs, toMs } = input;
  const byDriver = new Map<string, { name: string; points: Array<{ ms: number; status: DutyStatus; source: DutySegment["source"]; asset?: string; deviceId?: number }> }>();

  const ensure = (key: string, name: string) => {
    if (!byDriver.has(key)) byDriver.set(key, { name, points: [] });
    return byDriver.get(key)!;
  };

  for (const trip of trips) {
    const startMs = Date.parse(String(trip.startTime ?? ""));
    const endMs = Date.parse(String(trip.endTime ?? ""));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    if (endMs < fromMs || startMs > toMs) continue;
    const deviceId = Number(trip.deviceId);
    const asset = assetLabelByDeviceId?.get(deviceId) || String(trip.deviceName ?? "").trim();
    const key = driverKeyFromTrip(trip, String(deviceId || "unknown"));
    const name = driverNameFromTrip(trip, asset);
    const bucket = ensure(key, name);
    bucket.points.push({ ms: Math.max(startMs, fromMs), status: "driving", source: "trip", asset, deviceId });
    bucket.points.push({ ms: Math.min(endMs, toMs), status: "off_duty", source: "trip", asset, deviceId });
  }

  for (const punch of punches) {
    const ms = Date.parse(String(punch.at ?? ""));
    if (!Number.isFinite(ms) || ms < fromMs || ms > toMs) continue;
    const key = String(punch.driverKey ?? "").trim();
    if (!key) continue;
    const bucket = ensure(key, punch.driverName || key);
    bucket.points.push({ ms, status: punch.status, source: "timeclock" });
  }

  const segments: DutySegment[] = [];
  for (const [driverKey, bucket] of byDriver) {
    const points = bucket.points.sort((a, b) => a.ms - b.ms || a.status.localeCompare(b.status));
    if (!points.length) continue;

    // Seed off-duty from window start until first point.
    let cursor = fromMs;
    let status: DutyStatus = "off_duty";
    let source: DutySegment["source"] = "inferred";
    let assetLabel = points[0]?.asset;
    let deviceId = points[0]?.deviceId;

    const pushSeg = (endMs: number) => {
      if (endMs <= cursor) return;
      segments.push({
        id: `${driverKey}-${cursor}-${endMs}-${status}`,
        driverKey,
        driverName: bucket.name,
        assetLabel,
        deviceId,
        status,
        startMs: cursor,
        endMs,
        source
      });
      cursor = endMs;
    };

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (point.ms > cursor) {
        // Infer gap status between trip end and next activity.
        const gap = point.ms - cursor;
        if (status === "driving") {
          pushSeg(cursor); // no-op guard
        }
        if (gap >= GAP_OFF_MS) {
          status = "off_duty";
          source = "gap";
        } else if (gap >= GAP_BREAK_MS) {
          status = "break";
          source = "gap";
        } else {
          status = "on_duty";
          source = "gap";
        }
        pushSeg(point.ms);
      }
      status = point.status;
      source = point.source;
      assetLabel = point.asset || assetLabel;
      deviceId = point.deviceId ?? deviceId;
    }
    if (cursor < toMs) {
      if (status === "driving") status = "off_duty";
      source = "inferred";
      pushSeg(toMs);
    }
  }

  return segments.sort((a, b) => a.startMs - b.startMs);
}

function evaluateDriver(input: {
  driverKey: string;
  driverName: string;
  segments: DutySegment[];
  rules: HosRules;
  dayFromMs: number;
  dayToMs: number;
  nowMs: number;
}): DriverHosStatus {
  const { driverKey, driverName, segments, rules, dayFromMs, dayToMs, nowMs } = input;
  const mine = segments.filter((s) => s.driverKey === driverKey);
  const assetLabel = mine.find((s) => s.assetLabel)?.assetLabel || "—";
  const deviceId = mine.find((s) => s.deviceId)?.deviceId;

  const driveMsToday = sumStatusMs(mine, "driving", dayFromMs, dayToMs);
  const onDutyMsToday =
    driveMsToday
    + sumStatusMs(mine, "on_duty", dayFromMs, dayToMs)
    + sumStatusMs(mine, "break", dayFromMs, dayToMs);
  const breakMsToday = sumStatusMs(mine, "break", dayFromMs, dayToMs);
  const offDutyMsToday = sumStatusMs(mine, "off_duty", dayFromMs, dayToMs) + sumStatusMs(mine, "sleeper", dayFromMs, dayToMs);

  const limits = rules.limits;
  const dailyDriveCapMs = hoursToMs(limits.dailyDriveHours);
  const dutyCapMs = hoursToMs(limits.dutyWindowHours || limits.dailyOnDutyHours || limits.dailyDriveHours + 3);
  const remainingDriveMs = Math.max(0, dailyDriveCapMs - driveMsToday);
  const remainingDutyMs = Math.max(0, dutyCapMs - onDutyMsToday);
  const nearFraction = Math.max(0.05, Math.min(0.5, limits.nearLimitFraction || 0.15));
  const nearLimit =
    remainingDriveMs <= dailyDriveCapMs * nearFraction
    || remainingDutyMs <= dutyCapMs * nearFraction;

  const lastBreak = [...mine].reverse().find((s) => s.status === "break" || s.status === "off_duty");
  const current = [...mine].reverse().find((s) => s.startMs <= nowMs && s.endMs >= nowMs)
    || [...mine].sort((a, b) => b.endMs - a.endMs)[0];
  const currentStatus: DutyStatus = current?.status || "off_duty";

  const violations: HosViolation[] = [];
  if (driveMsToday > dailyDriveCapMs) {
    violations.push({
      id: `${driverKey}-daily-drive`,
      driverKey,
      driverName,
      assetLabel,
      type: "daily_drive_limit",
      severity: "violation",
      message: `Daily driving exceeded ${limits.dailyDriveHours}h`,
      limitHours: limits.dailyDriveHours,
      actualHours: msToHours(driveMsToday),
      atMs: dayToMs
    });
  }
  if (limits.dutyWindowHours && onDutyMsToday > hoursToMs(limits.dutyWindowHours)) {
    violations.push({
      id: `${driverKey}-duty-window`,
      driverKey,
      driverName,
      assetLabel,
      type: "duty_window_limit",
      severity: "violation",
      message: `Duty window exceeded ${limits.dutyWindowHours}h`,
      limitHours: limits.dutyWindowHours,
      actualHours: msToHours(onDutyMsToday),
      atMs: dayToMs
    });
  }

  const breakRules = resolveBreakRules(limits);
  for (const rule of breakRules) {
    const continuous = continuousDriveBefore(mine, nowMs);
    if (continuous < hoursToMs(rule.afterDriveHours)) continue;
    const hadBreak = mine.some(
      (s) =>
        (s.status === "break" || s.status === "off_duty")
        && s.endMs >= nowMs - hoursToMs(rule.afterDriveHours)
        && s.endMs - s.startMs >= minutesToMs(rule.restMinutes)
    );
    if (hadBreak) continue;
    violations.push({
      id: `${driverKey}-break-${rule.afterDriveHours}-${rule.restMinutes}`,
      driverKey,
      driverName,
      assetLabel,
      type: "required_break",
      severity: "violation",
      message: `Break of ${rule.restMinutes} min required after ${rule.afterDriveHours}h driving`,
      limitHours: rule.afterDriveHours,
      actualHours: msToHours(continuous),
      atMs: nowMs
    });
  }

  if (limits.weeklyDriveHours && limits.weeklyDriveHours > 0) {
    const driveWeek = sumStatusMs(mine, "driving", nowMs - WEEK_MS, nowMs);
    if (driveWeek > hoursToMs(limits.weeklyDriveHours)) {
      violations.push({
        id: `${driverKey}-weekly-drive`,
        driverKey,
        driverName,
        assetLabel,
        type: "weekly_drive_limit",
        severity: "violation",
        message: `Weekly driving exceeded ${limits.weeklyDriveHours}h`,
        limitHours: limits.weeklyDriveHours,
        actualHours: msToHours(driveWeek),
        atMs: nowMs
      });
    }
  }

  if (limits.biweeklyDriveHours && limits.biweeklyDriveHours > 0) {
    const driveBiweek = sumStatusMs(mine, "driving", nowMs - BIWEEK_MS, nowMs);
    if (driveBiweek > hoursToMs(limits.biweeklyDriveHours)) {
      violations.push({
        id: `${driverKey}-biweekly-drive`,
        driverKey,
        driverName,
        assetLabel,
        type: "biweekly_drive_limit",
        severity: "violation",
        message: `Two-week driving exceeded ${limits.biweeklyDriveHours}h`,
        limitHours: limits.biweeklyDriveHours,
        actualHours: msToHours(driveBiweek),
        atMs: nowMs
      });
    }
  }

  if (limits.monthlyDriveHours && limits.monthlyDriveHours > 0) {
    const driveMonth = sumStatusMs(mine, "driving", nowMs - MONTH_MS, nowMs);
    if (driveMonth > hoursToMs(limits.monthlyDriveHours)) {
      violations.push({
        id: `${driverKey}-monthly-drive`,
        driverKey,
        driverName,
        assetLabel,
        type: "monthly_drive_limit",
        severity: "violation",
        message: `Monthly driving exceeded ${limits.monthlyDriveHours}h`,
        limitHours: limits.monthlyDriveHours,
        actualHours: msToHours(driveMonth),
        atMs: nowMs
      });
    }
  }

  if (limits.dailyRestHours > 0) {
    const restMs = offDutyMsToday;
    if (restMs + 1 < hoursToMs(limits.reducedDailyRestHours || limits.dailyRestHours) && driveMsToday > hoursToMs(1)) {
      // Soft warning when rest so far looks short during an active day.
      if (nearLimit || restMs < hoursToMs((limits.reducedDailyRestHours || limits.dailyRestHours) * 0.5)) {
        violations.push({
          id: `${driverKey}-rest-warning`,
          driverKey,
          driverName,
          assetLabel,
          type: "daily_rest_risk",
          severity: "warning",
          message: `Daily rest may fall short of ${limits.dailyRestHours}h`,
          limitHours: limits.dailyRestHours,
          actualHours: msToHours(restMs),
          atMs: nowMs
        });
      }
    }
  }

  return {
    driverKey,
    driverName,
    assetLabel,
    deviceId,
    currentStatus,
    driveMsToday,
    onDutyMsToday,
    breakMsToday,
    offDutyMsToday,
    remainingDriveMs,
    remainingDutyMs,
    lastBreakMs: lastBreak ? lastBreak.endMs : null,
    nearLimit: nearLimit && violations.every((v) => v.severity !== "violation"),
    compliant: violations.every((v) => v.severity !== "violation"),
    violations,
    segments: mine
  };
}

export function buildHosFleetSnapshot(input: {
  rules: HosRules;
  trips: TraccarTrip[];
  punches?: HosTimeclockPunch[];
  assetLabelByDeviceId?: Map<number, string>;
  fromMs: number;
  toMs: number;
  nowMs?: number;
  existingAlerts?: HosAlert[];
}): HosFleetSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const dayFromMs = startOfLocalDay(Math.min(nowMs, input.toMs));
  const dayToMs = endOfLocalDay(dayFromMs);
  const segments = buildSegmentsFromTrips({
    trips: input.trips,
    punches: input.punches,
    assetLabelByDeviceId: input.assetLabelByDeviceId,
    fromMs: input.fromMs,
    toMs: input.toMs
  });

  const driverKeys = Array.from(new Set(segments.map((s) => s.driverKey)));
  const drivers = driverKeys.map((driverKey) => {
    const sample = segments.find((s) => s.driverKey === driverKey);
    return evaluateDriver({
      driverKey,
      driverName: sample?.driverName || driverKey,
      segments,
      rules: input.rules,
      dayFromMs,
      dayToMs,
      nowMs
    });
  }).sort((a, b) => a.driverName.localeCompare(b.driverName));

  const violations = drivers.flatMap((d) => d.violations);
  const alertById = new Map((input.existingAlerts ?? []).map((a) => [a.id, a]));
  const alerts: HosAlert[] = violations.map((v) => {
    const existing = alertById.get(v.id);
    return {
      id: v.id,
      driverKey: v.driverKey,
      driverName: v.driverName,
      type: v.type,
      severity: v.severity === "violation" ? "high" : "medium",
      message: v.message,
      time: new Date(v.atMs).toISOString(),
      status: existing?.status ?? "open",
      atMs: v.atMs
    };
  });

  // Near-limit informational alerts
  for (const driver of drivers) {
    if (!driver.nearLimit || !driver.compliant) continue;
    const id = `${driver.driverKey}-near-limit`;
    const existing = alertById.get(id);
    alerts.push({
      id,
      driverKey: driver.driverKey,
      driverName: driver.driverName,
      type: "near_limit",
      severity: "low",
      message: "Approaching daily HOS limits",
      time: new Date(nowMs).toISOString(),
      status: existing?.status ?? "open",
      atMs: nowMs
    });
  }

  return {
    rules: input.rules,
    fromMs: input.fromMs,
    toMs: input.toMs,
    drivers,
    violations,
    alerts
  };
}
