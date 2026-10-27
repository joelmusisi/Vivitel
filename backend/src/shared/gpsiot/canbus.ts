import type { GpsIotSecrets } from "./secrets.ts";

/**
 * GPS IoT CANBUS status ↔ Vivitel CAN library / device binding (C1/C2).
 *
 * POST /api/Status/v2/GetCanBus { AssetId }
 * Returns a dynamic map of CAN fields (RPM, FuelL, Vehiclespeed, …).
 * When a config group's device binding has canEnabled + canProtocol on C1/C2,
 * Live Tracking / APIs pull this feed for the asset.
 */

export type GpsIotCanBusField = {
  key: string;
  raw: string;
  value: number | null;
  unit: string;
};

export type GpsIotCanBusStatus = {
  assetId: string;
  fields: Record<string, string>;
  parsed: GpsIotCanBusField[];
  /** Normalized Traccar-style attributes for Live Tracking. */
  attributes: Record<string, unknown>;
};

const asRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
const text = (value: unknown) => String(value ?? "").trim();

/** Strip HTML entities and unit suffixes → finite number when possible. */
export function parseGpsIotCanBusNumber(raw: unknown): { value: number | null; unit: string; text: string } {
  const source = text(raw)
    .replace(/&deg;?/gi, "°")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "");
  if (!source) return { value: null, unit: "", text: "" };
  const match = source.match(/(-?\d+(?:\.\d+)?)\s*([a-zA-Z°%/]+)?/);
  if (!match) return { value: null, unit: "", text: source };
  const value = Number(match[1]);
  return {
    value: Number.isFinite(value) ? value : null,
    unit: text(match[2]),
    text: source
  };
}

const FIELD_ALIASES: Record<string, string[]> = {
  rpm: ["RPM", "rpm", "EngineRPM"],
  coolantTemp: ["CTemp", "CoolantTemp", "coolantTemp", "EngineCoolantTemp"],
  fuel: ["FuelL", "Fuel", "fuel"],
  fuelLevel: ["FuelPerc", "FuelLevel", "fuelLevel"],
  engFuelRate: ["EngFuelRate", "FuelRate", "engFuelRate"],
  engLoad: ["EngLoad", "EngineLoad", "engLoad"],
  ctlState: ["CtlState", "ControlState", "ctlState"],
  fuelUsed: ["FuelUsed", "fuelUsed"],
  acceleratorPedal: ["AccelleratorPedalPositionD", "AcceleratorPedalPositionD", "AcceleratorPedal"],
  canSpeed: ["Vehiclespeed", "VehicleSpeed", "canSpeed", "obdSpeed"],
  axleWeight: ["Axle", "AxleWeight", "axle"],
  obdOdometer: ["ObdOdometer", "OBDOdometer", "odometer"]
};

function pickField(fields: Record<string, string>, aliases: string[]): string {
  for (const key of aliases) {
    if (fields[key] != null && text(fields[key]) !== "") return fields[key];
    const found = Object.keys(fields).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (found) return fields[found];
  }
  return "";
}

export function mapGpsIotCanBusAttributes(fields: Record<string, string>): Record<string, unknown> {
  const attributes: Record<string, unknown> = { source: "gpsiot-canbus" };
  for (const [attrKey, aliases] of Object.entries(FIELD_ALIASES)) {
    const raw = pickField(fields, aliases);
    if (!raw) continue;
    const parsed = parseGpsIotCanBusNumber(raw);
    if (parsed.value == null) {
      attributes[attrKey] = parsed.text || raw;
      continue;
    }
    attributes[attrKey] = parsed.value;
    if (attrKey === "canSpeed") {
      attributes.obdSpeed = parsed.value;
      // Keep km/h as reported; Live Tracking speed conversion is separate.
    }
    if (attrKey === "fuel") {
      attributes.fuelLevel = parsed.value;
    }
    if (attrKey === "fuelLevel" && attributes.fuel == null) {
      // Percent — only set fuelLevel when litres were not already set.
      attributes.fuelLevelPercent = parsed.value;
    }
    if (attrKey === "obdOdometer") {
      // GPS IoT often returns metres already (e.g. 125192000).
      attributes.odometer = parsed.value;
      attributes.totalDistance = parsed.value;
    }
  }
  // Preserve every raw CAN key for library/binding consumers.
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || text(value) === "") continue;
    attributes[`can.${key}`] = value;
    const parsed = parseGpsIotCanBusNumber(value);
    if (parsed.value != null) attributes[`can.${key}.value`] = parsed.value;
  }
  return attributes;
}

export function parseGpsIotCanBus(payload: unknown, assetId = ""): GpsIotCanBusStatus {
  const root = asRecord(payload);
  const nested = asRecord(root.data);
  const result = asRecord(nested.Result ?? nested.result ?? root.Result ?? root.result);
  const source =
    Object.keys(result).length > 0
      ? result
      : Array.isArray(root)
        ? {}
        : root.success === true || root.IsCompleted === true
          ? asRecord(nested)
          : root;

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "success" || key === "IsCompleted" || key === "data" || key === "message") continue;
    if (value != null && typeof value !== "object") fields[key] = text(value);
  }

  const parsed: GpsIotCanBusField[] = Object.entries(fields).map(([key, raw]) => {
    const number = parseGpsIotCanBusNumber(raw);
    return { key, raw, value: number.value, unit: number.unit };
  });

  return {
    assetId: text(assetId) || text(root.AssetId ?? root.assetId),
    fields,
    parsed,
    attributes: mapGpsIotCanBusAttributes(fields)
  };
}

export async function fetchGpsIotCanBus(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { assetId?: string },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotCanBusStatus> {
  const assetId = text(body.assetId);
  if (!assetId) throw new Error("assetId is required");
  const response = await fetchImpl(`${secrets.baseUrl}/api/Status/v2/GetCanBus`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ AssetId: assetId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = text(asRecord(payload).message ?? asRecord(payload).Message)
      || `GPS IoT CANBUS status failed (${response.status})`;
    throw new Error(message);
  }
  return parseGpsIotCanBus(payload, assetId);
}
