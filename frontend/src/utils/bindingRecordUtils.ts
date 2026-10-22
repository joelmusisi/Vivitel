export type BindingType = "notifications" | "locations" | "devices";

/** Auto-mirrored location-library rows must never appear as Location Bindings. */
export const LOCATION_LIBRARY_BINDING_ID_PREFIX = "location-lib:";

const slug = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function isLocationLibraryTemplateBinding(row: unknown): boolean {
  const id = String((row as { id?: unknown })?.id ?? "").trim().toLowerCase();
  return id.startsWith(LOCATION_LIBRARY_BINDING_ID_PREFIX);
}

/** User-created location bindings only — never location-library mirror rows. */
export function isUserLocationBinding(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  if (isLocationLibraryTemplateBinding(row)) return false;
  const name = String((row as { name?: unknown }).name ?? "").trim();
  if (!name) return false;
  if (name === "Default Locations") return false;
  return true;
}

/** Stable dedupe key: bindings are unique per site + name within a database tenant. */
export function bindingDedupeKey(type: BindingType, row: { id?: unknown; name?: unknown; site?: unknown }): string {
  const name = String(row?.name ?? "").trim().toLowerCase();
  if (!name) return String(row?.id ?? "").trim();
  const site = String(row?.site ?? "").trim().toLowerCase();
  if (type === "notifications" || type === "locations" || type === "devices") {
    return site ? `${site}::${name}` : `::${name}`;
  }
  return `${type}::${name}`;
}

export function buildStableBindingId(type: BindingType, name: string, site?: string): string {
  const n = slug(name) || "binding";
  const s = slug(String(site ?? "")) || "site";
  if (type === "notifications") return `notif:${s}:${n}`;
  if (type === "locations") return `loc:${s}:${n}`;
  return `dev:${s}:${n}`;
}

export function dedupeBindingRows<T extends { id?: unknown; name?: unknown; site?: unknown }>(
  type: BindingType,
  items: T[]
): T[] {
  const byKey = new Map<string, T>();
  for (const item of items ?? []) {
    const key = bindingDedupeKey(type, item);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      continue;
    }
    const prevEvents = Array.isArray((prev as any).monitoredEvents) ? (prev as any).monitoredEvents.length : 0;
    const nextEvents = Array.isArray((item as any).monitoredEvents) ? (item as any).monitoredEvents.length : 0;
    byKey.set(key, nextEvents >= prevEvents ? item : prev);
  }
  return [...byKey.values()];
}

export function resolveBindingRecordForSave<T extends { id?: string; name?: string; site?: string }>(
  type: BindingType,
  payload: T,
  existing: T[]
): { record: T; isUpdate: boolean; error?: string } {
  const name = String(payload.name ?? "").trim();
  if (!name) return { record: payload, isUpdate: false, error: "Binding name is required." };

  const site = String(payload.site ?? "").trim();
  if (!site) {
    return {
      record: payload,
      isUpdate: false,
      error: "Bindings must be anchored to a site. Select a site in the organisation ribbon before saving."
    };
  }

  const draftId = String(payload.id ?? "").trim();
  const key = bindingDedupeKey(type, payload);
  const match = existing.find((row) => bindingDedupeKey(type, row) === key);
  const matchId = match ? String((match as any).id ?? "").trim() : "";

  if (match) {
    if (draftId && matchId && draftId !== matchId) {
      const siteHint =
        type === "notifications" && String(payload.site ?? "").trim()
          ? ` for site "${String(payload.site).trim()}"`
          : "";
      return {
        record: payload,
        isUpdate: false,
        error: `A binding named "${name}" already exists${siteHint}. Edit the existing row instead.`
      };
    }
    return { record: { ...payload, id: matchId || draftId || buildStableBindingId(type, name, payload.site) }, isUpdate: true };
  }

  const id = draftId || buildStableBindingId(type, name, payload.site);
  return { record: { ...payload, id }, isUpdate: Boolean(draftId) };
}

export function bindingIdsToPruneAfterSave<T extends { id?: unknown; name?: unknown; site?: unknown }>(
  type: BindingType,
  saved: T,
  existing: T[]
): string[] {
  const keepId = String(saved.id ?? "").trim();
  const key = bindingDedupeKey(type, saved);
  if (!keepId || !key) return [];
  return existing
    .map((row) => String(row.id ?? "").trim())
    .filter((id) => id && id !== keepId && bindingDedupeKey(type, existing.find((r) => String(r.id) === id) ?? {}) === key);
}
