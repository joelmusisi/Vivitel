import L from "leaflet";

const TRIP_START_FLAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
  <ellipse cx="8.2" cy="45.4" rx="7.4" ry="2.1" fill="#0f172a" opacity="0.28"/>
  <path d="M8.2 3.8 L8.2 44.6" stroke="#334155" stroke-width="3.1" stroke-linecap="round"/>
  <path d="M8.2 3.8 L8.2 44.6" stroke="#e2e8f0" stroke-width="1.35" stroke-linecap="round"/>
  <circle cx="8.2" cy="4.1" r="2.35" fill="#f8fafc" stroke="#1e3a8a" stroke-width="0.9"/>
  <path d="M9.4 6.1 L29.2 6.1 L24.4 12.55 L29.6 19.2 L9.4 19.2 Z" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="0.7" stroke-linejoin="round"/>
  <path d="M9.4 6.1 L28.4 6.1 L23.8 12.4 L28.8 18.3 L9.4 18.3 Z" fill="#3b82f6"/>
  <path d="M10.6 7.4 L25.4 7.4 L22.2 12.45 L25.8 17.8 L10.6 17.8 Z" fill="#93c5fd" opacity="0.32"/>
  <path d="M9.4 6.1 L9.4 19.2" stroke="#dbeafe" stroke-width="1.2" stroke-linecap="round"/>
  <circle cx="8.2" cy="12.6" r="1.15" fill="#bfdbfe" stroke="#1e3a8a" stroke-width="0.55"/>
</svg>`;

export const tripStartFlagIcon = L.icon({
  iconUrl: `data:image/svg+xml;base64,${btoa(TRIP_START_FLAG_SVG)}`,
  iconSize: [36, 48],
  iconAnchor: [8, 46],
  popupAnchor: [10, -40]
});
