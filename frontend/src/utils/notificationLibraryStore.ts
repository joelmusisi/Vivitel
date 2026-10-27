import {
  filterFmNotificationRows,
  isFmNotificationDescription,
  normalizeNotificationAvailability,
  normalizeNotificationLibraryRow,
  applyDigitalEventLibraryDefaults,
  ensureSiteTraccarDefaultNotifications,
  notificationRows as bundledNotificationRows,
  stripMisplacedFuelComputeParameters,
  type NotificationRow
} from "../data/notificationLibrary";
import { deleteBindingDetailed, getBindings, getConfigurationGroups, saveBindingDetailed } from "./api";
import { bindingMatchesSite } from "./scopeIsolation";
import { loadScopedFromApi, saveScopedToApi } from "./scopeStorage";
import { readActiveSiteName } from "./tenantContext";

export { bindingMatchesSite, readActiveSiteName };

export const NOTIFICATION_LIBRARY_UPDATED_EVENT = "vivi:notificationLibraryUpdated";

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

const LIBRARY_TEMPLATE_ID_PREFIX = "vivi-library-notif-";
const LIBRARY_TEMPLATE_NAME_PREFIX = "vivi library ·";

type StoredNotificationLibrary = {
  items?: NotificationRow[];
  unavailableDefaultsApplied?: boolean;
};

function normalizeLoadedNotificationRow(row: NotificationRow): NotificationRow | null {
  return normalizeNotificationLibraryRow(
    stripMisplacedFuelComputeParameters({
      ...row,
      description: String(row.description ?? "").trim(),
      type: String(row.type ?? "").trim(),
      availability: normalizeNotificationAvailability(row.availability)
    })
  );
}

export function dispatchNotificationLibraryUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_LIBRARY_UPDATED_EVENT));
}

export function isNotificationLibraryTemplateBinding(row: unknown): boolean {
  const id = String((row as { id?: unknown })?.id ?? "").trim().toLowerCase();
  const name = String((row as { name?: unknown })?.name ?? "").trim().toLowerCase();
  return id.startsWith(LIBRARY_TEMPLATE_ID_PREFIX) || name.startsWith(LIBRARY_TEMPLATE_NAME_PREFIX);
}

/** User-created bindings only — never auto-generated library template rows. */
export function isUserNotificationBinding(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  if (isNotificationLibraryTemplateBinding(row)) return false;
  const name = String((row as { name?: unknown }).name ?? "").trim();
  if (!name) return false;
  if (name === "Default Notifications" || name === "Default Locations" || name === "Default Devices") {
    return false;
  }
  return true;
}

export type BoundNotificationOption = {
  description: string;
  type: string;
};

export type NotificationPickerEvent = {
  id: string;
  name: string;
  eventType: string;
};

