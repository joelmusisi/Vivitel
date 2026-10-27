import type { MarketingImageCrop } from "./marketingContent";
import { MARKETING_FEATURES, marketingImageSrc } from "./marketingContent";

export type MarketingLink = { label: string; to: string };

/** Public site navigation. `match` is the set of paths that count as “you are here”. */
export type MarketingPrimaryLink = {
  label: string;
  to: string;
  match: string[];
};

export const MARKETING_PRIMARY_NAV: MarketingPrimaryLink[] = [
  {
    label: "Platform",
    to: "/solutions/platform",
    match: ["/solutions/platform"]
  },
  {
    label: "Fleet tracking",
    to: "/solutions/tracking",
    match: ["/solutions/tracking", "/solutions/visibility", "/solutions/route-history", "/catalog/fleet-tracking"]
  },
  {
    label: "Safety & video",
    to: "/solutions/safety",
    match: [
      "/solutions/safety",
      "/solutions/dashcam",
      "/solutions/driver-fatigue",
      "/catalog/safety-compliance",
      "/discover/video-telematics",
      "/discover/safety-events"
    ]
  },
  {
    label: "Fuel & reports",
    to: "/solutions/fuel",
    match: [
      "/solutions/fuel",
      "/solutions/analytics",
      "/catalog/transport-logistics",
      "/discover/logistics",
      "/discover/cold-chain"
    ]
  },
  {
    label: "Hardware",
    to: "/solutions/hardware",
    match: [
      "/solutions/hardware",
      "/catalog/field-operations",
      "/catalog/specialised-assets",
      "/discover/field-service",
      "/discover/construction",
      "/discover/rental"
    ]
  },
  {
    label: "Support",
    to: "/support",
    match: ["/support", "/discover/how-it-works", "/discover/configuration", "/discover/fleet-dashboard", "/discover/mobile-app", "/discover/industries", "/discover/video-tour"]
  },
  {
    label: "Company",
    to: "/company/about",
    match: ["/company", "/business"]
  },
  {
    label: "Contact",
    to: "/contact",
    match: ["/contact"]
  }
];

