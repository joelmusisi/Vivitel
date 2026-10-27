import { describe, expect, it } from "vitest";
import {
  assetsLookLikeTraccarStubs,
  buildHierarchyDealersFromAssets,
  countHierarchyDealerNodes,
  dealersFromHierarchyPayload,
  formatAssetDescription,
  formatAssetPickerLabel,
  preferHumanAssetLabel,
  hierarchyUsesSyntheticIds,
  isHierarchyUnavailable,
  isSyntheticTenantId,
  PUBLISHED_MMULU_TENANT_ID,
  publishedTenantIdForSite,
  resolveDatabaseTenantFromHierarchy,
  resolveHierarchyDisplayRows,
  scoreTenantAssetRows,
  shouldPersistHierarchyCache
} from "./hierarchyDisplay";

const africa = { id: "d1", name: "AFRICA", organisations: [{ id: "o1" }] };
const cached = { id: "d1", name: "AFRICA", organisations: [{ id: "o1" }, { id: "o2" }] };
const full = {
  id: "d1",
  name: "AFRICA",
  organisations: [
    {
      id: "o1",
      name: "Rimam",
      databases: [{ id: "db1", name: "Fleet", sites: [{ id: "s1", name: "RIMAM BEV" }] }]
    }
  ]
};

describe("resolveHierarchyDisplayRows", () => {
  it("keeps the richer local tree when the server only has a stub", () => {
    expect(resolveHierarchyDisplayRows({ serverRows: [africa], localRows: [full] })).toEqual([full]);
  });

  it("uses the server tree when it is at least as complete", () => {
    expect(resolveHierarchyDisplayRows({ serverRows: [full], localRows: [cached] })).toEqual([full]);
  });

  it("keeps the last good tree when the server request failed", () => {
    expect(
      resolveHierarchyDisplayRows({
        serverRows: [],
        localRows: [cached],
        serverUnavailable: true
      })
    ).toEqual([cached]);
  });

  it("keeps the last good tree when the server list is empty", () => {
    expect(resolveHierarchyDisplayRows({ serverRows: [], localRows: [cached] })).toEqual([cached]);
  });

  it("stays empty only when both sides are empty", () => {
    expect(resolveHierarchyDisplayRows({ serverRows: [], localRows: [] })).toEqual([]);
  });

  it("keeps the live server tree instead of a recovered name-slug tree", () => {
    const recovered = {
      id: "org-east-africa",
      name: "EAST AFRICA",
      organisations: [
        {
          id: "dealer-africa",
          name: "AFRICA",
          databases: [{ id: "db-transfleet-services", name: "TRANSFLEET SERVICES", sites: [{ id: "site-mmulu", name: "MMULU COMPANY" }] }]
        }
      ]
    };
    expect(resolveHierarchyDisplayRows({ serverRows: [full], localRows: [recovered] })).toEqual([full]);
  });
});

describe("shouldPersistHierarchyCache", () => {
  it("writes a non-empty tree", () => {
    expect(shouldPersistHierarchyCache([africa], [])).toBe(true);
  });

  it("does not overwrite a saved tree with an empty list", () => {
    expect(shouldPersistHierarchyCache([], [cached])).toBe(false);
  });

  it("does not persist recovered name-slug ids over a real tree", () => {
    const slugTree = [
      {
        id: "org-east-africa",
        name: "EAST AFRICA",
        organisations: [{ id: "dealer-africa", name: "AFRICA", databases: [{ id: "db-fleet", name: "Fleet", sites: [] }] }]
      }
    ];
    expect(hierarchyUsesSyntheticIds(slugTree)).toBe(true);
    expect(shouldPersistHierarchyCache(slugTree, [full])).toBe(false);
    expect(shouldPersistHierarchyCache(slugTree, [])).toBe(false);
  });
});

describe("isHierarchyUnavailable", () => {
  it("flags a failed hierarchy read", () => {
    expect(isHierarchyUnavailable({ unavailable: true })).toBe(true);
    expect(isHierarchyUnavailable({ dealers: [] })).toBe(false);
  });
});

describe("dealersFromHierarchyPayload", () => {
  it("reads dealers from a nested hierarchy wrapper", () => {
    expect(dealersFromHierarchyPayload({ ok: true, hierarchy: { dealers: [africa] } })).toEqual([africa]);
  });
});

