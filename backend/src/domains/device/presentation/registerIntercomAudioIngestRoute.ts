import type { Express } from "express";

interface RegisterIntercomAudioIngestRouteDeps {
  app: Express;
  db: any;
  requireApiKey: (req: any, res: any) => boolean;
  resolveCameraId: (req: any, body?: any) => string;
  toIsoTimestamp: (value: any) => string;
  maxCameraPcmChunkBytes: number;
  ensureRecordingPath: (tenantId: string, cameraId: string, recordedAtIso: string) => { filePath: string };
  fs: { appendFileSync: (path: string, data: Buffer) => void };
  cryptoRandom: () => string;
  upsertCameraHealth: (tenantId: string, cameraId: string, payload: any, atIso: string) => any;
}

export function registerIntercomAudioIngestRoute(deps: RegisterIntercomAudioIngestRouteDeps): void {
  const {
    app,
    db,
    requireApiKey,
    resolveCameraId,
    toIsoTimestamp,
    maxCameraPcmChunkBytes,
    ensureRecordingPath,
    fs,
    cryptoRandom,
    upsertCameraHealth,
  } = deps;

  app.post("/ingest/intercom-audio", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "").trim();
    const body = req.body ?? {};
    const cameraId = resolveCameraId(req, body);
    if (!cameraId) return res.status(400).json({ error: "cameraId/deviceId is required" });

    const pcmBase64 = String((body as any).pcm16leBase64 ?? "").trim();
    if (!pcmBase64) return res.status(400).json({ error: "pcm16leBase64 is required" });

    let pcm: Buffer;
    try {
      pcm = Buffer.from(pcmBase64, "base64");
    } catch {
      return res.status(400).json({ error: "pcm16leBase64 is invalid" });
    }
    if (!pcm.length) return res.status(400).json({ error: "Audio chunk is empty" });
    if (pcm.length > maxCameraPcmChunkBytes) {
      return res.status(413).json({ error: "Audio chunk too large", maxBytes: maxCameraPcmChunkBytes });
    }

    const sampleRate = Math.max(8_000, Math.min(48_000, Number((body as any).sampleRate ?? 16_000) || 16_000));
    const channels = Math.max(1, Math.min(2, Number((body as any).channels ?? 1) || 1));
    const recordedAt = toIsoTimestamp((body as any).recordedAt ?? (body as any).recordedAtMs ?? Date.now());
    const receivedAt = new Date().toISOString();

    try {
      const recordingPath = ensureRecordingPath(tenant, cameraId, recordedAt);
      fs.appendFileSync(recordingPath.filePath, pcm);

      const chunkId = cryptoRandom();
      db.prepare(
        "INSERT INTO camera_audio_chunks (id, tenant_id, camera_id, recorded_at, sample_rate, channels, bytes, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(chunkId, tenant, cameraId, recordedAt, sampleRate, channels, pcm.length, recordingPath.filePath, receivedAt);

      let existingHealth: any = {};
      try {
        const row = db.prepare("SELECT data FROM camera_health WHERE tenant_id = ? AND camera_id = ?").get(tenant, cameraId);
        existingHealth = row?.data ? JSON.parse(String(row.data)) : {};
      } catch {
        existingHealth = {};
      }

      const audioChunks = Number(existingHealth?.audioChunks ?? 0) + 1;
      const audioBytes = Number(existingHealth?.audioBytes ?? 0) + pcm.length;
      upsertCameraHealth(
        tenant,
        cameraId,
        {
          ...existingHealth,
          cameraId,
          id: cameraId,
          tenantId: tenant,
          transport: "intercom",
          sampleRate,
          channels,
          audioChunks,
          audioBytes,
          lastAudioAt: recordedAt,
          receivedAt,
        },
        receivedAt
      );

      res.status(202).json({
        accepted: true,
        id: chunkId,
        tenantId: tenant,
        cameraId,
        bytes: pcm.length,
        sampleRate,
        channels,
        recordedAt,
        receivedAt,
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to ingest intercom audio", message: e?.message ?? String(e) });
    }
  });
}
