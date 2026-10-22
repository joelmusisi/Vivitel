-- PostgreSQL partial indexes for Vivi Telematics hot read paths
-- Run with: psql "$DATABASE_URL" -f ./scripts/postgresql_partial_indexes.sql
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

-- Assets listing and lookups (tenant scoped, ordered by recency)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_tenant_updated_desc_partial
  ON assets (tenant_id, updated_at DESC)
  WHERE tenant_id IS NOT NULL;

-- Alerts listing (tenant scoped, latest first)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_tenant_updated_desc_partial
  ON alerts (tenant_id, updated_at DESC)
  WHERE tenant_id IS NOT NULL;

-- Configuration groups by tenant ordered by update time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cfg_groups_tenant_updated_desc_partial
  ON configuration_groups (tenant_id, updated_at DESC)
  WHERE tenant_id IS NOT NULL;

-- Bindings by tenant + type ordered by update time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bindings_tenant_type_updated_desc_partial
  ON bindings (tenant_id, type, updated_at DESC)
  WHERE tenant_id IS NOT NULL;

-- Telemetry event recency feed
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tel_events_tenant_created_desc_partial
  ON telemetry_events (tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

-- Telemetry lookup by IMEI (latest first)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tel_events_tenant_imei_created_desc_partial
  ON telemetry_events (tenant_id, imei, created_at DESC)
  WHERE tenant_id IS NOT NULL AND imei IS NOT NULL;

-- Telemetry lookup by asset id (latest first)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tel_events_tenant_asset_created_desc_partial
  ON telemetry_events (tenant_id, asset_id, created_at DESC)
  WHERE tenant_id IS NOT NULL AND asset_id IS NOT NULL;

-- Normalized asset identity lookup by IMEI
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pg_asset_identities_tenant_imei_updated_desc_partial
  ON asset_identities (tenant_id, imei, updated_at DESC)
  WHERE tenant_id IS NOT NULL AND imei IS NOT NULL;

-- Latest asset state by IMEI
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pg_asset_latest_state_tenant_imei_updated_desc_partial
  ON asset_latest_state (tenant_id, imei, updated_at DESC)
  WHERE tenant_id IS NOT NULL AND imei IS NOT NULL;

-- Latest seen state per tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pg_asset_latest_state_tenant_last_seen_desc_partial
  ON asset_latest_state (tenant_id, last_seen DESC)
  WHERE tenant_id IS NOT NULL AND last_seen IS NOT NULL;

-- Normalized telemetry fact lookup by IMEI
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pg_tel_event_facts_tenant_imei_created_desc_partial
  ON telemetry_event_facts (tenant_id, imei, created_at DESC)
  WHERE tenant_id IS NOT NULL AND imei IS NOT NULL;

-- Normalized telemetry fact lookup by asset id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pg_tel_event_facts_tenant_asset_created_desc_partial
  ON telemetry_event_facts (tenant_id, asset_id, created_at DESC)
  WHERE tenant_id IS NOT NULL AND asset_id IS NOT NULL;

-- Normalized alert lookup by asset id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pg_alert_facts_tenant_asset_created_desc_partial
  ON alert_facts (tenant_id, asset_id, created_at DESC)
  WHERE tenant_id IS NOT NULL AND asset_id IS NOT NULL;

-- Archive fetch by tenant + event id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tel_archives_tenant_event_partial
  ON telemetry_archives (tenant_id, event_id)
  WHERE tenant_id IS NOT NULL;

-- Archive recency lookup for history endpoints
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tel_archives_tenant_created_ts_desc_partial
  ON telemetry_archives (tenant_id, created_at_ts DESC)
  WHERE tenant_id IS NOT NULL;

-- Artifact selection by tenant + type + recency/base
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_artifacts_tenant_type_base_created_partial
  ON device_artifacts (tenant_id, type, is_base DESC, created_at DESC)
  WHERE tenant_id IS NOT NULL;

-- Queue polling for pending pushes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_push_queue_queued_tenant_imei_created_partial
  ON device_push_queue (tenant_id, imei, created_at DESC)
  WHERE status = 'queued';

-- Camera health by tenant and latest update
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_camera_health_tenant_updated_desc_partial
  ON camera_health (tenant_id, updated_at DESC)
  WHERE tenant_id IS NOT NULL;

-- Talkback queue polling for queued packets
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_talkback_queue_queued_tenant_camera_created_partial
  ON talkback_queue (tenant_id, camera_id, created_at ASC)
  WHERE status = 'queued';
