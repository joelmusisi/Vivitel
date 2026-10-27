import { siteScopesMatch } from "./scopeIsolation";

const eventKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

/** A notification binding applies only when it is anchored to the asset's site and monitors that event. */
export function bindingCoversSiteEvent(
  binding: { site?: string; monitoredEvents?: string[] },
  notificationName: string,
  assetSite: string
): boolean {
  if (!siteScopesMatch(String(binding.site ?? ""), String(assetSite ?? ""))) return false;
  const name = eventKey(notificationName);
  if (!name) return false;
  return (binding.monitoredEvents ?? []).some((item) => eventKey(item) === name);
}

/** True when at least one binding on the asset's site monitors this notification. */
export function siteMonitorsNotification(
  bindings: Array<{ site?: string; monitoredEvents?: string[] }>,
  notificationName: string,
  assetSite: string
): boolean {
  return bindings.some((binding) => bindingCoversSiteEvent(binding, notificationName, assetSite));
}

/** A library row can alert only after it has been set to Available. */
export function libraryNotificationIsAvailable(
  items: Array<{ description?: string; availability?: string }>,
  notificationName: string
): boolean {
  const name = eventKey(notificationName);
  if (!name) return false;
  const row = items.find((item) => eventKey(item.description) === name);
  if (!row) return false;
  return eventKey(row.availability) === "available";
}
