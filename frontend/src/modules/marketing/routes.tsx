import { lazyWithRetry as lazy } from "../../utils/lazyWithRetry";
import type { ModuleRouteComponent } from "../types";

/**
 * Marketing module — public website pages (layout + feature surfaces).
 */
export const MarketingLayout = lazy(() => import("../../components/marketing/MarketingLayout"));
export const MarketingHome = lazy(() => import("../../pages/marketing/MarketingHome"));
export const MarketingFeaturePage = lazy(() => import("../../pages/marketing/MarketingFeaturePage"));
export const MarketingContactPage = lazy(() => import("../../pages/marketing/MarketingContactPage"));
export const MarketingCategoryPage = lazy(() => import("../../pages/marketing/MarketingCategoryPage"));
export const MarketingSupportHubPage = lazy(() => import("../../pages/marketing/MarketingSupportHubPage"));
export const MarketingInfoPage = lazy(() => import("../../pages/marketing/MarketingInfoPage"));

export const marketingPages = {
  MarketingLayout: MarketingLayout as ModuleRouteComponent,
  MarketingHome: MarketingHome as ModuleRouteComponent,
  MarketingFeaturePage: MarketingFeaturePage as ModuleRouteComponent,
  MarketingContactPage: MarketingContactPage as ModuleRouteComponent,
  MarketingCategoryPage: MarketingCategoryPage as ModuleRouteComponent,
  MarketingSupportHubPage: MarketingSupportHubPage as ModuleRouteComponent,
  MarketingInfoPage: MarketingInfoPage as ModuleRouteComponent
};

export const MARKETING_PATH_PREFIXES = [
  "/features/",
  "/solutions/",
  "/catalog/",
  "/discover/",
  "/company/",
  "/business/",
  "/support/"
];

export function isMarketingPublicPath(pathname: string): boolean {
  if (
    pathname === "/contact" ||
    pathname === "/promotions" ||
    pathname === "/support" ||
    pathname === "/stories" ||
    pathname.startsWith("/stories/")
  ) {
    return true;
  }
  return MARKETING_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export const marketingModule = {
  id: "marketing" as const,
  label: "Marketing",
  pages: marketingPages,
  isPublicPath: isMarketingPublicPath
};
