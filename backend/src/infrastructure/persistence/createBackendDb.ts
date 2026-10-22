interface BackendDbLike {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    all: (...params: any[]) => any[];
    get: (...params: any[]) => any;
    run: (...params: any[]) => { changes: number };
  };
}

interface CreateBackendDbDeps {
  DatabaseCtor: any;
  dbPath: string;
  requirePersistentDb: boolean;
  fsModule: {
    mkdirSync: (path: string, options?: any) => void;
  };
  pathModule: {
    dirname: (path: string) => string;
  };
}

class InMemoryDB implements BackendDbLike {
  assets: Record<string, any>[] = [];
  telemetry_events: Record<string, any>[] = [];
  alerts: Record<string, any>[] = [];
  pats: Record<string, any>[] = [];
  conversations: Record<string, any>[] = [];
  configuration_groups: Record<string, any>[] = [];
  device_reporting_settings: Record<string, any>[] = [];
  device_artifacts: Record<string, any>[] = [];
  device_push_queue: Record<string, any>[] = [];
  traccar_outbox: Record<string, any>[] = [];
  camera_health: Record<string, any>[] = [];
  camera_audio_chunks: Record<string, any>[] = [];
  talkback_queue: Record<string, any>[] = [];
  admin_sessions: Record<string, any>[] = [];
  deliver_store: Record<string, any>[] = [];
  operational_hierarchies: Record<string, any>[] = [];
  operational_realtime_state: Record<string, any>[] = [];

  exec(_sql: string) {
    return;
  }

