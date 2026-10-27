import { useCallback, useEffect, useMemo, useState } from "react";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
import {
  activeOnlyFuelEventHelp,
  applyActiveOnlyFuelParametersForSave,
  ensureSiteTraccarDefaultNotifications,
  isActiveOnlyFuelNotificationDescription,
  isDigitalNotificationDescription,
  isFuelLevelComputeDescription,
  isFuelInTankDescription,
  isFuelLevelReturnParameter,
  isFuelTankComputationParameter,
  isFuelTankComputationNotificationDescription,
  isTraccarDefaultNotificationDescription,
  notificationUsesFuelTankComputation,
  FUEL_TANK_COMPUTATION_PARAMETER,
  notificationRows,
  NotificationRow,
  stripMisplacedFuelComputeParameters,
  traccarDefaultNotificationNames,
  DEFAULT_DETAILED_RECORD_ACTIONS,
  ensureDetailedRecordSettings,
  filterFmNotificationRows,
  isFmNotificationDescription,
  normalizeNotificationLibraryRow
} from "../../data/notificationLibrary";
import {
  buildTeltonikaAnalogInputParameterRows,
  teltonikaAnalogInputNames
} from "../../data/teltonikaAnalogInputs";
import { legacyLocationLibrarySeedNames } from "../../data/locationLibrary";
import { traccarFirmwareProtocols } from "../../data/traccarFirmwareProtocols";
import { traccarMobileDevices } from "../../data/traccarMobileDevices";
import { isOrgOrSiteMobileLabel } from "../../utils/libraryCatalog";
import {
  beginTraccarListCacheBatch,
  buildApiUrl,
  endTraccarListCacheBatch,
  getApiKey,
  getBindings,
  getTenantId,
  listGpsIotEvents,
  loadFromApi,
  saveToApi
} from "../../utils/api";
import { loadScopedFromApi, peekScopedFromApi, saveScopedToApi, filterRecordsForActiveSelection } from "../../utils/scopeStorage";
import {
  cleanupLocationLibraryTemplateBindings,
  loadLocationGeofences,
  removeLocationGeofence,
  saveLocationGeofence
} from "../../utils/locationGeofences";
import {
  resolveDeviceBindingForNotificationBinding,
  type NotificationBindingRecord
} from "../../utils/traccarBindingSync";
import { isDatabaseTenant, readActiveTenantId, subscribeScopeChange } from "../../utils/tenantContext";
import { isGpsIotServer } from "../../utils/regionServers";
import {
  deleteNotificationLibraryItemFromTraccar,
  libraryRowNeedsComputedAttribute,
  mapPool,
  prefetchTraccarLibraryCatalogs,
  syncNotificationLibraryItemToTraccar,
  toNotificationLibraryBindingId
} from "../../utils/traccarNotificationLibrarySync";
import { stampNotificationRowsWithGpsIotEventIds } from "../../utils/gpsiotNotificationMap";
import {
  deleteParameterLibraryItemFromTraccar,
  syncParameterLibraryItemToTraccar
} from "../../utils/traccarParameterLibrarySync";
import {
  isBooleanParameterField,
  isFuelComputeNotification,
  type ParameterCatalogRow
} from "../../utils/traccarAttributeMapper";
import {
  DEFAULT_ACTIVE_MESSAGE_ALERT_DELIVERY,
  DEFAULT_ALERT_RECORDING_DELIVERY,
  formatUserAlertDeliverySummary,
  isAlertRecordingType,
  normalizeUserAlertDelivery,
  type UserAlertDelivery
} from "../../utils/notificationAlertDelivery";
import {
  cleanupNotificationLibraryTemplateBindings,
  dispatchNotificationLibraryUpdated,
  loadNotificationLibraryItems,
  propagateMonitoredEventRename,
  readActiveSiteName,
  removeFmMonitoredEventsFromAllBindings,
  removeMonitoredEventFromAllBindings
} from "../../utils/notificationLibraryStore";
import { showToast } from "../../utils/toast";
import { runOptimisticUpdate } from "../../utils/optimisticUpdate";
import {
  beginSaving,
  endSavingDone,
  endSavingError,
  REQUIRED_MISSING_CLASS
} from "../../utils/saveFeedback";
import "../../index.css";

const librarySections = [
  "CAN library",
  "Notification library",
  "Firmware library",
  "Location library",
  "Mobile device library",
  "Parameter library"
];

const defaultCanLibrary = [
  "Not connected",
  "CAN:UD.Quon.410-450.ADDE1500_00.v1.0.0.2_DC (Scriptable CAN)",
  "CAN: J1939 FMS Scania Rev 1.2.0.3 (Scriptable CAN)",
  "Dynamic CAN (Scriptable CAN)",
  "Script.CAN.J1939.250KBPS.GPS_CHECK.ACK_ENBL.v1.23.0.4_MG (Scriptable CAN)",
  "Script.CAN.J1939.250KBPS.v1.18.0.0_MG (Scriptable CAN)",
  "Script.CAN.UD.Quon.410-450.ADDE1500_00.ACK_ENBL.v1.10.3_DC (Scriptable CAN)"
];

const buildDefaultCanRows = () =>
  defaultCanLibrary.map((name) => ({
    name,
    availability: name.toLowerCase() === "not connected" ? "" : "Available",
    notForFm: "",
    type: name.toLowerCase() === "not connected" ? "" : "Scriptable CAN"
  }));

const isLegacyCanPlaceholder = (rows: Array<{ name?: string }> | undefined) => {
  if (!rows || !rows.length) return false;
  return rows.every((row) => /^CAN library Item\s*\d+$/i.test(String(row?.name ?? "").trim()));
};

type LibrariesProps = {
  initialSection?: string;
  hideSectionNav?: boolean;
  titleOverride?: string;
};

