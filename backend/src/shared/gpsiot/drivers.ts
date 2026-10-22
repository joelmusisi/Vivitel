import { GpsIotClientError, gpsIotMessage } from "./clients.ts";
import type { GpsIotSecrets } from "./secrets.ts";

/**
 * Drivers page ↔ GPS IoT AttachedAsset driver fields.
 *
 * | Drivers column           | Vivitel field      | GPS IoT field                                      |
 * |--------------------------|--------------------|----------------------------------------------------|
 * | Driver name              | name               | VName                                              |
 * | Driver ID                | driverId           | DriverID (update identity) / attachedAssetId       |
 * | Extended driver ID       | extendedDriverId   | DriverIDNo (tag/custom) / TagNo on create          |
 * | Employee number          | employeeNumber     | DriverPersonalID                                   |
 * | Mobile number            | mobileNumber       | DriverContactNo                                    |
 * | Driver type              | driverType         | DriverType (ibutton|RFID|NONE|Beacon)              |
 * | Date of birth            | driverDob          | DriverDOB                                          |
 * | Licence number           | licenceNo          | LicenceNo                                          |
 * | Licence expiry           | licenseExpiryDate  | license_expiry_date                                |
 * | Time zone                | timeZone           | TimeZone                                           |
 * | Country                  | country            | (Vivitel only — not in GPS IoT driver API)         |
 * | Email                    | email              | (Vivitel only — not in GPS IoT driver API)         |
 * | Site                     | site               | ClientID mapping (Vivitel site ↔ GPS IoT client)   |
 * | Last trip                | lastTrip           | (not in driver API)                                |
 * | Time since last trip     | timeSinceLastTrip  | (not in driver API)                                |
 */

export type GpsIotMappedDriver = {
  id: string;
  name: string;
  driverId: string;
  extendedDriverId: string;
  employeeNumber: string;
  mobileNumber: string;
  country: string;
  email: string;
  site: string;
  lastTrip: string;
  timeSinceLastTrip: string;
  driverType: string;
  licenceNo: string;
  licenseExpiryDate: string;
  driverDob: string;
  timeZone: string;
  gpsIotClientId: string;
};

const asRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
const asText = (value: unknown) => String(value ?? "").trim();

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
    throw new GpsIotClientError(gpsIotMessage(payload, `GPS IoT driver request failed (${response.status})`), response.status);
  }
  return payload;
}

/** DriverID / attachedAssetId — present means update, never create. */
export function resolveGpsIotDriverId(body: Record<string, unknown>): string {
  const candidates = [body.driverId, body.DriverID, body.DriverId, body.attachedAssetId, body.id];
  for (const candidate of candidates) {
    let value = asText(candidate);
    if (!value || value === "0") continue;
    if (value.toLowerCase().startsWith("gpsiot-driver:")) value = value.slice("gpsiot-driver:".length);
    if (value.toLowerCase().startsWith("gpsiot:")) value = value.slice(7);
    if (value) return value;
  }
  return "";
}

export function mapGpsIotDriverToRow(
  body: Record<string, unknown>,
  options: { site?: string; clientId?: string; driverId?: string } = {}
): GpsIotMappedDriver {
  const driverId = asText(options.driverId ?? resolveGpsIotDriverId(body));
  const name = asText(body.name ?? body.VName ?? body.vName);
  return {
    id: driverId ? `gpsiot-driver:${driverId}` : `gpsiot-driver:${name || "new"}`,
    name,
    driverId,
    extendedDriverId: asText(body.extendedDriverId ?? body.DriverIDNo ?? body.TagNo ?? body.tagNo),
    employeeNumber: asText(body.employeeNumber ?? body.DriverPersonalID),
    mobileNumber: asText(body.mobileNumber ?? body.DriverContactNo),
    country: asText(body.country),
    email: asText(body.email),
    site: asText(options.site ?? body.site),
    lastTrip: asText(body.lastTrip),
    timeSinceLastTrip: asText(body.timeSinceLastTrip),
    driverType: asText(body.driverType ?? body.DriverType) || "NONE",
    licenceNo: asText(body.licenceNo ?? body.LicenceNo),
    licenseExpiryDate: asText(body.licenseExpiryDate ?? body.license_expiry_date),
    driverDob: asText(body.driverDob ?? body.DriverDOB),
    timeZone: asText(body.timeZone ?? body.TimeZone) || "UTC",
    gpsIotClientId: asText(options.clientId ?? body.clientId ?? body.ClientID)
  };
}

