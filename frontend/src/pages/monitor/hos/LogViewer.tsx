import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type LogRow = {
  id: string;
  driver: string;
  date: string;
  event: string;
  duration: string;
  status: "compliant" | "warning" | "violation";
};

const logs: LogRow[] = [
  {
    id: "log-1",
    driver: "Grace Nanyonga",
    date: "Jan 22",
    event: "Drive",
    duration: "2h 05m",
    status: "warning"
  },
  {
    id: "log-2",
    driver: "Musa Okello",
    date: "Jan 22",
    event: "Break",
    duration: "35m",
    status: "compliant"
  },
  {
    id: "log-3",
    driver: "Asha Kibanja",
    date: "Jan 22",
    event: "Exceeded shift",
    duration: "15m",
    status: "violation"
  }
];

export default function HosLogViewer() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return logs.filter((row) => {
      const matchesSearch = row.driver.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">Log viewer</div>
          <div className="hos-path">Monitor / Hours of service / Log viewer</div>
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
          <button type="button" className="hos-btn">Audit</button>
        </div>
      </div>

      <section className="hos-panel">
        <div className="hos-panel-header">
          <div>
            <div className="hos-panel-title">Driver logs</div>
            <div className="hos-panel-sub">Activity log entries for compliance audits.</div>
          </div>
          <div className="hos-filter-row">
            <input
              className="hos-search"
              placeholder="Search driver"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="hos-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="compliant">Compliant</option>
              <option value="warning">Warning</option>
              <option value="violation">Violation</option>
            </select>
          </div>
        </div>

        <div className="hos-table">
          <div className="hos-row hos-row-head hos-row-wide">
            <span>Driver</span>
            <span>Date</span>
            <span>Event</span>
            <span>Duration</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="hos-empty">No logs match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="hos-row hos-row-wide">
                <span className="hos-name">{row.driver}</span>
                <span>{row.date}</span>
                <span>{row.event}</span>
                <span>{row.duration}</span>
                <span className={`hos-pill ${row.status}`}>{row.status}</span>
                <span className="hos-actions-col">
                  <button type="button" className="hos-action">View</button>
                  <button type="button" className="hos-action ghost">Annotate</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
