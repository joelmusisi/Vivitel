import { GpsIotClientError, gpsIotMessage } from "./clients.ts";
import type { GpsIotSecrets } from "./secrets.ts";

/**
 * GPS IoT geofences ↔ Control Location + Location Library + Location Binding.
 *
 * API (Documentation V3.0):
 * - POST api/Geofence/CreateGeofence          circle (Lat/Lon/GeoRadius)
 * - POST api/Geofence/CreatePolygonGeofence   polygon points (≥3)
 * - POST api/Geofence/GetOneGeofence          by GeoID
 * - POST api/Geofence/GetGeofenceByClient     list by ClientID
 * - POST api/Geofence/DeleteGeofence          by GeoID
 *
 * No Update endpoint — upsert = Delete (if GeoID or same name) then Create,
 * so Control Location save never creates duplicates and delete clears the remote row.
 *
 * Site isolation: ClientID is the Vivitel site's GPS IoT client. Never resolve
 * geofences via database-name matching — that would mix sites under one DB.
 *
 * Speed assignment is not on the GPS IoT geofence body; Vivitel keeps it on
 * Location Library (`speed`) and Location Binding (`overSpeedKph`).
 * United Kingdom never uses Traccar for geofences.
 */

export type GpsIotGeofencePoint = { lat: number; lng: number };

export type GpsIotGeofenceShape =
  | { type: "circle"; center: GpsIotGeofencePoint; radius: number }
  | { type: "polygon"; points: GpsIotGeofencePoint[] };

export type GpsIotMappedGeofence = {
  geoId: string;
  name: string;
  description: string;
  contact: string;
  contactTel: string;
  shape: GpsIotGeofenceShape;
  area: string;
  /** Synthetic numeric id for Traccar-shaped callers (hashed GeoID). */
  numericId: number;
};

const asRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
const asText = (value: unknown) => String(value ?? "").trim();
const asNum = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function readGpsIotBody(response: Response): Promise<unknown> {
  const text = (await response.text()).trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { Message: text.replace(/^"|"$/g, "") };
  }
}

