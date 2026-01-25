import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { manageNav, measureNav, monitorNav } from "../navData";

type Site = {
  id: string;
  name: string;
  assets: string[];
};

type Database = {
  id: string;
  name: string;
  sites: Site[];
};

type Organisation = {
  id: string;
  name: string;
  databases: Database[];
};

type Dealer = {
  id: string;
  name: string;
  organisations: Organisation[];
};

const rootLabel = "Organisation";
const rowActions = ["Duplicate", "Edit", "Suspend", "Revoke", "Assign", "Delete"];

const initialDealers: Dealer[] = [
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
              {
                id: "site-1",
                name: "CPP_TZ/Coating",
                assets: ["Maxus - T263EJC", "Maxus - T392EJE", "Maxus - T661EJC", "Maxus - T986EJB"]
              },
              {
                id: "site-2",
                name: "CPP_TZ/Telecom",
                assets: ["Ford - T295EEM", "Ford - T296EEM", "Ford - T306EEM"]
              }
            ]
          },
          {
            id: "db-2",
            name: "CPP_TZ/LOT2",
            sites: [
              {
                id: "site-3",
                name: "CPP_TZ/HQ",
                assets: ["Ford - T745EED", "Ford - T755EED", "GWM - T199EGH"]
              }
            ]
          }
        ]
      },
      {
        id: "org-2",
        name: "Africa - MixEA - Transfleet Services - AP",
        databases: [
          {
            id: "db-3",
            name: "CPP_TZ/Logistics",
            sites: [
              {
                id: "site-4",
                name: "CPP_TZ/Logistics",
                assets: ["Coaster - T390DQU No DMS", "Coaster - T750EMV No DMS"]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "dealer-2",
    name: "EA-Transfleet Services-Rwanda",
    organisations: [
      {
        id: "org-3",
        name: "Africa - MixEA - Transfleet Services - CPA",
        databases: [
          {
            id: "db-4",
            name: "CPP_RW/HQ",
            sites: [
              {
                id: "site-5",
                name: "CPP_RW/HQ",
                assets: ["Toyota - RWA 123A", "Toyota - RWA 552B"]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "dealer-3",
    name: "EA-Transfleet Services-Uganda",
    organisations: [
      {
        id: "org-4",
        name: "Africa - MixEA - Transfleet Services - CPP",
        databases: [
          {
            id: "db-5",
            name: "CPP_UG/HQ",
            sites: [
              {
                id: "site-6",
                name: "CPP_UG/Besoke Automotives",
                assets: ["Isuzu - UGA 221D", "Isuzu - UGA 229D"]
              }
            ]
          }
        ]
      }
    ]
  }
];

export function OrgRibbon() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageLabel = useMemo(() => {
    if (location.pathname === "/") return "Home";
    const navItems = [...monitorNav, ...manageNav, ...measureNav].flatMap((group) => group.items);
    const found = navItems.find((item) => item.path === location.pathname);
    if (found?.label) return found.label;
    const fallback = location.pathname.split("/").filter(Boolean).slice(-1)[0] ?? "";
    if (!fallback) return "Page";
    return fallback
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }, [location.pathname]);
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState(() => localStorage.getItem("vivi.selectedPath") ?? "");
  const [openActionRow, setOpenActionRow] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [dealerRows, setDealerRows] = useState<Dealer[]>(initialDealers);
  const [activeDealerId, setActiveDealerId] = useState<string>("");
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [activeDbId, setActiveDbId] = useState<string>("");
  const [activeSiteId, setActiveSiteId] = useState<string>("");
  const [activeAsset, setActiveAsset] = useState<string>("");
  const [activeScope, setActiveScope] = useState<"dealer" | "org" | "db" | "site" | "asset">("dealer");

  const activeDealer = useMemo(
    () => dealerRows.find((d) => d.id === activeDealerId),
    [activeDealerId, dealerRows]
  );
  const organisations = activeDealer?.organisations ?? [];
  const activeOrg = useMemo(
    () => organisations.find((o) => o.id === activeOrgId),
    [organisations, activeOrgId]
  );
  const databases = useMemo(() => {
    if (!activeDealer) return [] as Database[];
    if (activeScope === "dealer") {
      return organisations.flatMap((org) => org.databases);
    }
    if (activeScope === "org") {
      return activeOrg?.databases ?? [];
    }
    return activeOrg?.databases ?? [];
  }, [activeOrg, activeScope, organisations]);
  const activeDb = useMemo(
    () => databases.find((db) => db.id === activeDbId),
    [databases, activeDbId]
  );
  const sites = useMemo(() => {
    if (!activeDealer) return [] as Site[];
    if (activeScope === "dealer") {
      return organisations.flatMap((org) => org.databases).flatMap((db) => db.sites);
    }
    if (activeScope === "org") {
      return (activeOrg?.databases ?? []).flatMap((db) => db.sites);
    }
    if (activeScope === "db") {
      return activeDb?.sites ?? [];
    }
    return activeDb?.sites ?? [];
  }, [activeDb, activeOrg, activeScope, organisations]);
  const activeSite = useMemo(
    () => sites.find((site) => site.id === activeSiteId),
    [sites, activeSiteId]
  );
  const assets = useMemo(() => {
    if (!activeDealer) return [] as string[];
    if (activeScope === "dealer") {
      return activeDealer.organisations
        .flatMap((org) => org.databases)
        .flatMap((db) => db.sites)
        .flatMap((site) => site.assets ?? []);
    }
    if (activeScope === "org") {
      return (activeOrg?.databases ?? [])
        .flatMap((db) => db.sites)
        .flatMap((site) => site.assets ?? []);
    }
    if (activeScope === "db") {
      return (activeDb?.sites ?? []).flatMap((site) => site.assets ?? []);
    }
    return activeSite?.assets ?? [];
  }, [activeDealer, activeOrg, activeDb, activeSite, activeScope]);

  const findAssetLocation = (assetName: string) => {
    for (const dealer of dealerRows) {
      for (const org of dealer.organisations) {
        for (const db of org.databases) {
          for (const site of db.sites) {
            if (site.assets.includes(assetName)) {
              return {
                dealerId: dealer.id,
                orgId: org.id,
                dbId: db.id,
                siteId: site.id
              };
            }
          }
        }
      }
    }
    return null;
  };

  const draftPath = useMemo(() => {
    const parts: string[] = [];
    if (activeDealer?.name) parts.push(activeDealer.name);
    if (activeScope === "dealer") return parts.join(" / ");
    if (activeOrg?.name) parts.push(activeOrg.name);
    if (activeScope === "org") return parts.join(" / ");
    if (activeDb?.name) parts.push(activeDb.name);
    if (activeScope === "db") return parts.join(" / ");
    if (activeSite?.name) parts.push(activeSite.name);
    if (activeScope === "asset" && activeAsset) {
      parts.push(activeAsset);
    }
    return parts.filter(Boolean).join(" / ");
  }, [activeDealer, activeOrg, activeDb, activeSite, activeAsset, activeScope]);
  const ribbonPath = selectedPath || "Select organisation";

  const canSelect = useMemo(() => {
    if (activeScope === "dealer") return Boolean(activeDealerId);
    if (activeScope === "org") return Boolean(activeOrgId);
    if (activeScope === "db") return Boolean(activeDbId);
    if (activeScope === "site") return Boolean(activeSiteId);
    return Boolean(activeAsset);
  }, [activeDealerId, activeOrgId, activeDbId, activeSiteId, activeAsset, activeScope]);

  const handleAction = (action: string, label: string) => {
    const message = `${action} on ${label}`;
    setLastAction(message);
    setOpenActionRow(null);
    console.info(message);
  };

  const handleAdd = (scope: string) => {
    if (scope === "dealer") {
      setOrgModalOpen(false);
      navigate("/manage/operations/dealer-administration");
      return;
    }
    const message = `Add ${scope}`;
    setLastAction(message);
    console.info(message);
  };

  return (
    <>
      <div className="org-ribbon" onClick={() => setOrgModalOpen(true)}>
        <div className="org-ribbon-left">
          <span className="org-ribbon-label">{pageLabel}</span>
          <span className="org-ribbon-divider" />
          <span className="org-ribbon-path">{ribbonPath}</span>
        </div>
        <div className="org-ribbon-action">Switch organisation</div>
      </div>

      {orgModalOpen && (
        <div className="org-modal">
          <div className="org-modal-backdrop" onClick={() => setOrgModalOpen(false)} />
          <div className="org-modal-card">
            <header className="org-modal-header">
              <div>
                <div className="util-eyebrow">Select asset</div>
                <div className="org-modal-path">{rootLabel}</div>
              </div>
              <div className="org-modal-toolbar">
                <input className="org-search" placeholder="Search" aria-label="Search assets" />
              </div>
              <button className="org-close" onClick={() => setOrgModalOpen(false)} aria-label="Close">
                ×
              </button>
            </header>

            <div className="org-modal-body">
              <div className="org-column">
                <div className="org-column-title">
                  <span>Dealers</span>
                  <button className="org-column-add" type="button" onClick={() => handleAdd("dealer")}
                  >
                    Add
                  </button>
                </div>
                <div className="org-list">
                  {dealerRows.map((dealer) => (
                    <div key={dealer.id} className={`org-row ${dealer.id === activeDealerId ? "active" : ""}`}>
                      <button
                        className="org-row-main"
                        onClick={() => {
                          setActiveDealerId(dealer.id);
                          setActiveOrgId("");
                          setActiveDbId("");
                          setActiveSiteId("");
                          setActiveAsset("");
                          setActiveScope("dealer");
                        }}
                      >
                        <span className="org-icon" aria-hidden="true">
                          🧭
                        </span>
                        <span className="org-name">{dealer.name}</span>
                        <span className="org-caret">›</span>
                      </button>
                      <div className="org-row-actions">
                        <button
                          className="org-action-trigger"
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionRow(openActionRow === dealer.id ? null : dealer.id);
                          }}
                        >
                          ⋯
                        </button>
                        {openActionRow === dealer.id && (
                          <div className="org-action-menu">
                            {rowActions.map((action) => (
                              <button
                                key={action}
                                className="org-action-item"
                                type="button"
                                onClick={() => handleAction(action, dealer.name)}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="org-column">
                <div className="org-column-title">
                  <span>Organisations</span>
                  <button className="org-column-add" type="button" onClick={() => handleAdd("organisation")}
                  >
                    Add
                  </button>
                </div>
                <div className="org-list">
                  {organisations.length === 0 && <div className="org-empty">No organisations available.</div>}
                  {organisations.map((org) => (
                    <div key={org.id} className={`org-row ${org.id === activeOrgId ? "active" : ""}`}>
                      <button
                        className="org-row-main"
                        onClick={() => {
                          setActiveOrgId(org.id);
                          setActiveDbId("");
                          setActiveSiteId("");
                          setActiveAsset("");
                          setActiveScope("org");
                        }}
                      >
                        <span className="org-icon" aria-hidden="true">
                          🏢
                        </span>
                        <span className="org-name">{org.name}</span>
                        <span className="org-caret">›</span>
                      </button>
                      <div className="org-row-actions">
                        <button
                          className="org-action-trigger"
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionRow(openActionRow === org.id ? null : org.id);
                          }}
                        >
                          ⋯
                        </button>
                        {openActionRow === org.id && (
                          <div className="org-action-menu">
                            {rowActions.map((action) => (
                              <button
                                key={action}
                                className="org-action-item"
                                type="button"
                                onClick={() => handleAction(action, org.name)}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="org-column">
                <div className="org-column-title">
                  <span>Databases</span>
                  <button className="org-column-add" type="button" onClick={() => handleAdd("database")}
                  >
                    Add
                  </button>
                </div>
                <div className="org-list">
                  {databases.length === 0 && <div className="org-empty">No databases available.</div>}
                  {databases.map((db) => (
                    <div key={db.id} className={`org-row ${db.id === activeDbId ? "active" : ""}`}>
                      <button
                        className="org-row-main"
                        onClick={() => {
                          setActiveDbId(db.id);
                          setActiveSiteId("");
                          setActiveAsset("");
                          setActiveScope("db");
                        }}
                      >
                        <span className="org-icon" aria-hidden="true">
                          🗄️
                        </span>
                        <span className="org-name">{db.name}</span>
                        <span className="org-caret">›</span>
                      </button>
                      <div className="org-row-actions">
                        <button
                          className="org-action-trigger"
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionRow(openActionRow === db.id ? null : db.id);
                          }}
                        >
                          ⋯
                        </button>
                        {openActionRow === db.id && (
                          <div className="org-action-menu">
                            {rowActions.map((action) => (
                              <button
                                key={action}
                                className="org-action-item"
                                type="button"
                                onClick={() => handleAction(action, db.name)}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="org-column">
                <div className="org-column-title">
                  <span>Sites</span>
                  <button className="org-column-add" type="button" onClick={() => handleAdd("site")}
                  >
                    Add
                  </button>
                </div>
                <div className="org-list">
                  {sites.length === 0 && <div className="org-empty">No sites available.</div>}
                  {sites.map((site) => (
                    <div key={site.id} className={`org-row ${site.id === activeSiteId ? "active" : ""}`}>
                      <button
                        className="org-row-main"
                        onClick={() => {
                          setActiveSiteId(site.id);
                          setActiveAsset("");
                          setActiveScope("site");
                        }}
                      >
                        <span className="org-icon" aria-hidden="true">
                          📍
                        </span>
                        <span className="org-name">{site.name}</span>
                        <span className="org-caret">›</span>
                      </button>
                      <div className="org-row-actions">
                        <button
                          className="org-action-trigger"
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionRow(openActionRow === site.id ? null : site.id);
                          }}
                        >
                          ⋯
                        </button>
                        {openActionRow === site.id && (
                          <div className="org-action-menu">
                            {rowActions.map((action) => (
                              <button
                                key={action}
                                className="org-action-item"
                                type="button"
                                onClick={() => handleAction(action, site.name)}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="org-column">
                <div className="org-column-title">
                  <span>Assets</span>
                  <button className="org-column-add" type="button" onClick={() => handleAdd("asset")}
                  >
                    Add
                  </button>
                </div>
                <div className="org-list">
                  {assets.length === 0 && <div className="org-empty">No assets available.</div>}
                  {assets.map((asset) => (
                    <div key={asset} className={`org-row org-row-asset ${asset === activeAsset ? "active" : ""}`}>
                      <button
                        className="org-row-main"
                        onClick={() => {
                          setActiveAsset(asset);
                          setActiveScope("asset");
                          const location = findAssetLocation(asset);
                          if (location) {
                            setActiveDealerId(location.dealerId);
                            setActiveOrgId(location.orgId);
                            setActiveDbId(location.dbId);
                            setActiveSiteId(location.siteId);
                          }
                        }}
                      >
                        <span className="org-icon" aria-hidden="true">
                          🚚
                        </span>
                        <span className="org-name">{asset}</span>
                      </button>
                      <div className="org-row-actions">
                        <button
                          className="org-action-trigger"
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionRow(openActionRow === asset ? null : asset);
                          }}
                        >
                          ⋯
                        </button>
                        {openActionRow === asset && (
                          <div className="org-action-menu">
                            {rowActions.map((action) => (
                              <button
                                key={action}
                                className="org-action-item"
                                type="button"
                                onClick={() => handleAction(action, asset)}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <footer className="org-modal-footer">
              <div className="org-footer-path">
                {draftPath}
                {lastAction && <span className="org-action-status">Last action: {lastAction}</span>}
              </div>
              <div className="org-actions">
                <button className="btn ghost" onClick={() => setOrgModalOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    const assetLabel = activeScope === "asset" ? activeAsset ?? "" : "";
                    const registration = assetLabel.includes(" - ")
                      ? assetLabel.split(" - ").slice(-1)[0]
                      : assetLabel;
                    const dbSites = (activeDb?.sites ?? []).map((site) => site.name);
                    const tenantId = [activeDealer?.id, activeOrg?.id, activeDb?.id, activeSite?.id]
                      .filter(Boolean)
                      .join(":") || "demo-tenant";
                    localStorage.setItem("vivi.tenantId", tenantId);
                    localStorage.setItem("vivi.activeSite", activeSite?.name ?? "");
                    localStorage.setItem("vivi.activeAsset", assetLabel);
                    localStorage.setItem("vivi.activeRegistration", registration ?? "");
                    localStorage.setItem("vivi.activeDbId", activeDb?.id ?? "");
                    localStorage.setItem("vivi.activeDbSites", JSON.stringify(dbSites));
                    localStorage.setItem("vivi.selectedPath", draftPath);
                    setSelectedPath(draftPath);
                    window.dispatchEvent(new Event("vivi:orgchange"));
                    setOrgModalOpen(false);
                  }}
                  disabled={!canSelect}
                >
                  Select
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

    </>
  );
}

export default OrgRibbon;
