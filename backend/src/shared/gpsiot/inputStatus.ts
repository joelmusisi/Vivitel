import type { GpsIotSecrets } from "./secrets.ts";

/**
 * GPS IoT digital / analogue input status for client assets.
 *
 * GET /api/InputStatus/GetClientAssetsStatus
 * Headers: Content-Type application/json, Authorization Bearer token
 * Optional query: clientId (when the tenant maps a Vivitel site → GPS IoT client).
 *
 * Feeds Live Tracking / Assets Diagnostics popups (Input status section).
 */

export type GpsIotAssetInput = {
  name: string;
  status: string;
  value: string | number | boolean | null;
  kind: "digital" | "analogue" | "unknown";
  raw: Record<string, unknown>;
};

export type GpsIotAssetInputStatus = {
  assetId: string;
  assetName: string;
  imei: string;
  registration: string;
  inputs: GpsIotAssetInput[];
  attributes: Record<string, unknown>;
  raw: Record<string, unknown>;
};

const asRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
const text = (value: unknown) => String(value ?? "").trim();

const DIGIT_NAME = /^(?:din|dout|input|in|di|do|digital(?:\s*input)?)[\s_-]*(\d+)$/i;
const ANALOGUE_NAME = /^(?:ain|aout|analogue|analog(?:\s*input)?|ai)[\s_-]*(\d+)$/i;
const IO_NAME = /^io[\s_-]*(\d+)$/i;

function classifyInput(name: string, value: unknown): GpsIotAssetInput["kind"] {
  if (DIGIT_NAME.test(name) || /^(high|low|on|off|true|false|1|0)$/i.test(text(value))) {
    if (ANALOGUE_NAME.test(name)) return "analogue";
    if (DIGIT_NAME.test(name)) return "digital";
  }
  if (ANALOGUE_NAME.test(name)) return "analogue";
  if (IO_NAME.test(name)) {
    const n = Number(text(value));
    if (Number.isFinite(n) && (n === 0 || n === 1)) return "digital";
    if (Number.isFinite(n) && Math.abs(n) > 1) return "analogue";
  }
  const n = Number(text(value));
  if (Number.isFinite(n) && Math.abs(n) > 1) return "analogue";
  return "unknown";
}

function formatStatus(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "1" || lower === "true" || lower === "on" || lower === "high" || lower === "active") return "High";
  if (lower === "0" || lower === "false" || lower === "off" || lower === "low" || lower === "inactive") return "Low";
  return raw;
}

function coerceValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  const raw = text(value);
  if (!raw) return null;
  if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === "true";
  const n = Number(raw);
  if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(raw)) return n;
  return raw;
}

function inputFromRecord(row: Record<string, unknown>, fallbackName = ""): GpsIotAssetInput | null {
  const name = text(
    row.name
      ?? row.Name
      ?? row.inputName
      ?? row.InputName
      ?? row.label
      ?? row.Label
      ?? row.key
      ?? row.Key
      ?? fallbackName
  );
  if (!name) return null;
  const value = coerceValue(
    row.value
      ?? row.Value
      ?? row.status
      ?? row.Status
      ?? row.state
      ?? row.State
      ?? row.reading
      ?? row.Reading
  );
  const status = formatStatus(
    row.status ?? row.Status ?? row.state ?? row.State ?? value
  ) || (value == null ? "—" : String(value));
  return {
    name,
    status,
    value,
    kind: classifyInput(name, value ?? status),
    raw: row
  };
}

function inputsFromFlatFields(row: Record<string, unknown>): GpsIotAssetInput[] {
  const skip = new Set([
    "assetid", "asset_id", "assetname", "asset_name", "name", "imei", "imeinumber",
    "registration", "reg", "vehiclereg", "success", "iscompleted", "message", "data",
    "inputs", "digitalinputs", "analogueinputs", "analoginputs", "iostatus", "attributes"
  ]);
  const out: GpsIotAssetInput[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (skip.has(key.toLowerCase())) continue;
    if (value != null && typeof value === "object") continue;
    if (!DIGIT_NAME.test(key) && !ANALOGUE_NAME.test(key) && !IO_NAME.test(key) && !/^input/i.test(key)) {
      continue;
    }
    const mapped = inputFromRecord({ name: key, value }, key);
    if (mapped) out.push(mapped);
  }
  return out;
}

function inputsFromNested(row: Record<string, unknown>): GpsIotAssetInput[] {
  const buckets = [
    row.Inputs,
    row.inputs,
    row.DigitalInputs,
    row.digitalInputs,
    row.AnalogueInputs,
    row.analogueInputs,
    row.AnalogInputs,
    row.analogInputs,
    row.IOStatus,
    row.ioStatus,
    row.Status,
    row.status
  ];
  const out: GpsIotAssetInput[] = [];
  for (const bucket of buckets) {
    if (Array.isArray(bucket)) {
      for (const item of bucket) {
        const mapped = inputFromRecord(asRecord(item));
        if (mapped) out.push(mapped);
      }
      continue;
    }
    const record = asRecord(bucket);
    if (!Object.keys(record).length) continue;
    // Object map of name → value/status
    for (const [key, value] of Object.entries(record)) {
      if (value != null && typeof value === "object" && !Array.isArray(value)) {
        const mapped = inputFromRecord({ ...asRecord(value), name: key }, key);
        if (mapped) out.push(mapped);
      } else {
        const mapped = inputFromRecord({ name: key, value }, key);
        if (mapped) out.push(mapped);
      }
    }
  }
  return out;
}

