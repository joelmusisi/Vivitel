import type { Express, NextFunction, Request, Response } from "express";
import client from "prom-client";

/**
 * Prometheus instrumentation for the VPS Express server.
 *
 * The Cloudflare Worker cannot run prom-client (no long-lived process / pull
 * model), so the VPS server is the single Prometheus scrape target. It exposes
 * default Node.js process metrics, HTTP request metrics, and a handful of
 * business gauges (storage mode, cache health, telemetry volume, device
 * ingest activity) refreshed on each scrape.
 */

export interface VpsBusinessGauges {
  storageSqlite: client.Gauge<string>;
  valkeyConnected: client.Gauge<string>;
  postgresMirror: client.Gauge<string>;
  postgresMirrorReachable: client.Gauge<string>;
  postgresMirrorLagEvents: client.Gauge<string>;
  b2Enabled: client.Gauge<string>;
  telemetryEvents: client.Gauge<string>;
  tcpActiveConnections: client.Gauge<string>;
  authSessionCacheSize: client.Gauge<string>;
  workerForwardQueueDepth: client.Gauge<string>;
  traccarOutboxPending: client.Gauge<string>;
}

export interface VpsBusinessCounters {
  rateLimitExceeded: client.Counter<string>;
  workerForwardSuccess: client.Counter<string>;
  workerForwardFailed: client.Counter<string>;
  workerForwardDropped: client.Counter<string>;
}

export interface VpsMetrics {
  register: client.Registry;
  httpMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  business: VpsBusinessGauges;
  counters: VpsBusinessCounters;
}

/**
 * Build the metrics registry and the HTTP-timing middleware. Call this once at
 * startup and mount `httpMiddleware` BEFORE any routes so every request is
 * captured.
 */
export function createVpsMetrics(): VpsMetrics {
  const register = new client.Registry();
  register.setDefaultLabels({ app: "vivi-telematics-vps" });
  client.collectDefaultMetrics({ register });

  const httpRequestsTotal = new client.Counter({
    name: "vivi_http_requests_total",
    help: "Total number of HTTP requests handled by the VPS server",
    labelNames: ["method", "route", "status"] as const,
    registers: [register],
  });

  const httpRequestDuration = new client.Histogram({
    name: "vivi_http_request_duration_seconds",
    help: "HTTP request latency in seconds",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [register],
  });

  const httpMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const endTimer = httpRequestDuration.startTimer();
    res.on("finish", () => {
      // Prefer the matched route template (e.g. "/assets/:id") to keep label
      // cardinality bounded; fall back to a coarse path when unmatched.
      const route = (req.route?.path as string | undefined) ?? req.baseUrl ?? "unmatched";
      const labels = {
        method: req.method,
        route: String(route || "unmatched"),
        status: String(res.statusCode),
      };
      httpRequestsTotal.inc(labels);
      endTimer(labels);
    });
    next();
  };

  const business: VpsBusinessGauges = {
    storageSqlite: new client.Gauge({
      name: "vivi_storage_sqlite",
      help: "1 when the persistent SQLite store is active, 0 when running in-memory fallback",
      registers: [register],
    }),
    valkeyConnected: new client.Gauge({
      name: "vivi_valkey_connected",
      help: "1 when the Valkey cache client is connected, 0 otherwise",
      registers: [register],
    }),
    postgresMirror: new client.Gauge({
      name: "vivi_postgres_mirror_enabled",
      help: "1 when the optional Postgres telemetry mirror is configured, 0 otherwise",
      registers: [register],
    }),
    postgresMirrorReachable: new client.Gauge({
      name: "vivi_postgres_mirror_reachable",
      help: "1 when the Postgres mirror answered the last health probe, 0 otherwise",
      registers: [register],
    }),
    postgresMirrorLagEvents: new client.Gauge({
      name: "vivi_postgres_mirror_lag_events",
      help: "Difference between SQLite telemetry count and Postgres mirror count (0 when mirror disabled)",
      registers: [register],
    }),
    b2Enabled: new client.Gauge({
      name: "vivi_b2_enabled",
      help: "1 when Backblaze B2 blob storage is configured, 0 otherwise",
      registers: [register],
    }),
    telemetryEvents: new client.Gauge({
      name: "vivi_telemetry_events_total",
      help: "Total telemetry events currently stored (all tenants)",
      registers: [register],
    }),
    tcpActiveConnections: new client.Gauge({
      name: "vivi_device_tcp_active_connections",
      help: "Active device TCP ingest connections across all protocols",
      registers: [register],
    }),
    authSessionCacheSize: new client.Gauge({
      name: "vivi_auth_session_cache_size",
      help: "Number of entries currently held in the in-memory auth session hot cache",
      registers: [register],
    }),
    workerForwardQueueDepth: new client.Gauge({
      name: "vivi_worker_forward_queue_depth",
      help: "Telemetry events waiting to be forwarded from VPS to Worker",
      registers: [register],
    }),
    traccarOutboxPending: new client.Gauge({
      name: "vivi_traccar_outbox_pending",
      help: "Traccar outbox jobs in queued, retry, or processing state",
      registers: [register],
    }),
  };

  const counters: VpsBusinessCounters = {
    rateLimitExceeded: new client.Counter({
      name: "vivi_rate_limit_exceeded_total",
      help: "Total HTTP requests rejected with 429 Too Many Requests",
      registers: [register],
    }),
    workerForwardSuccess: new client.Counter({
      name: "vivi_worker_forward_success_total",
      help: "Total telemetry events successfully forwarded to the Cloudflare Worker",
      registers: [register],
    }),
    workerForwardFailed: new client.Counter({
      name: "vivi_worker_forward_failed_total",
      help: "Total telemetry forward attempts that exhausted retries or failed permanently",
      registers: [register],
    }),
    workerForwardDropped: new client.Counter({
      name: "vivi_worker_forward_dropped_total",
      help: "Total telemetry events dropped because the forward queue was full",
      registers: [register],
    }),
  };

  return { register, httpMiddleware, business, counters };
}

export interface RegisterMetricsRoutesDeps {
  app: Express;
  metrics: VpsMetrics;
  /**
   * Called on every scrape to refresh business gauges from live diagnostics.
   * Keep it cheap and resilient — failures must not break the scrape.
   */
  collectBusinessMetrics: () => Promise<void> | void;
}

export function registerMetricsRoutes(deps: RegisterMetricsRoutesDeps): void {
  const { app, metrics, collectBusinessMetrics } = deps;
  app.get("/metrics", async (_req: Request, res: Response) => {
    try {
      await collectBusinessMetrics();
    } catch {
      // Never fail a scrape because a single gauge refresh threw.
    }
    try {
      res.set("Content-Type", metrics.register.contentType);
      res.end(await metrics.register.metrics());
    } catch (err) {
      res.status(500).end(String((err as Error)?.message ?? err));
    }
  });
}
