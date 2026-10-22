import { describe, expect, it } from "vitest";
import {
  createRegionScopedKv,
  isTraccarStorageTenant,
  regionStorageKey,
  storageTenantId
} from "./regionStorage";
import { extractZaHierarchy, stripZaHierarchy } from "./regionHierarchy";
import { migrateZaKarongoPartition } from "./migrateZaKarongo";

describe("regionStorage", () => {
  it("keeps United States tenant ids unprefixed", () => {
    expect(storageTenantId("us", "west-africa")).toBe("west-africa");
    expect(regionStorageKey("us", "hierarchy:v1:global")).toBe("region:us:hierarchy:v1:global");
  });

  it("prefixes ZA tenant ids and KV keys", () => {
    expect(storageTenantId("za", "west-africa")).toBe("region:za:west-africa");
    expect(regionStorageKey("za", "hierarchy:v1:global")).toBe("region:za:hierarchy:v1:global");
    expect(storageTenantId("za", "region:za:west-africa")).toBe("region:za:west-africa");
  });

  it("treats unprefixed tenants as Traccar and ZA as non-Traccar", () => {
    expect(isTraccarStorageTenant("west-africa")).toBe(true);
    expect(isTraccarStorageTenant("region:za:west-africa")).toBe(false);
    expect(isTraccarStorageTenant("region:ent:acme")).toBe(true);
    expect(isTraccarStorageTenant("region:uk:fleet")).toBe(false);
  });

  it("isolates KV reads so ZA cannot see US keys", async () => {
    const store = new Map<string, string>();
    const raw = {
      get: async (key: string) => store.get(String(key)) ?? null,
      put: async (key: string, value: string) => {
        store.set(String(key), value);
      },
      delete: async (key: string) => {
        store.delete(String(key));
      },
      list: async (options?: { prefix?: string }) => {
        const prefix = String(options?.prefix ?? "");
        const keys = Array.from(store.keys())
          .filter((name) => !prefix || name.startsWith(prefix))
          .map((name) => ({ name }));
        return { keys, list_complete: true, cursor: "", cacheStatus: null };
      },
      getWithMetadata: async () => ({ value: null, metadata: null })
    } as unknown as KVNamespace;

    await raw.put("hierarchy:v1:global", JSON.stringify({ dealers: [{ name: "US Fleet" }] }));
    const usKv = createRegionScopedKv(raw, "us");
    const zaKv = createRegionScopedKv(raw, "za");

    expect(await usKv.get("hierarchy:v1:global")).toContain("US Fleet");
    expect(await zaKv.get("hierarchy:v1:global")).toBeNull();

    await zaKv.put("hierarchy:v1:global", JSON.stringify({ dealers: [{ name: "Karongo Tree" }] }));
    expect(await zaKv.get("hierarchy:v1:global")).toContain("Karongo Tree");
    expect(await usKv.get("hierarchy:v1:global")).toContain("US Fleet");
    expect(store.has("region:za:hierarchy:v1:global")).toBe(true);
  });
});

describe("migrateZaKarongoPartition", () => {
  it("moves Advanced Securities / Karongo into region:za and strips it from US", async () => {
    const store = new Map<string, string>();
    const raw = {
      get: async (key: string) => store.get(String(key)) ?? null,
      put: async (key: string, value: string) => {
        store.set(String(key), value);
      },
      delete: async (key: string) => {
        store.delete(String(key));
      },
      list: async (options?: { prefix?: string }) => {
        const prefix = String(options?.prefix ?? "");
        const keys = Array.from(store.keys())
          .filter((name) => !prefix || name.startsWith(prefix))
          .map((name) => ({ name }));
        return { keys, list_complete: true, cursor: "", cacheStatus: null };
      },
      getWithMetadata: async () => ({ value: null, metadata: null })
    } as unknown as KVNamespace;

    const shared = {
      dealers: [
        {
          id: "africa",
          name: "AFRICA",
          organisations: [
            {
              id: "east",
              name: "EAST AFRICA",
              databases: [
                {
                  id: "adv",
                  name: "Advanced Securities",
                  sites: [{ id: "karongo", name: "Karongo" }]
                },
                { id: "fleet", name: "Fleet DB", sites: [{ id: "mm", name: "MMULU" }] }
              ]
            }
          ]
        }
      ]
    };
    await raw.put("hierarchy:v1:global", JSON.stringify(shared));
    await raw.put("platform:cmsv6:tenant:west-africa:site:karongo", JSON.stringify({ baseUrl: "https://gps.hboiot.com:8088" }));

    const result = await migrateZaKarongoPartition(raw);
    expect(result.ok).toBe(true);
    expect(result.hierarchyWroteZa).toBe(true);
    expect(result.cmsv6Copied).toBeGreaterThanOrEqual(1);

    const za = JSON.parse(String(await raw.get("region:za:hierarchy:v1:global")));
    const us = JSON.parse(String(await raw.get("hierarchy:v1:global")));
    expect(extractZaHierarchy(za).dealers[0]?.organisations?.[0]?.databases?.[0]?.name).toBe("Advanced Securities");
    expect(stripZaHierarchy(us).dealers[0]?.organisations?.[0]?.databases?.map((d: { name: string }) => d.name)).toEqual(["Fleet DB"]);
    expect(await raw.get("region:za:platform:cmsv6:tenant:west-africa:site:karongo")).toContain("hboiot");
  });
});
