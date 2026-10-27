import { fetchJson } from "./api";
import { filterForSiteScope, siteScopesMatch } from "./scopeStorage";
import { readActiveSiteName, readActiveTenantId } from "./tenantContext";

export type RouteLifecycleStatus = "open" | "scheduled" | "closed";

export type RouteStopDraft = {
  name: string;
  kind: "start" | "stop" | "rest" | "destination";
  lat?: number;
  lng?: number;
};

export type RouteAllocationStatus = "unassigned" | "allocated";

export type RouteLibraryRecord = {
  id: string;
  site: string;
  name: string;
  /** Free-text route description / purpose. */
  description: string;
  /** Lifecycle archive status — records are never deleted. */
  status: RouteLifecycleStatus;
  origin: string;
  destination: string;
  stops: RouteStopDraft[];
  /** Filled / confirmed in Resource allocation (may be provisional on create). */
  assetRegistration: string;
  assetDescription: string;
  driverName: string;
  notes: string;
  /** Workflow scheduling fields. */
  owner: string;
  scheduledFor: string;
  /** Asset + driver assignment for a scheduled run. */
  allocationStatus: RouteAllocationStatus;
  allocatedAt?: string;
  /** Source route id when this record was cloned; original stays untouched. */
  clonedFromId?: string;
  clonedFromName?: string;
  /** Account that created the route (audit only — visibility is site-wide). */
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  scheduledAt?: string;
  openedAt?: string;
};

export type RouteLibraryStore = {
  items: RouteLibraryRecord[];
  updatedAt?: string;
};

/** In-session mirror so a just-saved route never vanishes if a reload lags. */
const routeMemoryCache = new Map<string, { items: RouteLibraryRecord[]; updatedAt: string }>();

const ROUTES_LIBRARY_API = "/libraries/routes";
const GENERIC_SAVE_ERROR = "Unable to save the route right now. Please try again.";

function sanitizeUserFacingError(message: string): string {
  const raw = String(message ?? "").trim();
  if (!raw) return GENERIC_SAVE_ERROR;
  if (/backblaze|\bb2\b|object storage|blob storage/i.test(raw)) return GENERIC_SAVE_ERROR;
  return raw;
}

function memoryKey(site: string) {
  return `${readActiveTenantId() || "_"}::${site.trim().toLowerCase()}`;
}

function rememberSiteRoutes(site: string, items: RouteLibraryRecord[]) {
  routeMemoryCache.set(memoryKey(site), {
    items,
    updatedAt: new Date().toISOString()
  });
}

function readRememberedRoutes(site: string): RouteLibraryRecord[] | null {
  const hit = routeMemoryCache.get(memoryKey(site));
  return hit ? hit.items : null;
}

/** Routes are shared by everyone with access to the active site — never user-private. */
function requireActiveSite(): string {
  return readActiveSiteName().trim();
}

function normalizeStop(raw: unknown): RouteStopDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<RouteStopDraft>;
  const name = String(row.name ?? "").trim();
  if (!name) return null;
  const kindRaw = String(row.kind ?? "stop").trim().toLowerCase();
  const kind: RouteStopDraft["kind"] =
    kindRaw === "start" || kindRaw === "destination" || kindRaw === "rest" ? kindRaw : "stop";
  const lat = typeof row.lat === "number" ? row.lat : Number(row.lat);
  const lng = typeof row.lng === "number" ? row.lng : Number(row.lng);
  return {
    name,
    kind,
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {})
  };
}

