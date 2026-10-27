export type WorkerForwardQueueDiagnostics = {
  enabled: boolean;
  url: string;
  queued: number;
  attempts: number;
  success: number;
  failed: number;
  dropped: number;
  lastStatus: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

type QueueItem = {
  tenant: string;
  body: Record<string, unknown>;
  attempts: number;
  availableAt: number;
};

export type CreateWorkerForwardQueueDeps = {
  enabled: boolean;
  url: string;
  apiKey: string;
  fetchFn?: typeof fetch;
  maxAttempts?: number;
  maxQueueSize?: number;
  logger?: { warn?: (...args: unknown[]) => void };
};

const backoffMs = (attempt: number) =>
  Math.min(300_000, Math.max(2_000, 2_000 * 2 ** Math.max(0, attempt - 1)));

/**
 * Durable-ish retry queue for VPS → Worker telemetry forwarding.
 * Transient Worker outages no longer drop events on the floor.
 */
export function createWorkerForwardQueue(deps: CreateWorkerForwardQueueDeps) {
  const {
    enabled,
    url,
    apiKey,
    fetchFn = globalThis.fetch.bind(globalThis),
    maxAttempts = 6,
    maxQueueSize = 5000,
    logger,
  } = deps;

  const queue: QueueItem[] = [];
  let draining = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const diagnostics: WorkerForwardQueueDiagnostics = {
    enabled,
    url,
    queued: 0,
    attempts: 0,
    success: 0,
    failed: 0,
    dropped: 0,
    lastStatus: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };

  const syncQueued = () => {
    diagnostics.queued = queue.length;
  };

  async function deliver(item: QueueItem): Promise<boolean> {
    if (!enabled || !url || !apiKey) return true;
    diagnostics.attempts += 1;
    try {
      const resp = await fetchFn(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          ...(item.tenant ? { "x-tenant-id": item.tenant } : {}),
        },
        body: JSON.stringify(item.body),
      });
      diagnostics.lastStatus = resp.status;
      if (resp.ok) {
        diagnostics.success += 1;
        diagnostics.lastSuccessAt = new Date().toISOString();
        return true;
      }
      if (resp.status === 429) {
        diagnostics.lastError = "HTTP 429";
        return false;
      }
      if (resp.status >= 500) return false;
      diagnostics.failed += 1;
      diagnostics.lastFailureAt = new Date().toISOString();
      diagnostics.lastError = `HTTP ${resp.status}`;
      return true;
    } catch (err: unknown) {
      diagnostics.lastFailureAt = new Date().toISOString();
      diagnostics.lastError = String((err as Error)?.message ?? err ?? "forward_failed");
      return false;
    }
  }

  async function drainOnce() {
    if (draining || !queue.length) return;
    draining = true;
    try {
      const now = Date.now();
      const ready = queue.filter((item) => item.availableAt <= now);
      for (const item of ready.slice(0, 20)) {
        const idx = queue.indexOf(item);
        if (idx < 0) continue;
        queue.splice(idx, 1);
        syncQueued();
        const ok = await deliver(item);
        if (ok) continue;
        item.attempts += 1;
        if (item.attempts >= maxAttempts) {
          diagnostics.failed += 1;
          diagnostics.lastFailureAt = new Date().toISOString();
          diagnostics.lastError = diagnostics.lastError ?? "max_attempts_exceeded";
          logger?.warn?.("[worker-forward] dropped after max attempts", item.tenant);
          continue;
        }
        item.availableAt = Date.now() + backoffMs(item.attempts);
        queue.push(item);
        syncQueued();
      }
    } finally {
      draining = false;
    }
  }

  function enqueue(tenant: string, body: Record<string, unknown>) {
    if (!enabled || !url || !apiKey) return;
    if (queue.length >= maxQueueSize) {
      diagnostics.dropped += 1;
      logger?.warn?.("[worker-forward] queue full, dropping event");
      return;
    }
    queue.push({ tenant, body, attempts: 0, availableAt: Date.now() });
    syncQueued();
    void drainOnce();
  }

  function start(intervalMs = 2_000) {
    if (timer) return;
    timer = setInterval(() => {
      void drainOnce();
    }, intervalMs);
    if (typeof (timer as NodeJS.Timeout).unref === "function") {
      (timer as NodeJS.Timeout).unref();
    }
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return {
    enqueue,
    drainOnce,
    start,
    stop,
    getDiagnostics: () => ({ ...diagnostics, queued: queue.length }),
  };
}