/** Notifications selected in Notifications Bindings (monitoredEvents) for the active site. */
export function collectMonitoredNotificationsFromBindings(
  bindings: Array<{ site?: string; monitoredEvents?: string[] }>,
  site = readActiveSiteName()
): string[] {
  const activeSite = String(site ?? "").trim().toLowerCase();
  const names = new Set<string>();

  for (const binding of bindings) {
    if (!isUserNotificationBinding(binding)) continue;
    const bindingSite = String(binding.site ?? "").trim().toLowerCase();
    if (activeSite && bindingSite && bindingSite !== activeSite) continue;
    for (const event of binding.monitoredEvents ?? []) {
      const label = String(event ?? "").trim();
      if (label) names.add(label);
    }
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export async function loadBoundNotificationOptionsForSite(
  site = readActiveSiteName()
): Promise<BoundNotificationOption[]> {
  const activeSite = String(site ?? "").trim();
  // Dynamic import breaks notificationLibraryStore ↔ locationAlertNotifications cycle (TDZ in prod chunks).
  const { loadLocationAlertNotificationOptions } = await import("./locationAlertNotifications");
  const [bindings, library, locationAlerts] = await Promise.all([
    getBindings<{ site?: string; monitoredEvents?: string[] }>("notifications", { refresh: true }),
    loadNotificationLibraryItems(activeSite),
    loadLocationAlertNotificationOptions(activeSite)
  ]);
  const monitored = collectMonitoredNotificationsFromBindings(bindings, activeSite);
  const libraryByDescription = new Map(
    library.map((row) => [String(row.description ?? "").trim(), row])
  );

  const merged = new Map<string, BoundNotificationOption>();
  for (const description of monitored) {
    const row = libraryByDescription.get(description);
    merged.set(normalize(description), {
      description,
      type: String(row?.type ?? "Default").trim() || "Default"
    });
  }
  for (const option of locationAlerts) {
    const description = String(option.description ?? "").trim();
    if (!description) continue;
    merged.set(normalize(description), option);
  }

  return Array.from(merged.values()).sort((a, b) => a.description.localeCompare(b.description));
}

export function mapBoundOptionsToPickerEvents(options: BoundNotificationOption[]): NotificationPickerEvent[] {
  return options.map((opt, index) => {
    const slug = normalize(opt.description).replace(/\s+/g, "-") || String(index);
    return {
      id: `bound-notif-${slug}`,
      name: opt.description,
      eventType: String(opt.type ?? "Default").trim() || "Default"
    };
  });
}

export function boundOptionsToNotificationRows(options: BoundNotificationOption[]): NotificationRow[] {
  return options.map((opt) => ({
    description: opt.description,
    type: String(opt.type ?? "Default").trim() || "Default",
    availability: "Available"
  }));
}

export async function loadNotificationPickerEventsForSite(
  site = readActiveSiteName()
): Promise<NotificationPickerEvent[]> {
  const options = await loadBoundNotificationOptionsForSite(site);
  return mapBoundOptionsToPickerEvents(options);
}

export type NotificationLibraryLoadResult = {
  items: NotificationRow[];
  authoritative: boolean;
  usedBundledFallback: boolean;
};

export async function loadNotificationLibraryState(site?: string): Promise<NotificationLibraryLoadResult> {
  const activeSite = String(site ?? readActiveSiteName()).trim();
  let sourceItems: NotificationRow[] = [];
  /** True only when KV returned a real payload object (including empty items[]). */
  let authoritativeLoad = false;
  let unavailableDefaultsApplied = false;

  try {
    const stored = activeSite
      ? await loadScopedFromApi<StoredNotificationLibrary>("libraries:notification", activeSite)
      : null;
    if (stored && typeof stored === "object") {
      authoritativeLoad = true;
      unavailableDefaultsApplied = Boolean(stored.unavailableDefaultsApplied);
      if (Array.isArray(stored.items) && stored.items.length) {
        sourceItems = filterFmNotificationRows(
          stored.items
            .map((row) => normalizeLoadedNotificationRow(row))
            .filter((row): row is NotificationRow => row != null)
        );
      }
      // Never re-run the old "mark all Unavailable + delete Traccar" migration.
      // If the flag is missing on an existing library, only set the flag — keep user settings.
    }
  } catch {
    // Transient API/KV failures must not look like an empty library.
    authoritativeLoad = false;
  }

  const usedBundledFallback = !sourceItems.length;
  if (usedBundledFallback) {
    sourceItems = filterFmNotificationRows(
      bundledNotificationRows.map((row) => ({
        ...row,
        description: String(row.description ?? "").trim()
      }))
    );
  }

  const ensured = ensureSiteTraccarDefaultNotifications(sourceItems);
  const withDigitalDefaults = applyDigitalEventLibraryDefaults(ensured.items);
  const items = filterFmNotificationRows(
    withDigitalDefaults.items
      .map((row) => normalizeLoadedNotificationRow(row))
      .filter((row): row is NotificationRow => row != null)
  );
  const libraryChanged = ensured.changed || withDigitalDefaults.changed;

  // Persist only when we know we read real storage — never write bundled seeds after a failed load
  // (that was wiping production libraries after deploys / KV blips).
  // Only rewrite when defaults were actually added. Do not rewrite solely because the flag is missing
  // (that raced with in-flight GETs and wiped newly created notifications).
  if (activeSite && authoritativeLoad && !usedBundledFallback && libraryChanged) {
    try {
      await saveScopedToApi(
        "libraries:notification",
        { items, unavailableDefaultsApplied: true },
        activeSite
      );
      dispatchNotificationLibraryUpdated();
    } catch {
      // Keep in-memory view even if persistence fails.
    }
  } else if (
    activeSite
    && authoritativeLoad
    && !usedBundledFallback
    && !libraryChanged
    && !unavailableDefaultsApplied
  ) {
    // Flag-only write: preserve existing items, mark migration complete.
    try {
      await saveScopedToApi(
        "libraries:notification",
        { items, unavailableDefaultsApplied: true },
        activeSite
      );
    } catch {
      // Ignore flag-only failures.
    }
  }

  return {
    items,
    authoritative: authoritativeLoad,
    usedBundledFallback
  };
}

export async function loadNotificationLibraryItems(site?: string): Promise<NotificationRow[]> {
  const result = await loadNotificationLibraryState(site);
  return result.items;
}

/** Persist notification library rows for a site (update in place — caller must merge, not append duplicates). */
export async function persistNotificationLibraryItemsForSite(
  site: string,
  items: NotificationRow[]
): Promise<boolean> {
  const activeSite = String(site ?? "").trim();
  if (!activeSite) return false;
  const cleaned = filterFmNotificationRows(
    items
      .map((row) => normalizeLoadedNotificationRow(row))
      .filter((row): row is NotificationRow => row != null)
  );
  const ok = await saveScopedToApi(
    "libraries:notification",
    { items: cleaned, unavailableDefaultsApplied: true },
    activeSite
  );
  if (ok) dispatchNotificationLibraryUpdated();
  return Boolean(ok);
}

/**
 * Removes auto-generated library template bindings only — never user bindings.
 */
export async function cleanupNotificationLibraryTemplateBindings(): Promise<void> {
  try {
    const activeSite = readActiveSiteName();
    if (!activeSite) return;
    const bindings = await getBindings<Record<string, unknown>>("notifications");
    for (const entry of bindings) {
      const id = String(entry?.id ?? "").trim();
      if (!id || !isNotificationLibraryTemplateBinding(entry)) continue;
      if (!bindingMatchesSite(entry, activeSite)) continue;
      await deleteBindingDetailed("notifications", id);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vivi:bindingschange"));
    }
  } catch {
    // ignore
  }
}

export async function removeFmMonitoredEventsFromAllBindings(): Promise<void> {
  try {
    const activeSite = readActiveSiteName();
    const bindings = await getBindings<Record<string, unknown>>("notifications");
    for (const binding of bindings) {
      if (!isUserNotificationBinding(binding)) continue;
      if (!activeSite || !bindingMatchesSite(binding, activeSite)) continue;
      const events = Array.isArray(binding.monitoredEvents) ? binding.monitoredEvents : [];
      const nextEvents = events.filter((event) => !isFmNotificationDescription(String(event ?? "")));
      if (nextEvents.length === events.length) continue;
      const id = String(binding.id ?? "").trim();
      if (!id) continue;
      await saveBindingDetailed("notifications", {
        ...binding,
        id,
        monitoredEvents: nextEvents
      });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vivi:bindingschange"));
    }
  } catch {
    // ignore
  }
}

export async function removeMonitoredEventFromAllBindings(description: string): Promise<void> {
  const target = String(description ?? "").trim();
  if (!target) return;

  try {
    const activeSite = readActiveSiteName();
    const bindings = await getBindings<Record<string, unknown>>("notifications");
    for (const binding of bindings) {
      if (!isUserNotificationBinding(binding)) continue;
      if (!activeSite || !bindingMatchesSite(binding, activeSite)) continue;
      const events = Array.isArray(binding.monitoredEvents) ? binding.monitoredEvents : [];
      if (!events.some((event) => String(event ?? "").trim() === target)) continue;
      const id = String(binding.id ?? "").trim();
      if (!id) continue;
      await saveBindingDetailed("notifications", {
        ...binding,
        id,
        monitoredEvents: events.filter((event) => String(event ?? "").trim() !== target)
      });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vivi:bindingschange"));
    }
  } catch {
    // ignore
  }
}

export async function propagateMonitoredEventRename(oldDescription: string, newDescription: string): Promise<void> {
  const from = String(oldDescription ?? "").trim();
  const to = String(newDescription ?? "").trim();
  if (!from || !to || normalize(from) === normalize(to)) return;
  if (isFmNotificationDescription(to)) {
    await removeMonitoredEventFromAllBindings(from);
    return;
  }

  try {
    const activeSite = readActiveSiteName();
    const bindings = await getBindings<Record<string, unknown>>("notifications");
    for (const binding of bindings) {
      if (!isUserNotificationBinding(binding)) continue;
      if (!activeSite || !bindingMatchesSite(binding, activeSite)) continue;
      const events = Array.isArray(binding.monitoredEvents) ? [...binding.monitoredEvents] : [];
      let changed = false;
      const nextEvents = events.map((event) => {
        if (String(event ?? "").trim() !== from) return event;
        changed = true;
        return to;
      });
      if (!changed) continue;
      const id = String(binding.id ?? "").trim();
      if (!id) continue;
      await saveBindingDetailed("notifications", {
        ...binding,
        id,
        monitoredEvents: filterFmNotificationRows(
          nextEvents.map((event) => ({ description: String(event ?? "") }))
        ).map((row) => row.description)
      });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vivi:bindingschange"));
    }
  } catch {
    // ignore propagation errors
  }
}

const matchesBindingRef = (ref: string, candidates: string[]) => {
  const key = normalize(ref);
  if (!key) return false;
  return candidates.some((candidate) => normalize(candidate) === key);
};

/**
 * Anchors legacy bindings (missing site) using a linked configuration group's site only.
 * Never stamps the active ribbon site — that would move old-site bindings onto a new site.
 */
export async function repairDeviceBindingsWithoutSite(): Promise<number> {
  let repaired = 0;

  try {
    const [bindings, configGroups] = await Promise.all([
      getBindings<Record<string, unknown>>("devices"),
      getConfigurationGroups<{
        site?: string;
        deviceBinding?: string;
      }>()
    ]);

    for (const binding of bindings) {
      const name = String(binding.name ?? "").trim();
      if (!name) continue;
      if (String(binding.site ?? "").trim()) continue;

      const refs = [String(binding.id ?? "").trim(), name].filter(Boolean);
      const linkedGroup = (configGroups ?? []).find((group) =>
        matchesBindingRef(String(group.deviceBinding ?? ""), refs)
      );
      const repairSite = String(linkedGroup?.site ?? "").trim();
      if (!repairSite) continue;

      const id = String(binding.id ?? "").trim();
      if (!id) continue;

      const result = await saveBindingDetailed("devices", {
        ...binding,
        id,
        site: repairSite
      });
      if (result.stored) repaired += 1;
    }

    if (repaired > 0 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vivi:bindingschange"));
    }
  } catch {
    // ignore
  }

  return repaired;
}

export async function repairNotificationBindingsWithoutSite(): Promise<number> {
  let repaired = 0;

  try {
    const [bindings, configGroups] = await Promise.all([
      getBindings<Record<string, unknown>>("notifications"),
      getConfigurationGroups<{
        site?: string;
        notificationBinding?: string;
      }>()
    ]);

    for (const binding of bindings) {
      if (!isUserNotificationBinding(binding)) continue;
      if (String(binding.site ?? "").trim()) continue;

      const refs = [String(binding.id ?? "").trim(), String(binding.name ?? "").trim()].filter(Boolean);
      const linkedGroup = (configGroups ?? []).find((group) =>
        matchesBindingRef(String(group.notificationBinding ?? ""), refs)
      );
      const repairSite = String(linkedGroup?.site ?? "").trim();
      if (!repairSite) continue;

      const id = String(binding.id ?? "").trim();
      if (!id) continue;

      const result = await saveBindingDetailed("notifications", {
        ...binding,
        id,
        site: repairSite
      });
      if (result.stored) repaired += 1;
    }

    if (repaired > 0 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vivi:bindingschange"));
    }
  } catch {
    // ignore
  }

  return repaired;
}

/** Notification library rows stay unavailable until an admin marks them Available in Libraries. */
export async function ensureSiteNotificationLibraryFuelEventsActive(_site?: string): Promise<void> {
  return;
}
