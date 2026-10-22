type AssetDriverSource = Record<string, unknown> | null | undefined;

const truthyFlag = (value: unknown) =>
  value === true || String(value ?? "").trim().toLowerCase() === "true";

/** Default driver from Access control, with legacy fallbacks. */
export function resolveAssetDriverName(asset: AssetDriverSource): string {
  if (!asset || typeof asset !== "object") return "";

  const defaultDriver = String(asset.defaultDriver ?? "").trim();
  const hasDefault =
    truthyFlag(asset.hasDefaultDriver)
    || (defaultDriver.length > 0 && asset.hasDefaultDriver !== false);

  if (hasDefault && defaultDriver) return defaultDriver;

  return String(
    asset.driver
    ?? asset.driverName
    ?? asset.driverIdentified
    ?? asset.driverFullName
    ?? asset.assignedDriver
    ?? asset.operator
    ?? asset.operatorName
    ?? ""
  ).trim();
}

export function buildAssetDriverFields(
  hasDefaultDriver: boolean,
  defaultDriver: string
): {
  hasDefaultDriver: boolean;
  defaultDriver: string;
  driver: string;
  driverName: string;
} {
  const name = hasDefaultDriver ? String(defaultDriver ?? "").trim() : "";
  return {
    hasDefaultDriver: Boolean(hasDefaultDriver && name),
    defaultDriver: name,
    driver: name,
    driverName: name
  };
}

/** Trip/iButton driver wins; otherwise use the asset default driver. */
export function resolveTripDriverName(
  tripDriver: unknown,
  asset?: AssetDriverSource,
  fallback = "Unknown"
): string {
  const trip = String(tripDriver ?? "").trim();
  if (trip && trip.toLowerCase() !== "unknown" && trip.toLowerCase() !== "no driver") {
    return trip;
  }
  const assetDriver = resolveAssetDriverName(asset);
  return assetDriver || trip || fallback;
}

export function readAssetDefaultDriverFormState(asset: AssetDriverSource): {
  hasDefaultDriver: boolean;
  defaultDriver: string;
} {
  const defaultDriver = String(asset?.defaultDriver ?? asset?.driver ?? asset?.driverName ?? "").trim();
  const hasDefaultDriver =
    truthyFlag(asset?.hasDefaultDriver)
    || Boolean(defaultDriver && asset?.hasDefaultDriver !== false);
  return { hasDefaultDriver, defaultDriver };
}
