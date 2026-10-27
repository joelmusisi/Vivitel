import { parseStoredJson } from "./json";

// Global state - initialized by vps_server.ts
declare let db: any;

let assetMirror:
  | {
      mirrorAssetUpsert: (args: { tenantId: string; assetId: string; updatedAt: string; assetData: Record<string, unknown> }) => Promise<void>;
    }
  | null = null;

export function configureAssetMirror(mirror: {
  mirrorAssetUpsert: (args: { tenantId: string; assetId: string; updatedAt: string; assetData: Record<string, unknown> }) => Promise<void>;
} | null) {
  assetMirror = mirror;
}

export function nextAvailableNumericId(used: number[]): number {
  const set = new Set(
    used
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.floor(n))
  );
  let candidate = 1;
  while (set.has(candidate)) candidate += 1;
  return candidate;
}

export function listAssetIdsForTenant(tenant: string, rawTenant?: string): number[] {
  try {
    const t = tenant || "";
    const r = String(rawTenant ?? "").trim();
    const rows = r && r !== t
      ? db.prepare("SELECT data FROM assets WHERE tenant_id = ? OR tenant_id = ?").all(t, r)
      : db.prepare("SELECT data FROM assets WHERE tenant_id = ?").all(t);
    const ids: number[] = [];
    for (const row of rows as any[]) {
      try {
        const parsed = JSON.parse(String((row as any).data ?? "{}"));
        const n = Number((parsed as any).assetId ?? 0);
        if (n > 0) ids.push(n);
      } catch {
        // ignore
      }
    }
    return ids;
  } catch {
    return [];
  }
}

export function normalizeAssetIdsForTenant(tenant: string) {
  try {
    const rows = db.prepare("SELECT id, data, updated_at FROM assets WHERE tenant_id = ? ORDER BY updated_at ASC, id ASC").all(tenant) as Array<any>;
    if (!rows.length) return;

    const updates: Array<{ id: string; data: any; updatedAt: string }> = [];
    let nextId = 1;

    for (const row of rows) {
      const id = String(row?.id ?? "").trim();
      if (!id) continue;
      const parsed = parseStoredJson(row?.data) ?? {};
      const current = Number((parsed as any)?.assetId ?? 0);
      const desired = nextId;
      nextId += 1;
      if (!Number.isFinite(current) || Math.floor(current) !== desired) {
        updates.push({
          id,
          data: { ...(parsed as any), id, assetId: desired },
          updatedAt: String(row?.updated_at ?? "") || new Date().toISOString()
        });
      }
    }

    if (!updates.length) return;
    const stmt = db.prepare("INSERT OR REPLACE INTO assets (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)");
    for (const u of updates) {
      stmt.run(u.id, tenant, JSON.stringify(u.data), u.updatedAt);
      void assetMirror?.mirrorAssetUpsert({ tenantId: tenant, assetId: u.id, updatedAt: u.updatedAt, assetData: u.data });
    }
  } catch {
    // ignore normalization failures
  }
}
