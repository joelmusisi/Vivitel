import type { Express } from "express";

interface RegisterSupportChatRoutesDeps {
  app: Express;
  db: any;
  generateId: () => string;
}

export function registerSupportChatRoutes(deps: RegisterSupportChatRoutesDeps): void {
  const { app, db, generateId } = deps;

  app.post("/support/chat", (req, res) => {
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const message = String((body as any).message ?? "").trim();
    if (!message) return res.status(400).json({ error: "Message is required." });
    const userName = String((body as any).userName ?? "").trim();
    const userEmail = String((body as any).userEmail ?? "").trim();
    const agentId = String((body as any).agentId ?? "").trim();
    const agentName = String((body as any).agentName ?? "").trim();
    const agentCategory = String((body as any).agentCategory ?? "").trim();
    const conversationId = String((body as any).conversationId ?? generateId());
    const existing = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
    let conv: any;

    const nextUserJson = () => {
      const u: any = {};
      if (userName) u.name = userName;
      if (userEmail) u.email = userEmail;
      if (agentId || agentName || agentCategory) {
        u.assignedAgent = { id: agentId || undefined, name: agentName || undefined, category: agentCategory || undefined };
      }
      return u;
    };

    const mergeUserJson = (prevRaw: any) => {
      let prev: any = {};
      try {
        prev = prevRaw ? JSON.parse(String(prevRaw)) : {};
      } catch {
        prev = {};
      }
      const next = nextUserJson();
      const merged = { ...prev, ...next };
      if (next.assignedAgent) merged.assignedAgent = { ...(prev.assignedAgent ?? {}), ...(next.assignedAgent ?? {}) };
      return merged;
    };

    if (existing) {
      conv = existing;
      const messages = JSON.parse((conv as any).messages_json || "[]");
      messages.push({ id: generateId(), role: "user", text: message, at: new Date().toISOString() });
      db.prepare("UPDATE conversations SET messages_json = ? WHERE id = ?").run(JSON.stringify(messages), conversationId);
      const mergedUser = mergeUserJson((conv as any).user_json);
      db.prepare("UPDATE conversations SET user_json = ? WHERE id = ?").run(JSON.stringify(mergedUser), conversationId);
      conv = { ...conv, messages_json: JSON.stringify(messages), user_json: JSON.stringify(mergedUser) };
    } else {
      const messages = [{ id: generateId(), role: "user", text: message, at: new Date().toISOString() }];
      const userJson = mergeUserJson(null);
      db.prepare("INSERT INTO conversations (id, tenant_id, status, createdAt, user_json, messages_json) VALUES (?, ?, ?, ?, ?, ?)").run(
        conversationId,
        tenant,
        "open",
        new Date().toISOString(),
        JSON.stringify(userJson),
        JSON.stringify(messages)
      );
      conv = {
        id: conversationId,
        tenant_id: tenant,
        status: "open",
        user_json: JSON.stringify(userJson),
        messages_json: JSON.stringify(messages),
        createdAt: new Date().toISOString()
      };
    }

    let parsedUser: any = {};
    try {
      parsedUser = (conv as any).user_json ? JSON.parse(String((conv as any).user_json)) : {};
    } catch {
      parsedUser = {};
    }

    res.json({
      conversation: {
        id: (conv as any).id,
        status: (conv as any).status || "open",
        createdAt: (conv as any).createdAt || new Date().toISOString(),
        closedAt: (conv as any).closedAt || undefined,
        user: { name: parsedUser?.name, email: parsedUser?.email },
        assignedAgent: parsedUser?.assignedAgent,
        messages: JSON.parse((conv as any).messages_json)
      }
    });
  });

  app.get("/support/chat", (req, res) => {
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const id = String(req.query.id ?? "");
    if (!id) return res.status(400).json({ error: "Conversation id is required." });
    const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
    if (!conv) return res.json({ conversation: null, tenantId: tenant });

    let parsedUser: any = {};
    try {
      parsedUser = (conv as any).user_json ? JSON.parse(String((conv as any).user_json)) : {};
    } catch {
      parsedUser = {};
    }

    res.json({
      conversation: {
        id: (conv as any).id,
        status: (conv as any).status,
        createdAt: (conv as any).createdAt,
        closedAt: (conv as any).closedAt || undefined,
        user: { name: parsedUser?.name, email: parsedUser?.email },
        assignedAgent: parsedUser?.assignedAgent,
        messages: JSON.parse((conv as any).messages_json)
      },
      tenantId: tenant
    });
  });

  app.post("/support/chat/end", (req, res) => {
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const conversationId = String((body as any).conversationId ?? "");
    if (!conversationId) return res.status(400).json({ error: "Conversation id is required." });
    const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
    if (!conv) return res.status(404).json({ error: "Not found" });
    db.prepare("UPDATE conversations SET status = ?, closedAt = ? WHERE id = ?").run("closed", new Date().toISOString(), conversationId);
    res.json({ ended: true, conversationId, emailQueued: true });
  });

  app.post("/support/chat/reply", (req, res) => {
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const body = req.body ?? {};
    const conversationId = String((body as any).conversationId ?? "").trim();
    const message = String((body as any).message ?? "").trim();
    if (!conversationId) return res.status(400).json({ error: "Conversation id is required." });
    if (!message) return res.status(400).json({ error: "Message is required." });
    const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
    if (!conv) return res.status(404).json({ error: "Not found" });
    if (String((conv as any).status ?? "").toLowerCase() === "closed") {
      return res.status(400).json({ error: "Conversation is closed." });
    }
    const messages = JSON.parse((conv as any).messages_json || "[]");
    messages.push({ id: generateId(), role: "agent", text: message, at: new Date().toISOString() });
    db.prepare("UPDATE conversations SET messages_json = ? WHERE id = ?").run(JSON.stringify(messages), conversationId);
    let parsedUser: any = {};
    try {
      parsedUser = (conv as any).user_json ? JSON.parse(String((conv as any).user_json)) : {};
    } catch {
      parsedUser = {};
    }
    res.json({
      conversation: {
        id: (conv as any).id,
        status: (conv as any).status || "open",
        createdAt: (conv as any).createdAt || new Date().toISOString(),
        closedAt: (conv as any).closedAt || undefined,
        user: { name: parsedUser?.name, email: parsedUser?.email },
        assignedAgent: parsedUser?.assignedAgent,
        messages
      },
      tenantId: tenant
    });
  });

  app.get("/support/chat/inbox", (req, res) => {
    const tenant = String(req.header("x-tenant-id") ?? req.query.tenant ?? "");
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50) || 50));
    const rows = db
      .prepare("SELECT * FROM conversations WHERE tenant_id = ? AND status = 'open' ORDER BY createdAt DESC LIMIT ?")
      .all(tenant, limit);
    const conversations = (rows as any[]).map((conv) => {
      let parsedUser: any = {};
      try {
        parsedUser = conv.user_json ? JSON.parse(String(conv.user_json)) : {};
      } catch {
        parsedUser = {};
      }
      return {
        id: conv.id,
        status: conv.status,
        createdAt: conv.createdAt,
        closedAt: conv.closedAt || undefined,
        user: { name: parsedUser?.name, email: parsedUser?.email },
        assignedAgent: parsedUser?.assignedAgent,
        messages: JSON.parse(conv.messages_json || "[]")
      };
    });
    res.json({ conversations, tenantId: tenant, at: new Date().toISOString() });
  });
}
