import type { TraccarEvent, ViviUserAlert } from "./api";
import { getSharedRealtimeClient, type RealtimeStatus } from "./realtimeWs";
import { readActiveSiteName } from "./tenantContext";

export type StreamBackgroundBatch = {
  events: TraccarEvent[];
  alerts: ViviUserAlert[];
};

type BatchListener = (batch: StreamBackgroundBatch) => void;
type StatusListener = (open: boolean) => void;

const ENABLED_KEY = "vivi.streams.backgroundEnabled";
const BUFFER_MAX = 400;

let unsubscribe: (() => void) | null = null;
let wsOpen = false;
let buffer: StreamBackgroundBatch[] = [];
const batchListeners = new Set<BatchListener>();
const statusListeners = new Set<StatusListener>();

export function markStreamsBackgroundEnabled(): void {
  try {
    window.localStorage.setItem(ENABLED_KEY, "1");
  } catch {
    // storage unavailable
  }
}

export function isStreamsBackgroundEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Keeps the realtime "streams" channel subscribed for the whole app session so events keep
 * arriving (and are buffered) while the Streams page is closed.
 */
export function startStreamsBackground(): void {
  if (typeof window === "undefined" || unsubscribe) return;
  unsubscribe = getSharedRealtimeClient().subscribe({
    channels: ["streams"],
    site: readActiveSiteName(),
    onStatus: (status: RealtimeStatus) => {
      wsOpen = status === "open";
      statusListeners.forEach((listener) => listener(wsOpen));
    },
    onMessage: (message) => {
      if (message.type !== "streams.events") return;
      const payload = (message.payload ?? {}) as { events?: TraccarEvent[]; alerts?: ViviUserAlert[] };
      const batch: StreamBackgroundBatch = {
        events: Array.isArray(payload.events) ? payload.events : [],
        alerts: Array.isArray(payload.alerts) ? payload.alerts : []
      };
      if (!batch.events.length && !batch.alerts.length) return;
      buffer.push(batch);
      let total = 0;
      for (let i = buffer.length - 1; i >= 0; i -= 1) {
        total += buffer[i].events.length + buffer[i].alerts.length;
        if (total > BUFFER_MAX) {
          buffer = buffer.slice(i + 1);
          break;
        }
      }
      batchListeners.forEach((listener) => listener(batch));
    }
  });
}

export function stopStreamsBackground(): void {
  unsubscribe?.();
  unsubscribe = null;
  wsOpen = false;
  buffer = [];
}

/** Replays batches received while no listener was attached, then streams new ones. */
export function listenToStreamsBackground(onBatch: BatchListener, onStatus: StatusListener): () => void {
  startStreamsBackground();
  batchListeners.add(onBatch);
  statusListeners.add(onStatus);
  onStatus(wsOpen);
  for (const batch of buffer) onBatch(batch);
  return () => {
    batchListeners.delete(onBatch);
    statusListeners.delete(onStatus);
  };
}
