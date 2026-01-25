import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type TimeclockRow = {
  id: string;
  driver: string;
  shiftStart: string;
  shiftEnd: string;
  breakCount: number;
  status: "on-duty" | "off-duty" | "break";
};

const timeclockRows: TimeclockRow[] = [
  {
    id: "tc-1",
    driver: "Grace Nanyonga",
    shiftStart: "06:00",
    shiftEnd: "18:00",
    breakCount: 2,
    status: "on-duty"
  },
  {
    id: "tc-2",
    driver: "Musa Okello",
    shiftStart: "18:00",
    shiftEnd: "06:00",
    breakCount: 1,
    status: "break"
  },
  {
    id: "tc-3",
    driver: "Asha Kibanja",
    shiftStart: "07:00",
    shiftEnd: "19:00",
    breakCount: 3,
    status: "off-duty"
  }
];

export default function HosTimeclock() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "On duty", value: timeclockRows.filter((row) => row.status === "on-duty").length },
      { label: "On break", value: timeclockRows.filter((row) => row.status === "break").length },
      { label: "Off duty", value: timeclockRows.filter((row) => row.status === "off-duty").length },
      { label: "Avg breaks", value: "2.1" }
    ],
    []
  );

  const filtered = useMemo(() => {
    return timeclockRows.filter((row) => {
      const matchesSearch = row.driver.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">Timeclock</div>
          <div className="hos-path">Monitor / Hours of service / Timeclock</div>
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
          <button
            type="button"
            className="hos-btn"
            data-modal="Add shift"
            data-modal-sub="Assign a driver shift block."
            data-modal-fields="Driver|Shift start|Shift end"
          >
            Add shift
          </button>
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
            <div className="hos-panel-title">Shift roster</div>
            <div className="hos-panel-sub">Break tracking and duty state.</div>
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
              <option value="on-duty">On duty</option>
              <option value="break">Break</option>
              <option value="off-duty">Off duty</option>
            </select>
          </div>
        </div>

        <div className="hos-table">
          <div className="hos-row hos-row-head hos-row-wide">
            <span>Driver</span>
            <span>Shift start</span>
            <span>Shift end</span>
            <span>Breaks</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="hos-empty">No shifts match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="hos-row hos-row-wide">
                <span className="hos-name">{row.driver}</span>
                <span>{row.shiftStart}</span>
                <span>{row.shiftEnd}</span>
                <span>{row.breakCount}</span>
                <span className={`hos-pill ${row.status}`}>{row.status.replace("-", " ")}</span>
                <span className="hos-actions-col">
                  <button type="button" className="hos-action">Adjust</button>
                  <button type="button" className="hos-action ghost">Details</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
