import type { Express } from "express";
import { isRegionId } from "../../shared/regionServers";

interface RegisterOperationalHierarchyRoutesDeps {
  app: Express;
  db: any;
  requireApiKey: (req: any, res: any) => boolean;
}

export function registerOperationalHierarchyRoutes(
  deps: RegisterOperationalHierarchyRoutesDeps,
): void {
  const { app, db, requireApiKey } = deps;

  app.get("/operational/hierarchy", (req, res) => {
    if (!requireApiKey(req, res))
      return res.status(401).json({ error: "Unauthorized" });
    const region = String(req.header("x-vivi-region") ?? "")
      .trim()
      .toLowerCase();
    if (!isRegionId(region))
      return res
        .status(400)
        .json({ error: "A valid x-vivi-region is required." });

    const row = db
      .prepare(
        "SELECT data, updated_at FROM operational_hierarchies WHERE region_id = ?",
      )
      .get(region);
    if (!row) return res.json({ hierarchy: null });

    try {
      return res.json({
        hierarchy: JSON.parse(String(row.data ?? "")),
        updatedAt: row.updated_at,
      });
    } catch {
      return res
        .status(500)
        .json({ error: "Stored operational hierarchy is invalid JSON." });
    }
  });

  app.put("/operational/hierarchy", (req, res) => {
    if (!requireApiKey(req, res))
      return res.status(401).json({ error: "Unauthorized" });
    const region = String(req.header("x-vivi-region") ?? "")
      .trim()
      .toLowerCase();
    if (!isRegionId(region))
      return res
        .status(400)
        .json({ error: "A valid x-vivi-region is required." });

    const hierarchy = req.body?.hierarchy;
    if (
      !hierarchy ||
      typeof hierarchy !== "object" ||
      !Array.isArray(hierarchy.dealers)
    ) {
      return res
        .status(400)
        .json({ error: "hierarchy.dealers must be an array." });
    }

    const updatedAt = new Date().toISOString();
    db.prepare(
      "INSERT INTO operational_hierarchies (region_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(region_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    ).run(region, JSON.stringify(hierarchy), updatedAt);
    return res.json({ stored: true, region, updatedAt });
  });
}
