import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1_CREDENTIAL_TABLES, VPS_RBAC_TABLES, extractOperationalSqlTables } from "./operationalSqlPolicy";
import { listAllRbacUsers, readRbacUsersByIds, readSupportDeskRoleHolders } from "./rbacUserDirectory";
import {
  RBAC_VPS_MIGRATION_MARKER_KEY,
  resetRbacVpsMigrationStateForTests,
  routeOperationalD1ToVps,
  toPositionalSql
} from "./vpsWorkerStorage";

const RBAC_SCHEMA = `
  CREATE TABLE rbac_roles (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, role_level INTEGER NOT NULL DEFAULT 100, standard_role_key TEXT, is_system INTEGER NOT NULL DEFAULT 0, UNIQUE (tenant_id, name));
  CREATE TABLE rbac_security_groups (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (tenant_id, name));
  CREATE TABLE rbac_user_roles (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id, role_id));
  CREATE TABLE rbac_user_groups (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, group_id TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id, group_id));
  CREATE TABLE rbac_group_roles (tenant_id TEXT NOT NULL, group_id TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (tenant_id, group_id, role_id));
  CREATE TABLE rbac_user_tenants (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id));
  CREATE TABLE rbac_user_sites (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, site_id TEXT NOT NULL, site_name TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id, site_id));
  CREATE TABLE rbac_role_permissions (tenant_id TEXT NOT NULL, role_id TEXT NOT NULL, page_path TEXT NOT NULL, can_view INTEGER NOT NULL, can_edit INTEGER NOT NULL, can_delete INTEGER NOT NULL, PRIMARY KEY (tenant_id, role_id, page_path));
  CREATE TABLE rbac_user_regions (user_id TEXT NOT NULL, region TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user_id, region));
`;

