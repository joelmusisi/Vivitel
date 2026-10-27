export type ReportOutputMode = "detailed" | "summary";

export const reportDetailOutputCategories = new Set([
  "Movement Reports",
  "Trip Reports",
  "Fuel Reports"
]);

export const defaultReportOutputMode = (reportName: string): ReportOutputMode => {
  const normalized = reportName.replace("Entered Fuel Report", "Fuel Refills").replace("Engine Hours Fuel Report", "Fuel Drop Report");
  if (/detailed/i.test(normalized)) return "detailed";
  if (
    /summary/i.test(normalized)
    || normalized === "Daily Movement Report"
    || normalized === "Movement Overview Report"
    || normalized === "Asset Utilisation Report"
    || normalized === "Comparative Fuel Report"
    || normalized === "Fuel Monthly Summary Report"
    || normalized === "Monthly Measured Fuel Report"
    || normalized === "Summary Measured Fuel Report"
    || normalized === "Fuel Operational Dashboard"
    || normalized === "Daily Engine Hours Fuel Report"
    || normalized === "Daily Fuel Notification Consumption Report"
  ) {
    return "summary";
  }
  return "detailed";
};

export const parseDurationHmsToMs = (value: string) => {
  const parts = String(value || "").trim().split(":").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return 0;
  return ((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1000;
};

export const sumDurationHms = (values: string[]) => {
  const totalMs = values.reduce((sum, value) => sum + parseDurationHmsToMs(value), 0);
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const formatMsAsHms = (durationMs: number) => {
  const totalSeconds = Math.floor(Math.max(0, durationMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const averageDurationHms = (values: string[]) => {
  if (values.length === 0) return "00:00:00";
  const totalMs = values.reduce((sum, value) => sum + parseDurationHmsToMs(value), 0);
  return formatMsAsHms(totalMs / values.length);
};
