import type { TraccarLiveRow } from "./api";
import type { ConfigGroupCompileAcceptance } from "./configGroupCompileStatus";

/**
 * Assets page "Faults" and "Config Upload Date" for devices that do not carry them on the
 * asset record. Faults come from what the tracker itself reports through Traccar (alarms,
 * external power, GPS fix, GSM signal, reporting gaps). Teltonika devices do not report a
 * configuration date, so that comes from the configuration group's last compile/upload.
 */

const NOT_REPORTING_MS = 24 * 60 * 60 * 1000;
/** Below this the vehicle supply is effectively disconnected (tracker on backup battery). */
const POWER_DISCONNECTED_V = 1;
/** Below this a 12 V / 24 V vehicle supply is too low to trust (flat or failing battery). */
const POWER_LOW_V = 10.5;

/** Traccar `alarm` attribute values → readable fault names. */
const ALARM_LABELS: Record<string, string> = {
  powerCut: "Power cut",
  powerOff: "Device powered off",
  lowPower: "Low external power",
  lowBattery: "Low backup battery",
  jamming: "GPS/GSM jamming",
  tampering: "Tampering",
  removing: "Device removed",
  gpsAntennaCut: "GPS antenna cut",
  sos: "SOS",
  vibration: "Vibration",
  movement: "Unauthorised movement",
  fault: "Device fault",
  temperature: "Temperature alarm",
  accident: "Accident",
  fallDown: "Fall detected"
};

const numberAttr = (attrs: Record<string, unknown>, key: string): number | null => {
  const value = Number(attrs[key]);
  return attrs[key] == null || attrs[key] === "" || !Number.isFinite(value) ? null : value;
};

const alarmLabel = (raw: string) =>
  ALARM_LABELS[raw] ?? raw.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** Faults the tracker is reporting right now; empty when the device looks healthy. */
export function deriveDeviceFaults(row: TraccarLiveRow | null | undefined, nowMs = Date.now()): string[] {
  if (!row) return [];
  const faults: string[] = [];
  const position = row.position ?? null;
  const lastMs = Date.parse(String(row.lastUpdate ?? position?.serverTime ?? position?.fixTime ?? ""));

  if (!position) {
    faults.push(Number.isFinite(lastMs) ? "No GPS position" : "Never reported");
    return faults;
  }

  if (Number.isFinite(lastMs) && nowMs - lastMs > NOT_REPORTING_MS) {
    const days = Math.floor((nowMs - lastMs) / NOT_REPORTING_MS);
    faults.push(`Not reporting (${days} day${days === 1 ? "" : "s"})`);
  }

  const attrs = position.attributes ?? {};
  String(attrs.alarm ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => faults.push(alarmLabel(value)));

  const power = numberAttr(attrs, "power");
  if (power != null && !faults.includes("Power cut")) {
    if (power < POWER_DISCONNECTED_V) faults.push("External power disconnected");
    else if (power < POWER_LOW_V) faults.push(`Low external power (${power.toFixed(1)} V)`);
  }

  const satellites = numberAttr(attrs, "sat");
  if (position.valid === false || satellites === 0) faults.push("No GPS fix");

  if (numberAttr(attrs, "rssi") === 0) faults.push("No GSM signal");

  return [...new Set(faults)];
}

type ConfigGroupWithCompile = {
  id?: unknown;
  name?: unknown;
  compileAcceptance?: ConfigGroupCompileAcceptance | null;
  [key: string]: unknown;
};

type AssetIdentity = {
  imei?: unknown;
  registration?: unknown;
  configGroup?: unknown;
};

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

/**
 * When the configuration was last uploaded to this device, from its group's compile record:
 * the asset's own accepted outcome if present. Empty when the device never accepted one.
 */
export function configUploadDateFromGroups(asset: AssetIdentity, groups: ConfigGroupWithCompile[]): string {
  const groupRef = norm(asset.configGroup);
  if (!groupRef) return "";
  const group = groups.find((item) => norm(item.id) === groupRef || norm(item.name) === groupRef);
  const acceptance = group?.compileAcceptance;
  if (!acceptance || !Array.isArray(acceptance.assets)) return "";
  const imei = norm(asset.imei);
  const registration = norm(asset.registration);
  const outcome = acceptance.assets.find(
    (item) =>
      item.accepted &&
      ((imei && norm(item.imei) === imei) || (registration && norm(item.registration) === registration))
  );
  if (!outcome) return "";
  return String(outcome.compiledAt ?? acceptance.compiledAt ?? "").trim();
}
