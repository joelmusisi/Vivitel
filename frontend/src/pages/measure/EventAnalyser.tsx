import { useNavigate } from "react-router-dom";
import "../../index.css";

const Notifications = [
  { type: "Overspeed", recent: "6 in last 24h", severity: "High" },
  { type: "Harsh brake", recent: "3 in last 24h", severity: "Medium" },
  { type: "Ignition on after hours", recent: "1 in last 24h", severity: "Low" }
];

export default function NotificationAnalyser() {
  const navigate = useNavigate();
  return (
    <div className="page insight-page">
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
                  "/measure/insights/reports?category=Notification%20Reports&report=Detailed%20Notification%20Report"
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
            <div className="insight-analytics-value">12</div>
            <div className="insight-analytics-meta">Last 24h</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Critical</div>
            <div className="insight-analytics-value">3</div>
            <div className="insight-analytics-meta">Needs response</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Avg response</div>
            <div className="insight-analytics-value">14m</div>
            <div className="insight-analytics-meta">Dispatch</div>
          </div>
        </div>
        <div className="token-table">
          <div className="token-row token-row-head">
            <span>Notification</span>
            <span>Recent</span>
            <span>Severity</span>
          </div>
          {Notifications.map((e) => (
            <div key={e.type} className="token-row">
              <span>{e.type}</span>
              <span>{e.recent}</span>
              <span>{e.severity}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
