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
    throw new GpsIotClientError(gpsIotMessage(payload, `GPS IoT SIM request failed (${response.status})`), response.status);
  }
  return payload;
}

export type GpsIotSimRef = {
  simCardId: string;
  gsmNo: string;
  simSerial: string;
  simDesc: string;
  netProvider: string;
};

/** ISP Serial Number / Fleet → SimSerial; MSISDN → GsmNo */
export function resolveGpsIotSimCardId(body: Record<string, unknown>): string {
  for (const candidate of [body.simCardId, body.SimCardId, body.SimcardId]) {
    const value = asText(candidate);
    if (value && value !== "0") return value;
  }
  return "";
}

export function parseGpsIotSims(payload: unknown): GpsIotSimRef[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root.Asset) ? root.Asset : Array.isArray(root.asset) ? root.asset : Array.isArray(payload) ? payload : [];
  const sims: GpsIotSimRef[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    const simSerial = asText(record.SimSerial ?? record.simSerial);
    const gsmNo = asText(record.GsmNo ?? record.gsmNo);
    const simCardId = asText(
      record.SimCardId ?? record.simCardId ?? record.SimcardId ?? record.Id ?? record.id
    );
    if (!simSerial && !gsmNo && !simCardId) continue;
    sims.push({
      simCardId,
      gsmNo,
      simSerial,
      simDesc: asText(record.SimDesc ?? record.simDesc),
      netProvider: asText(record.NetProvider ?? record.netProvider)
    });
  }
  return sims;
}

export async function listGpsIotSimcards(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotSimRef[]> {
  const id = asText(clientId);
  if (!id) throw new GpsIotClientError("clientId is required", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/GetAllSimcard",
    "POST",
    { ClientID: id },
    fetchImpl
  );
  return parseGpsIotSims(payload);
}

export async function findGpsIotSimcard(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  opts: { simCardId?: string; simSerial?: string; gsmNo?: string },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotSimRef | null> {
  const wantId = asText(opts.simCardId);
  const wantSerial = asText(opts.simSerial).toLowerCase();
  const wantGsm = asText(opts.gsmNo).toLowerCase();
  if (!wantId && !wantSerial && !wantGsm) return null;
  const rows = await listGpsIotSimcards(secrets, accessToken, clientId, fetchImpl);
  if (wantId) {
    const byId = rows.find((row) => row.simCardId === wantId);
    if (byId) return byId;
  }
  if (wantSerial) {
    const bySerial = rows.find((row) => row.simSerial.toLowerCase() === wantSerial);
    if (bySerial) return bySerial;
  }
  if (wantGsm) {
    const byGsm = rows.find((row) => row.gsmNo.toLowerCase() === wantGsm);
    if (byGsm) return byGsm;
  }
  return null;
}

function simWriteBody(clientId: string, body: Record<string, unknown>, simCardId = "") {
  const payload: Record<string, unknown> = {
    ClientID: clientId,
    // MSISDN → GsmNo ; ISP/Fleet → SimSerial
    GsmNo: asText(body.msisdn ?? body.GsmNo),
    SimSerial: asText(body.fleetNumber ?? body.SimSerial ?? body.simSerial),
    SimDesc: asText(body.simDesc ?? body.SimDesc ?? body.imsi),
    NetProvider: asText(body.netProvider ?? body.NetProvider),
    PUK1: asText(body.PUK1),
    PUK2: asText(body.PUK2),
    PIN1: asText(body.PIN1),
    PIN2: asText(body.PIN2)
  };
  if (simCardId) payload.SimCardId = simCardId;
  return payload;
}

/** PUT /api/Asset/UpdateSimcard — requires SimCardId; never creates. */
export async function updateGpsIotSimcard(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID);
  const simCardId = resolveGpsIotSimCardId(body);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!simCardId) throw new GpsIotClientError("SimCardId is required for SIM update", 400);
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/UpdateSimcard",
    "PUT",
    simWriteBody(clientId, body, simCardId),
    fetchImpl
  );
  return { simCardId, created: false, updated: true, message: gpsIotMessage(payload, "Simcard Updated Successfully") };
}

