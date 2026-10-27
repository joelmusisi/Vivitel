import {
  companyKey,
  createGpsIotClient,
  emptyGpsIotClientProfile,
  fetchGpsIotClient,
  fetchGpsIotClients,
  GpsIotClientError,
  updateGpsIotClient,
  deleteGpsIotClient
} from "./clients.ts";
import type { GpsIotSecrets } from "./secrets.ts";
import { getGpsIotAccessToken } from "./token.ts";

export type GpsIotSiteLink = {
  name: string;
  gpsIotClientId?: string;
};

export type GpsIotSiteClientResult = {
  clientId?: string;
  created: boolean;
  attached: boolean;
  error?: string;
  status?: number;
};

const CLIENT_EXISTS = "Client exists. Please choose another name!";

export async function ensureSiteGpsIotClient(
  secrets: GpsIotSecrets,
  site: GpsIotSiteLink,
  takenClientIds: Set<string>,
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotSiteClientResult> {
  const existing = String(site.gpsIotClientId ?? "").trim();
  if (existing) return { clientId: existing, created: false, attached: false };
  const name = String(site.name ?? "").trim();
  if (!name) return { created: false, attached: false, error: "Site name is required", status: 400 };

  const token = await getGpsIotAccessToken(secrets, fetchImpl);
  try {
    const created = await createGpsIotClient(secrets, token, emptyGpsIotClientProfile(name), fetchImpl);
    if (takenClientIds.has(created.clientId)) {
      return { created: false, attached: false, error: CLIENT_EXISTS, status: 409 };
    }
    site.gpsIotClientId = created.clientId;
    return { clientId: created.clientId, created: true, attached: false };
  } catch (error) {
    if (!(error instanceof GpsIotClientError) || error.status !== 409) {
      const message = error instanceof Error ? error.message : "GPS IoT client create failed";
      const status = error instanceof GpsIotClientError ? error.status : 502;
      return { created: false, attached: false, error: message, status };
    }
    const clients = await fetchGpsIotClients(secrets, token, fetchImpl);
    const hits = clients.filter((client) => client.clientId && companyKey(client.vCompanyName) === companyKey(name));
    const client = hits.length === 1 ? hits[0] : undefined;
    if (!client || takenClientIds.has(client.clientId)) {
      return { created: false, attached: false, error: error.message || CLIENT_EXISTS, status: 409 };
    }
    site.gpsIotClientId = client.clientId;
    return { clientId: client.clientId, created: false, attached: true };
  }
}

export async function renameSiteGpsIotClient(
  secrets: GpsIotSecrets,
  site: GpsIotSiteLink,
  nextName: string,
  takenClientIds: Set<string>,
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotSiteClientResult> {
  const name = String(nextName ?? "").trim();
  if (!name) return { created: false, attached: false, error: "Site name is required", status: 400 };
  const clientId = String(site.gpsIotClientId ?? "").trim();
  if (!clientId) {
    const draft: GpsIotSiteLink = { name, gpsIotClientId: "" };
    const ensured = await ensureSiteGpsIotClient(secrets, draft, takenClientIds, fetchImpl);
    if (ensured.clientId) site.gpsIotClientId = ensured.clientId;
    return ensured;
  }

  const token = await getGpsIotAccessToken(secrets, fetchImpl);
  try {
    const current = await fetchGpsIotClient(secrets, token, clientId, fetchImpl);
    const profile = current ?? emptyGpsIotClientProfile(name);
    profile.vCompanyName = name;
    await updateGpsIotClient(secrets, token, clientId, profile, fetchImpl);
    return { clientId, created: false, attached: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GPS IoT client update failed";
    const status = error instanceof GpsIotClientError ? error.status : 502;
    return { created: false, attached: false, error: message, status };
  }
}

export async function deleteSiteGpsIotClient(
  secrets: GpsIotSecrets,
  clientId: string,
  fetchImpl: typeof fetch = fetch
) {
  const id = String(clientId ?? "").trim();
  if (!id) return;
  const token = await getGpsIotAccessToken(secrets, fetchImpl);
  await deleteGpsIotClient(secrets, token, id, fetchImpl);
}
