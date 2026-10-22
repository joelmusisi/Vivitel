import type { AlertRecord } from "../domain/Alert";
import type { AlertsRepository } from "../domain/AlertsRepository";

interface SqliteDbLike {
  prepare(query: string): {
    all: (...params: any[]) => any[];
    run: (...params: any[]) => { changes?: number };
  };
}

export class SqliteAlertsRepository implements AlertsRepository {
  constructor(private readonly db: SqliteDbLike) {}

  listByTenant(tenantId: string): AlertRecord[] {
    const rows = this.db
      .prepare("SELECT data, updated_at FROM alerts WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 500")
      .all(tenantId);

    return rows
      .map((row: any) => {
        if (typeof row?.data === "string") {
          try {
            return JSON.parse(row.data) as AlertRecord;
          } catch {
            return null;
          }
        }
        return (row?.data ?? null) as AlertRecord | null;
      })
      .filter(Boolean) as AlertRecord[];
  }

  upsert(tenantId: string, alertId: string, payload: AlertRecord, updatedAt: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO alerts (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)")
      .run(alertId, tenantId, JSON.stringify(payload), updatedAt);
  }

  deleteByTenantAndId(tenantId: string, alertId: string): boolean {
    const result = this.db
      .prepare("DELETE FROM alerts WHERE tenant_id = ? AND id = ?")
      .run(tenantId, alertId);

    return Number(result?.changes ?? 0) > 0;
  }
}
