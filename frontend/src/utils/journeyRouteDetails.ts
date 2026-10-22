import type { JourneyStatusOption, TrackingHealth } from "./journeyCatalog";
import { formatRouteSchedule, type RouteLibraryRecord, type RouteStopDraft } from "./journeyRouteLibraryStore";

export type LatLng = [number, number];

export type JourneyStop = {
  id: string;
  name: string;
  kind: "start" | "stop" | "rest" | "destination";
  lat: number;
  lng: number;
  eta: string;
  status: "pending" | "arrived" | "skipped" | "current";
  dwellMinutes?: number;
};

export type JourneyTimelineEvent = {
  id: string;
  at: string;
  title: string;
  detail: string;
  tone: "info" | "ok" | "warn" | "critical";
};

export type JourneyRouteDetail = {
  journeyId: string;
  routeName: string;
  workflowName: string;
  site: string;
  region: string;
  driver: { name: string; phone: string; license: string };
  vehicle: { registration: string; make: string; type: string };
  plannedPath: LatLng[];
  coveredPath: LatLng[];
  progressPercent: number;
  stops: JourneyStop[];
  started: boolean;
  departedAt?: string;
  etaDestination: string;
  distanceKm: number;
  coveredKm: number;
  fuelUsedLiters: number;
  fuelRateLPer100Km: number;
  speedAvgKph: number;
  health: TrackingHealth;
  exception?: JourneyStatusOption;
  lead: string;
  timeline: JourneyTimelineEvent[];
};

const FALLBACK_CENTER: LatLng = [49.2827, -123.1207];

function formatClock(iso?: string): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  return new Date(ts).toLocaleString();
}

function stopKind(kind: RouteStopDraft["kind"]): JourneyStop["kind"] {
  return kind === "start" || kind === "destination" || kind === "rest" ? kind : "stop";
}

function buildPathFromStops(stops: RouteStopDraft[]): LatLng[] {
  const path = stops
    .filter((stop) => typeof stop.lat === "number" && typeof stop.lng === "number")
    .map((stop) => [stop.lat as number, stop.lng as number] as LatLng);
  return path.length ? path : [FALLBACK_CENTER];
}

/** Build map/timeline detail from a real library route (no mock geometry). */
export function buildRouteDetailFromLibrary(row: RouteLibraryRecord): JourneyRouteDetail {
  const plannedPath = buildPathFromStops(row.stops);
  const stops: JourneyStop[] = row.stops.map((stop, index) => ({
    id: `${row.id}-stop-${index}`,
    name: stop.name,
    kind: stopKind(stop.kind),
    lat: typeof stop.lat === "number" ? stop.lat : plannedPath[Math.min(index, plannedPath.length - 1)][0],
    lng: typeof stop.lng === "number" ? stop.lng : plannedPath[Math.min(index, plannedPath.length - 1)][1],
    eta: formatRouteSchedule(row.scheduledFor),
    status: "pending"
  }));

  const timeline: JourneyTimelineEvent[] = [
    {
      id: `${row.id}-created`,
      at: formatClock(row.createdAt),
      title: "Route created",
      detail: row.description || `${row.origin} → ${row.destination}`,
      tone: "info"
    }
  ];
  if (row.scheduledAt || row.scheduledFor) {
    timeline.push({
      id: `${row.id}-scheduled`,
      at: formatClock(row.scheduledAt || row.scheduledFor),
      title: "Routes scheduled",
      detail: `Owner ${row.owner || "—"} · ${formatRouteSchedule(row.scheduledFor)}`,
      tone: "info"
    });
  }
  if (row.allocationStatus === "allocated") {
    timeline.push({
      id: `${row.id}-allocated`,
      at: formatClock(row.allocatedAt || row.updatedAt),
      title: "Asset & driver allocated",
      detail: `${row.assetRegistration || "Vehicle"} · ${row.driverName || "Driver"}`,
      tone: "ok"
    });
  }
  timeline.push({
    id: `${row.id}-pending`,
    at: "Pending",
    title: "Awaiting departure",
    detail: "Tracking will update when the run is live.",
    tone: "info"
  });

  return {
    journeyId: row.id,
    routeName: row.name,
    workflowName: row.owner ? `Workflow · ${row.owner}` : "Workflow",
    site: row.site,
    region: row.owner || row.site,
    driver: {
      name: row.driverName || "—",
      phone: "—",
      license: "—"
    },
    vehicle: {
      registration: row.assetRegistration || "—",
      make: row.assetDescription || "—",
      type: row.assetDescription || "Asset"
    },
    plannedPath,
    coveredPath: [],
    progressPercent: 0,
    stops,
    started: false,
    etaDestination: formatRouteSchedule(row.scheduledFor),
    distanceKm: 0,
    coveredKm: 0,
    fuelUsedLiters: 0,
    fuelRateLPer100Km: 0,
    speedAvgKph: 0,
    health: "stable",
    lead: row.owner || "Dispatch",
    timeline
  };
}

export function getJourneyRouteDetailFromRecord(row: RouteLibraryRecord | null | undefined): JourneyRouteDetail | null {
  if (!row) return null;
  return buildRouteDetailFromLibrary(row);
}
