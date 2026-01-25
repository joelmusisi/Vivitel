import { useNavigate } from "react-router-dom";
import "../../index.css";

const hotspots = [
  { name: "Depot A", activity: "42 Notifications", note: "High idling" },
  { name: "Route N3", activity: "28 Notifications", note: "Overspeed cluster" },
  { name: "Mine access road", activity: "12 Notifications", note: "Harsh braking" }
];

export default function LocationAnalyser() {
  const navigate = useNavigate();
  return (
    <div className="page insight-page">
      <section className="token-card insight-card">
        <div className="token-header">
          <div>
            <p className="eyebrow">Insights</p>
            <h2>Location Analyser</h2>
            <p className="token-sub">Hotspots and location-based activity highlights.</p>
          </div>
          <div className="insight-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                navigate(
                  "/measure/insights/reports?category=Movement%20Reports&report=Location%20Overview%20Report"
                )
              }
            >
              Open movement reports
            </button>
            <button type="button" className="btn primary">Create hotspot</button>
          </div>
        </div>
        <div className="insight-analytics">
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Active hotspots</div>
            <div className="insight-analytics-value">8</div>
            <div className="insight-analytics-meta">Last 7 days</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">High idle zones</div>
            <div className="insight-analytics-value">3</div>
            <div className="insight-analytics-meta">Requires follow-up</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Top route</div>
            <div className="insight-analytics-value">Route N3</div>
            <div className="insight-analytics-meta">+12% alerts</div>
          </div>
        </div>
        <div className="token-table">
          <div className="token-row token-row-head">
            <span>Location</span>
            <span>Activity</span>
            <span>Note</span>
          </div>
          {hotspots.map((h) => (
            <div key={h.name} className="token-row">
              <span>{h.name}</span>
              <span>{h.activity}</span>
              <span>{h.note}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
