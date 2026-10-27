import "../index.css";
import "./HomeDashboard.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScheduleDateTimePicker from "../components/ScheduleDateTimePicker";
import { canForPath } from "../utils/api";
import {
  homeRangeFromPreset,
  persistHomeDates,
  readCachedHomeDashboardModel,
  readLatestHomeDashboardModel,
  readHomeDashboardDateQuery,
  readPersistedHomeDates,
  writeCachedHomeDashboardModel,
  type HomeFuelSource,
  type HomeActivitySection,
  type HomeLiveSection,
  type HomeMetricsSection,
  type HomeOperationsSection,
  type HomePerformanceSection,
  type HomeStatusCounts
} from "../utils/homeDashboardApi";
import { fetchHomeLiveFromTracking, peekHomeLiveFromCache } from "../utils/homeLiveSnapshot";
import { fetchHomeFuelFromComparativeReport } from "../utils/homeFuelMetrics";
import { fetchHomeTripMetrics } from "../utils/homeRangeMetrics";
import { fetchHomeAlertMetrics } from "../utils/homeAlertMetrics";
import { readHomeSiteScope } from "../utils/homeSiteScope";

type LiveStatus = keyof HomeStatusCounts;

type DayPoint = { label: string; value: number };

type RankRow = { name: string; sub: string; value: number; ratio: number };

type DashboardModel = HomeLiveSection &
  HomeMetricsSection &
  HomePerformanceSection &
  HomeOperationsSection &
  HomeActivitySection & {
    alertsConfigured: boolean;
    fuelSource: HomeFuelSource;
  };

const datePresets = ["Today", "Yesterday", "This Week", "Last 7 Days", "This Month", "Last 30 Days", "Custom"] as const;
type DatePreset = (typeof datePresets)[number];
type DatePickerTarget = "from" | "to";

const STATUS_COLORS: Record<LiveStatus, string> = {
  moving: "#22c55e",
  stopped: "#f59e0b",
  idle: "#64748b",
  offline: "#475569"
};

const STATUS_LABELS: Record<LiveStatus, string> = {
  moving: "Moving",
  stopped: "Stopped",
  // Last fix older than 30 min (Live Tracking calls this "Old Information").
  idle: "No recent data",
  offline: "Offline"
};

const emptyStatusCounts = (): HomeStatusCounts => ({ moving: 0, stopped: 0, idle: 0, offline: 0 });

const formatNumber = (value: number, digits = 0): string =>
  value.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "0h 0m";
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
};

const localIsoDay = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const isoDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return localIsoDay(d);
};

