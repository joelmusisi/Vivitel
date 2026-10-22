import type { NotificationRow } from "../data/notificationLibrary";
import { getAlertsFromApi, getBindings, readSignedInUser, saveBindingDetailed } from "./api";
import {
  dispatchNotificationLibraryUpdated,
  isUserNotificationBinding,
  loadNotificationLibraryState,
  type BoundNotificationOption
} from "./notificationLibraryStore";
import { filterForSiteScope, loadScopedFromApi, saveScopedToApi } from "./scopeStorage";
import { bindingMatchesSite, siteScopesMatch } from "./scopeIsolation";
import { readActiveSiteName } from "./tenantContext";

export const LOCATION_ALERTS_UPDATED_EVENT = "vivi:locationAlertsUpdated";
const LOCATION_ALERTS_STORAGE_BASE = "libraries:location-alerts";

export type LocationAlertRecord = {
  id: string;
  eventName: string;
  eventType: string;
  delivery?: { email?: boolean; inApp?: boolean; sms?: boolean };
  selectedLocations?: string[];
  selectedAssets?: string[];
  assetMode?: string;
  site?: string;
  status?: string;
  updatedAt?: string;
  createdAt?: string;
};

type StoredLocationAlerts = {
  items?: LocationAlertRecord[];
};

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function dispatchLocationAlertsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOCATION_ALERTS_UPDATED_EVENT));
}

function normalizeAlertRecord(raw: Record<string, unknown>): LocationAlertRecord | null {
  const id = String(raw.id ?? "").trim();
  const eventName = String(raw.eventName ?? raw.name ?? "").trim();
  const eventType = String(raw.eventType ?? "").trim();
  if (!id || !eventName) return null;
  return {
    id,
    eventName,
    eventType,
    delivery: (raw.delivery as LocationAlertRecord["delivery"]) ?? undefined,
    selectedLocations: Array.isArray(raw.selectedLocations)
      ? raw.selectedLocations.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    selectedAssets: Array.isArray(raw.selectedAssets)
      ? raw.selectedAssets.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    assetMode: String(raw.assetMode ?? "").trim() || undefined,
    site: String(raw.site ?? "").trim() || undefined,
    status: String(raw.status ?? "").trim() || undefined,
    updatedAt: String(raw.updatedAt ?? "").trim() || undefined,
    createdAt: String(raw.createdAt ?? "").trim() || undefined
  };
}

async function loadScopedLocationAlerts(site = readActiveSiteName()): Promise<LocationAlertRecord[]> {
  const stored = await loadScopedFromApi<StoredLocationAlerts>(LOCATION_ALERTS_STORAGE_BASE, site);
  const items = Array.isArray(stored?.items) ? stored.items : [];
  return items
    .map((row) => normalizeAlertRecord(row as Record<string, unknown>))
    .filter((row): row is LocationAlertRecord => Boolean(row));
}

async function saveScopedLocationAlerts(
  alerts: LocationAlertRecord[],
  site = readActiveSiteName()
): Promise<boolean> {
  return saveScopedToApi(LOCATION_ALERTS_STORAGE_BASE, { items: alerts }, site);
}

export async function loadSiteLocationAlerts(site = readActiveSiteName()): Promise<LocationAlertRecord[]> {
  const activeSite = String(site ?? "").trim();
  if (!activeSite) return [];
  const [scoped, apiRows] = await Promise.all([
    loadScopedLocationAlerts(activeSite),
    getAlertsFromApi<Record<string, unknown>>().catch(() => [])
  ]);

  const merged = new Map<string, LocationAlertRecord>();
  for (const row of scoped) {
    const rowSite = String(row.site ?? "").trim();
    if (rowSite && !siteScopesMatch(rowSite, activeSite)) continue;
    merged.set(row.id, { ...row, site: rowSite || activeSite });
  }
  for (const raw of Array.isArray(apiRows) ? apiRows : []) {
    const mapped = normalizeAlertRecord(raw);
    if (!mapped) continue;
    if (!siteScopesMatch(String(mapped.site ?? ""), activeSite)) continue;
    merged.set(mapped.id, { ...merged.get(mapped.id), ...mapped });
  }

  const items = Array.from(merged.values()).filter((row) => normalize(row.status) !== "removed");
  return filterForSiteScope(items, activeSite);
}

