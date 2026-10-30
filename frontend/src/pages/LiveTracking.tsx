import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "../mapStyles";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Circle, Polyline, Polygon, Rectangle, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import { useLocation, useNavigate } from "react-router-dom";
import StreetViewMini from "../components/StreetViewMini";
import ScheduleDateTimePicker from "../components/ScheduleDateTimePicker";
import MapDistanceMeasure from "../components/MapDistanceMeasure";
import {
  buildApiUrl,
  getApiKey,
  getTenantId,
  getAssetsFromApi,
  getAssetsFromApiForTenant,
  peekCachedAssets,
  clearCachedAssets,
  createLiveShareLink,
  getLiveShareActive,
  getBindings,
  getConfigurationGroups,
  getGpsIotFuelRefills,
  getGpsIotFuelInfo,
  getGpsIotCurrentFuelReading,
  getGpsIotCanBus,
  getGpsIotAssetInputStatus,
  ensureGpsIotLiveForwarding,
  getTraccarDevices,
  getTraccarEvents,
  getTraccarFuelRoute,
  getTraccarRoute,
  getTraccarLive,
  type TraccarLiveRow,
  getSiteTimeZoneSettings,
  SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT,
  formatTimestampForSite,
  isOwnSupportPrincipal,
  kickAvlSocket,
  saveToApi,
  sendLiveShareEmail,
  telemetryLookupByImeiDetailed,
  type SiteTimeZoneSettings,
  type TelemetryLookupResponse
} from "../utils/api";
import DeviceHealthModal from "../components/DeviceHealthModal";
import { movementFromSpeedKph, parseSpeedKph } from "../utils/assetTelemetryFields";
import { isCms808Server, isGpsIotServer } from "../utils/regionServers";
import { rememberLivePositions } from "../utils/assetLiveCache";
import {
  buildFuelModelFromGpsIotInfo,
  formatGpsIotFuelStamp,
  parseGpsIotFuelDateMs,
  resolveGpsIotFuelAssetId
} from "../utils/gpsiotFuel";
import {
  formatGpsIotInputStatusLabel,
  sortGpsIotInputs,
  type GpsIotAssetInput
} from "../utils/gpsiotInputStatus";
import { applyCanBusToAssetRow, loadCanAttachedAssetIds } from "../utils/gpsiotCan";
import { TRAIL_POINT_INTERVAL_MS } from "../utils/trailSampling";
import { tripStartFlagIcon } from "../utils/tripStartFlagIcon";
import { toBrandDisplay } from "../utils/brandLabels";
import { resolveAssetDotStatus, resolveLastMoveAtMs, assetDotStatusLabel } from "../utils/assetStatus";
import { resolveAssetDriverName } from "../utils/assetDriver";
import { formatAssetDescription, preferHumanAssetLabel } from "../utils/hierarchyDisplay";
import { AssetStatusIndicator } from "../components/AssetStatusIndicator";
import SortableColumnHeader from "../components/SortableColumnHeader";
import { useColumnSort } from "../hooks/useColumnSort";
import { MapZoomControlsOverlay } from "../components/MapZoomControls";
import { matchesStoredSiteSelection, readStoredSelectionScope } from "../utils/selectionScope";
import { readActiveTenantId, readUserScopedJson, subscribeScopeChange, writeUserScopedJson } from "../utils/tenantContext";
import { loadSharedRecords, saveSharedRecords } from "../utils/sharedRecords";
import { useFleetFilterOptional } from "../contexts/FleetFilterContext";
import { toLiveFleetRow } from "../services/liveFleetFeed";
import { createHierarchyArranger } from "../utils/viviCategories";
import {
  clearUserPref,
  USER_PREF_KEYS,
  writeActiveAssetPrefs
} from "../utils/userAppPrefs";
import {
  TRACCAR_POWER_ATTR_KEYS,
  TRACCAR_SATELLITE_ATTR_KEYS,
  TraccarPositionAttr,
  readTraccarAttr,
  readTraccarAttrNumber
} from "../utils/traccarPositionKeys";
import { readTeltonikaIgnition } from "../utils/teltonikaProtocol";
import {
  LOCATION_ALERTS_UPDATED_EVENT
} from "../utils/locationAlertNotifications";
import {
  loadNotificationPickerEventsForSite,
  NOTIFICATION_LIBRARY_UPDATED_EVENT,
  readActiveSiteName
} from "../utils/notificationLibraryStore";
import { locationLibraryRows } from "../data/locationLibrary";
import {
  buildRouteDistanceKm,
  computeIgnitionCycleUsedFuelLitres,
  computePeriodConsumedFuelLitres,
  extractFuelReading,
  formatFuelChartTime,
  formatFuelLiters,
  formatFuelReadingFromBinding,
  formatSmoothedFuelReading,
  nearestRoutePointAt,
  parseFuelNumber,
  readDeviceFuelConfig,
  readDeviceFuelConfigFromBinding,
  type DeviceFuelConfig
} from "../utils/traccarFuel";
import { hasUsableFuelCalibration } from "../utils/fuelCalibration";
import {
  getFuelAnalysisColumns,
  buildFuelAnalysisRows,
  buildLiveFuelPopupFromRoute,
  analyzeFuelSample,
  fuelSampleFingerprint,
  type FuelAnalysisRow,
  type FuelAnalysisSampleInput
} from "../utils/fuelSensorAnalysis";
import {
  resolveBindingByRef,
  sitesEquivalent
} from "../utils/bindingResolve";
import type {
  ConfigGroupRecord,
  DeviceBindingRecord
} from "../utils/traccarBindingSync";
import {
  buildFuelChartLinePreservingGaps,
  buildLinearSvgPath,
  fuelReportAxisBounds,
  fuelReportYTicks,
  type FuelChangePoint,
  type FuelTrendPoint
} from "../utils/fuelTrendStabilizer";
import { fetchTraccarLiveSnapshotsByImei, buildTraccarLiveSnapshotsFromRows, type TraccarLiveSnapshot } from "../utils/traccarLive";
import { getSharedRealtimeClient } from "../utils/realtimeWs";
import {
  CMS808_KNOWN_VEHICLE,
  CMS808_PARENT_NAME,
  cms808DisplayTime,
  cms808GpsTime,
  cms808HierarchyActive,
  cms808SiteName,
  cms808VehicleToAssetRecord,
  cms808VehicleToLiveRow,
  findCms808LiveMatch,
  isCms808LiveAsset,
  loadCms808PlaybackTrail,
  buildCms808TimelineTrips,
  overlayCms808LiveFields,
  loadCms808Position,
  loadCms808VehiclesForActiveHierarchy,
  resolveCms808DeviceId
} from "../utils/cms808";
import {
  immobilizerActionDescription,
  immobilizerActionLabel,
  saveAndCompileImmobilizerAction,
  type ImmobilizerAction
} from "../utils/immobilizerActions";
import {
  extractNotificationLabelsFromPayload,
  hasVideoEnabledNotification,
  loadVideoEnabledNotificationNames
} from "../utils/notificationVideo";
import {
  buildTrailNotificationTriangleIcon,
  hasActiveSelectedNotificationForAsset,
  isActiveTrailNotificationMarker,
  mapTraccarEventsToTrailNotifications,
  matchNotificationToTrailPoint,
  notificationEventAtMs
} from "../utils/trailNotificationMarker";
import { loadLocationGeofences, parseTraccarAreaToShape, saveLocationGeofence, type LocationShape } from "../utils/locationGeofences";
import { isLikelyNativeShell, isTabletDevice, shouldUsePhoneMode } from "../utils/phoneMode";
import "../index.css";

// TODO: Add your Google Maps API key to the .env file.
// VITE_GOOGLE_MAPS_API_KEY=YOUR_API_KEY

type AssetRow = {
  id: string;
  assetDescription: string;
  registration: string;
  fleetNumber: string;
  database?: string;
  imei?: string;
  configGroup?: string;
  site: string;
  driver: string;
  lastActive: string;
  lastPosition: string;
  location: string;
  assetId: string;
  gps: string;
  heading: string;
  ignition: string;
  lastNotificationValue: string;
  mobileDeviceType: string;
  device?: string;
  speed: string;
  /** Live speed in km/h. Status reads this before `speed`, so live updates must set it. */
  speedKph?: number | string;
  /** GPS fix time of the last live (Traccar) update applied to this row. */
  liveFixAtMs?: number;
  /** Which feed set the live fields: Traccar (primary) or the telemetry stream. */
  liveSource?: "traccar" | "stream";
  movement?: string;
  timeInIgnition: string;
  driverIdentified?: string;
  fuelReading: string;
  name?: string;
  attributes?: Record<string, unknown>;
  /** Latest analogue attributes for the binding fuel chart. */
  fuelAttributes?: Record<string, unknown>;
  /** GPS IoT GetCanBus fields when CAN library protocol is bound on C1/C2. */
  canBus?: Record<string, string>;
  canProtocol?: string;
  satellites: string;
  powerVoltage?: string;
  availabilityStatus?: string;
  status: "online" | "warning" | "stale" | "offline";
  lat?: number;
  lng?: number;
  telemetryAtMs?: number;
  lastMoveAtMs?: number;
  traccarDeviceId?: number;
};

type LocationRow = {
  id: string;
  name: string;
  site: string;
  locationType: string;
  lat?: number;
  lng?: number;
  radius?: number;
  shape?: LocationShape;
  area?: string;
  color?: string;
};

type EventRow = {
  id: string;
  name: string;
  eventType: string;
};

type DrawPoint = { x: number; y: number };

type GeoShape = {
  id: string;
  type: "circle" | "rectangle" | "polygon" | "polyline";
  points?: Array<{ lat: number; lng: number }>;
  center?: { lat: number; lng: number };
  radius?: number;
};

type DragPoint = {
  shapeId: string;
  kind: "vertex" | "center" | "start" | "end";
  index?: number;
};

const mapCachedAssetToRow = (asset: Record<string, unknown>, index: number): AssetRow => {
  const id = String(asset.id ?? asset.assetId ?? index);
  const imei = deriveImeiFromAsset(asset) || "";
  const registration = preferHumanAssetLabel(asset.registration, asset.registration, imei);
  const assetDescription =
    formatAssetDescription(asset) ||
    preferHumanAssetLabel(asset.assetDescription, asset.assetDescription, imei) ||
    registration ||
    "Unnamed asset";
  const site = String(asset.site ?? asset.group ?? asset.groupName ?? "");
  const rawStamp = getAssetLastSeen(asset);
  const shownStamp = formatTimestamp(rawStamp) || rawStamp;
  const telemetryAtMs = parseTimestampMs(rawStamp);
  return {
    id,
    assetDescription,
    registration,
    fleetNumber: String(asset.fleetNumber ?? ""),
    database: String(asset.database ?? asset.contact ?? "").trim(),
    imei: imei || undefined,
    configGroup: getAssetConfigGroup(asset) || undefined,
    site,
    driver: resolveAssetDriverName(asset),
    lastActive: shownStamp,
    lastPosition: shownStamp,
    location: String(asset.location ?? asset.lastLocation ?? ""),
    assetId: String(asset.assetId ?? asset.id ?? ""),
    gps: String(asset.gps ?? ""),
    heading: String(asset.heading ?? ""),
    ignition: String(asset.ignition ?? ""),
    lastNotificationValue: String(asset.lastNotificationValue ?? ""),
    mobileDeviceType: String(asset.mobileDevice ?? asset.mobileDeviceType ?? ""),
    device: String(asset.device ?? ""),
    speed: String(asset.speed ?? ""),
    timeInIgnition: String(asset.timeInIgnition ?? ""),
    driverIdentified: String(asset.driverIdentified ?? ""),
    fuelReading: extractFuelReading(asset) || "",
    satellites: String(asset.satellites ?? ""),
    powerVoltage: String(asset.powerVoltage ?? ""),
    availabilityStatus: String(asset.status ?? asset.availability ?? ""),
    status: computeStatus({
      ...asset,
      lastSeen: rawStamp,
      lastPosition: rawStamp,
      telemetryAtMs: Number.isFinite(telemetryAtMs) ? telemetryAtMs : undefined
    }),
    lat: Number.isFinite(Number(asset.lat)) ? Number(asset.lat) : undefined,
    lng: Number.isFinite(Number(asset.lng)) ? Number(asset.lng) : undefined,
    telemetryAtMs: Number.isFinite(telemetryAtMs) ? telemetryAtMs : undefined
  };
};

const readCachedAssetRows = (): AssetRow[] =>
  peekCachedAssets<Record<string, unknown>>().map((asset, index) => mapCachedAssetToRow(asset, index));

type ColumnKey =
  | "assetDescription"
  | "assetIcon"
  | "assetId"
  | "database"
  | "driver"
  | "driverIdentified"
  | "fuelReading"
  | "fleetNumber"
  | "gps"
  | "heading"
  | "ignition"
  | "lastNotification"
  | "lastNotificationValue"
  | "location"
  | "mobileDeviceType"
  | "registration"
  | "site"
  | "speed"
  | "timeInIgnition";

const baseLayers: Record<string, { url: string; attribution: string }> = {
  roadmap: {
    url: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps"
  },
  terrain: {
    url: "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps"
  },
  satellite: {
    url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps"
  },
  hybrid: {
    url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps"
  }
};

const LIVE_MAP_DEFAULT_CENTER = { lat: 0.55, lng: 32.45 };

const REVERSE_GEOCODE_STORAGE_KEY = "vivi.liveTracking.reverseGeocodeCache.v1";

const parseTimestampMs = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;

  if (/^\d{10,13}$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  }

  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return direct;

  // Support legacy dd/mm/yyyy hh:mm[:ss] values from some telemetry payloads.
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return Number.NaN;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4] ?? "0");
  const minute = Number(match[5] ?? "0");
  const second = Number(match[6] ?? "0");
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isFinite(ms) ? ms : Number.NaN;
};

const parsePointTimestampMs = (point: {
  fixTime?: unknown;
  deviceTime?: unknown;
  serverTime?: unknown;
  time?: unknown;
  timestamp?: unknown;
}): number =>
  parseTimestampMs(point.fixTime ?? point.deviceTime ?? point.serverTime ?? point.time ?? point.timestamp);

const hasKnownLatLng = (asset: { lat?: unknown; lng?: unknown }) =>
  typeof (asset as any).lat === "number" &&
  Number.isFinite((asset as any).lat) &&
  typeof (asset as any).lng === "number" &&
  Number.isFinite((asset as any).lng);

const hasLiveTrackingLastPosition = (asset: { lastPosition?: unknown }) => {
  const raw = String((asset as any).lastPosition ?? "").trim();
  return Boolean(raw) && !Number.isNaN(parseTimestampMs(raw));
};

type ScreenPoint = {
  x: number;
  y: number;
};

const isTrackableLiveAsset = (asset: { lat?: unknown; lng?: unknown; lastPosition?: unknown; telemetryAtMs?: unknown }) => {
  const hasTelemetryTime = typeof asset.telemetryAtMs === "number" && Number.isFinite(asset.telemetryAtMs);
  return hasKnownLatLng(asset) && (hasLiveTrackingLastPosition(asset) || hasTelemetryTime);
};

const formatCms808LiveRow = (row: AssetRow, settings: SiteTimeZoneSettings | null | undefined): AssetRow => {
  const shown = cms808DisplayTime(row.lastPosition || row.lastActive, row.site, settings);
  const status = resolveAssetDotStatus({ ...row, lastPosition: shown || row.lastPosition } as any);
  return {
    ...row,
    ...(shown ? { lastPosition: shown, lastActive: shown } : {}),
    movement: status === "online" ? "moving" : row.movement || "stationary",
    status
  };
};

const formatTimestamp = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "—") return "";
  const parsed = parseTimestampMs(raw);
  if (Number.isNaN(parsed)) return raw;
  const d = new Date(parsed);
  return d
    .toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    })
    .replace(",", "");
};

const isSiteCoordinateValid = (site: unknown, lat: number | undefined, lng: number | undefined) => {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  const siteText = String(site ?? "").trim().toLowerCase();
  if (siteText.includes("dar es salaam") || siteText.includes("tanzania")) {
    return lat >= -12 && lat <= 1.5 && lng >= 28 && lng <= 42;
  }
  return true;
};

const telemetryPollIntervalMs = (_latest: TelemetryLookupResponse["latest"] | undefined) => 20_000;
const MIN_SATELLITES_FOR_LOCK = 6;
const HEADING_MIN_DELTA_DEG = 10;
const HEADING_SMOOTHING_FACTOR = 0.3;
const LIVE_PROJECTION_MAX_AGE_MS = 120_000;
const LIVE_PROJECTION_MAX_STEP_MS = 20_000;
type TrailPoint = {
  lat: number;
  lng: number;
  atMs: number;
  speedKph?: number;
  driver?: string;
  location?: string;
};
type TrailSample = {
  lat: number;
  lng: number;
  atMs: number;
  moving: boolean;
  ignitionOn: boolean;
  speedKph?: number;
  driver?: string;
  location?: string;
};
type VideoTrailEvent = { lat: number; lng: number; atMs: number; labels: string[] };
type TrailNotificationEvent = {
  lat: number;
  lng: number;
  atMs: number;
  labels: string[];
  speedKph?: number;
  driver?: string;
  location?: string;
};
type FuelTachoTimeRange = "12h" | "24h" | "7d_including_today" | "7d";

const FUEL_TACHO_TIME_RANGE_OPTIONS: { id: FuelTachoTimeRange; label: string }[] = [
  { id: "12h", label: "12 Hours" },
  { id: "24h", label: "24 Hours" },
  { id: "7d_including_today", label: "Last 7 Days including today" },
  { id: "7d", label: "Last 7 Days" }
];

const resolveFuelTachoRange = (
  range: FuelTachoTimeRange,
  nowMs = Date.now()
): { fromMs: number; toMs: number; label: string } => {
  const toMs = nowMs;
  switch (range) {
    case "24h":
      return { fromMs: toMs - 24 * 60 * 60 * 1000, toMs, label: "24 hours" };
    case "7d_including_today": {
      const start = new Date(nowMs);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 6);
      return { fromMs: start.getTime(), toMs, label: "Last 7 days including today" };
    }
    case "7d": {
      const end = new Date(nowMs);
      end.setHours(0, 0, 0, 0);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      return { fromMs: start.getTime(), toMs: end.getTime(), label: "Last 7 days" };
    }
    case "12h":
    default:
      return { fromMs: toMs - 12 * 60 * 60 * 1000, toMs, label: "12 hours" };
  }
};

const formatFuelReportDateTime = (atMs: number): string => {
  if (!Number.isFinite(atMs)) return "";
  return new Date(atMs)
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    })
    .replace(",", "");
};

const formatFuelActionDate = (atMs: number): string => {
  if (!Number.isFinite(atMs)) return "";
  return new Date(atMs).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const formatFuelActionClock = (atMs: number): string => {
  if (!Number.isFinite(atMs)) return "";
  return new Date(atMs).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
};

const formatFuelEventLitres = (liters: number): string =>
  Number.isFinite(liters) ? `${liters.toFixed(2)} L` : "—";

const FuelEventLedger = ({
  kind,
  events,
  loading
}: {
  kind: "drain" | "refill";
  events: FuelChangePoint[];
  loading: boolean;
}) => {
  const isDrain = kind === "drain";
  const title = isDrain ? "DRAINS" : "REFILLS";
  const badge = isDrain ? "Drain" : "Refill";
  const amountLabel = isDrain ? "Fuel drained" : "Fuel added";
  const rows = [...events].sort((left, right) => left.atMs - right.atMs);

  return (
    <section className="fuel-event-section" aria-label={title}>
      <h3 className="fuel-event-section-title">
        {isDrain ? (
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5c-3.4 4.6-6.2 8-6.2 11.6a6.2 6.2 0 0 0 12.4 0c0-3.6-2.8-7-6.2-11.6z" fill="#16a34a" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 3h7.5v3.2H17a1.5 1.5 0 0 1 1.4.9L20 11v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="#16a34a" strokeWidth="1.6" />
            <path d="M9 12h5.2" stroke="#16a34a" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
        {title}
      </h3>
      <div className="fuel-event-table-wrap">
        <table className="fuel-event-table">
          <thead>
            <tr>
              <th>Time of action</th>
              <th>Specific location</th>
              <th className="fuel-event-badge-col" />
              <th>Initial fuel</th>
              <th>Final fuel</th>
              <th>{amountLabel}</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="fuel-event-empty-row">Loading fuel events...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="fuel-event-empty-row">
                  {isDrain ? "No drains in this period." : "No refills in this period."}
                </td>
              </tr>
            ) : (
              rows.map((event) => {
                const location = String(event.locationName ?? "").trim();
                const hasCoords = Number.isFinite(event.lat) && Number.isFinite(event.lng);
                const locationText = location || (hasCoords ? "Resolving location..." : "Location unavailable");
                return (
                  <tr key={`${kind}-${event.atMs}-${event.fromLevel}-${event.toLevel}`}>
                    <td>
                      <div className="fuel-event-time-cell">
                        <span className={`fuel-event-marker is-${kind}`} aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            {isDrain ? (
                              <path d="M12 4v13M6.5 12.5 12 19l5.5-6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            ) : (
                              <path d="M12 20V7M6.5 11.5 12 5l5.5 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            )}
                          </svg>
                        </span>
                        <span className="fuel-event-time-stack">
                          <span className="fuel-event-time-date">{formatFuelActionDate(event.atMs)}</span>
                          <span className="fuel-event-time-clock">{formatFuelActionClock(event.atMs)}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      {hasCoords ? (
                        <a
                          className="fuel-event-location-link"
                          href={`https://www.google.com/maps?q=${event.lat},${event.lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {locationText}
                        </a>
                      ) : (
                        <span className="fuel-event-location-text">{locationText}</span>
                      )}
                    </td>
                    <td>
                      <span className={`fuel-event-badge is-${kind}`}>{badge}</span>
                    </td>
                    <td className="fuel-event-volume">{formatFuelEventLitres(event.fromLevel)}</td>
                    <td className="fuel-event-volume">{formatFuelEventLitres(event.toLevel)}</td>
                    <td className="fuel-event-volume">{formatFuelEventLitres(Math.abs(event.deltaLiters))}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const formatFuelTachoAxisTime = (atMs: number, spanMs: number, withDate: boolean): string => {
  const when = new Date(atMs);
  if (spanMs > 7 * 24 * 60 * 60 * 1000) {
    return when.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
  }
  const time = when.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  if (!withDate) return time;
  const date = when.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${date} ${time}`;
};

const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const formatShareExpiryTooltip = (expiresAt: string | undefined) => {
  const raw = String(expiresAt ?? "").trim();
  if (!raw) return "Live location sharing active";
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return `Live location sharing active. Expires: ${raw}`;
  const asText = new Date(parsed)
    .toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    })
    .replace(",", "");
  return `Live location sharing active. Expires: ${asText}`;
};

const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360;

const shortestAngularDelta = (from: number, to: number) => {
  const a = normalizeDegrees(from);
  const b = normalizeDegrees(to);
  let delta = b - a;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
};

const normalizeNotificationToken = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

const trailBearingDegrees = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const deltaLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return normalizeDegrees(bearing);
};

const buildTrailArrowIcon = (headingDeg: number) =>
  L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;transform:rotate(${headingDeg.toFixed(1)}deg);"><svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8 1 L14 15 L8 12 L2 15 Z" fill="#0f172a" fill-opacity="0.85" stroke="#ffffff" stroke-width="1"/></svg></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });

const TRIP_REPLAY_SPEED_OPTIONS = [1, 2, 5, 10, 20] as const;

const haversineTrailKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const earthRadiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinHalf =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(sinHalf), Math.sqrt(1 - sinHalf));
};

type TrailReplayMetrics = {
  totalDistanceKm: number;
  totalDurationMs: number;
  startMs: number;
  endMs: number;
  cumulativeDistanceKm: number[];
};

const buildTrailReplayMetrics = (trail: TrailPoint[]): TrailReplayMetrics | null => {
  if (trail.length < 2) return null;
  const sorted = [...trail].sort((a, b) => a.atMs - b.atMs);
  const cumulativeDistanceKm = [0];
  let totalDistanceKm = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    totalDistanceKm += haversineTrailKm(sorted[i - 1], sorted[i]);
    cumulativeDistanceKm.push(totalDistanceKm);
  }
  return {
    totalDistanceKm,
    totalDurationMs: Math.max(0, sorted[sorted.length - 1].atMs - sorted[0].atMs),
    startMs: sorted[0].atMs,
    endMs: sorted[sorted.length - 1].atMs,
    cumulativeDistanceKm
  };
};

const interpolateTrailAtMs = (
  trail: TrailPoint[],
  atMs: number
): { lat: number; lng: number; heading: number } | null => {
  if (trail.length < 2) return null;
  const sorted = trail;
  if (atMs <= sorted[0].atMs) {
    const next = sorted[1] ?? sorted[0];
    return {
      lat: sorted[0].lat,
      lng: sorted[0].lng,
      heading: trailBearingDegrees(sorted[0], next)
    };
  }
  const last = sorted[sorted.length - 1];
  if (atMs >= last.atMs) {
    const prev = sorted[sorted.length - 2] ?? last;
    return { lat: last.lat, lng: last.lng, heading: trailBearingDegrees(prev, last) };
  }
  for (let i = 1; i < sorted.length; i += 1) {
    const to = sorted[i];
    if (atMs > to.atMs) continue;
    const from = sorted[i - 1];
    const span = to.atMs - from.atMs;
    const t = span > 0 ? (atMs - from.atMs) / span : 0;
    return {
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
      heading: trailBearingDegrees(from, to)
    };
  }
  return null;
};

const distanceKmAtTrailMs = (trail: TrailPoint[], cumulativeDistanceKm: number[], atMs: number) => {
  if (trail.length < 2 || cumulativeDistanceKm.length !== trail.length) return 0;
  const sorted = trail;
  if (atMs <= sorted[0].atMs) return 0;
  const lastIndex = sorted.length - 1;
  if (atMs >= sorted[lastIndex].atMs) return cumulativeDistanceKm[lastIndex] ?? 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const to = sorted[i];
    if (atMs > to.atMs) continue;
    const from = sorted[i - 1];
    const span = to.atMs - from.atMs;
    const t = span > 0 ? (atMs - from.atMs) / span : 0;
    const fromKm = cumulativeDistanceKm[i - 1] ?? 0;
    const toKm = cumulativeDistanceKm[i] ?? fromKm;
    return fromKm + (toKm - fromKm) * t;
  }
  return 0;
};

const buildTraveledTrailPositions = (
  trail: TrailPoint[],
  atMs: number
): [number, number][] => {
  if (trail.length < 2) return [];
  const sorted = trail;
  const positions: [number, number][] = [];
  for (const point of sorted) {
    if (point.atMs > atMs) break;
    positions.push([point.lat, point.lng]);
  }
  const interpolated = interpolateTrailAtMs(sorted, atMs);
  if (!interpolated) return positions.length >= 2 ? positions : [];
  const last = positions[positions.length - 1];
  if (!last || last[0] !== interpolated.lat || last[1] !== interpolated.lng) {
    positions.push([interpolated.lat, interpolated.lng]);
  }
  return positions.length >= 2 ? positions : [];
};

const formatReplayDuration = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const videoRecordedIcon = L.icon({
  iconUrl: `data:image/svg+xml;base64,${btoa(`<svg width='28' height='28' viewBox='0 0 28 28' xmlns='http://www.w3.org/2000/svg'><circle cx='14' cy='14' r='12' fill='#b91c1c' stroke='#fff' stroke-width='2'/><path d='M9 11.5a2.5 2.5 0 0 1 2.5-2.5h4A2.5 2.5 0 0 1 18 11.5v5a2.5 2.5 0 0 1-2.5 2.5h-4A2.5 2.5 0 0 1 9 16.5z' fill='none' stroke='#fff' stroke-width='1.8'/><path d='M18 12.5l3-1.8v6.6l-3-1.8z' fill='none' stroke='#fff' stroke-width='1.8' stroke-linejoin='round'/></svg>`)}`,
  iconSize: [28, 28],
  iconAnchor: [14, 24],
  popupAnchor: [0, -22]
});

const computeStatus = (asset: Record<string, unknown>): "online" | "warning" | "stale" | "offline" =>
  resolveAssetDotStatus(asset);

const pickFirstNonEmptyString = (...values: unknown[]) => {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

const normalizeImeiCandidate = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  // IMEI is typically 15 digits; some platforms may include 14/16/17-digit identifiers.
  if (digits.length < 14 || digits.length > 17) return "";
  return digits;
};

const deriveImeiFromAsset = (asset: any): string => {
  return (
    normalizeImeiCandidate(asset?.imei) ||
    normalizeImeiCandidate(asset?.uniqueId) ||
    normalizeImeiCandidate(asset?.deviceUniqueId) ||
    normalizeImeiCandidate(asset?.assetId) ||
    normalizeImeiCandidate(asset?.fleetNumber) ||
    ""
  );
};

const mergeTraccarLiveSnapshotIntoAssetRow = (
  row: AssetRow,
  snapshot: TraccarLiveSnapshot | undefined,
  siteTimeZones: SiteTimeZoneSettings | null
): AssetRow => {
  if (!snapshot) return row;

  // Compare live fix to live fix. A stored record's lastSeen (server time) must not block
  // newer GPS fixes; that kept rows "stationary" for ~30 s after every asset-list reload.
  const currentAtMs = Number(row.liveFixAtMs ?? Number.NaN);
  const incomingAtMs = snapshot.atMs;
  const positionChanged =
    typeof row.lat !== "number" ||
    typeof row.lng !== "number" ||
    Math.abs(snapshot.lat - row.lat) > 0.000001 ||
    Math.abs(snapshot.lng - row.lng) > 0.000001;
  const isNewer =
    !Number.isFinite(currentAtMs) ||
    !Number.isFinite(incomingAtMs) ||
    incomingAtMs >= currentAtMs;
  const needsCoords = typeof row.lat !== "number" || typeof row.lng !== "number";
  // Never regress Last Position to an older Traccar fix (GPS jitter must not rewind the clock).
  const applyTimestamp = isNewer;
  const applyCoords = isNewer || (needsCoords && positionChanged);

  const nextLat = applyCoords ? snapshot.lat : row.lat;
  const nextLng = applyCoords ? snapshot.lng : row.lng;
  const shownAt = snapshot.fixTime
    ? formatTimestampForSite(snapshot.fixTime, row.site, siteTimeZones)
    : row.lastPosition;
  const nextSpeed = snapshot.speedKph || row.speed;
  // Status reads speedKph before speed, so the live value must land in speedKph too;
  // otherwise a stored speedKph from the asset list kept deciding Moving / Stationary.
  const liveSpeedKph = String(snapshot.speedKph ?? "").trim() ? Number(snapshot.speedKph) : Number.NaN;
  const nextHeading = snapshot.heading || row.heading;
  const nextFuel = snapshot.fuelReading || row.fuelReading;
  const nextSatellites = snapshot.satellites || row.satellites;
  const nextVoltage = snapshot.powerVoltage || row.powerVoltage;
  const nextIgnition =
    typeof snapshot.ignition === "boolean"
      ? snapshot.ignition
        ? "On"
        : "Off"
      : row.ignition;
  const nextLocation = String(snapshot.address ?? "").trim() || row.location;
  const nextNotification = String(snapshot.eventName ?? "").trim() || row.lastNotificationValue;
  const nextFuelAttributes =
    snapshot.attributes && typeof snapshot.attributes === "object"
      ? { ...(row.fuelAttributes ?? {}), ...snapshot.attributes }
      : row.fuelAttributes;
  const lastMoveAtMs = resolveLastMoveAtMs({
    previousLastMoveAtMs: row.lastMoveAtMs,
    atMs: Number.isFinite(incomingAtMs) ? incomingAtMs : Date.now(),
    speed: nextSpeed,
    previousLat: row.lat,
    previousLng: row.lng,
    lat: nextLat,
    lng: nextLng
  });

  if (
    !applyTimestamp &&
    !applyCoords &&
    nextSpeed === row.speed &&
    nextHeading === row.heading &&
    nextFuel === row.fuelReading &&
    nextSatellites === row.satellites &&
    nextVoltage === row.powerVoltage &&
    nextIgnition === row.ignition &&
    nextLocation === row.location &&
    nextNotification === row.lastNotificationValue &&
    lastMoveAtMs === row.lastMoveAtMs
  ) {
    return row;
  }

  return {
    ...row,
    lat: nextLat,
    lng: nextLng,
    gps:
      applyCoords && typeof nextLat === "number" && typeof nextLng === "number"
        ? `${nextLat.toFixed(6)}, ${nextLng.toFixed(6)}`
        : row.gps,
    speed: applyTimestamp ? nextSpeed : row.speed,
    speedKph: applyTimestamp && Number.isFinite(liveSpeedKph) ? liveSpeedKph : row.speedKph,
    heading: applyTimestamp ? nextHeading : row.heading,
    fuelReading: applyTimestamp ? nextFuel : row.fuelReading,
    fuelAttributes: applyTimestamp ? nextFuelAttributes : row.fuelAttributes,
    satellites: applyTimestamp ? nextSatellites : row.satellites,
    powerVoltage: applyTimestamp ? nextVoltage : row.powerVoltage,
    ignition: applyTimestamp ? nextIgnition : row.ignition,
    location: applyTimestamp ? nextLocation : row.location,
    lastNotificationValue: applyTimestamp ? nextNotification : row.lastNotificationValue,
    movement: applyTimestamp
      ? (typeof snapshot.motion === "boolean"
          ? (snapshot.motion ? "Moving" : "Stopped")
          : row.movement)
      : row.movement,
    lastActive: applyTimestamp && snapshot.fixTime ? shownAt : row.lastActive,
    lastPosition: applyTimestamp && snapshot.fixTime ? shownAt : row.lastPosition,
    telemetryAtMs: applyTimestamp && Number.isFinite(incomingAtMs) ? incomingAtMs : row.telemetryAtMs,
    liveFixAtMs: applyTimestamp && Number.isFinite(incomingAtMs) ? incomingAtMs : row.liveFixAtMs,
    liveSource: applyTimestamp && Number.isFinite(incomingAtMs) ? "traccar" : row.liveSource,
    lastMoveAtMs,
    status: computeStatus({
      ...row,
      status: row.availabilityStatus,
      lastSeen: applyTimestamp && snapshot.fixTime ? snapshot.fixTime : row.lastPosition,
      lastPosition: applyTimestamp && snapshot.fixTime ? shownAt : row.lastPosition,
      lastTrip: row.lastPosition,
      speed: applyTimestamp ? nextSpeed : row.speed,
      speedKph: applyTimestamp && Number.isFinite(liveSpeedKph) ? liveSpeedKph : row.speedKph,
      lat: nextLat,
      lng: nextLng,
      lastMoveAtMs,
      telemetryAtMs: applyTimestamp && Number.isFinite(incomingAtMs) ? incomingAtMs : row.telemetryAtMs
    })
  };
};

type LiveMapMarkerProps = {
  position: [number, number];
  icon: L.DivIcon | L.Icon;
  eventHandlers?: L.LeafletEventHandlerFnMap;
  zIndexOffset?: number;
};

type MarkerRenderRow = {
  asset: AssetRow;
  index: number;
  lat: number;
  lng: number;
  markerKey: string;
};

/** How long a marker stays at its last position after its asset drops out of one refresh. */
const LIVE_MARKER_GRACE_MS = 8_000;

const hideLiveMarkerAssetIdFor = (tripReplayOpen: boolean, tripReplayTrailAssetId: string | null | undefined) =>
  tripReplayOpen && tripReplayTrailAssetId ? tripReplayTrailAssetId : "";

function LiveMapMarker({ position, icon, eventHandlers, zIndexOffset = 0 }: LiveMapMarkerProps) {
  const lat = position[0];
  const lng = position[1];
  // A new position array on every render makes react-leaflet call setLatLng, which makes
  // the cluster group remove and re-add the marker (visible blinking). Keep it stable.
  const stablePosition = useMemo<[number, number]>(() => [lat, lng], [lat, lng]);
  const handlersRef = useRef(eventHandlers);
  handlersRef.current = eventHandlers;
  const stableHandlers = useMemo<L.LeafletEventHandlerFnMap>(
    () => ({
      click: (event) => {
        const handler = handlersRef.current?.click;
        if (handler) (handler as (e: L.LeafletEvent) => void)(event);
      }
    }),
    []
  );
  return (
    <Marker
      position={stablePosition}
      icon={icon}
      eventHandlers={stableHandlers}
      zIndexOffset={zIndexOffset}
    />
  );
}

function MapReplayFollower({
  lat,
  lng,
  enabled
}: {
  lat: number;
  lng: number;
  enabled: boolean;
}) {
  const map = useMap();
  const lastPanAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const now = Date.now();
    if (now - lastPanAtRef.current < 350) return;
    lastPanAtRef.current = now;
    try {
      map.panTo([lat, lng], { animate: true, duration: 0.35 });
    } catch {
      // ignore pan failures during replay
    }
  }, [lat, lng, enabled, map]);

  return null;
}

/** Capture Leaflet map once — avoids Windows Chrome ref-callback update loops (React #185). */
function CaptureMapInstance({ onMap }: { onMap: (map: L.Map | null) => void }) {
  const map = useMap();
  useEffect(() => {
    onMap(map);
    return () => onMap(null);
  }, [map, onMap]);
  return null;
}

type TripReplayVehicleMarkerProps = {
  asset: AssetRow;
  trail: TrailPoint[];
  atMs: number | null;
  metrics: TrailReplayMetrics;
  onMarkerClick?: () => void;
};

function TripReplayVehicleMarker({
  asset,
  trail,
  atMs,
  metrics,
  onMarkerClick
}: TripReplayVehicleMarkerProps) {
  const markerRef = useRef<L.Marker>(null);
  const position = useMemo(
    () => interpolateTrailAtMs(trail, atMs ?? metrics.startMs),
    [trail, atMs, metrics.startMs]
  );
  const icon = useMemo(() => {
    if (!position) return null;
    return buildAssetIcon(asset, {
      showDirectionArrow: true,
      headingDeg: position.heading
    });
  }, [asset, position]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !position) return;
    marker.setLatLng([position.lat, position.lng]);
    marker.setZIndexOffset(2500);
  }, [position?.lat, position?.lng]);

  useEffect(() => {
    if (!markerRef.current || !icon) return;
    markerRef.current.setIcon(icon);
  }, [icon]);

  if (!position || !icon) return null;

  return (
    <Marker
      ref={markerRef}
      position={[position.lat, position.lng]}
      icon={icon}
      zIndexOffset={2500}
      eventHandlers={onMarkerClick ? { click: onMarkerClick } : undefined}
    />
  );
}

const resolveFuelReadingForAsset = (
  asset: { id?: string; imei?: string; fuelReading?: string },
  fuelByImei: Map<string, string>,
  payload?: any
): string => {
  const assetKey = String(asset.id ?? asset.imei ?? "").trim();
  const imei = normalizeImeiCandidate(asset.imei);
  const fromTraccar = imei ? fuelByImei.get(imei) : undefined;
  if (fromTraccar) return fromTraccar;
  if (assetKey && payload) {
    const smoothed = formatSmoothedFuelReading(assetKey, payload);
    if (smoothed) return smoothed;
  }
  const fromPayload = extractFuelReading(payload ?? asset);
  if (fromPayload) return fromPayload;
  return String(asset.fuelReading ?? "").trim();
};

const getAssetConfigGroup = (asset: any): string => {
  const raw = String(asset?.configGroup ?? asset?.configurationGroup ?? "").trim();
  return raw;
};

const isCommissionedAsset = (asset: any): boolean => {
  return Boolean(deriveImeiFromAsset(asset) && getAssetConfigGroup(asset));
};

const isValidTelemetryTimestamp = (value: unknown): boolean => {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const parsed = parseTimestampMs(raw);
  return !Number.isNaN(parsed);
};

const hasRequiredTelemetryPayload = (asset: any): boolean => {
  const lastSeenCandidate =
    asset?.lastSeen ??
    asset?.last_seen ??
    asset?.lastPosition ??
    asset?.last_position ??
    asset?.telemetryLatest?.at ??
    "";
  if (!isValidTelemetryTimestamp(lastSeenCandidate)) return false;

  const speed = toFiniteNumber(asset?.speed ?? asset?.telemetryLatest?.speed ?? asset?.telemetryLatest?.io?.Speed);
  if (typeof speed !== "number") return false;

  const location = String(asset?.lastLocation ?? asset?.location ?? asset?.locationName ?? "").trim();
  if (!location) return false;

  const satellites = toFiniteNumber(
    asset?.satellites ??
      asset?.satelliteCount ??
      asset?.gpsSatellites ??
      asset?.gnssSatellites ??
      asset?.telemetryLatest?.satellites
  );
  if (typeof satellites !== "number") return false;

  return true;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseGpsCoordinates = (value: unknown): { lat: number; lng: number } | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parts = raw
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const lat = toFiniteNumber(parts[0]);
  const lng = toFiniteNumber(parts[1]);
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
};

const getAssetCoordinates = (asset: any): { lat?: number; lng?: number } => {
  const telemetryLat = toFiniteNumber(
    asset?.telemetryLatest?.lat ?? asset?.telemetryLatest?.latitude ?? asset?.telemetryLatest?.data?.lat ?? asset?.telemetryLatest?.data?.latitude
  );
  const telemetryLng = toFiniteNumber(
    asset?.telemetryLatest?.lng ??
      asset?.telemetryLatest?.lon ??
      asset?.telemetryLatest?.longitude ??
      asset?.telemetryLatest?.data?.lng ??
      asset?.telemetryLatest?.data?.lon ??
      asset?.telemetryLatest?.data?.longitude
  );
  if (typeof telemetryLat === "number" && typeof telemetryLng === "number") return { lat: telemetryLat, lng: telemetryLng };

  const topLevelLat = toFiniteNumber(asset?.lat ?? asset?.latitude);
  const topLevelLng = toFiniteNumber(asset?.lng ?? asset?.lon ?? asset?.longitude);
  if (typeof topLevelLat === "number" && typeof topLevelLng === "number") return { lat: topLevelLat, lng: topLevelLng };

  const parsedGps = parseGpsCoordinates(asset?.gps ?? asset?.lastGps);
  if (parsedGps) return parsedGps;
  return {};
};

const getAssetLastSeen = (asset: any): string => {
  const candidates = [
    asset?.telemetryLatest?.at,
    asset?.telemetryLatest?.timestamp,
    asset?.telemetryLatest?.deviceAt,
    asset?.lastSeen,
    asset?.last_seen,
    asset?.lastDeviceTime,
    asset?.last_device_time,
    asset?.lastPosition,
    asset?.last_position,
    asset?.lastActive,
    asset?.last_active
  ];
  let best = "";
  let bestMs = Number.NEGATIVE_INFINITY;
  let fallback = "";
  for (const value of candidates) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    if (!fallback) fallback = raw;
    const ms = parseTimestampMs(raw);
    if (!Number.isFinite(ms) || ms < bestMs) continue;
    best = raw;
    bestMs = ms;
  }
  return best || fallback;
};

const getTrackingDisplayName = (asset: AssetRow): string => {
  return String(asset.assetDescription ?? "").trim() || String(asset.registration ?? "").trim() || String(asset.id ?? "").trim();
};

const getTrackingIdentifier = (asset: AssetRow): string => {
  return String(asset.imei ?? "").trim() || String(asset.assetId ?? "").trim() || String(asset.id ?? "").trim();
};

const getTrackingDatabase = (asset: AssetRow): string => {
  return getDiagnosticsDatabase(asset);
};

const getLiveColumnTextValue = (key: ColumnKey, asset: AssetRow): string => {
  switch (key) {
    case "assetDescription":
      return getTrackingDisplayName(asset);
    case "assetIcon":
      return "Truck";
    case "assetId":
      return String(asset.lastPosition ?? "").trim();
    case "database":
      return getTrackingDatabase(asset);
    case "driver":
      return String(asset.driver ?? "").trim();
    case "driverIdentified":
      return String(asset.driverIdentified ?? "").trim();
    case "fuelReading":
      return String(asset.fuelReading ?? "").trim();
    case "fleetNumber":
      return String(asset.fleetNumber ?? "").trim();
    case "gps":
      return String(asset.gps ?? "").trim();
    case "heading":
      return String(asset.heading ?? "").trim();
    case "ignition":
      return String(asset.ignition ?? "").trim();
    case "lastNotification":
      return String(asset.lastActive ?? "").trim();
    case "lastNotificationValue":
      return String(asset.lastNotificationValue ?? "").trim();
    case "location":
      return String(asset.location ?? "").trim();
    case "mobileDeviceType":
      return String(asset.mobileDeviceType ?? "").trim();
    case "registration":
      return String(asset.registration ?? "").trim();
    case "site":
      return String(asset.site ?? "").trim();
    case "speed":
      return String(asset.speed ?? "").trim();
    case "timeInIgnition":
      return String(asset.timeInIgnition ?? "").trim();
    default:
      return "";
  }
};

const estimateLiveColumnWidth = (
  key: ColumnKey,
  label: string,
  rows: AssetRow[],
  baseMinWidth: number
): number => {
  const longestTextLength = rows.reduce((maxLength, asset) => {
    const textLength = getLiveColumnTextValue(key, asset).length;
    return textLength > maxLength ? textLength : maxLength;
  }, label.length);

  const pxPerChar = key === "location" ? 7.4 : 8;
  const extraPadding = key === "assetDescription" ? 52 : 28;
  return Math.max(baseMinWidth, Math.ceil(longestTextLength * pxPerChar) + extraPadding);
};

const getSelectedDatabaseFromPath = (): string => {
  if (typeof window === "undefined") return "";
  const selectedPath = String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim();
  if (!selectedPath) return "";
  const parts = selectedPath
    .split("/")
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return String(parts[2] ?? "").trim();
};

const getDiagnosticsDatabase = (asset: Pick<AssetRow, "database" | "configGroup">): string => {
  const raw = String(asset.database ?? "").trim();
  const configGroup = String(asset.configGroup ?? "").trim();
  const fromPath = getSelectedDatabaseFromPath();
  const looksLikeConfigGroup =
    (configGroup && raw.toLowerCase() === configGroup.toLowerCase()) ||
    /^(default|default-group|default group)$/i.test(raw);
  if (!raw || looksLikeConfigGroup) return fromPath;
  return raw;
};

const headingToDegrees = (heading: string) => {
  const raw = heading.trim();
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    const wrapped = ((numeric % 360) + 360) % 360;
    return wrapped;
  }
  const dir = raw.toUpperCase();
  const lookup: Record<string, number> = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5
  };
  return lookup[dir] ?? 0;
};

const normalizeSpeedToKph = (value: unknown, treatAsKnots = false): string => {
  const numeric = toFiniteNumber(value);
  if (typeof numeric !== "number") return "";
  const kph = treatAsKnots ? numeric * 1.852 : numeric;
  if (!Number.isFinite(kph) || kph < 0) return "";
  return kph.toFixed(2);
};

const extractLiveSpeed = (payload: any): string => {
  const asKph = [
    payload?.speedKph,
    payload?.data?.speedKph,
    payload?.telemetryLatest?.data?.speedKph,
    payload?.telemetryLatest?.io?.["Speed (km/h)"],
    payload?.telemetryLatest?.io?.["GPS Speed"]
  ];
  for (const candidate of asKph) {
    const parsed = normalizeSpeedToKph(candidate, false);
    if (parsed) return parsed;
  }

  const asKnots = [
    payload?.position?.speed,
    payload?.raw?.speed,
    payload?.data?.raw?.speed,
    payload?.telemetryLatest?.raw?.speed
  ];
  for (const candidate of asKnots) {
    const parsed = normalizeSpeedToKph(candidate, true);
    if (parsed) return parsed;
  }

  const generic = [
    payload?.speed,
    payload?.data?.speed,
    payload?.telemetryLatest?.speed,
    payload?.telemetryLatest?.io?.Speed,
    payload?.telemetryLatest?.io?.["Speed"],
    payload?.telemetryLatest?.io?.["speed"]
  ];
  for (const candidate of generic) {
    const parsed = normalizeSpeedToKph(candidate, false);
    if (parsed) return parsed;
  }

  return "0.00";
};

const extractLiveHeading = (payload: any): string => {
  const candidates = [
    payload?.heading,
    payload?.course,
    payload?.position?.heading,
    payload?.position?.course,
    payload?.raw?.heading,
    payload?.raw?.course,
    payload?.data?.position?.heading,
    payload?.data?.position?.course,
    payload?.data?.raw?.heading,
    payload?.data?.raw?.course,
    payload?.telemetryLatest?.heading,
    payload?.telemetryLatest?.course,
    payload?.telemetryLatest?.data?.heading,
    payload?.telemetryLatest?.data?.course,
    payload?.telemetryLatest?.io?.Heading,
    payload?.telemetryLatest?.io?.["Heading"],
    payload?.telemetryLatest?.io?.Course,
    payload?.telemetryLatest?.io?.["Course"]
  ];
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (text) return text;
  }
  return "N";
};

const normalizeAssetLatLng = (asset: any | null | undefined) => {
  if (!asset) return null;

  const directLat = toFiniteNumber(
  asset?.lat
    ?? asset?.latitude
    ?? asset?.telemetryLatest?.lat
    ?? asset?.telemetryLatest?.latitude
    ?? asset?.latest?.lat
    ?? asset?.latest?.latitude
    ?? asset?.data?.lat
    ?? asset?.data?.latitude
);

const directLng = toFiniteNumber(
  asset?.lng
    ?? asset?.lon
    ?? asset?.longitude
    ?? asset?.telemetryLatest?.lng
    ?? asset?.telemetryLatest?.lon
    ?? asset?.telemetryLatest?.longitude
    ?? asset?.latest?.lng
    ?? asset?.latest?.lon
    ?? asset?.latest?.longitude
    ?? asset?.data?.lng
    ?? asset?.data?.lon
    ?? asset?.data?.longitude
);
  if (typeof directLat === "number" && typeof directLng === "number") {
    return { lat: directLat, lng: directLng };
  }

  const parsedGps = parseGpsCoordinates(asset?.gps ?? asset?.lastGps ?? asset?.data?.gps);
  if (parsedGps) return parsedGps;
  return null;
};

const normalizeIgnitionLabel = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? "On" : "Off";
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  if (["true", "on", "1", "yes", "active"].includes(text)) return "On";
  if (["false", "off", "0", "no", "inactive"].includes(text)) return "Off";
  return String(value ?? "").trim();
};

const extractLiveIgnitionLabel = (payload: any): string => {
  const attrs = payload?.attributes ?? payload?.data?.attributes ?? payload?.position?.attributes;
  const fromProtocol = readTeltonikaIgnition(
    attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>) : undefined
  );
  if (typeof fromProtocol === "boolean") return fromProtocol ? "On" : "Off";
  return (
    normalizeIgnitionLabel(
      payload?.ignition ??
        readTraccarAttr(attrs, [TraccarPositionAttr.IGNITION]) ??
        payload?.attributes?.Ignition ??
        payload?.data?.ignition ??
        payload?.data?.attributes?.Ignition ??
        payload?.telemetryLatest?.ignition ??
        payload?.telemetryLatest?.io?.Ignition ??
        payload?.telemetryLatest?.io?.["Ignition"]
    ) || ""
  );
};

const extractLiveSatellites = (payload: any): string => {
  const attrs = payload?.attributes ?? payload?.data?.attributes ?? payload?.position?.attributes;
  const fromAttrs = readTraccarAttrNumber(attrs, TRACCAR_SATELLITE_ATTR_KEYS);
  if (typeof fromAttrs === "number") return String(fromAttrs);

  const sats =
    payload?.satellites ??
    payload?.satelliteCount ??
    payload?.sats ??
    payload?.sat ??
    payload?.data?.satellites ??
    payload?.data?.sat ??
    payload?.data?.satelliteCount ??
    payload?.data?.sats ??
    payload?.telemetryLatest?.satellites ??
    payload?.telemetryLatest?.io?.["Number of Satellites"] ??
    payload?.telemetryLatest?.io?.["Satellites"] ??
    payload?.telemetryLatest?.io?.["GNSS Satellites"] ??
    payload?.telemetryLatest?.io?.["GPS Satellites"] ??
    payload?.telemetryLatest?.io?.sat;
  const text = String(sats ?? "").trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return "";
  return text;
};

const extractSatelliteCount = (payload: any): number | undefined => {
  const parsed = toFiniteNumber(extractLiveSatellites(payload));
  return typeof parsed === "number" ? parsed : undefined;
};

const hasSatelliteLock = (payload: any): boolean => {
  const satellites = extractSatelliteCount(payload);
  if (typeof satellites !== "number") return false;
  return satellites >= MIN_SATELLITES_FOR_LOCK;
};

const formatLivePowerVoltage = (raw: unknown): string => {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const n = Number(text);
  if (!Number.isFinite(n)) return text;
  // Traccar/Teltonika often reports external power in millivolts.
  if (n >= 1000) return (n / 1000).toFixed(2);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

const extractLivePowerVoltage = (payload: any): string => {
  const attrs = payload?.attributes ?? payload?.data?.attributes ?? payload?.position?.attributes;
  const fromAttrs = readTraccarAttrNumber(attrs, TRACCAR_POWER_ATTR_KEYS);
  if (typeof fromAttrs === "number") return formatLivePowerVoltage(fromAttrs);

  const v =
    payload?.powerVoltage ??
    payload?.voltage ??
    payload?.power ??
    payload?.data?.powerVoltage ??
    payload?.data?.voltage ??
    payload?.data?.power ??
    payload?.telemetryLatest?.powerVoltage ??
    payload?.telemetryLatest?.io?.["Power Voltage"] ??
    payload?.telemetryLatest?.io?.["External Voltage"] ??
    payload?.telemetryLatest?.io?.["Voltage"] ??
    payload?.telemetryLatest?.io?.["Battery Voltage"];
  return formatLivePowerVoltage(v);
};

const coordTextPattern = /^-?\d+(?:\.\d+)?\s*°?\s*,\s*-?\d+(?:\.\d+)?\s*°?$/;

const formatCoordinateLabel = (lat: unknown, lng: unknown): string => {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return "";
  if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) return "";
  return `${parsedLat.toFixed(5)}, ${parsedLng.toFixed(5)}`;
};

const formatLocationWithCoords = (label: unknown, _lat?: number, _lng?: number): string => {
  const text = String(label ?? "").trim();
  const withoutTrailingCoords = text.replace(/\s*\(-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?\)\s*$/, "").trim();
  const looksLikeCoordsOnly = coordTextPattern.test(withoutTrailingCoords);
  const lowered = withoutTrailingCoords.toLowerCase();
  if (!withoutTrailingCoords || looksLikeCoordsOnly || lowered === "none" || lowered === "null" || lowered === "n/a") {
    return "Location unavailable";
  }
  return withoutTrailingCoords;
};

const hasRealLocationLabel = (value: unknown): boolean => {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const lowered = text.toLowerCase();
  if (
    lowered === "none" ||
    lowered === "null" ||
    lowered === "n/a" ||
    lowered === "location unavailable" ||
    lowered === "unknown" ||
    lowered === "resolving location..." ||
    lowered === "resolving from gps..."
  ) {
    return false;
  }
  // CMS 808 location codes are numeric (e.g. 3599200) — not place names.
  if (/^\d{3,}$/.test(text)) return false;
  return !coordTextPattern.test(text);
};

const pickBestLocationLabel = (...values: unknown[]): string => {
  for (const value of values) {
    const formatted = formatLocationWithCoords(value);
    if (hasRealLocationLabel(formatted)) return formatted;
  }
  return "Location unavailable";
};

const pickLocationForDisplay = (asset: Pick<AssetRow, "location" | "gps" | "lat" | "lng">): string => {
  const labeled = pickBestLocationLabel(asset.location);
  if (hasRealLocationLabel(labeled)) return labeled;
  const normalizedCoords = normalizeAssetLatLng(asset);
  if (normalizedCoords) {
    return formatCoordinateLabel(normalizedCoords.lat, normalizedCoords.lng) || "Location unavailable";
  }
  const gpsText = String(asset.gps ?? "").trim();
  if (coordTextPattern.test(gpsText)) return gpsText;
  if (hasRealLocationLabel(gpsText)) return gpsText;
  return "Location unavailable";
};

const getCachedReverseGeocodeLabel = (
  cache: Map<string, string> | null | undefined,
  lat: unknown,
  lng: unknown
): string => {
  if (!cache) return "";
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return "";
  return String(cache.get(buildReverseGeocodeKey(parsedLat, parsedLng)) ?? "").trim();
};

const resolveLiveLocationLabel = (
  primary: unknown,
  fallback: unknown,
  lat: unknown,
  lng: unknown,
  cache?: Map<string, string> | null
): string => {
  const cached = getCachedReverseGeocodeLabel(cache, lat, lng);
  const resolved = pickBestLocationLabel(primary, fallback, cached);
  return hasRealLocationLabel(resolved) ? resolved : "Location unavailable";
};

const loadReverseGeocodeCache = (): Map<string, string> => {
  if (typeof window === "undefined") return new Map<string, string>();
  try {
    const raw = window.localStorage.getItem(REVERSE_GEOCODE_STORAGE_KEY) ?? "";
    if (!raw) return new Map<string, string>();
    const parsed = JSON.parse(raw) as Record<string, string>;
    const entries = Object.entries(parsed ?? {}).filter(([, value]) => String(value ?? "").trim().length > 0);
    return new Map<string, string>(entries);
  } catch {
    return new Map<string, string>();
  }
};

const persistReverseGeocodeCache = (cache: Map<string, string>) => {
  if (typeof window === "undefined") return;
  try {
    const entries = Array.from(cache.entries()).slice(-1500);
    window.localStorage.setItem(REVERSE_GEOCODE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // ignore storage failures
  }
};

const buildReverseGeocodeKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

const mergeAssetRows = (current: AssetRow[], incoming: AssetRow[]): AssetRow[] => {
  const previousById = new Map(current.map((asset) => [String(asset.id ?? "").trim(), asset]));
  const previousByImei = new Map(
    current
      .filter((asset) => String(asset.imei ?? "").trim())
      .map((asset) => [String(asset.imei ?? "").trim(), asset])
  );

  return incoming.map((asset) => {
    const previous = previousById.get(String(asset.id ?? "").trim())
      ?? previousByImei.get(String(asset.imei ?? "").trim())
      ?? null;
    if (!previous) return asset;

    const incomingCoords = normalizeAssetLatLng(asset);
    const previousCoords = normalizeAssetLatLng(previous);
    const incomingAtMs = typeof asset.telemetryAtMs === "number" ? asset.telemetryAtMs : Number.NaN;
    const previousAtMs = typeof previous.telemetryAtMs === "number" ? previous.telemetryAtMs : Number.NaN;
    const preferPreviousCoords =
      typeof previousCoords?.lat === "number" &&
      typeof previousCoords?.lng === "number" &&
      Number.isFinite(previousAtMs) &&
      (!Number.isFinite(incomingAtMs) || previousAtMs > incomingAtMs);
    const lat = preferPreviousCoords
      ? previousCoords!.lat
      : (incomingCoords?.lat ?? previousCoords?.lat);
    const lng = preferPreviousCoords
      ? previousCoords!.lng
      : (incomingCoords?.lng ?? previousCoords?.lng);
    const location = pickBestLocationLabel(asset.location, previous.location);
    const gps = typeof lat === "number" && typeof lng === "number"
      ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      : String(asset.gps ?? "").trim() || previous.gps;
    const mergedTelemetryAtMs = Number.isFinite(incomingAtMs) && Number.isFinite(previousAtMs)
      ? Math.max(incomingAtMs, previousAtMs)
      : Number.isFinite(incomingAtMs)
        ? incomingAtMs
        : previousAtMs;
    const keepPreviousDisplay =
      Number.isFinite(previousAtMs) &&
      (!Number.isFinite(incomingAtMs) || previousAtMs >= incomingAtMs);

    const imei = String(asset.imei ?? previous.imei ?? "").trim();
    const mergedDescription = preferHumanAssetLabel(previous.assetDescription, asset.assetDescription, imei);
    const mergedRegistration = preferHumanAssetLabel(previous.registration, asset.registration, imei);
    const displayDescription =
      formatAssetDescription({
        assetDescription: mergedDescription,
        registration: mergedRegistration,
        imei,
        make: (asset as any).make ?? (previous as any).make
      }) ||
      mergedDescription ||
      mergedRegistration ||
      "Unnamed asset";

    // Live fields (position, speed, movement, status, last position) change only with a
    // newer *live* fix. The 20 s asset-list reload carries the stored record's older
    // speed, coordinates and server-time lastSeen; spreading those over every row made the
    // whole fleet go "stationary" and jump off the map until Traccar's fix caught up.
    const previousLiveAt = Number(previous.liveFixAtMs);
    const incomingLiveAt = Number(asset.liveFixAtMs);
    const keepLive =
      Number.isFinite(previousLiveAt)
      && !(Number.isFinite(incomingLiveAt) && incomingLiveAt > previousLiveAt);
    const liveFields = keepLive
      ? {
          lat: previous.lat,
          lng: previous.lng,
          gps: previous.gps,
          speed: previous.speed,
          speedKph: previous.speedKph,
          movement: previous.movement,
          heading: previous.heading,
          ignition: previous.ignition,
          status: previous.status,
          lastActive: previous.lastActive,
          lastPosition: previous.lastPosition,
          telemetryAtMs: previous.telemetryAtMs,
          liveFixAtMs: previous.liveFixAtMs,
          liveSource: previous.liveSource,
          lastSeen: (previous as any).lastSeen ?? (asset as any).lastSeen
        }
      : keepPreviousDisplay
        ? {
            speed: previous.speed,
            speedKph: previous.speedKph,
            movement: previous.movement,
            heading: previous.heading,
            ignition: previous.ignition,
            status: previous.status,
            lastSeen: (previous as any).lastSeen ?? (asset as any).lastSeen
          }
        : {};

    return {
      ...previous,
      ...asset,
      // Never let Traccar/live refreshes replace plate names with IMEI stubs or Make+Plate.
      assetDescription: displayDescription,
      registration: mergedRegistration || displayDescription,
      fleetNumber: String(asset.fleetNumber ?? "").trim() || previous.fleetNumber,
      driver: String(asset.driver ?? "").trim() || previous.driver,
      lat,
      lng,
      gps,
      lastActive: keepPreviousDisplay
        ? previous.lastActive
        : String(asset.lastActive ?? "").trim() || previous.lastActive,
      lastPosition: keepPreviousDisplay
        ? previous.lastPosition
        : String(asset.lastPosition ?? "").trim() || previous.lastPosition,
      telemetryAtMs: Number.isFinite(mergedTelemetryAtMs) ? mergedTelemetryAtMs : previous.telemetryAtMs,
      lastMoveAtMs: previous.lastMoveAtMs ?? asset.lastMoveAtMs,
      location,
      ...liveFields
    };
  });
};

const projectLatLng = (lat: number, lng: number, headingDeg: number, speedKmh: number, dtMs: number) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(speedKmh) || speedKmh <= 0 || dtMs <= 0) {
    return { lat, lng };
  }

  const earthRadiusKm = 6371;
  const distanceKm = speedKmh * (dtMs / 3_600_000);
  if (distanceKm <= 0) return { lat, lng };

  const theta = (headingDeg * Math.PI) / 180;
  const delta = distanceKm / earthRadiusKm;
  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lng * Math.PI) / 180;

  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
    Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
  );

  const nextLat = (phi2 * 180) / Math.PI;
  const nextLng = (((lambda2 * 180) / Math.PI + 540) % 360) - 180;
  return { lat: nextLat, lng: nextLng };
};

const telemetryQualityLabel = (input: { satellites?: unknown; speed?: unknown; movement?: unknown; ignition?: unknown }): string => {
  const satellites = Number(String(input.satellites ?? "").trim());
  const speed = Number(String(input.speed ?? "").trim());
  const movement = String(input.movement ?? "").trim().toLowerCase();
  const ignition = String(input.ignition ?? "").trim().toLowerCase();

  const moving = Number.isFinite(speed) && speed > 5;
  if (!Number.isFinite(satellites)) return "Unknown";
  if (satellites <= 3) return "Low (GPS weak)";
  if (satellites < MIN_SATELLITES_FOR_LOCK) return moving ? "Fair (not locked, drift possible)" : "Fair (not locked)";
  if (moving && satellites <= 8) return "Good (locked)";
  return "Good";
};

const formatAssetPopupHeading = (heading: unknown): string => {
  const headingText = String(heading ?? "").trim();
  if (!headingText) return "None";
  const headingDeg = headingToDegrees(headingText);
  const numeric = Number(headingText);
  if (Number.isFinite(numeric)) return `${headingDeg}° (${headingText})`;
  return `${headingDeg}° (${headingText})`;
};

const formatAssetPopupValue = (value: unknown, fallback: string): string => {
  const text = String(value ?? "").trim();
  if (!text || text === "—" || text.toLowerCase() === "location unavailable") return fallback;
  return text;
};

const formatDriverValue = (value: unknown): string => {
  const text = String(value ?? "").trim();
  const lower = text.toLowerCase();
  if (!text || lower === "-" || lower === "--" || lower === "—" || lower === "_" || lower === "n/a" || lower === "na" || lower === "none" || lower === "null" || lower === "undefined" || lower === "unknown") {
    return "No Driver";
  }
  return text;
};

/**
 * Opt-in diagnostics: localStorage "vivi.debug.liveStatus" = "1" logs every status or
 * position change on Live Tracking with the code path that made it ([vivi-live-status]).
 */
let lastRowWriter = "initial";
const noteRowWriter = (source: string) => {
  lastRowWriter = source;
};
const liveStatusTraceEnabled = () => {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("vivi.debug.liveStatus") === "1";
  } catch {
    return false;
  }
};

/** While a vehicle has a Traccar fix this recent, the telemetry stream does not override it. */
const TRACCAR_PRIMARY_WINDOW_MS = 10 * 60_000;

const parseTelemetryAtMs = (payload: any, fallback?: unknown): number => {
  const at =
    payload?.timestamp ??
    payload?.at ??
    payload?.lastSeen ??
    payload?.lastPosition ??
    payload?.data?.timestamp ??
    payload?.data?.at ??
    payload?.data?.lastSeen ??
    payload?.data?.lastPosition ??
    fallback ??
    "";
  const ms = parseTimestampMs(String(at ?? "").trim());
  return Number.isFinite(ms) ? ms : Date.now();
};

const isMovingTelemetryPayload = (payload: any): boolean => {
  const satellites = extractSatelliteCount(payload);
  if (typeof satellites === "number" && satellites < MIN_SATELLITES_FOR_LOCK) return false;

  const speedRaw =
    payload?.speed ??
    payload?.data?.speed ??
    payload?.telemetryLatest?.speed ??
    payload?.telemetryLatest?.io?.Speed ??
    payload?.telemetryLatest?.io?.["Speed"] ??
    0;
  const speed = Number(String(speedRaw ?? "").trim());
  return Number.isFinite(speed) && speed > 5;
};

const isIgnitionOnPayload = (payload: any): boolean => {
  const raw =
    payload?.ignition ??
    payload?.data?.ignition ??
    payload?.telemetryLatest?.ignition ??
    payload?.telemetryLatest?.io?.Ignition ??
    payload?.telemetryLatest?.io?.["Ignition"] ??
    payload?.io?.Ignition;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw > 0;
  const text = String(raw ?? "").trim().toLowerCase();
  return ["true", "on", "1", "yes", "active"].includes(text);
};

const buildMovingTrailFromSamples = (samples: TrailSample[]): TrailPoint[] => {
  const ordered = [...samples].sort((a, b) => a.atMs - b.atMs);
  const out: TrailPoint[] = [];
  let lastPlottedAt = Number.NEGATIVE_INFINITY;
  for (const sample of ordered) {
    if (!sample.moving) continue;
    if (!Number.isFinite(sample.atMs)) continue;
    if (sample.atMs - lastPlottedAt < TRAIL_POINT_INTERVAL_MS) continue;
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.lat - sample.lat) < 0.000001 && Math.abs(prev.lng - sample.lng) < 0.000001) continue;
    out.push({
      lat: sample.lat,
      lng: sample.lng,
      atMs: sample.atMs,
      speedKph: sample.speedKph,
      driver: sample.driver,
      location: sample.location
    });
    lastPlottedAt = sample.atMs;
  }
  return out;
};

const buildTripStartFlagsFromSamples = (samples: TrailSample[]): TrailPoint[] => {
  const ordered = [...samples].sort((a, b) => a.atMs - b.atMs);
  const out: TrailPoint[] = [];
  const pushFlag = (sample: TrailSample) => {
    const last = out[out.length - 1];
    if (
      last
      && Math.abs(last.lat - sample.lat) < 0.00005
      && Math.abs(last.lng - sample.lng) < 0.00005
      && Math.abs(last.atMs - sample.atMs) < 60_000
    ) {
      return;
    }
    out.push({
      lat: sample.lat,
      lng: sample.lng,
      atMs: sample.atMs,
      speedKph: sample.speedKph,
      driver: sample.driver,
      location: sample.location
    });
  };
  let prevIgnitionOn = false;
  let inMotion = false;
  let lastMovingMs = Number.NaN;
  let lastSampleMs = Number.NaN;
  const parkMs = 5 * 60 * 1000;
  const gapMsLimit = 20 * 60 * 1000;
  for (const sample of ordered) {
    const moving = Boolean(sample.moving) || (Number(sample.speedKph) || 0) > 1;
    const gapMs = Number.isFinite(lastSampleMs) ? sample.atMs - lastSampleMs : Number.POSITIVE_INFINITY;
    if (sample.ignitionOn && !prevIgnitionOn) pushFlag(sample);
    if (moving) {
      if (!inMotion || gapMs > gapMsLimit) pushFlag(sample);
      inMotion = true;
      lastMovingMs = sample.atMs;
    } else if (inMotion && Number.isFinite(lastMovingMs) && sample.atMs - lastMovingMs > parkMs) {
      inMotion = false;
    }
    if (gapMs > gapMsLimit) inMotion = moving;
    prevIgnitionOn = Boolean(sample.ignitionOn);
    lastSampleMs = sample.atMs;
  }
  return out;
};

const getNetworkStatus = (asset: AssetRow) => {
  if (asset.status === "offline") return "offline";
  if (asset.status === "stale") return "stale";
  if (asset.status === "warning") return "parked";
  return "live";
};

const buildAssetIcon = (
  asset: AssetRow,
  options?: {
    showDirectionArrow?: boolean;
    headingDeg?: number;
    status?: "online" | "warning" | "stale" | "offline";
  }
) => {
  const dir = normalizeDegrees(options?.headingDeg ?? headingToDegrees(asset.heading));
  const showDirectionArrow = options?.showDirectionArrow ?? false;
  const status = String(options?.status ?? resolveAssetDotStatus(asset as any) ?? asset.status ?? "").toLowerCase();

  let borderColor = "#16a34a";
  let beakColor = "#16a34a";
  let statusDot = "#16a34a";
  if (status === "warning") {
    borderColor = "#94a3b8";
    beakColor = "#94a3b8";
    statusDot = "#94a3b8";
  } else if (status === "stale") {
    borderColor = "#d4b896";
    beakColor = "#d4b896";
    statusDot = "#d4b896";
  } else if (status === "offline") {
    borderColor = "#800000";
    beakColor = "#800000";
    statusDot = "#800000";
  }

  const directionSvg = showDirectionArrow
    ? `<g transform='rotate(${dir},28,28)'>
        <path d='M28 2.5 L33 13.5 L23 13.5 Z' fill='${beakColor}' stroke='#ffffff' stroke-width='1.4' stroke-linejoin='round'/>
      </g>`
    : "";

  const statusDotSvg = showDirectionArrow
    ? ""
    : `<circle cx='13' cy='42' r='5.2' fill='${statusDot}' stroke='#ffffff' stroke-width='2'/>`;

  const svg = `<svg width='56' height='56' viewBox='0 0 56 56' xmlns='http://www.w3.org/2000/svg'>
      <defs>
        <filter id='shadow' x='-40%' y='-40%' width='180%' height='180%'>
          <feDropShadow dx='0' dy='2' stdDeviation='1.8' flood-color='rgba(15,23,42,0.32)'/>
        </filter>
      </defs>
      <g filter='url(#shadow)'>
        <circle cx='28' cy='28' r='18' fill='#ffffff' stroke='${borderColor}' stroke-width='3'/>
        <g transform='translate(15.5,18.5)'>
          <rect x='1' y='7.5' width='11.5' height='5.8' rx='1.4' fill='#2563eb' stroke='#1d4ed8' stroke-width='1'/>
          <path d='M12.5 8h4.8l2.2 3v2.8h-9z' fill='#3b82f6' stroke='#1d4ed8' stroke-width='1' stroke-linejoin='round'/>
          <circle cx='4.2' cy='15.2' r='2.1' fill='#1e40af'/>
          <circle cx='16.8' cy='15.2' r='2.1' fill='#1e40af'/>
          <path d='M2 6.8V5.2h5.4V6.8' fill='none' stroke='#1d4ed8' stroke-width='1.3' stroke-linecap='round'/>
        </g>
        ${statusDotSvg}
      </g>
      ${directionSvg}
    </svg>`;

  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    popupAnchor: [0, -24]
  });
};

const defaultVisible = new Set<ColumnKey>([
  "assetDescription",
  "assetId",
  "site",
  "database",
  "location",
  "registration"
]);

const defaultColumnOrder: ColumnKey[] = [
  "assetDescription",
  "assetIcon",
  "assetId",
  "database",
  "driver",
  "driverIdentified",
  "fuelReading",
  "fleetNumber",
  "gps",
  "heading",
  "ignition",
  "lastNotification",
  "lastNotificationValue",
  "location",
  "mobileDeviceType",
  "registration",
  "site",
  "speed",
  "timeInIgnition"
];

const STATIC_LOCATIONS: LocationRow[] = locationLibraryRows.map((row, index) => ({
  id: `loc-lib-${index + 1}`,
  name: row.name,
  site: row.site ?? "All sites",
  locationType: row.type
}));

const mapGeofenceFromLibrary = (geofence: {
  id?: string;
  traccarId?: number;
  name?: string;
  type?: string;
  site?: string;
  area?: string;
  shape?: LocationShape;
  attributes?: Record<string, unknown>;
  color?: string;
}): LocationRow => {
  const shape = geofence.shape ?? (geofence.area ? parseTraccarAreaToShape(geofence.area) : null);
  const circle = shape?.type === "circle" ? shape : null;
  return {
    id: String(geofence.traccarId ?? geofence.id),
    name: String(geofence.name ?? "Location"),
    site: String(geofence.site ?? "All sites"),
    locationType: String(geofence.type ?? "Geofence"),
    lat: circle?.center.lat,
    lng: circle?.center.lng,
    radius: circle?.radius,
    shape: shape ?? undefined,
    area: geofence.area,
    color: String(geofence.attributes?.color ?? geofence.color ?? "#0ea5e9")
  };
};

const renderSelectedGeofenceShape = (loc: LocationRow) => {
  const color = loc.color ?? "#0ea5e9";
  const pathOptions = {
    color,
    fillColor: color,
    fillOpacity: 0.18,
    weight: 2,
    opacity: 0.9
  };
  const shape = loc.shape ?? (loc.area ? parseTraccarAreaToShape(loc.area) : null);
  if (!shape) {
    if (loc.lat === undefined || loc.lng === undefined) return null;
    return (
      <>
        <CircleMarker center={[loc.lat, loc.lng]} radius={7} pathOptions={{ ...pathOptions, fillOpacity: 0.85 }} />
        {loc.radius && loc.radius > 0 ? (
          <Circle center={[loc.lat, loc.lng]} radius={loc.radius} pathOptions={pathOptions} />
        ) : null}
      </>
    );
  }
  if (shape.type === "circle") {
    return <Circle center={[shape.center.lat, shape.center.lng]} radius={shape.radius} pathOptions={pathOptions} />;
  }
  if (shape.type === "rectangle") {
    return (
      <Rectangle
        bounds={shape.points.map((point) => [point.lat, point.lng]) as [[number, number], [number, number]]}
        pathOptions={pathOptions}
      />
    );
  }
  if (shape.type === "polygon") {
    return (
      <Polygon
        positions={shape.points.map((point) => [point.lat, point.lng]) as [number, number][]}
        pathOptions={pathOptions}
      />
    );
  }
  return (
    <Polyline
      positions={shape.points.map((point) => [point.lat, point.lng]) as [number, number][]}
      pathOptions={{ ...pathOptions, fillOpacity: 0 }}
    />
  );
};

const isCompactLiveViewport = () => {
  if (typeof window === "undefined") return false;
  return isLikelyNativeShell() || shouldUsePhoneMode() || isTabletDevice() || window.innerWidth <= 1000;
};

const fuelAnalysisLocalInput = (ms: number) => {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function LiveTracking() {
  const canUseFuelAnalysis = isOwnSupportPrincipal();
  const navigate = useNavigate();
  const location = useLocation();
  const fleetFilter = useFleetFilterOptional();
  const [siteTimeZones, setSiteTimeZones] = useState<SiteTimeZoneSettings | null>(null);
  const siteTimeZonesRef = useRef<SiteTimeZoneSettings | null>(null);
  const [wsLiveOpen, setWsLiveOpen] = useState(false);
  const [columnGuideOffsets, setColumnGuideOffsets] = useState<number[]>([]);
  const [columnGuideHeight, setColumnGuideHeight] = useState(0);
  const [columnGuideWidth, setColumnGuideWidth] = useState(0);
  const [showColumns, setShowColumns] = useState(false);
  const [openActions, setOpenActions] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; bottom: number; left: number } | null>(null);
  const [menuPlacement, setMenuPlacement] = useState<"up" | "down">("down");
  const [menuLeft, setMenuLeft] = useState<number | null>(null);
  const [menuTop, setMenuTop] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(defaultVisible);
  const [sidebarWidth, setSidebarWidth] = useState<number>(420);
  const [isCompactLiveLayout, setIsCompactLiveLayout] = useState(() => isCompactLiveViewport());
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isCompactLiveViewport());
  const [dragging, setDragging] = useState(false);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(defaultColumnOrder);
  const [dragCol, setDragCol] = useState<ColumnKey | null>(null);
  const [showFuelAnalysisModal, setShowFuelAnalysisModal] = useState(false);
  const [fuelAnalysisRows, setFuelAnalysisRows] = useState<FuelAnalysisRow[]>([]);
  const [fuelAnalysisStatus, setFuelAnalysisStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [fuelAnalysisSite, setFuelAnalysisSite] = useState("all");
  const [fuelAnalysisAssetId, setFuelAnalysisAssetId] = useState("all");
  const [fuelAnalysisFrom, setFuelAnalysisFrom] = useState(() => fuelAnalysisLocalInput(Date.now() - 15 * 60 * 1000));
  const [fuelAnalysisTo, setFuelAnalysisTo] = useState(() => fuelAnalysisLocalInput(Date.now()));
  const [fuelPickerTarget, setFuelPickerTarget] = useState<"from" | "to" | null>(null);
  const [fuelPickerDate, setFuelPickerDate] = useState(() => new Date());
  const [fuelPickerTime, setFuelPickerTime] = useState("00:00");
  const [fuelPickerMode, setFuelPickerMode] = useState<"date" | "time">("date");
  const [showLocationsModal, setShowLocationsModal] = useState(false);
  const [locationFilter, setLocationFilter] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const parsed = readUserScopedJson<string[]>("vivi.liveTracking.selectedLocations") ?? [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [eventFilter, setEventFilter] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const parsed = readUserScopedJson<string[]>("vivi.liveTracking.selectedEvents") ?? [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });
  const [showAssetsModal, setShowAssetsModal] = useState(false);
  const [assetsFilter, setAssetsFilter] = useState("");
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [locations, setLocations] = useState<LocationRow[]>(STATIC_LOCATIONS);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [activeDrawTool, setActiveDrawTool] = useState<GeoShape["type"] | null>(null);
  const [shapes, setShapes] = useState<GeoShape[]>([]);
  const [drawingShape, setDrawingShape] = useState<GeoShape | null>(null);
  const [polyPoints, setPolyPoints] = useState<{ lat: number; lng: number }[]>([]);
  const [dragPoint, setDragPoint] = useState<DragPoint | null>(null);
  const [showMapLayers, setShowMapLayers] = useState(false);
  const [showCreateLocationTools, setShowCreateLocationTools] = useState(false);
  const [customLocations, setCustomLocations] = useState<LocationRow[]>([]);
  const customLocationsHydratedRef = useRef(false);
  const customLocationsLoadGenerationRef = useRef(0);
  const [draftLocation, setDraftLocation] = useState<{
    name: string;
    site: string;
    locationType: string;
    radius: number;
    lat?: number;
    lng?: number;
  }>({
    name: "",
    site: "All sites",
    locationType: "Customer",
    radius: 250
  });
  const [selectedStreetView, setSelectedStreetView] = useState<{ lat: number; lng: number; heading: string } | null>(
    null
  );
  // Asset currently shown in the Street View panel; used to follow its live position.
  const [streetViewAssetId, setStreetViewAssetId] = useState<string | null>(null);

  const [showFuelModal, setShowFuelModal] = useState(false);
  const [fuelModalAsset, setFuelModalAsset] = useState<AssetRow | null>(null);
  const [fuelModalStatus, setFuelModalStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [fuelRawTrendPoints, setFuelRawTrendPoints] = useState<FuelTrendPoint[]>([]);
  const [fuelCleanTrendPoints, setFuelCleanTrendPoints] = useState<FuelTrendPoint[]>([]);
  const [fuelSmoothedChangePoints, setFuelSmoothedChangePoints] = useState<FuelChangePoint[]>([]);
  const [fuelShowRawReadings, setFuelShowRawReadings] = useState(false);
  const [fuelTankCapacityL, setFuelTankCapacityL] = useState<number | null>(null);
  const [fuelGeneratedAtMs, setFuelGeneratedAtMs] = useState(() => Date.now());
  const [fuelTimeRange, setFuelTimeRange] = useState<FuelTachoTimeRange>("12h");
  const [showFuelTimeRangeMenu, setShowFuelTimeRangeMenu] = useState(false);
  const [fuelHoverIndex, setFuelHoverIndex] = useState<number | null>(null);
  const [fuelEventDetailKind, setFuelEventDetailKind] = useState<"refill" | "drain" | "last-refill" | null>(null);
  const [fuelLastRefill, setFuelLastRefill] = useState<FuelChangePoint | null>(null);
  const [fuelLastRefillStatus, setFuelLastRefillStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [fuelLastRefillError, setFuelLastRefillError] = useState("");
  const [fuelModalError, setFuelModalError] = useState<string>("");
  const [fuelRouteDistanceKm, setFuelRouteDistanceKm] = useState(0);
  const [fuelIgnitionUsedL, setFuelIgnitionUsedL] = useState<number | null>(null);
  const [fuelRange, setFuelRange] = useState<{ fromMs: number; toMs: number }>(() => {
    const { fromMs, toMs } = resolveFuelTachoRange("12h");
    return { fromMs, toMs };
  });
  const traccarDeviceByUniqueIdRef = useRef<Map<string, number>>(new Map());
  const traccarFuelConfigByDeviceIdRef = useRef<Map<number, DeviceFuelConfig | null>>(new Map());
  const bindingFuelCacheRef = useRef<{ loadedAt: number; byKey: Map<string, DeviceFuelConfig | null> }>({
    loadedAt: 0,
    byKey: new Map()
  });
  const assetRowsRef = useRef<AssetRow[]>([]);
  const liveStatusTraceRef = useRef(new Map<string, { status: string; lat: number; lng: number }>());
  const selectedAssetsRef = useRef<Set<string>>(new Set());
  const traccarBaseUrlRef = useRef<string>("");
  const fuelChartSvgRef = useRef<SVGSVGElement | null>(null);
  const fuelTimeRangeMenuRef = useRef<HTMLDivElement | null>(null);
  /** Cancel token for the in-flight fuel load (survives HMR better than a numeric seq). */
  const fuelActiveLoadRef = useRef<{ cancelled: boolean } | null>(null);

  const fuelTrendPoints = useMemo(
    () => (fuelShowRawReadings ? fuelRawTrendPoints : fuelCleanTrendPoints),
    [fuelShowRawReadings, fuelRawTrendPoints, fuelCleanTrendPoints]
  );
  const fuelChangePoints = fuelSmoothedChangePoints;
  const fuelRefillEvents = useMemo(
    () => fuelChangePoints.filter((event) => event.rising),
    [fuelChangePoints]
  );
  const fuelDrainEvents = useMemo(
    () => fuelChangePoints.filter((event) => !event.rising),
    [fuelChangePoints]
  );
  const lastRefillInWindow = useMemo(() => {
    if (!fuelRefillEvents.length) return null;
    return fuelRefillEvents.reduce((latest, event) => (event.atMs > latest.atMs ? event : latest));
  }, [fuelRefillEvents]);
  const fuelEventDetails =
    fuelEventDetailKind === "refill"
      ? fuelRefillEvents
      : fuelEventDetailKind === "drain"
        ? fuelDrainEvents
        : fuelEventDetailKind === "last-refill" && fuelLastRefill
          ? [fuelLastRefill]
          : [];
  const fuelTimeRangeLabel = useMemo(
    () => FUEL_TACHO_TIME_RANGE_OPTIONS.find((option) => option.id === fuelTimeRange)?.label ?? "12 Hours",
    [fuelTimeRange]
  );
  const fuelChartSpanLabel = useMemo(() => resolveFuelTachoRange(fuelTimeRange).label, [fuelTimeRange]);
  const fuelTachoStats = useMemo(() => {
    const raw = fuelRawTrendPoints;
    const line = fuelCleanTrendPoints.length ? fuelCleanTrendPoints : raw;
    if (raw.length === 0 && line.length === 0) return null;
    const source = line.length >= 2 ? line : raw;
    // Each ignition cycle: level 5s after key-on → key-off, with mid-run refills added back.
    // The raw falling-run sum counts sender slosh and is not used when ignition is known.
    const fuelUsedL = fuelIgnitionUsedL != null
      ? fuelIgnitionUsedL
      : computePeriodConsumedFuelLitres({
        trendPoints: source,
        refillEvents: fuelRefillEvents,
        drainEvents: fuelDrainEvents
      });
    const refillL = fuelRefillEvents.reduce((sum, event) => sum + Math.abs(event.deltaLiters), 0);
    const drainL = fuelDrainEvents.reduce((sum, event) => sum + Math.abs(event.deltaLiters), 0);
    const currentFuelL = Number.isFinite(line[line.length - 1]?.liters)
      ? line[line.length - 1].liters
      : Number(source[source.length - 1]?.liters ?? 0);
    const consumptionKmPerL =
      fuelUsedL > 0 && fuelRouteDistanceKm > 0 ? fuelRouteDistanceKm / fuelUsedL : 0;
    return {
      totalDistanceKm: fuelRouteDistanceKm,
      currentFuelL: Math.round(currentFuelL * 100) / 100,
      fuelUsedL,
      refillL: Math.round(refillL * 100) / 100,
      drainL: Math.round(drainL * 100) / 100,
      consumptionKmPerL
    };
  }, [fuelCleanTrendPoints, fuelRawTrendPoints, fuelRefillEvents, fuelDrainEvents, fuelRouteDistanceKm, fuelIgnitionUsedL]);

  const [lockedAssetId, setLockedAssetId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem("vivi.lockedAsset");
    } catch {
      return null;
    }
  });
  const [trailAssetId, setTrailAssetId] = useState<string | null>(null);
  const [trailLoadingAssetId, setTrailLoadingAssetId] = useState<string | null>(null);
  // Device Health: live raw telemetry for one device. Platform Admin and Own Support only
  // (the server enforces the same rule on /api/device-health).
  const canViewDeviceHealth = isOwnSupportPrincipal();
  const [deviceHealthAsset, setDeviceHealthAsset] = useState<AssetRow | null>(null);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [diagnosticsAsset, setDiagnosticsAsset] = useState<AssetRow | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState({
    assetDetails: true,
    mobileDevice: true,
    telemetry: false,
    tripInfo: true,
    latestPosition: true,
    inputStatus: true
  });
  const [diagnosticsTelemetry, setDiagnosticsTelemetry] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    imei?: string;
    error?: string;
    body?: TelemetryLookupResponse | null;
    fetchedAt?: string;
    pollMs?: number;
    nextPollAt?: string;
  }>({ status: "idle" });
  const [diagnosticsInputStatus, setDiagnosticsInputStatus] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    error?: string;
    inputs: GpsIotAssetInput[];
  }>({ status: "idle", inputs: [] });

  const refreshDiagnosticsInputStatus = async (asset: AssetRow) => {
    if (!isGpsIotServer()) {
      setDiagnosticsInputStatus({ status: "idle", inputs: [] });
      return;
    }
    setDiagnosticsInputStatus((prev) => ({ ...prev, status: "loading", error: undefined }));
    try {
      const result = await getGpsIotAssetInputStatus({
        assetId: resolveGpsIotFuelAssetId(asset),
        imei: deriveImeiFromAsset(asset) || String(asset.imei ?? "").trim(),
        assetName: String(asset.assetDescription ?? asset.name ?? "").trim(),
        registration: String(asset.registration ?? "").trim(),
        site: String(asset.site ?? "").trim() || undefined
      });
      setDiagnosticsInputStatus({
        status: "ready",
        inputs: sortGpsIotInputs(Array.isArray(result.inputs) ? result.inputs : [])
      });
    } catch (error: any) {
      setDiagnosticsInputStatus({
        status: "error",
        error: String(error?.message ?? "Input status unavailable"),
        inputs: []
      });
    }
  };

  const refreshDiagnosticsTelemetry = async (asset: AssetRow) => {
    const imei = deriveImeiFromAsset(asset);
    if (!imei) {
      setDiagnosticsTelemetry({ status: "error", error: "No valid IMEI found for this asset. Telemetry requires a 15-digit IMEI." });
      return;
    }

    setDiagnosticsTelemetry((prev) => ({ ...prev, status: "loading", imei, error: undefined }));
    const result = await telemetryLookupByImeiDetailed(imei, { refreshLive: true });
    if (!result.ok) {
      setDiagnosticsTelemetry({
        status: "error",
        imei,
        error: result.error ?? "Telemetry lookup failed"
      });
      return;
    }

    const body = result.body ?? null;
    const pollMs = telemetryPollIntervalMs(body?.latest);
    setDiagnosticsTelemetry({
      status: "ready",
      imei,
      body,
      fetchedAt: new Date().toISOString(),
      pollMs,
      nextPollAt: new Date(Date.now() + pollMs).toISOString()
    });

    // Opportunistically update the live asset row so the map/table reflects the latest even if SSE is unavailable.
    if (body?.latest) {
      const lastSeen = body.latest.at ?? "";
      const speed = body.latest.speed ?? undefined;
      noteRowWriter("diagnostics");
      setAssetRows((prev) => {
        const next = prev.map((r) => ({ ...r }));
        const idx = next.findIndex((r) => String(r.imei ?? "").trim() === imei);
        if (idx < 0) return prev;
        if (typeof body.latest?.lat === "number" && typeof body.latest?.lng === "number") {
          next[idx].lat = body.latest?.lat;
          next[idx].lng = body.latest?.lng;
          next[idx].location = resolveLiveLocationLabel(
            (body.latest as any)?.locationName ?? next[idx].location,
            next[idx].location,
            body.latest?.lat,
            body.latest?.lng,
            reverseGeocodeCacheRef.current
          );
        }
        if (speed !== undefined && speed !== null) next[idx].speed = String(speed);
        const incomingAtMs = parseTimestampMs(String(lastSeen ?? "").trim());
        const lastMoveAtMs = resolveLastMoveAtMs({
          previousLastMoveAtMs: next[idx].lastMoveAtMs,
          atMs: Number.isFinite(incomingAtMs) ? incomingAtMs : Date.now(),
          speed: speed ?? next[idx].speed,
          movement: body.latest?.movement,
          previousLat: next[idx].lat,
          previousLng: next[idx].lng,
          lat: body.latest?.lat,
          lng: body.latest?.lng
        });
        next[idx].lastMoveAtMs = lastMoveAtMs;
        if (lastSeen) {
          const ts = formatTimestampForSite(lastSeen, next[idx].site, siteTimeZones);
          next[idx].lastActive = ts;
          next[idx].lastPosition = ts;
        }
        next[idx].status = computeStatus({
          ...next[idx],
          status: next[idx].availabilityStatus,
          lastSeen,
          lastPosition: lastSeen,
          lastTrip: "",
          speed: speed ?? next[idx].speed,
          movement: body.latest?.movement,
          lat: body.latest?.lat,
          lng: body.latest?.lng,
          lastMoveAtMs,
          telemetryAtMs: Number.isFinite(incomingAtMs) ? incomingAtMs : next[idx].telemetryAtMs
        });
        return next;
      });
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadTimeZones = async () => {
      const tz = await getSiteTimeZoneSettings();
      if (mounted) {
        siteTimeZonesRef.current = tz;
        setSiteTimeZones(tz);
      }
    };
    const handleTimeZoneUpdate = (event: Event) => {
      const detail = (event as CustomEvent<SiteTimeZoneSettings | null>)?.detail;
      if (detail && typeof detail === "object") {
        siteTimeZonesRef.current = detail;
        setSiteTimeZones(detail);
        return;
      }
      void loadTimeZones();
    };
    void loadTimeZones();
    window.addEventListener(SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT, handleTimeZoneUpdate as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener(SITE_TIME_ZONE_SETTINGS_UPDATED_EVENT, handleTimeZoneUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!showDiagnosticsModal) return;
    if (!diagnosticsAsset) return;
    if (!diagnosticsOpen.telemetry) return;
    const imei = String(diagnosticsAsset.imei ?? "").trim();
    if (!imei) return;

    let cancelled = false;
    let timer: number | null = null;

    const schedule = (ms: number) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        await refreshDiagnosticsTelemetry(diagnosticsAsset);
      }, ms);
    };

    // Fetch immediately if we don't have a ready snapshot for this IMEI.
    if (diagnosticsTelemetry.status !== "ready" || diagnosticsTelemetry.imei !== imei) {
      void refreshDiagnosticsTelemetry(diagnosticsAsset);
    } else {
      schedule(diagnosticsTelemetry.pollMs ?? 30_000);
    }

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [showDiagnosticsModal, diagnosticsAsset, diagnosticsOpen.telemetry, diagnosticsTelemetry.status, diagnosticsTelemetry.imei, diagnosticsTelemetry.pollMs]);

  useEffect(() => {
    if (!showDiagnosticsModal || !diagnosticsAsset) return;
    if (!isGpsIotServer()) return;
    if (!diagnosticsOpen.inputStatus) return;
    if (diagnosticsInputStatus.status === "ready" || diagnosticsInputStatus.status === "loading") return;
    void refreshDiagnosticsInputStatus(diagnosticsAsset);
  }, [showDiagnosticsModal, diagnosticsAsset, diagnosticsOpen.inputStatus, diagnosticsInputStatus.status]);

  const [showShareLiveModal, setShowShareLiveModal] = useState(false);
  const [shareLiveAsset, setShareLiveAsset] = useState<AssetRow | null>(null);
  const [shareLiveEmail, setShareLiveEmail] = useState("");
  const [shareLiveLink, setShareLiveLink] = useState("");
  const [shareLiveExpiresAt, setShareLiveExpiresAt] = useState("");
  const [shareLiveSending, setShareLiveSending] = useState(false);
  const [shareLiveStatus, setShareLiveStatus] = useState("");
  const [liveShareByAssetId, setLiveShareByAssetId] = useState<Record<string, { active: boolean; expiresAt?: string }>>({});
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAsset, setRequestAsset] = useState<AssetRow | null>(null);
  const [requestMode, setRequestMode] = useState<"GPRS" | "Data call">("GPRS");
  const [showImmobilizerModal, setShowImmobilizerModal] = useState(false);
  const [immobilizerAsset, setImmobilizerAsset] = useState<AssetRow | null>(null);
  const [immobilizerAction, setImmobilizerAction] = useState<ImmobilizerAction | "">("");
  const [immobilizerBusy, setImmobilizerBusy] = useState(false);
  const [immobilizerStatus, setImmobilizerStatus] = useState("");
  const [showAssetDetailsModal, setShowAssetDetailsModal] = useState(false);
  const [detailsAsset, setDetailsAsset] = useState<AssetRow | null>(null);
  const [measureMode, setMeasureMode] = useState<"distance" | null>(null);
  const [showMapToolsPanel, setShowMapToolsPanel] = useState(false);
  const [measureHint, setMeasureHint] = useState("Press at point A, drag to point B, then release.");
  const [measureLine, setMeasureLine] = useState<{ start: DrawPoint; end: DrawPoint } | null>(null);
  const [measureMeters, setMeasureMeters] = useState<number | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureStart, setMeasureStart] = useState<DrawPoint | null>(null);
  const [measureAnchor, setMeasureAnchor] = useState<{ start: DrawPoint; end: DrawPoint } | null>(null);
  const [routeLatLngs, setRouteLatLngs] = useState<Array<{ lat: number; lng: number }> | null>(null);
  const [routePixels, setRoutePixels] = useState<DrawPoint[] | null>(null);
  const [routeStatus, setRouteStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const [showMapRotate, setShowMapRotate] = useState(false);
  const [mapRotation, setMapRotation] = useState(0);
  const [queryMode, setQueryMode] = useState(false);
  const [queryCursor, setQueryCursor] = useState<DrawPoint | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<{
    point: DrawPoint;
    name: string;
    speed: string;
  } | null>(null);
  const [mapLayer, setMapLayer] = useState("roadmap");
  const googleMapsKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const [mapLayers, setMapLayers] = useState(() => {
    const defaults = {
      clustering: true,
      eventsOnTrail: false,
      locationLabels: true,
      showEntireLastTrip: false,
      hours: "48"
    };
    if (typeof window === "undefined") return defaults;
    try {
      const parsed = readUserScopedJson<Partial<typeof defaults>>("vivi.liveTracking.mapLayers");
      if (!parsed || typeof parsed !== "object") return defaults;
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });
  const tableRef = useRef<HTMLDivElement | null>(null);
  const tableHeadRef = useRef<HTMLDivElement | null>(null);
  const tableBodyRef = useRef<HTMLDivElement | null>(null);
  const hScrollRef = useRef<HTMLDivElement | null>(null);
  const hScrollInnerRef = useRef<HTMLDivElement | null>(null);
  const mapDrawRef = useRef<HTMLDivElement | null>(null);
  const drawStartRef = useRef<DrawPoint | null>(null);
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const mapLayerSelectRef = useRef<HTMLSelectElement | null>(null);
  const [mapRef, setMapRef] = useState<L.Map | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  // Stable callback for CaptureMapInstance — never setState when the Leaflet instance is unchanged.
  const handleMapRef = useCallback((map: L.Map | null) => {
    if (map === mapInstanceRef.current) return;
    mapInstanceRef.current = map;
    setMapRef(map);
  }, []);
  const measureLineRef = useRef<{ start: DrawPoint; end: DrawPoint } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let resizeTimer: number | null = null;
    const syncCompactLayout = () => {
      const compact = isCompactLiveViewport();
      setIsCompactLiveLayout((prev) => (prev === compact ? prev : compact));
      setIsSidebarOpen((current) => (compact ? current : true));
    };
    const onResize = () => {
      // Windows fires many resize events (DPI / desktop-scale); debounce to avoid update storms.
      if (resizeTimer != null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(syncCompactLayout, 100);
    };
    syncCompactLayout();
    window.addEventListener("resize", onResize);
    return () => {
      if (resizeTimer != null) window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!isCompactLiveLayout || !isSidebarOpen || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSidebarOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCompactLiveLayout, isSidebarOpen]);

  useEffect(() => {
    if (isCompactLiveLayout && !isSidebarOpen) {
      setShowColumns(false);
      setOpenActions(null);
    }
  }, [isCompactLiveLayout, isSidebarOpen]);

  useEffect(() => {
    const openLocations = () => setShowLocationsModal(true);
    const openEvents = () => setShowEventsModal(true);
    const openFuelAnalysis = () => {
      if (canUseFuelAnalysis) setShowFuelAnalysisModal(true);
    };
    window.addEventListener("vivi.liveTracking.openLocations", openLocations);
    window.addEventListener("vivi.liveTracking.openEvents", openEvents);
    window.addEventListener("vivi.liveTracking.openFuelAnalysis", openFuelAnalysis);
    return () => {
      window.removeEventListener("vivi.liveTracking.openLocations", openLocations);
      window.removeEventListener("vivi.liveTracking.openEvents", openEvents);
      window.removeEventListener("vivi.liveTracking.openFuelAnalysis", openFuelAnalysis);
    };
  }, [canUseFuelAnalysis]);

  // Load live Traccar geofences and merge with static library
  useEffect(() => {
    let cancelled = false;
    const loadGeofences = async () => {
      try {
        const geofences = await loadLocationGeofences();
        if (cancelled) return;
        const traccarRows = geofences.map(mapGeofenceFromLibrary);
        const existingNames = new Set(STATIC_LOCATIONS.map((l) => l.name.toLowerCase()));
        setLocations((prev) => {
          const customByName = new Map(
            [...prev, ...customLocations]
              .filter((row) => row.lat !== undefined || row.shape || row.area)
              .map((row) => [row.name.toLowerCase(), row])
          );
          const merged = [...STATIC_LOCATIONS];
          for (const row of traccarRows) {
            if (existingNames.has(row.name.toLowerCase())) continue;
            const custom = customByName.get(row.name.toLowerCase());
            merged.push(custom ? { ...row, ...custom, id: row.id, shape: row.shape ?? custom.shape, area: row.area ?? custom.area } : row);
          }
          return merged;
        });
      } catch {
        // ignore geofence load failures
      }
    };
    void loadGeofences();
    const handleLocationsChange = () => {
      void loadGeofences();
    };
    window.addEventListener("vivi:locationschange", handleLocationsChange);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:locationschange", handleLocationsChange);
    };
  }, []);

  // Alert picker: only notifications selected in Notifications Bindings for the active site.
  useEffect(() => {
    let cancelled = false;
    const reloadBoundAlerts = async () => {
      try {
        const rows = await loadNotificationPickerEventsForSite(readActiveSiteName());
        if (!cancelled) setEvents(rows);
      } catch {
        if (!cancelled) setEvents([]);
      }
    };
    void reloadBoundAlerts();
    window.addEventListener("vivi:orgchange", reloadBoundAlerts);
    window.addEventListener("vivi:contextchange", reloadBoundAlerts);
    window.addEventListener("vivi:bindingschange", reloadBoundAlerts);
    window.addEventListener(NOTIFICATION_LIBRARY_UPDATED_EVENT, reloadBoundAlerts);
    window.addEventListener(LOCATION_ALERTS_UPDATED_EVENT, reloadBoundAlerts);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:orgchange", reloadBoundAlerts);
      window.removeEventListener("vivi:contextchange", reloadBoundAlerts);
      window.removeEventListener("vivi:bindingschange", reloadBoundAlerts);
      window.removeEventListener(NOTIFICATION_LIBRARY_UPDATED_EVENT, reloadBoundAlerts);
      window.removeEventListener(LOCATION_ALERTS_UPDATED_EVENT, reloadBoundAlerts);
    };
  }, []);

  useEffect(() => {
    if (events.length === 0) return;
    const allowed = new Set(events.map((row) => row.id));
    setSelectedEvents((current) => {
      const next = new Set([...current].filter((id) => allowed.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [events]);

  // SSE subscription to telemetry stream -> update markers in real-time.
  // Paused while WebSocket live channel is connected (WS is primary).
  useEffect(() => {
    if (wsLiveOpen) return;
    const url = buildApiUrl(`/stream/telemetry`);
    const apiKey = getApiKey();
    const tenantId = getTenantId();
    let cancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let reconnectTimer: number | null = null;

    const start = async () => {
      while (!cancelled) {
      try {
        const headers: Record<string, string> = { Accept: "text/event-stream" };
        if (apiKey) headers["x-api-key"] = apiKey;
        if (tenantId) headers["x-tenant-id"] = tenantId;
        const res = await fetch(url, { headers });
        if (res.status === 401 || res.status === 403) {
          setShowToast({ id: "auth", text: "Live telemetry stream unauthorized. Please log in / set API key." });
          window.setTimeout(() => setShowToast(null), 5000);
          return;
        }
        if (!res.ok || !res.body) {
          await new Promise<void>((resolve) => {
            reconnectTimer = window.setTimeout(() => resolve(), 3_000);
          });
          continue;
        }
        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        const processChunk = (chunk: string) => {
          buf += chunk;
          while (buf.indexOf("\n\n") >= 0) {
            const idx = buf.indexOf("\n\n");
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const lines = block.split(/\r?\n/);
            let event = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (event === "telemetry" && data) {
              try {
                const parsed = JSON.parse(data) as any[];
                let lastLat: number | null = null;
                let lastLng: number | null = null;
                let lastId: string | null = null;
                noteRowWriter("telemetry-stream");
                setAssetRows((prev) => {
                  const map = new Map(prev.map((r) => [r.id, { ...r }]));
                  const trailCandidates: Array<{ id: string; lat: number; lng: number; atMs: number }> = [];
                  for (const ev of parsed) {
                    const payload = ev.data ?? ev;
                    const imeiFromEvent = normalizeImeiCandidate(payload?.imei ?? payload?.data?.imei ?? ev?.imei);
                    const idCandidate = String(ev.assetId ?? (ev.data && ev.data.assetId) ?? (ev.data && ev.data.id) ?? "").trim();

                    // Prefer direct id match; if it doesn't exist, try to match by IMEI.
                    let id = idCandidate;
                    if (id && !map.has(id) && imeiFromEvent) {
                      const match = Array.from(map.values()).find((row) => normalizeImeiCandidate((row as any)?.imei) === imeiFromEvent);
                      if (match) id = String((match as any).id ?? "").trim() || id;
                    }
                    if (!id && imeiFromEvent) {
                      const match = Array.from(map.values()).find((row) => normalizeImeiCandidate((row as any)?.imei) === imeiFromEvent);
                      id = match ? String((match as any).id ?? "").trim() : imeiFromEvent;
                    }
                    if (!id) continue;

                    const existing = map.get(id) ?? { id, assetDescription: id, registration: "", fleetNumber: "", site: "", driver: "", lastActive: "", lastPosition: "", location: "", assetId: id, gps: "", heading: "NE", ignition: "", lastNotificationValue: "", mobileDeviceType: "", speed: "0", timeInIgnition: "", driverIdentified: "", fuelReading: "", satellites: "", powerVoltage: "", status: "online" };
                    const existingTelemetryAtMs = Number.isFinite(Number((existing as any).telemetryAtMs))
                      ? Number((existing as any).telemetryAtMs)
                      : Number.NEGATIVE_INFINITY;
                    const liveCoords = getAssetCoordinates(payload);
                    const lat = typeof liveCoords.lat === "number" ? liveCoords.lat : undefined;
                    const lng = typeof liveCoords.lng === "number" ? liveCoords.lng : undefined;
                    const speed = extractLiveSpeed(payload) || existing.speed;
                    const heading = extractLiveHeading(payload) || existing.heading;
                    const fuelReading = extractFuelReading(payload) || existing.fuelReading;
                    const ignition = extractLiveIgnitionLabel(payload) || existing.ignition;
                    const satellites = extractLiveSatellites(payload) || existing.satellites;
                    const locked = hasSatelliteLock({ ...payload, satellites });
                    const powerVoltage = extractLivePowerVoltage(payload) || existing.powerVoltage;

                    const lastSeen =
                      payload?.data?.lastSeen ??
                      payload?.lastSeen ??
                      payload?.data?.lastPosition ??
                      payload?.lastPosition ??
                      ev?.createdAt ??
                      ev?.created_at ??
                      "";

                    const lastTrip = payload?.data?.lastTrip ?? payload?.lastTrip ?? "";
                    const incomingAtMs = parseTelemetryAtMs(payload, ev?.createdAt ?? ev?.created_at);
                    const isNewTelemetry = Number.isFinite(incomingAtMs) && incomingAtMs > existingTelemetryAtMs;
                    // Traccar is the primary live source. This stream's samples are stamped with
                    // server receive time (or "now" when they carry none), so they always looked
                    // newer than Traccar's GPS fix and overwrote speed / position for the whole
                    // fleet, then blocked the next Traccar update for ~30 s. While a vehicle has a
                    // recent Traccar fix the stream leaves it alone; otherwise only newer samples apply.
                    const existingLiveAt = Number((existing as any).liveFixAtMs);
                    const hasRecentTraccarFix =
                      (existing as any).liveSource === "traccar"
                      && Number.isFinite(existingLiveAt)
                      && Date.now() - existingLiveAt < TRACCAR_PRIMARY_WINDOW_MS;
                    if (
                      hasRecentTraccarFix
                      || (Number.isFinite(existingLiveAt) && !(Number.isFinite(incomingAtMs) && incomingAtMs > existingLiveAt))
                    ) {
                      continue;
                    }

                    const lastPosition = lastSeen ? formatTimestamp(String(lastSeen)) : existing.lastPosition;
                    const availabilityStatus = String(
                      payload?.status ?? payload?.data?.status ?? existing.availabilityStatus ?? ""
                    ).trim();
                    const resolvedLat = typeof lat === "number" ? lat : existing.lat;
                    const resolvedLng = typeof lng === "number" ? lng : existing.lng;
                    const lastMoveAtMs = resolveLastMoveAtMs({
                      previousLastMoveAtMs: Number((existing as any).lastMoveAtMs ?? Number.NaN),
                      atMs: Number.isFinite(incomingAtMs) ? incomingAtMs : Date.now(),
                      speed,
                      movement: payload?.movement ?? payload?.data?.movement,
                      previousLat: existing.lat,
                      previousLng: existing.lng,
                      lat: resolvedLat,
                      lng: resolvedLng
                    });
                    const status = computeStatus({
                      ...existing,
                      imei: imeiFromEvent || existing.imei,
                      status: availabilityStatus,
                      availabilityStatus,
                      lastSeen,
                      lastPosition,
                      lastTrip,
                      speed,
                      movement: payload?.movement ?? payload?.data?.movement,
                      lat: resolvedLat,
                      lng: resolvedLng,
                      lastMoveAtMs,
                      telemetryAtMs: Number.isFinite(incomingAtMs)
                        ? Math.max(existingTelemetryAtMs, incomingAtMs)
                        : existingTelemetryAtMs
                    });
                    const locationFromPayload = pickBestLocationLabel(
                      payload?.locationName,
                      payload?.location,
                      payload?.address,
                      payload?.lastLocation,
                      payload?.data?.locationName,
                      payload?.data?.location,
                      payload?.data?.address,
                      payload?.data?.lastLocation,
                      payload?.raw?.address,
                      payload?.telemetryLatest?.locationName,
                      payload?.telemetryLatest?.location,
                      payload?.telemetryLatest?.address,
                      payload?.telemetryLatest?.data?.locationName,
                      payload?.telemetryLatest?.data?.location,
                      payload?.telemetryLatest?.data?.address,
                      existing.location
                    );

                    const merged = {
                      ...existing,
                      ...payload,
                      imei: imeiFromEvent || existing.imei,
                      lat: typeof resolvedLat === "number" ? resolvedLat : existing.lat,
                      lng: typeof resolvedLng === "number" ? resolvedLng : existing.lng,
                      location: resolveLiveLocationLabel(
                        locationFromPayload,
                        existing.location,
                        resolvedLat,
                        resolvedLng,
                        reverseGeocodeCacheRef.current
                      ),
                      speed,
                      heading,
                      fuelReading,
                      ignition,
                      satellites,
                      powerVoltage,
                      lastActive: isNewTelemetry ? lastPosition : existing.lastActive,
                      lastPosition: isNewTelemetry ? lastPosition : existing.lastPosition,
                      availabilityStatus,
                      status,
                      lastMoveAtMs,
                      telemetryAtMs: Number.isFinite(incomingAtMs)
                        ? Math.max(existingTelemetryAtMs, incomingAtMs)
                        : existingTelemetryAtMs,
                      // Status reads speedKph first: derive it from this sample's speed, never
                      // from whatever speed fields the raw payload happened to carry.
                      speedKph: parseSpeedKph(speed) ?? (existing as any).speedKph,
                      movement: movementFromSpeedKph(speed) ?? (existing as any).movement,
                      liveFixAtMs: Number.isFinite(incomingAtMs) ? incomingAtMs : (existing as any).liveFixAtMs,
                      liveSource: "stream"
                    };
                    if (typeof resolvedLat === "number" && typeof resolvedLng === "number" && locked && isNewTelemetry) {
                      lastLat = resolvedLat;
                      lastLng = resolvedLng;
                      lastId = id;
                      const ignitionOn = isIgnitionOnPayload(payload);
                      if (isMovingTelemetryPayload(payload)) {
                        trailCandidates.push({
                          id,
                          lat: resolvedLat,
                          lng: resolvedLng,
                          atMs: incomingAtMs
                        });
                      }

                      const prevIgnition = lastIgnitionStateByAssetRef.current.get(id) ?? false;
                      if (ignitionOn && !prevIgnition) {
                        const atMs = incomingAtMs;
                        setTripStartFlagsByAsset((prev) => {
                          const list = prev[id] ? [...prev[id]] : [];
                          const tail = list[list.length - 1];
                          if (tail && Math.abs(tail.lat - resolvedLat) < 0.000001 && Math.abs(tail.lng - resolvedLng) < 0.000001) return prev;
                          return { ...prev, [id]: [...list, { lat: resolvedLat, lng: resolvedLng, atMs }].slice(-120) };
                        });
                      }
                      lastIgnitionStateByAssetRef.current.set(id, ignitionOn);
                    }
                    map.set(id, merged as AssetRow);
                  }

                  if (trailCandidates.length > 0) {
                    setReplayTrailByAsset((prev) => {
                      const next: Record<string, TrailPoint[]> = { ...prev };
                      for (const item of trailCandidates) {
                        const lastAt = trailLastPlottedAtRef.current.get(item.id) ?? 0;
                        if (item.atMs - lastAt < TRAIL_POINT_INTERVAL_MS) continue;

                        const current = next[item.id] ? [...next[item.id]] : [];
                        const latest = current[current.length - 1];
                        if (latest && Math.abs(latest.lat - item.lat) < 0.000001 && Math.abs(latest.lng - item.lng) < 0.000001) {
                          continue;
                        }

                        trailLastPlottedAtRef.current.set(item.id, item.atMs);
                        current.push({ lat: item.lat, lng: item.lng, atMs: item.atMs });
                        next[item.id] = current.slice(-240);
                      }
                      return next;
                    });
                  }

                  // after updating, if we captured a last position, show toast and optionally center map
                  if (lastLat !== null && lastLng !== null && lastId) {
                    const latN = lastLat as number;
                    const lngN = lastLng as number;
                    // show small toast
                    setShowToast({ id: lastId, text: `Live update: ${lastId} @ ${latN.toFixed(5)}, ${lngN.toFixed(5)} (${formatTimestamp(new Date().toISOString())})` });
                    // center map briefly
                    if (mapRef && typeof mapRef.panTo === "function") {
                      try {
                        mapRef.panTo({ lat: latN, lng: lngN });
                        const z = (mapRef.getZoom && mapRef.getZoom()) || 13;
                        if (mapRef.setZoom && z) mapRef.setZoom(Math.max(z, 13));
                      } catch {
                        // ignore map pan errors
                      }
                    }
                    // remove toast after short delay
                    window.setTimeout(() => setShowToast(null), 3500);
                  }
                  return Array.from(map.values());
                });
              } catch {
                // ignore
              }
            }
          }
        };

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          processChunk(decoder.decode(value, { stream: true }));
        }
      } catch {
        // ignore errors — reconnect below
      }
      if (cancelled) return;
      await new Promise<void>((resolve) => {
        reconnectTimer = window.setTimeout(() => resolve(), 3_000);
      });
      }
    };

    void start();
    return () => {
      cancelled = true;
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      try {
        void reader?.cancel();
      } catch {
        // ignore
      }
    };
  }, [mapRef, wsLiveOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      writeUserScopedJson("vivi.liveTracking.selectedLocations", Array.from(selectedLocations));
      writeUserScopedJson("vivi.liveTracking.selectedEvents", Array.from(selectedEvents));
      window.dispatchEvent(
        new CustomEvent("vivi.liveTracking.selectionUpdate", {
          detail: { locations: selectedLocations.size, alerts: selectedEvents.size }
        })
      );
    } catch {
      // ignore storage failures
    }
  }, [selectedLocations, selectedEvents]);

  useEffect(() => {
    let cancelled = false;
    const loadSharedLocations = async () => {
      const generation = customLocationsLoadGenerationRef.current + 1;
      customLocationsLoadGenerationRef.current = generation;
      customLocationsHydratedRef.current = false;
      const shared = await loadSharedRecords<LocationRow>("track:live-tracking:custom-locations");
      if (cancelled || generation !== customLocationsLoadGenerationRef.current) return;
      if (shared && shared.length) {
        setCustomLocations(shared);
      } else if (!shared) {
        const legacy = readUserScopedJson<LocationRow[]>("vivi.liveTracking.customLocations") ?? [];
        setCustomLocations(Array.isArray(legacy) ? legacy : []);
      } else {
        setCustomLocations([]);
      }
      customLocationsHydratedRef.current = true;
    };
    void loadSharedLocations();
    window.addEventListener("vivi:orgchange", loadSharedLocations);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:orgchange", loadSharedLocations);
    };
  }, []);

  useEffect(() => {
    if (!customLocationsHydratedRef.current) return;
    void saveSharedRecords("track:live-tracking:custom-locations", customLocations);
  }, [customLocations]);

    const readActiveSiteFilter = () => {
      if (typeof window === "undefined") return "";
      const directSite = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
      if (directSite) return directSite;
      const selectedPath = String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim();
      if (!selectedPath) return "";
      const parts = selectedPath
        .split("/")
        .map((part) => String(part ?? "").trim())
        .filter(Boolean);
      return parts[3] ?? "";
    };

    const [activeSiteFilter, setActiveSiteFilter] = useState<string>(() => readActiveSiteFilter());
    const [orgLoadKey, setOrgLoadKey] = useState(0);
    const orgContextPendingRefreshRef = useRef(false);
    const pendingRefreshScopeRef = useRef("");
    const lastSuccessfulScopeRef = useRef("");
    const scopeRetryRef = useRef(0);
    const normalizeSiteText = (value: unknown) => String(value ?? "").trim().toLowerCase();
    const readSelectedTenantId = () => {
      if (typeof window === "undefined") return "";
      const dealerId = String(window.localStorage.getItem("vivi.activeDealerId") ?? "").trim();
      const orgId = String(window.localStorage.getItem("vivi.activeOrgId") ?? "").trim();
      const dbId = String(window.localStorage.getItem("vivi.activeDbId") ?? "").trim();
      if (dealerId && orgId && dbId) return `${dealerId}:${orgId}:${dbId}`;
      return String(window.localStorage.getItem("vivi.tenantId") ?? "").trim();
    };
    const readScopeSignature = () => {
      if (typeof window === "undefined") return "";
      return [
        String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim(),
        String(window.localStorage.getItem("vivi.activeDealerId") ?? "").trim(),
        String(window.localStorage.getItem("vivi.activeOrgId") ?? "").trim(),
        String(window.localStorage.getItem("vivi.activeDbId") ?? "").trim(),
        String(window.localStorage.getItem("vivi.activeSiteId") ?? "").trim(),
        String(window.localStorage.getItem("vivi.activeSite") ?? "").trim(),
        String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim(),
        readSelectedTenantId()
      ].join("|");
    };
    const readScopeContext = () => {
      if (typeof window === "undefined") {
        return { scope: "dealer", dealer: "", organisation: "", database: "", site: "" };
      }
      const selectedPath = String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim();
      const parts = selectedPath
        .split("/")
        .map((part) => String(part ?? "").trim())
        .filter(Boolean);
      const rawScope = String(window.localStorage.getItem("vivi.selectedScope") ?? "").trim().toLowerCase();
      const inferredScope =
        rawScope === "dealer" || rawScope === "org" || rawScope === "db" || rawScope === "site" || rawScope === "asset"
          ? rawScope
          : parts.length >= 4
            ? "site"
            : parts.length === 3
              ? "db"
              : parts.length === 2
                ? "org"
                : "dealer";
      return {
        scope: inferredScope,
        dealer: normalizeSiteText(parts[0] ?? ""),
        organisation: normalizeSiteText(parts[1] ?? ""),
        database: normalizeSiteText(parts[2] ?? ""),
        // Prefer explicit active-site storage over selectedPath segment to avoid stale path races.
        site: normalizeSiteText((activeSiteFilter || readActiveSiteFilter()) || (parts[3] ?? ""))
      };
    };

    const buildAllowedSiteSet = (scopeCtx: { scope: string; dealer: string; organisation: string; database: string; site: string }) => {
      if (typeof window === "undefined") return new Set<string>();
      const raw = window.localStorage.getItem("vivi.org.hierarchy") ?? "";
      if (!raw) return new Set<string>();
      try {
        const parsed = JSON.parse(raw) as any;
        const dealers = Array.isArray(parsed?.dealers) ? parsed.dealers : [];
        const matchedDealer = dealers.find((d: any) => normalizeSiteText(d?.name) === scopeCtx.dealer);
        if (!matchedDealer) return new Set<string>();
        if (scopeCtx.scope === "dealer") {
          return new Set(
            (matchedDealer?.organisations ?? [])
              .flatMap((o: any) => o?.databases ?? [])
              .flatMap((db: any) => db?.sites ?? [])
              .map((s: any) => normalizeSiteText(s?.name))
              .filter(Boolean)
          );
        }
        const matchedOrg = (matchedDealer?.organisations ?? []).find((o: any) => normalizeSiteText(o?.name) === scopeCtx.organisation);
        if (!matchedOrg) return new Set<string>();
        if (scopeCtx.scope === "org") {
          return new Set(
            (matchedOrg?.databases ?? [])
              .flatMap((db: any) => db?.sites ?? [])
              .map((s: any) => normalizeSiteText(s?.name))
              .filter(Boolean)
          );
        }
        const matchedDb = (matchedOrg?.databases ?? []).find((db: any) => normalizeSiteText(db?.name) === scopeCtx.database);
        if (!matchedDb) return new Set<string>();
        if (scopeCtx.scope === "db") {
          return new Set((matchedDb?.sites ?? []).map((s: any) => normalizeSiteText(s?.name)).filter(Boolean));
        }
        if (scopeCtx.site) return new Set([scopeCtx.site]);
        return new Set<string>();
      } catch {
        return new Set<string>();
      }
    };

    const matchesLayerFilter = (asset: AssetRow) => {
      if (isCms808LiveAsset(asset)) {
        return cms808HierarchyActive([activeSiteFilter, readActiveSiteFilter()]);
      }
      const storedSelection = readStoredSelectionScope();
      if (storedSelection.scope === "db" || storedSelection.scope === "site" || storedSelection.scope === "asset") {
        if (!matchesStoredSiteSelection(asset.site, storedSelection)) return false;
      } else {
        const scopeCtx = readScopeContext();
        const assetSite = normalizeSiteText(asset.site);
        const assetDb = normalizeSiteText(asset.database);
        const allowedSites = buildAllowedSiteSet(scopeCtx);

        if (scopeCtx.scope === "site" || scopeCtx.scope === "asset") {
          if (scopeCtx.site && assetSite !== scopeCtx.site) return false;
        } else if (scopeCtx.scope === "db") {
          if (allowedSites.size > 0 && !allowedSites.has(assetSite)) return false;
          else if (scopeCtx.database && assetDb && assetDb !== scopeCtx.database) return false;
        } else if (scopeCtx.scope === "org" || scopeCtx.scope === "dealer") {
          if (allowedSites.size > 0 && !allowedSites.has(assetSite)) return false;
        }
      }

      if (fleetFilter) {
        if (!fleetFilter.matchesSite(asset.site)) return false;
        if (!fleetFilter.matchesAsset(asset.registration, asset.id)) return false;
      }
      return true;
    };

    useEffect(() => {
      const contextStorageKeys = new Set([
        "vivi.activeSite",
        "vivi.selectedPath",
        "vivi.selectedScope",
        "vivi.activeDealerId",
        "vivi.activeOrgId",
        "vivi.activeDbId",
        "vivi.tenantId",
        "vivi.contextType",
        "vivi.contextName"
      ]);

      const refreshContext = () => {
        orgContextPendingRefreshRef.current = true;
        scopeRetryRef.current = 0;
        pendingRefreshScopeRef.current = readScopeSignature();
        setLockedAssetId(null);
        setTrailAssetId(null);
        setActiveInfoWindow(null);
        setOpenActions(null);
        setActiveSiteFilter(readActiveSiteFilter());
        setOrgLoadKey((k) => k + 1);
      };

      const handleStorageChange = (event: Event) => {
        const storageEvent = event as StorageEvent;
        if (storageEvent.key && !contextStorageKeys.has(storageEvent.key)) return;
        refreshContext();
      };

      setActiveSiteFilter(readActiveSiteFilter());
      const unsubscribeScope = subscribeScopeChange(refreshContext);
      window.addEventListener("vivi:assetschange", refreshContext);
      window.addEventListener("storage", handleStorageChange);
      return () => {
        unsubscribeScope();
        window.removeEventListener("vivi:assetschange", refreshContext);
        window.removeEventListener("storage", handleStorageChange);
      };
    }, []);

  const toggleCol = (key: ColumnKey) => {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setVisibleCols(next);
  };

  const columns = useMemo<Array<{ key: ColumnKey; label: string; minWidth: number; render: (a: AssetRow) => ReactNode }>>(
    () => [
      {
        key: "assetDescription",
        label: "Asset Description",
        minWidth: 220,
        render: (a: AssetRow) => {
          return (
            <span className="assets-asset-description-text">
              <span>{getTrackingDisplayName(a)}</span>
              {a.id === lockedAssetId && (
                <button
                  type="button"
                  className="live-asset-lock"
                  title="Double-click to unlock"
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={() => {
                    localStorage.removeItem("vivi.lockedAsset");
                    setLockedAssetId(null);
                  }}
                >
                  🔒
                </button>
              )}
            </span>
          );
        }
      },
      { key: "assetIcon", label: "Asset icon", minWidth: 90, render: () => "🚚" },
      { key: "assetId", label: "Last Position", minWidth: 180, render: (a: AssetRow) => a.lastPosition },
      { key: "database", label: "Database", minWidth: 170, render: (a: AssetRow) => getTrackingDatabase(a) },
      { key: "driver", label: "Driver", minWidth: 140, render: (a: AssetRow) => a.driver },
      { key: "driverIdentified", label: "Driver Identified", minWidth: 130, render: (a: AssetRow) => a.driverIdentified },
      { key: "fuelReading", label: "Fuel (L)", minWidth: 100, render: (a: AssetRow) => a.fuelReading },
      { key: "fleetNumber", label: "ISP Serial Number", minWidth: 120, render: (a: AssetRow) => a.fleetNumber },
      { key: "gps", label: "GPS Coordinates", minWidth: 190, render: (a: AssetRow) => a.gps },
      { key: "heading", label: "Heading", minWidth: 100, render: (a: AssetRow) => a.heading },
      { key: "ignition", label: "Ignition Status", minWidth: 120, render: (a: AssetRow) => a.ignition },
      { key: "lastNotification", label: "Last Active Notification", minWidth: 190, render: (a: AssetRow) => a.lastActive },
      { key: "lastNotificationValue", label: "Last Active Notification Value", minWidth: 220, render: (a: AssetRow) => a.lastNotificationValue },
      {
        key: "location",
        label: "Location",
        minWidth: 170,
        render: (a: AssetRow) => (
          <span className="live-cell-text" title={a.location || ""}>
            {a.location}
          </span>
        )
      },
      { key: "mobileDeviceType", label: "Mobile Device Type", minWidth: 150, render: (a: AssetRow) => a.mobileDeviceType },
      { key: "registration", label: "Registration Number", minWidth: 170, render: (a: AssetRow) => a.registration },
      { key: "site", label: "Site", minWidth: 130, render: (a: AssetRow) => a.site },
      { key: "speed", label: "Speed (km/h)", minWidth: 110, render: (a: AssetRow) => a.speed },
      { key: "timeInIgnition", label: "Time In Ignition", minWidth: 140, render: (a: AssetRow) => a.timeInIgnition }
    ],
    [lockedAssetId]
  );

  const activeCols = columnOrder
    .filter((key) => visibleCols.has(key))
    .map((key) => columns.find((c) => c.key === key)!)
    .filter(Boolean);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragging) return;
      const next = Math.min(700, Math.max(280, event.clientX));
      setSidebarWidth(next);
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  const filteredLocations = [...locations, ...customLocations].filter((loc) => {
    const query = locationFilter.trim().toLowerCase();
    if (!query) return true;
    return (
      loc.name.toLowerCase().includes(query) ||
      loc.site.toLowerCase().includes(query) ||
      loc.locationType.toLowerCase().includes(query)
    );
  });

  const selectedMapLocations = useMemo(() => {
    const byId = new Map<string, LocationRow>();
    for (const loc of [...locations, ...customLocations]) {
      if (!selectedLocations.has(loc.id)) continue;
      byId.set(loc.id, loc);
    }
    return [...byId.values()];
  }, [locations, customLocations, selectedLocations]);

  const filteredEvents = events.filter((evt) => {
    const query = eventFilter.trim().toLowerCase();
    if (!query) return true;
    return evt.name.toLowerCase().includes(query) || evt.eventType.toLowerCase().includes(query);
  });

  const selectedNotificationTokens = useMemo(() => {
    const tokens = new Set<string>();
    const byId = new Map(events.map((evt) => [evt.id, evt] as const));
    for (const id of selectedEvents) {
      const evt = byId.get(id);
      if (!evt) continue;
      const nameToken = normalizeNotificationToken(evt.name);
      const typeToken = normalizeNotificationToken(evt.eventType);
      if (nameToken) tokens.add(nameToken);
      if (typeToken) tokens.add(typeToken);
    }
    return tokens;
  }, [events, selectedEvents]);

  const [assetRows, setAssetRows] = useState<AssetRow[]>(() => readCachedAssetRows());
  assetRowsRef.current = assetRows;

  // Opt-in trace (see liveStatusTraceEnabled): which code path changed status / position.
  useEffect(() => {
    const previous = liveStatusTraceRef.current;
    const next = new Map<string, { status: string; lat: number; lng: number }>();
    const changes: Array<Record<string, unknown>> = [];
    for (const row of assetRows) {
      const id = String(row.id ?? row.imei ?? "").trim();
      if (!id) continue;
      const entry = { status: resolveAssetDotStatus(row as any), lat: Number(row.lat), lng: Number(row.lng) };
      next.set(id, entry);
      const before = previous.get(id);
      if (!before) continue;
      // Rows without coordinates (NaN) never count as moved: NaN !== NaN is always true.
      const moved =
        Number.isFinite(before.lat) && Number.isFinite(entry.lat)
          ? Math.hypot(entry.lat - before.lat, entry.lng - before.lng) > 0.01
          : Number.isFinite(before.lat) !== Number.isFinite(entry.lat);
      if (before.status !== entry.status || moved) {
        changes.push({
          asset: row.registration || row.assetDescription || id,
          status: `${before.status}→${entry.status}`,
          ...(moved ? { jumpedKm: Math.round(Math.hypot(entry.lat - before.lat, entry.lng - before.lng) * 111) } : {}),
          speedKph: row.speedKph,
          speed: row.speed,
          liveSource: row.liveSource,
          liveFixAt: row.liveFixAtMs ? new Date(row.liveFixAtMs).toISOString() : undefined
        });
      }
    }
    for (const id of previous.keys()) {
      if (!next.has(id)) changes.push({ asset: id, status: "removed from list" });
    }
    liveStatusTraceRef.current = next;
    if (changes.length && liveStatusTraceEnabled()) {
      console.log(`[vivi-live-status] ${new Date().toISOString()} by ${lastRowWriter}: ${changes.length} change(s)`, changes);
    }
  }, [assetRows]);

  useEffect(() => {
    const tenantId = String(getTenantId() ?? "").trim();
    if (!tenantId || assetRows.length === 0) return;
    const flush = () => rememberLivePositions(tenantId, assetRows as unknown as Array<Record<string, unknown>>);
    const timer = window.setTimeout(flush, 400);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, [assetRows]);
  selectedAssetsRef.current = selectedAssets;

  /** Keep Asset details modal in sync with live row updates (satellites, voltage, speed, …). */
  const liveDetailsAsset = useMemo(() => {
    if (!detailsAsset) return null;
    const id = String(detailsAsset.id ?? "").trim();
    const imei = String(detailsAsset.imei ?? "").trim();
    const registration = String(detailsAsset.registration ?? "").trim();
    const live =
      assetRows.find((row) => id && String(row.id ?? "").trim() === id)
      ?? assetRows.find((row) => imei && String(row.imei ?? "").trim() === imei)
      ?? assetRows.find((row) => registration && String(row.registration ?? "").trim() === registration);
    if (!live) return detailsAsset;
    return {
      ...detailsAsset,
      ...live,
      // Prefer non-empty live telemetry; fall back to the snapshot used to open the modal.
      satellites: String(live.satellites ?? "").trim() || detailsAsset.satellites,
      powerVoltage: String(live.powerVoltage ?? "").trim() || detailsAsset.powerVoltage,
      speed: live.speed || detailsAsset.speed,
      heading: live.heading || detailsAsset.heading,
      ignition: live.ignition || detailsAsset.ignition,
      lastPosition: live.lastPosition || detailsAsset.lastPosition,
      location: live.location || detailsAsset.location
    };
  }, [detailsAsset, assetRows]);

  useEffect(() => {
    if (!assetRows.length) return;
    const refreshStatuses = () => {
      noteRowWriter("status-timer");
      setAssetRows((prev) => {
        let changed = false;
        const next = prev.map((row) => {
          const status = computeStatus(row as any);
          if (status === row.status) return row;
          changed = true;
          return { ...row, status };
        });
        return changed ? next : prev;
      });
    };
    const timer = window.setInterval(refreshStatuses, 30_000);
    return () => window.clearInterval(timer);
  }, [assetRows.length]);

  const [showToast, setShowToast] = useState<{ id: string; text: string } | null>(null);
  const [replayTrailByAsset, setReplayTrailByAsset] = useState<Record<string, TrailPoint[]>>({});
  const [tripReplayOpen, setTripReplayOpen] = useState(false);
  const [tripReplayPlaying, setTripReplayPlaying] = useState(false);
  const [tripReplaySpeed, setTripReplaySpeed] = useState<number>(2);
  const [tripReplayAtMs, setTripReplayAtMs] = useState<number | null>(null);
  const tripReplayLastFrameRef = useRef<number | null>(null);
  const tripReplayRafRef = useRef<number | null>(null);
  const tripReplaySpeedRef = useRef(tripReplaySpeed);
  const tripReplayPlayingRef = useRef(tripReplayPlaying);
  const tripReplayAtMsRef = useRef<number | null>(tripReplayAtMs);
  tripReplaySpeedRef.current = tripReplaySpeed;
  tripReplayPlayingRef.current = tripReplayPlaying;
  tripReplayAtMsRef.current = tripReplayAtMs;
  const [tripStartFlagsByAsset, setTripStartFlagsByAsset] = useState<Record<string, TrailPoint[]>>({});
  const [videoTrailEventsByAsset, setVideoTrailEventsByAsset] = useState<Record<string, VideoTrailEvent[]>>({});
  const [trailNotificationEventsByAsset, setTrailNotificationEventsByAsset] = useState<Record<string, TrailNotificationEvent[]>>({});
  const [trailNotificationTick, setTrailNotificationTick] = useState(0);
  const trailLastPlottedAtRef = useRef<Map<string, number>>(new Map());
  const manualTrailAssetIdRef = useRef<string | null>(null);
  const trailLoadingAssetIdRef = useRef<string | null>(null);
  const lastIgnitionStateByAssetRef = useRef<Map<string, boolean>>(new Map());
  const headingStateByAssetRef = useRef<Map<string, { stableHeadingDeg: number; movingDirectional: boolean }>>(new Map());
  const iconCacheRef = useRef<Map<string, any>>(new Map());
  const markerRefs = useRef<Map<string, any>>(new Map());
  const clusterGroupRef = useRef<any>(null);
  const popupHoveringRef = useRef(false);
  const popupCloseTimerRef = useRef<number | null>(null);
  const activeInfoWindowRef = useRef<string | null>(null);
    const prevLockedAssetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedEvents.size === 0) return;
    const timer = window.setInterval(() => setTrailNotificationTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(timer);
  }, [selectedEvents.size, trailNotificationEventsByAsset]);

  const assetsWithActiveNotification = useMemo(() => {
    if (selectedEvents.size === 0) return new Set<string>();
    const nowMs = Date.now();
    const active = new Set<string>();
    for (const [assetId, events] of Object.entries(trailNotificationEventsByAsset)) {
      if (hasActiveSelectedNotificationForAsset(events, nowMs)) active.add(assetId);
    }
    return active;
  }, [trailNotificationEventsByAsset, selectedEvents.size, trailNotificationTick]);

  const clearPopupCloseTimer = () => {
    if (popupCloseTimerRef.current) {
      window.clearTimeout(popupCloseTimerRef.current);
      popupCloseTimerRef.current = null;
    }
  };

  const closeActivePopupSoon = (ms: number) => {
    clearPopupCloseTimer();
    popupCloseTimerRef.current = window.setTimeout(() => {
      if (popupHoveringRef.current) return;
      const active = activeInfoWindowRef.current;
      if (active) {
        const marker = markerRefs.current.get(active);
        if (!marker || !(marker as any)._map) {
          markerRefs.current.delete(active);
          setActiveInfoWindow(null);
          return;
        }
        try {
          marker?.closePopup?.();
        } catch {
          // ignore
        }
      }
      setActiveInfoWindow(null);
    }, ms);
  };

  const MapClickHandler = () => {
    const map = useMap();
    useMapEvents({
      click(event) {
        if (showCreateLocationTools) {
          setDraftLocation((current) => ({
            ...current,
            lat: event.latlng.lat,
            lng: event.latlng.lng
          }));
          return;
        }
        if (measureMode === "distance") return;
        clearPopupCloseTimer();
        popupHoveringRef.current = false;
        setActiveInfoWindow(null);
        setOpenActions(null);
        setMenuAnchor(null);
        try {
          map.closePopup();
        } catch {
          // ignore
        }
      }
    });
    return null;
  };

  useEffect(() => {
    let mounted = true;
    let refreshTimer: number | null = null;
    const loadAssets = async () => {
      const requestScopeSignature = readScopeSignature();
      const scopedTenantId = readSelectedTenantId();
      const scopeCtx = readScopeContext();
      const cmsScope = [
        scopeCtx.dealer,
        scopeCtx.organisation,
        scopeCtx.database,
        scopeCtx.site,
        activeSiteFilter,
        readActiveSiteFilter()
      ];
      const paintCms808 = async () => {
        const vehicles = await loadCms808VehiclesForActiveHierarchy(cmsScope);
        const rows: AssetRow[] = (
          await Promise.all(
            vehicles.slice(0, 20).map(async (vehicle) => {
              const gps = await loadCms808Position(vehicle).catch(() => null);
              if (!gps || cms808GpsTime(gps) === "") return null;
              return formatCms808LiveRow(cms808VehicleToLiveRow(vehicle, gps) as AssetRow, siteTimeZones);
            })
          )
        ).filter((row): row is AssetRow => Boolean(row));
        if (!rows.length && cms808HierarchyActive(cmsScope)) {
          rows.push(formatCms808LiveRow(cms808VehicleToLiveRow(CMS808_KNOWN_VEHICLE, null) as AssetRow, siteTimeZones));
        }
        if (!mounted) return rows;
        if (rows.length) {
          noteRowWriter("cms808-paint");
          setAssetRows((current) => {
            const others = current.filter((row) => !isCms808LiveAsset(row));
            return [...rows, ...others];
          });
        }
        return rows;
      };

      const cmsTask = paintCms808();

      // Force a network read after an org/site switch so an empty cache cannot stick.
      let apiAssets = await getAssetsFromApi<Record<string, unknown>>({
        force: orgContextPendingRefreshRef.current
      });
      if ((!Array.isArray(apiAssets) || apiAssets.length === 0) && scopedTenantId) {
        apiAssets = await getAssetsFromApiForTenant<Record<string, unknown>>(scopedTenantId);
      }

      // Live Tracking only reads assets; it never imports devices into the database.

      if (!mounted) return;
      let cmsRows: AssetRow[] = [];
      let cmsVehicles: Awaited<ReturnType<typeof loadCms808VehiclesForActiveHierarchy>> = [];
      if (!Array.isArray(apiAssets) || apiAssets.length === 0) {
        cmsRows = await cmsTask;
        if (!mounted) return;
        cmsVehicles = cmsRows.length ? [] : await loadCms808VehiclesForActiveHierarchy(cmsScope);
        if (!mounted) return;
      }

      // On org/site switches we need a hard refresh; if the first payload is empty,
      // clear current rows instead of preserving the old context until manual reload.
      // 808 GPS cameras still load when this site has no commissioned D1 assets.
      if (!Array.isArray(apiAssets) || apiAssets.length === 0) {
        if (cmsRows.length > 0 || cmsVehicles.length > 0) {
          apiAssets = [];
          orgContextPendingRefreshRef.current = false;
          pendingRefreshScopeRef.current = "";
        } else {
          const cachedAssets = peekCachedAssets<Record<string, unknown>>();
          if (cachedAssets.length) {
            apiAssets = cachedAssets;
          } else if (orgContextPendingRefreshRef.current) {
            const pendingScopeSignature = pendingRefreshScopeRef.current || requestScopeSignature;
            const isNewScope = pendingScopeSignature !== lastSuccessfulScopeRef.current;
            if (isNewScope) {
              noteRowWriter("scope-clear");
              setAssetRows([]);
              setSelectedAssets(new Set());
              if (mounted && scopeRetryRef.current < 3) {
                scopeRetryRef.current += 1;
                window.setTimeout(() => {
                  if (mounted) setOrgLoadKey((key) => key + 1);
                }, 400);
              }
            }
            orgContextPendingRefreshRef.current = false;
            pendingRefreshScopeRef.current = "";
            // Continue with an empty API list so CMS rows and the next retry can paint.
          } else {
            return;
          }
        }
      }

      const mapped = apiAssets.length
        ? apiAssets.map((asset, index) => {
            const site = String((asset as any).site ?? (asset as any).group ?? (asset as any).groupName ?? "");
            const coords = getAssetCoordinates(asset as any);
            const latRaw = coords.lat;
            const lngRaw = coords.lng;
            const hasValidSiteCoordinates = isSiteCoordinateValid(site, latRaw, lngRaw);
            const lat = hasValidSiteCoordinates ? latRaw : undefined;
            const lng = hasValidSiteCoordinates ? lngRaw : undefined;
            const id = String(asset.id ?? asset.assetId ?? index);
            const imei = deriveImeiFromAsset(asset) || "";
            const registration = preferHumanAssetLabel(
              (asset as any).registration,
              (asset as any).registration,
              imei
            );
            const assetDescription =
              formatAssetDescription(asset as any) ||
              preferHumanAssetLabel((asset as any).assetDescription, (asset as any).assetDescription, imei) ||
              registration ||
              "Unnamed asset";

            const availabilityStatus = String((asset as any).status ?? (asset as any).availability ?? "").trim();

            const lastSeen = getAssetLastSeen(asset as any);
            const telemetryAtMs = parseTimestampMs(String(lastSeen ?? "").trim());
            const lastMoveAtMs = Number.isFinite(telemetryAtMs) ? telemetryAtMs : undefined;
            const lastTrip = (asset as any)?.lastTrip ?? (asset as any)?.last_trip ?? "";
            const speed = extractLiveSpeed(asset);
            const heading = extractLiveHeading(asset);

            const status = computeStatus({
              ...(asset as any),
              status: availabilityStatus,
              availabilityStatus,
              lastSeen,
              lastPosition: (asset as any)?.lastPosition,
              lastTrip,
              speed,
              movement: (asset as any)?.movement ?? (asset as any)?.telemetryLatest?.movement,
              imei: deriveImeiFromAsset(asset) || undefined,
              lat,
              lng,
              lastMoveAtMs,
              telemetryAtMs: Number.isFinite(telemetryAtMs) ? telemetryAtMs : undefined
            });

            const lastPosition = lastSeen
              ? formatTimestampForSite(String(lastSeen), site, siteTimeZones)
              : String((asset as any).lastPosition ?? "");

            return {
              id,
              assetDescription,
              registration,
              fleetNumber: String((asset as any).fleetNumber ?? ""),
              database: String((asset as any).database ?? (asset as any).contact ?? "").trim(),
              imei: imei || undefined,
              configGroup: getAssetConfigGroup(asset) || undefined,
              site,
              driver: resolveAssetDriverName(asset as Record<string, unknown>),
              lastActive: lastPosition,
              lastPosition,
              location: pickBestLocationLabel(
                (asset as any).locationName,
                (asset as any).lastLocation,
                (asset as any).location,
                (asset as any).lastAddress,
                (asset as any).address,
                (asset as any).telemetryLatest?.locationName,
                (asset as any).telemetryLatest?.address,
                (asset as any).telemetryLatest?.data?.locationName,
                (asset as any).telemetryLatest?.data?.address
              ),
              assetId: String((asset as any).assetId ?? (asset as any).id ?? ""),
              gps: String((asset as any).gps ?? ""),
              heading,
              ignition: extractLiveIgnitionLabel(asset),
              lastNotificationValue: String((asset as any).lastNotificationValue ?? ""),
              mobileDeviceType: String((asset as any).mobileDevice ?? (asset as any).mobileDeviceType ?? ""),
              device: String((asset as any).device ?? ""),
              speed,
              timeInIgnition: String((asset as any).timeInIgnition ?? ""),
              driverIdentified: String((asset as any).driverIdentified ?? ""),
              fuelReading: extractFuelReading(asset) || "",
              satellites: extractLiveSatellites(asset),
              powerVoltage: extractLivePowerVoltage(asset),
              availabilityStatus,
              status,
              lat,
              lng,
              telemetryAtMs: Number.isFinite(telemetryAtMs) ? telemetryAtMs : undefined,
              lastMoveAtMs,
              traccarDeviceId: Number((asset as any).traccarDeviceId ?? (asset as any).deviceId) || undefined
            } as AssetRow;
          })
        : [];

      const allMappedBase = mapped.filter(Boolean) as AssetRow[];
      if (allMappedBase.length) {
        noteRowWriter("reload-stored");
        setAssetRows((current) => {
          const merged = mergeAssetRows(current, allMappedBase);
          // Keep live-only (808) rows until the full merge below so they don't vanish mid-refresh.
          const keptIds = new Set(merged.map((row) => String(row.id ?? "").trim()));
          const carried = current.filter(
            (row) => isCms808LiveAsset(row) && !keptIds.has(String(row.id ?? "").trim())
          );
          return carried.length ? [...merged, ...carried] : merged;
        });
      }
      if (!cmsRows.length && Array.isArray(apiAssets) && apiAssets.length > 0) {
        cmsRows = await cmsTask;
        if (!mounted) return;
        if (!cmsRows.length) {
          cmsVehicles = await loadCms808VehiclesForActiveHierarchy(cmsScope);
          if (!mounted) return;
        }
      }
      const cmsGpsByDevice = new Map<string, Record<string, unknown>>();
      await Promise.all(
        cmsVehicles.slice(0, 20).map(async (vehicle) => {
          const device = String(vehicle.devIdno || vehicle.deviceId || "").trim();
          if (!device) return;
          try {
            const gps = await loadCms808Position(vehicle);
            if (gps && cms808GpsTime(gps)) cmsGpsByDevice.set(device, gps);
          } catch {
            // GPS stays on the 808 platform until the next refresh.
          }
        })
      );

      const existing808Ids = new Set(
        allMappedBase
          .filter((row) => isCms808LiveAsset(row))
          .flatMap((row) => [String(row.id ?? "").replace(/^cms808:/i, ""), row.imei, row.assetId])
          .map((value) => String(value ?? "").trim().toLowerCase())
          .filter(Boolean)
      );
      const extraCms = cmsVehicles
        .filter((vehicle) => {
          const device = String(vehicle.devIdno || vehicle.deviceId || "").trim().toLowerCase();
          return Boolean(device) && !existing808Ids.has(device);
        })
        .map((vehicle) => {
          const gps = cmsGpsByDevice.get(String(vehicle.devIdno || vehicle.deviceId || "").trim());
          const rec = cms808VehicleToAssetRecord(vehicle, gps);
          const lastSeen = String(rec.lastSeen || "");
          const lastSeenIso = lastSeen && !Number.isNaN(Date.parse(lastSeen.replace(" ", "T")))
            ? new Date(lastSeen.replace(" ", "T")).toISOString()
            : lastSeen || (typeof rec.lat === "number" ? new Date().toISOString() : "");
          const site = String(rec.site || cms808SiteName());
          const lastPosition = cms808DisplayTime(lastSeen || lastSeenIso, site, siteTimeZones);
          return {
            id: String(rec.id),
            assetDescription: String(rec.assetDescription),
            registration: String(rec.registration),
            fleetNumber: String(rec.fleetNumber || ""),
            database: String(rec.database || CMS808_PARENT_NAME),
            imei: String(rec.imei || ""),
            site,
            driver: "",
            lastActive: lastPosition,
            lastPosition,
            location: String(rec.lastLocation || ""),
            assetId: String(rec.assetId || ""),
            gps: String(rec.gps || ""),
            heading: String(rec.heading || ""),
            ignition: "",
            lastNotificationValue: "",
            mobileDeviceType: "VIVI Camera",
            device: "VIVI Camera",
            speed: String(rec.speed || ""),
            timeInIgnition: "",
            fuelReading: "",
            satellites: String(gps?.ps ?? ""),
            availabilityStatus: String(rec.status || ""),
            movement: Number(rec.speed) > 5 ? "moving" : "stationary",
            status: rec.status === "offline" ? "offline" : Number(rec.speed) > 5 ? "online" : "warning",
            lat: typeof rec.lat === "number" ? rec.lat : undefined,
            lng: typeof rec.lng === "number" ? rec.lng : undefined,
            telemetryAtMs: lastSeenIso ? Date.parse(lastSeenIso) : undefined
          } as AssetRow;
        });

      const liveRows = extraCms.length ? extraCms : cmsRows;
      const usedLive = new Set<string>();
      const storedWithLiveFix = allMappedBase
        .filter((row) => !isCms808LiveAsset(row))
        .map((row) => {
          const live = findCms808LiveMatch(row, liveRows);
          if (!live) return row;
          usedLive.add(String(live.id));
          return overlayCms808LiveFields(row, live);
        });
      const allMapped = [
        ...storedWithLiveFix,
        ...liveRows.filter((row) => !usedLive.has(String(row.id)))
      ];
      if (!allMapped.length) return;
      setSelectedAssets((current) => {
        if (current.size === 0) return current;
        const visibleIds = new Set(allMapped.map((asset) => String(asset.id ?? "").trim()).filter(Boolean));
        const next = new Set(Array.from(current).filter((id) => visibleIds.has(String(id ?? "").trim())));
        if (next.size === current.size) return current;
        return next;
      });
      noteRowWriter("reload-stored");
      setAssetRows((current) => mergeAssetRows(current, allMapped));

      const liveByImei = await fetchTraccarLiveSnapshotsByImei();
      if (!mounted) return;
      await ensureBindingFuelCache(allMapped);
      const withLive = allMapped.map((row) => {
        if (isCms808LiveAsset(row)) return row;
        const imei = normalizeImeiCandidate(row.imei);
        const snapshot = imei ? liveByImei.get(imei) : undefined;
        const merged = mergeTraccarLiveSnapshotIntoAssetRow(row, snapshot, siteTimeZones);
        const calibrated = withBindingFuelReading(merged, snapshot);
        if (calibrated.fuelReading) return calibrated;
        return {
          ...calibrated,
          fuelReading: resolveFuelReadingForAsset(calibrated, new Map(), row)
        };
      });
      orgContextPendingRefreshRef.current = false;
      pendingRefreshScopeRef.current = "";
      scopeRetryRef.current = 0;
      lastSuccessfulScopeRef.current = requestScopeSignature;

      noteRowWriter("reload-live");
      setAssetRows((current) => mergeAssetRows(current, withLive));

      // UK: when config → device binding has CAN library on C1/C2, pull GetCanBus into live rows.
      if (isGpsIotServer()) {
        void (async () => {
          const attached = await loadCanAttachedAssetIds(withLive);
          if (!mounted || !attached.size) return;
          const enriched = [...withLive];
          const jobs = Array.from(attached.entries()).slice(0, 30);
          await Promise.all(
            jobs.map(async ([key, meta]) => {
              try {
                const canbus = await getGpsIotCanBus({ assetId: meta.assetId });
                const index = enriched.findIndex(
                  (row) =>
                    String(row.id ?? "").trim() === key
                    || resolveGpsIotFuelAssetId(row) === meta.assetId
                );
                if (index < 0) return;
                enriched[index] = applyCanBusToAssetRow(enriched[index], canbus, meta.protocol) as AssetRow;
              } catch {
                // Skip assets without CAN telemetry.
              }
            })
          );
          if (!mounted) return;
          noteRowWriter("reload-can");
          setAssetRows((current) => mergeAssetRows(current, enriched));
        })();
      }
    };

    void loadAssets();
    refreshTimer = window.setInterval(() => {
      void loadAssets();
    }, 20_000);
    return () => {
      mounted = false;
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgLoadKey]);

  // UK hybrid: ensure Data Forwarding pushes Common JSON into /ingest/gpsiot for Live Tracking.
  useEffect(() => {
    if (!isGpsIotServer()) return;
    let cancelled = false;
    void ensureGpsIotLiveForwarding().then((result) => {
      if (cancelled || result.ok) return;
      console.warn("GPS IoT live forwarding ensure:", result.error || result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [orgLoadKey]);

  useEffect(() => {
    if (!cms808HierarchyActive()) return;
    let cancelled = false;
    let timer: number | null = null;
    const pollCms = async () => {
      const vehicles = await loadCms808VehiclesForActiveHierarchy().catch(() => []);
      if (cancelled) return;
      const liveRows: AssetRow[] = (
        await Promise.all(
          vehicles.slice(0, 20).map(async (vehicle) => {
            const gps = await loadCms808Position(vehicle).catch(() => null);
            if (!gps || !cms808GpsTime(gps)) return null;
            return formatCms808LiveRow(cms808VehicleToLiveRow(vehicle, gps) as AssetRow, siteTimeZones);
          })
        )
      ).filter((row): row is AssetRow => Boolean(row));
      if (!cancelled && liveRows.length) {
        noteRowWriter("cms808-poll");
        setAssetRows((prev) => {
          const used = new Set<string>();
          const next = prev.map((row) => {
            const live = findCms808LiveMatch(row, liveRows);
            if (!live) return row;
            used.add(String(live.id));
            return overlayCms808LiveFields(row, live);
          });
          const extras = liveRows.filter((row) => {
            if (used.has(String(row.id))) return false;
            return !next.some((item) => String(item.id) === String(row.id) || (item.imei && item.imei === row.imei));
          });
          return extras.length ? [...next, ...extras] : next;
        });
      }
      if (!cancelled) timer = window.setTimeout(() => void pollCms(), 5_000);
    };
    void pollCms();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orgLoadKey, siteTimeZones]);

  useEffect(() => {
    if (!assetRows.length) return;
    if (wsLiveOpen) return;

    let cancelled = false;
    let timer: number | null = null;

    const pollLivePositions = async () => {
      const liveByImei = await fetchTraccarLiveSnapshotsByImei();
      if (cancelled) return;

      if (liveByImei.size) {
        await ensureBindingFuelCache(assetRowsRef.current);
        if (cancelled) return;
        noteRowWriter("http-live-poll");
        setAssetRows((prev) =>
          prev.map((row) => {
            const imei = normalizeImeiCandidate(row.imei);
            const snapshot = imei ? liveByImei.get(imei) : undefined;
            const merged = mergeTraccarLiveSnapshotIntoAssetRow(row, snapshot, siteTimeZones);
            return withBindingFuelReading(merged, snapshot);
          })
        );
      }

      timer = window.setTimeout(() => {
        void pollLivePositions();
      }, 5_000);
    };

    void pollLivePositions();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [assetRows.length, siteTimeZones, wsLiveOpen]);

  // WebSocket primary for live positions (HTTP poll + SSE are fallbacks when closed).
  // Shared client keeps the socket alive across navigations while any page is subscribed.
  useEffect(() => {
    const client = getSharedRealtimeClient();
    const unsub = client.subscribe({
      channels: ["live"],
      site: readActiveSiteName(),
      onStatus: (status) => setWsLiveOpen(status === "open"),
      onMessage: (message) => {
        if (message.type === "catalog.assets") {
          // Position-only refreshes (the CMS808 cron) are already covered by the live
          // polls; a full context refresh here reloaded the list and blinked markers.
          if (String((message.payload as any)?.reason ?? "").trim() === "positions") return;
          const eventTenant = String((message.payload as any)?.tenantId ?? "").trim();
          const activeTenant = String(readActiveTenantId() || getTenantId() || "").trim();
          if (eventTenant && activeTenant && eventTenant !== activeTenant) return;
          clearCachedAssets(activeTenant || null);
          window.dispatchEvent(
            new CustomEvent("vivi:assetschange", {
              detail: { tenantId: activeTenant || eventTenant, reason: "catalog" }
            })
          );
          return;
        }
        if (message.type !== "live.positions") return;
        const live = Array.isArray((message.payload as any)?.live)
          ? ((message.payload as any).live as any[])
          : [];
        const liveByImei = buildTraccarLiveSnapshotsFromRows(live);
        if (!liveByImei.size) return;
        void ensureBindingFuelCache(assetRowsRef.current).then(() => {
          noteRowWriter("ws-live");
          setAssetRows((prev) =>
            prev.map((row) => {
              const imei = normalizeImeiCandidate(row.imei);
              const snapshot = imei ? liveByImei.get(imei) : undefined;
              const merged = mergeTraccarLiveSnapshotIntoAssetRow(row, snapshot, siteTimeZonesRef.current);
              return withBindingFuelReading(merged, snapshot);
            })
          );
        });
      }
    });
    return () => {
      unsub();
      setWsLiveOpen(false);
    };
  }, []);

  useEffect(() => {
    if (!tableRef.current || !hScrollInnerRef.current) return;
    hScrollInnerRef.current.style.width = `${tableRef.current.scrollWidth}px`;
  }, [activeCols.length, assetRows.length]);

  useEffect(() => {
    if (!lockedAssetId) return;
    const assetIndex = assetRows.findIndex((row) => row.id === lockedAssetId);
    if (assetIndex < 0) return;
    const asset = assetRows[assetIndex];
    focusAssetOnMap(asset, assetIndex);
  }, [lockedAssetId, assetRows]);

  useEffect(() => {
    if (!lockedAssetId) return;
    const assetIndex = assetRows.findIndex((row) => row.id === lockedAssetId);
    if (assetIndex < 0) return;
    const asset = assetRows[assetIndex];
    focusAssetOnMap(asset, assetIndex);
  }, [lockedAssetId, assetRows]);
    // Single effect: full focus when lock is first applied; smooth pan-only on telemetry updates.
    useEffect(() => {
      if (!lockedAssetId) {
        prevLockedAssetIdRef.current = null;
        return;
      }
      const assetIndex = assetRows.findIndex((row) => row.id === lockedAssetId);
      if (assetIndex < 0) return;
      const asset = assetRows[assetIndex];
      const justLocked = prevLockedAssetIdRef.current !== lockedAssetId;
      prevLockedAssetIdRef.current = lockedAssetId;
      if (justLocked) {
        // User just locked this asset — zoom in, pan, open popup
        focusAssetOnMap(asset, assetIndex);
      } else {
        // Telemetry update while already locked — just smooth-pan, keep popup stable
        const pos = getAssetLatLng(asset, assetIndex);
        if (pos && mapRef) {
          mapRef.panTo([pos.lat, pos.lng], { animate: true, duration: 0.5 });
        }
      }
    }, [lockedAssetId, assetRows]);

  useEffect(() => {
    if (!openActions || !menuAnchor || !menuRef.current) return;

    const positionMenu = () => {
      if (!menuAnchor || !menuRef.current) return;
      const menuRect = menuRef.current.getBoundingClientRect();
      const margin = 8;
      const maxLeft = window.innerWidth - menuRect.width - margin;
      const nextLeft = Math.min(Math.max(margin, menuAnchor.left), Math.max(margin, maxLeft));
      const downTop = menuAnchor.bottom + margin;
      const canOpenDown = downTop + menuRect.height <= window.innerHeight - margin;
      const nextTop = canOpenDown
        ? downTop
        : Math.max(margin, menuAnchor.top - menuRect.height - margin);

      setMenuPlacement(canOpenDown ? "down" : "up");
      setMenuLeft(Math.round(nextLeft));
      setMenuTop(Math.round(nextTop));
    };

    const raf = window.requestAnimationFrame(positionMenu);
    const handleResize = () => positionMenu();
    const handleScroll = () => positionMenu();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [openActions, menuAnchor]);

  const filteredAssets = assetRows.filter((asset) => {
    if (!matchesLayerFilter(asset)) return false;

    const query = assetsFilter.trim().toLowerCase();
    if (!query) return true;
    const liveRow = toLiveFleetRow({
      id: asset.id,
      registration: asset.registration,
      assetDescription: asset.assetDescription,
      site: asset.site,
      database: asset.database
    });
    return (
      asset.assetDescription.toLowerCase().includes(query) ||
      asset.registration.toLowerCase().includes(query) ||
      asset.fleetNumber.toLowerCase().includes(query) ||
      String(asset.database ?? "").toLowerCase().includes(query) ||
      asset.site.toLowerCase().includes(query) ||
      liveRow.siteFamily.toLowerCase().includes(query) ||
      liveRow.breadcrumb.toLowerCase().includes(query)
    );
  });

  const tableSourceAssets = useMemo(
    () =>
      filteredAssets.filter((asset) => {
        if (!showSelectedOnly) return true;
        return selectedAssets.has(asset.id);
      }),
    [filteredAssets, showSelectedOnly, selectedAssets]
  );

  const getLiveSortValue = useCallback(
    (row: AssetRow, key: string) => getLiveColumnTextValue(key as ColumnKey, row),
    []
  );

  const {
    sortedRows: sortedTableAssets,
    sort: assetTableSort,
    getHeaderProps: getLiveHeaderProps
  } = useColumnSort({
    rows: tableSourceAssets,
    getValue: getLiveSortValue
  });

  const visibleAssetRows = assetTableSort
    ? sortedTableAssets
    : createHierarchyArranger().sort(tableSourceAssets);

  const visibleAssetItems = useMemo(() => {
    if (assetTableSort) {
      return visibleAssetRows.map((asset) => ({ type: "asset" as const, asset }));
    }
    const arranger = createHierarchyArranger();
    const sites = new Set(visibleAssetRows.map((asset) => String(asset.site ?? "").trim().toLowerCase()));
    const showGroups = sites.size > 1;
    const items: Array<
      | { type: "group"; key: string; title: string; path: string }
      | { type: "asset"; asset: (typeof visibleAssetRows)[number] }
    > = [];
    let lastKey = "";
    for (const asset of visibleAssetRows) {
      if (showGroups) {
        const group = arranger.groupFor(asset);
        if (group.key !== lastKey) {
          items.push({ type: "group", ...group });
          lastKey = group.key;
        }
      }
      items.push({ type: "asset", asset });
    }
    return items;
  }, [assetTableSort, visibleAssetRows]);

  const columnWidths = useMemo(() => {
    const widthByKey = new Map<ColumnKey, number>();
    for (const col of activeCols) {
      widthByKey.set(col.key, estimateLiveColumnWidth(col.key, col.label, visibleAssetRows, col.minWidth));
    }
    return widthByKey;
  }, [activeCols, visibleAssetRows]);

  // Add 3 for: checkbox, status, actions
  // Rows are subgrids of the table wrapper, so each column grows to its longest cell.
  const gridTemplate = `32px 24px ${activeCols.map((col) => `minmax(${columnWidths.get(col.key) ?? col.minWidth}px, max-content)`).join(" ")} 48px`;

  useEffect(() => {
    const syncColumnGuides = () => {
      const wrapper = tableRef.current;
      const head = tableHeadRef.current;
      const body = tableBodyRef.current;
      if (!wrapper || !head || !body) return;

      const headerCells = Array.from(head.children) as HTMLDivElement[];
      if (!headerCells.length) {
        setColumnGuideOffsets([]);
        setColumnGuideWidth(0);
        setColumnGuideHeight(0);
        return;
      }

      const nextOffsets = [0, ...headerCells.map((cell) => cell.offsetLeft + cell.offsetWidth)];
      const nextWidth = Math.max(head.scrollWidth, body.scrollWidth, wrapper.scrollWidth);
      const nextHeight = head.offsetHeight + body.offsetHeight;

      setColumnGuideOffsets((current) => {
        if (current.length === nextOffsets.length && current.every((value, index) => value === nextOffsets[index])) {
          return current;
        }
        return nextOffsets;
      });
      setColumnGuideWidth((current) => (current === nextWidth ? current : nextWidth));
      setColumnGuideHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    syncColumnGuides();

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => syncColumnGuides())
      : null;

    if (resizeObserver) {
      if (tableRef.current) resizeObserver.observe(tableRef.current);
      if (tableHeadRef.current) resizeObserver.observe(tableHeadRef.current);
      if (tableBodyRef.current) resizeObserver.observe(tableBodyRef.current);
    }

    window.addEventListener("resize", syncColumnGuides);
    return () => {
      window.removeEventListener("resize", syncColumnGuides);
      resizeObserver?.disconnect();
    };
  }, [gridTemplate, visibleAssetRows.length, sidebarWidth]);

  const toggleLocation = (id: string) => {
    setSelectedLocations((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEvent = (id: string) => {
    setSelectedEvents((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAsset = (id: string) => {
    setSelectedAssets((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDrawTool = (tool: GeoShape["type"]) => {
    setActiveDrawTool((current: GeoShape["type"] | null) => (current === tool ? null : tool));
  };

  const setAssetContext = (asset: AssetRow) => {
    const assetLabel = `${asset.assetDescription} - ${asset.registration}`;
    writeActiveAssetPrefs({
      asset: assetLabel,
      registration: asset.registration ?? "",
      imei: ""
    });
    localStorage.setItem("vivi.activeSite", asset.site ?? "");
    clearUserPref(USER_PREF_KEYS.contextType);
    clearUserPref(USER_PREF_KEYS.contextName);
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const openAssetsWindow = (asset?: AssetRow) => {
    if (asset) {
      window.open(
        `/Track/tracking/live?view=asset&assetId=${encodeURIComponent(asset.id)}`,
        "_blank",
        "noopener,noreferrer,width=980,height=700"
      );
      return;
    }
    window.open("/Track/fleet/assets", "_blank", "noopener,noreferrer");
  };

  const handleQueryPoint = () => {
    setQueryMode((current) => !current);
    setQueryResult(null);
    setQueryCursor(null);
    setQueryLoading(false);
    setActiveDrawTool(null);
    setShowCreateLocationTools(false);
    setShowMapLayers(false);
    setShowMapRotate(false);
    setMeasureMode(null);
  };

  const handleSelectAndZoom = () => {
    setActiveDrawTool(null);
    setShowCreateLocationTools(false);
    setShowMapRotate(false);
    setQueryMode(false);
    setMeasureMode(null);
  };

  const handleMeasureDistance = () => {
    setShowMapToolsPanel(false);
    setShowCreateLocationTools(false);
    setActiveDrawTool(null);
    setShowMapLayers(false);
    setShowMapRotate(false);
    setQueryMode(false);
    setMeasureMode((current) => (current === "distance" ? null : "distance"));
    setMeasureLine(null);
    setMeasureMeters(null);
    setMeasureStart(null);
    setMeasureAnchor(null);
    setRouteLatLngs(null);
    setRoutePixels(null);
    setRouteStatus("idle");
    setMeasureHint("Press at point A, drag to point B, then release.");
  };

  const handleMeasureArea = () => {
    setShowCreateLocationTools(true);
    setActiveDrawTool("polygon");
    setQueryMode(false);
    setMeasureMode(null);
  };

  const handleSaveMapLayers = () => {
    try {
      writeUserScopedJson("vivi.liveTracking.mapLayers", mapLayers);
    } catch {
      // ignore storage failures
    }
    void saveToApi("live-tracking:map-layers", {
      ...mapLayers,
      updatedAt: new Date().toISOString()
    });
    setShowMapLayers(false);
  };

  const toggleMapFullscreen = () => {
    if (!mapSectionRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void mapSectionRef.current.requestFullscreen();
  };

  const getAssetLatLng = (asset: AssetRow, index: number) => {
    const normalizedCoords = normalizeAssetLatLng(asset);
    if (!normalizedCoords) return null;
    let { lat, lng } = normalizedCoords;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    return { lat, lng };
  };

  const liveMapCenter =
    assetRows.map((asset, index) => getAssetLatLng(asset, index)).find((position) => position !== null)
    ?? LIVE_MAP_DEFAULT_CENTER;

  const focusAssetOnMap = (asset: AssetRow, index: number) => {
    const pos = getAssetLatLng(asset, index);
    if (!pos) {
      setShowToast({ id: asset.id, text: "No GPS position available for this asset yet." });
      window.setTimeout(() => setShowToast(null), 3500);
      return;
    }

    const { lat, lng } = pos;
    if (mapRef) {
      const maxZoomCandidate = typeof mapRef.getMaxZoom === "function" ? Number(mapRef.getMaxZoom()) : Number.NaN;
      const maxZoom = Number.isFinite(maxZoomCandidate) ? maxZoomCandidate : 18;
      if (typeof mapRef.setView === "function") {
        mapRef.setView([lat, lng], maxZoom, { animate: true });
      } else {
        mapRef.panTo({ lat, lng });
        mapRef.setZoom?.(maxZoom);
      }
    }

    openAssetPopup(asset, index, lat, lng);
  };

  const isSingleAssetView = new URLSearchParams(location.search).get("view") === "asset";
  const singleAssetId = new URLSearchParams(location.search).get("assetId");
  const singleAssetIndex = singleAssetId ? assetRows.findIndex((asset) => asset.id === singleAssetId) : -1;
  const singleAsset = singleAssetIndex >= 0 ? assetRows[singleAssetIndex] : null;
  const singleAssetLatLng = singleAsset
    ? (getAssetLatLng(singleAsset, singleAssetIndex) ?? { lat: liveMapCenter.lat, lng: liveMapCenter.lng })
    : { lat: liveMapCenter.lat, lng: liveMapCenter.lng };

  const [activeInfoWindow, setActiveInfoWindow] = useState<string | null>(null);
  const [activeInfoWindowPoint, setActiveInfoWindowPoint] = useState<ScreenPoint | null>(null);

  // Only re-check shares when the set of assets changes, not on every live position update
  // (that re-ran this every few seconds, one storage read per asset each time).
  const liveShareIdsKey = useMemo(
    () =>
      [...new Set(assetRows.map((asset) => String(asset.id ?? "").trim()).filter(Boolean))].sort().join("|"),
    [assetRows]
  );
  useEffect(() => {
    const ids = liveShareIdsKey ? liveShareIdsKey.split("|") : [];
    if (!ids.length) {
      setLiveShareByAssetId({});
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const refresh = async () => {
      const active = await getLiveShareActive(ids);
      if (cancelled || !active) return;
      const next: Record<string, { active: boolean; expiresAt?: string }> = {};
      for (const [assetId, info] of Object.entries(active)) {
        next[assetId] = {
          active: Boolean((info as any)?.active),
          ...(String((info as any)?.expiresAt ?? "").trim() ? { expiresAt: String((info as any).expiresAt) } : {})
        };
      }
      setLiveShareByAssetId(next);
      timer = window.setTimeout(refresh, 60_000);
    };

    void refresh();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [liveShareIdsKey]);

  const formatShareTimeLeft = (expiresAt: string | undefined) => {
    const raw = String(expiresAt ?? "").trim();
    if (!raw) return "active";
    const ms = Date.parse(raw) - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return "expired";
    const totalMin = Math.floor(ms / 60_000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const resolveTraccarDeviceId = async (asset: AssetRow): Promise<number | null> => {
    const storedId = Number(asset.traccarDeviceId);
    if (Number.isFinite(storedId) && storedId > 0) return storedId;

    const candidates = [
      deriveImeiFromAsset(asset),
      String(asset.assetId ?? "").trim(),
      String(asset.fleetNumber ?? "").trim(),
      String(asset.registration ?? "").trim()
    ].filter(Boolean);

    for (const uniqueId of candidates) {
      const cached = traccarDeviceByUniqueIdRef.current.get(uniqueId);
      if (typeof cached === "number") return cached;

      const devices = await getTraccarDevices({ uniqueId });
      const first = devices[0];
      if (first && typeof first.id === "number") {
        traccarDeviceByUniqueIdRef.current.set(uniqueId, first.id);
        return first.id;
      }
    }
    return null;
  };

  const bindingFuelKey = (asset: { site?: string; configGroup?: string; configurationGroup?: string }) => {
    const site = String(asset.site ?? readActiveSiteName() ?? "").trim().toLowerCase();
    const group = getAssetConfigGroup(asset).toLowerCase();
    return `${site}::${group}`;
  };

  const configFromBindingLists = (
    asset: AssetRow,
    groups: ConfigGroupRecord[],
    deviceBindings: DeviceBindingRecord[]
  ): DeviceFuelConfig | null => {
    const site = String(asset.site ?? readActiveSiteName() ?? "").trim();
    if (!site) return null;
    const groupName = getAssetConfigGroup(asset);
    const group = groupName
      ? groups.find(
          (row) =>
            String(row?.name ?? "").trim().toLowerCase() === groupName.toLowerCase()
            && sitesEquivalent(String(row?.site ?? ""), site)
        )
      : undefined;
    const fromGroup = group
      ? readDeviceFuelConfigFromBinding(
          resolveBindingByRef(deviceBindings, String(group.deviceBinding ?? ""), site)
        )
      : null;
    if (fromGroup && hasUsableFuelCalibration(fromGroup.calibrationPoints)) return fromGroup;

    const siteBindings = deviceBindings.filter((row) => sitesEquivalent(String(row.site ?? ""), site));
    for (const binding of siteBindings) {
      const config = readDeviceFuelConfigFromBinding(binding);
      if (config && hasUsableFuelCalibration(config.calibrationPoints)) return config;
    }
    // Linear (capacity × mV) / maxVoltage configs still drive the fuel graph.
    if (fromGroup) return fromGroup;
    for (const binding of siteBindings) {
      const config = readDeviceFuelConfigFromBinding(binding);
      if (config) return config;
    }
    return null;
  };

  const ensureBindingFuelCache = async (assets: AssetRow[]) => {
    const cache = bindingFuelCacheRef.current;
    if (cache.loadedAt && Date.now() - cache.loadedAt < 60_000 && cache.byKey.size) return cache.byKey;
    try {
      const [groups, bindings] = await Promise.all([
        getConfigurationGroups<ConfigGroupRecord>(),
        getBindings<DeviceBindingRecord>("devices")
      ]);
      const deviceBindings = Array.isArray(bindings) ? bindings : [];
      const groupRows = Array.isArray(groups) ? groups : [];
      const byKey = new Map<string, DeviceFuelConfig | null>();
      for (const asset of assets) {
        const key = bindingFuelKey(asset);
        if (byKey.has(key)) continue;
        byKey.set(key, configFromBindingLists(asset, groupRows, deviceBindings));
      }
      cache.loadedAt = Date.now();
      cache.byKey = byKey;
      return byKey;
    } catch {
      return cache.byKey;
    }
  };

  useEffect(() => {
    if (!showFuelAnalysisModal) return;
    let cancelled = false;
    const seen = new Set<string>();
    const latest = new Map<string, FuelAnalysisRow>();
    const stored: FuelAnalysisRow[] = [];

    const publish = () => {
      setFuelAnalysisRows([...stored].sort((a, b) => b.sortMs - a.sortMs).slice(0, 500));
    };

    const remember = (row: FuelAnalysisRow) => {
      if (seen.has(row.id)) return;
      seen.add(row.id);
      stored.push(row);
      const current = latest.get(row.assetId);
      if (!current || row.sortMs >= current.sortMs) latest.set(row.assetId, row);
    };

    const fuelConfigFor = (asset: AssetRow) => {
      const cached = bindingFuelCacheRef.current.byKey.get(bindingFuelKey(asset));
      if (cached) return cached;
      const record = asset as AssetRow & {
        viviFuelAnalogInput?: unknown;
        viviFuelAnalogMvMin?: unknown;
        viviFuelAnalogMvMax?: unknown;
        viviFuelTankCapacity?: unknown;
        viviFuelCalibration?: unknown;
        fuelTankCapacity?: unknown;
      };
      return readDeviceFuelConfig({
        viviFuelAnalogInput: record.viviFuelAnalogInput,
        viviFuelAnalogMvMin: record.viviFuelAnalogMvMin,
        viviFuelAnalogMvMax: record.viviFuelAnalogMvMax,
        viviFuelTankCapacity: record.fuelTankCapacity ?? record.viviFuelTankCapacity,
        viviFuelCalibration: record.viviFuelCalibration
      });
    };

    const toLiveInput = (asset: AssetRow): FuelAnalysisSampleInput => {
      const speedMatch = String(asset.speed ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
      const speedKph = speedMatch ? Number(speedMatch[0]) : undefined;
      return {
        assetId: asset.id,
        registration: asset.registration || asset.assetDescription || asset.id,
        imei: asset.imei || "",
        trackerModel: asset.device || asset.mobileDeviceType || "Teltonika",
        deviceTimeMs: asset.telemetryAtMs ?? null,
        receivedTimeMs: Date.now(),
        latitude: asset.lat,
        longitude: asset.lng,
        speedKph: Number.isFinite(speedKph) ? speedKph : undefined,
        deviceAngleDeg: (() => {
          const headingText = String(asset.heading ?? "").trim();
          if (!headingText) return null;
          const headingNumber = Number(headingText);
          return Number.isFinite(headingNumber) ? headingNumber : null;
        })(),
        ignition: asset.ignition,
        attributes: asset.fuelAttributes,
        fuelConfig: fuelConfigFor(asset),
        displayedFuel: asset.fuelReading,
        site: asset.site,
        formatWhen: (ms) => formatTimestampForSite(new Date(ms).toISOString(), asset.site, siteTimeZonesRef.current),
        packetId: asset.telemetryAtMs ? String(asset.telemetryAtMs) : "",
        live: true
      };
    };

    const appendLive = async () => {
      const selected = selectedAssetsRef.current;
      const useLiveFeed = !isCms808Server();
      let liveRows: TraccarLiveRow[] = [];
      if (useLiveFeed) {
        try {
          liveRows = await getTraccarLive();
        } catch {
          liveRows = [];
        }
        if (cancelled) return;
      }
      const tickMs = Date.now();
      const source = assetRowsRef.current.filter((row) => {
        if (!matchesLayerFilter(row)) return false;
        if (activeSiteFilter && normalizeSiteText(row.site) !== normalizeSiteText(activeSiteFilter)) return false;
        if (fuelAnalysisSite !== "all" && normalizeSiteText(row.site) !== normalizeSiteText(fuelAnalysisSite)) return false;
        if (fuelAnalysisAssetId !== "all" && row.id !== fuelAnalysisAssetId) return false;
        return selected.size === 0 || selected.has(row.id);
      });
      let changed = false;
      for (const asset of source) {
        let input = toLiveInput(asset);
        if (useLiveFeed) {
          const imei = String(asset.imei ?? "").trim();
          const deviceId = String(asset.traccarDeviceId ?? "").trim();
          const row =
            liveRows.find((r) => imei && String(r.imei ?? "").trim() === imei) ??
            liveRows.find((r) => deviceId && String(r.deviceId ?? "") === deviceId);
          const position = row?.position;
          const positionMs = Date.parse(position?.deviceTime || position?.fixTime || position?.serverTime || "");
          input = {
            ...input,
            attributes: { ...(asset.fuelAttributes ?? {}), ...(position?.attributes ?? {}) },
            deviceTimeMs: Number.isFinite(positionMs) ? positionMs : input.deviceTimeMs,
            receivedTimeMs: tickMs,
            packetId: `${Math.floor(tickMs / 30_000)}`,
            sampleTick: tickMs
          };
        }
        const fingerprint = `fp:${fuelSampleFingerprint(input)}`;
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        remember(analyzeFuelSample(input, latest.get(asset.id) ?? null));
        changed = true;
      }
      if (changed) publish();
    };

    const loadHistory = async () => {
      setFuelAnalysisStatus("loading");
      setFuelAnalysisRows([]);
      const selected = selectedAssetsRef.current;
      const chosen = assetRowsRef.current.filter((row) => {
        if (!matchesLayerFilter(row)) return false;
        if (activeSiteFilter && normalizeSiteText(row.site) !== normalizeSiteText(activeSiteFilter)) return false;
        if (fuelAnalysisSite !== "all" && normalizeSiteText(row.site) !== normalizeSiteText(fuelAnalysisSite)) return false;
        if (fuelAnalysisAssetId !== "all" && row.id !== fuelAnalysisAssetId) return false;
        return selected.size === 0 || selected.has(row.id);
      });
      const historyAssets = fuelAnalysisAssetId !== "all" ? chosen.slice(0, 1) : chosen.slice(0, 4);
      try {
        await ensureBindingFuelCache(chosen.length ? chosen : assetRowsRef.current);
        const toMs = Number.isFinite(Date.parse(fuelAnalysisTo)) ? Date.parse(fuelAnalysisTo) : Date.now();
        const fromMs = Number.isFinite(Date.parse(fuelAnalysisFrom)) ? Date.parse(fuelAnalysisFrom) : toMs - 15 * 60 * 1000;
        const batches = await Promise.all(historyAssets.map(async (asset) => {
          const deviceId = asset.traccarDeviceId || await resolveTraccarDeviceId(asset);
          if (!deviceId) return [] as FuelAnalysisSampleInput[];
          const route = await getTraccarRoute({
            deviceId,
            from: new Date(fromMs).toISOString(),
            to: new Date(toMs).toISOString(),
            proxy: { bypassSlot: true, timeoutMs: 20000 }
          });
          const config = fuelConfigFor(asset);
          return route.slice(-240).map((point): FuelAnalysisSampleInput => {
            const deviceTimeMs = Date.parse(point.deviceTime || point.fixTime || "");
            const receivedTimeMs = Date.parse(point.serverTime || "");
            return {
              assetId: asset.id,
              registration: asset.registration || asset.assetDescription || asset.id,
              imei: asset.imei || "",
              trackerModel: asset.device || asset.mobileDeviceType || "Teltonika",
              deviceTimeMs: Number.isFinite(deviceTimeMs) ? deviceTimeMs : null,
              receivedTimeMs: Number.isFinite(receivedTimeMs) ? receivedTimeMs : null,
              latitude: point.latitude,
              longitude: point.longitude,
              speedKph: typeof point.speed === "number" ? point.speed * 1.852 : undefined,
              deviceAngleDeg: typeof point.course === "number" && Number.isFinite(point.course) ? point.course : null,
              attributes: point.attributes,
              fuelConfig: config,
              displayedFuel: asset.fuelReading,
              site: asset.site,
              formatWhen: (ms) => formatTimestampForSite(new Date(ms).toISOString(), asset.site, siteTimeZonesRef.current),
              packetId: point.id ? String(point.id) : "",
              live: false
            };
          });
        }));
        if (cancelled) return;
        const samples = batches.flat();
        for (const sample of samples) seen.add(`fp:${fuelSampleFingerprint(sample)}`);
        for (const row of buildFuelAnalysisRows(samples)) remember(row);
        await appendLive();
        publish();
        setFuelAnalysisStatus("ready");
      } catch {
        if (cancelled) return;
        await appendLive();
        publish();
        setFuelAnalysisStatus("ready");
      }
    };

    void loadHistory();
    const timer = window.setInterval(() => void appendLive(), isCms808Server() ? 1000 : 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [showFuelAnalysisModal, fuelAnalysisSite, fuelAnalysisAssetId, fuelAnalysisFrom, fuelAnalysisTo, activeSiteFilter]);

  const hierarchyFuelAssets = useMemo(
    () => assetRows.filter((asset) => matchesLayerFilter(asset)),
    [assetRows, activeSiteFilter, orgLoadKey]
  );

  const fuelAnalysisSites = useMemo(() => {
    const locked = String(activeSiteFilter ?? "").trim();
    if (locked) return [locked];
    const names = new Set<string>();
    for (const row of hierarchyFuelAssets) {
      const site = String(row.site ?? "").trim();
      if (site) names.add(site);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [hierarchyFuelAssets, activeSiteFilter]);

  const fuelAnalysisAssetOptions = useMemo(() => {
    const locked = String(activeSiteFilter ?? "").trim();
    return hierarchyFuelAssets
      .filter((row) => {
        if (locked && normalizeSiteText(row.site) !== normalizeSiteText(locked)) return false;
        if (!locked && fuelAnalysisSite !== "all" && normalizeSiteText(row.site) !== normalizeSiteText(fuelAnalysisSite)) return false;
        return true;
      })
      .slice()
      .sort((a, b) => String(a.registration || a.assetDescription).localeCompare(String(b.registration || b.assetDescription)));
  }, [hierarchyFuelAssets, fuelAnalysisSite, activeSiteFilter]);

  const fuelAnalysisColumns = useMemo(() => getFuelAnalysisColumns(!isCms808Server()), []);

  const visibleFuelAnalysisRows = useMemo(() => {
    const fromMs = Date.parse(fuelAnalysisFrom);
    const toMs = Date.parse(fuelAnalysisTo);
    return fuelAnalysisRows.filter((row) => {
      if (activeSiteFilter && normalizeSiteText(row.site) !== normalizeSiteText(activeSiteFilter)) return false;
      if (!activeSiteFilter && fuelAnalysisSite !== "all" && normalizeSiteText(row.site) !== normalizeSiteText(fuelAnalysisSite)) return false;
      if (fuelAnalysisAssetId !== "all" && row.assetId !== fuelAnalysisAssetId) return false;
      if (Number.isFinite(fromMs) && row.sortMs > 0 && row.sortMs < fromMs) return false;
      if (Number.isFinite(toMs) && row.sortMs > 0 && row.sortMs > toMs + 59_999) return false;
      return true;
    });
  }, [fuelAnalysisRows, fuelAnalysisSite, fuelAnalysisAssetId, fuelAnalysisFrom, fuelAnalysisTo, activeSiteFilter]);

  const formatFuelAnalysisRange = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const commitFuelAnalysisPicker = (date: Date, time: string) => {
    const [hours, minutes] = time.split(":").map((part) => Number(part));
    const next = new Date(date);
    next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    const value = fuelAnalysisLocalInput(next.getTime());
    if (fuelPickerTarget === "from") setFuelAnalysisFrom(value);
    if (fuelPickerTarget === "to") setFuelAnalysisTo(value);
    setFuelPickerDate(next);
    setFuelPickerTime(`${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`);
  };

  const openFuelAnalysisPicker = (target: "from" | "to") => {
    const raw = target === "from" ? fuelAnalysisFrom : fuelAnalysisTo;
    const parsed = new Date(raw);
    const safe = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    setFuelPickerTarget(target);
    setFuelPickerDate(safe);
    setFuelPickerTime(`${String(safe.getHours()).padStart(2, "0")}:${String(safe.getMinutes()).padStart(2, "0")}`);
    setFuelPickerMode("date");
  };

  const downloadFuelAnalysis = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { addBrandedSheetHeader, loadExportLogo, resolveExportScope, writeExportWorkbookBuffer } = await import("../utils/exportBranding");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Fuel-Temp Analysis", { views: [{ showGridLines: false }] });
    const scope = await resolveExportScope(
      fuelAnalysisSite !== "all" ? fuelAnalysisSite : String(activeSiteFilter ?? "").trim()
    );
    const nextRow = addBrandedSheetHeader(workbook, sheet, {
      title: "Fuel/Temp Analysis",
      scope,
      logoDataUrl: await loadExportLogo(),
      columnCount: fuelAnalysisColumns.length
    });
    const thin = { style: "thin" as const, color: { argb: "FFD1D5DB" } };
    const hasData = (value: unknown) => {
      const text = String(value ?? "").trim();
      return text !== "" && text !== "—";
    };
    const header = sheet.getRow(nextRow);
    header.values = fuelAnalysisColumns.map((column) => column.label);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
    for (const row of visibleFuelAnalysisRows) {
      const excelRow = sheet.addRow(fuelAnalysisColumns.map((column) => row.cells[column.key] ?? ""));
      const fill = row.event === "RAISE"
        ? "FFDCFCE7"
        : row.event === "SIPHONING"
          ? "FFFEE2E2"
          : row.event === "NOISE" || row.quality === "SUSPECT"
            ? "FFFEF3C7"
            : "";
      excelRow.eachCell({ includeEmpty: true }, (cell) => {
        if (hasData(cell.value)) cell.border = { top: thin, left: thin, bottom: thin, right: thin };
        if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      });
    }
    sheet.views = [{ state: "frozen", ySplit: nextRow, showGridLines: false }];
    fuelAnalysisColumns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = Math.min(36, Math.max(14, column.label.length + 2));
    });
    const buffer = await writeExportWorkbookBuffer(workbook);
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fuel-analysis.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  };

  const withBindingFuelReading = (
    row: AssetRow,
    snapshot: TraccarLiveSnapshot | undefined
  ): AssetRow => {
    const attributes = snapshot?.attributes ?? row.fuelAttributes;
    const kept = attributes ? { ...row, fuelAttributes: attributes } : row;
    const config = bindingFuelCacheRef.current.byKey.get(bindingFuelKey(kept)) ?? null;
    const reading = formatFuelReadingFromBinding(attributes, config);
    if (!reading) return kept;
    return { ...kept, fuelReading: reading };
  };

  const resolveFuelConfigFromAssetBinding = async (asset: AssetRow): Promise<DeviceFuelConfig | null> => {
    // Parameters pushed onto the asset at Config group Compile (site-scoped).
    const stamped = readDeviceFuelConfig({
      ...(asset.attributes && typeof asset.attributes === "object"
        ? (asset.attributes as Record<string, unknown>)
        : {}),
      viviFuelCalibration: (asset as any).viviFuelCalibration,
      viviFuelAnalogInput: (asset as any).viviFuelAnalogInput,
      viviFuelAnalogMvMin: (asset as any).viviFuelAnalogMvMin,
      viviFuelAnalogMvMax: (asset as any).viviFuelAnalogMvMax,
      viviFuelTankCapacity: (asset as any).fuelTankCapacity ?? (asset as any).viviFuelTankCapacity,
      viviFuelTankCapacityMax: (asset as any).fuelTankCapacity ?? (asset as any).viviFuelTankCapacityMax
    });

    const site = String(asset.site ?? readActiveSiteName() ?? "").trim();
    if (!site) return stamped;
    try {
      const [groups, bindings] = await Promise.all([
        getConfigurationGroups<ConfigGroupRecord>(),
        getBindings<DeviceBindingRecord>("devices")
      ]);
      const deviceBindings = Array.isArray(bindings) ? bindings : [];
      const groupName = getAssetConfigGroup(asset);
      const group = groupName
        ? (Array.isArray(groups) ? groups : []).find(
            (row) =>
              String(row?.name ?? "").trim().toLowerCase() === groupName.toLowerCase()
              && sitesEquivalent(String(row?.site ?? ""), site)
          )
        : undefined;
      const fromGroup = group
        ? readDeviceFuelConfigFromBinding(
            resolveBindingByRef(deviceBindings, String(group.deviceBinding ?? ""), site)
          )
        : null;
      if (fromGroup && hasUsableFuelCalibration(fromGroup.calibrationPoints)) return fromGroup;
      if (stamped && hasUsableFuelCalibration(stamped.calibrationPoints)) return stamped;
      if (fromGroup) return fromGroup;
      if (stamped) return stamped;

      const siteBindings = deviceBindings.filter((row) =>
        sitesEquivalent(String(row.site ?? ""), site)
      );
      for (const binding of siteBindings) {
        const config = readDeviceFuelConfigFromBinding(binding);
        if (config && hasUsableFuelCalibration(config.calibrationPoints)) return config;
      }
      for (const binding of siteBindings) {
        const config = readDeviceFuelConfigFromBinding(binding);
        if (config) return config;
      }
      return null;
    } catch {
      return stamped;
    }
  };

  const resolveTraccarFuelConfig = async (asset: AssetRow, deviceId?: number | null): Promise<DeviceFuelConfig | null> => {
    const id = deviceId ?? (await resolveTraccarDeviceId(asset));
    if (!id) return null;
    const cached = traccarFuelConfigByDeviceIdRef.current.get(id);
    if (cached) return cached;

    try {
      await ensureBindingFuelCache([asset]);
    } catch {
      // Binding cache is best-effort; continue with device attributes.
    }
    const fromBindingCache = bindingFuelCacheRef.current.byKey.get(bindingFuelKey(asset)) ?? null;
    if (fromBindingCache && hasUsableFuelCalibration(fromBindingCache.calibrationPoints)) {
      traccarFuelConfigByDeviceIdRef.current.set(id, fromBindingCache);
      return fromBindingCache;
    }

    let fromDevice: DeviceFuelConfig | null = null;
    const imei = deriveImeiFromAsset(asset);
    // Never pull the full device catalogue — that saturates the Traccar proxy and stalls the modal.
    if (imei) {
      try {
        const devices = await getTraccarDevices({ uniqueId: imei });
        const device = devices.find((row) => Number(row.id) === id) ?? devices[0];
        const attrs =
          device?.attributes && typeof device.attributes === "object"
            ? (device.attributes as Record<string, unknown>)
            : null;
        fromDevice = readDeviceFuelConfig(attrs);
      } catch {
        fromDevice = null;
      }
    }

    let fromBinding: DeviceFuelConfig | null = null;
    if (!fromBindingCache) {
      fromBinding = await resolveFuelConfigFromAssetBinding(asset);
    }

    const candidates = [fromBinding, fromBindingCache, fromDevice].filter(
      (row): row is DeviceFuelConfig => Boolean(row)
    );
    const withChart = candidates.find((row) => hasUsableFuelCalibration(row.calibrationPoints));
    const config = withChart ?? candidates[0] ?? null;
    if (config) traccarFuelConfigByDeviceIdRef.current.set(id, config);
    return config;
  };

  const resolveTraccarBaseUrl = async (): Promise<string> => {
    const cached = String(traccarBaseUrlRef.current ?? "").trim();
    if (cached) return cached;
    try {
      const apiKey = getApiKey();
      const tenantId = getTenantId();
      const response = await fetch(buildApiUrl("/config/traccar"), {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
          ...(tenantId ? { "x-tenant-id": tenantId } : {})
        }
      });
      if (!response.ok) return "";
      const payload = (await response.json()) as { baseUrl?: string | null };
      const base = String(payload?.baseUrl ?? "").trim().replace(/\/$/, "");
      if (!base) return "";
      traccarBaseUrlRef.current = base;
      return base;
    } catch {
      return "";
    }
  };

  const closeFuelModal = () => {
    if (fuelActiveLoadRef.current) fuelActiveLoadRef.current.cancelled = true;
    fuelActiveLoadRef.current = null;
    setShowFuelModal(false);
    setFuelModalAsset(null);
    setFuelModalStatus("idle");
    setFuelRawTrendPoints([]);
    setFuelCleanTrendPoints([]);
    setFuelSmoothedChangePoints([]);
    setFuelShowRawReadings(false);
    setFuelTankCapacityL(null);
    setFuelGeneratedAtMs(Date.now());
    setFuelTimeRange("12h");
    setShowFuelTimeRangeMenu(false);
    setFuelHoverIndex(null);
    setFuelEventDetailKind(null);
    setFuelLastRefill(null);
    setFuelLastRefillStatus("idle");
    setFuelLastRefillError("");
    setFuelModalError("");
    setFuelRouteDistanceKm(0);
    setFuelIgnitionUsedL(null);
    setFuelRange(resolveFuelTachoRange("12h"));
  };

  const resolveFuelChangeLocationName = async (
    lat: number,
    lng: number,
    addressHint?: string
  ): Promise<string> => {
    const fromRoute = String(addressHint ?? "").trim();
    if (fromRoute) return fromRoute;

    const key = buildReverseGeocodeKey(lat, lng);
    const cached = String(reverseGeocodeCacheRef.current.get(key) ?? "").trim();
    if (cached) return cached;

    const headers: Record<string, string> = { Accept: "application/json" };
    const apiKey = getApiKey();
    if (apiKey) headers["x-api-key"] = apiKey;

    try {
      const response = await fetch(
        buildApiUrl(`/api/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`),
        { headers }
      );
      if (!response.ok) return "";
      const body = (await response.json()) as {
        display_name?: string;
        name?: string;
        address?: Record<string, string>;
      };
      const resolved = String(
        body?.display_name
          ?? body?.name
          ?? body?.address?.road
          ?? body?.address?.suburb
          ?? body?.address?.hamlet
          ?? body?.address?.neighbourhood
          ?? body?.address?.locality
          ?? body?.address?.city
          ?? body?.address?.town
          ?? body?.address?.village
          ?? body?.address?.county
          ?? body?.address?.municipality
          ?? body?.address?.state_district
          ?? ""
      ).trim();
      if (resolved) {
        reverseGeocodeCacheRef.current.set(key, resolved);
        persistReverseGeocodeCache(reverseGeocodeCacheRef.current);
      }
      return resolved;
    } catch {
      return "";
    }
  };

  const enrichFuelChangePointsWithLocations = async (
    events: FuelChangePoint[],
    route: Awaited<ReturnType<typeof getTraccarRoute>>
  ): Promise<FuelChangePoint[]> => {
    return Promise.all(
      events.map(async (event) => {
        const nearest = nearestRoutePointAt(route, event.atMs);
        if (!nearest || !Number.isFinite(nearest.latitude) || !Number.isFinite(nearest.longitude)) {
          return event;
        }
        const locationName = await resolveFuelChangeLocationName(
          nearest.latitude,
          nearest.longitude,
          String(nearest.address ?? "").trim() || undefined
        );
        return {
          ...event,
          lat: nearest.latitude,
          lng: nearest.longitude,
          locationName: locationName || undefined
        };
      })
    );
  };

  const loadFuelTachographData = async (asset: AssetRow, timeRange: FuelTachoTimeRange) => {
    const { fromMs, toMs, label } = resolveFuelTachoRange(timeRange);
    if (fuelActiveLoadRef.current) fuelActiveLoadRef.current.cancelled = true;
    const loadToken = { cancelled: false };
    fuelActiveLoadRef.current = loadToken;
    const isStale = () => loadToken.cancelled || fuelActiveLoadRef.current !== loadToken;

    setFuelTimeRange(timeRange);
    setFuelRange({ fromMs, toMs });
    setFuelHoverIndex(null);
    setFuelEventDetailKind(null);
    setFuelLastRefill(null);
    setFuelLastRefillStatus("idle");
    setFuelLastRefillError("");
    setFuelModalError("");
    setFuelRawTrendPoints([]);
    setFuelCleanTrendPoints([]);
    setFuelSmoothedChangePoints([]);
    setFuelIgnitionUsedL(null);
    setFuelGeneratedAtMs(Date.now());
    setFuelModalStatus("loading");
    setShowFuelTimeRangeMenu(false);

    // Safety net only — deployed has no Promise.race timeout; that race was aborting localhost
    // while /reports/route was still in flight through the Vite proxy.
    const watchdog = setTimeout(() => {
      if (isStale()) return;
      loadToken.cancelled = true;
      if (fuelActiveLoadRef.current === loadToken) fuelActiveLoadRef.current = null;
      setFuelModalStatus("error");
      setFuelModalError(`Fuel history is taking too long for this ${label} window. Close and try again.`);
    }, 90_000);

    try {
      // UK GPS IoT: AssetFuelInfo + GetFuelTelemetry (litres) — same merge as Live Tracking.
      if (isGpsIotServer()) {
        const assetId = resolveGpsIotFuelAssetId(asset);
        if (!assetId) {
          setFuelModalStatus("ready");
          setFuelModalError("No GPS IoT Asset ID found for this asset.");
          return;
        }

        const [info, current] = await Promise.all([
          getGpsIotFuelInfo({
            assetId,
            imei: deriveImeiFromAsset(asset) || String(asset.imei ?? "").trim() || undefined,
            startDate: formatGpsIotFuelStamp(new Date(fromMs)),
            endDate: formatGpsIotFuelStamp(new Date(toMs)),
            timeZoneId: "UTC"
          }),
          getGpsIotCurrentFuelReading({ assetId }).catch(() => ({ fuelLevel: null as number | null, readings: [] }))
        ]);
        if (isStale()) return;

        const model = buildFuelModelFromGpsIotInfo(info, {
          currentLiters: current.fuelLevel,
          rangeEndMs: toMs
        });

        if (!model.trend.length && !(info.refills.length || info.drains.length) && current.fuelLevel == null) {
          setFuelModalStatus("ready");
          setFuelModalError(`No fuel history returned for this ${label} window.`);
          return;
        }

        let fuelConfig =
          bindingFuelCacheRef.current.byKey.get(bindingFuelKey(asset)) ?? null;
        try {
          fuelConfig = (await resolveFuelConfigFromAssetBinding(asset)) ?? fuelConfig;
        } catch {
          // Capacity from binding is optional on GPS IoT.
        }
        if (isStale()) return;

        if (typeof current.fuelLevel === "number" && Number.isFinite(current.fuelLevel)) {
          const litersLabel = formatFuelLiters(current.fuelLevel);
          noteRowWriter("fuel");
          setAssetRows((rows) =>
            rows.map((row) =>
              row.id === asset.id || row.assetId === asset.assetId || row.imei === asset.imei
                ? { ...row, fuelReading: litersLabel }
                : row
            )
          );
        }

        setFuelRawTrendPoints(model.trend);
        setFuelCleanTrendPoints(model.trend);
        setFuelSmoothedChangePoints(model.changePoints);
        setFuelTankCapacityL(
          typeof fuelConfig?.tankCapacity === "number" && fuelConfig.tankCapacity > 0
            ? fuelConfig.tankCapacity
            : null
        );
        setFuelGeneratedAtMs(Date.now());
        setFuelRouteDistanceKm(info.totalDistance > 0 ? info.totalDistance : 0);
        setFuelIgnitionUsedL(info.fuelUsed > 0 ? info.fuelUsed : null);
        setFuelModalStatus("ready");
        return;
      }

      // Match deployed Live Tracking: deviceId → getTraccarRoute(/reports/route) → trend/chart.
      const deviceId = await resolveTraccarDeviceId(asset);
      if (isStale()) return;
      if (!deviceId) {
        setFuelModalStatus("ready");
        setFuelModalError("No matching VIVI device found for this asset.");
        return;
      }

      const route = await getTraccarFuelRoute({
        deviceId,
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString()
      });
      if (isStale()) return;

      if (!route.length) {
        setFuelModalStatus("ready");
        setFuelModalError(`No position history returned for this ${label} window. Try again in a moment.`);
        return;
      }

      let fuelConfig =
        bindingFuelCacheRef.current.byKey.get(bindingFuelKey(asset))
        ?? traccarFuelConfigByDeviceIdRef.current.get(deviceId)
        ?? null;
      try {
        fuelConfig = (await resolveTraccarFuelConfig(asset, deviceId)) ?? fuelConfig;
      } catch {
        // Keep any cached config; graph can still plot from fuelLevel / io when present.
      }
      if (isStale()) return;

      const popup = buildLiveFuelPopupFromRoute(route, fuelConfig);
      const events = [...popup.drains, ...popup.refills];
      // Prefer ignition-cycle used fuel when the route reports ignition; otherwise
      // keep the accepted falling-run total from the same popup model.
      const ignitionUsedL = computeIgnitionCycleUsedFuelLitres({
        routePoints: route,
        fuelConfig,
        refillEvents: popup.refills
      });

      setFuelRawTrendPoints(popup.raw);
      setFuelCleanTrendPoints(buildFuelChartLinePreservingGaps(popup.line));
      setFuelSmoothedChangePoints(events);
      setFuelTankCapacityL(
        typeof fuelConfig?.tankCapacity === "number" && fuelConfig.tankCapacity > 0
          ? fuelConfig.tankCapacity
          : null
      );
      setFuelGeneratedAtMs(Date.now());
      setFuelRouteDistanceKm(buildRouteDistanceKm(route));
      setFuelIgnitionUsedL(ignitionUsedL != null ? ignitionUsedL : popup.fuelUsedL);
      setFuelModalStatus("ready");

      void enrichFuelChangePointsWithLocations(events, route).then((enriched) => {
        if (isStale()) return;
        setFuelSmoothedChangePoints(enriched);
      });
    } catch (error: any) {
      if (isStale()) return;
      setFuelModalStatus("error");
      setFuelModalError(String(error?.message ?? error ?? "Unable to load fuel Tacho Graph."));
    } finally {
      clearTimeout(watchdog);
      if (fuelActiveLoadRef.current === loadToken) {
        fuelActiveLoadRef.current = null;
      }
    }
  };

  const openFuelTachograph = (asset: AssetRow) => {
    if (!canUseFuelAnalysis) return;
    setShowFuelModal(true);
    setFuelModalAsset(asset);
    setFuelShowRawReadings(false);
    setFuelTimeRange("12h");
    void loadFuelTachographData(asset, "12h");
  };

  const showLastRefill = async () => {
    if (fuelEventDetailKind === "last-refill") {
      setFuelEventDetailKind(null);
      return;
    }

    setFuelEventDetailKind("last-refill");
    if (lastRefillInWindow) {
      setFuelLastRefill(lastRefillInWindow);
      setFuelLastRefillStatus("ready");
      setFuelLastRefillError("");
      return;
    }
    if (fuelLastRefill && fuelLastRefillStatus === "ready") return;

    const asset = fuelModalAsset;
    if (!asset) {
      setFuelLastRefillStatus("empty");
      return;
    }

    setFuelLastRefillStatus("loading");
    setFuelLastRefillError("");
    try {
      if (isGpsIotServer()) {
        const to = new Date();
        const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
        const assetId = resolveGpsIotFuelAssetId(asset);
        if (!assetId) {
          setFuelLastRefillStatus("empty");
          setFuelLastRefillError("No GPS IoT Asset ID found for this asset.");
          return;
        }
        const refills = await getGpsIotFuelRefills({
          assetId,
          imei: deriveImeiFromAsset(asset) || String(asset.imei ?? "").trim() || undefined,
          startDate: formatGpsIotFuelStamp(from),
          endDate: formatGpsIotFuelStamp(to),
          timeZoneId: "UTC"
        });
        const latest = refills
          .map((row) => ({ row, atMs: parseGpsIotFuelDateMs(String(row.date)) }))
          .filter((row) => Number.isFinite(row.atMs))
          .sort((left, right) => right.atMs - left.atMs)[0];
        if (!latest) {
          setFuelLastRefill(null);
          setFuelLastRefillStatus("empty");
          return;
        }
        setFuelLastRefill({
          atMs: latest.atMs,
          liters: latest.row.finalLevel,
          deltaLiters: latest.row.filled,
          rising: true,
          fromLevel: latest.row.initialLevel,
          toLevel: latest.row.finalLevel,
          lat: latest.row.latitude,
          lng: latest.row.longitude,
          locationName: latest.row.location
        });
        setFuelLastRefillStatus("ready");
        return;
      }
      const deviceId = await resolveTraccarDeviceId(asset);
      if (!deviceId) {
        setFuelLastRefillStatus("empty");
        setFuelLastRefillError("No matching VIVI device found for this asset.");
        return;
      }

      const toMs = Date.now();
      const fromMs = toMs - 30 * 24 * 60 * 60 * 1000;
      const route = await getTraccarRoute({
        deviceId,
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString()
      });
      if (!route.length) {
        setFuelLastRefill(null);
        setFuelLastRefillStatus("empty");
        return;
      }

      const fuelConfig = await resolveTraccarFuelConfig(asset, deviceId);
      const popup = buildLiveFuelPopupFromRoute(route, fuelConfig);
      const refills = popup.refills;
      if (!refills.length) {
        setFuelLastRefill(null);
        setFuelLastRefillStatus("empty");
        return;
      }

      const latest = refills.reduce((current, event) => (event.atMs > current.atMs ? event : current));
      const [enriched] = await enrichFuelChangePointsWithLocations([latest], route);
      setFuelLastRefill(enriched ?? latest);
      setFuelLastRefillStatus("ready");
    } catch (error: any) {
      setFuelLastRefill(null);
      setFuelLastRefillStatus("error");
      setFuelLastRefillError(String(error?.message ?? error ?? "Unable to find the last refill."));
    }
  };

  const fuelChartGeometry = useMemo(() => {
    const width = 960;
    const height = 400;
    const left = 78;
    const right = 18;
    const top = 14;
    const bottom = 58;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const fromMs = fuelRange.fromMs;
    const toMs = fuelRange.toMs;
    const bounds = fuelReportAxisBounds(
      fuelTrendPoints.map((point) => point.liters),
      fuelTankCapacityL
    );
    const minFuel = bounds.min;
    const maxFuel = bounds.max;

    const xForMs = (atMs: number) => {
      const ratio = (atMs - fromMs) / Math.max(1, toMs - fromMs);
      return left + Math.max(0, Math.min(1, ratio)) * innerWidth;
    };
    const yForFuel = (liters: number) => {
      const ratio = (liters - minFuel) / Math.max(1e-9, maxFuel - minFuel);
      return top + innerHeight - Math.max(0, Math.min(1, ratio)) * innerHeight;
    };

    const pointDots = fuelTrendPoints.map((point, index) => ({
      index,
      x: xForMs(point.atMs),
      y: yForFuel(point.liters),
      atMs: point.atMs,
      liters: point.liters,
      ignition: point.ignition,
      gapBefore: point.gapBefore === true
    }));

    const linePath = buildLinearSvgPath(pointDots);
    const bottomY = top + innerHeight;
    const areaParts: string[] = [];
    let areaSegment: typeof pointDots = [];
    const flushArea = () => {
      if (areaSegment.length < 2) {
        areaSegment = [];
        return;
      }
      const segmentLine = buildLinearSvgPath(areaSegment);
      const first = areaSegment[0];
      const last = areaSegment[areaSegment.length - 1];
      areaParts.push(`${segmentLine} L${last.x.toFixed(2)} ${bottomY.toFixed(2)} L${first.x.toFixed(2)} ${bottomY.toFixed(2)} Z`);
      areaSegment = [];
    };
    for (const dot of pointDots) {
      if (dot.gapBefore) flushArea();
      areaSegment.push(dot);
    }
    flushArea();
    const areaPath = areaParts.join(" ");

    const yTicks = fuelReportYTicks(maxFuel).map((liters) => ({
      liters,
      y: yForFuel(liters)
    }));

    const spanMs = Math.max(1, toMs - fromMs);
    const tickCount = spanMs <= 24 * 60 * 60 * 1000 ? 5 : 6;
    let previousDay = "";
    const xTicks = Array.from({ length: tickCount }, (_, idx) => {
      const atMs = fromMs + (idx / Math.max(1, tickCount - 1)) * spanMs;
      const day = new Date(atMs).toDateString();
      const withDate = idx === 0 || day !== previousDay;
      previousDay = day;
      const anchor: "start" | "middle" | "end" = idx === 0 ? "start" : idx === tickCount - 1 ? "end" : "middle";
      return { atMs, x: xForMs(atMs), label: formatFuelTachoAxisTime(atMs, spanMs, withDate), anchor };
    });

    const lastRefillDot =
      fuelLastRefill
      && fuelLastRefill.atMs >= fromMs
      && fuelLastRefill.atMs <= toMs
        ? {
            x: xForMs(fuelLastRefill.atMs),
            y: yForFuel(fuelLastRefill.toLevel),
            atMs: fuelLastRefill.atMs,
            liters: fuelLastRefill.toLevel
          }
        : null;

    return {
      width,
      height,
      left,
      top,
      innerWidth,
      innerHeight,
      minFuel,
      maxFuel,
      yTicks,
      xTicks,
      linePath,
      areaPath,
      pointDots,
      lastRefillDot
    };
  }, [fuelTrendPoints, fuelRange.fromMs, fuelRange.toMs, fuelTankCapacityL, fuelLastRefill]);

  const updateFuelHoverFromClientX = (clientX: number) => {
    const svg = fuelChartSvgRef.current;
    if (!svg || fuelChartGeometry.pointDots.length === 0) {
      setFuelHoverIndex(null);
      return;
    }

    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) {
      setFuelHoverIndex(null);
      return;
    }

    const xInSvg = ((clientX - rect.left) / rect.width) * fuelChartGeometry.width;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < fuelChartGeometry.pointDots.length; i += 1) {
      const distance = Math.abs(fuelChartGeometry.pointDots[i].x - xInSvg);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    setFuelHoverIndex(bestIndex);
  };
  const reverseGeocodeCacheRef = useRef<Map<string, string>>(loadReverseGeocodeCache());
  const reverseGeocodePendingRef = useRef(new Set<string>());
  useEffect(() => {
    activeInfoWindowRef.current = activeInfoWindow;
  }, [activeInfoWindow]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("live-tracking-page");
    return () => {
      document.body.classList.remove("live-tracking-page");
    };
  }, []);

  useEffect(() => {
    if (!showFuelTimeRangeMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (fuelTimeRangeMenuRef.current?.contains(target)) return;
      setShowFuelTimeRangeMenu(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showFuelTimeRangeMenu]);

  useEffect(() => {
    if (!assetRows.length) return;
    setSelectedAssets((current) => {
      if (current.size > 0) return current;
      return new Set(assetRows.map((row) => row.id));
    });
  }, [assetRows]);

  const mapAssets = (isSingleAssetView && singleAsset
    ? [singleAsset]
    : lockedAssetId
      ? assetRows.filter((asset) => asset.id === lockedAssetId)
      : assetRows.filter((asset) => matchesLayerFilter(asset))).filter((asset) => hasKnownLatLng(asset));

  useEffect(() => {
    if (!assetRows.length) return;
    const cache = reverseGeocodeCacheRef.current;
    if (!cache.size) return;
    noteRowWriter("geocode");
    setAssetRows((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return row;
        if (hasRealLocationLabel(row.location)) return row;
        const key = buildReverseGeocodeKey(lat, lng);
        const cached = String(cache.get(key) ?? "").trim();
        if (!cached || cached === row.location) return row;
        changed = true;
        return { ...row, location: cached };
      });
      return changed ? next : prev;
    });
  }, [assetRows]);

  useEffect(() => {
    if (!activeInfoWindow) return;
    const assetIndex = assetRows.findIndex((row) => row.id === activeInfoWindow);
    if (assetIndex < 0) return;

    const asset = assetRows[assetIndex];
    const pos = getAssetLatLng(asset, assetIndex);
    if (!pos) return;

    const key = buildReverseGeocodeKey(pos.lat, pos.lng);
    const cached = String(reverseGeocodeCacheRef.current.get(key) ?? "").trim();
    if (hasRealLocationLabel(cached)) {
      if (!hasRealLocationLabel(asset.location)) {
        noteRowWriter("geocode");
        setAssetRows((prev) => {
          let changed = false;
          const next = prev.map((row) => {
            if (row.id !== activeInfoWindow || hasRealLocationLabel(row.location)) return row;
            changed = true;
            return { ...row, location: cached };
          });
          return changed ? next : prev;
        });
      }
      return;
    }

    if (reverseGeocodePendingRef.current.has(key)) return;

    reverseGeocodePendingRef.current.add(key);
    const headers: Record<string, string> = { Accept: "application/json" };
    const apiKey = getApiKey();
    if (apiKey) headers["x-api-key"] = apiKey;

    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch(
          buildApiUrl(`/api/reverse-geocode?lat=${encodeURIComponent(String(pos.lat))}&lon=${encodeURIComponent(String(pos.lng))}`),
          { headers }
        );
        if (!response.ok) return;
        const body = (await response.json()) as { display_name?: string; name?: string; address?: Record<string, string> };
        const resolved = String(
          body?.display_name
            ?? body?.name
            ?? body?.address?.road
            ?? body?.address?.suburb
            ?? body?.address?.hamlet
            ?? body?.address?.neighbourhood
            ?? body?.address?.locality
            ?? body?.address?.city
            ?? body?.address?.town
            ?? body?.address?.village
            ?? body?.address?.county
            ?? body?.address?.municipality
            ?? body?.address?.state_district
            ?? ""
        ).trim();
        if (!resolved || cancelled) return;

        reverseGeocodeCacheRef.current.set(key, resolved);
        persistReverseGeocodeCache(reverseGeocodeCacheRef.current);
        noteRowWriter("geocode");
        setAssetRows((prev) => {
          let changed = false;
          const next = prev.map((row) => {
            const rowPos = normalizeAssetLatLng(row);
            if (!rowPos) return row;
            if (buildReverseGeocodeKey(rowPos.lat, rowPos.lng) !== key) return row;
            if (row.location === resolved) return row;
            changed = true;
            return { ...row, location: resolved };
          });
          return changed ? next : prev;
        });
      } catch {
        // ignore transient reverse geocode failures for the selected popup
      } finally {
        reverseGeocodePendingRef.current.delete(key);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeInfoWindow, assetRows]);

  const trailAssetIds = useMemo(() => mapAssets.map((asset) => asset.id), [mapAssets]);
  const visibleTrailAssetIds = useMemo(() => {
    if (trailAssetId) return [trailAssetId];
    if (!mapLayers.eventsOnTrail) return [] as string[];
    return trailAssetIds.filter((id) => (replayTrailByAsset[id]?.length ?? 0) >= 2);
  }, [trailAssetId, mapLayers.eventsOnTrail, trailAssetIds, replayTrailByAsset]);

  const tripReplayTrailAssetId = useMemo(() => {
    if (trailAssetId && (replayTrailByAsset[trailAssetId]?.length ?? 0) >= 2) return trailAssetId;
    if (lockedAssetId && (replayTrailByAsset[lockedAssetId]?.length ?? 0) >= 2) return lockedAssetId;
    return trailAssetId ?? lockedAssetId;
  }, [trailAssetId, lockedAssetId, replayTrailByAsset]);

  const tripReplayTrail = useMemo(() => {
    if (!tripReplayTrailAssetId) return [] as TrailPoint[];
    return [...(replayTrailByAsset[tripReplayTrailAssetId] ?? [])].sort((a, b) => a.atMs - b.atMs);
  }, [tripReplayTrailAssetId, replayTrailByAsset]);

  const tripReplayMetrics = useMemo(() => buildTrailReplayMetrics(tripReplayTrail), [tripReplayTrail]);
  const tripReplayMetricsRef = useRef(tripReplayMetrics);
  tripReplayMetricsRef.current = tripReplayMetrics;

  const tripReplayPosition = useMemo(() => {
    if (!tripReplayMetrics || tripReplayTrail.length < 2) return null;
    const atMs = tripReplayAtMs ?? tripReplayMetrics.startMs;
    return interpolateTrailAtMs(tripReplayTrail, atMs);
  }, [tripReplayTrail, tripReplayMetrics, tripReplayAtMs]);

  const tripReplayTraveledPositions = useMemo(() => {
    if (!tripReplayOpen || !tripReplayMetrics || tripReplayTrail.length < 2) return [] as [number, number][];
    const atMs = tripReplayAtMs ?? tripReplayMetrics.startMs;
    return buildTraveledTrailPositions(tripReplayTrail, atMs);
  }, [tripReplayOpen, tripReplayMetrics, tripReplayTrail, tripReplayAtMs]);

  const tripReplayDistanceKm = useMemo(() => {
    if (!tripReplayMetrics || tripReplayAtMs === null) return 0;
    return distanceKmAtTrailMs(tripReplayTrail, tripReplayMetrics.cumulativeDistanceKm, tripReplayAtMs);
  }, [tripReplayTrail, tripReplayMetrics, tripReplayAtMs]);

  const tripReplayAsset = useMemo(
    () => (tripReplayTrailAssetId ? assetRows.find((row) => row.id === tripReplayTrailAssetId) ?? null : null),
    [tripReplayTrailAssetId, assetRows]
  );

  useEffect(() => {
    if (!tripReplayMetrics) {
      setTripReplayAtMs(null);
      stopTripReplay();
      return;
    }
    setTripReplayAtMs((current) => {
      if (current === null || current < tripReplayMetrics.startMs || current > tripReplayMetrics.endMs) {
        tripReplayAtMsRef.current = tripReplayMetrics.startMs;
        return tripReplayMetrics.startMs;
      }
      tripReplayAtMsRef.current = current;
      return current;
    });
  }, [tripReplayMetrics?.startMs, tripReplayMetrics?.endMs, tripReplayTrailAssetId]);

  useEffect(() => {
    if (!tripReplayPlaying) {
      tripReplayLastFrameRef.current = null;
      if (tripReplayRafRef.current !== null) {
        cancelAnimationFrame(tripReplayRafRef.current);
        tripReplayRafRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled || !tripReplayPlayingRef.current) return;
      const metrics = tripReplayMetricsRef.current;
      if (!metrics) {
        setTripReplayPlaying(false);
        return;
      }

      const last = tripReplayLastFrameRef.current ?? now;
      tripReplayLastFrameRef.current = now;
      const deltaSim = Math.max(0, now - last) * tripReplaySpeedRef.current;
      if (deltaSim <= 0) {
        tripReplayRafRef.current = requestAnimationFrame(tick);
        return;
      }

      const base = tripReplayAtMsRef.current ?? metrics.startMs;
      const next = base + deltaSim;
      if (next >= metrics.endMs) {
        tripReplayAtMsRef.current = metrics.endMs;
        setTripReplayAtMs(metrics.endMs);
        setTripReplayPlaying(false);
        return;
      }

      tripReplayAtMsRef.current = next;
      setTripReplayAtMs(next);
      tripReplayRafRef.current = requestAnimationFrame(tick);
    };

    tripReplayLastFrameRef.current = performance.now();
    tripReplayRafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (tripReplayRafRef.current !== null) {
        cancelAnimationFrame(tripReplayRafRef.current);
        tripReplayRafRef.current = null;
      }
      tripReplayLastFrameRef.current = null;
    };
  }, [tripReplayPlaying]);

  useEffect(() => {
    if (lockedAssetId) return;
    if (!activeInfoWindow) return;
    if (tripReplayOpen && tripReplayPlaying && activeInfoWindow === tripReplayTrailAssetId) return;
    const assetIndex = assetRows.findIndex((row) => row.id === activeInfoWindow);
    if (assetIndex < 0) return;
    const asset = assetRows[assetIndex];
    const pos = getAssetLatLng(asset, assetIndex);
    if (!pos || !mapRef) return;
    mapRef.panTo([pos.lat, pos.lng], { animate: true, duration: 0.5 });
  }, [activeInfoWindow, assetRows, lockedAssetId, mapRef, tripReplayOpen, tripReplayPlaying, tripReplayTrailAssetId]);

  useEffect(() => {
    if (!activeInfoWindow || !mapRef) {
      setActiveInfoWindowPoint(null);
      return;
    }
    const assetIndex = assetRows.findIndex((row) => row.id === activeInfoWindow);
    if (assetIndex < 0) {
      setActiveInfoWindowPoint(null);
      return;
    }
    const asset = assetRows[assetIndex];
    const useReplayPosition =
      tripReplayOpen &&
      tripReplayTrailAssetId === activeInfoWindow &&
      tripReplayPosition;

    const resolvePopupPosition = () => {
      if (useReplayPosition && tripReplayPosition) {
        return { lat: tripReplayPosition.lat, lng: tripReplayPosition.lng };
      }
      return getAssetLatLng(asset, assetIndex);
    };

    const updatePopupPoint = () => {
      try {
        if (!mapRef.getPane?.("mapPane")) return;
        const pos = resolvePopupPosition();
        if (!pos) {
          setActiveInfoWindowPoint(null);
          return;
        }
        const point = mapRef.latLngToContainerPoint([pos.lat, pos.lng]);
        setActiveInfoWindowPoint({ x: point.x, y: point.y });
      } catch {
        setActiveInfoWindowPoint(null);
      }
    };

    updatePopupPoint();
    mapRef.on("move", updatePopupPoint);
    mapRef.on("zoom", updatePopupPoint);
    mapRef.on("resize", updatePopupPoint);
    return () => {
      mapRef.off("move", updatePopupPoint);
      mapRef.off("zoom", updatePopupPoint);
      mapRef.off("resize", updatePopupPoint);
    };
  }, [
    activeInfoWindow,
    assetRows,
    mapRef,
    tripReplayOpen,
    tripReplayTrailAssetId,
    tripReplayPosition,
    tripReplayAtMs
  ]);

  useEffect(() => {
    if (!mapRef || typeof mapRef.invalidateSize !== "function") return;
    const refreshMapSize = () => {
      window.requestAnimationFrame(() => {
        try {
          if (mapRef.getPane?.("mapPane")) mapRef.invalidateSize();
        } catch {
          // Map pane is not ready yet.
        }
      });
    };
    refreshMapSize();
    window.addEventListener("vivi:desktop-scale", refreshMapSize);
    return () => window.removeEventListener("vivi:desktop-scale", refreshMapSize);
  }, [mapRef]);

  const handleTripReplayToggle = async () => {
    if (tripReplayOpen) {
      setTripReplayOpen(false);
      stopTripReplay();
      return;
    }
    setTripReplayOpen(true);
    if (tripReplayTrail.length >= 2) return;
    const target =
      (trailAssetId ? assetRows.find((row) => row.id === trailAssetId) : null)
      ?? (lockedAssetId ? assetRows.find((row) => row.id === lockedAssetId) : null)
      ?? assetRows.find((row) => isTrackableLiveAsset(row));
    if (!target) {
      setShowToast({ id: "trip-replay", text: "Select an asset and load a trail to replay." });
      window.setTimeout(() => setShowToast(null), 4000);
      return;
    }
    await showTrailForAsset(target);
  };

  useEffect(() => {
    const targets = assetRows
      .filter((asset) => isTrackableLiveAsset(asset) && !hasRealLocationLabel(asset.location))
      .map((asset) => {
        const lat = Number(asset.lat);
        const lng = Number(asset.lng);
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? { id: String(asset.id ?? "").trim(), lat, lng, key: buildReverseGeocodeKey(lat, lng) }
          : null;
      })
      .filter((row): row is { id: string; lat: number; lng: number; key: string } => Boolean(row))
      .filter((row) => !reverseGeocodeCacheRef.current.has(row.key) && !reverseGeocodePendingRef.current.has(row.key));

    if (!targets.length) return;

    const run = async () => {
      const byKey = new Map<string, { id: string; lat: number; lng: number; key: string }>();
      for (const target of targets) {
        if (!byKey.has(target.key)) byKey.set(target.key, target);
      }
      const batch = Array.from(byKey.values()).slice(0, 24);
      if (!batch.length) return;

      for (const target of batch) reverseGeocodePendingRef.current.add(target.key);

      const headers: Record<string, string> = { Accept: "application/json" };
      const apiKey = getApiKey();
      if (apiKey) headers["x-api-key"] = apiKey;

      try {
        const results = await Promise.all(
          batch.map(async (target) => {
            try {
              const response = await fetch(
                buildApiUrl(
                  `/api/reverse-geocode?lat=${encodeURIComponent(String(target.lat))}&lon=${encodeURIComponent(String(target.lng))}`
                ),
                { headers }
              );
              if (!response.ok) return null;
              const body = (await response.json()) as { display_name?: string; name?: string; address?: Record<string, string> };
              const resolved = String(
                body?.display_name
                  ?? body?.name
                  ?? body?.address?.road
                  ?? body?.address?.suburb
                  ?? body?.address?.hamlet
                  ?? body?.address?.neighbourhood
                  ?? body?.address?.locality
                  ?? body?.address?.city
                  ?? body?.address?.town
                  ?? body?.address?.village
                  ?? body?.address?.county
                  ?? body?.address?.municipality
                  ?? body?.address?.state_district
                  ?? ""
              ).trim();
              if (!resolved) return null;
              return { key: target.key, resolved };
            } catch {
              return null;
            }
          })
        );

        const resolvedByKey = new Map<string, string>();
        for (const item of results) {
          if (!item) continue;
          resolvedByKey.set(item.key, item.resolved);
          reverseGeocodeCacheRef.current.set(item.key, item.resolved);
        }
        if (!resolvedByKey.size) return;

        persistReverseGeocodeCache(reverseGeocodeCacheRef.current);
        noteRowWriter("geocode");
        setAssetRows((prev) =>
          prev.map((row) => {
            if (hasRealLocationLabel(row.location)) return row;
            const lat = Number(row.lat);
            const lng = Number(row.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return row;
            const key = buildReverseGeocodeKey(lat, lng);
            const resolved = String(resolvedByKey.get(key) ?? "").trim();
            return resolved ? { ...row, location: resolved } : row;
          })
        );
      } finally {
        for (const target of batch) reverseGeocodePendingRef.current.delete(target.key);
      }
    };

    void run();
  }, [assetRows]);

  useEffect(() => {
    if (!trailAssetId) return;
    const exists = assetRows.some((row) => row.id === trailAssetId);
    if (!exists) {
      manualTrailAssetIdRef.current = null;
      setTrailAssetId(null);
    }
  }, [trailAssetId, assetRows]);
  const trailAssetIdentityKey = useMemo(
    () =>
      mapAssets
        .map((asset) => `${asset.id}:${normalizeImeiCandidate(asset.imei)}`)
        .sort()
        .join("|"),
    [mapAssets]
  );

  useEffect(() => {
    if (!mapLayers.eventsOnTrail) return;

    const apiKey = getApiKey();
    const tenantId = getTenantId();
    if (!apiKey || !tenantId) return;

    const tracked = mapAssets
      .map((asset) => ({ id: String(asset.id ?? "").trim(), imei: normalizeImeiCandidate(asset.imei) }))
      .filter((row) => row.id || row.imei);
    if (tracked.length === 0) return;

    const trackedAssetById = new Map(
      mapAssets
        .map((asset) => [String(asset.id ?? "").trim(), asset] as const)
        .filter(([id]) => id)
    );

    const trackedIds = new Set(tracked.map((row) => row.id).filter(Boolean));
    const trackedByImei = new Map<string, string>();
    for (const row of tracked) {
      if (row.imei && row.id && !trackedByImei.has(row.imei)) trackedByImei.set(row.imei, row.id);
    }

    const controller = new AbortController();

    const loadTrailHistory = async () => {
      try {
        if (isGpsIotServer()) {
          const hours = Math.max(1, Math.min(168, Number(mapLayers.hours) || 48));
          const fromIso = mapLayers.showEntireLastTrip
            ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
            : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
          const toIso = new Date().toISOString();
          const targets = (trailAssetId ? [trailAssetId] : trailAssetIds).slice(0, 12);
          const nextTrails: Record<string, TrailPoint[]> = {};
          const nextStarts: Record<string, TrailPoint[]> = {};
          const nextLast = new Map<string, number>();

          await Promise.all(targets.map(async (assetId) => {
            const asset = trackedAssetById.get(assetId);
            if (!asset) return;
            const imei = deriveImeiFromAsset(asset) || normalizeImeiCandidate(asset.imei);
            if (!imei) return;
            const devices = await getTraccarDevices({ uniqueId: imei }).catch(() => []);
            const deviceId = devices[0]?.id;
            if (deviceId == null) return;
            const route = await getTraccarRoute({
              deviceId,
              from: fromIso,
              to: toIso,
              allowPositionsFallback: false
            }).catch(() => []);
            const points = route
              .map((point) => {
                const atMs = parsePointTimestampMs(point);
                const lat = toFiniteNumber((point as any)?.latitude ?? (point as any)?.lat);
                const lng = toFiniteNumber((point as any)?.longitude ?? (point as any)?.lng ?? (point as any)?.lon);
                if (!Number.isFinite(atMs) || typeof lat !== "number" || typeof lng !== "number") return null;
                const speedKnots = toFiniteNumber((point as any)?.speed);
                const speedKph = typeof speedKnots === "number" ? speedKnots * 1.852 : undefined;
                const attributes = (point?.attributes ?? {}) as Record<string, unknown>;
                const locationLabel = pickBestLocationLabel(
                  attributes.locationName,
                  attributes.address,
                  (point as any)?.address,
                  asset.location
                );
                return {
                  lat,
                  lng,
                  atMs,
                  speedKph,
                  driver: String(attributes.driverName ?? attributes.driver ?? asset.driver ?? "").trim() || undefined,
                  location: hasRealLocationLabel(locationLabel) ? locationLabel : undefined
                } as TrailPoint;
              })
              .filter((row): row is TrailPoint => Boolean(row))
              .sort((a, b) => a.atMs - b.atMs)
              .filter((point, index, list) => {
                const prev = list[index - 1];
                if (!prev) return true;
                return !(Math.abs(prev.lat - point.lat) < 0.000001 && Math.abs(prev.lng - point.lng) < 0.000001);
              });
            if (points.length < 2) return;
            nextTrails[assetId] = points.slice(-1200);
            nextStarts[assetId] = [points[0]];
            nextLast.set(assetId, points[points.length - 1].atMs);
          }));

          setReplayTrailByAsset((prev) => {
            const merged: Record<string, TrailPoint[]> = { ...prev };
            for (const id of trailAssetIds) {
              if (id === manualTrailAssetIdRef.current) continue;
              if (nextTrails[id]) merged[id] = nextTrails[id];
            }
            return merged;
          });
          setTripStartFlagsByAsset((prev) => {
            const merged: Record<string, TrailPoint[]> = { ...prev };
            for (const id of trailAssetIds) {
              if (nextStarts[id]?.length) merged[id] = nextStarts[id];
            }
            return merged;
          });
          for (const [id, atMs] of nextLast.entries()) {
            trailLastPlottedAtRef.current.set(id, atMs);
          }
          return;
        }

        const query = new URLSearchParams();
        query.set("limit", "6000");
        query.set("to", new Date().toISOString());
        if (!mapLayers.showEntireLastTrip) {
          const hours = Math.max(1, Math.min(168, Number(mapLayers.hours) || 48));
          query.set("from", new Date(Date.now() - hours * 60 * 60 * 1000).toISOString());
        }

        let response = await fetch(buildApiUrl(`/telemetry/history?${query.toString()}`), {
          method: "GET",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "x-tenant-id": tenantId
          }
        });
        if (response.status === 404) {
          response = await fetch(buildApiUrl(`/api/telemetry/history?${query.toString()}`), {
            method: "GET",
            signal: controller.signal,
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "x-tenant-id": tenantId
            }
          });
        }
        if (!response.ok) return;

        const payload = (await response.json()) as any;
        const events = Array.isArray(payload?.events) ? payload.events : [];
        if (events.length === 0) return;

        const sampleMap = new Map<string, TrailSample[]>();
        const nextVideoEvents = new Map<string, VideoTrailEvent[]>();
        const nextSelectedNotificationEvents = new Map<string, TrailNotificationEvent[]>();
        const videoEnabledNotifications = await loadVideoEnabledNotificationNames();

        for (const event of events) {
          const data = event?.data && typeof event.data === "object" ? event.data : {};
          const eventAssetId = String(event?.assetId ?? (data as any)?.assetId ?? (data as any)?.id ?? "").trim();
          const eventImei = normalizeImeiCandidate(event?.imei ?? (data as any)?.imei);
          const mappedId = eventAssetId && trackedIds.has(eventAssetId)
            ? eventAssetId
            : eventImei
              ? trackedByImei.get(eventImei) ?? ""
              : "";
          if (!mappedId) continue;

          const lat = toFiniteNumber((data as any)?.lat ?? (data as any)?.latitude);
          const lng = toFiniteNumber((data as any)?.lng ?? (data as any)?.lon ?? (data as any)?.longitude);
          if (typeof lat !== "number" || typeof lng !== "number") continue;
          const satellites = extractSatelliteCount(data);
          if (typeof satellites !== "number" || satellites < MIN_SATELLITES_FOR_LOCK) continue;

          const moving = isMovingTelemetryPayload(data);
          const ignitionOn = isIgnitionOnPayload(data);
          const atMs = parseTelemetryAtMs(data, event?.createdAt ?? event?.created_at);
          const fallbackAsset = trackedAssetById.get(mappedId);
          const speedKphCandidate = toFiniteNumber(
            (data as any)?.speed ??
            (data as any)?.speedKph ??
            (data as any)?.velocity ??
            (data as any)?.telemetryLatest?.speed
          );
          const driver = String(
            (data as any)?.driver ??
            (data as any)?.driverName ??
            event?.driver ??
            fallbackAsset?.driver ??
            ""
          ).trim();
          const locationLabel = pickBestLocationLabel(
            (data as any)?.locationName,
            (data as any)?.lastLocation,
            (data as any)?.location,
            (data as any)?.address,
            (data as any)?.lastAddress,
            fallbackAsset?.location
          );
          const list = sampleMap.get(mappedId) ?? [];
          list.push({
            lat,
            lng,
            atMs,
            moving,
            ignitionOn,
            speedKph: typeof speedKphCandidate === "number" ? speedKphCandidate : undefined,
            driver: driver || undefined,
            location: hasRealLocationLabel(locationLabel) ? locationLabel : undefined
          });
          sampleMap.set(mappedId, list);

          const notificationLabels = extractNotificationLabelsFromPayload(data);
          const matchedSelectedNotifications = notificationLabels.filter((label) =>
            selectedNotificationTokens.has(normalizeNotificationToken(label))
          );
          if (matchedSelectedNotifications.length > 0) {
            const selectedEventsForAsset = nextSelectedNotificationEvents.get(mappedId) ?? [];
            selectedEventsForAsset.push({
              lat,
              lng,
              atMs,
              labels: matchedSelectedNotifications,
              speedKph: typeof speedKphCandidate === "number" ? speedKphCandidate : undefined,
              driver: driver || undefined,
              location: hasRealLocationLabel(locationLabel) ? locationLabel : undefined
            });
            nextSelectedNotificationEvents.set(mappedId, selectedEventsForAsset);
          }

          if (hasVideoEnabledNotification(notificationLabels, videoEnabledNotifications)) {
            const matches = notificationLabels.filter((label) => videoEnabledNotifications.has(label.trim().toLowerCase()));
            const videoEvents = nextVideoEvents.get(mappedId) ?? [];
            videoEvents.push({ lat, lng, atMs, labels: matches.length > 0 ? matches : notificationLabels });
            nextVideoEvents.set(mappedId, videoEvents);
          }
        }

        const nextTrails: Record<string, TrailPoint[]> = {};
        const nextStarts: Record<string, TrailPoint[]> = {};
        const nextRecordedVideos: Record<string, VideoTrailEvent[]> = {};
        const nextSelectedTrailNotifications: Record<string, TrailNotificationEvent[]> = {};
        const nextLast = new Map<string, number>();
        const nextIgnition = new Map<string, boolean>();
        for (const [assetId, samples] of sampleMap.entries()) {
          const trail = buildMovingTrailFromSamples(samples);
          const starts = buildTripStartFlagsFromSamples(samples);
          if (trail.length > 0) {
            nextTrails[assetId] = trail;
            nextLast.set(assetId, trail[trail.length - 1].atMs);
          }
          nextStarts[assetId] = starts.length > 0 ? starts : (trail[0] ? [trail[0]] : []);
          const ordered = [...samples].sort((a, b) => a.atMs - b.atMs);
          const tail = ordered[ordered.length - 1];
          nextIgnition.set(assetId, Boolean(tail?.ignitionOn));
        }
        for (const [assetId, points] of nextVideoEvents.entries()) {
          nextRecordedVideos[assetId] = points
            .sort((a, b) => a.atMs - b.atMs)
            .filter((point, index, list) => {
              const previous = list[index - 1];
              if (!previous) return true;
              return !(
                previous.atMs === point.atMs &&
                Math.abs(previous.lat - point.lat) < 0.000001 &&
                Math.abs(previous.lng - point.lng) < 0.000001 &&
                previous.labels.join("|") === point.labels.join("|")
              );
            });
        }
        for (const [assetId, points] of nextSelectedNotificationEvents.entries()) {
          nextSelectedTrailNotifications[assetId] = points
            .sort((a, b) => a.atMs - b.atMs)
            .filter((point, index, list) => {
              const previous = list[index - 1];
              if (!previous) return true;
              return !(
                previous.atMs === point.atMs &&
                Math.abs(previous.lat - point.lat) < 0.000001 &&
                Math.abs(previous.lng - point.lng) < 0.000001 &&
                previous.labels.join("|") === point.labels.join("|")
              );
            });
        }

        setReplayTrailByAsset((prev) => {
          const merged: Record<string, TrailPoint[]> = { ...prev };
          for (const id of trailAssetIds) {
            if (id === manualTrailAssetIdRef.current) continue;
            if (nextTrails[id]) merged[id] = nextTrails[id];
          }
          return merged;
        });
        setTripStartFlagsByAsset((prev) => {
          const merged: Record<string, TrailPoint[]> = { ...prev };
          for (const id of trailAssetIds) {
            if (nextStarts[id]?.length) merged[id] = nextStarts[id];
          }
          return merged;
        });
        setVideoTrailEventsByAsset((prev) => {
          const merged: Record<string, VideoTrailEvent[]> = { ...prev };
          for (const id of trailAssetIds) {
            if (nextRecordedVideos[id]) merged[id] = nextRecordedVideos[id];
          }
          return merged;
        });
        setTrailNotificationEventsByAsset((prev) => {
          const merged: Record<string, TrailNotificationEvent[]> = { ...prev };
          for (const id of trailAssetIds) {
            if (nextSelectedTrailNotifications[id]) merged[id] = nextSelectedTrailNotifications[id];
          }
          return merged;
        });
        trailLastPlottedAtRef.current = nextLast;
        lastIgnitionStateByAssetRef.current = nextIgnition;
      } catch {
        // ignore trail preload errors
      }
    };

    void loadTrailHistory();
    const refreshId = window.setInterval(() => {
      void loadTrailHistory();
    }, 30_000);
    return () => {
      window.clearInterval(refreshId);
      controller.abort();
    };
  }, [trailAssetIdentityKey, mapLayers.eventsOnTrail, mapLayers.showEntireLastTrip, mapLayers.hours, trailAssetId, selectedNotificationTokens]);

  // Same filters → same fleet on the map. A change here (site, lock, single-asset view,
  // fleet filter) drops markers at once instead of holding them through the grace period.
  const markerScopeKey = [
    readScopeSignature(),
    activeSiteFilter,
    lockedAssetId ?? "",
    isSingleAssetView ? `single:${singleAsset?.id ?? ""}` : "",
    fleetFilter ? "fleet-filter" : "",
    hideLiveMarkerAssetIdFor(tripReplayOpen, tripReplayTrailAssetId)
  ].join("|");
  const lastMarkerRowsRef = useRef<{ scopeKey: string; rows: Map<string, { row: MarkerRenderRow; seenAtMs: number }> }>({
    scopeKey: "",
    rows: new Map()
  });

  const markerRenderRows = useMemo(() => {
    const rows: MarkerRenderRow[] = [];
    const seen = new Set<string>();
    mapAssets.forEach((asset, index) => {
      const pos = getAssetLatLng(asset, index);
      if (!pos) return;
      const identity = String(asset.id ?? "").trim() || String(asset.imei ?? "").trim() || `idx-${index}`;
      const dedupeKey = identity;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      rows.push({
        asset,
        index,
        lat: pos.lat,
        lng: pos.lng,
        markerKey: identity
      });
    });

    // An asset can drop out of one refresh (list reload, a merge without coordinates)
    // and come back on the next, which unmounted its marker for a couple of seconds.
    // Keep drawing it at its last position for a short grace period instead.
    const memo = lastMarkerRowsRef.current;
    if (memo.scopeKey !== markerScopeKey) {
      memo.scopeKey = markerScopeKey;
      memo.rows = new Map();
    }
    const now = Date.now();
    const present = new Set<string>();
    for (const row of rows) {
      present.add(row.markerKey);
      memo.rows.set(row.markerKey, { row, seenAtMs: now });
    }
    for (const [key, entry] of memo.rows) {
      if (present.has(key)) continue;
      if (now - entry.seenAtMs > LIVE_MARKER_GRACE_MS) {
        memo.rows.delete(key);
        continue;
      }
      rows.push(entry.row);
    }
    return rows;
  }, [mapAssets, markerScopeKey]);

  const hideLiveMarkerAssetId = hideLiveMarkerAssetIdFor(tripReplayOpen, tripReplayTrailAssetId) || null;
  const clusterMarkerRows = hideLiveMarkerAssetId
    ? markerRenderRows.filter((row) => String(row.asset.id ?? "").trim() !== hideLiveMarkerAssetId)
    : markerRenderRows;

  useEffect(() => {
    const activeIds = new Set(mapAssets.map((asset) => String(asset.id ?? "").trim()).filter(Boolean));
    for (const key of Array.from(headingStateByAssetRef.current.keys())) {
      if (!activeIds.has(key)) headingStateByAssetRef.current.delete(key);
    }
  }, [mapAssets]);

  const getAssetMapIcon = (asset: AssetRow) => {
    const assetId = String(asset.id ?? "").trim() || String(asset.imei ?? "").trim() || "unknown";
    const rawHeading = headingToDegrees(String(asset.heading ?? "").trim());
    const dotStatus = resolveAssetDotStatus(asset as any);
    const isMoving = dotStatus === "online";

    const previous = headingStateByAssetRef.current.get(assetId) ?? {
      stableHeadingDeg: rawHeading,
      movingDirectional: false
    };

    let movingDirectional = isMoving;
    if (!isMoving) {
      movingDirectional = false;
    }

    let stableHeadingDeg = previous.stableHeadingDeg;
    if (movingDirectional) {
      const delta = shortestAngularDelta(stableHeadingDeg, rawHeading);
      if (Math.abs(delta) >= HEADING_MIN_DELTA_DEG) {
        stableHeadingDeg = normalizeDegrees(stableHeadingDeg + delta * HEADING_SMOOTHING_FACTOR);
      } else if (!Number.isFinite(stableHeadingDeg) || stableHeadingDeg === 0) {
        stableHeadingDeg = rawHeading;
      }
    } else {
      stableHeadingDeg = rawHeading;
    }

    headingStateByAssetRef.current.set(assetId, { stableHeadingDeg, movingDirectional });

    const cacheKey = `${assetId}|${dotStatus}|${movingDirectional ? 1 : 0}|${Math.round(stableHeadingDeg)}`;
    const cached = iconCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const icon = buildAssetIcon(asset, {
      showDirectionArrow: movingDirectional,
      headingDeg: stableHeadingDeg,
      status: dotStatus
    });
    iconCacheRef.current.set(cacheKey, icon);
    if (iconCacheRef.current.size > 1200) {
      const firstKey = iconCacheRef.current.keys().next().value;
      if (firstKey) iconCacheRef.current.delete(firstKey);
    }
    return icon;
  };

  const activeMenuAsset = openActions ? assetRows.find((asset) => asset.id === openActions) ?? null : null;

  const buildAssetPopupLabel = (asset: AssetRow) => {
    const desc = String(asset.assetDescription ?? "").trim();
    const reg = String(asset.registration ?? "").trim();
    return desc || reg || String(asset.id ?? "").trim() || "Asset";
  };

  const stopTripReplay = () => {
    setTripReplayPlaying(false);
    tripReplayLastFrameRef.current = null;
    if (tripReplayRafRef.current !== null) {
      cancelAnimationFrame(tripReplayRafRef.current);
      tripReplayRafRef.current = null;
    }
  };

  const resetTripReplay = () => {
    stopTripReplay();
    if (tripReplayMetrics) {
      tripReplayAtMsRef.current = tripReplayMetrics.startMs;
      setTripReplayAtMs(tripReplayMetrics.startMs);
    }
  };

  const hideTrailForAsset = (assetId: string) => {
    if (manualTrailAssetIdRef.current === assetId) {
      manualTrailAssetIdRef.current = null;
    }
    if (trailAssetId === assetId || lockedAssetId === assetId) {
      stopTripReplay();
      setTripReplayOpen(false);
      setTripReplayAtMs(null);
    }
    setTrailAssetId((current) => (current === assetId ? null : current));
    setReplayTrailByAsset((prev) => {
      const next = { ...prev };
      delete next[assetId];
      return next;
    });
    setTripStartFlagsByAsset((prev) => {
      const next = { ...prev };
      delete next[assetId];
      return next;
    });
  };

  const fitMapToTrailPoints = (points: Array<{ lat: number; lng: number }>) => {
    if (points.length < 2 || !mapRef) return;
    try {
      const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number]));
      if (typeof mapRef.fitBounds === "function") {
        mapRef.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true });
      }
    } catch {
      // Best-effort map framing only.
    }
  };

  const showTrailForAsset = async (asset: AssetRow) => {
    if (trailLoadingAssetIdRef.current === asset.id) return;

    trailLoadingAssetIdRef.current = asset.id;
    setTrailLoadingAssetId(asset.id);

    const assetIndex = assetRows.findIndex((row) => row.id === asset.id);
    if (assetIndex >= 0) focusAssetOnMap(asset, assetIndex);

    const toMs = Date.now();
    const fromMs = toMs - 24 * 60 * 60 * 1000;

    try {
      let samples: TrailSample[] = [];
      let trailNotifications: ReturnType<typeof mapTraccarEventsToTrailNotifications> = [];
      let cmsStartFlags: TrailPoint[] | null = null;

      if (isCms808LiveAsset(asset)) {
        const hours = Math.max(1, Number(mapLayers.hours) || 24);
        const playbackTo = new Date(toMs);
        const playbackFrom = new Date(toMs - hours * 60 * 60 * 1000);
        const device = await resolveCms808DeviceId(asset);
        if (!device) {
          setShowToast({ id: asset.id, text: "Replay unavailable: no 808 device id for this camera." });
          window.setTimeout(() => setShowToast(null), 4000);
          return;
        }
        const points = await loadCms808PlaybackTrail(device, playbackFrom, playbackTo).catch(() => []);
        const cmsTrips = buildCms808TimelineTrips(points);
        const inTrip = points.filter((point) =>
          cmsTrips.some((trip) => point.atMs >= Date.parse(trip.start) && point.atMs <= Date.parse(trip.end))
        );
        cmsStartFlags = cmsTrips.map((trip) => ({
          lat: trip.startLat,
          lng: trip.startLng,
          atMs: Date.parse(trip.start),
          driver: asset.driver || undefined,
          location: trip.startAddress || undefined
        }));
        samples = inTrip.map((point) => ({
          lat: point.lat,
          lng: point.lng,
          atMs: point.atMs,
          moving: true,
          ignitionOn: true,
          speedKph: point.speedKph,
          driver: asset.driver || undefined,
          location: point.location
        }));
      } else if (isGpsIotServer()) {
        const hours = Math.max(1, Number(mapLayers.hours) || 24);
        const fromMsWindow = toMs - hours * 60 * 60 * 1000;
        const deviceId = await resolveTraccarDeviceId(asset);
        if (!deviceId) {
          setShowToast({ id: asset.id, text: "Replay unavailable: no GPS IoT device mapping for this asset." });
          window.setTimeout(() => setShowToast(null), 4000);
          return;
        }
        const fromIso = new Date(fromMsWindow).toISOString();
        const toIso = new Date(toMs).toISOString();
        const route = await getTraccarRoute({
          deviceId,
          from: fromIso,
          to: toIso,
          allowPositionsFallback: false
        });
        // Get Events Status (GetTelemetry) + notification alerts — GPS IoT only, never Traccar.
        const gpsiotEvents = await getTraccarEvents({
          deviceId,
          from: fromIso,
          to: toIso
        }).catch(() => []);
        trailNotifications = mapTraccarEventsToTrailNotifications(gpsiotEvents, route);
        samples = route
          .map((point) => {
            const atMs = parsePointTimestampMs(point);
            const lat = toFiniteNumber((point as any)?.latitude ?? (point as any)?.lat);
            const lng = toFiniteNumber((point as any)?.longitude ?? (point as any)?.lng ?? (point as any)?.lon);
            const speedKnots = toFiniteNumber((point as any)?.speed);
            const speedKph = typeof speedKnots === "number" ? speedKnots * 1.852 : undefined;
            const attributes = (point?.attributes ?? {}) as Record<string, unknown>;
            const driver = String(attributes.driverName ?? attributes.driver ?? asset.driver ?? "").trim();
            const locationLabel = pickBestLocationLabel(
              attributes.locationName,
              attributes.address,
              (point as any)?.address,
              asset.location
            );
            if (!Number.isFinite(atMs) || typeof lat !== "number" || typeof lng !== "number") return null;
            return {
              lat,
              lng,
              atMs,
              moving: true,
              ignitionOn: true,
              speedKph,
              driver: driver || undefined,
              location: hasRealLocationLabel(locationLabel) ? locationLabel : undefined
            } as TrailSample;
          })
          .filter((row): row is TrailSample => Boolean(row));
      } else {
      const deviceId = await resolveTraccarDeviceId(asset);
      if (!deviceId) {
        setShowToast({ id: asset.id, text: "Replay unavailable: no VIVI device mapping for this asset." });
        window.setTimeout(() => setShowToast(null), 4000);
        return;
      }

      const route = await getTraccarRoute({
        deviceId,
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString()
      });

      const traccarEvents = await getTraccarEvents({
        deviceId,
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString()
      }).catch(() => []);

      trailNotifications = mapTraccarEventsToTrailNotifications(traccarEvents, route);

      samples = route
        .map((point) => {
          const atMs = parsePointTimestampMs(point);
          const lat = toFiniteNumber((point as any)?.latitude ?? (point as any)?.lat);
          const lng = toFiniteNumber((point as any)?.longitude ?? (point as any)?.lng ?? (point as any)?.lon);
          const speedKnots = toFiniteNumber((point as any)?.speed);
          const speedKph = typeof speedKnots === "number" ? speedKnots * 1.852 : undefined;
          const attributes = (point?.attributes ?? {}) as Record<string, unknown>;
          const driver = String(attributes.driver ?? attributes.driverName ?? asset.driver ?? "").trim();
          const locationLabel = pickBestLocationLabel(
            attributes.locationName,
            attributes.address,
            (point as any)?.address,
            asset.location
          );
          if (!Number.isFinite(atMs) || typeof lat !== "number" || typeof lng !== "number") return null;
          const moving = typeof speedKnots === "number" ? speedKnots > 0.8 : false;
          return {
            lat,
            lng,
            atMs,
            moving,
            ignitionOn: moving,
            speedKph,
            driver: driver || undefined,
            location: hasRealLocationLabel(locationLabel) ? locationLabel : undefined
          } as TrailSample;
        })
        .filter((row): row is TrailSample => Boolean(row));
      }

      const fallbackTrail = samples
        .sort((a, b) => a.atMs - b.atMs)
        .map((sample) => ({
          lat: sample.lat,
          lng: sample.lng,
          atMs: sample.atMs,
          speedKph: sample.speedKph,
          driver: sample.driver,
          location: sample.location
        }))
        .filter((point, index, list) => {
          const prev = list[index - 1];
          if (!prev) return true;
          return !(Math.abs(prev.lat - point.lat) < 0.000001 && Math.abs(prev.lng - point.lng) < 0.000001);
        });

      const trail = isCms808LiveAsset(asset) || isGpsIotServer() ? fallbackTrail : buildMovingTrailFromSamples(samples);
      const starts = cmsStartFlags ?? buildTripStartFlagsFromSamples(samples);
      const finalTrail = (trail.length > 0 ? trail : fallbackTrail).slice(-1200);
      const startFlags = (starts.length > 0 ? starts : (cmsStartFlags ? [] : finalTrail[0] ? [finalTrail[0]] : [])).slice(-120);

      if (finalTrail.length < 2) {
        setShowToast({
          id: asset.id,
          text: isCms808LiveAsset(asset)
            ? "No trips in the selected window (vehicle parked / ignition off)."
            : isGpsIotServer()
              ? "No GPS IoT trip trail for the selected time window."
              : "No trail data available for the last 24 hours."
        });
        window.setTimeout(() => setShowToast(null), 4000);
        return;
      }

      setReplayTrailByAsset((prev) => ({
        ...prev,
        [asset.id]: finalTrail
      }));
      setTripStartFlagsByAsset((prev) => ({
        ...prev,
        [asset.id]: startFlags
      }));
      setVideoTrailEventsByAsset((prev) => ({
        ...prev,
        [asset.id]: []
      }));
      setTrailNotificationEventsByAsset((prev) => ({
        ...prev,
        [asset.id]: trailNotifications.map((event) => ({
          lat: event.lat,
          lng: event.lng,
          atMs: event.atMs ?? notificationEventAtMs(event),
          labels: event.labels ?? [],
          location: event.location
        }))
      }));

      manualTrailAssetIdRef.current = asset.id;
      setTrailAssetId(asset.id);
      setMapLayers((current) => ({
        ...current,
        eventsOnTrail: true,
        showEntireLastTrip: false,
        hours: "24"
      }));

      fitMapToTrailPoints(finalTrail);

      // Geocode a sample of trail points so location names are shown in popups.
      const assetIdCapture = asset.id;
      const step = Math.max(1, Math.ceil(finalTrail.length / 30));
      const toGeocode = finalTrail
        .filter((_, i) => i % step === 0)
        .filter((pt) => !hasRealLocationLabel(pt.location))
        .filter((pt) => {
          const k = buildReverseGeocodeKey(pt.lat, pt.lng);
          return !reverseGeocodeCacheRef.current.has(k) && !reverseGeocodePendingRef.current.has(k);
        })
        .slice(0, 30);

      void (async () => {
        for (const pt of toGeocode) {
          const key = buildReverseGeocodeKey(pt.lat, pt.lng);
          reverseGeocodePendingRef.current.add(key);
          try {
            const headers: Record<string, string> = { Accept: "application/json" };
            const apiKey = getApiKey();
            if (apiKey) headers["x-api-key"] = apiKey;
            const response = await fetch(
              buildApiUrl(`/api/reverse-geocode?lat=${encodeURIComponent(String(pt.lat))}&lon=${encodeURIComponent(String(pt.lng))}`),
              { headers }
            );
            if (!response.ok) continue;
            const body = (await response.json()) as { display_name?: string; name?: string; address?: Record<string, string> };
            const resolved = String(
              body?.display_name
                ?? body?.name
                ?? body?.address?.road
                ?? body?.address?.suburb
                ?? body?.address?.hamlet
                ?? body?.address?.neighbourhood
                ?? body?.address?.locality
                ?? body?.address?.city
                ?? body?.address?.town
                ?? body?.address?.village
                ?? body?.address?.county
                ?? body?.address?.municipality
                ?? body?.address?.state_district
                ?? ""
            ).trim();
            if (!resolved) continue;
            reverseGeocodeCacheRef.current.set(key, resolved);
            persistReverseGeocodeCache(reverseGeocodeCacheRef.current);
            setReplayTrailByAsset((prev) => {
              const currentTrail = prev[assetIdCapture];
              if (!currentTrail) return prev;
              const updated = currentTrail.map((tpt) => {
                if (buildReverseGeocodeKey(tpt.lat, tpt.lng) === key && !hasRealLocationLabel(tpt.location)) {
                  return { ...tpt, location: resolved };
                }
                return tpt;
              });
              return { ...prev, [assetIdCapture]: updated };
            });
          } catch {
            // Best-effort geocoding only.
          } finally {
            reverseGeocodePendingRef.current.delete(key);
          }
        }
      })();

    } catch (error: any) {
      setShowToast({ id: asset.id, text: `Replay failed: ${String(error?.message ?? error ?? "unknown error")}` });
      window.setTimeout(() => setShowToast(null), 4000);
    } finally {
      if (trailLoadingAssetIdRef.current === asset.id) {
        trailLoadingAssetIdRef.current = null;
        setTrailLoadingAssetId(null);
      }
    }
  };

  const renderAssetInfoPopup = (asset: AssetRow, index: number) => {
    const popupLocation = (() => {
      const labeled = pickLocationForDisplay(asset);
      if (hasRealLocationLabel(labeled)) return labeled;
      const livePos = getAssetLatLng(asset, index);
      if (livePos) {
        const cacheKey = buildReverseGeocodeKey(livePos.lat, livePos.lng);
        const cached = reverseGeocodeCacheRef.current.get(cacheKey);
        if (hasRealLocationLabel(cached)) return cached;
        return formatCoordinateLabel(livePos.lat, livePos.lng) || "Resolving from GPS...";
      }
      return "Location unavailable";
    })();

    return (
      <div className="easytrack-popup">
        <div className="easytrack-popup-title">Asset info</div>
        <div className="easytrack-popup-body">
          <div className="easytrack-popup-row">
            <span>Registration</span>
            <strong>{formatAssetPopupValue(getTrackingDisplayName(asset), "Unknown")}</strong>
          </div>
          <div className="easytrack-popup-row">
            <span>Site</span>
            <div>{formatAssetPopupValue(asset.site, "Unknown")}</div>
          </div>
          <div className="easytrack-popup-row">
            <span>Location</span>
            <div>{formatAssetPopupValue(popupLocation, "Resolving from GPS...")}</div>
          </div>
          <div className="easytrack-popup-row">
            <span>Last Position</span>
            <div>{formatAssetPopupValue(cms808DisplayTime(asset.lastPosition, asset.site, siteTimeZones) || asset.lastPosition, "None")}</div>
          </div>
          <div className="easytrack-popup-row">
            <span>Speed</span>
            <div>{`${normalizeSpeedToKph(asset.speed) || "0.00"} km/h`}</div>
          </div>
          <div className="easytrack-popup-row">
            <span>Driver</span>
            <div>{formatDriverValue(asset.driver)}</div>
          </div>
          <div className="easytrack-popup-row">
            <span>Heading</span>
            <div>{formatAssetPopupHeading(asset.heading)}</div>
          </div>
          <div className="easytrack-popup-row">
            <span>Fuel (L)</span>
            <div className="easytrack-popup-fuel">
              <span>{formatAssetPopupValue(asset.fuelReading, "None")}</span>
              {canUseFuelAnalysis && <button
                type="button"
                className="easytrack-popup-link"
                onClick={(event) => {
                  event.stopPropagation();
                  void openFuelTachograph(asset);
                }}
              >
                Fuel Tacho
              </button>}
            </div>
          </div>
          <div className="easytrack-popup-row">
            <span>Actions</span>
            <div className="easytrack-popup-fuel">
              <button
                type="button"
                className="easytrack-popup-link"
                onClick={(event) => {
                  event.stopPropagation();
                  setDetailsAsset(asset);
                  setShowAssetDetailsModal(true);
                }}
              >
                More details
              </button>
              <button
                type="button"
                className="easytrack-popup-link"
                onClick={(event) => {
                  event.stopPropagation();
                  if (trailAssetId === asset.id) {
                    hideTrailForAsset(asset.id);
                  } else {
                    void showTrailForAsset(asset);
                  }
                }}
              >
                {trailLoadingAssetId === asset.id
                  ? "Loading trail..."
                  : trailAssetId === asset.id
                    ? "Hide trail on map"
                    : "Show trail on map"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const diagnosticsLiveRow = diagnosticsAsset ? assetRows.find((r) => r.id === diagnosticsAsset.id) ?? diagnosticsAsset : diagnosticsAsset;
  const diagnosticsLatest = diagnosticsTelemetry.status === "ready" ? diagnosticsTelemetry.body?.latest : undefined;
  const diagnosticsEvent = diagnosticsTelemetry.status === "ready"
    ? ((Array.isArray(diagnosticsTelemetry.body?.events) ? diagnosticsTelemetry.body?.events[0] : null) as any)
    : null;
  const diagnosticsEventPayload = diagnosticsEvent ? ((diagnosticsEvent as any).data ?? diagnosticsEvent) : null;
  const diagnosticsEventAt = pickFirstNonEmptyString(
    (diagnosticsEvent as any)?.created_at,
    (diagnosticsEvent as any)?.createdAt,
    (diagnosticsEvent as any)?.at,
    diagnosticsEventPayload?.created_at,
    diagnosticsEventPayload?.createdAt,
    diagnosticsEventPayload?.at,
    diagnosticsEventPayload?.lastSeen,
    diagnosticsEventPayload?.lastPosition
  );
  const diagnosticsEventCoords = diagnosticsEventPayload ? getAssetCoordinates(diagnosticsEventPayload) : {};
  const diagnosticsEventSpeed = toFiniteNumber(extractLiveSpeed(diagnosticsEventPayload));
  const diagnosticsEventHeading = pickFirstNonEmptyString(
    extractLiveHeading(diagnosticsEventPayload),
    diagnosticsEventPayload?.course,
    diagnosticsEventPayload?.data?.course
  );
  const diagnosticsEventSatellites = toFiniteNumber(extractLiveSatellites(diagnosticsEventPayload));
  const diagnosticsEventIgnition = extractLiveIgnitionLabel(diagnosticsEventPayload);
  const diagnosticsEventMovement = pickFirstNonEmptyString(
    diagnosticsEventPayload?.movement,
    diagnosticsEventPayload?.data?.movement
  );
  const diagnosticsEventVoltage = pickFirstNonEmptyString(
    extractLivePowerVoltage(diagnosticsEventPayload),
    diagnosticsEventPayload?.data?.powerVoltage,
    diagnosticsEventPayload?.data?.voltage
  );
  const diagnosticsEventCharging = pickFirstNonEmptyString(
    diagnosticsEventPayload?.charging,
    diagnosticsEventPayload?.data?.charging,
    diagnosticsEventPayload?.data?.charge
  );
  const diagnosticsEventFirmware = pickFirstNonEmptyString(
    diagnosticsEventPayload?.firmwareVersion,
    diagnosticsEventPayload?.firmware,
    diagnosticsEventPayload?.fw,
    diagnosticsEventPayload?.data?.firmwareVersion,
    diagnosticsEventPayload?.data?.firmware,
    diagnosticsEventPayload?.data?.fw
  );

  const diagnosticsLatestAtRaw = pickFirstNonEmptyString(
    diagnosticsLatest?.at,
    diagnosticsEventAt,
    diagnosticsLiveRow?.lastPosition,
    diagnosticsLiveRow?.lastActive,
    diagnosticsAsset?.lastPosition,
    diagnosticsAsset?.lastActive
  );
  const diagnosticsLatestAt = diagnosticsLatestAtRaw ? formatTimestamp(diagnosticsLatestAtRaw) : "Not available";
  const diagnosticsLatestSpeedValue = typeof diagnosticsLatest?.speed === "number"
    ? diagnosticsLatest.speed
    : diagnosticsEventSpeed;
  const diagnosticsLatestSpeed = typeof diagnosticsLatestSpeedValue === "number"
    ? `${diagnosticsLatestSpeedValue} km/h`
    : "Not available";
  const diagnosticsLatestIgnition = typeof diagnosticsLatest?.ignition === "boolean"
    ? (diagnosticsLatest.ignition ? "On" : "Off")
    : (extractLiveIgnitionLabel(diagnosticsLatest) || diagnosticsEventIgnition || normalizeIgnitionLabel(diagnosticsAsset?.ignition) || "Off");
  const diagnosticsLatestLngValue = typeof diagnosticsLatest?.lng === "number"
    ? diagnosticsLatest.lng
    : (typeof diagnosticsEventCoords.lng === "number" ? diagnosticsEventCoords.lng : toFiniteNumber(diagnosticsAsset?.lng));
  const diagnosticsLatestLatValue = typeof diagnosticsLatest?.lat === "number"
    ? diagnosticsLatest.lat
    : (typeof diagnosticsEventCoords.lat === "number" ? diagnosticsEventCoords.lat : toFiniteNumber(diagnosticsAsset?.lat));
  const diagnosticsLatestLng = typeof diagnosticsLatestLngValue === "number" ? String(diagnosticsLatestLngValue) : "Not available";
  const diagnosticsLatestLat = typeof diagnosticsLatestLatValue === "number" ? String(diagnosticsLatestLatValue) : "Not available";
  const diagnosticsLatestHeading = typeof (diagnosticsLatest as any)?.heading !== "undefined"
    ? String((diagnosticsLatest as any).heading)
    : (diagnosticsEventHeading || String(diagnosticsAsset?.heading ?? "").trim() || "Not available");
  const diagnosticsLatestSatellites = (() => {
    const fromLatest = toFiniteNumber(
      (diagnosticsLatest as any)?.satellites ??
      (diagnosticsLatest as any)?.sat ??
      (diagnosticsLatest as any)?.attributes?.sat ??
      (diagnosticsLatest as any)?.attributes?.satellites
    ) ?? toFiniteNumber(extractLiveSatellites(diagnosticsLatest));
    if (typeof fromLatest === "number") return String(fromLatest);
    if (typeof diagnosticsEventSatellites === "number") return String(diagnosticsEventSatellites);
    const fromEventRaw = toFiniteNumber(extractLiveSatellites(diagnosticsEventPayload));
    if (typeof fromEventRaw === "number") return String(fromEventRaw);
    const fromRow = String(diagnosticsAsset?.satellites ?? "").trim();
    if (fromRow) return fromRow;
    return "0";
  })();
  const diagnosticsLatestMovement = pickFirstNonEmptyString(
    diagnosticsLatest?.movement,
    diagnosticsEventMovement
  ) || "Not available";
  const diagnosticsLatestVoltage = pickFirstNonEmptyString(
    diagnosticsLatest?.powerVoltage,
    diagnosticsEventVoltage,
    diagnosticsAsset?.powerVoltage
  ) || "Not available";
  const diagnosticsLatestCharging = pickFirstNonEmptyString(
    diagnosticsLatest?.charging,
    diagnosticsEventCharging
  ) || "Not available";
  const diagnosticsLatestFirmware = pickFirstNonEmptyString(
    diagnosticsLatest?.firmwareVersion,
    diagnosticsEventFirmware
  ) || "Not available";
  const diagnosticsMobileDeviceName = pickFirstNonEmptyString(
    diagnosticsAsset?.device,
    (diagnosticsAsset as any)?.mobileDeviceName,
    (diagnosticsAsset as any)?.deviceName,
    diagnosticsAsset?.mobileDeviceType
  ) || "Not available";

  const diagnosticsIgnitionOnAt = pickFirstNonEmptyString(
    (diagnosticsLatest as any)?.ignitionOnAt,
    (diagnosticsTelemetry.status === "ready" ? (diagnosticsTelemetry.body?.assets?.[0] as any)?.ignitionOnAt : undefined)
  );
  const diagnosticsIgnitionOnSince = diagnosticsIgnitionOnAt ? formatTimestamp(diagnosticsIgnitionOnAt) : "";
  const diagnosticsIgnitionDuration = (() => {
    if (!diagnosticsIgnitionOnAt) return "";
    const ms = Date.now() - Date.parse(diagnosticsIgnitionOnAt);
    if (!Number.isFinite(ms) || ms < 0) return "";
    const totalMinutes = Math.floor(ms / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  })();

  const attachPopupHoverHandlers = (popup: any) => {
    const el = popup?.getElement?.() as HTMLElement | null;
    if (!el) return;

    const onEnter = () => {
      popupHoveringRef.current = true;
      clearPopupCloseTimer();
    };
    const onLeave = () => {
      popupHoveringRef.current = false;
      closeActivePopupSoon(200);
    };

    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    (popup as any).__viviHoverCleanup = () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
  };

  const detachPopupHoverHandlers = (popup: any) => {
    try {
      (popup as any).__viviHoverCleanup?.();
    } catch {
      // ignore
    }
    try {
      delete (popup as any).__viviHoverCleanup;
    } catch {
      // ignore
    }
  };

  const openAssetPopup = (
    asset: AssetRow,
    index: number,
    lat: number,
    lng: number,
    options?: { openLeafletPopup?: boolean }
  ) => {
    clearPopupCloseTimer();
    popupHoveringRef.current = false;
    setActiveInfoWindow(asset.id);
    setStreetViewAssetId(asset.id);
    setSelectedStreetView({ lat, lng, heading: asset.heading });
    void options;
  };

  // Keep the Street View panel locked onto the selected vehicle's latest position
  // so it updates live as the asset moves (driven by polling/SSE assetRows updates).
  useEffect(() => {
    if (!streetViewAssetId) return;
    const row = assetRows.find((candidate) => candidate.id === streetViewAssetId);
    if (!row) return;
    const lat = typeof row.lat === "number" ? row.lat : undefined;
    const lng = typeof row.lng === "number" ? row.lng : undefined;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    setSelectedStreetView((prev) => {
      if (prev && Math.abs(prev.lat - lat) < 1e-7 && Math.abs(prev.lng - lng) < 1e-7 && prev.heading === row.heading) {
        return prev;
      }
      return { lat, lng, heading: row.heading };
    });
  }, [streetViewAssetId, assetRows]);

  useEffect(() => {
    return () => {
      clearPopupCloseTimer();
      markerRefs.current.clear();
      activeInfoWindowRef.current = null;
    };
  }, []);

  const closeShareLiveModal = () => {
    setShowShareLiveModal(false);
    setShareLiveAsset(null);
    setShareLiveEmail("");
    setShareLiveLink("");
    setShareLiveExpiresAt("");
    setShareLiveSending(false);
    setShareLiveStatus("");
  };

  const closeImmobilizerModal = () => {
    setShowImmobilizerModal(false);
    setImmobilizerAsset(null);
    setImmobilizerAction("");
    setImmobilizerBusy(false);
    setImmobilizerStatus("");
  };

  const handleImmobilizerSaveAndCompile = async () => {
    if (!immobilizerAsset || !immobilizerAction) return;

    const imei = deriveImeiFromAsset(immobilizerAsset);
    if (!imei) {
      setImmobilizerStatus("No IMEI is set for this asset.");
      return;
    }

    const configGroup = getAssetConfigGroup(immobilizerAsset);
    if (!configGroup) {
      setImmobilizerStatus("Set a configuration group for this asset before sending immobilizer commands.");
      return;
    }

    setImmobilizerBusy(true);
    setImmobilizerStatus("Saving and compiling immobilizer command…");

    try {
      const result = await saveAndCompileImmobilizerAction(imei, immobilizerAction);
      if (!result.ok) {
        setImmobilizerStatus(result.error ?? "Failed to queue immobilizer command.");
        return;
      }

      const actionLabel = immobilizerActionLabel(immobilizerAction);
      setImmobilizerStatus(`${actionLabel} queued. The unit will receive the command on its next connection.`);
      setShowToast({
        id: `immobilizer-${immobilizerAsset.id}`,
        text: `Immobilizer: ${actionLabel} saved and compiled for ${buildAssetPopupLabel(immobilizerAsset)}.`
      });
      window.setTimeout(() => setShowToast(null), 4500);

      if (result.kickQueued) {
        setImmobilizerStatus((prev) => `${prev} Wake-up command sent to device.`);
      } else if (result.kickError) {
        const kickMessage = String(result.kickError).trim().toLowerCase();
        const ignorableKickError =
          kickMessage.includes("not found") ||
          kickMessage.includes("not configured") ||
          kickMessage.includes("auth not configured") ||
          kickMessage.includes("503");
        if (!ignorableKickError) {
          setImmobilizerStatus((prev) => `${prev} Wake-up not sent: ${result.kickError}`);
        }
      }
    } catch (error: any) {
      setImmobilizerStatus(String(error?.message ?? error ?? "Failed to send immobilizer command."));
    } finally {
      setImmobilizerBusy(false);
    }
  };

  const buildLiveShareUrl = (token: string) => {
    const base = typeof window !== "undefined" ? String(window.location.origin ?? "").trim() : "";
    if (!base) return `/share/live/${encodeURIComponent(token)}`;
    return `${base.replace(/\/$/, "")}/share/live/${encodeURIComponent(token)}`;
  };

  const handleCreateAndSendShareLink = async () => {
    if (!shareLiveAsset) return;
    const to = String(shareLiveEmail ?? "").trim().toLowerCase();
    if (!isLikelyEmail(to)) {
      setShareLiveStatus("Enter a valid recipient email.");
      return;
    }

    setShareLiveSending(true);
    setShareLiveStatus("Preparing link...");

    try {
      const expiresAtIso = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const created = await createLiveShareLink({
        assetId: shareLiveAsset.id,
        expiresAt: expiresAtIso,
        includeAssetMeta: true,
        includeDriver: false,
        comment: `Shared from live tracking for ${buildAssetPopupLabel(shareLiveAsset)}`
      });

      if (!created?.token) {
        setShareLiveStatus("Could not create live share link.");
        setShareLiveSending(false);
        return;
      }

      const link = buildLiveShareUrl(created.token);
      setShareLiveLink(link);
      setShareLiveExpiresAt(created.expiresAt || expiresAtIso);

      const sent = await sendLiveShareEmail({
        to: to.split(/[;,]/).map((v) => v.trim()).filter(Boolean),
        shareUrl: link,
        assetLabel: `${buildAssetPopupLabel(shareLiveAsset)} (${shareLiveAsset.registration || "No registration"})`,
        expiresAt: created.expiresAt || expiresAtIso,
        comment: "This live tracking link auto-expires after 12 hours."
      });

      if (sent?.ok && sent.emailSent) {
        setLiveShareByAssetId((prev) => ({
          ...prev,
          [shareLiveAsset.id]: { active: true, expiresAt: created.expiresAt || expiresAtIso }
        }));
        setShareLiveStatus(`Link sent to ${sent.recipients ?? to.split(/[;,]/).filter(Boolean).length} recipient(s). Expires in 12 hours.`);
        setShowToast({ id: `share-${shareLiveAsset.id}`, text: `Live location link sent to ${to}` });
        window.setTimeout(() => setShowToast(null), 3500);
      } else {
        setShareLiveStatus("Link created, but email send failed. You can copy the link below.");
      }
    } catch (error: any) {
      setShareLiveStatus(String(error?.message ?? error ?? "Failed to share live location."));
    } finally {
      setShareLiveSending(false);
    }
  };

  const closeSidebarIfCompact = () => {
    if (!isCompactLiveLayout) return;
    setIsSidebarOpen(false);
    setShowColumns(false);
    setOpenActions(null);
  };



  return (
    <div className={`live-page${isCompactLiveLayout ? " live-page--mobile-shell" : ""}`}>
      <div className={`live-layout${isCompactLiveLayout ? " live-layout--mobile-shell" : ""}`}>
        {isCompactLiveLayout && isSidebarOpen && (
          <button
            type="button"
            className="live-mobile-backdrop"
            aria-label="Close asset drawer"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        {isCompactLiveLayout && (
          <button
            type="button"
            className={`live-drawer-toggle${isSidebarOpen ? " is-open" : ""}`}
            aria-label={isSidebarOpen ? "Hide asset panel" : "Show asset panel"}
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen((current) => !current)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="live-drawer-toggle__icon" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        )}
        <aside
          className={`live-sidebar${isCompactLiveLayout ? " live-sidebar--drawer" : ""}${isCompactLiveLayout && isSidebarOpen ? " is-open" : ""}${isCompactLiveLayout && !isSidebarOpen ? " is-closed" : ""}`}
          style={isCompactLiveLayout ? undefined : { width: sidebarWidth }}
          ref={sidebarRef}
        >
          <header className="live-header">
            <div className="live-header-title">
              <span>Assets</span>
              <span className="live-count">{visibleAssetRows.length}</span>
            </div>
            <div className="live-menu">
              <button
                className="menu-icon-btn"
                type="button"
                onClick={() => setShowColumns((current) => !current)}
                aria-label="Toggle column menu"
              >
                <span />
                <span />
                <span />
              </button>
              {showColumns && (
                <div className="columns-dropdown">
                  {columns.map((col) => (
                    <label key={col.key} className="columns-option">
                      <input
                        type="checkbox"
                        checked={visibleCols.has(col.key)}
                        onChange={() => toggleCol(col.key)}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </header>
          <div className="live-filter">
            <input
              className="live-input"
              placeholder="Filter"
              ref={filterInputRef}
              value={assetsFilter}
              onChange={(event) => setAssetsFilter(event.target.value)}
            />
          </div>
          <div className="live-toggles">
            <label>
              <input
                type="checkbox"
                checked={showSelectedOnly}
                onChange={(event) => setShowSelectedOnly(event.target.checked)}
              />
              {" "}
              Show selected assets
            </label>
          </div>
          <div
            className="live-table-wrapper"
            ref={tableRef}
            style={{ gridTemplateColumns: gridTemplate }}
            onScroll={(event) => {
              if (!hScrollRef.current) return;
              const target = event.currentTarget;
              if (hScrollRef.current.scrollLeft !== target.scrollLeft) {
                hScrollRef.current.scrollLeft = target.scrollLeft;
              }
            }}
          >
            {columnGuideOffsets.length > 0 && columnGuideWidth > 0 && columnGuideHeight > 0 ? (
              <div className="live-grid-guides" style={{ width: columnGuideWidth, height: columnGuideHeight }} aria-hidden="true">
                {columnGuideOffsets.map((offset, index) => (
                  <span key={`guide-${index}-${offset}`} className="live-grid-guide" style={{ left: `${offset}px` }} />
                ))}
              </div>
            ) : null}
            <div className="live-table-head" ref={tableHeadRef}>
              <div />
              <div />
              {activeCols.map((col) => (
                <div
                  key={col.key}
                  className={`live-col${dragCol === col.key ? " dragging" : ""}`}
                  draggable
                  onDragStart={(event) => {
                    setDragCol(col.key);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", col.key);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const dragged = event.dataTransfer.getData("text/plain") || dragCol;
                    if (!dragged || dragged === col.key) return;
                    setColumnOrder((current) => {
                      const next = current.filter((item) => item !== dragged);
                      const targetIndex = next.indexOf(col.key);
                      next.splice(Math.max(0, targetIndex), 0, dragged as ColumnKey);
                      return next;
                    });
                    setDragCol(null);
                  }}
                  onDragEnd={() => setDragCol(null)}
                >
                  <SortableColumnHeader label={col.label} {...getLiveHeaderProps(col.key)} />
                </div>
              ))}
              <div />
            </div>
            <div className="live-table" ref={tableBodyRef}>
              {visibleAssetItems.map((entry) => {
                if (entry.type === "group") {
                  return (
                  <div key={`group:${entry.key}`} className="live-hierarchy-group">
                    <span className="live-hierarchy-group-title">{entry.title}</span>
                    {entry.path ? <span className="live-hierarchy-group-path">{entry.path}</span> : null}
                  </div>
                  );
                }
                const asset = entry.asset;
                return (
                <div
                  key={asset.id}
                  className="live-row"
                >
                  <div className="live-cell">
                    <input
                      type="checkbox"
                      checked={selectedAssets.has(asset.id)}
                      onChange={() => toggleAsset(asset.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="live-cell status">
                    <AssetStatusIndicator
                      asset={asset as any}
                      hasActiveNotification={assetsWithActiveNotification.has(asset.id)}
                    />
                  </div>
                  {activeCols.map((col) => (
                    <div key={col.key} className="live-cell">
                      {(() => {
                        if (col.key === "assetDescription") {
                          return (
                            <span className="assets-cell--asset-description">
                              <button
                                type="button"
                                className="assets-asset-description-btn live-asset-button"
                                onClick={() => {
                                  const index = assetRows.findIndex((row) => row.id === asset.id);
                                  if (index < 0) return;
                                  const pos = getAssetLatLng(asset, index);
                                  if (pos) {
                                    openAssetPopup(asset, index, pos.lat, pos.lng);
                                  }
                                  focusAssetOnMap(asset, index);
                                  setAssetContext(asset);
                                  setOpenActions(null);
                                  setMenuAnchor(null);
                                  closeSidebarIfCompact();
                                }}
                                onFocus={() => {
                                  const index = assetRows.findIndex((row) => row.id === asset.id);
                                  if (index < 0) return;
                                  const pos = getAssetLatLng(asset, index);
                                  if (!pos) return;
                                  openAssetPopup(asset, index, pos.lat, pos.lng);
                                }}
                              >
                                <span>{asset.assetDescription}</span>
                                {liveShareByAssetId[asset.id]?.active && (
                                  <span
                                    className="live-share-badge"
                                    title={formatShareExpiryTooltip(liveShareByAssetId[asset.id]?.expiresAt)}
                                  >
                                    Shared • {formatShareTimeLeft(liveShareByAssetId[asset.id]?.expiresAt)}
                                  </span>
                                )}
                              </button>
                              {asset.id === lockedAssetId && (
                                <button
                                  type="button"
                                  className="live-asset-lock"
                                  title="Double-click to unlock"
                                  onClick={(e) => e.stopPropagation()}
                                  onDoubleClick={() => {
                                    localStorage.removeItem("vivi.lockedAsset");
                                    setLockedAssetId(null);
                                  }}
                                >
                                  🔒
                                </button>
                              )}
                            </span>
                          );
                        }

                        const rendered = col.render(asset);
                        if (typeof rendered === "string" || typeof rendered === "number") {
                          return <span className="live-cell-text" title={String(rendered)}>{rendered}</span>;
                        }
                        return rendered;
                      })()}
                    </div>
                  ))}
                  <div className="live-cell more">
                    <button
                      className="actions-trigger"
                      type="button"
                      aria-label="Row actions"
                      onClick={(event) => {
                        event.stopPropagation();
                        const rect = event.currentTarget.getBoundingClientRect();
                        if (openActions === asset.id) {
                          setOpenActions(null);
                          setMenuAnchor(null);
                          return;
                        }
                        setOpenActions(asset.id);
                        setMenuAnchor({ top: rect.top - 6, bottom: rect.bottom, left: rect.left });
                      }}
                    >
                      ...
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
          <div
            className="live-table-scrollbar"
            ref={hScrollRef}
            onScroll={(event) => {
              if (!tableRef.current) return;
              const target = event.currentTarget;
              if (tableRef.current.scrollLeft !== target.scrollLeft) {
                tableRef.current.scrollLeft = target.scrollLeft;
              }
            }}
          >
            <div className="live-table-scrollbar-inner" ref={hScrollInnerRef} />
          </div>
        </aside>

        {!isCompactLiveLayout && <div className={`live-resizer ${dragging ? "dragging" : ""}`} onMouseDown={() => setDragging(true)} />}

        {activeMenuAsset && menuAnchor && (
          <div
            className="actions-pop open"
            style={{
              top: menuTop ?? menuAnchor.top,
              left: menuLeft ?? menuAnchor.left
            }}
            ref={menuRef}
          >
            <button
              type="button"
              onClick={() => {
                setDetailsAsset(activeMenuAsset);
                setShowAssetDetailsModal(true);
                setOpenActions(null);
              }}
            >
              View details
            </button>
            <button
              type="button"
              onClick={() => {
                const assetIndex = assetRows.findIndex((row) => row.id === activeMenuAsset.id);
                if (assetIndex >= 0) focusAssetOnMap(activeMenuAsset, assetIndex);
                setAssetContext(activeMenuAsset);
                setOpenActions(null);
                closeSidebarIfCompact();
              }}
            >
              Go to asset
            </button>
            <button
              type="button"
              onClick={() => {
                setAssetContext(activeMenuAsset);
                setOpenActions(null);
                openAssetsWindow(activeMenuAsset);
              }}
            >
              View in new window
            </button>
            <button
              type="button"
              onClick={() => {
                if (lockedAssetId === activeMenuAsset.id) {
                  localStorage.removeItem("vivi.lockedAsset");
                  setLockedAssetId(null);
                } else {
                  localStorage.setItem("vivi.lockedAsset", activeMenuAsset.id);
                  setLockedAssetId(activeMenuAsset.id);
                  const assetIndex = assetRows.findIndex((row) => row.id === activeMenuAsset.id);
                  if (assetIndex >= 0) focusAssetOnMap(activeMenuAsset, assetIndex);
                }
                setOpenActions(null);
              }}
            >
              {lockedAssetId === activeMenuAsset.id ? "Unlock asset" : "Lock on asset"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (trailAssetId === activeMenuAsset.id) {
                  hideTrailForAsset(activeMenuAsset.id);
                } else {
                  void showTrailForAsset(activeMenuAsset);
                }
                setOpenActions(null);
              }}
            >
              {trailLoadingAssetId === activeMenuAsset.id
                ? "Loading trail..."
                : trailAssetId === activeMenuAsset.id
                  ? "Hide trail on map"
                  : "Show trail on map"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRequestAsset(activeMenuAsset);
                setRequestMode("GPRS");
                setShowRequestModal(true);
                setOpenActions(null);
              }}
            >
              Request current position
            </button>
            <button
              type="button"
              onClick={() => {
                setDiagnosticsAsset(activeMenuAsset);
                setDiagnosticsOpen({
                  assetDetails: true,
                  mobileDevice: true,
                  telemetry: false,
                  tripInfo: true,
                  latestPosition: true,
                  inputStatus: true
                });
                setDiagnosticsTelemetry({ status: "idle" });
                setDiagnosticsInputStatus({ status: "idle", inputs: [] });
                setShowDiagnosticsModal(true);
                setOpenActions(null);
              }}
            >
              Diagnostics
            </button>
            {canViewDeviceHealth && (
              <button
                type="button"
                onClick={() => {
                  setDeviceHealthAsset(activeMenuAsset);
                  setOpenActions(null);
                }}
              >
                Device Health
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setImmobilizerAsset(activeMenuAsset);
                setImmobilizerAction("");
                setImmobilizerBusy(false);
                setImmobilizerStatus("");
                setShowImmobilizerModal(true);
                setOpenActions(null);
              }}
            >
              Immobilizer actions
            </button>
            <button
              type="button"
              onClick={() => {
                setShareLiveAsset(activeMenuAsset);
                setShareLiveEmail("");
                setShareLiveLink("");
                setShareLiveExpiresAt("");
                setShareLiveStatus("");
                setShowShareLiveModal(true);
                setOpenActions(null);
              }}
            >
              Share live location (12h)
            </button>
          </div>
        )}

        <section
          className={`live-map${measureMode === "distance" ? " measure-distance-active" : ""}`}
          ref={mapSectionRef}
        >
          <MapZoomControlsOverlay map={mapRef} />
          <div className="live-map-canvas" style={{ transform: `translate(-50%, -50%) rotate(${mapRotation}deg)` }}>
            <MapContainer
              center={singleAsset ? singleAssetLatLng : liveMapCenter}
              zoom={singleAsset ? 14 : 7}
              scrollWheelZoom={true}
              zoomControl={false}
              className="map-leaflet-canvas"
              style={{ height: "100%", width: "100%" }}
            >
              <CaptureMapInstance onMap={handleMapRef} />
              <MapClickHandler />
              {measureMode === "distance" && (
                <MapDistanceMeasure
                  active
                  onStatusChange={(status) => {
                    if (status.hint) setMeasureHint(status.hint);
                  }}
                />
              )}
              <TileLayer
                subdomains="0123"
                url={baseLayers[mapLayer]?.url ?? baseLayers.roadmap.url}
                attribution={baseLayers[mapLayer]?.attribution ?? baseLayers.roadmap.attribution}
              />
              {draftLocation.lat !== undefined && draftLocation.lng !== undefined && showCreateLocationTools && (
                <>
                  <CircleMarker
                    center={[draftLocation.lat, draftLocation.lng]}
                    radius={8}
                    pathOptions={{ color: "#1d4ed8", fillColor: "#60a5fa", fillOpacity: 0.9 }}
                  />
                  {draftLocation.radius > 0 && (
                    <Circle
                      center={[draftLocation.lat, draftLocation.lng]}
                      radius={draftLocation.radius}
                      pathOptions={{ color: "#2563eb", fillColor: "#93c5fd", fillOpacity: 0.15 }}
                    />
                  )}
                </>
              )}
              {selectedMapLocations.map((loc) => {
                const shape = loc.shape ?? (loc.area ? parseTraccarAreaToShape(loc.area) : null);
                const popupCenter =
                  shape?.type === "circle"
                    ? [shape.center.lat, shape.center.lng] as [number, number]
                    : loc.lat !== undefined && loc.lng !== undefined
                      ? [loc.lat, loc.lng] as [number, number]
                      : shape?.type === "polygon" || shape?.type === "polyline"
                        ? [shape.points[0]?.lat, shape.points[0]?.lng] as [number, number]
                        : null;
                return (
                  <div key={`geofence-${loc.id}`}>
                    {renderSelectedGeofenceShape(loc)}
                    {popupCenter && Number.isFinite(popupCenter[0]) && Number.isFinite(popupCenter[1]) && (
                      <CircleMarker
                        center={popupCenter}
                        radius={7}
                        pathOptions={{ color: loc.color ?? "#0ea5e9", fillColor: loc.color ?? "#38bdf8", fillOpacity: 0.85 }}
                      >
                        <Popup>
                          <div className="easytrack-popup">
                            <div className="easytrack-popup-title">{loc.name}</div>
                            <div className="easytrack-popup-body">
                              <div className="easytrack-popup-row">
                                <span>Type</span>
                                <div>{loc.locationType}</div>
                              </div>
                              <div className="easytrack-popup-row">
                                <span>Site</span>
                                <div>{loc.site}</div>
                              </div>
                            </div>
                          </div>
                        </Popup>
                      </CircleMarker>
                    )}
                  </div>
                );
              })}
              {mapLayers.clustering ? (
                <MarkerClusterGroup
                  ref={clusterGroupRef}
                  chunkedLoading
                  removeOutsideVisibleBounds
                  showCoverageOnHover={false}
                  spiderfyOnMaxZoom
                  zoomToBoundsOnClick
                  disableClusteringAtZoom={16}
                  maxClusterRadius={55}
                  animate={false}
                  animateAddingMarkers={false}
                  eventHandlers={{
                    clusterclick: (e: any) => {
                      try {
                        const cluster = e?.layer;
                        if (cluster?.zoomToBounds) {
                          cluster.zoomToBounds({ padding: [40, 40], maxZoom: 16 });
                          return;
                        }
                        const bounds = e?.layer?.getBounds?.();
                        const targetMap = e?.target?._map ?? mapRef;
                        if (!bounds || !targetMap) return;
                        targetMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
                      } catch {
                        // ignore
                      }
                    }
                  }}
                >
                  {clusterMarkerRows.map(({ asset, index, lat, lng, markerKey }) => {
                    return (
                      <LiveMapMarker
                        key={markerKey}
                        position={[Number(lat), Number(lng)]}
                        icon={getAssetMapIcon(asset)}
                        eventHandlers={{
                          click: () => openAssetPopup(asset, index, lat, lng, { openLeafletPopup: false })
                        }}
                      />
                    );
                  })}
                </MarkerClusterGroup>
              ) : (
                clusterMarkerRows.map(({ asset, index, lat, lng, markerKey }) => {
                  return (
                    <LiveMapMarker
                      key={markerKey}
                      position={[lat, lng]}
                      icon={getAssetMapIcon(asset)}
                      eventHandlers={{
                        click: () => openAssetPopup(asset, index, lat, lng, { openLeafletPopup: false })
                      }}
                    />
                  );
                })
              )}
              {tripReplayOpen && tripReplayMetrics && tripReplayAsset && tripReplayTrail.length >= 2 && (
                <>
                  {tripReplayTraveledPositions.length >= 2 && (
                    <Polyline
                      key={`trip-replay-traveled-${tripReplayTrailAssetId ?? "trail"}`}
                      positions={tripReplayTraveledPositions}
                      pathOptions={{
                        color: "#16a34a",
                        weight: 6,
                        opacity: 0.95,
                        lineCap: "round",
                        lineJoin: "round"
                      }}
                    />
                  )}
                  <TripReplayVehicleMarker
                    asset={tripReplayAsset}
                    trail={tripReplayTrail}
                    atMs={tripReplayAtMs}
                    metrics={tripReplayMetrics}
                    onMarkerClick={() => {
                      const assetIndex = assetRows.findIndex((row) => row.id === tripReplayAsset.id);
                      if (assetIndex < 0 || !tripReplayPosition) return;
                      openAssetPopup(
                        tripReplayAsset,
                        assetIndex,
                        tripReplayPosition.lat,
                        tripReplayPosition.lng,
                        { openLeafletPopup: false }
                      );
                    }}
                  />
                </>
              )}
              {tripReplayOpen && tripReplayPlaying && tripReplayPosition && (
                <MapReplayFollower
                  lat={tripReplayPosition.lat}
                  lng={tripReplayPosition.lng}
                  enabled
                />
              )}
              {visibleTrailAssetIds.map((assetId) => {
                const trail = replayTrailByAsset[assetId] ?? [];
                if (trail.length < 2) return null;
                const positions = trail.map((p) => [p.lat, p.lng] as [number, number]);
                return (
                  <Fragment key={`trail-group-${assetId}`}>
                    <Polyline
                      key={`trail-base-${assetId}`}
                      positions={positions}
                      pathOptions={{ color: "#7c2d12", weight: 7, opacity: 0.22, lineCap: "round", lineJoin: "round" }}
                    />
                    <Polyline
                      key={`trail-${assetId}`}
                      positions={positions}
                      pathOptions={{ color: "#ff5722", weight: 4, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
                    />
                  </Fragment>
                );
              })}
              {visibleTrailAssetIds.flatMap((assetId) => {
                const trail = replayTrailByAsset[assetId] ?? [];
                if (trail.length < 2) return [];
                const step = Math.max(1, Math.floor(trail.length / 16));
                const arrows: ReactNode[] = [];
                for (let i = step; i < trail.length; i += step) {
                  const from = trail[i - 1];
                  const to = trail[i];
                  if (!from || !to) continue;
                  if (Math.abs(from.lat - to.lat) < 0.000001 && Math.abs(from.lng - to.lng) < 0.000001) continue;
                  arrows.push(
                    <Marker
                      key={`trail-arrow-${assetId}-${to.atMs}-${i}`}
                      position={[to.lat, to.lng]}
                      icon={buildTrailArrowIcon(trailBearingDegrees(from, to))}
                      interactive={false}
                      keyboard={false}
                    />
                  );
                }
                return arrows;
              })}
              {visibleTrailAssetIds.flatMap((assetId) => {
                void trailNotificationTick;
                const trail = replayTrailByAsset[assetId] ?? [];
                const asset = assetRows.find((row) => row.id === assetId);
                const assetLabel = asset
                  ? `${asset.assetDescription || asset.registration} (${asset.registration})`
                  : assetId;
                const showTrailNotifications = selectedEvents.size > 0;
                const notificationEvents = showTrailNotifications
                  ? (trailNotificationEventsByAsset[assetId] ?? [])
                      .map((event) => ({
                        ...event,
                        labels: (event.labels ?? []).filter((label) =>
                          selectedNotificationTokens.has(normalizeNotificationToken(label))
                        )
                      }))
                      .filter((event) => event.labels.length > 0)
                  : [];
                const notificationMode: "live" | "historical" =
                  trailAssetId === assetId ? "historical" : "live";
                const nowMs = Date.now();
                const matchedNotificationKeys = new Set<string>();
                const assetStatus = asset ? resolveAssetDotStatus(asset as any) : "online";
                const notificationTriangleIcon = buildTrailNotificationTriangleIcon(assetStatus);

                const trailMarkers = trail.map((p) => {
                  const matchedNotification = matchNotificationToTrailPoint(
                    p,
                    notificationEvents,
                    notificationMode,
                    nowMs
                  );
                  if (matchedNotification) {
                    matchedNotificationKeys.add(
                      `${matchedNotification.atMs}|${matchedNotification.lat}|${matchedNotification.lng}`
                    );
                    return (
                      <Marker
                        key={`trail-notif-pt-${assetId}-${p.atMs}`}
                        position={[p.lat, p.lng]}
                        icon={notificationTriangleIcon}
                      >
                        <Popup>
                          <div className="easytrack-popup">
                            <div className="easytrack-popup-title">Notification event</div>
                            <div className="easytrack-popup-body">
                              <div className="easytrack-popup-row">
                                <span>Asset</span>
                                <strong>{assetLabel}</strong>
                              </div>
                              <div className="easytrack-popup-row">
                                <span>Location</span>
                                <strong>
                                  {hasRealLocationLabel(matchedNotification.location)
                                    ? String(matchedNotification.location)
                                    : hasRealLocationLabel(p.location)
                                      ? String(p.location)
                                      : `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}
                                </strong>
                              </div>
                              <div className="easytrack-popup-row">
                                <span>Notification</span>
                                <strong>{matchedNotification.labels.join(", ") || "Unknown"}</strong>
                              </div>
                              <div className="easytrack-popup-row">
                                <span>Date and time</span>
                                <strong>
                                  {formatTimestampForSite(
                                    new Date(matchedNotification.atMs).toISOString(),
                                    asset?.site ?? "",
                                    siteTimeZones
                                  )}
                                </strong>
                              </div>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  }

                  return (
                    <CircleMarker
                      key={`trail-pt-${assetId}-${p.atMs}`}
                      center={[p.lat, p.lng]}
                      radius={2.5}
                      pathOptions={{ color: "#ffedd5", fillColor: "#ffedd5", fillOpacity: 0.9, weight: 1 }}
                    >
                      <Popup>
                        <div className="easytrack-popup">
                          <div className="easytrack-popup-title">Trail point</div>
                          <div className="easytrack-popup-body">
                            <div className="easytrack-popup-row">
                              <span>Asset</span>
                              <strong>{assetLabel}</strong>
                            </div>
                            <div className="easytrack-popup-row">
                              <span>Location</span>
                              <strong>
                                {(() => {
                                  if (hasRealLocationLabel(p.location)) return String(p.location);
                                  const cacheKey = buildReverseGeocodeKey(p.lat, p.lng);
                                  const cached = reverseGeocodeCacheRef.current.get(cacheKey);
                                  if (hasRealLocationLabel(cached)) return cached;
                                  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
                                })()}
                              </strong>
                            </div>
                            <div className="easytrack-popup-row">
                              <span>Speed</span>
                              <strong>
                                {typeof p.speedKph === "number" && Number.isFinite(p.speedKph)
                                  ? `${p.speedKph.toFixed(2)} km/h`
                                  : "Unknown"}
                              </strong>
                            </div>
                            <div className="easytrack-popup-row">
                              <span>Date and time</span>
                              <strong>{formatTimestampForSite(new Date(p.atMs).toISOString(), asset?.site ?? "", siteTimeZones)}</strong>
                            </div>
                            <div className="easytrack-popup-row">
                              <span>Driver</span>
                              <strong>{formatDriverValue(p.driver ?? asset?.driver)}</strong>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                });

                const orphanNotificationMarkers = notificationEvents
                  .filter((event) => {
                    const key = `${event.atMs}|${event.lat}|${event.lng}`;
                    if (matchedNotificationKeys.has(key)) return false;
                    return isActiveTrailNotificationMarker(event.atMs, notificationMode, nowMs);
                  })
                  .map((point, index) => (
                    <Marker
                      key={`trail-notif-orphan-${assetId}-${point.atMs}-${index}`}
                      position={[point.lat, point.lng]}
                      icon={notificationTriangleIcon}
                    >
                      <Popup>
                        <div className="easytrack-popup">
                          <div className="easytrack-popup-title">Notification event</div>
                          <div className="easytrack-popup-body">
                            <div className="easytrack-popup-row">
                              <span>Location</span>
                              <strong>
                                {hasRealLocationLabel(point.location)
                                  ? String(point.location)
                                  : `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}
                              </strong>
                            </div>
                            <div className="easytrack-popup-row">
                              <span>Notification</span>
                              <strong>{point.labels.join(", ") || "Unknown"}</strong>
                            </div>
                            <div className="easytrack-popup-row">
                              <span>Date and time</span>
                              <strong>
                                {formatTimestampForSite(new Date(point.atMs).toISOString(), asset?.site ?? "", siteTimeZones)}
                              </strong>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ));

                return [...trailMarkers, ...orphanNotificationMarkers];
              })}
              {visibleTrailAssetIds.flatMap((assetId) => {
                const starts = tripStartFlagsByAsset[assetId] ?? [];
                const asset = assetRows.find((row) => row.id === assetId);
                return starts.map((point) => (
                  <Marker
                    key={`trail-start-flag-${assetId}-${point.atMs}`}
                    position={[point.lat, point.lng]}
                    icon={tripStartFlagIcon}
                    zIndexOffset={1800}
                  >
                    <Popup>
                      <div className="easytrack-popup">
                        <div className="easytrack-popup-title">Trip start</div>
                        <div className="easytrack-popup-body">
                          <div className="easytrack-popup-row">
                            <span>Date and time</span>
                            <strong>{formatTimestampForSite(new Date(point.atMs).toISOString(), asset?.site ?? "", siteTimeZones)}</strong>
                          </div>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ));
              })}
              {visibleTrailAssetIds.flatMap((assetId) => {
                const points = videoTrailEventsByAsset[assetId] ?? [];
                const asset = assetRows.find((row) => row.id === assetId);
                const assetLabel = asset ? `${asset.assetDescription || asset.registration} (${asset.registration})` : assetId;
                return points.map((point) => (
                  <Marker
                    key={`trail-video-${assetId}-${point.atMs}-${point.lat.toFixed(6)}-${point.lng.toFixed(6)}`}
                    position={[point.lat, point.lng]}
                    icon={videoRecordedIcon}
                  >
                    <Popup>
                      <div className="easytrack-popup">
                        <div className="easytrack-popup-title">Recorded video event</div>
                        <div className="easytrack-popup-body">
                          <div className="easytrack-popup-row">
                            <span>Asset</span>
                            <strong>{assetLabel}</strong>
                          </div>
                          <div className="easytrack-popup-row">
                            <span>Event</span>
                            <strong>{point.labels.join(", ") || "Notification-triggered recording"}</strong>
                          </div>
                          <div className="easytrack-popup-row">
                            <span>Date and time</span>
                            <strong>{formatTimestampForSite(new Date(point.atMs).toISOString(), asset?.site ?? "", siteTimeZones)}</strong>
                          </div>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ));
              })}
              {visibleTrailAssetIds.flatMap((assetId) => {
                const trail = replayTrailByAsset[assetId] ?? [];
                if (trail.length < 1) return [];
                const end = trail[trail.length - 1];
                return [
                  <CircleMarker
                    key={`trail-end-${assetId}`}
                    center={[end.lat, end.lng]}
                    radius={4}
                    pathOptions={{ color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 0.95, weight: 2 }}
                  />
                ];
              })}
            </MapContainer>
            {activeInfoWindow && activeInfoWindowPoint && (() => {
              const assetIndex = assetRows.findIndex((row) => row.id === activeInfoWindow);
              if (assetIndex < 0) return null;
              return (
                <div
                  className="asset-overlay-popup"
                  style={{ left: activeInfoWindowPoint.x, top: activeInfoWindowPoint.y }}
                  onMouseEnter={() => {
                    popupHoveringRef.current = true;
                    clearPopupCloseTimer();
                  }}
                  onMouseLeave={() => {
                    popupHoveringRef.current = false;
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  {renderAssetInfoPopup(assetRows[assetIndex], assetIndex)}
                </div>
              );
            })()}
          </div>
          <StreetViewMini
            apiKey={googleMapsKey}
            lat={selectedStreetView?.lat}
            lng={selectedStreetView?.lng}
            heading={selectedStreetView ? headingToDegrees(selectedStreetView.heading) : 0}
          />
          <div className={`live-trip-replay${tripReplayOpen ? " is-open" : ""}`} aria-label="Trip replay">
            {!tripReplayOpen ? (
              <button
                type="button"
                className="live-trip-replay-toggle"
                data-toast-ignore
                aria-label="Trip replay"
                title="Trip replay"
                onClick={() => void handleTripReplayToggle()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                <span>Trip replay</span>
              </button>
            ) : (
              <div className="live-trip-replay-panel">
                <div className="live-trip-replay-header">
                  <div>
                    <div className="live-trip-replay-title">Trip replay</div>
                    <div className="live-trip-replay-asset">
                      {tripReplayAsset
                        ? buildAssetPopupLabel(tripReplayAsset)
                        : tripReplayTrail.length >= 2
                          ? "Trail loaded"
                          : trailLoadingAssetId
                            ? "Loading trail…"
                            : "No trail loaded"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="live-trip-replay-close"
                    aria-label="Close trip replay"
                    data-toast-ignore
                    onClick={() => {
                      setTripReplayOpen(false);
                      stopTripReplay();
                    }}
                  >
                    ×
                  </button>
                </div>
                {tripReplayMetrics ? (
                  <>
                    <div className="live-trip-replay-stats">
                      <div className="live-trip-replay-stat">
                        <span>Distance</span>
                        <strong>
                          {tripReplayDistanceKm.toFixed(2)} / {tripReplayMetrics.totalDistanceKm.toFixed(2)} km
                        </strong>
                      </div>
                      <div className="live-trip-replay-stat">
                        <span>Elapsed</span>
                        <strong>
                          {formatReplayDuration(Math.max(0, (tripReplayAtMs ?? tripReplayMetrics.startMs) - tripReplayMetrics.startMs))}
                          {" / "}
                          {formatReplayDuration(tripReplayMetrics.totalDurationMs)}
                        </strong>
                      </div>
                    </div>
                    <input
                      type="range"
                      className="live-trip-replay-slider"
                      min={tripReplayMetrics.startMs}
                      max={tripReplayMetrics.endMs}
                      step={Math.max(1, Math.floor(tripReplayMetrics.totalDurationMs / 500))}
                      value={tripReplayAtMs ?? tripReplayMetrics.startMs}
                      aria-label="Trip replay progress"
                      onChange={(event) => {
                        stopTripReplay();
                        const next = Number(event.target.value);
                        tripReplayAtMsRef.current = next;
                        setTripReplayAtMs(next);
                      }}
                    />
                    <div className="live-trip-replay-controls">
                      <button
                        type="button"
                        className="live-trip-replay-btn"
                        aria-label="Restart replay"
                        data-toast-ignore
                        onClick={resetTripReplay}
                      >
                        ⏮
                      </button>
                      <button
                        type="button"
                        className="live-trip-replay-btn live-trip-replay-btn-primary"
                        aria-label={tripReplayPlaying ? "Pause replay" : "Play replay"}
                        data-toast-ignore
                        onClick={() => {
                          if (tripReplayPlaying) {
                            stopTripReplay();
                            return;
                          }
                          if (!tripReplayMetrics) return;
                          if ((tripReplayAtMs ?? tripReplayMetrics.startMs) >= tripReplayMetrics.endMs) {
                            tripReplayAtMsRef.current = tripReplayMetrics.startMs;
                            setTripReplayAtMs(tripReplayMetrics.startMs);
                          }
                          setTripReplayPlaying(true);
                        }}
                      >
                        {tripReplayPlaying ? "⏸" : "▶"}
                      </button>
                      <button
                        type="button"
                        className="live-trip-replay-btn"
                        aria-label="Stop replay"
                        data-toast-ignore
                        onClick={() => {
                          stopTripReplay();
                          setTripReplayAtMs(tripReplayMetrics.startMs);
                        }}
                      >
                        ⏹
                      </button>
                    </div>
                    <div className="live-trip-replay-speeds" role="group" aria-label="Replay speed">
                      {TRIP_REPLAY_SPEED_OPTIONS.map((speed) => (
                        <button
                          key={speed}
                          type="button"
                          className={`live-trip-replay-speed${tripReplaySpeed === speed ? " active" : ""}`}
                          data-toast-ignore
                          onClick={() => setTripReplaySpeed(speed)}
                        >
                          {speed}×
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="live-trip-replay-empty">
                    {trailLoadingAssetId
                      ? "Loading trail for replay…"
                      : "Show a trail on the map first, or lock an asset and open replay to load the last 24 hours."}
                    {!trailLoadingAssetId && tripReplayTrailAssetId && (
                      <button
                        type="button"
                        className="live-trip-replay-load"
                        data-toast-ignore
                        onClick={() => {
                          const target = assetRows.find((row) => row.id === tripReplayTrailAssetId);
                          if (target) void showTrailForAsset(target);
                        }}
                      >
                        Load trail
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="map-ui">
            <select
              className="map-layer-select"
              value={mapLayer}
              aria-label="Map layer"
              ref={mapLayerSelectRef}
              onChange={(event) => setMapLayer(event.target.value)}
            >
              <option value="roadmap">Roadmap</option>
              <option value="terrain">Terrain</option>
              <option value="satellite">Satellite</option>
              <option value="hybrid">Hybrid</option>
            </select>
            <div className="map-tools" aria-label="Map tools">
              <button
                type="button"
                className="map-tool"
                data-tooltip="Find"
                aria-label="Find"
                data-toast-ignore
                onClick={() => filterInputRef.current?.focus()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.2-3.2" />
                </svg>
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="Create location"
                aria-label="Create location"
                data-toast-ignore
                onClick={() => {
                  setShowCreateLocationTools((current) => !current);
                  setShowMapLayers(false);
                  setShowMapRotate(false);
                  setQueryMode(false);
                  setMeasureMode(null);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="Select assets"
                aria-label="Select assets"
                data-toast-ignore
                onClick={() => setShowAssetsModal(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 4h7M4 4v7M20 4h-7M20 4v7M4 20h7M4 20v-7M20 20h-7M20 20v-7" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="Map layers"
                aria-label="Map layers"
                data-toast-ignore
                onClick={() => setShowMapLayers((current) => !current)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4l8 4-8 4-8-4 8-4z" />
                  <path d="M4 12l8 4 8-4" />
                  <path d="M4 16l8 4 8-4" />
                </svg>
              </button>
              <button
                type="button"
                className={`map-tool${showMapRotate ? " active" : ""}`}
                data-tooltip="Rotate map"
                aria-label="Rotate map"
                data-toast-ignore
                onClick={() => setShowMapRotate((current) => !current)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                </svg>
              </button>
              <button
                type="button"
                className={`map-tool${showMapToolsPanel || measureMode === "distance" ? " active" : ""}`}
                data-tooltip="Map tools"
                aria-label="Map tools"
                data-toast-ignore
                onClick={() => {
                  setShowMapToolsPanel((current) => !current);
                  setShowMapLayers(false);
                  setShowMapRotate(false);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14.7 6.3a4 4 0 0 1-5.6 5.6l-5 5a2 2 0 0 0 2.8 2.8l5-5a4 4 0 0 1 5.6-5.6l-2.8 2.8 2 2 2.8-2.8z" />
                </svg>
              </button>
              <button
                type="button"
                className="map-tool"
                data-tooltip="Full screen"
                aria-label="Full screen"
                data-toast-ignore
                onClick={toggleMapFullscreen}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9V4h5" />
                  <path d="M20 9V4h-5" />
                  <path d="M4 15v5h5" />
                  <path d="M20 15v5h-5" />
                </svg>
              </button>
            </div>
          </div>
          {showMapRotate && (
            <div className="map-rotate-panel" role="dialog" aria-label="Rotate map">
              <label className="map-rotate-label">
                Rotation: {Math.round(mapRotation)}°
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={mapRotation}
                  onChange={(event) => setMapRotation(Number(event.target.value))}
                />
              </label>
              <button type="button" className="map-rotate-reset" onClick={() => setMapRotation(0)}>
                Reset
              </button>
            </div>
          )}
          {showMapToolsPanel && (
            <div className="map-tools-panel" role="menu" aria-label="Map tools">
              <button
                type="button"
                className={measureMode === "distance" ? "active" : ""}
                onClick={handleMeasureDistance}
              >
                Measure distance
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMapToolsPanel(false);
                  navigate("/Track/tracking/Control-road-hazards");
                }}
              >
                Road hazards
              </button>
            </div>
          )}
          {measureMode === "distance" && (
            <div className="map-Analyze-badge" role="status">
              <span>{measureHint}</span>
              <button
                type="button"
                aria-label="Clear measurement"
                data-toast-ignore
                onClick={() => setMeasureMode(null)}
              >
                ✕
              </button>
            </div>
          )}
          {showMapLayers && (
            <div className="map-layers-panel" role="dialog" aria-label="Map layers">
              <div className="map-layers-header">
                <span>Map layers</span>
                <button type="button" className="map-layers-close" onClick={() => setShowMapLayers(false)}>
                  ✕
                </button>
              </div>
              <div className="map-layers-section">
                <div className="map-layers-subtitle">Display</div>
                <div className="map-layers-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={mapLayers.clustering}
                      onChange={(event) =>
                        setMapLayers((current) => ({ ...current, clustering: event.target.checked }))
                      }
                    />
                    Asset clustering
                  </label>
                </div>
                <div className="map-layers-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={mapLayers.eventsOnTrail}
                      onChange={(event) =>
                        setMapLayers((current) => ({ ...current, eventsOnTrail: event.target.checked }))
                      }
                    />
                    Events on trail
                  </label>
                </div>
                <div className="map-layers-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={mapLayers.locationLabels}
                      onChange={(event) =>
                        setMapLayers((current) => ({ ...current, locationLabels: event.target.checked }))
                      }
                    />
                    Location labels
                  </label>
                </div>
              </div>
              <div className="map-layers-divider" />
              <div className="map-layers-section">
                <div className="map-layers-subtitle">Last trip</div>
                <div className="map-layers-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={mapLayers.showEntireLastTrip}
                      onChange={(event) =>
                        setMapLayers((current) => ({ ...current, showEntireLastTrip: event.target.checked }))
                      }
                    />
                    Show entire last trip
                  </label>
                </div>
                <div className="map-layers-row">
                  <span>Show last</span>
                  <input
                    className="map-layers-hours"
                    type="number"
                    min={1}
                    max={168}
                    value={Number(mapLayers.hours)}
                    onChange={(event) =>
                      setMapLayers((current) => ({
                        ...current,
                        hours: String(Math.max(1, Math.min(168, Number(event.target.value) || 1)))
                      }))
                    }
                  />
                  <span>hours</span>
                </div>
              </div>
              <div className="map-layers-footer">
                <button type="button" className="map-layers-save" onClick={handleSaveMapLayers}>
                  Save
                </button>
              </div>
            </div>
          )}
          {showCreateLocationTools && (
            <div className="map-create-panel" role="dialog" aria-label="Create location">
              <div className="map-create-header">
                <span>Create location</span>
                <button
                  type="button"
                  className="map-create-close"
                  onClick={() => setShowCreateLocationTools(false)}
                >
                  ✕
                </button>
              </div>
              <div className="map-create-body">
                <label>
                  Name
                  <input
                    type="text"
                    value={draftLocation.name}
                    onChange={(event) =>
                      setDraftLocation((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Depot, customer, or warehouse"
                  />
                </label>
                <label>
                  Location type
                  <select
                    value={draftLocation.locationType}
                    onChange={(event) =>
                      setDraftLocation((current) => ({ ...current, locationType: event.target.value }))
                    }
                  >
                    <option value="Customer">Customer</option>
                    <option value="Depot">Depot</option>
                    <option value="Warehouse">Warehouse</option>
                    <option value="Yard">Yard</option>
                  </select>
                </label>
                <label>
                  Site
                  <input
                    type="text"
                    value={draftLocation.site}
                    onChange={(event) =>
                      setDraftLocation((current) => ({ ...current, site: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Radius (meters)
                  <input
                    type="number"
                    min={0}
                    value={draftLocation.radius}
                    onChange={(event) =>
                      setDraftLocation((current) => ({
                        ...current,
                        radius: Math.max(0, Number(event.target.value) || 0)
                      }))
                    }
                  />
                </label>
              </div>
              <div className="map-create-actions">
                <button
                  type="button"
                  className="map-create-cancel"
                  onClick={() => setShowCreateLocationTools(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="map-create-save"
                  onClick={() => {
                    void (async () => {
                    if (!draftLocation.name.trim()) return;
                    if (draftLocation.lat === undefined || draftLocation.lng === undefined) return;
                    const newLocation: LocationRow = {
                      id: `loc-${Date.now()}`,
                      name: draftLocation.name.trim(),
                      site: draftLocation.site.trim() || "All sites",
                      locationType: draftLocation.locationType,
                      lat: draftLocation.lat,
                      lng: draftLocation.lng,
                      radius: draftLocation.radius
                    };
                    try {
                      const saved = await saveLocationGeofence({
                        id: newLocation.id,
                        name: newLocation.name,
                        type: newLocation.locationType,
                        site: newLocation.site,
                        availability: "Available",
                        shape: {
                          type: "circle",
                          center: { lat: newLocation.lat!, lng: newLocation.lng! },
                          radius: newLocation.radius ?? 250
                        }
                      });
                      const persistedLocation = {
                        ...newLocation,
                        id: String(saved.id),
                        shape: {
                          type: "circle" as const,
                          center: { lat: newLocation.lat!, lng: newLocation.lng! },
                          radius: newLocation.radius ?? 250
                        },
                        color: "#0ea5e9"
                      };
                      const nextLocations = [
                        persistedLocation,
                        ...customLocations.filter((row) => row.name.toLowerCase() !== persistedLocation.name.toLowerCase())
                      ];
                      customLocationsLoadGenerationRef.current += 1;
                      customLocationsHydratedRef.current = true;
                      setCustomLocations(nextLocations);
                      setLocations((current) => [
                        persistedLocation,
                        ...current.filter((row) => row.name.toLowerCase() !== persistedLocation.name.toLowerCase())
                      ]);
                      setSelectedLocations((current) => {
                        const next = new Set(current);
                        next.add(persistedLocation.id);
                        return next;
                      });
                      setDraftLocation({
                        name: "",
                        site: "All sites",
                        locationType: "Customer",
                        radius: 250
                      });
                      setShowCreateLocationTools(false);
                      setShowToast({ id: `location-${Date.now()}`, text: "Location saved to VIVI." });
                    } catch (error: any) {
                      setShowToast({
                        id: `location-error-${Date.now()}`,
                        text: String(error?.message ?? error ?? "Unable to save location to VIVI.")
                      });
                    }
                    })();
                  }}
                >
                  Save location
                </button>
              </div>
            </div>
          )}
          {showAssetsModal && (
            <div className="video-assets-modal" role="dialog" aria-modal="true" aria-label="Select assets">
              <div className="video-assets-card">
                <div className="video-assets-header">
                  <span>Select assets</span>
                  <button
                    className="video-assets-close"
                    type="button"
                    aria-label="Close"
                    onClick={() => setShowAssetsModal(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="video-assets-body">
                  <div className="video-assets-panel">
                    <input
                      className="video-assets-filter"
                      placeholder="Filter"
                      value={assetsFilter}
                      onChange={(event) => setAssetsFilter(event.target.value)}
                    />
                    <div className="video-assets-table">
                      <div className="video-assets-row video-assets-row-compact video-assets-head">
                        <div className="video-assets-cell">
                          <input
                            type="checkbox"
                            aria-label="Select all"
                            checked={
                              filteredAssets.length > 0 &&
                              filteredAssets.every((row) => selectedAssets.has(row.id))
                            }
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedAssets(new Set(filteredAssets.map((row) => row.id)));
                              } else {
                                setSelectedAssets(new Set());
                              }
                            }}
                          />
                        </div>
                        <div className="video-assets-cell">Id</div>
                        <div className="video-assets-cell">Asset description</div>
                        <div className="video-assets-cell">Registration</div>
                        <div className="video-assets-cell">Site</div>
                      </div>
                      {filteredAssets.length === 0 ? (
                        <div className="video-assets-row video-assets-empty">
                          <div className="video-assets-empty-text">No records available.</div>
                        </div>
                      ) : (
                        filteredAssets.map((row) => (
                          <div key={row.id} className="video-assets-row video-assets-row-compact video-assets-data">
                            <div className="video-assets-cell">
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.assetDescription}`}
                                checked={selectedAssets.has(row.id)}
                                onChange={(event) => {
                                  setSelectedAssets((current) => {
                                    const next = new Set(current);
                                    if (event.target.checked) next.add(row.id);
                                    else next.delete(row.id);
                                    return next;
                                  });
                                }}
                              />
                            </div>
                            <div className="video-assets-cell" title={row.id}>{row.id}</div>
                            <div className="video-assets-cell" title={row.assetDescription}>{row.assetDescription}</div>
                            <div className="video-assets-cell" title={row.registration}>{row.registration}</div>
                            <div className="video-assets-cell" title={row.site}>{row.site}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="video-assets-actions">
                  <button type="button" className="video-assets-cancel" onClick={() => setShowAssetsModal(false)}>
                    Cancel
                  </button>
                  <button type="button" className="video-assets-select" onClick={() => setShowAssetsModal(false)}>
                    Select
                  </button>
                </div>
              </div>
            </div>
          )}
          {showFuelAnalysisModal && (
            <div className="video-assets-modal fuel-analysis-modal" role="dialog" aria-modal="true"             aria-label="Fuel/Temp Analysis">              <div className="video-assets-card fuel-analysis-card">
                <div className="video-assets-header">
                  <span>Fuel/Temp Analysis</span>
                  <button
                    className="video-assets-close"
                    type="button"
                    aria-label="Close"
                    onClick={() => setShowFuelAnalysisModal(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="video-assets-body">
                  <div className="fuel-analysis-filters">
                    <label>
                      Site
                      <select
                        value={activeSiteFilter ? activeSiteFilter : fuelAnalysisSite}
                        disabled={Boolean(activeSiteFilter)}
                        onChange={(event) => {
                          setFuelAnalysisSite(event.target.value);
                          setFuelAnalysisAssetId("all");
                        }}
                      >
                        {activeSiteFilter ? null : <option value="all">All sites in this hierarchy</option>}
                        {fuelAnalysisSites.map((site) => (
                          <option key={site} value={site}>{site}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Asset
                      <select value={fuelAnalysisAssetId} onChange={(event) => setFuelAnalysisAssetId(event.target.value)}>
                        <option value="all">All assets</option>
                        {fuelAnalysisAssetOptions.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.registration || asset.assetDescription}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      From
                      <span className="fuel-analysis-datetime">
                        <button type="button" className="trip-datetime-value-btn" onClick={() => openFuelAnalysisPicker("from")}>
                          {formatFuelAnalysisRange(fuelAnalysisFrom)}
                        </button>
                        <button type="button" className="trip-toolbar-chip" aria-label="Open from calendar" onClick={() => openFuelAnalysisPicker("from")}>
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                            <path d="M3 9h18M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      </span>
                    </label>
                    <label>
                      To
                      <span className="fuel-analysis-datetime">
                        <button type="button" className="trip-datetime-value-btn" onClick={() => openFuelAnalysisPicker("to")}>
                          {formatFuelAnalysisRange(fuelAnalysisTo)}
                        </button>
                        <button type="button" className="trip-toolbar-chip" aria-label="Open to calendar" onClick={() => openFuelAnalysisPicker("to")}>
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                            <path d="M3 9h18M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      </span>
                    </label>
                    <button type="button" className="video-assets-select" onClick={() => void downloadFuelAnalysis()}>
                      Download
                    </button>
                  </div>
                  <div className="video-assets-panel">
                    <div className="fuel-analysis-scroll">
                      <table className="fuel-analysis-table">
                        <thead>
                          <tr>
                            {fuelAnalysisColumns.map((column) => (
                              <th key={column.key}>{column.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visibleFuelAnalysisRows.length === 0 ? (
                            <tr>
                              <td colSpan={fuelAnalysisColumns.length} className="fuel-event-empty-row">
                                {fuelAnalysisStatus === "loading" ? "Loading fuel telemetry…" : "No tracker samples yet."}
                              </td>
                            </tr>
                          ) : (
                            visibleFuelAnalysisRows.map((row) => (
                              <tr
                                key={row.id}
                                className={
                                  row.event === "RAISE"
                                    ? "is-raise"
                                    : row.event === "SIPHONING"
                                      ? "is-siphon"
                                      : row.event === "NOISE" || row.quality === "SUSPECT"
                                        ? "is-suspect"
                                        : row.quality === "MISSING" || row.quality === "STALE" || row.quality === "INVALID" || row.event === "DATA_GAP"
                                          ? "is-gap"
                                          : ""
                                }
                              >
                                {fuelAnalysisColumns.map((column) => (
                                  <td key={column.key} title={row.cells[column.key]}>{row.cells[column.key]}</td>
                                ))}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="video-assets-actions">
                  <button type="button" className="video-assets-cancel" onClick={() => setShowFuelAnalysisModal(false)}>
                    Close
                  </button>
                </div>
              </div>
              <ScheduleDateTimePicker
                open={fuelPickerTarget !== null}
                nested
                date={fuelPickerDate}
                time={fuelPickerTime}
                mode={fuelPickerMode}
                title={fuelPickerTarget === "to" ? "To" : "From"}
                restrictToPast
                onClose={() => setFuelPickerTarget(null)}
                onConfirm={() => setFuelPickerTarget(null)}
                onDateChange={(date) => commitFuelAnalysisPicker(date, fuelPickerTime)}
                onTimeChange={(time) => commitFuelAnalysisPicker(fuelPickerDate, time)}
                onModeChange={setFuelPickerMode}
              />
            </div>
          )}
          {showLocationsModal && (
            <div className="video-assets-modal" role="dialog" aria-modal="true" aria-label="Select locations">
              <div className="video-assets-card">
                <div className="video-assets-header">
                  <span>Select locations</span>
                  <button
                    className="video-assets-close"
                    type="button"
                    aria-label="Close"
                    onClick={() => setShowLocationsModal(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="video-assets-body">
                  <div className="video-assets-panel">
                    <input
                      className="video-assets-filter"
                      placeholder="Filter"
                      value={locationFilter}
                      onChange={(event) => setLocationFilter(event.target.value)}
                    />
                    <div className="video-assets-table">
                      <div className="video-assets-row video-assets-row-locations video-assets-head">
                        <div className="video-assets-cell">
                          <input
                            type="checkbox"
                            aria-label="Select all locations"
                            checked={
                              filteredLocations.length > 0 &&
                              filteredLocations.every((row) => selectedLocations.has(row.id))
                            }
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedLocations(new Set(filteredLocations.map((row) => row.id)));
                              } else {
                                setSelectedLocations(new Set());
                              }
                            }}
                          />
                        </div>
                        <div className="video-assets-cell">Name</div>
                        <div className="video-assets-cell">Site</div>
                        <div className="video-assets-cell">Type</div>
                      </div>
                      {filteredLocations.length === 0 ? (
                        <div className="video-assets-row video-assets-empty">
                          <div className="video-assets-empty-text">No records available.</div>
                        </div>
                      ) : (
                        filteredLocations.map((row) => (
                          <div key={row.id} className="video-assets-row video-assets-row-locations video-assets-data">
                            <div className="video-assets-cell">
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.name}`}
                                checked={selectedLocations.has(row.id)}
                                onChange={() => toggleLocation(row.id)}
                              />
                            </div>
                            <div className="video-assets-cell" title={row.name}>{row.name}</div>
                            <div className="video-assets-cell" title={row.site}>{row.site}</div>
                            <div className="video-assets-cell" title={row.locationType}>{row.locationType}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="video-assets-actions">
                  <button type="button" className="video-assets-cancel" onClick={() => setShowLocationsModal(false)}>
                    Cancel
                  </button>
                  <button type="button" className="video-assets-select" onClick={() => setShowLocationsModal(false)}>
                    Select
                  </button>
                </div>
              </div>
            </div>
          )}
          {showEventsModal && (
            <div className="video-assets-modal" role="dialog" aria-modal="true" aria-label="Select alerts">
              <div className="video-assets-card">
                <div className="video-assets-header">
                  <span>Select alerts</span>
                  <button
                    className="video-assets-close"
                    type="button"
                    aria-label="Close"
                    onClick={() => setShowEventsModal(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="video-assets-body">
                  <div className="video-assets-panel">
                    <input
                      className="video-assets-filter"
                      placeholder="Filter"
                      value={eventFilter}
                      onChange={(event) => setEventFilter(event.target.value)}
                    />
                    <div className="video-assets-table">
                      <div className="video-assets-row video-assets-row-alerts video-assets-head">
                        <div className="video-assets-cell">
                          <input
                            type="checkbox"
                            aria-label="Select all alerts"
                            checked={
                              filteredEvents.length > 0 &&
                              filteredEvents.every((row) => selectedEvents.has(row.id))
                            }
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedEvents(new Set(filteredEvents.map((row) => row.id)));
                              } else {
                                setSelectedEvents(new Set());
                              }
                            }}
                          />
                        </div>
                        <div className="video-assets-cell">Alert</div>
                        <div className="video-assets-cell">Type</div>
                      </div>
                      {filteredEvents.length === 0 ? (
                        <div className="video-assets-row video-assets-empty">
                          <div className="video-assets-empty-text">
                            No bound notifications for this site. Add events in Control → Bindings → Notifications Bindings.
                          </div>
                        </div>
                      ) : (
                        filteredEvents.map((row) => (
                          <div key={row.id} className="video-assets-row video-assets-row-alerts video-assets-data">
                            <div className="video-assets-cell">
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.name}`}
                                checked={selectedEvents.has(row.id)}
                                onChange={() => toggleEvent(row.id)}
                              />
                            </div>
                            <div className="video-assets-cell" title={row.name}>{row.name}</div>
                            <div className="video-assets-cell" title={row.eventType}>{row.eventType}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="video-assets-actions">
                  <button type="button" className="video-assets-cancel" onClick={() => setShowEventsModal(false)}>
                    Cancel
                  </button>
                  <button type="button" className="video-assets-select" onClick={() => setShowEventsModal(false)}>
                    Select
                  </button>
                </div>
              </div>
            </div>
          )}
          {showAssetDetailsModal && liveDetailsAsset && (
            <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Asset details">
              <div className="asset-details-card">
                <div className="asset-details-header">
                  <div>
                    <div className="asset-details-title">Asset details</div>
                    <div className="asset-details-sub">{liveDetailsAsset.assetDescription}</div>
                  </div>
                  <button
                    type="button"
                    className="asset-details-close"
                    aria-label="Close"
                    onClick={() => {
                      setShowAssetDetailsModal(false);
                      setDetailsAsset(null);
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="asset-details-body">
                  <div className="asset-details-row"><span>Registration</span><span>{liveDetailsAsset.registration}</span></div>
                  <div className="asset-details-row"><span>Asset ID</span><span>{liveDetailsAsset.assetId}</span></div>
                  <div className="asset-details-row"><span>Fleet number</span><span>{liveDetailsAsset.fleetNumber}</span></div>
                  <div className="asset-details-row"><span>Site</span><span>{liveDetailsAsset.site}</span></div>
                  <div className="asset-details-row"><span>Database</span><span>{getDiagnosticsDatabase(liveDetailsAsset) || "Not available"}</span></div>
                  <div className="asset-details-row"><span>Driver</span><span>{formatDriverValue(liveDetailsAsset.driver)}</span></div>
                  <div className="asset-details-row"><span>Last position</span><span>{liveDetailsAsset.lastPosition}</span></div>
                  <div className="asset-details-row"><span>Location</span><span>{liveDetailsAsset.location}</span></div>
                  <div className="asset-details-row"><span>Speed</span><span>{normalizeSpeedToKph(liveDetailsAsset.speed) || "0.00"} km/h</span></div>
                  <div className="asset-details-row"><span>Heading</span><span>{liveDetailsAsset.heading}</span></div>
                  <div className="asset-details-row"><span>Ignition</span><span>{liveDetailsAsset.ignition}</span></div>
                  <div className="asset-details-row"><span>Voltage</span><span>{liveDetailsAsset.powerVoltage || "—"}</span></div>
                  <div className="asset-details-row"><span>Mobile device</span><span>{liveDetailsAsset.mobileDeviceType}</span></div>
                  <div className="asset-details-row"><span>Satellites</span><span>{liveDetailsAsset.satellites || "—"}</span></div>
                </div>
              </div>
            </div>
          )}
          {showFuelModal && fuelModalAsset && (
            <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Sensor / Fuel / Temperature">
              <div className="assets-add-card fuel-tachograph-card">
                <div className="assets-add-header">
                  <div className="assets-add-title">Sensor / Fuel / Temperature</div>
                  <div className="assets-add-actions fuel-tachograph-actions">
                    <div className="history-preset-dropdown" ref={fuelTimeRangeMenuRef}>
                      <button
                        type="button"
                        className="history-preset-btn fuel-tachograph-range-btn"
                        aria-haspopup="listbox"
                        aria-expanded={showFuelTimeRangeMenu}
                        onClick={() => setShowFuelTimeRangeMenu((open) => !open)}
                      >
                        {fuelTimeRangeLabel}
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className={`dropdown-chevron${showFuelTimeRangeMenu ? " open" : ""}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {showFuelTimeRangeMenu && (
                        <div className="history-preset-menu" role="listbox" aria-label="Fuel chart time range">
                          {FUEL_TACHO_TIME_RANGE_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              role="option"
                              aria-selected={fuelTimeRange === option.id}
                              className={`history-preset-option${fuelTimeRange === option.id ? " fuel-tachograph-range-option--active" : ""}`}
                              onClick={() => {
                                if (fuelModalAsset) {
                                  void loadFuelTachographData(fuelModalAsset, option.id);
                                }
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`btn ghost${fuelEventDetailKind === "last-refill" ? " active" : ""}`}
                      aria-pressed={fuelEventDetailKind === "last-refill"}
                      aria-controls="fuel-event-details"
                      onClick={() => {
                        void showLastRefill();
                      }}
                    >
                      Last refill
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        navigate("/Analyze/insights/reports?category=Fuel%20Reports&report=Measured%20Fuel%20Report");
                        closeFuelModal();
                      }}
                    >
                      Open fuel reports
                    </button>
                    <button type="button" className="btn ghost" onClick={closeFuelModal}>
                      Close
                    </button>
                  </div>
                </div>
                <div className="assets-add-body fuel-tachograph-body">
                  <div className="fuel-tachograph-report-head">
                    <div className="fuel-tachograph-report-row">
                      <span className="fuel-tachograph-report-label">Asset</span>
                      <span>{buildAssetPopupLabel(fuelModalAsset)}</span>
                    </div>
                    <div className="fuel-tachograph-report-row">
                      <span className="fuel-tachograph-report-label">From</span>
                      <span>{formatFuelReportDateTime(fuelRange.fromMs)}</span>
                    </div>
                    <div className="fuel-tachograph-report-row">
                      <span className="fuel-tachograph-report-label">To</span>
                      <span>{formatFuelReportDateTime(fuelRange.toMs)}</span>
                    </div>
                    <div className="fuel-tachograph-report-row">
                      <span className="fuel-tachograph-report-label">Generated on</span>
                      <span>{formatFuelReportDateTime(fuelGeneratedAtMs)}</span>
                    </div>
                  </div>
                  {fuelTachoStats && (
                    <div className="fuel-tachograph-kpis" aria-label="Fuel summary">
                      <div className="fuel-tachograph-kpi">
                        <div className="fuel-tachograph-kpi-value">{fuelTachoStats.totalDistanceKm.toFixed(2)} km</div>
                        <div className="fuel-tachograph-kpi-label">Distance</div>
                      </div>
                      <div className="fuel-tachograph-kpi">
                        <div className="fuel-tachograph-kpi-value">{fuelTachoStats.currentFuelL.toFixed(2)} L</div>
                        <div className="fuel-tachograph-kpi-label">Current fuel</div>
                      </div>
                      <div className="fuel-tachograph-kpi">
                        <div className="fuel-tachograph-kpi-value">{fuelTachoStats.fuelUsedL.toFixed(2)} L</div>
                        <div className="fuel-tachograph-kpi-label">Fuel used</div>
                      </div>
                      <div className="fuel-tachograph-kpi">
                        <div className="fuel-tachograph-kpi-value">{fuelTachoStats.consumptionKmPerL.toFixed(2)} KM/L</div>
                        <div className="fuel-tachograph-kpi-label">Consumption</div>
                      </div>
                      <div className="fuel-tachograph-kpi">
                        <div className="fuel-tachograph-kpi-value">{`${fuelDrainEvents.length} (${fuelTachoStats.drainL.toFixed(2)} L)`}</div>
                        <div className="fuel-tachograph-kpi-label">Drains</div>
                      </div>
                      <div className="fuel-tachograph-kpi">
                        <div className="fuel-tachograph-kpi-value">{`${fuelRefillEvents.length} (${fuelTachoStats.refillL.toFixed(2)} L)`}</div>
                        <div className="fuel-tachograph-kpi-label">Refills</div>
                      </div>
                    </div>
                  )}
                  {fuelEventDetailKind === "last-refill" && (
                    <div id="fuel-event-details" className="fuel-tachograph-event-details">
                      <div className="fuel-tachograph-event-details-title">Last refill</div>
                      {fuelLastRefillStatus === "loading" ? (
                        <div className="fuel-tachograph-event-empty">Looking up the last refill...</div>
                      ) : fuelLastRefillStatus === "error" ? (
                        <div className="fuel-tachograph-event-empty">{fuelLastRefillError || "Unable to find the last refill."}</div>
                      ) : fuelEventDetails.length === 0 ? (
                        <div className="fuel-tachograph-event-empty">No refill found in the last 30 days.</div>
                      ) : (
                        <ul className="fuel-tachograph-event-list">
                          {fuelEventDetails.map((event) => (
                            <li
                              key={`last-refill-${event.atMs}-${event.fromLevel}-${event.toLevel}`}
                              className="fuel-tachograph-event-item"
                            >
                              <div className="fuel-tachograph-event-time">
                                {formatFuelReportDateTime(event.atMs)}
                              </div>
                              <div className="fuel-tachograph-event-volume">
                                {`${event.fromLevel.toFixed(1)} L → ${event.toLevel.toFixed(1)} L (${event.deltaLiters > 0 ? "+" : ""}${event.deltaLiters.toFixed(1)} L)`}
                              </div>
                              <div className="fuel-tachograph-event-location">
                                {event.locationName
                                  || (Number.isFinite(event.lat) && Number.isFinite(event.lng)
                                    ? "Resolving location..."
                                    : "Location unavailable")}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <div className="fuel-tachograph-canvas" aria-live="polite">
                    <svg
                      ref={fuelChartSvgRef}
                      viewBox={`0 0 ${fuelChartGeometry.width} ${fuelChartGeometry.height}`}
                      className="fuel-tachograph-svg"
                      role="img"
                      aria-label={`Fuel graph over the ${fuelChartSpanLabel}`}
                      onMouseMove={(event) => {
                        updateFuelHoverFromClientX(event.clientX);
                      }}
                      onMouseLeave={() => {
                        setFuelHoverIndex(null);
                      }}
                    >
                      <rect x="0" y="0" width={fuelChartGeometry.width} height={fuelChartGeometry.height} fill="#ffffff" />
                      <rect
                        x={fuelChartGeometry.left}
                        y={fuelChartGeometry.top}
                        width={fuelChartGeometry.innerWidth}
                        height={fuelChartGeometry.innerHeight}
                        fill="#eef6fc"
                      />

                      {fuelChartGeometry.yTicks.map((tick) => (
                        <g key={`y-${tick.liters}`}>
                          <line
                            x1={fuelChartGeometry.left}
                            y1={tick.y}
                            x2={fuelChartGeometry.left + fuelChartGeometry.innerWidth}
                            y2={tick.y}
                            stroke="#d5e4f0"
                            strokeWidth="1"
                          />
                          <text
                            x={fuelChartGeometry.left - 10}
                            y={tick.y + 4}
                            textAnchor="end"
                            fill="#64748b"
                            fontSize="11"
                          >
                            {tick.liters % 1 === 0 ? String(tick.liters) : tick.liters.toFixed(1)}
                          </text>
                        </g>
                      ))}

                      {fuelChartGeometry.xTicks.map((tick) => (
                        <g key={`x-${tick.atMs}`}>
                          <text
                            x={tick.x}
                            y={fuelChartGeometry.top + fuelChartGeometry.innerHeight + 20}
                            textAnchor={tick.anchor}
                            fill="#64748b"
                            fontSize="10"
                          >
                            {tick.label}
                          </text>
                        </g>
                      ))}

                      <line
                        x1={fuelChartGeometry.left}
                        y1={fuelChartGeometry.top + fuelChartGeometry.innerHeight}
                        x2={fuelChartGeometry.left + fuelChartGeometry.innerWidth}
                        y2={fuelChartGeometry.top + fuelChartGeometry.innerHeight}
                        stroke="#94a3b8"
                        strokeWidth="1"
                      />
                      <line
                        x1={fuelChartGeometry.left}
                        y1={fuelChartGeometry.top}
                        x2={fuelChartGeometry.left}
                        y2={fuelChartGeometry.top + fuelChartGeometry.innerHeight}
                        stroke="#94a3b8"
                        strokeWidth="1"
                      />

                      <text
                        x="16"
                        y={fuelChartGeometry.top + fuelChartGeometry.innerHeight / 2}
                        transform={`rotate(-90 16 ${fuelChartGeometry.top + fuelChartGeometry.innerHeight / 2})`}
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="12"
                      >
                        Fuel graph (litres)
                      </text>

                      {fuelChartGeometry.areaPath && (
                        <path d={fuelChartGeometry.areaPath} fill="#b7d8f2" stroke="none" />
                      )}
                      {fuelChartGeometry.linePath && (
                        <path
                          d={fuelChartGeometry.linePath}
                          fill="none"
                          stroke="#5aa3d4"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}

                      {fuelEventDetailKind === "last-refill" && fuelChartGeometry.lastRefillDot && (
                        <>
                          <line
                            x1={fuelChartGeometry.lastRefillDot.x}
                            y1={fuelChartGeometry.top}
                            x2={fuelChartGeometry.lastRefillDot.x}
                            y2={fuelChartGeometry.top + fuelChartGeometry.innerHeight}
                            stroke="#16a34a"
                            strokeDasharray="4 3"
                          />
                          <circle
                            cx={fuelChartGeometry.lastRefillDot.x}
                            cy={fuelChartGeometry.lastRefillDot.y}
                            r="6"
                            fill="#16a34a"
                            stroke="#ffffff"
                            strokeWidth="1.6"
                          />
                        </>
                      )}

                      {fuelHoverIndex !== null && fuelChartGeometry.pointDots[fuelHoverIndex] && (
                        <>
                          <line
                            x1={fuelChartGeometry.pointDots[fuelHoverIndex].x}
                            y1={fuelChartGeometry.top}
                            x2={fuelChartGeometry.pointDots[fuelHoverIndex].x}
                            y2={fuelChartGeometry.top + fuelChartGeometry.innerHeight}
                            stroke="#0284c7"
                            strokeDasharray="4 3"
                          />
                          <circle
                            cx={fuelChartGeometry.pointDots[fuelHoverIndex].x}
                            cy={fuelChartGeometry.pointDots[fuelHoverIndex].y}
                            r="4.5"
                            fill="#0284c7"
                            stroke="#ffffff"
                            strokeWidth="1.4"
                          />
                          <g
                            transform={`translate(${Math.min(
                              fuelChartGeometry.width - 228,
                              Math.max(16, fuelChartGeometry.pointDots[fuelHoverIndex].x + 12)
                            )} ${Math.max(18, fuelChartGeometry.pointDots[fuelHoverIndex].y - 58)})`}
                          >
                            <rect x="0" y="0" width="210" height="50" rx="4" fill="#3b8fc4" />
                            <text x="10" y="20" fill="#ffffff" fontSize="12">
                              {`In tank: ${fuelChartGeometry.pointDots[fuelHoverIndex].liters.toFixed(2)} L`}
                            </text>
                            <text x="10" y="38" fill="#ffffff" fontSize="12">
                              {`Ignition Status : ${
                                fuelChartGeometry.pointDots[fuelHoverIndex].ignition === true
                                  ? "on"
                                  : fuelChartGeometry.pointDots[fuelHoverIndex].ignition === false
                                    ? "off"
                                    : "—"
                              }`}
                            </text>
                          </g>
                        </>
                      )}

                    </svg>
                    <div className="fuel-tachograph-series-legend" role="tablist" aria-label="Fuel series">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={!fuelShowRawReadings}
                        className={`fuel-tachograph-series-btn${!fuelShowRawReadings ? " is-active" : ""}`}
                        onClick={() => {
                          setFuelHoverIndex(null);
                          setFuelShowRawReadings(false);
                        }}
                      >
                        <span className="fuel-tachograph-series-swatch is-fuel" />
                        Fuel
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={fuelShowRawReadings}
                        className={`fuel-tachograph-series-btn${fuelShowRawReadings ? " is-active" : ""}`}
                        onClick={() => {
                          setFuelHoverIndex(null);
                          setFuelShowRawReadings(true);
                        }}
                      >
                        <span className="fuel-tachograph-series-swatch is-raw" />
                        Raw
                      </button>
                    </div>

                    {fuelModalStatus === "loading" && <div className="fuel-tachograph-hint">Loading fuel data...</div>}
                    {fuelModalStatus === "error" && <div className="fuel-tachograph-hint">{fuelModalError || "Unable to load fuel data."}</div>}
                    {fuelModalStatus === "ready" && fuelTrendPoints.length === 0 && (
                      <div className="fuel-tachograph-hint">{`No fuel points found in this ${fuelChartSpanLabel} window. Axes remain visible for reference.`}</div>
                    )}
                    {fuelModalStatus === "ready" && fuelTrendPoints.length > 0 && fuelModalError && (
                      <div className="fuel-tachograph-hint">{fuelModalError}</div>
                    )}
                  </div>
                  <div className="fuel-event-sections">
                    <FuelEventLedger
                      kind="drain"
                      events={fuelDrainEvents}
                      loading={fuelModalStatus === "loading"}
                    />
                    <FuelEventLedger
                      kind="refill"
                      events={fuelRefillEvents}
                      loading={fuelModalStatus === "loading"}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          {canViewDeviceHealth && deviceHealthAsset && (
            <DeviceHealthModal
              assetLabel={
                String(deviceHealthAsset.assetDescription ?? "").trim()
                || String(deviceHealthAsset.registration ?? "").trim()
                || String(deviceHealthAsset.imei ?? "").trim()
                || "Asset"
              }
              deviceId={deviceHealthAsset.traccarDeviceId}
              imei={String(deviceHealthAsset.imei ?? "").replace(/\D+/g, "") || undefined}
              onClose={() => setDeviceHealthAsset(null)}
            />
          )}
          {showDiagnosticsModal && diagnosticsAsset && (
            <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Diagnostics">
              <div className="assets-add-card diagnostics-modal-card">
                <div className="assets-add-header">
                  <div className="assets-add-title">Diagnostics</div>
                  <div className="assets-add-actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        setShowDiagnosticsModal(false);
                        setDiagnosticsAsset(null);
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="assets-add-body diagnostics-modal-body">
                  <button type="button" className="diagnostics-pill">Request firmware version</button>

                  <div className="diagnostics-card">
                    <button
                      type="button"
                      className="diagnostics-toggle"
                      onClick={() =>
                        setDiagnosticsOpen((current) => ({ ...current, assetDetails: !current.assetDetails }))
                      }
                    >
                      Asset details
                      <span>{diagnosticsOpen.assetDetails ? "−" : "+"}</span>
                    </button>
                    {diagnosticsOpen.assetDetails && (
                      <div className="diagnostics-table">
                        <div className="diagnostics-row"><span>Asset description</span><span>{diagnosticsAsset.assetDescription}</span></div>
                        <div className="diagnostics-row"><span>Registration number</span><span>{diagnosticsAsset.registration}</span></div>
                        <div className="diagnostics-row"><span>Asset ID</span><span>{diagnosticsAsset.assetId}</span></div>
                        <div className="diagnostics-row"><span>Site</span><span>{diagnosticsAsset.site}</span></div>
                        <div className="diagnostics-row"><span>Database</span><span>{getDiagnosticsDatabase(diagnosticsAsset) || "Not available"}</span></div>
                        <div className="diagnostics-row"><span>Status</span><span style={{ display: "flex", alignItems: "center", gap: 6 }}>{statusDot(diagnosticsLiveRow?.status ?? diagnosticsAsset.status)}{statusLabel(diagnosticsLiveRow?.status ?? diagnosticsAsset.status)}</span></div>
                      </div>
                    )}
                  </div>

                  <div className="diagnostics-card">
                    <button
                      type="button"
                      className="diagnostics-toggle"
                      onClick={() =>
                        setDiagnosticsOpen((current) => ({ ...current, mobileDevice: !current.mobileDevice }))
                      }
                    >
                      Mobile device details
                      <span>{diagnosticsOpen.mobileDevice ? "−" : "+"}</span>
                    </button>
                    {diagnosticsOpen.mobileDevice && (
                      <div className="diagnostics-table">
                        <div className="diagnostics-row"><span>Mobile device</span><span>{diagnosticsMobileDeviceName}</span></div>
                        <div className="diagnostics-row"><span>IMEI</span><span>{deriveImeiFromAsset(diagnosticsAsset) || ""}</span></div>
                        <div className="diagnostics-row"><span>Firmware version</span><span>{diagnosticsLatestFirmware}</span></div>
                      </div>
                    )}
                  </div>

                  <div className="diagnostics-card">
                    <button
                      type="button"
                      className="diagnostics-toggle"
                      onClick={() =>
                        setDiagnosticsOpen((current) => ({ ...current, tripInfo: !current.tripInfo }))
                      }
                    >
                      Trip information
                      <span>{diagnosticsOpen.tripInfo ? "−" : "+"}</span>
                    </button>
                    {diagnosticsOpen.tripInfo && (
                      <div className="diagnostics-table">
                        <div className="diagnostics-row"><span>Driver</span><span>{formatDriverValue(diagnosticsAsset.driver)}</span></div>
                        <div className="diagnostics-row"><span>Ignition state</span><span>{diagnosticsLatestIgnition}</span></div>
                        {diagnosticsIgnitionOnSince && <div className="diagnostics-row"><span>Ignition on since</span><span>{diagnosticsIgnitionOnSince}</span></div>}
                        {diagnosticsIgnitionDuration && <div className="diagnostics-row"><span>Ignition duration</span><span>{diagnosticsIgnitionDuration}</span></div>}
                        <div className="diagnostics-row"><span>Speed</span><span>{diagnosticsLatestSpeed}</span></div>
                      </div>
                    )}
                  </div>

                  <div className="diagnostics-card">
                    <button
                      type="button"
                      className="diagnostics-toggle"
                      onClick={() =>
                        setDiagnosticsOpen((current) => ({ ...current, latestPosition: !current.latestPosition }))
                      }
                    >
                      Latest position information
                      <span>{diagnosticsOpen.latestPosition ? "−" : "+"}</span>
                    </button>
                    {diagnosticsOpen.latestPosition && (
                      <div className="diagnostics-table">
                        <div className="diagnostics-row"><span>Date and time of last AVL</span><span>{diagnosticsLatestAt}</span></div>
                        <div className="diagnostics-row"><span>Ignition state</span><span>{diagnosticsLatestIgnition}</span></div>
                        <div className="diagnostics-row"><span>Longitude</span><span>{diagnosticsLatestLng}</span></div>
                        <div className="diagnostics-row"><span>Latitude</span><span>{diagnosticsLatestLat}</span></div>
                        <div className="diagnostics-row"><span>Heading</span><span>{diagnosticsLatestHeading}</span></div>
                        <div className="diagnostics-row"><span>Number of satellites</span><span>{diagnosticsLatestSatellites}</span></div>
                      </div>
                    )}
                  </div>

                  {isGpsIotServer() && (
                    <div className="diagnostics-card">
                      <button
                        type="button"
                        className="diagnostics-toggle"
                        onClick={() =>
                          setDiagnosticsOpen((current) => ({ ...current, inputStatus: !current.inputStatus }))
                        }
                      >
                        Input status
                        <span>{diagnosticsOpen.inputStatus ? "−" : "+"}</span>
                      </button>
                      {diagnosticsOpen.inputStatus && (
                        <div className="diagnostics-table">
                          {diagnosticsInputStatus.status === "loading" && (
                            <div className="diagnostics-row"><span>Loading</span><span>Fetching GPS IoT input status…</span></div>
                          )}
                          {diagnosticsInputStatus.status === "error" && (
                            <div className="diagnostics-row"><span>Error</span><span>{diagnosticsInputStatus.error || "Unavailable"}</span></div>
                          )}
                          {diagnosticsInputStatus.status === "ready" && diagnosticsInputStatus.inputs.length === 0 && (
                            <div className="diagnostics-row"><span>Inputs</span><span>No input status reported</span></div>
                          )}
                          {diagnosticsInputStatus.inputs.map((input) => (
                            <div className="diagnostics-row" key={`${input.name}-${input.kind}`}>
                              <span>{input.name}{input.kind !== "unknown" ? ` (${input.kind})` : ""}</span>
                              <span>{formatGpsIotInputStatusLabel(input)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {showShareLiveModal && shareLiveAsset && (
            <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Share live location">
              <div className="assets-add-card sms-modal-card">
                <div className="assets-add-header">
                  <div className="assets-add-title">Share live location (expires in 12 hours)</div>
                  <div className="assets-add-actions">
                    <button type="button" className="btn ghost" onClick={closeShareLiveModal}>
                      Close
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        void handleCreateAndSendShareLink();
                      }}
                      disabled={shareLiveSending}
                    >
                      {shareLiveSending ? "Sending..." : "Create and send"}
                    </button>
                  </div>
                </div>
                <div className="assets-add-body sms-modal-body">
                  <div className="sms-modal-content">
                    <div className="sms-modal-label">Send live tracking link by email</div>
                    <div className="sms-modal-target">{`${buildAssetPopupLabel(shareLiveAsset)} - ${shareLiveAsset.registration}`}</div>
                    <label className="bindings-field">
                      Recipient email(s)
                      <input
                        className="bindings-input"
                        type="email"
                        placeholder="name@example.com, another@example.com"
                        value={shareLiveEmail}
                        onChange={(event) => setShareLiveEmail(event.target.value)}
                      />
                    </label>
                    {shareLiveLink && (
                      <label className="bindings-field">
                        Share link
                        <input className="bindings-input" value={shareLiveLink} readOnly />
                      </label>
                    )}
                    {shareLiveExpiresAt && (
                      <div className="sms-modal-target">Expires: {formatTimestamp(shareLiveExpiresAt)}</div>
                    )}
                    {shareLiveLink && (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(shareLiveLink);
                            setShareLiveStatus("Link copied to clipboard.");
                          } catch {
                            setShareLiveStatus("Copy failed. Please copy manually.");
                          }
                        }}
                      >
                        Copy link
                      </button>
                    )}
                    {shareLiveStatus && <div className="sms-modal-target">{shareLiveStatus}</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
          {showImmobilizerModal && immobilizerAsset && (
            <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Immobilizer actions">
              <div className="assets-add-card sms-modal-card">
                <div className="assets-add-header">
                  <div className="assets-add-title">Immobilizer actions</div>
                  <div className="assets-add-actions">
                    <button type="button" className="btn ghost" onClick={closeImmobilizerModal}>
                      Close
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        void handleImmobilizerSaveAndCompile();
                      }}
                      disabled={immobilizerBusy || !immobilizerAction}
                    >
                      {immobilizerBusy ? "Saving..." : "Save and compile"}
                    </button>
                  </div>
                </div>
                <div className="assets-add-body sms-modal-body">
                  <div className="sms-modal-content">
                    <div className="sms-modal-label">Select immobilizer action</div>
                    <div className="sms-modal-target">{`${buildAssetPopupLabel(immobilizerAsset)} - ${immobilizerAsset.registration}`}</div>
                    <div className="immobilizer-action-options">
                      {(["cutOff", "turnOn"] as ImmobilizerAction[]).map((action) => (
                        <label key={action} className="immobilizer-action-option">
                          <input
                            type="radio"
                            name="immobilizer-action"
                            value={action}
                            checked={immobilizerAction === action}
                            onChange={() => setImmobilizerAction(action)}
                          />
                          <span className="immobilizer-action-option-copy">
                            <span className="immobilizer-action-option-title">{immobilizerActionLabel(action)}</span>
                            <span className="immobilizer-action-option-desc">{immobilizerActionDescription(action)}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="sms-modal-target">
                      Choose an action, then click Save and compile to queue the command for this unit.
                    </div>
                    {immobilizerStatus && <div className="sms-modal-target">{immobilizerStatus}</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
          {showRequestModal && requestAsset && (
            <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Request current position">
              <div className="assets-add-card sms-modal-card">
                <div className="assets-add-header">
                  <div className="assets-add-title">Request current position</div>
                  <div className="assets-add-actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        setShowRequestModal(false);
                        setRequestAsset(null);
                      }}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        localStorage.setItem("vivi.requestPositionAsset", requestAsset.id);
                        void saveToApi("live-tracking:request-position", {
                          assetId: requestAsset.id,
                          mode: requestMode,
                          requestedAt: new Date().toISOString()
                        });
                        const assetIndex = assetRows.findIndex((row) => row.id === requestAsset.id);
                        if (assetIndex >= 0) focusAssetOnMap(requestAsset, assetIndex);
                        setShowRequestModal(false);
                        setRequestAsset(null);
                      }}
                    >
                      Request
                    </button>
                  </div>
                </div>
                <div className="assets-add-body sms-modal-body">
                  <div className="sms-modal-content">
                    <div className="sms-modal-label">Select request mode</div>
                    <div className="sms-modal-target">{`${requestAsset.assetDescription} - ${requestAsset.registration}`}</div>
                    <label className="bindings-field">
                      Mode
                      <select
                        className="bindings-input"
                        value={requestMode}
                        onChange={(event) => setRequestMode(event.target.value as "GPRS" | "Data call")}
                      >
                        <option value="GPRS">GPRS (default)</option>
                        <option value="Data call">Data call</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
const statusLabel = assetDotStatusLabel;

const statusDot = (status: "online" | "warning" | "stale" | "offline") => (
  <span
    className={`status-dot status-${status} status-dot-tooltip`}
    data-tooltip={statusLabel(status)}
    aria-label={statusLabel(status)}
    role="img"
  />
);
