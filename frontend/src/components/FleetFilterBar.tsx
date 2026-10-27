import { useMemo } from "react";
import { useDbProfileOptional } from "../contexts/DbProfileContext";
import { useFleetFilterOptional } from "../contexts/FleetFilterContext";
import { readScopeNaming } from "../utils/selectionScope";

type FleetFilterBarProps = {
  /** Available site names for multi-select (usually sites in the active DB). */
  siteOptions?: string[];
  /** Available asset regs/ids for multi-select. */
  assetOptions?: string[];
  /** Shown when the asset list is empty, for example until a site is selected. */
  assetEmptyLabel?: string;
  /** Only list assets passed in. Selected assets from other sites stay hidden. */
  restrictAssetsToOptions?: boolean;
  /** Only list sites passed in. Selected sites outside this list stay hidden. */
  restrictSitesToOptions?: boolean;
  /** Show Analyze database profile switcher. */
  showDbProfile?: boolean;
  className?: string;
};

/**
 * Compact Mix-style fleet filter strip for Track / Analyze pages.
 * Control settings pages should keep strict single-site OrgRibbon isolation.
 */
export function FleetFilterBar({
  siteOptions = [],
  assetOptions = [],
  assetEmptyLabel,
  restrictAssetsToOptions = false,
  restrictSitesToOptions = false,
  showDbProfile = false,
  className = ""
}: FleetFilterBarProps) {
  const fleet = useFleetFilterOptional();
  const dbProfile = useDbProfileOptional();
  const naming = useMemo(() => readScopeNaming(), [fleet?.selectedSites, dbProfile?.selectedDb]);

  if (!fleet) return null;

  const allowedSiteKeys = new Set(siteOptions.map((site) => String(site ?? "").trim().toLowerCase()).filter(Boolean));
  const sites = Array.from(
    new Set(
      (restrictSitesToOptions ? siteOptions : [...siteOptions, ...fleet.selectedSites])
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const visibleSelectedSites = restrictSitesToOptions
    ? fleet.selectedSites.filter((site) => allowedSiteKeys.has(String(site ?? "").trim().toLowerCase()))
    : fleet.selectedSites;

  const allowedAssets = new Set(assetOptions.map((asset) => String(asset ?? "").trim()).filter(Boolean));
  const assets = Array.from(
    new Set(
      (restrictAssetsToOptions ? assetOptions : [...assetOptions, ...fleet.selectedAssets])
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const visibleSelectedAssets = restrictAssetsToOptions
    ? fleet.selectedAssets.filter((asset) => allowedAssets.has(asset))
    : fleet.selectedAssets;

  const toggleInList = (
    list: string[],
    setList: (next: string[] | ((prev: string[]) => string[])) => void,
    value: string
  ) => {
    const token = String(value ?? "").trim();
    if (!token) return;
    if (list.includes(token)) setList(list.filter((x) => x !== token));
    else setList([...list, token]);
  };

  return (
    <div className={`fleet-filter-bar ${className}`.trim()} role="region" aria-label="Fleet filters">
      <div className="fleet-filter-bar__meta">
        <span className="fleet-filter-bar__eyebrow">Fleet scope</span>
        <strong>{naming.label || dbProfile?.dbLabel || "Active database"}</strong>
      </div>

      {showDbProfile && dbProfile && dbProfile.dbOptions.length > 0 && (
        <label className="fleet-filter-bar__field">
          <span>Database</span>
          <select
            value={
              dbProfile.selectedDb === "__current__"
                ? dbProfile.activeOption?.key || "__current__"
                : dbProfile.selectedDb
            }
            onChange={(e) => dbProfile.setSelectedDb(e.target.value)}
          >
            <option value="__current__">Current database</option>
            {dbProfile.dbOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="fleet-filter-bar__field">
        <span>Sites ({(restrictSitesToOptions ? visibleSelectedSites.length : fleet.selectedSites.length) || "all"})</span>
        <select
          value=""
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            toggleInList(fleet.selectedSites, fleet.setSelectedSites, value);
            e.target.value = "";
          }}
        >
          <option value="">Add site filter…</option>
          {sites.map((site) => (
            <option key={site} value={site}>
              {fleet.selectedSites.includes(site) ? `✓ ${site}` : site}
            </option>
          ))}
        </select>
      </label>

      <label className="fleet-filter-bar__field">
        <span>Assets ({(restrictAssetsToOptions ? visibleSelectedAssets.length : fleet.selectedAssets.length) || "all"})</span>
        <select
          value=""
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            toggleInList(fleet.selectedAssets, fleet.setSelectedAssets, value);
            e.target.value = "";
          }}
        >
          <option value="">Add asset filter…</option>
          {assets.length === 0 && assetEmptyLabel ? (
            <option value="__site_required__" disabled>{assetEmptyLabel}</option>
          ) : null}
          {assets.map((asset) => (
            <option key={asset} value={asset}>
              {fleet.selectedAssets.includes(asset) ? `✓ ${asset}` : asset}
            </option>
          ))}
        </select>
      </label>

      <label className="fleet-filter-bar__field fleet-filter-bar__field--mode">
        <span>Mode</span>
        <select
          value={fleet.entityMode}
          onChange={(e) => fleet.setEntityMode(e.target.value === "driver" ? "driver" : "asset")}
        >
          <option value="asset">Assets</option>
          <option value="driver">Drivers</option>
        </select>
      </label>

      <div className="fleet-filter-bar__chips">
        {visibleSelectedSites.map((site) => (
          <button
            key={`site:${site}`}
            type="button"
            className="fleet-filter-bar__chip"
            onClick={() => fleet.setSelectedSites((prev) => prev.filter((x) => x !== site))}
          >
            Site: {site} ×
          </button>
        ))}
        {visibleSelectedAssets.map((asset) => (
          <button
            key={`asset:${asset}`}
            type="button"
            className="fleet-filter-bar__chip"
            onClick={() => fleet.setSelectedAssets((prev) => prev.filter((x) => x !== asset))}
          >
            Asset: {asset} ×
          </button>
        ))}
      </div>

      {((restrictSitesToOptions ? visibleSelectedSites.length : fleet.selectedSites.length) > 0
        || (restrictAssetsToOptions ? visibleSelectedAssets.length : fleet.selectedAssets.length) > 0) && (
        <button type="button" className="btn ghost fleet-filter-bar__clear" onClick={fleet.clearAll}>
          Clear filters
        </button>
      )}
    </div>
  );
}

export default FleetFilterBar;
