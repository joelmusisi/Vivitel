import type { ReportOutputMode } from "./reportDetailExport";

export type FuelReportKind =
  | "trip-detail"
  | "period-summary"
  | "monthly-summary"
  | "refills"
  | "drops"
  | "start-stop"
  | "engine-hours-daily"
  | "engine-hours-detail"
  | "comparative"
  | "fuel-notifications"
  | "dashboard";

const FUEL_REPORT_ALIASES: Record<string, string> = {
  "Entered Fuel Report": "Fuel Refills",
  "Engine Hours Fuel Report": "Fuel Drop Report"
};

export const FUEL_REPORT_NAMES = [
  "Comparative Fuel Report",
  "Daily Engine Hours Fuel Report",
  "Daily Fuel Notification Consumption Report",
  "Detailed Engine Hours Fuel Report",
  "Detailed Measured Fuel Report",
  "Fuel Drop Report",
  "Fuel Refills",
  "Fuel Start Stop",
  "Fuel Monthly Summary Report",
  "Fuel Operational Dashboard",
  "Measured Fuel Report",
  "Monthly Measured Fuel Report",
  "Summary Measured Fuel Report"
] as const;

export const normalizeFuelReportName = (reportName: string) =>
  FUEL_REPORT_ALIASES[reportName] ?? reportName;

export const resolveFuelReportKind = (
  reportName: string,
  outputMode: ReportOutputMode
): FuelReportKind => {
  const name = normalizeFuelReportName(reportName);

  if (name === "Fuel Refills") return "refills";
  if (name === "Fuel Drop Report") return "drops";
  if (name === "Fuel Start Stop") return "start-stop";
  if (name === "Comparative Fuel Report") return "comparative";
  if (name === "Daily Fuel Notification Consumption Report") return "fuel-notifications";
  if (name === "Fuel Operational Dashboard") return "dashboard";
  if (name === "Daily Engine Hours Fuel Report") return "engine-hours-daily";
  if (name === "Detailed Engine Hours Fuel Report") return "engine-hours-detail";
  if (name === "Fuel Monthly Summary Report" || name === "Monthly Measured Fuel Report") {
    return "monthly-summary";
  }
  if (/detailed.*measured/i.test(name) || name === "Detailed Measured Fuel Report") {
    return "trip-detail";
  }
  if (/summary.*measured/i.test(name) || name === "Summary Measured Fuel Report") {
    return "period-summary";
  }
  if (name === "Measured Fuel Report") {
    return outputMode === "summary" ? "period-summary" : "trip-detail";
  }

  return outputMode === "summary" ? "period-summary" : "trip-detail";
};

export const usesFuelDetailPreview = (kind: FuelReportKind) =>
  kind === "trip-detail"
  || kind === "refills"
  || kind === "drops"
  || kind === "start-stop"
  || kind === "engine-hours-detail";

export const fuelKindUsesSummaryFeed = (kind: FuelReportKind) =>
  kind === "period-summary"
  || kind === "monthly-summary"
  || kind === "comparative"
  || kind === "dashboard";

export const fuelReportColumns: Record<FuelReportKind, string[]> = {
  "trip-detail": ["Asset", "Trip Start", "Trip End", "Distance (km)", "Used Fuel (L)", "L/km", "Engine Hours"],
  "period-summary": ["Asset", "Period Start", "Period End", "Distance (km)", "Used Fuel (L)", "L/km", "Engine Hours"],
  "monthly-summary": ["Asset", "Month", "Distance (km)", "Used Fuel (L)", "L/km", "Engine Hours"],
  refills: ["Asset", "Date/Time", "Location", "Refill Volume (L)", "From Level", "To Level"],
  drops: ["Asset", "Date/Time", "Location", "Drop Volume (L)", "From Level", "To Level"],
  "start-stop": [
    "Asset",
    "Ignition On",
    "Fuel Start (L)",
    "Ignition Off",
    "Fuel Stop (L)",
    "Used (L)",
    "Start Location",
    "Stop Location"
  ],
  "engine-hours-daily": ["Asset", "Date", "Engine Hours", "Used Fuel (L)", "Distance (km)", "L/km"],
  "engine-hours-detail": ["Asset", "Trip Start", "Trip End", "Engine Hours", "Used Fuel (L)", "Distance (km)", "L/km"],
  comparative: ["Asset", "Distance (km)", "Used Fuel (L)", "L/km", "Engine Hours", "Efficiency Rank"],
  "fuel-notifications": ["Asset", "Date/Time", "Event Type", "Description", "Value"],
  dashboard: ["Metric", "Value", "Scope", "Notes"]
};

const fuelTotalsLayout: Partial<
  Record<FuelReportKind, { labelCols: number; distanceIdx: number; fuelIdx: number; hoursIdx?: number }>
> = {
  "trip-detail": { labelCols: 3, distanceIdx: 3, fuelIdx: 4, hoursIdx: 6 },
  "period-summary": { labelCols: 3, distanceIdx: 3, fuelIdx: 4, hoursIdx: 6 },
  "engine-hours-detail": { labelCols: 3, distanceIdx: 5, fuelIdx: 4, hoursIdx: 3 },
  "monthly-summary": { labelCols: 2, distanceIdx: 2, fuelIdx: 3, hoursIdx: 5 },
  "engine-hours-daily": { labelCols: 2, distanceIdx: 4, fuelIdx: 3, hoursIdx: 2 },
  comparative: { labelCols: 1, distanceIdx: 1, fuelIdx: 2, hoursIdx: 4 }
};

export const fuelKindShowsTripTotals = (kind: FuelReportKind) => kind in fuelTotalsLayout;

export const buildFuelTotalsRows = (
  kind: FuelReportKind,
  tableRows: string[][]
): { totals?: string[]; averages?: string[] } => {
  const layout = fuelTotalsLayout[kind];
  if (!layout || tableRows.length === 0) return {};

  const columns = fuelReportColumns[kind];
  const count = tableRows.length;
  const distanceIdx = layout.distanceIdx;
  const fuelIdx = layout.fuelIdx;
  const hoursIdx = layout.hoursIdx;
  const totalDistance = tableRows.reduce((sum, row) => sum + Number(row[distanceIdx] || 0), 0);
  const totalFuel = tableRows.reduce((sum, row) => sum + Number(row[fuelIdx] || 0), 0);
  const totalHours =
    hoursIdx != null
      ? tableRows.reduce((sum, row) => sum + Number(row[hoursIdx] || 0), 0)
      : 0;
  const efficiency = totalDistance > 0 ? (totalFuel / totalDistance).toFixed(3) : "0.000";
  const efficiencyIdx = columns.findIndex((column) => /l\/km/i.test(column));

  const totals = columns.map(() => "");
  totals[0] = "Totals";
  totals[distanceIdx] = totalDistance.toFixed(2);
  totals[fuelIdx] = totalFuel.toFixed(2);
  if (efficiencyIdx >= 0) totals[efficiencyIdx] = efficiency;
  if (hoursIdx != null) totals[hoursIdx] = totalHours.toFixed(2);

  const averages = columns.map(() => "");
  averages[0] = "Averages";
  averages[distanceIdx] = (totalDistance / count).toFixed(2);
  averages[fuelIdx] = (totalFuel / count).toFixed(2);
  if (efficiencyIdx >= 0) averages[efficiencyIdx] = efficiency;
  if (hoursIdx != null) averages[hoursIdx] = (totalHours / count).toFixed(2);

  return { totals, averages };
};
