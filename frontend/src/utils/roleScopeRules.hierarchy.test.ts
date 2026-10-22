import { describe, expect, it } from "vitest";
import {
  filterDealerRowsForActorScope,
  grantCoversHierarchyPath,
  resolveRoleScopeRulesFromNames,
  resolveRoleScopeRulesFromPrincipal,
  validateAssignmentDraft
} from "./roleScopeRules";

const sampleDealers = [
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
];

describe("grantCoversHierarchyPath (frontend)", () => {
  it("matches prefix grants", () => {
    expect(grantCoversHierarchyPath("dealer-a:org-1", "dealer-a", "org-1", "db-2")).toBe(true);
    expect(grantCoversHierarchyPath("dealer-a:org-1:db-1", "dealer-a", "org-1", "db-2")).toBe(false);
  });
});

describe("filterDealerRowsForActorScope", () => {
  it("lets dealer support see new databases under their assigned dealer", () => {
    const filtered = filterDealerRowsForActorScope(sampleDealers, ["dealer-a:org-1:db-1"], [], ["Dealer Support"]);
    const dbIds = filtered.flatMap((d) => d.organisations.flatMap((o) => o.databases.map((db) => db.id)));
    expect(dbIds.sort()).toEqual(["db-1", "db-2"]);
  });
});

describe("resolveRoleScopeRulesFromNames", () => {
  it("lets own support keep any number of sites", () => {
    const rules = resolveRoleScopeRulesFromNames(["Own Support"]);
    expect(rules.key).toBe("own-support");
    expect(rules.maxSites).toBeNull();
    expect(validateAssignmentDraft("Own Support", ["dealer-a:org-1:db-1"], ["site-1", "site-2"])).toBeNull();
    expect(validateAssignmentDraft("own-support", ["dealer-a:org-1:db-1"], [])).toBeNull();
  });

  it("hides organisations and databases from dealer support", () => {
    const rules = resolveRoleScopeRulesFromNames(["Dealer Support"]);
    expect(rules.key).toBe("dealer-support");
    expect(rules.visibility).toEqual({
      showDealer: false,
      showOrganisation: true,
      showDatabase: false,
      showSite: true,
      showAsset: true
    });
    expect(rules.canAssignDatabase).toBe(false);
  });
});

describe("resolveRoleScopeRulesFromPrincipal", () => {
  it("keeps dealer support hierarchy when impersonating that account", () => {
    const rules = resolveRoleScopeRulesFromPrincipal({
      kind: "user",
      isDealerSupport: true,
      isOwnSupport: false,
      impersonatedBy: { kind: "admin", at: "2026-01-01T00:00:00.000Z" },
      roleNames: ["Dealer Support"]
    });
    expect(rules.key).toBe("dealer-support");
    expect(rules.visibility.showDatabase).toBe(false);
    expect(rules.visibility.showOrganisation).toBe(true);
    expect(rules.visibility.showDealer).toBe(false);
  });
});

describe("validateAssignmentDraft demo site", () => {
  it("allows a basic user to keep their site plus the shared Demo site", () => {
    expect(
      validateAssignmentDraft(
        "Basic User",
        ["sten-org:sten-dealer:sten-db", "custom-org:custom-dealer:demo-db"],
        ["sten-site", "custom-demo-site"],
        [
          { tenantId: "sten-org:sten-dealer:sten-db", siteId: "sten-site", siteName: "Sten" },
          { tenantId: "custom-org:custom-dealer:demo-db", siteId: "custom-demo-site", siteName: "Demo" }
        ]
      )
    ).toBeNull();
  });
});
