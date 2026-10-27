import {
  createTraccarGeofence,
  deleteBindingDetailed,
  deleteGpsIotGeofence,
  deleteTraccarGeofence,
  getBindings,
  listGpsIotGeofences,
  listTraccarGeofenceDefinitions,
  saveGpsIotGeofence as saveGpsIotGeofenceApi,
  updateTraccarGeofence
} from "./api";
import { isLocationLibraryTemplateBinding } from "./bindingRecordUtils";
import { isGpsIotServer } from "./regionServers";
import { loadScopedFromApi, saveScopedToApi } from "./scopeStorage";
import { readActiveSiteName, readActiveTenantId } from "./tenantContext";

export type LocationPoint = { lat: number; lng: number };

export type LocationShape =
  | { type: "circle"; center: LocationPoint; radius: number }
  | { type: "rectangle"; points: [LocationPoint, LocationPoint] }
  | { type: "polygon"; points: LocationPoint[] }
  | { type: "polyline"; points: LocationPoint[] };

export type LocationGeofence = {
  id: string;
  traccarId?: number;
  /** GPS IoT GeofenceID / polygon id — used for update/delete without duplicates. */
  gpsIotGeoId?: string;
  name: string;
  type: string;
  site?: string;
  /** Speed limit (km/h) for Location Library + Location Binding overspeed defaults. */
  speed?: string;
  availability?: string;
  address?: string;
  description?: string;
  externalReference?: string;
  contact?: string;
  contactTel?: string;
  color?: string;
  opacity?: number;
  shape?: LocationShape;
  area?: string;
  attributes?: Record<string, unknown>;
};

const LOCATION_LIBRARY_KEY = "libraries:location";

const numberText = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(7)).toString();
};

const parseCoordinatePair = (pair: string): LocationPoint | null => {
  const parts = pair.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

/** Parse a Traccar WKT geofence area string into a drawable shape. */
export function parseTraccarAreaToShape(area: string): LocationShape | null {
  const raw = String(area ?? "").trim();
  if (!raw) return null;

  const circleMatch = raw.match(/^CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/i);
  if (circleMatch) {
    return {
      type: "circle",
      center: { lat: Number(circleMatch[1]), lng: Number(circleMatch[2]) },
      radius: Math.max(1, Math.round(Number(circleMatch[3])))
    };
  }

  const polygonMatch = raw.match(/^POLYGON\s*\(\s*\(([^)]+)\)\s*\)$/i);
  if (polygonMatch) {
    const points = polygonMatch[1]
      .split(",")
      .map(parseCoordinatePair)
      .filter((point): point is LocationPoint => Boolean(point));
    if (points.length < 3) return null;
    const unique = points.slice(0, -1);
    if (unique.length === 4) {
      const lats = unique.map((point) => point.lat);
      const lngs = unique.map((point) => point.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      return {
        type: "rectangle",
        points: [
          { lat: minLat, lng: minLng },
          { lat: maxLat, lng: maxLng }
        ]
      };
    }
    return { type: "polygon", points: unique };
  }

  const lineMatch = raw.match(/^LINESTRING\s*\(\s*([^)]+)\s*\)$/i);
  if (lineMatch) {
    const points = lineMatch[1]
      .split(",")
      .map(parseCoordinatePair)
      .filter((point): point is LocationPoint => Boolean(point));
    if (points.length < 2) return null;
    return { type: "polyline", points };
  }

  return null;
}