async function gpsIotJson(
  secrets: GpsIotSecrets,
  accessToken: string,
  path: string,
  method: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch
) {
  const response = await fetchImpl(`${secrets.baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });
  const payload = await readGpsIotBody(response);
  if (!response.ok) {
    throw new GpsIotClientError(gpsIotMessage(payload, `GPS IoT geofence request failed (${response.status})`), response.status);
  }
  return payload;
}

export function gpsIotGeofenceNumericId(geoId: string): number {
  let hash = 0;
  const value = String(geoId ?? "");
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) % 900000000;
  }
  return hash + 2000;
}

const numberText = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(7)).toString();
};

export function gpsIotShapeToArea(shape: GpsIotGeofenceShape): string {
  if (shape.type === "circle") {
    return `CIRCLE (${numberText(shape.center.lat)} ${numberText(shape.center.lng)}, ${Math.max(1, Math.round(shape.radius))})`;
  }
  const points = [...shape.points];
  if (points.length < 3) throw new GpsIotClientError("A polygon geofence requires at least three points", 400);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first.lat !== last.lat || first.lng !== last.lng) points.push(first);
  return `POLYGON ((${points.map((point) => `${numberText(point.lat)} ${numberText(point.lng)}`).join(", ")}))`;
}

export function parseGpsIotGeofenceRows(payload: unknown): GpsIotMappedGeofence[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root.Geofence)
    ? root.Geofence
    : Array.isArray(root.geofence)
      ? root.geofence
      : Array.isArray(root.Data)
        ? root.Data
        : Array.isArray(payload)
          ? payload
          : [];
  return rows.flatMap((row) => {
    const record = asRecord(row);
    const geoId = asText(record.GeoID ?? record.GeoId ?? record.geofenceId ?? record.id);
    const name = asText(record.GeoName ?? record.vgeoname ?? record.name);
    if (!geoId && !name) return [];
    const lat = asNum(record.Lat ?? record.lat ?? record.vlatitude);
    const lon = asNum(record.Lon ?? record.lon ?? record.vlongitude);
    const radius = asNum(record.GeoRadius ?? record.geoRadius ?? record.radius);
    const pointRows = Array.isArray(record.points) ? record.points : Array.isArray(record.Points) ? record.Points : [];
    let shape: GpsIotGeofenceShape;
    if (pointRows.length >= 3) {
      shape = {
        type: "polygon",
        points: pointRows.map((point) => {
          const item = asRecord(point);
          return {
            lat: asNum(item.vlatitude ?? item.Lat ?? item.lat),
            lng: asNum(item.vlongitude ?? item.Lon ?? item.lng ?? item.lon)
          };
        }).filter((point) => point.lat !== 0 || point.lng !== 0)
      };
      if (shape.points.length < 3) return [];
    } else if (radius > 0 && (lat !== 0 || lon !== 0)) {
      shape = { type: "circle", center: { lat, lng: lon }, radius };
    } else if (lat !== 0 || lon !== 0) {
      shape = { type: "circle", center: { lat, lng: lon }, radius: Math.max(1, radius || 100) };
    } else {
      return [];
    }
    const id = geoId || `name:${name}`;
    return [{
      geoId: id,
      name: name || id,
      description: asText(record.vdescription ?? record.description),
      contact: asText(record.Contact ?? record.contact),
      contactTel: asText(record.ContactTel ?? record.contactTel),
      shape,
      area: gpsIotShapeToArea(shape),
      numericId: gpsIotGeofenceNumericId(id)
    }];
  });
}

export function extractGpsIotGeofenceId(payload: unknown): string {
  const root = asRecord(payload);
  return asText(
    root.GeofenceID
    ?? root.GeofenceId
    ?? root.GeoID
    ?? root.GeoId
    ?? root.id
    ?? root.Id
  );
}

export async function listGpsIotGeofencesByClient(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotMappedGeofence[]> {
  const id = asText(clientId);
  if (!id) throw new GpsIotClientError("clientId is required", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Geofence/GetGeofenceByClient",
    "POST",
    { ClientID: id },
    fetchImpl
  );
  return parseGpsIotGeofenceRows(payload);
}

export async function getGpsIotGeofenceById(
  secrets: GpsIotSecrets,
  accessToken: string,
  geoId: string,
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotMappedGeofence | null> {
  const id = asText(geoId);
  if (!id) throw new GpsIotClientError("GeoID is required", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Geofence/GetOneGeofence",
    "POST",
    { GeoID: id },
    fetchImpl
  );
  return parseGpsIotGeofenceRows(payload)[0] ?? null;
}

export async function deleteGpsIotGeofence(
  secrets: GpsIotSecrets,
  accessToken: string,
  geoId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ deleted: boolean; message: string }> {
  const id = asText(geoId);
  if (!id) throw new GpsIotClientError("GeoID is required", 400);
  try {
    const payload = await gpsIotJson(
      secrets,
      accessToken,
      "/api/Geofence/DeleteGeofence",
      "POST",
      { GeoID: id },
      fetchImpl
    );
    return {
      deleted: true,
      message: gpsIotMessage(payload, "Geofence deleted successfully")
    };
  } catch (error) {
    if (error instanceof GpsIotClientError && (error.status === 404 || /not found|already|does not exist/i.test(error.message))) {
      return { deleted: true, message: error.message || "Geofence already absent" };
    }
    throw error;
  }
}

async function createGpsIotCircleGeofence(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: {
    clientId: string;
    name: string;
    lat: number;
    lon: number;
    radius: number;
    contact?: string;
    contactTel?: string;
  },
  fetchImpl: typeof fetch
) {
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Geofence/CreateGeofence",
    "POST",
    {
      ClientID: body.clientId,
      GeoName: body.name,
      Lat: body.lat,
      Lon: body.lon,
      GeoRadius: body.radius,
      Contact: asText(body.contact),
      ContactTel: asText(body.contactTel)
    },
    fetchImpl
  );
  const geoId = extractGpsIotGeofenceId(payload);
  if (!geoId) throw new GpsIotClientError(gpsIotMessage(payload, "GPS IoT create geofence did not return GeofenceID"), 502);
  return geoId;
}

async function createGpsIotPolygonGeofence(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: {
    clientId: string;
    name: string;
    description?: string;
    points: GpsIotGeofencePoint[];
    zoomLevel?: number;
    geofenceType?: string;
  },
  fetchImpl: typeof fetch
) {
  if (body.points.length < 3) throw new GpsIotClientError("Please provide sufficient coordinates", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Geofence/CreatePolygonGeofence",
    "POST",
    {
      clientid: body.clientId,
      zoomlevel: Number.isFinite(Number(body.zoomLevel)) ? Number(body.zoomLevel) : 14,
      geofenceType: asText(body.geofenceType) || "polygon",
      vdescription: asText(body.description),
      vgeoname: body.name,
      points: body.points.map((point) => ({
        vlatitude: point.lat,
        vlongitude: point.lng
      }))
    },
    fetchImpl
  );
  const geoId = extractGpsIotGeofenceId(payload);
  if (!geoId) throw new GpsIotClientError(gpsIotMessage(payload, "GPS IoT create polygon did not return id"), 502);
  return geoId;
}

function normalizeSaveShape(body: Record<string, unknown>): GpsIotGeofenceShape {
  const shapeRoot = asRecord(body.shape);
  const type = asText(shapeRoot.type ?? body.shapeType ?? body.type).toLowerCase();
  if (type === "circle" || (!type && asNum(body.radius ?? shapeRoot.radius) > 0)) {
    const center = asRecord(shapeRoot.center);
    const lat = asNum(center.lat ?? body.lat ?? body.Lat);
    const lng = asNum(center.lng ?? center.lon ?? body.lon ?? body.Lon);
    const radius = Math.max(1, Math.round(asNum(shapeRoot.radius ?? body.radius ?? body.GeoRadius)));
    if (lat === 0 && lng === 0) throw new GpsIotClientError("Circle centre lat/lon is required", 400);
    return { type: "circle", center: { lat, lng }, radius };
  }
  const rawPoints = Array.isArray(shapeRoot.points)
    ? shapeRoot.points
    : Array.isArray(body.points)
      ? body.points
      : [];
  const points = rawPoints.map((point) => {
    const item = asRecord(point);
    return {
      lat: asNum(item.lat ?? item.vlatitude ?? item.Lat),
      lng: asNum(item.lng ?? item.lon ?? item.vlongitude ?? item.Lon)
    };
  }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (points.length < 3) throw new GpsIotClientError("Polygon requires at least three points", 400);
  return { type: "polygon", points };
}

/**
 * Create or replace a geofence without duplicates:
 * 1. Resolve existing GeoID from body or same-name row on the client
 * 2. Delete that GeoID (ignore already-gone)
 * 3. Create circle or polygon
 */
export async function saveGpsIotGeofence(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<{
  geoId: string;
  name: string;
  area: string;
  shape: GpsIotGeofenceShape;
  numericId: number;
  replaced: boolean;
  deletedPriorId: string;
}> {
  const clientId = asText(body.clientId ?? body.ClientID ?? body.clientid);
  const name = asText(body.name ?? body.GeoName ?? body.vgeoname);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!name) throw new GpsIotClientError("name is required", 400);
  const shape = normalizeSaveShape(body);
  const contact = asText(body.contact ?? body.Contact);
  const contactTel = asText(body.contactTel ?? body.ContactTel ?? body.mobile);
  const description = asText(body.description ?? body.vdescription);

  let priorId = asText(body.geoId ?? body.GeoID ?? body.GeofenceID ?? body.id);
  let replaced = Boolean(priorId);
  if (!priorId) {
    try {
      const existing = await listGpsIotGeofencesByClient(secrets, accessToken, clientId, fetchImpl);
      const hit = existing.find((row) => row.name.toLowerCase() === name.toLowerCase());
      if (hit?.geoId) {
        priorId = hit.geoId;
        replaced = true;
      }
    } catch {
      // Listing can fail; create may still succeed or return name-exists.
    }
  }

  if (priorId) {
    await deleteGpsIotGeofence(secrets, accessToken, priorId, fetchImpl);
  }

  let geoId = "";
  try {
    if (shape.type === "circle") {
      geoId = await createGpsIotCircleGeofence(
        secrets,
        accessToken,
        {
          clientId,
          name,
          lat: shape.center.lat,
          lon: shape.center.lng,
          radius: shape.radius,
          contact,
          contactTel
        },
        fetchImpl
      );
    } else {
      geoId = await createGpsIotPolygonGeofence(
        secrets,
        accessToken,
        {
          clientId,
          name,
          description,
          points: shape.points,
          zoomLevel: asNum(body.zoomLevel ?? body.zoomlevel) || 14,
          geofenceType: asText(body.geofenceType) || asText(body.locationType) || "polygon"
        },
        fetchImpl
      );
    }
  } catch (error) {
    // Name collision after a partial delete failure — force delete by name and retry once.
    if (error instanceof GpsIotClientError && /already exists|choose another name/i.test(error.message)) {
      const existing = await listGpsIotGeofencesByClient(secrets, accessToken, clientId, fetchImpl).catch(() => []);
      const hit = existing.find((row) => row.name.toLowerCase() === name.toLowerCase());
      if (hit?.geoId) {
        await deleteGpsIotGeofence(secrets, accessToken, hit.geoId, fetchImpl);
        if (shape.type === "circle") {
          geoId = await createGpsIotCircleGeofence(
            secrets,
            accessToken,
            {
              clientId,
              name,
              lat: shape.center.lat,
              lon: shape.center.lng,
              radius: shape.radius,
              contact,
              contactTel
            },
            fetchImpl
          );
        } else {
          geoId = await createGpsIotPolygonGeofence(
            secrets,
            accessToken,
            {
              clientId,
              name,
              description,
              points: shape.points,
              zoomLevel: asNum(body.zoomLevel ?? body.zoomlevel) || 14,
              geofenceType: asText(body.geofenceType) || asText(body.locationType) || "polygon"
            },
            fetchImpl
          );
        }
        replaced = true;
        priorId = hit.geoId;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  return {
    geoId,
    name,
    area: gpsIotShapeToArea(shape),
    shape,
    numericId: gpsIotGeofenceNumericId(geoId),
    replaced,
    deletedPriorId: priorId
  };
}
