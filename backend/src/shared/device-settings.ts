import { parseStoredJson } from "./json";
import { listConfigGroups, listBindings, getDeviceReportingSettings, getBaseArtifact } from "./config";
import { resolveByNameOrId } from "./collection";
import { deviceBindingNeedsLocation, resolveBindingByRef } from "./bindingResolve";

// Global state - initialized by vps_server.ts
declare let db: any;

export const buildDeviceSettingsPayload = (tenant: string, imei: string) => {
  const assets = db
    .prepare("SELECT data FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC")
    .all(tenant)
    .map((r: any) => parseStoredJson(r.data))
    .filter(Boolean);
  const asset = assets.find((a: any) => String(a.imei ?? "").trim() === imei) ?? null;
  if (!asset) return { ok: false, message: "Asset not found for IMEI." } as const;
  const configGroupValue = String(asset.configGroup ?? "").trim();
  if (!configGroupValue) return { ok: false, message: "Asset has no configuration group." } as const;
  const groups = listConfigGroups(tenant);
  const group = resolveByNameOrId(groups, configGroupValue);
  if (!group) return { ok: false, message: "Configuration group not found." } as const;

  const site = String((group as any).site ?? asset.site ?? "").trim();
  const overrideFlag =
    asset.configBindingOverrideFlag === true || String(asset.configBindingOverrideFlag ?? "").trim() === "true";
  const notificationOverride = String(asset.notificationBindingOverride ?? "").trim();
  const deviceOverride = String(asset.deviceBindingOverride ?? "").trim();
  const notificationRef = overrideFlag && notificationOverride
    ? notificationOverride
    : String((group as any).notificationBinding ?? "").trim();
  const locationRef = String((group as any).locationBinding ?? "").trim();
  const deviceRef = overrideFlag && deviceOverride
    ? deviceOverride
    : String((group as any).deviceBinding ?? "").trim();

  const notificationBinding = resolveBindingByRef(
    listBindings(tenant, "notifications") as any[],
    notificationRef,
    site
  );
  const deviceBinding = resolveBindingByRef(listBindings(tenant, "devices") as any[], deviceRef, site);
  const locationBinding = locationRef
    ? resolveBindingByRef(listBindings(tenant, "locations") as any[], locationRef, site)
    : null;

  const missing: string[] = [];
  if (!notificationRef) {
    missing.push("notification binding is not set on the configuration group");
  } else if (!notificationBinding) {
    missing.push(
      site
        ? `notification binding "${notificationRef}" not found for site "${site}"`
        : `notification binding "${notificationRef}" not found`
    );
  }
  if (!deviceRef) {
    missing.push("device binding is not set on the configuration group");
  } else if (!deviceBinding) {
    missing.push(
      site
        ? `device binding "${deviceRef}" not found for site "${site}"`
        : `device binding "${deviceRef}" not found`
    );
  }

  const needsLocation = deviceBindingNeedsLocation(deviceBinding as Record<string, unknown> | null);
  if (needsLocation) {
    if (!locationRef) {
      missing.push("location binding is required because the device binding has location monitoring enabled");
    } else if (!locationBinding) {
      missing.push(
        site
          ? `location binding "${locationRef}" not found for site "${site}"`
          : `location binding "${locationRef}" not found`
      );
    }
  } else if (locationRef && !locationBinding) {
    missing.push(
      site
        ? `location binding "${locationRef}" not found for site "${site}"`
        : `location binding "${locationRef}" not found`
    );
  }

  if (missing.length) {
    return { ok: false, message: `Configuration group bindings are missing: ${missing.join("; ")}.` } as const;
  }

  const reporting = getDeviceReportingSettings(tenant);
  const firmware = getBaseArtifact(tenant, "firmware");
  const config = getBaseArtifact(tenant, "config");
  return {
    ok: true,
    payload: {
      asset,
      configurationGroup: group,
      bindings: {
        notifications: notificationBinding,
        locations: locationBinding,
        devices: deviceBinding
      },
      deviceReportingSettings: reporting,
      baseArtifacts: {
        firmware: firmware
          ? { id: firmware.id, name: firmware.name, version: firmware.version, sha256: firmware.sha256, downloadUrl: `/device/artifacts/${firmware.id}` }
          : null,
        config: config
          ? { id: config.id, name: config.name, version: config.version, sha256: config.sha256, downloadUrl: `/device/artifacts/${config.id}` }
          : null
      }
    }
  } as const;
};

export const isRecordObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

export const mergeDeviceSettingsPayload = (
  basePayload: Record<string, unknown>,
  overridePayload: Record<string, unknown>
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...basePayload };
  for (const [key, value] of Object.entries(overridePayload)) {
    const current = merged[key];
    if (isRecordObject(current) && isRecordObject(value)) {
      merged[key] = mergeDeviceSettingsPayload(current, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
};
