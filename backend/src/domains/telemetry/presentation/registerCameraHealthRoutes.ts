import type { Express } from "express";

interface RegisterCameraHealthRoutesDeps {
  app: Express;
  db: any;
  requireApiKey: (req: any, res: any) => boolean;
  resolveCameraId: (req: any, body?: any) => string;
  toIsoTimestamp: (value: any) => string;
  normalizeCameraHealthTelemetryBody: (body: any, cameraId: string) => any;
  findTenantForImeiWithDefault: (imei: string, fallback: string) => string;
  upsertCameraHealth: (tenantId: string, cameraId: string, payload: any, atIso: string) => any;
  valkeyDel: (key: string) => Promise<any>;
  storeTelemetryEventForTenant: (tenantId: string, payload: any) => any;
  forwardTelemetryToWorker: (payload: any, tenantId: string) => void;
  valkeyGet: (key: string) => Promise<string | null>;
  listCameraHealth: (tenantId: string) => any[];
  valkeySet: (key: string, value: string, ttlSec?: number) => Promise<any>;
  valkeyTtl: number;
  sanitizeCameraId: (value: any) => string;
  parseStoredJson: (value: any) => any;
  liveText: (value: any) => string;
  liveChannelLabelByIndex: (index: number) => string;
  liveNormalizeChannelKey: (value: any) => string;
  probeStreamQuality: (streamUrl: string) => { ok: boolean; error?: string; result?: any };
}

