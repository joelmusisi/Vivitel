/**
 * Info Hub Streams monitor — server-side copy of per-user stream selections.
 * Used so selected notification types are tracked / pushed even when Streams UI is closed.
 */

export type InfoHubStreamPreferences = {
  name?: string;
  activeEventsEnabled?: boolean;
  selectedEvents?: string[];
  selectedEventTypes?: Record<string, string>;
  selectedAssets?: string[];
  playSounds?: boolean;
  eventPlaySounds?: Record<string, boolean>;
  undocked?: boolean;
  removed?: boolean;
};

export type InfoHubStreamRow = {
  id: string;
  name: string;
  source?: string;
};

export type InfoHubSiteStreamMonitor = {
  customStreams?: InfoHubStreamRow[];
  preferences?: Record<string, InfoHubStreamPreferences>;
  monitoredTypes?: string[];
  monitoredLabels?: string[];
  updatedAt?: string;
};

export type InfoHubStreamMonitorRecord = {
  bySite?: Record<string, InfoHubSiteStreamMonitor>;
  updatedAt?: string;
};

export type StreamMonitorKv = {
  get: (key: string) => Promise<string | null | undefined>;
  put: (key: string, value: string) => Promise<void>;
};

const STREAM_MONITOR_PREFIX = "vivi:infohub-stream-monitor:";

export function infoHubStreamMonitorKvKey(tenantId: string, userId: string) {
  return `${STREAM_MONITOR_PREFIX}${String(tenantId ?? "").trim()}:${String(userId ?? "").trim()}`;
}

function normalizeToken(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function siteTokenForStreamMonitor(site: string) {
  return normalizeToken(site) || "_none";
}

function parseMonitor(raw: string | null | undefined): InfoHubStreamMonitorRecord {
  if (!raw) return { bySite: {} };
  try {
    const parsed = JSON.parse(raw) as InfoHubStreamMonitorRecord;
    if (!parsed || typeof parsed !== "object") return { bySite: {} };
    return {
      bySite: parsed.bySite && typeof parsed.bySite === "object" ? parsed.bySite : {},
      updatedAt: String(parsed.updatedAt ?? "").trim() || undefined
    };
  } catch {
    return { bySite: {} };
  }
}

export async function readInfoHubStreamMonitor(
  kv: StreamMonitorKv,
  tenantId: string,
  userId: string
): Promise<InfoHubStreamMonitorRecord> {
  const raw = await kv.get(infoHubStreamMonitorKvKey(tenantId, userId));
  return parseMonitor(raw);
}

export async function writeInfoHubStreamMonitor(
  kv: StreamMonitorKv,
  tenantId: string,
  userId: string,
  record: InfoHubStreamMonitorRecord
): Promise<void> {
  const key = infoHubStreamMonitorKvKey(tenantId, userId);
  const payload: InfoHubStreamMonitorRecord = {
    bySite: record.bySite ?? {},
    updatedAt: new Date().toISOString()
  };
  await kv.put(key, JSON.stringify(payload));
}

export async function upsertInfoHubSiteStreamMonitor(
  kv: StreamMonitorKv,
  tenantId: string,
  userId: string,
  site: string,
  siteMonitor: InfoHubSiteStreamMonitor
): Promise<InfoHubStreamMonitorRecord> {
  const current = await readInfoHubStreamMonitor(kv, tenantId, userId);
  const token = siteTokenForStreamMonitor(site);
  const next: InfoHubStreamMonitorRecord = {
    bySite: {
      ...(current.bySite ?? {}),
      [token]: {
        ...siteMonitor,
        updatedAt: new Date().toISOString()
      }
    },
    updatedAt: new Date().toISOString()
  };
  await writeInfoHubStreamMonitor(kv, tenantId, userId, next);
  return next;
}

/** Collect monitored Traccar types for a user, optionally limited to one site. */
export function collectMonitoredTypesForUser(
  record: InfoHubStreamMonitorRecord,
  site?: string
): Set<string> {
  const types = new Set<string>();
  const bySite = record.bySite ?? {};
  const tokens = site
    ? [siteTokenForStreamMonitor(site)]
    : Object.keys(bySite);

  for (const token of tokens) {
    const siteRow = bySite[token];
    if (!siteRow) continue;
    for (const typeKey of siteRow.monitoredTypes ?? []) {
      const trimmed = String(typeKey ?? "").trim();
      if (trimmed) types.add(trimmed);
    }
    for (const prefs of Object.values(siteRow.preferences ?? {})) {
      if (!prefs || prefs.removed || prefs.activeEventsEnabled === false) continue;
      for (const typeKey of Object.values(prefs.selectedEventTypes ?? {})) {
        const trimmed = String(typeKey ?? "").trim();
        if (trimmed && trimmed.toLowerCase() !== "default") types.add(trimmed);
      }
    }
  }
  return types;
}

export function eventTypeMatchesStreamMonitor(
  eventType: string,
  monitoredTypes: Set<string>
): boolean {
  const typeKey = String(eventType ?? "").trim();
  if (!typeKey || monitoredTypes.size === 0) return false;
  if (monitoredTypes.has(typeKey)) return true;
  const lower = typeKey.toLowerCase();
  for (const allowed of monitoredTypes) {
    if (String(allowed).trim().toLowerCase() === lower) return true;
  }
  return false;
}
