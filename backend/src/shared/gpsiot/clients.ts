import type { GpsIotSecrets } from "./secrets.ts";

export type GpsIotClient = {
  clientId: string;
  vCompanyName: string;
};

export type GpsIotDatabaseRef = {
  id: string;
  name: string;
  dealerName: string;
  organisationName: string;
};

export type GpsIotDatabaseMatch = GpsIotDatabaseRef & {
  matched: boolean;
  ambiguous: boolean;
  clientId: string;
  vCompanyName: string;
};

export const companyKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/** United Kingdom GPS IoT list: vCompanyName is the Vivitel database name. */
export function databasesFromHierarchy(root: {
  dealers?: Array<{
    name?: unknown;
    organisations?: Array<{
      name?: unknown;
      databases?: Array<{ id?: unknown; name?: unknown }>;
    }>;
  }>;
}): GpsIotDatabaseRef[] {
  const rows: GpsIotDatabaseRef[] = [];
  for (const dealer of root?.dealers ?? []) {
    const dealerName = String(dealer?.name ?? "").trim();
    for (const organisation of dealer?.organisations ?? []) {
      const organisationName = String(organisation?.name ?? "").trim();
      for (const database of organisation?.databases ?? []) {
        const name = String(database?.name ?? "").trim();
        const id = String(database?.id ?? "").trim();
        if (!name && !id) continue;
        rows.push({ id, name, dealerName, organisationName });
      }
    }
  }
  return rows;
}

export function matchClientsToDatabases(clients: GpsIotClient[], databases: GpsIotDatabaseRef[]) {
  const byName = new Map<string, GpsIotClient[]>();
  for (const client of clients) {
    const key = companyKey(client.vCompanyName);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(client);
    byName.set(key, list);
  }

  const usedClientIds = new Set<string>();
  const matchedDatabases: GpsIotDatabaseMatch[] = databases.map((database) => {
    const hits = byName.get(companyKey(database.name)) ?? [];
    if (hits.length === 1) {
      const client = hits[0];
      if (client.clientId) usedClientIds.add(client.clientId);
      return {
        ...database,
        matched: true,
        ambiguous: false,
        clientId: client.clientId,
        vCompanyName: client.vCompanyName
      };
    }
    if (hits.length > 1) {
      return {
        ...database,
        matched: false,
        ambiguous: true,
        clientId: "",
        vCompanyName: database.name
      };
    }
    return {
      ...database,
      matched: false,
      ambiguous: false,
      clientId: "",
      vCompanyName: ""
    };
  });

  const unmatchedClients = clients.filter((client) => !client.clientId || !usedClientIds.has(client.clientId));
  return { databases: matchedDatabases, unmatchedClients };
}

export type GpsIotSiteRef = {
  id: string;
  name: string;
  dealerName: string;
  organisationName: string;
  databaseId: string;
  databaseName: string;
};

export type GpsIotSiteMatch = GpsIotSiteRef & {
  matched: boolean;
  ambiguous: boolean;
  clientId: string;
  vCompanyName: string;
};

/** South Africa site sync: vCompanyName is the Vivitel site name. */
export function sitesFromHierarchy(root: {
  dealers?: Array<{
    name?: unknown;
    organisations?: Array<{
      name?: unknown;
      databases?: Array<{
        id?: unknown;
        name?: unknown;
        sites?: Array<{ id?: unknown; name?: unknown }>;
      }>;
    }>;
  }>;
}): GpsIotSiteRef[] {
  const rows: GpsIotSiteRef[] = [];
  for (const dealer of root?.dealers ?? []) {
    const dealerName = String(dealer?.name ?? "").trim();
    for (const organisation of dealer?.organisations ?? []) {
      const organisationName = String(organisation?.name ?? "").trim();
      for (const database of organisation?.databases ?? []) {
        const databaseId = String(database?.id ?? "").trim();
        const databaseName = String(database?.name ?? "").trim();
        for (const site of database?.sites ?? []) {
          const name = String(site?.name ?? "").trim();
          const id = String(site?.id ?? "").trim();
          if (!name && !id) continue;
          rows.push({ id, name, dealerName, organisationName, databaseId, databaseName });
        }
      }
    }
  }
  return rows;
}

export function parseGpsIotClients(payload: unknown): GpsIotClient[] {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rows = Array.isArray(root.client) ? root.client : Array.isArray(root.Client) ? root.Client : [];
  const clients: GpsIotClient[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const clientId = String(record.ClientId ?? record.clientId ?? record.ClientID ?? "").trim();
    const vCompanyName = String(record.vCompanyName ?? record.VCompanyName ?? "").trim();
    if (!clientId && !vCompanyName) continue;
    clients.push({ clientId, vCompanyName });
  }
  return clients;
}

