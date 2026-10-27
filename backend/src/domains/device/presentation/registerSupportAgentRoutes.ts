import type { Express, Request, Response } from "express";

type SupportAgentCategory =
  | "Sales"
  | "Technical Support Telematics"
  | "Support Vide Telematics"
  | "Admins"
  | "Support Deliver"
  | "Support Maintenace";

const supportAgentCategories: SupportAgentCategory[] = [
  "Sales",
  "Technical Support Telematics",
  "Support Vide Telematics",
  "Admins",
  "Support Deliver",
  "Support Maintenace"
];

type SupportDeskAgent = {
  id: string;
  name: string;
  email?: string;
  category: string;
};

interface RegisterSupportAgentRoutesDeps {
  app: Express;
  db: any;
  requireApiKey: (req: Request, res: Response) => boolean;
  supportAgentSeedJson: string;
  listSupportDeskAgents?: () => SupportDeskAgent[];
}

function normalizeSupportAgentCategory(input: any): SupportAgentCategory {
  const raw = String(input ?? "").trim();
  if (!raw) return "Technical Support Telematics";
  const lower = raw.toLowerCase();
  if (lower === "support video telematics") return "Support Vide Telematics";
  if (lower === "support vide telematics") return "Support Vide Telematics";
  if (lower === "support maintenance") return "Support Maintenace";
  if (lower === "support maintenace") return "Support Maintenace";
  if (lower === "admins" || lower === "admin") return "Admins";
  const exact = supportAgentCategories.find((c) => c.toLowerCase() === lower);
  return exact ?? "Technical Support Telematics";
}

function toSupportAgentId(name: string) {
  return (
    "AG-" +
    String(name || "agent")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .slice(0, 48) +
    "-" +
    Date.now().toString(36)
  );
}

