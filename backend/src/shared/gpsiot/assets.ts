import { GpsIotClientError, gpsIotMessage } from "./clients.ts";
import { saveGpsIotDevice } from "./devices.ts";
import { saveGpsIotSimcard } from "./sims.ts";
import type { GpsIotSecrets } from "./secrets.ts";

/** AssetTypeId values from GPS IoT CreateAsset. */
export const GPSIOT_ASSET_TYPES = {
  driver: 1,
  general: 2,
  vehicle: 3,
  static: 4,
  evBattery: 6
} as const;

export type GpsIotAssetTypeId = (typeof GPSIOT_ASSET_TYPES)[keyof typeof GPSIOT_ASSET_TYPES];

export const GPSIOT_ASSET_TYPE_LABELS: Record<number, string> = {
  1: "Driver",
  2: "General asset",
  3: "Vehicle",
  4: "Static asset",
  6: "E.V. Battery"
};

export type GpsIotAsset = {
  assetId: string;
  name: string;
  colour: string;
  make: string;
  model: string;
  trackerType: string;
  status: boolean;
  customId: string;
};

export type GpsIotCreateAssetInput = {
  clientId: string;
  name: string;
  make?: string;
  color?: string;
  model?: string;
  assetTypeId: number;
  customId?: string;
};

/** Vivitel Assets page row shaped from GPS IoT asset + device + SIM + live. */
export type GpsIotMappedAsset = {
  id: string;
  assetId: number | string;
  assetDescription: string;
  /** Column "ISP Serial Number" / form "Fleet number" → Sim.SimSerial */
  fleetNumber: string;
  infoIssued: string;
  imei: string;
  site: string;
  model: string;
  lastPosition: string;
  lastTrip: string;
  registration: string;
  country: string;
  assetType: string;
  make: string;
  year: string;
  vin: string;
  mobileDevice: string;
  odometer: string;
  engineHours: string;
  status: "available" | "unavailable";
  lastLocation: string;
  configUploadDate: string;
  configGroup: string;
  /** No dedicated IMSI in GPS IoT SIM API — left empty unless SimDesc looks like an IMSI. */
  imsi: string;
  /** Column MSISDN → Sim.GsmNo (fallback Device.GsmNumber) */
  msisdn: string;
  faults: string;
  colour: string;
  customId: string;
  engineNumber: string;
  fuelType: string;
  fuelTankCapacity: string;
  targetFuel: string;
  serialNumber: string;
  netProvider: string;
  simDesc: string;
  deviceId: string;
  simCardId: string;
  gpsIotClientId: string;
  lat?: number;
  lng?: number;
  speed?: number;
  movement?: string;
  lastSeen?: string;
};

const asRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

const asText = (value: unknown) => String(value ?? "").trim();

const asBool = (value: unknown) => {
  if (typeof value === "boolean") return value;
  const text = asText(value).toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return Boolean(value);
};

const asNum = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const assetRows = (payload: unknown) => {
  const root = asRecord(payload);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(root.Asset)) return root.Asset;
  if (Array.isArray(root.asset)) return root.asset;
  if (Array.isArray(root.Data)) return root.Data;
  if (Array.isArray(root.data)) return root.data;
  return [];
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

