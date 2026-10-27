/** Detect Vite/webpack dynamic-import failures after deploy or flaky CDN. */
export function isChunkLoadError(error: unknown): boolean {
  const message = String(
    error instanceof Error ? error.message : (error as { message?: string })?.message ?? error ?? ""
  );
  return (
    /Failed to fetch dynamically imported module/i.test(message)
    || /Loading chunk [\d]+ failed/i.test(message)
    || /Importing a module script failed/i.test(message)
    || /error loading dynamically imported module/i.test(message)
    || /Unable to preload CSS/i.test(message)
  );
}

const RELOAD_KEY = "vivi.chunkReloadAt";
const RELOAD_COOLDOWN_MS = 15_000;

/** Reload once per cooldown to pick up a fresh index.html / chunk map. */
export function reloadForStaleChunk(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last <= RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage may be blocked; still attempt a single reload.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_vivi_chunk", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}
