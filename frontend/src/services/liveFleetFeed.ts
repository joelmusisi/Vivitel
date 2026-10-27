import { buildViviOrgCategory, parseViviSiteLabel } from "../utils/viviCategories";

export type LiveFleetMovementStatus =
  | "moving"
  | "idle"
  | "stopped"
  | "offline"
  | "unknown";

/** Mix-style unified live fleet row used by Live Tracking / EasyTrack. */
export type LiveFleetRow = {
  assetId: string;
  registration: string;
  description: string;
  driver: string;
  movementStatus: LiveFleetMovementStatus;
  site: string;
  siteFamily: string;
  siteFull: string;
  database: string;
  organisation: string;
  dealer: string;
  breadcrumb: string;
  lat: number | null;
  lon: number | null;
  speed: string;
  heading: string;
  lastSeen: string;
  imei: string;
  raw?: unknown;
};

export type LiveFleetSource = {
  id?: unknown;
  assetId?: unknown;
  registration?: unknown;
  assetDescription?: unknown;
  description?: unknown;
  name?: unknown;
  driver?: unknown;
  site?: unknown;
  database?: unknown;
  organisation?: unknown;
  dealer?: unknown;
  organisationName?: unknown;
  lat?: unknown;
  latitude?: unknown;
  lng?: unknown;
  longitude?: unknown;
  lon?: unknown;
  speed?: unknown;
  heading?: unknown;
  course?: unknown;
  lastSeen?: unknown;
  last_seen?: unknown;
  lastPosition?: unknown;
  last_position?: unknown;
  status?: unknown;
  movement?: unknown;
  movementStatus?: unknown;
  ignition?: unknown;
  imei?: unknown;
  uniqueId?: unknown;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toCoord(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inferMovementStatus(source: LiveFleetSource): LiveFleetMovementStatus {
  const explicit = toText(source.movementStatus || source.movement || source.status).toLowerCase();
  if (
    explicit.includes("move") ||
    explicit === "driving" ||
    explicit === "online" ||
    explicit === "active"
  ) {
    return "moving";
  }
  if (explicit.includes("idle") || explicit.includes("idling")) return "idle";
  if (explicit.includes("stop") || explicit.includes("park")) return "stopped";
  if (explicit.includes("off") || explicit.includes("inactive") || explicit.includes("stale")) {
    return "offline";
  }

  const speed = Number(source.speed);
  if (Number.isFinite(speed)) {
    if (speed > 3) return "moving";
    if (speed > 0) return "idle";
    return "stopped";
  }

  const ignition = toText(source.ignition).toLowerCase();
  if (ignition === "1" || ignition === "true" || ignition === "on") return "idle";
  if (ignition === "0" || ignition === "false" || ignition === "off") return "stopped";

  return "unknown";
}

/**
 * Normalize Traccar / SSE / asset API payloads into a Mix-like live fleet row.
 */
export function toLiveFleetRow(
  source: LiveFleetSource,
  naming?: { dealer?: string; organisation?: string; database?: string }
): LiveFleetRow {
  const assetId = toText(source.assetId ?? source.id);
  const registration =
    toText(source.registration) || toText(source.name) || toText(source.assetDescription) || assetId;
  const description =
    toText(source.assetDescription ?? source.description ?? source.name) || registration;
  const siteFull = toText(source.site);
  const parsed = parseViviSiteLabel(siteFull);
  const dealer = toText(naming?.dealer ?? source.dealer);
  const organisation = toText(naming?.organisation ?? source.organisation ?? source.organisationName);
  const database = toText(naming?.database ?? source.database);
  const category = buildViviOrgCategory({
    dealer,
    organisation,
    database,
    siteFull
  });

  const lat = toCoord(source.lat ?? source.latitude);
  const lon = toCoord(source.lon ?? source.lng ?? source.longitude);

  return {
    assetId,
    registration,
    description,
    driver: toText(source.driver),
    movementStatus: inferMovementStatus(source),
    site: parsed.site || siteFull,
    siteFamily: parsed.siteFamily,
    siteFull: parsed.siteFull || siteFull,
    database,
    organisation,
    dealer,
    breadcrumb: category.breadcrumb,
    lat,
    lon,
    speed: toText(source.speed),
    heading: toText(source.heading ?? source.course),
    lastSeen: toText(
      source.lastSeen ?? source.last_seen ?? source.lastPosition ?? source.last_position
    ),
    imei: toText(source.imei ?? source.uniqueId),
    raw: source
  };
}

export function toLiveFleetRows(
  sources: LiveFleetSource[],
  naming?: { dealer?: string; organisation?: string; database?: string }
): LiveFleetRow[] {
  return (Array.isArray(sources) ? sources : []).map((row) => toLiveFleetRow(row, naming));
}

export function filterLiveFleetRows(
  rows: LiveFleetRow[],
  opts: {
    matchesSite?: (site?: string | null, alt?: string | null) => boolean;
    matchesAsset?: (reg?: string | null, alt?: string | null) => boolean;
  }
): LiveFleetRow[] {
  const matchesSite = opts.matchesSite ?? (() => true);
  const matchesAsset = opts.matchesAsset ?? (() => true);
  return rows.filter(
    (row) =>
      matchesSite(row.siteFull || row.site, row.siteFamily) &&
      matchesAsset(row.registration, row.assetId)
  );
}
