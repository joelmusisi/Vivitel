import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
import { teltonikaAnalogInputNames } from "../../data/teltonikaAnalogInputs";
import {
  deleteBindingDetailed,
  getBindings,
  getDeviceReportingSettings,
  getTenantId,
  loadFromApi,
  peekCachedBindings,
  purgeAllBindingsForCurrentTenant,
  saveBinding,
  saveBindingDetailed,
  saveDeviceReportingSettings,
  buildApiUrl,
  getApiKey,
  getAssetsFromApi,
  getTraccarLive
} from "../../utils/api";
import { readFuelInputMillivolts } from "../../utils/traccarFuel";
import {
  getTraccarBluetoothDevices,
  type TraccarBluetoothDeviceOption
} from "../../utils/traccarBluetoothDevices";
import { isDatabaseTenant, subscribeScopeChange } from "../../utils/tenantContext";
import { filterRecordsForActiveSelection } from "../../utils/scopeStorage";
import {
  deleteNotificationBindingFromTraccar,
  resyncConfigurationGroupsForBinding,
  enrichDeviceBindingsWithAttachmentCounts,
  syncNotificationBindingToTraccar,
  type NotificationBindingRecord
} from "../../utils/traccarBindingSync";
import {
  countMonitoredEventsInCatalog,
  monitoredEventsInclude,
  normalizeMonitoredEvents,
  normalizeNotificationAvailability,
  toggleMonitoredEvent,
  type NotificationRow
} from "../../data/notificationLibrary";
import { loadFirmwareLibraryOptions, loadMobileDeviceLibraryOptions } from "../../utils/libraryCatalog";
import {
  createSampleNotificationBinding,
  SAMPLE_MONITORED_EVENTS,
  SAMPLE_NOTIFICATION_BINDING_ID,
  SAMPLE_NOTIFICATION_BINDING_NAME
} from "../../utils/createSampleNotificationBinding";
import {
  bindingMatchesSite,
  isUserNotificationBinding,
  loadNotificationLibraryItems,
  NOTIFICATION_LIBRARY_UPDATED_EVENT,
  readActiveSiteName,
  ensureSiteNotificationLibraryFuelEventsActive,
  repairDeviceBindingsWithoutSite,
  repairNotificationBindingsWithoutSite
} from "../../utils/notificationLibraryStore";
import { isUserLocationBinding } from "../../utils/bindingRecordUtils";
import { showToast } from "../../utils/toast";
import { runOptimisticUpdate } from "../../utils/optimisticUpdate";
import { cleanupLocationLibraryTemplateBindings, loadLocationGeofences } from "../../utils/locationGeofences";
import {
  beginSaving,
  endSavingDone,
  endSavingError,
  REQUIRED_MISSING_CLASS
} from "../../utils/saveFeedback";
import { syncFuelCapacityComputedAttributeFromDeviceBinding } from "../../utils/syncFuelCapacityComputedAttribute";
import {
  draftFuelCalibration,
  emptyFuelCalibrationDraftPoint,
  hasUsableFuelCalibration,
  interpolateFuelLitersFromCalibration,
  normalizeFuelCalibration,
  seedFuelCalibrationFromRange,
  type FuelCalibrationDraftPoint
} from "../../utils/fuelCalibration";
import "../../index.css";

const bindingSections = ["Notifications Bindings", "Location Bindings", "Devices Bindings"];

/** Shared grid for list header + rows (same pattern as Assets table). */
const NOTIFICATION_BINDINGS_GRID = "minmax(220px, 1.6fr) 160px 88px 148px";
const LOCATION_BINDINGS_GRID = "minmax(220px, 1fr) 120px 148px";
const DEVICE_BINDINGS_SUMMARY_GRID = "minmax(220px, 1.4fr) minmax(140px, 1fr) 88px 88px 148px";

const env = (import.meta as any).env ?? {};
const envServerDomain =
  typeof env.VITE_DEVICE_SERVER_DOMAIN === "string" ? env.VITE_DEVICE_SERVER_DOMAIN.trim() : "";
const envServerPortRaw = env.VITE_DEVICE_SERVER_PORT;
const envServerPort = Number(envServerPortRaw);
const defaultServerPort =
  Number.isFinite(envServerPort) && envServerPort > 0 && envServerPort <= 65535
    ? Math.trunc(envServerPort)
    : 6574;

type BindingRow = {
  id?: string;
  name: string;
  assetCount: number;
  groupCount: number;
  // Optional per-location configurations stored on a location binding
  locationsConfig?: LocationConfig[];
  // For notification bindings: which events are monitored
  monitoredEvents?: string[];
  /** Site anchor — bindings never apply across sites */
  site?: string;
};

type LocationConfig = {
  id: string; // location id
  name?: string;
  settings?: LocationSettings;
};

type LocationSettings = {
  overSpeedKph: number;
  bufferKph: number;
  warningDelay: { minutes: number; seconds: number };
  recordingDelay: { minutes: number; seconds: number };
  activeMessage: {
    priority: string;
    basedOnDuration: boolean;
    duration: { minutes: number; seconds: number };
    basedOnSpeed: boolean;
    speedKph: number;
  };
};

type DeviceBindingLine = {
  id: string;
  wire: string;
  line: string;
  tacho: string;
  connection: string;
  parameter?: string;
  /** Teltonika analogue input (IO1–IO15) for fuel voltage on Fuel / I3/F1 / I4/F2 lines. */
  analogInput?: string;
  /** Sensor mV range (optional) — clamps reading before fuel formula. */
  analogMvMin?: string;
  analogMvMax?: string;
  /** Tank level (litres) at Min mV / Max mV (optional). */
  tankCapacityMin?: string;
  tankCapacityMax?: string;
  /** @deprecated Unused by proportional fuel formula; kept for stored bindings. */
  fuelScale?: string;
  /** Optional sender mV → litres chart. */
  fuelCalibration?: FuelCalibrationDraftPoint[];
  /** RPM range at Min/Max mV — max RPM − (voltage ÷ rpmScale). */
  rpmMin?: string;
  rpmMax?: string;
  rpmScale?: string;
  /** Selected Traccar Bluetooth peripheral (Devices → BT line). */
  bluetoothTraccarDeviceId?: string;
  bluetoothTraccarDeviceName?: string;
  color?: string;
  canEnabled?: boolean;
  canProtocol?: string;
  connected?: boolean;
  defaultConnection?: string;
  externalAntenna?: boolean;
};

const FUEL_ANALOG_LINE_IDS = new Set(["fuel", "f1i3", "f2i4"]);
const RPM_ANALOG_LINE_ID = "rpm";

const isFuelAnalogDeviceLine = (lineId: string) => FUEL_ANALOG_LINE_IDS.has(String(lineId ?? "").trim().toLowerCase());

const isRpmAnalogDeviceLine = (lineId: string) => String(lineId ?? "").trim().toLowerCase() === RPM_ANALOG_LINE_ID;

const isAnalogSensorConfigLine = (lineId: string) => isFuelAnalogDeviceLine(lineId) || isRpmAnalogDeviceLine(lineId);

const analogSensorClearPatch = (lineId: string): Partial<DeviceBindingLine> => {
  const base: Partial<DeviceBindingLine> = {
    analogInput: "",
    analogMvMin: "",
    analogMvMax: "",
    parameter: ""
  };
  if (isFuelAnalogDeviceLine(lineId)) {
    return { ...base, tankCapacityMin: "", tankCapacityMax: "", fuelScale: "", fuelCalibration: [] };
  }
  if (isRpmAnalogDeviceLine(lineId)) {
    return { ...base, rpmMin: "", rpmMax: "", rpmScale: "" };
  }
  return base;
};

const isBluetoothDeviceLine = (lineId: string) => String(lineId ?? "").trim().toLowerCase() === "bt";

function anchorBindingToActiveSite<T extends { site?: string }>(row: T): T | null {
  const site = String(row.site ?? readActiveSiteName()).trim();
  if (!site) return null;
  return { ...row, site };
}

type DeviceBindingRow = BindingRow & {
  deviceType: string;
  lines?: DeviceBindingLine[];
  advancedConfirmed?: boolean;
  advancedSettings?: AdvancedSettings;
  gsmSettings?: GsmSettings;
};

type GsmSettings = {
  gprsEnabled: boolean;
  gprsRoamingAllowed: boolean;
  gprsLimitSessionsEnabled: boolean;
  gprsMaxSessionsPerDay: number;
  smsEnabled: boolean;
  smsRoamingAllowed: boolean;
  smsDailyLimit: number;
  remoteCommandEnabled: boolean;
  remoteCommandTransport: "GPRS" | "SMS";
};

type AdvancedSettings = {
  baseFeatureEnabled: boolean;
  armingDelay: { hours: number; minutes: number; seconds: number };
  standingDelay: { hours: number; minutes: number; seconds: number };
  tripStartCondition: string;
  disarmOnlyWithDriver: boolean;
  ignitionWired: boolean;
  firmwareEnabled: boolean;
  preferredFirmware: string;
  locationSpeedMonitoring: boolean;
  commandInterpreter: boolean;
  progressiveShutdownOta: boolean;
  accelerometerEnabled: boolean;
  impactSensitivity: number;
  externalForceSensitivity: number;
  roadRoughnessSensitivity: number;
  requireCompanyId: boolean;
  engineHoursEnabled: boolean;
  recordEngineHours: string;
  buzzerEnabled: boolean;
  buzzerOnIgnition: string;
  buzzerFrequency: number;
  buzzerVolume: string;
  /** Let notification-library alerts pulse relay drive 1 (immobilizer) / 2. Off unless chosen. */
  relayAlertsEnabled?: boolean;
  sendAvlsEnabled: boolean;
  sendAvlTripFrequency: { hours: number; minutes: number; seconds: number };
  sendAvlHeadingChange: number;
  sendAvlDistance: number;
  sendAvlOutOfTrip: boolean;
  sendAvlOutOfTripFrequency: { hours: number; minutes: number; seconds: number };
  sendFaultCodes: boolean;
  unitPowerManagement: boolean;
  batteryVoltageThreshold: number;
  autoShutdown: boolean;
  autoShutdownParkedFor: { hours: number; minutes: number; seconds: number };
  peripheralPowerManagement: boolean;
  peripheralAutoShutdown: boolean;
  peripheralParkedFor: { hours: number; minutes: number; seconds: number };
  peripheralWakeDuration: { hours: number; minutes: number; seconds: number };
  surfacingEnabled: boolean;
  surfacingInterval: { hours: number; minutes: number; seconds: number };
  surfacingLimitEnabled: boolean;
  surfacingMaxTimes: number;
  magixEnabled: boolean;
  magixRegion: string;
};

type BindingDraft = {
  id?: string;
  name: string;
  deviceType?: string;
  monitoredEvents?: string[];
  site?: string;
};

type DeviceReportingSettings = {
  enabled: boolean;
  apn: string;
  apnUsername: string;
  apnPassword: string;
  apnAuth: "AUTO" | "PAP" | "CHAP";
  serverDomain: string;
  serverPort: number;
  protocol: "AUTO" | "TCP" | "UDP";
  tls: "AUTO" | "None" | "TLS/DTLS";
};

const defaultGsmSettings: GsmSettings = {
  gprsEnabled: true,
  gprsRoamingAllowed: false,
  gprsLimitSessionsEnabled: false,
  gprsMaxSessionsPerDay: 1000,
  smsEnabled: false,
  smsRoamingAllowed: false,
  smsDailyLimit: 10,
  remoteCommandEnabled: true,
  remoteCommandTransport: "GPRS"
};

const defaultCanLibrary = [
  "Not connected",
  "CAN:UD.Quon.410-450.ADDE1500_00.v1.0.0.2_DC (Scriptable CAN)",
  "CAN: J1939 FMS Scania Rev 1.2.0.3 (Scriptable CAN)",
  "Dynamic CAN (Scriptable CAN)",
  "Script.CAN.J1939.250KBPS.GPS_CHECK.ACK_ENBL.v1.23.0.4_MG (Scriptable CAN)",
  "Script.CAN.J1939.250KBPS.v1.18.0.0_MG (Scriptable CAN)",
  "Script.CAN.UD.Quon.410-450.ADDE1500_00.ACK_ENBL.v1.10.3_DC (Scriptable CAN)"
];

const createDefaultAdvancedSettings = (): AdvancedSettings => ({
  baseFeatureEnabled: true,
  armingDelay: { hours: 0, minutes: 5, seconds: 0 },
  standingDelay: { hours: 0, minutes: 2, seconds: 0 },
  tripStartCondition: "A driver is identified and the ignition is on",
  disarmOnlyWithDriver: false,
  ignitionWired: true,
  firmwareEnabled: true,
  preferredFirmware: "",
  locationSpeedMonitoring: false,
  commandInterpreter: true,
  progressiveShutdownOta: false,
  accelerometerEnabled: true,
  impactSensitivity: 50,
  externalForceSensitivity: 50,
  roadRoughnessSensitivity: 50,
  requireCompanyId: false,
  engineHoursEnabled: false,
  recordEngineHours: "Ignition on OR engine revs",
  buzzerEnabled: true,
  buzzerOnIgnition: "Sound the buzzer for 10 seconds",
  buzzerFrequency: 4000,
  buzzerVolume: "Full Volume",
  relayAlertsEnabled: false,
  sendAvlsEnabled: true,
  sendAvlTripFrequency: { hours: 0, minutes: 0, seconds: 40 },
  sendAvlHeadingChange: 10,
  sendAvlDistance: 1000,
  sendAvlOutOfTrip: true,
  sendAvlOutOfTripFrequency: { hours: 0, minutes: 30, seconds: 0 },
  sendFaultCodes: true,
  unitPowerManagement: true,
  batteryVoltageThreshold: 11500,
  autoShutdown: true,
  autoShutdownParkedFor: { hours: 72, minutes: 0, seconds: 0 },
  peripheralPowerManagement: true,
  peripheralAutoShutdown: true,
  peripheralParkedFor: { hours: 18, minutes: 0, seconds: 0 },
  peripheralWakeDuration: { hours: 0, minutes: 15, seconds: 0 },
  surfacingEnabled: true,
  surfacingInterval: { hours: 4, minutes: 0, seconds: 0 },
  surfacingLimitEnabled: true,
  surfacingMaxTimes: 10,
  magixEnabled: false,
  magixRegion: "South Africa"
});

/** Physical harness colours from the unit external interface (CON1 4-pin, CON2 10-pin). */
const HARNESS_WIRE_BY_LINE_ID: Record<string, { wire: string; color: string; note: string }> = {
  c1: { wire: "Green", color: "#16a34a", note: "CON1 PIN4 · CAN BUS H" },
  c2: { wire: "White", color: "#f8fafc", note: "CON1 PIN3 · CAN BUS L" },
  f1i3: { wire: "Green", color: "#16a34a", note: "CON2 PIN5" },
  fuel: { wire: "Orange", color: "#f97316", note: "CON2 PIN3" },
  rpm: { wire: "Yellow", color: "#eab308", note: "CON2 PIN4" },
  i1: { wire: "Red", color: "#dc2626", note: "CON2 PIN2 · Output1 · open collector" },
  i2: { wire: "Brown", color: "#92400e", note: "CON2 PIN1 · Input 1 · high trigger" },
  i3f1: { wire: "Blue", color: "#2563eb", note: "CON2 PIN6 · Input 2 · low trigger" },
  gnd: { wire: "Purple", color: "#7c3aed", note: "CON2 PIN7 · GND" },
  uart1tx: { wire: "Gray", color: "#6b7280", note: "CON2 PIN8 · Uart1_TX · Download" },
  uart1rx: { wire: "White", color: "#f8fafc", note: "CON2 PIN9 · Uart1_RX · Download" },
  boot0: { wire: "Black", color: "#111827", note: "CON2 PIN10 · BOOT0 · Download" }
};

function harnessWireForLine(lineId: string) {
  return HARNESS_WIRE_BY_LINE_ID[String(lineId ?? "").trim().toLowerCase()];
}

function withHarnessWire<T extends { id: string; wire: string; color?: string }>(line: T): T {
  const harness = harnessWireForLine(line.id);
  if (!harness) return line;
  return { ...line, wire: harness.wire, color: harness.color };
}

const defaultDeviceLines: DeviceBindingLine[] = [
  {
    id: "c1",
    wire: "Green",
    line: "CAN H",
    tacho: "",
    connection: "No",
    color: "#16a34a",
    canEnabled: false,
    canProtocol: ""
  },
  {
    id: "c2",
    wire: "White",
    line: "CAN L",
    tacho: "",
    connection: "No",
    color: "#f8fafc",
    canEnabled: false,
    canProtocol: ""
  },
  {
    id: "f1i3",
    wire: "Green",
    line: "I3/F1",
    tacho: "",
    connection: "Not connected",
    parameter: "",
    color: "#16a34a",
    connected: false,
    defaultConnection: "Not connected"
  },
  {
    id: "f2i4",
    wire: "",
    line: "I4/F2",
    tacho: "",
    connection: "Not connected",
    parameter: "",
    color: "#15803d",
    connected: false,
    defaultConnection: "Not connected"
  },
  {
    id: "speed",
    wire: "",
    line: "Speed",
    tacho: "",
    connection: "Not connected",
    parameter: "",
    color: "#64748b",
    connected: false,
    defaultConnection: "Not connected"
  },
  {
    id: "rpm",
    wire: "Yellow",
    line: "RPM",
    tacho: "",
    connection: "Not connected",
    parameter: "",
    color: "#eab308",
    connected: false,
    defaultConnection: "Connected"
  },
  {
    id: "fuel",
    wire: "Orange",
    line: "Fuel",
    tacho: "",
    connection: "Not connected",
    color: "#f97316",
    connected: false,
    defaultConnection: "Connected"
  },
  {
    id: "i1",
    wire: "Red",
    line: "Immobiliser",
    tacho: "",
    connection: "Not connected",
    color: "#dc2626",
    connected: false,
    defaultConnection: "Starter Cut Inactive"
  },
  {
    id: "i2",
    wire: "Brown",
    line: "IGN",
    tacho: "",
    connection: "Not connected",
    color: "#92400e",
    connected: false,
    defaultConnection: "Connected"
  },
  {
    id: "i3f1",
    wire: "Blue",
    line: "Input line 3",
    tacho: "",
    connection: "Not connected",
    color: "#2563eb",
    connected: false,
    defaultConnection: "Not connected"
  },
  {
    id: "gnd",
    wire: "Purple",
    line: "GND",
    tacho: "",
    connection: "Not connected",
    color: "#7c3aed",
    connected: false,
    defaultConnection: "Not connected"
  },
  {
    id: "uart1tx",
    wire: "Gray",
    line: "Uart1_TX",
    tacho: "",
    connection: "Not connected",
    color: "#6b7280",
    connected: false,
    defaultConnection: "Not connected"
  },
  {
    id: "uart1rx",
    wire: "White",
    line: "Uart1_RX",
    tacho: "",
    connection: "Not connected",
    color: "#f8fafc",
    connected: false,
    defaultConnection: "Not connected"
  },
  {
    id: "boot0",
    wire: "Black",
    line: "BOOT0",
    tacho: "",
    connection: "Not connected",
    color: "#111827",
    connected: false,
    defaultConnection: "Not connected"
  },
  {
    id: "i4f2",
    wire: "",
    line: "Input line 4",
    tacho: "",
    connection: "Not connected",
    color: "#22c55e",
    connected: false,
    defaultConnection: "Not connected"
  },
  {
    id: "s1",
    wire: "",
    line: "S1",
    tacho: "",
    connection: "Not connected",
    color: "#94a3b8",
    connected: false,
    defaultConnection: "Connected"
  },
  {
    id: "gps",
    wire: "",
    line: "GPS",
    tacho: "",
    connection: "GPS module (Extended Device)",
    color: "#22c55e",
    connected: true,
    defaultConnection: "GPS module (Extended Device)",
    externalAntenna: false,
    parameter: "Internal antenna"
  },
  {
    id: "gsm",
    wire: "",
    line: "GSM",
    tacho: "",
    connection: "GSM module (Extended Device)",
    color: "#14b8a6",
    connected: true,
    defaultConnection: "GSM module (Extended Device)"
  },
  {
    id: "hos",
    wire: "",
    line: "HOS",
    tacho: "",
    connection: "Not connected",
    color: "#64748b",
    connected: false,
    defaultConnection: "Not connected"
  },
  {
    id: "bt",
    wire: "",
    line: "BT",
    tacho: "",
    connection: "Not connected",
    color: "#94a3b8",
    connected: false,
    defaultConnection: "Connected"
  },
  {
    id: "sp",
    wire: "",
    line: "SP",
    tacho: "",
    connection: "Not connected",
    color: "#94a3b8",
    connected: false,
    defaultConnection: "Connected"
  }
];

