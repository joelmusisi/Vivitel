import type { Express } from "express";
import type { createReportArchiveService } from "../../shared/reportArchiveService";

type ReportArchiveService = ReturnType<typeof createReportArchiveService>;

export function registerReportArchiveRoutes(deps: {
  app: Express;
  requireApiKey: (req: any, res: any) => boolean;
  readTenant: (req: any) => { raw: string; tenant: string };
  reportArchives: ReportArchiveService;
}): void {
  const { app, requireApiKey, readTenant, reportArchives } = deps;

  app.get("/reports/archive", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { tenant } = readTenant(req);
    const tenantId = tenant || String(req.header("x-tenant-id") ?? "").trim();
    if (!tenantId) return res.status(400).json({ error: "Tenant is required." });
    const requestedLimit = Number(req.query.limit ?? 50);
    const requestedOffset = Number(req.query.offset ?? 0);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
      return res.status(400).json({ error: "limit must be an integer from 1 to 100." });
    }
    if (!Number.isInteger(requestedOffset) || requestedOffset < 0) {
      return res.status(400).json({ error: "offset must be a non-negative integer." });
    }

    try {
      const result = reportArchives.listReportArchives({
        tenantId,
        site: String(req.query.site ?? ""),
        limit: requestedLimit,
        offset: requestedOffset
      });
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message ?? "Failed to list report archives." });
    }
  });

  app.post("/reports/archive", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { tenant } = readTenant(req);
    const tenantId = tenant || String(req.header("x-tenant-id") ?? "").trim();
    if (!tenantId) return res.status(400).json({ error: "Tenant is required." });

    const body = req.body ?? {};
    const site = String(body.site ?? "").trim();
    const title = String(body.title ?? "").trim();
    const reportId = String(body.reportId ?? "").trim();
    const createdAt = String(body.createdAt ?? "").trim();
    const payload = body.payload ?? body;

    try {
      const saved = await reportArchives.saveReportArchive({
        tenantId,
        site,
        title,
        reportId: reportId || undefined,
        createdAt: createdAt || undefined,
        payload
      });
      return res.json({
        ok: true,
        stored: true,
        reportId: saved.reportId,
        storageKey: saved.storageKey,
        storage: saved.storage,
        hotDays: reportArchives.hotDays
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message ?? "Failed to archive report." });
    }
  });

  app.get("/reports/archive/:reportId", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { tenant } = readTenant(req);
    const tenantId = tenant || String(req.header("x-tenant-id") ?? "").trim();
    if (!tenantId) return res.status(400).json({ error: "Tenant is required." });
    const reportId = String(req.params.reportId ?? "").trim();
    if (!reportId) return res.status(400).json({ error: "reportId is required." });

    try {
      const result = await reportArchives.readReportArchive(tenantId, reportId);
      if (!result) return res.status(404).json({ error: "Report archive not found." });
      return res.json({
        ok: true,
        reportId: result.row.report_id,
        tenantId: result.row.tenant_id,
        site: result.row.site,
        title: result.row.title,
        createdAt: result.row.created_at,
        storage: result.row.storage,
        storageKey: result.row.storage_key,
        payload: result.payload
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message ?? "Failed to read report archive." });
    }
  });
}
