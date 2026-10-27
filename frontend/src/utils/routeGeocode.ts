import { buildApiUrl } from "./api";

export type GeoPoint = { lat: number; lng: number; label?: string };

/** Parse "lat, lng" or "lat lng" into numbers. */
export function parseLatLngQuery(raw: string): GeoPoint | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
}

function googleMapsKey(): string {
  return String((import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ?? "").trim();
}

async function geocodeWithGoogle(address: string): Promise<GeoPoint | null> {
  const key = googleMapsKey();
  if (!key) return null;
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`
  );
  const body = (await response.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };
  const hit = body.results?.[0];
  const location = hit?.geometry?.location;
  if (body.status !== "OK" || typeof location?.lat !== "number" || typeof location?.lng !== "number") {
    return null;
  }
  return {
    lat: location.lat,
    lng: location.lng,
    label: String(hit?.formatted_address ?? address).trim() || address
  };
}

async function geocodeWithNominatim(address: string): Promise<GeoPoint | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
    { headers: { Accept: "application/json" } }
  );
  const results = (await response.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
  const hit = results?.[0];
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    label: String(hit?.display_name ?? address).trim() || address
  };
}

/**
 * Resolve a place by coordinates ("0.35, 32.58") or by place name.
 * Coordinates take priority when the query parses as lat/lng.
 */
export async function resolveLocationQuery(query: string): Promise<GeoPoint> {
  const text = String(query ?? "").trim();
  if (!text) throw new Error("Enter a place name or coordinates (lat, lng).");

  const coords = parseLatLngQuery(text);
  if (coords) {
    const label = await reverseGeocodeLabel(coords.lat, coords.lng).catch(() => coords.label);
    return { ...coords, label: label || coords.label };
  }

  const google = await geocodeWithGoogle(text).catch(() => null);
  if (google) return google;
  const osm = await geocodeWithNominatim(text).catch(() => null);
  if (osm) return osm;
  throw new Error("No location found for that name or coordinates.");
}

export async function reverseGeocodeLabel(lat: number, lng: number): Promise<string> {
  try {
    const response = await fetch(
      buildApiUrl(`/api/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`)
    );
    if (response.ok) {
      const body = (await response.json()) as { display_name?: string; label?: string; address?: string };
      const label = String(body.display_name ?? body.label ?? body.address ?? "").trim();
      if (label) return label;
    }
  } catch {
    // fall through
  }

  const key = googleMapsKey();
  if (key) {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${lat},${lng}`)}&key=${encodeURIComponent(key)}`
      );
      const body = (await response.json()) as {
        status?: string;
        results?: Array<{ formatted_address?: string }>;
      };
      const label = String(body.results?.[0]?.formatted_address ?? "").trim();
      if (body.status === "OK" && label) return label;
    } catch {
      // fall through
    }
  }

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