const formatRangeLabel = (fromDate: string, toDate: string): string => {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "Last 7 days";
  const fromLabel = from.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const toLabel = to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fromLabel} - ${toLabel}`;
};

type ChartPoint = { x: number; y: number };

/** Catmull-Rom -> cubic bezier smoothing for nice connected curves. */
const buildSmoothPath = (pts: ChartPoint[]): string => {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
};

/** Line chart with area fill + connecting dots (matches dashboard reference design). */
function LineChart({ series, unit, color = "#22c55e" }: { series: DayPoint[]; unit: string; color?: string }) {
  const max = Math.max(...series.map((point) => point.value), 1);
  const peak = series.reduce((best, point) => (point.value > best.value ? point : best), series[0] ?? { label: "", value: 0 });
  const count = series.length;
  const padX = 4;
  const padTop = 16;
  const padBottom = 14;
  const coords = series.map((point, index) => {
    const x = count > 1 ? padX + (index / (count - 1)) * (100 - padX * 2) : 50;
    const y = padTop + (1 - point.value / max) * (100 - padTop - padBottom);
    return { x, y, point };
  });
  const linePath = buildSmoothPath(coords.map((c) => ({ x: c.x, y: c.y })));
  const baseline = 100 - padBottom;
  const areaPath =
    linePath && coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${baseline} L ${coords[0].x.toFixed(2)} ${baseline} Z`
      : "";
  const gradId = `viv-line-${unit.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <>
      <div className="viv-chart-peak">
        Peak <b>{formatNumber(peak?.value ?? 0)} {unit}</b> | {peak?.label}
      </div>
      <div className="viv-linechart">
        <svg className="viv-linechart-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`${color}55`} />
              <stop offset="100%" stopColor={`${color}05`} />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />}
          {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        </svg>
        {coords.map((c, index) => (
          <span
            key={`${c.point.label}-${index}`}
            className="viv-line-dot"
            style={{ left: `${c.x}%`, top: `${c.y}%`, borderColor: color }}
            title={`${formatNumber(c.point.value)} ${unit} | ${c.point.label}`}
          />
        ))}
      </div>
      <div className="viv-line-labels">
        {series.map((point, index) => (
          <span key={`${point.label}-${index}`}>{point.label}</span>
        ))}
      </div>
    </>
  );
}

function BarChart({ series, unit, amber }: { series: DayPoint[]; unit: string; amber?: boolean }) {
  const max = Math.max(...series.map((point) => point.value), 1);
  const peak = series.reduce((best, point) => (point.value > best.value ? point : best), series[0] ?? { label: "", value: 0 });
  const barAreaPx = 124;
  return (
    <>
      <div className="viv-chart-peak">
        Peak <b>{formatNumber(peak?.value ?? 0, unit === "L" || unit === "km" ? 0 : 0)} {unit}</b> | {peak?.label}
      </div>
      <div className="viv-bars">
        {series.map((point, index) => (
          <div className="viv-bar-col" key={`${point.label}-${index}`}>
            <div className="viv-bar-track">
              <div
                className={`viv-bar-fill ${amber ? "viv-bar-amber" : ""}`}
                style={{ height: `${Math.max(4, (point.value / max) * barAreaPx)}px` }}
                title={`${formatNumber(point.value)} ${unit}`}
              />
            </div>
            <span className="viv-bar-label">{point.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function AreaChart({ series }: { series: DayPoint[] }) {
  const width = 100;
  const height = 150;
  const max = Math.max(...series.map((point) => point.value), 100);
  const pad = 6;
  const step = series.length > 1 ? (width - pad * 2) / (series.length - 1) : 0;
  const points = series.map((point, index) => {
    const x = pad + step * index;
    const y = height - pad - (point.value / max) * (height - pad * 2);
    return { x, y, point };
  });
  const line = buildSmoothPath(points.map((p) => ({ x: p.x, y: p.y })));
  const area = line
    ? `${line} L${(points[points.length - 1]?.x ?? pad).toFixed(1)},${height - pad} L${(points[0]?.x ?? pad).toFixed(1)},${height - pad} Z`
    : "";
  return (
    <svg className="viv-area" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="vivUtilFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(34,197,94,0.45)" />
          <stop offset="100%" stopColor="rgba(34,197,94,0.02)" />
        </linearGradient>
      </defs>
      {points.length > 0 && <path d={area} fill="url(#vivUtilFill)" stroke="none" />}
      {points.length > 0 && <path d={line} fill="none" stroke="#22c55e" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

function Donut({ counts, total }: { counts: HomeStatusCounts; total: number }) {
  const order: LiveStatus[] = ["moving", "stopped", "idle", "offline"];
  const safeTotal = total > 0 ? total : 1;
  let acc = 0;
  const stops = order.map((status) => {
    const start = (acc / safeTotal) * 360;
    acc += counts[status];
    const end = (acc / safeTotal) * 360;
    return `${STATUS_COLORS[status]} ${start}deg ${end}deg`;
  });
  const background = total > 0 ? `conic-gradient(${stops.join(", ")})` : `conic-gradient(${STATUS_COLORS.offline} 0deg 360deg)`;
  return (
    <div className="viv-donut-wrap">
      <div className="viv-donut" style={{ background }}>
        <div className="viv-donut-hole">
          <div>
            <b>{formatNumber(total)}</b>
            <span>Total</span>
          </div>
        </div>
      </div>
      <div className="viv-legend">
        {order.map((status) => {
          const pct = total > 0 ? Math.round((counts[status] / total) * 100) : 0;
          return (
            <div className="viv-legend-item" key={status}>
              <span className="viv-dot" style={{ background: STATUS_COLORS[status] }} />
              {STATUS_LABELS[status]}
              <span className="viv-legend-val">
                {formatNumber(counts[status])} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
  series,
  color,
  sub,
  period
}: {
  value: string;
  label: string;
  series: DayPoint[];
  color: string;
  sub?: string;
  /** The selected range, e.g. "Last 7 Days". */
  period: string;
}) {
  const max = Math.max(...series.map((point) => point.value), 1);
  const count = series.length;
  const padX = 3;
  const padTop = 18;
  const padBottom = 14;
  const coords = series.map((point, index) => {
    const x = count > 1 ? padX + (index / (count - 1)) * (100 - padX * 2) : 50;
    const y = padTop + (1 - point.value / max) * (100 - padTop - padBottom);
    return { x, y, point };
  });
  const path = buildSmoothPath(coords.map((c) => ({ x: c.x, y: c.y })));
  const baseline = 100 - padBottom;
  const areaPath =
    path && coords.length > 0
      ? `${path} L${coords[coords.length - 1].x.toFixed(2)},${baseline} L${coords[0].x.toFixed(2)},${baseline} Z`
      : "";
  const gradId = `viv-spark-${label.replace(/\s+/g, "")}`;
  const hasData = series.some((point) => point.value > 0);
  return (
    <div className="viv-panel">
      <div className="viv-stat-top">
        <span className="viv-stat-value">{value}</span>
      </div>
      <div className="viv-stat-label">{`${label} | ${sub ?? period}`}</div>
      <div className="viv-spark-wrap">
        <svg className="viv-spark" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`${color}55`} />
              <stop offset="100%" stopColor={`${color}05`} />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />}
          {path && <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        </svg>
        {hasData &&
          coords.map((c, index) => (
            <span
              key={`${c.point.label}-${index}`}
              className="viv-spark-dot"
              style={{ left: `${c.x}%`, top: `${c.y}%`, borderColor: color }}
              title={`${c.point.label}`}
            />
          ))}
      </div>
    </div>
  );
}

function StandingTimePanel({
  model,
  loading
}: {
  model: Partial<DashboardModel> | null;
  loading: boolean;
}) {
  return (
    <div className="viv-standing">
      <div className="viv-standing-summary">
        <div className="viv-standing-stat">
          <span className="viv-standing-label">Total standing</span>
          <strong>{formatDuration(model?.standingMs ?? 0)}</strong>
        </div>
        <div className="viv-standing-stat">
          <span className="viv-standing-label">Total driving</span>
          <strong>{formatDuration(model?.drivingMs ?? 0)}</strong>
        </div>
        <div className="viv-standing-stat">
          <span className="viv-standing-label">Standing share</span>
          <strong>{formatNumber(model?.standingPct ?? 0)}%</strong>
        </div>
      </div>

      {model?.standingSeries?.some((point) => point.value > 0) ? (
        <BarChart series={model.standingSeries ?? []} unit="h" amber />
      ) : (
        <div className="viv-map-empty viv-standing-empty">
          {loading ? "Calculating standing time…" : "No standing time data in the selected range."}
        </div>
      )}

      {model?.topStandingAssets && model.topStandingAssets.length > 0 ? (
        <div className="viv-list viv-standing-list">
          {model.topStandingAssets.map((asset) => (
            <div className="viv-list-item" key={asset.name}>
              <div className="viv-list-main">
                <div className="viv-list-name">{asset.name}</div>
                <div className="viv-list-sub">{asset.sub}</div>
                <div className="viv-progress">
                  <span style={{ width: `${Math.max(6, asset.ratio * 100)}%`, background: "var(--viv-amber)" }} />
                </div>
              </div>
              <span className="viv-list-val">{formatNumber(asset.value, 1)} h</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const kpiIcon = (path: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

const hasFleetPaint = (snapshot: Partial<DashboardModel> | null | undefined) =>
  Boolean(snapshot && ((snapshot.totalVehicles ?? 0) > 0 || (snapshot.totalDistanceKm ?? 0) > 0));

const hasMetricsPaint = (snapshot: Partial<DashboardModel> | null | undefined) =>
  Array.isArray(snapshot?.distanceSeries);

const readInstantHomeModel = (fromDate: string, toDate: string): Partial<DashboardModel> => {
  const scope = readHomeSiteScope();
  if (!scope.ready) return {};
  const cached = readCachedHomeDashboardModel<Partial<DashboardModel>>({
    fromDate,
    toDate,
    scopedSites: scope.scopedSites
  });
  if (cached && (hasFleetPaint(cached) || hasMetricsPaint(cached))) return cached;
  const latest = readLatestHomeDashboardModel<Partial<DashboardModel>>({ fromDate, toDate, scopedSites: scope.scopedSites });
  if (latest && (hasFleetPaint(latest) || hasMetricsPaint(latest))) return latest;
  return peekHomeLiveFromCache() ?? {};
};

export function Home() {
  const navigate = useNavigate();
  const pageLink = (path: string, label: string, className = "viv-link") =>
    canForPath(path, "view") ? (
      <button type="button" className={className} onClick={() => navigate(path)}>
        {label}
      </button>
    ) : null;
  const persisted = readPersistedHomeDates();
  // Presets are recomputed for today; only a Custom range keeps its saved dates.
  const defaultRange = readHomeDashboardDateQuery();
  const [datePreset, setDatePreset] = useState<DatePreset>(
    (persisted.datePreset as DatePreset) || "Last 7 Days"
  );
  const [fromDate, setFromDate] = useState(defaultRange.fromDate);
  const [toDate, setToDate] = useState(defaultRange.toDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget>("from");
  const [datePickerValue, setDatePickerValue] = useState(() => new Date());
  const [siteScope, setSiteScope] = useState(readHomeSiteScope);
  const [model, setModel] = useState<Partial<DashboardModel>>(() => readInstantHomeModel(defaultRange.fromDate, defaultRange.toDate));
  const [loadingLive, setLoadingLive] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(() => {
    const scope = readHomeSiteScope();
    if (!scope.ready) return false;
    // A stale snapshot is painted, but its numbers are still being refreshed.
    return !hasMetricsPaint(readCachedHomeDashboardModel<Partial<DashboardModel>>({
      fromDate: defaultRange.fromDate,
      toDate: defaultRange.toDate,
      scopedSites: scope.scopedSites
    }));
  });
  const [error, setError] = useState("");
  const [incomplete, setIncomplete] = useState("");
  const requestRef = useRef(0);
  const datesRef = useRef({ fromDate, toDate });
  datesRef.current = { fromDate, toDate };
  const skipPresetOnMount = useRef(true);

  useEffect(() => {
    if (skipPresetOnMount.current) {
      skipPresetOnMount.current = false;
      return;
    }
    if (datePreset === "Custom") return;
    const range = homeRangeFromPreset(datePreset);
    setFromDate(range.fromDate);
    setToDate(range.toDate);
  }, [datePreset]);

  useEffect(() => {
    persistHomeDates(datePreset, fromDate, toDate);
  }, [datePreset, fromDate, toDate]);

  const openDatePicker = (target: DatePickerTarget) => {
    const source = target === "from" ? fromDate : toDate;
    const parsed = new Date(`${source}T00:00:00`);
    setDatePickerTarget(target);
    setDatePickerValue(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
    setDatePreset("Custom");
    setShowDatePicker(true);
  };

  const applyDatePicker = () => {
    const value = isoDay(datePickerValue);
    if (datePickerTarget === "from") setFromDate(value);
    else setToDate(value);
    setDatePreset("Custom");
    setShowDatePicker(false);
  };

  const loadSections = useCallback(async () => {
    const scope = readHomeSiteScope();
    setSiteScope(scope);
    if (!scope.ready) {
      setModel({});
      setLoadingLive(false);
      setLoadingMetrics(false);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setError("");
    setIncomplete("");
    const still = () => requestRef.current === requestId;
    const failedParts: string[] = [];
    const reportIncomplete = () => {
      if (still()) setIncomplete(failedParts.join("; "));
    };

    const query = { fromDate, toDate, scopedSites: scope.scopedSites };
    const cachedModel = readCachedHomeDashboardModel<Partial<DashboardModel>>(query);
    if (hasMetricsPaint(cachedModel) && cachedModel) {
      setModel(cachedModel);
      setLoadingLive(false);
      setLoadingMetrics(false);
    } else {
      const latest = readLatestHomeDashboardModel<Partial<DashboardModel>>(query);
      const peeked = peekHomeLiveFromCache();
      const fleet = hasFleetPaint(cachedModel) ? cachedModel : peeked;
      if (latest && hasMetricsPaint(latest)) {
        // Instant paint from the last snapshot for this site; fresh numbers replace it below.
        setModel({ ...latest, ...(fleet ? { totalVehicles: fleet.totalVehicles, statusCounts: fleet.statusCounts } : {}) });
        setLoadingLive(false);
      } else if (fleet) {
        setModel({
          totalVehicles: fleet.totalVehicles,
          statusCounts: fleet.statusCounts
        });
        setLoadingLive(false);
      } else {
        setModel({});
        setLoadingLive(true);
      }
      setLoadingMetrics(true);
    }

    // Paint each container from its own source. Live counts must not wait on
    // trip, fuel, or standing reports — that left the whole page at zero.
    const livePromise = fetchHomeLiveFromTracking();
    const tripPromise = fetchHomeTripMetrics(fromDate, toDate);
    const alertPromise = fetchHomeAlertMetrics(fromDate, toDate);

    try {
      const live = await livePromise;
      if (!still()) return;
      setModel((prev) => {
        const next = { ...prev, ...live };
        writeCachedHomeDashboardModel(
          { fromDate, toDate, scopedSites: readHomeSiteScope().scopedSites },
          next
        );
        return next;
      });
    } catch {
      if (still()) setError("Unable to load live fleet status.");
    } finally {
      if (still()) setLoadingLive(false);
    }

    let tripFuelL = 0;
    let tripDistanceKm = 0;
    try {
      const [trips, alertMetrics] = await Promise.all([tripPromise, alertPromise]);
      if (!still()) return;
      tripFuelL = trips.totalFuelL;
      tripDistanceKm = trips.totalDistanceKm;
      if (trips.failedDevices > 0) {
        failedParts.push(`trips for ${trips.failedDevices} vehicle${trips.failedDevices === 1 ? "" : "s"} did not load`);
      }
      if (alertMetrics.partial) failedParts.push("some alert events did not load");
      reportIncomplete();
      setModel((prev) => {
        const totalDistanceKm = trips.totalDistanceKm;
        const totalFuelL = trips.totalFuelL;
        const next = {
          ...prev,
          ...trips,
          fuelSource: "trips" as HomeFuelSource,
          totalVehicles: prev.totalVehicles,
          statusCounts: prev.statusCounts,
          liveStale: prev.liveStale,
          avgEfficiency: totalFuelL > 0 ? totalDistanceKm / totalFuelL : 0,
          alertsConfigured: alertMetrics?.alertsConfigured ?? false,
          geofenceEvents: alertMetrics?.geofenceAlerts ?? 0,
          geofenceSeries: alertMetrics?.geofenceSeries ?? [],
          alerts: alertMetrics?.totalAlerts ?? 0,
          alertsSeries: alertMetrics?.alertsSeries ?? []
        };
        writeCachedHomeDashboardModel(query, next);
        return next;
      });
    } catch {
      if (still()) setError("Unable to load dashboard metrics.");
    } finally {
      if (still()) setLoadingMetrics(false);
    }

    // Comparative fuel (tank trend / route) and summary engine hours refine fuel
    // and idle time. They must not block the other containers.
    if (tripDistanceKm > 0) {
      void fetchHomeFuelFromComparativeReport(fromDate, toDate).then((fuel) => {
        if (!still() || !fuel) return;
        if (fuel.failedDevices > 0) {
          failedParts.push(`fuel for ${fuel.failedDevices} vehicle${fuel.failedDevices === 1 ? "" : "s"} did not load`);
          reportIncomplete();
        }
        setModel((prev) => {
          const totalDistanceKm = prev.totalDistanceKm ?? tripDistanceKm;
          const totalFuelL = fuel.totalFuelL > 0 ? fuel.totalFuelL : (prev.totalFuelL ?? tripFuelL);
          const next = {
            ...prev,
            totalFuelL,
            fuelSource: (fuel.totalFuelL > 0 ? "comparative" : (prev.fuelSource ?? "trips")) as HomeFuelSource,
            fuelSeries: fuel.totalFuelL > 0 ? fuel.fuelSeries : (prev.fuelSeries ?? []),
            avgEfficiency: totalFuelL > 0 ? totalDistanceKm / totalFuelL : 0,
            idleMs: fuel.idleMs > 0 ? fuel.idleMs : (prev.idleMs ?? 0)
          };
          writeCachedHomeDashboardModel(query, next);
          return next;
        });
      }).catch(() => {
        if (!still()) return;
        failedParts.push("fuel report did not load");
        reportIncomplete();
      });
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void loadSections();
    const onScopeChange = () => {
      // Drop the previous site immediately, but paint this site's last snapshot if we have one.
      const scope = readHomeSiteScope();
      const snapshot = readInstantHomeModel(fromDate, toDate);
      setSiteScope(scope);
      setModel(hasFleetPaint(snapshot) || hasMetricsPaint(snapshot) ? snapshot : {});
      setError("");
      setLoadingLive(false);
      setLoadingMetrics(scope.ready && !hasMetricsPaint(snapshot));
      void loadSections();
    };
    const onAuthChange = () => {
      setModel({});
      setError("");
      setLoadingLive(false);
      setLoadingMetrics(false);
      void loadSections();
    };
    const onAssetsRefresh = () => {
      void loadSections();
    };
    window.addEventListener("vivi:orgchange", onScopeChange);
    window.addEventListener("vivi:contextchange", onScopeChange);
    window.addEventListener("vivi:authchange", onAuthChange);
    window.addEventListener("vivi:assetsrefresh", onAssetsRefresh);
    return () => {
      window.removeEventListener("vivi:orgchange", onScopeChange);
      window.removeEventListener("vivi:contextchange", onScopeChange);
      window.removeEventListener("vivi:authchange", onAuthChange);
      window.removeEventListener("vivi:assetsrefresh", onAssetsRefresh);
    };
  }, [loadSections]);

  useEffect(() => {
    if (!siteScope.ready) {
      // Site context often lands after OrgRibbon hydrates — retry briefly so Home isn't stuck blank.
      const timer = window.setInterval(() => {
        const scope = readHomeSiteScope();
        if (scope.ready) {
          setSiteScope(scope);
          void loadSections();
        }
      }, 250);
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, [siteScope.ready, loadSections]);

  useEffect(() => {
    if (!siteScope.ready) return;
    const refreshLive = async () => {
      try {
        const sitesAtStart = readHomeSiteScope().scopedSites.join("|");
        const live = await fetchHomeLiveFromTracking();
        // Dropped if the site changed while the request was out.
        if (readHomeSiteScope().scopedSites.join("|") !== sitesAtStart) return;
        // Read the dates at write time so a range change is not saved under the old key.
        const { fromDate: currentFrom, toDate: currentTo } = datesRef.current;
        setModel((prev) => {
          const next = { ...prev, ...live };
          writeCachedHomeDashboardModel(
            { fromDate: currentFrom, toDate: currentTo, scopedSites: readHomeSiteScope().scopedSites },
            next
          );
          return next;
        });
      } catch {
        // keep last live snapshot
      }
    };
    const timer = window.setInterval(() => {
      void refreshLive();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [siteScope.ready]);

  const scopeLabel = siteScope.siteLabel || "Select a site";
  const liveFoot = model?.liveStale ? "Last known (live feed slow)" : "Live now";
  const period = datePreset === "Custom" ? "selected range" : datePreset;
  const loading = loadingLive || loadingMetrics;

  const rangeLabel = useMemo(() => formatRangeLabel(fromDate, toDate), [fromDate, toDate]);
  const fromLabel = useMemo(() => {
    const from = new Date(`${fromDate}T00:00:00`);
    return Number.isNaN(from.getTime()) ? fromDate : from.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }, [fromDate]);
  const toLabel = useMemo(() => {
    const to = new Date(`${toDate}T00:00:00`);
    return Number.isNaN(to.getTime()) ? toDate : to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }, [toDate]);

  return (
    <main className="viv-dash">
      <div className="viv-dash-head">
        <div className="viv-dash-title">
          <h1>Welcome back 👋</h1>
          <div className="viv-dash-sub">
            Fleet overview for site <span className="viv-dash-scope">{scopeLabel}</span>
          </div>
        </div>
        <div className="viv-chips">
          <select
            className="viv-date-preset"
            value={datePreset}
            onChange={(event) => setDatePreset(event.target.value as DatePreset)}
            aria-label="Date preset"
          >
            {datePresets.map((preset) => (
              <option key={preset} value={preset}>{preset}</option>
            ))}
          </select>
          <button type="button" className="viv-date-range" onClick={() => openDatePicker("from")} title="Change start date">
            {fromLabel}
          </button>
          <span className="viv-date-sep" aria-hidden="true">-</span>
          <button type="button" className="viv-date-range" onClick={() => openDatePicker("to")} title="Change end date">
            {toLabel}
          </button>
          {pageLink("/Track/fleet/assets", "All Assets", "viv-chip")}
          {pageLink("/Analyze/insights/reports", "Reports", "viv-chip")}
          <button type="button" className="viv-chip viv-chip-accent" onClick={() => void loadSections()}>
            Refresh
          </button>
        </div>
      </div>

      <ScheduleDateTimePicker
        open={showDatePicker}
        showTime={false}
        restrictToPast
        title={datePickerTarget === "from" ? "Select start date" : "Select end date"}
        date={datePickerValue}
        time="00:00"
        mode="date"
        onClose={() => setShowDatePicker(false)}
        onConfirm={applyDatePicker}
        onDateChange={setDatePickerValue}
        onTimeChange={() => undefined}
        onModeChange={() => undefined}
      />

      {!siteScope.ready && (
        <div className="viv-banner">
          Select a <strong>site</strong> in the org ribbon to load site-scoped dashboard data.
        </div>
      )}
      {siteScope.ready && loadingLive && (
        <div className="viv-banner">
          <span className="viv-spin" /> Loading live fleet data for {scopeLabel}…
        </div>
      )}
      {siteScope.ready && !loadingLive && loadingMetrics && (
        <div className="viv-banner">
          <span className="viv-spin" /> {hasMetricsPaint(model) ? "Updating" : "Loading"} metrics for {scopeLabel}…
        </div>
      )}
      {error && !loading && <div className="viv-banner">⚠ {error}</div>}
      {incomplete && !error && (
        <div className="viv-banner">⚠ Totals are incomplete: {incomplete}. Use Refresh to retry.</div>
      )}

      {/* KPI strip */}
      <div className="viv-kpis">
        <div className="viv-kpi">
          <div className="viv-kpi-top">
            Total Vehicles
            <span className="viv-kpi-icon">{kpiIcon("M3 13h13l3 4h2v-4M5 17a2 2 0 104 0 2 2 0 00-4 0zm10 0a2 2 0 104 0 2 2 0 00-4 0z")}</span>
          </div>
          <div className="viv-kpi-value">{formatNumber(model?.totalVehicles ?? 0)}</div>
          <div className="viv-kpi-foot">In current scope</div>
        </div>
        <div className="viv-kpi">
          <div className="viv-kpi-top">
            Moving
            <span className="viv-kpi-icon">{kpiIcon("M5 12h14M13 6l6 6-6 6")}</span>
          </div>
          <div className="viv-kpi-value">{formatNumber(model?.statusCounts?.moving ?? 0)}</div>
          <div className="viv-kpi-foot">{liveFoot}</div>
        </div>
        <div className="viv-kpi">
          <div className="viv-kpi-top">
            Stopped
            <span className="viv-kpi-icon">{kpiIcon("M8 8h8v8H8z")}</span>
          </div>
          <div className="viv-kpi-value">{formatNumber(model?.statusCounts?.stopped ?? 0)}</div>
          <div className="viv-kpi-foot">{liveFoot}</div>
        </div>
        <div className="viv-kpi">
          <div className="viv-kpi-top">
            Total Distance
            <span className="viv-kpi-icon">{kpiIcon("M4 18L20 6M9 6h11v11")}</span>
          </div>
          <div className="viv-kpi-value">
            {formatNumber(model?.totalDistanceKm ?? 0)}
            <span className="viv-unit">km</span>
          </div>
          <div className="viv-kpi-foot">{rangeLabel}</div>
        </div>
        <div className="viv-kpi">
          <div className="viv-kpi-top">
            Fuel Usage
            <span className="viv-kpi-icon">{kpiIcon("M6 20V5a2 2 0 012-2h5a2 2 0 012 2v15M5 20h11M15 9h2a2 2 0 012 2v5a1.5 1.5 0 003 0V8l-3-3")}</span>
          </div>
          <div className="viv-kpi-value">
            {formatNumber(model?.totalFuelL ?? 0)}
            <span className="viv-unit">L</span>
          </div>
          <div className="viv-kpi-foot">{rangeLabel}</div>
        </div>
        <div className="viv-kpi">
          <div className="viv-kpi-top">
            Avg Efficiency
            <span className="viv-kpi-icon">{kpiIcon("M12 14a2 2 0 100-4 2 2 0 000 4zm0-9a9 9 0 109 9M12 12l4-4")}</span>
          </div>
          <div className="viv-kpi-value">
            {formatNumber(model?.avgEfficiency ?? 0, 1)}
            <span className="viv-unit">km/L</span>
          </div>
          <div className="viv-kpi-foot">Distance / fuel</div>
        </div>
      </div>

      {/* Charts + lists */}
      <div className="viv-section">Performance</div>
      <div className="viv-grid viv-grid-charts">
        <div className="viv-panel">
          <div className="viv-panel-head">
            <h3>Distance (km)</h3>
            {pageLink("/Track/activity/trip-timeline", "View")}
          </div>
          <LineChart series={model?.distanceSeries ?? []} unit="km" />
        </div>
        <div className="viv-panel">
          <div className="viv-panel-head">
            <h3>Fuel Usage (L)</h3>
            {pageLink("/Analyze/insights/reports", "View")}
          </div>
          <BarChart series={model?.fuelSeries ?? []} unit="L" amber />
        </div>
        <div className="viv-panel">
          <div className="viv-panel-head">
            <h3>Utilisation (%)</h3>
            {pageLink("/Analyze/insights/dashboards", "View")}
          </div>
          <AreaChart series={model?.utilisationSeries ?? []} />
        </div>
        <div className="viv-panel">
          <div className="viv-panel-head">
            <h3>Top Drivers</h3>
            {pageLink("/Track/fleet/drivers", "View all")}
          </div>
          {model?.topDrivers && model.topDrivers.length > 0 ? (
            <div className="viv-list">
              {model.topDrivers.map((driver, index) => (
                <div className="viv-list-item" key={driver.name}>
                  <span className="viv-rank">{index + 1}</span>
                  <div className="viv-list-main">
                    <div className="viv-list-name">{driver.name}</div>
                    <div className="viv-list-sub">{driver.sub}</div>
                  </div>
                  <span className="viv-list-val">{formatNumber(driver.value)} km</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="viv-empty">No driver trips in range.</div>
          )}
        </div>
        <div className="viv-panel">
          <div className="viv-panel-head">
            <h3>Top Active Routes</h3>
            {pageLink("/Track/activity/trip-timeline", "View all")}
          </div>
          {model?.topRoutes && model.topRoutes.length > 0 ? (
            <div className="viv-list">
              {model.topRoutes.map((route) => (
                <div className="viv-list-item" key={route.name}>
                  <div className="viv-list-main">
                    <div className="viv-list-name">{route.name}</div>
                    <div className="viv-progress">
                      <span style={{ width: `${Math.max(6, route.ratio * 100)}%` }} />
                    </div>
                  </div>
                  <span className="viv-list-val">{formatNumber(route.value)} km</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="viv-empty">No route data in range.</div>
          )}
        </div>
      </div>

      {/* Standing time + status + maintenance */}
      <div className="viv-section">Operations</div>
      <div className="viv-grid viv-grid-mid">
        <div className="viv-panel">
          <div className="viv-panel-head">
            <h3>Standing Time Analysis</h3>
            {pageLink("/Analyze/insights/reports", "View all")}
          </div>
          <StandingTimePanel model={model} loading={loadingMetrics} />
        </div>

        <div className="viv-panel">
          <div className="viv-panel-head">
            <h3>Vehicle Status</h3>
            {pageLink("/Track/fleet/assets", "View all")}
          </div>
          <Donut counts={model?.statusCounts ?? emptyStatusCounts()} total={model?.totalVehicles ?? 0} />
        </div>

        <div className="viv-panel">
          <div className="viv-panel-head">
            <h3>Maintenance Due</h3>
            {pageLink("/Track/fleet/assets", "View all")}
          </div>
          {model?.maintenance && model.maintenance.length > 0 ? (
            <div className="viv-list">
              {model.maintenance.map((item) => (
                <div className="viv-list-item" key={item.name}>
                  <div className="viv-list-main">
                    <div className="viv-list-name">{item.name}</div>
                    <div className="viv-list-sub">{item.sub}</div>
                  </div>
                  <span className="viv-list-val">
                    {item.value >= 0 ? `${formatNumber(item.value)}` : `${formatNumber(Math.abs(item.value))} overdue`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="viv-empty">No maintenance schedule on assets in scope.</div>
          )}
        </div>
      </div>

      {/* Activity stats */}
      <div className="viv-section">Activity</div>
      <div className="viv-grid viv-grid-stats">
        <StatCard
          value={formatNumber(model?.geofenceEvents ?? 0)}
          label="Geofence Alerts"
          series={model?.geofenceSeries ?? []}
          color="#22c55e"
          period={period}
        />
        <StatCard
          value={model?.alertsConfigured ? formatNumber(model?.alerts ?? 0) : "—"}
          label="Alerts"
          sub={model?.alertsConfigured ? undefined : "No alerts set"}
          series={model?.alertsConfigured ? (model?.alertsSeries ?? []) : []}
          color="#f59e0b"
          period={period}
        />
        <StatCard
          value={formatNumber(model?.tripsCompleted ?? 0)}
          label="Trips Completed"
          series={model?.tripsSeries ?? []}
          color="#38bdf8"
          period={period}
        />
        <StatCard
          value={formatDuration(model?.idleMs ?? 0)}
          label="Idle Time"
          // Idle time is a range total (engine on, not driving); there is no per-day idle series to plot.
          series={[]}
          color="#64748b"
          period={period}
        />
      </div>
    </main>
  );
}

export default Home;
