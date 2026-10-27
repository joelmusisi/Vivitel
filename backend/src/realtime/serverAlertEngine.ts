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
import { resolveUserAlertDeliveryFromParameters } from "../shared/notificationAlertDelivery";
import { bindingHasExplicitRecipients, type UserAlertDispatchEnv } from "../shared/userAlertDispatch";
import { createVpsKvNamespace, routeOperationalD1ToVps } from "../shared/vpsWorkerStorage";
import {
  allowedDeviceActions,
  createTraccarSender,
  digitalOutputCommand,
  libraryRowDeviceActions,
  loadAssetDeviceBinding,
  sendDeviceCommand,
  type DeviceActionKind
} from "../shared/alertDeviceActions";

/** Asset/site lookup, site rules and bindings are re-read this often. */
const CACHE_TTL_MS = 3 * 60_000;

type AssetRef = { tenantId: string; site: string; label: string; asset: Record<string, unknown> };
/** Episode state plus which buzzer / relay actions already ran, and which are held on. */
type EngineEpisode = RuleEpisodeState & { actionsDone?: DeviceActionKind[]; continuousOn?: DeviceActionKind[] };
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

/** VPS-backed key holding rule episode state between cron runs (not Cloudflare KV). */
const EPISODES_KEY = "vivi:server-alert-episodes";
/** Episodes not touched for this long are dropped (device gone or rule removed). */
const EPISODE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/**
 * Evaluates custom notification-library alerts on device positions and sends the alert
 * through the normal device-alert email / in-app path. Run by the 2-minute cron on the
 * latest position of every device (runServerAlertRules), so it adds no always-on
 * Durable Object time or Cloudflare storage writes.
 */
export class ServerAlertEngine {
  private assets: Cached<Map<string, AssetRef[]>> | undefined;
  private siteRules = new Map<string, Cached<SiteRules>>();
  private bindings = new Map<string, Cached<any[]>>();
  private episodes = new Map<string, EngineEpisode>();
  private deviceBindings = new Map<string, Promise<Set<DeviceActionKind>>>();

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

  /** Restore episode state saved by the previous cron run. */
  loadEpisodes(saved: Record<string, EngineEpisode> | null | undefined) {
    for (const [episodeKey, state] of Object.entries(saved ?? {})) {
      if (state && typeof state === "object") this.episodes.set(episodeKey, state);
    }
  }

