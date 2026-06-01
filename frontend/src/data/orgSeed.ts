import type { OrgDealer } from "../types/org";

/** Default hierarchy used when nothing is stored yet (matches OrgRibbon seed). */
export const seedOrgDealers: OrgDealer[] = [
  {
    id: "dealer-1",
    name: "EA-Transfleet Services-Tanzania",
    organisations: [
      {
        id: "org-1",
        name: "Africa - MixEA - Transfleet Services - EAC",
        databases: [
          {
            id: "db-1",
            name: "CPP_TZ/HQ",
            sites: [
              { id: "site-1", name: "CPP_TZ/Coating", assets: [] },
              { id: "site-2", name: "CPP_TZ/Telecom", assets: [] }
            ]
          },
          {
            id: "db-2",
            name: "CPP_TZ/LOT2",
            sites: [{ id: "site-3", name: "CPP_TZ/HQ", assets: [] }]
          }
        ]
      }
    ]
  }
];