describe("buildHierarchyDealersFromAssets", () => {
  it("arranges cached assets into organisation → dealer → database → site", () => {
    const tree = buildHierarchyDealersFromAssets(
      [
        { organisation: "Africa Org", dealer: "Rimam", database: "Fleet", site: "RIMAM BEV" },
        { organisation: "Africa Org", dealer: "Rimam", database: "Fleet", site: "MMAULI CO" }
      ],
      ["org-1:dealer-1:db-1"]
    );
    expect(countHierarchyDealerNodes(tree)).toBe(5);
    expect(tree[0]?.name).toBe("Africa Org");
    expect(tree[0]?.organisations?.[0]?.name).toBe("Rimam");
    expect(tree[0]?.organisations?.[0]?.databases?.[0]?.sites?.map((site) => site.name)).toEqual([
      "RIMAM BEV",
      "MMAULI CO"
    ]);
  });

  it("keeps each cached tenant's real ids instead of copying the first hint onto every site", () => {
    const east = "dealer-11111111-1111-4111-8111-111111111111:org-22222222-2222-4222-8222-222222222222:db-33333333-3333-4333-8333-333333333333";
    const west = "dealer-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:org-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:db-cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    expect(isSyntheticTenantId(east)).toBe(false);
    const tree = buildHierarchyDealersFromAssets([
      { tenantId: east, organisation: "EAST AFRICA", dealer: "AFRICA", database: "TRANSFLEET SERVICES", site: "MMULU COMPANY" },
      { tenantId: west, organisation: "WEST AFRICA", dealer: "RIMAM", database: "Fleet", site: "RIMAM BEV" }
    ]);
    expect(tree.map((row) => row.id)).toEqual([
      "dealer-11111111-1111-4111-8111-111111111111",
      "dealer-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    ]);
    expect(tree[0]?.organisations?.[0]?.databases?.[0]?.id).toBe("db-33333333-3333-4333-8333-333333333333");
    expect(tree[1]?.organisations?.[0]?.databases?.[0]?.id).toBe("db-cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  });
});

describe("resolveDatabaseTenantFromHierarchy", () => {
  const liveTree = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "EAST AFRICA",
      organisations: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "AFRICA",
          databases: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              name: "TRANSFLEET SERVICES",
              sites: [{ id: "44444444-4444-4444-8444-444444444444", name: "MMULU COMPANY" }]
            }
          ]
        }
      ]
    }
  ];

  it("maps the MMULU path names onto live UUID tenant ids", () => {
    expect(
      resolveDatabaseTenantFromHierarchy({
        rows: liveTree,
        pathNames: ["EAST AFRICA", "AFRICA", "TRANSFLEET SERVICES", "MMULU COMPANY"]
      })
    ).toMatchObject({
      tenantId: "11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333",
      siteName: "MMULU COMPANY"
    });
  });

  it("finds MMULU when the ribbon path has AFRICA before EAST AFRICA", () => {
    expect(
      resolveDatabaseTenantFromHierarchy({
        rows: liveTree,
        pathNames: ["AFRICA", "EAST AFRICA", "TRANSFLEET SERVICES", "MMULU COMPANY"],
        siteName: "MMULU COMPANY"
      })
    ).toMatchObject({
      tenantId: "11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333"
    });
  });

  it("finds MMULU by site name when stored ids are name slugs", () => {
    expect(
      resolveDatabaseTenantFromHierarchy({
        rows: liveTree,
        dealerId: "org-east-africa",
        orgId: "dealer-africa",
        dbId: "db-transfleet-services",
        siteName: "MMULU COMPANY"
      })
    ).toMatchObject({
      tenantId: "11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333"
    });
  });

  it("keeps stored live UUIDs when a swapped AFRICA / EAST AFRICA path also matches MMULU", () => {
    const liveId = "11111111-1111-4111-8111-111111111111";
    const stubDealer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const stubOrg = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const stubDb = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const twoMmulu = [
      {
        id: stubDealer,
        name: "AFRICA",
        organisations: [
          {
            id: stubOrg,
            name: "EAST AFRICA",
            databases: [
              {
                id: stubDb,
                name: "TRANSFLEET SERVICES",
                sites: [{ id: "site-stub", name: "MMULU COMPANY" }]
              }
            ]
          }
        ]
      },
      ...liveTree
    ];
    expect(
      resolveDatabaseTenantFromHierarchy({
        rows: twoMmulu,
        dealerId: liveId,
        orgId: "22222222-2222-4222-8222-222222222222",
        dbId: "33333333-3333-4333-8333-333333333333",
        pathNames: ["AFRICA", "EAST AFRICA", "TRANSFLEET SERVICES", "MMULU COMPANY"],
        siteName: "MMULU COMPANY"
      })
    ).toMatchObject({
      tenantId: `${liveId}:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333`
    });
  });

  it("refuses recovered name-slug trees so stub tenants stay inactive", () => {
    expect(
      resolveDatabaseTenantFromHierarchy({
        rows: [
          {
            id: "org-east-africa",
            name: "EAST AFRICA",
            organisations: [
              {
                id: "dealer-africa",
                name: "AFRICA",
                databases: [
                  {
                    id: "db-transfleet-services",
                    name: "TRANSFLEET SERVICES",
                    sites: [{ id: "site-mmulu-company", name: "MMULU COMPANY" }]
                  }
                ]
              }
            ]
          }
        ],
        pathNames: ["EAST AFRICA", "AFRICA", "TRANSFLEET SERVICES", "MMULU COMPANY"]
      })
    ).toBeNull();
  });
});

