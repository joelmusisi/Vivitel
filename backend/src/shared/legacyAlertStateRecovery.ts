/**
 * Stream alert rules, stream monitors and in-app alerts used to live in the VPS `kv_store`
 * table and in Valkey (10-year TTL). The Worker now reads them from `worker_kv`.
 * This copies any legacy rows that `worker_kv` does not have yet. It never overwrites
 * or deletes: lists are merged by id (current copy wins), everything else is only filled in when absent.
 */

export const LEGACY_ALERT_KEY_PREFIXES = [
  "vivi:user-alert-rules:",
  "vivi:infohub-stream-monitor:",
  "vivi:user-alerts:"
] as const;

const LIST_PREFIXES = ["vivi:user-alert-rules:", "vivi:user-alerts:"];

type Db = {
  prepare: (sql: string) => {
    all: (...args: unknown[]) => any[];
    get: (...args: unknown[]) => any;
    run: (...args: unknown[]) => unknown;
  };
};

export type LegacyAlertRecoveryResult = { scanned: number; inserted: number; merged: number };

function parseList(raw: string | null | undefined): Array<Record<string, unknown>> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).alerts)) {
      return (parsed as any).alerts as Array<Record<string, unknown>>;
    }
  } catch {
    // not a list
  }
  return null;
}

export function mergeListsById(
  current: Array<Record<string, unknown>>,
  legacy: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const seen = new Set(current.map((row) => String(row?.id ?? "")).filter(Boolean));
  const extra = legacy.filter((row) => {
    const id = String(row?.id ?? "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return extra.length ? [...current, ...extra] : current;
}

export function recoverLegacyAlertEntry(
  db: Db,
  key: string,
  legacyValue: string
): "inserted" | "merged" | "unchanged" {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT value FROM worker_kv WHERE k = ?").get(key) as { value?: string } | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO worker_kv (k, value, encoding, metadata, expiration, updated_at) VALUES (?, ?, 'text', NULL, NULL, ?)`
    ).run(key, legacyValue, now);
    return "inserted";
  }
  if (!LIST_PREFIXES.some((prefix) => key.startsWith(prefix))) return "unchanged";
  const current = parseList(existing.value);
  const legacy = parseList(legacyValue);
  if (!current || !legacy) return "unchanged";
  const merged = mergeListsById(current, legacy);
  if (merged === current) return "unchanged";
  db.prepare("UPDATE worker_kv SET value = ?, updated_at = ? WHERE k = ?").run(JSON.stringify(merged), now, key);
  return "merged";
}

export async function recoverLegacyAlertState(input: {
  db: Db;
  scanValkey?: (pattern: string) => Promise<Array<{ key: string; value: string }>>;
}): Promise<LegacyAlertRecoveryResult> {
  const result: LegacyAlertRecoveryResult = { scanned: 0, inserted: 0, merged: 0 };
  const apply = (key: string, value: unknown) => {
    const text = typeof value === "string" ? value : "";
    if (!key || !text) return;
    result.scanned += 1;
    const outcome = recoverLegacyAlertEntry(input.db, key, text);
    if (outcome === "inserted") result.inserted += 1;
    if (outcome === "merged") result.merged += 1;
  };

  for (const prefix of LEGACY_ALERT_KEY_PREFIXES) {
    try {
      const rows = input.db
        .prepare("SELECT k, data FROM kv_store WHERE k LIKE ? ORDER BY updated_at ASC")
        .all(`${prefix}%`);
      for (const row of rows) apply(String(row.k ?? ""), row.data);
    } catch {
      // kv_store may not exist on a fresh database
    }
    if (input.scanValkey) {
      try {
        for (const entry of await input.scanValkey(`${prefix}*`)) apply(entry.key, entry.value);
      } catch {
        // Valkey is optional
      }
    }
  }
  return result;
}
