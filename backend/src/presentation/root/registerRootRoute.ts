import type { Express } from "express";

interface RegisterRootRouteDeps {
  app: Express;
}

export function registerRootRoute(deps: RegisterRootRouteDeps): void {
  const { app } = deps;

  app.get("/", (_req, res) => {
    res.json({ service: "Vivi telematics VPS API" });
  });
}
