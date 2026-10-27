import type { ComponentType, LazyExoticComponent } from "react";

/** Lazy or eager page component registered by a feature module. */
export type ModuleRouteComponent = ComponentType | LazyExoticComponent<ComponentType>;

/** Path → page component map owned by one feature module. */
export type ModuleRouteMap = Record<string, ModuleRouteComponent>;

export type AppModuleId =
  | "track"
  | "control"
  | "analyze"
  | "deliver"
  | "auth"
  | "mobile"
  | "marketing"
  | "home";
