import type { Express, Request, Response } from "express";
import path from "path";
import {
  MITAC_SOFTWARE_CONTENT_TYPE,
  MITAC_SOFTWARE_R2_KEY,
  mitacSoftwareDownloadHeaders,
  resolveMitacSoftwareLocalPath
} from "../../../shared/mitacSoftwareDownload";
import {
  completeDeviceDecommission,
  deleteTraccarDeviceByImei,
  purgeOperationalDeviceTraces,
  type TraccarFetchFn
} from "../../../shared/deviceDecommission";

interface RegisterDeviceOpsRoutesDeps {
  app: Express;
  db: any;
  fs: any;
  requireApiKey: (req: Request, res: Response) => boolean;
  getBaseArtifact: (tenant: string, type: "firmware" | "config") => any;
  b2Client: any;
  b2Bucket: string;
  getObjectCommandCtor: any;
  isReadableStream: (value: any) => boolean;
  deviceServerDomain: string;
  deviceServerPort: string;
  deviceServerProtocol: string;
  deviceServerApiKey: string;
  traccarBaseUrl: () => string;
  traccarUsername: () => string;
  traccarPassword: () => string;
  traccarToken: () => string;
  traccarKickCommand: () => string;
  enqueueTraccarKickCommandJob: (args: { tenantId: string; imei: string; commandText: string }) => { queued: true; jobId: string; queuedAt: string };
  triggerTraccarOutboxDrain: () => void;
  getTraccarOutboxDiagnostics: (tenantId: string) => {
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
  traccarFetch: TraccarFetchFn;
  readAssetById: (tenant: string, id: string, rawTenant?: string) => Record<string, unknown> | null;
  findExistingAssetIdByImei: (tenant: string, imei: string) => string;
  upsertAsset: (tenant: string, id: string, payload: Record<string, unknown>) => Record<string, unknown>;
  readTenant: (req: Request) => { raw: string; tenant: string };
  invalidateAssetsCache: (tenant: string, raw?: string) => Promise<void>;
}

export function registerDeviceOpsRoutes(deps: RegisterDeviceOpsRoutesDeps): void {
  const {
    app,
    db,
    fs,
    requireApiKey,
    getBaseArtifact,
    b2Client,
    b2Bucket,
    getObjectCommandCtor,
    isReadableStream,
    deviceServerDomain,
    deviceServerPort,
    deviceServerProtocol,
    deviceServerApiKey,
    traccarBaseUrl,
    traccarUsername,
    traccarPassword,
    traccarToken,
    traccarKickCommand,
    enqueueTraccarKickCommandJob,
    triggerTraccarOutboxDrain,
    getTraccarOutboxDiagnostics,
    traccarFetch,
    readAssetById,
    findExistingAssetIdByImei,
    upsertAsset,
    readTenant,
    invalidateAssetsCache,
  } = deps;

  app.get("/downloads/mitac-software", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const localPath = resolveMitacSoftwareLocalPath(process.cwd());
    const headers = mitacSoftwareDownloadHeaders();

    const streamLocal = () => {
      if (!localPath || !fs.existsSync(localPath)) {
        return res.status(404).json({ error: "Mitac software package not found" });
      }
      res.set(headers);
      const stream = fs.createReadStream(localPath);
      stream.on("error", () => {
        if (!res.headersSent) res.status(500).json({ error: "Download stream failed" });
        else res.end();
      });
      stream.pipe(res);
    };

    if (!b2Client) {
      streamLocal();
      return;
    }

    b2Client
      .send(new getObjectCommandCtor({ Bucket: b2Bucket, Key: MITAC_SOFTWARE_R2_KEY }))
      .then((result: any) => {
        if (!result?.Body) {
          streamLocal();
          return;
        }
        res.set({
          ...headers,
          ...(result.ContentLength ? { "content-length": String(result.ContentLength) } : {})
        });
        if (isReadableStream(result.Body)) {
          result.Body.on("error", () => {
            if (!res.headersSent) res.status(500).json({ error: "Download stream failed" });
            else res.end();
          });
          result.Body.pipe(res);
        } else {
          res.send(result.Body as any);
        }
      })
      .catch(() => streamLocal());
  });

  app.post("/admin/mitac-software", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const contentBase64 = String((req.body as any)?.contentBase64 ?? "").trim();
    if (!contentBase64) return res.status(400).json({ error: "contentBase64 is required." });
    const bytes = Buffer.from(contentBase64, "base64");
    if (!bytes.length) return res.status(400).json({ error: "contentBase64 is invalid." });

    const localPath = resolveMitacSoftwareLocalPath(process.cwd());
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, bytes);

