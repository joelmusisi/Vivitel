import { withAssetStoragePrefix } from "../../../shared/assetStoragePaths";

interface SqliteDbLike {
  prepare(query: string): {
    get: (...params: any[]) => any;
    all: (...params: any[]) => any[];
    run: (...params: any[]) => any;
  };
}

export function createAssetServices(deps: {
  db: SqliteDbLike;
  parseStoredJson: (value: unknown) => any;
  postgresMirror?: {
    mirrorAssetUpsert: (args: { tenantId: string; assetId: string; updatedAt: string; assetData: Record<string, unknown> }) => Promise<void>;
  } | null;
}) {
  const { db, parseStoredJson, postgresMirror } = deps;

  function findExistingAssetIdByImei(tenant: string, imei: string): string {
    const clean = String(imei ?? "").trim();
    if (!clean) return "";
    try {
      const row = db
        .prepare("SELECT data FROM assets WHERE tenant_id = ? AND data LIKE ? ORDER BY updated_at DESC LIMIT 1")
        .get(tenant, `%\"imei\":\"${clean}\"%`);
      const parsed: any = row?.data ? parseStoredJson(row.data) : null;
      const direct = String(parsed?.id ?? "").trim();
      if (direct) return direct;

      const rows = db
        .prepare("SELECT data FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC")
        .all(tenant);
      for (const candidate of rows as any[]) {
        const item: any = candidate?.data ? parseStoredJson(candidate.data) : null;
        if (!item) continue;
        const itemImei = String(item?.imei ?? "").trim();
        if (itemImei && itemImei === clean) {
          const id = String(item?.id ?? "").trim();
          if (id) return id;
        }
      }
      return "";
    } catch {
      return "";
    }
  }

  function readAssetById(tenant: string, id: string, rawTenant?: string) {
    if (!id) return null;
    const normalizedTenant = tenant || "";
    const raw = String(rawTenant ?? "").trim();
    try {
      const stmt = raw && raw !== normalizedTenant
        ? db.prepare("SELECT data FROM assets WHERE (tenant_id = ? OR tenant_id = ?) AND id = ? ORDER BY updated_at DESC LIMIT 1")
        : db.prepare("SELECT data FROM assets WHERE tenant_id = ? AND id = ? ORDER BY updated_at DESC LIMIT 1");
      const row = raw && raw !== normalizedTenant ? stmt.get(normalizedTenant, raw, id) : stmt.get(normalizedTenant, id);
      if (!row?.data) return null;
      const parsed = parseStoredJson(row.data);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function upsertAsset(tenant: string, id: string, payload: Record<string, unknown>) {
    const now = new Date().toISOString();
    const existing = readAssetById(tenant, id) ?? {};
    const next = withAssetStoragePrefix(tenant, { ...(existing as Record<string, unknown>), ...payload, id });
    try {
      db.prepare("INSERT OR REPLACE INTO assets (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)").run(id, tenant, JSON.stringify(next), now);
    } catch {
      // ignore failures
    }
    void postgresMirror?.mirrorAssetUpsert({ tenantId: tenant, assetId: id, updatedAt: now, assetData: next });
    return next;
  }

  function deleteMatchingAssets(
    tenants: string[],
    opts: { id?: string; imei?: string; registration?: string }
  ): { deleted: boolean; id: string } {
    const tenantIds = [...new Set(tenants.map((value) => String(value ?? "").trim()).filter(Boolean))];
    const wantedId = String(opts.id ?? "").trim();
    const wantedImei = String(opts.imei ?? "").trim();
    const wantedRegistration = String(opts.registration ?? "").trim();
    if (!tenantIds.length || (!wantedId && !wantedImei && !wantedRegistration)) {
      return { deleted: false, id: "" };
    }

    const matches: Array<{ tenantId: string; id: string }> = [];
    for (const tenantId of tenantIds) {
      let rows: any[] = [];
      try {
        rows = db.prepare("SELECT id, data FROM assets WHERE tenant_id = ?").all(tenantId);
      } catch {
        continue;
      }
      for (const row of rows) {
        const parsed = row?.data ? parseStoredJson(row.data) : null;
        const storedId = String(row?.id ?? "").trim();
        const rowId = String(parsed?.id ?? storedId).trim();
        const rowImei = String(parsed?.imei ?? "").trim();
        const rowRegistration = String(parsed?.registration ?? "").trim();
        const hit =
          (wantedId && (rowId === wantedId || storedId === wantedId)) ||
          (wantedImei && rowImei === wantedImei) ||
          (wantedRegistration && rowRegistration === wantedRegistration);
        const deleteId = storedId || rowId;
        if (!hit || !deleteId) continue;
        matches.push({ tenantId, id: deleteId });
      }
    }

    let deletedId = "";
    for (const match of matches) {
      try {
        const result = db.prepare("DELETE FROM assets WHERE tenant_id = ? AND id = ?").run(match.tenantId, match.id);
        if (Number(result?.changes ?? 0) > 0 && !deletedId) deletedId = match.id;
      } catch {
        // try the remaining matches
      }
    }
    return { deleted: Boolean(deletedId), id: deletedId };
  }

  function findGlobalAssetIdentityConflict(
    field: "imei" | "cameraSerial",
    valueRaw: string,
    allowedIds: string[],
    allowedTenants: string[]
  ): { inUse: boolean; id?: string; tenantId?: string } {
    const needle = String(valueRaw ?? "").trim().toLowerCase();
    if (!needle) return { inUse: false };
    try {
      const idSet = new Set((allowedIds ?? []).map((value) => String(value ?? "").trim()).filter(Boolean));
      const tenantSet = new Set((allowedTenants ?? []).map((value) => String(value ?? "").trim()).filter(Boolean));
      const rows = db.prepare("SELECT id, tenant_id, data FROM assets ORDER BY updated_at DESC").all();
      for (const row of rows as any[]) {
        const parsed = parseStoredJson(row?.data);
        if (!parsed || typeof parsed !== "object") continue;
        const rowId = String((parsed as any)?.id ?? row?.id ?? "").trim();
        const rowTenantId = String(row?.tenant_id ?? "").trim();
        const rowValue = String((parsed as any)?.[field] ?? "").trim().toLowerCase();
        if (!rowValue || rowValue !== needle) continue;
        const isSameEditableRecord = Boolean(rowId && idSet.has(rowId) && (!rowTenantId || tenantSet.has(rowTenantId)));
        if (isSameEditableRecord) continue;
        return { inUse: true, id: rowId, tenantId: rowTenantId };
      }
    } catch {
      // ignore read failures and treat as no conflict
    }
    return { inUse: false };
  }

  return {
    findExistingAssetIdByImei,
    readAssetById,
    upsertAsset,
    deleteMatchingAssets,
    findGlobalAssetIdentityConflict,
  };
}