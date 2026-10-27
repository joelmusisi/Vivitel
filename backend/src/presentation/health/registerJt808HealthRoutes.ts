import type { Express } from "express";

interface RegisterJt808HealthRoutesDeps {
  app: Express;
  jt808Diagnostics: any;
  findTenantForImeiWithDefault: (imei: string, fallback: string) => string;
  jt808DefaultTenant: string;
  db: any;
  parseStoredJson: (input: any) => any;
  coerceNumber: (value: unknown) => number | null;
  postgresTelemetryMirror?: {
    readLatestTelemetryByImei: (tenant: string, imei: string) => Promise<{ data: string; created_at: string } | null>;
  } | null;
}

export function registerJt808HealthRoutes(deps: RegisterJt808HealthRoutesDeps): void {
  const {
    app,
    jt808Diagnostics,
    findTenantForImeiWithDefault,
    jt808DefaultTenant,
    db,
    parseStoredJson,
    coerceNumber,
    postgresTelemetryMirror,
  } = deps;

  app.get("/health/jt808", (req, res) => {
    const imei = String(req.query.imei ?? "").trim();
    const recent = imei
      ? jt808Diagnostics.recent.filter((evt: any) => String(evt.imei ?? "").trim() === imei).slice(0, 50)
      : jt808Diagnostics.recent.slice(0, 50);
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      jt808: {
        frames: jt808Diagnostics.frames,
        badFrames: jt808Diagnostics.badFrames,
        locations: jt808Diagnostics.locations,
        acksSent: jt808Diagnostics.acksSent,
        trackedDevices: Object.keys(jt808Diagnostics.lastByImei).length,
        ...(imei ? { imei } : {}),
        ...(imei ? { lastForImei: jt808Diagnostics.lastByImei[imei] ?? null } : {}),
        recent,
        lastByImei: imei ? undefined : jt808Diagnostics.lastByImei
      }
    });
  });

  app.get("/jt808/last-location", async (req, res) => {
    const imei = String(req.query.imei ?? "").trim();

    if (!imei) {
      const devices = Object.entries(jt808Diagnostics.lastByImei)
        .map(([deviceImei, payload]) => ({ imei: deviceImei, ...(payload || {}) }))
        .sort((a, b) => (String((a as any).at ?? "") < String((b as any).at ?? "") ? 1 : -1));
      return res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        count: devices.length,
        devices
      });
    }

    const live = jt808Diagnostics.lastByImei[imei] ?? null;
    const tenant = findTenantForImeiWithDefault(imei, jt808DefaultTenant || "default");

    let latestTelemetry: any = null;
    try {
      const pgRow = await postgresTelemetryMirror?.readLatestTelemetryByImei(tenant, imei);
      const row = pgRow ?? db
        .prepare("SELECT data, created_at FROM telemetry_events WHERE tenant_id = ? AND imei = ? ORDER BY created_at DESC LIMIT 1")
        .get(tenant, imei);
      if (row?.data) {
        const parsed = parseStoredJson((row as any).data) ?? {};
        const data = (parsed as any)?.data?.data ?? (parsed as any)?.data ?? parsed;
        const lat = coerceNumber((data as any)?.lat ?? (data as any)?.latitude);
        const lng = coerceNumber((data as any)?.lng ?? (data as any)?.lon ?? (data as any)?.longitude);
        const speed = coerceNumber((data as any)?.speed);
        const heading = coerceNumber((data as any)?.heading ?? (data as any)?.course);
        const satellites = coerceNumber((data as any)?.satellites);
        const at = String((data as any)?.timestamp ?? (data as any)?.at ?? (row as any)?.created_at ?? "").trim();
        latestTelemetry = {
          at,
          lat,
          lng,
          speed,
          heading,
          satellites,
          provider: String((data as any)?.provider ?? "").trim() || undefined,
          messageId: coerceNumber((data as any)?.messageId)
        };
      }
    } catch {
      latestTelemetry = null;
    }

    const effective = live
      ? {
          at: String((live as any).timestamp ?? (live as any).at ?? ""),
          lat: coerceNumber((live as any).lat),
          lng: coerceNumber((live as any).lon),
          speed: coerceNumber((live as any).speed),
          heading: coerceNumber((live as any).heading),
          provider: "jt808"
        }
      : latestTelemetry;

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      imei,
      tenantId: tenant,
      live,
      latestTelemetry,
      effective
    });
  });
}
