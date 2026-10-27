import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { recoverLegacyAlertState } from "./legacyAlertStateRecovery";

const require = createRequire(import.meta.url);

function makeDb() {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE worker_kv (k TEXT PRIMARY KEY, value TEXT NOT NULL, encoding TEXT NOT NULL DEFAULT 'text', metadata TEXT, expiration INTEGER, updated_at TEXT NOT NULL);
    CREATE TABLE kv_store (k TEXT, tenant_id TEXT, data TEXT, updated_at TEXT, PRIMARY KEY (k, tenant_id));
  `);
  return db;
}

const read = (db: any, key: string) => {
  const row = db.prepare("SELECT value FROM worker_kv WHERE k = ?").get(key);
  return row ? JSON.parse(row.value) : null;
};

describe("recoverLegacyAlertState", () => {
  it("copies legacy rules that worker_kv does not have and never overwrites", async () => {
    const db = makeDb();
    const key = "vivi:user-alert-rules:t1:u1";
    db.prepare("INSERT INTO kv_store VALUES (?, ?, ?, ?)").run(key, "t1", JSON.stringify([{ id: "a", name: "old" }, { id: "b" }]), "2024-01-01");
    db.prepare("INSERT INTO worker_kv (k, value, updated_at) VALUES (?, ?, ?)").run(key, JSON.stringify([{ id: "a", name: "new" }]), "2025-01-01");
    const result = await recoverLegacyAlertState({ db });
    expect(result.merged).toBe(1);
    expect(read(db, key)).toEqual([{ id: "a", name: "new" }, { id: "b" }]);
  });

  it("recovers from Valkey and keeps tenants separate", async () => {
    const db = makeDb();
    const result = await recoverLegacyAlertState({
      db,
      scanValkey: async (pattern) =>
        pattern.startsWith("vivi:infohub-stream-monitor:")
          ? [
              { key: "vivi:infohub-stream-monitor:t1:u1", value: JSON.stringify({ bySite: { a: {} } }) },
              { key: "vivi:infohub-stream-monitor:t2:u1", value: JSON.stringify({ bySite: { b: {} } }) }
            ]
          : []
    });
    expect(result.inserted).toBe(2);
    expect(read(db, "vivi:infohub-stream-monitor:t1:u1")).toEqual({ bySite: { a: {} } });
    expect(read(db, "vivi:infohub-stream-monitor:t2:u1")).toEqual({ bySite: { b: {} } });
  });

  it("is idempotent", async () => {
    const db = makeDb();
    db.prepare("INSERT INTO kv_store VALUES (?, ?, ?, ?)").run("vivi:user-alerts:t1:u1", "t1", JSON.stringify([{ id: "x" }]), "2024-01-01");
    await recoverLegacyAlertState({ db });
    const second = await recoverLegacyAlertState({ db });
    expect(second.inserted + second.merged).toBe(0);
  });
});
