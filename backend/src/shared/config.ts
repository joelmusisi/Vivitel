import { parseStoredJson } from "./json";

// Global state - initialized by vps_server.ts
declare let db: any;
declare let Database: any;
declare let _inMemoryBindings: Record<string, Record<string, any[]>>;

export const listConfigGroups = (tenant: string) => {
  const rows = db.prepare("SELECT data FROM configuration_groups WHERE tenant_id = ? ORDER BY updated_at DESC").all(tenant);
  return rows.map((r: any) => parseStoredJson(r.data)).filter(Boolean);
};

export const listBindings = (tenant: string, type: string) => {
  const tenantId = String(tenant ?? "").trim() || "default";
  if (!Database) {
    const scoped = _inMemoryBindings[tenantId] || {};
    return (scoped[type] || []).map((r: any) => ({ type, ...(r || {}) }));
  }
  const rows = db.prepare("SELECT data FROM bindings WHERE tenant_id = ? AND type = ? ORDER BY updated_at DESC").all(tenantId, type);
  return rows.map((r: any) => JSON.parse(r.data));
};

export const getDeviceReportingSettings = (tenant: string) => {
  const row = db.prepare("SELECT data FROM device_reporting_settings WHERE tenant_id = ?").get(tenant);
  return row ? parseStoredJson(row.data) : null;
};

export const getBaseArtifact = (tenant: string, type: string) => {
  const row = db
    .prepare("SELECT id, name, version, r2_key, content_type, sha256, is_base, created_at FROM device_artifacts WHERE tenant_id = ? AND type = ? ORDER BY is_base DESC, created_at DESC LIMIT 1")
    .get(tenant, type);
  return row ?? null;
};
