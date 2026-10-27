import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchHomeLiveFromTracking } from "../../utils/homeLiveSnapshot";
import { fetchHomeAlertMetrics, type HomeRecentAlert } from "../../utils/homeAlertMetrics";
import type { HomeStatusCounts } from "../../utils/homeDashboardApi";
import { readScopeNaming } from "../../utils/selectionScope";
import { readHomeSiteScope } from "../../utils/homeSiteScope";
import "./MobileHome.css";

const EMPTY_COUNTS: HomeStatusCounts = { moving: 0, stopped: 0, idle: 0, offline: 0 };

const todayLabel = () =>
  new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const timeAgo = (atMs: number): string => {
  const mins = Math.max(0, Math.floor((Date.now() - atMs) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const lastSevenDays = () => {
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
};

type Slice = { key: keyof HomeStatusCounts; label: string; color: string };

const SLICES: Slice[] = [
  { key: "moving", label: "Moving", color: "#22c55e" },
  { key: "stopped", label: "Stopped", color: "#ef4444" },
  { key: "idle", label: "Idle", color: "#f59e0b" },
  { key: "offline", label: "Offline", color: "#64748b" }
];

function FleetDonut({ counts }: { counts: HomeStatusCounts }) {
  const total = counts.moving + counts.stopped + counts.idle + counts.offline;
  const gradient = useMemo(() => {
    if (total === 0) return "conic-gradient(var(--mh-border) 0 100%)";
    let acc = 0;
    const stops = SLICES.map((slice) => {
      const start = (acc / total) * 100;
      acc += counts[slice.key];
      const end = (acc / total) * 100;
      return `${slice.color} ${start}% ${end}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [counts, total]);

  return (
    <div className="mhome-donut-wrap">
      <div className="mhome-donut" style={{ background: gradient }}>
        <div className="mhome-donut-hole">
          <strong>{total}</strong>
          <span>Total</span>
        </div>
      </div>
      <div className="mhome-legend">
        {SLICES.map((slice) => {
          const value = counts[slice.key];
          const pct = total === 0 ? 0 : Math.round((value / total) * 100);
          return (
            <div key={slice.key} className="mhome-legend-row">
              <span className="mhome-dot" style={{ background: slice.color }} />
              <span className="mhome-legend-label">{slice.label}</span>
              <span className="mhome-legend-value">
                {value} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MobileHome() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<HomeStatusCounts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [alertsCount, setAlertsCount] = useState(0);
  const [recent, setRecent] = useState<HomeRecentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeLabel, setScopeLabel] = useState(() => readScopeNaming().label);
  // Home totals cover a database or site; at dealer/organisation level ask for a pick instead of showing zeros.
  const [scopeReady, setScopeReady] = useState(() => readHomeSiteScope().ready);

  const load = useCallback(async () => {
    setScopeLabel(readScopeNaming().label);
    setScopeReady(readHomeSiteScope().ready);
    setLoading(true);
    const { from, to } = lastSevenDays();
    try {
      const [live, alerts] = await Promise.all([
        fetchHomeLiveFromTracking().catch(() => null),
        fetchHomeAlertMetrics(from, to).catch(() => null)
      ]);
      if (live) {
        setCounts(live.statusCounts);
        setTotal(live.totalVehicles);
      }
      if (alerts) {
        setAlertsCount(alerts.alertsConfigured ? alerts.totalAlerts : 0);
        setRecent(alerts.recent);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("vivi:orgchange", refresh);
    window.addEventListener("vivi:contextchange", refresh);
    const interval = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("vivi:orgchange", refresh);
      window.removeEventListener("vivi:contextchange", refresh);
      window.clearInterval(interval);
    };
  }, [load]);

  const online = counts.moving + counts.stopped + counts.idle;

  const tiles = [
    { label: "Total Vehicles", value: total, tone: "neutral" },
    { label: "Online", value: online, tone: "good" },
    { label: "Moving", value: counts.moving, tone: "good" },
    { label: "Stopped", value: counts.stopped, tone: "bad" },
    { label: "Idle", value: counts.idle, tone: "warn" },
    { label: "Alerts", value: alertsCount, tone: "bad" }
  ];

  return (
    <div className="mhome">
      <header className="mhome-welcome">
        <div>
          <p className="mhome-hello">Welcome back</p>
          <h1 className="mhome-scope">{scopeLabel}</h1>
        </div>
        <span className="mhome-date">{todayLabel()}</span>
      </header>

      {!scopeReady && !loading && (
        <section className="mhome-card mhome-scope-prompt">
          <h2>Choose a database or site</h2>
          <p className="mhome-empty">Fleet totals are shown for one database or site at a time.</p>
          <button
            type="button"
            className="mhome-scope-button"
            onClick={() => window.dispatchEvent(new Event("vivi.orgRibbon.open"))}
          >
            Choose site
          </button>
        </section>
      )}

      <section className="mhome-tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className={`mhome-tile mhome-tile--${tile.tone}`}>
            <span className="mhome-tile-value">{loading ? "—" : tile.value}</span>
            <span className="mhome-tile-label">{tile.label}</span>
          </div>
        ))}
      </section>

      <section className="mhome-card">
        <h2>Fleet overview</h2>
        <FleetDonut counts={counts} />
      </section>

      <section className="mhome-card">
        <div className="mhome-card-head">
          <h2>Recent alerts</h2>
          <button type="button" className="mhome-link" onClick={() => navigate("/mobile/alerts")}>
            View all
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="mhome-empty">{loading ? "Loading alerts…" : "No recent alerts."}</p>
        ) : (
          <ul className="mhome-alerts">
            {recent.map((alert) => (
              <li key={alert.id} className={`mhome-alert mhome-alert--${alert.severity}`}>
                <span className="mhome-alert-dot" />
                <span className="mhome-alert-body">
                  <span className="mhome-alert-label">{alert.label}</span>
                  <span className="mhome-alert-meta">
                    {alert.asset} · {timeAgo(alert.atMs)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
