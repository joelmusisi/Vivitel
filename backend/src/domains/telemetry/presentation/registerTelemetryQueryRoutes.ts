import type { Express, Request, Response } from "express";

interface RegisterTelemetryQueryRoutesDeps {
  app: Express;
  db: any;
  requireApiKey: (req: Request, res: Response) => boolean;
  findTenantForImeiWithDefault: (imei: string, fallbackTenant: string) => string;
  parseStoredJson: (text: string) => any;
  buildLatestTelemetrySummary: (event: any, createdAt: string) => any;
  traccarResolveLatestPositionByImei: (imei: string) => Promise<any | null>;
  coerceNumber: (value: unknown) => number | null;
  coerceBool: (value: unknown) => boolean | null;
  pickTraccarPositionAt: (position: any) => string;
  readTelemetryArchivePayload: (row: any) => Promise<any | null>;
  valkeyGet?: (key: string) => Promise<string | null>;
  valkeySet?: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  valkeyTtl?: number;
  postgresTelemetryMirror?: {
    findAssetsByImei: (tenant: string, imei: string) => Promise<Array<{ data: string; updated_at: string }>>;
    readTelemetryHistory: (query: {
      tenantId: string;
      imei?: string;
      assetId?: string;
      assetIds?: string[];
      from?: string;
      to?: string;
      limit: number;
    }) => Promise<Array<{ id: string; asset_id: string; imei: string; created_at: string; data: string }>>;
    readTelemetryArchives: (query: {
      tenantId: string;
      imei?: string;
      assetId?: string;
      assetIds?: string[];
      from?: string;
      to?: string;
      limit: number;
    }) => Promise<Array<{ event_id: string; asset_id: string; imei: string; created_at: string; storage: string; storage_key: string; content_type: string; size_bytes: number }>>;
  } | null;
}

