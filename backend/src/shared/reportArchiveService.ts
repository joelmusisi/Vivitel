/**
 * Report run archives: hot on VPS disk for REPORT_ARCHIVE_HOT_DAYS (default 90),
 * then copy-promote to Vivi-Reports B2. Hot files are never deleted in this phase.
 */

import { buildReportArchiveKey } from "./assetStoragePaths";
import type { VpsB2Storage } from "./vpsB2Storage";

export type ReportArchiveRow = {
  report_id: string;
  tenant_id: string;
  site: string;
  title: string;
  created_at: string;
  storage: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
};

interface SqliteDbLike {
  prepare(query: string): {
    get: (...params: any[]) => any;
    all: (...params: any[]) => any[];
    run: (...params: any[]) => any;
  };
}

export function createReportArchiveService(deps: {
  db: SqliteDbLike;
  hotDir: string;
  hotDays: number;
  vpsB2: VpsB2Storage;
  pathModule: { join: (...parts: string[]) => string; dirname: (p: string) => string };
  fsModule: {
    mkdirSync: (path: string, options?: any) => void;
    writeFileSync: (path: string, data: Buffer) => void;
    existsSync: (path: string) => boolean;
    readFileSync: (path: string) => Buffer;
  };
  zlibModule: { gzipSync: (data: Buffer) => Buffer; gunzipSync: (data: Buffer) => Buffer };
  generateId: () => string;
}) {
  const { db, hotDir, hotDays, vpsB2, pathModule, fsModule, zlibModule, generateId } = deps;

  function ensureSchema() {
    db.prepare(`
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
      )
    `).run();
    try {
      db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_report_archives_storage_created ON report_archives (storage, created_at)"
      ).run();
    } catch {
      // ignore
    }
  }

  ensureSchema();

  async function saveReportArchive(args: {
    tenantId: string;
    site?: string;
    title?: string;
    reportId?: string;
    createdAt?: string;
    payload: unknown;
  }): Promise<{ reportId: string; storageKey: string; storage: string }> {
    const tenantId = String(args.tenantId ?? "").trim() || "default";
    const site = String(args.site ?? "").trim();
    const reportId = String(args.reportId ?? "").trim() || generateId();
    const createdAt = String(args.createdAt ?? "").trim() || new Date().toISOString();
    const title = String(args.title ?? "").trim() || "Report";
    const storageKey = buildReportArchiveKey({
      tenantId,
      site,
      reportId,
      createdAt,
      extension: ".json.gz"
    });

    const payloadBytes = Buffer.from(JSON.stringify(args.payload ?? {}), "utf8");
    const gzipBytes = zlibModule.gzipSync(payloadBytes);

    const localPath = pathModule.join(hotDir, ...storageKey.split("/"));
    fsModule.mkdirSync(pathModule.dirname(localPath), { recursive: true });
    fsModule.writeFileSync(localPath, gzipBytes);

    const storage = "local";
    db.prepare(
      `INSERT OR REPLACE INTO report_archives
        (report_id, tenant_id, site, title, created_at, storage, storage_key, content_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      reportId,
      tenantId,
      site,
      title,
      createdAt,
      storage,
      storageKey,
      "application/json",
      gzipBytes.length
    );

    return { reportId, storageKey, storage };
  }

  async function readReportArchive(
    tenantId: string,
    reportId: string
  ): Promise<{ payload: unknown; row: ReportArchiveRow } | null> {
    const row = db
      .prepare(
        "SELECT report_id, tenant_id, site, title, created_at, storage, storage_key, content_type, size_bytes FROM report_archives WHERE tenant_id = ? AND report_id = ?"
      )
      .get(tenantId, reportId) as ReportArchiveRow | undefined;
    if (!row) return null;

    const key = String(row.storage_key ?? "").trim();
    if (!key) return null;

    let compressed: Buffer | null = null;

    // Prefer B2 when already promoted (dual-read: reports bucket then legacy).
    if (String(row.storage).startsWith("b2") && vpsB2.enabled) {
      compressed = await vpsB2.getObject(key, "reports");
    }

    // Hot file fallback (also used while still local).
    if (!compressed) {
      const localPath = pathModule.join(hotDir, ...key.split("/"));
      if (fsModule.existsSync(localPath)) {
        compressed = fsModule.readFileSync(localPath);
      } else if (fsModule.existsSync(key)) {
        compressed = fsModule.readFileSync(key);
      }
    }

    // Last resort: try B2 even if index still says local (partial promote race).
    if (!compressed && vpsB2.enabled) {
      compressed = await vpsB2.getObject(key, "reports");
    }

    if (!compressed) return null;

    try {
      const jsonText = zlibModule.gunzipSync(compressed).toString("utf8");
      return { payload: JSON.parse(jsonText), row };
    } catch {
      try {
        return { payload: JSON.parse(compressed.toString("utf8")), row };
      } catch {
        return null;
      }
    }
  }

  function listReportArchives(args: {
    tenantId: string;
    site?: string;
    limit?: number;
    offset?: number;
  }): { reports: Array<Omit<ReportArchiveRow, "storage_key">>; hasMore: boolean } {
    const tenantId = String(args.tenantId ?? "").trim();
    const site = String(args.site ?? "").trim();
    const limit = Math.max(1, Math.min(Math.trunc(Number(args.limit) || 50), 100));
    const offset = Math.max(0, Math.trunc(Number(args.offset) || 0));
    const rows = db
      .prepare(
        `SELECT report_id, tenant_id, site, title, created_at, storage, content_type, size_bytes
         FROM report_archives
         WHERE tenant_id = ? AND (? = '' OR site = ?)
         ORDER BY created_at DESC, report_id DESC
         LIMIT ? OFFSET ?`
      )
      .all(tenantId, site, site, limit + 1, offset) as Array<Omit<ReportArchiveRow, "storage_key">>;
    const hasMore = rows.length > limit;
    return { reports: rows.slice(0, limit), hasMore };
  }

  /**
   * Copy-promote local archives older than hotDays to Vivi-Reports.
   * Does not delete hot files.
   */
  async function promoteExpiredReportArchives(limit = 50): Promise<{ promoted: number; failed: number }> {
    if (!vpsB2.enabled) return { promoted: 0, failed: 0 };
    const cutoff = new Date(Date.now() - hotDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = db
      .prepare(
        `SELECT report_id, tenant_id, site, title, created_at, storage, storage_key, content_type, size_bytes
         FROM report_archives
         WHERE storage = 'local' AND created_at < ?
         ORDER BY created_at ASC
         LIMIT ?`
      )
      .all(cutoff, limit) as ReportArchiveRow[];

    let promoted = 0;
    let failed = 0;

    for (const row of rows) {
      const key = String(row.storage_key ?? "").trim();
      if (!key) {
        failed += 1;
        continue;
      }
      const localPath = pathModule.join(hotDir, ...key.split("/"));
      let bytes: Buffer | null = null;
      if (fsModule.existsSync(localPath)) bytes = fsModule.readFileSync(localPath);
      else if (fsModule.existsSync(key)) bytes = fsModule.readFileSync(key);
      if (!bytes) {
        failed += 1;
        continue;
      }

      const ok = await vpsB2.putObject({
        key,
        body: bytes,
        contentType: row.content_type || "application/json",
        contentEncoding: "gzip",
        purpose: "reports",
        metadata: {
          tenant: String(row.tenant_id || "default"),
          reportid: String(row.report_id || ""),
          createdat: String(row.created_at || "")
        }
      });

      if (!ok) {
        failed += 1;
        continue;
      }

      const archivedBytes = await vpsB2.getObject(key, "reports");
      if (!archivedBytes || !archivedBytes.equals(bytes)) {
        failed += 1;
        continue;
      }

      db.prepare(
        "UPDATE report_archives SET storage = ? WHERE report_id = ? AND tenant_id = ?"
      ).run("b2-reports", row.report_id, row.tenant_id);
      promoted += 1;
    }

    return { promoted, failed };
  }

  return {
    saveReportArchive,
    readReportArchive,
    listReportArchives,
    promoteExpiredReportArchives,
    hotDays
  };
}
