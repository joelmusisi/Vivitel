interface SqliteDbLike {
  prepare(query: string): {
    get: (...params: any[]) => any;
    all: (...params: any[]) => any[];
    run: (...params: any[]) => { changes: number };
  };
}

type TraccarFetchResult = { ok: boolean; status: number; body: any };

interface CreateTraccarOutboxDeps {
  db: SqliteDbLike;
  generateId: () => string;
  traccarFetch: (pathnameWithQuery: string, init?: RequestInit) => Promise<TraccarFetchResult>;
  isTraccarConfigured: () => boolean;
  logger?: { warn?: (...args: any[]) => void; info?: (...args: any[]) => void };
  maxAttempts?: number;
}

interface KickAvlPayload {
  imei: string;
  commandText: string;
}

type TraccarOutboxRow = {
  id: string;
  tenant_id: string;
  job_type: string;
  status: string;
  payload: string;
  attempts: number;
  available_at: string;
  created_at: string;
  updated_at: string;
  processed_at?: string;
  last_error?: string;
};

type TraccarOutboxDiagnostics = {
  tenantId: string;
  counts: Record<string, number>;
  oldestQueuedAt: string | null;
  nextAvailableAt: string | null;
  recentFailures: Array<{
    id: string;
    jobType: string;
    status: string;
    attempts: number;
    updatedAt: string;
    lastError: string;
  }>;
};

const JOB_TYPE_KICK_AVL = "kick-avl-command";

function safeJsonParse<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function buildBackoffIso(attempt: number) {
  const backoffMs = Math.min(300_000, Math.max(5_000, 5_000 * 2 ** Math.max(0, attempt - 1)));
  return new Date(Date.now() + backoffMs).toISOString();
}

function summarizeTraccarError(prefix: string, resp: TraccarFetchResult) {
  const detail = typeof resp.body === "string"
    ? resp.body
    : String((resp.body as any)?.message ?? (resp.body as any)?.error ?? "").trim();
  return detail ? `${prefix}: ${detail}` : `${prefix}: HTTP ${resp.status}`;
}

