import {
  defaultFuelComputeParameters,
  FUEL_DROP_NOTIFICATION_DESCRIPTION,
  FUEL_INCREASE_NOTIFICATION_DESCRIPTION,
  FUEL_LEVEL_COMPUTE_NOTIFICATION_DESCRIPTION,
  FUEL_SIPHONING_NOTIFICATION_DESCRIPTION,
  type NotificationRow
} from "../data/notificationLibrary";
import { getBindings, getConfigurationGroups, saveBindingDetailed } from "./api";
import { saveScopedToApi } from "./scopeStorage";
import {
  loadNotificationLibraryState,
  readActiveSiteName
} from "./notificationLibraryStore";
import {
  resyncConfigurationGroupsForBinding,
  syncNotificationBindingToTraccar,
  type ConfigGroupRecord
} from "./traccarBindingSync";

export const SAMPLE_NOTIFICATION_BINDING_ID = "binding-sample-traccar-demo";
export const SAMPLE_NOTIFICATION_BINDING_NAME = "Sample – fuel + ignition";

/** Library descriptions monitored by the sample binding (notifications + computed attributes). */
export const SAMPLE_MONITORED_EVENTS = [
  FUEL_LEVEL_COMPUTE_NOTIFICATION_DESCRIPTION,
  FUEL_SIPHONING_NOTIFICATION_DESCRIPTION,
  FUEL_DROP_NOTIFICATION_DESCRIPTION,
  FUEL_INCREASE_NOTIFICATION_DESCRIPTION,
  "Ignition on"
] as const;

const normalize = (value: string) => String(value ?? "").trim().toLowerCase();

async function ensureSampleFuelLibraryItem(site: string): Promise<void> {
  const { items, authoritative, usedBundledFallback } = await loadNotificationLibraryState(site);
  // Never overwrite a real library with bundled seeds after a failed/missed load.
  if (!authoritative || usedBundledFallback) return;

  const target = FUEL_LEVEL_COMPUTE_NOTIFICATION_DESCRIPTION;
  const existing = items.find((row) => normalize(String(row.description ?? "")) === normalize(target));
  if (existing?.parameters?.fuelCompute?.enabled) return;

  const bundled = items.find((row) => normalize(String(row.description ?? "")) === normalize(target));
  const fuelRow: NotificationRow = bundled
    ? {
        ...bundled,
        availability: "Available",
        type: "Computed",
        parameters: { ...(bundled.parameters ?? {}), ...defaultFuelComputeParameters }
      }
    : {
        description: target,
        type: "Computed",
        availability: "Available",
        eventId: "fuel-level-computed",
        parameters: defaultFuelComputeParameters
      };

  const nextItems = existing
    ? items.map((row) =>
        normalize(String(row.description ?? "")) === normalize(target) ? fuelRow : row
      )
    : [...items, fuelRow];

  await saveScopedToApi(
    "libraries:notification",
    { items: nextItems, unavailableDefaultsApplied: true },
    site
  );
}

export async function createSampleNotificationBinding(): Promise<{
  ok: boolean;
  message: string;
  syncDetail?: string;
}> {
  const site = readActiveSiteName();
  if (!site) {
    return {
      ok: false,
      message: "Select a site in the organisation ribbon first, then create the sample binding."
    };
  }

  await ensureSampleFuelLibraryItem(site);

  const payload = {
    id: SAMPLE_NOTIFICATION_BINDING_ID,
    name: SAMPLE_NOTIFICATION_BINDING_NAME,
    site,
    assetCount: 0,
    groupCount: 0,
    monitoredEvents: [...SAMPLE_MONITORED_EVENTS]
  };

  const stored = await saveBindingDetailed("notifications", payload);
  if (!stored.stored) {
    return { ok: false, message: "Could not save the sample binding. Check API key and tenant database." };
  }

  const sync = await syncNotificationBindingToTraccar({
    id: payload.id,
    name: payload.name,
    site: payload.site,
    monitoredEvents: payload.monitoredEvents
  });

  void resyncConfigurationGroupsForBinding("notifications", {
    id: payload.id,
    name: payload.name,
    site: payload.site
  });

  const configGroups = await getConfigurationGroups<ConfigGroupRecord>();
  const linked = (configGroups ?? []).filter((group) => {
    const ref = normalize(String(group.notificationBinding ?? ""));
    return ref === normalize(payload.id) || ref === normalize(payload.name);
  });

  const syncParts: string[] = [];
  if (sync.synced > 0) {
    syncParts.push(
      `${sync.synced} event(s) synced. Open Settings → Computed attributes: look for fuelLevel and viviEvt_* keys; Notifications for ignition/fuel rules. Attributes on devices show after a config group uses this binding and an asset is saved.`
    );
  } else if (!linked.length) {
    syncParts.push(
      `Binding saved for site "${site}". Link it in Configuration groups (notification binding = "${payload.name}"), assign that group to an asset, then save the group or asset to push device attributes.`
    );
  } else if (sync.errors.length) {
    syncParts.push(sync.errors.slice(0, 3).join(" "));
  } else {
    syncParts.push(
      "Binding saved. Ensure the linked configuration group has a site with a telematics group mapped in the ribbon."
    );
  }

  const existing = await getBindings<Record<string, unknown>>("notifications");
  const duplicateName = existing.some(
    (row) =>
      normalize(String(row.name ?? "")) === normalize(payload.name) &&
      String(row.id ?? "") !== payload.id
  );

  return {
    ok: true,
    message: duplicateName
      ? `Sample binding updated (id ${payload.id}). ${syncParts.join(" ")}`
      : `Sample binding created. ${syncParts.join(" ")}`,
    syncDetail: syncParts.join(" ")
  };
}
