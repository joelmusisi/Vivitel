import { GpsIotClientError, gpsIotMessage } from "./clients.ts";
import type { GpsIotSecrets } from "./secrets.ts";

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
    throw new GpsIotClientError(gpsIotMessage(payload, `GPS IoT device request failed (${response.status})`), response.status);
  }
  return payload;
}

export type GpsIotDeviceRef = {
  deviceId: string;
  imei: string;
  assignedAssetId: string;
  deviceTypeId: string;
  clientId: string;
};

export function resolveGpsIotDeviceId(body: Record<string, unknown>): string {
  const candidates = [body.deviceId, body.DeviceId, body.DeviceID];
  for (const candidate of candidates) {
    const value = asText(candidate);
    if (value && value !== "0") return value;
  }
  return "";
}

export function parseGpsIotDevices(payload: unknown): GpsIotDeviceRef[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root.Asset) ? root.Asset : Array.isArray(root.asset) ? root.asset : Array.isArray(payload) ? payload : [];
  const devices: GpsIotDeviceRef[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    const deviceId = asText(record.DeviceId ?? record.deviceId);
    const imei = asText(record.ImeiNumber ?? record.imeiNumber ?? record.imei);
    if (!deviceId && !imei) continue;
    devices.push({
      deviceId,
      imei,
      assignedAssetId: asText(record.AssignedAssetId ?? record.assignedAssetId),
      deviceTypeId: asText(record.DeviceTypeId ?? record.deviceTypeId ?? record.DeviceType),
      clientId: asText(record.client_id ?? record.ClientID ?? record.ClientId)
    });
  }
  return devices;
}

/** PUT /api/Asset/GetDeviceByIMEI */
export async function getGpsIotDeviceByImei(
  secrets: GpsIotSecrets,
  accessToken: string,
  imei: string,
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotDeviceRef | null> {
  const needle = asText(imei);
  if (!needle) return null;
  try {
    const payload = await gpsIotJson(
      secrets,
      accessToken,
      "/api/Asset/GetDeviceByIMEI",
      "PUT",
      { ImeiNumber: Number(needle) || needle },
      fetchImpl
    );
    return parseGpsIotDevices(payload)[0] ?? null;
  } catch (error) {
    if (error instanceof GpsIotClientError && (error.status === 404 || error.status === 409)) return null;
    throw error;
  }
}

function deviceWriteBody(clientId: string, body: Record<string, unknown>, deviceId = "") {
  const imei = asText(body.imei ?? body.ImeiNumber);
  const payload: Record<string, unknown> = {
    ClientID: clientId,
    Description: asText(body.mobileDevice ?? body.Description ?? body.device),
    SerialNumber: asText(body.serialNumber ?? body.SerialNumber),
    DeviceType: asText(body.deviceType ?? body.DeviceType),
    AssetId: asText(body.assetId ?? body.AssetId),
    SimCardId: asText(body.simCardId ?? body.SimCardId)
  };
  if (imei) payload.ImeiNumber = Number(imei) || imei;
  if (deviceId) payload.DeviceId = deviceId;
  return payload;
}

/** PUT /api/Asset/UpdateDevice — requires DeviceId; never creates. */
export async function updateGpsIotDevice(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID);
  const deviceId = resolveGpsIotDeviceId(body);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!deviceId) throw new GpsIotClientError("DeviceId is required for device update", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/UpdateDevice",
    "PUT",
    deviceWriteBody(clientId, body, deviceId),
    fetchImpl
  );
  return { deviceId, created: false, updated: true, message: gpsIotMessage(payload, "Device Updated Successfully!") };
}

/** POST /api/Asset/CreateDevice — only when DeviceId is absent and IMEI is unused. */
export async function createGpsIotDevice(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID);
  const imei = asText(body.imei ?? body.ImeiNumber);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!imei && !asText(body.TagNo)) throw new GpsIotClientError("imei is required", 400);
  if (resolveGpsIotDeviceId(body)) {
    throw new GpsIotClientError("DeviceId is present — use UpdateDevice, not CreateDevice", 400);
  }
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/CreateDevice",
    "POST",
    deviceWriteBody(clientId, body),
    fetchImpl
  );
  // Create response is often message-only; resolve DeviceId via IMEI lookup.
  const created = imei ? await getGpsIotDeviceByImei(secrets, accessToken, imei, fetchImpl) : null;
  return {
    deviceId: created?.deviceId ?? "",
    created: true,
    updated: false,
    message: gpsIotMessage(payload, "Device Created Successfully!")
  };
}

export async function assignGpsIotAsset(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  deviceId: string,
  assetId: string,
  fetchImpl: typeof fetch = fetch
) {
  if (!clientId || !deviceId || !assetId) return null;
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/AssignAsset",
    "POST",
    { ClientID: clientId, DeviceId: deviceId, AssetId: assetId },
    fetchImpl
  );
  return { message: gpsIotMessage(payload, "Asset Assigned Successfully") };
}