export function locationShapeToTraccarArea(shape: LocationShape): string {
  if (shape.type === "circle") {
    return `CIRCLE (${numberText(shape.center.lat)} ${numberText(shape.center.lng)}, ${Math.max(1, Math.round(shape.radius))})`;
  }
  if (shape.type === "rectangle") {
    const [a, b] = shape.points;
    const points: LocationPoint[] = [
      { lat: a.lat, lng: a.lng },
      { lat: a.lat, lng: b.lng },
      { lat: b.lat, lng: b.lng },
      { lat: b.lat, lng: a.lng },
      { lat: a.lat, lng: a.lng }
    ];
    return `POLYGON ((${points.map((point) => `${numberText(point.lat)} ${numberText(point.lng)}`).join(", ")}))`;
  }
  if (shape.type === "polygon") {
    const points = [...shape.points];
    if (points.length < 3) throw new Error("A polygon geofence requires at least three points.");
    const first = points[0];
    const last = points[points.length - 1];
    if (first.lat !== last.lat || first.lng !== last.lng) points.push(first);
    return `POLYGON ((${points.map((point) => `${numberText(point.lat)} ${numberText(point.lng)}`).join(", ")}))`;
  }
  if (shape.points.length < 2) throw new Error("A polyline geofence requires at least two points.");
  return `LINESTRING (${shape.points.map((point) => `${numberText(point.lat)} ${numberText(point.lng)}`).join(", ")})`;
}

/** Rectangle / polyline → GPS IoT polygon points (≥3). */
export function locationShapeToGpsIotPayload(shape: LocationShape): {
  type: "circle" | "polygon";
  center?: LocationPoint;
  radius?: number;
  points?: LocationPoint[];
} {
  if (shape.type === "circle") {
    return { type: "circle", center: shape.center, radius: Math.max(1, Math.round(shape.radius)) };
  }
  if (shape.type === "rectangle") {
    const [a, b] = shape.points;
    return {
      type: "polygon",
      points: [
        { lat: a.lat, lng: a.lng },
        { lat: a.lat, lng: b.lng },
        { lat: b.lat, lng: b.lng },
        { lat: b.lat, lng: a.lng }
      ]
    };
  }
  if (shape.type === "polygon") {
    if (shape.points.length < 3) throw new Error("A polygon geofence requires at least three points.");
    return { type: "polygon", points: shape.points };
  }
  if (shape.points.length < 3) {
    throw new Error("GPS IoT needs at least three points — convert the polyline to a polygon corridor or add a point.");
  }
  return { type: "polygon", points: shape.points };
}

const normalizeLocation = (row: LocationGeofence): LocationGeofence => ({
  ...row,
  id: String(row.id ?? row.gpsIotGeoId ?? row.traccarId ?? "").trim(),
  traccarId: Number(row.traccarId ?? 0) > 0 ? Math.trunc(Number(row.traccarId)) : undefined,
  gpsIotGeoId: String(row.gpsIotGeoId ?? row.attributes?.gpsIotGeoId ?? "").trim() || undefined,
  name: String(row.name ?? "").trim(),
  type: String(row.type ?? "Geofence").trim() || "Geofence",
  site: String(row.site ?? "").trim() || undefined,
  speed: String(row.speed ?? "").trim(),
  availability: String(row.availability ?? "Available").trim() || "Available",
  contact: String(row.contact ?? "").trim(),
  contactTel: String(row.contactTel ?? "").trim(),
  area: String(row.area ?? "").trim() || undefined
});

function sameSiteName(a: LocationGeofence, b: LocationGeofence): boolean {
  return a.name.toLowerCase() === b.name.toLowerCase()
    && String(a.site ?? "").toLowerCase() === String(b.site ?? "").toLowerCase();
}

function shapeFingerprint(shape?: LocationShape | null): string {
  if (!shape) return "";
  try {
    return JSON.stringify(locationShapeToGpsIotPayload(shape));
  } catch {
    return locationShapeToTraccarArea(shape);
  }
}

/** True when GPS IoT geometry + contact fields are unchanged (speed/type can update library-only). */
function gpsIotRemoteFieldsUnchanged(prev: LocationGeofence, next: LocationGeofence, nextShape: LocationShape): boolean {
  const prevShape = prev.shape
    ?? (prev.area ? parseTraccarAreaToShape(prev.area) : null);
  if (!prevShape) return false;
  return shapeFingerprint(prevShape) === shapeFingerprint(nextShape)
    && prev.name.toLowerCase() === next.name.toLowerCase()
    && String(prev.contact ?? "").trim() === String(next.contact ?? "").trim()
    && String(prev.contactTel ?? "").trim() === String(next.contactTel ?? "").trim()
    && String(prev.description ?? "").trim() === String(next.description ?? "").trim();
}

