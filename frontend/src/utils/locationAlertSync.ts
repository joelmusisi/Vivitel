import {
  createTraccarNotification,
  createTraccarPermission,
  deleteTraccarNotification,
  getAssetsFromApi,
  getTraccarDevices,
  getTraccarNotifications
} from "./api";
import { loadLocationGeofences, saveLocationGeofence } from "./locationGeofences";
import { isGpsIotServer } from "./regionServers";
import { readActiveSiteName, readActiveTenantId } from "./tenantContext";

export type LocationAlertSyncRecord = {
  id: string;
  eventName: string;
  eventType: string;
  delivery: { email?: boolean; inApp?: boolean; sms?: boolean };
  assetMode?: string;
  selectedAssets?: string[];
  selectedLocations?: string[];
  speedKph?: number;
  durationSeconds?: number;
};

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

const alertTraccarTypes = (eventType: string): string[] => {
  switch (normalize(eventType)) {
    case "location entry":
    case "location started":
      return ["geofenceEnter"];
    case "location exit":
    case "location stopped":
      return ["geofenceExit"];
    case "over-speeding in location":
      return ["deviceOverspeed"];
    case "movement alert":
      return ["deviceMoving"];
    default:
      return ["geofenceEnter", "geofenceExit"];
  }
};

const assetLabel = (asset: Record<string, unknown>) => {
  const description = String(asset.assetDescription ?? asset.description ?? asset.name ?? "").trim();
  const registration = String(asset.registration ?? asset.plate ?? "").trim();
  return [description, registration].filter(Boolean).join(" - ");
};

async function grantPermission(payload: Record<string, number>) {
  const result = await createTraccarPermission(payload);
  const message = String(result.error ?? "");
  if (
    result.ok
    || result.softFailed
    || result.status === 400
    || result.status === 409
    || /exist|duplicate|constraint|invalid permission|soft/i.test(message)
  ) {
    return;
  }
  console.warn("Traccar permission skipped:", result.error || result.status);
}

async function grantPermissions(payloads: Array<Record<string, number>>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(6, payloads.length) }, async () => {
    while (cursor < payloads.length) {
      const payload = payloads[cursor];
      cursor += 1;
      await grantPermission(payload);
    }
  });
  await Promise.all(workers);
}

const isTraccarUnavailableError = (error: unknown) => {
  const message = String((error as { message?: string })?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("502")
    || message.includes("503")
    || message.includes("504")
    || message.includes("upstream")
    || message.includes("unavailable")
    || message.includes("failed to fetch")
    || message.includes("network")
  );
};

export async function removeLocationAlertFromTraccar(alertId: string): Promise<void> {
  if (isGpsIotServer()) return;
  const id = String(alertId ?? "").trim();
  if (!id) return;
  let notifications: Awaited<ReturnType<typeof getTraccarNotifications>> = [];
  try {
    notifications = await getTraccarNotifications();
  } catch (error) {
    console.warn("Traccar notification cleanup skipped:", error);
    return;
  }
  for (const target of notifications) {
    const attributes = target.attributes && typeof target.attributes === "object" ? target.attributes : {};
    if (String((attributes as any).viviLocationAlertId ?? "").trim() !== id) continue;
    const notificationId = Number(target.id ?? 0);
    if (!(Number.isFinite(notificationId) && notificationId > 0)) continue;
    const result = await deleteTraccarNotification(notificationId);
    if (!result.ok && result.status !== 404) {
      console.warn("Traccar notification delete skipped:", result.error || result.status);
    }
  }
}

/**
 * Best-effort Traccar sync. Returns warnings instead of throwing when Traccar is down,
 * so Location Alerts can still persist in site-scoped storage.
 * UK GPS IoT: library metadata only — never touches Traccar.
 */