const REMOVED_DEVICE_LINE_IDS = new Set(["k", "o1", "o2", "s2"]);

const MODULE_LINE_ICONS = new Set(["gps", "gsm", "hos", "bt", "sp"]);

function DeviceModuleIcon({ id }: { id: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };
  if (id === "gps") {
    return (
      <svg {...common}>
        <path d="M5 15a7 7 0 0 1 14 0" />
        <path d="M12 15v4" />
        <path d="M9 19h6" />
        <path d="M12 11V7" />
        <circle cx="12" cy="6" r="1" fill="currentColor" stroke="none" />
        <path d="M8.5 9.5a4.5 4.5 0 0 1 7 0" />
      </svg>
    );
  }
  if (id === "gsm") {
    return (
      <svg {...common}>
        <path d="M12 21V9" />
        <path d="M8 21h8" />
        <path d="M8.5 12.5a5 5 0 0 1 7 0" />
        <path d="M5.5 9.5a9 9 0 0 1 13 0" />
      </svg>
    );
  }
  if (id === "hos") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="2.6" />
        <path d="M4.5 19c.4-2.8 2.2-4.2 4.5-4.2s4.1 1.4 4.5 4.2" />
        <circle cx="17" cy="16" r="3.2" />
        <path d="M17 14.4V16l1.1.8" />
      </svg>
    );
  }
  if (id === "bt") {
    return (
      <svg {...common}>
        <path d="M7 7l10 10-5 4V3l5 4L7 17" />
      </svg>
    );
  }
  if (id === "sp") {
    return (
      <svg {...common}>
        <rect x="4" y="8" width="9" height="11" rx="1.4" />
        <path d="M13 12h6" />
        <path d="M16.5 9.2 19.5 12l-3 2.8" />
      </svg>
    );
  }
  return null;
}

function formatFuelCalibrationSummary(line: DeviceBindingLine): string {
  const points = normalizeFuelCalibration(line.fuelCalibration);
  const minMv = String(line.analogMvMin ?? "").trim();
  const maxMv = String(line.analogMvMax ?? "").trim();
  const minL = String(line.tankCapacityMin ?? "").trim();
  const maxL = String(line.tankCapacityMax ?? "").trim();
  const parts: string[] = [];
  if (minMv || maxMv) parts.push(`${minMv || "0"}–${maxMv || "?"} mV`);
  if (minL || maxL) parts.push(`${minL || "0"}–${maxL || "?"} L`);
  if (points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    parts.push(`${points.length} chart points (${first.liters}–${last.liters} L)`);
  }
  return parts.join(" · ") || "Set sender range and optional chart";
}

function isFuelCalibrationComplete(line: DeviceBindingLine): boolean {
  const hasRange = Boolean(String(line.analogMvMax ?? "").trim() && String(line.tankCapacityMax ?? "").trim());
  return hasRange || hasUsableFuelCalibration(line.fuelCalibration);
}

