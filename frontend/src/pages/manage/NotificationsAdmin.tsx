import { useCallback, useEffect, useMemo, useState } from "react";
import VTLoader from "../../components/VTLoader";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
import {
  deleteAlertFromApi,
  getAssetsFromApi,
  getHierarchy,
  type HierarchyRoot,
  upsertAlertToApi
} from "../../utils/api";
import {
  isLocationAlertEventType,
  LOCATION_Alert_EVENT_TYPES,
  normalizeLocationAlertEventType
} from "../../utils/locationAlertEvents";
import { readActiveSiteName } from "../../utils/tenantContext";
import {
  formatUserAlertDeliverySummary,
  type UserAlertDelivery
} from "../../utils/notificationAlertDelivery";
import { loadLocationGeofences } from "../../utils/locationGeofences";
import {
  loadSiteLocationAlerts,
  persistSiteLocationAlert,
  registerLocationAlertAsNotification,
  removeSiteLocationAlert,
  unregisterLocationAlertNotification
} from "../../utils/locationAlertNotifications";
import {
  removeLocationAlertFromTraccar,
  syncLocationAlertToTraccar
} from "../../utils/locationAlertSync";
import { toBrandDisplay } from "../../utils/brandLabels";
import ScheduleDateTimePicker from "../../components/ScheduleDateTimePicker";
import "../../index.css";

type StoredAlertRule = {
  id: string;
  eventName: string;
  eventType: string;
  delivery: UserAlertDelivery;
  recordFor?: string;
  frequency?: string;
  expiryDate?: string;
  expiryTime?: string;
  assetMode?: string;
  selectedAssets?: string[];
  selectedLocations?: string[];
  site?: string;
  speedKph?: number;
  durationSeconds?: number;
  status?: string;
  updatedAt?: string;
};

type EventRow = {
  id: string;
  eventName: string;
  eventType: string;
  deliveryLabel: string;
  record: string;
  assets: number;
  drivers: number;
  frequency: string;
  lastEditTime: string;
  raw: StoredAlertRule;
};

const EMPTY_DELIVERY: UserAlertDelivery = { email: false, inApp: false, sms: false };

const toLocalTime = (value: string) => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleString("en-GB", { hour12: false });
};

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const mapStoredAlert = (raw: Record<string, unknown>): EventRow | null => {
  const id = String(raw.id ?? "").trim();
  const eventName = String(raw.eventName ?? raw.name ?? "").trim();
  const eventType = String(raw.eventType ?? "").trim();
  if (!id || !eventName) return null;

  const delivery = {
    email: Boolean((raw.delivery as UserAlertDelivery | undefined)?.email),
    inApp: Boolean((raw.delivery as UserAlertDelivery | undefined)?.inApp),
    sms: Boolean((raw.delivery as UserAlertDelivery | undefined)?.sms)
  };

  const selectedAssets = Array.isArray(raw.selectedAssets)
    ? raw.selectedAssets.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const recordFor = String(raw.recordFor ?? "Assets");

  return {
    id,
    eventName,
    eventType: eventType || "—",
    deliveryLabel: formatUserAlertDeliverySummary(delivery),
    record: recordFor,
    assets: recordFor === "Assets" ? selectedAssets.length : 0,
    drivers: recordFor === "Drivers" ? selectedAssets.length : 0,
    frequency: String(raw.frequency ?? "Once off"),
    lastEditTime: toLocalTime(String(raw.updatedAt ?? "")),
    raw: {
      id,
      eventName,
      eventType,
      delivery,
      recordFor,
      frequency: String(raw.frequency ?? "Once off"),
      expiryDate: String(raw.expiryDate ?? ""),
      expiryTime: String(raw.expiryTime ?? ""),
      assetMode: normalizeAssetMode(raw.assetMode),
      selectedAssets,
      selectedLocations: Array.isArray(raw.selectedLocations)
        ? raw.selectedLocations.map((item) => String(item ?? "").trim()).filter(Boolean)
        : [],
      site: String(raw.site ?? ""),
      speedKph: Number(raw.speedKph ?? 0) || undefined,
      durationSeconds: Number(raw.durationSeconds ?? 0) || undefined,
      status: String(raw.status ?? "active"),
      updatedAt: String(raw.updatedAt ?? "")
    }
  };
};

const hasDeliveryChannel = (delivery: UserAlertDelivery) =>
  delivery.email || delivery.inApp || delivery.sms;

