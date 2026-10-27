import { lazyWithRetry as lazy } from "../../utils/lazyWithRetry";
import type { ModuleRouteComponent } from "../types";

/**
 * Mobile module — phone-shell home, profile, alerts, settings.
 */
export const MobileHome = lazy(() => import("../../pages/mobile/MobileHome"));
export const MobileProfile = lazy(() => import("../../pages/mobile/MobileProfile"));
export const MobileAlerts = lazy(() => import("../../pages/mobile/MobileAlerts"));
export const MobilePreview = lazy(() => import("../../pages/mobile/MobilePreview"));
export const MobilePersonalSettings = lazy(() => import("../../pages/mobile/MobilePersonalSettings"));

export const mobilePages = {
  MobileHome: MobileHome as ModuleRouteComponent,
  MobileProfile: MobileProfile as ModuleRouteComponent,
  MobileAlerts: MobileAlerts as ModuleRouteComponent,
  MobilePreview: MobilePreview as ModuleRouteComponent,
  MobilePersonalSettings: MobilePersonalSettings as ModuleRouteComponent
};

export const mobileModule = {
  id: "mobile" as const,
  label: "Mobile",
  pages: mobilePages
};