describe("publishedTenantIdForSite", () => {
  it("returns the live MMULU tenant for the Transfleet path", () => {
    expect(publishedTenantIdForSite("MMULU COMPANY", ["AFRICA", "EAST AFRICA", "TRANSFLEET SERVICES"])).toBe(
      PUBLISHED_MMULU_TENANT_ID
    );
  });
});

describe("assetsLookLikeTraccarStubs", () => {
  it("flags IMEI-named rows that are missing the production user fields", () => {
    expect(
      assetsLookLikeTraccarStubs([
        { assetDescription: "350612078056197", imei: "350612078056197", registration: "350612078056197", configGroup: "default-group", assetId: 1 }
      ])
    ).toBe(true);
  });

  it("does not treat plate-style descriptions as Traccar stubs", () => {
    expect(
      assetsLookLikeTraccarStubs([
        { assetDescription: "UA 111EF", imei: "861937083429533", registration: "UA 111EF", configGroup: "default-group", assetId: 1 }
      ])
    ).toBe(false);
  });

  it("scores published SHACKMAN rows above IMEI stubs", () => {
    const stubs = [
      { assetDescription: "350612078333583", imei: "350612078333583", configGroup: "default-group", assetId: 12, site: "MMULU COMPANY" }
    ];
    const published = [
      {
        assetDescription: "SHACKMAN UA 822EC",
        registration: "UA 822EC",
        imei: "350612078333583",
        fleetNumber: "Or 893144040013646533098/",
        country: "Uganda",
        make: "Shackman",
        assetType: "Heavy Vehicle",
        configGroup: "Mulu_Transport_Fuel_T",
        assetId: 12,
        site: "MMULU COMPANY"
      }
    ];
    expect(scoreTenantAssetRows(stubs, "MMULU COMPANY")).toBe(1);
    expect(scoreTenantAssetRows(published, "MMULU COMPANY")).toBeGreaterThan(1000);
  });

  it("keeps published SHACKMAN fleet rows", () => {
    expect(
      assetsLookLikeTraccarStubs([
        {
          assetDescription: "SHACKMAN UA 822EC",
          registration: "UA 822EC",
          imei: "350612078333583",
          fleetNumber: "Or 893144040013646533098/",
          country: "Uganda",
          make: "Shackman",
          assetType: "Heavy Vehicle",
          configGroup: "Mulu_Transport_Fuel_T",
          assetId: 12
        }
      ])
    ).toBe(false);
  });
});

describe("formatAssetDescription", () => {
  it("composes Make+Plate when description is an IMEI stub", () => {
    expect(
      formatAssetDescription({
        assetDescription: "350612078056197",
        registration: "UA 813EC",
        imei: "350612078056197",
        make: "Shackman"
      })
    ).toBe("SHACKMAN UA 813EC");
  });

  it("keeps a stored SHACKMAN Make+Plate description", () => {
    expect(
      formatAssetDescription({
        assetDescription: "SHACKMAN UA 1615F",
        registration: "UA 1615F",
        make: "Shackman"
      })
    ).toBe("SHACKMAN UA 1615F");
  });

  it("composes Make+Plate when description is only the plate", () => {
    expect(
      formatAssetDescription({
        assetDescription: "UA 427EC",
        registration: "UA 427EC",
        make: "Shackman"
      })
    ).toBe("SHACKMAN UA 427EC");
  });

  it("does not append the plate again in the picker label", () => {
    expect(
      formatAssetPickerLabel({
        assetDescription: "SHACKMAN UA 1615F",
        registration: "UA 1615F",
        make: "Shackman"
      })
    ).toBe("SHACKMAN UA 1615F");
  });

  it("falls back to registration when description is the IMEI and make is missing", () => {
    expect(
      formatAssetDescription({
        assetDescription: "350612078068549",
        registration: "UA 814EC",
        imei: "350612078068549"
      })
    ).toBe("UA 814EC");
  });

  it("never returns an IMEI as the display description", () => {
    expect(
      formatAssetDescription({
        assetDescription: "350612078056197",
        registration: "350612078056197",
        imei: "350612078056197"
      })
    ).toBe("");
  });

  it("keeps a human label when an incoming refresh is an IMEI", () => {
    expect(preferHumanAssetLabel("UA 427EC", "350612078056197", "350612078056197")).toBe("UA 427EC");
    expect(preferHumanAssetLabel("UA 427EC", "UA 427EC", "350612078056197")).toBe("UA 427EC");
    expect(preferHumanAssetLabel("", "UA 591EC", "350612078056197")).toBe("UA 591EC");
  });
});
