import { featureImageForPanel, MARKETING_FEATURE_IMAGES } from "./marketingFeatureImages";

/** One standalone marketing page per topic — no shared body content between routes */

export type SolutionPage = {
  slug: string;
  navLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
  /** Full-bleed hero from official feature artwork */
  panelImage: string;
  /** Optional: use pitch hardware photo instead of generic product shot */
  usePitchHardware?: boolean;
  ctaLabel: string;
  ctaTo: string;
  /** Text-only cross-links — open separate pages */
  exploreLinks: { label: string; to: string }[];
};

const P = featureImageForPanel;

export const MARKETING_SOLUTION_PAGES: SolutionPage[] = [
  {
    slug: "platform",
    navLabel: "Platform overview",
    eyebrow: "VIVI Telematics",
    title: "Smarter Fleets. Safer Roads.",
    subtitle: "One connected platform for professional fleets",
    description:
      "VIVI Telematics unifies live GPS, video, fuel, and reporting — the same story told in our pitch deck: one brand, one workspace, one support team.",
    bullets: [
      "Cloud-connected fleet workspace",
      "Multi-site groups & notification libraries",
      "Web, mobile quick access, and video dashboards",
      "24/7 specialist support (+27 76 405 2278)"
    ],
    panelImage: P("intro"),
    ctaLabel: "Access telematics",
    ctaTo: "/login",
    exploreLinks: [
      { label: "GPS tracking", to: "/solutions/tracking" },
      { label: "Hardware", to: "/solutions/hardware" }
    ]
  },
  {
    slug: "visibility",
    navLabel: "Fleet visibility",
    eyebrow: "Operations centre",
    title: "Complete visibility over your fleet",
    subtitle: "Every screen aligned to live operations",
    description:
      "Dispatch and compliance teams monitor maps, charts, and vehicle status from a single control view — without mixing in unrelated product pages.",
    bullets: [
      "Multi-monitor operations layout",
      "Live status, speed, and ignition",
      "Geofence entry/exit alerts",
      "Role-based views per site"
    ],
    panelImage: P("fleet-visibility"),
    ctaLabel: "See live tracking",
    ctaTo: "/solutions/tracking",
    exploreLinks: [{ label: "Route playback", to: "/solutions/route-history" }]
  },
  {
    slug: "tracking",
    navLabel: "GPS tracking",
    eyebrow: "Live GPS tracking",
    title: "Real-time location. Every vehicle. Everywhere.",
    subtitle: "Smarter Fleets. Safer Roads.",
    description:
      "Live map position, speed, and status for every asset — dedicated page for GPS only; video and fuel are separate.",
    bullets: [
      "Real-time location on live fleet map",
      "Vehicle status cards",
      "Speed, heading, and trip context",
      "Shareable operational visibility"
    ],
    panelImage: P("gps-tracking"),
    ctaLabel: "Access telematics",
    ctaTo: "/login",
    exploreLinks: [{ label: "Fleet visibility", to: "/solutions/visibility" }]
  },
  {
    slug: "safety",
    navLabel: "Safety events",
    eyebrow: "Video telematics",
    title: "Harsh braking and incident alerts",
    subtitle: "Evidence when it matters",
    description:
      "Multi-camera views with speed, vehicle ID, and timestamp on every alert — this page covers road events only.",
    bullets: ["Harsh braking detection", "Speed at time of event", "Linked video evidence"],
    panelImage: P("harsh-braking"),
    ctaLabel: "Explore dashcam",
    ctaTo: "/solutions/dashcam",
    exploreLinks: [{ label: "Driver fatigue", to: "/solutions/driver-fatigue" }]
  },
  {
    slug: "dashcam",
    navLabel: "AI dashcam",
    eyebrow: "AI dashcams",
    title: "Road and in-cab. Captured. Always.",
    subtitle: "From the VIVI hardware line-up",
    description:
      "Dual-view AI dashcams shown in our official product storyboard — branded hardware photography, not mixed with fuel or GPS copy.",
    bullets: ["1080p road and cabin", "Night-enhanced capture", "Cloud event clips"],
    panelImage: MARKETING_FEATURE_IMAGES.driverDashcam,
    usePitchHardware: true,
    ctaLabel: "View hardware lineup",
    ctaTo: "/solutions/hardware",
    exploreLinks: [{ label: "Safety events", to: "/solutions/safety" }]
  },
  {
    slug: "driver-fatigue",
    navLabel: "Driver fatigue",
    eyebrow: "Driver alert",
    title: "Fatigue detected before risk escalates",
    subtitle: "AI driver monitoring",
    description:
      "In-cab intelligence flags fatigue with clear driver alerts — standalone from harsh braking and speed events.",
    bullets: ["Facial fatigue signals", "Supervisor notifications", "Coaching workflow"],
    panelImage: P("driver-fatigue"),
    ctaLabel: "Explore safety events",
    ctaTo: "/solutions/safety",
    exploreLinks: [{ label: "AI dashcam", to: "/solutions/dashcam" }]
  },
  {
    slug: "route-history",
    navLabel: "Route history",
    eyebrow: "Route history",
    title: "Playback. Analyse. Improve performance.",
    subtitle: "Trip intelligence",
    description:
      "Replay routes, geofences, and trips from the dedicated playback workspace — no analytics dashboard content on this page.",
    bullets: ["Trip playback", "Geofence history", "Export-ready trips"],
    panelImage: P("route-history"),
    ctaLabel: "View analytics",
    ctaTo: "/solutions/analytics",
    exploreLinks: [{ label: "GPS tracking", to: "/solutions/tracking" }]
  },
  {
    slug: "fuel",
    navLabel: "Fuel monitoring",
    eyebrow: "Fuel monitoring",
    title: "Reduce costs. Increase efficiency.",
    subtitle: "Fuel level intelligence",
    description:
      "Night operations and fuel gauge intelligence — refill, siphon, and utilisation are described only here.",
    bullets: ["Level trends", "Refill detection", "Siphoning awareness"],
    panelImage: P("fuel-monitoring"),
    ctaLabel: "Open analytics",
    ctaTo: "/solutions/analytics",
    exploreLinks: [{ label: "Analytics", to: "/solutions/analytics" }]
  },
  {
    slug: "hardware",
    navLabel: "Hardware",
    eyebrow: "AI dashcams | trackers | sensors",
    title: "All connected. All in one platform.",
    subtitle: "Official VIVI device photography",
    description:
      "AI dashcam, tracker, and sensor hardware exactly as shown in the VIVI pitch deck — including the white VIVI print on the telematics box.",
    bullets: ["AI dashcam", "GPS tracker / dome camera", "Branded sensor module"],
    panelImage: MARKETING_FEATURE_IMAGES.hardwareDevices,
    usePitchHardware: true,
    ctaLabel: "Explore dashcam",
    ctaTo: "/solutions/dashcam",
    exploreLinks: [
      { label: "GPS tracking", to: "/solutions/tracking" },
      { label: "Dashcam", to: "/solutions/dashcam" }
    ]
  },
  {
    slug: "analytics",
    navLabel: "Analytics",
    eyebrow: "Powerful insights",
    title: "Better decisions. Stronger business. Safer drivers.",
    subtitle: "Dashboards and exports",
    description:
      "Laptop and mobile dashboards with charts and fleet KPIs — analytics content stays on this page only.",
    bullets: ["Fleet dashboards", "Distance and utilisation", "Export-ready reporting"],
    panelImage: P("powerful-insights"),
    ctaLabel: "See platform",
    ctaTo: "/solutions/platform",
    exploreLinks: [{ label: "Route history", to: "/solutions/route-history" }]
  },
  {
    slug: "support",
    navLabel: "Support",
    eyebrow: "24/7 support",
    title: "Drive smarter. Operate safer. Grow faster.",
    subtitle: "Real people. Real support.",
    description:
      "Fleet specialist assistance, guides, and onboarding — visit the support hub or sign in for live help inside the platform.",
    bullets: ["24/7 live support", "WhatsApp assistance", "Implementation help"],
    panelImage: "/marketing/brand-footer.jpg",
    ctaLabel: "Visit support hub",
    ctaTo: "/support",
    exploreLinks: [{ label: "Contact us", to: "/contact" }]
  }
];

export function getSolutionPage(slug: string): SolutionPage | undefined {
  return MARKETING_SOLUTION_PAGES.find((row) => row.slug === slug);
}

/** Legacy /features slugs mapped to solutions */
export const FEATURE_TO_SOLUTION: Record<string, string> = {
  tracking: "tracking",
  safety: "safety",
  analytics: "analytics",
  platform: "platform",
  visibility: "visibility",
  dashcam: "dashcam",
  support: "support",
  "route-history": "route-history",
  fuel: "fuel",
  hardware: "hardware"
};
