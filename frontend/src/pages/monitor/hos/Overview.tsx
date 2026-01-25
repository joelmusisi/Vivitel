import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type OverviewRow = {
  id: string;
  driver: string;
  fleet: string;
  cycle: string;
  available: string;
  duty: string;
  status: "compliant" | "warning" | "violation";
};

const overviewRows: OverviewRow[] = [
  {
    id: "ov-1",
    driver: "Grace Nanyonga",
    fleet: "Northern Haul",
    cycle: "7/8",
    available: "2h 20m",
    duty: "On duty",
    status: "warning"
  },
  {
    id: "ov-2",
    driver: "Musa Okello",
    fleet: "Central Transfer",
    cycle: "3/8",
    available: "6h 05m",
    duty: "Driving",
    status: "compliant"
  },
  {
    id: "ov-3",
    driver: "Asha Kibanja",
    fleet: "Port Ops",
    cycle: "8/8",
    available: "0h 00m",
    duty: "Off duty",
    status: "violation"
  }
];

export default function HosOverview() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Compliant", value: overviewRows.filter((row) => row.status === "compliant").length },
      { label: "Warning", value: overviewRows.filter((row) => row.status === "warning").length },
      { label: "Violations", value: overviewRows.filter((row) => row.status === "violation").length },
      { label: "Total drivers", value: overviewRows.length }
    ],
    []
  );

  const filtered = useMemo(() => {
    return overviewRows.filter((row) => {
      const matchesSearch = row.driver.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">HOS overview</div>
          <div className="hos-path">Monitor / Hours of service / Overview</div>
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
          </div>
        ))}
      </section>

      <section className="hos-panel">
        <div className="hos-panel-header">
          <div>
            <div className="hos-panel-title">Driver status</div>
            <div className="hos-panel-sub">Live duty status and availability.</div>
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
            <span>Fleet</span>
            <span>Cycle</span>
            <span>Available</span>
            <span>Duty</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="hos-empty">No drivers match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="hos-row hos-row-wide">
                <span className="hos-name">{row.driver}</span>
                <span>{row.fleet}</span>
                <span>{row.cycle}</span>
                <span>{row.available}</span>
                <span>{row.duty}</span>
                <span className={`hos-pill ${row.status}`}>{row.status}</span>
                <span className="hos-actions-col">
                  <button type="button" className="hos-action">Open</button>
                  <button type="button" className="hos-action ghost">Notify</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
