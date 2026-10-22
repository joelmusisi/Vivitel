import {
  DEMO_HIERARCHY_IDS,
  extractZaHierarchy,
  hierarchyHasDealers,
  isZaHierarchyDatabaseName,
  isZaHierarchySiteName,
  stripZaHierarchy
} from "./regionHierarchy";
import { regionStorageKey } from "./regionStorage";

const HIERARCHY_GLOBAL_KEY = "hierarchy:v1:global";
const CMSV6_PREFIX = "platform:cmsv6";

const looksLikeKarongoKey = (key: string) => {
  const normalized = String(key ?? "").trim().toLowerCase();
  return normalized.includes("karongo") || normalized.includes("advancedsecurities") || normalized.includes("advanced-securities");
};

type HierarchyBlob = { dealers?: Array<Record<string, unknown>>; updatedAt?: string };

const withoutSyntheticDemo = (hierarchy: HierarchyBlob): HierarchyBlob => ({
  ...hierarchy,
  dealers: (hierarchy.dealers ?? []).filter(
    (dealer: any) => dealer?.id !== DEMO_HIERARCHY_IDS.organisation && String(dealer?.name ?? "").trim().toLowerCase() !== "demo"
  )
});

export const hierarchyHasZaBranch = (hierarchy: HierarchyBlob | null | undefined): boolean =>
  (hierarchy?.dealers ?? []).some((dealer: any) =>
    (dealer?.organisations ?? []).some((organisation: any) =>
      (organisation?.databases ?? []).some(
        (database: any) =>
          isZaHierarchyDatabaseName(database?.name) ||
          (database?.sites ?? []).some((site: any) => isZaHierarchySiteName(site?.name))
      )
    )
  );

export type ZaKarongoMigrationResult = {
  ok: boolean;
  zaDealers: number;
  usDealers: number;
  cmsv6Copied: number;
  hierarchyWroteZa: boolean;
  hierarchyUpdatedUs: boolean;
  message?: string;
};

/**
 * Copy Advanced Securities / Karongo (+ matching cmsv6 KV) into the ZA partition,
 * and remove that branch from the shared US hierarchy keys.
 * Uses the raw (unscoped) KV namespace.
 */
export async function migrateZaKarongoPartition(kv: KVNamespace): Promise<ZaKarongoMigrationResult> {
  const hierarchyKeys = [
    HIERARCHY_GLOBAL_KEY,
    regionStorageKey("us", HIERARCHY_GLOBAL_KEY),
    regionStorageKey("za", HIERARCHY_GLOBAL_KEY)
  ];
  const candidates: HierarchyBlob[] = [];
  for (const key of hierarchyKeys) {
    const raw = await kv.get(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as HierarchyBlob;
      if (Array.isArray(parsed?.dealers)) candidates.push(parsed);
    } catch {
      if (key === HIERARCHY_GLOBAL_KEY) {
        return {
          ok: false,
          zaDealers: 0,
          usDealers: 0,
          cmsv6Copied: 0,
          hierarchyWroteZa: false,
          hierarchyUpdatedUs: false,
          message: "Invalid hierarchy JSON"
        };
      }
    }
  }
  const source = candidates.find(hierarchyHasZaBranch);
  if (!source) {
    return {
      ok: false,
      zaDealers: 0,
      usDealers: 0,
      cmsv6Copied: 0,
      hierarchyWroteZa: false,
      hierarchyUpdatedUs: false,
      message: "No Advanced Securities / Karongo branch found in regional hierarchy keys"
    };
  }

  const sourceDealers = (Array.isArray(source.dealers) ? source.dealers : []) as any;
  const zaTree = withoutSyntheticDemo(extractZaHierarchy({
    dealers: sourceDealers,
    updatedAt: source.updatedAt || new Date().toISOString()
  }));
  const usTree = withoutSyntheticDemo(stripZaHierarchy({
    dealers: sourceDealers,
    updatedAt: new Date().toISOString()
  }));

  if (!hierarchyHasZaBranch(zaTree) || !hierarchyHasDealers(zaTree)) {
    return {
      ok: false,
      zaDealers: 0,
      usDealers: (usTree.dealers ?? []).length,
      cmsv6Copied: 0,
      hierarchyWroteZa: false,
      hierarchyUpdatedUs: false,
      message: "No Advanced Securities / Karongo branch found in hierarchy:v1:global"
    };
  }

  const zaKey = regionStorageKey("za", HIERARCHY_GLOBAL_KEY);
  await kv.put(zaKey, JSON.stringify(zaTree));
  await kv.put(HIERARCHY_GLOBAL_KEY, JSON.stringify(usTree));
  // Keep the US region-prefixed copy aligned when present.
  await kv.put(regionStorageKey("us", HIERARCHY_GLOBAL_KEY), JSON.stringify(usTree));

  let cmsv6Copied = 0;
  let cursor: string | undefined;
  do {
    const page: KVNamespaceListResult<unknown, string> = await kv.list({ prefix: CMSV6_PREFIX, limit: 1000, cursor });
    for (const entry of page.keys ?? []) {
      const name = String(entry?.name ?? "").trim();
      if (!name || name.startsWith("region:")) continue;
      if (!looksLikeKarongoKey(name)) continue;
      const value = await kv.get(name);
      if (value == null) continue;
      await kv.put(regionStorageKey("za", name), value);
      cmsv6Copied += 1;
    }
    cursor = page.list_complete ? undefined : (page as { cursor?: string }).cursor;
  } while (cursor);

  // Also scan already-prefixed accidental copies under region:us:
  cursor = undefined;
  do {
    const page: KVNamespaceListResult<unknown, string> = await kv.list({
      prefix: `region:us:${CMSV6_PREFIX}`,
      limit: 1000,
      cursor
    });
    for (const entry of page.keys ?? []) {
      const name = String(entry?.name ?? "").trim();
      if (!name || !looksLikeKarongoKey(name)) continue;
      const logical = name.replace(/^region:us:/, "");
      const value = await kv.get(name);
      if (value == null) continue;
      await kv.put(regionStorageKey("za", logical), value);
      cmsv6Copied += 1;
    }
    cursor = page.list_complete ? undefined : (page as { cursor?: string }).cursor;
  } while (cursor);

  return {
    ok: true,
    zaDealers: (zaTree.dealers ?? []).length,
    usDealers: (usTree.dealers ?? []).length,
    cmsv6Copied,
    hierarchyWroteZa: true,
    hierarchyUpdatedUs: true
  };
}
