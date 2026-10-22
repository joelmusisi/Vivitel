import type { AlertRecord } from "../domain/Alert";
import type { AlertsRepository } from "../domain/AlertsRepository";

export interface AlertsCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
}

export class AlertsService {
  constructor(
    private readonly repository: AlertsRepository,
    private readonly cache: AlertsCache,
    private readonly cacheTtlSeconds: number,
  ) {}

  private cacheKey(tenantId: string): string {
    return `vivi:${tenantId}:alerts`;
  }

  async list(tenantId: string): Promise<{ alerts: AlertRecord[]; tenantId: string }> {
    const key = this.cacheKey(tenantId);
    const cached = await this.cache.get(key);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { alerts: AlertRecord[]; tenantId: string };
        if (parsed && Array.isArray(parsed.alerts)) return parsed;
      } catch {
        // Ignore malformed cache payload and rebuild from DB.
      }
    }

    const payload = { alerts: this.repository.listByTenant(tenantId), tenantId };
    await this.cache.set(key, JSON.stringify(payload), this.cacheTtlSeconds);
    return payload;
  }

  async upsert(tenantId: string, alertId: string, payload: AlertRecord): Promise<void> {
    this.repository.upsert(tenantId, alertId, payload, new Date().toISOString());
    await this.cache.del(this.cacheKey(tenantId));
  }

  async remove(tenantId: string, alertId: string): Promise<boolean> {
    const deleted = this.repository.deleteByTenantAndId(tenantId, alertId);
    await this.cache.del(this.cacheKey(tenantId));
    return deleted;
  }
}
