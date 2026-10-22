import { siteScopesMatch } from "./scopeIsolation";

export const LOCATION_ALERTS_KV_BASE = "libraries:location-alerts";

type AlertItem = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();

/** Site-scoped key `libraries:location-alerts:tenant:{t}:site:{s}` → its parts, otherwise null. */
export function parseLocationAlertsKey(key: string): { tenantToken: string; siteToken: string } | null {
  const match = /^libraries:location-alerts:tenant:([^:]+):site:([^:]+)$/.exec(text(key));
  return match ? { tenantToken: match[1], siteToken: match[2] } : null;
}

export function parseLocationAlertItems(raw: string | null | undefined): AlertItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { items?: unknown } | unknown[];
    const items = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown })?.items;
    return Array.isArray(items)
      ? items.filter((row): row is AlertItem => Boolean(row) && typeof row === "object")
      : [];
  } catch {
    return [];
  }
}

/** Stable identity: explicit id first, otherwise site + name + type so re-imports never duplicate. */
export function locationAlertIdentity(item: AlertItem): string {
  const id = lower(item.id);
  if (id) return `id:${id}`;
  return `n:${lower(item.site)}|${lower(item.eventName ?? item.name)}|${lower(item.eventType)}`;
}

const stamp = (item: AlertItem) => {
  const parsed = Date.parse(text(item.updatedAt) || text(item.createdAt));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Union by identity. When both sides hold the same alert the more recently updated one wins
 * (ties favour `incoming`). Nothing is ever dropped — removals travel as status "removed".
 */
export function mergeLocationAlertItems(existing: AlertItem[], incoming: AlertItem[]): AlertItem[] {
  const merged = new Map<string, AlertItem>();
  for (const row of existing) merged.set(locationAlertIdentity(row), row);
  for (const row of incoming) {
    const identity = locationAlertIdentity(row);
    const current = merged.get(identity);
    if (!current || stamp(row) >= stamp(current)) merged.set(identity, { ...current, ...row });
  }
  return Array.from(merged.values());
}

/** Strict isolation: only items explicitly stamped with this exact site are adopted. */
export function itemsForSite(items: AlertItem[], site: string, siteToken: string): AlertItem[] {
  return items.filter((row) => {
    const rowSite = text(row.site);
    return rowSite && (siteScopesMatch(rowSite, site) || siteScopesMatch(rowSite, siteToken));
  });
}

/**
 * Items allowed inside a site's own storage slot: unstamped items (they live in this slot by
 * construction) or items stamped with this exact site. Foreign-site items are never returned or stored.
 */
export function confineToSite(items: AlertItem[], siteToken: string): AlertItem[] {
  return items.filter((row) => {
    const rowSite = text(row.site);
    return !rowSite || siteScopesMatch(rowSite, siteToken);
  });
}

export const serializeLocationAlerts = (items: AlertItem[]) => JSON.stringify({ items });
