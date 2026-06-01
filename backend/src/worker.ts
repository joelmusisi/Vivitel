export interface Env {
  APP_NAME?: string;
  ViviTEL: KVNamespace;
  VIVI_D1: D1Database;
  STORAGE_BUCKET?: R2Bucket;
  TASK_QUEUE?: Queue;
}

type TokenStatus = "Active" | "Revoked";

interface PersonalAccessToken {
  id: string;
  token: string;
  description: string;
  organisationName: string;
  organisationGroup?: string;
  expiryDate: string;
  status: TokenStatus;
  daysToExpiry: number;
  username: string;
  createdAt: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    }
  });

const notFound = () => json({ error: "Not found" }, 404);
const badRequest = (message: string) => json({ error: message }, 400);
const serviceUnavailable = (data: unknown) => json(data, 503);

const PAT_INDEX_KEY = "pat:index";

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const daysUntil = (date: Date) => Math.max(0, Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

let d1Ready = false;

const ensureD1Tables = async (env: Env) => {
  if (d1Ready) return;
  await env.VIVI_D1.prepare(
    "CREATE TABLE IF NOT EXISTS assets (id TEXT NOT NULL, tenant_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_id))"
  ).run();
  await env.VIVI_D1.prepare(
    "CREATE TABLE IF NOT EXISTS device_reporting_settings (tenant_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)"
  ).run();
  await env.VIVI_D1.prepare(
    "CREATE TABLE IF NOT EXISTS configuration_groups (id TEXT NOT NULL, tenant_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_id))"
  ).run();
  await env.VIVI_D1.prepare(
    "CREATE TABLE IF NOT EXISTS bindings (id TEXT NOT NULL, tenant_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_id, type))"
  ).run();
  await env.VIVI_D1.prepare(
    "CREATE TABLE IF NOT EXISTS telemetry_events (id TEXT NOT NULL, tenant_id TEXT NOT NULL, asset_id TEXT, imei TEXT, created_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (id, tenant_id))"
  ).run();
  d1Ready = true;
};

type ResourceStatus = "ok" | "not_configured" | "error";

const checkKv = async (env: Env) => {
  const key = "health:kv";
  try {
    await env.ViviTEL.put(key, JSON.stringify({ ping: true, at: new Date().toISOString() }), { expirationTtl: 60 });
    const value = await env.ViviTEL.get(key);
    if (!value) return { status: "error" as ResourceStatus, message: "KV read failed" };
    await env.ViviTEL.delete(key);
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
};

const checkD1 = async (env: Env) => {
  try {
    await ensureD1Tables(env);
    await env.VIVI_D1.prepare("SELECT 1 as ok").first();
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
};

const checkBindingsTable = async (env: Env) => {
  try {
    await ensureD1Tables(env);
    await env.VIVI_D1.prepare("SELECT COUNT(*) as count FROM bindings").first();
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
};

const checkStorage = async (env: Env) => {
  if (!env.STORAGE_BUCKET) return { status: "not_configured" as ResourceStatus };
  try {
    await env.STORAGE_BUCKET.list({ limit: 1 });
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
};

const checkQueue = async (env: Env) => {
  if (!env.TASK_QUEUE) return { status: "not_configured" as ResourceStatus };
  try {
    await env.TASK_QUEUE.send({ type: "healthcheck", at: new Date().toISOString() });
    return { status: "ok" as ResourceStatus };
  } catch (error) {
    return { status: "error" as ResourceStatus, message: (error as Error).message };
  }
};

const getTenantId = (request: Request, url: URL) => {
  return (
    request.headers.get("x-tenant-id")?.trim() ||
    url.searchParams.get("tenant")?.trim() ||
    "demo-tenant"
  );
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeTextKey = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/temperature/g, "temp")
    .replace(/[^a-z0-9]+/g, "");

const flattenTelemetry = (payload: unknown, limit = 2000) => {
  const out: Array<{ key: string; value: unknown }> = [];
  const queue: Array<{ value: unknown; path: string; depth: number }> = [{ value: payload, path: "", depth: 0 }];
  const seen = new Set<unknown>();

  while (queue.length && out.length < limit) {
    const current = queue.shift()!;
    const value = current.value;
    if (value && typeof value === "object") {
      if (seen.has(value)) continue;
      seen.add(value);
    }
    if (value === null || value === undefined) continue;
    if (typeof value !== "object") {
      out.push({ key: current.path, value });
      continue;
    }
    if (current.depth >= 6) continue;
    if (Array.isArray(value)) {
      value.slice(0, 40).forEach((child, index) =>
        queue.push({ value: child, path: `${current.path}[${index}]`, depth: current.depth + 1 })
      );
      continue;
    }
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      queue.push({
        value: child,
        path: current.path ? `${current.path}.${key}` : key,
        depth: current.depth + 1
      });
    });
  }

  return out;
};

const isFuelLevelName = (name: string) => {
  const normalized = normalizeTextKey(name);
  if (!normalized.includes("fuel")) return false;
  if (/(percent|percentage|rate|consumption|consumed|used|economy|efficiency|trip|target)/.test(normalized)) {
    return false;
  }
  return (
    normalized === "fuel" ||
    normalized.includes("fuellevel") ||
    normalized.includes("fuellitre") ||
    normalized.includes("fuelliter") ||
    normalized.includes("fuelvolume") ||
    normalized.includes("fuelreading") ||
    normalized.includes("tankfuel") ||
    normalized.includes("fmfuel")
  );
};

const coerceFuelLitres = (value: unknown) => {
  const numeric = normalizeNumber(value);
  if (numeric === null || numeric < 0 || numeric > 5000) return null;
  return numeric;
};

const pickFirstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const numeric = normalizeNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
};

const extractLatLng = (payload: Record<string, unknown>) => {
  const data = asRecord(payload.data) ?? payload;
  const position = asRecord(payload.position);
  const lat = pickFirstNumber(data.lat, data.latitude, payload.lat, payload.latitude, position?.latitude, position?.lat);
  const lng = pickFirstNumber(
    data.lon,
    data.lng,
    data.longitude,
    payload.lon,
    payload.lng,
    payload.longitude,
    position?.longitude,
    position?.lon,
    position?.lng
  );
  if (lat === null || lng === null) return null;
  return { lat, lng };
};

const readImei = (payload: Record<string, unknown>) => {
  const data = asRecord(payload.data) ?? {};
  const device = asRecord(payload.device) ?? {};
  return String(
    payload.imei ??
      payload.uniqueId ??
      payload.deviceUniqueId ??
      data.imei ??
      data.uniqueId ??
      device.uniqueId ??
      ""
  ).trim();
};

const extractFuelLitres = (payload: Record<string, unknown>, io: Record<string, unknown>) => {
  const data = asRecord(payload.data) ?? {};
  const attrs = asRecord(payload.attributes) ?? {};
  const direct = [
    payload.fuelLitres,
    payload.fuelLiters,
    payload.fuelLevelLitres,
    payload.fuelLevelLiters,
    payload.fuelLevelL,
    payload.fuelReading,
    payload.fuel,
    data.fuelLitres,
    data.fuelLiters,
    data.fuelLevelLitres,
    data.fuelLevelLiters,
    data.fuelLevelL,
    data.fuelReading,
    data.fuel,
    attrs.fuelLitres,
    attrs.fuelLiters,
    attrs.fuelLevelLitres,
    attrs.fuelLevelLiters,
    attrs.fuelLevelL,
    attrs.fuelReading,
    attrs.fuel
  ];
  for (const value of direct) {
    const fuel = coerceFuelLitres(value);
    if (fuel !== null) return fuel;
  }
  for (const [key, value] of Object.entries(io)) {
    if (!isFuelLevelName(key)) continue;
    const fuel = coerceFuelLitres(value);
    if (fuel !== null) return fuel;
  }
  for (const { key, value } of flattenTelemetry(payload)) {
    if (!isFuelLevelName(key)) continue;
    const fuel = coerceFuelLitres(value);
    if (fuel !== null) return fuel;
  }
  return null;
};

const extractIoSnapshot = (payload: Record<string, unknown>) => {
  const ioById: Record<string, unknown> = {};
  const io: Record<string, unknown> = {};
  for (const { key, value } of flattenTelemetry(payload)) {
    const last = key.split(".").pop() ?? "";
    const idMatch = last.match(/^io(\d{2,6})$/i) || last.match(/^(\d{2,6})$/);
    if (idMatch) ioById[idMatch[1]] = value;
    const normalized = normalizeTextKey(last);
    if (normalized && (normalized.includes("fuel") || normalized === "speed" || normalized === "ignition")) {
      io[last] = value;
    }
  }
  return { io, ioById };
};

const haversineMeters = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMeters = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMeters * Math.asin(Math.min(1, Math.sqrt(h)));
};

const deriveMovementState = (
  speed: number | null,
  current: { lat: number; lng: number; at: string },
  previous: Record<string, unknown> | null
) => {
  if (speed !== null && speed > 1.2) return "moving" as const;
  const previousLat = normalizeNumber(previous?.lat ?? previous?.latitude);
  const previousLng = normalizeNumber(previous?.lng ?? previous?.lon ?? previous?.longitude);
  const previousAtRaw = String(previous?.lastSeen ?? previous?.lastPosition ?? previous?.telemetryAt ?? "").trim();
  const previousAt = previousAtRaw ? Date.parse(previousAtRaw) : NaN;
  const currentAt = Date.parse(current.at);
  if (previousLat !== null && previousLng !== null && Number.isFinite(previousAt) && Number.isFinite(currentAt) && currentAt > previousAt) {
    const movedMeters = haversineMeters(previousLat, previousLng, current.lat, current.lng);
    if (movedMeters >= 15) return "moving" as const;
  }
  if (speed !== null && speed <= 1.2) return "stationary" as const;
  return "unknown" as const;
};

async function getPatIndex(env: Env): Promise<string[]> {
  const raw = await env.ViviTEL.get(PAT_INDEX_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

async function setPatIndex(env: Env, ids: string[]) {
  await env.ViviTEL.put(PAT_INDEX_KEY, JSON.stringify(ids));
}

async function readPat(env: Env, id: string): Promise<PersonalAccessToken | null> {
  const raw = await env.ViviTEL.get(`pat:${id}`);
  if (!raw) return null;
  const token = JSON.parse(raw) as PersonalAccessToken;
  const expiry = new Date(token.expiryDate);
  token.daysToExpiry = daysUntil(expiry);
  return token;
}

async function writePat(env: Env, token: PersonalAccessToken) {
  await env.ViviTEL.put(`pat:${token.id}`, JSON.stringify(token));
}

async function listPats(env: Env): Promise<PersonalAccessToken[]> {
  const ids = await getPatIndex(env);
  const tokens: PersonalAccessToken[] = [];
  for (const id of ids) {
    const pat = await readPat(env, id);
    if (pat) tokens.push(pat);
  }
  return tokens;
}

async function createPat(env: Env, input: { description?: string; organisationName?: string; organisationGroup?: string; expiryDays?: number; username?: string }): Promise<PersonalAccessToken> {
  const id = uuid();
  const tokenValue = crypto.randomUUID().replace(/-/g, "");
  const now = new Date();
  const expiryDays = Math.min(Math.max(input.expiryDays ?? 180, 30), 365);
  const expiryDate = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

  const pat: PersonalAccessToken = {
    id,
    token: tokenValue,
    description: input.description ?? "Power BI access",
    organisationName: input.organisationName ?? "Demo Org",
    organisationGroup: input.organisationGroup,
    expiryDate: expiryDate.toISOString(),
    status: "Active",
    daysToExpiry: expiryDays,
    username: input.username ?? "demo-user",
    createdAt: now.toISOString()
  };

  const ids = await getPatIndex(env);
  ids.push(id);
  await writePat(env, pat);
  await setPatIndex(env, ids);
  return pat;
}

async function revokePat(env: Env, id: string): Promise<PersonalAccessToken | null> {
  const pat = await readPat(env, id);
  if (!pat) return null;
  pat.status = "Revoked";
  await writePat(env, pat);
  return pat;
}

const readAssetRows = async (env: Env, tenantId: string) => {
  const result = await env.VIVI_D1.prepare("SELECT id, data, updated_at FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC")
    .bind(tenantId)
    .all();
  return (result.results ?? [])
    .map((row) => {
      try {
        return {
          id: String(row.id ?? ""),
          updatedAt: String(row.updated_at ?? ""),
          data: JSON.parse(String(row.data)) as Record<string, unknown>
        };
      } catch {
        return null;
      }
    })
    .filter((row): row is { id: string; updatedAt: string; data: Record<string, unknown> } => Boolean(row));
};

const findExistingAssetForImei = async (env: Env, tenantId: string, imei: string) => {
  if (!imei) return null;
  const rows = await readAssetRows(env, tenantId);
  return rows.find((row) => String(row.data.imei ?? "").trim() === imei) ?? null;
};

const storeTelemetryEvent = async (env: Env, tenantId: string, payload: Record<string, unknown>) => {
  await ensureD1Tables(env);
  const now = new Date().toISOString();
  const latLng = extractLatLng(payload);
  if (!latLng) return { ok: false as const, status: 400, error: "Latitude and longitude are required for telemetry." };

  const imei = readImei(payload);
  const data = asRecord(payload.data) ?? {};
  const device = asRecord(payload.device) ?? {};
  const incomingId = String(
    payload.id ??
      payload.assetId ??
      payload.registration ??
      payload.deviceId ??
      data.assetId ??
      data.registration ??
      device.id ??
      device.name ??
      imei ??
      crypto.randomUUID()
  ).trim();
  const existing = imei ? await findExistingAssetForImei(env, tenantId, imei) : null;
  const id = existing?.id || incomingId;
  const previous = existing?.data ?? null;
  const { io, ioById } = extractIoSnapshot(payload);
  const speed = pickFirstNumber(data.speed, payload.speed, asRecord(payload.position)?.speed, io.Speed, io.speed);
  const heading = pickFirstNumber(data.heading, data.course, payload.heading, payload.course, asRecord(payload.position)?.course, io.Heading, io.heading);
  const satellites = pickFirstNumber(data.satellites, payload.satellites, io.Satellites, io.satellites);
  const fuelLitres = extractFuelLitres(payload, io);
  const movement = deriveMovementState(speed, { ...latLng, at: now }, previous);

  const nextAsset: Record<string, unknown> = {
    ...(previous ?? {}),
    id,
    ...(imei ? { imei } : {}),
    lastSeen: now,
    lastPosition: now,
    telemetryAt: now,
    lat: latLng.lat,
    lng: latLng.lng,
    lon: latLng.lng,
    gps: `${latLng.lat}, ${latLng.lng}`,
    ...(speed !== null ? { speed } : {}),
    ...(heading !== null ? { heading } : {}),
    ...(satellites !== null ? { satellites } : {}),
    movement,
    status: movement === "moving" ? "online" : previous?.status ?? "online",
    ...(fuelLitres !== null
      ? {
          fuelLitres,
          fuelLevelLitres: fuelLitres,
          fuelReading: fuelLitres
        }
      : {}),
    telemetryLatest: {
      at: now,
      lat: latLng.lat,
      lng: latLng.lng,
      lon: latLng.lng,
      gps: `${latLng.lat}, ${latLng.lng}`,
      ...(speed !== null ? { speed } : {}),
      ...(heading !== null ? { heading } : {}),
      ...(satellites !== null ? { satellites } : {}),
      movement,
      ...(fuelLitres !== null
        ? {
            fuelLitres,
            fuelLevelLitres: fuelLitres,
            fuelReading: fuelLitres
          }
        : {}),
      io,
      ioById
    }
  };

  await env.VIVI_D1.prepare(
    "INSERT INTO assets (id, tenant_id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id, tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  )
    .bind(id, tenantId, JSON.stringify(nextAsset), now)
    .run();

  const eventId = crypto.randomUUID();
  await env.VIVI_D1.prepare(
    "INSERT INTO telemetry_events (id, tenant_id, asset_id, imei, created_at, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  )
    .bind(eventId, tenantId, id, imei, now, JSON.stringify({ ...payload, telemetryLatest: nextAsset.telemetryLatest }))
    .run();

  return { ok: true as const, id, eventId, tenantId, asset: nextAsset };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type, x-tenant-id"
        }
      });
    }

    switch (url.pathname) {
      case "/":
        return json({
          service: env.APP_NAME ?? "Vivi Telematic API",
          routes: [
            "/health",
            "/health/resources",
            "/telemetry/summary",
            "/ingest/telemetry",
            "/telemetry/lookup",
            "/telemetry/history",
            "/echo",
            "/kv/:key",
            "/pat",
            "/d1/assets",
            "/d1/device-reporting-settings",
            "/d1/configuration-groups",
            "/d1/bindings"
          ]
        });
      case "/health":
        return json({ status: "ok", timestamp: new Date().toISOString() });
      case "/health/resources": {
        const [kv, d1, bindings, storage, queue] = await Promise.all([
          checkKv(env),
          checkD1(env),
          checkBindingsTable(env),
          checkStorage(env),
          checkQueue(env)
        ]);
        const hasError = [kv, d1, bindings, storage, queue].some((item) => item.status === "error");
        const payload = {
          status: hasError ? "degraded" : "ok",
          timestamp: new Date().toISOString(),
          kv,
          storage,
          d1,
          bindings,
          queue
        };
        return hasError ? serviceUnavailable(payload) : json(payload);
      }
      case "/telemetry/summary":
        return json({
          vehiclesOnline: 128,
          averageSpeedKph: 63,
          alertsToday: 12,
          fuelBurnRateLph: 18.4
        });
      case "/ingest/telemetry": {
        if (request.method !== "POST") return badRequest("Use POST with a JSON telemetry payload.");
        const tenantId = getTenantId(request, url);
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const result = await storeTelemetryEvent(env, tenantId, body);
          if (!result.ok) return json({ error: result.error }, result.status);
          return json({
            stored: true,
            id: result.id,
            eventId: result.eventId,
            tenantId: result.tenantId,
            asset: result.asset
          });
        } catch (error) {
          return badRequest(error instanceof Error ? error.message : "Invalid JSON body.");
        }
      }
      case "/telemetry/lookup": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);
        const imei = String(url.searchParams.get("imei") ?? "").trim();
        if (!imei) return badRequest("imei is required");
        const assetRows = await readAssetRows(env, tenantId);
        const assets = assetRows.map((row) => row.data).filter((asset) => String(asset.imei ?? "").trim() === imei);
        const eventRows = await env.VIVI_D1.prepare(
          "SELECT data, created_at FROM telemetry_events WHERE tenant_id = ? AND imei = ? ORDER BY created_at DESC LIMIT 50"
        )
          .bind(tenantId, imei)
          .all();
        const events = (eventRows.results ?? []).map((row) => {
          try {
            return { ...(JSON.parse(String(row.data)) as Record<string, unknown>), created_at: String(row.created_at ?? "") };
          } catch {
            return null;
          }
        }).filter(Boolean);
        const latestAsset = assets[0] ?? null;
        return json({
          tenantId,
          imei,
          assets,
          events,
          latest: latestAsset ? (latestAsset.telemetryLatest ?? null) : events[0] ?? null
        });
      }
      case "/telemetry/history": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);
        const imei = String(url.searchParams.get("imei") ?? "").trim();
        const assetId = String(url.searchParams.get("assetId") ?? "").trim();
        const from = String(url.searchParams.get("from") ?? "").trim();
        const to = String(url.searchParams.get("to") ?? "").trim();
        const limitRaw = Number(url.searchParams.get("limit") ?? 500);
        const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 500, 5000));
        const clauses = ["tenant_id = ?"];
        const params: unknown[] = [tenantId];
        if (imei) {
          clauses.push("imei = ?");
          params.push(imei);
        }
        if (assetId) {
          clauses.push("asset_id = ?");
          params.push(assetId);
        }
        if (from) {
          clauses.push("created_at >= ?");
          params.push(from);
        }
        if (to) {
          clauses.push("created_at <= ?");
          params.push(to);
        }
        const result = await env.VIVI_D1.prepare(
          `SELECT id, asset_id, imei, created_at, data FROM telemetry_events WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ${limit}`
        )
          .bind(...params)
          .all();
        const events = (result.results ?? []).map((row) => {
          try {
            return {
              id: String(row.id ?? ""),
              assetId: String(row.asset_id ?? ""),
              imei: String(row.imei ?? ""),
              createdAt: String(row.created_at ?? ""),
              data: JSON.parse(String(row.data))
            };
          } catch {
            return null;
          }
        }).filter(Boolean);
        return json({
          tenantId,
          filters: { imei, assetId, from, to, limit },
          counts: { events: events.length, archives: 0 },
          events
        });
      }
      case "/echo":
        if (request.method !== "POST") {
          return badRequest("Use POST with a JSON payload.");
        }
        try {
          const body = await request.json();
          return json({ received: body, at: new Date().toISOString() });
        } catch {
          return badRequest("Invalid JSON body.");
        }
      case "/pat":
        if (request.method === "GET") {
          const tokens = await listPats(env);
          return json({ tokens });
        }
        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Partial<PersonalAccessToken>;
            const pat = await createPat(env, {
              description: body.description,
              organisationName: body.organisationName,
              organisationGroup: body.organisationGroup,
              expiryDays: body.daysToExpiry,
              username: body.username
            });
            return json({ token: pat });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }
        return badRequest("Unsupported method for /pat");
      case "/d1/assets": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);

        if (request.method === "GET") {
          const result = await env.VIVI_D1.prepare(
            "SELECT data, updated_at FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC"
          )
            .bind(tenantId)
            .all();
          const assets = (result.results ?? []).map((row) => {
            try {
              return JSON.parse(String(row.data));
            } catch {
              return null;
            }
          }).filter(Boolean);
          return json({ assets, tenantId });
        }

        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const id = String(body.id ?? "").trim();
            if (!id) return badRequest("Asset id is required.");
            const now = new Date().toISOString();
            await env.VIVI_D1.prepare(
              "INSERT INTO assets (id, tenant_id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id, tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
            )
              .bind(id, tenantId, JSON.stringify(body), now)
              .run();
            return json({ stored: true, id, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        return badRequest("Unsupported method for /d1/assets");
      }
      case "/d1/device-reporting-settings": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);

        if (request.method === "GET") {
          const result = await env.VIVI_D1.prepare(
            "SELECT data, updated_at FROM device_reporting_settings WHERE tenant_id = ?"
          )
            .bind(tenantId)
            .first();
          if (!result) return json({ settings: null, tenantId });
          try {
            return json({ settings: JSON.parse(String(result.data)), tenantId, updatedAt: result.updated_at });
          } catch {
            return json({ settings: null, tenantId });
          }
        }

        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const now = new Date().toISOString();
            await env.VIVI_D1.prepare(
              "INSERT INTO device_reporting_settings (tenant_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
            )
              .bind(tenantId, JSON.stringify(body), now)
              .run();
            return json({ stored: true, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        return badRequest("Unsupported method for /d1/device-reporting-settings");
      }
      case "/d1/configuration-groups": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);

        if (request.method === "DELETE") {
          const id = (url.searchParams.get("id") ?? "").trim();
          if (!id) return badRequest("Configuration group id is required.");
          const result = await env.VIVI_D1.prepare(
            "DELETE FROM configuration_groups WHERE tenant_id = ? AND id = ?"
          )
            .bind(tenantId, id)
            .run();
          return json({ deleted: (result.meta?.changes ?? 0) > 0, id, tenantId });
        }

        if (request.method === "GET") {
          const result = await env.VIVI_D1.prepare(
            "SELECT data, updated_at FROM configuration_groups WHERE tenant_id = ? ORDER BY updated_at DESC"
          )
            .bind(tenantId)
            .all();
          const groups = (result.results ?? [])
            .map((row) => {
              try {
                return JSON.parse(String(row.data));
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          return json({ groups, tenantId });
        }

        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const id = String(body.id ?? "").trim();
            if (!id) return badRequest("Configuration group id is required.");
            const now = new Date().toISOString();
            await env.VIVI_D1.prepare(
              "INSERT INTO configuration_groups (id, tenant_id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id, tenant_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
            )
              .bind(id, tenantId, JSON.stringify(body), now)
              .run();
            return json({ stored: true, id, tenantId });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        return badRequest("Unsupported method for /d1/configuration-groups");
      }
      case "/d1/bindings": {
        await ensureD1Tables(env);
        const tenantId = getTenantId(request, url);
        const type = (url.searchParams.get("type") ?? "").trim().toLowerCase();
        const allowed = ["notifications", "locations", "devices"];
        if (!allowed.includes(type)) return badRequest("type must be notifications, locations, or devices");

        if (request.method === "GET") {
          const result = await env.VIVI_D1.prepare(
            "SELECT data, updated_at FROM bindings WHERE tenant_id = ? AND type = ? ORDER BY updated_at DESC"
          )
            .bind(tenantId, type)
            .all();
          const bindings = (result.results ?? [])
            .map((row) => {
              try {
                return JSON.parse(String(row.data));
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          return json({ bindings, tenantId, type });
        }

        if (request.method === "POST") {
          try {
            const body = (await request.json()) as Record<string, unknown>;
            const id = String(body.id ?? "").trim();
            if (!id) return badRequest("Binding id is required.");
            const now = new Date().toISOString();
            await env.VIVI_D1.prepare(
              "INSERT INTO bindings (id, tenant_id, type, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id, tenant_id, type) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
            )
              .bind(id, tenantId, type, JSON.stringify(body), now)
              .run();
            return json({ stored: true, id, tenantId, type });
          } catch {
            return badRequest("Invalid JSON body.");
          }
        }

        return badRequest("Unsupported method for /d1/bindings");
      }
      case "/kv":
        return badRequest("Provide a key, e.g. /kv/demo");
      default: {
        if (url.pathname.startsWith("/pat/") && url.pathname.endsWith("/revoke")) {
          const parts = url.pathname.split("/");
          const id = parts[2];
          const revoked = await revokePat(env, id);
          if (!revoked) return notFound();
          return json({ token: revoked });
        }

        if (url.pathname.startsWith("/kv/")) {
          const key = url.pathname.replace("/kv/", "");
          if (!key) return badRequest("Key is required.");

          if (request.method === "POST") {
            try {
              const body = await request.json();
              await env.ViviTEL.put(key, JSON.stringify(body));
              return json({ stored: true, key });
            } catch {
              return badRequest("Invalid JSON body.");
            }
          }

          const stored = await env.ViviTEL.get(key);
          if (!stored) return notFound();
          return new Response(stored, {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "access-control-allow-origin": "*"
            }
          });
        }
        return notFound();
      }
    }
  }
};
