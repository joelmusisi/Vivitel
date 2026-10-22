import { lazyWithRetry as lazy } from "../../utils/lazyWithRetry";
import type { ModuleRouteComponent } from "../types";

/**
 * Home module — authenticated desktop landing dashboard.
 */
export const Home = lazy(() => import("../../pages/Home"));

export const homePages = {
  Home: Home as ModuleRouteComponent
};

export const homeModule = {
  id: "home" as const,
  label: "Home",
  pages: homePages
};
