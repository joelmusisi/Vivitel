import type { Express, Request, Response } from "express";

interface RegisterHealthRoutesDeps {
  app: Express;
  hasSqlite: boolean;
  dbPath: string;
  requirePersistentDb: boolean;
  valkeyClient: any;
  valkeyUrl: string;
  valkeyTtl: number;
  readTelemetryCount: (tenant?: string) => number;
  readLatestTelemetryAt: (tenant?: string) => string | null;
  postgresTelemetryMirror?: {
    readTelemetryCount: (tenant?: string) => Promise<number | null>;
    readLatestTelemetryAt: (tenant?: string) => Promise<string | null>;
  } | null;
  b2Enabled?: boolean;
  workerForwardDiagnostics: () => Record<string, unknown>;
  hasWorkerApiKey: boolean;
  getTraccarConfig: () => { baseUrl: string; username: string; token: string; kickCommand: string };
  teltonikaTcpDiagnostics: any;
  concoxTcpDiagnostics: any;
  queclinkTcpDiagnostics: any;
  jt808Diagnostics: any;
  getAdminSessionHotCacheStats: () => {
    size: number;
    maxEntries: number;
    hits: number;
    misses: number;
    dbHits: number;
    dbMisses: number;
    expired: number;
    prunes: number;
  };
  getAuthSessionInvalidationStats: () => {
    logoutCalls: number;
    revokeCalls: number;
    revokedSessions: number;
    revokeMisses: number;
  };
  /** Optional overload shedder for readiness (LB removes pod when overloaded). */
  getLoadStats?: () => { inFlight: number; maxInFlight: number; eventLoopLagMs: number };
  serviceRole?: string;
}

export function registerHealthRoutes(deps: RegisterHealthRoutesDeps): void {
  const {
    app,
    hasSqlite,
    dbPath,
    requirePersistentDb,
    valkeyClient,
    valkeyUrl,
    valkeyTtl,
    readTelemetryCount,
    readLatestTelemetryAt,
    postgresTelemetryMirror,
    b2Enabled,
    workerForwardDiagnostics: getWorkerForwardDiagnostics,
    hasWorkerApiKey,
    getTraccarConfig,
    teltonikaTcpDiagnostics,
    concoxTcpDiagnostics,
    queclinkTcpDiagnostics,
    jt808Diagnostics,
    getAdminSessionHotCacheStats,
    getAuthSessionInvalidationStats,
    getLoadStats,
    serviceRole,
  } = deps;

  // Liveness — process is up. Keep cheap so overloaded pods are not killed unnecessarily.
  app.get("/health/live", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "live",
      timestamp: new Date().toISOString(),
      serviceRole: serviceRole || "all"
    });
  });

  // Readiness — safe to receive traffic. Fail under overload so the Service/Ingress
  // load balancer stops sending work to this pod (self-healing under LB pressure).
  app.get("/health/ready", (_req: Request, res: Response) => {
    const load = getLoadStats?.() ?? { inFlight: 0, maxInFlight: 0, eventLoopLagMs: 0 };
    const overloaded =
      (load.maxInFlight > 0 && load.inFlight >= load.maxInFlight) || load.eventLoopLagMs >= 1500;
    if (overloaded) {
      return res.status(503).json({
        status: "not-ready",
        reason: "overloaded",
        timestamp: new Date().toISOString(),
        serviceRole: serviceRole || "all",
        load
      });
    }
    if (requirePersistentDb && !hasSqlite) {
      return res.status(503).json({
        status: "not-ready",
        reason: "persistent-db-unavailable",
        timestamp: new Date().toISOString()
      });
    }
    return res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
      serviceRole: serviceRole || "all",
      load
    });
  });

  app.get("/health", async (req: Request, res: Response) => {
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const pgCount = await postgresTelemetryMirror?.readTelemetryCount(tenant || undefined);
    const pgLatestEventAt = await postgresTelemetryMirror?.readLatestTelemetryAt(tenant || undefined);
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      storage: {
        mode: hasSqlite ? "sqlite" : "memory",
        dbPath: hasSqlite ? dbPath : null,
        requirePersistentDb: requirePersistentDb,
      },
      cache: {
        driver: valkeyClient ? "valkey" : "none",
        connected: valkeyClient ? (valkeyClient.status === "ready") : false,
        url: valkeyUrl ? valkeyUrl.replace(/:\/\/[^@]*@/, "://*@") : null,
        ttlSeconds: valkeyTtl,
        authSessions: {
          strategy: "memory-hot-cache with sqlite fallback",
          valkeyRole: "distributed auth read cache",
          ...getAdminSessionHotCacheStats(),
          invalidation: getAuthSessionInvalidationStats(),
        },
      },
      telemetry: {
        tenantId: tenant || undefined,
        totalEvents: pgCount ?? readTelemetryCount(tenant || undefined),
        latestEventAt: pgLatestEventAt ?? readLatestTelemetryAt(tenant || undefined),
      },
      postgres: {
        // Optional analytical/telemetry mirror — null counts mean unreachable.
        enabled: Boolean(postgresTelemetryMirror),
        reachable: pgCount !== null && pgCount !== undefined,
        totalEvents: pgCount ?? null,
      },
      blob: {
        // Backblaze B2 object storage for heavy telemetry archives/media.
        driver: "backblaze-b2",
        enabled: Boolean(b2Enabled),
      },
      workerForward: {
        ...getWorkerForwardDiagnostics(),
        hasApiKey: Boolean(hasWorkerApiKey),
      },
    });
  });

  app.get("/health/tcp", (_req: Request, res: Response) => {
    const traccar = getTraccarConfig();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      traccar: {
        baseUrl: traccar.baseUrl || null,
        username: traccar.username ? "***" : null,
        token: traccar.token ? "***" : null,
        kickCommand: traccar.kickCommand,
      },
      teltonika: {
        listeners: teltonikaTcpDiagnostics.listeners,
        opened: teltonikaTcpDiagnostics.opened,
        closed: teltonikaTcpDiagnostics.closed,
        closedWithError: teltonikaTcpDiagnostics.closedWithError,
        parserDecodeFailures: teltonikaTcpDiagnostics.parserDecodeFailures,
        parserFallbackAcks: teltonikaTcpDiagnostics.parserFallbackAcks,
        activeByPort: teltonikaTcpDiagnostics.activeByPort,
        recent: teltonikaTcpDiagnostics.recent.slice(0, 50),
      },
      concox: {
        listener: concoxTcpDiagnostics.listener,
        opened: concoxTcpDiagnostics.opened,
        closed: concoxTcpDiagnostics.closed,
        parseFailures: concoxTcpDiagnostics.parseFailures,
        activeConnections: concoxTcpDiagnostics.activeConnections,
        recent: concoxTcpDiagnostics.recent.slice(0, 50),
      },
      queclink: {
        listener: queclinkTcpDiagnostics.listener,
        opened: queclinkTcpDiagnostics.opened,
        closed: queclinkTcpDiagnostics.closed,
        parseFailures: queclinkTcpDiagnostics.parseFailures,
        activeConnections: queclinkTcpDiagnostics.activeConnections,
        recent: queclinkTcpDiagnostics.recent.slice(0, 50),
      },
      jt808: {
        frames: jt808Diagnostics.frames,
        badFrames: jt808Diagnostics.badFrames,
        locations: jt808Diagnostics.locations,
        acksSent: jt808Diagnostics.acksSent,
        trackedDevices: Object.keys(jt808Diagnostics.lastByImei).length,
        recent: jt808Diagnostics.recent.slice(0, 50),
      },
    });
  });
}