export function marketingNavIsCurrent(pathname: string, match: string[]) {
  return match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type MarketingPromoCard = {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  to: string;
  image: MarketingImageCrop;
  /** Garmin-style product shot (full image, not sprite crop) */
  productId?: string;
  productImage?: string;
};

export type MarketingCategory = {
  slug: string;
  navLabel: string;
  headline: string;
  description: string;
  /** Primary product photo for mega-menu & category tile */
  spotlightProductId?: string;
  products: MarketingLink[];
  maps: MarketingLink[];
  accessories: MarketingLink[];
  discover: MarketingLink[];
  promos: MarketingPromoCard[];
};

const f = (index: number) => MARKETING_FEATURES[index % MARKETING_FEATURES.length];

function featureLinks(slugs: string[]): MarketingLink[] {
  return slugs
    .map((slug) => MARKETING_FEATURES.find((row) => row.slug === slug))
    .filter(Boolean)
    .map((row) => ({ label: row!.navLabel, to: `/solutions/${row!.slug}` }));
}

export const MARKETING_HERO_PROMOS: MarketingPromoCard[] = [
  {
    id: "fleet-sale",
    kicker: "Operations promotion",
    title: "FLEET OPERATIONS SALE",
    subtitle: "Save on professional telematics packages for your fleet",
    to: "/solutions/platform",
    image: f(0).image,
    productId: "gps-tracker"
  },
  {
    id: "live-gps",
    kicker: "New wearables",
    title: "VIVI TRACK™ 70 & 170",
    subtitle: "Easy-to-use GPS wearables for your fleet team",
    to: "/solutions/tracking",
    image: f(1).image,
    productId: "vivi-track-wearable"
  },
  {
    id: "ai-safety",
    kicker: "Video telematics",
    title: "VIVI DASH AI™",
    subtitle: "Road and in-cab visibility with intelligent alerts",
    to: "/solutions/dashcam",
    image: f(5).image,
    productId: "dashcam-ai"
  },
  {
    id: "fuel-insights",
    kicker: "Cost control",
    title: "FUEL & UTILISATION",
    subtitle: "See siphoning, refills, and efficiency in one workspace",
    to: "/solutions/fuel",
    image: f(8).image,
    productId: "fuel-module"
  }
];

export const MARKETING_CATEGORIES: MarketingCategory[] = [
  {
    slug: "fleet-tracking",
    navLabel: "Fleet Tracking",
    spotlightProductId: "vivi-track-wearable",
    headline: "Fleet tracking products for professional operators",
    description: "Live GPS, asset visibility, and dispatch-ready maps for fleets that cannot afford blind spots.",
    products: featureLinks(["tracking", "visibility", "route-history", "analytics"]),
    maps: [
      { label: "Live fleet map", to: "/solutions/tracking" },
      { label: "Geofence zones", to: "/solutions/visibility" },
      { label: "Trip playback", to: "/solutions/route-history" }
    ],
    accessories: [
      { label: "GPS trackers", to: "/solutions/hardware" },
      { label: "Mobile quick access", to: "/discover/mobile-app" },
      { label: "Driver identifiers", to: "/solutions/safety" }
    ],
    discover: [
      { label: "Fleet dashboard tour", to: "/discover/fleet-dashboard" },
      { label: "How VIVI tracking works", to: "/discover/how-it-works" },
      { label: "Watch product overview", to: "/discover/video-tour" }
    ],
    promos: [
      {
        id: "ft-promo-1",
        kicker: "Real-time GPS",
        title: "Track every vehicle. In real time.",
        subtitle: "Smarter fleets. Safer roads.",
        to: "/solutions/tracking",
        image: f(0).image,
        productId: "vivi-track-wearable"
      },
      {
        id: "ft-promo-2",
        kicker: "Route intelligence",
        title: "Playback. Analyse. Improve.",
        subtitle: "Complete visibility over your fleet.",
        to: "/solutions/route-history",
        image: f(7).image,
        productId: "gps-tracker"
      }
    ]
  },
  {
    slug: "safety-compliance",
    spotlightProductId: "dashcam-ai",
    navLabel: "Safety & Compliance",
    headline: "Safety, video, and compliance in one platform",
    description: "AI driver monitoring, dashcam evidence, and behaviour analytics aligned with modern compliance programmes.",
    products: featureLinks(["safety", "dashcam", "visibility", "support"]),
    maps: [
      { label: "Incident locations", to: "/solutions/visibility" },
      { label: "Safety heat maps", to: "/solutions/analytics" }
    ],
    accessories: [
      { label: "AI dashcams", to: "/solutions/hardware" },
      { label: "In-cab alerts", to: "/solutions/safety" },
      { label: "Event video clips", to: "/solutions/dashcam" }
    ],
    discover: [
      { label: "Video telematics guide", to: "/discover/video-telematics" },
      { label: "Safety event library", to: "/discover/safety-events" },
      { label: "Compliance reporting", to: "/solutions/analytics" }
    ],
    promos: [
      {
        id: "sc-promo-1",
        kicker: "AI driver safety",
        title: "Smarter cameras. Safer drivers.",
        subtitle: "Fewer incidents before they escalate.",
        to: "/solutions/safety",
        image: f(1).image,
        productId: "dashcam-ai"
      },
      {
        id: "sc-promo-2",
        kicker: "Dual dashcam",
        title: "Road and in-cab. Captured.",
        subtitle: "HD evidence when it matters.",
        to: "/solutions/dashcam",
        image: f(5).image,
        productId: "dashcam-ai"
      }
    ]
  },
  {
    slug: "field-operations",
    spotlightProductId: "handheld-gps",
    navLabel: "Field Operations",
    headline: "Field operations and mobile workforce visibility",
    description: "Geofencing, job visibility, and rugged tracking for teams working away from the depot.",
    products: featureLinks(["visibility", "tracking", "route-history", "platform"]),
    maps: [
      { label: "Site geofences", to: "/solutions/visibility" },
      { label: "Historical routes", to: "/solutions/route-history" }
    ],
    accessories: [
      { label: "Vehicle sensors", to: "/solutions/hardware" },
      { label: "Mobile workforce app", to: "/discover/mobile-app" }
    ],
    discover: [
      { label: "Industries we support", to: "/discover/industries" },
      { label: "Field service workflows", to: "/discover/field-service" },
      { label: "Operations support 24/7", to: "/solutions/support" }
    ],
    promos: [
      {
        id: "fo-promo-1",
        kicker: "Always visible",
        title: "Every route. Always in sight.",
        subtitle: "Geofencing and instant alerts.",
        to: "/solutions/visibility",
        image: f(4).image,
        productId: "mobile-fleet"
      }
    ]
  },
  {
    slug: "transport-logistics",
    spotlightProductId: "fuel-module",
    navLabel: "Transport & Logistics",
    headline: "Transport, logistics, and delivery intelligence",
    description: "Fuel monitoring, utilisation reporting, and delivery-style scheduling insights for high-mileage fleets.",
    products: featureLinks(["fuel", "analytics", "tracking", "route-history"]),
    maps: [
      { label: "Delivery routes", to: "/solutions/route-history" },
      { label: "Depot geofences", to: "/solutions/visibility" }
    ],
    accessories: [
      { label: "Fuel sensors", to: "/solutions/fuel" },
      { label: "Export-ready reports", to: "/solutions/analytics" }
    ],
    discover: [
      { label: "Logistics use cases", to: "/discover/logistics" },
      { label: "Cold chain monitoring", to: "/discover/cold-chain" },
      { label: "Fuel monitoring", to: "/solutions/fuel" }
    ],
    promos: [
      {
        id: "tl-promo-1",
        kicker: "Fuel monitoring",
        title: "Reduce costs. Increase efficiency.",
        subtitle: "Refill and siphoning awareness.",
        to: "/solutions/fuel",
        image: f(8).image,
        productId: "cold-chain"
      }
    ]
  },
  {
    slug: "specialised-assets",
    spotlightProductId: "fleet-radio",
    navLabel: "Specialised Assets",
    headline: "Specialised assets, plant, and high-value equipment",
    description: "Monitoring packages for construction plant, refrigerated assets, and non-standard mobile equipment.",
    products: featureLinks(["hardware", "tracking", "visibility", "analytics"]),
    maps: [{ label: "Asset location history", to: "/solutions/route-history" }],
    accessories: [
      { label: "Multi-sensor kits", to: "/solutions/hardware" },
      { label: "Configuration groups", to: "/discover/configuration" }
    ],
    discover: [
      { label: "Construction & plant", to: "/discover/construction" },
      { label: "Rental & leasing", to: "/discover/rental" }
    ],
    promos: [
      {
        id: "sa-promo-1",
        kicker: "Connected hardware",
        title: "Trackers. Cameras. Sensors.",
        subtitle: "All connected in one platform.",
        to: "/solutions/hardware",
        image: f(9).image,
        productId: "fleet-radio"
      }
    ]
  }
];

export const MARKETING_FOOTER_COLUMNS: { title: string; links: MarketingLink[] }[] = [
  {
    title: "Customer service",
    links: [
      { label: "Support center", to: "/support" },
      { label: "Contact us", to: "/contact" },
      { label: "Implementation & onboarding", to: "/support/onboarding" },
      { label: "Order & billing enquiries", to: "/support/data" },
      { label: "Warranty & hardware", to: "/support/warranty" },
      { label: "Data management", to: "/support/data" },
      { label: "Find a partner", to: "/business/partners" }
    ]
  },
  {
    title: "Company",
    links: [
      { label: "About us", to: "/company/about" },
      { label: "Contact us", to: "/contact" }
    ]
  },
  {
    title: "Platforms",
    links: [
      { label: "VIVI Fleet Connect", to: "/login" },
      { label: "Fleet dashboard", to: "/discover/fleet-dashboard" },
      { label: "Mobile app", to: "/discover/mobile-app" },
      { label: "Live video streaming", to: "/discover/video-telematics" },
      { label: "Reports workspace", to: "/solutions/analytics" },
      { label: "Configuration admin", to: "/discover/configuration" }
    ]
  },
  {
    title: "For business",
    links: [
      { label: "VIVI Telematics for enterprise", to: "/business/enterprise" },
      { label: "Dealer & partner resources", to: "/business/partners" },
      { label: "Developers & integrations", to: "/business/developers" },
      { label: "Professional services", to: "/business/services" },
      { label: "Corporate sponsorships", to: "/company/about" }
    ]
  }
];

export const MARKETING_SUPPORT_SECTIONS: { title: string; links: MarketingLink[]; blurb: string }[] = [
  {
    title: "Fleet support",
    blurb:
      "24/7 phone (+27 76 405 2278), WhatsApp, and email (care@vivitelematics.com) for live map, video, and alert issues — plus onboarding and hardware RMA guidance.",
    links: [
      { label: "Support center home", to: "/support" },
      { label: "Implementation & onboarding", to: "/support/onboarding" },
      { label: "Warranty & hardware", to: "/support/warranty" },
      { label: "Data & billing", to: "/support/data" }
    ]
  },
  {
    title: "Product help",
    blurb:
      "Step-by-step discover guides for GPS tracking, dual-view video, fuel trends, safety event libraries, and fleet dashboards — before you sign in.",
    links: [
      { label: "Getting started", to: "/discover/how-it-works" },
      { label: "Video telematics", to: "/discover/video-telematics" },
      { label: "Safety event library", to: "/discover/safety-events" },
      { label: "Configuration groups", to: "/discover/configuration" }
    ]
  },
  {
    title: "Business programmes",
    blurb:
      "Enterprise multi-site rollout, dealer partnerships, and API integrations at api.vivitelematics.ca — scoped with professional services.",
    links: [
      { label: "Enterprise", to: "/business/enterprise" },
      { label: "Partners", to: "/business/partners" },
      { label: "Developers", to: "/business/developers" },
      { label: "Professional services", to: "/business/services" }
    ]
  }
];

export function getMarketingCategory(slug: string): MarketingCategory | undefined {
  return MARKETING_CATEGORIES.find((row) => row.slug === slug);
}

/** Resolve discover/company/business/support pages — full copy for nav buttons (no generic stubs). */
export const MARKETING_INFO_PAGES: Record<
  string,
  { title: string; eyebrow: string; body: string[]; links: MarketingLink[]; image?: MarketingImageCrop }
> = {
  "how-it-works": {
    title: "How VIVI Telematics works",
    eyebrow: "Discover",
    body: [
      "Install GPS trackers, AI dashcams, fuel sensors, and optional wearables. Devices report position, ignition, speed, and events to the VIVI cloud workspace (api.vivitelematics.ca).",
      "Dispatch and compliance teams use live maps, geofence alerts, trip playback, and linked video clips — the same data model modern fleet platforms use for 360° visibility without juggling separate tools.",
      "Managers review utilisation, distance, idle time, fuel trends, and export-ready reports. Safety leads configure distraction, fatigue, harsh braking, and speed rules in the notification library, synced to VIVI site groups.",
      "When you need help, fleet specialists are available 24/7 by phone (+27 76 405 2278), email (care@vivitelematics.com), and WhatsApp — from rollout through daily operations."
    ],
    links: featureLinks(["tracking", "dashcam", "fuel", "support"]),
    image: f(0).image
  },
  "video-tour": {
    title: "Product overview video",
    eyebrow: "Discover",
    body: [
      "Follow a typical operator session: open the live fleet map, filter exceptions, drill into a vehicle card, and open trip playback for the same asset.",
      "Review a harsh-braking alert with road and cabin video, speed at time of event, and map context — then export a summary for coaching or insurance.",
      "See how fuel level trends, refill detection, and utilisation charts connect to the same workspace supervisors use on mobile quick access.",
      "Sign in after rollout for the full interactive experience; this marketing preview uses the same storyboard visuals as our pitch deck."
    ],
    links: [
      { label: "Live GPS tracking", to: "/solutions/tracking" },
      { label: "Video telematics", to: "/discover/video-telematics" },
      { label: "Access telematics", to: "/login" }
    ],
    image: f(2).image
  },
  "video-telematics": {
    title: "Video telematics",
    eyebrow: "Discover",
    body: [
      "VIVI Dash AI™ records dual-view 1080p road and in-cab video with night-enhanced capture. Events such as harsh braking, distraction, and fatigue generate cloud clips locked to GPS coordinates and timestamps.",
      "Supervisors review footage from the video telematics dashboard or trip timeline without downloading scattered files — similar to integrated video + telematics workflows used by leading commercial fleets.",
      "Pair in-cab coaching alerts with supervisor notifications so risky behaviour is addressed before it becomes a claim.",
      "Hardware installs on the official VIVI device line-up with branded sensor modules and fleet trackers on one platform."
    ],
    links: [
      ...featureLinks(["dashcam", "safety"]),
      { label: "Driver fatigue", to: "/solutions/driver-fatigue" }
    ],
    image: f(5).image
  },
  "fleet-dashboard": {
    title: "VIVI fleet dashboard",
    eyebrow: "Platforms",
    body: [
      "Executive and operations dashboards show fleet overview, moving vs stopped assets, distance, utilisation, and exception lists in one view.",
      "Drill from summary tiles into vehicle detail, live video streams where enabled, and report exports for finance or compliance.",
      "Customise dashboards per role — dispatch sees live maps and geofences; managers see KPI trends; safety leads see event rates and coaching queues.",
      "Data refreshes from the same telematics pipeline that powers GPS tracking, fuel modules, and notification libraries."
    ],
    links: featureLinks(["analytics", "tracking", "visibility"]),
    image: f(2).image
  },
  "mobile-app": {
    title: "Mobile workforce access",
    eyebrow: "Platforms",
    body: [
      "Supervisors and field leads use mobile quick access for live map position, vehicle status, and critical alerts when away from the desk.",
      "Review recent trips, acknowledge geofence entries, and open linked safety events without a full desktop session.",
      "Designed for rugged field operations — site supervisors, rental yard managers, and marine shore teams who need instant fleet context.",
      "Sign in with the same credentials as the web workspace; permissions follow your organisation and site configuration."
    ],
    links: [
      { label: "Access telematics", to: "/login" },
      { label: "Field service workflows", to: "/discover/field-service" },
      { label: "GPS tracking", to: "/solutions/tracking" }
    ],
    image: f(3).image
  },
  industries: {
    title: "Industries we support",
    eyebrow: "Discover",
    body: [
      "Logistics & delivery — route playback, depot geofences, fuel utilisation, and customer ETA-style visibility for high-mileage fleets.",
      "Construction & plant — asset tracking for yellow plant, site geofences, idle monitoring, and theft-recovery workflows.",
      "Passenger transport — driver safety, harsh event video, and compliance-friendly reporting.",
      "Cold chain — temperature loggers, reefer alerts, and audit trails for refrigerated assets.",
      "Field services — job-site geofences, supervisor mobile access, and proof-of-arrival style trip history.",
      "Rental & leasing — unauthorised movement alerts, utilisation reporting, and odometer-style distance metrics."
    ],
    links: [
      { label: "Logistics programmes", to: "/discover/logistics" },
      { label: "Cold chain", to: "/discover/cold-chain" },
      { label: "Construction & plant", to: "/discover/construction" },
      { label: "Rental & leasing", to: "/discover/rental" }
    ]
  },
  "field-service": {
    title: "Field service workflows",
    eyebrow: "Discover",
    body: [
      "Define customer and depot geofences so supervisors receive instant entry and exit notifications — the same geofencing pattern used across modern fleet monitoring platforms.",
      "Assign vehicles and wearables to site groups; configuration sync keeps VIVI groups, computed attributes, and notification libraries aligned per site.",
      "Field supervisors use mobile quick access to confirm crew location, review today's routes, and escalate safety events to the operations centre.",
      "VIVI Field Handheld and VIVI Track™ wearables extend visibility to staff who are not behind the wheel of a tracked truck."
    ],
    links: [
      { label: "Field operations catalog", to: "/catalog/field-operations" },
      { label: "Fleet visibility", to: "/solutions/visibility" },
      { label: "Mobile app", to: "/discover/mobile-app" }
    ],
    image: f(4).image
  },
  logistics: {
    title: "Logistics & transport use cases",
    eyebrow: "Discover",
    body: [
      "Monitor every truck on a live dispatcher map with speed, heading, ignition, and idle time — typical 15–30 second GPS refresh suitable for ETA and exception management.",
      "Playback delivery routes, measure dwell at stops, and identify receivers or depots that consistently delay turns.",
      "Fuel monitoring highlights refills, suspected siphoning, and litres-per-km trends so finance teams act on data, not estimates.",
      "Export trip and utilisation reports for billing, subcontractor review, or internal KPI programmes."
    ],
    links: [
      { label: "Transport & logistics catalog", to: "/catalog/transport-logistics" },
      { label: "Fuel monitoring", to: "/solutions/fuel" },
      { label: "Route history", to: "/solutions/route-history" }
    ],
    image: f(8).image
  },
  "cold-chain": {
    title: "Cold chain monitoring",
    eyebrow: "Discover",
    body: [
      "VIVI Cold Chain Logger pairs temperature sensors with GPS so refrigerated assets stay inside compliance bands across South African corridors and depots.",
      "Receive alerts when temperature drifts outside configured thresholds — before product loss or a rejected load.",
      "Correlate temperature curves with trip playback and geofence arrivals for audit-ready cold chain documentation.",
      "Integrates with the unified VIVI workspace alongside fuel, video, and standard fleet tracking modules."
    ],
    links: [
      { label: "Cold chain product", to: "/solutions/hardware" },
      { label: "Transport catalog", to: "/catalog/transport-logistics" },
      { label: "Analytics & exports", to: "/solutions/analytics" }
    ],
    image: f(8).image
  },
  deliver: {
    title: "VIVI Deliver module",
    eyebrow: "Discover",
    body: [
      "Optional deliver programme for operators running scheduled routes, drone fleets, or last-mile programmes that need order-style visibility.",
      "After enterprise rollout, authorised users access deliver workspaces for scheduling, live tracking, client groups, and regional views inside the same telematics login.",
      "Drone operators gain historical track review and group management aligned with aviation-style mobility programmes.",
      "Contact the solutions team to scope deliver alongside standard GPS, video, and reporting modules."
    ],
    links: [
      { label: "Platform overview", to: "/solutions/platform" },
      { label: "Enterprise programmes", to: "/business/enterprise" },
      { label: "Contact sales", to: "/contact" }
    ],
    image: f(4).image
  },
  construction: {
    title: "Construction & plant",
    eyebrow: "Discover",
    body: [
      "Track excavators, generators, and high-value plant with GPS trackers and multi-sensor kits — know which site an asset last reported from.",
      "Site geofences flag unauthorised movement after hours and help recovery teams respond faster if equipment leaves a yard.",
      "Idle and utilisation reporting shows which machines sit unused versus overworked — supporting hire and capex decisions.",
      "Configuration groups separate plant fleets from road vehicles while sharing one VIVI operations workspace."
    ],
    links: [
      { label: "Specialised assets catalog", to: "/catalog/specialised-assets" },
      { label: "Hardware lineup", to: "/solutions/hardware" },
      { label: "Fleet visibility", to: "/solutions/visibility" }
    ],
    image: f(9).image
  },
  rental: {
    title: "Rental & leasing fleets",
    eyebrow: "Discover",
    body: [
      "Monitor hire fleets for unauthorised movement, after-hours ignition, and geofence breaches from a single live map.",
      "Utilisation and distance reports support billing cycles, excess mileage charges, and fleet right-sizing.",
      "Video telematics optional on premium tiers — evidence for damage disputes and driver coaching on returned vehicles.",
      "Roll out trackers and dashcams with the same onboarding programme used for owned commercial fleets."
    ],
    links: [
      { label: "Hardware lineup", to: "/solutions/hardware" },
      { label: "GPS tracking", to: "/solutions/tracking" },
      { label: "Implementation", to: "/support/onboarding" }
    ],
    image: f(4).image
  },
  about: {
    title: "About VIVI Telematics",
    eyebrow: "Company",
    body: [
      "VIVI Telematics is a unified fleet platform for professional operators — live GPS, AI driver safety, video telematics, fuel intelligence, route playback, and export-ready reporting in one cloud workspace.",
      "Our brand promise is Smarter Fleets. Safer Roads. — backed by 24/7 specialist support, WhatsApp assistance, and implementation programmes for single-site and multi-fleet rollouts.",
      "We serve logistics, construction, passenger transport, cold chain, field services, marine, and rental operators across South Africa and expanding regions.",
      "Talk to the team about a rollout for logistics, construction, passenger transport, cold chain, field services, or rental fleets."
    ],
    links: [
      { label: "Contact us", to: "/contact" },
      { label: "Platform overview", to: "/solutions/platform" }
    ],
    image: f(6).image
  },
  blog: {
    title: "VIVI Telematics blog",
    eyebrow: "Company",
    body: [
      "Practical articles on reducing fuel waste, coaching drivers with video evidence, and configuring geofences for depots and customer sites.",
      "Product notes cover new hardware (VIVI Track™, Dash AI™, Signal™), mobile quick access updates, and notification library best practices.",
      "Case-style posts highlight how operators moved from spreadsheets to live dashboards — without naming confidential fleet data.",
      "Subscribe via the contact form with topic “General enquiry” and mention blog updates, or follow announcements in the newsroom."
    ],
    links: [
      { label: "About us", to: "/company/about" },
      { label: "How it works", to: "/discover/how-it-works" },
      { label: "Contact", to: "/contact" }
    ]
  },
  news: {
    title: "Newsroom",
    eyebrow: "Company",
    body: [
      "Official announcements for platform releases, new catalog hardware, and regional rollout milestones.",
      "Press enquiries: care@vivitelematics.com — include your publication, deadline, and whether you need executive comment or product imagery.",
      "Marine, enterprise, and deliver module launches are posted here when programmes open to new customer segments.",
      "For immediate fleet support, use the support center or phone +27 76 405 2278 rather than the newsroom inbox."
    ],
    links: [
      { label: "About VIVI", to: "/company/about" },
      { label: "Support center", to: "/support" },
      { label: "Contact", to: "/contact" }
    ]
  },
  careers: {
    title: "Career opportunities",
    eyebrow: "Company",
    body: [
      "We hire fleet support specialists, implementation engineers, and customer success roles who understand telematics operations — not only software.",
      "Technical tracks include integrations with api.vivitelematics.ca, VIVI configuration sync, video streaming, and mobile workforce tools.",
      "Operations roles cover 24/7 support rotations, onboarding workshops, and partner enablement across South Africa.",
      "Send your CV and area of interest to care@vivitelematics.com with subject line “Careers — [role]”."
    ],
    links: [
      { label: "About us", to: "/company/about" },
      { label: "Professional services", to: "/business/services" },
      { label: "Contact", to: "/contact" }
    ]
  },
  sustainability: {
    title: "Sustainability",
    eyebrow: "Company",
    body: [
      "Fuel and idle reporting help fleets cut unnecessary kilometres and engine-on idle time — direct levers for CO₂ and cost reduction.",
      "Utilisation dashboards highlight under-used assets so operators right-size fleets instead of buying capacity they rarely deploy.",
      "Route playback and geofence discipline reduce wasted detours; video coaching lowers incident rates that drive repair and downtime emissions.",
      "We continue to expand sensor support for hybrid and electric assets as customers migrate mixed fleets."
    ],
    links: [
      { label: "Fuel monitoring", to: "/solutions/fuel" },
      { label: "Analytics", to: "/solutions/analytics" },
      { label: "Fleet dashboard", to: "/discover/fleet-dashboard" }
    ]
  },
  enterprise: {
    title: "Enterprise programmes",
    eyebrow: "For business",
    body: [
      "Multi-site rollout with site-anchored configuration: each depot or country syncs VIVI groups, computed attributes, and notification libraries independently.",
      "Role-based access for executives, dispatch, safety, and IT — same workspace, different dashboards and export rights.",
      "Enterprise packages include implementation playbooks, training, dedicated support escalation, and optional deliver or drone modules.",
      "OEM and mixed auto-commercial programmes available through the Auto & Home and partner channels."
    ],
    links: [
      { label: "Professional services", to: "/business/services" },
      { label: "Developers & APIs", to: "/business/developers" },
      { label: "Platform overview", to: "/solutions/platform" }
    ]
  },
  partners: {
    title: "Dealers & partners",
    eyebrow: "For business",
    body: [
      "Resell and implement VIVI Telematics under your brand promise — hardware install, cloud provisioning, and tier-1 support escalation to VIVI specialists.",
      "Partner kits include product photography, storyboard assets, and solution page links suitable for vertical marketing (logistics, marine, field ops).",
      "Co-selling paths for dashcams, trackers, wearables, fuel modules, and Signal™ radios with margin on devices and recurring platform seats.",
      "Apply via care@vivitelematics.com with company profile, regions covered, and estimated fleet count."
    ],
    links: [
      { label: "Contact partnerships", to: "/contact" },
      { label: "Hardware lineup", to: "/solutions/hardware" },
      { label: "Support center", to: "/support" }
    ]
  },
  developers: {
    title: "Developers & integrations",
    eyebrow: "For business",
    body: [
      "Production API base: https://api.vivitelematics.ca — use for authenticated integrations after your organisation is provisioned.",
      "Typical integrations: ERP/TMS dispatch, BI warehouses, ticketing for safety events, and customer-facing track-and-trace links.",
      "Configuration sync exposes site groups and computed attributes aligned with VIVI — scope webhooks and polling with the solutions team.",
      "Sandbox and credential requests go through enterprise onboarding; never embed production secrets in client-side marketing code."
    ],
    links: [
      { label: "Configuration groups", to: "/discover/configuration" },
      { label: "Enterprise programmes", to: "/business/enterprise" },
      { label: "Contact integrations", to: "/contact" }
    ]
  },
  services: {
    title: "Professional services",
    eyebrow: "For business",
    body: [
      "Discovery workshop — fleet size, sites, compliance goals, and hardware mix (trackers, dashcams, fuel, cold chain).",
      "Pilot rollout — install devices, configure geofences, notification library, and train dispatch on live maps and video review.",
      "Production cutover — multi-site sync, user admin, report templates, and handover to 24/7 support.",
      "Quarterly optimisation reviews for fuel, safety scores, and utilisation KPIs."
    ],
    links: [
      { label: "Implementation & onboarding", to: "/support/onboarding" },
      { label: "Support center", to: "/support" },
      { label: "Contact sales", to: "/contact" }
    ]
  },
  onboarding: {
    title: "Implementation & onboarding",
    eyebrow: "Support",
    body: [
      "Hardware planning — select trackers, dashcams, wearables, fuel and temperature sensors per asset class; schedule professional install where required.",
      "Site setup — create organisation sites, map VIVI groups, attach computed attributes, and sync notification libraries from Config Admin.",
      "User provisioning — dispatch, safety, finance, and executive roles with appropriate dashboard and export access.",
      "Go-live checklist — live map validation, test geofence alert, sample trip playback, and first weekly utilisation report."
    ],
    links: [
      { label: "How it works", to: "/discover/how-it-works" },
      { label: "Professional services", to: "/business/services" },
      { label: "Contact onboarding", to: "/contact" }
    ],
    image: f(3).image
  },
  warranty: {
    title: "Warranty & hardware",
    eyebrow: "Support",
    body: [
      "VIVI-branded trackers, dashcams, and sensors carry manufacturer warranty terms supplied with your order documentation.",
      "RMA process — record device ID, vehicle, and fault description; support validates logs before swap or bench repair.",
      "Firmware and configuration updates are delivered through the platform; do not flash third-party firmware on VIVI-certified hardware.",
      "Physical damage, tamper, or incorrect install may void coverage — use authorised installers for commercial deployments."
    ],
    links: [
      { label: "Hardware lineup", to: "/solutions/hardware" },
      { label: "Support center", to: "/support" },
      { label: "Contact support", to: "/contact" }
    ],
    image: f(9).image
  },
  data: {
    title: "Data management",
    eyebrow: "Support",
    body: [
      "Trip, event, video metadata, and fuel readings are retained per your enterprise agreement — ask support for current retention schedules.",
      "Export reports and trip history from the analytics workspace for audits, insurers, and customer SLA proof.",
      "Order and billing enquiries share this channel; include invoice references and fleet account name.",
      "Privacy requests and data subject questions: care@vivitelematics.com with “Data management” in the subject line."
    ],
    links: [
      { label: "Analytics", to: "/solutions/analytics" },
      { label: "Developers & APIs", to: "/business/developers" },
      { label: "Contact", to: "/contact" }
    ],
    image: f(2).image
  },
  "safety-events": {
    title: "Safety event library",
    eyebrow: "Discover",
    body: [
      "Build reusable notification templates for harsh braking, acceleration, speeding, distraction, fatigue, seatbelt, and geofence violations.",
      "Libraries sync to site VIVI groups so each depot inherits the right rule set without copying JSON by hand.",
      "Pair rules with AI dashcam events for automatic video clip association and supervisor escalation paths.",
      "Operators tune thresholds per vehicle class — heavy truck vs van vs marine asset — from Config Admin and Libraries workspaces after sign-in."
    ],
    links: featureLinks(["safety", "dashcam", "visibility"]),
    image: f(1).image
  },
  configuration: {
    title: "Configuration groups",
    eyebrow: "Discover",
    body: [
      "Organise assets by site, customer, or depot. Each site resolves scope for bindings, libraries, and VIVI group sync.",
      "Computed attributes attach to site groups on config sync — fuel factors, custom labels, and operational metadata stay consistent.",
      "Assets and Libraries admin trigger resync when you add devices or change notification templates.",
      "Enterprise customers use multi-site configuration to mirror real-world org charts without separate logins per yard."
    ],
    links: [
      { label: "Platform overview", to: "/solutions/platform" },
      { label: "Implementation", to: "/support/onboarding" },
      { label: "Support center", to: "/support" }
    ],
    image: f(3).image
  },
  "drone-delivery": {
    title: "Drone delivery module",
    eyebrow: "Discover",
    body: [
      "VIVI Deliver Drone visibility for operators running UAV logistics — live position, historical tracks, and group management inside deliver workspaces.",
      "Integrates with enterprise aviation programmes alongside standard road fleet modules.",
      "Scheduling and regional views support multi-base drone operations after security review and rollout.",
      "Not enabled by default — contact enterprise sales to scope airspace compliance, hardware, and training."
    ],
    links: [
      { label: "Platform overview", to: "/solutions/platform" },
      { label: "Enterprise programmes", to: "/business/enterprise" },
      { label: "Access telematics", to: "/login" }
    ],
    image: f(4).image
  },
  "marine-charting": {
    title: "Marine charting & AIS",
    eyebrow: "Marine",
    body: [
      "High-resolution charting with fleet overlays for commercial vessels, harbour tugs, and coastal operators.",
      "VIVI Signal™ fleet radios combine voice, dispatch alerts, and AIS-style awareness with shore-side dashboards.",
      "Harbour geofences and coastal playback mirror road-fleet workflows — one platform for mixed marine and land assets.",
      "Chartplotter and transducer accessories install through marine partner programmes; training available via VIVI Stories marine features."
    ],
    links: [
      { label: "Live tracking", to: "/solutions/tracking" },
      { label: "Fleet visibility", to: "/solutions/visibility" },
      { label: "Hardware lineup", to: "/solutions/hardware" }
    ],
    image: f(6).image
  }
};

export function promoMediaStyle(crop: MarketingImageCrop) {
  return {
    backgroundImage: `url(${marketingImageSrc(crop)})`,
    backgroundSize: "cover",
    backgroundPosition: "center"
  };
}
