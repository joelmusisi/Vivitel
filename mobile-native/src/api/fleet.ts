import { apiFetch } from "./client";

export type FleetAsset = {
  id?: string;
  assetId?: string;
  registration?: string;
  assetDescription?: string;
  site?: string;
  imei?: string;
  status?: string;
};

export type HomeStatusCounts = {
  moving: number;
  stopped: number;
  idle: number;
  offline: number;
};

export async function fetchAssets(): Promise<FleetAsset[]> {
  const body = await apiFetch<{ assets?: FleetAsset[] }>("/d1/assets", { method: "GET" });
  return Array.isArray(body?.assets) ? body.assets : [];
}

export function summarizeFleetStatus(assets: FleetAsset[]): { total: number; counts: HomeStatusCounts } {
  const counts: HomeStatusCounts = { moving: 0, stopped: 0, idle: 0, offline: 0 };
  for (const asset of assets) {
    const raw = String(asset.status ?? "").trim().toLowerCase();
    if (raw.includes("move") || raw === "online") counts.moving += 1;
    else if (raw.includes("stop")) counts.stopped += 1;
    else if (raw.includes("idle") || raw.includes("stale")) counts.idle += 1;
    else counts.offline += 1;
  }
  return { total: assets.length, counts };
}

export type HierarchyDealer = {
  id: string;
  name: string;
  organisations?: Array<{
    id: string;
    name: string;
    databases?: Array<{
      id: string;
      name: string;
      sites?: Array<{ id: string; name: string }>;
    }>;
  }>;
};

export async function fetchHierarchy(): Promise<HierarchyDealer[]> {
  const body = await apiFetch<{ dealers?: HierarchyDealer[] }>("/b2/hierarchy", { method: "GET" });
  return Array.isArray(body?.dealers) ? body.dealers : [];
}
