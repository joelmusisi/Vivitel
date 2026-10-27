import type { Express, Request, Response } from "express";
import {
  deleteUserAlertRule,
  readUserAlertRules,
  upsertUserAlertRule
} from "../../../shared/userAlertRulesStorage";
import {
  readInfoHubStreamMonitor,
  upsertInfoHubSiteStreamMonitor,
  type InfoHubSiteStreamMonitor
} from "../../../shared/infoHubStreamMonitor";
import { resolveUserIdFromAuthToken } from "../../../shared/userSessionResolve";

interface RegisterAlertRoutesDeps {
  app: Express;
  requireApiKey: (req: Request, res: Response) => boolean;
  getTenantId: (req: Request) => string;
  readAuthToken: (req: Request) => string;
  generateId: () => string;
  cache: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  };
  /** Long-lived TTL for user-owned alert rules (defaults to 10 years). */
  persistentTtlSeconds?: number;
}

async function resolveAlertRuleUserId(
  deps: RegisterAlertRoutesDeps,
  req: Request
): Promise<string | null> {
  const token = deps.readAuthToken(req);
  return resolveUserIdFromAuthToken(deps.cache.get, token);
}

export function registerAlertRoutes(deps: RegisterAlertRoutesDeps): void {
  const { app, getTenantId, generateId, cache, persistentTtlSeconds = 10 * 365 * 24 * 3600 } = deps;
  const alertRulesKv = {
    get: (key: string) => cache.get(key),
    set: async (key: string, value: string) => {
      await cache.set(key, value, persistentTtlSeconds);
    }
  };
  const streamKv = {
    get: (key: string) => cache.get(key),
    put: async (key: string, value: string) => {
      await cache.set(key, value, persistentTtlSeconds);
    }
  };

  app.get("/d1/alerts", async (req, res) => {
    const tenantId = getTenantId(req);
    const userId = await resolveAlertRuleUserId(deps, req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const alerts = await readUserAlertRules(alertRulesKv, tenantId, userId);
      res.json({ alerts, tenantId, userId });
    } catch {
      res.json({ alerts: [], tenantId, userId });
    }
  });

  app.post("/d1/alerts", async (req, res) => {
    const tenantId = getTenantId(req);
    const userId = await resolveAlertRuleUserId(deps, req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const result = await upsertUserAlertRule(alertRulesKv, tenantId, userId, body, generateId);
      if (!result.ok) {
        res.status(400).json({ stored: false, error: result.message });
        return;
      }
      res.json({ stored: true, id: result.id, tenantId, userId });
    } catch (e: any) {
      res.status(500).json({ stored: false, error: e?.message ?? String(e) });
    }
  });

  app.delete("/d1/alerts", async (req, res) => {
    const tenantId = getTenantId(req);
    const userId = await resolveAlertRuleUserId(deps, req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const id = String(req.query.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }

    try {
      const deleted = await deleteUserAlertRule(alertRulesKv, tenantId, userId, id);
      res.json({ deleted, id, tenantId, userId });
    } catch {
      res.json({ deleted: false, id, tenantId, userId });
    }
  });

  app.get("/d1/infohub-streams", async (req, res) => {
    const tenantId = getTenantId(req);
    const userId = await resolveAlertRuleUserId(deps, req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const site = String(req.query.site ?? "").trim();
      const monitor = await readInfoHubStreamMonitor(streamKv, tenantId, userId);
      if (site) {
        const token = site.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "_none";
        res.json({
          site,
          siteMonitor: monitor.bySite?.[token] ?? null,
          monitor,
          tenantId,
          userId
        });
        return;
      }
      res.json({ monitor, tenantId, userId });
    } catch {
      res.json({ monitor: { bySite: {} }, tenantId, userId });
    }
  });

  app.post("/d1/infohub-streams", async (req, res) => {
    const tenantId = getTenantId(req);
    const userId = await resolveAlertRuleUserId(deps, req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const site = String(body.site ?? "").trim();
    if (!site) {
      res.status(400).json({ stored: false, error: "site is required" });
      return;
    }
    try {
      const siteMonitor = (body.siteMonitor ?? body) as InfoHubSiteStreamMonitor;
      const monitor = await upsertInfoHubSiteStreamMonitor(streamKv, tenantId, userId, site, {
        customStreams: Array.isArray(siteMonitor.customStreams) ? siteMonitor.customStreams : [],
        preferences:
          siteMonitor.preferences && typeof siteMonitor.preferences === "object"
            ? siteMonitor.preferences
            : {},
        monitoredTypes: Array.isArray(siteMonitor.monitoredTypes)
          ? siteMonitor.monitoredTypes.map((item) => String(item ?? "").trim()).filter(Boolean)
          : [],
        monitoredLabels: Array.isArray(siteMonitor.monitoredLabels)
          ? siteMonitor.monitoredLabels.map((item) => String(item ?? "").trim()).filter(Boolean)
          : []
      });
      res.json({ stored: true, monitor, tenantId, userId, site });
    } catch (e: any) {
      res.status(500).json({ stored: false, error: e?.message ?? String(e) });
    }
  });
}
