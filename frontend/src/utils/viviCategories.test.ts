import { describe, expect, it } from "vitest";
import {
  buildViviCategoryTree,
  buildViviOrgCategory,
  createHierarchyArranger,
  flattenHierarchyInTreeOrder,
  flattenViviCategoryTree,
  groupSitesByFamily,
  parseViviSiteLabel
} from "./viviCategories";

describe("viviCategories", () => {
  it("parses Family/Site labels", () => {
    expect(parseViviSiteLabel("CPP_TZ/Coating")).toEqual({
      siteFamily: "CPP_TZ",
      site: "Coating",
      siteFull: "CPP_TZ/Coating"
    });
  });

  it("parses known family prefixes without slash", () => {
    expect(parseViviSiteLabel("EACOP_TZ Yard")).toEqual({
      siteFamily: "EACOP_TZ",
      site: "Yard",
      siteFull: "EACOP_TZ Yard"
    });
  });

  it("keeps plain site names ungrouped", () => {
    expect(parseViviSiteLabel("Azan Logistic")).toEqual({
      siteFamily: "",
      site: "Azan Logistic",
      siteFull: "Azan Logistic"
    });
  });

  it("builds breadcrumb categories", () => {
    const cat = buildViviOrgCategory({
      dealer: "Africa Org",
      organisation: "Transfleet",
      database: "EACOP Tanzania",
      siteFull: "CPP_TZ/Coating"
    });
    expect(cat.siteFamily).toBe("CPP_TZ");
    expect(cat.site).toBe("Coating");
    expect(cat.breadcrumb).toBe("Africa Org · Transfleet · EACOP Tanzania · CPP_TZ · Coating");
  });

  it("builds a category tree with site families", () => {
    const tree = buildViviCategoryTree([
      {
        id: "d1",
        name: "Org A",
        organisations: [
          {
            id: "o1",
            name: "Dealer A",
            databases: [
              {
                id: "db1",
                name: "Project DB",
                sites: [
                  { id: "s1", name: "CPP_TZ/Coating" },
                  { id: "s2", name: "CPP_TZ/Yard" },
                  { id: "s3", name: "Plain Site" },
                  { id: "s4", name: "XN_Decommissioned" }
                ]
              }
            ]
          }
        ]
      }
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].level).toBe("organisation");
    const db = tree[0].children[0].children[0];
    expect(db.level).toBe("database");
    expect(db.children.map((c) => c.level).sort()).toEqual(["site", "siteFamily"]);
    const family = db.children.find((c) => c.level === "siteFamily");
    expect(family?.label).toBe("CPP_TZ");
    expect(family?.children).toHaveLength(2);

    const flat = flattenViviCategoryTree(tree);
    expect(flat.some((r) => r.siteFull === "CPP_TZ/Coating")).toBe(true);
    expect(flat.some((r) => r.site === "Plain Site")).toBe(true);
    expect(flat.some((r) => /decommission/i.test(r.siteFull))).toBe(false);
  });

  it("keeps the operator's stored tree order when arranging records", () => {
    const dealers = [
      {
        id: "d1",
        name: "Africa Org",
        organisations: [
          {
            id: "o1",
            name: "Rimam",
            databases: [
              {
                id: "db1",
                name: "Fleet",
                sites: [
                  { id: "s1", name: "RIMAM BEV" },
                  { id: "s2", name: "MMAULI CO" }
                ]
              }
            ]
          }
        ]
      }
    ];
    const flat = flattenHierarchyInTreeOrder(dealers);
    expect(flat.map((row) => row.site)).toEqual(["RIMAM BEV", "MMAULI CO"]);

    const arranged = createHierarchyArranger(dealers).sort([
      { site: "MMAULI CO", assetDescription: "UA 81 TEC" },
      { site: "RIMAM BEV", assetDescription: "AR 02 CH" },
      { site: "MMAULI CO", assetDescription: "UA 82 EEC" },
      { site: "WILDLIFE", assetDescription: "UA 956 EW" }
    ]);
    expect(arranged.map((row) => `${row.site}:${row.assetDescription}`)).toEqual([
      "RIMAM BEV:AR 02 CH",
      "MMAULI CO:UA 81 TEC",
      "MMAULI CO:UA 82 EEC",
      "WILDLIFE:UA 956 EW"
    ]);
  });

  it("groups sites by family for OrgRibbon", () => {
    const groups = groupSitesByFamily([
      { id: "1", name: "CPP_TZ/Coating" },
      { id: "2", name: "CPP_TZ/Yard" },
      { id: "3", name: "North" }
    ]);
    expect(groups).toEqual([
      {
        family: "CPP_TZ",
        sites: [
          { id: "1", name: "CPP_TZ/Coating" },
          { id: "2", name: "CPP_TZ/Yard" }
        ]
      },
      { family: "", sites: [{ id: "3", name: "North" }] }
    ]);
  });
});
