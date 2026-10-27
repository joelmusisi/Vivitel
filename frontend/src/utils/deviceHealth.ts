/** Device Health (Live Tracking): raw telemetry rows from the backend push feed. */

export const DEVICE_HEALTH_REFRESH_MS = 30_000;
const MAX_ROWS = 200;
/** No report for this long → the device is treated as not reporting. */
const STALE_MS = 10 * 60_000;

type Attributes = Record<string, unknown>;

export type DeviceHealthPosition = {
  id?: number;
  deviceId?: number;
  protocol?: string;
  serverTime?: string;
  deviceTime?: string;
  fixTime?: string;
  valid?: boolean;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  speed?: number;
  course?: number;
  accuracy?: number;
  address?: string | null;
  attributes?: Attributes;
  __receivedAt?: string;
  __source?: "socket" | "forward" | "http";
};

export type DeviceHealthRow = DeviceHealthPosition & { key: string };

export type DeviceHealthResponse = {
  ok?: boolean;
  error?: string;
  deviceId?: number;
  device?: {
    id?: number;
    name?: string;
    uniqueId?: string;
    status?: string;
    lastUpdate?: string;
    model?: string;
    phone?: string;
  } | null;
  history?: DeviceHealthPosition[];
  feed?: { socket?: boolean; lastSocketAt?: string | null; lastForwardAt?: string | null; error?: string };
  /** Where the rows came from: the backend push feed, or a direct Traccar read. */
  via?: "feed" | "traccar";
};

