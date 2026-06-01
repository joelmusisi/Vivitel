import { useMemo } from "react";
import type { OrgDealer } from "../types/org";
import type { UserScopes } from "../utils/accessControl";

type Props = {
  dealers: OrgDealer[];
  scopes: UserScopes & { allowAll?: boolean };
  disabled?: boolean;
  onChange: (next: UserScopes & { allowAll?: boolean }) => void;
};

const toggle = (list: string[], id: string, on: boolean) => {
  const set = new Set(list);
  if (on) set.add(id);
  else set.delete(id);
  return Array.from(set);
};

export function ScopeTreePicker({ dealers, scopes, disabled, onChange }: Props) {
  const summary = useMemo(() => {
    const parts = [
      scopes.dealerIds.length ? `${scopes.dealerIds.length} dealers` : "",
      scopes.orgIds.length ? `${scopes.orgIds.length} orgs` : "",
      scopes.databaseIds.length ? `${scopes.databaseIds.length} databases` : "",
      scopes.siteIds.length ? `${scopes.siteIds.length} sites` : ""
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : "No scope assigned";
  }, [scopes]);

  return (
    <div className="admin-modal-field" style={{ gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Organisation scope (privacy)</span>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={Boolean(scopes.allowAll)}
            disabled={disabled}
            onChange={(e) => onChange({ ...scopes, allowAll: e.target.checked })}
          />
          Full access (admin)
        </label>
      </div>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{summary}</div>
      {!scopes.allowAll && (
        <div
          className="admin-permissions"
          style={{ maxHeight: 280, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}
        >
          {dealers.map((dealer) => (
            <div key={dealer.id} style={{ marginBottom: 10 }}>
              <label className="admin-permission-item">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={scopes.dealerIds.includes(dealer.id)}
                  onChange={(e) =>
                    onChange({ ...scopes, dealerIds: toggle(scopes.dealerIds, dealer.id, e.target.checked) })
                  }
                />
                <strong>Dealer:</strong> {dealer.name}
              </label>
              {dealer.organisations.map((org) => (
                <div key={org.id} style={{ marginLeft: 16 }}>
                  <label className="admin-permission-item">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={scopes.orgIds.includes(org.id)}
                      onChange={(e) =>
                        onChange({ ...scopes, orgIds: toggle(scopes.orgIds, org.id, e.target.checked) })
                      }
                    />
                    Org: {org.name}
                  </label>
                  {org.databases.map((db) => (
                    <div key={db.id} style={{ marginLeft: 16 }}>
                      <label className="admin-permission-item">
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={scopes.databaseIds.includes(db.id)}
                          onChange={(e) =>
                            onChange({
                              ...scopes,
                              databaseIds: toggle(scopes.databaseIds, db.id, e.target.checked)
                            })
                          }
                        />
                        Database: {db.name}
                      </label>
                      {db.sites.map((site) => (
                        <div key={site.id} style={{ marginLeft: 16 }}>
                          <label className="admin-permission-item">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={scopes.siteIds.includes(site.id)}
                              onChange={(e) =>
                                onChange({
                                  ...scopes,
                                  siteIds: toggle(scopes.siteIds, site.id, e.target.checked)
                                })
                              }
                            />
                            Site: {site.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