export function registerCameraHealthRoutes(deps: RegisterCameraHealthRoutesDeps): void {
  const {
    app,
    db,
    requireApiKey,
    resolveCameraId,
    toIsoTimestamp,
    normalizeCameraHealthTelemetryBody,
    findTenantForImeiWithDefault,
    upsertCameraHealth,
    valkeyDel,
    storeTelemetryEventForTenant,
    forwardTelemetryToWorker,
    valkeyGet,
    listCameraHealth,
    valkeySet,
    valkeyTtl,
    sanitizeCameraId,
    parseStoredJson,
    liveText,
    liveChannelLabelByIndex,
    liveNormalizeChannelKey,
    probeStreamQuality,
  } = deps;

  app.post("/ingest/camera-health", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenantHint = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const body = req.body ?? {};
    const cameraId = resolveCameraId(req, body);
    if (!cameraId) return res.status(400).json({ error: "cameraId/deviceId is required" });
    const atIso = toIsoTimestamp((body as any).recordedAt ?? (body as any).at ?? Date.now());
    try {
      const telemetryBody = normalizeCameraHealthTelemetryBody(body, cameraId);
      const telemetryImei = String((telemetryBody as any)?.data?.imei ?? "").trim();
      const tenant = tenantHint || (telemetryImei ? findTenantForImeiWithDefault(telemetryImei, "") : "default");

      const stored = upsertCameraHealth(tenant, cameraId, body, atIso);
      await valkeyDel(`vivi:${tenant}:cameras`);

      let telemetryResult: any = null;
      if (telemetryBody) {
        telemetryResult = storeTelemetryEventForTenant(tenant, telemetryBody);
        if (telemetryResult?.ok && telemetryResult?.stored !== false) {
          forwardTelemetryToWorker(telemetryBody, tenant);
        }
      }

      res.status(202).json({
        accepted: true,
        cameraId,
        tenantId: tenant,
        at: atIso,
        camera: stored,
        telemetry: telemetryResult
          ? {
              ok: Boolean(telemetryResult.ok),
              stored: telemetryResult.stored !== false,
              id: telemetryResult.id,
              eventId: telemetryResult.eventId,
              ...(telemetryResult.ignoredReason ? { ignoredReason: telemetryResult.ignoredReason } : {}),
            }
          : { ok: false, stored: false, reason: "no_position_in_camera_payload" },
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to ingest camera health", message: e?.message ?? String(e) });
    }
  });

  app.get("/d1/cameras", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const cacheKey = `vivi:${tenant}:cameras`;
    const cached = await valkeyGet(cacheKey);
    if (cached) {
      const hit = JSON.parse(cached) as { tenantId: string; cameras: any[]; count: number; at: string };
      const nowMs = Date.now();
      hit.cameras = hit.cameras.map((camera: any) => {
        const lastSeenMs = Date.parse(String(camera?.lastSeenAt ?? ""));
        return { ...camera, staleSec: Number.isFinite(lastSeenMs) ? Math.floor((nowMs - lastSeenMs) / 1000) : null };
      });
      hit.at = new Date().toISOString();
      return res.json(hit);
    }
    try {
      const cameras = listCameraHealth(tenant);
      const nowMs = Date.now();
      const items = cameras.map((camera: any) => {
        const lastSeenMs = Date.parse(String(camera?.lastSeenAt ?? ""));
        const staleSec = Number.isFinite(lastSeenMs) ? Math.floor((nowMs - lastSeenMs) / 1000) : null;
        return { ...camera, staleSec };
      });
      const payload = { tenantId: tenant, cameras: items, count: items.length, at: new Date().toISOString() };
      await valkeySet(cacheKey, JSON.stringify(payload), Math.min(valkeyTtl, 15));
      res.json(payload);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to list cameras", message: e?.message ?? String(e) });
    }
  });

  app.get("/d1/cameras/:cameraId", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const cameraId = sanitizeCameraId(req.params.cameraId);
    if (!cameraId) return res.status(400).json({ error: "cameraId is required" });
    try {
      const row = db.prepare("SELECT data, updated_at FROM camera_health WHERE tenant_id = ? AND camera_id = ?").get(tenant, cameraId);
      if (!row) return res.status(404).json({ error: "Not found" });
      const parsed = parseStoredJson((row as any).data) || {};
      const latestAudio = db
        .prepare(
          "SELECT id, recorded_at, sample_rate, channels, bytes, file_path, created_at FROM camera_audio_chunks WHERE tenant_id = ? AND camera_id = ? ORDER BY created_at DESC LIMIT 1"
        )
        .get(tenant, cameraId);
      res.json({
        tenantId: tenant,
        camera: {
          ...parsed,
          id: cameraId,
          cameraId,
          lastSeenAt: String((parsed as any)?.lastSeenAt ?? (row as any)?.updated_at ?? ""),
        },
        latestAudio: latestAudio || null,
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to read camera", message: e?.message ?? String(e) });
    }
  });

  app.get("/d1/cameras/:cameraId/channels", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim() || "default";
    const cameraId = sanitizeCameraId(req.params.cameraId);
    if (!cameraId) return res.status(400).json({ error: "cameraId is required" });

    try {
      const row = db.prepare("SELECT data, updated_at FROM camera_health WHERE tenant_id = ? AND camera_id = ?").get(tenant, cameraId);
      if (!row) return res.status(404).json({ error: "Not found" });
      const parsed: any = parseStoredJson((row as any).data) || {};
      const channelUrls = Array.isArray(parsed?.channelUrls) ? parsed.channelUrls : [];
      const channelNames = Array.isArray(parsed?.channelNames) ? parsed.channelNames : [];
      const channels = Array.from({ length: Math.max(channelUrls.length, channelNames.length, 3) }, (_, idx) => {
        const index = idx + 1;
        const label = liveText(channelNames[idx]) || liveChannelLabelByIndex(index);
        const key = liveNormalizeChannelKey(label) || `channel-${index}`;
        const streamUrl = liveText(channelUrls[idx]);
        return { index, key, label, streamUrl: streamUrl || null };
      });

      return res.json({
        tenantId: tenant,
        cameraId,
        channels,
        updatedAt: String((row as any)?.updated_at ?? ""),
      });
    } catch (e: any) {
      return res.status(500).json({ error: "Failed to read camera channels", message: e?.message ?? String(e) });
    }
  });

  app.get("/d1/cameras/:cameraId/stream-quality", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim() || "default";
    const cameraId = sanitizeCameraId(req.params.cameraId);
    const channel = Math.max(1, Math.min(16, Number(req.query.channel ?? 1) || 1));
    if (!cameraId) return res.status(400).json({ error: "cameraId is required" });

    try {
      const row = db.prepare("SELECT data, updated_at FROM camera_health WHERE tenant_id = ? AND camera_id = ?").get(tenant, cameraId);
      if (!row) return res.status(404).json({ error: "Not found" });
      const parsed: any = parseStoredJson((row as any).data) || {};
      const channelUrls = Array.isArray(parsed?.channelUrls) ? parsed.channelUrls : [];
      const streamUrl = liveText(channelUrls[channel - 1]) || liveText(parsed?.streamUrl) || liveText(req.query.streamUrl);
      if (!streamUrl) {
        return res.status(400).json({ error: "No stream URL found for this camera/channel" });
      }

      const probe = probeStreamQuality(streamUrl);
      if (!probe.ok) {
        return res.status(502).json({
          ok: false,
          error: probe.error,
          tenantId: tenant,
          cameraId,
          channel,
          streamUrl,
        });
      }

      return res.json({
        ok: true,
        tenantId: tenant,
        cameraId,
        channel,
        streamUrl,
        ...probe.result,
        at: new Date().toISOString(),
      });
    } catch (e: any) {
      return res.status(500).json({ error: "Failed to probe stream quality", message: e?.message ?? String(e) });
    }
  });

  app.post("/d1/cameras/:cameraId/channels", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim() || "default";
    const cameraId = sanitizeCameraId(req.params.cameraId);
    if (!cameraId) return res.status(400).json({ error: "cameraId is required" });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();

    try {
      const row = db.prepare("SELECT data FROM camera_health WHERE tenant_id = ? AND camera_id = ?").get(tenant, cameraId);
      const existing: any = parseStoredJson((row as any)?.data) || {};

      const nextChannelUrls = new Array<string>(16).fill("");
      const prevChannelUrls = Array.isArray(existing?.channelUrls) ? existing.channelUrls : [];
      for (let i = 0; i < Math.min(prevChannelUrls.length, 16); i += 1) {
        nextChannelUrls[i] = liveText(prevChannelUrls[i]);
      }

      const nextChannelNames = new Array<string>(16).fill("");
      const prevChannelNames = Array.isArray(existing?.channelNames) ? existing.channelNames : [];
      for (let i = 0; i < Math.min(prevChannelNames.length, 16); i += 1) {
        nextChannelNames[i] = liveText(prevChannelNames[i]);
      }

      const channelUrlsInput = body.channelUrls;
      if (Array.isArray(channelUrlsInput)) {
        for (let i = 0; i < Math.min(channelUrlsInput.length, 16); i += 1) {
          const url = liveText(channelUrlsInput[i]);
          if (url) nextChannelUrls[i] = url;
        }
      } else if (channelUrlsInput && typeof channelUrlsInput === "object") {
        for (const [k, v] of Object.entries(channelUrlsInput as Record<string, unknown>)) {
          const idxRaw = Number(k);
          if (!Number.isFinite(idxRaw)) continue;
          const index = Math.floor(idxRaw);
          if (index < 1 || index > 16) continue;
          const url = liveText(v);
          if (url) nextChannelUrls[index - 1] = url;
        }
      }

      const channelsInput = Array.isArray(body.channels) ? body.channels : [];
      for (const rowInput of channelsInput as any[]) {
        const index = Number(rowInput?.index ?? 0);
        if (!Number.isFinite(index)) continue;
        const idx = Math.floor(index);
        if (idx < 1 || idx > 16) continue;
        const label = liveText(rowInput?.label);
        const streamUrl = liveText(rowInput?.streamUrl ?? rowInput?.url);
        if (label) nextChannelNames[idx - 1] = label;
        if (streamUrl) nextChannelUrls[idx - 1] = streamUrl;
      }

      const streamUrl = liveText(body.streamUrl);
      if (streamUrl && !nextChannelUrls[0]) nextChannelUrls[0] = streamUrl;

      const trimmedUrls = [...nextChannelUrls];
      const trimmedNames = [...nextChannelNames];
      while (trimmedUrls.length > 0 && !liveText(trimmedUrls[trimmedUrls.length - 1]) && !liveText(trimmedNames[trimmedNames.length - 1])) {
        trimmedUrls.pop();
        trimmedNames.pop();
      }

      const next = {
        ...existing,
        id: cameraId,
        cameraId,
        tenantId: tenant,
        channelUrls: trimmedUrls,
        channelNames: trimmedNames,
        streamUrl: liveText(trimmedUrls[0] ?? existing?.streamUrl),
        updatedAt: now,
        lastSeenAt: String(existing?.lastSeenAt ?? now),
      };

      upsertCameraHealth(tenant, cameraId, next, now);

      const channels = Array.from({ length: Math.max(trimmedUrls.length, trimmedNames.length, 3) }, (_, idx) => {
        const index = idx + 1;
        const label = liveText(trimmedNames[idx]) || liveChannelLabelByIndex(index);
        const key = liveNormalizeChannelKey(label) || `channel-${index}`;
        const stream = liveText(trimmedUrls[idx]);
        return { index, key, label, streamUrl: stream || null };
      });

      return res.json({ stored: true, tenantId: tenant, cameraId, channels, updatedAt: now });
    } catch (e: any) {
      return res.status(500).json({ error: "Failed to save camera channels", message: e?.message ?? String(e) });
    }
  });
}
