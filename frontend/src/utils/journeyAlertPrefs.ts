import { getCachedPrincipal, loadFromApi, saveToApi } from "./api";
import { JOURNEY_STATUS_OPTIONS, type JourneyStatusOption } from "./journeyCatalog";

export type JourneyStatusPref = {
  enabled: boolean;
  playSound: boolean;
};

export type JourneyAlertPrefs = Record<JourneyStatusOption, JourneyStatusPref>;

const CHANGE_EVENT = "vivi-journey-alert-prefs";

function accountKey(): string {
  const principal = getCachedPrincipal()?.principal as { userId?: string; kind?: string } | undefined;
  const userId = String(principal?.userId ?? "").trim();
  if (userId) return userId;
  if (String(principal?.kind ?? "").toLowerCase() === "admin") return "admin";
  return "anon";
}

function storageKey(userId = accountKey()): string {
  return `user-prefs:journey-alerts:${userId}`;
}

export function defaultJourneyAlertPrefs(): JourneyAlertPrefs {
  return JOURNEY_STATUS_OPTIONS.reduce((acc, status) => {
    acc[status] = { enabled: false, playSound: false };
    return acc;
  }, {} as JourneyAlertPrefs);
}

export function normalizeJourneyAlertPrefs(raw: unknown): JourneyAlertPrefs {
  const base = defaultJourneyAlertPrefs();
  if (!raw || typeof raw !== "object") return base;
  const source = raw as Record<string, Partial<JourneyStatusPref>>;
  for (const status of JOURNEY_STATUS_OPTIONS) {
    const row = source[status];
    if (!row || typeof row !== "object") continue;
    base[status] = {
      enabled: Boolean(row.enabled),
      playSound: Boolean(row.playSound)
    };
  }
  return base;
}

export async function loadJourneyAlertPrefs(): Promise<JourneyAlertPrefs> {
  const stored = await loadFromApi<{ prefs?: JourneyAlertPrefs }>(storageKey());
  return normalizeJourneyAlertPrefs(stored?.prefs);
}

export async function saveJourneyAlertPrefs(prefs: JourneyAlertPrefs): Promise<boolean> {
  const normalized = normalizeJourneyAlertPrefs(prefs);
  const ok = await saveToApi(storageKey(), {
    userId: accountKey(),
    prefs: normalized,
    updatedAt: new Date().toISOString()
  });
  if (ok && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: normalized }));
  }
  return ok;
}

export function subscribeJourneyAlertPrefs(listener: (prefs: JourneyAlertPrefs) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<JourneyAlertPrefs>).detail;
    listener(normalizeJourneyAlertPrefs(detail));
  };
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
