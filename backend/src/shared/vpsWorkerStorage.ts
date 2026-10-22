import {
  D1_CREDENTIAL_TABLES,
  extractD1WriteTables,
  extractOperationalSqlTables,
  isD1WriteSql
} from "./operationalSqlPolicy";
import { resolveVpsOrigin, type VpsProxyEnv } from "./vpsOperationalProxy";

type WorkerStorageEnv = VpsProxyEnv & {
  API_KEY?: string;
  API_KEY_PERMANENT?: string;
};

type WorkerD1Result<T = unknown> = {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
};

interface WorkerD1Statement {
  bind(...values: unknown[]): WorkerD1Statement;
  all<T = Record<string, unknown>>(): Promise<WorkerD1Result<T>>;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<WorkerD1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

interface WorkerD1Database {
  prepare(sql: string): WorkerD1Statement;
  batch(statements: WorkerD1Statement[]): Promise<WorkerD1Result[]>;
  exec(sql: string): Promise<{ count: number; duration: number }>;
  dump(): Promise<ArrayBuffer>;
}

type WorkerKvPutOptions = {
  expiration?: number;
  expirationTtl?: number;
  metadata?: unknown;
};

type WorkerKvListOptions = {
  prefix?: string;
  limit?: number;
  cursor?: string;
};

interface WorkerKvNamespace {
  get(key: string, options?: any): Promise<any>;
  getWithMetadata(key: string, options?: any): Promise<{ value: any; metadata: unknown }>;
  put(key: string, value: unknown, options?: WorkerKvPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: WorkerKvListOptions): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
    list_complete: boolean;
    cursor: string;
  }>;
}

type SqlOperation = "all" | "run" | "exec";

type RemoteSqlStatement = {
  sql: string;
  params: unknown[];
  operation: SqlOperation;
};

const statementMarker = Symbol("vps-worker-sql-statement");

type RoutedStatement = {
  [statementMarker]: RemoteSqlStatement;
};

export function statementUsesCredentials(sql: string): boolean {
  const tables = extractOperationalSqlTables(sql);
  if (tables.some((table) => D1_CREDENTIAL_TABLES.has(table))) {
    if (tables.some((table) => !D1_CREDENTIAL_TABLES.has(table))) {
      throw new Error("A SQL statement cannot mix D1 credentials with VPS operational data.");
    }
    return true;
  }
  return false;
}

function isWritableD1Statement(sql: string): boolean {
  return isD1WriteSql(sql);
}

function normalizeSqlParams(params: unknown[]): unknown[] {
  return params.map((value) => (value === undefined ? null : value));
}

/**
 * The VPS runs better-sqlite3, which rejects numbered placeholders (`?1`, `?2`) when values
 * are passed positionally ("Too many parameter values were provided"). D1 accepts them,
 * and much of the Worker's SQL is written that way. Rewrite to plain `?` and expand the
 * values in placeholder order (a repeated `?1` gets its value repeated). String literals,
 * quoted identifiers and comments are left alone.
 */
export function toPositionalSql(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  if (!/\?\d/.test(sql)) return { sql, params };
  let out = "";
  const values: unknown[] = [];
  let largest = 0;
  let index = 0;
  while (index < sql.length) {
    const ch = sql[index];
    if (ch === "'" || ch === '"' || ch === "`") {
      const end = sql.indexOf(ch, index + 1);
      const stop = end === -1 ? sql.length : end + 1;
      out += sql.slice(index, stop);
      index = stop;
      continue;
    }
    if (ch === "-" && sql[index + 1] === "-") {
      const end = sql.indexOf(String.fromCharCode(10), index);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(index, stop);
      index = stop;
      continue;
    }
    if (ch === "?") {
      const match = /^\?(\d+)/.exec(sql.slice(index));
      // SQLite: a bare `?` takes the number after the largest one used so far.
      const number = match ? Number(match[1]) : largest + 1;
      largest = Math.max(largest, number);
      values.push(params[number - 1] ?? null);
      out += "?";
      index += match ? match[0].length : 1;
      continue;
    }
    out += ch;
    index += 1;
  }
  return { sql: out, params: values };
}