function normalizeRecord(raw: unknown, siteFallback: string): RouteLibraryRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<RouteLibraryRecord>;
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  if (!id || !name) return null;
  const statusRaw = String(row.status ?? "open").trim().toLowerCase();
  const status: RouteLifecycleStatus =
    statusRaw === "scheduled" || statusRaw === "closed" ? statusRaw : "open";
  const stops = Array.isArray(row.stops)
    ? row.stops.map(normalizeStop).filter((item): item is RouteStopDraft => Boolean(item))
    : [];
  const origin = String(row.origin ?? stops.find((s) => s.kind === "start")?.name ?? "").trim();
  const destination = String(
    row.destination ?? stops.find((s) => s.kind === "destination")?.name ?? ""
  ).trim();
  const allocationRaw = String(row.allocationStatus ?? "").trim().toLowerCase();
  const hasAsset = Boolean(String(row.assetRegistration ?? "").trim());
  const allocationStatus: RouteAllocationStatus =
    allocationRaw === "allocated"
      ? "allocated"
      : allocationRaw === "unassigned"
        ? "unassigned"
        : hasAsset && (status === "scheduled" || status === "closed")
          ? "allocated"
          : "unassigned";
  const site = String(row.site ?? siteFallback).trim() || siteFallback;
  return {
    id,
    site,
    name,
    description: String(row.description ?? "").trim(),
    status,
    origin,
    destination,
    stops:
      stops.length > 0
        ? stops
        : [
            ...(origin ? [{ name: origin, kind: "start" as const }] : []),
            ...(destination ? [{ name: destination, kind: "destination" as const }] : [])
          ],
    assetRegistration: String(row.assetRegistration ?? "").trim(),
    assetDescription: String(row.assetDescription ?? "").trim(),
    driverName: String(row.driverName ?? "").trim(),
    notes: String(row.notes ?? "").trim(),
    owner: String(row.owner ?? "").trim(),
    scheduledFor: String(row.scheduledFor ?? "").trim(),
    allocationStatus,
    allocatedAt: String(row.allocatedAt ?? "").trim() || undefined,
    clonedFromId: String(row.clonedFromId ?? "").trim() || undefined,
    clonedFromName: String(row.clonedFromName ?? "").trim() || undefined,
    createdBy: String(row.createdBy ?? "").trim() || undefined,
    createdAt: String(row.createdAt ?? "").trim() || new Date().toISOString(),
    updatedAt: String(row.updatedAt ?? "").trim() || new Date().toISOString(),
    closedAt: String(row.closedAt ?? "").trim() || undefined,
    scheduledAt: String(row.scheduledAt ?? "").trim() || undefined,
    openedAt: String(row.openedAt ?? "").trim() || undefined
  };
}

function dedupeById(items: RouteLibraryRecord[]): RouteLibraryRecord[] {
  const map = new Map<string, RouteLibraryRecord>();
  for (const item of items) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }
    const existingTs = Date.parse(existing.updatedAt) || 0;
    const nextTs = Date.parse(item.updatedAt) || 0;
    map.set(item.id, nextTs >= existingTs ? item : existing);
  }
  return Array.from(map.values()).sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt))
  );
}

/** Anchor every row to the active site and drop anything from another site. */
function anchorToActiveSite(items: RouteLibraryRecord[], site: string): RouteLibraryRecord[] {
  return dedupeById(
    items
      .filter((row) => !row.site || siteScopesMatch(row.site, site))
      .map((row) => ({ ...row, site }))
  );
}

function normalizeLoadedItems(incoming: unknown[], site: string): RouteLibraryRecord[] {
  const normalized = incoming
    .map((row) => normalizeRecord(row, site))
    .filter((row): row is RouteLibraryRecord => Boolean(row));
  return filterForSiteScope(normalized, site).filter(
    (row) => !String(row.id).startsWith("route-seed-")
  );
}

/** Load route archive for the active site. Shared by all accounts on that site. */
export async function loadRouteLibrary(): Promise<RouteLibraryRecord[]> {
  const site = requireActiveSite();
  if (!site) return [];

  const response = await fetchJson<{
    ok?: boolean;
    items?: unknown[];
  }>(`${ROUTES_LIBRARY_API}?site=${encodeURIComponent(site)}`);

  const fromApi = Array.isArray(response?.items)
    ? normalizeLoadedItems(response!.items!, site)
    : [];

  const remembered = readRememberedRoutes(site);
  if (remembered?.length) {
    const merged = dedupeById([...fromApi, ...remembered.filter((row) => siteScopesMatch(row.site, site))]);
    rememberSiteRoutes(site, merged);
    return merged;
  }

  rememberSiteRoutes(site, fromApi);
  return fromApi;
}

/**
 * Persist full archive for the active site.
 * Never mixes other sites' routes into this site's store.
 */