export default function Libraries({
  initialSection,
  hideSectionNav = false,
  titleOverride
}: LibrariesProps) {
  const [activeSection, setActiveSection] = useState(
    initialSection && librarySections.includes(initialSection) ? initialSection : librarySections[0]
  );
  const isNotificationLibrary = activeSection === "Notification library";
  const isMobileDeviceLibrary = activeSection === "Mobile device library";
  const isLocationLibrary = activeSection === "Location library";
  const isParameterLibrary = activeSection === "Parameter library";
  const isFirmwareLibrary = activeSection === "Firmware library";
  const isCanLibrary = activeSection === "CAN library";
  const isGenericLibrary =
    !isNotificationLibrary &&
    !isMobileDeviceLibrary &&
    !isLocationLibrary &&
    !isParameterLibrary &&
    !isFirmwareLibrary;
  const [openLibraryActions, setOpenLibraryActions] = useState<string | null>(null);
  const [editingNotification, setEditingNotification] = useState<NotificationRow | null>(null);
  const [editingNotificationOriginal, setEditingNotificationOriginal] = useState<string | null>(null);
  const [notificationItems, setNotificationItems] = useState<NotificationRow[]>(notificationRows);
  const [filterText, setFilterText] = useState("");

  type LocationLibraryRow = {
    id?: string;
    traccarId?: number;
    name: string;
    type: string;
    speed: string;
    availability: string;
    site?: string;
    area?: string;
    attributes?: Record<string, unknown>;
    description?: string;
  };
  type ParameterLibraryRow = { name: string; availability: string; type: string; units: string };
  type GenericLibraryRow = { name: string; availability: string; notForFm: string; type: string };

  const defaultNotificationVideoConfig = () => ({
    enabled: false,
    beforeSeconds: 3,
    afterSeconds: 3,
    durationSeconds: 6,
    views: [] as string[]
  });

  const normalizeNotificationItem = (row: NotificationRow): NotificationRow | null => {
    const defaults = defaultNotificationVideoConfig();
    const normalizedDescription = String(row.description ?? "").trim();
    if (isFmNotificationDescription(normalizedDescription)) return null;
    const isCustom = String(row.type ?? "").trim().toLowerCase() === "custom";
    const isComputed = String(row.type ?? "").trim().toLowerCase() === "computed";
    const isTraccarDefault = traccarDefaultNotificationNames.some(
      (name) => name.toLowerCase() === normalizedDescription.toLowerCase()
    );
    const isDigital = isDigitalNotificationDescription(normalizedDescription);
    const beforeSeconds = Number(row.notificationVideo?.beforeSeconds ?? defaults.beforeSeconds);
    const afterSeconds = Number(row.notificationVideo?.afterSeconds ?? defaults.afterSeconds);
    const views = Array.isArray(row.notificationVideo?.views)
      ? row.notificationVideo?.views.filter((view): view is string => typeof view === "string" && view.trim().length > 0)
      : [];
    const core = normalizeNotificationLibraryRow({
      ...row,
      description: normalizedDescription,
      type: isCustom ? "Custom" : isComputed ? "Computed" : (isDigital || isTraccarDefault ? "Default" : "System")
    });
    if (!core) return null;
    return {
      ...core,
      availability: normalizeAvailability(String(core.availability ?? row.availability ?? "").trim() || "Unavailable"),
      notificationVideo: {
        enabled: Boolean(row.notificationVideo?.enabled ?? defaults.enabled),
        beforeSeconds: Number.isFinite(beforeSeconds) ? beforeSeconds : defaults.beforeSeconds,
        afterSeconds: Number.isFinite(afterSeconds) ? afterSeconds : defaults.afterSeconds,
        durationSeconds:
          (Number.isFinite(beforeSeconds) ? beforeSeconds : defaults.beforeSeconds)
          + (Number.isFinite(afterSeconds) ? afterSeconds : defaults.afterSeconds),
        views
      }
    };
  };

  const [locationItems, setLocationItems] = useState<LocationLibraryRow[]>([]);
  const [mobileDeviceItems, setMobileDeviceItems] = useState<string[]>([]);
  const [mobileDeviceHidden, setMobileDeviceHidden] = useState<string[]>([]);
  const [mobileDeviceOverrides, setMobileDeviceOverrides] = useState<Record<string, Partial<{ name: string; availability: string }>>>({});
  const [firmwareItems, setFirmwareItems] = useState<string[]>([]);
  const [firmwareHidden, setFirmwareHidden] = useState<string[]>([]);
  const [firmwareOverrides, setFirmwareOverrides] = useState<
    Record<string, Partial<{ name: string; availability: string; type: string }>>
  >({});
  const [tenantFirmwareArtifact, setTenantFirmwareArtifact] = useState<string | null>(null);
  const [parameterItems, setParameterItems] = useState<ParameterLibraryRow[]>([]);
  const [parameterHidden, setParameterHidden] = useState<string[]>([]);
  const [parameterOverrides, setParameterOverrides] = useState<Record<string, Partial<ParameterLibraryRow>>>({});

  const [editModal, setEditModal] = useState<
    | null
    | {
        kind: "generic" | "mobile" | "location" | "parameter" | "firmware";
        key: string;
        title: string;
      }
  >(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [createModal, setCreateModal] = useState<
    | null
    | {
        kind: "generic" | "mobile" | "location" | "parameter" | "firmware";
        title: string;
        subtitle: string;
      }
  >(null);
  const [createValues, setCreateValues] = useState<Record<string, string>>({});
  const [missingRequiredKeys, setMissingRequiredKeys] = useState<Set<string>>(new Set());
  const fieldMissingClass = (key: string) =>
    missingRequiredKeys.has(key) ? REQUIRED_MISSING_CLASS : undefined;

  const [genericBySection, setGenericBySection] = useState<Record<string, GenericLibraryRow[]>>({});
  const [apiLibrariesLoaded, setApiLibrariesLoaded] = useState(false);
  const [apiLocationRows, setApiLocationRows] = useState<LocationLibraryRow[]>([]);

  const sectionKey = (section: string) => section.trim().toLowerCase().replace(/\s+/g, "-");
  const getGenericKey = () => `libraries:generic:${sectionKey(activeSection)}`;

  const normalizeAvailability = (value: string) => {
    const v = String(value ?? "").trim();
    if (!v) return "";
    const lc = v.toLowerCase();
    if (lc === "available") return "Available";
    if (lc === "unavailable" || lc === "un available") return "Unavailable";
    if (lc === "suspended" || lc === "suspend") return "Suspended";
    return v;
  };

  const toNotificationMergeKey = (row: NotificationRow) => {
    const description = String(row.description ?? "").trim().toLowerCase();
    if (description) return `description:${description}`;
    const eventId = String(row.eventId ?? "").trim();
    if (eventId) return `event:${eventId}`;
    return "";
  };

  const parseNumericId = (value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const ensureNotificationIds = (items: NotificationRow[]) => {
    const seeded = ensureSiteTraccarDefaultNotifications(items);
    const used = new Set<string>();
    let max = 0;

    for (const row of seeded.items) {
      const existing = String(row.eventId ?? "").trim();
      if (!existing) continue;
      used.add(existing);
      const num = parseNumericId(existing);
      if (num !== null) max = Math.max(max, num);
    }

    const nextId = () => {
      // Per-site IDs begin at 1 (no legacy 29600 floor).
      if (max < 1) max = 0;
      for (;;) {
        max += 1;
        const candidate = String(max);
        if (!used.has(candidate)) {
          used.add(candidate);
          return candidate;
        }
      }
    };

    let changed = seeded.changed;
    const next = seeded.items.map((row) => {
      const current = String(row.eventId ?? "").trim();
      if (isTraccarDefaultNotificationDescription(row.description)) {
        return row;
      }
      if (!current) {
        changed = true;
        return { ...row, eventId: nextId() };
      }
      if (!used.has(current)) {
        used.add(current);
      }
      return row;
    });

    const counts = new Map<string, number>();
    for (const row of next) {
      const id = String(row.eventId ?? "").trim();
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if ([...counts.values()].some((c) => c > 1)) {
      const seen = new Set<string>();
      const deduped = next.map((row) => {
        if (isTraccarDefaultNotificationDescription(row.description)) {
          const id = String(row.eventId ?? "").trim();
          if (id) seen.add(id);
          return row;
        }
        const id = String(row.eventId ?? "").trim();
        if (!id) {
          const assigned = nextId();
          changed = true;
          return { ...row, eventId: assigned };
        }
        if (!seen.has(id)) {
          seen.add(id);
          return row;
        }
        const assigned = nextId();
        changed = true;
        return { ...row, eventId: assigned };
      });
      return { items: deduped, changed };
    }

    return { items: next, changed };
  };

  const uniqByName = <T extends { name: string }>(rows: T[]) => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
      const key = String(row.name ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  };

  const toNotificationBindingId = (row: NotificationRow) => {
    const eventId = String(row.eventId ?? "").trim();
    if (eventId) return `notification:${eventId}`;
    const slug = String(row.description ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `notification:${slug || "custom"}`;
  };

  const normalizeBackendNotification = (row: any): NotificationRow | null => {
    const description = String(row?.description ?? row?.name ?? "").trim();
    if (!description) return null;
    return normalizeNotificationItem({
      description,
      type: String(row?.type ?? "Custom").trim() || "Custom",
      availability: normalizeAvailability(String(row?.availability ?? "Unavailable").trim() || "Unavailable"),
      eventId: String(row?.eventId ?? "").trim(),
      notificationVideo: row?.notificationVideo,
      parameters: row?.parameters
    });
  };

  const normalizeBackendLocation = (row: any): LocationLibraryRow | null => {
    const name = String(row?.name ?? row?.description ?? "").trim();
    if (!name) return null;
    return {
      id: row?.id != null ? String(row.id) : undefined,
      traccarId: Number.isFinite(Number(row?.traccarId)) ? Number(row.traccarId) : undefined,
      name,
      type: String(row?.type ?? "Geofence").trim() || "Geofence",
      speed: String(row?.speed ?? row?.speedLimit ?? "").trim(),
      availability: normalizeAvailability(String(row?.availability ?? "Available").trim() || "Available"),
      site: String(row?.site ?? "").trim() || undefined,
      area: row?.area ? String(row.area) : undefined
    };
  };

  const persistLocationItems = async (
    rows: LocationLibraryRow[],
    syncBackend = true,
    options?: { changedNames?: string[]; feedback?: boolean }
  ) => {
    const normalized = rows.map((row) => ({
      ...row,
      name: String(row.name ?? "").trim(),
      type: String(row.type ?? "").trim(),
      speed: String(row.speed ?? "").trim(),
      availability: normalizeAvailability(String(row.availability ?? "")),
      site: String(row.site ?? "").trim() || undefined
    })).filter((row) => row.name);

    const saved = await runOptimisticUpdate({
      getSnapshot: () => locationItems,
      apply: () => setLocationItems(normalized),
      rollback: (snapshot) => setLocationItems(snapshot),
      request: () => saveScopedToApi("libraries:location", { items: normalized }),
      successFeedback: Boolean(options?.feedback),
      errorMessage: "Could not save the location library. Please try again in a moment."
    });
    if (!saved) return false;

    if (!syncBackend) return true;

    const changedNameSet = new Set(
      (options?.changedNames ?? []).map((name) => String(name ?? "").trim()).filter(Boolean)
    );
    const rowsToSync =
      changedNameSet.size > 0
        ? normalized.filter((row) => changedNameSet.has(row.name))
        : normalized;

    await Promise.allSettled(
      rowsToSync
        .filter((row) => Boolean(row.traccarId || row.area))
        .map(async (row) => {
          try {
            await saveLocationGeofence({
              ...row,
              id: String(row.id ?? row.traccarId ?? row.name)
            });
          } catch (error: any) {
            showToast(
              `${row.name}: ${String(error?.message ?? error ?? "Unable to sync geofence metadata to VIVI.")}`,
              "error"
            );
          }
        })
    );

    // Location library entries belong in libraries:location only — never mirror into Location Bindings.
    void cleanupLocationLibraryTemplateBindings();
    return true;
  };

  const dedupeNotificationLibraryItems = (rows: NotificationRow[]) => {
    const byKey = new Map<string, NotificationRow>();
    for (const row of rows) {
      const key = toNotificationMergeKey(row);
      if (!key) continue;
      byKey.set(key, row);
    }
    return filterFmNotificationRows([...byKey.values()]);
  };

  const persistNotificationItems = async (
    rows: NotificationRow[],
    syncBackend = true,
    feedback = false,
    options?: { changedDescriptions?: string[] }
  ) => {
    const activeSite = readActiveSiteName();
    if (!activeSite) {
      const message = "Select a site in the organisation ribbon before saving the notification library.";
      if (feedback) endSavingError(message);
      else showToast(message, "error");
      return false;
    }

    const normalized = dedupeNotificationLibraryItems(
      rows.map((row) => normalizeNotificationItem(row)).filter((row): row is NotificationRow => row != null)
    );
    let ensured = ensureNotificationIds(normalized);

    // UK: attach GPS IoT GetEvents ids onto matching library rows (update only — no duplicates).
    if (isGpsIotServer()) {
      try {
        const catalog = await listGpsIotEvents();
        ensured = { items: stampNotificationRowsWithGpsIotEventIds(ensured.items, catalog), changed: true };
      } catch {
        // Keep local library save even if GetEvents is briefly unavailable.
      }
    }

    const saved = await runOptimisticUpdate({
      getSnapshot: () => notificationItems,
      apply: () => setNotificationItems(ensured.items),
      rollback: (snapshot) => setNotificationItems(snapshot),
      request: () =>
        saveScopedToApi(
          "libraries:notification",
          { items: ensured.items, unavailableDefaultsApplied: true },
          activeSite
        ),
      successFeedback: feedback,
      errorMessage:
        "Could not save the notification library (storage temporarily unavailable). Please try again in a moment."
    });
    if (!saved) return false;
    dispatchNotificationLibraryUpdated();

    if (!syncBackend) return true;

    // UK GPS IoT: library is site-scoped only — Traccar notification upserts would duplicate/noise.
    if (isGpsIotServer()) return true;

    const tenantId = readActiveTenantId();
    const changedDescriptions = (options?.changedDescriptions ?? [])
      .map((description) => String(description ?? "").trim())
      .filter(Boolean);
    const changedSet = new Set(changedDescriptions);
    const rowsToSync =
      changedSet.size > 0
        ? ensured.items.filter((row) => changedSet.has(String(row.description ?? "").trim()))
        : [];

    if (!tenantId || !isDatabaseTenant(tenantId) || rowsToSync.length === 0) return true;

    const parameterCatalog = parameterRows.map((row) => ({
      name: String(row.name ?? ""),
      type: String(row.type ?? ""),
      units: String(row.units ?? ""),
      availability: String(row.availability ?? "")
    }));

    let deviceBindingForFuel: Awaited<ReturnType<typeof resolveDeviceBindingForNotificationBinding>> = null;
    const needsFuelDevice = rowsToSync.some((row) => isFuelComputeNotification(row));
    if (needsFuelDevice) {
      const notificationBindings = await getBindings<NotificationBindingRecord>("notifications");
      for (const binding of notificationBindings) {
        deviceBindingForFuel = await resolveDeviceBindingForNotificationBinding(binding);
        if (deviceBindingForFuel) break;
      }
    }

    beginTraccarListCacheBatch();
    try {
      const catalogs = await prefetchTraccarLibraryCatalogs();
      let attributeSyncFailed = 0;
      const syncErrors: string[] = [];
      const idUpdates = new Map<string, Partial<NotificationRow>>();

      const syncResults = await mapPool(rowsToSync, 2, (row) =>
        syncNotificationLibraryItemToTraccar(row, {
          tenantId,
          parameterCatalog,
          deviceBinding: deviceBindingForFuel,
          notificationsCatalog: catalogs.notifications,
          computedAttributesCatalog: catalogs.computedAttributes
        })
      );

      syncResults.forEach((result, index) => {
        const row = rowsToSync[index];
        const key = String(row.description ?? "").trim();
        idUpdates.set(key, {
          traccarNotificationId: result.traccarNotificationId ?? undefined,
          traccarComputedAttributeId: result.traccarComputedAttributeId ?? undefined
        });
        if (!result.ok) {
          attributeSyncFailed += 1;
          if (result.error) syncErrors.push(`${row.description}: ${result.error}`);
        } else if (!result.computedOk && !result.computedSkipped && libraryRowNeedsComputedAttribute(row, { parameterCatalog, deviceBinding: deviceBindingForFuel })) {
          attributeSyncFailed += 1;
          syncErrors.push(`${row.description}: computed attribute was not created in VIVI.`);
        }
      });

      if (idUpdates.size > 0) {
        const withIds = ensured.items.map((row) => {
          const patch = idUpdates.get(String(row.description ?? "").trim());
          if (!patch) return row;
          const next = { ...row };
          if (patch.traccarNotificationId && patch.traccarNotificationId > 0) {
            next.traccarNotificationId = patch.traccarNotificationId;
          } else {
            delete next.traccarNotificationId;
          }
          if (patch.traccarComputedAttributeId && patch.traccarComputedAttributeId > 0) {
            next.traccarComputedAttributeId = patch.traccarComputedAttributeId;
          } else {
            delete next.traccarComputedAttributeId;
          }
          return next;
        });
        setNotificationItems(withIds);
        await saveScopedToApi(
          "libraries:notification",
          { items: withIds, unavailableDefaultsApplied: true },
          activeSite
        );
      }

      if (attributeSyncFailed > 0) {
        const message = `Notification library saved. ${attributeSyncFailed} item(s) could not sync to VIVI.${
          syncErrors.length ? ` ${syncErrors.slice(0, 2).join(" ")}` : ""
        }`;
        showToast(message, "error");
      }
    } finally {
      endTraccarListCacheBatch();
    }
    return true;
  };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const storedNotifications = await loadNotificationLibraryItems();
      const storedLocations = await loadScopedFromApi<{ items?: LocationLibraryRow[] }>("libraries:location");
      const storedMobile = await loadFromApi<any>("libraries:mobile-devices");
      const storedFirmware = await loadFromApi<any>("libraries:firmware");
      const storedParams = await loadFromApi<any>("libraries:parameters");
      if (!mounted) return;
      const localNotifications = storedNotifications
        .map((row) => normalizeNotificationItem(row))
        .filter((row): row is NotificationRow => row != null);

      const libraryOnly = localNotifications.filter(
        (row) => String(row.description ?? "").trim() !== "Default Notifications"
      );
      const ensured = ensureNotificationIds(libraryOnly);
      setNotificationItems(ensured.items);
      void removeFmMonitoredEventsFromAllBindings();
      void cleanupNotificationLibraryTemplateBindings();

      const stripLegacyLocationSeed = (rows: LocationLibraryRow[]) =>
        rows.filter((row) => !legacyLocationLibrarySeedNames.has(String(row?.name ?? "").trim().toLowerCase()));

      const localLocations = stripLegacyLocationSeed(
        storedLocations?.items && Array.isArray(storedLocations.items)
          ? (storedLocations.items as LocationLibraryRow[])
          : []
      );
      const seenLocationKeys = new Set<string>();
      const dedupedLocations: LocationLibraryRow[] = [];
      for (const row of localLocations) {
        const key = `${String(row.site ?? "").trim().toLowerCase()}|${String(row.name ?? "").trim().toLowerCase()}`;
        if (!key || seenLocationKeys.has(key)) continue;
        seenLocationKeys.add(key);
        dedupedLocations.push(row);
      }
      setLocationItems(dedupedLocations);
      const rawStoredCount = Array.isArray(storedLocations?.items) ? storedLocations.items.length : 0;
      // Only persist when stripping legacy seed rows from stored KV — not on every page load.
      if (rawStoredCount > 0 && rawStoredCount !== dedupedLocations.length) {
        void saveScopedToApi("libraries:location", { items: dedupedLocations });
      }
      // Drop legacy location-library mirrors that were incorrectly stored as Location Bindings.
      void cleanupLocationLibraryTemplateBindings();
      if (storedMobile) {
        const cleanedMobile = (Array.isArray(storedMobile.items) ? storedMobile.items : [])
          .map((s: any) => (typeof s === "string" ? s : String(s?.name ?? "")))
          .filter((s: string) => Boolean(s) && s !== "Default Notifications" && !isOrgOrSiteMobileLabel(s));
        const cleanedOverrides = { ...(storedMobile?.overrides && typeof storedMobile.overrides === "object" ? storedMobile.overrides : {}) };
        for (const key of Object.keys(cleanedOverrides)) {
          if (isOrgOrSiteMobileLabel(key)) delete cleanedOverrides[key];
        }
        let cleanedHidden = (Array.isArray(storedMobile.hidden) ? storedMobile.hidden : [])
          .map((s: any) => String(s))
          .filter((s: string) => Boolean(s) && !isOrgOrSiteMobileLabel(s));
        const rawHidden = Array.isArray(storedMobile.hidden) ? storedMobile.hidden : [];
        // Recover from bad state in UI only — do not rewrite KV until the user saves.
        const displayHidden = cleanedHidden.length > 500 ? [] : cleanedHidden;

        setMobileDeviceItems(cleanedMobile);
        setMobileDeviceHidden(displayHidden);
        setMobileDeviceOverrides(cleanedOverrides);

        // Display-only cleanup — do not auto-write KV after deploy; user saves persist intentional edits.
      }

      if (storedFirmware) {
        const catalogSet = new Set(traccarFirmwareProtocols.map((p) => p.toLowerCase()));
        const cleanedFirmware = (Array.isArray(storedFirmware.items) ? storedFirmware.items : [])
          .map((s: any) => (typeof s === "string" ? s : String(s?.name ?? "")))
          .filter((s: string) => Boolean(s) && !catalogSet.has(s.toLowerCase()));
        let cleanedHidden = (Array.isArray(storedFirmware.hidden) ? storedFirmware.hidden : [])
          .map((s: any) => String(s))
          .filter(Boolean);
        if (cleanedHidden.length > 400) cleanedHidden = [];
        const cleanedOverrides = { ...(storedFirmware?.overrides && typeof storedFirmware.overrides === "object" ? storedFirmware.overrides : {}) };
        setFirmwareItems(cleanedFirmware);
        setFirmwareHidden(cleanedHidden);
        setFirmwareOverrides(cleanedOverrides);
      } else {
        const legacyFirmware = await loadFromApi<{ items?: GenericLibraryRow[] }>("libraries:generic:firmware-library");
        if (legacyFirmware?.items && Array.isArray(legacyFirmware.items)) {
          const catalogSet = new Set(traccarFirmwareProtocols.map((p) => p.toLowerCase()));
          const legacyCustom = legacyFirmware.items
            .map((r) => String(r?.name ?? "").trim())
            .filter((name) => Boolean(name) && !catalogSet.has(name.toLowerCase()));
          if (legacyCustom.length) {
            setFirmwareItems(legacyCustom);
            void saveToApi("libraries:firmware", { items: legacyCustom, hidden: [], overrides: {} });
          }
        }
      }

      if (storedParams?.items && Array.isArray(storedParams.items)) setParameterItems(storedParams.items as any);
      if (Array.isArray(storedParams?.hidden)) setParameterHidden(storedParams.hidden.map((s: any) => String(s)).filter(Boolean));
      if (storedParams?.overrides && typeof storedParams.overrides === "object") setParameterOverrides(storedParams.overrides);

      try {
        const geofences = await loadLocationGeofences();
        if (!mounted) return;

        const locationsFromApi = geofences
          .map((g: any) => {
            const name = String(g?.name ?? "").trim();
            if (!name || legacyLocationLibrarySeedNames.has(name.toLowerCase())) return null;
            return {
              id: String(g.id ?? g.traccarId ?? name),
              traccarId: Number(g.traccarId ?? g.id) || undefined,
              name,
              type: String(g.type ?? "Geofence"),
              speed: String(g.speed ?? "").trim(),
              availability: normalizeAvailability(String(g.availability ?? "Available")),
              site: String(g.site ?? "").trim() || undefined,
              area: String(g.area ?? "").trim() || undefined,
              attributes: g.attributes,
              description: String(g.description ?? "").trim()
            } as LocationLibraryRow;
          })
          .filter((row: any) => Boolean(row));

        setApiLocationRows(locationsFromApi as any);
        setApiLibrariesLoaded(true);
      } catch {
        if (mounted) setApiLibrariesLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let reloadGen = 0;

    const mapGeofencesToRows = (geofences: any[]): LocationLibraryRow[] =>
      geofences
        .map((g: any) => {
          const name = String(g?.name ?? "").trim();
          if (!name || legacyLocationLibrarySeedNames.has(name.toLowerCase())) return null;
          return {
            id: String(g.id ?? g.traccarId ?? name),
            traccarId: Number(g.traccarId ?? g.id) || undefined,
            name,
            type: String(g.type ?? "Geofence"),
            speed: String(g.speed ?? "").trim(),
            availability: normalizeAvailability(String(g.availability ?? "Available")),
            site: String(g.site ?? "").trim() || undefined,
            area: String(g.area ?? "").trim() || undefined,
            attributes: g.attributes,
            description: String(g.description ?? "").trim()
          } as LocationLibraryRow;
        })
        .filter((row: any): row is LocationLibraryRow => Boolean(row));

    const scopeLocations = (rows: LocationLibraryRow[]) => filterRecordsForActiveSelection(rows);

    const reloadScopedLibraries = async (clearIfCold = false) => {
      const my = ++reloadGen;
      setEditingNotification(null);
      setEditingNotificationOriginal(null);
      setOpenLibraryActions(null);

      const peekedNotes = peekScopedFromApi<{ items?: NotificationRow[] }>("libraries:notification");
      const peekedLocations = peekScopedFromApi<{ items?: LocationLibraryRow[] }>("libraries:location");
      if (Array.isArray(peekedNotes?.items)) {
        const localNotifications = peekedNotes.items
          .map((row) => normalizeNotificationItem(row))
          .filter((row): row is NotificationRow => row != null);
        const libraryOnly = localNotifications.filter(
          (row) => String(row.description ?? "").trim() !== "Default Notifications"
        );
        setNotificationItems(ensureNotificationIds(libraryOnly).items);
      } else if (clearIfCold) {
        setNotificationItems([]);
      }
      if (Array.isArray(peekedLocations?.items)) {
        const stripLegacyLocationSeed = (rows: LocationLibraryRow[]) =>
          rows.filter((row) => !legacyLocationLibrarySeedNames.has(String(row?.name ?? "").trim().toLowerCase()));
        const normalizedLocations = stripLegacyLocationSeed(
          peekedLocations.items
            .map((row) => normalizeBackendLocation(row))
            .filter((row): row is LocationLibraryRow => Boolean(row))
        );
        setLocationItems(scopeLocations(normalizedLocations));
      } else if (clearIfCold) {
        setLocationItems([]);
        setApiLocationRows([]);
      }

      const [storedNotifications, storedLocations, geofences] = await Promise.all([
        loadNotificationLibraryItems(),
        loadScopedFromApi<{ items?: LocationLibraryRow[] }>("libraries:location"),
        loadLocationGeofences().catch(() => [] as any[])
      ]);
      if (!mounted || my !== reloadGen) return;

      const localNotifications = storedNotifications
        .map((row) => normalizeNotificationItem(row))
        .filter((row): row is NotificationRow => row != null);
      const libraryOnly = localNotifications.filter(
        (row) => String(row.description ?? "").trim() !== "Default Notifications"
      );
      setNotificationItems(ensureNotificationIds(libraryOnly).items);

      const stripLegacyLocationSeed = (rows: LocationLibraryRow[]) =>
        rows.filter((row) => !legacyLocationLibrarySeedNames.has(String(row?.name ?? "").trim().toLowerCase()));

      const normalizedLocations = stripLegacyLocationSeed(
        (Array.isArray(storedLocations?.items) ? storedLocations.items : [])
          .map((row) => normalizeBackendLocation(row))
          .filter((row): row is LocationLibraryRow => Boolean(row))
      );
      setLocationItems(scopeLocations(normalizedLocations));
      setApiLocationRows(scopeLocations(mapGeofencesToRows(Array.isArray(geofences) ? geofences : [])));
      setApiLibrariesLoaded(true);
    };

    const onContextChange = () => {
      void reloadScopedLibraries(true);
    };
    const unsubscribeScope = subscribeScopeChange(onContextChange);
    return () => {
      mounted = false;
      unsubscribeScope();
    };
  }, []);

  const sanitizeMobileHidden = (hidden: string[], catalog: string[]) => {
    const catalogSet = new Set(catalog);
    return hidden.filter((key) => catalogSet.has(key));
  };

  useEffect(() => {
    if (!isGenericLibrary) return;
    let mounted = true;
    void (async () => {
      const key = getGenericKey();
      const stored = await loadFromApi<{ items?: GenericLibraryRow[] }>(key);
      if (!mounted) return;
      if (stored?.items && Array.isArray(stored.items)) {
        const cleaned = (stored.items as any[]).filter(
          (r: any) => String(r?.name ?? "").trim() !== "Default Notifications"
        );
        const rows =
          activeSection === "CAN library" && isLegacyCanPlaceholder(cleaned as any)
            ? (buildDefaultCanRows() as any)
            : (cleaned as any);
        setGenericBySection((prev) => ({ ...prev, [activeSection]: rows }));
        // Repair legacy placeholder rows in KV once; never overwrite a deliberate empty library.
        if (activeSection === "CAN library" && isLegacyCanPlaceholder(stored.items as any)) {
          void saveToApi(key, { items: rows });
        } else if (cleaned.length !== stored.items.length) {
          void saveToApi(key, { items: cleaned });
        }
      } else if (activeSection === "CAN library") {
        // First visit only: show defaults in UI without persisting until the user saves.
        setGenericBySection((prev) => ({ ...prev, [activeSection]: buildDefaultCanRows() as any }));
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  useEffect(() => {
    if (!editingNotification) return;
    const normalized = normalizeNotificationItem(editingNotification);
    if (!normalized) return;
    const selectedViews = new Set(normalized.notificationVideo?.views ?? []);
    setRecordVideo(Boolean(normalized.notificationVideo?.enabled));
    setVideoSelections({
      driver: selectedViews.has("driver"),
      road: selectedViews.has("road"),
      inCab: selectedViews.has("inCab")
    });
    setRecordDelay({
      hours: "0",
      minutes: "0",
      seconds: String(normalized.notificationVideo?.afterSeconds ?? 3)
    });
    // Load saved parameters
    const params = editingNotification.parameters ?? {};
    const lockParameters = isActiveOnlyFuelNotificationDescription(editingNotification.description);
    const rawConditions = lockParameters
      ? []
      : Array.isArray((params as any).conditions) && (params as any).conditions.length > 0
        ? (params as any).conditions
        : [{ id: 1, field: "", operator: "", value: "" }];
    const storedConditions = rawConditions.map((row: any, index: number, rows: any[]) => {
      const base = {
        id: Number(row?.id) || index + 1,
        field: String(row?.field ?? ""),
        operator: String(row?.operator ?? ""),
        value: String(row?.value ?? "")
      };
      if (rows.length <= 1 || index === rows.length - 1) return base;
      const joinRaw = String(row?.join ?? "").trim().toLowerCase();
      return { ...base, join: joinRaw === "or" ? ("or" as const) : ("and" as const) };
    });
    setConditions(storedConditions);
    setSelectedConditionId(storedConditions[0]?.id ?? 1);
    const rv = (params as any).returnValue ?? {};
    setReturnValueParam(rv.param ?? "No return value");
    setReturnValueMode(rv.mode ?? "Maximum");
    const fuel = (params as any).fuelCompute ?? {};
    const usesFuelFormula = notificationUsesFuelTankComputation(editingNotification);
    const fuelInTank = isFuelInTankDescription(editingNotification.description);
    setFuelComputeEnabled(usesFuelFormula && Boolean(fuel.enabled ?? true));
    setFuelTankCapacity(String(fuel.tankCapacity ?? "400"));
    setFuelScale(String(fuel.scale ?? "75"));
    setFuelOutputAttribute(String(fuel.outputAttribute ?? (fuelInTank ? "fuel" : "fuelLevel")));
    const rec = (params as any).record ?? {};
    setRecordEvent(rec.event ?? true);
    if (rec.delay) setRecordDelay(rec.delay);
    const normalizedRec = ensureDetailedRecordSettings(rec) ?? rec;
    setRecordingType(normalizedRec.recordingType ?? "Detailed");
    setRecordActions(
      normalizedRec.actions ?? {
        startOdometer: false,
        endOdometer: false,
        startPosition: true,
        endPosition: true
      }
    );
    const act = (params as any).actions ?? {};
    setActionBuzzerEnabled(act.buzzer?.enabled ?? false);
    setActionBuzzerDelay(act.buzzer?.delay ?? { hours: "0", minutes: "0", seconds: "0" });
    setActionBuzzerDuration(act.buzzer?.duration ?? "");
    setAllowBuzzerOverride(act.buzzer?.override ?? false);
    setRelayDriveOneEnabled(act.relayOne?.enabled ?? false);
    setRelayDriveOneDelay(act.relayOne?.delay ?? { hours: "0", minutes: "0", seconds: "0" });
    setRelayDriveOneDuration(act.relayOne?.duration ?? "");
    setRelayDriveOneOverride(act.relayOne?.override ?? false);
    setRelayDriveTwoEnabled(act.relayTwo?.enabled ?? false);
    setRelayDriveTwoDelay(act.relayTwo?.delay ?? { hours: "0", minutes: "0", seconds: "0" });
    setRelayDriveTwoDuration(act.relayTwo?.duration ?? "");
    setRelayDriveTwoOverride(act.relayTwo?.override ?? false);
    const active = (params as any).active ?? {};
    setActiveMessageEnabled(active.enabled ?? false);
    setActiveUserAlerts(
      normalizeUserAlertDelivery(active.userAlerts, DEFAULT_ACTIVE_MESSAGE_ALERT_DELIVERY)
    );
    const recAlerts = (params as any).record?.userAlerts ?? (params as any).userAlerts;
    setAlertRecordingUserAlerts(
      normalizeUserAlertDelivery(recAlerts, DEFAULT_ALERT_RECORDING_DELIVERY)
    );
    setActiveQueueDelay(active.queueDelay ?? { hours: "0", minutes: "0", seconds: "0" });
    setActiveQueueMode(active.queueMode ?? "");
    setMessagePriority(active.priority ?? "");
    setSendCurrentPosition(active.sendPosition ?? false);
    setEnableActiveTracking(active.tracking ?? false);
    setTrackingDelay(active.trackingDelay ?? { hours: "0", minutes: "0", seconds: "0" });
    setTrackingInterval(active.trackingInterval ?? { hours: "0", minutes: "0", seconds: "0" });
  }, [editingNotification]);

  const operatorOptions = ["is not", "<", "<=", "=", ">", ">="];
  const booleanOperatorOptions = ["is", "is not"];
  type ConditionJoin = "and" | "or";
  type ConditionRow = {
    id: number;
    field: string;
    operator: string;
    value: string;
    join?: ConditionJoin;
  };
  const [conditions, setConditions] = useState<ConditionRow[]>([
    { id: 1, field: "", operator: "", value: "" }
  ]);
  const [selectedConditionId, setSelectedConditionId] = useState<number | null>(1);
  const [videoSelections, setVideoSelections] = useState({ driver: false, road: false, inCab: false });
  const [recordVideo, setRecordVideo] = useState(false);
  const [recordEvent, setRecordEvent] = useState(true);
  const [recordDelay, setRecordDelay] = useState({ hours: "0", minutes: "0", seconds: "3" });
  const [recordingType, setRecordingType] = useState("Detailed");
  const recordingTypeHelp: Record<string, string> = {
    Detailed: "Records the start and end of each occurrence of the event.",
    Summary: "Records a summarized occurrence for reporting and review.",
    Notification:
      "Alert-only (no video): when selected, VIVI sends user alerts from this server by email, in-app notification, and SMS when configured."
  };
  const [activeUserAlerts, setActiveUserAlerts] = useState<UserAlertDelivery>({
    ...DEFAULT_ACTIVE_MESSAGE_ALERT_DELIVERY
  });
  const [alertRecordingUserAlerts, setAlertRecordingUserAlerts] = useState<UserAlertDelivery>({
    ...DEFAULT_ALERT_RECORDING_DELIVERY
  });
  const [returnValueParam, setReturnValueParam] = useState("No return value");
  const [returnValueMode, setReturnValueMode] = useState("Maximum");
  const [fuelComputeEnabled, setFuelComputeEnabled] = useState(false);
  const [fuelTankCapacity, setFuelTankCapacity] = useState("400");
  const [fuelScale, setFuelScale] = useState("75");
  const [fuelOutputAttribute, setFuelOutputAttribute] = useState("fuelLevel");

  useEffect(() => {
    if (!editingNotification) return;
    if (!isFuelTankComputationNotificationDescription(editingNotification.description)) {
      setFuelComputeEnabled(false);
      return;
    }
    if (
      isFuelInTankDescription(editingNotification.description) ||
      isFuelTankComputationParameter(returnValueParam) ||
      conditions.some((row) => isFuelTankComputationParameter(row.field))
    ) {
      setFuelComputeEnabled(true);
    }
  }, [editingNotification, returnValueParam, conditions]);

  const [recordActions, setRecordActions] = useState<{
    startOdometer: boolean;
    endOdometer: boolean;
    startPosition: boolean;
    endPosition: boolean;
  }>({ ...DEFAULT_DETAILED_RECORD_ACTIONS });
  const [actionBuzzerEnabled, setActionBuzzerEnabled] = useState(false);
  const [actionBuzzerDelay, setActionBuzzerDelay] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const [actionBuzzerDuration, setActionBuzzerDuration] = useState("");
  const [allowBuzzerOverride, setAllowBuzzerOverride] = useState(false);
  const [relayDriveOneEnabled, setRelayDriveOneEnabled] = useState(false);
  const [relayDriveOneDelay, setRelayDriveOneDelay] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const [relayDriveOneDuration, setRelayDriveOneDuration] = useState("");
  const [relayDriveOneOverride, setRelayDriveOneOverride] = useState(false);
  const [relayDriveTwoEnabled, setRelayDriveTwoEnabled] = useState(false);
  const [relayDriveTwoDelay, setRelayDriveTwoDelay] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const [relayDriveTwoDuration, setRelayDriveTwoDuration] = useState("");
  const [relayDriveTwoOverride, setRelayDriveTwoOverride] = useState(false);
  const [activeMessageEnabled, setActiveMessageEnabled] = useState(false);
  const [activeQueueDelay, setActiveQueueDelay] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const [activeQueueMode, setActiveQueueMode] = useState("");
  const [messagePriority, setMessagePriority] = useState("");
  const [sendCurrentPosition, setSendCurrentPosition] = useState(false);
  const [enableActiveTracking, setEnableActiveTracking] = useState(false);
  const [trackingDelay, setTrackingDelay] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const [trackingInterval, setTrackingInterval] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const handleNotificationSave = () => {
    if (!editingNotification) {
      setEditingNotification(null);
      setEditingNotificationOriginal(null);
      return;
    }
    const missing = new Set<string>();
    if (!String(editingNotification.description ?? "").trim()) missing.add("description");
    const incompleteCondition = conditions.some((row, index) => {
      if (!String(row.field ?? "").trim() || !String(row.operator ?? "").trim()) return true;
      if (conditions.length > 1 && index < conditions.length - 1) {
        const join = String(row.join ?? "").trim().toLowerCase();
        if (join !== "and" && join !== "or") return true;
      }
      return false;
    });
    if (incompleteCondition && !isActiveOnlyFuelNotificationDescription(editingNotification.description)) {
      missing.add("conditions");
    }
    if (missing.size) {
      setMissingRequiredKeys(missing);
      showToast("Fill in the required fields marked in red.", "error");
      return;
    }
    setMissingRequiredKeys(new Set());
    beginSaving();
    const selectedViews = Object.entries(videoSelections)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    const lockParameters = isActiveOnlyFuelNotificationDescription(editingNotification.description);
    const usesFuelTankComputation =
      !lockParameters &&
      isFuelTankComputationNotificationDescription(editingNotification.description) &&
      (notificationUsesFuelTankComputation(editingNotification) || fuelComputeEnabled);
    const recordBlock = (() => {
      const base =
        ensureDetailedRecordSettings({
          event: recordEvent,
          delay: recordDelay,
          recordingType,
          actions:
            recordingType === "Detailed"
              ? { ...DEFAULT_DETAILED_RECORD_ACTIONS }
              : recordActions
        }) ?? {
          event: recordEvent,
          delay: recordDelay,
          recordingType,
          actions: recordActions
        };
      return isAlertRecordingType(recordingType)
        ? {
            ...base,
            userAlerts: normalizeUserAlertDelivery(
              alertRecordingUserAlerts,
              DEFAULT_ALERT_RECORDING_DELIVERY
            )
          }
        : base;
    })();
    const actionsBlock = {
      buzzer: { enabled: actionBuzzerEnabled, delay: actionBuzzerDelay, duration: actionBuzzerDuration, override: allowBuzzerOverride },
      relayOne: { enabled: relayDriveOneEnabled, delay: relayDriveOneDelay, duration: relayDriveOneDuration, override: relayDriveOneOverride },
      relayTwo: { enabled: relayDriveTwoEnabled, delay: relayDriveTwoDelay, duration: relayDriveTwoDuration, override: relayDriveTwoOverride }
    };
    const activeBlock = {
      enabled: activeMessageEnabled,
      queueDelay: activeQueueDelay,
      queueMode: activeQueueMode,
      priority: messagePriority,
      sendPosition: sendCurrentPosition,
      tracking: enableActiveTracking,
      trackingDelay,
      trackingInterval,
      ...(activeMessageEnabled
        ? { userAlerts: normalizeUserAlertDelivery(activeUserAlerts, DEFAULT_ACTIVE_MESSAGE_ALERT_DELIVERY) }
        : {})
    };
    const parameters = lockParameters
      ? applyActiveOnlyFuelParametersForSave({
          record: recordBlock,
          actions: actionsBlock,
          active: activeBlock
        })
      : {
          conditions,
          returnValue: { param: returnValueParam, mode: returnValueMode },
          ...(usesFuelTankComputation
            ? {
                fuelCompute: {
                  enabled: fuelComputeEnabled,
                  tankCapacity: fuelTankCapacity,
                  scale: fuelScale,
                  outputAttribute: fuelOutputAttribute
                }
              }
            : {}),
          record: recordBlock,
          actions: actionsBlock,
          active: activeBlock
        };
    const nextNotification = normalizeNotificationItem({
      ...editingNotification,
      notificationVideo: {
        enabled: recordVideo,
        beforeSeconds: 3,
        afterSeconds: 3,
        durationSeconds: 6,
        views: selectedViews
      },
      parameters
    });
    if (!nextNotification) {
      endSavingError("This notification type is not supported.");
      return;
    }
    const descKey = String(nextNotification.description ?? "").trim().toLowerCase();
    if (
      !editingNotificationOriginal &&
      notificationItems.some((row) => String(row.description ?? "").trim().toLowerCase() === descKey)
    ) {
      endSavingError("A library event with this description already exists. Open it to edit instead.");
      return;
    }
    const nextDraft = (() => {
      if (!editingNotificationOriginal) return [...notificationItems, nextNotification];
      return notificationItems.map((row) => (row.description === editingNotificationOriginal ? nextNotification : row));
    })();
    if (editingNotificationOriginal && editingNotificationOriginal !== nextNotification.description) {
      const previous = notificationItems.find((row) => row.description === editingNotificationOriginal);
      if (
        previous &&
        toNotificationLibraryBindingId(previous) !== toNotificationLibraryBindingId(nextNotification)
      ) {
        void deleteNotificationLibraryItemFromTraccar(previous);
      }
      void propagateMonitoredEventRename(editingNotificationOriginal, nextNotification.description);
    }
    void persistNotificationItems(nextDraft, true, true, {
      changedDescriptions: [nextNotification.description]
    })
      .then((ok) => {
        if (ok === false) return;
        setEditingNotification(null);
        setEditingNotificationOriginal(null);
      })
      .catch((error) => {
        endSavingError(String(error?.message ?? error ?? "Unable to save notification."));
      });
  };
  const resetNotificationFormState = () => {
    setConditions([{ id: 1, field: "", operator: "", value: "" }]);
    setSelectedConditionId(1);
    setVideoSelections({ driver: false, road: false, inCab: false });
    setRecordVideo(false);
    setRecordEvent(false);
    setRecordDelay({ hours: "0", minutes: "0", seconds: "3" });
    setRecordingType("");
    setReturnValueParam("");
    setReturnValueMode("");
    setRecordActions({ startOdometer: false, endOdometer: false, startPosition: false, endPosition: false });
    setActionBuzzerEnabled(false);
    setActionBuzzerDelay({ hours: "0", minutes: "0", seconds: "0" });
    setActionBuzzerDuration("");
    setAllowBuzzerOverride(false);
    setRelayDriveOneEnabled(false);
    setRelayDriveOneDelay({ hours: "0", minutes: "0", seconds: "0" });
    setRelayDriveOneDuration("");
    setRelayDriveOneOverride(false);
    setRelayDriveTwoEnabled(false);
    setRelayDriveTwoDelay({ hours: "0", minutes: "0", seconds: "0" });
    setRelayDriveTwoDuration("");
    setRelayDriveTwoOverride(false);
    setActiveMessageEnabled(false);
    setActiveQueueDelay({ hours: "0", minutes: "0", seconds: "0" });
    setActiveQueueMode("");
    setMessagePriority("");
    setSendCurrentPosition(false);
    setEnableActiveTracking(false);
    setTrackingDelay({ hours: "0", minutes: "0", seconds: "0" });
    setTrackingInterval({ hours: "0", minutes: "0", seconds: "0" });
  };
  const addConditionRow = () => {
    const newId = Date.now() + Math.random();
    setConditions((current) => {
      const next = current.map((row, index) => {
        if (index !== current.length - 1) return row;
        if (row.join === "and" || row.join === "or") return row;
        return { ...row, join: "and" as const };
      });
      return [...next, { id: newId, field: "", operator: "", value: "" }];
    });
    setSelectedConditionId(newId);
  };
  const updateCondition = (
    id: number,
    updates: Partial<Pick<ConditionRow, "field" | "operator" | "value" | "join">>
  ) => {
    setConditions((current) =>
      current.map((row) => (row.id === id ? { ...row, ...updates } : row))
    );
  };
  const deleteSelectedCondition = () => {
    setConditions((current) => {
      if (current.length <= 1) {
        const fallbackId = Date.now() + Math.random();
        setSelectedConditionId(fallbackId);
        return [{ id: fallbackId, field: "", operator: "", value: "" }];
      }
      const next = current
        .filter((row) => row.id !== selectedConditionId)
        .map((row, index, rows) => {
          if (rows.length <= 1 || index === rows.length - 1) {
            const { join: _join, ...rest } = row;
            return rest;
          }
          return {
            ...row,
            join: row.join === "or" ? ("or" as const) : ("and" as const)
          };
        });
      setSelectedConditionId(next[0]?.id ?? null);
      return next;
    });
  };
  const moveSelectedCondition = (direction: "up" | "down") => {
    setConditions((current) => {
      if (!selectedConditionId) {
        return current;
      }
      const index = current.findIndex((row) => row.id === selectedConditionId);
      if (index === -1) {
        return current;
      }
      const swapWith = direction === "up" ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[swapWith]] = [next[swapWith], next[index]];
      return next;
    });
  };
  const duplicateSelectedCondition = () => {
    setConditions((current) => {
      if (!selectedConditionId) {
        return current;
      }
      const selected = current.find((row) => row.id === selectedConditionId);
      if (!selected) {
        return current;
      }
      const newId = Date.now() + Math.random();
      const index = current.findIndex((row) => row.id === selectedConditionId);
      const next = [...current];
      next.splice(index + 1, 0, { ...selected, id: newId });
      setSelectedConditionId(newId);
      return next;
    });
  };
  const handleNotificationAdd = () => {
    resetNotificationFormState();
    const newNotification =
      normalizeNotificationItem({
        description: "",
        type: "Custom",
        availability: "Unavailable",
        eventId: ""
      }) ?? {
        description: "",
        type: "Custom",
        availability: "Unavailable",
        eventId: ""
      };
    setEditingNotification(newNotification);
    setEditingNotificationOriginal(null);
  };
  const updateNotificationAvailability = (description: string, availability: string) => {
    const next = notificationItems.map((row) => (row.description === description ? { ...row, availability } : row));
    void persistNotificationItems(next, true, false, { changedDescriptions: [description] });
    setOpenLibraryActions(null);
  };
  const deleteNotification = (description: string) => {
    const removed = notificationItems.find((row) => row.description === description) ?? null;
    const next = notificationItems.filter((row) => row.description !== description);
    void (async () => {
      if (removed) await deleteNotificationLibraryItemFromTraccar(removed);
      await removeMonitoredEventFromAllBindings(description);
      await persistNotificationItems(next, false);
    })();
    setOpenLibraryActions(null);
  };

  const closeCreateModal = () => {
    setCreateModal(null);
    setCreateValues({});
    setMissingRequiredKeys(new Set());
  };

  const openCreateModal = (kind: "generic" | "mobile" | "location" | "parameter" | "firmware") => {
    if (kind === "location") {
      setCreateModal({
        kind,
        title: "Add location",
        subtitle: "Create a new geofence/location library entry."
      });
      setCreateValues({ name: "", type: "Geofence", speed: "0", availability: "Available", site: "" });
      return;
    }
    if (kind === "mobile") {
      setCreateModal({
        kind,
        title: "Add mobile device",
        subtitle: "Register a device family for library selection."
      });
      setCreateValues({ name: "", availability: "Available" });
      return;
    }
    if (kind === "parameter") {
      setCreateModal({
        kind,
        title: "Add parameter",
        subtitle: "Create a telemetry parameter definition."
      });
      setCreateValues({ name: "", type: "Number", units: "", availability: "Available" });
      return;
    }
    if (kind === "firmware") {
      setCreateModal({
        kind,
        title: "Add firmware",
        subtitle: "Register a firmware or protocol entry for library selection."
      });
      setCreateValues({ name: "", availability: "Available", type: "Firmware" });
      return;
    }
    setCreateModal({
      kind,
      title: "Add item",
      subtitle: "Create a new library item for this section."
    });
    setCreateValues({
      name: "",
      availability: "Available",
      notForFm: "",
      type: activeSection.toLowerCase().includes("can") ? "Scriptable CAN" : "Library"
    });
  };

  const addLocationRow = () => {
    openCreateModal("location");
  };

  const addMobileDevice = () => {
    openCreateModal("mobile");
  };

  const addFirmware = () => {
    openCreateModal("firmware");
  };

  const persistFirmwareLibrary = (
    nextItems = firmwareItems,
    nextHidden = firmwareHidden,
    nextOverrides = firmwareOverrides
  ) => {
    setFirmwareItems(nextItems);
    setFirmwareHidden(nextHidden);
    setFirmwareOverrides(nextOverrides);
    void saveToApi("libraries:firmware", { items: nextItems, hidden: nextHidden, overrides: nextOverrides });
  };

  const applyFirmwareEdit = (key: string, nextNameRaw: string, availabilityRaw?: string, typeRaw?: string) => {
    const nextName = String(nextNameRaw ?? "").trim();
    if (!nextName) return;
    const nextAvailability = availabilityRaw !== undefined ? normalizeAvailability(availabilityRaw) : undefined;
    const nextType = typeRaw !== undefined ? String(typeRaw ?? "").trim() || "Firmware" : undefined;

    const isCustom = firmwareItems.includes(key);
    const nextOverrides: Record<string, any> = { ...firmwareOverrides };
    nextOverrides[key] = { ...(nextOverrides[key] ?? {}), name: nextName };
    if (nextAvailability !== undefined) nextOverrides[key].availability = nextAvailability;
    if (nextType !== undefined) nextOverrides[key].type = nextType;

    if (isCustom) {
      const nextItems = firmwareItems.map((n) => (n === key ? nextName : n));
      const prev = nextOverrides[key] ?? {};
      delete nextOverrides[key];
      nextOverrides[nextName] = { ...prev, name: nextName };
      persistFirmwareLibrary(nextItems, firmwareHidden.filter((n) => n !== key), nextOverrides);
      return;
    }

    const nextHidden = firmwareHidden.includes(key) ? firmwareHidden : [key, ...firmwareHidden];
    const nextItems = firmwareItems.includes(nextName) ? firmwareItems : [nextName, ...firmwareItems];
    const prev = nextOverrides[key] ?? {};
    delete nextOverrides[key];
    nextOverrides[nextName] = { ...prev, name: nextName };
    persistFirmwareLibrary(nextItems, nextHidden, nextOverrides);
  };

  const setFirmwareAvailability = (key: string, availability: string) => {
    const nextOverrides = {
      ...firmwareOverrides,
      [key]: { ...(firmwareOverrides[key] ?? {}), availability: normalizeAvailability(availability) }
    };
    persistFirmwareLibrary(firmwareItems, firmwareHidden, nextOverrides);
    setOpenLibraryActions(null);
  };

  const deleteFirmware = (key: string) => {
    const ok = window.confirm(`Delete ${firmwareOverrides[key]?.name ?? key}?`);
    if (!ok) return;
    if (firmwareItems.includes(key)) {
      const nextItems = firmwareItems.filter((n) => n !== key);
      const nextOverrides = { ...firmwareOverrides };
      delete (nextOverrides as any)[key];
      persistFirmwareLibrary(nextItems, firmwareHidden, nextOverrides);
    } else {
      const nextHidden = firmwareHidden.includes(key) ? firmwareHidden : [key, ...firmwareHidden];
      persistFirmwareLibrary(firmwareItems, nextHidden, firmwareOverrides);
    }
    setOpenLibraryActions(null);
  };

  const openEditFirmware = (key: string, row: { key: string; name: string; availability: string; type: string }) => {
    setEditValues({ name: row.name, availability: row.availability, type: row.type });
    setEditModal({ kind: "firmware", key, title: "Edit firmware" });
  };

  const persistMobileDevices = (nextItems = mobileDeviceItems, nextHidden = mobileDeviceHidden, nextOverrides = mobileDeviceOverrides) => {
    setMobileDeviceItems(nextItems);
    setMobileDeviceHidden(nextHidden);
    setMobileDeviceOverrides(nextOverrides);
    void saveToApi("libraries:mobile-devices", { items: nextItems, hidden: nextHidden, overrides: nextOverrides });
  };

  const applyMobileDeviceEdit = (key: string, nextNameRaw: string, availabilityRaw?: string) => {
    const nextName = String(nextNameRaw ?? "").trim();
    if (!nextName) return;
    const nextAvailability = availabilityRaw !== undefined ? normalizeAvailability(availabilityRaw) : undefined;

    const isCustom = mobileDeviceItems.includes(key);
    const nextOverrides: Record<string, any> = { ...mobileDeviceOverrides };
    nextOverrides[key] = { ...(nextOverrides[key] ?? {}), name: nextName };
    if (nextAvailability !== undefined) nextOverrides[key].availability = nextAvailability;

    if (isCustom) {
      const nextItems = mobileDeviceItems.map((n) => (n === key ? nextName : n));
      // move overrides to the new key to keep future actions intuitive
      const prev = nextOverrides[key] ?? {};
      delete nextOverrides[key];
      nextOverrides[nextName] = { ...prev, name: nextName };
      persistMobileDevices(nextItems, mobileDeviceHidden.filter((n) => n !== key), nextOverrides);
      return;
    }

    // Built-in row rename: hide old key and add new as custom.
    const nextHidden = mobileDeviceHidden.includes(key) ? mobileDeviceHidden : [key, ...mobileDeviceHidden];
    const nextItems = mobileDeviceItems.includes(nextName) ? mobileDeviceItems : [nextName, ...mobileDeviceItems];
    const prev = nextOverrides[key] ?? {};
    delete nextOverrides[key];
    nextOverrides[nextName] = { ...prev, name: nextName };
    persistMobileDevices(nextItems, nextHidden, nextOverrides);
  };

  const setMobileDeviceAvailability = (key: string, availability: string) => {
    const nextOverrides = { ...mobileDeviceOverrides, [key]: { ...(mobileDeviceOverrides[key] ?? {}), availability: normalizeAvailability(availability) } };
    persistMobileDevices(mobileDeviceItems, mobileDeviceHidden, nextOverrides);
    setOpenLibraryActions(null);
  };

  const deleteMobileDevice = (key: string) => {
    const ok = window.confirm(`Delete ${mobileDeviceOverrides[key]?.name ?? key}?`);
    if (!ok) return;
    if (mobileDeviceItems.includes(key)) {
      const nextItems = mobileDeviceItems.filter((n) => n !== key);
      const nextOverrides = { ...mobileDeviceOverrides };
      delete (nextOverrides as any)[key];
      persistMobileDevices(nextItems, mobileDeviceHidden, nextOverrides);
    } else {
      const nextHidden = mobileDeviceHidden.includes(key) ? mobileDeviceHidden : [key, ...mobileDeviceHidden];
      persistMobileDevices(mobileDeviceItems, nextHidden, mobileDeviceOverrides);
    }
    setOpenLibraryActions(null);
  };

  const addParameter = () => {
    openCreateModal("parameter");
  };

  const persistParameters = (
    nextItems = parameterItems,
    nextHidden = parameterHidden,
    nextOverrides = parameterOverrides
  ) => {
    setParameterItems(nextItems);
    setParameterHidden(nextHidden);
    setParameterOverrides(nextOverrides);
    void saveToApi("libraries:parameters", { items: nextItems, hidden: nextHidden, overrides: nextOverrides });
  };

  const applyParameterEdit = (
    name: string,
    next: { name: string; type: string; units: string; availability?: string }
  ) => {
    const nextName = String(next.name ?? "").trim();
    if (!nextName) return;
    const nextType = String(next.type ?? "").trim();
    const nextUnits = String(next.units ?? "");
    const nextAvailability = normalizeAvailability(String(next.availability ?? ""));

    const isCustom = parameterItems.some((row) => row.name === name);
    if (isCustom) {
      const nextItems = parameterItems.map((row) =>
        row.name === name ? { ...row, name: nextName, type: nextType, units: nextUnits, availability: nextAvailability } : row
      );
      persistParameters(nextItems);
      syncParameterAfterPersist([nextName], name !== nextName ? [name] : []);
      return;
    }

    const nextOverrides = {
      ...parameterOverrides,
      [name]: { ...(parameterOverrides[name] ?? {}), name: nextName, type: nextType, units: nextUnits, availability: nextAvailability }
    };

    if (nextName !== name) {
      const nextHidden = parameterHidden.includes(name) ? parameterHidden : [name, ...parameterHidden];
      const nextItems = [{ name: nextName, type: nextType, units: nextUnits, availability: nextAvailability }, ...parameterItems];
      persistParameters(nextItems, nextHidden, nextOverrides);
      syncParameterAfterPersist([nextName], [name]);
      return;
    }

    persistParameters(parameterItems, parameterHidden, nextOverrides);
    syncParameterAfterPersist([nextName]);
  };

  const setParameterAvailability = (name: string, availability: string) => {
    const v = normalizeAvailability(availability);
    const isCustom = parameterItems.some((row) => row.name === name);
    if (isCustom) {
      const nextItems = parameterItems.map((row) => (row.name === name ? { ...row, availability: v } : row));
      persistParameters(nextItems);
      syncParameterAfterPersist([name]);
    } else {
      const nextOverrides = { ...parameterOverrides, [name]: { ...(parameterOverrides[name] ?? {}), availability: v } };
      persistParameters(parameterItems, parameterHidden, nextOverrides);
      syncParameterAfterPersist([name]);
    }
    setOpenLibraryActions(null);
  };

  const deleteParameter = (name: string) => {
    const ok = window.confirm(`Delete ${name}?`);
    if (!ok) return;
    const isCustom = parameterItems.some((row) => row.name === name);
    if (isCustom) {
      const nextItems = parameterItems.filter((row) => row.name !== name);
      persistParameters(nextItems);
      syncParameterAfterPersist([], [name]);
    } else {
      const nextHidden = parameterHidden.includes(name) ? parameterHidden : [name, ...parameterHidden];
      persistParameters(parameterItems, nextHidden);
      syncParameterAfterPersist([], [name]);
    }
    setOpenLibraryActions(null);
  };

  const applyLocationEdit = (name: string, next: { name: string; type: string; speed: string; availability: string }) => {
    const nextName = String(next.name ?? "").trim();
    if (!nextName) return;
    const nextType = String(next.type ?? "").trim();
    const nextSpeed = String(next.speed ?? "").trim();
    const nextAvailability = normalizeAvailability(String(next.availability ?? ""));
    const nextItems = locationItems.map((row) =>
      row.name === name ? { ...row, name: nextName, type: nextType, speed: nextSpeed, availability: nextAvailability } : row
    );
    void persistLocationItems(nextItems, true, { changedNames: [nextName] });
  };

  const setLocationAvailability = (name: string, availability: string) => {
    const v = normalizeAvailability(availability);
    const nextItems = locationItems.map((row) => (row.name === name ? { ...row, availability: v } : row));
    void persistLocationItems(nextItems, true, { changedNames: [name] });
    setOpenLibraryActions(null);
  };

  const deleteLocation = (name: string) => {
    const ok = window.confirm(`Delete ${name}?`);
    if (!ok) return;
    const target = locationRows.find((row) => row.name === name);
    const nextItems = locationItems.filter((row) => row.name !== name);
    void (async () => {
      try {
        if (target) {
          await removeLocationGeofence({
            ...target,
            id: String(target.id ?? target.traccarId ?? target.name)
          });
        }
        await persistLocationItems(nextItems, false);
        setApiLocationRows((current) => current.filter((row) => row.name !== name));
        showToast("Location deleted from VIVI.", "success");
      } catch (error: any) {
        showToast(String(error?.message ?? error ?? "Unable to delete location."), "error");
      }
    })();
    setOpenLibraryActions(null);
  };

  const ensureGenericItems = (): GenericLibraryRow[] => {
    const stored = genericBySection[activeSection];
    if (stored && Array.isArray(stored) && stored.length) {
      if (activeSection === "CAN library" && isLegacyCanPlaceholder(stored as any)) {
        return buildDefaultCanRows() as any;
      }
      // Always filter Default Notifications from in-memory state
      const filtered = (stored as any[]).filter(
        (r: any) => String(r?.name ?? "").trim() !== "Default Notifications"
      );
      if (filtered.length === 0 && activeSection === "CAN library") {
        return [] as any;
      }
      return filtered as any;
    }
    if (activeSection === "CAN library") {
      return buildDefaultCanRows() as any;
    }
    const type = activeSection.toLowerCase().includes("can") ? "Scriptable CAN" : "Library";
    return [
      { name: `${activeSection} Item 1`, availability: "Available", notForFm: "", type },
      { name: `${activeSection} Item 2`, availability: "", notForFm: "", type },
      { name: `${activeSection} Item 3`, availability: "", notForFm: "", type }
    ];
  };

  const persistGenericItems = (items: GenericLibraryRow[]) => {
    setGenericBySection((prev) => ({ ...prev, [activeSection]: items }));
    void saveToApi(getGenericKey(), { items });
  };

  const duplicateGenericItem = (name: string) => {
    const current = ensureGenericItems().find((r) => r.name === name);
    if (!current) return;
    const baseName = name.replace(/ \(copy(?: \d+)?\)$/, "");
    const existing = ensureGenericItems().map((r) => r.name);
    let newName = `${baseName} (copy)`;
    let counter = 2;
    while (existing.includes(newName)) {
      newName = `${baseName} (copy ${counter})`;
      counter++;
    }
    const duplicate: GenericLibraryRow = { ...current, name: newName };
    const next = uniqByName([duplicate, ...ensureGenericItems()]);
    persistGenericItems(next);
    setOpenLibraryActions(null);
  };

  const addGenericItem = () => {
    openCreateModal("generic");
  };

  const saveCreateModal = () => {
    if (!createModal) return;
    const v = createValues;
    const name = String(v.name ?? "").trim();
    if (!name || (createModal.kind === "mobile" && isOrgOrSiteMobileLabel(name))) {
      setMissingRequiredKeys(new Set(["name"]));
      showToast("Fill in the required fields marked in red.", "error");
      return;
    }
    setMissingRequiredKeys(new Set());
    beginSaving();

    if (createModal.kind === "location") {
      const type = String(v.type ?? "").trim() || "Geofence";
      const speed = String(v.speed ?? "").trim() || "0";
      const availability = normalizeAvailability(String(v.availability ?? "").trim() || "Available");
      const site = String(v.site ?? "").trim();
      const exists = locationItems.some((row) => String(row.name ?? "").trim().toLowerCase() === name.toLowerCase());
      const next = exists
        ? locationItems.map((row) =>
            String(row.name ?? "").trim().toLowerCase() === name.toLowerCase()
              ? { name, type, speed, availability, ...(site ? { site } : {}) }
              : row
          )
        : [{ name, type, speed, availability, ...(site ? { site } : {}) }, ...locationItems];
      void persistLocationItems(next, true, { changedNames: [name], feedback: true })
        .then((ok) => {
          if (ok === false) endSavingError("Unable to save location.");
        })
        .catch((error) => endSavingError(String(error?.message ?? error ?? "Unable to save location.")));
      closeCreateModal();
      return;
    }

    if (createModal.kind === "firmware") {
      const availability = normalizeAvailability(String(v.availability ?? "").trim() || "Available");
      const type = String(v.type ?? "").trim() || "Firmware";
      const next = firmwareItems.includes(name) ? firmwareItems : [name, ...firmwareItems];
      const nextOverrides = {
        ...firmwareOverrides,
        [name]: { ...(firmwareOverrides[name] ?? {}), name, availability, type }
      };
      persistFirmwareLibrary(next, firmwareHidden.filter((item) => item !== name), nextOverrides);
      closeCreateModal();
      endSavingDone();
      return;
    }

    if (createModal.kind === "mobile") {
      const availability = normalizeAvailability(String(v.availability ?? "").trim() || "Available");
      const next = mobileDeviceItems.includes(name) ? mobileDeviceItems : [name, ...mobileDeviceItems];
      const nextOverrides = {
        ...mobileDeviceOverrides,
        [name]: { ...(mobileDeviceOverrides[name] ?? {}), name, availability }
      };
      persistMobileDevices(next, mobileDeviceHidden.filter((item) => item !== name), nextOverrides);
      closeCreateModal();
      endSavingDone();
      return;
    }

    if (createModal.kind === "parameter") {
      const type = String(v.type ?? "").trim() || "Number";
      const units = String(v.units ?? "").trim();
      const availability = normalizeAvailability(String(v.availability ?? "").trim() || "Available");
      const exists = parameterItems.some((row) => String(row.name ?? "").trim().toLowerCase() === name.toLowerCase());
      const next = exists
        ? parameterItems.map((row) =>
            String(row.name ?? "").trim().toLowerCase() === name.toLowerCase()
              ? { name, type, units, availability }
              : row
          )
        : [{ name, type, units, availability }, ...parameterItems];
      persistParameters(next);
      syncParameterAfterPersist([name]);
      closeCreateModal();
      return;
    }

    const availability = normalizeAvailability(String(v.availability ?? "").trim() || "Available");
    const notForFm = String(v.notForFm ?? "").trim();
    const type = String(v.type ?? "").trim() || (activeSection.toLowerCase().includes("can") ? "Scriptable CAN" : "Library");
    const next = uniqByName([{ name, availability, notForFm, type }, ...ensureGenericItems()]);
    persistGenericItems(next);
    closeCreateModal();
    endSavingDone();
  };

  const editGenericItem = (name: string) => {
    const current = ensureGenericItems().find((r) => r.name === name);
    if (!current) return;
    setEditValues({
      name: current.name,
      availability: current.availability,
      notForFm: current.notForFm,
      type: current.type
    });
    setEditModal({ kind: "generic", key: name, title: "Edit item" });
  };

  const openEditMobile = (key: string, row: { key: string; name: string; availability: string }) => {
    setEditValues({ name: row.name, availability: row.availability });
    setEditModal({ kind: "mobile", key, title: "Edit mobile device" });
  };

  const openEditLocation = (key: string, row: LocationLibraryRow) => {
    setEditValues({
      name: row.name,
      type: row.type,
      speed: row.speed,
      availability: row.availability
    });
    setEditModal({ kind: "location", key, title: "Edit location" });
  };

  const openEditParameter = (key: string, row: any) => {
    setEditValues({
      name: String(row.name ?? ""),
      type: String(row.type ?? ""),
      units: String(row.units ?? ""),
      availability: String(row.availability ?? "")
    });
    setEditModal({ kind: "parameter", key, title: "Edit parameter" });
  };

  const closeEditModal = () => {
    setEditModal(null);
    setEditValues({});
    setMissingRequiredKeys(new Set());
  };

  const saveEditModal = () => {
    if (!editModal) return;
    const v = editValues;
    const nextName = String(v.name ?? "").trim();
    if (!nextName) {
      setMissingRequiredKeys(new Set(["name"]));
      showToast("Fill in the required fields marked in red.", "error");
      return;
    }
    setMissingRequiredKeys(new Set());
    beginSaving();
    if (editModal.kind === "generic") {
      const nextAvailability = normalizeAvailability(String(v.availability ?? ""));
      const nextNotForFm = String(v.notForFm ?? "");
      const nextType = String(v.type ?? "");
      const next = uniqByName(
        ensureGenericItems().map((r) =>
          r.name === editModal.key
            ? { name: nextName, availability: nextAvailability, notForFm: nextNotForFm, type: nextType }
            : r
        )
      );
      persistGenericItems(next);
      closeEditModal();
      setOpenLibraryActions(null);
      endSavingDone();
      return;
    }
    if (editModal.kind === "mobile") {
      applyMobileDeviceEdit(editModal.key, String(v.name ?? ""), String(v.availability ?? ""));
      closeEditModal();
      setOpenLibraryActions(null);
      endSavingDone();
      return;
    }
    if (editModal.kind === "firmware") {
      applyFirmwareEdit(
        editModal.key,
        String(v.name ?? ""),
        String(v.availability ?? ""),
        String(v.type ?? "")
      );
      closeEditModal();
      setOpenLibraryActions(null);
      endSavingDone();
      return;
    }
    if (editModal.kind === "location") {
      applyLocationEdit(editModal.key, {
        name: String(v.name ?? ""),
        type: String(v.type ?? ""),
        speed: String(v.speed ?? ""),
        availability: String(v.availability ?? "")
      });
      closeEditModal();
      setOpenLibraryActions(null);
      endSavingDone();
      return;
    }
    if (editModal.kind === "parameter") {
      applyParameterEdit(editModal.key, {
        name: String(v.name ?? ""),
        type: String(v.type ?? ""),
        units: String(v.units ?? ""),
        availability: String(v.availability ?? "")
      });
      closeEditModal();
      setOpenLibraryActions(null);
      endSavingDone();
      return;
    }
  };

  const setGenericAvailability = (name: string, availability: string) => {
    const v = normalizeAvailability(availability);
    const next = ensureGenericItems().map((r) => (r.name === name ? { ...r, availability: v } : r));
    persistGenericItems(next);
    setOpenLibraryActions(null);
  };

  const deleteGenericItem = (name: string) => {
    const ok = window.confirm(`Delete ${name}?`);
    if (!ok) return;
    const next = ensureGenericItems().filter((r) => r.name !== name);
    persistGenericItems(next);
    setOpenLibraryActions(null);
  };

  // notificationRows now imported from shared data module

  const rows = useMemo(() => {
    if (!isGenericLibrary) return [] as any[];
    return ensureGenericItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, genericBySection]);

  const defaultMobileDevices = traccarMobileDevices;

  const mobileDeviceRows = useMemo(() => {
    const catalog = Array.from(new Set([...defaultMobileDevices, ...mobileDeviceItems]));
    const sanitizedHidden = sanitizeMobileHidden(mobileDeviceHidden, catalog);

    const base = defaultMobileDevices
      .filter((n) => !sanitizedHidden.includes(n) && !isOrgOrSiteMobileLabel(n))
      .map((n) => {
        const o = mobileDeviceOverrides[n] ?? {};
        return { key: n, name: String(o.name ?? n), availability: normalizeAvailability(String(o.availability ?? "Available")) };
      });

    const custom = mobileDeviceItems
      .filter((n) => !sanitizedHidden.includes(n) && !isOrgOrSiteMobileLabel(n))
      .map((n) => {
        const o = mobileDeviceOverrides[n] ?? {};
        return { key: n, name: String(o.name ?? n), availability: normalizeAvailability(String(o.availability ?? "Available")) };
      });

    return uniqByName([...custom, ...base]);
  }, [defaultMobileDevices, mobileDeviceHidden, mobileDeviceItems, mobileDeviceOverrides]);

  const filteredMobileDeviceRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return mobileDeviceRows;
    return mobileDeviceRows.filter((row) => {
      const hay = `${row.name} ${row.availability}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filterText, mobileDeviceRows]);

  const firmwareRows = useMemo(() => {
    const extraNames = [tenantFirmwareArtifact, ...firmwareItems].filter((n): n is string => Boolean(n));
    const catalog = Array.from(new Set([...traccarFirmwareProtocols, ...extraNames]));
    const sanitizedHidden = sanitizeMobileHidden(firmwareHidden, catalog);

    const base = traccarFirmwareProtocols
      .filter((n) => !sanitizedHidden.includes(n))
      .map((n) => {
        const o = firmwareOverrides[n] ?? {};
        return {
          key: n,
          name: String(o.name ?? n),
          availability: normalizeAvailability(String(o.availability ?? "Available")),
          type: String(o.type ?? "Firmware")
        };
      });

    const custom = extraNames
      .filter((n) => !traccarFirmwareProtocols.includes(n) && !sanitizedHidden.includes(n))
      .map((n) => {
        const o = firmwareOverrides[n] ?? {};
        return {
          key: n,
          name: String(o.name ?? n),
          availability: normalizeAvailability(String(o.availability ?? "Available")),
          type: String(o.type ?? "Firmware")
        };
      });

    return uniqByName([...custom, ...base]);
  }, [firmwareHidden, firmwareItems, firmwareOverrides, tenantFirmwareArtifact]);

  const filteredFirmwareRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return firmwareRows;
    return firmwareRows.filter((row) => {
      const hay = `${row.name} ${row.availability} ${row.type}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filterText, firmwareRows]);

  const locationRows = useMemo(() => {
    const merged = [...locationItems, ...apiLocationRows];
    const seen = new Set<string>();
    const out: LocationLibraryRow[] = [];
    for (const row of merged) {
      const normalized = normalizeBackendLocation(row);
      if (!normalized) continue;
      const key = `${String(normalized.site ?? "").trim().toLowerCase()}|${normalized.name.toLowerCase()}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
    }
    return filterRecordsForActiveSelection(out);
  }, [apiLocationRows, locationItems]);

  const defaultParameterRows = useMemo(
    () => [
      { name: "3-Axis Cornering G-Force (High Sensitivity)", type: "Value", units: "G" },
      { name: "3-Axis Cornering G-Force (Low Sensitivity)", type: "Value", units: "G" },
      { name: "3-Axis Cornering G-Force (Medium Sensitivity)", type: "Value", units: "G" },
      { name: "3-Axis Impact Severity", type: "Value", units: "" },
      { name: "3-Axis Liftoff Severity", type: "Value", units: "" },
      { name: "3-Axis Road Roughness Severity", type: "Value", units: "" },
      { name: "3-Axis X-Axis Rotation", type: "Value", units: "" },
      { name: "3-Axis Y-Axis Rotation", type: "Value", units: "" },
      { name: "Acceleration", type: "Acceleration", units: "km/h/s" },
      { name: "Active Control - output relay drive 1 Progressive", type: "Boolean", units: "" },
      { name: "Active Control - output relay drive 2 Progressive", type: "Boolean", units: "" },
      { name: "Active Control - Plug disarm prevented", type: "Boolean", units: "" },
      { name: "Active Control - positive drive OFF", type: "Boolean", units: "" },
      { name: "Active Control - positive drive ON", type: "Boolean", units: "" },
      { name: "Active Control - relay drive 1 OFF", type: "Boolean", units: "" },
      { name: "Active Control - relay drive 1 ON", type: "Boolean", units: "" },
      { name: "Active Control - relay drive 2 OFF", type: "Boolean", units: "" },
      { name: "Active Control - relay drive 2 ON", type: "Boolean", units: "" },
      { name: "Armed", type: "Boolean", units: "" },
      { name: "At location", type: "Location", units: "" },
      { name: "Back panel tamper detected", type: "Boolean", units: "" },
      { name: "Bat Over Temperature", type: "Temperature", units: "Â°C" },
      { name: "Battery disconnect date/time", type: "Date and Time", units: "" },
      { name: "Battery disconnect duration", type: "Seconds", units: "seconds" },
      { name: "Battery level percentage - Bluetooth Remote", type: "Value", units: "" },
      { name: "Battery voltage", type: "Value", units: "mV" },
      { name: "Blocked", type: "Boolean", units: "" },
      { name: "Charge", type: "Boolean", units: "" },
      { name: "Communication session to server active", type: "Boolean", units: "" },
      { name: "Config rollback reason", type: "Value", units: "" },
      { name: "Cornering G-Force (High Sensitivity)", type: "Value", units: "G" },
      { name: "Cornering G-Force (Low Sensitivity)", type: "Value", units: "G" },
      { name: "Cornering G-Force (Med Sensitivity)", type: "Value", units: "G" },
      { name: "Crossing State Line", type: "Boolean", units: "" },
      { name: "Current date", type: "Date", units: "" },
      { name: "Current date/time", type: "Date and Time", units: "" },
      { name: "Current driver ID", type: "Value", units: "" },
      { name: "Current State", type: "US State ID", units: "" },
      { name: "Current time", type: "Time", units: "" },
      { name: "Current Trip duration", type: "Value", units: "Hours" },
      { name: "Day of week", type: "Day of Week", units: "" },
      { name: "Deceleration", type: "Acceleration", units: "km/h/s" },
      { name: "Diagnostic : Extra Tacho Field", type: "Value", units: "" },
      { name: "Diagnostic : SubTrip Duration", type: "Seconds", units: "seconds" },
      { name: "Diagnostic: Auto-Orientation State", type: "Value", units: "" },
      { name: "Diagnostic: Analyzed Speed", type: "Speed", units: "km/h" },
      { name: "Diagnostic: Speed Spike", type: "Boolean", units: "" },
      { name: "DriveMate Mode", type: "Value", units: "" },
      { name: "Driver Assist", type: "Value", units: "" },
      { name: "Door", type: "Boolean", units: "" },
      { name: "Driver plug valid", type: "Boolean", units: "" },
      { name: "Driver seatbelt not engaged", type: "Boolean", units: "" },
      { name: "Engine hour reading", type: "Seconds", units: "Hours" },
      { name: "Engine RPM", type: "Value", units: "RPM" },
      { name: "EV CAN: Energy consumed", type: "Value", units: "kWh" },
      { name: "EV CAN: Energy consumed by auxiliaries", type: "Value", units: "kWh" },
      { name: "EV CAN: Energy generated", type: "Value", units: "kWh" },
      { name: "EV CAN: State of charge", type: "Value", units: "%" },
      { name: "Extended Driver ID", type: "Value", units: "" },
      { name: "Extended Driver ID (high)", type: "Value", units: "" },
      { name: "Extended Driver ID (middle)", type: "Value", units: "" },
      { name: "Extended Driver ID present", type: "Boolean", units: "" },
      { name: "Front panel tamper detected", type: "Boolean", units: "" },
      { name: "GPRS - connected to network", type: "Boolean", units: "" },
      { name: "GPRS is connected", type: "Boolean", units: "" },
      { name: "GPRS out of coverage indicator", type: "Value", units: "" },
      { name: "GPRS running Rx byte count", type: "Value", units: "Bytes" },
      { name: "GPRS running session count", type: "Value", units: "" },
      { name: "GPRS running total byte count", type: "Value", units: "Bytes" },
      { name: "GPRS running Tx byte count", type: "Value", units: "Bytes" },
      { name: "GPRS session active", type: "Boolean", units: "" },
      { name: "GPS age of reading", type: "Seconds", units: "seconds" },
      { name: "GPS altitude", type: "Distance", units: "m" },
      { name: "GPS diagnostic plug inserted", type: "Boolean", units: "" },
      { name: "GPS distance since last valid reading", type: "Distance", units: "m" },
      { name: "GPS External Antenna State", type: "Value", units: "" },
      { name: "GPS HDOP", type: "Value", units: "" },
      { name: "GPS heading", type: "Value", units: "Â°" },
      { name: "GPS jamming status", type: "Value", units: "" },
      { name: "Fuel level (L)", type: "Value", units: "L" },
      { name: FUEL_TANK_COMPUTATION_PARAMETER, type: "Computed", units: "L" },
      { name: "Fuel tank capacity (L)", type: "Value", units: "L" },
      ...buildTeltonikaAnalogInputParameterRows(),
      { name: "GPS latitude", type: "Latitude", units: "Â°" },
      { name: "GPS longitude", type: "Longitude", units: "Â°" },
      { name: "GPS number of satellites", type: "Value", units: "" },
      { name: "GPS Signal Quality", type: "Value", units: "" },
      { name: "GPS velocity", type: "Speed", units: "km/h" },
      { name: "GPS velocity fallback triggered", type: "Boolean", units: "" },
      { name: "GSM call active (data)", type: "Boolean", units: "" },
      { name: "GSM call active (voice)", type: "Boolean", units: "" },
      { name: "GSM diagnostic plug inserted", type: "Boolean", units: "" },
      { name: "GSM idle", type: "Boolean", units: "" },
      { name: "GSM in coverage", type: "Boolean", units: "" },
      { name: "GSM jamming status", type: "Value", units: "" },
      { name: "GSM modem asleep", type: "Boolean", units: "" },
      { name: "GSM modem in use by SDK", type: "Boolean", units: "" },
      { name: "GSM modem rebooted", type: "Boolean", units: "" },
      { name: "GSM network status", type: "Value", units: "" },
      { name: "GSM ringing (voice)", type: "Boolean", units: "" },
      { name: "GSM roaming", type: "Boolean", units: "" },
      { name: "GSM Serving Cell Access Technology", type: "Value", units: "" },
      { name: "GSM signal quality", type: "Value", units: "" },
      { name: "High resolution Odometer", type: "Distance", units: "km" },
      { name: "High resolution trip distance", type: "Distance", units: "km" },
      { name: "Ignition", type: "Boolean", units: "" },
      { name: "Ignition on", type: "Boolean", units: "" },
      { name: "Ignition Voltage", type: "Value", units: "mV" },
      { name: "In Sub-trip", type: "Boolean", units: "" },
      { name: "In trip (drive)", type: "Boolean", units: "" },
      { name: "Internal Battery backup voltage", type: "Value", units: "V" },
      { name: "Internal Battery Charging State", type: "Boolean", units: "" },
      { name: "Internal Battery charging status", type: "Boolean", units: "" },
      { name: "Internal battery in use", type: "Boolean", units: "" },
      { name: "Internal Battery ripple voltage", type: "Value", units: "V" },
      { name: "Internal Battery State", type: "Value", units: "" },
      { name: "Internal Battery trickle charging timer", type: "Value", units: "sec" },
      { name: "Internal Battery Voltage", type: "Value", units: "" },
      { name: "Invalid Extended Driver ID", type: "Boolean", units: "" },
      { name: "Invalid organisation driver plug", type: "Boolean", units: "" },
      { name: "Last config error", type: "Value", units: "" },
      { name: "Location speed Tracking - Shape ID of Current Hit", type: "Value", units: "" },
      { name: "Motion", type: "Boolean", units: "" },
      { name: "Not at location", type: "Location", units: "" },
      { name: "Odometer reading", type: "Distance", units: "km" },
      { name: "Organisation and driver from plug", type: "Combined Company and Driver ID", units: "" },
      { name: "Overrideable alarm on", type: "Boolean", units: "" },
      { name: "Panic Alert", type: "Boolean", units: "" },
      { name: "Passenger ID", type: "Passenger ID", units: "" },
      { name: "PIN failure count", type: "Value", units: "" },
      { name: "Plug driver ID", type: "Value", units: "" },
      { name: "Plug insert count", type: "Value", units: "" },
      { name: "Plug serial ID", type: "Value", units: "" },
      { name: "Plug type", type: "Value", units: "" },
      { name: "Positive drive power on", type: "Boolean", units: "" },
      { name: "Primary Battery Connection State", type: "Value", units: "" },
      { name: "Private mode plug active", type: "Boolean", units: "" },
      { name: "Raw internal temperature", type: "Temperature", units: "Â°C" },
      { name: "Rear door driver side state", type: "Value", units: "" },
      { name: "Rear door passenger side state", type: "Value", units: "" },
      { name: "Relay drive 1 enabled / Power control on", type: "Boolean", units: "" },
      { name: "Relay drive 2 enabled / Power control on", type: "Boolean", units: "" },
      { name: "Relay drive 2 status", type: "Boolean", units: "" },
      { name: "Road speed", type: "Speed", units: "km/h" },
      { name: "RPM : Speed ratio", type: "Value", units: "" },
      { name: "RPM calibration pulses", type: "Value", units: "" },
      { name: "RS232 is ok", type: "Boolean", units: "" },
      { name: "Seconds since last Cycle", type: "Seconds", units: "seconds" },
      { name: "SIM error", type: "Boolean", units: "" },
      { name: "SIM PUK locked", type: "Boolean", units: "" },
      { name: "Speed", type: "Speed", units: "km/h" },
      { name: "Speed calibration pulses", type: "Value", units: "" },
      { name: "Speed Tracking - Active message options", type: "Value", units: "" },
      { name: "Speed Tracking - Current location", type: "Location", units: "" },
      { name: "Speed Tracking - Over speeding buffered value", type: "Speed", units: "km/h" },
      { name: "Speed Tracking - Over speeding value", type: "Speed", units: "km/h" },
      { name: "Speed Tracking - Recording delay", type: "Seconds", units: "seconds" },
      { name: "Speed Tracking - Warning delay", type: "Seconds", units: "seconds" },
      { name: "Standing delay expired", type: "Boolean", units: "" },
      { name: "Starter interuption relay stat", type: "Boolean", units: "" },
      { name: "Stop Vector Count", type: "Value", units: "" },
      { name: "Sub-trip termination button pressed", type: "Boolean", units: "" },
      { name: "System overridden", type: "Boolean", units: "" },
      { name: "Tick - 30 seconds", type: "Boolean", units: "" },
      { name: "Tick - 1 min", type: "Boolean", units: "" },
      { name: "Tick - 5 min", type: "Boolean", units: "" },
      { name: "Tick - 10 min", type: "Boolean", units: "" },
      { name: "Tick - 120 min (2 Hours)", type: "Boolean", units: "" },
      { name: "Tick - 15 min", type: "Boolean", units: "" },
      { name: "Tick - 240 min (4 Hours)", type: "Boolean", units: "" },
      { name: "Tick - 30 min", type: "Boolean", units: "" },
      { name: "Tick - 360 min (6 Hours)", type: "Boolean", units: "" },
      { name: "Tick - 480 min (8 Hours)", type: "Boolean", units: "" },
      { name: "Tick - 60 min (Hour)", type: "Boolean", units: "" },
      { name: "Tick - 720 min (12 Hours)", type: "Boolean", units: "" },
      { name: "Time in mode", type: "Seconds", units: "seconds" },
      { name: "Time Since Ignition On", type: "Seconds", units: "seconds" },
      { name: "Time Since Positive Drive On", type: "Seconds", units: "seconds" },
      { name: "Time Since SubTrip Depart", type: "Value", units: "Hours" },
      { name: "Track trace cornering threshold", type: "Integer", units: "G" },
      { name: "Track trace input 1 threshold", type: "Integer", units: "mv" },
      { name: "Track trace input 2 threshold", type: "Integer", units: "mv" },
      { name: "Trip distance", type: "Distance", units: "km" },
      { name: "TT: Block 0 Status 11", type: "Value", units: "" },
      { name: "TT: Block 0 Status 12", type: "Value", units: "" },
      { name: "TT: Block 0 Status 13", type: "Value", units: "" },
      { name: "TT: Block 0 Status 8", type: "Value", units: "" },
      { name: "TT: Block 1 Status 14", type: "Value", units: "" },
      { name: "Unit power down requested", type: "Boolean", units: "" },
      { name: "Vehicle active", type: "Boolean", units: "" },
      { name: "Vehicle moving", type: "Boolean", units: "" },
      { name: "Version of configuration that was accepted", type: "Integer", units: "" },
      { name: "Weekday (Monday to Friday)", type: "Boolean", units: "" }
    ],
    []
  );

  const parameterRows = useMemo<any[]>(() => {
    const base = defaultParameterRows
      .filter((row: any) => !parameterHidden.includes(String(row.name)))
      .map((row: any) => {
        const o = parameterOverrides[row.name] ?? {};
        return {
          ...row,
          ...(o as any),
          availability: normalizeAvailability(String((o as any)?.availability ?? (row as any)?.availability ?? ""))
        };
      });

    const custom = parameterItems
      .filter((row) => !parameterHidden.includes(String(row.name)))
      .map((row) => ({ ...row, availability: normalizeAvailability(String(row.availability ?? "")) }));

    return uniqByName([...(custom as any), ...(base as any)] as any) as any[];
  }, [defaultParameterRows, parameterHidden, parameterItems, parameterOverrides]);

  const filteredNotificationRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return notificationItems;
    return notificationItems.filter((row) => {
      const hay = `${row.description} ${row.type} ${row.availability} ${row.eventId}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filterText, notificationItems]);

  const filteredLocationRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return locationRows;
    return locationRows.filter((row) => {
      const hay = `${row.name} ${row.type} ${row.speed} ${row.availability}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filterText, locationRows]);

  const filteredParameterRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return parameterRows;
    return parameterRows.filter((row) => {
      const hay = `${row.name} ${row.type} ${row.units} ${row.availability}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filterText, parameterRows]);

  const filteredGenericRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => String(row.name ?? "").toLowerCase().includes(q));
  }, [filterText, rows]);

  const getNotificationSortValue = useCallback(
    (row: NotificationRow, key: string) =>
      key === "description" ? row.description : key === "type" ? row.type : key === "availability" ? row.availability : "",
    []
  );
  const getMobileSortValue = useCallback(
    (row: { name: string; availability: string }, key: string) =>
      key === "name" ? row.name : key === "availability" ? row.availability : "",
    []
  );
  const getFirmwareSortValue = useCallback(
    (row: { name: string; availability: string; type: string }, key: string) =>
      key === "name" ? row.name : key === "availability" ? row.availability : key === "type" ? row.type : "",
    []
  );
  const getLocationSortValue = useCallback(
    (row: LocationLibraryRow, key: string) =>
      key === "name"
        ? row.name
        : key === "type"
          ? row.type
          : key === "speed"
            ? row.speed
            : key === "availability"
              ? row.availability
              : "",
    []
  );
  const getParameterSortValue = useCallback(
    (row: { name: string; type: string; units: string }, key: string) =>
      key === "name" ? row.name : key === "type" ? row.type : key === "units" ? row.units : "",
    []
  );
  const getGenericSortValue = useCallback(
    (row: { name: string; availability: string; type: string }, key: string) =>
      key === "name" ? row.name : key === "availability" ? row.availability : key === "type" ? row.type : "",
    []
  );

  const notificationSort = useColumnSort({ rows: filteredNotificationRows, getValue: getNotificationSortValue });
  const mobileSort = useColumnSort({ rows: filteredMobileDeviceRows, getValue: getMobileSortValue });
  const firmwareSort = useColumnSort({ rows: filteredFirmwareRows, getValue: getFirmwareSortValue });
  const locationSort = useColumnSort({ rows: filteredLocationRows, getValue: getLocationSortValue });
  const parameterSort = useColumnSort({ rows: filteredParameterRows, getValue: getParameterSortValue });
  const genericSort = useColumnSort({ rows: filteredGenericRows, getValue: getGenericSortValue });

  const allowFuelTankComputationUi = useMemo(
    () =>
      editingNotification
        ? isFuelTankComputationNotificationDescription(editingNotification.description)
        : false,
    [editingNotification]
  );
  const conditionOptions = useMemo(() => {
    const names = parameterRows.map((row) => row.name);
    if (allowFuelTankComputationUi) return names;
    return names.filter((name) => !isFuelTankComputationParameter(String(name)));
  }, [parameterRows, allowFuelTankComputationUi]);
  const parameterCatalog = useMemo<ParameterCatalogRow[]>(
    () =>
      parameterRows.map((row) => ({
        name: String(row.name ?? "").trim(),
        type: String(row.type ?? "").trim(),
        units: String(row.units ?? "").trim(),
        availability: String(row.availability ?? "").trim()
      })),
    [parameterRows]
  );
  const lockEventParameters = useMemo(
    () =>
      editingNotification
        ? isActiveOnlyFuelNotificationDescription(editingNotification.description)
          || isTraccarDefaultNotificationDescription(editingNotification.description)
          || String(editingNotification.type ?? "").trim().toLowerCase() === "default"
        : false,
    [editingNotification]
  );
  const lockDefaultNotificationIdentity = useMemo(
    () =>
      editingNotification
        ? isTraccarDefaultNotificationDescription(editingNotification.description)
          || String(editingNotification.type ?? "").trim().toLowerCase() === "default"
        : false,
    [editingNotification]
  );

  const showFuelTankComputationPanel = useMemo(() => {
    if (!editingNotification || lockEventParameters) return false;
    return allowFuelTankComputationUi;
  }, [editingNotification, lockEventParameters, allowFuelTankComputationUi]);

  const getConditionUnit = (field: string) =>
    parameterRows.find((row) => row.name === field)?.units ?? "";
  const isBooleanConditionField = (field: string) => isBooleanParameterField(field, parameterCatalog);
  const operatorsForConditionField = (field: string) =>
    isBooleanConditionField(field) ? booleanOperatorOptions : operatorOptions;
  const displayConditionOperator = (field: string, operator: string) => {
    if (!isBooleanConditionField(field)) return operator;
    if (operator === "=" || operator === "is") return "is";
    if (operator === "is not") return "is not";
    return operator;
  };
  const applyConditionFieldDefaults = (field: string): Partial<ConditionRow> => {
    if (!isBooleanParameterField(field, parameterCatalog)) return { field };
    return {
      field,
      operator: "is",
      value: "true"
    };
  };

  const syncParametersWithTraccar = async (names: string[], deletedNames: string[] = []) => {
    const tenantId = readActiveTenantId();
    if (!tenantId || !isDatabaseTenant(tenantId)) return;

    await Promise.allSettled(deletedNames.map((name) => deleteParameterLibraryItemFromTraccar(name)));

    await Promise.allSettled(
      names.map(async (name) => {
        const row = parameterRows.find((entry) => entry.name === name);
        if (!row || parameterHidden.includes(name)) {
          await deleteParameterLibraryItemFromTraccar(name);
          return;
        }
        const result = await syncParameterLibraryItemToTraccar(row);
        if (!result.ok && result.error) showToast(result.error, "error");
      })
    );
  };

  const syncParameterAfterPersist = (names: string[], deletedNames: string[] = []) => {
    void syncParametersWithTraccar(names, deletedNames)
      .then(() => {
        if (names.length || deletedNames.length) {
          endSavingDone();
        }
      })
      .catch((error) => {
        endSavingError(String(error?.message ?? error ?? "Unable to sync parameters."));
      });
  };

  return (
    <div className="page libraries-page">
      <section className="libraries-card">
        <div className="libraries-layout">
          {!hideSectionNav ? (
            <aside className="libraries-sidebar">
              {librarySections.map((section) => (
                <button
                  key={section}
                  type="button"
                  className={`libraries-tab ${activeSection === section ? "active" : ""}`}
                  onClick={() => setActiveSection(section)}
                >
                  {section}
                </button>
              ))}
            </aside>
          ) : null}

          <div className="libraries-panel">
            <div className="libraries-panel-header">
              <div className="libraries-panel-title">{titleOverride ?? activeSection}</div>
              <div className="libraries-header-actions">
                <input
                  className="libraries-search"
                  placeholder="Filter"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
                {isLocationLibrary ? (
                  <>
                    <button type="button" className="libraries-icon-btn" aria-label="Download" title="Download">
                      {"\u2B73"}
                    </button>
                    <button type="button" className="libraries-icon-btn" aria-label="Upload" title="Upload">
                      {"\u2B71"}
                    </button>
                    <button
                      type="button"
                      className="libraries-add-btn"
                      aria-label="Add geofence"
                      onClick={addLocationRow}
                    >
                      Add geofence
                    </button>
                  </>
                ) : isParameterLibrary ? (
                  <button type="button" className="libraries-add-btn" aria-label="Add parameter" onClick={addParameter}>
                    Add parameter
                  </button>
                ) : isMobileDeviceLibrary ? (
                  <button type="button" className="libraries-add-btn" aria-label="Add device" onClick={addMobileDevice}>
                    Add device
                  </button>
                ) : isFirmwareLibrary ? (
                  <button type="button" className="libraries-add-btn" aria-label="Add firmware" onClick={addFirmware}>
                    Add firmware
                  </button>
                ) : (
                  <button
                    type="button"
                    className="libraries-add-btn"
                    aria-label="Add"
                    onClick={isNotificationLibrary ? handleNotificationAdd : isGenericLibrary ? addGenericItem : undefined}
                  >
                    +
                  </button>
                )}
              </div>
            </div>

            <div className={`libraries-table ${isNotificationLibrary ? "libraries-table-event" : ""}`}>
                {isNotificationLibrary ? (
                <>
                  <div className="libraries-row libraries-head libraries-row-notification">
                    <SortableColumnHeader label="Notification description" {...notificationSort.getHeaderProps("description")} />
                    <SortableColumnHeader label="Notification Type" {...notificationSort.getHeaderProps("type")} />
                    <SortableColumnHeader label="Availability" {...notificationSort.getHeaderProps("availability")} />
                    <div className="libraries-actions" aria-hidden="true">…</div>
                  </div>
                  {notificationSort.sortedRows.map((row) => (
                    <div key={row.description} className="libraries-row libraries-row-notification">
                      <div className="libraries-link">
                        <button
                          type="button"
                          className="libraries-name-btn"
                          onClick={() => {
                            const normalized = normalizeNotificationItem(row);
                            if (!normalized) return;
                            setEditingNotification(normalized);
                            setEditingNotificationOriginal(row.description);
                          }}
                        >
                          {row.description}
                        </button>
                      </div>
                      <div>{row.type}</div>
                      <div>{row.availability}</div>
                      <div className="libraries-actions">
                        <button
                          type="button"
                          className="libraries-action-btn"
                          aria-label="Actions"
                          onClick={() =>
                            setOpenLibraryActions((prev) => (prev === row.description ? null : row.description))
                          }
                        >
                          …
                        </button>
                        {openLibraryActions === row.description && (
                          <div className="libraries-actions-menu" role="menu">
                            {normalizeAvailability(String(row.availability ?? "")) === "Available" ? (
                              <>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    const normalized = normalizeNotificationItem(row);
                                    if (!normalized) return;
                                    setEditingNotification(normalized);
                                    setEditingNotificationOriginal(row.description);
                                    setOpenLibraryActions(null);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => updateNotificationAvailability(row.description, "Unavailable")}
                                >
                                  Make Un Available
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => updateNotificationAvailability(row.description, "Suspended")}
                                >
                                  Suspend
                                </button>
                                <button type="button" role="menuitem" onClick={() => deleteNotification(row.description)}>
                                  Delete
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => updateNotificationAvailability(row.description, "Available")}
                              >
                                Make available
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : isMobileDeviceLibrary ? (
                <>
                  <div className="libraries-row libraries-head libraries-row-mobile">
                    <SortableColumnHeader label="Mobile device" {...mobileSort.getHeaderProps("name")} />
                    <SortableColumnHeader label="Availability" {...mobileSort.getHeaderProps("availability")} />
                    <div className="libraries-actions" aria-hidden="true">…</div>
                  </div>
                  {mobileSort.sortedRows.length === 0 ? (
                    <div className="libraries-row libraries-row-mobile">
                      <div style={{ gridColumn: "1 / -1", color: "#64748b", padding: "12px 0" }}>
                        {filterText.trim()
                          ? "No mobile devices match your filter."
                          : "No mobile devices in library. Check VIVI server connection or clear your filter."}
                      </div>
                    </div>
                  ) : (
                    mobileSort.sortedRows.map((row) => (
                    <div key={row.key} className="libraries-row libraries-row-mobile">
                      <div className="libraries-link">{row.name}</div>
                      <div>{row.availability}</div>
                      <div className="libraries-actions">
                        <button
                          type="button"
                          className="libraries-action-btn"
                          aria-label="Actions"
                          onClick={() => setOpenLibraryActions((prev) => (prev === row.key ? null : row.key))}
                        >
                          …
                        </button>
                        {openLibraryActions === row.key && (
                          <div className="libraries-actions-menu" role="menu">
                            <button type="button" role="menuitem" onClick={() => openEditMobile(row.key, row as any)}>
                              Edit
                            </button>
                            <button type="button" role="menuitem" onClick={() => setMobileDeviceAvailability(row.key, "Available")}>
                              Make available
                            </button>
                            <button type="button" role="menuitem" onClick={() => setMobileDeviceAvailability(row.key, "Unavailable")}>
                              Make unavailable
                            </button>
                            <button type="button" role="menuitem" onClick={() => setMobileDeviceAvailability(row.key, "Suspended")}>
                              Suspend
                            </button>
                            <button type="button" role="menuitem" onClick={() => deleteMobileDevice(row.key)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    ))
                  )}
                </>
              ) : isFirmwareLibrary ? (
                <>
                  <div className="libraries-row libraries-head libraries-row-firmware">
                    <SortableColumnHeader label="Firmware" {...firmwareSort.getHeaderProps("name")} />
                    <SortableColumnHeader label="Availability" {...firmwareSort.getHeaderProps("availability")} />
                    <SortableColumnHeader label="Type" {...firmwareSort.getHeaderProps("type")} />
                    <div className="libraries-actions" aria-hidden="true">…</div>
                  </div>
                  {firmwareSort.sortedRows.length === 0 ? (
                    <div className="libraries-row libraries-row-firmware">
                      <div style={{ gridColumn: "1 / -1", color: "#64748b", padding: "12px 0" }}>
                        {filterText.trim()
                          ? "No firmware entries match your filter."
                          : "No firmware entries in library."}
                      </div>
                    </div>
                  ) : (
                    firmwareSort.sortedRows.map((row) => (
                      <div key={row.key} className="libraries-row libraries-row-firmware">
                        <div className="libraries-link">{row.name}</div>
                        <div>{row.availability}</div>
                        <div>{row.type}</div>
                        <div className="libraries-actions">
                          <button
                            type="button"
                            className="libraries-action-btn"
                            aria-label="Actions"
                            onClick={() => setOpenLibraryActions((prev) => (prev === row.key ? null : row.key))}
                          >
                            …
                          </button>
                          {openLibraryActions === row.key && (
                            <div className="libraries-actions-menu" role="menu">
                              <button type="button" role="menuitem" onClick={() => openEditFirmware(row.key, row)}>
                                Edit
                              </button>
                              <button type="button" role="menuitem" onClick={() => setFirmwareAvailability(row.key, "Available")}>
                                Make available
                              </button>
                              <button type="button" role="menuitem" onClick={() => setFirmwareAvailability(row.key, "Unavailable")}>
                                Make unavailable
                              </button>
                              <button type="button" role="menuitem" onClick={() => setFirmwareAvailability(row.key, "Suspended")}>
                                Suspend
                              </button>
                              <button type="button" role="menuitem" onClick={() => deleteFirmware(row.key)}>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </>
              ) : isLocationLibrary ? (
                <>
                  <div className="libraries-row libraries-head libraries-row-location">
                    <SortableColumnHeader label="Name" {...locationSort.getHeaderProps("name")} />
                    <SortableColumnHeader label="Type" {...locationSort.getHeaderProps("type")} />
                    <SortableColumnHeader label="Speed limit" {...locationSort.getHeaderProps("speed")} />
                    <SortableColumnHeader label="Availability" {...locationSort.getHeaderProps("availability")} />
                    <div className="libraries-actions" aria-hidden="true">…</div>
                  </div>
                  {locationSort.sortedRows.map((row) => (
                    <div key={row.name} className="libraries-row libraries-row-location">
                      <div className="libraries-link">{String(row.name ?? "")}</div>
                      <div>{String(row.type ?? "")}</div>
                      <div>{String(row.speed ?? "")}</div>
                      <div>{String(row.availability ?? "")}</div>
                      <div className="libraries-actions">
                        <button
                          type="button"
                          className="libraries-action-btn"
                          aria-label="Actions"
                          onClick={() =>
                            setOpenLibraryActions((prev) => (prev === row.name ? null : row.name))
                          }
                        >
                          …
                        </button>
                        {openLibraryActions === row.name && (
                          <div className="libraries-actions-menu" role="menu">
                            <button type="button" role="menuitem" onClick={() => openEditLocation(row.name, row as any)}>
                              Edit
                            </button>
                            <button type="button" role="menuitem" onClick={() => setLocationAvailability(row.name, "Available")}>
                              Make available
                            </button>
                            <button type="button" role="menuitem" onClick={() => setLocationAvailability(row.name, "Unavailable")}>
                              Make unavailable
                            </button>
                            <button type="button" role="menuitem" onClick={() => setLocationAvailability(row.name, "Suspended")}>
                              Suspend
                            </button>
                            <button type="button" role="menuitem" onClick={() => deleteLocation(row.name)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : isParameterLibrary ? (
                <>
                  <div className="libraries-row libraries-head libraries-row-parameter">
                    <SortableColumnHeader label="Parameter" {...parameterSort.getHeaderProps("name")} />
                    <SortableColumnHeader label="Parameter type" {...parameterSort.getHeaderProps("type")} />
                    <SortableColumnHeader label="Units" {...parameterSort.getHeaderProps("units")} />
                    <div className="libraries-actions" aria-hidden="true">…</div>
                  </div>
                  {parameterSort.sortedRows.map((row) => (
                    <div key={row.name} className="libraries-row libraries-row-parameter">
                      <div className="libraries-link">{row.name}</div>
                      <div>{row.type}</div>
                      <div>{row.units}</div>
                      <div className="libraries-actions">
                        <button
                          type="button"
                          className="libraries-action-btn"
                          aria-label="Actions"
                          onClick={() => setOpenLibraryActions((prev) => (prev === row.name ? null : row.name))}
                        >
                          …
                        </button>
                        {openLibraryActions === row.name && (
                          <div className="libraries-actions-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => openEditParameter(row.name, row as any)}
                            >
                              Edit
                            </button>
                            <button type="button" role="menuitem" onClick={() => setParameterAvailability(row.name, "Available")}>
                              Make available
                            </button>
                            <button type="button" role="menuitem" onClick={() => setParameterAvailability(row.name, "Unavailable")}>
                              Make unavailable
                            </button>
                            <button type="button" role="menuitem" onClick={() => setParameterAvailability(row.name, "Suspended")}>
                              Suspend
                            </button>
                            <button type="button" role="menuitem" onClick={() => deleteParameter(row.name)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="libraries-row libraries-head libraries-row-can">
                    <SortableColumnHeader label={isCanLibrary ? "CAN script" : "Name"} {...genericSort.getHeaderProps("name")} />
                    <SortableColumnHeader label="Availability" {...genericSort.getHeaderProps("availability")} />
                    <SortableColumnHeader label="Type" {...genericSort.getHeaderProps("type")} />
                    <div className="libraries-actions" aria-hidden="true">…</div>
                  </div>
                  {genericSort.sortedRows.map((row) => (
                    <div key={row.name} className="libraries-row libraries-row-can">
                      <div className="libraries-link">
                        <button
                          type="button"
                          className="libraries-name-btn"
                          onClick={() => editGenericItem(row.name)}
                        >
                          {row.name}
                        </button>
                      </div>
                      <div>{row.availability}</div>
                      <div>{row.type}</div>
                      <div className="libraries-actions">
                        <button
                          type="button"
                          className="libraries-action-btn"
                          aria-label="Actions"
                          onClick={() =>
                            setOpenLibraryActions((prev) => (prev === row.name ? null : row.name))
                          }
                        >
                          …
                        </button>
                        {openLibraryActions === row.name && (
                          <div className="libraries-actions-menu" role="menu">
                            <button type="button" role="menuitem" onClick={() => editGenericItem(row.name)}>
                              Edit
                            </button>
                            <button type="button" role="menuitem" onClick={() => duplicateGenericItem(row.name)}>
                              Duplicate
                            </button>
                            <button type="button" role="menuitem" onClick={() => setGenericAvailability(row.name, "Available")}>
                              Make available
                            </button>
                            <button type="button" role="menuitem" onClick={() => setGenericAvailability(row.name, "Unavailable")}>
                              Make unavailable
                            </button>
                            <button type="button" role="menuitem" onClick={() => setGenericAvailability(row.name, "Suspended")}>
                              Suspend
                            </button>
                            <button type="button" role="menuitem" onClick={() => deleteGenericItem(row.name)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {editModal && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={closeEditModal}
        >
          <div className="admin-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title">{editModal.title}</div>
                <div className="admin-modal-sub">Update the selected item.</div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                aria-label="Close"
                data-toast-ignore
                onClick={closeEditModal}
              >
                {"\u2715"}
              </button>
            </div>

            <div className="admin-modal-body">
              <label className={`admin-modal-field ${fieldMissingClass("name") ?? ""}`.trim()}>
                <span>Name <span aria-hidden="true">*</span></span>
                <input
                  type="text"
                  value={editValues.name ?? ""}
                  onChange={(event) => {
                    setEditValues((cur) => ({ ...cur, name: event.target.value }));
                    setMissingRequiredKeys((current) => {
                      if (!current.has("name")) return current;
                      const next = new Set(current);
                      next.delete("name");
                      return next;
                    });
                  }}
                />
              </label>

              {editModal.kind === "generic" && (
                <>
                  <label className="admin-modal-field">
                    <span>Availability</span>
                    <select
                      value={editValues.availability ?? ""}
                      onChange={(event) => setEditValues((cur) => ({ ...cur, availability: event.target.value }))}
                    >
                      <option value="Available">Available</option>
                      <option value="Unavailable">Unavailable</option>
                      <option value="Suspended">Suspended</option>
                      <option value="">(blank)</option>
                    </select>
                  </label>
                  <label className="admin-modal-field">
                    <span>Type</span>
                    <input
                      type="text"
                      value={editValues.type ?? ""}
                      onChange={(event) => setEditValues((cur) => ({ ...cur, type: event.target.value }))}
                    />
                  </label>
                </>
              )}

              {editModal.kind === "firmware" && (
                <>
                  <label className="admin-modal-field">
                    <span>Availability</span>
                    <select
                      value={editValues.availability ?? ""}
                      onChange={(event) => setEditValues((cur) => ({ ...cur, availability: event.target.value }))}
                    >
                      <option value="Available">Available</option>
                      <option value="Unavailable">Unavailable</option>
                      <option value="Suspended">Suspended</option>
                      <option value="">(blank)</option>
                    </select>
                  </label>
                  <label className="admin-modal-field">
                    <span>Type</span>
                    <input
                      type="text"
                      value={editValues.type ?? ""}
                      onChange={(event) => setEditValues((cur) => ({ ...cur, type: event.target.value }))}
                    />
                  </label>
                </>
              )}

              {editModal.kind === "mobile" && (
                <label className="admin-modal-field">
                  <span>Availability</span>
                  <select
                    value={editValues.availability ?? ""}
                    onChange={(event) => setEditValues((cur) => ({ ...cur, availability: event.target.value }))}
                  >
                    <option value="Available">Available</option>
                    <option value="Unavailable">Unavailable</option>
                    <option value="Suspended">Suspended</option>
                    <option value="">(blank)</option>
                  </select>
                </label>
              )}

              {editModal.kind === "location" && (
                <>
                  <label className="admin-modal-field">
                    <span>Type</span>
                    <input
                      type="text"
                      value={editValues.type ?? ""}
                      onChange={(event) => setEditValues((cur) => ({ ...cur, type: event.target.value }))}
                    />
                  </label>
                  <label className="admin-modal-field">
                    <span>Speed limit</span>
                    <input
                      type="text"
                      value={editValues.speed ?? ""}
                      onChange={(event) => setEditValues((cur) => ({ ...cur, speed: event.target.value }))}
                    />
                  </label>
                  <label className="admin-modal-field">
                    <span>Availability</span>
                    <select
                      value={editValues.availability ?? ""}
                      onChange={(event) => setEditValues((cur) => ({ ...cur, availability: event.target.value }))}
                    >
                      <option value="Available">Available</option>
                      <option value="Unavailable">Unavailable</option>
                      <option value="Suspended">Suspended</option>
                      <option value="">(blank)</option>
                    </select>
                  </label>
                </>
              )}

              {editModal.kind === "parameter" && (
                <>
                  <label className="admin-modal-field">
                    <span>Parameter type</span>
                    <input
                      type="text"
                      value={editValues.type ?? ""}
                      onChange={(event) => setEditValues((cur) => ({ ...cur, type: event.target.value }))}
                    />
                  </label>
                  <label className="admin-modal-field">
                    <span>Units</span>
                    <input
                      type="text"
                      value={editValues.units ?? ""}
                      onChange={(event) => setEditValues((cur) => ({ ...cur, units: event.target.value }))}
                    />
                  </label>
                  <label className="admin-modal-field">
                    <span>Availability</span>
                    <select
                      value={editValues.availability ?? ""}
                      onChange={(event) => setEditValues((cur) => ({ ...cur, availability: event.target.value }))}
                    >
                      <option value="Available">Available</option>
                      <option value="Unavailable">Unavailable</option>
                      <option value="Suspended">Suspended</option>
                      <option value="">(blank)</option>
                    </select>
                  </label>
                </>
              )}
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="admin-modal-btn ghost" data-toast-ignore onClick={closeEditModal}>
                Cancel
              </button>
              <button type="button" className="admin-modal-btn" data-toast-ignore onClick={saveEditModal}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {createModal && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={closeCreateModal}
        >
          <div className="admin-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title">{createModal.title}</div>
                <div className="admin-modal-sub">{createModal.subtitle}</div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                aria-label="Close"
                data-toast-ignore
                onClick={closeCreateModal}
              >
                {"\u2715"}
              </button>
            </div>

            <div className="admin-modal-body">
              <label className={`admin-modal-field ${fieldMissingClass("name") ?? ""}`.trim()}>
                <span>Name <span aria-hidden="true">*</span></span>
                <input
                  type="text"
                  value={createValues.name ?? ""}
                  onChange={(event) => {
                    setCreateValues((cur) => ({ ...cur, name: event.target.value }));
                    setMissingRequiredKeys((current) => {
                      if (!current.has("name")) return current;
                      const next = new Set(current);
                      next.delete("name");
                      return next;
                    });
                  }}
                  placeholder="Enter name"
                />
              </label>

              {(createModal.kind === "generic" ||
                createModal.kind === "mobile" ||
                createModal.kind === "location" ||
                createModal.kind === "parameter" ||
                createModal.kind === "firmware") && (
                <label className="admin-modal-field">
                  <span>Availability</span>
                  <select
                    value={createValues.availability ?? "Available"}
                    onChange={(event) => setCreateValues((cur) => ({ ...cur, availability: event.target.value }))}
                  >
                    <option value="Available">Available</option>
                    <option value="Unavailable">Unavailable</option>
                    <option value="Suspended">Suspended</option>
                    <option value="">(blank)</option>
                  </select>
                </label>
              )}

              {(createModal.kind === "generic" || createModal.kind === "firmware") && (
                <label className="admin-modal-field">
                  <span>Type</span>
                  <input
                    type="text"
                    value={createValues.type ?? ""}
                    onChange={(event) => setCreateValues((cur) => ({ ...cur, type: event.target.value }))}
                  />
                </label>
              )}

              {createModal.kind === "location" && (
                <>
                  <label className="admin-modal-field">
                    <span>Type</span>
                    <input
                      type="text"
                      value={createValues.type ?? "Geofence"}
                      onChange={(event) => setCreateValues((cur) => ({ ...cur, type: event.target.value }))}
                    />
                  </label>
                  <label className="admin-modal-field">
                    <span>Speed limit</span>
                    <input
                      type="text"
                      value={createValues.speed ?? "0"}
                      onChange={(event) => setCreateValues((cur) => ({ ...cur, speed: event.target.value }))}
                    />
                  </label>
                  <label className="admin-modal-field">
                    <span>Site (optional)</span>
                    <input
                      type="text"
                      value={createValues.site ?? ""}
                      onChange={(event) => setCreateValues((cur) => ({ ...cur, site: event.target.value }))}
                    />
                  </label>
                </>
              )}

              {createModal.kind === "parameter" && (
                <>
                  <label className="admin-modal-field">
                    <span>Parameter type</span>
                    <input
                      type="text"
                      value={createValues.type ?? "Number"}
                      onChange={(event) => setCreateValues((cur) => ({ ...cur, type: event.target.value }))}
                    />
                  </label>
                  <label className="admin-modal-field">
                    <span>Units</span>
                    <input
                      type="text"
                      value={createValues.units ?? ""}
                      onChange={(event) => setCreateValues((cur) => ({ ...cur, units: event.target.value }))}
                    />
                  </label>
                </>
              )}
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="admin-modal-btn ghost" data-toast-ignore onClick={closeCreateModal}>
                Cancel
              </button>
              <button type="button" className="admin-modal-btn" data-toast-ignore onClick={saveCreateModal}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {editingNotification && (
        <div className="libraries-event-overlay" role="dialog" aria-modal="true">
          <div className="libraries-event-card">
            <div className="libraries-event-header">
              <div className="libraries-event-title">
                Notification library
              </div>
              <button
                type="button"
                className="libraries-event-close"
                onClick={() => setEditingNotification(null)}
              >
                Close
              </button>
            </div>
            <div className="libraries-event-body">
              <div className={`libraries-event-row ${fieldMissingClass("description") ?? ""}`.trim()}>
                <label className="libraries-event-label">
                  Notification description <span aria-hidden="true">*</span>
                </label>
                <input
                  className="libraries-event-input"
                  value={editingNotification.description}
                  disabled={lockDefaultNotificationIdentity}
                  onChange={(event) => {
                    if (lockDefaultNotificationIdentity) return;
                    setEditingNotification({
                      ...editingNotification,
                      description: event.target.value
                    });
                    setMissingRequiredKeys((current) => {
                      if (!current.has("description")) return current;
                      const next = new Set(current);
                      next.delete("description");
                      return next;
                    });
                  }}
                />
              </div>
              <div className="libraries-event-row">
                <label className="libraries-event-label">
                  Notification type
                </label>
                <input className="libraries-event-input" value={editingNotification.type} disabled />
              </div>
              <div className="libraries-event-row">
                <label className="libraries-event-label">
                  Notification ID
                </label>
                <input
                  className="libraries-event-input"
                  value={
                    editingNotification.type === "Custom"
                      ? editingNotification.eventId ?? ""
                      : editingNotification.eventId ?? ""
                  }
                  onChange={(event) =>
                    editingNotification.type === "Custom" && !lockDefaultNotificationIdentity
                      ? setEditingNotification({
                          ...editingNotification,
                          eventId: event.target.value
                        })
                      : undefined
                  }
                  disabled={editingNotification.type !== "Custom" || lockDefaultNotificationIdentity}
                />
              </div>
            </div>
            {editingNotification && (
              <>
                {lockEventParameters ? (
                  <div className="libraries-event-section">
                    <div className="libraries-event-section-title">
                      {lockDefaultNotificationIdentity ? "Default notification" : "Fuel notification"}
                    </div>
                    {!lockDefaultNotificationIdentity ? (
                      <div className="libraries-event-helper">
                        {activeOnlyFuelEventHelp(editingNotification.description)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {!lockEventParameters ? (
                <>
                <div className={`libraries-event-conditions ${fieldMissingClass("conditions") ?? ""}`.trim()}>
                  <div className="libraries-event-conditions-title">
                    Conditions <span aria-hidden="true">*</span>
                  </div>
                  <div className="libraries-event-conditions-subtitle">
                    Notification occurs when the following conditions are met
                  </div>
                  <div className="libraries-event-conditions-toolbar">
                    <button
                      type="button"
                      className="libraries-event-icon"
                      aria-label="Add condition"
                      title="Add condition"
                      onClick={addConditionRow}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="libraries-event-icon"
                      aria-label="Duplicate selected condition"
                      title="Duplicate selected condition"
                      onClick={duplicateSelectedCondition}
                    >
                      {"\u29C9"}
                    </button>
                    <button
                      type="button"
                      className="libraries-event-icon"
                      aria-label="Delete selected condition"
                      title="Delete selected condition"
                      onClick={deleteSelectedCondition}
                    >
                      {"\u00D7"}
                    </button>
                    <button
                      type="button"
                      className="libraries-event-icon"
                      aria-label="Move condition up"
                      title="Move condition up"
                      onClick={() => moveSelectedCondition("up")}
                    >
                      {"\u2191"}
                    </button>
                    <button
                      type="button"
                      className="libraries-event-icon"
                      aria-label="Move condition down"
                      title="Move condition down"
                      onClick={() => moveSelectedCondition("down")}
                    >
                      {"\u2193"}
                    </button>
                  </div>
                  {conditions.map((condition, conditionIndex) => (
                    <div
                      key={condition.id}
                      className={`libraries-event-conditions-row ${condition.id === selectedConditionId ? "selected" : ""}`}
                      onClick={() => setSelectedConditionId(condition.id)}
                    >
                      <span className="libraries-event-required">*</span>
                      <select
                        className="libraries-event-select"
                        value={condition.field}
                        onChange={(event) => {
                          const next = event.target.value;
                          updateCondition(condition.id, applyConditionFieldDefaults(next));
                          if (isFuelTankComputationParameter(next)) {
                            setFuelComputeEnabled(true);
                          }
                        }}
                      >
                        <option value="" disabled>
                          Select parameter
                        </option>
                        {conditionOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <select
                        className="libraries-event-select libraries-event-operator"
                        value={displayConditionOperator(condition.field, condition.operator)}
                        onChange={(event) => updateCondition(condition.id, { operator: event.target.value })}
                      >
                        <option value="" disabled>
                          Select
                        </option>
                        {operatorsForConditionField(condition.field).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {isBooleanConditionField(condition.field) ? (
                        <select
                          className="libraries-event-select libraries-event-value"
                          value={/^(true|false)$/i.test(String(condition.value ?? "").trim())
                            ? String(condition.value).trim().toLowerCase()
                            : ""}
                          onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
                        >
                          <option value="" disabled>
                            Select
                          </option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          className="libraries-event-input libraries-event-value"
                          value={condition.value}
                          onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
                        />
                      )}
                      <span className="libraries-event-unit">{getConditionUnit(condition.field)}</span>
                      {conditions.length > 1 && conditionIndex < conditions.length - 1 ? (
                        <select
                          className="libraries-event-select libraries-event-join"
                          value={condition.join === "or" ? "or" : condition.join === "and" ? "and" : ""}
                          onChange={(event) =>
                            updateCondition(condition.id, {
                              join: event.target.value === "or" ? "or" : "and"
                            })
                          }
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Join next condition with and or or"
                        >
                          <option value="" disabled>
                            Select
                          </option>
                          <option value="and">and</option>
                          <option value="or">or</option>
                        </select>
                      ) : null}
                      {isFuelTankComputationParameter(condition.field) ? (
                        <span className="libraries-event-helper" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
                          Configure tank capacity, input voltage, and scale in the Fuel tank computation section below.
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Return value</div>
                  <div className="libraries-event-section-subtitle">
                    If the event is to return a value please specify which parameter to return a value from
                  </div>
                  <label className="libraries-event-row">
                    <span className="libraries-event-label">Notification parameter</span>
                    <select
                      className="libraries-event-select libraries-event-input"
                      value={returnValueParam}
                      onChange={(event) => {
                        const next = event.target.value;
                        setReturnValueParam(next);
                        if (isFuelTankComputationParameter(next)) {
                          setFuelComputeEnabled(true);
                        } else if (next && next !== "No return value") {
                          const booleanField = isBooleanParameterField(next, parameterCatalog);
                          setConditions((prev) =>
                            prev.length
                              ? prev.map((row, index) =>
                                  index === 0
                                    ? {
                                        ...row,
                                        field: next,
                                        ...(booleanField
                                          ? {
                                              operator: row.operator === "is not" ? "is not" : "is",
                                              value: /^(true|false)$/i.test(String(row.value ?? "").trim())
                                                ? String(row.value).trim().toLowerCase()
                                                : "true"
                                            }
                                          : {})
                                      }
                                    : row
                                )
                              : [
                                  {
                                    id: 1,
                                    field: next,
                                    operator: booleanField ? "is" : ">=",
                                    value: booleanField ? "true" : "0"
                                  }
                                ]
                          );
                        }
                      }}
                    >
                      <option value="" disabled>
                        Select parameter
                      </option>
                      <option>No return value</option>
                      {conditionOptions.map((option) => (
                        <option key={`return-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="libraries-event-section-subtitle">
                    Please specify whether the minimum, maximum or average of the parameter should be returned when the event is recorded
                  </div>
                  {isFuelTankComputationParameter(returnValueParam) ? (
                    <div className="libraries-event-helper">
                      Return mode does not apply — fuel level is calculated from tank capacity and input voltage (see Fuel tank
                      computation below).
                    </div>
                  ) : null}
                  <label className="libraries-event-row">
                    <span className="libraries-event-label">Value</span>
                    <select
                      className="libraries-event-select libraries-event-input"
                      value={returnValueMode}
                      onChange={(event) => setReturnValueMode(event.target.value)}
                      disabled={
                        returnValueParam === "" ||
                        returnValueParam === "No return value" ||
                        isFuelTankComputationParameter(returnValueParam)
                      }
                    >
                      <option value="" disabled>
                        Select value
                      </option>
                      <option>Minimum</option>
                      <option>Maximum</option>
                      <option>Average</option>
                    </select>
                  </label>
                  <div className="libraries-event-helper">
                    Value calculation only applies to Detailed and Summary notifications. Alert notifications and Active messages will always return the current value of the parameter when the specified delay is reached.
                  </div>
                </div>
                </>
                ) : null}

                {showFuelTankComputationPanel ? (
                  <div className="libraries-event-section">
                    <div className="libraries-event-section-title">Fuel tank computation</div>
                    <div className="libraries-event-toggle-row">
                      <span>Enable fuel computation</span>
                      <button
                        type="button"
                        className={`libraries-event-toggle ${fuelComputeEnabled ? "active" : ""}`}
                        onClick={() => setFuelComputeEnabled((current) => !current)}
                        aria-pressed={fuelComputeEnabled}
                      >
                        {fuelComputeEnabled ? "On" : "Off"}
                      </button>
                    </div>
                    {fuelComputeEnabled && (
                      <>
                        <label className="libraries-event-row">
                          <span className="libraries-event-label">Tank capacity (L)</span>
                          <input
                            className="libraries-event-input"
                            value={fuelTankCapacity}
                            onChange={(event) => setFuelTankCapacity(event.target.value)}
                          />
                        </label>
                        <label className="libraries-event-row">
                          <span className="libraries-event-label">Scale (divider)</span>
                          <input
                            className="libraries-event-input"
                            value={fuelScale}
                            onChange={(event) => setFuelScale(event.target.value)}
                          />
                        </label>
                        <label className="libraries-event-row">
                          <span className="libraries-event-label">Output attribute key</span>
                          <input
                            className="libraries-event-input"
                            value={fuelOutputAttribute}
                            onChange={(event) => setFuelOutputAttribute(event.target.value)}
                          />
                        </label>
                      </>
                    )}
                  </div>
                ) : null}

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Notification video configuration</div>
                  <div className="libraries-event-toggle-row">
                    <span>Record video</span>
                    <button
                      type="button"
                      className={`libraries-event-toggle ${recordVideo ? "active" : ""}`}
                      onClick={() => setRecordVideo((current) => !current)}
                      aria-pressed={recordVideo}
                    >
                      {recordVideo ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="libraries-event-video-box">
                    {([
                      { key: "driver", label: "Driver" },
                      { key: "road", label: "Road" },
                      { key: "inCab", label: "In Cab" }
                    ] as const).map((item) => (
                      <label key={item.key} className="libraries-event-checkbox-row">
                        <input
                          type="checkbox"
                          checked={videoSelections[item.key]}
                          disabled={!recordVideo}
                          onChange={(event) =>
                            setVideoSelections({
                              ...videoSelections,
                              [item.key]: event.target.checked
                            })
                          }
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Record</div>
                  <label className="libraries-event-checkbox-row">
                    <input
                      type="checkbox"
                      checked={recordEvent}
                      onChange={(event) => setRecordEvent(event.target.checked)}
                    />
                    Record event
                  </label>
                  <div className="libraries-event-record-grid">
                    <div className="libraries-event-delay-group">
                      <div className="libraries-event-section-subtitle">Seconds after occurrence</div>
                      <div className="libraries-event-delay">
                        <select
                          className="libraries-event-select"
                          value={recordDelay.hours}
                          onChange={(event) => setRecordDelay({ ...recordDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={recordDelay.minutes}
                          onChange={(event) => setRecordDelay({ ...recordDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={recordDelay.seconds}
                          onChange={(event) => setRecordDelay({ ...recordDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="libraries-event-delay-label">
                        <span>Hours</span>
                        <span>Minutes</span>
                        <span>Seconds</span>
                      </div>
                    </div>
                    <div>
                      <div className="libraries-event-section-subtitle">Recording type</div>
                      <select
                        className="libraries-event-select libraries-event-input"
                        value={recordingType}
                        onChange={(event) => {
                          const next = event.target.value;
                          setRecordingType(next);
                          if (next === "Detailed") {
                            setRecordActions({ ...DEFAULT_DETAILED_RECORD_ACTIONS });
                          }
                          if (isAlertRecordingType(next)) {
                            setAlertRecordingUserAlerts({ ...DEFAULT_ALERT_RECORDING_DELIVERY });
                          }
                        }}
                      >
                        <option value="" disabled>
                          Select recording type
                        </option>
                        <option>Detailed</option>
                        <option>Summary</option>
                        <option value="Notification">Alert</option>
                      </select>
                      <div className="libraries-event-section-subtitle">
                        {recordingType ? recordingTypeHelp[recordingType] ?? recordingTypeHelp.Detailed : ""}
                      </div>
                      {isAlertRecordingType(recordingType) ? (
                        <div className="libraries-event-helper" style={{ marginTop: 8 }}>
                          <strong>User alert delivery</strong> (when this event fires):{" "}
                          {formatUserAlertDeliverySummary(alertRecordingUserAlerts)}
                          <div className="libraries-event-checkbox-row" style={{ marginTop: 6 }}>
                            <label className="libraries-event-checkbox-row">
                              <input
                                type="checkbox"
                                checked={alertRecordingUserAlerts.email}
                                onChange={(event) =>
                                  setAlertRecordingUserAlerts({
                                    ...alertRecordingUserAlerts,
                                    email: event.target.checked
                                  })
                                }
                              />
                              Email
                            </label>
                            <label className="libraries-event-checkbox-row">
                              <input
                                type="checkbox"
                                checked={alertRecordingUserAlerts.inApp}
                                onChange={(event) =>
                                  setAlertRecordingUserAlerts({
                                    ...alertRecordingUserAlerts,
                                    inApp: event.target.checked
                                  })
                                }
                              />
                              In-app
                            </label>
                            <label className="libraries-event-checkbox-row">
                              <input
                                type="checkbox"
                                checked={alertRecordingUserAlerts.sms}
                                onChange={(event) =>
                                  setAlertRecordingUserAlerts({
                                    ...alertRecordingUserAlerts,
                                    sms: event.target.checked
                                  })
                                }
                              />
                              Phone (SMS)
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {recordingType === "Detailed" ? (
                    <div className="libraries-event-video-box libraries-event-record-capture">
                      <div className="libraries-event-section-subtitle">Capture for each occurrence</div>
                      {([
                        { key: "startPosition", label: "Start location" },
                        { key: "endPosition", label: "End location" },
                        { key: "startOdometer", label: "Start odometer" },
                        { key: "endOdometer", label: "End odometer" }
                      ] as const).map((item) => (
                        <label key={item.key} className="libraries-event-checkbox-row">
                          <input
                            type="checkbox"
                            checked={recordActions[item.key]}
                            onChange={(event) =>
                              setRecordActions({
                                ...recordActions,
                                [item.key]: event.target.checked
                              })
                            }
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Actions</div>
                  <div className="libraries-event-action-box">
                    <div className="libraries-event-action-row">
                      <label className="libraries-event-inline">
                        <input
                          type="checkbox"
                          checked={actionBuzzerEnabled}
                          onChange={(event) => setActionBuzzerEnabled(event.target.checked)}
                        />
                        Sound buzzer when condition has been true for a delay of
                      </label>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={actionBuzzerDelay.hours}
                          onChange={(event) => setActionBuzzerDelay({ ...actionBuzzerDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`ab-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={actionBuzzerDelay.minutes}
                          onChange={(event) => setActionBuzzerDelay({ ...actionBuzzerDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`ab-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={actionBuzzerDelay.seconds}
                          onChange={(event) => setActionBuzzerDelay({ ...actionBuzzerDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`ab-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span>and</span>
                      <select
                        className="libraries-event-select libraries-event-inline-select"
                        value={actionBuzzerDuration}
                        onChange={(event) => setActionBuzzerDuration(event.target.value)}
                      >
                        <option value="" disabled>
                          Select buzzer action
                        </option>
                        <option>Sound the buzzer for 1 second</option>
                        <option>Sound the buzzer for 5 seconds</option>
                        <option>Sound buzzer continuously when the condition is true</option>
                      </select>
                    </div>
                    <label className="libraries-event-action-row">
                      <input
                        type="checkbox"
                        checked={allowBuzzerOverride}
                        onChange={(event) => setAllowBuzzerOverride(event.target.checked)}
                      />
                      Allow override plug to prevent buzzer from sounding
                    </label>
                    <div className="libraries-event-action-row">
                      <label className="libraries-event-inline">
                        <input
                          type="checkbox"
                          checked={relayDriveOneEnabled}
                          onChange={(event) => setRelayDriveOneEnabled(event.target.checked)}
                        />
                        Enable relay drive 1 when condition has been true for a delay of
                      </label>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={relayDriveOneDelay.hours}
                          onChange={(event) => setRelayDriveOneDelay({ ...relayDriveOneDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`r1-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={relayDriveOneDelay.minutes}
                          onChange={(event) => setRelayDriveOneDelay({ ...relayDriveOneDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`r1-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={relayDriveOneDelay.seconds}
                          onChange={(event) => setRelayDriveOneDelay({ ...relayDriveOneDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`r1-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span>and</span>
                      <select
                        className="libraries-event-select libraries-event-inline-select"
                        value={relayDriveOneDuration}
                        onChange={(event) => setRelayDriveOneDuration(event.target.value)}
                      >
                        <option value="" disabled>
                          Select relay drive action
                        </option>
                        <option>Turn the relay drive on for 1 second</option>
                        <option>Turn the relay drive on for 2 seconds</option>
                        <option>Turn the relay drive on for 5 seconds</option>
                      </select>
                    </div>
                    <label className="libraries-event-action-row">
                      <input
                        type="checkbox"
                        checked={relayDriveOneOverride}
                        onChange={(event) => setRelayDriveOneOverride(event.target.checked)}
                      />
                      Allow override plug to prevent relay drive 1 from being turned on
                    </label>
                    <div className="libraries-event-action-row">
                      <label className="libraries-event-inline">
                        <input
                          type="checkbox"
                          checked={relayDriveTwoEnabled}
                          onChange={(event) => setRelayDriveTwoEnabled(event.target.checked)}
                        />
                        Enable relay drive 2 when condition has been true for a delay of
                      </label>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={relayDriveTwoDelay.hours}
                          onChange={(event) => setRelayDriveTwoDelay({ ...relayDriveTwoDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`r2-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={relayDriveTwoDelay.minutes}
                          onChange={(event) => setRelayDriveTwoDelay({ ...relayDriveTwoDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`r2-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={relayDriveTwoDelay.seconds}
                          onChange={(event) => setRelayDriveTwoDelay({ ...relayDriveTwoDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`r2-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span>and</span>
                      <select
                        className="libraries-event-select libraries-event-inline-select"
                        value={relayDriveTwoDuration}
                        onChange={(event) => setRelayDriveTwoDuration(event.target.value)}
                      >
                        <option value="" disabled>
                          Select relay drive action
                        </option>
                        <option>Turn the relay drive on for 1 second</option>
                        <option>Turn the relay drive on for 2 seconds</option>
                        <option>Turn the relay drive on for 5 seconds</option>
                      </select>
                    </div>
                    <label className="libraries-event-action-row">
                      <input
                        type="checkbox"
                        checked={relayDriveTwoOverride}
                        onChange={(event) => setRelayDriveTwoOverride(event.target.checked)}
                      />
                      Allow override plug to prevent relay drive 2 from being turned on
                    </label>
                  </div>
                </div>

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Active</div>
                  <div className="libraries-event-action-box">
                    <label className="libraries-event-action-row">
                      <input
                        type="checkbox"
                        checked={activeMessageEnabled}
                        onChange={(event) => {
                          const enabled = event.target.checked;
                          setActiveMessageEnabled(enabled);
                          if (enabled) {
                            setActiveUserAlerts({ ...DEFAULT_ACTIVE_MESSAGE_ALERT_DELIVERY });
                          }
                        }}
                      />
                      Send active message
                    </label>
                    {activeMessageEnabled ? (
                      <div className="libraries-event-helper" style={{ marginTop: 6 }}>
                        <strong>User alert delivery</strong> (defaults when active message is on):{" "}
                        {formatUserAlertDeliverySummary(activeUserAlerts)}
                        <div className="libraries-event-checkbox-row" style={{ marginTop: 6 }}>
                          <label className="libraries-event-checkbox-row">
                            <input
                              type="checkbox"
                              checked={activeUserAlerts.email}
                              onChange={(event) =>
                                setActiveUserAlerts({ ...activeUserAlerts, email: event.target.checked })
                              }
                            />
                            Email
                          </label>
                          <label className="libraries-event-checkbox-row">
                            <input
                              type="checkbox"
                              checked={activeUserAlerts.inApp}
                              onChange={(event) =>
                                setActiveUserAlerts({ ...activeUserAlerts, inApp: event.target.checked })
                              }
                            />
                            In-app
                          </label>
                          <label className="libraries-event-checkbox-row">
                            <input
                              type="checkbox"
                              checked={activeUserAlerts.sms}
                              onChange={(event) =>
                                setActiveUserAlerts({ ...activeUserAlerts, sms: event.target.checked })
                              }
                            />
                            Phone (SMS, optional)
                          </label>
                        </div>
                      </div>
                    ) : null}
                    <div className="libraries-event-action-row">
                      <span>Queue after a delay of</span>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={activeQueueDelay.hours}
                          onChange={(event) => setActiveQueueDelay({ ...activeQueueDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`aq-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={activeQueueDelay.minutes}
                          onChange={(event) => setActiveQueueDelay({ ...activeQueueDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`aq-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={activeQueueDelay.seconds}
                          onChange={(event) => setActiveQueueDelay({ ...activeQueueDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`aq-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span>and</span>
                      <select
                        className="libraries-event-select libraries-event-inline-select"
                        value={activeQueueMode}
                        onChange={(event) => setActiveQueueMode(event.target.value)}
                      >
                        <option value="" disabled>
                          Select message timing
                        </option>
                        <option>Send when condition becomes true</option>
                        <option>Send when condition has been true for delay</option>
                      </select>
                    </div>
                    <div className="libraries-event-action-row libraries-event-action-column">
                      <label className="libraries-event-row">
                        <span className="libraries-event-label">Message priority</span>
                        <select
                          className="libraries-event-select libraries-event-input"
                          value={messagePriority}
                          onChange={(event) => setMessagePriority(event.target.value)}
                        >
                          <option value="" disabled>
                            Select priority
                          </option>
                          <option>Low</option>
                          <option>Normal</option>
                          <option>High</option>
                        </select>
                      </label>
                      <div className="libraries-event-helper">
                        The message will be sent when the message buffer is full
                      </div>
                      <label className="libraries-event-action-row">
                        <input
                          type="checkbox"
                          checked={sendCurrentPosition}
                          onChange={(event) => setSendCurrentPosition(event.target.checked)}
                        />
                        Send current position in message
                      </label>
                    </div>
                    <label className="libraries-event-action-row">
                      <input
                        type="checkbox"
                        checked={enableActiveTracking}
                        onChange={(event) => setEnableActiveTracking(event.target.checked)}
                      />
                      Enable active tracking while the condition is true
                    </label>
                    <div className="libraries-event-action-row">
                      <span>Tracking delay</span>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={trackingDelay.hours}
                          onChange={(event) => setTrackingDelay({ ...trackingDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`td-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={trackingDelay.minutes}
                          onChange={(event) => setTrackingDelay({ ...trackingDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`td-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={trackingDelay.seconds}
                          onChange={(event) => setTrackingDelay({ ...trackingDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`td-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="libraries-event-action-row">
                      <span>Tracking interval</span>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={trackingInterval.hours}
                          onChange={(event) => setTrackingInterval({ ...trackingInterval, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`ti-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={trackingInterval.minutes}
                          onChange={(event) => setTrackingInterval({ ...trackingInterval, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`ti-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={trackingInterval.seconds}
                          onChange={(event) => setTrackingInterval({ ...trackingInterval, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`ti-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            <div className="libraries-event-footer">
              <button
                type="button"
                className="libraries-event-action"
                onClick={() => setEditingNotification(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="libraries-event-action primary"
                onClick={handleNotificationSave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
