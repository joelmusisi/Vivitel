import type { Express, Request, Response } from "express";

interface RegisterAssetRoutesDeps {
  app: Express;
  db: any;
  requireApiKey: (req: Request, res: Response) => boolean;
  readTenant: (req: Request) => { raw: string; tenant: string };
  normalizeAssetIdsForTenant: (tenant: string) => void;
  parseStoredJson: (text: string) => any;
  normalizeNumber: (value: unknown) => number | null;
  readAssetById: (tenant: string, id: string, raw?: string) => any;
  findExistingAssetIdByImei: (tenant: string, imei: string) => string;
  upsertAsset: (tenant: string, id: string, patch: Record<string, unknown>) => any;
  deleteMatchingAssets: (
    tenants: string[],
    opts: { id?: string; imei?: string; registration?: string }
  ) => { deleted: boolean; id: string };
  findGlobalAssetIdentityConflict: (
    field: "imei" | "cameraSerial",
    value: string,
    allowedIds: string[],
    allowedTenants: string[]
  ) => { inUse: boolean; id?: string; tenantId?: string };
  listConfigGroups: (tenant: string) => any[];
  resolveByNameOrId: (groups: any[], value: string) => any;
  listAssetIdsForTenant: (tenant: string, raw?: string) => number[];
  nextAvailableNumericId: (usedIds: number[]) => number;
  cache: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
    del: (...keys: string[]) => Promise<void>;
  };
  cacheTtlSeconds: number;
}