function driverWriteBody(body: Record<string, unknown>, clientId: string, forUpdate: boolean) {
  const driverId = resolveGpsIotDriverId(body);
  const tag = asText(body.extendedDriverId ?? body.DriverIDNo ?? body.TagNo ?? body.tagNo);
  const payload: Record<string, unknown> = {
    ClientID: clientId,
    VName: asText(body.name ?? body.VName),
    DriverDOB: asText(body.driverDob ?? body.DriverDOB),
    DriverIDNo: tag,
    DriverType: asText(body.driverType ?? body.DriverType) || "NONE",
    DriverContactNo: asText(body.mobileNumber ?? body.DriverContactNo),
    DriverPersonalID: asText(body.employeeNumber ?? body.DriverPersonalID),
    LicenceNo: asText(body.licenceNo ?? body.LicenceNo),
    license_expiry_date: asText(body.licenseExpiryDate ?? body.license_expiry_date),
    TimeZone: asText(body.timeZone ?? body.TimeZone) || "UTC"
  };
  if (forUpdate) {
    payload.DriverID = driverId;
  } else {
    payload.TagNo = tag;
  }
  return payload;
}

/** POST /api/AttachedAsset/CreateDriver — only when no DriverID. */
export async function createGpsIotDriver(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!asText(body.name ?? body.VName)) throw new GpsIotClientError("name is required", 400);
  if (resolveGpsIotDriverId(body)) {
    throw new GpsIotClientError("DriverID is present — use UpdateDriver, not CreateDriver", 400);
  }
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/AttachedAsset/CreateDriver",
    "POST",
    driverWriteBody(body, clientId, false),
    fetchImpl
  );
  const record = asRecord(payload);
  const driverId = asText(record.attachedAssetId ?? record.AttachedAssetId ?? record.DriverID);
  return {
    driverId,
    message: gpsIotMessage(payload, asText(record.status) || "Driver Saved Successfully!"),
    driver: mapGpsIotDriverToRow(body, {
      clientId,
      driverId,
      site: asText(body.site)
    })
  };
}

/** POST /api/AttachedAsset/UpdateDriver — requires DriverID; never creates. */
export async function updateGpsIotDriver(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID);
  const driverId = resolveGpsIotDriverId(body);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!driverId) throw new GpsIotClientError("DriverID is required for update", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/AttachedAsset/UpdateDriver",
    "POST",
    driverWriteBody({ ...body, driverId }, clientId, true),
    fetchImpl
  );
  const record = asRecord(payload);
  return {
    driverId: asText(record.attachedAssetId ?? record.DriverID) || driverId,
    message: gpsIotMessage(payload, asText(record.status) || "Driver Updated Successfully!"),
    driver: mapGpsIotDriverToRow(body, {
      clientId,
      driverId,
      site: asText(body.site)
    })
  };
}

/** DELETE /api/AttachedAsset/DeleteDriver */
export async function deleteGpsIotDriver(
  secrets: GpsIotSecrets,
  accessToken: string,
  driverIdRaw: string,
  fetchImpl: typeof fetch = fetch
) {
  const driverId = resolveGpsIotDriverId({ driverId: driverIdRaw });
  if (!driverId) throw new GpsIotClientError("DriverId is required", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/AttachedAsset/DeleteDriver",
    "DELETE",
    { DriverId: driverId },
    fetchImpl
  );
  return { message: gpsIotMessage(payload, "Driver deleted successfully!") };
}

/**
 * Create vs Update per API docs:
 * - DriverID present → UpdateDriver only
 * - DriverID absent → CreateDriver only
 */
export async function saveGpsIotDriver(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const driverId = resolveGpsIotDriverId(body);
  if (driverId) {
    const updated = await updateGpsIotDriver(secrets, accessToken, body, fetchImpl);
    return { created: false, updated: true, ...updated };
  }
  const created = await createGpsIotDriver(secrets, accessToken, body, fetchImpl);
  return { created: true, updated: false, ...created };
}
