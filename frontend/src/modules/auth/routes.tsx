import { lazyWithRetry as lazy } from "../../utils/lazyWithRetry";
import type { ModuleRouteComponent } from "../types";

/**
 * Auth module — login, password reset, public live share.
 * Keeps auth pages isolated from product modules.
 */
export const Login = lazy(() => import("../../pages/Login"));
export const ResetPassword = lazy(() => import("../../pages/ResetPassword"));
export const LiveSharePublic = lazy(() => import("../../pages/LiveSharePublic"));

export const authPages = {
  Login: Login as ModuleRouteComponent,
  ResetPassword: ResetPassword as ModuleRouteComponent,
  LiveSharePublic: LiveSharePublic as ModuleRouteComponent
};

export const authModule = {
  id: "auth" as const,
  label: "Auth",
  pages: authPages
};
