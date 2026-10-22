import { describe, expect, it } from "vitest";
import { sharedDemoPathFromHierarchy } from "./regionHierarchy";

describe("sharedDemoPathFromHierarchy", () => {
  it("uses the Demo tree even when its ids are not the built-in ones", () => {
    expect(
      sharedDemoPathFromHierarchy({
        dealers: [
          {
            id: "org-created",
            name: "Demo",
            organisations: [
              {
                id: "dealer-created",
                name: "Demo",
                databases: [
                  {
                    id: "db-created",
                    name: "Demo",
                    sites: [{ id: "site-created", name: "Demo" }]
                  }
                ]
              }
            ]
          }
        ]
      })
    ).toEqual({
      tenantId: "org-created:dealer-created:db-created",
      siteId: "site-created",
      siteName: "Demo"
    });
  });
});
