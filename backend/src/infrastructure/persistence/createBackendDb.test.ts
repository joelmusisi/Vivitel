import { createRequire } from "node:module";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { createBackendDb } from "./createBackendDb";

const require = createRequire(import.meta.url);

describe("createBackendDb operational schema", () => {
  it("creates the production D1 operational tables and queue indexes on SQLite", () => {
    const db = createBackendDb({
      DatabaseCtor: require("better-sqlite3"),
      dbPath: ":memory:",
      requirePersistentDb: true,
      fsModule: { mkdirSync: () => undefined },
      pathModule: { dirname }
    });

    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row: { name: string }) => row.name);

      expect(tables).toEqual(
        expect.arrayContaining([
          "asset_meta",
          "cameras",
          "device_sync_jobs",
          "notification_sync_jobs",
          "site_asset_seq",
          "traccar_computed_attribute_mappings",
          "traccar_webhook_logs",
          "trips",
          "warehouses",
          "rbac_roles",
          "rbac_security_groups",
          "rbac_user_roles",
          "rbac_user_groups",
          "rbac_group_roles",
          "rbac_user_tenants",
          "rbac_user_sites",
          "rbac_role_permissions",
          "rbac_user_regions"
        ])
      );
      expect(tables).not.toEqual(expect.arrayContaining(["auth_admin_credentials", "auth_reset_tokens", "rbac_users"]));

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all()
        .map((row: { name: string }) => row.name);
      expect(indexes).toEqual(
        expect.arrayContaining([
          "idx_device_sync_jobs_status_available",
          "idx_notification_sync_jobs_status_created",
          "idx_traccar_computed_attr_map_tenant_attr",
          "idx_traccar_computed_attr_map_tenant_binding",
          "idx_traccar_webhook_logs_tenant_imei_created",
          "idx_traccar_webhook_logs_tenant_kind_created",
          "idx_rbac_roles_tenant",
          "idx_rbac_groups_tenant",
          "idx_rbac_user_roles_user",
          "idx_rbac_user_groups_user",
          "idx_rbac_user_tenants_user",
          "idx_rbac_user_sites_user",
          "idx_rbac_role_perms_role",
          "idx_rbac_user_regions_region"
        ])
      );
    } finally {
      (db as typeof db & { close?: () => void }).close?.();
    }
  });
});
