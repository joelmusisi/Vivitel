import { getBindings, getConfigurationGroups, getGpsIotCanBus, type GpsIotCanBusStatus } from "./api";
import { resolveBindingByRef, sitesEquivalent } from "./bindingResolve";
import { resolveGpsIotFuelAssetId } from "./gpsiotFuel";
import { isGpsIotServer } from "./regionServers";
import { formatFuelLiters } from "./traccarFuel";

export type DeviceBindingCanLine = {
  id?: string;
  canEnabled?: boolean;
  canProtocol?: string;
};

export type DeviceBindingWithCan = {
  id?: string;
  name?: string;
  site?: string;
  lines?: DeviceBindingCanLine[];
};

export type ConfigGroupWithDeviceBinding = {
  id?: string;
  name?: string;
  site?: string;
  deviceBinding?: string;
};

/** True when C1/C2 has an assigned CAN library protocol. */
export function deviceBindingHasCanAttached(binding: DeviceBindingWithCan | null | undefined): boolean {
  if (!binding || !Array.isArray(binding.lines)) return false;
  return binding.lines.some((line) => {
    const id = String(line.id ?? "").trim().toLowerCase();
    return (id === "c1" || id === "c2") && Boolean(line.canEnabled) && Boolean(String(line.canProtocol ?? "").trim());
  });
}

export function readCanProtocolFromBinding(binding: DeviceBindingWithCan | null | undefined): string {
  if (!binding || !Array.isArray(binding.lines)) return "";
  for (const line of binding.lines) {
    const id = String(line.id ?? "").trim().toLowerCase();
    if ((id === "c1" || id === "c2") && line.canEnabled) {
      const protocol = String(line.canProtocol ?? "").trim();
      if (protocol) return protocol;
    }
  }
  return "";
}

export function resolveDeviceBindingForAssetCan(params: {
  asset: { site?: unknown; configGroup?: unknown; configurationGroup?: unknown };
  groups: ConfigGroupWithDeviceBinding[];
  bindings: DeviceBindingWithCan[];
}): DeviceBindingWithCan | null {
  const site = String(params.asset.site ?? "").trim();
  const groupName = String(params.asset.configGroup ?? params.asset.configurationGroup ?? "").trim();
  if (!groupName) return null;
  const group = params.groups.find(
    (row) =>
      String(row?.name ?? "").trim().toLowerCase() === groupName.toLowerCase()
      && (!site || sitesEquivalent(String(row?.site ?? ""), site))
  );
  if (!group) return null;
  return resolveBindingByRef(params.bindings as any[], String(group.deviceBinding ?? ""), site) as DeviceBindingWithCan | null;
}

export async function loadCanAttachedAssetIds(
  assets: Array<{ id?: unknown; assetId?: unknown; imei?: unknown; site?: unknown; configGroup?: unknown; configurationGroup?: unknown }>
): Promise<Map<string, { assetId: string; protocol: string }>> {
  const out = new Map<string, { assetId: string; protocol: string }>();
  if (!isGpsIotServer() || !assets.length) return out;
  try {
    const [groups, bindings] = await Promise.all([
      getConfigurationGroups<ConfigGroupWithDeviceBinding>(),
      getBindings<DeviceBindingWithCan>("devices")
    ]);
    for (const asset of assets) {
      const binding = resolveDeviceBindingForAssetCan({ asset, groups: groups ?? [], bindings: bindings ?? [] });
      if (!deviceBindingHasCanAttached(binding)) continue;
      const gpsAssetId = resolveGpsIotFuelAssetId(asset);
      if (!gpsAssetId) continue;
      const key = String(asset.id ?? asset.assetId ?? asset.imei ?? gpsAssetId).trim();
      if (!key) continue;
      out.set(key, { assetId: gpsAssetId, protocol: readCanProtocolFromBinding(binding) });
    }
  } catch {
    // Keep empty — Live Tracking continues without CAN enrichment.
  }
  return out;
}

export function applyCanBusToAssetRow<T extends Record<string, unknown>>(
  row: T,
  canbus: GpsIotCanBusStatus | null | undefined,
  protocol = ""
): T {
  if (!canbus?.attributes) return row;
  const attrs = {
    ...(typeof row.fuelAttributes === "object" && row.fuelAttributes ? (row.fuelAttributes as Record<string, unknown>) : {}),
    ...canbus.attributes,
    ...(protocol ? { viviCanProtocol: protocol, viviCanEnabled: true } : {})
  };
  const fuelLiters = typeof canbus.attributes.fuel === "number" ? canbus.attributes.fuel : null;
  const next: Record<string, unknown> = {
    ...row,
    fuelAttributes: attrs,
    canBus: canbus.fields,
    canProtocol: protocol || row.canProtocol
  };
  if (fuelLiters != null && !String(row.fuelReading ?? "").trim()) {
    next.fuelReading = formatFuelLiters(fuelLiters);
  }
  if (typeof canbus.attributes.rpm === "number") next.rpm = canbus.attributes.rpm;
  if (typeof canbus.attributes.canSpeed === "number") next.canSpeed = canbus.attributes.canSpeed;
  return next as T;
}

export async function fetchCanBusForAttachedAsset(
  asset: { id?: unknown; assetId?: unknown; imei?: unknown; site?: unknown; configGroup?: unknown; configurationGroup?: unknown },
  cache?: Map<string, { assetId: string; protocol: string }>
): Promise<{ canbus: GpsIotCanBusStatus | null; protocol: string }> {
  if (!isGpsIotServer()) return { canbus: null, protocol: "" };
  const key = String(asset.id ?? asset.assetId ?? asset.imei ?? "").trim();
  let meta = key ? cache?.get(key) : undefined;
  if (!meta) {
    const map = await loadCanAttachedAssetIds([asset]);
    meta = key ? map.get(key) : undefined;
    if (!meta) {
      // Fallback: try direct asset id even when binding cache miss — only if caller forces.
      return { canbus: null, protocol: "" };
    }
  }
  try {
    const canbus = await getGpsIotCanBus({ assetId: meta.assetId });
    return { canbus, protocol: meta.protocol };
  } catch {
    return { canbus: null, protocol: meta.protocol };
  }
}
