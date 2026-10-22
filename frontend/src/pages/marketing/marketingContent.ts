export type MarketingImageCrop = {
  source: "pitch-deck" | "video-storyboard";
  row: number;
  col: number;
  rows: number;
  cols: number;
};

export type MarketingFeature = {
  slug: string;
  navLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
  image: MarketingImageCrop;
};

function pitchPanel(index: number): MarketingImageCrop {
  return { source: "pitch-deck", row: Math.floor(index / 2), col: index % 2, rows: 4, cols: 2 };
}

function storyboardCell(row: number, col: number): MarketingImageCrop {
  return { source: "video-storyboard", row, col, rows: 4, cols: 3 };
}

export const MARKETING_FEATURES: MarketingFeature[] = [
  {
    slug: "tracking",
    navLabel: "GPS Tracking",
    eyebrow: "Live GPS Tracking",
    title: "Track every vehicle. In real time. Everywhere.",
    subtitle: "Smarter Fleets. Safer Roads.",
    description:
      "Monitor your entire fleet on a live map with vehicle status, speed, and location updates — from highway to depot.",
    bullets: ["Real-time location", "Vehicle status cards", "Live speed and heading", "Every vehicle, everywhere"],
    image: pitchPanel(0),
  },
  {
    slug: "safety",
    navLabel: "AI Safety",
    eyebrow: "AI Driver Safety",
    title: "Smarter cameras. Safer drivers. Fewer incidents.",
    subtitle: "Complete visibility over your fleet.",
    description:
      "AI dashcams detect distraction, fatigue, seatbelt use, and speed events — giving you actionable alerts before incidents escalate.",
    bullets: ["Distracted detection", "Fatigue detection", "Seatbelt detection", "Speed monitoring"],
    image: pitchPanel(1),
  },
  {
    slug: "analytics",
    navLabel: "Analytics",
    eyebrow: "Powerful Insights",
    title: "Turn your fleet data into better decisions.",
    subtitle: "Better decisions. Stronger business.",
    description:
      "Fleet dashboards surface utilisation, distance, movement, and performance trends so managers act on facts, not guesswork.",
    bullets: ["Fleet overview dashboards", "Distance and utilisation", "Moving vs stopped metrics", "Export-ready reporting"],
    image: pitchPanel(2),
  },
  {
    slug: "platform",
    navLabel: "Platform",
    eyebrow: "Smarter Fleets",
    title: "One platform. Total visibility. Built for growth.",
    subtitle: "All connected. All in one platform.",
    description:
      "Access tracking, video, alerts, and reports from laptop, tablet, and phone — one cloud platform for your whole operation.",
    bullets: ["Cloud-connected devices", "Multi-device access", "Unified fleet workspace", "Built to scale"],
    image: pitchPanel(3),
  },
  {
    slug: "visibility",
    navLabel: "Visibility",
    eyebrow: "Always Visible",
    title: "Every vehicle. Every route. Always in sight.",
    subtitle: "Live GPS tracking",
    description:
      "Geofencing, route history, and instant notifications keep dispatch and operations teams aligned with what is happening on the road.",
    bullets: ["Real-time tracking", "Geofencing alerts", "Route history", "Instant notifications"],
    image: pitchPanel(4),
  },
  {
    slug: "dashcam",
    navLabel: "Dashcam",
    eyebrow: "Dual Dashcam Protection",
    title: "Road and in-cab. Captured. Always.",
    subtitle: "AI dashcams | trackers | sensors",
    description:
      "Dual-view recording protects drivers and businesses with HD road and cabin footage, night vision, and event-locked clips.",
    bullets: ["1080p HD recording", "Wide angle lens", "Night vision enhanced", "Event lock protection"],
    image: pitchPanel(5),
  },
  {
    slug: "support",
    navLabel: "Support",
    eyebrow: "We're Here. 24/7",
    title: "Real people. Real support. Always on your side.",
    subtitle: "Drive smarter. Operate safer. Grow faster.",
    description:
      "Our fleet operations specialists are available around the clock via live support and WhatsApp when your operation needs help.",
    bullets: ["24/7 live support", "WhatsApp support", "Rapid response", "Expert assistance"],
    image: pitchPanel(6),
  },
  {
    slug: "route-history",
    navLabel: "Route History",
    eyebrow: "Route History",
    title: "Playback. Analyse. Improve performance.",
    subtitle: "Complete visibility over your fleet.",
    description:
      "Replay historical routes, analyse driver behaviour, and identify opportunities to improve efficiency across your network.",
    bullets: ["Trip playback", "Route analysis", "Performance trends", "Operational improvement"],
    image: storyboardCell(1, 1),
  },
  {
    slug: "fuel",
    navLabel: "Fuel",
    eyebrow: "Fuel Monitoring",
    title: "Reduce costs. Increase efficiency.",
    subtitle: "Powerful insights",
    description:
      "Monitor fuel usage and identify waste so you can cut operating costs while keeping vehicles productive on the road.",
    bullets: ["Fuel level monitoring", "Usage trends", "Cost reduction", "Efficiency reporting"],
    image: storyboardCell(2, 0),
  },
  {
    slug: "hardware",
    navLabel: "Hardware",
    eyebrow: "AI Dashcams | Trackers | Sensors",
    title: "All connected. All in one platform.",
    subtitle: "Professional hardware for professional fleets.",
    description:
      "Deploy AI dashcams, GPS trackers, and sensors that integrate seamlessly with the VIVI Telematics cloud platform.",
    bullets: ["AI dashcams", "GPS trackers", "Vehicle sensors", "Single platform integration"],
    image: storyboardCell(2, 1),
  },
];