/** Minimal D1 facade over better-sqlite3 (D1 accepts ?1 placeholders; better-sqlite3 needs them rewritten). */
function fakeD1(db: Database.Database) {
  const statement = (rawSql: string, rawParams: unknown[] = []): any => {
    const { sql, params } = toPositionalSql(rawSql, rawParams);
    return statementFor(rawSql, sql, params);
  };
  const statementFor = (rawSql: string, sql: string, params: unknown[]): any => ({
    bind: (...values: unknown[]) => statement(rawSql, values),
    all: async () => ({ results: db.prepare(sql).all(...params), success: true, meta: {} }),
    first: async (column?: string) => {
      const row: any = db.prepare(sql).get(...params) ?? null;
      return column && row ? row[column] ?? null : row;
    },
    run: async () => {
      db.prepare(sql).run(...params);
      return { results: [], success: true, meta: {} };
    },
    raw: async () => db.prepare(sql).raw().all(...params)
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (list: any[]) => Promise.all(list.map((item) => item.run())),
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
    dump: async () => new ArrayBuffer(0)
  };
}

/** VPS storage API over a second SQLite file, with the same credential-table refusal as the VPS. */
function fakeVps(db: Database.Database, options: { failBatch?: boolean } = {}) {
  db.exec("CREATE TABLE worker_kv (k TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const calls: string[] = [];
  const runOne = (statement: { sql: string; params: unknown[]; operation: string }) => {
    if (extractOperationalSqlTables(statement.sql).some((table) => D1_CREDENTIAL_TABLES.has(table))) {
      throw new Error("Credential tables are available only through D1.");
    }
    const prepared = db.prepare(statement.sql);
    if (statement.operation === "all") return { results: prepared.all(...statement.params), meta: {} };
    const result = prepared.run(...statement.params);
    return { results: [], meta: { changes: result.changes } };
  };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    try {
      if (url.pathname === "/operational/kv" && (init?.method ?? "GET") === "GET") {
        const row: any = db.prepare("SELECT value FROM worker_kv WHERE k = ?").get(url.searchParams.get("key"));
        return reply(200, { value: row?.value ?? null });
      }
      if (url.pathname === "/operational/kv") {
        db.prepare("INSERT OR REPLACE INTO worker_kv (k, value) VALUES (?, ?)").run(body.key, body.value);
        return reply(200, { ok: true });
      }
      if (url.pathname === "/operational/sql") return reply(200, runOne(body));
      if (url.pathname === "/operational/sql/batch") {
        if (options.failBatch) return reply(503, { error: "VPS unavailable" });
        return reply(200, { results: db.transaction(() => body.statements.map(runOne))() });
      }
      return reply(404, { error: "not found" });
    } catch (error) {
      return reply(400, { error: (error as Error).message });
    }
  };
  return { fetchImpl, calls };
}

function seedLegacyD1(db: Database.Database) {
  db.exec(RBAC_SCHEMA);
  db.exec(
    "CREATE TABLE rbac_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT, created_by_user_id TEXT)"
  );
  const now = "2026-10-01T00:00:00.000Z";
  db.prepare("INSERT INTO rbac_users VALUES (?, ?, ?, 'hash', ?, ?, ?, NULL, NULL)").run("u1", "Zoe", "zoe@x", "active", now, now);
  db.prepare("INSERT INTO rbac_users VALUES (?, ?, ?, 'hash', ?, ?, ?, NULL, NULL)").run("u2", "Adam", "adam@x", "active", now, now);
  db.prepare("INSERT INTO rbac_users VALUES (?, ?, ?, 'hash', ?, ?, ?, NULL, NULL)").run("u3", "Sam", "sam@x", "suspended", now, now);
  db.prepare("INSERT INTO rbac_roles (id, tenant_id, name, status, created_at, updated_at, standard_role_key) VALUES ('r1', 't1', 'Admin', 'active', ?, ?, 'admin')").run(now, now);
  for (const user of ["u1", "u2", "u3"]) {
    db.prepare("INSERT INTO rbac_user_roles VALUES ('t1', ?, 'r1')").run(user);
    db.prepare("INSERT INTO rbac_user_tenants VALUES ('t1', ?, ?)").run(user, now);
  }
  // More rows than one INSERT chunk (100) to exercise chunking.
  const permission = db.prepare("INSERT INTO rbac_role_permissions VALUES ('t1', 'r1', ?, 1, 1, 0)");
  for (let i = 0; i < 250; i += 1) permission.run(`/page/${i}`);
}

const env = { VPS_ORIGIN: "https://vps.example.test", API_KEY: "k" } as any;

describe("RBAC tables move from D1 to the VPS", () => {
  let d1Sqlite: Database.Database;
  let vpsSqlite: Database.Database;

  beforeEach(() => {
    resetRbacVpsMigrationStateForTests();
    d1Sqlite = new Database(":memory:");
    vpsSqlite = new Database(":memory:");
    seedLegacyD1(d1Sqlite);
    vpsSqlite.exec(RBAC_SCHEMA);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies every RBAC row once, keeps the D1 rows, then serves RBAC SQL from the VPS", async () => {
    const vps = fakeVps(vpsSqlite);
    vi.stubGlobal("fetch", vps.fetchImpl);
    const db = routeOperationalD1ToVps(fakeD1(d1Sqlite) as any, env);

    const roles = await db.prepare("SELECT id FROM rbac_roles WHERE tenant_id = ?1").bind("t1").all();
    expect(roles.results).toEqual([{ id: "r1" }]);

    for (const table of VPS_RBAC_TABLES) {
      const count = (sqlite: Database.Database) => (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as any).c;
      expect(count(vpsSqlite)).toBe(count(d1Sqlite));
    }
    expect((d1Sqlite.prepare("SELECT COUNT(*) AS c FROM rbac_role_permissions").get() as any).c).toBe(250);
    const marker: any = vpsSqlite.prepare("SELECT value FROM worker_kv WHERE k = ?").get(RBAC_VPS_MIGRATION_MARKER_KEY);
    expect(JSON.parse(marker.value).counts.rbac_role_permissions).toEqual({ d1: 250, vps: 250 });

    // RBAC writes now land on the VPS only.
    await db.prepare("DELETE FROM rbac_user_roles WHERE user_id = ?1").bind("u3").run();
    expect((vpsSqlite.prepare("SELECT COUNT(*) AS c FROM rbac_user_roles").get() as any).c).toBe(2);
    expect((d1Sqlite.prepare("SELECT COUNT(*) AS c FROM rbac_user_roles").get() as any).c).toBe(3);

    // A new isolate sees the marker and does not copy again.
    resetRbacVpsMigrationStateForTests();
    vps.calls.length = 0;
    await db.prepare("SELECT COUNT(*) AS c FROM rbac_user_roles").all();
    expect(vps.calls.filter((call) => call.endsWith("/operational/sql/batch"))).toEqual([]);
    expect((vpsSqlite.prepare("SELECT COUNT(*) AS c FROM rbac_user_roles").get() as any).c).toBe(2);
  });

  it("keeps login credentials in D1", async () => {
    const vps = fakeVps(vpsSqlite);
    vi.stubGlobal("fetch", vps.fetchImpl);
    const db = routeOperationalD1ToVps(fakeD1(d1Sqlite) as any, env);

    await db.prepare("UPDATE rbac_users SET last_login_at = ?2 WHERE id = ?1").bind("u1", "2026-10-26T00:00:00Z").run();
    expect((d1Sqlite.prepare("SELECT last_login_at AS t FROM rbac_users WHERE id = 'u1'").get() as any).t).toBe(
      "2026-10-26T00:00:00Z"
    );
    expect(vps.calls).toEqual([]);
  });

  it("falls back to D1 reads and refuses RBAC writes when the copy fails", async () => {
    const vps = fakeVps(vpsSqlite, { failBatch: true });
    vi.stubGlobal("fetch", vps.fetchImpl);
    const db = routeOperationalD1ToVps(fakeD1(d1Sqlite) as any, env);

    const perms = await db.prepare("SELECT COUNT(*) AS c FROM rbac_role_permissions").first<{ c: number }>();
    expect(perms?.c).toBe(250);
    await expect(db.prepare("DELETE FROM rbac_user_roles WHERE user_id = ?1").bind("u1").run()).rejects.toThrow(
      /being moved to the VPS/
    );
    expect((d1Sqlite.prepare("SELECT COUNT(*) AS c FROM rbac_user_roles").get() as any).c).toBe(3);
    expect(vpsSqlite.prepare("SELECT value FROM worker_kv WHERE k = ?").get(RBAC_VPS_MIGRATION_MARKER_KEY)).toBeUndefined();
  });

  it("joins VPS assignments with D1 users in code", async () => {
    vi.stubGlobal("fetch", fakeVps(vpsSqlite).fetchImpl);
    const db = routeOperationalD1ToVps(fakeD1(d1Sqlite) as any, env) as any;

    const holders = await readSupportDeskRoleHolders(db);
    expect(holders.results.map((row) => row.name)).toEqual(["Adam", "Zoe"]);
    expect((await listAllRbacUsers(db)).map((user) => user.id).sort()).toEqual(["u1", "u2", "u3"]);
    const byId = await readRbacUsersByIds(db, ["u2", "missing", "u2"], { full: true });
    expect([...byId.keys()]).toEqual(["u2"]);
    expect(byId.get("u2")).not.toHaveProperty("password_hash");
  });
});