export async function saveRouteLibrary(items: RouteLibraryRecord[]): Promise<boolean> {
  const site = requireActiveSite();
  if (!site) return false;
  const anchored = anchorToActiveSite(items, site);
  const updatedAt = new Date().toISOString();
  try {
    const { buildUrl, getApiKey, getTenantId, canForPath } = await import("./api");
    if (typeof window !== "undefined" && !canForPath(String(window.location?.pathname ?? ""), "edit")) {
      throw new Error("You do not have edit permission on this page, so the route cannot be saved.");
    }
    const tenantId = getTenantId();
    const apiKey = getApiKey();
    const response = await fetch(buildUrl(ROUTES_LIBRARY_API, tenantId), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(tenantId ? { "x-tenant-id": tenantId } : {}),
        ...(apiKey ? { "x-api-key": apiKey } : {})
      },
      body: JSON.stringify({ site, items: anchored, updatedAt })
    });

    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; stored?: boolean; error?: string }
      | null;

    if (!response.ok || (!body?.ok && !body?.stored)) {
      throw new Error(sanitizeUserFacingError(String(body?.error ?? "").trim() || GENERIC_SAVE_ERROR));
    }

    rememberSiteRoutes(site, anchored);
    return true;
  } catch (err) {
    if (err instanceof Error && err.message) {
      throw new Error(sanitizeUserFacingError(err.message));
    }
    throw new Error(GENERIC_SAVE_ERROR);
  }
}

export type CreateRouteInput = {
  name: string;
  description?: string;
  origin: string;
  destination: string;
  stopsText?: string;
  stops?: RouteStopDraft[];
  assetRegistration: string;
  assetDescription: string;
  driverName: string;
  notes?: string;
  createdBy?: string;
  /** When set, copies destinations/stops from this route; original is never modified. */
  cloneFrom?: RouteLibraryRecord | null;
};

