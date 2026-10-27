import { describe, expect, it } from "vitest";
import {
  collectAssignmentTenantIds,
  filterDatabasesForAssignee,
  filterSitesForAssignee,
  resolveEditSaveTenantId
} from "./userAssignmentScope";
import type { DatabaseOption, SiteOption } from "./types";

const dbs: DatabaseOption[] = [
  { id: "db1", name: "DB 1", dealerId: "d1", orgId: "o1", tenantId: "d1:o1:db1" },
  { id: "db2", name: "DB 2", dealerId: "d1", orgId: "o2", tenantId: "d1:o2:db2" },
  { id: "db3", name: "DB 3", dealerId: "d2", orgId: "o3", tenantId: "d2:o3:db3" }
];

const sites: SiteOption[] = [
  { id: "s1", name: "S1", dealerId: "d1", orgId: "o1", dbId: "db1", tenantId: "d1:o1:db1" },
  { id: "s2", name: "S2", dealerId: "d1", orgId: "o2", dbId: "db2", tenantId: "d1:o2:db2" },
  { id: "s3", name: "S3", dealerId: "d2", orgId: "o3", dbId: "db3", tenantId: "d2:o3:db3" }
];

describe("filterDatabasesForAssignee", () => {
  it("shows every database when dealer and organisation pickers are hidden (advanced user)", () => {
    expect(
      filterDatabasesForAssignee(dbs, ["d1"], ["o1"], {
        showAssignDealer: false,
        showAssignOrganisation: false,
        showAssignDatabase: true
      }).map((row) => row.id)
    ).toEqual(["db1", "db2", "db3"]);
  });

  it("limits databases to selected dealers when the dealer picker is visible", () => {
    expect(
      filterDatabasesForAssignee(dbs, ["d2"], [], {
        showAssignDealer: true,
        showAssignOrganisation: false,
        showAssignDatabase: true
      }).map((row) => row.id)
    ).toEqual(["db3"]);
  });
});

describe("filterSitesForAssignee", () => {
  it("lists sites under selected dealers when organisation and database pickers are hidden", () => {
    expect(
      filterSitesForAssignee(sites, ["d1"], [], ["db1", "db2"], {
        showAssignDealer: true,
        showAssignOrganisation: false,
        showAssignDatabase: false
      }).map((row) => row.id)
    ).toEqual(["s1", "s2"]);
  });

  it("lists sites for selected databases across organisations when dealer/org pickers are hidden", () => {
    expect(
      filterSitesForAssignee(sites, ["d1"], ["o1"], ["db1", "db2"], {
        showAssignDealer: false,
        showAssignOrganisation: false,
        showAssignDatabase: true
      }).map((row) => row.id)
    ).toEqual(["s1", "s2"]);
  });
});

describe("collectAssignmentTenantIds", () => {
  it("keeps selected databases and sites for advanced users", () => {
    expect(
      collectAssignmentTenantIds({
        selectedTenantIds: ["d1:o2:db2"],
        siteTenantIds: ["d1:o1:db1"],
        dealerScopedTenantIds: ["d1:o1:db1", "d1:o2:db2"],
        orgScopedTenantIds: [],
        selectedDealerIds: ["d1"],
        selectedOrgIds: ["o1"],
        flags: { showAssignDealer: false, showAssignOrganisation: false, showAssignDatabase: true }
      })
    ).toEqual(["d1:o2:db2", "d1:o1:db1"]);
  });

  it("assigns every database under selected dealers for dealer support", () => {
    expect(
      collectAssignmentTenantIds({
        selectedTenantIds: [],
        siteTenantIds: ["d1:o1:db1"],
        dealerScopedTenantIds: ["d1:o1:db1", "d1:o2:db2"],
        orgScopedTenantIds: [],
        selectedDealerIds: ["d1"],
        selectedOrgIds: [],
        flags: { showAssignDealer: true, showAssignOrganisation: false, showAssignDatabase: false }
      })
    ).toEqual(["d1:o1:db1", "d1:o2:db2"]);
  });
});

describe("resolveEditSaveTenantId", () => {
  it("keeps the user on their existing tenant so extra assignments can be written", () => {
    expect(
      resolveEditSaveTenantId({
        editingUserTenantId: "d1:o1:db1",
        activeTenantId: "d1:o1:db1",
        resolvedRoleTenantId: "d1:o2:db2",
        assignmentTenantIds: ["d1:o2:db2", "d1:o1:db1"],
        siteTenantIds: ["d1:o2:db2"]
      })
    ).toBe("d1:o1:db1");
  });
});
