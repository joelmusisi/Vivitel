/**
 * Cloudflare D1 may only receive credential / auth-critical RBAC rows.
 * All other application data is routed to VPS SQLite or Backblaze B2.
 */
import { isAllowedCredentialD1Write, isD1WriteSql } from "./operationalSqlPolicy";

export {
  D1_CREDENTIAL_TABLES,
  extractD1WriteTables,
  isAllowedCredentialD1Write,
  isD1WriteSql
} from "./operationalSqlPolicy";

/**
 * Defensive guard for any caller that still uses the legacy write-only wrapper.
 * Operational writes fail loudly instead of looking successful while being dropped.
 */
export function blockNonCredentialD1Writes(db: D1Database): D1Database {
  const current = db as D1Database & { __d1CredentialGate?: boolean };
  if (!db || current.__d1CredentialGate) return db;

  const blockedStmt = {
    __d1WriteBlocked: true,
    bind() {
      return blockedStmt;
    },
    async run(): Promise<never> {
      throw new Error("Operational D1 writes are disabled; use the VPS storage API.");
    },
    async all(): Promise<never> {
      throw new Error("Operational D1 writes are disabled; use the VPS storage API.");
    },
    async first(): Promise<never> {
      throw new Error("Operational D1 writes are disabled; use the VPS storage API.");
    },
    async raw(): Promise<never> {
      throw new Error("Operational D1 writes are disabled; use the VPS storage API.");
    }
  };

  const wrapped = {
    __d1CredentialGate: true,
    prepare(sql: string) {
      const text = String(sql ?? "");
      if (isD1WriteSql(text) && !isAllowedCredentialD1Write(text)) return blockedStmt;
      return db.prepare(sql);
    },
    dump: async (): Promise<never> => {
      throw new Error("Full D1 dumps are disabled; export authentication data through its approved process.");
    },
    async batch(statements: any[]) {
      const list = Array.isArray(statements) ? statements : [];
      if (list.some((stmt) => stmt?.__d1WriteBlocked)) {
        throw new Error("Operational D1 batch writes are disabled; use the VPS storage API.");
      }
      return db.batch(list);
    },
    async exec(sql: string) {
      const parts = String(sql ?? "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.some((part) => isD1WriteSql(part) && !isAllowedCredentialD1Write(part))) {
        throw new Error("Operational D1 script writes are disabled; use the VPS storage API.");
      }
      return db.exec(parts.join(";\n"));
    }
  };
  return wrapped as unknown as D1Database;
}
