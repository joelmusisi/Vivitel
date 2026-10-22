import type { Express } from "express";
import { D1_CREDENTIAL_TABLES, extractD1WriteTables, extractOperationalSqlTables, isD1WriteSql } from "../../shared/operationalSqlPolicy";

type SqlOperation = "all" | "run" | "exec";

type SqlRequest = {
  sql: string;
  params?: unknown[];
  operation: SqlOperation;
};

const MAX_KV_VALUE_BYTES = 25 * 1024 * 1024;
const MAX_KV_METADATA_BYTES = 1024;
const MAX_KV_KEY_LENGTH = 512;

function validateSql(sql: string): string[] {
  const text = String(sql ?? "").trim();
  if (!text || text.includes(";")) {
    throw new Error("Exactly one SQL statement is required.");
  }
  if (/\b(?:pragma|attach|detach|vacuum|reindex|analyze)\b/i.test(text)) {
    throw new Error("SQLite administrative statements are not available through the Worker storage API.");
  }
  const tables = extractOperationalSqlTables(text);
  const allTables = new Set([...tables, ...extractD1WriteTables(text)]);
  if ([...allTables].some((table) => D1_CREDENTIAL_TABLES.has(table))) {
    throw new Error("Credential and authorization tables are available only through D1.");
  }
  if (isD1WriteSql(text) && allTables.size === 0) {
    throw new Error("Operational SQL writes must target an application table.");
  }
  return [...allTables];
}

function runSql(db: any, request: SqlRequest) {
  const sql = String(request.sql ?? "").trim();
  const tables = validateSql(sql);
  const params = Array.isArray(request.params) ? request.params : [];
  if (request.operation === "all" && isD1WriteSql(sql)) {
    throw new Error("The all operation cannot execute SQL writes.");
  }
  const startedAt = Date.now();
  if (request.operation === "all") {
    const results = db.prepare(sql).all(...params);
    return {
      results,
      meta: { duration: Date.now() - startedAt, rows_read: results.length, rows_written: 0 }
    };
  }
  if (request.operation === "exec") {
    if (isD1WriteSql(sql)) {
      const result = db.prepare(sql).run(...params);
      return {
        results: [],
        meta: {
          duration: Date.now() - startedAt,
          changes: Number(result.changes ?? 0),
          last_row_id: Number(result.lastInsertRowid ?? 0),
          rows_written: Number(result.changes ?? 0),
          table_count: tables.length
        }
      };
    }
    db.prepare(sql).all(...params);
    return { results: [], meta: { duration: Date.now() - startedAt, rows_read: 0, rows_written: 0 } };
  }
  if (request.operation !== "run") throw new Error("Unsupported SQL operation.");
  const result = db.prepare(sql).run(...params);
  return {
    results: [],
    meta: {
      duration: Date.now() - startedAt,
      changes: Number(result.changes ?? 0),
      last_row_id: Number(result.lastInsertRowid ?? 0),
      rows_written: Number(result.changes ?? 0)
    }
  };
}

