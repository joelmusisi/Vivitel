import "../../index.css";

const filterPills = [
  "This Month",
  "By Day of Month",
  "All assets",
  "All sites",
  "Trips only"
];

const distanceKpis = [
  { label: "Avg km/asset/day", value: "118.51", icon: "🚚" },
  { label: "Avg trips/asset/day", value: "6.42", icon: "🧭" },
  { label: "Avg km/trip", value: "18.45", icon: "📊" }
];

const fleetUtilisation = [
  { label: "1st", value: 66 },
  { label: "2nd", value: 64 },
  { label: "3rd", value: 67 },
  { label: "4th", value: 66 },
  { label: "5th", value: 64 }
];

const drivingAndIdling = [
  { label: "1st", value: 195 },
  { label: "2nd", value: 152 },
  { label: "3rd", value: 198 },
  { label: "4th", value: 176 },
  { label: "5th", value: 182 }
];

const distanceByDay = [
  { label: "1st", value: 5300, color: "#6b7280" },
  { label: "2nd", value: 5000, color: "#2563eb" },
  { label: "3rd", value: 5400, color: "#3b82f6" },
  { label: "4th", value: 5850, color: "#38bdf8" },
  { label: "5th", value: 5200, color: "#60a5fa" }
];

export default function Dashboards() {
  const afterWorkTrips = 249;
  const duringWorkTrips = 1245;
  const afterPct = Math.round((afterWorkTrips / (afterWorkTrips + duringWorkTrips)) * 1000) / 10;

  return (
    <div className="page util-page">
      <div className="util-toolbar">
        <div className="util-breadcrumb">Dashboards · Fleet utilisation</div>
        <div className="util-toolbar-actions">
          <select className="util-select">
            <option>Fleet Utilisation (Default)</option>
          </select>
          <button className="util-icon-btn" aria-label="Add widget">
            +
          </button>
        </div>
      </div>

      <div className="util-filters">
        {filterPills.map((pill) => (
          <button key={pill} className="util-pill">
            {pill}
          </button>
        ))}
      </div>

      <div className="util-grid">
        <section className="util-panel util-panel-wide">
          <div className="util-panel-header">
            <div>
              <p className="util-eyebrow">Manage fleet utilisation</p>
              <h3>Km and trip insights</h3>
              <p className="util-range">1 - 5 December 2025</p>
            </div>
            <div className="util-panel-icons">⋯</div>
          </div>

          <div className="util-distance-block">
            <div className="util-distance-main">
              <p className="util-muted">Distance</p>
              <div className="util-distance-value">
                27,256 <span>km</span>
              </div>
            </div>
            <div className="util-distance-metrics">
              {distanceKpis.map((kpi) => (
                <div key={kpi.label} className="util-distance-item">
                  <span className="util-distance-icon" aria-hidden="true">
                    {kpi.icon}
                  </span>
                  <div className="util-distance-value-sm">{kpi.value}</div>
                  <div className="util-muted">{kpi.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="util-panel">
          <div className="util-panel-header">
            <div>
              <p className="util-eyebrow">Manage fleet utilisation</p>
              <h3>Fleet utilisation %</h3>
              <p className="util-range">1 - 5 December 2025</p>
            </div>
            <div className="util-panel-icons">⋯</div>
          </div>

          <div className="util-bars">
            {fleetUtilisation.map((item) => (
              <div key={item.label} className="util-bar-col">
                <div className="util-bar" style={{ height: `${item.value * 2.4}px` }} />
                <span className="util-bar-label">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="util-legend">
            <span className="util-dot util-dot-low" /> 0-39%
            <span className="util-dot util-dot-med" /> 40-94%
            <span className="util-dot util-dot-high" /> &gt;95%
          </div>
        </section>

        <section className="util-panel">
          <div className="util-panel-header">
            <div>
              <p className="util-eyebrow">Manage fleet utilisation</p>
              <h3>Driving and idling time</h3>
              <p className="util-range">1 - 5 December 2025</p>
            </div>
            <div className="util-panel-icons">⋯</div>
          </div>
          <div className="util-bars util-bars-blue">
            {drivingAndIdling.map((item) => (
              <div key={item.label} className="util-bar-col">
                <div
                  className="util-bar util-bar-blue"
                  style={{ height: `${Math.max(item.value / 2, 60)}px` }}
                  title={`${item.value} mins`}
                />
                <span className="util-bar-label">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="util-panel">
          <div className="util-panel-header">
            <div>
              <p className="util-eyebrow">Manage fleet utilisation</p>
              <h3>Movement by hour of day</h3>
              <p className="util-range">1 - 5 December 2025</p>
            </div>
            <div className="util-panel-icons">⋯</div>
          </div>
          <div className="util-placeholder">No data generated yet</div>
        </section>

        <section className="util-panel util-panel-wide">
          <div className="util-panel-header">
            <div>
              <p className="util-eyebrow">Manage fleet utilisation</p>
              <h3>Distance / day of week</h3>
              <p className="util-range">1 - 5 December 2025</p>
            </div>
            <div className="util-panel-icons">⋯</div>
          </div>
          <div className="util-bars util-bars-Vivied">
            {distanceByDay.map((item) => (
              <div key={item.label} className="util-bar-col">
                <div
                  className="util-bar util-bar-Vivied"
                  style={{ height: `${Math.max(item.value / 30, 40)}px`, background: item.color }}
                  title={`${item.value.toLocaleString()} km`}
                />
                <span className="util-bar-label">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="util-legend util-legend-row">
            <span className="util-legend-label">Monday</span>
            <span className="util-legend-label">Tuesday</span>
            <span className="util-legend-label">Wednesday</span>
            <span className="util-legend-label">Thursday</span>
            <span className="util-legend-label">Friday</span>
          </div>
        </section>

        <section className="util-panel">
          <div className="util-panel-header">
            <div>
              <p className="util-eyebrow">Manage fleet utilisation</p>
              <h3>After work hour analysis (5pm to 5am)</h3>
              <p className="util-range">1 - 5 December 2025</p>
            </div>
            <div className="util-panel-icons">⋯</div>
          </div>
          <div className="util-donut">
            <div
              className="util-donut-ring"
              style={{
                background: `conic-gradient(#3b82f6 0% ${afterPct}%, #d1d5db ${afterPct}% 100%)`
              }}
            />
            <div className="util-donut-label">
              <div className="util-donut-percent">{afterPct}%</div>
              <div className="util-muted">Number of trips after work hours</div>
            </div>
          </div>
          <div className="util-legend util-legend-row">
            <span className="util-dot util-dot-blue" /> After work hours ({afterWorkTrips})
            <span className="util-dot util-dot-gray" /> During work hours ({duringWorkTrips})
          </div>
        </section>
      </div>
    </div>
  );
}
