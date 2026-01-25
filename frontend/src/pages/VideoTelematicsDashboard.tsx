import { type CSSProperties } from "react";
import "../index.css";

const stats = [
  { label: "Online Devices", value: "5", tone: "green", icon: "📶" },
  { label: "Offline Devices", value: "255", tone: "amber", icon: "📴" },
  { label: "Online Rate", value: "2%", tone: "blue", icon: "📈" },
  { label: "Offline Rate", value: "98%", tone: "purple", icon: "📉" }
];

const alarmTypes = [
  { label: "Storag...", value: 1003 },
  { label: "No dis...", value: 167 },
  { label: "No rec...", value: 167 },
  { label: "ARM T...", value: 7 }
];

const alarmTrend = [0.02, 0.03, 0.025, 0.028, 0.02, 0.03, 0.022, 0.026];
const onlineTrend = [0.015, 0.018, 0.016, 0.012, 0.02, 0.018, 0.017, 0.019];

const workTime = [
  { label: "KJX-482", value: 68 },
  { label: "T189", value: 52 },
  { label: "T136", value: 44 },
  { label: "TR-221", value: 39 },
  { label: "GH-17", value: 28 }
];

const makePolyline = (values: number[]) => {
  const max = Math.max(...values);
  const min = Math.min(...values);
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / (max - min || 1)) * 70 - 15;
      return `${x},${y}`;
    })
    .join(" ");
};

export default function VideoTelematicsDashboard() {
  const alarmMax = Math.max(...alarmTypes.map((item) => item.value));
  const workMax = Math.max(...workTime.map((item) => item.value));

  return (
    <div className="page video-telematics-page">
      <div className="vt-dashboard">
        <header className="vt-header">
          <div className="vt-header-left">
            <div className="vt-date-range">
              <span className="vt-date-pill">2026-01-17</span>
              <span className="vt-date-sep">To</span>
              <span className="vt-date-pill">2026-01-24</span>
            </div>
            <div className="vt-quick-links">
              <button
                className="vt-quick-link"
                type="button"
                data-nav="/monitor/videos/video-gallery"
              >
                Video gallery
              </button>
              <button
                className="vt-quick-link"
                type="button"
                data-nav="/monitor/videos/live-video-streaming"
              >
                Live video streaming
              </button>
              <button
                className="vt-quick-link"
                type="button"
                data-nav="/monitor/videos/device-remote-actions"
              >
                Device Remote Actions
              </button>
            </div>
          </div>
          <div className="vt-title">Vehicle Viewer</div>
          <div className="vt-clock">
            <div className="vt-time">01:30:57</div>
            <div className="vt-date">2026.01.24 Saturday</div>
          </div>
        </header>

        <section className="vt-stats">
          {stats.map((stat) => (
            <div key={stat.label} className="vt-stat-card">
              <div className={`vt-stat-icon ${stat.tone}`} aria-hidden="true">
                {stat.icon}
              </div>
              <div>
                <div className="vt-stat-label">{stat.label}</div>
                <div className="vt-stat-value">{stat.value}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="vt-grid">
          <div className="vt-col">
            <div className="vt-card">
              <div className="vt-card-title">Alarm Type Statistics Top 10</div>
              <div className="vt-donut-shell">
                <div className="vt-donut" style={{ "--pct": "72%" } as CSSProperties} />
              </div>
            </div>
            <div className="vt-card">
              <div className="vt-card-title">Top5 Devices exception</div>
              <div className="vt-bar-chart">
                {alarmTypes.map((item) => (
                  <div key={item.label} className="vt-bar-col">
                    <div
                      className="vt-bar"
                      style={{ height: `${Math.max((item.value / alarmMax) * 100, 6)}%` }}
                      title={`${item.value}`}
                    />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="vt-col vt-col-wide">
            <div className="vt-card">
              <div className="vt-card-title">Devices Alarm Trend</div>
              <div className="vt-line-chart">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline points={makePolyline(alarmTrend)} />
                </svg>
                <div className="vt-line-grid" />
                <div className="vt-line-axis">2026-01-17 — 2026-01-24</div>
              </div>
            </div>
            <div className="vt-card">
              <div className="vt-card-title">Devices Online Trend</div>
              <div className="vt-line-chart">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline points={makePolyline(onlineTrend)} />
                </svg>
                <div className="vt-line-grid" />
                <div className="vt-line-axis">2026-01-17 — 2026-01-24</div>
              </div>
            </div>
          </div>

          <div className="vt-col">
            <div className="vt-card">
              <div className="vt-card-title">Device Alarm Count Top 10</div>
              <div className="vt-donut-shell">
                <div className="vt-donut" style={{ "--pct": "64%" } as CSSProperties} />
              </div>
            </div>
            <div className="vt-card">
              <div className="vt-card-title">Device Work Time Top5</div>
              <div className="vt-bar-chart">
                {workTime.map((item) => (
                  <div key={item.label} className="vt-bar-col">
                    <div
                      className="vt-bar vt-bar-alt"
                      style={{ height: `${Math.max((item.value / workMax) * 100, 6)}%` }}
                      title={`${item.value} h`}
                    />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>


        <div className="vt-footer">
          Run Time: 00:10:24 · Total: 260 · Online: 5 · Offline: 255 · Web Platform: 3.2.0 · Server: 3.6.9.8
        </div>
      </div>
    </div>
  );
}