async function upsertLibraryItem(saved: LocationGeofence, alsoDropGeoIds: string[] = []) {
  const current = await loadScopedFromApi<{ items?: LocationGeofence[] }>(LOCATION_LIBRARY_KEY);
  const items = Array.isArray(current?.items) ? current!.items.map(normalizeLocation) : [];
  const dropIds = new Set(
    [saved.gpsIotGeoId, ...alsoDropGeoIds]
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
  );
  const next = items.filter((row) => {
    if (row.gpsIotGeoId && dropIds.has(row.gpsIotGeoId)) return false;
    const attrGeo = String(row.attributes?.gpsIotGeoId ?? row.attributes?.viviGpsIotGeofenceId ?? "").trim();
    if (attrGeo && dropIds.has(attrGeo)) return false;
    if (saved.traccarId && row.traccarId === saved.traccarId) return false;
    return !sameSiteName(row, saved);
  });
  next.unshift(saved);
  await saveScopedToApi(LOCATION_LIBRARY_KEY, { items: next });
  window.dispatchEvent(new Event("vivi:locationschange"));
}

async function removeLibraryItem(normalized: LocationGeofence) {
  const current = await loadScopedFromApi<{ items?: LocationGeofence[] }>(LOCATION_LIBRARY_KEY);
  const items = Array.isArray(current?.items) ? current!.items.map(normalizeLocation) : [];
  const dropIds = new Set(
    [normalized.gpsIotGeoId, String(normalized.attributes?.gpsIotGeoId ?? "").trim()]
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
  );
  const next = items.filter((row) => {
    if (row.gpsIotGeoId && dropIds.has(row.gpsIotGeoId)) return false;
    const attrGeo = String(row.attributes?.gpsIotGeoId ?? "").trim();
    if (attrGeo && dropIds.has(attrGeo)) return false;
    if (normalized.traccarId && row.traccarId === normalized.traccarId) return false;
    return !sameSiteName(row, normalized);
  });
  await saveScopedToApi(LOCATION_LIBRARY_KEY, { items: next });
  window.dispatchEvent(new Event("vivi:locationschange"));
}

