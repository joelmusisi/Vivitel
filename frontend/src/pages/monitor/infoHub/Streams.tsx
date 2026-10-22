import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { AssetTypeIcon } from "../../../components/AssetTypeIcon";
import "leaflet/dist/leaflet.css";
import {
  loadBoundNotificationOptionsForSite,
  loadNotificationLibraryItems,
  type BoundNotificationOption
} from "../../../utils/notificationLibraryStore";
import { LOCATION_ALERTS_UPDATED_EVENT } from "../../../utils/locationAlertNotifications";
import { sitesEquivalent } from "../../../utils/bindingResolve";
import { siteScopeToken } from "../../../utils/scopeStorage";
import { matchesStoredSiteSelection, readStoredSelectionScope } from "../../../utils/selectionScope";
import {
  readActiveSiteName,
  readTenantScopedJson,
  readUserScopedJson,
  writeUserScopedJson
} from "../../../utils/tenantContext";
import {
  assetMatchesAllowedNames,
  buildCachedDeviceLabelIndex,
  collectMonitoredLabelsFromPreferences,
  collectMonitoredTypesFromPreferences,
  enrichLiveNotifications,
  filterOverspeedByLibraryThreshold,
  isTraccarEventTypeKey,
  mapTraccarEventToLiveNotification,
  mapViviUserAlertToLiveNotification,
  mergeLiveNotifications,
  noteMatchesStreamPreferences,
  playBellsForNotifications,
  pollTraccarLiveEvents,
  pollViviServerUserAlerts,
  readStreamAssetsFromCache,
  registerBoundNotificationAliases,
  resumeStreamAudio,
  setStreamsPageActive,
  STREAM_LIVE_INITIAL_LOOKBACK_MS,
  STREAM_LIVE_POLL_MS,
  STREAM_LIVE_POLL_OVERLAP_MS,
  type StreamLiveNotification
} from "../../../utils/streamLive";
import { listenToStreamsBackground, markStreamsBackgroundEnabled } from "../../../utils/streamBackground";
import type { TraccarEvent, ViviUserAlert } from "../../../utils/api";
import {
  actionUserAlertApi,
  buildApiUrl,
  formatTimestampForSite,
  getApiKey,
  getInfoHubStreamMonitorFromApi,
  getInfoHubNotificationsFromApi,
  saveInfoHubNotificationsToApi,
  getSiteTimeZoneSettings,
  getTenantId,
  saveInfoHubStreamMonitorToApi,
  SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT,
  type SiteTimeZoneSettings
} from "../../../utils/api";
import { beginSaving, endSavingDone, endSavingError } from "../../../utils/saveFeedback";
import { showToast } from "../../../utils/toast";
import JourneyStatusAlerts from "../../../components/journey/JourneyStatusAlerts";
import "../../../index.css";

const streamDetailPinIcon = L.divIcon({
  html: `<svg width="28" height="40" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z" fill="#e53e3e"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg>`,
  className: "",
  iconSize: [28, 40],
  iconAnchor: [14, 40]
});

function StreamDetailMapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [lat, lng, map]);
  return null;
}

function StreamDetailMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="streams-detail-map">
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        scrollWheelZoom
        zoomControl={false}
        className="streams-detail-leaflet"
      >
        <TileLayer
          attribution="&copy; Google Maps"
          url="https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          subdomains="0123"
        />
        <Marker position={[lat, lng]} icon={streamDetailPinIcon} />
        <StreamDetailMapRecenter lat={lat} lng={lng} />
      </MapContainer>
    </div>
  );
}

type StreamNotification = {
  id: string;
  asset: string;
  event: string;
  location: string;
  speed: string;
  distance: string;
  driver: string;
  minutesAgo: number;
  actioned: boolean;
  actionDecision?: "yes" | "no" | "";
  actionNote?: string;
  actionedAt?: string;
  actionedByName?: string;
  actionedByEmail?: string;
  severity: "info" | "warning" | "critical";
  timestamp?: number;
  deviceId?: number;
  traccarType?: string;
  serverAlertId?: string;
  positionId?: number;
  lat?: number;
  lng?: number;
  heading?: number;
};

type StreamRow = {
  id: string;
  name: string;
  source: string;
  notifications: StreamNotification[];
  lastEvent: string;
  alerts: number;
};

type StreamPreferences = {
  name?: string;
  activeEventsEnabled?: boolean;
  selectedEvents?: string[];
  /** description → Traccar / library type for precise per-stream filtering */
  selectedEventTypes?: Record<string, string>;
  selectedAssets?: string[];
  playSounds?: boolean;
  eventPlaySounds?: Record<string, boolean>;
  undocked?: boolean;
  removed?: boolean;
};

type CustomStream = {
  id: string;
  name: string;
  source: string;
};

type StreamAsset = {
  id: string;
  name: string;
  site: string;
};

const CUSTOM_STREAMS_KEY = "vivi.infoHub.customStreams";
const STREAM_PREFS_KEY = "vivi.infoHub.streamPreferences";
const NOTIFICATIONS_KEY = "vivi.infoHub.notifications";
const STREAM_NOTIFICATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STREAM_NOTIFICATIONS_PER_COLUMN = 50;

/** Info Hub settings are site-scoped — never share streams/prefs across sites. */
const infoHubSiteStorageBase = (base: string) => {
  const token = siteScopeToken(readActiveSiteName()) || "_none";
  return `${base}:site:${token}`;
};

type StoredNotification = Record<string, unknown>;

const parseTimestamp = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const normalizeSeverity = (value: unknown): StreamNotification["severity"] => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "critical" || raw === "warning" || raw === "info") return raw;
  return "info";
};

const mapNotification = (item: StoredNotification, index: number): StreamNotification => {
  const timestamp =
    parseTimestamp(item.timestamp)
    ?? parseTimestamp(item.time)
    ?? parseTimestamp(item.occurredAt)
    ?? parseTimestamp(item.eventTime)
    ?? null;
  const minutesAgo = timestamp ? Math.max(0, Math.floor((Date.now() - timestamp) / 60000)) : 0;
  return {
    id: String(item.id ?? item.eventId ?? item.uuid ?? `note-${index}`),
    asset: String(item.asset ?? item.assetDescription ?? item.registration ?? item.vehicle ?? item.deviceName ?? ""),
    event: String(item.event ?? item.type ?? item.name ?? item.notification ?? "Notification"),
    location: String(item.location ?? item.locationName ?? item.site ?? item.address ?? ""),
    speed: String(item.speed ?? item.speedKph ?? item.velocity ?? ""),
    distance: String(item.distance ?? item.distanceKm ?? item.odometer ?? item.mileage ?? ""),
    driver: String(item.driver ?? item.driverName ?? ""),
    minutesAgo,
    actioned: Boolean(item.actioned ?? item.isActioned ?? item.acknowledged ?? item.read ?? false),
    actionDecision: (String(item.actionDecision ?? "").toLowerCase() === "yes" || String(item.actionDecision ?? "").toLowerCase() === "no"
      ? String(item.actionDecision).toLowerCase()
      : "") as StreamNotification["actionDecision"],
    actionNote: String(item.actionNote ?? "").trim() || undefined,
    actionedAt: String(item.actionedAt ?? "").trim() || undefined,
    actionedByName: String(item.actionedByName ?? "").trim() || undefined,
    actionedByEmail: String(item.actionedByEmail ?? "").trim() || undefined,
    severity: normalizeSeverity(item.severity ?? item.level),
    timestamp: timestamp ?? undefined,
    deviceId: Number(item.deviceId) || undefined,
    traccarType: String(item.traccarType ?? item.eventType ?? "").trim() || undefined,
    serverAlertId: String(item.serverAlertId ?? "").trim() || undefined,
    positionId: Number(item.positionId) > 0 ? Number(item.positionId) : undefined,
    lat: Number.isFinite(Number(item.lat ?? item.latitude)) ? Number(item.lat ?? item.latitude) : undefined,
    lng: Number.isFinite(Number(item.lng ?? item.longitude ?? item.lon))
      ? Number(item.lng ?? item.longitude ?? item.lon)
      : undefined,
    heading: Number.isFinite(Number(item.heading ?? item.course))
      ? Number(item.heading ?? item.course)
      : undefined
  };
};

const readStoredNotifications = (): StreamNotification[] => {
  if (typeof window === "undefined") return [];
  const key = infoHubSiteStorageBase(NOTIFICATIONS_KEY);
  const stored =
    readUserScopedJson<StoredNotification[]>(key)
    ?? readTenantScopedJson<StoredNotification[]>(key);
  if (!Array.isArray(stored)) return [];
  return stored.map((item, index) => mapNotification(item, index));
};

let notificationPushTimer = 0;
const writeStoredNotifications = (items: StoredNotification[]) => {
  writeUserScopedJson(infoHubSiteStorageBase(NOTIFICATIONS_KEY), items);
  const site = readActiveSiteName();
  if (!site || typeof window === "undefined") return;
  window.clearTimeout(notificationPushTimer);
  notificationPushTimer = window.setTimeout(() => {
    const cutoff = Date.now() - STREAM_NOTIFICATION_MAX_AGE_MS;
    const recent = items
      .filter((item) => {
        const ts = parseTimestamp(item.timestamp);
        return ts === null || ts >= cutoff;
      })
      .slice(0, 300);
    if (recent.length) void saveInfoHubNotificationsToApi(site, recent);
  }, 3000);
};

const assetBelongsToActiveSite = (site: string) => {
  const activeSite = readActiveSiteName();
  if (activeSite) return sitesEquivalent(site, activeSite);
  return matchesStoredSiteSelection(site, readStoredSelectionScope());
};

const readStreamAssets = (): StreamAsset[] => {
  const mapped = readStreamAssetsFromCache();
  return mapped.filter((asset) => assetBelongsToActiveSite(asset.site));
};

const readStreamPreferences = (): Record<string, StreamPreferences> => {
  if (typeof window === "undefined") return {};
  const key = infoHubSiteStorageBase(STREAM_PREFS_KEY);
  const stored =
    readUserScopedJson<Record<string, StreamPreferences>>(key)
    ?? readTenantScopedJson<Record<string, StreamPreferences>>(key);
  return stored ?? {};
};