export function registerSupportAgentRoutes(deps: RegisterSupportAgentRoutesDeps): void {
  const { app, db, requireApiKey, supportAgentSeedJson, listSupportDeskAgents } = deps;

  const readSupportAgents = (tenant: string): any[] => {
    const stmt = db.prepare("SELECT data FROM support_agents WHERE tenant_id = ? ORDER BY updated_at DESC");
    const rows = stmt.all(tenant);
    const agents: any[] = [];
    for (const r of rows as any[]) {
      try {
        agents.push(JSON.parse(String((r as any).data ?? "{}")));
      } catch {
        // ignore invalid rows
      }
    }
    return agents;
  };

  const upsertSupportAgent = (tenant: string, id: string, data: any) => {
    const now = new Date().toISOString();
    const stmt = db.prepare("INSERT OR REPLACE INTO support_agents (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)");
    stmt.run(id, tenant, JSON.stringify(data ?? {}), now);
  };

  const seedSupportAgentsIfConfigured = (tenant: string) => {
    if (readSupportAgents(tenant).length) return;
    const raw = String(supportAgentSeedJson ?? "").trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.agents) ? parsed.agents : [];
      for (const a of list) {
        const name = String((a as any)?.name ?? "").trim();
        if (!name) continue;
        const id = String((a as any)?.id ?? "").trim() || toSupportAgentId(name);
        const category = normalizeSupportAgentCategory((a as any)?.category);
        upsertSupportAgent(tenant, id, { id, name, category, forcedStatus: "", lastSeenAt: "" });
      }
    } catch {
      // ignore invalid seed
    }
  };

  const mergeRbacSupportAgents = (tenant: string, stored: any[]) => {
    const byId = new Map<string, any>();
    for (const agent of stored) {
      const id = String(agent?.id ?? "").trim();
      if (!id) continue;
      byId.set(id, agent);
    }
    const rbacAgents = typeof listSupportDeskAgents === "function" ? listSupportDeskAgents() : [];
    for (const agent of rbacAgents) {
      const id = String(agent?.id ?? "").trim();
      const name = String(agent?.name ?? "").trim();
      if (!id || !name) continue;
      const category = normalizeSupportAgentCategory(agent.category);
      const existing = byId.get(id);
      const rec = {
        ...(existing ?? {}),
        id,
        name,
        email: String(agent.email ?? existing?.email ?? "").trim(),
        category,
        forcedStatus: String(existing?.forcedStatus ?? "") || "",
        lastSeenAt: String(existing?.lastSeenAt ?? "") || "",
        source: "rbac"
      };
      byId.set(id, rec);
      // Persist so heartbeats and status updates keep working for RBAC agents.
      upsertSupportAgent(tenant, id, rec);
    }
    return Array.from(byId.values());
  };

  app.get("/support/agents", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    seedSupportAgentsIfConfigured(tenant);
    const presenceWindowSec = Math.max(15, Math.min(600, Number(req.query.windowSec ?? 90) || 90));
    const now = Date.now();

    const agents = mergeRbacSupportAgents(tenant, readSupportAgents(tenant));
    const categories: Record<string, any[]> = {};
    for (const c of supportAgentCategories) categories[c] = [];

    for (const agent of agents) {
      const id = String(agent?.id ?? "").trim();
      const name = String(agent?.name ?? "").trim();
      if (!id || !name) continue;
      const category = normalizeSupportAgentCategory(agent?.category);
      const lastSeenAt = String(agent?.lastSeenAt ?? "");
      const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
      const staleSec = Number.isFinite(lastSeenMs) ? (now - lastSeenMs) / 1000 : Number.POSITIVE_INFINITY;
      const forced = String(agent?.forcedStatus ?? "").toLowerCase();
      const online = forced === "online" ? true : forced === "offline" ? false : staleSec <= presenceWindowSec;
      categories[category].push({ id, name, category, online, lastSeenAt: lastSeenAt || undefined });
    }

    for (const c of supportAgentCategories) {
      categories[c].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
    }

    res.json({ categories, at: new Date().toISOString(), windowSec: presenceWindowSec });
  });

  app.post("/support/agents", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const name = String((body as any).name ?? "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    const id = String((body as any).id ?? "").trim() || toSupportAgentId(name);
    const category = normalizeSupportAgentCategory((body as any).category);
    const existing = readSupportAgents(tenant).find((a: any) => String(a.id) === id);
    const rec = {
      ...(existing ?? {}),
      id,
      name,
      category,
      forcedStatus: String((body as any).forcedStatus ?? existing?.forcedStatus ?? "") || "",
      lastSeenAt: String(existing?.lastSeenAt ?? "")
    };
    upsertSupportAgent(tenant, id, rec);
    res.status(existing ? 200 : 201).json({ stored: true, agent: rec });
  });

  app.post("/support/agents/:id/heartbeat", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });
    const agents = mergeRbacSupportAgents(tenant, readSupportAgents(tenant));
    let existing = agents.find((a: any) => String(a.id) === id);
    if (!existing) {
      // Auto-register heartbeat callers that have Admin / Own Support access.
      const rbacMatch =
        typeof listSupportDeskAgents === "function"
          ? listSupportDeskAgents().find((agent) => String(agent.id) === id)
          : undefined;
      if (!rbacMatch) return res.status(404).json({ error: "Not found" });
      existing = {
        id: rbacMatch.id,
        name: rbacMatch.name,
        email: rbacMatch.email ?? "",
        category: normalizeSupportAgentCategory(rbacMatch.category),
        forcedStatus: "",
        lastSeenAt: ""
      };
    }
    const now = new Date().toISOString();
    const rec = { ...existing, lastSeenAt: now };
    upsertSupportAgent(tenant, id, rec);
    res.json({ ok: true, id, lastSeenAt: now });
  });

  app.post("/support/agents/:id/status", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });
    const body = req.body ?? {};
    const status = String((body as any).forcedStatus ?? "").trim().toLowerCase();
    if (!(status === "" || status === "online" || status === "offline")) {
      return res.status(400).json({ error: "Invalid forcedStatus" });
    }
    const agents = mergeRbacSupportAgents(tenant, readSupportAgents(tenant));
    const existing = agents.find((a: any) => String(a.id) === id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const rec = { ...existing, forcedStatus: status };
    upsertSupportAgent(tenant, id, rec);
    res.json({ ok: true, agent: rec });
  });
}
