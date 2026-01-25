import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";

type TimelineRow = {
  id: string;
  driver: string;
  timeline: string;
  lastEvent: string;
  status: "compliant" | "warning" | "violation";
};

const rows: TimelineRow[] = [
  {
    id: "tl-1",
    driver: "Grace Nanyonga",
    timeline: "On duty · Drive · Break · Drive",
    lastEvent: "Break ended 10:05",
    status: "warning"
  },
  {
    id: "tl-2",
    driver: "Musa Okello",
    timeline: "Off duty · On duty · Drive",
    lastEvent: "Drive started 09:20",
    status: "compliant"
  }
];

export default function HosTimeline() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((row) => row.driver.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">HOS timeline</div>
          <div className="hos-path">Monitor / Hours of service / Timeline</div>
        </div>
        <div className="hos-actions">
          <button
            type="button"
            className="hos-btn ghost"
            onClick={() => navigate("/measure/insights/reports?category=Hours%20Of%20Service%20Reports")}
          >
            View HOS reports
          </button>
          <button type="button" className="hos-btn ghost">Download</button>
          <button type="button" className="hos-btn">Refresh</button>
        </div>
      </div>

      <section className="hos-panel">
        <div className="hos-panel-header">
          <div>
            <div className="hos-panel-title">Live timeline</div>
            <div className="hos-panel-sub">Shift activity and break windows.</div>
          </div>
          <div className="hos-filter-row">
            <input
              className="hos-search"
              placeholder="Search driver"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="button" className="hos-btn ghost">Filter shift</button>
          </div>
        </div>

        <div className="hos-timeline">
          {filtered.map((row) => (
            <div key={row.id} className="hos-timeline-row">
              <div>
                <div className="hos-name">{row.driver}</div>
                <div className="hos-timeline-meta">{row.lastEvent}</div>
              </div>
              <div className="hos-timeline-bar">
                <span className={`hos-pill ${row.status}`}>{row.status}</span>
                <div className="hos-timeline-track">{row.timeline}</div>
              </div>
              <button type="button" className="hos-action">View log</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