const saveStreamPreferences = (prefs: Record<string, StreamPreferences>) => {
  writeUserScopedJson(infoHubSiteStorageBase(STREAM_PREFS_KEY), prefs);
};

const readCustomStreams = (): CustomStream[] => {
  if (typeof window === "undefined") return [];
  const key = infoHubSiteStorageBase(CUSTOM_STREAMS_KEY);
  const stored =
    readUserScopedJson<CustomStream[]>(key)
    ?? readTenantScopedJson<CustomStream[]>(key);
  return Array.isArray(stored) ? stored : [];
};

const saveCustomStreams = (streams: CustomStream[]) => {
  writeUserScopedJson(infoHubSiteStorageBase(CUSTOM_STREAMS_KEY), streams);
};

const buildSelectedEventTypes = (
  selected: Iterable<string>,
  options: BoundNotificationOption[]
): Record<string, string> => {
  const byDescription = new Map(
    options.map((row) => [row.description, String(row.type ?? "").trim()])
  );
  const result: Record<string, string> = {};
  for (const description of selected) {
    const label = String(description ?? "").trim();
    if (!label) continue;
    const typeKey = byDescription.get(label) ?? "";
    if (typeKey && isTraccarEventTypeKey(typeKey)) {
      result[label] = typeKey;
    }
  }
  return result;
};

const notificationMatchesStream = (
  note: StreamNotification,
  prefs: StreamPreferences | undefined,
  typeByDescription?: Record<string, string>
) => noteMatchesStreamPreferences(note, prefs, typeByDescription);