export async function unassignGpsIotAsset(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  deviceId: string,
  fetchImpl: typeof fetch = fetch
) {
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/UnAssignAsset",
    "POST",
    { ClientID: clientId, DeviceId: deviceId },
    fetchImpl
  );
  return { message: gpsIotMessage(payload, "Asset UnAssigned Successfully") };
}

export async function unassignGpsIotSimcard(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  deviceId: string,
  fetchImpl: typeof fetch = fetch
) {
  try {
    const payload = await gpsIotJson(
      secrets,
      accessToken,
      "/api/Asset/UnAssignSimcard",
      "POST",
      { ClientID: clientId, DeviceId: deviceId },
      fetchImpl
    );
    return { message: gpsIotMessage(payload, "Simcard UnAssigned Successfully") };
  } catch (error) {
    // Device may have no SIM — ignore so decommission can continue.
    if (error instanceof GpsIotClientError) return { message: error.message, skipped: true };
    throw error;
  }
}

/** DELETE /api/Asset/DeleteDevice — clears device track so IMEI can be reused. */
export async function deleteGpsIotDevice(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  deviceId: string,
  options: { deleteAllShares?: boolean } = {},
  fetchImpl: typeof fetch = fetch
) {
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/DeleteDevice",
    "DELETE",
    {
      ClientID: clientId,
      DeviceId: deviceId,
      deleteAllShares: options.deleteAllShares !== false
    },
    fetchImpl
  );
  return { message: gpsIotMessage(payload, "Device Deleted Successfully!") };
}

/**
 * Create vs Update for devices (no duplicates):
 * 1. DeviceId present → UpdateDevice only
 * 2. Else lookup GetDeviceByIMEI → if found, UpdateDevice only
 * 3. Else CreateDevice, then AssignAsset when AssetId is present
 */
export async function saveGpsIotDevice(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID);
  const imei = asText(body.imei ?? body.ImeiNumber);
  const assetId = asText(body.assetId ?? body.AssetId);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!imei && !resolveGpsIotDeviceId(body)) {
    return { deviceId: "", created: false, updated: false, message: "No device IMEI supplied", skipped: true };
  }

  let deviceId = resolveGpsIotDeviceId(body);
  if (!deviceId && imei) {
    const existing = await getGpsIotDeviceByImei(secrets, accessToken, imei, fetchImpl);
    if (existing?.deviceId) deviceId = existing.deviceId;
  }

  if (deviceId) {
    const updated = await updateGpsIotDevice(
      secrets,
      accessToken,
      { ...body, clientId, deviceId, ...(assetId ? { assetId } : {}) },
      fetchImpl
    );
    if (assetId) {
      try {
        await assignGpsIotAsset(secrets, accessToken, clientId, deviceId, assetId, fetchImpl);
      } catch {
        // Already assigned to this asset is fine.
      }
    }
    return updated;
  }

  const created = await createGpsIotDevice(secrets, accessToken, { ...body, clientId }, fetchImpl);
  if (created.deviceId && assetId) {
    await assignGpsIotAsset(secrets, accessToken, clientId, created.deviceId, assetId, fetchImpl);
  }
  return created;
}

/**
 * Decommission clears the device track for reuse:
 * UnAssignSimcard → UnAssignAsset → DeleteDevice(deleteAllShares=true).
 * IMEI can then be CreateDevice'd on another asset/client.
 */
export async function decommissionGpsIotDevice(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID);
  const imei = asText(body.imei ?? body.ImeiNumber);
  let deviceId = resolveGpsIotDeviceId(body);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!deviceId && imei) {
    const existing = await getGpsIotDeviceByImei(secrets, accessToken, imei, fetchImpl);
    deviceId = existing?.deviceId ?? "";
  }
  if (!deviceId) throw new GpsIotClientError("DeviceId or IMEI is required to decommission", 400);

  const sim = await unassignGpsIotSimcard(secrets, accessToken, clientId, deviceId, fetchImpl);
  const unassigned = await unassignGpsIotAsset(secrets, accessToken, clientId, deviceId, fetchImpl);
  const deleted = await deleteGpsIotDevice(secrets, accessToken, clientId, deviceId, { deleteAllShares: true }, fetchImpl);

  // Confirm IMEI is gone so reuse will not hit "Imei Number Exists!".
  const stillThere = imei ? await getGpsIotDeviceByImei(secrets, accessToken, imei, fetchImpl) : null;
  if (stillThere?.deviceId) {
    throw new GpsIotClientError("Device delete did not clear IMEI from GPS IoT", 502);
  }

  const assetId = asText(body.assetId ?? body.AssetId);
  return {
    decommissioned: true,
    deviceId,
    imei,
    sim,
    unassigned,
    deleted,
    asset: {
      id: asText(body.id) || (assetId ? `gpsiot:${assetId}` : ""),
      assetId,
      imei: "",
      deviceId: "",
      device: "",
      mobileDevice: "",
      serialNumber: "",
      fleetNumber: "",
      msisdn: "",
      imsi: "",
      status: "unavailable",
      assetStatus: "Decommissioned"
    }
  };
}