export async function persistSiteLocationAlert(
  alert: LocationAlertRecord,
  site = readActiveSiteName()
): Promise<{ stored: boolean; error?: string }> {
  const activeSite = String(site ?? alert.site ?? readActiveSiteName()).trim();
  if (!activeSite) return { stored: false, error: "Select a site before saving a location alert." };

  const nextAlert: LocationAlertRecord = {
    ...alert,
    site: activeSite,
    status: alert.status ?? "active",
    updatedAt: alert.updatedAt ?? new Date().toISOString()
  };

  const current = await loadScopedLocationAlerts(activeSite);
  const index = current.findIndex((row) => row.id === nextAlert.id);
  const nextItems = [...current];
  if (index >= 0) nextItems[index] = { ...nextItems[index], ...nextAlert };
  else nextItems.unshift(nextAlert);

  const scopedStored = await saveScopedLocationAlerts(nextItems, activeSite);
  if (!scopedStored) {
    return { stored: false, error: "Unable to store the location alert for this site." };
  }

  dispatchLocationAlertsUpdated();
  return { stored: true };
}

export async function removeSiteLocationAlert(id: string, site = readActiveSiteName()): Promise<boolean> {
  const activeSite = String(site ?? readActiveSiteName()).trim();
  const current = await loadScopedLocationAlerts(activeSite);
  const target = current.find((row) => row.id === id);
  if (!target) return false;
  // The server merges by alert id and never drops rows, so removal is stored as a tombstone.
  const nextItems = current.map((row) =>
    row.id === id ? { ...row, status: "removed", updatedAt: new Date().toISOString() } : row
  );
  const stored = await saveScopedLocationAlerts(nextItems, activeSite);
  if (stored) dispatchLocationAlertsUpdated();
  return stored;
}

export function mapLocationAlertToBoundOption(alert: LocationAlertRecord): BoundNotificationOption {
  return {
    description: alert.eventName,
    type: alert.eventType || "Location alert"
  };
}

export function mapLocationAlertToLiveTrackingEvent(alert: LocationAlertRecord) {
  return {
    id: `loc-alert-${alert.id}`,
    name: alert.eventName,
    eventType: alert.eventType || "Location alert"
  };
}

export async function loadLocationAlertNotificationOptions(
  site = readActiveSiteName()
): Promise<BoundNotificationOption[]> {
  const alerts = await loadSiteLocationAlerts(site);
  return alerts.map(mapLocationAlertToBoundOption);
}

async function ensureLocationAlertLibraryItem(
  alert: LocationAlertRecord,
  site = readActiveSiteName()
): Promise<void> {
  const activeSite = String(site ?? alert.site ?? readActiveSiteName()).trim();
  if (!activeSite) return;

  const { items, authoritative, usedBundledFallback } = await loadNotificationLibraryState(activeSite);
  // Never overwrite a real library with bundled seeds after a failed/missed load.
  if (!authoritative || usedBundledFallback) return;

  const targetName = alert.eventName.trim();
  const existingIndex = items.findIndex((row) => normalize(row.description) === normalize(targetName));
  const libraryRow: NotificationRow = {
    description: targetName,
    type: alert.eventType || "Location alert",
    availability: "Available",
    eventId: `location-alert-${alert.id}`,
    parameters: {
      record: {
        event: true,
        userAlerts: {
          email: Boolean(alert.delivery?.email),
          inApp: Boolean(alert.delivery?.inApp),
          sms: Boolean(alert.delivery?.sms)
        }
      }
    }
  };

  const nextItems = existingIndex >= 0
    ? items.map((row, index) => (index === existingIndex ? { ...row, ...libraryRow } : row))
    : [...items, libraryRow];

  await saveScopedToApi("libraries:notification", { items: nextItems, unavailableDefaultsApplied: true }, activeSite);
  dispatchNotificationLibraryUpdated();
}

