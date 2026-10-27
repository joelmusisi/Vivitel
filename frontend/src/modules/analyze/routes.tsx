import { lazyWithRetry as lazy } from "../../utils/lazyWithRetry";
import type { ModuleRouteMap } from "../types";

/**
 * Analyze module — dashboards, reports, insight tools, analysers.
 */
const Dashboards = lazy(() => import("../../pages/measure/Dashboards"));
const Reports = lazy(() => import("../../pages/measure/Reports"));
const InsightAgility = lazy(() => import("../../pages/measure/InsightAgility"));
const Subscriptions = lazy(() => import("../../pages/measure/Subscriptions"));
const NotificationAnalyser = lazy(() => import("../../pages/measure/EventAnalyser"));
const LocationAnalyser = lazy(() => import("../../pages/measure/LocationAnalyser"));

export const analyzeRouteComponents: ModuleRouteMap = {
  "/Analyze/insights/dashboards": Dashboards,
  "/Analyze/insights/reports": Reports,
  "/Analyze/insights/Vivi-insight-agility": InsightAgility,
  "/Analyze/insights/subscriptions": Subscriptions,
  "/Analyze/insights/Notification-analyser": NotificationAnalyser,
  "/Analyze/insights/location-analyser": LocationAnalyser
};

export const analyzeModule = {
  id: "analyze" as const,
  label: "Analyze",
  routeComponents: analyzeRouteComponents
};
