import type { AppModuleId, ModuleRouteMap } from "./types";
import { analyzeModule, analyzeRouteComponents } from "./analyze/routes";
import { authModule } from "./auth/routes";
import { controlModule, controlRouteComponents } from "./control/routes";
import { deliverModule, deliverRouteComponents } from "./deliver/routes";
import { homeModule } from "./home/routes";
import { marketingModule } from "./marketing/routes";
import { mobileModule } from "./mobile/routes";
import { trackModule, trackRouteComponents } from "./track/routes";

export type { AppModuleId, ModuleRouteComponent, ModuleRouteMap } from "./types";

export {
  analyzeModule,
  authModule,
  controlModule,
  deliverModule,
  homeModule,
  marketingModule,
  mobileModule,
  trackModule
};

export { isMarketingPublicPath, MARKETING_PATH_PREFIXES } from "./marketing/routes";
export { authPages, Login, ResetPassword, LiveSharePublic } from "./auth/routes";
export {
  mobilePages,
  MobileHome,
  MobileProfile,
  MobileAlerts,
  MobilePreview,
  MobilePersonalSettings
} from "./mobile/routes";
export {
  marketingPages,
  MarketingLayout,
  MarketingHome,
  MarketingFeaturePage,
  MarketingContactPage,
  MarketingCategoryPage,
  MarketingSupportHubPage,
  MarketingInfoPage
} from "./marketing/routes";
export { homePages, Home } from "./home/routes";

/** All authenticated nav route components composed from feature modules. */
export const appRouteComponents: ModuleRouteMap = {
  ...trackRouteComponents,
  ...controlRouteComponents,
  ...analyzeRouteComponents,
  ...deliverRouteComponents
};

export const appModules = [
  homeModule,
  trackModule,
  controlModule,
  analyzeModule,
  deliverModule,
  authModule,
  mobileModule,
  marketingModule
] as const;

export function moduleIdForPath(path: string): AppModuleId {
  if (path.startsWith("/Track/")) return "track";
  if (path.startsWith("/Control/")) return "control";
  if (path.startsWith("/Analyze/")) return "analyze";
  if (path.startsWith("/Deliver/")) return "deliver";
  if (path.startsWith("/mobile")) return "mobile";
  if (path === "/login" || path === "/reset-password" || path.startsWith("/share/")) return "auth";
  if (path === "/") return "home";
  return "marketing";
}

/** Human-readable boundary label for ErrorBoundary titles. */
export function moduleLabelForPath(path: string): string {
  const id = moduleIdForPath(path);
  const match = appModules.find((module) => module.id === id);
  return match?.label ?? "Page";
}
