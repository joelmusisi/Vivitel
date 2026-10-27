import { VIVI_BRAND } from "./marketingBrand";

/** Garmin-style hardware catalog — VIVI Telematics product photography (white-background shots). */

export type MarketingProduct = {
  id: string;
  name: string;
  tagline: string;
  categorySlug: string;
  to: string;
  image: string;
};

const P = (file: string) => `/marketing/products/${file}`;

export const MARKETING_PRODUCTS: MarketingProduct[] = [
  {
    id: "vivi-track-wearable",
    name: "VIVI Track™ Wearable",
    tagline: "Driver GPS & safety alerts on the wrist",
    categorySlug: "fleet-tracking",
    to: "/solutions/tracking",
    image: P("product-vivi-track-wearable.jpg")
  },
  {
    id: "gps-tracker",
    name: "VIVI Fleet GPS Tracker",
    tagline: "Hardwired & OBD real-time location",
    categorySlug: "fleet-tracking",
    to: "/solutions/hardware",
    image: P("product-gps-tracker.jpg")
  },
  {
    id: "dashcam-ai",
    name: "VIVI Dash AI™",
    tagline: "Dual-view AI dashcam with cloud events",
    categorySlug: "safety-compliance",
    to: "/solutions/dashcam",
    image: VIVI_BRAND.hardwarePanelImage
  },
  {
    id: "handheld-gps",
    name: "VIVI Field Handheld",
    tagline: "Rugged GPS for supervisors & field ops",
    categorySlug: "field-operations",
    to: "/discover/field-service",
    image: P("product-handheld-gps.jpg")
  },
  {
    id: "fuel-module",
    name: "VIVI Fuel Link™",
    tagline: "Refill, siphon & level intelligence",
    categorySlug: "transport-logistics",
    to: "/solutions/fuel",
    image: P("product-fuel-module.jpg")
  },
  {
    id: "delivery-drone",
    name: "VIVI Deliver Drone",
    tagline: "Autonomous delivery visibility module",
    categorySlug: "specialised-assets",
    to: "/solutions/platform",
    image: P("product-delivery-drone.jpg")
  },
  {
    id: "in-cab-display",
    name: "VIVI Cab Display 7″",
    tagline: "In-vehicle fleet map & messaging",
    categorySlug: "transport-logistics",
    to: "/solutions/visibility",
    image: P("product-in-cab-display.jpg")
  },
  {
    id: "fleet-radio",
    name: "VIVI Signal™ Radio",
    tagline: "Fleet voice & dispatch communicator",
    categorySlug: "specialised-assets",
    to: "/solutions/support",
    image: P("product-fleet-radio.jpg")
  },
  {
    id: "cold-chain",
    name: "VIVI Cold Chain Logger",
    tagline: "Temperature compliance for reefers",
    categorySlug: "transport-logistics",
    to: "/discover/cold-chain",
    image: P("product-cold-chain.jpg")
  },
  {
    id: "mobile-fleet",
    name: "VIVI Mobile Fleet App",
    tagline: "Live map & alerts on any smartphone",
    categorySlug: "field-operations",
    to: "/discover/mobile-app",
    image: P("product-mobile-fleet.jpg")
  }
];

/** Garmin-style hero promos (Father's Day / Forerunner style) with product shots */
export const MARKETING_PRODUCT_HEROES = [
  {
    id: "hero-wearable",
    kicker: "New wearables",
    title: "VIVI TRACK™ 70 & 170",
    subtitle: "Easy-to-use GPS wearables for drivers and supervisors",
    to: "/solutions/tracking",
    productId: "vivi-track-wearable"
  },
  {
    id: "hero-dashcam",
    kicker: "Video telematics",
    title: "VIVI DASH AI™ PRO",
    subtitle: "Road and cabin AI with instant cloud clips",
    to: "/solutions/dashcam",
    productId: "dashcam-ai"
  },
  {
    id: "hero-radio",
    kicker: "Fleet communications",
    title: "VIVI SIGNAL™",
    subtitle: "Voice, dispatch & alerts in one rugged radio",
    to: "/solutions/support",
    productId: "fleet-radio"
  },
  {
    id: "hero-drone",
    kicker: "Deliver module",
    title: "VIVI DELIVER DRONE",
    subtitle: "See routes, mapping, navigation and more",
    to: "/solutions/platform",
    productId: "delivery-drone"
  }
] as const;

export function getMarketingProduct(id: string): MarketingProduct | undefined {
  return MARKETING_PRODUCTS.find((row) => row.id === id);
}

export function getProductsForCategory(categorySlug: string): MarketingProduct[] {
  return MARKETING_PRODUCTS.filter((row) => row.categorySlug === categorySlug);
}

export function productImageForHero(productId: string): string {
  return getMarketingProduct(productId)?.image ?? "/marketing/hero-fleet-tracking.jpg";
}

/** Feature solution pages → product photo when available */
export const FEATURE_PRODUCT_MAP: Record<string, string> = {
  tracking: "vivi-track-wearable",
  safety: "dashcam-ai",
  dashcam: "dashcam-ai",
  fuel: "fuel-module",
  hardware: "gps-tracker",
  visibility: "in-cab-display",
  platform: "mobile-fleet",
  support: "fleet-radio"
};

export function productImageForFeature(slug: string): string | undefined {
  const productId = FEATURE_PRODUCT_MAP[slug];
  return productId ? getMarketingProduct(productId)?.image : undefined;
}
