import type { Express } from "express";

interface RegisterDeviceArtifactAdminRouteDeps {
  app: Express;
  db: any;
  requireApiKey: (req: any, res: any) => boolean;
  cryptoRandom: () => string;
  sha256Hex: (input: Buffer) => string;
  b2Client: any;
  b2Bucket: string;
  deviceArtifactsDir: string;
  path: { join: (...parts: string[]) => string };
  fs: { mkdirSync: (path: string, opts?: any) => void; writeFileSync: (path: string, data: Buffer) => void };
  createPutObjectCommand: (input: any) => any;
}

export function registerDeviceArtifactAdminRoute(deps: RegisterDeviceArtifactAdminRouteDeps): void {
  const {
    app,
    db,
    requireApiKey,
    cryptoRandom,
    sha256Hex,
    b2Client,
    b2Bucket,
    deviceArtifactsDir,
    path,
    fs,
    createPutObjectCommand,
  } = deps;

  app.post("/admin/device-artifacts", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const type = String(body.type ?? "").trim().toLowerCase();
    if (type !== "firmware" && type !== "config") return res.status(400).json({ error: "type must be firmware or config" });
    const name = String(body.name ?? "").trim();
    const version = String(body.version ?? "").trim();
    const contentBase64 = String(body.contentBase64 ?? "").trim();
    const contentType = String(body.contentType ?? "application/octet-stream").trim();
    const isBase = Boolean(body.isBase ?? true);
    if (!name || !version || !contentBase64) return res.status(400).json({ error: "name, version, and contentBase64 are required." });

    const id = cryptoRandom();
    const bytes = Buffer.from(contentBase64, "base64");
    if (!bytes.length) return res.status(400).json({ error: "contentBase64 is invalid." });
    const hash = sha256Hex(bytes);

    const storageKey = `${tenant || "default"}/${type}/${id}`;
    let storageRef = "";

    if (b2Client) {
      try {
        const put = createPutObjectCommand({
          Bucket: b2Bucket,
          Key: storageKey,
          Body: bytes,
          ContentType: contentType,
          Metadata: { sha256: hash, type }
        });
        await b2Client.send(put);
        storageRef = storageKey;
      } catch {
        // fall back to local storage if B2 fails
        storageRef = "";
      }
    }

    if (!storageRef) {
      const tenantDir = path.join(deviceArtifactsDir, tenant || "default", type);
      fs.mkdirSync(tenantDir, { recursive: true });
      const filePath = path.join(tenantDir, id);
      fs.writeFileSync(filePath, bytes);
      storageRef = filePath;
    }

    const now = new Date().toISOString();
    const stmt = db.prepare("INSERT INTO device_artifacts (id, tenant_id, type, name, version, r2_key, content_type, sha256, is_base, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    stmt.run(id, tenant, type, name, version, storageRef, contentType, hash, isBase ? 1 : 0, now);

    res.json({ stored: true, id, tenantId: tenant, type, sha256: hash, isBase, storage: b2Client ? "b2" : "local" });
  });
}
