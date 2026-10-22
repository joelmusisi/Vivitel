import type { Express, Request, Response } from "express";
import { handleCmsv6Request, resolveLiveStreamFromCmsv6 } from "../../../shared/cmsv6/handleRequest";

type Cmsv6Kv = {
  get: (key: string) => Promise<string | null | undefined>;
  set: (key: string, value: string) => Promise<void>;
};

interface RegisterCmsv6RoutesDeps {
  app: Express;
  db?: any;
  requireApiKey: (req: any, res: any) => boolean;
  readTenant: (req: any) => { raw: string; tenant: string };
  valkeyGet: (key: string) => Promise<string | null>;
  valkeySet: (key: string, value: string, ttlSec?: number) => Promise<void>;
}

function readSite(req: Request) {
  return String(
    req.header("x-site-name")
    ?? req.query.site
    ?? (req.body as any)?.site
    ?? ""
  ).trim();
}

function queryRecord(req: Request) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (Array.isArray(value)) out[key] = String(value[0] ?? "");
    else if (value != null) out[key] = String(value);
  }
  return out;
}

export function registerCmsv6Routes(deps: RegisterCmsv6RoutesDeps): void {
  const { app, db, requireApiKey, readTenant, valkeyGet, valkeySet } = deps;
  const kv: Cmsv6Kv = {
    get: async (key) => {
      const cached = await valkeyGet(key);
      if (cached) return cached;
      if (!db) return null;
      try {
        const row = db.prepare("SELECT data FROM kv_store WHERE k = ? ORDER BY updated_at DESC LIMIT 1").get(key) as { data?: string } | undefined;
        return String(row?.data ?? "") || null;
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      try {
        await valkeySet(key, value, 60 * 60 * 24 * 400);
      } catch {
        // sqlite is the durable store
      }
      if (!db) return;
      try {
        db.prepare("INSERT OR REPLACE INTO kv_store (k, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)").run(
          key,
          "cmsv6",
          value,
          new Date().toISOString()
        );
      } catch {
        // ignore
      }
    }
  };

  app.all(/^\/cmsv6(\/.*)?$/, async (req: Request, res: Response) => {
    if (!requireApiKey(req, res)) return;
    const { tenant } = readTenant(req as any);
    const pathname = String(req.path || "/cmsv6").replace(/\/+$/, "") || "/cmsv6";
    const result = await handleCmsv6Request({
      method: req.method,
      pathname,
      query: queryRecord(req),
      body: (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>,
      tenantId: String(tenant || "default").trim() || "default",
      site: readSite(req),
      actor: {
        userId: String(req.header("x-vivi-user-id") ?? "").trim() || undefined,
        email: String(req.header("x-vivi-user-email") ?? "").trim() || undefined,
        name: String(req.header("x-vivi-user-name") ?? "").trim() || undefined
      },
      kv
    });
    return res.status(result.status).json(result.body);
  });
}

export { resolveLiveStreamFromCmsv6 };
