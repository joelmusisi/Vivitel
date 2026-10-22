export const REGION_IDS = ["us", "za", "ent", "ae", "uk"] as const;
export type RegionId = (typeof REGION_IDS)[number];

export type RegionPlatform = "traccar" | "cms808" | "gpsiot";

export type RegionServer = {
  id: RegionId;
  host: string;
  label: string;
  platforms: RegionPlatform[];
};

export const REGION_SERVERS: Record<RegionId, RegionServer> = {
  us: { id: "us", host: "us.vivitelematics.ca", label: "United States", platforms: ["traccar"] },
  za: { id: "za", host: "za.vivitelematics.ca", label: "South Africa", platforms: ["cms808"] },
  ent: { id: "ent", host: "ent.vivitelematics.ca", label: "Enterprise", platforms: ["traccar"] },
  ae: { id: "ae", host: "ae.vivitelematics.ca", label: "United Arab Emirates", platforms: ["traccar"] },
  uk: { id: "uk", host: "uk.vivitelematics.ca", label: "United Kingdom", platforms: ["gpsiot"] }
};

export const DEFAULT_REGION: RegionId = "us";
export const REGION_APP_HOSTS = Object.values(REGION_SERVERS).map((row) => row.host);

export const isRegionId = (value: unknown): value is RegionId =>
  REGION_IDS.includes(String(value ?? "").trim().toLowerCase() as RegionId);

export const resolveRegionFromHost = (host: string): RegionId => {
  const normalized = String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (!normalized) return DEFAULT_REGION;
  for (const row of Object.values(REGION_SERVERS)) {
    if (normalized === row.host) return row.id;
  }
  return DEFAULT_REGION;
};

export const isRegionalAppHost = (host: string) => {
  const normalized = String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  return REGION_APP_HOSTS.includes(normalized);
};

export const regionUsesCms808 = (region: string) =>
  Boolean(REGION_SERVERS[region as RegionId]?.platforms.includes("cms808"));

export const regionUsesTraccar = (region: string) =>
  Boolean(REGION_SERVERS[region as RegionId]?.platforms.includes("traccar"));

export const regionUsesGpsIot = (region: string) =>
  Boolean(REGION_SERVERS[region as RegionId]?.platforms.includes("gpsiot"));

export const publicOriginForRegion = (region: string) => {
  const row = REGION_SERVERS[(isRegionId(region) ? region : DEFAULT_REGION)];
  return `https://${row.host}`;
};

export const resolveRegionFromRequestLike = (input: { url?: string; origin?: string; host?: string }) => {
  const candidates = [input.origin, input.host, input.url];
  for (const value of candidates) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    try {
      if (/^https?:\/\//i.test(raw)) {
        const host = new URL(raw).hostname;
        if (isRegionalAppHost(host)) return resolveRegionFromHost(host);
        continue;
      }
      if (isRegionalAppHost(raw)) return resolveRegionFromHost(raw);
    } catch {
      if (isRegionalAppHost(raw)) return resolveRegionFromHost(raw);
    }
  }
  return DEFAULT_REGION;
};

const hostnameFromOrigin = (origin: string) => {
  const raw = String(origin ?? "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
};

/** A regional site always uses its own server. Local and other unpinned sign-in can name one. */
export const resolveEffectiveRegion = (input: {
  url?: string;
  origin?: string;
  host?: string;
  sessionRegion?: unknown;
  bodyRegion?: unknown;
}): RegionId => {
  const origin = String(input.origin ?? "").trim();
  const host = String(input.host ?? "").trim();
  const pinned =
    isRegionalAppHost(hostnameFromOrigin(origin)) || isRegionalAppHost(host.replace(/:\d+$/, ""));
  if (pinned) return resolveRegionFromRequestLike({ url: input.url, origin, host });
  const sessionRegion = String(input.sessionRegion ?? "").trim().toLowerCase();
  if (isRegionId(sessionRegion)) return sessionRegion;
  const bodyRegion = String(input.bodyRegion ?? "").trim().toLowerCase();
  if (isRegionId(bodyRegion)) return bodyRegion;
  return resolveRegionFromRequestLike({ url: input.url, origin, host });
};
