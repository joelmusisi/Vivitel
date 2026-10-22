import L from "leaflet";

export type LiveAssetMapStatus = "online" | "warning" | "stale" | "offline";

/** Same truck marker used on Live Tracking. */
export function buildLiveAssetMapIcon(options?: {
  status?: LiveAssetMapStatus | string;
  showDirectionArrow?: boolean;
  headingDeg?: number;
}) {
  const status = String(options?.status ?? "online").trim().toLowerCase();
  const showDirectionArrow = Boolean(options?.showDirectionArrow);
  const dir = Number.isFinite(options?.headingDeg) ? Number(options?.headingDeg) : 0;

  let borderColor = "#16a34a";
  let beakColor = "#16a34a";
  let statusDot = "#16a34a";
  if (status === "warning") {
    borderColor = "#94a3b8";
    beakColor = "#94a3b8";
    statusDot = "#94a3b8";
  } else if (status === "stale") {
    borderColor = "#d4b896";
    beakColor = "#d4b896";
    statusDot = "#d4b896";
  } else if (status === "offline" || status === "critical") {
    borderColor = "#800000";
    beakColor = "#800000";
    statusDot = "#800000";
  }

  const directionSvg = showDirectionArrow
    ? `<g transform='rotate(${dir},28,28)'>
        <path d='M28 2.5 L33 13.5 L23 13.5 Z' fill='${beakColor}' stroke='#ffffff' stroke-width='1.4' stroke-linejoin='round'/>
      </g>`
    : "";

  const statusDotSvg = showDirectionArrow
    ? ""
    : `<circle cx='13' cy='42' r='5.2' fill='${statusDot}' stroke='#ffffff' stroke-width='2'/>`;

  const svg = `<svg width='56' height='56' viewBox='0 0 56 56' xmlns='http://www.w3.org/2000/svg'>
      <defs>
        <filter id='shadow' x='-40%' y='-40%' width='180%' height='180%'>
          <feDropShadow dx='0' dy='2' stdDeviation='1.8' flood-color='rgba(15,23,42,0.32)'/>
        </filter>
      </defs>
      <g filter='url(#shadow)'>
        <circle cx='28' cy='28' r='18' fill='#ffffff' stroke='${borderColor}' stroke-width='3'/>
        <g transform='translate(15.5,18.5)'>
          <rect x='1' y='7.5' width='11.5' height='5.8' rx='1.4' fill='#2563eb' stroke='#1d4ed8' stroke-width='1'/>
          <path d='M12.5 8h4.8l2.2 3v2.8h-9z' fill='#3b82f6' stroke='#1d4ed8' stroke-width='1' stroke-linejoin='round'/>
          <circle cx='4.2' cy='15.2' r='2.1' fill='#1e40af'/>
          <circle cx='16.8' cy='15.2' r='2.1' fill='#1e40af'/>
          <path d='M2 6.8V5.2h5.4V6.8' fill='none' stroke='#1d4ed8' stroke-width='1.3' stroke-linecap='round'/>
        </g>
        ${statusDotSvg}
      </g>
      ${directionSvg}
    </svg>`;

  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    popupAnchor: [0, -24]
  });
}

export function journeyHealthToMapStatus(health: string): LiveAssetMapStatus {
  const value = String(health ?? "").trim().toLowerCase();
  if (value === "warning") return "warning";
  if (value === "critical") return "offline";
  return "online";
}
