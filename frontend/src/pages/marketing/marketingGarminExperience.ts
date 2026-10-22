/** Garmin-style homepage experience — VIVI Telematics branded. */

export type WelcomeSlide = {
  id: string;
  kicker?: string;
  title: string;
  subtitle: string;
  cta: string;
  to: string;
  background: string;
  productId?: string;
  usePitchHardware?: boolean;
  featured?: boolean;
};

export type ShopCategoryTile = {
  slug: string;
  label: string;
  image: string;
  to: string;
};

export type PromoBanner = {
  id: string;
  title: string;
  cta: string;
  to: string;
  image: string;
  span?: "normal" | "wide";
};

export type ProductLineupCard = {
  id: string;
  title: string;
  subtitle: string;
  lifestyle: string;
  to: string;
  productIds: string[];
};

const W = (path: string) => `/marketing/welcome/${path}`;
const C = (path: string) => `/marketing/categories/${path}`;
import {
  featureImageForPanel,
  MARKETING_CATEGORY_TILE_IMAGES,
  MARKETING_FEATURE_IMAGES
} from "./marketingFeatureImages";

const PANEL = featureImageForPanel;

export const MARKETING_WELCOME_SLIDES: WelcomeSlide[] = [
  {
    id: "platform",
    kicker: "Featured",
    title: "Smarter Fleets. Safer Roads.",
    subtitle: "VIVI Telematics — one connected fleet platform",
    cta: "Open page",
    to: "/solutions/platform",
    background: MARKETING_FEATURE_IMAGES.cloudFleetVisibility,
    featured: true
  },
  {
    id: "tracking",
    kicker: "Live GPS",
    title: "Real-time location. Every vehicle.",
    subtitle: "Open the dedicated GPS tracking page",
    cta: "Open page",
    to: "/solutions/tracking",
    background: MARKETING_FEATURE_IMAGES.liveGpsTracking
  },
  {
    id: "safety",
    title: "Harsh braking detected",
    subtitle: "Video telematics with evidence",
    cta: "Open page",
    to: "/solutions/safety",
    background: MARKETING_FEATURE_IMAGES.aiDriverSafety
  },
  {
    id: "hardware",
    title: "Dashcams, trackers & sensors",
    subtitle: "Official VIVI hardware storyboard",
    cta: "Open page",
    to: "/solutions/hardware",
    background: MARKETING_FEATURE_IMAGES.hardwareDevices,
    usePitchHardware: true
  },
  {
    id: "analytics",
    title: "Powerful insights",
    subtitle: "Dashboards on laptop and mobile",
    cta: "Open page",
    to: "/solutions/analytics",
    background: W("fleet-performance.jpg")
  }
];

/** Category tiles for the public homepage — current product areas only. */
export const MARKETING_SHOP_CATEGORY_TILES: ShopCategoryTile[] = [
  {
    slug: "fleet-tracking",
    label: "Fleet Tracking",
    image: MARKETING_CATEGORY_TILE_IMAGES["fleet-tracking"],
    to: "/catalog/fleet-tracking"
  },
  {
    slug: "safety-compliance",
    label: "Safety & Video",
    image: MARKETING_CATEGORY_TILE_IMAGES["safety-compliance"],
    to: "/catalog/safety-compliance"
  },
  {
    slug: "field-operations",
    label: "Field Operations",
    image: MARKETING_CATEGORY_TILE_IMAGES["field-operations"],
    to: "/catalog/field-operations"
  },
  {
    slug: "transport-logistics",
    label: "Transport & Logistics",
    image: MARKETING_FEATURE_IMAGES.fleetAnalytics,
    to: "/catalog/transport-logistics"
  }
];

export function getShopCategoryImage(slug: string): string | undefined {
  return MARKETING_SHOP_CATEGORY_TILES.find((tile) => tile.slug === slug)?.image;
}

export const MARKETING_PROMO_BANNERS: PromoBanner[] = [
  {
    id: "health",
    title: "MONITOR DRIVERS WITH VIVI TELEMATICS HEALTH",
    cta: "Open page",
    to: "/solutions/driver-fatigue",
    image: W("marine-hero.jpg")
  },
  {
    id: "fuel",
    title: "FUEL INTELLIGENCE TO ELEVATE YOUR FLEET",
    cta: "Open page",
    to: "/solutions/fuel",
    image: C("auto-home.jpg")
  },
  {
    id: "video",
    title: "VIDEO TELEMATICS FOR EVERY VEHICLE",
    cta: "Open page",
    to: "/solutions/dashcam",
    image: MARKETING_FEATURE_IMAGES.liveGpsTracking
  },
  {
    id: "performance",
    title: "GPS TRACKERS, DASHCAMS, RADAR AND FUEL SENSORS",
    cta: "Open page",
    to: "/solutions/hardware",
    image: MARKETING_FEATURE_IMAGES.hardwareDevices,
    span: "wide"
  },
  {
    id: "platform",
    title: "YOUR CUSTOM FLEET PLATFORM IS WAITING",
    cta: "Open page",
    to: "/solutions/platform",
    image: MARKETING_FEATURE_IMAGES.cloudFleetVisibility,
    span: "wide"
  }
];

export const MARKETING_PRODUCT_LINEUPS: ProductLineupCard[] = [
  {
    id: "track-series",
    title: "VIVI Track™ — Fleet wearables for any role",
    subtitle: "From depot to highway — alerts on the wrist",
    lifestyle: W("wearable-hero.jpg"),
    to: "/solutions/tracking",
    productIds: ["vivi-track-wearable", "gps-tracker", "mobile-fleet"]
  },
  {
    id: "pro-series",
    title: "VIVI Pro™ — The ultimate field fleet device",
    subtitle: "Rugged GPS, maps, and messaging for demanding operations",
    lifestyle: W("marine-hero.jpg"),
    to: "/catalog/field-operations",
    productIds: ["handheld-gps", "fleet-radio", "in-cab-display"]
  }
];