function validateKvKey(value: unknown): string {
  const key = String(value ?? "");
  if (!key || key.length > MAX_KV_KEY_LENGTH) {
    throw new Error(`key must contain between 1 and ${MAX_KV_KEY_LENGTH} characters.`);
  }
  return key;
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function parseMetadata(value: unknown): string | null {
  if (value == null) return null;
  if (jsonBytes(value) > MAX_KV_METADATA_BYTES) {
    throw new Error("metadata must be no larger than 1024 bytes.");
  }
  return JSON.stringify(value);
}

function requireWorkerStorageRequest(req: any, res: any, requireApiKey: (req: any, res: any) => boolean) {
  if (!requireApiKey(req, res)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (String(req.header("x-vivi-forwarded-by") ?? "") !== "cloudflare-worker") {
    res.status(403).json({ error: "Worker storage API is internal." });
    return false;
  }
  return true;
}

export function registerOperationalWorkerStorageRoutes(deps: {
  app: Express;
  db: any;
  requireApiKey: (req: any, res: any) => boolean;
}): void {
  const { app, db, requireApiKey } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS worker_kv (
      k TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      encoding TEXT NOT NULL DEFAULT 'text',
      metadata TEXT,
      expiration INTEGER,
      updated_at TEXT NOT NULL
    )
  `);

  app.get("/operational/kv", (req, res) => {
    if (!requireWorkerStorageRequest(req, res, requireApiKey)) return;
    let key: string;
    try {
      key = validateKvKey(req.query.key);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    const row = db
      .prepare("SELECT value, encoding, metadata, expiration FROM worker_kv WHERE k = ?")
      .get(key) as { value?: string; encoding?: string; metadata?: string | null; expiration?: number | null } | undefined;
    if (!row) return res.json({ value: null });
    const expiration = Number(row.expiration ?? 0) || null;
    if (expiration && expiration <= Math.floor(Date.now() / 1000)) {
      db.prepare("DELETE FROM worker_kv WHERE k = ?").run(key);
      return res.json({ value: null });
    }
    let metadata: unknown = null;
    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : null;
    } catch {
      return res.status(500).json({ error: "Stored Worker KV metadata is invalid JSON." });
    }
    return res.json({
      value: String(row.value ?? ""),
      encoding: String(row.encoding ?? "text"),
      metadata,
      expiration
    });
  });

  app.post("/operational/kv", (req, res) => {
    if (!requireWorkerStorageRequest(req, res, requireApiKey)) return;
    let key: string;
    let metadata: string | null;
    try {
      key = validateKvKey(req.body?.key);
      metadata = parseMetadata(req.body?.metadata);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    const value = String(req.body?.value ?? "");
    const encoding = String(req.body?.encoding ?? "text");
    if (!["text", "base64"].includes(encoding)) {
      return res.status(400).json({ error: "encoding must be text or base64." });
    }
    const encodedValueBytes =
      encoding === "base64"
        ? Math.floor((value.length * 3) / 4) - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0)
        : Buffer.byteLength(value, "utf8");
    if (encodedValueBytes > MAX_KV_VALUE_BYTES) {
      return res.status(413).json({ error: "value exceeds the 25 MiB Worker KV limit." });
    }

    const expirationTtl = req.body?.expirationTtl == null ? null : Number(req.body.expirationTtl);
    const expiration = req.body?.expiration == null ? null : Number(req.body.expiration);
    if (
      (expirationTtl !== null && (!Number.isInteger(expirationTtl) || expirationTtl < 60)) ||
      (expiration !== null && (!Number.isInteger(expiration) || expiration <= Math.floor(Date.now() / 1000)))
    ) {
      return res.status(400).json({ error: "expiration must be a future epoch second and expirationTtl at least 60." });
    }
    const expiresAt = expirationTtl !== null ? Math.floor(Date.now() / 1000) + expirationTtl : expiration;
    db.prepare(
      `INSERT INTO worker_kv (k, value, encoding, metadata, expiration, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(k) DO UPDATE SET
         value = excluded.value,
         encoding = excluded.encoding,
         metadata = excluded.metadata,
         expiration = excluded.expiration,
         updated_at = excluded.updated_at`
    ).run(key, value, encoding, metadata, expiresAt, new Date().toISOString());
    return res.json({ stored: true });
  });

  app.post("/operational/kv/delete", (req, res) => {
    if (!requireWorkerStorageRequest(req, res, requireApiKey)) return;
    let key: string;
    try {
      key = validateKvKey(req.body?.key);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    db.prepare("DELETE FROM worker_kv WHERE k = ?").run(key);
    return res.json({ deleted: true });
  });

  app.get("/operational/kv/list", (req, res) => {
    if (!requireWorkerStorageRequest(req, res, requireApiKey)) return;
    const prefix = String(req.query.prefix ?? "");
    const requestedLimit = Number(req.query.limit ?? 1000);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 1000)) : 1000;
    const requestedOffset = Number(req.query.cursor ?? 0);
    const offset = Number.isInteger(requestedOffset) ? Math.max(0, requestedOffset) : 0;
    db.prepare("DELETE FROM worker_kv WHERE expiration IS NOT NULL AND expiration <= ?")
      .run(Math.floor(Date.now() / 1000));
    const rows = db
      .prepare(
        `SELECT k, expiration, metadata FROM worker_kv
         WHERE substr(k, 1, length(?)) = ?
         ORDER BY k LIMIT ? OFFSET ?`
      )
      .all(prefix, prefix, limit + 1, offset) as Array<{
      k?: string;
      expiration?: number | null;
      metadata?: string | null;
    }>;
    const hasMore = rows.length > limit;
    const keys = rows.slice(0, limit).map((row) => {
      let metadata: unknown = null;
      try {
        metadata = row.metadata ? JSON.parse(row.metadata) : null;
      } catch {
        throw new Error("Stored Worker KV metadata is invalid JSON.");
      }
      return {
        name: String(row.k ?? ""),
        ...(row.expiration == null ? {} : { expiration: Number(row.expiration) }),
        ...(metadata == null ? {} : { metadata })
      };
    });
    return res.json({
      keys,
      list_complete: !hasMore,
      cursor: hasMore ? String(offset + limit) : ""
    });
  });

  app.post("/operational/sql", (req, res) => {
    if (!requireWorkerStorageRequest(req, res, requireApiKey)) return;
    try {
      return res.json(runSql(db, req.body as SqlRequest));
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/operational/sql/batch", (req, res) => {
    if (!requireWorkerStorageRequest(req, res, requireApiKey)) return;
    const statements = req.body?.statements;
    if (!Array.isArray(statements) || statements.length > 100) {
      return res.status(400).json({ error: "statements must be an array of at most 100 items." });
    }
    try {
      const results = db.transaction(() =>
        statements.map((statement: SqlRequest) => runSql(db, statement))
      )();
      return res.json({ results });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/operational/sql/exec", (req, res) => {
    if (!requireWorkerStorageRequest(req, res, requireApiKey)) return;
    try {
      const result = runSql(db, { sql: String(req.body?.sql ?? ""), operation: "exec" });
      return res.json({
        count: Number(result.meta?.changes ?? 0),
        duration: Number(result.meta?.duration ?? 0)
      });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });
}