const num = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const attr = (row: DeviceHealthPosition, ...keys: string[]) => {
  for (const key of keys) {
    const value = row.attributes?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

const fixed = (value: number | undefined, digits: number) => (value === undefined ? "—" : value.toFixed(digits));
const yesNo = (value: unknown) => (value === undefined ? "—" : value === true || value === "true" || value === 1 ? "On" : "Off");

const rowKey = (row: DeviceHealthPosition) =>
  row.id != null ? `id:${row.id}` : `t:${row.fixTime ?? ""}|${row.serverTime ?? ""}`;

/** Merge new reports into the list (newest first), de-duplicated by position id. */
export function mergeDeviceHealthRows(current: DeviceHealthRow[], incoming: DeviceHealthPosition[]): DeviceHealthRow[] {
  const byKey = new Map<string, DeviceHealthRow>();
  for (const row of current) byKey.set(row.key, row);
  for (const row of incoming) {
    const key = rowKey(row);
    byKey.set(key, { ...byKey.get(key), ...row, key });
  }
  const time = (row: DeviceHealthRow) => Date.parse(String(row.fixTime ?? row.serverTime ?? "")) || 0;
  return [...byKey.values()].sort((a, b) => time(b) - time(a)).slice(0, MAX_ROWS);
}

export type DeviceHealthColumn = {
  key: string;
  label: string;
  help: string;
  numeric?: boolean;
  format: (row: DeviceHealthRow) => string;
};

/** Columns that help support judge whether a device is healthy. */
export const DEVICE_HEALTH_COLUMNS: DeviceHealthColumn[] = [
  { key: "fixTime", label: "GPS time", help: "When the device took the fix", format: (r) => String(r.fixTime ?? "—") },
  { key: "serverTime", label: "Received", help: "When the server received the report", format: (r) => String(r.serverTime ?? "—") },
  {
    key: "delay",
    label: "Delay (s)",
    help: "Received − GPS time. Large values mean buffered or late data",
    numeric: true,
    format: (r) => {
      const fix = Date.parse(String(r.fixTime ?? ""));
      const server = Date.parse(String(r.serverTime ?? ""));
      return Number.isFinite(fix) && Number.isFinite(server) ? String(Math.round((server - fix) / 1000)) : "—";
    }
  },
  { key: "valid", label: "GPS fix", help: "Valid GPS fix", format: (r) => (r.valid === undefined ? "—" : r.valid ? "Valid" : "Invalid") },
  { key: "sat", label: "Satellites", help: "Satellites in use", numeric: true, format: (r) => fixed(num(attr(r, "sat", "satellites")), 0) },
  { key: "hdop", label: "HDOP", help: "Horizontal accuracy (lower is better; > 2 is poor)", numeric: true, format: (r) => fixed(num(attr(r, "hdop")), 1) },
  { key: "rssi", label: "GSM signal", help: "Mobile signal (rssi / gsm level)", numeric: true, format: (r) => fixed(num(attr(r, "rssi", "gsm", "signal")), 0) },
  { key: "speed", label: "Speed (km/h)", help: "Reported speed", numeric: true, format: (r) => fixed(num(r.speed) === undefined ? undefined : Number(r.speed) * 1.852, 0) },
  { key: "ignition", label: "Ignition", help: "Ignition input", format: (r) => yesNo(attr(r, "ignition")) },
  { key: "motion", label: "Motion", help: "Device motion flag", format: (r) => yesNo(attr(r, "motion")) },
  { key: "power", label: "Ext. power (V)", help: "Vehicle supply voltage", numeric: true, format: (r) => fixed(num(attr(r, "power", "externalPower")), 2) },
  { key: "battery", label: "Battery (V)", help: "Device backup battery voltage", numeric: true, format: (r) => fixed(num(attr(r, "battery")), 2) },
  { key: "batteryLevel", label: "Battery (%)", help: "Device backup battery level", numeric: true, format: (r) => fixed(num(attr(r, "batteryLevel")), 0) },
  {
    key: "odometer",
    label: "Odometer (km)",
    help: "Device odometer, else Traccar total distance",
    numeric: true,
    format: (r) => {
      const meters = num(attr(r, "odometer", "totalDistance"));
      return fixed(meters === undefined ? undefined : meters / 1000, 1);
    }
  },
  { key: "fuel", label: "Fuel", help: "Fuel level / sensor value", numeric: true, format: (r) => fixed(num(attr(r, "fuel", "fuelLevel")), 1) },
  { key: "event", label: "Event / alarm", help: "Alarm or IO event in this report", format: (r) => String(attr(r, "alarm", "event") ?? "—") },
  {
    key: "position",
    label: "Position",
    help: "Latitude, longitude",
    format: (r) =>
      num(r.latitude) !== undefined && num(r.longitude) !== undefined
        ? `${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`
        : "—"
  },
  {
    key: "source",
    label: "Feed",
    help: "How the report reached Vivitel",
    format: (r) => (r.__source === "forward" ? "Forwarded" : r.__source === "socket" ? "Live socket" : r.__source === "http" ? "History" : "—")
  }
];

export type DeviceHealthSummary = {
  cards: Array<{ label: string; value: string; hint?: string; tone: "ok" | "warn" | "bad" | "info" }>;
  feedLabel: string;
  lastReportAgeMs: number | null;
};

/** Headline checks for the newest report: reporting, GPS, power, signal, report interval. */
export function summarizeDeviceHealth(
  rows: DeviceHealthRow[],
  meta: Pick<DeviceHealthResponse, "device" | "feed" | "via"> | null,
  now = Date.now()
): DeviceHealthSummary {
  const latest = rows[0];
  const lastMs = latest ? Date.parse(String(latest.serverTime ?? latest.fixTime ?? "")) : Number.NaN;
  const lastReportAgeMs = Number.isFinite(lastMs) ? now - lastMs : null;

  const fixTimes = rows
    .map((row) => Date.parse(String(row.fixTime ?? "")))
    .filter((ms) => Number.isFinite(ms))
    .slice(0, 10);
  const gaps = fixTimes.slice(0, -1).map((ms, index) => ms - fixTimes[index + 1]).filter((gap) => gap > 0);
  const intervalSec = gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length / 1000) : null;

  const sat = latest ? num(attr(latest, "sat", "satellites")) : undefined;
  const power = latest ? num(attr(latest, "power", "externalPower")) : undefined;
  const rssi = latest ? num(attr(latest, "rssi", "gsm", "signal")) : undefined;
  const reporting = lastReportAgeMs !== null && lastReportAgeMs < STALE_MS;

  const cards: DeviceHealthSummary["cards"] = [
    {
      label: "Status",
      value: reporting ? "Reporting" : latest ? "Not reporting" : "No data",
      hint: meta?.device?.status ? `Server: ${meta.device.status}` : undefined,
      tone: reporting ? "ok" : "bad"
    },
    {
      label: "Report interval",
      value: intervalSec === null ? "—" : `${intervalSec}s`,
      hint: "Average of the last reports",
      tone: intervalSec === null ? "info" : intervalSec <= 60 ? "ok" : "warn"
    },
    {
      label: "GPS",
      value: latest?.valid === false ? "No fix" : sat === undefined ? (latest ? "Fix" : "—") : `${sat} sats`,
      tone: latest?.valid === false || (sat !== undefined && sat < 4) ? "warn" : latest ? "ok" : "info"
    },
    {
      label: "Ext. power",
      value: power === undefined ? "—" : `${power.toFixed(1)} V`,
      hint: power !== undefined && power < 9 ? "Low or disconnected" : undefined,
      tone: power === undefined ? "info" : power < 9 ? "bad" : "ok"
    },
    {
      label: "GSM signal",
      value: rssi === undefined ? "—" : String(rssi),
      tone: rssi === undefined ? "info" : rssi <= 1 ? "warn" : "ok"
    },
    {
      label: "Device",
      value: meta?.device?.uniqueId || "—",
      hint: [latest?.protocol, meta?.device?.model].filter(Boolean).join(" · ") || undefined,
      tone: "info"
    }
  ];

  const feed = meta?.feed;
  const feedLabel = meta?.via === "traccar"
    ? "Read from the tracking server every 30 s (push feed not available on this server yet)"
    : feed?.lastForwardAt
    ? `Traccar forwarding (last ${new Date(feed.lastForwardAt).toLocaleTimeString("en-GB")})`
    : feed?.socket
      ? "Live socket"
      : "Not connected — showing stored reports";

  return { cards, feedLabel, lastReportAgeMs };
}
