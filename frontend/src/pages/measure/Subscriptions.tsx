import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../index.css";

const subs = [
  { name: "Trip summary", cadence: "Daily 06:00", recipients: "ops@demo.com" },
  { name: "Overspeeding", cadence: "Immediate", recipients: "safety@demo.com" },
  { name: "Driver scorecard", cadence: "Monthly 1st", recipients: "hr@demo.com" }
];

export default function Subscriptions() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => subs.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  return (
    <div className="page insight-page">
      <section className="token-card insight-card">
        <div className="token-header">
          <div>
            <p className="eyebrow">Insights</p>
            <h2>Subscriptions</h2>
            <p className="token-sub">Who gets which reports and how often.</p>
          </div>
          <div className="insight-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigate("/measure/insights/reports?category=Trip%20Reports")}
            >
              Open trip reports
            </button>
            <button type="button" className="btn primary">Create subscription</button>
          </div>
        </div>
        <div className="insight-analytics">
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Active subscriptions</div>
            <div className="insight-analytics-value">9</div>
            <div className="insight-analytics-meta">+1 this week</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Recipients</div>
            <div className="insight-analytics-value">28</div>
            <div className="insight-analytics-meta">Across teams</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Next dispatch</div>
            <div className="insight-analytics-value">06:00</div>
            <div className="insight-analytics-meta">Tomorrow</div>
          </div>
        </div>
        <div className="insight-filters">
          <input
            className="insight-search"
            placeholder="Search subscription"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="token-table">
          <div className="token-row token-row-head">
            <span>Name</span>
            <span>Cadence</span>
            <span>Recipients</span>
          </div>
          {filtered.map((s) => (
            <div key={s.name} className="token-row">
              <span>{s.name}</span>
              <span>{s.cadence}</span>
              <span>{s.recipients}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
