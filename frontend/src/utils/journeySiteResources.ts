import { getDriversFromApi } from "./api";
import { loadScopedAssets } from "./homeScopedDevices";
import { filterRecordsForActiveSelection } from "./scopeStorage";

export type SiteAssetOption = {
  id: string;
  registration: string;
  description: string;
  label: string;
  site: string;
};

export type SiteDriverOption = {
  id: string;
  name: string;
  label: string;
  site: string;
};

function assetDescription(asset: Record<string, unknown>): string {
  return String(asset.assetDescription ?? asset.description ?? asset.name ?? "").trim();
}

function assetRegistration(asset: Record<string, unknown>): string {
  return String(asset.registration ?? asset.plate ?? "").trim();
}

function assetSite(asset: Record<string, unknown>): string {
  return String(asset.site ?? asset.group ?? asset.groupName ?? "").trim();
}

/** Site-scoped assets for routes pickers (active site only). */
export async function loadJourneySiteAssets(): Promise<SiteAssetOption[]> {
  const assets = await loadScopedAssets();
  const options: SiteAssetOption[] = [];
  for (const asset of assets) {
    const registration = assetRegistration(asset);
    const description = assetDescription(asset);
    if (!registration && !description) continue;
    const id = String(asset.id ?? asset.imei ?? registration ?? description).trim();
    const label = [description, registration].filter(Boolean).join(" — ") || "Asset";
    options.push({
      id: id || label,
      registration,
      description,
      label,
      site: assetSite(asset)
    });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

/** Drivers belonging to the active site only (not the whole database). */
export async function loadJourneySiteDrivers(): Promise<SiteDriverOption[]> {
  const drivers = await getDriversFromApi<Record<string, unknown>>();
  type ScopedDriver = Record<string, unknown> & { site: string };
  const scoped = filterRecordsForActiveSelection(
    (Array.isArray(drivers) ? drivers : []).map((driver): ScopedDriver => ({
      ...driver,
      site: String(driver.site ?? driver.organisation ?? "").trim()
    }))
  );
  const options: SiteDriverOption[] = [];

  for (const driver of scoped) {
    const name = String(driver.name ?? driver.fullName ?? driver.driverName ?? "").trim();
    if (!name) continue;
    const site = String(driver.site ?? "").trim();
    const id = String(driver.id ?? name).trim() || name;
    options.push({
      id,
      name,
      label: site ? `${name} · ${site}` : name,
      site
    });
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}
