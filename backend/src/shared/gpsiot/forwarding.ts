import { GpsIotClientError, gpsIotMessage } from "./clients.ts";
import {
  parseGpsIotLiveDevices,
  type GpsIotLiveDevice
} from "./fleet.ts";
import type { GpsIotSecrets } from "./secrets.ts";

/**
 * GPS IoT Data Forwarding ↔ Live Tracking hybrid.
 *
 * Live Tracking consumes pushed Common JSON (Format=5) over HTTP (Protocol=4/5)
 * into Vivitel `/ingest/gpsiot`. Reports and other pages keep using REST `/gpsiot/*`.
 *
 * Upstream (Documentation V3.0):
 * - GET  api/DataForwarding/GetDataFwdProviders
 * - POST api/DataForwarding/SaveDataFwdProvider
 * - POST api/DataForwarding/UpdateProvider
 * - DELETE api/DataForwarding/UpdateProvider  { ProviderID }
 * - POST api/DataForwarding/SaveDataFwdDevice  assign ClientID / assets
 */

export const GPS_IOT_FORWARD_PROTOCOL_HTTP = 4;
export const GPS_IOT_FORWARD_PROTOCOL_HTTP_CUSTOM = 5;
export const GPS_IOT_FORWARD_FORMAT_COMMON_JSON = 5;