export function createTraccarOutbox(deps: CreateTraccarOutboxDeps) {
  const {
    db,
    generateId,
    traccarFetch,
    isTraccarConfigured,
    logger,
    maxAttempts = 5,
  } = deps;

  function enqueueKickAvlCommandJob(args: { tenantId: string; imei: string; commandText: string }) {
    const tenantId = String(args.tenantId ?? "").trim();
    const imei = String(args.imei ?? "").trim();
    const commandText = String(args.commandText ?? "").trim();
    const now = new Date().toISOString();
    const id = generateId();
    const payload = JSON.stringify({ imei, commandText } satisfies KickAvlPayload);

    db.prepare(
      "INSERT INTO traccar_outbox (id, tenant_id, job_type, status, payload, attempts, available_at, created_at, updated_at, last_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, tenantId, JOB_TYPE_KICK_AVL, "queued", payload, 0, now, now, now, "");

    return { queued: true as const, jobId: id, queuedAt: now };
  }

  function readJob(tenantId: string, jobId: string) {
    return db
      .prepare(
        "SELECT id, tenant_id, job_type, status, payload, attempts, available_at, created_at, updated_at, processed_at, last_error FROM traccar_outbox WHERE tenant_id = ? AND id = ?"
      )
      .get(tenantId, jobId) as TraccarOutboxRow | null;
  }

  function getDiagnostics(tenantId: string): TraccarOutboxDiagnostics {
    const tenant = String(tenantId ?? "").trim();
    const rows = db
      .prepare(
        "SELECT id, tenant_id, job_type, status, payload, attempts, available_at, created_at, updated_at, processed_at, last_error FROM traccar_outbox WHERE tenant_id = ?"
      )
      .all(tenant) as TraccarOutboxRow[];

    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      const status = String(row.status ?? "unknown").trim() || "unknown";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});

    const queuedRows = rows
      .filter((row) => row.status === "queued" || row.status === "retry" || row.status === "processing")
      .sort((left, right) => String(left.available_at ?? "").localeCompare(String(right.available_at ?? "")));

    const recentFailures = rows
      .filter((row) => row.status === "failed" || (row.status === "retry" && String(row.last_error ?? "").trim()))
      .sort((left, right) => String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? "")))
      .slice(0, 10)
      .map((row) => ({
        id: row.id,
        jobType: String(row.job_type ?? ""),
        status: String(row.status ?? ""),
        attempts: Number(row.attempts ?? 0),
        updatedAt: String(row.updated_at ?? ""),
        lastError: String(row.last_error ?? ""),
      }));

    return {
      tenantId: tenant,
      counts,
      oldestQueuedAt: queuedRows.length ? String(queuedRows[0]?.created_at ?? "") || null : null,
      nextAvailableAt: queuedRows.length ? String(queuedRows[0]?.available_at ?? "") || null : null,
      recentFailures,
    };
  }

  function getGlobalPendingCount(): number {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS count FROM traccar_outbox WHERE status IN ('queued','retry','processing')"
      )
      .get() as { count?: number } | undefined;
    return Number(row?.count ?? 0) || 0;
  }

  async function processKickAvlJob(row: TraccarOutboxRow, payload: KickAvlPayload) {
    const imei = String(payload.imei ?? "").trim();
    const commandText = String(payload.commandText ?? "").trim();
    if (!imei) {
      const error: any = new Error("Missing IMEI in queued Traccar command job");
      error.permanent = true;
      throw error;
    }
    if (!commandText) {
      const error: any = new Error("Missing command text in queued Traccar command job");
      error.permanent = true;
      throw error;
    }
    if (!isTraccarConfigured()) {
      throw new Error("Traccar is not configured");
    }

    const devicesResp = await traccarFetch("/api/devices?all=true");
    if (!devicesResp.ok) {
      throw new Error(summarizeTraccarError("Failed to list Traccar devices", devicesResp));
    }

    const devices = Array.isArray(devicesResp.body) ? devicesResp.body : [];
    const device = devices.find((candidate: any) => String(candidate?.uniqueId ?? "").trim() === imei) ?? null;
    if (!device) {
      throw new Error(`Traccar device not found for IMEI ${imei}`);
    }

    const deviceId = Number((device as any)?.id);
    if (!Number.isFinite(deviceId)) {
      const error: any = new Error(`Invalid Traccar device id for IMEI ${imei}`);
      error.permanent = true;
      throw error;
    }

    const sendResp = await traccarFetch("/api/commands/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId,
        type: "custom",
        attributes: { data: commandText }
      })
    });

    if (!sendResp.ok) {
      throw new Error(summarizeTraccarError(`Failed to send Traccar command for ${imei}`, sendResp));
    }

    logger?.info?.(`[traccar-outbox] processed ${row.id} for IMEI ${imei}`);
  }

  async function processPendingJobs(limit = 10) {
    const now = new Date().toISOString();
    const rows = db
      .prepare(
        "SELECT id, tenant_id, job_type, status, payload, attempts, available_at, created_at, updated_at, processed_at, last_error FROM traccar_outbox WHERE status IN ('queued','retry') AND available_at <= ? ORDER BY created_at ASC LIMIT ?"
      )
      .all(now, limit) as TraccarOutboxRow[];

    const summary = { scanned: rows.length, processed: 0, succeeded: 0, retried: 0, failed: 0 };

    for (const row of rows) {
      const attemptNumber = Math.max(0, Number(row.attempts ?? 0)) + 1;
      const claimAt = new Date().toISOString();
      const claimed = db
        .prepare(
          "UPDATE traccar_outbox SET status = 'processing', attempts = ?, updated_at = ?, last_error = ? WHERE id = ? AND status IN ('queued','retry')"
        )
        .run(attemptNumber, claimAt, "", row.id);
      if ((claimed.changes ?? 0) < 1) continue;

      summary.processed += 1;

      try {
        if (row.job_type !== JOB_TYPE_KICK_AVL) {
          const unsupported: any = new Error(`Unsupported Traccar outbox job type: ${row.job_type}`);
          unsupported.permanent = true;
          throw unsupported;
        }

        const payload = safeJsonParse<KickAvlPayload>(row.payload);
        if (!payload) {
          const invalidPayload: any = new Error(`Invalid payload for Traccar outbox job ${row.id}`);
          invalidPayload.permanent = true;
          throw invalidPayload;
        }

        await processKickAvlJob(row, payload);
        const processedAt = new Date().toISOString();
        db.prepare("UPDATE traccar_outbox SET status = 'processed', processed_at = ?, updated_at = ? WHERE id = ?")
          .run(processedAt, processedAt, row.id);
        summary.succeeded += 1;
      } catch (error: any) {
        const message = String(error?.message ?? error ?? "Traccar outbox job failed");
        const permanent = Boolean(error?.permanent) || attemptNumber >= maxAttempts;
        const nextStatus = permanent ? "failed" : "retry";
        const nextAvailableAt = permanent ? new Date().toISOString() : buildBackoffIso(attemptNumber);
        db.prepare("UPDATE traccar_outbox SET status = ?, available_at = ?, updated_at = ?, last_error = ? WHERE id = ?")
          .run(nextStatus, nextAvailableAt, new Date().toISOString(), message, row.id);
        if (permanent) summary.failed += 1;
        else summary.retried += 1;
        logger?.warn?.(`[traccar-outbox] ${row.id} ${nextStatus}: ${message}`);
      }
    }

    return summary;
  }

  return {
    enqueueKickAvlCommandJob,
    processPendingJobs,
    readJob,
    getDiagnostics,
    getGlobalPendingCount,
  };
}