  exportEpisodes(now = Date.now()): Record<string, EngineEpisode> {
    const out: Record<string, EngineEpisode> = {};
    for (const [episodeKey, state] of this.episodes) {
      if (now - Number(state.lastFixMs ?? 0) < EPISODE_MAX_AGE_MS) out[episodeKey] = state;
    }
    return out;
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
          map.set(imei, [...(map.get(imei) ?? []), { tenantId, site, label, asset: asset ?? {} }]);
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

  /** Custom rules on this site that an alert on the site monitors and that do something (send or act). */
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
        const onSite = bindings.filter((binding) => siteScopesMatch(String(binding?.site ?? ""), site));
        const rows = library.filter((row) => {
          if (!isServerEvaluatedLibraryRow(row)) return false;
          const description = String(row.description ?? "");
          // "Send active message" off (or no channel ticked) means no email / in-app / SMS.
          const sends =
            Boolean(resolveUserAlertDeliveryFromParameters((row.parameters ?? null) as Record<string, unknown> | null))
            && onSite.some((binding) => bindingHasExplicitRecipients(binding) && bindingCoversSiteEvent(binding, description, site));
          const acts =
            libraryRowDeviceActions(row as any).length > 0
            && onSite.some((binding) => bindingCoversSiteEvent(binding, description, site));
          return sends || acts;
        });
        return { rows, catalog };
      })
      .catch(() => ({ rows: [], catalog: [] }));
    this.siteRules.set(cacheKey, { at: Date.now(), value });
    return value;
  }

  async onPosition(position: any, device: { uniqueId?: string; name?: string } | undefined): Promise<number> {
    const imei = String(device?.uniqueId ?? position?.uniqueId ?? "").replace(/\D+/g, "");
    const deviceId = Number(position?.deviceId);
    if (!imei || !Number.isFinite(deviceId) || deviceId <= 0) return 0;
    const fixMs = Date.parse(String(position?.fixTime ?? position?.deviceTime ?? position?.serverTime ?? ""));
    if (!Number.isFinite(fixMs)) return 0;
    let fired = 0;

    const refs = (await this.loadAssets()).get(imei) ?? [];
    for (const ref of refs) {
      const { rows, catalog } = await this.loadSiteRules(ref.tenantId, ref.site);
      for (const row of rows) {
        const description = String(row.description ?? "").trim();
        const episodeKey = `${deviceId}|${ref.tenantId}|${description.toLowerCase()}`;
        const matched = evaluateLibraryRow(row, position, catalog);
        const previous = this.episodes.get(episodeKey);
        const step = advanceRuleEpisode(previous, matched, fixMs, libraryRowDelayMs(row));
        const next: EngineEpisode = { ...step.state };
        // Buzzer / relay actions keep their own progress within the same episode.
        if (matched && previous && previous.since === step.state.since) {
          next.actionsDone = previous.actionsDone;
          next.continuousOn = previous.continuousOn;
        } else if (!matched && previous?.continuousOn?.length) {
          next.continuousOn = previous.continuousOn;
        }
        await this.runDeviceActions(ref, row, deviceId, matched, fixMs, next);
        this.episodes.set(episodeKey, next);
        if (!step.fire) continue;
        if (!resolveUserAlertDeliveryFromParameters((row.parameters ?? null) as Record<string, unknown> | null)) continue;
        fired += 1;
        await this.fire(ref.tenantId, description, position, fixMs).catch((error) =>
          console.warn("Server alert dispatch failed:", { tenantId: ref.tenantId, description, error })
        );
      }
    }
    return fired;
  }

  private allowedActionsFor(ref: AssetRef): Promise<Set<DeviceActionKind>> {
    const key = `${ref.tenantId}|${String(ref.asset.id ?? ref.asset.imei ?? ref.label)}`;
    let hit = this.deviceBindings.get(key);
    if (!hit) {
      hit = loadAssetDeviceBinding(this.env, ref.tenantId, ref.asset)
        .then((binding) => allowedDeviceActions(binding))
        .catch(() => new Set<DeviceActionKind>());
      this.deviceBindings.set(key, hit);
    }
    return hit;
  }

  /**
   * Buzzer / relay drive actions from the library row: each runs once per episode after its
   * own delay; "continuously when the condition is true" stays on until the condition clears.
   * Only actions the device binding allows are sent (buzzer master switch, relay opt-in).
   */
  private async runDeviceActions(
    ref: AssetRef,
    row: ServerLibraryRow,
    deviceId: number,
    matched: boolean,
    fixMs: number,
    episode: EngineEpisode
  ) {
    const actions = libraryRowDeviceActions(row as any);
    if (!actions.length) return;
    const send = createTraccarSender(this.env);
    if (!matched) {
      for (const kind of episode.continuousOn ?? []) {
        const action = actions.find((item) => item.kind === kind);
        if (action) await sendDeviceCommand(send, deviceId, digitalOutputCommand(action.output, false));
      }
      episode.continuousOn = undefined;
      episode.actionsDone = undefined;
      return;
    }
    if (episode.since == null) return;
    const allowed = await this.allowedActionsFor(ref);
    const done = new Set(episode.actionsDone ?? []);
    const held = new Set(episode.continuousOn ?? []);
    for (const action of actions) {
      if (done.has(action.kind) || !allowed.has(action.kind)) continue;
      if (fixMs - episode.since < action.delayMs) continue;
      await sendDeviceCommand(send, deviceId, digitalOutputCommand(action.output, true, action.seconds));
      done.add(action.kind);
      if (action.seconds === null) held.add(action.kind);
    }
    episode.actionsDone = [...done];
    episode.continuousOn = held.size ? [...held] : undefined;
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

/**
 * Cron entry: one Traccar read of devices + latest positions (the self-hosted Traccar
 * server, not Cloudflare storage), evaluate custom alert rules, send what fired.
 * `env` must already be routed to VPS storage (routeCloudflareStorage).
 */
export async function runServerAlertRules(
  env: UserAlertDispatchEnv,
  traccarFetch: (path: string) => Promise<{ ok: boolean; body: unknown }>
): Promise<{ positions: number; fired: number }> {
  const [devicesResp, positionsResp] = await Promise.all([
    traccarFetch("/api/devices?all=true"),
    traccarFetch("/api/positions")
  ]);
  if (!devicesResp.ok || !positionsResp.ok) return { positions: 0, fired: 0 };
  const devices = new Map<number, { uniqueId?: string; name?: string }>();
  for (const device of Array.isArray(devicesResp.body) ? (devicesResp.body as any[]) : []) {
    const id = Number(device?.id);
    if (Number.isFinite(id) && id > 0) devices.set(id, device);
  }
  const positions = Array.isArray(positionsResp.body) ? (positionsResp.body as any[]) : [];

  const engine = new ServerAlertEngine(env, { routeStorage: false });
  const savedRaw = await env.ViviTEL.get(EPISODES_KEY).catch(() => null);
  engine.loadEpisodes(parseJson<Record<string, EngineEpisode>>(savedRaw));
  const before = JSON.stringify(engine.exportEpisodes());

  let fired = 0;
  for (const position of positions) {
    fired += await engine.onPosition(position, devices.get(Number(position?.deviceId)));
  }

  const after = engine.exportEpisodes();
  // Write only when something changed (a rule started, cleared or fired).
  if (JSON.stringify(after) !== before) {
    await env.ViviTEL.put(EPISODES_KEY, JSON.stringify(after)).catch(() => undefined);
  }
  return { positions: positions.length, fired };
}
