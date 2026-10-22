import { dispatchDeviceAlertEmailsForTraccarEvent } from "../shared/deviceAlertDispatch";
import { createRegionScopedKv, isTraccarStorageTenant } from "../shared/regionStorage";
import { DEFAULT_REGION, isRegionId, type RegionId } from "../shared/regionServers";
import { buildScopedKvKey, siteScopesMatch } from "../shared/scopeIsolation";
import {
  advanceRuleEpisode,
  evaluateLibraryRow,
  isServerEvaluatedLibraryRow,
  libraryRowDelayMs,
  type ParameterCatalogRow,
  type RuleEpisodeState,
  type ServerLibraryRow
} from "../shared/serverAlertRules";
import { bindingCoversSiteEvent } from "../shared/siteNotificationScope";
import { bindingHasExplicitRecipients, type UserAlertDispatchEnv } from "../shared/userAlertDispatch";
import { createVpsKvNamespace, routeOperationalD1ToVps } from "../shared/vpsWorkerStorage";

/** Asset/site lookup, site rules and bindings are re-read this often. */
const CACHE_TTL_MS = 3 * 60_000;

type AssetRef = { tenantId: string; site: string; label: string };
type SiteRules = { rows: ServerLibraryRow[]; catalog: ParameterCatalogRow[] };
type Cached<T> = { at: number; value: Promise<T> };

const regionForTenant = (tenantId: string): RegionId => {
  const candidate = String(tenantId.match(/^region:([a-z0-9]+):/i)?.[1] ?? "").toLowerCase();
  return isRegionId(candidate) ? candidate : DEFAULT_REGION;
};

const fresh = <T>(entry: Cached<T> | undefined) => entry && Date.now() - entry.at < CACHE_TTL_MS;

const parseJson = <T>(raw: string | null | undefined): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

/**
 * Evaluates custom notification-library alerts on every live position (Traccar socket or
 * forwarding) and sends the alert through the normal device-alert email / in-app path.
 * Lives inside TraccarSocketBridge, which already receives every position.
 */
export class ServerAlertEngine {
  private assets: Cached<Map<string, AssetRef[]>> | undefined;
  private siteRules = new Map<string, Cached<SiteRules>>();
  private bindings = new Map<string, Cached<any[]>>();
  private episodes = new Map<string, RuleEpisodeState>();

  private readonly env: UserAlertDispatchEnv;

  constructor(rawEnv: UserAlertDispatchEnv, options: { routeStorage?: boolean } = {}) {
    // Same storage routing as the Worker (routeCloudflareStorage): a Durable Object gets the
    // raw Cloudflare bindings, but assets, bindings and libraries live behind the VPS router.
    const env = { ...rawEnv } as UserAlertDispatchEnv;
    if (options.routeStorage !== false) {
      if (env.VIVI_D1) env.VIVI_D1 = routeOperationalD1ToVps(env.VIVI_D1 as any, env as any) as unknown as D1Database;
      env.ViviTEL = createVpsKvNamespace(env as any) as unknown as KVNamespace;
    }
    this.env = env;
  }

  private scopedEnv(tenantId: string): UserAlertDispatchEnv {
    return { ...this.env, ViviTEL: createRegionScopedKv(this.env.ViviTEL, regionForTenant(tenantId)) };
  }

  /** imei → the (Traccar-backed) tenants and sites it is bound to. */
  private loadAssets(): Promise<Map<string, AssetRef[]>> {
    if (fresh(this.assets)) return this.assets!.value;
    const value = this.env.VIVI_D1.prepare("SELECT tenant_id AS tenantId, data FROM assets")
      .all<{ tenantId?: string; data?: string }>()
      .then((result) => {
        const map = new Map<string, AssetRef[]>();
        for (const row of result.results ?? []) {
          const tenantId = String(row.tenantId ?? "").trim();
          if (!tenantId || !isTraccarStorageTenant(tenantId)) continue;
          const asset = parseJson<Record<string, unknown>>(row.data);
          const imei = String(asset?.imei ?? "").replace(/\D+/g, "");
          const site = String(asset?.site ?? "").trim();
          if (!imei || !site) continue;
          const label = String(asset?.assetDescription ?? asset?.registration ?? asset?.name ?? imei).trim();
          map.set(imei, [...(map.get(imei) ?? []), { tenantId, site, label }]);
        }
        return map;
      })
      .catch(() => new Map<string, AssetRef[]>());
    this.assets = { at: Date.now(), value };
    return value;
  }