export function matchClientsToSites(clients: GpsIotClient[], sites: GpsIotSiteRef[]) {
  const clientsByName = new Map<string, GpsIotClient[]>();
  for (const client of clients) {
    const key = companyKey(client.vCompanyName);
    if (!key) continue;
    const list = clientsByName.get(key) ?? [];
    list.push(client);
    clientsByName.set(key, list);
  }

  const siteCountByName = new Map<string, number>();
  for (const site of sites) {
    const key = companyKey(site.name);
    if (!key) continue;
    siteCountByName.set(key, (siteCountByName.get(key) ?? 0) + 1);
  }

  const usedClients = new Set<GpsIotClient>();
  const matchedSites: GpsIotSiteMatch[] = sites.map((site) => {
    const key = companyKey(site.name);
    const hits = key ? (clientsByName.get(key) ?? []) : [];
    const siteCount = key ? (siteCountByName.get(key) ?? 0) : 0;
    if (hits.length === 1 && siteCount === 1) {
      const client = hits[0];
      usedClients.add(client);
      return {
        ...site,
        matched: true,
        ambiguous: false,
        clientId: client.clientId,
        vCompanyName: client.vCompanyName
      };
    }
    if (hits.length > 1 || (hits.length === 1 && siteCount > 1)) {
      return {
        ...site,
        matched: false,
        ambiguous: true,
        clientId: "",
        vCompanyName: site.name
      };
    }
    return {
      ...site,
      matched: false,
      ambiguous: false,
      clientId: "",
      vCompanyName: ""
    };
  });

  const unmatchedClients = clients.filter((client) => !usedClients.has(client));
  return { sites: matchedSites, unmatchedClients };
}

