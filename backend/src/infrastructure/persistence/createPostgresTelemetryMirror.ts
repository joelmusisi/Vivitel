import { Pool } from "pg";

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS assets (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  data TEXT,
  updated_at TEXT,
  PRIMARY KEY (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  type TEXT,
  asset_id TEXT,
  imei TEXT,
  created_at TEXT,
  data TEXT,
  PRIMARY KEY (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  data TEXT,
  updated_at TEXT,
  PRIMARY KEY (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS telemetry_archives (
  event_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  asset_id TEXT,
  imei TEXT,
  created_at TEXT,
  storage TEXT,
  storage_key TEXT,
  content_type TEXT,
  size_bytes BIGINT,
  PRIMARY KEY (event_id, tenant_id)
);

ALTER TABLE telemetry_archives
  ADD COLUMN IF NOT EXISTS created_at_ts TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION vivi_try_timestamptz(p_value TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN NULLIF(BTRIM(COALESCE(p_value, '')), '')::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION vivi_try_double(p_value TEXT)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN NULLIF(BTRIM(COALESCE(p_value, '')), '')::double precision;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION vivi_try_integer(p_value TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN NULLIF(BTRIM(COALESCE(p_value, '')), '')::integer;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION vivi_try_boolean(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT := LOWER(BTRIM(COALESCE(p_value, '')));
BEGIN
  IF v_clean = '' THEN
    RETURN NULL;
  END IF;
  IF v_clean IN ('true', 't', '1', 'yes', 'y', 'on') THEN
    RETURN TRUE;
  END IF;
  IF v_clean IN ('false', 'f', '0', 'no', 'n', 'off') THEN
    RETURN FALSE;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS asset_identities (
  tenant_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  imei TEXT,
  registration TEXT,
  site TEXT,
  make TEXT,
  model TEXT,
  config_group TEXT,
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, asset_id)
);

CREATE TABLE IF NOT EXISTS asset_latest_state (
  tenant_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  imei TEXT,
  last_seen TIMESTAMPTZ,
  last_position TIMESTAMPTZ,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  satellites INTEGER,
  ignition BOOLEAN,
  power_voltage DOUBLE PRECISION,
  movement TEXT,
  updated_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, asset_id)
);

CREATE TABLE IF NOT EXISTS telemetry_event_facts (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  asset_id TEXT,
  imei TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  satellites INTEGER,
  ignition BOOLEAN,
  movement TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE TABLE IF NOT EXISTS alert_facts (
  tenant_id TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  asset_id TEXT,
  created_at TIMESTAMPTZ,
  status TEXT,
  severity TEXT,
  alert_type TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, alert_id)
);

CREATE INDEX IF NOT EXISTS idx_pg_asset_identities_tenant_imei_updated_desc
  ON asset_identities (tenant_id, imei, updated_at DESC)
  WHERE imei IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pg_asset_latest_state_tenant_imei_updated_desc
  ON asset_latest_state (tenant_id, imei, updated_at DESC)
  WHERE imei IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pg_asset_latest_state_tenant_last_seen_desc
  ON asset_latest_state (tenant_id, last_seen DESC)
  WHERE last_seen IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pg_tel_event_facts_tenant_imei_created_desc
  ON telemetry_event_facts (tenant_id, imei, created_at DESC)
  WHERE imei IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pg_tel_event_facts_tenant_asset_created_desc
  ON telemetry_event_facts (tenant_id, asset_id, created_at DESC)
  WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pg_alert_facts_tenant_asset_created_desc
  ON alert_facts (tenant_id, asset_id, created_at DESC)
  WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pg_tel_archives_tenant_created_desc
  ON telemetry_archives (tenant_id, created_at_ts DESC)
  WHERE tenant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION vivi_upsert_asset_projection(
  p_tenant_id TEXT,
  p_asset_id TEXT,
  p_updated_at TEXT,
  p_asset_data JSONB
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_at TIMESTAMPTZ := COALESCE(vivi_try_timestamptz(p_updated_at), clock_timestamp());
  v_imei TEXT := NULLIF(BTRIM(COALESCE(p_asset_data->>'imei', '')), '');
  v_registration TEXT := NULLIF(BTRIM(COALESCE(p_asset_data->>'registration', '')), '');
  v_site TEXT := NULLIF(BTRIM(COALESCE(p_asset_data->>'site', '')), '');
  v_make TEXT := NULLIF(BTRIM(COALESCE(p_asset_data->>'make', '')), '');
  v_model TEXT := NULLIF(BTRIM(COALESCE(p_asset_data->>'model', '')), '');
  v_config_group TEXT := NULLIF(BTRIM(COALESCE(p_asset_data->>'configGroup', '')), '');
  v_last_seen TIMESTAMPTZ := COALESCE(vivi_try_timestamptz(p_asset_data->>'lastSeen'), v_updated_at);
  v_last_position TIMESTAMPTZ := COALESCE(vivi_try_timestamptz(p_asset_data->>'lastPosition'), v_last_seen, v_updated_at);
  v_lat DOUBLE PRECISION := COALESCE(vivi_try_double(p_asset_data->>'lat'), vivi_try_double(p_asset_data->>'latitude'));
  v_lng DOUBLE PRECISION := COALESCE(vivi_try_double(p_asset_data->>'lng'), vivi_try_double(p_asset_data->>'lon'), vivi_try_double(p_asset_data->>'longitude'));
  v_speed DOUBLE PRECISION := vivi_try_double(p_asset_data->>'speed');
  v_heading DOUBLE PRECISION := COALESCE(vivi_try_double(p_asset_data->>'heading'), vivi_try_double(p_asset_data->>'course'));
  v_satellites INTEGER := COALESCE(vivi_try_integer(p_asset_data->>'satellites'), vivi_try_integer(p_asset_data->>'sat'));
  v_ignition BOOLEAN := vivi_try_boolean(p_asset_data->>'ignition');
  v_power_voltage DOUBLE PRECISION := vivi_try_double(p_asset_data->>'powerVoltage');
  v_movement TEXT := NULLIF(BTRIM(COALESCE(p_asset_data->>'movement', '')), '');
BEGIN
  INSERT INTO assets (id, tenant_id, data, updated_at)
  VALUES (p_asset_id, p_tenant_id, p_asset_data::text, p_updated_at)
  ON CONFLICT (id, tenant_id)
  DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

  INSERT INTO asset_identities (tenant_id, asset_id, imei, registration, site, make, model, config_group, updated_at)
  VALUES (p_tenant_id, p_asset_id, v_imei, v_registration, v_site, v_make, v_model, v_config_group, v_updated_at)
  ON CONFLICT (tenant_id, asset_id)
  DO UPDATE SET
    imei = EXCLUDED.imei,
    registration = EXCLUDED.registration,
    site = EXCLUDED.site,
    make = EXCLUDED.make,
    model = EXCLUDED.model,
    config_group = EXCLUDED.config_group,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO asset_latest_state (
    tenant_id,
    asset_id,
    imei,
    last_seen,
    last_position,
    lat,
    lng,
    speed,
    heading,
    satellites,
    ignition,
    power_voltage,
    movement,
    updated_at,
    raw
  ) VALUES (
    p_tenant_id,
    p_asset_id,
    v_imei,
    v_last_seen,
    v_last_position,
    v_lat,
    v_lng,
    v_speed,
    v_heading,
    v_satellites,
    v_ignition,
    v_power_voltage,
    v_movement,
    v_updated_at,
    p_asset_data
  )
  ON CONFLICT (tenant_id, asset_id)
  DO UPDATE SET
    imei = EXCLUDED.imei,
    last_seen = EXCLUDED.last_seen,
    last_position = EXCLUDED.last_position,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    speed = EXCLUDED.speed,
    heading = EXCLUDED.heading,
    satellites = EXCLUDED.satellites,
    ignition = EXCLUDED.ignition,
    power_voltage = EXCLUDED.power_voltage,
    movement = EXCLUDED.movement,
    updated_at = EXCLUDED.updated_at,
    raw = EXCLUDED.raw;
END;
$$;

CREATE OR REPLACE FUNCTION vivi_upsert_telemetry_snapshot(
  p_tenant_id TEXT,
  p_asset_id TEXT,
  p_imei TEXT,
  p_created_at TEXT,
  p_asset_data JSONB,
  p_event_id TEXT,
  p_event_data JSONB,
  p_alerts JSONB DEFAULT '[]'::jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  alert_item JSONB;
  alert_id TEXT;
  v_created_at TIMESTAMPTZ := COALESCE(vivi_try_timestamptz(p_created_at), clock_timestamp());
  v_imei TEXT := NULLIF(BTRIM(COALESCE(p_imei, p_asset_data->>'imei', p_event_data #>> '{data,imei}', p_event_data->>'imei')), '');
  v_lat DOUBLE PRECISION := COALESCE(
    vivi_try_double(p_asset_data->>'lat'),
    vivi_try_double(p_asset_data->>'latitude'),
    vivi_try_double(p_event_data #>> '{data,lat}'),
    vivi_try_double(p_event_data #>> '{data,latitude}')
  );
  v_lng DOUBLE PRECISION := COALESCE(
    vivi_try_double(p_asset_data->>'lng'),
    vivi_try_double(p_asset_data->>'lon'),
    vivi_try_double(p_asset_data->>'longitude'),
    vivi_try_double(p_event_data #>> '{data,lng}'),
    vivi_try_double(p_event_data #>> '{data,lon}'),
    vivi_try_double(p_event_data #>> '{data,longitude}')
  );
  v_speed DOUBLE PRECISION := COALESCE(vivi_try_double(p_asset_data->>'speed'), vivi_try_double(p_event_data #>> '{data,speed}'));
  v_heading DOUBLE PRECISION := COALESCE(
    vivi_try_double(p_asset_data->>'heading'),
    vivi_try_double(p_asset_data->>'course'),
    vivi_try_double(p_event_data #>> '{data,heading}'),
    vivi_try_double(p_event_data #>> '{data,course}')
  );
  v_satellites INTEGER := COALESCE(
    vivi_try_integer(p_asset_data->>'satellites'),
    vivi_try_integer(p_asset_data->>'sat'),
    vivi_try_integer(p_event_data #>> '{data,satellites}'),
    vivi_try_integer(p_event_data #>> '{data,sat}')
  );
  v_ignition BOOLEAN := COALESCE(
    vivi_try_boolean(p_asset_data->>'ignition'),
    vivi_try_boolean(p_event_data #>> '{data,ignition}')
  );
  v_movement TEXT := NULLIF(BTRIM(COALESCE(p_asset_data->>'movement', p_event_data #>> '{data,movement}', '')), '');
  v_alert_created_at TIMESTAMPTZ;
BEGIN
  PERFORM vivi_upsert_asset_projection(p_tenant_id, p_asset_id, p_created_at, p_asset_data);

  INSERT INTO telemetry_events (id, tenant_id, type, asset_id, imei, created_at, data)
  VALUES (p_event_id, p_tenant_id, 'telemetry', p_asset_id, NULLIF(p_imei, ''), p_created_at, p_event_data::text)
  ON CONFLICT (id, tenant_id)
  DO NOTHING;

  INSERT INTO telemetry_event_facts (
    tenant_id,
    event_id,
    asset_id,
    imei,
    created_at,
    lat,
    lng,
    speed,
    heading,
    satellites,
    ignition,
    movement,
    payload
  ) VALUES (
    p_tenant_id,
    p_event_id,
    p_asset_id,
    v_imei,
    v_created_at,
    v_lat,
    v_lng,
    v_speed,
    v_heading,
    v_satellites,
    v_ignition,
    v_movement,
    p_event_data
  )
  ON CONFLICT (tenant_id, event_id)
  DO UPDATE SET
    asset_id = EXCLUDED.asset_id,
    imei = EXCLUDED.imei,
    created_at = EXCLUDED.created_at,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    speed = EXCLUDED.speed,
    heading = EXCLUDED.heading,
    satellites = EXCLUDED.satellites,
    ignition = EXCLUDED.ignition,
    movement = EXCLUDED.movement,
    payload = EXCLUDED.payload;

  IF jsonb_typeof(COALESCE(p_alerts, '[]'::jsonb)) = 'array' THEN
    FOR alert_item IN
      SELECT value FROM jsonb_array_elements(COALESCE(p_alerts, '[]'::jsonb))
    LOOP
      alert_id := COALESCE(NULLIF(alert_item->>'id', ''), md5(random()::text || clock_timestamp()::text));
      v_alert_created_at := COALESCE(vivi_try_timestamptz(alert_item->>'createdAt'), v_created_at);
      INSERT INTO alerts (id, tenant_id, data, updated_at)
      VALUES (alert_id, p_tenant_id, alert_item::text, p_created_at)
      ON CONFLICT (id, tenant_id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

      INSERT INTO alert_facts (tenant_id, alert_id, asset_id, created_at, status, severity, alert_type, payload)
      VALUES (
        p_tenant_id,
        alert_id,
        NULLIF(BTRIM(COALESCE(alert_item->>'assetId', p_asset_id)), ''),
        v_alert_created_at,
        NULLIF(BTRIM(COALESCE(alert_item->>'status', '')), ''),
        NULLIF(BTRIM(COALESCE(alert_item->>'severity', '')), ''),
        NULLIF(BTRIM(COALESCE(alert_item->>'type', '')), ''),
        alert_item
      )
      ON CONFLICT (tenant_id, alert_id)
      DO UPDATE SET
        asset_id = EXCLUDED.asset_id,
        created_at = EXCLUDED.created_at,
        status = EXCLUDED.status,
        severity = EXCLUDED.severity,
        alert_type = EXCLUDED.alert_type,
        payload = EXCLUDED.payload;
    END LOOP;
  END IF;
END;
$$;
`;

export interface PostgresAssetMirrorArgs {
  tenantId: string;
  assetId: string;
  updatedAt: string;
  assetData: Record<string, unknown>;
}

export interface PostgresTelemetryMirrorArgs {
  tenantId: string;
  assetId: string;
  imei: string;
  createdAt: string;
  assetData: Record<string, unknown>;
  eventId: string;
  eventData: Record<string, unknown>;
  alerts: unknown[];
}

export interface PostgresTelemetryArchiveMirrorArgs {
  eventId: string;
  tenantId: string;
  assetId: string;
  imei: string;
  createdAt: string;
  storage: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
}

export interface PostgresMirroredAssetRow {
  data: string;
  updated_at: string;
}

export interface PostgresMirroredTelemetryEventRow {
  id: string;
  asset_id: string;
  imei: string;
  created_at: string;
  data: string;
}

export interface PostgresMirroredTelemetryArchiveRow {
  event_id: string;
  asset_id: string;
  imei: string;
  created_at: string;
  storage: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
}

export interface PostgresTelemetryHistoryQuery {
  tenantId: string;
  imei?: string;
  assetId?: string;
  assetIds?: string[];
  from?: string;
  to?: string;
  limit: number;
}

export interface PostgresTelemetryMirror {
  readonly enabled: true;
  mirrorAssetUpsert(args: PostgresAssetMirrorArgs): Promise<void>;
  mirrorTelemetryWrite(args: PostgresTelemetryMirrorArgs): Promise<void>;
  mirrorTelemetryArchive(args: PostgresTelemetryArchiveMirrorArgs): Promise<void>;
  readTelemetryCount(tenant?: string): Promise<number | null>;
  readLatestTelemetryAt(tenant?: string): Promise<string | null>;
  readLatestTelemetryByImei(tenant: string, imei: string): Promise<{ data: string; created_at: string } | null>;
  findAssetsByImei(tenant: string, imei: string): Promise<PostgresMirroredAssetRow[]>;
  readTelemetryHistory(query: PostgresTelemetryHistoryQuery): Promise<PostgresMirroredTelemetryEventRow[]>;
  readTelemetryArchives(query: PostgresTelemetryHistoryQuery): Promise<PostgresMirroredTelemetryArchiveRow[]>;
}

export function createPostgresTelemetryMirror(deps: {
  connectionString?: string;
  logger?: Pick<Console, "info" | "warn">;
}): PostgresTelemetryMirror | null {
  const connectionString = String(deps.connectionString ?? "").trim();
  if (!connectionString) return null;

  const logger = deps.logger ?? console;
  const pool = new Pool({
    connectionString,
    max: Math.max(1, Number(process.env.PG_MIRROR_POOL_MAX ?? 10)),
    min: Math.max(0, Number(process.env.PG_MIRROR_POOL_MIN ?? 2)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: Math.max(1000, Number(process.env.PG_MIRROR_CONNECT_TIMEOUT_MS ?? 5000)),
    allowExitOnIdle: false,
  });

  let available = true;
  const initPromise = pool.query(INIT_SQL)
    .then(() => {
      logger.info("PostgreSQL telemetry mirror enabled.");
    })
    .catch((error: any) => {
      available = false;
      logger.warn(`PostgreSQL telemetry mirror init failed: ${error?.message ?? String(error)}`);
      throw error;
    });

  async function ensureReady() {
    if (!available) return null;
    try {
      await initPromise;
      return pool;
    } catch {
      available = false;
      return null;
    }
  }

  async function runQuery(query: string, params: unknown[], label: string) {
    const ready = await ensureReady();
    if (!ready) return;
    try {
      await ready.query(query, params);
    } catch (error: any) {
      logger.warn(`PostgreSQL telemetry mirror ${label} failed: ${error?.message ?? String(error)}`);
    }
  }

  async function readRows<T>(query: string, params: unknown[], label: string): Promise<T[]> {
    const ready = await ensureReady();
    if (!ready) return [];
    try {
      const result = await ready.query(query, params);
      return result.rows as T[];
    } catch (error: any) {
      logger.warn(`PostgreSQL telemetry mirror ${label} failed: ${error?.message ?? String(error)}`);
      return [];
    }
  }

  function normalizeLimit(limit: number, fallback: number, ceiling: number) {
    const value = Number.isFinite(limit) ? Math.floor(limit) : fallback;
    return Math.max(1, Math.min(value, ceiling));
  }

  function buildTelemetryHistoryWhere(query: PostgresTelemetryHistoryQuery) {
    const clauses: string[] = ["tenant_id = $1"];
    const params: unknown[] = [query.tenantId];
    let index = 2;

    if (query.imei) {
      clauses.push(`imei = $${index}`);
      params.push(query.imei);
      index += 1;
    }
    if (query.assetId) {
      clauses.push(`asset_id = $${index}`);
      params.push(query.assetId);
      index += 1;
    } else if ((query.assetIds?.length ?? 0) > 0) {
      clauses.push(`asset_id = ANY($${index}::text[])`);
      params.push(query.assetIds ?? []);
      index += 1;
    }
    if (query.from) {
      clauses.push(`created_at >= COALESCE(vivi_try_timestamptz($${index}), '-infinity'::timestamptz)`);
      params.push(query.from);
      index += 1;
    }
    if (query.to) {
      clauses.push(`created_at <= COALESCE(vivi_try_timestamptz($${index}), 'infinity'::timestamptz)`);
      params.push(query.to);
    }

    return { clauses, params };
  }

  return {
    enabled: true,
    async mirrorAssetUpsert(args) {
      await runQuery(
        "SELECT vivi_upsert_asset_projection($1, $2, $3, $4::jsonb)",
        [args.tenantId, args.assetId, args.updatedAt, JSON.stringify(args.assetData)],
        "asset upsert"
      );
    },
    async mirrorTelemetryWrite(args) {
      await runQuery(
        "SELECT vivi_upsert_telemetry_snapshot($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb)",
        [
          args.tenantId,
          args.assetId,
          args.imei,
          args.createdAt,
          JSON.stringify(args.assetData),
          args.eventId,
          JSON.stringify(args.eventData),
          JSON.stringify(args.alerts ?? []),
        ],
        "telemetry write"
      );
    },
    async mirrorTelemetryArchive(args) {
      await runQuery(
        "INSERT INTO telemetry_archives (event_id, tenant_id, asset_id, imei, created_at, storage, storage_key, content_type, size_bytes, created_at_ts) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE(vivi_try_timestamptz($5), clock_timestamp())) ON CONFLICT (event_id, tenant_id) DO UPDATE SET asset_id = EXCLUDED.asset_id, imei = EXCLUDED.imei, created_at = EXCLUDED.created_at, storage = EXCLUDED.storage, storage_key = EXCLUDED.storage_key, content_type = EXCLUDED.content_type, size_bytes = EXCLUDED.size_bytes, created_at_ts = EXCLUDED.created_at_ts",
        [
          args.eventId,
          args.tenantId,
          args.assetId,
          args.imei,
          args.createdAt,
          args.storage,
          args.storageKey,
          args.contentType,
          args.sizeBytes,
        ],
        "telemetry archive"
      );
    },
    async readTelemetryCount(tenant?: string) {
      const ready = await ensureReady();
      if (!ready) return null;
      try {
        const text = tenant
          ? "SELECT COUNT(1) AS c FROM telemetry_events WHERE tenant_id = $1"
          : "SELECT COUNT(1) AS c FROM telemetry_events";
        const result = tenant ? await ready.query(text, [tenant]) : await ready.query(text);
        const value = Number(result.rows[0]?.c ?? 0);
        return Number.isFinite(value) ? value : 0;
      } catch (error: any) {
        logger.warn(`PostgreSQL telemetry mirror read count failed: ${error?.message ?? String(error)}`);
        return null;
      }
    },
    async readLatestTelemetryAt(tenant?: string) {
      const ready = await ensureReady();
      if (!ready) return null;
      try {
        const text = tenant
          ? "SELECT created_at FROM telemetry_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1"
          : "SELECT created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 1";
        const result = tenant ? await ready.query(text, [tenant]) : await ready.query(text);
        return String(result.rows[0]?.created_at ?? "").trim() || null;
      } catch (error: any) {
        logger.warn(`PostgreSQL telemetry mirror read latest failed: ${error?.message ?? String(error)}`);
        return null;
      }
    },
    async readLatestTelemetryByImei(tenant: string, imei: string) {
      const ready = await ensureReady();
      if (!ready) return null;
      try {
        const result = await ready.query(
          "SELECT payload::text AS data, created_at::text AS created_at FROM telemetry_event_facts WHERE tenant_id = $1 AND imei = $2 ORDER BY created_at DESC LIMIT 1",
          [tenant, imei]
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
          data: String(row.data ?? ""),
          created_at: String(row.created_at ?? ""),
        };
      } catch (error: any) {
        logger.warn(`PostgreSQL telemetry mirror read latest by imei failed: ${error?.message ?? String(error)}`);
        return null;
      }
    },
    async findAssetsByImei(tenant: string, imei: string) {
      return readRows<PostgresMirroredAssetRow>(
        "SELECT raw::text AS data, COALESCE(updated_at, last_seen, last_position)::text AS updated_at FROM asset_latest_state WHERE tenant_id = $1 AND imei = $2 ORDER BY updated_at DESC NULLS LAST, last_seen DESC NULLS LAST LIMIT 20",
        [tenant, imei],
        "find assets by imei"
      );
    },
    async readTelemetryHistory(query) {
      const limit = normalizeLimit(query.limit, 500, 5000);
      const { clauses, params } = buildTelemetryHistoryWhere(query);
      return readRows<PostgresMirroredTelemetryEventRow>(
        `SELECT event_id AS id, COALESCE(asset_id, '') AS asset_id, COALESCE(imei, '') AS imei, created_at::text AS created_at, payload::text AS data FROM telemetry_event_facts WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ${limit}`,
        params,
        "read telemetry history"
      );
    },
    async readTelemetryArchives(query) {
      const limit = normalizeLimit(query.limit, 500, 5000);
      const clauses: string[] = ["tenant_id = $1"];
      const params: unknown[] = [query.tenantId];
      let index = 2;

      if (query.imei) {
        clauses.push(`imei = $${index}`);
        params.push(query.imei);
        index += 1;
      }
      if (query.assetId) {
        clauses.push(`asset_id = $${index}`);
        params.push(query.assetId);
        index += 1;
      } else if ((query.assetIds?.length ?? 0) > 0) {
        clauses.push(`asset_id = ANY($${index}::text[])`);
        params.push(query.assetIds ?? []);
        index += 1;
      }
      if (query.from) {
        clauses.push(`created_at_ts >= COALESCE(vivi_try_timestamptz($${index}), '-infinity'::timestamptz)`);
        params.push(query.from);
        index += 1;
      }
      if (query.to) {
        clauses.push(`created_at_ts <= COALESCE(vivi_try_timestamptz($${index}), 'infinity'::timestamptz)`);
        params.push(query.to);
      }

      return readRows<PostgresMirroredTelemetryArchiveRow>(
        `SELECT event_id, COALESCE(asset_id, '') AS asset_id, COALESCE(imei, '') AS imei, created_at, COALESCE(storage, '') AS storage, COALESCE(storage_key, '') AS storage_key, COALESCE(content_type, 'application/json') AS content_type, COALESCE(size_bytes, 0) AS size_bytes FROM telemetry_archives WHERE ${clauses.join(" AND ")} ORDER BY created_at_ts DESC NULLS LAST, created_at DESC LIMIT ${limit}`,
        params,
        "read telemetry archives"
      );
    },
  };
}