async function postWorkerStorage<T>(
  env: WorkerStorageEnv,
  pathname: string,
  body: unknown
): Promise<T> {
  const origin = resolveVpsOrigin(env);
  if (!origin) throw new Error("VPS origin is not configured for Worker operational storage.");
  const headers = new Headers({
    "content-type": "application/json",
    "x-vivi-forwarded-by": "cloudflare-worker"
  });
  const apiKey = String(env.API_KEY ?? env.API_KEY_PERMANENT ?? "").trim();
  if (apiKey) headers.set("x-api-key", apiKey);

  const response = await fetch(`${origin}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload: any;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`VPS storage returned invalid JSON (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(
      `VPS storage request failed (${response.status}): ${String(payload?.error ?? text).slice(0, 300)}`
    );
  }
  return payload as T;
}

async function getWorkerStorage<T>(
  env: WorkerStorageEnv,
  pathname: string,
  params: Record<string, string>
): Promise<T> {
  const origin = resolveVpsOrigin(env);
  if (!origin) throw new Error("VPS origin is not configured for Worker operational storage.");
  const url = new URL(pathname, origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const headers = new Headers({ "x-vivi-forwarded-by": "cloudflare-worker" });
  const apiKey = String(env.API_KEY ?? env.API_KEY_PERMANENT ?? "").trim();
  if (apiKey) headers.set("x-api-key", apiKey);

  const response = await fetch(url, { headers });
  const text = await response.text();
  let payload: any;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`VPS storage returned invalid JSON (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(
      `VPS storage request failed (${response.status}): ${String(payload?.error ?? text).slice(0, 300)}`
    );
  }
  return payload as T;
}

function d1Result(results: unknown[] = [], meta: Record<string, unknown> = {}) {
  return {
    results,
    success: true,
    meta: {
      duration: 0,
      changes: 0,
      last_row_id: 0,
      rows_read: results.length,
      rows_written: 0,
      ...meta
    }
  };
}

function createRoutedStatement(
  sql: string,
  env: WorkerStorageEnv,
  d1: WorkerD1Database
): WorkerD1Statement {
  let params: unknown[] = [];
  let native: WorkerD1Statement | null = null;
  const useD1 = statementUsesCredentials(sql);
  if (useD1) native = d1.prepare(sql);

  const remote = async (operation: SqlOperation) => {
    const positional = toPositionalSql(sql, normalizeSqlParams(params));
    return postWorkerStorage<any>(env, "/operational/sql", {
      sql: positional.sql,
      params: positional.params,
      operation
    });
  };

  const statement = {
    [statementMarker]: { sql, params, operation: "all" as SqlOperation },
    bind(...values: unknown[]) {
      params = values;
      if (native) native = d1.prepare(sql).bind(...values);
      statement[statementMarker].params = values;
      return statement;
    },
    async all<T = Record<string, unknown>>(): Promise<WorkerD1Result<T>> {
      if (native) return native.all<T>();
      const result = await remote("all");
      return d1Result(result.results ?? [], result.meta ?? {}) as WorkerD1Result<T>;
    },
    async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
      if (native) return native.first<T>(columnName);
      const result = await remote("all");
      const row = (result.results ?? [])[0] ?? null;
      return columnName && row ? (row[columnName] as T) ?? null : (row as T | null);
    },
    async run<T = Record<string, unknown>>(): Promise<WorkerD1Result<T>> {
      if (native) return native.run<T>();
      if (!isWritableD1Statement(sql)) {
        const result = await remote("all");
        return d1Result(result.results ?? [], result.meta ?? {}) as WorkerD1Result<T>;
      }
      const result = await remote("run");
      return d1Result([], result.meta ?? {}) as WorkerD1Result<T>;
    },
    async raw<T = unknown[]>(): Promise<T[]> {
      if (native) return native.raw<T>();
      const result = await remote("all");
      return (result.results ?? []).map((row: Record<string, unknown>) => Object.values(row)) as T[];
    }
  };

  return statement as unknown as WorkerD1Statement;
}

/** Keep credentials and auth-critical RBAC in D1; route every other SQL call to VPS SQLite. */
export function routeOperationalD1ToVps(db: WorkerD1Database, env: WorkerStorageEnv): WorkerD1Database {
  if (!db) return db;
  const current = db as WorkerD1Database & { __vpsOperationalSqlRouter?: boolean };
  if (current.__vpsOperationalSqlRouter) return db;

  const routed = {
    __vpsOperationalSqlRouter: true,
    prepare(sql: string) {
      return createRoutedStatement(String(sql ?? ""), env, db);
    },
    async batch(statements: WorkerD1Statement[]) {
      const routedStatements = statements.map((statement) => {
        const routedStatement = statement as WorkerD1Statement & Partial<RoutedStatement>;
        const item = routedStatement[statementMarker];
        if (!item) throw new Error("Unsupported D1 batch statement.");
        return {
          ...item,
          params: normalizeSqlParams(item.params),
          operation: isD1WriteSql(item.sql) ? "run" : "all"
        };
      });
      const credentialFlags = routedStatements.map((statement) => statementUsesCredentials(statement.sql));
      if (credentialFlags.every(Boolean)) {
        return db.batch(
          routedStatements.map((statement) =>
            db.prepare(statement.sql).bind(...statement.params)
          )
        );
      }
      if (credentialFlags.some(Boolean)) {
        throw new Error("A D1 batch cannot mix credentials with VPS operational data.");
      }
      const result = await postWorkerStorage<{ results?: WorkerD1Result[] }>(env, "/operational/sql/batch", {
        statements: routedStatements.map((statement) => ({
          ...statement,
          ...toPositionalSql(statement.sql, statement.params)
        }))
      });
      return result.results ?? [];
    },
    async exec(sql: string) {
      if (statementUsesCredentials(sql)) return db.exec(sql);
      const result = await postWorkerStorage<{ count?: number; duration?: number }>(
        env,
        "/operational/sql/exec",
        { sql }
      );
      return { count: Number(result.count ?? 0), duration: Number(result.duration ?? 0) };
    },
    dump: async () => {
      throw new Error("D1 dumps are disabled; operational data is stored on the VPS.");
    }
  };

  return routed as unknown as WorkerD1Database;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function kvValue(bytes: string, encoding: string, type: string): unknown {
  const rawBytes = encoding === "base64" ? fromBase64(bytes) : new TextEncoder().encode(bytes);
  if (type === "arrayBuffer") {
    return rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength);
  }
  if (type === "stream") {
    const responseBytes = rawBytes.buffer.slice(
      rawBytes.byteOffset,
      rawBytes.byteOffset + rawBytes.byteLength
    ) as ArrayBuffer;
    return new Response(responseBytes).body;
  }
  const text = encoding === "base64" ? new TextDecoder().decode(rawBytes) : bytes;
  if (type === "json") return JSON.parse(text);
  return text;
}

/** KV-compatible facade backed by the VPS; the Cloudflare KV binding is never accessed. */
export function createVpsKvNamespace(env: WorkerStorageEnv): WorkerKvNamespace {
  const get = async (key: string, options?: any): Promise<any> => {
    const result = await getWorkerStorage<{
      value?: string | null;
      encoding?: string;
      metadata?: unknown;
      expiration?: number;
    }>(env, "/operational/kv", { key: String(key ?? "") });
    if (result.value == null) return null;
    const type = typeof options === "string" ? options : String(options?.type ?? "text");
    return kvValue(result.value, String(result.encoding ?? "text"), type);
  };

  const namespace = {
    get,
    async getWithMetadata(key: string, options?: any) {
      const result = await getWorkerStorage<{
        value?: string | null;
        encoding?: string;
        metadata?: unknown;
        expiration?: number;
      }>(env, "/operational/kv", { key: String(key ?? "") });
      const type = typeof options === "string" ? options : String(options?.type ?? "text");
      return {
        value: result.value == null ? null : kvValue(result.value, String(result.encoding ?? "text"), type),
        metadata: result.metadata ?? null
      };
    },
    async put(key: string, value: unknown, options?: WorkerKvPutOptions) {
      let encodedValue: string;
      let encoding = "text";
      if (typeof value === "string") {
        encodedValue = value;
      } else {
        const bytes =
          value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : ArrayBuffer.isView(value)
              ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
              : value instanceof ReadableStream
                ? new Uint8Array(await new Response(value).arrayBuffer())
                : null;
        if (!bytes) throw new TypeError("VPS-backed KV accepts strings, buffers, and readable streams.");
        encodedValue = toBase64(bytes);
        encoding = "base64";
      }
      await postWorkerStorage(env, "/operational/kv", {
        key: String(key ?? ""),
        value: encodedValue,
        encoding,
        metadata: options?.metadata ?? null,
        expiration: options?.expiration ?? null,
        expirationTtl: options?.expirationTtl ?? null
      });
    },
    async delete(key: string) {
      await postWorkerStorage(env, "/operational/kv/delete", { key: String(key ?? "") });
    },
    async list(options?: WorkerKvListOptions) {
      const params: Record<string, string> = {};
      if (options?.prefix) params.prefix = String(options.prefix);
      if (options?.limit) params.limit = String(options.limit);
      if (options?.cursor) params.cursor = String(options.cursor);
      const result = await getWorkerStorage<{
        keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
        list_complete: boolean;
        cursor: string;
      }>(
        env,
        "/operational/kv/list",
        params
      );
      return result;
    }
  };
  return namespace as WorkerKvNamespace;
}