  private loadBindings(tenantId: string): Promise<any[]> {
    const hit = this.bindings.get(tenantId);
    if (fresh(hit)) return hit!.value;
    const value = this.env.VIVI_D1.prepare("SELECT data FROM bindings WHERE tenant_id = ?1 AND type = ?2")
      .bind(tenantId, "notifications")
      .all<{ data?: string }>()
      .then((result) => (result.results ?? []).map((row) => parseJson<any>(row.data)).filter(Boolean))
      .catch(() => [] as any[]);
    this.bindings.set(tenantId, { at: Date.now(), value });
    return value;
  }

  /** Custom rules on this site that are monitored by an alert with people added. */
  private loadSiteRules(tenantId: string, site: string): Promise<SiteRules> {
    const cacheKey = `${tenantId}|${site.toLowerCase()}`;
    const hit = this.siteRules.get(cacheKey);
    if (fresh(hit)) return hit!.value;
    const kv = this.scopedEnv(tenantId).ViviTEL;
    const value = Promise.all([
      kv.get(buildScopedKvKey("libraries:notification", tenantId, site)),
      kv.get("libraries:parameters"),
      this.loadBindings(tenantId)
    ])
      .then(([libraryRaw, catalogRaw, bindings]) => {
        const library = parseJson<{ items?: ServerLibraryRow[] }>(libraryRaw)?.items ?? [];
        const catalog = parseJson<{ items?: ParameterCatalogRow[] }>(catalogRaw)?.items ?? [];
        const watched = bindings.filter(
          (binding) => siteScopesMatch(String(binding?.site ?? ""), site) && bindingHasExplicitRecipients(binding)
        );
        const rows = library.filter(
          (row) =>
            isServerEvaluatedLibraryRow(row)
            && watched.some((binding) => bindingCoversSiteEvent(binding, String(row.description ?? ""), site))
        );
        return { rows, catalog };
      })
      .catch(() => ({ rows: [], catalog: [] }));
    this.siteRules.set(cacheKey, { at: Date.now(), value });
    return value;
  }

  async onPosition(position: any, device: { uniqueId?: string; name?: string } | undefined) {
    const imei = String(device?.uniqueId ?? position?.uniqueId ?? "").replace(/\D+/g, "");
    const deviceId = Number(position?.deviceId);
    if (!imei || !Number.isFinite(deviceId) || deviceId <= 0) return;
    const fixMs = Date.parse(String(position?.fixTime ?? position?.deviceTime ?? position?.serverTime ?? ""));
    if (!Number.isFinite(fixMs)) return;

    const refs = (await this.loadAssets()).get(imei) ?? [];
    for (const ref of refs) {
      const { rows, catalog } = await this.loadSiteRules(ref.tenantId, ref.site);
      for (const row of rows) {
        const description = String(row.description ?? "").trim();
        const episodeKey = `${deviceId}|${ref.tenantId}|${description.toLowerCase()}`;
        const matched = evaluateLibraryRow(row, position, catalog);
        const step = advanceRuleEpisode(this.episodes.get(episodeKey), matched, fixMs, libraryRowDelayMs(row));
        this.episodes.set(episodeKey, step.state);
        if (!step.fire) continue;
        await this.fire(ref.tenantId, description, position, fixMs).catch((error) =>
          console.warn("Server alert dispatch failed:", { tenantId: ref.tenantId, description, error })
        );
      }
    }
  }

  private async fire(tenantId: string, description: string, position: any, fixMs: number) {
    const knots = Number(position?.speed);
    await dispatchDeviceAlertEmailsForTraccarEvent(this.scopedEnv(tenantId), {
      tenantId,
      serverRule: true,
      rules: [],
      notificationName: description,
      traccarEvent: {
        // One key per rule episode, so two rules firing on the same position both send.
        type: `viviRule:${description}`,
        eventTime: new Date(fixMs).toISOString(),
        deviceId: Number(position.deviceId),
        attributes: {
          ...(position?.attributes ?? {}),
          alarm: description,
          latitude: position?.latitude,
          longitude: position?.longitude,
          address: position?.address ?? undefined,
          ...(Number.isFinite(knots) ? { speedKph: Math.round(knots * 1.852) } : {})
        }
      }
    });
  }
}