export function buildNewRouteRecord(input: CreateRouteInput): RouteLibraryRecord {
  const site = requireActiveSite();
  const now = new Date().toISOString();
  const source = input.cloneFrom ?? null;

  const parsedStops: RouteStopDraft[] = String(input.stopsText ?? "")
    .split(/\n|,|;/)
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .map((name) => ({ name, kind: "stop" as const }));

  let stops: RouteStopDraft[];
  let origin: string;
  let destination: string;

  if (Array.isArray(input.stops) && input.stops.length > 0) {
    stops = input.stops
      .map((stop) => ({
        name: String(stop.name ?? "").trim(),
        kind: stop.kind,
        ...(typeof stop.lat === "number" && typeof stop.lng === "number"
          ? { lat: stop.lat, lng: stop.lng }
          : {})
      }))
      .filter((stop) => stop.name);
    origin =
      String(input.origin ?? "").trim() ||
      stops.find((s) => s.kind === "start")?.name ||
      "";
    destination =
      String(input.destination ?? "").trim() ||
      stops.find((s) => s.kind === "destination")?.name ||
      "";
  } else if (source) {
    stops = source.stops.map((stop) => ({ ...stop }));
    origin = source.origin;
    destination = source.destination;
    if (parsedStops.length > 0) {
      const mid = parsedStops.filter((s) => s.name !== origin && s.name !== destination);
      const start = stops.find((s) => s.kind === "start") ?? { name: origin, kind: "start" as const };
      const end =
        stops.find((s) => s.kind === "destination") ?? { name: destination, kind: "destination" as const };
      stops = [start, ...mid, end];
    }
  } else {
    origin = String(input.origin ?? "").trim();
    destination = String(input.destination ?? "").trim();
    const mid = parsedStops.filter((s) => s.name !== origin && s.name !== destination);
    stops = [
      ...(origin ? [{ name: origin, kind: "start" as const }] : []),
      ...mid,
      ...(destination ? [{ name: destination, kind: "destination" as const }] : [])
    ];
  }

  return {
    id: `route-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    site,
    name: String(input.name ?? "").trim() || (source ? `${source.name} (copy)` : "New route"),
    description: String(input.description ?? "").trim(),
    status: "open",
    origin,
    destination,
    stops,
    assetRegistration: String(input.assetRegistration ?? "").trim(),
    assetDescription: String(input.assetDescription ?? "").trim(),
    driverName: String(input.driverName ?? "").trim(),
    notes: String(input.notes ?? "").trim(),
    owner: "",
    scheduledFor: "",
    allocationStatus: "unassigned",
    clonedFromId: source?.id,
    clonedFromName: source?.name,
    createdBy: String(input.createdBy ?? "").trim() || undefined,
    createdAt: now,
    updatedAt: now,
    openedAt: now
  };
}

/** Append a new route. Merges against latest site store so concurrent accounts share one archive. */
export async function appendRouteToLibrary(record: RouteLibraryRecord): Promise<RouteLibraryRecord[]> {
  const site = requireActiveSite();
  if (!site) throw new Error("Select a site before creating a route.");
  if (!siteScopesMatch(record.site || site, site)) {
    throw new Error("Route site does not match the active site.");
  }
  const current = await loadRouteLibrary();
  const stamped = { ...record, site };
  const next = dedupeById([stamped, ...current]);
  // Remember before network round-trip so UI never flashes empty after create.
  rememberSiteRoutes(site, next);
  await saveRouteLibrary(next);
  return next;
}

/** Workflow step: schedule an open (or re-scheduled) library route. */
export async function scheduleRouteInWorkflow(
  routeId: string,
  input: { owner: string; scheduledFor: string }
): Promise<RouteLibraryRecord[]> {
  const current = await loadRouteLibrary();
  const now = new Date().toISOString();
  const owner = String(input.owner ?? "").trim() || "Dispatch";
  const scheduledFor = String(input.scheduledFor ?? "").trim() || now;
  let found = false;
  const next = current.map((row) => {
    if (row.id !== routeId) return row;
    found = true;
    return {
      ...row,
      status: "scheduled" as const,
      owner,
      scheduledFor,
      updatedAt: now,
      scheduledAt: now
    };
  });
  if (!found) throw new Error("Route not found in library");
  await saveRouteLibrary(next);
  return next;
}

/** Resource allocation step: assign the asset + driver that will carry the scheduled route. */
export async function allocateRouteResources(
  routeId: string,
  input: { assetRegistration: string; assetDescription: string; driverName: string }
): Promise<RouteLibraryRecord[]> {
  const current = await loadRouteLibrary();
  const now = new Date().toISOString();
  const assetRegistration = String(input.assetRegistration ?? "").trim();
  const assetDescription = String(input.assetDescription ?? "").trim();
  const driverName = String(input.driverName ?? "").trim();
  if (!assetRegistration) throw new Error("Vehicle registration is required");
  if (!driverName) throw new Error("Driver is required");
  let found = false;
  const next = current.map((row) => {
    if (row.id !== routeId) return row;
    found = true;
    return {
      ...row,
      assetRegistration,
      assetDescription,
      driverName,
      allocationStatus: "allocated" as const,
      allocatedAt: now,
      updatedAt: now,
      status: row.status === "closed" ? row.status : row.status === "open" ? "scheduled" : row.status,
      scheduledAt: row.scheduledAt || (row.status === "open" ? now : row.scheduledAt),
      scheduledFor: row.scheduledFor || (row.status === "open" ? now : row.scheduledFor),
      owner: row.owner || "Dispatch"
    };
  });
  if (!found) throw new Error("Route not found in library");
  await saveRouteLibrary(next);
  return next;
}

/** Update lifecycle only (open / scheduled / closed). Does not delete. */
export async function setRouteLifecycleStatus(
  routeId: string,
  status: RouteLifecycleStatus
): Promise<RouteLibraryRecord[]> {
  const current = await loadRouteLibrary();
  const now = new Date().toISOString();
  const next = current.map((row) => {
    if (row.id !== routeId) return row;
    return {
      ...row,
      status,
      updatedAt: now,
      ...(status === "closed" ? { closedAt: now } : {}),
      ...(status === "scheduled" ? { scheduledAt: now } : {}),
      ...(status === "open" ? { openedAt: now } : {})
    };
  });
  await saveRouteLibrary(next);
  return next;
}

/** Display helper for workflow boards. */
export function workflowDisplayStatus(
  row: RouteLibraryRecord
): "draft" | "scheduled" | "active" | "paused" {
  if (row.status === "closed") return "paused";
  if (row.status === "open") return "draft";
  if (row.status === "scheduled" && row.allocationStatus === "allocated") return "active";
  return "scheduled";
}

/** Routes ready for Tracking: scheduled and asset/driver allocated. */
export function isTrackableRoute(row: RouteLibraryRecord): boolean {
  return row.status === "scheduled" && row.allocationStatus === "allocated";
}

export function formatRouteSchedule(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Unscheduled";
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return raw;
  return new Date(ts).toLocaleString();
}

/** Clear in-session route cache (e.g. after site change). */
export function clearRouteLibraryMemoryCache() {
  routeMemoryCache.clear();
}
