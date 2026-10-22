import type { Express, Request } from "express";
import { rememberAdminSessionToken } from "../../shared/api-key";

interface RegisterAuthRoutesDeps {
  app: Express;
  db: any;
  adminEmail: string;
  adminTokenTtlHours: number;
  verifyAdminPassword: (plain: string) => boolean;
  randomHex: (bytes: number) => string;
  readTenant: (req: Request) => { raw: string; tenant: string };
  valkeySet?: (key: string, value: string, ttlSec?: number) => Promise<void>;
}

const adminSessionCacheKey = (token: string) => `vivi:auth:admin-session:${String(token ?? "").trim()}`;

export function registerAuthRoutes(deps: RegisterAuthRoutesDeps): void {
  const {
    app,
    db,
    adminEmail,
    adminTokenTtlHours,
    verifyAdminPassword,
    randomHex,
    readTenant,
    valkeySet,
  } = deps;

  app.post("/auth/login", async (req, res) => {
    const body = req.body ?? {};
    const email = String((body as any).email ?? "").trim().toLowerCase();
    const password = String((body as any).password ?? "");

    if (!adminEmail) return res.status(503).json({ error: "Admin login is not configured." });
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });
    if (email !== adminEmail) return res.status(401).json({ error: "Invalid credentials" });
    if (!verifyAdminPassword(password)) return res.status(401).json({ error: "Invalid credentials" });

    const token = randomHex(32);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + adminTokenTtlHours * 60 * 60 * 1000).toISOString();
    try {
      db.prepare("INSERT OR REPLACE INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)").run(
        token,
        now.toISOString(),
        expiresAt
      );
      rememberAdminSessionToken(token, expiresAt);
    } catch {
      // ignore
    }
    if (valkeySet) {
      const ttlSeconds = Math.max(5, Math.floor((Date.parse(expiresAt) - now.getTime()) / 1000));
      try {
        await valkeySet(
          adminSessionCacheKey(token),
          JSON.stringify({ token, createdAt: now.toISOString(), expiresAt }),
          ttlSeconds
        );
      } catch {
        // ignore cache write failures
      }
    }
    res.json({ ok: true, token, expiresAt });
  });

  app.post("/auth/forgot-password", (req, res) => {
    try {
      const body = req.body ?? {};
      const email = String((body as any).email ?? "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "email is required" });
      const { raw, tenant } = readTenant(req as Request);
      const tenantId = tenant || raw || "";
      const createdAt = new Date().toISOString();
      const id = randomHex(16);
      const ip = String(req.header("cf-connecting-ip") ?? req.header("x-forwarded-for") ?? req.ip ?? "");
      const userAgent = String(req.header("user-agent") ?? "");
      try {
        db.prepare(
          "INSERT OR REPLACE INTO password_reset_requests (id, email, tenant_id, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(id, email, tenantId, ip, userAgent, createdAt);
      } catch {
        // ignore
      }
      return res.json({ ok: true, message: "If an account exists for this email, reset instructions will be sent." });
    } catch {
      return res.status(400).json({ error: "Invalid JSON body." });
    }
  });
}
