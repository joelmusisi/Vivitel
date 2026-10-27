import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserAlertsFromApi, type ViviUserAlert } from "../../utils/api";
import { readActiveSiteName } from "../../utils/tenantContext";
import { useFleetFilterOptional } from "../../contexts/FleetFilterContext";
import { FleetFilterBar } from "../../components/FleetFilterBar";
import "../../index.css";

type NotificationRow = {
  type: string;
  recent: string;
  severity: string;
};

const severityLabel = (severity: ViviUserAlert["severity"]) => {
  if (severity === "critical") return "High";
  if (severity === "warning") return "Medium";
  return "Low";
};

export default function NotificationAnalyser() {
  const navigate = useNavigate();
  const fleetFilter = useFleetFilterOptional();
  const [alerts, setAlerts] = useState<ViviUserAlert[]>([]);

  useEffect(() => {
    let mounted = true;
    const loadAlerts = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const rows = await getUserAlertsFromApi(since).catch(() => []);
      if (!mounted) return;
      const activeSite = readActiveSiteName().trim().toLowerCase();
      const scoped = rows.filter((row) => {
        const site = String(row.site ?? "").trim();
        if (fleetFilter && (fleetFilter.selectedSites.length > 0 || fleetFilter.selectedAssets.length > 0)) {
          if (!fleetFilter.matchesSite(site)) return false;
          if (!fleetFilter.matchesAsset(String(row.assetLabel ?? ""))) return false;
          return true;
        }
        if (activeSite && site.toLowerCase() !== activeSite) return false;
        return true;
      });
      setAlerts(scoped);
    };
    void loadAlerts();
    const handleOrgChange = () => {
      void loadAlerts();
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => {
      mounted = false;
      window.removeEventListener("vivi:orgchange", handleOrgChange);
    };
  }, [fleetFilter]);

  const notificationRows = useMemo(() => {
    const grouped = new Map<string, { count: number; severity: ViviUserAlert["severity"] }>();
    for (const alert of alerts) {
      const type = String(alert.eventLabel ?? alert.message ?? "Notification").trim() || "Notification";
      const current = grouped.get(type) ?? { count: 0, severity: "info" as const };
      const nextSeverity =
        alert.severity === "critical" || current.severity === "critical"
          ? "critical"
          : alert.severity === "warning" || current.severity === "warning"
            ? "warning"
            : "info";
      grouped.set(type, { count: current.count + 1, severity: nextSeverity });
    }
    return Array.from(grouped.entries()).map(([type, value]) => ({
      type,
      recent: `${value.count} in last 24h`,
      severity: severityLabel(value.severity)
    })) satisfies NotificationRow[];
  }, [alerts]);

  const summary = useMemo(() => {
    const open = alerts.filter((row) => !row.read).length;
    const critical = alerts.filter((row) => row.severity === "critical").length;
    return { open, critical };
  }, [alerts]);

  return (
    <div className="page insight-page">
      <FleetFilterBar showDbProfile />
      <section className="token-card insight-card">
        <div className="token-header">
          <div>
            <p className="eyebrow">Insights</p>
            <h2>Notification Analyser</h2>
            <p className="token-sub">Recent critical Notifications with severity cues.</p>
          </div>
          <div className="insight-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                navigate(
                  "/Analyze/insights/reports?category=Notification%20Reports&report=Detailed%20Notification%20Report"
                )
              }
            >
              Open notification reports
            </button>
            <button type="button" className="btn primary">Create alert</button>
          </div>
        </div>
        <div className="insight-analytics">
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Open alerts</div>
            <div className="insight-analytics-value">{summary.open}</div>
            <div className="insight-analytics-meta">Last 24h</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Critical</div>
            <div className="insight-analytics-value">{summary.critical}</div>
            <div className="insight-analytics-meta">Needs response</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Avg response</div>
            <div className="insight-analytics-value">—</div>
            <div className="insight-analytics-meta">Dispatch</div>
          </div>
        </div>
        <div className="token-table">
          <div className="token-row token-row-head">
            <span>Notification</span>
            <span>Recent</span>
            <span>Severity</span>
          </div>
          {notificationRows.length === 0 ? (
            <div className="admin-empty">No records yet.</div>
          ) : (
            notificationRows.map((row) => (
              <div key={row.type} className="token-row">
                <span>{row.type}</span>
                <span>{row.recent}</span>
                <span>{row.severity}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
