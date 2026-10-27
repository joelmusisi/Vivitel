// Global state - initialized by vps_server.ts
declare let db: any;
declare let Database: any;
declare let _inMemoryBindings: Record<string, Record<string, any[]>>;

const scopedMemory = (tenant: string) => {
  const key = String(tenant ?? "").trim() || "default";
  if (!_inMemoryBindings[key]) _inMemoryBindings[key] = {};
  return _inMemoryBindings[key];
};

export const readLatestTelemetryAt = (tenant?: string) => {
  try {
    const t = String(tenant ?? "").trim();
    const row = t
      ? db.prepare("SELECT created_at FROM telemetry_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1").get(t)
      : db.prepare("SELECT created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 1").get();
    const at = String(row?.created_at ?? "").trim();
    return at || null;
  } catch {
    return null;
  }
};

export const readTelemetryCount = (tenant?: string) => {
  try {
    const t = String(tenant ?? "").trim();
    const row = t
      ? db.prepare("SELECT COUNT(1) AS c FROM telemetry_events WHERE tenant_id = ?").get(t)
      : db.prepare("SELECT COUNT(1) AS c FROM telemetry_events").get();
    const c = Number((row as any)?.c ?? 0);
    return Number.isFinite(c) ? c : 0;
  } catch {
    return 0;
  }
};

function bindingNameSiteKey(type: string, rec: any) {
  const name = String(rec?.name ?? "").trim().toLowerCase();
  if (!name) return "";
  const site = String(rec?.site ?? "").trim().toLowerCase();
  const bindingType = String(type ?? "").trim().toLowerCase();
  if (bindingType === "notifications" || bindingType === "locations" || bindingType === "devices") {
    return site ? `${site}::${name}` : `::${name}`;
  }
  return `${bindingType}::${name}`;
}

function dedupeBindingRecords(type: string, rows: any[]) {
  const byKey = new Map<string, any>();
  for (const row of rows ?? []) {
    const key = bindingNameSiteKey(type, row);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    const prevEvents = Array.isArray(prev.monitoredEvents) ? prev.monitoredEvents.length : 0;
    const nextEvents = Array.isArray(row.monitoredEvents) ? row.monitoredEvents.length : 0;
    byKey.set(key, nextEvents >= prevEvents ? row : prev);
  }
  return [...byKey.values()];
}

export function loadBindingsFromDb(type?: string, tenant = "default") {
  const tenantId = String(tenant ?? "").trim() || "default";
  try {
    if (!Database) {
      const store = scopedMemory(tenantId);
      if (!type) {
        return Object.entries(store).flatMap(([bindingType, arr]) =>
          (arr || []).map((r: any) => ({ type: bindingType, ...(r || {}) }))
        );
      }
      return dedupeBindingRecords(type, (store[type] || []).map((r: any) => ({ type, ...(r || {}) })));
    }
    const stmt = type
      ? db.prepare("SELECT type, id, data FROM bindings WHERE tenant_id = ? AND type = ?")
      : db.prepare("SELECT type, id, data FROM bindings WHERE tenant_id = ?");
    const rows = type ? stmt.all(tenantId, type) : stmt.all(tenantId);
    const parsed = rows.map((r: any) => ({ type: r.type, id: r.id, ...(r.data ? JSON.parse(r.data) : {}) }));
    return type ? dedupeBindingRecords(type, parsed) : parsed;
  } catch {
    return [];
  }
}

export function persistBindingToDb(type: string, rec: any, tenant = "default") {
  const tenantId = String(tenant ?? "").trim() || "default";
  const now = new Date().toISOString();
  const key = bindingNameSiteKey(type, rec);
  try {
    if (!Database) {
      const store = scopedMemory(tenantId);
      const arr = store[type] || [];
      let idx = arr.findIndex((r: any) => String(r.id ?? "") === String(rec.id ?? ""));
      if (idx < 0 && key) {
        idx = arr.findIndex((r: any) => bindingNameSiteKey(type, r) === key);
        if (idx >= 0) rec.id = arr[idx].id;
      }
      if (idx >= 0) arr[idx] = { ...arr[idx], ...rec };
      else arr.push(rec);
      store[type] = dedupeBindingRecords(type, arr);
      return;
    }
    if (key) {
      const rows = db.prepare("SELECT id, data FROM bindings WHERE tenant_id = ? AND type = ?").all(tenantId, type);
      for (const row of rows) {
        if (String(row.id) === String(rec.id)) continue;
        try {
          const parsed = row.data ? JSON.parse(row.data) : {};
          if (bindingNameSiteKey(type, parsed) === key) {
            rec.id = row.id;
            break;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
    db.prepare(
      "INSERT OR REPLACE INTO bindings (id, tenant_id, type, data, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(rec.id, tenantId, type, JSON.stringify(rec), now);
    if (key) {
      const rows = db.prepare("SELECT id, data FROM bindings WHERE tenant_id = ? AND type = ?").all(tenantId, type);
      for (const row of rows) {
        if (String(row.id) === String(rec.id)) continue;
        try {
          const parsed = row.data ? JSON.parse(row.data) : {};
          if (bindingNameSiteKey(type, parsed) === key) {
            db.prepare("DELETE FROM bindings WHERE tenant_id = ? AND type = ? AND id = ?").run(tenantId, type, row.id);
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (e) {
    console.warn("persistBindingToDb failed", e);
  }
}

export function deleteBindingFromDb(type: string, id: string, tenant = "default") {
  const tenantId = String(tenant ?? "").trim() || "default";
  try {
    if (!Database) {
      const store = scopedMemory(tenantId);
      const arr = store[type] || [];
      store[type] = arr.filter((r: any) => String(r.id ?? "") !== String(id ?? ""));
      return;
    }
    db.prepare("DELETE FROM bindings WHERE tenant_id = ? AND type = ? AND id = ?").run(tenantId, type, id);
  } catch (e) {
    console.warn("deleteBindingFromDb failed", e);
  }
}

export function deleteAllBindingsForTenant(tenant = "default", type?: string) {
  const tenantId = String(tenant ?? "").trim() || "default";
  try {
    if (!Database) {
      const store = scopedMemory(tenantId);
      if (type) {
        const count = Array.isArray(store[type]) ? store[type].length : 0;
        store[type] = [];
        return count;
      }
      let count = 0;
      for (const key of Object.keys(store)) {
        count += Array.isArray(store[key]) ? store[key].length : 0;
        store[key] = [];
      }
      return count;
    }
    if (type) {
      const result = db.prepare("DELETE FROM bindings WHERE tenant_id = ? AND type = ?").run(tenantId, type);
      return Number(result?.changes ?? 0) || 0;
    }
    const result = db.prepare("DELETE FROM bindings WHERE tenant_id = ?").run(tenantId);
    return Number(result?.changes ?? 0) || 0;
  } catch (e) {
    console.warn("deleteAllBindingsForTenant failed", e);
    return 0;
  }
}

export function purgeBindingsForTenant(tenant: string, type: string) {
  return deleteAllBindingsForTenant(tenant, type);
}
