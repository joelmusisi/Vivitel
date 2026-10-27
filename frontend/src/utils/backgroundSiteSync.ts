import { getAssetsFromApi, getBindings, getDriversFromApi, getTraccarLive } from "./api";
import { preloadHomeDashboardForActiveSite } from "./homeDashboardApi";
import { readHomeSiteScope } from "./homeSiteScope";

const LIGHT_MS = 45_000;
const METRICS_MS = 3 * 60_000;
const HIDDEN_LIGHT_MS = 2 * 60_000;
const HIDDEN_METRICS_MS = 6 * 60_000;

let timer: number | null = null;
let running = false;
let pending = false;
let stopped = true;
let lastMetricsAt = 0;

const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

const siteKey = () => readHomeSiteScope().scopedSites.join("|");

const whenIdle = () =>
  new Promise<void>((resolve) => {
    const ric = window.requestIdleCallback;
    if (typeof ric === "function") {
      ric(() => resolve(), { timeout: 4_000 });
      return;
    }
    window.setTimeout(resolve, 800);
  });

const clearTimer = () => {
  if (timer == null) return;
  window.clearTimeout(timer);
  timer = null;
};

const schedule = (delay?: number) => {
  if (stopped) return;
  clearTimer();
  const wait = delay ?? (hidden() ? HIDDEN_LIGHT_MS : LIGHT_MS);
  timer = window.setTimeout(() => {
    timer = null;
    void runCycle();
  }, wait);
};

async function runCycle() {
  if (stopped) return;
  if (running) {
    pending = true;
    return;
  }

  const scope = readHomeSiteScope();
  if (!scope.ready) {
    schedule(2_000);
    return;
  }

  running = true;
  const startedFor = siteKey();
  const sameSite = () => !stopped && siteKey() === startedFor;

  try {
    const refreshedAssets = await getAssetsFromApi({ force: true }).catch(() => undefined);
    if (!sameSite()) return;
    if (refreshedAssets) {
      window.dispatchEvent(new Event("vivi:assetsrefresh"));
    }

    await Promise.all([
      getBindings("notifications").catch(() => undefined),
      getBindings("locations").catch(() => undefined),
      getBindings("devices").catch(() => undefined),
      getDriversFromApi().catch(() => undefined),
      getTraccarLive().catch(() => undefined)
    ]);
    if (!sameSite()) return;

    const metricsEvery = hidden() ? HIDDEN_METRICS_MS : METRICS_MS;
    if (Date.now() - lastMetricsAt >= metricsEvery) {
      lastMetricsAt = Date.now();
      await whenIdle();
      if (!sameSite()) return;
      await preloadHomeDashboardForActiveSite().catch(() => undefined);
    }
  } finally {
    running = false;
    if (stopped) return;
    if (pending) {
      pending = false;
      void runCycle();
      return;
    }
    schedule();
  }
}

const onScopeChange = () => {
  lastMetricsAt = 0;
  void runCycle();
};

const onVisibility = () => {
  if (document.visibilityState === "visible") void runCycle();
};

/** Keep site caches warm while the user is signed in, including pages they have not opened. */
export function startBackgroundSiteSync() {
  if (!stopped) return;
  stopped = false;
  window.addEventListener("vivi:orgchange", onScopeChange);
  window.addEventListener("vivi:contextchange", onScopeChange);
  document.addEventListener("visibilitychange", onVisibility);
  void runCycle();
}

export function stopBackgroundSiteSync() {
  stopped = true;
  pending = false;
  running = false;
  clearTimer();
  window.removeEventListener("vivi:orgchange", onScopeChange);
  window.removeEventListener("vivi:contextchange", onScopeChange);
  document.removeEventListener("visibilitychange", onVisibility);
}
