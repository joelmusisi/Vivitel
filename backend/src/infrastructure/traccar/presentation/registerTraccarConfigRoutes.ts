import type { Express, Request, Response } from "express";

interface TraccarConfig {
  baseUrl: string;
  username: string;
  password: string;
  token: string;
  kickCommand: string;
}

interface RegisterTraccarConfigRoutesDeps {
  app: Express;
  requireApiKey: (req: Request, res: Response) => boolean;
  getConfig: () => TraccarConfig;
  setConfig: (next: TraccarConfig) => void;
}

function toMaskedPayload(config: TraccarConfig) {
  return {
    baseUrl: config.baseUrl || null,
    username: config.username ? "***" : null,
    password: config.password ? "***" : null,
    token: config.token ? "***" : null,
    kickCommand: config.kickCommand,
  };
}

export function registerTraccarConfigRoutes(deps: RegisterTraccarConfigRoutesDeps): void {
  const { app, requireApiKey, getConfig, setConfig } = deps;

  app.get("/config/traccar", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    res.json(toMaskedPayload(getConfig()));
  });

  app.put("/config/traccar", (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body ?? {};
    const current = getConfig();

    const nextBaseUrl = String((body as any).baseUrl ?? "").trim().replace(/\/$/, "");
    const next: TraccarConfig = {
      ...current,
      baseUrl: nextBaseUrl || current.baseUrl,
      username: typeof (body as any).username !== "undefined" ? String((body as any).username ?? "").trim() : current.username,
      password: typeof (body as any).password !== "undefined" ? String((body as any).password ?? "").trim() : current.password,
      token: typeof (body as any).token !== "undefined" ? String((body as any).token ?? "").trim() : current.token,
      kickCommand:
        typeof (body as any).kickCommand !== "undefined"
          ? String((body as any).kickCommand ?? "getgps").trim() || "getgps"
          : current.kickCommand,
    };

    setConfig(next);
    res.json(toMaskedPayload(next));
  });
}
