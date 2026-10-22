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
  us: { id: "us", host: "us.vivitelematics.ca", label: "us.vivitelematics.ca", platforms: ["traccar"] },
  za: { id: "za", host: "za.vivitelematics.ca", label: "za.vivitelematics.ca", platforms: ["cms808"] },
  ent: { id: "ent", host: "ent.vivitelematics.ca", label: "ent.vivitelematics.ca", platforms: ["traccar"] },
  ae: { id: "ae", host: "ae.vivitelematics.ca", label: "ae.vivitelematics.ca", platforms: ["traccar"] },
  uk: { id: "uk", host: "uk.vivitelematics.ca", label: "uk.vivitelematics.ca", platforms: ["gpsiot"] }
};

export const DEFAULT_REGION: RegionId = "us";
export const REGION_APP_HOSTS = Object.values(REGION_SERVERS).flatMap((row) => [row.host, `${row.id}.vivitelematics.com`]);

export const isRegionId = (value: unknown): value is RegionId =>
  REGION_IDS.includes(String(value ?? "").trim().toLowerCase() as RegionId);

const ACTIVE_REGION_STORAGE_KEY = "vivi.activeRegion";

export const isLoopbackHost = (host: string) => {
  const normalized = String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
};

export const readRememberedRegion = (): RegionId | null => {
  if (typeof window === "undefined") return null;
  try {
    const value = String(window.localStorage.getItem(ACTIVE_REGION_STORAGE_KEY) ?? "").trim().toLowerCase();
    return isRegionId(value) ? value : null;
  } catch {
    return null;
  }
};

export const rememberActiveRegion = (region: RegionId) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_REGION_STORAGE_KEY, region);
  } catch {
    // ignore quota / private mode
  }
};

export const resolveRegionFromHost = (host: string): RegionId => {
  const normalized = String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (!normalized) return DEFAULT_REGION;
  for (const row of Object.values(REGION_SERVERS)) {
    if (normalized === row.host || normalized === `${row.id}.vivitelematics.com`) return row.id;
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

const hostUsesNamedRegion = (host: string) =>
  isRegionalAppHost(host) || (isLoopbackHost(host) && Boolean(readRememberedRegion()));

export const isGpsIotServer = () => {
  if (typeof window === "undefined") return false;
  const host = String(window.location?.hostname ?? "");
  if (!hostUsesNamedRegion(host)) return false;
  return regionUsesGpsIot(readActiveRegion());
};

export const readActiveRegion = (): RegionId => {
  if (typeof window === "undefined") return DEFAULT_REGION;
  const host = String(window.location?.hostname ?? "");
  if (isRegionalAppHost(host)) return resolveRegionFromHost(host);
  if (isLoopbackHost(host)) {
    const remembered = readRememberedRegion();
    if (remembered) return remembered;
  }
  return resolveRegionFromHost(host);
};

export const readActiveRegionServer = () => REGION_SERVERS[readActiveRegion()];

export const isCms808Server = () => {
  const host = typeof window === "undefined" ? "" : String(window.location?.hostname ?? "");
  return regionUsesCms808(readActiveRegion()) && hostUsesNamedRegion(host);
};

export const isTraccarOnlyServer = () => {
  if (typeof window === "undefined") return false;
  const host = String(window.location?.hostname ?? "");
  if (!hostUsesNamedRegion(host)) return false;
  return regionUsesTraccar(readActiveRegion()) && !regionUsesCms808(readActiveRegion());
};