export function getMarketingFeature(slug: string): MarketingFeature | undefined {
  return MARKETING_FEATURES.find((feature) => feature.slug === slug);
}

/** Core platform capabilities (aligned with Wialon / 3D Tracking style product grids). */
export const MARKETING_PLATFORM_CAPABILITIES = [
  { label: "Real-time GPS tracking", slug: "tracking" },
  { label: "Geofencing & alerts", slug: "visibility" },
  { label: "AI video telematics", slug: "dashcam" },
  { label: "Driver behaviour", slug: "safety" },
  { label: "Fuel monitoring", slug: "fuel" },
  { label: "Route history & playback", slug: "route-history" },
  { label: "Fleet dashboards", slug: "analytics" },
  { label: "Reports & exports", slug: "analytics" },
  { label: "Hardware integration", slug: "hardware" },
  { label: "24/7 operations support", slug: "support" }
] as const;

export const MARKETING_TRUST_STATS = [
  { value: "Live", label: "Real-time fleet map & status" },
  { value: "Unified", label: "Tracking, video, alerts & reports" },
  { value: "24/7", label: "Fleet specialist support" },
  { value: "Scalable", label: "From single site to multi-fleet" }
] as const;

export const MARKETING_HOW_IT_WORKS = [
  {
    step: "01",
    title: "Connect your fleet",
    description: "Deploy GPS trackers, AI dashcams, and sensors that feed data into one cloud workspace."
  },
  {
    step: "02",
    title: "Monitor and analyse",
    description: "Use live maps, event alerts, video-linked incidents, and dashboards to see what matters."
  },
  {
    step: "03",
    title: "Act with confidence",
    description: "Share reports, review trips, and respond faster with context — not guesswork across tools."
  }
] as const;

export const MARKETING_INDUSTRIES = [
  "Logistics & delivery",
  "Construction & plant",
  "Passenger transport",
  "Cold chain",
  "Field services",
  "Rental & leasing"
] as const;

export const MARKETING_ONE_PLATFORM_POINTS = [
  {
    title: "One workspace, not five tools",
    description:
      "Like leading telematics platforms, VIVI centralises location, video, fuel, and reporting so teams stop switching systems to understand a single trip."
  },
  {
    title: "Events with full context",
    description:
      "Video clips, coordinates, and timestamps stay linked to each alert — similar to modern video telematics workflows used by 3D Tracking-style platforms."
  },
  {
    title: "Built to scale with you",
    description:
      "From daily dispatch to executive dashboards, configure views for operators, managers, and compliance without rebuilding your stack."
  }
] as const;

export function getRelatedMarketingFeatures(slug: string, limit = 3): MarketingFeature[] {
  const index = MARKETING_FEATURES.findIndex((f) => f.slug === slug);
  if (index < 0) return MARKETING_FEATURES.slice(0, limit);
  const picks: MarketingFeature[] = [];
  for (let offset = 1; offset < MARKETING_FEATURES.length && picks.length < limit; offset += 1) {
    picks.push(MARKETING_FEATURES[(index + offset) % MARKETING_FEATURES.length]);
  }
  return picks;
}

export function marketingImageSrc(crop: MarketingImageCrop): string {
  return crop.source === "pitch-deck" ? "/marketing/pitch-deck.jpg" : "/marketing/video-storyboard.jpg";
}

export function marketingImagePosition(crop: MarketingImageCrop): string {
  const x = crop.cols <= 1 ? 50 : (crop.col / (crop.cols - 1)) * 100;
  const y = crop.rows <= 1 ? 50 : (crop.row / (crop.rows - 1)) * 100;
  return `${x}% ${y}%`;
}

export function marketingImageSize(crop: MarketingImageCrop): string {
  return `${crop.cols * 100}% ${crop.rows * 100}%`;
}