export function registerAssetRoutes(deps: RegisterAssetRoutesDeps): void {
  const {
    app,
    db,
    requireApiKey,
    readTenant,
    normalizeAssetIdsForTenant,
    parseStoredJson,
    normalizeNumber,
    readAssetById,
    findExistingAssetIdByImei,
    upsertAsset,
    deleteMatchingAssets,
    findGlobalAssetIdentityConflict,
    listConfigGroups,
    resolveByNameOrId,
    listAssetIdsForTenant,
    nextAvailableNumericId,
    cache,
    cacheTtlSeconds,
  } = deps;

  app.get("/d1/assets", async (req, res) => {
    const { raw, tenant } = readTenant(req);
    const cacheKey = `vivi:${tenant}:${raw ?? ""}:assets`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    normalizeAssetIdsForTenant(tenant);
    const stmt = raw && raw !== tenant
      ? db.prepare("SELECT data, updated_at, created_at FROM assets WHERE tenant_id = ? OR tenant_id = ? ORDER BY updated_at DESC")
      : db.prepare("SELECT data, updated_at, created_at FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC");
    const rows = raw && raw !== tenant ? stmt.all(tenant, raw) : stmt.all(tenant);
    const assets = rows
      .map((r: any) => {
        const parsed = parseStoredJson(r.data);
        if (!parsed || typeof parsed !== "object") return null;
        return {
          ...(parsed as any),
          updated_at: String(r.updated_at ?? "").trim() || undefined,
          created_at: String(r.created_at ?? "").trim() || undefined
        };
      })
      .filter(Boolean);

    const payload = { assets, tenantId: tenant };
    await cache.set(cacheKey, JSON.stringify(payload), cacheTtlSeconds);
    res.json(payload);
  });

  app.get("/d1/assets/duplicate-check", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req);
    const imei = String(req.query.imei ?? "").trim();
    const cameraSerial = String(req.query.cameraSerial ?? "").trim();
    const excludeId = String(req.query.excludeId ?? "").trim();
    const allowedIds = excludeId ? [excludeId] : [];
    const allowedTenants = [tenant, raw].filter(Boolean) as string[];

    const imeiConflict = findGlobalAssetIdentityConflict("imei", imei, allowedIds, allowedTenants);
    const cameraConflict = findGlobalAssetIdentityConflict("cameraSerial", cameraSerial, allowedIds, allowedTenants);

    res.json({
      duplicateImei: Boolean(imeiConflict.inUse),
      duplicateCameraSerial: Boolean(cameraConflict.inUse),
      message: imeiConflict.inUse || cameraConflict.inUse ? "Device IMEI in use" : "",
      details: {
        imei: imeiConflict.inUse ? { id: imeiConflict.id ?? "", tenantId: imeiConflict.tenantId ?? "" } : null,
        cameraSerial: cameraConflict.inUse ? { id: cameraConflict.id ?? "", tenantId: cameraConflict.tenantId ?? "" } : null
      }
    });
  });

  app.get("/d1/assets/anchors", (req, res) => {
    const { raw, tenant } = readTenant(req);
    const stmt = raw && raw !== tenant
      ? db.prepare("SELECT data FROM assets WHERE tenant_id = ? OR tenant_id = ? ORDER BY updated_at DESC")
      : db.prepare("SELECT data FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC");
    const rows = raw && raw !== tenant ? stmt.all(tenant, raw) : stmt.all(tenant);

    const anchors = (rows as any[])
      .map((r) => {
        const parsed = parseStoredJson(r.data) ?? {};
        if (!parsed || typeof parsed !== "object") return null;
        const anchorLat = normalizeNumber((parsed as any).anchorLat ?? (parsed as any).anchorLatitude ?? (parsed as any).lat ?? (parsed as any).latitude);
        const anchorLng = normalizeNumber((parsed as any).anchorLng ?? (parsed as any).anchorLongitude ?? (parsed as any).lng ?? (parsed as any).lon ?? (parsed as any).longitude);
        if (anchorLat === null || anchorLng === null) return null;
        return {
          id: String((parsed as any).id ?? "").trim(),
          assetId: Number((parsed as any).assetId ?? Number.NaN),
          imei: String((parsed as any).imei ?? "").trim(),
          anchorLat,
          anchorLng,
          lastSeen: String((parsed as any).lastSeen ?? "").trim() || undefined,
          lastPosition: String((parsed as any).lastPosition ?? "").trim() || undefined
        };
      })
      .filter(Boolean);

    res.json({ tenantId: tenant, anchors });
  });

  app.get("/d1/assets/anchors/:id", (req, res) => {
    const { raw, tenant } = readTenant(req);
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const record = readAssetById(tenant, id, raw);
    if (!record) return res.status(404).json({ error: "Anchor not found" });

    const anchorLat = normalizeNumber((record as any).anchorLat ?? (record as any).anchorLatitude ?? (record as any).lat ?? (record as any).latitude);
    const anchorLng = normalizeNumber((record as any).anchorLng ?? (record as any).anchorLongitude ?? (record as any).lng ?? (record as any).lon ?? (record as any).longitude);
    if (anchorLat === null || anchorLng === null) return res.status(404).json({ error: "Anchor not set" });

    res.json({
      tenantId: tenant,
      anchor: {
        id: String((record as any).id ?? "").trim(),
        assetId: Number((record as any).assetId ?? Number.NaN),
        imei: String((record as any).imei ?? "").trim(),
        anchorLat,
        anchorLng,
        anchorRadiusMeters: normalizeNumber((record as any).anchorRadiusMeters),
        anchorName: String((record as any).anchorName ?? "").trim() || undefined,
        lastSeen: String((record as any).lastSeen ?? "").trim() || undefined,
        lastPosition: String((record as any).lastPosition ?? "").trim() || undefined
      }
    });
  });

  app.post("/d1/assets/anchors", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { tenant } = readTenant(req);
    const body = req.body ?? {};

    let id = String((body as any).id ?? (body as any).assetId ?? (body as any).imei ?? "").trim();
    if (!id) return res.status(400).json({ error: "id | assetId | imei is required" });

    if (!String((body as any).id ?? "").trim() && String((body as any).imei ?? "").trim()) {
      const candidate = findExistingAssetIdByImei(tenant, String((body as any).imei ?? "").trim());
      if (candidate) id = candidate;
    }

    const anchorLat = normalizeNumber((body as any).anchorLat ?? (body as any).anchorLatitude ?? (body as any).lat ?? (body as any).latitude);
    const anchorLng = normalizeNumber((body as any).anchorLng ?? (body as any).anchorLongitude ?? (body as any).lng ?? (body as any).lon ?? (body as any).longitude);
    if (anchorLat === null || anchorLng === null) return res.status(400).json({ error: "anchorLat and anchorLng are required" });

    const payload: Record<string, unknown> = {
      anchorLat,
      anchorLng,
      ...(typeof (body as any).anchorRadiusMeters !== "undefined" ? { anchorRadiusMeters: normalizeNumber((body as any).anchorRadiusMeters) ?? (body as any).anchorRadiusMeters } : {}),
      ...(typeof (body as any).anchorName !== "undefined" ? { anchorName: String((body as any).anchorName ?? "").trim() } : {})
    };
    if (String((body as any).imei ?? "").trim()) payload.imei = String((body as any).imei ?? "").trim();

    const updated = upsertAsset(tenant, id, payload);
    res.status(201).json({ tenantId: tenant, anchor: updated });
  });

  app.put("/d1/assets/anchors/:id", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req);
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const existing = readAssetById(tenant, id, raw);
    if (!existing) return res.status(404).json({ error: "Anchor not found" });

    const body = req.body ?? {};
    const anchorLat = normalizeNumber((body as any).anchorLat ?? (body as any).anchorLatitude ?? (body as any).lat ?? (body as any).latitude);
    const anchorLng = normalizeNumber((body as any).anchorLng ?? (body as any).anchorLongitude ?? (body as any).lng ?? (body as any).lon ?? (body as any).longitude);
    if (anchorLat === null || anchorLng === null) return res.status(400).json({ error: "anchorLat and anchorLng are required" });

    const payload: Record<string, unknown> = {
      ...(existing as Record<string, unknown>),
      anchorLat,
      anchorLng,
      ...(typeof (body as any).anchorRadiusMeters !== "undefined" ? { anchorRadiusMeters: normalizeNumber((body as any).anchorRadiusMeters) ?? (body as any).anchorRadiusMeters } : {}),
      ...(typeof (body as any).anchorName !== "undefined" ? { anchorName: String((body as any).anchorName ?? "").trim() } : {})
    };

    const updated = upsertAsset(tenant, id, payload);
    res.json({ tenantId: tenant, anchor: updated });
  });

  app.delete("/d1/assets/anchors/:id", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req);
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const existing = readAssetById(tenant, id, raw);
    if (!existing) return res.status(404).json({ error: "Anchor not found" });

    const next = { ...(existing as Record<string, unknown>) };
    delete next.anchorLat;
    delete next.anchorLng;
    delete next.anchorRadiusMeters;
    delete next.anchorName;

    upsertAsset(tenant, id, next);
    res.json({ tenantId: tenant, deleted: true, id });
  });

  app.post("/d1/assets", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req);
    const body = req.body ?? {};
    const imei = String((body as any).imei ?? "").trim();
    const cameraSerial = String((body as any).cameraSerial ?? "").trim();
    const registration = String((body as any).registration ?? "").trim();
    const requestedId = String((body as any).id ?? (body as any).assetId ?? (body as any).registration ?? (body as any).cameraSerial ?? "").trim();
    const allowedIds = requestedId ? [requestedId] : [];
    const allowedTenants = [tenant, raw].filter(Boolean) as string[];

    const imeiConflict = findGlobalAssetIdentityConflict("imei", imei, allowedIds, allowedTenants);
    if (imeiConflict.inUse) {
      return res.status(409).json({
        error: "Device IMEI in use",
        field: "imei",
        duplicateId: imeiConflict.id ?? "",
        duplicateTenantId: imeiConflict.tenantId ?? ""
      });
    }

    const cameraSerialConflict = findGlobalAssetIdentityConflict("cameraSerial", cameraSerial, allowedIds, allowedTenants);
    if (cameraSerialConflict.inUse) {
      return res.status(409).json({
        error: "Device IMEI in use",
        field: "cameraSerial",
        duplicateId: cameraSerialConflict.id ?? "",
        duplicateTenantId: cameraSerialConflict.tenantId ?? ""
      });
    }

    const findExistingIdByImeiOrCameraSerialOrReg = (): string => {
      try {
        const rows = raw && raw !== tenant
          ? db.prepare("SELECT data FROM assets WHERE tenant_id = ? OR tenant_id = ? ORDER BY updated_at DESC").all(tenant, raw)
          : db.prepare("SELECT data FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC").all(tenant);

        const parsedRows = rows
          .map((row: any) => parseStoredJson(row?.data))
          .filter((row: any) => row && typeof row === "object");

        const findBy = (field: "imei" | "cameraSerial" | "registration", value: string) => {
          const needle = String(value ?? "").trim().toLowerCase();
          if (!needle) return "";
          const match = parsedRows.find((row: any) => String((row as any)?.[field] ?? "").trim().toLowerCase() === needle);
          return String((match as any)?.id ?? "").trim();
        };

        return findBy("imei", imei) || findBy("cameraSerial", cameraSerial) || findBy("registration", registration);
      } catch {
        // ignore
      }
      return "";
    };

    let id = requestedId;
    const matchId = findExistingIdByImeiOrCameraSerialOrReg();
    if (matchId) {
      id = matchId;
    } else if (id) {
      try {
        const existingById = raw && raw !== tenant
          ? db.prepare("SELECT data FROM assets WHERE (tenant_id = ? OR tenant_id = ?) AND id = ? ORDER BY updated_at DESC LIMIT 1").get(tenant, raw, id)
          : db.prepare("SELECT data FROM assets WHERE tenant_id = ? AND id = ?").get(tenant, id);
        if (!existingById?.data) {
          // keep provided id for brand new assets only
        }
      } catch {
        // ignore
      }
    }

    if (!id) return res.status(400).json({ error: "id is required" });
    const now = new Date().toISOString();
    const configGroup = String((body as any).configGroup ?? "").trim();
    if (!configGroup) return res.status(400).json({ error: "Configuration group is required." });

    if (configGroup) {
      const groups = listConfigGroups(tenant);
      const fallbackGroups = raw && raw !== tenant ? listConfigGroups(raw) : [];
      let group = resolveByNameOrId(groups.length ? groups : fallbackGroups, configGroup);
      if (!group) {
        return res.status(400).json({ error: "Configuration group not found." });
      }
    }

    let existingNumericAssetId = 0;
    try {
      const existingById = raw && raw !== tenant
        ? db.prepare("SELECT data FROM assets WHERE (tenant_id = ? OR tenant_id = ?) AND id = ? ORDER BY updated_at DESC LIMIT 1").get(tenant, raw, id)
        : db.prepare("SELECT data FROM assets WHERE tenant_id = ? AND id = ? ORDER BY updated_at DESC LIMIT 1").get(tenant, id);
      const parsedExisting = existingById?.data ? parseStoredJson(existingById.data) : null;
      const n = Number((parsedExisting as any)?.assetId ?? 0);
      if (n > 0) existingNumericAssetId = Math.floor(n);
    } catch {
      // ignore
    }

    const usedAssetIds = listAssetIdsForTenant(tenant, raw);
    const isExistingIdUnique = existingNumericAssetId > 0 && usedAssetIds.filter((n) => n === existingNumericAssetId).length <= 1;
    const assetId = isExistingIdUnique ? existingNumericAssetId : nextAvailableNumericId(usedAssetIds);
    upsertAsset(tenant, id, { ...body, id, assetId });
    normalizeAssetIdsForTenant(tenant);
    const saved = db.prepare("SELECT data FROM assets WHERE tenant_id = ? AND id = ? ORDER BY updated_at DESC LIMIT 1").get(tenant, id);
    const savedParsed = saved?.data ? parseStoredJson(saved.data) : null;
    const finalAssetId = Number((savedParsed as any)?.assetId ?? assetId);

    await cache.del(`vivi:${tenant}:${raw ?? ""}:assets`, `vivi:${raw ?? ""}:${tenant}:assets`);
    res.json({ stored: true, id, tenantId: tenant, assetId: finalAssetId });
  });

  app.delete("/d1/assets", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req);
    const id = String(req.query.id ?? "").trim();
    const imei = String(req.query.imei ?? "").trim();
    const registration = String(req.query.registration ?? "").trim();
    if (!id && !imei && !registration) {
      return res.status(400).json({ error: "Asset id, imei, or registration is required." });
    }
    const result = deleteMatchingAssets([tenant, raw].filter(Boolean) as string[], { id, imei, registration });
    await cache.del(`vivi:${tenant}:${raw ?? ""}:assets`, `vivi:${raw ?? ""}:${tenant}:assets`);
    if (!result.deleted) {
      return res.status(404).json({
        deleted: false,
        id: id || imei || registration,
        tenantId: tenant,
        message: "Asset not found for delete criteria."
      });
    }
    res.json({ deleted: true, id: result.id, tenantId: tenant });
  });
}