  prepare(sql: string) {
    const self = this;
    return {
      all(...params: any[]) {
        if (sql.includes("FROM assets")) {
          const tenant = params[0] ?? "";
          return self.assets
            .filter((row) => row.tenant_id === tenant)
            .map((row) => ({ data: row.data, updated_at: row.updated_at }));
        }
        if (sql.includes("FROM telemetry_events")) {
          const tenant = params[0] ?? "";
          const imeiParam = params.length > 1 ? String(params[1] ?? "").trim() : "";
          const limitMatch = sql.match(/LIMIT (\d+)/i);
          const limit = limitMatch ? Number(limitMatch[1]) : undefined;
          const rows = self.telemetry_events.filter(
            (row) => row.tenant_id === tenant && (!imeiParam || String(row.imei ?? "").trim() === imeiParam)
          );
          rows.sort((left, right) => (left.created_at < right.created_at ? 1 : -1));
          return (limit ? rows.slice(0, limit) : rows).map((row) => ({ data: row.data, created_at: row.created_at }));
        }
        if (sql.includes("FROM operational_realtime_state") && sql.includes("k LIKE 'presence:%'")) {
          const tenantId = params[0] ?? "";
          const now = String(params[1] ?? "");
          return self.operational_realtime_state
            .filter(
              (row) =>
                row.tenant_id === tenantId &&
                String(row.k ?? "").startsWith("presence:") &&
                (!row.expires_at || String(row.expires_at) > now)
            )
            .map((row) => ({ k: row.k, data: row.data }));
        }
        if (sql.includes("FROM alerts")) {
          const tenant = params[0] ?? "";
          const limitMatch = sql.match(/LIMIT (\d+)/i);
          const limit = limitMatch ? Number(limitMatch[1]) : undefined;
          const rows = self.alerts.filter((row) => row.tenant_id === tenant);
          rows.sort((left, right) => (String(left.updated_at ?? "") < String(right.updated_at ?? "") ? 1 : -1));
          return (limit ? rows.slice(0, limit) : rows).map((row) => ({ data: row.data, updated_at: row.updated_at }));
        }
        if (sql.includes("FROM pats")) {
          return self.pats.map((row) => ({ id: row.id, token: row.token, description: row.description, organisationName: row.organisationName, organisationGroup: row.organisationGroup, expiryDate: row.expiryDate, status: row.status, daysToExpiry: row.daysToExpiry, username: row.username, createdAt: row.createdAt }));
        }
        if (sql.includes("FROM conversations")) {
          return self.conversations.map((row) => ({ id: row.id, tenant_id: row.tenant_id, status: row.status, createdAt: row.createdAt, closedAt: row.closedAt, messages_json: row.messages_json }));
        }
        if (sql.includes("FROM configuration_groups")) {
          const tenant = params[0] ?? "";
          return self.configuration_groups.filter((row) => row.tenant_id === tenant).map((row) => ({ data: row.data, updated_at: row.updated_at }));
        }
        if (sql.includes("FROM device_reporting_settings")) {
          const tenant = params[0] ?? "";
          return self.device_reporting_settings.filter((row) => row.tenant_id === tenant).map((row) => ({ data: row.data, updated_at: row.updated_at }));
        }
        if (sql.includes("FROM device_artifacts")) {
          const tenant = params[0] ?? "";
          return self.device_artifacts.filter((row) => row.tenant_id === tenant).map((row) => ({ ...row }));
        }
        if (sql.includes("FROM device_push_queue")) {
          const tenant = params[0] ?? "";
          return self.device_push_queue.filter((row) => row.tenant_id === tenant).map((row) => ({ ...row }));
        }
        if (sql.includes("FROM traccar_outbox")) {
          if (sql.includes("status IN ('queued','retry')")) {
            const availableAt = String(params[0] ?? "");
            const limit = Number(params[1] ?? 10);
            return self.traccar_outbox
              .filter((row) => (row.status === "queued" || row.status === "retry") && String(row.available_at ?? "") <= availableAt)
              .sort((left, right) => (String(left.created_at ?? "") > String(right.created_at ?? "") ? 1 : -1))
              .slice(0, Number.isFinite(limit) ? limit : 10)
              .map((row) => ({ ...row }));
          }
          const tenant = params[0] ?? "";
          if (!tenant) return self.traccar_outbox.map((row) => ({ ...row }));
          return self.traccar_outbox.filter((row) => row.tenant_id === tenant).map((row) => ({ ...row }));
        }
        if (sql.includes("FROM camera_health")) {
          const tenant = params[0] ?? "";
          return self.camera_health
            .filter((row) => row.tenant_id === tenant)
            .sort((left, right) => (String(left.updated_at ?? "") < String(right.updated_at ?? "") ? 1 : -1))
            .map((row) => ({ camera_id: row.camera_id, data: row.data, updated_at: row.updated_at }));
        }
        return [];
      },
      get(...params: any[]) {
        if (sql.includes("FROM device_reporting_settings")) {
          const tenant = params[0] ?? "";
          return self.device_reporting_settings.find((row) => row.tenant_id === tenant) ?? null;
        }
        if (sql.includes("FROM conversations WHERE id = ?")) {
          const id = params[0];
          return self.conversations.find((row) => row.id === id) ?? null;
        }
        if (sql.includes("FROM device_artifacts")) {
          const tenant = params[0] ?? "";
          if (sql.includes("type = ?")) {
            const type = params[1] ?? "";
            const rows = self.device_artifacts.filter((row) => row.tenant_id === tenant && row.type === type);
            rows.sort((left, right) => {
              const baseDiff = Number(right.is_base ?? 0) - Number(left.is_base ?? 0);
              if (baseDiff !== 0) return baseDiff;
              return String(left.created_at ?? "") < String(right.created_at ?? "") ? 1 : -1;
            });
            return rows[0] ?? null;
          }
          const id = params[1] ?? "";
          return self.device_artifacts.find((row) => row.tenant_id === tenant && row.id === id) ?? null;
        }
        if (sql.includes("FROM device_push_queue")) {
          const tenant = params[0] ?? "";
          const imei = params[1] ?? "";
          const row = self.device_push_queue
            .filter((candidate) => candidate.tenant_id === tenant && candidate.imei === imei && candidate.status === "queued")
            .sort((left, right) => (left.created_at < right.created_at ? 1 : -1))[0];
          return row ?? null;
        }
        if (sql.includes("FROM traccar_outbox")) {
          if (sql.includes("COUNT(*)")) {
            const pending = self.traccar_outbox.filter(
              (row) => row.status === "queued" || row.status === "retry" || row.status === "processing"
            );
            return { count: pending.length };
          }
          if (sql.includes("tenant_id = ? AND id = ?")) {
            const tenant = params[0] ?? "";
            const id = params[1] ?? "";
            return self.traccar_outbox.find((row) => row.tenant_id === tenant && row.id === id) ?? null;
          }
          if (sql.includes("id = ?")) {
            const id = params[0] ?? "";
            return self.traccar_outbox.find((row) => row.id === id) ?? null;
          }
        }
        if (sql.includes("FROM camera_health")) {
          if (sql.includes("camera_id = ?") && sql.includes("tenant_id = ?")) {
            const tenant = params[0] ?? "";
            const cameraId = params[1] ?? "";
            const row = self.camera_health
              .filter((candidate) => candidate.tenant_id === tenant && candidate.camera_id === cameraId)
              .sort((left, right) => (String(left.updated_at ?? "") < String(right.updated_at ?? "") ? 1 : -1))[0];
            return row ?? null;
          }
          if (sql.includes("camera_id = ?") && !sql.includes("tenant_id = ?")) {
            const cameraId = params[0] ?? "";
            const row = self.camera_health
              .filter((candidate) => candidate.camera_id === cameraId)
              .sort((left, right) => (String(left.updated_at ?? "") < String(right.updated_at ?? "") ? 1 : -1))[0];
            return row ?? null;
          }
        }
        if (sql.includes("FROM camera_audio_chunks")) {
          const tenant = params[0] ?? "";
          const cameraId = params[1] ?? "";
          const row = self.camera_audio_chunks
            .filter((candidate) => candidate.tenant_id === tenant && candidate.camera_id === cameraId)
            .sort((left, right) => (String(left.created_at ?? "") < String(right.created_at ?? "") ? 1 : -1))[0];
          return row ?? null;
        }
        if (sql.includes("FROM talkback_queue")) {
          const tenant = params[0] ?? "";
          const cameraId = params[1] ?? "";
          const row = self.talkback_queue
            .filter((candidate) => candidate.tenant_id === tenant && candidate.camera_id === cameraId && candidate.status === "queued")
            .sort((left, right) => (String(left.created_at ?? "") > String(right.created_at ?? "") ? 1 : -1))[0];
          return row ?? null;
        }
        if (sql.includes("FROM deliver_store")) {
          const tenantId = params[0] ?? "";
          return self.deliver_store.find((row) => row.tenant_id === tenantId) ?? null;
        }
        if (sql.includes("FROM operational_hierarchies")) {
          const regionId = params[0] ?? "";
          return self.operational_hierarchies.find((row) => row.region_id === regionId) ?? null;
        }
        if (sql.includes("FROM operational_realtime_state")) {
          const tenantId = params[0] ?? "";
          const key = params[1] ?? "";
          return (
            self.operational_realtime_state.find(
              (row) => row.tenant_id === tenantId && row.k === key
            ) ?? null
          );
        }
        return null;
      },
      run(...params: any[]) {
        if (sql.startsWith("INSERT OR REPLACE INTO assets")) {
          const [id, tenant_id, data, updated_at] = params;
          const index = self.assets.findIndex((row) => row.id === id && row.tenant_id === tenant_id);
          const record = { id, tenant_id, data: typeof data === "string" ? JSON.parse(data) : data, updated_at };
          if (index >= 0) self.assets[index] = record;
          else self.assets.push(record);
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO telemetry_events")) {
          const [id, tenant_id, type, asset_id, imei, created_at, data] = params;
          self.telemetry_events.unshift({ id, tenant_id, type, asset_id, imei, created_at, data: typeof data === "string" ? JSON.parse(data) : data });
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT OR REPLACE INTO alerts")) {
          const [id, tenant_id, data, updated_at] = params;
          const index = self.alerts.findIndex((row) => row.id === id && row.tenant_id === tenant_id);
          const record = { id, tenant_id, data: typeof data === "string" ? JSON.parse(data) : data, updated_at };
          if (index >= 0) self.alerts[index] = record;
          else self.alerts.push(record);
          return { changes: 1 };
        }
        if (sql.startsWith("DELETE FROM alerts")) {
          const [tenant_id, id] = params;
          const before = self.alerts.length;
          self.alerts = self.alerts.filter((row) => !(row.tenant_id === tenant_id && row.id === id));
          return { changes: before - self.alerts.length };
        }
        if (sql.startsWith("INSERT INTO pats")) {
          const [id, token, description, organisationName, organisationGroup, expiryDate, status, daysToExpiry, username, createdAt, data] = params;
          self.pats.push({ id, token, description, organisationName, organisationGroup, expiryDate, status, daysToExpiry, username, createdAt, data });
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO conversations")) {
          const [id, tenant_id, status, createdAt, messages_json] = params;
          self.conversations.push({ id, tenant_id, status, createdAt, messages_json });
          return { changes: 1 };
        }
        if (sql.startsWith("UPDATE conversations SET messages_json = ? WHERE id = ?")) {
          const [messages_json, id] = params;
          const conversation = self.conversations.find((row) => row.id === id);
          if (conversation) conversation.messages_json = messages_json;
          return { changes: conversation ? 1 : 0 };
        }
        if (sql.startsWith("UPDATE conversations SET status = ?")) {
          const [status, closedAt, id] = params;
          const conversation = self.conversations.find((row) => row.id === id);
          if (conversation) {
            conversation.status = status;
            conversation.closedAt = closedAt;
          }
          return { changes: conversation ? 1 : 0 };
        }
        if (sql.startsWith("INSERT INTO configuration_groups")) {
          const [id, tenant_id, data, updated_at] = params;
          const index = self.configuration_groups.findIndex((row) => row.id === id && row.tenant_id === tenant_id);
          const record = { id, tenant_id, data: typeof data === "string" ? JSON.parse(data) : data, updated_at };
          if (index >= 0) self.configuration_groups[index] = record;
          else self.configuration_groups.push(record);
          return { changes: 1 };
        }
        if (sql.startsWith("DELETE FROM configuration_groups")) {
          const [tenant_id, id] = params;
          const before = self.configuration_groups.length;
          self.configuration_groups = self.configuration_groups.filter((row) => !(row.tenant_id === tenant_id && row.id === id));
          return { changes: before - self.configuration_groups.length };
        }
        if (sql.startsWith("INSERT INTO device_reporting_settings")) {
          const [tenant_id, data, updated_at] = params;
          const index = self.device_reporting_settings.findIndex((row) => row.tenant_id === tenant_id);
          const record = { tenant_id, data: typeof data === "string" ? JSON.parse(data) : data, updated_at };
          if (index >= 0) self.device_reporting_settings[index] = record;
          else self.device_reporting_settings.push(record);
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO device_artifacts")) {
          const [id, tenant_id, type, name, version, r2_key, content_type, sha256, is_base, created_at] = params;
          self.device_artifacts.push({ id, tenant_id, type, name, version, r2_key, content_type, sha256, is_base, created_at });
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO device_push_queue")) {
          const [id, tenant_id, imei, asset_id, status, payload, created_at, updated_at] = params;
          self.device_push_queue.push({ id, tenant_id, imei, asset_id, status, payload, created_at, updated_at });
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO traccar_outbox")) {
          const [id, tenant_id, job_type, status, payload, attempts, available_at, created_at, updated_at, last_error] = params;
          self.traccar_outbox.push({
            id,
            tenant_id,
            job_type,
            status,
            payload,
            attempts,
            available_at,
            created_at,
            updated_at,
            last_error,
            processed_at: ""
          });
          return { changes: 1 };
        }
        if (sql.startsWith("UPDATE traccar_outbox SET status = 'processing'")) {
          const [attempts, updated_at, last_error, id] = params;
          const record = self.traccar_outbox.find((row) => row.id === id && (row.status === "queued" || row.status === "retry"));
          if (!record) return { changes: 0 };
          record.status = "processing";
          record.attempts = attempts;
          record.updated_at = updated_at;
          record.last_error = last_error;
          return { changes: 1 };
        }
        if (sql.startsWith("UPDATE traccar_outbox SET status = 'processed'")) {
          const [processed_at, updated_at, id] = params;
          const record = self.traccar_outbox.find((row) => row.id === id);
          if (!record) return { changes: 0 };
          record.status = "processed";
          record.processed_at = processed_at;
          record.updated_at = updated_at;
          record.last_error = "";
          return { changes: 1 };
        }
        if (sql.startsWith("UPDATE traccar_outbox SET status = ?")) {
          const [status, available_at, updated_at, last_error, id] = params;
          const record = self.traccar_outbox.find((row) => row.id === id);
          if (!record) return { changes: 0 };
          record.status = status;
          record.available_at = available_at;
          record.updated_at = updated_at;
          record.last_error = last_error;
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT OR REPLACE INTO camera_health")) {
          const [camera_id, tenant_id, data, updated_at] = params;
          const index = self.camera_health.findIndex((row) => row.camera_id === camera_id && row.tenant_id === tenant_id);
          const record = { camera_id, tenant_id, data: typeof data === "string" ? JSON.parse(data) : data, updated_at };
          if (index >= 0) self.camera_health[index] = record;
          else self.camera_health.push(record);
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO camera_audio_chunks")) {
          const [id, tenant_id, camera_id, recorded_at, sample_rate, channels, bytes, file_path, created_at] = params;
          self.camera_audio_chunks.push({ id, tenant_id, camera_id, recorded_at, sample_rate, channels, bytes, file_path, created_at });
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO talkback_queue")) {
          const [id, tenant_id, camera_id, sample_rate, channels, payload_base64, created_at] = params;
          self.talkback_queue.push({ id, tenant_id, camera_id, sample_rate, channels, payload_base64, status: "queued", created_at, delivered_at: "" });
          return { changes: 1 };
        }
        if (sql.startsWith("UPDATE talkback_queue SET status = 'delivering'")) {
          const [id] = params;
          const record = self.talkback_queue.find((row) => row.id === id && row.status === "queued");
          if (record) {
            record.status = "delivering";
            return { changes: 1 };
          }
          return { changes: 0 };
        }
        if (sql.startsWith("UPDATE talkback_queue SET status = 'delivered'")) {
          const [delivered_at, id, tenant_id] = params;
          const record = self.talkback_queue.find((row) => row.id === id && row.tenant_id === tenant_id);
          if (record) {
            record.status = "delivered";
            record.delivered_at = delivered_at;
            return { changes: 1 };
          }
          return { changes: 0 };
        }
        if (sql.startsWith("UPDATE device_push_queue SET status = 'delivered'")) {
          const [updated_at, tenant_id, id, imei] = params;
          const record = self.device_push_queue.find((row) => row.tenant_id === tenant_id && row.id === id && row.imei === imei);
          if (record) {
            record.status = "delivered";
            record.updated_at = updated_at;
            return { changes: 1 };
          }
          if (sql.startsWith("INSERT INTO deliver_store") || sql.startsWith("INSERT OR REPLACE INTO deliver_store")) {
            const [storeTenantId, data, storeUpdatedAt] = params;
            const index = self.deliver_store.findIndex((row) => row.tenant_id === storeTenantId);
            const deliverStoreRecord = { tenant_id: storeTenantId, data: String(data ?? ""), updated_at: storeUpdatedAt };
            if (index >= 0) self.deliver_store[index] = deliverStoreRecord;
            else self.deliver_store.push(deliverStoreRecord);
            return { changes: 1 };
          }
          return { changes: 0 };
        }
        if (sql.startsWith("INSERT INTO operational_hierarchies")) {
          const [region_id, data, updated_at] = params;
          const index = self.operational_hierarchies.findIndex((row) => row.region_id === region_id);
          const record = { region_id, data: String(data ?? ""), updated_at };
          if (index >= 0) self.operational_hierarchies[index] = record;
          else self.operational_hierarchies.push(record);
          return { changes: 1 };
        }
        if (sql.startsWith("INSERT INTO operational_realtime_state")) {
          const [tenant_id, k, data, expires_at, updated_at] = params;
          const index = self.operational_realtime_state.findIndex(
            (row) => row.tenant_id === tenant_id && row.k === k
          );
          const record = { tenant_id, k, data, expires_at, updated_at };
          if (index >= 0) self.operational_realtime_state[index] = record;
          else self.operational_realtime_state.push(record);
          return { changes: 1 };
        }
        if (sql.startsWith("DELETE FROM operational_realtime_state")) {
          const [tenant_id, k] = params;
          const before = self.operational_realtime_state.length;
          self.operational_realtime_state = self.operational_realtime_state.filter(
            (row) => !(row.tenant_id === tenant_id && row.k === k)
          );
          return { changes: before - self.operational_realtime_state.length };
        }
        return { changes: 0 };
      }
    };
  }
}

