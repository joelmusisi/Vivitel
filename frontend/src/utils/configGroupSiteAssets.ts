/** Helpers for linking site assets to configuration groups. */

const normalize = (value: string) => String(value ?? "").trim().toLowerCase();

export type ConfigGroupLike = {
  id?: string;
  name?: string;
  site?: string;
};

export type AssetConfigGroupLike = {
  site?: string;
  configGroup?: string;
  configurationGroup?: string;
};

export function isDefaultConfigGroupRef(value: unknown): boolean {
  const key = normalize(String(value ?? ""));
  return !key || key === "default" || key === "default-group" || key === "default group";
}

export function readAssetConfigGroupRef(asset: AssetConfigGroupLike): string {
  return String(asset.configGroup ?? asset.configurationGroup ?? "").trim();
}

export function configGroupRefs(group: Pick<ConfigGroupLike, "id" | "name">): string[] {
  return [group.id, group.name].map((value) => String(value ?? "").trim()).filter(Boolean);
}

export function assetMatchesConfigGroupRef(
  asset: AssetConfigGroupLike,
  group: Pick<ConfigGroupLike, "id" | "name">
): boolean {
  const assigned = readAssetConfigGroupRef(asset);
  if (!assigned) return false;
  const assignedKey = normalize(assigned);
  return configGroupRefs(group).some((ref) => normalize(ref) === assignedKey);
}

/** True when the asset is on Default / empty — safe to auto-join a site group. */
export function assetConfigGroupIsUnassignedOrDefault(asset: AssetConfigGroupLike): boolean {
  return isDefaultConfigGroupRef(readAssetConfigGroupRef(asset));
}

export function listConfigGroupsForSite<T extends ConfigGroupLike>(groups: T[], site: string): T[] {
  const target = normalize(site);
  if (!target) return [];
  return (groups ?? []).filter((group) => normalize(String(group.site ?? "")) === target);
}

/**
 * Preferred config group for a site: the sole non-default site group when unique,
 * otherwise null (caller keeps explicit assignment / Default).
 */
export function resolvePreferredConfigGroupForSite<T extends ConfigGroupLike>(
  groups: T[],
  site: string
): T | null {
  const siteGroups = listConfigGroupsForSite(groups, site).filter(
    (group) => !isDefaultConfigGroupRef(group.id) && !isDefaultConfigGroupRef(group.name)
  );
  if (siteGroups.length === 1) return siteGroups[0];
  return null;
}

/**
 * Assets on this site that belong to the group, including unassigned/Default assets
 * when this group is the site's preferred (sole) configuration group.
 */
export function listAssetsForConfigGroup<T extends AssetConfigGroupLike>(
  group: ConfigGroupLike,
  assets: T[],
  allGroups: ConfigGroupLike[] = []
): T[] {
  const site = String(group.site ?? "").trim();
  if (!site) return [];
  const preferred =
    allGroups.length > 0 ? resolvePreferredConfigGroupForSite(allGroups, site) : null;
  const groupIsPreferred =
    preferred != null
    && (
      normalize(String(preferred.id ?? "")) === normalize(String(group.id ?? ""))
      || normalize(String(preferred.name ?? "")) === normalize(String(group.name ?? ""))
    );

  return (assets ?? []).filter((asset) => {
    const assetSite = String(asset.site ?? "").trim();
    if (normalize(assetSite) !== normalize(site)) return false;
    if (assetMatchesConfigGroupRef(asset, group)) return true;
    if (groupIsPreferred && assetConfigGroupIsUnassignedOrDefault(asset)) return true;
    // When allGroups is empty (compile path without catalog), still pull Default/empty
    // site assets into any non-default site-scoped group so newly added assets compile.
    if (
      allGroups.length === 0
      && !isDefaultConfigGroupRef(group.id)
      && !isDefaultConfigGroupRef(group.name)
      && assetConfigGroupIsUnassignedOrDefault(asset)
    ) {
      return true;
    }
    return false;
  });
}

export function countAssetsForConfigGroups(
  groups: ConfigGroupLike[],
  assets: AssetConfigGroupLike[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const group of groups) {
    const n = listAssetsForConfigGroup(group, assets, groups).length;
    for (const ref of configGroupRefs(group)) {
      counts.set(normalize(ref), n);
    }
  }
  return counts;
}