type AlertStatusFilter = "all" | "active" | "inactive";

const isLocationAlertInactive = (row: EventRow) => {
  const status = String(row.raw.status ?? "active").trim().toLowerCase();
  if (status === "inactive" || status === "disabled") return true;
  if (String(row.raw.frequency ?? "").trim().toLowerCase() !== "recurring") return false;
  const expiryDate = String(row.raw.expiryDate ?? "").trim();
  if (!expiryDate) return false;
  const expiryTime = String(row.raw.expiryTime ?? "23:59").trim() || "23:59";
  const expiryAt = Date.parse(`${expiryDate}T${expiryTime.length === 5 ? `${expiryTime}:00` : expiryTime}`);
  return !Number.isNaN(expiryAt) && expiryAt < Date.now();
};

const normalizeAssetMode = (value: unknown) => {
  const mode = String(value ?? "").trim();
  if (mode === "Groups" || mode === "Site") return "Site";
  if (mode === "Individual") return "Individual";
  return "Site";
};

const collectSitesFromHierarchy = (_hierarchy: HierarchyRoot | null) => {
  const activeSite = readActiveSiteName();
  return activeSite ? [activeSite] : [];
};

export default function NotificationsAdmin() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>("all");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [pendingRowAction, setPendingRowAction] = useState<"status" | "remove" | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createStep, setCreateStep] = useState(0);
  const [eventName, setEventName] = useState("");
  const [recordFor, setRecordFor] = useState("Assets");
  const [frequency, setFrequency] = useState("Once off");
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTime, setExpiryTime] = useState("");
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [expiryPickerDate, setExpiryPickerDate] = useState(() => new Date());
  const [expiryPickerTime, setExpiryPickerTime] = useState("00:00");
  const [expiryPickerMode, setExpiryPickerMode] = useState<"date" | "time">("date");
  const [assetMode, setAssetMode] = useState("Site");
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [eventType, setEventType] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [speedKph, setSpeedKph] = useState(80);
  const [durationSeconds, setDurationSeconds] = useState(300);
  const [delivery, setDelivery] = useState<UserAlertDelivery>({ ...EMPTY_DELIVERY });
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const [siteOptions, setSiteOptions] = useState<string[]>([]);
  const [individualOptions, setIndividualOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [scopeOptionsLoading, setScopeOptionsLoading] = useState(false);

  const loadAlerts = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await loadSiteLocationAlerts(readActiveSiteName());
      const mapped = rows
        .map((row) => mapStoredAlert(row as unknown as Record<string, unknown>))
        .filter(Boolean) as EventRow[];
      setEvents(mapped);
      setLastRefreshAt(new Date());
    } catch (loadError: unknown) {
      setError(String((loadError as Error)?.message ?? loadError ?? "Unable to load alerts."));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
    const handleOrganisationChange = () => {
      setShowCreate(false);
      setSelectedAssets([]);
      setSelectedLocations([]);
      setSiteOptions([]);
      setIndividualOptions([]);
      setLocationOptions([]);
      void loadAlerts();
    };
    window.addEventListener("vivi:orgchange", handleOrganisationChange);
    return () => window.removeEventListener("vivi:orgchange", handleOrganisationChange);
  }, []);

  useEffect(() => {
    if (!showCreate || createStep < 1) return;
    let cancelled = false;
    const loadScopeOptions = async () => {
      setScopeOptionsLoading(true);
      try {
        const [hierarchy, assets, locations] = await Promise.all([
          getHierarchy().catch(() => null),
          getAssetsFromApi<any>().catch(() => []),
          loadLocationGeofences().catch(() => [])
        ]);
        if (cancelled) return;

        setSiteOptions(collectSitesFromHierarchy(hierarchy));

        const activeSite = readActiveSiteName();
        const assetLabels = (Array.isArray(assets) ? assets : [])
          .filter((asset) =>
            String(asset?.site ?? asset?.organisation ?? "").trim().toLowerCase()
              === activeSite.trim().toLowerCase()
          )
          .map((asset) => {
            const description = String(asset?.assetDescription ?? asset?.description ?? asset?.name ?? "").trim();
            const registration = String(asset?.registration ?? asset?.plate ?? "").trim();
            return [description, registration].filter(Boolean).join(" - ");
          })
          .filter(Boolean);
        const nextIndividualOptions = Array.from(new Set(assetLabels)).sort((a, b) => a.localeCompare(b));
        setIndividualOptions(nextIndividualOptions);
        setSelectedAssets((current) =>
          assetMode === "Site"
            ? (activeSite ? [activeSite] : [])
            : current.filter((name) => nextIndividualOptions.includes(name))
        );

        const locationNames = (Array.isArray(locations) ? locations : [])
          .map((location) => String(location?.name ?? location?.id ?? "").trim())
          .filter(Boolean);
        setLocationOptions(Array.from(new Set(locationNames)).sort((a, b) => a.localeCompare(b)));
        setSelectedLocations((current) => current.filter((name) => locationNames.includes(name)));
      } finally {
        if (!cancelled) setScopeOptionsLoading(false);
      }
    };
    void loadScopeOptions();
    return () => {
      cancelled = true;
    };
  }, [showCreate, createStep]);

  const siteEvents = useMemo(() => {
    const activeSite = readActiveSiteName().trim().toLowerCase();
    return events.filter((row) => {
      if (!(row.eventType === "—" || isLocationAlertEventType(row.eventType))) return false;
      if (!activeSite) return false;
      const storedSite = String(row.raw.site ?? "").trim().toLowerCase();
      if (storedSite) return storedSite === activeSite;
      return (row.raw.selectedAssets ?? []).some((site) => site.trim().toLowerCase() === activeSite);
    });
  }, [events]);

  const activeAlertCount = useMemo(
    () => siteEvents.filter((row) => !isLocationAlertInactive(row)).length,
    [siteEvents]
  );
  const inactiveAlertCount = siteEvents.length - activeAlertCount;

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const statusScoped = siteEvents.filter((row) => {
      const inactive = isLocationAlertInactive(row);
      if (statusFilter === "active") return !inactive;
      if (statusFilter === "inactive") return inactive;
      return true;
    });
    if (!query) return statusScoped;
    return statusScoped.filter(
      (row) =>
        row.eventName.toLowerCase().includes(query)
        || row.eventType.toLowerCase().includes(query)
        || row.deliveryLabel.toLowerCase().includes(query)
    );
  }, [search, siteEvents, statusFilter]);

  const getLocationAlertSortValue = useCallback((row: EventRow, key: string) => {
    if (key === "eventName") return row.eventName;
    if (key === "eventType") return row.eventType;
    if (key === "delivery") return row.deliveryLabel;
    if (key === "record") return row.record;
    if (key === "assets") return row.assets;
    if (key === "drivers") return row.drivers;
    if (key === "frequency") return row.frequency;
    if (key === "updated") return row.lastEditTime;
    return "";
  }, []);
  const locationAlertSort = useColumnSort({ rows: filteredEvents, getValue: getLocationAlertSortValue });

  const steps = ["Name", "Assets & Drivers", "Events"];

  const eventTypeSelectOptions = useMemo(() => {
    const options: string[] = [...LOCATION_Alert_EVENT_TYPES];
    const current = eventType.trim();
    if (current && !isLocationAlertEventType(current) && !options.includes(current)) {
      options.unshift(current);
    }
    return options;
  }, [eventType]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setError("");
    setCreateStep(0);
    setEventName("");
    setRecordFor("Assets");
    setFrequency("Once off");
    setExpiryDate("");
    setExpiryTime("");
    setAssetMode("Site");
    const activeSite = readActiveSiteName();
    setSelectedAssets(activeSite ? [activeSite] : []);
    setEventType("");
    setSelectedLocations([]);
    setSpeedKph(80);
    setDurationSeconds(300);
    setDelivery({ ...EMPTY_DELIVERY });
    setShowLocationPicker(true);
    setShowCreate(true);
  };

  const handleEditEvent = (row: EventRow) => {
    const raw = row.raw;
    setEditingId(row.id);
    setError("");
    setCreateStep(0);
    setEventName(raw.eventName);
    setRecordFor(raw.recordFor ?? "Assets");
    setFrequency(raw.frequency ?? "Once off");
    setExpiryDate(raw.expiryDate ?? "");
    setExpiryTime(raw.expiryTime ?? "");
    setAssetMode(normalizeAssetMode(raw.assetMode));
    const activeSite = readActiveSiteName();
    setSelectedAssets(
      normalizeAssetMode(raw.assetMode) === "Site"
        ? (activeSite ? [activeSite] : [])
        : (raw.selectedAssets ?? [])
    );
    setEventType(raw.eventType ?? "");
    setSelectedLocations(raw.selectedLocations ?? []);
    setSpeedKph(Number(raw.speedKph ?? 80) || 80);
    setDurationSeconds(Number(raw.durationSeconds ?? 300) || 300);
    setDelivery({ ...raw.delivery });
    setShowLocationPicker(true);
    setShowCreate(true);
  };

  const handleCloseCreate = () => {
    setShowCreate(false);
  };

  const openExpiryPicker = () => {
    const parsed = new Date(`${expiryDate || toIsoDate(new Date())}T${expiryTime || "00:00"}:00`);
    setExpiryPickerDate(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
    setExpiryPickerTime(expiryTime || "00:00");
    setExpiryPickerMode("date");
    setShowExpiryPicker(true);
  };

  const applyExpiryPicker = () => {
    setExpiryDate(toIsoDate(expiryPickerDate));
    setExpiryTime(expiryPickerTime || "23:59");
    setShowExpiryPicker(false);
  };

  const handleNext = () => {
    setCreateStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setCreateStep((prev) => Math.max(prev - 1, 0));
  };

  const isCreatePrimaryDisabled =
    saving
    || (createStep === 0
      && (!eventName.trim()
        || (frequency === "Recurring" && !expiryDate.trim())))
    || (createStep === 2
      && (!eventType.trim() || !hasDeliveryChannel(delivery) || selectedLocations.length === 0));

  const createPrimaryLabel =
    createStep === steps.length - 1 ? (saving ? "Saving..." : "Save") : "Next";

  const handleCreatePrimary = () => {
    if (createStep === steps.length - 1) void handleSave();
    else handleNext();
  };

  const handleSave = async () => {
    if (!eventName.trim()) {
      setError("Notification description is required.");
      return;
    }
    if (!eventType.trim()) {
      setError("Select an event type.");
      return;
    }
    const normalizedEventType = normalizeLocationAlertEventType(eventType);
    if (!normalizedEventType) {
      setError("Select a location Alert event type.");
      return;
    }
    if (!hasDeliveryChannel(delivery)) {
      setError("Select at least one delivery channel.");
      return;
    }
    if (selectedLocations.length === 0) {
      setError("Select at least one location from the active site.");
      return;
    }

    setSaving(true);
    setError("");
    const now = new Date().toISOString();
    const payload: StoredAlertRule = {
      id: editingId ?? `alert-${Date.now()}`,
      eventName: eventName.trim(),
      eventType: normalizedEventType,
      delivery: { ...delivery },
      recordFor,
      frequency,
      expiryDate: frequency === "Recurring" ? expiryDate : "",
      expiryTime: frequency === "Recurring" ? expiryTime : "",
      assetMode: normalizeAssetMode(assetMode),
      selectedAssets,
      selectedLocations,
      site: readActiveSiteName(),
      speedKph: normalizedEventType === "Over-speeding in location" ? Math.max(1, speedKph) : undefined,
      durationSeconds: normalizedEventType === "Duration at location" ? Math.max(1, durationSeconds) : undefined,
      status: "active",
      updatedAt: now
    };

    try {
      const withTimeout = <T,>(work: Promise<T>, ms: number, fallback: T): Promise<T> =>
        Promise.race([
          work,
          new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms))
        ]);

      const scopedStored = await withTimeout(persistSiteLocationAlert(payload), 30000, {
        stored: false,
        error: "Saving timed out. Please check your connection and try again."
      });
      if (!scopedStored.stored) {
        setError(scopedStored.error || "Failed to save alert.");
        return;
      }

      let traccarWarning = "";
      try {
        const syncResult = await withTimeout(syncLocationAlertToTraccar(payload), 20000, {
          notifications: 0,
          devices: 0,
          geofences: 0,
          warning: "Alert saved. Tracking sync is taking longer than expected and was skipped."
        });
        traccarWarning = String(syncResult.warning ?? "").trim();
      } catch (syncError: any) {
        traccarWarning = toBrandDisplay(
          String(syncError?.message ?? syncError ?? "Traccar sync skipped.")
        );
      }

      await withTimeout(upsertAlertToApi(payload).catch(() => false), 10000, false);
      await withTimeout(registerLocationAlertAsNotification(payload).catch(() => undefined), 15000, undefined);
      const mapped = mapStoredAlert(payload as unknown as Record<string, unknown>);
      if (!mapped) {
        setError("Alert saved but could not be displayed.");
        return;
      }
      setEvents((current) => {
        if (editingId) {
          return current.map((row) => (row.id === editingId ? mapped : row));
        }
        return [mapped, ...current];
      });
      setShowCreate(false);
      setEditingId(null);
      setLastRefreshAt(new Date());
    } catch (saveError: any) {
      setError(toBrandDisplay(String(saveError?.message ?? saveError ?? "Unable to apply the location alert in VIVI.")));
    } finally {
      setSaving(false);
    }
  };

  const handleSetAlertStatus = async (row: EventRow, status: "active" | "inactive") => {
    setOpenMenuId(null);
    setError("");
    setDeactivatingId(row.id);
    setPendingRowAction("status");
    const payload: StoredAlertRule = {
      ...row.raw,
      status,
      updatedAt: new Date().toISOString()
    };
    try {
      const scopedStored = await persistSiteLocationAlert(payload);
      if (!scopedStored.stored) {
        setError(scopedStored.error || "Unable to update the alert.");
        return;
      }
      if (status === "inactive") {
        await removeLocationAlertFromTraccar(row.id).catch(() => undefined);
      } else {
        const syncResult = await syncLocationAlertToTraccar(payload).catch((syncError: unknown) => ({
          warning: toBrandDisplay(String((syncError as Error)?.message ?? syncError ?? ""))
        }));
        const warning = String(syncResult.warning ?? "").trim();
      }
      await upsertAlertToApi(payload).catch(() => undefined);
      const mapped = mapStoredAlert(payload as unknown as Record<string, unknown>);
      if (mapped) {
        setEvents((current) => current.map((item) => (item.id === row.id ? mapped : item)));
      }
      setLastRefreshAt(new Date());
    } catch (statusError: any) {
      setError(toBrandDisplay(String(statusError?.message ?? statusError ?? "Unable to update the alert.")));
    } finally {
      setDeactivatingId(null);
      setPendingRowAction(null);
    }
  };

  const handleDeactivateEvent = async (row: EventRow) => {
    setOpenMenuId(null);
    setError("");

    if (typeof window !== "undefined") {
      const proceed = window.confirm(`Remove alert "${row.eventName}"?`);
      if (!proceed) return;
    }

    setPendingRowAction("remove");
    setDeactivatingId(row.id);
    try {
      await removeSiteLocationAlert(row.id).catch(() => false);
      await deleteAlertFromApi(row.id).catch(() => false);
      await unregisterLocationAlertNotification(row.eventName).catch(() => undefined);
      await removeLocationAlertFromTraccar(row.id).catch(() => undefined);
      setEvents((current) => current.filter((item) => item.id !== row.id));
      setLastRefreshAt(new Date());
    } catch (removeError: any) {
      setError(toBrandDisplay(String(removeError?.message ?? removeError ?? "Unable to remove the VIVI location alert.")));
    } finally {
      setDeactivatingId(null);
      setPendingRowAction(null);
    }
  };

  const refreshLabel = lastRefreshAt
    ? `Last refresh: ${lastRefreshAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}`
    : "Not refreshed yet";

  return (
    <div className="page sat-notifications-page location-alerts-page">
      <div className="sat-layout">
        <aside className="sat-sidebar">
          <div className="sat-sidebar-title">Location Alerts</div>
          <div className="sat-categories">
            <button
              type="button"
              className={`sat-category${statusFilter === "all" ? " active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              <span>All location Alerts</span>
              <span className="sat-badge">{siteEvents.length}</span>
            </button>
            <button
              type="button"
              className={`sat-category${statusFilter === "active" ? " active" : ""}`}
              onClick={() => setStatusFilter("active")}
            >
              <span>Active Alerts</span>
              <span className="sat-badge">{activeAlertCount}</span>
            </button>
            <button
              type="button"
              className={`sat-category${statusFilter === "inactive" ? " active" : ""}`}
              onClick={() => setStatusFilter("inactive")}
            >
              <span>Inactive Alerts</span>
              <span className="sat-badge">{inactiveAlertCount}</span>
            </button>
          </div>
        </aside>

        <section className="sat-panel">
          {error && !showCreate && <div className="sat-error">{error}</div>}
          <div className="sat-panel-header">
            <div className="sat-panel-title">
              Location Alerts
              <span className="sat-panel-badge">{filteredEvents.length}</span>
            </div>
            <div className="sat-panel-actions">
              <div className="sat-search">
                <input
                  placeholder="Search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <span className="sat-search-icon">🔍</span>
              </div>
              <button type="button" className="sat-icon-btn" aria-label="Refresh" onClick={() => void loadAlerts()}>
                ⟳
              </button>
              <button
                type="button"
                className="sat-icon-btn"
                aria-label="Create alert"
                onClick={handleOpenCreate}
              >
                +
              </button>
            </div>
          </div>

          <div className="sat-table">
            <div className="sat-row sat-row-head">
              <SortableColumnHeader as="span" label="Notification description" {...locationAlertSort.getHeaderProps("eventName")} />
              <SortableColumnHeader as="span" label="Notification type" {...locationAlertSort.getHeaderProps("eventType")} />
              <SortableColumnHeader as="span" label="Delivery" {...locationAlertSort.getHeaderProps("delivery")} />
              <SortableColumnHeader as="span" label="Record" {...locationAlertSort.getHeaderProps("record")} />
              <SortableColumnHeader as="span" label="Assets" {...locationAlertSort.getHeaderProps("assets")} />
              <SortableColumnHeader as="span" label="Drivers" {...locationAlertSort.getHeaderProps("drivers")} />
              <SortableColumnHeader as="span" label="Frequency" {...locationAlertSort.getHeaderProps("frequency")} />
              <SortableColumnHeader as="span" label="Updated" {...locationAlertSort.getHeaderProps("updated")} />
              <span />
            </div>
            {loading && <VTLoader compact label="Loading alerts" />}
            {!loading && locationAlertSort.sortedRows.length === 0 && (
              <div className="sat-empty">
                {statusFilter === "active"
                  ? "No active location alerts."
                  : statusFilter === "inactive"
                    ? "No inactive location alerts. Deactivate an alert from its menu to move it here."
                    : "No location Alerts yet. Use + to create an Alert for distance, duration, entry, exit, movement, or over-speeding at a location."}
              </div>
            )}
            {!loading && locationAlertSort.sortedRows.map((row) => (
              <div key={row.id} className="sat-row">
                <button
                  type="button"
                  className="sat-link sat-link-btn"
                  onClick={() => handleEditEvent(row)}
                >
                  {row.eventName}
                </button>
                <span>{row.eventType}</span>
                <span>{row.deliveryLabel}</span>
                <span>{row.record}</span>
                <span>{row.assets}</span>
                <span>{row.drivers}</span>
                <span>{row.frequency}</span>
                <span>{row.lastEditTime || "—"}</span>
                <span className="sat-actions">
                  <button
                    type="button"
                    className="sat-actions-btn"
                    aria-label="More options"
                    onClick={() => setOpenMenuId((prev) => (prev === row.id ? null : row.id))}
                  >
                    ⋯
                  </button>
                  {openMenuId === row.id && (
                    <div className="sat-actions-menu">
                      <button
                        type="button"
                        className="sat-actions-item"
                        onClick={() => {
                          setOpenMenuId(null);
                          handleEditEvent(row);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="sat-actions-item"
                        disabled={deactivatingId === row.id}
                        onClick={() => void handleSetAlertStatus(row, isLocationAlertInactive(row) ? "active" : "inactive")}
                      >
                        {deactivatingId === row.id && pendingRowAction === "status"
                          ? "Saving..."
                          : isLocationAlertInactive(row)
                            ? "Activate"
                            : "Deactivate"}
                      </button>
                      <button
                        type="button"
                        className="sat-actions-item sat-actions-danger"
                        disabled={deactivatingId === row.id}
                        onClick={() => void handleDeactivateEvent(row)}
                      >
                        {deactivatingId === row.id && pendingRowAction === "remove" ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="sat-footer">
            <span>{refreshLabel}</span>
            <button type="button" className="sat-link-btn" onClick={() => void loadAlerts()}>
              Refresh
            </button>
          </div>
        </section>
      </div>

      {showCreate && (
        <div className="sat-modal-overlay" role="dialog" aria-modal="true">
          <div className="sat-modal-card">
            <ScheduleDateTimePicker
              open={showExpiryPicker}
              nested
              closeOnBackdropClick={false}
              title="Select expiry"
              date={expiryPickerDate}
              time={expiryPickerTime}
              mode={expiryPickerMode}
              allowPastDates={false}
              onClose={() => setShowExpiryPicker(false)}
              onConfirm={applyExpiryPicker}
              onDateChange={setExpiryPickerDate}
              onTimeChange={setExpiryPickerTime}
              onModeChange={setExpiryPickerMode}
            />
            <div className="sat-modal-header">
              <div className="sat-modal-title">
                {editingId ? "Edit event" : "Create new event"}
                {eventName ? `: ${eventName}` : ""}
              </div>
              <div className="sat-modal-actions">
                <button type="button" className="sat-pill" onClick={handleCloseCreate}>
                  Close
                </button>
                <button type="button" className="sat-pill" onClick={handleBack} disabled={createStep === 0}>
                  Back
                </button>
                <button
                  type="button"
                  className="sat-pill sat-pill-primary"
                  disabled={isCreatePrimaryDisabled}
                  onClick={handleCreatePrimary}
                >
                  {createPrimaryLabel}
                </button>
              </div>
            </div>

            <div className="sat-stepper">
              {steps.map((step, index) => (
                <div
                  key={step}
                  className={`sat-step${index === createStep ? " active" : ""}${index < createStep ? " completed" : ""}`}
                >
                  {step}
                </div>
              ))}
            </div>

            <div className="sat-modal-body">
              {error && <div className="sat-error">{error}</div>}

              {createStep === 0 && (
                <div className="sat-form">
                  <label className="sat-label">
                    Notification description
                    <input
                      className="sat-input"
                      placeholder="e.g. Depot exit overspeed trial"
                      value={eventName}
                      onChange={(event) => setEventName(event.target.value)}
                    />
                  </label>
                  <div className="sat-label">Record event for</div>
                  <select
                    className="sat-input"
                    value={recordFor}
                    onChange={(event) => setRecordFor(event.target.value)}
                  >
                    <option>Assets</option>
                    <option>Drivers</option>
                  </select>
                  <div className="sat-radio-row">
                    <label className="sat-radio">
                      <input
                        type="radio"
                        checked={frequency === "Once off"}
                        onChange={() => setFrequency("Once off")}
                      />
                      Once off
                    </label>
                    <label className="sat-radio">
                      <input
                        type="radio"
                        checked={frequency === "Recurring"}
                        onChange={() => setFrequency("Recurring")}
                      />
                      Recurring
                    </label>
                  </div>
                  {frequency === "Recurring" && (
                    <div className="sat-card">
                      <div className="sat-label">Expiry date</div>
                      <div className="sat-date-row">
                        <button type="button" className="sat-input sat-date-input sat-date-button" onClick={openExpiryPicker}>
                          {expiryDate
                            ? new Date(`${expiryDate}T00:00:00`).toLocaleDateString("en-GB")
                            : "Select date"}
                        </button>
                        <span className="sat-date-icon">📅</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {createStep === 1 && (
                <div className="sat-form">
                  <div className="sat-section-title">Assets & Drivers</div>
                  <div className="sat-hint">
                    This location Alert is restricted to the active site and its {recordFor === "Drivers" ? "drivers" : "assets"}.
                  </div>
                  {scopeOptionsLoading && <div className="sat-hint">Loading site and {recordFor.toLowerCase()} options...</div>}
                  <div className="sat-radio-row">
                    <label className="sat-radio">
                      <input
                        type="radio"
                        checked={assetMode === "Site"}
                        onChange={() => {
                          setAssetMode("Site");
                          const activeSite = readActiveSiteName();
                          setSelectedAssets(activeSite ? [activeSite] : []);
                        }}
                      />
                      Site
                    </label>
                    <label className="sat-radio">
                      <input
                        type="radio"
                        checked={assetMode === "Individual"}
                        onChange={() => {
                          setAssetMode("Individual");
                          setSelectedAssets([]);
                        }}
                      />
                      Individual {recordFor === "Drivers" ? "drivers" : "assets"}
                    </label>
                  </div>
                  <div className="sat-card">
                    {(assetMode === "Site" ? siteOptions : individualOptions).length === 0 && !scopeOptionsLoading && (
                      <div className="sat-hint">
                        No {assetMode === "Site" ? "active site" : recordFor === "Drivers" ? "drivers" : "assets"} found. Select a site in the organisation ribbon.
                      </div>
                    )}
                    {(assetMode === "Site" ? siteOptions : individualOptions).map((item) => {
                      const isSelected = selectedAssets.includes(item);
                      return (
                        <div key={item} className="sat-group-row">
                          <button
                            type="button"
                            className="sat-add-icon"
                            disabled={isSelected}
                            onClick={() => setSelectedAssets((prev) => (isSelected ? prev : [...prev, item]))}
                          >
                            +
                          </button>
                          <div className="sat-group-pill">{item}</div>
                        </div>
                      );
                    })}
                    {selectedAssets.length > 0 && (
                      <div className="sat-chips">
                        {selectedAssets.map((item) => (
                          <span key={item} className="sat-chip">
                            {item}
                            {assetMode !== "Site" && (
                              <button
                                type="button"
                                className="sat-chip-remove"
                                onClick={() => setSelectedAssets((prev) => prev.filter((value) => value !== item))}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {createStep === 2 && (
                <div className="sat-form">
                  <div className="sat-section-title">Events</div>
                  <div className="sat-label">Notification type</div>
                  <select
                    className="sat-input"
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value)}
                  >
                    <option value="">Select event type</option>
                    {eventTypeSelectOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {eventType === "Over-speeding in location" && (
                    <label className="sat-label">
                      Speed limit (km/h)
                      <input
                        className="sat-input"
                        type="number"
                        min={1}
                        value={speedKph}
                        onChange={(event) => setSpeedKph(Math.max(1, Number(event.target.value) || 1))}
                      />
                    </label>
                  )}
                  {eventType === "Duration at location" && (
                    <label className="sat-label">
                      Duration threshold (seconds)
                      <input
                        className="sat-input"
                        type="number"
                        min={1}
                        value={durationSeconds}
                        onChange={(event) => setDurationSeconds(Math.max(1, Number(event.target.value) || 1))}
                      />
                    </label>
                  )}

                  <div className="sat-section-title">Delivery</div>
                  <div className="sat-hint">
                    Select one or more channels. Alerts are sent from the Vivitel server (email, in-app, and SMS when configured).
                  </div>
                  <div className="sat-card">
                    <label className="sat-radio">
                      <input
                        type="checkbox"
                        checked={delivery.email}
                        onChange={(event) => setDelivery({ ...delivery, email: event.target.checked })}
                      />
                      Email
                    </label>
                    <label className="sat-radio">
                      <input
                        type="checkbox"
                        checked={delivery.inApp}
                        onChange={(event) => setDelivery({ ...delivery, inApp: event.target.checked })}
                      />
                      In-app
                    </label>
                    <label className="sat-radio">
                      <input
                        type="checkbox"
                        checked={delivery.sms}
                        onChange={(event) => setDelivery({ ...delivery, sms: event.target.checked })}
                      />
                      Phone (SMS when configured)
                    </label>
                  </div>
                  {!hasDeliveryChannel(delivery) && (
                    <div className="sat-error">Select at least one delivery channel to save.</div>
                  )}
                  {hasDeliveryChannel(delivery) && (
                    <div className="sat-hint">
                      Selected: {formatUserAlertDeliverySummary(delivery)}
                    </div>
                  )}

                  <div className="sat-card">
                    <button
                      type="button"
                      className="sat-pill sat-pill-primary"
                      onClick={() => setShowLocationPicker((prev) => !prev)}
                    >
                      {showLocationPicker ? "Hide locations" : "Select locations (required)"}
                    </button>
                    {showLocationPicker && locationOptions.length === 0 && !scopeOptionsLoading && (
                      <div className="sat-error">No locations exist under the active site. Create a location before saving this Alert.</div>
                    )}
                    {showLocationPicker && (
                      <div className="sat-location-list">
                        {locationOptions.map((item) => {
                          const isSelected = selectedLocations.includes(item);
                          return (
                            <div key={item} className="sat-group-row">
                              <button
                                type="button"
                                className="sat-add-icon"
                                disabled={isSelected}
                                onClick={() => setSelectedLocations((prev) => (isSelected ? prev : [...prev, item]))}
                              >
                                +
                              </button>
                              <div className="sat-group-pill">{item}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {selectedLocations.length > 0 && (
                      <div className="sat-chips">
                        {selectedLocations.map((item) => (
                          <span key={item} className="sat-chip">
                            {item}
                            <button
                              type="button"
                              className="sat-chip-remove"
                              onClick={() => setSelectedLocations((prev) => prev.filter((value) => value !== item))}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {selectedLocations.length === 0 && (
                      <div className="sat-error">Select at least one location from the active site to save.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="sat-modal-footer">
              <button type="button" className="sat-pill" onClick={handleBack} disabled={createStep === 0}>
                Back
              </button>
              <button
                type="button"
                className="sat-pill sat-pill-primary"
                disabled={isCreatePrimaryDisabled}
                onClick={handleCreatePrimary}
              >
                {createPrimaryLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