function FuelCalibrationEditor({
  line,
  onChange
}: {
  line: DeviceBindingLine;
  onChange: (next: FuelCalibrationDraftPoint[]) => void;
}) {
  const draft = draftFuelCalibration(line.fuelCalibration);
  const readyPoints = normalizeFuelCalibration(draft);
  const width = 220;
  const height = 72;
  const pad = 8;
  const maxMv = Math.max(...readyPoints.map((point) => point.mv), 1);
  const maxL = Math.max(...readyPoints.map((point) => point.liters), 1);
  const path = readyPoints
    .map((point, index) => {
      const x = pad + ((point.mv / maxMv) * (width - pad * 2));
      const y = height - pad - ((point.liters / maxL) * (height - pad * 2));
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="bindings-fuel-calibration">
      <div className="bindings-fuel-calibration-title">Calibration chart</div>
      <p className="bindings-fuel-calibration-help">
        Optional. Map sender mV to true litres for irregular tanks. Two or more points replace the straight-line
        formula.
      </p>
      <div className="bindings-fuel-calibration-rows">
        {draft.map((point, index) => (
          <div key={`cal-${index}`} className="bindings-fuel-calibration-row">
            <label className="bindings-fuel-mv-range-field">
              <span>mV</span>
              <input
                className="bindings-input"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 200"
                value={point.mv}
                onChange={(event) =>
                  onChange(draft.map((item, itemIndex) => (itemIndex === index ? { ...item, mv: event.target.value } : item)))
                }
              />
            </label>
            <label className="bindings-fuel-mv-range-field">
              <span>Litres</span>
              <input
                className="bindings-input"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 40"
                value={point.liters}
                onChange={(event) =>
                  onChange(
                    draft.map((item, itemIndex) => (itemIndex === index ? { ...item, liters: event.target.value } : item))
                  )
                }
              />
            </label>
            <button
              type="button"
              className="btn ghost bindings-fuel-calibration-remove"
              disabled={draft.length <= 2}
              onClick={() => onChange(draft.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="bindings-fuel-calibration-actions">
        <button type="button" className="btn ghost" onClick={() => onChange([...draft, emptyFuelCalibrationDraftPoint()])}>
          Add point
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() =>
            onChange(
              seedFuelCalibrationFromRange({
                analogMvMin: line.analogMvMin,
                analogMvMax: line.analogMvMax,
                tankCapacityMin: line.tankCapacityMin,
                tankCapacityMax: line.tankCapacityMax
              })
            )
          }
        >
          Fill from min/max
        </button>
      </div>
      {hasUsableFuelCalibration(readyPoints) ? (
        <svg className="bindings-fuel-calibration-svg" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <rect x="0" y="0" width={width} height={height} fill="#f8fafc" rx="8" />
          <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" />
        </svg>
      ) : null}
    </div>
  );
}

function FuelPreview({ line, site }: { line: DeviceBindingLine; site?: string }) {
  const [assets, setAssets] = useState<Array<{ key: string; label: string; imei: string; name: string; site: string }>>([]);
  const [assetKey, setAssetKey] = useState("");
  const [assetFilter, setAssetFilter] = useState("");
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; mv?: number; liters?: number } | null>(null);
  const analogInput = String(line.analogInput ?? line.parameter ?? "").trim();
  const scopeSite = String(site ?? readActiveSiteName() ?? "").trim();

  useEffect(() => {
    let mounted = true;
    setLoadingAssets(true);
    void getAssetsFromApi<Record<string, unknown>>()
      .then((list) => {
        if (!mounted) return;
        setAssets(
          list
            .map((asset) => {
              const imei = String(asset.imei ?? "").trim();
              const name = String(asset.name ?? asset.assetName ?? asset.registration ?? "").trim();
              const key = String(asset.id ?? imei ?? name).trim();
              const assetSite = String(asset.site ?? "").trim();
              return { key, imei, name, site: assetSite, label: [name, imei].filter(Boolean).join(" · ") || key };
            })
            .filter((asset) => asset.key && (asset.imei || asset.name))
        );
      })
      .catch(() => {
        if (mounted) setAssets([]);
      })
      .finally(() => {
        if (mounted) setLoadingAssets(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const siteAssets = useMemo(() => {
    const target = scopeSite.toLowerCase();
    if (!target) return [];
    return assets.filter((asset) => asset.site.toLowerCase() === target);
  }, [assets, scopeSite]);

  const visibleAssets = useMemo(() => {
    const query = assetFilter.trim().toLowerCase();
    if (!query) return siteAssets;
    return siteAssets.filter((asset) => asset.label.toLowerCase().includes(query));
  }, [assetFilter, siteAssets]);

  useEffect(() => {
    if (assetKey && !siteAssets.some((asset) => asset.key === assetKey)) setAssetKey("");
  }, [assetKey, siteAssets]);

  const runPreview = async () => {
    const asset = siteAssets.find((item) => item.key === assetKey);
    if (!asset) {
      setResult({ ok: false, message: "Select an asset first." });
      return;
    }
    setPreviewing(true);
    try {
      const live = await getTraccarLive();
      const row = live.find(
        (item) =>
          (asset.imei && String(item.imei ?? "").trim() === asset.imei) ||
          (asset.name && String(item.name ?? "").trim().toLowerCase() === asset.name.toLowerCase())
      );
      const attributes = (row?.position?.attributes ?? null) as Record<string, unknown> | null;
      if (!row || !attributes) {
        setResult({ ok: false, message: "No live data found for this asset." });
        return;
      }
      const mv = readFuelInputMillivolts(attributes, analogInput);
      if (typeof mv !== "number" || !Number.isFinite(mv)) {
        setResult({ ok: false, message: `${analogInput} is not reporting on this asset. Try another input line.` });
        return;
      }
      let liters = hasUsableFuelCalibration(line.fuelCalibration)
        ? interpolateFuelLitersFromCalibration(mv, line.fuelCalibration)
        : undefined;
      if (liters === undefined) {
        const mvMin = Number(line.analogMvMin ?? 0) || 0;
        const mvMax = Number(line.analogMvMax);
        const lMin = Number(line.tankCapacityMin ?? 0) || 0;
        const lMax = Number(line.tankCapacityMax);
        if (Number.isFinite(mvMax) && Number.isFinite(lMax) && mvMax > mvMin) {
          const ratio = Math.min(Math.max((mv - mvMin) / (mvMax - mvMin), 0), 1);
          liters = lMin + ratio * (lMax - lMin);
        }
      }
      if (liters === undefined) {
        setResult({ ok: false, mv, message: "Add a calibration chart or min/max range to calculate litres." });
        return;
      }
      setResult({ ok: true, mv, liters, message: "" });
    } catch {
      setResult({ ok: false, message: "Could not load live data for this asset." });
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="bindings-fuel-calibration">
      <div className="bindings-fuel-calibration-title">Preview fuel</div>
      <p className="bindings-fuel-calibration-help">
        Pick an asset and preview its current tank level using this input line and calibration. Adjust and preview
        again until the litres look right, then save.
      </p>
      <div className="bindings-fuel-calibration-actions">
        <input
          type="search"
          className="bindings-input"
          placeholder="Filter assets…"
          value={assetFilter}
          onChange={(event) => setAssetFilter(event.target.value)}
          disabled={!siteAssets.length}
        />
        <select className="bindings-input" value={assetKey} onChange={(event) => setAssetKey(event.target.value)}>
          <option value="">
            {loadingAssets
              ? "Loading assets…"
              : !scopeSite
                ? "Select a site first"
                : siteAssets.length
                  ? `Select asset… (${visibleAssets.length})`
                  : "No assets under this site"}
          </option>
          {visibleAssets.map((asset) => (
            <option key={asset.key} value={asset.key}>
              {asset.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn ghost" disabled={!assetKey || previewing} onClick={() => void runPreview()}>
          {previewing ? "Previewing…" : "Preview"}
        </button>
      </div>
      {result ? (
        <div className="bindings-fuel-calibration-help" role="status">
          {typeof result.mv === "number" ? <div>{analogInput}: {Math.round(result.mv)} mV</div> : null}
          {result.ok && typeof result.liters === "number" ? (
            <strong>Fuel in tank: {result.liters.toFixed(1)} L</strong>
          ) : (
            <span>{result.message}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FuelAnalogRangeFields({
  line,
  onPatch
}: {
  line: DeviceBindingLine;
  onPatch: (patch: Partial<DeviceBindingLine>) => void;
}) {
  const isRpm = isRpmAnalogDeviceLine(line.id);
  const complete = !isRpm && isFuelCalibrationComplete(line);
  const [expanded, setExpanded] = useState(!hasUsableFuelCalibration(line.fuelCalibration));
  const minRangeLabel = isRpm ? "Min RPM" : "Min capacity (L)";
  const maxRangeLabel = isRpm ? "Max RPM" : "Max capacity (L)";
  const minRangePlaceholder = isRpm ? "e.g. 0" : "e.g. 0";
  const maxRangePlaceholder = isRpm ? "e.g. 6000" : "e.g. 400";
  const minRangeValue = isRpm ? line.rpmMin ?? "" : line.tankCapacityMin ?? "";
  const maxRangeValue = isRpm ? line.rpmMax ?? "" : line.tankCapacityMax ?? "";

  return (
    <div className={`bindings-fuel-mv-range${isRpm ? "" : " bindings-fuel-mv-range--collapsible"}`}>
      {!isRpm ? (
        <button
          type="button"
          className="bindings-fuel-calibration-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className="bindings-fuel-calibration-toggle-copy">
            <span className="bindings-fuel-calibration-title">Calibration</span>
            <span className="bindings-fuel-calibration-help">{formatFuelCalibrationSummary(line)}</span>
          </span>
          <span className="bindings-fuel-calibration-toggle-action">{expanded ? "Hide" : complete ? "Edit" : "Show"}</span>
        </button>
      ) : null}
      {isRpm || expanded ? (
        <>
          <label className="bindings-fuel-mv-range-field">
            <span>Min mV</span>
            <input
              className="bindings-input"
              type="number"
              min={0}
              placeholder="e.g. 200"
              value={line.analogMvMin ?? ""}
              onChange={(event) => onPatch({ analogMvMin: event.target.value })}
            />
          </label>
          <label className="bindings-fuel-mv-range-field">
            <span>Max mV</span>
            <input
              className="bindings-input"
              type="number"
              min={0}
              placeholder="e.g. 28000"
              value={line.analogMvMax ?? ""}
              onChange={(event) => onPatch({ analogMvMax: event.target.value })}
            />
          </label>
          <label className="bindings-fuel-mv-range-field">
            <span>{minRangeLabel}</span>
            <input
              className="bindings-input"
              type="number"
              min={0}
              step="any"
              placeholder={minRangePlaceholder}
              value={minRangeValue}
              onChange={(event) =>
                onPatch(isRpm ? { rpmMin: event.target.value } : { tankCapacityMin: event.target.value })
              }
            />
          </label>
          <label className="bindings-fuel-mv-range-field">
            <span>{maxRangeLabel}</span>
            <input
              className="bindings-input"
              type="number"
              min={0}
              step="any"
              placeholder={maxRangePlaceholder}
              value={maxRangeValue}
              onChange={(event) =>
                onPatch(isRpm ? { rpmMax: event.target.value } : { tankCapacityMax: event.target.value })
              }
            />
          </label>
          {isRpm ? (
            <label className="bindings-fuel-mv-range-field">
              <span>Scale</span>
              <input
                className="bindings-input"
                type="number"
                min={0}
                step="any"
                placeholder="e.g. 1"
                value={line.rpmScale ?? ""}
                onChange={(event) => onPatch({ rpmScale: event.target.value })}
              />
            </label>
          ) : (
            <>
              <FuelCalibrationEditor line={line} onChange={(fuelCalibration) => onPatch({ fuelCalibration })} />
              <FuelPreview line={line} />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function resolveDeviceBindingLines(lines?: DeviceBindingLine[]): DeviceBindingLine[] {
  const source = (lines?.length ? lines : defaultDeviceLines).filter(
    (line) => !REMOVED_DEVICE_LINE_IDS.has(String(line.id ?? "").toLowerCase())
  );
  const merged = [...source];
  const ids = new Set(merged.map((line) => String(line.id ?? "").toLowerCase()));
  for (const fallback of defaultDeviceLines) {
    const id = String(fallback.id ?? "").toLowerCase();
    if (!id || REMOVED_DEVICE_LINE_IDS.has(id) || ids.has(id)) continue;
    const fallbackIndex = defaultDeviceLines.findIndex((line) => String(line.id ?? "").toLowerCase() === id);
    let insertAt = merged.length;
    for (let i = fallbackIndex - 1; i >= 0; i -= 1) {
      const prevId = String(defaultDeviceLines[i]?.id ?? "").toLowerCase();
      const existingIndex = merged.findIndex((line) => String(line.id ?? "").toLowerCase() === prevId);
      if (existingIndex >= 0) {
        insertAt = existingIndex + 1;
        break;
      }
    }
    if (insertAt === merged.length) {
      for (let i = fallbackIndex + 1; i < defaultDeviceLines.length; i += 1) {
        const nextId = String(defaultDeviceLines[i]?.id ?? "").toLowerCase();
        const existingIndex = merged.findIndex((line) => String(line.id ?? "").toLowerCase() === nextId);
        if (existingIndex >= 0) {
          insertAt = existingIndex;
          break;
        }
      }
    }
    merged.splice(insertAt, 0, fallback);
    ids.add(id);
  }
  return merged.map((line) => withHarnessWire(line));
}

export default function Bindings() {
  const location = useLocation();
  const bindingsNavState = (location.state as {
    section?: string;
    bindingId?: string;
    bindingName?: string;
  } | null) ?? null;
  const bindingsNavHandledRef = useRef(false);
  const [activeSection, setActiveSection] = useState(bindingSections[0]);
  const [filterText, setFilterText] = useState("");
  const defaultSettings: DeviceReportingSettings = {
    enabled: true,
    apn: "",
    apnUsername: "",
    apnPassword: "",
    apnAuth: "AUTO",
    serverDomain: envServerDomain || "162.35.186.103",
    serverPort: defaultServerPort,
    protocol: "AUTO",
    tls: "AUTO"
  };
  const [deviceSettings, setDeviceSettings] = useState<DeviceReportingSettings>(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState<DeviceReportingSettings>(defaultSettings);
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [advancedWidth, setAdvancedWidth] = useState<number | null>(null);
  const [advancedResizing, setAdvancedResizing] = useState(false);
  const [advancedResizeEdge, setAdvancedResizeEdge] = useState<"left" | "right">("left");
  const [advancedRight, setAdvancedRight] = useState<number | null>(null);
  const [advancedLeft, setAdvancedLeft] = useState<number | null>(null);
  const advancedModalRef = useRef<HTMLDivElement | null>(null);
  const [mobileDeviceTypeOptions, setMobileDeviceTypeOptions] = useState<string[]>([]);
  const [firmwareVersionOptions, setFirmwareVersionOptions] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    const loadLibraryOptions = async () => {
      const [mobile, firmware] = await Promise.all([
        loadMobileDeviceLibraryOptions(),
        loadFirmwareLibraryOptions()
      ]);
      if (!mounted) return;
      setMobileDeviceTypeOptions(mobile);
      setFirmwareVersionOptions(firmware);
    };
    void loadLibraryOptions();
    const onOrgChange = () => void loadLibraryOptions();
    window.addEventListener("vivi:orgchange", onOrgChange);
    return () => {
      mounted = false;
      window.removeEventListener("vivi:orgchange", onOrgChange);
    };
  }, []);

  const [traccarBluetoothDevices, setTraccarBluetoothDevices] = useState<TraccarBluetoothDeviceOption[]>([]);
  const [bluetoothDevicesLoading, setBluetoothDevicesLoading] = useState(false);

  const loadTraccarBluetoothDeviceOptions = async () => {
    if (!isDatabaseTenant(String(getTenantId() ?? "").trim())) return;
    setBluetoothDevicesLoading(true);
    try {
      const list = await getTraccarBluetoothDevices();
      setTraccarBluetoothDevices(list);
    } catch {
      setTraccarBluetoothDevices([]);
    } finally {
      setBluetoothDevicesLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection !== "Devices Bindings") return;
    void loadTraccarBluetoothDeviceOptions();
    const onOrgChange = () => void loadTraccarBluetoothDeviceOptions();
    window.addEventListener("vivi:orgchange", onOrgChange);
    return () => window.removeEventListener("vivi:orgchange", onOrgChange);
  }, [activeSection]);

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      const settings = await getDeviceReportingSettings<DeviceReportingSettings>();
      if (!mounted) return;
      if (settings) {
        setDeviceSettings(settings);
        setSettingsDraft(settings);
      }
    };
    void loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!advancedResizing) return;
    const handleMove = (event: MouseEvent) => {
      const minWidth = 860;
      const maxWidth = Math.min(1280, window.innerWidth - 40);

      const nextRaw =
        advancedResizeEdge === "left"
          ? advancedRight === null
            ? null
            : advancedRight - event.clientX
          : advancedLeft === null
            ? null
            : event.clientX - advancedLeft;

      if (nextRaw === null) return;
      const next = Math.min(maxWidth, Math.max(minWidth, Math.round(nextRaw)));
      setAdvancedWidth(next);
    };
    const handleUp = () => {
      setAdvancedResizing(false);
    };
    const previousSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      document.body.style.userSelect = previousSelect;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [advancedResizing, advancedRight, advancedLeft, advancedResizeEdge]);

  const [notificationRows, setNotificationRows] = useState<BindingRow[]>(() => peekCachedBindings<BindingRow>("notifications"));
  const [notificationLibraryCatalog, setNotificationLibraryCatalog] = useState<NotificationRow[]>([]);
  const [activeSiteFilter, setActiveSiteFilter] = useState<string>(() => readActiveSiteName());
  const [locationRows, setLocationRows] = useState<BindingRow[]>(() => peekCachedBindings<BindingRow>("locations"));
  const [deviceRows, setDeviceRows] = useState<DeviceBindingRow[]>(() =>
    peekCachedBindings<DeviceBindingRow>("devices").map((row) => ({
      ...row,
      id: row.id ?? `${String(row.name ?? "device").toLowerCase().replace(/\s+/g, "-")}`,
      lines: resolveDeviceBindingLines(row.lines),
      advancedConfirmed: row.advancedConfirmed ?? false,
      advancedSettings: row.advancedSettings ?? createDefaultAdvancedSettings()
    }))
  );
  const [bindingModalOpen, setBindingModalOpen] = useState(false);
  const [sampleBindingBusy, setSampleBindingBusy] = useState(false);
  const [bindingNameMissing, setBindingNameMissing] = useState(false);
  const [bindingDraft, setBindingDraft] = useState<BindingDraft>({ name: "", deviceType: "", monitoredEvents: [] });
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [notificationEventFilter, setNotificationEventFilter] = useState("");
  const [menuOpenName, setMenuOpenName] = useState<string | null>(null);
  const [deviceMenuOpenId, setDeviceMenuOpenId] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingDraftName, setEditingDraftName] = useState<string>("");
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const [activeAdvancedId, setActiveAdvancedId] = useState<string | null>(null);
  const [canModalOpen, setCanModalOpen] = useState(false);
  const [canTarget, setCanTarget] = useState<{ rowIndex: number; lineId: string } | null>(null);
  const [canSelection, setCanSelection] = useState("");
  const [canLibraryOptions, setCanLibraryOptions] = useState<string[]>(defaultCanLibrary);
  const [freqModalOpen, setFreqModalOpen] = useState(false);
  const [freqTarget, setFreqTarget] = useState<{ rowIndex: number; lineId: string } | null>(null);
  const [freqSelection, setFreqSelection] = useState("");
  const [speedModalOpen, setSpeedModalOpen] = useState(false);
  const [speedTarget, setSpeedTarget] = useState<{ rowIndex: number; lineId: string } | null>(null);
  const [speedSelection, setSpeedSelection] = useState("");
  const [gpsModalOpen, setGpsModalOpen] = useState(false);
  const [gpsTarget, setGpsTarget] = useState<{ rowIndex: number; lineId: string } | null>(null);
  const [gpsSelection, setGpsSelection] = useState("");
  const [gpsExternalAntenna, setGpsExternalAntenna] = useState(false);
  const [gsmModalOpen, setGsmModalOpen] = useState(false);
  const [gsmTarget, setGsmTarget] = useState<{ rowIndex: number; lineId: string } | null>(null);
  const [gsmSelection, setGsmSelection] = useState("");
  const [gsmSettings, setGsmSettings] = useState<GsmSettings>(defaultGsmSettings);

  useEffect(() => {
    if (!advancedModalOpen) return;
    const preferred = Math.min(1320, Math.max(980, window.innerWidth - 60));
    setAdvancedWidth(preferred);
  }, [advancedModalOpen]);

  const signalBindingsChanged = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("vivi:bindingschange"));
  };

  const syncNotificationBindingWithTraccar = async (row: NotificationBindingRecord) => {
    const result = await syncNotificationBindingToTraccar(row);
    if (!result.scopes) return;
    if (result.ok) return;
    showToast(
      result.errors[0] ?? `VIVI sync completed with ${result.failed} failure(s).`,
      "error"
    );
  };

  // Locations picker and per-location settings for Location Bindings
  const [allLocations, setAllLocations] = useState<{ id: string; name: string; site?: string; locationType?: string; speed?: string }[]>([]);
  const [locationsFilter, setLocationsFilter] = useState("");
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [currentEditingLocationBindingId, setCurrentEditingLocationBindingId] = useState<string | null>(null);
  const [locationDraftsById, setLocationDraftsById] = useState<Record<string, LocationConfig[]>>({});
  const [locationSettingsModalOpen, setLocationSettingsModalOpen] = useState(false);
  const [locationSettingsTarget, setLocationSettingsTarget] = useState<{ bindingId: string; locationId: string } | null>(null);
  const [locationSettingsDraft, setLocationSettingsDraft] = useState<LocationSettings | null>(null);

  const frequencyOptions = [
    "Not connected",
    "Extra RPM Connection (Frequency)",
    "Revs (Frequency)",
    "RPM signal (Frequency)",
    "Speed sender (Frequency)"
  ];
  const immobiliserOptions = ["Starter Cut Active", "Starter Cut Inactive"];

  const speedOptions = ["Not connected", "GPS velocity as speed (Extended Device)"];
  const gpsOptions = ["GPS module (Extended Device)"];
  const gsmOptions = ["Not connected", "GSM module (Extended Device)"];
  const getLineDisplayName = (line: Pick<DeviceBindingLine, "id" | "line">) => {
    const raw = String(line?.line ?? "").trim();
    const upper = raw.toUpperCase();
    if (line?.id === "c1" || upper === "C1") return "CAN H";
    if (line?.id === "c2" || upper === "C2") return "CAN L";
    if (line?.id === "i1" || upper === "I1") return "Immobiliser";
    if (line?.id === "i2" || upper === "I2" || upper === "ALARM") return "IGN";
    return raw;
  };

  const rows = useMemo(() => {
    if (activeSection === "Location Bindings") return locationRows;
    if (activeSection === "Devices Bindings") return deviceRows;
    return notificationRows;
  }, [activeSection, deviceRows, notificationRows, locationRows]);

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return rows as any[];
    return (rows as any[]).filter((r) => String(r?.name ?? "").toLowerCase().includes(q));
  }, [rows, filterText]);

  const filteredDeviceRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const base = deviceRows.map((row, index) => ({ row, index }));
    if (!q) return base;
    return base.filter(({ row }) => {
      const hay = `${row?.name ?? ""} ${row?.deviceType ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [deviceRows, filterText]);

  const availableNotificationLibraryCatalog = useMemo(
    () =>
      notificationLibraryCatalog.filter(
        (row) => normalizeNotificationAvailability(row.availability) === "Available"
      ),
    [notificationLibraryCatalog]
  );

  const filteredNotificationEvents = useMemo(() => {
    const q = notificationEventFilter.trim().toLowerCase();
    const source = availableNotificationLibraryCatalog;
    if (!q) return source;
    return source.filter((n) => {
      const hay = `${String(n?.description ?? "")} ${String(n?.type ?? "")} ${String(n?.availability ?? "")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [notificationEventFilter, availableNotificationLibraryCatalog]);

  const isSystemDefaultBinding = (row: any) => {
    const name = String(row?.name ?? "").trim();
    return name === "Default Notifications" || name === "Default Locations" || name === "Default Devices";
  };

  const visibleRows = useMemo(() => {
    return (rows as any[]).filter((r) => {
      if (isSystemDefaultBinding(r)) return false;
      if (activeSection === "Notifications Bindings") {
        if (!isUserNotificationBinding(r)) return false;
      }
      if (activeSection === "Location Bindings") {
        if (!isUserLocationBinding(r)) return false;
      }
      return true;
    });
  }, [rows, activeSection]);

  const scopeFilteredRows = useMemo(
    () => filterRecordsForActiveSelection(visibleRows),
    [visibleRows]
  );

  const visibleFilteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const base = scopeFilteredRows;
    if (!q) return base;
    return base.filter((r) => String(r?.name ?? "").toLowerCase().includes(q));
  }, [scopeFilteredRows, filterText]);

  const visibleFilteredDeviceRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const base = filterRecordsForActiveSelection(
      deviceRows.filter((row: any) => {
        if (isSystemDefaultBinding(row)) return false;
        const t = String((row as any)?.type ?? "").trim().toLowerCase();
        // VPS API includes `type` on rows; Worker does not. If present, enforce it.
        if (t && t !== "devices") return false;
        // Defensive: device bindings should have lines or a deviceType.
        const hasLines = Array.isArray((row as any)?.lines);
        const hasDeviceType = typeof (row as any)?.deviceType === "string";
        return hasLines || hasDeviceType;
      })
    ).map((row, index) => ({ row, index }));
    if (!q) return base;
    return base.filter(({ row }) => {
      const hay = `${row?.name ?? ""} ${row?.deviceType ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [deviceRows, filterText]);

  const getBindingSortValue = useCallback(
    (row: BindingRow, key: string) => {
      if (key === "name") return row.name;
      if (key === "site") return String((row as any).site ?? "");
      if (key === "events") {
        return countMonitoredEventsInCatalog(
          availableNotificationLibraryCatalog,
          (row as any).monitoredEvents
        );
      }
      if (key === "locations") return Array.isArray((row as any).locationsConfig) ? (row as any).locationsConfig.length : 0;
      return "";
    },
    [availableNotificationLibraryCatalog]
  );

  const getDeviceBindingSortValue = useCallback(
    (entry: { row: DeviceBindingRow; index: number }, key: string) => {
      if (key === "name") return entry.row.name;
      if (key === "deviceType") return entry.row.deviceType ?? "";
      if (key === "assets") return entry.row.assetCount ?? 0;
      if (key === "groups") return entry.row.groupCount ?? 0;
      return "";
    },
    []
  );

  const bindingListSort = useColumnSort({
    rows: visibleFilteredRows,
    getValue: getBindingSortValue
  });
  const deviceBindingSort = useColumnSort({
    rows: visibleFilteredDeviceRows,
    getValue: getDeviceBindingSortValue
  });

  const freqLineLabel = useMemo(() => {
    if (!freqTarget) return "Frequency";
    const row = deviceRows[freqTarget.rowIndex];
    const line = resolveDeviceBindingLines(row?.lines).find((item) => item.id === freqTarget.lineId);
    return line ? getLineDisplayName(line) : "Frequency";
  }, [deviceRows, freqTarget]);

  const closeAllBindingEditors = () => {
    setEditingDeviceId(null);
    setEditingName(null);
    setEditingDraftName("");
    setMenuOpenName(null);
    setDeviceMenuOpenId(null);
    setBindingModalOpen(false);
    setNotificationsModalOpen(false);
    setLocationPickerOpen(false);
    setCurrentEditingLocationBindingId(null);
    setLocationSettingsModalOpen(false);
    setLocationSettingsTarget(null);
    setLocationSettingsDraft(null);
  };

  const gpsHeader = useMemo(() => {
    if (!gpsTarget) return "GPS";
    const row = deviceRows[gpsTarget.rowIndex];
    const line = resolveDeviceBindingLines(row?.lines).find((item) => item.id === gpsTarget.lineId);
    const connection = gpsSelection || line?.connection || "GPS module (Extended Device)";
    return `GPS - ${connection}`;
  }, [deviceRows, gpsSelection, gpsTarget]);

  useEffect(() => {
    let mounted = true;
    void loadNotificationLibraryItems().then((items) => {
      if (mounted) setNotificationLibraryCatalog(items);
    });
    const reloadCatalog = () => {
      void loadNotificationLibraryItems().then((items) => {
        if (mounted) setNotificationLibraryCatalog(items);
      });
    };
    window.addEventListener(NOTIFICATION_LIBRARY_UPDATED_EVENT, reloadCatalog);
    window.addEventListener("vivi:bindingschange", reloadCatalog);
    return () => {
      mounted = false;
      window.removeEventListener(NOTIFICATION_LIBRARY_UPDATED_EVENT, reloadCatalog);
      window.removeEventListener("vivi:bindingschange", reloadCatalog);
    };
  }, []);

  useEffect(() => {
    const syncSite = () => setActiveSiteFilter(readActiveSiteName());
    syncSite();
    window.addEventListener("vivi:orgchange", syncSite);
    window.addEventListener("vivi:contextchange", syncSite);
    window.addEventListener("storage", syncSite);
    return () => {
      window.removeEventListener("vivi:orgchange", syncSite);
      window.removeEventListener("vivi:contextchange", syncSite);
      window.removeEventListener("storage", syncSite);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const slug = (value: string) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    const applyBindingRows = (
      notifications: BindingRow[],
      locations: BindingRow[],
      devices: DeviceBindingRow[]
    ) => {
      setNotificationRows(
        notifications.map((row: any) => ({
          ...row,
          id: String(row?.id ?? "").trim() || `notifications-${slug(String(row?.name ?? "binding"))}`
        }))
      );
      setLocationRows(
        (locations ?? [])
          .filter((row) => isUserLocationBinding(row))
          .map((row: any) => ({
            ...row,
            id: String(row?.id ?? "").trim() || `locations-${slug(String(row?.name ?? "binding"))}`
          }))
      );
      setDeviceRows(
        devices.map((row) => ({
          ...row,
          id: row.id ?? `devices-${slug(String(row.name ?? "binding"))}`,
          lines: resolveDeviceBindingLines(row.lines),
          advancedConfirmed: row.advancedConfirmed ?? false,
          advancedSettings: row.advancedSettings ?? createDefaultAdvancedSettings()
        }))
      );
    };

    const loadBindings = async () => {
      applyBindingRows(
        peekCachedBindings<BindingRow>("notifications"),
        peekCachedBindings<BindingRow>("locations"),
        peekCachedBindings<DeviceBindingRow>("devices")
      );
      const [notifications, locations, devices] = await Promise.all([
        getBindings<BindingRow>("notifications"),
        getBindings<BindingRow>("locations"),
        getBindings<DeviceBindingRow>("devices")
      ]);
      if (!mounted) return;
      applyBindingRows(notifications, locations, devices);
      const enriched = await enrichDeviceRowsWithAttachmentCounts(
        devices.map((row) => ({
          ...row,
          id: row.id ?? `devices-${slug(String(row.name ?? "binding"))}`,
          lines: resolveDeviceBindingLines(row.lines),
          advancedConfirmed: row.advancedConfirmed ?? false,
          advancedSettings: row.advancedSettings ?? createDefaultAdvancedSettings(),
          assetCount: row.assetCount ?? 0,
          groupCount: row.groupCount ?? 0,
          site: String(row.site ?? "").trim()
        }))
      );
      if (!mounted) return;
      setDeviceRows(enriched);
    };

    void (async () => {
      if (isDatabaseTenant(String(getTenantId() ?? "").trim())) {
        await repairNotificationBindingsWithoutSite();
        await repairDeviceBindingsWithoutSite();
        await ensureSiteNotificationLibraryFuelEventsActive();
        await cleanupLocationLibraryTemplateBindings();
      }
      await loadBindings();
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const applyOptions = (names: string[]) => {
      const unique = Array.from(new Set(names.map((name) => String(name ?? "").trim()).filter(Boolean)));
      if (unique.length && !cancelled) setCanLibraryOptions(unique);
    };

    // Prefer CAN library KV (Libraries → CAN library); fall back to legacy localStorage.
    void loadFromApi<{ items?: Array<{ name?: string }> } | Array<{ name?: string }> | string[]>(
      "libraries:generic:can-library"
    )
      .then((stored) => {
        if (cancelled || !stored) return;
        const items = Array.isArray(stored)
          ? stored
          : Array.isArray((stored as { items?: unknown[] }).items)
            ? (stored as { items: unknown[] }).items
            : [];
        const names = items.map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") return String((item as { name?: string }).name ?? "");
          return "";
        });
        if (names.some(Boolean)) applyOptions([...defaultCanLibrary, ...names]);
      })
      .catch(() => {
        // keep defaults
      });

    const legacy =
      window.localStorage.getItem("vivi.canLibrary") ?? window.localStorage.getItem("vivi.library.can");
    if (!legacy) return () => { cancelled = true; };
    try {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        applyOptions([...defaultCanLibrary, ...parsed.map((item) => String(item).trim())]);
      }
    } catch {
      // ignore
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const reloadBindings = () => {
      const cachedNotifications = peekCachedBindings<BindingRow>("notifications");
      const cachedLocations = peekCachedBindings<BindingRow>("locations");
      const cachedDevices = peekCachedBindings<DeviceBindingRow>("devices");
      if (cachedNotifications.length) setNotificationRows(cachedNotifications);
      if (cachedLocations.length) setLocationRows(cachedLocations.filter((row) => isUserLocationBinding(row)));
      if (cachedDevices.length) {
        setDeviceRows(
          cachedDevices.map((row) => ({
            ...row,
            id: row.id ?? `${String(row.name ?? "binding").toLowerCase().replace(/\s+/g, "-")}`,
            lines: resolveDeviceBindingLines(row.lines),
            advancedConfirmed: row.advancedConfirmed ?? false,
            advancedSettings: row.advancedSettings ?? createDefaultAdvancedSettings(),
            site: String(row.site ?? "").trim()
          }))
        );
      }
      void (async () => {
        const [notifications, locations, devices] = await Promise.all([
          getBindings<BindingRow>("notifications"),
          getBindings<BindingRow>("locations"),
          getBindings<DeviceBindingRow>("devices")
        ]);
        setNotificationRows(notifications);
        setLocationRows(locations.filter((row) => isUserLocationBinding(row)));
        const mappedDevices = devices.map((row) => ({
          ...row,
          id: row.id ?? `${row.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
          lines: resolveDeviceBindingLines(row.lines),
          advancedConfirmed: row.advancedConfirmed ?? false,
          advancedSettings: row.advancedSettings ?? createDefaultAdvancedSettings(),
          assetCount: row.assetCount ?? 0,
          groupCount: row.groupCount ?? 0,
          site: String(row.site ?? "").trim()
        }));
        setDeviceRows(mappedDevices);
        const enriched = await enrichDeviceRowsWithAttachmentCounts(mappedDevices);
        setDeviceRows(enriched);
      })();
    };
    return subscribeScopeChange(reloadBindings);
  }, []);

  const updateDeviceRow = (index: number, updater: (row: DeviceBindingRow) => DeviceBindingRow) => {
    setDeviceRows((current) => current.map((row, i) => (i === index ? updater(row) : row)));
  };

  const enrichDeviceRowsWithAttachmentCounts = async (
    rows: DeviceBindingRow[]
  ): Promise<DeviceBindingRow[]> => {
    try {
      return await enrichDeviceBindingsWithAttachmentCounts(rows);
    } catch {
      return rows;
    }
  };

  const updateAdvancedSettings = (
    index: number,
    updater: (settings: AdvancedSettings) => AdvancedSettings
  ) => {
    updateDeviceRow(index, (current) => ({
      ...current,
      advancedSettings: updater(current.advancedSettings ?? createDefaultAdvancedSettings())
    }));
  };

  const openFrequencyModal = (rowIndex: number, lineId: string, currentConnection?: string) => {
    setFreqTarget({ rowIndex, lineId });
    if (lineId === "i1") {
      const current = String(currentConnection ?? "").trim();
      setFreqSelection(
        current === "Starter Cut Active" || current === "Starter Cut Inactive"
          ? current
          : "Starter Cut Inactive"
      );
    } else {
      setFreqSelection(currentConnection ?? "Not connected");
    }
    setFreqModalOpen(true);
  };

  const openSpeedModal = (rowIndex: number, lineId: string, currentConnection?: string) => {
    setSpeedTarget({ rowIndex, lineId });
    setSpeedSelection(currentConnection ?? "Not connected");
    setSpeedModalOpen(true);
  };

  const openGpsModal = (rowIndex: number, lineId: string, currentConnection?: string) => {
    const row = deviceRows[rowIndex];
    const line = resolveDeviceBindingLines(row?.lines).find((item) => item.id === lineId);
    setGpsTarget({ rowIndex, lineId });
    setGpsSelection(currentConnection ?? line?.connection ?? "GPS module (Extended Device)");
    setGpsExternalAntenna(Boolean(line?.externalAntenna));
    setGpsModalOpen(true);
  };

  const openGsmModal = (rowIndex: number, lineId: string, currentConnection?: string) => {
    const row = deviceRows[rowIndex];
    const line = resolveDeviceBindingLines(row?.lines).find((item) => item.id === lineId);
    setGsmTarget({ rowIndex, lineId });
    setGsmSelection(currentConnection ?? line?.connection ?? "GSM module (Extended Device)");
    setGsmSettings(row?.gsmSettings ?? defaultGsmSettings);
    setGsmModalOpen(true);
  };

  const persistDeviceBinding = async (row: DeviceBindingRow): Promise<boolean> => {
    const locationMonitoringEnabled = Boolean(
      (row.advancedSettings ?? createDefaultAdvancedSettings()).locationSpeedMonitoring
    );
    const bindingSite = String(row.site ?? readActiveSiteName()).trim();
    const hasLocationBinding = locationRows.some((binding) => {
      const locations = Array.isArray(binding.locationsConfig) ? binding.locationsConfig : [];
      return bindingMatchesSite(binding, bindingSite) && locations.length > 0;
    });
    if (locationMonitoringEnabled && !hasLocationBinding) {
      showToast(
        "Location Monitoring requires a saved Location Binding with at least one location for this site.",
        "error"
      );
      return false;
    }
    const payload = anchorBindingToActiveSite({
      ...row,
      lines: resolveDeviceBindingLines(row.lines),
      advancedSettings: row.advancedSettings ?? createDefaultAdvancedSettings()
    });
    if (!payload) {
      showToast("Select a site in the organisation ribbon before saving a device binding.", "error");
      return false;
    }
    const result = await saveBindingDetailed("devices", payload);
    if (!result.stored) {
      showToast(result.error || "Save failed", "error");
      return false;
    }
    return true;
  };

  const saveDeviceRow = async (rowIndex: number) => {
    const row = deviceRows[rowIndex];
    if (!row) return;
    const id = row.id ?? `${row.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    const draft: DeviceBindingRow = {
      ...row,
      id,
      lines: resolveDeviceBindingLines(row.lines),
      advancedSettings: row.advancedSettings ?? createDefaultAdvancedSettings(),
      advancedConfirmed: Boolean(row.advancedConfirmed)
    };
    const locationMonitoringEnabled = Boolean(draft.advancedSettings?.locationSpeedMonitoring);
    const bindingSite = String(draft.site ?? readActiveSiteName()).trim();
    const hasLocationBinding = locationRows.some((binding) => {
      const locations = Array.isArray(binding.locationsConfig) ? binding.locationsConfig : [];
      return bindingMatchesSite(binding, bindingSite) && locations.length > 0;
    });
    if (locationMonitoringEnabled && !hasLocationBinding) {
      showToast(
        "Cannot save: Location Monitoring requires a saved Location Binding with at least one location for this site.",
        "error"
      );
      return;
    }
    const payload = anchorBindingToActiveSite(draft);
    if (!payload) {
      showToast("Select a site in the organisation ribbon before saving a device binding.", "error");
      return;
    }
    await runOptimisticUpdate({
      getSnapshot: () => deviceRows,
      apply: () => setDeviceRows((current) => current.map((r, idx) => (idx === rowIndex ? payload : r))),
      rollback: (snapshot) => setDeviceRows(snapshot),
      request: () => saveBindingDetailed("devices", payload),
      errorMessage: (result) =>
        typeof result === "object" && result.error ? String(result.error) : "Save failed",
      onSuccess: () => {
        signalBindingsChanged();
        void (async () => {
          const fuelSync = await syncFuelCapacityComputedAttributeFromDeviceBinding(payload);
          const resync = await resyncConfigurationGroupsForBinding("devices", {
            id: String(payload.id),
            name: String(payload.name),
            site: String(payload.site)
          });
          const withCounts: DeviceBindingRow = {
            ...payload,
            assetCount: resync.assetCount,
            groupCount: resync.groupCount
          };
          if (
            withCounts.assetCount !== (payload.assetCount ?? 0) ||
            withCounts.groupCount !== (payload.groupCount ?? 0)
          ) {
            await saveBindingDetailed("devices", withCounts);
            setDeviceRows((current) => current.map((r, idx) => (idx === rowIndex ? withCounts : r)));
          }
          if (!fuelSync.ok && fuelSync.error) {
            showToast(`Fuel attribute sync failed: ${fuelSync.error}`, "error");
          }
        })();
      }
    });
  };

  const saveSettings = async () => {
    beginSaving();
    setSettingsStatus("saving");
    const stored = await saveDeviceReportingSettings(settingsDraft);
    if (stored) {
      setDeviceSettings(settingsDraft);
      setSettingsStatus("idle");
      endSavingDone();
    } else {
      setSettingsStatus("error");
      endSavingError("Save failed");
      window.setTimeout(() => setSettingsStatus("idle"), 1400);
    }
  };

  const cancelSettings = () => {
    setSettingsDraft(deviceSettings);
    setSettingsStatus("idle");
  };

  const openBindingModal = () => {
    const site = readActiveSiteName();
    if (
      (activeSection === "Notifications Bindings" || activeSection === "Devices Bindings") &&
      !site
    ) {
      showToast("Select a site in the organisation ribbon before creating a binding.", "error");
      return;
    }
    setBindingDraft({ id: "", name: "", deviceType: "", monitoredEvents: [], site });
    setBindingNameMissing(false);
    setBindingModalOpen(true);
  };

  const handleCreateSampleNotificationBinding = async () => {
    if (sampleBindingBusy) return;
    setSampleBindingBusy(true);
    beginSaving();
    try {
      const result = await createSampleNotificationBinding();
      if (!result.ok) {
        endSavingError(result.message);
        return;
      }
      endSavingDone();

      const site = readActiveSiteName();
      const sampleRow: BindingRow = {
        id: SAMPLE_NOTIFICATION_BINDING_ID,
        name: SAMPLE_NOTIFICATION_BINDING_NAME,
        site,
        assetCount: 0,
        groupCount: 0,
        monitoredEvents: [...SAMPLE_MONITORED_EVENTS]
      };
      setNotificationRows((current) => {
        const idx = current.findIndex((row) => String(row.id ?? "") === SAMPLE_NOTIFICATION_BINDING_ID);
        if (idx >= 0) {
          return current.map((row, i) => (i === idx ? { ...row, ...sampleRow } : row));
        }
        return [sampleRow, ...current];
      });
      signalBindingsChanged();
      void loadNotificationLibraryItems().then((items) => setNotificationLibraryCatalog(items));
    } finally {
      setSampleBindingBusy(false);
    }
  };

  // Load all locations when needed
  const loadAllLocations = async () => {
    try {
      const items = await loadLocationGeofences();
      setAllLocations(items.map((item) => ({
        id: String(item.gpsIotGeoId ?? item.traccarId ?? item.id),
        name: item.name,
        site: item.site,
        locationType: item.type,
        speed: String(item.speed ?? "").trim()
      })));
    } catch {
      // ignore
    }
  };

  const openLocationPickerFor = (row: BindingRow) => {
    const id = (row as any).id ?? `${row.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    setCurrentEditingLocationBindingId(id);
    // initialize draft for this binding
    setLocationDraftsById((cur) => ({ ...(cur || {}), [id]: (row as any).locationsConfig ? JSON.parse(JSON.stringify((row as any).locationsConfig)) : [] }));
    void loadAllLocations();
    setLocationPickerOpen(true);
  };

  const toggleLocationForBinding = (bindingId: string, location: { id: string; name?: string; speed?: string }) => {
    setLocationDraftsById((cur) => {
      const list = (cur[bindingId] ?? []).slice();
      const idx = list.findIndex((l) => l.id === location.id);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        const librarySpeed = Number(location.speed);
        const overSpeedKph = Number.isFinite(librarySpeed) && librarySpeed > 0 ? librarySpeed : 20;
        list.push({ id: location.id, name: location.name, settings: {
          overSpeedKph,
          bufferKph: 0,
          warningDelay: { minutes: 0, seconds: 0 },
          recordingDelay: { minutes: 0, seconds: 5 },
          activeMessage: { priority: 'Normal', basedOnDuration: false, duration: { minutes: 0, seconds: 0 }, basedOnSpeed: false, speedKph: overSpeedKph }
        } });
      }
      return { ...(cur ?? {}), [bindingId]: list };
    });
  };

  const openLocationSettings = (bindingId: string, locationId: string) => {
    const row = locationRows.find((item) => String((item as any).id ?? "") === bindingId);
    const configs =
      locationDraftsById[bindingId]
      ?? (Array.isArray((row as any)?.locationsConfig) ? (row as any).locationsConfig : []);
    const cfg = configs.find((c) => c.id === locationId);
    setLocationSettingsDraft(cfg?.settings ?? {
      overSpeedKph: 20,
      bufferKph: 0,
      warningDelay: { minutes: 0, seconds: 0 },
      recordingDelay: { minutes: 0, seconds: 5 },
      activeMessage: { priority: 'Normal', basedOnDuration: false, duration: { minutes: 0, seconds: 0 }, basedOnSpeed: false, speedKph: 20 }
    });
    setLocationSettingsTarget({ bindingId, locationId });
    setLocationSettingsModalOpen(true);
  };

  const persistLocationBindingConfig = async (bindingId: string, configs: LocationConfig[]) => {
    const row = locationRows.find((item) => String((item as any).id ?? "") === bindingId);
    if (!row) {
      showToast("Location binding not found.", "error");
      return false;
    }
    const site = String(row.site ?? readActiveSiteName()).trim();
    if (!site) {
      showToast("Select a site before saving location settings.", "error");
      return false;
    }
    const payload: BindingRow = {
      id: bindingId,
      name: row.name,
      site,
      assetCount: row.assetCount ?? 0,
      groupCount: row.groupCount ?? 0,
      locationsConfig: configs
    };
    const result = await saveBindingDetailed("locations", payload);
    if (!result.stored) {
      showToast(result.error || "Unable to save location settings.", "error");
      return false;
    }
    const savedId = String(result.id ?? bindingId).trim();
    const saved = { ...payload, id: savedId };
    setLocationRows((current) => upsertBindingRowInList(current, saved, savedId));
    setLocationDraftsById((current) => ({ ...current, [savedId]: configs }));
    void resyncConfigurationGroupsForBinding("locations", {
      id: savedId,
      name: saved.name,
      site: saved.site
    });
    signalBindingsChanged();
    return true;
  };

  const saveLocationSettings = () => {
    if (!locationSettingsTarget || !locationSettingsDraft) return;
    const bindingId = locationSettingsTarget.bindingId;
    const list = (locationDraftsById[bindingId]
      ?? locationRows.find((item) => String((item as any).id ?? "") === bindingId)?.locationsConfig
      ?? []).slice();
    const idx = list.findIndex((l) => l.id === locationSettingsTarget.locationId);
    if (idx < 0) {
      showToast("Selected location is no longer part of this binding.", "error");
      return;
    }
    list[idx] = { ...list[idx], settings: locationSettingsDraft };
    setLocationDraftsById((cur) => ({ ...(cur ?? {}), [bindingId]: list }));
    setLocationSettingsModalOpen(false);
    setLocationSettingsTarget(null);
    setLocationSettingsDraft(null);
    void (async () => {
      beginSaving();
      const saved = await persistLocationBindingConfig(bindingId, list);
      if (saved) endSavingDone();
      else endSavingError("Unable to save location settings.");
    })();
  };

  const upsertBindingRowInList = <T extends { id?: string }>(
    current: T[],
    saved: T,
    savedId: string
  ): T[] => {
    const idx = current.findIndex((row) => String(row.id ?? "") === savedId);
    if (idx >= 0) {
      return current.map((row, i) => (i === idx ? { ...row, ...saved, id: savedId } : row));
    }
    return [saved, ...current];
  };

  const saveBindingDraft = async () => {
    const name = bindingDraft.name.trim();
    if (!name) {
      setBindingNameMissing(true);
      showToast("Fill in the required fields marked in red.", "error");
      return;
    }
    setBindingNameMissing(false);
    const draftId =
      String(bindingDraft.id ?? "").trim() || `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    const bindingError = (result: { error?: string } | boolean) =>
      typeof result === "object" && result.error ? String(result.error) : "Save failed";

    if (activeSection === "Devices Bindings") {
      const draft: DeviceBindingRow = {
        id: draftId,
        name,
        deviceType: bindingDraft.deviceType?.trim() || "",
        lines: resolveDeviceBindingLines(),
        advancedSettings: createDefaultAdvancedSettings(),
        advancedConfirmed: false,
        assetCount: 0,
        groupCount: 0,
        site: String(bindingDraft.site ?? readActiveSiteName()).trim()
      };
      const payload = anchorBindingToActiveSite(draft);
      if (!payload) {
        showToast("Select a site in the organisation ribbon before saving a device binding.", "error");
        return;
      }
      const saved = { ...payload, id: draftId };
      setBindingModalOpen(false);
      await runOptimisticUpdate({
        getSnapshot: () => deviceRows,
        apply: () => setDeviceRows((current) => upsertBindingRowInList(current, saved, draftId)),
        rollback: (snapshot) => setDeviceRows(snapshot),
        request: () => saveBindingDetailed("devices", payload),
        errorMessage: bindingError,
        onSuccess: () => signalBindingsChanged()
      });
      return;
    }

    if (activeSection === "Location Bindings") {
      const site = String(bindingDraft.site ?? readActiveSiteName()).trim();
      if (!site) {
        showToast("Select a site in the organisation ribbon before saving a location binding.", "error");
        return;
      }
      const payload: BindingRow = { id: draftId, name, assetCount: 0, groupCount: 0, site };
      const drafts = locationDraftsById[draftId];
      if (drafts && Array.isArray(drafts)) payload.locationsConfig = drafts;
      setBindingModalOpen(false);
      await runOptimisticUpdate({
        getSnapshot: () => locationRows,
        apply: () => setLocationRows((current) => upsertBindingRowInList(current, payload, draftId)),
        rollback: (snapshot) => setLocationRows(snapshot),
        request: () => saveBindingDetailed("locations", payload),
        errorMessage: bindingError,
        onSuccess: () => {
          signalBindingsChanged();
          void resyncConfigurationGroupsForBinding("locations", {
            id: draftId,
            name: payload.name,
            site: payload.site
          });
        }
      });
      return;
    }

    const site = String(bindingDraft.site ?? readActiveSiteName()).trim();
    if (!site) {
      showToast("Select a site in the ribbon before saving a notification binding.", "error");
      return;
    }
    const payload: any = { id: draftId, name, assetCount: 0, groupCount: 0, site };
    if (bindingDraft.monitoredEvents && Array.isArray(bindingDraft.monitoredEvents)) {
      payload.monitoredEvents = normalizeMonitoredEvents(
        availableNotificationLibraryCatalog,
        bindingDraft.monitoredEvents
      );
    }
    setBindingModalOpen(false);
    await runOptimisticUpdate({
      getSnapshot: () => notificationRows,
      apply: () => setNotificationRows((current) => upsertBindingRowInList(current, payload, draftId)),
      rollback: (snapshot) => setNotificationRows(snapshot),
      request: () => saveBindingDetailed("notifications", payload),
      errorMessage: bindingError,
      onSuccess: () => {
        signalBindingsChanged();
        void syncNotificationBindingWithTraccar({
          id: draftId,
          name,
          site,
          monitoredEvents: payload.monitoredEvents ?? []
        });
        void resyncConfigurationGroupsForBinding("notifications", { id: draftId, name, site });
      }
    });
  };

  const handleSaveNonDeviceRow = async (
    type: "notifications" | "locations",
    row: BindingRow,
    newName?: string
  ) => {
    const name = (newName ?? row.name).trim();
    if (!name) {
      showToast("Fill in the required fields marked in red.", "error");
      return;
    }
    const id = String((row as any).id ?? "").trim();
    const payload: any = { id, name, assetCount: row.assetCount ?? 0, groupCount: row.groupCount ?? 0 };
    if (type === "locations") {
      payload.site = String((row as any).site ?? readActiveSiteName()).trim();
      if (!payload.site) {
        showToast("This location binding must be anchored to a site.", "error");
        return;
      }
      const drafts = locationDraftsById[id];
      if (drafts && Array.isArray(drafts)) payload.locationsConfig = drafts;
    }
    if (type === "notifications") {
      payload.monitoredEvents = normalizeMonitoredEvents(
        availableNotificationLibraryCatalog,
        (row as any).monitoredEvents ?? []
      );
      payload.site = String((row as any).site ?? readActiveSiteName()).trim();
      if (!payload.site) {
        showToast("This binding must be anchored to a site. Select a site in the ribbon and save again.", "error");
        return;
      }
    }
    const savedId = String(payload.id ?? id).trim();
    const saved = { ...payload, id: savedId };
    setEditingName(null);
    setEditingDraftName("");
    setMenuOpenName(null);
    const setRows = type === "notifications" ? setNotificationRows : setLocationRows;
    const snapshot = type === "notifications" ? notificationRows : locationRows;
    await runOptimisticUpdate({
      getSnapshot: () => snapshot,
      apply: () => setRows((current) => upsertBindingRowInList(current, saved as BindingRow, savedId)),
      rollback: (prev) => setRows(prev),
      request: () => saveBindingDetailed(type, saved),
      errorMessage: (result) =>
        typeof result === "object" && result.error ? String(result.error) : "Save failed",
      onSuccess: () => {
        signalBindingsChanged();
        if (type === "notifications") {
          void syncNotificationBindingWithTraccar({
            id: savedId,
            name: saved.name,
            site: saved.site,
            monitoredEvents: saved.monitoredEvents ?? []
          });
        }
        void resyncConfigurationGroupsForBinding(type, {
          id: savedId,
          name: saved.name,
          site: saved.site
        });
      }
    });
  };

  const handleDuplicateRow = async (type: "notifications" | "locations", row: BindingRow) => {
    const copy: BindingRow = {
      id: `${row.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      name: `${row.name} (copy)`,
      assetCount: row.assetCount ?? 0,
      groupCount: row.groupCount ?? 0,
      site: String((row as any).site ?? readActiveSiteName()).trim()
    };
    const setRows = type === "notifications" ? setNotificationRows : setLocationRows;
    const snapshot = type === "notifications" ? notificationRows : locationRows;
    setMenuOpenName(null);
    await runOptimisticUpdate({
      getSnapshot: () => snapshot,
      apply: () => setRows((current) => [copy, ...current]),
      rollback: (prev) => setRows(prev),
      request: () => saveBinding(type, copy),
      errorMessage: "Unable to duplicate binding.",
      onSuccess: () => signalBindingsChanged()
    });
  };

  const handleClearAllBindings = async () => {
    const tenantId = String(getTenantId() ?? "").trim();
    if (!isDatabaseTenant(tenantId)) {
      showToast("Select a database in the organisation ribbon first.", "error");
      return;
    }
    if (!confirm("Delete all notification, location, and device bindings for this database?")) return;
    const result = await purgeAllBindingsForCurrentTenant();
    if (result.ok) {
      setNotificationRows([]);
      setLocationRows([]);
      setDeviceRows([]);
    } else {
      const [notifications, locations, devices] = await Promise.all([
        getBindings<BindingRow>("notifications"),
        getBindings<BindingRow>("locations"),
        getBindings<DeviceBindingRow>("devices")
      ]);
      setNotificationRows(notifications);
      setLocationRows(locations.filter((row) => isUserLocationBinding(row)));
      setDeviceRows(devices);
    }
    showToast(
      result.ok
        ? `Cleared ${result.deleted} binding(s) for this database.`
        : result.remaining > 0
          ? `Could not clear ${result.remaining} binding(s). Try again or delete individually.`
          : "Unable to clear bindings.",
      result.ok ? "success" : "error"
    );
    signalBindingsChanged();
  };

  const handleDeleteRow = (type: "notifications" | "locations", row: BindingRow) => {
    if (!confirm("Delete this binding?")) return;
    const id = String((row as any).id ?? "").trim();
    if (!id) {
      setMenuOpenName(null);
      return;
    }
    const setRows = type === "notifications" ? setNotificationRows : setLocationRows;
    const snapshot = type === "notifications" ? notificationRows : locationRows;
    setMenuOpenName(null);
    void runOptimisticUpdate({
      getSnapshot: () => snapshot,
      apply: () => setRows((current) => current.filter((r) => String((r as any).id ?? "") !== id && r !== row)),
      rollback: (prev) => setRows(prev),
      request: async () => {
        if (type === "notifications") await deleteNotificationBindingFromTraccar(id);
        return deleteBindingDetailed(type, id);
      },
      errorMessage: "Delete failed",
      successFeedback: false,
      onSuccess: () => {
        showToast("Deleted", "success");
        signalBindingsChanged();
      }
    });
  };

  const handleEditRow = (row: BindingRow) => {
    setEditingName(row.name);
    setEditingDraftName(row.name);
    setMenuOpenName(null);
  };

  const openDeviceBindingEditor = (row: DeviceBindingRow, indexHint?: number) => {
    const rowId = String(row?.id ?? "").trim() || String(indexHint ?? "");
    if (!rowId) return;
    setDeviceMenuOpenId(null);
    setEditingDeviceId((current) => (current === rowId ? null : rowId));
    window.setTimeout(() => {
      const el = document.getElementById("device-binding-editor");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const openBindingForEditing = (row: BindingRow | DeviceBindingRow, indexHint?: number) => {
    if (activeSection === "Devices Bindings") {
      openDeviceBindingEditor(row as DeviceBindingRow, indexHint);
      return;
    }
    if (activeSection === "Notifications Bindings") {
      setBindingDraft({
        id: String((row as any).id ?? "").trim(),
        name: row.name,
        monitoredEvents: normalizeMonitoredEvents(
          availableNotificationLibraryCatalog,
          ((row as any).monitoredEvents ?? []) as string[]
        ),
        site: String((row as any).site ?? readActiveSiteName()).trim()
      });
      setBindingModalOpen(true);
      setMenuOpenName(null);
      return;
    }
    if (activeSection === "Location Bindings") {
      openLocationPickerFor(row as BindingRow);
      setMenuOpenName(null);
      return;
    }
    handleEditRow(row as BindingRow);
  };

  useEffect(() => {
    // Allow a new navigation state (e.g. from Configuration Groups) to open a binding again.
    bindingsNavHandledRef.current = false;
  }, [location.key, bindingsNavState?.section, bindingsNavState?.bindingId, bindingsNavState?.bindingName]);

  useEffect(() => {
    if (bindingsNavHandledRef.current || !bindingsNavState?.section) return;
    if (!bindingSections.includes(bindingsNavState.section)) {
      bindingsNavHandledRef.current = true;
      return;
    }
    setActiveSection(bindingsNavState.section);
  }, [bindingsNavState]);

  useEffect(() => {
    if (bindingsNavHandledRef.current) return;
    const targetId = String(bindingsNavState?.bindingId ?? "").trim();
    const targetName = String(bindingsNavState?.bindingName ?? "").trim().toLowerCase();
    if (!targetId && !targetName) {
      if (bindingsNavState?.section) bindingsNavHandledRef.current = true;
      return;
    }

    if (activeSection === "Notifications Bindings") {
      const row = notificationRows.find((item) => {
        const id = String((item as any).id ?? "").trim();
        const name = String(item.name ?? "").trim().toLowerCase();
        return (targetId && id === targetId) || (targetName && name === targetName);
      });
      if (!row) return;
      openBindingForEditing(row);
      bindingsNavHandledRef.current = true;
      return;
    }

    if (activeSection === "Devices Bindings") {
      const row = deviceRows.find((item, index) => {
        const id = String((item as any).id ?? "").trim();
        const name = String(item.name ?? "").trim().toLowerCase();
        return (targetId && id === targetId) || (targetName && name === targetName) || (targetId && String(index) === targetId);
      });
      if (!row) return;
      openDeviceBindingEditor(row);
      bindingsNavHandledRef.current = true;
    }
  }, [activeSection, bindingsNavState, notificationRows, deviceRows]);

  // focus the edit input when editing starts
  useEffect(() => {
    if (editingName && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingName]);

  // close menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // if click is inside a bindings-action-menu or on the action button, ignore
      if (target.closest && (target.closest(".bindings-action-menu") || target.closest(".bindings-action-btn"))) return;
      setMenuOpenName(null);
      setDeviceMenuOpenId(null);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  const duplicateDeviceRow = async (row: DeviceBindingRow) => {
    const id = `${String(row.name ?? "device").toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    const copy: DeviceBindingRow = {
      ...JSON.parse(JSON.stringify(row ?? {})),
      id,
      name: `${row.name ?? "Unnamed"} (copy)`,
      assetCount: row.assetCount ?? 0,
      groupCount: row.groupCount ?? 0,
      lines: resolveDeviceBindingLines(row.lines),
      advancedSettings: row.advancedSettings ?? createDefaultAdvancedSettings(),
      advancedConfirmed: false
    };
    const payload = anchorBindingToActiveSite(copy);
    if (!payload) {
      showToast("Select a site in the organisation ribbon before saving a device binding.", "error");
      return;
    }
    setDeviceMenuOpenId(null);
    await runOptimisticUpdate({
      getSnapshot: () => deviceRows,
      apply: () => setDeviceRows((current) => [payload, ...current]),
      rollback: (snapshot) => setDeviceRows(snapshot),
      request: () => saveBindingDetailed("devices", payload),
      errorMessage: (result) =>
        typeof result === "object" && result.error ? String(result.error) : "Save failed"
    });
  };

  const deleteDeviceRow = async (row: DeviceBindingRow) => {
    if (!confirm("Delete this binding?")) return;
    const id = String((row as any)?.id ?? "").trim();
    if (!id) {
      showToast("Delete failed", "error");
      return;
    }
    setDeviceMenuOpenId(null);
    if (editingDeviceId === id) setEditingDeviceId(null);
    await runOptimisticUpdate({
      getSnapshot: () => deviceRows,
      apply: () => setDeviceRows((current) => current.filter((r) => String((r as any)?.id ?? "").trim() !== id)),
      rollback: (snapshot) => setDeviceRows(snapshot),
      request: () => deleteBindingDetailed("devices", id),
      errorMessage: "Delete failed",
      successFeedback: false,
      onSuccess: () => showToast("Deleted", "success")
    });
  };

  const deviceReportingSettings = (
    <section className="bindings-settings-card">
      <div className="bindings-settings-title">Device reporting settings</div>
      <div className="bindings-settings-grid">
        <div className="bindings-settings-group">
          <div className="bindings-settings-label">GPRS Context</div>
          <div className="bindings-toggle">
            <button
              type="button"
              className={settingsDraft.enabled ? "active" : ""}
              onClick={() => setSettingsDraft((current) => ({ ...current, enabled: true }))}
            >
              Enable
            </button>
            <button
              type="button"
              className={!settingsDraft.enabled ? "active" : ""}
              onClick={() => setSettingsDraft((current) => ({ ...current, enabled: false }))}
            >
              Disable
            </button>
          </div>
          <label className="bindings-field">
            APN
            <input
              className="bindings-input"
              value={settingsDraft.apn}
              onChange={(event) => setSettingsDraft((current) => ({ ...current, apn: event.target.value }))}
            />
          </label>
          <label className="bindings-field">
            APN Username
            <input
              className="bindings-input"
              value={settingsDraft.apnUsername}
              onChange={(event) => setSettingsDraft((current) => ({ ...current, apnUsername: event.target.value }))}
            />
          </label>
          <label className="bindings-field">
            APN Password
            <input
              className="bindings-input"
              type="password"
              value={settingsDraft.apnPassword}
              onChange={(event) => setSettingsDraft((current) => ({ ...current, apnPassword: event.target.value }))}
            />
          </label>
          <div className="bindings-settings-label">GPRS Authentication</div>
          <div className="bindings-toggle">
            <button
              type="button"
              className={settingsDraft.apnAuth === "AUTO" ? "active" : ""}
              onClick={() => setSettingsDraft((current) => ({ ...current, apnAuth: "AUTO" }))}
            >
              Auto
            </button>
            <button
              type="button"
              className={settingsDraft.apnAuth === "PAP" ? "active" : ""}
              onClick={() => setSettingsDraft((current) => ({ ...current, apnAuth: "PAP" }))}
            >
              PAP
            </button>
            <button
              type="button"
              className={settingsDraft.apnAuth === "CHAP" ? "active" : ""}
              onClick={() => setSettingsDraft((current) => ({ ...current, apnAuth: "CHAP" }))}
            >
              CHAP
            </button>
          </div>
        </div>

        <div className="bindings-settings-group">
          <div className="bindings-settings-label">Server Settings</div>
          <label className="bindings-field">
            Domain
            <input
              className="bindings-input"
              value={settingsDraft.serverDomain}
              onChange={(event) =>
                setSettingsDraft((current) => ({ ...current, serverDomain: event.target.value }))
              }
            />
          </label>
          <label className="bindings-field">
            Port
            <input
              className="bindings-input"
              type="number"
              min={1}
              max={65535}
              value={settingsDraft.serverPort}
              onChange={(event) =>
                setSettingsDraft((current) => ({
                  ...current,
                  serverPort: Number(event.target.value) || 0
                }))
              }
            />
          </label>
          <div className="bindings-settings-label">Protocol</div>
          <div className="bindings-toggle">
            <button
              type="button"
              className={settingsDraft.protocol === "AUTO" ? "active" : ""}
              onClick={() => setSettingsDraft((current) => ({ ...current, protocol: "AUTO" }))}
            >
              Auto
            </button>
            <button
              type="button"
              className={settingsDraft.protocol === "TCP" ? "active" : ""}
              onClick={() => setSettingsDraft((current) => ({ ...current, protocol: "TCP" }))}
            >
              TCP
            </button>
            <button
              type="button"
              className={settingsDraft.protocol === "UDP" ? "active" : ""}
              onClick={() => setSettingsDraft((current) => ({ ...current, protocol: "UDP" }))}
            >
              UDP
            </button>
          </div>
          <div className="bindings-settings-label">TLS Encryption</div>
          <div className="bindings-toggle">
            <button
              type="button"
              className={settingsDraft.tls === "AUTO" ? "active" : ""}
              onClick={() => setSettingsDraft((current) => ({ ...current, tls: "AUTO" }))}
            >
              Auto
            </button>
            <button
              type="button"
              className={settingsDraft.tls === "None" ? "active" : ""}
              onClick={() => setSettingsDraft((current) => ({ ...current, tls: "None" }))}
            >
              None
            </button>
            <button
              type="button"
              className={settingsDraft.tls === "TLS/DTLS" ? "active" : ""}
              onClick={() => setSettingsDraft((current) => ({ ...current, tls: "TLS/DTLS" }))}
            >
              TLS/DTLS
            </button>
          </div>
        </div>
      </div>
      <div className="bindings-settings-actions">
        <div className={`bindings-settings-status ${settingsStatus}`} aria-live="polite">
          {settingsStatus === "saving"
            ? "Saving…"
            : settingsStatus === "saved"
              ? "Saved"
              : settingsStatus === "error"
                ? "Save failed"
                : ""}
        </div>
        <div className="bindings-settings-buttons">
          <button type="button" className="bindings-ghost" onClick={cancelSettings}>
            Cancel
          </button>
          <button type="button" className="bindings-primary" onClick={saveSettings}>
            Save
          </button>
        </div>
      </div>
    </section>
  );

  return (
    <div className="page bindings-page">
      {!isDatabaseTenant(String(getTenantId() ?? "").trim()) ? (
        <div className="bindings-empty" style={{ marginBottom: 16 }}>
          Select a database in the organisation ribbon before managing bindings. Each database keeps its own bindings.
        </div>
      ) : null}
      <section className="bindings-card">
        <div className="bindings-layout">
          <aside className="bindings-sidebar">
            {bindingSections.map((section) => (
              <button
                key={section}
                type="button"
                className={`bindings-tab ${activeSection === section ? "active" : ""}`}
                onClick={() => setActiveSection(section)}
              >
                {section}
              </button>
            ))}
          </aside>

          <div className="bindings-panel">
            <div className="bindings-panel-header">
              <div className="bindings-panel-title">{activeSection}</div>
              <div className="bindings-header-actions">
                <button type="button" className="bindings-secondary" onClick={() => void handleClearAllBindings()}>
                  Clear all for this database
                </button>
                {activeSection === "Notifications Bindings" ? (
                  <button
                    type="button"
                    className="bindings-secondary"
                    disabled={sampleBindingBusy}
                    onClick={() => void handleCreateSampleNotificationBinding()}
                    title="Creates a demo binding (fuel + ignition) and syncs notifications/computed attributes"
                  >
                    {sampleBindingBusy ? "Creating sample…" : "Add sample"}
                  </button>
                ) : null}
                <input
                  className="bindings-search"
                  placeholder="Filter"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
                <button type="button" className="bindings-add-btn" aria-label="Add binding" onClick={openBindingModal}>
                  +
                </button>
              </div>
            </div>

            <div className="bindings-table">
              {activeSection === "Devices Bindings" ? (
                <div className="bindings-device-list">
                  <div className="bindings-summary-table" style={{ marginBottom: 14 }}>
                    <div
                      className="bindings-list-table-head"
                      style={{ gridTemplateColumns: DEVICE_BINDINGS_SUMMARY_GRID }}
                    >
                      <SortableColumnHeader className="bindings-col" label="Template name" {...deviceBindingSort.getHeaderProps("name")} />
                      <SortableColumnHeader className="bindings-col" label="Mobile device type" {...deviceBindingSort.getHeaderProps("deviceType")} />
                      <SortableColumnHeader className="bindings-col is-center" label="Assets" {...deviceBindingSort.getHeaderProps("assets")} />
                      <SortableColumnHeader className="bindings-col is-center" label="Groups" {...deviceBindingSort.getHeaderProps("groups")} />
                      <div className="bindings-col bindings-col-actions is-center" aria-hidden="true">
                        ⋮
                      </div>
                    </div>
                    {deviceBindingSort.sortedRows.length === 0 ? (
                      <div className="bindings-empty">
                        {!activeSiteFilter
                          ? "Select a site in the ribbon to view and manage device bindings for that site."
                          : `No device bindings for site "${activeSiteFilter}" yet. Use Add binding to create the first one for this site.`}
                      </div>
                    ) : null}
                    {deviceBindingSort.sortedRows.map(({ row, index }) => (
                      <div
                        key={`summary-${row.id ?? row.name}`}
                        className="bindings-list-row"
                        style={{ gridTemplateColumns: DEVICE_BINDINGS_SUMMARY_GRID }}
                      >
                        <div className="bindings-cell">
                          <button
                            type="button"
                            className="bindings-link-btn"
                            onClick={() => openDeviceBindingEditor(row, index)}
                          >
                            {row.name}
                          </button>
                        </div>
                        <div className="bindings-cell">{row.deviceType || ""}</div>
                        <div className="bindings-cell is-center">{row.assetCount ?? 0}</div>
                        <div className="bindings-cell is-center">{row.groupCount ?? 0}</div>
                        <div className="bindings-cell bindings-cell-actions">
                          <button
                            type="button"
                            className="bindings-action-btn"
                            aria-label="Actions"
                            onClick={() =>
                              setDeviceMenuOpenId((cur) => (cur === (row.id ?? String(index)) ? null : (row.id ?? String(index))))
                            }
                          >
                            …
                          </button>
                          <button
                            type="button"
                            className="bindings-close-btn"
                            onClick={closeAllBindingEditors}
                          >
                            Close
                          </button>
                          {deviceMenuOpenId === (row.id ?? String(index)) && (
                            <div className="bindings-action-menu">
                              <button
                                type="button"
                                onClick={() => {
                                  openDeviceBindingEditor(row, index);
                                }}
                              >
                                Edit
                              </button>
                              <button type="button" onClick={() => void deleteDeviceRow(row)}>
                                Delete
                              </button>
                              <button type="button" onClick={() => void duplicateDeviceRow(row)}>
                                Duplicate
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    if (!editingDeviceId) return null;
                    const rowIndex = deviceRows.findIndex(
                      (r) => String((r as any)?.id ?? "").trim() === String(editingDeviceId).trim()
                    );
                    if (rowIndex < 0) return null;
                    const row = deviceRows[rowIndex];
                    return (
                      <div key={row.id ?? row.name} id="device-binding-editor" className="bindings-device-card">
                        <div className="bindings-device-toolbar">
                          <div className="bindings-device-toolbar-fields">
                            <label className="bindings-field">
                              Template name
                              <input
                                className="bindings-input"
                                value={row.name}
                                onChange={(event) =>
                                  updateDeviceRow(rowIndex, (current) => ({ ...current, name: event.target.value }))
                                }
                              />
                            </label>
                            <label className="bindings-field">
                              Mobile device type
                              <select
                                className="bindings-input"
                                value={row.deviceType ?? ""}
                                onChange={(event) =>
                                  updateDeviceRow(rowIndex, (current) => ({
                                    ...current,
                                    deviceType: event.target.value,
                                    advancedConfirmed: false
                                  }))
                                }
                              >
                                <option value="">Select device type</option>
                                {Array.from(
                                  new Set(
                                    [
                                      ...mobileDeviceTypeOptions,
                                      String(row.deviceType ?? "").trim()
                                    ].filter(Boolean)
                                  )
                                )
                                  .sort((a, b) => a.localeCompare(b))
                                  .map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <div className="bindings-device-site-chip" title="Active site for this binding">
                              <span className="bindings-device-site-label">Site</span>
                              <strong>
                                {String(row.site ?? "").trim() || "Select a site"}
                              </strong>
                            </div>
                          </div>
                          <div className="bindings-device-toolbar-actions">
                            <div className="bindings-device-stat" title="Assets that received this binding successfully">
                              <span className="bindings-device-stat-label">Assets</span>
                              <strong className="bindings-device-stat-value">{row.assetCount ?? 0}</strong>
                            </div>
                            <div className="bindings-device-stat" title="Configuration groups using this binding">
                              <span className="bindings-device-stat-label">Groups</span>
                              <strong className="bindings-device-stat-value">{row.groupCount ?? 0}</strong>
                            </div>
                            <button type="button" className="bindings-secondary" onClick={closeAllBindingEditors}>
                              Close
                            </button>
                            <button type="button" className="bindings-primary bindings-device-save" onClick={() => saveDeviceRow(rowIndex)}>
                              Save binding
                            </button>
                          </div>
                        </div>
                        {!String(row.site ?? "").trim() ? (
                          <p className="bindings-site-hint bindings-device-site-warn">
                            Select a site in the organisation ribbon before saving — device bindings are anchored per site.
                          </p>
                        ) : null}
                        <div className="bindings-device-table">
                          <div className="bindings-device-row bindings-device-head">
                            <div>Wire</div>
                            <div>Line</div>
                            <div>Tacho</div>
                            <div>Connection</div>
                            <div>Parameter / analogue</div>
                          </div>
                          {resolveDeviceBindingLines(row.lines).map((line) => {
                            const moduleLine = MODULE_LINE_ICONS.has(String(line.id ?? "").toLowerCase());
                            return (
                            <div key={line.id} className="bindings-device-row">
                              <div
                                className={moduleLine ? "bindings-wire bindings-module-line" : "bindings-wire"}
                                title={moduleLine ? undefined : harnessWireForLine(line.id)?.note}
                                style={moduleLine ? { gridColumn: "1 / 3" } : undefined}
                              >
                                {moduleLine ? (
                                  <DeviceModuleIcon id={String(line.id ?? "").toLowerCase()} />
                                ) : (
                                  <span
                                    className="bindings-wire-dot"
                                    style={{
                                      background: line.color ?? "#94a3b8",
                                      borderColor:
                                        line.wire === "White" || line.wire === "Black"
                                          ? "rgba(15, 23, 42, 0.45)"
                                          : undefined
                                    }}
                                  />
                                )}
                                {moduleLine ? getLineDisplayName(line) : line.wire || ""}
                              </div>
                              {moduleLine ? null : <div>{getLineDisplayName(line)}</div>}
                              <div>{line.tacho || ""}</div>
                              <div>
                                {line.id === "c1" || line.id === "c2" ? (
                                  <select
                                    className="bindings-input"
                                    value={line.canEnabled ? "Yes" : "No"}
                                    onChange={(event) =>
                                      updateDeviceRow(rowIndex, (current) => {
                                        const enable = event.target.value === "Yes";
                                        const nextLines = resolveDeviceBindingLines(current.lines).map((item) =>
                                          item.id === line.id
                                            ? {
                                                ...item,
                                                canEnabled: enable,
                                                canProtocol: enable ? item.canProtocol ?? "" : "",
                                                connection: enable ? "Yes" : "No"
                                              }
                                            : item
                                        );
                                        if (enable) {
                                          setCanTarget({ rowIndex, lineId: line.id });
                                          const existing = nextLines.find((item) => item.id === line.id);
                                          setCanSelection(existing?.canProtocol ?? "");
                                          setCanModalOpen(true);
                                        }
                                        return { ...current, lines: nextLines };
                                      })
                                    }
                                  >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                  </select>
                                ) : (
                                  <div className="bindings-toggle-group">
                                    <button
                                      type="button"
                                      className={line.connected ? "" : "active"}
                                      onClick={() =>
                                        updateDeviceRow(rowIndex, (current) => ({
                                          ...current,
                                          lines: resolveDeviceBindingLines(current.lines).map((item) =>
                                            item.id === line.id
                                              ? {
                                                  ...item,
                                                  connected: false,
                                                  connection: "Not connected",
                                                  parameter: "",
                                                  ...(isAnalogSensorConfigLine(item.id) ? analogSensorClearPatch(item.id) : {}),
                                                  ...(isBluetoothDeviceLine(item.id)
                                                    ? {
                                                        bluetoothTraccarDeviceId: "",
                                                        bluetoothTraccarDeviceName: "",
                                                        parameter: ""
                                                      }
                                                    : {})
                                                }
                                              : item
                                          )
                                        }))
                                      }
                                    >
                                      No
                                    </button>
                                    <button
                                      type="button"
                                      className={line.connected ? "active" : ""}
                                      onClick={() =>
                                        (() => {
                                          if (line.id === "f1i3" || line.id === "f2i4" || line.id === "i1" || line.id === "i2") {
                                            openFrequencyModal(rowIndex, line.id, line.connection);
                                          }
                                          if (line.id === "speed") {
                                            openSpeedModal(rowIndex, line.id, line.connection);
                                          }
                                          if (line.id === "gps") {
                                            openGpsModal(rowIndex, line.id, line.connection);
                                          }
                                          if (line.id === "gsm") {
                                            openGsmModal(rowIndex, line.id, line.connection);
                                          }
                                          if (isBluetoothDeviceLine(line.id) && !traccarBluetoothDevices.length) {
                                            void loadTraccarBluetoothDeviceOptions();
                                          }
                                          updateDeviceRow(rowIndex, (current) => ({
                                            ...current,
                                            lines: resolveDeviceBindingLines(current.lines).map((item) =>
                                              item.id === line.id
                                                ? {
                                                    ...item,
                                                    connected: true,
                                                    connection: item.defaultConnection ?? "Connected"
                                                  }
                                                : item
                                            )
                                          }));
                                        })()
                                      }
                                    >
                                      Yes
                                    </button>
                                  </div>
                                )}
                                {(line.id === "c1" || line.id === "c2") && line.canEnabled && line.canProtocol && (
                                  <div className="bindings-can-protocol">{line.canProtocol}</div>
                                )}
                                {line.id !== "c1" &&
                                  line.id !== "c2" &&
                                  line.connected &&
                                  !(isBluetoothDeviceLine(line.id) && line.bluetoothTraccarDeviceName) && (
                                    <div className="bindings-can-protocol">{line.connection}</div>
                                  )}
                                {isBluetoothDeviceLine(line.id) && line.connected && line.bluetoothTraccarDeviceName && (
                                  <div className="bindings-can-protocol">{line.bluetoothTraccarDeviceName}</div>
                                )}
                              </div>
                              <div className="bindings-fuel-analog-cell">
                                {isAnalogSensorConfigLine(line.id) && line.connected ? (
                                  <>
                                    <select
                                      className="bindings-input"
                                      value={line.analogInput ?? line.parameter ?? ""}
                                      onChange={(event) =>
                                        updateDeviceRow(rowIndex, (current) => ({
                                          ...current,
                                          lines: resolveDeviceBindingLines(current.lines).map((item) =>
                                            item.id === line.id
                                              ? {
                                                  ...item,
                                                  analogInput: event.target.value,
                                                  parameter: event.target.value
                                                }
                                              : item
                                          )
                                        }))
                                      }
                                    >
                                      <option value="">Analogue input…</option>
                                      {teltonikaAnalogInputNames.map((name) => (
                                        <option key={`${line.id}-analog-${name}`} value={name}>
                                          {name} (mV)
                                        </option>
                                      ))}
                                    </select>
                                    {(line.analogInput ?? line.parameter) ? (
                                      <FuelAnalogRangeFields
                                        line={line}
                                        onPatch={(patch) =>
                                          updateDeviceRow(rowIndex, (current) => ({
                                            ...current,
                                            lines: resolveDeviceBindingLines(current.lines).map((item) =>
                                              item.id === line.id ? { ...item, ...patch } : item
                                            )
                                          }))
                                        }
                                      />
                                    ) : null}
                                  </>
                                ) : isBluetoothDeviceLine(line.id) && line.connected ? (
                                  <select
                                    className="bindings-input"
                                    value={line.bluetoothTraccarDeviceId ?? ""}
                                    onChange={(event) => {
                                      const deviceId = event.target.value;
                                      const device = traccarBluetoothDevices.find((item) => item.id === deviceId);
                                      updateDeviceRow(rowIndex, (current) => ({
                                        ...current,
                                        lines: resolveDeviceBindingLines(current.lines).map((item) =>
                                          item.id === line.id
                                            ? {
                                                ...item,
                                                bluetoothTraccarDeviceId: deviceId,
                                                bluetoothTraccarDeviceName: device?.name ?? "",
                                                parameter: device?.uniqueId ?? device?.name ?? "",
                                                connection: device
                                                  ? `Bluetooth: ${device.name}`
                                                  : item.defaultConnection ?? "Connected"
                                              }
                                            : item
                                        )
                                      }));
                                    }}
                                  >
                                    <option value="">
                                      {bluetoothDevicesLoading
                                        ? "Loading Bluetooth devices…"
                                        : traccarBluetoothDevices.length
                                          ? "Select Bluetooth device…"
                                          : "No Bluetooth devices in VIVI"}
                                    </option>
                                    {traccarBluetoothDevices.map((device) => (
                                      <option key={`bt-traccar-${device.id}`} value={device.id}>
                                        {device.name}
                                        {device.uniqueId ? ` (${device.uniqueId})` : ""}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  line.parameter || ""
                                )}
                              </div>
                            </div>
                            );
                          })}
                        </div>
                        <div className="bindings-device-footer">
                          <button
                            type="button"
                            className="bindings-secondary"
                            onClick={() => {
                              setActiveAdvancedId(row.id ?? null);
                              setAdvancedModalOpen(true);
                            }}
                          >
                            Advanced Mobile Device Settings
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="bindings-list-table-wrap">
                  <div className="bindings-list-table-scroll">
                    <div className="bindings-list-table-inner">
                      <div
                        className="bindings-list-table-head"
                        style={{
                          gridTemplateColumns:
                            activeSection === "Notifications Bindings"
                              ? NOTIFICATION_BINDINGS_GRID
                              : LOCATION_BINDINGS_GRID
                        }}
                      >
                        <SortableColumnHeader className="bindings-col" label="Binding Name" {...bindingListSort.getHeaderProps("name")} />
                        {activeSection === "Notifications Bindings" ? (
                          <SortableColumnHeader className="bindings-col is-center" label="Site" {...bindingListSort.getHeaderProps("site")} />
                        ) : null}
                        <SortableColumnHeader
                          className="bindings-col is-center"
                          label={activeSection === "Notifications Bindings" ? "Events" : "Locations"}
                          {...bindingListSort.getHeaderProps(
                            activeSection === "Notifications Bindings" ? "events" : "locations"
                          )}
                        />
                        <div className="bindings-col bindings-col-actions is-center" aria-hidden="true">
                          ⋯
                        </div>
                      </div>
                      <div className="bindings-list-table-body">
                        {!activeSiteFilter ? (
                          <div className="bindings-empty">
                            Select a site in the ribbon to view and manage {activeSection.toLowerCase()} for that site.
                          </div>
                        ) : null}
                        {bindingListSort.sortedRows.length === 0 && activeSiteFilter ? (
                          <div className="bindings-empty">
                            {activeSection === "Notifications Bindings"
                              ? `No notification bindings for site "${activeSiteFilter}" yet. Use Add binding, then Select events from the library.`
                              : `No ${activeSection.toLowerCase()} for site "${activeSiteFilter}" yet. Use Add binding to create the first one for this site.`}
                          </div>
                        ) : null}
                        {bindingListSort.sortedRows.map((row) => (
                          <div
                            key={row.name}
                            className="bindings-list-row"
                            style={{
                              gridTemplateColumns:
                                activeSection === "Notifications Bindings"
                                  ? NOTIFICATION_BINDINGS_GRID
                                  : LOCATION_BINDINGS_GRID
                            }}
                          >
                            <div className="bindings-cell bindings-cell-name">
                              {editingName === row.name ? (
                                <input
                                  className="bindings-input"
                                  ref={editInputRef}
                                  value={editingDraftName}
                                  onChange={(e) => setEditingDraftName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      void handleSaveNonDeviceRow(
                                        activeSection === "Notifications Bindings" ? "notifications" : "locations",
                                        row,
                                        editingDraftName
                                      );
                                    }
                                    if (e.key === "Escape") {
                                      setEditingName(null);
                                      setEditingDraftName("");
                                    }
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="bindings-link-btn"
                                  onClick={() => openBindingForEditing(row)}
                                >
                                  {row.name}
                                </button>
                              )}
                            </div>
                            {activeSection === "Notifications Bindings" ? (
                              <div className="bindings-cell is-center">
                                {String((row as any).site ?? "").trim() || "—"}
                              </div>
                            ) : null}
                            <div className="bindings-cell is-center">
                              {activeSection === "Notifications Bindings"
                                ? countMonitoredEventsInCatalog(
                                    availableNotificationLibraryCatalog,
                                    (row as any).monitoredEvents
                                  )
                                : ((row as any).locationsConfig?.length ?? 0)}
                            </div>
                            <div className="bindings-cell bindings-cell-actions">
                              <button
                                type="button"
                                className="bindings-action-btn"
                                aria-label="Actions"
                                onClick={() => setMenuOpenName((cur) => (cur === row.name ? null : row.name))}
                              >
                                ⋯
                              </button>
                              <button type="button" className="bindings-close-btn" onClick={closeAllBindingEditors}>
                                Close
                              </button>
                              {menuOpenName === row.name && (
                                <div className="bindings-action-menu">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMenuOpenName(null);
                                      openBindingForEditing(row);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSaveNonDeviceRow(
                                        activeSection === "Notifications Bindings" ? "notifications" : "locations",
                                        row,
                                        editingName === row.name ? editingDraftName : undefined
                                      )
                                    }
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDuplicateRow(
                                        activeSection === "Notifications Bindings" ? "notifications" : "locations",
                                        row
                                      )
                                    }
                                  >
                                    Duplicate
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteRow(
                                        activeSection === "Notifications Bindings" ? "notifications" : "locations",
                                        row
                                      )
                                    }
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {bindingModalOpen && (
        <div className="bindings-modal" role="dialog" aria-modal="true">
          <div className="bindings-modal-card">
            <div className="bindings-modal-header">
              <div>
                {bindingDraft.id ? "Edit" : "Add"} {activeSection.replace(" Bindings", "")} binding
              </div>
              <button type="button" className="bindings-modal-close" onClick={() => setBindingModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="bindings-modal-body">
              <label>
                Name <span aria-hidden="true">*</span>
                <input
                  className={`bindings-input${bindingNameMissing ? ` ${REQUIRED_MISSING_CLASS}` : ""}`}
                  value={bindingDraft.name}
                  onChange={(event) => {
                    setBindingNameMissing(false);
                    setBindingDraft((current) => ({ ...current, name: event.target.value }));
                  }}
                />
              </label>
              {activeSection === "Notifications Bindings" && (
                <div style={{ marginTop: 12 }}>
                  <label>
                    Site
                    <input
                      className="bindings-input"
                      value={bindingDraft.site ?? ""}
                      readOnly
                      style={{ marginTop: 4 }}
                    />
                  </label>
                  <button
                    type="button"
                    className="bindings-ghost"
                    style={{ marginTop: 10 }}
                    onClick={() => {
                      setNotificationEventFilter("");
                      setNotificationsModalOpen(true);
                    }}
                  >
                    Select events from library
                  </button>
                  <div style={{ marginTop: 8, color: "#374151" }}>
                    Monitored:{" "}
                    {countMonitoredEventsInCatalog(
                      availableNotificationLibraryCatalog,
                      bindingDraft.monitoredEvents
                    )}{" "}
                    / {availableNotificationLibraryCatalog.length} available library events
                  </div>
                </div>
              )}
            </div>
            <div className="bindings-modal-actions">
              <button type="button" className="bindings-ghost" onClick={() => setBindingModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="bindings-primary" onClick={saveBindingDraft}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {notificationsModalOpen && (
        <div className="bindings-modal" role="dialog" aria-modal="true">
          <div className="bindings-modal-card" style={{ width: 800 }}>
            <div className="bindings-modal-header">
              <div>Select notifications to monitor</div>
              <button type="button" className="bindings-modal-close" onClick={() => setNotificationsModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="bindings-modal-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
              {availableNotificationLibraryCatalog.length === 0 ? (
                <div className="bindings-empty" style={{ marginBottom: 12 }}>
                  No available events in the Notification library yet. Mark notifications as Available under Control → Libraries → Notification library, then return here.
                </div>
              ) : null}
              <input
                className="bindings-search"
                placeholder="Filter available events"
                value={notificationEventFilter}
                onChange={(event) => setNotificationEventFilter(event.target.value)}
                style={{ minWidth: 0, marginBottom: 6 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 140px 80px', gap: 8, fontWeight: 600 }}>
                <div>Event</div>
                <div>Type</div>
                <div>Availability</div>
                <div>Monitor</div>
              </div>
              {filteredNotificationEvents.map((n) => {
                const isMon = monitoredEventsInclude(bindingDraft.monitoredEvents, n.description);
                return (
                  <div key={n.description} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 140px 80px', gap: 8, padding: '6px 0', alignItems: 'center' }}>
                    <div style={{ color: '#065f46' }}>{n.description}</div>
                    <div style={{ color: '#374151' }}>{n.type}</div>
                    <div style={{ color: '#6b7280' }}>{n.availability}</div>
                    <div>
                      <input
                        type="checkbox"
                        checked={isMon}
                        onChange={() => {
                          setBindingDraft((current) => ({
                            ...current,
                            monitoredEvents: toggleMonitoredEvent(current.monitoredEvents, n.description)
                          }));
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="bindings-modal-actions">
              <button type="button" className="bindings-ghost" onClick={() => setNotificationsModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {locationPickerOpen && currentEditingLocationBindingId && (
        <div className="bindings-modal" role="dialog" aria-modal="true">
          <div className="locations-card" onClick={(e) => e.stopPropagation()}>
            <div className="locations-card-header">
              <div>Select locations</div>
              <button type="button" className="locations-close" onClick={() => setLocationPickerOpen(false)}>×</button>
            </div>
            <input className="locations-filter" placeholder="Filter" value={locationsFilter} onChange={(e) => setLocationsFilter(e.target.value)} />
            <div className="locations-table">
              <div className="locations-row locations-head">
                <div />
                <div>Location name</div>
                <div>Site</div>
                <div>Location type</div>
                <div>Configure</div>
              </div>
              {(allLocations || []).filter((loc) => loc.name.toLowerCase().includes(locationsFilter.trim().toLowerCase())).map((loc) => {
                const list = locationDraftsById[currentEditingLocationBindingId] ?? [];
                const selected = list.some((l) => l.id === loc.id);
                return (
                  <div key={loc.id} className="locations-row">
                    <div>
                      <button type="button" className="locations-add" disabled={selected} onClick={() => toggleLocationForBinding(currentEditingLocationBindingId, loc)}>
                        {selected ? '−' : '+'}
                      </button>
                    </div>
                    <div>{loc.name}</div>
                    <div>{loc.site ?? ''}</div>
                    <div>{loc.locationType ?? ''}</div>
                    <div>
                      {selected && (
                        <button type="button" className="locations-btn" onClick={() => openLocationSettings(currentEditingLocationBindingId, loc.id)}>Configure</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="locations-footer">
              <div>{(locationDraftsById[currentEditingLocationBindingId] ?? []).length} selected</div>
              <div className="locations-actions">
                <button type="button" className="locations-btn" onClick={() => setLocationPickerOpen(false)}>Cancel</button>
                <button
                  type="button"
                  className="locations-btn primary"
                  onClick={async () => {
                    // persist the draft for this binding
                    const id = currentEditingLocationBindingId;
                    if (!id) return;
                    const existing = locationRows.find((r) => (r as any).id === id || r.name === id);
                    const name = existing?.name ?? id;
                    const site = String(existing?.site ?? readActiveSiteName()).trim();
                    if (!site) {
                      showToast("Select a site before saving the location binding.", "error");
                      return;
                    }
                    beginSaving();
                    const payload: any = {
                      id,
                      name,
                      site,
                      assetCount: existing?.assetCount ?? 0,
                      groupCount: existing?.groupCount ?? 0,
                      locationsConfig: locationDraftsById[id] ?? []
                    };
                    const result = await saveBindingDetailed("locations", payload);
                    if (result.stored) {
                      const savedId = String(result.id ?? id).trim();
                      setLocationRows((cur) => {
                        const found = cur.find((r) => (r as any).id === id || (r as any).id === savedId);
                        if (found) {
                          return cur.map((r) =>
                            (r as any).id === id || (r as any).id === savedId
                              ? { ...(r as any), id: savedId, locationsConfig: payload.locationsConfig }
                              : r
                          );
                        }
                        return [{ id: savedId, name, site, assetCount: 0, groupCount: 0, locationsConfig: payload.locationsConfig }, ...cur];
                      });
                      setLocationDraftsById((cur) => ({ ...cur, [savedId]: payload.locationsConfig }));
                      void resyncConfigurationGroupsForBinding("locations", { id: savedId, name, site });
                      endSavingDone();
                    } else {
                      endSavingError(result.error || "Unable to save location binding.");
                    }
                    setLocationPickerOpen(false);
                    setCurrentEditingLocationBindingId(null);
                  }}
                >
                  Select
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {locationSettingsModalOpen && locationSettingsTarget && locationSettingsDraft && (
        <div className="bindings-modal bindings-modal--stacked" role="dialog" aria-modal="true">
          <div className="bindings-modal-card bindings-modal-card--settings">
            <div className="bindings-modal-header">
              <div>Location settings</div>
              <button type="button" className="bindings-modal-close" onClick={() => setLocationSettingsModalOpen(false)}>×</button>
            </div>
            <div className="bindings-modal-body">
              <label className="bindings-field">
                Over speeding value *
                <input className="bindings-input" type="number" value={locationSettingsDraft.overSpeedKph} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, overSpeedKph: Number(e.target.value) || 0 })} />
                km/h
              </label>
              <label className="bindings-field">
                Allow a buffer of *
                <input className="bindings-input" type="number" value={locationSettingsDraft.bufferKph} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, bufferKph: Number(e.target.value) || 0 })} />
                km/h
              </label>
              <div style={{ marginTop: 12, fontWeight: 700 }}>Record</div>
              <label className="bindings-field">
                Warning delay
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" className="bindings-input" min={0} value={locationSettingsDraft.warningDelay.minutes} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, warningDelay: { ...locationSettingsDraft.warningDelay, minutes: Number(e.target.value) || 0 } })} />
                  <span>:</span>
                  <input type="number" className="bindings-input" min={0} value={locationSettingsDraft.warningDelay.seconds} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, warningDelay: { ...locationSettingsDraft.warningDelay, seconds: Number(e.target.value) || 0 } })} />
                </div>
              </label>
              <label className="bindings-field">
                Recording delay
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" className="bindings-input" min={0} value={locationSettingsDraft.recordingDelay.minutes} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, recordingDelay: { ...locationSettingsDraft.recordingDelay, minutes: Number(e.target.value) || 0 } })} />
                  <span>:</span>
                  <input type="number" className="bindings-input" min={0} value={locationSettingsDraft.recordingDelay.seconds} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, recordingDelay: { ...locationSettingsDraft.recordingDelay, seconds: Number(e.target.value) || 0 } })} />
                </div>
              </label>
              <div style={{ marginTop: 12, fontWeight: 700 }}>Active message sending</div>
              <label className="bindings-field">
                Message priority
                <select className="bindings-input" value={locationSettingsDraft.activeMessage.priority} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, activeMessage: { ...locationSettingsDraft.activeMessage, priority: e.target.value } })}>
                  <option>Normal</option>
                  <option>High</option>
                </select>
              </label>
              <label className="bindings-advanced-check">
                <input type="checkbox" checked={locationSettingsDraft.activeMessage.basedOnDuration} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, activeMessage: { ...locationSettingsDraft.activeMessage, basedOnDuration: e.target.checked } })} />
                Send active message based on excessive duration
              </label>
              {locationSettingsDraft.activeMessage.basedOnDuration && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" className="bindings-input" min={0} value={locationSettingsDraft.activeMessage.duration.minutes} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, activeMessage: { ...locationSettingsDraft.activeMessage, duration: { ...locationSettingsDraft.activeMessage.duration, minutes: Number(e.target.value) || 0 } } })} />
                  <span>:</span>
                  <input type="number" className="bindings-input" min={0} value={locationSettingsDraft.activeMessage.duration.seconds} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, activeMessage: { ...locationSettingsDraft.activeMessage, duration: { ...locationSettingsDraft.activeMessage.duration, seconds: Number(e.target.value) || 0 } } })} />
                </div>
              )}
              <label className="bindings-advanced-check">
                <input type="checkbox" checked={locationSettingsDraft.activeMessage.basedOnSpeed} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, activeMessage: { ...locationSettingsDraft.activeMessage, basedOnSpeed: e.target.checked } })} />
                Send active message based on excessive speed
              </label>
              {locationSettingsDraft.activeMessage.basedOnSpeed && (
                <div>
                  <input type="number" className="bindings-input" value={locationSettingsDraft.activeMessage.speedKph} onChange={(e) => setLocationSettingsDraft({ ...locationSettingsDraft, activeMessage: { ...locationSettingsDraft.activeMessage, speedKph: Number(e.target.value) || 0 } })} />
                  km/h
                </div>
              )}
            </div>
            <div className="bindings-modal-actions">
              <button type="button" className="bindings-ghost" onClick={() => setLocationSettingsModalOpen(false)}>Cancel</button>
              <button type="button" className="bindings-primary" onClick={() => saveLocationSettings()}>Save</button>
            </div>
          </div>
        </div>
      )}
      {advancedModalOpen && activeAdvancedId && (
        <div className="bindings-modal bindings-modal--advanced" role="dialog" aria-modal="true">
          <div
            className="bindings-modal-card bindings-modal-advanced"
            ref={advancedModalRef}
            style={advancedWidth ? { width: `${advancedWidth}px` } : undefined}
          >
            <div
              className="bindings-resize-handle"
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(event) => {
                event.preventDefault();
                const rect = advancedModalRef.current?.getBoundingClientRect();
                if (!rect) return;
                setAdvancedResizeEdge("left");
                setAdvancedLeft(null);
                setAdvancedRight(rect.right);
                setAdvancedResizing(true);
              }}
            />
            <div
              className="bindings-resize-handle bindings-resize-handle-right"
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(event) => {
                event.preventDefault();
                const rect = advancedModalRef.current?.getBoundingClientRect();
                if (!rect) return;
                setAdvancedResizeEdge("right");
                setAdvancedRight(null);
                setAdvancedLeft(rect.left);
                setAdvancedResizing(true);
              }}
            />
            <div className="bindings-modal-header">
              <div>Advanced mobile device settings</div>
              <button type="button" className="bindings-modal-close" onClick={() => setAdvancedModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="bindings-modal-body">
              {deviceRows
                .filter((row) => row.id === activeAdvancedId)
                .map((row, index) => (
                  <div key={row.id} className="bindings-advanced-body">
                    <div className="bindings-advanced-summary">
                      <div>
                        <strong>Template:</strong> {row.name || ""}
                      </div>
                      <div>
                        <strong>Device type:</strong> {row.deviceType || ""}
                      </div>
                    </div>
                    {(() => {
                      const settings = row.advancedSettings ?? createDefaultAdvancedSettings();
                      return (
                        <div className="bindings-advanced-sections">
                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.baseFeatureEnabled}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    baseFeatureEnabled: event.target.checked
                                  }))
                                }
                              />
                              Base mobile device feature set
                            </label>
                            <div className="bindings-advanced-grid">
                              <div className="bindings-advanced-row">
                                <span>Arming delay</span>
                                <div className="bindings-advanced-time">
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.armingDelay.hours}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        armingDelay: {
                                          ...current.armingDelay,
                                          hours: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>Hours</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.armingDelay.minutes}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        armingDelay: {
                                          ...current.armingDelay,
                                          minutes: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>Minutes</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.armingDelay.seconds}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        armingDelay: {
                                          ...current.armingDelay,
                                          seconds: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>Seconds</span>
                                </div>
                              </div>
                              <div className="bindings-advanced-row">
                                <span>Standing delay</span>
                                <div className="bindings-advanced-time">
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.standingDelay.hours}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        standingDelay: {
                                          ...current.standingDelay,
                                          hours: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>Hours</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.standingDelay.minutes}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        standingDelay: {
                                          ...current.standingDelay,
                                          minutes: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>Minutes</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.standingDelay.seconds}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        standingDelay: {
                                          ...current.standingDelay,
                                          seconds: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>Seconds</span>
                                </div>
                              </div>
                              <div className="bindings-advanced-row">
                                <span>The start of a trip will be recorded when</span>
                                <select
                                  className="bindings-input"
                                  value={settings.tripStartCondition}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      tripStartCondition: event.target.value
                                    }))
                                  }
                                >
                                  <option value="A driver is identified and the ignition is on">
                                    A driver is identified and the ignition is on
                                  </option>
                                  <option value="Speed or revs are detected">
                                    Speed or revs are detected
                                  </option>
                                </select>
                              </div>
                              <label className="bindings-advanced-check">
                                <input
                                  type="checkbox"
                                  checked={settings.disarmOnlyWithDriver}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      disarmOnlyWithDriver: event.target.checked
                                    }))
                                  }
                                />
                                Only disarm the immobiliser relay while a valid driver code plug is in the socket
                              </label>
                              <label className="bindings-advanced-check">
                                <input
                                  type="checkbox"
                                  checked={settings.ignitionWired}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      ignitionWired: event.target.checked
                                    }))
                                  }
                                />
                                Ignition wired
                              </label>
                            </div>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.firmwareEnabled}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    firmwareEnabled: event.target.checked
                                  }))
                                }
                              />
                              Firmware version
                            </label>
                            <div className="bindings-advanced-row">
                              <span>Preferred firmware version</span>
                              <select
                                className="bindings-input"
                                value={settings.preferredFirmware}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    preferredFirmware: event.target.value
                                  }))
                                }
                              >
                                <option value="">Select version</option>
                                {Array.from(
                                  new Set(
                                    [
                                      ...firmwareVersionOptions,
                                      String(settings.preferredFirmware ?? "").trim()
                                    ].filter(Boolean)
                                  )
                                )
                                  .sort((a, b) => a.localeCompare(b))
                                  .map((version) => (
                                    <option key={version} value={version}>
                                      {version}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.locationSpeedMonitoring}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    locationSpeedMonitoring: event.target.checked
                                  }))
                                }
                              />
                              Location monitoring
                            </label>
                            <div className="bindings-advanced-note">
                              Activates and monitors geofence speeds set.
                            </div>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.commandInterpreter}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    commandInterpreter: event.target.checked
                                  }))
                                }
                              />
                              Command interpreter
                            </label>
                            <label className="bindings-advanced-check">
                              <input
                                type="checkbox"
                                checked={settings.progressiveShutdownOta}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    progressiveShutdownOta: event.target.checked
                                  }))
                                }
                              />
                              Enable progressive shut down OTA
                            </label>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.accelerometerEnabled}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    accelerometerEnabled: event.target.checked
                                  }))
                                }
                              />
                              Three Axis Accelerometer
                            </label>
                            <div className="bindings-advanced-grid">
                              <div className="bindings-advanced-row">
                                <span>Impact Detection Sensitivity</span>
                                <input
                                  type="number"
                                  className="bindings-input"
                                  value={settings.impactSensitivity}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      impactSensitivity: Number(event.target.value)
                                    }))
                                  }
                                />
                              </div>
                              <div className="bindings-advanced-row">
                                <span>External Force Detection Sensitivity</span>
                                <input
                                  type="number"
                                  className="bindings-input"
                                  value={settings.externalForceSensitivity}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      externalForceSensitivity: Number(event.target.value)
                                    }))
                                  }
                                />
                              </div>
                              <div className="bindings-advanced-row">
                                <span>Road Roughness Detection Sensitivity</span>
                                <input
                                  type="number"
                                  className="bindings-input"
                                  value={settings.roadRoughnessSensitivity}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      roadRoughnessSensitivity: Number(event.target.value)
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.requireCompanyId}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    requireCompanyId: event.target.checked
                                  }))
                                }
                              />
                              Require Company ID on driver plug
                            </label>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.engineHoursEnabled}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    engineHoursEnabled: event.target.checked
                                  }))
                                }
                              />
                              Engine hours
                            </label>
                            <div className="bindings-advanced-row">
                              <span>Record engine hours</span>
                              <select
                                className="bindings-input"
                                value={settings.recordEngineHours}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    recordEngineHours: event.target.value
                                  }))
                                }
                              >
                                <option value="Ignition on OR engine revs">Ignition on OR engine revs</option>
                                <option value="Ignition on only">Ignition on only</option>
                                <option value="Engine revs only">Engine revs only</option>
                              </select>
                            </div>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={Boolean(settings.relayAlertsEnabled)}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    relayAlertsEnabled: event.target.checked
                                  }))
                                }
                              />
                              Allow alerts to switch relays (relay drive 1 is the immobilizer)
                            </label>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.buzzerEnabled}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    buzzerEnabled: event.target.checked
                                  }))
                                }
                              />
                              Buzzer
                            </label>
                            <div className="bindings-advanced-grid">
                              <div className="bindings-advanced-row">
                                <span>When the ignition is turned on</span>
                                <select
                                  className="bindings-input"
                                  value={settings.buzzerOnIgnition}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      buzzerOnIgnition: event.target.value
                                    }))
                                  }
                                >
                                  <option value="Sound the buzzer for 10 seconds">
                                    Sound the buzzer for 10 seconds
                                  </option>
                                  <option value="Sound the buzzer for 5 seconds">Sound the buzzer for 5 seconds</option>
                                  <option value="Do not sound">Do not sound</option>
                                </select>
                              </div>
                              <div className="bindings-advanced-row">
                                <span>Buzzer frequency</span>
                                <div className="bindings-advanced-inline">
                                  <input
                                    type="number"
                                    className="bindings-input"
                                    value={settings.buzzerFrequency}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        buzzerFrequency: Number(event.target.value)
                                      }))
                                    }
                                  />
                                  <span>Hz</span>
                                </div>
                              </div>
                              <div className="bindings-advanced-row">
                                <span>Buzzer volume</span>
                                <select
                                  className="bindings-input"
                                  value={settings.buzzerVolume}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      buzzerVolume: event.target.value
                                    }))
                                  }
                                >
                                  <option value="Full Volume">Full Volume</option>
                                  <option value="Medium">Medium</option>
                                  <option value="Low">Low</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.sendAvlsEnabled}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    sendAvlsEnabled: event.target.checked
                                  }))
                                }
                              />
                              Send AVLs
                            </label>
                            <div className="bindings-advanced-grid">
                              <div className="bindings-advanced-row">
                                <span>Send AVL in trip frequency</span>
                                <div className="bindings-advanced-time">
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.sendAvlTripFrequency.hours}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        sendAvlTripFrequency: {
                                          ...current.sendAvlTripFrequency,
                                          hours: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.sendAvlTripFrequency.minutes}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        sendAvlTripFrequency: {
                                          ...current.sendAvlTripFrequency,
                                          minutes: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.sendAvlTripFrequency.seconds}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        sendAvlTripFrequency: {
                                          ...current.sendAvlTripFrequency,
                                          seconds: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                              <div className="bindings-advanced-row">
                                <span>Send AVL in trip if heading changes by more than</span>
                                <div className="bindings-advanced-inline">
                                  <input
                                    type="number"
                                    className="bindings-input"
                                    value={settings.sendAvlHeadingChange}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        sendAvlHeadingChange: Number(event.target.value)
                                      }))
                                    }
                                  />
                                  <span>°</span>
                                </div>
                              </div>
                              <div className="bindings-advanced-row">
                                <span>Send AVL in trip if distance covered is more than</span>
                                <div className="bindings-advanced-inline">
                                  <input
                                    type="number"
                                    className="bindings-input"
                                    value={settings.sendAvlDistance}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        sendAvlDistance: Number(event.target.value)
                                      }))
                                    }
                                  />
                                  <span>m</span>
                                </div>
                              </div>
                              <label className="bindings-advanced-check">
                                <input
                                  type="checkbox"
                                  checked={settings.sendAvlOutOfTrip}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      sendAvlOutOfTrip: event.target.checked
                                    }))
                                  }
                                />
                                Send AVL out of trip
                              </label>
                              <div className="bindings-advanced-row">
                                <span>Send AVL out of trip frequency</span>
                                <div className="bindings-advanced-time">
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.sendAvlOutOfTripFrequency.hours}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        sendAvlOutOfTripFrequency: {
                                          ...current.sendAvlOutOfTripFrequency,
                                          hours: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.sendAvlOutOfTripFrequency.minutes}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        sendAvlOutOfTripFrequency: {
                                          ...current.sendAvlOutOfTripFrequency,
                                          minutes: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.sendAvlOutOfTripFrequency.seconds}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        sendAvlOutOfTripFrequency: {
                                          ...current.sendAvlOutOfTripFrequency,
                                          seconds: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.sendFaultCodes}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    sendFaultCodes: event.target.checked
                                  }))
                                }
                              />
                              Send fault codes
                            </label>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.unitPowerManagement}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    unitPowerManagement: event.target.checked
                                  }))
                                }
                              />
                              Unit power management
                            </label>
                            <div className="bindings-advanced-grid">
                              <div className="bindings-advanced-row">
                                <span>Turn mobile device off when battery voltage falls below</span>
                                <div className="bindings-advanced-inline">
                                  <input
                                    type="number"
                                    className="bindings-input"
                                    value={settings.batteryVoltageThreshold}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        batteryVoltageThreshold: Number(event.target.value)
                                      }))
                                    }
                                  />
                                  <span>mV</span>
                                </div>
                              </div>
                              <label className="bindings-advanced-check">
                                <input
                                  type="checkbox"
                                  checked={settings.autoShutdown}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      autoShutdown: event.target.checked
                                    }))
                                  }
                                />
                                Automatic shutdown of mobile device
                              </label>
                              <div className="bindings-advanced-row">
                                <span>Turn mobile device off when asset is parked for more than</span>
                                <div className="bindings-advanced-time">
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.autoShutdownParkedFor.hours}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        autoShutdownParkedFor: {
                                          ...current.autoShutdownParkedFor,
                                          hours: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.autoShutdownParkedFor.minutes}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        autoShutdownParkedFor: {
                                          ...current.autoShutdownParkedFor,
                                          minutes: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.autoShutdownParkedFor.seconds}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        autoShutdownParkedFor: {
                                          ...current.autoShutdownParkedFor,
                                          seconds: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.peripheralPowerManagement}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    peripheralPowerManagement: event.target.checked
                                  }))
                                }
                              />
                              Peripheral power management
                            </label>
                            <div className="bindings-advanced-grid">
                              <label className="bindings-advanced-check">
                                <input
                                  type="checkbox"
                                  checked={settings.peripheralAutoShutdown}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      peripheralAutoShutdown: event.target.checked
                                    }))
                                  }
                                />
                                Automatic shutdown of peripheral devices
                              </label>
                              <div className="bindings-advanced-row">
                                <span>Turn peripheral devices off when asset is parked for more than</span>
                                <div className="bindings-advanced-time">
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.peripheralParkedFor.hours}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        peripheralParkedFor: {
                                          ...current.peripheralParkedFor,
                                          hours: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.peripheralParkedFor.minutes}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        peripheralParkedFor: {
                                          ...current.peripheralParkedFor,
                                          minutes: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.peripheralParkedFor.seconds}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        peripheralParkedFor: {
                                          ...current.peripheralParkedFor,
                                          seconds: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                              <div className="bindings-advanced-row">
                                <span>After waking up, leave peripheral devices on for</span>
                                <div className="bindings-advanced-time">
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.peripheralWakeDuration.hours}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        peripheralWakeDuration: {
                                          ...current.peripheralWakeDuration,
                                          hours: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.peripheralWakeDuration.minutes}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        peripheralWakeDuration: {
                                          ...current.peripheralWakeDuration,
                                          minutes: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.peripheralWakeDuration.seconds}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        peripheralWakeDuration: {
                                          ...current.peripheralWakeDuration,
                                          seconds: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                              <label className="bindings-advanced-check">
                                <input
                                  type="checkbox"
                                  checked={settings.surfacingEnabled}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      surfacingEnabled: event.target.checked
                                    }))
                                  }
                                />
                                Surfacing
                              </label>
                              <div className="bindings-advanced-row">
                                <span>Switch peripheral devices on every</span>
                                <div className="bindings-advanced-time">
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.surfacingInterval.hours}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        surfacingInterval: {
                                          ...current.surfacingInterval,
                                          hours: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.surfacingInterval.minutes}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        surfacingInterval: {
                                          ...current.surfacingInterval,
                                          minutes: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                  <span>:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settings.surfacingInterval.seconds}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        surfacingInterval: {
                                          ...current.surfacingInterval,
                                          seconds: Number(event.target.value)
                                        }
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                              <label className="bindings-advanced-check">
                                <input
                                  type="checkbox"
                                  checked={settings.surfacingLimitEnabled}
                                  onChange={(event) =>
                                    updateAdvancedSettings(index, (current) => ({
                                      ...current,
                                      surfacingLimitEnabled: event.target.checked
                                    }))
                                  }
                                />
                                Limit number of times to surface
                              </label>
                              <div className="bindings-advanced-row">
                                <span>Only surface a maximum of</span>
                                <div className="bindings-advanced-inline">
                                  <input
                                    type="number"
                                    className="bindings-input"
                                    value={settings.surfacingMaxTimes}
                                    onChange={(event) =>
                                      updateAdvancedSettings(index, (current) => ({
                                        ...current,
                                        surfacingMaxTimes: Number(event.target.value)
                                      }))
                                    }
                                  />
                                  <span>times</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="bindings-advanced-section">
                            <label className="bindings-advanced-toggle">
                              <input
                                type="checkbox"
                                checked={settings.magixEnabled}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    magixEnabled: event.target.checked
                                  }))
                                }
                              />
                              Magix
                            </label>
                            <div className="bindings-advanced-row">
                              <span>Region</span>
                              <select
                                className="bindings-input"
                                value={settings.magixRegion}
                                onChange={(event) =>
                                  updateAdvancedSettings(index, (current) => ({
                                    ...current,
                                    magixRegion: event.target.value
                                  }))
                                }
                              >
                                <option value="South Africa">South Africa</option>
                                <option value="East Africa">East Africa</option>
                                <option value="West Africa">West Africa</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
            </div>
            <div className="bindings-modal-actions">
              <button type="button" className="bindings-ghost" onClick={() => setAdvancedModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="bindings-primary"
                onClick={() => {
                  void (async () => {
                  const index = deviceRows.findIndex((row) => row.id === activeAdvancedId);
                  if (index >= 0) {
                    const current = deviceRows[index];
                    const next = { ...current, advancedConfirmed: true };
                    const saved = await persistDeviceBinding({
                      id: next.id ?? `${next.name}-${Date.now()}`,
                      ...next
                    });
                    if (!saved) return;
                    updateDeviceRow(index, () => next);
                  }
                  setAdvancedModalOpen(false);
                  })();
                }}
              >
                Save settings
              </button>
            </div>
          </div>
        </div>
      )}
      {canModalOpen && canTarget && (
        <div className="bindings-modal" role="dialog" aria-modal="true">
          <div className="bindings-modal-card">
            <div className="bindings-modal-header">
              <div>Assign CANBUS protocol</div>
              <button type="button" className="bindings-modal-close" onClick={() => setCanModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="bindings-modal-body">
              <label>
                Select peripheral device
                <select
                  className="bindings-input"
                  value={canSelection}
                  onChange={(event) => setCanSelection(event.target.value)}
                >
                  <option value="">Select peripheral device</option>
                  {canLibraryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="bindings-modal-actions">
              <button type="button" className="bindings-ghost" onClick={() => setCanModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="bindings-primary"
                onClick={() => {
                  if (!canSelection) return;
                  updateDeviceRow(canTarget.rowIndex, (current) => ({
                    ...current,
                    lines: resolveDeviceBindingLines(current.lines).map((line) =>
                      line.id === canTarget.lineId
                        ? { ...line, canProtocol: canSelection, canEnabled: true, connection: "Yes" }
                        : line
                    )
                  }));
                  setCanModalOpen(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {freqModalOpen && freqTarget && (
        <div className="bindings-modal" role="dialog" aria-modal="true">
          <div className="bindings-modal-card">
            <div className="bindings-modal-header">
              <div>{freqLineLabel}</div>
              <button type="button" className="bindings-modal-close" onClick={() => setFreqModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="bindings-modal-body">
              <label>
                Select peripheral device
                <select
                  className="bindings-input"
                  value={freqSelection}
                  onChange={(event) => setFreqSelection(event.target.value)}
                >
                  {(freqTarget.lineId === "i1" ? immobiliserOptions : frequencyOptions).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="bindings-modal-actions">
              <button type="button" className="bindings-ghost" onClick={() => setFreqModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="bindings-primary"
                onClick={() => {
                  updateDeviceRow(freqTarget.rowIndex, (current) => ({
                    ...current,
                    lines: resolveDeviceBindingLines(current.lines).map((line) =>
                      line.id === freqTarget.lineId
                        ? {
                            ...line,
                            connected: freqSelection !== "Not connected",
                            connection: freqSelection,
                            parameter: freqSelection === "Not connected" ? "" : freqSelection
                          }
                        : line
                    )
                  }));
                  setFreqModalOpen(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {gpsModalOpen && gpsTarget && (
        <div className="bindings-modal" role="dialog" aria-modal="true">
          <div className="bindings-modal-card">
            <div className="bindings-modal-header">
              <div>{gpsHeader}</div>
              <button type="button" className="bindings-modal-close" onClick={() => setGpsModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="bindings-modal-body">
              <label>
                Select peripheral device
                <select
                  className="bindings-input"
                  value={gpsSelection}
                  onChange={(event) => setGpsSelection(event.target.value)}
                >
                  {gpsOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <div className="bindings-advanced-section">
                <div className="bindings-settings-title">Device settings</div>
                <label className="bindings-advanced-check">
                  <input
                    type="checkbox"
                    checked={gpsExternalAntenna}
                    onChange={(event) => setGpsExternalAntenna(event.target.checked)}
                  />
                  External GPS antenna connected
                </label>
              </div>
            </div>
            <div className="bindings-modal-actions">
              <button type="button" className="bindings-ghost" onClick={() => setGpsModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="bindings-primary"
                onClick={() => {
                  updateDeviceRow(gpsTarget.rowIndex, (current) => {
                    const next = {
                      ...current,
                      lines: resolveDeviceBindingLines(current.lines).map((line) =>
                        line.id === gpsTarget.lineId
                          ? {
                              ...line,
                              connected: gpsSelection !== "Not connected",
                              connection: gpsSelection,
                              externalAntenna: gpsExternalAntenna,
                              parameter: gpsExternalAntenna ? "External antenna" : "Internal antenna"
                            }
                          : line
                      )
                    };
                    void persistDeviceBinding({ id: next.id ?? `${next.name}-${Date.now()}`, ...next });
                    return next;
                  });
                  setGpsModalOpen(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {gsmModalOpen && gsmTarget && (
        <div className="bindings-modal" role="dialog" aria-modal="true">
          <div className="bindings-modal-card bindings-modal-advanced">
            <div className="bindings-modal-header">
              <div>GSM - {gsmSelection || "GSM module (Extended Device)"}</div>
              <button type="button" className="bindings-modal-close" onClick={() => setGsmModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="bindings-modal-body">
              <label>
                Select peripheral device
                <select
                  className="bindings-input"
                  value={gsmSelection}
                  onChange={(event) => setGsmSelection(event.target.value)}
                >
                  {gsmOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <div className="bindings-advanced-section">
                <div className="bindings-settings-title">Features and settings</div>
                <div className="bindings-gsm-card">
                  <div className="bindings-gsm-section">
                    <label className="bindings-gsm-toggle">
                      <input
                        type="checkbox"
                        checked={gsmSettings.gprsEnabled}
                        onChange={(event) =>
                          setGsmSettings((current) => ({ ...current, gprsEnabled: event.target.checked }))
                        }
                      />
                      GPRS
                    </label>
                    <label className="bindings-gsm-row">
                      <span>Allowed while roaming</span>
                      <input
                        type="checkbox"
                        checked={gsmSettings.gprsRoamingAllowed}
                        onChange={(event) =>
                          setGsmSettings((current) => ({
                            ...current,
                            gprsRoamingAllowed: event.target.checked
                          }))
                        }
                      />
                    </label>
                    <label className="bindings-gsm-row">
                      <span>Limit Max Sessions Per Day</span>
                      <input
                        type="checkbox"
                        checked={gsmSettings.gprsLimitSessionsEnabled}
                        onChange={(event) =>
                          setGsmSettings((current) => ({
                            ...current,
                            gprsLimitSessionsEnabled: event.target.checked
                          }))
                        }
                      />
                    </label>
                    <label className="bindings-gsm-row">
                      <span>— Max Sessions Per Day</span>
                      <div className="bindings-gsm-inline">
                        <input
                          className="bindings-input"
                          type="number"
                          min={0}
                          value={gsmSettings.gprsMaxSessionsPerDay}
                          onChange={(event) =>
                            setGsmSettings((current) => ({
                              ...current,
                              gprsMaxSessionsPerDay: Number(event.target.value) || 0
                            }))
                          }
                        />
                        <span>sessions</span>
                      </div>
                    </label>
                  </div>

                  <div className="bindings-gsm-section">
                    <label className="bindings-gsm-toggle">
                      <input
                        type="checkbox"
                        checked={gsmSettings.smsEnabled}
                        onChange={(event) =>
                          setGsmSettings((current) => ({ ...current, smsEnabled: event.target.checked }))
                        }
                      />
                      SMS
                    </label>
                    <label className="bindings-gsm-row">
                      <span>Allowed while roaming</span>
                      <input
                        type="checkbox"
                        checked={gsmSettings.smsRoamingAllowed}
                        onChange={(event) =>
                          setGsmSettings((current) => ({
                            ...current,
                            smsRoamingAllowed: event.target.checked
                          }))
                        }
                      />
                    </label>
                    <label className="bindings-gsm-row">
                      <span>Vehicle Daily SMS Limit</span>
                      <div className="bindings-gsm-inline">
                        <input
                          className="bindings-input"
                          type="number"
                          min={0}
                          value={gsmSettings.smsDailyLimit}
                          onChange={(event) =>
                            setGsmSettings((current) => ({
                              ...current,
                              smsDailyLimit: Number(event.target.value) || 0
                            }))
                          }
                        />
                        <span>SMSes</span>
                      </div>
                    </label>
                  </div>

                  <div className="bindings-gsm-section">
                    <label className="bindings-gsm-toggle">
                      <input
                        type="checkbox"
                        checked={gsmSettings.remoteCommandEnabled}
                        onChange={(event) =>
                          setGsmSettings((current) => ({
                            ...current,
                            remoteCommandEnabled: event.target.checked
                          }))
                        }
                      />
                      Remote command
                    </label>
                    <label className="bindings-gsm-row">
                      <span>Default transport type</span>
                      <select
                        className="bindings-input"
                        value={gsmSettings.remoteCommandTransport}
                        onChange={(event) =>
                          setGsmSettings((current) => ({
                            ...current,
                            remoteCommandTransport: event.target.value as GsmSettings["remoteCommandTransport"]
                          }))
                        }
                      >
                        <option value="GPRS">GPRS</option>
                        <option value="SMS">SMS</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
              {deviceReportingSettings}
            </div>
            <div className="bindings-modal-actions">
              <button type="button" className="bindings-ghost" onClick={() => setGsmModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="bindings-primary"
                onClick={() => {
                  updateDeviceRow(gsmTarget.rowIndex, (current) => {
                    const next = {
                      ...current,
                      gsmSettings,
                      lines: resolveDeviceBindingLines(current.lines).map((line) =>
                        line.id === gsmTarget.lineId
                          ? {
                              ...line,
                              connected: gsmSelection !== "Not connected",
                              connection: gsmSelection
                            }
                          : line
                      )
                    };
                    void persistDeviceBinding({ id: next.id ?? `${next.name}-${Date.now()}`, ...next });
                    return next;
                  });
                  void saveSettings();
                  setGsmModalOpen(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {speedModalOpen && speedTarget && (
        <div className="bindings-modal" role="dialog" aria-modal="true">
          <div className="bindings-modal-card">
            <div className="bindings-modal-header">
              <div>Speed</div>
              <button type="button" className="bindings-modal-close" onClick={() => setSpeedModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="bindings-modal-body">
              <label>
                Select peripheral device
                <select
                  className="bindings-input"
                  value={speedSelection}
                  onChange={(event) => setSpeedSelection(event.target.value)}
                >
                  {speedOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="bindings-modal-actions">
              <button type="button" className="bindings-ghost" onClick={() => setSpeedModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="bindings-primary"
                onClick={() => {
                  updateDeviceRow(speedTarget.rowIndex, (current) => ({
                    ...current,
                    lines: resolveDeviceBindingLines(current.lines).map((line) =>
                      line.id === speedTarget.lineId
                        ? {
                            ...line,
                            connected: speedSelection !== "Not connected",
                            connection: speedSelection,
                            parameter: speedSelection === "Not connected" ? "" : speedSelection
                          }
                        : line
                    )
                  }));
                  setSpeedModalOpen(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