export default function Streams() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [baseNow] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [storedNotifications, setStoredNotifications] = useState(() => readStoredNotifications());
  const [liveNotifications, setLiveNotifications] = useState<StreamLiveNotification[]>([]);
  const [liveFeedStatus, setLiveFeedStatus] = useState<"connecting" | "live" | "paused" | "error" | "websocket">("connecting");
  const [wsStreamsOpen, setWsStreamsOpen] = useState(false);
  const wsStreamsOpenRef = useRef(false);
  const [newNotificationIds, setNewNotificationIds] = useState<Set<string>>(() => new Set());
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const isInitialLivePollRef = useRef(true);
  const lastPollToRef = useRef<string>(new Date().toISOString());
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [openActions, setOpenActions] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [settingsStream, setSettingsStream] = useState<StreamRow | null>(null);
  const [settingsTab, setSettingsTab] = useState<"details" | "assets">("details");
  const [settingsName, setSettingsName] = useState("");
  const [activeEventsEnabled, setActiveEventsEnabled] = useState(true);
  const [eventsFilter, setEventsFilter] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [playSoundsEnabled, setPlaySoundsEnabled] = useState(true);
  const [eventPlaySounds, setEventPlaySounds] = useState<Record<string, boolean>>({});
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [availableAssets, setAvailableAssets] = useState<StreamAsset[]>(() => readStreamAssets());
  const [activeSiteLabel, setActiveSiteLabel] = useState(() => readActiveSiteName());
  const [siteTimeZones, setSiteTimeZones] = useState<SiteTimeZoneSettings | null>(null);
  const [streamPreferences, setStreamPreferences] = useState<Record<string, StreamPreferences>>(() =>
    readStreamPreferences()
  );
  const streamPreferencesRef = useRef(streamPreferences);
  const availableAssetsRef = useRef(availableAssets);
  const [customStreams, setCustomStreams] = useState<CustomStream[]>(() => readCustomStreams());
  const [showAddStream, setShowAddStream] = useState(false);
  const [addStep, setAddStep] = useState<"details" | "assets">("details");
  const [addName, setAddName] = useState("");
  const [addActiveEventsEnabled, setAddActiveEventsEnabled] = useState(true);
  const [addJourneyEnabled, setAddJourneyEnabled] = useState(false);
  const [addEventsFilter, setAddEventsFilter] = useState("");
  const [addSelectedEvents, setAddSelectedEvents] = useState<Set<string>>(new Set());
  const [addPlaySoundsEnabled, setAddPlaySoundsEnabled] = useState(true);
  const [addEventPlaySounds, setAddEventPlaySounds] = useState<Record<string, boolean>>({});
  const [addSelectedAssets, setAddSelectedAssets] = useState<Set<string>>(new Set());
  const [addExpandedItems, setAddExpandedItems] = useState<Set<string>>(new Set());
  const [detailNote, setDetailNote] = useState<StreamNotification | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [actionDecisionDraft, setActionDecisionDraft] = useState<"yes" | "no" | "">("");
  const [actionNoteDraft, setActionNoteDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [boundNotificationOptions, setBoundNotificationOptions] = useState<BoundNotificationOption[]>([]);
  const [boundNotificationsLoading, setBoundNotificationsLoading] = useState(true);
  const [notificationLibrary, setNotificationLibrary] = useState<
    Awaited<ReturnType<typeof loadNotificationLibraryItems>>
  >([]);

  const loadBoundNotifications = useCallback(async () => {
    setBoundNotificationsLoading(true);
    try {
      const site = readActiveSiteName();
      const [options, library] = await Promise.all([
        loadBoundNotificationOptionsForSite(site),
        loadNotificationLibraryItems(site)
      ]);
      registerBoundNotificationAliases(options);
      setBoundNotificationOptions(options);
      setNotificationLibrary(library);
    } catch {
      setBoundNotificationOptions([]);
      setNotificationLibrary([]);
    } finally {
      setBoundNotificationsLoading(false);
    }
  }, []);

  const boundTypeByDescription = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of boundNotificationOptions) {
      const description = String(row.description ?? "").trim();
      const typeKey = String(row.type ?? "").trim();
      if (description && typeKey) map[description] = typeKey;
    }
    return map;
  }, [boundNotificationOptions]);

  const boundTypeRef = useRef<Record<string, string>>({});
  useEffect(() => {
    boundTypeRef.current = boundTypeByDescription;
  }, [boundTypeByDescription]);

  const syncStreamMonitorToServer = useCallback(
    async (
      streams: CustomStream[],
      prefs: Record<string, StreamPreferences>
    ) => {
      const site = readActiveSiteName();
      if (!site) return false;
      const monitoredTypes = collectMonitoredTypesFromPreferences(prefs, boundTypeByDescription);
      const monitoredLabels = collectMonitoredLabelsFromPreferences(prefs);
      const stored = await saveInfoHubStreamMonitorToApi(site, {
        customStreams: streams.map((stream) => ({
          id: stream.id,
          name: stream.name,
          source: stream.source
        })),
        preferences: prefs,
        monitoredTypes,
        monitoredLabels
      });
      return stored;
    },
    [boundTypeByDescription]
  );

  useEffect(() => {
    streamPreferencesRef.current = streamPreferences;
  }, [streamPreferences]);

  // Selections made before server sync existed live only in this browser, so the server
  // could not track them while nobody was signed in. Push them once.
  const serverMonitorMissingRef = useRef(false);
  const [monitorBackfillTick, setMonitorBackfillTick] = useState(0);
  useEffect(() => {
    if (!serverMonitorMissingRef.current) return;
    const prefs = streamPreferencesRef.current;
    if (!prefs || Object.keys(prefs).length === 0) return;
    serverMonitorMissingRef.current = false;
    void syncStreamMonitorToServer(customStreams, prefs).then((stored) => {
      if (stored) return;
      serverMonitorMissingRef.current = true;
      window.setTimeout(() => setMonitorBackfillTick((tick) => tick + 1), 15000);
    });
  }, [monitorBackfillTick, boundTypeByDescription, customStreams, syncStreamMonitorToServer]);

  useEffect(() => {
    availableAssetsRef.current = availableAssets;
  }, [availableAssets]);

  useEffect(() => {
    setStreamsPageActive(true);
    const unlock = () => resumeStreamAudio();
    const gestures: Array<keyof WindowEventMap> = ["click", "keydown", "touchstart"];
    gestures.forEach((name) => window.addEventListener(name, unlock, { passive: true }));
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        // Keep page flagged active while mounted, but stop scheduled rings when tab is hidden.
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      setStreamsPageActive(false);
      gestures.forEach((name) => window.removeEventListener(name, unlock));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    let hydrateRetryTimer = 0;
    const reloadTenantState = (hydrateAttempt = 0) => {
      window.clearTimeout(hydrateRetryTimer);
      setActiveSiteLabel(readActiveSiteName());
      setAvailableAssets(readStreamAssets());
      setCustomStreams(readCustomStreams());
      setStreamPreferences(readStreamPreferences());
      setStoredNotifications(readStoredNotifications());
      setColumnOrder([]);
      setLiveNotifications([]);
      seenEventIdsRef.current.clear();
      isInitialLivePollRef.current = true;
      lastPollToRef.current = new Date().toISOString();
      void loadBoundNotifications();
      void getSiteTimeZoneSettings()
        .then((settings) => setSiteTimeZones(settings))
        .catch(() => setSiteTimeZones(null));
      // Hydrate from server so selections survive other devices / cleared localStorage.
      const historySite = readActiveSiteName();
      if (historySite) {
        void getInfoHubNotificationsFromApi(historySite).then((remote) => {
          if (!remote) return;
          const localItems = readStoredNotifications() as unknown as StoredNotification[];
          const byId = new Map<string, StoredNotification>();
          for (const item of [...remote, ...localItems]) {
            const id = String(item?.id ?? "").trim();
            if (id) byId.set(id, { ...(byId.get(id) ?? {}), ...item });
          }
          const merged = Array.from(byId.values());
          if (merged.length === 0) return;
          writeUserScopedJson(infoHubSiteStorageBase(NOTIFICATIONS_KEY), merged);
          setStoredNotifications(readStoredNotifications());
          // Upload history that only this browser had so other machines get it too.
          if (localItems.length > 0) void saveInfoHubNotificationsToApi(historySite, localItems.slice(0, 300));
        });
      }
      void getInfoHubStreamMonitorFromApi(readActiveSiteName())
        .then((payload) => {
          if (!payload) {
            // Request failed (e.g. session not ready yet on a fresh machine): retry, don't treat as empty.
            if (hydrateAttempt < 5) {
              hydrateRetryTimer = window.setTimeout(() => reloadTenantState(hydrateAttempt + 1), 3000 * (hydrateAttempt + 1));
            }
            return;
          }
          const siteMonitor = payload.siteMonitor;
          const serverHasPrefs =
            !!siteMonitor?.preferences
            && typeof siteMonitor.preferences === "object"
            && Object.keys(siteMonitor.preferences).length > 0;
          if (!siteMonitor || !serverHasPrefs) {
            // Account has no server copy yet: push this browser's selections up.
            serverMonitorMissingRef.current = true;
            setMonitorBackfillTick((tick) => tick + 1);
            if (!siteMonitor) return;
          }
          if (Array.isArray(siteMonitor.customStreams) && siteMonitor.customStreams.length > 0) {
            const streams = siteMonitor.customStreams.map((stream) => ({
              id: String(stream.id),
              name: String(stream.name ?? "Stream"),
              source: String(stream.source ?? "Custom")
            }));
            setCustomStreams(streams);
            saveCustomStreams(streams);
          }
          if (
            siteMonitor.preferences
            && typeof siteMonitor.preferences === "object"
            && Object.keys(siteMonitor.preferences).length > 0
          ) {
            setStreamPreferences(siteMonitor.preferences);
            saveStreamPreferences(siteMonitor.preferences);
          }
        })
        .catch(() => undefined);
    };
    reloadTenantState();
    const onContextChange = () => reloadTenantState(0);
    window.addEventListener("vivi:orgchange", onContextChange);
    window.addEventListener("vivi:contextchange", onContextChange);
    window.addEventListener("vivi:bindingschange", loadBoundNotifications);
    window.addEventListener(LOCATION_ALERTS_UPDATED_EVENT, loadBoundNotifications);
    const onTzUpdated = (event: Event) => {
      const detail = (event as CustomEvent<SiteTimeZoneSettings>).detail;
      if (detail) setSiteTimeZones(detail);
      else {
        void getSiteTimeZoneSettings()
          .then((settings) => setSiteTimeZones(settings))
          .catch(() => setSiteTimeZones(null));
      }
    };
    window.addEventListener(SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT, onTzUpdated as EventListener);
    return () => {
      window.clearTimeout(hydrateRetryTimer);
      window.removeEventListener("vivi:orgchange", onContextChange);
      window.removeEventListener("vivi:contextchange", onContextChange);
      window.removeEventListener("vivi:bindingschange", loadBoundNotifications);
      window.removeEventListener(LOCATION_ALERTS_UPDATED_EVENT, loadBoundNotifications);
      window.removeEventListener(SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT, onTzUpdated as EventListener);
    };
  }, [loadBoundNotifications]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setStoredNotifications(readStoredNotifications());
  }, []);

  const ingestLiveNotifications = useCallback(
    async (fresh: StreamLiveNotification[], opts?: { playSound?: boolean; trusted?: boolean }) => {
      if (!fresh.length) return;
      const enrichedFresh = await enrichLiveNotifications(fresh);
      if (!enrichedFresh.length) return;
      const siteNames = availableAssetsRef.current.map((asset) => asset.name);
      // Trusted batches were already scoped to this site by the server / scoped device lookup,
      // so an empty (not yet cached) asset list must not discard them.
      const scopedFresh =
        siteNames.length > 0
          ? enrichedFresh.filter((note) => assetMatchesAllowedNames(note.asset, siteNames))
          : readActiveSiteName() && !opts?.trusted
            ? []
            : enrichedFresh;
      if (!scopedFresh.length) return;

      // Only keep events that match at least one active stream selection.
      const prefs = streamPreferencesRef.current;
      const monitoredLabels = collectMonitoredLabelsFromPreferences(prefs);
      const typeMap: Record<string, string> = { ...boundTypeRef.current };
      for (const streamPrefs of Object.values(prefs)) {
        Object.assign(typeMap, streamPrefs?.selectedEventTypes ?? {});
      }
      const trackedFresh =
        monitoredLabels.length === 0
          ? []
          : scopedFresh.filter((note) =>
            Object.values(prefs).some((streamPrefs) =>
              noteMatchesStreamPreferences(note, streamPrefs, typeMap)
            )
          );
      if (!trackedFresh.length) return;

      setLiveNotifications((current) => {
        const merged = mergeLiveNotifications(current, trackedFresh);
        // Persist on top of the saved history so reopening the page never overwrites older events.
        const persisted = mergeLiveNotifications(
          readStoredNotifications() as unknown as StreamLiveNotification[],
          merged
        );
        writeStoredNotifications(
          persisted.map((note) => ({
            id: note.id,
            asset: note.asset,
            event: note.event,
            location: note.location,
            speed: note.speed,
            distance: note.distance,
            driver: note.driver,
            actioned: note.actioned,
            severity: note.severity,
            timestamp: note.timestamp,
            deviceId: note.deviceId,
            traccarType: note.traccarType,
            positionId: note.positionId,
            lat: note.lat,
            lng: note.lng,
            heading: note.heading
          }))
        );
        return merged;
      });
      if (opts?.playSound !== false && !isInitialLivePollRef.current) {
        setNewNotificationIds((current) => {
          const next = new Set(current);
          trackedFresh.forEach((note) => next.add(note.id));
          return next;
        });
        // Bells only while Streams is mounted and the browser tab is visible.
        if (typeof document === "undefined" || document.visibilityState === "visible") {
          playBellsForNotifications(trackedFresh, streamPreferencesRef.current);
        }
        window.setTimeout(() => {
          setNewNotificationIds((current) => {
            const next = new Set(current);
            trackedFresh.forEach((note) => next.delete(note.id));
            return next;
          });
        }, 8000);
      }
    },
    []
  );

  const runLivePoll = useCallback(async () => {
    // When the realtime WS is open, rely on streams.events for live updates and
    // only HTTP-poll infrequently for label repair / catch-up (Traccar has no API rate limit).
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      setLiveFeedStatus("paused");
      return;
    }
    if (wsStreamsOpenRef.current && !isInitialLivePollRef.current) {
      // Skip heavy HTTP while websocket is healthy; status stays "websocket".
      setLiveFeedStatus("websocket");
      return;
    }
    const to = new Date().toISOString();
    const from = isInitialLivePollRef.current
      ? new Date(Date.now() - STREAM_LIVE_INITIAL_LOOKBACK_MS).toISOString()
      : new Date(Math.max(0, Date.parse(lastPollToRef.current) - STREAM_LIVE_POLL_OVERLAP_MS)).toISOString();
    try {
      const wasInitial = isInitialLivePollRef.current;
      const ingestBatch = async (
        notes: StreamLiveNotification[],
        keyFor: (note: StreamLiveNotification) => string
      ) => {
        const fresh: StreamLiveNotification[] = [];
        const upgrades: StreamLiveNotification[] = [];
        for (const note of notes) {
          const key = keyFor(note);
          if (seenEventIdsRef.current.has(key)) {
            upgrades.push(note);
            continue;
          }
          seenEventIdsRef.current.add(key);
          fresh.push(note);
        }
        if (upgrades.length) await ingestLiveNotifications(upgrades, { playSound: false, trusted: true });
        await ingestLiveNotifications(fresh, { playSound: !wasInitial, trusted: true });
      };

      // Server alerts are a quick lookup, so show them without waiting for the slower Traccar scan.
      const serverPromise = pollViviServerUserAlerts(from)
        .then((serverAlerts) => ingestBatch(serverAlerts, (note) => note.id))
        .catch(() => undefined);
      const { events, deviceLabels } = await pollTraccarLiveEvents({ from, to });
      lastPollToRef.current = to;
      await ingestBatch(
        events.map((event) => mapTraccarEventToLiveNotification(event, deviceLabels)),
        (note) => note.id.replace(/^traccar-/, "")
      );
      await serverPromise;
      // The scoped asset lookup has now filled the cache; pick it up for display filtering.
      setAvailableAssets((current) => {
        const next = readStreamAssets();
        return next.length > current.length ? next : current;
      });
      isInitialLivePollRef.current = false;
      setLiveFeedStatus(wsStreamsOpenRef.current ? "websocket" : "live");
    } catch {
      setLiveFeedStatus("error");
    }
  }, [ingestLiveNotifications]);

  useEffect(() => {
    markStreamsBackgroundEnabled();
    const unsub = listenToStreamsBackground(
      (payload) => {
        const deviceLabels = buildCachedDeviceLabelIndex();
        const fresh: StreamLiveNotification[] = [];
        for (const event of payload.events ?? []) {
          const key = `${event.deviceId}-${event.id}`;
          if (seenEventIdsRef.current.has(key)) continue;
          seenEventIdsRef.current.add(key);
          fresh.push(mapTraccarEventToLiveNotification(event, deviceLabels));
        }
        for (const alert of payload.alerts ?? []) {
          const mapped = mapViviUserAlertToLiveNotification(alert);
          if (seenEventIdsRef.current.has(mapped.id)) continue;
          seenEventIdsRef.current.add(mapped.id);
          fresh.push(mapped);
        }
        void ingestLiveNotifications(fresh, { playSound: !isInitialLivePollRef.current }).then(() => {
          setLiveFeedStatus(wsStreamsOpenRef.current ? "websocket" : "live");
        });
      },
      (open) => {
        wsStreamsOpenRef.current = open;
        setWsStreamsOpen(open);
        if (open) setLiveFeedStatus("websocket");
      }
    );
    return () => {
      // The shared background subscription stays open so streams keep receiving while this page is closed.
      unsub();
    };
  }, [ingestLiveNotifications]);

  // Events that arrived before the notification types were known were dropped; replay them once ready.
  const replayedAfterBoundLoadRef = useRef(false);
  useEffect(() => {
    if (boundNotificationsLoading) {
      replayedAfterBoundLoadRef.current = false;
      return;
    }
    if (replayedAfterBoundLoadRef.current) return;
    replayedAfterBoundLoadRef.current = true;
    seenEventIdsRef.current.clear();
    isInitialLivePollRef.current = true;
    void runLivePoll();
  }, [boundNotificationsLoading, runLivePoll]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await runLivePoll();
    };
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, STREAM_LIVE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [runLivePoll, wsStreamsOpen]);

  useEffect(() => {
    const close = () => setOpenActions(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    if (!showAddStream) return;
    setAddStep("details");
    setAddName("");
    setAddActiveEventsEnabled(true);
    setAddJourneyEnabled(false);
    setAddEventsFilter("");
    setAddSelectedEvents(new Set());
    setAddPlaySoundsEnabled(true);
    setAddEventPlaySounds({});
    setAddSelectedAssets(new Set());
    setAddExpandedItems(new Set());
  }, [showAddStream]);

  useEffect(() => {
    if (!settingsStream) return;
    const prefs = streamPreferences[settingsStream.id];
    setSettingsName(prefs?.name ?? settingsStream.name);
    setActiveEventsEnabled(prefs?.activeEventsEnabled ?? true);
    setEventsFilter("");
    setSelectedEvents(new Set(prefs?.selectedEvents ?? []));
    setPlaySoundsEnabled(prefs?.playSounds !== false);
    setEventPlaySounds({ ...(prefs?.eventPlaySounds ?? {}) });
    setSelectedAssets(new Set(prefs?.selectedAssets ?? []));
  }, [settingsStream, streamPreferences]);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = window.setTimeout(() => setLoading(false), 350);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const formatAge = (timestamp: number) => {
    const diffMs = Math.max(0, now - timestamp);
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"}`;
  };

  const formatEventStamp = (timestamp?: number) => {
    if (!timestamp || !Number.isFinite(timestamp)) return "";
    const formatted = formatTimestampForSite(
      new Date(timestamp).toISOString(),
      activeSiteLabel,
      siteTimeZones
    ).trim();
    if (!formatted) return "";
    // Match stream card style: "28/07/2026 02:09 (EAT)" using the site timezone abbr.
    const match = formatted.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})(?::\d{2})?\s+(.+)$/);
    if (match) return `${match[1]} ${match[2]} (${match[3]})`;
    return formatted;
  };

  const formatDateTime = (timestamp?: number) => {
    if (!timestamp || !Number.isFinite(timestamp)) return "—";
    return (
      formatTimestampForSite(new Date(timestamp).toISOString(), activeSiteLabel, siteTimeZones)
      || new Date(timestamp).toISOString()
    );
  };

  const assetInitials = (asset: string) => {
    const parts = String(asset || "")
      .split(/[\s\-_/]+/)
      .filter(Boolean)
      .slice(0, 2);
    if (!parts.length) return "VE";
    return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "VE";
  };

  const assetTypeCacheRef = useRef<{ at: number; rows: ReturnType<typeof readStreamAssetsFromCache> }>({ at: 0, rows: [] });
  const assetTypeFor = (asset: string): string | undefined => {
    const cache = assetTypeCacheRef.current;
    if (Date.now() - cache.at > 15000) {
      cache.rows = readStreamAssetsFromCache();
      cache.at = Date.now();
    }
    const label = String(asset || '').trim().toLowerCase();
    if (!label) return undefined;
    const hit = cache.rows.find((row) => row.name.toLowerCase() === label)
      ?? cache.rows.find((row) => label.includes(row.name.toLowerCase()) || row.name.toLowerCase().includes(label));
    return hit?.assetType;
  };

  const renderAssetThumb = (asset: string) => {
    const type = assetTypeFor(asset);
    return type ? <AssetTypeIcon assetType={type} size={34} /> : <span>{assetInitials(asset)}</span>;
  };

  const handleRefresh = () => {
    setLoading(true);
    setStoredNotifications(readStoredNotifications());
    void runLivePoll().finally(() => setLoading(false));
  };

  const applyActionedNote = useCallback((noteId: string, patch: Partial<StreamNotification>) => {
    const mergeOne = (note: StreamNotification) => (note.id === noteId ? { ...note, ...patch } : note);
    setLiveNotifications((current) => current.map(mergeOne));
    setStoredNotifications((current) => {
      const next = current.map(mergeOne);
      writeStoredNotifications(next as unknown as StoredNotification[]);
      return next;
    });
    setDetailNote((current) => (current && current.id === noteId ? { ...current, ...patch } : current));
  }, []);

  const persistStreamAction = async (note: StreamNotification, decision: "yes" | "no", noteText = "") => {
    const alertId = String(note.serverAlertId ?? "").trim()
      || (note.id.startsWith("vivi-") ? note.id.slice("vivi-".length) : "");
    if (!alertId) {
      // Local-only Traccar card: persist action in the user stream cache.
      beginSaving(decision === "yes" ? "Saving action" : "Saving No");
      applyActionedNote(note.id, {
        actioned: true,
        actionDecision: decision,
        actionNote: decision === "yes" ? noteText : undefined,
        actionedAt: new Date().toISOString()
      });
      endSavingDone(decision === "yes" ? "Action saved" : "Marked No");
      return;
    }

    beginSaving(decision === "yes" ? "Saving action" : "Saving No");
    const result = await actionUserAlertApi({ id: alertId, decision, note: noteText });
    if (!result.ok || !result.alert) {
      endSavingError(result.error || "Unable to save action");
      throw new Error(result.error || "Unable to save action");
    }
    const mapped = mapViviUserAlertToLiveNotification(result.alert);
    applyActionedNote(note.id, {
      actioned: true,
      actionDecision: mapped.actionDecision,
      actionNote: mapped.actionNote,
      actionedAt: mapped.actionedAt,
      actionedByName: mapped.actionedByName,
      actionedByEmail: mapped.actionedByEmail,
      location: mapped.location || note.location,
      speed: mapped.speed || note.speed,
      distance: mapped.distance || note.distance,
      driver: mapped.driver || note.driver,
      serverAlertId: mapped.serverAlertId || alertId
    });
    endSavingDone(decision === "yes" ? "Yes recorded" : "No recorded");
  };

  const siteAssetNames = useMemo(
    () => availableAssets.map((asset) => asset.name),
    [availableAssets]
  );

  const allNotifications = useMemo(() => {
    const byId = new Map<string, StreamNotification>();
    const storedIds = new Set(storedNotifications.map((note) => note.id));
    const liveIds = new Set(liveNotifications.map((note) => note.id));
    // Live copies override stored ones. Saved history and live events are already site-scoped,
    // so they stay visible while the site's asset list is still loading.
    for (const note of [...storedNotifications, ...liveNotifications]) {
      if (siteAssetNames.length > 0 && !assetMatchesAllowedNames(note.asset, siteAssetNames)) {
        continue;
      }
      if (siteAssetNames.length === 0 && readActiveSiteName() && !storedIds.has(note.id) && !liveIds.has(note.id)) {
        continue;
      }
      byId.set(note.id, note);
    }
    const merged = Array.from(byId.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    return filterOverspeedByLibraryThreshold(merged, notificationLibrary, streamPreferences);
  }, [liveNotifications, storedNotifications, notificationLibrary, streamPreferences, siteAssetNames]);

  const streamData = useMemo(() => {
    const recentCutoff = baseNow - STREAM_NOTIFICATION_MAX_AGE_MS;
    const recentNotifications = allNotifications
      .map((note) => ({
        ...note,
        timestamp: note.timestamp ?? baseNow - note.minutesAgo * 60000
      }))
      .filter((note) => (note.timestamp ?? 0) >= recentCutoff);

    return customStreams
      .filter((stream) => !streamPreferences[stream.id]?.removed)
      .map((stream) => {
        const prefs = streamPreferences[stream.id];
        const preferredName = prefs?.name?.trim();
        const enriched = recentNotifications
          .filter((note) => notificationMatchesStream(note, prefs, boundTypeByDescription))
          .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
          .slice(0, STREAM_NOTIFICATIONS_PER_COLUMN);

        const latest = enriched[0]?.timestamp ?? null;
        const alerts = enriched.filter((note) => !note.actioned).length;
        return {
          id: stream.id,
          name: preferredName || stream.name,
          source: stream.source || "Custom",
          notifications: enriched,
          lastEvent: latest ? formatAge(latest) : "Monitoring",
          alerts
        };
      });
  }, [allNotifications, baseNow, boundTypeByDescription, customStreams, streamPreferences, now]);

  const orderedStreams = useMemo(() => {
    if (columnOrder.length === 0) return streamData;
    const lookup = new Map(streamData.map((stream) => [stream.id, stream]));
    const ordered = columnOrder.map((id) => lookup.get(id)).filter(Boolean) as typeof streamData;
    const missing = streamData.filter((stream) => !columnOrder.includes(stream.id));
    return [...ordered, ...missing];
  }, [columnOrder, streamData]);

  useEffect(() => {
    setDetailNote((current) => {
      if (!current) return current;
      const live = liveNotifications.find((row) => row.id === current.id);
      if (!live) return current;
      const hasLiveCoords =
        live.lat != null && live.lng != null && Number.isFinite(Number(live.lat)) && Number.isFinite(Number(live.lng));
      const needsCoords = current.lat == null || current.lng == null;
      const next = {
        ...current,
        location: current.location || live.location,
        speed: current.speed || live.speed,
        driver: current.driver || live.driver,
        distance: current.distance || live.distance,
        heading: current.heading ?? live.heading,
        lat: needsCoords && hasLiveCoords ? live.lat : current.lat,
        lng: needsCoords && hasLiveCoords ? live.lng : current.lng
      };
      const changed = (Object.keys(next) as Array<keyof typeof next>).some((key) => next[key] !== current[key]);
      return changed ? next : current;
    });
  }, [liveNotifications]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orderedStreams
      .map((row) => {
        if (!query) return row;
        const matchesStream = row.name.toLowerCase().includes(query) || row.source.toLowerCase().includes(query);
        const filteredNotes = row.notifications.filter((note) => {
          const haystack = [note.asset, note.event, note.location, note.driver].join(" ").toLowerCase();
          return haystack.includes(query);
        });
        return {
          ...row,
          notifications: matchesStream ? row.notifications : filteredNotes
        };
      })
      .filter((row) => {
        if (!query) return true;
        const matchesStream = row.name.toLowerCase().includes(query) || row.source.toLowerCase().includes(query);
        return matchesStream || row.notifications.length > 0;
      });
  }, [search, orderedStreams]);

  const handleOpenNotificationDetails = (note: StreamNotification) => {
    const cachedAsset = readStreamAssetsFromCache().find(
      (row) =>
        row.name === note.asset
        || note.asset.toLowerCase().includes(row.name.toLowerCase())
        || row.name.toLowerCase().includes(note.asset.toLowerCase())
    );
    const seed: StreamNotification = {
      ...note,
      deviceId: note.deviceId || cachedAsset?.traccarDeviceId
    };

    setDetailNote(seed);
    setOpenActions(null);
    setActionMenuOpen(false);
    setActionDecisionDraft(note.actionDecision === "yes" || note.actionDecision === "no" ? note.actionDecision : "");
    setActionNoteDraft(note.actionNote || "");
    void enrichLiveNotifications([{
      ...seed,
      minutesAgo: seed.minutesAgo,
      actioned: seed.actioned,
      severity: seed.severity
    }]).then((enriched) => {
      if (enriched[0]) {
        setDetailNote((current) => {
          if (!current || current.id !== note.id) return current;
          return {
            ...current,
            ...enriched[0],
            speed: enriched[0].speed || current.speed,
            driver: enriched[0].driver || current.driver,
            distance: enriched[0].distance || current.distance,
            location: enriched[0].location || current.location,
            lat: enriched[0].lat ?? current.lat,
            lng: enriched[0].lng ?? current.lng,
            heading: enriched[0].heading ?? current.heading,
            positionId: enriched[0].positionId ?? current.positionId,
            deviceId: enriched[0].deviceId ?? current.deviceId,
            actioned: current.actioned || enriched[0].actioned,
            actionDecision: current.actionDecision || enriched[0].actionDecision,
            actionNote: current.actionNote || enriched[0].actionNote,
            actionedAt: current.actionedAt || enriched[0].actionedAt,
            actionedByName: current.actionedByName || enriched[0].actionedByName,
            actionedByEmail: current.actionedByEmail || enriched[0].actionedByEmail
          };
        });
      }
    });
  };

  const handleSelectActionDecision = async (decision: "yes" | "no") => {
    if (!detailNote || detailNote.actioned || actionBusy) return;
    setActionMenuOpen(false);
    setActionDecisionDraft(decision);
    if (decision === "no") {
      setActionBusy(true);
      try {
        await persistStreamAction(detailNote, "no");
      } catch (error: any) {
        showToast(String(error?.message ?? error), "error");
      } finally {
        setActionBusy(false);
      }
      return;
    }
    setActionNoteDraft("");
  };

  const handleConfirmYesAction = async () => {
    if (!detailNote || detailNote.actioned || actionBusy) return;
    const noteText = actionNoteDraft.trim();
    if (!noteText) {
      showToast("Add a supporting note for Yes.", "error");
      return;
    }
    setActionBusy(true);
    try {
      await persistStreamAction(detailNote, "yes", noteText);
    } catch (error: any) {
      showToast(String(error?.message ?? error), "error");
    } finally {
      setActionBusy(false);
    }
  };

  useEffect(() => {
    if (!detailNote) return;
    const lat = Number(detailNote.lat);
    const lng = Number(detailNote.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (String(detailNote.location ?? "").trim()) return;
    const noteId = detailNote.id;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          buildApiUrl(`/api/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`),
          {
            method: "GET",
            signal: controller.signal,
            headers: {
              "content-type": "application/json",
              "x-api-key": getApiKey(),
              "x-tenant-id": getTenantId()
            }
          }
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          display_name?: string;
          displayName?: string;
          address?: string | Record<string, string>;
          name?: string;
        };
        const addr = payload.address;
        const resolved = String(
          payload.display_name
          ?? payload.displayName
          ?? payload.name
          ?? (typeof addr === "string" ? addr : "")
          ?? (addr && typeof addr === "object"
            ? addr.road || addr.suburb || addr.city || addr.town || addr.village || ""
            : "")
        ).trim();
        if (!resolved) return;
        setDetailNote((current) => {
          if (!current || current.id !== noteId || String(current.location ?? "").trim()) return current;
          return { ...current, location: resolved };
        });
        const patchLocation = (note: StreamNotification) =>
          note.id === noteId && !String(note.location ?? "").trim()
            ? { ...note, location: resolved }
            : note;
        setLiveNotifications((current) => current.map(patchLocation));
        setStoredNotifications((current) => {
          const next = current.map(patchLocation);
          writeStoredNotifications(next as unknown as StoredNotification[]);
          return next;
        });
      } catch {
        // ignore reverse-geocode failures
      }
    })();
    return () => controller.abort();
  }, [detailNote?.id, detailNote?.lat, detailNote?.lng, detailNote?.location]);

  const renderStreamNote = (note: StreamNotification, compact = false) => {
    const atMs = note.timestamp ?? baseNow - note.minutesAgo * 60000;
    const stamp = formatEventStamp(atMs);
    const statusLabel = note.actioned
      ? note.actionDecision === "yes"
        ? "Yes"
        : note.actionDecision === "no"
          ? "No"
          : "Actioned"
      : "Not actioned";
    return (
      <div
        key={note.id}
        className={`streams-note ${note.severity}${newNotificationIds.has(note.id) ? " is-new" : ""}${compact ? " compact" : ""}`}
      >
        <div className="streams-note-thumb has-icon" aria-hidden="true">
          {renderAssetThumb(note.asset)}
        </div>
        <div className="streams-note-content">
          <div className="streams-note-header">
            <div className="streams-note-asset" title={note.asset}>{note.asset || "Unknown asset"}</div>
            <div className="streams-note-age">
              <span>{formatAge(atMs)}</span>
              {stamp ? <span className="streams-note-stamp">{stamp}</span> : null}
            </div>
          </div>
          <div className="streams-note-meta">
            <span className="streams-note-pill">Notification</span>
            <span className={`streams-note-status ${note.actioned ? "actioned" : "pending"}`}>{statusLabel}</span>
          </div>
          <div className="streams-note-title">{note.event}</div>
          {note.location ? <div className="streams-note-location">{note.location}</div> : null}
          {!compact ? (
            <div className="streams-note-metrics">
              {note.speed ? (
                <span className="streams-metric speed" title="Speed">
                  <span className="streams-metric-icon" aria-hidden="true">⚠</span>
                  {note.speed}
                </span>
              ) : null}
              {note.distance ? (
                <span className="streams-metric" title="Odometer">
                  <span className="streams-metric-icon" aria-hidden="true">◎</span>
                  {note.distance}
                </span>
              ) : null}
              {note.driver ? (
                <span className="streams-metric" title="Driver">
                  <span className="streams-metric-icon" aria-hidden="true">👤</span>
                  {note.driver}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="streams-note-footer">
            <button
              type="button"
              className="streams-note-link"
              onClick={() => handleOpenNotificationDetails(note)}
            >
              Details
            </button>
            {!compact ? (
              <div className="streams-note-icons">
                <button
                  type="button"
                  className="streams-note-icon-btn"
                  title="View reports"
                  aria-label="View info hub reports"
                  onClick={() =>
                    navigate(
                      "/Analyze/insights/reports?category=List%20Reports&report=Info%20Hub%20Notification%20Report"
                    )
                  }
                >
                  ↗
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (columnOrder.length) return;
    setColumnOrder(orderedStreams.map((stream) => stream.id));
  }, [columnOrder.length, orderedStreams]);

  const moveStream = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setColumnOrder((current) => {
      const next = current.length ? [...current] : orderedStreams.map((stream) => stream.id);
      const fromIndex = next.indexOf(sourceId);
      const toIndex = next.indexOf(targetId);
      if (fromIndex < 0 || toIndex < 0) return next;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, sourceId);
      return next;
    });
  };

  const handleRemoveStream = (stream: StreamRow) => {
    const next = { ...streamPreferences, [stream.id]: { ...(streamPreferences[stream.id] ?? {}), removed: true } };
    setStreamPreferences(next);
    saveStreamPreferences(next);
    void syncStreamMonitorToServer(customStreams, next);
  };

  const handleUndockStream = (stream: StreamRow) => {
    const current = streamPreferences[stream.id]?.undocked ?? false;
    const next = { ...streamPreferences, [stream.id]: { ...(streamPreferences[stream.id] ?? {}), undocked: !current } };
    setStreamPreferences(next);
    saveStreamPreferences(next);
    void syncStreamMonitorToServer(customStreams, next);
  };

  const handleSaveSettings = () => {
    if (!settingsStream) return;
    const selectedEventTypes = buildSelectedEventTypes(selectedEvents, boundNotificationOptions);
    const updated: StreamPreferences = {
      ...(streamPreferences[settingsStream.id] ?? {}),
      name: settingsName || settingsStream.name,
      activeEventsEnabled,
      selectedEvents: Array.from(selectedEvents),
      selectedEventTypes,
      selectedAssets: Array.from(selectedAssets).filter((name) =>
        availableAssets.some((asset) => asset.name === name)
      ),
      playSounds: playSoundsEnabled,
      eventPlaySounds: { ...eventPlaySounds }
    };
    const next = { ...streamPreferences, [settingsStream.id]: updated };
    setStreamPreferences(next);
    saveStreamPreferences(next);
    void syncStreamMonitorToServer(customStreams, next);
    setSettingsStream(null);
  };

  const toggleAddItem = (label: string) => {
    setAddExpandedItems((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const filteredNotifications = useMemo(() => {
    const query = eventsFilter.trim().toLowerCase();
    if (!query) return boundNotificationOptions;
    return boundNotificationOptions.filter((row) =>
      row.description.toLowerCase().includes(query) || row.type.toLowerCase().includes(query)
    );
  }, [boundNotificationOptions, eventsFilter]);

  const filteredAddNotifications = useMemo(() => {
    const query = addEventsFilter.trim().toLowerCase();
    if (!query) return boundNotificationOptions;
    return boundNotificationOptions.filter((row) =>
      row.description.toLowerCase().includes(query) || row.type.toLowerCase().includes(query)
    );
  }, [addEventsFilter, boundNotificationOptions]);

  const toggleAsset = (asset: StreamAsset) => {
    setSelectedAssets((current) => {
      const next = new Set(current);
      if (next.has(asset.name)) next.delete(asset.name);
      else next.add(asset.name);
      return next;
    });
  };

  const toggleEventPlaySound = (eventName: string, enabled: boolean) => {
    setEventPlaySounds((current) => ({ ...current, [eventName]: enabled }));
  };

  const toggleAddEventPlaySound = (eventName: string, enabled: boolean) => {
    setAddEventPlaySounds((current) => ({ ...current, [eventName]: enabled }));
  };

  return (
    <div
      className="page streams-page"
      onClick={() => resumeStreamAudio()}
      onKeyDown={() => undefined}
    >
      <div className="streams-topbar">
        <div className="streams-topbar-left">
          <div className="streams-title">Info Hub</div>
          <button type="button" className="streams-btn ghost streams-refresh-btn" onClick={handleRefresh}>
            <span className="streams-refresh-icon" aria-hidden="true">↻</span>
            Refresh
          </button>
        </div>
        <div className="streams-topbar-right">
          <input
            className="streams-search"
            placeholder="Filter"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Filter streams"
          />
          <button
            type="button"
            className="streams-btn streams-add-btn"
            onClick={() => setShowAddStream(true)}
            aria-label="Create stream"
            title="Create stream"
          >
            +
          </button>
        </div>
      </div>

      <section className="streams-panel">
        {loading ? (
          <div className="streams-board-scroll">
          <div className="streams-board" role="list">
            {Array.from({ length: Math.min(customStreams.length || 3, 3) }).map((_, index) => (
              <div key={`skeleton-${index}`} className="streams-column" role="listitem">
                <div className="streams-column-header">
                  <div className="streams-skeleton-bar wide" />
                  <div className="streams-skeleton-bar" />
                </div>
                <div className="streams-notifications">
                  {Array.from({ length: 2 }).map((__, noteIndex) => (
                    <div key={`skeleton-note-${index}-${noteIndex}`} className="streams-note skeleton">
                      <div className="streams-skeleton-bar wide" />
                      <div className="streams-skeleton-bar" />
                      <div className="streams-skeleton-bar short" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="streams-empty">
            {!activeSiteLabel
              ? "Select a site to view Info Hub streams. Streams and settings are site-based."
              : customStreams.length === 0
              ? `No streams yet for ${activeSiteLabel}. Use + to add one.`
              : "No streams match your filters."}
          </div>
        ) : (
          <div className="streams-board-scroll">
          <div className="streams-board" role="list">
            {filtered.map((row) => (
              <div
                key={row.id}
                className={`streams-column${draggingId === row.id ? " dragging" : ""}`}
                role="listitem"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", row.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingId(row.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData("text/plain");
                  if (sourceId) moveStream(sourceId, row.id);
                  setDraggingId(null);
                }}
              >
                <div className="streams-column-header">
                  <div className="streams-column-title" title={row.name}>{row.name}</div>
                  <div className="streams-actions-wrap" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="streams-actions-toggle"
                      aria-label={`${row.name} menu`}
                      aria-expanded={openActions === row.id}
                      onClick={() => setOpenActions((current) => (current === row.id ? null : row.id))}
                    >
                      ▾
                    </button>
                    {openActions === row.id && (
                      <div className="streams-actions-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenActions(null);
                            setSettingsStream(row);
                            setSettingsTab("details");
                          }}
                        >
                          <span aria-hidden="true">⚙</span> Settings
                        </button>
                        <button type="button" role="menuitem" onClick={() => handleUndockStream(row)}>
                          <span aria-hidden="true">⤴</span> Undock
                        </button>
                        <button type="button" role="menuitem" onClick={() => handleRemoveStream(row)}>
                          <span aria-hidden="true">✕</span> Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="streams-notifications" aria-label={`${row.name} notifications`}>
                  {row.notifications.length === 0 ? (
                    <div className="streams-empty-column">
                      {(streamPreferences[row.id]?.selectedEvents?.length ?? 0) === 0
                        ? "No notifications selected for this stream. Open Settings and choose notifications to monitor."
                        : "No matching notifications yet. Waiting for configured notifications…"}
                    </div>
                  ) : (
                    row.notifications.map((note) => renderStreamNote(note))
                  )}
                </div>
              </div>
            ))}
          </div>
          </div>
        )}
      </section>
      {orderedStreams
        .filter((stream) => streamPreferences[stream.id]?.undocked)
        .map((stream, index) => (
          <div key={`undocked-${stream.id}`} className="streams-undocked" style={{ top: 20 + index * 24, left: 20 }}>
            <div className="streams-undocked-header">
              <span>{stream.name}</span>
              <button type="button" onClick={() => handleUndockStream(stream)} aria-label="Dock stream">
                ×
              </button>
            </div>
            <div className="streams-undocked-body">
              {stream.notifications.slice(0, 4).map((note) => renderStreamNote(note, true))}
            </div>
          </div>
        ))}
      {settingsStream && (
        <div
          className="streams-settings-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit stream: ${settingsStream.name}`}
          onClick={() => setSettingsStream(null)}
        >
          <div className="streams-settings-card" onClick={(event) => event.stopPropagation()}>
            <div className="streams-settings-header">
              <div className="streams-settings-title">Edit stream: {settingsStream.name}</div>
              <div className="streams-settings-actions">
                <button type="button" className="streams-settings-btn ghost" onClick={() => setSettingsStream(null)}>
                  Close
                </button>
                <button type="button" className="streams-settings-btn" onClick={handleSaveSettings}>
                  Save
                </button>
              </div>
            </div>
            <div className="streams-settings-body">
              <aside className="streams-settings-nav">
                <button
                  type="button"
                  className={`streams-settings-tab ${settingsTab === "details" ? "active" : ""}`}
                  onClick={() => setSettingsTab("details")}
                >
                  Stream details
                </button>
                <button
                  type="button"
                  className={`streams-settings-tab ${settingsTab === "assets" ? "active" : ""}`}
                  onClick={() => setSettingsTab("assets")}
                >
                  Assets
                </button>
              </aside>
              <section className="streams-settings-content">
                {settingsTab === "details" ? (
                  <div className="streams-settings-section">
                    <div className="streams-settings-section-title">Stream details</div>
                    <label className="streams-settings-field">
                      <span>Name *</span>
                      <input
                        id="stream-name-input"
                        type="text"
                        value={settingsName}
                        onChange={(event) => setSettingsName(event.target.value)}
                      />
                    </label>
                    <div className="streams-settings-subtitle">Select items to be included in this stream *</div>
                    <label className="streams-settings-check">
                      <input type="checkbox" /> Job statuses
                    </label>
                    <label className="streams-settings-check">
                      <input type="checkbox" defaultChecked /> Messages
                    </label>
                    <div className="streams-settings-sounds">
                      <span>Select to hear sounds for these stream items</span>
                      <label className="streams-settings-check">
                        <input
                          type="checkbox"
                          checked={playSoundsEnabled}
                          onChange={(event) => setPlaySoundsEnabled(event.target.checked)}
                        />
                        Play sounds
                      </label>
                    </div>
                    <label className="streams-settings-check">
                      <input type="checkbox" defaultChecked /> Tracking messages
                    </label>
                    <label className="streams-settings-check">
                      <input type="checkbox" /> Commands to mobile device
                    </label>
                    <label className="streams-settings-check">
                      <input
                        type="checkbox"
                        checked={activeEventsEnabled}
                        onChange={(event) => setActiveEventsEnabled(event.target.checked)}
                      />
                      Active notifications
                    </label>
                    {activeEventsEnabled && (
                      <div className="streams-settings-events">
                        <span>Select notifications and their preferred alerts</span>
                        <input
                          className="streams-settings-filter"
                          placeholder="Filter"
                          value={eventsFilter}
                          onChange={(event) => setEventsFilter(event.target.value)}
                        />
                        <div className="streams-settings-table">
                          <div className="streams-settings-row head">
                            <span>Notification name</span>
                            <span>Notification type</span>
                            <span>Play sounds</span>
                          </div>
                          {boundNotificationsLoading && (
                            <div className="streams-settings-empty">Loading notifications from bindings…</div>
                          )}
                          {!boundNotificationsLoading && filteredNotifications.length === 0 && (
                            <div className="streams-settings-empty">
                              No notifications are selected in Notifications Bindings for this site yet.
                            </div>
                          )}
                          {filteredNotifications.map((evt) => (
                            <div key={evt.description} className="streams-settings-row">
                              <label className="streams-settings-check">
                                <input
                                  type="checkbox"
                                  checked={selectedEvents.has(evt.description)}
                                  onChange={() => {
                                    setSelectedEvents((current) => {
                                      const next = new Set(current);
                                      if (next.has(evt.description)) next.delete(evt.description);
                                      else next.add(evt.description);
                                      return next;
                                    });
                                  }}
                                />
                                {evt.description}
                              </label>
                              <span>{evt.type || "Default"}</span>
                              <input
                                type="checkbox"
                                checked={eventPlaySounds[evt.description] !== false}
                                aria-label={`Play sounds for ${evt.description}`}
                                onChange={(event) => toggleEventPlaySound(evt.description, event.target.checked)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="streams-settings-assets-inline">
                      <div className="streams-assets-header">
                        <div className="streams-settings-section-title">
                          Apply to assets{activeSiteLabel ? ` · ${activeSiteLabel}` : ""}
                        </div>
                        <span className="streams-assets-pill">
                          {selectedAssets.size} assets selected
                        </span>
                      </div>
                      <div className="streams-assets-list">
                        {availableAssets.length === 0 ? (
                          <div className="streams-empty-column">
                            No assets on this site. Switch site or add assets first.
                          </div>
                        ) : (
                          <div className="streams-assets-items">
                            <label className="streams-settings-check">
                              <input
                                type="checkbox"
                                checked={
                                  availableAssets.length > 0
                                  && availableAssets.every((asset) => selectedAssets.has(asset.name))
                                }
                                ref={(input) => {
                                  if (!input) return;
                                  const all = availableAssets.every((asset) => selectedAssets.has(asset.name));
                                  const some = availableAssets.some((asset) => selectedAssets.has(asset.name));
                                  input.indeterminate = !all && some;
                                }}
                                onChange={() => {
                                  const names = availableAssets.map((asset) => asset.name);
                                  const all = names.every((name) => selectedAssets.has(name));
                                  setSelectedAssets((current) => {
                                    const next = new Set(current);
                                    names.forEach((name) => (all ? next.delete(name) : next.add(name)));
                                    return next;
                                  });
                                }}
                              />
                              Select all on this site
                            </label>
                            {availableAssets.map((asset) => (
                              <label key={asset.id} className="streams-assets-item">
                                <input
                                  type="checkbox"
                                  checked={selectedAssets.has(asset.name)}
                                  onChange={() => toggleAsset(asset)}
                                />
                                {asset.name}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="streams-settings-section">
                    <div className="streams-assets-header">
                      <div className="streams-settings-section-title">
                        Stream assets{activeSiteLabel ? ` · ${activeSiteLabel}` : ""}
                      </div>
                      <span className="streams-assets-pill">
                        {selectedAssets.size} assets selected
                      </span>
                    </div>
                    <div className="streams-assets-list">
                      {availableAssets.length === 0 ? (
                        <div className="streams-empty-column">
                          No assets on this site. Switch site or add assets first.
                        </div>
                      ) : (
                        <div className="streams-assets-items">
                          <label className="streams-settings-check">
                            <input
                              type="checkbox"
                              checked={
                                availableAssets.length > 0
                                && availableAssets.every((asset) => selectedAssets.has(asset.name))
                              }
                              ref={(input) => {
                                if (!input) return;
                                const all = availableAssets.every((asset) => selectedAssets.has(asset.name));
                                const some = availableAssets.some((asset) => selectedAssets.has(asset.name));
                                input.indeterminate = !all && some;
                              }}
                              onChange={() => {
                                const names = availableAssets.map((asset) => asset.name);
                                const all = names.every((name) => selectedAssets.has(name));
                                setSelectedAssets((current) => {
                                  const next = new Set(current);
                                  names.forEach((name) => (all ? next.delete(name) : next.add(name)));
                                  return next;
                                });
                              }}
                            />
                            Select all on this site
                          </label>
                          {availableAssets.map((asset) => (
                            <label key={asset.id} className="streams-assets-item">
                              <input
                                type="checkbox"
                                checked={selectedAssets.has(asset.name)}
                                onChange={() => toggleAsset(asset)}
                              />
                              {asset.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
      {showAddStream && (
        <div
          className="streams-settings-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Add stream"
          onClick={() => setShowAddStream(false)}
        >
          <div className="streams-settings-card" onClick={(event) => event.stopPropagation()}>
            <div className="streams-settings-header">
              <div className="streams-settings-title">Add stream</div>
              <div className="streams-settings-actions">
                <button type="button" className="streams-settings-btn ghost" onClick={() => setShowAddStream(false)}>
                  Close
                </button>
                <button
                  type="button"
                  className="streams-settings-btn"
                  onClick={() => {
                    if (addStep === "details") {
                      setAddStep("assets");
                      return;
                    }
                    if (!addName.trim()) return;
                    const id = `custom-${Date.now()}`;
                    const next = [...customStreams, { id, name: addName.trim(), source: "Custom" }];
                    setCustomStreams(next);
                    saveCustomStreams(next);
                    const prefs: StreamPreferences = {
                      activeEventsEnabled: addActiveEventsEnabled,
                      selectedEvents: Array.from(addSelectedEvents),
                      selectedEventTypes: buildSelectedEventTypes(addSelectedEvents, boundNotificationOptions),
                      selectedAssets: Array.from(addSelectedAssets).filter((name) =>
                        availableAssets.some((asset) => asset.name === name)
                      ),
                      playSounds: addPlaySoundsEnabled,
                      eventPlaySounds: { ...addEventPlaySounds }
                    };
                    const prefNext = { ...streamPreferences, [id]: prefs };
                    setStreamPreferences(prefNext);
                    saveStreamPreferences(prefNext);
                    void syncStreamMonitorToServer(next, prefNext);
                    setShowAddStream(false);
                  }}
                >
                  {addStep === "details" ? "Next" : "Save"}
                </button>
              </div>
            </div>
            <div className="streams-settings-body">
              <aside className="streams-settings-nav">
                <button
                  type="button"
                  className={`streams-settings-tab ${addStep === "details" ? "active" : ""}`}
                  onClick={() => setAddStep("details")}
                >
                  Stream details
                </button>
                <button
                  type="button"
                  className={`streams-settings-tab ${addStep === "assets" ? "active" : ""}`}
                  onClick={() => setAddStep("assets")}
                  disabled={!addName.trim()}
                >
                  Assets
                </button>
              </aside>
              <section className="streams-settings-content">
                {addStep === "details" ? (
                  <div className="streams-settings-section">
                    <div className="streams-settings-section-title">Stream details</div>
                    <label className="streams-settings-field">
                      <span>Name *</span>
                      <input
                        type="text"
                        value={addName}
                        onChange={(event) => setAddName(event.target.value)}
                      />
                    </label>
                    <div className="streams-settings-subtitle">Select items to be included in this stream *</div>
                    {["Job statuses", "Messages", "Tracking messages", "Commands to mobile device"].map(
                      (label) => (
                        <div key={label} className="streams-settings-dropdown">
                          <div className="streams-settings-dropdown-row">
                            <label className="streams-settings-check">
                              <input type="checkbox" /> {label}
                            </label>
                            <button
                              type="button"
                              className="streams-settings-dropdown-toggle"
                              onClick={() => toggleAddItem(label)}
                              aria-label={`Toggle ${label} options`}
                            >
                              ▾
                            </button>
                          </div>
                          {addExpandedItems.has(label) && (
                            <div className="streams-settings-dropdown-panel">
                              <div>Select to hear sounds for these stream items</div>
                              <label className="streams-settings-check">
                                <input
                                  type="checkbox"
                                  checked={addPlaySoundsEnabled}
                                  onChange={(event) => setAddPlaySoundsEnabled(event.target.checked)}
                                />
                                Play sounds
                              </label>
                            </div>
                          )}
                        </div>
                      )
                    )}
                    <label className="streams-settings-check">
                      <input
                        type="checkbox"
                        checked={addActiveEventsEnabled}
                        onChange={(event) => setAddActiveEventsEnabled(event.target.checked)}
                      />
                      Active notifications
                    </label>
                    <label className="streams-settings-check">
                      <input
                        type="checkbox"
                        checked={addJourneyEnabled}
                        onChange={(event) => setAddJourneyEnabled(event.target.checked)}
                      />
                      Routes alerts
                    </label>
                    {addActiveEventsEnabled && (
                      <div className="streams-settings-events">
                        <span>Select notifications and their preferred alerts</span>
                        <input
                          className="streams-settings-filter"
                          placeholder="Filter"
                          value={addEventsFilter}
                          onChange={(event) => setAddEventsFilter(event.target.value)}
                        />
                        <div className="streams-settings-table">
                          <div className="streams-settings-row head">
                            <span>Notification name</span>
                            <span>Notification type</span>
                            <span>Play sounds</span>
                          </div>
                          {boundNotificationsLoading && (
                            <div className="streams-settings-empty">Loading notifications from bindings…</div>
                          )}
                          {!boundNotificationsLoading && filteredAddNotifications.length === 0 && (
                            <div className="streams-settings-empty">
                              No notifications are selected in Notifications Bindings for this site yet.
                            </div>
                          )}
                          {filteredAddNotifications.map((evt) => (
                              <div key={evt.description} className="streams-settings-row">
                                <label className="streams-settings-check">
                                  <input
                                    type="checkbox"
                                    checked={addSelectedEvents.has(evt.description)}
                                    onChange={() => {
                                      setAddSelectedEvents((current) => {
                                        const nextSet = new Set(current);
                                        if (nextSet.has(evt.description)) nextSet.delete(evt.description);
                                        else nextSet.add(evt.description);
                                        return nextSet;
                                      });
                                    }}
                                  />
                                  {evt.description}
                                </label>
                                <span>{evt.type || "Default"}</span>
                                <input
                                  type="checkbox"
                                  checked={addEventPlaySounds[evt.description] !== false}
                                  aria-label={`Play sounds for ${evt.description}`}
                                  onChange={(event) => toggleAddEventPlaySound(evt.description, event.target.checked)}
                                />
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                    {addJourneyEnabled && (
                      <div className="streams-settings-journey">
                        <JourneyStatusAlerts
                          title="Routes status update"
                          subtitle="Same per-account preferences as Track / Routes / Tracking."
                          showLinks={false}
                        />
                      </div>
                    )}
                    <div className="streams-settings-assets-inline">
                      <div className="streams-assets-header">
                        <div className="streams-settings-section-title">
                          Apply to assets{activeSiteLabel ? ` · ${activeSiteLabel}` : ""}
                        </div>
                        <span className="streams-assets-pill">
                          {addSelectedAssets.size} assets selected
                        </span>
                      </div>
                      <div className="streams-assets-list">
                        {availableAssets.length === 0 ? (
                          <div className="streams-empty-column">
                            No assets on this site. Switch site or add assets first.
                          </div>
                        ) : (
                          <div className="streams-assets-items">
                            <label className="streams-settings-check">
                              <input
                                type="checkbox"
                                checked={
                                  availableAssets.length > 0
                                  && availableAssets.every((asset) => addSelectedAssets.has(asset.name))
                                }
                                ref={(input) => {
                                  if (!input) return;
                                  const all = availableAssets.every((asset) => addSelectedAssets.has(asset.name));
                                  const some = availableAssets.some((asset) => addSelectedAssets.has(asset.name));
                                  input.indeterminate = !all && some;
                                }}
                                onChange={() => {
                                  const names = availableAssets.map((asset) => asset.name);
                                  const all = names.every((name) => addSelectedAssets.has(name));
                                  setAddSelectedAssets((current) => {
                                    const nextSet = new Set(current);
                                    names.forEach((name) => (all ? nextSet.delete(name) : nextSet.add(name)));
                                    return nextSet;
                                  });
                                }}
                              />
                              Select all on this site
                            </label>
                            {availableAssets.map((asset) => (
                              <label key={asset.id} className="streams-assets-item">
                                <input
                                  type="checkbox"
                                  checked={addSelectedAssets.has(asset.name)}
                                  onChange={() => {
                                    setAddSelectedAssets((current) => {
                                      const nextSet = new Set(current);
                                      if (nextSet.has(asset.name)) nextSet.delete(asset.name);
                                      else nextSet.add(asset.name);
                                      return nextSet;
                                    });
                                  }}
                                />
                                {asset.name}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="streams-settings-section">
                    <div className="streams-assets-header">
                      <div className="streams-settings-section-title">
                        Stream assets{activeSiteLabel ? ` · ${activeSiteLabel}` : ""}
                      </div>
                      <span className="streams-assets-pill">
                        {addSelectedAssets.size} assets selected
                      </span>
                    </div>
                    <div className="streams-assets-list">
                      {availableAssets.length === 0 ? (
                        <div className="streams-empty-column">
                          No assets on this site. Switch site or add assets first.
                        </div>
                      ) : (
                        <div className="streams-assets-items">
                          <label className="streams-settings-check">
                            <input
                              type="checkbox"
                              checked={
                                availableAssets.length > 0
                                && availableAssets.every((asset) => addSelectedAssets.has(asset.name))
                              }
                              ref={(input) => {
                                if (!input) return;
                                const all = availableAssets.every((asset) => addSelectedAssets.has(asset.name));
                                const some = availableAssets.some((asset) => addSelectedAssets.has(asset.name));
                                input.indeterminate = !all && some;
                              }}
                              onChange={() => {
                                const names = availableAssets.map((asset) => asset.name);
                                const all = names.every((name) => addSelectedAssets.has(name));
                                setAddSelectedAssets((current) => {
                                  const nextSet = new Set(current);
                                  names.forEach((name) => (all ? nextSet.delete(name) : nextSet.add(name)));
                                  return nextSet;
                                });
                              }}
                            />
                            Select all on this site
                          </label>
                          {availableAssets.map((asset) => (
                            <label key={asset.id} className="streams-assets-item">
                              <input
                                type="checkbox"
                                checked={addSelectedAssets.has(asset.name)}
                                onChange={() => {
                                  setAddSelectedAssets((current) => {
                                    const nextSet = new Set(current);
                                    if (nextSet.has(asset.name)) nextSet.delete(asset.name);
                                    else nextSet.add(asset.name);
                                    return nextSet;
                                  });
                                }}
                              />
                              {asset.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
      {detailNote && (
        <div
          className="streams-settings-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Notification details"
          onClick={() => {
            if (actionBusy) return;
            setDetailNote(null);
            setActionMenuOpen(false);
          }}
        >
          <div className="streams-settings-card streams-detail-card" onClick={(event) => event.stopPropagation()}>
            <div className="streams-settings-header">
              <div className="streams-settings-title">Notification details</div>
              <div className="streams-settings-actions">
                <button
                  type="button"
                  className="streams-settings-btn ghost"
                  disabled={actionBusy}
                  onClick={() => {
                    setDetailNote(null);
                    setActionMenuOpen(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="streams-settings-body streams-detail-body">
              {(() => {
                const atMs = detailNote.timestamp ?? baseNow - detailNote.minutesAgo * 60000;
                const statusLabel = detailNote.actioned
                  ? detailNote.actionDecision === "yes"
                    ? "Yes"
                    : detailNote.actionDecision === "no"
                      ? "No"
                      : "Actioned"
                  : "Not actioned";
                const hasCoords =
                  Number.isFinite(Number(detailNote.lat)) && Number.isFinite(Number(detailNote.lng));
                const gpsLabel = hasCoords
                  ? `${Number(detailNote.lat).toFixed(7)}, ${Number(detailNote.lng).toFixed(7)}`
                  : "—";
                const headingLabel =
                  Number.isFinite(Number(detailNote.heading))
                    ? `${Math.round(Number(detailNote.heading))}°`
                    : "—";
                return (
                  <>
                    <div className="streams-detail-hero">
                      <div className="streams-detail-hero-top">
                        <div className="streams-detail-hero-asset">
                          <div className="streams-note-thumb has-icon" aria-hidden="true">
                            {renderAssetThumb(detailNote.asset)}
                          </div>
                          <div>
                            <div className="streams-detail-hero-name">{detailNote.asset || "Unknown asset"}</div>
                            <span className="streams-note-pill">Notification</span>
                          </div>
                        </div>
                        <div className="streams-note-age">
                          <span>{formatAge(atMs)}</span>
                          <span className="streams-note-stamp">{formatEventStamp(atMs)}</span>
                        </div>
                      </div>
                      <div className="streams-detail-summary">
                        <div className="streams-detail-summary-top">
                          <strong>{detailNote.event || "Notification"}</strong>
                          <span className={`streams-note-status ${detailNote.actioned ? "actioned" : "pending"}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="streams-detail-summary-location">
                          {detailNote.location || (hasCoords ? "Resolving location…" : "Location unavailable")}
                        </div>
                        <div className="streams-note-metrics">
                          {detailNote.speed ? (
                            <span className="streams-metric speed">
                              <span className="streams-metric-icon" aria-hidden="true">⚠</span>
                              {detailNote.speed}
                            </span>
                          ) : null}
                          {detailNote.distance ? (
                            <span className="streams-metric">
                              <span className="streams-metric-icon" aria-hidden="true">◎</span>
                              {detailNote.distance}
                            </span>
                          ) : null}
                          {detailNote.driver ? (
                            <span className="streams-metric">
                              <span className="streams-metric-icon" aria-hidden="true">👤</span>
                              {detailNote.driver}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {hasCoords ? (
                      <StreamDetailMap
                        key={`${detailNote.lat},${detailNote.lng}`}
                        lat={Number(detailNote.lat)}
                        lng={Number(detailNote.lng)}
                      />
                    ) : (
                      <div className="streams-detail-map streams-detail-map--empty">
                        Map unavailable — no GPS coordinates for this notification.
                      </div>
                    )}

                    <div className="streams-detail-row">
                      <span>Action Status</span>
                      <strong>{statusLabel}</strong>
                    </div>
                    <div className="streams-detail-row">
                      <span>Driver</span>
                      <strong>{detailNote.driver || "Unknown"}</strong>
                    </div>
                    <div className="streams-detail-row">
                      <span>Notification date/time</span>
                      <strong>{formatEventStamp(atMs) || formatDateTime(atMs)}</strong>
                    </div>
                    <div className="streams-detail-row">
                      <span>Location</span>
                      <strong>{detailNote.location || "—"}</strong>
                    </div>
                    <div className="streams-detail-row">
                      <span>Odometer</span>
                      <strong>{detailNote.distance || "—"}</strong>
                    </div>
                    <div className="streams-detail-row">
                      <span>GPS Coordinates</span>
                      <strong>{gpsLabel}</strong>
                    </div>
                    <div className="streams-detail-row">
                      <span>Heading</span>
                      <strong>{headingLabel}</strong>
                    </div>
                    <div className="streams-detail-row">
                      <span>Speed</span>
                      <strong>{detailNote.speed || "—"}</strong>
                    </div>

                    <div className="streams-detail-row streams-detail-row--actions">
                      <span>Actions</span>
                      <div className="streams-action-control">
                        {detailNote.actioned ? (
                          <div className="streams-action-result">
                            <strong className={detailNote.actionDecision === "yes" ? "is-yes" : "is-no"}>
                              {detailNote.actionDecision === "yes"
                                ? "Yes"
                                : detailNote.actionDecision === "no"
                                  ? "No"
                                  : "Actioned"}
                            </strong>
                            {detailNote.actionDecision === "yes" && detailNote.actionNote ? (
                              <p className="streams-action-note">{detailNote.actionNote}</p>
                            ) : null}
                            {(detailNote.actionedByName || detailNote.actionedByEmail) ? (
                              <p className="streams-action-actor">
                                By {detailNote.actionedByName || "User"}
                                {detailNote.actionedByEmail ? ` · ${detailNote.actionedByEmail}` : ""}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <>
                            <div className="streams-action-menu-wrap">
                              <button
                                type="button"
                                className="streams-action-btn"
                                disabled={actionBusy}
                                aria-expanded={actionMenuOpen}
                                onClick={() => setActionMenuOpen((open) => !open)}
                              >
                                {actionBusy ? "Saving…" : actionDecisionDraft === "yes" ? "Yes selected" : "Action"}
                                <span aria-hidden="true">▾</span>
                              </button>
                              {actionMenuOpen ? (
                                <div className="streams-action-menu" role="menu">
                                  <button type="button" role="menuitem" onClick={() => void handleSelectActionDecision("yes")}>
                                    Yes
                                  </button>
                                  <button type="button" role="menuitem" onClick={() => void handleSelectActionDecision("no")}>
                                    No
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            {actionDecisionDraft === "yes" ? (
                              <div className="streams-action-note-form">
                                <label>
                                  Action description *
                                  <textarea
                                    value={actionNoteDraft}
                                    onChange={(event) => setActionNoteDraft(event.target.value)}
                                    placeholder="Explain why this was actioned Yes…"
                                    rows={3}
                                    disabled={actionBusy}
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="streams-settings-btn"
                                  disabled={actionBusy || !actionNoteDraft.trim()}
                                  onClick={() => void handleConfirmYesAction()}
                                >
                                  Save Yes
                                </button>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