    res.json({
      stored: true,
      storage: "local",
      path: localPath,
      bytes: bytes.length,
      downloadUrl: "/downloads/mitac-software"
    });
  });

  app.get("/device/artifacts", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const type = String(req.query.type ?? "").trim().toLowerCase();
    if (type !== "firmware" && type !== "config") return res.status(400).json({ error: "type must be firmware or config" });
    const artifact = getBaseArtifact(tenant, type);
    if (!artifact) return res.json({ artifact: null, tenantId: tenant, type });
    res.json({ artifact: { id: artifact.id, name: artifact.name, version: artifact.version, sha256: artifact.sha256, downloadUrl: `/device/artifacts/${artifact.id}` }, tenantId: tenant, type });
  });

  app.get("/device/artifacts/:id", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const id = String(req.params.id ?? "").trim();
    const row = db.prepare("SELECT r2_key, content_type FROM device_artifacts WHERE tenant_id = ? AND id = ?").get(tenant, id);
    if (!row) return res.status(404).json({ error: "Not found" });
    const ref = String((row as any).r2_key ?? "");
    res.setHeader("content-type", (row as any).content_type ?? "application/octet-stream");

    if (b2Client && ref && !fs.existsSync(ref)) {
      const key = ref;
      b2Client
        .send(new getObjectCommandCtor({ Bucket: b2Bucket, Key: key }))
        .then((result: any) => {
          if (!result?.Body) return res.status(404).json({ error: "Not found" });
          if (isReadableStream(result.Body)) {
            result.Body.pipe(res);
          } else {
            res.send(result.Body as any);
          }
        })
        .catch(() => res.status(404).json({ error: "Not found" }));
      return;
    }

    if (!ref || !fs.existsSync(ref)) return res.status(404).json({ error: "Not found" });
    fs.createReadStream(ref).pipe(res);
  });

  app.get("/device/:deviceId", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    if (!deviceServerDomain || !deviceServerPort) return res.status(503).json({ error: "Device server not configured" });
    const deviceId = String(req.params.deviceId ?? "");
    const url = `${deviceServerProtocol}://${deviceServerDomain}:${deviceServerPort}/devices/${encodeURIComponent(deviceId)}`;
    try {
      const fetchFn = (globalThis as any).fetch;
      if (!fetchFn) return res.status(500).json({ error: "fetch not available in runtime" });
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (deviceServerApiKey) headers["x-api-key"] = deviceServerApiKey;
      const resp = await fetchFn(url, { method: "GET", headers });
      const text = await resp.text();
      res.status(resp.status).set(Object.fromEntries(resp.headers.entries ? resp.headers.entries() : [])).send(text);
    } catch (err: any) {
      res.status(502).json({ error: "Device proxy failed", message: err?.message ?? String(err) });
    }
  });

  app.post("/device/:deviceId/command", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    if (!deviceServerDomain || !deviceServerPort) return res.status(503).json({ error: "Device server not configured" });
    const deviceId = String(req.params.deviceId ?? "");
    const url = `${deviceServerProtocol}://${deviceServerDomain}:${deviceServerPort}/devices/${encodeURIComponent(deviceId)}/command`;
    try {
      const fetchFn = (globalThis as any).fetch;
      if (!fetchFn) return res.status(500).json({ error: "fetch not available in runtime" });
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (deviceServerApiKey) headers["x-api-key"] = deviceServerApiKey;
      const resp = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(req.body ?? {}) });
      const text = await resp.text();
      res.status(resp.status).set(Object.fromEntries(resp.headers.entries ? resp.headers.entries() : [])).send(text);
    } catch (err: any) {
      res.status(502).json({ error: "Device proxy failed", message: err?.message ?? String(err) });
    }
  });

  app.post("/device/decommission", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req);
    const body = req.body ?? {};
    const requestedAssetId = String((body as any).assetId ?? (body as any).id ?? "").trim();
    const requestedImei = String((body as any).imei ?? "").trim();
    if (!requestedAssetId && !requestedImei) {
      return res.status(400).json({ error: "assetId or imei is required." });
    }

    let assetId = requestedAssetId;
    if (!assetId && requestedImei) {
      assetId = findExistingAssetIdByImei(tenant, requestedImei);
    }
    let asset = assetId ? readAssetById(tenant, assetId, raw) : null;
    if (!asset && requestedImei) {
      const fallbackId = findExistingAssetIdByImei(tenant, requestedImei);
      if (fallbackId) {
        assetId = fallbackId;
        asset = readAssetById(tenant, assetId, raw);
      }
    }
    if (!asset || !assetId) {
      return res.status(404).json({ decommissioned: false, error: "Asset not found for decommission." });
    }

    const imei = requestedImei || String((asset as any).imei ?? "").trim();
    if (!imei) {
      return res.status(400).json({ decommissioned: false, error: "This asset has no IMEI to decommission." });
    }

    try {
      const completed = await completeDeviceDecommission({
        asset: asset as Record<string, unknown>,
        assetId,
        imei,
        removeTraccarDevice: async (needle) => {
          if (!traccarBaseUrl()) {
            return { removed: false, skipped: true as const, error: "Traccar not configured" };
          }
          return deleteTraccarDeviceByImei(traccarFetch, needle);
        },
        purgeOperationalTraces: async (needle, assetKey, cameraSerial) =>
          purgeOperationalDeviceTraces(db, tenant, needle, assetKey, cameraSerial ? [cameraSerial] : []),
        persistDecommissionedAsset: async (assetKey, nextAsset) => {
          const saved = upsertAsset(tenant, assetKey, nextAsset);
          await invalidateAssetsCache(tenant, raw);
          return saved as Record<string, unknown>;
        }
      });

      res.json({
        decommissioned: true,
        tenantId: tenant,
        asset: completed.asset,
        traccar: completed.traccar,
        purged: completed.purged
      });
    } catch (err: any) {
      res.status(500).json({
        decommissioned: false,
        error: String(err?.message ?? err ?? "Device decommission failed.")
      });
    }
  });

  app.post("/device/kick-avl", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    if (!traccarBaseUrl()) return res.status(503).json({ error: "Traccar not configured", hint: "Set TRACCAR_BASE_URL (+ auth)" });
    if (!traccarToken() && !(traccarUsername() && traccarPassword())) {
      return res.status(503).json({ error: "Traccar auth not configured", hint: "Set TRACCAR_TOKEN or TRACCAR_USERNAME/TRACCAR_PASSWORD" });
    }

    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const imei = String((req.body as any)?.imei ?? (req.body as any)?.uniqueId ?? "").trim();
    const commandText = String((req.body as any)?.command ?? traccarKickCommand()).trim() || traccarKickCommand();
    if (!imei) return res.status(400).json({ error: "imei is required" });

    const job = enqueueTraccarKickCommandJob({ tenantId: tenant, imei, commandText });
    triggerTraccarOutboxDrain();
    res.json({
      queued: true,
      tenantId: tenant,
      imei,
      command: commandText,
      jobId: job.jobId,
      queuedAt: job.queuedAt,
      status: "queued"
    });
  });

  app.get("/device/kick-avl/jobs/:jobId", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const jobId = String(req.params.jobId ?? "").trim();
    if (!jobId) return res.status(400).json({ error: "jobId is required" });

    const row = db.prepare(
      "SELECT id, tenant_id, job_type, status, payload, attempts, available_at, created_at, updated_at, processed_at, last_error FROM traccar_outbox WHERE tenant_id = ? AND id = ?"
    ).get(tenant, jobId);
    if (!row) return res.status(404).json({ error: "Not found" });

    let payload: any = null;
    try {
      payload = JSON.parse(String((row as any).payload ?? "null"));
    } catch {
      payload = null;
    }

    res.json({
      id: (row as any).id,
      tenantId: String((row as any).tenant_id ?? ""),
      jobType: String((row as any).job_type ?? ""),
      status: String((row as any).status ?? ""),
      attempts: Number((row as any).attempts ?? 0),
      availableAt: String((row as any).available_at ?? ""),
      createdAt: String((row as any).created_at ?? ""),
      updatedAt: String((row as any).updated_at ?? ""),
      processedAt: String((row as any).processed_at ?? ""),
      lastError: String((row as any).last_error ?? ""),
      payload,
    });
  });

  app.get("/device/traccar-outbox", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    res.json(getTraccarOutboxDiagnostics(tenant));
  });

  app.post("/device/traccar-outbox/drain", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    triggerTraccarOutboxDrain();
    res.json({ ok: true, tenantId: tenant, triggered: true, at: new Date().toISOString() });
  });
}
