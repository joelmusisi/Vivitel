export type HosJurisdiction = "eu_aetr" | "us_fmcsa" | "ca_federal";

export type DutyStatus = "driving" | "on_duty" | "break" | "off_duty" | "sleeper";

/** Required rest after continuous driving (clients can configure multiple thresholds). */
export type HosBreakRule = {
  afterDriveHours: number;
  restMinutes: number;
};

export type HosLimitHours = {
  /** Maximum continuous / daily driving hours. */
  dailyDriveHours: number;
  /** Optional extended daily drive (e.g. EU 10h twice/week). */
  extendedDailyDriveHours?: number;
  /** Extended drive uses allowed per week. */
  extendedDailyDriveUsesPerWeek?: number;
  /** On-duty or duty-window hours (US 14h, CA 14h). */
  dutyWindowHours?: number;
  /** Maximum on-duty hours in a day (CA). */
  dailyOnDutyHours?: number;
  /**
   * Legacy single break threshold (kept for older saved rules).
   * Prefer `breakRules` when present.
   */
  breakAfterDriveHours: number;
  breakMinutes: number;
  /** Multiple break thresholds, e.g. 2h→15m and 4h→30m. */
  breakRules?: HosBreakRule[];
  /** Minimum daily off-duty / rest hours. */
  dailyRestHours: number;
  /** Reduced daily rest hours when allowed. */
  reducedDailyRestHours?: number;
  /** Weekly driving max (e.g. EU 56h). */
  weeklyDriveHours?: number;
  /** Rolling two-week driving max (EU 90h). */
  biweeklyDriveHours?: number;
  /** Rolling ~30-day / monthly driving max (client-configurable). */
  monthlyDriveHours?: number;
  /** Cycle hours (US 60/70, CA 70/120). */
  cycleHours?: number;
  /** Cycle days (7 or 8 / 14). */
  cycleDays?: number;
  /** Restart off-duty hours (US 34h). */
  restartOffDutyHours?: number;
  /** Near-limit warning threshold (fraction of remaining, e.g. 0.15 = 15% left). */
  nearLimitFraction: number;
};

export type HosRules = {
  jurisdiction: HosJurisdiction;
  label: string;
  limits: HosLimitHours;
  updatedAt?: string;
  updatedBy?: string;
};

export type DutySegment = {
  id: string;
  driverKey: string;
  driverName: string;
  assetLabel?: string;
  deviceId?: number;
  status: DutyStatus;
  startMs: number;
  endMs: number;
  source: "trip" | "gap" | "timeclock" | "inferred";
  tripId?: string;
};

export type HosViolation = {
  id: string;
  driverKey: string;
  driverName: string;
  assetLabel?: string;
  type: string;
  severity: "warning" | "violation";
  message: string;
  limitHours: number;
  actualHours: number;
  atMs: number;
};

export type HosAlertStatus = "open" | "acknowledged" | "resolved";

export type HosAlert = {
  id: string;
  driverKey: string;
  driverName: string;
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
  time: string;
  status: HosAlertStatus;
  atMs: number;
};

export type HosTimeclockPunch = {
  id: string;
  driverKey: string;
  driverName: string;
  status: DutyStatus;
  at: string;
  note?: string;
  createdBy?: string;
};

export type DriverHosStatus = {
  driverKey: string;
  driverName: string;
  assetLabel: string;
  deviceId?: number;
  currentStatus: DutyStatus;
  driveMsToday: number;
  onDutyMsToday: number;
  breakMsToday: number;
  offDutyMsToday: number;
  remainingDriveMs: number;
  remainingDutyMs: number;
  lastBreakMs: number | null;
  nearLimit: boolean;
  compliant: boolean;
  violations: HosViolation[];
  segments: DutySegment[];
};

export type HosFleetSnapshot = {
  rules: HosRules;
  fromMs: number;
  toMs: number;
  drivers: DriverHosStatus[];
  violations: HosViolation[];
  alerts: HosAlert[];
};
