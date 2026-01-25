import { useNavigate } from "react-router-dom";
import "../../index.css";

export default function InsightAgility() {
  const navigate = useNavigate();
  return (
    <div className="page insight-page">
      <section className="token-card insight-card">
        <div className="token-header">
          <div>
            <p className="eyebrow">Insights</p>
            <h2>Vivi Insight Agility</h2>
            <p className="token-sub">Ad-hoc queries and custom visualisations backed by your data.</p>
          </div>
          <div className="insight-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigate("/measure/insights/reports?category=Custom%20Reports")}
            >
              Open custom reports
            </button>
            <button type="button" className="btn primary">Create query</button>
          </div>
        </div>
        <div className="insight-analytics">
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Saved views</div>
            <div className="insight-analytics-value">12</div>
            <div className="insight-analytics-meta">+2 this month</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Queries run</div>
            <div className="insight-analytics-value">86</div>
            <div className="insight-analytics-meta">Last 30 days</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Exports</div>
            <div className="insight-analytics-value">24</div>
            <div className="insight-analytics-meta">CSV + PDF</div>
          </div>
        </div>
        <div className="token-empty">
          Placeholder for Insight Agility tooling: query builder, saved views, and export options.
        </div>
      </section>
    </div>
  );
}
