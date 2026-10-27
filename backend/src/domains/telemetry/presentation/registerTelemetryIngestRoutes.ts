import type { Express, Request, Response } from "express";

interface RegisterTelemetryIngestRoutesDeps {
  app: Express;
  requireApiKey: (req: Request, res: Response) => boolean;
  isLoopbackRequest: (req: Request) => boolean;
  normalizeFreematicsTelemetryBody: (body: unknown) => any | null;
  parseQueclinkTextMessage: (raw: string) => any | null;
  findTenantForImeiWithDefault: (imei: string, fallbackTenant: string) => string;
  storeTelemetryEventForTenant: (tenant: string, payload: any) => {
    ok: boolean;
    status: number;
    error?: string;
    stored?: boolean;
    id?: string;
    eventId?: string;
    tenantId?: string;
    ignoredReason?: string;
  };
  forwardTelemetryToWorker: (payload: any, tenant: string) => void;
  freematicsDefaultTenant: string;
  queclinkDefaultTenant: string;
}

export function registerTelemetryIngestRoutes(deps: RegisterTelemetryIngestRoutesDeps): void {
  const {
    app,
    requireApiKey,
    isLoopbackRequest,
    normalizeFreematicsTelemetryBody,
    parseQueclinkTextMessage,
    findTenantForImeiWithDefault,
    storeTelemetryEventForTenant,
    forwardTelemetryToWorker,
    freematicsDefaultTenant,
    queclinkDefaultTenant,
  } = deps;

  app.post("/ingest/telemetry", (req, res) => {
    if (!requireApiKey(req, res) && !isLoopbackRequest(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const result = storeTelemetryEventForTenant(tenant, body);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    res.status(result.status).json({
      stored: result.stored !== false,
      id: result.id,
      eventId: result.eventId,
      tenantId: result.tenantId,
      ...(result.stored === false && result.ignoredReason ? { ignoredReason: result.ignoredReason } : {}),
    });
  });

  app.post("/ingest/freematics", (req, res) => {
    if (!requireApiKey(req, res) && !isLoopbackRequest(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body ?? {};
    const normalized = normalizeFreematicsTelemetryBody(body);
    if (!normalized) {
      return res.status(400).json({ error: "Invalid Freematics payload. Latitude and longitude are required." });
    }

    const imei = String((normalized as any)?.data?.imei ?? "").trim();
    const headerTenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const tenant = headerTenant || findTenantForImeiWithDefault(imei, freematicsDefaultTenant);
    const result = storeTelemetryEventForTenant(tenant, normalized);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    if (result.stored !== false) {
      forwardTelemetryToWorker(normalized as any, tenant);
    }

    res.status(result.status).json({
      stored: result.stored !== false,
      id: result.id,
      eventId: result.eventId,
      tenantId: result.tenantId,
      provider: "freematics",
      ...(result.stored === false && result.ignoredReason ? { ignoredReason: result.ignoredReason } : {}),
    });
  });

  app.post("/ingest/queclink", (req, res) => {
    if (!requireApiKey(req, res) && !isLoopbackRequest(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const raw = String((req.body as any)?.line ?? (req.body as any)?.payload ?? "").trim();
    if (!raw) return res.status(400).json({ error: "line or payload is required" });

    const parsed = parseQueclinkTextMessage(raw);
    if (!parsed) return res.status(400).json({ error: "Unable to decode Queclink payload" });

    const headerTenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const tenant = headerTenant || findTenantForImeiWithDefault(parsed.imei, queclinkDefaultTenant);
    const payload: any = {
      data: {
        imei: parsed.imei,
        lat: parsed.lat,
        lon: parsed.lon,
        speed: parsed.speed ?? undefined,
        heading: parsed.heading ?? undefined,
        timestamp: parsed.timestamp,
        provider: "queclink",
        messageType: parsed.messageType,
        raw: parsed.raw,
      },
    };

    const result = storeTelemetryEventForTenant(tenant, payload);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    if (result.stored !== false) {
      forwardTelemetryToWorker(payload, tenant);
    }

    res.status(result.status).json({
      stored: result.stored !== false,
      id: result.id,
      eventId: result.eventId,
      tenantId: result.tenantId,
      provider: "queclink",
      ...(result.stored === false && result.ignoredReason ? { ignoredReason: result.ignoredReason } : {}),
    });
  });
}
