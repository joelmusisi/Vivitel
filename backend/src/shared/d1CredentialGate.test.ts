import { describe, expect, it } from "vitest";
import {
  extractD1WriteTables,
  isAllowedCredentialD1Write,
  isD1WriteSql
} from "./d1CredentialGate";

describe("d1CredentialGate", () => {
  it("detects write SQL", () => {
    expect(isD1WriteSql("SELECT * FROM assets")).toBe(false);
    expect(isD1WriteSql("SELECT 'insert into assets' AS example FROM assets")).toBe(false);
    expect(isD1WriteSql("INSERT INTO rbac_users (id) VALUES (1)")).toBe(true);
    expect(isD1WriteSql("WITH values_to_insert AS (SELECT 1) INSERT INTO assets (id) SELECT * FROM values_to_insert")).toBe(
      true
    );
    expect(isD1WriteSql("CREATE TABLE IF NOT EXISTS assets (id TEXT)")).toBe(true);
  });

  it("allows credential / RBAC writes only", () => {
    expect(isAllowedCredentialD1Write("INSERT INTO rbac_users (id, email, password_hash) VALUES (1,2,3)")).toBe(
      true
    );
    expect(
      isAllowedCredentialD1Write(
        "CREATE TABLE IF NOT EXISTS auth_admin_credentials (id TEXT PRIMARY KEY, password_hash TEXT)"
      )
    ).toBe(true);
    expect(isAllowedCredentialD1Write("ALTER TABLE rbac_roles ADD COLUMN role_level INTEGER")).toBe(true);
    expect(isAllowedCredentialD1Write("DELETE FROM rbac_user_roles WHERE user_id = ?")).toBe(true);
  });

  it("blocks operational D1 writes", () => {
    expect(
      isAllowedCredentialD1Write(
        "INSERT INTO assets (id, tenant_id, data, updated_at) VALUES (?1, ?2, ?3, ?4)"
      )
    ).toBe(false);
    expect(
      isAllowedCredentialD1Write(
        "CREATE TABLE IF NOT EXISTS configuration_groups (id TEXT, tenant_id TEXT, data TEXT)"
      )
    ).toBe(false);
    expect(isAllowedCredentialD1Write("DELETE FROM bindings WHERE tenant_id = ?")).toBe(false);
    expect(isAllowedCredentialD1Write("UPDATE device_sync_jobs SET status = ?")).toBe(false);
  });

  it("extracts table names from common write shapes", () => {
    expect(extractD1WriteTables("INSERT OR REPLACE INTO rbac_user_roles (tenant_id) VALUES (1)")).toContain(
      "rbac_user_roles"
    );
    expect(extractD1WriteTables("CREATE INDEX IF NOT EXISTS idx_assets ON assets (tenant_id)")).toContain(
      "assets"
    );
  });
});
