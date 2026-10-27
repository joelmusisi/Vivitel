import { readActiveSiteName, readActiveTenantId } from "./tenantContext";

const lastPrefetchByScope = new Map<string, number>();
const PREFETCH_COOLDOWN_MS = 8_000;

function scopeKey(path: string) {
  return `${readActiveTenantId() || "_"}::${readActiveSiteName() || "_"}::${path}`;
}

/** Warm list caches when the user hovers a nav link so the page paints from cache. */
export function prefetchNavRoute(path: string) {
  const key = scopeKey(path);
  const now = Date.now();
  const last = lastPrefetchByScope.get(key) ?? 0;
  if (now - last < PREFETCH_COOLDOWN_MS) return;
  lastPrefetchByScope.set(key, now);

  void (async () => {
    try {
      if (path === "/Control/config/templates") {
        const { getBindings } = await import("./api");
        await Promise.all([
          getBindings("notifications"),
          getBindings("locations"),
          getBindings("devices")
        ]);
        return;
      }
      if (path === "/Control/config/libraries") {
        const { loadScopedFromApi } = await import("./scopeStorage");
        await Promise.all([
          loadScopedFromApi("libraries:notification"),
          loadScopedFromApi("libraries:location")
        ]);
        return;
      }
      if (path === "/Track/fleet/drivers") {
        const { getDriversFromApi } = await import("./api");
        await getDriversFromApi();
        return;
      }
      if (path === "/Track/fleet/passengers") {
        const { loadScopedFromApi } = await import("./scopeStorage");
        await loadScopedFromApi("fleet:passengers");
      }
    } catch {
      lastPrefetchByScope.delete(key);
    }
  })();
}