async function ensureLocationAlertInBindings(
  alert: LocationAlertRecord,
  site = readActiveSiteName()
): Promise<void> {
  const activeSite = String(site ?? alert.site ?? readActiveSiteName()).trim();
  const eventName = alert.eventName.trim();
  if (!activeSite || !eventName) return;

  const owner = readSignedInUser();
  const ownerEmail = String(owner.email ?? "").trim().toLowerCase();
  const bindings = await getBindings<Record<string, unknown>>("notifications");
  const bindingId = `location-alert-${alert.id}`;
  const existing = bindings.find((binding) => String(binding.id ?? "") === bindingId);

  // Only the user who sets the alert up receives it; earlier site-wide attachments are removed.
  let changed = false;
  for (const binding of bindings) {
    if (String(binding.id ?? "") === bindingId) continue;
    if (!isUserNotificationBinding(binding) || !bindingMatchesSite(binding, activeSite)) continue;
    const events = Array.isArray(binding.monitoredEvents)
      ? binding.monitoredEvents.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
    if (!events.some((event) => normalize(event) === normalize(eventName))) continue;
    const id = String(binding.id ?? "").trim();
    if (!id) continue;
    const stripped = await saveBindingDetailed("notifications", {
      ...binding,
      id,
      monitoredEvents: events.filter((event) => normalize(event) !== normalize(eventName))
    });
    if (stripped.stored) changed = true;
  }

  const existingEmails = Array.isArray(existing?.emailRecipients) ? existing.emailRecipients : [];
  if (existingEmails.length > 0 || ownerEmail.includes("@")) {
    const saved = await saveBindingDetailed("notifications", {
      ...(existing ?? {}),
      id: bindingId,
      name: `Location alert: ${eventName}`,
      site: activeSite,
      monitoredEvents: [eventName],
      selectedAssets: [],
      selectedDrivers: [],
      emailRecipients: existingEmails.length
        ? existingEmails
        : [{ id: ownerEmail, name: String(owner.name || ownerEmail), email: ownerEmail }],
      pushRecipients: [],
      notificationOwner: ownerEmail
    });
    if (saved.stored) changed = true;
  }

  if (changed && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("vivi:bindingschange"));
  }
}

export async function registerLocationAlertAsNotification(
  alert: LocationAlertRecord,
  site = readActiveSiteName()
): Promise<void> {
  await Promise.all([
    ensureLocationAlertLibraryItem(alert, site),
    ensureLocationAlertInBindings(alert, site)
  ]);
  dispatchLocationAlertsUpdated();
}

export async function unregisterLocationAlertNotification(
  eventName: string,
  site = readActiveSiteName()
): Promise<void> {
  const target = String(eventName ?? "").trim();
  if (!target) return;

  const activeSite = String(site ?? readActiveSiteName()).trim();
  const bindings = await getBindings<Record<string, unknown>>("notifications");
  let changed = false;

  for (const binding of bindings) {
    if (!isUserNotificationBinding(binding)) continue;
    if (!activeSite || !bindingMatchesSite(binding, activeSite)) continue;
    const events = Array.isArray(binding.monitoredEvents)
      ? binding.monitoredEvents.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
    if (!events.some((event) => normalize(event) === normalize(target))) continue;
    const id = String(binding.id ?? "").trim();
    if (!id) continue;
    const result = await saveBindingDetailed("notifications", {
      ...binding,
      id,
      monitoredEvents: events.filter((event) => normalize(event) !== normalize(target))
    });
    if (result.stored) changed = true;
  }

  if (changed && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("vivi:bindingschange"));
  }
  dispatchLocationAlertsUpdated();
}

/** Location-alert-backed notification summaries (user alerts + location rules). Overview/Summary Notification use Traccar events. */
export const notificationSummaryReportNames = new Set([
  "Notification Location Summary Report"
]);

export function isNotificationSummaryReportName(reportName: string): boolean {
  return notificationSummaryReportNames.has(String(reportName ?? "").trim());
}