export type GpsIotForwardProvider = {
  providerId: number;
  name: string;
  url: string;
  expiry: string;
  formatName: string;
  protocolName: string;
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
  body: Record<string, unknown> | undefined,
  fetchImpl: typeof fetch
) {
  const response = await fetchImpl(`${secrets.baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const payload = await readGpsIotBody(response);
  if (!response.ok) {
    throw new GpsIotClientError(
      gpsIotMessage(payload, `GPS IoT forwarding request failed (${response.status})`),
      response.status
    );
  }
  return payload;
}

export function parseGpsIotForwardProviders(payload: unknown): GpsIotForwardProvider[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root.Providers)
    ? root.Providers
    : Array.isArray(root.providers)
      ? root.providers
      : Array.isArray(payload)
        ? payload
        : [];
  return rows.flatMap((row) => {
    const record = asRecord(row);
    const providerId = Math.trunc(asNum(record.provider_id ?? record.ProviderID ?? record.providerId));
    const name = asText(record.forwarding_name ?? record.ProviderName ?? record.name);
    const url = asText(record.forwarding_endpoint ?? record.URL ?? record.url);
    if (!providerId && !name && !url) return [];
    return [{
      providerId,
      name: name || `Provider ${providerId}`,
      url,
      expiry: asText(record.forwarding_expiry_time ?? record.ExpiryDate ?? record.expiry),
      formatName: asText(record.format_name ?? record.Format ?? record.format),
      protocolName: asText(record.protocol_name ?? record.Protocol ?? record.protocol)
    }];
  });
}

export async function listGpsIotForwardProviders(
  secrets: GpsIotSecrets,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotForwardProvider[]> {
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/DataForwarding/GetDataFwdProviders",
    "GET",
    undefined,
    fetchImpl
  );
  return parseGpsIotForwardProviders(payload);
}

export async function saveGpsIotForwardProvider(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<{ message: string }> {
  const name = asText(body.ProviderName ?? body.providerName ?? body.name);
  const url = asText(body.URL ?? body.url);
  if (!name) throw new GpsIotClientError("ProviderName is required", 400);
  if (!url) throw new GpsIotClientError("URL is required", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/DataForwarding/SaveDataFwdProvider",
    "POST",
    {
      ProviderName: name,
      URL: url,
      ExpiryDate: asText(body.ExpiryDate ?? body.expiryDate) || "2030-12-31 23:59:59",
      Status: body.Status !== false && body.status !== false,
      Format: Math.trunc(asNum(body.Format ?? body.format) || GPS_IOT_FORWARD_FORMAT_COMMON_JSON),
      Protocol: Math.trunc(
        asNum(body.Protocol ?? body.protocol) || GPS_IOT_FORWARD_PROTOCOL_HTTP
      ),
      Token: asText(body.Token ?? body.token),
      token_key: asText(body.token_key ?? body.tokenKey) || "Authorization"
    },
    fetchImpl
  );
  return { message: gpsIotMessage(payload, "Provider Created Successfully!") };
}

export async function updateGpsIotForwardProvider(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<{ message: string }> {
  const providerId = Math.trunc(asNum(body.ProviderID ?? body.providerId ?? body.id));
  if (!providerId) throw new GpsIotClientError("ProviderID is required", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/DataForwarding/UpdateProvider",
    "POST",
    {
      ProviderID: providerId,
      ProviderName: asText(body.ProviderName ?? body.providerName ?? body.name),
      URL: asText(body.URL ?? body.url),
      ExpiryDate: asText(body.ExpiryDate ?? body.expiryDate) || "2030-12-31 23:59:59",
      Status: body.Status !== false && body.status !== false,
      Format: Math.trunc(asNum(body.Format ?? body.format) || GPS_IOT_FORWARD_FORMAT_COMMON_JSON),
      Protocol: Math.trunc(
        asNum(body.Protocol ?? body.protocol) || GPS_IOT_FORWARD_PROTOCOL_HTTP
      ),
      Token: asText(body.Token ?? body.token),
      token_key: asText(body.token_key ?? body.tokenKey) || "Authorization"
    },
    fetchImpl
  );
  return { message: gpsIotMessage(payload, "Provider updated successfully.") };
}

export async function deleteGpsIotForwardProvider(
  secrets: GpsIotSecrets,
  accessToken: string,
  providerId: number | string,
  fetchImpl: typeof fetch = fetch
): Promise<{ message: string }> {
  const id = Math.trunc(asNum(providerId));
  if (!id) throw new GpsIotClientError("ProviderID is required", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/DataForwarding/UpdateProvider",
    "DELETE",
    { ProviderID: id },
    fetchImpl
  );
  return { message: gpsIotMessage(payload, "Data forwarding Provider deleted successfully..") };
}

export async function assignGpsIotForwardDevices(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<{ message: string }> {
  const providerId = Math.trunc(asNum(body.ProviderID ?? body.providerId));
  const clientId = asText(body.ClientID ?? body.clientId);
  if (!providerId) throw new GpsIotClientError("ProviderID is required", 400);
  if (!clientId) throw new GpsIotClientError("ClientID is required", 400);
  const forwardAll = body.ForwardAll === true || body.forwardAll === true;
  const rawAssetIds = body.AssetIds ?? body.assetIds;
  const assetIds = Array.isArray(rawAssetIds)
    ? rawAssetIds.map((id: unknown) => asText(id)).filter(Boolean)
    : [];
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/DataForwarding/SaveDataFwdDevice",
    "POST",
    {
      ProviderID: providerId,
      ClientID: clientId,
      AssetIds: forwardAll ? [] : assetIds,
      ForwardAll: forwardAll
    },
    fetchImpl
  );
  return { message: gpsIotMessage(payload, "Data forwarding to asset saved successfully.") };
}

/**
 * Ensure a Vivitel Live Tracking HTTP provider exists for this ingest URL,
 * then assign the site ClientID (ForwardAll) so pushes reach Live Tracking only.
 */
export async function ensureGpsIotLiveForwarding(
  secrets: GpsIotSecrets,
  accessToken: string,
  options: {
    clientId: string;
    site?: string;
    ingestUrl: string;
    token: string;
    providerName?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<{
  providerId: number;
  created: boolean;
  assigned: boolean;
  url: string;
  message: string;
}> {
  const clientId = asText(options.clientId);
  const ingestUrl = asText(options.ingestUrl);
  const token = asText(options.token);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!ingestUrl) throw new GpsIotClientError("ingestUrl is required", 400);
  if (!token) throw new GpsIotClientError("forwarding token is required", 400);

  const siteLabel = asText(options.site) || clientId;
  const providerName = asText(options.providerName) || `Vivitel Live ${siteLabel}`.slice(0, 80);
  const providers = await listGpsIotForwardProviders(secrets, accessToken, fetchImpl);
  const existing = providers.find((row) =>
    row.url.replace(/\/+$/, "").toLowerCase() === ingestUrl.replace(/\/+$/, "").toLowerCase()
    || row.name.toLowerCase() === providerName.toLowerCase()
  );

  let providerId = existing?.providerId ?? 0;
  let created = false;
  if (providerId > 0) {
    await updateGpsIotForwardProvider(
      secrets,
      accessToken,
      {
        ProviderID: providerId,
        ProviderName: providerName,
        URL: ingestUrl,
        Status: true,
        Format: GPS_IOT_FORWARD_FORMAT_COMMON_JSON,
        Protocol: GPS_IOT_FORWARD_PROTOCOL_HTTP,
        Token: token,
        token_key: "Authorization"
      },
      fetchImpl
    );
  } else {
    await saveGpsIotForwardProvider(
      secrets,
      accessToken,
      {
        ProviderName: providerName,
        URL: ingestUrl,
        Status: true,
        Format: GPS_IOT_FORWARD_FORMAT_COMMON_JSON,
        Protocol: GPS_IOT_FORWARD_PROTOCOL_HTTP,
        Token: token,
        token_key: "Authorization"
      },
      fetchImpl
    );
    created = true;
    const refreshed = await listGpsIotForwardProviders(secrets, accessToken, fetchImpl);
    const hit = refreshed.find((row) =>
      row.url.replace(/\/+$/, "").toLowerCase() === ingestUrl.replace(/\/+$/, "").toLowerCase()
      || row.name.toLowerCase() === providerName.toLowerCase()
    );
    providerId = hit?.providerId ?? 0;
  }

  if (!providerId) {
    throw new GpsIotClientError("Provider was saved but ProviderID could not be resolved", 502);
  }

  await assignGpsIotForwardDevices(
    secrets,
    accessToken,
    { ProviderID: providerId, ClientID: clientId, ForwardAll: true },
    fetchImpl
  );

  return {
    providerId,
    created,
    assigned: true,
    url: ingestUrl,
    message: created ? "Live forwarding provider created and assigned." : "Live forwarding provider updated and assigned."
  };
}

/** Normalize a Common JSON push (single row, array, or { Data: [] }) into live devices. */
export function parseGpsIotForwardedLivePayload(payload: unknown): GpsIotLiveDevice[] {
  return parseGpsIotLiveDevices(payload);
}

export function gpsIotLiveCacheKey(tenantId: string) {
  return `vivi:gpsiot:live:${String(tenantId ?? "").trim()}`;
}

export function mergeGpsIotLiveDevices(
  base: GpsIotLiveDevice[],
  overlay: GpsIotLiveDevice[]
): GpsIotLiveDevice[] {
  const byImei = new Map<string, GpsIotLiveDevice>();
  for (const row of base) {
    if (row.imei) byImei.set(row.imei, row);
  }
  for (const row of overlay) {
    if (row.imei) byImei.set(row.imei, row);
  }
  return Array.from(byImei.values());
}