export function registerTelemetryQueryRoutes(deps: RegisterTelemetryQueryRoutesDeps): void {
  const {
    app,
    db,
    requireApiKey,
    findTenantForImeiWithDefault,
    parseStoredJson,
    buildLatestTelemetrySummary,
    traccarResolveLatestPositionByImei,
    coerceNumber,
    coerceBool,
    pickTraccarPositionAt,
    readTelemetryArchivePayload,
    valkeyGet,
    valkeySet,
    valkeyTtl,
    postgresTelemetryMirror,
  } = deps;

  const queryCacheTtlSeconds = Math.max(5, Math.min(Number(valkeyTtl ?? 15), 15));

  const cachePart = (value: unknown) => encodeURIComponent(String(value ?? "").trim() || "-");

  const readCachedJson = async (key: string) => {
    if (!valkeyGet) return null;
    try {
      const raw = await valkeyGet(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const writeCachedJson = async (key: string, value: unknown) => {
    if (!valkeySet) return;
    try {
      await valkeySet(key, JSON.stringify(value), queryCacheTtlSeconds);
    } catch {
      // ignore cache write failures
    }
  };

  const readAssetsByImei = async (tenant: string, imei: string) => {
    const pgRows = await postgresTelemetryMirror?.findAssetsByImei(tenant, imei);
    if (pgRows && pgRows.length) {
      return pgRows.map((row) => parseStoredJson(row.data)).filter(Boolean);
    }

    const assetRows = db.prepare("SELECT data, updated_at FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC").all(tenant);
    return assetRows
      .map((r: any) => parseStoredJson(r.data))
      .filter(Boolean)
      .filter((a: any) => String(a?.imei ?? "").trim() === imei);
  };

  const readEventRows = async (query: {
    tenantId: string;
    imei?: string;
    assetId?: string;
    assetIds?: string[];
    from?: string;
    to?: string;
    limit: number;
  }) => {
    const pgRows = await postgresTelemetryMirror?.readTelemetryHistory(query);
    if (pgRows && pgRows.length) return pgRows;

    const clauses: string[] = ["tenant_id = ?"];
    const params: any[] = [query.tenantId];
    if (query.imei) {
      clauses.push("imei = ?");
      params.push(query.imei);
    }
    if (query.assetId) {
      clauses.push("asset_id = ?");
      params.push(query.assetId);
    } else if ((query.assetIds?.length ?? 0) > 0) {
      const placeholders = (query.assetIds ?? []).map(() => "?").join(", ");
      clauses.push(`asset_id IN (${placeholders})`);
      params.push(...(query.assetIds ?? []));
    }
    if (query.from) {
      clauses.push("created_at >= ?");
      params.push(query.from);
    }
    if (query.to) {
      clauses.push("created_at <= ?");
      params.push(query.to);
    }
    const where = clauses.join(" AND ");
    return db
      .prepare(`SELECT id, asset_id, imei, created_at, data FROM telemetry_events WHERE ${where} ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(query.limit, 5000))}`)
      .all(...params);
  };

  app.get("/telemetry/lookup", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenantHint = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const imei = String(req.query.imei ?? "").trim();
    if (!imei) return res.status(400).json({ error: "imei is required" });
    const tenant = tenantHint || findTenantForImeiWithDefault(imei, "default");
    const refreshLiveRequested = ["1", "true", "yes"].includes(String(req.query.refreshLive ?? "").trim().toLowerCase());
    const cacheKey = `vivi:${tenant}:telemetry:lookup:${cachePart(imei)}`;

    if (!refreshLiveRequested) {
      const cached = await readCachedJson(cacheKey);
      if (cached) return res.json(cached);
    }

    try {
      const assets = await readAssetsByImei(tenant, imei);

      let eventRows = await readEventRows({ tenantId: tenant, imei, limit: 50 });
      if ((!eventRows || eventRows.length === 0) && assets.length) {
        const assetIds = assets
          .map((a: any) => String(a?.id ?? "").trim())
          .filter(Boolean)
          .slice(0, 20);
        if (assetIds.length) {
          eventRows = await readEventRows({ tenantId: tenant, assetIds, limit: 50 });
        }
      }
      const events = eventRows
        .map((r: any) => ({ data: parseStoredJson(r.data), created_at: String(r.created_at ?? "").trim() }))
        .filter((r: any) => r.data);

      const latestRow = events[0] ?? null;
      let latest = latestRow ? buildLatestTelemetrySummary(latestRow.data, latestRow.created_at || new Date().toISOString()) : undefined;
      const latestAtMs = Date.parse(String((latest as any)?.at ?? ""));
      const latestStale = !Number.isFinite(latestAtMs) || (Date.now() - latestAtMs) > 2 * 60 * 1000;
      const latestHasCoords = typeof (latest as any)?.lat === "number" && typeof (latest as any)?.lng === "number";
      void latestStale;
      void latestHasCoords;

      if (refreshLiveRequested) {
        const livePosition = await traccarResolveLatestPositionByImei(imei);
        if (livePosition) {
          const attrs = ((livePosition as any)?.attributes ?? {}) as Record<string, unknown>;
          const lat = coerceNumber((livePosition as any)?.latitude ?? (livePosition as any)?.lat);
          const lng = coerceNumber((livePosition as any)?.longitude ?? (livePosition as any)?.lon ?? (livePosition as any)?.lng);
          const speed = coerceNumber((livePosition as any)?.speed ?? attrs.speed);
          const heading = coerceNumber((livePosition as any)?.course ?? (livePosition as any)?.heading ?? attrs.heading);
          const satellites = coerceNumber(
            (livePosition as any)?.satellites ??
              (livePosition as any)?.sat ??
              attrs.satellites ??
              attrs.sat ??
              attrs.satelliteCount ??
              attrs["Number of Satellites"]
          );
          const ignition = coerceBool(
            (livePosition as any)?.ignition ??
              (livePosition as any)?.attributes?.ignition ??
              (livePosition as any)?.attributes?.Ignition ??
              attrs.ignition ??
              attrs.Ignition ??
              attrs["Ignition"]
          );
          const charging = coerceBool((livePosition as any)?.charging ?? attrs.charging ?? attrs.charge);
          const powerVoltage = coerceNumber(
            (livePosition as any)?.power ??
              attrs.power ??
              attrs.externalPower ??
              attrs.voltage ??
              attrs["Power Voltage"]
          );
          const firmwareVersion = String(
            (livePosition as any)?.firmwareVersion ??
              (livePosition as any)?.firmware ??
              attrs.firmwareVersion ??
              attrs.firmware ??
              attrs.fw ??
              ""
          ).trim();
          const movement = (() => {
            if (typeof speed === "number") {
              if (speed <= 1.2) return "stationary" as const;
              if (typeof satellites === "number" && satellites <= 3 && speed < 8) return "stationary" as const;
              if (ignition === false && speed < 8) return "stationary" as const;
              return "moving" as const;
            }
            if (ignition === false) return "stationary" as const;
            return "unknown" as const;
          })();

          const at = pickTraccarPositionAt(livePosition) || String((latest as any)?.at ?? "").trim() || new Date().toISOString();
          latest = {
            at,
            ignition: typeof ignition === "boolean" ? ignition : (latest as any)?.ignition,
            powerVoltage: typeof powerVoltage === "number" ? powerVoltage : (latest as any)?.powerVoltage,
            satellites: typeof satellites === "number" ? satellites : (latest as any)?.satellites,
            charging: typeof charging === "boolean" ? charging : (latest as any)?.charging,
            firmwareVersion: firmwareVersion || (latest as any)?.firmwareVersion,
            lat: typeof lat === "number" ? lat : (latest as any)?.lat,
            lng: typeof lng === "number" ? lng : (latest as any)?.lng,
            speed: typeof speed === "number" ? speed : (latest as any)?.speed,
            heading: typeof heading === "number" ? heading : (latest as any)?.heading,
            movement: movement || (latest as any)?.movement || "unknown"
          } as any;
        }
      }

      if (latest !== undefined) {
        const assetRecord = assets?.[0] as any;
        const ignitionOnAt = assetRecord?.ignitionOnAt;
        if (ignitionOnAt) (latest as any).ignitionOnAt = ignitionOnAt;
      }

      const payload = {
        imei,
        tenantId: tenant,
        assets,
        events: events.map((e: any) => ({ ...(e.data || {}), created_at: e.created_at })),
        latest
      };

      if (!refreshLiveRequested) {
        await writeCachedJson(cacheKey, payload);
      }

      res.json(payload);
    } catch (e: any) {
      res.status(500).json({ error: "Telemetry lookup failed", message: e?.message ?? String(e) });
    }
  });

  app.get("/telemetry/history", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenantHint = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const imei = String(req.query.imei ?? "").trim();
    const tenant = tenantHint || (imei ? findTenantForImeiWithDefault(imei, "default") : "default");
    const assetId = String(req.query.assetId ?? "").trim();
    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();
    const includeArchive = String(req.query.includeArchive ?? "false").trim().toLowerCase() === "true";
    const includeArchivePayload = String(req.query.includeArchivePayload ?? "false").trim().toLowerCase() === "true";
    const limitRaw = Number(req.query.limit ?? 500);
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 500, 5000));
    const cacheKey = `vivi:${tenant}:telemetry:history:${cachePart(imei)}:${cachePart(assetId)}:${cachePart(from)}:${cachePart(to)}:${limit}:${includeArchive ? 1 : 0}:${includeArchivePayload ? 1 : 0}`;

    if (!includeArchivePayload) {
      const cached = await readCachedJson(cacheKey);
      if (cached) return res.json(cached);
    }

    try {
      const rows = await readEventRows({ tenantId: tenant, imei, assetId, from, to, limit });

      const events = rows.map((row: any) => {
        const parsed = parseStoredJson(row.data);
        return {
          id: String(row.id ?? ""),
          assetId: String(row.asset_id ?? ""),
          imei: String(row.imei ?? ""),
          createdAt: String(row.created_at ?? ""),
          data: parsed,
        };
      });

      let archives: any[] = [];
      if (includeArchive) {
        const pgArchiveRows = await postgresTelemetryMirror?.readTelemetryArchives({ tenantId: tenant, imei, assetId, from, to, limit });
        const archiveRows = pgArchiveRows && pgArchiveRows.length
          ? pgArchiveRows
          : db
              .prepare(`SELECT event_id, asset_id, imei, created_at, storage, storage_key, content_type, size_bytes FROM telemetry_archives WHERE tenant_id = ?${imei ? " AND imei = ?" : ""}${assetId ? " AND asset_id = ?" : ""}${from ? " AND created_at >= ?" : ""}${to ? " AND created_at <= ?" : ""} ORDER BY created_at DESC LIMIT ${limit}`)
              .all(...[tenant, ...(imei ? [imei] : []), ...(assetId ? [assetId] : []), ...(from ? [from] : []), ...(to ? [to] : [])]);

        if (includeArchivePayload) {
          const maxWithPayload = Math.min(50, archiveRows.length);
          const enriched: any[] = [];
          for (let i = 0; i < maxWithPayload; i += 1) {
            const row = archiveRows[i];
            const payload = await readTelemetryArchivePayload(row);
            enriched.push({
              eventId: String(row.event_id ?? ""),
              assetId: String(row.asset_id ?? ""),
              imei: String(row.imei ?? ""),
              createdAt: String(row.created_at ?? ""),
              storage: String(row.storage ?? ""),
              storageKey: String(row.storage_key ?? ""),
              contentType: String(row.content_type ?? "application/json"),
              sizeBytes: Number(row.size_bytes ?? 0),
              payload,
            });
          }
          archives = enriched;
        } else {
          archives = archiveRows.map((row: any) => ({
            eventId: String(row.event_id ?? ""),
            assetId: String(row.asset_id ?? ""),
            imei: String(row.imei ?? ""),
            createdAt: String(row.created_at ?? ""),
            storage: String(row.storage ?? ""),
            storageKey: String(row.storage_key ?? ""),
            contentType: String(row.content_type ?? "application/json"),
            sizeBytes: Number(row.size_bytes ?? 0),
          }));
        }
      }

      const payload = {
        tenantId: tenant,
        filters: { imei, assetId, from, to, limit },
        counts: { events: events.length, archives: archives.length },
        events,
        ...(includeArchive ? { archives } : {}),
      };

      if (!includeArchivePayload) {
        await writeCachedJson(cacheKey, payload);
      }

      res.json(payload);
    } catch (e: any) {
      res.status(500).json({ error: "Telemetry history lookup failed", message: e?.message ?? String(e) });
    }
  });

  app.get("/telemetry/archive/:eventId", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const eventId = String(req.params.eventId ?? "").trim();
    if (!eventId) return res.status(400).json({ error: "eventId is required" });

    try {
      const row = db
        .prepare("SELECT event_id, asset_id, imei, created_at, storage, storage_key, content_type, size_bytes FROM telemetry_archives WHERE tenant_id = ? AND event_id = ? LIMIT 1")
        .get(tenant, eventId);
      if (!row) return res.status(404).json({ error: "Archive not found" });
      const payload = await readTelemetryArchivePayload(row);
      if (!payload) return res.status(404).json({ error: "Archive payload unavailable" });
      res.json({
        eventId: String(row.event_id ?? ""),
        tenantId: tenant,
        assetId: String(row.asset_id ?? ""),
        imei: String(row.imei ?? ""),
        createdAt: String(row.created_at ?? ""),
        storage: String(row.storage ?? ""),
        storageKey: String(row.storage_key ?? ""),
        contentType: String(row.content_type ?? "application/json"),
        sizeBytes: Number(row.size_bytes ?? 0),
        payload,
      });
    } catch (e: any) {
      res.status(500).json({ error: "Telemetry archive read failed", message: e?.message ?? String(e) });
    }
  });
}