export function mapGpsIotInputAttributes(inputs: GpsIotAssetInput[]): Record<string, unknown> {
  const attributes: Record<string, unknown> = { source: "gpsiot-input-status" };
  for (const input of inputs) {
    const slug = text(input.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!slug) continue;
    attributes[`input.${slug}`] = input.value ?? input.status;
    attributes[`input.${slug}.status`] = input.status;
    attributes[`input.${slug}.kind`] = input.kind;
    // Traccar-style ioN when the label is IO / DIN / AIN indexed.
    const ioMatch = input.name.match(/(?:io|din|ain|input|di|ai)[\s_-]*(\d+)/i);
    if (ioMatch) {
      const n = Number(ioMatch[1]);
      if (Number.isFinite(n) && n > 0) {
        attributes[`io${n}`] = input.value ?? input.status;
      }
    }
  }
  return attributes;
}

export function parseGpsIotAssetInputStatusRow(row: unknown): GpsIotAssetInputStatus | null {
  const record = asRecord(row);
  if (!Object.keys(record).length) return null;
  const nested = asRecord(record.data ?? record.Data ?? record.Result ?? record.result);
  const source = Object.keys(nested).length ? { ...record, ...nested } : record;

  const assetId = text(
    source.AssetId ?? source.assetId ?? source.AssetID ?? source.id ?? source.Id
  );
  const assetName = text(
    source.AssetName ?? source.assetName ?? source.Name ?? source.name ?? source.VehicleName
  );
  const imei = text(
    source.Imei ?? source.IMEI ?? source.ImeiNumber ?? source.imei ?? source.uniqueId
  );
  const registration = text(
    source.Registration ?? source.registration ?? source.RegNo ?? source.vehiIdno ?? source.plate
  );

  const inputs = [
    ...inputsFromNested(source),
    ...inputsFromFlatFields(source)
  ];
  // Dedupe by name (nested wins).
  const byName = new Map<string, GpsIotAssetInput>();
  for (const input of inputs) {
    const key = input.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, input);
  }
  const unique = Array.from(byName.values());

  if (!assetId && !imei && !assetName && unique.length === 0) return null;

  return {
    assetId,
    assetName,
    imei,
    registration,
    inputs: unique,
    attributes: mapGpsIotInputAttributes(unique),
    raw: source
  };
}

export function parseGpsIotClientAssetsInputStatus(payload: unknown): GpsIotAssetInputStatus[] {
  const root = asRecord(payload);
  const candidates: unknown[] = [];
  if (Array.isArray(payload)) candidates.push(...payload);
  for (const key of ["data", "Data", "result", "Result", "assets", "Assets", "items", "Items", "status", "Status"]) {
    const value = root[key];
    if (Array.isArray(value)) candidates.push(...value);
    else if (value && typeof value === "object") {
      const nested = asRecord(value);
      for (const nestedKey of ["data", "Data", "assets", "Assets", "items", "Items"]) {
        if (Array.isArray(nested[nestedKey])) candidates.push(...(nested[nestedKey] as unknown[]));
      }
      // Single-asset object wrapped in data
      if (!Array.isArray(nested.data) && Object.keys(nested).length) {
        const single = parseGpsIotAssetInputStatusRow(nested);
        if (single && (single.inputs.length || single.assetId || single.imei)) {
          return [single];
        }
      }
    }
  }

  if (!candidates.length && Object.keys(root).length) {
    const single = parseGpsIotAssetInputStatusRow(root);
    return single ? [single] : [];
  }

  return candidates
    .map((row) => parseGpsIotAssetInputStatusRow(row))
    .filter((row): row is GpsIotAssetInputStatus => Boolean(row));
}

/** Match one asset row from the client-wide payload. */
export function findGpsIotAssetInputStatus(
  rows: GpsIotAssetInputStatus[],
  match: { assetId?: string; imei?: string; name?: string; registration?: string }
): GpsIotAssetInputStatus | null {
  const assetId = text(match.assetId).replace(/^gpsiot:/i, "").toLowerCase();
  const imei = text(match.imei).toLowerCase();
  const name = text(match.name).toLowerCase();
  const registration = text(match.registration).toLowerCase();
  return (
    rows.find((row) => assetId && text(row.assetId).toLowerCase() === assetId)
    || rows.find((row) => imei && text(row.imei).toLowerCase() === imei)
    || rows.find((row) => registration && text(row.registration).toLowerCase() === registration)
    || rows.find((row) => name && text(row.assetName).toLowerCase() === name)
    || null
  );
}

export async function fetchGpsIotClientAssetsInputStatus(
  secrets: GpsIotSecrets,
  accessToken: string,
  options: { clientId?: string } = {},
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotAssetInputStatus[]> {
  const clientId = text(options.clientId);
  const url = new URL(`${secrets.baseUrl}/api/InputStatus/GetClientAssetsStatus`);
  if (clientId) url.searchParams.set("clientId", clientId);
  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = text(asRecord(payload).message ?? asRecord(payload).Message)
      || `GPS IoT GetClientAssetsStatus failed (${response.status})`;
    throw new Error(message);
  }
  return parseGpsIotClientAssetsInputStatus(payload);
}
