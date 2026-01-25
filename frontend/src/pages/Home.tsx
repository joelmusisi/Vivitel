import "../index.css";
import { useNavigate } from "react-router-dom";

type Tile = {
  label: string;
  path: string;
  icon: JSX.Element;
  highlighted?: boolean;
};

const tiles: Tile[] = [
  { label: "DASHBOARDS", path: "/measure/insights/dashboards", icon: iconChart() },
  { label: "LIVE TRACKING", path: "/monitor/tracking/live", icon: iconMap() },
  { label: "TRIP TIMELINE", path: "/monitor/activity/trip-timeline", icon: iconLineChart(), highlighted: true },
  { label: "ASSETS", path: "/monitor/fleet/assets", icon: iconTruck() },
  { label: "DRIVERS", path: "/monitor/fleet/drivers", icon: iconUser() },
  { label: "CONFIGURATION GROUPS", path: "/monitor/fleet/organisation-groups", icon: iconCog() },
  { label: "VIDEO GALLERY", path: "/monitor/videos/video-gallery", icon: iconVideo() },
  { label: "HISTORICAL TRACKING", path: "/monitor/tracking/historical", icon: iconCalendar() },
  { label: "STREAMS", path: "/monitor/info-hub/streams", icon: iconNetwork() },
  { label: "REPORTS", path: "/measure/insights/reports", icon: iconReport() },
  { label: "LOCATION ANALYSER", path: "/measure/insights/location-analyser", icon: iconPin() }
];

export function Home() {
  const navigate = useNavigate();

  return (
    <main className="page">
      <div className="home-crumb">Home</div>
      <div className="tiles">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            className="tile"
            onClick={() => navigate(tile.path)}
          >
            {tile.icon}
            <span className="tile-label">{tile.label}</span>
          </button>
        ))}
      </div>
      <div className="token-card" style={{ background: "#e9f6f2", color: "#065f46" }}>
        An alternate homepage can be set by selecting the ★ on your preferred screen.
      </div>
    </main>
  );
}

export default Home;

function iconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor">
      <path d="M4 4v16h16" />
      <path d="M7 14l3-4 3 3 4-6" />
    </svg>
  );
}

function iconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor">
      <path d="M9.5 7.5a2.5 2.5 0 115 0C14.5 10 12 13 12 13s-2.5-3-2.5-5.5z" />
      <circle cx="12" cy="7.5" r="0.8" />
      <path d="M7 6l-3 1.5v10l3-1.5 3 1.5 4-2 3 1.5 3-1.5v-10l-3 1.5-3-1.5-4 2z" />
    </svg>
  );
}

function iconLineChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor">
      <path d="M4 18l5-6 4 3 7-9" />
      <path d="M4 4v16h16" />
    </svg>
  );
}

function iconTruck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor">
      <path d="M3 7h11v7H3z" />
      <path d="M14 9h3l3 3v2h-6z" />
      <circle cx="7" cy="16" r="1.2" />
      <circle cx="17" cy="16" r="1.2" />
    </svg>
  );
}

function iconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor">
      <circle cx="12" cy="8" r="3" />
      <path d="M6 18c0-2.5 2.7-4 6-4s6 1.5 6 4" />
    </svg>
  );
}

function iconCog() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function iconVideo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor">
      <rect x="4" y="6" width="11" height="12" rx="2" />
      <path d="M15 10l5-3v10l-5-3z" />
    </svg>
  );
}

function iconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor">
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  );
}

function iconNetwork() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor">
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5l2.5-2.5M15 9l2.5-2.5" />
    </svg>
  );
}

function iconReport() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor">
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function iconPin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor">
      <path d="M12 21s6-5 6-11a6 6 0 10-12 0c0 6 6 11 6 11z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}
