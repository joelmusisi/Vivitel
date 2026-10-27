import { describe, expect, it } from "vitest";
import {
  extractZaHierarchy,
  filterDealerRowsForActiveRegion,
  filterHierarchyForRegion,
  isLegacyFlatTenantId,
  personalAssignmentScope,
  stripZaHierarchy
} from "./regionHierarchy";

const tree = {
  updatedAt: "2026-09-25T00:00:00.000Z",
  dealers: [
    {
      id: "southern",
      name: "SOUTHERN AFRICA",
      organisations: [
        {
          id: "ea-ops",
          name: "EAST AFRICA Ops",
          databases: [{ id: "rda", name: "RDA VIVITEL V110", sites: [{ id: "default", name: "Default" }] }]
        }
      ]
    },
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
              sites: [
                { id: "karongo", name: "Karongo" },
                { id: "other", name: "Kampala" }
              ]
            },
            { id: "fleet", name: "Fleet DB", sites: [{ id: "mm", name: "MMULU" }] }
          ]
        },
        {
          id: "west",
          name: "West Desk",
          databases: [{ id: "wdb", name: "West DB", sites: [{ id: "accra", name: "Accra" }] }]
        }
      ]
    },
    {
      id: "europe",
      name: "EUROPE",
      organisations: [
        {
          id: "eu",
          name: "EU Ops",
          databases: [{ id: "eu-db", name: "EU DB", sites: [{ id: "lon", name: "London" }] }]
        }
      ]
    }
  ]
};

describe("filterHierarchyForRegion", () => {
  it("keeps only Advanced Securities / Karongo on the ZA server", () => {
    const filtered = filterHierarchyForRegion(tree, "za");
    expect(filtered.dealers.map((dealer) => dealer.name)).toEqual(["Demo", "AFRICA"]);
    const demo = filtered.dealers.find((dealer) => dealer.name === "Demo");
    expect(demo?.organisations?.[0]?.name).toBe("Demo");
    expect(demo?.organisations?.[0]?.databases?.[0]?.name).toBe("Demo");
    expect(demo?.organisations?.[0]?.databases?.[0]?.sites?.[0]?.name).toBe("Demo");
    const org = filtered.dealers.find((dealer) => dealer.name === "AFRICA")?.organisations?.[0];
    expect(org?.name).toBe("EAST AFRICA");
    expect(org?.databases?.map((database) => database.name)).toEqual(["Advanced Securities"]);
    expect(org?.databases?.[0]?.sites?.map((site) => site.name)).toEqual(["Karongo"]);
  });

  it("gives UK, US, Enterprise, and UAE the rest of the fleet", () => {
    for (const region of ["uk", "us", "ent", "ae"]) {
      const filtered = filterHierarchyForRegion(tree, region);
      expect(filtered.dealers.map((dealer) => dealer.name)).toEqual(["Demo", "SOUTHERN AFRICA", "AFRICA", "EUROPE"]);
      const east = filtered.dealers.find((dealer) => dealer.name === "AFRICA")?.organisations?.find((org) => org.name === "EAST AFRICA");
      expect(east?.databases?.map((database) => database.name)).toEqual(["Fleet DB"]);
      expect(filterDealerRowsForActiveRegion(tree.dealers, region).some((dealer) => dealer.name === "SOUTHERN AFRICA")).toBe(true);
    }
  });

  it("keeps a newly created organisation before it has dealers", () => {
    const filtered = filterHierarchyForRegion(
      {
        dealers: [{ id: "new-org", name: "Northstar", organisations: [] }]
      },
      "us"
    );
    expect(filtered.dealers.map((dealer) => dealer.name)).toEqual(["Demo", "Northstar"]);
  });

  it("keeps a newly created dealer before it has databases", () => {
    const filtered = filterHierarchyForRegion(
      {
        dealers: [
          {
            id: "us-org",
            name: "North America",
            organisations: [
              { id: "new-dealer", name: "Lakes", databases: [] },
              {
                id: "us-dealer",
                name: "Midwest",
                databases: [{ id: "us-db", name: "Fleet", sites: [{ id: "chi", name: "Chicago" }] }]
              }
            ]
          }
        ]
      },
      "us"
    );
    const northAmerica = filtered.dealers.find((dealer) => dealer.name === "North America");
    expect(northAmerica?.organisations?.map((org) => org.name)).toEqual(["Lakes", "Midwest"]);
  });

  it("still hides an organisation whose only fleet is Karongo", () => {
    const filtered = filterHierarchyForRegion(
      {
        dealers: [
          {
            id: "za-only",
            name: "ZA Only",
            organisations: [
              {
                id: "za-dealer",
                name: "ZA Dealer",
                databases: [{ id: "adv", name: "Advanced Securities", sites: [{ id: "k", name: "Karongo" }] }]
              }
            ]
          }
        ]
      },
      "uk"
    );
    expect(filtered.dealers.some((dealer) => dealer.name === "ZA Only")).toBe(false);
  });

  it("keeps a US organisation that is not part of the South Africa fleet", () => {
    const filtered = filterHierarchyForRegion(
      {
        dealers: [
          {
            id: "us-org",
            name: "North America",
            organisations: [
              {
                id: "us-dealer",
                name: "Midwest",
                databases: [{ id: "us-db", name: "Fleet", sites: [{ id: "chi", name: "Chicago" }] }]
              }
            ]
          }
        ]
      },
      "us"
    );
    expect(filtered.dealers.map((dealer) => dealer.name)).toEqual(["Demo", "North America"]);
    const northAmerica = filtered.dealers.find((dealer) => dealer.name === "North America");
    expect(northAmerica?.organisations?.[0]?.databases?.[0]?.sites?.map((site) => site.name)).toEqual(["Chicago"]);
  });

  it("extracts and strips the ZA Karongo branch for migration", () => {
    const za = extractZaHierarchy(tree);
    const us = stripZaHierarchy(tree);
    const africa = za.dealers.find((dealer) => dealer.name === "AFRICA");
    expect(africa?.organisations?.[0]?.databases?.[0]?.sites?.map((site) => site.name)).toEqual(["Karongo"]);
    expect(za.dealers.some((dealer) => dealer.name === "Demo")).toBe(true);
    expect(
      us.dealers
        .find((dealer) => dealer.name === "AFRICA")
        ?.organisations?.find((org) => org.name === "EAST AFRICA")
        ?.databases?.map((database) => database.name)
    ).toEqual(["Fleet DB"]);
  });

  it("keeps a basic user's own site when the shared Demo site is also assigned", () => {
    expect(
      personalAssignmentScope(
        ["sten-org:sten-dealer:sten-db", "demo-organisation:demo-dealer:demo-database"],
        ["sten-site", "demo-site"]
      )
    ).toEqual({
      tenantIds: ["sten-org:sten-dealer:sten-db"],
      siteIds: ["sten-site"]
    });
  });

  it("treats west-africa as a legacy flat tenant, not a Demo database", () => {
    expect(isLegacyFlatTenantId("west-africa")).toBe(true);
    expect(isLegacyFlatTenantId("demo-organisation:demo-dealer:demo-database")).toBe(false);
  });
});
