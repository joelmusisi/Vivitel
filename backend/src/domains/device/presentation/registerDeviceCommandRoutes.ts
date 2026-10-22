import type { Express, Request, Response } from "express";

interface RegisterDeviceCommandRoutesDeps {
  app: Express;
  db: any;
  requireApiKey: (req: Request, res: Response) => boolean;
  buildDeviceSettingsPayload: (tenant: string, imei: string) => { ok: boolean; payload?: any; message?: string };
  mergeDeviceSettingsPayload: (base: Record<string, unknown>, override: Record<string, unknown>) => Record<string, unknown>;
  isRecordObject: (value: unknown) => value is Record<string, unknown>;
  resolveCameraId: (req: Request, body?: any) => string;
  generateId: () => string;
}

export function registerDeviceCommandRoutes(deps: RegisterDeviceCommandRoutesDeps): void {
  const {
    app,
    db,
    requireApiKey,
    buildDeviceSettingsPayload,
    mergeDeviceSettingsPayload,
    isRecordObject,
    resolveCameraId,
    generateId,
  } = deps;

  app.get("/device/settings", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const imei = String(req.query.imei ?? "").trim();
    if (!imei) return res.status(400).json({ error: "imei is required." });
    const result = buildDeviceSettingsPayload(tenant, imei);
    if (!result.ok) return res.status(400).json({ error: result.message });
    res.json({ settings: result.payload, tenantId: tenant, imei });
  });

  app.post("/device/push-settings", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const imei = String(req.body?.imei ?? "").trim();
    if (!imei) return res.status(400).json({ error: "imei is required." });

    const result = buildDeviceSettingsPayload(tenant, imei);
    if (!result.ok) return res.status(400).json({ error: result.message });

    const overridePayload = req.body?.payload;
    const payload = isRecordObject(overridePayload)
      ? mergeDeviceSettingsPayload(result.payload as Record<string, unknown>, overridePayload)
      : result.payload;

    const id = generateId();
    const assetId = String((payload as any).asset?.id ?? "");
    const now = new Date().toISOString();
    const stmt = db.prepare("INSERT INTO device_push_queue (id, tenant_id, imei, asset_id, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    stmt.run(id, tenant, imei, assetId, "queued", JSON.stringify(payload), now, now);
    res.json({ queued: true, id, tenantId: tenant, imei });
  });

  app.get("/device/pending-settings", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const imei = String(req.query.imei ?? "").trim();
    if (!imei) return res.status(400).json({ error: "imei is required." });

    const row = db.prepare("SELECT id, payload, created_at FROM device_push_queue WHERE tenant_id = ? AND imei = ? AND status = 'queued' ORDER BY created_at DESC LIMIT 1").get(tenant, imei);
    if (!row) return res.json({ pending: null, tenantId: tenant, imei });

    const payload = JSON.parse((row as any).payload ?? "{}");
    res.json({ pending: { id: (row as any).id, payload, createdAt: (row as any).created_at }, tenantId: tenant, imei });
  });

  app.post("/device/ack-settings", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const id = String(req.body?.id ?? "").trim();
    const imei = String(req.body?.imei ?? "").trim();
    if (!id || !imei) return res.status(400).json({ error: "id and imei are required." });

    const now = new Date().toISOString();
    const result = db.prepare("UPDATE device_push_queue SET status = 'delivered', updated_at = ? WHERE tenant_id = ? AND id = ? AND imei = ?").run(now, tenant, id, imei);
    res.json({ delivered: ((result as any).changes ?? 0) > 0, id, tenantId: tenant, imei });
  });

  const parseStoredHealth = (value: unknown) => {
    if (!value) return {};
    if (typeof value === "object") return value as Record<string, unknown>;
    try {
      return JSON.parse(String(value)) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  app.post("/intercom/session/start", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const body = req.body ?? {};
    const cameraId = resolveCameraId(req, body);
    if (!cameraId) return res.status(400).json({ error: "cameraId/deviceId is required" });

    const sessionId = generateId();
    const startedAt = new Date().toISOString();
    const assetId = String((body as any).assetId ?? "").trim();
    const override = {
      camera: { autoStartIntercom: true, autoStartTalkback: true },
      intercom: { enabled: true, uploadIntervalMs: 1000 },
    };

    let queued = false;
    let queueId: string | undefined;
    let settingsMessage = "";

    const result = buildDeviceSettingsPayload(tenant, cameraId);
    if (result.ok && result.payload) {
      const payload = isRecordObject(result.payload)
        ? mergeDeviceSettingsPayload(result.payload, override)
        : result.payload;
      queueId = generateId();
      const resolvedAssetId = assetId || String((payload as any)?.asset?.id ?? "");
      try {
        db.prepare(
          "INSERT INTO device_push_queue (id, tenant_id, imei, asset_id, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(queueId, tenant, cameraId, resolvedAssetId, "queued", JSON.stringify(payload), startedAt, startedAt);
        queued = true;
      } catch (e: any) {
        settingsMessage = e?.message ?? String(e);
        queueId = undefined;
      }
    } else {
      settingsMessage = String(result.message ?? "Device settings were not queued.");
    }

    res.status(201).json({
      started: true,
      sessionId,
      cameraId,
      assetId: assetId || null,
      queued,
      queueId: queueId || null,
      startedAt,
      talkbackReady: true,
      message: queued
        ? "Intercom activation queued. The camera will join on its next sync."
        : `Intercom console is open. ${settingsMessage} Talkback is ready.`
    });
  });

  app.get("/intercom/session/status", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const cameraId = resolveCameraId(req);
    if (!cameraId) return res.status(400).json({ error: "cameraId/deviceId is required" });

    let health: Record<string, unknown> = {};
    let updatedAt = "";
    try {
      const row = db
        .prepare("SELECT data, updated_at FROM camera_health WHERE tenant_id = ? AND camera_id = ?")
        .get(tenant, cameraId);
      health = parseStoredHealth((row as any)?.data);
      updatedAt = String((row as any)?.updated_at ?? "");
    } catch {
      health = {};
    }

    let latestAudio: any = null;
    try {
      latestAudio = db
        .prepare(
          "SELECT recorded_at, created_at, bytes, sample_rate FROM camera_audio_chunks WHERE tenant_id = ? AND camera_id = ? ORDER BY created_at DESC LIMIT 1"
        )
        .get(tenant, cameraId);
    } catch {
      latestAudio = null;
    }

    const lastAudioAt = String(health.lastAudioAt ?? latestAudio?.recorded_at ?? latestAudio?.created_at ?? "");
    const lastSeenAt = String(health.lastSeenAt ?? updatedAt);
    const lastAudioMs = Date.parse(lastAudioAt);
    const lastSeenMs = Date.parse(lastSeenAt);
    const inboundLive = Number.isFinite(lastAudioMs) && Date.now() - lastAudioMs < 12_000;
    let pendingTalkback = false;
    try {
      const row = db
        .prepare(
          "SELECT id FROM talkback_queue WHERE tenant_id = ? AND camera_id = ? AND status = 'queued' ORDER BY created_at ASC LIMIT 1"
        )
        .get(tenant, cameraId);
      pendingTalkback = Boolean(row);
    } catch {
      pendingTalkback = false;
    }

    res.json({
      cameraId,
      tenantId: tenant,
      lastSeenAt,
      lastAudioAt,
      inboundLive,
      audioChunks: Number(health.audioChunks ?? 0),
      pendingTalkback,
      transport: String(health.transport ?? ""),
      online: Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs < 90_000
    });
  });

  app.post("/intercom/talkback/enqueue", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const body = req.body ?? {};
    const cameraId = resolveCameraId(req, body);
    if (!cameraId) return res.status(400).json({ error: "cameraId/deviceId is required" });

    const pcmBase64 = String((body as any).pcm16leBase64 ?? "").trim();
    if (!pcmBase64) return res.status(400).json({ error: "pcm16leBase64 is required" });
    const sampleRate = Math.max(8_000, Math.min(48_000, Number((body as any).sampleRate ?? 16_000) || 16_000));
    const channels = Math.max(1, Math.min(2, Number((body as any).channels ?? 1) || 1));

    const createdAt = new Date().toISOString();
    const id = generateId();
    try {
      db.prepare(
        "INSERT INTO talkback_queue (id, tenant_id, camera_id, sample_rate, channels, payload_base64, status, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, '')"
      ).run(id, tenant, cameraId, sampleRate, channels, pcmBase64, createdAt);
      res.status(201).json({ queued: true, id, tenantId: tenant, cameraId, sampleRate, channels, createdAt });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to enqueue talkback", message: e?.message ?? String(e) });
    }
  });

  app.get("/intercom/talkback/next", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const cameraId = resolveCameraId(req);
    if (!cameraId) return res.status(400).json({ error: "cameraId/deviceId is required" });

    try {
      const row = db
        .prepare(
          "SELECT id, sample_rate, channels, payload_base64, created_at FROM talkback_queue WHERE tenant_id = ? AND camera_id = ? AND status = 'queued' ORDER BY created_at ASC LIMIT 1"
        )
        .get(tenant, cameraId);
      if (!row) return res.status(204).send();
      db.prepare("UPDATE talkback_queue SET status = 'delivering' WHERE id = ? AND status = 'queued'").run(String((row as any).id ?? ""));
      res.json({
        id: String((row as any).id ?? ""),
        cameraId,
        tenantId: tenant,
        sampleRate: Number((row as any).sample_rate ?? 16_000),
        channels: Number((row as any).channels ?? 1),
        pcm16leBase64: String((row as any).payload_base64 ?? ""),
        queuedAt: String((row as any).created_at ?? "")
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to fetch talkback frame", message: e?.message ?? String(e) });
    }
  });

  app.post("/intercom/talkback/:id/ack", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const deliveredAt = new Date().toISOString();
    try {
      const result = db
        .prepare("UPDATE talkback_queue SET status = 'delivered', delivered_at = ? WHERE id = ? AND tenant_id = ?")
        .run(deliveredAt, id, tenant);
      res.json({ delivered: Number((result as any)?.changes ?? 0) > 0, id, deliveredAt, tenantId: tenant });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to ack talkback frame", message: e?.message ?? String(e) });
    }
  });
}
