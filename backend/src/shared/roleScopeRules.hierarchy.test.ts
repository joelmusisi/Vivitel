import { describe, expect, it } from "vitest";
import { filterHierarchyForActorScope, grantCoversHierarchyPath, resolveRoleScopeRules, validateAssignmentForRoleScope } from "./roleScopeRules";

const sampleHierarchy = {
  updatedAt: "2026-01-01T00:00:00.000Z",
  dealers: [
    {
      id: "dealer-a",
      name: "Org A",
      organisations: [
        {
          id: "org-1",
          name: "Dealer 1",
          databases: [
            {
              id: "db-1",
              name: "DB One",
              sites: [
                { id: "site-1", name: "Site One" },
                { id: "site-2", name: "Site Two" }
              ]
            },
            {
              id: "db-2",
              name: "DB Two",
              sites: [{ id: "site-3", name: "Site Three" }]
            }
          ]
        }
      ]
    }
  ]
};

describe("grantCoversHierarchyPath", () => {
  it("matches exact database grants", () => {
    expect(grantCoversHierarchyPath("dealer-a:org-1:db-1", "dealer-a", "org-1", "db-1")).toBe(true);
    expect(grantCoversHierarchyPath("dealer-a:org-1:db-1", "dealer-a", "org-1", "db-2")).toBe(false);
  });

  it("matches org and dealer prefix grants", () => {
    expect(grantCoversHierarchyPath("dealer-a:org-1", "dealer-a", "org-1", "db-2")).toBe(true);
    expect(grantCoversHierarchyPath("dealer-a", "dealer-a", "org-1", "db-2")).toBe(true);
  });

  it("expands dealer-support grants to the whole dealer", () => {
    expect(
      grantCoversHierarchyPath("dealer-a:org-1:db-1", "dealer-a", "org-1", "db-2", {
        expandDealerSupportToDealer: true
      })
    ).toBe(true);
  });
});

describe("filterHierarchyForActorScope", () => {
  it("shows sibling databases for dealer support under an assigned dealer", () => {
    const filtered = filterHierarchyForActorScope(
      sampleHierarchy,
      ["dealer-a:org-1:db-1"],
      [],
      ["Dealer Support"]
    );
    const dbIds = filtered.dealers.flatMap((d) => d.organisations.flatMap((o) => o.databases.map((db) => db.id)));
    expect(dbIds.sort()).toEqual(["db-1", "db-2"]);
  });

  it("keeps advanced users on exact database grants only", () => {
    const filtered = filterHierarchyForActorScope(
      sampleHierarchy,
      ["dealer-a:org-1:db-1"],
      ["site-1"],
      ["Advanced User"]
    );
    const databases = filtered.dealers[0]?.organisations[0]?.databases ?? [];
    expect(databases.map((db) => db.id)).toEqual(["db-1"]);
    expect(databases[0]?.sites.map((site) => site.id)).toEqual(["site-1"]);
  });

  it("matches assigned sites by name when site ids drift", () => {
    const filtered = filterHierarchyForActorScope(
      sampleHierarchy,
      ["dealer-a:org-1:db-1"],
      ["stale-site-id"],
      ["Advanced User"],
      false,
      ["Site One"]
    );
    const databases = filtered.dealers[0]?.organisations[0]?.databases ?? [];
    expect(databases.map((db) => db.id)).toEqual(["db-1"]);
    expect(databases[0]?.sites.map((site) => site.id)).toEqual(["site-1"]);
  });

  it("returns full tree for own support", () => {
    const filtered = filterHierarchyForActorScope(sampleHierarchy, ["dealer-a:org-1:db-1"], [], ["Own Support"]);
    expect(filtered.dealers).toHaveLength(1);
    expect(filtered.dealers[0]?.organisations[0]?.databases).toHaveLength(2);
  });

  it("returns an empty tree when a scoped user has no grants", () => {
    const filtered = filterHierarchyForActorScope(sampleHierarchy, [], [], ["Basic User"]);
    expect(filtered.dealers).toEqual([]);
  });
});

describe("resolveRoleScopeRules", () => {
  it("does not cap own support at one site", () => {
    const rules = resolveRoleScopeRules(["Own Support"]);
    expect(rules.key).toBe("own-support");
    expect(rules.maxSites).toBeNull();
    expect(
      validateAssignmentForRoleScope(["Own Support"], {
        tenantIds: ["dealer-a:org-1:db-1", "dealer-a:org-1:db-2"],
        siteIds: ["site-1", "site-2", "site-3"]
      })
    ).toBeNull();
    expect(
      validateAssignmentForRoleScope(["own-support"], {
        tenantIds: ["dealer-a:org-1:db-1"],
        siteIds: []
      })
    ).toBeNull();
  });

  it("hides organisations and databases from dealer support", () => {
    const rules = resolveRoleScopeRules(["Dealer Support"]);
    expect(rules.key).toBe("dealer-support");
    expect(rules.visibility.showDealer).toBe(false);
    expect(rules.visibility.showOrganisation).toBe(true);
    expect(rules.visibility.showDatabase).toBe(false);
    expect(rules.canAssignDatabase).toBe(false);
  });

  it("lets a basic user keep one personal site beside the shared Demo site", () => {
    expect(
      validateAssignmentForRoleScope(["Basic User"], {
        tenantIds: ["sten-org:sten-dealer:sten-db", "demo-organisation:demo-dealer:demo-database"],
        siteIds: ["sten-site", "demo-site"],
        siteAssignments: [
          { tenantId: "sten-org:sten-dealer:sten-db", siteId: "sten-site", siteName: "Sten" },
          { tenantId: "demo-organisation:demo-dealer:demo-database", siteId: "demo-site", siteName: "Demo" }
        ]
      })
    ).toBeNull();
  });
});
