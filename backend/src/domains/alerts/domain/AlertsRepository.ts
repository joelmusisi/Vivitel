import type { AlertRecord } from "./Alert";

export interface AlertsRepository {
  listByTenant(tenantId: string): AlertRecord[];
  upsert(tenantId: string, alertId: string, payload: AlertRecord, updatedAt: string): void;
  deleteByTenantAndId(tenantId: string, alertId: string): boolean;
}
