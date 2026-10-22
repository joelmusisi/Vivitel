import { lazyWithRetry as lazy } from "../../utils/lazyWithRetry";
import type { ModuleRouteMap } from "../types";

/**
 * Track module — fleet tracking, video, coaching, routes, HOS, info hub.
 * Edit pages under src/pages/ (and monitor/) without touching other modules' route maps.
 */
const LiveTracking = lazy(() => import("../../pages/LiveTracking"));
const HistoricalTracking = lazy(() => import("../../pages/HistoricalTracking"));
const TripTimeline = lazy(() => import("../../pages/TripTimeline"));
const VideoTelematicsDashboard = lazy(() => import("../../pages/VideoTelematicsDashboard"));
const VideoGallery = lazy(() => import("../../pages/VideoGallery"));
const LiveVideoStreaming = lazy(() => import("../../pages/LiveVideoStreaming"));
const DeviceRemoteActions = lazy(() => import("../../pages/DeviceRemoteActions"));
const FleetOverview = lazy(() => import("../../pages/FleetOverview"));
const Assets = lazy(() => import("../../pages/Assets"));
const Drivers = lazy(() => import("../../pages/Drivers"));
const Passengers = lazy(() => import("../../pages/Passengers"));
const DefaultOptions = lazy(() => import("../../pages/monitor/DefaultOptions"));
const MessageBox = lazy(() => import("../../pages/monitor/MessageBox"));
const InstantMessaging = lazy(() => import("../../pages/monitor/InstantMessaging"));
const DriverDebrief = lazy(() => import("../../pages/monitor/DriverDebrief"));
const Tasks = lazy(() => import("../../pages/monitor/Tasks"));
const Templates = lazy(() => import("../../pages/monitor/Templates"));
const Workers = lazy(() => import("../../pages/monitor/Workers"));
const Customers = lazy(() => import("../../pages/monitor/Customers"));
const Workflow = lazy(() => import("../../pages/monitor/journey/Workflow"));
const JourneyLibraries = lazy(() => import("../../pages/monitor/journey/Libraries"));
const JourneyTracking = lazy(() => import("../../pages/monitor/journey/Monitoring"));
const ResourceAllocation = lazy(() => import("../../pages/monitor/journey/ResourceAllocation"));
const HosDashboard = lazy(() => import("../../pages/monitor/hos/Dashboard"));
const HosOverview = lazy(() => import("../../pages/monitor/hos/Overview"));
const HosTimeline = lazy(() => import("../../pages/monitor/hos/Timeline"));
const HosLogViewer = lazy(() => import("../../pages/monitor/hos/LogViewer"));
const HosNotifications = lazy(() => import("../../pages/monitor/hos/Notifications"));
const HosTimeclock = lazy(() => import("../../pages/monitor/hos/Timeclock"));
const EasyTrack = lazy(() => import("../../pages/monitor/tracking/EasyTrack"));
const ControlLocations = lazy(() => import("../../pages/monitor/tracking/ManageLocations"));
const ControlRoadHazards = lazy(() => import("../../pages/monitor/tracking/ManageRoadHazards"));
const Streams = lazy(() => import("../../pages/monitor/infoHub/Streams"));

export const trackRouteComponents: ModuleRouteMap = {
  "/Track/tracking/live": LiveTracking,
  "/Track/tracking/historical": HistoricalTracking,
  "/Track/activity/trip-timeline": TripTimeline,
  "/Track/videos/dashboard": VideoTelematicsDashboard,
  "/Track/videos/video-gallery": VideoGallery,
  "/Track/videos/live-video-streaming": LiveVideoStreaming,
  "/Track/videos/device-remote-actions": DeviceRemoteActions,
  "/Track/overview/fleet": FleetOverview,
  "/Track/fleet/assets": Assets,
  "/Track/fleet/drivers": Drivers,
  "/Track/fleet/passengers": Passengers,
  "/Track/jobs/default-options": DefaultOptions,
  "/Track/jobs/message-box": MessageBox,
  "/Track/jobs/instant-messaging": InstantMessaging,
  "/Track/coaching/driver-debrief": DriverDebrief,
  "/Track/tasks/tasks": Tasks,
  "/Track/tasks/templates": Templates,
  "/Track/tasks/workers": Workers,
  "/Track/fleet/customers": Customers,
  "/Track/routes/workflow": Workflow,
  "/Track/routes/libraries": JourneyLibraries,
  "/Track/routes/Tracking": JourneyTracking,
  "/Track/routes/resource-allocation": ResourceAllocation,
  // Legacy aliases (pre Routes rename)
  "/Track/journey/workflow": Workflow,
  "/Track/journey/libraries": JourneyLibraries,
  "/Track/journey/Tracking": JourneyTracking,
  "/Track/journey/resource-allocation": ResourceAllocation,
  "/Track/hos/dashboard": HosDashboard,
  "/Track/hos/overview": HosOverview,
  "/Track/hos/timeline": HosTimeline,
  "/Track/hos/log-viewer": HosLogViewer,
  "/Track/hos/notifications": HosNotifications,
  "/Track/hos/timeclock": HosTimeclock,
  "/Track/tracking/easytrack": EasyTrack,
  "/Track/tracking/Control-locations": ControlLocations,
  "/Track/tracking/Control-road-hazards": ControlRoadHazards,
  "/Track/info-hub/streams": Streams
};

export const trackModule = {
  id: "track" as const,
  label: "Track",
  routeComponents: trackRouteComponents
};