const SQLITE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS assets (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS drivers (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS telemetry_events (id TEXT, tenant_id TEXT, type TEXT, asset_id TEXT, imei TEXT, created_at TEXT, data TEXT, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS telemetry_archives (event_id TEXT, tenant_id TEXT, asset_id TEXT, imei TEXT, created_at TEXT, storage TEXT, storage_key TEXT, content_type TEXT, size_bytes INTEGER, PRIMARY KEY (event_id, tenant_id));
  CREATE TABLE IF NOT EXISTS alerts (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS pats (id TEXT PRIMARY KEY, token TEXT, description TEXT, organisationName TEXT, organisationGroup TEXT, expiryDate TEXT, status TEXT, daysToExpiry INTEGER, username TEXT, createdAt TEXT, data TEXT);
  CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, tenant_id TEXT, status TEXT, createdAt TEXT, closedAt TEXT, user_json TEXT, messages_json TEXT);
  CREATE TABLE IF NOT EXISTS bindings (id TEXT, tenant_id TEXT NOT NULL, type TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id, type));
  CREATE TABLE IF NOT EXISTS configuration_groups (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS asset_meta (id TEXT NOT NULL, tenant_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS cameras (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS device_reporting_settings (tenant_id TEXT PRIMARY KEY, data TEXT, updated_at TEXT);
  CREATE TABLE IF NOT EXISTS device_artifacts (id TEXT, tenant_id TEXT, type TEXT, name TEXT, version TEXT, r2_key TEXT, content_type TEXT, sha256 TEXT, is_base INTEGER, created_at TEXT, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS device_sync_jobs (
    job_id TEXT,
    tenant_id TEXT,
    asset_id TEXT,
    operation TEXT,
    payload TEXT,
    status TEXT,
    error TEXT,
    last_attempt_at TEXT,
    created_at TEXT,
    updated_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TEXT,
    PRIMARY KEY (job_id, tenant_id)
  );
  CREATE TABLE IF NOT EXISTS notification_sync_jobs (
    job_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    binding_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    last_attempt_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (job_id, tenant_id)
  );
  CREATE TABLE IF NOT EXISTS site_asset_seq (
    site TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    next_seq INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (site, tenant_id)
  );
  CREATE TABLE IF NOT EXISTS traccar_computed_attribute_mappings (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    traccar_attribute_id INTEGER NOT NULL,
    binding_id TEXT,
    attribute_name TEXT NOT NULL,
    description TEXT,
    expression TEXT NOT NULL,
    type TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    group_id INTEGER,
    device_id INTEGER,
    created_by TEXT,
    created_at TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (id, tenant_id)
  );
  CREATE TABLE IF NOT EXISTS traccar_webhook_logs (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    event_type TEXT,
    imei TEXT,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (id, tenant_id)
  );
  CREATE TABLE IF NOT EXISTS trips (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS warehouses (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS report_archives (
    report_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    site TEXT,
    title TEXT,
    created_at TEXT NOT NULL,
    storage TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    content_type TEXT,
    size_bytes INTEGER,
    PRIMARY KEY (report_id, tenant_id)
  );
  CREATE TABLE IF NOT EXISTS device_push_queue (id TEXT, tenant_id TEXT, imei TEXT, asset_id TEXT, status TEXT, payload TEXT, created_at TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS traccar_outbox (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    job_type TEXT,
    status TEXT,
    payload TEXT,
    attempts INTEGER,
    available_at TEXT,
    created_at TEXT,
    updated_at TEXT,
    processed_at TEXT,
    last_error TEXT
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, created_at TEXT, expires_at TEXT);
  CREATE TABLE IF NOT EXISTS password_reset_requests (id TEXT PRIMARY KEY, email TEXT, tenant_id TEXT, ip TEXT, user_agent TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS deliver_store (tenant_id TEXT PRIMARY KEY, data TEXT, updated_at TEXT);
  CREATE TABLE IF NOT EXISTS operational_hierarchies (region_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS operational_realtime_state (
    tenant_id TEXT NOT NULL,
    k TEXT NOT NULL,
    data TEXT NOT NULL,
    expires_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, k)
  );
  CREATE TABLE IF NOT EXISTS rbac_roles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    role_level INTEGER NOT NULL DEFAULT 100,
    standard_role_key TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS rbac_security_groups (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS rbac_user_roles (
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (tenant_id, user_id, role_id)
  );
  CREATE TABLE IF NOT EXISTS rbac_user_groups (
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    PRIMARY KEY (tenant_id, user_id, group_id)
  );
  CREATE TABLE IF NOT EXISTS rbac_group_roles (
    tenant_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (tenant_id, group_id, role_id)
  );
  CREATE TABLE IF NOT EXISTS rbac_user_tenants (
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS rbac_user_sites (
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    site_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, user_id, site_id)
  );
  CREATE TABLE IF NOT EXISTS rbac_role_permissions (
    tenant_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    page_path TEXT NOT NULL,
    can_view INTEGER NOT NULL,
    can_edit INTEGER NOT NULL,
    can_delete INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, role_id, page_path)
  );
  CREATE TABLE IF NOT EXISTS rbac_user_regions (
    user_id TEXT NOT NULL,
    region TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, region)
  );
  CREATE TABLE IF NOT EXISTS support_agents (id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (id, tenant_id));
  CREATE TABLE IF NOT EXISTS kv_store (k TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (k, tenant_id));
  CREATE TABLE IF NOT EXISTS camera_health (camera_id TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (camera_id, tenant_id));
  CREATE TABLE IF NOT EXISTS camera_audio_chunks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    camera_id TEXT,
    recorded_at TEXT,
    sample_rate INTEGER,
    channels INTEGER,
    bytes INTEGER,
    file_path TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS talkback_queue (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    camera_id TEXT,
    sample_rate INTEGER,
    channels INTEGER,
    payload_base64 TEXT,
    status TEXT,
    created_at TEXT,
    delivered_at TEXT
  );
`;

const SQLITE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_assets_tenant_updated ON assets (tenant_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_alerts_tenant_updated ON alerts (tenant_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_cfg_groups_tenant_updated ON configuration_groups (tenant_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_bindings_tenant_type ON bindings (tenant_id, type);
  CREATE INDEX IF NOT EXISTS idx_tel_events_tenant_created ON telemetry_events (tenant_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_tel_events_tenant_imei_created ON telemetry_events (tenant_id, imei, created_at);
  CREATE INDEX IF NOT EXISTS idx_tel_events_tenant_asset_created ON telemetry_events (tenant_id, asset_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_tel_archives_tenant_event ON telemetry_archives (tenant_id, event_id);
  CREATE INDEX IF NOT EXISTS idx_device_artifacts_tenant_type_base_created ON device_artifacts (tenant_id, type, is_base, created_at);
  CREATE INDEX IF NOT EXISTS idx_report_archives_storage_created ON report_archives (storage, created_at);
  CREATE INDEX IF NOT EXISTS idx_push_queue_status_tenant_imei ON device_push_queue (status, tenant_id, imei, created_at);
  CREATE INDEX IF NOT EXISTS idx_device_sync_jobs_status_available ON device_sync_jobs (status, available_at, created_at);
  CREATE INDEX IF NOT EXISTS idx_notification_sync_jobs_status_created ON notification_sync_jobs (status, created_at);
  CREATE INDEX IF NOT EXISTS idx_traccar_computed_attr_map_tenant_attr ON traccar_computed_attribute_mappings (tenant_id, traccar_attribute_id);
  CREATE INDEX IF NOT EXISTS idx_traccar_computed_attr_map_tenant_binding ON traccar_computed_attribute_mappings (tenant_id, binding_id);
  CREATE INDEX IF NOT EXISTS idx_traccar_webhook_logs_tenant_imei_created ON traccar_webhook_logs (tenant_id, imei, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_traccar_webhook_logs_tenant_kind_created ON traccar_webhook_logs (tenant_id, kind, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_traccar_outbox_status_available ON traccar_outbox (status, available_at, created_at);
  CREATE INDEX IF NOT EXISTS idx_rbac_roles_tenant ON rbac_roles (tenant_id);
  CREATE INDEX IF NOT EXISTS idx_rbac_groups_tenant ON rbac_security_groups (tenant_id);
  CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_user ON rbac_user_roles (user_id);
  CREATE INDEX IF NOT EXISTS idx_rbac_user_groups_user ON rbac_user_groups (user_id);
  CREATE INDEX IF NOT EXISTS idx_rbac_user_tenants_user ON rbac_user_tenants (user_id);
  CREATE INDEX IF NOT EXISTS idx_rbac_user_sites_user ON rbac_user_sites (user_id);
  CREATE INDEX IF NOT EXISTS idx_rbac_role_perms_role ON rbac_role_permissions (role_id);
  CREATE INDEX IF NOT EXISTS idx_rbac_user_regions_region ON rbac_user_regions (region);
  CREATE INDEX IF NOT EXISTS idx_camera_health_tenant_updated ON camera_health (tenant_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_talkback_queue_status_tenant_camera ON talkback_queue (status, tenant_id, camera_id, created_at);
`;

const BINDINGS_TENANT_MIGRATION_ID = "bindings-tenant-scoped-v1";

function migrateBindingsTable(db: BackendDbLike) {
  try {
    db.exec("CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT);");
    const alreadyApplied = db.prepare("SELECT 1 AS ok FROM migrations WHERE id = ?1 LIMIT 1").get(BINDINGS_TENANT_MIGRATION_ID) as
      | { ok?: number }
      | undefined;
    if (alreadyApplied?.ok) return;

    const columns = db.prepare("PRAGMA table_info(bindings)").all() as Array<{ name?: string }>;
    const hasTenantId = columns.some((column) => String(column?.name ?? "") === "tenant_id");
    if (hasTenantId) {
      db.prepare("INSERT OR IGNORE INTO migrations (id, applied_at) VALUES (?1, datetime('now'))").run(BINDINGS_TENANT_MIGRATION_ID);
      return;
    }

    const sourceCountRow = db.prepare("SELECT COUNT(*) AS c FROM bindings").get() as { c?: number } | undefined;
    const sourceCount = Number(sourceCountRow?.c ?? 0);

    db.exec(`
      CREATE TABLE IF NOT EXISTS bindings_migrated (
        id TEXT,
        tenant_id TEXT NOT NULL,
        type TEXT,
        data TEXT,
        updated_at TEXT,
        PRIMARY KEY (id, tenant_id, type)
      )
    `);
    try {
      db.exec(`
        INSERT OR IGNORE INTO bindings_migrated (id, tenant_id, type, data, updated_at)
        SELECT
          COALESCE(NULLIF(TRIM(id), ''), 'legacy-' || ROW_NUMBER() OVER (ORDER BY type, id)),
          'default',
          type,
          data,
          COALESCE(NULLIF(TRIM(updated_at), ''), datetime('now'))
        FROM bindings
      `);
    } catch {
      try {
        db.exec(`
          INSERT OR IGNORE INTO bindings_migrated (id, tenant_id, type, data, updated_at)
          SELECT COALESCE(NULLIF(TRIM(id), ''), 'legacy-' || ROW_NUMBER() OVER (ORDER BY type, id)), 'default', type, data, datetime('now')
          FROM bindings
        `);
      } catch {
        // Do not drop the legacy table if copy failed — avoids data loss on deploy restart.
        return;
      }
    }

    const migratedCountRow = db.prepare("SELECT COUNT(*) AS c FROM bindings_migrated").get() as { c?: number } | undefined;
    const migratedCount = Number(migratedCountRow?.c ?? 0);
    if (sourceCount > 0 && migratedCount < sourceCount) {
      return;
    }

    db.exec("DROP TABLE IF EXISTS bindings");
    db.exec("ALTER TABLE bindings_migrated RENAME TO bindings");
    db.exec("CREATE INDEX IF NOT EXISTS idx_bindings_tenant_type ON bindings (tenant_id, type)");
    db.prepare("INSERT OR IGNORE INTO migrations (id, applied_at) VALUES (?1, datetime('now'))").run(BINDINGS_TENANT_MIGRATION_ID);
  } catch {
    // ignore migration errors — legacy table remains intact
  }
}

export function createBackendDb(deps: CreateBackendDbDeps): BackendDbLike {
  const { DatabaseCtor, dbPath, requirePersistentDb, fsModule, pathModule } = deps;

  if (DatabaseCtor) {
    let db: BackendDbLike;
    try {
      const dbDir = pathModule.dirname(dbPath);
      if (dbDir) fsModule.mkdirSync(dbDir, { recursive: true });
      db = new DatabaseCtor(dbPath);
    } catch (error: any) {
      throw new Error(`Failed to open SQLite DB at ${dbPath}: ${error?.message ?? String(error)}`);
    }

    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA synchronous = NORMAL;");
    db.exec(SQLITE_SCHEMA_SQL);
    db.exec(SQLITE_INDEX_SQL);
    migrateBindingsTable(db);
    try {
      db.exec("CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT);");
      try {
        const userVersionRow: any = db.prepare("PRAGMA user_version").get();
        let userVersion = 0;
        if (userVersionRow && typeof userVersionRow.user_version !== "undefined") userVersion = Number(userVersionRow.user_version);
        else if (typeof userVersionRow === "number") userVersion = Number(userVersionRow);
        if (!userVersion) db.exec("PRAGMA user_version = 1;");
      } catch {
        // ignore pragma support differences across runtimes
      }
    } catch {
      // ignore migrations table creation errors
    }
    return db;
  }

  if (requirePersistentDb) {
    throw new Error(
      "Persistent DB is required but better-sqlite3 is unavailable. " +
      "Install dependencies on VPS with 'npm ci' and ensure native module build prerequisites are present."
    );
  }

  return new InMemoryDB();
}
