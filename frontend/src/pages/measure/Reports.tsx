import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useSearchParams } from "react-router-dom";
import ScheduleDateTimePicker from "../../components/ScheduleDateTimePicker";
import { buildApiUrl, getApiKey, getAssetsFromApi, getGpsIotFuelInfo, getGpsIotMovementBundle, getHierarchy, getSiteTimeZoneSettings, getTraccarDevices, getTraccarEvents, getTraccarReportFailureCount, resolveTraccarDeviceIdsByUniqueId, getTraccarGeofences, getTraccarNotifications, getTraccarRoute, getTraccarStops, getTraccarSummary, getTraccarTrips, getUserAlertsFromApi, listGpsIotClientAlerts, listGpsIotEvents, listTraccarGeofenceDefinitions, formatTimestampForSite, resolveTimeZoneForSite, archiveReportRunToServer, getReportArchiveFromServer, listReportArchivesFromServer, type ReportArchiveSummary, type HierarchyRoot, type SiteTimeZoneSettings, type TraccarEvent, type TraccarSummary, type TraccarTrip } from "../../utils/api";
import { isCms808Server, isGpsIotServer } from "../../utils/regionServers";
import {
  cms808HierarchyActive,
  cms808SiteName,
  loadCms808Mileage,
  loadCms808MovementTrips,
  loadCms808VehiclesForActiveHierarchy,
  normalizeCms808MovementReportName,
  CMS808_KNOWN_VEHICLE
} from "../../utils/cms808";
import {
  formatGpsIotFuelStamp,
  gpsIotFuelEfficiencyLPerKm,
  parseGpsIotFuelDateMs,
  resolveGpsIotFuelAssetId
} from "../../utils/gpsiotFuel";
import { loadLocationGeofences, type LocationGeofence } from "../../utils/locationGeofences";
import { buildLocationToLocationLegs, resolveGeofenceShapes } from "../../utils/locationToLocation";
import { formatDurationMs, loadHosFleetSnapshot, msToHours } from "../../utils/hos";
import {
  isNotificationSummaryReportName,
  loadSiteLocationAlerts
} from "../../utils/locationAlertNotifications";
import { loadBoundNotificationOptionsForSite, loadNotificationLibraryItems } from "../../utils/notificationLibraryStore";
import ViviLogo from "../../components/ViviLogo";
import VTLoader from "../../components/VTLoader";
import ReportTrendSparkline from "../../components/ReportTrendSparkline";
import { brandLogoToDataUrl } from "../../utils/brandLogo";
import { readScopeNaming, readStoredSelectionScope } from "../../utils/selectionScope";
import { resolveAssetDriverName, resolveTripDriverName } from "../../utils/assetDriver";
import {
  averageDurationHms,
  defaultReportOutputMode,
  parseDurationHmsToMs,
  reportDetailOutputCategories,
  sumDurationHms,
  type ReportOutputMode
} from "../../utils/reportDetailExport";
import { addReportBrandBlock, applyWorksheetTableBorders, buildDetailReportExcelWorkbook, writeBrandedWorkbookBuffer, REPORT_BRAND_LABEL, styleTemplateRow, type DetailReportExportHeader } from "../../utils/reportExcelStyles";
import {
  applyDistanceCellStyle,
  applyUtilisationColumnStyle,
  classifyUtilisationPercent,
  createUtilisationDonutBase64
} from "../../utils/reportUtilisationExcel";
import { finishSampleTable, REPORT_NO_DATA_MESSAGE, writeSummaryTotalsRow } from "../../utils/reportSampleExcel";
import { readUserScopedJson, writeUserScopedJson, readActiveUserId, readActiveTenantId } from "../../utils/tenantContext";
import { computeTripUsedFuelLitres, extractFuelStartStopFromRoute, extractFuelTrendEventsFromRoute } from "../../utils/traccarFuel";
import {
  fuelKindShowsTripTotals,
  fuelReportColumns,
  buildFuelTotalsRows,
  normalizeFuelReportName,
  resolveFuelReportKind,
  type FuelReportKind
} from "../../utils/reportFuelProfiles";
import "../../index.css";

type FavoriteReport = {
  id: string;
  category: string;
  description: string;
  report: string;
  lastProcessed: string;
};

type SubscriptionItem = {
  id: string;
  report: string;
  category: string;
  description: string;
  basis: "asset" | "driver";
  target: string;
  schedule: string;
  format: string;
  dateRange: string;
  recipients: string[];
  emailSubject: string;
  nextRunAt: string;
  status: string;
  createdAt: string;
};

type ContactItem = {
  id: string;
  firstName: string;
  lastName: string;
  employer: string;
  position: string;
  email: string;
  mobile: string;
};

type RunAction = "view" | "download";
type DownloadFormat = "excel" | "pdf" | "csv";

type ReportExportRow = {
  category: string;
  report: string;
  metric: string;
  value: string;
  change: string;
  scope: string;
  basis: string;
  target: string;
  dateRange: string;
  assetDescription?: string;
  registrationNumber?: string;
  eventDescription?: string;
  startDate?: string;
  startTime?: string;
  endTime?: string;
  occurrences?: string;
  eventValue?: string;
  totalDuration?: string;
  locationName?: string;
  driverName?: string;
  distanceKm?: string;
  speedKph?: string;
  actionDecision?: string;
  actionNote?: string;
  actionedByName?: string;
  actionedByEmail?: string;
  trendSeries?: number[];
  /** Trip-backed rows: one row per trip ("tripDetail") or per asset ("tripSummary"). */
  rowKind?: "tripDetail" | "tripSummary";
  startLocation?: string;
  endLocation?: string;
  avgSpeedKph?: string;
  fuelUsedL?: string;
};

type MovementReportVariant = "detailed" | "location";

type MovementAssetSection = {
  assetDescription: string;
  registrationNumber: string;
  assetId: string;
  siteName: string;
  rows: string[][];
  totals?: string[];
  averages?: string[];
};

type FuelAssetSection = {
  assetDescription: string;
  registrationNumber: string;
  assetId: string;
  siteName: string;
  rows: string[][];
  totals?: string[];
  averages?: string[];
};

const FUEL_TRIP_SECTION_COLUMNS = [
  "Trip Start",
  "Trip End",
  "Distance (km)",
  "Used Fuel (L)",
  "L/km",
  "Engine Hours"
] as const;

type MovementReportPreview = {
  variant: MovementReportVariant;
  columns: string[];
  sections: MovementAssetSection[];
  reportName: string;
  organisation: string;
  dealer: string;
  database: string;
  site: string;
  registration: string;
  dateRange: string;
};

const DETAILED_MOVEMENT_TABLE_COLUMNS = [
  "Departure Date",
  "Driver",
  "Departure Time",
  "Departed From",
  "Driving Time (hh:mm:ss)",
  "Distance (km)",
  "Max Speed (km/h)",
  "Arrival Time",
  "Arrived At",
  "Next Departure",
  "Standing Time at Location (hh:mm:ss)"
] as const;

const LOCATION_VISIT_COLUMNS = [
  "Asset Description",
  "Registration Number",
  "Driver Name",
  "Site",
  "Start Time and Date",
  "Start Location",
  "End Time and Date",
  "End Location",
  "Time Zone",
  "Time At Location"
] as const;

/** Location to Location: legs between geofenced locations (trip start/end points vs geofence areas). */
const LOCATION_TO_LOCATION_COLUMNS = [
  "Asset Description",
  "Registration Number",
  "Driver Name",
  "Site",
  "From Location",
  "Departed",
  "To Location",
  "Arrived",
  "Distance (km)",
  "Duration (hh:mm:ss)",
  "Driving Time (hh:mm:ss)",
  "Stops En Route",
  "Avg Speed (km/h)",
  "Max Speed (km/h)"
] as const;

const formatTripTimeZoneLabel = (value: string | number | Date, site?: string, settings?: SiteTimeZoneSettings | null) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const formatted = formatTimestampForSite(date.toISOString(), site, settings);
  const parts = formatted.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : (resolveTimeZoneForSite(site, settings) || "—");
};

const buildDetailedMovementTotalsRow = (
  label: "Totals" | "Averages",
  drivingTime: string,
  distanceKm: string,
  standingTime: string
) => ([
  label,
  "",
  "",
  "",
  drivingTime,
  distanceKm,
  "",
  "",
  "",
  "",
  standingTime
]);

const formatNextDepartureLabel = (value: string | number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const datePart = formatDateOnly(date);
  const timePart = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return `${datePart} ${timePart}`;
};

const summarizeDetailedMovementSection = (
  metrics: Array<{ drivingMs: number; distanceKm: number; standingMs: number }>
) => {
  const count = metrics.length;
  if (count === 0) {
    return {
      totals: buildDetailedMovementTotalsRow("Totals", "00:00:00", "0.00", "00:00:00"),
      averages: buildDetailedMovementTotalsRow("Averages", "00:00:00", "0.00", "00:00:00")
    };
  }
  const totalDrivingMs = metrics.reduce((sum, item) => sum + item.drivingMs, 0);
  const totalDistanceKm = metrics.reduce((sum, item) => sum + item.distanceKm, 0);
  const totalStandingMs = metrics.reduce((sum, item) => sum + item.standingMs, 0);
  return {
    totals: buildDetailedMovementTotalsRow(
      "Totals",
      formatDurationHms(totalDrivingMs),
      totalDistanceKm.toFixed(2),
      formatDurationHms(totalStandingMs)
    ),
    averages: buildDetailedMovementTotalsRow(
      "Averages",
      formatDurationHms(totalDrivingMs / count),
      (totalDistanceKm / count).toFixed(2),
      formatDurationHms(totalStandingMs / count)
    )
  };
};

const summarizeFuelTripSection = (rows: string[][]) => {
  const count = rows.length;
  const emptyTotals = ["Totals", "", "0.00", "0.00", "0.000", "0.00"];
  const emptyAverages = ["Averages", "", "0.00", "0.00", "0.000", "0.00"];
  if (count === 0) {
    return { totals: emptyTotals, averages: emptyAverages };
  }
  const totalDistance = rows.reduce((sum, row) => sum + Number(row[2] || 0), 0);
  const totalFuel = rows.reduce((sum, row) => sum + Number(row[3] || 0), 0);
  const totalHours = rows.reduce((sum, row) => sum + Number(row[5] || 0), 0);
  const efficiency = totalDistance > 0 ? (totalFuel / totalDistance).toFixed(3) : "0.000";
  return {
    totals: ["Totals", "", totalDistance.toFixed(2), totalFuel.toFixed(2), efficiency, totalHours.toFixed(2)],
    averages: [
      "Averages",
      "",
      (totalDistance / count).toFixed(2),
      (totalFuel / count).toFixed(2),
      efficiency,
      (totalHours / count).toFixed(2)
    ]
  };
};

type TripDetailRow = {
  assetLabel: string;
  registration?: string;
  assetId?: string;
  siteName?: string;
  driver?: string;
  startLocation?: string;
  endLocation?: string;
  date: string;
  tripStart: string;
  tripEnd: string;
  standingPct: string;
  drivingTime: string;
  standingTime: string;
  duration: string;
  distanceKm: string;
  avgSpeedKph: string;
  maxSpeedKph: string;
};

/** Detailed Trip Report table (preview + export). */
const TRIP_DETAIL_COLUMNS = [
  "Date",
  "Driver",
  "Trip Start",
  "Start Location",
  "Trip End",
  "End Location",
  "Standing Time %",
  "Driving Time (hh:mm:ss)",
  "Standing Time (hh:mm:ss)",
  "Duration (hh:mm:ss)",
  "Distance (km)",
  "Avg. Speed (km/h)",
  "Max Speed (km/h)"
] as const;

const tripDetailRowCells = (row: TripDetailRow) => ([
  row.date,
  row.driver || "Unknown",
  row.tripStart,
  row.startLocation || "—",
  row.tripEnd,
  row.endLocation || "—",
  row.standingPct,
  row.drivingTime,
  row.standingTime,
  row.duration,
  row.distanceKm,
  row.avgSpeedKph,
  row.maxSpeedKph
]);

const tripDetailSummaryCells = (label: "Totals" | "Averages", summary: TripDetailSummary) => ([
  label,
  "",
  "",
  "",
  "",
  "",
  summary.standingPct,
  summary.drivingTime,
  summary.standingTime,
  summary.duration,
  summary.distanceKm,
  summary.avgSpeedKph,
  summary.maxSpeedKph
]);

/** Asset block labels shown above each asset's table (matches the MiX-style Daily Movement layout). */
const assetSectionInfo = (section: {
  assetDescription: string;
  registrationNumber: string;
  assetId: string;
  siteName: string;
}): Array<[string, string]> => ([
  ["Asset Description", section.assetDescription],
  ["Registration Number", section.registrationNumber],
  ["Asset ID", section.assetId],
  ["Site Name", section.siteName]
]);

type TripDetailSummary = {
  standingPct: string;
  drivingTime: string;
  standingTime: string;
  duration: string;
  distanceKm: string;
  avgSpeedKph: string;
  maxSpeedKph: string;
};

type TripDetailPreview = {
  kind: "trip";
  reportName: string;
  organisation: string;
  dealer: string;
  database: string;
  site: string;
  dateRange: string;
  rows: TripDetailRow[];
  totals: TripDetailSummary;
  averages: TripDetailSummary;
};

type FuelDetailPreview = {
  kind: "fuel";
  fuelKind: FuelReportKind;
  columns: string[];
  tableRows: string[][];
  sections?: FuelAssetSection[];
  showSectioned?: boolean;
  totals?: string[];
  averages?: string[];
  showTotals: boolean;
  reportName: string;
  organisation: string;
  dealer: string;
  database: string;
  site: string;
  dateRange: string;
};

type UtilisationDetailPreview = {
  kind: "utilisation";
  columns: string[];
  tableRows: string[][];
  reportName: string;
  organisation: string;
  dealer: string;
  database: string;
  site: string;
  dateRange: string;
};

type DetailReportPreview =
  | ({ kind: "movement" } & MovementReportPreview)
  | TripDetailPreview
  | FuelDetailPreview
  | UtilisationDetailPreview;

type LastRunSnapshot = {
  reportName: string;
  dateRange: string;
  recordCount: number;
  scopeLabel: string;
  runBasis: RunBasis;
};

function countReportResultRows(rows: ReportExportRow[], detail: DetailReportPreview | null): number {
  if (!detail) return rows.length;
  if (detail.kind === "movement") {
    return detail.sections.reduce((sum, section) => sum + section.rows.length, 0);
  }
  if (detail.kind === "trip") {
    return detail.rows.length;
  }
  if (detail.kind === "fuel") {
    return detail.tableRows.length;
  }
  if (detail.kind === "utilisation") {
    return detail.tableRows.length;
  }
  return rows.length;
}

type AssetLike = {
  registration?: string;
  imei?: string;
  traccarDeviceId?: number;
  assetId?: string | number;
  id?: string;
};

const reportCategories = [
  "Cost Reports",
  "Custom Reports",
  "Dashboard Widgets",
  "Notification Reports",
  "Fuel Reports",
  "Hours Of Service Reports",
  "Routes Reports",
  "List Reports",
  "Materials Handling Reports",
  "Movement Reports",
  "Pre Production",
  "RAG Reports",
  "Risk Controlment Reports",
  "D-Track Reports",
  "Scoring Reports",
  "Trailer Reports",
  "Trip Reports"
];

/** Categories shown in the report suite UI (legacy pre-production reports stay in catalog only). */
const visibleReportCategories = reportCategories.filter((category) => category !== "Pre Production");

const NotificationReports = [
  "Notifications Report",
  "Detailed Notification Report",
  "Notification Location Summary Report",
  "Streams Action Report",
  "Overview Notification Report",
  "Summary Notification Report",
  "Terminal Notification Report"
];

const notificationTypeOptions = [
  { value: "ignitionOn", label: "Ignition On" },
  { value: "ignitionOff", label: "Ignition Off" },
  { value: "geofenceEnter", label: "Geofence Enter" },
  { value: "geofenceExit", label: "Geofence Exit" },
  { value: "alarm", label: "Alarm" },
  { value: "overspeed", label: "Overspeed" },
  { value: "deviceOnline", label: "Device Online" },
  { value: "deviceOffline", label: "Device Offline" },
  { value: "harshAcceleration", label: "Harsh Acceleration" },
  { value: "harshBraking", label: "Harsh Braking" },
  { value: "harshCornering", label: "Harsh Cornering" }
];

const costReports = [
  "Cost per Distance Report",
  "Service History Report"
];

const customReports = [
  "Executive Operations Summary",
  "Driver Utilisation Benchmark",
  "Client SLA Exception Report"
];

const dashboardWidgets = [
  "7 Day Dashboard",
  "Asset Performance Dashboard Report",
  "Road Speed Limit Dashboard"
];

const fuelReports = [
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
];

const hoursOfServiceReports = [
  "Daily Hours Of Service Report",
  "Driver Rest Compliance Report",
  "Hours Of Service Violations Report"
];

const journeyControlmentReports = [
  "Routes Summary Report",
  "Routes Exceptions Report",
  "Routes Dwell Time Report"
];

const listReports = [
  "Asset Configuration Report",
  "Asset Devices Configuration Report",
  "Asset Notifications Configuration Report",
  "Asset List by Data Downloaded Report",
  "Asset List By Unit Type Report",
  "Asset List Report",
  "Asset Manager Diagnostic Report",
  "Current Mobile Status Report",
  "Driver Certification Validity Report",
  "Driver Licence Validity Report",
  "Driver List Report",
  "Info Hub Notification Report",
  "Job Detail Report",
  "Summary and Detailed Task Report by Template and Date",
  "Timezone Changelog Report"
];

const materialsHandlingReports = [
  "Materials Handling Daily Trip Report",
  "Materials Handling Daily Utilisation Report",
  "Materials Handling Detailed Trip Report",
  "Materials Handling Notification Detail Report",
  "Materials Handling Notification Overview Report",
  "Materials Handling Notification Summary Report",
  "Materials Handling Impact Analysis Report",
  "Materials Handling Impact Notification Report",
  "Materials Handling Machine List Report",
  "Materials Handling Machine Performance Summary Report",
  "Materials Handling Monthly Hour Usage Report",
  "Materials Handling Monthly Trip Report",
  "Materials Handling Operator List Report",
  "Materials Handling Summary Trip Report"
];

const movementReports = [
  "Daily Movement Report",
  "Location Overview Report",
  "Location to Location Report",
  "Location Visits By day Of Week Report",
  "Locations Not Visited Report",
  "Mileage Daily Monthly Report",
  "Mileage Detail Report",
  "Mileage Monthly Report",
  "Mileage Summary Report",
  "Movement Overview Report",
  "Summary Movement Report"
];

/** CMS 808 Mileage Report menu → VIVI Movement Report categories. */
const cms808MileageToMovement: Record<string, string> = {
  "Mileage Summary Report": "Summary Movement Report",
  "Mileage Monthly Report": "Summary Movement Report",
  "Mileage Daily Monthly Report": "Daily Movement Report",
  "Mileage Detail Report": "Movement Overview Report"
};

const resolveMovementReportName = (reportName: string) => {
  const normalized = normalizeCms808MovementReportName(reportName);
  return cms808MileageToMovement[normalized] || cms808MileageToMovement[reportName] || normalized || reportName;
};

const movementLocationReports = new Set<string>([
  "Location Overview Report",
  "Location to Location Report",
  "Location Visits By day Of Week Report",
  "Locations Not Visited Report"
]);

const isUtilisationReportName = (name: string) => /utili[sz]ation|utili[sz]e/i.test(name);
const isDriverPerformanceReportName = (name: string) => /driver\s*performance|driving\s*performance|driver\s*score|scorecard|driver\s*rating|driver\s*debrief/i.test(name);

type BandThresholds = {
  greenMin: number;
  umberMin: number;
};

const defaultUtilisationThresholds: BandThresholds = {
  greenMin: 75,
  umberMin: 45
};

const defaultDriverThresholds: BandThresholds = {
  greenMin: 80,
  umberMin: 55
};

const thresholdProfiles: Array<{ pattern: RegExp; utilisation?: BandThresholds; driver?: BandThresholds }> = [
  {
    pattern: /shoprite/i,
    utilisation: { greenMin: 82, umberMin: 60 },
    driver: { greenMin: 85, umberMin: 62 }
  },
  {
    pattern: /fleetco/i,
    utilisation: { greenMin: 78, umberMin: 52 },
    driver: { greenMin: 82, umberMin: 58 }
  },
  {
    pattern: /materials\s*handling/i,
    utilisation: { greenMin: 70, umberMin: 40 },
    driver: { greenMin: 78, umberMin: 50 }
  },
  {
    pattern: /trailer/i,
    utilisation: { greenMin: 72, umberMin: 42 },
    driver: { greenMin: 80, umberMin: 55 }
  }
];

const resolveBandThresholds = (
  reportName: string,
  category: string,
  mode: "utilisation" | "driver"
): BandThresholds => {
  const source = `${reportName} ${category}`;
  for (const profile of thresholdProfiles) {
    if (!profile.pattern.test(source)) continue;
    if (mode === "utilisation" && profile.utilisation) return profile.utilisation;
    if (mode === "driver" && profile.driver) return profile.driver;
  }
  return mode === "utilisation" ? defaultUtilisationThresholds : defaultDriverThresholds;
};

const toBand = (value: number, thresholds: BandThresholds) => {
  if (value >= thresholds.greenMin) return "Green";
  if (value >= thresholds.umberMin) return "Umber";
  return "Red";
};

const bandColor = (band: string) => {
  if (/^green$/i.test(band)) return "#16a34a";
  if (/^umber$/i.test(band)) return "#b45309";
  if (/^red$/i.test(band)) return "#dc2626";
  return "#64748b";
};

const summaryReports = new Set<string>([
  "Summary Trip Report",
  "Asset Performance Summary Report",
  "Asset Utilisation Report",
  "Summary Movement Report",
  "Daily Movement Report",
  "Comparative Fuel Report",
  "Fuel Monthly Summary Report",
  "Summary Measured Fuel Report",
  "Asset Performance Dashboard Report",
  "7 Day Dashboard",
  "Road Speed Limit Dashboard",
  "Cost per Distance Report",
  "Executive Operations Summary",
  "Driver Utilisation Benchmark",
  "Client SLA Exception Report",
  "Trailer Summary Report",
  "Materials Handling Machine Performance Summary Report",
  "Materials Handling Monthly Hour Usage Report"
]);

const fuelSummaryBackedReports = new Set<string>([
  ...fuelReports,
  "Entered Fuel Report",
  "Engine Hours Fuel Report"
]);

const hoursOfServiceEventBackedReports = new Set<string>([
  "Daily Hours Of Service Report",
  "Driver Rest Compliance Report",
  "Hours Of Service Violations Report"
]);

const scoringEventBackedCategories = new Set<string>([
  "Scoring Reports",
  "RAG Reports",
  "Risk Controlment Reports",
  "D-Track Reports"
]);

const isTripBackedCategory = (category: string, reportName: string) => {
  if (category === "Trip Reports") return true;
  if (category === "Trailer Reports" && /trip|utili[sz]/i.test(reportName)) return true;
  if (category === "Materials Handling Reports" && /trip/i.test(reportName)) return true;
  return false;
};

const isNotificationBackedCategory = (category: string, reportName: string) => {
  if (category === "Notification Reports") return true;
  if (category === "Risk Controlment Reports") return true;
  if (category === "D-Track Reports") return true;
  if (category === "Materials Handling Reports" && /notification|impact/i.test(reportName)) return true;
  return false;
};

const isListBackedCategory = (category: string) => category === "List Reports";

const isCostOrCustomCategory = (category: string) => category === "Cost Reports" || category === "Custom Reports";

const preProductionReports = [
  "Collection and Delivery Timeline Report",
  "Daily Movement Report ( XLS ERROR)",
  "Debrief Lite Report",
  "Debrief Report",
  "Driving Hours Exceptions Summary",
  "Entry And Exit Notification Duration Report",
  "Executive KPI Dashboard",
  "Executive KPI Dashboard Preprod",
  "Fleet Controlr Exceptional Report",
  "Fleetco Movement Report",
  "Fuel Usage By Trip Report",
  "Geo Fence Report",
  "IFTA State Miles Report ( Legacy)",
  "Routes Distance Driven",
  "Materials Handling Monthly Hour Usage Report",
  "PDI Clocking Report",
  "Round Trip Time Report",
  "Scania Demo Report",
  "Service Reminder Report",
  "Shoprite Monthly Utilization Dashboard",
  "Summary pack page 3",
  "Summary pack page 4",
  "Task Template Report",
  "Temperature Analysis",
  "Tollgate Drivethrough Report",
  "topbottom10 Drivers drill",
  "Total - Base Violation Report",
  "Total - Continuous Driving Summary Report",
  "Total Energies - Violations Classification Report",
  "Trip Notifications By Week Part Report"
];

const ragReports = [
  "Augmented Daily RAG Report",
  "Augmented Summary RAG Report",
  "Driver Behaviour Report",
  "RAG Daily Report",
  "Rag Plus Daily Report",
  "RAG Summary Report",
  "RAG Year to Date Report"
];

const riskControlmentReports = [
  "Collision Notification Report",
  "Collision Prevention Report",
  "Driver Hours Out of Shift Report"
];

const dTrackReports = [
  "D-Track Custom Driver Input Report"
];

const scoringReports = [
  "Advanced Scoring Report",
  "Daily Driving Performance Report",
  "Detailed Driving Performance Report",
  "Driver Debrief Report",
  "Driver Rating Detail Report",
  "Driver Rating Report",
  "Driver Scorecard Report",
  "Flexible Driver Scorecard Daily Report",
  "Flexible Driver Scorecard Report",
  "Flexible RAG Daily Report",
  "Flexible RAG Monthly Report",
  "Flexible RAG Summary Report",
  "Flexible RAG Year To Date Report",
  "Monthly Driving Performance Report",
  "Monthly Trend Report",
  "Standard Scoring and Driving Errors Trend Report",
  "Standard Scoring Report",
  "Summary Driving Performance Report"
];

const trailerReports = [
  "Trailer Summary Report",
  "Trailer Utilization Report"
];

const tripReports = [
  "Asset Performance Summary Report",
  "Asset Utilisation Report",
  "Daily Trip Report",
  "Daily Utilisation Report",
  "Detailed Trip Report",
  "Location Trip Report",
  "Logbook Report",
  "Monthly Trip Report",
  "Summary Trip Report"
];

const reportOptionsByCategory: Record<string, string[]> = {
  "Cost Reports": costReports,
  "Custom Reports": customReports,
  "Dashboard Widgets": dashboardWidgets,
  "Notification Reports": NotificationReports,
  "Fuel Reports": fuelReports,
  "Hours Of Service Reports": hoursOfServiceReports,
  "Routes Reports": journeyControlmentReports,
  "List Reports": listReports,
  "Materials Handling Reports": materialsHandlingReports,
  "Movement Reports": movementReports,
  "Pre Production": preProductionReports,
  "RAG Reports": ragReports,
  "Risk Controlment Reports": riskControlmentReports,
  "D-Track Reports": dTrackReports,
  "Scoring Reports": scoringReports,
  "Trailer Reports": trailerReports,
  "Trip Reports": tripReports
};

const reportLabelByCategory: Record<string, string> = {
  "Cost Reports": "cost report",
  "Custom Reports": "custom report",
  "Dashboard Widgets": "dashboard widget",
  "Notification Reports": "notification report",
  "Fuel Reports": "fuel report",
  "Hours Of Service Reports": "hours of service report",
  "Routes Reports": "Routes report",
  "List Reports": "list report",
  "Materials Handling Reports": "materials handling report",
  "Movement Reports": "movement report",
  "Pre Production": "pre production report",
  "RAG Reports": "RAG report",
  "Risk Controlment Reports": "risk controlment report",
  "D-Track Reports": "D-Track report",
  "Scoring Reports": "scoring report",
  "Trailer Reports": "trailer report",
  "Trip Reports": "trip report"
};

const legacyCategoryAliases: Record<string, string> = {
  "Routes Management Reports": "Routes Reports",
  "Risk Management Reports": "Risk Controlment Reports",
  "D-Monitor Reports": "D-Track Reports"
};

const normalizeCategory = (category: string | null | undefined) => {
  if (!category) return "";
  return legacyCategoryAliases[category] ?? category;
};

const normalizeFavorite = (favorite: FavoriteReport): FavoriteReport => ({
  ...favorite,
  category: normalizeCategory(favorite.category) || findCategoryForReport(favorite.report)
});

const normalizeSubscription = (subscription: SubscriptionItem): SubscriptionItem => ({
  ...subscription,
  category: normalizeCategory(subscription.category) || findCategoryForReport(subscription.report)
});

const findCategoryForReport = (report: string) => (
  reportCategories.find((category) => reportOptionsByCategory[category]?.includes(report)) ?? "Cost Reports"
);

const LEGACY_SEED_FAVORITE_IDS = new Set(["fav-1", "fav-2", "fav-3", "fav-4"]);

const isLegacySeedFavorites = (items: FavoriteReport[]) =>
  items.length > 0 && items.length <= LEGACY_SEED_FAVORITE_IDS.size && items.every((item) => LEGACY_SEED_FAVORITE_IDS.has(item.id));

const FAVORITES_STORAGE_KEY = "vivi.reports.favorites";
const SUBSCRIPTIONS_STORAGE_KEY = "vivi.reports.subscriptions";
const CONTACTS_STORAGE_KEY = "vivi.reports.contacts";

const formatUtcDateTime = (value: Date) => {
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())} (UTC)`;
};

const reportUiNotes: Record<string, string> = {
  "Scoring Reports": "Score and driver behavior exports use the structured workbook layout and live trip/event data for the selected scope.",
  "Trip Reports": "Trip exports use structured workbook layouts populated from live telematics data for the selected scope and dates.",
  "Notification Reports": "Select at least one event type before running. Data is loaded from VIVI event reports for the selected assets and date range.",
  "Movement Reports": "Movement reports map CMS 808 Mileage Report categories (Summary, Detail, Daily/Monthly) onto VIVI movement outputs and stay route-focused for the selected scope.",
  "Fuel Reports": "Fuel selections use the operational metrics layout populated from live telematics data for the selected scope.",
  "Routes Reports": "Routes reports combine live VIVI trips, geofence visits, and dwell metrics for the selected scope.",
  "List Reports": "List reports export asset, driver, and notification configuration pulled from VIVI fleet records.",
  "Cost Reports": "Cost reports use VIVI summary distance and fuel metrics for the selected period.",
  "Custom Reports": "Custom executive summaries aggregate VIVI trips, events, and utilisation for the selected scope."
};

type DatePreset = "today" | "yesterday" | "last7" | "last30" | "custom";
type RunBasis = "asset" | "driver";
type ReportDatePickerTarget = "from" | "to";
type ReportDatePickerMode = "date" | "time";

const datePresetButtons: Array<{ key: DatePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "last30", label: "Last 30 Days" },
  { key: "custom", label: "Custom" }
];

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

type ReportScopeNode = { assets: string[]; drivers: string[] };
type ReportScopeHierarchy = Record<string, Record<string, ReportScopeNode>>;

const emptyReportScopeHierarchy: ReportScopeHierarchy = {};

const normalizeScopeLabel = (value: unknown) => String(value ?? "").trim();

const readAccessScope = () => {
  const selection = readStoredSelectionScope();
  const rawActiveSite =
    typeof window !== "undefined"
      ? String(window.localStorage.getItem("vivi.activeSite") ?? "").trim()
      : "";
  return {
    scope: selection.scope,
    activeDbId: selection.activeDbId,
    activeSite: rawActiveSite || selection.activeSite,
    allowedSites: selection.activeDbSites,
  };
};

const extractDriverName = (asset: any) => resolveAssetDriverName(asset);

const readCachedDealerRows = (): any[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("vivi.org.dealers");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const isSiteAllowedForReports = (
  siteName: string,
  allowedSiteSet: Set<string>,
  activeSite: string,
  scope: string
) => {
  const normalized = siteName.toLowerCase();
  if (allowedSiteSet.size > 0) return allowedSiteSet.has(normalized);
  // When site-scoped without a db site list, keep isolation to the active site.
  if ((scope === "site" || scope === "asset") && activeSite) {
    return normalized === activeSite.toLowerCase();
  }
  return true;
};

const findSiteKey = (sites: Record<string, ReportScopeNode>, siteName: string) => {
  const normalized = siteName.toLowerCase();
  return Object.keys(sites).find((key) => key.toLowerCase() === normalized) ?? "";
};

const buildReportScopeHierarchy = (hierarchy: HierarchyRoot | null | undefined, rawAssets: any[]): ReportScopeHierarchy => {
  const next: ReportScopeHierarchy = {};
  const { scope, activeDbId, activeSite, allowedSites } = readAccessScope();
  const allowedSiteSet = new Set(allowedSites.map((s) => s.toLowerCase()).filter(Boolean));
  const naming = readScopeNaming();
  const namingDatabase = normalizeScopeLabel(naming.database);

  const ensureDb = (dbName: string) => {
    if (!next[dbName]) next[dbName] = {};
    return next[dbName];
  };

  const ensureSite = (dbName: string, siteName: string) => {
    if (!siteName || !isSiteAllowedForReports(siteName, allowedSiteSet, activeSite, scope)) return;
    const sites = ensureDb(dbName);
    const existing = findSiteKey(sites, siteName);
    if (!existing) sites[siteName] = { assets: [], drivers: [] };
  };

  const ingestDealerRows = (dealers: any[]) => {
    for (const dealer of dealers) {
      const organisations = Array.isArray(dealer?.organisations) ? dealer.organisations : [];
      for (const org of organisations) {
        const databases = Array.isArray(org?.databases) ? org.databases : [];
        for (const db of databases) {
          const dbId = normalizeScopeLabel(db?.id);
          const dbName = normalizeScopeLabel(db?.name);
          if (!dbName) continue;
          if (activeDbId && dbId && dbId !== activeDbId) continue;
          const sites = Array.isArray(db?.sites) ? db.sites : [];
          for (const site of sites) {
            ensureSite(dbName, normalizeScopeLabel(site?.name));
          }
          // Databases with no configured sites still need a selectable Default site.
          if (sites.length === 0) ensureSite(dbName, "Default");
        }
      }
    }
  };

  ingestDealerRows(Array.isArray(hierarchy?.dealers) ? hierarchy.dealers : []);
  // Hierarchy API can lag local org ribbon state — always merge the cached dealer tree.
  ingestDealerRows(readCachedDealerRows());

  const dbKeys = Object.keys(next);
  const preferredDbName =
    (namingDatabase && dbKeys.find((name) => name.toLowerCase() === namingDatabase.toLowerCase()))
    || (dbKeys.length === 1 ? dbKeys[0] : "")
    || namingDatabase
    || dbKeys[0]
    || "Database";

  // Seed sites from the active database site list written by the org ribbon.
  for (const siteName of allowedSites) {
    ensureSite(preferredDbName, normalizeScopeLabel(siteName));
  }
  if (activeSite) ensureSite(preferredDbName, normalizeScopeLabel(activeSite));
  if (Object.keys(next[preferredDbName] ?? {}).length === 0 && (activeDbId || namingDatabase || allowedSites.length > 0 || scope === "db" || scope === "site" || scope === "asset")) {
    ensureSite(preferredDbName, "Default");
  }

  const assets = Array.isArray(rawAssets) ? rawAssets : [];
  for (const asset of assets) {
    const siteName = normalizeScopeLabel(asset?.site) || "Default";
    const registration = normalizeScopeLabel(asset?.registration) || normalizeScopeLabel(asset?.assetDescription) || normalizeScopeLabel(asset?.name);
    const driver = extractDriverName(asset);
    const assetDb = normalizeScopeLabel(asset?.database);

    for (const [dbName, sites] of Object.entries(next)) {
      if (assetDb && Object.keys(next).length > 1 && assetDb.toLowerCase() !== dbName.toLowerCase()) continue;
      if (!isSiteAllowedForReports(siteName, allowedSiteSet, activeSite, scope)) continue;
      let siteKey = findSiteKey(sites, siteName);
      if (!siteKey) {
        // Derive missing sites from asset tags so the dropdown is never empty for live fleets.
        ensureSite(dbName, siteName);
        siteKey = findSiteKey(next[dbName] ?? {}, siteName);
      }
      if (!siteKey) continue;
      const node = next[dbName][siteKey];
      if (registration && !node.assets.includes(registration)) node.assets.push(registration);
      if (driver && !node.drivers.includes(driver)) node.drivers.push(driver);
    }
  }

  for (const [dbName, sites] of Object.entries(next)) {
    for (const [siteName, node] of Object.entries(sites)) {
      next[dbName][siteName] = {
        assets: [...node.assets].sort((a, b) => a.localeCompare(b)),
        drivers: [...node.drivers].sort((a, b) => a.localeCompare(b))
      };
    }
  }

  return next;
};

const toDateTimeLocal = (value: Date) => {
  const pad = (v: number) => String(v).padStart(2, "0");
  const y = value.getFullYear();
  const m = pad(value.getMonth() + 1);
  const d = pad(value.getDate());
  const h = pad(value.getHours());
  const min = pad(value.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
};

const formatReportDateTime = (value: string | number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).replace(",", "");
};

const formatDateOnly = (value: string | number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
};

const formatTimeOnly = (value: string | number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
};

const formatDurationHms = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const reportToDayKey = (value: unknown) => {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
};

const computeTripDrivingDurationMs = (trip: {
  duration?: unknown;
  startTime?: unknown;
  endTime?: unknown;
}) => {
  const tripDuration = Number(trip.duration ?? 0);
  if (tripDuration > 0) return tripDuration;
  const startMs = Date.parse(String(trip.startTime ?? ""));
  const endMs = Date.parse(String(trip.endTime ?? trip.startTime ?? ""));
  return Number.isFinite(endMs) && Number.isFinite(startMs) && endMs > startMs ? endMs - startMs : 0;
};

const buildDailyDistanceTrend = (
  trips: Array<{ startTime?: unknown; distance?: unknown }>,
  dayKeys: string[],
  distanceNormalizer: (value: unknown) => number
) => {
  const daily = new Map(dayKeys.map((key) => [key, 0]));
  for (const trip of trips) {
    const key = reportToDayKey(trip.startTime);
    if (!key || !daily.has(key)) continue;
    daily.set(key, (daily.get(key) ?? 0) + distanceNormalizer(trip.distance));
  }
  return dayKeys.map((key) => daily.get(key) ?? 0);
};

const isAssetSummaryReportView = (
  category: string,
  reportName: string,
  useDetailPreview: boolean,
  basis: string,
  outputMode: ReportOutputMode
) => {
  if (useDetailPreview) return false;
  if (basis !== "asset") return false;
  if (isUtilisationReportName(reportName)) return false;
  if (isDriverPerformanceReportName(reportName)) return false;
  if (category === "Notification Reports") return false;
  // Scoring/RAG/Risk/D-Track are event-backed (Traccar Events → Notification scoring).
  if (scoringEventBackedCategories.has(category)) return false;
  // Movement reports are trip-backed (Traccar Trips). Keep only Summary Movement on the asset-summary grid.
  // CMS 808 Mileage Summary / Monthly map onto the same summary grid.
  if (category === "Movement Reports") {
    const resolved = resolveMovementReportName(reportName);
    if (resolved !== "Summary Movement Report" && reportName !== "Summary Movement Report") return false;
  }
  if (isListBackedCategory(category)) return false;
  if (movementLocationReports.has(reportName)) return false;
  if (category === "Routes Reports") return false;
  if (category === "Fuel Reports" && outputMode === "detailed") return false;
  return true;
};

/** Trip and summary distances are metres on every source (Traccar, GPS IoT, CMS 808). */
const normalizeReportedDistanceKm = (value: unknown) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric / 1000;
};

const buildAssetSummaryExportRow = ({
  registration,
  assetDescription,
  siteName,
  trips,
  dayKeys,
  category,
  report,
  basis,
  dateRange,
  summary
}: {
  registration: string;
  assetDescription?: string;
  siteName: string;
  trips: Array<{ startTime?: unknown; distance?: unknown; duration?: unknown; endTime?: unknown }>;
  dayKeys: string[];
  category: string;
  report: string;
  basis: string;
  dateRange: string;
  /** GPS IoT GetDailySummary / ClientAssetsMileage — preferred for Summary Movement. */
  summary?: TraccarSummary | null;
}): ReportExportRow => {
  const summaryDistanceKm = summary ? normalizeReportedDistanceKm(summary.distance) : 0;
  const tripDistanceKm = trips.reduce((sum, trip) => sum + normalizeReportedDistanceKm(trip.distance), 0);
  const totalDistanceKm = summaryDistanceKm > 0 ? summaryDistanceKm : tripDistanceKm;
  const summaryDrivingMs = summary && Number(summary.engineHours) > 0
    ? Number(summary.engineHours) * 3_600_000
    : 0;
  const tripDrivingMs = trips.reduce((sum, trip) => sum + computeTripDrivingDurationMs(trip), 0);
  const totalDrivingMs = summaryDrivingMs > 0 ? summaryDrivingMs : tripDrivingMs;
  const drivingHours = formatDurationHms(totalDrivingMs);
  const tripCount = summary && Number.isFinite(Number(summary.tripCount))
    ? Math.max(0, Math.round(Number(summary.tripCount)))
    : trips.length;
  const trendSeries = trips.length > 0
    ? buildDailyDistanceTrend(trips, dayKeys, normalizeReportedDistanceKm)
    : dayKeys.map((key, index) => (index === dayKeys.length - 1 || dayKeys.length === 1 ? totalDistanceKm : 0));
  return {
    category,
    report,
    metric: registration,
    value: String(tripCount),
    change: drivingHours,
    scope: siteName || "—",
    basis,
    target: registration,
    registrationNumber: registration,
    assetDescription: assetDescription || registration,
    dateRange,
    distanceKm: totalDistanceKm.toFixed(2),
    totalDuration: drivingHours,
    trendSeries
  };
};

async function mapWithLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index], index);
      }
    })
  );
  return results;
}

function groupByDeviceId<T extends { deviceId?: number | string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = String(row.deviceId ?? "");
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}

const loadMovementSummaryForAsset = async (
  asset: { deviceId: number | string; registration?: string; assetLabel?: string },
  from: string,
  to: string
): Promise<{ trips: TraccarTrip[]; summary: TraccarSummary | null }> => {
  const deviceToken = String(asset.deviceId ?? "").replace(/^cms808:/i, "");
  if ((cms808HierarchyActive() || isCms808Server()) && (/^cms808:/i.test(String(asset.deviceId ?? "")) || /^\d{6,}$/.test(deviceToken))) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const plate = String(asset.registration ?? asset.assetLabel ?? "").trim();
    const movementTrips = await loadCms808MovementTrips(deviceToken, fromDate, toDate, plate).catch(() => []);
    const trips = movementTrips as unknown as TraccarTrip[];
    const mileage = await loadCms808Mileage(plate || deviceToken, fromDate, toDate, deviceToken).catch(() => []);
    const totalKm = mileage.reduce((sum, row) => sum + Math.max(row.mileageKm, row.platformMilesKm, 0), 0)
      || movementTrips.reduce((sum, trip) => sum + Number(trip.distance ?? 0) / 1000, 0);
    const summary = {
      deviceId: Number(deviceToken) || 0,
      deviceName: plate || deviceToken,
      distance: totalKm * 1000,
      averageSpeed: 0,
      maxSpeed: movementTrips.reduce((max, trip) => Math.max(max, Number(trip.maxSpeed ?? 0)), 0),
      spentFuel: 0,
      engineHours: 0,
      startTime: from,
      endTime: to,
      source: "cms808-mileage"
    } as unknown as TraccarSummary;
    return { trips, summary: totalKm > 0 || trips.length ? summary : null };
  }

  if (isGpsIotServer()) {
    // Daily / client mileage is one fleet call. Skip per-trip detail unless that summary is empty.
    const summaryRows = await getTraccarSummary({
      from,
      to,
      deviceId: asset.deviceId,
      registration: asset.registration,
      deviceName: asset.assetLabel
    }).catch(() => [] as TraccarSummary[]);
    const summary = summaryRows[0] ?? null;
    const summaryUsable = Boolean(
      summary
      && summary.source !== "trips"
      && (Number(summary.distance) > 0 || Number(summary.tripCount) > 0 || Number(summary.engineHours) > 0)
    );
    if (summaryUsable) return { trips: [] as TraccarTrip[], summary };
    const trips = await getTraccarTrips({ from, to, deviceId: asset.deviceId }).catch(() => [] as TraccarTrip[]);
    return { trips, summary: trips.length ? null : summary };
  }

  const trips = await getTraccarTrips({ from, to, deviceId: asset.deviceId }).catch(() => [] as TraccarTrip[]);
  return { trips, summary: null };
};

const ASSET_UTILISATION_COLUMNS = [
  "Site Name",
  "Asset Description",
  "Registration Number",
  "Distance (km)",
  "Standing Time (hh:mm:ss)",
  "Driving Time (hh:mm:ss)",
  "Duration (hh:mm:ss)",
  "Parking Time (hh:mm:ss)"
] as const;

const isAssetUtilisationReportName = (reportName: string) =>
  /^asset\s*utili[sz]ation\s*report$/i.test(String(reportName || "").trim());

type AssetUtilisationMetrics = {
  drivingMs: number;
  standingMs: number;
  durationMs: number;
  parkingMs: number;
  distanceKm: number;
};

const computeAssetUtilisationFromTrips = (
  trips: Array<{ startTime?: unknown; endTime?: unknown; duration?: unknown; distance?: unknown }>,
  rangeStartMs: number,
  rangeEndMs: number
): AssetUtilisationMetrics => {
  const sorted = [...trips].sort(
    (a, b) => Date.parse(String(a.startTime ?? "")) - Date.parse(String(b.startTime ?? ""))
  );

  let drivingMs = 0;
  let standingMs = 0;
  let distanceKm = 0;

  sorted.forEach((trip, index) => {
    const startMs = Date.parse(String(trip.startTime ?? ""));
    const endMs = Date.parse(String(trip.endTime ?? trip.startTime ?? ""));
    const tripDuration = Number(trip.duration ?? 0);
    const durationMs = tripDuration > 0
      ? tripDuration
      : (Number.isFinite(endMs) && Number.isFinite(startMs) && endMs > startMs ? endMs - startMs : 0);

    drivingMs += durationMs;
    distanceKm += Math.max(0, Number(trip.distance ?? 0) / 1000);

    if (index < sorted.length - 1) {
      const nextStartMs = Date.parse(String(sorted[index + 1].startTime ?? ""));
      if (Number.isFinite(endMs) && Number.isFinite(nextStartMs) && nextStartMs > endMs) {
        standingMs += nextStartMs - endMs;
      }
    }
  });

  const durationMs = drivingMs + standingMs;
  const periodMs = Math.max(0, rangeEndMs - rangeStartMs);
  const parkingMs = Math.max(0, periodMs - durationMs);

  return { drivingMs, standingMs, durationMs, parkingMs, distanceKm };
};

const assetUtilisationMetricsToRow = (
  siteName: string,
  assetDescription: string,
  registrationNumber: string,
  metrics: AssetUtilisationMetrics
) => ([
  siteName,
  assetDescription,
  registrationNumber,
  metrics.distanceKm.toFixed(2),
  formatDurationHms(metrics.standingMs),
  formatDurationHms(metrics.drivingMs),
  formatDurationHms(metrics.durationMs),
  formatDurationHms(metrics.parkingMs)
]);

const buildExportDetailRows = (
  runBasis: RunBasis,
  dateRange: string,
  organisation: string,
  dealer: string,
  database: string,
  site: string,
  targetLabel: string
): Array<[string, string]> => {
  const rows: Array<[string, string]> = [
    ["Date Range", dateRange],
    ["Organisation", organisation],
    ["Dealer", dealer],
    ["Database", database],
    ["Site", site]
  ];
  if (runBasis === "driver") {
    rows.push(["Driver", targetLabel]);
  }
  return rows;
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const looksLikeCoordinates = (value: string) => {
  const text = value.trim();
  if (!text) return false;
  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(text);
};

const formatCoordinateLabel = (lat: unknown, lng: unknown) => {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return "";
  if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) return "";
  return `${parsedLat.toFixed(5)}, ${parsedLng.toFixed(5)}`;
};

const formatLocationLabel = (value: unknown, fallback: string) => {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  if (looksLikeCoordinates(text)) return fallback;
  return text;
};

const reverseGeocodeCache = new Map<string, string>();
const reverseGeocodePending = new Map<string, Promise<string>>();
let reverseGeocodeActive = 0;
const reverseGeocodeWaiters: Array<() => void> = [];

const acquireReverseGeocodeSlot = () => new Promise<void>((resolve) => {
  if (reverseGeocodeActive < 3) {
    reverseGeocodeActive += 1;
    resolve();
    return;
  }
  reverseGeocodeWaiters.push(() => {
    reverseGeocodeActive += 1;
    resolve();
  });
});

const releaseReverseGeocodeSlot = () => {
  reverseGeocodeActive = Math.max(0, reverseGeocodeActive - 1);
  const next = reverseGeocodeWaiters.shift();
  if (next) next();
};

const buildReverseGeocodeKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

const fetchReverseGeocodeLabel = async (lat: unknown, lng: unknown): Promise<string> => {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return "";
  if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) return "";

  const key = buildReverseGeocodeKey(parsedLat, parsedLng);
  const cached = String(reverseGeocodeCache.get(key) ?? "").trim();
  if (cached) return cached;

  const existing = reverseGeocodePending.get(key);
  if (existing) return existing;

  const request = (async () => {
    await acquireReverseGeocodeSlot();
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      const apiKey = getApiKey();
      if (apiKey) headers["x-api-key"] = apiKey;

      const response = await fetch(
        buildApiUrl(`/api/reverse-geocode?lat=${encodeURIComponent(String(parsedLat))}&lon=${encodeURIComponent(String(parsedLng))}`),
        { headers }
      );
      if (!response.ok) return "";

      const body = (await response.json()) as { display_name?: string; name?: string; address?: Record<string, string> };
      const resolved = String(
        body?.display_name
          ?? body?.name
          ?? body?.address?.road
          ?? body?.address?.suburb
          ?? body?.address?.hamlet
          ?? body?.address?.neighbourhood
          ?? body?.address?.locality
          ?? body?.address?.city
          ?? body?.address?.town
          ?? body?.address?.village
          ?? body?.address?.county
          ?? body?.address?.municipality
          ?? body?.address?.state_district
          ?? ""
      ).trim();

      if (resolved) reverseGeocodeCache.set(key, resolved);
      return resolved;
    } catch {
      return "";
    } finally {
      releaseReverseGeocodeSlot();
      reverseGeocodePending.delete(key);
    }
  })();

  reverseGeocodePending.set(key, request);
  return request;
};

const resolvePresetRange = (preset: Exclude<DatePreset, "custom">) => {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (preset === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (preset === "yesterday") {
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    to.setDate(to.getDate() - 1);
    to.setHours(23, 59, 0, 0);
  } else if (preset === "last7") {
    from.setDate(from.getDate() - 6);
  } else if (preset === "last30") {
    from.setDate(from.getDate() - 29);
  }
  return { from: toDateTimeLocal(from), to: toDateTimeLocal(to) };
};

const nextRunFromFrequency = (
  frequency: string,
  dailyTime: string,
  weeklyDay: string,
  monthlyDay: number
) => {
  const next = new Date();
  const [hh, mm] = String(dailyTime || "08:00").split(":").map((v) => Number(v || 0));
  next.setSeconds(0, 0);
  next.setHours(Number.isFinite(hh) ? hh : 8, Number.isFinite(mm) ? mm : 0, 0, 0);

  if (frequency === "weekly") {
    const map: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6
    };
    const target = map[weeklyDay] ?? 1;
    const today = next.getDay();
    let delta = (target - today + 7) % 7;
    if (delta === 0 && next <= new Date()) delta = 7;
    next.setDate(next.getDate() + delta);
    return next;
  }

  if (frequency === "monthly") {
    const day = Math.min(Math.max(Number(monthlyDay) || 1, 1), 31);
    const candidate = new Date(next);
    candidate.setDate(day);
    if (candidate <= new Date()) {
      candidate.setMonth(candidate.getMonth() + 1);
      candidate.setDate(day);
    }
    return candidate;
  }

  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next;
};


export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlRestoredRef = useRef(false);
  const [activeTab, setActiveTab] = useState<"suite" | "favorites" | "subscriptions" | "archives">("suite");
  const [archivedReports, setArchivedReports] = useState<ReportArchiveSummary[]>([]);
  const [archivesLoading, setArchivesLoading] = useState(false);
  const [archivesError, setArchivesError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Cost Reports");
  // Report suite is two steps: pick a category, then the report and its parameters.
  const [suiteStep, setSuiteStep] = useState<"categories" | "configure">("categories");
  const [categorySearch, setCategorySearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [selectedNotificationReport, setSelectedNotificationReport] = useState(NotificationReports[0]);
  const [selectedCostReport, setSelectedCostReport] = useState(costReports[0]);
  const [selectedCustomReport, setSelectedCustomReport] = useState(customReports[0]);
  const [selectedDashboardWidget, setSelectedDashboardWidget] = useState(dashboardWidgets[0]);
  const [selectedFuelReport, setSelectedFuelReport] = useState(fuelReports[0]);
  const [selectedHoursOfServiceReport, setSelectedHoursOfServiceReport] = useState(hoursOfServiceReports[0]);
  const [selectedJourneyControlmentReport, setSelectedJourneyControlmentReport] = useState(journeyControlmentReports[0]);
  const [selectedListReport, setSelectedListReport] = useState(listReports[0]);
  const [selectedMaterialsHandlingReport, setSelectedMaterialsHandlingReport] = useState(materialsHandlingReports[0]);
  const [selectedMovementReport, setSelectedMovementReport] = useState(movementReports[0]);
  const [selectedPreProductionReport, setSelectedPreProductionReport] = useState(preProductionReports[0]);
  const [selectedRagReport, setSelectedRagReport] = useState(ragReports[0]);
  const [selectedRiskControlmentReport, setSelectedRiskControlmentReport] = useState(riskControlmentReports[0]);
  const [selectedDTrackReport, setSelectedDTrackReport] = useState(dTrackReports[0]);
  const [selectedScoringReport, setSelectedScoringReport] = useState(scoringReports[0]);
  const [selectedTrailerReport, setSelectedTrailerReport] = useState(trailerReports[0]);
  const [selectedTripReport, setSelectedTripReport] = useState(tripReports[0]);
  const [datePreset, setDatePreset] = useState<DatePreset>("last7");
  const [customFrom, setCustomFrom] = useState(() => resolvePresetRange("last7").from);
  const [customTo, setCustomTo] = useState(() => resolvePresetRange("last7").to);
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [reportDatePickerTarget, setReportDatePickerTarget] = useState<ReportDatePickerTarget>("from");
  const [reportDatePickerDateObj, setReportDatePickerDateObj] = useState(() => new Date());
  const [reportDatePickerTime, setReportDatePickerTime] = useState("00:00");
  const [reportDatePickerMode, setReportDatePickerMode] = useState<ReportDatePickerMode>("date");
  const [runBasis, setRunBasis] = useState<RunBasis>("asset");
  const [hierarchySnapshot, setHierarchySnapshot] = useState<HierarchyRoot | null>(null);
  const [reportScopeHierarchy, setReportScopeHierarchy] = useState<ReportScopeHierarchy>(emptyReportScopeHierarchy);
  const [selectedDatabase, setSelectedDatabase] = useState("");
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [selectedScopeItems, setSelectedScopeItems] = useState<string[]>([]);
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [siteSearch, setSiteSearch] = useState("");
  const [scopeSearch, setScopeSearch] = useState("");
  const [favoriteReports, setFavoriteReports] = useState<FavoriteReport[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [openFavoriteActions, setOpenFavoriteActions] = useState<string | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  const [runAction, setRunAction] = useState<RunAction>("view");
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>("excel");
  const [previewDownloadFormat, setPreviewDownloadFormat] = useState<DownloadFormat>("excel");
  const [isRunningReport, setIsRunningReport] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewRows, setPreviewRows] = useState<ReportExportRow[]>([]);
  const [reportOutputMode, setReportOutputMode] = useState<ReportOutputMode>("detailed");
  const [detailPreview, setDetailPreview] = useState<DetailReportPreview | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{
    reportName: string;
    category: string;
    periodLabel: string;
    dateFrom: string;
    dateTo: string;
    database: string;
    site: string;
    dealer: string;
    organisation: string;
  } | null>(null);
  const [showScopeSnapshot, setShowScopeSnapshot] = useState(false);
  const [lastRunSnapshot, setLastRunSnapshot] = useState<LastRunSnapshot | null>(null);
  const [saveToFavoritesOnRun, setSaveToFavoritesOnRun] = useState(false);
  const [favoriteDescription, setFavoriteDescription] = useState("");
  const [createSubscriptionOnRun, setCreateSubscriptionOnRun] = useState(false);
  const [subscriptionFrequency, setSubscriptionFrequency] = useState("daily");
  const [subscriptionReportFormat, setSubscriptionReportFormat] = useState<DownloadFormat>("pdf");
  const [subscriptionDailyTime, setSubscriptionDailyTime] = useState("08:00");
  const [subscriptionWeeklyDay, setSubscriptionWeeklyDay] = useState<typeof weekdays[number]>("monday");
  const [subscriptionMonthlyDay, setSubscriptionMonthlyDay] = useState(1);
  const [subscriptionDescription, setSubscriptionDescription] = useState("");
  const [subscriptionEmailSubject, setSubscriptionEmailSubject] = useState("");
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [notificationTypeMenuOpen, setNotificationTypeMenuOpen] = useState(false);
  const [selectedNotificationTypes, setSelectedNotificationTypes] = useState<string[]>([]);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showSelectRecipientsModal, setShowSelectRecipientsModal] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState("");
  const [scopeLoadError, setScopeLoadError] = useState("");
  const [runError, setRunError] = useState("");
  const [siteTimeZones, setSiteTimeZones] = useState<SiteTimeZoneSettings | null>(null);
  const [contactForm, setContactForm] = useState({
    firstName: "",
    lastName: "",
    employer: "",
    position: "",
    email: "",
    mobile: ""
  });
  const isFavorites = activeTab === "favorites";
  const isSubscriptions = activeTab === "subscriptions";
  const isArchives = activeTab === "archives";
  const previewContentRef = useRef<HTMLDivElement | null>(null);
  const notificationTypeMenuRef = useRef<HTMLDivElement | null>(null);
  const siteMenuRef = useRef<HTMLDivElement | null>(null);
  const scopeMenuRef = useRef<HTMLDivElement | null>(null);

  const loadArchivedReports = async () => {
    setArchivesLoading(true);
    setArchivesError("");
    const scope = readAccessScope();
    const result = await listReportArchivesFromServer({
      site: scope.activeSite || undefined,
      limit: 50
    });
    if (!result) {
      setArchivesError("Unable to load archived reports from the Reports API.");
      setArchivesLoading(false);
      return;
    }
    setArchivedReports(result.reports);
    setArchivesLoading(false);
  };

  const downloadArchivedReport = async (report: ReportArchiveSummary) => {
    setArchivesError("");
    const result = await getReportArchiveFromServer(report.report_id);
    if (!result) {
      setArchivesError(`Unable to retrieve "${report.title}" from the Reports API.`);
      return;
    }
    const blob = new Blob([JSON.stringify(result.payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeDownloadFileName(result.title || report.title || "Report")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    let cancelled = false;
    const loadScope = async () => {
      try {
        setScopeLoadError("");
        const [hierarchy, rawAssets, tz] = await Promise.all([
          getHierarchy(),
          getAssetsFromApi<any>(),
          getSiteTimeZoneSettings()
        ]);
        if (cancelled) return;
        setHierarchySnapshot(hierarchy ?? null);
        const nextScope = buildReportScopeHierarchy(hierarchy, rawAssets ?? []);
        setReportScopeHierarchy(nextScope);
        setSiteTimeZones(tz);
      } catch {
        if (cancelled) return;
        setHierarchySnapshot(null);
        setReportScopeHierarchy(emptyReportScopeHierarchy);
        setScopeLoadError("Unable to load live databases/sites for your access scope.");
      }
    };
    void loadScope();
    const handleOrgChange = () => void loadScope();
    window.addEventListener("vivi:orgchange", handleOrgChange);
    window.addEventListener("vivi:contextchange", handleOrgChange);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:orgchange", handleOrgChange);
      window.removeEventListener("vivi:contextchange", handleOrgChange);
    };
  }, []);

  const getSiteOptions = (database: string) =>
    Object.keys(reportScopeHierarchy[database] ?? {}).sort((a, b) => a.localeCompare(b));
  const getScopeItems = (database: string, site: string, basis: RunBasis) => {
    const scope = reportScopeHierarchy[database]?.[site];
    return basis === "asset" ? (scope?.assets ?? []) : (scope?.drivers ?? []);
  };

  const databaseOptions = Object.keys(reportScopeHierarchy);
  const siteOptions = getSiteOptions(selectedDatabase);
  // Backward-compat aliases — used by single-asset API calls and display fields
  const selectedSite = selectedSites[0] ?? "";
  const selectedScopeItem = selectedScopeItems[0] ?? "";
  const activeScope = reportScopeHierarchy[selectedDatabase]?.[selectedSite];
  // Aggregate scope items across all selected sites (or all sites if none selected)
  const scopeItems = selectedSites.length > 0
    ? [...new Set(selectedSites.flatMap((s) => getScopeItems(selectedDatabase, s, runBasis)))]
    : [...new Set(siteOptions.flatMap((s) => getScopeItems(selectedDatabase, s, runBasis)))];
  const dateRangeLabel = datePreset === "custom"
    ? `${formatReportDateTime(customFrom)} to ${formatReportDateTime(customTo)}`
    : (datePresetButtons.find((b) => b.key === datePreset)?.label || "Custom");
  const selectedRecipients = contacts.filter((c) => selectedRecipientIds.includes(c.id));
  const filteredContacts = contacts.filter((c) => {
    const q = recipientFilter.trim().toLowerCase();
    if (!q) return true;
    return [c.firstName, c.lastName, c.email, c.employer, c.position]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const selectedHierarchyMeta = useMemo(() => {
    const dealers = Array.isArray(hierarchySnapshot?.dealers) ? hierarchySnapshot.dealers : [];
    for (const dealer of dealers) {
      const organisations = Array.isArray((dealer as any)?.organisations) ? (dealer as any).organisations : [];
      for (const organisation of organisations) {
        const databases = Array.isArray((organisation as any)?.databases) ? (organisation as any).databases : [];
        for (const database of databases) {
          const dbName = String((database as any)?.name ?? "").trim();
          if (!dbName || dbName !== selectedDatabase) continue;
          const sites = Array.isArray((database as any)?.sites) ? (database as any).sites : [];
          const siteMatch = sites.some((site: any) => String(site?.name ?? "").trim() === selectedSite);
          if (!selectedSite || siteMatch) {
            return {
              dealer: String((dealer as any)?.name ?? "").trim() || "—",
              organisation: String((organisation as any)?.name ?? "").trim() || "—"
            };
          }
        }
      }
    }
    return { dealer: "—", organisation: "—" };
  }, [hierarchySnapshot, selectedDatabase, selectedSites]);

  const movementPreview = detailPreview?.kind === "movement" ? detailPreview : null;
  const tripDetailPreview = detailPreview?.kind === "trip" ? detailPreview : null;
  const fuelDetailPreview = detailPreview?.kind === "fuel" ? detailPreview : null;
  const utilisationDetailPreview = detailPreview?.kind === "utilisation" ? detailPreview : null;

  const showReportOutputSelector = reportDetailOutputCategories.has(selectedCategory);

  const tripDetailSections = useMemo(() => {
    if (!tripDetailPreview) return [] as Array<{ assetLabel: string; rows: TripDetailRow[] }>;
    const grouped = new Map<string, TripDetailRow[]>();
    tripDetailPreview.rows.forEach((row) => {
      const key = row.assetLabel || "Asset";
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    });
    return Array.from(grouped.entries()).map(([assetLabel, rows]) => ({ assetLabel, rows }));
  }, [tripDetailPreview]);

  const selectedReportByCategory: Record<string, string> = {
    "Notification Reports": selectedNotificationReport,
    "Trip Reports": selectedTripReport,
    "Cost Reports": selectedCostReport,
    "Custom Reports": selectedCustomReport,
    "Dashboard Widgets": selectedDashboardWidget,
    "Fuel Reports": selectedFuelReport,
    "Hours Of Service Reports": selectedHoursOfServiceReport,
    "Routes Reports": selectedJourneyControlmentReport,
    "List Reports": selectedListReport,
    "Materials Handling Reports": selectedMaterialsHandlingReport,
    "Movement Reports": selectedMovementReport,
    "Pre Production": selectedPreProductionReport,
    "RAG Reports": selectedRagReport,
    "Risk Controlment Reports": selectedRiskControlmentReport,
    "D-Track Reports": selectedDTrackReport,
    "Scoring Reports": selectedScoringReport,
    "Trailer Reports": selectedTrailerReport
  };

  const currentReportOptions = reportOptionsByCategory[selectedCategory] ?? [];
  const currentReportLabel = reportLabelByCategory[selectedCategory] ?? "report";

  const selectedReportName = selectedReportByCategory[selectedCategory] ?? "";

  useEffect(() => {
    setReportOutputMode(defaultReportOutputMode(selectedReportName || ""));
  }, [selectedCategory, selectedReportName]);

  const shouldUseDetailTablePreview = showReportOutputSelector
    && reportOutputMode === "detailed"
    && !(selectedCategory === "Movement Reports" && movementLocationReports.has(selectedReportName || ""))
    && !isAssetUtilisationReportName(selectedReportName || "");

  const isTripOrScoringCategory = selectedCategory === "Trip Reports" || selectedCategory === "Scoring Reports";
  const currentCategoryNote = reportUiNotes[selectedCategory]
    ?? "This category uses the standard report controls and export flow for the selected scope.";
  const isVerifiedReportSelection = Boolean(selectedReportName) && (
    isUtilisationReportName(selectedReportName)
    || isDriverPerformanceReportName(selectedReportName)
    || summaryReports.has(selectedReportName)
    || fuelSummaryBackedReports.has(selectedReportName)
    || hoursOfServiceEventBackedReports.has(selectedReportName)
    || scoringEventBackedCategories.has(selectedCategory)
  );
  const verifiedReportHint = isVerifiedReportSelection
    ? "Calculated from validated trip, event, or summary feeds for the selected scope."
    : "This selection is shown as configured report output for the selected scope.";
  const scopeSnapshotCards = useMemo(() => {
    if (!lastRunSnapshot) return [];
    const recordHelper = lastRunSnapshot.recordCount > 0
      ? "Rows returned from the last run"
      : "No rows — check scope, dates, and report output";
    return [
      { title: "Last report", value: lastRunSnapshot.reportName, change: "", helper: "Most recent run in this session" },
      { title: "Date range", value: lastRunSnapshot.dateRange, change: "", helper: "Applied on the last run" },
      { title: "Records", value: String(lastRunSnapshot.recordCount), change: "", helper: recordHelper },
      {
        title: "Scope",
        value: lastRunSnapshot.scopeLabel,
        change: lastRunSnapshot.runBasis,
        helper: lastRunSnapshot.runBasis === "asset" ? "Registrations in scope" : "Drivers in scope"
      }
    ];
  }, [lastRunSnapshot]);
  useEffect(() => {
    setShowScopeSnapshot(false);
    setLastRunSnapshot(null);
  }, [
    selectedCategory,
    selectedReportName,
    selectedDatabase,
    datePreset,
    customFrom,
    customTo,
    runBasis,
    reportOutputMode,
    selectedSites.join("|"),
    selectedScopeItems.join("|")
  ]);
  const showNotificationTypeSelector = selectedCategory === "Notification Reports"
    && runBasis === "asset"
    && !isNotificationSummaryReportName(selectedNotificationReport || "")
    && !/overview\s*notification|summary\s*notification/i.test(selectedNotificationReport || "")
    && !/streams action report/i.test(selectedNotificationReport || "");
  const selectedNotificationTypeSet = useMemo(() => new Set(selectedNotificationTypes), [selectedNotificationTypes]);
  const selectedNotificationTypeLabels = notificationTypeOptions
    .filter((option) => selectedNotificationTypeSet.has(option.value))
    .map((option) => option.label);

  const setSelectedReportForCategory = (category: string, report: string) => {
    switch (category) {
      case "Notification Reports":
        setSelectedNotificationReport(report);
        return;
      case "Trip Reports":
        setSelectedTripReport(report);
        return;
      case "Cost Reports":
        setSelectedCostReport(report);
        return;
      case "Custom Reports":
        setSelectedCustomReport(report);
        return;
      case "Dashboard Widgets":
        setSelectedDashboardWidget(report);
        return;
      case "Fuel Reports":
        setSelectedFuelReport(normalizeFuelReportName(report));
        return;
      case "Hours Of Service Reports":
        setSelectedHoursOfServiceReport(report);
        return;
      case "Routes Reports":
        setSelectedJourneyControlmentReport(report);
        return;
      case "List Reports":
        setSelectedListReport(report);
        return;
      case "Materials Handling Reports":
        setSelectedMaterialsHandlingReport(report);
        return;
      case "Movement Reports":
        setSelectedMovementReport(report);
        return;
      case "Pre Production":
        setSelectedPreProductionReport(report);
        return;
      case "RAG Reports":
        setSelectedRagReport(report);
        return;
      case "Risk Controlment Reports":
        setSelectedRiskControlmentReport(report);
        return;
      case "D-Track Reports":
        setSelectedDTrackReport(report);
        return;
      case "Scoring Reports":
        setSelectedScoringReport(report);
        return;
      case "Trailer Reports":
        setSelectedTrailerReport(report);
        return;
      default:
        return;
    }
  };

  const toggleNotificationType = (type: string) => {
    setSelectedNotificationTypes((current) => (
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
    ));
  };

  const selectAllNotificationTypes = () => {
    setSelectedNotificationTypes(notificationTypeOptions.map((option) => option.value));
  };

  const clearNotificationTypes = () => {
    setSelectedNotificationTypes([]);
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setActiveTab("suite");
    setSuiteStep("configure");
    setReportSearch("");
    setPreviewRows([]);
    setShowScopeSnapshot(false);
    setLastRunSnapshot(null);
    setShowPreviewModal(false);
    setShowRunModal(false);
    setCreateSubscriptionOnRun(false);
    setRunAction("view");
    setDownloadFormat("excel");
  };

  const handleOpenFavoriteReport = (favorite: FavoriteReport) => {
    const category = favorite.category || findCategoryForReport(favorite.report);
    handleCategorySelect(category);
    if (reportOptionsByCategory[category]?.includes(favorite.report)) {
      setSelectedReportForCategory(category, favorite.report);
    }
    setOpenFavoriteActions(null);
    setRunError("");
    setRunAction("view");
    setShowRunModal(true);
  };

  const handleRemoveFavorite = (favoriteId: string) => {
    setFavoriteReports((current) => current.filter((item) => item.id !== favoriteId));
    setOpenFavoriteActions((current) => (current === favoriteId ? null : current));
  };

  const handleRunBasisChange = (basis: RunBasis) => {
    setRunBasis(basis);
    setSelectedScopeItems([]);
  };

  const handleDatabaseChange = (database: string) => {
    setSelectedDatabase(database);
    setSelectedSites([]);
    setSelectedScopeItems([]);
  };

  const toggleSite = (site: string) => {
    setSelectedSites((prev) =>
      prev.includes(site) ? prev.filter((s) => s !== site) : [...prev, site]
    );
    setSelectedScopeItems([]);
  };

  const toggleScopeItem = (item: string) => {
    setSelectedScopeItems((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  useEffect(() => {
    if (!databaseOptions.includes(selectedDatabase)) {
      const fallbackDatabase = databaseOptions[0] ?? "";
      if (fallbackDatabase) {
        handleDatabaseChange(fallbackDatabase);
      }
    }
  }, [databaseOptions, selectedDatabase]);

  useEffect(() => {
    const valid = selectedSites.filter((s) => siteOptions.includes(s));
    if (valid.length !== selectedSites.length) {
      setSelectedSites(valid);
      setSelectedScopeItems([]);
    }
  }, [selectedDatabase, siteOptions]);

  useEffect(() => {
    const valid = selectedScopeItems.filter((i) => scopeItems.includes(i));
    if (valid.length !== selectedScopeItems.length) {
      setSelectedScopeItems(valid);
    }
  }, [scopeItems]);

  const handleDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset !== "custom") {
      const range = resolvePresetRange(preset);
      setCustomFrom(range.from);
      setCustomTo(range.to);
    }
  };

  const openReportDatePicker = (target: ReportDatePickerTarget) => {
    const rawValue = target === "from" ? customFrom : customTo;
    const parsed = new Date(rawValue);
    const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    setReportDatePickerTarget(target);
    setReportDatePickerDateObj(safeDate);
    setReportDatePickerTime(`${safeDate.getHours().toString().padStart(2, "0")}:${safeDate.getMinutes().toString().padStart(2, "0")}`);
    setReportDatePickerMode("date");
    setDatePreset("custom");
    setShowDatePickerModal(true);
  };

  const applyReportDatePicker = () => {
    const [hours, minutes] = reportDatePickerTime.split(":").map((value) => Number(value));
    const next = new Date(reportDatePickerDateObj);
    next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    const value = toDateTimeLocal(next);
    setDatePreset("custom");
    if (reportDatePickerTarget === "from") {
      setCustomFrom(value);
    } else {
      setCustomTo(value);
    }
    setShowDatePickerModal(false);
  };

  const reportDatePickerTitle = reportDatePickerTarget === "from" ? "Select start date" : "Select end date";

  const applyRunFiltersToUrl = () => {
    const params = new URLSearchParams(searchParams);
    params.set("category", selectedCategory);
    if (selectedReportName) params.set("report", selectedReportName);
    params.set("basis", runBasis);
    params.set("database", selectedDatabase);
    params.set("site", selectedSites.join("|"));
    if (selectedScopeItems.length > 0) params.set(runBasis === "asset" ? "registration" : "driver", selectedScopeItems.join("|"));
    params.set("datePreset", datePreset);
    if (customFrom) params.set("from", customFrom);
    if (customTo) params.set("to", customTo);
    if (selectedNotificationTypes.length > 0) {
      params.set("notifications", selectedNotificationTypes.join("|"));
    } else {
      params.delete("notifications");
    }
    setSearchParams(params);
  };

  const buildReportRows = (): ReportExportRow[] => {
    const reportName = (selectedReportName || "").toLowerCase();
    const scope = `${selectedDatabase} / ${selectedSite || "All Sites"}`;
    const target = selectedScopeItems.length > 0 ? selectedScopeItems.join(", ") : "All";

    if (isListBackedCategory(selectedCategory)) return [];

    if (reportName.includes("list")) {
      const listTargets = selectedScopeItems.length > 0 ? selectedScopeItems : scopeItems;
      if (listTargets.length === 0) return [];

      const bodyRows = listTargets.map((item, index) => ({
        category: selectedCategory,
        report: selectedReportName || selectedCategory,
        metric: `Item ${index + 1}`,
        value: item,
        change: "Listed",
        scope,
        basis: runBasis,
        target: item,
        dateRange: dateRangeLabel
      }));
      return [
        ...bodyRows,
        {
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric: "Totals",
          value: String(bodyRows.length),
          change: "Items",
          scope,
          basis: runBasis,
          target,
          dateRange: dateRangeLabel
        }
      ];
    }

    return [];
  };

  const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const sanitizeDownloadFileName = (value: string) => {
    const cleaned = value
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || "Report";
  };

  const reportLogoDataUrlRef = useRef<string | null>(null);

  const getReportLogoDataUrl = async (): Promise<string | null> => {
    if (reportLogoDataUrlRef.current) return reportLogoDataUrlRef.current;
    try {
      const dataUrl = (await brandLogoToDataUrl("raster")) ?? (await brandLogoToDataUrl("light"));
      reportLogoDataUrlRef.current = dataUrl;
      return dataUrl;
    } catch {
      return null;
    }
  };

  const escapeCsvCell = (value: unknown) => {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const buildCsvContent = (rows: Array<Array<unknown>>) => {
    const lines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(","));
    return `\uFEFF${lines.join("\r\n")}`;
  };

  const applyPdfBrandBlock = (pdf: jsPDF, logoDataUrl: string | null) => {
    const pageWidth = pdf.internal.pageSize.getWidth();
    if (logoDataUrl) {
      pdf.addImage(logoDataUrl, logoDataUrl.includes("image/png") ? "PNG" : "JPEG", pageWidth - 62, 8, 48, 12);
      return;
    }
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(31, 41, 55);
    pdf.text(REPORT_BRAND_LABEL, pageWidth - 14, 14, { align: "right" });
    pdf.setTextColor(15, 23, 42);
  };

  const summarizeTripDetailRows = (rows: TripDetailRow[]) => {
    const count = rows.length || 1;
    const totalDistanceKm = rows.reduce((sum, row) => sum + Number(row.distanceKm || 0), 0);
    const totalStandingMs = rows.reduce((sum, row) => sum + parseDurationHmsToMs(row.standingTime), 0);
    const totalDurationMs = rows.reduce((sum, row) => sum + parseDurationHmsToMs(row.duration), 0);
    const standingPctTotal = totalDurationMs > 0 ? totalStandingMs / totalDurationMs : 0;
    const totals: TripDetailSummary = {
      standingPct: standingPctTotal.toFixed(6),
      drivingTime: sumDurationHms(rows.map((row) => row.drivingTime)),
      standingTime: sumDurationHms(rows.map((row) => row.standingTime)),
      duration: sumDurationHms(rows.map((row) => row.duration)),
      distanceKm: totalDistanceKm.toFixed(3),
      avgSpeedKph: totalDurationMs > 0
        ? ((totalDistanceKm / (totalDurationMs / 3_600_000)) || 0).toFixed(5)
        : "0.00000",
      maxSpeedKph: rows.reduce((max, row) => Math.max(max, Number(row.maxSpeedKph || 0)), 0).toFixed(0)
    };
    const averages: TripDetailSummary = {
      standingPct: (rows.reduce((sum, row) => sum + Number(row.standingPct || 0), 0) / count).toFixed(6),
      drivingTime: averageDurationHms(rows.map((row) => row.drivingTime)),
      standingTime: averageDurationHms(rows.map((row) => row.standingTime)),
      duration: averageDurationHms(rows.map((row) => row.duration)),
      distanceKm: (totalDistanceKm / count).toFixed(3),
      avgSpeedKph: (rows.reduce((sum, row) => sum + Number(row.avgSpeedKph || 0), 0) / count).toFixed(5),
      maxSpeedKph: (rows.reduce((sum, row) => sum + Number(row.maxSpeedKph || 0), 0) / count).toFixed(2)
    };
    return { totals, averages };
  };

  const summarizeFuelEventColumns = (tableRows: string[][], volumeIndex: number) => {
    if (tableRows.length === 0) return {};
    const totalVolume = tableRows.reduce((sum, row) => sum + Number(row[volumeIndex] || 0), 0);
    return {
      totals: ["Totals", "", "", totalVolume.toFixed(2), "", ""],
      averages: ["Average", "", "", (totalVolume / tableRows.length).toFixed(2), "", ""]
    };
  };

  const buildDetailExportHeader = (title: string, dateRange: string): DetailReportExportHeader => {
    const siteLabel = selectedSites.length > 0 ? selectedSites.join(", ") : (selectedSite || "All Sites");
    return {
      title,
      dateRangeLabel: dateRange.startsWith("From") ? dateRange : `From ${dateRange}`,
      statusLabel: isVerifiedReportSelection ? "Data verified" : "Standard output",
      organisation: selectedHierarchyMeta.organisation,
      dealer: selectedHierarchyMeta.dealer,
      database: selectedDatabase || "—",
      site: siteLabel
    };
  };

  const applyDetailPdfHeader = (pdf: jsPDF, header: DetailReportExportHeader, logoDataUrl: string | null) => {
    applyPdfBrandBlock(pdf, logoDataUrl);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const titleWidth = Math.max(80, pageWidth - 90);
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.text(header.title, 14, 14, { maxWidth: titleWidth });
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.text(header.dateRangeLabel, 14, 20, { maxWidth: titleWidth });
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    if (header.statusLabel === "Data verified") {
      pdf.setTextColor(22, 101, 52);
    } else {
      pdf.setTextColor(100, 116, 139);
    }
    pdf.text(header.statusLabel, 14, 25);
    pdf.setTextColor(15, 23, 42);

    autoTable(pdf, {
      startY: 30,
      margin: { left: 14, right: 14 },
      head: [["Organisation", "Dealer", "Database", "Site"]],
      body: [[header.organisation, header.dealer, header.database, header.site]],
      theme: "plain",
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineWidth: 0,
        fillColor: [237, 244, 239],
        textColor: [17, 24, 39]
      },
      headStyles: {
        fillColor: [237, 244, 239],
        textColor: [56, 102, 65],
        fontStyle: "bold",
        lineWidth: 0
      },
      bodyStyles: {
        fillColor: [237, 244, 239],
        textColor: [17, 24, 39],
        fontStyle: "bold",
        lineWidth: 0
      }
    });
  };

  const applyPreviewPdfTable = (
    pdf: jsPDF,
    headers: string[],
    body: string[][],
    startY: number
  ) => {
    autoTable(pdf, {
      startY,
      margin: { left: 14, right: 14 },
      head: [headers],
      body,
      theme: "grid",
      styles: {
        fontSize: 7,
        cellPadding: 1.6,
        lineColor: [229, 231, 235],
        lineWidth: 0.15,
        textColor: [15, 23, 42],
        overflow: "linebreak"
      },
      headStyles: {
        fillColor: [216, 236, 226],
        textColor: [15, 23, 42],
        fontStyle: "bold",
        lineColor: [229, 231, 235],
        lineWidth: 0.15
      },
      tableLineWidth: 0.15,
      tableLineColor: [229, 231, 235],
      didParseCell: (hookData) => {
        const raw = hookData.row.raw as string[];
        const isSection = raw && raw[0] && raw.slice(1).every((cell) => !cell);
        const isSummary = raw && (raw[0] === "Totals" || raw[0] === "Averages");
        if (isSection) {
          hookData.cell.styles.fillColor = [230, 242, 235];
          hookData.cell.styles.fontStyle = "bold";
          hookData.cell.styles.textColor = [15, 81, 50];
        }
        if (isSummary) {
          hookData.cell.styles.fillColor = [238, 247, 241];
          hookData.cell.styles.fontStyle = "bold";
        }
      }
    });
  };

  const setWorksheetWidths = (worksheet: ExcelJS.Worksheet, widths: number[]) => {
    widths.forEach((width, index) => {
      worksheet.getColumn(index + 1).width = width;
    });
  };

  const applyTemplateDataBorders = (
    worksheet: ExcelJS.Worksheet,
    headerRow: number,
    dataEndRow: number,
    colCount: number
  ) => {
    if (dataEndRow < headerRow) return;
    applyWorksheetTableBorders(worksheet, headerRow, dataEndRow, 1, colCount);
  };

  const buildNoDataWorkbookBuffer = async (
    reportTitle: string,
    logoDataUrl: string | null,
    sheetName: string
  ) => {
    const { workbook, worksheet } = createTemplateWorkbook(sheetName);
    worksheet.mergeCells("A1:F3");
    worksheet.getCell("A1").value = buildSampleReportTitle(reportTitle);
    worksheet.getCell("A1").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 4.5, labelStartCol: 5, labelEndCol: 7 });
    worksheet.mergeCells("A5:F5");
    worksheet.getCell("A5").value = REPORT_NO_DATA_MESSAGE;
    worksheet.getCell("A5").font = { name: "Arial", size: 11, bold: true };
    worksheet.getCell("A5").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildSampleReportTitle = (reportTitle: string, includeTime = false) => {
    const siteLabel = selectedSites.length > 0 ? selectedSites.join(", ") : (selectedSite || "All Sites");
    const fromText = includeTime ? formatReportDateTime(customFrom) : formatDateOnly(customFrom);
    const toText = includeTime ? formatReportDateTime(customTo) : formatDateOnly(customTo);
    return `${reportTitle}\n${selectedHierarchyMeta.organisation} - ${selectedHierarchyMeta.dealer} - ${selectedDatabase} - ${siteLabel}\n\nFrom ${fromText} To  ${toText}`;
  };

  const getDayKeysForCurrentRange = () => {
    const keys: string[] = [];
    const cursor = new Date(customFrom);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(customTo);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end && keys.length < 62) {
      keys.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
  };

  const formatMonthBanner = (dayKey: string) => {
    const date = new Date(dayKey);
    return date.toLocaleDateString("en-GB", { month: "short" }).replace(".", "") + ` -${date.getFullYear()}`;
  };

  const formatWeekdayDayLabel = (dayKey: string) => {
    const date = new Date(dayKey);
    const weekday = date.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2);
    return `${weekday}-${String(date.getDate()).padStart(2, "0")}`;
  };

  const toDayKey = (value: unknown) => {
    const date = new Date(String(value ?? ""));
    if (Number.isNaN(date.getTime())) return "";
    date.setHours(0, 0, 0, 0);
    return date.toISOString().slice(0, 10);
  };

  const extractDriverIdentifier = (asset: any) => String(
    asset?.driverId
    ?? asset?.driverCode
    ?? asset?.driverUniqueId
    ?? asset?.driver
    ?? asset?.driverName
    ?? ""
  ).trim();

  const resolveScopedReportAssets = async (): Promise<Array<{
    registration: string;
    assetLabel: string;
    siteName: string;
    driverName: string;
    driverId: string;
    deviceId: string;
  }>> => {
    const rawAssets = await getAssetsFromApi<any>();
    const siteSet = new Set((selectedSites.length > 0 ? selectedSites : (selectedSite ? [selectedSite] : []))
      .map((value) => String(value).trim())
      .filter(Boolean));
    const scopeSet = new Set((selectedScopeItems.length > 0 ? selectedScopeItems : scopeItems)
      .map((value) => String(value).trim())
      .filter(Boolean));

    const filteredAssets = (Array.isArray(rawAssets) ? rawAssets : []).filter((asset) => {
      const registration = String(asset?.registration ?? asset?.assetDescription ?? asset?.name ?? "").trim();
      const driverName = extractScopedDriverName(asset) || "Unknown";
      const siteName = String(asset?.site ?? "").trim();
      if (siteSet.size > 0 && !siteSet.has(siteName)) return false;
      if (runBasis === "asset") {
        return registration && (scopeSet.size === 0 || scopeSet.has(registration));
      }
      return scopeSet.size === 0 || scopeSet.has(driverName);
    });

    const deviceIdByImei = await resolveTraccarDeviceIdsByUniqueId(
      filteredAssets
        .filter((asset) => !(Number(asset?.traccarDeviceId) > 0))
        .map((asset) => String(asset?.imei ?? "").trim())
    );
    const resolved = filteredAssets.map((asset) => {
      const directId = Number(asset?.traccarDeviceId);
      if (Number.isFinite(directId) && directId > 0) {
        return {
          registration: String(asset?.registration ?? asset?.assetDescription ?? asset?.name ?? "").trim(),
          assetLabel: String(asset?.assetDescription ?? asset?.name ?? asset?.registration ?? "Asset").trim(),
          siteName: String(asset?.site ?? selectedSite ?? "Default Site").trim() || "Default Site",
          driverName: extractScopedDriverName(asset) || "Unknown",
          driverId: extractDriverIdentifier(asset),
          deviceId: String(directId)
        };
      }
      const uniqueId = String(asset?.imei ?? "").trim();
      if (!uniqueId) return null;
      const deviceId = Number(deviceIdByImei.get(uniqueId));
      if (!Number.isFinite(deviceId) || deviceId <= 0) return null;
      return {
        registration: String(asset?.registration ?? asset?.assetDescription ?? asset?.name ?? "").trim(),
        assetLabel: String(asset?.assetDescription ?? asset?.name ?? asset?.registration ?? "Asset").trim(),
        siteName: String(asset?.site ?? selectedSite ?? "Default Site").trim() || "Default Site",
        driverName: extractScopedDriverName(asset) || "Unknown",
        driverId: extractDriverIdentifier(asset),
        deviceId: String(deviceId)
      };
    });

    let rows = resolved.filter((item): item is {
      registration: string;
      assetLabel: string;
      siteName: string;
      driverName: string;
      driverId: string;
      deviceId: string;
    } => Boolean(item));

    if ((cms808HierarchyActive() || isCms808Server()) && rows.length === 0) {
      let vehicles = await loadCms808VehiclesForActiveHierarchy().catch(() => []);
      if (!vehicles.length) vehicles = [CMS808_KNOWN_VEHICLE];
      rows = vehicles.map((vehicle) => {
        const device = String(vehicle.devIdno || vehicle.deviceId || "").trim();
        const plate = String(vehicle.vehiIdno || device).trim();
        return {
          registration: plate,
          assetLabel: plate,
          siteName: cms808SiteName() || selectedSite || "Karongo",
          driverName: "Unknown",
          driverId: "",
          deviceId: device ? `cms808:${device}` : plate
        };
      }).filter((row) => {
        if (scopeSet.size === 0) return true;
        return scopeSet.has(row.registration) || [...scopeSet].some((item) => row.registration.toLowerCase().includes(String(item).toLowerCase()));
      });
    } else if (cms808HierarchyActive() || isCms808Server()) {
      // Merge any CMS vehicles missing from Traccar-resolved rows.
      const vehicles = await loadCms808VehiclesForActiveHierarchy().catch(() => []);
      for (const vehicle of vehicles) {
        const device = String(vehicle.devIdno || vehicle.deviceId || "").trim();
        const plate = String(vehicle.vehiIdno || device).trim();
        if (!device && !plate) continue;
        const exists = rows.some((row) =>
          row.registration.toLowerCase() === plate.toLowerCase()
          || row.deviceId.replace(/^cms808:/i, "") === device
        );
        if (exists) continue;
        if (scopeSet.size > 0 && ![...scopeSet].some((item) => plate.toLowerCase().includes(String(item).toLowerCase()) || String(item).toLowerCase().includes(plate.toLowerCase()))) {
          continue;
        }
        rows.push({
          registration: plate,
          assetLabel: plate,
          siteName: cms808SiteName() || selectedSite || "Karongo",
          driverName: "Unknown",
          driverId: "",
          deviceId: device ? `cms808:${device}` : plate
        });
      }
    }

    return rows;
  };

  const parseEventMetricValue = (event: any, keys: string[]) => {
    const attributes = (event?.attributes ?? {}) as Record<string, unknown>;
    for (const key of keys) {
      const numeric = Number(attributes[key] ?? (event as any)?.[key]);
      if (Number.isFinite(numeric)) return numeric;
    }
    return 0;
  };

  const parseEventDurationMs = (event: any) => {
    const seconds = parseEventMetricValue(event, ["duration", "totalDuration", "seconds"]);
    return seconds > 0 ? seconds * 1000 : 0;
  };

  const classifyDrivingEvent = (event: any): "overspeed" | "overRevving" | "harshAcceleration" | "harshBraking" | "hos" | null => {
    const text = String(event?.type ?? "").trim().toLowerCase();
    if (!text) return null;
    if (/over\s*speed|overspeed|speeding|speed-limit|speed /.test(text)) return "overspeed";
    if (/over\s*rev|overrev|rpm/.test(text)) return "overRevving";
    if (/harsh.*acc|rapid.*acc|acceleration/.test(text)) return "harshAcceleration";
    if (/harsh.*brak|braking|brake/.test(text)) return "harshBraking";
    if (/hos|hours\s*of\s*service|driving\s*hours/.test(text)) return "hos";
    return null;
  };

  const createTemplateWorkbook = (sheetName: string) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName.slice(0, 31) || "Report", {
      views: [{ showGridLines: false }]
    });
    worksheet.properties.defaultRowHeight = 20;
    return { workbook, worksheet };
  };

  const buildAssetUtilisationSampleWorkbook = async (logoDataUrl: string | null) => {
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) {
      return buildNoDataWorkbookBuffer("Asset Utilisation Report", logoDataUrl, "Assets with unutilised days");
    }
    const dayKeys = getDayKeysForCurrentRange();
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const batches = await Promise.all(assets.map(async (asset) => ({
      asset,
      trips: await getTraccarTrips({ from, to, deviceId: asset.deviceId })
    })));

    const { workbook, worksheet } = createTemplateWorkbook("Assets with unutilised days");
    setWorksheetWidths(worksheet, [2, 18, 4, 4, 30, 4, 18, 4, 15, 4, 4, 4, 18]);
    worksheet.mergeCells("A1:M3");
    worksheet.getCell("A1").value = buildSampleReportTitle("Asset Utilisation Report");
    worksheet.getCell("A1").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 9.5, labelStartCol: 10, labelEndCol: 12 });
    worksheet.mergeCells("B6:M6");
    worksheet.getCell("B6").value = "Assets with unutilised days";
    worksheet.mergeCells("B7:M7");
    worksheet.getCell("B7").value = "Detail";
    worksheet.getRow(8).values = ["", "Site Name", "", "", "Asset Description", "", "Registration Number", "", "Days With Trips", "", "", "", "Days Without Trips"];
    styleTemplateRow(worksheet, 6, { bold: true, fill: "FFE6F2EB", size: 11 });
    styleTemplateRow(worksheet, 7, { bold: true, fill: "FFEEF7F1", size: 11 });
    styleTemplateRow(worksheet, 8, { bold: true, fill: "FFD8ECE2" });

    let rowNumber = 9;
    for (const batch of batches) {
      const withTrips = new Set(batch.trips.map((trip) => toDayKey((trip as any)?.startTime)).filter(Boolean)).size;
      worksheet.getRow(rowNumber).values = [
        "",
        batch.asset.siteName,
        "",
        "",
        batch.asset.assetLabel,
        "",
        batch.asset.registration,
        "",
        String(withTrips),
        "",
        "",
        "",
        String(Math.max(dayKeys.length - withTrips, 0))
      ];
      rowNumber += 1;
    }
    finishSampleTable(worksheet, 8, Math.max(8, rowNumber - 1), 13);

    const lowDistanceSheet = workbook.addWorksheet("Assets with distance less than", {
      views: [{ showGridLines: false }]
    });
    setWorksheetWidths(lowDistanceSheet, [2, 18, 28, 18, 14, 16, 16, 16, 16, 16]);
    lowDistanceSheet.mergeCells("B6:L6");
    lowDistanceSheet.getCell("B6").value = "Assets with distance less than 50 km";
    lowDistanceSheet.mergeCells("B7:L7");
    lowDistanceSheet.getCell("B7").value = "Detail";
    lowDistanceSheet.getRow(8).values = [
      "",
      "Site Name",
      "",
      "Asset Description",
      "Registration Number",
      "Distance (km)",
      "Standing Time (hh:mm:ss)",
      "Driving Time (hh:mm:ss)",
      "Duration (hh:mm:ss)",
      "Parking Time (hh:mm:ss)"
    ];
    styleTemplateRow(lowDistanceSheet, 6, { bold: true, fill: "FFE6F2EB", size: 11 });
    styleTemplateRow(lowDistanceSheet, 7, { bold: true, fill: "FFEEF7F1" });
    styleTemplateRow(lowDistanceSheet, 8, { bold: true, fill: "FFD8ECE2" });

    let lowRow = 9;
    const rangeStartMs = new Date(customFrom).getTime();
    const rangeEndMs = new Date(customTo).getTime();
    for (const batch of batches) {
      const metrics = computeAssetUtilisationFromTrips(batch.trips, rangeStartMs, rangeEndMs);
      if (metrics.distanceKm >= 50) continue;

      lowDistanceSheet.getRow(lowRow).values = [
        "",
        batch.asset.siteName,
        "",
        batch.asset.assetLabel,
        batch.asset.registration,
        metrics.distanceKm.toFixed(3),
        formatDurationHms(metrics.standingMs),
        formatDurationHms(metrics.drivingMs),
        formatDurationHms(metrics.durationMs),
        formatDurationHms(metrics.parkingMs)
      ];
      lowRow += 1;
    }
    finishSampleTable(lowDistanceSheet, 8, Math.max(8, lowRow - 1), 10);

    worksheet.views = [{ state: "frozen", ySplit: 3 }];
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildDailyUtilisationSampleWorkbook = async (logoDataUrl: string | null) => {
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) {
      return buildNoDataWorkbookBuffer("Daily Asset Utilisation Report", logoDataUrl, "Distance");
    }
    const dayKeys = getDayKeysForCurrentRange();
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const batches = await Promise.all(assets.map(async (asset) => ({
      asset,
      trips: await getTraccarTrips({ from, to, deviceId: asset.deviceId })
    })));

    const totalColumns = 1 + 4 + dayKeys.length + 5;
    const widths = [2, 18, 28, 18, 12, ...dayKeys.map(() => 10), 18, 18, 16, 12, 12];
    const { workbook, worksheet } = createTemplateWorkbook("Distance");
    setWorksheetWidths(worksheet, widths);
    worksheet.mergeCells(1, 1, 3, totalColumns);
    worksheet.getCell(1, 1).value = buildSampleReportTitle("Daily Asset Utilisation Report");
    worksheet.getCell(1, 1).font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, {
      anchorCol: Math.max(totalColumns - 4, 8),
      labelStartCol: Math.max(totalColumns - 3, 9),
      labelEndCol: Math.max(totalColumns - 1, 11)
    });

    const breakdownStartColumn = 1 + 4 + dayKeys.length + 1;
    worksheet.getRow(4).values = ["", "Asset Distance (km)", "", "", "", formatMonthBanner(dayKeys[0] || toDayKey(customFrom)), ...Array.from({ length: Math.max(dayKeys.length - 1, 0) }, () => ""), "Utilisation Breakdown"];
    worksheet.mergeCells(4, 2, 4, 5);
    worksheet.mergeCells(4, 6, 4, 5 + Math.max(dayKeys.length, 1));
    worksheet.mergeCells(4, breakdownStartColumn, 4, totalColumns);
    worksheet.getRow(5).values = [
      "",
      "Site Name",
      "Asset Description",
      "Registration Number",
      "Utilisation",
      ...dayKeys.map((dayKey) => formatWeekdayDayLabel(dayKey)),
      "Weekday Distance (km)",
      "Weekend Distance (km)",
      "Total Distance (km)",
      "With Trips",
      "Without Trips"
    ];
    styleTemplateRow(worksheet, 4, { bold: true, fill: "FFE6F2EB", size: 11 });
    styleTemplateRow(worksheet, 5, { bold: true, fill: "FFD8ECE2" });

    const firstDayColumn = 6;
    const breakdownColumn = firstDayColumn + dayKeys.length;
    const dayTotals = dayKeys.map(() => 0);
    let fleetWeekdayTotal = 0;
    let fleetWeekendTotal = 0;
    let fleetDistanceTotal = 0;

    let rowNumber = 6;
    let dataRowIndex = 0;
    const dailyDistanceCells: Array<{ row: number; distances: number[] }> = [];
    for (const batch of batches) {
      const distanceByDay = new Map<string, number>();
      batch.trips.forEach((trip) => {
        const dayKey = toDayKey((trip as any)?.startTime);
        if (!dayKey) return;
        distanceByDay.set(dayKey, (distanceByDay.get(dayKey) ?? 0) + Math.max(0, Number((trip as any)?.distance ?? 0) / 1000));
      });
      const dailyDistanceValues = dayKeys.map((dayKey) => distanceByDay.get(dayKey) ?? 0);
      const dailyDistances = dailyDistanceValues.map((value) => value.toFixed(3).replace(/\.000$/, ""));
      const withTrips = dailyDistanceValues.filter((value) => value > 0).length;
      const utilisationPercent = verifiedPercent(withTrips, Math.max(dayKeys.length, 1));
      const utilisationBand = classifyUtilisationPercent(utilisationPercent);
      const weekdayDistance = dayKeys.reduce((sum, dayKey, index) => {
        const weekday = new Date(dayKey).getDay();
        return weekday === 0 || weekday === 6 ? sum : sum + dailyDistanceValues[index];
      }, 0);
      const weekendDistance = dayKeys.reduce((sum, dayKey, index) => {
        const weekday = new Date(dayKey).getDay();
        return weekday === 0 || weekday === 6 ? sum + dailyDistanceValues[index] : sum;
      }, 0);
      const totalDistance = dailyDistanceValues.reduce((sum, value) => sum + value, 0);

      dailyDistanceValues.forEach((value, index) => {
        dayTotals[index] += value;
      });
      fleetWeekdayTotal += weekdayDistance;
      fleetWeekendTotal += weekendDistance;
      fleetDistanceTotal += totalDistance;

      const row = worksheet.getRow(rowNumber);
      row.values = [
        "",
        batch.asset.siteName,
        batch.asset.assetLabel,
        batch.asset.registration,
        "",
        ...dailyDistances,
        weekdayDistance.toFixed(3).replace(/\.000$/, ""),
        weekendDistance.toFixed(3).replace(/\.000$/, ""),
        totalDistance.toFixed(3).replace(/\.000$/, ""),
        String(withTrips),
        String(Math.max(dayKeys.length - withTrips, 0))
      ];

      applyUtilisationColumnStyle(row.getCell(5), dataRowIndex);
      dailyDistanceCells.push({ row: rowNumber, distances: dailyDistanceValues });

      const donutBase64 = createUtilisationDonutBase64(utilisationPercent, utilisationBand);
      if (donutBase64) {
        const imageId = workbook.addImage({ base64: donutBase64, extension: "png" });
        worksheet.addImage(imageId, {
          tl: { col: 4.2, row: rowNumber - 1 + 0.12 },
          ext: { width: 46, height: 46 }
        });
      }

      rowNumber += 1;
      dataRowIndex += 1;
    }

    if (batches.length > 0) {
      const totalRow = worksheet.getRow(rowNumber);
      const totalValues: Array<string | number> = ["", "Total", "", "", ""];
      dayTotals.forEach((value) => totalValues.push(Number(value.toFixed(3))));
      totalValues.push(
        Number(fleetWeekdayTotal.toFixed(3)),
        Number(fleetWeekendTotal.toFixed(3)),
        Number(fleetDistanceTotal.toFixed(3)),
        "",
        ""
      );
      totalRow.values = totalValues;
      totalRow.font = { name: "Arial", size: 10, bold: true };
      totalRow.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
      for (let col = firstDayColumn; col <= breakdownColumn + 2; col += 1) {
        const cell = totalRow.getCell(col);
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFFFF" }
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD1D5DB" } },
          bottom: { style: "medium", color: { argb: "FF94A3B8" } },
          left: { style: "thin", color: { argb: "FFD1D5DB" } },
          right: { style: "thin", color: { argb: "FFD1D5DB" } }
        };
      }
      rowNumber += 1;
    }

    applyTemplateDataBorders(worksheet, 5, Math.max(5, rowNumber - 1), totalColumns);

    dailyDistanceCells.forEach(({ row, distances }) => {
      distances.forEach((distanceKm, index) => {
        applyDistanceCellStyle(worksheet.getRow(row).getCell(firstDayColumn + index), distanceKm);
      });
    });

    worksheet.views = [{ state: "frozen", ySplit: 4 }];
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildDetailedTripSampleWorkbook = async (logoDataUrl: string | null) => {
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) {
      return buildNoDataWorkbookBuffer("Detailed Trip Report", logoDataUrl, "Detailed Trip Report");
    }
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const batches = await Promise.all(assets.map(async (asset) => ({
      asset,
      trips: await getTraccarTrips({ from, to, deviceId: asset.deviceId })
    })));

    const { workbook, worksheet } = createTemplateWorkbook("Detailed Trip Report");
    setWorksheetWidths(worksheet, [16, 24, 22, 22, 18, 14, 18, 18, 18, 3, 14, 3, 14, 14]);
    worksheet.mergeCells("A1:N3");
    worksheet.getCell("A1").value = buildSampleReportTitle("Detailed Trip Report", true);
    worksheet.getCell("A1").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 10, labelStartCol: 11, labelEndCol: 13 });
    worksheet.getRow(4).values = [
      "Date",
      "Asset",
      "Trip Start",
      "Trip End",
      "Driving Time vs Standing Time",
      "Standing Time %",
      "Driving Time (hh:mm:ss)",
      "Standing Time (hh:mm:ss)",
      "Duration (hh:mm:ss)",
      "",
      "Distance (km)",
      "",
      "Avg. Speed (km/h)",
      "Max Speed (km/h)"
    ];
    styleTemplateRow(worksheet, 4, { bold: true, fill: "FFD8ECE2" });

    let rowNumber = 5;
    const tripDetailRows: TripDetailRow[] = [];
    for (const batch of batches) {
      for (const trip of batch.trips) {
        const start = new Date(String((trip as any)?.startTime ?? ""));
        const end = new Date(String((trip as any)?.endTime ?? (trip as any)?.startTime ?? ""));
        const durationMs = Number.isFinite(Number((trip as any)?.duration)) && Number((trip as any)?.duration) > 0
          ? Number((trip as any)?.duration)
          : Math.max(0, end.getTime() - start.getTime());
        const distanceKm = Math.max(0, Number((trip as any)?.distance ?? 0) / 1000);
        const avgSpeed = Math.max(0, Number((trip as any)?.averageSpeed ?? 0) * 1.852);
        const drivingMs = avgSpeed > 0 && distanceKm > 0 ? (distanceKm / avgSpeed) * 3_600_000 : durationMs;
        const standingMs = Math.max(durationMs - drivingMs, 0);
        const standingPct = durationMs > 0 ? standingMs / durationMs : 0;
        const maxSpeedKph = Math.max(0, Number((trip as any)?.maxSpeed ?? 0) * 1.852).toFixed(0);
        tripDetailRows.push({
          assetLabel: batch.asset.assetLabel,
          date: `${formatDateOnly(start)} 00:00:00`,
          tripStart: formatReportDateTime(start),
          tripEnd: formatReportDateTime(end),
          standingPct: standingPct.toFixed(6),
          drivingTime: formatDurationHms(drivingMs),
          standingTime: formatDurationHms(standingMs),
          duration: formatDurationHms(durationMs),
          distanceKm: distanceKm.toFixed(3),
          avgSpeedKph: avgSpeed.toFixed(5),
          maxSpeedKph
        });
        worksheet.getRow(rowNumber).values = [
          `${formatDateOnly(start)} 00:00:00`,
          batch.asset.assetLabel,
          formatReportDateTime(start),
          formatReportDateTime(end),
          "",
          standingPct.toFixed(6),
          formatDurationHms(drivingMs),
          formatDurationHms(standingMs),
          formatDurationHms(durationMs),
          "",
          distanceKm.toFixed(3),
          "",
          avgSpeed.toFixed(5),
          maxSpeedKph
        ];
        rowNumber += 1;
      }
    }
    const tripSummary = summarizeTripDetailRows(tripDetailRows);
    if (tripDetailRows.length > 0) {
      worksheet.getRow(rowNumber).values = [
        "Totals",
        "",
        "",
        "",
        tripSummary.totals.standingPct,
        tripSummary.totals.drivingTime,
        tripSummary.totals.standingTime,
        tripSummary.totals.duration,
        "",
        tripSummary.totals.distanceKm,
        "",
        tripSummary.totals.avgSpeedKph,
        tripSummary.totals.maxSpeedKph
      ];
      styleTemplateRow(worksheet, rowNumber, { bold: true, fill: "FFEEF7F1" });
      rowNumber += 1;
      worksheet.getRow(rowNumber).values = [
        "Averages",
        "",
        "",
        "",
        tripSummary.averages.standingPct,
        tripSummary.averages.drivingTime,
        tripSummary.averages.standingTime,
        tripSummary.averages.duration,
        "",
        tripSummary.averages.distanceKm,
        "",
        tripSummary.averages.avgSpeedKph,
        tripSummary.averages.maxSpeedKph
      ];
      styleTemplateRow(worksheet, rowNumber, { bold: true, fill: "FFEEF7F1" });
    }

    applyTemplateDataBorders(worksheet, 4, rowNumber, 14);
    worksheet.views = [{ state: "frozen", ySplit: 4 }];
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildLocationTripSampleWorkbook = async (logoDataUrl: string | null) => {
    const movementData = await buildMovementReportPreview();
    const { workbook, worksheet } = createTemplateWorkbook("Location Trip Report");
    setWorksheetWidths(worksheet, [2, 42, 24, 24, 42]);
    worksheet.mergeCells("A1:E3");
    worksheet.getCell("A1").value = buildSampleReportTitle("Location Trip Report");
    worksheet.getCell("A1").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 3.2, labelStartCol: 4, labelEndCol: 6 });
    worksheet.mergeCells("B5:E5");
    worksheet.getCell("B5").value = "The asset won't have a link to the map if the distance is less than 0.01 km.";
    worksheet.getCell("B5").font = { name: "Arial", size: 10, italic: true };
    const totalRows = movementData?.sections.reduce((sum, section) => sum + section.rows.length, 0) ?? 0;
    if (!movementData || totalRows === 0) {
      worksheet.mergeCells("A7:E7");
      worksheet.getCell("A7").value = "No results found matching your search criteria";
      worksheet.getCell("A7").font = { name: "Arial", size: 11, bold: true };
      worksheet.getCell("A7").alignment = { vertical: "middle", horizontal: "left" };
      return writeBrandedWorkbookBuffer(workbook);
    }
    worksheet.getRow(7).values = [...LOCATION_VISIT_COLUMNS];
    styleTemplateRow(worksheet, 7, { bold: true, fill: "FFD8ECE2" });
    let dataEndRow = 7;
    movementData.sections.forEach((section) => {
      section.rows.forEach((row) => {
        dataEndRow += 1;
        worksheet.getRow(dataEndRow).values = row;
      });
    });
    finishSampleTable(worksheet, 7, dataEndRow, LOCATION_VISIT_COLUMNS.length);
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildDailyMovementSampleWorkbook = async (logoDataUrl: string | null) => {
    const movementData = await buildMovementReportPreview();
    const { workbook, worksheet } = createTemplateWorkbook("Daily Movement Report");
    setWorksheetWidths(worksheet, [14, 18, 14, 36, 18, 14, 14, 14, 36, 18, 22]);
    worksheet.mergeCells("A1:I3");
    worksheet.getCell("A1").value = buildSampleReportTitle("Daily Movement Report", true);
    worksheet.getCell("A1").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 7, labelStartCol: 8, labelEndCol: 10 });

    let rowNumber = 4;
    const sections = movementData?.variant === "detailed" ? movementData.sections : [];
    if (sections.length === 0) {
      worksheet.mergeCells(rowNumber, 1, rowNumber, DETAILED_MOVEMENT_TABLE_COLUMNS.length);
      worksheet.getCell(rowNumber, 1).value = "No results found matching your search criteria";
      worksheet.getCell(rowNumber, 1).font = { name: "Arial", size: 11, bold: true };
      return writeBrandedWorkbookBuffer(workbook);
    }

    for (const section of sections) {
      const writeMetaRow = (label: string, value: string) => {
        worksheet.mergeCells(rowNumber, 1, rowNumber, 2);
        worksheet.mergeCells(rowNumber, 3, rowNumber, 4);
        worksheet.getCell(rowNumber, 1).value = label;
        worksheet.getCell(rowNumber, 1).font = { name: "Arial", size: 10, bold: true };
        worksheet.getCell(rowNumber, 3).value = value;
        worksheet.getCell(rowNumber, 3).font = { name: "Arial", size: 10 };
        rowNumber += 1;
      };

      writeMetaRow("Asset Description", section.assetDescription);
      writeMetaRow("Registration Number", section.registrationNumber);
      writeMetaRow("Asset ID", section.assetId);
      writeMetaRow("Site Name", section.siteName);

      const headerRow = rowNumber;
      worksheet.getRow(headerRow).values = [...DETAILED_MOVEMENT_TABLE_COLUMNS];
      styleTemplateRow(worksheet, headerRow, { bold: true, fill: "FFD8ECE2", columnCount: DETAILED_MOVEMENT_TABLE_COLUMNS.length });
      rowNumber += 1;

      section.rows.forEach((row) => {
        worksheet.getRow(rowNumber).values = row;
        rowNumber += 1;
      });

      if (section.totals) {
        worksheet.getRow(rowNumber).values = section.totals;
        styleTemplateRow(worksheet, rowNumber, { bold: true, fill: "FFEEF7F1", columnCount: DETAILED_MOVEMENT_TABLE_COLUMNS.length });
        rowNumber += 1;
      }
      if (section.averages) {
        worksheet.getRow(rowNumber).values = section.averages;
        styleTemplateRow(worksheet, rowNumber, { bold: true, fill: "FFEEF7F1", columnCount: DETAILED_MOVEMENT_TABLE_COLUMNS.length });
        rowNumber += 1;
      }
      rowNumber += 1;
    }

    finishSampleTable(worksheet, 8, Math.max(8, rowNumber - 2), DETAILED_MOVEMENT_TABLE_COLUMNS.length);
    worksheet.views = [{ state: "frozen", ySplit: 3 }];
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildAssetPerformanceDetailSampleWorkbook = async (logoDataUrl: string | null) => {
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) {
      return buildNoDataWorkbookBuffer("Asset Performance Detail Report", logoDataUrl, "Asset Performance Detail Report");
    }
    const dayKeys = getDayKeysForCurrentRange();
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const batches = await Promise.all(assets.map(async (asset) => ({
      asset,
      trips: await getTraccarTrips({ from, to, deviceId: asset.deviceId })
    })));

    const siteLabel = selectedSites.length > 0 ? selectedSites.join(", ") : (selectedSite || "All Sites");
    const { workbook, worksheet } = createTemplateWorkbook("Asset Performance Detail Report");
    setWorksheetWidths(worksheet, [28, 18, 16, 16, 16, 16, 14, 14, 16, 12, 12, 18, 14]);
    worksheet.mergeCells("A1:M3");
    worksheet.getCell("A1").value = buildSampleReportTitle("Asset Performance Detail Report");
    worksheet.getCell("A1").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 9, labelStartCol: 10, labelEndCol: 12 });

    worksheet.mergeCells(4, 1, 4, 13);
    worksheet.getCell(4, 1).value = `Site: ${siteLabel}`;
    worksheet.getCell(4, 1).font = { name: "Arial", size: 10, bold: true };
    worksheet.getRow(5).values = [
      "Asset",
      "Registration No.",
      "Odometer Start (km)",
      "Odometer End (km)",
      "Driving Time (hh:mm:ss)",
      "Parking Time (hh:mm:ss)",
      "Idle Time (hh:mm:ss)",
      "Distance (km)",
      "Distance No Driver",
      "Days with Trips",
      "",
      "% Distance No Driver",
      "Asset Utilisation"
    ];
    styleTemplateRow(worksheet, 5, { bold: true, fill: "FFD8ECE2" });

    let rowNumber = 6;
    let totalDistance = 0;
    let totalDrivingMs = 0;
    for (const batch of batches) {
      const distanceKm = batch.trips.reduce(
        (sum, trip) => sum + Math.max(0, Number((trip as any)?.distance ?? 0) / 1000),
        0
      );
      const drivingMs = batch.trips.reduce((sum, trip) => {
        const duration = Number((trip as any)?.duration ?? 0);
        return sum + (duration > 0 ? duration : 0);
      }, 0);
      const daysWithTrips = new Set(
        batch.trips.map((trip) => toDayKey((trip as any)?.startTime)).filter(Boolean)
      ).size;
      const utilisation = dayKeys.length > 0 ? daysWithTrips / dayKeys.length : 0;

      totalDistance += distanceKm;
      totalDrivingMs += drivingMs;

      worksheet.getRow(rowNumber).values = [
        batch.asset.assetLabel,
        batch.asset.registration,
        "—",
        "—",
        formatDurationHms(drivingMs),
        "—",
        "—",
        distanceKm.toFixed(3),
        "—",
        String(daysWithTrips),
        String(daysWithTrips),
        "—",
        utilisation.toFixed(14)
      ];
      rowNumber += 1;
    }

    if (batches.length > 0) {
      writeSummaryTotalsRow(worksheet, rowNumber, 1, [
        { column: 8, value: Number(totalDistance.toFixed(3)) },
        { column: 5, value: formatDurationHms(totalDrivingMs) }
      ]);
      rowNumber += 1;
    }

    finishSampleTable(worksheet, 5, Math.max(5, rowNumber - 1), 13);
    worksheet.views = [{ state: "frozen", ySplit: 4 }];
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildSummaryTripSampleWorkbook = async (logoDataUrl: string | null, reportTitle: string) => {
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) {
      return buildNoDataWorkbookBuffer(reportTitle, logoDataUrl, "Summary Trip Report");
    }
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const batches = await Promise.all(assets.map(async (asset) => ({
      asset,
      trips: await getTraccarTrips({ from, to, deviceId: asset.deviceId })
    })));
    const { workbook, worksheet } = createTemplateWorkbook("Summary Trip Report");
    setWorksheetWidths(worksheet, [2, 28, 28, 18, 16]);
    worksheet.mergeCells("A1:E3");
    worksheet.getCell("A1").value = buildSampleReportTitle(reportTitle);
    worksheet.getCell("A1").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 3.5, labelStartCol: 4, labelEndCol: 6 });
    worksheet.getRow(5).values = ["", "Asset", "Site Name", "Distance (km) (Trip > 0)", "Duration (hh:mm:ss)"];
    styleTemplateRow(worksheet, 5, { bold: true, fill: "FFD8ECE2" });

    let rowNumber = 6;
    let totalDistance = 0;
    let totalDurationMs = 0;
    for (const batch of batches) {
      const batchDistance = batch.trips.reduce(
        (sum, trip) => sum + Math.max(0, Number((trip as any)?.distance ?? 0) / 1000),
        0
      );
      const batchDuration = batch.trips.reduce(
        (sum, trip) => sum + Math.max(0, Number((trip as any)?.duration ?? 0)),
        0
      );
      totalDistance += batchDistance;
      totalDurationMs += batchDuration;
      worksheet.getRow(rowNumber).values = [
        "",
        batch.asset.assetLabel,
        batch.asset.siteName,
        batchDistance.toFixed(3),
        formatDurationHms(batchDuration)
      ];
      rowNumber += 1;
    }

    if (batches.length > 0) {
      writeSummaryTotalsRow(worksheet, rowNumber, 2, [
        { column: 4, value: Number(totalDistance.toFixed(3)) },
        { column: 5, value: formatDurationHms(totalDurationMs) }
      ]);
      rowNumber += 1;
    }

    finishSampleTable(worksheet, 5, Math.max(5, rowNumber - 1), 5);
    worksheet.views = [{ state: "frozen", ySplit: 4 }];
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildSummaryMovementSampleWorkbook = async (logoDataUrl: string | null) => {
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) {
      return buildNoDataWorkbookBuffer("Summary Movement Report", logoDataUrl, "Summary Movement Report");
    }
    const dayKeys = getDayKeysForCurrentRange();
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    // UK GPS IoT: GetDailySummary (≤24h) / GetClientAssetsMileage + trip trend.
    const batches = await Promise.all(assets.map(async (asset) => {
      const { trips, summary } = await loadMovementSummaryForAsset(asset, from, to);
      return { asset, trips, summary };
    }));

    const { workbook, worksheet } = createTemplateWorkbook("Summary Movement Report");
    setWorksheetWidths(worksheet, [2, 18, 12, 16, 24, 16, 18, 12, 16]);
    worksheet.mergeCells("A1:I3");
    worksheet.getCell("A1").value = buildSampleReportTitle("Summary Movement Report");
    worksheet.getCell("A1").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 7, labelStartCol: 8, labelEndCol: 10 });
    worksheet.getRow(5).values = [
      "",
      "Registration Number",
      "Value",
      "Distance (km)",
      "Trend (daily km)",
      "Driving Hours",
      "Site",
      "Basis",
      "Date Range"
    ];
    styleTemplateRow(worksheet, 5, { bold: true, fill: "FFD8ECE2" });

    let rowNumber = 6;
    let fleetDistance = 0;
    let fleetTrips = 0;
    for (const batch of batches) {
      const summaryDistanceKm = batch.summary ? normalizeReportedDistanceKm(batch.summary.distance) : 0;
      const tripDistanceKm = batch.trips.reduce(
        (sum, trip) => sum + Math.max(0, Number((trip as any)?.distance ?? 0) / 1000),
        0
      );
      const distanceKm = summaryDistanceKm > 0 ? summaryDistanceKm : tripDistanceKm;
      const summaryDrivingMs = batch.summary && Number(batch.summary.engineHours) > 0
        ? Number(batch.summary.engineHours) * 3_600_000
        : 0;
      const tripDrivingMs = batch.trips.reduce(
        (sum, trip) => sum + computeTripDrivingDurationMs(trip),
        0
      );
      const drivingMs = summaryDrivingMs > 0 ? summaryDrivingMs : tripDrivingMs;
      const tripCount = batch.summary && Number.isFinite(Number(batch.summary.tripCount))
        ? Math.max(0, Math.round(Number(batch.summary.tripCount)))
        : batch.trips.length;
      const trendSeries = batch.trips.length > 0
        ? buildDailyDistanceTrend(
          batch.trips,
          dayKeys,
          (value) => Math.max(0, Number(value ?? 0) / 1000)
        )
        : dayKeys.map((key, index) => (index === dayKeys.length - 1 || dayKeys.length === 1 ? distanceKm : 0));
      fleetDistance += distanceKm;
      fleetTrips += tripCount;
      worksheet.getRow(rowNumber).values = [
        "",
        batch.asset.registration,
        String(tripCount),
        distanceKm.toFixed(2),
        trendSeries.map((value) => value.toFixed(2)).join(", "),
        formatDurationHms(drivingMs),
        batch.asset.siteName,
        runBasis,
        dateRangeLabel
      ];
      rowNumber += 1;
    }

    if (batches.length > 0) {
      writeSummaryTotalsRow(worksheet, rowNumber, 2, [
        { column: 3, value: fleetTrips },
        { column: 4, value: Number(fleetDistance.toFixed(2)) }
      ]);
      rowNumber += 1;
    }

    finishSampleTable(worksheet, 5, Math.max(5, rowNumber - 1), 9);
    worksheet.views = [{ state: "frozen", ySplit: 4 }];
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildGenericSummarySampleWorkbook = async (reportTitle: string, logoDataUrl: string | null) => {
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) {
      return buildNoDataWorkbookBuffer(reportTitle, logoDataUrl, reportTitle.slice(0, 31));
    }
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const batches = await Promise.all(assets.map(async (asset) => ({
      asset,
      trips: await getTraccarTrips({ from, to, deviceId: asset.deviceId })
    })));

    const { workbook, worksheet } = createTemplateWorkbook(reportTitle.slice(0, 31));
    setWorksheetWidths(worksheet, [2, 18, 12, 16, 24, 16, 18, 12, 16]);
    worksheet.mergeCells("A1:I3");
    worksheet.getCell("A1").value = buildSampleReportTitle(reportTitle);
    worksheet.getCell("A1").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 7, labelStartCol: 8, labelEndCol: 10 });
    worksheet.getRow(5).values = [
      "",
      "Registration Number",
      "Value",
      "Distance (km)",
      "Trend (daily km)",
      "Driving Hours",
      "Site",
      "Basis",
      "Date Range"
    ];
    styleTemplateRow(worksheet, 5, { bold: true, fill: "FFD8ECE2" });

    const dayKeys = getDayKeysForCurrentRange();
    let rowNumber = 6;
    let fleetDistance = 0;
    let fleetTrips = 0;
    for (const batch of batches) {
      const distanceKm = batch.trips.reduce(
        (sum, trip) => sum + normalizeReportedDistanceKm((trip as any)?.distance),
        0
      );
      const drivingMs = batch.trips.reduce(
        (sum, trip) => sum + computeTripDrivingDurationMs(trip),
        0
      );
      const trendSeries = buildDailyDistanceTrend(
        batch.trips,
        dayKeys,
        normalizeReportedDistanceKm
      );
      fleetDistance += distanceKm;
      fleetTrips += batch.trips.length;
      worksheet.getRow(rowNumber).values = [
        "",
        batch.asset.registration,
        String(batch.trips.length),
        distanceKm.toFixed(2),
        trendSeries.map((value) => value.toFixed(2)).join(", "),
        formatDurationHms(drivingMs),
        batch.asset.siteName,
        runBasis,
        dateRangeLabel
      ];
      rowNumber += 1;
    }

    if (batches.length > 0) {
      writeSummaryTotalsRow(worksheet, rowNumber, 2, [
        { column: 3, value: fleetTrips },
        { column: 4, value: Number(fleetDistance.toFixed(2)) }
      ]);
      rowNumber += 1;
    }

    finishSampleTable(worksheet, 5, Math.max(5, rowNumber - 1), 9);
    worksheet.views = [{ state: "frozen", ySplit: 4 }];
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildDailyDrivingPerformanceSampleWorkbook = async (logoDataUrl: string | null) => {
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) {
      return buildNoDataWorkbookBuffer("Asset - Daily Driving Performance Report", logoDataUrl, "Daily Driving Performance Repor");
    }
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const batches = await Promise.all(assets.map(async (asset) => ({
      asset,
      trips: await getTraccarTrips({ from, to, deviceId: asset.deviceId }),
      events: await getTraccarEvents({ from, to, deviceId: asset.deviceId })
    })));
    const { workbook, worksheet } = createTemplateWorkbook("Daily Driving Performance Report");
    setWorksheetWidths(worksheet, [14, 24, 24, 18, 16, 12, 14, 18, 3, 12, 12, 18, 12, 3, 18, 18, 14, 14, 18, 3]);
    worksheet.mergeCells("A2:T4");
    worksheet.getCell("A2").value = buildSampleReportTitle("Asset - Daily Driving Performance Report");
    worksheet.getCell("A2").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("A2").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 15, labelStartCol: 16, labelEndCol: 18 });
    worksheet.getRow(5).values = [
      "Date",
      "Asset",
      "Site Name",
      "Distance (km) (Trip > 0)",
      "Duration (hh:mm:ss)",
      "Over Speeding Occurrences",
      "Over Speeding Max (km/h)",
      "Over Speeding Duration (hh:mm:ss)",
      "",
      "Over Revving Occurrences",
      "Over Revving Max",
      "Over Revving Duration (hh:mm:ss)",
      "Harsh Accel Occurrences",
      "",
      "Harsh Acceleration Max (km/h/s)",
      "Harsh Acceleration Duration (hh:mm:ss)",
      "Harsh Braking Occurrences",
      "Harsh Braking Max (km/h/s)",
      "Harsh Braking Duration (hh:mm:ss)",
      ""
    ];
    styleTemplateRow(worksheet, 5, { bold: true, fill: "FFD8ECE2" });

    let rowNumber = 6;
    for (const batch of batches) {
      const byDay = new Map<string, any>();
      batch.trips.forEach((trip) => {
        const key = toDayKey((trip as any)?.startTime);
        if (!key) return;
        const current = byDay.get(key) ?? {
          date: key,
          distanceKm: 0,
          durationMs: 0,
          overspeed: { count: 0, max: 0, durationMs: 0 },
          overRevving: { count: 0, max: 0, durationMs: 0 },
          harshAcceleration: { count: 0, max: 0, durationMs: 0 },
          harshBraking: { count: 0, max: 0, durationMs: 0 }
        };
        current.distanceKm += Math.max(0, Number((trip as any)?.distance ?? 0) / 1000);
        current.durationMs += Number((trip as any)?.duration ?? 0);
        byDay.set(key, current);
      });
      batch.events.forEach((event) => {
        const key = toDayKey((event as any)?.eventTime ?? (event as any)?.serverTime ?? (event as any)?.deviceTime);
        const type = classifyDrivingEvent(event);
        if (!key || !type || type === "hos") return;
        const current = byDay.get(key) ?? {
          date: key,
          distanceKm: 0,
          durationMs: 0,
          overspeed: { count: 0, max: 0, durationMs: 0 },
          overRevving: { count: 0, max: 0, durationMs: 0 },
          harshAcceleration: { count: 0, max: 0, durationMs: 0 },
          harshBraking: { count: 0, max: 0, durationMs: 0 }
        };
        const bucket = current[type];
        bucket.count += 1;
        bucket.durationMs += parseEventDurationMs(event);
        const metricKeys = type === "overspeed"
          ? ["speed", "maxSpeed", "speedLimit", "value"]
          : type === "overRevving"
            ? ["rpm", "maxRpm", "value"]
            : ["acceleration", "deceleration", "value", "maxAcceleration"];
        bucket.max = Math.max(bucket.max, parseEventMetricValue(event, metricKeys));
        byDay.set(key, current);
      });

      Array.from(byDay.values())
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .forEach((row) => {
          worksheet.getRow(rowNumber).values = [
            `${row.date} 00:00:00`,
            batch.asset.assetLabel,
            batch.asset.siteName,
            row.distanceKm.toFixed(3),
            formatDurationHms(row.durationMs),
            String(row.overspeed.count),
            String(row.overspeed.max || 0),
            formatDurationHms(row.overspeed.durationMs),
            "",
            String(row.overRevving.count),
            String(row.overRevving.max || 0),
            formatDurationHms(row.overRevving.durationMs),
            String(row.harshAcceleration.count),
            "",
            String(row.harshAcceleration.max || 0),
            formatDurationHms(row.harshAcceleration.durationMs),
            String(row.harshBraking.count),
            String(row.harshBraking.max || 0),
            formatDurationHms(row.harshBraking.durationMs),
            ""
          ];
          rowNumber += 1;
        });
    }
    finishSampleTable(worksheet, 5, Math.max(5, rowNumber - 1), 20);
    worksheet.views = [{ state: "frozen", ySplit: 5 }];
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildSummaryDrivingPerformanceSampleWorkbook = async (logoDataUrl: string | null) => {
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) {
      return buildNoDataWorkbookBuffer("Asset - Summary Driving Performance Report", logoDataUrl, "Summary Driving Performance Repor");
    }
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const batches = await Promise.all(assets.map(async (asset) => ({
      asset,
      trips: await getTraccarTrips({ from, to, deviceId: asset.deviceId })
    })));
    const { workbook, worksheet } = createTemplateWorkbook("Summary Driving Performance Report");
    setWorksheetWidths(worksheet, [2, 28, 28, 18, 16, 3, 14, 18, 18]);
    worksheet.mergeCells("A1:G3");
    worksheet.getCell("A1").value = buildSampleReportTitle("Asset - Summary Driving Performance Report");
    worksheet.getCell("A1").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 6, labelStartCol: 7, labelEndCol: 9 });
    worksheet.getRow(5).values = ["", "Asset", "Site Name", "Distance (km) (Trip > 0)", "Duration (hh:mm:ss)", "", "", "", ""];
    styleTemplateRow(worksheet, 5, { bold: true, fill: "FFD8ECE2" });
    let rowNumber = 6;
    let fleetDistance = 0;
    let fleetDurationMs = 0;
    for (const batch of batches) {
      const totalDistance = batch.trips.reduce((sum, trip) => sum + Math.max(0, Number((trip as any)?.distance ?? 0) / 1000), 0);
      const totalDuration = batch.trips.reduce((sum, trip) => sum + Math.max(0, Number((trip as any)?.duration ?? 0)), 0);
      fleetDistance += totalDistance;
      fleetDurationMs += totalDuration;
      worksheet.getRow(rowNumber).values = ["", batch.asset.assetLabel, batch.asset.siteName, totalDistance.toFixed(3), formatDurationHms(totalDuration), "", "", "", ""];
      rowNumber += 1;
    }
    if (batches.length > 0) {
      writeSummaryTotalsRow(worksheet, rowNumber, 2, [
        { column: 4, value: Number(fleetDistance.toFixed(3)) },
        { column: 5, value: formatDurationHms(fleetDurationMs) }
      ]);
      rowNumber += 1;
    }
    finishSampleTable(worksheet, 5, Math.max(5, rowNumber - 1), 5);
    worksheet.views = [{ state: "frozen", ySplit: 4 }];
    return writeBrandedWorkbookBuffer(workbook);
  };

  const buildDriverScorecardSampleWorkbook = async (logoDataUrl: string | null, flexible: boolean) => {
    const assets = await resolveScopedReportAssets();
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const monthLabel = new Date(customFrom).toLocaleDateString("en-GB", { month: "long" });
    const batches = await Promise.all(assets.map(async (asset) => ({
      asset,
      trips: await getTraccarTrips({ from, to, deviceId: asset.deviceId }),
      events: await getTraccarEvents({ from, to, deviceId: asset.deviceId })
    })));

    const grouped = new Map<string, any>();
    for (const batch of batches) {
      const key = batch.asset.driverName || "Unknown";
      const current = grouped.get(key) ?? {
        driverName: key,
        driverId: batch.asset.driverId || "0",
        siteName: batch.asset.siteName,
        distanceKm: 0,
        harshAcceleration: { penalty: 0, occurrences: 0, durationMs: 0, score: 0 },
        harshBraking: { penalty: 0, occurrences: 0, durationMs: 0, score: 0 },
        overspeed: { penalty: 0, occurrences: 0, durationMs: 0, score: 0 },
        hos: { penalty: 0, occurrences: 0, durationMs: 0, score: 0 }
      };
      current.distanceKm += batch.trips.reduce((sum, trip) => sum + Math.max(0, Number((trip as any)?.distance ?? 0) / 1000), 0);
      batch.events.forEach((event) => {
        const type = classifyDrivingEvent(event);
        if (!type) return;
        const bucket = current[type];
        bucket.occurrences += 1;
        bucket.penalty += 1;
        bucket.durationMs += parseEventDurationMs(event);
        bucket.score = bucket.penalty;
      });
      grouped.set(key, current);
    }

    if (grouped.size === 0) {
      return buildNoDataWorkbookBuffer(
        flexible ? "Flexible Driver Scorecard Report" : "Driver Scorecard Report",
        logoDataUrl,
        flexible ? "Flexible Driver Scorecard Repor" : "Driver Scorecard Report"
      );
    }

    const { workbook, worksheet } = createTemplateWorkbook(flexible ? "Flexible Driver Scorecard Report" : "Driver Scorecard Report");
    if (flexible) {
      setWorksheetWidths(worksheet, [2, 24, 14, 14, 20, 16, 12, 12, 4, 4, 12, 14, 12, 12, 4, 12, 14, 12, 12, 12, 14, 12]);
      worksheet.mergeCells("B2:V4");
      worksheet.getCell("B2").value = buildSampleReportTitle("Flexible Driver Scorecard Report");
      worksheet.getCell("B2").font = { name: "Arial", size: 15, bold: true };
      worksheet.getCell("B2").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 17.2, labelStartCol: 18, labelEndCol: 20 });
      worksheet.getRow(6).values = ["", "", "", "", "", "", "Harsh Acceleration", "", "", "", "", "", "Harsh Braking", "", "", "", "", "Over Speeding", "", "", "", ""];
      worksheet.getRow(7).values = ["", "Driver Name", "Driver ID", "Month", "Site Name", "Distance (km)", "Penalty Points", "Occurrences", "", "", "Score", "Duration", "Penalty Points", "Occurrences", "", "Score", "Duration", "Penalty Points", "Occurrences", "Score", "Duration", "Total Score"];
      styleTemplateRow(worksheet, 6, { bold: true, fill: "FFE6F2EB", size: 11 });
      styleTemplateRow(worksheet, 7, { bold: true, fill: "FFD8ECE2" });
      let rowNumber = 8;
      Array.from(grouped.values()).forEach((item) => {
        const totalScore = item.harshAcceleration.score + item.harshBraking.score + item.overspeed.score;
        worksheet.getRow(rowNumber).values = [
          "",
          item.driverName,
          item.driverId || "0",
          monthLabel,
          item.siteName,
          item.distanceKm.toFixed(3),
          String(item.harshAcceleration.penalty),
          String(item.harshAcceleration.occurrences),
          "",
          "",
          String(item.harshAcceleration.score),
          formatDurationHms(item.harshAcceleration.durationMs),
          String(item.harshBraking.penalty),
          String(item.harshBraking.occurrences),
          "",
          String(item.harshBraking.score),
          formatDurationHms(item.harshBraking.durationMs),
          String(item.overspeed.penalty),
          String(item.overspeed.occurrences),
          String(item.overspeed.score),
          formatDurationHms(item.overspeed.durationMs),
          String(totalScore)
        ];
        rowNumber += 1;
      });
      finishSampleTable(worksheet, 7, Math.max(7, rowNumber - 1), 22);
      worksheet.views = [{ state: "frozen", ySplit: 5 }];
      return writeBrandedWorkbookBuffer(workbook);
    }

    setWorksheetWidths(worksheet, [20, 4, 14, 12, 14, 4, 12, 14, 4, 12, 4, 12, 14, 14, 12, 4, 12, 4, 16, 4, 12, 4, 4, 12, 18, 12, 4, 18, 18, 12, 12, 4]);
    worksheet.mergeCells("B2:AE4");
    worksheet.getCell("B2").value = buildSampleReportTitle("Driver Scorecard Report");
    worksheet.getCell("B2").font = { name: "Arial", size: 15, bold: true };
    worksheet.getCell("B2").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    addReportBrandBlock(workbook, worksheet, logoDataUrl, { anchorCol: 24.5, labelStartCol: 25, labelEndCol: 27 });
    worksheet.getRow(6).values = ["Scorecard Settings", "", "", "", "", "", "", "", "Harsh Braking", "", "", "Harsh Acceleration", "", "", "", "Over Speeding", "", "", "HOS Exceeding Driving Hours Duration"];
    worksheet.getRow(7).values = ["Penalty Points", "", "", "", "", "", "", "", "1", "", "", "1", "", "", "", "1", "", "", "1"];
    worksheet.getRow(10).values = ["Scoring Threshold"];
    worksheet.getRow(11).values = ["l", "", "Green Band <2", "", "", "l", "Amber Band  2 to 5", "", "", "", "l", "", "Red Band > 5", "", "", "", "Speed measure: Road Speed"];
    worksheet.getRow(13).values = [
      "Driver Name",
      "",
      "",
      "Month",
      "Distance (km)",
      "",
      "",
      "Harsh Braking Penalty Points",
      "",
      "Harsh Brake Occurrences",
      "",
      "",
      "",
      "Harsh Braking Score",
      "Harsh Acceleration Penalty Points",
      "",
      "",
      "Harsh Accel Occurrences",
      "",
      "",
      "Harsh Acceleration Score",
      "",
      "",
      "Over Speeding Penalty Points",
      "Over Speeding Duration (hh:mm:ss)",
      "Over Speeding Score",
      "",
      "HOS Exceeding Driving Hours Penalty Points",
      "HOS Exceeding Driving Hours Duration (hh:mm:ss)",
      "HOS Exceeding Driving Hours Score",
      "Total Score",
      ""
    ];
    styleTemplateRow(worksheet, 6, { bold: true, fill: "FFE6F2EB", size: 11 });
    styleTemplateRow(worksheet, 7, { bold: true, fill: "FFEEF7F1" });
    styleTemplateRow(worksheet, 10, { bold: true, fill: "FFE6F2EB", size: 11 });
    styleTemplateRow(worksheet, 11, { bold: true, fill: "FFEEF7F1" });
    styleTemplateRow(worksheet, 13, { bold: true, fill: "FFD8ECE2" });
    let rowNumber = 14;

    Array.from(grouped.values()).forEach((item) => {
      const totalScore = item.harshAcceleration.score + item.harshBraking.score + item.overspeed.score + item.hos.score;
      const values = Array.from({ length: 32 }, () => "");
      values[0] = item.driverName;
      values[3] = monthLabel;
      values[4] = item.distanceKm.toFixed(3);
      values[7] = String(item.harshBraking.penalty);
      values[9] = String(item.harshBraking.occurrences);
      values[13] = String(item.harshBraking.score);
      values[14] = String(item.harshAcceleration.penalty);
      values[17] = String(item.harshAcceleration.occurrences);
      values[20] = String(item.harshAcceleration.score);
      values[23] = String(item.overspeed.penalty);
      values[24] = formatDurationHms(item.overspeed.durationMs);
      values[25] = String(item.overspeed.score);
      values[27] = String(item.hos.penalty);
      values[28] = formatDurationHms(item.hos.durationMs);
      values[29] = String(item.hos.score);
      values[30] = String(totalScore);
      worksheet.getRow(rowNumber).values = values;
      rowNumber += 1;
    });
    finishSampleTable(worksheet, 13, Math.max(13, rowNumber - 1), 32);
    worksheet.views = [{ state: "frozen", ySplit: 5 }];
    return writeBrandedWorkbookBuffer(workbook);
  };

  const resolveSampleTemplateFamily = (reportTitle: string, category: string) => {
    const isSummaryName = /summary|overview|monthly\s*summary|benchmark/i.test(reportTitle);
    const isDetailedName = /detailed|detail|logbook|daily\s*trip/i.test(reportTitle);

    if (category === "Trip Reports") {
      if (/location\s*trip/i.test(reportTitle)) return "location-trip";
      if (/asset\s*utili[sz]ation/i.test(reportTitle)) return "asset-utilisation";
      if (/daily\s*utili[sz]ation/i.test(reportTitle)) return "daily-utilisation";
      if (/asset\s*performance\s*summary/i.test(reportTitle)) return "asset-performance-detail";
      if (/summary\s*trip|monthly\s*trip/i.test(reportTitle)) return "summary-trip";
      if (isDetailedName) return "detailed-trip";
      if (isSummaryName) return "summary-trip";
    }

    if (category === "Movement Reports") {
      if (movementLocationReports.has(reportTitle)) return null;
      if (/summary\s*movement/i.test(reportTitle)) return "summary-movement";
      return "daily-movement";
    }

    if (category === "Scoring Reports") {
      if (/flexible.*driver.*scorecard/i.test(reportTitle)) return "flex-scorecard";
      if (/daily\s*driving\s*performance|detailed\s*driving\s*performance|monthly\s*driving\s*performance/i.test(reportTitle)) {
        return "daily-driving-performance";
      }
      if (/summary\s*driving\s*performance/i.test(reportTitle)) return "summary-driving-performance";
      if (/flexible\s*rag/i.test(reportTitle)) return "flex-scorecard";
      if (/driver\s*scorecard|advanced\s*scoring|driver\s*debrief|driver\s*rating|standard\s*scoring|monthly\s*trend/i.test(reportTitle)) {
        return "driver-scorecard";
      }
      if (isSummaryName) return "summary-driving-performance";
      if (isDetailedName) return "daily-driving-performance";
    }

    if (category === "Dashboard Widgets" && /asset\s*performance/i.test(reportTitle)) {
      return "asset-performance-detail";
    }

    if (category === "Fuel Reports") {
      if (isDetailedName && reportOutputMode === "detailed") return null;
      return "generic-summary";
    }

    if (category === "Trailer Reports" || category === "Cost Reports" || category === "Custom Reports") {
      return "generic-summary";
    }

    if (isSummaryName && (category === "Notification Reports" || category === "List Reports" || category === "RAG Reports")) {
      return "generic-summary";
    }

    return null;
  };

  const buildSampleTemplateWorkbook = async (reportTitle: string, logoDataUrl: string | null) => {
    switch (resolveSampleTemplateFamily(reportTitle, selectedCategory)) {
      case "asset-utilisation":
        return buildAssetUtilisationSampleWorkbook(logoDataUrl);
      case "daily-utilisation":
        return buildDailyUtilisationSampleWorkbook(logoDataUrl);
      case "detailed-trip":
        return buildDetailedTripSampleWorkbook(logoDataUrl);
      case "location-trip":
        return buildLocationTripSampleWorkbook(logoDataUrl);
      case "summary-trip":
        return buildSummaryTripSampleWorkbook(logoDataUrl, reportTitle);
      case "asset-performance-detail":
        return buildAssetPerformanceDetailSampleWorkbook(logoDataUrl);
      case "daily-movement":
        return buildDailyMovementSampleWorkbook(logoDataUrl);
      case "summary-movement":
        return buildSummaryMovementSampleWorkbook(logoDataUrl);
      case "daily-driving-performance":
        return buildDailyDrivingPerformanceSampleWorkbook(logoDataUrl);
      case "summary-driving-performance":
        return buildSummaryDrivingPerformanceSampleWorkbook(logoDataUrl);
      case "driver-scorecard":
        return buildDriverScorecardSampleWorkbook(logoDataUrl, false);
      case "flex-scorecard":
        return buildDriverScorecardSampleWorkbook(logoDataUrl, true);
      case "generic-summary":
        return buildGenericSummarySampleWorkbook(reportTitle, logoDataUrl);
      default:
        return null;
    }
  };

  const buildTabularModel = (rows: ReportExportRow[]) => {
    if (isUtilisationReportName(selectedReportName || "")) {
      const headers = ["Date", "Utilisation %", "Band", "Target", "Scope", "Notes"];
      const body = rows.map((row) => ([
        row.metric,
        row.value,
        row.change,
        row.target,
        row.scope,
        row.eventValue || ""
      ]));
      return { headers, body };
    }

    if (isDriverPerformanceReportName(selectedReportName || "")) {
      const headers = ["Driver", "Performance Score", "Band", "Trips/Events", "Trend", "Scope"];
      const body = rows.map((row) => ([
        row.metric,
        row.value,
        row.change,
        row.eventValue || "",
        row.target,
        row.scope
      ]));
      return { headers, body };
    }

    if (scoringEventBackedCategories.has(selectedCategory)) {
      const headers = [
        "Driver / Asset",
        "Registration",
        "Distance (km)",
        "Score",
        "Band",
        "Harsh Accel",
        "Harsh Brake",
        "Overspeed",
        "HOS",
        "Events",
        "Scope"
      ];
      const body = rows.map((row) => ([
        row.driverName || row.metric || "",
        row.registrationNumber || row.target || "",
        row.distanceKm || "",
        row.value,
        row.change,
        row.actionDecision || "0",
        row.actionNote || "0",
        row.actionedByName || "0",
        row.actionedByEmail || "0",
        row.occurrences || row.eventValue || "",
        row.scope
      ]));
      return { headers, body };
    }

    if (rows.length > 0 && rows.every((row) => row.rowKind === "tripSummary")) {
      const headers = [
        "Asset Description",
        "Registration Number",
        "Driver",
        "Site",
        "Trips",
        "Distance (km)",
        "Driving Time (hh:mm:ss)",
        "Max Speed (km/h)",
        "Fuel Used (L)"
      ];
      const body = rows.map((row) => ([
        row.assetDescription || "",
        row.registrationNumber || "",
        row.driverName || "",
        row.scope,
        row.value,
        row.distanceKm || "",
        row.totalDuration || "",
        row.speedKph || "",
        row.fuelUsedL || ""
      ]));
      return { headers, body };
    }

    if (rows.length > 0 && rows.every((row) => row.rowKind === "tripDetail")) {
      const headers = [
        "Asset Description",
        "Registration Number",
        "Driver",
        "Site",
        "Trip Start",
        "Start Location",
        "Trip End",
        "End Location",
        "Driving Time (hh:mm:ss)",
        "Distance (km)",
        "Avg. Speed (km/h)",
        "Max Speed (km/h)",
        "Fuel Used (L)"
      ];
      const body = rows.map((row) => ([
        row.assetDescription || "",
        row.registrationNumber || "",
        row.driverName || "",
        row.scope,
        row.startDate || "",
        row.startLocation || "",
        row.endTime || "",
        row.endLocation || "",
        row.totalDuration || "",
        row.distanceKm || "",
        row.avgSpeedKph || "",
        row.speedKph || "",
        row.fuelUsedL || ""
      ]));
      return { headers, body };
    }

    if (selectedCategory === "Routes Reports" && selectedReportName === "Routes Dwell Time Report") {
      const headers = [
        "Location",
        "Asset",
        "Registration",
        "Start Date",
        "Start Time",
        "End Time",
        "Dwell Time (hh:mm:ss)",
        "Scope"
      ];
      const body = rows.map((row) => ([
        row.locationName || row.metric || "",
        row.assetDescription || row.value || "",
        row.registrationNumber || row.target || "",
        row.startDate || "",
        row.startTime || "",
        row.endTime || "",
        row.totalDuration || row.change || "",
        row.scope
      ]));
      return { headers, body };
    }

    if (selectedCategory === "Notification Reports") {
      if (/streams action report/i.test(selectedReportName || "")) {
        const headers = [
          "Asset",
          "Notification",
          "Location",
          "Speed (KPH)",
          "Distance",
          "Driver",
          "Date",
          "Time",
          "Action",
          "Supporting Note",
          "Actioned By",
          "Actioned Email",
          "Scope"
        ];
        const body = rows.map((row) => ([
          row.assetDescription || row.target || "",
          row.eventDescription || row.metric || "",
          row.locationName || "",
          row.speedKph || row.eventValue || "",
          row.distanceKm || "",
          row.driverName || "",
          row.startDate || "",
          row.startTime || "",
          row.actionDecision || "",
          row.actionNote || "",
          row.actionedByName || "",
          row.actionedByEmail || "",
          row.scope
        ]));
        return { headers, body };
      }
      if (isNotificationSummaryReportName(selectedReportName || "")) {
        const headers = ["Location Name", "Driver", "Date", "Time", "Alert", "Asset", "Scope"];
        const body = rows.map((row) => ([
          row.locationName || row.metric || "",
          row.driverName || row.target || "",
          row.startDate || "",
          row.startTime || "",
          row.eventDescription || row.report || "",
          row.assetDescription || row.value || "",
          row.scope
        ]));
        return { headers, body };
      }
      const headers = [
        "Asset Description",
        "Registration Number",
        "Notification Description",
        "Start Date",
        "Start Time",
        "End Time",
        "Nr of Occurrences",
        "Event Value",
        "Total Duration (hh:mm:ss)"
      ];
      const body = rows.map((row) => ([
        row.assetDescription || row.target || "",
        row.registrationNumber || row.target || "",
        row.eventDescription || row.metric || "",
        row.startDate || "",
        row.startTime || "",
        row.endTime || "",
        row.occurrences || "1",
        row.eventValue || row.value || "",
        row.totalDuration || "00:00:00"
      ]));
      return { headers, body };
    }

    if (selectedCategory === "Fuel Reports") {
      const fuelKind = resolveFuelReportKind(normalizeFuelReportName(selectedReportName || ""), reportOutputMode);
      const headers = fuelReportColumns[fuelKind];
      const body = rows.length > 0
        ? rows.map((row) => headers.map((header) => {
          const headerKey = header.toLowerCase();
          if (headerKey.includes("asset") || headerKey.includes("metric")) return row.target || row.metric || "";
          if (headerKey.includes("value") || headerKey.includes("fuel")) return row.value || "";
          if (headerKey.includes("date") || headerKey.includes("period") || headerKey.includes("time")) return row.change || row.dateRange || "";
          if (headerKey.includes("scope")) return row.scope || "";
          return row.value || row.metric || "";
        }))
        : [];
      if (body.length > 0) {
        return { headers, body };
      }
    }

    if (isAssetSummaryReportView(selectedCategory, selectedReportName || "", shouldUseDetailTablePreview, runBasis, reportOutputMode)) {
      const headers = ["Asset Description", "Registration Number", "Site", "Trips", "Distance (km)", "Driving Time (hh:mm:ss)", "Daily Distance Trend (km)", "Date Range"];
      const body = rows.map((row) => ([
        row.assetDescription || row.registrationNumber || row.target,
        row.registrationNumber || row.target,
        row.scope,
        row.value,
        row.distanceKm ?? "",
        row.totalDuration || row.change,
        row.trendSeries?.map((value) => value.toFixed(2)).join(" | ") || "",
        row.dateRange
      ]));
      return { headers, body };
    }

    const headers = ["Category", "Report", "Metric", "Value", "Change", "Scope", "Basis", "Target", "Date Range"];
    const body = rows.map((row) => ([
      row.category,
      row.report,
      row.metric,
      row.value,
      row.change,
      row.scope,
      row.basis,
      row.target,
      row.dateRange
    ]));
    return { headers, body };
  };

  const downloadReport = async (rows: ReportExportRow[], format: DownloadFormat, detailData?: DetailReportPreview | null) => {
    const baseName = sanitizeDownloadFileName(detailData?.reportName || selectedReportName || selectedCategory || "Report");
    const tableModel = buildTabularModel(rows);
    const logoDataUrl = format === "excel" || format === "pdf" ? await getReportLogoDataUrl() : null;

    // Fire-and-forget hot archive (promoted to Vivi-Reports after 90 days). Never blocks download.
    const scope = readAccessScope();
    void archiveReportRunToServer({
      site: detailData?.site || scope.activeSite || "",
      title: detailData?.reportName || selectedReportName || selectedCategory || "Report",
      payload: {
        format,
        category: selectedCategory,
        report: selectedReportName,
        dateRange: detailData?.dateRange || `${formatReportDateTime(customFrom)} to ${formatReportDateTime(customTo)}`,
        rowCount: rows.length,
        rows: rows.slice(0, 5_000),
        detailKind: detailData?.kind ?? null
      }
    }).catch((error) => {
      console.error("Failed to archive report snapshot.", error);
    });

    if (detailData) {

      let headers: string[] = [];
      let sheetName = "Report";
      // Per-asset blocks (info rows + table) or one flat table; summary rows stay out of CSV.
      let exportSections: Array<{ info: Array<[string, string]>; rows: string[][]; summary: string[][] }> | null = null;
      let flatRows: string[][] = [];
      let flatSummary: string[][] = [];

      if (detailData.kind === "movement") {
        sheetName = "Movement Report";
        headers = [...detailData.columns];
        if (detailData.variant === "detailed") {
          exportSections = detailData.sections.map((section) => ({
            info: assetSectionInfo(section),
            rows: section.rows,
            summary: [section.totals, section.averages].filter((row): row is string[] => Boolean(row))
          }));
        } else {
          // Location variants already carry asset / registration / driver / site on every row.
          detailData.sections.forEach((section) => {
            section.rows.forEach((row) => (row[0] === "Totals" ? flatSummary : flatRows).push(row));
          });
        }
      } else if (detailData.kind === "trip") {
        sheetName = "Trip Report";
        headers = [...TRIP_DETAIL_COLUMNS];
        const grouped = new Map<string, TripDetailRow[]>();
        detailData.rows.forEach((row) => {
          const key = `${row.assetLabel || "Asset"}|${row.registration || ""}`;
          const current = grouped.get(key) ?? [];
          current.push(row);
          grouped.set(key, current);
        });
        exportSections = Array.from(grouped.values()).map((assetRows) => {
          const first = assetRows[0];
          const { totals, averages } = summarizeTripDetailRows(assetRows);
          return {
            info: assetSectionInfo({
              assetDescription: first.assetLabel || "Asset",
              registrationNumber: first.registration || "—",
              assetId: first.assetId || "—",
              siteName: first.siteName || "—"
            }),
            rows: assetRows.map(tripDetailRowCells),
            summary: [tripDetailSummaryCells("Totals", totals), tripDetailSummaryCells("Averages", averages)]
          };
        });
      } else if (detailData.kind === "fuel") {
        sheetName = "Fuel Report";
        if (detailData.showSectioned && detailData.sections?.length) {
          headers = [...FUEL_TRIP_SECTION_COLUMNS];
          exportSections = detailData.sections.map((section) => ({
            info: assetSectionInfo(section),
            rows: section.rows,
            summary: [section.totals, section.averages].filter((row): row is string[] => Boolean(row))
          }));
        } else {
          headers = detailData.columns;
          flatRows = [...detailData.tableRows];
          if (detailData.showTotals && detailData.totals && detailData.averages) {
            flatSummary = [detailData.totals, detailData.averages];
          }
        }
      } else if (detailData.kind === "utilisation") {
        sheetName = "Asset Utilisation";
        headers = [...detailData.columns];
        flatRows = [...detailData.tableRows];
      }

      if (format === "csv") {
        // Plain table: one header row, one value per column, asset details repeated on every row.
        const csvCell = (value: unknown) => {
          const text = String(value ?? "").trim();
          return text === "—" ? "" : text;
        };
        const assetColumns = exportSections?.[0]?.info.map(([label]) => label) ?? [];
        const csvRows: unknown[][] = exportSections
          ? exportSections.flatMap((section) => section.rows.map((row) => [
            ...section.info.map(([, value]) => value),
            ...row
          ]))
          : flatRows;
        const csvContent = buildCsvContent([
          [...assetColumns, ...headers],
          ...csvRows.map((row) => row.map(csvCell))
        ]);
        saveBlob(new Blob([csvContent], { type: "text/csv;charset=utf-8" }), `${baseName}.csv`);
        return;
      }

      if (format === "excel") {
        const workbookBuffer = await buildDetailReportExcelWorkbook({
          header: buildDetailExportHeader(detailData.reportName, detailData.dateRange),
          headers,
          body: exportSections ? [] : [...flatRows, ...flatSummary],
          sections: exportSections
            ? exportSections.map((section) => ({ info: section.info, rows: [...section.rows, ...section.summary] }))
            : undefined,
          sheetName,
          logoDataUrl
        });
        saveBlob(
          new Blob([workbookBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          `${baseName}.xlsx`
        );
        return;
      }

      const sectionedRows: string[][] = exportSections
        ? exportSections.flatMap((section) => [
          [section.info.map(([, value]) => value).filter((value) => value && value !== "—").join("  ·  "), ...Array(headers.length - 1).fill("")],
          ...section.rows,
          ...section.summary
        ])
        : [...flatRows, ...flatSummary];
      const pdf = new jsPDF({ orientation: "landscape" });
      applyDetailPdfHeader(pdf, buildDetailExportHeader(detailData.reportName, detailData.dateRange), logoDataUrl);
      const pdfTableStart = (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 6 : 42;
      applyPreviewPdfTable(pdf, headers, sectionedRows, pdfTableStart);
      pdf.save(`${baseName}.pdf`);
      return;
    }

    if (format === "csv") {
      // Plain table for Excel: header row first, one value per column.
      const csvContent = buildCsvContent([
        tableModel.headers,
        ...tableModel.body.map((row) => row.map((cell) => {
          const text = String(cell ?? "").trim();
          return text === "—" ? "" : text;
        }))
      ]);
      saveBlob(new Blob([csvContent], { type: "text/csv;charset=utf-8" }), `${baseName}.csv`);
      return;
    }

    if (format === "excel") {
      const reportTitle = selectedReportName || selectedCategory;
      const exportBody = tableModel.body.length > 0
        ? tableModel.body
        : [[REPORT_NO_DATA_MESSAGE]];
      const workbookBuffer = await buildDetailReportExcelWorkbook({
        header: buildDetailExportHeader(
          reportTitle,
          `${formatReportDateTime(customFrom)} to ${formatReportDateTime(customTo)}`
        ),
        headers: tableModel.headers,
        body: exportBody,
        sheetName: reportTitle,
        logoDataUrl
      });
      saveBlob(
        new Blob([workbookBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `${baseName}.xlsx`
      );
      return;
    }

    if (format === "pdf") {
      const reportTitle = selectedReportName || selectedCategory;
      const pdf = new jsPDF({ orientation: "landscape" });
      applyDetailPdfHeader(
        pdf,
        buildDetailExportHeader(
          reportTitle,
          `${formatReportDateTime(customFrom)} to ${formatReportDateTime(customTo)}`
        ),
        logoDataUrl
      );
      const pdfTableStart = (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 6 : 42;
      const pdfBody = tableModel.body.length > 0 ? tableModel.body : [[REPORT_NO_DATA_MESSAGE]];
      applyPreviewPdfTable(pdf, tableModel.headers, pdfBody, pdfTableStart);
      pdf.save(`${baseName}.pdf`);
    }
  };

  const appendFavorite = (description: string) => {
    const now = new Date();
    const target = selectedScopeItem || "All";
    const item: FavoriteReport = {
      id: `fav-${now.getTime()}`,
      category: selectedCategory,
      description: description.trim() || `${selectedCategory} - ${target}`,
      report: selectedReportName || selectedCategory,
      lastProcessed: formatUtcDateTime(now)
    };
    setFavoriteReports((current) => [item, ...current]);
  };

  const appendSubscription = () => {
    const now = new Date();
    const scheduleLabel = subscriptionFrequency === "weekly"
      ? `Weekly on ${subscriptionWeeklyDay.charAt(0).toUpperCase()}${subscriptionWeeklyDay.slice(1)}`
      : subscriptionFrequency === "monthly"
        ? `Monthly on day ${subscriptionMonthlyDay}`
        : `Daily at ${subscriptionDailyTime}`;
    const nextRun = nextRunFromFrequency(
      subscriptionFrequency,
      subscriptionDailyTime,
      subscriptionWeeklyDay,
      subscriptionMonthlyDay
    );
    const item: SubscriptionItem = {
      id: `sub-${now.getTime()}`,
      report: selectedReportName || selectedCategory,
      category: selectedCategory,
      description: subscriptionDescription.trim() || `${selectedCategory} subscription`,
      basis: runBasis,
      target: selectedScopeItem || "All",
      schedule: scheduleLabel,
      format: subscriptionReportFormat.toUpperCase(),
      dateRange: dateRangeLabel,
      recipients: selectedRecipients.map((r) => r.email),
      emailSubject: subscriptionEmailSubject.trim() || `${selectedCategory} - ${selectedReportName || "Report"}`,
      nextRunAt: formatUtcDateTime(nextRun),
      status: `Queued for email (${scheduleLabel})`,
      createdAt: formatUtcDateTime(now)
    };
    setSubscriptions((current) => [item, ...current]);
  };

  const resolveEventDeviceId = async (): Promise<string> => {
    if (runBasis !== "asset" || !selectedScopeItem) return "";
    const assets = await getAssetsFromApi<AssetLike>();
    const match = assets.find((asset) => String(asset?.registration ?? "").trim() === selectedScopeItem);
    if (!match) return "";
    const directId = Number(match.traccarDeviceId);
    if (Number.isFinite(directId) && directId > 0) return String(directId);
    const uniqueId = String(match.imei ?? "").trim();
    if (!uniqueId) return "";
    const devices = await getTraccarDevices({ uniqueId });
    const deviceId = Number(devices[0]?.id);
    return Number.isFinite(deviceId) && deviceId > 0 ? String(deviceId) : "";
  };

  // Resolves device IDs for all selected scope items in parallel.
  // Returns array of { registration, deviceId } for each item that resolved.
  const resolveAllDeviceIds = async (): Promise<Array<{
    registration: string;
    deviceId: string;
    fuelTankCapacityLiters?: number;
    gpsIotAssetId?: string;
    imei?: string;
  }>> => {
    if (runBasis !== "asset") return [];
    const targets = selectedScopeItems.length > 0 ? selectedScopeItems : (scopeItems.length > 0 ? scopeItems : []);
    if (targets.length === 0) return [];
    const assets = await getAssetsFromApi<AssetLike>();
    const deviceIdByImei = isGpsIotServer()
      ? new Map<string, number>()
      : await resolveTraccarDeviceIdsByUniqueId(
          targets
            .map((reg) => assets.find((asset) => String(asset?.registration ?? "").trim() === reg))
            .filter((asset) => asset && !(Number(asset.traccarDeviceId) > 0))
            .map((asset) => String(asset?.imei ?? "").trim())
        );
    const results = await Promise.all(
      targets.map(async (reg) => {
        const match = assets.find((asset) => String(asset?.registration ?? "").trim() === reg);
        if (!match) return null;
        const tankCapacity = Number((match as any)?.fuelTankCapacity ?? 0);
        const fuelTankCapacityLiters = Number.isFinite(tankCapacity) && tankCapacity > 0 ? tankCapacity : undefined;
        const imei = String(match.imei ?? "").trim();
        const gpsIotAssetId = isGpsIotServer() ? resolveGpsIotFuelAssetId(match) : undefined;

        if (isGpsIotServer()) {
          const devices = imei ? await getTraccarDevices({ uniqueId: imei }) : [];
          const hashedId = Number(devices[0]?.id);
          const deviceId = Number.isFinite(hashedId) && hashedId > 0
            ? String(hashedId)
            : (gpsIotAssetId || imei);
          if (!deviceId && !gpsIotAssetId) return null;
          return {
            registration: reg,
            deviceId: deviceId || gpsIotAssetId || imei,
            fuelTankCapacityLiters,
            gpsIotAssetId: gpsIotAssetId || undefined,
            imei: imei || undefined
          };
        }

        const directId = Number(match.traccarDeviceId);
        if (Number.isFinite(directId) && directId > 0) {
          return { registration: reg, deviceId: String(directId), fuelTankCapacityLiters };
        }
        if (!imei) return null;
        const deviceId = Number(deviceIdByImei.get(imei));
        return Number.isFinite(deviceId) && deviceId > 0
          ? { registration: reg, deviceId: String(deviceId), fuelTankCapacityLiters }
          : null;
      })
    );
    return results.flatMap((row) => (row ? [row] : []));
  };

  const buildLocationAlertNotificationSummaryRows = async (): Promise<ReportExportRow[] | null> => {
    const reportName = selectedReportName || "";
    if (selectedCategory !== "Notification Reports") return null;
    if (!isNotificationSummaryReportName(reportName)) return null;

    const fromMs = Date.parse(customFrom);
    const since = Number.isFinite(fromMs) ? new Date(fromMs).toISOString() : undefined;
    const [alerts, locationAlertRules] = await Promise.all([
      getUserAlertsFromApi(since).catch(() => []),
      loadSiteLocationAlerts(selectedSite || readStoredSelectionScope().activeSite || "")
    ]);
    const locationAlertNames = new Set(
      locationAlertRules.map((row) => String(row.eventName ?? "").trim().toLowerCase()).filter(Boolean)
    );
    const toMs = Date.parse(customTo);
    const scope = `${selectedDatabase} / ${selectedSite || "All Sites"}`;

    return alerts
      .filter((alert) => {
        const createdMs = Date.parse(String(alert.createdAt ?? ""));
        if (Number.isFinite(fromMs) && Number.isFinite(createdMs) && createdMs < fromMs) return false;
        if (Number.isFinite(toMs) && Number.isFinite(createdMs) && createdMs > toMs) return false;
        const label = String(alert.eventLabel ?? "").trim().toLowerCase();
        const isLocationAlert = locationAlertNames.has(label)
          || /geofence|location entry|location exit|location started|location stopped/i.test(label);
        return isLocationAlert;
      })
      .map((alert) => {
        const eventDate = alert.createdAt ? new Date(alert.createdAt) : null;
        const locationName = String(alert.locationName ?? alert.site ?? "").trim();
        const driver = String(alert.driver ?? "").trim();
        return {
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric: locationName || "Location",
          value: driver || alert.assetLabel || "—",
          change: alert.eventLabel,
          scope,
          basis: runBasis,
          target: driver || alert.assetLabel || "—",
          dateRange: dateRangeLabel,
          locationName: locationName || "—",
          driverName: driver || "—",
          assetDescription: alert.assetLabel,
          eventDescription: alert.eventLabel,
          startDate: eventDate ? formatDateOnly(eventDate) : "",
          startTime: eventDate ? formatTimeOnly(eventDate) : ""
        };
      });
  };

  const buildStreamsActionReportRows = async (): Promise<ReportExportRow[] | null> => {
    const reportName = selectedReportName || "";
    if (selectedCategory !== "Notification Reports") return null;
    if (!/streams action report/i.test(reportName)) return null;

    const fromMs = Date.parse(customFrom);
    const toMs = Date.parse(customTo);
    const since = Number.isFinite(fromMs) ? new Date(fromMs).toISOString() : undefined;
    const alerts = await getUserAlertsFromApi(since).catch(() => []);
    const scope = `${selectedDatabase} / ${selectedSite || "All Sites"}`;

    return alerts
      .filter((alert) => {
        const createdMs = Date.parse(String(alert.createdAt ?? ""));
        if (Number.isFinite(fromMs) && Number.isFinite(createdMs) && createdMs < fromMs) return false;
        if (Number.isFinite(toMs) && Number.isFinite(createdMs) && createdMs > toMs) return false;
        return true;
      })
      .map((alert) => {
        const eventDate = alert.createdAt ? new Date(alert.createdAt) : null;
        const action = alert.action;
        const speed =
          Number.isFinite(Number(alert.speedKph)) ? `${Math.round(Number(alert.speedKph))}` : "";
        const distance =
          Number.isFinite(Number(alert.distanceKm)) ? `${Number(alert.distanceKm).toFixed(2)} km` : "";
        return {
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric: alert.eventLabel || "Stream",
          value: alert.assetLabel || "—",
          change: action?.decision ? String(action.decision).toUpperCase() : "Pending",
          scope,
          basis: runBasis,
          target: alert.assetLabel || "—",
          dateRange: dateRangeLabel,
          assetDescription: alert.assetLabel || "—",
          eventDescription: alert.eventLabel || "—",
          locationName: String(alert.locationName ?? alert.site ?? "").trim() || "—",
          driverName: String(alert.driver ?? "").trim() || "—",
          speedKph: speed || "—",
          distanceKm: distance || "—",
          eventValue: speed ? `${speed} km/h` : "—",
          actionDecision: action?.decision ? String(action.decision).toUpperCase() : "Pending",
          actionNote: String(action?.note ?? "").trim() || (action?.decision === "no" ? "—" : ""),
          actionedByName: String(action?.actionedByName ?? "").trim() || "—",
          actionedByEmail: String(action?.actionedByEmail ?? "").trim() || "—",
          startDate: eventDate ? formatDateOnly(eventDate) : "",
          startTime: eventDate ? formatTimeOnly(eventDate) : ""
        };
      });
  };

  const buildEventRows = async (): Promise<ReportExportRow[] | null> => {
    const reportName = selectedReportName || "";
    const isNotificationCategory = isNotificationBackedCategory(selectedCategory, reportName);
    const isEventReport = /event/i.test(reportName);
    if (!isNotificationCategory && !isEventReport) return null;
    if (selectedCategory === "Notification Reports" && selectedNotificationTypeSet.size === 0
      && !/overview|summary/i.test(reportName)) return [];

    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const resolved = await resolveAllDeviceIds();
    if (resolved.length === 0) return [];

    const isAggregatedNotification = selectedCategory === "Notification Reports"
      && (/overview\s*notification|summary\s*notification/i.test(reportName) || reportOutputMode === "summary");

    const allRows: ReportExportRow[] = [];
    const loadedEvents = await getTraccarEvents({
      from,
      to,
      deviceIds: resolved.map((row) => row.deviceId)
    });
    const eventsByDevice = groupByDeviceId(loadedEvents);
    for (const { registration, deviceId } of resolved) {
      const events = eventsByDevice.get(String(deviceId)) ?? [];
      const filteredEvents = showNotificationTypeSelector && selectedNotificationTypeSet.size > 0
        ? events.filter((event) => selectedNotificationTypeSet.has(String(event.type ?? "").trim()))
        : events;

      if (isAggregatedNotification) {
        const byType = new Map<string, { count: number; durationMs: number; lastTime: string; value: string }>();
        for (const event of filteredEvents) {
          const eventDescription = String((event as any).type ?? "event").trim() || "event";
          const eventTimeRaw = String((event as any).eventTime ?? (event as any).serverTime ?? (event as any).deviceTime ?? "").trim();
          const attributes = ((event as any).attributes ?? {}) as Record<string, unknown>;
          const durationSeconds = Number(attributes.duration ?? attributes.totalDuration ?? 0);
          const durationMs = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds * 1000 : 0;
          const eventValue = String(attributes.value ?? attributes.alarm ?? "");
          const current = byType.get(eventDescription) ?? { count: 0, durationMs: 0, lastTime: "", value: "" };
          current.count += 1;
          current.durationMs += durationMs;
          if (eventTimeRaw && (!current.lastTime || eventTimeRaw > current.lastTime)) current.lastTime = eventTimeRaw;
          if (eventValue) current.value = eventValue;
          byType.set(eventDescription, current);
        }
        for (const [eventDescription, agg] of byType.entries()) {
          const eventDate = agg.lastTime ? new Date(agg.lastTime) : null;
          allRows.push({
            category: selectedCategory,
            report: selectedReportName || selectedCategory,
            metric: eventDescription,
            value: String(agg.count),
            change: agg.lastTime,
            scope: `${selectedDatabase} / ${selectedSite}`,
            basis: runBasis,
            target: registration,
            dateRange: dateRangeLabel,
            assetDescription: registration,
            registrationNumber: registration,
            eventDescription,
            startDate: eventDate ? formatDateOnly(eventDate) : "",
            startTime: eventDate ? formatTimeOnly(eventDate) : "",
            endTime: eventDate && agg.durationMs > 0
              ? formatTimeOnly(new Date(eventDate.getTime() + agg.durationMs))
              : (eventDate ? formatTimeOnly(eventDate) : ""),
            occurrences: String(agg.count),
            eventValue: agg.value || String(agg.count),
            totalDuration: formatDurationHms(Math.max(agg.durationMs, 0) || 0)
          });
        }
        continue;
      }

      for (const event of filteredEvents) {
        const eventTimeRaw = String((event as any).eventTime ?? (event as any).serverTime ?? (event as any).deviceTime ?? "").trim();
        const eventDescription = String((event as any).type ?? "event").trim() || "event";
        const eventDate = eventTimeRaw ? new Date(eventTimeRaw) : null;
        const attributes = ((event as any).attributes ?? {}) as Record<string, unknown>;
        const durationSeconds = Number(attributes.duration ?? attributes.totalDuration ?? 0);
        const safeDurationMs = Number.isFinite(durationSeconds) && durationSeconds > 0
          ? durationSeconds * 1000
          : 0;
        const eventValue = String(attributes.value ?? attributes.alarm ?? (event as any).id ?? "");
        const endDate = eventDate && safeDurationMs > 0
          ? new Date(eventDate.getTime() + safeDurationMs)
          : eventDate;

        allRows.push({
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric: eventDescription,
          value: eventValue,
          change: eventTimeRaw,
          scope: `${selectedDatabase} / ${selectedSite}`,
          basis: runBasis,
          target: registration,
          dateRange: dateRangeLabel,
          assetDescription: registration,
          registrationNumber: registration,
          eventDescription,
          startDate: eventDate ? formatDateOnly(eventDate) : "",
          startTime: eventDate ? formatTimeOnly(eventDate) : "",
          endTime: endDate ? formatTimeOnly(endDate) : "",
          occurrences: "1",
          eventValue,
          totalDuration: formatDurationHms(safeDurationMs || 0)
        });
      }
    }
    return allRows;
  };

  const buildTripRows = async (): Promise<ReportExportRow[] | null> => {
    if (!isTripBackedCategory(selectedCategory, selectedReportName || "")) return null;

    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) return [];

    const isSummaryOutput = reportOutputMode === "summary" || /summary/i.test(selectedReportName || "");
    const allRows: ReportExportRow[] = [];
    const loadedTrips = await getTraccarTrips({
      from,
      to,
      deviceIds: assets.map((asset) => asset.deviceId)
    });
    const tripsByDevice = groupByDeviceId(loadedTrips);
    const report = selectedReportName || selectedCategory;

    for (const asset of assets) {
      const trips = [...(tripsByDevice.get(String(asset.deviceId)) ?? [])].sort(
        (a, b) => Date.parse(String(a.startTime ?? "")) - Date.parse(String(b.startTime ?? ""))
      );
      const base = {
        category: selectedCategory,
        report,
        scope: asset.siteName || selectedSite || "—",
        basis: runBasis,
        target: asset.registration,
        metric: asset.registration,
        dateRange: dateRangeLabel,
        assetDescription: asset.assetLabel || asset.registration,
        registrationNumber: asset.registration
      };

      if (isSummaryOutput) {
        const totalDistanceKm = trips.reduce((sum, trip) => sum + normalizeReportedDistanceKm(trip.distance), 0);
        const totalFuel = trips.reduce((sum, trip) => sum + Number(trip.spentFuel ?? 0), 0);
        const maxSpeed = trips.reduce((max, trip) => Math.max(max, Number(trip.maxSpeed ?? 0)), 0);
        const drivingMs = trips.reduce((sum, trip) => sum + computeTripDrivingDurationMs(trip), 0);
        allRows.push({
          ...base,
          rowKind: "tripSummary",
          value: String(trips.length),
          change: `${totalDistanceKm.toFixed(2)} km`,
          driverName: asset.driverName || "Unknown",
          distanceKm: totalDistanceKm.toFixed(2),
          totalDuration: formatDurationHms(drivingMs),
          speedKph: Math.round(maxSpeed * 1.852).toString(),
          fuelUsedL: totalFuel.toFixed(2)
        });
        continue;
      }

      for (const trip of trips) {
        const start = new Date(String(trip.startTime ?? ""));
        const end = new Date(String(trip.endTime ?? trip.startTime ?? ""));
        const drivingTime = formatDurationHms(computeTripDrivingDurationMs(trip));
        const distanceKm = normalizeReportedDistanceKm(trip.distance).toFixed(2);
        allRows.push({
          ...base,
          rowKind: "tripDetail",
          value: distanceKm,
          change: drivingTime,
          driverName: resolveTripDriverName(trip.driverName, asset) || "Unknown",
          startDate: formatReportDateTime(start),
          endTime: formatReportDateTime(end),
          startLocation: formatLocationLabel(trip.startAddress, "") || formatCoordinateLabel(trip.startLat, trip.startLon) || "—",
          endLocation: formatLocationLabel(trip.endAddress, "") || formatCoordinateLabel(trip.endLat, trip.endLon) || "—",
          totalDuration: drivingTime,
          distanceKm,
          avgSpeedKph: (Math.max(0, Number(trip.averageSpeed ?? 0)) * 1.852).toFixed(1),
          speedKph: Math.round(Math.max(0, Number(trip.maxSpeed ?? 0)) * 1.852).toString(),
          fuelUsedL: Number(trip.spentFuel ?? 0).toFixed(2)
        });
      }
    }
    return allRows;
  };

  const buildUnifiedAssetSummaryRows = async (): Promise<ReportExportRow[] | null> => {
    if (!isAssetSummaryReportView(
      selectedCategory,
      selectedReportName || "",
      shouldUseDetailTablePreview,
      runBasis,
      reportOutputMode
    )) {
      return null;
    }

    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) return [];

    const dayKeys = getDayKeysForCurrentRange();
    const report = selectedReportName || selectedCategory;
    return mapWithLimit(assets, 6, async (asset) => {
      const { trips, summary } = await loadMovementSummaryForAsset(asset, from, to);
      return buildAssetSummaryExportRow({
        registration: asset.registration,
        assetDescription: asset.assetLabel,
        siteName: asset.siteName || selectedSite || "—",
        trips,
        dayKeys,
        category: selectedCategory,
        report,
        basis: runBasis,
        dateRange: dateRangeLabel,
        summary
      });
    });
  };

  const buildMovementReportPreview = async (): Promise<MovementReportPreview | null> => {
    if (selectedCategory !== "Movement Reports") return null;
    if (runBasis !== "asset") return null;

    const movementReportName = resolveMovementReportName(selectedReportName || "");
    const isLocationReport = movementLocationReports.has(movementReportName) || movementLocationReports.has(selectedReportName || "");
    const variant: MovementReportVariant = isLocationReport ? "location" : "detailed";
    const columns = variant === "location"
      ? [...LOCATION_VISIT_COLUMNS]
      : [...DETAILED_MOVEMENT_TABLE_COLUMNS];

    const previewMeta = {
      reportName: selectedReportName || movementReportName || "Movement Report",
      organisation: selectedHierarchyMeta.organisation,
      dealer: selectedHierarchyMeta.dealer,
      database: selectedDatabase || "—",
      site: selectedSite || "—",
      registration: selectedScopeItems.join(", ") || "All",
      dateRange: `${formatReportDateTime(customFrom)} to ${formatReportDateTime(customTo)}`
    };

    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) {
      return { variant, columns, sections: [], ...previewMeta };
    }

    // Locations Not Visited: geofence definitions minus geofence visits in range.
    if (movementReportName === "Locations Not Visited Report" || selectedReportName === "Locations Not Visited Report") {
      const siteLocations = isGpsIotServer()
        ? await loadLocationGeofences().catch(() => [])
        : [];
      const geofenceDefs = isGpsIotServer()
        ? siteLocations.map((def) => ({
            id: String(def.gpsIotGeoId ?? def.id ?? "").trim(),
            name: String(def.name ?? def.description ?? def.gpsIotGeoId ?? def.id ?? "").trim(),
            description: String(def.description ?? "").trim()
          }))
        : await listTraccarGeofenceDefinitions().catch(() => []);

      const visitedKeys = new Set<string>();
      await Promise.all(assets.map(async (asset) => {
        const visits = await getTraccarGeofences({ from, to, deviceId: asset.deviceId }).catch(() => []);
        for (const visit of visits) {
          const id = String(visit.geofenceId ?? "").trim();
          if (id) visitedKeys.add(id);
          if (id) visitedKeys.add(id.toLowerCase());
        }
      }));

      // Resolve visit hashes back to location names for UK name matching.
      const visitedNames = new Set<string>();
      if (isGpsIotServer()) {
        for (const def of geofenceDefs) {
          const name = String(def.name ?? "").trim();
          if (!name) continue;
          let hash = 0;
          const lower = name.toLowerCase();
          for (let i = 0; i < lower.length; i += 1) {
            hash = ((hash << 5) - hash + lower.charCodeAt(i)) | 0;
          }
          const hashed = String(Math.abs(hash) || 1);
          if (visitedKeys.has(hashed) || visitedKeys.has(String(def.id ?? "")) || visitedKeys.has(lower)) {
            visitedNames.add(lower);
          }
        }
      }

      const notVisited = geofenceDefs.filter((def) => {
        const id = String(def.id ?? "").trim();
        const name = String(def.name ?? def.description ?? "").trim();
        if (isGpsIotServer()) {
          if (!name && !id) return false;
          if (visitedNames.has(name.toLowerCase())) return false;
          if (id && (visitedKeys.has(id) || visitedKeys.has(id.toLowerCase()))) return false;
          return true;
        }
        return Boolean(id) && !visitedKeys.has(id);
      });

      const sections: MovementAssetSection[] = assets.map((asset) => ({
        assetDescription: asset.assetLabel || "Asset",
        registrationNumber: asset.registration || "—",
        assetId: String(asset.deviceId ?? "—"),
        siteName: asset.siteName || selectedSite || "—",
        rows: notVisited.map((def) => ([
          asset.assetLabel || "Asset",
          asset.registration || "—",
          asset.driverName || "Unknown",
          asset.siteName || selectedSite || "—",
          "—",
          String(def.name ?? def.description ?? `Geofence ${def.id}`),
          "—",
          "Not visited",
          formatTripTimeZoneLabel(new Date(customFrom), asset.siteName || selectedSite || "", siteTimeZones),
          "—"
        ]))
      }));
      return { variant: "location", columns: [...LOCATION_VISIT_COLUMNS], sections, ...previewMeta };
    }

    if (movementReportName === "Location to Location Report" || selectedReportName === "Location to Location Report") {
      let locations = await loadLocationGeofences().catch(() => [] as LocationGeofence[]);
      if (locations.length === 0 && !isGpsIotServer()) {
        // No site-scoped library rows: fall back to the tenant's Traccar geofences.
        const tenantId = readActiveTenantId();
        locations = (await listTraccarGeofenceDefinitions().catch(() => []))
          .filter((def) => {
            const rowTenant = String(def.attributes?.viviTenantId ?? "").trim();
            return !rowTenant || !tenantId || rowTenant === tenantId;
          })
          .map((def) => ({
            id: String(def.id ?? ""),
            name: String(def.name ?? def.description ?? `Geofence ${def.id}`),
            type: "Geofence",
            area: String(def.area ?? "")
          }));
      }
      const geofences = resolveGeofenceShapes(locations);
      if (geofences.length === 0) {
        throw new Error("No geofenced locations found for this site. Add locations in the Location Library to run the Location to Location report.");
      }

      const gpsLegBundle = isGpsIotServer()
        ? await getGpsIotMovementBundle({ deviceIds: assets.map((asset) => asset.deviceId), from, to })
        : null;
      const cmsActive = cms808HierarchyActive() || isCms808Server();
      const traccarDeviceIds = gpsLegBundle || cmsActive ? [] : assets.map((asset) => asset.deviceId);
      const tripsByDevice = groupByDeviceId(
        gpsLegBundle
          ? gpsLegBundle.trips
          : traccarDeviceIds.length > 0
            ? await getTraccarTrips({ from, to, deviceIds: traccarDeviceIds })
            : []
      );

      const sections = await mapWithLimit(assets, 4, async (asset): Promise<MovementAssetSection> => {
        const cmsDevice = String(asset.deviceId ?? "").replace(/^cms808:/i, "");
        const useCms = cmsActive && (/^cms808:/i.test(String(asset.deviceId ?? "")) || /^\d{6,}$/.test(cmsDevice));
        const trips = useCms
          ? ((await loadCms808MovementTrips(cmsDevice, new Date(from), new Date(to), asset.registration).catch(() => [])) as unknown as TraccarTrip[])
          : (tripsByDevice.get(String(asset.deviceId)) ?? []);
        const legs = buildLocationToLocationLegs(trips, geofences);
        const siteName = asset.siteName || selectedSite || "—";
        const rows = legs.map((leg) => {
          const drivingHours = leg.drivingMs / 3_600_000;
          return [
            asset.assetLabel || "Asset",
            asset.registration || "—",
            leg.driverName || asset.driverName || "Unknown",
            siteName,
            leg.fromName,
            formatReportDateTime(new Date(leg.departedMs)),
            leg.toName,
            formatReportDateTime(new Date(leg.arrivedMs)),
            leg.distanceKm.toFixed(2),
            formatDurationHms(leg.durationMs),
            formatDurationHms(leg.drivingMs),
            String(leg.stopsEnRoute),
            drivingHours > 0 ? (leg.distanceKm / drivingHours).toFixed(1) : "0.0",
            Math.round(leg.maxSpeedKph).toString()
          ];
        });
        if (legs.length > 0) {
          const totalKm = legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
          const totalDrivingMs = legs.reduce((sum, leg) => sum + leg.drivingMs, 0);
          rows.push([
            "Totals",
            asset.registration || "—",
            "",
            "",
            `${legs.length} leg${legs.length === 1 ? "" : "s"}`,
            "",
            "",
            "",
            totalKm.toFixed(2),
            formatDurationHms(legs.reduce((sum, leg) => sum + leg.durationMs, 0)),
            formatDurationHms(totalDrivingMs),
            String(legs.reduce((sum, leg) => sum + leg.stopsEnRoute, 0)),
            totalDrivingMs > 0 ? (totalKm / (totalDrivingMs / 3_600_000)).toFixed(1) : "0.0",
            Math.round(Math.max(...legs.map((leg) => leg.maxSpeedKph))).toString()
          ]);
        }
        return {
          assetDescription: asset.assetLabel || "Asset",
          registrationNumber: asset.registration || "—",
          assetId: String(asset.deviceId ?? "—"),
          siteName,
          rows
        };
      });
      return { variant: "location", columns: [...LOCATION_TO_LOCATION_COLUMNS], sections, ...previewMeta };
    }

    const geocodeBudget = { remaining: 40 };
    const geocodeWithinBudget = async (lat: unknown, lng: unknown) => {
      if (geocodeBudget.remaining <= 0) {
        const parsedLat = Number(lat);
        const parsedLng = Number(lng);
        if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
          return `${parsedLat.toFixed(5)}, ${parsedLng.toFixed(5)}`;
        }
        return "";
      }
      geocodeBudget.remaining -= 1;
      return fetchReverseGeocodeLabel(lat, lng);
    };
    const gpsBundle = isGpsIotServer()
      ? await getGpsIotMovementBundle({
          deviceIds: assets.map((asset) => asset.deviceId),
          from,
          to
        })
      : null;
    const gpsTripsByDevice = gpsBundle ? groupByDeviceId(gpsBundle.trips) : null;
    const gpsStopsByDevice = gpsBundle ? groupByDeviceId(gpsBundle.stops) : null;

    const allPairData = await mapWithLimit(assets, 4, async (asset) => {
        const cmsDevice = String(asset.deviceId ?? "").replace(/^cms808:/i, "");
        const useCms = (cms808HierarchyActive() || isCms808Server()) && (
          /^cms808:/i.test(String(asset.deviceId ?? "")) || /^\d{6,}$/.test(cmsDevice)
        );
        if (useCms) {
          const trips = await loadCms808MovementTrips(cmsDevice, new Date(from), new Date(to), asset.registration).catch(() => []);
          return { ...asset, trips: trips as unknown as TraccarTrip[], routePoints: [] as Awaited<ReturnType<typeof getTraccarRoute>>, stops: [] as Awaited<ReturnType<typeof getTraccarStops>> };
        }
        const trips = gpsTripsByDevice
          ? (gpsTripsByDevice.get(String(asset.deviceId)) ?? [])
          : await getTraccarTrips({ from, to, deviceId: asset.deviceId }).catch(() => [] as TraccarTrip[]);
        const stops = gpsStopsByDevice
          ? (gpsStopsByDevice.get(String(asset.deviceId)) ?? [])
          : await getTraccarStops({ from, to, deviceId: asset.deviceId }).catch(() => []);
        // Missing trip addresses are reverse-geocoded from the trip's own start/end coordinates.
        // Pulling the full route per asset for this was the slowest call in the report and timed out.
        return { ...asset, trips, routePoints: [] as Awaited<ReturnType<typeof getTraccarRoute>>, stops };
      });

    const sections: MovementAssetSection[] = [];

    for (const assetData of allPairData) {
      const routeAddressCandidates = assetData.routePoints
        .map((point) => {
          const lat = Number((point as any)?.latitude);
          const lng = Number((point as any)?.longitude);
          const pointAddress = formatLocationLabel((point as any)?.address, "");
          const pointTimeRaw = String((point as any)?.fixTime ?? (point as any)?.deviceTime ?? (point as any)?.serverTime ?? "").trim();
          const pointMs = Date.parse(pointTimeRaw);
          if (!Number.isFinite(pointMs)) return null;
          if (!pointAddress && (!Number.isFinite(lat) || !Number.isFinite(lng))) return null;
          return { atMs: pointMs, address: pointAddress, lat, lng };
        })
        .filter((item): item is { atMs: number; address: string; lat: number; lng: number } => Boolean(item));

      const resolveAddressFromTripTime = async (
        tripAddressRaw: unknown,
        tripTimeRaw: unknown,
        fallbackLat?: unknown,
        fallbackLng?: unknown
      ) => {
        const direct = formatLocationLabel(tripAddressRaw, "");
        if (direct) return direct;

        const tripMs = Date.parse(String(tripTimeRaw ?? "").trim());
        if (Number.isFinite(tripMs) && routeAddressCandidates.length > 0) {
          let best: { atMs: number; address: string; lat: number; lng: number } | null = null;
          let smallestDelta = Number.POSITIVE_INFINITY;
          for (const candidate of routeAddressCandidates) {
            const delta = Math.abs(candidate.atMs - tripMs);
            if (delta < smallestDelta) {
              smallestDelta = delta;
              best = candidate;
            }
          }
          const maxAllowedDeltaMs = 45 * 60 * 1000;
          if (best && smallestDelta <= maxAllowedDeltaMs) {
            if (best.address) return best.address;
            const nearestResolved = await geocodeWithinBudget(best.lat, best.lng);
            if (nearestResolved) return nearestResolved;
          }
        }
        return geocodeWithinBudget(fallbackLat, fallbackLng);
      };

      const sortedTrips = [...assetData.trips].sort(
        (a, b) => Date.parse(String(a.startTime ?? "")) - Date.parse(String(b.startTime ?? ""))
      );

      const section: MovementAssetSection = {
        assetDescription: assetData.assetLabel || "Asset",
        registrationNumber: assetData.registration || "—",
        assetId: String(assetData.deviceId ?? "—"),
        siteName: assetData.siteName || selectedSite || "—",
        rows: []
      };

      if (variant === "location") {
        const locationRows = await Promise.all(sortedTrips.map(async (trip, index) => {
          const startTime = new Date(String(trip.startTime ?? ""));
          const endTime = new Date(String(trip.endTime ?? ""));
          const nextTrip = sortedTrips[index + 1];
          const nextStart = nextTrip ? new Date(String(nextTrip.startTime ?? "")) : null;
          const gapStandingMs = nextStart && Number.isFinite(endTime.getTime()) && nextStart.getTime() > endTime.getTime()
            ? nextStart.getTime() - endTime.getTime()
            : 0;
          const stopStandingMs = (() => {
            const endMs = endTime.getTime();
            if (!Number.isFinite(endMs)) return 0;
            const matched = (assetData.stops || []).find((stop) => {
              const stopStart = Date.parse(String(stop.startTime ?? ""));
              return Number.isFinite(stopStart) && Math.abs(stopStart - endMs) <= 5 * 60 * 1000;
            });
            if (!matched) return 0;
            const duration = Number(matched.duration ?? 0);
            if (Number.isFinite(duration) && duration > 0) return duration;
            const stopEnd = Date.parse(String(matched.endTime ?? ""));
            return Number.isFinite(stopEnd) && stopEnd > endMs ? stopEnd - endMs : 0;
          })();
          const standingMs = stopStandingMs > 0 ? stopStandingMs : gapStandingMs;

          const startAddress = await resolveAddressFromTripTime(
            trip.startAddress,
            trip.startTime,
            trip.startLat,
            trip.startLon
          );
          const endAddress = await resolveAddressFromTripTime(
            trip.endAddress,
            trip.endTime,
            trip.endLat,
            trip.endLon
          );

          return [
            section.assetDescription,
            section.registrationNumber,
            resolveTripDriverName(trip.driverName, assetData) || "Unknown",
            section.siteName,
            formatReportDateTime(startTime),
            startAddress || "—",
            formatReportDateTime(endTime),
            endAddress || "—",
            formatTripTimeZoneLabel(startTime, section.siteName, siteTimeZones),
            standingMs > 0 ? formatDurationHms(standingMs) : "—"
          ];
        }));
        section.rows = locationRows;
      } else {
        const metrics: Array<{ drivingMs: number; distanceKm: number; standingMs: number }> = [];
        const detailedRows = await Promise.all(sortedTrips.map(async (trip, index) => {
          const startTime = new Date(String(trip.startTime ?? ""));
          const endTime = new Date(String(trip.endTime ?? ""));
          const nextTrip = sortedTrips[index + 1];
          const nextStart = nextTrip ? new Date(String(nextTrip.startTime ?? "")) : null;

          const durationMs = Number.isFinite(Number(trip.duration)) && Number(trip.duration) > 0
            ? Number(trip.duration)
            : Math.max(0, endTime.getTime() - startTime.getTime());
          const gapStandingMs = nextStart && Number.isFinite(endTime.getTime()) && nextStart.getTime() > endTime.getTime()
            ? nextStart.getTime() - endTime.getTime()
            : 0;
          const stopStandingMs = (() => {
            const endMs = endTime.getTime();
            if (!Number.isFinite(endMs)) return 0;
            const matched = (assetData.stops || []).find((stop) => {
              const stopStart = Date.parse(String(stop.startTime ?? ""));
              return Number.isFinite(stopStart) && Math.abs(stopStart - endMs) <= 5 * 60 * 1000;
            });
            if (!matched) return 0;
            const duration = Number(matched.duration ?? 0);
            if (Number.isFinite(duration) && duration > 0) return duration;
            const stopEnd = Date.parse(String(matched.endTime ?? ""));
            return Number.isFinite(stopEnd) && stopEnd > endMs ? stopEnd - endMs : 0;
          })();
          const standingMs = stopStandingMs > 0 ? stopStandingMs : gapStandingMs;
          const distanceKm = Math.max(0, Number(trip.distance ?? 0) / 1000);
          const maxSpeedKph = Math.max(0, Number(trip.maxSpeed ?? 0) * 1.852);

          metrics.push({ drivingMs: durationMs, distanceKm, standingMs });

          const departedFrom = await resolveAddressFromTripTime(
            trip.startAddress,
            trip.startTime,
            trip.startLat,
            trip.startLon
          );
          const arrivedAt = await resolveAddressFromTripTime(
            trip.endAddress,
            trip.endTime,
            trip.endLat,
            trip.endLon
          );

          return [
            formatDateOnly(startTime),
            resolveTripDriverName(trip.driverName, assetData) || "Unknown",
            formatTimeOnly(startTime),
            departedFrom || "—",
            formatDurationHms(durationMs),
            distanceKm.toFixed(2),
            Math.round(maxSpeedKph).toString(),
            formatTimeOnly(endTime),
            arrivedAt || "—",
            nextStart ? formatNextDepartureLabel(nextStart) : "—",
            standingMs > 0 ? formatDurationHms(standingMs) : "00:00:00"
          ];
        }));

        section.rows = detailedRows;
        const summary = summarizeDetailedMovementSection(metrics);
        section.totals = summary.totals;
        section.averages = summary.averages;
      }

      sections.push(section);
    }

    return {
      variant,
      columns,
      sections,
      ...previewMeta,
      registration: assets.map((asset) => asset.registration).join(", ") || "All"
    };
  };

  const buildDetailPreviewMeta = () => {
    const siteLabel = selectedSites.length > 0 ? selectedSites.join(", ") : (selectedSite || "All Sites");
    return {
      reportName: selectedReportName || selectedCategory,
      organisation: selectedHierarchyMeta.organisation,
      dealer: selectedHierarchyMeta.dealer,
      database: selectedDatabase || "—",
      site: siteLabel,
      dateRange: `${formatReportDateTime(customFrom)} to ${formatReportDateTime(customTo)}`
    };
  };

  const buildAssetUtilisationDetailPreview = async (): Promise<UtilisationDetailPreview | null> => {
    if (!isAssetUtilisationReportName(selectedReportName || "")) return null;
    if (runBasis !== "asset") return null;

    const rangeStartMs = new Date(customFrom).getTime();
    const rangeEndMs = new Date(customTo).getTime();
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const assets = await resolveScopedReportAssets();
    const loadedTrips = await getTraccarTrips({
      from,
      to,
      deviceIds: assets.map((asset) => asset.deviceId)
    });
    const tripsByDevice = groupByDeviceId(loadedTrips);
    const tableRows = assets.map((asset) => {
      const trips = tripsByDevice.get(String(asset.deviceId)) ?? [];
      const metrics = computeAssetUtilisationFromTrips(trips, rangeStartMs, rangeEndMs);
      return assetUtilisationMetricsToRow(
        asset.siteName || selectedSite || "—",
        asset.assetLabel || "Asset",
        asset.registration || "—",
        metrics
      );
    });

    return {
      kind: "utilisation",
      columns: [...ASSET_UTILISATION_COLUMNS],
      tableRows,
      ...buildDetailPreviewMeta()
    };
  };

  const buildTripDetailPreview = async (): Promise<TripDetailPreview | null> => {
    if (selectedCategory !== "Trip Reports" || runBasis !== "asset") return null;
    const assets = await resolveScopedReportAssets();
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const loadedTrips = await getTraccarTrips({
      from,
      to,
      deviceIds: assets.map((asset) => asset.deviceId)
    });
    const tripsByDevice = groupByDeviceId(loadedTrips);
    const batches = assets.map((asset) => ({
      asset,
      trips: tripsByDevice.get(String(asset.deviceId)) ?? []
    }));

    // Addresses: Traccar's own first, then a bounded reverse-geocode, then coordinates.
    const geocodeBudget = { remaining: 24 };
    const resolveTripLocation = async (address: unknown, lat: unknown, lng: unknown) => {
      const direct = formatLocationLabel(address, "");
      if (direct) return direct;
      if (geocodeBudget.remaining > 0) {
        geocodeBudget.remaining -= 1;
        const resolved = await fetchReverseGeocodeLabel(lat, lng);
        if (resolved) return resolved;
      }
      return formatCoordinateLabel(lat, lng) || "—";
    };

    const tripDetailRows: TripDetailRow[] = [];
    for (const batch of batches) {
      const sortedTrips = [...batch.trips].sort(
        (a, b) => Date.parse(String(a.startTime ?? "")) - Date.parse(String(b.startTime ?? ""))
      );
      const locations = await Promise.all(sortedTrips.map(async (trip) => ({
        start: await resolveTripLocation(trip.startAddress, trip.startLat, trip.startLon),
        end: await resolveTripLocation(trip.endAddress, trip.endLat, trip.endLon)
      })));
      for (const [tripIndex, trip] of sortedTrips.entries()) {
        const start = new Date(String((trip as any)?.startTime ?? ""));
        const end = new Date(String((trip as any)?.endTime ?? (trip as any)?.startTime ?? ""));
        const durationMs = Number.isFinite(Number((trip as any)?.duration)) && Number((trip as any)?.duration) > 0
          ? Number((trip as any)?.duration)
          : Math.max(0, end.getTime() - start.getTime());
        const distanceKm = Math.max(0, Number((trip as any)?.distance ?? 0) / 1000);
        const avgSpeed = Math.max(0, Number((trip as any)?.averageSpeed ?? 0) * 1.852);
        const drivingMs = avgSpeed > 0 && distanceKm > 0 ? (distanceKm / avgSpeed) * 3_600_000 : durationMs;
        const standingMs = Math.max(durationMs - drivingMs, 0);
        const standingPct = durationMs > 0 ? standingMs / durationMs : 0;
        tripDetailRows.push({
          assetLabel: batch.asset.assetLabel,
          registration: batch.asset.registration || "—",
          assetId: String(batch.asset.deviceId ?? "—"),
          siteName: batch.asset.siteName || selectedSite || "—",
          driver: resolveTripDriverName(trip.driverName, batch.asset) || "Unknown",
          startLocation: locations[tripIndex].start,
          endLocation: locations[tripIndex].end,
          date: formatDateOnly(start),
          tripStart: formatReportDateTime(start),
          tripEnd: formatReportDateTime(end),
          standingPct: standingPct.toFixed(6),
          drivingTime: formatDurationHms(drivingMs),
          standingTime: formatDurationHms(standingMs),
          duration: formatDurationHms(durationMs),
          distanceKm: distanceKm.toFixed(3),
          avgSpeedKph: avgSpeed.toFixed(5),
          maxSpeedKph: Math.max(0, Number((trip as any)?.maxSpeed ?? 0) * 1.852).toFixed(0)
        });
      }
    }

    const { totals, averages } = summarizeTripDetailRows(tripDetailRows);
    return {
      kind: "trip",
      ...buildDetailPreviewMeta(),
      rows: tripDetailRows,
      totals,
      averages
    };
  };

  const buildFuelDetailPreview = async (): Promise<FuelDetailPreview | null> => {
    if (selectedCategory !== "Fuel Reports") return null;

    const reportName = normalizeFuelReportName(selectedReportName || "");
    const fuelKind = resolveFuelReportKind(reportName, reportOutputMode);
    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const resolved = await resolveAllDeviceIds();
    const periodStart = formatReportDateTime(customFrom);
    const periodEnd = formatReportDateTime(customTo);
    const toNumber = (value: unknown) => {
      const n = Number(value ?? 0);
      return Number.isFinite(n) ? n : 0;
    };

    const tableRows: string[][] = [];
    const fuelSections: FuelAssetSection[] = [];
    const columns = fuelKind === "trip-detail" ? [...FUEL_TRIP_SECTION_COLUMNS] : fuelReportColumns[fuelKind];
    let totalDashboardDistance = 0;
    let totalDashboardFuel = 0;
    let totalDashboardHours = 0;
    let dashboardAssetCount = 0;

    const formatEventLocation = (lat?: number, lng?: number) => {
      if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
        return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
      return "—";
    };

    type FuelPrefetch = {
      info: Awaited<ReturnType<typeof getGpsIotFuelInfo>> | null;
      trips: TraccarTrip[];
      route: Awaited<ReturnType<typeof getTraccarRoute>>;
      events: TraccarEvent[];
    };
    const fuelPrefetch = new Map<string, FuelPrefetch>();
    if (isGpsIotServer()) {
      await mapWithLimit(resolved, 6, async (asset) => {
        const assetId = String(asset.gpsIotAssetId || "").trim();
        const assetImei = String(asset.imei || "").trim();
        const info = !assetId && !assetImei
          ? null
          : await getGpsIotFuelInfo({
            assetId: assetId || undefined,
            imei: assetImei || undefined,
            startDate: formatGpsIotFuelStamp(new Date(customFrom)),
            endDate: formatGpsIotFuelStamp(new Date(customTo)),
            timeZoneId: "UTC"
          }).catch(() => null);
        fuelPrefetch.set(String(asset.deviceId), { info, trips: [], route: [], events: [] });
      });
      if (fuelKind === "start-stop") {
        const ignitionEvents = await getTraccarEvents({
          from,
          to,
          deviceIds: resolved.map((row) => row.deviceId),
          type: ["ignitionOn", "ignitionOff", "Ignition On", "Ignition Off", "ignition"]
        }).catch(() => [] as TraccarEvent[]);
        for (const [id, events] of groupByDeviceId(ignitionEvents)) {
          const current = fuelPrefetch.get(id);
          if (current) current.events = events;
        }
      }
    } else {
      const deviceIds = resolved.map((row) => row.deviceId);
      const [allTrips, allEvents] = await Promise.all([
        getTraccarTrips({ from, to, deviceIds }).catch(() => [] as TraccarTrip[]),
        fuelKind === "fuel-notifications" || fuelKind === "start-stop"
          ? getTraccarEvents({ from, to, deviceIds }).catch(() => [] as TraccarEvent[])
          : Promise.resolve([] as TraccarEvent[])
      ]);
      const tripsByDevice = groupByDeviceId(allTrips);
      const eventsByDevice = groupByDeviceId(allEvents);
      await mapWithLimit(resolved, 4, async (asset) => {
        const route = await getTraccarRoute({ from, to, deviceId: asset.deviceId }).catch(() => []);
        fuelPrefetch.set(String(asset.deviceId), {
          info: null,
          trips: tripsByDevice.get(String(asset.deviceId)) ?? [],
          route,
          events: eventsByDevice.get(String(asset.deviceId)) ?? []
        });
      });
    }

    for (const { registration, deviceId, fuelTankCapacityLiters, gpsIotAssetId, imei } of resolved) {
      const assetLabel = registration || "Asset";
      const prefetched = fuelPrefetch.get(String(deviceId));

      // UK GPS IoT: AssetFuelInfo + GetFuelTelemetry (litres) merged for Live + Reports.
      if (isGpsIotServer()) {
        const assetId = String(gpsIotAssetId || "").trim();
        const assetImei = String(imei || "").trim();
        if (!assetId && !assetImei) continue;
        const info = prefetched?.info ?? null;
        if (!info) continue;

        const distanceKm = Math.max(0, Number(info.totalDistance) || 0);
        const usedFuel = Math.max(0, Number(info.fuelUsed) || 0);
        const engineHours = Math.max(0, Number(info.totalEngineHours) || 0);
        const efficiency = gpsIotFuelEfficiencyLPerKm(info);

        if (fuelKind === "trip-detail") {
          const section: FuelAssetSection = {
            assetDescription: assetLabel,
            registrationNumber: registration || "—",
            assetId: assetId,
            siteName: selectedSite || "—",
            rows: [[
              periodStart,
              periodEnd,
              distanceKm.toFixed(2),
              usedFuel.toFixed(2),
              efficiency.toFixed(3),
              engineHours.toFixed(2)
            ]]
          };
          const summary = summarizeFuelTripSection(section.rows);
          section.totals = summary.totals;
          section.averages = summary.averages;
          fuelSections.push(section);
          continue;
        }

        if (fuelKind === "refills") {
          info.refills.forEach((event) => {
            const atMs = parseGpsIotFuelDateMs(event.date);
            tableRows.push([
              assetLabel,
              Number.isFinite(atMs) ? formatReportDateTime(new Date(atMs)) : String(event.date),
              event.location || formatEventLocation(event.latitude, event.longitude),
              Number(event.filled || 0).toFixed(2),
              Number(event.initialLevel || 0).toFixed(2),
              Number(event.finalLevel || 0).toFixed(2)
            ]);
          });
          continue;
        }

        if (fuelKind === "drops") {
          info.drains.forEach((event) => {
            const atMs = parseGpsIotFuelDateMs(event.date);
            tableRows.push([
              assetLabel,
              Number.isFinite(atMs) ? formatReportDateTime(new Date(atMs)) : String(event.date),
              event.location || formatEventLocation(event.latitude, event.longitude),
              Number(event.drained || 0).toFixed(2),
              Number(event.initialLevel || 0).toFixed(2),
              Number(event.finalLevel || 0).toFixed(2)
            ]);
          });
          continue;
        }

        if (fuelKind === "fuel-notifications") {
          [...info.refills.map((event) => ({ ...event, kind: "Refill" as const, volume: event.filled })),
            ...info.drains.map((event) => ({ ...event, kind: "Drain" as const, volume: event.drained }))]
            .sort((a, b) => parseGpsIotFuelDateMs(a.date) - parseGpsIotFuelDateMs(b.date))
            .forEach((event) => {
              const atMs = parseGpsIotFuelDateMs(event.date);
              tableRows.push([
                assetLabel,
                Number.isFinite(atMs) ? formatReportDateTime(new Date(atMs)) : String(event.date),
                event.kind,
                `${event.kind} ${Number(event.volume || 0).toFixed(2)} L`,
                Number(event.volume || 0).toFixed(2)
              ]);
            });
          continue;
        }

        if (fuelKind === "comparative") {
          tableRows.push([
            assetLabel,
            distanceKm.toFixed(2),
            usedFuel.toFixed(2),
            efficiency.toFixed(3),
            engineHours.toFixed(2),
            ""
          ]);
          continue;
        }

        if (fuelKind === "dashboard") {
          dashboardAssetCount += 1;
          totalDashboardDistance += distanceKm;
          totalDashboardFuel += usedFuel;
          totalDashboardHours += engineHours;
          continue;
        }

        if (fuelKind === "monthly-summary") {
          const monthBuckets = new Map<string, { distance: number; fuel: number; hours: number }>();
          const bump = (atMs: number, fuelDelta: number) => {
            if (!Number.isFinite(atMs)) return;
            const monthKey = new Date(atMs).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
            const bucket = monthBuckets.get(monthKey) ?? { distance: 0, fuel: 0, hours: 0 };
            bucket.fuel += fuelDelta;
            monthBuckets.set(monthKey, bucket);
          };
          info.refills.forEach((event) => bump(parseGpsIotFuelDateMs(event.date), 0));
          info.drains.forEach((event) => bump(parseGpsIotFuelDateMs(event.date), Number(event.drained) || 0));
          if (monthBuckets.size === 0) {
            const monthKey = new Date(customFrom).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
            monthBuckets.set(monthKey, { distance: distanceKm, fuel: usedFuel, hours: engineHours });
          } else if (monthBuckets.size === 1) {
            const only = monthBuckets.values().next().value!;
            only.distance = distanceKm;
            only.fuel = usedFuel > 0 ? usedFuel : only.fuel;
            only.hours = engineHours;
          }
          Array.from(monthBuckets.entries()).forEach(([monthKey, stats]) => {
            tableRows.push([
              assetLabel,
              monthKey,
              stats.distance.toFixed(2),
              stats.fuel.toFixed(2),
              stats.distance > 0 ? (stats.fuel / stats.distance).toFixed(3) : "0.000",
              stats.hours.toFixed(2)
            ]);
          });
          continue;
        }

        if (fuelKind === "engine-hours-daily") {
          tableRows.push([
            assetLabel,
            periodStart.slice(0, 10),
            engineHours.toFixed(2),
            usedFuel.toFixed(2),
            distanceKm.toFixed(2),
            efficiency.toFixed(3)
          ]);
          continue;
        }

        if (fuelKind === "engine-hours-detail") {
          tableRows.push([
            assetLabel,
            periodStart,
            periodEnd,
            engineHours.toFixed(2),
            usedFuel.toFixed(2),
            distanceKm.toFixed(2),
            efficiency.toFixed(3)
          ]);
          continue;
        }

        if (fuelKind === "period-summary") {
          tableRows.push([
            assetLabel,
            periodStart,
            periodEnd,
            distanceKm.toFixed(2),
            usedFuel.toFixed(2),
            efficiency.toFixed(3),
            engineHours.toFixed(2)
          ]);
          continue;
        }

        if (fuelKind === "start-stop") {
          // Prefer ignition on/off cycles from GetTelemetry / GetNotificationAlerts.
          const ignitionEvents = prefetched?.events ?? [];
          const ignitionRows = ignitionEvents
            .filter((event) => {
              const bag = [
                event.type,
                (event.attributes as any)?.eventName,
                (event.attributes as any)?.event,
                (event.attributes as any)?.alarm
              ]
                .map((value) => String(value ?? "").toLowerCase())
                .join(" ");
              return /ignition/.test(bag);
            })
            .sort((a, b) => Date.parse(String(a.eventTime ?? "")) - Date.parse(String(b.eventTime ?? "")));

          if (ignitionRows.length) {
            for (const event of ignitionRows) {
              const attrs = (event.attributes ?? {}) as Record<string, unknown>;
              const label = String(attrs.eventName ?? attrs.event ?? event.type ?? "Ignition");
              const at = String(event.eventTime ?? "");
              const level = Number(attrs.fuel ?? attrs.fuelLevel ?? attrs.level ?? NaN);
              tableRows.push([
                assetLabel,
                at ? formatReportDateTime(new Date(at)) : "—",
                Number.isFinite(level) ? level.toFixed(2) : "—",
                /off|false|0/.test(label.toLowerCase()) ? "Ignition Off" : "Ignition On",
                Number.isFinite(level) ? level.toFixed(2) : "—",
                "—",
                String(attrs.address ?? attrs.location ?? ""),
                "—"
              ]);
            }
          } else {
            // AssetFuelInfo has no ignition cycles — surface refill/drain as level changes.
            info.refills.forEach((event) => {
              const atMs = parseGpsIotFuelDateMs(event.date);
              tableRows.push([
                assetLabel,
                Number.isFinite(atMs) ? formatReportDateTime(new Date(atMs)) : String(event.date),
                Number(event.initialLevel || 0).toFixed(2),
                "—",
                Number(event.finalLevel || 0).toFixed(2),
                Number(event.filled || 0).toFixed(2),
                event.location || formatEventLocation(event.latitude, event.longitude),
                "—"
              ]);
            });
          }
          continue;
        }

        continue;
      }

      if (fuelKind === "trip-detail") {
        const trips = prefetched?.trips ?? [];
        const route = prefetched?.route ?? [];
        const section: FuelAssetSection = {
          assetDescription: assetLabel,
          registrationNumber: registration || "—",
          assetId: String(deviceId),
          siteName: selectedSite || "—",
          rows: []
        };

        if (trips.length > 0) {
          for (const trip of trips) {
            const start = new Date(String(trip.startTime ?? ""));
            const end = new Date(String(trip.endTime ?? trip.startTime ?? ""));
            const startMs = start.getTime();
            const endMs = end.getTime();
            const durationMs = Number.isFinite(endMs - startMs) && endMs >= startMs
              ? endMs - startMs
              : Math.max(0, toNumber(trip.duration));
            const distanceKm = Math.max(0, Number(trip.distance ?? 0) / 1000);
            const usedFuel = computeTripUsedFuelLitres({
              spentFuel: trip.spentFuel,
              routePoints: route,
              startMs,
              endMs,
              distanceKm,
              tankCapacityLiters: fuelTankCapacityLiters
            });
            section.rows.push([
              formatReportDateTime(start),
              formatReportDateTime(end),
              distanceKm.toFixed(2),
              usedFuel.toFixed(2),
              distanceKm > 0 ? (usedFuel / distanceKm).toFixed(3) : "0.000",
              (durationMs / 3_600_000).toFixed(2)
            ]);
          }
        } else {
          const summaries = await getTraccarSummary({ from, to, deviceId });
          for (const summary of summaries) {
            const distanceKm = normalizeReportedDistanceKm(summary.distance);
            const usedFuel = computeTripUsedFuelLitres({
              spentFuel: summary.spentFuel,
              routePoints: route,
              startMs: new Date(customFrom).getTime(),
              endMs: new Date(customTo).getTime(),
              distanceKm,
              tankCapacityLiters: fuelTankCapacityLiters
            });
            section.rows.push([
              periodStart,
              periodEnd,
              distanceKm.toFixed(2),
              usedFuel.toFixed(2),
              distanceKm > 0 ? (usedFuel / distanceKm).toFixed(3) : "0.000",
              toNumber(summary.engineHours).toFixed(2)
            ]);
          }
        }

        const summary = summarizeFuelTripSection(section.rows);
        section.totals = summary.totals;
        section.averages = summary.averages;
        fuelSections.push(section);
        continue;
      }

      const trips = prefetched?.trips ?? [];
      const route = prefetched?.route ?? [];
      const events = prefetched?.events ?? [];

      if (fuelKind === "refills" || fuelKind === "drops") {
        const trendEvents = extractFuelTrendEventsFromRoute({
          routePoints: route,
          tankCapacityLiters: fuelTankCapacityLiters,
          risingOnly: fuelKind === "refills",
          droppingOnly: fuelKind === "drops"
        });
        trendEvents.forEach((event) => {
          tableRows.push([
            assetLabel,
            formatReportDateTime(new Date(event.atMs)),
            formatEventLocation(event.lat, event.lng),
            event.volumeLitres.toFixed(2),
            event.fromLevel.toFixed(2),
            event.toLevel.toFixed(2)
          ]);
        });
        continue;
      }

      if (fuelKind === "start-stop") {
        const startStopRows = extractFuelStartStopFromRoute({
          routePoints: route,
          tankCapacityLiters: fuelTankCapacityLiters
        });
        startStopRows.forEach((row) => {
          tableRows.push([
            assetLabel,
            formatReportDateTime(new Date(row.ignitionOnAtMs)),
            row.fuelStartLitres.toFixed(2),
            row.ignitionOffAtMs != null ? formatReportDateTime(new Date(row.ignitionOffAtMs)) : "—",
            row.fuelStopLitres != null ? row.fuelStopLitres.toFixed(2) : "—",
            row.usedLitres != null ? row.usedLitres.toFixed(2) : "—",
            formatEventLocation(row.startLat, row.startLng),
            formatEventLocation(row.stopLat, row.stopLng)
          ]);
        });
        continue;
      }

      if (fuelKind === "fuel-notifications") {
        events
          .filter((event) => /fuel|refuel|siphon|drop/i.test(String(event.type ?? event.attributes?.alarm ?? "")))
          .forEach((event) => {
            tableRows.push([
              assetLabel,
              formatReportDateTime(String(event.eventTime ?? event.serverTime ?? "")),
              String(event.type ?? "fuel"),
              String(event.attributes?.alarm ?? event.attributes?.message ?? event.type ?? "Fuel event"),
              String(event.attributes?.fuel ?? event.attributes?.value ?? "—")
            ]);
          });
        continue;
      }

      if (fuelKind === "engine-hours-daily") {
        const byDay = new Map<string, { engineHours: number; fuel: number; distance: number }>();
        for (const trip of trips) {
          const start = new Date(String(trip.startTime ?? ""));
          const dayKey = start.toISOString().slice(0, 10);
          const startMs = start.getTime();
          const endMs = new Date(String(trip.endTime ?? trip.startTime ?? "")).getTime();
          const durationMs = Number.isFinite(endMs - startMs) && endMs >= startMs
            ? endMs - startMs
            : Math.max(0, toNumber(trip.duration));
          const distanceKm = Math.max(0, Number(trip.distance ?? 0) / 1000);
          const usedFuel = computeTripUsedFuelLitres({
            spentFuel: trip.spentFuel,
            routePoints: route,
            startMs,
            endMs,
            distanceKm,
            tankCapacityLiters: fuelTankCapacityLiters
          });
          const bucket = byDay.get(dayKey) ?? { engineHours: 0, fuel: 0, distance: 0 };
          bucket.engineHours += durationMs / 3_600_000;
          bucket.fuel += usedFuel;
          bucket.distance += distanceKm;
          byDay.set(dayKey, bucket);
        }
        Array.from(byDay.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([dayKey, stats]) => {
            tableRows.push([
              assetLabel,
              dayKey,
              stats.engineHours.toFixed(2),
              stats.fuel.toFixed(2),
              stats.distance.toFixed(2),
              stats.distance > 0 ? (stats.fuel / stats.distance).toFixed(3) : "0.000"
            ]);
          });
        continue;
      }

      if (fuelKind === "comparative") {
        const summaries = await getTraccarSummary({ from, to, deviceId });
        const summary = summaries[0];
        const distanceKm = normalizeReportedDistanceKm(summary?.distance);
        const usedFuel = computeTripUsedFuelLitres({
          spentFuel: summary?.spentFuel,
          routePoints: route,
          startMs: new Date(customFrom).getTime(),
          endMs: new Date(customTo).getTime(),
          distanceKm,
          tankCapacityLiters: fuelTankCapacityLiters
        });
        tableRows.push([
          assetLabel,
          distanceKm.toFixed(2),
          usedFuel.toFixed(2),
          distanceKm > 0 ? (usedFuel / distanceKm).toFixed(3) : "0.000",
          toNumber(summary?.engineHours).toFixed(2),
          ""
        ]);
        continue;
      }

      if (fuelKind === "dashboard") {
        const summaries = await getTraccarSummary({ from, to, deviceId });
        const summary = summaries[0];
        const distanceKm = normalizeReportedDistanceKm(summary?.distance);
        const usedFuel = computeTripUsedFuelLitres({
          spentFuel: summary?.spentFuel,
          routePoints: route,
          startMs: new Date(customFrom).getTime(),
          endMs: new Date(customTo).getTime(),
          distanceKm,
          tankCapacityLiters: fuelTankCapacityLiters
        });
        dashboardAssetCount += 1;
        totalDashboardDistance += distanceKm;
        totalDashboardFuel += usedFuel;
        totalDashboardHours += toNumber(summary?.engineHours);
        continue;
      }

      if (fuelKind === "monthly-summary") {
        const monthBuckets = new Map<string, { distance: number; fuel: number; hours: number }>();
        const bucketTrip = (startMs: number, endMs: number, distanceKm: number, spentFuel: unknown, durationMs: number) => {
          const monthKey = new Date(startMs).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
          const usedFuel = computeTripUsedFuelLitres({
            spentFuel,
            routePoints: route,
            startMs,
            endMs,
            distanceKm,
            tankCapacityLiters: fuelTankCapacityLiters
          });
          const bucket = monthBuckets.get(monthKey) ?? { distance: 0, fuel: 0, hours: 0 };
          bucket.distance += distanceKm;
          bucket.fuel += usedFuel;
          bucket.hours += durationMs / 3_600_000;
          monthBuckets.set(monthKey, bucket);
        };

        if (trips.length > 0) {
          trips.forEach((trip) => {
            const startMs = new Date(String(trip.startTime ?? "")).getTime();
            const endMs = new Date(String(trip.endTime ?? trip.startTime ?? "")).getTime();
            const durationMs = Number.isFinite(endMs - startMs) && endMs >= startMs
              ? endMs - startMs
              : Math.max(0, toNumber(trip.duration));
            bucketTrip(startMs, endMs, Math.max(0, Number(trip.distance ?? 0) / 1000), trip.spentFuel, durationMs);
          });
        } else {
          const summaries = await getTraccarSummary({ from, to, deviceId });
          summaries.forEach((summary) => {
            bucketTrip(
              new Date(customFrom).getTime(),
              new Date(customTo).getTime(),
              normalizeReportedDistanceKm(summary.distance),
              summary.spentFuel,
              toNumber(summary.engineHours) * 3_600_000
            );
          });
        }

        Array.from(monthBuckets.entries()).forEach(([monthKey, stats]) => {
          tableRows.push([
            assetLabel,
            monthKey,
            stats.distance.toFixed(2),
            stats.fuel.toFixed(2),
            stats.distance > 0 ? (stats.fuel / stats.distance).toFixed(3) : "0.000",
            stats.hours.toFixed(2)
          ]);
        });
        continue;
      }

      if (fuelKind === "period-summary") {
        const summaries = await getTraccarSummary({ from, to, deviceId });
        for (const summary of summaries) {
          const distanceKm = normalizeReportedDistanceKm(summary.distance);
          const usedFuel = computeTripUsedFuelLitres({
            spentFuel: summary.spentFuel,
            routePoints: route,
            startMs: new Date(customFrom).getTime(),
            endMs: new Date(customTo).getTime(),
            distanceKm,
            tankCapacityLiters: fuelTankCapacityLiters
          });
          tableRows.push([
            String(summary.deviceName ?? assetLabel),
            periodStart,
            periodEnd,
            distanceKm.toFixed(2),
            usedFuel.toFixed(2),
            distanceKm > 0 ? (usedFuel / distanceKm).toFixed(3) : "0.000",
            toNumber(summary.engineHours).toFixed(2)
          ]);
        }
        continue;
      }

      if (trips.length > 0) {
        for (const trip of trips) {
          const start = new Date(String(trip.startTime ?? ""));
          const end = new Date(String(trip.endTime ?? trip.startTime ?? ""));
          const startMs = start.getTime();
          const endMs = end.getTime();
          const durationMs = Number.isFinite(endMs - startMs) && endMs >= startMs
            ? endMs - startMs
            : Math.max(0, toNumber(trip.duration));
          const distanceKm = Math.max(0, Number(trip.distance ?? 0) / 1000);
          const usedFuel = computeTripUsedFuelLitres({
            spentFuel: trip.spentFuel,
            routePoints: route,
            startMs,
            endMs,
            distanceKm,
            tankCapacityLiters: fuelTankCapacityLiters
          });
          const efficiency = distanceKm > 0 ? usedFuel / distanceKm : 0;
          const engineHours = (durationMs / 3_600_000).toFixed(2);

          if (fuelKind === "engine-hours-detail") {
            tableRows.push([
              String(trip.deviceName ?? assetLabel),
              formatReportDateTime(start),
              formatReportDateTime(end),
              engineHours,
              usedFuel.toFixed(2),
              distanceKm.toFixed(2),
              efficiency.toFixed(3)
            ]);
          } else {
            tableRows.push([
              String(trip.deviceName ?? assetLabel),
              formatReportDateTime(start),
              formatReportDateTime(end),
              distanceKm.toFixed(2),
              usedFuel.toFixed(2),
              efficiency.toFixed(3),
              engineHours
            ]);
          }
        }
      } else {
        const summaries = await getTraccarSummary({ from, to, deviceId });
        for (const summary of summaries) {
          const distanceKm = normalizeReportedDistanceKm(summary.distance);
          const usedFuel = computeTripUsedFuelLitres({
            spentFuel: summary.spentFuel,
            routePoints: route,
            startMs: new Date(customFrom).getTime(),
            endMs: new Date(customTo).getTime(),
            distanceKm,
            tankCapacityLiters: fuelTankCapacityLiters
          });
          tableRows.push([
            String(summary.deviceName ?? assetLabel),
            periodStart,
            periodEnd,
            distanceKm.toFixed(2),
            usedFuel.toFixed(2),
            distanceKm > 0 ? (usedFuel / distanceKm).toFixed(3) : "0.000",
            toNumber(summary.engineHours).toFixed(2)
          ]);
        }
      }
    }

    if (fuelKind === "trip-detail") {
      return {
        kind: "fuel",
        fuelKind,
        columns,
        sections: fuelSections,
        tableRows: [],
        showSectioned: true,
        showTotals: false,
        ...buildDetailPreviewMeta(),
        reportName
      };
    }

    if (fuelKind === "dashboard") {
      tableRows.push(
        ["Assets in scope", String(dashboardAssetCount), selectedScopeItems.join(", ") || "All", periodStart],
        ["Total distance (km)", totalDashboardDistance.toFixed(2), dateRangeLabel, periodEnd],
        ["Total used fuel (L)", totalDashboardFuel.toFixed(2), dateRangeLabel, "Operational"],
        ["Average L/km", totalDashboardDistance > 0 ? (totalDashboardFuel / totalDashboardDistance).toFixed(3) : "0.000", dateRangeLabel, "Operational"],
        ["Total engine hours", totalDashboardHours.toFixed(2), dateRangeLabel, "Operational"]
      );
    }

    if (fuelKind === "comparative" && tableRows.length > 1) {
      const ranked = [...tableRows].sort((a, b) => Number(a[3] || 0) - Number(b[3] || 0));
      ranked.forEach((row, index) => {
        row[5] = String(index + 1);
      });
      tableRows.splice(0, tableRows.length, ...ranked);
    }

    let totals: string[] | undefined;
    let averages: string[] | undefined;
    if (fuelKind === "refills" || fuelKind === "drops") {
      ({ totals, averages } = summarizeFuelEventColumns(tableRows, 3));
    } else if (fuelKind === "start-stop") {
      ({ totals, averages } = summarizeFuelEventColumns(tableRows, 5));
    } else if (fuelKindShowsTripTotals(fuelKind)) {
      ({ totals, averages } = buildFuelTotalsRows(fuelKind, tableRows));
    }

    return {
      kind: "fuel",
      fuelKind,
      columns,
      tableRows,
      totals,
      averages,
      showTotals: Boolean(totals && averages),
      ...buildDetailPreviewMeta(),
      reportName
    };
  };

  const buildSummaryRows = async (): Promise<ReportExportRow[] | null> => {
    const reportName = selectedReportName || "";
    if (selectedCategory === "Fuel Reports") return null;
    if (!summaryReports.has(reportName)) return null;

    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const resolved = await resolveAllDeviceIds();
    if (resolved.length === 0) return [];

    const formatNumber = (value: unknown, digits = 2) => {
      const n = Number(value ?? 0);
      return Number.isFinite(n) ? n.toFixed(digits) : "0.00";
    };
    const summaryBatches = await mapWithLimit(resolved, 6, async ({ registration, deviceId }) => ({
      registration,
      summaries: await getTraccarSummary({ from, to, deviceId, registration, deviceName: registration })
    }));
    const rows: ReportExportRow[] = [];
    for (const { registration, summaries } of summaryBatches) {
      for (const summary of summaries) {
        const source = String(summary.deviceName ?? registration ?? summary.deviceId ?? "device");
        const distanceKm = normalizeReportedDistanceKm(summary.distance);
        const spentFuel = Number(summary.spentFuel ?? 0);
        const costPerKm = distanceKm > 0 ? spentFuel / distanceKm : 0;
        rows.push(
          {
            category: selectedCategory,
            report: selectedReportName || selectedCategory,
            metric: `${source} maxSpeed (km/h)`,
            value: `${formatNumber(Number(summary.maxSpeed ?? 0) * 1.852)} km/h`,
            change: "0",
            scope: `${selectedDatabase} / ${selectedSite}`,
            basis: runBasis,
            target: registration,
            dateRange: dateRangeLabel
          },
          {
            category: selectedCategory,
            report: selectedReportName || selectedCategory,
            metric: `${source} averageSpeed (km/h)`,
            value: `${formatNumber(Number(summary.averageSpeed ?? 0) * 1.852)} km/h`,
            change: "0",
            scope: `${selectedDatabase} / ${selectedSite}`,
            basis: runBasis,
            target: registration,
            dateRange: dateRangeLabel
          },
          {
            category: selectedCategory,
            report: selectedReportName || selectedCategory,
            metric: `${source} distance (km)`,
            value: `${formatNumber(distanceKm)} km`,
            change: "0",
            scope: `${selectedDatabase} / ${selectedSite}`,
            basis: runBasis,
            target: registration,
            dateRange: dateRangeLabel
          },
          {
            category: selectedCategory,
            report: selectedReportName || selectedCategory,
            metric: `${source} spentFuel (L)`,
            value: `${formatNumber(summary.spentFuel)} L`,
            change: "0",
            scope: `${selectedDatabase} / ${selectedSite}`,
            basis: runBasis,
            target: registration,
            dateRange: dateRangeLabel
          },
          {
            category: selectedCategory,
            report: selectedReportName || selectedCategory,
            metric: `${source} engineHours (h)`,
            value: `${formatNumber(summary.engineHours)} h`,
            change: "0",
            scope: `${selectedDatabase} / ${selectedSite}`,
            basis: runBasis,
            target: registration,
            dateRange: dateRangeLabel
          }
        );
        if (reportName === "Cost per Distance Report" || reportName === "Road Speed Limit Dashboard") {
          rows.push({
            category: selectedCategory,
            report: selectedReportName || selectedCategory,
            metric: `${source} fuel per km (L/km)`,
            value: `${formatNumber(costPerKm, 3)} L/km`,
            change: "0",
            scope: `${selectedDatabase} / ${selectedSite}`,
            basis: runBasis,
            target: registration,
            dateRange: dateRangeLabel
          });
        }
      }
    }
    return rows;
  };

  const buildGeofenceRows = async (): Promise<ReportExportRow[] | null> => {
    const isJourneyDwellReport = selectedCategory === "Routes Reports"
      && selectedReportName === "Routes Dwell Time Report";
    if (!isJourneyDwellReport) return null;

    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const resolved = await resolveAllDeviceIds();
    if (resolved.length === 0) return [];

    // UK: site location library; elsewhere: Traccar geofence definitions.
    const geofenceNameById = new Map<string, string>();
    if (isGpsIotServer()) {
      const siteLocations = await loadLocationGeofences().catch(() => []);
      for (const def of siteLocations) {
        const geoId = String(def.gpsIotGeoId ?? def.id ?? "").trim();
        const name = String(def.name ?? def.description ?? geoId).trim() || geoId;
        if (geoId) geofenceNameById.set(geoId, name);
        if (name) geofenceNameById.set(name.toLowerCase(), name);
        // Hash used by getTraccarGeofences UK synthesis.
        let hash = 0;
        for (let i = 0; i < name.toLowerCase().length; i += 1) {
          hash = ((hash << 5) - hash + name.toLowerCase().charCodeAt(i)) | 0;
        }
        const hashed = String(Math.abs(hash) || 1);
        geofenceNameById.set(hashed, name);
      }
    } else {
      const geofenceDefs = await listTraccarGeofenceDefinitions().catch(() => []);
      for (const def of geofenceDefs) {
        const id = String(def.id ?? "").trim();
        if (!id) continue;
        geofenceNameById.set(id, String(def.name ?? def.description ?? `Geofence ${id}`).trim() || `Geofence ${id}`);
      }
    }

    const visitBatches = await mapWithLimit(resolved, 4, async ({ registration, deviceId }) => ({
      registration,
      visits: await getTraccarGeofences({ from, to, deviceId })
    }));
    const rows: ReportExportRow[] = [];
    for (const { registration, visits } of visitBatches) {
      for (const visit of visits) {
        const startMs = Date.parse(String(visit.startTime ?? ""));
        const endMs = Date.parse(String(visit.endTime ?? ""));
        const dwellMs = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
          ? endMs - startMs
          : 0;
        const geofenceId = String(visit.geofenceId ?? "");
        const locationName =
          geofenceNameById.get(geofenceId)
          || geofenceNameById.get(geofenceId.toLowerCase())
          || `geofence-${geofenceId || "unknown"}`;
        const startDate = Number.isFinite(startMs) ? new Date(startMs) : null;
        const endDate = Number.isFinite(endMs) ? new Date(endMs) : null;
        rows.push({
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric: locationName,
          value: String(visit.deviceName ?? registration ?? visit.deviceId ?? ""),
          change: dwellMs > 0 ? formatDurationHms(dwellMs) : "00:00:00",
          scope: `${selectedDatabase} / ${selectedSite}`,
          basis: runBasis,
          target: registration,
          dateRange: dateRangeLabel,
          assetDescription: String(visit.deviceName ?? registration ?? ""),
          registrationNumber: registration,
          locationName,
          startDate: startDate ? formatDateOnly(startDate) : "",
          startTime: startDate ? formatTimeOnly(startDate) : "",
          endTime: endDate ? formatTimeOnly(endDate) : "",
          totalDuration: dwellMs > 0 ? formatDurationHms(dwellMs) : "00:00:00",
          eventDescription: locationName,
          eventValue: geofenceId
        });
      }
    }
    return rows;
  };

  const buildFuelRows = async (): Promise<ReportExportRow[] | null> => {
    if (selectedCategory !== "Fuel Reports") return null;
    return null;
  };

  const buildHoursOfServiceRows = async (): Promise<ReportExportRow[] | null> => {
    if (selectedCategory !== "Hours Of Service Reports") return null;
    const reportName = selectedReportName || "";
    if (!hoursOfServiceEventBackedReports.has(reportName)) return null;

    const fromMs = Date.parse(customFrom);
    const toMs = Date.parse(customTo);
    const snapshot = await loadHosFleetSnapshot({
      fromMs: Number.isFinite(fromMs) ? fromMs : Date.now() - 7 * 24 * 3600_000,
      toMs: Number.isFinite(toMs) ? toMs : Date.now()
    });
    const scope = `${selectedDatabase} / ${selectedSite || "All Sites"}`;
    const rows: ReportExportRow[] = [];

    if (/violations/i.test(reportName)) {
      for (const violation of snapshot.violations) {
        rows.push({
          category: selectedCategory,
          report: reportName,
          metric: violation.type.replace(/_/g, " "),
          value: `${violation.actualHours.toFixed(1)}h / ${violation.limitHours}h`,
          change: violation.severity,
          scope,
          basis: runBasis,
          target: violation.driverName,
          dateRange: dateRangeLabel,
          assetDescription: violation.assetLabel || "—",
          eventDescription: violation.message,
          driverName: violation.driverName,
          startDate: formatDateOnly(new Date(violation.atMs)),
          startTime: formatTimeOnly(new Date(violation.atMs)),
          eventValue: violation.severity
        });
      }
      return rows;
    }

    if (/rest compliance/i.test(reportName)) {
      for (const driver of snapshot.drivers) {
        const required = snapshot.rules.limits.dailyRestHours;
        const actual = msToHours(driver.offDutyMsToday);
        const pass = actual + 0.01 >= (snapshot.rules.limits.reducedDailyRestHours || required) * 0.5
          || driver.driveMsToday < 3600_000;
        rows.push({
          category: selectedCategory,
          report: reportName,
          metric: "Daily rest",
          value: pass ? "Pass" : "At risk",
          change: `${actual.toFixed(1)}h / ${required}h`,
          scope,
          basis: runBasis,
          target: driver.driverName,
          dateRange: dateRangeLabel,
          assetDescription: driver.assetLabel,
          driverName: driver.driverName,
          eventDescription: pass ? "Rest on track" : "Rest below expected for active day",
          eventValue: formatDurationMs(driver.offDutyMsToday)
        });
      }
      return rows;
    }

    // Daily Hours Of Service Report
    for (const driver of snapshot.drivers) {
      rows.push({
        category: selectedCategory,
        report: reportName,
        metric: "Daily HOS",
        value: formatDurationMs(driver.driveMsToday),
        change: formatDurationMs(driver.remainingDriveMs),
        scope,
        basis: runBasis,
        target: driver.driverName,
        dateRange: dateRangeLabel,
        assetDescription: driver.assetLabel,
        driverName: driver.driverName,
        eventDescription: driver.currentStatus,
        eventValue: formatDurationMs(driver.onDutyMsToday),
        totalDuration: formatDurationMs(driver.breakMsToday),
        distanceKm: formatDurationMs(driver.offDutyMsToday)
      });
    }
    return rows;
  };

  const buildScoringRows = async (): Promise<ReportExportRow[] | null> => {
    if (!scoringEventBackedCategories.has(selectedCategory)) return null;
    // Driver performance / scorecard names use the dedicated builder.
    if (isDriverPerformanceReportName(selectedReportName || "")) return null;

    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const assets = await resolveScopedReportAssets();
    if (assets.length === 0) return [];

    const thresholds = resolveBandThresholds(selectedReportName || "", selectedCategory, "driver");
    const deviceIds = assets.map((asset) => asset.deviceId);
    const [loadedEvents, loadedTrips] = await Promise.all([
      getTraccarEvents({ from, to, deviceIds }),
      getTraccarTrips({ from, to, deviceIds })
    ]);
    const eventsByDevice = groupByDeviceId(loadedEvents);
    const tripsByDevice = groupByDeviceId(loadedTrips);
    const rows: ReportExportRow[] = [];

    for (const asset of assets) {
      const events = eventsByDevice.get(String(asset.deviceId)) ?? [];
      const trips = tripsByDevice.get(String(asset.deviceId)) ?? [];

      const buckets = {
        harshAcceleration: { count: 0, durationMs: 0 },
        harshBraking: { count: 0, durationMs: 0 },
        overspeed: { count: 0, durationMs: 0 },
        hos: { count: 0, durationMs: 0 },
        other: { count: 0, durationMs: 0 }
      };
      let weightedEvents = 0;
      for (const event of events) {
        const type = classifyDrivingEvent(event);
        const durationMs = parseEventDurationMs(event);
        weightedEvents += classifySafetyEventWeight((event as any)?.type);
        if (type === "harshAcceleration") {
          buckets.harshAcceleration.count += 1;
          buckets.harshAcceleration.durationMs += durationMs;
        } else if (type === "harshBraking") {
          buckets.harshBraking.count += 1;
          buckets.harshBraking.durationMs += durationMs;
        } else if (type === "overspeed") {
          buckets.overspeed.count += 1;
          buckets.overspeed.durationMs += durationMs;
        } else if (type === "hos" || type === "overRevving") {
          buckets.hos.count += 1;
          buckets.hos.durationMs += durationMs;
        } else {
          buckets.other.count += 1;
          buckets.other.durationMs += durationMs;
        }
      }

      const tripCount = trips.length;
      const distanceKm = trips.reduce((sum, trip) => sum + normalizeReportedDistanceKm(trip.distance), 0);
      const eventRate = weightedEvents / Math.max(1, tripCount);
      const score = Math.max(0, Math.min(100, 100 - Math.min(85, eventRate * 18 + events.length * 1.2)));
      const band = toBand(score, thresholds);
      const penaltyTotal = buckets.harshAcceleration.count
        + buckets.harshBraking.count
        + buckets.overspeed.count
        + buckets.hos.count;
      const label = asset.driverName || asset.registration || asset.assetLabel || "Asset";

      rows.push({
        category: selectedCategory,
        report: selectedReportName || selectedCategory,
        metric: label,
        value: score.toFixed(1),
        change: band,
        scope: `${selectedDatabase} / ${selectedSite}`,
        basis: runBasis,
        target: asset.registration || label,
        dateRange: dateRangeLabel,
        assetDescription: asset.assetLabel || label,
        registrationNumber: asset.registration || "",
        driverName: asset.driverName || "",
        distanceKm: distanceKm.toFixed(2),
        occurrences: String(events.length),
        eventValue: `${tripCount} trips · ${penaltyTotal} scored events`,
        totalDuration: formatDurationHms(
          buckets.harshAcceleration.durationMs
          + buckets.harshBraking.durationMs
          + buckets.overspeed.durationMs
          + buckets.hos.durationMs
        ),
        // Encode scorecard buckets into unused action fields for tabular mapping (no UI change).
        actionDecision: String(buckets.harshAcceleration.count),
        actionNote: String(buckets.harshBraking.count),
        actionedByName: String(buckets.overspeed.count),
        actionedByEmail: String(buckets.hos.count),
        speedKph: String(buckets.other.count)
      });
    }

    return rows;
  };

  const filterScopedAssets = async () => {
    const rawAssets = await getAssetsFromApi<any>();
    return (Array.isArray(rawAssets) ? rawAssets : []).filter((asset) => {
      const siteName = String(asset?.site ?? "").trim();
      const registration = String(asset?.registration ?? asset?.assetDescription ?? asset?.name ?? "").trim();
      const driverName = extractScopedDriverName(asset);
      const siteMatch = selectedSites.length === 0 || selectedSites.includes(siteName);
      const basisMatch = runBasis === "driver"
        ? (selectedScopeItems.length === 0 || selectedScopeItems.includes(driverName))
        : (selectedScopeItems.length === 0 || selectedScopeItems.includes(registration));
      return siteMatch && basisMatch;
    });
  };

  const buildListRows = async (): Promise<ReportExportRow[] | null> => {
    if (!isListBackedCategory(selectedCategory)) return null;
    const reportName = selectedReportName || "";
    const scope = `${selectedDatabase} / ${selectedSite || "All Sites"}`;

    if (/notification/i.test(reportName)) {
      const site = selectedSite || readStoredSelectionScope().activeSite || "";
      const [notifications, locationAlerts, boundOptions, libraryItems, clientAlerts, catalog] = await Promise.all([
        getTraccarNotifications().catch(() => []),
        loadSiteLocationAlerts(site),
        isGpsIotServer()
          ? loadBoundNotificationOptionsForSite(site).catch(() => [])
          : Promise.resolve([]),
        isGpsIotServer()
          ? loadNotificationLibraryItems(site).catch(() => [])
          : Promise.resolve([]),
        isGpsIotServer()
          ? listGpsIotClientAlerts({ site: site || undefined }).catch(() => [])
          : Promise.resolve([]),
        isGpsIotServer()
          ? listGpsIotEvents().catch(() => [])
          : Promise.resolve([])
      ]);

      const rows: ReportExportRow[] = [];
      const seen = new Set<string>();

      for (const notification of notifications) {
        const metric = String(notification.type ?? "").trim() || "Notification";
        const value = String((notification as any).description ?? notification.type ?? "—");
        const key = `${metric}::${value}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric,
          value,
          change: "Active",
          scope,
          basis: runBasis,
          target: "VIVI",
          dateRange: dateRangeLabel
        });
      }

      // UK: site notification bindings + library + GetClientAlerts / GetEvents catalog.
      for (const option of boundOptions) {
        const metric = String(option.type ?? "System").trim() || "System";
        const value = String(option.description ?? "").trim();
        if (!value) continue;
        const key = `${metric}::${value}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric,
          value,
          change: "Bound",
          scope,
          basis: runBasis,
          target: site || "Site",
          dateRange: dateRangeLabel,
          eventDescription: value
        });
      }
      for (const row of libraryItems) {
        const value = String(row.description ?? "").trim();
        if (!value) continue;
        const metric = String(row.type ?? "Library").trim() || "Library";
        const key = `${metric}::${value}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric,
          value,
          change: String(row.availability ?? "Configured"),
          scope,
          basis: runBasis,
          target: site || "Site",
          dateRange: dateRangeLabel,
          eventDescription: value
        });
      }
      for (const alert of clientAlerts) {
        const value = String(alert.alertName ?? "").trim();
        if (!value) continue;
        const metric = String(alert.priority ?? "Alert").trim() || "Alert";
        const key = `client-alert::${value}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric,
          value,
          change: alert.active ? "Active" : "Inactive",
          scope,
          basis: runBasis,
          target: site || "Site",
          dateRange: dateRangeLabel,
          eventDescription: value
        });
      }
      for (const event of catalog) {
        const value = String(event.eventName ?? "").trim();
        if (!value) continue;
        const key = `catalog::${value}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric: "Catalog",
          value,
          change: "Available",
          scope,
          basis: runBasis,
          target: site || "Site",
          dateRange: dateRangeLabel,
          eventDescription: value
        });
      }

      for (const alert of locationAlerts) {
        rows.push({
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric: alert.eventName,
          value: alert.eventType || "Location alert",
          change: "Active",
          scope,
          basis: runBasis,
          target: (alert.selectedLocations ?? []).join(", ") || "—",
          dateRange: dateRangeLabel,
          locationName: (alert.selectedLocations ?? [])[0] || "—",
          driverName: "—",
          eventDescription: alert.eventName,
          startDate: alert.updatedAt ? formatDateOnly(alert.updatedAt) : "",
          startTime: alert.updatedAt ? formatTimeOnly(alert.updatedAt) : ""
        });
      }
      return rows;
    }

    const assets = await filterScopedAssets();
    if (assets.length === 0) return [];

    if (/driver/i.test(reportName)) {
      const drivers = [...new Set(assets.map((asset) => extractScopedDriverName(asset)).filter(Boolean))].sort();
      return drivers.map((driver, index) => ({
        category: selectedCategory,
        report: selectedReportName || selectedCategory,
        metric: `Driver ${index + 1}`,
        value: driver,
        change: "Listed",
        scope,
        basis: "driver",
        target: driver,
        dateRange: dateRangeLabel
      }));
    }

    return assets.map((asset, index) => {
      const registration = String(asset?.registration ?? asset?.assetDescription ?? asset?.name ?? `Asset ${index + 1}`).trim();
      const description = String(asset?.assetDescription ?? asset?.description ?? asset?.name ?? registration).trim();
      const site = String(asset?.site ?? "").trim();
      const imei = String(asset?.imei ?? asset?.uniqueId ?? "").trim();
      const deviceType = String(asset?.mobileDeviceType ?? asset?.device ?? asset?.unitType ?? "").trim();
      const driver = extractScopedDriverName(asset);
      return {
        category: selectedCategory,
        report: selectedReportName || selectedCategory,
        metric: registration,
        value: description,
        change: site || "—",
        scope,
        basis: runBasis,
        target: runBasis === "driver" ? driver : registration,
        dateRange: dateRangeLabel,
        registrationNumber: registration,
        assetDescription: description,
        eventValue: [imei, deviceType].filter(Boolean).join(" · ") || "—"
      };
    });
  };

  const buildJourneySummaryRows = async (): Promise<ReportExportRow[] | null> => {
    if (selectedCategory !== "Routes Reports") return null;
    if (selectedReportName === "Routes Dwell Time Report") return null;

    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const resolved = await resolveAllDeviceIds();
    if (resolved.length === 0) return [];

    const deviceIds = resolved.map((row) => row.deviceId);
    const [loadedTrips, loadedEvents] = await Promise.all([
      getTraccarTrips({ from, to, deviceIds }),
      getTraccarEvents({ from, to, deviceIds })
    ]);
    const tripsByDevice = groupByDeviceId(loadedTrips);
    const eventsByDevice = groupByDeviceId(loadedEvents);
    const rows: ReportExportRow[] = [];
    for (const { registration, deviceId } of resolved) {
      const trips = tripsByDevice.get(String(deviceId)) ?? [];
      const events = eventsByDevice.get(String(deviceId)) ?? [];
      const totalDistanceKm = trips.reduce((sum, trip) => sum + normalizeReportedDistanceKm(trip.distance), 0);
      const exceptionEvents = events.filter((event) => /alarm|overspeed|harsh|geofence|offline/i.test(String(event.type ?? "")));
      rows.push(
        {
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric: `${registration} trips`,
          value: String(trips.length),
          change: `${totalDistanceKm.toFixed(2)} km`,
          scope: `${selectedDatabase} / ${selectedSite}`,
          basis: runBasis,
          target: registration,
          dateRange: dateRangeLabel
        },
        {
          category: selectedCategory,
          report: selectedReportName || selectedCategory,
          metric: `${registration} journey exceptions`,
          value: String(exceptionEvents.length),
          change: exceptionEvents.length > 0 ? "Review" : "Clear",
          scope: `${selectedDatabase} / ${selectedSite}`,
          basis: runBasis,
          target: registration,
          dateRange: dateRangeLabel
        }
      );
    }
    return rows;
  };

  const buildCostServiceRows = async (): Promise<ReportExportRow[] | null> => {
    if (selectedCategory !== "Cost Reports") return null;
    if (selectedReportName !== "Service History Report") return null;

    const from = new Date(customFrom).toISOString();
    const to = new Date(customTo).toISOString();
    const resolved = await resolveAllDeviceIds();
    if (resolved.length === 0) return [];

    const deviceIds = resolved.map((row) => row.deviceId);
    const [loadedTrips, loadedEvents] = await Promise.all([
      getTraccarTrips({ from, to, deviceIds }),
      getTraccarEvents({ from, to, deviceIds })
    ]);
    const tripsByDevice = groupByDeviceId(loadedTrips);
    const eventsByDevice = groupByDeviceId(loadedEvents);
    const rows: ReportExportRow[] = [];
    for (const { registration, deviceId } of resolved) {
      const trips = tripsByDevice.get(String(deviceId)) ?? [];
      const events = eventsByDevice.get(String(deviceId)) ?? [];
      const maintenanceEvents = events.filter((event) => /maintenance|service|alarm/i.test(String(event.type ?? "")));
      rows.push({
        category: selectedCategory,
        report: selectedReportName || selectedCategory,
        metric: `${registration} service events`,
        value: String(maintenanceEvents.length),
        change: `${trips.length} trips in period`,
        scope: `${selectedDatabase} / ${selectedSite}`,
        basis: runBasis,
        target: registration,
        dateRange: dateRangeLabel
      });
    }
    return rows;
  };

  const verifiedPercent = (numerator: number, denominator: number) => {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
    return Math.max(0, Math.min(100, (numerator / denominator) * 100));
  };

  const classifySafetyEventWeight = (type: unknown) => {
    const text = String(type ?? "").trim().toLowerCase();
    if (!text) return 0.5;
    if (/fatigue|panic|sos|crash|collision|impact|rollover/.test(text)) return 4;
    if (/harsh|brak|corner|accel|rapid|danger/.test(text)) return 2.5;
    if (/overspeed|speeding|speed/.test(text)) return 1.8;
    if (/idle|idling/.test(text)) return 1.1;
    return 1;
  };

  const extractScopedDriverName = (asset: any) => resolveAssetDriverName(asset);

  const buildUtilisationRows = async (): Promise<ReportExportRow[] | null> => {
    if (!isUtilisationReportName(selectedReportName || "")) return null;
    if (isAssetUtilisationReportName(selectedReportName || "")) return null;
    const thresholds = resolveBandThresholds(selectedReportName || "", selectedCategory, "utilisation");

    const fromDate = new Date(customFrom);
    const toDate = new Date(customTo);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return [];

    const dayKeys: string[] = [];
    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end && dayKeys.length < 45) {
      dayKeys.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    if (dayKeys.length === 0) return [];
    const resolved = await resolveAllDeviceIds();
    if (resolved.length === 0) return [];

    const fromIso = new Date(customFrom).toISOString();
    const toIso = new Date(customTo).toISOString();
    const dayKeySet = new Set(dayKeys);
    const tripsByDevice = await Promise.all(
      resolved.map(async ({ registration, deviceId }) => ({
        registration,
        trips: await getTraccarTrips({ from: fromIso, to: toIso, deviceId })
      }))
    );

    const activeAssetsByDay = new Map<string, Set<string>>();
    const tripCountByDay = new Map<string, number>();
    for (const dayKey of dayKeys) activeAssetsByDay.set(dayKey, new Set<string>());

    for (const batch of tripsByDevice) {
      for (const trip of batch.trips) {
        const start = new Date(String(trip.startTime ?? ""));
        const endDate = new Date(String(trip.endTime ?? trip.startTime ?? ""));
        if (Number.isNaN(start.getTime())) continue;
        const safeEnd = Number.isNaN(endDate.getTime()) ? start : endDate;
        const startDay = new Date(start);
        startDay.setHours(0, 0, 0, 0);
        const endDay = new Date(safeEnd);
        endDay.setHours(0, 0, 0, 0);
        for (let day = new Date(startDay); day <= endDay; day.setDate(day.getDate() + 1)) {
          const key = day.toISOString().slice(0, 10);
          if (!dayKeySet.has(key)) continue;
          activeAssetsByDay.get(key)?.add(batch.registration);
        }
        const startKey = startDay.toISOString().slice(0, 10);
        if (dayKeySet.has(startKey)) {
          tripCountByDay.set(startKey, (tripCountByDay.get(startKey) ?? 0) + 1);
        }
      }
    }

    const target = selectedScopeItems.length > 0 ? selectedScopeItems.join(", ") : "All";
    const scope = `${selectedDatabase} / ${selectedSite || "All Sites"}`;
    const totalTargetAssets = Math.max(1, resolved.length);
    const rows: ReportExportRow[] = dayKeys.map((day, index) => {
      const activeAssets = activeAssetsByDay.get(day)?.size ?? 0;
      const tripCount = tripCountByDay.get(day) ?? 0;
      const utilisation = verifiedPercent(activeAssets, totalTargetAssets);
      const band = toBand(utilisation, thresholds);
      return {
        category: selectedCategory,
        report: selectedReportName || selectedCategory,
        metric: day,
        value: `${utilisation.toFixed(1)}%`,
        change: band,
        scope,
        basis: runBasis,
        target,
        dateRange: dateRangeLabel,
        eventValue: `${activeAssets}/${totalTargetAssets} active assets · ${tripCount} trips`
      };
    });

    const average = rows.reduce((sum, row) => sum + Number(String(row.value).replace("%", "")), 0) / rows.length;
    const green = rows.filter((row) => row.change === "Green").length;
    const umber = rows.filter((row) => row.change === "Umber").length;
    const red = rows.filter((row) => row.change === "Red").length;

    rows.push({
      category: selectedCategory,
      report: selectedReportName || selectedCategory,
      metric: "Totals",
      value: `${average.toFixed(1)}%`,
      change: toBand(average, thresholds),
      scope,
      basis: runBasis,
      target,
      dateRange: dateRangeLabel,
      eventValue: `Green ${green} | Umber ${umber} | Red ${red}`
    });

    return rows;
  };

  const buildDriverPerformanceRows = async (): Promise<ReportExportRow[] | null> => {
    if (!isDriverPerformanceReportName(selectedReportName || "")) return null;
    const thresholds = resolveBandThresholds(selectedReportName || "", selectedCategory, "driver");

    const rawAssets = await getAssetsFromApi<any>();
    const filteredAssets = (Array.isArray(rawAssets) ? rawAssets : []).filter((asset) => {
      const siteName = String(asset?.site ?? "").trim();
      const registration = String(asset?.registration ?? asset?.assetDescription ?? asset?.name ?? "").trim();
      const driverName = extractScopedDriverName(asset);
      const siteMatch = selectedSites.length === 0 || selectedSites.includes(siteName);
      const basisMatch = runBasis === "driver"
        ? (selectedScopeItems.length === 0 || selectedScopeItems.includes(driverName))
        : (selectedScopeItems.length === 0 || selectedScopeItems.includes(registration));
      return siteMatch && basisMatch;
    });

    const assetsByDriver = new Map<string, any[]>();
    for (const asset of filteredAssets) {
      const driverName = extractScopedDriverName(asset);
      if (!driverName) continue;
      const current = assetsByDriver.get(driverName) ?? [];
      current.push(asset);
      assetsByDriver.set(driverName, current);
    }

    const targetDrivers = Array.from(assetsByDriver.keys()).sort((a, b) => a.localeCompare(b)).slice(0, 20);
    if (targetDrivers.length === 0) return [];

    const fromIso = new Date(customFrom).toISOString();
    const toIso = new Date(customTo).toISOString();

    const scope = `${selectedDatabase} / ${selectedSite || "All Sites"}`;
    const rows: ReportExportRow[] = [];
    const driverRows = await mapWithLimit(targetDrivers, 3, async (driver) => {
      const assetsForDriver = assetsByDriver.get(driver) ?? [];
      const resolvedAssets = await Promise.all(assetsForDriver.map(async (asset) => {
        const directId = Number(asset?.traccarDeviceId);
        if (Number.isFinite(directId) && directId > 0) {
          return { registration: String(asset?.registration ?? asset?.assetDescription ?? driver).trim(), deviceId: String(directId) };
        }
        const uniqueId = String(asset?.imei ?? "").trim();
        if (!uniqueId) return null;
        const devices = await getTraccarDevices({ uniqueId });
        const deviceId = Number(devices[0]?.id);
        return Number.isFinite(deviceId) && deviceId > 0
          ? { registration: String(asset?.registration ?? asset?.assetDescription ?? driver).trim(), deviceId: String(deviceId) }
          : null;
      }));

      const scopedDevices = resolvedAssets.filter((item): item is { registration: string; deviceId: string } => Boolean(item));
      if (scopedDevices.length === 0) return null;

      const deviceIds = scopedDevices.map((item) => item.deviceId);
      const [allEvents, allTrips] = await Promise.all([
        getTraccarEvents({ from: fromIso, to: toIso, deviceIds }),
        getTraccarTrips({ from: fromIso, to: toIso, deviceIds })
      ]);

      const totalTripsForDriver = allTrips.length;
      const weightedEvents = allEvents.reduce((sum, event) => sum + classifySafetyEventWeight((event as any)?.type), 0);
      const eventRate = weightedEvents / Math.max(1, totalTripsForDriver);
      const score = Math.max(0, Math.min(100, 100 - Math.min(85, eventRate * 18 + allEvents.length * 1.2)));
      const band = toBand(score, thresholds);
      const trend = score >= thresholds.greenMin
        ? "Improving"
        : score >= thresholds.umberMin
          ? "Stable"
          : "Needs coaching";
      return {
        category: selectedCategory,
        report: selectedReportName || selectedCategory,
        metric: driver,
        value: score.toFixed(1),
        change: band,
        scope,
        basis: "driver",
        target: trend,
        dateRange: dateRangeLabel,
        eventValue: `${weightedEvents.toFixed(1)} weighted events · ${totalTripsForDriver} trips`
      };
    });
    for (const row of driverRows) {
      if (row) rows.push(row);
    }

    if (rows.length === 0) return [];

    const avg = rows.reduce((sum, row) => sum + Number(row.value || 0), 0) / rows.length;
    const green = rows.filter((row) => row.change === "Green").length;
    const umber = rows.filter((row) => row.change === "Umber").length;
    const red = rows.filter((row) => row.change === "Red").length;

    rows.push({
      category: selectedCategory,
      report: selectedReportName || selectedCategory,
      metric: "Totals",
      value: avg.toFixed(1),
      change: toBand(avg, thresholds),
      scope,
      basis: "driver",
      target: `${rows.length} drivers`,
      dateRange: dateRangeLabel,
      eventValue: `Green ${green} | Umber ${umber} | Red ${red}`
    });

    return rows;
  };

  const handleRunReport = async () => {
    if (isRunningReport) return;
    if (selectedCategory === "Notification Reports" && selectedNotificationTypeSet.size === 0
      && !isNotificationSummaryReportName(selectedReportName || "")
      && !/overview\s*notification|summary\s*notification/i.test(selectedReportName || "")
      && !/streams action report/i.test(selectedReportName || "")) {
      setRunError("Select at least one notification event type before running this report.");
      return;
    }
    setIsRunningReport(true);
    setRunError("");
    try {
      applyRunFiltersToUrl();
      setDetailPreview(null);
      let rows = buildReportRows();
      let detailForExport: DetailReportPreview | null = null;
      const failuresBefore = getTraccarReportFailureCount();
      // Run only the builder whose rows are kept (same precedence as the old all-builders
      // Promise.all), so one report no longer fans out 3+ overlapping Traccar loads.
      const memo = <T,>(fn: () => Promise<T>) => {
        let pending: Promise<T> | null = null;
        return () => (pending ??= fn());
      };
      const utilisation = memo(buildUtilisationRows);
      const driverPerformance = memo(buildDriverPerformanceRows);
      const list = memo(buildListRows);
      const trip = memo(() => (shouldUseDetailTablePreview && selectedCategory === "Trip Reports" ? Promise.resolve(null) : buildTripRows()));
      const journey = memo(buildJourneySummaryRows);
      const costService = memo(buildCostServiceRows);
      const summary = memo(buildSummaryRows);
      const geofence = memo(buildGeofenceRows);
      const locationAlertSummary = memo(buildLocationAlertNotificationSummaryRows);
      const streamsAction = memo(buildStreamsActionReportRows);
      const events = memo(buildEventRows);
      const fuel = memo(() => (selectedCategory === "Fuel Reports" ? Promise.resolve(null) : buildFuelRows()));
      const hos = memo(buildHoursOfServiceRows);
      const scoring = memo(buildScoringRows);
      const unifiedAssetSummary = memo(buildUnifiedAssetSummaryRows);
      const has = async (builder: () => Promise<ReportExportRow[] | null>) => Array.isArray(await builder());
      const utilisationOrDriver = async () => (await has(utilisation)) || (await has(driverPerformance));

      const selectRows = async (): Promise<ReportExportRow[]> => {
        const unified = await unifiedAssetSummary();
        if (Array.isArray(unified)) return unified;
        if (!(await utilisationOrDriver())) {
          for (const builder of [scoring, hos, fuel]) {
            const built = await builder();
            if (Array.isArray(built)) return built;
          }
        }
        const eventRows = await events();
        if (Array.isArray(eventRows) && !(await has(locationAlertSummary)) && !(await has(streamsAction))) return eventRows;
        const streamsRows = await streamsAction();
        if (Array.isArray(streamsRows)) return streamsRows;
        const locationAlertRows = await locationAlertSummary();
        if (Array.isArray(locationAlertRows)) return locationAlertRows;
        if (!(await utilisationOrDriver())) {
          const geofenceRows = await geofence();
          if (Array.isArray(geofenceRows)) return geofenceRows;
          const listRows = await list();
          if (!Array.isArray(listRows)) {
            const tripBacked = !(await has(trip)) && !(await has(journey)) && !(await has(costService));
            if (tripBacked) {
              const summaryRows = await summary();
              if (Array.isArray(summaryRows)) return summaryRows;
            }
            for (const builder of [costService, journey, trip]) {
              const built = await builder();
              if (Array.isArray(built)) return built;
            }
          } else {
            return listRows;
          }
        }
        const driverRows = await driverPerformance();
        if (Array.isArray(driverRows)) return driverRows;
        const utilisationRows = await utilisation();
        if (Array.isArray(utilisationRows)) return utilisationRows;
        return buildReportRows();
      };

      const buildDetailForRun = async (): Promise<DetailReportPreview | null> => {
        if (selectedCategory === "Fuel Reports") {
          return reportOutputMode !== "summary" ? buildFuelDetailPreview() : null;
        }
        if (selectedCategory === "Movement Reports") {
          // Movement = Traccar Trips (detailed + location + overview). Summary Movement keeps tabular summary.
          const isSummaryMovement = /summary\s*movement|mileage\s*summary|mileage\s*monthly/i.test(selectedReportName || "")
            || /summary\s*movement/i.test(resolveMovementReportName(selectedReportName || ""));
          if (!isSummaryMovement || shouldUseDetailTablePreview || movementLocationReports.has(selectedReportName || "") || movementLocationReports.has(resolveMovementReportName(selectedReportName || ""))) {
            const movementData = await buildMovementReportPreview();
            return movementData ? { kind: "movement", ...movementData } : null;
          }
          return null;
        }
        if (isAssetUtilisationReportName(selectedReportName || "")) return buildAssetUtilisationDetailPreview();
        if (shouldUseDetailTablePreview && selectedCategory === "Trip Reports") return buildTripDetailPreview();
        return null;
      };

      // The detail table replaces the summary rows in the preview and export, so load it on its own
      // and only fall back to the row builders when it has nothing. Running both at once doubled the
      // tracking-server load and caused the timeouts behind "some report data did not load".
      const settle = async <T,>(work: () => Promise<T>): Promise<PromiseSettledResult<T>> => {
        try {
          return { status: "fulfilled", value: await work() };
        } catch (reason) {
          return { status: "rejected", reason };
        }
      };
      const detailResult = await settle(buildDetailForRun);
      const rowsResult: PromiseSettledResult<ReportExportRow[]> = detailResult.status === "fulfilled" && detailResult.value
        ? { status: "fulfilled", value: [] }
        : await settle(selectRows);
      const failureMessages: string[] = [];
      if (rowsResult.status === "fulfilled") {
        rows = rowsResult.value;
      } else {
        rows = [];
        failureMessages.push(String((rowsResult.reason as any)?.message ?? rowsResult.reason ?? "").trim());
      }
      if (detailResult.status === "fulfilled") {
        detailForExport = detailResult.value;
        if (detailForExport) setDetailPreview(detailForExport);
      } else {
        failureMessages.push(String((detailResult.reason as any)?.message ?? detailResult.reason ?? "").trim());
      }
      if (failureMessages.length > 0 && !(rows.length > 0 || detailForExport)) {
        setRunError(failureMessages.find(Boolean) || "Failed to load report data from VIVI. Check scope, dates, and API connectivity.");
      } else if (failureMessages.length > 0 || getTraccarReportFailureCount() > failuresBefore) {
        setRunError("Some report data did not load from the tracking server (timeout or upstream error). Results may be incomplete; run again or shorten the date range.");
      }
      const scopeLabel = selectedScopeItems.length > 0 ? String(selectedScopeItems.length) : "All";
      setLastRunSnapshot({
        reportName: selectedReportName || selectedCategory,
        dateRange: dateRangeLabel,
        recordCount: countReportResultRows(rows, detailForExport),
        scopeLabel,
        runBasis
      });
      setShowScopeSnapshot(true);
      if (runAction === "view") {
        setPreviewRows(rows);
        setPreviewMeta({
          reportName: selectedReportName || selectedCategory,
          category: selectedCategory,
          periodLabel: dateRangeLabel,
          dateFrom: customFrom,
          dateTo: customTo,
          database: selectedDatabase,
          site: selectedSites.length > 0 ? selectedSites.join(", ") : (siteOptions[0] ?? "—"),
          dealer: selectedHierarchyMeta.dealer,
          organisation: selectedHierarchyMeta.organisation,
        });
        setShowPreviewModal(true);
        return;
      }
      setShowPreviewModal(false);
      await downloadReport(rows, downloadFormat, detailForExport);
    } finally {
      setIsRunningReport(false);
    }
  };

  const handleRunFavoriteReport = (favorite: FavoriteReport) => {
    const category = favorite.category || findCategoryForReport(favorite.report);
    handleCategorySelect(category);
    const reportName = category === "Fuel Reports"
      ? normalizeFuelReportName(favorite.report)
      : favorite.report;
    if (reportOptionsByCategory[category]?.includes(reportName)) {
      setSelectedReportForCategory(category, reportName);
    }
    setOpenFavoriteActions(null);
    setRunError("");
    setRunAction("view");
    window.setTimeout(() => {
      void handleRunReport();
    }, 50);
  };

  const previewTableModel = useMemo(
    () => buildTabularModel(previewRows),
    [previewRows, selectedCategory, selectedReportName, shouldUseDetailTablePreview, runBasis, reportOutputMode]
  );
  const assetSummaryPreview = isAssetSummaryReportView(
    selectedCategory,
    selectedReportName || "",
    shouldUseDetailTablePreview,
    runBasis,
    reportOutputMode
  );

  const utilisationPie = useMemo(() => {
    if (!isUtilisationReportName(selectedReportName || "")) return null;
    const detailRows = previewRows.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.metric || "")));
    const green = detailRows.filter((row) => row.change === "Green").length;
    const umber = detailRows.filter((row) => row.change === "Umber").length;
    const red = detailRows.filter((row) => row.change === "Red").length;
    const total = green + umber + red;
    if (total <= 0) return null;
    return { green, umber, red, total };
  }, [previewRows, selectedReportName]);

  const handlePreviewDownload = async () => {
    await downloadReport(previewRows, previewDownloadFormat, detailPreview);
  };

  const renderPreviewDownloadToolbar = (placement: "modal" | "sheet" = "modal") => (
    <div className={`reports-preview-toolbar${placement === "sheet" ? " reports-preview-toolbar--sheet" : ""}`}>
      <label>
        <span>Download format</span>
        <select
          value={previewDownloadFormat}
          onChange={(event) => setPreviewDownloadFormat(event.target.value as DownloadFormat)}
        >
          <option value="excel">Excel</option>
          <option value="pdf">PDF</option>
          <option value="csv">CSV</option>
        </select>
      </label>
      <button type="button" className="reports-run-btn" onClick={() => void handlePreviewDownload()}>Download</button>
    </div>
  );

  const handleCreateFavorite = () => {
    appendFavorite("");
    setActiveTab("favorites");
  };

  const handleCreateSubscription = () => {
    setCreateSubscriptionOnRun(true);
    setSubscriptionFrequency("daily");
    setSubscriptionReportFormat("pdf");
    setSubscriptionDailyTime("08:00");
    setSubscriptionWeeklyDay("monday");
    setSubscriptionMonthlyDay(1);
    setSubscriptionDescription("");
    setSubscriptionEmailSubject(selectedReportName || `${selectedCategory} report`);
    setShowRunModal(true);
  };

  const handleSaveContact = () => {
    const firstName = contactForm.firstName.trim();
    const lastName = contactForm.lastName.trim();
    const email = contactForm.email.trim();
    if (!firstName || !email) return;
    const contact: ContactItem = {
      id: `contact-${Date.now()}`,
      firstName,
      lastName,
      employer: contactForm.employer.trim(),
      position: contactForm.position.trim(),
      email,
      mobile: contactForm.mobile.trim()
    };
    setContacts((current) => [contact, ...current]);
    setSelectedRecipientIds((current) => Array.from(new Set([contact.id, ...current])));
    setContactForm({ firstName: "", lastName: "", employer: "", position: "", email: "", mobile: "" });
    setShowAddContactModal(false);
    setShowSelectRecipientsModal(true);
  };

  const toggleRecipient = (id: string) => {
    setSelectedRecipientIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  };

  useEffect(() => {
    const loadScopedReportPrefs = () => {
      try {
        const parsedFav = readUserScopedJson<FavoriteReport[]>(FAVORITES_STORAGE_KEY);
        if (Array.isArray(parsedFav)) {
          const normalized = parsedFav.map(normalizeFavorite);
          if (isLegacySeedFavorites(normalized)) {
            setFavoriteReports([]);
            writeUserScopedJson(FAVORITES_STORAGE_KEY, []);
          } else {
            setFavoriteReports(normalized);
          }
        } else {
          setFavoriteReports([]);
        }

        const parsedSubs = readUserScopedJson<SubscriptionItem[]>(SUBSCRIPTIONS_STORAGE_KEY);
        if (Array.isArray(parsedSubs)) {
          setSubscriptions(parsedSubs.map(normalizeSubscription));
        } else {
          setSubscriptions([]);
        }

        const parsedContacts = readUserScopedJson<ContactItem[]>(CONTACTS_STORAGE_KEY);
        if (Array.isArray(parsedContacts) && parsedContacts.length > 0) {
          setContacts(parsedContacts);
        } else {
          setContacts([]);
        }
      } catch {
        // Keep defaults if localStorage is malformed.
      }
    };

    loadScopedReportPrefs();
    window.addEventListener("vivi:orgchange", loadScopedReportPrefs);
    window.addEventListener("vivi:contextchange", loadScopedReportPrefs);
    window.addEventListener("vivi:authchange", loadScopedReportPrefs);
    return () => {
      window.removeEventListener("vivi:orgchange", loadScopedReportPrefs);
      window.removeEventListener("vivi:contextchange", loadScopedReportPrefs);
      window.removeEventListener("vivi:authchange", loadScopedReportPrefs);
    };
  }, []);

  useEffect(() => {
    if (!readActiveUserId()) return;
    writeUserScopedJson(FAVORITES_STORAGE_KEY, favoriteReports);
  }, [favoriteReports]);

  useEffect(() => {
    if (!readActiveUserId()) return;
    writeUserScopedJson(SUBSCRIPTIONS_STORAGE_KEY, subscriptions);
  }, [subscriptions]);

  useEffect(() => {
    if (!readActiveUserId()) return;
    writeUserScopedJson(CONTACTS_STORAGE_KEY, contacts);
  }, [contacts]);

  useEffect(() => {
    const category = normalizeCategory(searchParams.get("category"));
    const report = searchParams.get("report");
    const database = searchParams.get("database");
    const site = searchParams.get("site");
    const basis = searchParams.get("basis");
    const registration = searchParams.get("registration");
    const driver = searchParams.get("driver");
    const notifications = searchParams.get("notifications");
    const tab = searchParams.get("tab");

    if (tab === "subscriptions") {
      setActiveTab("subscriptions");
    } else if (tab === "favorites") {
      setActiveTab("favorites");
    } else if (category || report) {
      setActiveTab("suite");
      setSuiteStep("configure");
    }

    if (category && visibleReportCategories.includes(category)) {
      setSelectedCategory(category);
    } else if (category === "Pre Production") {
      setSelectedCategory("Trip Reports");
    }

    // Restore scope hierarchy: database → site → registration/driver
    if (database && databaseOptions.includes(database)) {
      const nextSites = getSiteOptions(database);
      const nextBasis = (basis === "driver" || basis === "asset") ? basis : "asset";
      const restoredSites = site
        ? site.split("|").filter((s) => nextSites.includes(s))
        : [];
      const allScopeItems = [...new Set(nextSites.flatMap((s) => getScopeItems(database, s, nextBasis)))];
      const rawItems = nextBasis === "asset" ? registration : driver;
      const restoredScopeItems = rawItems
        ? rawItems.split("|").filter((i) => allScopeItems.includes(i))
        : [];
      setSelectedDatabase(database);
      setSelectedSites(restoredSites);
      setRunBasis(nextBasis);
      setSelectedScopeItems(restoredScopeItems);
    }

    if (report) {
      const resolvedCategory = category && reportOptionsByCategory[category]?.includes(report)
        ? category
        : findCategoryForReport(report);
      if (reportOptionsByCategory[resolvedCategory]?.includes(report)) {
        setSelectedReportForCategory(resolvedCategory, report);
      }
    }

    if (notifications) {
      const parsedNotifications = notifications
        .split("|")
        .map((item) => item.trim())
        .filter((item) => notificationTypeOptions.some((option) => option.value === item));
      setSelectedNotificationTypes(parsedNotifications);
    }

    urlRestoredRef.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (showNotificationTypeSelector) return;
    setNotificationTypeMenuOpen(false);
  }, [showNotificationTypeSelector]);

  useEffect(() => {
    if (!notificationTypeMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notificationTypeMenuRef.current?.contains(target)) return;
      setNotificationTypeMenuOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [notificationTypeMenuOpen]);

  useEffect(() => {
    if (!siteMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (siteMenuRef.current?.contains(event.target as Node)) return;
      setSiteMenuOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [siteMenuOpen]);

  useEffect(() => {
    if (!scopeMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (scopeMenuRef.current?.contains(event.target as Node)) return;
      setScopeMenuOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [scopeMenuOpen]);

  return (
    <div className="page reports-page">
      <section className="reports-card">
        <div className="reports-header">
          <span className="reports-title">
            {isArchives ? "Archived reports" : isFavorites ? "Favourite reports" : isSubscriptions ? "Subscriptions" : suiteStep === "categories" ? "Report suite" : `Report suite / ${selectedCategory}`}
          </span>
        </div>

        <div className="reports-layout" style={{ position: "relative" }}>
          {isRunningReport && (
            <div className="vt-loader-overlay">
              <VTLoader label="Loading report" />
            </div>
          )}
          <aside className="reports-sidebar">
            <button
              className={`reports-tab ${activeTab === "suite" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("suite");
                setSuiteStep("categories");
              }}
              type="button"
            >
              Report suite
            </button>
            <button
              className={`reports-tab ${activeTab === "favorites" ? "active" : ""}`}
              onClick={() => setActiveTab("favorites")}
              type="button"
            >
              Favourite reports
            </button>
            <button
              className={`reports-tab ${activeTab === "subscriptions" ? "active" : ""}`}
              onClick={() => setActiveTab("subscriptions")}
              type="button"
            >
              Subscriptions
            </button>
            <button
              className={`reports-tab ${activeTab === "archives" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("archives");
                void loadArchivedReports();
              }}
              type="button"
            >
              Archived reports
            </button>
          </aside>

          <div className="reports-panel">
            {activeTab === "archives" ? (
              <section aria-label="Archived report snapshots">
                <div className="reports-suite-header">
                  <div className="reports-suite-header-label">Reports API</div>
                  <div className="reports-suite-header-value">Recent report snapshots</div>
                </div>
                <p>Snapshots are kept on the VPS for 90 days, then copied to Backblaze B2.</p>
                <button
                  type="button"
                  className="reports-run-btn"
                  onClick={() => void loadArchivedReports()}
                  disabled={archivesLoading}
                >
                  {archivesLoading ? "Loading…" : "Refresh"}
                </button>
                {archivesError && <p role="alert">{archivesError}</p>}
                {!archivesLoading && archivedReports.length === 0 && !archivesError && (
                  <p>No archived report snapshots are available for this site.</p>
                )}
                {archivedReports.map((report) => (
                  <div key={`${report.tenant_id}:${report.report_id}`} className="reports-filter-card">
                    <strong>{report.title || "Report"}</strong>
                    <div>{report.site || "All sites"} · {new Date(report.created_at).toLocaleString()}</div>
                    <div>Storage: {report.storage === "local" ? "VPS" : "Backblaze B2 (VPS copy retained)"}</div>
                    <button
                      type="button"
                      className="reports-run-btn"
                      onClick={() => void downloadArchivedReport(report)}
                    >
                      Download snapshot
                    </button>
                  </div>
                ))}
              </section>
            ) : activeTab === "suite" && suiteStep === "categories" ? (
              <div className="reports-step reports-step--categories">
                <div className="reports-stepper" aria-label="Report steps">
                  <span className="reports-stepper-item is-current"><b>1</b> Category</span>
                  <span className="reports-stepper-sep" aria-hidden="true" />
                  <span className="reports-stepper-item"><b>2</b> Report and parameters</span>
                </div>
                <div className="reports-step-head">
                  <div>
                    <h2 className="reports-step-title">Choose a report category</h2>
                    <p className="reports-step-sub">{visibleReportCategories.length} categories · {visibleReportCategories.reduce((sum, category) => sum + (reportOptionsByCategory[category]?.length ?? 0), 0)} reports</p>
                  </div>
                  <input
                    type="search"
                    className="reports-search-input"
                    placeholder="Search categories or reports…"
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                    aria-label="Search categories or reports"
                  />
                </div>
                {(() => {
                  const query = categorySearch.trim().toLowerCase();
                  const categories = visibleReportCategories.filter((category) =>
                    !query
                    || category.toLowerCase().includes(query)
                    || (reportOptionsByCategory[category] ?? []).some((report) => report.toLowerCase().includes(query))
                  );
                  const matchingReports = query
                    ? visibleReportCategories.flatMap((category) =>
                        (reportOptionsByCategory[category] ?? [])
                          .filter((report) => report.toLowerCase().includes(query))
                          .map((report) => ({ category, report }))
                      ).slice(0, 12)
                    : [];
                  return (
                    <>
                      {matchingReports.length > 0 && (
                        <div className="reports-match-list" role="list" aria-label="Matching reports">
                          <div className="reports-match-title">Matching reports</div>
                          {matchingReports.map(({ category, report }) => (
                            <button
                              key={`${category}::${report}`}
                              type="button"
                              className="reports-match-row"
                              onClick={() => {
                                handleCategorySelect(category);
                                setSelectedReportForCategory(category, report);
                              }}
                            >
                              <span className="reports-match-name">{report}</span>
                              <span className="reports-match-cat">{category}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="reports-category-grid" role="list" aria-label="Report categories">
                        {categories.map((category) => {
                          const reports = reportOptionsByCategory[category] ?? [];
                          return (
                            <button
                              key={category}
                              type="button"
                              role="listitem"
                              className={`reports-category-tile${selectedCategory === category ? " is-last" : ""}`}
                              onClick={() => handleCategorySelect(category)}
                            >
                              <span className="reports-category-tile-head">
                                <span className="reports-category-tile-name">{category}</span>
                                <span className="reports-category-tile-count">{reports.length}</span>
                              </span>
                              <span className="reports-category-tile-list">
                                {reports.slice(0, 3).join(" · ")}{reports.length > 3 ? " …" : ""}
                              </span>
                              <span className="reports-category-tile-go" aria-hidden="true">Select ›</span>
                            </button>
                          );
                        })}
                        {categories.length === 0 && (
                          <div className="reports-multi-select-empty">No categories or reports match “{categorySearch}”.</div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : activeTab === "suite" ? (
              <div className="reports-suite-grid">
                <div className="reports-suite-col reports-suite-col--reports">
                  <div className="reports-stepper" aria-label="Report steps">
                    <button type="button" className="reports-stepper-item is-done" onClick={() => setSuiteStep("categories")}>
                      <b>1</b> Category
                    </button>
                    <span className="reports-stepper-sep" aria-hidden="true" />
                    <span className="reports-stepper-item is-current"><b>2</b> Report and parameters</span>
                  </div>
                  <div className="reports-step-nav">
                    <button type="button" className="reports-back-btn" onClick={() => setSuiteStep("categories")}>
                      ‹ All categories
                    </button>
                    <select
                      className="reports-select-single reports-category-switch"
                      value={selectedCategory}
                      onChange={(event) => handleCategorySelect(event.target.value)}
                      aria-label="Category"
                    >
                      {visibleReportCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="reports-filter-title">
                    {currentReportOptions.length} {currentReportOptions.length === 1 ? "report" : "reports"}
                  </div>
                  {currentReportOptions.length > 6 && (
                    <input
                      type="search"
                      className="reports-search-input"
                      placeholder="Filter reports…"
                      value={reportSearch}
                      onChange={(event) => setReportSearch(event.target.value)}
                      aria-label="Filter reports"
                    />
                  )}
                  <div className="reports-report-list" role="listbox" aria-label={`Select ${currentReportLabel}`}>
                    {currentReportOptions
                      .filter((report) => report.toLowerCase().includes(reportSearch.trim().toLowerCase()))
                      .map((report) => {
                        const isActive = report === selectedReportName;
                        return (
                          <button
                            key={report}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            className={`reports-report-row${isActive ? " active" : ""}`}
                            onClick={() => setSelectedReportForCategory(selectedCategory, report)}
                          >
                            <span className="reports-report-radio" aria-hidden="true" />
                            <span className="reports-report-name">{report}</span>
                          </button>
                        );
                      })}
                  </div>
                  <p className="reports-category-desc">{currentCategoryNote}</p>
                </div>

                <div className="reports-suite-col reports-suite-col--details">
                  <div className="reports-suite-header">
                    <div className="reports-suite-header-label">{selectedCategory}</div>
                    <div className="reports-suite-header-value">{selectedReportName || `Select a ${currentReportLabel}`}</div>
                    <div className="reports-suite-header-meta">
                      <span className="reports-category-note-badge">{isTripOrScoringCategory ? "Structured export" : "Configured flow"}</span>
                      <span>
                        {datePresetButtons.find((preset) => preset.key === datePreset)?.label ?? "Custom"}
                        {" · "}
                        {selectedSites.length === 0 ? "All sites" : selectedSites.length === 1 ? selectedSites[0] : `${selectedSites.length} sites`}
                        {" · "}
                        {selectedScopeItems.length === 0
                          ? `All ${runBasis === "asset" ? "assets" : "drivers"}`
                          : `${selectedScopeItems.length} ${runBasis === "asset" ? "assets" : "drivers"}`}
                      </span>
                    </div>
                  </div>

                <div className="reports-filter-card">
                  <div className="reports-filter-title">Date range</div>
                  <div className="reports-chip-row" role="group" aria-label="Date range presets">
                    {datePresetButtons.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        className={`reports-chip-btn${datePreset === preset.key ? " active" : ""}`}
                        onClick={() => handleDatePreset(preset.key)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="reports-date-grid">
                    <label>
                      <span>From</span>
                      <button
                        type="button"
                        className="reports-date-button"
                        onClick={() => openReportDatePicker("from")}
                      >
                        {formatReportDateTime(customFrom) || "Select start date"}
                      </button>
                    </label>
                    <label>
                      <span>To</span>
                      <button
                        type="button"
                        className="reports-date-button"
                        onClick={() => openReportDatePicker("to")}
                      >
                        {formatReportDateTime(customTo) || "Select end date"}
                      </button>
                    </label>
                  </div>
                </div>

                <div className="reports-filter-card">
                  <div className="reports-filter-title">Run report by</div>
                  {scopeLoadError && <div className="reports-label">{scopeLoadError}</div>}
                  <div className="reports-chip-row" role="group" aria-label="Report run basis">
                    <button
                      type="button"
                      className={`reports-chip-btn${runBasis === "asset" ? " active" : ""}`}
                      onClick={() => handleRunBasisChange("asset")}
                    >
                      Asset
                    </button>
                    <button
                      type="button"
                      className={`reports-chip-btn${runBasis === "driver" ? " active" : ""}`}
                      onClick={() => handleRunBasisChange("driver")}
                    >
                      Driver
                    </button>
                  </div>

                  <div className="reports-scope-grid">
                    <label>
                      <span>Database</span>
                      <select
                        className="reports-select-single"
                        value={selectedDatabase}
                        onChange={(event) => handleDatabaseChange(event.target.value)}
                      >
                        {databaseOptions.length === 0 ? (
                          <option value="">No databases available</option>
                        ) : (
                          databaseOptions.map((db) => (
                            <option key={db} value={db}>{db}</option>
                          ))
                        )}
                      </select>
                    </label>

                    <label>
                      <span>Site</span>
                      <div className="reports-multi-select" ref={siteMenuRef}>
                        <button
                          type="button"
                          className="reports-multi-select-trigger"
                          onClick={() => setSiteMenuOpen((open) => !open)}
                        >
                          {selectedSites.length === 0
                            ? "All sites"
                            : selectedSites.length === 1
                              ? selectedSites[0]
                              : `${selectedSites.length} sites selected`}
                        </button>
                        {siteMenuOpen && (
                          <div className="reports-multi-select-menu">
                            <input
                              type="text"
                              className="reports-multi-select-filter"
                              placeholder="Filter sites…"
                              value={siteSearch}
                              onChange={(e) => setSiteSearch(e.target.value)}
                            />
                            <div className="reports-multi-select-actions">
                              <button type="button" onClick={() => { setSelectedSites(siteOptions); setSelectedScopeItems([]); }}>Select all</button>
                              <button type="button" onClick={() => { setSelectedSites([]); setSelectedScopeItems([]); }}>Clear</button>
                            </div>
                            {siteOptions.length === 0
                              ? <div className="reports-multi-select-empty">No sites available</div>
                              : siteOptions
                                  .filter((s) => s.toLowerCase().includes(siteSearch.toLowerCase()))
                                  .map((site) => (
                                    <label key={site} className="reports-multi-select-option">
                                      <input
                                        type="checkbox"
                                        checked={selectedSites.includes(site)}
                                        onChange={() => toggleSite(site)}
                                      />
                                      <span>{site}</span>
                                    </label>
                                  ))
                            }
                          </div>
                        )}
                      </div>
                    </label>

                    <label>
                      <span>{runBasis === "asset" ? "Registration" : "Driver"}</span>
                      {showNotificationTypeSelector ? (
                        <div className="reports-scope-split-row">
                          <div className="reports-multi-select" ref={scopeMenuRef}>
                            <button
                              type="button"
                              className="reports-multi-select-trigger"
                              onClick={() => setScopeMenuOpen((open) => !open)}
                            >
                              {selectedScopeItems.length === 0
                                ? `All ${runBasis === "asset" ? "assets" : "drivers"}`
                                : selectedScopeItems.length === 1
                                  ? selectedScopeItems[0]
                                  : `${selectedScopeItems.length} selected`}
                            </button>
                            {scopeMenuOpen && (
                              <div className="reports-multi-select-menu">
                                <input
                                  type="text"
                                  className="reports-multi-select-filter"
                                  placeholder={`Filter ${runBasis === "asset" ? "registrations" : "drivers"}…`}
                                  value={scopeSearch}
                                  onChange={(e) => setScopeSearch(e.target.value)}
                                />
                                <div className="reports-multi-select-actions">
                                  <button type="button" onClick={() => setSelectedScopeItems(scopeItems)}>Select all</button>
                                  <button type="button" onClick={() => setSelectedScopeItems([])}>Clear</button>
                                </div>
                                {scopeItems.length === 0
                                  ? <div className="reports-multi-select-empty">No {runBasis === "asset" ? "assets" : "drivers"} available</div>
                                  : scopeItems
                                      .filter((item) => item.toLowerCase().includes(scopeSearch.toLowerCase()))
                                      .map((item) => (
                                        <label key={item} className="reports-multi-select-option">
                                          <input
                                            type="checkbox"
                                            checked={selectedScopeItems.includes(item)}
                                            onChange={() => toggleScopeItem(item)}
                                          />
                                          <span>{item}</span>
                                        </label>
                                      ))
                                }
                              </div>
                            )}
                          </div>

                          <div className="reports-multi-select" ref={notificationTypeMenuRef}>
                            <button
                              type="button"
                              className="reports-multi-select-trigger"
                              onClick={() => setNotificationTypeMenuOpen((open) => !open)}
                            >
                              {selectedNotificationTypeLabels.length > 0
                                ? `${selectedNotificationTypeLabels.length} notifications selected`
                                : "Select notifications"}
                            </button>

                            {notificationTypeMenuOpen && (
                              <div className="reports-multi-select-menu">
                                <div className="reports-multi-select-actions">
                                  <button type="button" onClick={selectAllNotificationTypes}>Select all</button>
                                  <button type="button" onClick={clearNotificationTypes}>Clear</button>
                                </div>
                                {notificationTypeOptions.map((option) => (
                                  <label key={option.value} className="reports-multi-select-option">
                                    <input
                                      type="checkbox"
                                      checked={selectedNotificationTypeSet.has(option.value)}
                                      onChange={() => toggleNotificationType(option.value)}
                                    />
                                    <span>{option.label}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="reports-multi-select" ref={scopeMenuRef}>
                          <button
                            type="button"
                            className="reports-multi-select-trigger"
                            onClick={() => setScopeMenuOpen((open) => !open)}
                          >
                            {selectedScopeItems.length === 0
                              ? `All ${runBasis === "asset" ? "assets" : "drivers"}`
                              : selectedScopeItems.length === 1
                                ? selectedScopeItems[0]
                                : `${selectedScopeItems.length} selected`}
                          </button>
                          {scopeMenuOpen && (
                            <div className="reports-multi-select-menu">
                              <input
                                type="text"
                                className="reports-multi-select-filter"
                                placeholder={`Filter ${runBasis === "asset" ? "registrations" : "drivers"}…`}
                                value={scopeSearch}
                                onChange={(e) => setScopeSearch(e.target.value)}
                              />
                              <div className="reports-multi-select-actions">
                                <button type="button" onClick={() => setSelectedScopeItems(scopeItems)}>Select all</button>
                                <button type="button" onClick={() => setSelectedScopeItems([])}>Clear</button>
                              </div>
                              {scopeItems.length === 0
                                ? <div className="reports-multi-select-empty">No {runBasis === "asset" ? "assets" : "drivers"} available</div>
                                : scopeItems
                                    .filter((item) => item.toLowerCase().includes(scopeSearch.toLowerCase()))
                                    .map((item) => (
                                      <label key={item} className="reports-multi-select-option">
                                        <input
                                          type="checkbox"
                                          checked={selectedScopeItems.includes(item)}
                                          onChange={() => toggleScopeItem(item)}
                                        />
                                        <span>{item}</span>
                                      </label>
                                    ))
                              }
                            </div>
                          )}
                        </div>
                      )}
                    </label>
                  </div>

                  <div className="reports-action-row">
                    <button type="button" className="reports-action-btn" onClick={handleCreateFavorite}>
                      Create Favourite
                    </button>
                    <button type="button" className="reports-action-btn" onClick={handleCreateSubscription}>
                      Create Subscription
                    </button>
                  </div>
                  <div className="reports-page-run-options">
                    <label>
                      <span>Action</span>
                      <select value={runAction} onChange={(event) => setRunAction(event.target.value as RunAction)}>
                        <option value="view">View</option>
                        <option value="download">Download</option>
                      </select>
                    </label>
                    {showReportOutputSelector && (
                      <label>
                        <span>Report output</span>
                        <select
                          value={reportOutputMode}
                          onChange={(event) => setReportOutputMode(event.target.value as ReportOutputMode)}
                        >
                          <option value="detailed">Detailed</option>
                          <option value="summary">Summary</option>
                        </select>
                      </label>
                    )}
                    {runAction === "download" && (
                      <label>
                        <span>Download format</span>
                        <select value={downloadFormat} onChange={(event) => setDownloadFormat(event.target.value as DownloadFormat)}>
                          <option value="excel">Excel</option>
                          <option value="pdf">PDF</option>
                          <option value="csv">CSV</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`reports-run-btn${isRunningReport ? " is-loading" : ""}`}
                    onClick={handleRunReport}
                    disabled={isRunningReport}
                    aria-busy={isRunningReport}
                  >
                    {isRunningReport ? (
                      <>
                        <span className="vt-spinner vt-spinner--inline" aria-hidden="true">
                          {Array.from({ length: 12 }, (_, tick) => (
                            <i key={tick} style={{ ["--i" as string]: tick }} />
                          ))}
                        </span>
                        Loading report...
                      </>
                    ) : "Run Report"}
                  </button>
                  {isRunningReport && (
                    <div className="reports-run-loading-note">Fetching report data. Please wait...</div>
                  )}
                  {runError && (
                    <div className="reports-run-error" role="alert">{runError}</div>
                  )}
                </div>

                {showScopeSnapshot && lastRunSnapshot && (
                  <div className="reports-analytics">
                    <div className="reports-analytics-head">
                      <div className="reports-label">
                        Scope snapshot for {selectedCategory} • {runBasis === "asset" ? "Asset" : "Driver"}: {selectedScopeItem ? selectedScopeItem : "(all)"} • {selectedSite || "No site"} • {selectedDatabase || "No database"}
                      </div>
                      <div className={`reports-verified-chip${isVerifiedReportSelection ? " is-verified" : ""}`}>
                        {isVerifiedReportSelection ? "Data verified" : "Standard output"}
                      </div>
                    </div>
                    <div className="reports-analytics-note">{verifiedReportHint}</div>
                    <div className="reports-analytics-grid">
                      {scopeSnapshotCards.map((card) => (
                        <div key={card.title} className="reports-analytics-card">
                          <div className="reports-analytics-title">{card.title}</div>
                          <div className="reports-analytics-value">{card.value}</div>
                          <div className="reports-analytics-meta">
                            <span className="reports-analytics-change">{card.change}</span>
                            <span>{card.helper}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              </div>
            ) : isFavorites ? (
              <div className="reports-favorites">
                <div className="reports-label">Reports available in this category</div>
                <div className="reports-fav-table">
                  <div className="reports-fav-row reports-fav-head">
                    <div>Report description</div>
                    <div>Report</div>
                    <div>Date last processed</div>
                    <div className="reports-fav-actions" aria-hidden="true">⋯</div>
                  </div>
                  {favoriteReports.map((fav) => (
                    <div key={fav.id} className="reports-fav-row">
                      <div className="reports-fav-link">{fav.description}</div>
                      <div>{fav.report}</div>
                      <div>{fav.lastProcessed}</div>
                      <div className="reports-fav-actions">
                        <button
                          type="button"
                          className="reports-fav-btn"
                          aria-label="Actions"
                          onClick={() =>
                            setOpenFavoriteActions((prev) => (prev === fav.id ? null : fav.id))
                          }
                        >
                          ⋯
                        </button>
                        {openFavoriteActions === fav.id && (
                          <div className="reports-fav-menu" role="menu">
                            <button type="button" role="menuitem" onClick={() => handleRemoveFavorite(fav.id)}>Remove</button>
                            <button type="button" role="menuitem" onClick={() => handleRunFavoriteReport(fav)}>Run</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {!favoriteReports.length && (
                    <div className="reports-fav-row">
                      <div className="reports-fav-link">No favourite reports yet</div>
                      <div>—</div>
                      <div>—</div>
                      <div className="reports-fav-actions" aria-hidden="true">⋯</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="reports-favorites">
                <div className="reports-label">Active subscriptions</div>
                <div className="reports-fav-table">
                  <div className="reports-fav-row reports-fav-head">
                    <div>Report</div>
                    <div>Basis / target</div>
                    <div>Delivery</div>
                    <div>Status</div>
                  </div>
                  {subscriptions.map((sub) => (
                    <div key={sub.id} className="reports-fav-row reports-sub-row">
                      <div className="reports-fav-link">{sub.category} - {sub.report}<br />{sub.description}</div>
                      <div>{sub.basis} / {sub.target}</div>
                      <div>{sub.schedule} - {sub.format} - {sub.recipients.length} recipients<br />{sub.recipients.join(", ") || "No recipients"}</div>
                      <div>{sub.status} - Next: {sub.nextRunAt}</div>
                    </div>
                  ))}
                  {!subscriptions.length && (
                    <div className="reports-fav-row reports-sub-row">
                      <div className="reports-fav-link">No subscriptions yet</div>
                      <div>—</div>
                      <div>—</div>
                      <div>—</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </section>

      {showPreviewModal && (
        <div className="reports-modal-backdrop" onClick={() => setShowPreviewModal(false)}>
          <div className="reports-modal reports-modal--preview" onClick={(event) => event.stopPropagation()}>
            <div className="reports-preview-top-bar">
              <div className="reports-modal-head reports-modal-head--preview">
                <h3>Report preview</h3>
                {renderPreviewDownloadToolbar("modal")}
                <button type="button" className="reports-modal-close" onClick={() => setShowPreviewModal(false)} aria-label="Close preview">×</button>
              </div>
            </div>

            <div ref={previewContentRef}>
            {detailPreview ? (
              <div className="movement-preview-wrap">
                <div className="movement-preview-sheet">
                  <div className="movement-preview-brand-row">
                    <div className="movement-preview-title-block">
                      <h3>{detailPreview.reportName}</h3>
                      <p>From {detailPreview.dateRange}</p>
                      <div className={`reports-verified-chip${isVerifiedReportSelection ? " is-verified" : ""}`}>
                        {isVerifiedReportSelection ? "Data verified" : "Standard output"}
                      </div>
                    </div>
                    <div className="movement-preview-logo" aria-label="Report logo">
                      <ViviLogo variant="light" className="movement-preview-logo-image" />
                    </div>
                  </div>

                  <div className="movement-preview-meta-grid">
                    <div><strong>Organisation</strong><span>{detailPreview.organisation}</span></div>
                    <div><strong>Dealer</strong><span>{detailPreview.dealer}</span></div>
                    <div><strong>Database</strong><span>{detailPreview.database}</span></div>
                    <div><strong>Site</strong><span>{detailPreview.site}</span></div>
                  </div>

                  {detailPreview.kind === "trip" && (
                  <>
                    {tripDetailSections.map((section, sectionIndex) => (
                      <Fragment key={`trip-section-${sectionIndex}`}>
                        <div className="movement-preview-meta-grid movement-preview-asset-meta">
                          {assetSectionInfo({
                            assetDescription: section.assetLabel,
                            registrationNumber: section.rows[0]?.registration || "—",
                            assetId: section.rows[0]?.assetId || "—",
                            siteName: section.rows[0]?.siteName || "—"
                          }).map(([label, value]) => (
                            <div key={label}><strong>{label}</strong><span>{value}</span></div>
                          ))}
                        </div>
                        <table className="movement-preview-table" role="table" aria-label="Trip report table">
                          <thead>
                            <tr>
                              {TRIP_DETAIL_COLUMNS.map((column) => (
                                <th key={`${sectionIndex}-${column}`}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.map((row, idx) => (
                              <tr key={`trip-row-${sectionIndex}-${idx}`}>
                                {tripDetailRowCells(row).map((cell, cellIdx) => (
                                  <td key={`trip-cell-${sectionIndex}-${idx}-${cellIdx}`}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            {(() => {
                              const { totals, averages } = summarizeTripDetailRows(section.rows);
                              return (
                                <>
                                  <tr className="movement-preview-summary-row">
                                    {tripDetailSummaryCells("Totals", totals).map((cell, idx) => (
                                      <td key={`trip-total-${sectionIndex}-${idx}`}>{cell}</td>
                                    ))}
                                  </tr>
                                  <tr className="movement-preview-summary-row movement-preview-summary-row--avg">
                                    {tripDetailSummaryCells("Averages", averages).map((cell, idx) => (
                                      <td key={`trip-avg-${sectionIndex}-${idx}`}>{cell}</td>
                                    ))}
                                  </tr>
                                </>
                              );
                            })()}
                          </tfoot>
                        </table>
                      </Fragment>
                    ))}
                    {tripDetailPreview && tripDetailPreview.rows.length === 0 && (
                      <table className="movement-preview-table" role="table" aria-label="Trip report table">
                        <thead>
                          <tr>
                            {TRIP_DETAIL_COLUMNS.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td colSpan={TRIP_DETAIL_COLUMNS.length} className="movement-preview-empty">No trip data found for the selected range.</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </>
                  )}

                  {detailPreview.kind === "utilisation" && utilisationDetailPreview && (
                  <table className="movement-preview-table" role="table" aria-label="Asset utilisation report table">
                    <thead>
                      <tr>
                        {utilisationDetailPreview.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {utilisationDetailPreview.tableRows.map((row, idx) => (
                        <tr key={`utilisation-row-${idx}`}>
                          {row.map((cell, cellIdx) => (
                            <td key={`utilisation-cell-${idx}-${cellIdx}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                      {utilisationDetailPreview.tableRows.length === 0 && (
                        <tr>
                          <td colSpan={Math.max(utilisationDetailPreview.columns.length, 1)} className="movement-preview-empty">No utilisation data found for the selected range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  )}

                  {detailPreview.kind === "fuel" && fuelDetailPreview && fuelDetailPreview.showSectioned && fuelDetailPreview.sections && (
                  <>
                    {fuelDetailPreview.sections.map((section, sectionIndex) => (
                      <Fragment key={`fuel-section-${sectionIndex}`}>
                        <div className="movement-preview-meta-grid movement-preview-asset-meta">
                          <div><strong>Asset Description</strong><span>{section.assetDescription}</span></div>
                          <div><strong>Registration Number</strong><span>{section.registrationNumber}</span></div>
                          <div><strong>Asset ID</strong><span>{section.assetId}</span></div>
                          <div><strong>Site Name</strong><span>{section.siteName}</span></div>
                        </div>
                        <table className="movement-preview-table" role="table" aria-label="Fuel report table">
                          <thead>
                            <tr>
                              {fuelDetailPreview.columns.map((column) => (
                                <th key={`${sectionIndex}-${column}`}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.map((row, idx) => (
                              <tr key={`fuel-row-${sectionIndex}-${idx}`}>
                                {row.map((cell, cellIdx) => (
                                  <td key={`fuel-cell-${sectionIndex}-${idx}-${cellIdx}`}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                            {section.rows.length === 0 && (
                              <tr>
                                <td colSpan={fuelDetailPreview.columns.length} className="movement-preview-empty">
                                  No fuel data found for the selected range.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          {section.rows.length > 0 && section.totals && section.averages && (
                            <tfoot>
                              <tr className="movement-preview-summary-row">
                                {section.totals.map((cell, idx) => (
                                  <td key={`fuel-total-${sectionIndex}-${idx}`}>{cell}</td>
                                ))}
                              </tr>
                              <tr className="movement-preview-summary-row movement-preview-summary-row--avg">
                                {section.averages.map((cell, idx) => (
                                  <td key={`fuel-avg-${sectionIndex}-${idx}`}>{cell}</td>
                                ))}
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </Fragment>
                    ))}
                    {fuelDetailPreview.sections.length === 0 && (
                      <table className="movement-preview-table" role="table" aria-label="Fuel report table">
                        <thead>
                          <tr>
                            {fuelDetailPreview.columns.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td colSpan={fuelDetailPreview.columns.length} className="movement-preview-empty">
                              No fuel data found for the selected range.
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </>
                  )}

                  {detailPreview.kind === "fuel" && fuelDetailPreview && !fuelDetailPreview.showSectioned && (
                  <table className="movement-preview-table" role="table" aria-label="Fuel report table">
                    <thead>
                      <tr>
                        {fuelDetailPreview.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fuelDetailPreview.tableRows.map((row, idx) => (
                        <tr key={`fuel-row-${idx}`}>
                          {row.map((cell, cellIdx) => (
                            <td key={`fuel-cell-${idx}-${cellIdx}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                      {fuelDetailPreview.tableRows.length === 0 && (
                        <tr>
                          <td colSpan={Math.max(fuelDetailPreview.columns.length, 1)} className="movement-preview-empty">No fuel data found for the selected range.</td>
                        </tr>
                      )}
                    </tbody>
                    {fuelDetailPreview.showTotals && fuelDetailPreview.totals && fuelDetailPreview.averages && (
                      <tfoot>
                        <tr className="movement-preview-summary-row">
                          {fuelDetailPreview.totals.map((cell, idx) => (
                            <td key={`fuel-total-${idx}`}>{cell}</td>
                          ))}
                        </tr>
                        <tr className="movement-preview-summary-row movement-preview-summary-row--avg">
                          {fuelDetailPreview.averages.map((cell, idx) => (
                            <td key={`fuel-avg-${idx}`}>{cell}</td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  )}

                  {detailPreview.kind === "movement" && movementPreview && (
                  <>
                    {movementPreview.sections.map((section, sectionIndex) => (
                      <Fragment key={`movement-section-${sectionIndex}`}>
                        {movementPreview.variant === "detailed" && (
                          <div className="movement-preview-meta-grid movement-preview-asset-meta">
                            <div><strong>Asset Description</strong><span>{section.assetDescription}</span></div>
                            <div><strong>Registration Number</strong><span>{section.registrationNumber}</span></div>
                            <div><strong>Asset ID</strong><span>{section.assetId}</span></div>
                            <div><strong>Site Name</strong><span>{section.siteName}</span></div>
                          </div>
                        )}
                        <table className="movement-preview-table" role="table" aria-label="Movement report table">
                          <thead>
                            <tr>
                              {movementPreview.columns.map((column) => (
                                <th key={`${sectionIndex}-${column}`}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {movementPreview.variant === "location" && sectionIndex > 0 && (
                              <tr className="movement-preview-section-row">
                                <td colSpan={movementPreview.columns.length}>{section.assetDescription}</td>
                              </tr>
                            )}
                            {section.rows.map((row, idx) => (
                              <tr key={`movement-row-${sectionIndex}-${idx}`}>
                                {row.map((cell, cellIdx) => (
                                  <td key={`movement-cell-${sectionIndex}-${idx}-${cellIdx}`}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                            {section.rows.length === 0 && (
                              <tr>
                                <td colSpan={movementPreview.columns.length} className="movement-preview-empty">No movement data found for the selected range.</td>
                              </tr>
                            )}
                          </tbody>
                          {movementPreview.variant === "detailed" && section.rows.length > 0 && section.totals && section.averages && (
                            <tfoot>
                              <tr className="movement-preview-summary-row">
                                {section.totals.map((cell, idx) => (
                                  <td key={`movement-total-${sectionIndex}-${idx}`}>{cell}</td>
                                ))}
                              </tr>
                              <tr className="movement-preview-summary-row movement-preview-summary-row--avg">
                                {section.averages.map((cell, idx) => (
                                  <td key={`movement-avg-${sectionIndex}-${idx}`}>{cell}</td>
                                ))}
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </Fragment>
                    ))}
                    {movementPreview.sections.length === 0 && (
                      <table className="movement-preview-table" role="table" aria-label="Movement report table">
                        <thead>
                          <tr>
                            {movementPreview.columns.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td colSpan={movementPreview.columns.length} className="movement-preview-empty">No movement data found for the selected range.</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </>
                  )}
                </div>
              </div>
            ) : (
              <div className="movement-preview-wrap">
                <div className="movement-preview-sheet">
                  <div className="movement-preview-brand-row">
                    <div className="movement-preview-title-block">
                      <h3>{previewMeta?.reportName || selectedReportName || selectedCategory}</h3>
                      <p>From {`${formatReportDateTime(customFrom)} to ${formatReportDateTime(customTo)}`}</p>
                      <div className={`reports-verified-chip${isVerifiedReportSelection ? " is-verified" : ""}`}>
                        {isVerifiedReportSelection ? "Data verified" : "Standard output"}
                      </div>
                    </div>
                    <div className="movement-preview-logo" aria-label="Report logo">
                      <ViviLogo variant="light" className="movement-preview-logo-image" />
                    </div>
                  </div>

                  <div className="movement-preview-meta-grid">
                    <div><strong>Organisation</strong><span>{previewMeta?.organisation || "—"}</span></div>
                    <div><strong>Dealer</strong><span>{previewMeta?.dealer || "—"}</span></div>
                    <div><strong>Database</strong><span>{previewMeta?.database || "—"}</span></div>
                    <div><strong>Site</strong><span>{previewMeta?.site || "—"}</span></div>
                    {runBasis === "driver" ? (
                      <div><strong>Driver</strong><span>{selectedScopeItems.length > 0 ? selectedScopeItems.join(", ") : "All"}</span></div>
                    ) : null}
                  </div>

                  {utilisationPie && (
                    <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 12 }}>
                      <svg width="130" height="130" viewBox="0 0 42 42" aria-label="Daily utilisation band pie chart">
                        {(() => {
                          const circumference = 2 * Math.PI * 15.9155;
                          const greenLen = (utilisationPie.green / utilisationPie.total) * circumference;
                          const umberLen = (utilisationPie.umber / utilisationPie.total) * circumference;
                          const redLen = (utilisationPie.red / utilisationPie.total) * circumference;
                          return (
                            <>
                              <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#e2e8f0" strokeWidth="6" />
                              <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#16a34a" strokeWidth="6" strokeDasharray={`${greenLen} ${circumference}`} strokeDashoffset="0" transform="rotate(-90 21 21)" />
                              <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#b45309" strokeWidth="6" strokeDasharray={`${umberLen} ${circumference}`} strokeDashoffset={`-${greenLen}`} transform="rotate(-90 21 21)" />
                              <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#dc2626" strokeWidth="6" strokeDasharray={`${redLen} ${circumference}`} strokeDashoffset={`-${greenLen + umberLen}`} transform="rotate(-90 21 21)" />
                            </>
                          );
                        })()}
                      </svg>
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Daily utilisation bands</div>
                        <div style={{ color: "#16a34a" }}>Green (well utilised): {utilisationPie.green}</div>
                        <div style={{ color: "#b45309" }}>Umber (medium): {utilisationPie.umber}</div>
                        <div style={{ color: "#dc2626" }}>Red (below average): {utilisationPie.red}</div>
                      </div>
                    </div>
                  )}

                <table className="movement-preview-table" role="table" aria-label="Report table">
                  <thead>
                    <tr>
                      {previewTableModel.headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewTableModel.body.length === 0 ? (
                      <tr>
                        <td colSpan={Math.max(previewTableModel.headers.length, 1)} className="movement-preview-empty">
                          {REPORT_NO_DATA_MESSAGE}
                        </td>
                      </tr>
                    ) : (
                      previewTableModel.body.map((line, idx) => (
                        <tr key={`preview-row-${idx}`}>
                          {line.map((cell, cellIdx) => {
                            const header = previewTableModel.headers[cellIdx] || "";
                            const isBandCell = isDriverPerformanceReportName(selectedReportName || "") && header.toLowerCase() === "band";
                            const isTrendCell = assetSummaryPreview && header === "Trend";
                            const trendValues = isTrendCell ? previewRows[idx]?.trendSeries : undefined;
                            const color = isBandCell ? bandColor(String(cell)) : "inherit";
                            const bg = isBandCell ? `${color}22` : "transparent";
                            const style = isBandCell
                              ? { backgroundColor: bg, color, fontWeight: 700, borderRadius: 6, padding: "4px 8px", display: "inline-block" as const }
                              : undefined;
                            return (
                              <td key={`preview-cell-${idx}-${cellIdx}`} className={isTrendCell ? "report-trend-cell" : undefined}>
                                {isTrendCell ? (
                                  <ReportTrendSparkline values={trendValues ?? []} />
                                ) : isBandCell ? (
                                  <span style={style}>{cell}</span>
                                ) : (
                                  cell
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {showRunModal && (
        <div className="reports-modal-backdrop" onClick={() => setShowRunModal(false)}>
          <div className="reports-modal" onClick={(event) => event.stopPropagation()}>
            <div className="reports-modal-head">
              <h3>Create subscription</h3>
              <button type="button" onClick={() => setShowRunModal(false)}>x</button>
            </div>

            <div className="reports-modal-block">
              <div className="reports-modal-grid">
                <label>
                  <span>Frequency</span>
                  <select value={subscriptionFrequency} onChange={(event) => setSubscriptionFrequency(event.target.value)}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label>
                  <span>Report format</span>
                  <select
                    value={subscriptionReportFormat}
                    onChange={(event) => setSubscriptionReportFormat(event.target.value as DownloadFormat)}
                  >
                    <option value="excel">Excel</option>
                    <option value="pdf">PDF</option>
                    <option value="csv">CSV</option>
                  </select>
                </label>

                {subscriptionFrequency === "daily" && (
                  <label>
                    <span>Send time</span>
                    <input
                      type="time"
                      value={subscriptionDailyTime}
                      onChange={(event) => setSubscriptionDailyTime(event.target.value)}
                    />
                  </label>
                )}

                {subscriptionFrequency === "weekly" && (
                  <label>
                    <span>Day of week</span>
                    <select
                      value={subscriptionWeeklyDay}
                      onChange={(event) => setSubscriptionWeeklyDay(event.target.value as typeof weekdays[number])}
                    >
                      {weekdays.map((day) => (
                        <option key={day} value={day}>
                          {day.charAt(0).toUpperCase() + day.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {subscriptionFrequency === "monthly" && (
                  <label>
                    <span>Day of month</span>
                    <select
                      value={String(subscriptionMonthlyDay)}
                      onChange={(event) => setSubscriptionMonthlyDay(Number(event.target.value))}
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <option key={day} value={String(day)}>{day}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="reports-modal-grid">
                <label>
                  <span>Report description</span>
                  <input
                    type="text"
                    value={subscriptionDescription}
                    onChange={(event) => setSubscriptionDescription(event.target.value)}
                    placeholder="Subscription description"
                  />
                </label>
                <label>
                  <span>Email subject</span>
                  <input
                    type="text"
                    value={subscriptionEmailSubject}
                    onChange={(event) => setSubscriptionEmailSubject(event.target.value)}
                    placeholder="Email subject"
                  />
                </label>
              </div>

              <div className="reports-modal-recipient-note">
                Please select recipients from the contact list. If the recipient does not exist -
                <button type="button" className="reports-inline-link" onClick={() => setShowAddContactModal(true)}>
                  click here to add.
                </button>
              </div>

              <div className="reports-recipients-actions">
                <button type="button" className="reports-action-btn" onClick={() => setShowSelectRecipientsModal(true)}>
                  Select recipients
                </button>
                <span>{selectedRecipients.length} selected</span>
              </div>

              <div className="reports-recipient-list">
                {selectedRecipients.map((recipient) => (
                  <div key={recipient.id}>{recipient.firstName} {recipient.lastName} - {recipient.email}</div>
                ))}
                {!selectedRecipients.length && <div>No recipients selected yet.</div>}
              </div>
            </div>

            <div className="reports-modal-actions">
              <button type="button" onClick={() => setShowRunModal(false)}>Cancel</button>
              <button type="button" className="reports-run-btn" onClick={() => {
                if (selectedRecipients.length === 0) {
                  setShowSelectRecipientsModal(true);
                  return;
                }
                appendSubscription();
                setShowRunModal(false);
                setActiveTab("subscriptions");
                setCreateSubscriptionOnRun(false);
              }}>Create Subscription</button>
            </div>
          </div>
        </div>
      )}

      {showAddContactModal && (
        <div className="reports-modal-backdrop" onClick={() => setShowAddContactModal(false)}>
          <div className="reports-modal reports-modal--narrow" onClick={(event) => event.stopPropagation()}>
            <div className="reports-modal-head">
              <h3>Add new contact</h3>
              <button type="button" onClick={() => setShowAddContactModal(false)}>x</button>
            </div>
            <div className="reports-modal-grid">
              <label>
                <span>First name*</span>
                <input type="text" value={contactForm.firstName} onChange={(event) => setContactForm((c) => ({ ...c, firstName: event.target.value }))} />
              </label>
              <label>
                <span>Last name</span>
                <input type="text" value={contactForm.lastName} onChange={(event) => setContactForm((c) => ({ ...c, lastName: event.target.value }))} />
              </label>
              <label>
                <span>Employer</span>
                <input type="text" value={contactForm.employer} onChange={(event) => setContactForm((c) => ({ ...c, employer: event.target.value }))} />
              </label>
              <label>
                <span>Position</span>
                <input type="text" value={contactForm.position} onChange={(event) => setContactForm((c) => ({ ...c, position: event.target.value }))} />
              </label>
              <label>
                <span>Email*</span>
                <input type="email" value={contactForm.email} onChange={(event) => setContactForm((c) => ({ ...c, email: event.target.value }))} />
              </label>
              <label>
                <span>Mobile</span>
                <input type="text" value={contactForm.mobile} onChange={(event) => setContactForm((c) => ({ ...c, mobile: event.target.value }))} />
              </label>
            </div>
            <div className="reports-modal-actions">
              <button type="button" onClick={() => setShowAddContactModal(false)}>Close</button>
              <button type="button" className="reports-run-btn" onClick={handleSaveContact}>Agree and save</button>
            </div>
          </div>
        </div>
      )}

      {showSelectRecipientsModal && (
        <div className="reports-modal-backdrop" onClick={() => setShowSelectRecipientsModal(false)}>
          <div className="reports-modal reports-modal--narrow" onClick={(event) => event.stopPropagation()}>
            <div className="reports-modal-head">
              <h3>Select recipients</h3>
              <button type="button" onClick={() => setShowSelectRecipientsModal(false)}>x</button>
            </div>
            <input
              className="reports-select-single"
              placeholder="Filter"
              value={recipientFilter}
              onChange={(event) => setRecipientFilter(event.target.value)}
            />
            <div className="reports-recipient-table">
              {filteredContacts.map((contact) => (
                <label key={contact.id} className="reports-recipient-row">
                  <input
                    type="checkbox"
                    checked={selectedRecipientIds.includes(contact.id)}
                    onChange={() => toggleRecipient(contact.id)}
                  />
                  <span>{contact.firstName} {contact.lastName}</span>
                  <span>{contact.employer || "-"}</span>
                  <span>{contact.position || "-"}</span>
                  <span>{contact.email}</span>
                </label>
              ))}
              {!filteredContacts.length && <div className="reports-recipient-empty">No contacts found.</div>}
            </div>
            <div className="reports-modal-actions">
              <button type="button" onClick={() => setShowSelectRecipientsModal(false)}>Cancel</button>
              <button type="button" className="reports-run-btn" onClick={() => setShowSelectRecipientsModal(false)}>Select</button>
            </div>
          </div>
        </div>
      )}
      <ScheduleDateTimePicker
        open={showDatePickerModal}
        title={reportDatePickerTitle}
        date={reportDatePickerDateObj}
        time={reportDatePickerTime}
        mode={reportDatePickerMode}
        restrictToPast
        onClose={() => setShowDatePickerModal(false)}
        onConfirm={applyReportDatePicker}
        onDateChange={setReportDatePickerDateObj}
        onTimeChange={setReportDatePickerTime}
        onModeChange={setReportDatePickerMode}
      />
    </div>
  );
}
