import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import ScheduleDateTimePicker from "../components/ScheduleDateTimePicker";
import {
  buildApiUrl,
  getAlertsFromApi,
  getApiKey,
  getAssetsFromApi,
  getCamerasFromApi,
  getTenantId
} from "../utils/api";
import { computeAssetDotStatus } from "../utils/assetStatus";
import { isCms808LiveAsset, loadCms808DashboardRecords } from "../utils/cms808";
import "../index.css";

type DashboardRecord = Record<string, unknown>;

type HistoryEvent = {
  assetId: string;
  imei: string;
  createdAt: string;
  data: DashboardRecord | null;
};

type TrendPoint = {
  label: string;
  value: number;
};

type RankedPoint = {
  label: string;
  value: number;
};

type DerivedDashboardData = {
  total: number;
  online: number;
  offline: number;
  onlineRate: number;
  offlineRate: number;
  alarmTypes: RankedPoint[];
  deviceExceptions: RankedPoint[];
  alarmCountByDevice: RankedPoint[];
  workTime: RankedPoint[];
  alarmTrend: TrendPoint[];
  onlineTrend: TrendPoint[];
};

const toText = (value: unknown): string => String(value ?? "").trim();

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toMs = (value: unknown): number => {
  const raw = toText(value);
  if (!raw) return Number.NaN;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const isYes = (value: unknown): boolean => toText(value).toLowerCase() === "yes";

const classifyCameraStandalone = (row: DashboardRecord): boolean => {
  if (isYes(row.standaloneMode)) return true;
  if (isYes(row.hasCamera)) return true;
  return Boolean(
    toText(row.camera) ||
      toText(row.cameraModel) ||
      toText(row.cameraSerial) ||
      toText(row.cameraStatus) ||
      toText(row.cameraFirmware)
  );
};

const pickDeviceKey = (row: DashboardRecord): string => {
  const imei = toText(row.imei);
  if (imei) return `imei:${imei}`;
  const cameraSerial = toText(row.cameraSerial);
  if (cameraSerial) return `cam:${cameraSerial}`;
  const cameraId = toText(row.cameraId || row.id);
  if (cameraId) return `camera:${cameraId}`;
  const assetId = toText(row.assetId || row.id);
  if (assetId) return `asset:${assetId}`;
  return "";
};

const pickDeviceLabel = (row: DashboardRecord): string => {
  return (
    toText(row.assetDescription) ||
    toText(row.registration) ||
    toText(row.fleetNumber) ||
    toText(row.imei) ||
    toText(row.cameraSerial) ||
    toText(row.cameraId) ||
    toText(row.id) ||
    "Unknown"
  );
};

const isOnlineRow = (row: DashboardRecord): boolean => {
  const fromTelemetry = computeAssetDotStatus({
    availability: row.status,
    lastSeen: row.lastSeen,
    lastPosition: row.lastPosition,
    lastTrip: row.lastTrip,
    speed: row.speed,
    staleHours: 2
  });
  if (fromTelemetry === "online") return true;

  const cameraStatus = toText(row.cameraStatus).toLowerCase();
  return cameraStatus === "online" || cameraStatus === "active" || cameraStatus === "connected";
};

const percentage = (value: number, total: number): number => {
  if (!total) return 0;
  return Math.round((value / total) * 100);
};

const formatShortDate = (isoDate: string): string => {
  const dt = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

type VideoDatePickerTarget = "from" | "to";

const getLastNDates = (days: number): string[] => {
  const out: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

const groupByCount = (labels: string[]): RankedPoint[] => {
  const counts = new Map<string, number>();
  for (const label of labels) {
    const key = toText(label) || "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
};

const labelForAlertType = (alert: DashboardRecord): string => {
  return (
    toText(alert.alarmType) ||
    toText(alert.type) ||
    toText(alert.category) ||
    toText(alert.name) ||
    toText(alert.title) ||
    toText(alert.message) ||
    "Unknown"
  );
};

// ─── Video-telematics notification types (Ai: prefix + DVR) ──────────────────
const VT_NOTIFICATION_TYPES = [
  "Ai: Blind spot detection (front)",
  "Ai: Blind spot detection (left)",
  "Ai: Blind spot detection (right)",
  "Ai: Driver distraction",
  "Ai: Driver fatigue - eye closing",
  "Ai: Driver fatigue - yawning",
  "Ai: Driver not wearing seatbelt",
  "Ai: Driver smoking",
  "Ai: End of Trip Video",
  "Ai: Event video requests capped",
  "Ai: Face to Driver ID mismatch",
  "Ai: Following distance warning",
  "Ai: Forward collision warning",
  "Ai: GPS loss",
  "Ai: Impact detection",
  "Ai: Lane departure warning",
  "Ai: Lens covered",
  "Ai: Low voltage",
  "Ai: Manual alert",
  "Ai: Mobile phone distraction",
  "Ai: Motion detection",
  "Ai: No driver",
  "Ai: Pedestrian collision warning",
  "Ai: Power loss",
  "Ai: Rolling stop",
  "Ai: Safeguard extremely high risk",
  "Ai: Safeguard high risk",
  "Ai: Safeguard low risk",
  "Ai: Safeguard medium risk",
  "Ai: Speed sign overspeeding",
  "Ai: Start of Trip Video",
  "Ai: Storage exception",
  "Ai: Video loss",
  "DVR Error detected",
];

const DEFAULT_ENABLED_NOTIFICATIONS = new Set([
  "Ai: Driver distraction",
  "Ai: Driver fatigue - eye closing",
  "Ai: Driver fatigue - yawning",
  "Ai: Driver not wearing seatbelt",
  "Ai: Driver smoking",
  "Ai: Forward collision warning",
  "Ai: Lane departure warning",
  "Ai: Speed sign overspeeding",
  "Ai: Video loss",
  "DVR Error detected",
]);

type TopN = 5 | 10 | 20;
type ChartType = "line" | "bar";

interface ContainerPrefs {
  notifTopN: TopN;
  devsTopN: TopN;
  workTimeTopN: TopN;
  trendChart: ChartType;
}

const DEFAULT_PREFS: ContainerPrefs = {
  notifTopN: 10,
  devsTopN: 5,
  workTimeTopN: 5,
  trendChart: "line",
};

const storageKey = (suffix: string) => {
  const tid = String(getTenantId() ?? "default").trim() || "default";
  return `vivi.vtDashboard:${tid}:${suffix}`;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const weekAgoStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

// ─── Sub-components ──────────────────────────────────────────────────────────
interface NotifSelectorProps {
  enabled: Set<string>;
  onSave: (next: Set<string>) => void;
  onClose: () => void;
}

function NotifSelectorModal({ enabled, onSave, onClose }: NotifSelectorProps) {
  const [draft, setDraft] = useState(new Set(enabled));
  const toggle = (name: string) => {
    setDraft(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };
  return (
    <div className="vt-modal-overlay" onClick={onClose}>
      <div className="vt-modal" onClick={e => e.stopPropagation()}>
        <div className="vt-modal-header">
          <span>Select Notifications to Display</span>
          <button className="vt-modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="vt-modal-hint">Selections are saved per account independently.</p>
        <div className="vt-modal-list">
          {VT_NOTIFICATION_TYPES.map(name => (
            <label key={name} className="vt-modal-item">
              <input type="checkbox" checked={draft.has(name)} onChange={() => toggle(name)} />
              <span>{name}</span>
            </label>
          ))}
        </div>
        <div className="vt-modal-footer">
          <button className="vt-modal-btn vt-modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="vt-modal-btn vt-modal-btn-primary" onClick={() => { onSave(draft); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}

interface ContainerPrefsModalProps {
  prefs: ContainerPrefs;
  onSave: (next: ContainerPrefs) => void;
  onClose: () => void;
}

function ContainerPrefsModal({ prefs, onSave, onClose }: ContainerPrefsModalProps) {
  const [draft, setDraft] = useState<ContainerPrefs>({ ...prefs });
  const set = <K extends keyof ContainerPrefs>(k: K, v: ContainerPrefs[K]) =>
    setDraft(p => ({ ...p, [k]: v }));
  return (
    <div className="vt-modal-overlay" onClick={onClose}>
      <div className="vt-modal" onClick={e => e.stopPropagation()}>
        <div className="vt-modal-header">
          <span>Dashboard Customisation</span>
          <button className="vt-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="vt-pref-grid">
          <label>Notification Statistics — Top</label>
          <select value={draft.notifTopN} onChange={e => set("notifTopN", Number(e.target.value) as TopN)}>
            <option value={5}>Top 5</option><option value={10}>Top 10</option><option value={20}>Top 20</option>
          </select>
          <label>Device Exception — Top</label>
          <select value={draft.devsTopN} onChange={e => set("devsTopN", Number(e.target.value) as TopN)}>
            <option value={5}>Top 5</option><option value={10}>Top 10</option><option value={20}>Top 20</option>
          </select>
          <label>Device Work Time — Top</label>
          <select value={draft.workTimeTopN} onChange={e => set("workTimeTopN", Number(e.target.value) as TopN)}>
            <option value={5}>Top 5</option><option value={10}>Top 10</option>
          </select>
          <label>Trend Chart Style</label>
          <select value={draft.trendChart} onChange={e => set("trendChart", e.target.value as ChartType)}>
            <option value="line">Line</option><option value="bar">Bar</option>
          </select>
        </div>
        <div className="vt-modal-footer">
          <button className="vt-modal-btn vt-modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="vt-modal-btn vt-modal-btn-primary" onClick={() => { onSave(draft); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}

const labelForAlertDevice = (alert: DashboardRecord): string => {
  return (
    toText(alert.assetDescription) ||
    toText(alert.registration) ||
    toText(alert.deviceName) ||
    toText(alert.deviceId) ||
    toText(alert.imei) ||
    toText(alert.cameraSerial) ||
    toText(alert.assetId) ||
    "Unknown"
  );
};

const createdAtForAlert = (alert: DashboardRecord): string => {
  return (
    toText(alert.createdAt) ||
    toText(alert.created_at) ||
    toText(alert.at) ||
    toText(alert.time)
  );
};

const movementForEvent = (event: HistoryEvent): string => {
  const data = event.data && typeof event.data === "object" ? (event.data as Record<string, unknown>) : null;
  const attrs = data?.attributes && typeof data.attributes === "object"
    ? (data.attributes as Record<string, unknown>)
    : null;
  return toText(data?.movement ?? attrs?.movement).toLowerCase();
};

const deviceKeyForEvent = (event: HistoryEvent): string => {
  const imei = toText(event.imei || event.data?.imei);
  if (imei) return `imei:${imei}`;
  const assetId = toText(event.assetId || event.data?.assetId || event.data?.id);
  if (assetId) return `asset:${assetId}`;
  return "";
};

const fetchTelemetryHistory = async (): Promise<HistoryEvent[]> => {
  try {
    const tenantId = toText(getTenantId());
    const apiKey = toText(getApiKey());
    if (!tenantId || !apiKey) return [];

    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      limit: "5000"
    });

    let response = await fetch(buildApiUrl(`/telemetry/history?${params.toString()}`), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": tenantId,
        "x-api-key": apiKey
      }
    });
    if (response.status === 404) {
      response = await fetch(buildApiUrl(`/api/telemetry/history?${params.toString()}`), {
        method: "GET",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
          "x-api-key": apiKey
        }
      });
    }
    if (!response.ok) return [];

    const body = (await response.json()) as { events?: unknown[] };
    const rows = Array.isArray(body?.events) ? body.events : [];
    return rows
      .map((row) => {
        const event = (row ?? {}) as DashboardRecord;
        const data = event.data;
        return {
          assetId: toText(event.assetId),
          imei: toText(event.imei),
          createdAt: toText(event.createdAt),
          data: data && typeof data === "object" ? (data as DashboardRecord) : null
        } as HistoryEvent;
      })
      .filter((row) => row.createdAt);
  } catch {
    return [];
  }
};

const computeLinePath = (values: number[]): { line: string; area: string } => {
  if (values.length === 0) return { line: "", area: "" };
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 88 - ((value - min) / span) * 72;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = points.join(" ");
  const area = `0,88 ${line} 100,88`;
  return { line, area };
};

const fallbackDashboardData = (): DerivedDashboardData => {
  const dates = getLastNDates(8).map((day) => ({ label: formatShortDate(day), value: 0 }));
  return {
    total: 0,
    online: 0,
    offline: 0,
    onlineRate: 0,
    offlineRate: 0,
    alarmTypes: [],
    deviceExceptions: [],
    alarmCountByDevice: [],
    workTime: [],
    alarmTrend: dates,
    onlineTrend: dates
  };
};

const deriveDashboardData = (
  assets: DashboardRecord[],
  cameras: DashboardRecord[],
  alerts: DashboardRecord[],
  history: HistoryEvent[]
): DerivedDashboardData => {
  const cameraStandaloneAssets = assets.filter((row) => classifyCameraStandalone(row));
  const assetCameraKeys = new Set(
    cameraStandaloneAssets
      .map((row) => toText(row.cameraSerial || row.camera || row.cameraId || row.id))
      .filter(Boolean)
  );

  const unboundCameras = cameras
    .filter((row) => {
      const cameraKey = toText(row.cameraSerial || row.cameraId || row.id);
      if (!cameraKey) return false;
      return !assetCameraKeys.has(cameraKey);
    })
    .map((row) => ({
      ...row,
      status: toText(row.status || row.cameraStatus || "available"),
      cameraStatus: toText(row.cameraStatus || row.status),
      hasCamera: true,
      standaloneMode: toText(row.standaloneMode || "yes")
    }));

  const devices = [...cameraStandaloneAssets, ...unboundCameras];
  const total = devices.length;
  const online = devices.filter((row) => isOnlineRow(row)).length;
  const offline = Math.max(total - online, 0);

  const alarmTypes = groupByCount(alerts.map((alert) => labelForAlertType(alert))).slice(0, 10);
  const alarmByDevice = groupByCount(alerts.map((alert) => labelForAlertDevice(alert)));
  const deviceExceptions = alarmByDevice.slice(0, 5);
  const alarmCountByDevice = alarmByDevice.slice(0, 10);

  const dayKeys = getLastNDates(8);
  const alarmTrendByDay = new Map(dayKeys.map((day) => [day, 0]));
  for (const alert of alerts) {
    const stamp = createdAtForAlert(alert);
    const ms = toMs(stamp);
    if (!Number.isFinite(ms)) continue;
    const day = new Date(ms).toISOString().slice(0, 10);
    if (alarmTrendByDay.has(day)) {
      alarmTrendByDay.set(day, (alarmTrendByDay.get(day) ?? 0) + 1);
    }
  }

  const onlineTrendByDay = new Map<string, Set<string>>();
  for (const day of dayKeys) onlineTrendByDay.set(day, new Set());
  for (const event of history) {
    const ms = toMs(event.createdAt);
    if (!Number.isFinite(ms)) continue;
    const day = new Date(ms).toISOString().slice(0, 10);
    const key = deviceKeyForEvent(event);
    if (!key) continue;
    if (!onlineTrendByDay.has(day)) continue;
    onlineTrendByDay.get(day)?.add(key);
  }

  const alarmTrend = dayKeys.map((day) => ({ label: formatShortDate(day), value: alarmTrendByDay.get(day) ?? 0 }));
  const onlineTrend = dayKeys.map((day) => ({ label: formatShortDate(day), value: onlineTrendByDay.get(day)?.size ?? 0 }));

  const workSecondsByDevice = new Map<string, number>();
  const orderedHistory = [...history].sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
  const prevByDevice = new Map<string, { ms: number; moving: boolean }>();
  for (const event of orderedHistory) {
    const key = deviceKeyForEvent(event);
    const ms = toMs(event.createdAt);
    if (!key || !Number.isFinite(ms)) continue;
    const movement = movementForEvent(event);
    const speed = toNumber(event.data?.speed);
    const moving = movement === "moving" || speed > 0;

    const prev = prevByDevice.get(key);
    if (prev && prev.moving) {
      const deltaSec = Math.max(0, (ms - prev.ms) / 1000);
      const clamped = Math.min(deltaSec, 30 * 60);
      workSecondsByDevice.set(key, (workSecondsByDevice.get(key) ?? 0) + clamped);
    }
    prevByDevice.set(key, { ms, moving });
  }

  const deviceLabelByKey = new Map<string, string>();
  for (const row of devices) {
    const key = pickDeviceKey(row);
    if (!key) continue;
    deviceLabelByKey.set(key, pickDeviceLabel(row));
  }

  const workTime = Array.from(workSecondsByDevice.entries())
    .map(([key, seconds]) => ({
      label: deviceLabelByKey.get(key) ?? key.replace(/^[^:]+:/, ""),
      value: Math.max(1, Math.round((seconds / 3600) * 10) / 10)
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  if (!workTime.length) {
    const fallback = devices
      .map((row) => ({
        label: pickDeviceLabel(row),
        value: toNumber((row as Record<string, unknown>).engineHours)
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    workTime.push(...fallback);
  }

  return {
    total,
    online,
    offline,
    onlineRate: percentage(online, total),
    offlineRate: percentage(offline, total),
    alarmTypes,
    deviceExceptions,
    alarmCountByDevice,
    workTime,
    alarmTrend,
    onlineTrend
  };
};

export default function VideoTelematicsDashboard() {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<DashboardRecord[]>([]);
  const [cameras, setCameras] = useState<DashboardRecord[]>([]);
  const [alerts, setAlerts] = useState<DashboardRecord[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);

  // ── Editable date range ──────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(() =>
    localStorage.getItem(storageKey("dateFrom")) ?? weekAgoStr()
  );
  const [dateTo, setDateTo] = useState(() =>
    localStorage.getItem(storageKey("dateTo")) ?? todayStr()
  );
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<VideoDatePickerTarget>("from");
  const [datePickerValue, setDatePickerValue] = useState(() => new Date());
  const [datePickerMode, setDatePickerMode] = useState<"date" | "time">("date");
  const prevDateFrom = useRef(dateFrom);
  const prevDateTo = useRef(dateTo);
  useEffect(() => {
    if (dateFrom !== prevDateFrom.current) {
      localStorage.setItem(storageKey("dateFrom"), dateFrom);
      prevDateFrom.current = dateFrom;
    }
  }, [dateFrom]);
  useEffect(() => {
    if (dateTo !== prevDateTo.current) {
      localStorage.setItem(storageKey("dateTo"), dateTo);
      prevDateTo.current = dateTo;
    }
  }, [dateTo]);

  const openVideoDatePicker = (target: VideoDatePickerTarget) => {
    const source = target === "from" ? dateFrom : dateTo;
    const parsed = new Date(`${source}T00:00:00.000`);
    setDatePickerTarget(target);
    setDatePickerValue(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
    setDatePickerMode("date");
    setShowDatePickerModal(true);
  };

  const applyVideoDatePicker = () => {
    const next = datePickerValue.toISOString().slice(0, 10);
    if (datePickerTarget === "from") {
      setDateFrom(next > dateTo ? dateTo : next);
    } else {
      setDateTo(next < dateFrom ? dateFrom : next);
    }
    setShowDatePickerModal(false);
  };

  // ── Notification selector (per-account) ─────────────────────────────────
  const [enabledNotifs, setEnabledNotifs] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey("enabledNotifs"));
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    return new Set(DEFAULT_ENABLED_NOTIFICATIONS);
  });
  const [showNotifSelector, setShowNotifSelector] = useState(false);

  const saveNotifs = (next: Set<string>) => {
    setEnabledNotifs(next);
    try { localStorage.setItem(storageKey("enabledNotifs"), JSON.stringify([...next])); } catch { /* ignore */ }
  };

  // ── Container prefs ──────────────────────────────────────────────────────
  const [prefs, setPrefs] = useState<ContainerPrefs>(() => {
    try {
      const raw = localStorage.getItem(storageKey("containerPrefs"));
      if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ContainerPrefs>) };
    } catch { /* ignore */ }
    return DEFAULT_PREFS;
  });
  const [showPrefsModal, setShowPrefsModal] = useState(false);

  const savePrefs = (next: ContainerPrefs) => {
    setPrefs(next);
    try { localStorage.setItem(storageKey("containerPrefs"), JSON.stringify(next)); } catch { /* ignore */ }
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const from = new Date(`${dateFrom}T00:00:00`);
      const to = new Date(`${dateTo}T23:59:59`);
      const rangeFrom = Number.isNaN(from.getTime()) ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : from;
      const rangeTo = Number.isNaN(to.getTime()) ? new Date() : to;

      const cms = await loadCms808DashboardRecords(rangeFrom, rangeTo)      .catch(() => ({ vehicles: [], devices: [], alarms: [], history: [] }));
      if (cancelled) return;
            const cmsHistory = (Array.isArray(cms.history) ? cms.history : []) as HistoryEvent[];
            const cmsDevices = Array.isArray(cms.devices) ? cms.devices : [];
      const cmsAlarms = Array.isArray(cms.alarms) ? cms.alarms : [];
      if (cmsDevices.length) {
        setAssets((current) => [...cmsDevices, ...current.filter((row) => !isCms808LiveAsset(row))]);
        setCameras((current) => [...cmsDevices, ...current.filter((row) => !isCms808LiveAsset(row))]);
        setAlerts((current) => [...cmsAlarms, ...current.filter((row) => !String(row.imei || row.cameraSerial || "").match(/^\d{6,}$/))]);
        setHistory((current) => (current.length ? current : cmsHistory));
        setLoading(false);
      }

      const [assetRows, cameraRows, alertRows, historyRows] = await Promise.all([
        getAssetsFromApi<DashboardRecord>().catch(() => []),
        getCamerasFromApi<DashboardRecord>().catch(() => []),
        getAlertsFromApi<DashboardRecord>().catch(() => []),
        fetchTelemetryHistory()
      ]);
      if (cancelled) return;
      setAssets([
        ...cmsDevices,
        ...(Array.isArray(assetRows) ? assetRows : []).filter((row) => !isCms808LiveAsset(row))
      ]);
      setCameras([
        ...cmsDevices,
        ...(Array.isArray(cameraRows) ? cameraRows : []).filter((row) => !isCms808LiveAsset(row))
      ]);
      setAlerts([...(Array.isArray(alertRows) ? alertRows : []), ...cmsAlarms]);
      setHistory([...(Array.isArray(historyRows) ? historyRows : []), ...cmsHistory]);
      setLoading(false);
    };

    void load();
    const refresh = window.setInterval(() => void load(), 60_000);
    const handleOrgChange = () => void load();
    window.addEventListener("vivi:orgchange", handleOrgChange);
    window.addEventListener("vivi:contextchange", handleOrgChange);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
      window.removeEventListener("vivi:orgchange", handleOrgChange);
      window.removeEventListener("vivi:contextchange", handleOrgChange);
    };
  }, [dateFrom, dateTo]);

  const data = useMemo(() => {
    if (loading && assets.length === 0 && cameras.length === 0 && alerts.length === 0) {
      return fallbackDashboardData();
    }
    return deriveDashboardData(assets, cameras, alerts, history);
  }, [assets, cameras, alerts, history, loading]);

  const stats = useMemo(
    () => [
      { label: "Online Devices", value: String(data.online), tone: "green", icon: "📶" },
      { label: "Offline Devices", value: String(data.offline), tone: "amber", icon: "📴" },
      { label: "Online Rate", value: `${data.onlineRate}%`, tone: "blue", icon: "📈" },
      { label: "Offline Rate", value: `${data.offlineRate}%`, tone: "purple", icon: "📉" }
    ],
    [data.offline, data.offlineRate, data.online, data.onlineRate]
  );

  // Apply notification filter and top-N prefs to the derived data
  const filteredAlarmTypes = useMemo(
    () => data.alarmTypes.filter(item => enabledNotifs.has(item.label)).slice(0, prefs.notifTopN),
    [data.alarmTypes, enabledNotifs, prefs.notifTopN]
  );
  const filteredDevExc = useMemo(
    () => data.deviceExceptions.slice(0, prefs.devsTopN),
    [data.deviceExceptions, prefs.devsTopN]
  );
  const filteredAlarmCountByDevice = useMemo(
    () => data.alarmCountByDevice.slice(0, prefs.notifTopN),
    [data.alarmCountByDevice, prefs.notifTopN]
  );
  const filteredWorkTime = useMemo(
    () => data.workTime.slice(0, prefs.workTimeTopN),
    [data.workTime, prefs.workTimeTopN]
  );

  const alarmMax = Math.max(1, ...filteredDevExc.map((item) => item.value));
  const workMax = Math.max(1, ...filteredWorkTime.map((item) => item.value));
  const alarmTypeTotal = filteredAlarmTypes.reduce((sum, item) => sum + item.value, 0);
  const alarmByDeviceTotal = filteredAlarmCountByDevice.reduce((sum, item) => sum + item.value, 0);
  const alarmDonutPct = `${Math.max(6, Math.min(100, Math.round((alarmTypeTotal / Math.max(data.total, 1)) * 100)))}%`;
  const alarmDeviceDonutPct = `${Math.max(6, Math.min(100, Math.round((alarmByDeviceTotal / Math.max(data.total, 1)) * 100)))}%`;

  const notifTrendValues = data.alarmTrend.map((item) => item.value);
  const onlineTrendValues = data.onlineTrend.map((item) => item.value);
  const notifTrendPath = computeLinePath(notifTrendValues);
  const onlineTrendPath = computeLinePath(onlineTrendValues);

  const dateRangeLabel = `${dateFrom} — ${dateTo}`;

  const timeLabel = now.toLocaleTimeString(undefined, { hour12: false });
  const fullDateLabel = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long"
  });

  return (
    <div className="page video-telematicss-page">
      {showNotifSelector && (
        <NotifSelectorModal
          enabled={enabledNotifs}
          onSave={saveNotifs}
          onClose={() => setShowNotifSelector(false)}
        />
      )}
      {showPrefsModal && (
        <ContainerPrefsModal
          prefs={prefs}
          onSave={savePrefs}
          onClose={() => setShowPrefsModal(false)}
        />
      )}
      <div className="vt-dashboard">
        <ScheduleDateTimePicker
          open={showDatePickerModal}
          showTime={false}
          restrictToPast
          title={datePickerTarget === "from" ? "Select start date" : "Select end date"}
          date={datePickerValue}
          time="00:00"
          mode={datePickerMode}
          onClose={() => setShowDatePickerModal(false)}
          onConfirm={applyVideoDatePicker}
          onDateChange={setDatePickerValue}
          onTimeChange={() => undefined}
          onModeChange={setDatePickerMode}
        />
        <header className="vt-header">
          <div className="vt-header-left">
            <div className="vt-date-range">
              <button
                type="button"
                className="vt-date-button"
                onClick={() => openVideoDatePicker("from")}
                aria-label="From date"
              >
                {dateFrom}
              </button>
              <span className="vt-date-sep">To</span>
              <button
                type="button"
                className="vt-date-button"
                onClick={() => openVideoDatePicker("to")}
                aria-label="To date"
              >
                {dateTo}
              </button>
            </div>
            <div className="vt-quick-links">
              <button
                className="vt-quick-link"
                type="button"
                onClick={() => navigate("/Track/videos/video-gallery")}
              >
                Video gallery
              </button>
              <button
                className="vt-quick-link"
                type="button"
                onClick={() => navigate("/Track/videos/live-video-streaming")}
              >
                Live video streaming
              </button>
              <button
                className="vt-quick-link"
                type="button"
                onClick={() => navigate("/Track/videos/device-remote-actions")}
              >
                Device Remote Actions
              </button>
              <button
                className="vt-quick-link vt-customize-btn"
                type="button"
                onClick={() => setShowPrefsModal(true)}
                title="Customise dashboard containers"
              >
                ⚙ Customise
              </button>
            </div>
          </div>
          <div className="vt-title">Vehicle Viewer</div>
          <div className="vt-clock">
            <div className="vt-time">{timeLabel}</div>
            <div className="vt-date">{fullDateLabel}</div>
          </div>
        </header>

        <section className="vt-stats">
          {stats.map((stat) => (
            <div key={stat.label} className="vt-stat-card">
              <div className={`vt-stat-icon ${stat.tone}`} aria-hidden="true">
                {stat.icon}
              </div>
              <div>
                <div className="vt-stat-label">{stat.label}</div>
                <div className="vt-stat-value">{stat.value}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="vt-grid">
          {/* Left column */}
          <div className="vt-col">
            <div className="vt-card">
              <div className="vt-card-title">
                Notification Type Statistics Top {prefs.notifTopN}
                <button
                  className="vt-card-action-btn"
                  onClick={() => setShowNotifSelector(true)}
                  title="Select which notifications to show"
                  type="button"
                >
                  ☰ Select
                </button>
              </div>
              {filteredAlarmTypes.length === 0 ? (
                <div className="vt-empty-state">No notification types selected.<br />Click "Select" to choose.</div>
              ) : (
                <div className="vt-donut-shell">
                  <div className="vt-donut" style={{ "--pct": alarmDonutPct } as CSSProperties} />
                </div>
              )}
            </div>
            <div className="vt-card">
              <div className="vt-card-title">Top {prefs.devsTopN} Devices Exception</div>
              <div className="vt-bar-chart">
                {filteredDevExc.map((item) => (
                  <div key={item.label} className="vt-bar-col">
                    <div
                      className="vt-bar"
                      style={{ height: `${Math.max((item.value / alarmMax) * 100, 6)}%` }}
                      title={`${item.value}`}
                    />
                    <span>{item.label.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Centre column */}
          <div className="vt-col vt-col-wide">
            <div className="vt-card">
              <div className="vt-card-title">Devices Notification Trend</div>
              <div className="vt-line-chart vt-line-chart-alarm">
                {prefs.trendChart === "line" ? (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polygon className="vt-line-area" points={notifTrendPath.area} />
                    <polyline className="vt-line-main" points={notifTrendPath.line} />
                  </svg>
                ) : (
                  <div className="vt-bar-chart vt-bar-chart-trend">
                    {notifTrendValues.map((v, i) => {
                      const max = Math.max(...notifTrendValues, 1);
                      return (
                        <div key={i} className="vt-bar-col">
                          <div className="vt-bar" style={{ height: `${Math.max((v / max) * 100, 4)}%` }} />
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="vt-line-grid" />
                <div className="vt-line-axis">{dateRangeLabel}</div>
                {prefs.trendChart === "line" && (
                  <div className="vt-line-ticks">
                    {data.alarmTrend.map((point) => (
                      <span key={`notif-${point.label}`}>{point.label}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="vt-card">
              <div className="vt-card-title">Devices Online Trend</div>
              <div className="vt-line-chart">
                {prefs.trendChart === "line" ? (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polygon className="vt-line-area vt-line-area-alt" points={onlineTrendPath.area} />
                    <polyline className="vt-line-main vt-line-main-alt" points={onlineTrendPath.line} />
                  </svg>
                ) : (
                  <div className="vt-bar-chart vt-bar-chart-trend">
                    {onlineTrendValues.map((v, i) => {
                      const max = Math.max(...onlineTrendValues, 1);
                      return (
                        <div key={i} className="vt-bar-col">
                          <div className="vt-bar vt-bar-alt" style={{ height: `${Math.max((v / max) * 100, 4)}%` }} />
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="vt-line-grid" />
                <div className="vt-line-axis">{dateRangeLabel}</div>
                {prefs.trendChart === "line" && (
                  <div className="vt-line-ticks">
                    {data.onlineTrend.map((point) => (
                      <span key={`online-${point.label}`}>{point.label}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="vt-col">
            <div className="vt-card">
              <div className="vt-card-title">
                Device Notification Count Top {prefs.notifTopN}
                <button
                  className="vt-card-action-btn"
                  onClick={() => setShowNotifSelector(true)}
                  title="Select which notifications to show"
                  type="button"
                >
                  ☰ Select
                </button>
              </div>
              {filteredAlarmCountByDevice.length === 0 ? (
                <div className="vt-empty-state">No notification types selected.</div>
              ) : (
                <div className="vt-donut-shell">
                  <div className="vt-donut" style={{ "--pct": alarmDeviceDonutPct } as CSSProperties} />
                </div>
              )}
            </div>
            <div className="vt-card">
              <div className="vt-card-title">Device Work Time Top {prefs.workTimeTopN}</div>
              <div className="vt-bar-chart">
                {filteredWorkTime.map((item) => (
                  <div key={item.label} className="vt-bar-col">
                    <div
                      className="vt-bar vt-bar-alt"
                      style={{ height: `${Math.max((item.value / workMax) * 100, 6)}%` }}
                      title={`${item.value} h`}
                    />
                    <span>{item.label.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>


        <div className="vt-footer">
          {loading ? "Loading live dashboard..." : "Live dashboard refreshed every 60s."} · Total: {data.total} · Online: {data.online} · Offline: {data.offline}
        </div>
      </div>
    </div>
  );
}
