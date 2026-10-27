/** Shared Routes catalog — pipeline, status options, and deep links. */

export const JOURNEY_STATUS_OPTIONS = [
  "Delayed",
  "Missed",
  "Off Plan",
  "Out Of Sequence",
  "Potential delay",
  "Potential slight delay",
  "Slight Delay",
  "Slight Deviation",
  "Arrived early",
  "Held at waypoint",
  "Detour active",
  "Awaiting clearance",
  "Resource shortfall",
  "Comms lost",
  "Eta revised"
] as const;

export type JourneyStatusOption = (typeof JOURNEY_STATUS_OPTIONS)[number];

export type JourneyStage =
  | "libraries"
  | "workflow"
  | "resource-allocation"
  | "tracking";

export const JOURNEY_PIPELINE: Array<{
  id: JourneyStage;
  label: string;
  path: string;
  blurb: string;
}> = [
  {
    id: "libraries",
    label: "Libraries",
    path: "/Track/routes/libraries",
    blurb: "Saved routes archive"
  },
  {
    id: "workflow",
    label: "Workflow",
    path: "/Track/routes/workflow",
    blurb: "Schedule library routes"
  },
  {
    id: "resource-allocation",
    label: "Resource allocation",
    path: "/Track/routes/resource-allocation",
    blurb: "Assign asset & driver"
  },
  {
    id: "tracking",
    label: "Tracking",
    path: "/Track/routes/Tracking",
    blurb: "Live exceptions & alerts"
  }
];

export type TrackingHealth = "stable" | "warning" | "critical";

export const ROUTES_REPORTS_PATH =
  "/Analyze/insights/reports?category=Routes%20Reports";

export const LIVE_TRACKING_PATH = "/Track/tracking/live";
export const TRIP_TIMELINE_PATH = "/Track/activity/trip-timeline";
export const STREAMS_PATH = "/Track/info-hub/streams";
export const NOTIFICATIONS_BINDINGS_PATH = "/Control/config/templates";
