import type { DutyStatus } from "./types";

const MS_HOUR = 3_600_000;
const MS_MINUTE = 60_000;

export const hoursToMs = (hours: number) => Math.max(0, Number(hours) || 0) * MS_HOUR;
export const minutesToMs = (mins: number) => Math.max(0, Number(mins) || 0) * MS_MINUTE;
export const msToHours = (ms: number) => Math.max(0, Number(ms) || 0) / MS_HOUR;

export function formatDurationMs(ms: number): string {
  const totalMins = Math.max(0, Math.round(Number(ms) || 0) / MS_MINUTE);
  const hours = Math.floor(totalMins / 60);
  const mins = Math.floor(totalMins % 60);
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

export function formatHoursDecimal(hours: number, digits = 1): string {
  if (!Number.isFinite(hours)) return "—";
  return `${hours.toFixed(digits)}h`;
}

export function dutyStatusLabel(status: DutyStatus): string {
  switch (status) {
    case "driving":
      return "Driving";
    case "on_duty":
      return "On duty";
    case "break":
      return "Break";
    case "sleeper":
      return "Sleeper";
    case "off_duty":
    default:
      return "Off duty";
  }
}

export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfLocalDay(ms: number): number {
  return startOfLocalDay(ms) + 24 * MS_HOUR - 1;
}