export async function loadLocationGeofences(): Promise<LocationGeofence[]> {
  const tenantId = readActiveTenantId();
  const activeSite = readActiveSiteName();
  if (!activeSite) return [];
  const stored = await loadScopedFromApi<{ items?: LocationGeofence[] }>(LOCATION_LIBRARY_KEY).catch(() => null);
  const metadata = Array.isArray(stored?.items) ? stored!.items.map(normalizeLocation) : [];

  if (isGpsIotServer()) {
    const siteKey = activeSite.toLowerCase();
    // Site-scoped KV only — drop any stray rows that somehow lack / mismatch site.
    const siteMetadata = metadata.filter(
      (row) => String(row.site ?? "").trim().toLowerCase() === siteKey
    );
    const remote = await listGpsIotGeofences().catch(() => []);
    const metadataByGeoId = new Map(
      siteMetadata.filter((row) => row.gpsIotGeoId).map((row) => [String(row.gpsIotGeoId), row])
    );
    const metadataByName = new Map(
      siteMetadata.map((row) => [row.name.toLowerCase(), row])
    );
    const merged = remote.map((raw) => {
      const local = metadataByGeoId.get(raw.geoId) ?? metadataByName.get(raw.name.toLowerCase());
      const shape = raw.shape?.type === "circle" && raw.shape.center
        ? {
            type: "circle" as const,
            center: raw.shape.center,
            radius: Math.max(1, Math.round(Number(raw.shape.radius ?? 1)))
          }
        : raw.shape?.type === "polygon" && Array.isArray(raw.shape.points)
          ? { type: "polygon" as const, points: raw.shape.points }
          : parseTraccarAreaToShape(raw.area) ?? local?.shape;
      return normalizeLocation({
        ...(local ?? {}),
        id: String(raw.numericId || raw.geoId || local?.id || raw.name),
        traccarId: undefined,
        gpsIotGeoId: raw.geoId,
        name: raw.name || local?.name || "Location",
        type: String(local?.type ?? "Geofence"),
        site: activeSite,
        speed: local?.speed ?? "",
        availability: local?.availability ?? "Available",
        description: raw.description || local?.description || "",
        contact: raw.contact || local?.contact || "",
        contactTel: raw.contactTel || local?.contactTel || "",
        externalReference: String(local?.externalReference ?? "").trim() || raw.geoId,
        area: raw.area || local?.area,
        shape,
        attributes: {
          ...(local?.attributes ?? {}),
          source: "gpsiot",
          gpsIotGeoId: raw.geoId,
          viviGpsIotGeofenceId: raw.geoId,
          viviSite: activeSite,
          viviSpeed: local?.speed ?? "",
          viviTenantId: tenantId,
          viviExternalReference: String(local?.externalReference ?? "").trim() || raw.geoId
        }
      });
    });
    const remoteIds = new Set(merged.map((row) => String(row.gpsIotGeoId ?? "")));
    const remoteNames = new Set(merged.map((row) => row.name.toLowerCase()));
    for (const row of siteMetadata) {
      if ((row.gpsIotGeoId && remoteIds.has(row.gpsIotGeoId)) || remoteNames.has(row.name.toLowerCase())) continue;
      merged.push({ ...row, site: activeSite });
    }
    return merged
      .filter((row) => String(row.site ?? "").trim().toLowerCase() === siteKey)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const traccarRows = await listTraccarGeofenceDefinitions().catch(() => []);
  const metadataById = new Map(
    metadata
      .filter((row) => row.traccarId)
      .map((row) => [String(row.traccarId), row])
  );
  const metadataByName = new Map(metadata.map((row) => [row.name.toLowerCase(), row]));

  const merged = (Array.isArray(traccarRows) ? traccarRows : [])
    .filter((raw) => {
      const rowTenant = String(raw.attributes?.viviTenantId ?? "").trim();
      return !rowTenant || !tenantId || rowTenant === tenantId;
    })
    .map((raw) => {
      const traccarId = Math.trunc(Number(raw.id ?? 0));
      const name = String(raw.name ?? "").trim();
      const local = metadataById.get(String(traccarId)) ?? metadataByName.get(name.toLowerCase());
      const attributes = { ...(raw.attributes ?? {}), ...(local?.attributes ?? {}) };
      return normalizeLocation({
        ...(local ?? {}),
        id: String(traccarId || local?.id || name),
        traccarId: traccarId || local?.traccarId,
        name: name || local?.name || "Location",
        type: String(attributes.viviLocationType ?? local?.type ?? "Geofence"),
        site: String(attributes.viviSite ?? local?.site ?? "").trim() || undefined,
        speed: String(attributes.viviSpeed ?? local?.speed ?? "").trim(),
        availability: String(attributes.viviAvailability ?? local?.availability ?? "Available"),
        description: String(raw.description ?? local?.description ?? "").trim(),
        area: String(raw.area ?? local?.area ?? "").trim(),
        attributes
      });
    });

  const traccarIds = new Set(merged.map((row) => String(row.traccarId ?? "")));
  const traccarNames = new Set(merged.map((row) => row.name.toLowerCase()));
  for (const row of metadata) {
    if ((row.traccarId && traccarIds.has(String(row.traccarId))) || traccarNames.has(row.name.toLowerCase())) continue;
    merged.push(row);
  }
  return merged
    .filter((row) => {
      const rowSite = String(row.site ?? "").trim();
      return rowSite.toLowerCase() === activeSite.toLowerCase();
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveLocationGeofence(
  location: LocationGeofence,
  options?: { libraryOnly?: boolean; forceRemote?: boolean }
): Promise<LocationGeofence> {
  const activeSite = readActiveSiteName();
  if (!activeSite) throw new Error("Select a site in the organisation ribbon before creating a location.");
  const requestedSite = String(location.site ?? "").trim();
  if (requestedSite && requestedSite.toLowerCase() !== activeSite.toLowerCase()) {
    throw new Error(`Locations can only be created under the selected site "${activeSite}".`);
  }
  const normalized = normalizeLocation({ ...location, site: activeSite });
  if (!normalized.name) throw new Error("Location name is required.");
  const shape = normalized.shape
    ?? (normalized.area ? parseTraccarAreaToShape(normalized.area) ?? undefined : undefined);
  if (!shape && !normalized.area) throw new Error("Draw the geofence before saving.");
  const area = shape ? locationShapeToTraccarArea(shape) : String(normalized.area ?? "").trim();
  if (!area) throw new Error("Draw the geofence before saving.");
  const speedKph = Number(normalized.speed);
  const speedLimitKnots = Number.isFinite(speedKph) && speedKph > 0 ? speedKph / 1.852 : undefined;

  if (isGpsIotServer()) {
    if (!shape) throw new Error("Draw the geofence before saving.");
    const ctxSite = activeSite;
    // Never accept a site override that would write into another site's library/ClientID.
    if (String(normalized.site ?? "").toLowerCase() !== ctxSite.toLowerCase()) {
      throw new Error(`Locations can only be saved under the selected site "${ctxSite}".`);
    }

    // Speed / availability / type / color live in Location Library (+ Binding).
    // Only recreate remotely when geometry or GPS IoT contact fields change — avoids
    // delete+create duplicates and GeoID churn on every speed tweak or binding sync.
    let skipRemote = Boolean(options?.libraryOnly) && Boolean(normalized.gpsIotGeoId);
    if (!skipRemote && !options?.forceRemote && normalized.gpsIotGeoId) {
      const stored = await loadScopedFromApi<{ items?: LocationGeofence[] }>(LOCATION_LIBRARY_KEY).catch(() => null);
      const items = Array.isArray(stored?.items)
        ? stored!.items.map(normalizeLocation).filter(
            (row) => String(row.site ?? "").toLowerCase() === ctxSite.toLowerCase()
          )
        : [];
      const prev = items.find((row) =>
        (row.gpsIotGeoId && row.gpsIotGeoId === normalized.gpsIotGeoId)
        || sameSiteName(row, normalized)
      );
      if (prev && gpsIotRemoteFieldsUnchanged(prev, normalized, shape)) {
        skipRemote = true;
      }
    }

    if (skipRemote && normalized.gpsIotGeoId) {
      const saved = normalizeLocation({
        ...normalized,
        id: String(normalized.gpsIotGeoId || normalized.id),
        traccarId: undefined,
        site: ctxSite,
        gpsIotGeoId: normalized.gpsIotGeoId,
        externalReference: String(normalized.externalReference ?? "").trim() || normalized.gpsIotGeoId,
        area,
        shape,
        attributes: {
          ...(normalized.attributes ?? {}),
          source: "gpsiot",
          gpsIotGeoId: normalized.gpsIotGeoId,
          viviGpsIotGeofenceId: normalized.gpsIotGeoId,
          viviManaged: true,
          viviTenantId: readActiveTenantId(),
          viviSite: ctxSite,
          viviLocationType: normalized.type,
          viviSpeed: normalized.speed ?? "",
          speedLimit: speedLimitKnots ?? 0,
          viviAvailability: normalized.availability ?? "Available",
          viviExternalReference: String(normalized.externalReference ?? "").trim() || normalized.gpsIotGeoId,
          color: normalized.color ?? "#0ea5e9"
        }
      });
      await upsertLibraryItem(saved);
      return saved;
    }

    const gpsShape = locationShapeToGpsIotPayload(shape);
    const result = await saveGpsIotGeofenceApi({
      name: normalized.name,
      geoId: normalized.gpsIotGeoId,
      shape: gpsShape,
      description: normalized.description,
      contact: normalized.contact,
      contactTel: normalized.contactTel,
      locationType: normalized.type,
      site: ctxSite
    });
    if (!result.ok || !result.geoId) {
      throw new Error(result.error || "GPS IoT rejected the geofence.");
    }
    const priorGeoId = String(result.deletedPriorId ?? normalized.gpsIotGeoId ?? "").trim();
    const saved = normalizeLocation({
      ...normalized,
      id: String(result.geoId),
      traccarId: undefined,
      site: ctxSite,
      gpsIotGeoId: result.geoId,
      externalReference: String(normalized.externalReference ?? "").trim() || result.geoId,
      area: result.area || area,
      shape,
      attributes: {
        ...(normalized.attributes ?? {}),
        source: "gpsiot",
        gpsIotGeoId: result.geoId,
        viviGpsIotGeofenceId: result.geoId,
        viviManaged: true,
        viviTenantId: readActiveTenantId(),
        viviSite: ctxSite,
        viviLocationType: normalized.type,
        viviSpeed: normalized.speed ?? "",
        speedLimit: speedLimitKnots ?? 0,
        viviAvailability: normalized.availability ?? "Available",
        viviExternalReference: String(normalized.externalReference ?? "").trim() || result.geoId,
        color: normalized.color ?? "#0ea5e9"
      }
    });
    await upsertLibraryItem(
      saved,
      priorGeoId && priorGeoId !== result.geoId ? [priorGeoId] : []
    );
    return saved;
  }

  const attributes = {
    ...(normalized.attributes ?? {}),
    viviManaged: true,
    viviTenantId: readActiveTenantId(),
    viviSite: normalized.site ?? "",
    viviLocationType: normalized.type,
    viviSpeed: normalized.speed ?? "",
    speedLimit: speedLimitKnots ?? 0,
    viviAvailability: normalized.availability ?? "Available",
    viviExternalReference: normalized.externalReference ?? "",
    color: normalized.color ?? "#0ea5e9",
    polylineDistance: 0
  };
  const payload = {
    name: normalized.name,
    description: normalized.description ?? "",
    area,
    attributes
  };

  const result = normalized.traccarId
    ? await updateTraccarGeofence(normalized.traccarId, payload)
    : await createTraccarGeofence(payload);
  if (!result.ok) throw new Error(result.error || "VIVI rejected the geofence.");

  const returnedId = Math.trunc(Number(result.body?.id ?? normalized.traccarId ?? 0));
  const saved = normalizeLocation({
    ...normalized,
    id: String(returnedId || normalized.id || normalized.name),
    traccarId: returnedId || normalized.traccarId,
    area,
    attributes
  });
  await upsertLibraryItem(saved);
  return saved;
}

export async function removeLocationGeofence(location: LocationGeofence): Promise<void> {
  const normalized = normalizeLocation(location);
  if (isGpsIotServer()) {
    const listed = await listGpsIotGeofences().catch(() => []);
    const seedId = normalized.gpsIotGeoId
      || String(normalized.attributes?.gpsIotGeoId ?? "").trim()
      || String(normalized.externalReference ?? "").trim();
    const targets = new Map<string, string>();
    if (seedId) targets.set(seedId, normalized.name);
    for (const row of listed) {
      if (seedId && row.geoId === seedId) targets.set(row.geoId, row.name || normalized.name);
      if (normalized.name && row.name.toLowerCase() === normalized.name.toLowerCase()) {
        targets.set(row.geoId, row.name || normalized.name);
      }
    }
    for (const [geoId, name] of targets) {
      const result = await deleteGpsIotGeofence({ geoId, name });
      if (!result.ok && !/not found|already|does not exist|absent/i.test(String(result.error ?? ""))) {
        throw new Error(result.error || "GPS IoT rejected the geofence deletion.");
      }
    }
    await removeLibraryItem(normalized);
    return;
  }
  if (normalized.traccarId) {
    const result = await deleteTraccarGeofence(normalized.traccarId);
    if (!result.ok && result.status !== 404) {
      throw new Error(result.error || "VIVI rejected the geofence deletion.");
    }
  }
  await removeLibraryItem(normalized);
}

/** Removes location-library mirror rows from Location Bindings storage. */
export async function cleanupLocationLibraryTemplateBindings(): Promise<number> {
  try {
    const bindings = await getBindings<Record<string, unknown>>("locations", { refresh: true });
    let removed = 0;
    for (const entry of bindings) {
      const id = String(entry?.id ?? "").trim();
      if (!id || !isLocationLibraryTemplateBinding(entry)) continue;
      const result = await deleteBindingDetailed("locations", id);
      if (result.deleted) removed += 1;
    }
    if (removed > 0 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vivi:bindingschange"));
    }
    return removed;
  } catch {
    return 0;
  }
}
