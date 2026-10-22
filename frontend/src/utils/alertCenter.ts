import {
  enrichLiveNotifications,
  mapTraccarEventToLiveNotification,
  pollTraccarLiveEvents,
  pollViviServerUserAlerts,
  STREAM_LIVE_INITIAL_LOOKBACK_MS,
  STREAM_LIVE_POLL_MS,
  STREAM_LIVE_POLL_OVERLAP_MS,
  type StreamLiveNotification
} from "./streamLive";

/**
 * Global alert poller for badge / event counts.
 * Stream bells play only while the Streams page is open (see Streams.tsx).
 */
let started = false;
let pollTimer: number | null = null;
let seenEventIds = new Set<string>();
let isInitialPoll = true;
let lastPollTo = new Date().toISOString();
let activeUserKey = "";

const resetCenter = () => {
  seenEventIds = new Set();
  isInitialPoll = true;
  lastPollTo = new Date().toISOString();
};

const readActiveUserKey = () => {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("vivi.auth.principal");
    if (!raw) return "";
    const principal = JSON.parse(raw) as { userId?: string; email?: string };
    return String(principal?.userId ?? principal?.email ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
};
const runPoll = async () => {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const to = new Date().toISOString();
  const from = isInitialPoll
    ? new Date(Date.now() - STREAM_LIVE_INITIAL_LOOKBACK_MS).toISOString()
    : new Date(Math.max(0, Date.parse(lastPollTo) - STREAM_LIVE_POLL_OVERLAP_MS)).toISOString();
  try {
    const [{ events, deviceLabels }, serverAlerts] = await Promise.all([
      pollTraccarLiveEvents({ from, to }),
      pollViviServerUserAlerts(from)
    ]);
    lastPollTo = to;

    const fresh: StreamLiveNotification[] = [];
    for (const event of events) {
      const key = `${event.deviceId}-${event.id}`;
      if (seenEventIds.has(key)) continue;
      seenEventIds.add(key);
      fresh.push(mapTraccarEventToLiveNotification(event, deviceLabels));
    }
    for (const note of serverAlerts) {
      if (seenEventIds.has(note.id)) continue;
      seenEventIds.add(note.id);
      fresh.push(note);
    }

    const enrichedFresh = await enrichLiveNotifications(fresh);

    if (enrichedFresh.length > 0 && !isInitialPoll && typeof window !== "undefined") {
      // Silent off Streams: badge updates only. Audio is owned by the Streams page.
      window.dispatchEvent(new CustomEvent("vivi:alertcenter", { detail: { count: enrichedFresh.length } }));
    }
    isInitialPoll = false;
  } catch {
    // Ignore transient polling errors; next tick retries.
  }
};

const onVisibilityChange = () => {
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    void runPoll();
  }
};

/** Start the global alert poller (silent). Idempotent. */
export function startAlertCenter(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  resetCenter();
  activeUserKey = readActiveUserKey();

  void runPoll();
  pollTimer = window.setInterval(() => {
    const userKey = readActiveUserKey();
    if (userKey && userKey !== activeUserKey) {
      activeUserKey = userKey;
      resetCenter();
    }
    void runPoll();
  }, STREAM_LIVE_POLL_MS);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("vivi:orgchange", resetCenter);
  window.addEventListener("vivi:contextchange", resetCenter);
  window.addEventListener("vivi:authchange", resetCenter);
}
/** Stop the global alert poller. */
export function stopAlertCenter(): void {
  if (!started || typeof window === "undefined") return;
  started = false;
  if (pollTimer != null) window.clearInterval(pollTimer);
  pollTimer = null;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("vivi:orgchange", resetCenter);
  window.removeEventListener("vivi:contextchange", resetCenter);
  window.removeEventListener("vivi:authchange", resetCenter);
}