/** POST /api/Asset/CreateSimcard — only when SimCardId is absent. */
export async function createGpsIotSimcard(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID);
  const serial = asText(body.fleetNumber ?? body.SimSerial ?? body.simSerial);
  const gsm = asText(body.msisdn ?? body.GsmNo);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!serial && !gsm) throw new GpsIotClientError("SimSerial (ISP) or GsmNo (MSISDN) is required", 400);
  if (resolveGpsIotSimCardId(body)) {
    throw new GpsIotClientError("SimCardId is present — use UpdateSimcard, not CreateSimcard", 400);
  }
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/CreateSimcard",
    "POST",
    simWriteBody(clientId, body),
    fetchImpl
  );
  const found = await findGpsIotSimcard(
    secrets,
    accessToken,
    clientId,
    { simSerial: serial, gsmNo: gsm },
    fetchImpl
  );
  return {
    simCardId: found?.simCardId ?? "",
    created: true,
    updated: false,
    message: gpsIotMessage(payload, "Simcard Added Successfully")
  };
}

/** POST /api/Asset/AssignSimCard — links SIM to device (and thereby the asset). */
export async function assignGpsIotSimcard(
  secrets: GpsIotSecrets,
  accessToken: string,
  clientId: string,
  deviceId: string,
  simCardId: string,
  fetchImpl: typeof fetch = fetch
) {
  if (!clientId || !deviceId || !simCardId) {
    throw new GpsIotClientError("ClientID, DeviceId and SimCardId are required to assign a SIM", 400);
  }
  const payload = await gpsIotJson(
    secrets,
    accessToken,
    "/api/Asset/AssignSimCard",
    "POST",
    { ClientID: clientId, DeviceId: deviceId, SimCardId: simCardId },
    fetchImpl
  );
  return { message: gpsIotMessage(payload, "Simcard Assigned Successfully") };
}

/**
 * Create vs Update for SIMs (no duplicates), then AssignSimCard when DeviceId is present.
 * 1. SimCardId → UpdateSimcard
 * 2. Else match GetAllSimcard by SimSerial (ISP) or GsmNo (MSISDN) → UpdateSimcard
 * 3. Else CreateSimcard
 * 4. If DeviceId + SimCardId → AssignSimCard
 */
export async function saveGpsIotSimcard(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
) {
  const clientId = asText(body.clientId ?? body.ClientID);
  const deviceId = asText(body.deviceId ?? body.DeviceId);
  const serial = asText(body.fleetNumber ?? body.SimSerial ?? body.simSerial);
  const gsm = asText(body.msisdn ?? body.GsmNo);
  if (!clientId) throw new GpsIotClientError("clientId is required", 400);
  if (!serial && !gsm && !resolveGpsIotSimCardId(body)) {
    return { simCardId: "", created: false, updated: false, assigned: false, message: "No SIM details supplied", skipped: true };
  }

  let simCardId = resolveGpsIotSimCardId(body);
  if (!simCardId) {
    const existing = await findGpsIotSimcard(
      secrets,
      accessToken,
      clientId,
      { simSerial: serial, gsmNo: gsm },
      fetchImpl
    );
    if (existing?.simCardId) simCardId = existing.simCardId;
  }

  let result: { simCardId: string; created: boolean; updated: boolean; message: string };
  if (simCardId) {
    result = await updateGpsIotSimcard(secrets, accessToken, { ...body, clientId, simCardId }, fetchImpl);
  } else {
    result = await createGpsIotSimcard(secrets, accessToken, { ...body, clientId }, fetchImpl);
    simCardId = result.simCardId;
  }

  let assigned = false;
  if (simCardId && deviceId) {
    try {
      await assignGpsIotSimcard(secrets, accessToken, clientId, deviceId, simCardId, fetchImpl);
      assigned = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Conflict: SIM already on another device — fail loudly so callers can fix it.
      if (error instanceof GpsIotClientError && /another/i.test(message)) throw error;
      // Treat "already assigned" / soft success as assigned for this device.
      assigned = /assigned|success/i.test(message);
      if (!assigned) throw error;
    }
  }

  return { ...result, simCardId, assigned };
}
