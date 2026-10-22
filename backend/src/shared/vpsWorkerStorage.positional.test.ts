import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { toPositionalSql } from "./vpsWorkerStorage";

const run = (db: Database.Database, sql: string, params: unknown[]) => {
  const positional = toPositionalSql(sql, params);
  return db.prepare(positional.sql).all(...positional.params);
};

describe("numbered SQL placeholders for the VPS (better-sqlite3)", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE jobs (id TEXT, status TEXT, available_at TEXT, updated_at TEXT, note TEXT)");
  db.exec("INSERT INTO jobs VALUES ('a', 'running', '', '2026-10-22T08:00:00Z', 'is it ?1 here')");

  it("better-sqlite3 rejects ?1 with positional values (the production error)", () => {
    expect(() => db.prepare("SELECT * FROM jobs WHERE id = ?1").all("a")).toThrow(/Too many parameter values/);
  });

  it("rewrites ?1 / ?2 and repeats values for a repeated placeholder", () => {
    const sql = `UPDATE jobs SET status = 'queued', available_at = ?1, updated_at = ?1
                 WHERE status = 'running' AND updated_at <= ?2`;
    const positional = toPositionalSql(sql, ["2026-10-22T09:00:00Z", "2026-10-22T08:30:00Z"]);
    expect(positional.params).toEqual(["2026-10-22T09:00:00Z", "2026-10-22T09:00:00Z", "2026-10-22T08:30:00Z"]);
    const result = db.prepare(positional.sql).run(...positional.params);
    expect(result.changes).toBe(1);
  });

  it("leaves strings, comments and plain ? alone", () => {
    expect(run(db, "SELECT note FROM jobs WHERE note = 'is it ?1 here' AND id = ?1 -- ?2", ["a"])).toEqual([
      { note: "is it ?1 here" }
    ]);
    expect(toPositionalSql("SELECT * FROM jobs WHERE id = ?", ["a"])).toEqual({
      sql: "SELECT * FROM jobs WHERE id = ?",
      params: ["a"]
    });
  });

  it("handles the alert lookups that were failing", () => {
    db.exec("CREATE TABLE bindings (tenant_id TEXT, type TEXT, data TEXT)");
    db.exec(`INSERT INTO bindings VALUES ('t1', 'notifications', '{}')`);
    expect(
      run(db, "SELECT data FROM bindings WHERE tenant_id = ?1 AND type = ?2 ORDER BY data DESC", ["t1", "notifications"])
    ).toHaveLength(1);
  });
});