export async function syncLocationAlertToTraccar(
  alert: LocationAlertSyncRecord
): Promise<{ notifications: number; devices: number; geofences: number; warning?: string }> {
  const alertId = String(alert.id ?? "").trim();
  if (!alertId) throw new Error("Alert id is required.");
  const activeSite = readActiveSiteName();
  if (!activeSite) throw new Error("Select a site before saving a location alert.");
  if (!(alert.selectedLocations ?? []).length) {
    throw new Error("Select at least one location from the active site.");
  }

  const geofences = await loadLocationGeofences().catch(() => []);
  const selectedLocationSet = new Set((alert.selectedLocations ?? []).map(normalize).filter(Boolean));
  const targetGeofences = selectedLocationSet.size === 0
    ? geofences.filter((row) => normalize(row.site) === normalize(activeSite))
    : geofences.filter((geofence) =>
        normalize(geofence.site) === normalize(activeSite)
        && (
          selectedLocationSet.has(normalize(geofence.name))
          || selectedLocationSet.has(normalize(geofence.id))
          || selectedLocationSet.has(normalize(geofence.gpsIotGeoId))
          || selectedLocationSet.has(normalize(geofence.traccarId))
        )
      );
  const matchedLocationKeys = new Set<string>();
  for (const geofence of targetGeofences) {
    for (const key of [geofence.name, geofence.id, geofence.gpsIotGeoId, geofence.traccarId]) {
      const normalized = normalize(key);
      if (selectedLocationSet.has(normalized)) matchedLocationKeys.add(normalized);
    }
  }
  if ([...selectedLocationSet].some((key) => !matchedLocationKeys.has(key))) {
    if (geofences.length > 0) {
      throw new Error("One or more selected locations do not belong to the active site.");
    }
  }

  const isOverspeedAlert = normalize(alert.eventType) === "over-speeding in location";
  for (const geofence of targetGeofences) {
    const nextAttributes = {
      ...(geofence.attributes ?? {}),
      ...(alert.speedKph ? { viviSpeed: String(alert.speedKph) } : {}),
      ...(alert.durationSeconds ? { viviDurationSeconds: alert.durationSeconds } : {}),
      viviSite: activeSite
    };
    const shouldSyncGeofence = Boolean(alert.speedKph || alert.durationSeconds || isOverspeedAlert);
    if (shouldSyncGeofence) {
      await saveLocationGeofence(
        {
          ...geofence,
          site: activeSite,
          speed: alert.speedKph ? String(alert.speedKph) : geofence.speed,
          attributes: nextAttributes
        },
        { libraryOnly: isGpsIotServer() }
      ).catch((error) => {
        console.warn("Location geofence metadata update skipped:", error);
      });
    }
  }

  if (isGpsIotServer()) {
    return {
      notifications: 0,
      devices: 0,
      geofences: targetGeofences.length,
      warning: "GPS IoT: location alert stored for this site only (no Traccar sync)."
    };
  }

  try {
    await removeLocationAlertFromTraccar(alertId);

    const assets = await getAssetsFromApi<Record<string, unknown>>().catch(() => [] as Record<string, unknown>[]);
    const selectedAssetSet = new Set((alert.selectedAssets ?? []).map(normalize).filter(Boolean));
    const siteMode = normalize(alert.assetMode) !== "individual";
    const siteAssets = assets.filter(
      (asset) => normalize(asset.site ?? asset.organisation) === normalize(activeSite)
    );
    const targetAssets = siteAssets.filter((asset) => {
      if (selectedAssetSet.size === 0) return true;
      if (siteMode) return selectedAssetSet.has(normalize(asset.site ?? asset.organisation));
      return selectedAssetSet.has(normalize(assetLabel(asset)))
        || selectedAssetSet.has(normalize(asset.registration))
        || selectedAssetSet.has(normalize(asset.imei));
    });

    const geofenceIds = targetGeofences
      .map((row) => Math.trunc(Number(row.traccarId ?? 0)))
      .filter((id) => Number.isFinite(id) && id > 0);
    const speedKph = Number(alert.speedKph ?? 0);

    const deviceIds: number[] = [];
    const imeis = targetAssets
      .map((asset) => String(asset.imei ?? "").trim())
      .filter(Boolean);
    let deviceLookupsUnavailable = false;
    await Promise.all(
      imeis.map(async (imei) => {
        if (deviceLookupsUnavailable) return;
        try {
          const devices = await getTraccarDevices({ uniqueId: imei });
          const deviceId = Math.trunc(Number(devices[0]?.id ?? 0));
          if (deviceId > 0) deviceIds.push(deviceId);
        } catch (error) {
          if (isTraccarUnavailableError(error)) deviceLookupsUnavailable = true;
          console.warn("Traccar device lookup skipped:", imei, error);
        }
      })
    );

    const notificationIds: number[] = [];
    let upstreamUnavailable = deviceLookupsUnavailable;

    for (const type of alertTraccarTypes(alert.eventType)) {
      if (upstreamUnavailable) break;
      const result = await createTraccarNotification({
        type,
        description: alert.eventName,
        always: true,
        notificators: "web",
        attributes: {
          viviSource: "notification-library",
          viviLocationAlertId: alertId,
          viviTenantId: readActiveTenantId(),
          viviSite: activeSite,
          viviEventType: alert.eventType,
          ...(type === "deviceOverspeed" && Number.isFinite(speedKph) && speedKph > 0
            ? { viviSpeedKph: speedKph }
            : {}),
          viviConfig: JSON.stringify({
            description: alert.eventName,
            eventId: alertId,
            type: alert.eventType,
            availability: "Available",
            userAlerts: alert.delivery,
            parameters: {
              record: {
                event: true,
                recordingType: "Notification",
                userAlerts: alert.delivery
              },
              selectedLocations: alert.selectedLocations ?? [],
              selectedAssets: alert.selectedAssets ?? [],
              assetMode: alert.assetMode ?? "Site",
              speedKph: alert.speedKph ?? null,
              durationSeconds: alert.durationSeconds ?? null
            }
          })
        }
      });
      if (!result.ok) {
        if (
          result.status === 502
          || result.status === 503
          || result.status === 504
          || isTraccarUnavailableError(result.error)
        ) {
          upstreamUnavailable = true;
        }
        console.warn("Traccar notification create skipped:", result.error || result.status);
        continue;
      }
      const notificationId = Math.trunc(Number(result.body?.id ?? 0));
      if (notificationId > 0) notificationIds.push(notificationId);
    }

    if (!upstreamUnavailable) {
      const permissionPayloads: Array<Record<string, number>> = [];
      for (const deviceId of deviceIds) {
        for (const notificationId of notificationIds) {
          permissionPayloads.push({ deviceId, notificationId });
        }
        for (const geofenceId of geofenceIds) {
          permissionPayloads.push({ deviceId, geofenceId });
        }
      }
      await grantPermissions(permissionPayloads);
    }

    return {
      notifications: notificationIds.length,
      devices: deviceIds.length,
      geofences: geofenceIds.length,
      warning: upstreamUnavailable
        ? "Alert saved for this site. Traccar sync was skipped because the tracking service is temporarily unavailable."
        : undefined
    };
  } catch (error) {
    if (isTraccarUnavailableError(error)) {
      console.warn("Traccar location-alert sync skipped:", error);
      return {
        notifications: 0,
        devices: 0,
        geofences: 0,
        warning:
          "Alert saved for this site. Traccar sync was skipped because the tracking service is temporarily unavailable."
      };
    }
    throw error;
  }
}
