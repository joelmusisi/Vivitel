/**
 * Official VIVI feature marketing graphics (slides 01–06 + hardware).
 * Installed via scripts/install-marketing-feature-assets.py
 */

const F = (name: string) => `/marketing/features/${name}.jpg`;
const W = (path: string) => `/marketing/welcome/${path}`;
const C = (path: string) => `/marketing/categories/${path}`;

export const MARKETING_FEATURE_IMAGES = {
  liveGpsTracking: F("live-gps-tracking"),
  aiDriverSafety: F("ai-driver-safety"),
  fleetAnalytics: F("fleet-analytics"),
  cloudFleetVisibility: F("cloud-fleet-visibility"),
  vehicleLiveTracked: F("vehicle-live-tracked"),
  driverDashcam: F("driver-dashcam"),
  hardwareDevices: F("hardware-devices")
} as const;

/** Storyboard — nine distinct topic images */
export const MARKETING_PANEL_IMAGE: Record<string, string> = {
  intro: MARKETING_FEATURE_IMAGES.cloudFleetVisibility,
  "fleet-visibility": MARKETING_FEATURE_IMAGES.vehicleLiveTracked,
  "gps-tracking": MARKETING_FEATURE_IMAGES.liveGpsTracking,
  "harsh-braking": MARKETING_FEATURE_IMAGES.driverDashcam,
  "route-history": W("fleet-performance.jpg"),
  "driver-fatigue": MARKETING_FEATURE_IMAGES.aiDriverSafety,
  "fuel-monitoring": MARKETING_FEATURE_IMAGES.fleetAnalytics,
  "hardware-devices": MARKETING_FEATURE_IMAGES.hardwareDevices,
  "powerful-insights": W("home-hero.jpg")
};

export function featureImageForPanel(panelId: string): string {
  return MARKETING_PANEL_IMAGE[panelId] ?? MARKETING_FEATURE_IMAGES.cloudFleetVisibility;
}

/** Shop by category — six distinct lifestyle images (not used in storyboard grid) */
export const MARKETING_CATEGORY_TILE_IMAGES = {
  "fleet-tracking": C("fleet-tracking.jpg"),
  "auto-home": C("auto-home.jpg"),
  "safety-compliance": W("auto-hero.jpg"),
  "field-operations": W("wearable-hero.jpg"),
  marine: C("marine.jpg"),
  "enterprise-aviation": W("marine-hero.jpg")
} as const;