export async function fetchGpsIotClients(
  secrets: GpsIotSecrets,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotClient[]> {
  const response = await fetchImpl(`${secrets.baseUrl}/api/Client/GetAllClients`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ IncludeMiniresellerClients: true })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GPS IoT client list failed (${response.status})`);
  }
  return parseGpsIotClients(payload);
}

export class GpsIotClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type GpsIotClientProfile = {
  vCompanyName: string;
  customAppUrl: string;
  isClientSmsEnabled: boolean;
  smsMonthlyClientLimit: number;
  address: string;
  city: string;
  region: string;
  isActive: boolean;
  customClientLink1: string;
  customClientLink1DisplayName: string;
  customClientLink1ToolTip: string;
  customClientLink2: string;
  customClientLink2DisplayName: string;
  customClientLink2ToolTip: string;
  customClientLink3: string;
  customClientLink3DisplayName: string;
  customClientLink3ToolTip: string;
  primaryColor: string;
  accentColor: string;
};

const asRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

const asText = (value: unknown) => String(value ?? "").trim();

const asBool = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  const text = asText(value).toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return fallback;
};

const asNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export function gpsIotMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string") return payload.trim() || fallback;
  const record = asRecord(payload);
  return asText(record.Message ?? record.message ?? record.error_description ?? record.error) || fallback;
}

export function emptyGpsIotClientProfile(vCompanyName: string): GpsIotClientProfile {
  return {
    vCompanyName,
    customAppUrl: "",
    isClientSmsEnabled: false,
    smsMonthlyClientLimit: 0,
    address: "",
    city: "",
    region: "",
    isActive: true,
    customClientLink1: "",
    customClientLink1DisplayName: "",
    customClientLink1ToolTip: "",
    customClientLink2: "",
    customClientLink2DisplayName: "",
    customClientLink2ToolTip: "",
    customClientLink3: "",
    customClientLink3DisplayName: "",
    customClientLink3ToolTip: "",
    primaryColor: "",
    accentColor: ""
  };
}

export function gpsIotClientWriteBody(profile: GpsIotClientProfile, clientId = ""): Record<string, unknown> {
  const body: Record<string, unknown> = {
    VCompanyName: profile.vCompanyName,
    CustomAppUrl: profile.customAppUrl,
    IsClientSmsEnabled: profile.isClientSmsEnabled,
    SMSMonthlyClientLimit: profile.smsMonthlyClientLimit,
    Address: profile.address,
    City: profile.city,
    Region: profile.region,
    IsActive: profile.isActive,
    CustomClientLink1: profile.customClientLink1,
    CustomClientLink1DisplayName: profile.customClientLink1DisplayName,
    CustomClientLink1ToolTip: profile.customClientLink1ToolTip,
    CustomClientLink2: profile.customClientLink2,
    CustomClientLink2DisplayName: profile.customClientLink2DisplayName,
    CustomClientLink2ToolTip: profile.customClientLink2ToolTip,
    CustomClientLink3: profile.customClientLink3,
    CustomClientLink3DisplayName: profile.customClientLink3DisplayName,
    CustomClientLink3ToolTip: profile.customClientLink3ToolTip,
    PrimaryColor: profile.primaryColor,
    AccentColor: profile.accentColor
  };
  if (clientId) body.ClientId = clientId;
  return body;
}

export function parseGpsIotClientProfile(payload: unknown): (GpsIotClientProfile & { clientId: string }) | null {
  const root = asRecord(payload);
  const rows = Array.isArray(root.client) ? root.client : Array.isArray(root.Client) ? root.Client : [];
  const record = asRecord(rows[0]);
  const clientId = asText(record.ClientId ?? record.ClientID ?? record.clientId);
  const vCompanyName = asText(record.vCompanyName ?? record.VCompanyName);
  if (!clientId && !vCompanyName) return null;
  return {
    clientId,
    vCompanyName,
    customAppUrl: asText(record.CustomAppUrl),
    isClientSmsEnabled: asBool(record.IsClientSmsEnabled, false),
    smsMonthlyClientLimit: asNumber(record.SMSMonthlyClientLimit, 0),
    address: asText(record.Address),
    city: asText(record.City),
    region: asText(record.Region),
    isActive: asBool(record.IsActive, true),
    customClientLink1: asText(record.CustomClientLink1),
    customClientLink1DisplayName: asText(record.CustomClientLink1DisplayName),
    customClientLink1ToolTip: asText(record.CustomClientLink1ToolTip),
    customClientLink2: asText(record.CustomClientLink2),
    customClientLink2DisplayName: asText(record.CustomClientLink2DisplayName),
    customClientLink2ToolTip: asText(record.CustomClientLink2ToolTip),
    customClientLink3: asText(record.CustomClientLink3),
    customClientLink3DisplayName: asText(record.CustomClientLink3DisplayName),
    customClientLink3ToolTip: asText(record.CustomClientLink3ToolTip),
    primaryColor: asText(record.PrimaryColor),
    accentColor: asText(record.AccentColor)
  };
}

function clientIdFromPayload(payload: unknown) {
  const record = asRecord(payload);
  return asText(record.ClientID ?? record.ClientId ?? record.clientId);
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
    throw new GpsIotClientError(gpsIotMessage(payload, `GPS IoT client request failed (${response.status})`), response.status);
  }
  return payload;
}

export async function fetchGpsIotClient(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  fetchImpl: typeof fetch = fetch
) {
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Client/GetClient",
    "POST",
    { ClientId: clientId },
    fetchImpl
  );
  return parseGpsIotClientProfile(payload);
}

export async function createGpsIotClient(
  secrets: GpsIotSecrets,
  accessToken: string,
  profile: GpsIotClientProfile,
  fetchImpl: typeof fetch = fetch
) {
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Client/CreateClient",
    "POST",
    gpsIotClientWriteBody(profile),
    fetchImpl
  );
  const clientId = clientIdFromPayload(payload);
  if (!clientId) throw new GpsIotClientError("GPS IoT create client did not include ClientID", 502);
  return { clientId, message: gpsIotMessage(payload, "Client Updated successfully") };
}

export async function updateGpsIotClient(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  profile: GpsIotClientProfile,
  fetchImpl: typeof fetch = fetch
) {
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Client/UpdateClient",
    "PUT",
    gpsIotClientWriteBody(profile, clientId),
    fetchImpl
  );
  return { clientId: clientIdFromPayload(payload) || clientId, message: gpsIotMessage(payload, "Client Updated successfully") };
}

export async function deleteGpsIotClient(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  fetchImpl: typeof fetch = fetch
) {
  try {
    const payload = await gpsIotJson(
      secrets,
      accessToken,
      "/api/Client/DeleteClient",
      "DELETE",
      { ClientId: clientId },
      fetchImpl
    );
    return { message: gpsIotMessage(payload, "Client Deleted successfully") };
  } catch (error) {
    if (error instanceof GpsIotClientError && error.status === 404) {
      return { message: "Client Deleted successfully" };
    }
    throw error;
  }
}