async function gpsIotRequest(
  secrets: GpsIotSecrets,
  accessToken: string,
  path: string,
  method: string,
  body: Record<string, unknown> | null,
  fetchImpl: typeof fetch
) {
  const response = await fetchImpl(`${secrets.baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await readGpsIotBody(response);
  if (!response.ok) {
    throw new GpsIotClientError(gpsIotMessage(payload, `GPS IoT asset request failed (${response.status})`), response.status);
  }
  return payload;
}

async function gpsIotJson(
  secrets: GpsIotSecrets,
  accessToken: string,
  path: string,
  method: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch
) {
  return gpsIotRequest(secrets, accessToken, path, method, body, fetchImpl);
}

export function parseGpsIotAssets(payload: unknown): GpsIotAsset[] {
  const assets: GpsIotAsset[] = [];
  for (const row of assetRows(payload)) {
    const record = asRecord(row);
    const assetId = asText(record.AssetId ?? record.assetId);
    const name = asText(record.Name ?? record.VName ?? record.name);
    const customId = asText(record.CustomId ?? record.customId);
    if (!assetId && !name && !customId) continue;
    assets.push({
      assetId,
      name,
      colour: asText(record.Colour ?? record.Color ?? record.colour ?? record.color),
      make: asText(record.Make ?? record.make),
      model: asText(record.Model ?? record.model),
      trackerType: asText(record.TrackerType ?? record.trackerType),
      status: asBool(record.Status ?? record.status),
      customId
    });
  }
  return assets;
}

export function normalizeCreateAssetInput(body: Record<string, unknown>): GpsIotCreateAssetInput {
  const clientId = asText(body.clientId ?? body.ClientID ?? body.ClientId);
  const name = asText(body.name ?? body.VName ?? body.vName);
  const assetTypeRaw = body.assetTypeId ?? body.AssetTypeId;
  const assetTypeId = Number(assetTypeRaw);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!name) throw new GpsIotClientError("name is required", 400);
  if (!Number.isFinite(assetTypeId) || assetTypeId <= 0) {
    throw new GpsIotClientError("assetTypeId is required", 400);
  }
  return {
    clientId,
    name,
    make: asText(body.make ?? body.Make) || undefined,
    color: asText(body.color ?? body.Color ?? body.Colour) || undefined,
    model: asText(body.model ?? body.Model) || undefined,
    assetTypeId,
    customId: asText(body.customId ?? body.CustomId) || undefined
  };
}

export async function createGpsIotAsset(
  secrets: GpsIotSecrets,
  accessToken: string,
  input: GpsIotCreateAssetInput,
  fetchImpl: typeof fetch = fetch
) {
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/CreateAsset",
    "POST",
    {
      ClientID: input.clientId,
      VName: input.name,
      Make: input.make ?? "",
      Color: input.color ?? "",
      Model: input.model ?? "",
      AssetTypeId: input.assetTypeId,
      CustomId: input.customId ?? ""
    },
    fetchImpl
  );
  return { message: gpsIotMessage(payload, "Asset Created Successfully!") };
}

export async function getGpsIotAssetByCustomId(
  secrets: GpsIotSecrets,
  accessToken: string,
  customId: string,
  fetchImpl: typeof fetch = fetch
) {
  const id = asText(customId);
  if (!id) throw new GpsIotClientError("customId is required", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/GetAssetByCustomID",
    "POST",
    { CustomId: id },
    fetchImpl
  );
  return parseGpsIotAssets(payload);
}

export async function getGpsIotAssetByName(
  secrets: GpsIotSecrets,
  accessToken: string,
  name: string,
  fetchImpl: typeof fetch = fetch
) {
  const vName = asText(name);
  if (!vName) throw new GpsIotClientError("name is required", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/GetAssetByName",
    "POST",
    { VName: vName },
    fetchImpl
  );
  return parseGpsIotAssets(payload);
}

function firstGroupName(record: Record<string, unknown>) {
  const groups = Array.isArray(record.Groups) ? record.Groups : Array.isArray(record.groups) ? record.groups : [];
  for (const group of groups) {
    const name = asText(asRecord(group).Group ?? asRecord(group).group ?? asRecord(group).Name);
    if (name) return name;
  }
  return "";
}

function resolveAssetTypeLabel(record: Record<string, unknown>) {
  const labeled = asText(record.asset_type ?? record.AssetType ?? record.assetType);
  if (labeled) return labeled;
  const typeId = Number(record.assettypeid ?? record.AssetTypeId ?? record.assetTypeId);
  if (Number.isFinite(typeId) && GPSIOT_ASSET_TYPE_LABELS[typeId]) return GPSIOT_ASSET_TYPE_LABELS[typeId];
  return "";
}

function looksLikeImsi(value: string) {
  return /^\d{14,16}$/.test(value);
}

/**
 * Map GPS IoT asset + assigned device + SIM + live telemetry onto Assets page columns.
 *
 * Column → API field:
 * - Asset Description → Name / vname
 * - ISP Serial Number (fleetNumber) → Sim.SimSerial
 * - IMEI → Device.ImeiNumber / live.ImeiNumber
 * - Model → Model
 * - Last Position → live.GPSDateTime
 * - Last Trip → live.EventName (best available trip signal)
 * - Registration Number → registration_plate / asset_reg_number
 * - Asset ID → AssetId
 * - Asset Type → asset_type / AssetTypeId
 * - Make / Year / VIN → Make / year / vin
 * - Mobile Device → Device.Description / DeviceTypeId
 * - Odometer / Engine Hours → live.Odometer / live.WorkingHours
 * - Status → Asset.Status
 * - Last Location → live.Location
 * - Configuration Group → Groups[].Group
 * - IMSI → SimDesc only when it looks like an IMSI (API has no IMSI field)
 * - MSISDN → Sim.GsmNo || Device.GsmNumber
 * - Faults → live.EventName when not used as lastTrip duplicate context
 * - Colour → Colour
 * - Net provider (extra) → Sim.NetProvider
 */
export function mapGpsIotPartsToAsset(input: {
  asset: Record<string, unknown>;
  device?: Record<string, unknown> | null;
  sim?: Record<string, unknown> | null;
  live?: Record<string, unknown> | null;
  site?: string;
  clientId?: string;
}): GpsIotMappedAsset {
  const asset = input.asset;
  const device = input.device ?? {};
  const sim = input.sim ?? {};
  const live = input.live ?? {};

  const assetIdText = asText(asset.AssetId ?? asset.assetId);
  const name = asText(asset.Name ?? asset.VName ?? asset.vname ?? asset.name);
  const imei = asText(
    device.ImeiNumber ?? device.imeiNumber ?? live.ImeiNumber ?? live.imei ?? asset.Imei ?? asset.imei
  );
  const simSerial = asText(sim.SimSerial ?? sim.simSerial);
  const gsmNo = asText(sim.GsmNo ?? sim.gsmNo ?? device.GsmNumber ?? device.GsmNo ?? device.gsmNumber);
  const simDesc = asText(sim.SimDesc ?? sim.simDesc);
  const customId = asText(asset.CustomId ?? asset.customId);
  const numericAssetId = Number(assetIdText);
  const id = assetIdText || customId || imei || name || `gpsiot-${Math.random().toString(36).slice(2, 10)}`;
  const speed = asNum(live.VehicleSpeed ?? live.speed);
  const lat = asNum(live.Lat ?? live.lat);
  const lng = asNum(live.Lon ?? live.lon);
  const gpsTime = asText(live.GPSDateTime ?? live.gpsDateTime ?? device.LastGpsDateTime);
  const location = asText(live.Location ?? live.location);
  const eventName = asText(live.EventName ?? live.eventName);
  const active = asBool(asset.Status ?? asset.status);

  return {
    id: `gpsiot:${id}`,
    assetId: Number.isFinite(numericAssetId) && numericAssetId > 0 ? numericAssetId : assetIdText || customId,
    assetDescription: name,
    fleetNumber: simSerial,
    infoIssued: "",
    imei,
    site: asText(input.site),
    model: asText(asset.Model ?? asset.model),
    lastPosition: gpsTime,
    lastTrip: eventName,
    registration: asText(asset.registration_plate ?? asset.asset_reg_number ?? asset.RegistrationPlate),
    country: "",
    assetType: resolveAssetTypeLabel(asset),
    make: asText(asset.Make ?? asset.make),
    year: asText(asset.year ?? asset.Year),
    vin: asText(asset.vin ?? asset.VIN),
    mobileDevice: asText(device.Description ?? device.description ?? device.DeviceTypeId ?? device.deviceTypeId),
    odometer: asText(live.Odometer ?? live.odometer),
    engineHours: asText(live.WorkingHours ?? live.workingHours),
    status: active ? "available" : "unavailable",
    lastLocation: location,
    configUploadDate: "",
    configGroup: firstGroupName(asset),
    imsi: looksLikeImsi(simDesc) ? simDesc : "",
    msisdn: gsmNo,
    faults: eventName,
    colour: asText(asset.Colour ?? asset.Color ?? asset.colour),
    customId,
    engineNumber: asText(asset.engine_no ?? asset.engineNumber),
    fuelType: asText(asset.fuel_type ?? asset.asset_fuel_type ?? asset.fuelType),
    fuelTankCapacity: asText(asset.tank_capacity ?? asset.tankCapacity),
    targetFuel: asText(asset.fuel_consumption ?? asset.fuelConsumption),
    serialNumber: asText(device.SerialNumber ?? device.serialNumber),
    netProvider: asText(sim.NetProvider ?? sim.netProvider),
    simDesc,
    deviceId: asText(device.DeviceId ?? device.deviceId),
    simCardId: asText(sim.SimCardId ?? sim.simCardId ?? sim.Id ?? sim.id),
    gpsIotClientId: asText(input.clientId ?? asset.ClientId ?? asset.ClientID),
    lat: lat || undefined,
    lng: lng || undefined,
    speed: speed || undefined,
    movement: speed > 0 ? "moving" : gpsTime ? "stopped" : "",
    lastSeen: gpsTime
  };
}

export function mergeGpsIotFleetRows(input: {
  assets: Record<string, unknown>[];
  devices: Record<string, unknown>[];
  sims: Record<string, unknown>[];
  live: Record<string, unknown>[];
  site?: string;
  clientId?: string;
}): GpsIotMappedAsset[] {
  const devicesByAssetId = new Map<string, Record<string, unknown>>();
  const devicesByImei = new Map<string, Record<string, unknown>>();
  for (const device of input.devices) {
    const assigned = asText(device.AssignedAssetId ?? device.assignedAssetId);
    const imei = asText(device.ImeiNumber ?? device.imeiNumber);
    if (assigned) devicesByAssetId.set(assigned.toLowerCase(), device);
    if (imei) devicesByImei.set(imei, device);
  }

  const simsByGsm = new Map<string, Record<string, unknown>>();
  const simsBySerial = new Map<string, Record<string, unknown>>();
  const simsById = new Map<string, Record<string, unknown>>();
  for (const sim of input.sims) {
    const gsm = asText(sim.GsmNo ?? sim.gsmNo);
    const serial = asText(sim.SimSerial ?? sim.simSerial);
    const simId = asText(sim.SimCardId ?? sim.simCardId ?? sim.Id ?? sim.id);
    if (gsm) simsByGsm.set(gsm.toLowerCase(), sim);
    if (serial) simsBySerial.set(serial.toLowerCase(), sim);
    if (simId) simsById.set(simId.toLowerCase(), sim);
  }

  const liveByImei = new Map<string, Record<string, unknown>>();
  for (const row of input.live) {
    const imei = asText(row.ImeiNumber ?? row.imei);
    if (imei) liveByImei.set(imei, row);
  }

  const mapped: GpsIotMappedAsset[] = [];
  for (const asset of input.assets) {
    const assetId = asText(asset.AssetId ?? asset.assetId);
    const name = asText(asset.Name ?? asset.VName ?? asset.name);
    let device = (assetId && devicesByAssetId.get(assetId.toLowerCase())) || null;
    const assetImei = asText(asset.Imei ?? asset.imei);
    if (!device && assetImei) device = devicesByImei.get(assetImei) ?? null;
    const deviceImei = asText(device?.ImeiNumber ?? device?.imeiNumber ?? assetImei);
    const gsm = asText(device?.GsmNumber ?? device?.GsmNo ?? device?.gsmNumber);
    const deviceSimId = asText(device?.SimCardId ?? device?.simCardId);
    const sim =
      (deviceSimId && simsById.get(deviceSimId.toLowerCase()))
      || (gsm && simsByGsm.get(gsm.toLowerCase()))
      || null;
    const live = (deviceImei && liveByImei.get(deviceImei)) || null;
    if (!assetId && !name) continue;
    mapped.push(
      mapGpsIotPartsToAsset({
        asset,
        device,
        sim,
        live,
        site: input.site,
        clientId: input.clientId
      })
    );
  }
  return mapped;
}

export async function fetchGpsIotClientFleet(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  options: { site?: string } = {},
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotMappedAsset[]> {
  const id = asText(clientId);
  if (!id) throw new GpsIotClientError("clientId is required", 400);
  const body = { ClientID: id };

  const [basicPayload, extraPayload, devicePayload, simPayload, livePayload] = await Promise.all([
    gpsIotJson(secrets, accessToken, "/api/Asset/GetAllAssets", "POST", body, fetchImpl).catch(() => ({ Asset: [] })),
    gpsIotJson(secrets, accessToken, "/api/Asset/GetAllAssetsWithExtraDetails", "POST", body, fetchImpl).catch(() => ({ Asset: [] })),
    gpsIotJson(secrets, accessToken, "/api/Asset/GetAllDevice", "POST", body, fetchImpl).catch(() => ({ Asset: [] })),
    gpsIotJson(secrets, accessToken, "/api/Asset/GetAllSimcard", "POST", body, fetchImpl).catch(() => ({ Asset: [] })),
    gpsIotJson(secrets, accessToken, "/api/Asset/GetDevicesCurrentData", "POST", body, fetchImpl).catch(() => ({ Data: [] }))
  ]);

  const basicRows = assetRows(basicPayload).map((row) => asRecord(row));
  const extraRows = assetRows(extraPayload).map((row) => asRecord(row));
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of basicRows) {
    const key = asText(row.AssetId ?? row.assetId) || asText(row.Name ?? row.name).toLowerCase();
    if (key) byKey.set(key, { ...row });
  }
  for (const row of extraRows) {
    const key = asText(row.AssetId ?? row.assetId) || asText(row.Name ?? row.name).toLowerCase() || asText(row.CustomId);
    if (!key) continue;
    const prev = byKey.get(key) ?? byKey.get(asText(row.Name ?? row.name).toLowerCase());
    byKey.set(key, { ...(prev ?? {}), ...row });
  }

  return mergeGpsIotFleetRows({
    assets: [...byKey.values()],
    devices: assetRows(devicePayload).map((row) => asRecord(row)),
    sims: assetRows(simPayload).map((row) => asRecord(row)),
    live: assetRows(livePayload).map((row) => asRecord(row)),
    site: options.site,
    clientId: id
  });
}

/** Strip Vivitel `gpsiot:` prefix; never treat 0 / empty as an existing id. */
export function resolveGpsIotAssetId(body: Record<string, unknown>): string {
  const candidates = [
    body.assetId,
    body.AssetId,
    body.assetid,
    body.id
  ];
  for (const candidate of candidates) {
    let value = asText(candidate);
    if (!value || value === "0") continue;
    if (value.toLowerCase().startsWith("gpsiot:")) value = value.slice(7);
    if (value && value !== "0") return value;
  }
  return "";
}

export function resolveGpsIotAssetTypeId(body: Record<string, unknown>): number {
  const raw = body.assetTypeId ?? body.AssetTypeId ?? body.assettype ?? body.assetType ?? body.AssetType;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  const label = asText(raw).toLowerCase();
  if (label.includes("driver")) return 1;
  if (label.includes("general")) return 2;
  if (label.includes("static")) return 4;
  if (label.includes("battery") || label.includes("e.v") || label.includes("ev ")) return 6;
  if (label.includes("vehicle") || label) return 3;
  return 3;
}

function extraDetailsBody(clientId: string, assetId: string, body: Record<string, unknown>) {
  const typeId = resolveGpsIotAssetTypeId(body);
  const name = asText(body.name ?? body.VName ?? body.vname ?? body.assetDescription);
  return {
    ClientID: clientId,
    ...(assetId ? { assetid: assetId, AssetId: assetId } : {}),
    vname: name,
    VName: name,
    make: asText(body.make ?? body.Make),
    color: asText(body.color ?? body.Color ?? body.colour ?? body.Colour),
    model: asText(body.model ?? body.Model),
    assettype: typeId,
    AssetTypeId: typeId,
    customid: asText(body.customId ?? body.CustomId ?? body.customid),
    registration_plate: asText(body.registration ?? body.registration_plate),
    chasis_no: asText(body.chassis ?? body.chasis_no ?? body.vin),
    engine_no: asText(body.engineNumber ?? body.engine_no),
    engine_size: Number(body.engine_size ?? 0) || 0,
    vin: asText(body.vin),
    year: Number(body.year ?? 0) || 0,
    tank_capacity: Number(body.fuelTankCapacity ?? body.tank_capacity ?? 0) || 0,
    fuel_consumption: Number(body.targetFuel ?? body.fuel_consumption ?? 0) || 0,
    fuel_type: asText(body.fuelType ?? body.fuel_type),
    fuel_grade: asText(body.fuel_grade ?? body.fuelGrade),
    cargo_capacity: asText(body.cargo_capacity),
    co2_emmission: Number(body.co2_emmission ?? 0) || 0,
    co2_emmission_per_km: Number(body.co2_emmission_per_km ?? 0) || 0,
    no_of_pessengers: Number(body.no_of_pessengers ?? 0) || 0,
    no_of_tyres: Number(body.no_of_tyres ?? 0) || 0,
    tyre_size: asText(body.tyre_size),
    ownerid: asText(body.ownerid ?? body.ownerId),
    owner_name: asText(body.owner_name),
    owner_gender: asText(body.owner_gender),
    owner_national_id: asText(body.owner_national_id),
    owner_phone: asText(body.owner_phone),
    customurl1: asText(body.customurl1),
    customurl2: asText(body.customurl2),
    customurl3: asText(body.customurl3),
    customurl4: asText(body.customurl4),
    fitter_name: asText(body.fitter_name),
    fitter_national_id: asText(body.fitter_national_id),
    fitter_phone_no: asText(body.fitter_phone_no),
    fitting_certificate_no: asText(body.fitting_certificate_no),
    fitting_company_email: asText(body.fitting_company_email),
    fitting_company_name: asText(body.fitting_company_name),
    fitting_company_phone: asText(body.fitting_company_phone),
    fitting_company_reg_no: asText(body.fitting_company_reg_no),
    fitting_date: asText(body.fitting_date),
    fitting_location: asText(body.fitting_location),
    insurance_expiry_date: asText(body.insurance_expiry_date),
    insurance_expiry_date_two: asText(body.insurance_expiry_date_two),
    insurance_policy_no: asText(body.insurance_policy_no),
    insurance_policy_no_two: asText(body.insurance_policy_no_two),
    license_renewal_date: asText(body.license_renewal_date),
    purchase_date: asText(body.purchase_date),
    purchase_note: asText(body.purchase_note),
    selling_date: asText(body.selling_date),
    selling_note: body.selling_note ?? null
  };
}

/** PUT /api/Asset/UpdateAsset — requires AssetId; never creates. */
export async function updateGpsIotAsset(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID ?? body.ClientId);
  const assetId = resolveGpsIotAssetId(body);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!assetId) throw new GpsIotClientError("AssetId is required for update", 400);
  const typeId = resolveGpsIotAssetTypeId(body);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/UpdateAsset",
    "PUT",
    {
      ClientID: clientId,
      AssetId: assetId,
      VName: asText(body.name ?? body.VName ?? body.vname ?? body.assetDescription),
      Make: asText(body.make ?? body.Make),
      Color: asText(body.color ?? body.Color ?? body.colour ?? body.Colour),
      Model: asText(body.model ?? body.Model),
      AssetTypeId: typeId,
      CustomId: asText(body.customId ?? body.CustomId)
    },
    fetchImpl
  );
  return { assetId, message: gpsIotMessage(payload, "Asset Updated Successfully!") };
}

/** PUT /api/Asset/UpdateAssetWithExtraDetails — requires assetid; never creates. */
export async function updateGpsIotAssetWithExtraDetails(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID ?? body.ClientId);
  const assetId = resolveGpsIotAssetId(body);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!assetId) throw new GpsIotClientError("assetid is required for update", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/UpdateAssetWithExtraDetails",
    "PUT",
    extraDetailsBody(clientId, assetId, body),
    fetchImpl
  );
  return { assetId, message: gpsIotMessage(payload, "Asset Updated Successfully!") };
}

/**
 * Save asset details using the documented Create vs Update APIs.
 * When AssetId is present → UpdateAsset + UpdateAssetWithExtraDetails only (no Create).
 * When AssetId is absent → CreateAssetWithExtraDetails only.
 * Device and SIM follow Create-vs-Update rules, then AssignSimCard links SIM → device → asset.
 */
export async function saveGpsIotAssetDetails(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID ?? body.ClientId);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  const assetId = resolveGpsIotAssetId(body);
  const imei = asText(body.imei ?? body.ImeiNumber);
  const hasSimDetails = Boolean(
    asText(body.simCardId ?? body.SimCardId)
    || asText(body.fleetNumber ?? body.SimSerial ?? body.simSerial)
    || asText(body.msisdn ?? body.GsmNo)
  );

  let resolvedAssetId = assetId;
  let created = false;
  let message = "";

  if (resolvedAssetId) {
    const basic = await updateGpsIotAsset(secrets, accessToken, { ...body, clientId, assetId: resolvedAssetId }, fetchImpl);
    const extra = await updateGpsIotAssetWithExtraDetails(
      secrets,
      accessToken,
      { ...body, clientId, assetId: resolvedAssetId },
      fetchImpl
    );
    message = extra.message || basic.message;
  } else {
    const createdPayload = await gpsIotJson(
      secrets,
      accessToken,
      "/api/Asset/CreateAssetWithExtraDetails",
      "POST",
      extraDetailsBody(clientId, "", body),
      fetchImpl
    );
    created = true;
    resolvedAssetId = asText(asRecord(createdPayload).AssetId ?? asRecord(createdPayload).assetId);
    message = gpsIotMessage(createdPayload, "Asset Created Successfully!");
  }

  // SIM before device when possible so CreateDevice/UpdateDevice can carry SimCardId.
  let sim = hasSimDetails
    ? await saveGpsIotSimcard(secrets, accessToken, { ...body, clientId }, fetchImpl)
    : null;

  const device = imei || asText(body.deviceId ?? body.DeviceId)
    ? await saveGpsIotDevice(
      secrets,
      accessToken,
      {
        ...body,
        clientId,
        ...(resolvedAssetId ? { assetId: resolvedAssetId } : {}),
        ...(sim?.simCardId ? { simCardId: sim.simCardId } : {})
      },
      fetchImpl
    )
    : null;

  // Ensure SIM is assigned to the device (and therefore the asset) after both ids exist.
  if (hasSimDetails && device?.deviceId) {
    sim = await saveGpsIotSimcard(
      secrets,
      accessToken,
      {
        ...body,
        clientId,
        deviceId: device.deviceId,
        ...(sim?.simCardId ? { simCardId: sim.simCardId } : {})
      },
      fetchImpl
    );
  }

  return {
    created,
    updated: !created,
    assetId: resolvedAssetId,
    message,
    device,
    sim
  };
}
