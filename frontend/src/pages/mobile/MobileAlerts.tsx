import { useCallback, useEffect, useState } from "react";
import { fetchConfiguredAlertFeed, type AlertDayGroup } from "../../utils/homeAlertMetrics";
import { readScopeNaming } from "../../utils/selectionScope";
import "./MobileAlerts.css";

const timeLabel = (atMs: number) =>
  new Date(atMs).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

export default function MobileAlerts() {
  const [groups, setGroups] = useState<AlertDayGroup[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scopeLabel, setScopeLabel] = useState(() => readScopeNaming().label);

  const load = useCallback(async () => {
    setLoading(true);
    setScopeLabel(readScopeNaming().label);
    try {
      const feed = await fetchConfiguredAlertFeed(7);
      setConfigured(feed.configured);
      setGroups(feed.groups);
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

  const total = groups.reduce((sum, group) => sum + group.alerts.length, 0);

  return (
    <div className="malerts">
      <header className="malerts-head">
        <h1>Alerts</h1>
        <p>
          {scopeLabel} · last 7 days · {loading ? "…" : `${total} event${total === 1 ? "" : "s"}`}
        </p>
      </header>

      {!loading && !configured && (
        <div className="malerts-banner">No alerts are configured for this site yet.</div>
      )}

      {loading && <p className="malerts-empty">Loading alerts…</p>}

      {!loading && configured && groups.length === 0 && (
        <p className="malerts-empty">No alert events in the last 7 days.</p>
      )}

      {groups.map((group) => (
        <section key={group.dayKey} className="malerts-day">
          <h2>{group.dayLabel}</h2>
          <ul className="malerts-list">
            {group.alerts.map((alert) => (
              <li key={alert.id} className={`malerts-item malerts-item--${alert.severity}`}>
                <span className="malerts-dot" />
                <span className="malerts-body">
                  <span className="malerts-label">{alert.label}</span>
                  <span className="malerts-meta">
                    {alert.asset} · {timeLabel(alert.atMs)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
