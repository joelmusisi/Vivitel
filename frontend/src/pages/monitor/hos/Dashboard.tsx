import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type HOSMetric = {
  label: string;
  value: string | number;
  note: string;
};

type HOSRow = {
  id: string;
  driver: string;
  shift: string;
  remaining: string;
  lastBreak: string;
  status: "compliant" | "warning" | "violation";
};

const metrics: HOSMetric[] = [
  { label: "Drivers on duty", value: 42, note: "+4 vs yesterday" },
  { label: "Near limit", value: 7, note: "Within 60 min" },
  { label: "Violations", value: 2, note: "Last 24h" },
  { label: "Avg drive time", value: "6h 10m", note: "per driver" }
];

const rows: HOSRow[] = [
  {
    id: "hos-1",
    driver: "Tumwine Kevin",
    shift: "Day",
    remaining: "1h 45m",
    lastBreak: "30m ago",
    status: "warning"
  },
  {
    id: "hos-2",
    driver: "Musa Okello",
    shift: "Night",
    remaining: "4h 10m",
    lastBreak: "1h ago",
    status: "compliant"
  },
  {
    id: "hos-3",
    driver: "Asha Kibanja",
    shift: "Day",
    remaining: "0h 15m",
    lastBreak: "2h ago",
    status: "violation"
  }
];

export default function HosDashboard() {
  const navigate = useNavigate();
  const summary = useMemo(() => metrics, []);

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">HOS dashboard</div>
          <div className="hos-path">Monitor / Hours of service / Dashboard</div>
        </div>
        <div className="hos-actions">
          <button
            type="button"
            className="hos-btn ghost"
            onClick={() => navigate("/measure/insights/reports?category=Hours%20Of%20Service%20Reports")}
          >
            View HOS reports
          </button>
          <button type="button" className="hos-btn ghost">Export</button>
          <button type="button" className="hos-btn">Refresh</button>
        </div>
      </div>

      <section className="hos-summary">
        {summary.map((card) => (
          <div key={card.label} className="hos-summary-card">
            <div className="hos-summary-label">{card.label}</div>
            <div className="hos-summary-value">{card.value}</div>
            <div className="hos-summary-note">{card.note}</div>
          </div>
        ))}
      </section>

      <section className="hos-panel">
        <div className="hos-panel-header">
          <div>
            <div className="hos-panel-title">Drivers nearing limits</div>
            <div className="hos-panel-sub">Prioritise breaks and shift swaps.</div>
          </div>
          <button type="button" className="hos-link">Open full roster</button>
        </div>
        <div className="hos-table">
          <div className="hos-row hos-row-head">
            <span>Driver</span>
            <span>Shift</span>
            <span>Remaining</span>
            <span>Last break</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {rows.map((row) => (
            <div key={row.id} className="hos-row">
              <span className="hos-name">{row.driver}</span>
              <span>{row.shift}</span>
              <span>{row.remaining}</span>
              <span>{row.lastBreak}</span>
              <span className={`hos-pill ${row.status}`}>{row.status}</span>
              <span className="hos-actions-col">
                <button type="button" className="hos-action">Notify</button>
                <button type="button" className="hos-action ghost">Details</button>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
